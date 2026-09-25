# Scripts automatizadores no Windows

Tudo aqui cria algo que continua rodando depois da conversa: **sempre confirme com o usuário** (`ask_user`) e diga como desfazer.

## Tarefas agendadas (Agendador de Tarefas)
Criar (todo dia às 9h roda um script):
```powershell
$acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument '-NoProfile -File "C:\scripts\backup.ps1"'
$quando = New-ScheduledTaskTrigger -Daily -At 9am
Register-ScheduledTask -TaskName "OA-Backup" -Action $acao -Trigger $quando -Description "Criada pelo Open Assistant"
```
Outros gatilhos: `-AtLogOn`, `-AtStartup` (admin), `-Once -At (Get-Date).AddMinutes(30)`, `-Weekly -DaysOfWeek Monday -At 8am`.
Listar: `Get-ScheduledTask -TaskName "OA-*"` · Rodar agora: `Start-ScheduledTask "OA-Backup"` · Remover: `Unregister-ScheduledTask "OA-Backup" -Confirm:$false`.
Prefixe as tarefas com `OA-` para o usuário achar o que o assistente criou.

## Scripts PowerShell reutilizáveis
Guarde em `%USERPROFILE%\OpenAssistant\scripts\`. Modelo:
```powershell
param([string]$Pasta = "$env:USERPROFILE\Downloads")
$ErrorActionPreference = "Stop"
# Organiza downloads por extensão
Get-ChildItem $Pasta -File | ForEach-Object {
  $destino = Join-Path $Pasta ($_.Extension.TrimStart('.').ToUpper())
  New-Item -ItemType Directory -Force $destino | Out-Null
  Move-Item $_.FullName $destino
}
Write-Output "OK: organizado"
```
Rodar: `powershell -NoProfile -ExecutionPolicy Bypass -File "caminho\script.ps1" -Pasta "C:\x"`.
Sempre ofereça rodar primeiro com `-WhatIf` (ou só listando) antes de mover/apagar.

## AutoHotkey v2 (atalhos e macros)
Se instalado (`winget install AutoHotkey.AutoHotkey`), um script `.ahk`:
```ahk
#Requires AutoHotkey v2.0
^!n::Run "notepad.exe"          ; Ctrl+Alt+N abre o Bloco de Notas
::;email::usuario@exemplo.com   ; expande texto
```
Rodar na inicialização: atalho do script em `shell:startup` (`Start-Process shell:startup`).

## Tarefas em lote
- Renomear em série: `Get-ChildItem *.jpg | ForEach-Object -Begin {$i=1} { Rename-Item $_ ("foto_{0:D3}.jpg" -f $i++) }`
- Converter vídeos (se `ffmpeg` existir): `Get-ChildItem *.mov | ForEach-Object { ffmpeg -i $_.FullName ($_.BaseName + ".mp4") }`
- Backup incremental: `robocopy "C:\origem" "D:\backup" /MIR /R:1 /W:1 /XD node_modules .git`

## Observação de pastas (reagir a arquivos novos)
Para rodar algo sempre que chegar um arquivo, prefira uma tarefa agendada a cada 5 minutos a um processo eterno.
