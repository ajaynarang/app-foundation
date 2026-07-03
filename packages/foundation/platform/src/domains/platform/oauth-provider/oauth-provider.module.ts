import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthClientsService } from './oauth-clients.service';
import { OAuthTokenGuard } from './oauth-token.guard';
import { OAuthProviderController } from './oauth-provider.controller';
import { OAuthClientsController } from './oauth-clients.controller';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('OAUTH_JWT_SECRET') || configService.get<string>('secretKey') + '-oauth',
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [OAuthProviderController, OAuthClientsController],
  providers: [OAuthProviderService, OAuthClientsService, OAuthTokenGuard],
  exports: [OAuthProviderService, OAuthTokenGuard],
})
export class OAuthProviderModule {}
