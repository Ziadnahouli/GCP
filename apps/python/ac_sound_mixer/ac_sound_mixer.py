"""
Assetto Corsa In-Game Python Audio Mixer App
============================================
Controls:
1. Game Sound Effects / SFX volume & mute toggle.
2. User Voice / Comms volume & mute toggle.

Compatibility:
- Assetto Corsa embedded Python 3.3.5 runtime.
- Strictly compatible with Python 3.3 (NO f-strings, NO type annotations, NO async/await).
- Non-blocking daemon worker thread to prevent simulation/render stuttering.
- Float color tuples (0.0 to 1.0) for rock-solid UI rendering.
"""

import os
import sys
import json
import threading

try:
    import queue
except ImportError:
    import Queue as queue

try:
    import urllib.request as urllib_request
    import urllib.error as urllib_error
except ImportError:
    import urllib2 as urllib_request
    import urllib2 as urllib_error

try:
    import configparser
except ImportError:
    import ConfigParser as configparser

# ---------------------------------------------------------------------------
# Safe Import of Assetto Corsa Native Module
# ---------------------------------------------------------------------------
try:
    import ac
    import acsys
    IS_SIMULATOR = True
except ImportError:
    IS_SIMULATOR = False

    class _MockAC(object):
        def console(self, msg):
            print("[AC Console] " + str(msg))

        def log(self, msg):
            print("[AC Log] " + str(msg))

        def newApp(self, name):
            return 1

        def setSize(self, app, w, h):
            pass

        def setTitle(self, app, title):
            pass

        def drawBackground(self, app, val):
            pass

        def setVisible(self, app, val):
            pass

        def addButton(self, app, text):
            return 100

        def addLabel(self, app, text):
            return 200

        def addSpinner(self, app, text):
            return 300

        def setPosition(self, widget, x, y):
            pass

        def setText(self, widget, text):
            pass

        def setFontColor(self, widget, r, g, b, a):
            pass

        def setBackgroundColor(self, widget, r, g, b, a):
            pass

        def setSpinnerRange(self, widget, min_val, max_val):
            pass

        def setSpinnerStep(self, widget, step):
            pass

        def setSpinnerValue(self, widget, value):
            pass

        def addOnClickedListener(self, widget, callback):
            pass

        def addOnSpinnerValueChangeListener(self, widget, callback):
            pass

    ac = _MockAC()
    acsys = None

# ---------------------------------------------------------------------------
# UI Color Palette (Normalized Floats: 0.0 to 1.0)
# ---------------------------------------------------------------------------
COLOR_LIVE = (0.15, 0.85, 0.35, 1.0)       # Vibrant green
COLOR_MUTED = (0.92, 0.22, 0.25, 1.0)      # Danger red
COLOR_WHITE = (0.95, 0.95, 0.95, 1.0)      # High contrast white
COLOR_GRAY = (0.60, 0.62, 0.66, 1.0)       # Muted subtitle gray
COLOR_CYAN = (0.22, 0.72, 0.95, 1.0)       # Accent cyan
COLOR_BTN_BG = (0.18, 0.20, 0.25, 1.0)     # Dark button background
COLOR_PANEL_BG = (0.12, 0.13, 0.16, 0.95)  # Dark glass panel background

# ---------------------------------------------------------------------------
# App State & Configuration Management
# ---------------------------------------------------------------------------
APP_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(APP_DIR, "config.ini")

DEFAULT_CONFIG = {
    "General": {
        "bridge_url": "http://127.0.0.1:48123",
        "update_interval_sec": "0.5"
    },
    "SFX": {
        "volume": "80",
        "muted": "False"
    },
    "Voice": {
        "volume": "100",
        "muted": "False"
    }
}


class AudioState(object):
    def __init__(self):
        self.lock = threading.Lock()
        self.sfx_volume = 80
        self.sfx_muted = False
        self.voice_volume = 100
        self.voice_muted = False
        self.bridge_url = "http://127.0.0.1:48123"
        self.bridge_online = False
        self.ui_dirty = True
        self.last_status_message = "Ready (Standalone)"

    def load_from_config(self):
        config = configparser.ConfigParser()
        if os.path.exists(CONFIG_PATH):
            try:
                config.read(CONFIG_PATH)
            except Exception as e:
                ac.log("NexusAudioMixer: Error reading config.ini: " + str(e))

        with self.lock:
            try:
                if config.has_section("General"):
                    self.bridge_url = config.get("General", "bridge_url", fallback=DEFAULT_CONFIG["General"]["bridge_url"])
                if config.has_section("SFX"):
                    self.sfx_volume = max(0, min(100, config.getint("SFX", "volume", fallback=80)))
                    self.sfx_muted = config.getboolean("SFX", "muted", fallback=False)
                if config.has_section("Voice"):
                    self.voice_volume = max(0, min(100, config.getint("Voice", "volume", fallback=100)))
                    self.voice_muted = config.getboolean("Voice", "muted", fallback=False)
            except Exception as e:
                ac.log("NexusAudioMixer: Parsing config error: " + str(e))
            self.ui_dirty = True

    def save_to_config(self):
        config = configparser.ConfigParser()
        with self.lock:
            config["General"] = {
                "bridge_url": str(self.bridge_url),
                "update_interval_sec": "0.5"
            }
            config["SFX"] = {
                "volume": str(int(self.sfx_volume)),
                "muted": str(bool(self.sfx_muted))
            }
            config["Voice"] = {
                "volume": str(int(self.voice_volume)),
                "muted": str(bool(self.voice_muted))
            }

        try:
            with open(CONFIG_PATH, "w") as fp:
                config.write(fp)
        except Exception as e:
            ac.log("NexusAudioMixer: Failed to write config.ini: " + str(e))


STATE = AudioState()
ACTION_QUEUE = queue.Queue(maxsize=64)
WORKER_THREAD = None
IS_RUNNING = True


# ---------------------------------------------------------------------------
# Background Daemon Worker (Zero Sim-Thread Micro-Stutter)
# ---------------------------------------------------------------------------
def _http_request(url, payload=None, timeout=0.8):
    try:
        data_bytes = None
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if payload is not None:
            data_bytes = json.dumps(payload).encode("utf-8")

        req = urllib_request.Request(url, data=data_bytes, headers=headers)
        with urllib_request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return True, json.loads(raw) if raw else {}
    except Exception as e:
        return False, str(e)


def _worker_loop():
    poll_counter = 0
    while IS_RUNNING:
        try:
            # 1. Process any pending UI actions from queue
            try:
                action = ACTION_QUEUE.get(timeout=0.2)
                act_type = action.get("type")
                target = action.get("target")

                bridge_url = STATE.bridge_url
                STATE.save_to_config()

                if act_type == "set_volume":
                    vol = action.get("value")
                    endpoint = bridge_url + "/api/audio/volume"
                    success, res = _http_request(endpoint, {"target": target, "volume": vol})
                    with STATE.lock:
                        STATE.bridge_online = success
                        if success:
                            STATE.last_status_message = "Synced with Desktop Bridge"
                        else:
                            STATE.last_status_message = "Local (Bridge Offline)"
                        STATE.ui_dirty = True

                elif act_type == "toggle_mute":
                    muted = action.get("muted")
                    endpoint = bridge_url + "/api/audio/mute"
                    success, res = _http_request(endpoint, {"target": target, "muted": muted})
                    with STATE.lock:
                        STATE.bridge_online = success
                        if success:
                            STATE.last_status_message = "Synced with Desktop Bridge"
                        else:
                            STATE.last_status_message = "Local (Bridge Offline)"
                        STATE.ui_dirty = True

                ACTION_QUEUE.task_done()
            except queue.Empty:
                pass

            # 2. Periodic background status poll every ~2 seconds (10 x 0.2s)
            poll_counter += 1
            if poll_counter >= 10:
                poll_counter = 0
                endpoint = STATE.bridge_url + "/api/audio/status"
                success, res = _http_request(endpoint, timeout=0.5)
                with STATE.lock:
                    prev_online = STATE.bridge_online
                    STATE.bridge_online = success
                    if success and isinstance(res, dict):
                        # Merge remote companion volumes if companion changed them
                        if "sfx_volume" in res:
                            STATE.sfx_volume = max(0, min(100, int(res["sfx_volume"])))
                        if "sfx_muted" in res:
                            STATE.sfx_muted = bool(res["sfx_muted"])
                        if "voice_volume" in res:
                            STATE.voice_volume = max(0, min(100, int(res["voice_volume"])))
                        if "voice_muted" in res:
                            STATE.voice_muted = bool(res["voice_muted"])
                        STATE.last_status_message = "Connected to Desktop Bridge"
                        STATE.ui_dirty = True
                    elif prev_online != success:
                        STATE.last_status_message = "Local (Bridge Offline)"
                        STATE.ui_dirty = True

        except Exception as ex:
            ac.log("NexusAudioMixer: Worker exception: " + str(ex))


# ---------------------------------------------------------------------------
# UI Widgets & Event Handlers
# ---------------------------------------------------------------------------
class MixerUI(object):
    def __init__(self):
        self.app_id = 0
        self.lbl_sfx_status = None
        self.btn_sfx_mute = None
        self.btn_sfx_down = None
        self.btn_sfx_up = None
        self.lbl_sfx_vol = None
        self.spn_sfx = None

        self.lbl_voice_status = None
        self.btn_voice_mute = None
        self.btn_voice_down = None
        self.btn_voice_up = None
        self.lbl_voice_vol = None
        self.spn_voice = None

        self.lbl_bridge_status = None
        self.last_update_time = 0.0

    def init_ui(self):
        self.app_id = ac.newApp("GCP Sound Mixer")
        ac.setTitle(self.app_id, "Nexus Audio Mixer")
        ac.setSize(self.app_id, 270, 240)
        ac.drawBackground(self.app_id, 1)
        ac.setVisible(self.app_id, 1)

        # ----------------- GAME SFX SECTION -----------------
        lbl_sfx_header = ac.addLabel(self.app_id, "GAME AUDIO (SFX)")
        ac.setPosition(lbl_sfx_header, 14, 32)
        ac.setFontColor(lbl_sfx_header, COLOR_CYAN[0], COLOR_CYAN[1], COLOR_CYAN[2], COLOR_CYAN[3])

        self.lbl_sfx_status = ac.addLabel(self.app_id, "[SFX LIVE]")
        ac.setPosition(self.lbl_sfx_status, 175, 32)
        ac.setFontColor(self.lbl_sfx_status, COLOR_LIVE[0], COLOR_LIVE[1], COLOR_LIVE[2], COLOR_LIVE[3])

        self.btn_sfx_mute = ac.addButton(self.app_id, "Mute SFX")
        ac.setPosition(self.btn_sfx_mute, 14, 56)
        ac.setSize(self.btn_sfx_mute, 90, 26)
        ac.setBackgroundColor(self.btn_sfx_mute, COLOR_BTN_BG[0], COLOR_BTN_BG[1], COLOR_BTN_BG[2], COLOR_BTN_BG[3])
        ac.addOnClickedListener(self.btn_sfx_mute, on_click_sfx_mute)

        self.btn_sfx_down = ac.addButton(self.app_id, "-")
        ac.setPosition(self.btn_sfx_down, 112, 56)
        ac.setSize(self.btn_sfx_down, 26, 26)
        ac.setBackgroundColor(self.btn_sfx_down, COLOR_BTN_BG[0], COLOR_BTN_BG[1], COLOR_BTN_BG[2], COLOR_BTN_BG[3])
        ac.addOnClickedListener(self.btn_sfx_down, on_click_sfx_down)

        self.lbl_sfx_vol = ac.addLabel(self.app_id, "80%")
        ac.setPosition(self.lbl_sfx_vol, 146, 60)
        ac.setFontColor(self.lbl_sfx_vol, COLOR_WHITE[0], COLOR_WHITE[1], COLOR_WHITE[2], COLOR_WHITE[3])

        self.btn_sfx_up = ac.addButton(self.app_id, "+")
        ac.setPosition(self.btn_sfx_up, 184, 56)
        ac.setSize(self.btn_sfx_up, 26, 26)
        ac.setBackgroundColor(self.btn_sfx_up, COLOR_BTN_BG[0], COLOR_BTN_BG[1], COLOR_BTN_BG[2], COLOR_BTN_BG[3])
        ac.addOnClickedListener(self.btn_sfx_up, on_click_sfx_up)

        self.spn_sfx = ac.addSpinner(self.app_id, "")
        ac.setPosition(self.spn_sfx, 218, 56)
        ac.setSize(self.spn_sfx, 40, 26)
        ac.setSpinnerRange(self.spn_sfx, 0, 100)
        ac.setSpinnerStep(self.spn_sfx, 5)
        ac.setSpinnerValue(self.spn_sfx, STATE.sfx_volume)
        ac.addOnSpinnerValueChangeListener(self.spn_sfx, on_spinner_sfx)

        # ----------------- VOICE COMMS SECTION -----------------
        lbl_voice_header = ac.addLabel(self.app_id, "VOICE COMMS (PARTY)")
        ac.setPosition(lbl_voice_header, 14, 100)
        ac.setFontColor(lbl_voice_header, COLOR_CYAN[0], COLOR_CYAN[1], COLOR_CYAN[2], COLOR_CYAN[3])

        self.lbl_voice_status = ac.addLabel(self.app_id, "[VOICE LIVE]")
        ac.setPosition(self.lbl_voice_status, 175, 100)
        ac.setFontColor(self.lbl_voice_status, COLOR_LIVE[0], COLOR_LIVE[1], COLOR_LIVE[2], COLOR_LIVE[3])

        self.btn_voice_mute = ac.addButton(self.app_id, "Mute Voice")
        ac.setPosition(self.btn_voice_mute, 14, 124)
        ac.setSize(self.btn_voice_mute, 90, 26)
        ac.setBackgroundColor(self.btn_voice_mute, COLOR_BTN_BG[0], COLOR_BTN_BG[1], COLOR_BTN_BG[2], COLOR_BTN_BG[3])
        ac.addOnClickedListener(self.btn_voice_mute, on_click_voice_mute)

        self.btn_voice_down = ac.addButton(self.app_id, "-")
        ac.setPosition(self.btn_voice_down, 112, 124)
        ac.setSize(self.btn_voice_down, 26, 26)
        ac.setBackgroundColor(self.btn_voice_down, COLOR_BTN_BG[0], COLOR_BTN_BG[1], COLOR_BTN_BG[2], COLOR_BTN_BG[3])
        ac.addOnClickedListener(self.btn_voice_down, on_click_voice_down)

        self.lbl_voice_vol = ac.addLabel(self.app_id, "100%")
        ac.setPosition(self.lbl_voice_vol, 142, 128)
        ac.setFontColor(self.lbl_voice_vol, COLOR_WHITE[0], COLOR_WHITE[1], COLOR_WHITE[2], COLOR_WHITE[3])

        self.btn_voice_up = ac.addButton(self.app_id, "+")
        ac.setPosition(self.btn_voice_up, 184, 124)
        ac.setSize(self.btn_voice_up, 26, 26)
        ac.setBackgroundColor(self.btn_voice_up, COLOR_BTN_BG[0], COLOR_BTN_BG[1], COLOR_BTN_BG[2], COLOR_BTN_BG[3])
        ac.addOnClickedListener(self.btn_voice_up, on_click_voice_up)

        self.spn_voice = ac.addSpinner(self.app_id, "")
        ac.setPosition(self.spn_voice, 218, 124)
        ac.setSize(self.spn_voice, 40, 26)
        ac.setSpinnerRange(self.spn_voice, 0, 100)
        ac.setSpinnerStep(self.spn_voice, 5)
        ac.setSpinnerValue(self.spn_voice, STATE.voice_volume)
        ac.addOnSpinnerValueChangeListener(self.spn_voice, on_spinner_voice)

        # ----------------- FOOTER / STATUS SECTION -----------------
        lbl_div = ac.addLabel(self.app_id, "---------------------------------------------")
        ac.setPosition(lbl_div, 14, 168)
        ac.setFontColor(lbl_div, COLOR_GRAY[0], COLOR_GRAY[1], COLOR_GRAY[2], COLOR_GRAY[3])

        self.lbl_bridge_status = ac.addLabel(self.app_id, "Bridge: Initializing...")
        ac.setPosition(self.lbl_bridge_status, 14, 186)
        ac.setFontColor(self.lbl_bridge_status, COLOR_GRAY[0], COLOR_GRAY[1], COLOR_GRAY[2], COLOR_GRAY[3])

        lbl_hint = ac.addLabel(self.app_id, "GCP Platform | 127.0.0.1:48123")
        ac.setPosition(lbl_hint, 14, 206)
        ac.setFontColor(lbl_hint, COLOR_GRAY[0], COLOR_GRAY[1], COLOR_GRAY[2], 0.7)

    def update_widgets(self):
        with STATE.lock:
            sfx_vol = STATE.sfx_volume
            sfx_muted = STATE.sfx_muted
            voice_vol = STATE.voice_volume
            voice_muted = STATE.voice_muted
            bridge_online = STATE.bridge_online
            status_msg = STATE.last_status_message
            STATE.ui_dirty = False

        # SFX visual update
        if sfx_muted:
            ac.setText(self.lbl_sfx_status, "[SFX MUTED]")
            ac.setFontColor(self.lbl_sfx_status, COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2], COLOR_MUTED[3])
            ac.setText(self.btn_sfx_mute, "Unmute SFX")
        else:
            ac.setText(self.lbl_sfx_status, "[SFX LIVE]")
            ac.setFontColor(self.lbl_sfx_status, COLOR_LIVE[0], COLOR_LIVE[1], COLOR_LIVE[2], COLOR_LIVE[3])
            ac.setText(self.btn_sfx_mute, "Mute SFX")

        ac.setText(self.lbl_sfx_vol, "{0}%".format(sfx_vol))

        # Voice visual update
        if voice_muted:
            ac.setText(self.lbl_voice_status, "[VOICE MUTED]")
            ac.setFontColor(self.lbl_voice_status, COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2], COLOR_MUTED[3])
            ac.setText(self.btn_voice_mute, "Unmute Voice")
        else:
            ac.setText(self.lbl_voice_status, "[VOICE LIVE]")
            ac.setFontColor(self.lbl_voice_status, COLOR_LIVE[0], COLOR_LIVE[1], COLOR_LIVE[2], COLOR_LIVE[3])
            ac.setText(self.btn_voice_mute, "Mute Voice")

        ac.setText(self.lbl_voice_vol, "{0}%".format(voice_vol))

        # Status text update
        ac.setText(self.lbl_bridge_status, "Bridge: " + status_msg)
        if bridge_online:
            ac.setFontColor(self.lbl_bridge_status, COLOR_LIVE[0], COLOR_LIVE[1], COLOR_LIVE[2], COLOR_LIVE[3])
        else:
            ac.setFontColor(self.lbl_bridge_status, COLOR_GRAY[0], COLOR_GRAY[1], COLOR_GRAY[2], COLOR_GRAY[3])


UI = MixerUI()


# ---------------------------------------------------------------------------
# UI Callback Functions (Non-blocking: Enqueues Actions Only)
# ---------------------------------------------------------------------------
def on_click_sfx_mute(*args):
    with STATE.lock:
        STATE.sfx_muted = not STATE.sfx_muted
        new_state = STATE.sfx_muted
        STATE.ui_dirty = True
    try:
        ACTION_QUEUE.put_nowait({"type": "toggle_mute", "target": "sfx", "muted": new_state})
    except Exception:
        pass


def on_click_sfx_down(*args):
    with STATE.lock:
        STATE.sfx_volume = max(0, STATE.sfx_volume - 5)
        new_vol = STATE.sfx_volume
        STATE.ui_dirty = True
    try:
        ACTION_QUEUE.put_nowait({"type": "set_volume", "target": "sfx", "value": new_vol})
    except Exception:
        pass


def on_click_sfx_up(*args):
    with STATE.lock:
        STATE.sfx_volume = min(100, STATE.sfx_volume + 5)
        new_vol = STATE.sfx_volume
        STATE.ui_dirty = True
    try:
        ACTION_QUEUE.put_nowait({"type": "set_volume", "target": "sfx", "value": new_vol})
    except Exception:
        pass


def on_spinner_sfx(value):
    try:
        clamped = max(0, min(100, int(value)))
        with STATE.lock:
            if STATE.sfx_volume != clamped:
                STATE.sfx_volume = clamped
                STATE.ui_dirty = True
                ACTION_QUEUE.put_nowait({"type": "set_volume", "target": "sfx", "value": clamped})
    except Exception:
        pass


def on_click_voice_mute(*args):
    with STATE.lock:
        STATE.voice_muted = not STATE.voice_muted
        new_state = STATE.voice_muted
        STATE.ui_dirty = True
    try:
        ACTION_QUEUE.put_nowait({"type": "toggle_mute", "target": "voice", "muted": new_state})
    except Exception:
        pass


def on_click_voice_down(*args):
    with STATE.lock:
        STATE.voice_volume = max(0, STATE.voice_volume - 5)
        new_vol = STATE.voice_volume
        STATE.ui_dirty = True
    try:
        ACTION_QUEUE.put_nowait({"type": "set_volume", "target": "voice", "value": new_vol})
    except Exception:
        pass


def on_click_voice_up(*args):
    with STATE.lock:
        STATE.voice_volume = min(100, STATE.voice_volume + 5)
        new_vol = STATE.voice_volume
        STATE.ui_dirty = True
    try:
        ACTION_QUEUE.put_nowait({"type": "set_volume", "target": "voice", "value": new_vol})
    except Exception:
        pass


def on_spinner_voice(value):
    try:
        clamped = max(0, min(100, int(value)))
        with STATE.lock:
            if STATE.voice_volume != clamped:
                STATE.voice_volume = clamped
                STATE.ui_dirty = True
                ACTION_QUEUE.put_nowait({"type": "set_volume", "target": "voice", "value": clamped})
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Assetto Corsa App Lifecycle Hooks
# ---------------------------------------------------------------------------
def acMain(ac_version):
    global WORKER_THREAD
    ac.log("NexusAudioMixer: Initializing version 1.0.0 (AC version {0})".format(ac_version))

    STATE.load_from_config()
    UI.init_ui()
    UI.update_widgets()

    # Start non-blocking background daemon thread
    WORKER_THREAD = threading.Thread(target=_worker_loop)
    WORKER_THREAD.daemon = True
    WORKER_THREAD.start()

    ac.console("Nexus Audio Mixer loaded successfully.")
    return "ac_sound_mixer"


def acUpdate(delta_t):
    # Non-blocking render tick (< 0.1ms)
    UI.last_update_time += delta_t
    if STATE.ui_dirty or UI.last_update_time >= 0.25:
        UI.last_update_time = 0.0
        UI.update_widgets()


def acShutdown():
    global IS_RUNNING
    ac.log("NexusAudioMixer: Shutting down.")
    IS_RUNNING = False
    STATE.save_to_config()


if __name__ == "__main__":
    # Allows offline smoke-testing of the script
    print("Testing Nexus Audio Mixer Python 3.3 runtime compatibility...")
    name = acMain("1.16.4")
    print("acMain returned: " + str(name))
    acUpdate(0.016)
    acShutdown()
    print("Test completed cleanly.")
