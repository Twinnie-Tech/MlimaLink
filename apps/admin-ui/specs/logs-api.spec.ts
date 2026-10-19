import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logsSocketAddress } from '../src/app/shared/utils/logs-api';

const fetchMock = vi.fn();
const respond = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('logsSocketAddress', () => {
  it('relies on the cookie for this site’s own socket', async () => {
    await expect(logsSocketAddress('')).resolves.toBe(
      `ws://${window.location.host}/api/logs/ws`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds a ticket for a socket on another site', async () => {
    fetchMock.mockResolvedValue(respond(200, { ticket: 'a.b+c' }));

    await expect(
      logsSocketAddress('wss://api.example/api/logs/ws'),
    ).resolves.toBe('wss://api.example/api/logs/ws?ticket=a.b%2Bc');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/logs/socket-ticket',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('renews the admin session once when the ticket is refused', async () => {
    fetchMock
      .mockResolvedValueOnce(respond(401, { success: false }))
      .mockResolvedValueOnce(respond(200, { success: true, message: 'ok' }))
      .mockResolvedValueOnce(respond(200, { ticket: 't' }));

    await expect(
      logsSocketAddress('wss://api.example/api/logs/ws'),
    ).resolves.toBe('wss://api.example/api/logs/ws?ticket=t');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
