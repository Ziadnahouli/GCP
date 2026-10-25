-- Migration: 00029_security_and_user_experience_hardening.sql
-- Description:
--   1. Case-insensitive username unique index and reserved username protection (L2)
--   2. Full-text / Trigram search index for messages (L10)
--   3. DB-level message spam rate-limiting trigger (L11)
--   4. Profile and presence privacy visibility preferences (L15/L16)

-- ------------------------------------------------------------------------------
-- 1. CASE-INSENSITIVE USERNAME & RESERVED NAMES (L2)
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_lower_username ON public.profiles(LOWER(username));

CREATE OR REPLACE FUNCTION public.trg_check_username_reserved()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_clean TEXT := LOWER(TRIM(NEW.username));
BEGIN
    IF v_clean IN ('admin', 'administrator', 'system', 'nexus', 'support', 'mod', 'moderator', 'root', 'staff', 'help', 'api', 'bot') THEN
        RAISE EXCEPTION 'Username "%" is reserved and cannot be registered', NEW.username;
    END IF;

    -- Prevent regular users from pretending to be deleted accounts
    IF (TG_OP = 'INSERT' OR OLD.username NOT LIKE 'deleted_%') AND v_clean LIKE 'deleted_%' THEN
        IF COALESCE(current_setting('nexus.in_user_deletion', true), 'off') <> 'on' THEN
            RAISE EXCEPTION 'Username prefix "deleted_" is reserved for system use';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_username_reserved ON public.profiles;
CREATE TRIGGER trg_check_username_reserved
    BEFORE INSERT OR UPDATE OF username ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_check_username_reserved();

-- ------------------------------------------------------------------------------
-- 2. FULL-TEXT / TRIGRAM SEARCH ACCELERATION (L10)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
    WHEN OTHERS THEN
        -- Extension not bundled in lightweight test environments (e.g. WASM PGlite)
        NULL;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_content_trgm ON public.messages USING gin (content gin_trgm_ops);';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_channel_messages_content_trgm ON public.channel_messages USING gin (content gin_trgm_ops);';
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. MESSAGE SPAM RATE LIMITING TRIGGER (L11)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_check_messages_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_author_id UUID;
    v_recent_count INT;
BEGIN
    v_author_id := COALESCE(NEW.sender_id, auth.uid());
    IF v_author_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_recent_count
    FROM public.messages
    WHERE sender_id = v_author_id
      AND created_at > (NOW() - INTERVAL '5 seconds');

    IF v_recent_count >= 5 THEN
        RAISE EXCEPTION 'Chat rate limit exceeded. Please wait a few seconds before sending another message.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_check_channel_messages_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_author_id UUID;
    v_recent_count INT;
BEGIN
    v_author_id := COALESCE(NEW.user_id, auth.uid());
    IF v_author_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_recent_count
    FROM public.channel_messages
    WHERE user_id = v_author_id
      AND created_at > (NOW() - INTERVAL '5 seconds');

    IF v_recent_count >= 5 THEN
        RAISE EXCEPTION 'Chat rate limit exceeded. Please wait a few seconds before sending another message.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_rate_limit ON public.messages;
CREATE TRIGGER trg_messages_rate_limit
    BEFORE INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_check_messages_rate_limit();

DROP TRIGGER IF EXISTS trg_channel_messages_rate_limit ON public.channel_messages;
CREATE TRIGGER trg_channel_messages_rate_limit
    BEFORE INSERT ON public.channel_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_check_channel_messages_rate_limit();

-- ------------------------------------------------------------------------------
-- 4. PROFILE AND PRESENCE PRIVACY VISIBILITY SETTINGS (L15/L16)
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS profile_visibility TEXT DEFAULT 'everyone'
    CONSTRAINT check_profile_visibility CHECK (profile_visibility IN ('everyone', 'friends', 'nobody'));

ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS presence_visibility TEXT DEFAULT 'everyone'
    CONSTRAINT check_presence_visibility CHECK (presence_visibility IN ('everyone', 'friends', 'nobody'));

-- ------------------------------------------------------------------------------
-- 5. REALTIME CALL SIGNALING HARDENING & REPLICA IDENTITY
-- ------------------------------------------------------------------------------
-- Ensure call_sessions emits full old and new column payloads on UPDATE (e.g. status='ended')
ALTER TABLE public.call_sessions REPLICA IDENTITY FULL;

-- Ensure permitted signal senders can connect to user-signals topic
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

    -- 5. Channel topics: channel:<id>, channel:<id>:*, chan-room-<id>, voice_room[_-]<id>
    IF clean_topic ~* '^(channel:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-zA-Z0-9_-]+)?|chan-room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|voice_room[_-][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' THEN
        sub_matches := regexp_match(clean_topic, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN public.is_channel_member_active(matched_id, p_user_id);
    END IF;

    -- 6. Scoped presence (R3): Friends and server members
    IF clean_topic ~* '^presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        sub_matches := regexp_match(clean_topic, '^presence:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN p_user_id = matched_id OR public.can_user_signal_target(p_user_id, matched_id);
    END IF;

    RETURN FALSE;
END;
$$;
