import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { tokenizeMarkdown, stripMarkdown } from '@/lib/richtext/tokenizer';
import { RichTextRenderer } from '@/lib/richtext/RichTextRenderer';

vi.mock('@/components/profile/MentionTrigger', () => ({
  MentionTrigger: ({ username }: { username: string }) => <span>{username}</span>,
}));

describe('RichText Markdown Tokenizer & Plain Text Stripper', () => {
  it('parses bold text correctly', () => {
    const tokens = tokenizeMarkdown('This is **bold** text');
    expect(tokens).toEqual([
      { type: 'text', content: 'This is ' },
      { type: 'bold', content: 'bold', children: [{ type: 'text', content: 'bold' }] },
      { type: 'text', content: ' text' },
    ]);
  });

  it('parses italic text with asterisk and underscore flanking rules', () => {
    const tokensAsterisk = tokenizeMarkdown('This is *italic* text');
    expect(tokensAsterisk).toEqual([
      { type: 'text', content: 'This is ' },
      { type: 'italic', content: 'italic', children: [{ type: 'text', content: 'italic' }] },
      { type: 'text', content: ' text' },
    ]);

    const tokensUnderscore = tokenizeMarkdown('This is _italic_ text');
    expect(tokensUnderscore).toEqual([
      { type: 'text', content: 'This is ' },
      { type: 'italic', content: 'italic', children: [{ type: 'text', content: 'italic' }] },
      { type: 'text', content: ' text' },
    ]);

    // Flanking rule: snake_case_identifier must NOT turn into italics
    const tokensSnake = tokenizeMarkdown('Check user_account_id in the db');
    expect(tokensSnake).toEqual([
      { type: 'text', content: 'Check user_account_id in the db' },
    ]);
  });

  it('parses strikethrough text', () => {
    const tokens = tokenizeMarkdown('This is ~~deleted~~ text');
    expect(tokens).toEqual([
      { type: 'text', content: 'This is ' },
      { type: 'strikethrough', content: 'deleted', children: [{ type: 'text', content: 'deleted' }] },
      { type: 'text', content: ' text' },
    ]);
  });

  it('parses inline code without interpreting formatting inside it', () => {
    const tokens = tokenizeMarkdown('Use `const **x** = 1;` here');
    expect(tokens).toEqual([
      { type: 'text', content: 'Use ' },
      { type: 'inline_code', content: 'const **x** = 1;' },
      { type: 'text', content: ' here' },
    ]);
  });

  it('parses fenced code blocks with optional language', () => {
    const code = '```typescript\nconst x = 42;\nconsole.log(x);\n```';
    const tokens = tokenizeMarkdown(code);
    expect(tokens).toEqual([
      {
        type: 'code_block',
        language: 'typescript',
        content: 'const x = 42;\nconsole.log(x);',
      },
    ]);
  });

  it('parses spoilers with ||text||', () => {
    const tokens = tokenizeMarkdown('Snape kills ||Dumbledore|| in the end');
    expect(tokens).toEqual([
      { type: 'text', content: 'Snape kills ' },
      {
        type: 'spoiler',
        content: 'Dumbledore',
        children: [{ type: 'text', content: 'Dumbledore' }],
      },
      { type: 'text', content: ' in the end' },
    ]);
  });

  it('parses markdown links [label](url) and validates safety', () => {
    const tokens = tokenizeMarkdown('Check [Google](https://google.com) now');
    expect(tokens).toEqual([
      { type: 'text', content: 'Check ' },
      {
        type: 'link',
        label: 'Google',
        url: 'https://google.com',
      },
      { type: 'text', content: ' now' },
    ]);

    // Javascript/data links must be neutralized or rendered as plain text
    const unsafeTokens = tokenizeMarkdown('[evil](javascript:alert(1))');
    expect(unsafeTokens[0].type).not.toBe('link');
  });

  it('parses blockquotes', () => {
    const tokens = tokenizeMarkdown('> This is a quote\nRegular text');
    expect(tokens[0].type).toBe('blockquote');
    if (tokens[0].type === 'blockquote') {
      expect(tokens[0].content).toBe('This is a quote');
    }
  });

  it('parses user mentions and special mentions', () => {
    const tokens = tokenizeMarkdown('Hello @alice and @everyone!');
    expect(tokens).toEqual([
      { type: 'text', content: 'Hello ' },
      { type: 'mention', username: '@alice' },
      { type: 'text', content: ' and ' },
      { type: 'mention', username: '@everyone' },
      { type: 'text', content: '!' },
    ]);
  });

  it('replaces recognized emoji shortcodes with glyphs', () => {
    const tokens = tokenizeMarkdown('Awesome work :fire: :thumbsup:!');
    expect(tokens).toEqual([
      { type: 'text', content: 'Awesome work 🔥 👍!' },
    ]);
  });

  it('strips markdown formatting cleanly for plain text previews', () => {
    expect(stripMarkdown('**Bold** and *italic* and ~~strike~~')).toBe('Bold and italic and strike');
    expect(stripMarkdown('Check `const x = 1` here')).toBe('Check const x = 1 here');
    expect(stripMarkdown('Visit [Google](https://google.com)')).toBe('Visit Google');
    expect(stripMarkdown('Spoiler: ||secret||')).toBe('Spoiler: secret');
    expect(stripMarkdown('> quoted text')).toBe('quoted text');
    expect(stripMarkdown('```ts\ncode\n```')).toBe('code');
    expect(stripMarkdown('Hello :fire: world')).toBe('Hello 🔥 world');
  });

  it('renders RichTextRenderer with bold, code block, and interactive spoilers', () => {
    const { container } = render(
      <RichTextRenderer content="Hello **bold soldier** with `code` and ||secret data||" />
    );

    // Bold rendered as strong tag
    const strongEl = container.querySelector('strong');
    expect(strongEl).not.toBeNull();
    expect(strongEl?.textContent).toBe('bold soldier');

    // Code rendered as code tag
    const codeEl = container.querySelector('code');
    expect(codeEl).not.toBeNull();
    expect(codeEl?.textContent).toBe('code');

    // Spoiler starts hidden
    const spoilerBtn = screen.getByRole('button', { name: /Hidden spoiler/i });
    expect(spoilerBtn).toBeInTheDocument();

    // Click to reveal
    fireEvent.click(spoilerBtn);
    expect(screen.getByRole('button', { name: /Spoiler: secret data/i })).toBeInTheDocument();
  });
});
