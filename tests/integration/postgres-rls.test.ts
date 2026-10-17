// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

describe('PostgreSQL / Supabase RLS Multi-User Integration Tests', () => {
  let db: PGlite;

  const ALICE_ID = '11111111-1111-1111-1111-111111111111';
  const BOB_ID = '22222222-2222-2222-2222-222222222222';
  const CHARLIE_ID = '33333333-3333-3333-3333-333333333333';
  const SERVER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const CONV_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  const asUser = async (userId: string | null) => {
    if (userId) {
      await db.exec(`
        SET ROLE authenticated;
        SET request.jwt.claim.sub = '${userId}';
        SET request.jwt.claim.role = 'authenticated';
      `);
    } else {
      await db.exec(`
        RESET ROLE;
        RESET request.jwt.claim.sub;
        SET request.jwt.claim.role = 'anon';
      `);
    }
  };

  beforeEach(async () => {
    db = new PGlite();
    await db.ready;

    // 1. Setup Supabase auth schema and helper functions
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOINHERIT;
        END IF;
      END $$;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
      $$ LANGUAGE sql STABLE;

      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY,
        username TEXT NOT NULL
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
        CONSTRAINT unique_member UNIQUE(server_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS public.conversations (
        id UUID PRIMARY KEY,
        created_by UUID NOT NULL REFERENCES public.profiles(id)
      );

      CREATE TABLE IF NOT EXISTS public.conversation_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
        CONSTRAINT unique_conv_member UNIQUE(conversation_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS public.messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        content TEXT NOT NULL
      );

      -- Helper functions (SECURITY DEFINER eliminates recursion and cross-table RLS deadlocks)
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

      -- Enable RLS on all tables
      ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.servers FORCE ROW LEVEL SECURITY;

      ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.server_members FORCE ROW LEVEL SECURITY;

      ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;

      ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.conversation_members FORCE ROW LEVEL SECURITY;

      ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;

      -- SERVERS POLICIES
      CREATE POLICY "Servers are viewable by all" ON public.servers
        FOR SELECT USING (true);

      -- CONVERSATIONS & CONVERSATION MEMBERS POLICIES
      CREATE POLICY "Users can create conversations as creator" ON public.conversations
        FOR INSERT WITH CHECK (auth.uid() = created_by);

      CREATE POLICY "Conversation members can view conversations" ON public.conversations
        FOR SELECT USING (
          created_by = auth.uid() OR
          public.is_conversation_member(id, auth.uid())
        );

      CREATE OR REPLACE FUNCTION public.is_conversation_creator_or_admin(p_conv_id UUID, p_user_id UUID)
      RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.conversations WHERE id = p_conv_id AND created_by = p_user_id
        ) OR EXISTS (
          SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conv_id AND user_id = p_user_id AND role IN ('owner', 'admin')
        );
      $$;

      CREATE POLICY "Conversation admins and creators can add members" ON public.conversation_members
        FOR INSERT WITH CHECK (
          public.is_conversation_creator_or_admin(conversation_id, auth.uid())
        );

      CREATE POLICY "Conversation members can view members" ON public.conversation_members
        FOR SELECT USING (
          public.is_conversation_creator_or_admin(conversation_id, auth.uid()) OR
          public.is_conversation_member(conversation_id, auth.uid())
        );

      -- RLS POLICIES FOR SERVER MEMBERS (from 00013_security_hardening.sql)
      CREATE POLICY "Server members can view member lists" ON public.server_members
        FOR SELECT USING (
          public.is_server_owner(server_id, auth.uid()) OR
          public.is_server_member(server_id, auth.uid())
        );

      CREATE POLICY "Users can join servers as members" ON public.server_members
        FOR INSERT WITH CHECK (
          (auth.uid() = user_id AND role = 'member') OR
          public.is_server_owner(server_id, auth.uid()) OR
          (
            public.is_server_owner_or_admin(server_id, auth.uid()) AND
            role = 'member'
          )
        );

      CREATE POLICY "Owners and admins can update member roles" ON public.server_members
        FOR UPDATE USING (
          public.is_server_owner_or_admin(server_id, auth.uid()) AND
          (
            public.is_server_owner(server_id, auth.uid()) OR
            NOT public.is_server_owner(server_id, server_members.user_id)
          ) AND
          (
            public.is_server_owner(server_id, auth.uid()) OR
            server_members.user_id <> auth.uid()
          ) AND
          (
            public.is_server_owner(server_id, auth.uid()) OR
            server_members.role NOT IN ('owner', 'admin')
          )
        )
        WITH CHECK (
          role IN ('owner', 'admin', 'moderator', 'member') AND
          (
            public.is_server_owner(server_id, auth.uid()) OR
            (
              public.is_server_owner_or_admin(server_id, auth.uid()) AND
              role IN ('member', 'moderator') AND
              server_members.user_id <> auth.uid() AND
              NOT public.is_server_owner(server_id, server_members.user_id)
            )
          )
        );

      CREATE POLICY "Members can leave or admins can kick" ON public.server_members
        FOR DELETE USING (
          (
            user_id = auth.uid() AND
            NOT public.is_server_owner(server_id, auth.uid())
          ) OR
          (
            public.is_server_owner(server_id, auth.uid()) AND
            user_id <> auth.uid()
          ) OR
          (
            public.is_server_owner_or_admin(server_id, auth.uid()) AND
            user_id <> auth.uid() AND
            server_members.role NOT IN ('owner', 'admin') AND
            NOT public.is_server_owner(server_id, server_members.user_id)
          )
        );

      -- RLS POLICIES FOR MESSAGES
      CREATE POLICY "Members can read conversation messages" ON public.messages
        FOR SELECT USING (
          public.is_conversation_member(conversation_id, auth.uid())
        );

      CREATE POLICY "Members can insert conversation messages" ON public.messages
        FOR INSERT WITH CHECK (
          auth.uid() = sender_id AND
          public.is_conversation_member(conversation_id, auth.uid())
        );

      CREATE POLICY "Authors can update their own messages" ON public.messages
        FOR UPDATE USING (
          auth.uid() = sender_id
        )
        WITH CHECK (
          auth.uid() = sender_id
        );

      -- Grant access on all tables, sequences, and functions to authenticated role
      GRANT USAGE ON SCHEMA public, auth TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
    `);

    // Insert initial seed profiles bypassing RLS as superuser
    await db.exec(`
      RESET ROLE;
      INSERT INTO public.profiles (id, username) VALUES
        ('${ALICE_ID}', 'alice'),
        ('${BOB_ID}', 'bob'),
        ('${CHARLIE_ID}', 'charlie')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.servers (id, name, owner_id) VALUES
        ('${SERVER_ID}', 'Alice Gaming Sanctuary', '${ALICE_ID}')
      ON CONFLICT DO NOTHING;
    `);
  });

  describe('1. Server Members Privilege Escalation & Role Hardening', () => {
    it('blocks unauthorized users from self-joining with owner or admin role', async () => {
      await asUser(BOB_ID);

      // Attempt 1: Bob tries to self-join as owner
      await expect(
        db.query(`
          INSERT INTO public.server_members (server_id, user_id, role)
          VALUES ('${SERVER_ID}', '${BOB_ID}', 'owner')
        `)
      ).rejects.toThrow();

      // Attempt 2: Bob tries to self-join as admin
      await expect(
        db.query(`
          INSERT INTO public.server_members (server_id, user_id, role)
          VALUES ('${SERVER_ID}', '${BOB_ID}', 'admin')
        `)
      ).rejects.toThrow();

      // Attempt 3: Bob self-joins as regular member -> Must succeed
      await db.query(`
        INSERT INTO public.server_members (server_id, user_id, role)
        VALUES ('${SERVER_ID}', '${BOB_ID}', 'member')
      `);

      const res = await db.query<{ role: string }>(`SELECT role FROM public.server_members WHERE user_id = '${BOB_ID}'`);
      expect(res.rows[0].role).toBe('member');
    });

    it('prevents non-owner admins from escalating themselves or assigning the owner role', async () => {
      // Setup: Alice creates owner membership, then promotes Bob to admin
      await asUser(ALICE_ID);
      await db.query(`
        INSERT INTO public.server_members (server_id, user_id, role)
        VALUES ('${SERVER_ID}', '${ALICE_ID}', 'owner');
      `);
      await db.query(`
        INSERT INTO public.server_members (server_id, user_id, role)
        VALUES ('${SERVER_ID}', '${BOB_ID}', 'admin');
      `);

      // Switch context to Bob (admin)
      await asUser(BOB_ID);

      // Attack 1: Bob (admin) tries to update own row to 'owner' (filtered out by USING clause)
      const selfEscalateRes = await db.query(`
        UPDATE public.server_members
        SET role = 'owner'
        WHERE server_id = '${SERVER_ID}' AND user_id = '${BOB_ID}'
      `);
      expect(selfEscalateRes.affectedRows).toBe(0);

      // Verify Bob's role is unchanged and remains 'admin'
      const bobCheck = await db.query<{ role: string }>(`
        SELECT role FROM public.server_members WHERE user_id = '${BOB_ID}'
      `);
      expect(bobCheck.rows[0].role).toBe('admin');

      // Attack 2: Bob (admin) tries to demote Alice (the actual server owner)
      const demoteRes = await db.query(`
        UPDATE public.server_members
        SET role = 'member'
        WHERE server_id = '${SERVER_ID}' AND user_id = '${ALICE_ID}'
      `);
      // Since Alice's row is filtered out by the USING clause for non-owners, 0 rows are updated
      expect(demoteRes.affectedRows).toBe(0);

      // Verify Alice is still the owner
      const aliceCheck = await db.query<{ role: string }>(`
        SELECT role FROM public.server_members WHERE user_id = '${ALICE_ID}'
      `);
      expect(aliceCheck.rows[0].role).toBe('owner');
    });

    it('prevents non-owner admins from adding new users as owner or admin', async () => {
      // Alice adds herself as owner and Bob as admin
      await asUser(ALICE_ID);
      await db.query(`
        INSERT INTO public.server_members (server_id, user_id, role)
        VALUES ('${SERVER_ID}', '${ALICE_ID}', 'owner'),
               ('${SERVER_ID}', '${BOB_ID}', 'admin');
      `);

      // Switch context to Bob (admin)
      await asUser(BOB_ID);

      // Bob tries to add Charlie as admin -> Must fail
      await expect(
        db.query(`
          INSERT INTO public.server_members (server_id, user_id, role)
          VALUES ('${SERVER_ID}', '${CHARLIE_ID}', 'admin')
        `)
      ).rejects.toThrow();

      // Bob tries to add Charlie as owner -> Must fail
      await expect(
        db.query(`
          INSERT INTO public.server_members (server_id, user_id, role)
          VALUES ('${SERVER_ID}', '${CHARLIE_ID}', 'owner')
        `)
      ).rejects.toThrow();

      // Bob adds Charlie as regular member -> Must succeed
      await db.query(`
        INSERT INTO public.server_members (server_id, user_id, role)
        VALUES ('${SERVER_ID}', '${CHARLIE_ID}', 'member')
      `);

      const charlieCheck = await db.query<{ role: string }>(`
        SELECT role FROM public.server_members WHERE user_id = '${CHARLIE_ID}'
      `);
      expect(charlieCheck.rows[0].role).toBe('member');
    });

    it('protects server owners from being kicked by non-owner admins', async () => {
      await asUser(ALICE_ID);
      await db.query(`
        INSERT INTO public.server_members (server_id, user_id, role)
        VALUES ('${SERVER_ID}', '${ALICE_ID}', 'owner'),
               ('${SERVER_ID}', '${BOB_ID}', 'admin'),
               ('${SERVER_ID}', '${CHARLIE_ID}', 'member');
      `);

      // Bob (admin) tries to kick Alice (owner)
      await asUser(BOB_ID);
      const kickOwnerRes = await db.query(`
        DELETE FROM public.server_members
        WHERE server_id = '${SERVER_ID}' AND user_id = '${ALICE_ID}'
      `);
      expect(kickOwnerRes.affectedRows).toBe(0);

      // Verify Alice is still in server_members
      const aliceStillHere = await db.query(`
        SELECT 1 FROM public.server_members WHERE user_id = '${ALICE_ID}'
      `);
      expect(aliceStillHere.rows.length).toBe(1);

      // Bob kicks Charlie (regular member) -> Must succeed
      const kickCharlieRes = await db.query(`
        DELETE FROM public.server_members
        WHERE server_id = '${SERVER_ID}' AND user_id = '${CHARLIE_ID}'
      `);
      expect(kickCharlieRes.affectedRows).toBe(1);
    });
  });

  describe('2. Private Conversation & Message Isolation', () => {
    beforeEach(async () => {
      // Alice creates conversation with Bob
      await asUser(ALICE_ID);
      await db.exec(`
        INSERT INTO public.conversations (id, created_by)
        VALUES ('${CONV_ID}', '${ALICE_ID}')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.conversation_members (conversation_id, user_id)
        VALUES ('${CONV_ID}', '${ALICE_ID}'),
               ('${CONV_ID}', '${BOB_ID}')
        ON CONFLICT DO NOTHING;
      `);
    });

    it('allows conversation members to read and insert messages', async () => {
      await asUser(ALICE_ID);
      await db.query(`
        INSERT INTO public.messages (conversation_id, sender_id, content)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'Confidential strategic briefing')
      `);

      // Bob is a member: Bob queries messages -> Must receive Alice message
      await asUser(BOB_ID);
      const bobRes = await db.query<{ content: string }>(`
        SELECT content FROM public.messages WHERE conversation_id = '${CONV_ID}'
      `);
      expect(bobRes.rows.length).toBe(1);
      expect(bobRes.rows[0].content).toBe('Confidential strategic briefing');
    });

    it('strictly blocks non-members from viewing private conversation messages', async () => {
      await asUser(ALICE_ID);
      await db.query(`
        INSERT INTO public.messages (conversation_id, sender_id, content)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'Private key credentials')
      `);

      // Charlie is NOT a conversation member: Queries messages -> RLS filters out all rows
      await asUser(CHARLIE_ID);
      const charlieRes = await db.query(`
        SELECT * FROM public.messages WHERE conversation_id = '${CONV_ID}'
      `);
      expect(charlieRes.rows.length).toBe(0);
    });

    it('strictly blocks non-authors from editing another user messages', async () => {
      await asUser(ALICE_ID);
      const msgRes = await db.query<{ id: string }>(`
        INSERT INTO public.messages (conversation_id, sender_id, content)
        VALUES ('${CONV_ID}', '${ALICE_ID}', 'Original message by Alice')
        RETURNING id
      `);
      const msgId = msgRes.rows[0].id;

      // Bob (even though a conversation member) attempts to edit Alice message
      await asUser(BOB_ID);
      const updateRes = await db.query(`
        UPDATE public.messages
        SET content = 'Tampered content by Bob'
        WHERE id = '${msgId}'
      `);
      expect(updateRes.affectedRows).toBe(0);

      // Verify content is unchanged
      await asUser(ALICE_ID);
      const verifyRes = await db.query<{ content: string }>(`SELECT content FROM public.messages WHERE id = '${msgId}'`);
      expect(verifyRes.rows[0].content).toBe('Original message by Alice');
    });
  });
});
