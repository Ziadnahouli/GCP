import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import * as React from 'react';
import { FloatingCallController } from '@/components/call/FloatingCallController';

describe('FloatingCallController - Document Picture-in-Picture & Floating HUD', () => {
  const onToggleMic = vi.fn();
  const onToggleCamera = vi.fn();
  const onToggleScreenShare = vi.fn();
  const onEndCall = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (window as any).documentPictureInPicture;
    delete (window as any).__TAURI__;
  });

  it('renders docked CallHUD in primary window by default', () => {
    render(
      <FloatingCallController
        remotePeerName="Veloq Squad Captain"
        isMuted={false}
        isCameraOff={true}
        isScreenSharing={false}
        onToggleMic={onToggleMic}
        onToggleCamera={onToggleCamera}
        onToggleScreenShare={onToggleScreenShare}
        onEndCall={onEndCall}
      />
    );

    expect(screen.getByText('Veloq Squad Captain')).toBeDefined();
    expect(screen.getByText(/Pop Out Controls/i)).toBeDefined();

    // Verify CallHUD buttons
    const muteBtn = screen.getByTitle('Mute Mic');
    fireEvent.click(muteBtn);
    expect(onToggleMic).toHaveBeenCalledTimes(1);

    const camBtn = screen.getByTitle('Turn Camera On');
    fireEvent.click(camBtn);
    expect(onToggleCamera).toHaveBeenCalledTimes(1);

    const screenBtn = screen.getByTitle('Share Screen');
    fireEvent.click(screenBtn);
    expect(onToggleScreenShare).toHaveBeenCalledTimes(1);

    const endBtn = screen.getByTitle('End Call');
    fireEvent.click(endBtn);
    expect(onEndCall).toHaveBeenCalledTimes(1);
  });

  it('initiates Document PiP requestWindow when supported', async () => {
    const mockBody = document.createElement('div');
    const mockHead = document.createElement('head');

    const mockWin = {
      document: {
        head: mockHead,
        body: mockBody,
        documentElement: { setAttribute: vi.fn() },
      },
      addEventListener: vi.fn(),
      close: vi.fn(),
    };

    const requestWindowMock = vi.fn().mockResolvedValue(mockWin);

    (window as any).documentPictureInPicture = {
      requestWindow: requestWindowMock,
    };

    render(
      <FloatingCallController
        remotePeerName="Commander"
        isMuted={false}
        isCameraOff={false}
        isScreenSharing={false}
        onToggleMic={onToggleMic}
        onToggleCamera={onToggleCamera}
        onToggleScreenShare={onToggleScreenShare}
        onEndCall={onEndCall}
      />
    );

    const popOutBtn = screen.getByText(/Pop Out Controls/i);
    await act(async () => {
      fireEvent.click(popOutBtn);
    });

    expect(requestWindowMock).toHaveBeenCalledWith({
      width: 380,
      height: 180,
    });
  });

  it('falls back to Tauri IPC when Document PiP is unavailable', () => {
    const emitMock = vi.fn();
    (window as any).__TAURI__ = {
      event: { emit: emitMock },
    };

    render(
      <FloatingCallController
        remotePeerName="Alpha Leader"
        isMuted={false}
        isCameraOff={false}
        isScreenSharing={false}
        onToggleMic={onToggleMic}
        onToggleCamera={onToggleCamera}
        onToggleScreenShare={onToggleScreenShare}
        onEndCall={onEndCall}
      />
    );

    const popOutBtn = screen.getByText(/Pop Out Controls/i);
    fireEvent.click(popOutBtn);

    expect(emitMock).toHaveBeenCalledWith('open-floating-call-overlay', {
      remotePeerName: 'Alpha Leader',
    });
  });
});
