import {
  isObjectId,
  newObjectId,
  parseAttachmentList,
  parseChatEnvelope,
  parseMessageContent,
  parseParticipantKey,
  participantKey,
  type ChatEnvelope,
} from './protocol';

const photo = (name: string) => `https://ik.imagekit.io/mlima/chat/${name}.jpg`;

const envelope: ChatEnvelope = {
  message: {
    id: '6702f0a0aaaaaaaaaaaaaaaa',
    conversationId: 'c'.repeat(24),
    senderRole: 'user',
    senderId: 'a'.repeat(24),
    senderName: 'Amina',
    body: 'Is this still available?',
    attachments: [],
    createdAt: '2026-10-08T09:30:00.000Z',
  },
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

describe('parseMessageContent', () => {
  it('trims the text and allows text, photos or both', () => {
    expect(parseMessageContent('  hello  ', undefined)).toEqual({
      body: 'hello',
      attachments: [],
    });
    expect(parseMessageContent(undefined, [photo('a')])).toEqual({
      body: '',
      attachments: [photo('a')],
    });
    expect(parseMessageContent(' ', [photo('a')])?.body).toBe('');
    expect(parseMessageContent('x'.repeat(2000), [])?.body).toHaveLength(2000);
  });

  it('rejects empty, overlong or malformed messages', () => {
    expect(parseMessageContent('   ', undefined)).toBeNull();
    expect(parseMessageContent(undefined, [])).toBeNull();
    expect(parseMessageContent('x'.repeat(2001), undefined)).toBeNull();
    expect(parseMessageContent(42, undefined)).toBeNull();
    expect(parseMessageContent('hi', 'nope')).toBeNull();
  });
});

describe('parseChatEnvelope', () => {
  it('reads a valid envelope', () => {
    expect(parseChatEnvelope(JSON.stringify(envelope))).toEqual(envelope);
  });

  it('reads messages sent before attachments existed', () => {
    const message: Record<string, unknown> = { ...envelope.message };
    delete message.attachments;
    expect(
      parseChatEnvelope(JSON.stringify({ ...envelope, message }))?.message
        .attachments,
    ).toEqual([]);
  });

  it('reads photo-only messages and direct chat audiences', () => {
    const participants = [`seller:${'b'.repeat(24)}`, `user:${'a'.repeat(24)}`];
    const direct = {
      message: { ...envelope.message, body: '', attachments: [photo('a')] },
      audience: { participants, support: false },
    };

    expect(parseChatEnvelope(JSON.stringify(direct))).toEqual(direct);
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
    ['no audience', JSON.stringify({ message: envelope.message })],
    [
      'an unknown sender role',
      JSON.stringify({
        ...envelope,
        message: { ...envelope.message, senderRole: 'rider' },
      }),
    ],
    [
      'an empty body without photos',
      JSON.stringify({
        ...envelope,
        message: { ...envelope.message, body: ' ' },
      }),
    ],
    [
      'bad attachments',
      JSON.stringify({
        ...envelope,
        message: { ...envelope.message, attachments: ['ftp://x'] },
      }),
    ],
    [
      'a bad conversation id',
      JSON.stringify({
        ...envelope,
        message: { ...envelope.message, conversationId: 'abc' },
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
  ])('rejects %s', (_case, raw) => {
    expect(parseChatEnvelope(raw)).toBeNull();
  });
});
