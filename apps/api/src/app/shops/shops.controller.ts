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
  ShopDetail,
  ShopSummary,
} from '@org/models';
import { ShopsService } from './shops.service';

const MAX_PAGE_SIZE = 48;

const positiveInt = (value: string | undefined, fallback: number) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

@ApiTags('shops')
@Controller('shops')
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @Get()
  @ApiOperation({ summary: 'The shop directory, with search and filters' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'zone', required: false, description: 'Delivery town' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiOkResponse({ description: 'Paginated shops response' })
  async list(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('zone') zone?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ApiResponse<PaginatedResponse<ShopSummary>>> {
    return {
      success: true,
      data: await this.shops.listShops(
        { search, category, zone },
        positiveInt(page, 1),
        Math.min(positiveInt(pageSize, 12), MAX_PAGE_SIZE),
      ),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: "A shop's public page and products" })
  @ApiOkResponse({ description: 'Shop response' })
  @ApiNotFoundResponse({ description: 'Shop not found' })
  async get(@Param('id') id: string): Promise<ApiResponse<ShopDetail>> {
    return { success: true, data: await this.shops.getShop(id) };
  }
}
