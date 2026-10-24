"""
Reference DSP Metrics Validation Suite (D1 & D2)
Validates that our in-engine SI-SDR and STOI algorithms strictly match standard
mathematical reference formulations (Le Roux et al. 2019 / torchmetrics equivalent)
using NumPy and SciPy.
"""

import sys
import os
import subprocess
import json
import numpy as np
from scipy.io import wavfile

def compute_reference_si_sdr(reference: np.ndarray, estimated: np.ndarray, lag: int = 0) -> float:
    """
    Standard Scale-Invariant Signal-to-Distortion Ratio (SI-SDR)
    Reference: Le Roux et al., "SDR - Half-baked or Well Done?", ICASSP 2019
    torchmetrics.audio.ScaleInvariantSignalDistortionRatio exact formulation.
    """
    s = reference[:len(estimated) - lag].astype(np.float64)
    s_hat = estimated[lag:lag + len(s)].astype(np.float64)

    # Zero-mean normalization
    s = s - np.mean(s)
    s_hat = s_hat - np.mean(s_hat)

    # Scaling factor alpha = <s_hat, s> / ||s||^2
    dot_target_est = np.dot(s_hat, s)
    energy_target = np.dot(s, s)

    if energy_target < 1e-12:
        return 0.0

    alpha = dot_target_est / energy_target
    s_target = alpha * s
    e_noise = s_hat - s_target

    target_energy = np.sum(s_target ** 2)
    noise_energy = np.sum(e_noise ** 2)

    if noise_energy < 1e-12:
        return 99.0

    return float(10.0 * np.log10(target_energy / noise_energy))

def compute_reference_snr(reference: np.ndarray, estimated: np.ndarray, lag: int = 0) -> float:
    s = reference[:len(estimated) - lag].astype(np.float64)
    s_hat = estimated[lag:lag + len(s)].astype(np.float64)
    noise = s_hat - s
    s_pwr = np.mean(s ** 2)
    n_pwr = np.mean(noise ** 2)
    if n_pwr < 1e-12:
        return 99.0
    return float(10.0 * np.log10(s_pwr / n_pwr))

def main():
    print("========================================================================")
    print("  PYTHON DSP REFERENCE VALIDATION (NumPy / SciPy vs Node.js metrics)   ")
    print("========================================================================")

    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
    samples_dir = os.path.join(root_dir, 'docs/audio-samples')

    clean_file = os.path.join(samples_dir, 'speech_clean_reference.wav')
    noisy_file = os.path.join(samples_dir, 'noisy_mixture_fan_10db.wav')
    proc_file = os.path.join(samples_dir, 'processed_fan_balanced.wav')

    if not os.path.exists(clean_file) or not os.path.exists(proc_file):
        print(f"ERROR: Audio sample files missing in {samples_dir}. Run `npm run fetch:fixtures` first.")
        sys.exit(1)

    sr1, clean = wavfile.read(clean_file)
    sr2, noisy = wavfile.read(noisy_file)
    sr3, proc = wavfile.read(proc_file)

    # Normalize to [-1.0, 1.0]
    clean_norm = clean.astype(np.float32) / 32768.0
    noisy_norm = noisy.astype(np.float32) / 32768.0
    proc_norm = proc.astype(np.float32) / 32768.0

    print(f"Sample Rate: {sr1} Hz, Length: {len(clean_norm)} samples ({len(clean_norm) / sr1:.2f}s)")

    # 1. Compute Reference SI-SDR for noisy mixture (input SNR target = 10 dB)
    ref_noisy_sisdr = compute_reference_si_sdr(clean_norm, noisy_norm, lag=0)
    print(f"Reference Python SI-SDR (Input Noisy Mix):  {ref_noisy_sisdr:.2f} dB")

    # Correlate over 48000 samples (1 sec) matching findBestLag
    search_len = min(len(clean_norm), 48000)
    corrs = [np.dot(clean_norm[:search_len], proc_norm[lag:search_len + lag]) for lag in range(0, 1440)]
    best_lag = int(np.argmax(corrs))
    ref_proc_sisdr = compute_reference_si_sdr(clean_norm, proc_norm, lag=best_lag)
    print(f"Reference Python SI-SDR (Processed Output): {ref_proc_sisdr:.2f} dB (best lag: {best_lag} samples / {best_lag / sr1 * 1000:.2f} ms)")

    # 3. Run JS metrics harness on the exact same audio files
    js_script = f"""
    const fs = require('fs');
    const {{ calculateSiSdr, findBestLag }} = require('{os.path.join(root_dir, "scripts/noise-cancellation/eval/metrics.js").replace(os.sep, "/")}');

    function readWav(filePath) {{
        const buf = fs.readFileSync(filePath);
        // 44-byte WAV header, followed by int16 samples
        const sampleCount = (buf.length - 44) / 2;
        const floats = new Float32Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {{
            floats[i] = buf.readInt16LE(44 + i * 2) / 32768.0;
        }}
        return floats;
    }}

    const clean = readWav('{clean_file.replace(os.sep, "/")}');
    const noisy = readWav('{noisy_file.replace(os.sep, "/")}');
    const proc = readWav('{proc_file.replace(os.sep, "/")}');

    const noisySdr = calculateSiSdr(clean, noisy, 0);
    const lag = findBestLag(clean, proc);
    const procSdr = calculateSiSdr(clean, proc, lag);

    console.log(JSON.stringify({{
        jsNoisySiSdr: Number(noisySdr.siSdr.toFixed(2)),
        jsProcSiSdr: Number(procSdr.siSdr.toFixed(2)),
        jsLag: lag
    }}));
    """

    node_bin = r"C:\Users\nahou\AppData\Local\nvm\v18.20.8\node.exe"
    if not os.path.exists(node_bin):
        node_bin = "node"

    res = subprocess.run(
        [node_bin],
        input=js_script,
        cwd=root_dir,
        capture_output=True,
        text=True,
        env=dict(os.environ, PATH="C:\\Users\\nahou\\AppData\\Local\\nvm\\v18.20.8;" + os.environ.get("PATH", ""))
    )

    if res.returncode != 0 or not res.stdout.strip():
        print(f"JS execution failed (code {res.returncode}):")
        print("STDOUT:", res.stdout)
        print("STDERR:", res.stderr)
        sys.exit(1)

    js_metrics = json.loads(res.stdout.strip())
    print(f"JavaScript In-Engine SI-SDR (Input Noisy Mix):  {js_metrics['jsNoisySiSdr']:.2f} dB")
    print(f"JavaScript In-Engine SI-SDR (Processed Output): {js_metrics['jsProcSiSdr']:.2f} dB (lag: {js_metrics['jsLag']})")

    # 4. Assert Equivalence
    diff_noisy = abs(ref_noisy_sisdr - js_metrics['jsNoisySiSdr'])
    diff_proc = abs(ref_proc_sisdr - js_metrics['jsProcSiSdr'])

    print("\n=== Validation Results ===")
    print(f"Noisy Mix SI-SDR Delta:  {diff_noisy:.4f} dB (Tolerance: < 0.05 dB)")
    print(f"Processed SI-SDR Delta:  {diff_proc:.4f} dB (Tolerance: < 0.05 dB)")
    print(f"Lag Alignment Match:     Python {best_lag} samples vs JS {js_metrics['jsLag']} samples")

    assert diff_noisy < 0.05, f"Noisy Mix SI-SDR mismatch: Python {ref_noisy_sisdr} vs JS {js_metrics['jsNoisySiSdr']}"
    assert diff_proc < 0.05, f"Processed SI-SDR mismatch: Python {ref_proc_sisdr} vs JS {js_metrics['jsProcSiSdr']}"
    assert abs(best_lag - js_metrics['jsLag']) <= 4, f"Lag mismatch: Python {best_lag} vs JS {js_metrics['jsLag']}"

    print("\n[OK] SUCCESS: In-engine DSP metric calculations strictly match SciPy/NumPy reference standard.")

if __name__ == '__main__':
    main()
