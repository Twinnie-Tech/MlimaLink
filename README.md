# MlimaLink

MlimaLink is a marketplace platform built as an [Nx](https://nx.dev) monorepo. Shoppers browse and buy from shops, sellers run their shops and services, riders deliver orders, and admins oversee the whole platform. Supporting services handle analytics, chat and logs over Kafka.

- **Frontends:** Next.js 16, React 19, TanStack Query v5, Tailwind CSS v4
- **Backend:** NestJS 11 (API, auth, gateway) and Express 5 services
- **Data:** MongoDB through Prisma 6, with Redis for sessions
- **Messaging:** Kafka through kafkajs (Confluent Cloud or a local broker)
- **Testing:** Vitest and Jest for unit tests, Playwright for end-to-end tests

---

## Contents

- [Architecture](#architecture)
- [Applications and ports](#applications-and-ports)
- [Shared packages](#shared-packages)
- [Getting started](#getting-started)
- [Running the platform](#running-the-platform)
- [Environment variables](#environment-variables)
- [Accounts and authentication](#accounts-and-authentication)
- [Kafka topics](#kafka-topics)
- [Chat service](#chat-service)
- [Logger service](#logger-service)
- [Notifications](#notifications)
- [Database (Prisma)](#database-prisma)
- [Testing and quality checks](#testing-and-quality-checks)
- [Continuous integration](#continuous-integration)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
  user-ui :4200      seller-ui :4300      admin-ui :4400
        \                 |                  /
         \     Next.js rewrites /api/*      /
          '--------------+------------------'
                         |
                 API Gateway :3000
     ,-----------+-------+--------+-------------,
     |           |                |             |
 /api/auth   /api/chat (+WS)   /api/logs      /api/*
     |           |                |             |
 auth-service  chatting-service  logger-service  api
   :3334         :3336            :3337         :3333
     |           |                |             |
     '-----------+------ MongoDB -+-------------'
                 |                |
                 '----- Kafka ----'----- kafka-service :3335
```

- **The browser only talks to its own UI.** Each Next.js app rewrites `/api/*` to the API gateway, so cookies and requests stay on one origin.
- **The gateway routes by path:**
  - `/api/auth` goes to auth-service.
  - `/api/chat`, including the WebSocket upgrade, goes to chatting-service.
  - `/api/logs` goes to logger-service.
  - Every other `/api` path goes to the main API.
- **Kafka connects the services:**
  - The API publishes shopper activity to `user_events`, and kafka-service turns it into analytics.
  - chatting-service carries every chat message over `chat_messages`.
  - Services publish logs to `logs`, and logger-service stores them. The gateway publishes every request to `live_logs`. logger-service streams both to admin-ui over a WebSocket.

---

## Applications and ports

| App                      | Port | Stack        | What it does                                                                                                     |
| ------------------------ | ---- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `user-ui`                | 4200 | Next.js      | Shop front: products, offers, reviews, cart, checkout, delivery tracking                                         |
| `seller-ui`              | 4300 | Next.js      | Seller dashboard: products, orders, payments, discount codes, service profile                                    |
| `admin-ui`               | 4400 | Next.js      | Admin dashboard: users, sellers, products, events, orders, payments, logs, management                            |
| `api-gateway`            | 3000 | NestJS       | Single entry point; proxies to the services below                                                                |
| `api`                    | 3333 | NestJS       | Catalog, reviews, discount codes, checkout, orders, delivery, admin endpoints                                    |
| `auth-service`           | 3334 | NestJS       | Sign-up, login, refresh, logout and password reset for shoppers, sellers, riders and admins                      |
| `kafka-service`          | 3335 | Express      | Consumes `user_events` and keeps user, product and shop analytics up to date                                     |
| `chatting-service`       | 3336 | Express + ws | Direct, shop and support chats with photos, documents and GIFs, carried over Kafka and delivered over WebSockets |
| `logger-service`         | 3337 | Express + ws | Stores the `logs` topic for admins and streams it, plus gateway request activity, live over a WebSocket          |
| `recommendation-service` | 3338 | Express      | Personalised picks (`GET /api/recommendations`) from a TensorFlow model trained on shopper activity              |
| `user-ui-e2e`            | —    | Playwright   | End-to-end tests for user-ui                                                                                     |
| `api-gateway-e2e`        | —    | Jest         | End-to-end tests for the gateway                                                                                 |

Every Express service answers `GET /api` with `{ "service": "<name>", "status": "ok" }`.

### Platform fee

Each order is split **10% to the platform and 90% to the seller**. Checkout shows the split, and so do the seller's orders, payments and dashboard pages.

---

## Shared packages

| Package                            | Path                                   | Purpose                                                                   |
| ---------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| `@org/models`                      | `packages/shared/models`               | Shared types and helpers (`/admin`, `/catalog`, `/checkout`, `/delivery`) |
| `@org/errors`                      | `packages/shared/errors`               | Shared HTTP error helpers                                                 |
| `@org/shared-test-utils`           | `packages/shared/test-utils`           | Testing utilities                                                         |
| `@org/utils`                       | `packages/utils`                       | Kafka client, topics and token checks (see below)                         |
| `@org/shop-data`                   | `packages/shop/data`                   | Data access for shop features                                             |
| `@org/shop-feature-products`       | `packages/shop/feature-products`       | Product listing feature                                                   |
| `@org/shop-feature-product-detail` | `packages/shop/feature-product-detail` | Product detail feature                                                    |
| `@org/shop-shared-ui`              | `packages/shop/shared-ui`              | Shared shop UI components                                                 |
| `@org/api-products`                | `packages/api/products`                | Product service library                                                   |

`@org/utils` has four entry points:

- **`@org/utils/kafka`:**
  - `getKafka()`, `getProducer()` and `disconnectProducer()`.
  - `kafkaConfigFromEnv()` builds the connection settings.
  - `ensureTopic()` creates a missing topic with settings Confluent Cloud accepts.
- **`@org/utils/events`:** the `user_events` topic, `parseUserEvent()` and `sendUserEvents()`.
- **`@org/utils/logs`:** the `logs` topic, `createLogEntry()`, `sendLog()` and `parseLogEntry()`.
- **`@org/utils/auth`:** `verifyAccessToken()`, `readAccessToken()` and `readCookie()`, for checking auth-service tokens in other services.

---

## Getting started

### Prerequisites

- Node.js 22 or later (CI uses Node 24) and npm
- A MongoDB database (e.g. MongoDB Atlas)
- Redis (sessions and refresh tokens)
- Kafka: Confluent Cloud or a local broker on `localhost:9092`
- Gmail SMTP credentials (an App Password) for emails
- An ImageKit account for product photos

### Setup

```bash
git clone https://github.com/Twinnie-Tech/MlimaLink.git
cd MlimaLink
npm install

# Create your environment file, then fill it in (see "Environment variables")
cp .env.example .env

# Generate the Prisma client and create collections and indexes
npx prisma generate
npx prisma db push

# Create your first admin account (there is no admin sign-up)
npm run admin:create -- --email admin@example.com --name "Admin"
```

`admin:create` asks for the password. To skip the prompt in scripts, set `ADMIN_PASSWORD` instead.

---

## Running the platform

### Everything for day-to-day work

```bash
npm run dev
```

This builds the API, gateway and auth-service, then starts them along with user-ui (4200), seller-ui (4300) and admin-ui (4400). It does not start the Kafka services; start those separately when you need them.

### One app at a time

```bash
npm run serve:api              # api               http://localhost:3333/api
npm run serve:auth             # auth-service      http://localhost:3334/api
npm run serve:gateway          # api-gateway       http://localhost:3000
npm run serve:kafka            # kafka-service     http://localhost:3335/api
npm run serve:chat             # chatting-service  http://localhost:3336/api
npm run serve:logger           # logger-service    http://localhost:3337/api
npm run serve:recommendation   # recommendation    http://localhost:3338/api
npm run serve:user-ui          # user-ui           http://localhost:4200
npm run serve:seller-ui        # seller-ui         http://localhost:4300
npm run serve:admin-ui         # admin-ui          http://localhost:4400
```

A full local stack is the gateway, api, auth, the three UIs, plus kafka, chat and logger if you're working on analytics, chat or logs.

---

## Environment variables

Every service reads the root `.env`. `.env.example` lists the variables, and this section explains them.

### Database and cache

| Variable            | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `DATABASE_URL`      | MongoDB connection string (Prisma)                    |
| `DATABASE_USER`     | Database user                                         |
| `DATABASE_PASSWORD` | Database password                                     |
| `REDIS_URL`         | Redis URL, e.g. `rediss://default:PASSWORD@HOST:6379` |

### Servers and URLs

| Variable                                     | Default                 | Description                                                   |
| -------------------------------------------- | ----------------------- | ------------------------------------------------------------- |
| `NODE_ENV`                                   | `development`           |                                                               |
| `HOST`                                       | `0.0.0.0`               | Interface the Nest apps listen on                             |
| `CORS_ORIGIN`                                | `http://localhost:4200` | Comma-separated origins allowed by the gateway, api and auth  |
| `GATEWAY_PORT`                               | `3000`                  |                                                               |
| `API_PORT` / `API_URL`                       | `3333`                  | `API_URL` overrides the gateway's API target                  |
| `AUTH_PORT` / `AUTH_SERVICE_URL`             | `3334`                  | `AUTH_SERVICE_URL` overrides the gateway's auth target        |
| `KAFKA_SERVICE_PORT`                         | `3335`                  |                                                               |
| `CHAT_SERVICE_PORT` / `CHAT_SERVICE_URL`     | `3336`                  | `CHAT_SERVICE_URL` overrides the gateway's chat target        |
| `LOGGER_SERVICE_PORT` / `LOGGER_SERVICE_URL` | `3337`                  | `LOGGER_SERVICE_URL` overrides the gateway's logs target      |
| `RECOMMENDATION_SERVICE_PORT` / `_URL`       | `3338`                  | `RECOMMENDATION_SERVICE_URL` overrides the gateway's target   |
| `API_GATEWAY_URL`                            | `http://127.0.0.1:3000` | Where the Next.js apps send `/api/*`                          |
| `USER_UI_URL`                                | `http://localhost:4200` | Linked from emails                                            |
| `SELLER_UI_URL`                              | `http://localhost:4300` | Linked from emails                                            |
| `ADMIN_UI_URL`                               | `http://localhost:4400` | Tells the gateway's activity log which UI a request came from |
| `NEXT_PUBLIC_SHOP_URL`                       | `http://localhost:4200` | Product and shop links in seller-ui and admin-ui              |
| `NEXT_PUBLIC_SELLER_UI_URL`                  | `http://localhost:4300` | "Become a seller" link in user-ui                             |
| `RESET_PASSWORD_URL`                         |                         | Password-reset link sent by auth-service                      |

### Auth secrets

The eight JWT secrets below must all be **different**, long random values. Generate each one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Variable                                                    | Account  |
| ----------------------------------------------------------- | -------- |
| `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`               | Shoppers |
| `SELLER_ACCESS_TOKEN_SECRET`, `SELLER_REFRESH_TOKEN_SECRET` | Sellers  |
| `RIDER_ACCESS_TOKEN_SECRET`, `RIDER_REFRESH_TOKEN_SECRET`   | Riders   |
| `ADMIN_ACCESS_TOKEN_SECRET`, `ADMIN_REFRESH_TOKEN_SECRET`   | Admins   |

chatting-service and logger-service also need the access-token secrets to check sessions.

### Kafka

| Variable                            | Default               | Description                                                       |
| ----------------------------------- | --------------------- | ----------------------------------------------------------------- |
| `KAFKA_BROKERS`                     | `localhost:9092`      | Comma-separated `host:port` list                                  |
| `KAFKA_CLIENT_ID`                   | `mlimalink`           | Name shown to the brokers                                         |
| `KAFKA_USERNAME` / `KAFKA_PASSWORD` |                       | SASL credentials (`KAFKA_API_KEY` / `KAFKA_API_SECRET` also work) |
| `KAFKA_SSL`                         | on with credentials   | `true` / `false`                                                  |
| `KAFKA_SASL_MECHANISM`              | `plain`               | `plain`, `scram-sha-256` or `scram-sha-512`                       |
| `KAFKA_TOPIC_PARTITIONS`            | `6`                   | Partitions for topics the services create                         |
| `KAFKA_REPLICATION_FACTOR`          | `3` cloud / `1` local | Confluent Cloud requires 3                                        |

### Chat and logs

| Variable                       | Default                    | Description                                                            |
| ------------------------------ | -------------------------- | ---------------------------------------------------------------------- |
| `CHAT_ALLOWED_ORIGINS`         | the three local UI origins | Browser origins allowed to open chat WebSockets                        |
| `CHAT_INSTANCE_ID`             | `<hostname>-<pid>`         | Stable name per chat instance, so it keeps its Kafka group             |
| `CHAT_RATE_LIMIT_PER_MINUTE`   | `30`                       | Chat messages each person may send per minute                          |
| `CHAT_UPLOAD_LIMIT_PER_MINUTE` | `10`                       | Chat photos and documents each person may upload per minute            |
| `GIPHY_API_KEY`                | none                       | GIPHY key for GIFs and stickers in chat; without it the picker says so |
| `NEXT_PUBLIC_CHAT_WS_URL`      | same origin `/api/chat/ws` | Chat WebSocket URL for the three UIs, if not the UI's own origin       |
| `LOG_RETENTION_DAYS`           | `7`                        | How long logger-service keeps logs                                     |
| `LOGS_ALLOWED_ORIGINS`         | `http://localhost:4400`    | Browser origins allowed to open the live logs WebSocket                |
| `LOGGER_INSTANCE_ID`           | `<hostname>-<pid>`         | Stable name per logger instance, so it keeps its live Kafka group      |
| `NEXT_PUBLIC_LOGS_WS_URL`      | same origin `/api/logs/ws` | Live logs WebSocket URL for admin-ui, if not its own origin            |

### Email, images and payments

| Variable                                        | Description                                      |
| ----------------------------------------------- | ------------------------------------------------ |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`           | SMTP login and sender (use a Gmail App Password) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SERVICE`        | Optional SMTP server settings                    |
| `GMAIL_USER`, `GMAIL_PASS`                      | Gmail fallback credentials                       |
| `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | Product photos and chat photo/document uploads   |
| `STRIPE_SECRET_KEY`                             | Stripe Connect onboarding for seller payouts     |
| `APP_TIMEZONE`                                  | Time zone used by auth-service                   |

---

## Accounts and authentication

There are four separate account types: **shoppers, sellers, riders and admins**. They don't share anything:

- Each type has its own token secrets, cookies, token audience and session lifetime, so a token issued for one account type is never accepted as another.
- Because cookies are shared by every port on a host, each type uses a different cookie name. That lets one browser stay signed in to user-ui, seller-ui and admin-ui at the same time.

| Account | Access cookie       | Access token | Idle session |
| ------- | ------------------- | ------------ | ------------ |
| Shopper | `accessToken`       | 15 min       | 7 days       |
| Seller  | `sellerAccessToken` | 15 min       | 1 day        |
| Rider   | `riderAccessToken`  | 15 min       | 7 days       |
| Admin   | `adminAccessToken`  | 10 min       | 8 hours      |

An admin can **suspend** a shopper or seller. A suspended account can't log in, and its existing sessions stop working.

Admins log in to admin-ui at `/login`. Accounts are created only with `npm run admin:create`.

---

## Kafka topics

| Topic           | Key             | Producer                | Consumer (group)                                                                                    |
| --------------- | --------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `user_events`   | user id         | api                     | kafka-service (`user-events-group`) → user, product and shop analytics                              |
| `chat_messages` | conversation id | chatting-service        | chatting-service: `chat-persistence-group` (stores) and `chat-delivery-<instance>` (live delivery)  |
| `logs`          | source service  | any service (`sendLog`) | logger-service: `logger-service-group` (stores in MongoDB) and `logger-live-<instance>` (live feed) |
| `live_logs`     | source service  | api-gateway (requests)  | logger-service (`logger-live-<instance>`) → live feed only, never stored                            |

The services create missing topics on startup when the cluster allows it.

---

## Chat service

`chatting-service` handles three kinds of chat:

- **Direct messages** between any two people: shopper, seller or admin, in any combination. There's one chat per pair, whoever starts it, and only those two can read it.
- A **shopper and a shop**. The shopper starts the chat and the shop's seller replies.
- **Support chats** between a shopper or seller and MlimaLink. Either side can start one; every admin sees them and any admin can reply.

Messages carry text plus up to 4 photos or documents, or a GIF or sticker on its own. Like Microsoft Teams, people can react with emoji, reply to (quote) a message, and edit or delete their own messages at any time. Chats show who's typing and when your messages were seen.

### How it scales

1. The WebSocket (or REST) layer publishes each message to `chat_messages`, keyed by conversation, so each chat stays in order.
2. One consumer group, shared by every instance, saves messages to MongoDB **in batches**: each Kafka batch becomes one `createMany`, plus one preview update per chat. Offsets are committed only after the write succeeds, so a failed batch is retried, and messages already stored are skipped, because each id is chosen before the message is sent.
3. Every instance also reads the topic in its own group and pushes each message to the WebSockets connected to it straight away. You can run as many instances as you need.
4. Edits, deletions, reactions, seen receipts and typing don't wait for that round trip. The instance that handles one pushes it to its own sockets first, then publishes it tagged with its `CHAT_INSTANCE_ID`, so other instances deliver it and it skips its own copy. The chat screens also show your reaction the moment you click it.

### Sending limits

Each person may send `CHAT_RATE_LIMIT_PER_MINUTE` messages or reactions (default 30) and upload `CHAT_UPLOAD_LIMIT_PER_MINUTE` files (default 10) per minute. The counts are kept in Redis, so the limits hold across every instance. If Redis is unavailable, each instance counts on its own. Over the limit, REST returns 429 and the WebSocket replies with an `error`.

### Photos and documents

Photos can be JPEG, PNG, WebP or GIF. Documents can be PDF, Word (`.doc`, `.docx`), Excel (`.xls`, `.xlsx`), PowerPoint (`.ppt`, `.pptx`), text or CSV. The content is checked, not just the name.

1. Upload the file first: `POST /api/chat/attachments?as=&name=<file name>`, with the file itself as the request body. It's stored in your own ImageKit folder (`/chat/<role>-<id>`) and you get back `{ "url", "fileId", "kind", "name", "size", "mimeType" }`, where `kind` is `photo` or `document`.
2. Send the message with photo URLs in `"attachments": [url, ...]` and documents in `"files": [{ "url", "name", "size", "mimeType" }, ...]`, up to 4 in total.

Only URLs from your own chat folder are accepted, so a message can't point at someone else's files or other sites.

**Every file must be 10 MB or less.** A bigger one gets a 413 with _"That file is over the 10 MB limit. Please compress it to under 10 MB and try again."_ The chat screens check before uploading, so nothing is sent, and name the file and its size: _"“report.pdf” is 12.4 MB, which is over the 10 MB limit. Please compress it to under 10 MB and try again."_

### GIFs and stickers

`GET /api/chat/gifs?as=&type=gif|sticker&q=&offset=` searches GIPHY through the server, so the key never reaches the browser. An empty `q` returns what's trending. It returns `{ "results": [{ "id", "title", "url", "width", "height", "previewUrl" }], "next" }`; pass `next` as `offset` for more. Results are cached for 5 minutes, because free GIPHY keys allow few requests an hour. It returns 503 when `GIPHY_API_KEY` isn't set.

Send the chosen one as `"gif": { "kind": "gif" | "sticker", "url", "width", "height", "title" }` with no text or files. Only GIPHY URLs are accepted.

### Reactions, replies, edits and deletions

- **Reactions:** `POST .../messages/:messageId/reactions` with `{ "emoji" }`. Each person has one reaction per message: the same emoji again takes it away, another emoji replaces it.
- **Replies:** send `"replyToId"` with the message. The reply keeps a quote of the original (`replyTo: { id, senderName, preview }`) as it read at the time.
- **Edits:** `PATCH .../messages/:messageId` with `{ "body" }`. Only your own messages, at any time. They get `editedAt` and show "Edited". GIFs and stickers can't be edited.
- **Deletions:** `DELETE .../messages/:messageId`. Only your own messages. The text, files, GIF, quote and reactions are removed, everyone sees "This message was deleted", and replies quoting it say the same.

Each change is sent to everyone in the chat as an `updated` event carrying the whole message, so screens just replace it.

### Choosing the account

Every request needs `?as=user`, `?as=seller` or `?as=admin`. The service reads that account's cookie, or an `Authorization: Bearer <token>` header.

### REST API (through the gateway)

| Method | Path                                                            | Body                                                                                                    | Description                                                         |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| GET    | `/api/chat/conversations?as=`                                   |                                                                                                         | Your chats, most recent first (admins also see all support chats)   |
| POST   | `/api/chat/conversations?as=`                                   | `{ "to": { "role", "id" } }`, `{ "shopId" }`, `{ "support": true }`, `{ "userId" }` or `{ "sellerId" }` | Start or resume a chat                                              |
| GET    | `/api/chat/conversations/:id?as=`                               |                                                                                                         | One of your chats, in the same shape as the list                    |
| GET    | `/api/chat/conversations/:id/messages?as=&cursor=&limit=`       |                                                                                                         | A page of messages, newest first (see below)                        |
| POST   | `/api/chat/conversations/:id/messages?as=`                      | `{ "body"?, "attachments"?, "files"?, "gif"?, "replyToId"? }`                                           | Send a message (text up to 2000 characters); returns 202            |
| PATCH  | `/api/chat/conversations/:id/messages/:messageId?as=`           | `{ "body" }`                                                                                            | Edit your own message; returns the message                          |
| DELETE | `/api/chat/conversations/:id/messages/:messageId?as=`           |                                                                                                         | Delete your own message; returns the message                        |
| POST   | `/api/chat/conversations/:id/messages/:messageId/reactions?as=` | `{ "emoji" }`                                                                                           | Add, change or take away your reaction; returns the message         |
| POST   | `/api/chat/attachments?as=&name=`                               | the file                                                                                                | Upload a photo or document (10 MB max); returns 201                 |
| GET    | `/api/chat/gifs?as=&type=&q=&offset=`                           |                                                                                                         | Search GIPHY GIFs or stickers                                       |
| POST   | `/api/chat/conversations/:id/read?as=`                          |                                                                                                         | Mark the chat as seen; returns `{ "conversationId", "lastReadAt" }` |
| GET    | `/api/chat/unseen?as=`                                          |                                                                                                         | Unseen messages across your chats, for a badge: `{ "total" }`       |

Who can open what (send exactly one of these, or you get a 400):

- Anyone sends `to: { role: "user" | "seller" | "admin", id }` for a direct chat. You can't message yourself, or an account that doesn't exist or is suspended.
- Shoppers send `shopId` to message a shop. A missing shop, or one whose seller is suspended, returns 404.
- Shoppers and sellers send `support: true` to reach MlimaLink.
- Admins send `userId` or `sellerId` to open a support chat with that person.

Every chat in the list (and from `GET /conversations/:id`) has:

- `participants`: everyone in it, as `{ role, id }`.
- `counterpart`: who you're talking to. That's the other person in a direct chat, the seller or shopper in a shop chat, and the shopper or seller for an admin in a support chat. Shoppers and sellers have no counterpart in support chats, because admins answer as a team.
- `presence`: the counterpart's status (see below), or null without a counterpart.

### Reading messages

`GET /conversations/:id/messages` returns `{ messages, hasMore, nextCursor, lastReadAt }`, with the newest message first:

- `limit` is 1 to 50 (default 20).
- To load older messages, pass `nextCursor` back as `cursor`. A cursor must be the id of a message in that chat.
- The first page (no `cursor`) marks the chat as read and clears its unseen count; `lastReadAt` says when. Your other open tabs get a `read` event too.

### Presence

Like Microsoft Teams, everyone is **available**, **away** or **offline**, with `lastSeenAt` for when they were last connected. Admins can also be **busy**, **do not disturb** (`dnd`) or **be right back** (`brb`):

- Opening a chat WebSocket makes you available. A tab sends `{ "type": "presence", "status": "away" }` after 5 idle minutes and `"available"` when you're back. You're away only when all your tabs are.
- Closing your last tab makes you offline.
- Statuses are kept in Redis (`chat:presence`), so every instance sees them, and each instance renews its people every 30 seconds. If an instance crashes, its people go offline within 75 seconds. Without Redis, each instance only knows its own connections.
- **Admins can also set a status by hand**, like Teams: **Busy**, **Do not disturb**, **Be right back**, **Appear away** or **Appear offline**, or go back to **Available** (automatic). A tab sends `{ "type": "status", "status": "busy" | "dnd" | "brb" | "away" | "offline" | null }`, and every tab of that admin gets `{ "type": "status", "manual" }`. The choice is kept in Redis (`chat:presence-manual`) until they change it, across reconnects and instances. Appear offline hides `lastSeenAt` too. Do not disturb silences the chime, toasts and browser notifications. Shoppers and sellers who try get an `error`.
- Changes are pushed live. A tab sends `watch` and gets the current status of the people in its 50 most recent chats, then a `presence` event whenever one of them changes. Changes travel between instances on the Redis channel `chat:presence-updates`; without Redis, only people on the same instance are pushed.

### Unseen messages

Every chat in the list has an `unseenCount`: messages from other people since you last read it. Your own messages never count, and sending a message marks the chat as read for you.

- Read positions are stored in MongoDB (`conversation_reads`), so the counts are always exact.
- Every admin has their own count for support chats.
- Counts stop at 100, and `GET /api/chat/unseen` totals your 50 most recent chats with the same cap; show "99+" above 99.
- While connected, refresh the badge when a `message` arrives for a chat that isn't open, and send `read` when the user opens it.

A chat you're not part of returns 404, the same as a missing one. If Kafka is unavailable, sending returns 503.

### WebSocket

Connect to `ws://localhost:3000/api/chat/ws?as=user` (through the gateway) or directly to port 3336.

| Direction       | Message                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| server → client | `{ "type": "ready", "you": { "role", "id", "name" } }`                                       |
| client → server | `{ "type": "send", "conversationId", "clientId"?, ...message fields as in REST }`            |
| server → client | `{ "type": "sent", "clientId", "message" }`                                                  |
| server → client | `{ "type": "error", "clientId", "message" }`                                                 |
| server → client | `{ "type": "message", "message" }`, sent to every participant, including your other tabs     |
| client → server | `{ "type": "read", "conversationId" }`                                                       |
| server → client | `{ "type": "read", "conversationId", "lastReadAt" }`, sent to all your tabs on that instance |
| client → server | `{ "type": "presence", "status": "available" \| "away" }`                                    |
| client → server | `{ "type": "watch" }`, again whenever a new chat appears                                     |
| server → client | `{ "type": "presence", "updates": [{ "key": "seller:<id>", "status", "lastSeenAt" }] }`      |
| server → client | `{ "type": "updated", "message" }`, when a message is edited, deleted or reacted to          |
| server → client | `{ "type": "seen", "conversationId", "reader", "lastReadAt" }`, when someone else reads it   |
| client → server | `{ "type": "typing", "conversationId" }`, every 3 seconds or so while typing                 |
| server → client | `{ "type": "typing", "conversationId", "from": { "key", "name" } }`; show it for 6 seconds   |
| client → server | `{ "type": "status", "status" }`, admins only (see Presence)                                 |
| server → client | `{ "type": "status", "manual" }`, an admin's own status set by hand, to all their tabs       |

- Only origins listed in `CHAT_ALLOWED_ORIGINS` may connect.
- The socket closes with code **4001** when the access token expires. The client should refresh the session and reconnect.
- Dead connections are dropped after a missed heartbeat (30 s).

### Chat screens

The chat screen lives in `packages/shared/chat-ui` (`@org/chat-ui`), so the three UIs share it:

- **user-ui:** `/inbox` (signed-out shoppers are sent to login and brought back), a messages badge in the header, and a **Message shop** button on every shop page.
- **seller-ui:** `/dashboard/inbox`, with the unseen count next to Inbox in the sidebar.
- **admin-ui:** `/dashboard/inbox`, the support inbox shared by the admin team plus their direct messages, with the unseen count in the sidebar and a status picker under the logo.

In a chat you can:

- Pick emoji from a searchable picker with recently used ones, and attach photos or documents (checked against the 10 MB limit before uploading) or a GIPHY GIF or sticker.
- Hover a message to react, reply, or edit or delete your own. Reactions show who reacted; replies show a quote you can click to jump to the original.
- See "… is typing…" in the header, and one tick (sent) or two (seen) on your messages. In support chats a shopper or seller sees two ticks once any admin has read the message.

The open chat is the `?conversationId=` search param, so links and the back button work. Scrolling to the top loads older messages.

`ChatProvider` keeps one WebSocket per tab on every page: the whole of user-ui for a signed-in shopper, and the seller and admin dashboards. It connects through the UI's own `/api` rewrite unless `NEXT_PUBLIC_CHAT_WS_URL` is set. With it:

- Badges, the chat list, the open conversation and statuses update the moment the server says so, with no refresh.
- A new message in a chat that isn't on screen plays a chime and shows a toast with **Open**. When the tab is in the background, it shows a browser notification instead (the inbox offers to turn these on). The tab title shows the unseen count, e.g. "(3) MlimaLink Shop".
- You show as away after 5 idle minutes on any page, not just the inbox.
- While reconnecting, messages are sent over REST and the open chat checks for new ones every 5 seconds; everything catches up once the connection is back.

---

## Logger service

`logger-service` stores every entry published to the `logs` topic in the `platform_logs` collection:

- It saves a batch at a time and marks the batch as read only after it's saved, so logs aren't lost.
- Entries older than `LOG_RETENTION_DAYS` are deleted every hour.

To publish a log from any service:

```ts
import { createLogEntry, sendLog } from '@org/utils/logs';

void sendLog(createLogEntry('error', 'Payment failed', 'api', { orderId }));
```

Admins can read logs (with an admin cookie or bearer token):

```
GET /api/logs?level=error&source=chatting-service&q=kafka&before=<ISO date>&limit=50
```

The response is `{ "logs": [...], "sources": [...] }`, newest first and up to 200 per page. To get the next page, pass the last entry's timestamp as `before`.

### Live logs

The Loggers page in admin-ui shows the last 200 stored lines, then every new line as it happens:

- **User activity.** The gateway logs every request it handles: who made it (shopper, seller, rider, admin or guest), the method, path, status and time taken. For example, `POST /api/chat/conversations 201 34ms · user 64f…`. These go to the `live_logs` topic in batches about once a second. They're shown live but never stored.
- **Service logs.** Everything sent with `sendLog` also comes past live, as well as being stored.
- **The WebSocket.** logger-service reads both topics with its own Kafka group per instance. It sends each line to admins connected at `/api/logs/ws` (proxied by the gateway) as `{ "type": "log", "log": { id, level, message, source, timestamp, meta? } }`. The `source` is the service that wrote the line.
- **Access.** The socket needs an admin cookie and an origin listed in `LOGS_ALLOWED_ORIGINS`. It closes with code `4001` when the access token expires. admin-ui then renews the session and reconnects.

---

## Notifications

The API stores notifications in the `notifications` collection. Each notification has:

- `creatorId`: whoever caused it.
- `receiverId`: the shopper's user id, the seller's id (not the shop's) or the admin's id.
- `redirect_link`: a path in the receiver's own app.
- `title`, `message`, and `status` (`"unread"` or `"read"`).
- `createdAt` and `updatedAt`.

Every admin gets their own copy of platform notifications, so each admin reads them separately.

What creates them (all link to `/dashboard/orders`):

| Event                                 | Who is notified           |
| ------------------------------------- | ------------------------- |
| Order placed                          | The shop's seller, admins |
| Shopper cancels before it's confirmed | The shop's seller, admins |
| Seller confirms the order             | The shopper               |
| Seller cancels the order              | The shopper, admins       |
| Rider picks it up (out for delivery)  | The shopper               |
| Rider delivers it                     | The shopper, the seller   |

Saving a notification is best effort, like the order emails. If it fails, the error is logged and the order still goes through.

Each account type has the same four routes under its own prefix: `/api/notifications` (shoppers), `/api/seller/notifications` (sellers) and `/api/admin/notifications` (admins). Each prefix only returns notifications for the signed-in account.

| Method | Path                              | Description                                                                                         |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | `<prefix>?status=&limit=&before=` | Newest first, 50 per page (100 max): `{ "items", "unread" }`; pass the last `createdAt` as `before` |
| GET    | `<prefix>/status`                 | Unread count for badges: `{ "unread" }`                                                             |
| PATCH  | `<prefix>/:id/read`               | Mark one as read; returns the notification                                                          |
| PATCH  | `<prefix>/read-all`               | Mark all as read: `{ "updated" }`                                                                   |

To notify someone from another API service, inject `NotificationsService` (export of `NotificationsModule`) and call `notify([...])`, `notifyShop(shopId, ...)` or `notifyAdmins(...)`.

In each UI, the Notifications page and the sidebar's unread count check for new notifications every 30 seconds. Opening a notification's link marks it read.

---

## Database (Prisma)

The schema is in `prisma/schema.prisma` (MongoDB). After changing it:

```bash
npx prisma generate   # update the client
npx prisma db push    # create new collections and indexes
```

If you change `@org/models`, rebuild it before type-checking other projects:

```bash
npx tsc -b packages/shared/models
```

Main collections:

- **Accounts:** `users`, `sellers`, `admins`, `riders`
- **Shops and catalog:** `shops`, `products`, `product_reviews`, `shop_reviews`, `discount_codes`, `images`
- **Services:** `service_profiles`, `service_requests`
- **Orders:** `orders`, `deliveries`
- **Analytics:** `user_analytics`, `product_analytics`, `shop_analytics`
- **Chat:** `conversations`, `chat_messages`
- **Logs:** `platform_logs`
- **Notifications:** `notifications`

---

## Testing and quality checks

Run tasks through Nx:

```bash
npx nx run-many -t test                    # all unit tests
npx nx run-many -t lint test build typecheck
npx nx run chatting-service:test           # one project
npx nx affected -t test                    # only what your changes affect
npx nx run-many -t e2e --parallel=1        # e2e (they share ports, so one at a time)
npx nx format:check                        # Prettier check, as in CI
npx nx format:write                        # fix formatting
npx nx graph                               # project dependency graph
```

---

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests:

1. `npm ci` and install Playwright browsers
2. `npx nx format:check --base="remotes/origin/main"`
3. `npx nx run-many -t lint test build typecheck`
4. `npx nx run-many -t e2e --parallel=1`

Run steps 2 and 3 locally before pushing.

---

## Project structure

```
├── apps/
│   ├── user-ui/                 [scope:shop]            Next.js shop front (4200)
│   ├── user-ui-e2e/                                     Playwright tests
│   ├── seller-ui/               [scope:seller]          Seller dashboard (4300)
│   ├── admin-ui/                [scope:admin]           Admin dashboard (4400)
│   ├── api-gateway/                                     Gateway (3000)
│   ├── api-gateway-e2e/                                 Gateway e2e tests
│   ├── api/                     [scope:api]             Main API (3333)
│   ├── auth-service/            [scope:auth]            Auth (3334)
│   ├── kafka-service/           [scope:kafka]           Analytics consumer (3335)
│   ├── chatting-service/        [scope:chat]            Chat (3336)
│   ├── logger-service/          [scope:logger]          Logs (3337)
│   └── recommendation-service/  [scope:recommendation]  Recommendations (3338)
├── packages/
│   ├── shared/   models, errors, test-utils, chat-ui    [scope:shared]
│   ├── shop/     data, feature-products, feature-product-detail, shared-ui  [scope:shop]
│   ├── api/      products                               [scope:api]
│   └── utils/    kafka, events, logs, auth              [scope:shared]
├── prisma/schema.prisma          Database schema
├── tools/
│   ├── dev.mjs                   Starts the local stack (npm run dev)
│   ├── create-admin.mjs          Creates admin accounts (npm run admin:create)
│   ├── run-user-ui-e2e.mjs       Runs the user-ui e2e suite
│   └── run-api-gateway-e2e.mjs   Runs the gateway e2e suite
├── .env.example                  Environment template
└── nx.json                       Nx configuration
```

Projects are tagged by scope, and ESLint's module-boundary rule stops one scope from importing another's code. Anything in `scope:shared` can be used everywhere.

---

## Troubleshooting

**`prisma generate` fails with `EPERM: operation not permitted, rename ... query_engine-windows.dll.node`**
Running servers keep Prisma's engine file open. Stop `serve:api`, `serve:auth`, `serve:kafka`, `serve:chat` and `serve:logger`, run the command again, then restart them.

**Admin login returns 500**
`ADMIN_ACCESS_TOKEN_SECRET` and `ADMIN_REFRESH_TOKEN_SECRET` are missing or match another account's secrets. Add unique values and restart auth-service and the API.

**A service logs "Couldn't make sure the … topic exists"**
The Kafka credentials may not be allowed to create topics. Create the topic in the Confluent Cloud console instead (replication factor 3), or set `KAFKA_REPLICATION_FACTOR` for your cluster. The consumers retry every 30 seconds.

**`nx format:check` lists many files on Windows but CI passes**
With `core.autocrlf=true`, Git checks files out with Windows line endings, and Prettier expects Unix ones. CI runs on Linux with Unix line endings, so only files flagged there need fixing. Check locally with:

```bash
npx prettier --check --end-of-line auto <files>
```

**Chat WebSocket refuses to connect (403)**
Add the page's origin to `CHAT_ALLOWED_ORIGINS`.
