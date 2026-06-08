import { Controller, Post, Get, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { DocumentsService } from '../services/documents.service';
import { PresignUploadDto } from '../dto/presign-upload.dto';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly documentsService: DocumentsService,
  ) {
    super(prisma);
  }

  @Post('presign-upload')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get presigned S3 upload URL' })
  async presignUpload(@CurrentUser() user: any, @Body() dto: PresignUploadDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.documentsService.presignUpload({
      tenantId: tenantDbId,
      entityType: dto.entityType,
      entityId: Number(dto.entityId),
      documentType: dto.documentType,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      relatedStopId: dto.relatedStopId != null ? Number(dto.relatedStopId) : undefined,
      description: dto.description,
      uploadedBy: user.dbId,
      callerRole: user.role,
      callerDriverId: user.driverDbId,
    });
  }

  @Post(':id/confirm')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Confirm document upload completed' })
  async confirmUpload(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.documentsService.confirmUpload(id, tenantDbId, {
      callerRole: user.role,
      callerDriverId: user.driverDbId,
    });
  }

  @Get()
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List documents for an entity' })
  async listDocuments(
    @CurrentUser() user: any,
    @Query('entityType') entityType: string,
    @Query('entityId', ParseIntPipe) entityId: number,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.documentsService.listDocuments(entityType, entityId, tenantDbId, {
      callerRole: user.role,
      callerDriverId: user.driverDbId,
    });
  }

  @Get(':id')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get document details' })
  async getDocument(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.documentsService.getDocument(id, tenantDbId, {
      callerRole: user.role,
      callerDriverId: user.driverDbId,
    });
  }

  @Get(':id/download')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get presigned download URL' })
  async getDownloadUrl(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    const url = await this.documentsService.getDownloadUrl(id, tenantDbId, {
      callerRole: user.role,
      callerDriverId: user.driverDbId,
    });
    return { downloadUrl: url };
  }

  @Delete(':id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Delete a document' })
  async deleteDocument(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.documentsService.deleteDocument(id, tenantDbId);
    return { deleted: true };
  }
}
