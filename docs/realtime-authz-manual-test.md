# Supabase Realtime Authorization Manual Verification Guide

This document describes how to manually and programmatically verify Supabase Realtime Authorization on private channels (Remediation A2).

## Overview

Supabase Realtime Authorization enforces Row Level Security on `realtime.messages`. When a client subscribes to a private channel (configured via `config: { private: true }`), Supabase inspects the client's JWT and evaluates policies on `realtime.messages` using `realtime.topic()`.

### Policies Enforced (`00025` and `00028_realtime_authorization_hardening.sql`)

1. **Conversation Topics** (`^conv:<id>:*`, `^chat-room-<id>$`, `^call-room-<id>$`, `^call-status-sync-<id>$`):
   - Allowed only if `public.is_conversation_member(conv_id, auth.uid())` is true.
2. **User Private Topics** (`^user:<id>:*`, `^user_notifications_<id>$`):
   - Allowed only if `auth.uid() = user_id`.
3. **User Signaling Topics** (`^user-signals-<id>$`):
   - **SELECT (Listen)**: Strictly restricted to target user (`auth.uid() = target_user_id`). Eavesdropping by other users is rejected.
   - **INSERT (Broadcast)**: Allowed only if `public.can_user_signal_target(auth.uid(), target_user_id)` is true (requires active friendship or mutual server membership, non-blocked status, and matching DM privacy settings).
4. **Server Voice & Channel Topics** (`^server:<id>:*`, `^server_voice_<id>$`, `^channel:<id>:*`, `^chan-room-<id>$`):
   - Allowed only if caller is an active, non-banned member of the server.
5. **Presence Channels** (`^presence:<id>$`):
   - Scoped strictly to the authenticated user, established friends, or mutual server squadmates.
6. **Anonymous Role**:
   - Strictly denied all access to `realtime.messages`.

---

## Required Dashboard Configuration: Disable "Allow public access" (R4)

For Supabase Realtime to enforce RLS on private channels, the following setting in the Supabase Dashboard must be applied:

1. Log into your **Supabase Dashboard** for your project.
2. Go to **Project Settings** (gear icon) > **Realtime**.
3. Locate the **Allow public access** toggle under Channel Authorization.
4. **DISABLE** the "Allow public access" toggle (ensure it is switched OFF).
5. When public access is disabled, all clients connecting to private channels (`config: { private: true }`) must present a valid user JWT, and the PostgreSQL RLS policies on `realtime.messages` are authoritatively evaluated.
6. If "Allow public access" is left enabled globally, unauthorized clients could bypass RLS on unauthenticated topics.

---

## Automated Verification (PGlite Integration Tests)

Run the automated integration test suite which applies all migrations sequentially and tests role separation against in-memory PostgreSQL:

```bash
npm test tests/integration/postgres-rls.test.ts -t "S10"
```

Verified assertions in S10:
- Conversation members can broadcast and listen; non-members are rejected by RLS.
- Users can access their own `user:<id>:signals` topic; unauthorized users are blocked.
- Server members can access `server:<id>:voice`; non-members are blocked.
- Server members can access `channel:<id>:chat`; non-members are blocked.
- Anonymous/unauthenticated requests to `realtime.messages` are rejected.

---

## Live Verification Script

To verify against a live Supabase project with two authenticated users (Alice and Bob):

### 1. Dry Run / Self Test

```bash
node scripts/test-realtime-authz.mjs --dry-run
```

### 2. Live Verification with Two User Tokens

```bash
node scripts/test-realtime-authz.mjs \
  --url "$NEXT_PUBLIC_SUPABASE_URL" \
  --anonKey "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  --tokenA "$JWT_ALICE" \
  --tokenB "$JWT_BOB" \
  --convId "$ALICE_PRIVATE_CONVERSATION_ID"
```

**Expected Outcome**:
- Client A connects and receives subscription status `SUBSCRIBED`.
- Client B (not in Alice's conversation) receives `CHANNEL_ERROR` or no broadcast messages.
- The test asserts that Client B receives 0 broadcast messages.
