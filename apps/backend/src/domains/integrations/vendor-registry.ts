import { IntegrationType } from './dto/create-integration.dto';

export interface CredentialField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'number';
  required: boolean;
  helpText?: string;
  placeholder?: string;
}

export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  scopes: string[];
  tokenExpirySeconds: number;
  envPrefix: string;
  extraAuthParams?: Record<string, string>;
  callbackQueryParams?: string[];
}

export type ConnectionMethod =
  | { type: 'oauth'; config: OAuthConfig }
  | { type: 'credentials'; label?: string; fields: CredentialField[] }
  | { type: 'file_upload'; acceptedFormats: ('csv' | 'xlsx')[] };

export interface VendorMetadata {
  id: string;
  displayName: string;
  description: string;
  integrationType: IntegrationType;
  connectionMethods: ConnectionMethod[];
  helpUrl?: string;
  logoUrl?: string;
}

// ── Helper accessors (used by backend services) ──

/** Get OAuth config from a vendor's connection methods, or undefined */
export function getVendorOAuth(vendor: VendorMetadata): OAuthConfig | undefined {
  const method = vendor.connectionMethods.find((m) => m.type === 'oauth');
  return method?.type === 'oauth' ? method.config : undefined;
}

/** Get credential fields from a vendor's connection methods, or [] */
export function getVendorCredentialFields(vendor: VendorMetadata): CredentialField[] {
  const method = vendor.connectionMethods.find((m) => m.type === 'credentials');
  return method?.type === 'credentials' ? method.fields : [];
}

export const VENDOR_REGISTRY: Record<string, VendorMetadata> = {
  PROJECT44_TMS: {
    id: 'PROJECT44_TMS',
    displayName: 'project44',
    description: 'project44 TMS integration',
    integrationType: IntegrationType.TMS,
    connectionMethods: [
      {
        type: 'credentials',
        fields: [
          {
            name: 'clientId',
            label: 'Client ID',
            type: 'text',
            required: true,
            helpText: 'OAuth 2.0 Client ID from developers.project44.com',
          },
          {
            name: 'clientSecret',
            label: 'Client Secret',
            type: 'password',
            required: true,
            helpText: 'OAuth 2.0 Client Secret from developers.project44.com',
          },
        ],
      },
    ],
    helpUrl: 'https://developers.project44.com/docs/authentication',
  },

  SAMSARA_ELD: {
    id: 'SAMSARA_ELD',
    displayName: 'Samsara',
    description: 'Samsara ELD integration for HOS and Telematics data',
    integrationType: IntegrationType.ELD,
    connectionMethods: [
      {
        type: 'oauth',
        config: {
          authorizationUrl: 'https://api.samsara.com/oauth2/authorize',
          tokenUrl: 'https://api.samsara.com/oauth2/token',
          revokeUrl: 'https://api.samsara.com/oauth2/revoke',
          scopes: ['admin:read'],
          tokenExpirySeconds: 3600,
          envPrefix: 'SAMSARA',
        },
      },
      {
        type: 'credentials',
        label: 'API Token',
        fields: [
          {
            name: 'apiToken',
            label: 'API Token',
            type: 'password',
            required: true,
            helpText: 'Get your API token from Samsara Dashboard → Settings → API Tokens',
            placeholder: 'samsara_api_xxxxxxxxxxxxx',
          },
        ],
      },
    ],
    helpUrl: 'https://developers.samsara.com/docs/authentication',
  },

  MCLEOD_TMS: {
    id: 'MCLEOD_TMS',
    displayName: 'McLeod',
    description: 'McLeod Software TMS integration',
    integrationType: IntegrationType.TMS,
    connectionMethods: [
      {
        type: 'credentials',
        fields: [
          {
            name: 'apiKey',
            label: 'API Key',
            type: 'password',
            required: true,
            helpText: 'Contact your McLeod administrator for API credentials',
          },
          {
            name: 'baseUrl',
            label: 'Base URL',
            type: 'url',
            required: true,
            helpText: 'Your McLeod API endpoint URL',
            placeholder: 'https://api.mcleodsoft.com',
          },
        ],
      },
    ],
  },

  TMW_TMS: {
    id: 'TMW_TMS',
    displayName: 'TMW Systems',
    description: 'TMW Systems TMS integration',
    integrationType: IntegrationType.TMS,
    connectionMethods: [
      {
        type: 'credentials',
        fields: [
          {
            name: 'apiKey',
            label: 'API Key',
            type: 'password',
            required: true,
            helpText: 'API key from TMW Systems',
          },
          {
            name: 'baseUrl',
            label: 'Base URL',
            type: 'url',
            required: true,
            helpText: 'Your TMW API endpoint URL',
            placeholder: 'https://api.tmwsystems.com',
          },
        ],
      },
    ],
  },

  MOTIVE_ELD: {
    id: 'MOTIVE_ELD',
    displayName: 'Motive',
    description: 'Motive ELD integration for HOS data',
    integrationType: IntegrationType.ELD,
    connectionMethods: [
      {
        type: 'oauth',
        config: {
          authorizationUrl: 'https://api.gomotive.com/oauth/authorize',
          tokenUrl: 'https://api.gomotive.com/oauth/token',
          revokeUrl: 'https://api.gomotive.com/oauth/revoke',
          scopes: ['hos.read', 'vehicles.read', 'drivers.read'],
          tokenExpirySeconds: 7200,
          envPrefix: 'MOTIVE',
        },
      },
      {
        type: 'credentials',
        label: 'API Token',
        fields: [
          {
            name: 'apiToken',
            label: 'API Token',
            type: 'password',
            required: true,
            helpText: 'Get your API token from Motive Dashboard (alternative to OAuth)',
            placeholder: 'motive_api_xxxxxxxxxxxxx',
          },
        ],
      },
    ],
  },

  QUICKBOOKS: {
    id: 'QUICKBOOKS',
    displayName: 'QuickBooks',
    description: 'QuickBooks Online accounting integration',
    integrationType: IntegrationType.ACCOUNTING,
    connectionMethods: [
      {
        type: 'oauth',
        config: {
          authorizationUrl: 'https://appcenter.intuit.com/connect/oauth2',
          tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
          revokeUrl: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
          scopes: ['com.intuit.quickbooks.accounting'],
          tokenExpirySeconds: 3600,
          envPrefix: 'QUICKBOOKS',
          extraAuthParams: { prompt: 'consent' },
          callbackQueryParams: ['realmId'],
        },
      },
    ],
    helpUrl: 'https://quickbooks.intuit.com/app/apps/',
  },

  DAT_LOAD_BOARD: {
    id: 'DAT_LOAD_BOARD',
    displayName: 'DAT Load Board',
    description: 'Search available loads on DAT One',
    integrationType: IntegrationType.LOAD_BOARD,
    connectionMethods: [
      {
        type: 'credentials',
        fields: [
          {
            name: 'apiKey',
            label: 'API Key',
            type: 'text',
            required: true,
            helpText: 'API key from your DAT Power account',
          },
          {
            name: 'apiSecret',
            label: 'API Secret',
            type: 'password',
            required: true,
            helpText: 'API secret from your DAT Power account',
          },
        ],
      },
    ],
    helpUrl: 'https://power.dat.com',
  },
};
