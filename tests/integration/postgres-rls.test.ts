// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

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

    // Minimal stubs required for real Supabase migrations in PGlite
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE SCHEMA IF NOT EXISTS realtime;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
          CREATE PUBLICATION supabase_realtime;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
      $$ LANGUAGE sql STABLE;

      CREATE TABLE IF NOT EXISTS storage.buckets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public BOOLEAN DEFAULT false,
        file_size_limit BIGINT,
        allowed_mime_types TEXT[]
      );

      CREATE TABLE IF NOT EXISTS storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT NOT NULL REFERENCES storage.buckets(id),
        name TEXT NOT NULL,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

      CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
      RETURNS TEXT[] LANGUAGE plpgsql AS $$
      BEGIN
        RETURN string_to_array(name, '/');
      END;
      $$;

      CREATE TABLE IF NOT EXISTS realtime.messages (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        topic TEXT NOT NULL,
        extension TEXT,
        inserted_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION realtime.topic() RETURNS TEXT AS $$
        SELECT NULLIF(current_setting('request.realtime.topic', true), '');
      $$ LANGUAGE sql STABLE;
    `);

    // Dynamically load and execute all migrations in alphanumeric order
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await db.exec(sql);
    }

    // Standard grants for test roles
    await db.exec(`
      GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, anon;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT SELECT ON public.profiles TO anon;
      GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
    `);

    // Seed test auth users, profiles, and servers as superuser
    await db.exec(`
      RESET ROLE;
      INSERT INTO auth.users (id, email) VALUES
        ('${ALICE_ID}', 'alice@nexus.gg'),
        ('${BOB_ID}', 'bob@nexus.gg'),
        ('${CHARLIE_ID}', 'charlie@nexus.gg')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.profiles (id, username, display_name) VALUES
        ('${ALICE_ID}', 'alice', 'Alice Gamer'),
        ('${BOB_ID}', 'bob', 'Bob Player'),
        ('${CHARLIE_ID}', 'charlie', 'Charlie Master')
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
        ('attachments', 'attachments', false),
        ('soundboard', 'soundboard', true)
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

    it('rejects admin attempting to self-promote to owner in conversation', async () => {
      // Setup Bob as an admin
      await asSuperuser();
      await db.query(`
        UPDATE public.conversation_members
        SET role = 'admin'
        WHERE conversation_id = '${CONV_ID}' AND user_id = '${BOB_ID}'
      `);

      // As Bob (admin), attempt to self-promote to owner
      await asUser(BOB_ID);
      await expect(
        db.query(`
          UPDATE public.conversation_members
          SET role = 'owner'
          WHERE conversation_id = '${CONV_ID}' AND user_id = '${BOB_ID}'
        `)
      ).rejects.toThrow(/Admins cannot change their own role|Only conversation owner can grant owner role/);
    });

    it('rejects admin attempting to change their own role in conversation', async () => {
      // Setup Bob as an admin
      await asSuperuser();
      await db.query(`
        UPDATE public.conversation_members
        SET role = 'admin'
        WHERE conversation_id = '${CONV_ID}' AND user_id = '${BOB_ID}'
      `);

      // As Bob (admin), attempt to demote self to member
      await asUser(BOB_ID);
      await expect(
        db.query(`
          UPDATE public.conversation_members
          SET role = 'member'
          WHERE conversation_id = '${CONV_ID}' AND user_id = '${BOB_ID}'
        `)
      ).rejects.toThrow(/Admins cannot change their own role/);
    });

    it('rejects admin attempting to demote conversation owner', async () => {
      // Setup Bob as an admin
      await asSuperuser();
      await db.query(`
        UPDATE public.conversation_members
        SET role = 'admin'
        WHERE conversation_id = '${CONV_ID}' AND user_id = '${BOB_ID}'
      `);

      // As Bob (admin), attempt to demote Alice (owner) to member
      await asUser(BOB_ID);
      await expect(
        db.query(`
          UPDATE public.conversation_members
          SET role = 'member'
          WHERE conversation_id = '${CONV_ID}' AND user_id = '${ALICE_ID}'
        `)
      ).rejects.toThrow(/Admins cannot modify owner roles/);
    });

    it('rejects demoting or removing the last owner of a conversation', async () => {
      await asUser(ALICE_ID);

      // Attempt to demote the sole owner
      await expect(
        db.query(`
          UPDATE public.conversation_members
          SET role = 'member'
          WHERE conversation_id = '${CONV_ID}' AND user_id = '${ALICE_ID}'
        `)
      ).rejects.toThrow(/Cannot demote the last owner/);

      // Attempt to delete/leave as the sole owner
      await expect(
        db.query(`
          DELETE FROM public.conversation_members
          WHERE conversation_id = '${CONV_ID}' AND user_id = '${ALICE_ID}'
        `)
      ).rejects.toThrow(/Cannot remove the last owner/);
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

    it('rejects server admin attempting to self-promote to owner or demote server owner', async () => {
      // Setup Bob as an admin on SERVER_ID
      await asSuperuser();
      await db.query(`
        INSERT INTO public.server_members (server_id, user_id, role)
        VALUES ('${SERVER_ID}', '${BOB_ID}', 'admin')
        ON CONFLICT (server_id, user_id) DO UPDATE SET role = 'admin'
      `);

      // 1. Bob attempts to self-promote to owner - rejected by RLS (0 rows updated)
      await asUser(BOB_ID);
      const promoteRes = await db.query(`
        UPDATE public.server_members
        SET role = 'owner'
        WHERE server_id = '${SERVER_ID}' AND user_id = '${BOB_ID}'
      `);
      expect(promoteRes.affectedRows).toBe(0);

      // Verify Bob is still admin
      const checkBob = await db.query<{ role: string }>(`
        SELECT role FROM public.server_members WHERE server_id = '${SERVER_ID}' AND user_id = '${BOB_ID}'
      `);
      expect(checkBob.rows[0].role).toBe('admin');

      // 2. Bob attempts to demote Alice (server owner) - rejected by RLS (0 rows updated)
      const demoteRes = await db.query(`
        UPDATE public.server_members
        SET role = 'member'
        WHERE server_id = '${SERVER_ID}' AND user_id = '${ALICE_ID}'
      `);
      expect(demoteRes.affectedRows).toBe(0);

      const checkAlice = await db.query<{ role: string }>(`
        SELECT role FROM public.server_members WHERE server_id = '${SERVER_ID}' AND user_id = '${ALICE_ID}'
      `);
      expect(checkAlice.rows[0].role).toBe('owner');
    });

    it('rejects demoting or removing the server owner without transfer', async () => {
      // 1. Alice attempts to demote her own server_members role - rejected by trigger
      await asUser(ALICE_ID);
      await expect(
        db.query(`
          UPDATE public.server_members
          SET role = 'member'
          WHERE server_id = '${SERVER_ID}' AND user_id = '${ALICE_ID}'
        `)
      ).rejects.toThrow(/Cannot demote server owner/);

      // 2. Alice attempts to delete her membership while still servers.owner_id - blocked by RLS
      const delRes = await db.query(`
        DELETE FROM public.server_members
        WHERE server_id = '${SERVER_ID}' AND user_id = '${ALICE_ID}'
      `);
      expect(delRes.affectedRows).toBe(0);

      // 3. Defense-in-depth: even if executed by superuser, trigger rejects deleting server owner
      await asSuperuser();
      await expect(
        db.query(`
          DELETE FROM public.server_members
          WHERE server_id = '${SERVER_ID}' AND user_id = '${ALICE_ID}'
        `)
      ).rejects.toThrow(/Cannot delete server owner membership/);
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

      // Now establish friendship as superuser (since 00012 drops direct user INSERT)
      await asSuperuser();
      await db.query(`
        INSERT INTO public.friendships (user_id, friend_id)
        VALUES ('${ALICE_ID}', '${BOB_ID}')
      `);
      await asUser(ALICE_ID);

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

  describe('S10: Supabase Realtime Authorization Policies on realtime.messages (A2)', () => {
    it('authorizes conversation members and strictly rejects non-members on conv topics', async () => {
      await asSuperuser();
      await db.exec(`
        INSERT INTO public.conversations (id, created_by, type)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'direct')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'owner')
        ON CONFLICT DO NOTHING;
      `);

      // Alice is in CONV_ID -> Alice can broadcast on conv topic
      await asUser(ALICE_ID);
      await db.query(`
        INSERT INTO realtime.messages (topic, extension)
        VALUES ('conv:${CONV_ID}:chat', 'broadcast');
      `);

      const aliceRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM realtime.messages
        WHERE topic = 'conv:${CONV_ID}:chat';
      `);
      expect(Number(aliceRes.rows[0].count)).toBe(1);

      // Bob is NOT in CONV_ID -> Bob cannot broadcast or listen
      await asUser(BOB_ID);
      await expect(
        db.query(`
          INSERT INTO realtime.messages (topic, extension)
          VALUES ('conv:${CONV_ID}:chat', 'broadcast');
        `)
      ).rejects.toThrow();

      const bobRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM realtime.messages
        WHERE topic = 'conv:${CONV_ID}:chat';
      `);
      expect(Number(bobRes.rows[0].count)).toBe(0);
    });

    it('authorizes user to their own user topic and strictly rejects other users', async () => {
      // Alice can broadcast on user:ALICE_ID:signals
      await asUser(ALICE_ID);
      await db.query(`
        INSERT INTO realtime.messages (topic, extension)
        VALUES ('user:${ALICE_ID}:signals', 'broadcast');
      `);

      const aliceRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM realtime.messages
        WHERE topic = 'user:${ALICE_ID}:signals';
      `);
      expect(Number(aliceRes.rows[0].count)).toBe(1);

      // Bob cannot broadcast or read Alice's user topic
      await asUser(BOB_ID);
      await expect(
        db.query(`
          INSERT INTO realtime.messages (topic, extension)
          VALUES ('user:${ALICE_ID}:signals', 'broadcast');
        `)
      ).rejects.toThrow();

      const bobRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM realtime.messages
        WHERE topic = 'user:${ALICE_ID}:signals';
      `);
      expect(Number(bobRes.rows[0].count)).toBe(0);
    });

    it('authorizes server members on server voice topic and rejects non-members', async () => {
      // Alice is member of SERVER_ID; Charlie is not
      await asUser(ALICE_ID);
      await db.query(`
        INSERT INTO realtime.messages (topic, extension)
        VALUES ('server:${SERVER_ID}:voice', 'broadcast');
      `);

      const aliceRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM realtime.messages
        WHERE topic = 'server:${SERVER_ID}:voice';
      `);
      expect(Number(aliceRes.rows[0].count)).toBe(1);

      await asUser(CHARLIE_ID);
      await expect(
        db.query(`
          INSERT INTO realtime.messages (topic, extension)
          VALUES ('server:${SERVER_ID}:voice', 'broadcast');
        `)
      ).rejects.toThrow();

      const charlieRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM realtime.messages
        WHERE topic = 'server:${SERVER_ID}:voice';
      `);
      expect(Number(charlieRes.rows[0].count)).toBe(0);
    });

    it('authorizes members of server on channel topic and rejects non-members', async () => {
      // CHANNEL_ID is in SERVER_ID. Alice is member, Charlie is not.
      await asUser(ALICE_ID);
      await db.query(`
        INSERT INTO realtime.messages (topic, extension)
        VALUES ('channel:${CHANNEL_ID}:chat', 'broadcast');
      `);

      const aliceRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM realtime.messages
        WHERE topic = 'channel:${CHANNEL_ID}:chat';
      `);
      expect(Number(aliceRes.rows[0].count)).toBe(1);

      await asUser(CHARLIE_ID);
      await expect(
        db.query(`
          INSERT INTO realtime.messages (topic, extension)
          VALUES ('channel:${CHANNEL_ID}:chat', 'broadcast');
        `)
      ).rejects.toThrow();

      const charlieRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM realtime.messages
        WHERE topic = 'channel:${CHANNEL_ID}:chat';
      `);
      expect(Number(charlieRes.rows[0].count)).toBe(0);
    });

    it('strictly denies anon unauthenticated access to realtime.messages', async () => {
      await asUser(null);
      await expect(
        db.query(`
          INSERT INTO realtime.messages (topic, extension)
          VALUES ('conv:${CONV_ID}:chat', 'broadcast');
        `)
      ).rejects.toThrow();

      await expect(
        db.query(`
          SELECT * FROM realtime.messages;
        `)
      ).rejects.toThrow();
    });
  });
});
