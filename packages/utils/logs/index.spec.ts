const producer = { send: vi.fn() };
const getProducer = vi.fn();

vi.mock('../kafka/index.js', () => ({ getProducer }));

const { LOGS_TOPIC, createLogEntry, parseLogEntry, sendLog } =
  await import('./index.js');

describe('logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProducer.mockResolvedValue(producer);
  });

  it('stamps entries with the time and leaves out empty meta', () => {
    const entry = createLogEntry('info', 'Order placed', 'api');
    expect(entry).toEqual({
      level: 'info',
      message: 'Order placed',
      source: 'api',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('publishes to the logs topic keyed by source', async () => {
    const entry = createLogEntry('warn', 'Slow query', 'api', { ms: 900 });

    expect(await sendLog(entry)).toBe(true);
    expect(producer.send).toHaveBeenCalledWith({
      topic: LOGS_TOPIC,
      messages: [{ key: 'api', value: JSON.stringify(entry) }],
    });
  });

  it('reports failure instead of throwing', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    getProducer.mockRejectedValueOnce(new Error('broker down'));

    expect(await sendLog(createLogEntry('error', 'Boom', 'auth-service'))).toBe(
      false,
    );
    expect(error).toHaveBeenCalledWith(
      "Couldn't send log to Kafka: broker down",
    );
    error.mockRestore();
  });
});

describe('parseLogEntry', () => {
  const entry = {
    level: 'error',
    message: 'Payment failed',
    source: 'api',
    timestamp: '2026-10-08T09:30:00.000Z',
    meta: { orderId: 'o1' },
  };

  it('reads a valid entry', () => {
    expect(parseLogEntry(JSON.stringify(entry))).toEqual(entry);
  });

  it('drops meta that isn’t an object and trims the source', () => {
    expect(
      parseLogEntry(JSON.stringify({ ...entry, source: ' api ', meta: [1] })),
    ).toEqual({ ...entry, meta: undefined });
  });

  it('cuts overlong messages short', () => {
    const parsed = parseLogEntry(
      JSON.stringify({ ...entry, message: 'x'.repeat(20_000) }),
    );
    expect(parsed?.message).toHaveLength(10_000);
  });

  it.each([
    ['empty input', undefined],
    ['invalid JSON', 'not json'],
    ['an unknown level', JSON.stringify({ ...entry, level: 'fatal' })],
    ['a missing source', JSON.stringify({ ...entry, source: ' ' })],
    ['a bad timestamp', JSON.stringify({ ...entry, timestamp: 'yesterday' })],
    ['a non-string message', JSON.stringify({ ...entry, message: 42 })],
  ])('rejects %s', (_case, raw) => {
    expect(parseLogEntry(raw)).toBeNull();
  });
});
