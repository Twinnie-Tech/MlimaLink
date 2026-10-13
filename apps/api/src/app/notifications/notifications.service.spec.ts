import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma.service';
import { NotificationsService } from './notifications.service';

const RECEIVER = '1'.repeat(24);
const NOTIFICATION_ID = '2'.repeat(24);
const CREATED = new Date('2026-10-13T09:00:00Z');

const record = (overrides: Record<string, unknown> = {}) => ({
  id: NOTIFICATION_ID,
  creatorId: '3'.repeat(24),
  receiverId: RECEIVER,
  redirect_link: '/dashboard/orders',
  title: 'New order ML-7Q2K9D',
  message: 'Amina ordered 2 items for $105.00.',
  status: 'unread',
  createdAt: CREATED,
  updatedAt: CREATED,
  ...overrides,
});

describe('NotificationsService', () => {
  const prisma = {
    notifications: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    shops: { findUnique: vi.fn() },
    admins: { findMany: vi.fn() },
  };
  const service = new NotificationsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('stores notifications with the link under redirect_link', async () => {
    await service.notify([
      {
        receiverId: RECEIVER,
        creatorId: 'u1',
        title: 'Hi',
        message: 'There',
        redirectLink: '/dashboard/orders',
      },
    ]);

    expect(prisma.notifications.createMany).toHaveBeenCalledWith({
      data: [
        {
          receiverId: RECEIVER,
          creatorId: 'u1',
          title: 'Hi',
          message: 'There',
          redirect_link: '/dashboard/orders',
        },
      ],
    });
  });

  it("doesn't fail the action that caused a notification when saving fails", async () => {
    prisma.notifications.createMany.mockRejectedValue(new Error('down'));

    await expect(
      service.notify([{ receiverId: RECEIVER, title: 'Hi', message: 'There' }]),
    ).resolves.toBeUndefined();
  });

  it('sends shop notifications to the seller who owns the shop', async () => {
    prisma.shops.findUnique.mockResolvedValue({ sellerId: 'seller1' });

    await service.notifyShop('shop1', { title: 'New order', message: 'Hi' });

    expect(prisma.shops.findUnique.mock.calls[0][0].where).toEqual({
      id: 'shop1',
    });
    expect(prisma.notifications.createMany.mock.calls[0][0].data).toEqual([
      { receiverId: 'seller1', title: 'New order', message: 'Hi' },
    ]);
  });

  it('gives every admin their own copy', async () => {
    prisma.admins.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);

    await service.notifyAdmins({ title: 'New order', message: 'Hi' });

    expect(
      prisma.notifications.createMany.mock.calls[0][0].data.map(
        (n: { receiverId: string }) => n.receiverId,
      ),
    ).toEqual(['a1', 'a2']);
  });

  it('lists the receiver’s notifications newest first with the unread count', async () => {
    prisma.notifications.findMany.mockResolvedValue([record()]);
    prisma.notifications.count.mockResolvedValue(3);
    const before = new Date('2026-10-14T00:00:00Z');

    const list = await service.list(RECEIVER, {
      status: 'unread',
      limit: 20,
      before,
    });

    expect(prisma.notifications.findMany).toHaveBeenCalledWith({
      where: {
        receiverId: RECEIVER,
        status: 'unread',
        createdAt: { lt: before },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    expect(prisma.notifications.count).toHaveBeenCalledWith({
      where: { receiverId: RECEIVER, status: 'unread' },
    });
    expect(list).toEqual({
      unread: 3,
      items: [
        {
          id: NOTIFICATION_ID,
          creatorId: '3'.repeat(24),
          receiverId: RECEIVER,
          title: 'New order ML-7Q2K9D',
          message: 'Amina ordered 2 items for $105.00.',
          redirectLink: '/dashboard/orders',
          status: 'unread',
          createdAt: CREATED.toISOString(),
          updatedAt: CREATED.toISOString(),
        },
      ],
    });
  });

  describe('markRead', () => {
    it('marks the receiver’s own notification as read', async () => {
      prisma.notifications.findFirst.mockResolvedValue(record());
      prisma.notifications.update.mockResolvedValue(record({ status: 'read' }));

      const notification = await service.markRead(RECEIVER, NOTIFICATION_ID);

      expect(prisma.notifications.findFirst).toHaveBeenCalledWith({
        where: { id: NOTIFICATION_ID, receiverId: RECEIVER },
      });
      expect(prisma.notifications.update).toHaveBeenCalledWith({
        where: { id: NOTIFICATION_ID },
        data: { status: 'read' },
      });
      expect(notification.status).toBe('read');
    });

    it('leaves one already read alone', async () => {
      prisma.notifications.findFirst.mockResolvedValue(
        record({ status: 'read' }),
      );

      await service.markRead(RECEIVER, NOTIFICATION_ID);

      expect(prisma.notifications.update).not.toHaveBeenCalled();
    });

    it('answers 404 for someone else’s notification or a bad id', async () => {
      prisma.notifications.findFirst.mockResolvedValue(null);

      await expect(
        service.markRead(RECEIVER, NOTIFICATION_ID),
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.markRead(RECEIVER, 'nope')).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(prisma.notifications.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  it('marks all of the receiver’s unread notifications as read', async () => {
    prisma.notifications.updateMany.mockResolvedValue({ count: 4 });

    await expect(service.markAllRead(RECEIVER)).resolves.toBe(4);
    expect(prisma.notifications.updateMany).toHaveBeenCalledWith({
      where: { receiverId: RECEIVER, status: 'unread' },
      data: { status: 'read' },
    });
  });
});
