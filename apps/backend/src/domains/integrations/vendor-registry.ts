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

/**
 * Static vendor metadata (OAuth URLs, scopes, credential fields) keyed by vendor
 * id. The starter ships ONE sample connector (QuickBooks / ACCOUNTING) to show
 * the shape. Add your own vendors here and register the matching enum value in
 * the Prisma `IntegrationVendor` enum + the adapter in `AdapterFactoryService`.
 */
export const VENDOR_REGISTRY: Record<string, VendorMetadata> = {
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
};
