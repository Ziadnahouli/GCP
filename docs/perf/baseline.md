# Performance Baseline (Round 4 Initial State)

Date: 2026-10-25
Environment: Next.js 14.2.23, React 18.3.1, Node v24.0.1, Windows x64

## Next.js Build Route Table (First Load JS)

Measured with `npm run build` (`npx next build`):

```text
Route (app)                              Size     First Load JS
┌ ○ /                                    60.5 kB         577 kB
├ ○ /_not-found                          146 B          87.5 kB
├ ƒ /api/calls/token                     0 B                0 B
├ ƒ /api/desktop-telemetry               0 B                0 B
├ ƒ /api/link-preview                    0 B                0 B
├ ƒ /callback                            0 B                0 B
├ ○ /dev/gallery                         21.6 kB         159 kB
├ ○ /forgot-password                     5.17 kB         173 kB
├ ƒ /invite/[code]                       4.93 kB         167 kB
├ ○ /login                               4.15 kB         180 kB
├ ○ /register                            4.79 kB         180 kB
└ ○ /reset-password                      5.78 kB         174 kB
+ First Load JS shared by all            87.4 kB
  ├ chunks/117-b02644f69b618bfb.js       31.6 kB
  ├ chunks/fd9d1056-a6edd012854a64a8.js  53.6 kB
  └ other shared chunks (total)          2.16 kB

ƒ Middleware                             73 kB
```

## Summary of Initial Key Metrics
- `/` First Load JS: **577 kB**
- `/login` First Load JS: **180 kB**
- `/invite/[code]` First Load JS: **167 kB**
- Total shared chunks: **87.4 kB**
- Web Vitals / Profiler: Not measured yet (pre-optimization baseline)
- Target: Reduce First Load JS for `/` by at least 30% (< 404 kB), eliminate eager LiveKit SDK and RNNoise WASM from root chunk, isolate high-frequency re-renders.

---

## Measured Post-Optimization Route Table (P1 & P2 Quick Wins)

Measured with `npm run build` (`npx next build`) on 2026-10-25:

```text
Route (app)                              Size     First Load JS
┌ ○ /                                    67.3 kB         314 kB
├ ○ /_not-found                          152 B          87.8 kB
├ ƒ /api/calls/token                     0 B                0 B
├ ƒ /api/desktop-telemetry               0 B                0 B
├ ƒ /api/link-preview                    0 B                0 B
├ ƒ /callback                            0 B                0 B
├ ○ /dev/gallery                         22.9 kB         159 kB
├ ○ /forgot-password                     5.22 kB         174 kB
├ ƒ /invite/[code]                       4.95 kB         168 kB
├ ○ /login                               4.17 kB         180 kB
├ ○ /register                            4.81 kB         181 kB
└ ○ /reset-password                      5.83 kB         174 kB
+ First Load JS shared by all            87.6 kB
  ├ chunks/2117-06e1aa39d538663d.js      31.6 kB
  ├ chunks/fd9d1056-0b9fc4007bb1fafd.js  53.6 kB
  └ other shared chunks (total)          2.41 kB

ƒ Middleware                             73 kB
```

### Before vs After Comparison

| Route | Before | After | Delta | % Change | Target Met? |
|---|---|---|---|---|---|
| **`/` (Root Shell)** | **577 kB** | **314 kB** | **-263 kB** | **-45.58%** | **YES** (Goal was >= 30%) |
| `/login` | 180 kB | 180 kB | 0 kB | 0% | Parity preserved |
| `/invite/[code]` | 167 kB | 168 kB | +1 kB | +0.6% | Robustness & controls added |
| `/dev/gallery` | 159 kB | 159 kB | 0 kB | 0% | Parity preserved |
| Shared Chunks | 87.4 kB | 87.6 kB | +0.2 kB | +0.2% | Constant |

### Optimization Impact Analysis
1. **LiveKit SDK Tree-shaking & Lazy-Loading**: Converted static imports of `livekit-client` in `server-voice-context.tsx` to dynamic imports, removing the multi-hundred kB client library from initial paint.
2. **RNNoise WASM Static Asset Separation**: Severed the 152 KB base64 string from `gcp-noise-cancellation.ts`. The WASM binary is now fetched directly via HTTP cache (`/worklets/rnnoise.wasm`), with base64 only as a lazily loaded offline fallback.
3. **Soundboard Engine Splitting**: Converted `soundboardEngine` imports in `call-context.tsx`, `server-voice-context.tsx`, `user-bar.tsx`, and `call-modal.tsx` to dynamic imports. Audio synth engines and presets only load when an audio clip is triggered or the soundboard modal opens.
4. **Settings & Diagnostics Tab Splitting**: Extracted heavy tabs (`VoiceAudioTab`, `SecurityTab`, `NetworkDiagnostics`, `SoundboardModal`) via `next/dynamic` so they load on demand.
5. **AppShell Re-render Decoupling**: Decoupled 1-second WebRTC telemetry polling from `AppShell`. The root app shell no longer re-renders on call telemetry.
6. **Virtualization**: Server channels now share virtualized rendering matching DMs.

