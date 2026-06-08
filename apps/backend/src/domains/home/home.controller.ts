import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { BaseTenantController } from '../../shared/base/base-tenant.controller';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { HomeService } from './home.service';
import { HomePulseDto } from './dto/home-pulse.dto';
import { RecentLoadDto } from './dto/recent-load.dto';

@ApiTags('Home')
@ApiBearerAuth()
@Controller('home')
export class HomeController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly homeService: HomeService,
  ) {
    super(prisma);
  }

  @Get('pulse')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get operational vital signs for the home page' })
  async getPulse(@CurrentUser() user: any): Promise<HomePulseDto> {
    const tenantDbId = await this.getTenantDbId(user);
    return this.homeService.getPulse(tenantDbId);
  }

  @Get('recent-loads')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get last 5 recently updated loads' })
  async getRecentLoads(@CurrentUser() user: any): Promise<RecentLoadDto[]> {
    const tenantDbId = await this.getTenantDbId(user);
    return this.homeService.getRecentLoads(tenantDbId);
  }
}
