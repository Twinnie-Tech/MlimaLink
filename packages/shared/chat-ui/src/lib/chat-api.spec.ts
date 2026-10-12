import { ChatRequestError, chatSocketUrl, createChatApi } from './chat-api';

const respond = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('createChatApi', () => {
  const fetchMock = vi.fn();
  const refreshSession = vi.fn();
  const api = createChatApi({ account: 'seller', refreshSession });

  beforeEach(() => {
    fetchMock.mockReset();
    refreshSession.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('names the account and sends cookies', async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { total: 3 }));

    await expect(api.unseenTotal()).resolves.toBe(3);
    expect(fetchMock).toHaveBeenCalledWith('/api/chat/unseen?as=seller', {
      method: 'GET',
      headers: undefined,
      credentials: 'include',
      body: undefined,
    });
  });

  it('pages messages with the cursor', async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { messages: [] }));

    await api.listMessages('c1', 'm9');
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/chat/conversations/c1/messages?cursor=m9&as=seller',
    );
  });

  it('refreshes an expired session once and retries', async () => {
    fetchMock
      .mockResolvedValueOnce(respond(401, { message: 'Unauthorized!' }))
      .mockResolvedValueOnce(respond(200, []));
    refreshSession.mockResolvedValueOnce(undefined);

    await expect(api.listConversations()).resolves.toEqual([]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks to sign in again when the refresh fails', async () => {
    fetchMock.mockResolvedValueOnce(respond(401, {}));
    refreshSession.mockRejectedValueOnce(new Error('expired'));

    await expect(api.listConversations()).rejects.toEqual(
      new ChatRequestError(
        'Your session has ended. Please sign in again.',
        401,
      ),
    );
  });

  it('passes on the server’s reason', async () => {
    fetchMock.mockResolvedValueOnce(
      respond(400, {
        message: 'Send exactly one of to, shopId, support, userId or sellerId.',
      }),
    );

    const error = await api.openConversation({ shopId: 'x' }).catch((e) => e);
    expect(error).toBeInstanceOf(ChatRequestError);
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/exactly one/);
  });

  it('uploads the file itself as the body, named in the query', async () => {
    const upload = { url: 'u', kind: 'document', name: 'Q3 report.pdf' };
    fetchMock.mockResolvedValueOnce(respond(201, upload));
    const file = new File(['%PDF-'], 'Q3 report.pdf', {
      type: 'application/pdf',
    });

    await expect(api.uploadFile(file)).resolves.toEqual(upload);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/attachments?name=Q3%20report.pdf&as=seller',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        credentials: 'include',
        body: file,
      },
    );
  });

  it('asks for an oversized file to be compressed even without a reason', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 413,
      json: async () => {
        throw new SyntaxError('not JSON');
      },
    });

    await expect(
      api.uploadFile(new File(['x'], 'big.pdf')),
    ).rejects.toMatchObject({
      status: 413,
      message:
        'That file is over the 10 MB limit. Please compress it to under 10 MB and try again.',
    });
  });

  it('edits, deletes and reacts to messages', async () => {
    fetchMock.mockResolvedValue(respond(200, { id: 'm1' }));

    await api.editMessage('c1', 'm1', 'Fixed');
    await api.deleteMessage('c1', 'm1');
    await api.react('c1', 'm1', '👍');

    expect(
      fetchMock.mock.calls.map(([url, init]) => [url, init.method, init.body]),
    ).toEqual([
      [
        '/api/chat/conversations/c1/messages/m1?as=seller',
        'PATCH',
        '{"body":"Fixed"}',
      ],
      ['/api/chat/conversations/c1/messages/m1?as=seller', 'DELETE', undefined],
      [
        '/api/chat/conversations/c1/messages/m1/reactions?as=seller',
        'POST',
        '{"emoji":"👍"}',
      ],
    ]);
  });

  it('searches GIFs and stickers, trending without a search', async () => {
    fetchMock.mockResolvedValue(respond(200, { results: [], next: null }));

    await api.searchGifs('stickers', ' party ', 24);
    await api.searchGifs('gifs', '');

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/chat/gifs?type=stickers&offset=24&q=party&as=seller',
      '/api/chat/gifs?type=gifs&offset=0&as=seller',
    ]);
  });

  it('reports an unreachable server', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(api.getConversation('c1')).rejects.toMatchObject({
      status: 0,
    });
  });
});

describe('chatSocketUrl', () => {
  it('connects through the same origin by default', () => {
    expect(
      chatSocketUrl('user', undefined, {
        protocol: 'https:',
        host: 'shop.example',
      }),
    ).toBe('wss://shop.example/api/chat/ws?as=user');
  });

  it('uses NEXT_PUBLIC_CHAT_WS_URL when set', () => {
    expect(chatSocketUrl('seller', 'ws://localhost:6007/api/chat/ws/')).toBe(
      'ws://localhost:6007/api/chat/ws?as=seller',
    );
  });
});
