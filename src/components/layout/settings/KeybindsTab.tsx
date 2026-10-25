'use client';

import * as React from 'react';

export function KeybindsTab() {
  return (
    <div className="space-y-6 max-w-3xl w-full pb-16">
      <div>
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <span>Gaming Keybinds & Shortcuts</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-medium">
            Tactical Controls
          </span>
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Physical keyboard hotkeys for in-game squad communication and call controls.
        </p>
      </div>

      <div className="space-y-2">
        {[
          { action: 'Toggle Microphone Mute', key: 'M', desc: 'Mute / unmute your microphone stream' },
          { action: 'Toggle Deafen Audio', key: 'D', desc: 'Silence all incoming voices & audio' },
          { action: 'Toggle Camera Broadcast', key: 'V', desc: 'Turn video webcam on or off' },
          { action: 'Toggle Screen Share', key: 'S', desc: 'Start or end game display sharing' },
          { action: 'Close Modal / Drop Focus', key: 'Esc', desc: 'Dismiss active dialogue windows' },
          { action: 'Push to Talk (When Enabled)', key: 'Space', desc: 'Hold to speak in squad call' },
        ].map((item) => (
          <div
            key={item.action}
            className="flex items-center justify-between p-3 rounded-xl bg-surface-default border border-border"
          >
            <div>
              <div className="text-xs font-semibold text-foreground">{item.action}</div>
              <div className="text-xs text-muted-foreground/70">{item.desc}</div>
            </div>
            <kbd className="px-2.5 py-1 rounded-lg bg-black/60 border border-border shadow-inner font-mono text-xs font-bold text-white tracking-wider">
              {item.key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
