import { describe, expect, it } from 'vitest';

import { app } from '../src/index';

describe('API worker', () => {
  it('returns the health status', async () => {
    const response = await app.request(
      '/api/health',
      {},
      { APP_ENV: 'local', ALLOW_REGISTRATION: 'true' },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { status: 'ok', environment: 'local' },
      message: 'OK',
    });
  });

  it('disables self-registration when the explicit flag is false', async () => {
    const response = await app.request(
      '/api/auth/register',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      { APP_ENV: 'dev', ALLOW_REGISTRATION: 'false' },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'REGISTRATION_DISABLED' },
    });
  });

  it('exposes whether registration is available without requiring a session', async () => {
    const response = await app.request(
      '/api/auth/config',
      {},
      { APP_ENV: 'dev', ALLOW_REGISTRATION: 'false' },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { registrationAllowed: false },
    });
  });
});
