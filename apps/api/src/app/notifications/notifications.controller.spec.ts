import type { AdminRequest } from '../admin.guard';
import type { SellerRequest } from '../seller.guard';
import type { UserRequest } from '../user.guard';
import {
  AdminNotificationsController,
  NotificationsController,
  SellerNotificationsController,
} from './notifications.controller';
import type { NotificationsService } from './notifications.service';

describe('notification controllers', () => {
  const service = {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  };
  const notifications = service as unknown as NotificationsService;

  beforeEach(() => vi.resetAllMocks());

  it('reads shoppers’ notifications by their user id', async () => {
    service.list.mockResolvedValue({ items: [], unread: 0 });
    const controller = new NotificationsController(notifications);

    const response = await controller.list(
      { user: { id: 'user1' } } as UserRequest,
      { status: 'unread', limit: '10' },
    );

    expect(service.list).toHaveBeenCalledWith('user1', {
      status: 'unread',
      limit: 10,
    });
    expect(response).toEqual({ success: true, data: { items: [], unread: 0 } });
  });

  it('reads sellers’ notifications by their seller id, not the shop', async () => {
    service.unreadCount.mockResolvedValue(2);
    const controller = new SellerNotificationsController(notifications);

    const response = await controller.status({
      shop: { id: 'shop1', name: 'Kicks KE' },
      sellerId: 'seller1',
    } as SellerRequest);

    expect(service.unreadCount).toHaveBeenCalledWith('seller1');
    expect(response.data).toEqual({ unread: 2 });
  });

  it('lets admins mark their own notifications as read', async () => {
    service.markRead.mockResolvedValue({ id: 'n1', status: 'read' });
    service.markAllRead.mockResolvedValue(3);
    const controller = new AdminNotificationsController(notifications);
    const req = { admin: { id: 'admin1' } } as AdminRequest;

    await controller.markRead(req, 'n1');
    const all = await controller.markAllRead(req);

    expect(service.markRead).toHaveBeenCalledWith('admin1', 'n1');
    expect(service.markAllRead).toHaveBeenCalledWith('admin1');
    expect(all.message).toBe('3 notifications marked as read.');
  });
});
