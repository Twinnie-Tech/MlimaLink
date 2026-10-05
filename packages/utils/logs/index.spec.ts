const producer = { send: vi.fn() };
const getProducer = vi.fn();

vi.mock('../kafka/index.js', () => ({ getProducer }));

const { LOGS_TOPIC, createLogEntry, sendLog } = await import('./index.js');

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
