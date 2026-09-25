---
intents:
  - {id: lock_pc, risk: safe, script_windows: scripts/windows/lock_pc.ps1}
  - {id: sleep_pc, risk: confirm, script_windows: scripts/windows/sleep_pc.ps1}
  - {id: shutdown_pc, risk: confirm, script_windows: scripts/windows/shutdown_pc.ps1}
  - {id: restart_pc, risk: confirm, script_windows: scripts/windows/restart_pc.ps1}
---

# Energia

Nunca execute shutdown/restart/sleep sem confirm explícito nesta sessão.

## lock_pc

Aliases: bloqueia o pc, trava o pc, lock, win+l, bloqueia a tela

## sleep_pc

Aliases: sleep, suspende, hiberna, põe pra dormir

## shutdown_pc

Aliases: desliga o pc, desligar, shutdown, desliga o computador

## restart_pc

Aliases: reinicia, reiniciar, restart, reboot, reinicia o windows
