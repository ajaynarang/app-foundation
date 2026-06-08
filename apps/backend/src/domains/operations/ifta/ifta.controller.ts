import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Logger, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../../auth/decorators/require-feature.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { IftaService } from './services/ifta.service';
import { IftaMileageService } from './services/ifta-mileage.service';
import { IftaFuelService } from './services/ifta-fuel.service';
import { IftaTaxRateService } from './services/ifta-tax-rate.service';
import { CreateFuelPurchaseDto } from './dto/create-fuel-purchase.dto';
import { CreateManualMileageDto } from './dto/create-manual-mileage.dto';
import { UpdateFilingStatusDto } from './dto/update-filing-status.dto';
import { QueryQuartersDto } from './dto/query-quarters.dto';

@ApiTags('IFTA')
@Controller('ifta')
@RequireFeature('ifta')
export class IftaController {
  private readonly logger = new Logger(IftaController.name);

  constructor(
    private readonly iftaService: IftaService,
    private readonly mileageService: IftaMileageService,
    private readonly fuelService: IftaFuelService,
    private readonly taxRateService: IftaTaxRateService,
  ) {}

  @Get('quarters')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'List IFTA quarters for the current tenant' })
  async getQuarters(@CurrentUser() user: any, @Query() query: QueryQuartersDto) {
    return this.iftaService.getQuarters(user.tenantDbId, {
      year: query.year,
      status: query.status,
    });
  }

  @Get('quarters/:quarterId')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Get quarter detail with state mileage and fuel' })
  @ApiParam({ name: 'quarterId', description: 'IFTA Quarter ID' })
  async getQuarterDetail(@Param('quarterId', ParseIntPipe) quarterId: number, @CurrentUser() user: any) {
    return this.iftaService.getQuarterDetail(user.tenantDbId, quarterId);
  }

  @Get('quarters/:quarterId/summary')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Get quarter summary with deadline countdown' })
  @ApiParam({ name: 'quarterId', description: 'IFTA Quarter ID' })
  async getQuarterSummary(@Param('quarterId', ParseIntPipe) quarterId: number, @CurrentUser() user: any) {
    return this.iftaService.getQuarterSummary(user.tenantDbId, quarterId);
  }

  @Post('quarters/:quarterId/calculate')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Calculate IFTA tax for a quarter' })
  @ApiParam({ name: 'quarterId', description: 'IFTA Quarter ID' })
  async calculateQuarter(@Param('quarterId', ParseIntPipe) quarterId: number, @CurrentUser() user: any) {
    return this.iftaService.calculateQuarter(user.tenantDbId, quarterId);
  }

  @Patch('quarters/:quarterId/status')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Update filing status (state machine)' })
  @ApiParam({ name: 'quarterId', description: 'IFTA Quarter ID' })
  async updateFilingStatus(
    @Param('quarterId', ParseIntPipe) quarterId: number,
    @Body() dto: UpdateFilingStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.iftaService.updateFilingStatus(user.tenantDbId, quarterId, dto, user.dbId);
  }

  @Post('mileage')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Add or update manual mileage entry' })
  async addManualMileage(@Body() dto: CreateManualMileageDto, @CurrentUser() user: any) {
    return this.mileageService.addManualMileage(user.tenantDbId, dto);
  }

  @Get('quarters/:quarterId/mileage')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Get mileage entries for a quarter' })
  @ApiParam({ name: 'quarterId', description: 'IFTA Quarter ID' })
  async getQuarterMileage(@Param('quarterId', ParseIntPipe) quarterId: number, @CurrentUser() user: any) {
    return this.mileageService.getMileageForQuarter(user.tenantDbId, quarterId);
  }

  @Post('fuel')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER, UserRole.DRIVER)
  @ApiOperation({ summary: 'Record a fuel purchase' })
  async createFuelPurchase(@Body() dto: CreateFuelPurchaseDto, @CurrentUser() user: any) {
    return this.fuelService.createFuelPurchase(user.tenantDbId, {
      ...dto,
      createdById: user.dbId,
    });
  }

  @Get('quarters/:quarterId/fuel')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Get fuel purchases for a quarter' })
  @ApiParam({ name: 'quarterId', description: 'IFTA Quarter ID' })
  async getQuarterFuel(@Param('quarterId', ParseIntPipe) quarterId: number, @CurrentUser() user: any) {
    return this.fuelService.getFuelPurchases(user.tenantDbId, quarterId);
  }

  @Delete('fuel/:purchaseId')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Delete a fuel purchase' })
  @ApiParam({ name: 'purchaseId', description: 'Fuel Purchase ID' })
  async deleteFuelPurchase(@Param('purchaseId', ParseIntPipe) purchaseId: number, @CurrentUser() user: any) {
    await this.fuelService.deleteFuelPurchase(user.tenantDbId, purchaseId);
    return { deleted: true };
  }

  @Get('tax-rates')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Get current IFTA tax rates' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'quarter', required: false, type: Number })
  async getTaxRates(@CurrentUser() user: any, @Query('year') year?: string, @Query('quarter') quarter?: string) {
    const now = new Date();
    const y = year ? parseInt(year, 10) : now.getFullYear();
    const q = quarter ? parseInt(quarter, 10) : Math.ceil((now.getMonth() + 1) / 3);
    return this.taxRateService.getAllRatesForQuarter(y, q);
  }
}
