import { NextResponse } from 'next/server';

function isSafeUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    const cleanHost = host.replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      cleanHost === '::1' ||
      cleanHost.startsWith('fe80:') ||
      cleanHost.startsWith('fc00:') ||
      cleanHost.startsWith('fd') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.localhost')
    ) {
      return false;
    }
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = host.match(ipv4Regex);
    if (ipMatch) {
      const o1 = parseInt(ipMatch[1], 10);
      const o2 = parseInt(ipMatch[2], 10);
      if (o1 === 10 || o1 === 127 || (o1 === 169 && o2 === 254) || (o1 === 192 && o2 === 168) || (o1 === 172 && o2 >= 16 && o2 <= 31) || o1 === 0) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl || !isSafeUrl(targetUrl)) {
    return NextResponse.json({ error: 'Invalid or blocked URL' }, { status: 400 });
  }

  try {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname;
    const defaultFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 GCP-Preview/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json({
        url: targetUrl,
        hostname,
        title: hostname,
        description: null,
        image: null,
        favicon: defaultFavicon,
      });
    }

    const html = await response.text();

    // Extract OpenGraph / Meta tags with regex
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i);
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["']/i) ||
                        html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);

    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:image["']/i);

    const ogSiteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*)["']/i) ||
                            html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:site_name["']/i);

    let title = ogTitleMatch?.[1] || titleMatch?.[1] || hostname;
    title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();

    let description = ogDescMatch?.[1] || null;
    if (description) {
      description = description.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    }

    let image = ogImageMatch?.[1] || null;
    if (image && !image.startsWith('http')) {
      try {
        image = new URL(image, targetUrl).toString();
      } catch {
        image = null;
      }
    }

    const siteName = ogSiteNameMatch?.[1] || hostname;

    return NextResponse.json({
      url: targetUrl,
      hostname,
      siteName,
      title: title || hostname,
      description,
      image,
      favicon: defaultFavicon,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (err) {
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
}
