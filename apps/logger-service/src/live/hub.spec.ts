import { LiveLogHub, type LiveLog, type LiveSocket } from './hub';

const socket = (overrides: Partial<LiveSocket> = {}) => ({
  readyState: 1,
  bufferedAmount: 0,
  send: vi.fn(),
  ...overrides,
});

const log: LiveLog = {
  id: 'live_logs-0-7',
  level: 'info',
  message: 'GET /api/products 200 12ms · guest',
  source: 'api-gateway',
  timestamp: '2026-10-13T10:00:00.000Z',
};

describe('LiveLogHub', () => {
  it('sends each line to every open admin socket', () => {
    const hub = new LiveLogHub();
    const first = socket();
    const second = socket();
    hub.add(first);
    hub.add(second);

    expect(hub.broadcast(log)).toBe(2);
    const data = JSON.stringify({ type: 'log', log });
    expect(first.send).toHaveBeenCalledWith(data);
    expect(second.send).toHaveBeenCalledWith(data);
  });

  it('skips closed sockets, ones that can’t keep up, and removed ones', () => {
    const hub = new LiveLogHub();
    const closed = socket({ readyState: 3 });
    const slow = socket({ bufferedAmount: 2 * 1024 * 1024 });
    const gone = socket();
    hub.add(closed);
    hub.add(slow);
    hub.add(gone);
    hub.remove(gone);

    expect(hub.size).toBe(2);
    expect(hub.broadcast(log)).toBe(0);
    expect(closed.send).not.toHaveBeenCalled();
    expect(slow.send).not.toHaveBeenCalled();
    expect(gone.send).not.toHaveBeenCalled();
  });
});
