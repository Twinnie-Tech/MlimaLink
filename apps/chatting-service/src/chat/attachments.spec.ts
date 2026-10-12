import { BadRequestError } from '@imagekit/nodejs';
import {
  TOO_LARGE_MESSAGE,
  UNSUPPORTED_MESSAGE,
  chatFolder,
  isChatFileOf,
  parseFileUpload,
  uploadChatFile,
} from './attachments';
import { MAX_FILE_BYTES } from './protocol';

const upload = vi.hoisted(() => vi.fn());

vi.mock('@imagekit/nodejs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@imagekit/nodejs')>();
  return {
    ...actual,
    default: vi.fn(function ImageKit() {
      return { files: { upload } };
    }),
  };
});
vi.mock('../log', () => ({ log: vi.fn() }));

const endpoint = 'https://ik.imagekit.io/mlima';
const userId = 'a'.repeat(24);
const shopper = { role: 'user' as const, id: userId };

const bytes = (...values: number[]) => Buffer.from(values);
const png = Buffer.concat([
  bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  Buffer.alloc(32),
]);
const jpeg = Buffer.concat([bytes(0xff, 0xd8, 0xff, 0xe0), Buffer.alloc(32)]);
const gif = Buffer.from('GIF89a......');
const webp = Buffer.from('RIFF\0\0\0\0WEBPVP8 ');
const pdf = Buffer.from('%PDF-1.7\n...');
const zip = Buffer.concat([bytes(0x50, 0x4b, 0x03, 0x04), Buffer.alloc(32)]);
const ole = Buffer.concat([
  bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1),
  Buffer.alloc(32),
]);
const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(32)]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('IMAGEKIT_URL_ENDPOINT', `${endpoint}/`);
  vi.stubEnv('IMAGEKIT_PRIVATE_KEY', 'private_test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isChatFileOf', () => {
  const folder = `${endpoint}/chat/user-${userId}`;

  it('accepts files in the sender’s chat folder', () => {
    expect(chatFolder(shopper)).toBe(`/chat/user-${userId}`);
    expect(isChatFileOf(`${folder}/shoes_x1.jpg`, shopper)).toBe(true);
    expect(isChatFileOf(`${folder}/shoes.jpg?tr=w-300`, shopper)).toBe(true);
    expect(isChatFileOf(`${folder}/Invoice-March.pdf`, shopper)).toBe(true);
  });

  it.each([
    ['another person’s folder', `${endpoint}/chat/seller-${userId}/a.jpg`],
    ['another site', `https://evil.example/chat/user-${userId}/a.jpg`],
    ['a path escape', `${folder}/../user-${'b'.repeat(24)}/a.jpg`],
    ['a nested path', `${folder}/deeper/a.jpg`],
    ['the folder itself', `${folder}/`],
  ])('rejects %s', (_case, url) => {
    expect(isChatFileOf(url, shopper)).toBe(false);
  });

  it('rejects everything when the endpoint isn’t configured', () => {
    vi.stubEnv('IMAGEKIT_URL_ENDPOINT', '');
    expect(isChatFileOf(`${folder}/a.jpg`, shopper)).toBe(false);
  });
});

describe('parseFileUpload', () => {
  it('recognises photos by their contents, whatever they’re called', () => {
    expect(parseFileUpload(png, 'My Shoes!.PNG')).toMatchObject({
      kind: 'photo',
      storedName: 'My-Shoes.png',
      name: 'My Shoes!.PNG',
      mimeType: 'image/png',
    });
    expect(parseFileUpload(jpeg, 'holiday.png')).toMatchObject({
      storedName: 'holiday.jpg',
      mimeType: 'image/jpeg',
    });
    expect(parseFileUpload(gif, undefined)).toMatchObject({
      storedName: 'photo.gif',
      name: 'photo.gif',
    });
    expect(parseFileUpload(webp, 'x.webp').mimeType).toBe('image/webp');
  });

  it('accepts documents whose contents match their extension', () => {
    expect(parseFileUpload(pdf, 'Invoice March.pdf')).toMatchObject({
      kind: 'document',
      storedName: 'Invoice-March.pdf',
      name: 'Invoice March.pdf',
      mimeType: 'application/pdf',
    });
    expect(parseFileUpload(zip, 'report.docx').kind).toBe('document');
    expect(parseFileUpload(zip, 'sales.XLSX').storedName).toBe('sales.xlsx');
    expect(parseFileUpload(ole, 'old.doc').mimeType).toBe('application/msword');
    expect(
      parseFileUpload(Buffer.from('a,b\n1,2'), 'prices.csv').mimeType,
    ).toBe('text/csv');
  });

  it.each([
    ['a program renamed as a PDF', exe, 'invoice.pdf'],
    ['a program', exe, 'setup.exe'],
    ['a ZIP archive', zip, 'photos.zip'],
    ['binary data called text', Buffer.from([0x61, 0x00, 0x62]), 'notes.txt'],
    ['no extension', pdf, 'invoice'],
  ])('refuses %s', (_case, data, name) => {
    expect(() => parseFileUpload(data, name)).toThrow(
      expect.objectContaining({ status: 415, message: UNSUPPORTED_MESSAGE }),
    );
  });

  it('asks for a file, and to compress anything over 10 MB', () => {
    expect(() => parseFileUpload(Buffer.alloc(0), 'a.pdf')).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => parseFileUpload({}, 'a.pdf')).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() =>
      parseFileUpload(Buffer.alloc(MAX_FILE_BYTES + 1), 'a.pdf'),
    ).toThrow(
      expect.objectContaining({ status: 413, message: TOO_LARGE_MESSAGE }),
    );
    expect(TOO_LARGE_MESSAGE).toMatch(/compress it to under 10 MB/);
  });

  it('keeps names readable and short', () => {
    const name = `${'n'.repeat(200)}.pdf`;
    expect(parseFileUpload(pdf, name).name).toBe(`${'n'.repeat(116)}.pdf`);
    expect(parseFileUpload(pdf, 'a/b\u0000c.pdf').name).toBe('a-bc.pdf');
  });
});

describe('uploadChatFile', () => {
  const document = parseFileUpload(pdf, 'Invoice March.pdf');

  // First, because the ImageKit client is kept once it's made.
  it('answers 503 when ImageKit isn’t configured', async () => {
    vi.stubEnv('IMAGEKIT_PRIVATE_KEY', '');

    await expect(uploadChatFile(shopper, document)).rejects.toMatchObject({
      status: 503,
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads to the sender’s chat folder', async () => {
    upload.mockResolvedValue({ url: `${endpoint}/x.pdf`, fileId: 'f1' });

    await expect(uploadChatFile(shopper, document)).resolves.toEqual({
      url: `${endpoint}/x.pdf`,
      fileId: 'f1',
      kind: 'document',
      name: 'Invoice March.pdf',
      size: pdf.length,
      mimeType: 'application/pdf',
    });
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'Invoice-March.pdf',
        folder: `/chat/user-${userId}`,
        useUniqueFileName: true,
        tags: ['chat', 'document'],
      }),
    );
    const { file } = upload.mock.calls[0][0] as { file: File };
    expect(file.name).toBe('Invoice-March.pdf');
    expect(file.size).toBe(pdf.length);
  });

  it('answers 400 for unreadable files and 502 when hosting fails', async () => {
    upload.mockRejectedValueOnce(
      new BadRequestError(400, undefined, 'bad file', new Headers()),
    );
    await expect(uploadChatFile(shopper, document)).rejects.toMatchObject({
      status: 400,
    });

    upload.mockRejectedValueOnce(new Error('timeout'));
    await expect(uploadChatFile(shopper, document)).rejects.toMatchObject({
      status: 502,
    });
  });
});
