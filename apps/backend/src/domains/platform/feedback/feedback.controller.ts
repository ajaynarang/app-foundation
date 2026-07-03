import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';

@ApiTags('Feedback')
@Controller('feedback')
@ApiBearerAuth()
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @ApiOperation({ summary: 'Submit feedback' })
  async create(@CurrentUser() user: any, @Body() dto: CreateFeedbackDto) {
    return this.feedbackService.create(user.dbId, user.tenantDbId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List own feedback' })
  async listOwn(@CurrentUser() user: any) {
    return this.feedbackService.listOwn(user.dbId, user.tenantDbId);
  }
}
