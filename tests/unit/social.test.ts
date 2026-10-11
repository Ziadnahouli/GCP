import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const messageInputSchema = z.object({
  content: z.string().trim().min(1, { message: 'Message cannot be empty' }).max(2000),
  conversationId: z.string().uuid().or(z.string().min(1)),
  replyToId: z.string().uuid().nullable().optional(),
});

const friendRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, { message: 'Username must be at least 3 characters' })
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message: 'Username may only contain letters, numbers, underscores, and hyphens',
    }),
});

describe('Social & Real-Time Messaging Validation', () => {
  describe('messageInputSchema', () => {
    it('accepts valid message text', () => {
      const result = messageInputSchema.safeParse({
        content: 'GG well played squad! Let’s queue up again.',
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        replyToId: null,
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty or whitespace-only messages', () => {
      const result = messageInputSchema.safeParse({
        content: '   ',
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });

    it('rejects messages longer than 2000 characters', () => {
      const result = messageInputSchema.safeParse({
        content: 'a'.repeat(2001),
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('friendRequestSchema', () => {
    it('validates proper gamer tag/username', () => {
      const result = friendRequestSchema.safeParse({
        username: 'pro_striker_99',
      });
      expect(result.success).toBe(true);
    });

    it('rejects usernames with spaces or special symbols', () => {
      const result = friendRequestSchema.safeParse({
        username: 'pro striker!',
      });
      expect(result.success).toBe(false);
    });

    it('rejects usernames shorter than 3 characters', () => {
      const result = friendRequestSchema.safeParse({
        username: 'gg',
      });
      expect(result.success).toBe(false);
    });
  });
});
