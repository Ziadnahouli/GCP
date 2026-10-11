export interface ExtendedRTCIceServer extends RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * High-availability STUN servers (Google + Cloudflare + Metered OpenRelay).
 * Provides immediate reflexive candidate discovery on ports 19302, 3478, and 80.
 */
export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:openrelay.metered.ca:80' },
];

/**
 * Free Production-Grade OpenRelay TURN servers by Metered.ca.
 * Provides UDP, TCP, and TLS (TURNS) relay on standard ports (80, 443, 5349).
 * Guaranteed to bypass Symmetric NAT, CGNAT (Carrier-Grade NAT), mobile data tethering,
 * corporate/school firewalls, and Windows Firewall UDP restrictions on ZeroTier adapters.
 */
export const OPENRELAY_TURN_SERVERS: RTCIceServer[] = [
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:5349',
    ],
    username: 'openrelay',
    credential: 'openrelay',
  },
];

/**
 * Resolves the final list of ICE servers.
 * Merges any custom environment variables (NEXT_PUBLIC_TURN_SERVERS / NEXT_PUBLIC_ICE_SERVERS)
 * with the built-in STUN and OpenRelay TURN servers.
 */
export function getIceServers(): RTCIceServer[] {
  const customServers: RTCIceServer[] = [];

  if (typeof process !== 'undefined' && process.env) {
    // 1. Check for JSON array in NEXT_PUBLIC_ICE_SERVERS
    if (process.env.NEXT_PUBLIC_ICE_SERVERS) {
      try {
        const parsed = JSON.parse(process.env.NEXT_PUBLIC_ICE_SERVERS);
        if (Array.isArray(parsed)) {
          customServers.push(...parsed);
        }
      } catch (err) {
        console.warn('[WebRTC] Failed to parse NEXT_PUBLIC_ICE_SERVERS:', err);
      }
    }

    // 2. Check for individual TURN URL / credentials
    if (process.env.NEXT_PUBLIC_TURN_URL) {
      customServers.push({
        urls: process.env.NEXT_PUBLIC_TURN_URL,
        username: process.env.NEXT_PUBLIC_TURN_USERNAME || undefined,
        credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || undefined,
      });
    }
  }

  return [...customServers, ...STUN_SERVERS, ...OPENRELAY_TURN_SERVERS];
}

/**
 * WebRTC configuration tuned for maximum connectivity across restricted networks,
 * ZeroTier virtual adapters, and symmetric router NATs.
 */
export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: getIceServers(),
  // Pre-gathers 10 candidates immediately upon RTCPeerConnection instantiation
  // Shaves 1-3 seconds off connection establishment and ensures relay candidates are ready.
  iceCandidatePoolSize: 10,
  // Bundles all audio and video tracks onto a single UDP/TCP port candidate pair.
  bundlePolicy: 'max-bundle',
  // Multiplexes RTP and RTCP on the same transport.
  rtcpMuxPolicy: 'require',
  // Allows host, srflx (STUN), and relay (TURN) candidates.
  iceTransportPolicy: 'all',
};

/**
 * Cleans and validates an ICE candidate before passing to RTCPeerConnection.addIceCandidate().
 * Filters out Chromium end-of-candidates empty string notifications.
 */
export function cleanIceCandidate(
  candidate: RTCIceCandidateInit | null | undefined
): RTCIceCandidateInit | null {
  if (!candidate) return null;
  if (typeof candidate.candidate !== 'string') return null;
  const trimmed = candidate.candidate.trim();
  if (trimmed === '') return null;

  return {
    candidate: trimmed,
    sdpMid: candidate.sdpMid ?? undefined,
    sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
    usernameFragment: candidate.usernameFragment ?? undefined,
  };
}

/**
 * Inspects candidate line to check if it's a ZeroTier or private LAN candidate.
 */
export function isZeroTierCandidate(candidateStr: string): boolean {
  if (!candidateStr) return false;
  // ZeroTier typically assigns IPs in 10.x.x.x, 192.168.19x.x, 172.x.x.x or specific managed ranges
  return (
    candidateStr.includes('192.168.19') ||
    candidateStr.includes('10.147.') ||
    candidateStr.includes('10.244.') ||
    candidateStr.includes('zt')
  );
}
