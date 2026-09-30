import type { ExecutionContext } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { PrismaService } from './prisma.service';
import { RiderGuard } from './rider.guard';

const SECRET = 'rider-access-secret';

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
    audience: 'rider',
    issuer: 'mlimalink-auth',
    expiresIn: 60,
    ...options,
  });

describe('RiderGuard', () => {
  const findUnique = vi.fn();
  const guard = new RiderGuard({
    riders: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
    vi.stubEnv('RIDER_ACCESS_TOKEN_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('attaches the signed-in rider', async () => {
    const rider = { id: 'r1', name: 'Brian', zones: ['Nairobi'] };
    findUnique.mockResolvedValue(rider);
    const req: Record<string, unknown> = {
      cookies: { riderAccessToken: token({ userId: 'r1', role: 'rider' }) },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.rider).toBe(rider);
    expect(findUnique.mock.calls[0][0].where).toEqual({ id: 'r1' });
  });

  it('rejects a token for a deleted account', async () => {
    findUnique.mockResolvedValue(null);
    const req = {
      cookies: { riderAccessToken: token({ userId: 'r1', role: 'rider' }) },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it.each([
    ['no token', undefined],
    [
      'a shopper token',
      token({ userId: 'u1', role: 'user' }, { audience: 'user' }),
    ],
    ['a seller role', token({ userId: 's1', role: 'seller' })],
    ['another secret', token({ userId: 'r1', role: 'rider' }, {}, 'other')],
  ])('rejects %s with a 401', async (_, value) => {
    const req = { cookies: { riderAccessToken: value }, headers: {} };

    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
