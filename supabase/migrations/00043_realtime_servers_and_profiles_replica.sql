-- ==============================================================================
-- Migration: 00043_realtime_servers_and_profiles_replica.sql
-- Description:
--   1. Enable REPLICA IDENTITY FULL on public.profiles so Supabase Realtime
--      Postgres changes replication can evaluate RLS and deliver profile updates.
--   2. Authorize 'servers-realtime' in realtime_topic_authorized_select and
--      realtime_topic_authorized_insert.
--   3. Reload PostgREST schema cache.
-- ==============================================================================

-- 1. Enable REPLICA IDENTITY FULL on public.profiles
ALTER TABLE IF EXISTS public.profiles REPLICA IDENTITY FULL;

-- 2. Update Realtime SELECT topic authorization to include 'servers-realtime'
CREATE OR REPLACE FUNCTION public.realtime_topic_authorized_select(p_topic TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    clean_topic TEXT;
    matched_id UUID;
    sub_matches TEXT[];
BEGIN
    IF p_user_id IS NULL OR p_topic IS NULL THEN
        RETURN FALSE;
    END IF;

    clean_topic := regexp_replace(p_topic, '^realtime:', '');

    -- Global platform channels: global presence, social, conversations, servers
    IF clean_topic IN ('nexus-global-presence', 'conversations-realtime', 'nexus-social-db', 'servers-realtime') THEN
        RETURN TRUE;
    END IF;

    -- 1. User signaling inboxes (R1): Owner can listen, and permitted senders can join to broadcast
    IF clean_topic ~* '^user-signals-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        sub_matches := regexp_match(clean_topic, '^user-signals-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN p_user_id = matched_id OR public.can_user_signal_target(p_user_id, matched_id);
    END IF;

    -- 2. User-private topics: user:<id>, user:<id>:*, user_notifications_<id>, devices_sync_<id>
    IF clean_topic ~* '^(user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-zA-Z0-9_-]+)?|user_notifications_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|devices_sync_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' THEN
        sub_matches := regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN p_user_id = matched_id;
    END IF;

    -- 3. Conversation topics: conv:<id>, conv:<id>:*, chat-room-<id>, call-room-<id>, call-signaling-<id>, call-status-sync-<id>*, active_call_session_<id>
    IF clean_topic ~* '^(conv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-zA-Z0-9_-]+)?|chat-room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|call-room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|call-signaling-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|call-status-sync-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[0-9]+)?|active_call_session_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' THEN
        sub_matches := regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN public.is_conversation_member(matched_id, p_user_id);
    END IF;

    -- 4. Server topics: server:<id>, server:<id>:*, server_voice_<id>
    IF clean_topic ~* '^(server:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-zA-Z0-9_-]+)?|server_voice_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' THEN
        sub_matches := regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN public.is_server_member(matched_id, p_user_id);
    END IF;

    -- 5. Channel topics: channel:<id>, channel:<id>:*, chan-room-<id>, voice_room_<id>, voice_room-<id>
    IF clean_topic ~* '^(channel:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-zA-Z0-9_-]+)?|chan-room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|voice_room[_-][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' THEN
        sub_matches := regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN public.is_channel_server_member(matched_id, p_user_id);
    END IF;

    -- 6. Scoped presence (R3): presence:<id>
    IF clean_topic ~* '^presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        sub_matches := regexp_match(clean_topic, '^presence:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN public.can_user_signal_target(p_user_id, matched_id);
    END IF;

    -- Deny all unlisted or unanchored topics by default
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.realtime_topic_authorized_select(TEXT, UUID) TO authenticated, service_role;

-- 3. Update Realtime INSERT topic authorization to include 'servers-realtime'
CREATE OR REPLACE FUNCTION public.realtime_topic_authorized_insert(p_topic TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    clean_topic TEXT;
    matched_id UUID;
    sub_matches TEXT[];
BEGIN
    IF p_user_id IS NULL OR p_topic IS NULL THEN
        RETURN FALSE;
    END IF;

    clean_topic := regexp_replace(p_topic, '^realtime:', '');

    -- Global platform channels: authenticated users can broadcast presence and updates
    IF clean_topic IN ('nexus-global-presence', 'nexus-social-db', 'conversations-realtime', 'servers-realtime') THEN
        RETURN TRUE;
    END IF;

    -- 1. User signaling inboxes (R1): Sender can only broadcast to target if permitted
    IF clean_topic ~* '^user-signals-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        sub_matches := regexp_match(clean_topic, '^user-signals-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN public.can_user_signal_target(p_user_id, matched_id);
    END IF;

    -- 2. User-private topics: sender must be the owner
    IF clean_topic ~* '^(user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-zA-Z0-9_-]+)?|user_notifications_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|devices_sync_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' THEN
        sub_matches := regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN p_user_id = matched_id;
    END IF;

    -- 3. Conversation topics: sender must be an active member of the conversation
    IF clean_topic ~* '^(conv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-zA-Z0-9_-]+)?|chat-room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|call-room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|call-signaling-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|call-status-sync-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[0-9]+)?|active_call_session_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' THEN
        sub_matches := regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN public.is_conversation_member(matched_id, p_user_id);
    END IF;

    -- 4. Server topics: sender must be a member of the server
    IF clean_topic ~* '^(server:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-zA-Z0-9_-]+)?|server_voice_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' THEN
        sub_matches := regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN public.is_server_member(matched_id, p_user_id);
    END IF;

    -- 5. Channel topics: sender must be an active, non-timed-out member
    IF clean_topic ~* '^(channel:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-zA-Z0-9_-]+)?|chan-room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|voice_room[_-][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' THEN
        sub_matches := regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN public.is_channel_member_active(matched_id, p_user_id);
    END IF;

    -- 6. Scoped presence (R3): sender can only update their own presence
    IF clean_topic ~* '^presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        sub_matches := regexp_match(clean_topic, '^presence:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN p_user_id = matched_id;
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.realtime_topic_authorized_insert(TEXT, UUID) TO authenticated, service_role;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
