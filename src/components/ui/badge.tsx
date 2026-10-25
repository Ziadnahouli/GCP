import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        neutral: 'border border-border bg-secondary text-secondary-foreground',
        default: 'border-transparent bg-primary text-primary-foreground shadow-subtle',
        accent: 'border-transparent bg-primary text-primary-foreground shadow-subtle',
        subtle: 'border border-primary/20 bg-primary-subtle text-primary',
        danger: 'border-transparent bg-danger text-primary-foreground shadow-sm',
        destructive: 'border-transparent bg-danger text-primary-foreground shadow-sm',
        success: 'border border-success/30 bg-success/15 text-success',
        warning: 'border border-warning/30 bg-warning/15 text-warning',
        outline: 'border border-border text-foreground bg-transparent',
      },
      size: {
        sm: 'text-xs px-1.5 py-0.2',
        default: 'text-xs px-2 py-0.5',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  count?: number;
  max?: number;
  variant?: 'accent' | 'neutral' | 'danger';
}

function Pill({ count, max = 99, variant = 'accent', className, children, ...props }: PillProps) {
  const displayCount = count !== undefined ? (count > max ? `${max}+` : String(count)) : null;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-xs font-semibold rounded-full select-none tabular-nums leading-none',
        variant === 'accent' && 'bg-primary text-primary-foreground',
        variant === 'neutral' && 'bg-muted text-foreground border border-border',
        variant === 'danger' && 'bg-danger text-primary-foreground',
        className
      )}
      {...props}
    >
      {displayCount !== null ? displayCount : children}
    </span>
  );
}

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {}

function Kbd({ className, children, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded-control border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-muted-foreground shadow-subtle select-none',
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

export { Badge, Pill, Kbd, badgeVariants };
