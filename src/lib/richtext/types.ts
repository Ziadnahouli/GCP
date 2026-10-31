export type RichTextNode =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string; children?: RichTextNode[] }
  | { type: 'italic'; content: string; children?: RichTextNode[] }
  | { type: 'strikethrough'; content: string; children?: RichTextNode[] }
  | { type: 'inline_code'; content: string }
  | { type: 'code_block'; content: string; language?: string }
  | { type: 'blockquote'; content: string; children?: RichTextNode[] }
  | { type: 'spoiler'; content: string; children?: RichTextNode[] }
  | { type: 'link'; label: string; url: string }
  | { type: 'mention'; username: string }
  | { type: 'emoji'; char: string; name?: string };
