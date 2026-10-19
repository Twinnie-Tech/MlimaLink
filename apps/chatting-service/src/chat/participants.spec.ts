import { verifyAccessToken, verifySocketTicket } from '@org/utils/auth';
import { prisma } from '../prisma';
import { authenticate } from './participants';

vi.mock('@org/utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@org/utils/auth')>()),
  verifyAccessToken: vi.fn(),
  verifySocketTicket: vi.fn(),
}));
vi.mock('../prisma', () => ({
  prisma: {
    users: { findUnique: vi.fn() },
    sellers: { findUnique: vi.fn() },
    admins: { findUnique: vi.fn() },
  },
}));

const db = vi.mocked(prisma, { deep: true });
const id = 'a'.repeat(24);
const expiresAt = Date.now() + 60_000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyAccessToken).mockReturnValue({ id, expiresAt });
});

describe('authenticate', () => {
  it('reads the token from the account’s own cookie', async () => {
    db.sellers.findUnique.mockResolvedValue({
      name: 'Baraka',
      suspended: false,
    } as never);

    const participant = await authenticate('seller', {
      cookie: 'accessToken=shopper; sellerAccessToken=seller-token',
    });

    expect(verifyAccessToken).toHaveBeenCalledWith('seller-token', 'seller');
    expect(participant).toEqual({
      role: 'seller',
      id,
      name: 'Baraka',
      expiresAt,
    });
  });

  it('turns away suspended and deleted accounts', async () => {
    db.users.findUnique.mockResolvedValueOnce({
      name: 'Amina',
      suspended: true,
    } as never);
    expect(
      await authenticate('user', { authorization: 'Bearer t' }),
    ).toBeNull();

    db.admins.findUnique.mockResolvedValueOnce(null);
    expect(
      await authenticate('admin', { authorization: 'Bearer t' }),
    ).toBeNull();
  });

  it('accepts a socket ticket instead of a token', async () => {
    vi.mocked(verifySocketTicket).mockReturnValue({ id, expiresAt });
    db.users.findUnique.mockResolvedValue({
      name: 'Amina',
      suspended: false,
    } as never);

    const participant = await authenticate(
      'user',
      { cookie: 'accessToken=ignored' },
      'ticket',
    );

    expect(verifySocketTicket).toHaveBeenCalledWith('ticket', 'user');
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(participant).toEqual({ role: 'user', id, name: 'Amina', expiresAt });
  });

  it('doesn’t look anyone up for an invalid token', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue(null);

    expect(await authenticate('user', {})).toBeNull();
    expect(db.users.findUnique).not.toHaveBeenCalled();
  });
});
