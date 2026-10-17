-- ==============================================================================
-- Migration: 00013_security_hardening.sql
-- Description: Phase 2 Security Hardening
--   1. Storage bucket security: Make 'attachments' bucket private and enforce
--      strict conversation-member RLS policies on storage.objects.
--   2. Server members privilege escalation fix: Enforce role = 'member' on self-joins,
--      add explicit UPDATE policy for owners/admins, and protect server owners from kicks.
--   3. Channel messages UPDATE policy: Add WITH CHECK clause to prevent column tampering.
--   4. Conversations creation policy: Allow users to create conversations as creator.
--   5. Conversation members insertion: Allow conversation creators to add initial members.
--   6. Reports table policies: Allow users to insert and view their own moderation reports.
--   7. Avatar and soundboard storage policies: Prevent cross-user deletion/tampering.
-- ==============================================================================

-- 1. STORAGE SECURITY: MAKE ATTACHMENTS PRIVATE & ENFORCE CONVERSATION RLS
UPDATE storage.buckets 
SET public = false 
WHERE id = 'attachments';

DO $$
BEGIN
    -- Drop legacy open attachments storage policies if present
    DROP POLICY IF EXISTS "Public can view attachments" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
    DROP POLICY IF EXISTS "Conversation members can view attachments" ON storage.objects;
    DROP POLICY IF EXISTS "Conversation members can upload attachments" ON storage.objects;
    DROP POLICY IF EXISTS "Authors can delete their own attachments" ON storage.objects;

    -- Only conversation members can read private attachments
    CREATE POLICY "Conversation members can view attachments"
        ON storage.objects FOR SELECT
        USING (
            bucket_id = 'attachments' AND
            auth.role() = 'authenticated' AND
            public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
        );

    -- Only conversation members can upload attachments to their own user folder in the conversation
    CREATE POLICY "Conversation members can upload attachments"
        ON storage.objects FOR INSERT
        WITH CHECK (
            bucket_id = 'attachments' AND
            auth.role() = 'authenticated' AND
            (storage.foldername(name))[2] = auth.uid()::text AND
            public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
        );

    -- Authors can delete their own uploaded attachments
    CREATE POLICY "Authors can delete their own attachments"
        ON storage.objects FOR DELETE
        USING (
            bucket_id = 'attachments' AND
            auth.role() = 'authenticated' AND
            (storage.foldername(name))[2] = auth.uid()::text
        );
END $$;

-- 2. SERVER MEMBERS PRIVILEGE ESCALATION PREVENTION
-- Helper to check if a user is the authoritative owner of a server (SECURITY DEFINER prevents recursion)
CREATE OR REPLACE FUNCTION public.is_server_owner(p_server_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.servers
    WHERE id = p_server_id AND owner_id = p_user_id
  );
$$;

-- Ensure is_server_owner_or_admin strictly checks for owner or admin, excluding moderators
CREATE OR REPLACE FUNCTION public.is_server_owner_or_admin(p_server_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.servers s
    LEFT JOIN public.server_members sm ON sm.server_id = s.id AND sm.user_id = p_user_id
    WHERE s.id = p_server_id
    AND (s.owner_id = p_user_id OR sm.role IN ('owner', 'admin'))
  );
$$;

DROP POLICY IF EXISTS "Users can join servers" ON public.server_members;
DROP POLICY IF EXISTS "Users can join servers as members" ON public.server_members;

-- Prevent users from self-assigning 'owner', 'admin', or 'moderator' when joining
-- Non-owner admins can only add members with role = 'member'
CREATE POLICY "Users can join servers as members"
    ON public.server_members FOR INSERT
    WITH CHECK (
        -- Regular self-join: Must be role = 'member'
        (auth.uid() = user_id AND role = 'member') OR
        -- Server owner creating the initial server membership: Allowed
        public.is_server_owner(server_id, auth.uid()) OR
        -- Existing server owner/admin adding a member: Non-owner admins can ONLY invite/add as 'member'
        (
            public.is_server_owner_or_admin(server_id, auth.uid()) AND
            role = 'member'
        )
    );

-- Add UPDATE policy for server members: Enforce valid role transitions and prevent self-escalation
DROP POLICY IF EXISTS "Owners and admins can update member roles" ON public.server_members;
CREATE POLICY "Owners and admins can update member roles"
    ON public.server_members FOR UPDATE
    USING (
        -- Caller must be owner or admin of the server
        public.is_server_owner_or_admin(server_id, auth.uid()) AND
        -- A non-owner cannot touch the server owner's membership row
        (
            public.is_server_owner(server_id, auth.uid()) OR
            NOT public.is_server_owner(server_id, server_members.user_id)
        ) AND
        -- A non-owner cannot update their own membership row (prevents self-escalation)
        (
            public.is_server_owner(server_id, auth.uid()) OR
            server_members.user_id <> auth.uid()
        ) AND
        -- A non-owner cannot modify the role of an existing admin
        (
            public.is_server_owner(server_id, auth.uid()) OR
            server_members.role NOT IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        -- Enforce valid role values
        role IN ('owner', 'admin', 'moderator', 'member') AND
        -- Server owner can assign any valid role
        (
            public.is_server_owner(server_id, auth.uid()) OR
            -- Non-owner admins:
            (
                public.is_server_owner_or_admin(server_id, auth.uid()) AND
                -- Cannot assign 'owner' or 'admin' (only owner can appoint admins or transfer ownership)
                role IN ('member', 'moderator') AND
                -- Cannot update their own role
                server_members.user_id <> auth.uid() AND
                -- Cannot touch the server owner's row
                NOT public.is_server_owner(server_id, server_members.user_id)
            )
        )
    );

-- Protect server owners from being kicked by non-owners and prevent admins from kicking other admins
DROP POLICY IF EXISTS "Members can leave or admins can kick" ON public.server_members;
CREATE POLICY "Members can leave or admins can kick"
    ON public.server_members FOR DELETE
    USING (
        -- Member leaving voluntarily (server owner cannot leave without transferring server ownership)
        (
            user_id = auth.uid() AND
            NOT public.is_server_owner(server_id, auth.uid())
        ) OR
        -- Server owner kicking any member except themselves
        (
            public.is_server_owner(server_id, auth.uid()) AND
            user_id <> auth.uid()
        ) OR
        -- Non-owner admin kicking regular members or moderators (cannot kick owner, cannot kick other admins, cannot kick self)
        (
            public.is_server_owner_or_admin(server_id, auth.uid()) AND
            user_id <> auth.uid() AND
            server_members.role NOT IN ('owner', 'admin') AND
            NOT public.is_server_owner(server_id, server_members.user_id)
        )
    );

-- 3. CHANNEL MESSAGES UPDATE WITH CHECK
DROP POLICY IF EXISTS "Users can update their own channel messages" ON public.channel_messages;
CREATE POLICY "Users can update their own channel messages"
    ON public.channel_messages FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id AND channel_id = channel_messages.channel_id);

-- 4. CONVERSATIONS CREATION & VIEWING POLICIES
DROP POLICY IF EXISTS "Users can create conversations as creator" ON public.conversations;
CREATE POLICY "Users can create conversations as creator"
    ON public.conversations FOR INSERT
    WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Members can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Members and creators can view conversations" ON public.conversations;
CREATE POLICY "Members and creators can view conversations"
    ON public.conversations FOR SELECT
    USING (
        created_by = auth.uid() OR
        public.is_conversation_member(id, auth.uid())
    );

-- 5. CONVERSATION MEMBERS INSERTION REPAIR
-- Helper to check creator or admin status without triggering subquery RLS deadlocks
CREATE OR REPLACE FUNCTION public.is_conversation_creator_or_admin(p_conv_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conv_id AND created_by = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = p_conv_id AND user_id = p_user_id AND role IN ('owner', 'admin')
  );
$$;

DROP POLICY IF EXISTS "Conversation admins can add members" ON public.conversation_members;
DROP POLICY IF EXISTS "Conversation admins and creators can add members" ON public.conversation_members;
CREATE POLICY "Conversation admins and creators can add members"
    ON public.conversation_members FOR INSERT
    WITH CHECK (
        public.is_conversation_creator_or_admin(conversation_id, auth.uid())
    );

-- 6. REPORTS TABLE RLS POLICIES
DROP POLICY IF EXISTS "Users can insert their own reports" ON public.reports;
CREATE POLICY "Users can insert their own reports"
    ON public.reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can view their own reports" ON public.reports;
CREATE POLICY "Users can view their own reports"
    ON public.reports FOR SELECT
    USING (auth.uid() = reporter_id);

-- 7. AVATAR & SOUNDBOARD OBJECTS SECURITY
DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
    CREATE POLICY "Users can delete their own avatars"
        ON storage.objects FOR DELETE
        USING (
            bucket_id = 'avatars' AND
            auth.role() = 'authenticated' AND
            (storage.foldername(name))[1] = auth.uid()::text
        );

    DROP POLICY IF EXISTS "Users can delete their own soundboard" ON storage.objects;
    CREATE POLICY "Users can delete their own soundboard"
        ON storage.objects FOR DELETE
        USING (
            bucket_id = 'soundboard' AND
            auth.role() = 'authenticated' AND
            (storage.foldername(name))[1] = auth.uid()::text
        );
END $$;
