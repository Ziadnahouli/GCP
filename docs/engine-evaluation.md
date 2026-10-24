# Nexus Speech Enhancement Engine Evaluation & Decision Matrix (Q4)

This document formalizes the comparative benchmark evaluation across potential speech enhancement and noise cancellation engines for the GCP / Nexus platform.

Per Rule 1 and Rule 4 ("Benchmark-gated: do not swap blindly; only adopt an engine that wins the table and stays under a CPU budget of < 15% of one core on mid-range hardware"), candidate engines were evaluated across acoustic quality, latency, resource footprint, license compatibility, and offline viability.

> [!NOTE]
> **Honesty & Measurement Disclosure**:
> Only **(a) RNNoise WASM (Custom GCP Pipeline)** has been empirically measured using the automated in-repository test harness (`npm run eval:noise` and `npm run eval:batch`). All figures in column (a) derive directly from executed benchmark runs on 48 kHz audio quanta. Columns (b) through (e) were not benchmarked in this environment and are strictly marked as **"not evaluated"** or accompanied by literature estimates.

---

## 1. Engine Comparison Matrix

| Evaluation Dimension | (a) RNNoise WASM (Custom GCP Pipeline, Measured) | (b) RNNoise 0.2 (Updated Weights) | (c) DeepFilterNet3 WASM (ONNX Runtime) | (d) Browser Native `voiceIsolation` | (e) LiveKit Krisp (SFU Plugin) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Noise Attenuation (Fan/Hum)** | **-16.7 dB to -26.9 dB** (measured) | *not evaluated* | *not evaluated* | *not evaluated* | *not evaluated* |
| **Transient Rejection (Keyboard/Click)** | **-19.85 dB** (measured) | *not evaluated* | *not evaluated* | *not evaluated* | *not evaluated* |
| **Speech Intelligibility (STOI)** | **0.933 to 0.982** (measured, N=50) | *not evaluated* | *not evaluated* | *not evaluated* | *not evaluated* |
| **Onset Preservation (First 50ms)** | **78.7% to 88.1%** (measured, N=50) | *not evaluated* | *not evaluated* | *not evaluated* | *not evaluated* |
| **Algorithmic Latency** | **28.67 ms** (measured: 10ms frame + buffer) | *not evaluated* | *not evaluated* (~40 ms paper estimate) | *not evaluated* (hardware dependent) | *not evaluated* (~30 ms vendor estimate) |
| **CPU Time per 10ms frame** | **0.468 to 0.499 ms** (~5% of 1 core, measured) | *not evaluated* | *not evaluated* (~3-4 ms literature estimate) | *not evaluated* (offloaded to OS DSP/NPU) | Server-side / Cloud SFU |
| **Download / Bundle Size** | **112 KB** (WASM binary) | *not evaluated* | ~18.5 MB (model weights) | 0 KB (OS built-in) | 0 KB client (cloud SFU dependency) |
| **License** | **BSD-3-Clause / Apache-2.0** | BSD-3-Clause | MIT / Apache-2.0 (Dual) | Proprietary (OS Vendor) | Commercial (per-minute SaaS) |
| **P2P Mesh Support (1:1 & Squad Calls)** | **Full (Client AudioWorklet)** | Full (Client AudioWorklet) | Untested in AudioWorklet | Limited (macOS/iOS only) | **None** (Requires LiveKit Cloud SFU) |
| **Offline Execution** | **Fully Offline Capable** | Fully Offline Capable | Fully Offline Capable | Fully Offline Capable | **Inoperable without Cloud SFU** |

---

## 2. Key Findings & Architectural Tradeoffs

### 1. Why RNNoise WASM Remains the Primary Production Engine
- **Footprint**: At **112 KB**, RNNoise loads rapidly and avoids memory pressure or startup delays on constrained connections.
- **CPU Budget**: Consumes **~0.47 ms to 0.50 ms per 10 ms frame** (< 5% of one core), remaining well below the < 15% CPU budget threshold and leaving processing capacity free for gaming workloads.
- **Consonant & Onset Preservation**: Empirical measurement over 50 speaker utterances demonstrates **88.1% ± 2.8%** onset energy preservation with **0.933 ± 0.020 STOI** in balanced mode, suppressing steady fan noise by **-26.9 dB** and mechanical clicks by **-19.8 dB**.
- **P2P Calling**: Operates directly inside the browser's dedicated `AudioWorklet` rendering thread, functioning for direct 1:1 and squad WebRTC calls without server-side routing.

### 2. DeepFilterNet3 WASM
- **Assessment**: Literature documents strong suppression of background speech/babble, but model bundle size (~18.5 MB) and estimated execution cost (~3-4 ms per frame on mid-range x86 CPUs) exceed our tight interactive gaming budget.
- **Decision**: Deferred until hardware-accelerated WebGPU/NPU inference in browser runtimes drops execution cost reliably below 1.0 ms.

### 3. Native Browser `voiceIsolation`
- **Assessment**: Zero CPU overhead on supported Apple Silicon (macOS Sonoma+ / iOS 15+) and select NPU-equipped platforms. However, it is unavailable on Windows x86 Chrome and Linux environments, with no configurable thresholds or telemetry.
- **Decision**: Maintained as an optional hardware constraint when `voiceIsolation: true` is supported by the user agent, retaining RNNoise WASM as the universal cross-platform baseline.

### 4. LiveKit Krisp
- **Assessment**: Proprietary neural model requiring LiveKit Cloud SFU server infrastructure with commercial per-minute billing. Incompatible with direct P2P mesh calls (DM and group squad calls).
- **Decision**: All dead client-side Krisp references removed and `@livekit/krisp-noise-filter` dependency eliminated.
