import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { validationError } from '@org/errors';
import type { ApiResponse, OwnServiceProfile } from '@org/models';
import { parseServiceProfileInput } from '@org/models/services';
import { SellerGuard, type SellerRequest } from '../seller.guard';
import { ServiceProfilesService } from './service-profiles.service';

@ApiTags('seller service profile')
@ApiCookieAuth()
@UseGuards(SellerGuard)
@Controller('seller/service-profile')
export class SellerServiceProfileController {
  constructor(private readonly profiles: ServiceProfilesService) {}

  @Get()
  @ApiOperation({
    summary: "The seller's provider profile, or null before it's set up",
  })
  async get(
    @Req() req: SellerRequest,
  ): Promise<ApiResponse<OwnServiceProfile | null>> {
    return { success: true, data: await this.profiles.getOwn(req.shop) };
  }

  @Put()
  @ApiOperation({
    summary:
      'Create or replace the provider profile: skills, qualifications, experience and portfolio',
  })
  async save(
    @Req() req: SellerRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<OwnServiceProfile>> {
    const parsed = parseServiceProfileInput(body);
    if ('error' in parsed) {
      throw validationError(parsed.error);
    }
    return {
      success: true,
      message: 'Your provider profile is saved.',
      data: await this.profiles.save(req.shop, parsed.profile),
    };
  }
}
