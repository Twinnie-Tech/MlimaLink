import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { validationError } from '@org/errors';
import type { ApiResponse } from '@org/models';
import { parseUserEventInput } from '@org/utils/events';
import { UserGuard, type UserRequest } from '../user.guard';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @HttpCode(202)
  @UseGuards(UserGuard)
  @ApiCookieAuth()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary:
      'Record what the signed-in shopper did on the user_events topic ({ action, productId?, shopId?, device?, country?, city? })',
  })
  async track(
    @Req() req: UserRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<{ tracked: boolean }>> {
    const parsed = parseUserEventInput(body);
    if ('error' in parsed) throw validationError(parsed.error);
    return {
      success: true,
      data: { tracked: await this.events.track(req.user.id, parsed.event) },
    };
  }
}
