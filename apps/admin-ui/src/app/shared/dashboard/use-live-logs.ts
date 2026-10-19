'use client';

import { useEffect, useRef, useState } from 'react';
import { refreshAdminSession } from '../utils/admin-api';
import {
  LOGS_SESSION_EXPIRED_CODE,
  logsSocketAddress,
  parseLogsEvent,
  type LogLine,
} from '../utils/logs-api';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting';

/** Lines are handed over together at most this often, so a busy feed doesn't re-render per line. */
const FLUSH_EVERY_MS = 250;
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10_000];

/**
 * Keeps a WebSocket to logger-service open while mounted and passes new lines to
 * `onLines`. Reconnects when it drops, renewing the admin session first when it ran out.
 */
export function useLiveLogs(onLines: (lines: LogLine[]) => void): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const onLinesRef = useRef(onLines);

  useEffect(() => {
    onLinesRef.current = onLines;
  });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let failures = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let waiting: LogLine[] = [];

    const flushTimer = setInterval(() => {
      if (waiting.length === 0) return;
      const lines = waiting;
      waiting = [];
      onLinesRef.current(lines);
    }, FLUSH_EVERY_MS);

    const retry = () => {
      const delay =
        RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)];
      failures += 1;
      retryTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (stopped) return;
      logsSocketAddress().then(
        (url) => {
          if (!stopped) open(url);
        },
        () => {
          // Fetching a ticket already renewed the session if that was the problem.
          if (stopped) return;
          setStatus('reconnecting');
          retry();
        },
      );
    };

    const open = (url: string) => {
      let ready = false;
      const socket = new WebSocket(url);
      ws = socket;
      socket.onmessage = (message) => {
        const event = parseLogsEvent(message.data);
        if (!event) return;
        if (event.type === 'ready') {
          ready = true;
          failures = 0;
          setStatus('live');
          return;
        }
        waiting.push(event.log);
      };
      socket.onclose = (event) => {
        if (stopped || ws !== socket) return;
        setStatus('reconnecting');
        // Refused before it was ready usually means the access token expired too.
        const renew =
          event.code === LOGS_SESSION_EXPIRED_CODE || !ready
            ? refreshAdminSession().catch(() => undefined)
            : Promise.resolve();
        void renew.then(() => {
          if (!stopped) retry();
        });
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(flushTimer);
      ws?.close();
    };
  }, []);

  return status;
}
