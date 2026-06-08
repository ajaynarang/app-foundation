import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;

  if (!cdnUrl) {
    return NextResponse.json({ enabled: false });
  }

  try {
    const res = await fetch(`${cdnUrl}/status/maintenance.json`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ enabled: false });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    // If we can't reach CDN, assume not in maintenance
    // (the middleware check is the primary gate)
    return NextResponse.json({ enabled: false });
  }
}
