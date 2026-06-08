import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CounterService } from './counter.service';

@Global()
@Module({
  providers: [PrismaService, CounterService],
  exports: [PrismaService, CounterService],
})
export class PrismaModule {}
