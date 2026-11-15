import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CursorQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import { FeedbackListResponse, FeedbackResponse } from './openapi.responses';

@ApiTags('Feedback')
@Controller('feedback')
@ApiBearerAuth()
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit feedback' })
  @ApiResult(FeedbackResponse, HttpStatus.CREATED)
  async create(@CurrentUser() user: any, @Body() dto: CreateFeedbackDto) {
    return this.feedbackService.create(user.dbId, user.tenantDbId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List own feedback, newest first (cursor-paged)' })
  @ApiResult(FeedbackListResponse)
  async listOwn(@CurrentUser() user: any, @Query() query: CursorQueryDto) {
    return this.feedbackService.listOwn(user.dbId, user.tenantDbId, query);
  }
}
