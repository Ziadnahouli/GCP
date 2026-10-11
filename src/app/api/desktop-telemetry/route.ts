import { NextResponse } from 'next/server';

export async function GET() {
  const tauriServiceUrl = process.env.TAURI_SERVICE_URL;

  if (!tauriServiceUrl) {
    return NextResponse.json({
      service: 'src-tauri',
      status: 'offline',
      bound: false,
      message: 'TAURI_SERVICE_URL internal service binding is not configured in this environment.',
    });
  }

  try {
    const targetUrl = new URL('/', tauriServiceUrl);
    const res = await fetch(targetUrl, {
      next: { revalidate: 10 },
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Internal service returned status ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json({
      bound: true,
      serviceUrl: tauriServiceUrl,
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        service: 'src-tauri',
        status: 'unreachable',
        bound: true,
        error: String(error),
      },
      { status: 502 }
    );
  }
}
