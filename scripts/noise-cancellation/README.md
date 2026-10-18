# GCP Production-Grade Neural Speech Enhancement (RNNoise WebAssembly)

This directory contains benchmark utilities, offline packages, and verification tools for GCP's client-side real-time noise cancellation system.

## Subsystem Architecture & Key Files

1. **AudioWorklet Processors**:
   - `public/worklets/gcp-rnnoise-processor.js`: Primary neural processor running in an AudioWorklet on a dedicated audio thread. Contains pre-allocated zero-allocation circular ring buffers bridging 128-sample Web Audio quantums with 480-sample (10ms @ 48kHz) neural inference frames.
   - `public/worklets/gcp-noise-processor.js`: Synchronized processor guaranteeing backward compatibility with legacy worklet names.
2. **WebAssembly Binary & Loader**:
   - `public/worklets/rnnoise.wasm`: Precompiled 112 KB Xiph/Mozilla RNNoise WASM binary for high-speed browser caching.
   - `src/lib/webrtc/rnnoise-wasm-binary.ts`: Universal binary loader with embedded Base64 fallback for offline/air-gapped and test environments.
3. **DSP Signal Chain**:
   - `src/lib/webrtc/gcp-noise-cancellation.ts`: Production audio pipeline.
     - Dual-stage 110 Hz 4th-order Butterworth high-pass filter (cuts breath puffs, plosives, and desk rumble).
     - RNNoise WebAssembly AudioWorklet (100% pure neural output, 0% raw bleed).
     - Transparent dynamics safety ceiling limiter (-3 dB threshold, 0 dB makeup gain to prevent noise pumping).
4. **Integration Contexts**:
   - `src/features/servers/server-voice-context.tsx`: Server Voice Lounges (WebRTC Direct P2P & LiveKit SFU).
   - `src/features/calls/call-context.tsx`: Private 1-on-1 and Group Calls (WebRTC Direct P2P).
   - `src/components/layout/settings-modal.tsx`: Real-time 3-mode selector (`Off`, `Balanced`, `Strong`).
5. **Objective Test Harness**:
   - `tests/unit/gcp-noise-cancellation.test.ts`: 7 objective DSP benchmark tests verifying vocal energy preservation, SI-SDR fidelity (17.47 dB), continuous fan noise attenuation (-28 dB), and real-time execution budget (< 1.5ms per 10ms frame).
   - `tests/unit/rnnoise-modes-ringbuffer.test.ts`: Proves continuous sample ring buffer continuity without clicks or pops, and distinct suppression behavior across modes.

## Bundled Offline Package
- `jitsi-rnnoise-wasm-0.2.1.tgz`: Offline npm tarball of the `@jitsi/rnnoise-wasm` package. If installing offline without npm registry access:
  ```bash
  npm install ./scripts/noise-cancellation/jitsi-rnnoise-wasm-0.2.1.tgz
  ```

## Benchmark & Simulation Scripts
- `evaluate_quality.js`: Simulates speech, stationary fan noise, and keyclicks through the compiled WASM engine, measuring SI-SDR and SNR.
- `compare_pipelines.mjs`: Benchmarks dry-bleed vs pure neural suppression during active vocalization.
- `test_noise_scenarios.mjs`: Tests delay-aligned suppression of mechanical keyboard clicks during continuous speech.
