"""Speech-to-text via faster-whisper."""
from __future__ import annotations


def transcribe(params: dict) -> dict:
    """params: { audio: base64 | path }. Returns { text }."""
    # TODO: load a faster-whisper model once, transcribe, return text.
    return {"text": ""}
