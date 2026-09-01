import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { UserRole, WhatsAppConsentSource } from '@appshore/db';
import { WhatsAppConsentService } from './whatsapp-consent.service';
import { UpdateWhatsAppConsentDto } from './dto/update-whatsapp-consent.dto';

@Controller('notifications/whatsapp-consent')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
@ApiTags('Notifications')
@ApiBearerAuth()
export class WhatsAppConsentController {
  constructor(private readonly consent: WhatsAppConsentService) {}

  @Get()
  @ApiOperation({ summary: 'Whether I get the platform updates on WhatsApp' })
  get(@CurrentUser() user: any) {
    return this.consent.get(user.dbId);
  }

  @Patch()
  @ApiOperation({ summary: 'Say yes or no to WhatsApp updates' })
  async update(@CurrentUser() user: any, @Body() dto: UpdateWhatsAppConsentDto) {
    if (dto.optedIn === undefined && dto.marketingOptedIn === undefined) {
      throw new BadRequestException('Nothing to change');
    }
    const source = dto.source === 'SIGNUP' ? WhatsAppConsentSource.SIGNUP : WhatsAppConsentSource.SETTINGS;
    return this.consent.update(user.dbId, { optedIn: dto.optedIn, marketingOptedIn: dto.marketingOptedIn }, source);
  }
}
