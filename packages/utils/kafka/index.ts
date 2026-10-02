import { Kafka, type KafkaConfig, type SASLOptions } from 'kafkajs';

type Env = Record<string, string | undefined>;

const SASL_MECHANISMS = ['plain', 'scram-sha-256', 'scram-sha-512'] as const;

/**
 * Kafka connection settings from the environment:
 * - KAFKA_BROKERS: comma-separated host:port list, e.g. "pkc-xxxx.confluent.cloud:9092"
 * - KAFKA_CLIENT_ID: name this service shows to the brokers
 * - KAFKA_USERNAME / KAFKA_PASSWORD: SASL credentials (an API key and secret on Confluent Cloud)
 * - KAFKA_SSL: "true" to connect over TLS; defaults to on whenever credentials are set
 * - KAFKA_SASL_MECHANISM: "plain" (default), "scram-sha-256" or "scram-sha-512"
 */
export function kafkaConfigFromEnv(env: Env = process.env): KafkaConfig {
  const brokers = (env.KAFKA_BROKERS ?? 'localhost:9092')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);
  const clientId = env.KAFKA_CLIENT_ID?.trim() || 'mlimalink';
  const username = env.KAFKA_USERNAME?.trim();
  const password = env.KAFKA_PASSWORD;
  const hasCredentials = Boolean(username && password);
  const ssl = env.KAFKA_SSL ? env.KAFKA_SSL === 'true' : hasCredentials;

  const mechanism = (env.KAFKA_SASL_MECHANISM ?? 'plain').toLowerCase();
  if (!SASL_MECHANISMS.includes(mechanism as never)) {
    throw new Error(
      `KAFKA_SASL_MECHANISM must be one of ${SASL_MECHANISMS.join(', ')}.`,
    );
  }

  return {
    clientId,
    brokers,
    ssl,
    ...(hasCredentials && {
      sasl: {
        mechanism,
        username,
        password,
      } as SASLOptions,
    }),
  };
}

let client: Kafka | undefined;

/**
 * The shared Kafka client. Created on first use, after the service has loaded .env;
 * creating it doesn't open a connection until a producer or consumer connects.
 */
export function getKafka(): Kafka {
  client ??= new Kafka(kafkaConfigFromEnv());
  return client;
}
