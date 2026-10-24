-- ==============================================================================
-- Migration: 00021_auth_and_state_integrity.sql
-- Description: Phase 4 — Auth, State, and Data Integrity Remediation
-- 
-- Remediation Coverage:
--   A1: ensure_profile() RPC with collision-safe username assignment and zero-mutation on existing profile
--   A5: Automatic default channel creation trigger for servers (eliminates client-side default-chan-* fallbacks)
--   A5: Backfill default channels for any existing empty servers
-- ==============================================================================

-- ==============================================================================
-- 1. A1: ENSURE_PROFILE RPC (Collision-safe, Non-clobbering Profile Initialization)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.ensure_profile(
    p_user_id UUID,
    p_email TEXT DEFAULT NULL,
    p_username TEXT DEFAULT NULL,
    p_display_name TEXT DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_prof public.profiles%ROWTYPE;
    candidate_username TEXT;
    base_username TEXT;
    suffix_counter INT := 0;
    rand_suffix TEXT;
    final_display_name TEXT;
    new_prof public.profiles%ROWTYPE;
BEGIN
    -- 1. Check if profile already exists. If yes, return immediately without mutating!
    SELECT * INTO existing_prof
    FROM public.profiles
    WHERE id = p_user_id;

    IF existing_prof.id IS NOT NULL THEN
        RETURN existing_prof;
    END IF;

    -- 2. Build base username from provided username, email prefix, or user ID
    base_username := COALESCE(
        NULLIF(TRIM(p_username), ''),
        NULLIF(SPLIT_PART(p_email, '@', 1), ''),
        'gamer_' || SUBSTRING(p_user_id::text FROM 1 FOR 6)
    );

    -- Sanitize username: replace invalid characters with underscores and limit length to 28
    base_username := SUBSTRING(REGEXP_REPLACE(base_username, '[^a-zA-Z0-9_-]', '_', 'g') FROM 1 FOR 28);
    IF LENGTH(base_username) < 3 THEN
        base_username := base_username || '_' || SUBSTRING(p_user_id::text FROM 1 FOR 4);
    END IF;

    candidate_username := base_username;

    -- 3. Resolve username collisions with deterministic + random suffix loop
    WHILE EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE LOWER(username) = LOWER(candidate_username) 
          AND id != p_user_id
    ) AND suffix_counter < 15 LOOP
        suffix_counter := suffix_counter + 1;
        rand_suffix := SUBSTRING(MD5(p_user_id::text || suffix_counter::text || NOW()::text) FROM 1 FOR 4);
        candidate_username := SUBSTRING(base_username FROM 1 FOR 24) || '_' || rand_suffix;
    END LOOP;

    -- Fallback display name
    final_display_name := COALESCE(
        NULLIF(TRIM(p_display_name), ''),
        NULLIF(TRIM(p_username), ''),
        candidate_username
    );

    -- 4. Insert newly resolved profile
    INSERT INTO public.profiles (
        id,
        username,
        display_name,
        avatar_url,
        banner_url,
        banner_color,
        status,
        created_at,
        updated_at
    )
    VALUES (
        p_user_id,
        candidate_username,
        final_display_name,
        NULL,
        NULL,
        '#7c3aed',
        'online',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
        SET updated_at = public.profiles.updated_at
    RETURNING * INTO new_prof;

    -- 5. Ensure default user_settings row exists as well
    INSERT INTO public.user_settings (
        user_id,
        theme,
        accent_color,
        sound_effects_enabled,
        push_to_talk_enabled,
        input_volume,
        output_volume,
        allow_direct_messages,
        allow_friend_requests,
        updated_at
    )
    VALUES (
        p_user_id,
        'dark',
        'violet',
        TRUE,
        FALSE,
        85,
        100,
        'everyone',
        'everyone',
        NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;

    RETURN new_prof;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_profile(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ==============================================================================
-- 2. A5: AUTOMATIC DEFAULT CHANNEL CREATION FOR SERVERS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_server_default_channels()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if server already has channels inserted
    IF NOT EXISTS (SELECT 1 FROM public.channels WHERE server_id = NEW.id) THEN
        -- Insert standard default text channel
        INSERT INTO public.channels (
            id,
            server_id,
            name,
            type,
            topic,
            position,
            created_at
        )
        VALUES (
            gen_random_uuid(),
            NEW.id,
            'general',
            'text',
            'General team discussion & lobby chatter',
            0,
            NOW()
        );

        -- Insert standard default voice channel
        INSERT INTO public.channels (
            id,
            server_id,
            name,
            type,
            topic,
            position,
            created_at
        )
        VALUES (
            gen_random_uuid(),
            NEW.id,
            'Voice Lounge',
            'voice',
            'Instant squad voice comms',
            1,
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_server_default_channels ON public.servers;
CREATE TRIGGER trg_server_default_channels
    AFTER INSERT ON public.servers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_server_default_channels();

-- ==============================================================================
-- 3. A5: BACKFILL DEFAULT CHANNELS FOR ANY ORPHANED EMPTY SERVERS
-- ==============================================================================

DO $$
DECLARE
    srv RECORD;
BEGIN
    FOR srv IN
        SELECT s.id
        FROM public.servers s
        LEFT JOIN public.channels c ON c.server_id = s.id
        WHERE c.id IS NULL
    LOOP
        INSERT INTO public.channels (id, server_id, name, type, topic, position, created_at)
        VALUES
            (gen_random_uuid(), srv.id, 'general', 'text', 'General team discussion & lobby chatter', 0, NOW()),
            (gen_random_uuid(), srv.id, 'Voice Lounge', 'voice', 'Instant squad voice comms', 1, NOW());
    END LOOP;
END;
$$;
