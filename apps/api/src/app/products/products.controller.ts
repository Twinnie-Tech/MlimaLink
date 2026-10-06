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
  ProductFacets,
  ProductFilter,
} from '@org/models';
import { PRODUCT_SORTS, isProductSort } from '@org/models/catalog';
import { notFound } from '@org/errors';
import { MAX_OFFERS, ProductsApiService } from './products.service';

const MAX_PAGE_SIZE = 48;

const positiveInt = (value: string | undefined, fallback: number) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const price = (value: string | undefined) => {
  if (value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

/** "Black,Red" or a repeated query parameter, as a list without blanks. */
const list = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value : (value?.split(',') ?? []))
    .map((item) => item.trim())
    .filter(Boolean);

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsApiService: ProductsApiService) {}

  @Get()
  @ApiOperation({
    summary: 'List products with optional filters, sorting and pagination',
  })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'subCategory', required: false })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
  @ApiQuery({ name: 'inStock', required: false, type: Boolean })
  @ApiQuery({ name: 'onSale', required: false, type: Boolean })
  @ApiQuery({
    name: 'colors',
    required: false,
    description: 'Comma-separated, e.g. Black,Red',
  })
  @ApiQuery({
    name: 'sizes',
    required: false,
    description: 'Comma-separated, e.g. M,L',
  })
  @ApiQuery({ name: 'minRating', required: false, type: Number })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: PRODUCT_SORTS.map((sort) => sort.id),
  })
  @ApiQuery({ name: 'searchTerm', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({ description: 'Paginated products response' })
  async getProducts(
    @Query('category') category?: string,
    @Query('subCategory') subCategory?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('inStock') inStock?: string,
    @Query('onSale') onSale?: string,
    @Query('colors') colors?: string | string[],
    @Query('sizes') sizes?: string | string[],
    @Query('minRating') minRating?: string,
    @Query('sort') sort?: string,
    @Query('searchTerm') searchTerm?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ApiResponse<PaginatedResponse<Product>>> {
    const filter: ProductFilter = {};

    if (category) filter.category = category;
    if (subCategory) filter.subCategory = subCategory;
    const min = price(minPrice);
    if (min !== undefined) filter.minPrice = min;
    const max = price(maxPrice);
    if (max !== undefined) filter.maxPrice = max;
    if (inStock !== undefined) filter.inStock = inStock === 'true';
    if (onSale === 'true') filter.onSale = true;
    const colorList = list(colors);
    if (colorList.length) filter.colors = colorList;
    const sizeList = list(sizes);
    if (sizeList.length) filter.sizes = sizeList;
    const rating = Number(minRating);
    if (rating >= 1 && rating <= 5) filter.minRating = rating;
    if (isProductSort(sort)) filter.sort = sort;
    if (searchTerm) filter.searchTerm = searchTerm;

    const result = await this.productsApiService.getProducts(
      filter,
      positiveInt(page, 1),
      Math.min(positiveInt(pageSize, 10), MAX_PAGE_SIZE),
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

  @Get('facets')
  @ApiOperation({
    summary:
      'Categories, sub-categories, colours, sizes and price span to filter by',
  })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'searchTerm', required: false })
  @ApiOkResponse({ description: 'Facets response' })
  async getFacets(
    @Query('category') category?: string,
    @Query('searchTerm') searchTerm?: string,
  ): Promise<ApiResponse<ProductFacets>> {
    return {
      data: await this.productsApiService.getFacets({
        ...(category && { category }),
        ...(searchTerm && { searchTerm }),
      }),
      success: true,
    };
  }

  @Get('offers')
  @ApiOperation({
    summary: 'In-stock products on sale, biggest discount first',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Products on offer' })
  async getOffers(
    @Query('limit') limit?: string,
  ): Promise<ApiResponse<Product[]>> {
    return {
      data: await this.productsApiService.getOffers(
        Math.min(positiveInt(limit, MAX_OFFERS), MAX_OFFERS),
      ),
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
