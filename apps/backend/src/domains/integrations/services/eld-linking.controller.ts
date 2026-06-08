import { Controller, Post, Delete, Get, Param, Body, Request, ParseIntPipe, Logger } from '@nestjs/common';
import { EldLinkingService, LinkResult } from './eld-linking.service';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/v1')
@Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
export class EldLinkingController {
  private readonly logger = new Logger(EldLinkingController.name);

  constructor(private readonly eldLinkingService: EldLinkingService) {}

  @Post('drivers/:id/link-eld')
  async linkDriver(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { eldId?: string },
    @Request() req,
  ): Promise<LinkResult> {
    const tenantId = req.user.tenantDbId;
    this.logger.log(`Link driver ${id} to ELD (tenant ${tenantId}, eldId: ${body.eldId ?? 'auto'})`);
    return this.eldLinkingService.linkDriver(tenantId, id, body.eldId);
  }

  @Delete('drivers/:id/link-eld')
  async unlinkDriver(@Param('id', ParseIntPipe) id: number, @Request() req): Promise<{ success: boolean }> {
    const tenantId = req.user.tenantDbId;
    this.logger.log(`Unlink driver ${id} from ELD (tenant ${tenantId})`);
    await this.eldLinkingService.unlinkDriver(tenantId, id);
    return { success: true };
  }

  @Post('vehicles/:id/link-eld')
  async linkVehicle(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { eldId?: string },
    @Request() req,
  ): Promise<LinkResult> {
    const tenantId = req.user.tenantDbId;
    this.logger.log(`Link vehicle ${id} to ELD (tenant ${tenantId}, eldId: ${body.eldId ?? 'auto'})`);
    return this.eldLinkingService.linkVehicle(tenantId, id, body.eldId);
  }

  @Delete('vehicles/:id/link-eld')
  async unlinkVehicle(@Param('id', ParseIntPipe) id: number, @Request() req): Promise<{ success: boolean }> {
    const tenantId = req.user.tenantDbId;
    this.logger.log(`Unlink vehicle ${id} from ELD (tenant ${tenantId})`);
    await this.eldLinkingService.unlinkVehicle(tenantId, id);
    return { success: true };
  }

  @Get('integrations/eld/drivers')
  async listEldDrivers(@Request() req) {
    const tenantId = req.user.tenantDbId;
    return this.eldLinkingService.listEldDrivers(tenantId);
  }

  @Get('integrations/eld/vehicles')
  async listEldVehicles(@Request() req) {
    const tenantId = req.user.tenantDbId;
    return this.eldLinkingService.listEldVehicles(tenantId);
  }
}
