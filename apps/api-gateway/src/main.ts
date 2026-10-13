/**
 * API Gateway — public entry point that proxies to the Nest API.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { LIVE_LOGS_TOPIC, createLogBatcher } from '@org/utils/logs';
import { activityLogger } from './activity-log';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Origin,X-Requested-With,Content-Type,Accept,Authorization',
    credentials: true,
  });

  app.use(cookieParser());
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  // Every request, live in the admin Loggers page; never stored.
  const activity = createLogBatcher({ topic: LIVE_LOGS_TOPIC });
  app.use(activityLogger((entry) => activity.push(entry)));

  const apiTarget =
    process.env.API_URL ??
    `http://127.0.0.1:${process.env.API_PORT ? Number(process.env.API_PORT) : 3333}`;
  const authTarget =
    process.env.AUTH_SERVICE_URL ??
    `http://127.0.0.1:${process.env.AUTH_PORT ? Number(process.env.AUTH_PORT) : 3334}`;
  const chatTarget =
    process.env.CHAT_SERVICE_URL ??
    `http://127.0.0.1:${process.env.CHAT_SERVICE_PORT ? Number(process.env.CHAT_SERVICE_PORT) : 3336}`;
  const loggerTarget =
    process.env.LOGGER_SERVICE_URL ??
    `http://127.0.0.1:${process.env.LOGGER_SERVICE_PORT ? Number(process.env.LOGGER_SERVICE_PORT) : 3337}`;
  const expressApp = app.getHttpAdapter().getInstance();

  // pathFilter instead of a mount path keeps the full path, which WebSocket upgrades need.
  const chatProxy = createProxyMiddleware({
    target: chatTarget,
    changeOrigin: true,
    pathFilter: '/api/chat',
    ws: true,
  });

  const logsProxy = createProxyMiddleware({
    target: loggerTarget,
    changeOrigin: true,
    pathFilter: '/api/logs',
    ws: true,
  });

  // Must be mounted before the catch-all /api proxy below.
  expressApp.use(chatProxy);
  expressApp.use(logsProxy);
  expressApp.use(
    '/api/auth',
    createProxyMiddleware({
      target: authTarget,
      changeOrigin: true,
      pathRewrite: (path) => `/api/auth${path}`,
    }),
  );

  expressApp.use(
    '/api',
    createProxyMiddleware({
      target: apiTarget,
      changeOrigin: true,
      // Express strips the mount path; restore /api for the Nest API global prefix
      pathRewrite: (path) => `/api${path}`,
    }),
  );

  const host = process.env.HOST ?? '0.0.0.0';
  const port = process.env.GATEWAY_PORT
    ? Number(process.env.GATEWAY_PORT)
    : process.env.PORT
      ? Number(process.env.PORT)
      : 3000;

  await app.listen(port, host);
  app.getHttpServer().on('upgrade', chatProxy.upgrade);
  app.getHttpServer().on('upgrade', logsProxy.upgrade);
  const flushActivity = () =>
    void activity.stop().finally(() => process.exit(0));
  process.once('SIGINT', flushActivity);
  process.once('SIGTERM', flushActivity);
  Logger.log(`🚀 API Gateway running on: http://${host}:${port}`);
  Logger.log(`↪️  Proxying /api/chat (and WebSockets) → ${chatTarget}`);
  Logger.log(`↪️  Proxying /api/logs (and WebSockets) → ${loggerTarget}`);
  Logger.log(`↪️  Proxying /api/auth → ${authTarget}/api/auth`);
  Logger.log(`↪️  Proxying /api → ${apiTarget}/api`);
}

bootstrap();
