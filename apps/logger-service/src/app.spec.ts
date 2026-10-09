import request from 'supertest';
import { verifyAccessToken } from '@org/utils/auth';
import { createApp } from './app';
import { listSources, queryLogs } from './logs/store';
import { prisma } from './prisma';

vi.mock('@org/utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@org/utils/auth')>()),
  verifyAccessToken: vi.fn(),
}));
vi.mock('./logs/store', () => ({ queryLogs: vi.fn(), listSources: vi.fn() }));
vi.mock('./prisma', () => ({ prisma: { admins: { findUnique: vi.fn() } } }));

const adminId = 'e'.repeat(24);
const findAdmin = vi.mocked(prisma.admins.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyAccessToken).mockReturnValue({
    id: adminId,
    expiresAt: Date.now() + 60_000,
  });
  findAdmin.mockResolvedValue({ id: adminId } as never);
  vi.mocked(queryLogs).mockResolvedValue([]);
  vi.mocked(listSources).mockResolvedValue(['chatting-service']);
});

describe('logger-service app', () => {
  it('answers the health check', async () => {
    const response = await request(createApp()).get('/api');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ service: 'logger-service', status: 'ok' });
  });

  it('only shows logs to signed-in admins', async () => {
    vi.mocked(verifyAccessToken).mockReturnValueOnce(null);
    await request(createApp()).get('/api/logs').expect(401);

    findAdmin.mockResolvedValueOnce(null);
    await request(createApp()).get('/api/logs').expect(401);

    expect(queryLogs).not.toHaveBeenCalled();
  });

  it('reads the admin cookie', async () => {
    await request(createApp())
      .get('/api/logs')
      .set('Cookie', 'accessToken=shopper; adminAccessToken=admin-token')
      .expect(200);

    expect(verifyAccessToken).toHaveBeenCalledWith('admin-token', 'admin');
  });

  it('passes the filters on and returns logs with their sources', async () => {
    const response = await request(createApp()).get(
      '/api/logs?level=error&source=%20chatting-service%20&q=kafka&before=2026-10-08T10:00:00.000Z&limit=20',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ logs: [], sources: ['chatting-service'] });
    expect(queryLogs).toHaveBeenCalledWith({
      level: 'error',
      source: 'chatting-service',
      search: 'kafka',
      before: new Date('2026-10-08T10:00:00.000Z'),
      limit: 20,
    });
  });

  it.each([
    ['an unknown level', 'level=fatal'],
    ['a bad date', 'before=later'],
    ['a bad limit', 'limit=lots'],
  ])('rejects %s', async (_case, query) => {
    await request(createApp()).get(`/api/logs?${query}`).expect(400);
  });
});
