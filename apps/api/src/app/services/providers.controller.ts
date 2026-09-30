import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ApiResponse, Provider } from '@org/models';
import { ServiceProfilesService } from './service-profiles.service';

@ApiTags('providers')
@Controller('providers')
export class ProvidersController {
  constructor(private readonly profiles: ServiceProfilesService) {}

  @Get(':shopId')
  @ApiOperation({
    summary: "A service provider's public profile and service listings",
  })
  async get(@Param('shopId') shopId: string): Promise<ApiResponse<Provider>> {
    return { success: true, data: await this.profiles.getProvider(shopId) };
  }
}
