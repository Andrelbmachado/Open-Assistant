# Repositório de comandos do Windows

Use com `run_command` (`shell: "powershell"` salvo indicação `cmd`). Prefira sempre um intent do catálogo quando existir.
Regras: caminhos com espaço entre aspas; nada de `Invoke-Expression`; saídas longas → `| Select-Object -First 30`.

## Índice
1. Arquivos e pastas
2. Procurar arquivos e texto
3. Apps e processos
4. Janelas e área de trabalho
5. Sistema, hardware e energia
6. Rede e internet
7. Instalar programas (winget)
8. Desenvolvimento (git, node, python)
9. Serviços, tarefas e inicialização
10. Configurações do Windows (ms-settings)
11. Área de transferência e texto
12. cmd.exe (equivalentes)

## 1. Arquivos e pastas
| Tarefa | PowerShell |
|---|---|
| listar pasta | `Get-ChildItem "C:\caminho" \| Select-Object Mode,Length,LastWriteTime,Name` |
| só pastas | `Get-ChildItem -Directory "C:\caminho"` |
| tamanho de pasta | `(Get-ChildItem "C:\p" -Recurse -File \| Measure-Object Length -Sum).Sum / 1MB` |
| criar pasta | `New-Item -ItemType Directory -Force "C:\p\nova"` |
| copiar | `Copy-Item "origem" "destino" -Recurse` *(confirm)* |
| mover/renomear | `Move-Item "origem" "destino"` / `Rename-Item "arq" "novo.txt"` *(confirm)* |
| apagar para a lixeira | `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile("C:\p\arq.txt",'OnlyErrorDialogs','SendToRecycleBin')` *(confirm)* |
| ler texto | `Get-Content "arq.txt" -TotalCount 80` |
| escrever texto | `Set-Content -Encoding utf8 "arq.txt" "conteúdo"` |
| acrescentar | `Add-Content -Encoding utf8 "arq.txt" "linha"` |
| compactar | `Compress-Archive "C:\p\*" "C:\saida.zip"` |
| extrair | `Expand-Archive "arq.zip" "C:\destino" -Force` |
| abrir no app padrão | `Invoke-Item "C:\p\arq.pdf"` |
| pastas especiais | `[Environment]::GetFolderPath('Desktop')`, `'MyDocuments'`, `"$env:USERPROFILE\Downloads"` |

## 2. Procurar arquivos e texto
| Tarefa | PowerShell |
|---|---|
| por nome | `Get-ChildItem "$env:USERPROFILE" -Recurse -Filter "*relatorio*" -ErrorAction SilentlyContinue \| Select-Object -First 30 FullName` |
| por extensão recente | `Get-ChildItem "$env:USERPROFILE\Downloads" -Filter *.pdf \| Sort-Object LastWriteTime -Descending \| Select-Object -First 10 Name` |
| texto dentro de arquivos | `Select-String -Path "C:\proj\*.ts" -Pattern "TODO" -List \| Select-Object -First 30 Path,LineNumber,Line` |
| maiores arquivos | `Get-ChildItem C:\p -Recurse -File \| Sort-Object Length -Descending \| Select-Object -First 15 FullName,@{n='MB';e={[int]($_.Length/1MB)}}` |

## 3. Apps e processos
| Tarefa | PowerShell |
|---|---|
| abrir programa | `Start-Process notepad` · `Start-Process "C:\Program Files\App\app.exe"` |
| abrir com argumentos | `Start-Process code -ArgumentList '"C:\proj"'` |
| abrir URL/URI | `Start-Process "https://site.com"` · `Start-Process "spotify:"` |
| apps do menu Iniciar | `Get-StartApps \| Where-Object Name -like "*chrome*"` |
| abrir app da Store pelo AppID | `Start-Process "shell:AppsFolder\<AppID>"` (AppID vem do `Get-StartApps`) |
| processos com janela | `Get-Process \| Where-Object MainWindowTitle \| Select-Object Id,ProcessName,MainWindowTitle` |
| mais consumo de memória | `Get-Process \| Sort-Object WS -Descending \| Select-Object -First 10 Name,Id,@{n='MB';e={[int]($_.WS/1MB)}}` |
| fechar (educado) | `(Get-Process notepad).CloseMainWindow()` *(confirm)* |
| encerrar à força | `Stop-Process -Name notepad -Force` *(confirm)* |
| está rodando? | `Get-Process chrome -ErrorAction SilentlyContinue \| Measure-Object \| Select-Object -Expand Count` |

## 4. Janelas e área de trabalho
Para focar, clicar e digitar use as ferramentas `focus_window`, `look`, `click`, `type_text`, `press_keys`.
| Atalho | Efeito |
|---|---|
| `win+d` | mostrar área de trabalho |
| `win+e` | Explorador de Arquivos |
| `win+r` | Executar |
| `win+up` / `win+down` | maximizar / restaurar |
| `win+left` / `win+right` | encaixar à esquerda/direita |
| `alt+f4` | fechar janela ativa *(confirm)* |
| `alt+tab` | alternar janela |
| `ctrl+shift+esc` | Gerenciador de Tarefas |
| `win+shift+s` | recorte de tela |

## 5. Sistema, hardware e energia
| Tarefa | PowerShell |
|---|---|
| resumo do PC | `Get-ComputerInfo -Property OsName,OsVersion,CsProcessors,CsTotalPhysicalMemory` |
| GPU NVIDIA | `nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv` |
| discos | `Get-PSDrive -PSProvider FileSystem \| Select-Object Name,@{n='LivreGB';e={[int]($_.Free/1GB)}},@{n='UsadoGB';e={[int]($_.Used/1GB)}}` |
| uso de CPU | `(Get-Counter '\Processor(_Total)\% Processor Time').CounterSamples.CookedValue` |
| bateria | `Get-CimInstance Win32_Battery \| Select-Object EstimatedChargeRemaining` |
| bloquear | intent `lock_pc` |
| desligar/reiniciar | intents `shutdown_pc` / `restart_pc` *(confirm)* |
| agendar desligamento | `shutdown /s /t 3600` · cancelar: `shutdown /a` *(confirm)* |

## 6. Rede e internet
| Tarefa | PowerShell |
|---|---|
| estou online? | `Test-Connection 1.1.1.1 -Count 1 -Quiet` |
| IPs | `Get-NetIPAddress -AddressFamily IPv4 \| Where-Object IPAddress -notlike '127.*' \| Select-Object InterfaceAlias,IPAddress` |
| Wi-Fi atual | `netsh wlan show interfaces` |
| DNS de um site | `Resolve-DnsName exemplo.com` |
| porta aberta? | `Test-NetConnection 127.0.0.1 -Port 11434` |
| baixar arquivo | `Invoke-WebRequest "https://url/arquivo.zip" -OutFile "$env:USERPROFILE\Downloads\arquivo.zip"` *(confirm; só de fontes que o usuário pediu)* |
| limpar DNS | intent `flush_dns` *(confirm)* |

## 7. Instalar programas (winget)
| Tarefa | Comando |
|---|---|
| procurar | `winget search "vlc"` |
| detalhes | `winget show --id VideoLAN.VLC` |
| instalar | `winget install --exact --id VideoLAN.VLC --accept-package-agreements --accept-source-agreements` *(confirm)* |
| atualizar tudo | `winget upgrade --all --accept-package-agreements` *(confirm)* |
| desinstalar | `winget uninstall --id VideoLAN.VLC` *(confirm)* |
| instalados | intent `list_apps_installed` |

## 8. Desenvolvimento
| Tarefa | Comando |
|---|---|
| estado do repositório | `git -C "C:\proj" status --short` |
| últimos commits | `git -C "C:\proj" log --oneline -10` |
| diferença | `git -C "C:\proj" diff --stat` |
| commit | `git -C "C:\proj" add -A; git -C "C:\proj" commit -m "mensagem"` *(confirm)* |
| criar projeto Vite | `npm create vite@latest meu-app -- --template react-ts` (na pasta de projetos) |
| instalar dependências | `npm install` (use `run_command` com a pasta certa: `Set-Location "C:\proj"; npm install`) |
| rodar em segundo plano | `Start-Process powershell -ArgumentList '-NoExit','-Command','Set-Location "C:\proj"; npm run dev'` |
| Python venv | `python -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt` |
| abrir no VS Code | intent `open_vscode` com `path` |

## 9. Serviços, tarefas e inicialização
| Tarefa | PowerShell |
|---|---|
| serviços rodando | `Get-Service \| Where-Object Status -eq Running \| Select-Object -First 30 Name,DisplayName` |
| iniciar/parar serviço | `Start-Service nome` / `Stop-Service nome` *(confirm, pode exigir admin)* |
| tarefas agendadas | `Get-ScheduledTask \| Where-Object State -ne Disabled \| Select-Object -First 30 TaskName,State` |
| criar tarefa | ver `references/automacao.md` *(confirm)* |
| programas na inicialização | `Get-CimInstance Win32_StartupCommand \| Select-Object Name,Command,Location` |

## 10. Configurações do Windows (`ms-settings:`)
Abra com o intent `open_settings` e `page`: `sound`, `display`, `network-wifi`, `bluetooth`, `windowsupdate`,
`appsfeatures`, `defaultapps`, `privacy-microphone`, `privacy-webcam`, `personalization-background`, `powersleep`, `taskbar`, `dateandtime`.

## 11. Área de transferência e texto
| Tarefa | PowerShell |
|---|---|
| ler | `Get-Clipboard` |
| copiar | `Set-Clipboard -Value "texto"` |
| colar na janela ativa | ferramenta `press_keys` com `ctrl+v` |

## 12. cmd.exe (use `shell: "cmd"`)
| Tarefa | cmd |
|---|---|
| listar | `dir "C:\caminho"` |
| abrir | `start "" "C:\caminho\arquivo.pdf"` |
| variáveis | `echo %USERPROFILE%` |
| processos | `tasklist /fi "imagename eq chrome.exe"` |
| encerrar | `taskkill /im notepad.exe` *(confirm)* |
| rede | `ipconfig` · `ping -n 1 1.1.1.1` |
| energia | `powercfg /batteryreport` |
