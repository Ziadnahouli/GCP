-- ==============================================================================
-- Migration: 00001_initial_schema.sql
-- Project: Nexus Gaming Communication Platform
-- Description: Core Schema for Auth, Profiles, Settings, Social, Messaging, 
--              Calls, Soundboard, and Servers with Row Level Security (RLS).
-- ==============================================================================

-- Enable UUID extension with fallback for environments where uuid-ossp is not bundled
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
RETURNS UUID LANGUAGE sql AS $$
    SELECT gen_random_uuid();
$$;

-- ==============================================================================
-- 1. PROFILES TABLE & STATUS ENUM
-- ==============================================================================

CREATE TYPE user_presence_status AS ENUM ('online', 'idle', 'dnd', 'offline');
CREATE TYPE accent_theme_color AS ENUM ('violet', 'cyan', 'emerald', 'crimson', 'amber');

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    banner_url TEXT,
    banner_color TEXT DEFAULT '#7c3aed',
    bio TEXT,
    custom_status TEXT,
    status user_presence_status DEFAULT 'online',
    game_activity TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT username_length_check CHECK (char_length(username) >= 3 AND char_length(username) <= 30),
    CONSTRAINT username_characters_check CHECK (username ~* '^[a-zA-Z0-9_-]+$'),
    CONSTRAINT display_name_length_check CHECK (char_length(display_name) >= 1 AND char_length(display_name) <= 40)
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- ==============================================================================
-- 2. USER SETTINGS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'dark' NOT NULL,
    accent_color accent_theme_color DEFAULT 'violet' NOT NULL,
    sound_effects_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    push_to_talk_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    push_to_talk_key TEXT DEFAULT 'KeyV',
    input_volume INTEGER DEFAULT 85 CHECK (input_volume >= 0 AND input_volume <= 100),
    output_volume INTEGER DEFAULT 100 CHECK (output_volume >= 0 AND output_volume <= 100),
    allow_direct_messages TEXT DEFAULT 'everyone' CHECK (allow_direct_messages IN ('everyone', 'friends', 'none')),
    allow_friend_requests TEXT DEFAULT 'everyone' CHECK (allow_friend_requests IN ('everyone', 'friends_of_friends', 'none')),
    email_notifications BOOLEAN DEFAULT TRUE NOT NULL,
    desktop_notifications BOOLEAN DEFAULT TRUE NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);

-- ==============================================================================
-- 3. SOCIAL (FRIEND REQUESTS, FRIENDSHIPS, BLOCKS)
-- ==============================================================================

CREATE TYPE friend_request_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');

CREATE TABLE IF NOT EXISTS public.friend_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status friend_request_status DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT check_not_self_request CHECK (sender_id <> receiver_id),
    CONSTRAINT unique_pending_request UNIQUE (sender_id, receiver_id)
);

CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT check_not_self_friend CHECK (user_id <> friend_id),
    CONSTRAINT unique_friendship UNIQUE (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS public.blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT check_not_self_block CHECK (blocker_id <> blocked_id),
    CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id)
);

-- ==============================================================================
-- 4. CONVERSATIONS & REALTIME MESSAGING
-- ==============================================================================

CREATE TYPE conversation_type AS ENUM ('direct', 'group');

CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type conversation_type NOT NULL,
    name TEXT,
    icon_url TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT unique_conversation_member UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT,
    reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    is_pinned BOOLEAN DEFAULT FALSE NOT NULL,
    is_edited BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_timeline ON public.messages(conversation_id, created_at DESC);

-- ==============================================================================
-- 5. CALL SESSIONS & WEBRTC/LIVEKIT
-- ==============================================================================

CREATE TYPE call_session_status AS ENUM ('ringing', 'active', 'ended', 'missed', 'rejected');

CREATE TABLE IF NOT EXISTS public.call_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    channel_id UUID,
    caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    livekit_room_name TEXT NOT NULL,
    is_video BOOLEAN DEFAULT FALSE NOT NULL,
    status call_session_status DEFAULT 'ringing' NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    ended_at TIMESTAMPTZ
);

-- ==============================================================================
-- 6. SOUNDBOARD CLIPS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.soundboard_clips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    server_id UUID,
    title TEXT NOT NULL,
    audio_url TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    volume NUMERIC(3,2) DEFAULT 1.0,
    shortcut_key TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ==============================================================================
-- 7. NOTIFICATIONS & REPORTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reported_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ==============================================================================
-- 8. AUTOMATIC PROFILE CREATION TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_username TEXT;
    new_display_name TEXT;
BEGIN
    -- Extract username and display_name from raw user metadata or generate defaults
    new_username := COALESCE(
        NEW.raw_user_meta_data->>'username',
        'gamer_' || SUBSTRING(NEW.id::text FROM 1 FOR 8)
    );
    new_display_name := COALESCE(
        NEW.raw_user_meta_data->>'display_name',
        NEW.raw_user_meta_data->>'username',
        'Gamer'
    );

    -- Insert profile
    INSERT INTO public.profiles (id, username, display_name, status)
    VALUES (NEW.id, new_username, new_display_name, 'online')
    ON CONFLICT (id) DO NOTHING;

    -- Insert default user settings
    INSERT INTO public.user_settings (user_id, theme, accent_color)
    VALUES (NEW.id, 'dark', 'violet')
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soundboard_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone" 
    ON public.profiles FOR SELECT 
    USING (true);

CREATE POLICY "Users can update their own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

-- Settings Policies
CREATE POLICY "Users can view their own settings" 
    ON public.user_settings FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" 
    ON public.user_settings FOR UPDATE 
    USING (auth.uid() = user_id);

-- Conversations Policies
CREATE POLICY "Members can view conversations"
    ON public.conversations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members
            WHERE conversation_members.conversation_id = conversations.id
            AND conversation_members.user_id = auth.uid()
        )
    );

-- Messages Policies
CREATE POLICY "Members can view messages in their conversations"
    ON public.messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members
            WHERE conversation_members.conversation_id = messages.conversation_id
            AND conversation_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Members can insert messages in their conversations"
    ON public.messages FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM public.conversation_members
            WHERE conversation_members.conversation_id = messages.conversation_id
            AND conversation_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Senders can edit their own messages"
    ON public.messages FOR UPDATE
    USING (auth.uid() = sender_id);
