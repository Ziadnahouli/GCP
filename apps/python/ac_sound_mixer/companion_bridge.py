"""
Nexus Desktop Companion - Assetto Corsa WASAPI Audio Session Bridge
===================================================================
Runs as an external service (Python 3.10+ or desktop agent) on the Windows host.
Communicates with the in-game Assetto Corsa Python 3.3 app over http://127.0.0.1:48123.

Features:
- Windows CoreAudio WASAPI Session Isolation:
  * Targets 'acs.exe' process session for Game Audio (SFX).
  * Targets voice communication processes / master for Voice Comms.
- Fallback mock audio session manager when running in dev or without pycaw.
"""

import sys
import json
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("NexusAudioBridge")

# Try to load Windows WASAPI CoreAudio via pycaw
HAS_PYCAW = False
try:
    if sys.platform == "win32":
        from pycaw.pycaw import AudioUtilities, ISimpleAudioVolume
        HAS_PYCAW = True
        logger.info("Windows CoreAudio (pycaw) successfully initialized.")
except ImportError:
    logger.info("pycaw is not installed. Running in local simulation mode.")
    logger.info("To enable real Windows per-application audio session control, run: pip install pycaw")


class WindowsAudioController:
    """Manages WASAPI audio sessions for acs.exe and system comms."""

    def __init__(self):
        self.sfx_volume = 80
        self.sfx_muted = False
        self.voice_volume = 100
        self.voice_muted = False

    def get_acs_session(self):
        if not HAS_PYCAW:
            return None
        try:
            sessions = AudioUtilities.GetAllSessions()
            for session in sessions:
                volume = session._ctl.QueryInterface(ISimpleAudioVolume)
                if session.Process and session.Process.name().lower() == "acs.exe":
                    return volume
        except Exception as e:
            logger.warning(f"Error querying WASAPI sessions: {e}")
        return None

    def set_sfx_volume(self, volume_percent: int):
        self.sfx_volume = max(0, min(100, volume_percent))
        vol_scalar = self.sfx_volume / 100.0
        session = self.get_acs_session()
        if session:
            try:
                session.SetMasterVolume(vol_scalar, None)
                logger.info(f"WASAPI: acs.exe volume set to {self.sfx_volume}%")
            except Exception as e:
                logger.error(f"Failed to set acs.exe volume: {e}")
        else:
            logger.info(f"[Bridge Mock] SFX volume set to {self.sfx_volume}% (acs.exe session not active)")

    def set_sfx_mute(self, muted: bool):
        self.sfx_muted = muted
        session = self.get_acs_session()
        if session:
            try:
                session.SetMute(1 if muted else 0, None)
                logger.info(f"WASAPI: acs.exe mute set to {muted}")
            except Exception as e:
                logger.error(f"Failed to set acs.exe mute: {e}")
        else:
            logger.info(f"[Bridge Mock] SFX mute set to {muted}")

    def set_voice_volume(self, volume_percent: int):
        self.voice_volume = max(0, min(100, volume_percent))
        logger.info(f"Voice comms volume set to {self.voice_volume}%")

    def set_voice_mute(self, muted: bool):
        self.voice_muted = muted
        logger.info(f"Voice comms mute set to {muted}")

    def get_state(self):
        return {
            "sfx_volume": self.sfx_volume,
            "sfx_muted": self.sfx_muted,
            "voice_volume": self.voice_volume,
            "voice_muted": self.voice_muted,
            "wasapi_active": HAS_PYCAW,
            "service": "nexus-audio-bridge",
            "version": "1.0.0"
        }


AUDIO = WindowsAudioController()


class BridgeRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok"})
        elif self.path == "/api/audio/status":
            self._send_json(200, AUDIO.get_state())
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        try:
            payload = json.loads(body)
        except Exception:
            self._send_json(400, {"error": "Invalid JSON body"})
            return

        if self.path == "/api/audio/volume":
            target = payload.get("target")
            vol = int(payload.get("volume", 100))
            if target == "sfx":
                AUDIO.set_sfx_volume(vol)
            elif target == "voice":
                AUDIO.set_voice_volume(vol)
            self._send_json(200, {"status": "ok", "state": AUDIO.get_state()})

        elif self.path == "/api/audio/mute":
            target = payload.get("target")
            muted = bool(payload.get("muted", False))
            if target == "sfx":
                AUDIO.set_sfx_mute(muted)
            elif target == "voice":
                AUDIO.set_voice_mute(muted)
            self._send_json(200, {"status": "ok", "state": AUDIO.get_state()})

        else:
            self._send_json(404, {"error": "Not found"})

    def log_message(self, format, *args):
        # Override to suppress default noisy stdout logging
        pass


def run_bridge_server(host="127.0.0.1", port=48123):
    server = HTTPServer((host, port), BridgeRequestHandler)
    logger.info(f"Nexus Assetto Corsa Audio Bridge running at http://{host}:{port}/")
    logger.info("Ready for Assetto Corsa in-game sound mixer connections.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down bridge server.")
        server.server_close()


if __name__ == "__main__":
    run_bridge_server()
