// Auto-generated GCP Production Neural Speech Enhancement AudioWorklet Processor
// DO NOT EDIT DIRECTLY. Source files: src/audio/worklet/dsp-core.ts and processor.ts
// Build script: npm run build:worklet


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
 * GCP Real-Time Neural Speech Enhancement DSP Core
 *
 * Modular, deterministic, zero-allocation audio DSP primitives for 48 kHz real-time audio.
 * Provides tested building blocks for AudioWorklet and offline evaluation harnesses.
 */
const MODE_CONFIGS = {
    off: {
        floorGain: 1.0,
        speechThreshold: 0.0,
        speechHysteresis: 0.0,
        hangoverSamples: 0,
        attackAlpha: 1.0,
        releaseAlpha: 1.0,
    },
    light: {
        floorGain: 0.0501, // -26 dB gentle acoustic floor (preserves whispers and quiet breathing)
        speechThreshold: 0.28,
        speechHysteresis: 0.20,
        hangoverSamples: Math.floor(48000 * 0.450), // 450 ms generous hangover
        attackAlpha: 1.0 - Math.exp(-1.0 / (48000 * 0.003)),
        releaseAlpha: 1.0 - Math.exp(-1.0 / (48000 * 0.250)),
    },
    balanced: {
        floorGain: 0.0158, // -36 dB balanced natural floor (~20 dB quieter than raw mic)
        speechThreshold: 0.35,
        speechHysteresis: 0.25,
        hangoverSamples: Math.floor(48000 * 0.250), // 250 ms
        attackAlpha: 1.0 - Math.exp(-1.0 / (48000 * 0.003)),
        releaseAlpha: 1.0 - Math.exp(-1.0 / (48000 * 0.180)),
    },
    strong: {
        floorGain: 0.0158, // -36 dB robust floor (avoids harsh digital black and codec cutting)
        speechThreshold: 0.38,
        speechHysteresis: 0.26,
        hangoverSamples: Math.floor(48000 * 0.400), // 400 ms
        attackAlpha: 1.0 - Math.exp(-1.0 / (48000 * 0.003)),
        releaseAlpha: 1.0 - Math.exp(-1.0 / (48000 * 0.180)),
    },
};
/**
 * 2nd-order Butterworth High-Pass Biquad Filter (75 Hz default)
 * Removes subsonic handling noise, desk rumbles, boom vibrations, and breath blasts
 * while cleanly preserving low male vocal fundamentals (lowest human fundamental ~85 Hz).
 */
class ButterworthHighPassFilter {
    constructor(cutoffHz = 75.0, sampleRate = 48000, q = 0.7071067811865476) {
        this.d1 = 0.0;
        this.d2 = 0.0;
        const omega = (2 * Math.PI * cutoffHz) / sampleRate;
        const cosOmega = Math.cos(omega);
        const sinOmega = Math.sin(omega);
        const alpha = sinOmega / (2 * q);
        const b0 = (1 + cosOmega) / 2;
        const b1 = -(1 + cosOmega);
        const b2 = (1 + cosOmega) / 2;
        const a0 = 1 + alpha;
        this.b0 = b0 / a0;
        this.b1 = b1 / a0;
        this.b2 = b2 / a0;
        this.a1 = (-2 * cosOmega) / a0;
        this.a2 = (1 - alpha) / a0;
    }
    process(x) {
        const y = this.b0 * x + this.d1;
        this.d1 = this.b1 * x - this.a1 * y + this.d2;
        this.d2 = this.b2 * x - this.a2 * y;
        return y;
    }
    reset() {
        this.d1 = 0.0;
        this.d2 = 0.0;
    }
}
/**
 * Fast Transient Click Suppressor (Keyboard & Mouse Click Rejection)
 * Uses dual EMA envelope tracking (0.5 ms fast, 20 ms slow) to detect high-crest transients.
 * When enabled post-RNNoise, operates on the residual without mangling vocal consonants (Q1).
 */
class TransientClickSuppressor {
    constructor(sampleRate = 48000, thresholdDb = 12.0) {
        this.fastEnv = 0.0;
        this.slowEnv = 0.0;
        this.prevIn = 0.0;
        this.prevSample = 0.0;
        this.hold = 0.0;
        this.enabled = true;
        this.fastAlpha = 1.0 - Math.exp(-1.0 / (sampleRate * 0.0005));
        this.slowAlpha = 1.0 - Math.exp(-1.0 / (sampleRate * 0.020));
        this.thresholdRatio = Math.pow(10, thresholdDb / 20.0);
    }
    process(sample, vadSmooth) {
        if (!this.enabled)
            return sample;
        const diff = Math.abs(sample - this.prevIn);
        this.prevIn = sample;
        this.fastEnv += this.fastAlpha * (diff - this.fastEnv);
        this.slowEnv += this.slowAlpha * (diff - this.slowEnv);
        const safeSlow = Math.max(this.slowEnv, 0.001);
        const crest = this.fastEnv / safeSlow;
        if (crest > this.thresholdRatio && vadSmooth < 0.65) {
            this.hold = 1.0;
        }
        this.hold *= 0.95;
        // Scale-tolerant slope limiter that relaxes when speech is detected (Q1)
        const maxSlope = 0.035 + 0.065 * Math.min(1.0, vadSmooth * 1.5);
        const delta = sample - this.prevSample;
        const absDelta = Math.abs(delta);
        let filtered = sample;
        if ((this.hold > 0.05 || absDelta > maxSlope) && vadSmooth < 0.65) {
            const effectiveSlope = maxSlope * (1.0 - 0.70 * this.hold);
            const excess = Math.max(0.0, absDelta - effectiveSlope);
            filtered = this.prevSample + Math.sign(delta) * (effectiveSlope + 0.008 * Math.tanh(excess / 0.008));
        }
        this.prevSample = filtered;
        return filtered;
    }
    reset() {
        this.fastEnv = 0.0;
        this.slowEnv = 0.0;
        this.prevIn = 0.0;
        this.prevSample = 0.0;
        this.hold = 0.0;
    }
}
/**
 * Hysteresis Gate & Downward Comfort Expander (Q2)
 * Maintains natural vocal warmth during pauses with smooth exponential transitions
 * and hysteresis to prevent gating flutter/clipping.
 */
class HysteresisGateExpander {
    constructor(mode = 'balanced') {
        this.currentGain = 1.0;
        this.isSpeaking = false;
        this.hangoverRemaining = 0;
        this.config = { ...MODE_CONFIGS[mode] };
    }
    setMode(mode) {
        this.config = { ...MODE_CONFIGS[mode] };
    }
    /**
     * Updates speech state from VAD probability and applies hangover.
     */
    updateState(vadSmooth) {
        const activeThreshold = this.isSpeaking ? this.config.speechHysteresis : this.config.speechThreshold;
        this.isSpeaking = vadSmooth > activeThreshold;
        if (this.isSpeaking) {
            this.hangoverRemaining = this.config.hangoverSamples;
        }
        return this.isSpeaking || this.hangoverRemaining > 0;
    }
    /**
     * Processes a single wet sample with comfortable downward expansion.
     */
    process(sample) {
        const speechActive = this.isSpeaking || this.hangoverRemaining > 0;
        if (speechActive) {
            if (!this.isSpeaking && this.hangoverRemaining > 0) {
                this.hangoverRemaining--;
            }
            this.currentGain += this.config.attackAlpha * (1.0 - this.currentGain);
        }
        else {
            this.currentGain += this.config.releaseAlpha * (this.config.floorGain - this.currentGain);
        }
        return sample * this.currentGain;
    }
    reset() {
        this.currentGain = 1.0;
        this.isSpeaking = false;
        this.hangoverRemaining = 0;
    }
}
/**
 * Slow RMS Speech Leveler (Q3)
 * Operates post-RNNoise to normalize speech volume toward -20 dBFS (+/- 6 dB range).
 * Crucially, ONLY adapts gain while speech VAD is high, preventing background noise pumping during pauses.
 */
class SlowSpeechLeveler {
    constructor() {
        this.targetRms = 0.10; // Target ~ -20 dBFS
        this.currentGain = 1.0;
        this.minGain = 0.50; // -6 dB minimum
        this.maxGain = 2.00; // +6 dB maximum
        this.rmsTracker = 0.10;
        this.enabled = true;
        // Slow adaptation constants
        this.attackAlpha = 1.0 - Math.exp(-1.0 / (48000 * 0.300)); // 300 ms attack
        this.releaseAlpha = 1.0 - Math.exp(-1.0 / (48000 * 1.200)); // 1.2 s release
    }
    process(sample, vadSmooth) {
        if (!this.enabled)
            return sample;
        // Only update loudness tracker when speech is clearly present
        if (vadSmooth > 0.55) {
            const samplePower = sample * sample;
            this.rmsTracker += 0.0001 * (samplePower - this.rmsTracker);
            const measuredRms = Math.sqrt(Math.max(this.rmsTracker, 1e-6));
            const desiredGain = Math.min(this.maxGain, Math.max(this.minGain, this.targetRms / measuredRms));
            if (desiredGain > this.currentGain) {
                this.currentGain += this.attackAlpha * (desiredGain - this.currentGain);
            }
            else {
                this.currentGain += this.releaseAlpha * (desiredGain - this.currentGain);
            }
        }
        return sample * this.currentGain;
    }
    reset() {
        this.currentGain = 1.0;
        this.rmsTracker = 0.10;
    }
}
/**
 * True-Peak Soft Brickwall Limiter (-1.0 dBFS)
 * Employs an analog-style hyperbolic tangent (tanh) soft saturation curve above 0.89125 (-1.0 dBFS)
 * to strictly prevent digital overs and clipping distortion without harsh pumping.
 */
class SoftLimiter {
    constructor() {
        this.threshold = 0.8912509; // -1.0 dBFS
        this.headroom = 1.0 - 0.8912509;
    }
    process(sample) {
        const absVal = Math.abs(sample);
        if (absVal <= this.threshold) {
            return sample;
        }
        const excess = absVal - this.threshold;
        return Math.sign(sample) * (this.threshold + this.headroom * Math.tanh(excess / this.headroom));
    }
}
/**
 * Power-of-Two Circular Audio Ring Buffer
 * Thread-safe, garbage-collection-free buffer for 128-quantum to 480-frame conversion.
 */
class AudioRingBuffer {
    constructor(size = 8192) {
        this.writeIndex = 0;
        this.readIndex = 0;
        this.count = 0;
        this.capacity = size;
        this.mask = size - 1;
        this.buffer = new Float32Array(size);
    }
    write(sample) {
        this.buffer[this.writeIndex] = sample;
        this.writeIndex = (this.writeIndex + 1) & this.mask;
        this.count++;
    }
    read() {
        if (this.count === 0)
            return 0.0;
        const sample = this.buffer[this.readIndex];
        this.readIndex = (this.readIndex + 1) & this.mask;
        this.count--;
        return sample;
    }
    available() {
        return this.count;
    }
    reset() {
        this.writeIndex = 0;
        this.readIndex = 0;
        this.count = 0;
    }
}


/**
 * GCP Real-Time Neural Speech Enhancement Worklet Processor
 *
 * Runs inside the AudioWorklet audio rendering thread.
 * Coordinates Web Audio 128-sample render quanta with RNNoise 480-sample frame processing.
 */

class GcpNeuralNoiseProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.FRAME_SIZE = 480;
        this.MAX_RING = 8192;
        this.PRIME_THRESHOLD = 256;
        this.inWrite = 0;
        this.inRead = 0;
        this.inCount = 0;
        this.outWrite = 0;
        this.outRead = 0;
        this.outCount = 0;
        this.dryWrite = 0;
        this.dryRead = 0;
        // Crossfade state for zero-click mode transitions (N7)
        this.crossfadeGain = 1.0;
        this.targetCrossfadeGain = 1.0;
        this.crossfadeStep = 1.0 / 720; // 15 ms crossfade at 48 kHz
        // Performance and Telemetry metrics (O1)
        this.underruns = 0;
        this.framesProcessed = 0;
        this.totalProcessTimeMs = 0;
        this.maxProcessTimeMs = 0;
        this.lastTelemetryTime = 0;
        this.inputRmsAccum = 0;
        this.outputRmsAccum = 0;
        this.rmsSampleCount = 0;
        // WASM State
        this.isReady = false;
        this.isInitializing = false;
        this.isPrimed = false;
        this.mode = 'balanced';
        this.savedMode = 'balanced';
        this.rnnModule = null;
        this.denoiseState = null;
        this.inPtr = 0;
        this.outPtr = 0;
        this.inOffset = 0;
        this.outOffset = 0;
        this.vadSmooth = 0.0;
        this.sampleRate = typeof sampleRate !== 'undefined' ? sampleRate : 48000;
        this.inRing = new Float32Array(this.MAX_RING);
        this.outRing = new Float32Array(this.MAX_RING);
        this.dryRing = new Float32Array(this.MAX_RING);
        this.hpf = new ButterworthHighPassFilter(75, this.sampleRate);
        this.declicker = new TransientClickSuppressor(this.sampleRate, 12.0);
        this.gate = new HysteresisGateExpander(this.mode);
        this.leveler = new SlowSpeechLeveler();
        this.limiter = new SoftLimiter();
        this.port.onmessage = async (event) => {
            const data = event.data;
            if (!data)
                return;
            if (data.type === 'INIT_WASM') {
                if (this.isReady || this.isInitializing)
                    return;
                this.isInitializing = true;
                try {
                    if (data.mode) {
                        this._applyMode(data.mode);
                        if (data.mode === 'off') {
                            this.crossfadeGain = 0.0;
                        }
                    }
                    await this._initModule(data.wasmBinary, data.wasmModule);
                }
                catch (err) {
                    this.port.postMessage({ type: 'ERROR', error: String(err) });
                }
                finally {
                    this.isInitializing = false;
                }
            }
            else if (data.type === 'SET_MODE') {
                this._applyMode(data.mode);
                this.port.postMessage({ type: 'MODE_UPDATED', mode: this.mode });
            }
            else if (data.type === 'SET_ENABLED') {
                const enabled = Boolean(data.enabled);
                this._applyMode(enabled ? (this.savedMode || 'balanced') : 'off');
                this.port.postMessage({ type: 'MODE_UPDATED', mode: this.mode });
            }
            else if (data.type === 'DESTROY') {
                this._cleanup();
            }
        };
    }
    _applyMode(mode) {
        if (!mode)
            return;
        this.mode = mode;
        if (mode !== 'off') {
            this.savedMode = mode;
            this.targetCrossfadeGain = 1.0;
            this.gate.setMode(mode);
        }
        else {
            this.targetCrossfadeGain = 0.0;
        }
    }
    async _initModule(wasmBinary, wasmModule) {
        if (typeof createRNNWasmModule !== 'function') {
            throw new Error('createRNNWasmModule is not defined in worklet scope');
        }
        const config = {};
        if (wasmModule && typeof WebAssembly !== 'undefined') {
            config.instantiateWasm = (imports, successCallback) => {
                WebAssembly.instantiate(wasmModule, imports)
                    .then((instance) => {
                    successCallback(instance, wasmModule);
                })
                    .catch((err) => {
                    console.error('[GcpWorklet] instantiateWasm error:', err);
                });
                return {};
            };
        }
        else if (wasmBinary) {
            config.wasmBinary = wasmBinary;
        }
        const mod = await createRNNWasmModule(config);
        this.rnnModule = mod && mod.ready && typeof mod._malloc !== 'function' ? await mod.ready : mod;
        this.inPtr = this.rnnModule._malloc(this.FRAME_SIZE * 4);
        this.outPtr = this.rnnModule._malloc(this.FRAME_SIZE * 4);
        this.inOffset = this.inPtr / 4;
        this.outOffset = this.outPtr / 4;
        this.denoiseState = this.rnnModule._rnnoise_create();
        this.isReady = true;
        this.port.postMessage({
            type: 'READY',
            sampleRate: this.sampleRate,
            engine: 'rnnoise-wasm',
        });
    }
    _cleanup() {
        this.isReady = false;
        this.isPrimed = false;
        if (this.rnnModule) {
            if (this.denoiseState) {
                try {
                    this.rnnModule._rnnoise_destroy(this.denoiseState);
                }
                catch { }
                this.denoiseState = null;
            }
            if (this.inPtr) {
                try {
                    this.rnnModule._free(this.inPtr);
                }
                catch { }
                this.inPtr = 0;
            }
            if (this.outPtr) {
                try {
                    this.rnnModule._free(this.outPtr);
                }
                catch { }
                this.outPtr = 0;
            }
            this.rnnModule = null;
        }
        this.inCount = 0;
        this.outCount = 0;
        this.inWrite = 0;
        this.inRead = 0;
        this.outWrite = 0;
        this.outRead = 0;
        this.hpf.reset();
        this.declicker.reset();
        this.gate.reset();
        this.leveler.reset();
    }
    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || !input[0] || !output || !output[0])
            return true;
        const inputChannel0 = input[0];
        const numInputChannels = input.length;
        const len = inputChannel0.length;
        const numOutputChannels = output.length;
        const startPerf = typeof currentTime !== 'undefined' ? currentTime : 0;
        // Hard fallback passthrough if WASM is not ready
        if (!this.isReady) {
            for (let ch = 0; ch < numOutputChannels; ch++) {
                const inCh = input[ch] || inputChannel0;
                const outCh = output[ch];
                for (let i = 0; i < len; i++) {
                    outCh[i] = inCh[i];
                }
            }
            return true;
        }
        // Bit-exact passthrough when mode is off and crossfade has completed (Rule 5)
        if (this.mode === 'off' && this.crossfadeGain <= 0.0) {
            for (let ch = 0; ch < numOutputChannels; ch++) {
                const inCh = input[ch] || inputChannel0;
                const outCh = output[ch];
                for (let i = 0; i < len; i++) {
                    outCh[i] = inCh[i];
                }
            }
            return true;
        }
        // Step 1: Ingest input samples, Downmix to mono, Apply Stage 1 HPF (75Hz)
        for (let i = 0; i < len; i++) {
            let rawMono = 0.0;
            if (numInputChannels === 1) {
                rawMono = inputChannel0[i];
            }
            else {
                let sum = 0.0;
                for (let ch = 0; ch < numInputChannels; ch++) {
                    sum += input[ch][i];
                }
                rawMono = sum / numInputChannels;
            }
            this.inputRmsAccum += rawMono * rawMono;
            // Stage 1: 75 Hz Butterworth HPF
            const hpfOut = this.hpf.process(rawMono);
            // Store in input ring for RNNoise framing
            this.inRing[this.inWrite] = hpfOut;
            this.inWrite = (this.inWrite + 1) % this.MAX_RING;
            // Also store raw in delay-compensated dry ring for seamless click-free crossfade (N7)
            this.dryRing[this.dryWrite] = rawMono;
            this.dryWrite = (this.dryWrite + 1) % this.MAX_RING;
        }
        this.inCount += len;
        // Step 2: Process complete 480-sample frames through RNNoise Neural Engine
        while (this.inCount >= this.FRAME_SIZE) {
            const heap = this.rnnModule.HEAPF32;
            const inOff = this.inOffset;
            const outOff = this.outOffset;
            for (let i = 0; i < this.FRAME_SIZE; i++) {
                const s = this.inRing[this.inRead];
                heap[inOff + i] = s * 32767.0;
                this.inRead = (this.inRead + 1) % this.MAX_RING;
            }
            // Execute single-pass RNNoise GRU inference
            const vadProb = this.rnnModule._rnnoise_process_frame(this.denoiseState, this.outPtr, this.inPtr);
            this.vadSmooth = this.vadSmooth * 0.70 + vadProb * 0.30;
            this.gate.updateState(this.vadSmooth);
            for (let i = 0; i < this.FRAME_SIZE; i++) {
                // Pure neural speech output
                const wet = heap[outOff + i] / 32767.0;
                // Stage 2: Scale-tolerant declicker post-RNNoise on residual (Q1)
                const declicked = this.declicker.process(wet, this.vadSmooth);
                // Stage 3: Comfort downward expander during pauses with hysteresis (Q2)
                const expanded = this.gate.process(declicked);
                // Stage 4: Controlled speech loudness leveler (Q3)
                const leveled = this.leveler.process(expanded, this.vadSmooth);
                // Stage 5: -1.0 dBFS True-Peak Soft Brickwall Limiter
                const limited = this.limiter.process(leveled);
                this.outRing[this.outWrite] = limited;
                this.outWrite = (this.outWrite + 1) % this.MAX_RING;
            }
            this.outCount += this.FRAME_SIZE;
            this.inCount -= this.FRAME_SIZE;
            this.framesProcessed++;
        }
        // Step 3: Priming verification to prevent periodic underruns
        if (!this.isPrimed && this.outCount >= this.PRIME_THRESHOLD) {
            this.isPrimed = true;
            // Align dry ring pointer with output latency
            this.dryRead = (this.dryWrite - this.outCount + this.MAX_RING) % this.MAX_RING;
        }
        // Step 4: Crossfade output samples (N7 click-free mode transition)
        if (this.isPrimed && this.outCount >= len) {
            for (let i = 0; i < len; i++) {
                const wetVal = this.outRing[this.outRead];
                this.outRead = (this.outRead + 1) % this.MAX_RING;
                const dryVal = this.dryRing[this.dryRead];
                this.dryRead = (this.dryRead + 1) % this.MAX_RING;
                // Smooth linear crossfade toward target gain (1.0 = full wet, 0.0 = full dry)
                if (this.crossfadeGain < this.targetCrossfadeGain) {
                    this.crossfadeGain = Math.min(this.targetCrossfadeGain, this.crossfadeGain + this.crossfadeStep);
                }
                else if (this.crossfadeGain > this.targetCrossfadeGain) {
                    this.crossfadeGain = Math.max(this.targetCrossfadeGain, this.crossfadeGain - this.crossfadeStep);
                }
                const finalSample = (1.0 - this.crossfadeGain) * dryVal + this.crossfadeGain * wetVal;
                this.outputRmsAccum += finalSample * finalSample;
                for (let ch = 0; ch < numOutputChannels; ch++) {
                    output[ch][i] = finalSample;
                }
            }
            this.outCount -= len;
        }
        else {
            // Underrun or priming: gracefully output dry input to prevent audio dropouts/stutters
            if (this.isPrimed) {
                this.underruns++;
            }
            for (let i = 0; i < len; i++) {
                const dryVal = inputChannel0[i] || 0.0;
                this.outputRmsAccum += dryVal * dryVal;
                for (let ch = 0; ch < numOutputChannels; ch++) {
                    output[ch][i] = input[ch] ? input[ch][i] : dryVal;
                }
            }
        }
        this.rmsSampleCount += len;
        // Periodic telemetry publishing every ~250 ms (O1)
        if (this.rmsSampleCount >= 12000) {
            const inRms = Math.sqrt(this.inputRmsAccum / this.rmsSampleCount);
            const outRms = Math.sqrt(this.outputRmsAccum / this.rmsSampleCount);
            const inDb = inRms > 1e-5 ? 20 * Math.log10(inRms) : -100;
            const outDb = outRms > 1e-5 ? 20 * Math.log10(outRms) : -100;
            this.port.postMessage({
                type: 'TELEMETRY',
                inputRmsDb: inDb,
                outputRmsDb: outDb,
                vadProb: this.vadSmooth,
                gateGain: this.gate.currentGain,
                underruns: this.underruns,
                mode: this.mode,
                crossfadeGain: this.crossfadeGain,
            });
            this.inputRmsAccum = 0;
            this.outputRmsAccum = 0;
            this.rmsSampleCount = 0;
        }
        return true;
    }
}
try {
    registerProcessor('gcp-rnnoise-processor', GcpNeuralNoiseProcessor);
}
catch { }
