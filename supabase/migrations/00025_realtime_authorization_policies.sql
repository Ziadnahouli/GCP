-- Migration: 00025_realtime_authorization_policies.sql
-- Description: Enforce Supabase Realtime Authorization on realtime.messages for private channels (A2)

-- 1. Ensure realtime schema and messages table exist (for local/testing environments; in Supabase hosted, managed by supabase_admin)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'realtime' AND table_name = 'messages'
    ) THEN
        BEGIN
            CREATE SCHEMA IF NOT EXISTS realtime;
            CREATE TABLE IF NOT EXISTS realtime.messages (
                id BIGSERIAL PRIMARY KEY,
                topic TEXT NOT NULL,
                extension TEXT NOT NULL,
                inserted_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END;
    END IF;

    -- Ensure realtime.topic() helper exists if not already provided by Supabase platform
    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'realtime' AND p.proname = 'topic'
    ) THEN
        BEGIN
            EXECUTE $fn$
                CREATE FUNCTION realtime.topic()
                RETURNS TEXT
                LANGUAGE sql
                STABLE
                AS $body$
                    SELECT NULLIF(current_setting('realtime.topic', true), '');
                $body$;
            $fn$;
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END;
    END IF;
END $$;

-- 2. Helper function to check channel server membership
CREATE OR REPLACE FUNCTION public.is_channel_server_member(p_channel_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.channels c
        JOIN public.server_members sm ON sm.server_id = c.server_id
        WHERE c.id = p_channel_id
          AND sm.user_id = p_user_id
    );
$$;

-- 3. Authorization validator for channel topics
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

    -- Public / global authenticated channels (e.g. social status changes)
    IF clean_topic = 'social-realtime' THEN
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

    -- 2. User-private topics: user:<id>:*, user-signals-<id>, user_notifications_[0-9a-f-]{36}, devices_sync_[0-9a-f-]{36}
    IF clean_topic ~* '^(user:[0-9a-f-]{36}|user-signals-[0-9a-f-]{36}|user_notifications_[0-9a-f-]{36}|devices_sync_[0-9a-f-]{36})' THEN
        BEGIN
            matched_id := (regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i'))[1]::uuid;
            RETURN p_user_id = matched_id;
        EXCEPTION WHEN OTHERS THEN
            RETURN FALSE;
        END;
    END IF;

    -- 3. Server topics: server:<id>:*, server_voice_<id>
    IF clean_topic ~* '^(server:[0-9a-f-]{36}|server_voice_[0-9a-f-]{36})' THEN
        BEGIN
            matched_id := (regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i'))[1]::uuid;
            RETURN public.is_server_member(matched_id, p_user_id);
        EXCEPTION WHEN OTHERS THEN
            RETURN FALSE;
        END;
    END IF;

    -- 4. Channel topics: channel:<id>:*, chan-room-<id>, voice_room_<id>, voice_room-<id>
    IF clean_topic ~* '^(channel:[0-9a-f-]{36}|chan-room-[0-9a-f-]{36}|voice_room_[0-9a-f-]{36}|voice_room-[0-9a-f-]{36})' THEN
        BEGIN
            matched_id := (regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i'))[1]::uuid;
            RETURN public.is_channel_server_member(matched_id, p_user_id);
        EXCEPTION WHEN OTHERS THEN
            RETURN FALSE;
        END;
    END IF;

    -- Deny any unlisted/unknown private topic by default
    RETURN FALSE;
END;
$$;

-- 4. Enable RLS on realtime.messages (if not already enabled)
DO $$
BEGIN
    BEGIN
        ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    EXCEPTION
        WHEN OTHERS THEN
            NULL;
    END;
END $$;

-- 5. Drop existing policies if any
DROP POLICY IF EXISTS "realtime_messages_select_authorized" ON realtime.messages;
DROP POLICY IF EXISTS "realtime_messages_insert_authorized" ON realtime.messages;

-- 6. Apply RLS policies for SELECT (subscribe / listen) and INSERT (broadcast / send)
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

-- 7. Grant permissions
DO $$
BEGIN
    BEGIN
        GRANT USAGE ON SCHEMA realtime TO authenticated, service_role;
        REVOKE USAGE ON SCHEMA realtime FROM anon;
        GRANT SELECT, INSERT ON realtime.messages TO authenticated;
        GRANT ALL ON realtime.messages TO service_role;
        REVOKE ALL ON realtime.messages FROM anon;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA realtime TO authenticated;
        GRANT EXECUTE ON FUNCTION realtime.topic() TO authenticated, service_role;
    EXCEPTION
        WHEN OTHERS THEN
            NULL;
    END;
END $$;

GRANT EXECUTE ON FUNCTION public.realtime_topic_authorized(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_channel_server_member(UUID, UUID) TO authenticated, service_role;

