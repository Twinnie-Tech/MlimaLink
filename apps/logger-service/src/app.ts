import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { readAccessToken, verifyAccessToken } from '@org/utils/auth';
import { isLogLevel } from '@org/utils/logs';
import { listSources, queryLogs, type LogQuery } from './logs/store';
import { prisma } from './prisma';

const MAX_FILTER_LENGTH = 200;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Logs can hold anything a service wrote, so only signed-in admins may read them. */
async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const verified = verifyAccessToken(
    readAccessToken(req.headers, 'admin'),
    'admin',
  );
  const admin =
    verified &&
    (await prisma.admins.findUnique({
      where: { id: verified.id },
      select: { id: true },
    }));
  if (!admin) {
    // admin-ui refreshes the session when it sees this 401.
    throw new HttpError(401, 'Please log in as an admin to continue.');
  }
  next();
}

const text = (value: unknown) =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, MAX_FILTER_LENGTH)
    : undefined;

function parseQuery(query: Request['query']): LogQuery {
  const { level, source, q, before, limit } = query;
  if (level !== undefined && !isLogLevel(level)) {
    throw new HttpError(400, 'level must be debug, info, warn or error.');
  }
  const beforeDate = typeof before === 'string' ? new Date(before) : undefined;
  if (before !== undefined && Number.isNaN(beforeDate?.getTime())) {
    throw new HttpError(400, 'before must be a date.');
  }
  const pageSize = limit === undefined ? undefined : Number(limit);
  if (pageSize !== undefined && !Number.isFinite(pageSize)) {
    throw new HttpError(400, 'limit must be a number.');
  }
  return {
    ...(level && { level }),
    ...(text(source) && { source: text(source) }),
    ...(text(q) && { search: text(q) }),
    ...(beforeDate && { before: beforeDate }),
    ...(pageSize !== undefined && { limit: pageSize }),
  };
}

const handleErrors: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ message: 'Something went wrong.' });
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api', (_req, res) => {
    res.send({ service: 'logger-service', status: 'ok' });
  });

  /** ?level=&source=&q=&before=&limit= — newest first; pass the last timestamp as `before` for the next page. */
  app.get('/api/logs', requireAdmin, async (req, res) => {
    const query = parseQuery(req.query);
    const [logs, sources] = await Promise.all([
      queryLogs(query),
      listSources(),
    ]);
    res.json({ logs, sources });
  });

  app.use(handleErrors);
  return app;
}
