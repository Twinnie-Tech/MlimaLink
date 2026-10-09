'use client';

import { useCallback, useState } from 'react';
import { ScrollText } from 'lucide-react';
import {
  FilterSelect,
  SearchBox,
  Toolbar,
} from '../../shared/dashboard/list-controls';
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  Panel,
  PreviewNotice,
  cellClassName,
} from '../../shared/dashboard/ui';

type Level = 'info' | 'warn' | 'error';
type Service = 'api' | 'auth-service' | 'api-gateway' | 'kafka-service';

type LogEntry = {
  id: string;
  time: string;
  level: Level;
  service: Service;
  message: string;
};

/** Examples of what will stream in live; replaced by the WebSocket feed later. */
const SAMPLE: LogEntry[] = [
  {
    id: 'l1',
    time: '21:42:08',
    level: 'info',
    service: 'api-gateway',
    message: 'POST /api/auth/login/admin 200 182ms',
  },
  {
    id: 'l2',
    time: '21:41:55',
    level: 'info',
    service: 'api',
    message: 'Order ML-7Q2K9D placed at Kicks KE (2 items, $105.00)',
  },
  {
    id: 'l3',
    time: '21:40:12',
    level: 'warn',
    service: 'auth-service',
    message: 'Login throttled for 41.90.x.x after 10 attempts in a minute',
  },
  {
    id: 'l4',
    time: '21:38:47',
    level: 'info',
    service: 'kafka-service',
    message:
      'user_events: processed 24 events (product_view 18, add_to_cart 6)',
  },
  {
    id: 'l5',
    time: '21:35:03',
    level: 'error',
    service: 'api',
    message: 'ImageKit upload failed: request timed out after 30s',
  },
  {
    id: 'l6',
    time: '21:31:29',
    level: 'info',
    service: 'auth-service',
    message: 'Seller signed up: Chai Corner (KE)',
  },
  {
    id: 'l7',
    time: '21:28:16',
    level: 'warn',
    service: 'api',
    message: 'Discount code HARVEST10 rejected: usage limit reached',
  },
  {
    id: 'l8',
    time: '21:20:44',
    level: 'info',
    service: 'api-gateway',
    message: 'GET /api/admin/overview 200 96ms',
  },
  {
    id: 'l9',
    time: '21:12:02',
    level: 'error',
    service: 'kafka-service',
    message: 'Consumer lost connection to broker; reconnecting in 5s',
  },
];

const LEVEL_TONE: Record<Level, string> = {
  info: 'bg-blue-500/10 text-blue-700',
  warn: 'bg-amber-500/10 text-amber-700',
  error: 'bg-rose-500/10 text-rose-700',
};

export default function LoggersPage() {
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<Level | 'all'>('all');
  const [service, setService] = useState<Service | 'all'>('all');
  const onSearch = useCallback((value: string) => setSearch(value), []);

  const needle = search.toLowerCase();
  const shown = SAMPLE.filter(
    (entry) =>
      (level === 'all' || entry.level === level) &&
      (service === 'all' || entry.service === service) &&
      (!needle || entry.message.toLowerCase().includes(needle)),
  );

  return (
    <>
      <PageHeader
        title="Loggers"
        description="What the MlimaLink services are doing."
      />
      <PreviewNotice>
        These are example log lines. Live logs from every service will stream
        here once the real-time (WebSocket) feed is connected.
      </PreviewNotice>

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
              { value: 'api-gateway', label: 'API gateway' },
              { value: 'api', label: 'API' },
              { value: 'auth-service', label: 'Auth service' },
              { value: 'kafka-service', label: 'Kafka service' },
            ]}
          />
        </Toolbar>

        {shown.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No log lines found"
            description="Nothing matches those filters."
          />
        ) : (
          <DataTable
            label="Logs"
            columns={['Time', 'Level', 'Service', 'Message']}
            minWidth={760}
          >
            {shown.map((entry) => (
              <tr key={entry.id}>
                <td className={`${cellClassName} font-mono text-xs`}>
                  {entry.time}
                </td>
                <td className={cellClassName}>
                  <Badge tone={LEVEL_TONE[entry.level]}>
                    {entry.level.toUpperCase()}
                  </Badge>
                </td>
                <td className={`${cellClassName} whitespace-nowrap`}>
                  {entry.service}
                </td>
                <td className={`${cellClassName} font-mono text-xs`}>
                  {entry.message}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </>
  );
}
