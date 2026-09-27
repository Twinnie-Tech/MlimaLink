import type { ExecutionContext } from '@nestjs/common';
import { AppError } from '@org/errors';
import { signAccessToken } from '../utils/auth-tokens';
import { IsAuthenticatedGuard } from './is-authenticated.guard';
import type { PrismaService } from './prisma.service';

const user = {
  id: 'u1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'user',
  createdAt: new Date('2026-01-01'),
};

function contextFor(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('IsAuthenticatedGuard', () => {
  const findUnique = vi.fn();
  const guard = new IsAuthenticatedGuard({
    users: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'access-secret');
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh-secret');
    findUnique.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('attaches the user for a valid access token cookie', async () => {
    findUnique.mockResolvedValue(user);
    const req: Record<string, unknown> = {
      cookies: { accessToken: signAccessToken({ userId: 'u1', role: 'user' }) },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.user).toEqual(user);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
    // The password hash must never be selected.
    expect(findUnique.mock.calls[0][0].select.password).toBeUndefined();
  });

  it('rejects requests without a token', async () => {
    await expect(
      guard.canActivate(contextFor({ cookies: {}, headers: {} })),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects tokens for deleted accounts', async () => {
    findUnique.mockResolvedValue(null);
    const req = {
      cookies: {
        accessToken: signAccessToken({ userId: 'gone', role: 'user' }),
      },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
