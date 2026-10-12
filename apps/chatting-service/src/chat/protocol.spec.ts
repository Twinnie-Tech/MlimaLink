import {
  DELETED_TEXT,
  isGiphyUrl,
  isObjectId,
  newObjectId,
  parseAttachmentList,
  parseChatEnvelope,
  parseFileList,
  parseMessageContent,
  parseParticipantKey,
  participantKey,
  previewOf,
  type ChatEnvelope,
  type ChatFile,
  type ChatGif,
  type ChatMessage,
} from './protocol';

const photo = (name: string) => `https://ik.imagekit.io/mlima/chat/${name}.jpg`;

const pdf = (name: string): ChatFile => ({
  url: `https://ik.imagekit.io/mlima/chat/${name}.pdf`,
  name: `${name}.pdf`,
  size: 120_000,
  mimeType: 'application/pdf',
});

const gif: ChatGif = {
  kind: 'gif',
  url: 'https://media2.giphy.com/media/abc/200.gif',
  width: 356,
  height: 200,
  title: 'Thumbs up',
};

const message: ChatMessage = {
  id: '6702f0a0aaaaaaaaaaaaaaaa',
  conversationId: 'c'.repeat(24),
  senderRole: 'user',
  senderId: 'a'.repeat(24),
  senderName: 'Amina',
  body: 'Is this still available?',
  attachments: [],
  files: [],
  gif: null,
  replyTo: null,
  reactions: [],
  editedAt: null,
  deletedAt: null,
  createdAt: '2026-10-08T09:30:00.000Z',
};

const envelope: ChatEnvelope = {
  type: 'message',
  message,
  audience: {
    userId: 'a'.repeat(24),
    sellerId: 'b'.repeat(24),
    support: false,
  },
};

describe('newObjectId', () => {
  it('makes unique ObjectIds that start with the time', () => {
    const now = Date.parse('2026-10-08T09:30:00.000Z');
    const first = newObjectId(now);

    expect(isObjectId(first)).toBe(true);
    expect(parseInt(first.slice(0, 8), 16)).toBe(now / 1000);
    expect(newObjectId(now)).not.toBe(first);
  });
});

describe('participant keys', () => {
  it('round-trips a role and id', () => {
    const key = participantKey('seller', 'b'.repeat(24));

    expect(key).toBe(`seller:${'b'.repeat(24)}`);
    expect(parseParticipantKey(key)).toEqual({
      role: 'seller',
      id: 'b'.repeat(24),
    });
  });

  it.each([undefined, 'rider:' + 'b'.repeat(24), 'user:abc', 'user:a:b'])(
    'rejects %s',
    (value) => {
      expect(parseParticipantKey(value)).toBeNull();
    },
  );
});

describe('parseAttachmentList', () => {
  it('treats missing as none and accepts up to four distinct https URLs', () => {
    expect(parseAttachmentList(undefined)).toEqual([]);
    expect(parseAttachmentList([photo('a'), photo('b')])).toEqual([
      photo('a'),
      photo('b'),
    ]);
  });

  it.each([
    ['not a list', photo('a')],
    ['too many', ['a', 'b', 'c', 'd', 'e'].map(photo)],
    ['duplicates', [photo('a'), photo('a')]],
    ['plain http', ['http://ik.imagekit.io/x.jpg']],
    ['non-strings', [42]],
    ['overlong URLs', [`https://${'x'.repeat(2048)}`]],
  ])('rejects %s', (_case, value) => {
    expect(parseAttachmentList(value)).toBeNull();
  });
});

describe('parseFileList', () => {
  it('accepts shared documents and trims their names', () => {
    expect(parseFileList(undefined)).toEqual([]);
    expect(
      parseFileList([{ ...pdf('invoice'), name: ' invoice.pdf ' }]),
    ).toEqual([pdf('invoice')]);
  });

  it.each([
    [
      'an unsupported type',
      [{ ...pdf('a'), mimeType: 'application/x-msdownload' }],
    ],
    ['a file over 10 MB', [{ ...pdf('a'), size: 10 * 1024 * 1024 + 1 }]],
    ['no name', [{ ...pdf('a'), name: ' ' }]],
    ['plain http', [{ ...pdf('a'), url: 'http://x/a.pdf' }]],
    ['the same file twice', [pdf('a'), pdf('a')]],
  ])('rejects %s', (_case, value) => {
    expect(parseFileList(value)).toBeNull();
  });
});

describe('isGiphyUrl', () => {
  it('only accepts GIPHY’s media hosts over https', () => {
    expect(isGiphyUrl('https://media2.giphy.com/media/abc/200.gif')).toBe(true);
    expect(isGiphyUrl('https://i.giphy.com/abc.gif')).toBe(true);
    expect(isGiphyUrl('http://media.giphy.com/a.gif')).toBe(false);
    expect(isGiphyUrl('https://giphy.com.evil.example/a.gif')).toBe(false);
    expect(isGiphyUrl('https://evil.example/media.giphy.com/a.gif')).toBe(
      false,
    );
  });
});

describe('parseMessageContent', () => {
  it('trims the text and allows text, photos, documents or a mix', () => {
    expect(parseMessageContent({ body: '  hello  ' })).toEqual({
      body: 'hello',
      attachments: [],
      files: [],
      gif: null,
    });
    expect(parseMessageContent({ attachments: [photo('a')] })).toMatchObject({
      body: '',
      attachments: [photo('a')],
    });
    expect(parseMessageContent({ body: ' ', files: [pdf('a')] })).toMatchObject(
      { body: '', files: [pdf('a')] },
    );
    expect(parseMessageContent({ body: 'x'.repeat(2000) })?.body).toHaveLength(
      2000,
    );
  });

  it('sends a GIF or sticker on its own', () => {
    expect(parseMessageContent({ gif })).toEqual({
      body: '',
      attachments: [],
      files: [],
      gif,
    });
    expect(parseMessageContent({ gif, body: 'hi' })).toBeNull();
    expect(
      parseMessageContent({
        gif: { ...gif, url: 'https://evil.example/a.gif' },
      }),
    ).toBeNull();
  });

  it('rejects empty, overlong or malformed messages', () => {
    expect(parseMessageContent({ body: '   ' })).toBeNull();
    expect(parseMessageContent({ attachments: [] })).toBeNull();
    expect(parseMessageContent({ body: 'x'.repeat(2001) })).toBeNull();
    expect(parseMessageContent({ body: 42 })).toBeNull();
    expect(parseMessageContent({ body: 'hi', attachments: 'nope' })).toBeNull();
    expect(
      parseMessageContent({
        attachments: ['a', 'b', 'c'].map(photo),
        files: [pdf('a'), pdf('b')],
      }),
    ).toBeNull();
  });
});

describe('previewOf', () => {
  it('describes what was sent', () => {
    expect(previewOf(message)).toBe('Is this still available?');
    expect(previewOf({ ...message, body: '', gif })).toBe('Sent a GIF');
    expect(
      previewOf({ ...message, body: '', gif: { ...gif, kind: 'sticker' } }),
    ).toBe('Sent a sticker');
    expect(previewOf({ ...message, body: '', files: [pdf('invoice')] })).toBe(
      '📄 invoice.pdf',
    );
    expect(
      previewOf({
        ...message,
        body: '',
        files: [pdf('a')],
        attachments: [photo('b')],
      }),
    ).toBe('Sent 2 attachments');
    expect(previewOf({ ...message, deletedAt: message.createdAt })).toBe(
      DELETED_TEXT,
    );
  });
});

describe('parseChatEnvelope', () => {
  it('reads a valid envelope', () => {
    expect(parseChatEnvelope(JSON.stringify(envelope))).toEqual(envelope);
  });

  it('reads messages sent before there were types, documents or replies', () => {
    const old: Record<string, unknown> = { ...message };
    for (const field of [
      'attachments',
      'files',
      'gif',
      'replyTo',
      'reactions',
      'editedAt',
      'deletedAt',
    ]) {
      delete old[field];
    }
    expect(
      parseChatEnvelope(
        JSON.stringify({ message: old, audience: envelope.audience }),
      ),
    ).toEqual(envelope);
  });

  it('reads photo-only messages, replies and direct chat audiences', () => {
    const participants = [`seller:${'b'.repeat(24)}`, `user:${'a'.repeat(24)}`];
    const direct: ChatEnvelope = {
      type: 'message',
      message: {
        ...message,
        body: '',
        attachments: [photo('a')],
        replyTo: { id: 'd'.repeat(24), senderName: 'Kim', preview: 'Hello' },
      },
      audience: { participants, support: false },
    };

    expect(parseChatEnvelope(JSON.stringify(direct))).toEqual(direct);
  });

  it('reads edits, including deleted messages with nothing left in them', () => {
    const deleted: ChatEnvelope = {
      type: 'updated',
      message: { ...message, body: '', deletedAt: '2026-10-08T10:00:00.000Z' },
      audience: envelope.audience,
    };
    const reacted: ChatEnvelope = {
      type: 'updated',
      message: {
        ...message,
        reactions: [
          { emoji: '👍', key: `seller:${'b'.repeat(24)}`, name: 'Kim' },
        ],
      },
      audience: envelope.audience,
    };

    expect(parseChatEnvelope(JSON.stringify(deleted))).toEqual(deleted);
    expect(parseChatEnvelope(JSON.stringify(reacted))).toEqual(reacted);
  });

  it('reads seen receipts and typing', () => {
    const seen: ChatEnvelope = {
      type: 'seen',
      conversationId: 'c'.repeat(24),
      reader: `seller:${'b'.repeat(24)}`,
      lastReadAt: '2026-10-08T10:00:00.000Z',
      audience: envelope.audience,
    };
    const typing: ChatEnvelope = {
      type: 'typing',
      conversationId: 'c'.repeat(24),
      from: { key: `user:${'a'.repeat(24)}`, name: 'Amina' },
      audience: envelope.audience,
    };

    expect(parseChatEnvelope(JSON.stringify(seen))).toEqual(seen);
    expect(parseChatEnvelope(JSON.stringify(typing))).toEqual(typing);
  });

  it('leaves out audience ids that aren’t set', () => {
    const support = {
      ...envelope,
      audience: { sellerId: 'b'.repeat(24), support: true },
    };
    expect(parseChatEnvelope(JSON.stringify(support))?.audience).toEqual({
      sellerId: 'b'.repeat(24),
      support: true,
    });
  });

  it.each([
    ['empty input', undefined],
    ['invalid JSON', '{'],
    ['no audience', JSON.stringify({ message })],
    ['an unknown type', JSON.stringify({ ...envelope, type: 'other' })],
    [
      'an unknown sender role',
      JSON.stringify({
        ...envelope,
        message: { ...message, senderRole: 'rider' },
      }),
    ],
    [
      'an empty body without photos',
      JSON.stringify({ ...envelope, message: { ...message, body: ' ' } }),
    ],
    [
      'bad attachments',
      JSON.stringify({
        ...envelope,
        message: { ...message, attachments: ['ftp://x'] },
      }),
    ],
    [
      'a bad conversation id',
      JSON.stringify({
        ...envelope,
        message: { ...message, conversationId: 'abc' },
      }),
    ],
    [
      'a missing support flag',
      JSON.stringify({ ...envelope, audience: { userId: 'a'.repeat(24) } }),
    ],
    [
      'bad participant keys',
      JSON.stringify({
        ...envelope,
        audience: { participants: ['someone'], support: false },
      }),
    ],
    [
      'typing from nobody',
      JSON.stringify({
        type: 'typing',
        conversationId: 'c'.repeat(24),
        from: { key: 'someone', name: 'X' },
        audience: envelope.audience,
      }),
    ],
  ])('rejects %s', (_case, raw) => {
    expect(parseChatEnvelope(raw)).toBeNull();
  });
});
