import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryProvider } from '../src/app/shared/providers/query-provider';
import type { Seller, Shop } from '../src/app/shared/utils/seller-api';

type Reply = { status: number; body: unknown };

export const fetchMock = vi.fn();
const replies = new Map<string, Reply[]>();
const SIDEBAR_COUNTS: Record<string, unknown> = {
  'GET /api/chat/unseen?as=seller': { total: 0 },
  'GET /api/seller/notifications/status': {
    success: true,
    data: { unread: 0 },
  },
};

/**
 * Queues a reply for `METHOD /api/auth/path`. Unqueued requests answer 401, like a
 * signed-out browser, except the sidebar's unseen chat and unread notification
 * counts, which answer zero.
 */
export function reply(route: string, status: number, body: unknown) {
  const queue = replies.get(route) ?? [];
  queue.push({ status, body });
  replies.set(route, queue);
}

export function installFetchMock() {
  replies.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const route = `${init?.method ?? 'GET'} ${url}`;
    const { status, body } =
      replies.get(route)?.shift() ??
      (route in SIDEBAR_COUNTS
        ? { status: 200, body: SIDEBAR_COUNTS[route] }
        : {
            status: 401,
            body: { success: false, error: 'Unauthorized! Please log in.' },
          });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('WebSocket', IdleWebSocket);
}

/** A chat connection that never opens, so the dashboard's live chat stays quiet. */
export class IdleWebSocket {
  static readonly OPEN = 1;
  readyState = 0;
  onopen = null;
  onmessage = null;
  onclose = null;
  send = vi.fn();
  close = vi.fn();
}

/** Body of the last request sent to `route`. */
export function sentBody(route: string) {
  const call = fetchMock.mock.calls.findLast(
    ([url, init]) => `${init?.method ?? 'GET'} ${url}` === route,
  );
  if (!call) throw new Error(`No request to ${route}`);
  return JSON.parse((call[1] as RequestInit).body as string);
}

export function renderPage(ui: React.ReactElement) {
  return render(<QueryProvider>{ui}</QueryProvider>);
}

export function fill(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

export const shop: Shop = {
  id: 'shop1',
  name: 'Mlima Fresh',
  bio: 'Organic produce from Limuru.',
  category: 'Fruits & Vegetables',
  address: 'Moi Avenue, Nairobi',
  opening_hours: [
    { day: 'mon', open: '08:00', close: '18:00' },
    { day: 'tue', open: '08:00', close: '18:00' },
    { day: 'sat', open: '09:00', close: '13:00' },
  ],
  website: null,
  coverBanner: null,
  socialLinks: [],
  ratings: 0,
  createdAt: '2026-09-28T10:00:00.000Z',
};

export const seller: Seller = {
  id: 's1',
  name: 'Amina Otieno',
  email: 'amina@example.com',
  phone_number: '+254712345678',
  country: 'KE',
  stripeId: null,
  createdAt: '2026-09-28T10:00:00.000Z',
  shop: null,
};
