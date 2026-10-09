import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { validationError } from '@org/errors';
import type {
  Admin,
  AdminOrder,
  AdminOverview,
  AdminPayments,
  AdminProduct,
  AdminSeller,
  AdminUser,
  ApiResponse,
  PaginatedResponse,
} from '@org/models';
import { parseAdminListQuery, parseSuspension } from '@org/models/admin';
import { AdminGuard } from '../admin.guard';
import { AdminService } from './admin.service';

function suspension(body: unknown): boolean {
  const parsed = parseSuspension(body);
  if ('error' in parsed) throw validationError(parsed.error);
  return parsed.suspended;
}

@ApiTags('admin')
@ApiCookieAuth('adminAccessToken')
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  @ApiOperation({
    summary:
      'Dashboard figures: totals, the last six months, account, device and country breakdowns, recent orders and top shops',
  })
  async overview(): Promise<ApiResponse<AdminOverview>> {
    return { success: true, data: await this.admin.overview() };
  }

  @Get('users')
  @ApiOperation({
    summary: 'Shoppers, newest first (?search=&page=&suspended=)',
  })
  async users(
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<PaginatedResponse<AdminUser>>> {
    return {
      success: true,
      data: await this.admin.listUsers(parseAdminListQuery(query)),
    };
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Suspend or restore a shopper ({ suspended })' })
  async updateUser(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<AdminUser>> {
    const user = await this.admin.setUserSuspended(id, suspension(body));
    return {
      success: true,
      message: user.suspended
        ? `${user.name} is suspended and can no longer sign in.`
        : `${user.name} can sign in again.`,
      data: user,
    };
  }

  @Get('sellers')
  @ApiOperation({
    summary:
      'Sellers and their shops, newest first (?search=&page=&suspended=)',
  })
  async sellers(
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<PaginatedResponse<AdminSeller>>> {
    return {
      success: true,
      data: await this.admin.listSellers(parseAdminListQuery(query)),
    };
  }

  @Patch('sellers/:id')
  @ApiOperation({ summary: 'Suspend or restore a seller ({ suspended })' })
  async updateSeller(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<AdminSeller>> {
    const seller = await this.admin.setSellerSuspended(id, suspension(body));
    return {
      success: true,
      message: seller.suspended
        ? `${seller.name} is suspended and can no longer sign in or manage their shop.`
        : `${seller.name} can sign in again.`,
      data: seller,
    };
  }

  @Get('orders')
  @ApiOperation({
    summary: 'Every order, newest first (?search=&page=&status=)',
  })
  async orders(
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<PaginatedResponse<AdminOrder>>> {
    return {
      success: true,
      data: await this.admin.listOrders(parseAdminListQuery(query)),
    };
  }

  @Get('products')
  @ApiOperation({
    summary: 'Every listing, newest first (?search=&page=&onSale=true)',
  })
  async products(
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<PaginatedResponse<AdminProduct>>> {
    return {
      success: true,
      data: await this.admin.listProducts(parseAdminListQuery(query)),
    };
  }

  @Get('admins')
  @ApiOperation({ summary: 'Admin accounts, oldest first (?search=&page=)' })
  async admins(
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<PaginatedResponse<Admin>>> {
    return {
      success: true,
      data: await this.admin.listAdmins(parseAdminListQuery(query)),
    };
  }

  @Get('payments')
  @ApiOperation({
    summary:
      'How order money is split between MlimaLink and shops, with settled and pending totals',
  })
  async payments(
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<AdminPayments>> {
    return {
      success: true,
      data: await this.admin.payments(parseAdminListQuery(query)),
    };
  }
}
