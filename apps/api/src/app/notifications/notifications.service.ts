import { Injectable, Logger } from '@nestjs/common';
import { notFound } from '@org/errors';
import type {
  Notification,
  NotificationList,
  NotificationQuery,
  NotificationStatus,
} from '@org/models';
import { PrismaService } from '../prisma.service';
import { isObjectId } from '../products/product-mapper';

export type NewNotification = {
  receiverId: string;
  creatorId?: string;
  title: string;
  message: string;
  /** A path in the receiver's own app, e.g. "/dashboard/orders". */
  redirectLink?: string;
};

type NotificationRecord = {
  id: string;
  creatorId: string | null;
  receiverId: string;
  redirect_link: string | null;
  title: string;
  message: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export const toNotification = (record: NotificationRecord): Notification => ({
  id: record.id,
  creatorId: record.creatorId,
  receiverId: record.receiverId,
  title: record.title,
  message: record.message,
  redirectLink: record.redirect_link,
  status: record.status === 'read' ? 'read' : 'unread',
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

const UNREAD: NotificationStatus = 'unread';
const READ: NotificationStatus = 'read';

/**
 * Stores notifications for shoppers, sellers and admins and reads them back for their
 * receiver. Sending is best effort, like emails: the action that caused a notification has
 * already happened, so failures are only logged.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(notifications: NewNotification[]): Promise<void> {
    if (notifications.length === 0) return;
    try {
      await this.prisma.notifications.createMany({
        data: notifications.map(({ redirectLink, ...rest }) => ({
          ...rest,
          ...(redirectLink && { redirect_link: redirectLink }),
        })),
      });
    } catch (error) {
      this.logger.error(
        `Couldn't save "${notifications[0].title}" for ${notifications.length} receiver(s)`,
        error,
      );
    }
  }

  /** Tells the seller who owns the shop. */
  async notifyShop(
    shopId: string,
    notification: Omit<NewNotification, 'receiverId'>,
  ): Promise<void> {
    try {
      const shop = await this.prisma.shops.findUnique({
        where: { id: shopId },
        select: { sellerId: true },
      });
      if (shop)
        await this.notify([{ ...notification, receiverId: shop.sellerId }]);
    } catch (error) {
      this.logger.error(`Couldn't find the seller of shop ${shopId}`, error);
    }
  }

  /** Every admin gets their own copy, so each one reads it separately. */
  async notifyAdmins(
    notification: Omit<NewNotification, 'receiverId'>,
  ): Promise<void> {
    try {
      const admins = await this.prisma.admins.findMany({
        select: { id: true },
      });
      await this.notify(
        admins.map((admin) => ({ ...notification, receiverId: admin.id })),
      );
    } catch (error) {
      this.logger.error(`Couldn't list admins to notify`, error);
    }
  }

  async list(
    receiverId: string,
    query: NotificationQuery,
  ): Promise<NotificationList> {
    const [records, unread] = await Promise.all([
      this.prisma.notifications.findMany({
        where: {
          receiverId,
          ...(query.status && { status: query.status }),
          ...(query.before && { createdAt: { lt: query.before } }),
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      }),
      this.unreadCount(receiverId),
    ]);
    return { items: records.map(toNotification), unread };
  }

  unreadCount(receiverId: string): Promise<number> {
    return this.prisma.notifications.count({
      where: { receiverId, status: UNREAD },
    });
  }

  async markRead(receiverId: string, id: string): Promise<Notification> {
    const record = isObjectId(id)
      ? await this.prisma.notifications.findFirst({ where: { id, receiverId } })
      : null;
    if (!record) throw notFound('Notification', { id });
    if (record.status === READ) return toNotification(record);
    const updated = await this.prisma.notifications.update({
      where: { id },
      data: { status: READ },
    });
    return toNotification(updated);
  }

  async markAllRead(receiverId: string): Promise<number> {
    const { count } = await this.prisma.notifications.updateMany({
      where: { receiverId, status: UNREAD },
      data: { status: READ },
    });
    return count;
  }
}
