// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  isAllowedStorageUrl,
  resolveProfileImageUrl,
  getContrastRatio,
  getAccessibleTextColor,
} from '@/lib/images/profile-images';

describe('Profile Image Resolution & Contrast Guard Pipeline', () => {
  it('allows safe storage paths and rejects 3rd party external URLs for anti-tracking privacy', () => {
    // 3rd party tracking pixel / external url
    expect(isAllowedStorageUrl('https://evil-tracker.example.com/pixel.png')).toBe(false);
    expect(resolveProfileImageUrl('avatars', 'https://evil-tracker.example.com/pixel.png')).toBeNull();

    // Data url allowed for local preview
    expect(isAllowedStorageUrl('data:image/webp;base64,AAAA')).toBe(true);
    expect(resolveProfileImageUrl('avatars', 'data:image/webp;base64,AAAA')).toBe('data:image/webp;base64,AAAA');

    // Local static asset
    expect(isAllowedStorageUrl('/decorations/neon_ring.png')).toBe(true);
    expect(resolveProfileImageUrl('avatars', '/decorations/neon_ring.png')).toBe('/decorations/neon_ring.png');
  });

  it('builds Supabase transformed image URL with size constraints', () => {
    const relativePath = 'user-uuid/avatar-uuid.webp';
    const transformed = resolveProfileImageUrl('avatars', relativePath, {
      width: 128,
      height: 128,
      resize: 'cover',
      format: 'webp',
    });

    expect(transformed).toBeDefined();
    expect(transformed).toContain('width=128');
    expect(transformed).toContain('height=128');
    expect(transformed).toContain('format=webp');
  });

  it('calculates WCAG 2.1 contrast ratios and provides accessible text color', () => {
    // Black and White: 21:1 ratio
    const bwRatio = getContrastRatio('#000000', '#ffffff');
    expect(bwRatio).toBeGreaterThan(20);

    // Dark background should yield white text (#ffffff)
    expect(getAccessibleTextColor('#1e1b4b')).toBe('#ffffff');

    // Bright yellow/white background should yield dark text (#09090b)
    expect(getAccessibleTextColor('#fef08a')).toBe('#09090b');
  });
});

