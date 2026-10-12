import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { isAccountType } from '@org/utils/auth';
import { parseImageUpload, uploadChatImage } from './chat/attachments';
import {
  listConversations,
  listMessages,
  openConversation,
  sendMessage,
} from './chat/conversations';
import { authenticate, type Participant } from './chat/participants';
import { participantKey } from './chat/protocol';
import { uploadLimiter } from './chat/rate-limit';
import { HttpError } from './http-error';

type ChatResponse = Response<unknown, { participant: Participant }>;

/**
 * `?as=user|seller|admin` says which account to use: one browser can be signed in to
 * user-ui, seller-ui and admin-ui at once, each with its own cookie.
 */
async function requireParticipant(
  req: Request,
  res: ChatResponse,
  next: NextFunction,
) {
  const account = req.query.as;
  if (!isAccountType(account)) {
    throw new HttpError(400, 'Add ?as=user, ?as=seller or ?as=admin.');
  }
  const participant = await authenticate(account, req.headers);
  if (!participant) {
    // The UIs refresh the session when they see this 401.
    throw new HttpError(401, 'Unauthorized! Token expired or invalid.');
  }
  res.locals.participant = participant;
  next();
}

function parseBefore(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  const date = typeof value === 'string' ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'before must be a date.');
  }
  return date;
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
  const type = (error as { type?: unknown })?.type;
  if (type === 'entity.parse.failed') {
    res.status(400).json({ message: 'The request body must be JSON.' });
    return;
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ message: 'That request is too large.' });
    return;
  }
  console.error(error);
  res.status(500).json({ message: 'Something went wrong.' });
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api', (_req, res) => {
    res.send({ service: 'chatting-service', status: 'ok' });
  });

  const chat = express.Router();
  chat.use(requireParticipant);

  // Photos arrive as base64 data URLs, so only this route takes large bodies.
  chat.post(
    '/attachments',
    express.json({ limit: '5mb' }),
    async (req, res: ChatResponse) => {
      const { participant } = res.locals;
      const image = parseImageUpload(req.body);
      if (!image) {
        throw new HttpError(
          400,
          'Photos must be JPEG, PNG or WebP images under 3 MB each.',
        );
      }
      const key = participantKey(participant.role, participant.id);
      if (!(await uploadLimiter().take(key))) {
        throw new HttpError(
          429,
          'You’re uploading photos too fast. Wait a moment and try again.',
        );
      }
      res.status(201).json(await uploadChatImage(participant, image));
    },
  );

  chat.use(express.json({ limit: '16kb' }));

  chat.get('/conversations', async (_req, res: ChatResponse) => {
    res.json(await listConversations(res.locals.participant));
  });

  chat.post('/conversations', async (req, res: ChatResponse) => {
    res.json(await openConversation(res.locals.participant, req.body ?? {}));
  });

  chat.get('/conversations/:id/messages', async (req, res: ChatResponse) => {
    res.json(
      await listMessages(
        res.locals.participant,
        req.params.id,
        parseBefore(req.query.before),
      ),
    );
  });

  chat.post('/conversations/:id/messages', async (req, res: ChatResponse) => {
    const message = await sendMessage(
      res.locals.participant,
      req.params.id,
      req.body ?? {},
    );
    res.status(202).json(message);
  });

  app.use('/api/chat', chat);
  app.use(handleErrors);

  return app;
}
