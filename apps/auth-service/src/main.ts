/**
 * NestJS Auth Service for MlimaLink.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MlimaLink Auth Service')
    .setDescription('Authentication and identity service')
    .setVersion('1.0')
    .addTag('health')
    .addTag('auth')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const host = process.env.HOST ?? '0.0.0.0';
  const port = process.env.AUTH_PORT
    ? Number(process.env.AUTH_PORT)
    : process.env.PORT
      ? Number(process.env.PORT)
      : 3334;

  await app.listen(port, host);
  Logger.log(
    `🚀 Auth service running on: http://${host}:${port}/${globalPrefix}`,
  );
  Logger.log(`📚 Swagger docs: http://${host}:${port}/docs`);
}

bootstrap();
