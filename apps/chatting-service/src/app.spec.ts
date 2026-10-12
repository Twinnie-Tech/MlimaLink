import request from 'supertest';
import { createApp } from './app';
import { TOO_LARGE_MESSAGE, uploadChatFile } from './chat/attachments';
import {
  countUnseen,
  deleteMessage,
  editMessage,
  getConversation,
  listConversations,
  listMessages,
  markRead,
  openConversation,
  reactToMessage,
  sendMessage,
  type MessagePage,
} from './chat/conversations';
import { searchGifs } from './chat/giphy';
import { ChatHub } from './chat/hub';
import { authenticate, type Participant } from './chat/participants';
import { MAX_FILE_BYTES } from './chat/protocol';
import { HttpError } from './http-error';

const page = (lastReadAt: string | null): MessagePage => ({
  messages: [],
  hasMore: false,
  nextCursor: null,
  lastReadAt,
  seenAt: null,
});

const uploads = vi.hoisted(() => ({ take: vi.fn() }));

vi.mock('./chat/participants', () => ({ authenticate: vi.fn() }));
vi.mock('./chat/conversations', () => ({
  countUnseen: vi.fn(),
  deleteMessage: vi.fn(),
  editMessage: vi.fn(),
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  getConversation: vi.fn(),
  markRead: vi.fn(),
  MESSAGES_PAGE_SIZE: 20,
  MAX_MESSAGES_PAGE_SIZE: 50,
  openConversation: vi.fn(),
  reactToMessage: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock('./chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chat/attachments')>()),
  uploadChatFile: vi.fn(),
}));
vi.mock('./chat/giphy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chat/giphy')>()),
  searchGifs: vi.fn(),
}));
vi.mock('./chat/rate-limit', () => ({ uploadLimiter: () => uploads }));
vi.mock('./log', () => ({ log: vi.fn() }));

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);
const messageId = 'e'.repeat(24);

const shopper: Participant = {
  role: 'user',
  id: 'a'.repeat(24),
  name: 'Amina',
  expiresAt: Date.now() + 60_000,
};
const conversationId = 'd'.repeat(24);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticate).mockResolvedValue(shopper);
  uploads.take.mockResolvedValue(true);
});

describe('chatting-service app', () => {
  it('answers the health check', async () => {
    const response = await request(createApp()).get('/api');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      service: 'chatting-service',
      status: 'ok',
    });
  });

  it('needs to know which account to use', async () => {
    const response = await request(createApp()).get('/api/chat/conversations');

    expect(response.status).toBe(400);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('answers 401 when the session isn’t valid', async () => {
    vi.mocked(authenticate).mockResolvedValue(null);

    const response = await request(createApp())
      .get('/api/chat/conversations?as=seller')
      .set('Cookie', 'sellerAccessToken=expired');

    expect(response.status).toBe(401);
    expect(authenticate).toHaveBeenCalledWith(
      'seller',
      expect.objectContaining({ cookie: 'sellerAccessToken=expired' }),
    );
  });

  it('lists the signed-in participant’s chats', async () => {
    vi.mocked(listConversations).mockResolvedValue([]);

    const response = await request(createApp()).get(
      '/api/chat/conversations?as=user',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(listConversations).toHaveBeenCalledWith(shopper);
  });

  it('opens a chat from the request body', async () => {
    vi.mocked(openConversation).mockResolvedValue({
      id: conversationId,
    } as never);

    const response = await request(createApp())
      .post('/api/chat/conversations?as=user')
      .send({ shopId: 'c'.repeat(24) });

    expect(response.status).toBe(200);
    expect(openConversation).toHaveBeenCalledWith(shopper, {
      shopId: 'c'.repeat(24),
    });
  });

  it('returns one chat', async () => {
    vi.mocked(getConversation).mockResolvedValue({
      id: conversationId,
    } as never);

    const response = await request(createApp()).get(
      `/api/chat/conversations/${conversationId}?as=seller`,
    );

    expect(response.status).toBe(200);
    expect(getConversation).toHaveBeenCalledWith(shopper, conversationId);
  });

  it('pages messages with ?cursor and ?limit, 20 by default', async () => {
    vi.mocked(listMessages).mockResolvedValue(page(null));
    const app = createApp();
    const messages = `/api/chat/conversations/${conversationId}/messages?as=user`;
    const cursor = 'e'.repeat(24);

    await request(app).get(messages).expect(200);
    expect(listMessages).toHaveBeenLastCalledWith(shopper, conversationId, {
      cursor: undefined,
      limit: 20,
    });

    await request(app).get(`${messages}&cursor=${cursor}&limit=10`).expect(200);
    expect(listMessages).toHaveBeenLastCalledWith(shopper, conversationId, {
      cursor,
      limit: 10,
    });

    for (const bad of ['limit=0', 'limit=51', 'limit=ten', 'cursor=']) {
      await request(app).get(`${messages}&${bad}`).expect(400);
    }
  });

  it('clears the unseen badge in the reader’s open tabs', async () => {
    const hub = new ChatHub();
    const sendTo = vi.spyOn(hub, 'sendTo');
    const lastReadAt = '2026-10-08T10:00:00.000Z';
    vi.mocked(listMessages).mockResolvedValue(page(lastReadAt));

    await request(createApp({ hub }))
      .get(`/api/chat/conversations/${conversationId}/messages?as=user`)
      .expect(200);

    expect(sendTo).toHaveBeenCalledWith('user', shopper.id, {
      type: 'read',
      conversationId,
      lastReadAt,
    });
  });

  it('accepts a message for delivery', async () => {
    vi.mocked(sendMessage).mockResolvedValue({ id: 'm1' } as never);

    const response = await request(createApp())
      .post(`/api/chat/conversations/${conversationId}/messages?as=user`)
      .send({ body: 'Hello' });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ id: 'm1' });
    expect(sendMessage).toHaveBeenCalledWith(shopper, conversationId, {
      body: 'Hello',
    });
  });

  it('marks a chat read and reports the unseen total', async () => {
    const read = {
      conversationId,
      lastReadAt: '2026-10-08T10:00:00.000Z',
    };
    vi.mocked(markRead).mockResolvedValue(read);
    vi.mocked(countUnseen).mockResolvedValue({ total: 5 });
    const app = createApp();

    const marked = await request(app).post(
      `/api/chat/conversations/${conversationId}/read?as=user`,
    );
    expect(marked.status).toBe(200);
    expect(marked.body).toEqual(read);
    expect(markRead).toHaveBeenCalledWith(shopper, conversationId);

    const unseen = await request(app).get('/api/chat/unseen?as=user');
    expect(unseen.status).toBe(200);
    expect(unseen.body).toEqual({ total: 5 });
    expect(countUnseen).toHaveBeenCalledWith(shopper);
  });

  it('uploads the file in the body to the sender’s folder', async () => {
    const uploaded = {
      url: 'https://ik.imagekit.io/mlima/chat/user-a/shoes_x1.png',
      fileId: 'f1',
      kind: 'photo' as const,
      name: 'My Shoes!.PNG',
      size: png.length,
      mimeType: 'image/png',
    };
    vi.mocked(uploadChatFile).mockResolvedValue(uploaded);

    const response = await request(createApp())
      .post(
        `/api/chat/attachments?as=user&name=${encodeURIComponent('My Shoes!.PNG')}`,
      )
      .set('Content-Type', 'image/png')
      .send(png);

    expect(response.status).toBe(201);
    expect(response.body).toEqual(uploaded);
    expect(uploadChatFile).toHaveBeenCalledWith(
      shopper,
      expect.objectContaining({
        kind: 'photo',
        storedName: 'My-Shoes.png',
        name: 'My Shoes!.PNG',
      }),
    );
    expect(uploads.take).toHaveBeenCalledWith(`user:${shopper.id}`);
  });

  it('refuses unsupported files and uploads over the rate limit', async () => {
    const app = createApp();

    const refused = await request(app)
      .post('/api/chat/attachments?as=user&name=setup.exe')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('MZ....'));
    expect(refused.status).toBe(415);
    expect(refused.body.message).toMatch(/can’t be shared/);

    uploads.take.mockResolvedValue(false);
    await request(app)
      .post('/api/chat/attachments?as=user&name=x.png')
      .set('Content-Type', 'image/png')
      .send(png)
      .expect(429);
    expect(uploadChatFile).not.toHaveBeenCalled();
  });

  it('asks for files over 10 MB to be compressed', async () => {
    const response = await request(createApp())
      .post('/api/chat/attachments?as=user&name=big.pdf')
      .set('Content-Type', 'application/pdf')
      .send(Buffer.alloc(MAX_FILE_BYTES + 1));

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ message: TOO_LARGE_MESSAGE });
    expect(uploadChatFile).not.toHaveBeenCalled();
  });

  it('edits, deletes and reacts to messages', async () => {
    const app = createApp();
    const path = `/api/chat/conversations/${conversationId}/messages/${messageId}`;
    vi.mocked(editMessage).mockResolvedValue({ id: messageId } as never);
    vi.mocked(deleteMessage).mockResolvedValue({ id: messageId } as never);
    vi.mocked(reactToMessage).mockResolvedValue({ id: messageId } as never);

    await request(app)
      .patch(`${path}?as=user`)
      .send({ body: 'Fixed' })
      .expect(200);
    expect(editMessage).toHaveBeenCalledWith(
      shopper,
      conversationId,
      messageId,
      { body: 'Fixed' },
    );

    await request(app).delete(`${path}?as=user`).expect(200);
    expect(deleteMessage).toHaveBeenCalledWith(
      shopper,
      conversationId,
      messageId,
    );

    await request(app)
      .post(`${path}/reactions?as=user`)
      .send({ emoji: '👍' })
      .expect(200);
    expect(reactToMessage).toHaveBeenCalledWith(
      shopper,
      conversationId,
      messageId,
      { emoji: '👍' },
    );
  });

  it('searches GIFs and stickers', async () => {
    vi.mocked(searchGifs).mockResolvedValue({ results: [], next: null });
    const app = createApp();

    await request(app)
      .get('/api/chat/gifs?as=user&type=stickers&q=thanks&offset=24')
      .expect(200, { results: [], next: null });
    expect(searchGifs).toHaveBeenCalledWith({
      kind: 'stickers',
      q: 'thanks',
      offset: 24,
    });

    await request(app).get('/api/chat/gifs?as=user&type=videos').expect(400);
  });

  it('keeps large bodies to the upload route', async () => {
    const response = await request(createApp())
      .post(`/api/chat/conversations/${conversationId}/messages?as=user`)
      .send({ body: 'x'.repeat(20_000) });

    expect(response.status).toBe(413);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('turns service errors into their status and message', async () => {
    vi.mocked(sendMessage).mockRejectedValue(
      new HttpError(503, 'Chat is unavailable right now.'),
    );

    const response = await request(createApp())
      .post(`/api/chat/conversations/${conversationId}/messages?as=user`)
      .send({ body: 'Hello' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      message: 'Chat is unavailable right now.',
    });
  });

  it('hides unexpected errors', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.mocked(listConversations).mockRejectedValue(
      new Error('db password wrong'),
    );

    const response = await request(createApp()).get(
      '/api/chat/conversations?as=user',
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Something went wrong.' });
    error.mockRestore();
  });
});
