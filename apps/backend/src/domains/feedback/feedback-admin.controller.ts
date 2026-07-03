import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { FeedbackService } from './feedback.service';
import { ListFeedbackQueryDto, ResolveFeedbackDto, UpdateStatusDto, UpdateCategoryDto } from './dto';

@ApiTags('Feedback (Admin)')
@Controller('admin/feedback')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
export class FeedbackAdminController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  @ApiOperation({ summary: 'List all feedback' })
  async listAll(@Query() query: ListFeedbackQueryDto) {
    return this.feedbackService.listAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get feedback stats' })
  async getStats() {
    return this.feedbackService.getStats();
  }

  @Get('tenants')
  @ApiOperation({ summary: 'List tenants that have submitted feedback' })
  async getTenants() {
    return this.feedbackService.getTenants();
  }

  @Post('bulk-categorize')
  @ApiOperation({ summary: 'AI-categorize all uncategorized feedback' })
  async bulkCategorize() {
    return this.feedbackService.bulkCategorize();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get feedback detail' })
  async getDetail(@Param('id', ParseIntPipe) id: number) {
    return this.feedbackService.getDetail(id);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolve feedback with note' })
  async resolve(@Param('id', ParseIntPipe) id: number, @Body() dto: ResolveFeedbackDto, @CurrentUser() user: any) {
    return this.feedbackService.resolve(id, user.dbId, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update feedback status' })
  async updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStatusDto) {
    return this.feedbackService.updateStatus(id, dto);
  }

  @Post(':id/categorize')
  @ApiOperation({ summary: 'AI-categorize feedback (on-demand)' })
  async categorize(@Param('id', ParseIntPipe) id: number) {
    return this.feedbackService.categorizeWithAi(id);
  }

  @Patch(':id/category')
  @ApiOperation({ summary: 'Manually set feedback category' })
  async updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.feedbackService.updateCategory(id, dto);
  }
}
