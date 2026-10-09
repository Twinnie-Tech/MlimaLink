import type { ExecutionContext } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { AdminGuard } from './admin.guard';
import type { PrismaService } from './prisma.service';

const SECRET = 'admin-access-secret';

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
    audience: 'admin',
    issuer: 'mlimalink-auth',
    expiresIn: 60,
    ...options,
  });

describe('AdminGuard', () => {
  const findUnique = vi.fn();
  const guard = new AdminGuard({
    admins: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
    vi.stubEnv('ADMIN_ACCESS_TOKEN_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('attaches the signed-in admin', async () => {
    const admin = { id: 'a1', name: 'Wanjiku', email: 'admin@mlimalink.com' };
    findUnique.mockResolvedValue(admin);
    const req: Record<string, unknown> = {
      cookies: { adminAccessToken: token({ userId: 'a1', role: 'admin' }) },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.admin).toBe(admin);
    expect(findUnique.mock.calls[0][0].where).toEqual({ id: 'a1' });
  });

  it('rejects a token for a removed admin', async () => {
    findUnique.mockResolvedValue(null);
    const req = {
      cookies: { adminAccessToken: token({ userId: 'a1', role: 'admin' }) },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it.each([
    ['no token', undefined],
    [
      'a seller token',
      token({ userId: 's1', role: 'seller' }, { audience: 'seller' }),
    ],
    ['a seller role', token({ userId: 's1', role: 'seller' })],
    ['another secret', token({ userId: 'a1', role: 'admin' }, {}, 'other')],
    ['another issuer', token({ userId: 'a1', role: 'admin' }, { issuer: 'x' })],
  ])('rejects %s with a 401 admin-ui can refresh from', async (_, value) => {
    const req = { cookies: { adminAccessToken: value }, headers: {} };

    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
