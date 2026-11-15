import { Module } from '@nestjs/common';
import { PrismaModule } from '../infrastructure/database/prisma.module';
import { FirebaseAuthService } from './firebase-auth.service';

/**
 * Server-side Firebase ID token checks on their own, so a signup outside the auth module (tenant registration) can
 * verify a token without importing the whole auth stack. A uid is only ever read from a verified token.
 */
@Module({
  imports: [PrismaModule],
  providers: [FirebaseAuthService],
  exports: [FirebaseAuthService],
})
export class FirebaseAuthModule {}
