import { ChatHub, type ChatSocket } from './hub';
import type { ChatEnvelope, ChatMessage } from './protocol';

const socket = (readyState = 1) => ({
  readyState,
  send: vi.fn<ChatSocket['send']>(),
});

const userId = 'a'.repeat(24);
const sellerId = 'b'.repeat(24);
const message: ChatMessage = {
  id: 'd'.repeat(24),
  conversationId: 'c'.repeat(24),
  senderRole: 'user',
  senderId: userId,
  senderName: 'Amina',
  body: 'Hello',
  attachments: [],
  files: [],
  gif: null,
  replyTo: null,
  reactions: [],
  editedAt: null,
  deletedAt: null,
  createdAt: '2026-10-08T09:30:00.000Z',
};
const shopAudience = { userId, sellerId, support: false };
const shopChat: ChatEnvelope = {
  type: 'message',
  message,
  audience: shopAudience,
};

describe('ChatHub', () => {
  it('delivers to every socket of the shopper and seller in the chat', () => {
    const hub = new ChatHub();
    const [shopperTab1, shopperTab2, seller, otherSeller, admin] = [
      socket(),
      socket(),
      socket(),
      socket(),
      socket(),
    ];
    hub.add('user', userId, shopperTab1);
    hub.add('user', userId, shopperTab2);
    hub.add('seller', sellerId, seller);
    hub.add('seller', 'e'.repeat(24), otherSeller);
    hub.add('admin', 'f'.repeat(24), admin);

    expect(hub.deliver(shopChat)).toBe(3);
    const sent = JSON.stringify({ type: 'message', message });
    expect(shopperTab1.send).toHaveBeenCalledWith(sent);
    expect(shopperTab2.send).toHaveBeenCalledWith(sent);
    expect(seller.send).toHaveBeenCalledWith(sent);
    expect(otherSeller.send).not.toHaveBeenCalled();
    expect(admin.send).not.toHaveBeenCalled();
  });

  it('passes on edits and seen receipts the same way, without who they’re for', () => {
    const hub = new ChatHub();
    const seller = socket();
    hub.add('seller', sellerId, seller);
    const edited = { ...message, body: 'Hello!', editedAt: message.createdAt };
    const seen = {
      conversationId: message.conversationId,
      reader: `user:${userId}`,
      lastReadAt: '2026-10-08T10:00:00.000Z',
    };

    hub.deliver({ type: 'updated', message: edited, audience: shopAudience });
    hub.deliver({ type: 'seen', ...seen, audience: shopAudience });

    expect(seller.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'updated', message: edited }),
    );
    expect(seller.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'seen', ...seen }),
    );
  });

  it('tells everyone but the typist that they’re typing', () => {
    const hub = new ChatHub();
    const [typist, typistTab2, seller] = [socket(), socket(), socket()];
    hub.add('user', userId, typist);
    hub.add('user', userId, typistTab2);
    hub.add('seller', sellerId, seller);

    const delivered = hub.deliver({
      type: 'typing',
      conversationId: message.conversationId,
      from: { key: `user:${userId}`, name: 'Amina' },
      audience: shopAudience,
    });

    expect(delivered).toBe(1);
    expect(typist.send).not.toHaveBeenCalled();
    expect(typistTab2.send).not.toHaveBeenCalled();
    expect(JSON.parse(seller.send.mock.calls[0][0])).toEqual({
      type: 'typing',
      conversationId: message.conversationId,
      from: { key: `user:${userId}`, name: 'Amina' },
    });
  });

  it('sends support chats to every connected admin', () => {
    const hub = new ChatHub();
    const [admin1, admin2, shopper] = [socket(), socket(), socket()];
    hub.add('admin', 'f'.repeat(24), admin1);
    hub.add('admin', 'e'.repeat(24), admin2);
    hub.add('user', userId, shopper);

    expect(
      hub.deliver({
        type: 'message',
        message,
        audience: { userId, support: true },
      }),
    ).toBe(3);
  });

  it('sends direct chats to just the two people in them', () => {
    const hub = new ChatHub();
    const adminId = 'f'.repeat(24);
    const [admin, otherAdmin, shopper] = [socket(), socket(), socket()];
    hub.add('admin', adminId, admin);
    hub.add('admin', 'e'.repeat(24), otherAdmin);
    hub.add('user', userId, shopper);

    const delivered = hub.deliver({
      type: 'message',
      message,
      audience: {
        participants: [`admin:${adminId}`, `user:${userId}`],
        support: false,
      },
    });

    expect(delivered).toBe(2);
    expect(otherAdmin.send).not.toHaveBeenCalled();
  });

  it('sends to every open socket of one person', () => {
    const hub = new ChatHub();
    const [tab1, tab2, closed, other] = [
      socket(),
      socket(),
      socket(2),
      socket(),
    ];
    hub.add('user', userId, tab1);
    hub.add('user', userId, tab2);
    hub.add('user', userId, closed);
    hub.add('seller', sellerId, other);

    expect(hub.sendTo('user', userId, { type: 'read' })).toBe(2);
    expect(tab1.send).toHaveBeenCalledWith('{"type":"read"}');
    expect(closed.send).not.toHaveBeenCalled();
    expect(other.send).not.toHaveBeenCalled();
    expect(hub.sendTo('admin', userId, {})).toBe(0);
  });

  it('combines each tab’s status: away only when every tab is', () => {
    const hub = new ChatHub();
    const [tab1, tab2] = [socket(), socket()];
    hub.add('user', userId, tab1);
    hub.add('user', userId, tab2);

    expect(hub.statusOf('user', userId)).toBe('available');
    hub.setStatus('user', userId, tab1, 'away');
    expect(hub.statusOf('user', userId)).toBe('available');
    hub.setStatus('user', userId, tab2, 'away');
    expect(hub.statusOf('user', userId)).toBe('away');
    expect(hub.connected()).toEqual([
      { key: `user:${userId}`, status: 'away' },
    ]);

    hub.remove('user', userId, tab1);
    hub.remove('user', userId, tab2);
    expect(hub.statusOf('user', userId)).toBeNull();
    expect(hub.connected()).toEqual([]);
  });

  it('skips closed sockets and forgets removed ones', () => {
    const hub = new ChatHub();
    const closing = socket(2);
    const open = socket();
    hub.add('user', userId, closing);
    hub.add('user', userId, open);
    expect(hub.size).toBe(2);

    expect(hub.deliver(shopChat)).toBe(1);
    expect(closing.send).not.toHaveBeenCalled();

    hub.remove('user', userId, closing);
    hub.remove('user', userId, open);
    expect(hub.size).toBe(0);
    expect(hub.deliver(shopChat)).toBe(0);
  });

  it('sends status changes to the sockets watching that person', () => {
    const hub = new ChatHub();
    const seller = `seller:${sellerId}`;
    const watcher = socket();
    const other = socket();
    hub.add('user', userId, watcher);
    hub.add('user', 'e'.repeat(24), other);
    hub.watch(watcher, [seller]);
    hub.watch(other, [`seller:${'f'.repeat(24)}`]);

    expect(hub.sendToWatchers(seller, { type: 'presence' })).toBe(1);
    expect(watcher.send).toHaveBeenCalledWith('{"type":"presence"}');
    expect(other.send).not.toHaveBeenCalled();

    hub.watch(watcher, []);
    expect(hub.sendToWatchers(seller, { type: 'presence' })).toBe(0);

    hub.watch(watcher, [seller]);
    hub.remove('user', userId, watcher);
    expect(hub.sendToWatchers(seller, { type: 'presence' })).toBe(0);
  });
});
