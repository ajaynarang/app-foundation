import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { DevService } from './dev.service';
import { DevAuthGuard } from './guards/dev-auth.guard';
import { PrismaModule } from '../infrastructure/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DeskResponsibilityModule } from '../domains/desk/responsibilities/desk-responsibility.module';

@Module({
  imports: [PrismaModule, AuthModule, DeskResponsibilityModule],
  controllers: [DevController],
  providers: [DevService, DevAuthGuard],
})
export class DevModule {}
