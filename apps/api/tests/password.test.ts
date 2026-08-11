import { describe, expect, it } from 'vitest';

import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from '../src/lib/password';

describe('password and session security', () => {
  it('uses the Cloudflare Workers-compatible PBKDF2 limit by default', async () => {
    const hash = await hashPassword('long-enough-password');
    expect(hash).toMatch(/^pbkdf2-sha256\$v1\$100000\$/u);
    await expect(verifyPassword('long-enough-password', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('rejects PBKDF2 hashes above the Cloudflare Workers limit', async () => {
    const unsupportedHash = 'pbkdf2-sha256$v1$100001$AA$AA';
    await expect(verifyPassword('long-enough-password', unsupportedHash)).resolves.toBe(false);
  });

  it('verifies the local demo password fixture', async () => {
    const localDemoHash =
      'pbkdf2-sha256$v1$100000$wYFTILgu3qLOA8yD3MkU0g$UkpjEzbFakIsi75MA9QmIOgsACa0IB1KjtTjjgfmEDk';
    await expect(verifyPassword('local-demo-password', localDemoHash)).resolves.toBe(true);
  });

  it('creates a random session token and stores only a stable hash', async () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(43);
    await expect(hashSessionToken(first)).resolves.toBe(await hashSessionToken(first));
  });
});
