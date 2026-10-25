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

const replacements = [
  // Hardcoded dark hex backgrounds in modals and cards -> semantic tokens
  [/(?:bg-\[#0c0d14\]|bg-\[#0d0e15\]|bg-\[#10121a\]|bg-\[#0a0c16\]|bg-\[#0d101d\]|bg-\[#090a0f\]|bg-\[#090B0E\]|bg-\[#0c1015\]|bg-\[#0e1017\]|bg-\[#121520\]|bg-\[#0d1411\]|bg-\[#0e1713\])/g, 'bg-card'],
  [/(?:border-\[#0c0d14\]|border-\[#0d0e15\]|border-\[#10121a\])/g, 'border-border'],

  // Hardcoded dark hex strings in className like bg-[#0c0d14]
  [/bg=\[#0c0d14\]/g, 'bg-card'],

  // Amber / Warning / Idle shades
  [/\b(?:text-amber-200|text-amber-300|text-amber-300\/80|text-amber-300\/90|text-amber-400|text-yellow-300|text-yellow-400)\b/g, 'text-warning'],
  [/\b(?:bg-amber-300|bg-amber-400|bg-yellow-400)\b/g, 'bg-warning'],
  [/\b(?:bg-amber-400\/10|bg-amber-500\/10|bg-amber-950\/20|bg-amber-500\/20)\b/g, 'bg-warning/15'],
  [/\b(?:border-amber-400\/20|border-amber-500\/30|border-amber-500\/20)\b/g, 'border-warning/30'],
  [/\b(?:ring-amber-500\/30|ring-amber-400)\b/g, 'ring-warning'],

  // Rose / Red / Danger / DND shades
  [/\b(?:text-rose-200|text-rose-300|text-rose-300\/80|text-rose-300\/90|text-rose-400|text-red-300|text-red-400)\b/g, 'text-danger'],
  [/\b(?:bg-rose-300|bg-rose-400|bg-red-400)\b/g, 'bg-danger'],
  [/\b(?:bg-rose-950\/20|bg-rose-950\/25|bg-rose-500\/10|bg-rose-500\/15|bg-rose-500\/20|bg-red-950\/20)\b/g, 'bg-danger/15'],
  [/\b(?:border-rose-500\/20|border-rose-500\/30|border-red-500\/20)\b/g, 'border-danger/30'],
  [/\b(?:ring-rose-500\/30|ring-rose-400)\b/g, 'ring-danger'],

  // Emerald / Green / Success / Online shades
  [/\b(?:text-emerald-200|text-emerald-300|text-emerald-300\/80|text-emerald-300\/90|text-emerald-400|text-green-300|text-green-400)\b/g, 'text-success'],
  [/\b(?:bg-emerald-300|bg-emerald-400|bg-green-400)\b/g, 'bg-success'],
  [/\b(?:bg-emerald-950\/20|bg-emerald-950\/25|bg-emerald-500\/10|bg-emerald-500\/15|bg-emerald-500\/20)\b/g, 'bg-success/15'],
  [/\b(?:from-emerald-950\/40)\b/g, 'from-success/20'],
  [/\b(?:border-emerald-500\/20|border-emerald-500\/30)\b/g, 'border-success/30'],
  [/\b(?:ring-emerald-400|ring-emerald-500\/20|ring-emerald-500\/30|ring-emerald-500\/40)\b/g, 'ring-success'],

  // Sky / Cyan / Info / Primary shades
  [/\b(?:text-sky-300|text-sky-400|text-cyan-300|text-cyan-400)\b/g, 'text-primary'],
  [/\b(?:bg-sky-400|bg-cyan-400)\b/g, 'bg-primary'],
  [/\b(?:bg-sky-500\/15|bg-cyan-500\/10|bg-cyan-500\/15)\b/g, 'bg-primary-subtle'],
  [/\b(?:border-sky-500\/50|border-cyan-500\/20|border-cyan-500\/30)\b/g, 'border-primary/30'],
  [/\b(?:ring-sky-500\/40|ring-cyan-500\/40)\b/g, 'ring-ring'],

  // Slate / Zinc 500 fallback -> status-offline
  [/\b(?:bg-slate-500|bg-zinc-500)\b/g, 'bg-status-offline'],
  [/\b(?:text-slate-500|text-zinc-500)\b/g, 'text-status-offline'],
];

const files = walkDir(SRC_DIR);
let modifiedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  let original = content;

  for (const [regex, replacement] of replacements) {
    content = content.replace(regex, replacement);
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf-8');
    modifiedCount++;
  }
}

console.log(`Deep token codemod complete. Modified ${modifiedCount} of ${files.length} files.`);
