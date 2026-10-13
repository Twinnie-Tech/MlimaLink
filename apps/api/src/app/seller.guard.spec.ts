import type { ExecutionContext } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { PrismaService } from './prisma.service';
import { SellerGuard } from './seller.guard';

const SECRET = 'seller-access-secret';

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
    audience: 'seller',
    issuer: 'mlimalink-auth',
    expiresIn: 60,
    ...options,
  });

describe('SellerGuard', () => {
  const findUnique = vi.fn();
  const guard = new SellerGuard({
    shops: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
    vi.stubEnv('SELLER_ACCESS_TOKEN_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("attaches the seller's shop and id", async () => {
    const shop = { id: 'shop1', name: 'Mlima Boutique' };
    findUnique.mockResolvedValue(shop);
    const req: Record<string, unknown> = {
      cookies: { sellerAccessToken: token({ userId: 's1', role: 'seller' }) },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.shop).toEqual(shop);
    expect(req.sellerId).toBe('s1');
    expect(findUnique.mock.calls[0][0].where).toEqual({ sellerId: 's1' });
  });

  it('refuses a seller an admin has suspended', async () => {
    findUnique.mockResolvedValue({
      id: 'shop1',
      name: 'Mlima Boutique',
      seller: { suspended: true },
    });
    const req: Record<string, unknown> = {
      cookies: { sellerAccessToken: token({ userId: 's1', role: 'seller' }) },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringMatching(/suspended/),
    });
    expect(req.shop).toBeUndefined();
  });

  it('asks sellers without a shop to set one up', async () => {
    findUnique.mockResolvedValue(null);
    const req = {
      cookies: { sellerAccessToken: token({ userId: 's1', role: 'seller' }) },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      statusCode: 403,
      message: 'Set up your shop before adding products.',
    });
  });

  it.each([
    ['no token', undefined],
    [
      'a shopper token',
      token({ userId: 'u1', role: 'user' }, { audience: 'user' }),
    ],
    ['a shopper role', token({ userId: 'u1', role: 'user' })],
    ['another secret', token({ userId: 's1', role: 'seller' }, {}, 'other')],
    [
      'another issuer',
      token({ userId: 's1', role: 'seller' }, { issuer: 'x' }),
    ],
  ])(
    'rejects %s with a 401 the seller UI can refresh from',
    async (_, value) => {
      const req = { cookies: { sellerAccessToken: value }, headers: {} };

      await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(findUnique).not.toHaveBeenCalled();
    },
  );
});
