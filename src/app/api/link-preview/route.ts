import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import dns from 'dns/promises';
import net from 'net';

const MAX_BODY_BYTES = 512 * 1024; // 512 KB limit
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 4000;

// In-memory sliding-window rate limiter per user (30 requests/minute)
const userRateLimits = new Map<string, { count: number; windowStart: number }>();
function checkUserRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const userRecord = userRateLimits.get(userId);

  if (!userRecord || now - userRecord.windowStart > windowMs) {
    userRateLimits.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (userRecord.count >= 30) {
    return false;
  }

  userRecord.count += 1;
  return true;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    const [b0, b1] = parts;
    if (b0 === 0) return true; // 0.0.0.0/8
    if (b0 === 10) return true; // 10.0.0.0/8
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true; // 100.64.0.0/10 CGNAT
    if (b0 === 127) return true; // 127.0.0.0/8 loopback
    if (b0 === 169 && b1 === 254) return true; // 169.254.0.0/16 link-local / AWS metadata
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true; // 172.16.0.0/12
    if (b0 === 192 && b1 === 168) return true; // 192.168.0.0/16
    if (b0 >= 224) return true; // 224.0.0.0/4 multicast & reserved
    return false;
  }

  if (net.isIPv6(ip)) {
    const norm = ip.toLowerCase();
    if (norm === '::1' || norm === '::') return true;
    if (norm.startsWith('fe80:') || norm.startsWith('fe9') || norm.startsWith('fea') || norm.startsWith('feb')) return true; // link-local
    if (norm.startsWith('fc') || norm.startsWith('fd')) return true; // unique local
    if (norm.startsWith('ff')) return true; // multicast
    // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (norm.includes('::ffff:')) {
      const v4Part = norm.split('::ffff:')[1];
      if (net.isIPv4(v4Part)) {
        return isPrivateIp(v4Part);
      }
      return true; // Malformed or embedded hex mapped
    }
    return false;
  }

  return true;
}

async function validateUrlSafety(urlString: string): Promise<{ safe: boolean; urlObj?: URL; error?: string }> {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, error: 'Only HTTP and HTTPS protocols are supported' };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    // Immediate hostname checks
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return { safe: false, error: 'Forbidden destination host' };
    }

    // If hostname is already an IP literal
    if (net.isIP(hostname)) {
      if (isPrivateIp(hostname)) {
        return { safe: false, error: 'Access to private or local network IP addresses is forbidden' };
      }
      return { safe: true, urlObj: parsed };
    }

    // Resolve DNS records to verify remote IP
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { safe: false, error: 'Could not resolve domain name' };
    }

    for (const record of addresses) {
      if (isPrivateIp(record.address)) {
        return { safe: false, error: `Resolved to private network IP (${record.address})` };
      }
    }

    return { safe: true, urlObj: parsed };
  } catch (err: any) {
    return { safe: false, error: err?.message || 'Invalid URL' };
  }
}

// Single-pass HTML entity decoder to prevent double-decoding vulnerabilities (e.g. &amp;lt;)
function decodeHtmlEntities(str: string): string {
  const entityMap: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  return str.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp|#\d+|#x[0-9a-fA-F]+);/g, (match) => {
    if (entityMap[match]) {
      return entityMap[match];
    }
    if (match.startsWith('&#x')) {
      const code = parseInt(match.slice(3, -1), 16);
      return !isNaN(code) ? String.fromCharCode(code) : match;
    }
    if (match.startsWith('&#')) {
      const code = parseInt(match.slice(2, -1), 10);
      return !isNaN(code) ? String.fromCharCode(code) : match;
    }
    return match;
  });
}

export async function GET(request: Request) {
  // 1. Authenticate user
  const supabase = createClient();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authData?.user;

  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized: Authentication required for link preview' }, { status: 401 });
  }

  // 2. Per-user rate limiting
  if (!checkUserRateLimit(user.id)) {
    return NextResponse.json(
      { error: 'Too Many Requests: Rate limit exceeded. Please wait a minute.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing required "url" parameter' }, { status: 400 });
  }

  // 3. Initial URL Safety Validation
  let currentUrl = targetUrl;
  let redirectsCount = 0;
  let response: Response | null = null;
  let finalUrl = targetUrl;

  while (redirectsCount <= MAX_REDIRECTS) {
    const safety = await validateUrlSafety(currentUrl);
    if (!safety.safe || !safety.urlObj) {
      return NextResponse.json(
        { error: `URL security verification failed: ${safety.error || 'Blocked'}` },
        { status: 400 }
      );
    }

    finalUrl = currentUrl;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual', // Manual redirect control to inspect each redirect hop
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 GCP-Preview/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Check for redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        break;
      }
      redirectsCount++;
      if (redirectsCount > MAX_REDIRECTS) {
        return NextResponse.json({ error: 'Too many redirects' }, { status: 400 });
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    break;
  }

  if (!response || !response.ok) {
    const parsed = new URL(targetUrl);
    return NextResponse.json({
      url: targetUrl,
      hostname: parsed.hostname,
      title: parsed.hostname,
      description: null,
      image: null,
      favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`,
    });
  }

  // Verify Content-Type is HTML
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return NextResponse.json({ error: 'Target URL did not return an HTML document' }, { status: 400 });
  }

  // Stream body with 512KB cap
  let html = '';
  if (response.body) {
    const reader = response.body.getReader();
    let bytesRead = 0;
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        bytesRead += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (bytesRead >= MAX_BODY_BYTES) {
          await reader.cancel();
          break;
        }
      }
    }
  } else {
    html = await response.text();
  }

  const parsedFinal = new URL(finalUrl);
  const hostname = parsedFinal.hostname;
  const defaultFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;

  // Extract OpenGraph / Meta tags
  const ogTitleMatch =
    html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i);
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

  const ogDescMatch =
    html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["']/i) ||
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);

  const ogImageMatch =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:image["']/i);

  const ogSiteNameMatch =
    html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:site_name["']/i);

  let title = ogTitleMatch?.[1] || titleMatch?.[1] || hostname;
  title = decodeHtmlEntities(title).trim();

  let description = ogDescMatch?.[1] || null;
  if (description) {
    description = decodeHtmlEntities(description).trim();
  }

  let image = ogImageMatch?.[1] || null;
  if (image && !image.startsWith('http')) {
    try {
      image = new URL(image, finalUrl).toString();
    } catch {
      image = null;
    }
  }

  const siteName = ogSiteNameMatch?.[1] || hostname;

  return NextResponse.json(
    {
      url: targetUrl,
      hostname,
      siteName,
      title: title || hostname,
      description,
      image,
      favicon: defaultFavicon,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    }
  );
}
