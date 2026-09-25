---
intents:
  - id: list_dir
    risk: safe
    script_windows: scripts/windows/list_dir.ps1
    params: [path]
  - id: open_path
    risk: safe
    script_windows: scripts/windows/open_path.ps1
    params: [path]
  - id: search_files
    risk: safe
    script_windows: scripts/windows/search_files.ps1
    params: [query, path]
  - id: new_folder
    risk: safe
    script_windows: scripts/windows/new_folder.ps1
    params: [path]
  - id: copy_path
    risk: confirm
    params: [src, dest]
  - id: move_path
    risk: confirm
    params: [src, dest]
  - id: delete_path
    risk: confirm
    params: [path]
---

# Arquivos

Resolver pastas faladas:

| falou | path |
|---|---|
| desktop, área de trabalho | %USERPROFILE%\Desktop |
| downloads | %USERPROFILE%\Downloads |
| documentos | %USERPROFILE%\Documents |
| imagens | %USERPROFILE%\Pictures |
| projetos | valor em preferencias |

Recusar paths fora da allowlist sem confirm.
