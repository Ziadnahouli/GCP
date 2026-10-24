import { describe, it, expect, vi } from 'vitest';
import {
  tuneTrackForSpeech,
  tuneOpusSdp,
  tuneAudioSender,
} from '@/lib/webrtc/opus-transport-tuning';

describe('Q6 — Opus Transport & WebRTC Parameter Tuning', () => {
  it('applies speech contentHint to audio MediaStreamTrack', () => {
    const track = {
      kind: 'audio',
      contentHint: '',
    } as unknown as MediaStreamTrack;

    tuneTrackForSpeech(track);
    expect((track as any).contentHint).toBe('speech');
  });

  it('munges SDP to enforce Opus speech bitrate, FEC, mono, and 20ms ptime', () => {
    const rawSdp = [
      'v=0',
      'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
      's=-',
      't=0 0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
      'c=IN IP4 0.0.0.0',
      'a=rtpmap:111 opus/48000/2',
      'a=fmtp:111 minptime=10;useinbandfec=0',
    ].join('\r\n');

    const tuned = tuneOpusSdp(rawSdp, {
      maxBitrate: 64000,
      useInbandFec: true,
      stereo: false,
      ptime: 20,
    });

    expect(tuned).toContain('a=fmtp:111');
    expect(tuned).toContain('useinbandfec=1');
    expect(tuned).toContain('stereo=0');
    expect(tuned).toContain('maxaveragebitrate=64000');
    expect(tuned).toContain('a=ptime:20');
  });

  it('configures RTCRtpSender encoding parameters with 64kbps maxBitrate', async () => {
    const mockTrack = { kind: 'audio', contentHint: '' } as unknown as MediaStreamTrack;
    const mockSender = {
      track: mockTrack,
      getParameters: vi.fn().mockReturnValue({
        encodings: [{ maxBitrate: 32000 }],
      }),
      setParameters: vi.fn().mockResolvedValue(undefined),
    } as unknown as RTCRtpSender;

    await tuneAudioSender(mockSender, { maxBitrate: 64000 });

    expect((mockTrack as any).contentHint).toBe('speech');
    expect(mockSender.getParameters).toHaveBeenCalled();
    expect(mockSender.setParameters).toHaveBeenCalledWith({
      encodings: [
        {
          maxBitrate: 64000,
          networkPriority: 'high',
          priority: 'high',
        },
      ],
    });
  });
});
