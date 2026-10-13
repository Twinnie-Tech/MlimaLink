const producer = { send: vi.fn() };
const getProducer = vi.fn();
const ensureTopic = vi.fn();
const getKafka = vi.fn(() => 'kafka');

vi.mock('../kafka/index.js', () => ({ getProducer, ensureTopic, getKafka }));

const {
  LIVE_LOGS_TOPIC,
  LOGS_TOPIC,
  createLogBatcher,
  createLogEntry,
  parseLogEntry,
  sendLog,
} = await import('./index.js');

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

describe('createLogBatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    getProducer.mockResolvedValue(producer);
    ensureTopic.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  const entry = (message: string) =>
    createLogEntry('info', message, 'api-gateway');

  it('sends what collected every interval in one request, after making sure the topic exists', async () => {
    const batcher = createLogBatcher({ topic: LIVE_LOGS_TOPIC, everyMs: 500 });
    batcher.push(entry('GET /api/products 200 12ms'));
    batcher.push(entry('GET /api/shops 200 9ms'));
    expect(producer.send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    expect(ensureTopic).toHaveBeenCalledWith('kafka', LIVE_LOGS_TOPIC);
    expect(producer.send).toHaveBeenCalledTimes(1);
    const { topic, messages } = producer.send.mock.calls[0][0];
    expect(topic).toBe(LIVE_LOGS_TOPIC);
    expect(
      messages.map((m: { value: string }) => JSON.parse(m.value).message),
    ).toEqual(['GET /api/products 200 12ms', 'GET /api/shops 200 9ms']);
    expect(messages[0].key).toBe('api-gateway');

    await vi.advanceTimersByTimeAsync(500);
    expect(producer.send).toHaveBeenCalledTimes(1);
    await batcher.stop();
  });

  it('sends straight away once a full batch is waiting', async () => {
    const batcher = createLogBatcher({ everyMs: 60_000, maxBatch: 2 });
    batcher.push(entry('one'));
    batcher.push(entry('two'));
    await vi.advanceTimersByTimeAsync(0);

    expect(producer.send).toHaveBeenCalledTimes(1);
    expect(producer.send.mock.calls[0][0].topic).toBe(LOGS_TOPIC);
    await batcher.stop();
  });

  it('drops entries while Kafka is down, saying so once, then carries on', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    producer.send.mockRejectedValue(new Error('broker down'));
    const batcher = createLogBatcher({ everyMs: 100, maxBatch: 3 });

    batcher.push(entry('a'));
    await vi.advanceTimersByTimeAsync(100);
    batcher.push(entry('b'));
    await vi.advanceTimersByTimeAsync(100);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain('broker down');

    producer.send.mockReset();
    producer.send.mockResolvedValue(undefined);
    for (const message of ['c', 'd', 'e', 'f']) batcher.push(entry(message));
    await batcher.stop();
    const sent = producer.send.mock.calls.flatMap(([request]) =>
      request.messages.map(
        (m: { value: string }) => JSON.parse(m.value).message,
      ),
    );
    expect(sent).toEqual(['c', 'd', 'e', 'f']);
    expect(error).toHaveBeenCalledTimes(1);
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
