import { kafkaConfigFromEnv } from './index.js';

describe('kafkaConfigFromEnv', () => {
  it('connects to a local broker without auth by default', () => {
    expect(kafkaConfigFromEnv({})).toEqual({
      clientId: 'mlimalink',
      brokers: ['localhost:9092'],
      ssl: false,
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
      sasl: { mechanism: 'plain', username: 'api-key', password: 'api-secret' },
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
