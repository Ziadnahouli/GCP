-- ==============================================================================
-- Migration 00038: Profile Customization, Per-Server Profiles & Privacy Enforcement
-- ==============================================================================
-- Description:
-- 1. Identity fields: constraints on bio (<= 500), pronouns (<= 40), custom status (<= 128),
--    hex color constraints, avatar_path, banner_path, avatar_color, username_changed_at.
-- 2. New tables: profile_links, badges, user_badges, profile_decorations, username_history.
-- 3. Per-server profile columns on server_members: nickname, avatar_path, banner_path, bio, pronouns.
-- 4. Integrity triggers: immutable created_at/id on profiles, username cooldown & reserved list,
--    storage path isolation, unicode normalization.
-- 5. Read path & RPCs:
--    - get_public_profiles(uuid[]) for lean message and list fetching.
--    - get_profile_card(uuid, uuid) for privacy-governed profile viewing.
--    - check_username_available, change_username, set_custom_status, set_activity, set_member_nickname.
-- 6. Privacy enforcement: RLS policy on profiles restricts direct wide queries.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTEND PUBLIC.PROFILES COLUMNS & CONSTRAINTS
-- ------------------------------------------------------------------------------

-- Ensure existing data meets constraints before adding them
UPDATE public.profiles
SET bio = substring(bio from 1 for 500)
WHERE bio IS NOT NULL AND char_length(bio) > 500;

UPDATE public.profiles
SET banner_color = '#3b82f6'
WHERE banner_color IS NOT NULL AND banner_color !~* '^#[0-9a-f0-9]{6}$';

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS pronouns TEXT,
    ADD COLUMN IF NOT EXISTS custom_status_emoji TEXT,
    ADD COLUMN IF NOT EXISTS custom_status_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS timezone TEXT,
    ADD COLUMN IF NOT EXISTS accent_color TEXT,
    ADD COLUMN IF NOT EXISTS profile_theme JSONB DEFAULT '{"primary": "#3b82f6", "accent": "#8b5cf6"}'::jsonb,
    ADD COLUMN IF NOT EXISTS decoration_id TEXT,
    ADD COLUMN IF NOT EXISTS avatar_path TEXT,
    ADD COLUMN IF NOT EXISTS banner_path TEXT,
    ADD COLUMN IF NOT EXISTS avatar_color TEXT,
    ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS favorite_games TEXT[] DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS activity_text TEXT,
    ADD COLUMN IF NOT EXISTS activity_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voice_intro_path TEXT;

-- Drop existing constraints if already defined to ensure idempotency
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_profile_bio_length;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_profile_pronouns_length;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_profile_custom_status_length;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_profile_custom_status_emoji_length;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_profile_banner_color_hex;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_profile_accent_color_hex;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_profile_avatar_color_hex;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_profile_activity_text_length;

ALTER TABLE public.profiles
    ADD CONSTRAINT check_profile_bio_length CHECK (bio IS NULL OR char_length(bio) <= 500),
    ADD CONSTRAINT check_profile_pronouns_length CHECK (pronouns IS NULL OR char_length(pronouns) <= 40),
    ADD CONSTRAINT check_profile_custom_status_length CHECK (custom_status IS NULL OR char_length(custom_status) <= 128),
    ADD CONSTRAINT check_profile_custom_status_emoji_length CHECK (custom_status_emoji IS NULL OR char_length(custom_status_emoji) <= 16),
    ADD CONSTRAINT check_profile_banner_color_hex CHECK (banner_color IS NULL OR banner_color ~* '^#[0-9a-f0-9]{6}$'),
    ADD CONSTRAINT check_profile_accent_color_hex CHECK (accent_color IS NULL OR accent_color ~* '^#[0-9a-f0-9]{6}$'),
    ADD CONSTRAINT check_profile_avatar_color_hex CHECK (avatar_color IS NULL OR avatar_color ~* '^#[0-9a-f0-9]{6}$'),
    ADD CONSTRAINT check_profile_activity_text_length CHECK (activity_text IS NULL OR char_length(activity_text) <= 128);


-- ------------------------------------------------------------------------------
-- 2. USER SETTINGS PRIVACY COLUMNS
-- ------------------------------------------------------------------------------

ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS check_profile_visibility;
ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS check_presence_visibility;
ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS check_activity_visibility;
ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS check_local_time_visibility;
ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS check_badges_visibility;

ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS activity_visibility TEXT DEFAULT 'friends',
    ADD COLUMN IF NOT EXISTS local_time_visibility TEXT DEFAULT 'friends',
    ADD COLUMN IF NOT EXISTS badges_visibility TEXT DEFAULT 'everyone';

ALTER TABLE public.user_settings
    ADD CONSTRAINT check_profile_visibility CHECK (profile_visibility IN ('everyone', 'friends', 'mutual_servers', 'nobody')),
    ADD CONSTRAINT check_presence_visibility CHECK (presence_visibility IN ('everyone', 'friends', 'mutual_servers', 'nobody')),
    ADD CONSTRAINT check_activity_visibility CHECK (activity_visibility IN ('everyone', 'friends', 'mutual_servers', 'nobody')),
    ADD CONSTRAINT check_local_time_visibility CHECK (local_time_visibility IN ('everyone', 'friends', 'mutual_servers', 'nobody')),
    ADD CONSTRAINT check_badges_visibility CHECK (badges_visibility IN ('everyone', 'friends', 'mutual_servers', 'nobody'));


-- ------------------------------------------------------------------------------
-- 3. PER-SERVER PROFILE COLUMNS ON SERVER_MEMBERS
-- ------------------------------------------------------------------------------

ALTER TABLE public.server_members
    ADD COLUMN IF NOT EXISTS nickname TEXT,
    ADD COLUMN IF NOT EXISTS avatar_path TEXT,
    ADD COLUMN IF NOT EXISTS banner_path TEXT,
    ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS pronouns TEXT,
    ADD COLUMN IF NOT EXISTS hide_server_avatar BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS hide_server_banner BOOLEAN DEFAULT false;

ALTER TABLE public.server_members DROP CONSTRAINT IF EXISTS check_member_nickname_length;
ALTER TABLE public.server_members DROP CONSTRAINT IF EXISTS check_member_bio_length;
ALTER TABLE public.server_members DROP CONSTRAINT IF EXISTS check_member_pronouns_length;

ALTER TABLE public.server_members
    ADD CONSTRAINT check_member_nickname_length CHECK (nickname IS NULL OR char_length(nickname) <= 32),
    ADD CONSTRAINT check_member_bio_length CHECK (bio IS NULL OR char_length(bio) <= 190),
    ADD CONSTRAINT check_member_pronouns_length CHECK (pronouns IS NULL OR char_length(pronouns) <= 40);


-- ------------------------------------------------------------------------------
-- 4. NEW TABLES: PROFILE_LINKS, BADGES, USER_BADGES, DECORATIONS, USERNAME_HISTORY
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profile_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT check_link_label_length CHECK (char_length(label) >= 1 AND char_length(label) <= 30),
    CONSTRAINT check_link_url_length CHECK (char_length(url) <= 200),
    CONSTRAINT check_link_url_https CHECK (url ~* '^https://'),
    CONSTRAINT check_link_position CHECK (position >= 0 AND position <= 4),
    CONSTRAINT unique_user_link_position UNIQUE (user_id, position)
);

ALTER TABLE public.profile_links ENABLE ROW LEVEL SECURITY;

-- Cap links at 5 per user trigger
CREATE OR REPLACE FUNCTION public.check_profile_link_cap()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT count(*) FROM public.profile_links WHERE user_id = NEW.user_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) >= 5 THEN
        RAISE EXCEPTION 'A profile cannot have more than 5 custom links.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_profile_link_cap ON public.profile_links;
CREATE TRIGGER trigger_check_profile_link_cap
    BEFORE INSERT ON public.profile_links
    FOR EACH ROW
    EXECUTE FUNCTION public.check_profile_link_cap();

-- Profile links RLS policies
DROP POLICY IF EXISTS "Users can manage their own profile links" ON public.profile_links;
CREATE POLICY "Users can manage their own profile links"
    ON public.profile_links FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Public can view permitted profile links" ON public.profile_links;
CREATE POLICY "Public can view permitted profile links"
    ON public.profile_links FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR NOT EXISTS (
            SELECT 1 FROM public.blocks b
            WHERE (b.blocker_id = auth.uid() AND b.blocked_id = profile_links.user_id)
               OR (b.blocker_id = profile_links.user_id AND b.blocked_id = auth.uid())
        )
    );

-- Catalog: Badges
CREATE TABLE IF NOT EXISTS public.badges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    category TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Badges catalog is viewable by authenticated users" ON public.badges;
CREATE POLICY "Badges catalog is viewable by authenticated users"
    ON public.badges FOR SELECT
    TO authenticated
    USING (true);

-- User Badges (granted by system/admin only)
CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    is_hidden BOOLEAN DEFAULT false,
    CONSTRAINT unique_user_badge UNIQUE (user_id, badge_id)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view user badges" ON public.user_badges;
CREATE POLICY "Users can view user badges"
    ON public.user_badges FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can toggle visibility of their own badges" ON public.user_badges;
CREATE POLICY "Users can toggle visibility of their own badges"
    ON public.user_badges FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Initial badges seed
INSERT INTO public.badges (id, name, description, category) VALUES
    ('founder', 'Founder', 'Early supporter and platform founder', 'system'),
    ('early_supporter', 'Early Supporter', 'Joined during early beta', 'system'),
    ('staff', 'Nexus Staff', 'Official platform staff member', 'system'),
    ('moderator', 'Moderator', 'Server moderation and community leader', 'system'),
    ('verified', 'Verified Identity', 'Verified account', 'system'),
    ('bug_hunter', 'Bug Hunter', 'Contributed to platform security and reliability', 'system')
ON CONFLICT (id) DO NOTHING;

-- Catalog: Profile Decorations (Avatar frames)
CREATE TABLE IF NOT EXISTS public.profile_decorations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    asset_url TEXT NOT NULL,
    is_animated BOOLEAN DEFAULT false,
    category TEXT DEFAULT 'standard',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profile_decorations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Decorations catalog is viewable by authenticated users" ON public.profile_decorations;
CREATE POLICY "Decorations catalog is viewable by authenticated users"
    ON public.profile_decorations FOR SELECT
    TO authenticated
    USING (true);

-- Initial decorations seed
INSERT INTO public.profile_decorations (id, name, asset_url, is_animated, category) VALUES
    ('neon_ring', 'Neon Glow', '/decorations/neon_ring.png', false, 'cyber'),
    ('cyber_matrix', 'Cyber Matrix', '/decorations/cyber_matrix.png', false, 'cyber'),
    ('fire_halo', 'Inferno Halo', '/decorations/fire_halo.png', false, 'fantasy'),
    ('sakura_frame', 'Sakura Blossoms', '/decorations/sakura_frame.png', false, 'nature'),
    ('cosmic_orbit', 'Cosmic Orbit', '/decorations/cosmic_orbit.png', true, 'cosmic')
ON CONFLICT (id) DO NOTHING;

-- Username History (audited renames)
CREATE TABLE IF NOT EXISTS public.username_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    old_username TEXT NOT NULL,
    new_username TEXT NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.username_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own username history" ON public.username_history;
CREATE POLICY "Users can view their own username history"
    ON public.username_history FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own username history" ON public.username_history;
CREATE POLICY "Users can insert their own username history"
    ON public.username_history FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());


-- ------------------------------------------------------------------------------
-- 5. INTEGRITY TRIGGERS ON PUBLIC.PROFILES
-- ------------------------------------------------------------------------------

-- Trigger 1: Immutable created_at and id
CREATE OR REPLACE FUNCTION public.enforce_profile_immutability()
RETURNS TRIGGER AS $$
BEGIN
    NEW.id = OLD.id;
    NEW.created_at = OLD.created_at;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_profile_immutability ON public.profiles;
CREATE TRIGGER trigger_enforce_profile_immutability
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_profile_immutability();

-- Trigger 2: Storage path prefix isolation for avatar_path and banner_path
CREATE OR REPLACE FUNCTION public.enforce_profile_storage_path_isolation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.avatar_path IS NOT NULL AND NEW.avatar_path <> '' THEN
        IF NOT (NEW.avatar_path LIKE NEW.id::text || '/%') THEN
            RAISE EXCEPTION 'avatar_path must start with the user ID folder';
        END IF;
    END IF;

    IF NEW.banner_path IS NOT NULL AND NEW.banner_path <> '' THEN
        IF NOT (NEW.banner_path LIKE NEW.id::text || '/%') THEN
            RAISE EXCEPTION 'banner_path must start with the user ID folder';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_profile_storage_path_isolation ON public.profiles;
CREATE TRIGGER trigger_profile_storage_path_isolation
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_profile_storage_path_isolation();

-- Trigger 3: Username cooldown, normalization & reserved names check
CREATE OR REPLACE FUNCTION public.enforce_profile_username_rules()
RETURNS TRIGGER AS $$
DECLARE
    v_reserved TEXT[] := ARRAY['admin', 'administrator', 'support', 'nexus', 'system', 'mod', 'moderator', 'staff', 'official', 'security', 'help', 'root', 'bot', 'everyone', 'here'];
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.username IS DISTINCT FROM OLD.username THEN
        -- Normalize username
        NEW.username := lower(trim(NEW.username));

        -- Validate format: 3-30 chars, alphanumeric + _ . -
        IF NEW.username !~ '^[a-z0-9_.-]{3,30}$' THEN
            RAISE EXCEPTION 'Username must be between 3 and 30 characters containing only letters, numbers, underscores, dots, or dashes.';
        END IF;

        -- Reserved names check
        IF NEW.username = ANY(v_reserved) THEN
            RAISE EXCEPTION 'The username "%" is reserved and cannot be claimed.', NEW.username;
        END IF;

        -- Cooldown: once per 30 days
        IF OLD.username_changed_at IS NOT NULL AND OLD.username_changed_at > (NOW() - INTERVAL '30 days') THEN
            RAISE EXCEPTION 'Username can only be changed once every 30 days. Next change available after %', (OLD.username_changed_at + INTERVAL '30 days');
        END IF;

        -- Log history
        INSERT INTO public.username_history (user_id, old_username, new_username, changed_at)
        VALUES (OLD.id, OLD.username, NEW.username, NOW());

        NEW.username_changed_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_profile_username_rules ON public.profiles;
CREATE TRIGGER trigger_profile_username_rules
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_profile_username_rules();


-- ------------------------------------------------------------------------------
-- 6. PER-SERVER MEMBER PROFILE RPC & MANAGEMENT
-- ------------------------------------------------------------------------------

-- Function to safely update member's own per-server profile without touching role
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

GRANT EXECUTE ON FUNCTION public.update_my_server_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ------------------------------------------------------------------------------
-- 7. READ PATH: LEAN PUBLIC VIEW & SECURE RPCS
-- ------------------------------------------------------------------------------

-- Helper: Check if two users have a mutual server
CREATE OR REPLACE FUNCTION public.users_share_server(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.server_members sm1
        JOIN public.server_members sm2 ON sm1.server_id = sm2.server_id
        WHERE sm1.user_id = p_user_a AND sm2.user_id = p_user_b
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: Check if two users are friends
CREATE OR REPLACE FUNCTION public.users_are_friends(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.friendships f
        WHERE (f.user_id = p_user_a AND f.friend_id = p_user_b)
           OR (f.user_id = p_user_b AND f.friend_id = p_user_a)
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: Check if a user is blocked by another
CREATE OR REPLACE FUNCTION public.users_are_blocked(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.blocks b
        WHERE (b.blocker_id = p_user_a AND b.blocked_id = p_user_b)
           OR (b.blocker_id = p_user_b AND b.blocked_id = p_user_a)
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- RPC 1: get_public_profiles (Lean representation for messages, member lists, and mentions)
CREATE OR REPLACE FUNCTION public.get_public_profiles(p_user_ids UUID[])
RETURNS TABLE (
    id UUID,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    avatar_path TEXT,
    avatar_color TEXT,
    decoration_id TEXT,
    status TEXT,
    custom_status TEXT,
    custom_status_emoji TEXT
) AS $$
DECLARE
    v_viewer_id UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.username,
        p.display_name,
        p.avatar_url,
        p.avatar_path,
        p.avatar_color,
        p.decoration_id,
        CASE 
            WHEN v_viewer_id IS NOT NULL AND p.id = v_viewer_id THEN p.status::text
            WHEN public.users_are_blocked(COALESCE(v_viewer_id, '00000000-0000-0000-0000-000000000000'::uuid), p.id) THEN 'offline'::text
            WHEN COALESCE(s.presence_visibility, 'friends') = 'nobody' THEN 'offline'::text
            WHEN COALESCE(s.presence_visibility, 'friends') = 'everyone' THEN p.status::text
            WHEN COALESCE(s.presence_visibility, 'friends') = 'friends' AND public.users_are_friends(v_viewer_id, p.id) THEN p.status::text
            WHEN COALESCE(s.presence_visibility, 'friends') = 'mutual_servers' AND (public.users_are_friends(v_viewer_id, p.id) OR public.users_share_server(v_viewer_id, p.id)) THEN p.status::text
            ELSE 'offline'::text
        END AS status,
        CASE
            WHEN v_viewer_id IS NOT NULL AND p.id = v_viewer_id THEN 
                CASE WHEN p.custom_status_expires_at IS NULL OR p.custom_status_expires_at > NOW() THEN p.custom_status ELSE NULL END
            WHEN public.users_are_blocked(COALESCE(v_viewer_id, '00000000-0000-0000-0000-000000000000'::uuid), p.id) THEN NULL
            WHEN COALESCE(s.presence_visibility, 'friends') = 'nobody' THEN NULL
            WHEN (p.custom_status_expires_at IS NOT NULL AND p.custom_status_expires_at <= NOW()) THEN NULL
            WHEN COALESCE(s.presence_visibility, 'friends') = 'everyone' THEN p.custom_status
            WHEN COALESCE(s.presence_visibility, 'friends') = 'friends' AND public.users_are_friends(v_viewer_id, p.id) THEN p.custom_status
            WHEN COALESCE(s.presence_visibility, 'friends') = 'mutual_servers' AND (public.users_are_friends(v_viewer_id, p.id) OR public.users_share_server(v_viewer_id, p.id)) THEN p.custom_status
            ELSE NULL
        END AS custom_status,
        CASE
            WHEN v_viewer_id IS NOT NULL AND p.id = v_viewer_id THEN 
                CASE WHEN p.custom_status_expires_at IS NULL OR p.custom_status_expires_at > NOW() THEN p.custom_status_emoji ELSE NULL END
            WHEN public.users_are_blocked(COALESCE(v_viewer_id, '00000000-0000-0000-0000-000000000000'::uuid), p.id) THEN NULL
            WHEN COALESCE(s.presence_visibility, 'friends') = 'nobody' THEN NULL
            WHEN (p.custom_status_expires_at IS NOT NULL AND p.custom_status_expires_at <= NOW()) THEN NULL
            WHEN COALESCE(s.presence_visibility, 'friends') = 'everyone' THEN p.custom_status_emoji
            WHEN COALESCE(s.presence_visibility, 'friends') = 'friends' AND public.users_are_friends(v_viewer_id, p.id) THEN p.custom_status_emoji
            WHEN COALESCE(s.presence_visibility, 'friends') = 'mutual_servers' AND (public.users_are_friends(v_viewer_id, p.id) OR public.users_share_server(v_viewer_id, p.id)) THEN p.custom_status_emoji
            ELSE NULL
        END AS custom_status_emoji
    FROM public.profiles p
    LEFT JOIN public.user_settings s ON s.user_id = p.id
    WHERE p.id = ANY(p_user_ids);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- RPC 2: get_profile_card (Full rich profile for modal/popover with server resolution and privacy gating)
CREATE OR REPLACE FUNCTION public.get_profile_card(p_user_id UUID, p_server_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    avatar_path TEXT,
    avatar_color TEXT,
    banner_url TEXT,
    banner_path TEXT,
    banner_color TEXT,
    accent_color TEXT,
    profile_theme JSONB,
    decoration_id TEXT,
    bio TEXT,
    pronouns TEXT,
    timezone TEXT,
    status TEXT,
    custom_status TEXT,
    custom_status_emoji TEXT,
    activity_text TEXT,
    favorite_games TEXT[],
    created_at TIMESTAMPTZ,
    server_nickname TEXT,
    server_avatar_path TEXT,
    server_banner_path TEXT,
    server_bio TEXT,
    server_pronouns TEXT,
    server_role TEXT,
    server_joined_at TIMESTAMPTZ,
    effective_display_name TEXT,
    effective_avatar_path TEXT,
    effective_banner_path TEXT,
    effective_bio TEXT,
    effective_pronouns TEXT,
    is_friend BOOLEAN,
    is_blocked BOOLEAN,
    is_self BOOLEAN,
    mutual_servers_count BIGINT,
    mutual_friends_count BIGINT
) AS $$
DECLARE
    v_viewer_id UUID := auth.uid();
    v_is_self BOOLEAN := (v_viewer_id IS NOT NULL AND v_viewer_id = p_user_id);
    v_is_friend BOOLEAN := false;
    v_is_blocked BOOLEAN := false;
    v_share_server BOOLEAN := false;
    v_prof_vis TEXT := 'mutual_servers';
    v_pres_vis TEXT := 'friends';
    v_act_vis TEXT := 'friends';
    v_time_vis TEXT := 'friends';
    v_details_allowed BOOLEAN := false;
    v_presence_allowed BOOLEAN := false;
    v_activity_allowed BOOLEAN := false;
    v_time_allowed BOOLEAN := false;
BEGIN
    -- Determine relational context
    IF v_viewer_id IS NOT NULL THEN
        v_is_blocked := public.users_are_blocked(v_viewer_id, p_user_id);
        IF NOT v_is_self THEN
            v_is_friend := public.users_are_friends(v_viewer_id, p_user_id);
            v_share_server := public.users_share_server(v_viewer_id, p_user_id);
        END IF;
    END IF;

    -- Fetch settings audience preferences
    SELECT 
        COALESCE(s.profile_visibility, 'mutual_servers'),
        COALESCE(s.presence_visibility, 'friends'),
        COALESCE(s.activity_visibility, 'friends'),
        COALESCE(s.local_time_visibility, 'friends')
    INTO v_prof_vis, v_pres_vis, v_act_vis, v_time_vis
    FROM public.user_settings s
    WHERE s.user_id = p_user_id;

    -- Compute permissions per field
    IF v_is_self THEN
        v_details_allowed := true;
        v_presence_allowed := true;
        v_activity_allowed := true;
        v_time_allowed := true;
    ELSIF v_is_blocked THEN
        v_details_allowed := false;
        v_presence_allowed := false;
        v_activity_allowed := false;
        v_time_allowed := false;
    ELSE
        -- Profile details (bio, pronouns, banner)
        v_details_allowed := (v_prof_vis = 'everyone')
            OR (v_prof_vis = 'mutual_servers' AND (v_is_friend OR v_share_server))
            OR (v_prof_vis = 'friends' AND v_is_friend);

        -- Presence & custom status
        v_presence_allowed := (v_pres_vis = 'everyone')
            OR (v_pres_vis = 'mutual_servers' AND (v_is_friend OR v_share_server))
            OR (v_pres_vis = 'friends' AND v_is_friend);

        -- Activity
        v_activity_allowed := (v_act_vis = 'everyone')
            OR (v_act_vis = 'mutual_servers' AND (v_is_friend OR v_share_server))
            OR (v_act_vis = 'friends' AND v_is_friend);

        -- Local time
        v_time_allowed := (v_time_vis = 'everyone')
            OR (v_time_vis = 'mutual_servers' AND (v_is_friend OR v_share_server))
            OR (v_time_vis = 'friends' AND v_is_friend);
    END IF;

    RETURN QUERY
    WITH s_member AS (
        SELECT 
            sm.nickname,
            CASE WHEN sm.hide_server_avatar THEN NULL ELSE sm.avatar_path END AS avatar_path,
            CASE WHEN sm.hide_server_banner THEN NULL ELSE sm.banner_path END AS banner_path,
            sm.bio,
            sm.pronouns,
            sm.role::text AS role,
            sm.joined_at
        FROM public.server_members sm
        WHERE sm.user_id = p_user_id AND p_server_id IS NOT NULL AND sm.server_id = p_server_id
        LIMIT 1
    ),
    mutual_s AS (
        SELECT count(*)::bigint AS cnt
        FROM public.server_members sm1
        JOIN public.server_members sm2 ON sm1.server_id = sm2.server_id
        WHERE v_viewer_id IS NOT NULL AND sm1.user_id = v_viewer_id AND sm2.user_id = p_user_id
    ),
    mutual_f AS (
        SELECT count(*)::bigint AS cnt
        FROM public.friendships f1
        JOIN public.friendships f2 ON f1.friend_id = f2.friend_id
        WHERE v_viewer_id IS NOT NULL AND f1.user_id = v_viewer_id AND f2.user_id = p_user_id
    )
    SELECT 
        p.id,
        p.username,
        p.display_name,
        p.avatar_url,
        p.avatar_path,
        p.avatar_color,
        CASE WHEN v_details_allowed THEN p.banner_url ELSE NULL END AS banner_url,
        CASE WHEN v_details_allowed THEN p.banner_path ELSE NULL END AS banner_path,
        CASE WHEN v_details_allowed THEN p.banner_color ELSE NULL END AS banner_color,
        CASE WHEN v_details_allowed THEN p.accent_color ELSE NULL END AS accent_color,
        CASE WHEN v_details_allowed THEN p.profile_theme ELSE NULL END AS profile_theme,
        p.decoration_id,
        CASE WHEN v_details_allowed THEN p.bio ELSE NULL END AS bio,
        CASE WHEN v_details_allowed THEN p.pronouns ELSE NULL END AS pronouns,
        CASE WHEN v_time_allowed THEN p.timezone ELSE NULL END AS timezone,
        CASE WHEN v_presence_allowed THEN p.status::text ELSE 'offline'::text END AS status,
        CASE 
            WHEN v_presence_allowed AND (p.custom_status_expires_at IS NULL OR p.custom_status_expires_at > NOW()) 
            THEN p.custom_status ELSE NULL 
        END AS custom_status,
        CASE 
            WHEN v_presence_allowed AND (p.custom_status_expires_at IS NULL OR p.custom_status_expires_at > NOW()) 
            THEN p.custom_status_emoji ELSE NULL 
        END AS custom_status_emoji,
        CASE 
            WHEN v_activity_allowed AND (p.activity_expires_at IS NULL OR p.activity_expires_at > NOW()) 
            THEN p.activity_text ELSE NULL 
        END AS activity_text,
        CASE WHEN v_details_allowed THEN p.favorite_games ELSE '{}'::text[] END AS favorite_games,
        p.created_at,
        sm.nickname AS server_nickname,
        sm.avatar_path AS server_avatar_path,
        sm.banner_path AS server_banner_path,
        sm.bio AS server_bio,
        sm.pronouns AS server_pronouns,
        sm.role AS server_role,
        sm.joined_at AS server_joined_at,
        COALESCE(sm.nickname, p.display_name) AS effective_display_name,
        COALESCE(sm.avatar_path, p.avatar_path) AS effective_avatar_path,
        COALESCE(sm.banner_path, CASE WHEN v_details_allowed THEN p.banner_path ELSE NULL END) AS effective_banner_path,
        COALESCE(sm.bio, CASE WHEN v_details_allowed THEN p.bio ELSE NULL END) AS effective_bio,
        COALESCE(sm.pronouns, CASE WHEN v_details_allowed THEN p.pronouns ELSE NULL END) AS effective_pronouns,
        v_is_friend,
        v_is_blocked,
        v_is_self,
        COALESCE((SELECT cnt FROM mutual_s), 0::bigint) AS mutual_servers_count,
        COALESCE((SELECT cnt FROM mutual_f), 0::bigint) AS mutual_friends_count
    FROM public.profiles p
    LEFT JOIN s_member sm ON true
    WHERE p.id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- RPC 3: check_username_available
CREATE OR REPLACE FUNCTION public.check_username_available(p_username TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_normalized TEXT := lower(trim(p_username));
    v_reserved TEXT[] := ARRAY['admin', 'administrator', 'support', 'nexus', 'system', 'mod', 'moderator', 'staff', 'official', 'security', 'help', 'root', 'bot', 'everyone', 'here'];
BEGIN
    IF v_normalized !~ '^[a-z0-9_.-]{3,30}$' THEN
        RETURN false;
    END IF;

    IF v_normalized = ANY(v_reserved) THEN
        RETURN false;
    END IF;

    RETURN NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE lower(username) = v_normalized AND id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- RPC 4: change_username
CREATE OR REPLACE FUNCTION public.change_username(p_new_username TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_caller_id UUID := auth.uid();
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE public.profiles
    SET username = p_new_username
    WHERE id = v_caller_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 5: set_custom_status
CREATE OR REPLACE FUNCTION public.set_custom_status(
    p_emoji TEXT,
    p_text TEXT,
    p_duration_minutes INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_expires_at TIMESTAMPTZ := NULL;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_duration_minutes IS NOT NULL AND p_duration_minutes > 0 THEN
        v_expires_at := NOW() + (p_duration_minutes || ' minutes')::interval;
    END IF;

    UPDATE public.profiles
    SET 
        custom_status = NULLIF(trim(p_text), ''),
        custom_status_emoji = NULLIF(trim(p_emoji), ''),
        custom_status_expires_at = v_expires_at
    WHERE id = v_caller_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 6: set_activity
CREATE OR REPLACE FUNCTION public.set_activity(
    p_activity_text TEXT,
    p_duration_minutes INTEGER DEFAULT 120
)
RETURNS BOOLEAN AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_expires_at TIMESTAMPTZ := NULL;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_activity_text IS NOT NULL AND trim(p_activity_text) <> '' THEN
        v_expires_at := NOW() + (COALESCE(p_duration_minutes, 120) || ' minutes')::interval;
    END IF;

    UPDATE public.profiles
    SET 
        activity_text = NULLIF(trim(p_activity_text), ''),
        activity_expires_at = v_expires_at
    WHERE id = v_caller_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 7: set_member_nickname (Audited moderator tool)
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
    v_server_owner UUID;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Get server owner
    SELECT owner_id INTO v_server_owner FROM public.servers WHERE id = p_server_id;
    IF v_server_owner IS NULL THEN
        RAISE EXCEPTION 'Server not found';
    END IF;

    -- Self-nickname change
    IF v_caller_id = p_target_user_id THEN
        UPDATE public.server_members
        SET nickname = NULLIF(trim(p_nickname), '')
        WHERE server_id = p_server_id AND user_id = v_caller_id;
        RETURN true;
    END IF;

    -- Moderator nickname change
    SELECT role INTO v_caller_role FROM public.server_members WHERE server_id = p_server_id AND user_id = v_caller_id;
    SELECT role INTO v_target_role FROM public.server_members WHERE server_id = p_server_id AND user_id = p_target_user_id;

    IF v_caller_role NOT IN ('owner', 'admin') AND v_caller_id <> v_server_owner THEN
        RAISE EXCEPTION 'Insufficient permissions to change member nickname';
    END IF;

    -- Hierarchy check: admin cannot rename owner or fellow admin unless owner
    IF v_caller_id <> v_server_owner AND (v_target_role IN ('owner', 'admin') OR p_target_user_id = v_server_owner) THEN
        RAISE EXCEPTION 'Cannot change nickname of a member with equal or higher role';
    END IF;

    UPDATE public.server_members
    SET nickname = NULLIF(trim(p_nickname), '')
    WHERE server_id = p_server_id AND user_id = p_target_user_id;

    -- Audit log
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_moderation_audit') THEN
        PERFORM public.log_moderation_audit(
            p_server_id,
            p_target_user_id,
            'change_nickname',
            'Changed nickname to ' || COALESCE(p_nickname, '[reset]'),
            jsonb_build_object('new_nickname', p_nickname, 'moderator_id', v_caller_id)
        );
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- 8. NARROW PUBLIC.PROFILES DIRECT SELECT POLICY
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles privacy policy" ON public.profiles;

CREATE POLICY "Profiles privacy policy"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (
        id = auth.uid()
        OR (
            -- Neither user is blocked
            NOT EXISTS (
                SELECT 1 FROM public.blocks b
                WHERE (b.blocker_id = auth.uid() AND b.blocked_id = profiles.id)
                   OR (b.blocker_id = profiles.id AND b.blocked_id = auth.uid())
            )
            AND (
                -- Everyone
                EXISTS (
                    SELECT 1 FROM public.user_settings s
                    WHERE s.user_id = profiles.id AND s.profile_visibility = 'everyone'
                )
                -- Friends
                OR (
                    EXISTS (
                        SELECT 1 FROM public.user_settings s
                        WHERE s.user_id = profiles.id AND s.profile_visibility = 'friends'
                    )
                    AND public.users_are_friends(auth.uid(), profiles.id)
                )
                -- Mutual servers or friends
                OR (
                    EXISTS (
                        SELECT 1 FROM public.user_settings s
                        WHERE s.user_id = profiles.id AND s.profile_visibility = 'mutual_servers'
                    )
                    AND (public.users_are_friends(auth.uid(), profiles.id) OR public.users_share_server(auth.uid(), profiles.id))
                )
            )
        )
    );

-- Grants
GRANT EXECUTE ON FUNCTION public.get_public_profiles(UUID[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_card(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_username_available(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.change_username(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_custom_status(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_activity(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_nickname(UUID, UUID, TEXT) TO authenticated;
