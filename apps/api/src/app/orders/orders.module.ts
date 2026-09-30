import { Module } from '@nestjs/common';
import { DiscountCodesModule } from '../discount-codes/discount-codes.module';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { RiderGuard } from '../rider.guard';
import { SellerGuard } from '../seller.guard';
import { UserGuard } from '../user.guard';
import { CheckoutService } from './checkout.service';
import { DeliveriesService } from './deliveries.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RiderController } from './rider.controller';
import { SellerOrdersController } from './seller-orders.controller';

@Module({
  imports: [DiscountCodesModule],
  controllers: [OrdersController, SellerOrdersController, RiderController],
  providers: [
    CheckoutService,
    OrdersService,
    DeliveriesService,
    MailService,
    PrismaService,
    RiderGuard,
    SellerGuard,
    UserGuard,
  ],
})
export class OrdersModule {}
