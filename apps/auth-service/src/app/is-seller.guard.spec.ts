import type { ExecutionContext } from '@nestjs/common';
import { AppError } from '@org/errors';
import { signAccessToken } from '../utils/auth-tokens';
import { IsSellerGuard } from './is-seller.guard';
import type { PrismaService } from './prisma.service';

function contextFor(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('IsSellerGuard', () => {
  const findUnique = vi.fn();
  const guard = new IsSellerGuard({
    sellers: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'access-secret');
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('attaches the seller for a valid seller token', async () => {
    const seller = { id: 's1', name: 'Amina', shop: null };
    findUnique.mockResolvedValue(seller);
    const req: Record<string, unknown> = {
      cookies: {
        sellerAccessToken: signAccessToken({ userId: 's1', role: 'seller' }),
      },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.seller).toBe(seller);
    expect(findUnique.mock.calls[0][0].select.password).toBeUndefined();
  });

  it("rejects a shopper's token even in the seller cookie", async () => {
    const req = {
      cookies: {
        sellerAccessToken: signAccessToken({ userId: 'u1', role: 'user' }),
      },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(
      AppError,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('ignores the shopper access cookie', async () => {
    const req = {
      cookies: {
        accessToken: signAccessToken({ userId: 's1', role: 'seller' }),
      },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
