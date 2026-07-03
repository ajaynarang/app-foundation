import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { DevService } from './dev.service';
import { DevAuthGuard } from './guards/dev-auth.guard';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { AuthModule } from '@appshore/platform/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DevController],
  providers: [DevService, DevAuthGuard],
})
export class DevModule {}
