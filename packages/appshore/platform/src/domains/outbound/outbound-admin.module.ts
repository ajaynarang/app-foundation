import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { OutboundAdminController } from './outbound-admin.controller';
import { OutboundAdminService } from './outbound-admin.service';

/** The super-admin Outbound routes. `OutboundPolicyService` comes from the global `OutboundModule`. */
@Module({
  imports: [PrismaModule],
  controllers: [OutboundAdminController],
  providers: [OutboundAdminService],
})
export class OutboundAdminModule {}
