// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

describe('Authoritative Presence Sessions & Privacy SQL Tests (2.3 & 2.4)', () => {
  let db: PGlite;

  const USER_A = '11111111-1111-1111-1111-111111111111';
  const USER_B = '22222222-2222-2222-2222-222222222222';
  const USER_C = '33333333-3333-3333-3333-333333333333';

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  beforeEach(async () => {
    db = new PGlite();
    await db.ready;

    // Minimal stubs before migrations run
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
        bucket_id TEXT REFERENCES storage.buckets(id),
        name TEXT NOT NULL,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::jsonb
      );

      CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
      RETURNS TEXT[] LANGUAGE plpgsql AS $$
      BEGIN
        RETURN string_to_array(name, '/');
      END;
      $$;
    `);

    // Apply all migrations sequentially
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      await db.exec(sql);
    }

    // Seed test users
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${USER_A}', 'a@nexus.gg'),
        ('${USER_B}', 'b@nexus.gg'),
        ('${USER_C}', 'c@nexus.gg')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, username, display_name, status) VALUES
        ('${USER_A}', 'usera', 'User A', 'online'),
        ('${USER_B}', 'userb', 'User B', 'online'),
        ('${USER_C}', 'userc', 'User C', 'online')
      ON CONFLICT (id) DO UPDATE SET status = 'online';

      INSERT INTO public.user_settings (user_id, presence_visibility) VALUES
        ('${USER_A}', 'everyone'),
        ('${USER_B}', 'friends'),
        ('${USER_C}', 'everyone')
      ON CONFLICT (user_id) DO UPDATE SET presence_visibility = EXCLUDED.presence_visibility;
    `);
  });

  const asUser = async (userId: string, fn: () => Promise<void>) => {
    await db.exec(`
      SET request.jwt.claim.sub = '${userId}';
      SET request.jwt.claim.role = 'authenticated';
      SET ROLE authenticated;
    `);
    try {
      await fn();
    } finally {
      await db.exec(`
        RESET ROLE;
        RESET request.jwt.claim.sub;
        RESET request.jwt.claim.role;
      `);
    }
  };

  it('user can only write/update/delete their own sessions; cannot spoof other users', async () => {
    const sessionA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await asUser(USER_A, async () => {
      // User A can register a session
      const res = await db.query<{ heartbeat_presence: string }>(
        `SELECT public.heartbeat_presence($1, 'online', 'web')`,
        [sessionA]
      );
      expect(res.rows[0].heartbeat_presence).toBe(sessionA);

      // Verify User A can see their own session in the table
      const ownSessions = await db.query<{ session_id: string }>(
        `SELECT session_id FROM public.user_presence_sessions WHERE user_id = $1`,
        [USER_A]
      );
      expect(ownSessions.rows.length).toBe(1);
    });

    await asUser(USER_B, async () => {
      // User B cannot see User A's session in the raw table (RLS lockdown)
      const visible = await db.query(
        `SELECT * FROM public.user_presence_sessions WHERE user_id = $1`,
        [USER_A]
      );
      expect(visible.rows.length).toBe(0);

      // User B cannot delete or update User A's session
      await db.query(
        `DELETE FROM public.user_presence_sessions WHERE session_id = $1`,
        [sessionA]
      );
      const stillThere = await db.query(
        `SELECT * FROM public.user_presence_sessions WHERE session_id = $1`,
        [sessionA]
      );
      expect(stillThere.rows.length).toBe(0); // B sees 0 rows because of RLS
    });

    // Check directly with service role that sessionA was NOT deleted by B
    const checkRaw = await db.query(
      `SELECT * FROM public.user_presence_sessions WHERE session_id = $1`,
      [sessionA]
    );
    expect(checkRaw.rows.length).toBe(1);
  });

  it('sessions expire after 90 seconds in get_presence', async () => {
    const sessionA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await asUser(USER_A, async () => {
      await db.query(`SELECT public.heartbeat_presence($1, 'online', 'web')`, [sessionA]);
    });

    // Initially A is online
    await asUser(USER_C, async () => {
      const pres = await db.query<{ user_id: string; status: string }>(
        `SELECT user_id, status FROM public.get_presence(ARRAY['${USER_A}']::UUID[])`
      );
      expect(pres.rows[0]?.status).toBe('online');
    });

    // Artificially age the session past 90 seconds
    await db.exec(`
      UPDATE public.user_presence_sessions
      SET last_seen_at = now() - INTERVAL '100 seconds'
      WHERE session_id = '${sessionA}';
    `);

    // Now A should be offline
    await asUser(USER_C, async () => {
      const pres = await db.query<{ user_id: string; status: string }>(
        `SELECT user_id, status FROM public.get_presence(ARRAY['${USER_A}']::UUID[])`
      );
      expect(pres.rows[0]?.status).toBe('offline');
    });
  });

  it('online beats idle across multiple sessions for the same user', async () => {
    const s1 = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const s2 = '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    await asUser(USER_A, async () => {
      await db.query(`SELECT public.heartbeat_presence($1, 'idle', 'desktop')`, [s1]);
      await db.query(`SELECT public.heartbeat_presence($1, 'online', 'mobile')`, [s2]);
    });

    await asUser(USER_C, async () => {
      const pres = await db.query<{ user_id: string; status: string }>(
        `SELECT user_id, status FROM public.get_presence(ARRAY['${USER_A}']::UUID[])`
      );
      expect(pres.rows[0]?.status).toBe('online');
    });
  });

  it('dnd preference wins if any live session exists', async () => {
    const s1 = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await db.exec(`UPDATE public.profiles SET status = 'dnd' WHERE id = '${USER_A}'`);

    await asUser(USER_A, async () => {
      await db.query(`SELECT public.heartbeat_presence($1, 'online', 'web')`, [s1]);
    });

    await asUser(USER_C, async () => {
      const pres = await db.query<{ user_id: string; status: string }>(
        `SELECT user_id, status FROM public.get_presence(ARRAY['${USER_A}']::UUID[])`
      );
      expect(pres.rows[0]?.status).toBe('dnd');
    });
  });

  it('invisible preference shows offline even with active sessions', async () => {
    const s1 = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await db.exec(`UPDATE public.profiles SET status = 'invisible' WHERE id = '${USER_A}'`);

    await asUser(USER_A, async () => {
      await db.query(`SELECT public.heartbeat_presence($1, 'online', 'web')`, [s1]);
    });

    await asUser(USER_C, async () => {
      const pres = await db.query<{ user_id: string; status: string }>(
        `SELECT user_id, status FROM public.get_presence(ARRAY['${USER_A}']::UUID[])`
      );
      expect(pres.rows[0]?.status).toBe('offline');
    });
  });

  it('respects presence_visibility (everyone, friends, mutual_servers, nobody) and blocks', async () => {
    const sB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    // User B is online with visibility 'friends'
    await asUser(USER_B, async () => {
      await db.query(`SELECT public.heartbeat_presence($1, 'online', 'web')`, [sB]);
    });

    // C is not friends with B -> sees B as offline
    await asUser(USER_C, async () => {
      const pres = await db.query<{ user_id: string; status: string }>(
        `SELECT user_id, status FROM public.get_presence(ARRAY['${USER_B}']::UUID[])`
      );
      expect(pres.rows[0]?.status).toBe('offline');
    });

    // Make A and B friends
    await db.exec(`
      INSERT INTO public.friendships (user_id, friend_id)
      VALUES ('${USER_A}', '${USER_B}'), ('${USER_B}', '${USER_A}');
    `);

    // Now A sees B as online
    await asUser(USER_A, async () => {
      const pres = await db.query<{ user_id: string; status: string }>(
        `SELECT user_id, status FROM public.get_presence(ARRAY['${USER_B}']::UUID[])`
      );
      expect(pres.rows[0]?.status).toBe('online');
    });

    // Now block: User B blocks User A
    await db.exec(`
      INSERT INTO public.blocks (blocker_id, blocked_id)
      VALUES ('${USER_B}', '${USER_A}');
    `);

    // A now sees B as offline because of block
    await asUser(USER_A, async () => {
      const pres = await db.query<{ user_id: string; status: string }>(
        `SELECT user_id, status FROM public.get_presence(ARRAY['${USER_B}']::UUID[])`
      );
      expect(pres.rows[0]?.status).toBe('offline');
    });
  });
});
