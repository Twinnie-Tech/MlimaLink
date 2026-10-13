'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ScrollText } from 'lucide-react';
import {
  FilterSelect,
  SearchBox,
  Toolbar,
} from '../../shared/dashboard/list-controls';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Panel,
  cellClassName,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';
import {
  useLiveLogs,
  type LiveStatus,
} from '../../shared/dashboard/use-live-logs';
import {
  LOGS_KEY,
  getRecentLogs,
  mergeLogs,
  type LogLevel,
  type LogLine,
} from '../../shared/utils/logs-api';

/** Lines kept on screen; older ones fall off the top. */
const MAX_LINES = 1000;
/** Within this many pixels of the bottom counts as following the newest lines. */
const FOLLOW_SLACK_PX = 48;

const LEVEL_TONE: Record<LogLevel, string> = {
  debug: 'bg-neutral-500/10 text-neutral-600',
  info: 'bg-blue-500/10 text-blue-700',
  warn: 'bg-amber-500/10 text-amber-700',
  error: 'bg-rose-500/10 text-rose-700',
};

const SERVICE_LABELS: Record<string, string> = {
  'api-gateway': 'API gateway',
  api: 'API',
  'auth-service': 'Auth service',
  'kafka-service': 'Kafka service',
  'chatting-service': 'Chat service',
  'logger-service': 'Logger service',
};

const STATUS_TEXT: Record<LiveStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour12: false });

export default function LoggersPage() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const [following, setFollowing] = useState(true);

  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<LogLevel | 'all'>('all');
  const [service, setService] = useState<string>('all');
  const onSearch = useCallback((value: string) => setSearch(value), []);

  const history = useQuery({
    queryKey: LOGS_KEY,
    queryFn: getRecentLogs,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // History arrives newest first; live lines that came in before it stay.
  const [seededFrom, setSeededFrom] = useState<LogLine[] | undefined>();
  if (history.data && history.data.logs !== seededFrom) {
    setSeededFrom(history.data.logs);
    setLogs((current) => mergeLogs(current, history.data.logs, MAX_LINES));
  }

  const status = useLiveLogs(
    useCallback(
      (lines: LogLine[]) =>
        setLogs((current) => mergeLogs(current, lines, MAX_LINES)),
      [],
    ),
  );

  const filteredLogs = useMemo(() => {
    const needle = search.toLowerCase();
    return logs.filter(
      (line) =>
        (level === 'all' || line.level === level) &&
        (service === 'all' || line.source === service) &&
        (!needle || line.message.toLowerCase().includes(needle)),
    );
  }, [logs, level, service, search]);

  const services = useMemo(
    () =>
      [
        ...new Set([
          ...Object.keys(SERVICE_LABELS),
          ...(history.data?.sources ?? []),
          ...logs.map((line) => line.source),
        ]),
      ].sort((a, b) =>
        (SERVICE_LABELS[a] ?? a).localeCompare(SERVICE_LABELS[b] ?? b),
      ),
    [history.data?.sources, logs],
  );

  // Keeps the newest line in view while following; scrolling up stops following.
  useLayoutEffect(() => {
    const container = logContainerRef.current;
    if (container && followRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [filteredLogs]);

  useEffect(() => {
    followRef.current = following;
  }, [following]);

  const onScroll = () => {
    const container = logContainerRef.current;
    if (!container) return;
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      FOLLOW_SLACK_PX;
    followRef.current = atBottom;
    if (atBottom !== following) setFollowing(atBottom);
  };

  const jumpToLatest = () => {
    const container = logContainerRef.current;
    followRef.current = true;
    setFollowing(true);
    if (container) container.scrollTop = container.scrollHeight;
  };

  return (
    <>
      <PageHeader
        title="Loggers"
        description="What the MlimaLink services are doing, as it happens: every request through the API gateway, and what each service logs."
        actions={
          <span
            role="status"
            className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700"
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${
                status === 'live'
                  ? 'animate-pulse bg-emerald-500'
                  : 'bg-amber-500'
              }`}
            />
            {STATUS_TEXT[status]}
          </span>
        }
      />

      <Panel>
        <Toolbar>
          <SearchBox
            label="Search logs"
            placeholder="Search messages"
            onSearch={onSearch}
          />
          <FilterSelect
            label="Level"
            value={level}
            onChange={setLevel}
            options={[
              { value: 'all', label: 'All levels' },
              { value: 'debug', label: 'Debug' },
              { value: 'info', label: 'Info' },
              { value: 'warn', label: 'Warning' },
              { value: 'error', label: 'Error' },
            ]}
          />
          <FilterSelect
            label="Service"
            value={service}
            onChange={setService}
            options={[
              { value: 'all', label: 'All services' },
              ...services.map((source) => ({
                value: source,
                label: SERVICE_LABELS[source] ?? source,
              })),
            ]}
          />
          <button
            type="button"
            onClick={() => setLogs([])}
            disabled={logs.length === 0}
            className={secondaryButtonClassName}
          >
            Clear
          </button>
        </Toolbar>

        {history.isError && (
          <ErrorNotice
            message={`Couldn’t load recent logs: ${history.error.message} New lines still appear below.`}
          />
        )}

        <div className="relative">
          <div
            ref={logContainerRef}
            onScroll={onScroll}
            className="max-h-[calc(100dvh-20rem)] min-h-[320px] overflow-y-auto"
          >
            {filteredLogs.length === 0 ? (
              <EmptyState
                icon={ScrollText}
                title={
                  logs.length === 0
                    ? 'Waiting for activity'
                    : 'No log lines found'
                }
                description={
                  logs.length === 0
                    ? history.isPending
                      ? 'Loading recent logs…'
                      : 'New lines appear here the moment any service logs something.'
                    : 'Nothing matches those filters.'
                }
              />
            ) : (
              <DataTable
                label="Logs"
                columns={['Time', 'Level', 'Service', 'Message']}
                minWidth={760}
              >
                {filteredLogs.map((line) => (
                  <tr key={line.id}>
                    <td
                      className={`${cellClassName} font-mono text-xs whitespace-nowrap`}
                      title={new Date(line.timestamp).toLocaleString()}
                    >
                      {timeOf(line.timestamp)}
                    </td>
                    <td className={cellClassName}>
                      <Badge tone={LEVEL_TONE[line.level]}>
                        {line.level.toUpperCase()}
                      </Badge>
                    </td>
                    <td className={`${cellClassName} whitespace-nowrap`}>
                      {line.source}
                    </td>
                    <td
                      className={`${cellClassName} font-mono text-xs break-all`}
                    >
                      {line.message}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>
          {!following && filteredLogs.length > 0 && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute right-4 bottom-4 inline-flex items-center gap-1 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
            >
              <ArrowDown aria-hidden className="h-3.5 w-3.5" />
              Jump to latest
            </button>
          )}
        </div>
      </Panel>
    </>
  );
}
