-- ==============================================================================
-- Migration: 00014_phase4_features.sql
-- Description: Phase 4 Essential Features
--   1. Notification inbox: Category settings on user_settings and triggers
--   2. Group direct messages: Group creation, member invites/removal, RLS
--   3. Moderation and safety: Server bans, member timeouts, audit logs, invites, reports
--   4. Account security: User account deletion RPC
-- ==============================================================================

-- 1. NOTIFICATION CATEGORIES ON USER_SETTINGS
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS notif_dms BOOLEAN DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS notif_mentions BOOLEAN DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS notif_friend_requests BOOLEAN DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS notif_invites BOOLEAN DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS notif_missed_calls BOOLEAN DEFAULT true NOT NULL;

-- 2. GROUP DIRECT MESSAGES SCHEMA & RLS
-- Enable conversation members deletion policy for leaving or kicking
DROP POLICY IF EXISTS "Conversation members can leave or be removed" ON public.conversation_members;
CREATE POLICY "Conversation members can leave or be removed"
    ON public.conversation_members FOR DELETE
    USING (
        -- Member can leave
        auth.uid() = user_id OR
        -- Group owner/admin can remove member
        public.is_conversation_creator_or_admin(conversation_id, auth.uid())
    );

-- Enable conversation update policy for group metadata (name, icon)
DROP POLICY IF EXISTS "Group owners and admins can update conversations" ON public.conversations;
CREATE POLICY "Group owners and admins can update conversations"
    ON public.conversations FOR UPDATE
    USING (
        public.is_conversation_creator_or_admin(id, auth.uid())
    );

-- RPC: Create Group Conversation
CREATE OR REPLACE FUNCTION public.create_group_conversation(
    p_name TEXT,
    p_member_ids UUID[],
    p_icon_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conv_id UUID;
    v_member_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Create group conversation
    INSERT INTO public.conversations (type, name, icon_url, created_by)
    VALUES ('group', COALESCE(NULLIF(TRIM(p_name), ''), 'Squad Group'), p_icon_url, auth.uid())
    RETURNING id INTO v_conv_id;

    -- Add creator as owner
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_conv_id, auth.uid(), 'owner');

    -- Add provided members
    IF p_member_ids IS NOT NULL THEN
        FOREACH v_member_id IN ARRAY p_member_ids
        LOOP
            IF v_member_id <> auth.uid() THEN
                INSERT INTO public.conversation_members (conversation_id, user_id, role)
                VALUES (v_conv_id, v_member_id, 'member')
                ON CONFLICT (conversation_id, user_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    RETURN v_conv_id;
END;
$$;

-- RPC: Add Group Members
CREATE OR REPLACE FUNCTION public.add_group_members(
    p_conversation_id UUID,
    p_user_ids UUID[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    IF NOT public.is_conversation_creator_or_admin(p_conversation_id, auth.uid()) THEN
        RAISE EXCEPTION 'Only group owners or admins can add members';
    END IF;

    IF p_user_ids IS NOT NULL THEN
        FOREACH v_user_id IN ARRAY p_user_ids
        LOOP
            INSERT INTO public.conversation_members (conversation_id, user_id, role)
            VALUES (p_conversation_id, v_user_id, 'member')
            ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END LOOP;
    END IF;

    RETURN TRUE;
END;
$$;

-- RPC: Remove Group Member
CREATE OR REPLACE FUNCTION public.remove_group_member(
    p_conversation_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only allow if caller is removing themselves OR caller is group owner/admin
    IF auth.uid() <> p_user_id AND NOT public.is_conversation_creator_or_admin(p_conversation_id, auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions to remove member';
    END IF;

    DELETE FROM public.conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

    RETURN TRUE;
END;
$$;

-- RPC: Leave Group Conversation
CREATE OR REPLACE FUNCTION public.leave_group_conversation(
    p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_owner BOOLEAN;
    v_next_owner UUID;
    v_remaining_count INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if user is owner
    SELECT (role = 'owner') INTO v_is_owner
    FROM public.conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid();

    -- Remove user
    DELETE FROM public.conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid();

    -- Count remaining members
    SELECT COUNT(*) INTO v_remaining_count
    FROM public.conversation_members
    WHERE conversation_id = p_conversation_id;

    IF v_remaining_count = 0 THEN
        -- Delete conversation if no members left
        DELETE FROM public.conversations WHERE id = p_conversation_id;
    ELSIF v_is_owner THEN
        -- Reassign ownership to earliest joined member
        SELECT user_id INTO v_next_owner
        FROM public.conversation_members
        WHERE conversation_id = p_conversation_id
        ORDER BY joined_at ASC
        LIMIT 1;

        IF v_next_owner IS NOT NULL THEN
            UPDATE public.conversation_members
            SET role = 'owner'
            WHERE conversation_id = p_conversation_id AND user_id = v_next_owner;

            UPDATE public.conversations
            SET created_by = v_next_owner
            WHERE id = p_conversation_id;
        END IF;
    END IF;

    RETURN TRUE;
END;
$$;

-- 3. MODERATION AND SAFETY TABLES

-- 3.1 SERVER BANS
CREATE TABLE IF NOT EXISTS public.server_bans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    banned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT unique_server_ban UNIQUE (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_bans_srv ON public.server_bans(server_id);
ALTER TABLE public.server_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Server owners and admins can view bans" ON public.server_bans;
CREATE POLICY "Server owners and admins can view bans"
    ON public.server_bans FOR SELECT
    USING (public.is_server_owner_or_admin(server_id, auth.uid()));

DROP POLICY IF EXISTS "Server owners and admins can manage bans" ON public.server_bans;
CREATE POLICY "Server owners and admins can manage bans"
    ON public.server_bans FOR ALL
    USING (public.is_server_owner_or_admin(server_id, auth.uid()));

-- 3.2 SERVER MEMBER TIMEOUTS
ALTER TABLE public.server_members
  ADD COLUMN IF NOT EXISTS timeout_until TIMESTAMPTZ;

-- Prevent timed-out members from inserting channel messages
DROP POLICY IF EXISTS "Members can insert channel messages" ON public.channel_messages;
CREATE POLICY "Members can insert channel messages"
    ON public.channel_messages FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.channels c
            JOIN public.server_members sm ON sm.server_id = c.server_id
            WHERE c.id = channel_id
            AND sm.user_id = auth.uid()
            AND (sm.timeout_until IS NULL OR sm.timeout_until < NOW())
        )
    );

-- 3.3 MODERATION AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.moderation_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('kick', 'ban', 'unban', 'timeout', 'untimeout', 'delete_message', 'revoke_invite', 'update_server')),
    reason TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_srv ON public.moderation_audit_logs(server_id, created_at DESC);
ALTER TABLE public.moderation_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Server owners and admins can view audit logs" ON public.moderation_audit_logs;
CREATE POLICY "Server owners and admins can view audit logs"
    ON public.moderation_audit_logs FOR SELECT
    USING (public.is_server_owner_or_admin(server_id, auth.uid()));

DROP POLICY IF EXISTS "Server owners and admins can insert audit logs" ON public.moderation_audit_logs;
CREATE POLICY "Server owners and admins can insert audit logs"
    ON public.moderation_audit_logs FOR INSERT
    WITH CHECK (public.is_server_owner_or_admin(server_id, auth.uid()));

-- 3.4 SERVER INVITES TABLE
CREATE TABLE IF NOT EXISTS public.server_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    max_uses INT DEFAULT 0, -- 0 = unlimited
    uses INT DEFAULT 0 NOT NULL,
    expires_at TIMESTAMPTZ, -- NULL = never expires
    is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_server_invites_srv ON public.server_invites(server_id);
CREATE INDEX IF NOT EXISTS idx_server_invites_code ON public.server_invites(code);
ALTER TABLE public.server_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can look up active invites by code" ON public.server_invites;
CREATE POLICY "Anyone can look up active invites by code"
    ON public.server_invites FOR SELECT
    USING (
        (NOT is_revoked AND (expires_at IS NULL OR expires_at > NOW())) OR
        public.is_server_owner_or_admin(server_id, auth.uid())
    );

DROP POLICY IF EXISTS "Server owners and admins can manage invites" ON public.server_invites;
CREATE POLICY "Server owners and admins can manage invites"
    ON public.server_invites FOR ALL
    USING (public.is_server_owner_or_admin(server_id, auth.uid()));

-- 3.5 MODERATION RPCS
-- RPC: Ban Member
CREATE OR REPLACE FUNCTION public.ban_server_member(
    p_server_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_server_owner_or_admin(p_server_id, auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions to ban members';
    END IF;

    IF public.is_server_owner(p_server_id, p_user_id) THEN
        RAISE EXCEPTION 'Cannot ban the server owner';
    END IF;

    -- Remove from server members
    DELETE FROM public.server_members
    WHERE server_id = p_server_id AND user_id = p_user_id;

    -- Add to bans
    INSERT INTO public.server_bans (server_id, user_id, banned_by, reason)
    VALUES (p_server_id, p_user_id, auth.uid(), p_reason)
    ON CONFLICT (server_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, created_at = NOW();

    -- Log action
    INSERT INTO public.moderation_audit_logs (server_id, actor_id, target_id, action, reason)
    VALUES (p_server_id, auth.uid(), p_user_id, 'ban', p_reason);

    RETURN TRUE;
END;
$$;

-- RPC: Unban Member
CREATE OR REPLACE FUNCTION public.unban_server_member(
    p_server_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_server_owner_or_admin(p_server_id, auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions to unban members';
    END IF;

    DELETE FROM public.server_bans
    WHERE server_id = p_server_id AND user_id = p_user_id;

    INSERT INTO public.moderation_audit_logs (server_id, actor_id, target_id, action, reason)
    VALUES (p_server_id, auth.uid(), p_user_id, 'unban', 'Unbanned by moderator');

    RETURN TRUE;
END;
$$;

-- RPC: Timeout Member
CREATE OR REPLACE FUNCTION public.timeout_server_member(
    p_server_id UUID,
    p_user_id UUID,
    p_duration_seconds INT,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_timeout_until TIMESTAMPTZ;
BEGIN
    IF NOT public.is_server_owner_or_admin(p_server_id, auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions to timeout members';
    END IF;

    IF public.is_server_owner(p_server_id, p_user_id) THEN
        RAISE EXCEPTION 'Cannot timeout the server owner';
    END IF;

    IF p_duration_seconds <= 0 THEN
        v_timeout_until := NULL;
    ELSE
        v_timeout_until := NOW() + (p_duration_seconds * INTERVAL '1 second');
    END IF;

    UPDATE public.server_members
    SET timeout_until = v_timeout_until
    WHERE server_id = p_server_id AND user_id = p_user_id;

    INSERT INTO public.moderation_audit_logs (
        server_id, actor_id, target_id, action, reason, details
    )
    VALUES (
        p_server_id,
        auth.uid(),
        p_user_id,
        CASE WHEN p_duration_seconds <= 0 THEN 'untimeout' ELSE 'timeout' END,
        p_reason,
        jsonb_build_object('duration_seconds', p_duration_seconds, 'timeout_until', v_timeout_until)
    );

    RETURN TRUE;
END;
$$;

-- RPC: Kick Member
CREATE OR REPLACE FUNCTION public.kick_server_member(
    p_server_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_server_owner_or_admin(p_server_id, auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions to kick members';
    END IF;

    IF public.is_server_owner(p_server_id, p_user_id) THEN
        RAISE EXCEPTION 'Cannot kick the server owner';
    END IF;

    DELETE FROM public.server_members
    WHERE server_id = p_server_id AND user_id = p_user_id;

    INSERT INTO public.moderation_audit_logs (server_id, actor_id, target_id, action, reason)
    VALUES (p_server_id, auth.uid(), p_user_id, 'kick', p_reason);

    RETURN TRUE;
END;
$$;

-- RPC: Create Server Invite
CREATE OR REPLACE FUNCTION public.create_server_invite(
    p_server_id UUID,
    p_max_uses INT DEFAULT 0,
    p_expires_in_hours INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT;
    v_expires_at TIMESTAMPTZ;
    v_invite_id UUID;
BEGIN
    IF NOT public.is_server_owner_or_admin(p_server_id, auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions to create server invites';
    END IF;

    -- Generate a clean 8-character invite code
    v_code := LOWER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));

    IF p_expires_in_hours > 0 THEN
        v_expires_at := NOW() + (p_expires_in_hours * INTERVAL '1 hour');
    ELSE
        v_expires_at := NULL;
    END IF;

    INSERT INTO public.server_invites (
        server_id, code, created_by, max_uses, expires_at
    )
    VALUES (
        p_server_id, v_code, auth.uid(), COALESCE(p_max_uses, 0), v_expires_at
    )
    RETURNING id INTO v_invite_id;

    RETURN jsonb_build_object(
        'id', v_invite_id,
        'code', v_code,
        'server_id', p_server_id,
        'max_uses', p_max_uses,
        'expires_at', v_expires_at
    );
END;
$$;

-- RPC: Revoke Server Invite
CREATE OR REPLACE FUNCTION public.revoke_server_invite(
    p_invite_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_server_id UUID;
BEGIN
    SELECT server_id INTO v_server_id
    FROM public.server_invites
    WHERE id = p_invite_id;

    IF v_server_id IS NULL THEN
        RAISE EXCEPTION 'Invite not found';
    END IF;

    IF NOT public.is_server_owner_or_admin(v_server_id, auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions to revoke invite';
    END IF;

    UPDATE public.server_invites
    SET is_revoked = TRUE
    WHERE id = p_invite_id;

    INSERT INTO public.moderation_audit_logs (server_id, actor_id, action, details)
    VALUES (v_server_id, auth.uid(), 'revoke_invite', jsonb_build_object('invite_id', p_invite_id));

    RETURN TRUE;
END;
$$;

-- 4. ACCOUNT DELETION RPC
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_owned_server RECORD;
    v_owned_conv RECORD;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Clean up owned servers: delete servers where user is sole owner
    FOR v_owned_server IN SELECT id FROM public.servers WHERE owner_id = v_uid
    LOOP
        DELETE FROM public.servers WHERE id = v_owned_server.id;
    END LOOP;

    -- Clean up friendships and blocks
    DELETE FROM public.friendships WHERE user_id = v_uid OR friend_id = v_uid;
    DELETE FROM public.friend_requests WHERE sender_id = v_uid OR receiver_id = v_uid;
    DELETE FROM public.blocks WHERE blocker_id = v_uid OR blocked_id = v_uid;

    -- Clean up conversation memberships and groups
    FOR v_owned_conv IN SELECT c.id FROM public.conversations c WHERE c.created_by = v_uid AND c.type = 'group'
    LOOP
        -- Reassign or delete
        PERFORM public.leave_group_conversation(v_owned_conv.id);
    END LOOP;

    DELETE FROM public.conversation_members WHERE user_id = v_uid;
    DELETE FROM public.server_members WHERE user_id = v_uid;
    DELETE FROM public.notifications WHERE user_id = v_uid;
    DELETE FROM public.user_settings WHERE user_id = v_uid;

    -- Anonymize / delete profile
    DELETE FROM public.profiles WHERE id = v_uid;

    RETURN TRUE;
END;
$$;

-- 5. CHANNEL MESSAGES PHASE 4 ENHANCEMENTS (REPLY, PIN, EDIT)
ALTER TABLE public.channel_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.channel_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE NOT NULL;

-- 6. CONTENT & USER REPORTS
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Ensure all Phase 4 columns exist even if public.reports pre-existed from migration 00001
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS message_id UUID,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Reconcile reported_user_id nullability if needed
ALTER TABLE public.reports ALTER COLUMN reported_user_id DROP NOT NULL;

-- Update status check constraint safely
DO $$
BEGIN
    ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
    ALTER TABLE public.reports ADD CONSTRAINT reports_status_check CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed', 'actioned'));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_reports_server ON public.reports(server_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports(reporter_id);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create reports" ON public.reports;
DROP POLICY IF EXISTS "Users can insert their own reports" ON public.reports;
CREATE POLICY "Users can create reports"
    ON public.reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can view their own reports" ON public.reports;
CREATE POLICY "Users can view own reports"
    ON public.reports FOR SELECT
    USING (
        auth.uid() = reporter_id OR
        (server_id IS NOT NULL AND public.is_server_owner_or_admin(server_id, auth.uid()))
    );

DROP POLICY IF EXISTS "Server admins can update reports for their server" ON public.reports;
CREATE POLICY "Server admins can update reports for their server"
    ON public.reports FOR UPDATE
    USING (server_id IS NOT NULL AND public.is_server_owner_or_admin(server_id, auth.uid()));

-- RPC: Create Report
CREATE OR REPLACE FUNCTION public.create_report(
    p_reported_user_id UUID,
    p_reason TEXT,
    p_server_id UUID DEFAULT NULL,
    p_channel_id UUID DEFAULT NULL,
    p_message_id UUID DEFAULT NULL,
    p_details TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_report_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF auth.uid() = p_reported_user_id THEN
        RAISE EXCEPTION 'Cannot report yourself';
    END IF;

    INSERT INTO public.reports (
        reporter_id, reported_user_id, server_id, channel_id, message_id, reason, details
    )
    VALUES (
        auth.uid(), p_reported_user_id, p_server_id, p_channel_id, p_message_id, p_reason, p_details
    )
    RETURNING id INTO v_report_id;

    RETURN v_report_id;
END;
$$;

-- 7. REALTIME REPLICA IDENTITY
ALTER TABLE public.server_bans REPLICA IDENTITY FULL;
ALTER TABLE public.moderation_audit_logs REPLICA IDENTITY FULL;
ALTER TABLE public.server_invites REPLICA IDENTITY FULL;
ALTER TABLE public.reports REPLICA IDENTITY FULL;

