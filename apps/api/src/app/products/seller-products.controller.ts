import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import type { ApiResponse, Product } from '@org/models';
import { parseProductInput } from '@org/models/catalog';
import { SellerGuard, type SellerRequest } from '../seller.guard';
import { ProductsApiService } from './products.service';
import { sanitizeDescription } from './rich-text';

@ApiTags('seller products')
@ApiCookieAuth()
@UseGuards(SellerGuard)
@Controller('seller/products')
export class SellerProductsController {
  constructor(private readonly productsApiService: ProductsApiService) {}

  @Get()
  @ApiOperation({ summary: "List the signed-in seller's products" })
  @ApiOkResponse({ description: 'Products, newest first' })
  async list(@Req() req: SellerRequest): Promise<ApiResponse<Product[]>> {
    return {
      success: true,
      data: await this.productsApiService.listShopProducts(req.shop.id),
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Add a product, with one variant per combination of its options',
  })
  async create(
    @Req() req: SellerRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<Product>> {
    const parsed = parseProductInput(body);
    if ('error' in parsed) {
      throw validationError(parsed.error);
    }

    const product = await this.productsApiService.createProduct(req.shop.id, {
      ...parsed.product,
      description: sanitizeDescription(parsed.product.description),
    });
    return {
      success: true,
      message: `${product.name} is now listed in ${req.shop.name}.`,
      data: product,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove one of the seller’s products' })
  async remove(
    @Req() req: SellerRequest,
    @Param('id') id: string,
  ): Promise<ApiResponse<null>> {
    await this.productsApiService.deleteProduct(req.shop.id, id);
    return { success: true, message: 'Product removed.', data: null };
  }
}
