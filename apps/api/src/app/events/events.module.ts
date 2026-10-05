import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UserGuard } from '../user.guard';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, PrismaService, UserGuard],
  exports: [EventsService],
})
export class EventsModule {}
