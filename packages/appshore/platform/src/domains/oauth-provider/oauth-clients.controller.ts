import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { OAuthClientsService } from './oauth-clients.service';
import { UpdateOAuthClientScopesDto } from './dto/update-oauth-client-scopes.dto';
import type { CreateOAuthClientInput, UpdateOAuthClientInput } from '@app/shared-types';

@ApiTags('OAuth Clients')
@Controller('oauth/clients')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
export class OAuthClientsController {
  constructor(private readonly clientsService: OAuthClientsService) {}

  private resolveTenantId(req: Request): number | null {
    const user = (req as unknown as { user: { role: UserRole; tenantDbId: number } }).user;
    return user.role === UserRole.SUPER_ADMIN ? null : user.tenantDbId;
  }

  @Post()
  @ApiOperation({ summary: 'Register a new OAuth client' })
  @ApiResponse({ status: 201, description: 'Client created' })
  async create(@Body() body: CreateOAuthClientInput, @Req() req: Request) {
    const user = (req as unknown as { user: { dbId: number } }).user;
    const tenantId = this.resolveTenantId(req);
    return this.clientsService.create(body, user.dbId, tenantId);
  }

  @Get()
  @ApiOperation({ summary: "List tenant's OAuth clients" })
  async findAll(@Req() req: Request) {
    return this.clientsService.findAll(this.resolveTenantId(req));
  }

  @Get(':clientId')
  @ApiOperation({ summary: 'Get OAuth client details' })
  async findOne(@Param('clientId') clientId: string, @Req() req: Request) {
    return this.clientsService.findByClientId(clientId, this.resolveTenantId(req));
  }

  @Put(':clientId')
  @ApiOperation({ summary: 'Update OAuth client' })
  async update(@Param('clientId') clientId: string, @Body() body: UpdateOAuthClientInput, @Req() req: Request) {
    return this.clientsService.update(clientId, body, this.resolveTenantId(req));
  }

  @Delete(':clientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke/delete OAuth client (cascades tokens)' })
  async revoke(@Param('clientId') clientId: string, @Req() req: Request) {
    return this.clientsService.revoke(clientId, this.resolveTenantId(req));
  }

  // ─── Phase D: the Desk admin surface ─────────────────────────

  @Post(':clientId/rotate-secret')
  @ApiOperation({
    summary:
      'Rotate the client secret (returns the new plaintext value once). Does NOT cascade-revoke existing tokens — use revoke for that.',
  })
  async rotateSecret(@Param('clientId') clientId: string, @Req() req: Request): Promise<{ clientSecret: string }> {
    return this.clientsService.rotateSecret(clientId, this.resolveTenantId(req));
  }

  @Post(':clientId/pause')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Pause the OAuth client (isActive=false); reversible via resume',
  })
  async pause(@Param('clientId') clientId: string, @Req() req: Request) {
    return this.clientsService.pause(clientId, this.resolveTenantId(req));
  }

  @Post(':clientId/resume')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Resume a paused OAuth client' })
  async resume(@Param('clientId') clientId: string, @Req() req: Request) {
    return this.clientsService.resume(clientId, this.resolveTenantId(req));
  }

  @Post(':clientId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke the OAuth client (sets isActive=false and cascades to active access + refresh tokens)',
  })
  async revokeViaAction(@Param('clientId') clientId: string, @Req() req: Request) {
    return this.clientsService.revoke(clientId, this.resolveTenantId(req));
  }

  @Patch(':clientId/scopes')
  @ApiOperation({
    summary: 'Update the grantable scope set on an OAuth client',
  })
  async updateScopes(
    @Param('clientId') clientId: string,
    @Body() body: UpdateOAuthClientScopesDto,
    @Req() req: Request,
  ) {
    return this.clientsService.updateScopes(clientId, this.resolveTenantId(req), body);
  }
}
