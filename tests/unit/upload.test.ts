import { describe, it, expect } from 'vitest';
import { validateFile, formatFileSize, sanitizeFileName } from '@/lib/storage/upload';

describe('Storage & Attachment Upload Validation', () => {
  describe('formatFileSize', () => {
    it('formats 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('formats kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
    });

    it('formats megabytes', () => {
      expect(formatFileSize(1024 * 1024 * 5)).toBe('5 MB');
    });
  });

  describe('sanitizeFileName', () => {
    it('removes spaces and special characters', () => {
      const sanitized = sanitizeFileName('my cool clip! #1.mp4');
      expect(sanitized).not.toContain(' ');
      expect(sanitized).not.toContain('!');
      expect(sanitized).not.toContain('#');
      expect(sanitized.endsWith('.mp4')).toBe(true);
    });
  });

  describe('validateFile', () => {
    it('blocks dangerous executable files', () => {
      const fakeFile = new File(['dangerous'], 'virus.exe', { type: 'application/x-msdownload' });
      const result = validateFile(fakeFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('strictly blocked');
    });

    it('blocks batch script files', () => {
      const fakeFile = new File(['echo hi'], 'script.bat', { type: 'text/plain' });
      const result = validateFile(fakeFile);
      expect(result.valid).toBe(false);
    });

    it('blocks files exceeding 25MB limit', () => {
      // 26MB file
      const bigBuffer = new Uint8Array(26 * 1024 * 1024);
      const fakeFile = new File([bigBuffer], 'huge_gameplay.mp4', { type: 'video/mp4' });
      const result = validateFile(fakeFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maximum size of 25MB');
    });

    it('accepts standard images', () => {
      const fakeFile = new File(['image data'], 'screenshot.png', { type: 'image/png' });
      const result = validateFile(fakeFile);
      expect(result.valid).toBe(true);
    });

    it('accepts standard video recordings', () => {
      const fakeFile = new File(['video data'], 'clutch_play.mp4', { type: 'video/mp4' });
      const result = validateFile(fakeFile);
      expect(result.valid).toBe(true);
    });
  });
});
