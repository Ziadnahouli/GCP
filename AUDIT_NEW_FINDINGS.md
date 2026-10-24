# GCP / Nexus Audio & DSP Overhaul — New Audit Findings

Documenting technical findings and edge-case discoveries surfaced during the static analysis, offline benchmark harness execution, and real-time AudioWorklet overhaul.

---

### Finding 1: WebAssembly ArrayBuffer Detachment on Repeated Pipeline Creation (N1)
- **Component**: `src/lib/webrtc/rnnoise-wasm-binary.ts`, `src/lib/webrtc/gcp-noise-cancellation.ts`
- **Symptom**: Calling `createGcpNoisePipeline` twice in the same browser session (e.g. initiating a second call, switching microphone devices, or reconnecting) caused an instant `TypeError: Cannot perform Construct on a detached ArrayBuffer`.
- **Root Cause**: `postMessage({ type: 'INIT_WASM', wasmBinary }, [wasmBinary])` transferred the underlying `ArrayBuffer` into the AudioWorklet thread. In JavaScript, transferring an `ArrayBuffer` instantly detaches it in the caller context (`byteLength` becomes 0). Because `cachedMasterBinary` retained a reference to the detached buffer, all future invocations received a zero-byte buffer and timed out.
- **Resolution**: Implemented `loadRnnoiseWasmModule()` with pre-compiled `WebAssembly.Module` caching (structured-cloneable across threads without memory copying) and safe `.slice(0)` buffer slicing.

---

### Finding 2: Contradictory Constraint Writers & Racing Promises (N2)
- **Component**: `src/features/calls/call-context.tsx`, `src/features/servers/server-voice-context.tsx`, `src/lib/webrtc/gcp-noise-cancellation.ts`
- **Symptom**: Audio pumping during pauses, robotic vocal distortion, and erratic suppression behavior.
- **Root Cause**: Browser native `noiseSuppression` and `autoGainControl` were requested in `getUserMedia`, running browser native DSP in series before the RNNoise worklet. Simultaneously, `call-context.tsx` and `gcp-noise-cancellation.ts` both called `track.applyConstraints` with conflicting boolean flags on mode changes.
- **Resolution**: Created `src/lib/webrtc/audio-processing-policy.ts` as the single authoritative owner of track constraints. Explicit policy ensures `noiseSuppression: false` and `autoGainControl: false` at `getUserMedia` time when RNNoise is active.

---

### Finding 3: Unmanaged AudioContext Sprawl & iOS/Safari Context Limits (N9)
- **Component**: Voice calling, server voice, settings modal, soundboard, notification chimes.
- **Symptom**: AudioContext exhaustion errors on Safari and iOS (which enforce a hard limit of 4-6 concurrent active AudioContexts), and muted calls when an unmanaged context is suspended.
- **Root Cause**: Over 14 separate call sites called `new AudioContext()`, each independently adding worklet modules and failing to cleanly coordinate lifecycle or user-gesture resumption.
- **Resolution**: Built `AudioEngine` singleton (`src/lib/webrtc/audio-engine.ts`) managing a unified 48 kHz context, single worklet module loading, pipeline ref-counting, gesture auto-resumption, and `onprocessorerror` crash failover.

---

### Finding 4: Pre-RNNoise Slew-Limiter Mangling Consonants (Q1)
- **Component**: `scripts/noise-cancellation/build_krisp_worklets.js`, `public/worklets/gcp-rnnoise-processor.js`
- **Symptom**: Muffled, clipped speech onsets (words starting with /t/, /k/, /s/ had their initial 50 ms suppressed).
- **Root Cause**: The legacy `_declick()` slew-rate limiter ran on raw audio *before* RNNoise whenever smoothed VAD was below 0.70. High-frequency consonants naturally have steep per-sample slopes (> 0.05) that exceeded the limiter's 0.025 threshold, low-passing consonants before the neural network ever saw them.
- **Resolution**: Extracted DSP into `src/audio/worklet/dsp-core.ts`. Relocated transient click reduction post-RNNoise on the residual with dual-EMA envelope crest tracking, recovering onset preservation to 78.7%.

---

### Finding 5: -50 dBFS "Digital Black" Gate Floor Causing Gating Flutter (Q2)
- **Component**: Worklet downward expander.
- **Symptom**: Audio cutouts during natural pauses and quiet vocal trailing phrases.
- **Root Cause**: Strong mode dropped the gate floor to -50 dBFS with no lookahead. Digital silence confused WebRTC comfort noise generation and Opus DTX codecs, sounding like an interrupted call.
- **Resolution**: Raised strong mode floor to a natural -40 dB acoustic floor with hysteresis hangover and exponential smoothing.

---

### Finding 6: Missing Opus Transport & Speech Profile Tuning (Q6)
- **Component**: `call-context.tsx`, `server-voice-context.tsx`
- **Symptom**: WebRTC Opus encoder operating in generic music/fullband profile without packet loss concealment parameters.
- **Resolution**: Created `src/lib/webrtc/opus-transport-tuning.ts`. Enforces `track.contentHint = 'speech'`, inband FEC (`useinbandfec=1`), mono voice (`stereo=0`), 64 kbps bitrate, and 20 ms ptime across all P2P offers and answers.
