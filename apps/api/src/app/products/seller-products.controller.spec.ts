import type { SellerRequest } from '../seller.guard';
import type { ProductsApiService } from './products.service';
import { SellerProductsController } from './seller-products.controller';

const req = {
  shop: { id: 'shop1', name: 'Mlima Boutique' },
} as SellerRequest;

const body = {
  title: 'Leather loafers',
  shortDescription: 'Hand-stitched loafers',
  description: 'Soft full-grain leather loafers made in Nairobi.',
  category: 'Fashion',
  subCategory: 'Shoes',
  price: 45,
  images: ['https://cdn.example.com/black.jpg'],
  options: [{ name: 'Size', values: [{ label: '41' }, { label: '42' }] }],
  variants: [
    { choices: { Size: '41' }, stock: 2 },
    { choices: { Size: '42' }, stock: 1 },
  ],
};

describe('SellerProductsController', () => {
  const service = {
    createProduct: vi.fn(),
    listShopProducts: vi.fn(),
    deleteProduct: vi.fn(),
  };
  const controller = new SellerProductsController(
    service as unknown as ProductsApiService,
  );

  beforeEach(() => {
    Object.values(service).forEach((mock) => mock.mockReset());
  });

  it('saves a checked product to the seller’s shop', async () => {
    service.createProduct.mockImplementation(async (_shopId, input) => ({
      id: 'p1',
      name: input.title,
    }));

    const result = await controller.create(req, body);

    expect(result.message).toBe(
      'Leather loafers is now listed in Mlima Boutique.',
    );
    const [shopId, input] = service.createProduct.mock.calls[0];
    expect(shopId).toBe('shop1');
    expect(input).toMatchObject({ stock: 3, tags: [], specs: [] });
  });

  it('explains what to fix instead of saving', async () => {
    await expect(
      controller.create(req, { ...body, variants: body.variants.slice(1) }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Set stock for every combination of your options.',
    });
    expect(service.createProduct).not.toHaveBeenCalled();
  });

  it("lists and removes only the seller's own products", async () => {
    service.listShopProducts.mockResolvedValue([{ id: 'p1' }]);

    expect((await controller.list(req)).data).toEqual([{ id: 'p1' }]);
    await controller.remove(req, 'p1');

    expect(service.listShopProducts).toHaveBeenCalledWith('shop1');
    expect(service.deleteProduct).toHaveBeenCalledWith('shop1', 'p1');
  });
});
