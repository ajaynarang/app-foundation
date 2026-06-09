const LOCAL_API_URL = 'http://localhost:8000/api/v1';

const ENVIRONMENT_LABELS: Record<string, string> = {
  'https://api-staging.appshore.in/api/v1': 'Sandbox',
  'https://api.appshore.in/api/v1': 'Production',
};

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || LOCAL_API_URL;
}

export function getMcpBaseUrl(apiUrl: string) {
  return apiUrl.replace(/\/api\/v1\/?$/, '');
}

export function getEnvironmentLabel(apiUrl: string) {
  return ENVIRONMENT_LABELS[apiUrl] ?? 'Development';
}
