import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { isAccountType, issueSocketTicket } from '@org/utils/auth';
import {
  TOO_LARGE_MESSAGE,
  parseFileUpload,
  uploadChatFile,
} from './chat/attachments';
import {
  MAX_MESSAGES_PAGE_SIZE,
  MESSAGES_PAGE_SIZE,
  countUnseen,
  deleteMessage,
  editMessage,
  getConversation,
  listConversations,
  listMessages,
  markRead,
  openConversation,
  reactToMessage,
  sendMessage,
} from './chat/conversations';
import { parseGifQuery, searchGifs } from './chat/giphy';
import type { ChatHub } from './chat/hub';
import { authenticate, type Participant } from './chat/participants';
import { MAX_FILE_BYTES, participantKey } from './chat/protocol';
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

function parseCursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value) {
    throw new HttpError(400, 'cursor must be a message id.');
  }
  return value;
}

function parseLimit(value: unknown): number {
  if (value === undefined) return MESSAGES_PAGE_SIZE;
  const limit = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MESSAGES_PAGE_SIZE) {
    throw new HttpError(
      400,
      `limit must be a whole number from 1 to ${MAX_MESSAGES_PAGE_SIZE}.`,
    );
  }
  return limit;
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
    const upload = (error as { limit?: unknown }).limit === MAX_FILE_BYTES;
    res.status(413).json({
      message: upload ? TOO_LARGE_MESSAGE : 'That request is too large.',
    });
    return;
  }
  console.error(error);
  res.status(500).json({ message: 'Something went wrong.' });
};

/** `hub` lets REST reads clear the unseen badge in the reader's open tabs too. */
export function createApp({ hub }: { hub?: ChatHub } = {}) {
  const app = express();
  const announceRead = (
    { role, id }: Participant,
    conversationId: string,
    lastReadAt: string | null,
  ) => {
    if (lastReadAt) {
      hub?.sendTo(role, id, { type: 'read', conversationId, lastReadAt });
    }
  };
  app.disable('x-powered-by');

  app.get('/api', (_req, res) => {
    res.send({ service: 'chatting-service', status: 'ok' });
  });

  const chat = express.Router();
  chat.use(requireParticipant);

  // The file itself is the body (?name= gives its name), so only this route takes large
  // bodies. Over the limit, the rest of the body is read and thrown away before
  // answering 413: answering mid-upload resets the connection and the uploader would
  // see a network error instead of the message.
  chat.post(
    '/attachments',
    express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
    async (req, res: ChatResponse) => {
      const { participant } = res.locals;
      const upload = parseFileUpload(req.body, req.query.name);
      const key = participantKey(participant.role, participant.id);
      if (!(await uploadLimiter().take(key))) {
        throw new HttpError(
          429,
          'You’re uploading files too fast. Wait a moment and try again.',
        );
      }
      res.status(201).json(await uploadChatFile(participant, upload));
    },
  );

  chat.use(express.json({ limit: '16kb' }));

  chat.get('/conversations', async (_req, res: ChatResponse) => {
    res.json(await listConversations(res.locals.participant));
  });

  chat.post('/conversations', async (req, res: ChatResponse) => {
    res.json(await openConversation(res.locals.participant, req.body ?? {}));
  });

  chat.get('/conversations/:id', async (req, res: ChatResponse) => {
    res.json(await getConversation(res.locals.participant, req.params.id));
  });

  chat.get('/conversations/:id/messages', async (req, res: ChatResponse) => {
    const { participant } = res.locals;
    const page = await listMessages(participant, req.params.id, {
      cursor: parseCursor(req.query.cursor),
      limit: parseLimit(req.query.limit),
    });
    announceRead(participant, req.params.id, page.lastReadAt);
    res.json(page);
  });

  chat.post('/conversations/:id/messages', async (req, res: ChatResponse) => {
    const message = await sendMessage(
      res.locals.participant,
      req.params.id,
      req.body ?? {},
    );
    res.status(202).json(message);
  });

  chat.patch(
    '/conversations/:id/messages/:messageId',
    async (req, res: ChatResponse) => {
      res.json(
        await editMessage(
          res.locals.participant,
          req.params.id,
          req.params.messageId,
          req.body ?? {},
        ),
      );
    },
  );

  chat.delete(
    '/conversations/:id/messages/:messageId',
    async (req, res: ChatResponse) => {
      res.json(
        await deleteMessage(
          res.locals.participant,
          req.params.id,
          req.params.messageId,
        ),
      );
    },
  );

  chat.post(
    '/conversations/:id/messages/:messageId/reactions',
    async (req, res: ChatResponse) => {
      res.json(
        await reactToMessage(
          res.locals.participant,
          req.params.id,
          req.params.messageId,
          req.body ?? {},
        ),
      );
    },
  );

  chat.get('/gifs', async (req, res) => {
    res.json(await searchGifs(parseGifQuery(req.query)));
  });

  chat.post('/conversations/:id/read', async (req, res: ChatResponse) => {
    const { participant } = res.locals;
    const read = await markRead(participant, req.params.id);
    announceRead(participant, read.conversationId, read.lastReadAt);
    res.json(read);
  });

  chat.get('/unseen', async (_req, res: ChatResponse) => {
    res.json(await countUnseen(res.locals.participant));
  });

  /** A short-lived ticket for opening the chat WebSocket from a UI on another site. */
  chat.post('/socket-ticket', (_req, res: ChatResponse) => {
    const { role, id, expiresAt } = res.locals.participant;
    res.set('Cache-Control', 'no-store');
    res.json({ ticket: issueSocketTicket(role, { id, expiresAt }) });
  });

  app.use('/api/chat', chat);
  app.use(handleErrors);

  return app;
}
