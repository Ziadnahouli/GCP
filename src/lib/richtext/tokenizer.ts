import { RichTextNode } from './types';
import { EMOJI_BY_SHORTCODE } from '@/lib/emoji/emoji-data';

// Helper to check URL protocol safety
export function isSafeUrl(urlStr: string): boolean {
  try {
    const raw = urlStr.startsWith('www.') ? `https://${urlStr}` : urlStr;
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Replace shortcodes like :fire: with their emoji char 🔥
 */
export function replaceEmojiShortcodes(text: string): string {
  return text.replace(/:([a-zA-Z0-9_+-]+):/g, (match) => {
    const found = EMOJI_BY_SHORTCODE.get(match);
    return found ? found.char : match;
  });
}

/**
 * Linear/efficient AST tokenizer for chat markdown
 */
export function tokenizeMarkdown(rawText: string): RichTextNode[] {
  if (!rawText) return [];

  // Replace emoji shortcodes first
  const input = replaceEmojiShortcodes(rawText);

  // Check for fenced code blocks at block level
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  const nodes: RichTextNode[] = [];
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      const preceding = input.slice(lastIndex, match.index);
      nodes.push(...tokenizeInlineAndBlocks(preceding));
    }
    nodes.push({
      type: 'code_block',
      language: match[1]?.trim() || undefined,
      content: match[2]?.replace(/^\n+|\n+$/g, '') || '',
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    const remaining = input.slice(lastIndex);
    nodes.push(...tokenizeInlineAndBlocks(remaining));
  }

  return consolidateTextNodes(nodes);
}

/**
 * Parse line-based blocks (blockquotes) and inline formatting
 */
function tokenizeInlineAndBlocks(text: string): RichTextNode[] {
  const lines = text.split('\n');
  const result: RichTextNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Blockquote
    if (line.startsWith('> ') || line === '>') {
      const quoteContent = line.startsWith('> ') ? line.slice(2) : '';
      result.push({
        type: 'blockquote',
        content: quoteContent,
        children: tokenizeInline(quoteContent),
      });
    } else {
      result.push(...tokenizeInline(line));
    }

    if (i < lines.length - 1) {
      result.push({ type: 'text', content: '\n' });
    }
  }

  return result;
}

/**
 * Tokenize inline tokens: inline code, spoiler, bold, italic, strikethrough, link, mention
 */
function tokenizeInline(text: string): RichTextNode[] {
  if (!text) return [];

  const nodes: RichTextNode[] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    // 1. Inline code: `...`
    if (text[i] === '`') {
      const closeIdx = text.indexOf('`', i + 1);
      if (closeIdx !== -1) {
        const codeText = text.slice(i + 1, closeIdx);
        nodes.push({ type: 'inline_code', content: codeText });
        i = closeIdx + 1;
        continue;
      }
    }

    // 2. Spoiler: ||...||
    if (text[i] === '|' && text[i + 1] === '|') {
      const closeIdx = text.indexOf('||', i + 2);
      if (closeIdx !== -1) {
        const spoilerContent = text.slice(i + 2, closeIdx);
        nodes.push({
          type: 'spoiler',
          content: spoilerContent,
          children: tokenizeInline(spoilerContent),
        });
        i = closeIdx + 2;
        continue;
      }
    }

    // 3. Strikethrough: ~~...~~
    if (text[i] === '~' && text[i + 1] === '~') {
      const closeIdx = text.indexOf('~~', i + 2);
      if (closeIdx !== -1) {
        const strikeContent = text.slice(i + 2, closeIdx);
        nodes.push({
          type: 'strikethrough',
          content: strikeContent,
          children: tokenizeInline(strikeContent),
        });
        i = closeIdx + 2;
        continue;
      }
    }

    // 4. Bold: **...**
    if (text[i] === '*' && text[i + 1] === '*') {
      const closeIdx = text.indexOf('**', i + 2);
      if (closeIdx !== -1) {
        const boldContent = text.slice(i + 2, closeIdx);
        nodes.push({
          type: 'bold',
          content: boldContent,
          children: tokenizeInline(boldContent),
        });
        i = closeIdx + 2;
        continue;
      }
    }

    // 5. Italic with *: *...*
    if (text[i] === '*' && text[i + 1] !== '*') {
      // Must not be preceded or followed by space
      const prevChar = i > 0 ? text[i - 1] : ' ';
      const nextChar = i + 1 < len ? text[i + 1] : ' ';
      if (nextChar !== ' ' && nextChar !== '*') {
        const closeIdx = text.indexOf('*', i + 1);
        if (closeIdx !== -1 && text[closeIdx - 1] !== ' ') {
          const italicContent = text.slice(i + 1, closeIdx);
          nodes.push({
            type: 'italic',
            content: italicContent,
            children: tokenizeInline(italicContent),
          });
          i = closeIdx + 1;
          continue;
        }
      }
    }

    // 6. Italic with _: _..._ (Strict flanking: neither before nor after can be alphanumeric)
    if (text[i] === '_') {
      const prevChar = i > 0 ? text[i - 1] : ' ';
      const isWordCharBefore = /[a-zA-Z0-9]/.test(prevChar);

      if (!isWordCharBefore) {
        const closeIdx = text.indexOf('_', i + 1);
        if (closeIdx !== -1) {
          const nextAfterClose = closeIdx + 1 < len ? text[closeIdx + 1] : ' ';
          const isWordCharAfter = /[a-zA-Z0-9]/.test(nextAfterClose);

          if (!isWordCharAfter && text[i + 1] !== ' ' && text[closeIdx - 1] !== ' ') {
            const italicContent = text.slice(i + 1, closeIdx);
            nodes.push({
              type: 'italic',
              content: italicContent,
              children: tokenizeInline(italicContent),
            });
            i = closeIdx + 1;
            continue;
          }
        }
      }
    }

    // 7. Markdown Link: [label](url)
    if (text[i] === '[') {
      const closeBracket = text.indexOf(']', i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const label = text.slice(i + 1, closeBracket);
          const url = text.slice(closeBracket + 2, closeParen).trim();
          if (isSafeUrl(url)) {
            nodes.push({ type: 'link', label, url });
            i = closeParen + 1;
            continue;
          } else {
            // Unsafe url, do not treat as link
            nodes.push({ type: 'text', content: text.slice(i, closeParen + 1) });
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    // 8. Mentions: @username
    if (text[i] === '@') {
      const mentionMatch = text.slice(i).match(/^(@[a-zA-Z0-9_.-]+)/);
      if (mentionMatch) {
        const mention = mentionMatch[1];
        nodes.push({ type: 'mention', username: mention });
        i += mention.length;
        continue;
      }
    }

    // Accumulate plain character
    const lastNode = nodes[nodes.length - 1];
    if (lastNode && lastNode.type === 'text') {
      lastNode.content += text[i];
    } else {
      nodes.push({ type: 'text', content: text[i] });
    }
    i++;
  }

  return nodes;
}

/**
 * Merge consecutive text nodes
 */
function consolidateTextNodes(nodes: RichTextNode[]): RichTextNode[] {
  const merged: RichTextNode[] = [];
  for (const node of nodes) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type === 'text' && node.type === 'text') {
      prev.content += node.content;
    } else {
      merged.push(node);
    }
  }
  return merged;
}

/**
 * Strip all markdown formatting to produce a clean plain-text string for previews
 */
export function stripMarkdown(raw: string): string {
  if (!raw) return '';

  let text = replaceEmojiShortcodes(raw);

  // Strip code blocks
  text = text.replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, '$1');

  // Strip inline code
  text = text.replace(/`([^`]+)`/g, '$1');

  // Strip spoilers
  text = text.replace(/\|\|([^|]+)\|\|/g, '$1');

  // Strip bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');

  // Strip strikethrough
  text = text.replace(/~~([^~]+)~~/g, '$1');

  // Strip italic
  text = text.replace(/(^|\W)\*([^*]+)\*(?=\W|$)/g, '$1$2');
  text = text.replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1$2');

  // Strip links [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\((?:https?:\/\/[^\s)]+)\)/g, '$1');

  // Strip blockquote prefix
  text = text.replace(/^>\s*/gm, '');

  return text.trim();
}
