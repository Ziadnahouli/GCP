'use client';

import * as React from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { RichTextNode } from './types';
import { tokenizeMarkdown } from './tokenizer';
import { MentionTrigger } from '@/components/profile/MentionTrigger';
import { cn } from '@/lib/utils';

interface RichTextRendererProps {
  content: string;
  isMe?: boolean;
  className?: string;
}

export function RichTextRenderer({ content, isMe = false, className }: RichTextRendererProps) {
  const nodes = React.useMemo(() => tokenizeMarkdown(content), [content]);

  return (
    <span className={cn('rich-text leading-relaxed break-words', className)}>
      {nodes.map((node, idx) => (
        <NodeRenderer key={idx} node={node} isMe={isMe} />
      ))}
    </span>
  );
}

function NodeRenderer({ node, isMe }: { node: RichTextNode; isMe?: boolean }): React.ReactElement | null {
  switch (node.type) {
    case 'text':
      return <span>{node.content}</span>;

    case 'bold':
      return (
        <strong className="font-semibold text-foreground">
          {node.children ? (
            node.children.map((child, idx) => <NodeRenderer key={idx} node={child} isMe={isMe} />)
          ) : (
            node.content
          )}
        </strong>
      );

    case 'italic':
      return (
        <em className="italic">
          {node.children ? (
            node.children.map((child, idx) => <NodeRenderer key={idx} node={child} isMe={isMe} />)
          ) : (
            node.content
          )}
        </em>
      );

    case 'strikethrough':
      return (
        <s className="line-through opacity-75">
          {node.children ? (
            node.children.map((child, idx) => <NodeRenderer key={idx} node={child} isMe={isMe} />)
          ) : (
            node.content
          )}
        </s>
      );

    case 'inline_code':
      return (
        <code className="px-1.5 py-0.5 mx-0.5 rounded bg-muted/60 border border-border/50 font-mono text-[0.875em] text-foreground select-all">
          {node.content}
        </code>
      );

    case 'code_block':
      return <CodeBlock content={node.content} language={node.language} />;

    case 'blockquote':
      return (
        <blockquote className="border-l-4 border-primary/50 pl-3 py-1 my-1.5 italic text-muted-foreground bg-muted/20 rounded-r-md block">
          {node.children ? (
            node.children.map((child, idx) => <NodeRenderer key={idx} node={child} isMe={isMe} />)
          ) : (
            node.content
          )}
        </blockquote>
      );

    case 'spoiler':
      return <Spoiler content={node.content} childrenNodes={node.children} isMe={isMe} />;

    case 'link':
      return (
        <a
          href={node.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center gap-0.5 underline underline-offset-2 break-all font-medium transition-colors',
            isMe
              ? 'text-primary-foreground underline hover:text-primary-foreground/90'
              : 'text-primary underline hover:text-primary-hover'
          )}
        >
          <span>{node.label}</span>
          <ExternalLink className="w-3 h-3 inline shrink-0 opacity-80" />
        </a>
      );

    case 'mention': {
      const tagLower = node.username.toLowerCase();
      const isSpecial = tagLower === '@everyone' || tagLower === '@all' || tagLower === '@here';
      if (isSpecial) {
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-semibold mx-0.5 select-none bg-warning/20 text-warning border border-warning/30 font-bold hover:bg-warning/30">
            {node.username}
          </span>
        );
      }
      return <MentionTrigger username={node.username} />;
    }

    case 'emoji':
      return (
        <span role="img" aria-label={node.name || 'emoji'} className="inline-block mx-0.5">
          {node.char}
        </span>
      );

    default:
      return null;
  }
}

function CodeBlock({ content, language }: { content: string; language?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative my-2 rounded-lg border border-border bg-card/90 overflow-hidden font-mono text-xs shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/50 text-[11px] text-muted-foreground">
        <span className="uppercase tracking-wider font-semibold">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground p-1 rounded transition-colors"
          title="Copy code"
          aria-label="Copy code"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-foreground select-all leading-normal whitespace-pre-wrap">
        <code>{content}</code>
      </pre>
    </div>
  );
}

function Spoiler({
  content,
  childrenNodes,
  isMe,
}: {
  content: string;
  childrenNodes?: RichTextNode[];
  isMe?: boolean;
}) {
  const [revealed, setRevealed] = React.useState(false);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setRevealed((prev) => !prev);
      }}
      className={cn(
        'inline-block px-1.5 py-0.5 rounded cursor-pointer transition-all select-none',
        revealed
          ? 'bg-muted/40 text-foreground'
          : 'bg-muted-foreground/30 hover:bg-muted-foreground/40 text-transparent selection:text-transparent'
      )}
      title={revealed ? 'Click to hide spoiler' : 'Click to reveal spoiler'}
      aria-label={revealed ? `Spoiler: ${content}` : 'Hidden spoiler. Click to reveal.'}
    >
      {revealed ? (
        childrenNodes ? (
          childrenNodes.map((child, idx) => <NodeRenderer key={idx} node={child} isMe={isMe} />)
        ) : (
          content
        )
      ) : (
        <span>{content}</span>
      )}
    </button>
  );
}
