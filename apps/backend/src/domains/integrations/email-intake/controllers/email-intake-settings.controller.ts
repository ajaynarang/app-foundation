import { Controller, Get, Put, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RequireFeature } from '../../../../auth/decorators/require-feature.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { EmailIntakeService } from '../services/email-intake.service';
import { UpdateEmailIntakeSettingsDto } from '../dto/email-intake-settings.dto';

@ApiTags('Email Intake')
@Controller('integrations/email-intake/settings')
@RequireFeature('email_intake')
export class EmailIntakeSettingsController {
  private readonly logger = new Logger(EmailIntakeSettingsController.name);

  constructor(private readonly emailIntakeService: EmailIntakeService) {}

  @Get()
  @ApiOperation({ summary: 'Get email intake settings' })
  async getSettings(@CurrentUser() user: any) {
    return this.emailIntakeService.getSettings(user.tenantDbId);
  }

  @Put()
  @ApiOperation({ summary: 'Update email intake settings' })
  async updateSettings(@CurrentUser() user: any, @Body() dto: UpdateEmailIntakeSettingsDto) {
    return this.emailIntakeService.updateSettings(user.tenantDbId, dto);
  }
}
