import {
  LocalPresenceBus,
  RedisPresenceBus,
  parsePresenceUpdate,
  type PresenceUpdate,
} from './presence-bus';

const update: PresenceUpdate = {
  key: `user:${'a'.repeat(24)}`,
  status: 'away',
  lastSeenAt: '2026-10-12T16:00:00.000Z',
};

function fakeSubscriber() {
  let onMessage: ((channel: string, raw: string) => void) | undefined;
  return {
    subscribe: vi.fn(async () => 1),
    on: vi.fn((event: string, handler: typeof onMessage) => {
      if (event === 'message') onMessage = handler;
    }),
    quit: vi.fn(async () => 'OK'),
    disconnect: vi.fn(),
    deliver: (channel: string, raw: string) => onMessage?.(channel, raw),
  };
}

describe('parsePresenceUpdate', () => {
  it('accepts well-formed updates only', () => {
    expect(parsePresenceUpdate(JSON.stringify(update))).toEqual(update);
    expect(
      parsePresenceUpdate(JSON.stringify({ ...update, status: 'dnd' })),
    ).toEqual({ ...update, status: 'dnd' });
    expect(
      parsePresenceUpdate(JSON.stringify({ ...update, status: 'napping' })),
    ).toBeNull();
    expect(parsePresenceUpdate('nope')).toBeNull();
  });

  it('keeps a valid manual status and drops anything else', () => {
    const manual = { ...update, status: 'busy', manual: 'busy' };
    expect(parsePresenceUpdate(JSON.stringify(manual))).toEqual(manual);
    expect(
      parsePresenceUpdate(JSON.stringify({ ...update, manual: null })),
    ).toEqual({ ...update, manual: null });
    expect(
      parsePresenceUpdate(JSON.stringify({ ...update, manual: 'available' })),
    ).toEqual(update);
  });
});

describe('LocalPresenceBus', () => {
  it('passes updates to subscribers until they stop listening', async () => {
    const bus = new LocalPresenceBus();
    const heard = vi.fn();
    const stop = bus.subscribe(heard);

    await bus.publish(update);
    stop();
    await bus.publish(update);

    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith(update);
  });
});

describe('RedisPresenceBus', () => {
  it('publishes to Redis and hears updates from every instance', async () => {
    const publisher = { publish: vi.fn(async () => 1) };
    const subscriber = fakeSubscriber();
    const bus = new RedisPresenceBus(publisher, subscriber as never);
    const heard = vi.fn();
    bus.subscribe(heard);

    await bus.publish(update);
    expect(publisher.publish).toHaveBeenCalledWith(
      'chat:presence-updates',
      JSON.stringify(update),
    );
    expect(subscriber.subscribe).toHaveBeenCalledWith('chat:presence-updates');
    expect(heard).not.toHaveBeenCalled();

    subscriber.deliver('chat:presence-updates', JSON.stringify(update));
    subscriber.deliver('other', JSON.stringify(update));
    subscriber.deliver('chat:presence-updates', 'garbage');
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('still tells people here when Redis is down', async () => {
    const publisher = {
      publish: vi.fn(async () => Promise.reject(new Error('down'))),
    };
    const bus = new RedisPresenceBus(publisher, fakeSubscriber() as never);
    const heard = vi.fn();
    bus.subscribe(heard);

    await bus.publish(update);

    expect(heard).toHaveBeenCalledWith(update);
  });
});
