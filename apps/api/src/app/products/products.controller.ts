import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type {
  ApiResponse,
  PaginatedResponse,
  Product,
  ProductFilter,
} from '@org/models';
import { notFound } from '@org/errors';
import { ProductsApiService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsApiService: ProductsApiService) {}

  @Get()
  @ApiOperation({
    summary: 'List products with optional filters and pagination',
  })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
  @ApiQuery({ name: 'inStock', required: false, type: Boolean })
  @ApiQuery({ name: 'searchTerm', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({ description: 'Paginated products response' })
  async getProducts(
    @Query('category') category?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('inStock') inStock?: string,
    @Query('searchTerm') searchTerm?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '10',
  ): Promise<ApiResponse<PaginatedResponse<Product>>> {
    const filter: ProductFilter = {};

    if (category) {
      filter.category = category;
    }
    if (minPrice !== undefined) {
      filter.minPrice = Number(minPrice);
    }
    if (maxPrice !== undefined) {
      filter.maxPrice = Number(maxPrice);
    }
    if (inStock !== undefined) {
      filter.inStock = inStock === 'true';
    }
    if (searchTerm) {
      filter.searchTerm = searchTerm;
    }

    const result = await this.productsApiService.getProducts(
      filter,
      Number(page) || 1,
      Number(pageSize) || 10,
    );

    return {
      data: result,
      success: true,
    };
  }

  @Get('categories')
  @ApiOperation({ summary: 'List product categories' })
  @ApiOkResponse({ description: 'Categories response' })
  async getCategories(): Promise<ApiResponse<string[]>> {
    return {
      data: await this.productsApiService.getCategories(),
      success: true,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by id' })
  @ApiOkResponse({ description: 'Product response' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async getProductById(@Param('id') id: string): Promise<ApiResponse<Product>> {
    const product = await this.productsApiService.getProductById(id);

    if (!product) {
      throw notFound('Product', { id });
    }

    return {
      data: product,
      success: true,
    };
  }

  @Get(':id/images/:index')
  @ApiOperation({ summary: 'Get one of a product’s photos' })
  @ApiNotFoundResponse({ description: 'Photo not found' })
  async getProductImage(
    @Param('id') id: string,
    @Param('index') index: string,
    @Res() res: Response,
  ) {
    const image = /^\d+$/.test(index)
      ? await this.productsApiService.getProductImage(id, Number(index))
      : undefined;

    if (!image) {
      throw notFound('Photo', { id, index });
    }

    res
      .type(image.contentType)
      .set('Cache-Control', 'public, max-age=86400')
      .send(image.body);
  }
}
