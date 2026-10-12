import {
  chatFileKind,
  chatFileProblem,
  formatBytes,
  formatUnseen,
  isOtherSide,
  isOwnMessage,
  mergeMessages,
  messagePreview,
  parseChatServerEvent,
  personKey,
  presenceLabel,
  type ChatMessage,
} from './chat.model.js';

const message = (id: string, createdAt: string): ChatMessage => ({
  id,
  conversationId: 'c1',
  senderRole: 'user',
  senderId: 'u1',
  senderName: 'Amina',
  body: id,
  attachments: [],
  files: [],
  gif: null,
  replyTo: null,
  reactions: [],
  editedAt: null,
  deletedAt: null,
  createdAt,
});
const pdf = {
  url: 'https://ik.imagekit.io/m/a.pdf',
  name: 'invoice.pdf',
  size: 2048,
  mimeType: 'application/pdf',
};

describe('formatUnseen', () => {
  it('hides zero and caps at 99+', () => {
    expect(formatUnseen(0)).toBe('');
    expect(formatUnseen(7)).toBe('7');
    expect(formatUnseen(100)).toBe('99+');
  });
});

describe('mergeMessages', () => {
  it('orders oldest first, breaking ties by id, and drops duplicates', () => {
    const a = message('a', '2026-10-12T10:00:00.000Z');
    const b = message('b', '2026-10-12T10:00:00.000Z');
    const c = message('c', '2026-10-12T09:00:00.000Z');

    expect(mergeMessages([b, a], [c, a]).map(({ id }) => id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
});

describe('isOwnMessage', () => {
  it('needs both the role and the id to match', () => {
    const sent = message('a', '2026-10-12T10:00:00.000Z');
    expect(isOwnMessage(sent, { role: 'user', id: 'u1' })).toBe(true);
    expect(isOwnMessage(sent, { role: 'seller', id: 'u1' })).toBe(false);
  });
});

describe('presenceLabel', () => {
  const now = Date.parse('2026-10-12T12:00:00.000Z');

  it('reads like Teams', () => {
    expect(presenceLabel({ status: 'available', lastSeenAt: null }, now)).toBe(
      'Available',
    );
    expect(presenceLabel({ status: 'away', lastSeenAt: null }, now)).toBe(
      'Away',
    );
    expect(presenceLabel({ status: 'offline', lastSeenAt: null }, now)).toBe(
      'Offline',
    );
    expect(
      presenceLabel(
        { status: 'offline', lastSeenAt: '2026-10-12T11:55:00.000Z' },
        now,
      ),
    ).toBe('Last seen 5 min ago');
    expect(
      presenceLabel(
        { status: 'offline', lastSeenAt: '2026-10-11T09:00:00.000Z' },
        now,
      ),
    ).toBe('Last seen yesterday');
    expect(presenceLabel(null, now)).toBe('');
  });
});

describe('parseChatServerEvent', () => {
  it('accepts known events and ignores the rest', () => {
    expect(
      parseChatServerEvent('{"type":"read","conversationId":"c1"}'),
    ).toMatchObject({ type: 'read' });
    expect(
      parseChatServerEvent(
        '{"type":"presence","updates":[{"key":"seller:s1","status":"away","lastSeenAt":null}]}',
      ),
    ).toMatchObject({ type: 'presence', updates: [{ key: 'seller:s1' }] });
    for (const type of ['updated', 'seen', 'typing', 'status']) {
      expect(parseChatServerEvent(JSON.stringify({ type }))).toMatchObject({
        type,
      });
    }
    expect(parseChatServerEvent('{"type":"other"}')).toBeNull();
    expect(parseChatServerEvent('not json')).toBeNull();
    expect(parseChatServerEvent(new ArrayBuffer(2))).toBeNull();
  });
});

describe('personKey', () => {
  it('matches the keys statuses are pushed under', () => {
    expect(personKey({ role: 'seller', id: 's1' })).toBe('seller:s1');
  });
});

describe('messagePreview', () => {
  it('shows the text, or says how many photos were sent', () => {
    const sent = message('a', '2026-10-12T10:00:00.000Z');
    expect(messagePreview(sent)).toBe('a');
    expect(messagePreview({ ...sent, body: '', attachments: ['x'] })).toBe(
      'Sent a photo',
    );
    expect(messagePreview({ ...sent, body: '', attachments: ['x', 'y'] })).toBe(
      'Sent 2 photos',
    );
  });

  it('names documents, GIFs, stickers and deleted messages', () => {
    const sent = { ...message('a', '2026-10-12T10:00:00.000Z'), body: '' };
    const gif = { url: 'u', width: 1, height: 1, title: '' };
    expect(messagePreview({ ...sent, files: [pdf] })).toBe('📄 invoice.pdf');
    expect(messagePreview({ ...sent, files: [pdf, pdf] })).toBe(
      'Sent 2 documents',
    );
    expect(messagePreview({ ...sent, files: [pdf], attachments: ['x'] })).toBe(
      'Sent 2 attachments',
    );
    expect(messagePreview({ ...sent, gif: { ...gif, kind: 'gif' } })).toBe(
      'Sent a GIF',
    );
    expect(messagePreview({ ...sent, gif: { ...gif, kind: 'sticker' } })).toBe(
      'Sent a sticker',
    );
    expect(
      messagePreview({ ...sent, body: 'Hi', deletedAt: sent.createdAt }),
    ).toBe('This message was deleted');
  });
});

describe('presence labels for statuses set by hand', () => {
  it('reads like Teams', () => {
    expect(presenceLabel({ status: 'busy', lastSeenAt: null })).toBe('Busy');
    expect(presenceLabel({ status: 'dnd', lastSeenAt: null })).toBe(
      'Do not disturb',
    );
    expect(presenceLabel({ status: 'brb', lastSeenAt: null })).toBe(
      'Be right back',
    );
  });
});

describe('isOtherSide', () => {
  it('counts the other person, but not another admin for an admin', () => {
    expect(isOtherSide({ role: 'user', id: 'u1' }, 'seller:s1')).toBe(true);
    expect(isOtherSide({ role: 'user', id: 'u1' }, 'admin:a1')).toBe(true);
    expect(isOtherSide({ role: 'user', id: 'u1' }, 'user:u1')).toBe(false);
    expect(isOtherSide({ role: 'admin', id: 'a1' }, 'admin:a2')).toBe(false);
    expect(isOtherSide({ role: 'admin', id: 'a1' }, 'user:u1')).toBe(true);
  });
});

describe('files', () => {
  const file = (name: string, type: string, size = 1024) => ({
    name,
    type,
    size,
  });

  it('formats sizes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(850 * 1024)).toBe('850 KB');
    expect(formatBytes(2.4 * 1024 * 1024)).toBe('2.4 MB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
  });

  it('tells photos from documents by type and extension', () => {
    expect(chatFileKind(file('a.gif', 'image/gif'))).toBe('photo');
    expect(chatFileKind(file('Report.DOCX', ''))).toBe('document');
    expect(chatFileKind(file('data.csv', 'text/csv'))).toBe('document');
    expect(chatFileKind(file('setup.exe', 'application/x-msdownload'))).toBe(
      null,
    );
  });

  it('asks for files over 10 MB to be compressed', () => {
    expect(
      chatFileProblem(file('video.pdf', 'application/pdf', 12.4 * 1024 * 1024)),
    ).toBe(
      '“video.pdf” is 12.4 MB, which is over the 10 MB limit. Please compress it to under 10 MB and try again.',
    );
    expect(
      chatFileProblem(file('ok.pdf', 'application/pdf', 10 * 1024 * 1024)),
    ).toBeNull();
    expect(chatFileProblem(file('setup.exe', ''))).toMatch(/can’t be shared/);
    expect(chatFileProblem(file('empty.txt', 'text/plain', 0))).toBe(
      '“empty.txt” is empty.',
    );
  });
});
