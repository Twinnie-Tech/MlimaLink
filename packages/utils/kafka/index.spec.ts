const producer = { connect: vi.fn(), disconnect: vi.fn() };

vi.mock('kafkajs', () => ({
  Kafka: class {
    producer = () => producer;
  },
  Partitioners: { DefaultPartitioner: () => () => 0 },
}));

const { disconnectProducer, getProducer, kafkaConfigFromEnv } =
  await import('./index.js');

describe('kafkaConfigFromEnv', () => {
  it('connects to a local broker without auth by default', () => {
    expect(kafkaConfigFromEnv({})).toEqual({
      clientId: 'mlimalink',
      brokers: ['localhost:9092'],
      ssl: false,
      connectionTimeout: 10_000,
    });
  });

  it('uses SASL over TLS when credentials are set', () => {
    expect(
      kafkaConfigFromEnv({
        KAFKA_BROKERS: ' broker-1:9092, broker-2:9092 ,',
        KAFKA_CLIENT_ID: 'kafka-service',
        KAFKA_USERNAME: 'api-key',
        KAFKA_PASSWORD: 'api-secret',
      }),
    ).toEqual({
      clientId: 'kafka-service',
      brokers: ['broker-1:9092', 'broker-2:9092'],
      ssl: true,
      connectionTimeout: 10_000,
      sasl: { mechanism: 'plain', username: 'api-key', password: 'api-secret' },
    });
  });

  it('accepts Confluent Cloud’s KAFKA_API_KEY and KAFKA_API_SECRET', () => {
    expect(
      kafkaConfigFromEnv({
        KAFKA_API_KEY: 'confluent-key',
        KAFKA_API_SECRET: 'confluent-secret',
      }),
    ).toMatchObject({
      ssl: true,
      sasl: {
        mechanism: 'plain',
        username: 'confluent-key',
        password: 'confluent-secret',
      },
    });
  });

  it('lets KAFKA_SSL and KAFKA_SASL_MECHANISM override the defaults', () => {
    expect(
      kafkaConfigFromEnv({
        KAFKA_USERNAME: 'user',
        KAFKA_PASSWORD: 'pass',
        KAFKA_SSL: 'false',
        KAFKA_SASL_MECHANISM: 'SCRAM-SHA-512',
      }),
    ).toMatchObject({
      ssl: false,
      sasl: { mechanism: 'scram-sha-512' },
    });
  });

  it('leaves SASL out when only half the credentials are set', () => {
    expect(kafkaConfigFromEnv({ KAFKA_USERNAME: 'user' })).not.toHaveProperty(
      'sasl',
    );
  });

  it('rejects an unknown SASL mechanism', () => {
    expect(() =>
      kafkaConfigFromEnv({ KAFKA_SASL_MECHANISM: 'kerberos' }),
    ).toThrow('KAFKA_SASL_MECHANISM must be one of');
  });
});

describe('getProducer', () => {
  beforeEach(async () => {
    await disconnectProducer();
    vi.clearAllMocks();
  });

  it('connects once and shares the producer', async () => {
    const [first, second] = await Promise.all([getProducer(), getProducer()]);

    expect(first).toBe(producer);
    expect(second).toBe(producer);
    expect(producer.connect).toHaveBeenCalledTimes(1);
  });

  it('tries again after a failed connection', async () => {
    producer.connect.mockRejectedValueOnce(new Error('broker down'));

    await expect(getProducer()).rejects.toThrow('broker down');
    await expect(getProducer()).resolves.toBe(producer);
    expect(producer.connect).toHaveBeenCalledTimes(2);
  });

  it('disconnects on shutdown', async () => {
    await getProducer();
    await disconnectProducer();

    expect(producer.disconnect).toHaveBeenCalledTimes(1);
  });
});
