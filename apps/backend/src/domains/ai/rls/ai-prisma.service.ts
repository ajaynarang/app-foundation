import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

@Injectable()
export class AiPrismaService {
  private readonly logger = new Logger(AiPrismaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async executeWithRlsContext<T>(
    tenantId: number,
    userId: number,
    role: string,
    fn: (tx: any) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Set tenant context (transaction-scoped via set_config with is_local=true)
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${String(tenantId)}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_user_role', ${role}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;

      // Switch to ai_reader role so RLS policies are enforced.
      // The default Prisma connection role (table owner) bypasses RLS.
      await tx.$executeRaw`SET LOCAL ROLE ai_reader`;

      return fn(tx);
    });
  }
}
