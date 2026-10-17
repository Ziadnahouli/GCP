import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  // 1. Authenticate user session
  const supabase = createClient();
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const { data: authData, error: authError } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
  }

  const tauriServiceUrl = process.env.TAURI_SERVICE_URL;

  if (!tauriServiceUrl) {
    return NextResponse.json({
      service: 'src-tauri',
      status: 'offline',
      bound: false,
      message: 'Desktop service binding is not active in this environment.',
    });
  }

  try {
    const targetUrl = new URL('/', tauriServiceUrl);
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return NextResponse.json({ error: 'Invalid service configuration' }, { status: 500 });
    }

    const res = await fetch(targetUrl, {
      next: { revalidate: 10 },
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          service: 'src-tauri',
          status: 'degraded',
          bound: true,
        },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      bound: true,
      service: 'src-tauri',
      status: 'healthy',
      ...data,
    });
  } catch {
    return NextResponse.json(
      {
        service: 'src-tauri',
        status: 'unreachable',
        bound: true,
      },
      { status: 502 }
    );
  }
}
