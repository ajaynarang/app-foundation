export const OAUTH_CONFIG = {
  AUTH_CODE_TTL_SECONDS: 600, // 10 minutes
  ACCESS_TOKEN_TTL_SECONDS: 3600, // 1 hour
  REFRESH_TOKEN_TTL_SECONDS: 2592000, // 30 days per rotation
  REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS: 7776000, // 90 days from initial consent
  MCP_RATE_LIMIT: { ttl: 60, limit: 60 },
} as const;
