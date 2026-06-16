"""Text-to-speech via Piper (Kokoro / ElevenLabs are alternatives)."""
from __future__ import annotations


def speak(params: dict) -> dict:
    """params: { text }. Returns { audio: base64 } or streams chunks."""
    # TODO: synthesize with Piper and return/stream audio.
    return {"audio": ""}
