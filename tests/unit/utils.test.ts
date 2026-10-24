import { describe, it, expect } from 'vitest';
import { cn, formatInitials, truncate, addBoundedSet, setBoundedMap } from '@/lib/utils';

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

  describe('Bounded Collections', () => {
    it('addBoundedSet enforces maxSize with FIFO eviction', () => {
      const set = new Set<string>();
      addBoundedSet(set, 'a', 3);
      addBoundedSet(set, 'b', 3);
      addBoundedSet(set, 'c', 3);
      expect(Array.from(set)).toEqual(['a', 'b', 'c']);

      // Adding duplicate should not evict
      addBoundedSet(set, 'b', 3);
      expect(Array.from(set)).toEqual(['a', 'b', 'c']);

      // Adding 4th element should evict 'a' (FIFO)
      addBoundedSet(set, 'd', 3);
      expect(Array.from(set)).toEqual(['b', 'c', 'd']);
    });

    it('setBoundedMap enforces maxSize with FIFO eviction', () => {
      const map = new Map<string, number>();
      setBoundedMap(map, 'k1', 1, 3);
      setBoundedMap(map, 'k2', 2, 3);
      setBoundedMap(map, 'k3', 3, 3);
      expect(Array.from(map.keys())).toEqual(['k1', 'k2', 'k3']);

      // Updating existing key does not evict
      setBoundedMap(map, 'k2', 20, 3);
      expect(map.get('k2')).toBe(20);
      expect(Array.from(map.keys())).toEqual(['k1', 'k2', 'k3']);

      // Adding new key evicts 'k1' (FIFO)
      setBoundedMap(map, 'k4', 4, 3);
      expect(Array.from(map.keys())).toEqual(['k2', 'k3', 'k4']);
      expect(map.has('k1')).toBe(false);
    });
  });
});
