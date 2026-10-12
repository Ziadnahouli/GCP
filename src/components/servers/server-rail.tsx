'use client';

import * as React from 'react';
import { Gamepad2, Plus, Compass } from 'lucide-react';
import { Server } from '@/lib/types/server';
import { cn } from '@/lib/utils';

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
    <aside className="w-[68px] h-full bg-surface-sidebar border-r border-white/[0.06] flex flex-col items-center py-2.5 select-none shrink-0 z-30">
      {/* Home / Direct Messages Button */}
      <div className="relative group w-full flex items-center justify-center mb-1.5">
        {/* Left Indicator Bar */}
        <span
          className={cn(
            'absolute left-0 w-0.5 bg-primary rounded-r transition-all duration-200',
            activeServerId === null
              ? 'h-7 opacity-100'
              : hoveredId === 'home'
              ? 'h-4 opacity-70'
              : 'h-0 opacity-0'
          )}
        />

        <button
          onClick={() => onSelectServer(null)}
          onMouseEnter={() => setHoveredId('home')}
          onMouseLeave={() => setHoveredId(null)}
          className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-150',
            activeServerId === null
              ? 'bg-primary text-primary-foreground shadow-subtle'
              : 'bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground'
          )}
          title="Direct Messages & Friends Hub"
          aria-label="Direct Messages"
        >
          <Gamepad2 className="w-5 h-5" />
        </button>
      </div>

      {/* Subtle Separator */}
      <div className="w-6 h-px bg-white/[0.08] my-1" />

      {/* Server Icons List */}
      <div className="flex-1 w-full overflow-y-auto space-y-1.5 py-1 flex flex-col items-center no-scrollbar">
        {servers.map((server) => {
          const isActive = activeServerId === server.id;
          const isHovered = hoveredId === server.id;
          const initials = getServerInitials(server.name);

          return (
            <div key={server.id} className="relative group w-full flex items-center justify-center">
              {/* Left Indicator Bar */}
              <span
                className={cn(
                  'absolute left-0 w-0.5 bg-primary rounded-r transition-all duration-200',
                  isActive
                    ? 'h-7 opacity-100'
                    : isHovered
                    ? 'h-4 opacity-70'
                    : 'h-0 opacity-0'
                )}
              />

              <button
                onClick={() => onSelectServer(server.id)}
                onMouseEnter={() => setHoveredId(server.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={cn(
                  'w-11 h-11 rounded-xl flex items-center justify-center font-bold text-xs tracking-wider transition-all duration-150 border',
                  isActive
                    ? 'bg-surface-panel text-foreground border-primary/50 shadow-subtle'
                    : 'bg-surface-default/70 border-white/[0.06] text-muted-foreground hover:bg-surface-hover hover:text-foreground hover:border-white/[0.12]'
                )}
                title={server.name}
                aria-label={server.name}
              >
                {initials}
              </button>
            </div>
          );
        })}

        {/* Add Server Button (+) */}
        <div className="relative group w-full flex items-center justify-center pt-0.5">
          <button
            onClick={onOpenCreateServer}
            className="w-11 h-11 rounded-xl bg-white/[0.02] border border-dashed border-white/[0.10] text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/[0.06] flex items-center justify-center transition-all duration-150"
            title="Create a Gaming Server"
            aria-label="Create a Server"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Explore / Guilds Button */}
      <div className="pt-2 border-t border-white/[0.06] w-full flex flex-col items-center">
        <button
          onClick={() => onSelectServer(servers[0]?.id || null)}
          className="w-11 h-11 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.04] flex items-center justify-center transition-colors"
          title="Featured Gaming Communities"
          aria-label="Discover"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
