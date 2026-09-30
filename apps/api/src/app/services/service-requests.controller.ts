import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { validationError } from '@org/errors';
import type { ApiResponse, ServiceRequest } from '@org/models';
import { parseServiceRequestInput } from '@org/models/services';
import { UserGuard, type UserRequest } from '../user.guard';
import { ServiceRequestsService } from './service-requests.service';

@ApiTags('service requests')
@ApiCookieAuth()
@UseGuards(UserGuard)
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(private readonly requests: ServiceRequestsService) {}

  @Post()
  @Throttle({ default: { ttl: 600_000, limit: 10 } })
  @ApiOperation({
    summary:
      'Ask a provider for a service ({ productId, details, budget?, neededBy?, phone? })',
  })
  async create(
    @Req() req: UserRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<ServiceRequest>> {
    const parsed = parseServiceRequestInput(body);
    if ('error' in parsed) {
      throw validationError(parsed.error);
    }
    const request = await this.requests.create(req.user, parsed.request);
    return {
      success: true,
      message: `Request sent. ${request.shopName} will get back to you by email.`,
      data: request,
    };
  }

  @Get('mine')
  @ApiOperation({ summary: "The signed-in shopper's service requests" })
  async mine(@Req() req: UserRequest): Promise<ApiResponse<ServiceRequest[]>> {
    return {
      success: true,
      data: await this.requests.listForUser(req.user.id),
    };
  }
}
