/**
 * API Gateway — public entry point that proxies to the Nest API.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,POST,PUT,DELETE,OPTIONS',
    allowedHeaders: 'Origin,X-Requested-With,Content-Type,Accept',
  });

  const apiTarget = process.env.API_URL ?? 'http://localhost:3333';
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.use(
    '/api',
    createProxyMiddleware({
      target: apiTarget,
      changeOrigin: true,
      // Express strips the mount path; restore /api for the Nest API global prefix
      pathRewrite: (path) => `/api${path}`,
    }),
  );

  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;

  await app.listen(port, host);
  Logger.log(`🚀 API Gateway running on: http://${host}:${port}`);
  Logger.log(`↪️  Proxying /api → ${apiTarget}/api`);
}

bootstrap();
