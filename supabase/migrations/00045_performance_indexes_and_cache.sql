-- Migration 00045: Performance Optimization Indexes & Query Acceleration (S8)
--
-- Adds targeted composite indexes for hot path queries:
-- 1. conversation_members(user_id) and (conversation_id, user_id)
-- 2. notifications(user_id, created_at DESC)
-- 3. profile_links(user_id, position ASC)
-- 4. user_devices(user_id, last_active_at DESC)

DO $$
BEGIN
    -- 1. Conversation Members user index (accelerates conversation list retrieval & membership lookups)
    CREATE INDEX IF NOT EXISTS idx_conversation_members_user_id
        ON public.conversation_members(user_id);

    CREATE INDEX IF NOT EXISTS idx_conversation_members_lookup
        ON public.conversation_members(conversation_id, user_id);

    -- 2. Notifications timeline index (accelerates notification list retrieval & unread count)
    CREATE INDEX IF NOT EXISTS idx_notifications_user_timeline
        ON public.notifications(user_id, created_at DESC);

    -- 3. Profile Links order index (accelerates profile card and settings links loading)
    CREATE INDEX IF NOT EXISTS idx_profile_links_user_position
        ON public.profile_links(user_id, position ASC);

    -- 4. User Devices active index (accelerates session & device management)
    CREATE INDEX IF NOT EXISTS idx_user_devices_user_active
        ON public.user_devices(user_id, last_active_at DESC);
END $$;
