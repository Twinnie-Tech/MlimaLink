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
  - Services publish logs to `logs`, and logger-service stores them.

---

## Applications and ports

| App                      | Port | Stack        | What it does                                                                                |
| ------------------------ | ---- | ------------ | ------------------------------------------------------------------------------------------- |
| `user-ui`                | 4200 | Next.js      | Shop front: products, offers, reviews, cart, checkout, delivery tracking                    |
| `seller-ui`              | 4300 | Next.js      | Seller dashboard: products, orders, payments, discount codes, service profile               |
| `admin-ui`               | 4400 | Next.js      | Admin dashboard: users, sellers, products, events, orders, payments, logs, management       |
| `api-gateway`            | 3000 | NestJS       | Single entry point; proxies to the services below                                           |
| `api`                    | 3333 | NestJS       | Catalog, reviews, discount codes, checkout, orders, delivery, admin endpoints               |
| `auth-service`           | 3334 | NestJS       | Sign-up, login, refresh, logout and password reset for shoppers, sellers, riders and admins |
| `kafka-service`          | 3335 | Express      | Consumes `user_events` and keeps user, product and shop analytics up to date                |
| `chatting-service`       | 3336 | Express + ws | Shopper–shop chats and support chats, carried over Kafka and delivered live over WebSockets |
| `logger-service`         | 3337 | Express      | Stores everything published to the `logs` topic and serves it to admins                     |
| `recommendation-service` | 3338 | Express      | Starter service for product recommendations (health check only for now)                     |
| `user-ui-e2e`            | —    | Playwright   | End-to-end tests for user-ui                                                                |
| `api-gateway-e2e`        | —    | Jest         | End-to-end tests for the gateway                                                            |

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

| Variable                                     | Default                 | Description                                                  |
| -------------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `NODE_ENV`                                   | `development`           |                                                              |
| `HOST`                                       | `0.0.0.0`               | Interface the Nest apps listen on                            |
| `CORS_ORIGIN`                                | `http://localhost:4200` | Comma-separated origins allowed by the gateway, api and auth |
| `GATEWAY_PORT`                               | `3000`                  |                                                              |
| `API_PORT` / `API_URL`                       | `3333`                  | `API_URL` overrides the gateway's API target                 |
| `AUTH_PORT` / `AUTH_SERVICE_URL`             | `3334`                  | `AUTH_SERVICE_URL` overrides the gateway's auth target       |
| `KAFKA_SERVICE_PORT`                         | `3335`                  |                                                              |
| `CHAT_SERVICE_PORT` / `CHAT_SERVICE_URL`     | `3336`                  | `CHAT_SERVICE_URL` overrides the gateway's chat target       |
| `LOGGER_SERVICE_PORT` / `LOGGER_SERVICE_URL` | `3337`                  | `LOGGER_SERVICE_URL` overrides the gateway's logs target     |
| `RECOMMENDATION_SERVICE_PORT`                | `3338`                  |                                                              |
| `API_GATEWAY_URL`                            | `http://127.0.0.1:3000` | Where the Next.js apps send `/api/*`                         |
| `USER_UI_URL`                                | `http://localhost:4200` | Linked from emails                                           |
| `SELLER_UI_URL`                              | `http://localhost:4300` | Linked from emails                                           |
| `NEXT_PUBLIC_SHOP_URL`                       | `http://localhost:4200` | Product and shop links in seller-ui and admin-ui             |
| `NEXT_PUBLIC_SELLER_UI_URL`                  | `http://localhost:4300` | "Become a seller" link in user-ui                            |
| `RESET_PASSWORD_URL`                         |                         | Password-reset link sent by auth-service                     |

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

| Variable               | Default                    | Description                                                |
| ---------------------- | -------------------------- | ---------------------------------------------------------- |
| `CHAT_ALLOWED_ORIGINS` | the three local UI origins | Browser origins allowed to open chat WebSockets            |
| `CHAT_INSTANCE_ID`     | `<hostname>-<pid>`         | Stable name per chat instance, so it keeps its Kafka group |
| `LOG_RETENTION_DAYS`   | `7`                        | How long logger-service keeps logs                         |

### Email, images and payments

| Variable                                        | Description                                      |
| ----------------------------------------------- | ------------------------------------------------ |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`           | SMTP login and sender (use a Gmail App Password) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SERVICE`        | Optional SMTP server settings                    |
| `GMAIL_USER`, `GMAIL_PASS`                      | Gmail fallback credentials                       |
| `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | Product photo uploads                            |
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

| Topic           | Key             | Producer                | Consumer (group)                                                                                   |
| --------------- | --------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| `user_events`   | user id         | api                     | kafka-service (`user-events-group`) → user, product and shop analytics                             |
| `chat_messages` | conversation id | chatting-service        | chatting-service: `chat-persistence-group` (stores) and `chat-delivery-<instance>` (live delivery) |
| `logs`          | source service  | any service (`sendLog`) | logger-service (`logger-service-group`) → MongoDB                                                  |

The services create missing topics on startup when the cluster allows it.

---

## Chat service

`chatting-service` handles three kinds of chat:

- A **shopper and a shop**. The shopper starts the chat and the shop's seller replies.
- **Support chats** started by a shopper or a seller. Every admin sees them and any admin can reply.
- **Support chats started by an admin** with any shopper or seller.

### How it scales

1. A message is published to `chat_messages`, keyed by conversation, so each chat stays in order.
2. One consumer group, shared by every instance, saves it to MongoDB. A message Kafka delivers twice is stored once, because its id is chosen before it's sent.
3. Every instance also reads the topic in its own group and pushes the message to the WebSockets connected to it. You can run as many instances as you need.

### Choosing the account

Every request needs `?as=user`, `?as=seller` or `?as=admin`. The service reads that account's cookie, or an `Authorization: Bearer <token>` header.

### REST API (through the gateway)

| Method | Path                                               | Body                                                                      | Description                                               |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| GET    | `/api/chat/conversations?as=`                      |                                                                           | Your chats, most recent first (admins: all support chats) |
| POST   | `/api/chat/conversations?as=`                      | `{ "shopId" }`, `{ "support": true }`, `{ "userId" }` or `{ "sellerId" }` | Start or resume a chat                                    |
| GET    | `/api/chat/conversations/:id/messages?as=&before=` |                                                                           | 50 messages before `before` (ISO date), oldest first      |
| POST   | `/api/chat/conversations/:id/messages?as=`         | `{ "body": "..." }`                                                       | Send a message (up to 2000 characters); returns 202       |

Who can open what:

- Shoppers send `shopId` to message a shop, or `support: true`.
- Sellers send `support: true`. They reply to shoppers but can't start shop chats.
- Admins send `userId` or `sellerId`.

A chat you're not part of returns 404, the same as a missing one. If Kafka is unavailable, sending returns 503.

### WebSocket

Connect to `ws://localhost:3000/api/chat/ws?as=user` (through the gateway) or directly to port 3336.

| Direction       | Message                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| server → client | `{ "type": "ready", "you": { "role", "id", "name" } }`                                   |
| client → server | `{ "type": "send", "conversationId", "body", "clientId"? }`                              |
| server → client | `{ "type": "sent", "clientId", "message" }`                                              |
| server → client | `{ "type": "error", "clientId", "message" }`                                             |
| server → client | `{ "type": "message", "message" }`, sent to every participant, including your other tabs |

- Only origins listed in `CHAT_ALLOWED_ORIGINS` may connect.
- The socket closes with code **4001** when the access token expires. The client should refresh the session and reconnect.
- Dead connections are dropped after a missed heartbeat (30 s).

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
│   ├── shared/   models, errors, test-utils             [scope:shared]
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
