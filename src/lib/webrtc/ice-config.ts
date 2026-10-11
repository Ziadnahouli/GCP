export interface ExtendedRTCIceServer extends RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Verified High-Availability STUN servers (Google + Cloudflare + Nextcloud 443 + Freeswitch).
 * Provides immediate reflexive candidate discovery on ports 19302, 3478, and 443 (firewall-penetrating).
 */
export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.nextcloud.com:443' },
  { urls: 'stun:stun.freeswitch.org:3478' },
  { urls: 'stun:stun.1und1.de:3478' },
  { urls: 'stun:stun.gmx.net:3478' },
];

/**
 * Production-Grade OpenRelay TURN servers by Metered.ca.
 * Provides UDP, TCP, and TLS (TURNS) relay on standard ports (80, 443, 5349).
 * Guaranteed fallback to bypass Symmetric NAT, CGNAT, and corporate firewalls.
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
 * with the verified STUN and TURN servers.
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
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
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
  return (
    candidateStr.includes('192.168.19') ||
    candidateStr.includes('10.147.') ||
    candidateStr.includes('10.244.') ||
    candidateStr.includes('zt')
  );
}

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * Retrieves the local user's saved ZeroTier Virtual LAN IP from localStorage.
 */
export function getLocalZeroTierIp(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = localStorage.getItem('nexus_zerotier_ip');
    if (!val) return null;
    const trimmed = val.trim();
    return IPV4_REGEX.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Persists the local user's ZeroTier Virtual LAN IP to localStorage.
 */
export function setLocalZeroTierIp(ip: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = ip.trim();
    if (IPV4_REGEX.test(trimmed)) {
      localStorage.setItem('nexus_zerotier_ip', trimmed);
    }
  } catch {}
}

/**
 * Retrieves the peer squadmate's ZeroTier Virtual LAN IP from localStorage.
 */
export function getPeerZeroTierIp(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = localStorage.getItem('nexus_peer_zerotier_ip');
    if (!val) return null;
    const trimmed = val.trim();
    return IPV4_REGEX.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Persists the peer squadmate's ZeroTier Virtual LAN IP to localStorage.
 */
export function setPeerZeroTierIp(ip: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = ip.trim();
    if (IPV4_REGEX.test(trimmed)) {
      localStorage.setItem('nexus_peer_zerotier_ip', trimmed);
    }
  } catch {}
}

/**
 * Chromium privacy masking replaces local IPs with UUID `.local` hostnames (RFC 8828).
 * Windows Firewall on newly joined ZeroTier adapters blocks inbound mDNS (UDP 5353) by default.
 * Unmasks `.local` hostnames by substituting the peer's actual ZeroTier virtual IP directly
 * into the candidate string, creating an immediate direct-routable candidate.
 */
export function unmaskCandidate(
  candidate: RTCIceCandidateInit,
  targetIp: string
): RTCIceCandidateInit | null {
  if (!candidate || !candidate.candidate || !targetIp) return null;
  const trimmedIp = targetIp.trim();
  if (!IPV4_REGEX.test(trimmedIp)) return null;

  // Substitute any `.local` hostname with the real ZeroTier IP
  const replaced = candidate.candidate.replace(/[a-zA-Z0-9-]+\.local/gi, trimmedIp);
  if (replaced === candidate.candidate) {
    return null; // No change made
  }

  return {
    candidate: replaced,
    sdpMid: candidate.sdpMid ?? undefined,
    sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
    usernameFragment: candidate.usernameFragment ?? undefined,
  };
}

/**
 * When local peer generates a host candidate containing `.local` or private adapter address,
 * synthesize an explicit ZeroTier candidate carrying the user's ZeroTier IP on that same port.
 */
export function synthesizeZeroTierCandidate(
  candidate: RTCIceCandidateInit,
  localZeroTierIp: string
): RTCIceCandidateInit | null {
  if (!candidate || !candidate.candidate || !localZeroTierIp) return null;
  const trimmedIp = localZeroTierIp.trim();
  if (!IPV4_REGEX.test(trimmedIp)) return null;

  // Only synthesize from host candidates
  if (!candidate.candidate.includes('typ host')) return null;

  // If candidate already has .local, replace it
  if (candidate.candidate.includes('.local')) {
    return unmaskCandidate(candidate, trimmedIp);
  }

  // If candidate has another IP, replace IPv4 address in host candidate
  // Format: candidate:<foundation> <component> <transport> <priority> <address> <port> typ host ...
  const match = candidate.candidate.match(
    /^(candidate:\S+\s+\d+\s+\S+\s+\d+\s+)\S+(\s+\d+\s+typ host.*)$/i
  );
  if (match) {
    return {
      candidate: `${match[1]}${trimmedIp}${match[2]}`,
      sdpMid: candidate.sdpMid ?? undefined,
      sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
      usernameFragment: candidate.usernameFragment ?? undefined,
    };
  }

  return null;
}
