import { Module } from '@nestjs/common';
import { PrismaModule } from '../infrastructure/database/prisma.module';
import { EmailVerificationService } from './email-verification.service';

/**
 * Email verification on its own, so a signup outside the auth module (tenant registration) can issue a token
 * without importing the whole auth stack. `EmailService` comes from the global notification module.
 */
@Module({
  imports: [PrismaModule],
  providers: [EmailVerificationService],
  exports: [EmailVerificationService],
})
export class EmailVerificationModule {}
