const DEFAULT_API_URL = 'http://localhost:8000/api/v1';

/**
 * Returns the API base URL from the environment variable.
 */
export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
}

/**
 * Returns a human-readable label for the current environment.
 */
export function getEnvironmentLabel(apiBaseUrl: string): string {
  if (apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1')) {
    return 'Local';
  }
  if (apiBaseUrl.includes('staging') || apiBaseUrl.includes('stg')) {
    return 'Staging';
  }
  return 'Production';
}

/**
 * Derives the MCP server base URL from the API base URL.
 * MCP lives under the versioned API prefix (`/api/v1/mcp`), so we keep
 * the `/api/v1` and just append `/mcp`. Trailing slash on the input is
 * tolerated.
 */
export function getMcpBaseUrl(apiBaseUrl: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  return `${base}/mcp`;
}
