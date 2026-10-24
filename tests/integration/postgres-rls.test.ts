// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

describe('PostgreSQL / Supabase RLS Multi-User Integration Tests', () => {
  let db: PGlite;

  const ALICE_ID = '11111111-1111-1111-1111-111111111111';
  const BOB_ID = '22222222-2222-2222-2222-222222222222';
  const CHARLIE_ID = '33333333-3333-3333-3333-333333333333';
  const SERVER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const OTHER_SERVER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const CHANNEL_ID = '12121212-1212-1212-1212-121212121212';
  const OTHER_CHANNEL_ID = '34343434-3434-3434-3434-343434343434';
  const CONV_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const OTHER_CONV_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  const asUser = async (userId: string | null) => {
    if (userId) {
      await db.exec(`
        SET ROLE authenticated;
        SET request.jwt.claim.sub = '${userId}';
        SET request.jwt.claim.role = 'authenticated';
      `);
    } else {
      await db.exec(`
        SET ROLE anon;
        RESET request.jwt.claim.sub;
        SET request.jwt.claim.role = 'anon';
      `);
    }
  };

  const asSuperuser = async () => {
    await db.exec(`
      RESET ROLE;
      RESET request.jwt.claim.sub;
      RESET request.jwt.claim.role;
    `);
  };

  beforeEach(async () => {
    db = new PGlite();
    await db.ready;

    // 1. Setup Supabase auth schema and helper functions
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOINHERIT;
        END IF;
      END $$;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
      $$ LANGUAGE sql STABLE;

      -- Base tables
      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY,
        username TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS public.user_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
        allow_direct_messages TEXT DEFAULT 'everyone',
        allow_friend_requests TEXT DEFAULT 'everyone'
      );

      CREATE TABLE IF NOT EXISTS public.blocks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        CONSTRAINT unique_block UNIQUE(blocker_id, blocked_id)
      );

      CREATE TABLE IF NOT EXISTS public.friendships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        CONSTRAINT unique_friendship UNIQUE(user_id, friend_id)
      );

      CREATE TABLE IF NOT EXISTS public.friend_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS public.servers (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id UUID NOT NULL REFERENCES public.profiles(id)
      );

      CREATE TABLE IF NOT EXISTS public.server_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
        timeout_until TIMESTAMPTZ,
        CONSTRAINT unique_member UNIQUE(server_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS public.server_invites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
        code TEXT NOT NULL UNIQUE,
        created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        max_uses INT DEFAULT 0,
        uses INT DEFAULT 0 NOT NULL,
        expires_at TIMESTAMPTZ,
        is_revoked BOOLEAN DEFAULT FALSE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS public.server_bans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        banned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        reason TEXT,
        CONSTRAINT unique_server_ban UNIQUE(server_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS public.channels (
        id UUID PRIMARY KEY,
        server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text'
      );

      CREATE TABLE IF NOT EXISTS public.channel_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        is_edited BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.conversations (
        id UUID PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'direct',
        created_by UUID NOT NULL REFERENCES public.profiles(id)
      );

      CREATE TABLE IF NOT EXISTS public.conversation_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
        last_read_at TIMESTAMPTZ,
        CONSTRAINT unique_conv_member UNIQUE(conversation_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS public.messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        reply_to_id UUID,
        is_pinned BOOLEAN DEFAULT FALSE,
        is_edited BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Storage schema mockup
      CREATE TABLE IF NOT EXISTS storage.buckets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public BOOLEAN DEFAULT FALSE,
        file_size_limit BIGINT,
        allowed_mime_types TEXT[]
      );

      CREATE TABLE IF NOT EXISTS storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT NOT NULL REFERENCES storage.buckets(id),
        name TEXT NOT NULL,
        owner UUID
      );

      CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
      RETURNS TEXT[] LANGUAGE plpgsql AS $$
      BEGIN
        RETURN string_to_array(name, '/');
      END;
      $$;

      -- Helper functions
      CREATE OR REPLACE FUNCTION public.is_server_owner(p_server_id UUID, p_user_id UUID)
      RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.servers
          WHERE id = p_server_id AND owner_id = p_user_id
        );
      $$;

      CREATE OR REPLACE FUNCTION public.is_server_member(p_server_id UUID, p_user_id UUID)
      RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.server_members
          WHERE server_id = p_server_id AND user_id = p_user_id
        );
      $$;

      CREATE OR REPLACE FUNCTION public.is_server_owner_or_admin(p_server_id UUID, p_user_id UUID)
      RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.servers s
          LEFT JOIN public.server_members sm ON sm.server_id = s.id AND sm.user_id = p_user_id
          WHERE s.id = p_server_id
          AND (s.owner_id = p_user_id OR sm.role IN ('owner', 'admin'))
        );
      $$;

      CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conv_id UUID, p_user_id UUID)
      RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.conversation_members
          WHERE conversation_id = p_conv_id AND user_id = p_user_id
        );
      $$;

      CREATE OR REPLACE FUNCTION public.is_conversation_creator_or_admin(p_conv_id UUID, p_user_id UUID)
      RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.conversations WHERE id = p_conv_id AND created_by = p_user_id
        ) OR EXISTS (
          SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conv_id AND user_id = p_user_id AND role IN ('owner', 'admin')
        );
      $$;

      -- Enable RLS
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

      -- user_settings policies
      CREATE POLICY "Users can view their own settings"
        ON public.user_settings FOR SELECT
        USING (auth.uid() = user_id);

      CREATE POLICY "Users can update their own settings"
        ON public.user_settings FOR UPDATE
        USING (auth.uid() = user_id);

      CREATE POLICY "Users can insert their own settings"
        ON public.user_settings FOR INSERT
        WITH CHECK (auth.uid() = user_id);

      -- -----------------------------------------------------------------------
      -- APPLY 00019 POLICIES & TRIGGERS
      -- -----------------------------------------------------------------------

      -- S1: conversation_members UPDATE & immutability trigger
      CREATE POLICY "Conversation members can update their own read state"
        ON public.conversation_members FOR UPDATE
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);

      CREATE POLICY "Conversation owners and admins can update members"
        ON public.conversation_members FOR UPDATE
        USING (public.is_conversation_creator_or_admin(conversation_id, auth.uid()))
        WITH CHECK (public.is_conversation_creator_or_admin(conversation_id, auth.uid()));

      CREATE POLICY "Conversation members can view members"
        ON public.conversation_members FOR SELECT
        USING (public.is_conversation_member(conversation_id, auth.uid()));

      CREATE POLICY "Conversation admins and creators can add members"
        ON public.conversation_members FOR INSERT
        WITH CHECK (public.is_conversation_creator_or_admin(conversation_id, auth.uid()));

      CREATE OR REPLACE FUNCTION public.trg_conversation_members_immutability()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        IF NEW.id <> OLD.id THEN RAISE EXCEPTION 'conversation_members.id is immutable'; END IF;
        IF NEW.conversation_id <> OLD.conversation_id THEN RAISE EXCEPTION 'conversation_members.conversation_id is immutable'; END IF;
        IF NEW.user_id <> OLD.user_id THEN RAISE EXCEPTION 'conversation_members.user_id is immutable'; END IF;
        IF NEW.role IS DISTINCT FROM OLD.role THEN
          IF NOT public.is_conversation_creator_or_admin(OLD.conversation_id, auth.uid()) THEN
            RAISE EXCEPTION 'Only conversation owners or admins can modify member roles';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS trg_conversation_members_immutability ON public.conversation_members;
      CREATE TRIGGER trg_conversation_members_immutability
        BEFORE UPDATE ON public.conversation_members
        FOR EACH ROW EXECUTE FUNCTION public.trg_conversation_members_immutability();

      -- S2: conversations policy & immutability trigger
      CREATE POLICY "Users can create conversations as creator"
        ON public.conversations FOR INSERT
        WITH CHECK (auth.uid() = created_by);

      CREATE POLICY "Group owners and admins can update conversations"
        ON public.conversations FOR UPDATE
        USING (public.is_conversation_creator_or_admin(id, auth.uid()))
        WITH CHECK (public.is_conversation_creator_or_admin(id, auth.uid()));

      CREATE POLICY "Conversation members can view conversations"
        ON public.conversations FOR SELECT
        USING (created_by = auth.uid() OR public.is_conversation_member(id, auth.uid()));

      CREATE OR REPLACE FUNCTION public.trg_conversations_immutability()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        IF NEW.id <> OLD.id THEN RAISE EXCEPTION 'conversations.id is immutable'; END IF;
        IF NEW.created_by <> OLD.created_by THEN RAISE EXCEPTION 'conversations.created_by is immutable'; END IF;
        IF NEW.type <> OLD.type THEN RAISE EXCEPTION 'conversations.type is immutable'; END IF;
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS trg_conversations_immutability ON public.conversations;
      CREATE TRIGGER trg_conversations_immutability
        BEFORE UPDATE ON public.conversations
        FOR EACH ROW EXECUTE FUNCTION public.trg_conversations_immutability();

      -- S3: messages policy & immutability trigger
      CREATE POLICY "Members can read conversation messages" ON public.messages
        FOR SELECT USING (public.is_conversation_member(conversation_id, auth.uid()));

      CREATE POLICY "Members can insert conversation messages" ON public.messages
        FOR INSERT WITH CHECK (auth.uid() = sender_id AND public.is_conversation_member(conversation_id, auth.uid()));

      CREATE POLICY "Authors can update their own messages" ON public.messages
        FOR UPDATE USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);

      CREATE OR REPLACE FUNCTION public.trg_messages_immutability()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        IF NEW.id <> OLD.id THEN RAISE EXCEPTION 'messages.id is immutable'; END IF;
        IF NEW.conversation_id <> OLD.conversation_id THEN RAISE EXCEPTION 'messages.conversation_id is immutable'; END IF;
        IF NEW.sender_id <> OLD.sender_id THEN RAISE EXCEPTION 'messages.sender_id is immutable'; END IF;
        IF NEW.created_at <> OLD.created_at THEN RAISE EXCEPTION 'messages.created_at is immutable'; END IF;
        IF NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id THEN RAISE EXCEPTION 'messages.reply_to_id is immutable'; END IF;
        IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned THEN
          IF NOT public.is_conversation_member(OLD.conversation_id, auth.uid()) THEN
            RAISE EXCEPTION 'Only conversation members can pin or unpin messages';
          END IF;
        END IF;
        IF NEW.content IS DISTINCT FROM OLD.content THEN
          NEW.is_edited := true;
          NEW.updated_at := NOW();
        END IF;
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS trg_messages_immutability ON public.messages;
      CREATE TRIGGER trg_messages_immutability
        BEFORE UPDATE ON public.messages
        FOR EACH ROW EXECUTE FUNCTION public.trg_messages_immutability();

      -- S4: channel_messages policy & immutability trigger
      CREATE POLICY "Users can insert their own channel messages" ON public.channel_messages
        FOR INSERT WITH CHECK (auth.uid() = user_id);

      CREATE POLICY "Users can view channel messages" ON public.channel_messages
        FOR SELECT USING (true);

      CREATE POLICY "Users can update their own channel messages" ON public.channel_messages
        FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

      CREATE OR REPLACE FUNCTION public.trg_channel_messages_immutability()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        IF NEW.id <> OLD.id THEN RAISE EXCEPTION 'channel_messages.id is immutable'; END IF;
        IF NEW.channel_id <> OLD.channel_id THEN RAISE EXCEPTION 'channel_messages.channel_id is immutable'; END IF;
        IF NEW.user_id <> OLD.user_id THEN RAISE EXCEPTION 'channel_messages.user_id is immutable'; END IF;
        IF NEW.created_at <> OLD.created_at THEN RAISE EXCEPTION 'channel_messages.created_at is immutable'; END IF;
        IF NEW.content IS DISTINCT FROM OLD.content THEN
          NEW.is_edited := true;
          NEW.updated_at := NOW();
        END IF;
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS trg_channel_messages_immutability ON public.channel_messages;
      CREATE TRIGGER trg_channel_messages_immutability
        BEFORE UPDATE ON public.channel_messages
        FOR EACH ROW EXECUTE FUNCTION public.trg_channel_messages_immutability();

      -- S5: server_members & servers policies + join RPC
      CREATE POLICY "Owners and admins can add server members" ON public.server_members
        FOR INSERT WITH CHECK (
          public.is_server_owner(server_id, auth.uid()) OR
          (public.is_server_owner_or_admin(server_id, auth.uid()) AND role = 'member')
        );

      CREATE POLICY "Server members can view member lists" ON public.server_members
        FOR SELECT USING (
          public.is_server_owner(server_id, auth.uid()) OR
          public.is_server_member(server_id, auth.uid())
        );

      CREATE POLICY "Members and owners can view servers" ON public.servers
        FOR SELECT USING (
          public.is_server_owner(id, auth.uid()) OR
          public.is_server_member(id, auth.uid())
        );

      CREATE OR REPLACE FUNCTION public.join_server_with_invite(p_code TEXT)
      RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      DECLARE
        caller_id UUID := auth.uid();
        inv RECORD;
        v_server_id UUID;
      BEGIN
        IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
        SELECT * INTO inv FROM public.server_invites WHERE code = trim(p_code);
        IF inv.id IS NULL THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
        IF inv.is_revoked THEN RAISE EXCEPTION 'Invite code has been revoked'; END IF;
        IF inv.expires_at IS NOT NULL AND inv.expires_at <= NOW() THEN RAISE EXCEPTION 'Invite code has expired'; END IF;
        IF inv.max_uses > 0 AND inv.uses >= inv.max_uses THEN RAISE EXCEPTION 'Invite code has reached its maximum uses'; END IF;

        v_server_id := inv.server_id;
        IF EXISTS (SELECT 1 FROM public.server_bans WHERE server_id = v_server_id AND user_id = caller_id) THEN
          RAISE EXCEPTION 'You are banned from this server';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = v_server_id AND user_id = caller_id) THEN
          INSERT INTO public.server_members (server_id, user_id, role) VALUES (v_server_id, caller_id, 'member');
          UPDATE public.server_invites SET uses = uses + 1 WHERE id = inv.id;
        END IF;

        RETURN jsonb_build_object('success', true, 'server_id', v_server_id);
      END;
      $$;

      -- S6: Blocklist and DM privacy triggers
      CREATE OR REPLACE FUNCTION public.trg_check_dm_message_privacy()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      DECLARE
        v_conv_type TEXT;
        v_recipient_id UUID;
        v_policy TEXT;
      BEGIN
        SELECT type INTO v_conv_type FROM public.conversations WHERE id = NEW.conversation_id;
        IF v_conv_type = 'direct' THEN
          SELECT user_id INTO v_recipient_id FROM public.conversation_members
          WHERE conversation_id = NEW.conversation_id AND user_id <> NEW.sender_id LIMIT 1;

          IF v_recipient_id IS NOT NULL THEN
            IF EXISTS (
              SELECT 1 FROM public.blocks
              WHERE (blocker_id = NEW.sender_id AND blocked_id = v_recipient_id)
                 OR (blocker_id = v_recipient_id AND blocked_id = NEW.sender_id)
            ) THEN
              RAISE EXCEPTION 'Cannot send message to this user (blocked)';
            END IF;

            SELECT allow_direct_messages INTO v_policy FROM public.user_settings WHERE user_id = v_recipient_id;
            IF v_policy = 'none' THEN
              RAISE EXCEPTION 'Recipient does not accept direct messages';
            ELSIF v_policy = 'friends' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.friendships
                WHERE (user_id = NEW.sender_id AND friend_id = v_recipient_id)
                   OR (user_id = v_recipient_id AND friend_id = NEW.sender_id)
              ) THEN
                RAISE EXCEPTION 'Recipient only accepts direct messages from friends';
              END IF;
            END IF;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS trg_check_dm_message_privacy ON public.messages;
      CREATE TRIGGER trg_check_dm_message_privacy
        BEFORE INSERT ON public.messages
        FOR EACH ROW EXECUTE FUNCTION public.trg_check_dm_message_privacy();

      -- S8: user_communication_privacy view & profiles policy
      CREATE OR REPLACE VIEW public.user_communication_privacy WITH (security_invoker = true) AS
      SELECT user_id, allow_direct_messages, allow_friend_requests FROM public.user_settings;

      REVOKE ALL ON public.user_communication_privacy FROM anon;
      GRANT SELECT ON public.user_communication_privacy TO authenticated;

      CREATE POLICY "Authenticated users can view profiles" ON public.profiles
        FOR SELECT TO authenticated USING (true);

      -- S9: Storage objects policy
      CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
        FOR INSERT WITH CHECK (
          bucket_id = 'avatars' AND
          auth.role() = 'authenticated' AND
          (storage.foldername(name))[1] = auth.uid()::text
        );

      -- 00020 constraints: 4000 char length checks
      ALTER TABLE public.messages
        ADD CONSTRAINT messages_content_length_check
        CHECK (char_length(content) <= 4000);

      ALTER TABLE public.channel_messages
        ADD CONSTRAINT channel_messages_content_length_check
        CHECK (char_length(content) <= 4000);

      -- Grants
      GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, anon;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT SELECT ON public.profiles TO anon;
      GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
    `);

    // Seed test profiles and servers as superuser
    await db.exec(`
      RESET ROLE;
      INSERT INTO public.profiles (id, username) VALUES
        ('${ALICE_ID}', 'alice'),
        ('${BOB_ID}', 'bob'),
        ('${CHARLIE_ID}', 'charlie')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.servers (id, name, owner_id) VALUES
        ('${SERVER_ID}', 'Alice Gaming Sanctuary', '${ALICE_ID}'),
        ('${OTHER_SERVER_ID}', 'Shadow Ops Server', '${CHARLIE_ID}')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.server_members (server_id, user_id, role) VALUES
        ('${SERVER_ID}', '${ALICE_ID}', 'owner'),
        ('${OTHER_SERVER_ID}', '${CHARLIE_ID}', 'owner')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.channels (id, server_id, name, type) VALUES
        ('${CHANNEL_ID}', '${SERVER_ID}', 'general', 'text'),
        ('${OTHER_CHANNEL_ID}', '${OTHER_SERVER_ID}', 'secret-intel', 'text')
      ON CONFLICT DO NOTHING;

      INSERT INTO storage.buckets (id, name, public) VALUES
        ('avatars', 'avatars', true),
        ('attachments', 'attachments', false)
      ON CONFLICT DO NOTHING;
    `);
  });

  describe('S1: Conversation Members Role Escalation & Immutability', () => {
    beforeEach(async () => {
      await asSuperuser();
      await db.exec(`
        INSERT INTO public.conversations (id, created_by, type)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'group')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'owner'),
               ('${CONV_ID}', '${BOB_ID}', 'member')
        ON CONFLICT DO NOTHING;
      `);
    });

    it('rejects plain member attempting to self-promote to owner or admin', async () => {
      await asUser(BOB_ID);

      await expect(
        db.query(`
          UPDATE public.conversation_members
          SET role = 'owner'
          WHERE conversation_id = '${CONV_ID}' AND user_id = '${BOB_ID}'
        `)
      ).rejects.toThrow(/Only conversation owners or admins can modify member roles/);

      // Verify Bob is still regular member
      const check = await db.query<{ role: string }>(`
        SELECT role FROM public.conversation_members WHERE user_id = '${BOB_ID}'
      `);
      expect(check.rows[0].role).toBe('member');
    });

    it('rejects modification of immutable conversation_id or user_id columns', async () => {
      await asUser(BOB_ID);

      await expect(
        db.query(`
          UPDATE public.conversation_members
          SET conversation_id = '${OTHER_CONV_ID}'
          WHERE user_id = '${BOB_ID}'
        `)
      ).rejects.toThrow(/conversation_members.conversation_id is immutable/);

      await expect(
        db.query(`
          UPDATE public.conversation_members
          SET user_id = '${CHARLIE_ID}'
          WHERE conversation_id = '${CONV_ID}' AND user_id = '${BOB_ID}'
        `)
      ).rejects.toThrow(/conversation_members.user_id is immutable/);
    });

    it('allows a member to update their own last_read_at timestamp', async () => {
      await asUser(BOB_ID);
      const res = await db.query(`
        UPDATE public.conversation_members
        SET last_read_at = NOW()
        WHERE conversation_id = '${CONV_ID}' AND user_id = '${BOB_ID}'
      `);
      expect(res.affectedRows).toBe(1);
    });
  });

  describe('S2: Conversations Update Lockdown & Immutability', () => {
    beforeEach(async () => {
      await asSuperuser();
      await db.exec(`
        INSERT INTO public.conversations (id, created_by, type)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'group')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'owner'),
               ('${CONV_ID}', '${BOB_ID}', 'member')
        ON CONFLICT DO NOTHING;
      `);
    });

    it('prevents regular members from updating conversation row', async () => {
      await asUser(BOB_ID);

      // Bob tries to update created_by to himself
      const res = await db.query(`
        UPDATE public.conversations
        SET created_by = '${BOB_ID}'
        WHERE id = '${CONV_ID}'
      `);
      // RLS policy for UPDATE requires is_conversation_creator_or_admin, so 0 rows affected
      expect(res.affectedRows).toBe(0);
    });

    it('rejects attempt to alter immutable created_by or type even by owner', async () => {
      await asUser(ALICE_ID);

      await expect(
        db.query(`
          UPDATE public.conversations
          SET created_by = '${BOB_ID}'
          WHERE id = '${CONV_ID}'
        `)
      ).rejects.toThrow(/conversations.created_by is immutable/);

      await expect(
        db.query(`
          UPDATE public.conversations
          SET type = 'direct'
          WHERE id = '${CONV_ID}'
        `)
      ).rejects.toThrow(/conversations.type is immutable/);
    });
  });

  describe('S3: Messages Metadata Immutability & Pinning Control', () => {
    let msgId: string;

    beforeEach(async () => {
      await asSuperuser();
      await db.exec(`
        INSERT INTO public.conversations (id, created_by, type)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'group')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'owner'),
               ('${CONV_ID}', '${BOB_ID}', 'member')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.conversations (id, created_by, type)
        VALUES ('${OTHER_CONV_ID}', '${CHARLIE_ID}', 'group')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES ('${OTHER_CONV_ID}', '${CHARLIE_ID}', 'owner')
        ON CONFLICT DO NOTHING;
      `);

      const insertRes = await db.query<{ id: string }>(`
        INSERT INTO public.messages (conversation_id, sender_id, content)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'Original confidential payload')
        RETURNING id
      `);
      msgId = insertRes.rows[0].id;
    });

    it('rejects author altering conversation_id to inject message into another conversation', async () => {
      await asUser(ALICE_ID);

      await expect(
        db.query(`
          UPDATE public.messages
          SET conversation_id = '${OTHER_CONV_ID}'
          WHERE id = '${msgId}'
        `)
      ).rejects.toThrow(/messages.conversation_id is immutable/);
    });

    it('rejects author altering sender_id, created_at, or reply_to_id', async () => {
      await asUser(ALICE_ID);

      await expect(
        db.query(`
          UPDATE public.messages
          SET sender_id = '${BOB_ID}'
          WHERE id = '${msgId}'
        `)
      ).rejects.toThrow(/messages.sender_id is immutable/);

      await expect(
        db.query(`
          UPDATE public.messages
          SET created_at = '2020-01-01 00:00:00Z'
          WHERE id = '${msgId}'
        `)
      ).rejects.toThrow(/messages.created_at is immutable/);
    });

    it('allows content edit and automatically sets is_edited and updated_at', async () => {
      await asUser(ALICE_ID);

      await db.query(`
        UPDATE public.messages
        SET content = 'Corrected strategic briefing'
        WHERE id = '${msgId}'
      `);

      const res = await db.query<{ content: string; is_edited: boolean }>(`
        SELECT content, is_edited FROM public.messages WHERE id = '${msgId}'
      `);
      expect(res.rows[0].content).toBe('Corrected strategic briefing');
      expect(res.rows[0].is_edited).toBe(true);
    });

    it('rejects non-members attempting to pin or unpin messages', async () => {
      await asUser(CHARLIE_ID); // Charlie is not in CONV_ID

      // Non-member direct update is locked down by RLS (0 rows affected)
      const res = await db.query(`
        UPDATE public.messages
        SET is_pinned = true
        WHERE id = '${msgId}'
      `);
      expect(res.affectedRows).toBe(0);

      // Verify message is still unpinned
      const check = await db.query<{ is_pinned: boolean }>(`
        SELECT is_pinned FROM public.messages WHERE id = '${msgId}'
      `);
      expect(check.rows[0]?.is_pinned ?? false).toBe(false);
    });
  });

  describe('S4: Channel Messages Column Immutability', () => {
    let chanMsgId: string;

    beforeEach(async () => {
      await asUser(ALICE_ID);
      const res = await db.query<{ id: string }>(`
        INSERT INTO public.channel_messages (channel_id, user_id, content)
        VALUES ('${CHANNEL_ID}', '${ALICE_ID}', 'Initial channel alert')
        RETURNING id
      `);
      chanMsgId = res.rows[0].id;
    });

    it('rejects author moving message to another channel or altering user_id', async () => {
      await asUser(ALICE_ID);

      await expect(
        db.query(`
          UPDATE public.channel_messages
          SET channel_id = '${OTHER_CHANNEL_ID}'
          WHERE id = '${chanMsgId}'
        `)
      ).rejects.toThrow(/channel_messages.channel_id is immutable/);

      await expect(
        db.query(`
          UPDATE public.channel_messages
          SET user_id = '${BOB_ID}'
          WHERE id = '${chanMsgId}'
        `)
      ).rejects.toThrow(/channel_messages.user_id is immutable/);
    });
  });

  describe('S5: Server Join Security, Invites, Bans & Discovery Isolation', () => {
    beforeEach(async () => {
      await asUser(ALICE_ID);
      await db.exec(`
        INSERT INTO public.server_invites (server_id, code, created_by, max_uses, expires_at)
        VALUES 
          ('${SERVER_ID}', 'active123', '${ALICE_ID}', 5, NOW() + INTERVAL '1 hour'),
          ('${SERVER_ID}', 'expired99', '${ALICE_ID}', 5, NOW() - INTERVAL '1 hour'),
          ('${SERVER_ID}', 'maxedout1', '${ALICE_ID}', 1, NOW() + INTERVAL '1 hour')
        ON CONFLICT DO NOTHING;

        UPDATE public.server_invites SET uses = 1 WHERE code = 'maxedout1';
      `);
    });

    it('strictly rejects direct self-insert into server_members without invitation', async () => {
      await asUser(BOB_ID);

      // Direct INSERT by non-admin must fail RLS WITH CHECK
      await expect(
        db.query(`
          INSERT INTO public.server_members (server_id, user_id, role)
          VALUES ('${SERVER_ID}', '${BOB_ID}', 'member')
        `)
      ).rejects.toThrow();
    });

    it('hides unjoined servers from non-members (anti-enumeration)', async () => {
      await asUser(BOB_ID);

      const res = await db.query(`SELECT * FROM public.servers WHERE id = '${SERVER_ID}'`);
      expect(res.rows.length).toBe(0);
    });

    it('allows joining via valid invite code and makes server discoverable', async () => {
      await asUser(BOB_ID);

      const joinRes = await db.query<{ join_server_with_invite: { success: boolean; server_id: string } }>(`
        SELECT public.join_server_with_invite('active123')
      `);
      expect(joinRes.rows[0].join_server_with_invite.success).toBe(true);
      expect(joinRes.rows[0].join_server_with_invite.server_id).toBe(SERVER_ID);

      // Now Bob is a member: querying servers must return the server row
      const srvCheck = await db.query(`SELECT * FROM public.servers WHERE id = '${SERVER_ID}'`);
      expect(srvCheck.rows.length).toBe(1);
    });

    it('rejects joining with an expired invite code', async () => {
      await asUser(BOB_ID);

      await expect(
        db.query(`SELECT public.join_server_with_invite('expired99')`)
      ).rejects.toThrow(/Invite code has expired/);
    });

    it('rejects joining with an invite code that exceeded max uses', async () => {
      await asUser(BOB_ID);

      await expect(
        db.query(`SELECT public.join_server_with_invite('maxedout1')`)
      ).rejects.toThrow(/Invite code has reached its maximum uses/);
    });

    it('rejects banned user from joining via invite', async () => {
      // Alice bans Bob from the server
      await asUser(ALICE_ID);
      await db.query(`
        INSERT INTO public.server_bans (server_id, user_id, banned_by, reason)
        VALUES ('${SERVER_ID}', '${BOB_ID}', '${ALICE_ID}', 'Toxic behavior')
      `);

      // Bob tries to join using the valid invite
      await asUser(BOB_ID);
      await expect(
        db.query(`SELECT public.join_server_with_invite('active123')`)
      ).rejects.toThrow(/You are banned from this server/);
    });
  });

  describe('S6: Block List & Direct Message Privacy Enforced in DB Triggers', () => {
    beforeEach(async () => {
      // Alice creates a direct conversation with Bob
      await asSuperuser();
      await db.exec(`
        INSERT INTO public.conversations (id, created_by, type)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'direct')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'owner'),
               ('${CONV_ID}', '${BOB_ID}', 'member')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.user_settings (user_id, allow_direct_messages)
        VALUES ('${BOB_ID}', 'everyone')
        ON CONFLICT (user_id) DO UPDATE SET allow_direct_messages = 'everyone';
      `);
    });

    it('blocks user from inserting DM if either user has blocked the other', async () => {
      // Bob blocks Alice
      await asUser(BOB_ID);
      await db.query(`
        INSERT INTO public.blocks (blocker_id, blocked_id)
        VALUES ('${BOB_ID}', '${ALICE_ID}')
      `);

      // Alice tries to insert message to Bob
      await asUser(ALICE_ID);
      await expect(
        db.query(`
          INSERT INTO public.messages (conversation_id, sender_id, content)
          VALUES ('${CONV_ID}', '${ALICE_ID}', 'Hey Bob are you there?')
        `)
      ).rejects.toThrow(/Cannot send message to this user \(blocked\)/);
    });

    it('blocks DM insertion when recipient allow_direct_messages is "none"', async () => {
      // Bob sets DM policy to none
      await asUser(BOB_ID);
      await db.query(`
        UPDATE public.user_settings
        SET allow_direct_messages = 'none'
        WHERE user_id = '${BOB_ID}'
      `);

      // Alice tries to message Bob
      await asUser(ALICE_ID);
      await expect(
        db.query(`
          INSERT INTO public.messages (conversation_id, sender_id, content)
          VALUES ('${CONV_ID}', '${ALICE_ID}', 'Checking in')
        `)
      ).rejects.toThrow(/Recipient does not accept direct messages/);
    });

    it('blocks DM insertion when recipient allow_direct_messages is "friends" and not friends', async () => {
      // Bob sets DM policy to friends
      await asUser(BOB_ID);
      await db.query(`
        UPDATE public.user_settings
        SET allow_direct_messages = 'friends'
        WHERE user_id = '${BOB_ID}'
      `);

      // Alice is not in friendships with Bob
      await asUser(ALICE_ID);
      await expect(
        db.query(`
          INSERT INTO public.messages (conversation_id, sender_id, content)
          VALUES ('${CONV_ID}', '${ALICE_ID}', 'Hello stranger')
        `)
      ).rejects.toThrow(/Recipient only accepts direct messages from friends/);

      // Now establish friendship
      await db.query(`
        INSERT INTO public.friendships (user_id, friend_id)
        VALUES ('${ALICE_ID}', '${BOB_ID}')
      `);

      // Now sending DM succeeds
      const res = await db.query(`
        INSERT INTO public.messages (conversation_id, sender_id, content)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'Hello friend!')
      `);
      expect(res.affectedRows).toBe(1);
    });
  });

  describe('S8: User Communication Privacy View & Profile Read Lockdown', () => {
    it('revokes SELECT from anon role on user_communication_privacy view', async () => {
      await asUser(null); // Anonymous role

      await expect(
        db.query(`SELECT * FROM public.user_communication_privacy`)
      ).rejects.toThrow();
    });

    it('blocks anon role from reading user profiles', async () => {
      await asUser(null); // Anonymous role

      const res = await db.query(`SELECT * FROM public.profiles`);
      expect(res.rows.length).toBe(0);
    });

    it('allows authenticated users to read user profiles', async () => {
      await asUser(ALICE_ID);

      const res = await db.query(`SELECT * FROM public.profiles`);
      expect(res.rows.length).toBeGreaterThan(0);
    });
  });

  describe('S9: Storage Objects Path Prefix Isolation', () => {
    it('allows user to upload avatar to their own userId path segment', async () => {
      await asUser(ALICE_ID);

      const res = await db.query(`
        INSERT INTO storage.objects (bucket_id, name, owner)
        VALUES ('avatars', '${ALICE_ID}/avatar.png', '${ALICE_ID}')
      `);
      expect(res.affectedRows).toBe(1);
    });

    it('strictly rejects user uploading avatar into another user path', async () => {
      await asUser(BOB_ID);

      // Bob tries to overwrite Alice's avatar
      await expect(
        db.query(`
          INSERT INTO storage.objects (bucket_id, name, owner)
          VALUES ('avatars', '${ALICE_ID}/malicious_avatar.png', '${BOB_ID}')
        `)
      ).rejects.toThrow();
    });
  });

  describe('M7: Database Max Content Length Constraints (Migration 00020)', () => {
    it('rejects inserting messages with content exceeding 4000 characters', async () => {
      await asSuperuser();
      await db.exec(`
        INSERT INTO public.conversations (id, created_by, type)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'direct')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'owner'),
               ('${CONV_ID}', '${BOB_ID}', 'member')
        ON CONFLICT DO NOTHING;
      `);

      await asUser(ALICE_ID);
      const oversized = 'X'.repeat(4001);

      await expect(
        db.query(`
          INSERT INTO public.messages (conversation_id, sender_id, content)
          VALUES ('${CONV_ID}', '${ALICE_ID}', '${oversized}')
        `)
      ).rejects.toThrow(/messages_content_length_check/);
    });

    it('rejects inserting channel_messages with content exceeding 4000 characters', async () => {
      await asUser(ALICE_ID);
      const oversized = 'Y'.repeat(4001);

      await expect(
        db.query(`
          INSERT INTO public.channel_messages (channel_id, user_id, content)
          VALUES ('${CHANNEL_ID}', '${ALICE_ID}', '${oversized}')
        `)
      ).rejects.toThrow(/channel_messages_content_length_check/);
    });
  });
});
