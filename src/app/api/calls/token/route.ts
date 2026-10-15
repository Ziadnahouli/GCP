import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
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

    const { conversationId, serverId, channelId, roomName, userId: requestedUserId } = parseResult.data;

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

    // Prevent identity spoofing: client cannot request a token for a different user
    if (requestedUserId && requestedUserId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden: Cannot request call token for another user identity' },
        { status: 403 }
      );
    }

    const targetUserId = user.id;
    const participantName =
      user.user_metadata?.display_name ||
      user.user_metadata?.username ||
      user.email?.split('@')[0] ||
      'Squadmate';

    // 2. Authorize access & resolve authoritative room name
    let finalRoomName: string;

    if (conversationId) {
      // Direct / Group conversation call: Verify caller is a conversation member
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
      // Server Voice Channel: Verify channel exists and user is a member of the server
      const { data: channel, error: chanErr } = await supabase
        .from('channels')
        .select('id, server_id, type')
        .eq('id', channelId)
        .maybeSingle();

      if (chanErr || !channel) {
        return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
      }

      const targetServerId = channel.server_id || serverId;
      if (targetServerId) {
        const { data: srvMem, error: srvErr } = await supabase
          .from('server_members')
          .select('id')
          .eq('server_id', targetServerId)
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (srvErr || !srvMem) {
          return NextResponse.json(
            { error: 'Forbidden: You are not a member of this server' },
            { status: 403 }
          );
        }
      }

      finalRoomName = `nexus-voice-${channelId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;
    } else if (serverId) {
      // Server-wide voice room: Verify server membership
      const { data: srvMem, error: srvErr } = await supabase
        .from('server_members')
        .select('id')
        .eq('server_id', serverId)
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (srvErr || !srvMem) {
        return NextResponse.json(
          { error: 'Forbidden: You are not a member of this server' },
          { status: 403 }
        );
      }

      finalRoomName = `nexus-server-${serverId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;
    } else if (roomName) {
      // Specific roomName requested: check prefixes
      if (roomName.startsWith('nexus-dm-')) {
        const candidateConvId = roomName.replace('nexus-dm-', '');
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(candidateConvId)) {
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
        }
      } else if (roomName.startsWith('nexus-voice-')) {
        const candidateChanId = roomName.replace('nexus-voice-', '');
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(candidateChanId)) {
          const { data: channel } = await supabase
            .from('channels')
            .select('server_id')
            .eq('id', candidateChanId)
            .maybeSingle();

          if (channel?.server_id) {
            const { data: srvMem } = await supabase
              .from('server_members')
              .select('id')
              .eq('server_id', channel.server_id)
              .eq('user_id', targetUserId)
              .maybeSingle();

            if (!srvMem) {
              return NextResponse.json(
                { error: 'Forbidden: You are not a member of this voice channel server' },
                { status: 403 }
              );
            }
          }
        }
      } else if (roomName !== 'nexus-voice-lounge') {
        return NextResponse.json(
          { error: 'Forbidden: Custom unverified room names are not permitted' },
          { status: 403 }
        );
      }

      finalRoomName = roomName;
    } else {
      finalRoomName = 'nexus-voice-lounge';
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

    // 4. Issue authenticated LiveKit token with least-privilege room grants
    const at = new AccessToken(apiKey, apiSecret, {
      identity: targetUserId,
      name: participantName,
    });

    at.addGrant({
      roomJoin: true,
      room: finalRoomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
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
