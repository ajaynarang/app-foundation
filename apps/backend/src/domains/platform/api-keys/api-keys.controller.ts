import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { BaseTenantController } from '../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeyDto } from './dto/api-key.dto';
import { TenantApiKeyListItemDto } from './dto/list-api-keys.dto';
import { UpdateApiKeyScopesDto } from './dto/update-api-key-scopes.dto';

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
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Generate a new API key' })
  @ApiResponse({
    status: 201,
    description: 'API key created successfully',
    type: ApiKeyDto,
  })
  async create(@Request() req, @Body() createApiKeyDto: CreateApiKeyDto): Promise<ApiKeyDto> {
    return this.apiKeysService.create(req.user.dbId, createApiKeyDto);
  }

  @Get()
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all API keys for current user' })
  @ApiResponse({
    status: 200,
    description: 'List of API keys',
    type: [ApiKeyDto],
  })
  async findAll(@Request() req): Promise<ApiKeyDto[]> {
    return this.apiKeysService.findAll(req.user.dbId);
  }

  @Delete(':id')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key (owner self-service)' })
  @ApiResponse({ status: 204, description: 'API key revoked successfully' })
  async revoke(@Request() req, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.apiKeysService.revoke(id, req.user.dbId);
  }

  // ─── Tenant-admin endpoints (Phase D) ────────────────────────────

  @Get('admin/tenant')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List every API key in the tenant (admin view)',
  })
  async listForTenant(@CurrentUser() user: { tenantId: string }): Promise<TenantApiKeyListItemDto[]> {
    const tenantId = await this.getTenantDbId(user);
    return this.apiKeysService.listForTenant(tenantId);
  }

  @Post(':api_key_id/rotate')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Rotate a key: revoke the old row and mint a new one with the same scopes',
  })
  async rotate(
    @CurrentUser() user: { tenantId: string },
    @Param('api_key_id', ParseIntPipe) id: number,
  ): Promise<{ apiKey: ApiKeyDto; plaintextKey: string }> {
    const tenantId = await this.getTenantDbId(user);
    return this.apiKeysService.rotate(id, tenantId);
  }

  @Post(':api_key_id/pause')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Pause an API key (isActive=false); reversible via resume',
  })
  async pause(@CurrentUser() user: { tenantId: string }, @Param('api_key_id', ParseIntPipe) id: number): Promise<void> {
    const tenantId = await this.getTenantDbId(user);
    return this.apiKeysService.pause(id, tenantId);
  }

  @Post(':api_key_id/resume')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resume a paused API key' })
  async resume(
    @CurrentUser() user: { tenantId: string },
    @Param('api_key_id', ParseIntPipe) id: number,
  ): Promise<void> {
    const tenantId = await this.getTenantDbId(user);
    return this.apiKeysService.resume(id, tenantId);
  }

  @Post(':api_key_id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Revoke an API key (tenant admin; sets revokedAt, irreversible)',
  })
  async revokeForTenant(
    @CurrentUser() user: { tenantId: string },
    @Param('api_key_id', ParseIntPipe) id: number,
  ): Promise<void> {
    const tenantId = await this.getTenantDbId(user);
    return this.apiKeysService.revokeForTenant(id, tenantId);
  }

  @Patch(':api_key_id/scopes')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update scopes / ipAllowlist / rateLimit on an existing API key',
  })
  async updateScopes(
    @CurrentUser() user: { tenantId: string },
    @Param('api_key_id', ParseIntPipe) id: number,
    @Body() dto: UpdateApiKeyScopesDto,
  ): Promise<ApiKeyDto> {
    const tenantId = await this.getTenantDbId(user);
    return this.apiKeysService.updateScopes(id, tenantId, dto);
  }
}
