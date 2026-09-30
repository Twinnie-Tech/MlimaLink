import { Module } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { ProductImagesModule } from '../product-images/product-images.module';
import { SellerGuard } from '../seller.guard';
import { UserGuard } from '../user.guard';
import { ProvidersController } from './providers.controller';
import { SellerServiceProfileController } from './seller-service-profile.controller';
import { SellerServiceRequestsController } from './seller-service-requests.controller';
import { ServiceProfilesService } from './service-profiles.service';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequestsService } from './service-requests.service';

@Module({
  imports: [ProductImagesModule],
  controllers: [
    ProvidersController,
    SellerServiceProfileController,
    ServiceRequestsController,
    SellerServiceRequestsController,
  ],
  providers: [
    ServiceProfilesService,
    ServiceRequestsService,
    MailService,
    PrismaService,
    SellerGuard,
    UserGuard,
  ],
})
export class ServicesModule {}
