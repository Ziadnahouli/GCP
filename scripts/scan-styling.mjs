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
      /\.(tsx|jsx)$/.test(entry.name) &&
      !entry.name.includes('.test.')
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const rawColorRegex = /\b(?:bg|text|border|ring|from|to|via)-(?:slate|zinc|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)\b(?:\/[0-9]+)?/g;
const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
const smallTextRegex = /\btext-\[(?:[1-9]|10|11)px\]\b/g;
const whiteOpacityBorderRegex = /border-white\/\[0\.0[0-9]\]/g;

const files = walkDir(SRC_DIR);
let totalRawColors = 0;
let totalHex = 0;
let totalSmallText = 0;
let totalWhiteOpacity = 0;

const fileStats = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const rawMatches = content.match(rawColorRegex) || [];
  const hexMatches = content.match(hexRegex) || [];
  const smallTextMatches = content.match(smallTextRegex) || [];
  const whiteOpacityMatches = content.match(whiteOpacityBorderRegex) || [];

  const count = rawMatches.length + hexMatches.length + smallTextMatches.length + whiteOpacityMatches.length;
  if (count > 0) {
    fileStats.push({
      file: path.relative(SRC_DIR, file),
      raw: rawMatches.length,
      hex: hexMatches.length,
      smallText: smallTextMatches.length,
      whiteOpacity: whiteOpacityMatches.length,
    });
  }

  totalRawColors += rawMatches.length;
  totalHex += hexMatches.length;
  totalSmallText += smallTextMatches.length;
  totalWhiteOpacity += whiteOpacityMatches.length;
}

console.log('=== Styling Audit Summary ===');
console.log(`Analyzed TSX files: ${files.length}`);
console.log(`Files with styling debt: ${fileStats.length}`);
console.log(`Raw palette color classes: ${totalRawColors}`);
console.log(`Hex colors: ${totalHex}`);
console.log(`Small text (<12px): ${totalSmallText}`);
console.log(`White/[0.0x] borders: ${totalWhiteOpacity}`);
