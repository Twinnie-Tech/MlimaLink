import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma.service';
import { DeliveriesService } from './deliveries.service';
import {
  DELIVERY_ID,
  ORDER_ID,
  RIDER_ID,
  deliveryRecord,
  orderRecord,
  rider,
  shop,
} from './test-fixtures';

const NOW = new Date('2026-09-30T10:00:00Z');

describe('DeliveriesService', () => {
  const prisma = {
    orders: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    deliveries: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    riders: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    shops: { findUnique: vi.fn(), findMany: vi.fn() },
  };
  const mail = { send: vi.fn() };
  const service = new DeliveriesService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    mail.send.mockResolvedValue(true);
    prisma.orders.findFirst.mockResolvedValue(orderRecord());
    prisma.orders.findUnique.mockResolvedValue(orderRecord());
    prisma.orders.findMany.mockResolvedValue([orderRecord()]);
    prisma.orders.updateMany.mockResolvedValue({ count: 1 });
    prisma.deliveries.findMany.mockResolvedValue([]);
    prisma.deliveries.updateMany.mockResolvedValue({ count: 1 });
    prisma.riders.findMany.mockResolvedValue([]);
    prisma.shops.findUnique.mockResolvedValue({
      deliveryZone: 'Nairobi',
      address: 'Moi Avenue, Nairobi',
      seller: { email: 'kicks@example.com' },
    });
    prisma.shops.findMany.mockResolvedValue([
      {
        id: shop.id,
        name: shop.name,
        address: 'Moi Avenue, Nairobi',
        seller: { phone_number: '+254700000000' },
      },
    ]);
  });

  describe('request', () => {
    it('offers the order to the rider the seller picked', async () => {
      prisma.deliveries.findUnique.mockResolvedValue(null);
      prisma.riders.findFirst.mockResolvedValue({
        id: RIDER_ID,
        name: 'Brian',
        email: 'brian@example.com',
      });
      prisma.deliveries.findMany.mockResolvedValue([
        deliveryRecord({ status: 'offered', offeredRiderId: RIDER_ID }),
      ]);

      await service.request(shop, ORDER_ID, RIDER_ID);

      const data = prisma.deliveries.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        status: 'offered',
        offeredRiderId: RIDER_ID,
        fee: 5,
        pickupZone: 'Nairobi',
        dropoffZone: 'Nairobi',
        orderId: ORDER_ID,
      });
      expect(data.events[0].note).toBe('Offered to Brian');
      expect(mail.send.mock.calls[0][0]).toMatchObject({
        to: 'brian@example.com',
        subject: 'Kicks KE wants you to deliver order ML-7Q2K9D',
      });
    });

    it('posts the job to riders in town and emails them', async () => {
      prisma.deliveries.findUnique.mockResolvedValue(
        deliveryRecord({ status: 'declined' }),
      );
      prisma.riders.findMany.mockResolvedValue([
        { name: 'Brian', email: 'brian@example.com' },
        { name: 'Wanjiku', email: 'wanjiku@example.com' },
      ]);

      await service.request(shop, ORDER_ID);

      expect(prisma.deliveries.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: DELIVERY_ID, status: 'declined' },
        data: { status: 'open', offeredRiderId: null },
      });
      expect(mail.send).toHaveBeenCalledTimes(2);
    });

    it('needs the order confirmed first', async () => {
      prisma.orders.findFirst.mockResolvedValue(
        orderRecord({ status: 'placed' }),
      );

      await expect(service.request(shop, ORDER_ID)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Confirm the order before asking for a rider.',
      });
    });

    it('refuses a second request while one is under way', async () => {
      prisma.deliveries.findUnique.mockResolvedValue(deliveryRecord());

      await expect(service.request(shop, ORDER_ID)).rejects.toMatchObject({
        statusCode: 409,
        code: 'DELIVERY_ACTIVE',
      });
    });

    it('needs the shop’s pickup town', async () => {
      prisma.deliveries.findUnique.mockResolvedValue(null);
      prisma.shops.findUnique.mockResolvedValue({
        deliveryZone: null,
        address: 'x',
      });

      await expect(service.request(shop, ORDER_ID)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('refuses a rider who isn’t taking jobs in town', async () => {
      prisma.deliveries.findUnique.mockResolvedValue(null);
      prisma.riders.findFirst.mockResolvedValue(null);

      await expect(
        service.request(shop, ORDER_ID, RIDER_ID),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.deliveries.create).not.toHaveBeenCalled();
    });
  });

  describe('jobs', () => {
    it('hides the shopper’s contact details until the job is taken', async () => {
      prisma.deliveries.findMany.mockResolvedValue([deliveryRecord()]);

      const [job] = await service.jobs(rider());

      expect(prisma.deliveries.findMany.mock.calls[0][0].where.OR).toEqual([
        { status: 'offered', offeredRiderId: RIDER_ID },
        { status: 'open', pickupZone: { in: ['Nairobi'] } },
      ]);
      expect(job.dropoff).toEqual({ zone: 'Nairobi', area: 'Kilimani' });
      expect(job.pickup).not.toHaveProperty('phone');
      expect(job.collectOnDelivery).toBe(50);
    });

    it('only shows offers while the rider is off duty', async () => {
      await service.jobs(rider({ available: false }));

      expect(prisma.deliveries.findMany.mock.calls[0][0].where.OR).toEqual([
        { status: 'offered', offeredRiderId: RIDER_ID },
      ]);
    });
  });

  describe('accept', () => {
    it('gives the job to the rider and tells the seller and shopper', async () => {
      prisma.deliveries.count.mockResolvedValue(0);
      prisma.deliveries.findUnique.mockResolvedValue(
        deliveryRecord({ status: 'assigned', riderId: RIDER_ID }),
      );

      const job = await service.accept(rider(), DELIVERY_ID);

      expect(prisma.deliveries.updateMany.mock.calls[0][0].where).toEqual({
        id: DELIVERY_ID,
        OR: [
          { status: 'open', pickupZone: { in: ['Nairobi'] } },
          { status: 'offered', offeredRiderId: RIDER_ID },
        ],
      });
      expect(job.dropoff).toMatchObject({
        recipientName: 'Amina',
        phone: '+254712345678',
        street: 'Argwings Kodhek Rd, Apt 4B',
      });
      expect(job.pickup.phone).toBe('+254700000000');
      expect(mail.send.mock.calls.map(([message]) => message.to)).toEqual([
        'kicks@example.com',
        'amina@example.com',
      ]);
    });

    it('tells the rider when someone else got there first', async () => {
      prisma.deliveries.count.mockResolvedValue(0);
      prisma.deliveries.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.accept(rider(), DELIVERY_ID)).rejects.toMatchObject({
        statusCode: 409,
        code: 'JOB_TAKEN',
      });
    });

    it('needs a finished profile and availability', async () => {
      await expect(
        service.accept(rider({ vehicle: null }), DELIVERY_ID),
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        service.accept(rider({ available: false }), DELIVERY_ID),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('caps how many jobs a rider carries', async () => {
      prisma.deliveries.count.mockResolvedValue(5);

      await expect(service.accept(rider(), DELIVERY_ID)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(prisma.deliveries.updateMany).not.toHaveBeenCalled();
    });
  });

  it('lets the seller know when an offer is declined', async () => {
    prisma.deliveries.findUnique.mockResolvedValue(
      deliveryRecord({ status: 'declined' }),
    );

    await service.decline(rider(), DELIVERY_ID);

    expect(prisma.deliveries.updateMany.mock.calls[0][0].where).toEqual({
      id: DELIVERY_ID,
      status: 'offered',
      offeredRiderId: RIDER_ID,
    });
    expect(mail.send.mock.calls[0][0].to).toBe('kicks@example.com');
  });

  it('marks the order out for delivery on pickup and sends the shopper their code', async () => {
    prisma.deliveries.findUnique.mockResolvedValue(
      deliveryRecord({ status: 'picked_up', riderId: RIDER_ID }),
    );

    await service.pickUp(rider(), DELIVERY_ID, { lat: -1.28, lng: 36.82 });

    const update = prisma.deliveries.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({
      id: DELIVERY_ID,
      riderId: RIDER_ID,
      status: 'assigned',
    });
    expect(update.data.lastLocation.set).toMatchObject({
      lat: -1.28,
      lng: 36.82,
    });
    expect(prisma.orders.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, status: 'confirmed' },
      data: { status: 'out_for_delivery' },
    });
    expect(mail.send.mock.calls[0][0].paragraphs.join(' ')).toContain('4821');
  });

  describe('deliver', () => {
    const carrying = (overrides: Record<string, unknown> = {}) =>
      deliveryRecord({ status: 'picked_up', riderId: RIDER_ID, ...overrides });

    it('completes the delivery with the right code', async () => {
      prisma.deliveries.findFirst.mockResolvedValue(carrying());
      prisma.deliveries.findUnique.mockResolvedValue(
        carrying({ status: 'delivered' }),
      );

      const job = await service.deliver(
        rider(),
        DELIVERY_ID,
        '4821',
        undefined,
        NOW,
      );

      expect(job.status).toBe('delivered');
      expect(prisma.orders.updateMany.mock.calls[0][0].data).toEqual({
        status: 'delivered',
      });
      expect(mail.send).toHaveBeenCalledTimes(2);
    });

    it('counts wrong codes down', async () => {
      prisma.deliveries.findFirst.mockResolvedValue(
        carrying({ codeAttempts: 2 }),
      );

      await expect(
        service.deliver(rider(), DELIVERY_ID, '0000', undefined, NOW),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'That code doesn’t match. 2 tries left.',
      });
      expect(prisma.deliveries.update).toHaveBeenCalledWith({
        where: { id: DELIVERY_ID },
        data: { codeAttempts: 3 },
      });
    });

    it('locks for a while after too many wrong codes', async () => {
      prisma.deliveries.findFirst.mockResolvedValue(
        carrying({ codeAttempts: 4 }),
      );

      await expect(
        service.deliver(rider(), DELIVERY_ID, '0000', undefined, NOW),
      ).rejects.toMatchObject({
        statusCode: 423,
        code: 'DELIVERY_CODE_LOCKED',
      });
      expect(prisma.deliveries.update.mock.calls[0][0].data).toEqual({
        codeAttempts: 0,
        codeLockedUntil: new Date('2026-09-30T10:15:00Z'),
      });
    });

    it('refuses even the right code while locked', async () => {
      prisma.deliveries.findFirst.mockResolvedValue(
        carrying({ codeLockedUntil: new Date('2026-09-30T10:05:00Z') }),
      );

      await expect(
        service.deliver(rider(), DELIVERY_ID, '4821', undefined, NOW),
      ).rejects.toMatchObject({
        statusCode: 423,
        message: expect.stringContaining('5 minutes'),
      });
      expect(prisma.deliveries.updateMany).not.toHaveBeenCalled();
    });

    it('needs the order picked up first', async () => {
      prisma.deliveries.findFirst.mockResolvedValue(
        carrying({ status: 'assigned' }),
      );

      await expect(
        service.deliver(rider(), DELIVERY_ID, '4821', undefined, NOW),
      ).rejects.toMatchObject({
        message: 'Mark the order as picked up first.',
      });
    });
  });

  it('only stores locations for deliveries the rider is carrying', async () => {
    prisma.deliveries.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.shareLocation(rider(), DELIVERY_ID, { lat: 0, lng: 0 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.deliveries.updateMany.mock.calls[0][0].where).toEqual({
      id: DELIVERY_ID,
      riderId: RIDER_ID,
      status: { in: ['assigned', 'picked_up'] },
    });
  });

  it('saves the rider profile and reports finished deliveries', async () => {
    prisma.riders.update.mockResolvedValue({
      vehicle: 'bicycle',
      zones: ['Nairobi', 'Kiambu'],
      available: true,
    });
    prisma.deliveries.groupBy.mockResolvedValue([
      { riderId: RIDER_ID, _count: { _all: 7 } },
    ]);

    const profile = await service.saveProfile(rider(), {
      vehicle: 'bicycle',
      zones: ['Nairobi', 'Kiambu'],
      available: true,
    });

    expect(profile).toMatchObject({
      vehicle: 'bicycle',
      zones: ['Nairobi', 'Kiambu'],
      completedDeliveries: 7,
      phone: '+254722000111',
    });
  });
});
