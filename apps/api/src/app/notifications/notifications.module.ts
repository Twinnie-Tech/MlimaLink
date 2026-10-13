import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin.guard';
import { PrismaService } from '../prisma.service';
import { SellerGuard } from '../seller.guard';
import { UserGuard } from '../user.guard';
import {
  AdminNotificationsController,
  NotificationsController,
  SellerNotificationsController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [
    NotificationsController,
    SellerNotificationsController,
    AdminNotificationsController,
  ],
  providers: [
    NotificationsService,
    PrismaService,
    UserGuard,
    SellerGuard,
    AdminGuard,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
