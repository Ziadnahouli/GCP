// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

describe('Server Roles & Permissions Matrix Audit Regression Gate (SS-R1, SS-R2, SS-R3)', () => {
  let db: PGlite;

  const ALICE_ID = '11111111-1111-1111-1111-111111111111'; // Owner
  const BOB_ID = '22222222-2222-2222-2222-222222222222';   // Admin
  const CHARLIE_ID = '33333333-3333-3333-3333-333333333333'; // Moderator
  const DAVE_ID = '44444444-4444-4444-4444-444444444444';    // Regular Member

  const SERVER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const CHANNEL_ID = '12121212-1212-1212-1212-121212121212';

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

    // Dynamically load and execute all migrations
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await db.exec(sql);
    }

    await db.exec(`
      GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, anon;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT SELECT ON public.profiles TO anon;
      GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
    `);

    // Seed test auth users & profiles
    await db.exec(`
      RESET ROLE;
      INSERT INTO auth.users (id, email) VALUES
        ('${ALICE_ID}', 'alice@nexus.gg'),
        ('${BOB_ID}', 'bob@nexus.gg'),
        ('${CHARLIE_ID}', 'charlie@nexus.gg'),
        ('${DAVE_ID}', 'dave@nexus.gg')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.profiles (id, username, display_name) VALUES
        ('${ALICE_ID}', 'alice', 'Alice Owner'),
        ('${BOB_ID}', 'bob', 'Bob Admin'),
        ('${CHARLIE_ID}', 'charlie', 'Charlie Mod'),
        ('${DAVE_ID}', 'dave', 'Dave Member')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.servers (id, name, description, owner_id) VALUES
        ('${SERVER_ID}', 'Role Test Sanctuary', 'Testing Persistent Roles', '${ALICE_ID}')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.server_members (server_id, user_id, role) VALUES
        ('${SERVER_ID}', '${ALICE_ID}', 'owner'),
        ('${SERVER_ID}', '${BOB_ID}', 'admin'),
        ('${SERVER_ID}', '${DAVE_ID}', 'member')
      ON CONFLICT DO NOTHING;
    `);
  });

  describe('SS-R2: Database-Backed Persistent Roles & Permission Evaluation', () => {
    it('seeds server with system roles (Admin, Moderator, Member) and sets member role_ids', async () => {
      const rolesRes = await db.query<{ name: string; is_system: boolean; position: number }>(`
        SELECT name, is_system, position FROM public.server_roles
        WHERE server_id = '${SERVER_ID}'
        ORDER BY position DESC;
      `);

      expect(rolesRes.rows.length).toBeGreaterThanOrEqual(3);
      const roleNames = rolesRes.rows.map((r) => r.name);
      expect(roleNames).toContain('Admin');
      expect(roleNames).toContain('Moderator');
      expect(roleNames).toContain('Member');
    });

    it('has_server_permission evaluates true for owner across all permissions', async () => {
      const checkRes = await db.query<{ has_perm: boolean }>(`
        SELECT public.has_server_permission('${SERVER_ID}', '${ALICE_ID}', 'manage_server') as has_perm;
      `);
      expect(checkRes.rows[0].has_perm).toBe(true);
    });

    it('allows Moderator to moderate members and manage messages (SS-R3 fix)', async () => {
      // Find Moderator role
      const modRole = await db.query<{ id: string }>(`
        SELECT id FROM public.server_roles
        WHERE server_id = '${SERVER_ID}' AND name = 'Moderator';
      `);
      expect(modRole.rows.length).toBe(1);

      // Add Charlie as Moderator
      await db.query(`
        INSERT INTO public.server_members (server_id, user_id, role, role_id)
        VALUES ('${SERVER_ID}', '${CHARLIE_ID}', 'moderator', '${modRole.rows[0].id}')
        ON CONFLICT (server_id, user_id)
        DO UPDATE SET role = 'moderator', role_id = '${modRole.rows[0].id}';
      `);

      const kickPerm = await db.query<{ has_perm: boolean }>(`
        SELECT public.has_server_permission('${SERVER_ID}', '${CHARLIE_ID}', 'kick_members') as has_perm;
      `);
      expect(kickPerm.rows[0].has_perm).toBe(true);

      const manageMsgPerm = await db.query<{ has_perm: boolean }>(`
        SELECT public.has_server_permission('${SERVER_ID}', '${CHARLIE_ID}', 'manage_messages') as has_perm;
      `);
      expect(manageMsgPerm.rows[0].has_perm).toBe(true);

      // Moderator should not have manage_server
      const serverPerm = await db.query<{ has_perm: boolean }>(`
        SELECT public.has_server_permission('${SERVER_ID}', '${CHARLIE_ID}', 'manage_server') as has_perm;
      `);
      expect(serverPerm.rows[0].has_perm).toBe(false);
    });

    it('strips send_messages and speak_voice from timed-out members', async () => {
      // Dave as Member
      const memRole = await db.query<{ id: string }>(`
        SELECT id FROM public.server_roles
        WHERE server_id = '${SERVER_ID}' AND name = 'Member';
      `);

      await db.query(`
        INSERT INTO public.server_members (server_id, user_id, role, role_id, timeout_until)
        VALUES ('${SERVER_ID}', '${DAVE_ID}', 'member', '${memRole.rows[0].id}', NOW() + INTERVAL '1 hour')
        ON CONFLICT (server_id, user_id)
        DO UPDATE SET timeout_until = NOW() + INTERVAL '1 hour';
      `);

      const sendPerm = await db.query<{ has_perm: boolean }>(`
        SELECT public.has_server_permission('${SERVER_ID}', '${DAVE_ID}', 'send_messages') as has_perm;
      `);
      expect(sendPerm.rows[0].has_perm).toBe(false);

      const speakPerm = await db.query<{ has_perm: boolean }>(`
        SELECT public.has_server_permission('${SERVER_ID}', '${DAVE_ID}', 'speak_voice') as has_perm;
      `);
      expect(speakPerm.rows[0].has_perm).toBe(false);
    });

    it('creates custom role, assigns it to member, and reassigns members when deleted', async () => {
      await asUser(ALICE_ID);

      // Alice creates custom VIP role with send_messages and share_screen
      const createRes = await db.query<{ create_server_role: { id: string; name: string } }>(`
        SELECT public.create_server_role(
          '${SERVER_ID}',
          'VIP Clan Member',
          '#6366f1',
          ARRAY['send_messages', 'share_screen', 'use_soundboard']
        );
      `);
      expect(createRes.rows[0].create_server_role).toBeDefined();
      const rawRole = createRes.rows[0].create_server_role as any;
      const roleData = typeof rawRole === 'string' ? JSON.parse(rawRole) : rawRole;
      const vipRoleId = roleData.id;
      expect(vipRoleId).toBeDefined();

      // Assign VIP role to Dave
      await db.query(`
        SELECT public.set_member_role('${SERVER_ID}', '${DAVE_ID}', '${vipRoleId}');
      `);

      // Verify Dave has share_screen permission
      const permCheck = await db.query<{ has_perm: boolean }>(`
        SELECT public.has_server_permission('${SERVER_ID}', '${DAVE_ID}', 'share_screen') as has_perm;
      `);
      expect(permCheck.rows[0].has_perm).toBe(true);

      // Delete VIP role
      await db.query(`
        SELECT public.delete_server_role('${vipRoleId}');
      `);

      // Verify VIP role is deleted
      const roleCheck = await db.query(`
        SELECT 1 FROM public.server_roles WHERE id = '${vipRoleId}';
      `);
      expect(roleCheck.rows.length).toBe(0);

      // Verify Dave was safely reassigned to the default Member role
      const memberCheck = await db.query<{ role: string; role_id: string }>(`
        SELECT role, role_id FROM public.server_members
        WHERE server_id = '${SERVER_ID}' AND user_id = '${DAVE_ID}';
      `);
      expect(memberCheck.rows[0].role).toBe('member');
      expect(memberCheck.rows[0].role_id).not.toBe(vipRoleId);
    });

    it('rejects deleting built-in system roles', async () => {
      await asUser(ALICE_ID);

      const memRole = await db.query<{ id: string }>(`
        SELECT id FROM public.server_roles
        WHERE server_id = '${SERVER_ID}' AND name = 'Member';
      `);

      await expect(
        db.query(`
          SELECT public.delete_server_role('${memRole.rows[0].id}');
        `)
      ).rejects.toThrow(/cannot delete built-in system role/i);
    });
  });
});
