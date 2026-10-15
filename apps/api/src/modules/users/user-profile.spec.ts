import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateUserProfileDto } from './user-profile.dto';
import { UserProfileService } from './user-profile.service';

const check = (value: unknown) =>
  validate(plainToInstance(UpdateUserProfileDto, { displayName: value }));

describe('UpdateUserProfileDto', () => {
  it('accepts a trimmed name and null', async () => {
    expect(await check('  Nguyen Van A ')).toHaveLength(0);
    expect(await check(null)).toHaveLength(0);
  });
  it('rejects blank, too long, control characters and non-strings', async () => {
    for (const v of ['   ', 'a'.repeat(101), 'bad\u0000name', 5, undefined])
      expect((await check(v)).length).toBeGreaterThan(0);
  });
});

describe('UserProfileService', () => {
  const row = {
    id: 'u',
    email: 'a@b.test',
    displayName: 'X',
    status: 'ACTIVE',
    createdAt: new Date(0),
  };
  it('writes display_name only, for ACTIVE accounts only', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = { user: { updateMany, findUnique: jest.fn().mockResolvedValue(row) } };
    await new UserProfileService(prisma as never, {} as never).updateDisplayName('u', 'X');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'u', status: 'ACTIVE' },
      data: { displayName: 'X' },
    });
  });
  it('rejects disabled accounts', async () => {
    const prisma = { user: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    await expect(
      new UserProfileService(prisma as never, {} as never).updateDisplayName('u', 'X'),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });
  it('response has no password hash', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(row) } };
    const r = await new UserProfileService(prisma as never, {} as never).get('u');
    expect(Object.keys(r).sort()).toEqual(['createdAt', 'displayName', 'email', 'id', 'status']);
  });
});
