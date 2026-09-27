/**
 * API Gateway — public entry point that proxies to the Nest API.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
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

  const apiTarget =
    process.env.API_URL ??
    `http://127.0.0.1:${process.env.API_PORT ? Number(process.env.API_PORT) : 3333}`;
  const authTarget =
    process.env.AUTH_SERVICE_URL ??
    `http://127.0.0.1:${process.env.AUTH_PORT ? Number(process.env.AUTH_PORT) : 3334}`;
  const expressApp = app.getHttpAdapter().getInstance();

  // Must be mounted before the catch-all /api proxy below.
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
  Logger.log(`🚀 API Gateway running on: http://${host}:${port}`);
  Logger.log(`↪️  Proxying /api/auth → ${authTarget}/api/auth`);
  Logger.log(`↪️  Proxying /api → ${apiTarget}/api`);
}

bootstrap();
