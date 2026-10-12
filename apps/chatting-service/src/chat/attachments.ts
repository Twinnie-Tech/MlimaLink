import ImageKit, { BadRequestError, toFile } from '@imagekit/nodejs';
import type { AccountType } from '@org/utils/auth';
import { HttpError } from '../http-error';
import { log } from '../log';
import { DOCUMENT_TYPES, MAX_FILE_BYTES } from './protocol';

/** ImageKit replaces anything else in a file name with `_`. */
const FILE_NAME = /^[A-Za-z0-9._-]{1,200}$/;
const MAX_DISPLAY_NAME = 120;

export const TOO_LARGE_MESSAGE =
  'That file is over the 10 MB limit. Please compress it to under 10 MB and try again.';
export const UNSUPPORTED_MESSAGE =
  'That file can’t be shared. Send photos (JPEG, PNG, WebP or GIF) or documents (PDF, Word, Excel, PowerPoint, text or CSV).';

type Sender = { role: AccountType; id: string };

/** A file that passed the checks, ready for ImageKit. */
export interface ChatFileUpload {
  kind: 'photo' | 'document';
  /** Safe for ImageKit, e.g. "Invoice-March.pdf". */
  storedName: string;
  /** As the sender named it, for people to read. */
  name: string;
  mimeType: string;
  data: Buffer;
}

/** Where a person's chat photos and documents live on ImageKit. */
export const chatFolder = ({ role, id }: Sender) => `/chat/${role}-${id}`;

/** True for a file in this person's chat folder on our ImageKit endpoint. */
export function isChatFileOf(url: string, sender: Sender): boolean {
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT?.replace(/\/+$/, '');
  const prefix = `${endpoint}${chatFolder(sender)}/`;
  if (!endpoint || !url.startsWith(prefix) || url.includes('..')) return false;
  return FILE_NAME.test(url.slice(prefix.length).split(/[?#]/)[0]);
}

const startsWith = (data: Buffer, bytes: number[], offset = 0) =>
  bytes.every((byte, index) => data[offset + index] === byte);

/** Photos are recognised by their first bytes, whatever they're called. */
function photoType(data: Buffer): { extension: string; mime: string } | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { extension: 'png', mime: 'image/png' };
  }
  if (
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { extension: 'webp', mime: 'image/webp' };
  }
  if (/^GIF8[79]a$/.test(data.subarray(0, 6).toString('latin1'))) {
    return { extension: 'gif', mime: 'image/gif' };
  }
  return null;
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Whether a document's contents match its extension, so a renamed program isn't shared. */
function looksLike(extension: string, data: Buffer): boolean {
  switch (extension) {
    case 'pdf':
      return data.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'docx':
    case 'xlsx':
    case 'pptx':
      return startsWith(data, ZIP);
    case 'doc':
    case 'xls':
    case 'ppt':
      return startsWith(data, OLE);
    case 'txt':
    case 'csv':
      return !data.subarray(0, 8192).includes(0);
    default:
      return false;
  }
}

function displayName(raw: string): string {
  const cleaned = raw
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[\\/]/g, '-')
    .trim();
  if (cleaned.length <= MAX_DISPLAY_NAME) return cleaned;
  const extension = /\.[a-z0-9]{1,5}$/i.exec(cleaned)?.[0] ?? '';
  return cleaned.slice(0, MAX_DISPLAY_NAME - extension.length) + extension;
}

function storedName(name: string, extension: string, fallback: string) {
  const base =
    name
      .replace(/\.[^.]*$/, '')
      .replace(/[^A-Za-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || fallback;
  return `${base}.${extension}`;
}

/**
 * Checks an uploaded file: a JPEG, PNG, WebP or GIF photo, or a PDF, Word, Excel,
 * PowerPoint, text or CSV document whose contents match its extension, up to 10 MB.
 * Throws a 4xx with words for the sender otherwise.
 */
export function parseFileUpload(
  data: unknown,
  rawName: unknown,
): ChatFileUpload {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new HttpError(400, 'Choose a file to send.');
  }
  if (data.length > MAX_FILE_BYTES) throw new HttpError(413, TOO_LARGE_MESSAGE);
  const name = displayName(typeof rawName === 'string' ? rawName : '');

  const photo = photoType(data);
  if (photo) {
    return {
      kind: 'photo',
      storedName: storedName(name, photo.extension, 'photo'),
      name: name || `photo.${photo.extension}`,
      mimeType: photo.mime,
      data,
    };
  }
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  const mimeType = DOCUMENT_TYPES[extension];
  if (!mimeType || !looksLike(extension, data)) {
    throw new HttpError(415, UNSUPPORTED_MESSAGE);
  }
  return {
    kind: 'document',
    storedName: storedName(name, extension, 'document'),
    name,
    mimeType,
    data,
  };
}

let imagekit: ImageKit | undefined;

function client(): ImageKit {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) {
    log('error', 'IMAGEKIT_PRIVATE_KEY must be set for chat uploads.');
    throw new HttpError(
      503,
      'File sharing isn’t available right now. Please try again later.',
    );
  }
  return (imagekit ??= new ImageKit({ privateKey }));
}

const hostingError = (error: unknown) => {
  log('error', 'ImageKit chat upload failed.', {
    error: error instanceof Error ? error.message : String(error),
  });
  return new HttpError(502, 'We couldn’t upload that file. Please try again.');
};

/** Uploads to the sender's chat folder; the result can then go in a message. */
export async function uploadChatFile(sender: Sender, upload: ChatFileUpload) {
  const imagekitClient = client();
  let uploaded;
  try {
    uploaded = await imagekitClient.files.upload({
      file: await toFile(upload.data, upload.storedName, {
        type: upload.mimeType,
      }),
      fileName: upload.storedName,
      folder: chatFolder(sender),
      useUniqueFileName: true,
      tags: ['chat', upload.kind],
    });
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw new HttpError(
        400,
        'That file couldn’t be read. Try a different one.',
      );
    }
    throw hostingError(error);
  }
  if (!uploaded.fileId || !uploaded.url) {
    throw hostingError('Response had no fileId or url');
  }
  return {
    url: uploaded.url,
    fileId: uploaded.fileId,
    kind: upload.kind,
    name: upload.name,
    size: upload.data.length,
    mimeType: upload.mimeType,
  };
}
