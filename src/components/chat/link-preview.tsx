'use client';

import * as React from 'react';
import { ExternalLink, Globe, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinkPreviewProps {
  url: string;
}

/**
 * Validates whether a URL is safe for previewing / clicking, blocking SSRF and internal addresses.
 */
export function isSafePublicUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    // Protocol check
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();

    // Block loopback / localhost
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

    // Block private IPv4 ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = host.match(ipv4Regex);
    if (ipMatch) {
      const octet1 = parseInt(ipMatch[1], 10);
      const octet2 = parseInt(ipMatch[2], 10);

      if (octet1 === 10) return false;
      if (octet1 === 127) return false;
      if (octet1 === 169 && octet2 === 254) return false;
      if (octet1 === 192 && octet2 === 168) return false;
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return false;
      if (octet1 === 0) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function LinkPreviewCard({ url }: LinkPreviewProps) {
  const isSafe = React.useMemo(() => isSafePublicUrl(url), [url]);

  if (!isSafe) return null;

  let hostname = '';
  let pathname = '';
  try {
    const u = new URL(url);
    hostname = u.hostname;
    pathname = u.pathname !== '/' ? u.pathname : '';
  } catch {
    return null;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'block max-w-sm p-3 rounded-xl border border-white/[0.08] bg-white/[0.02]',
        'hover:bg-white/[0.05] hover:border-primary/40 transition group select-none mt-1'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform">
          <Globe className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground truncate">
            <span className="truncate">{hostname}</span>
            <span title="Safe link verified">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
            {pathname ? `${hostname}${pathname}` : url}
          </div>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0" />
      </div>
    </a>
  );
}
