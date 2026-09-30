import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma.service';
import { ServiceRequestsService } from './service-requests.service';

const PRODUCT_ID = 'a'.repeat(24);
const REQUEST_ID = 'b'.repeat(24);
const shop = { id: 'c'.repeat(24), name: 'Wanjiru Codes' };
const user = { id: 'd'.repeat(24), name: 'Amina', email: 'amina@example.com' };

const listing = (overrides: Record<string, unknown> = {}) => ({
  id: PRODUCT_ID,
  title: 'Web app development',
  category: 'Services',
  subCategory: 'Software & IT',
  stock: 1,
  shopId: shop.id,
  shop: { name: shop.name, seller: { email: 'seller@example.com' } },
  ...overrides,
});

const stored = (overrides: Record<string, unknown> = {}) => ({
  id: REQUEST_ID,
  productId: PRODUCT_ID,
  serviceTitle: 'Web app development',
  shopId: shop.id,
  userId: user.id,
  clientName: user.name,
  clientEmail: user.email,
  clientPhone: null,
  details: 'I need an online booking app for my salon.',
  budget: 800,
  neededBy: null,
  status: 'pending',
  sellerNote: null,
  createdAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date('2026-09-01T10:00:00Z'),
  ...overrides,
});

describe('ServiceRequestsService', () => {
  const prisma = {
    products: { findUnique: vi.fn() },
    shops: { findMany: vi.fn() },
    service_requests: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const mail = { send: vi.fn() };
  const service = new ServiceRequestsService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
  );
  const input = {
    productId: PRODUCT_ID,
    details: 'I need an online booking app for my salon.',
    budget: 800,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mail.send.mockResolvedValue(true);
    prisma.service_requests.findFirst.mockResolvedValue(null);
    prisma.service_requests.create.mockImplementation(async ({ data }) =>
      stored({ ...data, clientPhone: data.clientPhone ?? null }),
    );
  });

  describe('create', () => {
    it('saves the request, copies the title and emails the provider', async () => {
      prisma.products.findUnique.mockResolvedValue(listing());

      const request = await service.create(user, input);

      expect(
        prisma.service_requests.create.mock.calls[0][0].data,
      ).toMatchObject({
        productId: PRODUCT_ID,
        serviceTitle: 'Web app development',
        shopId: shop.id,
        userId: user.id,
        clientName: 'Amina',
        clientEmail: 'amina@example.com',
        budget: 800,
      });
      expect(request).toMatchObject({
        shopName: shop.name,
        status: 'pending',
        budget: 800,
      });
      expect(request).not.toHaveProperty('clientPhone');
      const email = mail.send.mock.calls[0][0];
      expect(email.to).toBe('seller@example.com');
      expect(email.subject).toBe('New request: Web app development');
      expect(email.paragraphs.join('\n')).toContain('Budget: $800.00');
      expect(email.link.url).toMatch(/\/dashboard\/service-requests$/);
    });

    it('404s for an unknown listing', async () => {
      prisma.products.findUnique.mockResolvedValue(null);
      await expect(service.create(user, input)).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(
        service.create(user, { ...input, productId: 'nope' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('only takes requests for services', async () => {
      prisma.products.findUnique.mockResolvedValue(
        listing({ category: 'Electronics', subCategory: 'Phones & Tablets' }),
      );
      await expect(service.create(user, input)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(prisma.service_requests.create).not.toHaveBeenCalled();
    });

    it('refuses when the provider has paused requests', async () => {
      prisma.products.findUnique.mockResolvedValue(listing({ stock: 0 }));
      await expect(service.create(user, input)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('isn’t taking new requests'),
      });
    });

    it('refuses a second open request for the same service', async () => {
      prisma.products.findUnique.mockResolvedValue(listing());
      prisma.service_requests.findFirst.mockResolvedValue({ id: REQUEST_ID });
      await expect(service.create(user, input)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  it("lists a shopper's requests with each provider's name", async () => {
    prisma.service_requests.findMany.mockResolvedValue([
      stored(),
      stored({ id: 'e'.repeat(24), shopId: 'f'.repeat(24) }),
    ]);
    prisma.shops.findMany.mockResolvedValue([shop]);

    const requests = await service.listForUser(user.id);

    expect(prisma.service_requests.findMany.mock.calls[0][0].where).toEqual({
      userId: user.id,
    });
    expect(requests.map((request) => request.shopName)).toEqual([
      shop.name,
      'A provider',
    ]);
  });

  describe('update', () => {
    it('accepts a new request and emails the shopper', async () => {
      prisma.service_requests.findFirst.mockResolvedValue(stored());
      prisma.service_requests.updateMany.mockResolvedValue({ count: 1 });
      prisma.service_requests.findUnique.mockResolvedValue(
        stored({ status: 'accepted', sellerNote: 'Happy to help!' }),
      );

      const request = await service.update(
        shop,
        REQUEST_ID,
        'accepted',
        'Happy to help!',
      );

      expect(prisma.service_requests.updateMany.mock.calls[0][0]).toEqual({
        where: { id: REQUEST_ID, shopId: shop.id, status: 'pending' },
        data: { status: 'accepted', sellerNote: 'Happy to help!' },
      });
      expect(request).toMatchObject({
        status: 'accepted',
        sellerNote: 'Happy to help!',
      });
      const email = mail.send.mock.calls[0][0];
      expect(email.to).toBe('amina@example.com');
      expect(email.subject).toBe(
        'Wanjiru Codes accepted your request: Web app development',
      );
      expect(email.paragraphs).toContain('Their message: Happy to help!');
    });

    it('rejects moves the status rules don’t allow', async () => {
      prisma.service_requests.findFirst.mockResolvedValue(stored());
      await expect(
        service.update(shop, REQUEST_ID, 'completed'),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'This request is new, so it can’t be marked completed.',
      });
      expect(prisma.service_requests.updateMany).not.toHaveBeenCalled();
    });

    it("404s for another shop's request", async () => {
      prisma.service_requests.findFirst.mockResolvedValue(null);
      await expect(
        service.update(shop, REQUEST_ID, 'accepted'),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(prisma.service_requests.findFirst.mock.calls[0][0].where).toEqual({
        id: REQUEST_ID,
        shopId: shop.id,
      });
    });

    it('409s when the request moved on in the meantime', async () => {
      prisma.service_requests.findFirst.mockResolvedValue(stored());
      prisma.service_requests.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.update(shop, REQUEST_ID, 'declined'),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(mail.send).not.toHaveBeenCalled();
    });
  });
});
