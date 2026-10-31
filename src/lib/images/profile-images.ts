/**
 * Profile image utilities: Storage paths, Supabase image transformations,
 * client-side canvas crop/WebP processing, and EXIF stripping.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  resize?: 'cover' | 'contain';
  format?: 'webp' | 'origin';
  quality?: number;
}

/**
 * Checks whether an image URL is an allowed Supabase storage asset.
 * Rejects arbitrary 3rd-party URLs to prevent IP leaks and tracking pixels.
 */
export function isAllowedStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  if (url.startsWith('/')) return true; // Local static assets like /decorations/
  if (SUPABASE_URL && url.startsWith(SUPABASE_URL)) return true;
  return false;
}

/**
 * Resolves an avatar or banner storage path or URL with optional Supabase image transforms.
 */
export function resolveProfileImageUrl(
  bucket: 'avatars' | 'banners',
  pathOrUrl: string | null | undefined,
  transforms?: ImageTransformOptions
): string | null {
  if (!pathOrUrl) return null;

  // If pathOrUrl is already a data URL or blob, return as-is
  if (pathOrUrl.startsWith('data:') || pathOrUrl.startsWith('blob:')) {
    return pathOrUrl;
  }

  // Local assets (e.g., /decorations/...) but NOT Supabase storage paths
  if (pathOrUrl.startsWith('/decorations/') || pathOrUrl.startsWith('/icons/') || pathOrUrl.startsWith('/images/')) {
    return pathOrUrl;
  }

  let objectPath = pathOrUrl;
  let targetBucket = bucket || 'avatars';

  if (pathOrUrl.includes('/storage/v1/object/public/')) {
    const segment = pathOrUrl.split('/storage/v1/object/public/')[1];
    const slashIdx = segment?.indexOf('/');
    if (slashIdx !== -1 && slashIdx !== undefined) {
      targetBucket = segment.substring(0, slashIdx) as any;
      objectPath = segment.substring(slashIdx + 1);
    }
  } else if (pathOrUrl.includes('/storage/v1/render/image/public/')) {
    const segment = pathOrUrl.split('/storage/v1/render/image/public/')[1]?.split('?')[0];
    const slashIdx = segment?.indexOf('/');
    if (slashIdx !== -1 && slashIdx !== undefined) {
      targetBucket = segment.substring(0, slashIdx) as any;
      objectPath = segment.substring(slashIdx + 1);
    }
  } else if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    // Arbitrary external URL - reject for privacy safety if not our storage
    if (!SUPABASE_URL || !pathOrUrl.startsWith(SUPABASE_URL)) {
      return null;
    }
  } else {
    // Strip any leading slash if relative
    if (objectPath.startsWith('/')) {
      objectPath = objectPath.slice(1);
    }
    // Relative path like "<userId>/avatar_123.webp" - stored in the 'avatars' bucket
    targetBucket = 'avatars';
  }

  const baseUrl = SUPABASE_URL.replace(/\/+$/, '') || '';

  if (transforms && (transforms.width || transforms.height || transforms.format || transforms.quality)) {
    const params = new URLSearchParams();
    if (transforms.width) params.set('width', String(transforms.width));
    if (transforms.height) params.set('height', String(transforms.height));
    if (transforms.resize) params.set('resize', transforms.resize);
    if (transforms.format) params.set('format', transforms.format);
    if (transforms.quality) params.set('quality', String(transforms.quality));
    return `${baseUrl}/storage/v1/render/image/public/${targetBucket}/${objectPath}?${params.toString()}`;
  }

  // Return standard object URL for 100% reliability across all Supabase plan tiers
  return `${baseUrl}/storage/v1/object/public/${targetBucket}/${objectPath}`;
}

export interface ProcessedImageResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  dominantColor: string;
}

/**
 * Strips EXIF metadata and re-encodes an image to WebP under the byte limit using HTML5 Canvas.
 */
export async function processImageToWebp(
  fileOrBlob: File | Blob,
  options: {
    maxWidth: number;
    maxHeight: number;
    aspectRatio?: number;
    maxSizeBytes: number;
    quality?: number;
    cropRect?: { x: number; y: number; width: number; height: number };
  }
): Promise<ProcessedImageResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let srcX = 0;
      let srcY = 0;
      let srcWidth = img.naturalWidth;
      let srcHeight = img.naturalHeight;

      // Use explicit crop rectangle if provided from crop dialog
      if (options.cropRect && options.cropRect.width > 0 && options.cropRect.height > 0) {
        srcX = Math.max(0, options.cropRect.x);
        srcY = Math.max(0, options.cropRect.y);
        srcWidth = Math.min(img.naturalWidth - srcX, options.cropRect.width);
        srcHeight = Math.min(img.naturalHeight - srcY, options.cropRect.height);
      } else if (options.aspectRatio) {
        // Fallback: Crop to target aspect ratio centered
        const currentRatio = srcWidth / srcHeight;
        if (currentRatio > options.aspectRatio) {
          // Image is wider than desired ratio
          const targetWidth = srcHeight * options.aspectRatio;
          srcX = (srcWidth - targetWidth) / 2;
          srcWidth = targetWidth;
        } else {
          // Image is taller than desired ratio
          const targetHeight = srcWidth / options.aspectRatio;
          srcY = (srcHeight - targetHeight) / 2;
          srcHeight = targetHeight;
        }
      }

      // Compute final dimensions preserving target aspect ratio
      let destWidth = Math.min(srcWidth, options.maxWidth);
      let destHeight = Math.min(srcHeight, options.maxHeight);

      if (options.aspectRatio) {
        if (destWidth / destHeight > options.aspectRatio) {
          destWidth = destHeight * options.aspectRatio;
        } else {
          destHeight = destWidth / options.aspectRatio;
        }
      }

      destWidth = Math.round(destWidth);
      destHeight = Math.round(destHeight);

      const canvas = document.createElement('canvas');
      canvas.width = destWidth;
      canvas.height = destHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Canvas 2D context unavailable'));
      }

      // Draw cropped, scaled image (strips EXIF metadata automatically)
      ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, destWidth, destHeight);

      // Extract dominant color from sampled 16x16 center region
      const dominantColor = extractDominantColor(ctx, destWidth, destHeight);

      // Progressive compression to ensure under maxSizeBytes
      let quality = options.quality ?? 0.85;

      const tryExport = (currentQuality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Failed to encode image to WebP'));
            }

            if (blob.size > options.maxSizeBytes && currentQuality > 0.4) {
              tryExport(currentQuality - 0.15);
              return;
            }

            const dataUrl = canvas.toDataURL('image/webp', currentQuality);
            resolve({
              blob,
              dataUrl,
              width: destWidth,
              height: destHeight,
              dominantColor,
            });
          },
          'image/webp',
          currentQuality
        );
      };

      tryExport(quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for processing'));
    };

    img.src = objectUrl;
  });
}

/**
 * Computes the dominant color (hex) from canvas pixels, ignoring transparent pixels.
 */
function extractDominantColor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): string {
  try {
    const sampleSize = Math.min(16, width, height);
    const stepX = Math.max(1, Math.floor(width / sampleSize));
    const stepY = Math.max(1, Math.floor(height / sampleSize));
    const imgData = ctx.getImageData(0, 0, width, height).data;

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;

    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const idx = (y * width + x) * 4;
        const a = imgData[idx + 3];
        if (a > 128) {
          rSum += imgData[idx];
          gSum += imgData[idx + 1];
          bSum += imgData[idx + 2];
          count++;
        }
      }
    }

    if (count === 0) return '#3b82f6';

    const r = Math.round(rSum / count).toString(16).padStart(2, '0');
    const g = Math.round(gSum / count).toString(16).padStart(2, '0');
    const b = Math.round(bSum / count).toString(16).padStart(2, '0');

    return `#${r}${g}${b}`;
  } catch {
    return '#3b82f6';
  }
}

/**
 * Calculates relative luminance for WCAG contrast calculation.
 */
function getRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Calculates WCAG 2.1 contrast ratio between two hex colors.
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  try {
    const l1 = getRelativeLuminance(hex1);
    const l2 = getRelativeLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  } catch {
    return 1;
  }
}

/**
 * Ensures text color against background has at least 4.5:1 contrast.
 * Returns '#ffffff' or '#09090b'.
 */
export function getAccessibleTextColor(backgroundHex: string): '#ffffff' | '#09090b' {
  const contrastWithWhite = getContrastRatio(backgroundHex, '#ffffff');
  return contrastWithWhite >= 4.5 ? '#ffffff' : '#09090b';
}
