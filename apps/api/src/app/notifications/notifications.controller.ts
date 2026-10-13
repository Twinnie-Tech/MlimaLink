import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ApiResponse, Notification, NotificationList } from '@org/models';
import { parseNotificationQuery } from '@org/models/notifications';
import { AdminGuard, type AdminRequest } from '../admin.guard';
import { SellerGuard, type SellerRequest } from '../seller.guard';
import { UserGuard, type UserRequest } from '../user.guard';
import { NotificationsService } from './notifications.service';

/** The same routes for every account type; each controller says whose notifications they are. */
abstract class NotificationRoutes<R> {
  constructor(protected readonly notifications: NotificationsService) {}

  protected abstract receiverOf(req: R): string;

  @Get()
  @ApiOperation({
    summary:
      'Your notifications, newest first (?status=unread|read&limit=&before=)',
  })
  async list(
    @Req() req: R,
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<NotificationList>> {
    return {
      success: true,
      data: await this.notifications.list(
        this.receiverOf(req),
        parseNotificationQuery(query),
      ),
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'How many of your notifications are unread' })
  async status(@Req() req: R): Promise<ApiResponse<{ unread: number }>> {
    return {
      success: true,
      data: {
        unread: await this.notifications.unreadCount(this.receiverOf(req)),
      },
    };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all your notifications as read' })
  async markAllRead(@Req() req: R): Promise<ApiResponse<{ updated: number }>> {
    const updated = await this.notifications.markAllRead(this.receiverOf(req));
    return {
      success: true,
      message:
        updated === 0
          ? 'You’re all caught up.'
          : `${updated} ${updated === 1 ? 'notification' : 'notifications'} marked as read.`,
      data: { updated },
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one of your notifications as read' })
  async markRead(
    @Req() req: R,
    @Param('id') id: string,
  ): Promise<ApiResponse<Notification>> {
    return {
      success: true,
      data: await this.notifications.markRead(this.receiverOf(req), id),
    };
  }
}

@ApiTags('notifications')
@ApiCookieAuth()
@UseGuards(UserGuard)
@Controller('notifications')
export class NotificationsController extends NotificationRoutes<UserRequest> {
  constructor(notifications: NotificationsService) {
    super(notifications);
  }

  protected receiverOf(req: UserRequest) {
    return req.user.id;
  }
}

@ApiTags('seller notifications')
@ApiCookieAuth()
@UseGuards(SellerGuard)
@Controller('seller/notifications')
export class SellerNotificationsController extends NotificationRoutes<SellerRequest> {
  constructor(notifications: NotificationsService) {
    super(notifications);
  }

  protected receiverOf(req: SellerRequest) {
    return req.sellerId;
  }
}

@ApiTags('admin notifications')
@ApiCookieAuth()
@UseGuards(AdminGuard)
@Controller('admin/notifications')
export class AdminNotificationsController extends NotificationRoutes<AdminRequest> {
  constructor(notifications: NotificationsService) {
    super(notifications);
  }

  protected receiverOf(req: AdminRequest) {
    return req.admin.id;
  }
}
