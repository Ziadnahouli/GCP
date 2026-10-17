# Nexus Assetto Corsa In-Game Audio Mixer

A native in-game audio mixer app for **Assetto Corsa**, allowing sim-racers to balance and mute/unmute **Game Audio (SFX)** and **Voice Comms (Party)** directly while driving on track.

---

## Features

- **Game Sound Effects (SFX)**: Independently adjust volume (0%–100%) and toggle mute/unmute for engine, tires, and track noise.
- **Voice / Comms Audio**: Independently adjust volume and toggle mute/unmute for your squad voice party.
- **Dual Controls**: Quick stepped buttons (`[-]` / `[+]` in 5% increments) for easy in-cockpit adjustment plus numerical spinners.
- **High-Contrast Indicators**: Live color feedback showing `[LIVE]` (green) and `[MUTED]` (red).
- **Zero In-Game Stutter**: Background asynchronous worker thread ensures network/IPC calls never block the simulation or drop FPS.
- **Session Persistence**: Saves volume and mute settings to `config.ini` so your mix survives pitstops, track changes, and restarts.
- **Desktop WASAPI Bridge**: Communicates with the local desktop companion to isolate `acs.exe` Windows Audio Sessions.

---

## Installation

### Method 1: Content Manager (Recommended)
1. Download the release archive `AssettoCorsa-SoundMixer-v<version>.zip`.
2. Drag and drop the `.zip` file into the **Content Manager** window.
3. In Content Manager, click the menu in the top right corner and click **Install**.
4. Navigate to **Settings > Assetto Corsa > Apps** and ensure **GCP Sound Mixer** is checked.

### Method 2: Manual Installation
1. Locate your Assetto Corsa installation directory (e.g., `C:\Program Files (x86)\Steam\steamapps\common\assettocorsa`).
2. Extract the contents of `AssettoCorsa-SoundMixer-v<version>.zip` directly into the root `assettocorsa/` directory.
3. Verify that the files exist at:
   ```
   assettocorsa/apps/python/ac_sound_mixer/ac_sound_mixer.py
   assettocorsa/apps/python/ac_sound_mixer/config.ini
   assettocorsa/apps/python/ac_sound_mixer/icon.png
   ```

---

## Activating the In-Game App

1. Launch any Assetto Corsa session (Practice, Hotlap, or Multiplayer).
2. Move your mouse to the far right edge of the screen to open the **Apps Taskbar**.
3. Scroll down and click on **GCP Sound Mixer** (look for the cyan sliders icon).
4. Position the window anywhere on your HUD. Assetto Corsa will automatically remember its on-screen position.

---

## Desktop WASAPI Audio Bridge (Optional / Advanced)

To allow the in-game app to adjust the Windows CoreAudio session volume of `acs.exe` and your voice app independently:

1. Open PowerShell or a terminal on your PC:
   ```bash
   pip install pycaw
   python apps/python/ac_sound_mixer/companion_bridge.py
   ```
2. The bridge starts on `http://127.0.0.1:48123`.
3. When connected, the in-game app footer will display:
   ```
   Bridge: Connected to Desktop Bridge
   ```
*(If the bridge is not running, the in-game app operates gracefully in standalone mode and persists all levels locally.)*

---

## Configuration (`config.ini`)

You can customize default volumes and the bridge URL in `config.ini`:

```ini
[General]
bridge_url = http://127.0.0.1:48123
update_interval_sec = 0.5

[SFX]
volume = 80
muted = False

[Voice]
volume = 100
muted = False
```

---

## Compatibility

- **Assetto Corsa**: v1.16+ (32-bit and 64-bit `acs.exe`).
- **Content Manager**: Fully compatible with Custom Shaders Patch (CSP) and vanilla UI.
- **Python Runtime**: Strictly compatible with Assetto Corsa's embedded **Python 3.3.5** interpreter.
