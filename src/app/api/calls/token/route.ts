import { NextResponse } from 'next/server';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const tokenRequestSchema = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  serverId: z.string().uuid().optional().nullable(),
  channelId: z.string().uuid().optional().nullable(),
  roomName: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).optional().nullable(),
  userId: z.string().optional().nullable(),
  userName: z.string().optional().nullable(),
});

/**
 * High-performance bounded in-memory sliding-window rate limiter.
 * 
 * NOTE / ARCHITECTURAL LIMITATION:
 * In serverless environments (e.g. Vercel / AWS Lambda) or multi-instance container
 * deployments, this in-memory Map is local to the active lambda / worker process and
 * is NOT shared across instances. It serves as a best-effort defense-in-depth limiter
 * against local burst loops.
 * 
 * Production deployments requiring strict distributed rate limiting across horizontal
 * instances should use a shared distributed store such as:
 *   - Upstash Redis (@upstash/ratelimit) via HTTP/REST
 *   - A persistent Supabase rate_limits table with atomic counter updates
 */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;
const MAX_RATE_LIMIT_ENTRIES = 1000;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function pruneStaleRateLimits(now: number) {
  rateLimitMap.forEach((entry, key) => {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(key);
    }
  });
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();

  if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES || Math.random() < 0.05) {
    pruneStaleRateLimits(now);
  }

  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  entry.count += 1;
  return true;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parseResult = tokenRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed: Invalid request payload',
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { conversationId, serverId, channelId, roomName, userId: requestedUserId, userName: requestedUserName } = parseResult.data;

    // 1. Authenticate user from session / token
    const supabase = createClient();
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const { data: authData, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    const user = authData?.user;
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }

    // Rate limiting by user identity
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Too Many Requests: Rate limit exceeded. Please wait before requesting another token.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // Prevent identity spoofing: client cannot request a token for a different user
    if (requestedUserId && requestedUserId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden: Cannot request call token for another user identity' },
        { status: 403 }
      );
    }

    const targetUserId = user.id;
    const participantName =
      requestedUserName?.trim() ||
      user.user_metadata?.display_name ||
      user.user_metadata?.username ||
      user.email?.split('@')[0] ||
      'Squadmate';

    // 2. Authorize access & resolve authoritative room name (Fail-closed design)
    let finalRoomName: string | null = null;

    if (conversationId) {
      // Direct / Group conversation call: Verify caller is a conversation member
      if (!UUID_REGEX.test(conversationId)) {
        return NextResponse.json(
          { error: 'Invalid conversation format: Conversation ID must be a valid UUID' },
          { status: 400 }
        );
      }

      const { data: mem, error: memErr } = await supabase
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (memErr || !mem) {
        return NextResponse.json(
          { error: 'Forbidden: You are not a member of this conversation' },
          { status: 403 }
        );
      }

      finalRoomName = `nexus-dm-${conversationId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;
    } else if (channelId) {
      // Server Voice Channel: Verify channel exists, channel is a voice channel, and user is a member of the server
      if (!UUID_REGEX.test(channelId)) {
        return NextResponse.json(
          { error: 'Invalid channel format: Channel ID must be a valid UUID' },
          { status: 400 }
        );
      }

      const { data: channel, error: chanErr } = await supabase
        .from('channels')
        .select('id, server_id, type')
        .eq('id', channelId)
        .maybeSingle();

      if (chanErr || !channel) {
        return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
      }

      // Verify channel type: Voice credentials must only be issued for voice channels
      if (channel.type !== 'voice') {
        return NextResponse.json(
          { error: 'Invalid channel type: Voice credentials can only be issued for voice channels' },
          { status: 400 }
        );
      }

      const targetServerId = channel.server_id;
      if (!targetServerId) {
        return NextResponse.json({ error: 'Channel is not associated with a server' }, { status: 400 });
      }

      // Reject mismatched server ID and channel ID
      if (serverId && serverId !== targetServerId) {
        return NextResponse.json(
          { error: 'Bad Request: Mismatched server ID and channel ID' },
          { status: 400 }
        );
      }

      // Check server bans
      const { data: ban } = await supabase
        .from('server_bans')
        .select('id')
        .eq('server_id', targetServerId)
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (ban) {
        return NextResponse.json(
          { error: 'Forbidden: You are banned from this server' },
          { status: 403 }
        );
      }

      // Require authenticated server membership and check timeout
      const { data: srvMem, error: srvErr } = await supabase
        .from('server_members')
        .select('id, timeout_until')
        .eq('server_id', targetServerId)
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (srvErr || !srvMem) {
        return NextResponse.json(
          { error: 'Forbidden: You are not a member of this server' },
          { status: 403 }
        );
      }

      if (srvMem.timeout_until && new Date(srvMem.timeout_until).getTime() > Date.now()) {
        return NextResponse.json(
          { error: 'Forbidden: You are currently timed out in this server' },
          { status: 403 }
        );
      }

      finalRoomName = `nexus-voice-${channelId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;
    } else if (serverId) {
      // Server-wide voice room: Verify server membership, bans, and timeouts
      if (!UUID_REGEX.test(serverId)) {
        return NextResponse.json(
          { error: 'Invalid server format: Server ID must be a valid UUID' },
          { status: 400 }
        );
      }

      const { data: ban } = await supabase
        .from('server_bans')
        .select('id')
        .eq('server_id', serverId)
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (ban) {
        return NextResponse.json(
          { error: 'Forbidden: You are banned from this server' },
          { status: 403 }
        );
      }

      const { data: srvMem, error: srvErr } = await supabase
        .from('server_members')
        .select('id, timeout_until')
        .eq('server_id', serverId)
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (srvErr || !srvMem) {
        return NextResponse.json(
          { error: 'Forbidden: You are not a member of this server' },
          { status: 403 }
        );
      }

      if (srvMem.timeout_until && new Date(srvMem.timeout_until).getTime() > Date.now()) {
        return NextResponse.json(
          { error: 'Forbidden: You are currently timed out in this server' },
          { status: 403 }
        );
      }

      finalRoomName = `nexus-server-${serverId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;
    } else if (roomName) {
      // Specific roomName requested: Strictly validate prefix and verify membership
      if (roomName === 'nexus-voice-lounge') {
        // Authenticated default lounge
        finalRoomName = 'nexus-voice-lounge';
      } else if (roomName.startsWith('nexus-dm-')) {
        const candidateConvId = roomName.replace('nexus-dm-', '');
        if (!UUID_REGEX.test(candidateConvId)) {
          return NextResponse.json(
            { error: 'Invalid room format: Conversation ID must be a valid UUID' },
            { status: 400 }
          );
        }

        const { data: mem } = await supabase
          .from('conversation_members')
          .select('id')
          .eq('conversation_id', candidateConvId)
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (!mem) {
          return NextResponse.json(
            { error: 'Forbidden: You are not a member of this private conversation room' },
            { status: 403 }
          );
        }

        finalRoomName = roomName;
      } else if (roomName.startsWith('nexus-voice-')) {
        const candidateChanId = roomName.replace('nexus-voice-', '');
        if (!UUID_REGEX.test(candidateChanId)) {
          return NextResponse.json(
            { error: 'Invalid room format: Channel ID must be a valid UUID' },
            { status: 400 }
          );
        }

        const { data: channel } = await supabase
          .from('channels')
          .select('id, server_id, type')
          .eq('id', candidateChanId)
          .maybeSingle();

        if (!channel || channel.type !== 'voice') {
          return NextResponse.json(
            { error: 'Voice channel not found or is not a voice channel' },
            { status: 404 }
          );
        }

        const targetServerId = channel.server_id;
        if (!targetServerId) {
          return NextResponse.json(
            { error: 'Voice channel is not associated with a server' },
            { status: 400 }
          );
        }

        if (serverId && serverId !== targetServerId) {
          return NextResponse.json(
            { error: 'Bad Request: Mismatched server ID and voice channel' },
            { status: 400 }
          );
        }

        const { data: ban } = await supabase
          .from('server_bans')
          .select('id')
          .eq('server_id', targetServerId)
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (ban) {
          return NextResponse.json(
            { error: 'Forbidden: You are banned from this server' },
            { status: 403 }
          );
        }

        const { data: srvMem } = await supabase
          .from('server_members')
          .select('id, timeout_until')
          .eq('server_id', targetServerId)
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (!srvMem) {
          return NextResponse.json(
            { error: 'Forbidden: You are not a member of this voice channel server' },
            { status: 403 }
          );
        }

        if (srvMem.timeout_until && new Date(srvMem.timeout_until).getTime() > Date.now()) {
          return NextResponse.json(
            { error: 'Forbidden: You are currently timed out in this server' },
            { status: 403 }
          );
        }

        finalRoomName = roomName;
      } else if (roomName.startsWith('nexus-server-')) {
        const candidateSrvId = roomName.replace('nexus-server-', '');
        if (!UUID_REGEX.test(candidateSrvId)) {
          return NextResponse.json(
            { error: 'Invalid room format: Server ID must be a valid UUID' },
            { status: 400 }
          );
        }

        const { data: ban } = await supabase
          .from('server_bans')
          .select('id')
          .eq('server_id', candidateSrvId)
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (ban) {
          return NextResponse.json(
            { error: 'Forbidden: You are banned from this server' },
            { status: 403 }
          );
        }

        const { data: srvMem } = await supabase
          .from('server_members')
          .select('id, timeout_until')
          .eq('server_id', candidateSrvId)
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (!srvMem) {
          return NextResponse.json(
            { error: 'Forbidden: You are not a member of this server' },
            { status: 403 }
          );
        }

        if (srvMem.timeout_until && new Date(srvMem.timeout_until).getTime() > Date.now()) {
          return NextResponse.json(
            { error: 'Forbidden: You are currently timed out in this server' },
            { status: 403 }
          );
        }

        finalRoomName = roomName;
      } else {
        return NextResponse.json(
          { error: 'Forbidden: Custom unverified room names are not permitted' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Bad Request: Missing conversationId, channelId, serverId, or roomName parameter' },
        { status: 400 }
      );
    }

    if (!finalRoomName) {
      return NextResponse.json(
        { error: 'Forbidden: Unable to verify access to requested room' },
        { status: 403 }
      );
    }

    // 3. LiveKit Cloud credentials check — fail closed with controlled fallback, no hardcoded secrets!
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl || wsUrl.includes('your-project')) {
      return NextResponse.json(
        {
          message: 'LiveKit server credentials are not configured. Native WebRTC P2P fallback active.',
          isConfigured: false,
          mode: 'p2p',
        },
        { status: 200 }
      );
    }

    // 4. Issue authenticated LiveKit token with least-privilege room grants and 1-hour TTL
    const at = new AccessToken(apiKey, apiSecret, {
      identity: targetUserId,
      name: participantName,
      ttl: 3600, // 1 hour token validity
    });

    at.addGrant({
      roomJoin: true,
      room: finalRoomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE],
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      url: wsUrl,
      isConfigured: true,
      roomName: finalRoomName,
      identity: targetUserId,
      participantName,
    });
  } catch (err: unknown) {
    console.error('[LiveKit Token Error]:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
