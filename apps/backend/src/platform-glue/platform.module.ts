import { Module } from '@nestjs/common';
import { TenantsModule } from '@appshore/platform/domains/tenants/tenants.module';
import { UsersModule } from '@appshore/platform/domains/users/users.module';
import { UserInvitationsModule } from '@appshore/platform/domains/user-invitations/user-invitations.module';
import { SettingsModule } from '@appshore/platform/domains/settings/settings.module';
import { FeatureFlagsModule } from '@appshore/platform/domains/feature-flags/feature-flags.module';
import { OnboardingModule } from '@appshore/platform/domains/onboarding/onboarding.module';
import { ApiKeysModule } from '@appshore/platform/domains/api-keys/api-keys.module';
import { PlansModule } from '@appshore/platform/domains/plans/plans.module';
import { OAuthProviderModule } from '@appshore/platform/domains/oauth-provider/oauth-provider.module';
import { AnnouncementsModule } from '@appshore/platform/domains/announcements/announcements.module';
import { LoginActivityModule } from '@appshore/platform/domains/login-activity/login-activity.module';

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
    OAuthProviderModule,
    AnnouncementsModule,
    LoginActivityModule,
  ],
})
export class PlatformModule {}
