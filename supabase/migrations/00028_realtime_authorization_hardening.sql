-- Migration: 00028_realtime_authorization_hardening.sql
-- Description:
-- 1. Split realtime authorization for SELECT (listen) and INSERT (broadcast) (R1)
--    - SELECT: Only target user can listen to user-signals-<id>
--    - INSERT: Sender can only signal target if not blocked, DM privacy allows, and relationship exists
-- 2. Remove blanket TRUE results for system, social, and voice_room_* (R2)
-- 3. Scope presence to friends and shared servers (R3)
-- 4. Fail loudly without blanket EXCEPTION WHEN OTHERS THEN NULL (R5)
-- 5. Anchor regexes at both ends (^...$) and enforce exact topic grammar (R6)
-- 6. Enforce blocks, DM privacy, and calling rate limit on call_sessions inserts (L6)
-- 7. Account deletion safety: transfer server ownership, tombstone messages, delete storage objects (L1)

-- ------------------------------------------------------------------------------
-- 1. REALTIME SIGNALING & DM PERMISSION FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_user_signal_target(p_sender_id UUID, p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy TEXT;
BEGIN
    IF p_sender_id IS NULL OR p_target_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Self-signaling is allowed (e.g. multi-tab sync)
    IF p_sender_id = p_target_id THEN
        RETURN TRUE;
    END IF;

    -- Check bidirectional blocks
    IF EXISTS (
        SELECT 1 FROM public.blocks
        WHERE (blocker_id = p_sender_id AND blocked_id = p_target_id)
           OR (blocker_id = p_target_id AND blocked_id = p_sender_id)
    ) THEN
        RETURN FALSE;
    END IF;

    -- Check recipient DM privacy settings
    SELECT allow_direct_messages INTO v_policy
    FROM public.user_settings
    WHERE user_id = p_target_id;

    IF v_policy = 'none' THEN
        RETURN FALSE;
    ELSIF v_policy = 'friends' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.friendships
            WHERE (user_id = p_sender_id AND friend_id = p_target_id)
               OR (user_id = p_target_id AND friend_id = p_sender_id)
        ) THEN
            RETURN FALSE;
        END IF;
    END IF;

    -- Must share a conversation, friendship, or server
    RETURN EXISTS (
        SELECT 1 FROM public.conversation_members cm1
        JOIN public.conversation_members cm2 ON cm2.conversation_id = cm1.conversation_id
        WHERE cm1.user_id = p_sender_id AND cm2.user_id = p_target_id
    ) OR EXISTS (
        SELECT 1 FROM public.friendships
        WHERE (user_id = p_sender_id AND friend_id = p_target_id)
           OR (user_id = p_target_id AND friend_id = p_sender_id)
    ) OR EXISTS (
        SELECT 1 FROM public.server_members sm1
        JOIN public.server_members sm2 ON sm2.server_id = sm1.server_id
        WHERE sm1.user_id = p_sender_id AND sm2.user_id = p_target_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_user_signal_target(UUID, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. HARDENED REALTIME SELECT AUTHORIZATION (R1, R2, R3, R6)
-- ------------------------------------------------------------------------------
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

    -- 1. User signaling inboxes (R1): Only the owner can LISTEN to their own incoming signals
    IF clean_topic ~* '^user-signals-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        sub_matches := regexp_match(clean_topic, '^user-signals-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$', 'i');
        matched_id := sub_matches[1]::uuid;
        RETURN p_user_id = matched_id;
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

-- ------------------------------------------------------------------------------
-- 3. HARDENED REALTIME INSERT AUTHORIZATION (R1, R2, R3, R6)
-- ------------------------------------------------------------------------------
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

    -- 1. User signaling inboxes (R1): Sender can only broadcast to target if permitted (not blocked, respects privacy)
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

-- Backward compatible alias for any legacy call
CREATE OR REPLACE FUNCTION public.realtime_topic_authorized(p_topic TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.realtime_topic_authorized_select(p_topic, p_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.realtime_topic_authorized(TEXT, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. ATTACH POLICIES ON realtime.messages (R5 - FAILS LOUDLY)
-- ------------------------------------------------------------------------------
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
            public.realtime_topic_authorized_select(COALESCE(realtime.topic(), topic), auth.uid())
        );

        CREATE POLICY "realtime_messages_insert_authorized"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
            public.realtime_topic_authorized_insert(COALESCE(realtime.topic(), topic), auth.uid())
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. CALL ABUSE & CALL RATE LIMITING TRIGGER (L6)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_check_call_session_privacy_and_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conv_type TEXT;
    v_recipient_id UUID;
    v_policy TEXT;
    v_recent_calls INT;
BEGIN
    -- Only caller can create call session for themselves
    IF NEW.caller_id <> auth.uid() THEN
        RAISE EXCEPTION 'Caller ID must match authenticated user';
    END IF;

    -- Rate limit: Maximum 3 call sessions per minute per caller
    SELECT COUNT(*) INTO v_recent_calls
    FROM public.call_sessions
    WHERE caller_id = NEW.caller_id
      AND started_at > NOW() - INTERVAL '1 minute';

    IF v_recent_calls >= 3 THEN
        RAISE EXCEPTION 'Calling rate limit exceeded. Please wait a moment before trying again.';
    END IF;

    -- If 1-on-1 direct conversation, enforce block list and DM privacy
    IF NEW.conversation_id IS NOT NULL THEN
        SELECT type::text INTO v_conv_type
        FROM public.conversations
        WHERE id = NEW.conversation_id;

        IF v_conv_type = 'direct' THEN
            SELECT user_id INTO v_recipient_id
            FROM public.conversation_members
            WHERE conversation_id = NEW.conversation_id
              AND user_id <> NEW.caller_id
            LIMIT 1;

            IF v_recipient_id IS NOT NULL THEN
                -- Check bidirectional block
                IF EXISTS (
                    SELECT 1 FROM public.blocks
                    WHERE (blocker_id = NEW.caller_id AND blocked_id = v_recipient_id)
                       OR (blocker_id = v_recipient_id AND blocked_id = NEW.caller_id)
                ) THEN
                    RAISE EXCEPTION 'Cannot call this user (blocked)';
                END IF;

                -- Check DM privacy
                SELECT allow_direct_messages INTO v_policy
                FROM public.user_settings
                WHERE user_id = v_recipient_id;

                IF v_policy = 'none' THEN
                    RAISE EXCEPTION 'Recipient does not accept incoming calls';
                ELSIF v_policy = 'friends' THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM public.friendships
                        WHERE (user_id = NEW.caller_id AND friend_id = v_recipient_id)
                           OR (user_id = v_recipient_id AND friend_id = NEW.caller_id)
                    ) THEN
                        RAISE EXCEPTION 'Recipient only accepts incoming calls from friends';
                    END IF;
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_call_session_privacy ON public.call_sessions;
CREATE TRIGGER trg_check_call_session_privacy
    BEFORE INSERT ON public.call_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_check_call_session_privacy_and_rate_limit();

-- ------------------------------------------------------------------------------
-- 6. ACCOUNT DELETION SAFETY & DATA INTEGRITY (L1)
-- ------------------------------------------------------------------------------
-- Allow sender_id to be nullable so deleting an account does not destroy message history
ALTER TABLE public.messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.channel_messages ALTER COLUMN user_id DROP NOT NULL;

-- Replace ON DELETE CASCADE with ON DELETE SET NULL for messages
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.channel_messages DROP CONSTRAINT IF EXISTS channel_messages_user_id_fkey;
ALTER TABLE public.channel_messages ADD CONSTRAINT channel_messages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Allow atomic server ownership transfer without hitting the circular trigger catch-22
CREATE OR REPLACE FUNCTION public.check_server_member_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_server_owner UUID;
    v_caller UUID := auth.uid();
    v_is_owner BOOLEAN;
    v_is_admin BOOLEAN;
    v_owner_count INT;
BEGIN
    IF current_setting('nexus.in_transfer_server_ownership', true) = 'on' THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    SELECT owner_id INTO v_server_owner FROM public.servers WHERE id = OLD.server_id;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.server_id <> OLD.server_id THEN
            RAISE EXCEPTION 'Cannot transfer membership to a different server';
        END IF;
        IF NEW.user_id <> OLD.user_id THEN
            RAISE EXCEPTION 'Cannot transfer membership to a different user';
        END IF;

        IF NEW.role IS DISTINCT FROM OLD.role THEN
            IF v_caller IS NOT NULL THEN
                v_is_owner := (v_caller = v_server_owner) OR public.is_server_owner(OLD.server_id, v_caller);
                v_is_admin := public.is_server_admin(OLD.server_id, v_caller);

                IF NOT (v_is_owner OR v_is_admin) THEN
                    RAISE EXCEPTION 'Only server owners or admins can modify member roles';
                END IF;

                IF NOT v_is_owner AND v_caller = OLD.user_id THEN
                    RAISE EXCEPTION 'Admins cannot change their own role';
                END IF;

                IF NOT v_is_owner AND (OLD.role = 'owner' OR OLD.user_id = v_server_owner) THEN
                    RAISE EXCEPTION 'Admins cannot modify owner roles';
                END IF;

                IF NEW.role = 'owner' AND NOT v_is_owner THEN
                    RAISE EXCEPTION 'Only server owner can grant owner role';
                END IF;

                IF NOT v_is_owner AND NEW.role NOT IN ('member', 'moderator', 'admin') THEN
                    RAISE EXCEPTION 'Admins cannot grant unauthorized role';
                END IF;
            END IF;

            IF (OLD.role = 'owner' OR OLD.user_id = v_server_owner) AND NEW.role <> 'owner' THEN
                IF OLD.user_id = v_server_owner THEN
                    RAISE EXCEPTION 'Cannot demote server owner. Transfer ownership first.';
                END IF;

                SELECT COUNT(*) INTO v_owner_count
                FROM public.server_members
                WHERE server_id = OLD.server_id AND role = 'owner';

                IF v_owner_count <= 1 THEN
                    RAISE EXCEPTION 'Cannot demote the last owner of a server';
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF v_server_owner = OLD.user_id THEN
            RAISE EXCEPTION 'Cannot delete server owner membership. Transfer ownership first.';
        END IF;

        IF v_caller IS NOT NULL THEN
            v_is_owner := (v_caller = v_server_owner) OR public.is_server_owner(OLD.server_id, v_caller);
            IF NOT v_is_owner AND (OLD.role = 'owner' OR OLD.user_id = v_server_owner) THEN
                RAISE EXCEPTION 'Admins cannot remove server owners';
            END IF;
        END IF;

        IF OLD.role = 'owner' THEN
            SELECT COUNT(*) INTO v_owner_count
            FROM public.server_members
            WHERE server_id = OLD.server_id AND role = 'owner';

            IF v_owner_count <= 1 THEN
                RAISE EXCEPTION 'Cannot delete the last owner of a server';
            END IF;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_server_ownership(
    p_server_id UUID,
    p_new_owner_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_current_owner_id UUID;
    v_is_target_member BOOLEAN;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to transfer server ownership';
    END IF;

    SELECT owner_id INTO v_current_owner_id
    FROM public.servers
    WHERE id = p_server_id;

    IF v_current_owner_id IS NULL THEN
        RAISE EXCEPTION 'Server not found';
    END IF;

    IF v_current_owner_id <> v_caller_id THEN
        RAISE EXCEPTION 'Only the authoritative server owner can transfer ownership';
    END IF;

    IF p_new_owner_id = v_caller_id THEN
        RETURN TRUE;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.server_members
        WHERE server_id = p_server_id AND user_id = p_new_owner_id
    ) INTO v_is_target_member;

    IF NOT v_is_target_member THEN
        RAISE EXCEPTION 'Target user must be a member of the server to receive ownership';
    END IF;

    PERFORM set_config('nexus.in_transfer_server_ownership', 'on', true);

    UPDATE public.server_members
    SET role = 'owner'
    WHERE server_id = p_server_id AND user_id = p_new_owner_id;

    UPDATE public.servers
    SET owner_id = p_new_owner_id
    WHERE id = p_server_id;

    UPDATE public.server_members
    SET role = 'admin'
    WHERE server_id = p_server_id AND user_id = v_caller_id;

    PERFORM set_config('nexus.in_transfer_server_ownership', 'off', true);

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_conversation_members_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_is_owner BOOLEAN;
    v_is_admin BOOLEAN;
    v_owner_count INT;
BEGIN
    IF current_setting('nexus.in_user_deletion', true) = 'on' THEN
        IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
            UPDATE public.conversation_members
            SET role = 'owner'
            WHERE conversation_id = OLD.conversation_id
              AND user_id <> OLD.user_id
              AND user_id = (
                SELECT user_id FROM public.conversation_members
                WHERE conversation_id = OLD.conversation_id AND user_id <> OLD.user_id
                ORDER BY joined_at ASC LIMIT 1
              );
        END IF;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.id <> OLD.id THEN
            RAISE EXCEPTION 'conversation_members.id is immutable';
        END IF;
        IF NEW.conversation_id <> OLD.conversation_id THEN
            RAISE EXCEPTION 'conversation_members.conversation_id is immutable';
        END IF;
        IF NEW.user_id <> OLD.user_id THEN
            RAISE EXCEPTION 'conversation_members.user_id is immutable';
        END IF;

        IF NEW.role IS DISTINCT FROM OLD.role THEN
            IF v_caller IS NOT NULL THEN
                v_is_owner := public.is_conversation_owner(OLD.conversation_id, v_caller);
                v_is_admin := public.is_conversation_admin(OLD.conversation_id, v_caller);

                IF NOT (v_is_owner OR v_is_admin) THEN
                    RAISE EXCEPTION 'Only conversation owners or admins can modify member roles';
                END IF;

                IF NOT v_is_owner AND v_caller = OLD.user_id THEN
                    RAISE EXCEPTION 'Admins cannot change their own role';
                END IF;

                IF NOT v_is_owner AND OLD.role = 'owner' THEN
                    RAISE EXCEPTION 'Admins cannot modify owner roles';
                END IF;

                IF NEW.role = 'owner' AND NOT v_is_owner THEN
                    RAISE EXCEPTION 'Only conversation owner can grant owner role';
                END IF;

                IF NOT v_is_owner AND NEW.role NOT IN ('member', 'admin') THEN
                    RAISE EXCEPTION 'Admins can only change role between member and admin';
                END IF;
            END IF;

            IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
                SELECT COUNT(*) INTO v_owner_count
                FROM public.conversation_members
                WHERE conversation_id = OLD.conversation_id AND role = 'owner';

                IF v_owner_count <= 1 THEN
                    RAISE EXCEPTION 'Cannot demote the last owner of a conversation';
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF v_caller IS NOT NULL THEN
            v_is_owner := public.is_conversation_owner(OLD.conversation_id, v_caller);
            IF NOT v_is_owner AND OLD.role = 'owner' THEN
                RAISE EXCEPTION 'Admins cannot remove conversation owners';
            END IF;
        END IF;

        IF OLD.role = 'owner' THEN
            SELECT COUNT(*) INTO v_owner_count
            FROM public.conversation_members
            WHERE conversation_id = OLD.conversation_id AND role = 'owner';

            IF v_owner_count <= 1 THEN
                RAISE EXCEPTION 'Cannot remove the last owner of a conversation';
            END IF;
        END IF;

        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_owned_server RECORD;
    v_successor_id UUID;
    v_owned_conv RECORD;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    PERFORM set_config('nexus.in_user_deletion', 'on', true);

    -- 1. Transfer ownership of servers where user is owner, or delete only if sole member
    FOR v_owned_server IN SELECT id FROM public.servers WHERE owner_id = v_uid
    LOOP
        -- Look for longest-standing admin, then longest-standing member
        SELECT user_id INTO v_successor_id
        FROM public.server_members
        WHERE server_id = v_owned_server.id
          AND user_id <> v_uid
        ORDER BY CASE WHEN role = 'admin' THEN 1 ELSE 2 END, joined_at ASC
        LIMIT 1;

        IF v_successor_id IS NOT NULL THEN
            PERFORM public.transfer_server_ownership(v_owned_server.id, v_successor_id);
        ELSE
            -- Sole member: safe to delete server
            DELETE FROM public.servers WHERE id = v_owned_server.id;
        END IF;
    END LOOP;

    -- 2. Clean up owned group conversations
    FOR v_owned_conv IN SELECT c.id FROM public.conversations c WHERE c.created_by = v_uid AND c.type = 'group'
    LOOP
        PERFORM public.leave_group_conversation(v_owned_conv.id);
    END LOOP;

    -- 3. Clean up social relationships and devices
    DELETE FROM public.user_devices WHERE user_id = v_uid;
    DELETE FROM public.friendships WHERE user_id = v_uid OR friend_id = v_uid;
    DELETE FROM public.friend_requests WHERE sender_id = v_uid OR receiver_id = v_uid;
    DELETE FROM public.blocks WHERE blocker_id = v_uid OR blocked_id = v_uid;

    -- 4. Delete user's storage objects (avatar, personal uploads)
    DELETE FROM storage.objects WHERE owner = v_uid;

    -- 5. Tombstone profile instead of cascading message deletes
    UPDATE public.profiles
    SET display_name = 'Deleted User',
        username = 'deleted_' || SUBSTRING(REPLACE(v_uid::text, '-', '') FROM 1 FOR 8),
        avatar_url = NULL,
        bio = NULL,
        status = 'offline'
    WHERE id = v_uid;

    -- 6. Remove user from memberships
    DELETE FROM public.conversation_members WHERE user_id = v_uid;
    DELETE FROM public.server_members WHERE user_id = v_uid;
    DELETE FROM public.notifications WHERE user_id = v_uid;
    DELETE FROM public.user_settings WHERE user_id = v_uid;

    -- 7. Delete auth credentials
    DELETE FROM auth.users WHERE id = v_uid;

    PERFORM set_config('nexus.in_user_deletion', 'off', true);

    RETURN TRUE;
END;
$$;
