import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SellerGuard } from '../seller.guard';
import { DiscountCodesController } from './discount-codes.controller';
import { DiscountCodesService } from './discount-codes.service';
import { SellerDiscountCodesController } from './seller-discount-codes.controller';

@Module({
  controllers: [DiscountCodesController, SellerDiscountCodesController],
  providers: [DiscountCodesService, PrismaService, SellerGuard],
})
export class DiscountCodesModule {}
