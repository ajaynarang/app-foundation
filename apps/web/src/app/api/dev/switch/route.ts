import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export async function POST(req: Request) {
  const secret = process.env.DEV_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const body = await req.text();
  const res = await fetch(`${API_URL}/dev/switch`, {
    method: 'POST',
    headers: {
      'x-dev-auth-secret': secret,
      'content-type': req.headers.get('content-type') ?? 'application/json',
    },
    body,
  });
  const resBody = await res.text();
  return new NextResponse(resBody, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}
