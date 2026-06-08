import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PLATFORM_SERVICE_NAMES, type PlatformServiceName } from '@sally/shared-types';

// Re-export from shared types — single source of truth for both backend and frontend
export { PLATFORM_SERVICE_NAMES, type PlatformServiceName };

export interface PlatformServiceEntry {
  provider: string;
  apiKey?: string;
  configured: boolean;
  /** Provider dashboard URL for manual balance checks */
  dashboardUrl?: string;
  /** Whether this service supports automated balance probing */
  supportsBalanceProbe?: boolean;
}

/**
 * Read an env var. Uses ConfigService for keys mapped in the Zod config schema
 * (camelCase), falls back to process.env for raw env var names (UPPER_SNAKE).
 */
function env(configService: ConfigService, key: string): string | undefined {
  // ConfigService holds the parsed Zod schema (camelCase keys like 'anthropicApiKey')
  const fromConfig = configService.get<string>(key);
  if (fromConfig) return fromConfig;
  // Fall back to raw process.env for keys not in the schema (e.g. OPENAI_API_KEY)
  return process.env[key] || undefined;
}

@Injectable()
export class PlatformServicesConfig {
  private readonly _all: Record<import('@sally/shared-types').PlatformServiceName, PlatformServiceEntry>;

  constructor(private configService: ConfigService) {
    const hereApiKey = env(configService, 'hereApiKey');
    const openWeatherApiKey = env(configService, 'openWeatherApiKey');
    const gasbuddyApiKey = env(configService, 'gasbuddyApiKey');
    const pcmilerApiKey = env(configService, 'pcmilerApiKey');

    // Mileage defaults to HERE (shared HERE_API_KEY); PC*Miler is the rated-mile swap target.
    const mileageProvider = configService.get<string>('platformMileageProvider', 'here');
    const mileageUsesPcmiler = mileageProvider === 'trimble';
    const mileageApiKey = mileageUsesPcmiler ? pcmilerApiKey : hereApiKey;

    this._all = {
      // --- Mapping & Routing ---
      weather: {
        provider: configService.get<string>('platformWeatherProvider', 'openweather'),
        apiKey: openWeatherApiKey,
        configured: !!openWeatherApiKey,
        dashboardUrl: 'https://home.openweathermap.org/api_keys',
      },
      fuelPrices: {
        provider: configService.get<string>('platformFuelProvider', 'gasbuddy'),
        apiKey: gasbuddyApiKey,
        configured: !!gasbuddyApiKey,
        dashboardUrl: 'https://business.gasbuddy.com/',
      },
      routing: {
        provider: configService.get<string>('platformRoutingProvider', 'here'),
        apiKey: hereApiKey,
        configured: !!hereApiKey,
        dashboardUrl: 'https://platform.here.com/admin/apps',
      },
      geocoding: {
        provider: configService.get<string>('platformGeocodingProvider', 'here'),
        apiKey: hereApiKey,
        configured: !!hereApiKey,
        dashboardUrl: 'https://platform.here.com/admin/apps',
      },
      places: {
        provider: configService.get<string>('platformPlacesProvider', 'here'),
        apiKey: hereApiKey,
        configured: !!hereApiKey,
        dashboardUrl: 'https://platform.here.com/admin/apps',
      },
      mileage: {
        // Default 'here' — HereMileageProvider uses the shared HERE_API_KEY.
        // PC*Miler stays the swap target for rated-mile billing (PLATFORM_MILEAGE_PROVIDER=trimble).
        provider: mileageProvider,
        apiKey: mileageApiKey,
        configured: !!mileageApiKey,
        dashboardUrl: mileageUsesPcmiler
          ? 'https://developer.trimblemaps.com/dashboard'
          : 'https://platform.here.com/admin/apps',
      },
      traffic: {
        provider: configService.get<string>('platformTrafficProvider', 'here'),
        apiKey: hereApiKey,
        configured: !!hereApiKey,
        dashboardUrl: 'https://platform.here.com/admin/apps',
      },
      tolls: {
        provider: configService.get<string>('platformTollProvider', 'here'),
        configured: !!hereApiKey,
        dashboardUrl: 'https://platform.here.com/admin/apps',
      },

      // --- AI & Intelligence ---
      // anthropicApiKey is in Zod schema, maps from ANTHROPIC_API_KEY
      anthropic: {
        provider: 'Anthropic',
        configured: !!env(configService, 'anthropicApiKey'),
        dashboardUrl: 'https://console.anthropic.com/settings/billing',
      },
      aiGateway: {
        provider: 'Vercel',
        configured: !!env(configService, 'AI_GATEWAY_API_KEY'),
        dashboardUrl: 'https://vercel.com/~/settings/ai',
      },
      openai: {
        provider: 'OpenAI',
        configured: !!env(configService, 'OPENAI_API_KEY'),
        dashboardUrl: 'https://platform.openai.com/usage',
        supportsBalanceProbe: true,
      },
      langfuse: {
        provider: 'Langfuse',
        configured: !!env(configService, 'LANGFUSE_SECRET_KEY'),
        dashboardUrl: env(configService, 'LANGFUSE_BASE_URL') || 'https://cloud.langfuse.com',
      },

      // --- Voice Agent ---
      livekit: {
        provider: 'LiveKit',
        configured: !!env(configService, 'LIVEKIT_API_KEY'),
        dashboardUrl: 'https://cloud.livekit.io/projects',
      },
      deepgram: {
        provider: 'Deepgram',
        configured: !!env(configService, 'DEEPGRAM_API_KEY'),
        dashboardUrl: 'https://console.deepgram.com/usage',
        supportsBalanceProbe: true,
      },
      cartesia: {
        provider: 'Cartesia',
        configured: !!env(configService, 'CARTESIA_API_KEY'),
        dashboardUrl: 'https://play.cartesia.ai/settings',
      },

      // --- Auth & Security ---
      firebaseAuth: (() => {
        const projectId = env(configService, 'FIREBASE_PROJECT_ID');
        return {
          provider: 'Google',
          configured: !!projectId,
          dashboardUrl: `https://console.firebase.google.com/project/${projectId || '_'}/authentication`,
        };
      })(),
      turnstile: {
        provider: 'Cloudflare',
        configured: !!env(configService, 'TURNSTILE_SECRET_KEY'),
        dashboardUrl: 'https://dash.cloudflare.com/?to=/:account/turnstile',
      },

      // --- Communication ---
      twilio: {
        provider: 'Twilio',
        configured: !!(env(configService, 'TWILIO_ACCOUNT_SID') && env(configService, 'TWILIO_AUTH_TOKEN')),
        dashboardUrl: 'https://console.twilio.com/us1/billing/manage-billing',
        supportsBalanceProbe: true,
      },
      resend: {
        provider: 'Resend',
        configured: !!env(configService, 'RESEND_API_KEY'),
        dashboardUrl: 'https://resend.com/settings/billing',
      },

      // --- Storage ---
      s3: (() => {
        // s3.bucket is in the Zod schema (nested)
        const bucket = configService.get<string>('s3.bucket');
        return {
          provider: 'AWS',
          configured: !!bucket,
          dashboardUrl: `https://s3.console.aws.amazon.com/s3/buckets/${bucket || ''}`,
        };
      })(),
    };
  }

  getAll(): Record<import('@sally/shared-types').PlatformServiceName, PlatformServiceEntry> {
    return this._all;
  }

  // --- Per-service accessors (used by individual service classes) ---
  get weather(): PlatformServiceEntry {
    return this._all.weather;
  }
  get fuelPrices(): PlatformServiceEntry {
    return this._all.fuelPrices;
  }
  get routing(): PlatformServiceEntry {
    return this._all.routing;
  }
  get geocoding(): PlatformServiceEntry {
    return this._all.geocoding;
  }
  get places(): PlatformServiceEntry {
    return this._all.places;
  }
  get mileage(): PlatformServiceEntry {
    return this._all.mileage;
  }
  get traffic(): PlatformServiceEntry {
    return this._all.traffic;
  }
  get tolls(): PlatformServiceEntry {
    return this._all.tolls;
  }
}
