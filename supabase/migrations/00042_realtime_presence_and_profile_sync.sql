-- ==============================================================================
-- Migration: 00042_realtime_presence_and_profile_sync.sql
-- Description:
--   1. Authorize 'nexus-global-presence', 'conversations-realtime', and 'nexus-social-db'
--      in realtime_topic_authorized_select and realtime_topic_authorized_insert.
--   2. Strengthen public.profiles SELECT policy with COALESCE for default visibility
--      so Realtime postgres_changes can deliver profile/status updates to peers.
--   3. Update get_profile_card_view and get_profile_card with COALESCE default 'mutual_servers'
--      for presence_visibility so mutual server members see live presence by default.
--   4. Reload PostgREST schema cache.
-- ==============================================================================

-- 1. Update Realtime SELECT topic authorization
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

    -- Global platform channels: global presence, social, conversations
    IF clean_topic IN ('nexus-global-presence', 'conversations-realtime', 'nexus-social-db') THEN
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

-- 2. Update Realtime INSERT topic authorization
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

    -- Global presence channel: authenticated users can broadcast presence
    IF clean_topic IN ('nexus-global-presence', 'nexus-social-db', 'conversations-realtime') THEN
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

-- 3. Robust public.profiles SELECT RLS Policy with default visibility
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
                -- Everyone (or default when settings row not yet created)
                COALESCE((SELECT profile_visibility FROM public.user_settings WHERE user_id = profiles.id), 'mutual_servers') = 'everyone'
                -- Friends
                OR (
                    COALESCE((SELECT profile_visibility FROM public.user_settings WHERE user_id = profiles.id), 'mutual_servers') = 'friends'
                    AND public.users_are_friends(auth.uid(), profiles.id)
                )
                -- Mutual servers or friends
                OR (
                    COALESCE((SELECT profile_visibility FROM public.user_settings WHERE user_id = profiles.id), 'mutual_servers') = 'mutual_servers'
                    AND (public.users_are_friends(auth.uid(), profiles.id) OR public.users_share_server(auth.uid(), profiles.id))
                )
            )
        )
    );

-- 4. Update get_profile_card_view to default presence_visibility to mutual_servers
CREATE OR REPLACE FUNCTION public.get_profile_card_view(p_user_ids UUID[])
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
            WHEN COALESCE(s.presence_visibility, 'mutual_servers') = 'nobody' THEN 'offline'::text
            WHEN COALESCE(s.presence_visibility, 'mutual_servers') = 'everyone' THEN p.status::text
            WHEN COALESCE(s.presence_visibility, 'mutual_servers') = 'friends' AND public.users_are_friends(v_viewer_id, p.id) THEN p.status::text
            WHEN COALESCE(s.presence_visibility, 'mutual_servers') = 'mutual_servers' AND (public.users_are_friends(v_viewer_id, p.id) OR public.users_share_server(v_viewer_id, p.id)) THEN p.status::text
            ELSE 'offline'::text
        END AS status,
        CASE
            WHEN v_viewer_id IS NOT NULL AND p.id = v_viewer_id THEN 
                CASE WHEN p.custom_status_expires_at IS NULL OR p.custom_status_expires_at > NOW() THEN p.custom_status ELSE NULL END
            WHEN public.users_are_blocked(COALESCE(v_viewer_id, '00000000-0000-0000-0000-000000000000'::uuid), p.id) THEN NULL
            WHEN COALESCE(s.presence_visibility, 'mutual_servers') = 'nobody' THEN NULL
            WHEN (p.custom_status_expires_at IS NOT NULL AND p.custom_status_expires_at <= NOW()) THEN NULL
            WHEN COALESCE(s.presence_visibility, 'mutual_servers') = 'everyone' THEN p.custom_status
            WHEN COALESCE(s.presence_visibility, 'mutual_servers') = 'friends' AND public.users_are_friends(v_viewer_id, p.id) THEN p.custom_status
            WHEN COALESCE(s.presence_visibility, 'mutual_servers') = 'mutual_servers' AND (public.users_are_friends(v_viewer_id, p.id) OR public.users_share_server(v_viewer_id, p.id)) THEN p.custom_status
            ELSE NULL
        END AS custom_status,
        CASE
            WHEN v_viewer_id IS NOT NULL AND p.id = v_viewer_id THEN 
                CASE WHEN p.custom_status_expires_at IS NULL OR p.custom_status_expires_at > NOW() THEN p.custom_status_emoji ELSE NULL END
            WHEN public.users_are_blocked(COALESCE(v_viewer_id, '00000000-0000-0000-0000-000000000000'::uuid), p.id) THEN NULL
            WHEN COALESCE(s.presence_visibility, 'mutual_servers') = 'nobody' THEN NULL
            WHEN (p.custom_status_expires_at IS NOT NULL AND p.custom_status_expires_at <= NOW()) THEN NULL
            WHEN COALESCE(s.presence_visibility, 'mutual_servers') = 'everyone' THEN p.custom_status_emoji
            WHEN COALESCE(s.presence_visibility, 'mutual_servers') = 'friends' AND public.users_are_friends(v_viewer_id, p.id) THEN p.custom_status_emoji
            WHEN COALESCE(s.presence_visibility, 'mutual_servers') = 'mutual_servers' AND (public.users_are_friends(v_viewer_id, p.id) OR public.users_share_server(v_viewer_id, p.id)) THEN p.custom_status_emoji
            ELSE NULL
        END AS custom_status_emoji
    FROM public.profiles p
    LEFT JOIN public.user_settings s ON s.user_id = p.id
    WHERE p.id = ANY(p_user_ids);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_profile_card_view(UUID[]) TO authenticated, anon, service_role;

-- 5. Update get_profile_card to default presence_visibility to mutual_servers
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
    v_pres_vis TEXT := 'mutual_servers';
    v_act_vis TEXT := 'mutual_servers';
    v_time_vis TEXT := 'mutual_servers';
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
        COALESCE(s.presence_visibility, 'mutual_servers'),
        COALESCE(s.activity_visibility, 'mutual_servers'),
        COALESCE(s.local_time_visibility, 'mutual_servers')
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

GRANT EXECUTE ON FUNCTION public.get_profile_card(UUID, UUID) TO authenticated, anon, service_role;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
