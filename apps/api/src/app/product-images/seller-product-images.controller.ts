import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { validationError } from '@org/errors';
import type { ApiResponse, UploadedImage } from '@org/models';
import { SellerGuard, type SellerRequest } from '../seller.guard';
import {
  ProductImagesService,
  parseImageUpload,
} from './product-images.service';

@ApiTags('seller product images')
@ApiCookieAuth()
@UseGuards(SellerGuard)
@Controller('seller/product-images')
export class SellerProductImagesController {
  constructor(private readonly productImages: ProductImagesService) {}

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary:
      'Upload a product photo ({ fileName, file: base64 data URL }) to ImageKit',
  })
  async uploadProductImage(
    @Req() req: SellerRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<UploadedImage>> {
    const parsed = parseImageUpload(body);
    if ('error' in parsed) {
      throw validationError(parsed.error);
    }

    return {
      success: true,
      message: 'Photo uploaded.',
      data: await this.productImages.upload(req.shop.id, parsed),
    };
  }

  @Delete(':fileId')
  @ApiOperation({ summary: 'Delete one of the shop’s product photos' })
  async deleteProductImage(
    @Req() req: SellerRequest,
    @Param('fileId') fileId: string,
  ): Promise<ApiResponse<null>> {
    await this.productImages.remove(req.shop.id, fileId);
    return { success: true, message: 'Photo deleted.', data: null };
  }
}
