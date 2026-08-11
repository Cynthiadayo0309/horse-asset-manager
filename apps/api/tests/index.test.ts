import { describe, expect, it } from 'vitest';

import { app } from '../src/index';

describe('API worker', () => {
  it('returns the health status', async () => {
    const response = await app.request('/api/health', {}, { APP_ENV: 'local' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { status: 'ok', environment: 'local' },
      message: 'OK',
    });
  });

  it('disables self-registration outside local and dev', async () => {
    const response = await app.request(
      '/api/auth/register',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      { APP_ENV: 'production' },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'REGISTRATION_DISABLED' },
    });
  });
});
