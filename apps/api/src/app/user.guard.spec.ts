import type { ExecutionContext } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { PrismaService } from './prisma.service';
import { UserGuard } from './user.guard';

const SECRET = 'user-access-secret';

function contextFor(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const token = (
  payload: Record<string, unknown>,
  options: jwt.SignOptions = {},
  secret = SECRET,
) =>
  jwt.sign(payload, secret, {
    audience: 'user',
    issuer: 'mlimalink-auth',
    expiresIn: 60,
    ...options,
  });

describe('UserGuard', () => {
  const findUnique = vi.fn();
  const guard = new UserGuard({
    users: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
    vi.stubEnv('ACCESS_TOKEN_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('attaches the signed-in shopper', async () => {
    const user = { id: 'u1', name: 'Amina', email: 'amina@example.com' };
    findUnique.mockResolvedValue(user);
    const req: Record<string, unknown> = {
      cookies: { accessToken: token({ userId: 'u1', role: 'user' }) },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.user).toEqual(user);
    expect(findUnique.mock.calls[0][0].where).toEqual({ id: 'u1' });
  });

  it('refuses a shopper an admin has suspended', async () => {
    findUnique.mockResolvedValue({
      id: 'u1',
      name: 'Amina',
      email: 'amina@example.com',
      suspended: true,
    });
    const req: Record<string, unknown> = {
      cookies: { accessToken: token({ userId: 'u1', role: 'user' }) },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringMatching(/suspended/),
    });
    expect(req.user).toBeUndefined();
  });

  it('accepts a bearer token', async () => {
    findUnique.mockResolvedValue({ id: 'u1', name: 'A', email: 'a@b.co' });
    const req = {
      cookies: {},
      headers: {
        authorization: `Bearer ${token({ userId: 'u1', role: 'user' })}`,
      },
    };

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
  });

  it('rejects a token for a deleted account', async () => {
    findUnique.mockResolvedValue(null);
    const req = {
      cookies: { accessToken: token({ userId: 'u1', role: 'user' }) },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      statusCode: 401,
      message: 'Please log in to continue.',
    });
  });

  it.each([
    ['no token', undefined],
    [
      'a seller token',
      token({ userId: 's1', role: 'seller' }, { audience: 'seller' }),
    ],
    ['a seller role', token({ userId: 's1', role: 'seller' })],
    ['another secret', token({ userId: 'u1', role: 'user' }, {}, 'other')],
    ['another issuer', token({ userId: 'u1', role: 'user' }, { issuer: 'x' })],
  ])('rejects %s with a 401 the shop can refresh from', async (_, value) => {
    const req = { cookies: { accessToken: value }, headers: {} };

    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
