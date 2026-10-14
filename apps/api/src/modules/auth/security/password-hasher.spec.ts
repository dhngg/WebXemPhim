import { PasswordHasher } from './password-hasher';

const baseline = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher(baseline);

  it('creates salted Argon2id hashes and verifies without exposing the password', async () => {
    const password = 'correct horse battery staple';
    const first = await hasher.hash(password);
    const second = await hasher.hash(password);
    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toContain(password);
    expect(second).not.toBe(first);
    await expect(hasher.verify(first, password)).resolves.toBe(true);
    await expect(hasher.verify(first, 'wrong password value')).resolves.toBe(false);
  });

  it('enforces the approved 12-128 character policy without composition rules', async () => {
    await expect(hasher.hash('short')).rejects.toThrow('12 and 128');
    await expect(hasher.hash('x'.repeat(129))).rejects.toThrow('12 and 128');
    await expect(hasher.hash('a plain phrase')).resolves.toMatch(/^\$argon2id\$/);
  });

  it('handles malformed stored hashes safely and detects weaker parameters', async () => {
    await expect(hasher.verify('not-an-argon-hash', 'a plain phrase')).resolves.toBe(false);
    expect(hasher.needsRehash('not-an-argon-hash')).toBe(true);
    const hash = await hasher.hash('a plain phrase');
    expect(hasher.needsRehash(hash)).toBe(false);
    expect(new PasswordHasher({ ...baseline, timeCost: 3 }).needsRehash(hash)).toBe(true);
  });
});
