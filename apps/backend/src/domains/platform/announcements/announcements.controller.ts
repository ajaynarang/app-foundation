import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { AnnouncementStatus, UserRole } from '@prisma/client';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@ApiTags('Broadcasts (Admin)')
@Controller('admin/broadcasts')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: 'List all broadcasts' })
  findAll(@Query('status') status?: string) {
    const typed =
      status && (Object.values(AnnouncementStatus) as string[]).includes(status)
        ? (status as AnnouncementStatus)
        : undefined;
    return this.service.findAll(typed);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get broadcast by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
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
  @ApiOperation({ summary: 'Publish a broadcast' })
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.service.publish(id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a broadcast' })
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.service.archive(id);
  }
}
