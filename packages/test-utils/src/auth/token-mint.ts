const HEADER_NAME = 'x-dev-auth-secret';

export interface DevUsersResponse {
  tenants: Array<{
    tenantId: string;
    tenantName: string;
    users: Array<{
      userId: string;
      role: string;
      email: string | null;
      firstName: string;
      lastName: string;
      phone?: string | null;
    }>;
  }>;
  superAdmins: Array<{
    userId: string;
    email: string | null;
    role: string;
    firstName: string;
    lastName: string;
  }>;
}

function requireSecret(): string {
  const s = process.env.DEV_AUTH_SECRET;
  if (!s) {
    throw new Error(
      'DEV_AUTH_SECRET env var is required for dev-auth. ' +
        'Set it in your shell, .env.test, or GH Actions repo secret.',
    );
  }
  return s;
}

export async function fetchDevUsers(baseUrl: string): Promise<DevUsersResponse> {
  const res = await fetch(`${baseUrl}/dev/users`, {
    headers: { [HEADER_NAME]: requireSecret() },
  });
  if (!res.ok) {
    throw new Error(
      `GET ${baseUrl}/dev/users → HTTP ${res.status}. ` +
        `Check DEV_AUTH_SECRET matches the backend and the backend is reachable.`,
    );
  }
  return res.json() as Promise<DevUsersResponse>;
}

export async function switchToUser(baseUrl: string, userId: string): Promise<string> {
  const res = await fetch(`${baseUrl}/dev/switch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [HEADER_NAME]: requireSecret(),
    },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    throw new Error(`POST ${baseUrl}/dev/switch for userId=${userId} → HTTP ${res.status}`);
  }
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}
