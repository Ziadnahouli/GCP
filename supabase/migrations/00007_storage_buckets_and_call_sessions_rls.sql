-- ==============================================================================
-- Migration: 00007_storage_buckets_and_call_sessions_rls.sql
-- Description: Storage buckets (attachments, avatars, soundboard), storage RLS,
--              call_sessions RLS, soundboard_clips RLS, notifications RLS.
-- ==============================================================================

-- 1. STORAGE BUCKETS INITIALIZATION
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES 
    ('attachments', 'attachments', true, 26214400),
    ('avatars', 'avatars', true, 5242880),
    ('soundboard', 'soundboard', true, 10485760)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

-- 2. STORAGE OBJECTS RLS POLICIES
DO $$
BEGIN
    -- Attachments bucket policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload attachments'
    ) THEN
        CREATE POLICY "Authenticated users can upload attachments"
            ON storage.objects FOR INSERT
            WITH CHECK (bucket_id = 'attachments' AND auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public can view attachments'
    ) THEN
        CREATE POLICY "Public can view attachments"
            ON storage.objects FOR SELECT
            USING (bucket_id = 'attachments');
    END IF;

    -- Avatars bucket policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload avatars'
    ) THEN
        CREATE POLICY "Authenticated users can upload avatars"
            ON storage.objects FOR INSERT
            WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public can view avatars'
    ) THEN
        CREATE POLICY "Public can view avatars"
            ON storage.objects FOR SELECT
            USING (bucket_id = 'avatars');
    END IF;

    -- Soundboard bucket policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload soundboard'
    ) THEN
        CREATE POLICY "Authenticated users can upload soundboard"
            ON storage.objects FOR INSERT
            WITH CHECK (bucket_id = 'soundboard' AND auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public can view soundboard'
    ) THEN
        CREATE POLICY "Public can view soundboard"
            ON storage.objects FOR SELECT
            USING (bucket_id = 'soundboard');
    END IF;
END $$;

-- 3. CALL SESSIONS RLS POLICIES
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'call_sessions' AND policyname = 'Members can view call sessions'
    ) THEN
        CREATE POLICY "Members can view call sessions"
            ON public.call_sessions FOR SELECT
            USING (
                caller_id = auth.uid() OR
                (conversation_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.conversation_members cm
                    WHERE cm.conversation_id = call_sessions.conversation_id AND cm.user_id = auth.uid()
                )) OR
                (channel_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.channels c
                    JOIN public.server_members sm ON sm.server_id = c.server_id
                    WHERE c.id = call_sessions.channel_id AND sm.user_id = auth.uid()
                ))
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'call_sessions' AND policyname = 'Authenticated users can create call sessions'
    ) THEN
        CREATE POLICY "Authenticated users can create call sessions"
            ON public.call_sessions FOR INSERT
            WITH CHECK (
                caller_id = auth.uid() AND (
                    (conversation_id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM public.conversation_members cm
                        WHERE cm.conversation_id = call_sessions.conversation_id AND cm.user_id = auth.uid()
                    )) OR
                    (channel_id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM public.channels c
                        JOIN public.server_members sm ON sm.server_id = c.server_id
                        WHERE c.id = call_sessions.channel_id AND sm.user_id = auth.uid()
                    ))
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'call_sessions' AND policyname = 'Call participants can update call sessions'
    ) THEN
        CREATE POLICY "Call participants can update call sessions"
            ON public.call_sessions FOR UPDATE
            USING (
                caller_id = auth.uid() OR
                (conversation_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.conversation_members cm
                    WHERE cm.conversation_id = call_sessions.conversation_id AND cm.user_id = auth.uid()
                )) OR
                (channel_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.channels c
                    JOIN public.server_members sm ON sm.server_id = c.server_id
                    WHERE c.id = call_sessions.channel_id AND sm.user_id = auth.uid()
                ))
            );
    END IF;
END $$;

-- 4. SOUNDBOARD CLIPS RLS POLICIES
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'soundboard_clips' AND policyname = 'Users can view soundboard clips'
    ) THEN
        CREATE POLICY "Users can view soundboard clips"
            ON public.soundboard_clips FOR SELECT
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'soundboard_clips' AND policyname = 'Users can create soundboard clips'
    ) THEN
        CREATE POLICY "Users can create soundboard clips"
            ON public.soundboard_clips FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'soundboard_clips' AND policyname = 'Users can update their soundboard clips'
    ) THEN
        CREATE POLICY "Users can update their soundboard clips"
            ON public.soundboard_clips FOR UPDATE
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'soundboard_clips' AND policyname = 'Users can delete their soundboard clips'
    ) THEN
        CREATE POLICY "Users can delete their soundboard clips"
            ON public.soundboard_clips FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- 5. NOTIFICATIONS RLS POLICIES
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can view their notifications'
    ) THEN
        CREATE POLICY "Users can view their notifications"
            ON public.notifications FOR SELECT
            USING (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can update their notifications'
    ) THEN
        CREATE POLICY "Users can update their notifications"
            ON public.notifications FOR UPDATE
            USING (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can delete their notifications'
    ) THEN
        CREATE POLICY "Users can delete their notifications"
            ON public.notifications FOR DELETE
            USING (user_id = auth.uid());
    END IF;
END $$;

-- 6. REALTIME PUBLICATION FOR CALL SESSIONS
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
