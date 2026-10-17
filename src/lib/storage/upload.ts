import { getBrowserClient } from '@/lib/supabase/client';

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'application/pdf',
  'text/plain',
  'application/zip',
];

const DISALLOWED_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.vbs',
  '.scr',
  '.msi',
  '.pif',
  '.jar',
  '.svg', // Explicitly block SVG to prevent stored SVG XSS injection
  '.html',
  '.htm',
  '.xhtml',
  '.js',
  '.mjs',
  '.php',
];

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File exceeds maximum size of 25MB (${formatFileSize(file.size)})`,
    };
  }

  // Path traversal and null byte prevention
  if (
    file.name.includes('/') ||
    file.name.includes('\\') ||
    file.name.includes('..') ||
    file.name.includes('\0')
  ) {
    return {
      valid: false,
      error: 'Filename contains forbidden characters or path traversal sequences.',
    };
  }

  const name = file.name.toLowerCase();

  // Explicitly block SVG by extension or MIME type (Stored XSS mitigation)
  if (name.endsWith('.svg') || file.type === 'image/svg+xml') {
    return {
      valid: false,
      error: 'SVG image files are strictly disallowed due to cross-site scripting risks.',
    };
  }

  // Primary extension check
  for (const ext of DISALLOWED_EXTENSIONS) {
    if (name.endsWith(ext)) {
      return {
        valid: false,
        error: `Executable, script, and active-content files (${ext}) are strictly blocked for security.`,
      };
    }
  }

  // Double extension spoofing check (e.g. document.pdf.exe)
  const segments = name.split('.');
  if (segments.length > 2) {
    for (let i = 1; i < segments.length; i++) {
      const subExt = `.${segments[i]}`;
      if (DISALLOWED_EXTENSIONS.includes(subExt)) {
        return {
          valid: false,
          error: `Suspicious double extension containing blocked file type (${subExt}).`,
        };
      }
    }
  }

  // Explicitly block SVG MIME type
  if (file.type === 'image/svg+xml') {
    return {
      valid: false,
      error: 'SVG image files are strictly disallowed due to cross-site scripting risks.',
    };
  }

  const isAllowedMime =
    ALLOWED_MIME_TYPES.includes(file.type) ||
    (file.type.startsWith('image/') && file.type !== 'image/svg+xml') ||
    file.type.startsWith('video/') ||
    file.type.startsWith('audio/');

  if (!isAllowedMime) {
    return {
      valid: false,
      error: 'File format not supported. Please upload standard images, videos, audio, or PDF/plain-text documents.',
    };
  }

  return { valid: true };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function sanitizeFileName(originalName: string): string {
  const extension = originalName.includes('.')
    ? `.${originalName.split('.').pop()?.toLowerCase()}`
    : '';
  const baseName = originalName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 50);
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${baseName}_${randomSuffix}${extension}`;
}

export async function resolveAttachmentSignedUrl(
  supabase: ReturnType<typeof getBrowserClient>,
  storagePath: string
): Promise<string | null> {
  try {
    const { data: signData, error: signErr } = await supabase.storage
      .from('attachments')
      .createSignedUrl(storagePath, 3600); // 1 hour valid signed URL

    if (!signErr && signData?.signedUrl) {
      return signData.signedUrl;
    }

    // Fallback to public URL if signed URL creation is unavailable
    const { data: pubData } = supabase.storage.from('attachments').getPublicUrl(storagePath);
    return pubData?.publicUrl || null;
  } catch {
    return null;
  }
}

export async function uploadAttachmentFile({
  file,
  conversationId,
  userId,
}: {
  file: File;
  conversationId: string;
  userId: string;
}): Promise<{ storagePath: string | null; publicUrl: string | null; error: string | null }> {
  const validation = validateFile(file);
  if (!validation.valid) {
    return { storagePath: null, publicUrl: null, error: validation.error || 'Invalid file' };
  }

  const supabase = getBrowserClient();
  const safeName = sanitizeFileName(file.name);
  const path = `${conversationId}/${userId}/${Date.now()}_${safeName}`;

  try {
    const { error: uploadErr } = await supabase.storage
      .from('attachments')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadErr) {
      return { storagePath: null, publicUrl: null, error: uploadErr.message };
    }

    // Attempt to acquire a secure signed URL for private attachments
    let resolvedUrl: string | null = null;
    try {
      const { data: signData } = await supabase.storage
        .from('attachments')
        .createSignedUrl(path, 86400); // 24 hours
      if (signData?.signedUrl) {
        resolvedUrl = signData.signedUrl;
      }
    } catch {}

    if (!resolvedUrl) {
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
      resolvedUrl = urlData?.publicUrl || null;
    }

    return {
      storagePath: path,
      publicUrl: resolvedUrl,
      error: null,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Storage upload failed';
    return { storagePath: null, publicUrl: null, error: errorMsg };
  }
}
