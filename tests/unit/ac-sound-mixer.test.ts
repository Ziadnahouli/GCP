import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('Assetto Corsa Sound Mixer Mod & Vercel Isolation Tests', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const acAppDir = path.join(rootDir, 'apps/python/ac_sound_mixer');
  const pyScriptPath = path.join(acAppDir, 'ac_sound_mixer.py');
  const configPath = path.join(acAppDir, 'config.ini');
  const vercelIgnorePath = path.join(rootDir, '.vercelignore');
  const eslintrcPath = path.join(rootDir, '.eslintrc.json');

  it('ensures all required mod files exist in the native AC hierarchy', () => {
    expect(fs.existsSync(pyScriptPath)).toBe(true);
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.existsSync(path.join(acAppDir, 'icon.png'))).toBe(true);
    expect(fs.existsSync(path.join(acAppDir, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(acAppDir, 'companion_bridge.py'))).toBe(true);
  });

  it('enforces Vercel build exclusions in .vercelignore', () => {
    const vercelIgnoreContent = fs.readFileSync(vercelIgnorePath, 'utf-8');
    expect(vercelIgnoreContent).toContain('apps/');
    expect(vercelIgnoreContent).toContain('*.zip');
    expect(vercelIgnoreContent).toContain('ac_apps/');
  });

  it('enforces ESLint ignore patterns for apps/ in .eslintrc.json', () => {
    const eslintrc = JSON.parse(fs.readFileSync(eslintrcPath, 'utf-8'));
    expect(eslintrc.ignorePatterns).toBeDefined();
    expect(eslintrc.ignorePatterns).toContain('apps/**');
  });

  it('validates config.ini sections and initial defaults', () => {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    expect(configContent).toContain('[General]');
    expect(configContent).toContain('bridge_url = http://127.0.0.1:48123');
    expect(configContent).toContain('[SFX]');
    expect(configContent).toContain('volume = 80');
    expect(configContent).toContain('muted = False');
    expect(configContent).toContain('[Voice]');
    expect(configContent).toContain('volume = 100');
    expect(configContent).toContain('muted = False');
  });

  it('validates Python 3.3.5 AST compatibility (no f-strings, no type annotations, float colors)', () => {
    const pyScript = fs.readFileSync(pyScriptPath, 'utf-8');

    // 1. Prohibit Python 3.6+ f-strings
    const fStringRegex = /\bf["']/;
    expect(pyScript).not.toMatch(fStringRegex);

    // 2. Prohibit type annotations in function signatures
    const typeAnnotationRegex = /def\s+[a-zA-Z0-9_]+\s*\([^)]*:\s*[a-zA-Z0-9_\[\]]/;
    expect(pyScript).not.toMatch(typeAnnotationRegex);

    // 3. Ensure path resolution uses __file__ rather than process cwd
    expect(pyScript).toContain('os.path.dirname(os.path.abspath(__file__))');
    expect(pyScript).toContain('os.path.join(APP_DIR, "config.ini")');

    // 4. Ensure non-blocking worker thread architecture is present
    expect(pyScript).toContain('threading.Thread(target=_worker_loop)');
    expect(pyScript).toContain('queue.Queue');

    // 5. Ensure colors are normalized floats (0.0 to 1.0)
    expect(pyScript).toContain('COLOR_LIVE = (0.15, 0.85, 0.35, 1.0)');
    expect(pyScript).toContain('COLOR_MUTED = (0.92, 0.22, 0.25, 1.0)');
    expect(pyScript).toContain('COLOR_WHITE = (0.95, 0.95, 0.95, 1.0)');
    expect(pyScript).toContain('COLOR_BTN_BG = (0.18, 0.20, 0.25, 1.0)');

    // 6. Test Python AST directly using validator script
    const result = execSync(`python "scripts/validate-ac-ast.py" "${pyScriptPath}"`, {
      cwd: rootDir,
      encoding: 'utf-8',
    });
    expect(result).toContain('is 100% compatible with Assetto Corsa Python 3.3.5');
  });

  it('validates ac_sound_mixer.py smoke test execution', () => {
    try {
      const smokeOutput = execSync(`python "apps/python/ac_sound_mixer/ac_sound_mixer.py"`, {
        cwd: rootDir,
        encoding: 'utf-8',
      });
      expect(smokeOutput).toContain('GCP Sound Mixer loaded successfully');
      expect(smokeOutput).toContain('Test completed cleanly');
    } catch (err: any) {
      // In case python is not in standard path, pass if exit is 0
      expect(err).toBeUndefined();
    }
  });
});
