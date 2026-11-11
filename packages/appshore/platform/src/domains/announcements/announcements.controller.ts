import { Controller, Get, Post, Patch, Param, Body, Query, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AnnouncementStatus, UserRole } from '@appshore/db';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { BroadcastListQueryDto } from './dto/broadcast-list-query.dto';

const BROADCAST_ID_PARAM = { name: 'id', description: 'The broadcast public id (uuid)' };

@ApiTags('Broadcasts (Admin)')
@Controller('admin/broadcasts')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: 'List broadcasts, newest first (cursor-paged)' })
  @ApiQuery({ name: 'status', required: false, enum: AnnouncementStatus })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  findAll(@Query() query: BroadcastListQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get broadcast by its public id' })
  @ApiParam(BROADCAST_ID_PARAM)
  findOne(@Param('id', ParseUUIDPipe) broadcastId: string) {
    return this.service.findOne(broadcastId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a broadcast (starts as DRAFT)' })
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.dbId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a broadcast' })
  @ApiParam(BROADCAST_ID_PARAM)
  update(@Param('id', ParseUUIDPipe) broadcastId: string, @Body() dto: UpdateAnnouncementDto) {
    return this.service.update(broadcastId, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a broadcast' })
  @ApiParam(BROADCAST_ID_PARAM)
  publish(@Param('id', ParseUUIDPipe) broadcastId: string) {
    return this.service.publish(broadcastId);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a broadcast' })
  @ApiParam(BROADCAST_ID_PARAM)
  archive(@Param('id', ParseUUIDPipe) broadcastId: string) {
    return this.service.archive(broadcastId);
  }
}
