import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../src');

function walkDir(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        walkDir(fullPath, fileList);
      }
    } else if (
      entry.isFile() &&
      /\.(ts|tsx|js|jsx)$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.includes('.test.')
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const VARIANTS = ['hover', 'active', 'focus', 'focus-visible', 'disabled'];

export function findFlatStates() {
  const files = walkDir(SRC_DIR);
  const violations = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, lineIdx) => {
      // Find strings inside quotes or backticks
      const stringMatches = line.match(/(['"`])([^'"`]+)\1/g);
      if (!stringMatches) return;

      for (const strMatch of stringMatches) {
        // Strip quotes
        const raw = strMatch.slice(1, -1).trim();
        if (!raw || !raw.includes(':')) continue;

        const tokens = raw.split(/\s+/).filter(Boolean);
        const tokenSet = new Set(tokens);

        for (const token of tokens) {
          for (const variant of VARIANTS) {
            const prefix = `${variant}:`;
            if (token.startsWith(prefix)) {
              const baseUtility = token.slice(prefix.length);
              // Ignore if baseUtility itself has a modifier or pseudo-class (e.g. hover:focus:...)
              if (baseUtility.includes(':')) continue;

              // Check if the base utility is also in the token list (e.g., "bg-danger hover:bg-danger")
              if (tokenSet.has(baseUtility)) {
                violations.push({
                  file: path.relative(path.resolve(__dirname, '..'), file),
                  line: lineIdx + 1,
                  variant,
                  token,
                  baseUtility,
                  context: line.trim(),
                });
              }
            }
          }
        }
      }
    });
  }

  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = findFlatStates();
  console.log(`=== Flat State Variants Audit ===`);
  console.log(`Scanning: ${SRC_DIR}`);
  console.log(`Found ${violations.length} flat state violation(s).`);

  if (violations.length > 0) {
    console.log(`\nViolations found:`);
    violations.slice(0, 50).forEach((v) => {
      console.log(`- ${v.file}:${v.line} -> [${v.token}] equals base [${v.baseUtility}]`);
    });
    if (violations.length > 50) {
      console.log(`... and ${violations.length - 50} more.`);
    }
    process.exit(1);
  } else {
    console.log(`✅ Zero flat state violations found.`);
    process.exit(0);
  }
}
