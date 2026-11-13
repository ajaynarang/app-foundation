import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshJwtStrategy } from './strategies/refresh-jwt.strategy';
import { RefreshSessionService } from './refresh-session.service';
import { IdentityResolverService } from './identity-resolver.service';
import { EmailUniquenessCheck } from './email-uniqueness.check';
import { FirebaseAuthService } from './firebase-auth.service';
import { PinService } from './pin.service';
import { PrismaModule } from '../infrastructure/database/prisma.module';
import { LoginEventService } from './login-event.service';
import { LoginEventCleanupJobHandler } from './login-event-cleanup.processor';
import { TokensCleanupJobHandler } from './tokens-cleanup.processor';

/**
 * The login-events-cleanup and tokens-cleanup crons are scheduled from their `job_schedules` rows by
 * `FoundationSchedulesRegistrar`, with the other foundation crons; this module only provides their handlers.
 */
@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        // No fallback: the config schema always supplies a value and refuses the
        // public development default in production.
        secret: configService.get<string>('jwt.accessSecret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.accessExpiry') || '15m',
        } as any,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtTokenService,
    RefreshSessionService,
    IdentityResolverService,
    EmailUniquenessCheck,
    JwtStrategy,
    RefreshJwtStrategy,
    FirebaseAuthService,
    PinService,
    LoginEventService,
    LoginEventCleanupJobHandler,
    TokensCleanupJobHandler,
  ],
  exports: [
    AuthService,
    JwtTokenService,
    FirebaseAuthService,
    PinService,
    LoginEventService,
    LoginEventCleanupJobHandler,
    TokensCleanupJobHandler,
  ],
})
export class AuthModule {}
