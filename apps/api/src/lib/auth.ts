import { sessions, users, createDatabase } from '@horse-asset-manager/database';
import { nowIso } from '@horse-asset-manager/shared';
import { and, eq, gt } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import type { AppBindings, AuthUser } from '../types';
import { ApiError } from './http';
import { createSessionToken, hashSessionToken } from './password';

export const SESSION_COOKIE = 'ham_session';
const SESSION_DAYS = 14;

export const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'ログインしてください。');
  const tokenHash = await hashSessionToken(token);
  const db = createDatabase(c.env.DB);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      setupCompleted: users.setupCompleted,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, nowIso()), eq(users.status, 'active')),
    )
    .limit(1);
  const user = rows[0];
  if (!user) {
    clearSessionCookie(c);
    throw new ApiError(401, 'UNAUTHENTICATED', 'セッションの有効期限が切れました。');
  }
  c.set('user', user satisfies AuthUser);
  await next();
};

export async function startSession(c: Context<AppBindings>, userId: number): Promise<void> {
  const token = createSessionToken();
  const tokenHash = await hashSessionToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  const db = createDatabase(c.env.DB);
  await db.insert(sessions).values({
    id: tokenHash,
    userId,
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: c.env.APP_ENV !== 'local',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(c: Context<AppBindings>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = createDatabase(c.env.DB);
    await db.delete(sessions).where(eq(sessions.id, await hashSessionToken(token)));
  }
  clearSessionCookie(c);
}

function clearSessionCookie(c: Context<AppBindings>): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: c.env.APP_ENV !== 'local' });
}
