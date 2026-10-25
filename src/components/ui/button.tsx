import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-control text-xs font-medium transition-all duration-fast ease-pro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-subtle hover:bg-primary-hover active:bg-primary-hover/90',
        default:
          'bg-primary text-primary-foreground shadow-subtle hover:bg-primary-hover active:bg-primary-hover/90',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-surface-hover hover:text-foreground border border-border',
        outline:
          'border border-border bg-transparent hover:bg-surface-hover hover:border-border-strong text-foreground',
        ghost:
          'hover:bg-surface-hover hover:text-foreground text-muted-foreground',
        destructive:
          'bg-danger text-primary-foreground hover:bg-danger/90 active:bg-danger/95 shadow-sm',
        link:
          'text-primary underline-offset-4 hover:underline p-0 h-auto font-normal',
        subtle:
          'bg-primary-subtle text-primary hover:bg-primary-subtle/80 border border-primary/20',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs min-h-[28px]',
        md: 'h-8 px-3 text-xs md:text-sm min-h-[32px] max-sm:min-h-[44px]',
        default: 'h-8 px-3 text-xs md:text-sm min-h-[32px] max-sm:min-h-[44px]',
        lg: 'h-10 px-4 text-sm font-medium min-h-[40px] max-sm:min-h-[44px]',
        icon: 'h-8 w-8 min-h-[32px] min-w-[32px] max-sm:min-h-[44px] max-sm:min-w-[44px] p-0',
        iconSm: 'h-7 w-7 min-h-[28px] min-w-[28px] p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5 shrink-0 text-current" aria-hidden="true" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
