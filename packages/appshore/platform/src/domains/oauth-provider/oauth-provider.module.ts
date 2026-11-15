import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthClientsService } from './oauth-clients.service';
import { OAuthTokenGuard } from './oauth-token.guard';
import { OAuthProviderController } from './oauth-provider.controller';
import { OAuthClientsController } from './oauth-clients.controller';
import { resolveOAuthAccessTokenSecret } from './oauth-settings';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: resolveOAuthAccessTokenSecret((key) => configService.get<string>(key)),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [OAuthProviderController, OAuthClientsController],
  providers: [OAuthProviderService, OAuthClientsService, OAuthTokenGuard],
  exports: [OAuthProviderService, OAuthTokenGuard],
})
export class OAuthProviderModule {}
