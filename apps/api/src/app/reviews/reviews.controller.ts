import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { validationError } from '@org/errors';
import type { ApiResponse, Review, ReviewPage } from '@org/models';
import { REVIEWS_PAGE_SIZE, parseReviewInput } from '@org/models/reviews';
import { optionalUserId, UserGuard, type UserRequest } from '../user.guard';
import { ReviewsService } from './reviews.service';

const MAX_PAGE_SIZE = 20;

const positiveInt = (value: string | undefined, fallback: number) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const pageSizeOf = (value: string | undefined) =>
  Math.min(positiveInt(value, REVIEWS_PAGE_SIZE), MAX_PAGE_SIZE);

function parseBody(body: unknown) {
  const parsed = parseReviewInput(body);
  if ('error' in parsed) throw validationError(parsed.error);
  return parsed.review;
}

const savedMessage = (updated: boolean) =>
  updated ? 'Your review was updated.' : 'Thanks for your review!';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('products/:id/reviews')
  @ApiOperation({
    summary:
      "A product's reviews, newest first, with totals and the shopper's own review",
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({ description: 'Paginated reviews with a summary' })
  async listForProduct(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ApiResponse<ReviewPage>> {
    return {
      success: true,
      data: await this.reviews.listProductReviews(
        id,
        positiveInt(page, 1),
        pageSizeOf(pageSize),
        optionalUserId(req),
      ),
    };
  }

  @Post('products/:id/reviews')
  @UseGuards(UserGuard)
  @ApiCookieAuth()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Review a product, or update your review ({ rating, comment? })',
  })
  async reviewProduct(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<Review>> {
    const { review, updated } = await this.reviews.saveProductReview(
      req.user.id,
      id,
      parseBody(body),
    );
    return { success: true, message: savedMessage(updated), data: review };
  }

  @Get('shops/:id/reviews')
  @ApiOperation({
    summary:
      "A shop's reviews, newest first, with totals and the shopper's own review",
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({ description: 'Paginated reviews with a summary' })
  async listForShop(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ApiResponse<ReviewPage>> {
    return {
      success: true,
      data: await this.reviews.listShopReviews(
        id,
        positiveInt(page, 1),
        pageSizeOf(pageSize),
        optionalUserId(req),
      ),
    };
  }

  @Post('shops/:id/reviews')
  @UseGuards(UserGuard)
  @ApiCookieAuth()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Review a shop, or update your review ({ rating, comment? })',
  })
  async reviewShop(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<Review>> {
    const { review, updated } = await this.reviews.saveShopReview(
      req.user.id,
      id,
      parseBody(body),
    );
    return { success: true, message: savedMessage(updated), data: review };
  }
}
