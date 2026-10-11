# Nexus Windows Desktop Companion Architecture

This directory contains the native Windows desktop companion wrapper for Nexus, powered by [Tauri](https://tauri.app/).

## Prerequisites
1. **Node.js 18+** & **npm**
2. **Rust & Cargo** (installed via [rustup.rs](https://rustup.rs))
3. **Microsoft C++ Build Tools** (Visual Studio installer with C++ desktop workload)

## Development
To run Nexus as a native Windows desktop app connected to your local Next.js dev server:
```bash
npx @tauri-apps/cli dev
```

## Production Desktop Build
To compile the standalone Windows `.exe` and `.msi` installers:
```bash
npm run build
npx @tauri-apps/cli build
```
The compiled binary will be generated under `desktop/src-tauri/target/release/bundle/msi/`.

## Features
- **Ultra Lightweight**: ~15MB RAM footprint (vs 250MB+ in Electron).
- **Native Windows Notifications**: Displays squad call invites and mention alerts directly in the Windows action center.
- **System Tray Minimize**: Closes to tray to keep voice comms active in the background while in fullscreen games.
- **Global Keybinds**: Soundboard and push-to-talk hotkeys captured globally even when focused on games like CS2, Valorant, or Apex Legends.
