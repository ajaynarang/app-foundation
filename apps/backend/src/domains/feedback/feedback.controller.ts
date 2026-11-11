import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CursorQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';

@ApiTags('Feedback')
@Controller('feedback')
@ApiBearerAuth()
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit feedback' })
  async create(@CurrentUser() user: any, @Body() dto: CreateFeedbackDto) {
    return this.feedbackService.create(user.dbId, user.tenantDbId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List own feedback, newest first (cursor-paged)' })
  async listOwn(@CurrentUser() user: any, @Query() query: CursorQueryDto) {
    return this.feedbackService.listOwn(user.dbId, user.tenantDbId, query);
  }
}
