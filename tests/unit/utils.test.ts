import { describe, it, expect } from 'vitest';
import { cn, formatInitials, truncate } from '@/lib/utils';

describe('Utility Functions', () => {
  describe('formatInitials', () => {
    it('returns uppercase initials for single name', () => {
      expect(formatInitials('Gamer')).toBe('GA');
    });

    it('returns first and last initials for two words', () => {
      expect(formatInitials('Apex Striker')).toBe('AS');
    });

    it('handles multiple words properly', () => {
      expect(formatInitials('Call Of Duty')).toBe('CD');
    });

    it('handles null or empty names', () => {
      expect(formatInitials(null)).toBe('?');
      expect(formatInitials('')).toBe('?');
    });
  });

  describe('truncate', () => {
    it('truncates strings exceeding max length', () => {
      expect(truncate('Super long status message here', 10)).toBe('Super long...');
    });

    it('leaves short strings untouched', () => {
      expect(truncate('Hello', 10)).toBe('Hello');
    });
  });

  describe('cn', () => {
    it('merges tailwind class names properly', () => {
      expect(cn('p-2', 'p-4', 'text-white')).toBe('p-4 text-white');
    });
  });
});
