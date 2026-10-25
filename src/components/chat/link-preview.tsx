'use client';

import * as React from 'react';
import { ExternalLink, Globe, ShieldCheck, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinkPreviewProps {
  url: string;
}

interface PreviewMeta {
  url: string;
  hostname: string;
  siteName?: string;
  title: string;
  description: string | null;
  image: string | null;
  favicon: string;
}

export function isSafePublicUrl(urlString: string): boolean {
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

// Memory cache for link preview metadata to prevent duplicate network calls
const previewCache = new Map<string, PreviewMeta>();

export function LinkPreviewCard({ url }: LinkPreviewProps) {
  const isSafe = React.useMemo(() => isSafePublicUrl(url), [url]);
  const [meta, setMeta] = React.useState<PreviewMeta | null>(() => previewCache.get(url) || null);
  const [loading, setLoading] = React.useState(!meta);
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    if (!isSafe || !url) return;
    if (previewCache.has(url)) {
      setMeta(previewCache.get(url)!);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        previewCache.set(url, data);
        setMeta(data);
      })
      .catch(() => {
        if (!active) return;
        try {
          const parsed = new URL(url);
          const fallbackMeta: PreviewMeta = {
            url,
            hostname: parsed.hostname,
            title: parsed.hostname,
            description: null,
            image: null,
            favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`,
          };
          setMeta(fallbackMeta);
        } catch {}
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [url, isSafe]);

  if (!isSafe) return null;

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }

  const faviconUrl = meta?.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  const displayTitle = meta?.title || hostname;
  const displaySiteName = meta?.siteName || hostname.replace(/^www\./, '');

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'group block max-w-sm sm:max-w-md my-1.5 rounded-xl border border-border bg-card/90 backdrop-blur-md',
        'border-l-4 border-l-primary hover:border-primary/50 hover:bg-card transition-all duration-150 shadow-md select-none overflow-hidden'
      )}
    >
      <div className="p-3 space-y-2">
        {/* Site Header: Favicon + Domain + Verified Pill */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={faviconUrl}
              alt=""
              width={14}
              height={14}
              className="w-3.5 h-3.5 rounded-sm shrink-0 object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              {displaySiteName}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0 text-success text-xs bg-success/10 border border-success/20 px-1.5 py-0.2 rounded-full font-medium">
            <ShieldCheck className="w-3 h-3" />
            <span>Safe Link</span>
          </div>
        </div>

        {/* Title */}
        <div className="text-xs font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1 flex items-center justify-between gap-2">
          <span className="truncate">{displayTitle}</span>
          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0" />
        </div>

        {/* Description snippet if available */}
        {meta?.description && (
          <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed font-normal">
            {meta.description}
          </p>
        )}

        {/* Rich preview image if available */}
        {meta?.image && !imgError && (
          <div className="relative mt-2 rounded-lg overflow-hidden border border-border bg-black/40 max-h-44">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={meta.image}
              alt={displayTitle}
              className="w-full h-auto max-h-44 object-cover group-hover:scale-[1.01] transition-transform duration-200"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          </div>
        )}
      </div>
    </a>
  );
}
