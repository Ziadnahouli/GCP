import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { realtimeHub } from '@/lib/realtime/realtime-hub';
import { audioSessionCoordinator } from '@/lib/webrtc/audio-session-coordinator';

afterEach(() => {
  realtimeHub.clear();
  audioSessionCoordinator.reset();
});
