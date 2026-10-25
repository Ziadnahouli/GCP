import * as React from 'react';
import { Gamepad2 } from 'lucide-react';

export default function RootLoading() {
  return (
    <div className="h-dvh w-full flex flex-col items-center justify-center bg-background text-foreground space-y-4 select-none">
      <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary animate-pulse shadow-glow-sm">
        <Gamepad2 className="w-7 h-7" />
      </div>
      <div className="text-xs text-muted-foreground tracking-wide animate-pulse">
        Connecting to Nexus Network...
      </div>
    </div>
  );
}
