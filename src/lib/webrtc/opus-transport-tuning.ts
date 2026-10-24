/**
 * GCP Opus Audio Transport & WebRTC Parameter Tuning (Q6)
 *
 * Configures optimal encoder parameters for real-time speech:
 * - track.contentHint = 'speech'
 * - Opus inband FEC enabled (packet loss protection)
 * - Mono speech encoding (stereo=0)
 * - Optimal speech bitrate (64 kbps target)
 * - 20 ms frame packetization (ptime=20, minptime=10)
 */

export interface OpusTuningOptions {
  maxBitrate?: number;     // e.g. 64000 bps
  useInbandFec?: boolean;  // FEC for packet loss concealment
  useDtx?: boolean;        // Discontinuous transmission
  stereo?: boolean;        // false for mono voice
  ptime?: number;          // 20 ms standard
  minptime?: number;       // 10 ms
}

export const DEFAULT_OPUS_TUNING: OpusTuningOptions = {
  maxBitrate: 64000,
  useInbandFec: true,
  useDtx: false, // False by default so comfort expander floor (-36dB) remains smooth
  stereo: false,
  ptime: 20,
  minptime: 10,
};

/**
 * Optimizes an audio MediaStreamTrack for speech transmission.
 */
export function tuneTrackForSpeech(track: MediaStreamTrack | null | undefined): void {
  if (!track || track.kind !== 'audio') return;
  try {
    if ('contentHint' in track) {
      (track as any).contentHint = 'speech';
    }
  } catch (err) {
    console.warn('[OpusTuning] Failed to set track.contentHint:', err);
  }
}

/**
 * Optimizes an RTCRtpSender encoding parameters for low-latency voice.
 */
export async function tuneAudioSender(
  sender: RTCRtpSender,
  options: OpusTuningOptions = DEFAULT_OPUS_TUNING
): Promise<void> {
  if (!sender || !sender.track || sender.track.kind !== 'audio') return;

  tuneTrackForSpeech(sender.track);

  try {
    if (typeof sender.getParameters === 'function' && typeof sender.setParameters === 'function') {
      const params = sender.getParameters();
      if (params && params.encodings && params.encodings.length > 0) {
        params.encodings[0].maxBitrate = options.maxBitrate ?? 64000;
        (params.encodings[0] as any).networkPriority = 'high';
        (params.encodings[0] as any).priority = 'high';
        await sender.setParameters(params);
      }
    }
  } catch (err) {
    // Some browsers reject setParameters before connection is established
    console.debug('[OpusTuning] sender.setParameters note:', err);
  }
}

/**
 * Munges an SDP offer or answer to guarantee Opus speech profile parameters.
 */
export function tuneOpusSdp(
  sdp: string,
  options: OpusTuningOptions = DEFAULT_OPUS_TUNING
): string {
  if (!sdp || !sdp.includes('opus/48000')) {
    return sdp;
  }

  const lines = sdp.split('\r\n');
  const opusPtMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  if (!opusPtMatch) return sdp;

  const opusPt = opusPtMatch[1];
  const fmtpPrefix = `a=fmtp:${opusPt} `;

  const maxBitrate = options.maxBitrate ?? 64000;
  const useFec = options.useInbandFec !== false ? 1 : 0;
  const stereo = options.stereo ? 1 : 0;
  const dtx = options.useDtx ? 1 : 0;
  const ptime = options.ptime ?? 20;
  const minptime = options.minptime ?? 10;

  const tuningParams = [
    `minptime=${minptime}`,
    `useinbandfec=${useFec}`,
    `stereo=${stereo}`,
    `sprop-stereo=${stereo}`,
    `maxaveragebitrate=${maxBitrate}`,
    `cbr=0`,
  ];
  if (options.useDtx) {
    tuningParams.push(`usedtx=${dtx}`);
  }

  let fmtpFound = false;
  const modifiedLines = lines.map((line) => {
    if (line.startsWith(fmtpPrefix)) {
      fmtpFound = true;
      const existingParams = line.substring(fmtpPrefix.length).split(';');
      const mergedMap = new Map<string, string>();

      existingParams.forEach((p) => {
        const [k, v] = p.trim().split('=');
        if (k) mergedMap.set(k.trim(), v ? v.trim() : '');
      });

      tuningParams.forEach((p) => {
        const [k, v] = p.split('=');
        mergedMap.set(k, v);
      });

      const mergedStr = Array.from(mergedMap.entries())
        .map(([k, v]) => (v ? `${k}=${v}` : k))
        .join(';');
      return `${fmtpPrefix}${mergedStr}`;
    }
    return line;
  });

  if (!fmtpFound) {
    // Add fmtp line directly after rtpmap line
    const rtpmapIdx = modifiedLines.findIndex((l) => l.startsWith(`a=rtpmap:${opusPt} `));
    if (rtpmapIdx !== -1) {
      modifiedLines.splice(rtpmapIdx + 1, 0, `${fmtpPrefix}${tuningParams.join(';')}`);
    }
  }

  // Ensure ptime line is set
  const ptimeIdx = modifiedLines.findIndex((l) => l.startsWith('a=ptime:'));
  if (ptimeIdx !== -1) {
    modifiedLines[ptimeIdx] = `a=ptime:${ptime}`;
  } else {
    const audioMidIdx = modifiedLines.findIndex((l) => l.startsWith('m=audio '));
    if (audioMidIdx !== -1) {
      modifiedLines.splice(audioMidIdx + 1, 0, `a=ptime:${ptime}`);
    }
  }

  return modifiedLines.join('\r\n');
}

/**
 * Diagnostics helper: reads WebRTC stats to verify audio packet loss concealment and quality
 */
export async function getAudioTransportDiagnostics(pc: RTCPeerConnection): Promise<{
  audioLevel?: number;
  jitterSeconds?: number;
  packetsLost?: number;
  concealedSamples?: number;
  totalSamplesReceived?: number;
}> {
  if (!pc || typeof pc.getStats !== 'function') return {};

  try {
    const stats = await pc.getStats();
    let audioLevel: number | undefined;
    let jitterSeconds: number | undefined;
    let packetsLost: number | undefined;
    let concealedSamples: number | undefined;
    let totalSamplesReceived: number | undefined;

    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.kind === 'audio') {
        jitterSeconds = report.jitter;
        packetsLost = report.packetsLost;
        concealedSamples = report.concealedSamples;
        totalSamplesReceived = report.totalSamplesReceived;
      }
      if (report.type === 'media-source' && report.kind === 'audio') {
        audioLevel = report.audioLevel;
      }
    });

    return {
      audioLevel,
      jitterSeconds,
      packetsLost,
      concealedSamples,
      totalSamplesReceived,
    };
  } catch {
    return {};
  }
}
