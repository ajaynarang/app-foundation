import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { InAppNotificationsModule } from '../../operations/notifications/notifications.module';

@Module({
  imports: [PrismaModule, InAppNotificationsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
