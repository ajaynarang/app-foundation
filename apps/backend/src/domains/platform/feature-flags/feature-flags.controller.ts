import { Controller, Get, Param, Put, Body, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagDto, FeatureFlagsResponse, UpdateFeatureFlagDto } from './dto/feature-flag.dto';
import { Public } from '../../../auth/decorators/public.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';

@ApiTags('Feature Flags')
@Controller('feature-flags')
export class FeatureFlagsController {
  private readonly logger = new Logger(FeatureFlagsController.name);

  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all feature flags' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Feature flags retrieved successfully',
    type: FeatureFlagsResponse,
  })
  async getAllFlags(): Promise<FeatureFlagsResponse> {
    const flags = await this.featureFlagsService.getAllFlags();
    return { flags };
  }

  @Get(':key')
  @Public()
  @ApiOperation({ summary: 'Get specific feature flag by key' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Feature flag retrieved successfully',
    type: FeatureFlagDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Feature flag not found',
  })
  async getFlagByKey(@Param('key') key: string): Promise<FeatureFlagDto> {
    const flag = await this.featureFlagsService.getFlagByKey(key);

    if (!flag) {
      throw new NotFoundException('Feature flag not found');
    }

    return flag;
  }

  @Get(':key/enabled')
  @Public()
  @ApiOperation({ summary: 'Check if feature is enabled' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Feature enabled status',
    schema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        enabled: { type: 'boolean' },
      },
    },
  })
  async isEnabled(@Param('key') key: string): Promise<{ key: string; enabled: boolean }> {
    const enabled = await this.featureFlagsService.isEnabled(key);
    return { key, enabled };
  }

  @Put(':key')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update feature flag enabled status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Feature flag updated successfully',
    type: FeatureFlagDto,
  })
  async updateFlag(@Param('key') key: string, @Body() updateDto: UpdateFeatureFlagDto): Promise<FeatureFlagDto> {
    return this.featureFlagsService.toggleFlag(key, updateDto.enabled);
  }
}
