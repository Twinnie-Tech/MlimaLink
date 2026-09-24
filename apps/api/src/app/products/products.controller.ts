import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
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
  getProducts(
    @Query('category') category?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('inStock') inStock?: string,
    @Query('searchTerm') searchTerm?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '10',
  ): ApiResponse<PaginatedResponse<Product>> {
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

    const result = this.productsApiService.getProducts(
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
  getCategories(): ApiResponse<string[]> {
    return {
      data: this.productsApiService.getCategories(),
      success: true,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by id' })
  @ApiOkResponse({ description: 'Product response' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  getProductById(@Param('id') id: string): ApiResponse<Product> {
    const product = this.productsApiService.getProductById(id);

    if (!product) {
      throw notFound('Product', { id });
    }

    return {
      data: product,
      success: true,
    };
  }
}
