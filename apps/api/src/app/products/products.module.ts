import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ProductImagesModule } from '../product-images/product-images.module';
import { SellerGuard } from '../seller.guard';
import { ProductsController } from './products.controller';
import { ProductsApiService } from './products.service';
import { SellerProductsController } from './seller-products.controller';

@Module({
  imports: [ProductImagesModule],
  controllers: [ProductsController, SellerProductsController],
  providers: [ProductsApiService, PrismaService, SellerGuard],
})
export class ProductsModule {}
