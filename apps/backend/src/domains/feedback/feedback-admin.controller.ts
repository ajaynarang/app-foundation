import { Controller, Get, Post, Patch, Param, Body, Query, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { ListQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { FeedbackService } from './feedback.service';
import { ListFeedbackQueryDto, ResolveFeedbackDto, UpdateStatusDto, UpdateCategoryDto } from './dto';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import {
  FeedbackBulkCategorizeResponse,
  FeedbackListResponse,
  FeedbackResponse,
  FeedbackStatsResponse,
  FeedbackTenantListResponse,
} from './openapi.responses';

const FEEDBACK_ID_PARAM = { name: 'id', description: 'The feedback’s public id (uuid)' } as const;

@ApiTags('Feedback (Admin)')
@Controller('admin/feedback')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
export class FeedbackAdminController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  @ApiOperation({ summary: 'List all feedback, newest first (cursor-paged, with status counts)' })
  @ApiResult(FeedbackListResponse)
  async listAll(@Query() query: ListFeedbackQueryDto) {
    return this.feedbackService.listAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get feedback stats' })
  @ApiResult(FeedbackStatsResponse)
  async getStats() {
    return this.feedbackService.getStats();
  }

  @Get('tenants')
  @ApiOperation({ summary: 'Tenants that have submitted feedback, by name (a picker: cursor list with q)' })
  @ApiResult(FeedbackTenantListResponse)
  async getTenants(@Query() query: ListQueryDto) {
    return this.feedbackService.getTenants(query);
  }

  @Post('bulk-categorize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI-categorize all uncategorized feedback' })
  @ApiResult(FeedbackBulkCategorizeResponse)
  async bulkCategorize() {
    return this.feedbackService.bulkCategorize();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get feedback detail' })
  @ApiParam(FEEDBACK_ID_PARAM)
  @ApiResult(FeedbackResponse)
  async getDetail(@Param('id', ParseUUIDPipe) feedbackId: string) {
    return this.feedbackService.getDetail(feedbackId);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolve feedback with note' })
  @ApiParam(FEEDBACK_ID_PARAM)
  @ApiResult(FeedbackResponse)
  async resolve(
    @Param('id', ParseUUIDPipe) feedbackId: string,
    @Body() dto: ResolveFeedbackDto,
    @CurrentUser() user: any,
  ) {
    return this.feedbackService.resolve(feedbackId, user.dbId, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update feedback status' })
  @ApiParam(FEEDBACK_ID_PARAM)
  @ApiResult(FeedbackResponse)
  async updateStatus(@Param('id', ParseUUIDPipe) feedbackId: string, @Body() dto: UpdateStatusDto) {
    return this.feedbackService.updateStatus(feedbackId, dto);
  }

  @Post(':id/categorize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI-categorize feedback (on-demand)' })
  @ApiParam(FEEDBACK_ID_PARAM)
  @ApiResult(FeedbackResponse)
  async categorize(@Param('id', ParseUUIDPipe) feedbackId: string) {
    return this.feedbackService.categorizeWithAi(feedbackId);
  }

  @Patch(':id/category')
  @ApiOperation({ summary: 'Manually set feedback category' })
  @ApiParam(FEEDBACK_ID_PARAM)
  @ApiResult(FeedbackResponse)
  async updateCategory(@Param('id', ParseUUIDPipe) feedbackId: string, @Body() dto: UpdateCategoryDto) {
    return this.feedbackService.updateCategory(feedbackId, dto);
  }
}
