import type { PrismaService } from '../prisma.service';
import type { ProductImagesService } from '../product-images/product-images.service';
import { ServiceProfilesService } from './service-profiles.service';

const shop = { id: 'c'.repeat(24), name: 'Wanjiru Codes' };
const url = (name: string) =>
  `https://ik.imagekit.io/e4edrhdew/products/${shop.id}/${name}.jpg`;

const input = {
  headline: 'Full-stack developer',
  about: '',
  skills: ['React', 'Node.js'],
  yearsExperience: 5,
  qualifications: [{ title: 'BSc Computer Science' }],
  serviceArea: 'Nairobi',
  remote: true,
  portfolio: [url('one'), url('two')],
  portfolioFileIds: ['file1', 'file2'],
};

const stored = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  ...input,
  qualifications: [{ title: 'BSc Computer Science', issuer: null, year: 2019 }],
  shopId: shop.id,
  createdAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date('2026-09-02T10:00:00Z'),
  ...overrides,
});

describe('ServiceProfilesService', () => {
  const prisma = {
    service_profiles: { findUnique: vi.fn(), upsert: vi.fn() },
    products: { findMany: vi.fn() },
  };
  const images = {
    verifyShopPhotos: vi.fn(),
    removeProductPhotos: vi.fn(),
  };
  const service = new ServiceProfilesService(
    prisma as unknown as PrismaService,
    images as unknown as ProductImagesService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.service_profiles.upsert.mockImplementation(async ({ update }) =>
      stored(update),
    );
    prisma.products.findMany.mockResolvedValue([]);
  });

  it('verifies every photo on a new profile', async () => {
    prisma.service_profiles.findUnique.mockResolvedValue(null);

    const profile = await service.save(shop, input);

    expect(images.verifyShopPhotos).toHaveBeenCalledWith(
      shop.id,
      [url('one'), url('two')],
      ['file1', 'file2'],
    );
    expect(prisma.service_profiles.upsert.mock.calls[0][0].create).toEqual({
      ...input,
      shopId: shop.id,
    });
    expect(profile).toMatchObject({
      shopName: shop.name,
      portfolioFileIds: ['file1', 'file2'],
    });
    expect(images.removeProductPhotos).not.toHaveBeenCalled();
  });

  it('only checks new photos and deletes the removed ones', async () => {
    prisma.service_profiles.findUnique.mockResolvedValue({
      portfolio: [url('one'), url('old')],
      portfolioFileIds: ['file1', 'old'],
    });

    await service.save(shop, input);

    expect(images.verifyShopPhotos).toHaveBeenCalledWith(
      shop.id,
      [url('two')],
      ['file2'],
    );
    expect(images.removeProductPhotos).toHaveBeenCalledWith(
      shop.id,
      [],
      ['old'],
    );
  });

  it("keeps a removed photo that one of the shop's listings still shows", async () => {
    prisma.service_profiles.findUnique.mockResolvedValue({
      portfolio: [url('one'), url('two'), url('old')],
      portfolioFileIds: ['file1', 'file2', 'old'],
    });
    prisma.products.findMany.mockResolvedValue([{ imageFileIds: ['old'] }]);

    await service.save(shop, input);

    expect(images.verifyShopPhotos).not.toHaveBeenCalled();
    expect(images.removeProductPhotos).not.toHaveBeenCalled();
  });

  it("doesn't save when a photo fails the check", async () => {
    prisma.service_profiles.findUnique.mockResolvedValue(null);
    images.verifyShopPhotos.mockRejectedValue(new Error('not uploaded'));

    await expect(service.save(shop, input)).rejects.toThrow('not uploaded');
    expect(prisma.service_profiles.upsert).not.toHaveBeenCalled();
  });

  it('hides file ids from the public profile and lists the services', async () => {
    prisma.service_profiles.findUnique.mockResolvedValue({
      ...stored(),
      shop: { name: shop.name },
    });

    const provider = await service.getProvider(shop.id);

    expect(provider.profile).not.toHaveProperty('portfolioFileIds');
    expect(provider.profile.qualifications).toEqual([
      { title: 'BSc Computer Science', year: 2019 },
    ]);
    expect(prisma.products.findMany.mock.calls[0][0].where).toEqual({
      shopId: shop.id,
      category: 'Services',
    });
  });

  it('404s for a shop without a profile', async () => {
    prisma.service_profiles.findUnique.mockResolvedValue(null);
    await expect(service.getProvider(shop.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.getProvider('nope')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
