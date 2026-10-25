import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  icon?: React.ReactNode;
  prefixSlot?: React.ReactNode;
  suffixSlot?: React.ReactNode;
  helperText?: React.ReactNode;
  errorText?: React.ReactNode;
  maxLength?: number;
  showCount?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      icon,
      prefixSlot,
      suffixSlot,
      helperText,
      errorText,
      maxLength,
      showCount = false,
      value,
      defaultValue,
      onChange,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const [charCount, setCharCount] = React.useState<number>(() => {
      const val = value !== undefined ? value : defaultValue;
      return typeof val === 'string' ? val.length : 0;
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setCharCount(e.target.value.length);
      onChange?.(e);
    };

    React.useEffect(() => {
      if (value !== undefined && typeof value === 'string') {
        setCharCount(value.length);
      }
    }, [value]);

    const hasError = Boolean(errorText);

    return (
      <div className="w-full flex flex-col gap-1 text-left">
        <div className="relative flex items-center w-full">
          {(icon || prefixSlot) && (
            <div className="absolute left-2.5 text-muted-foreground pointer-events-none flex items-center justify-center shrink-0">
              {icon || prefixSlot}
            </div>
          )}
          <input
            id={inputId}
            type={type}
            maxLength={maxLength}
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            className={cn(
              'flex h-8 w-full rounded-card border bg-card px-2.5 py-1 text-xs sm:text-sm max-sm:text-md text-foreground ring-offset-background transition-all duration-fast ease-pro',
              'min-h-[32px] max-sm:min-h-[44px]',
              'placeholder:text-muted-foreground/60',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-primary',
              'disabled:cursor-not-allowed disabled:opacity-50',
              hasError ? 'border-danger focus-visible:ring-danger' : 'border-border',
              (icon || prefixSlot) && 'pl-8',
              (suffixSlot || (showCount && maxLength)) && 'pr-12',
              className
            )}
            ref={ref}
            {...props}
          />
          {(suffixSlot || (showCount && maxLength)) && (
            <div className="absolute right-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {suffixSlot}
              {showCount && maxLength && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {charCount}/{maxLength}
                </span>
              )}
            </div>
          )}
        </div>
        {(errorText || helperText) && (
          <p
            className={cn(
              'text-xs leading-tight px-0.5',
              hasError ? 'text-danger font-medium' : 'text-muted-foreground'
            )}
          >
            {errorText || helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
