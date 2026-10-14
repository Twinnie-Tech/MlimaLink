import { prisma } from '../prisma';
import { getAllUserActivity, getUserActivity } from './fetch-user-activity';

vi.mock('../prisma', () => ({
  prisma: {
    user_analytics: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

const db = vi.mocked(prisma, { deep: true });

const userId = 'a'.repeat(24);
const otherId = 'f'.repeat(24);
const stored = {
  action: 'product_view',
  productId: 'c'.repeat(24),
  shopId: 'b'.repeat(24),
  at: new Date('2026-10-13T17:00:00.000Z'),
};

describe('getUserActivity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the shopper’s actions with their id', async () => {
    db.user_analytics.findUnique.mockResolvedValue({
      userId,
      actions: [stored],
    } as never);

    await expect(getUserActivity(userId)).resolves.toEqual([
      { userId, ...stored },
    ]);
    expect(db.user_analytics.findUnique).toHaveBeenCalledWith({
      where: { userId },
      select: { userId: true, actions: true },
    });
  });

  it('is empty for a shopper with no analytics yet', async () => {
    db.user_analytics.findUnique.mockResolvedValue(null);

    await expect(getUserActivity(userId)).resolves.toEqual([]);
  });

  it('doesn’t query for an id that isn’t an object id', async () => {
    await expect(getUserActivity('42')).resolves.toEqual([]);
    expect(db.user_analytics.findUnique).not.toHaveBeenCalled();
  });
});

describe('getAllUserActivity', () => {
  it('returns every shopper’s actions in one list', async () => {
    db.user_analytics.findMany.mockResolvedValue([
      { userId, actions: [stored] },
      { userId: otherId, actions: [stored] },
    ] as never);

    await expect(getAllUserActivity()).resolves.toEqual([
      { userId, ...stored },
      { userId: otherId, ...stored },
    ]);
  });
});
