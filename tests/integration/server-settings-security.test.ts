// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

describe('Server Settings Security & Permissions Audit Regression Gate (SS-S1 - SS-S5, SS-H2)', () => {
  let db: PGlite;

  const ALICE_ID = '11111111-1111-1111-1111-111111111111'; // Server Owner
  const BOB_ID = '22222222-2222-2222-2222-222222222222';   // Admin 1
  const CHARLIE_ID = '33333333-3333-3333-3333-333333333333'; // Admin 2
  const DAVE_ID = '44444444-4444-4444-4444-444444444444';    // Regular Member
  const EVE_ID = '55555555-5555-5555-5555-555555555555';     // Outsider / Non-member

  const SERVER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const CHANNEL_ID = '12121212-1212-1212-1212-121212121212';
  const VOICE_CHANNEL_ID = '23232323-2323-2323-2323-232323232323';

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

    // Seed test auth users, profiles, server, members, and channels as superuser
    await db.exec(`
      RESET ROLE;
      INSERT INTO auth.users (id, email) VALUES
        ('${ALICE_ID}', 'alice@nexus.gg'),
        ('${BOB_ID}', 'bob@nexus.gg'),
        ('${CHARLIE_ID}', 'charlie@nexus.gg'),
        ('${DAVE_ID}', 'dave@nexus.gg'),
        ('${EVE_ID}', 'eve@nexus.gg')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.profiles (id, username, display_name) VALUES
        ('${ALICE_ID}', 'alice', 'Alice Owner'),
        ('${BOB_ID}', 'bob', 'Bob Admin'),
        ('${CHARLIE_ID}', 'charlie', 'Charlie Admin'),
        ('${DAVE_ID}', 'dave', 'Dave Member'),
        ('${EVE_ID}', 'eve', 'Eve Outsider')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.servers (id, name, description, owner_id) VALUES
        ('${SERVER_ID}', 'Apex Legends Club', 'Official Apex Server', '${ALICE_ID}')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.server_members (server_id, user_id, role) VALUES
        ('${SERVER_ID}', '${ALICE_ID}', 'owner'),
        ('${SERVER_ID}', '${BOB_ID}', 'admin'),
        ('${SERVER_ID}', '${CHARLIE_ID}', 'admin'),
        ('${SERVER_ID}', '${DAVE_ID}', 'member')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.channels (id, server_id, name, type) VALUES
        ('${CHANNEL_ID}', '${SERVER_ID}', 'general', 'text'),
        ('${VOICE_CHANNEL_ID}', '${SERVER_ID}', 'Voice Lounge', 'voice')
      ON CONFLICT DO NOTHING;
    `);
  });

  describe('SS-S1: Server Ownership Protection & Column Immutability', () => {
    it('prevents an admin from transferring ownership to themselves via UPDATE servers', async () => {
      await asUser(BOB_ID);

      // Bob is an admin, attempting to hijack server ownership by updating owner_id
      await expect(
        db.query(`
          UPDATE public.servers
          SET owner_id = '${BOB_ID}'
          WHERE id = '${SERVER_ID}';
        `)
      ).rejects.toThrow();

      // Verify owner is still Alice
      const res = await db.query<{ owner_id: string }>(`
        SELECT owner_id FROM public.servers WHERE id = '${SERVER_ID}';
      `);
      expect(res.rows[0].owner_id).toBe(ALICE_ID);
    });

    it('allows server owner to update server name and description', async () => {
      await asUser(ALICE_ID);

      const res = await db.query(`
        UPDATE public.servers
        SET name = 'Apex Champions Club', description = 'Updated Description'
        WHERE id = '${SERVER_ID}';
      `);
      expect(res.affectedRows).toBe(1);

      const check = await db.query<{ name: string }>(`
        SELECT name FROM public.servers WHERE id = '${SERVER_ID}';
      `);
      expect(check.rows[0].name).toBe('Apex Champions Club');
    });

    it('enforces server name length and non-empty constraints', async () => {
      await asUser(ALICE_ID);

      // Empty or all-whitespace name should be rejected
      await expect(
        db.query(`
          UPDATE public.servers
          SET name = '   '
          WHERE id = '${SERVER_ID}';
        `)
      ).rejects.toThrow();

      // Over 100 characters should be rejected
      await expect(
        db.query(`
          UPDATE public.servers
          SET name = '${'A'.repeat(101)}'
          WHERE id = '${SERVER_ID}';
        `)
      ).rejects.toThrow();
    });
  });

  describe('SS-S2: Timeout RPC Safety & Boundary Enforcement', () => {
    it('rejects timing out a non-member and does NOT insert them into server_members', async () => {
      await asUser(ALICE_ID);

      // Eve is not in server_members
      await expect(
        db.query(`
          SELECT public.timeout_server_member(
            '${SERVER_ID}',
            '${EVE_ID}',
            300,
            'Disruptive non-member'
          );
        `)
      ).rejects.toThrow(/not a member/i);

      // Verify Eve was not inserted into server_members
      const memCheck = await db.query(`
        SELECT 1 FROM public.server_members
        WHERE server_id = '${SERVER_ID}' AND user_id = '${EVE_ID}';
      `);
      expect(memCheck.rows.length).toBe(0);
    });

    it('does NOT delete or lift an existing ban when timing out a user', async () => {
      await asSuperuser();
      // Put Dave into server_bans
      await db.query(`
        INSERT INTO public.server_bans (server_id, user_id, banned_by, reason)
        VALUES ('${SERVER_ID}', '${DAVE_ID}', '${ALICE_ID}', 'Active ban')
        ON CONFLICT DO NOTHING;
      `);

      await asUser(ALICE_ID);
      // Attempting to timeout Dave must fail because he is banned / not an active member,
      // and MUST NOT delete his ban from server_bans
      await expect(
        db.query(`
          SELECT public.timeout_server_member(
            '${SERVER_ID}',
            '${DAVE_ID}',
            300,
            'Attempt timeout on banned user'
          );
        `)
      ).rejects.toThrow();

      // Verify Dave is still in server_bans
      const banCheck = await db.query(`
        SELECT 1 FROM public.server_bans
        WHERE server_id = '${SERVER_ID}' AND user_id = '${DAVE_ID}';
      `);
      expect(banCheck.rows.length).toBe(1);
    });

    it('rejects an admin timing out another admin (role hierarchy)', async () => {
      await asUser(BOB_ID);

      // Bob (admin) attempts to timeout Charlie (admin)
      await expect(
        db.query(`
          SELECT public.timeout_server_member(
            '${SERVER_ID}',
            '${CHARLIE_ID}',
            300,
            'Admin attacking peer admin'
          );
        `)
      ).rejects.toThrow();
    });

    it('rejects timeout duration exceeding 28 days', async () => {
      await asUser(ALICE_ID);

      const TWENTY_NINE_DAYS = 29 * 24 * 60 * 60; // 2,505,600 seconds
      await expect(
        db.query(`
          SELECT public.timeout_server_member(
            '${SERVER_ID}',
            '${DAVE_ID}',
            ${TWENTY_NINE_DAYS},
            'Excessive duration'
          );
        `)
      ).rejects.toThrow();
    });
  });

  describe('SS-S3: Report Resolution Permissions', () => {
    it('prevents a regular user from resolving a DM/global report where server_id is NULL', async () => {
      const REPORT_ID = '99999999-9999-9999-9999-999999999999';

      await asSuperuser();
      await db.query(`
        INSERT INTO public.reports (id, reporter_id, reported_user_id, server_id, reason, status)
        VALUES ('${REPORT_ID}', '${ALICE_ID}', '${CHARLIE_ID}', NULL, 'Harassment in DMs', 'pending')
        ON CONFLICT DO NOTHING;
      `);

      await asUser(BOB_ID);

      // Bob is just an authenticated user with no platform admin rights, attempting to resolve a global report
      await expect(
        db.query(`
          SELECT public.resolve_report(
            '${REPORT_ID}',
            'resolved',
            'Dismissed by unauthorized user'
          );
        `)
      ).rejects.toThrow(/insufficient permissions/i);
    });
  });

  describe('SS-S4: Moderation Audit Log Protection Against Direct Insertion', () => {
    it('rejects direct INSERT into moderation_audit_logs by an admin or user', async () => {
      await asUser(BOB_ID);

      // Bob attempts to forge an audit log entry attributing an action to Alice
      await expect(
        db.query(`
          INSERT INTO public.moderation_audit_logs (
            server_id, actor_id, target_id, action, reason
          ) VALUES (
            '${SERVER_ID}', '${ALICE_ID}', '${DAVE_ID}', 'kick', 'Forged kick entry'
          );
        `)
      ).rejects.toThrow();
    });
  });

  describe('SS-S5: Hierarchy Enforcement for Kicking and Banning', () => {
    it('prevents an admin from banning another admin', async () => {
      await asUser(BOB_ID);

      await expect(
        db.query(`
          SELECT public.ban_server_member(
            '${SERVER_ID}',
            '${CHARLIE_ID}',
            'Admin banning peer admin'
          );
        `)
      ).rejects.toThrow();
    });

    it('prevents an admin from kicking another admin', async () => {
      await asUser(BOB_ID);

      await expect(
        db.query(`
          SELECT public.kick_server_member(
            '${SERVER_ID}',
            '${CHARLIE_ID}',
            'Admin kicking peer admin'
          );
        `)
      ).rejects.toThrow();
    });

    it('prevents a user from kicking themselves', async () => {
      await asUser(BOB_ID);

      await expect(
        db.query(`
          SELECT public.kick_server_member(
            '${SERVER_ID}',
            '${BOB_ID}',
            'Self kick'
          );
        `)
      ).rejects.toThrow();
    });
  });

  describe('SS-H2: Atomic Channel Deletion RPC', () => {
    it('provides an atomic delete_channel RPC that refuses to delete the last text channel', async () => {
      await asUser(ALICE_ID);

      // Find the existing text channel on this server
      const chanRes = await db.query<{ id: string }>(`
        SELECT id FROM public.channels
        WHERE server_id = '${SERVER_ID}' AND type = 'text'
        LIMIT 1;
      `);
      expect(chanRes.rows.length).toBe(1);
      const singleTextChanId = chanRes.rows[0].id;

      // delete_channel must refuse to delete the only text channel.
      await expect(
        db.query(`
          SELECT public.delete_channel('${singleTextChanId}');
        `)
      ).rejects.toThrow(/cannot delete the last text channel/i);
    });

    it('allows deleting a channel when multiple text channels exist, cascading messages atomically', async () => {
      await asUser(ALICE_ID);

      // Create a second text channel
      const SECOND_CHAN_ID = '77777777-7777-7777-7777-777777777777';
      await db.query(`
        INSERT INTO public.channels (id, server_id, name, type)
        VALUES ('${SECOND_CHAN_ID}', '${SERVER_ID}', 'announcements', 'text');
      `);

      // Insert message into second channel
      await db.query(`
        INSERT INTO public.channel_messages (channel_id, user_id, content)
        VALUES ('${SECOND_CHAN_ID}', '${ALICE_ID}', 'Important announcement');
      `);

      // Deleting the second channel should succeed
      const delRes = await db.query(`
        SELECT public.delete_channel('${SECOND_CHAN_ID}');
      `);
      expect(delRes.affectedRows).toBe(0);

      // Verify channel is gone
      const chanCheck = await db.query(`
        SELECT 1 FROM public.channels WHERE id = '${SECOND_CHAN_ID}';
      `);
      expect(chanCheck.rows.length).toBe(0);

      // Verify message was deleted atomically via CASCADE
      const msgCheck = await db.query(`
        SELECT 1 FROM public.channel_messages WHERE channel_id = '${SECOND_CHAN_ID}';
      `);
      expect(msgCheck.rows.length).toBe(0);
    });
  });

  describe('SS-S6: Server Deletion and Member Integrity Guard', () => {
    it('prevents non-owner (admin) from deleting server via delete_server RPC', async () => {
      await asUser(BOB_ID);

      await expect(
        db.query(`
          SELECT public.delete_server('${SERVER_ID}');
        `)
      ).rejects.toThrow(/only the server owner/i);
    });

    it('allows server owner to delete server via delete_server RPC cascading all members and channels', async () => {
      await asUser(ALICE_ID);

      const delRes = await db.query<{ delete_server: boolean }>(`
        SELECT public.delete_server('${SERVER_ID}');
      `);
      expect(delRes.rows[0].delete_server).toBe(true);

      // Verify server is deleted
      const srvCheck = await db.query(`
        SELECT 1 FROM public.servers WHERE id = '${SERVER_ID}';
      `);
      expect(srvCheck.rows.length).toBe(0);

      // Verify cascading delete on server_members
      const memCheck = await db.query(`
        SELECT 1 FROM public.server_members WHERE server_id = '${SERVER_ID}';
      `);
      expect(memCheck.rows.length).toBe(0);
    });

    it('restores default member role_id when unbanning a user', async () => {
      // Put Dave in bans
      await asSuperuser();
      await db.exec(`
        DELETE FROM public.server_members WHERE server_id = '${SERVER_ID}' AND user_id = '${DAVE_ID}';
        INSERT INTO public.server_bans (server_id, user_id, banned_by, reason)
        VALUES ('${SERVER_ID}', '${DAVE_ID}', '${ALICE_ID}', 'Spam');
      `);

      await asUser(ALICE_ID);

      // Unban Dave with restore
      const unbanRes = await db.query<{ unban_server_member: boolean }>(`
        SELECT public.unban_server_member('${SERVER_ID}', '${DAVE_ID}', true);
      `);
      expect(unbanRes.rows[0].unban_server_member).toBe(true);

      // Verify Dave is reinserted with a valid system Member role_id
      const memberCheck = await db.query<{ role: string; role_id: string }>(`
        SELECT role, role_id FROM public.server_members
        WHERE server_id = '${SERVER_ID}' AND user_id = '${DAVE_ID}';
      `);
      expect(memberCheck.rows.length).toBe(1);
      expect(memberCheck.rows[0].role).toBe('member');
      expect(memberCheck.rows[0].role_id).toBeTruthy();
    });
  });
});

