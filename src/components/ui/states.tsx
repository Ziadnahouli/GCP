import * as React from 'react';
import { AlertCircle, AlertTriangle, Info, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center select-none w-full max-w-sm mx-auto',
        className
      )}
      {...props}
    >
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary border border-border text-muted-foreground mb-3">
          {icon}
        </div>
      )}
      <h4 className="text-sm font-semibold text-foreground tracking-tight">{title}</h4>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-xs">
          {description}
        </p>
      )}
      {action && (
        <Button
          size="sm"
          variant="primary"
          className="mt-4"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'An unexpected error occurred while loading this view.',
  onRetry,
  isRetrying = false,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center select-none w-full max-w-sm mx-auto',
        className
      )}
      {...props}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 border border-danger/20 text-danger mb-3">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h4 className="text-sm font-semibold text-foreground tracking-tight">{title}</h4>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-xs">
        {description}
      </p>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          className="mt-4 gap-1.5"
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isRetrying && 'animate-spin')} />
          {isRetrying ? 'Retrying...' : 'Try again'}
        </Button>
      )}
    </div>
  );
}

export type BannerVariant = 'info' | 'warning' | 'danger' | 'offline' | 'reconnecting';

export interface BannerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BannerVariant;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function Banner({
  variant = 'info',
  title,
  description,
  action,
  className,
  ...props
}: BannerProps) {
  const icons: Record<BannerVariant, React.ReactNode> = {
    info: <Info className="w-4 h-4 text-primary shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-warning shrink-0" />,
    danger: <AlertCircle className="w-4 h-4 text-danger shrink-0" />,
    offline: <WifiOff className="w-4 h-4 text-warning shrink-0" />,
    reconnecting: <RefreshCw className="w-4 h-4 text-primary shrink-0 animate-spin" />,
  };

  const borders: Record<BannerVariant, string> = {
    info: 'border-primary/20 bg-primary-subtle text-foreground',
    warning: 'border-warning/30 bg-warning/15 text-foreground',
    danger: 'border-danger/30 bg-danger/15 text-foreground',
    offline: 'border-warning/30 bg-warning/15 text-foreground',
    reconnecting: 'border-primary/20 bg-primary-subtle text-foreground',
  };

  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-between gap-3 px-3.5 py-2 text-xs border-b duration-fast select-none',
        borders[variant],
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icons[variant]}
        <div className="min-w-0">
          <span className="font-semibold">{title}</span>
          {description && (
            <span className="ml-1.5 text-muted-foreground opacity-90 truncate hidden sm:inline">
              {description}
            </span>
          )}
        </div>
      </div>
      {action && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs shrink-0"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
