import { BadRequestError } from '@imagekit/nodejs';
import {
  MAX_IMAGE_DATA_URL_LENGTH,
  chatImageFolder,
  isChatImageOf,
  parseImageUpload,
  uploadChatImage,
} from './attachments';

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
const png = `data:image/png;base64,${'A'.repeat(64)}`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('IMAGEKIT_URL_ENDPOINT', `${endpoint}/`);
  vi.stubEnv('IMAGEKIT_PRIVATE_KEY', 'private_test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isChatImageOf', () => {
  const folder = `${endpoint}/chat/user-${userId}`;

  it('accepts photos in the sender’s chat folder', () => {
    expect(chatImageFolder(shopper)).toBe(`/chat/user-${userId}`);
    expect(isChatImageOf(`${folder}/shoes_x1.jpg`, shopper)).toBe(true);
    expect(isChatImageOf(`${folder}/shoes.jpg?tr=w-300`, shopper)).toBe(true);
  });

  it.each([
    ['another person’s folder', `${endpoint}/chat/seller-${userId}/a.jpg`],
    ['another site', `https://evil.example/chat/user-${userId}/a.jpg`],
    ['a path escape', `${folder}/../user-${'b'.repeat(24)}/a.jpg`],
    ['a nested path', `${folder}/deeper/a.jpg`],
    ['the folder itself', `${folder}/`],
  ])('rejects %s', (_case, url) => {
    expect(isChatImageOf(url, shopper)).toBe(false);
  });

  it('rejects everything when the endpoint isn’t configured', () => {
    vi.stubEnv('IMAGEKIT_URL_ENDPOINT', '');
    expect(isChatImageOf(`${folder}/a.jpg`, shopper)).toBe(false);
  });
});

describe('parseImageUpload', () => {
  it('accepts JPEG, PNG and WebP data URLs and tidies the file name', () => {
    expect(parseImageUpload({ fileName: 'My Shoes!.PNG', file: png })).toEqual({
      fileName: 'My-Shoes.png',
      file: png,
    });
    expect(
      parseImageUpload({ file: png.replace('png', 'webp') })?.fileName,
    ).toBe('photo.webp');
  });

  it.each([
    ['a GIF', { file: 'data:image/gif;base64,AAAA' }],
    ['plain text', { file: 'hello' }],
    ['no file', {}],
    [
      'an oversized photo',
      {
        file: `data:image/png;base64,${'A'.repeat(MAX_IMAGE_DATA_URL_LENGTH)}`,
      },
    ],
  ])('rejects %s', (_case, body) => {
    expect(parseImageUpload(body)).toBeNull();
  });
});

describe('uploadChatImage', () => {
  const image = { fileName: 'shoes.png', file: png };

  // First, because the ImageKit client is kept once it's made.
  it('answers 503 when ImageKit isn’t configured', async () => {
    vi.stubEnv('IMAGEKIT_PRIVATE_KEY', '');

    await expect(uploadChatImage(shopper, image)).rejects.toMatchObject({
      status: 503,
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads to the sender’s chat folder', async () => {
    upload.mockResolvedValue({ url: `${endpoint}/x.png`, fileId: 'f1' });

    await expect(uploadChatImage(shopper, image)).resolves.toEqual({
      url: `${endpoint}/x.png`,
      fileId: 'f1',
    });
    expect(upload).toHaveBeenCalledWith({
      file: png,
      fileName: 'shoes.png',
      folder: `/chat/user-${userId}`,
      useUniqueFileName: true,
      tags: ['chat'],
    });
  });

  it('answers 400 for unreadable photos and 502 when hosting fails', async () => {
    upload.mockRejectedValueOnce(
      new BadRequestError(400, undefined, 'bad image', new Headers()),
    );
    await expect(uploadChatImage(shopper, image)).rejects.toMatchObject({
      status: 400,
    });

    upload.mockRejectedValueOnce(new Error('timeout'));
    await expect(uploadChatImage(shopper, image)).rejects.toMatchObject({
      status: 502,
    });
  });
});
