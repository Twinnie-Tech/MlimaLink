import { Injectable, Logger } from '@nestjs/common';
import ImageKit, { BadRequestError, NotFoundError } from '@imagekit/nodejs';
import { appError, notFound, validationError } from '@org/errors';
import type { UploadedImage } from '@org/models';
import { MAX_UPLOAD_DATA_URL_LENGTH } from '@org/models/catalog';

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const FILE_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** ImageKit replaces anything else in a file name with `_`. */
const FILE_NAME = /^[A-Za-z0-9._-]{1,200}$/;
const EXTENSIONS: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

export type ImageUpload = { fileName: string; file: string };

export const NOT_UPLOADED =
  'Upload photos from the product form so they’re stored with your shop.';

/** Where a shop's product photos live on ImageKit. */
export const productImageFolder = (shopId: string) => `/products/${shopId}`;

/** The file name of a photo in this shop's ImageKit folder, or undefined for any other URL. */
export function shopPhotoName(url: string, shopId: string): string | undefined {
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT?.replace(/\/+$/, '');
  const prefix = `${endpoint}${productImageFolder(shopId)}/`;
  if (!endpoint || !url.startsWith(prefix) || url.includes('..')) {
    return undefined;
  }
  const name = url.slice(prefix.length).split(/[?#]/)[0];
  return FILE_NAME.test(name) ? name : undefined;
}

/** True for a photo uploaded to this shop's ImageKit folder. */
export const isShopPhoto = (url: string, shopId: string) =>
  shopPhotoName(url, shopId) !== undefined;

/** Checks `{ fileName, file }`, where `file` is a base64 data URL, and tidies the name for ImageKit. */
export function parseImageUpload(
  body: unknown,
): ImageUpload | { error: string } {
  const { fileName, file } = (body ?? {}) as Record<string, unknown>;
  const type =
    typeof file === 'string' && file.length <= MAX_UPLOAD_DATA_URL_LENGTH
      ? DATA_URL.exec(file)?.[1]
      : undefined;
  if (!type) {
    return {
      error: 'Photos must be JPEG, PNG or WebP images under 3 MB each.',
    };
  }

  const base =
    (typeof fileName === 'string' ? fileName : '')
      .replace(/\.[^.]*$/, '')
      .replace(/[^A-Za-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'product';
  return { fileName: `${base}.${EXTENSIONS[type]}`, file: file as string };
}

@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger(ProductImagesService.name);
  private imagekit?: ImageKit;

  private client(): ImageKit {
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    if (!privateKey) {
      this.logger.error('IMAGEKIT_PRIVATE_KEY must be set in .env');
      throw appError(
        'Photo uploads aren’t available right now. Please try again later.',
        503,
        undefined,
        'IMAGE_HOSTING_UNAVAILABLE',
      );
    }
    return (this.imagekit ??= new ImageKit({ privateKey }));
  }

  private hostingError(action: string, error: unknown) {
    this.logger.error(`ImageKit ${action} failed`, error);
    return appError(
      `We couldn’t ${action} that photo. Please try again.`,
      502,
      undefined,
      'IMAGE_HOSTING_FAILED',
    );
  }

  async upload(shopId: string, image: ImageUpload): Promise<UploadedImage> {
    const client = this.client();
    let uploaded;
    try {
      uploaded = await client.files.upload({
        file: image.file,
        fileName: image.fileName,
        folder: productImageFolder(shopId),
        useUniqueFileName: true,
        tags: ['product'],
      });
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw validationError(
          'That photo couldn’t be read. Try a different one.',
        );
      }
      throw this.hostingError('upload', error);
    }
    if (!uploaded.fileId || !uploaded.url) {
      throw this.hostingError('upload', 'Response had no fileId or url');
    }
    return { fileId: uploaded.fileId, url: uploaded.url };
  }

  /** Where the file is stored on ImageKit, or undefined when there's no such file. */
  private async filePathOf(
    client: ImageKit,
    fileId: string,
    action: string,
  ): Promise<string | undefined> {
    if (!FILE_ID.test(fileId)) return undefined;
    try {
      return (await client.files.get(fileId)).filePath;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        return undefined;
      }
      throw this.hostingError(action, error);
    }
  }

  /** Deletes a photo from ImageKit if it's in this shop's folder. */
  async remove(shopId: string, fileId: string): Promise<void> {
    if (!FILE_ID.test(fileId)) {
      throw notFound('Photo');
    }
    const client = this.client();

    const filePath = await this.filePathOf(client, fileId, 'delete');
    if (!filePath?.startsWith(`${productImageFolder(shopId)}/`)) {
      throw notFound('Photo');
    }

    try {
      await client.files.delete(fileId);
    } catch (error) {
      if (error instanceof NotFoundError) return;
      throw this.hostingError('delete', error);
    }
  }

  /** Makes sure each photo is the ImageKit file with the matching id, stored in this shop's folder. */
  async verifyShopPhotos(
    shopId: string,
    images: string[],
    fileIds: string[],
  ): Promise<void> {
    const folder = productImageFolder(shopId);
    const names = images.map((url) => shopPhotoName(url, shopId));
    if (names.some((name) => !name) || names.length !== fileIds.length) {
      throw validationError(NOT_UPLOADED);
    }

    const client = this.client();
    const paths = await Promise.all(
      fileIds.map((fileId) => this.filePathOf(client, fileId, 'check')),
    );
    if (paths.some((path, index) => path !== `${folder}/${names[index]}`)) {
      throw validationError(NOT_UPLOADED);
    }
  }

  /**
   * Deletes a removed product's photos from ImageKit. Never throws: the product is
   * already gone, so a failure only leaves unused files behind, which are logged.
   * Listings saved before file ids were stored are found by name instead.
   */
  async removeProductPhotos(
    shopId: string,
    urls: string[],
    fileIds: string[] = [],
  ): Promise<void> {
    const folder = productImageFolder(shopId);
    const names = fileIds.length
      ? []
      : urls.flatMap((url) => shopPhotoName(url, shopId) ?? []);
    if (fileIds.length === 0 && names.length === 0) return;

    try {
      const client = this.client();
      const found = await Promise.all(
        names.map(async (name) => {
          const matches = await client.assets.list({
            path: `${folder}/`,
            searchQuery: `name = "${name}"`,
            limit: 10,
          });
          const file = matches.find(
            (item) =>
              'filePath' in item && item.filePath === `${folder}/${name}`,
          );
          return file && 'fileId' in file ? (file.fileId ?? []) : [];
        }),
      );
      await Promise.all(
        [...fileIds, ...found.flat()].map((fileId) =>
          client.files.delete(fileId).catch((error: unknown) => {
            if (!(error instanceof NotFoundError)) throw error;
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Couldn't delete the photos of a removed product in shop ${shopId}`,
        error,
      );
    }
  }
}
