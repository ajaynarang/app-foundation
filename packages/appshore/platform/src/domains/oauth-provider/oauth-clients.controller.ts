import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { CursorQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { OAuthClientsService } from './oauth-clients.service';
import { UpdateOAuthClientScopesDto } from './dto/update-oauth-client-scopes.dto';
import type { OAuthClientResponse } from '@app/shared-types';
import { CreateOAuthClientDto, UpdateOAuthClientDto } from './dto/oauth-client.dto';
import { ApiResult } from '../../shared/openapi/api-result';
import { SkipIdempotency } from '../../infrastructure/idempotency/idempotency.interceptor';
import {
  OAuthClientCreatedResponse,
  OAuthClientListResponse,
  OAuthClientResponse as OAuthClientResponseRef,
  OAuthClientSecretRotatedResponse,
} from './openapi.responses';

const CLIENT_ID_PARAM = { name: 'client_id', description: 'OAuth client id (app_…)' };

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
  @SkipIdempotency() // the client secret is shown once: never stored for replay
  @ApiOperation({ summary: 'Register a new OAuth client' })
  @ApiResult(OAuthClientCreatedResponse, HttpStatus.CREATED)
  async create(@Body() body: CreateOAuthClientDto, @Req() req: Request) {
    const user = (req as unknown as { user: { dbId: number } }).user;
    const tenantId = this.resolveTenantId(req);
    return this.clientsService.create({ ...body, clientType: body.clientType ?? 'confidential' }, user.dbId, tenantId);
  }

  @Get()
  @ApiOperation({ summary: "List tenant's OAuth clients, newest first (cursor-paged)" })
  @ApiResult(OAuthClientListResponse)
  async findAll(@Req() req: Request, @Query() query: CursorQueryDto) {
    return this.clientsService.findAll(this.resolveTenantId(req), query);
  }

  @Get(':client_id')
  @ApiOperation({ summary: 'Get OAuth client details' })
  @ApiParam(CLIENT_ID_PARAM)
  @ApiResult(OAuthClientResponseRef)
  async findOne(@Param('client_id') clientId: string, @Req() req: Request) {
    return this.clientsService.findByClientId(clientId, this.resolveTenantId(req));
  }

  @Put(':client_id')
  @ApiOperation({ summary: 'Update OAuth client' })
  @ApiParam(CLIENT_ID_PARAM)
  @ApiResult(OAuthClientResponseRef)
  async update(@Param('client_id') clientId: string, @Body() body: UpdateOAuthClientDto, @Req() req: Request) {
    return this.clientsService.update(clientId, body, this.resolveTenantId(req));
  }

  @Delete(':client_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke/delete OAuth client (cascades tokens)' })
  @ApiParam(CLIENT_ID_PARAM)
  @ApiNoContentResponse({ description: 'Client revoked; its access and refresh tokens are revoked too' })
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
  @ApiParam(CLIENT_ID_PARAM)
  @ApiResult(OAuthClientSecretRotatedResponse)
  async rotateSecret(@Param('client_id') clientId: string, @Req() req: Request): Promise<{ clientSecret: string }> {
    return this.clientsService.rotateSecret(clientId, this.resolveTenantId(req));
  }

  @Post(':client_id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause the OAuth client (isActive=false); reversible via resume',
  })
  @ApiParam(CLIENT_ID_PARAM)
  @ApiResult(OAuthClientResponseRef)
  async pause(@Param('client_id') clientId: string, @Req() req: Request): Promise<OAuthClientResponse> {
    const tenantId = this.resolveTenantId(req);
    await this.clientsService.pause(clientId, tenantId);
    // The resource as it is now, not an empty acknowledgement.
    return this.clientsService.findByClientId(clientId, tenantId);
  }

  @Post(':client_id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused OAuth client' })
  @ApiParam(CLIENT_ID_PARAM)
  @ApiResult(OAuthClientResponseRef)
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
  @ApiParam(CLIENT_ID_PARAM)
  @ApiResult(OAuthClientResponseRef)
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
  @ApiParam(CLIENT_ID_PARAM)
  @ApiResult(OAuthClientResponseRef)
  async updateScopes(
    @Param('client_id') clientId: string,
    @Body() body: UpdateOAuthClientScopesDto,
    @Req() req: Request,
  ) {
    return this.clientsService.updateScopes(clientId, this.resolveTenantId(req), body);
  }
}
