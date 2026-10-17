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
DROP POLICY IF EXISTS "Users can join servers" ON public.server_members;
DROP POLICY IF EXISTS "Users can join servers as members" ON public.server_members;

-- Prevent users from self-assigning 'owner', 'admin', or 'moderator' when joining
CREATE POLICY "Users can join servers as members"
    ON public.server_members FOR INSERT
    WITH CHECK (
        -- Regular self-join: Must be role = 'member'
        (auth.uid() = user_id AND role = 'member') OR
        -- Server owner creating the initial server membership: Allowed
        EXISTS (
            SELECT 1 FROM public.servers s
            WHERE s.id = server_members.server_id AND s.owner_id = auth.uid()
        ) OR
        -- Existing server owner/admin adding a member
        public.is_server_owner_or_admin(server_id, auth.uid())
    );

-- Add missing UPDATE policy for server members: Only owners and admins can update roles
DROP POLICY IF EXISTS "Owners and admins can update member roles" ON public.server_members;
CREATE POLICY "Owners and admins can update member roles"
    ON public.server_members FOR UPDATE
    USING (
        public.is_server_owner_or_admin(server_id, auth.uid())
    )
    WITH CHECK (
        public.is_server_owner_or_admin(server_id, auth.uid()) AND
        -- A non-owner cannot grant or claim the 'owner' role
        (
            role <> 'owner' OR
            EXISTS (
                SELECT 1 FROM public.servers s 
                WHERE s.id = server_members.server_id AND s.owner_id = auth.uid()
            )
        )
    );

-- Protect server owners from being kicked by non-owners
DROP POLICY IF EXISTS "Members can leave or admins can kick" ON public.server_members;
CREATE POLICY "Members can leave or admins can kick"
    ON public.server_members FOR DELETE
    USING (
        user_id = auth.uid() OR
        (
            public.is_server_owner_or_admin(server_id, auth.uid()) AND
            NOT EXISTS (
                SELECT 1 FROM public.servers s 
                WHERE s.id = server_members.server_id AND s.owner_id = server_members.user_id
            )
        )
    );

-- 3. CHANNEL MESSAGES UPDATE WITH CHECK
DROP POLICY IF EXISTS "Users can update their own channel messages" ON public.channel_messages;
CREATE POLICY "Users can update their own channel messages"
    ON public.channel_messages FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id AND channel_id = channel_messages.channel_id);

-- 4. CONVERSATIONS CREATION POLICY
DROP POLICY IF EXISTS "Users can create conversations as creator" ON public.conversations;
CREATE POLICY "Users can create conversations as creator"
    ON public.conversations FOR INSERT
    WITH CHECK (auth.uid() = created_by);

-- 5. CONVERSATION MEMBERS INSERTION REPAIR
-- Allow both admins and the conversation creator to add members
DROP POLICY IF EXISTS "Conversation admins can add members" ON public.conversation_members;
DROP POLICY IF EXISTS "Conversation admins and creators can add members" ON public.conversation_members;
CREATE POLICY "Conversation admins and creators can add members"
    ON public.conversation_members FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = conversation_members.conversation_id
            AND cm.user_id = auth.uid()
            AND cm.role IN ('owner', 'admin')
        ) OR
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_members.conversation_id
            AND c.created_by = auth.uid()
        )
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
