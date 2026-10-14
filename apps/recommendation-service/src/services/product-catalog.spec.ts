import { prisma } from '../prisma';
import { getListedProducts } from './product-catalog';

vi.mock('../prisma', () => ({
  prisma: {
    products: { findMany: vi.fn() },
    shops: { findMany: vi.fn() },
  },
}));

const db = vi.mocked(prisma, { deep: true });

const shopId = 'b'.repeat(24);
const record = {
  id: 'c'.repeat(24),
  title: 'Leather Bag',
  shortDescription: 'Handmade',
  price: 65,
  salePrice: null,
  category: 'Fashion',
  subCategory: 'Bags',
  images: ['https://example.com/bag.jpg', 'data:image/png;base64,AAAA'],
  tags: ['leather'],
  specs: [{ name: 'Material', value: 'Leather' }],
  options: [
    {
      name: 'Colour',
      values: [{ label: 'Brown', swatch: '#92400e', imageIndex: null }],
    },
  ],
  variants: [
    { choices: { Colour: 'Brown' }, stock: 0, price: null, sku: null },
  ],
  stock: 0,
  ratings: 4.5,
  reviewCount: 2,
  shopId,
  paymentOptions: [],
};

describe('getListedProducts', () => {
  it('maps listings to product cards with their shop names', async () => {
    db.products.findMany.mockResolvedValue([record] as never);
    db.shops.findMany.mockResolvedValue([
      { id: shopId, name: 'Leather Craft Kenya' },
    ] as never);

    await expect(getListedProducts()).resolves.toEqual([
      {
        id: record.id,
        name: 'Leather Bag',
        shortDescription: 'Handmade',
        description: 'Handmade',
        price: 65,
        category: 'Fashion',
        subCategory: 'Bags',
        imageUrl: 'https://example.com/bag.jpg',
        images: [
          'https://example.com/bag.jpg',
          `/api/products/${record.id}/images/1`,
        ],
        tags: ['leather'],
        specs: [{ name: 'Material', value: 'Leather' }],
        options: [
          { name: 'Colour', values: [{ label: 'Brown', swatch: '#92400e' }] },
        ],
        variants: [{ choices: { Colour: 'Brown' }, stock: 0 }],
        stock: 0,
        inStock: false,
        rating: 4.5,
        reviewCount: 2,
        shopId,
        shopName: 'Leather Craft Kenya',
      },
    ]);
    expect(db.shops.findMany).toHaveBeenCalledWith({
      where: { id: { in: [shopId] } },
      select: { id: true, name: true },
    });
  });

  it('still lists a product whose shop is missing', async () => {
    db.products.findMany.mockResolvedValue([record] as never);
    db.shops.findMany.mockResolvedValue([] as never);

    const [product] = await getListedProducts();

    expect(product.id).toBe(record.id);
    expect(product.shopName).toBeUndefined();
  });
});
