import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { validationError } from '@org/errors';
import type {
  ApiResponse,
  AvailableRider,
  DeliverySettings,
  Order,
} from '@org/models';
import { parseDeliverySettings, parseOrderUpdate } from '@org/models/delivery';
import { SellerGuard, type SellerRequest } from '../seller.guard';
import { DeliveriesService } from './deliveries.service';
import { OrdersService } from './orders.service';

@ApiTags('seller orders')
@ApiCookieAuth()
@UseGuards(SellerGuard)
@Controller('seller')
export class SellerOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly deliveries: DeliveriesService,
  ) {}

  @Get('orders')
  @ApiOperation({ summary: 'Orders placed with the shop, newest first' })
  async list(@Req() req: SellerRequest): Promise<ApiResponse<Order[]>> {
    return { success: true, data: await this.orders.listForShop(req.shop) };
  }

  @Patch('orders/:id')
  @ApiOperation({
    summary:
      'Confirm or cancel an order ({ status, note? }); the shopper is emailed',
  })
  async update(
    @Req() req: SellerRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<Order>> {
    const parsed = parseOrderUpdate(body);
    if ('error' in parsed) throw validationError(parsed.error);
    const order = await this.orders.updateForShop(
      req.shop,
      id,
      parsed.status,
      parsed.note,
    );
    return {
      success: true,
      message: `Order ${order.number} ${parsed.status}. ${order.buyerName} has been emailed.`,
      data: order,
    };
  }

  @Post('orders/:id/delivery')
  @ApiOperation({
    summary:
      'Ask for a rider: offer it to one ({ riderId }) or post it to every rider in your town ({})',
  })
  async requestDelivery(
    @Req() req: SellerRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<Order>> {
    const { riderId } = (body ?? {}) as { riderId?: unknown };
    if (riderId !== undefined && typeof riderId !== 'string') {
      throw validationError('Choose a rider from the list.');
    }
    const order = await this.deliveries.request(
      req.shop,
      id,
      riderId || undefined,
    );
    return {
      success: true,
      message: order.delivery?.offeredTo
        ? `Offered to ${order.delivery.offeredTo.name}. We’ll email you when they answer.`
        : 'Posted to riders in your town. The first to accept gets it.',
      data: order,
    };
  }

  @Delete('orders/:id/delivery')
  @ApiOperation({ summary: 'Withdraw a delivery request nobody has accepted' })
  async cancelDelivery(
    @Req() req: SellerRequest,
    @Param('id') id: string,
  ): Promise<ApiResponse<Order>> {
    return {
      success: true,
      message: 'Delivery request withdrawn.',
      data: await this.deliveries.cancelRequest(req.shop, id),
    };
  }

  @Get('riders')
  @ApiOperation({ summary: 'Riders taking jobs in the shop’s pickup town' })
  async riders(
    @Req() req: SellerRequest,
  ): Promise<ApiResponse<AvailableRider[]>> {
    return {
      success: true,
      data: await this.orders.availableRiders(req.shop),
    };
  }

  @Get('delivery-settings')
  @ApiOperation({ summary: 'The shop’s pickup town and delivery fee' })
  async settings(
    @Req() req: SellerRequest,
  ): Promise<ApiResponse<DeliverySettings>> {
    return {
      success: true,
      data: await this.orders.deliverySettings(req.shop),
    };
  }

  @Put('delivery-settings')
  @ApiOperation({
    summary: 'Save the pickup town and delivery fee ({ zone, fee })',
  })
  async saveSettings(
    @Req() req: SellerRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<DeliverySettings>> {
    const parsed = parseDeliverySettings(body);
    if ('error' in parsed) throw validationError(parsed.error);
    return {
      success: true,
      message: 'Delivery settings saved.',
      data: await this.orders.saveDeliverySettings(req.shop, parsed.settings),
    };
  }
}
