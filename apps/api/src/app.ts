import { healthResponseSchema } from '@horse-asset-manager/validation';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';

import { ApiError } from './lib/http';
import { authRoutes, setupRoutes } from './routes/auth';
import { basicRoutes } from './routes/basic';
import { cashflowRoutes } from './routes/cashflows';
import { insightRoutes } from './routes/insights';
import { statementImportRoutes } from './routes/statement-imports';
import type { AppBindings } from './types';

export const app = new Hono<AppBindings>();

app.use('*', secureHeaders());
app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    if (origin) {
      const requestUrl = new URL(c.req.url);
      const originUrl = new URL(origin);
      const localAllowed =
        c.env.APP_ENV === 'local' &&
        ['127.0.0.1', 'localhost'].includes(originUrl.hostname) &&
        ['127.0.0.1', 'localhost'].includes(requestUrl.hostname);
      if (!localAllowed && originUrl.host !== requestUrl.host) {
        throw new ApiError(403, 'INVALID_ORIGIN', 'この操作は許可されていません。');
      }
    }
  }
  await next();
});

app.get('/api/health', (c) => {
  const data = healthResponseSchema.parse({ status: 'ok', environment: c.env.APP_ENV });
  return c.json({ data, message: 'OK' });
});

app.route('/api/auth', authRoutes);
app.route('/api/setup', setupRoutes);
app.route('/api', basicRoutes);
app.route('/api', cashflowRoutes);
app.route('/api', insightRoutes);
app.route('/api', statementImportRoutes);

app.notFound((c) =>
  c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: '指定されたAPIまたはページが見つかりません。',
        details: [],
      },
    },
    404,
  ),
);

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      error.status,
    );
  }
  if (error instanceof HTTPException) return error.getResponse();
  console.error('Unhandled application error', { name: error.name, message: error.message });
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: '処理中にエラーが発生しました。', details: [] } },
    500,
  );
});
