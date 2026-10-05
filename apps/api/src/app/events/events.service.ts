import { Injectable } from '@nestjs/common';
import type { Order } from '@org/models';
import {
  sendUserEvent,
  sendUserEvents,
  type UserEventInput,
} from '@org/utils/events';
import { PrismaService } from '../prisma.service';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Publishes what a shopper did to the user_events topic without waiting for Kafka.
   * The shop is looked up rather than trusted from the client; returns false, sending
   * nothing, when the shop or product isn't in the database (e.g. sample listings).
   */
  async track(userId: string, input: UserEventInput): Promise<boolean> {
    const timestamp = new Date().toISOString();

    if (input.action === 'shop_visit') {
      const shop = await this.prisma.shops.findUnique({
        where: { id: input.shopId },
        select: { id: true },
      });
      if (!shop) return false;
      void sendUserEvent({
        userId,
        action: input.action,
        shopId: shop.id,
        timestamp,
      });
      return true;
    }

    const product = await this.prisma.products.findUnique({
      where: { id: input.productId },
      select: { id: true, shopId: true },
    });
    if (!product) return false;
    void sendUserEvent({
      userId,
      action: input.action,
      productId: product.id,
      shopId: product.shopId,
      timestamp,
    });
    return true;
  }

  /** Publishes a purchase for every line of the shopper's new orders, without waiting for Kafka. */
  trackPurchases(userId: string, orders: Order[]): void {
    const timestamp = new Date().toISOString();
    void sendUserEvents(
      orders.flatMap((order) =>
        order.items.map((item) => ({
          userId,
          action: 'purchase' as const,
          productId: item.productId,
          shopId: order.shopId,
          timestamp,
        })),
      ),
    );
  }
}
