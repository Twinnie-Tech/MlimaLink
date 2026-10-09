import {
  isObjectId,
  newObjectId,
  parseChatEnvelope,
  parseMessageBody,
  type ChatEnvelope,
} from './protocol';

const envelope: ChatEnvelope = {
  message: {
    id: '6702f0a0aaaaaaaaaaaaaaaa',
    conversationId: 'c'.repeat(24),
    senderRole: 'user',
    senderId: 'a'.repeat(24),
    senderName: 'Amina',
    body: 'Is this still available?',
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

describe('parseMessageBody', () => {
  it('trims the text and rejects empty or overlong messages', () => {
    expect(parseMessageBody('  hello  ')).toBe('hello');
    expect(parseMessageBody('   ')).toBeNull();
    expect(parseMessageBody('x'.repeat(2001))).toBeNull();
    expect(parseMessageBody('x'.repeat(2000))).toHaveLength(2000);
    expect(parseMessageBody(42)).toBeNull();
  });
});

describe('parseChatEnvelope', () => {
  it('reads a valid envelope', () => {
    expect(parseChatEnvelope(JSON.stringify(envelope))).toEqual(envelope);
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
      'an empty body',
      JSON.stringify({
        ...envelope,
        message: { ...envelope.message, body: ' ' },
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
  ])('rejects %s', (_case, raw) => {
    expect(parseChatEnvelope(raw)).toBeNull();
  });
});
