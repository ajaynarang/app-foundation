import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { NotificationModule } from '../../infrastructure/notification/notification.module';
import { EmailVerificationModule } from '../../auth/email-verification.module';
import { FirebaseAuthModule } from '../../auth/firebase-auth.module';

@Module({
  imports: [PrismaModule, NotificationModule, EmailVerificationModule, FirebaseAuthModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
