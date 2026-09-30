import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { validationError } from '@org/errors';
import type { ApiResponse, ServiceRequest } from '@org/models';
import {
  parseServiceRequestUpdate,
  serviceRequestStatusLabel,
} from '@org/models/services';
import { SellerGuard, type SellerRequest } from '../seller.guard';
import { ServiceRequestsService } from './service-requests.service';

@ApiTags('seller service requests')
@ApiCookieAuth()
@UseGuards(SellerGuard)
@Controller('seller/service-requests')
export class SellerServiceRequestsController {
  constructor(private readonly requests: ServiceRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Requests for the shop’s services, newest first' })
  async list(
    @Req() req: SellerRequest,
  ): Promise<ApiResponse<ServiceRequest[]>> {
    return { success: true, data: await this.requests.listForShop(req.shop) };
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Accept, decline or complete a request ({ status, note? }); the shopper is emailed',
  })
  async update(
    @Req() req: SellerRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<ServiceRequest>> {
    const parsed = parseServiceRequestUpdate(body);
    if ('error' in parsed) {
      throw validationError(parsed.error);
    }
    const request = await this.requests.update(
      req.shop,
      id,
      parsed.status,
      parsed.note,
    );
    return {
      success: true,
      message: `Request marked ${serviceRequestStatusLabel(request.status).toLowerCase()}. ${request.clientName} has been emailed.`,
      data: request,
    };
  }
}
