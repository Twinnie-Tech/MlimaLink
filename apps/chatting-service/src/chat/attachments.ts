import ImageKit, { BadRequestError } from '@imagekit/nodejs';
import type { AccountType } from '@org/utils/auth';
import { HttpError } from '../http-error';
import { log } from '../log';

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
/** About 3 MB of image once base64 is decoded. */
export const MAX_IMAGE_DATA_URL_LENGTH = 4_000_000;
/** ImageKit replaces anything else in a file name with `_`. */
const FILE_NAME = /^[A-Za-z0-9._-]{1,200}$/;
const EXTENSIONS: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

type Sender = { role: AccountType; id: string };
export type ChatImageUpload = { fileName: string; file: string };

/** Where a person's chat photos live on ImageKit. */
export const chatImageFolder = ({ role, id }: Sender) => `/chat/${role}-${id}`;

/** True for a photo in this person's chat folder on our ImageKit endpoint. */
export function isChatImageOf(url: string, sender: Sender): boolean {
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT?.replace(/\/+$/, '');
  const prefix = `${endpoint}${chatImageFolder(sender)}/`;
  if (!endpoint || !url.startsWith(prefix) || url.includes('..')) return false;
  return FILE_NAME.test(url.slice(prefix.length).split(/[?#]/)[0]);
}

/** Checks `{ fileName, file }`, where `file` is a base64 data URL, and tidies the name for ImageKit. */
export function parseImageUpload(body: unknown): ChatImageUpload | null {
  const { fileName, file } = (body ?? {}) as Record<string, unknown>;
  const type =
    typeof file === 'string' && file.length <= MAX_IMAGE_DATA_URL_LENGTH
      ? DATA_URL.exec(file)?.[1]
      : undefined;
  if (!type) return null;

  const base =
    (typeof fileName === 'string' ? fileName : '')
      .replace(/\.[^.]*$/, '')
      .replace(/[^A-Za-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'photo';
  return { fileName: `${base}.${EXTENSIONS[type]}`, file: file as string };
}

let imagekit: ImageKit | undefined;

function client(): ImageKit {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) {
    log('error', 'IMAGEKIT_PRIVATE_KEY must be set for chat photos.');
    throw new HttpError(
      503,
      'Photo uploads aren’t available right now. Please try again later.',
    );
  }
  return (imagekit ??= new ImageKit({ privateKey }));
}

const hostingError = (error: unknown) => {
  log('error', 'ImageKit chat photo upload failed.', {
    error: error instanceof Error ? error.message : String(error),
  });
  return new HttpError(502, 'We couldn’t upload that photo. Please try again.');
};

/** Uploads a photo to the sender's chat folder; its URL can then go in a message. */
export async function uploadChatImage(
  sender: Sender,
  image: ChatImageUpload,
): Promise<{ url: string; fileId: string }> {
  const imagekitClient = client();
  let uploaded;
  try {
    uploaded = await imagekitClient.files.upload({
      file: image.file,
      fileName: image.fileName,
      folder: chatImageFolder(sender),
      useUniqueFileName: true,
      tags: ['chat'],
    });
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw new HttpError(
        400,
        'That photo couldn’t be read. Try a different one.',
      );
    }
    throw hostingError(error);
  }
  if (!uploaded.fileId || !uploaded.url) {
    throw hostingError('Response had no fileId or url');
  }
  return { url: uploaded.url, fileId: uploaded.fileId };
}
