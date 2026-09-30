import type { PrismaService } from '../prisma.service';
import type { ProductRecord } from './product-mapper';
import { ProductsApiService } from './products.service';

const SHOP_ID = '66f000000000000000000001';
const PRODUCT_ID = '66f0000000000000000000aa';
const photo = `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`;

function record(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: PRODUCT_ID,
    title: 'Leather loafers',
    shortDescription: 'Hand-stitched loafers',
    description: 'Soft full-grain leather loafers made in Nairobi.',
    category: 'Fashion',
    subCategory: 'Shoes',
    tags: ['leather'],
    price: 45,
    salePrice: null,
    images: [photo, 'https://cdn.example.com/brown.jpg'],
    specs: [{ name: 'Brand', value: 'Mlima' }],
    options: [
      {
        name: 'Colour',
        values: [
          { label: 'Black', swatch: '#111111', imageIndex: null },
          { label: 'Brown', swatch: '#92400e', imageIndex: 1 },
        ],
      },
    ],
    variants: [
      { sku: null, choices: { Colour: 'Black' }, price: null, stock: 0 },
      { sku: 'BRN', choices: { Colour: 'Brown' }, price: 50, stock: 3 },
    ],
    stock: 3,
    paymentOptions: [],
    ratings: 0,
    reviewCount: 0,
    shopId: SHOP_ID,
    shop: {
      name: 'Mlima Boutique',
      seller: { phone_number: '+254712345678', email: 'amina@example.com' },
    },
    createdAt: new Date('2026-09-30T08:00:00Z'),
    updatedAt: new Date('2026-09-30T08:00:00Z'),
    ...overrides,
  };
}

describe('ProductsApiService', () => {
  const products = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  };
  const service = new ProductsApiService({
    products,
  } as unknown as PrismaService);

  beforeEach(() => {
    Object.values(products).forEach((mock) => mock.mockReset());
    products.findMany.mockResolvedValue([record()]);
  });

  it('lists seller products first, then the samples', async () => {
    const result = await service.getProducts(undefined, 1, 5);

    expect(result.total).toBe(13);
    expect(result.totalPages).toBe(3);
    expect(result.items[0]).toMatchObject({
      id: PRODUCT_ID,
      name: 'Leather loafers',
      shopName: 'Mlima Boutique',
      inStock: true,
      imageUrl: `/api/products/${PRODUCT_ID}/images/0`,
      images: [
        `/api/products/${PRODUCT_ID}/images/0`,
        'https://cdn.example.com/brown.jpg',
      ],
    });
    expect(result.items[0].salePrice).toBeUndefined();
    expect(result.items[0].options?.[0].values[0]).toEqual({
      label: 'Black',
      swatch: '#111111',
    });
    expect(result.items[0].variants?.[0]).toEqual({
      choices: { Colour: 'Black' },
      stock: 0,
    });
    expect(result.items[1].id).toBe('1');
  });

  it('searches seller products by brand and filters by price range', async () => {
    const byBrand = await service.getProducts({ searchTerm: 'mlima' });
    expect(byBrand.items.map((product) => product.id)).toEqual([PRODUCT_ID]);

    const tooCheap = await service.getProducts({ maxPrice: 40 });
    expect(tooCheap.items.some((product) => product.id === PRODUCT_ID)).toBe(
      false,
    );
    const withinRange = await service.getProducts({ minPrice: 48 });
    expect(withinRange.items[0].id).toBe(PRODUCT_ID);
  });

  it('asks the database for one category only', async () => {
    await service.getProducts({ category: 'Fashion' });
    expect(products.findMany.mock.calls[0][0].where).toEqual({
      category: 'Fashion',
    });
  });

  it('still shows the samples when the database is unreachable', async () => {
    products.findMany.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await service.getProducts();

    expect(result.total).toBe(12);
    expect(await service.getCategories()).toContain('Electronics');
  });

  it('looks up stored products by id and samples by their short ids', async () => {
    products.findUnique.mockResolvedValue(record());

    expect((await service.getProductById(PRODUCT_ID))?.name).toBe(
      'Leather loafers',
    );
    expect((await service.getProductById('7'))?.options?.[1].name).toBe('Size');
    expect(products.findUnique).toHaveBeenCalledTimes(1);
  });

  it("shares the seller's phone and email on house and car listings only", async () => {
    products.findUnique.mockResolvedValue(
      record({
        category: 'Property',
        subCategory: 'Houses for rent',
        options: [],
        variants: [],
      }),
    );
    expect((await service.getProductById(PRODUCT_ID))?.contact).toEqual({
      phone: '+254712345678',
      email: 'amina@example.com',
    });

    products.findUnique.mockResolvedValue(record());
    expect((await service.getProductById(PRODUCT_ID))?.contact).toBeUndefined();
  });

  it('passes on how shoppers can pay, leaving older listings to the default', async () => {
    products.findUnique.mockResolvedValue(
      record({ paymentOptions: ['deposit', 'cash_on_delivery'] }),
    );
    expect((await service.getProductById(PRODUCT_ID))?.paymentOptions).toEqual([
      'deposit',
      'cash_on_delivery',
    ]);

    products.findUnique.mockResolvedValue(record());
    expect(
      (await service.getProductById(PRODUCT_ID))?.paymentOptions,
    ).toBeUndefined();
  });

  it('serves uploaded photos as bytes', async () => {
    products.findUnique.mockResolvedValue({ images: [photo] });

    const image = await service.getProductImage(PRODUCT_ID, 0);

    expect(image?.contentType).toBe('image/png');
    expect(image?.body.toString()).toBe('png-bytes');
    expect(await service.getProductImage(PRODUCT_ID, 3)).toBeUndefined();
    expect(await service.getProductImage('7', 0)).toBeUndefined();
  });

  it("only deletes the shop's own products", async () => {
    products.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.deleteProduct(SHOP_ID, PRODUCT_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(products.deleteMany).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID, shopId: SHOP_ID },
    });
    await expect(service.deleteProduct(SHOP_ID, 'nope')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
