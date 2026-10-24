-- ==============================================================================
-- Migration: 00019_security_and_authorization_remediation.sql
-- Description: Phase 1 Security & Authorization Remediation
--   S1: Drop conversation_members wide UPDATE policy; add BEFORE UPDATE trigger
--       enforcing immutable id, conversation_id, user_id and preventing non-admin
--       role changes.
--   S2: Drop open 00008 "Members can update conversations" policy; enforce
--       immutable id, created_by, and type on conversations via BEFORE UPDATE trigger.
--   S3: Enforce immutable id, conversation_id, sender_id, created_at, reply_to_id
--       on public.messages via BEFORE UPDATE trigger.
--   S4: Fix tautology WITH CHECK on channel_messages; enforce immutable id,
--       channel_id, user_id, created_at via BEFORE UPDATE trigger.
--   S5: Server join security overhaul:
--       - Drop open self-insert policy on server_members.
--       - Restrict servers SELECT to members and owners.
--       - Replace insecure join_server_by_id with join_server_with_invite(p_code).
--       - Create narrow get_server_preview(p_code) RPC.
--       - Enforce server_bans checks during join.
--   S6: Enforce blocklist and DM privacy policies directly in Postgres via
--       BEFORE INSERT triggers on messages and friend_requests.
--   S8: Revoke anon SELECT from user_communication_privacy view; set security_invoker = true;
--       restrict profiles SELECT to authenticated users.
--   S9: Enforce storage bucket constraints on storage.buckets and storage.objects RLS:
--       - Set file_size_limit and allowed_mime_types on buckets.
--       - Restrict avatars and soundboard INSERT paths to match auth.uid().
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- S1. CONVERSATION MEMBERS ROLE ESCALATION & IMMUTABILITY
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Conversation members can update their own read state" ON public.conversation_members;
DROP POLICY IF EXISTS "Users can update their own conversation membership" ON public.conversation_members;
DROP POLICY IF EXISTS "Conversation owners and admins can update members" ON public.conversation_members;

CREATE POLICY "Conversation members can update their own read state"
    ON public.conversation_members FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Conversation owners and admins can update members"
    ON public.conversation_members FOR UPDATE
    USING (public.is_conversation_creator_or_admin(conversation_id, auth.uid()))
    WITH CHECK (public.is_conversation_creator_or_admin(conversation_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.trg_conversation_members_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'conversation_members.id is immutable';
    END IF;
    IF NEW.conversation_id <> OLD.conversation_id THEN
        RAISE EXCEPTION 'conversation_members.conversation_id is immutable';
    END IF;
    IF NEW.user_id <> OLD.user_id THEN
        RAISE EXCEPTION 'conversation_members.user_id is immutable';
    END IF;
    -- If role is modified, caller must be owner or admin of the conversation
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF NOT public.is_conversation_creator_or_admin(OLD.conversation_id, auth.uid()) THEN
            RAISE EXCEPTION 'Only conversation owners or admins can modify member roles';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_members_immutability ON public.conversation_members;
CREATE TRIGGER trg_conversation_members_immutability
    BEFORE UPDATE ON public.conversation_members
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_conversation_members_immutability();


-- ------------------------------------------------------------------------------
-- S2. CONVERSATIONS UPDATE LOCKDOWN & IMMUTABILITY
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Group owners and admins can update conversations" ON public.conversations;

CREATE POLICY "Group owners and admins can update conversations"
    ON public.conversations FOR UPDATE
    USING (public.is_conversation_creator_or_admin(id, auth.uid()))
    WITH CHECK (public.is_conversation_creator_or_admin(id, auth.uid()));

CREATE OR REPLACE FUNCTION public.trg_conversations_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'conversations.id is immutable';
    END IF;
    IF NEW.created_by <> OLD.created_by THEN
        RAISE EXCEPTION 'conversations.created_by is immutable';
    END IF;
    IF NEW.type <> OLD.type THEN
        RAISE EXCEPTION 'conversations.type is immutable';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversations_immutability ON public.conversations;
CREATE TRIGGER trg_conversations_immutability
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_conversations_immutability();


-- ------------------------------------------------------------------------------
-- S3. MESSAGES METADATA IMMUTABILITY
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_messages_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'messages.id is immutable';
    END IF;
    IF NEW.conversation_id <> OLD.conversation_id THEN
        RAISE EXCEPTION 'messages.conversation_id is immutable';
    END IF;
    IF NEW.sender_id <> OLD.sender_id THEN
        RAISE EXCEPTION 'messages.sender_id is immutable';
    END IF;
    IF NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'messages.created_at is immutable';
    END IF;
    IF NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id THEN
        RAISE EXCEPTION 'messages.reply_to_id is immutable';
    END IF;
    IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned THEN
        IF NOT public.is_conversation_member(OLD.conversation_id, auth.uid()) THEN
            RAISE EXCEPTION 'Only conversation members can pin or unpin messages';
        END IF;
    END IF;

    IF NEW.content IS DISTINCT FROM OLD.content THEN
        NEW.is_edited := true;
        NEW.updated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_immutability ON public.messages;
CREATE TRIGGER trg_messages_immutability
    BEFORE UPDATE ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_messages_immutability();


-- ------------------------------------------------------------------------------
-- S4. CHANNEL MESSAGES UPDATE FIX & IMMUTABILITY
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own channel messages" ON public.channel_messages;

CREATE POLICY "Users can update their own channel messages"
    ON public.channel_messages FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.trg_channel_messages_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'channel_messages.id is immutable';
    END IF;
    IF NEW.channel_id <> OLD.channel_id THEN
        RAISE EXCEPTION 'channel_messages.channel_id is immutable';
    END IF;
    IF NEW.user_id <> OLD.user_id THEN
        RAISE EXCEPTION 'channel_messages.user_id is immutable';
    END IF;
    IF NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'channel_messages.created_at is immutable';
    END IF;

    IF NEW.content IS DISTINCT FROM OLD.content THEN
        NEW.is_edited := true;
        NEW.updated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_channel_messages_immutability ON public.channel_messages;
CREATE TRIGGER trg_channel_messages_immutability
    BEFORE UPDATE ON public.channel_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_channel_messages_immutability();


-- ------------------------------------------------------------------------------
-- S5. SERVER JOIN BYPASS, INVITES, BANS & PRIVACY
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can join servers as members" ON public.server_members;
DROP POLICY IF EXISTS "Owners and admins can add server members" ON public.server_members;

CREATE POLICY "Owners and admins can add server members"
    ON public.server_members FOR INSERT
    WITH CHECK (
        public.is_server_owner(server_id, auth.uid()) OR
        (
            public.is_server_owner_or_admin(server_id, auth.uid()) AND
            role = 'member'
        )
    );

DROP POLICY IF EXISTS "Members and public servers viewable" ON public.servers;
DROP POLICY IF EXISTS "Servers are viewable by all" ON public.servers;
DROP POLICY IF EXISTS "Members and owners can view servers" ON public.servers;

CREATE POLICY "Members and owners can view servers"
    ON public.servers FOR SELECT
    USING (
        public.is_server_owner(id, auth.uid()) OR
        public.is_server_member(id, auth.uid())
    );

DROP FUNCTION IF EXISTS public.join_server_by_id(UUID);

CREATE OR REPLACE FUNCTION public.join_server_with_invite(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id UUID := auth.uid();
    inv RECORD;
    v_server_id UUID;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO inv
    FROM public.server_invites
    WHERE code = trim(p_code);

    IF inv.id IS NULL THEN
        RAISE EXCEPTION 'Invalid invite code';
    END IF;

    IF inv.is_revoked THEN
        RAISE EXCEPTION 'Invite code has been revoked';
    END IF;

    IF inv.expires_at IS NOT NULL AND inv.expires_at <= NOW() THEN
        RAISE EXCEPTION 'Invite code has expired';
    END IF;

    IF inv.max_uses > 0 AND inv.uses >= inv.max_uses THEN
        RAISE EXCEPTION 'Invite code has reached its maximum uses';
    END IF;

    v_server_id := inv.server_id;

    IF EXISTS (
        SELECT 1 FROM public.server_bans
        WHERE server_id = v_server_id AND user_id = caller_id
    ) THEN
        RAISE EXCEPTION 'You are banned from this server';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.server_members
        WHERE server_id = v_server_id AND user_id = caller_id
    ) THEN
        INSERT INTO public.server_members (server_id, user_id, role)
        VALUES (v_server_id, caller_id, 'member');

        UPDATE public.server_invites
        SET uses = uses + 1
        WHERE id = inv.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'server_id', v_server_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_server_with_invite(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_server_preview(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    inv RECORD;
    srv RECORD;
    m_count INT;
BEGIN
    SELECT * INTO inv
    FROM public.server_invites
    WHERE code = trim(p_code);

    IF inv.id IS NULL OR inv.is_revoked OR (inv.expires_at IS NOT NULL AND inv.expires_at <= NOW()) OR (inv.max_uses > 0 AND inv.uses >= inv.max_uses) THEN
        RAISE EXCEPTION 'Invalid or expired invite code';
    END IF;

    SELECT id, name, icon_url INTO srv
    FROM public.servers
    WHERE id = inv.server_id;

    IF srv.id IS NULL THEN
        RAISE EXCEPTION 'Server no longer exists';
    END IF;

    SELECT COUNT(*) INTO m_count
    FROM public.server_members
    WHERE server_id = srv.id;

    RETURN jsonb_build_object(
        'server_id', srv.id,
        'name', srv.name,
        'icon_url', srv.icon_url,
        'member_count', m_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_server_preview(TEXT) TO authenticated;


-- ------------------------------------------------------------------------------
-- S6. BLOCK LIST AND DM PRIVACY IN DATABASE TRIGGERS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_check_dm_message_privacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conv_type TEXT;
    v_recipient_id UUID;
    v_policy TEXT;
BEGIN
    SELECT type::text INTO v_conv_type
    FROM public.conversations
    WHERE id = NEW.conversation_id;

    IF v_conv_type = 'direct' THEN
        SELECT user_id INTO v_recipient_id
        FROM public.conversation_members
        WHERE conversation_id = NEW.conversation_id
          AND user_id <> NEW.sender_id
        LIMIT 1;

        IF v_recipient_id IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.blocks
                WHERE (blocker_id = NEW.sender_id AND blocked_id = v_recipient_id)
                   OR (blocker_id = v_recipient_id AND blocked_id = NEW.sender_id)
            ) THEN
                RAISE EXCEPTION 'Cannot send message to this user (blocked)';
            END IF;

            SELECT allow_direct_messages INTO v_policy
            FROM public.user_settings
            WHERE user_id = v_recipient_id;

            IF v_policy = 'none' THEN
                RAISE EXCEPTION 'Recipient does not accept direct messages';
            ELSIF v_policy = 'friends' THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.friendships
                    WHERE (user_id = NEW.sender_id AND friend_id = v_recipient_id)
                       OR (user_id = v_recipient_id AND friend_id = NEW.sender_id)
                ) THEN
                    RAISE EXCEPTION 'Recipient only accepts direct messages from friends';
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_dm_message_privacy ON public.messages;
CREATE TRIGGER trg_check_dm_message_privacy
    BEFORE INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_check_dm_message_privacy();

CREATE OR REPLACE FUNCTION public.trg_check_friend_request_privacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.blocks
        WHERE (blocker_id = NEW.sender_id AND blocked_id = NEW.receiver_id)
           OR (blocker_id = NEW.receiver_id AND blocked_id = NEW.sender_id)
    ) THEN
        RAISE EXCEPTION 'Cannot send friend request to this user (blocked)';
    END IF;

    SELECT allow_friend_requests INTO v_policy
    FROM public.user_settings
    WHERE user_id = NEW.receiver_id;

    IF v_policy = 'nobody' OR v_policy = 'none' THEN
        RAISE EXCEPTION 'Recipient does not accept friend requests';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_friend_request_privacy ON public.friend_requests;
CREATE TRIGGER trg_check_friend_request_privacy
    BEFORE INSERT ON public.friend_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_check_friend_request_privacy();


-- ------------------------------------------------------------------------------
-- S8. USER COMMUNICATION PRIVACY & PROFILES ENUMERATION LOCKDOWN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.user_communication_privacy
WITH (security_invoker = true)
AS
SELECT 
    user_id,
    allow_direct_messages,
    allow_friend_requests
FROM public.user_settings;

REVOKE ALL ON public.user_communication_privacy FROM anon;
REVOKE ALL ON public.user_communication_privacy FROM public;
GRANT SELECT ON public.user_communication_privacy TO authenticated;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by all" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);


-- ------------------------------------------------------------------------------
-- S9. STORAGE BUCKET HARDENING & PATH ISOLATION
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        UPDATE storage.buckets
        SET 
            file_size_limit = 26214400, -- 25MB
            allowed_mime_types = ARRAY[
                'image/png', 'image/jpeg', 'image/gif', 'image/webp',
                'video/mp4', 'video/webm',
                'audio/mpeg', 'audio/ogg', 'audio/wav',
                'application/pdf', 'text/plain', 'application/zip'
            ]
        WHERE id = 'attachments';

        UPDATE storage.buckets
        SET 
            file_size_limit = 5242880, -- 5MB
            allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
        WHERE id = 'avatars';

        UPDATE storage.buckets
        SET 
            file_size_limit = 10485760, -- 10MB
            allowed_mime_types = ARRAY['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm']
        WHERE id = 'soundboard';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
        CREATE POLICY "Authenticated users can upload avatars"
            ON storage.objects FOR INSERT
            WITH CHECK (
                bucket_id = 'avatars' AND
                auth.role() = 'authenticated' AND
                (storage.foldername(name))[1] = auth.uid()::text
            );

        DROP POLICY IF EXISTS "Authenticated users can upload soundboard" ON storage.objects;
        CREATE POLICY "Authenticated users can upload soundboard"
            ON storage.objects FOR INSERT
            WITH CHECK (
                bucket_id = 'soundboard' AND
                auth.role() = 'authenticated' AND
                (storage.foldername(name))[1] = auth.uid()::text
            );
    END IF;
END $$;
