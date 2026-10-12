import request from 'supertest';
import { createApp } from './app';
import { uploadChatImage } from './chat/attachments';
import {
  listConversations,
  listMessages,
  openConversation,
  sendMessage,
} from './chat/conversations';
import { authenticate, type Participant } from './chat/participants';
import { HttpError } from './http-error';

const uploads = vi.hoisted(() => ({ take: vi.fn() }));

vi.mock('./chat/participants', () => ({ authenticate: vi.fn() }));
vi.mock('./chat/conversations', () => ({
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  openConversation: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock('./chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chat/attachments')>()),
  uploadChatImage: vi.fn(),
}));
vi.mock('./chat/rate-limit', () => ({ uploadLimiter: () => uploads }));
vi.mock('./log', () => ({ log: vi.fn() }));

const photo = `data:image/png;base64,${'A'.repeat(64)}`;

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

  it('pages history with ?before and rejects bad dates', async () => {
    vi.mocked(listMessages).mockResolvedValue([]);
    const app = createApp();

    await request(app)
      .get(
        `/api/chat/conversations/${conversationId}/messages?as=user&before=2026-10-08T10:00:00.000Z`,
      )
      .expect(200);
    expect(listMessages).toHaveBeenCalledWith(
      shopper,
      conversationId,
      new Date('2026-10-08T10:00:00.000Z'),
    );

    await request(app)
      .get(
        `/api/chat/conversations/${conversationId}/messages?as=user&before=soon`,
      )
      .expect(400);
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

  it('uploads a chat photo to the sender’s folder', async () => {
    vi.mocked(uploadChatImage).mockResolvedValue({
      url: 'https://ik.imagekit.io/mlima/chat/user-a/shoes_x1.png',
      fileId: 'f1',
    });

    const response = await request(createApp())
      .post('/api/chat/attachments?as=user')
      .send({ fileName: 'My Shoes!.PNG', file: photo });

    expect(response.status).toBe(201);
    expect(response.body.fileId).toBe('f1');
    expect(uploadChatImage).toHaveBeenCalledWith(shopper, {
      fileName: 'My-Shoes.png',
      file: photo,
    });
    expect(uploads.take).toHaveBeenCalledWith(`user:${shopper.id}`);
  });

  it('rejects files that aren’t photos, and uploads over the limit', async () => {
    const app = createApp();

    await request(app)
      .post('/api/chat/attachments?as=user')
      .send({ fileName: 'x.gif', file: 'data:image/gif;base64,AAAA' })
      .expect(400);

    uploads.take.mockResolvedValue(false);
    await request(app)
      .post('/api/chat/attachments?as=user')
      .send({ fileName: 'x.png', file: photo })
      .expect(429);
    expect(uploadChatImage).not.toHaveBeenCalled();
  });

  it('keeps large bodies to the photo route', async () => {
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
