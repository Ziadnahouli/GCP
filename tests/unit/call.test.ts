import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const callTokenRequestSchema = z.object({
  conversationId: z.string().min(1, { message: 'Conversation ID required' }),
  roomName: z
    .string()
    .min(1)
    .regex(/^nexus-room-[a-zA-Z0-9_-]+$/, {
      message: 'Invalid room name format',
    }),
});

describe('LiveKit WebRTC Call Validation', () => {
  describe('callTokenRequestSchema', () => {
    it('accepts valid room name and conversation ID', () => {
      const result = callTokenRequestSchema.safeParse({
        conversationId: 'conv-12345',
        roomName: 'nexus-room-conv-12345',
      });
      expect(result.success).toBe(true);
    });

    it('rejects malformed room name prefixes', () => {
      const result = callTokenRequestSchema.safeParse({
        conversationId: 'conv-12345',
        roomName: 'illegal-room-conv-12345',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty conversation ID', () => {
      const result = callTokenRequestSchema.safeParse({
        conversationId: '',
        roomName: 'nexus-room-123',
      });
      expect(result.success).toBe(false);
    });
  });
});
