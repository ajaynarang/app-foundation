import { Module } from '@nestjs/common';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { AiPrismaService } from './ai-prisma.service';

@Module({
  imports: [PrismaModule],
  providers: [AiPrismaService],
  exports: [AiPrismaService],
})
export class RlsModule {}
