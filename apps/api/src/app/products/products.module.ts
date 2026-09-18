import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsApiService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsApiService],
})
export class ProductsModule {}
