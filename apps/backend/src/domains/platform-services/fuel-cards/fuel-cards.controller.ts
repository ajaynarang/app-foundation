import { Controller, Get, Put, Post, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { FuelCardsService } from './fuel-cards.service';
import { UpdateFuelCardTypeDto } from './dto/update-fuel-card-type.dto';
import { SetBrandAcceptanceDto } from './dto/set-brand-acceptance.dto';

@Controller('fuel-cards')
export class FuelCardsController {
  constructor(private readonly fuelCardsService: FuelCardsService) {}

  // Platform-level reference data — accessible to any authenticated user
  @Get('types')
  getActiveCardTypes() {
    return this.fuelCardsService.getActiveCardTypes();
  }

  // ── Super Admin Only ──

  @Get('admin/types')
  @Roles(UserRole.SUPER_ADMIN)
  getAllCardTypes() {
    return this.fuelCardsService.getAllCardTypes();
  }

  @Put('admin/types/:id')
  @Roles(UserRole.SUPER_ADMIN)
  updateCardType(@Param('id') id: string, @Body() body: UpdateFuelCardTypeDto) {
    return this.fuelCardsService.updateCardType(id, body);
  }

  @Get('admin/brand-acceptance')
  @Roles(UserRole.SUPER_ADMIN)
  getBrandAcceptanceMap() {
    return this.fuelCardsService.getBrandAcceptanceMap();
  }

  @Post('admin/brand-acceptance')
  @Roles(UserRole.SUPER_ADMIN)
  setBrandAcceptance(@Body() body: SetBrandAcceptanceDto) {
    return this.fuelCardsService.setBrandAcceptance(body.brand, body.fuelCardTypeIds);
  }

  @Delete('admin/brand-acceptance/:brand')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(204)
  deleteBrand(@Param('brand') brand: string) {
    return this.fuelCardsService.deleteBrand(decodeURIComponent(brand));
  }
}
