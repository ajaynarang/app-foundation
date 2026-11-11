import { Controller, Get, Post, Patch, Param, Body, Query, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { ListQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { FeedbackService } from './feedback.service';
import { ListFeedbackQueryDto, ResolveFeedbackDto, UpdateStatusDto, UpdateCategoryDto } from './dto';

@ApiTags('Feedback (Admin)')
@Controller('admin/feedback')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
export class FeedbackAdminController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  @ApiOperation({ summary: 'List all feedback, newest first (cursor-paged, with status counts)' })
  async listAll(@Query() query: ListFeedbackQueryDto) {
    return this.feedbackService.listAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get feedback stats' })
  async getStats() {
    return this.feedbackService.getStats();
  }

  @Get('tenants')
  @ApiOperation({ summary: 'Tenants that have submitted feedback, by name (a picker: cursor list with q)' })
  async getTenants(@Query() query: ListQueryDto) {
    return this.feedbackService.getTenants(query);
  }

  @Post('bulk-categorize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI-categorize all uncategorized feedback' })
  async bulkCategorize() {
    return this.feedbackService.bulkCategorize();
  }

  @Get(':feedback_id')
  @ApiOperation({ summary: 'Get feedback detail' })
  async getDetail(@Param('feedback_id', ParseUUIDPipe) feedbackId: string) {
    return this.feedbackService.getDetail(feedbackId);
  }

  @Patch(':feedback_id/resolve')
  @ApiOperation({ summary: 'Resolve feedback with note' })
  async resolve(
    @Param('feedback_id', ParseUUIDPipe) feedbackId: string,
    @Body() dto: ResolveFeedbackDto,
    @CurrentUser() user: any,
  ) {
    return this.feedbackService.resolve(feedbackId, user.dbId, dto);
  }

  @Patch(':feedback_id/status')
  @ApiOperation({ summary: 'Update feedback status' })
  async updateStatus(@Param('feedback_id', ParseUUIDPipe) feedbackId: string, @Body() dto: UpdateStatusDto) {
    return this.feedbackService.updateStatus(feedbackId, dto);
  }

  @Post(':feedback_id/categorize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI-categorize feedback (on-demand)' })
  async categorize(@Param('feedback_id', ParseUUIDPipe) feedbackId: string) {
    return this.feedbackService.categorizeWithAi(feedbackId);
  }

  @Patch(':feedback_id/category')
  @ApiOperation({ summary: 'Manually set feedback category' })
  async updateCategory(@Param('feedback_id', ParseUUIDPipe) feedbackId: string, @Body() dto: UpdateCategoryDto) {
    return this.feedbackService.updateCategory(feedbackId, dto);
  }
}
