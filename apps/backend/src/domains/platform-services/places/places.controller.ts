import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AutocompleteResponse } from '@sally/shared-types';
import { FEATURE_KEYS } from '@sally/shared-types';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../../auth/decorators/require-feature.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../shared/base/base-tenant.controller';
import { AutocompleteQueryDto } from './dto/autocomplete-query.dto';
import { PlacesService } from './places.service';

const AUTOCOMPLETE_RATE = { default: { ttl: 60_000, limit: 60 } } as const;

@ApiTags('Places')
@ApiBearerAuth()
@Controller('places')
@RequireFeature(FEATURE_KEYS.PLACES_AUTOCOMPLETE)
export class PlacesController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly placesService: PlacesService,
  ) {
    super(prisma);
  }

  @Get('autocomplete')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.CUSTOMER)
  @Throttle(AUTOCOMPLETE_RATE)
  @ApiOperation({
    summary: 'Address autocomplete suggestions',
    description:
      'Free-text autocomplete via the configured places provider (HERE by default). ' +
      'Returns ranked US-only suggestions with inline coordinates so callers can persist ' +
      'a Stop without a separate geocode round-trip. Rate-limited to 60 req/min per IP.',
  })
  async autocomplete(@CurrentUser() user: any, @Query() query: AutocompleteQueryDto): Promise<AutocompleteResponse> {
    const tenantDbId = await this.getTenantDbId(user);
    const results = await this.placesService.autocomplete(tenantDbId, {
      q: query.q,
      country: query.country,
      sessionToken: query.sessionToken,
      limit: query.limit,
    });
    return { results };
  }
}
