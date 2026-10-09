import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AppliedDiscount, ApiResponse } from '@org/models';
import { describeDiscount, discountScope } from '@org/models/checkout';
import { DiscountCodesService, parseCartItems } from './discount-codes.service';

@ApiTags('discount codes')
@Controller('discount-codes')
export class DiscountCodesController {
  constructor(private readonly discountCodes: DiscountCodesService) {}

  @Post('apply')
  @HttpCode(200)
  // Tighter than the default so codes can't be guessed by brute force.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: 'Check a code against the cart and work out the saving',
  })
  @ApiOkResponse({ description: 'The saving and the cart lines it covers' })
  async apply(@Body() body: unknown): Promise<ApiResponse<AppliedDiscount>> {
    const { code, items } = (body ?? {}) as { code?: unknown; items?: unknown };
    const applied = await this.discountCodes.apply(code, parseCartItems(items));
    return {
      success: true,
      message: `${applied.code} applied: ${describeDiscount(applied)} ${discountScope(applied)}.`,
      data: applied,
    };
  }
}
