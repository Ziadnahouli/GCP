# Nexus Microphone Noise Cancellation Baseline Evaluation

Generated from automated offline benchmark harness (`npm run eval:noise`) processing 48 kHz mono WAV fixtures in 128-sample Web Audio quanta through the real AudioWorklet processor.

## 1. Overall Performance Matrix

| Metric | Off (Passthrough) | Light | Balanced (Default) | Strong | Target / Ideal |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Algorithmic Latency** | 0 ms | 28.67 ms | 28.67 ms | 28.67 ms | < 20 ms |
| **STOI (Speech Intelligibility)** | 1.000 | 0.983 | 0.979 | 0.973 | >= 0.850 |
| **Whisper STOI** | 1.000 | 0.727 | 0.661 | 0.638 | >= 0.700 |
| **Clean Speech SI-SDR** | 99 dB | 0.05 dB | 0.06 dB | 0.09 dB | >= 15.0 dB |
| **Onset Preservation (First 50ms)** | 100% | 83.3% | 79.8% | 74.3% | >= 85.0% |
| **Gate False-Close Rate (>6dB)** | 0% | 17.3% | 17.3% | 18% | <= 5.0% |
| **Continuous Fan Attenuation** | 0 dB | -18.37 dB | -19.84 dB | -18.5 dB | <= -25.0 dB |
| **Air-Conditioner Hum Attenuation** | 0 dB | -11.55 dB | -11.58 dB | -11.97 dB | <= -25.0 dB |
| **Street Rumble Attenuation** | 0 dB | -30.82 dB | -31.4 dB | -31.58 dB | <= -20.0 dB |
| **Cafe Babble Attenuation** | 0 dB | -4.29 dB | -4.31 dB | -4.41 dB | <= -18.0 dB |
| **Keyboard Click Peak Reduction** | 0 dB | -26.12 dB | -26.13 dB | -24.7 dB | <= -10.0 dB |
| **Mouse Click Peak Reduction** | 0 dB | -14.21 dB | -15.12 dB | -15.18 dB | <= -10.0 dB |
| **Mix SI-SDR Improvement (0 dB SNR)** | 0 dB | -2.59 dB | -2.62 dB | -2.32 dB | >= +5.0 dB |
| **Mix SI-SDR Improvement (10 dB SNR)** | 0 dB | -11.17 dB | -11.21 dB | -11.08 dB | >= +4.0 dB |
| **CPU Time per 10ms (Mean / p99)** | 0.006 / 0.04 ms | 0.405 / 1.483 ms | 0.391 / 1.523 ms | 0.399 / 1.608 ms | < 1.50 ms |
| **Underruns / NaN / Inf / Clip** | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |

## 2. Evaluation Methodology & Fixtures
1. **Audio Rate**: 48,000 Hz, 32-bit floating point, processed via 128-sample Web Audio quanta matching browser worklet constraints.
2. **Clean Speech Fixtures**: Multi-voice synthetic phoneme streams containing male vocal fundamentals (130 Hz), female fundamentals (220 Hz), formant structures, plosive bursts (/t/, /k/), unvoiced fricatives (/s/), and quiet whispers.
3. **Noise Fixtures**: Continuous fan noise, 50/60Hz AC hum with powerline harmonics, high-frequency mechanical keyboard clicks, short microswitch mouse clicks, street rumble, cafe multi-talker babble, background music, and dog barking.
4. **Metrics**:
   - **SI-SDR**: Scale-Invariant Signal-to-Distortion Ratio computed over lag-aligned target and processed signals.
   - **STOI**: Short-Time Objective Intelligibility standard across 15 1/3-octave frequency bands.
   - **Onset Preservation**: Percentage of acoustic energy preserved in the first 50 ms window immediately following speech onsets.
   - **Gate False-Close Rate**: Percentage of active speech frames attenuated by more than 6 dB.
   - **CPU**: Measured high-resolution execution time per 10 ms (480-sample) audio frame.
