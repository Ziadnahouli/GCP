-- ==============================================================================
-- Migration: 00004_servers_and_channels.sql
-- Description: Gaming Servers (Guilds), Text & Voice Channels, Member Roles, and Permissions
-- ==============================================================================

-- 1. SERVERS TABLE
CREATE TABLE IF NOT EXISTS public.servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_servers_owner ON public.servers(owner_id);

-- 2. SERVER MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.server_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT unique_server_member UNIQUE (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_members_srv ON public.server_members(server_id);
CREATE INDEX IF NOT EXISTS idx_server_members_usr ON public.server_members(user_id);

-- 3. CHANNELS TABLE (TEXT & VOICE)
CREATE TABLE IF NOT EXISTS public.channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'voice')),
    topic TEXT,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_channels_server ON public.channels(server_id);

-- 4. CHANNEL MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.channel_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_channel_messages_chan ON public.channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_created ON public.channel_messages(created_at);

-- 5. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

-- 6. RLS POLICIES FOR SERVERS
CREATE POLICY "Members can view servers"
    ON public.servers FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = servers.id AND sm.user_id = auth.uid()
        ) OR owner_id = auth.uid()
    );

CREATE POLICY "Authenticated users can create servers"
    ON public.servers FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners and admins can update servers"
    ON public.servers FOR UPDATE
    USING (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = servers.id AND sm.user_id = auth.uid() AND sm.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Owners can delete servers"
    ON public.servers FOR DELETE
    USING (owner_id = auth.uid());

-- 7. RLS POLICIES FOR MEMBERS
CREATE POLICY "Server members can view member lists"
    ON public.server_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = server_members.server_id AND sm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can join servers"
    ON public.server_members FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can leave or admins can kick"
    ON public.server_members FOR DELETE
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = server_members.server_id AND sm.user_id = auth.uid() AND sm.role IN ('owner', 'admin')
        )
    );

-- 8. RLS POLICIES FOR CHANNELS
CREATE POLICY "Members can view channels"
    ON public.channels FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = channels.server_id AND sm.user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can create channels"
    ON public.channels FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = channels.server_id AND sm.user_id = auth.uid() AND sm.role IN ('owner', 'admin')
        )
    );

-- 9. RLS POLICIES FOR CHANNEL MESSAGES
CREATE POLICY "Members can view channel messages"
    ON public.channel_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.channels c
            JOIN public.server_members sm ON sm.server_id = c.server_id
            WHERE c.id = channel_messages.channel_id AND sm.user_id = auth.uid()
        )
    );

CREATE POLICY "Members can send channel messages"
    ON public.channel_messages FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.channels c
            JOIN public.server_members sm ON sm.server_id = c.server_id
            WHERE c.id = channel_messages.channel_id AND sm.user_id = auth.uid()
        )
    );

-- 10. REALTIME PUBLICATION
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.servers;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_messages;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
