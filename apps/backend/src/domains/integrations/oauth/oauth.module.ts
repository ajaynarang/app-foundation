import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { CredentialsService } from '../credentials/credentials.service';
import { AuthTokenService } from './auth-token.service';
import { OAuthController } from './oauth.controller';
import { OAuthTokenRefreshJob } from './oauth-token-refresh.job';
import { OAuthRefreshJobHandler } from './oauth-refresh.processor';

@Module({
  imports: [PrismaModule, ConfigModule, CacheModule, QueueModule],
  controllers: [OAuthController],
  providers: [AuthTokenService, OAuthTokenRefreshJob, OAuthRefreshJobHandler, CredentialsService],
  exports: [AuthTokenService, OAuthTokenRefreshJob, OAuthRefreshJobHandler],
})
export class OAuthModule {}
