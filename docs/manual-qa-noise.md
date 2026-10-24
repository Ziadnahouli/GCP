# Nexus Microphone Noise Cancellation Manual QA Testing Guide (D6)

This guide outlines manual testing procedures for validating speech enhancement, noise suppression, and transient click rejection across browsers and hardware configurations.

---

## 1. Test Setup & Equipment

### Hardware Configurations to Test
1. **Desktop with Mechanical Keyboard**: Standard condenser or dynamic USB microphone positioned 15–30 cm from mouth, near a mechanical keyboard (Cherry MX Blue/Brown/Red).
2. **Laptop with Built-in Microphone & Trackpad**: Laptop internal mic running near keyboard and fan exhaust.
3. **Headset with Boom Mic**: USB or 3.5mm gaming headset with mic boom near mouth.

### Target Browsers
- Google Chrome (latest desktop on Windows / macOS / Linux)
- Microsoft Edge (latest desktop on Windows)
- Mozilla Firefox (latest desktop)
- Apple Safari (macOS Sonoma / iOS 17+)

---

## 2. Test Procedures & Scenarios

### Scenario 1: Clean Speech Baseline (Quiet Room)
- **Goal**: Verify transparency and naturalness of human speech without artificial coloration.
- **Steps**:
  1. Open **User Settings** (`Ctrl + ,` or Gear icon) -> **Voice & Audio**.
  2. Select **Noise Suppression Mode: Balanced**.
  3. Speak naturally: *"The quick brown fox jumps over the lazy dog."*
  4. Test plosives (*"Peter Piper picked a peck of pickled peppers"*) and sibilants (*"She sells seashells by the seashore"*).
- **Pass Criteria**:
  - Voice sounds clear, uncompressed, and natural.
  - No "underwater", "robotic", or metallic phase artifacts.
  - Consonant onsets (/p/, /t/, /k/, /s/) are preserved cleanly without clipped syllables.

### Scenario 2: Continuous Background Fan / AC Hum
- **Goal**: Measure suppression of steady acoustic noise.
- **Steps**:
  1. Position an active desk fan or hair dryer 1 meter from the microphone.
  2. In **Voice Settings**, observe the input meter.
  3. Toggle between **Off** and **Balanced**.
  4. Speak while the fan is active.
- **Pass Criteria**:
  - When silent, the input level meter drops into the noise gate floor (< -60 dBFS).
  - During speech, the continuous hiss/hum is suppressed by > 20 dB while the speaker's voice remains intelligible.
  - No "gating flutter" or breathing noise between words.

### Scenario 3: Transient Mechanical Keyboard & Mouse Clicks
- **Goal**: Verify suppression of impulsive keystrokes and clicks during silence and speech.
- **Steps**:
  1. Rapidly type on a mechanical keyboard (50+ WPM) without speaking.
  2. Click the mouse rapidly (10+ clicks per second).
  3. Speak a sentence while continuously typing on the keyboard.
- **Pass Criteria**:
  - Keystrokes during silence are attenuated by >= 15–20 dB and do not trigger voice activity.
  - Keystrokes while speaking are significantly attenuated without swallowing consonant speech bursts.

### Scenario 4: Quiet Whisper Test
- **Goal**: Verify the downward expander does not aggressively cut off quiet or whispered voice.
- **Steps**:
  1. Set mode to **Balanced**.
  2. Whisper at low volume (approx. -30 dBFS): *"Can you hear me whispering?"*
- **Pass Criteria**:
  - Whisper remains audible without being prematurely choked or cut off mid-word.
  - The voice activity detector registers whispered phonemes.

### Scenario 5: Hot-Swapping Modes Mid-Call
- **Goal**: Verify seamless transitions between modes without audio glitching, dropouts, or renegotiation.
- **Steps**:
  1. Join an active direct call or server voice channel.
  2. Toggle noise suppression from **Balanced** to **Off**, then to **Strong**, then back to **Balanced**.
- **Pass Criteria**:
  - Transitions occur smoothly with zero audio popping, stuttering, or disconnects.
  - WebRTC connection state remains `connected` without ICE renegotiation.

### Scenario 6: Microphone Device Switching
- **Goal**: Verify microphone selection hot-swapping.
- **Steps**:
  1. While in a call, change the input device dropdown from default mic to a secondary mic or virtual audio cable.
- **Pass Criteria**:
  - Audio switches to the new device within 500 ms without dropping the call.
  - The new audio stream automatically re-attaches to the RNNoise processing pipeline.

---

## 3. Reference Audio Fixtures

For auditory comparison, calibrated 16-bit 48 kHz WAV samples are available in `docs/audio-samples/`:

| File | Description |
| :--- | :--- |
| [`speech_clean_reference.wav`](file:///docs/audio-samples/speech_clean_reference.wav) | Clean reference speaker voice |
| [`noisy_mixture_fan_10db.wav`](file:///docs/audio-samples/noisy_mixture_fan_10db.wav) | Speech mixed with 10 dB SNR continuous fan noise |
| [`processed_fan_balanced.wav`](file:///docs/audio-samples/processed_fan_balanced.wav) | Pipeline output in Balanced mode (fan suppressed) |
| [`noisy_mixture_keyboard_10db.wav`](file:///docs/audio-samples/noisy_mixture_keyboard_10db.wav) | Speech mixed with mechanical keyboard clicks |
| [`processed_keyboard_balanced.wav`](file:///docs/audio-samples/processed_keyboard_balanced.wav) | Pipeline output in Balanced mode (keystrokes suppressed) |

---

## 4. Troubleshooting & Known Edge Cases

- **AudioContext Suspended**: On initial page load without user interaction, browser autoplay policies suspend the AudioContext. The `AudioEngine` singleton automatically resumes upon the first user click or keypress.
- **Sample Rate Mismatch**: If the OS audio subsystem runs at 44.1 kHz, the pipeline gracefully falls back to browser-native constraints while logging a diagnostic warning in the Diagnostics tab (`Ctrl + Shift + D`).
