-- ==============================================================================
-- Migration: 00022_content_length_safety_and_not_null.sql
-- Description: Phase A3 Robustness Remediation
--   1. Truncate any messages or channel_messages exceeding 4000 characters.
--   2. Backfill NULL content to empty string ''.
--   3. Enforce DEFAULT '' and NOT NULL on messages and channel_messages content.
--   4. Ensure 4000 character length constraints are applied and validated safely.
-- ==============================================================================

-- 1. Safely truncate any messages exceeding 4000 characters
UPDATE public.messages
    SET content = substring(content from 1 for 4000)
    WHERE char_length(content) > 4000;

UPDATE public.channel_messages
    SET content = substring(content from 1 for 4000)
    WHERE char_length(content) > 4000;

-- 2. Backfill NULL content with empty string
UPDATE public.messages
    SET content = ''
    WHERE content IS NULL;

UPDATE public.channel_messages
    SET content = ''
    WHERE content IS NULL;

-- 3. Set DEFAULT '' and NOT NULL constraints on content columns
ALTER TABLE public.messages
    ALTER COLUMN content SET DEFAULT '',
    ALTER COLUMN content SET NOT NULL;

ALTER TABLE public.channel_messages
    ALTER COLUMN content SET DEFAULT '',
    ALTER COLUMN content SET NOT NULL;

-- 4. Idempotently add and validate length check constraints using NOT VALID + VALIDATE
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
    ELSE
        -- Validate constraint if it exists but was not validated
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'messages_content_length_check' AND NOT convalidated
        ) THEN
            ALTER TABLE public.messages
                VALIDATE CONSTRAINT messages_content_length_check;
        END IF;
    END IF;
END $$;

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
    ELSE
        -- Validate constraint if it exists but was not validated
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'channel_messages_content_length_check' AND NOT convalidated
        ) THEN
            ALTER TABLE public.channel_messages
                VALIDATE CONSTRAINT channel_messages_content_length_check;
        END IF;
    END IF;
END $$;
