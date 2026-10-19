// Auto-generated GCP Production Neural Speech Enhancement AudioWorklet Processor


var createRNNWasmModule = (() => {
  var _scriptDir = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : undefined;
  
  return (
function(createRNNWasmModule) {
  createRNNWasmModule = createRNNWasmModule || {};

null;

var Module = typeof createRNNWasmModule != "undefined" ? createRNNWasmModule : {};

var readyPromiseResolve, readyPromiseReject;

Module["ready"] = new Promise(function(resolve, reject) {
 readyPromiseResolve = resolve;
 readyPromiseReject = reject;
});

var moduleOverrides = Object.assign({}, Module);

var arguments_ = [];

var thisProgram = "./this.program";

var quit_ = (status, toThrow) => {
 throw toThrow;
};

var ENVIRONMENT_IS_WEB = typeof window == "object";

var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";

var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string";

var scriptDirectory = "";

function locateFile(path) {
 if (Module["locateFile"]) {
  return Module["locateFile"](path, scriptDirectory);
 }
 return scriptDirectory + path;
}

var read_, readAsync, readBinary, setWindowTitle;

if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
 if (ENVIRONMENT_IS_WORKER) {
  scriptDirectory = self.location.href;
 } else if (typeof document != "undefined" && document.currentScript) {
  scriptDirectory = document.currentScript.src;
 }
 if (_scriptDir) {
  scriptDirectory = _scriptDir;
 }
 if (scriptDirectory.indexOf("blob:") !== 0) {
  scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1);
 } else {
  scriptDirectory = "";
 }
 {
  read_ = url => {
   var xhr = new XMLHttpRequest();
   xhr.open("GET", url, false);
   xhr.send(null);
   return xhr.responseText;
  };
  if (ENVIRONMENT_IS_WORKER) {
   readBinary = url => {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.responseType = "arraybuffer";
    xhr.send(null);
    return new Uint8Array(xhr.response);
   };
  }
  readAsync = (url, onload, onerror) => {
   var xhr = new XMLHttpRequest();
   xhr.open("GET", url, true);
   xhr.responseType = "arraybuffer";
   xhr.onload = () => {
    if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
     onload(xhr.response);
     return;
    }
    onerror();
   };
   xhr.onerror = onerror;
   xhr.send(null);
  };
 }
 setWindowTitle = title => document.title = title;
} else {}

var out = Module["print"] || console.log.bind(console);

var err = Module["printErr"] || console.warn.bind(console);

Object.assign(Module, moduleOverrides);

moduleOverrides = null;

if (Module["arguments"]) arguments_ = Module["arguments"];

if (Module["thisProgram"]) thisProgram = Module["thisProgram"];

if (Module["quit"]) quit_ = Module["quit"];

var wasmBinary;

if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];

var noExitRuntime = Module["noExitRuntime"] || true;

if (typeof WebAssembly != "object") {
 abort("no native wasm support detected");
}

var wasmMemory;

var ABORT = false;

var EXITSTATUS;

var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBufferAndViews(buf) {
 buffer = buf;
 Module["HEAP8"] = HEAP8 = new Int8Array(buf);
 Module["HEAP16"] = HEAP16 = new Int16Array(buf);
 Module["HEAP32"] = HEAP32 = new Int32Array(buf);
 Module["HEAPU8"] = HEAPU8 = new Uint8Array(buf);
 Module["HEAPU16"] = HEAPU16 = new Uint16Array(buf);
 Module["HEAPU32"] = HEAPU32 = new Uint32Array(buf);
 Module["HEAPF32"] = HEAPF32 = new Float32Array(buf);
 Module["HEAPF64"] = HEAPF64 = new Float64Array(buf);
}

var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 16777216;

var wasmTable;

var __ATPRERUN__ = [];

var __ATINIT__ = [];

var __ATPOSTRUN__ = [];

var runtimeInitialized = false;

function preRun() {
 if (Module["preRun"]) {
  if (typeof Module["preRun"] == "function") Module["preRun"] = [ Module["preRun"] ];
  while (Module["preRun"].length) {
   addOnPreRun(Module["preRun"].shift());
  }
 }
 callRuntimeCallbacks(__ATPRERUN__);
}

function initRuntime() {
 runtimeInitialized = true;
 callRuntimeCallbacks(__ATINIT__);
}

function postRun() {
 if (Module["postRun"]) {
  if (typeof Module["postRun"] == "function") Module["postRun"] = [ Module["postRun"] ];
  while (Module["postRun"].length) {
   addOnPostRun(Module["postRun"].shift());
  }
 }
 callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
 __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
 __ATINIT__.unshift(cb);
}

function addOnPostRun(cb) {
 __ATPOSTRUN__.unshift(cb);
}

var runDependencies = 0;

var runDependencyWatcher = null;

var dependenciesFulfilled = null;

function addRunDependency(id) {
 runDependencies++;
 if (Module["monitorRunDependencies"]) {
  Module["monitorRunDependencies"](runDependencies);
 }
}

function removeRunDependency(id) {
 runDependencies--;
 if (Module["monitorRunDependencies"]) {
  Module["monitorRunDependencies"](runDependencies);
 }
 if (runDependencies == 0) {
  if (runDependencyWatcher !== null) {
   clearInterval(runDependencyWatcher);
   runDependencyWatcher = null;
  }
  if (dependenciesFulfilled) {
   var callback = dependenciesFulfilled;
   dependenciesFulfilled = null;
   callback();
  }
 }
}

function abort(what) {
 {
  if (Module["onAbort"]) {
   Module["onAbort"](what);
  }
 }
 what = "Aborted(" + what + ")";
 err(what);
 ABORT = true;
 EXITSTATUS = 1;
 what += ". Build with -sASSERTIONS for more info.";
 var e = new WebAssembly.RuntimeError(what);
 readyPromiseReject(e);
 throw e;
}

var dataURIPrefix = "data:application/octet-stream;base64,";

function isDataURI(filename) {
 return filename.startsWith(dataURIPrefix);
}

var wasmBinaryFile;

wasmBinaryFile = "rnnoise.wasm";

if (!isDataURI(wasmBinaryFile)) {
 wasmBinaryFile = locateFile(wasmBinaryFile);
}

function getBinary(file) {
 try {
  if (file == wasmBinaryFile && wasmBinary) {
   return new Uint8Array(wasmBinary);
  }
  if (readBinary) {
   return readBinary(file);
  } else {
   throw "both async and sync fetching of the wasm failed";
  }
 } catch (err) {
  abort(err);
 }
}

function getBinaryPromise() {
 if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
  if (typeof fetch == "function") {
   return fetch(wasmBinaryFile, {
    credentials: "same-origin"
   }).then(function(response) {
    if (!response["ok"]) {
     throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
    }
    return response["arrayBuffer"]();
   }).catch(function() {
    return getBinary(wasmBinaryFile);
   });
  }
 }
 return Promise.resolve().then(function() {
  return getBinary(wasmBinaryFile);
 });
}

function createWasm() {
 var info = {
  "a": asmLibraryArg
 };
 function receiveInstance(instance, module) {
  var exports = instance.exports;
  Module["asm"] = exports;
  wasmMemory = Module["asm"]["c"];
  updateGlobalBufferAndViews(wasmMemory.buffer);
  wasmTable = Module["asm"]["k"];
  addOnInit(Module["asm"]["d"]);
  removeRunDependency("wasm-instantiate");
 }
 addRunDependency("wasm-instantiate");
 function receiveInstantiationResult(result) {
  receiveInstance(result["instance"]);
 }
 function instantiateArrayBuffer(receiver) {
  return getBinaryPromise().then(function(binary) {
   return WebAssembly.instantiate(binary, info);
  }).then(function(instance) {
   return instance;
  }).then(receiver, function(reason) {
   err("failed to asynchronously prepare wasm: " + reason);
   abort(reason);
  });
 }
 function instantiateAsync() {
  if (!wasmBinary && typeof WebAssembly.instantiateStreaming == "function" && !isDataURI(wasmBinaryFile) && typeof fetch == "function") {
   return fetch(wasmBinaryFile, {
    credentials: "same-origin"
   }).then(function(response) {
    var result = WebAssembly.instantiateStreaming(response, info);
    return result.then(receiveInstantiationResult, function(reason) {
     err("wasm streaming compile failed: " + reason);
     err("falling back to ArrayBuffer instantiation");
     return instantiateArrayBuffer(receiveInstantiationResult);
    });
   });
  } else {
   return instantiateArrayBuffer(receiveInstantiationResult);
  }
 }
 if (Module["instantiateWasm"]) {
  try {
   var exports = Module["instantiateWasm"](info, receiveInstance);
   return exports;
  } catch (e) {
   err("Module.instantiateWasm callback failed with error: " + e);
   return false;
  }
 }
 instantiateAsync().catch(readyPromiseReject);
 return {};
}

function callRuntimeCallbacks(callbacks) {
 while (callbacks.length > 0) {
  var callback = callbacks.shift();
  if (typeof callback == "function") {
   callback(Module);
   continue;
  }
  var func = callback.func;
  if (typeof func == "number") {
   if (callback.arg === undefined) {
    getWasmTableEntry(func)();
   } else {
    getWasmTableEntry(func)(callback.arg);
   }
  } else {
   func(callback.arg === undefined ? null : callback.arg);
  }
 }
}

function getWasmTableEntry(funcPtr) {
 return wasmTable.get(funcPtr);
}

function _emscripten_memcpy_big(dest, src, num) {
 HEAPU8.copyWithin(dest, src, src + num);
}

function getHeapMax() {
 return 2147483648;
}

function emscripten_realloc_buffer(size) {
 try {
  wasmMemory.grow(size - buffer.byteLength + 65535 >>> 16);
  updateGlobalBufferAndViews(wasmMemory.buffer);
  return 1;
 } catch (e) {}
}

function _emscripten_resize_heap(requestedSize) {
 var oldSize = HEAPU8.length;
 requestedSize = requestedSize >>> 0;
 var maxHeapSize = getHeapMax();
 if (requestedSize > maxHeapSize) {
  return false;
 }
 let alignUp = (x, multiple) => x + (multiple - x % multiple) % multiple;
 for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
  var overGrownHeapSize = oldSize * (1 + .2 / cutDown);
  overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
  var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
  var replacement = emscripten_realloc_buffer(newSize);
  if (replacement) {
   return true;
  }
 }
 return false;
}

var asmLibraryArg = {
 "b": _emscripten_memcpy_big,
 "a": _emscripten_resize_heap
};

var asm = createWasm();

var ___wasm_call_ctors = Module["___wasm_call_ctors"] = function() {
 return (___wasm_call_ctors = Module["___wasm_call_ctors"] = Module["asm"]["d"]).apply(null, arguments);
};

var _rnnoise_init = Module["_rnnoise_init"] = function() {
 return (_rnnoise_init = Module["_rnnoise_init"] = Module["asm"]["e"]).apply(null, arguments);
};

var _rnnoise_create = Module["_rnnoise_create"] = function() {
 return (_rnnoise_create = Module["_rnnoise_create"] = Module["asm"]["f"]).apply(null, arguments);
};

var _malloc = Module["_malloc"] = function() {
 return (_malloc = Module["_malloc"] = Module["asm"]["g"]).apply(null, arguments);
};

var _rnnoise_destroy = Module["_rnnoise_destroy"] = function() {
 return (_rnnoise_destroy = Module["_rnnoise_destroy"] = Module["asm"]["h"]).apply(null, arguments);
};

var _free = Module["_free"] = function() {
 return (_free = Module["_free"] = Module["asm"]["i"]).apply(null, arguments);
};

var _rnnoise_process_frame = Module["_rnnoise_process_frame"] = function() {
 return (_rnnoise_process_frame = Module["_rnnoise_process_frame"] = Module["asm"]["j"]).apply(null, arguments);
};

var calledRun;

dependenciesFulfilled = function runCaller() {
 if (!calledRun) run();
 if (!calledRun) dependenciesFulfilled = runCaller;
};

function run(args) {
 args = args || arguments_;
 if (runDependencies > 0) {
  return;
 }
 preRun();
 if (runDependencies > 0) {
  return;
 }
 function doRun() {
  if (calledRun) return;
  calledRun = true;
  Module["calledRun"] = true;
  if (ABORT) return;
  initRuntime();
  readyPromiseResolve(Module);
  if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
  postRun();
 }
 if (Module["setStatus"]) {
  Module["setStatus"]("Running...");
  setTimeout(function() {
   setTimeout(function() {
    Module["setStatus"]("");
   }, 1);
   doRun();
  }, 1);
 } else {
  doRun();
 }
}

Module["run"] = run;

if (Module["preInit"]) {
 if (typeof Module["preInit"] == "function") Module["preInit"] = [ Module["preInit"] ];
 while (Module["preInit"].length > 0) {
  Module["preInit"].pop()();
 }
}

run();


  return Module["ready"];
}
);
})();



/**
 * GCP Real-Time Neural Speech Enhancement Worklet Processor
 *
 * Production architecture:
 *   1. Pre-Processing: 80Hz Butterworth High-Pass Biquad (2nd-order, Q=0.7071)
 *      - Strips DC offset, sub-audible desk rumble, and plosive pops without affecting vocal timbre.
 *   2. Single-Pass RNNoise GRU Neural Speech Enhancement (48kHz, 480 samples / 10ms frame)
 *      - Recurrent GRU state preserved continuously across frames.
 *      - Continuous spectral feature extraction and Bark-band gain synthesis.
 *   3. Mode-Tailored Speech Preserving Blend & Comfort Noise Floor:
 *      - 'off': Bit-exact passthrough of input stream.
 *      - 'balanced': 90% neural denoised + 10% natural acoustic floor during speech;
 *                    gentle -26 dB downward expansion during pauses with 200ms hangover.
 *                    Full whisper, consonant, and syllable ending preservation.
 *      - 'strong': 100% neural denoised; -38 dB stationary pause attenuation with 180ms hangover.
 *   4. Zero-Latency -1.0 dBFS Soft Limiter (tanh headroom saturation)
 *      - Prevents digital clipping from loud vocal bursts or mic bumps.
 *   5. Ring Buffer Conversion (128-sample Web Audio quantum <-> 480-sample RNNoise frame)
 *      - 8192-sample ring buffers with zero dynamic allocations in real-time callback.
 *      - Low algorithmic latency (~12.7 ms end-to-end).
 */
class GcpNeuralNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.FRAME_SIZE = 480;
    this.MAX_RING = 8192;
    this.sampleRate = typeof sampleRate !== 'undefined' ? sampleRate : 48000;

    // Ring buffers for 128 <-> 480 conversion (zero dynamic allocations on audio thread)
    this.inRing = new Float32Array(this.MAX_RING);
    this.outRing = new Float32Array(this.MAX_RING);
    this.inWrite = 0;
    this.inRead = 0;
    this.inCount = 0;
    this.outWrite = 0;
    this.outRead = 0;
    this.outCount = 0;

    // Scratch frame buffers for zero-allocation processing
    this.frameBuffer = new Float32Array(this.FRAME_SIZE);

    // State flags
    this.isReady = false;
    this.isInitializing = false;
    this.mode = 'balanced';
    this.savedMode = 'balanced';

    // RNNoise WASM module, state, and pointers
    this.rnnModule = null;
    this.denoiseState = null;
    this.inPtr = 0;
    this.outPtr = 0;
    this.inOffset = 0;
    this.outOffset = 0;

    // Stage 1: 80 Hz Butterworth High-Pass Biquad (2nd-order, Q = 0.7071)
    const omegaHpf = (2 * Math.PI * 80.0) / this.sampleRate;
    const cosOmegaHpf = Math.cos(omegaHpf);
    const sinOmegaHpf = Math.sin(omegaHpf);
    const alphaHpf = sinOmegaHpf / (2 * 0.7071067811865476);
    const b0Hpf = (1 + cosOmegaHpf) / 2;
    const b1Hpf = -(1 + cosOmegaHpf);
    const b2Hpf = (1 + cosOmegaHpf) / 2;
    const a0Hpf = 1 + alphaHpf;
    this.hpf_b0 = b0Hpf / a0Hpf;
    this.hpf_b1 = b1Hpf / a0Hpf;
    this.hpf_b2 = b2Hpf / a0Hpf;
    this.hpf_a1 = (-2 * cosOmegaHpf) / a0Hpf;
    this.hpf_a2 = (1 - alphaHpf) / a0Hpf;
    this.hpf_d1 = 0.0;
    this.hpf_d2 = 0.0;

    // Stage 3: Smooth VAD tracker & Comfort Floor Expander
    this.vadProb = 0.0;
    this.vadSmooth = 0.0;
    this.gateAttackAlpha = 1.0 - Math.exp(-1.0 / (this.sampleRate * 0.005));  // 5ms smooth attack
    this.gateReleaseAlpha = 1.0 - Math.exp(-1.0 / (this.sampleRate * 0.120)); // 120ms gentle release
    this.hangoverMaxSamples = Math.floor(this.sampleRate * 0.200);           // 200ms hangover
    this.hangoverRemaining = 0;
    this.gateFloorGain = 0.050; // -26 dB comfortable natural floor for Balanced mode
    this.currentGateGain = 1.0;
    this.dryBlend = 0.10;       // 10% clean dry blend during speech for Balanced mode

    // Stage 4: -1.0 dBFS Soft-Brickwall Limiter
    this.limiterThreshold = 0.8912509; // -1.0 dBFS
    this.limiterHeadroom = 1.0 - 0.8912509;

    // Message Port handler
    this.port.onmessage = async (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'INIT_WASM') {
        if (this.isReady || this.isInitializing) return;
        this.isInitializing = true;
        try {
          if (data.mode) {
            this._applyMode(data.mode);
          }
          await this._initModule(data.wasmBinary);
        } catch (err) {
          this.port.postMessage({ type: 'ERROR', error: String(err) });
        } finally {
          this.isInitializing = false;
        }
      } else if (data.type === 'SET_MODE') {
        this._applyMode(data.mode);
        this.port.postMessage({ type: 'MODE_UPDATED', mode: this.mode });
      } else if (data.type === 'SET_ENABLED') {
        const enabled = Boolean(data.enabled);
        this._applyMode(enabled ? (this.savedMode || 'balanced') : 'off');
        this.port.postMessage({ type: 'MODE_UPDATED', mode: this.mode });
      } else if (data.type === 'DESTROY') {
        this._cleanup();
      }
    };
  }

  _applyMode(mode) {
    if (!mode) return;
    this.mode = mode;
    if (mode !== 'off') {
      this.savedMode = mode;
    }

    if (mode === 'strong' || mode === 'krisp-max') {
      this.dryBlend = 0.0;
      this.gateFloorGain = 0.0125; // -38 dB stationary floor
      this.hangoverMaxSamples = Math.floor(this.sampleRate * 0.180);
    } else if (mode === 'light') {
      this.dryBlend = 0.20;
      this.gateFloorGain = 0.10;   // -20 dB light floor
      this.hangoverMaxSamples = Math.floor(this.sampleRate * 0.250);
    } else {
      // balanced & rnnoise-hybrid
      this.dryBlend = 0.10;
      this.gateFloorGain = 0.050;  // -26 dB balanced natural floor
      this.hangoverMaxSamples = Math.floor(this.sampleRate * 0.200);
    }
  }

  async _initModule(wasmBinary) {
    if (typeof createRNNWasmModule !== 'function') {
      throw new Error('createRNNWasmModule is not defined in worklet scope');
    }

    const config = {};
    if (wasmBinary) {
      config.wasmBinary = wasmBinary;
    }

    const mod = await createRNNWasmModule(config);
    this.rnnModule = (mod && mod.ready && typeof mod._malloc !== 'function') ? await mod.ready : mod;

    this.inPtr = this.rnnModule._malloc(this.FRAME_SIZE * 4);
    this.outPtr = this.rnnModule._malloc(this.FRAME_SIZE * 4);
    this.inOffset = this.inPtr / 4;
    this.outOffset = this.outPtr / 4;

    this.denoiseState = this.rnnModule._rnnoise_create();

    this.isReady = true;
    this.port.postMessage({ type: 'READY', sampleRate: this.sampleRate });
  }

  _cleanup() {
    this.isReady = false;
    if (this.rnnModule) {
      if (this.denoiseState) {
        try { this.rnnModule._rnnoise_destroy(this.denoiseState); } catch {}
        this.denoiseState = null;
      }
      if (this.inPtr) {
        try { this.rnnModule._free(this.inPtr); } catch {}
        this.inPtr = 0;
      }
      if (this.outPtr) {
        try { this.rnnModule._free(this.outPtr); } catch {}
        this.outPtr = 0;
      }
      this.rnnModule = null;
    }
    this.inCount = 0;
    this.outCount = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inputChannel0 = input[0];
    const numInputChannels = input.length;
    const len = inputChannel0.length;
    const numOutputChannels = output.length;

    // Passthrough when off or not ready
    if (this.mode === 'off' || !this.isReady) {
      for (let ch = 0; ch < numOutputChannels; ch++) {
        const inCh = input[ch] || inputChannel0;
        const outCh = output[ch];
        for (let i = 0; i < len; i++) {
          outCh[i] = inCh[i];
        }
      }
      this.inWrite = 0;
      this.inRead = 0;
      this.inCount = 0;
      this.outWrite = 0;
      this.outRead = 0;
      this.outCount = 0;
      return true;
    }

    // Step 1: Ingest input samples, Downmix to mono, Apply Stage 1 80Hz HPF
    for (let i = 0; i < len; i++) {
      let rawMono = 0.0;
      if (numInputChannels === 1) {
        rawMono = inputChannel0[i];
      } else {
        let sum = 0.0;
        for (let ch = 0; ch < numInputChannels; ch++) {
          sum += input[ch][i];
        }
        rawMono = sum / numInputChannels;
      }

      // STAGE 1: 80 Hz Butterworth High-Pass Filter (removes rumble, pops)
      const hpfOut = this.hpf_b0 * rawMono + this.hpf_d1;
      this.hpf_d1 = this.hpf_b1 * rawMono - this.hpf_a1 * hpfOut + this.hpf_d2;
      this.hpf_d2 = this.hpf_b2 * rawMono - this.hpf_a2 * hpfOut;

      this.inRing[this.inWrite] = hpfOut;
      this.inWrite = (this.inWrite + 1) % this.MAX_RING;
    }
    this.inCount += len;

    // Step 2: Process complete 480-sample frames through RNNoise Neural Engine
    while (this.inCount >= this.FRAME_SIZE) {
      const heap = this.rnnModule.HEAPF32;
      const inOff = this.inOffset;
      const outOff = this.outOffset;

      // Read 480 samples into scratch frame buffer and WASM input heap
      for (let i = 0; i < this.FRAME_SIZE; i++) {
        const s = this.inRing[this.inRead];
        this.frameBuffer[i] = s;
        heap[inOff + i] = s * 32767.0;
        this.inRead = (this.inRead + 1) % this.MAX_RING;
      }

      // Single-Pass High-Fidelity RNNoise Neural Denoising
      const vadProb = this.rnnModule._rnnoise_process_frame(this.denoiseState, this.outPtr, this.inPtr);
      this.vadProb = vadProb;
      this.vadSmooth = this.vadSmooth * 0.70 + vadProb * 0.30;

      const isSpeech = (this.vadSmooth > 0.40);
      if (isSpeech) {
        this.hangoverRemaining = this.hangoverMaxSamples;
      }

      // Process 480 samples into outRing
      for (let i = 0; i < this.FRAME_SIZE; i++) {
        const wet = heap[outOff + i] / 32767.0;
        const dry = this.frameBuffer[i];

        // Mode-tailored blend
        let blended = wet;
        if (this.dryBlend > 0.0) {
          blended = wet * (1.0 - this.dryBlend) + dry * this.dryBlend;
        }

        // Comfort downward expander during pauses
        if (isSpeech || this.hangoverRemaining > 0) {
          if (!isSpeech) this.hangoverRemaining--;
          this.currentGateGain += this.gateAttackAlpha * (1.0 - this.currentGateGain);
        } else {
          this.currentGateGain += this.gateReleaseAlpha * (this.gateFloorGain - this.currentGateGain);
        }

        const expanded = blended * this.currentGateGain;

        // Stage 4: -1.0 dBFS Soft-Brickwall Limiter
        const absVal = Math.abs(expanded);
        let finalSample = expanded;
        if (absVal > this.limiterThreshold) {
          const excess = absVal - this.limiterThreshold;
          finalSample = Math.sign(expanded) * (this.limiterThreshold + this.limiterHeadroom * Math.tanh(excess / this.limiterHeadroom));
        }

        this.outRing[this.outWrite] = finalSample;
        this.outWrite = (this.outWrite + 1) % this.MAX_RING;
      }
      this.outCount += this.FRAME_SIZE;
      this.inCount -= this.FRAME_SIZE;
    }

    // Step 3: Pop output samples into Web Audio output channels
    if (this.outCount >= len) {
      for (let i = 0; i < len; i++) {
        const val = this.outRing[this.outRead];
        this.outRead = (this.outRead + 1) % this.MAX_RING;
        for (let ch = 0; ch < numOutputChannels; ch++) {
          output[ch][i] = val;
        }
      }
      this.outCount -= len;
    } else {
      // Warmup phase: output whatever is available, or smooth zero
      for (let i = 0; i < len; i++) {
        let val = 0.0;
        if (this.outCount > 0) {
          val = this.outRing[this.outRead];
          this.outRead = (this.outRead + 1) % this.MAX_RING;
          this.outCount--;
        }
        for (let ch = 0; ch < numOutputChannels; ch++) {
          output[ch][i] = val;
        }
      }
    }

    return true;
  }
}

registerProcessor('gcp-rnnoise-processor', GcpNeuralNoiseProcessor);
try {
  registerProcessor('gcp-noise-processor', GcpNeuralNoiseProcessor);
} catch (e) {}
