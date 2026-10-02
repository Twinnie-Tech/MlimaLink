const producer = {
  connect: vi.fn(),
  send: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('../kafka/index.js', () => ({
  getKafka: () => ({ producer: () => producer }),
}));

const { LOGS_TOPIC, createLogEntry, disconnectLogProducer, sendLog } =
  await import('./index.js');

describe('logs', () => {
  beforeEach(async () => {
    await disconnectLogProducer();
    vi.clearAllMocks();
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

  it('publishes to the logs topic keyed by source and connects once', async () => {
    const entry = createLogEntry('warn', 'Slow query', 'api', { ms: 900 });

    expect(await sendLog(entry)).toBe(true);
    expect(await sendLog(entry)).toBe(true);

    expect(producer.connect).toHaveBeenCalledTimes(1);
    expect(producer.send).toHaveBeenCalledWith({
      topic: LOGS_TOPIC,
      messages: [{ key: 'api', value: JSON.stringify(entry) }],
    });
  });

  it('reports failure instead of throwing and retries the connection later', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    producer.connect.mockRejectedValueOnce(new Error('broker down'));
    const entry = createLogEntry('error', 'Boom', 'auth-service');

    expect(await sendLog(entry)).toBe(false);
    expect(error).toHaveBeenCalledWith(
      "Couldn't send log to Kafka: broker down",
    );

    expect(await sendLog(entry)).toBe(true);
    expect(producer.connect).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
