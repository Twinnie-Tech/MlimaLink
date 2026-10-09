import { createLogEntry, sendLog, type LogLevel } from '@org/utils/logs';

export const SERVICE_NAME = 'chatting-service';

/** Writes to the console and publishes to the logs topic for logger-service. */
export function log(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const write = level === 'debug' ? console.log : console[level];
  write(message);
  void sendLog(createLogEntry(level, message, SERVICE_NAME, meta));
}
