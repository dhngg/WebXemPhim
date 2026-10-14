import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginRequestDto, RegisterRequestDto } from './auth-request.dto';

describe('Auth request DTOs', () => {
  it('normalizes register email and display name', async () => {
    const dto = plainToInstance(RegisterRequestDto, {
      email: '  USER@Example.COM ',
      password: 'a secure phrase',
      displayName: '  Nguyen Van A  ',
    });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto).toMatchObject({ email: 'user@example.com', displayName: 'Nguyen Van A' });
  });

  it.each([
    { email: 'invalid', password: 'a secure phrase' },
    { email: 'user@example.com', password: 'too-short' },
    { email: 'user@example.com', password: 'a secure phrase', displayName: '   ' },
    { email: 'user@example.com', password: 'a secure phrase', displayName: null },
  ])('rejects invalid register payload %j', async (payload) => {
    const errors = await validate(plainToInstance(RegisterRequestDto, payload));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates and normalizes login credentials', async () => {
    const dto = plainToInstance(LoginRequestDto, {
      email: ' LOGIN@Example.COM ',
      password: 'a secure phrase',
    });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.email).toBe('login@example.com');
  });
});
