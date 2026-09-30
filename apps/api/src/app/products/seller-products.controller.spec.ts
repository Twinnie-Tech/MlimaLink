import { validationError } from '@org/errors';
import type { ProductImagesService } from '../product-images/product-images.service';
import type { SellerRequest } from '../seller.guard';
import type { ProductsApiService } from './products.service';
import { SellerProductsController } from './seller-products.controller';

const req = {
  shop: { id: 'shop1', name: 'Mlima Boutique' },
} as SellerRequest;

const PHOTO = 'https://ik.imagekit.io/mlima/products/shop1/black_x1.jpg';
const NOT_UPLOADED =
  'Upload photos from the product form so they’re stored with your shop.';

const body = {
  title: 'Leather loafers',
  shortDescription: 'Hand-stitched loafers',
  description: 'Soft full-grain leather loafers made in Nairobi.',
  category: 'Fashion',
  subCategory: 'Shoes',
  price: 45,
  images: [PHOTO],
  imageFileIds: ['file1'],
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
  const productImages = {
    verifyShopPhotos: vi.fn(),
    removeProductPhotos: vi.fn(),
  };
  const controller = new SellerProductsController(
    service as unknown as ProductsApiService,
    productImages as unknown as ProductImagesService,
  );

  beforeEach(() => {
    [...Object.values(service), ...Object.values(productImages)].forEach(
      (mock) => mock.mockReset(),
    );
  });

  it('saves a checked product and its ImageKit photos to the seller’s shop', async () => {
    service.createProduct.mockImplementation(async (_shopId, input) => ({
      id: 'p1',
      name: input.title,
    }));

    const result = await controller.create(req, body);

    expect(result.message).toBe(
      'Leather loafers is now listed in Mlima Boutique.',
    );
    expect(productImages.verifyShopPhotos).toHaveBeenCalledWith(
      'shop1',
      [PHOTO],
      ['file1'],
    );
    const [shopId, input] = service.createProduct.mock.calls[0];
    expect(shopId).toBe('shop1');
    expect(input).toMatchObject({
      stock: 3,
      tags: [],
      specs: [],
      imageFileIds: ['file1'],
    });
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

  it('turns away photo links that weren’t uploaded through the form', async () => {
    await expect(
      controller.create(req, { ...body, imageFileIds: undefined }),
    ).rejects.toMatchObject({ statusCode: 400, message: NOT_UPLOADED });
    expect(productImages.verifyShopPhotos).not.toHaveBeenCalled();

    productImages.verifyShopPhotos.mockRejectedValue(
      validationError(NOT_UPLOADED),
    );
    await expect(controller.create(req, body)).rejects.toMatchObject({
      statusCode: 400,
      message: NOT_UPLOADED,
    });
    expect(service.createProduct).not.toHaveBeenCalled();
  });

  it("lists and removes only the seller's own products, photos included", async () => {
    service.listShopProducts.mockResolvedValue([{ id: 'p1' }]);
    service.deleteProduct.mockResolvedValue({
      images: [PHOTO],
      imageFileIds: ['file1'],
    });

    expect((await controller.list(req)).data).toEqual([{ id: 'p1' }]);
    await controller.remove(req, 'p1');

    expect(service.listShopProducts).toHaveBeenCalledWith('shop1');
    expect(service.deleteProduct).toHaveBeenCalledWith('shop1', 'p1');
    expect(productImages.removeProductPhotos).toHaveBeenCalledWith(
      'shop1',
      [PHOTO],
      ['file1'],
    );
  });

  it('keeps photos when the product isn’t found', async () => {
    service.deleteProduct.mockRejectedValue({ statusCode: 404 });

    await expect(controller.remove(req, 'p9')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(productImages.removeProductPhotos).not.toHaveBeenCalled();
  });
});
