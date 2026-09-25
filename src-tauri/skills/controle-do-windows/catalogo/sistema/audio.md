---
intents:
  - id: set_volume
    risk: safe
    script_windows: scripts/windows/set_volume.ps1
    params: [level]
  - id: mute
    risk: safe
    script_windows: scripts/windows/mute.ps1
    params: [state]
---

# Áudio

## set_volume

Aliases: volume, som, abaixa o som, aumenta o som, deixa no 50, volume 30%, silêncio quase total

Param `level`: 0–100.  
Palavras:

- mudo / silêncio → `mute`
- baixo → 15
- médio → 50
- alto → 80
- no máximo → 100

## mute

Aliases: muda, mute, silencia, tira o som, unmude, ativa o som, volta o som

Param `state`: on | off | toggle
