import { Module } from '@nestjs/common';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { UserInvitationsModule } from './user-invitations/user-invitations.module';
import { SettingsModule } from './settings/settings.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { PlansModule } from './plans/plans.module';
import { FeedbackModule } from './feedback/feedback.module';
import { OAuthProviderModule } from './oauth-provider/oauth-provider.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { LoginActivityModule } from './login-activity/login-activity.module';

/**
 * PlatformModule aggregates all platform/infrastructure modules:
 * - Tenants: Multi-tenancy management
 * - Users: User management and authentication
 * - User Invitations: User invitation system
 * - Settings: User and tenant settings/preferences
 * - Feature Flags: Feature flag management
 * - Onboarding: User onboarding flows
 * - API Keys: API key management for external developers
 * - Plans: Pricing tier management and entitlements
 * - OAuth Provider: OAuth 2.1 authorization server for external API access
 * - Login Activity: Sign-in audit log surfaces for tenant admins and platform staff
 */
@Module({
  imports: [
    TenantsModule,
    UsersModule,
    UserInvitationsModule,
    SettingsModule,
    FeatureFlagsModule,
    OnboardingModule,
    ApiKeysModule,
    PlansModule,
    FeedbackModule,
    OAuthProviderModule,
    AnnouncementsModule,
    LoginActivityModule,
  ],
  exports: [
    TenantsModule,
    UsersModule,
    UserInvitationsModule,
    SettingsModule,
    FeatureFlagsModule,
    OnboardingModule,
    ApiKeysModule,
    PlansModule,
    FeedbackModule,
    OAuthProviderModule,
    AnnouncementsModule,
    LoginActivityModule,
  ],
})
export class PlatformModule {}
