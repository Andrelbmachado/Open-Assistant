@echo off
title Open Assistant - Executavel Nativo Windows
cd /d "%~dp0"
echo ======================================================
echo           Abrindo Open Assistant (Producao)
echo ======================================================
echo.
if exist "src-tauri\target\release\open-assistant.exe" (
    start "" "src-tauri\target\release\open-assistant.exe"
    echo Aplicativo iniciado com sucesso!
) else (
    echo Executavel nao encontrado. Executando build primeiro...
    npm run tauri build
    start "" "src-tauri\target\release\open-assistant.exe"
)
exit
