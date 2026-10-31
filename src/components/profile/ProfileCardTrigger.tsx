'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

// Lazy-load ProfileCard for optimal bundle and render performance
const ProfileCard = dynamic(
  () => import('./ProfileCard').then((mod) => mod.ProfileCard),
  { ssr: false }
);

export interface ProfileCardTriggerProps {
  userId?: string | null;
  serverId?: string | null;
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  disabled?: boolean;
}

export const ProfileCardTrigger: React.FC<ProfileCardTriggerProps> = ({
  userId,
  serverId,
  children,
  className,
  side = 'right',
  align = 'start',
  sideOffset = 8,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!userId || disabled) {
    return <>{children}</>;
  }

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className={cn('inline-flex text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md select-none', className)}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
          >
            {children}
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="p-0 border-t border-border rounded-t-3xl max-h-[90vh] overflow-y-auto bg-card">
          {isOpen && (
            <ProfileCard
              userId={userId}
              serverId={serverId}
              onClose={() => setIsOpen(false)}
              className="w-full border-none shadow-none rounded-none"
            />
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('inline-flex text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md select-none', className)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        className="p-0 border-none bg-transparent shadow-none w-auto outline-none"
      >
        {isOpen && (
          <ProfileCard
            userId={userId}
            serverId={serverId}
            onClose={() => setIsOpen(false)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};

