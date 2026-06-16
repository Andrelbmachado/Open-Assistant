# Open Assistant — Python sidecar

A local service that the desktop app spawns and talks to over RPC. It is **not**
imported by the TypeScript packages — it exposes a typed boundary.

Responsibilities:
- **voice/** — speech-to-text (faster-whisper) and text-to-speech (Piper).
- **automation/** — screenshots, OCR, and OS-level mouse/keyboard input.

Run standalone for development:

```bash
pip install -e .
python -m open_assistant_sidecar.main
```
