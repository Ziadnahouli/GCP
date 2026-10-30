-- ==============================================================================
-- Migration: 00033_atomic_channel_deletion_rpc.sql
-- Description: SS-H2 Atomic delete_channel RPC and SS-C1 Channel Constraints
-- ==============================================================================

-- 1. SS-C1: CHANNEL TABLE CONSTRAINTS & FORMATTING
ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_name_length_check;
ALTER TABLE public.channels ADD CONSTRAINT channels_name_length_check
    CHECK (length(btrim(name)) >= 1 AND length(btrim(name)) <= 50);

ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_topic_length_check;
ALTER TABLE public.channels ADD CONSTRAINT channels_topic_length_check
    CHECK (topic IS NULL OR length(topic) <= 1024);

-- Trigger to normalize text channel names: lowercase, trimmed, spaces to hyphens
CREATE OR REPLACE FUNCTION public.trg_normalize_channel_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.name := btrim(NEW.name);
    IF NEW.type = 'text' THEN
        NEW.name := lower(regexp_replace(NEW.name, '\s+', '-', 'g'));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_channel_name ON public.channels;
CREATE TRIGGER trg_normalize_channel_name
    BEFORE INSERT OR UPDATE OF name, type ON public.channels
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_normalize_channel_name();

-- Unique channel name per server and type (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_unique_server_name_type
    ON public.channels (server_id, lower(name), type);

-- 2. SS-H2: ATOMIC DELETE_CHANNEL RPC
DROP FUNCTION IF EXISTS public.delete_channel(UUID);
CREATE OR REPLACE FUNCTION public.delete_channel(
    p_channel_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_server_id UUID;
    v_channel_name TEXT;
    v_channel_type TEXT;
    v_caller UUID := auth.uid();
    v_text_count INT;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required to delete channels';
    END IF;

    SELECT server_id, name, type
    INTO v_server_id, v_channel_name, v_channel_type
    FROM public.channels
    WHERE id = p_channel_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Channel not found';
    END IF;

    -- Permission check: caller must be owner or admin (or have manage_channels)
    IF NOT public.is_server_owner_or_admin(v_server_id, v_caller) THEN
        RAISE EXCEPTION 'Insufficient permissions to delete channel';
    END IF;

    -- Refuse to delete the last text channel
    IF v_channel_type = 'text' THEN
        SELECT count(*) INTO v_text_count
        FROM public.channels
        WHERE server_id = v_server_id AND type = 'text';

        IF v_text_count <= 1 THEN
            RAISE EXCEPTION 'Cannot delete the last text channel of the server';
        END IF;
    END IF;

    -- Delete channel (channel_messages has ON DELETE CASCADE, so messages are cleaned atomically)
    DELETE FROM public.channels
    WHERE id = p_channel_id;

    -- Record audit log
    PERFORM public.log_moderation_audit(
        v_server_id,
        NULL,
        'delete_channel',
        'Deleted channel ' || v_channel_name,
        jsonb_build_object(
            'channel_id', p_channel_id,
            'channel_name', v_channel_name,
            'channel_type', v_channel_type
        )
    );

    RETURN TRUE;
END;
$$;

