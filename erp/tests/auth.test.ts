import { describe, it, expect, beforeAll } from 'vitest';

// Must set env before importing auth (jose reads JWT_SECRET at call time)
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-vitest-32-chars!!';
});

// Lazy imports so env is set first
const getAuth = async () => await import('../src/lib/auth');

describe('hashPassword', () => {
  it('produces a bcrypt hash starting with $2', async () => {
    const { hashPassword } = await getAuth();
    const hash = await hashPassword('hunter2');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });
});

describe('comparePassword', () => {
  it('returns true for matching password', async () => {
    const { hashPassword, comparePassword } = await getAuth();
    const hash = await hashPassword('correct');
    expect(await comparePassword('correct', hash)).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const { hashPassword, comparePassword } = await getAuth();
    const hash = await hashPassword('correct');
    expect(await comparePassword('wrong', hash)).toBe(false);
  });
});

describe('signJWT / verifyJWT', () => {
  it('round-trips a payload', async () => {
    const { signJWT, verifyJWT } = await getAuth();
    const token = await signJWT({ sub: 1, username: 'admin', role: 'SUPER_ADMIN' });
    expect(typeof token).toBe('string');
    const payload = await verifyJWT(token);
    expect(payload?.username).toBe('admin');
    expect(payload?.role).toBe('SUPER_ADMIN');
    expect(payload?.sub).toBe(1);
  });

  it('returns null for a tampered token', async () => {
    const { signJWT, verifyJWT } = await getAuth();
    const token = await signJWT({ sub: 1, username: 'x', role: 'ADMIN' });
    const result = await verifyJWT(token + 'garbage');
    expect(result).toBeNull();
  });

  it('returns null for a random string', async () => {
    const { verifyJWT } = await getAuth();
    expect(await verifyJWT('not.a.jwt')).toBeNull();
  });
});
