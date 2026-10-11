'use client';

import * as React from 'react';
import { Gamepad2, Plus, Compass, Sparkles } from 'lucide-react';
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

  const serverColors = [
    'from-indigo-600 to-purple-600',
    'from-emerald-600 to-teal-600',
    'from-rose-600 to-pink-600',
    'from-cyan-600 to-blue-600',
    'from-amber-600 to-orange-600',
  ];

  return (
    <aside className="w-[72px] h-full bg-surface-header/90 border-r border-border/80 flex flex-col items-center py-3 select-none shrink-0 z-30">
      {/* Home / Direct Messages Button */}
      <div className="relative group w-full flex items-center justify-center mb-2">
        {/* Left Indicator Pill */}
        <span
          className={cn(
            'absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200',
            activeServerId === null
              ? 'h-10 opacity-100'
              : hoveredId === 'home'
              ? 'h-5 opacity-70'
              : 'h-0 opacity-0'
          )}
        />

        <button
          onClick={() => onSelectServer(null)}
          onMouseEnter={() => setHoveredId('home')}
          onMouseLeave={() => setHoveredId(null)}
          className={cn(
            'w-12 h-12 rounded-3xl flex items-center justify-center font-bold transition-all duration-200 shadow-md group-hover:rounded-2xl group-hover:scale-105',
            activeServerId === null
              ? 'bg-primary text-primary-foreground rounded-2xl shadow-glow'
              : 'bg-surface-sidebar text-muted-foreground hover:bg-primary hover:text-primary-foreground'
          )}
          title="Direct Messages & Friends Hub"
          aria-label="Direct Messages"
        >
          <Gamepad2 className="w-6 h-6" />
        </button>
      </div>

      {/* Separator */}
      <div className="w-8 h-[2px] bg-border/80 rounded-full my-1.5" />

      {/* Server Icons List */}
      <div className="flex-1 w-full overflow-y-auto space-y-2 py-1 flex flex-col items-center scrollbar-none">
        {servers.map((server, index) => {
          const isActive = activeServerId === server.id;
          const isHovered = hoveredId === server.id;
          const colorGradient = serverColors[index % serverColors.length];
          const initials = getServerInitials(server.name);

          return (
            <div key={server.id} className="relative group w-full flex items-center justify-center">
              {/* Left Indicator Pill */}
              <span
                className={cn(
                  'absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200',
                  isActive
                    ? 'h-10 opacity-100'
                    : isHovered
                    ? 'h-5 opacity-70'
                    : 'h-0 opacity-0'
                )}
              />

              <button
                onClick={() => onSelectServer(server.id)}
                onMouseEnter={() => setHoveredId(server.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={cn(
                  'w-12 h-12 rounded-3xl flex items-center justify-center font-black text-xs text-white transition-all duration-200 shadow-sm group-hover:rounded-2xl group-hover:scale-105 bg-gradient-to-br',
                  colorGradient,
                  isActive && 'rounded-2xl ring-2 ring-primary shadow-glow-sm scale-105'
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
        <div className="relative group w-full flex items-center justify-center pt-1">
          <button
            onClick={onOpenCreateServer}
            className="w-12 h-12 rounded-3xl bg-surface-sidebar hover:bg-emerald-600 text-emerald-400 hover:text-white flex items-center justify-center transition-all duration-200 group-hover:rounded-2xl group-hover:scale-105 border border-dashed border-border/80 hover:border-transparent shadow-sm"
            title="Create a Gaming Server"
            aria-label="Create a Server"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom Explore / Guilds Button */}
      <div className="pt-2 border-t border-border/60 w-full flex flex-col items-center gap-2">
        <button
          onClick={() => onSelectServer(servers[0]?.id || null)}
          className="w-12 h-12 rounded-3xl bg-surface-sidebar hover:bg-surface-hover text-muted-foreground hover:text-foreground flex items-center justify-center transition-all duration-200 hover:rounded-2xl"
          title="Featured Gaming Communities"
          aria-label="Discover"
        >
          <Compass className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
}
