import { ChatHub, type ChatSocket } from './hub';
import type { ChatEnvelope } from './protocol';

const socket = (readyState = 1) => ({
  readyState,
  send: vi.fn<ChatSocket['send']>(),
});

const userId = 'a'.repeat(24);
const sellerId = 'b'.repeat(24);
const message = {
  id: 'd'.repeat(24),
  conversationId: 'c'.repeat(24),
  senderRole: 'user' as const,
  senderId: userId,
  senderName: 'Amina',
  body: 'Hello',
  attachments: [],
  createdAt: '2026-10-08T09:30:00.000Z',
};
const shopChat: ChatEnvelope = {
  message,
  audience: { userId, sellerId, support: false },
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

  it('sends support chats to every connected admin', () => {
    const hub = new ChatHub();
    const [admin1, admin2, shopper] = [socket(), socket(), socket()];
    hub.add('admin', 'f'.repeat(24), admin1);
    hub.add('admin', 'e'.repeat(24), admin2);
    hub.add('user', userId, shopper);

    expect(hub.deliver({ message, audience: { userId, support: true } })).toBe(
      3,
    );
  });

  it('sends direct chats to just the two people in them', () => {
    const hub = new ChatHub();
    const adminId = 'f'.repeat(24);
    const [admin, otherAdmin, shopper] = [socket(), socket(), socket()];
    hub.add('admin', adminId, admin);
    hub.add('admin', 'e'.repeat(24), otherAdmin);
    hub.add('user', userId, shopper);

    const delivered = hub.deliver({
      message,
      audience: {
        participants: [`admin:${adminId}`, `user:${userId}`],
        support: false,
      },
    });

    expect(delivered).toBe(2);
    expect(otherAdmin.send).not.toHaveBeenCalled();
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
});
