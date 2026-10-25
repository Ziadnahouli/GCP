import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  helperText?: React.ReactNode;
  errorText?: React.ReactNode;
  maxLength?: number;
  showCount?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
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
    const textareaId = id || generatedId;
    const [charCount, setCharCount] = React.useState<number>(() => {
      const val = value !== undefined ? value : defaultValue;
      return typeof val === 'string' ? val.length : 0;
    });

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
        <div className="relative w-full">
          <textarea
            id={textareaId}
            maxLength={maxLength}
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            className={cn(
              'flex min-h-[64px] w-full rounded-card border bg-card p-2.5 text-xs md:text-sm text-foreground ring-offset-background transition-all duration-fast ease-pro',
              'placeholder:text-muted-foreground/60',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-primary',
              'disabled:cursor-not-allowed disabled:opacity-50 resize-y',
              hasError ? 'border-danger focus-visible:ring-danger' : 'border-border',
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        <div className="flex items-center justify-between gap-2 px-0.5">
          {(errorText || helperText) ? (
            <p
              className={cn(
                'text-xs leading-tight',
                hasError ? 'text-danger font-medium' : 'text-muted-foreground'
              )}
            >
              {errorText || helperText}
            </p>
          ) : <span />}
          {showCount && maxLength && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground shrink-0 ml-auto">
              {charCount}/{maxLength}
            </span>
          )}
        </div>
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
