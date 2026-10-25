import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../src');

// Committed baseline thresholds (ratchet ceilings: current count cannot exceed these)
const BASELINE_CEILINGS = {
  emptyCatchBlocks: 218,
  anyTypeUsage: 255,
  consoleLogUsage: 58,
  rawColorClasses: 0,
  smallTextClasses: 0,
  whiteOpacityBorders: 0,
};

// Files permitted to contain hex strings (theme metadata, preset palettes, data fallback)
const HEX_ALLOWLIST = new Set([
  'app/layout.tsx',
  'components/layout/settings/ProfileTab.tsx',
  'components/layout/settings-modal.tsx',
  'components/servers/server-settings-modal.tsx',
  'features/auth/auth-provider.tsx',
]);

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

function analyzeFiles() {
  const files = walkDir(SRC_DIR);
  let emptyCatchBlocks = 0;
  let anyTypeUsage = 0;
  let consoleLogUsage = 0;
  let rawColorClasses = 0;
  let smallTextClasses = 0;
  let whiteOpacityBorders = 0;
  let unallowedHexUsage = 0;

  const emptyCatchRegex = /catch\s*(\([^\)]*\))?\s*\{\s*\}/g;
  const anyTypeRegex = /:\s*any\b|as\s+any\b|<any>/g;
  const consoleLogRegex = /console\.log\s*\(/g;
  const rawColorRegex = /\b(?:bg|text|border|ring|from|to|via)-(?:slate|zinc|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)\b(?:\/[0-9]+)?/g;
  const smallTextRegex = /\btext-\[(?:[1-9]|10|11)px\]/g;
  const whiteOpacityBorderRegex = /(?:border|border-[tbxyrl])-(?:white|black)\/(?:\[0\.[0-9]+\]|[0-9]+)/g;
  const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const relPath = path.relative(SRC_DIR, file).replace(/\\/g, '/');

    const emptyCatches = content.match(emptyCatchRegex);
    if (emptyCatches) emptyCatchBlocks += emptyCatches.length;

    const anyMatches = content.match(anyTypeRegex);
    if (anyMatches) anyTypeUsage += anyMatches.length;

    const logMatches = content.match(consoleLogRegex);
    if (logMatches) consoleLogUsage += logMatches.length;

    // Token Ratchet (only in TSX/JSX UI components)
    if (/\.(tsx|jsx)$/.test(file)) {
      const rawMatches = content.match(rawColorRegex);
      if (rawMatches) {
        rawColorClasses += rawMatches.length;
        console.warn(`[WARN] Raw colors in ${relPath}: ${rawMatches.join(', ')}`);
      }

      const textMatches = content.match(smallTextRegex);
      if (textMatches) smallTextClasses += textMatches.length;

      const borderMatches = content.match(whiteOpacityBorderRegex);
      if (borderMatches) whiteOpacityBorders += borderMatches.length;

      if (!HEX_ALLOWLIST.has(relPath)) {
        const hexMatches = content.match(hexRegex);
        if (hexMatches) {
          unallowedHexUsage += hexMatches.length;
          console.warn(`[WARN] Non-allowlisted hex in ${relPath}: ${hexMatches.join(', ')}`);
        }
      }
    }
  }

  return {
    emptyCatchBlocks,
    anyTypeUsage,
    consoleLogUsage,
    rawColorClasses,
    smallTextClasses,
    whiteOpacityBorders,
    unallowedHexUsage,
    totalFiles: files.length,
  };
}

function run() {
  console.log('=== Quality & Clean Pro Token Ratchet Audit ===');
  console.log(`Scanning: ${SRC_DIR}`);
  const results = analyzeFiles();

  console.log(`Total analyzed source files: ${results.totalFiles}`);
  console.log(`- Empty catch blocks: ${results.emptyCatchBlocks} (Ceiling: ${BASELINE_CEILINGS.emptyCatchBlocks})`);
  console.log(`- Explicit 'any' usages: ${results.anyTypeUsage} (Ceiling: ${BASELINE_CEILINGS.anyTypeUsage})`);
  console.log(`- 'console.log' statements: ${results.consoleLogUsage} (Ceiling: ${BASELINE_CEILINGS.consoleLogUsage})`);
  console.log(`- Raw palette color classes: ${results.rawColorClasses} (Ceiling: ${BASELINE_CEILINGS.rawColorClasses})`);
  console.log(`- Small text (<12px) classes: ${results.smallTextClasses} (Ceiling: ${BASELINE_CEILINGS.smallTextClasses})`);
  console.log(`- White/[0.0x] opacity borders: ${results.whiteOpacityBorders} (Ceiling: ${BASELINE_CEILINGS.whiteOpacityBorders})`);
  console.log(`- Non-allowlisted hex values: ${results.unallowedHexUsage} (Ceiling: 0)`);

  let failed = false;

  if (results.emptyCatchBlocks > BASELINE_CEILINGS.emptyCatchBlocks) {
    console.error(`❌ REGRESSION: Empty catch blocks (${results.emptyCatchBlocks}) exceeded ceiling (${BASELINE_CEILINGS.emptyCatchBlocks})`);
    failed = true;
  }
  if (results.anyTypeUsage > BASELINE_CEILINGS.anyTypeUsage) {
    console.error(`❌ REGRESSION: Explicit any usages (${results.anyTypeUsage}) exceeded ceiling (${BASELINE_CEILINGS.anyTypeUsage})`);
    failed = true;
  }
  if (results.consoleLogUsage > BASELINE_CEILINGS.consoleLogUsage) {
    console.error(`❌ REGRESSION: console.log usages (${results.consoleLogUsage}) exceeded ceiling (${BASELINE_CEILINGS.consoleLogUsage})`);
    failed = true;
  }
  if (results.rawColorClasses > BASELINE_CEILINGS.rawColorClasses) {
    console.error(`❌ REGRESSION: Raw palette colors (${results.rawColorClasses}) found in UI components! Must use semantic tokens.`);
    failed = true;
  }
  if (results.smallTextClasses > BASELINE_CEILINGS.smallTextClasses) {
    console.error(`❌ REGRESSION: Small text under 12px (${results.smallTextClasses}) found in UI components! Minimum size is text-xs (12px).`);
    failed = true;
  }
  if (results.whiteOpacityBorders > BASELINE_CEILINGS.whiteOpacityBorders) {
    console.error(`❌ REGRESSION: White opacity borders (${results.whiteOpacityBorders}) found in UI components! Must use border-border.`);
    failed = true;
  }
  if (results.unallowedHexUsage > 0) {
    console.error(`❌ REGRESSION: Non-allowlisted hex colors (${results.unallowedHexUsage}) found! Must use semantic tokens.`);
    failed = true;
  }

  if (failed) {
    console.error('\nQuality & Token ratchet check FAILED.');
    process.exit(1);
  } else {
    console.log('\n✅ All quality & Clean Pro token ratchet thresholds satisfied (Zero Violations).');
    process.exit(0);
  }
}

run();
