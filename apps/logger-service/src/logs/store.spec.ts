import { prisma } from '../prisma';
import {
  deleteOldLogs,
  listSources,
  queryLogs,
  retentionDays,
  saveLogs,
} from './store';

vi.mock('../prisma', () => ({
  prisma: {
    platform_logs: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const logs = vi.mocked(prisma.platform_logs, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('retentionDays', () => {
  it('uses LOG_RETENTION_DAYS when it’s a positive number', () => {
    expect(retentionDays('30')).toBe(30);
    expect(retentionDays(undefined)).toBe(7);
    expect(retentionDays('0')).toBe(7);
    expect(retentionDays('soon')).toBe(7);
  });
});

describe('saveLogs', () => {
  it('stores a batch in one write', async () => {
    await saveLogs([
      {
        level: 'warn',
        message: 'Slow',
        source: 'api',
        timestamp: '2026-10-08T09:30:00.000Z',
        meta: { ms: 900 },
      },
    ]);

    expect(logs.createMany).toHaveBeenCalledWith({
      data: [
        {
          level: 'warn',
          message: 'Slow',
          source: 'api',
          meta: { ms: 900 },
          timestamp: new Date('2026-10-08T09:30:00.000Z'),
        },
      ],
    });
  });

  it('skips empty batches', async () => {
    await saveLogs([]);
    expect(logs.createMany).not.toHaveBeenCalled();
  });
});

describe('queryLogs', () => {
  it('filters newest first and caps the page size', async () => {
    logs.findMany.mockResolvedValue([
      {
        id: '1',
        level: 'error',
        message: 'Kafka down',
        source: 'api',
        meta: null,
        timestamp: new Date('2026-10-08T09:30:00.000Z'),
      },
    ] as never);
    const before = new Date('2026-10-08T10:00:00.000Z');

    const result = await queryLogs({
      level: 'error',
      source: 'api',
      search: 'kafka',
      before,
      limit: 5000,
    });

    expect(logs.findMany).toHaveBeenCalledWith({
      where: {
        level: 'error',
        source: 'api',
        message: { contains: 'kafka', mode: 'insensitive' },
        timestamp: { lt: before },
      },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });
    expect(result).toEqual([
      {
        id: '1',
        level: 'error',
        message: 'Kafka down',
        source: 'api',
        timestamp: '2026-10-08T09:30:00.000Z',
      },
    ]);
  });

  it('defaults to the latest 50', async () => {
    logs.findMany.mockResolvedValue([]);
    await queryLogs();
    expect(logs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 50 }),
    );
  });
});

describe('listSources', () => {
  it('returns each source once, sorted', async () => {
    logs.findMany.mockResolvedValue([
      { source: 'chatting-service' },
      { source: 'api' },
    ] as never);

    expect(await listSources()).toEqual(['api', 'chatting-service']);
  });
});

describe('deleteOldLogs', () => {
  it('deletes entries older than the retention period', async () => {
    logs.deleteMany.mockResolvedValue({ count: 3 });
    const now = Date.parse('2026-10-08T00:00:00.000Z');

    expect(await deleteOldLogs(7, now)).toBe(3);
    expect(logs.deleteMany).toHaveBeenCalledWith({
      where: { timestamp: { lt: new Date('2026-10-01T00:00:00.000Z') } },
    });
  });
});
