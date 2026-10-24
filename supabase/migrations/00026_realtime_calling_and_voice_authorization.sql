-- Migration: 00026_realtime_calling_and_voice_authorization.sql
-- Description: Enable WebRTC calling signaling, squad calls, and voice lounge channels in Realtime RLS

-- 1. Helper function: check if user is a member or owner of a server
CREATE OR REPLACE FUNCTION public.is_server_member(p_server_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.servers s
    LEFT JOIN public.server_members sm ON sm.server_id = s.id AND sm.user_id = p_user_id
    WHERE s.id = p_server_id
      AND (s.owner_id = p_user_id OR sm.id IS NOT NULL)
  );
$$;

-- 2. Helper function: check if user is a member or owner of a channel's server (or server ID directly)
CREATE OR REPLACE FUNCTION public.is_channel_server_member(p_channel_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channels c
    JOIN public.servers s ON s.id = c.server_id
    LEFT JOIN public.server_members sm ON sm.server_id = s.id AND sm.user_id = p_user_id
    WHERE c.id = p_channel_id
      AND (s.owner_id = p_user_id OR sm.id IS NOT NULL)
  ) OR EXISTS (
    SELECT 1
    FROM public.servers s
    LEFT JOIN public.server_members sm ON sm.server_id = s.id AND sm.user_id = p_user_id
    WHERE s.id = p_channel_id
      AND (s.owner_id = p_user_id OR sm.id IS NOT NULL)
  );
$$;

-- 3. Topic authorization validator for Supabase Realtime Authorization
CREATE OR REPLACE FUNCTION public.realtime_topic_authorized(p_topic TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    matched_id UUID;
    clean_topic TEXT;
BEGIN
    IF p_topic IS NULL OR p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Strip optional 'realtime:' prefix if present
    clean_topic := regexp_replace(p_topic, '^realtime:', '');

    -- Public / global authenticated channels (social status, system broadcasts)
    IF clean_topic IN ('social-realtime', 'system') THEN
        RETURN TRUE;
    END IF;

    -- 1. Conversation topics: conv:<id>:*, chat-room-<id>, call-room-<id>, call-signaling-<id>, call-status-sync-<id>*, active_call_session_<id>
    IF clean_topic ~* '^(conv:[0-9a-f-]{36}|chat-room-[0-9a-f-]{36}|call-room-[0-9a-f-]{36}|call-signaling-[0-9a-f-]{36}|call-status-sync-[0-9a-f-]{36}|active_call_session_[0-9a-f-]{36})' THEN
        BEGIN
            matched_id := (regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i'))[1]::uuid;
            RETURN public.is_conversation_member(matched_id, p_user_id);
        EXCEPTION WHEN OTHERS THEN
            RETURN FALSE;
        END;
    END IF;

    -- 2. User signaling inboxes: user-signals-<id>
    -- Allow any authenticated user to broadcast / subscribe to user-signals channels for incoming/outgoing call signaling
    IF clean_topic ~* '^user-signals-[0-9a-f-]{36}' THEN
        RETURN p_user_id IS NOT NULL;
    END IF;

    -- 3. User-private topics: user:<id>:*, user_notifications_[0-9a-f-]{36}, devices_sync_[0-9a-f-]{36}
    IF clean_topic ~* '^(user:[0-9a-f-]{36}|user_notifications_[0-9a-f-]{36}|devices_sync_[0-9a-f-]{36})' THEN
        BEGIN
            matched_id := (regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i'))[1]::uuid;
            RETURN p_user_id = matched_id;
        EXCEPTION WHEN OTHERS THEN
            RETURN FALSE;
        END;
    END IF;

    -- 4. Server topics: server:<id>:*, server_voice_[0-9a-f-]{36}
    IF clean_topic ~* '^(server:[0-9a-f-]{36}|server_voice_[0-9a-f-]{36})' THEN
        BEGIN
            matched_id := (regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i'))[1]::uuid;
            RETURN public.is_server_member(matched_id, p_user_id);
        EXCEPTION WHEN OTHERS THEN
            RETURN FALSE;
        END;
    END IF;

    -- 5. Channel topics with UUID: channel:<id>:*, chan-room-<id>, voice_room_<id>, voice_room-<id>
    IF clean_topic ~* '^(channel:[0-9a-f-]{36}|chan-room-[0-9a-f-]{36}|voice_room_[0-9a-f-]{36}|voice_room-[0-9a-f-]{36})' THEN
        BEGIN
            matched_id := (regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i'))[1]::uuid;
            RETURN public.is_channel_server_member(matched_id, p_user_id);
        EXCEPTION WHEN OTHERS THEN
            RETURN FALSE;
        END;
    END IF;

    -- 6. Voice lounge or generic voice rooms (e.g. voice_room_lounge, voice_room_*)
    IF clean_topic ~* '^voice_room_' THEN
        RETURN p_user_id IS NOT NULL;
    END IF;

    -- Deny unlisted private topics by default
    RETURN FALSE;
END;
$$;

-- 4. Re-apply policies on realtime.messages if table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'realtime' AND table_name = 'messages'
    ) THEN
        DROP POLICY IF EXISTS "realtime_messages_select_authorized" ON realtime.messages;
        DROP POLICY IF EXISTS "realtime_messages_insert_authorized" ON realtime.messages;

        CREATE POLICY "realtime_messages_select_authorized"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (
            public.realtime_topic_authorized(COALESCE(realtime.topic(), topic), auth.uid())
        );

        CREATE POLICY "realtime_messages_insert_authorized"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
            public.realtime_topic_authorized(COALESCE(realtime.topic(), topic), auth.uid())
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- 5. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_server_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_channel_server_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.realtime_topic_authorized(TEXT, UUID) TO authenticated, service_role;
