'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface FloatingCallProps {
  localStream?: MediaStream | null;
  remotePeerName: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onEndCall: () => void;
}

export const FloatingCallController: React.FC<FloatingCallProps> = ({
  localStream = null,
  remotePeerName,
  isMuted,
  isCameraOff,
  isScreenSharing,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onEndCall,
}) => {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const supportsDocPiP = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  const togglePiP = async () => {
    if (pipWindow) {
      pipWindow.close();
      setPipWindow(null);
      return;
    }

    if (supportsDocPiP) {
      try {
        // @ts-expect-error Document Picture-in-Picture API
        const win: Window = await window.documentPictureInPicture.requestWindow({
          width: 380,
          height: 180,
        });

        // Copy all parent stylesheets and styles into the PiP window
        document.querySelectorAll('link[rel="stylesheet"], style').forEach((styleEl) => {
          win.document.head.appendChild(styleEl.cloneNode(true));
        });

        // Match current theme attributes
        const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const activeAccent = document.documentElement.getAttribute('data-accent') || 'indigo';
        win.document.documentElement.setAttribute('data-theme', activeTheme);
        win.document.documentElement.setAttribute('data-accent', activeAccent);

        // Body styling for the PiP window
        win.document.body.style.margin = '0';
        win.document.body.style.padding = '0';
        win.document.body.style.background = 'var(--bg-app, #0d0f12)';
        win.document.body.style.color = 'var(--text-primary, #f3f4f6)';
        win.document.body.style.fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
        win.document.body.style.overflow = 'hidden';

        win.addEventListener('pagehide', () => setPipWindow(null));
        setPipWindow(win);
      } catch (err) {
        console.warn('Failed to open Document PiP window, using desktop fallback:', err);
        fallbackToDesktopIPC();
      }
    } else {
      fallbackToDesktopIPC();
    }
  };

  const fallbackToDesktopIPC = () => {
    if (typeof window !== 'undefined' && '__TAURI__' in window) {
      // @ts-expect-error Tauri global
      window.__TAURI__.event.emit('open-floating-call-overlay', { remotePeerName });
    }
  };

  // Close PiP window when controller unmounts
  useEffect(() => {
    return () => {
      if (pipWindow) {
        pipWindow.close();
      }
    };
  }, [pipWindow]);

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
      <button
        onClick={togglePiP}
        className="px-3 py-2 text-xs font-semibold rounded-lg bg-[var(--bg-surface,#181d25)] hover:bg-[var(--bg-surface-hover,#222935)] border border-[var(--border-subtle,#242c38)] text-[var(--text-secondary,#9ca3af)] hover:text-[var(--text-primary,#f3f4f6)] shadow-lg transition-all flex items-center gap-1.5"
        title={pipWindow ? 'Dock Controls inside App' : 'Pop out floating window (Document PiP)'}
      >
        <span>{pipWindow ? 'Dock Controls ⬇' : 'Pop Out Controls ⧉'}</span>
      </button>

      {/* Render in primary window if PiP is closed */}
      {!pipWindow && (
        <CallHUD
          remotePeerName={remotePeerName}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          isScreenSharing={isScreenSharing}
          onToggleMic={onToggleMic}
          onToggleCamera={onToggleCamera}
          onToggleScreenShare={onToggleScreenShare}
          onEndCall={onEndCall}
        />
      )}

      {/* Render directly in Document PiP window body */}
      {pipWindow &&
        pipWindow.document?.body &&
        (pipWindow.document.body as unknown as { nodeType?: number }).nodeType === 1 &&
        createPortal(
          <div className="h-screen w-screen p-4 flex flex-col justify-between bg-[var(--bg-app,#0d0f12)] text-[var(--text-primary,#f3f4f6)] box-border select-none">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle,#242c38)] pb-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--success,#10b981)] animate-pulse" />
                <span className="text-xs font-bold tracking-wider uppercase text-[var(--text-muted,#6b7280)]">
                  Live Mesh Call
                </span>
              </div>
              <span className="text-xs font-mono font-medium text-[var(--accent,#6366f1)] truncate max-w-[140px]">
                {remotePeerName}
              </span>
            </div>

            <div className="flex items-center justify-center py-1">
              <CallHUD
                remotePeerName={remotePeerName}
                isMuted={isMuted}
                isCameraOff={isCameraOff}
                isScreenSharing={isScreenSharing}
                onToggleMic={onToggleMic}
                onToggleCamera={onToggleCamera}
                onToggleScreenShare={onToggleScreenShare}
                onEndCall={() => {
                  onEndCall();
                  pipWindow.close();
                }}
              />
            </div>

            <div className="text-[10px] text-center text-[var(--text-muted,#6b7280)] mt-1">
              PiP Call Control • Direct P2P Connected
            </div>
          </div>,
          pipWindow.document.body
        )}
    </div>
  );
};

export const CallHUD: React.FC<Omit<FloatingCallProps, 'localStream'>> = ({
  remotePeerName,
  isMuted,
  isCameraOff,
  isScreenSharing,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onEndCall,
}) => (
  <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[var(--bg-surface,#181d25)] border border-[var(--border-subtle,#242c38)] shadow-2xl backdrop-blur-md">
    <div className="flex flex-col pr-2 border-r border-[var(--border-subtle,#242c38)]">
      <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted,#6b7280)]">
        In Call
      </span>
      <span className="text-xs font-semibold text-[var(--text-primary,#f3f4f6)] truncate max-w-[100px]">
        {remotePeerName}
      </span>
    </div>

    {/* Mic Toggle */}
    <button
      onClick={onToggleMic}
      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
        isMuted
          ? 'bg-[var(--danger,#ef4444)] border-transparent text-white'
          : 'bg-[var(--bg-surface-hover,#222935)] border-[var(--border-subtle,#242c38)] hover:border-[var(--accent,#6366f1)] text-[var(--text-primary,#f3f4f6)]'
      }`}
      title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
      aria-label={isMuted ? 'Unmute Mic' : 'Mute Mic'}
    >
      {isMuted ? '🔇' : '🎙️'}
    </button>

    {/* Video Toggle */}
    <button
      onClick={onToggleCamera}
      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
        isCameraOff
          ? 'bg-[var(--danger,#ef4444)] border-transparent text-white'
          : 'bg-[var(--bg-surface-hover,#222935)] border-[var(--border-subtle,#242c38)] hover:border-[var(--accent,#6366f1)] text-[var(--text-primary,#f3f4f6)]'
      }`}
      title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
      aria-label={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
    >
      {isCameraOff ? '🚫' : '📹'}
    </button>

    {/* Screen Share */}
    <button
      onClick={onToggleScreenShare}
      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
        isScreenSharing
          ? 'bg-[var(--accent,#6366f1)] text-white border-transparent'
          : 'bg-[var(--bg-surface-hover,#222935)] border-[var(--border-subtle,#242c38)] text-[var(--text-primary,#f3f4f6)]'
      }`}
      title="Share Screen"
      aria-label="Share Screen"
    >
      💻
    </button>

    {/* Disconnect */}
    <button
      onClick={onEndCall}
      className="p-2.5 rounded-xl bg-[var(--danger,#ef4444)] hover:bg-[var(--danger-hover,#dc2626)] text-white shadow-md transition-all cursor-pointer"
      title="End Call"
      aria-label="End Call"
    >
      📞✕
    </button>
  </div>
);
