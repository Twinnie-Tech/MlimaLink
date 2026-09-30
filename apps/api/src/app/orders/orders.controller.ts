import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { validationError } from '@org/errors';
import type { ApiResponse, CheckoutQuote, Order } from '@org/models';
import {
  parseCheckoutCode,
  parseCheckoutInput,
  parseCheckoutItems,
} from '@org/models/delivery';
import { UserGuard, type UserRequest } from '../user.guard';
import { CheckoutService } from './checkout.service';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersService,
  ) {}

  @Post('quote')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary:
      'Price the cart per shop with delivery fees ({ items, discountCode? })',
  })
  async quote(@Body() body: unknown): Promise<ApiResponse<CheckoutQuote>> {
    const input = (body ?? {}) as Record<string, unknown>;
    const items = parseCheckoutItems(input.items);
    if ('error' in items) throw validationError(items.error);
    const code = parseCheckoutCode(input.discountCode);
    if ('error' in code) throw validationError(code.error);
    return {
      success: true,
      data: await this.checkout.quote(items.items, code.discountCode),
    };
  }

  @Post()
  @UseGuards(UserGuard)
  @ApiCookieAuth()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary:
      'Place orders from the cart, one per shop ({ items, address, discountCode? })',
  })
  async place(
    @Req() req: UserRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<Order[]>> {
    const parsed = parseCheckoutInput(body);
    if ('error' in parsed) throw validationError(parsed.error);
    const orders = await this.checkout.place(req.user, parsed.checkout);
    return {
      success: true,
      message:
        orders.length === 1
          ? `Order ${orders[0].number} placed.`
          : `${orders.length} orders placed, one per shop.`,
      data: orders,
    };
  }

  @Get('mine')
  @UseGuards(UserGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'The signed-in shopper’s orders, newest first' })
  async mine(@Req() req: UserRequest): Promise<ApiResponse<Order[]>> {
    return { success: true, data: await this.orders.listForUser(req.user.id) };
  }

  @Get('mine/:id')
  @UseGuards(UserGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'One of the shopper’s orders with its delivery' })
  async one(
    @Req() req: UserRequest,
    @Param('id') id: string,
  ): Promise<ApiResponse<Order>> {
    return {
      success: true,
      data: await this.orders.getForUser(req.user.id, id),
    };
  }

  @Post('mine/:id/cancel')
  @HttpCode(200)
  @UseGuards(UserGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Cancel an order the shop hasn’t confirmed yet' })
  async cancel(
    @Req() req: UserRequest,
    @Param('id') id: string,
  ): Promise<ApiResponse<Order>> {
    const order = await this.orders.cancelForUser(req.user, id);
    return {
      success: true,
      message: `Order ${order.number} cancelled.`,
      data: order,
    };
  }
}
