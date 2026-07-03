import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserInvitationsController } from './user-invitations.controller';
import { UserInvitationsService } from './user-invitations.service';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  controllers: [UserInvitationsController],
  providers: [UserInvitationsService],
  exports: [UserInvitationsService],
})
export class UserInvitationsModule {}
