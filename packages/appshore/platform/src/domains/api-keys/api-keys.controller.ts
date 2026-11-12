import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { BaseTenantController } from '../../shared/base/base-tenant.controller';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CursorQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import type { CursorList } from '@app/shared-types';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeyDto } from './dto/api-key.dto';
import { TenantApiKeyListItemDto } from './dto/list-api-keys.dto';
import { UpdateApiKeyScopesDto } from './dto/update-api-key-scopes.dto';
import { ApiResult } from '../../shared/openapi/api-result';
import { ApiKeyList, ApiKeyRotation, TenantApiKeyList } from './openapi.responses';

const API_KEY_ID_PARAM = {
  name: 'api_key_id',
  description: 'API key id (integer; listed in id-boundary.allowlist.json)',
};

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeysController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly apiKeysService: ApiKeysService,
  ) {
    super(prisma);
  }

  // RolesGuard treats missing @Roles metadata as allow-any-authenticated-role;
  // self-service endpoints must declare @Roles explicitly. (security audit SEC-21)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Generate a new API key' })
  @ApiResult(ApiKeyDto, HttpStatus.CREATED, 'The new key; `key` holds the plaintext, shown only on this response')
  async create(@Request() req, @Body() createApiKeyDto: CreateApiKeyDto): Promise<ApiKeyDto> {
    return this.apiKeysService.create(req.user.dbId, createApiKeyDto);
  }

  @Get()
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "List the current user's API keys, newest first (cursor-paged)" })
  @ApiResult(ApiKeyList)
  async findAll(@Request() req, @Query() query: CursorQueryDto): Promise<CursorList<ApiKeyDto>> {
    return this.apiKeysService.findAll(req.user.dbId, query);
  }

  @Delete(':api_key_id')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key (owner self-service)' })
  @ApiParam(API_KEY_ID_PARAM)
  @ApiNoContentResponse({ description: 'API key revoked successfully' })
  async revoke(@Request() req, @Param('api_key_id', ParseIntPipe) id: number): Promise<void> {
    await this.apiKeysService.revoke(id, req.user.dbId);
  }

  // ─── Tenant-admin endpoints (Phase D) ────────────────────────────

  @Get('admin/tenant')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List every API key in the tenant, newest first (admin view, cursor-paged)',
  })
  @ApiResult(TenantApiKeyList)
  async listForTenant(
    @CurrentUser() user: { tenantId: string },
    @Query() query: CursorQueryDto,
  ): Promise<CursorList<TenantApiKeyListItemDto>> {
    const tenantId = await this.getTenantDbId(user);
    return this.apiKeysService.listForTenant(tenantId, query);
  }

  @Post(':api_key_id/rotate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Rotate a key: revoke the old row and mint a new one with the same scopes',
  })
  @ApiParam(API_KEY_ID_PARAM)
  @ApiResult(ApiKeyRotation)
  async rotate(
    @CurrentUser() user: { tenantId: string },
    @Param('api_key_id', ParseIntPipe) id: number,
  ): Promise<{ apiKey: ApiKeyDto; plaintextKey: string }> {
    const tenantId = await this.getTenantDbId(user);
    return this.apiKeysService.rotate(id, tenantId);
  }

  @Post(':api_key_id/pause')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Pause an API key (isActive=false); reversible via resume',
  })
  @ApiParam(API_KEY_ID_PARAM)
  @ApiResult(ApiKeyDto)
  async pause(
    @CurrentUser() user: { tenantId: string },
    @Param('api_key_id', ParseIntPipe) id: number,
  ): Promise<ApiKeyDto> {
    const tenantId = await this.getTenantDbId(user);
    return this.apiKeysService.pause(id, tenantId);
  }

  @Post(':api_key_id/resume')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resume a paused API key' })
  @ApiParam(API_KEY_ID_PARAM)
  @ApiResult(ApiKeyDto)
  async resume(
    @CurrentUser() user: { tenantId: string },
    @Param('api_key_id', ParseIntPipe) id: number,
  ): Promise<ApiKeyDto> {
    const tenantId = await this.getTenantDbId(user);
    return this.apiKeysService.resume(id, tenantId);
  }

  @Post(':api_key_id/revoke')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Revoke an API key (tenant admin; sets revokedAt, irreversible)',
  })
  @ApiParam(API_KEY_ID_PARAM)
  @ApiResult(ApiKeyDto, HttpStatus.OK, 'The revoked key (isActive=false; revokedAt is not in this shape)')
  async revokeForTenant(
    @CurrentUser() user: { tenantId: string },
    @Param('api_key_id', ParseIntPipe) id: number,
  ): Promise<ApiKeyDto> {
    const tenantId = await this.getTenantDbId(user);
    return this.apiKeysService.revokeForTenant(id, tenantId);
  }

  @Patch(':api_key_id/scopes')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update scopes / ipAllowlist / rateLimit on an existing API key',
  })
  @ApiParam(API_KEY_ID_PARAM)
  @ApiResult(ApiKeyDto)
  async updateScopes(
    @CurrentUser() user: { tenantId: string },
    @Param('api_key_id', ParseIntPipe) id: number,
    @Body() dto: UpdateApiKeyScopesDto,
  ): Promise<ApiKeyDto> {
    const tenantId = await this.getTenantDbId(user);
    return this.apiKeysService.updateScopes(id, tenantId, dto);
  }
}
