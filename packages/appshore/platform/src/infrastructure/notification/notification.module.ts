import { Module, Global } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { PrismaModule } from '../database/prisma.module';
import { EmailService } from './services/email.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [NotificationService, EmailService],
  exports: [NotificationService, EmailService],
})
export class NotificationModule {}
