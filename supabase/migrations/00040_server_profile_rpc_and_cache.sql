-- ==============================================================================
-- Migration: 00040_server_profile_rpc_and_cache.sql
-- Description:
--   1. Ensure server profile columns and constraints exist on public.server_members.
--   2. Ensure public.update_my_server_profile RPC is deployed with broad role grants.
--   3. Notify PostgREST to reload its schema cache.
-- ==============================================================================

-- 1. Ensure server profile columns exist on public.server_members
ALTER TABLE public.server_members
    ADD COLUMN IF NOT EXISTS nickname TEXT,
    ADD COLUMN IF NOT EXISTS avatar_path TEXT,
    ADD COLUMN IF NOT EXISTS banner_path TEXT,
    ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS pronouns TEXT;

-- Ensure length constraints
ALTER TABLE public.server_members DROP CONSTRAINT IF EXISTS check_member_nickname_length;
ALTER TABLE public.server_members DROP CONSTRAINT IF EXISTS check_member_bio_length;
ALTER TABLE public.server_members DROP CONSTRAINT IF EXISTS check_member_pronouns_length;

ALTER TABLE public.server_members
    ADD CONSTRAINT check_member_nickname_length CHECK (nickname IS NULL OR char_length(nickname) <= 32),
    ADD CONSTRAINT check_member_bio_length CHECK (bio IS NULL OR char_length(bio) <= 190),
    ADD CONSTRAINT check_member_pronouns_length CHECK (pronouns IS NULL OR char_length(pronouns) <= 40);

-- 2. Ensure public.update_my_server_profile RPC exists
CREATE OR REPLACE FUNCTION public.update_my_server_profile(
    p_server_id UUID,
    p_nickname TEXT DEFAULT NULL,
    p_avatar_path TEXT DEFAULT NULL,
    p_banner_path TEXT DEFAULT NULL,
    p_bio TEXT DEFAULT NULL,
    p_pronouns TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_caller_id UUID := auth.uid();
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = p_server_id AND user_id = v_caller_id) THEN
        RAISE EXCEPTION 'Not a member of this server';
    END IF;

    -- Validate path isolation
    IF p_avatar_path IS NOT NULL AND p_avatar_path <> '' AND NOT (p_avatar_path LIKE v_caller_id::text || '/%') THEN
        RAISE EXCEPTION 'avatar_path must start with user ID folder';
    END IF;

    IF p_banner_path IS NOT NULL AND p_banner_path <> '' AND NOT (p_banner_path LIKE v_caller_id::text || '/%') THEN
        RAISE EXCEPTION 'banner_path must start with user ID folder';
    END IF;

    UPDATE public.server_members
    SET 
        nickname = NULLIF(trim(p_nickname), ''),
        avatar_path = NULLIF(trim(p_avatar_path), ''),
        banner_path = NULLIF(trim(p_banner_path), ''),
        bio = NULLIF(trim(p_bio), ''),
        pronouns = NULLIF(trim(p_pronouns), '')
    WHERE server_id = p_server_id AND user_id = v_caller_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.update_my_server_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_server_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.update_my_server_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 3. Ensure public.set_member_nickname exists for moderators/owners
CREATE OR REPLACE FUNCTION public.set_member_nickname(
    p_server_id UUID,
    p_target_user_id UUID,
    p_nickname TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_target_role TEXT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF v_caller_id = p_target_user_id THEN
        RETURN public.update_my_server_profile(p_server_id, p_nickname);
    END IF;

    SELECT role INTO v_caller_role FROM public.server_members WHERE server_id = p_server_id AND user_id = v_caller_id;
    SELECT role INTO v_target_role FROM public.server_members WHERE server_id = p_server_id AND user_id = p_target_user_id;

    IF v_caller_role IS NULL OR v_target_role IS NULL THEN
        RAISE EXCEPTION 'Both users must be members of the server';
    END IF;

    IF v_caller_role NOT IN ('owner', 'admin', 'moderator') THEN
        RAISE EXCEPTION 'Insufficient permissions to change member nickname';
    END IF;

    IF v_caller_role = 'moderator' AND v_target_role IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Moderators cannot change nickname of server admins or owners';
    END IF;

    IF v_caller_role = 'admin' AND v_target_role = 'owner' THEN
        RAISE EXCEPTION 'Admins cannot change nickname of server owner';
    END IF;

    UPDATE public.server_members
    SET nickname = NULLIF(trim(p_nickname), '')
    WHERE server_id = p_server_id AND user_id = p_target_user_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_member_nickname(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_nickname(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.set_member_nickname(UUID, UUID, TEXT) TO service_role;

-- 4. Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';

