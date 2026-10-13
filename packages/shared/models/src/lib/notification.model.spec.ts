import {
  NOTIFICATIONS_MAX_PAGE_SIZE,
  NOTIFICATIONS_PAGE_SIZE,
  notificationTime,
  parseNotificationQuery,
} from './notification.model.js';

describe('parseNotificationQuery', () => {
  it('reads the status, limit and cursor', () => {
    expect(
      parseNotificationQuery({
        status: 'unread',
        limit: '10',
        before: '2026-10-13T09:00:00.000Z',
      }),
    ).toEqual({
      status: 'unread',
      limit: 10,
      before: new Date('2026-10-13T09:00:00.000Z'),
    });
  });

  it('ignores values that make no sense and caps the page size', () => {
    expect(
      parseNotificationQuery({
        status: 'archived',
        limit: '-3',
        before: 'soon',
      }),
    ).toEqual({ limit: NOTIFICATIONS_PAGE_SIZE });
    expect(parseNotificationQuery({ limit: '5000' }).limit).toBe(
      NOTIFICATIONS_MAX_PAGE_SIZE,
    );
  });
});

describe('notificationTime', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('says how long ago, then falls back to the date', () => {
    expect(notificationTime(ago(20_000), now)).toBe('Just now');
    expect(notificationTime(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(notificationTime(ago(3 * 3_600_000), now)).toBe('3 h ago');
    expect(notificationTime(ago(30 * 3_600_000), now)).toBe('Yesterday');
    expect(notificationTime('2026-10-01T08:00:00Z', now)).toBe('1 Oct 2026');
  });
});
