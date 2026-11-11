import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { OAuthClientsService } from './oauth-clients.service';
import { UpdateOAuthClientScopesDto } from './dto/update-oauth-client-scopes.dto';
import type { CreateOAuthClientInput, OAuthClientResponse, UpdateOAuthClientInput } from '@app/shared-types';

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
  @HttpCode(HttpStatus.CREATED)
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

  @Get(':client_id')
  @ApiOperation({ summary: 'Get OAuth client details' })
  async findOne(@Param('client_id') clientId: string, @Req() req: Request) {
    return this.clientsService.findByClientId(clientId, this.resolveTenantId(req));
  }

  @Put(':client_id')
  @ApiOperation({ summary: 'Update OAuth client' })
  async update(@Param('client_id') clientId: string, @Body() body: UpdateOAuthClientInput, @Req() req: Request) {
    return this.clientsService.update(clientId, body, this.resolveTenantId(req));
  }

  @Delete(':client_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke/delete OAuth client (cascades tokens)' })
  async revoke(@Param('client_id') clientId: string, @Req() req: Request): Promise<void> {
    await this.clientsService.revoke(clientId, this.resolveTenantId(req));
  }

  // ─── Phase D: the Desk admin surface ─────────────────────────

  @Post(':client_id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Rotate the client secret (returns the new plaintext value once). Does NOT cascade-revoke existing tokens — use revoke for that.',
  })
  async rotateSecret(@Param('client_id') clientId: string, @Req() req: Request): Promise<{ clientSecret: string }> {
    return this.clientsService.rotateSecret(clientId, this.resolveTenantId(req));
  }

  @Post(':client_id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause the OAuth client (isActive=false); reversible via resume',
  })
  async pause(@Param('client_id') clientId: string, @Req() req: Request): Promise<OAuthClientResponse> {
    const tenantId = this.resolveTenantId(req);
    await this.clientsService.pause(clientId, tenantId);
    // The resource as it is now, not an empty acknowledgement.
    return this.clientsService.findByClientId(clientId, tenantId);
  }

  @Post(':client_id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused OAuth client' })
  async resume(@Param('client_id') clientId: string, @Req() req: Request): Promise<OAuthClientResponse> {
    const tenantId = this.resolveTenantId(req);
    await this.clientsService.resume(clientId, tenantId);
    // The resource as it is now, not an empty acknowledgement.
    return this.clientsService.findByClientId(clientId, tenantId);
  }

  @Post(':client_id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke the OAuth client (sets isActive=false and cascades to active access + refresh tokens)',
  })
  async revokeViaAction(@Param('client_id') clientId: string, @Req() req: Request): Promise<OAuthClientResponse> {
    const tenantId = this.resolveTenantId(req);
    await this.clientsService.revoke(clientId, tenantId);
    // The resource as it is now, not an empty acknowledgement.
    return this.clientsService.findByClientId(clientId, tenantId);
  }

  @Patch(':client_id/scopes')
  @ApiOperation({
    summary: 'Update the grantable scope set on an OAuth client',
  })
  async updateScopes(
    @Param('client_id') clientId: string,
    @Body() body: UpdateOAuthClientScopesDto,
    @Req() req: Request,
  ) {
    return this.clientsService.updateScopes(clientId, this.resolveTenantId(req), body);
  }
}
