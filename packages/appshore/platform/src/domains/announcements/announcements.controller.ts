import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { BroadcastListQueryDto } from './dto/broadcast-list-query.dto';

@ApiTags('Broadcasts (Admin)')
@Controller('admin/broadcasts')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: 'List all broadcasts' })
  findAll(@Query() query: BroadcastListQueryDto) {
    return this.service.findAll(query.status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get broadcast by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a broadcast' })
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.dbId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a broadcast' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAnnouncementDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a broadcast' })
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.service.publish(id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a broadcast' })
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.service.archive(id);
  }
}
