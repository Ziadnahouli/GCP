import * as React from 'react';
import { cn, formatInitials } from '@/lib/utils';
import { UserStatus } from '@/lib/types/profile';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string | null;
  status?: UserStatus;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-20 h-20 text-2xl',
};

const statusClasses: Record<UserStatus, string> = {
  online: 'bg-emerald-500 border-surface-sidebar',
  idle: 'bg-amber-500 border-surface-sidebar',
  dnd: 'bg-rose-500 border-surface-sidebar',
  offline: 'bg-slate-500 border-surface-sidebar',
};

const statusSizeClasses = {
  xs: 'w-2 h-2 border-[1.5px] -bottom-0.5 -right-0.5',
  sm: 'w-2.5 h-2.5 border-[1.5px] -bottom-0.5 -right-0.5',
  md: 'w-3.5 h-3.5 border-2 bottom-0 right-0',
  lg: 'w-4 h-4 border-2 bottom-0 right-0',
  xl: 'w-5 h-5 border-[2.5px] bottom-0.5 right-0.5',
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  status,
  size = 'md',
  showStatus = false,
  className,
  ...props
}) => {
  const [imgError, setImgError] = React.useState(false);

  return (
    <div className={cn('relative inline-flex flex-shrink-0', className)} {...props}>
      <div
        className={cn(
          'relative flex items-center justify-center rounded-full overflow-hidden bg-surface-panel border border-border/80 font-semibold select-none shadow-sm',
          sizeClasses[size]
        )}
      >
        {src && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name || 'Avatar'}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-foreground/90 font-medium tracking-wider">
            {formatInitials(name)}
          </span>
        )}
      </div>

      {showStatus && status && (
        <span
          className={cn(
            'absolute rounded-full ring-0 shadow-sm z-10 transition-colors',
            statusClasses[status],
            statusSizeClasses[size]
          )}
          title={`Status: ${status}`}
        />
      )}
    </div>
  );
};
