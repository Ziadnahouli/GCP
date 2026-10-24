// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('RealtimeHub Channel Leak & Direct Invocation Audit (B1)', () => {
  function getSourceFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getSourceFiles(fullPath));
      } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('asserts that no direct supabase.channel(...) calls exist outside realtime-hub.ts', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const sourceFiles = getSourceFiles(srcDir);
    const violations: { file: string; line: number; text: string }[] = [];

    const allowedFile = path.normalize(path.resolve(srcDir, 'lib/realtime/realtime-hub.ts'));

    for (const file of sourceFiles) {
      if (path.normalize(file) === allowedFile) {
        continue;
      }

      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        // Look for calls to .channel(
        if (/\b(?:supabase|client)\.channel\s*\(/.test(line)) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: idx + 1,
            text: line.trim(),
          });
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
