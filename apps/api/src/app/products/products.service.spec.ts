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
    imageFileIds: [],
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
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  };
  const product_reviews = { deleteMany: vi.fn() };
  const service = new ProductsApiService({
    products,
    product_reviews,
  } as unknown as PrismaService);

  beforeEach(() => {
    Object.values(products).forEach((mock) => mock.mockReset());
    product_reviews.deleteMany.mockReset();
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

  it('filters by colour and size options, ignoring case', async () => {
    const brown = await service.getProducts({ colors: ['brown'] });
    expect(brown.items.map((product) => product.id)).toEqual([PRODUCT_ID]);

    // Sample "Running Shoes Elite" has a Size option; the loafers don't.
    const size42 = await service.getProducts({ sizes: ['42'] });
    expect(size42.items.map((product) => product.id)).toEqual(['7']);

    // Samples without colour options can still match by their Colour spec.
    const black = await service.getProducts({ colors: ['Black'] });
    expect(black.items.map((product) => product.id)).toEqual([
      PRODUCT_ID,
      '1',
      '7',
      '11',
    ]);
  });

  it('filters by sub-category, rating and sale', async () => {
    products.findMany.mockResolvedValue([
      record(),
      record({ id: 'b'.repeat(24), subCategory: 'Bags', salePrice: 30 }),
    ]);

    const shoes = await service.getProducts({
      category: 'Fashion',
      subCategory: 'Shoes',
    });
    expect(shoes.items.map((product) => product.id)).toEqual([PRODUCT_ID]);

    const onSale = await service.getProducts({ onSale: true });
    expect(onSale.items.map((product) => product.id)).toEqual([
      'b'.repeat(24),
      '2',
      '4',
      '5',
      '9',
      '11',
    ]);

    const topRated = await service.getProducts({ minRating: 4.6 });
    expect(topRated.items.map((product) => product.id)).toEqual([
      '3',
      '4',
      '7',
      '11',
    ]);
  });

  it('sorts by price, rating and discount', async () => {
    const cheapest = await service.getProducts({ sort: 'price_asc' }, 1, 3);
    expect(cheapest.items.map((product) => product.id)).toEqual([
      '4',
      '3',
      '5',
    ]);

    const dearest = await service.getProducts({ sort: 'price_desc' }, 1, 1);
    expect(dearest.items[0].id).toBe('2');

    const best = await service.getProducts({ sort: 'rating' }, 1, 1);
    expect(best.items[0].id).toBe('7');

    const deals = await service.getProducts({ sort: 'discount' }, 1, 2);
    expect(deals.items.map((product) => product.id)).toEqual(['11', '9']);
  });

  it('lists in-stock offers, biggest discount first', async () => {
    products.findMany.mockResolvedValue([
      record({ salePrice: 9 }),
      record({ id: 'b'.repeat(24), salePrice: 10, stock: 0 }),
    ]);

    const offers = await service.getOffers(3);

    expect(offers.map((product) => product.id)).toEqual([
      PRODUCT_ID,
      '11',
      '9',
    ]);
  });

  it('describes what a category can be filtered by', async () => {
    const all = await service.getFacets();
    expect(all.categories).toEqual(
      expect.arrayContaining(['Electronics', 'Fashion']),
    );
    expect(all.subCategories).toEqual([]);
    // Most common first; White's swatch comes from the shoes, not the T-shirt's spec.
    expect(all.colors.slice(0, 2)).toEqual([
      { label: 'Black', swatch: '#111111' },
      { label: 'White', swatch: '#ffffff' },
    ]);
    expect(all.sizes).toEqual(['40', '41', '42', '43', '44']);

    const fashion = await service.getFacets({ category: 'Fashion' });
    expect(fashion).toMatchObject({
      subCategories: ['Shoes'],
      colors: [
        { label: 'Black', swatch: '#111111' },
        { label: 'Brown', swatch: '#92400e' },
      ],
      sizes: [],
      minPrice: 45,
      maxPrice: 50,
    });
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

  it("deletes the shop's product and hands back its photos", async () => {
    products.findFirst.mockResolvedValue({
      images: [photo],
      imageFileIds: ['file1'],
    });
    products.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.deleteProduct(SHOP_ID, PRODUCT_ID)).resolves.toEqual({
      images: [photo],
      imageFileIds: ['file1'],
    });
    expect(products.findFirst).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID, shopId: SHOP_ID },
      select: { images: true, imageFileIds: true },
    });
    expect(products.deleteMany).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID, shopId: SHOP_ID },
    });
    expect(product_reviews.deleteMany).toHaveBeenCalledWith({
      where: { productId: PRODUCT_ID },
    });
  });

  it("only deletes the shop's own products", async () => {
    products.findFirst.mockResolvedValue(null);

    await expect(
      service.deleteProduct(SHOP_ID, PRODUCT_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(products.deleteMany).not.toHaveBeenCalled();
    await expect(service.deleteProduct(SHOP_ID, 'nope')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
