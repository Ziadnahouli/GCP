const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function build() {
  const rootDir = path.resolve(__dirname, '../..');
  const gluePath = path.join(rootDir, 'node_modules/@jitsi/rnnoise-wasm/dist/rnnoise.js');

  if (!fs.existsSync(gluePath)) {
    throw new Error('Missing @jitsi/rnnoise-wasm glue. Run npm install first.');
  }

  const emscriptenGlue = fs.readFileSync(gluePath, 'utf8')
    .replace('return createRNNWasmModule.ready', 'return Module["ready"];')
    .replace('export default createRNNWasmModule;', '');

  const dspCorePath = path.join(rootDir, 'src/audio/worklet/dsp-core.ts');
  const processorPath = path.join(rootDir, 'src/audio/worklet/processor.ts');

  const dspCoreTs = fs.readFileSync(dspCorePath, 'utf8');
  const processorTs = fs.readFileSync(processorPath, 'utf8');

  const dspCoreJs = ts.transpileModule(dspCoreTs, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, removeComments: false },
  }).outputText.replace(/export\s+/g, '');

  const processorJs = ts.transpileModule(processorTs, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, removeComments: false },
  }).outputText
    .replace(/import\s+[\s\S]*?from\s+['"].*?['"];?/g, '')
    .replace(/export\s+/g, '');

  const fullWorklet =
    '// Auto-generated GCP Production Neural Speech Enhancement AudioWorklet Processor\n' +
    '// DO NOT EDIT DIRECTLY. Source files: src/audio/worklet/dsp-core.ts and processor.ts\n' +
    '// Build script: npm run build:worklet\n\n' +
    emscriptenGlue + '\n\n' +
    dspCoreJs + '\n\n' +
    processorJs;

  const targetPath = path.join(rootDir, 'public/worklets/gcp-rnnoise-processor.js');
  fs.writeFileSync(targetPath, fullWorklet, 'utf8');

  // Deduplicated forwarding stub for legacy worklet filename
  const legacyStub =
    '// Deduplicated forwarder to canonical gcp-rnnoise-processor.js\n' +
    '// AudioWorkletGlobalScope supports importScripts for module aggregation\n' +
    "importScripts('/worklets/gcp-rnnoise-processor.js');\n";
  const backupPath = path.join(rootDir, 'public/worklets/gcp-noise-processor.js');
  fs.writeFileSync(backupPath, legacyStub, 'utf8');

  console.log(`[build:worklet] Generated ${targetPath} (${Buffer.byteLength(fullWorklet, 'utf8')} bytes)`);
  console.log(`[build:worklet] Generated deduplicated stub ${backupPath} (${Buffer.byteLength(legacyStub, 'utf8')} bytes)`);
}

build();
