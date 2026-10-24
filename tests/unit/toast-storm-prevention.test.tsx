import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '@/components/ui/toast';
import {
  updateAudioEngineDiagnostics,
  getAudioEngineDiagnostics,
} from '@/lib/webrtc/audio-processing-policy';

function TestTriggerComponent({
  triggerCount = 1,
  duplicate = false,
}: {
  triggerCount?: number;
  duplicate?: boolean;
}) {
  const { toast } = useToast();

  return (
    <div>
      <button
        onClick={() => {
          for (let i = 0; i < triggerCount; i++) {
            toast({
              title: duplicate ? 'Same Title' : `Toast Title ${i}`,
              description: duplicate ? 'Same Description' : `Description ${i}`,
              duration: 5000,
            });
          }
        }}
      >
        Fire Toasts
      </button>
    </div>
  );
}

describe('Side Notifications & Toast Storm Prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enforces MAX_TOASTS cap (max 3 visible toasts) to prevent filling the screen', () => {
    render(
      <ToastProvider>
        <TestTriggerComponent triggerCount={10} duplicate={false} />
      </ToastProvider>
    );

    const button = screen.getByText('Fire Toasts');
    act(() => {
      fireEvent.click(button);
    });

    const notificationsRegion = screen.getByRole('region', { name: /notifications/i });
    // Should have exactly 3 children rendered, dropping older toasts
    expect(notificationsRegion.children.length).toBe(3);

    // Oldest toasts (0-6) should have been pruned, leaving 7, 8, 9
    expect(screen.queryByText('Toast Title 0')).toBeNull();
    expect(screen.queryByText('Toast Title 6')).toBeNull();
    expect(screen.getByText('Toast Title 7')).toBeDefined();
    expect(screen.getByText('Toast Title 8')).toBeDefined();
    expect(screen.getByText('Toast Title 9')).toBeDefined();
  });

  it('deduplicates identical rapid toasts to prevent stacking spam', () => {
    render(
      <ToastProvider>
        <TestTriggerComponent triggerCount={5} duplicate={true} />
      </ToastProvider>
    );

    const button = screen.getByText('Fire Toasts');
    act(() => {
      fireEvent.click(button);
    });

    const notificationsRegion = screen.getByRole('region', { name: /notifications/i });
    // Since all 5 are identical, exactly 1 should be rendered
    expect(notificationsRegion.children.length).toBe(1);
    expect(screen.getByText('Same Title')).toBeDefined();
  });

  it('updateAudioEngineDiagnostics does NOT dispatch gcp_noise_mode_changed when mode is omitted or unchanged', () => {
    const eventSpy = vi.fn();
    window.addEventListener('gcp_noise_mode_changed', eventSpy);

    // Telemetry updates (e.g. latency, underruns every 250ms) do not change mode
    updateAudioEngineDiagnostics({
      latencyMs: 28.67,
      underruns: 0,
    });
    expect(eventSpy).not.toHaveBeenCalled();

    // Passing the same mode again does not fire
    const currentMode = getAudioEngineDiagnostics().mode;
    updateAudioEngineDiagnostics({
      mode: currentMode,
    });
    expect(eventSpy).not.toHaveBeenCalled();

    // Changing to a different mode DOES dispatch
    const nextMode = currentMode === 'strong' ? 'balanced' : 'strong';
    updateAudioEngineDiagnostics({
      mode: nextMode,
    });
    expect(eventSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener('gcp_noise_mode_changed', eventSpy);
  });
});
