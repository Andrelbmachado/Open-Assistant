#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Intent,
    [string]$Browser = "default",
    [string]$Url,
    [string]$Query,
    [string]$App,
    [string]$Level,
    [string]$State,
    [string]$Path,
    [string]$Src,
    [string]$Dest,
    [string]$Text,
    [string]$Process,
    [string]$Package,
    [string]$Command,
    [string]$Keys,
    [string]$Page,
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Say($msg) { Write-Output $msg }

function Resolve-Browser {
    param([string]$Name)
    $map = @{
        chrome  = @("chrome.exe", "Google Chrome")
        edge    = @("msedge.exe", "Microsoft Edge")
        firefox = @("firefox.exe", "Firefox")
        brave   = @("brave.exe", "Brave")
    }
    if ($Name -eq "default" -or [string]::IsNullOrWhiteSpace($Name)) {
        return $null
    }
    return $map[$Name.ToLower()]
}

function Open-DefaultUrl {
    param([string]$Target)
    if ($WhatIf) { Say "WHATIF: start $Target"; return }
    Start-Process $Target | Out-Null
    Say "OK: aberto $Target"
}

switch ($Intent) {
    "open_browser" {
        $b = Resolve-Browser $Browser
        if ($WhatIf) { Say "WHATIF: open browser $Browser"; break }
        if ($b) {
            try {
                Start-Process $b[0] | Out-Null
                Say "OK: $($b[1]) aberto"
            } catch {
                Start-Process "https://www.google.com" | Out-Null
                Say "OK: browser padrao (falha ao achar $Browser)"
            }
        } else {
            Start-Process "https://www.google.com" | Out-Null
            Say "OK: browser padrao aberto"
        }
    }
    "open_url" {
        if (-not $Url) { throw "url ausente" }
        # Checa o esquema antes de completar com https:// (depois disso a checagem nunca casaria).
        if ($Url -match '^\s*(javascript|data|file|vbscript):') { throw "esquema bloqueado" }
        if ($Url -notmatch '^https?://') { $Url = "https://$Url" }
        Open-DefaultUrl $Url
    }
    "browser_search" {
        if (-not $Query) { throw "query ausente" }
        $q = [uri]::EscapeDataString($Query)
        Open-DefaultUrl "https://www.google.com/search?q=$q"
    }
    "open_explorer" {
        $target = if ($Path) { $Path } else { "$env:USERPROFILE\Downloads" }
        if ($WhatIf) { Say "WHATIF: explorer $target"; break }
        Start-Process explorer.exe $target | Out-Null
        Say "OK: Explorer em $target"
    }
    "open_app" {
        if (-not $App) { throw "app ausente" }
        $known = @{
            vscode    = "code"
            code      = "code"
            cursor    = "cursor"
            discord   = "discord"
            spotify   = "spotify"
            steam     = "steam"
            notepad   = "notepad"
            calc      = "calc"
            terminal  = "wt"
            whatsapp  = "whatsapp"
            obs       = "obs64"
            explorer  = "explorer"
        }
        $exe = $known[$App.ToLower()]
        if ($WhatIf) { Say "WHATIF: start $App ($exe)"; break }
        if ($exe) {
            Start-Process $exe | Out-Null
            Say "OK: $App"
        } else {
            Start-Process $App | Out-Null
            Say "OK: $App (nome cru)"
        }
    }
    "open_vscode" {
        $argsList = @()
        if ($Path) { $argsList += $Path }
        if ($WhatIf) { Say "WHATIF: code $Path"; break }
        Start-Process "code" -ArgumentList $argsList | Out-Null
        Say "OK: VS Code"
    }
    "list_windows" {
        Get-Process | Where-Object { $_.MainWindowTitle } |
            Select-Object ProcessName, Id, MainWindowTitle |
            Format-Table -AutoSize | Out-String
    }
    "list_apps_installed" {
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            winget list | Select-Object -First 80
        } else {
            Get-StartApps | Select-Object -First 80 | Format-Table -AutoSize | Out-String
        }
    }
    "close_app" {
        if (-not $App) { throw "app ausente" }
        if ($WhatIf) { Say "WHATIF: stop $App"; break }
        Get-Process | Where-Object { $_.ProcessName -like "*$App*" -or $_.MainWindowTitle -like "*$App*" } |
            Stop-Process -Confirm:$false
        Say "OK: tentou fechar $App"
    }
    "kill_process" {
        if (-not $Process) { throw "processo ausente" }
        if ($WhatIf) { Say "WHATIF: kill $Process"; break }
        Stop-Process -Name $Process -ErrorAction Stop
        Say "OK: kill $Process"
    }
    "set_volume" {
        if (-not $Level) { throw "level ausente" }
        $n = [Math]::Max(0, [Math]::Min(100, [int]$Level))
        if ($WhatIf) { Say "WHATIF: volume $n"; break }
        # Usa teclas de volume a partir de 0 é impreciso; tenta nircmd se existir
        $nircmd = Get-Command nircmd -ErrorAction SilentlyContinue
        if ($nircmd) {
            $vol = [int](65535 * $n / 100)
            & nircmd setsysvolume $vol
            Say "OK: volume $n (nircmd)"
        } else {
            Say "WARN: instale nircmd ou use o intent mute. Volume alvo=$n"
        }
    }
    "mute" {
        if ($WhatIf) { Say "WHATIF: mute $State"; break }
        $nircmd = Get-Command nircmd -ErrorAction SilentlyContinue
        if ($nircmd) {
            switch ($State) {
                "on" { & nircmd mutesysvolume 1; Say "OK: mute on" }
                "off" { & nircmd mutesysvolume 0; Say "OK: mute off" }
                default { & nircmd mutesysvolume 2; Say "OK: mute toggle" }
            }
        } else {
            Say "WARN: nircmd nao encontrado. Abra ms-settings:sound"
            Start-Process "ms-settings:sound" | Out-Null
        }
    }
    "set_brightness" {
        if (-not $Level) { throw "level ausente" }
        $n = [Math]::Max(0, [Math]::Min(100, [int]$Level))
        if ($WhatIf) { Say "WHATIF: brightness $n"; break }
        try {
            $m = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods
            $m.WmiSetBrightness(1, $n) | Out-Null
            Say "OK: brilho $n"
        } catch {
            Say "WARN: nao foi possivel setar brilho (comum em desktop + GPU dedicada)"
        }
    }
    "open_settings" {
        $uri = if ($Page) { "ms-settings:$Page" } else { "ms-settings:" }
        if ($WhatIf) { Say "WHATIF: $uri"; break }
        Start-Process $uri | Out-Null
        Say "OK: $uri"
    }
    "network_status" {
        $online = Test-Connection -ComputerName 1.1.1.1 -Count 1 -Quiet -ErrorAction SilentlyContinue
        $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike "127.*" } |
            Select-Object -First 3 -ExpandProperty IPAddress
        Say "online=$online"
        Say ("ip=" + ($ip -join ", "))
    }
    "flush_dns" {
        if ($WhatIf) { Say "WHATIF: ipconfig /flushdns"; break }
        ipconfig /flushdns | Out-String
    }
    "empty_recycle_bin" {
        if ($WhatIf) { Say "WHATIF: Clear-RecycleBin"; break }
        Clear-RecycleBin -Force
        Say "OK: lixeira"
    }
    "lock_pc" {
        if ($WhatIf) { Say "WHATIF: lock"; break }
        rundll32.exe user32.dll,LockWorkStation
        Say "OK: lock"
    }
    "sleep_pc" {
        if ($WhatIf) { Say "WHATIF: sleep"; break }
        rundll32.exe powrprof.dll,SetSuspendState 0,1,0
    }
    "shutdown_pc" {
        if ($WhatIf) { Say "WHATIF: shutdown /s /t 0"; break }
        shutdown /s /t 0
    }
    "restart_pc" {
        if ($WhatIf) { Say "WHATIF: shutdown /r /t 0"; break }
        shutdown /r /t 0
    }
    "screenshot" {
        $out = Join-Path $env:USERPROFILE "Pictures\pc-agent-$(Get-Date -Format yyyyMMdd-HHmmss).png"
        if ($WhatIf) { Say "WHATIF: screenshot $out"; break }
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
        $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose(); $bmp.Dispose()
        Say "OK: $out"
    }
    "nvidia_status" {
        if ($WhatIf) { Say "WHATIF: nvidia-smi"; break }
        nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv
    }
    "list_dir" {
        $p = if ($Path) { $Path } else { Get-Location }
        Get-ChildItem $p | Select-Object Mode, Length, Name | Format-Table -AutoSize | Out-String
    }
    "open_path" {
        if (-not $Path) { throw "path ausente" }
        if ($WhatIf) { Say "WHATIF: open $Path"; break }
        Invoke-Item $Path
        Say "OK: $Path"
    }
    "search_files" {
        $root = if ($Path) { $Path } else { $env:USERPROFILE }
        if (-not $Query) { throw "query ausente" }
        Get-ChildItem -Path $root -Recurse -ErrorAction SilentlyContinue -Filter "*$Query*" |
            Select-Object -First 40 FullName | ForEach-Object { $_.FullName }
    }
    "new_folder" {
        if (-not $Path) { throw "path ausente" }
        if ($WhatIf) { Say "WHATIF: mkdir $Path"; break }
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
        Say "OK: $Path"
    }
    "clipboard_get" {
        Get-Clipboard
    }
    "clipboard_set" {
        if (-not $Text) { throw "text ausente" }
        if ($WhatIf) { Say "WHATIF: clipboard set"; break }
        Set-Clipboard -Value $Text
        Say "OK: clipboard"
    }
    "git_status" {
        $cwd = if ($Path) { $Path } else { Get-Location }
        git -C $cwd status
    }
    "git_diff" {
        $cwd = if ($Path) { $Path } else { Get-Location }
        git -C $cwd diff
    }
    "observe" {
        Say ("user=" + $env:USERNAME)
        Say ("cwd=" + (Get-Location))
        Say ("os=" + [Environment]::OSVersion.VersionString)
        if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
            nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader
        }
    }
    "install_app" {
        if (-not $Package) { throw "package ausente" }
        if ($WhatIf) { Say "WHATIF: winget install $Package"; break }
        winget install --exact --id $Package --accept-package-agreements --accept-source-agreements
    }
    default { throw "intent nao implementado no dispatcher: $Intent" }
}
