'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface AboutMeFormattedProps {
  content?: string | null;
  className?: string;
}

/**
 * Renders sanitized bio with allowed formatting:
 * bold (**text**), italic (*text* or _text_), inline code (`code`), line breaks,
 * and safe links. Never renders raw HTML or external script tags.
 */
export const AboutMeFormatted: React.FC<AboutMeFormattedProps> = ({
  content,
  className,
}) => {
  if (!content || !content.trim()) {
    return null;
  }

  // Parse simple markdown tokens safely without dangerouslySetInnerHTML
  const renderFormattedLine = (line: string, lineIndex: number) => {
    // Regex matching: **bold**, *italic*, `code`, and [label](url)
    const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/[^\s]+)/g;
    const parts = line.split(tokenRegex);

    return (
      <React.Fragment key={lineIndex}>
        {parts.map((part, partIndex) => {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return (
              <strong key={partIndex} className="font-semibold text-foreground">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            return (
              <em key={partIndex} className="italic text-foreground/90">
                {part.slice(1, -1)}
              </em>
            );
          }
          if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
            return (
              <code
                key={partIndex}
                className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs text-foreground border border-border/50"
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          if (part.startsWith('http://') || part.startsWith('https://')) {
            return (
              <a
                key={partIndex}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline underline-offset-2 break-all"
              >
                {part}
              </a>
            );
          }
          return <span key={partIndex}>{part}</span>;
        })}
      </React.Fragment>
    );
  };

  const lines = content.split('\n');

  return (
    <div
      dir="auto"
      className={cn(
        'text-sm leading-relaxed text-foreground/90 break-words whitespace-pre-wrap select-text',
        className
      )}
    >
      {lines.map((line, idx) => (
        <React.Fragment key={idx}>
          {renderFormattedLine(line, idx)}
          {idx < lines.length - 1 && '\n'}
        </React.Fragment>
      ))}
    </div>
  );
};

