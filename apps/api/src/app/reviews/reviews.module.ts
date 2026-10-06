import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UserGuard } from '../user.guard';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService, PrismaService, UserGuard],
})
export class ReviewsModule {}
