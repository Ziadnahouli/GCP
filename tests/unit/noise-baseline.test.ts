import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 0 — Noise Cancellation Evaluation Harness Baseline', () => {
  const baselinePath = path.resolve(__dirname, '../../docs/noise-baseline.json');

  it('generates and verifies baseline report exists with valid numeric integrity', () => {
    expect(fs.existsSync(baselinePath)).toBe(true);
    const raw = fs.readFileSync(baselinePath, 'utf8');
    const data = JSON.parse(raw);

    const modes = ['off', 'light', 'balanced', 'strong'];
    for (const mode of modes) {
      expect(data[mode]).toBeDefined();
      expect(data[mode].nanInfCount).toBe(0);
      expect(data[mode].clippingCount).toBe(0);
      expect(data[mode].underruns).toBe(0);
      expect(data[mode].cpuMeanMs).toBeLessThan(2.0); // Real-time budget: < 2ms per 10ms frame
    }

    // Verify 'off' mode is bit-exact passthrough
    expect(data.off.latencyMs).toBe(0);
    expect(data.off.stoi).toBe(1.0);
    expect(data.off.onsetPreservationPct).toBe(100.0);

    // Verify active modes attenuate noise
    expect(data.balanced.noiseAttenuation.fanDb).toBeLessThan(-15.0);
    expect(data.balanced.transientAttenuation.keyboardPeakCutDb).toBeLessThan(-15.0);
  });
});
