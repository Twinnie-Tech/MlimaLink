import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { validationError } from '@org/errors';
import type { ApiResponse, DiscountCode } from '@org/models';
import { describeDiscount, parseDiscountCodeInput } from '@org/models/checkout';
import { SellerGuard, type SellerRequest } from '../seller.guard';
import { DiscountCodesService } from './discount-codes.service';

@ApiTags('seller discount codes')
@ApiCookieAuth()
@UseGuards(SellerGuard)
@Controller('seller/discount-codes')
export class SellerDiscountCodesController {
  constructor(private readonly discountCodes: DiscountCodesService) {}

  @Get()
  @ApiOperation({ summary: "List the signed-in seller's discount codes" })
  @ApiOkResponse({ description: 'Codes, newest first' })
  async list(@Req() req: SellerRequest): Promise<ApiResponse<DiscountCode[]>> {
    return { success: true, data: await this.discountCodes.list(req.shop.id) };
  }

  @Post()
  @ApiOperation({ summary: "Create a code for money off the shop's products" })
  async create(
    @Req() req: SellerRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<DiscountCode>> {
    const parsed = parseDiscountCodeInput(body);
    if ('error' in parsed) {
      throw validationError(parsed.error);
    }

    const discount = await this.discountCodes.create(
      req.shop.id,
      parsed.discount,
    );
    return {
      success: true,
      message: `${discount.code} is live: ${describeDiscount(discount)} ${
        discount.productIds
          ? `${discount.productIds.length} chosen ${discount.productIds.length === 1 ? 'product' : 'products'}`
          : `${req.shop.name} products`
      }.`,
      data: discount,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Pause or resume a code' })
  async update(
    @Req() req: SellerRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<DiscountCode>> {
    const active = (body as { active?: unknown } | null)?.active;
    if (typeof active !== 'boolean') {
      throw validationError('Say whether the code should be active.');
    }

    const discount = await this.discountCodes.setActive(
      req.shop.id,
      id,
      active,
    );
    return {
      success: true,
      message: `${discount.code} is ${active ? 'live again' : 'paused'}.`,
      data: discount,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a code' })
  async remove(
    @Req() req: SellerRequest,
    @Param('id') id: string,
  ): Promise<ApiResponse<null>> {
    await this.discountCodes.remove(req.shop.id, id);
    return { success: true, message: 'Discount code deleted.', data: null };
  }
}
