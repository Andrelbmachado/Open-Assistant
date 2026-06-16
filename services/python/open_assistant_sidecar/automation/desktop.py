"""
OS-level desktop control. Kept in Python because screenshots, OCR, and input
automation are simplest here across Windows/macOS/Linux.

Every high-risk action must be gated by the approval workflow on the TS side
BEFORE it reaches these functions.
"""
from __future__ import annotations


def screenshot(_params: dict) -> dict:
    # TODO: capture with mss, return base64 PNG.
    return {"image": ""}


def ocr(_params: dict) -> dict:
    # TODO: run pytesseract on the provided image, return text.
    return {"text": ""}


def move_mouse(_params: dict) -> dict:
    # TODO: pyautogui.moveTo(x, y)
    return {"ok": True}


def type_text(_params: dict) -> dict:
    # TODO: pyautogui.typewrite(text)
    return {"ok": True}


def launch(_params: dict) -> dict:
    # TODO: launch an application by name (platform-specific).
    return {"ok": True}
