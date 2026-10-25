import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../src');

// Committed baseline thresholds (ratchet ceilings: current count cannot exceed these)
// Updated based on executed count from src/ tree
const BASELINE_CEILINGS = {
  emptyCatchBlocks: 218,
  anyTypeUsage: 255,
  consoleLogUsage: 58,
};

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

  const emptyCatchRegex = /catch\s*(\([^\)]*\))?\s*\{\s*\}/g;
  const anyTypeRegex = /:\s*any\b|as\s+any\b|<any>/g;
  const consoleLogRegex = /console\.log\s*\(/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');

    const emptyCatches = content.match(emptyCatchRegex);
    if (emptyCatches) emptyCatchBlocks += emptyCatches.length;

    const anyMatches = content.match(anyTypeRegex);
    if (anyMatches) anyTypeUsage += anyMatches.length;

    const logMatches = content.match(consoleLogRegex);
    if (logMatches) consoleLogUsage += logMatches.length;
  }

  return { emptyCatchBlocks, anyTypeUsage, consoleLogUsage, totalFiles: files.length };
}

function run() {
  console.log('=== Quality Ratchet Audit ===');
  console.log(`Scanning: ${SRC_DIR}`);
  const results = analyzeFiles();

  console.log(`Total analyzed source files: ${results.totalFiles}`);
  console.log(`- Empty catch blocks: ${results.emptyCatchBlocks} (Ceiling: ${BASELINE_CEILINGS.emptyCatchBlocks})`);
  console.log(`- Explicit 'any' usages: ${results.anyTypeUsage} (Ceiling: ${BASELINE_CEILINGS.anyTypeUsage})`);
  console.log(`- 'console.log' statements: ${results.consoleLogUsage} (Ceiling: ${BASELINE_CEILINGS.consoleLogUsage})`);

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

  if (failed) {
    console.error('\nQuality ratchet check FAILED. Do not introduce new code smells.');
    process.exit(1);
  } else {
    console.log('\n✅ All quality ratchet thresholds satisfied.');
    process.exit(0);
  }
}

run();
