import type { MailService } from '../mail/mail.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma.service';
import { OrdersService } from './orders.service';
import {
  ORDER_ID,
  RIDER_ID,
  SHOP_ID,
  USER_ID,
  deliveryRecord,
  orderRecord,
  rider,
  shop,
  shopper,
} from './test-fixtures';

describe('OrdersService', () => {
  const prisma = {
    orders: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    deliveries: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    riders: { findMany: vi.fn(), findUnique: vi.fn() },
    shops: { findUnique: vi.fn(), update: vi.fn() },
    products: { findUnique: vi.fn(), updateMany: vi.fn() },
  };
  const mail = { send: vi.fn() };
  const notifications = {
    notify: vi.fn(),
    notifyShop: vi.fn(),
    notifyAdmins: vi.fn(),
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
    notifications as unknown as NotificationsService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    mail.send.mockResolvedValue(true);
    prisma.deliveries.findMany.mockResolvedValue([]);
    prisma.riders.findMany.mockResolvedValue([]);
    prisma.orders.updateMany.mockResolvedValue({ count: 1 });
    prisma.products.findUnique.mockResolvedValue({
      stock: 1,
      options: [{ name: 'Size' }],
      variants: [{ sku: null, choices: { Size: '42' }, price: null, stock: 1 }],
      updatedAt: new Date(),
    });
    prisma.products.updateMany.mockResolvedValue({ count: 1 });
    prisma.shops.findUnique.mockResolvedValue({
      seller: { email: 'kicks@example.com' },
    });
  });

  describe('listing', () => {
    it('shows shoppers their delivery code and rider', async () => {
      prisma.orders.findMany.mockResolvedValue([orderRecord()]);
      prisma.deliveries.findMany.mockResolvedValue([
        deliveryRecord({
          status: 'picked_up',
          riderId: RIDER_ID,
          lastLocation: {
            lat: -1.29,
            lng: 36.78,
            at: new Date('2026-09-30T09:30:00Z'),
          },
        }),
      ]);
      prisma.riders.findMany.mockResolvedValue([rider()]);

      const [order] = await service.listForUser(shopper.id);

      expect(order.deliveryCode).toBe('4821');
      expect(order.delivery).toMatchObject({
        status: 'picked_up',
        rider: { name: 'Brian', phone: '+254722000111', vehicle: 'motorbike' },
        lastLocation: { lat: -1.29, lng: 36.78 },
      });
    });

    it('hides the delivery code from sellers but shows who was offered the job', async () => {
      prisma.orders.findMany.mockResolvedValue([orderRecord()]);
      prisma.deliveries.findMany.mockResolvedValue([
        deliveryRecord({ status: 'offered', offeredRiderId: RIDER_ID }),
      ]);
      prisma.riders.findMany.mockResolvedValue([rider()]);

      const [order] = await service.listForShop(shop);

      expect(order).not.toHaveProperty('deliveryCode');
      expect(order.delivery?.offeredTo?.name).toBe('Brian');
    });
  });

  describe('cancelForUser', () => {
    it('cancels a new order, restocks it and tells the shop', async () => {
      prisma.orders.findFirst.mockResolvedValue(
        orderRecord({ status: 'placed' }),
      );
      prisma.orders.findUnique.mockResolvedValue(
        orderRecord({ status: 'cancelled' }),
      );

      const order = await service.cancelForUser(shopper, ORDER_ID);

      expect(order.status).toBe('cancelled');
      expect(prisma.orders.updateMany).toHaveBeenCalledWith({
        where: { id: ORDER_ID, status: 'placed' },
        data: { status: 'cancelled' },
      });
      expect(
        prisma.products.updateMany.mock.calls[0][0].data.variants.set[0].stock,
      ).toBe(3);
      expect(mail.send.mock.calls[0][0].to).toBe('kicks@example.com');
      expect(notifications.notifyShop).toHaveBeenCalledWith(SHOP_ID, {
        creatorId: USER_ID,
        title: 'Order ML-7Q2K9D was cancelled by the shopper',
        message:
          'Amina cancelled it before you confirmed it. The items are back in stock.',
        redirectLink: '/dashboard/orders',
      });
      expect(notifications.notifyAdmins.mock.calls[0][0].title).toBe(
        'Order ML-7Q2K9D cancelled',
      );
    });

    it('refuses once the shop has confirmed', async () => {
      prisma.orders.findFirst.mockResolvedValue(orderRecord());

      await expect(
        service.cancelForUser(shopper, ORDER_ID),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.orders.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('updateForShop', () => {
    it('confirms a new order and emails and notifies the shopper', async () => {
      prisma.orders.findFirst.mockResolvedValue(
        orderRecord({ status: 'placed' }),
      );
      prisma.orders.findUnique.mockResolvedValue(orderRecord());

      const order = await service.updateForShop(
        shop,
        ORDER_ID,
        'confirmed',
        undefined,
        'seller1',
      );

      expect(order.status).toBe('confirmed');
      expect(mail.send.mock.calls[0][0]).toMatchObject({
        to: 'amina@example.com',
        subject: 'Kicks KE confirmed order ML-7Q2K9D',
      });
      expect(notifications.notify).toHaveBeenCalledWith([
        {
          receiverId: USER_ID,
          creatorId: 'seller1',
          title: 'Kicks KE confirmed order ML-7Q2K9D',
          message:
            'They’re getting it ready. We’ll let you know when a rider is on the way.',
          redirectLink: '/dashboard/orders',
        },
      ]);
      expect(notifications.notifyAdmins).not.toHaveBeenCalled();
    });

    it('withdraws a waiting delivery and tells the rider when cancelling', async () => {
      prisma.orders.findFirst.mockResolvedValue(orderRecord());
      prisma.orders.findUnique.mockResolvedValue(
        orderRecord({ status: 'cancelled' }),
      );
      prisma.deliveries.findUnique.mockResolvedValue(
        deliveryRecord({ status: 'assigned', riderId: RIDER_ID }),
      );
      prisma.deliveries.updateMany.mockResolvedValue({ count: 1 });
      prisma.riders.findUnique.mockResolvedValue({
        name: 'Brian',
        email: 'brian@example.com',
      });

      await service.updateForShop(shop, ORDER_ID, 'cancelled', 'Sold out');

      expect(prisma.deliveries.updateMany.mock.calls[0][0].data.status).toBe(
        'cancelled',
      );
      expect(mail.send.mock.calls.map(([message]) => message.to)).toEqual([
        'amina@example.com',
        'brian@example.com',
      ]);
      expect(mail.send.mock.calls[0][0].paragraphs).toContain(
        'Their message: Sold out',
      );
      expect(notifications.notify.mock.calls[0][0][0].message).toBe(
        'They can’t fulfil it, so it has been cancelled. Their message: Sold out',
      );
      expect(notifications.notifyAdmins.mock.calls[0][0].message).toBe(
        'Kicks KE cancelled Amina’s order. Their message: Sold out',
      );
    });

    it('refuses to cancel once the rider has the order', async () => {
      prisma.orders.findFirst.mockResolvedValue(orderRecord());
      prisma.deliveries.findUnique.mockResolvedValue(
        deliveryRecord({ status: 'picked_up', riderId: RIDER_ID }),
      );

      await expect(
        service.updateForShop(shop, ORDER_ID, 'cancelled'),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.orders.updateMany).not.toHaveBeenCalled();
    });

    it('refuses moves the seller can’t make', async () => {
      prisma.orders.findFirst.mockResolvedValue(
        orderRecord({ status: 'delivered' }),
      );

      await expect(
        service.updateForShop(shop, ORDER_ID, 'cancelled'),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('delivery settings and riders', () => {
    it('falls back to the default fee', async () => {
      prisma.shops.findUnique.mockResolvedValue({
        deliveryZone: null,
        deliveryFee: null,
      });

      await expect(service.deliverySettings(shop)).resolves.toEqual({ fee: 3 });
    });

    it('needs a pickup town before listing riders', async () => {
      prisma.shops.findUnique.mockResolvedValue({
        deliveryZone: null,
        deliveryFee: 4,
      });

      await expect(service.availableRiders(shop)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('lists riders in the pickup town, most experienced first', async () => {
      prisma.shops.findUnique.mockResolvedValue({
        deliveryZone: 'Nairobi',
        deliveryFee: 4,
      });
      prisma.riders.findMany.mockResolvedValue([
        rider({ id: 'new', name: 'New rider' }),
        rider(),
      ]);
      prisma.deliveries.groupBy.mockResolvedValue([
        { riderId: RIDER_ID, _count: { _all: 12 } },
      ]);

      const riders = await service.availableRiders(shop);

      expect(prisma.riders.findMany.mock.calls[0][0].where).toEqual({
        available: true,
        zones: { has: 'Nairobi' },
        vehicle: { not: null },
      });
      expect(riders.map((entry) => entry.completedDeliveries)).toEqual([12, 0]);
    });
  });
});
