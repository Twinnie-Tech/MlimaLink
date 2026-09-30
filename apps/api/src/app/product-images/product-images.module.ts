import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SellerGuard } from '../seller.guard';
import { ProductImagesService } from './product-images.service';
import { SellerProductImagesController } from './seller-product-images.controller';

@Module({
  controllers: [SellerProductImagesController],
  providers: [ProductImagesService, PrismaService, SellerGuard],
  exports: [ProductImagesService],
})
export class ProductImagesModule {}
