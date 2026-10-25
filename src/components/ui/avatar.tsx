import * as React from 'react';
import { cn, formatInitials } from '@/lib/utils';
import { UserStatus } from '@/lib/types/profile';
import { MicOff } from 'lucide-react';

export type AvatarSize = 20 | 24 | 32 | 40 | 64 | '20' | '24' | '32' | '40' | '64' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string | null;
  status?: UserStatus;
  size?: AvatarSize;
  showStatus?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
}

const sizeMap: Record<string, { container: string; text: string; px: number; statusSize: string }> = {
  '20': { container: 'w-5 h-5', text: 'text-xs', px: 20, statusSize: 'w-2 h-2' },
  '24': { container: 'w-6 h-6', text: 'text-xs', px: 24, statusSize: 'w-2.5 h-2.5' },
  '32': { container: 'w-8 h-8', text: 'text-xs', px: 32, statusSize: 'w-3 h-3' },
  '40': { container: 'w-10 h-10', text: 'text-sm', px: 40, statusSize: 'w-3.5 h-3.5' },
  '64': { container: 'w-16 h-16', text: 'text-xl', px: 64, statusSize: 'w-4.5 h-4.5' },
  xs: { container: 'w-5 h-5', text: 'text-xs', px: 20, statusSize: 'w-2 h-2' },
  sm: { container: 'w-8 h-8', text: 'text-xs', px: 32, statusSize: 'w-3 h-3' },
  md: { container: 'w-10 h-10', text: 'text-sm', px: 40, statusSize: 'w-3.5 h-3.5' },
  lg: { container: 'w-14 h-14', text: 'text-base', px: 56, statusSize: 'w-4 h-4' },
  xl: { container: 'w-16 h-16', text: 'text-xl', px: 64, statusSize: 'w-4.5 h-4.5' },
};

// 8 muted neutral surfaces for initials fallback
const fallbackHues = [
  'bg-muted text-foreground',
  'bg-primary-subtle text-primary',
  'bg-success/15 text-success',
  'bg-warning/15 text-warning',
  'bg-secondary text-secondary-foreground',
  'bg-surface-hover text-foreground',
  'bg-card text-foreground',
  'bg-muted text-muted-foreground',
];

function getHueForName(name?: string | null): string {
  if (!name) return fallbackHues[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % fallbackHues.length;
  return fallbackHues[index];
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  status,
  size = 32,
  showStatus = false,
  isSpeaking = false,
  isMuted = false,
  className,
  ...props
}) => {
  const [imgError, setImgError] = React.useState(false);
  const sizeConfig = sizeMap[String(size)] || sizeMap['32'];
  const fallbackHue = React.useMemo(() => getHueForName(name), [name]);

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center rounded-full',
        sizeConfig.container,
        isSpeaking && 'ring-2 ring-primary ring-offset-2 ring-offset-background transition-all',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-border font-medium',
          fallbackHue
        )}
      >
        {src && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name || 'Avatar'}
            width={sizeConfig.px}
            height={sizeConfig.px}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className={cn('tracking-wide font-medium', sizeConfig.text)}>
            {formatInitials(name)}
          </span>
        )}
      </div>

      {/* Accessible Presence Badge: Never color-only */}
      {showStatus && status && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-background flex items-center justify-center shrink-0 z-10',
            sizeConfig.statusSize,
            status === 'online' && 'bg-status-online',
            status === 'idle' && 'bg-status-idle',
            status === 'dnd' && 'bg-status-dnd',
            status === 'offline' && 'bg-background border border-status-offline'
          )}
          title={`Status: ${status}`}
          aria-label={`Status: ${status}`}
        >
          {status === 'dnd' && (
            <span className="w-1.5 h-0.5 bg-primary-foreground rounded-full" />
          )}
          {status === 'idle' && (
            <span className="w-1 h-1 bg-background rounded-full translate-x-[1px] -translate-y-[1px]" />
          )}
        </span>
      )}

      {/* Mic Muted Badge */}
      {isMuted && (
        <span
          className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full bg-danger text-primary-foreground ring-2 ring-background flex items-center justify-center z-10"
          title="Muted"
          aria-label="Microphone muted"
        >
          <MicOff className="w-2 h-2" />
        </span>
      )}
    </div>
  );
};

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  max?: number;
  children: React.ReactNode;
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  children,
  max = 4,
  className,
  ...props
}) => {
  const childrenArray = React.Children.toArray(children);
  const visibleAvatars = childrenArray.slice(0, max);
  const excess = childrenArray.length - max;

  return (
    <div className={cn('flex items-center -space-x-2 overflow-hidden', className)} {...props}>
      {visibleAvatars.map((child, i) => (
        <div key={i} className="ring-2 ring-background rounded-full">
          {child}
        </div>
      ))}
      {excess > 0 && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-muted-foreground ring-2 ring-background">
          +{excess}
        </div>
      )}
    </div>
  );
};
