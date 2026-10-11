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
];

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File exceeds maximum size of 25MB (${formatFileSize(file.size)})`,
    };
  }

  const name = file.name.toLowerCase();
  for (const ext of DISALLOWED_EXTENSIONS) {
    if (name.endsWith(ext)) {
      return {
        valid: false,
        error: `Executable and script files (${ext}) are strictly blocked for security.`,
      };
    }
  }

  const isAllowedMime =
    ALLOWED_MIME_TYPES.includes(file.type) ||
    file.type.startsWith('image/') ||
    file.type.startsWith('video/') ||
    file.type.startsWith('audio/');

  if (!isAllowedMime) {
    return {
      valid: false,
      error: 'File format not supported. Please upload images, videos, audio, or standard documents.',
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

    const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);

    return {
      storagePath: path,
      publicUrl: urlData?.publicUrl || null,
      error: null,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Storage upload failed';
    return { storagePath: null, publicUrl: null, error: errorMsg };
  }
}
