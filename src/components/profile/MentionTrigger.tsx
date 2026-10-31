'use client';

import * as React from 'react';
import { ProfileCardTrigger } from './ProfileCardTrigger';
import { fetchUserIdByUsername } from '@/lib/profiles/profile-store';
import { cn } from '@/lib/utils';

interface MentionTriggerProps {
  username: string;
  className?: string;
}

export const MentionTrigger: React.FC<MentionTriggerProps> = ({
  username,
  className,
}) => {
  const [resolvedUserId, setResolvedUserId] = React.useState<string | null>(null);

  const handlePointerEnter = async () => {
    if (!resolvedUserId) {
      const uid = await fetchUserIdByUsername(username);
      if (uid) setResolvedUserId(uid);
    }
  };

  const cleanHandle = username.startsWith('@') ? username : `@${username}`;

  return (
    <ProfileCardTrigger userId={resolvedUserId}>
      <span
        onPointerEnter={handlePointerEnter}
        onFocus={handlePointerEnter}
        className={cn(
          'inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-semibold mx-0.5 select-none transition-colors bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 cursor-pointer',
          className
        )}
      >
        {cleanHandle}
      </span>
    </ProfileCardTrigger>
  );
};

