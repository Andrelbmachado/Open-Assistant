"""
Sidecar entry point.

Exposes voice + desktop-automation methods over a local RPC boundary that the
Rust shell / TypeScript core call. This is a skeleton: wire a real transport
(e.g. websockets on 127.0.0.1) and dispatch to the modules below.
"""
from __future__ import annotations

from .voice import stt, tts
from .automation import desktop

# Method name -> handler. Mirrors the TS-side `SidecarRpc` contract.
HANDLERS = {
    "desktop.screenshot": desktop.screenshot,
    "desktop.ocr": desktop.ocr,
    "desktop.moveMouse": desktop.move_mouse,
    "desktop.type": desktop.type_text,
    "desktop.launch": desktop.launch,
    "voice.transcribe": stt.transcribe,
    "voice.speak": tts.speak,
}


def main() -> None:
    # TODO: start a local RPC server (websockets), authenticate the caller,
    # then route incoming {method, params} messages through HANDLERS.
    print("Open Assistant sidecar — handlers:", ", ".join(HANDLERS))


if __name__ == "__main__":
    main()
