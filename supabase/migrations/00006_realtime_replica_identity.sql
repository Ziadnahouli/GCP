-- ==============================================================================
-- Migration: 00006_realtime_replica_identity.sql
-- Description: Enables REPLICA IDENTITY FULL on all messaging, social, and server
-- tables so Supabase Realtime delivers instant live updates without page refresh.
-- ==============================================================================

-- 1. Enable REPLICA IDENTITY FULL so Realtime filters and deletes send full row data
ALTER TABLE IF EXISTS public.messages REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.message_attachments REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.conversations REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.conversation_members REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.friend_requests REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.friendships REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.blocks REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.servers REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.server_members REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.channels REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.channel_messages REPLICA IDENTITY FULL;

-- 2. Add missing tables to Supabase Realtime publication
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.blocks;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;
