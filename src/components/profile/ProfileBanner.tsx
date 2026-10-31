'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { resolveProfileImageUrl } from '@/lib/images/profile-images';

interface ProfileBannerProps {
  bannerPath?: string | null;
  bannerUrl?: string | null;
  bannerColor?: string | null;
  accentColor?: string | null;
  className?: string;
  children?: React.ReactNode;
}

export const ProfileBanner: React.FC<ProfileBannerProps> = ({
  bannerPath,
  bannerUrl,
  bannerColor = '#3b82f6',
  accentColor,
  className,
  children,
}) => {
  const [imgError, setImgError] = React.useState(false);

  const rawPath = bannerPath || bannerUrl;
  const resolvedUrl = React.useMemo(() => {
    return resolveProfileImageUrl('avatars', rawPath, {
      width: 900,
      height: 300,
      resize: 'cover',
      format: 'webp',
    });
  }, [rawPath]);

  React.useEffect(() => {
    setImgError(false);
  }, [rawPath]);

  const backgroundStyle = React.useMemo(() => {
    if (accentColor && bannerColor) {
      return {
        background: `linear-gradient(135deg, ${bannerColor} 0%, ${accentColor} 100%)`,
      };
    }
    return {
      backgroundColor: bannerColor || '#3b82f6',
    };
  }, [bannerColor, accentColor]);

  return (
    <div
      className={cn('relative w-full h-28 sm:h-32 overflow-hidden transition-colors', className)}
      style={backgroundStyle}
    >
      {resolvedUrl && !imgError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover select-none"
          onError={() => setImgError(true)}
        />
      )}

      {/* Subtle bottom shadow overlay for smooth transition into card body */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

      {children}
    </div>
  );
};

