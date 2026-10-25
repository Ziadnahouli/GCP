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

    IF v_recent_count >= 10 THEN
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

    IF v_recent_count >= 10 THEN
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
