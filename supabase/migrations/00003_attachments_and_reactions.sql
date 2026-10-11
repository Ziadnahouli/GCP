-- ==============================================================================
-- Migration: 00003_attachments_and_reactions.sql
-- Description: Message attachments, Emoji reactions, Storage buckets & RLS.
-- ==============================================================================

-- 1. MESSAGE ATTACHMENTS TABLE
CREATE TABLE IF NOT EXISTS public.message_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_msg ON public.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_conv ON public.message_attachments(conversation_id);

-- 2. MESSAGE REACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT unique_user_message_reaction UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_msg ON public.message_reactions(message_id);

-- 3. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- 4. RLS POLICIES FOR ATTACHMENTS
CREATE POLICY "Members can view attachments"
    ON public.message_attachments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members
            WHERE conversation_members.conversation_id = message_attachments.conversation_id
            AND conversation_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Members can upload attachments"
    ON public.message_attachments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversation_members
            WHERE conversation_members.conversation_id = message_attachments.conversation_id
            AND conversation_members.user_id = auth.uid()
        )
    );

-- 5. RLS POLICIES FOR REACTIONS
CREATE POLICY "Members can view reactions"
    ON public.message_reactions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.messages m
            JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
            WHERE m.id = message_reactions.message_id
            AND cm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can add their own reactions"
    ON public.message_reactions FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.messages m
            JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
            WHERE m.id = message_reactions.message_id
            AND cm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can remove their own reactions"
    ON public.message_reactions FOR DELETE
    USING (auth.uid() = user_id);

-- 6. REALTIME REPLICATION FOR ATTACHMENTS AND REACTIONS
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_attachments;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
