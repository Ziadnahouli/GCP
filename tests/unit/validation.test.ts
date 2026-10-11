import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  profileUpdateSchema,
} from '@/lib/validation/auth';

describe('Authentication & Profile Validation Schemas', () => {
  describe('loginSchema', () => {
    it('validates a valid email and password', () => {
      const result = loginSchema.safeParse({
        email: 'gamer@nexus.gg',
        password: 'Password123!',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid email format', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'Password123!',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('valid email');
      }
    });

    it('rejects passwords shorter than 6 characters', () => {
      const result = loginSchema.safeParse({
        email: 'gamer@nexus.gg',
        password: '123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('accepts valid registration payload', () => {
      const result = registerSchema.safeParse({
        username: 'pro_sniper_99',
        displayName: 'Pro Sniper',
        email: 'sniper@nexus.gg',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });
      expect(result.success).toBe(true);
    });

    it('rejects usernames with illegal characters', () => {
      const result = registerSchema.safeParse({
        username: 'sniper@#$%',
        displayName: 'Pro Sniper',
        email: 'sniper@nexus.gg',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });
      expect(result.success).toBe(false);
    });

    it('rejects passwords without uppercase or numbers', () => {
      const result = registerSchema.safeParse({
        username: 'validuser',
        displayName: 'Valid User',
        email: 'valid@nexus.gg',
        password: 'alllowercase',
        confirmPassword: 'alllowercase',
      });
      expect(result.success).toBe(false);
    });

    it('rejects passwords that do not match confirmPassword', () => {
      const result = registerSchema.safeParse({
        username: 'validuser',
        displayName: 'Valid User',
        email: 'valid@nexus.gg',
        password: 'Password123!',
        confirmPassword: 'DifferentPassword123!',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe("Passwords don't match");
      }
    });
  });

  describe('profileUpdateSchema', () => {
    it('accepts valid profile updates', () => {
      const result = profileUpdateSchema.safeParse({
        displayName: 'Apex Legend',
        username: 'apex_legend',
        bio: 'Competitive player',
        customStatus: 'In match',
        status: 'online',
        bannerColor: '#8b5cf6',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid presence status', () => {
      const result = profileUpdateSchema.safeParse({
        displayName: 'Apex Legend',
        username: 'apex_legend',
        status: 'invalid_status_enum',
      });
      expect(result.success).toBe(false);
    });
  });
});
