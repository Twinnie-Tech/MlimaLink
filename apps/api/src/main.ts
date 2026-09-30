/**
 * NestJS API for the MlimaLink shop.
 */

import './env';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Nest built-in CORS (do not use the raw `cors` package)
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Origin,X-Requested-With,Content-Type,Accept,Authorization',
    credentials: true,
  });

  // Photo uploads carry a data URL (see MAX_IMAGE_DATA_URL_LENGTH).
  app.useBodyParser('json', { limit: '5mb' });
  app.use(cookieParser());
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MlimaLink API')
    .setDescription(
      'Shop backend API for products, services, orders and deliveries',
    )
    .setVersion('1.0')
    .addTag('products')
    .addTag('seller products')
    .addTag('seller product images')
    .addTag('discount codes')
    .addTag('seller discount codes')
    .addTag('providers')
    .addTag('service requests')
    .addTag('seller service profile')
    .addTag('seller service requests')
    .addTag('orders')
    .addTag('seller orders')
    .addTag('rider')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const host = process.env.HOST ?? '0.0.0.0';
  const port = process.env.API_PORT
    ? Number(process.env.API_PORT)
    : process.env.PORT
      ? Number(process.env.PORT)
      : 3333;

  await app.listen(port, host);
  Logger.log(
    `🚀 Application is running on: http://${host}:${port}/${globalPrefix}`,
  );
  Logger.log(`📚 Swagger docs: http://${host}:${port}/docs`);
}

bootstrap();
