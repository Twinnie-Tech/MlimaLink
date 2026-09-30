import {
  ProductImagesService,
  isShopPhoto,
  parseImageUpload,
  shopPhotoName,
} from './product-images.service';

const imagekit = vi.hoisted(() => {
  class BadRequestError extends Error {}
  class NotFoundError extends Error {}
  const files = { upload: vi.fn(), get: vi.fn(), delete: vi.fn() };
  const assets = { list: vi.fn() };
  const ImageKit = vi.fn(function (this: {
    files: typeof files;
    assets: typeof assets;
  }) {
    this.files = files;
    this.assets = assets;
  });
  return { files, assets, ImageKit, BadRequestError, NotFoundError };
});

vi.mock('@imagekit/nodejs', () => ({
  default: imagekit.ImageKit,
  BadRequestError: imagekit.BadRequestError,
  NotFoundError: imagekit.NotFoundError,
}));

const SHOP_ID = '66f000000000000000000001';
const photo = 'data:image/png;base64,iVBORw0KGgo=';

describe('parseImageUpload', () => {
  it('keeps the base64 photo and tidies the file name for ImageKit', () => {
    expect(
      parseImageUpload({ fileName: 'My shoes (1).PNG', file: photo }),
    ).toEqual({ fileName: 'My-shoes-1.png', file: photo });
    expect(
      parseImageUpload({ file: 'data:image/jpeg;base64,/9j/4AAQ' }),
    ).toEqual({
      fileName: 'product.jpg',
      file: 'data:image/jpeg;base64,/9j/4AAQ',
    });
  });

  it.each([
    {},
    { file: 'https://example.com/shoe.png' },
    { file: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { file: `data:image/png;base64,${'A'.repeat(4_000_000)}` },
  ])('turns away anything but a JPEG, PNG or WebP under 3 MB (%#)', (body) => {
    expect(parseImageUpload(body)).toEqual({
      error: 'Photos must be JPEG, PNG or WebP images under 3 MB each.',
    });
  });

  it('takes detailed photos of up to about 3 MB', () => {
    const big = `data:image/jpeg;base64,${'A'.repeat(3_000_000)}`;
    expect(parseImageUpload({ fileName: 'big.jpg', file: big })).toEqual({
      fileName: 'big.jpg',
      file: big,
    });
  });
});

describe('isShopPhoto', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('accepts only URLs in the shop’s folder on our ImageKit endpoint', () => {
    vi.stubEnv('IMAGEKIT_URL_ENDPOINT', 'https://ik.imagekit.io/mlima');
    const folder = `https://ik.imagekit.io/mlima/products/${SHOP_ID}`;

    expect(isShopPhoto(`${folder}/shoe_a1.jpg`, SHOP_ID)).toBe(true);
    expect(isShopPhoto(`${folder}/shoe_a1.jpg`, 'other-shop')).toBe(false);
    expect(isShopPhoto(`${folder}/../x/shoe.jpg`, SHOP_ID)).toBe(false);
    expect(isShopPhoto('https://evil.example/shoe.jpg', SHOP_ID)).toBe(false);

    vi.stubEnv('IMAGEKIT_URL_ENDPOINT', '');
    expect(isShopPhoto(`${folder}/shoe_a1.jpg`, SHOP_ID)).toBe(false);
  });

  it('reads the file name back out of the URL', () => {
    vi.stubEnv('IMAGEKIT_URL_ENDPOINT', 'https://ik.imagekit.io/mlima');
    const folder = `https://ik.imagekit.io/mlima/products/${SHOP_ID}`;

    expect(shopPhotoName(`${folder}/shoe_a1.jpg?tr=w-300`, SHOP_ID)).toBe(
      'shoe_a1.jpg',
    );
    expect(shopPhotoName(`${folder}/sub/shoe.jpg`, SHOP_ID)).toBeUndefined();
    expect(shopPhotoName(`${folder}/sh"oe.jpg`, SHOP_ID)).toBeUndefined();
  });
});

describe('ProductImagesService', () => {
  const { files, assets } = imagekit;
  let service: ProductImagesService;

  beforeEach(() => {
    Object.values(files).forEach((mock) => mock.mockReset());
    assets.list.mockReset();
    files.delete.mockResolvedValue(undefined);
    vi.stubEnv('IMAGEKIT_PRIVATE_KEY', 'private_test');
    service = new ProductImagesService();
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uploads the photo into the shop’s folder', async () => {
    files.upload.mockResolvedValue({
      fileId: 'file1',
      url: `https://ik.imagekit.io/mlima/products/${SHOP_ID}/shoe_a1.png`,
      name: 'shoe_a1.png',
    });

    await expect(
      service.upload(SHOP_ID, { fileName: 'shoe.png', file: photo }),
    ).resolves.toEqual({
      fileId: 'file1',
      url: `https://ik.imagekit.io/mlima/products/${SHOP_ID}/shoe_a1.png`,
    });
    expect(imagekit.ImageKit).toHaveBeenCalledWith({
      privateKey: 'private_test',
    });
    expect(files.upload).toHaveBeenCalledWith({
      file: photo,
      fileName: 'shoe.png',
      folder: `/products/${SHOP_ID}`,
      useUniqueFileName: true,
      tags: ['product'],
    });
  });

  it('says uploads are unavailable when ImageKit isn’t configured', async () => {
    vi.stubEnv('IMAGEKIT_PRIVATE_KEY', '');

    await expect(
      service.upload(SHOP_ID, { fileName: 'shoe.png', file: photo }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(files.upload).not.toHaveBeenCalled();
  });

  it('explains upload failures without leaking ImageKit errors', async () => {
    files.upload.mockRejectedValueOnce(new imagekit.BadRequestError('bad'));
    await expect(
      service.upload(SHOP_ID, { fileName: 'shoe.png', file: photo }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'That photo couldn’t be read. Try a different one.',
    });

    files.upload.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(
      service.upload(SHOP_ID, { fileName: 'shoe.png', file: photo }),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: 'We couldn’t upload that photo. Please try again.',
    });
  });

  it('deletes a photo from the shop’s folder', async () => {
    files.get.mockResolvedValue({
      filePath: `/products/${SHOP_ID}/shoe_a1.png`,
    });

    await service.remove(SHOP_ID, 'file1');

    expect(files.get).toHaveBeenCalledWith('file1');
    expect(files.delete).toHaveBeenCalledWith('file1');
  });

  it('won’t delete another shop’s photo or a file that doesn’t exist', async () => {
    files.get.mockResolvedValueOnce({ filePath: '/products/shop2/shoe.png' });
    await expect(service.remove(SHOP_ID, 'file2')).rejects.toMatchObject({
      statusCode: 404,
    });

    files.get.mockRejectedValueOnce(new imagekit.NotFoundError('gone'));
    await expect(service.remove(SHOP_ID, 'file3')).rejects.toMatchObject({
      statusCode: 404,
    });

    await expect(service.remove(SHOP_ID, '../file4')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(files.delete).not.toHaveBeenCalled();
  });

  describe('removeProductPhotos', () => {
    const folder = `/products/${SHOP_ID}`;
    const url = (name: string) =>
      `https://ik.imagekit.io/mlima${folder}/${name}`;

    beforeEach(() => {
      vi.stubEnv('IMAGEKIT_URL_ENDPOINT', 'https://ik.imagekit.io/mlima');
    });

    it('finds each of the shop’s photos on ImageKit and deletes it', async () => {
      assets.list.mockImplementation(
        async ({ searchQuery }: { searchQuery: string }) => {
          const name = /"(.+)"/.exec(searchQuery)?.[1];
          return [
            {
              type: 'file',
              fileId: `id-${name}`,
              filePath: `${folder}/${name}`,
            },
            { type: 'file', fileId: 'other', filePath: `/elsewhere/${name}` },
          ];
        },
      );

      await service.removeProductPhotos(SHOP_ID, [
        url('shoe_a1.jpg'),
        url('shoe_b2.jpg'),
        'https://cdn.example.com/not-ours.jpg',
        'data:image/png;base64,iVBORw0KGgo=',
      ]);

      expect(assets.list).toHaveBeenCalledWith({
        path: `${folder}/`,
        searchQuery: 'name = "shoe_a1.jpg"',
        limit: 10,
      });
      expect(files.delete.mock.calls).toEqual([
        ['id-shoe_a1.jpg'],
        ['id-shoe_b2.jpg'],
      ]);
    });

    it('logs instead of failing when ImageKit can’t be reached', async () => {
      assets.list.mockRejectedValue(new Error('socket hang up'));

      await expect(
        service.removeProductPhotos(SHOP_ID, [url('shoe_a1.jpg')]),
      ).resolves.toBeUndefined();

      vi.stubEnv('IMAGEKIT_PRIVATE_KEY', '');
      await expect(
        service.removeProductPhotos(SHOP_ID, [url('shoe_a1.jpg')]),
      ).resolves.toBeUndefined();
      expect(files.delete).not.toHaveBeenCalled();
    });

    it('does nothing for products without ImageKit photos', async () => {
      await service.removeProductPhotos(SHOP_ID, [
        'data:image/png;base64,iVBORw0KGgo=',
      ]);

      expect(assets.list).not.toHaveBeenCalled();
    });

    it('deletes by the stored file ids, skipping any already gone', async () => {
      files.delete
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new imagekit.NotFoundError('gone'));
      const logged = vi.spyOn(service['logger'], 'error');

      await service.removeProductPhotos(
        SHOP_ID,
        [url('shoe_a1.jpg'), url('shoe_b2.jpg')],
        ['file1', 'file2'],
      );

      expect(assets.list).not.toHaveBeenCalled();
      expect(files.delete.mock.calls).toEqual([['file1'], ['file2']]);
      expect(logged).not.toHaveBeenCalled();
    });
  });

  describe('verifyShopPhotos', () => {
    const folder = `/products/${SHOP_ID}`;
    const url = (name: string) =>
      `https://ik.imagekit.io/mlima${folder}/${name}`;
    const NOT_UPLOADED =
      'Upload photos from the product form so they’re stored with your shop.';

    beforeEach(() => {
      vi.stubEnv('IMAGEKIT_URL_ENDPOINT', 'https://ik.imagekit.io/mlima');
      files.get.mockImplementation(async (fileId: string) => ({
        filePath: `${folder}/${fileId}.jpg`,
      }));
    });

    it('accepts photos that are the shop’s ImageKit files', async () => {
      await expect(
        service.verifyShopPhotos(
          SHOP_ID,
          [url('a.jpg'), url('b.jpg')],
          ['a', 'b'],
        ),
      ).resolves.toBeUndefined();
      expect(files.get.mock.calls).toEqual([['a'], ['b']]);
    });

    it.each([
      ['a file id that points at another photo', [url('a.jpg')], ['b']],
      [
        'another shop’s photo',
        ['https://ik.imagekit.io/mlima/products/shop2/a.jpg'],
        ['a'],
      ],
      ['a photo hosted elsewhere', ['https://cdn.example.com/a.jpg'], ['a']],
    ])('turns away %s', async (_case, images, fileIds) => {
      await expect(
        service.verifyShopPhotos(SHOP_ID, images, fileIds),
      ).rejects.toMatchObject({ statusCode: 400, message: NOT_UPLOADED });
    });

    it('turns away photos ImageKit doesn’t have', async () => {
      files.get.mockRejectedValue(new imagekit.NotFoundError('gone'));

      await expect(
        service.verifyShopPhotos(SHOP_ID, [url('a.jpg')], ['a']),
      ).rejects.toMatchObject({ statusCode: 400, message: NOT_UPLOADED });
    });

    it('asks the seller to retry when ImageKit can’t be reached', async () => {
      files.get.mockRejectedValue(new Error('socket hang up'));

      await expect(
        service.verifyShopPhotos(SHOP_ID, [url('a.jpg')], ['a']),
      ).rejects.toMatchObject({ statusCode: 502 });
    });
  });
});
