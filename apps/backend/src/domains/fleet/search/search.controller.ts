import { Controller, Get, Query, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SearchService } from './search.service';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly prisma: PrismaService,
  ) {}

  private async getTenantDbId(user: any): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId: user.tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant.id;
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary:
      'Search across loads, drivers, customers, invoices, settlements, vehicles, trips, trailers, and recurring lanes',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Search query (min 2 chars)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max results per entity type',
    type: Number,
  })
  async search(@CurrentUser() user: any, @Query('q') q: string, @Query('limit') limit?: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50) : 10;

    return this.searchService.search(tenantDbId, q ?? '', parsedLimit);
  }
}
