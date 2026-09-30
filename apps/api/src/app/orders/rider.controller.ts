import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { validationError } from '@org/errors';
import type { ApiResponse, RiderJob, RiderProfile } from '@org/models';
import { parseLocation, parseRiderProfileInput } from '@org/models/delivery';
import { RiderGuard, type RiderRequest } from '../rider.guard';
import { DeliveriesService } from './deliveries.service';

/** A position sent alongside an action; ignored when the phone didn't share one. */
function optionalPoint(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>;
  if (input.lat === undefined && input.lng === undefined) return undefined;
  const point = parseLocation(input);
  if ('error' in point) throw validationError(point.error);
  return point;
}

@ApiTags('rider')
@ApiCookieAuth()
@UseGuards(RiderGuard)
@Controller('rider')
export class RiderController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get('profile')
  @ApiOperation({ summary: 'The rider’s vehicle, towns and availability' })
  async profile(@Req() req: RiderRequest): Promise<ApiResponse<RiderProfile>> {
    return { success: true, data: await this.deliveries.profile(req.rider) };
  }

  @Put('profile')
  @ApiOperation({
    summary:
      'Save vehicle, towns and availability ({ vehicle, zones, available })',
  })
  async saveProfile(
    @Req() req: RiderRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<RiderProfile>> {
    const parsed = parseRiderProfileInput(body);
    if ('error' in parsed) throw validationError(parsed.error);
    const profile = await this.deliveries.saveProfile(
      req.rider,
      parsed.profile,
    );
    return {
      success: true,
      message: profile.available
        ? 'Saved. You’re taking jobs.'
        : 'Saved. You’re not taking jobs right now.',
      data: profile,
    };
  }

  @Get('jobs')
  @ApiOperation({
    summary: 'Offers made to the rider and open jobs in their towns',
  })
  async jobs(@Req() req: RiderRequest): Promise<ApiResponse<RiderJob[]>> {
    return { success: true, data: await this.deliveries.jobs(req.rider) };
  }

  @Post('jobs/:id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Take a job; the first rider to accept gets it' })
  async accept(
    @Req() req: RiderRequest,
    @Param('id') id: string,
  ): Promise<ApiResponse<RiderJob>> {
    return {
      success: true,
      message: 'Job accepted. Head to the shop to collect it.',
      data: await this.deliveries.accept(req.rider, id),
    };
  }

  @Post('jobs/:id/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Turn down a job a seller offered you' })
  async decline(
    @Req() req: RiderRequest,
    @Param('id') id: string,
  ): Promise<ApiResponse<null>> {
    await this.deliveries.decline(req.rider, id);
    return { success: true, message: 'Offer declined.', data: null };
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'Jobs the rider has taken, most recent first' })
  async mine(@Req() req: RiderRequest): Promise<ApiResponse<RiderJob[]>> {
    return {
      success: true,
      data: await this.deliveries.myDeliveries(req.rider),
    };
  }

  @Post('deliveries/:id/pickup')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark the order collected from the shop ({ lat?, lng? })',
  })
  async pickUp(
    @Req() req: RiderRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<RiderJob>> {
    return {
      success: true,
      message: 'Picked up. The shopper has been told you’re on the way.',
      data: await this.deliveries.pickUp(req.rider, id, optionalPoint(body)),
    };
  }

  @Post('deliveries/:id/deliver')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary:
      'Complete the delivery with the shopper’s code ({ code, lat?, lng? })',
  })
  async deliver(
    @Req() req: RiderRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<RiderJob>> {
    const { code } = (body ?? {}) as { code?: unknown };
    if (typeof code !== 'string' || !code.trim()) {
      throw validationError('Enter the 4-digit code from the shopper.');
    }
    return {
      success: true,
      message: 'Delivered. Nice work!',
      data: await this.deliveries.deliver(
        req.rider,
        id,
        code.trim(),
        optionalPoint(body),
      ),
    };
  }

  @Post('deliveries/:id/location')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: 'Share where you are on a delivery ({ lat, lng })',
  })
  async location(
    @Req() req: RiderRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<null>> {
    const point = parseLocation(body);
    if ('error' in point) throw validationError(point.error);
    await this.deliveries.shareLocation(req.rider, id, point);
    return { success: true, message: 'Location shared.', data: null };
  }
}
