import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { Admin, AdminOrder } from '@org/models';
import { QueryProvider } from '../src/app/shared/providers/query-provider';

type Reply = { status: number; body: unknown };

export const fetchMock = vi.fn();
const replies = new Map<string, Reply[]>();

/** Queues a reply for `METHOD /api/path`. Unqueued requests answer 401, like a signed-out browser. */
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
    const { status, body } = replies.get(route)?.shift() ?? {
      status: 401,
      body: { success: false, error: 'Unauthorized! Please log in.' },
    };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
  vi.stubGlobal('fetch', fetchMock);
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

export const admin: Admin = {
  id: 'a1',
  name: 'Wanjiku Admin',
  email: 'admin@mlimalink.com',
  lastLoginAt: null,
  createdAt: '2026-09-01T10:00:00.000Z',
};

export const order: AdminOrder = {
  id: 'o1',
  number: 'ML-7Q2K9D',
  shopId: 'shop1',
  shopName: 'Kicks KE',
  buyerName: 'Amina',
  buyerEmail: 'amina@example.com',
  status: 'delivered',
  itemCount: 2,
  goods: 100,
  deliveryFee: 5,
  total: 105,
  platformFee: 10,
  sellerEarnings: 90,
  createdAt: '2026-10-03T10:00:00.000Z',
};

export const page = <T,>(items: T[], total = items.length) => ({
  items,
  total,
  page: 1,
  pageSize: 20,
  totalPages: Math.max(Math.ceil(total / 20), 1),
});
