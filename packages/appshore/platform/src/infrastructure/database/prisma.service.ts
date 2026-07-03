import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@appshore/db';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private pool: pg.Pool;

  constructor(private configService: ConfigService) {
    const connectionString =
      configService.get<string>('DATABASE_URL') || 'postgresql://app_user:app_password@localhost:5432/app';

    const pool = new pg.Pool({
      connectionString,
      max: parseInt(configService.get<string>('DB_POOL_MAX') || '20', 10),
      min: parseInt(configService.get<string>('DB_POOL_MIN') || '5', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: parseInt(configService.get<string>('DB_CONNECTION_TIMEOUT') || '5000', 10),
    });
    const adapter = new PrismaPg(pool);

    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log(`Database connected (pool: max=${this.pool.options.max}, min=${this.pool.options.min})`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
