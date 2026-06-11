import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export async function GET(req: Request) {
  const secret = process.env.DEV_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId');
  const target = `${API_URL}/dev/users${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`;

  const res = await fetch(target, {
    headers: { 'x-dev-auth-secret': secret },
    cache: 'no-store',
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}
