-- ==============================================================================
-- Migration: 00020_messaging_correctness.sql
-- Description: Phase 2 Messaging Correctness (M1–M8)
--   M7: Enforce 4000 character length limit on messages and channel_messages.
--   M1: Add composite timeline index on channel_messages for keyset pagination.
-- ==============================================================================

-- 1. Truncate any existing messages exceeding 4000 characters before applying constraint
UPDATE public.messages
    SET content = substring(content from 1 for 4000)
    WHERE char_length(content) > 4000;

UPDATE public.channel_messages
    SET content = substring(content from 1 for 4000)
    WHERE char_length(content) > 4000;

-- 2. Enforce max 4000 character length on direct messages using NOT VALID + VALIDATE CONSTRAINT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'messages_content_length_check'
    ) THEN
        ALTER TABLE public.messages
            ADD CONSTRAINT messages_content_length_check
            CHECK (char_length(content) <= 4000) NOT VALID;
        ALTER TABLE public.messages
            VALIDATE CONSTRAINT messages_content_length_check;
    END IF;
END $$;

-- 3. Enforce max 4000 character length on channel messages using NOT VALID + VALIDATE CONSTRAINT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'channel_messages_content_length_check'
    ) THEN
        ALTER TABLE public.channel_messages
            ADD CONSTRAINT channel_messages_content_length_check
            CHECK (char_length(content) <= 4000) NOT VALID;
        ALTER TABLE public.channel_messages
            VALIDATE CONSTRAINT channel_messages_content_length_check;
    END IF;
END $$;

-- 3. Composite timeline index for channel_messages keyset pagination
CREATE INDEX IF NOT EXISTS idx_channel_messages_timeline
    ON public.channel_messages(channel_id, created_at DESC);
