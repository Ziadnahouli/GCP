import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon, ...props }, ref) => {
    if (icon) {
      return (
        <div className="relative flex items-center w-full">
          <div className="absolute left-3 text-muted-foreground pointer-events-none flex items-center">
            {icon}
          </div>
          <input
            type={type}
            className={cn(
              'flex h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] pl-9 pr-3 py-1.5 text-xs text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:border-white/[0.15] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
      );
    }

    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:border-white/[0.15] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
