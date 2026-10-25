'use client';

import * as React from 'react';
import { Gamepad2, Plus, Compass } from 'lucide-react';
import { Server } from '@/lib/types/server';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ServerRailProps {
  servers: Server[];
  activeServerId: string | null;
  onSelectServer: (serverId: string | null) => void;
  onOpenCreateServer: () => void;
}

export function ServerRail({
  servers,
  activeServerId,
  onSelectServer,
  onOpenCreateServer,
}: ServerRailProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const getServerInitials = (name: string) => {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 3)
      .toUpperCase();
  };

  return (
    <TooltipProvider delayDuration={300}>
      <aside className="w-14 h-full bg-surface-rail flex flex-col items-center py-2.5 select-none shrink-0">
        {/* Home / Direct Messages Button */}
        <div className="relative group w-full flex items-center justify-center mb-1.5">
          {/* Active Accent Left Indicator */}
          <span
            className={cn(
              'absolute left-0 w-1 bg-primary rounded-r transition-all duration-200',
              activeServerId === null
                ? 'h-8 opacity-100'
                : hoveredId === 'home'
                ? 'h-4 opacity-70'
                : 'h-0 opacity-0'
            )}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onSelectServer(null)}
                onMouseEnter={() => setHoveredId('home')}
                onMouseLeave={() => setHoveredId(null)}
                className={cn(
                  'w-9 h-9 rounded-[10px] flex items-center justify-center transition-all duration-150',
                  activeServerId === null
                    ? 'bg-primary text-primary-foreground shadow-subtle'
                    : 'bg-surface-hover text-muted-foreground hover:bg-surface-active hover:text-foreground'
                )}
                aria-label="Direct messages and friends"
              >
                <Gamepad2 className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Direct messages & friends
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Hairline Separator */}
        <div className="w-6 h-px bg-border my-1" />

        {/* Server Icons List */}
        <div className="flex-1 w-full overflow-y-auto space-y-2 py-1 flex flex-col items-center no-scrollbar">
          {servers.map((server) => {
            const isActive = activeServerId === server.id;
            const isHovered = hoveredId === server.id;
            const initials = getServerInitials(server.name);

            return (
              <div key={server.id} className="relative group w-full flex items-center justify-center">
                {/* Active Accent Left Indicator */}
                <span
                  className={cn(
                    'absolute left-0 w-1 bg-primary rounded-r transition-all duration-200',
                    isActive
                      ? 'h-8 opacity-100'
                      : isHovered
                      ? 'h-4 opacity-70'
                      : 'h-0 opacity-0'
                  )}
                />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSelectServer(server.id)}
                      onMouseEnter={() => setHoveredId(server.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={cn(
                        'w-9 h-9 rounded-[10px] flex items-center justify-center font-semibold text-xs tracking-wide transition-all duration-150 border',
                        isActive
                          ? 'bg-card text-foreground border-primary shadow-subtle'
                          : 'bg-surface-hover border-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground'
                      )}
                      aria-label={server.name}
                    >
                      {initials}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {server.name}
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}

          {/* Add Server Button (+) */}
          <div className="relative group w-full flex items-center justify-center pt-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onOpenCreateServer}
                  className="w-9 h-9 rounded-[10px] bg-surface-hover border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary-subtle flex items-center justify-center transition-all duration-150"
                  aria-label="Create a server"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Create a server
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Bottom Explore / Guilds Button */}
        <div className="pt-2 border-t border-border w-full flex flex-col items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onSelectServer(servers[0]?.id || null)}
                className="w-9 h-9 rounded-[10px] text-muted-foreground hover:text-foreground hover:bg-surface-hover flex items-center justify-center transition-colors"
                aria-label="Featured communities"
              >
                <Compass className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Discover servers
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
