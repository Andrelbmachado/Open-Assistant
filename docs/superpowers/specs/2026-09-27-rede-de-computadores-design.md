# Rede de computadores do Open Assistant: design (ROADMAP §15)

Pedido do André (2026-09-27): "estar no meu MacBook, abrir o chat e, em vez de pagar uma API, usar o meu PC com RTX da rede como processador das requisições; se eu pedir para controlar o PC, ele controla; um instalador para mandar aos outros computadores; e eu consigo mandar atualizações para os PCs abaixo do meu."

## O que o usuário vê

- **Ícone de computador** na barra lateral (o indicador Monitor/Nuvem da linha do usuário) abre a página **Rede**, no mesmo visual das outras páginas (`PageHeader`, cartões, cores do `DESIGN.md`).
- A página mostra uma **malha (mesh)**: cada computador é um ícone com o nome embaixo, e uma linha liga cada par conectado. O computador atual fica destacado. Cada linha mostra o tipo de ligação: rede local ou internet.
- **Ícones diferentes por tipo**: PC de mesa (gabinete + monitor), notebook Windows, MacBook, Mac de mesa (iMac/Mac mini). Desenhos próprios em SVG, no traço dos ícones lucide do app.
- Painel de cada computador: nome, tipo, sistema, endereço MAC, placa de vídeo, modelos do Ollama instalados, estado (online/offline, ocupado) e permissões dadas a ele.
- **Conectar por código** (como o AnyDesk). O computador que vai ser usado clica em "Mostrar meu código" e aparece um código de 6 dígitos, que vale 5 minutos e só uma vez. No outro computador, "Conectar por código" → digita o código → pronto. O código nunca trafega sem criptografia.
- **Descobrir na rede local**: lista os computadores da mesma rede com o Open Assistant aberto e "visível na rede" ligado. Uma seção à parte mostra os **aparelhos da rede sem o app** (IP + MAC, pela tabela ARP do sistema), com o botão "Enviar instalador".
- **Chat usando outro computador**: o seletor de modelos ganha o grupo "Computadores da rede" (ex.: `PC-Sala · qwen3.5:9b`). A resposta chega no chat em streaming, igual a um modelo local.
- **Controle**: "controle este computador" continua controlando **o computador onde o chat está**. O PC remoto só pensa (o modelo); as ferramentas rodam aqui. "No PC-Sala, abra o Chrome" manda a tarefa para o agente **daquele** PC, que pede confirmação lá se a permissão "Controlar este PC" não estiver ligada.
- **Instalador + atualizações**: botão "Gerar instalador" (arquivo `.exe` para Windows). Na hora do pareamento, o computador que entra na rede pode aceitar que o computador **dono** instale atualizações nele. O dono clica "Atualizar todos": cada PC baixa pelo túnel, confere a assinatura e se atualiza.

## Decisões técnicas (e por quê)

| Tema | Escolha | Por quê |
|---|---|---|
| Túnel entre computadores | **iroh 1.2** (Rust, QUIC) | Cada computador é identificado por uma chave pública e todo o tráfego é criptografado de ponta a ponta. Encontra o caminho direto na rede local e atravessa roteadores (NAT) quando for pela internet, com servidores de retransmissão como reserva. A mesma peça atende a fase 1 (rede local) e a fase 4 (internet). |
| Descoberta na rede local | mDNS via `iroh-mdns-address-lookup` 0.5 | Só aparecem os apps Open Assistant que escolheram ficar visíveis. Não varre a rede. |
| Identidade | Chave Ed25519 gerada no primeiro uso, guardada em `%LOCALAPPDATA%\com.openassistant.windows\rede\` | O **MAC aparece só como informação**. Não serve de identidade: pode ser falsificado e só é visível na mesma rede. Quem prova quem é cada computador é a chave. |
| Pareamento | Código de 6 dígitos, 5 min, uso único, no máximo 5 tentativas, conferido dentro do túnel criptografado | Mesmo modelo do AnyDesk. Com 5 tentativas, a chance de acertar um código no chute é de 5 em 1 milhão. |
| Permissões por computador | `usarIA` (padrão: sim), `controlar` (padrão: **não**; pede confirmação), `atualizar` (padrão: não; o dono pede no pareamento) | Controle remoto e instalação são o que há de mais perigoso. Por isso ficam desligados até alguém ligar. |
| Chat remoto | Novo comando `remote_chat`, que fala como o `ollama_chat` e emite o mesmo evento `ollama-chat-delta` | O chat e o agente (`agentRunner.ts`) já usam esse caminho: nenhuma tela muda. |
| Registro | Cada conexão, pedido de chat, controle e atualização vira um fluxo do sistema no Node Editor (§11) | "Todo o sistema visível", pedido na seção 11. |
| Atualizações | Instalador NSIS do Tauri, assinado com a chave de atualização do Tauri (minisign). A chave pública vai dentro do app | Um PC só instala o que foi assinado pelo dono. Um PC comprometido na rede não consegue empurrar um instalador falso. |

## Fases

1. **Rede local + chat remoto** (plano: `docs/superpowers/plans/2026-09-27-rede-fase1-local.md`): identidade, descoberta, pareamento por código, página Rede com a malha, chat e agente usando o modelo de outro PC. Com isso, um notebook Windows já usa a RTX do PC de mesa.
2. **Controle remoto**: mandar tarefas para o agente de outro PC, com confirmação lá (plano a escrever).
3. **Instalador e atualizações remotas**: `npm run build:installer` com bundle NSIS, chave de assinatura, "Atualizar todos" pelo túnel, instalação silenciosa (`/S`) e reinício (plano a escrever).
4. **Fora de casa (internet)**: código fixo tipo AnyDesk e conta. Precisa de um **servidor da empresa** (diretório "código → chave pública" e retransmissão iroh própria). Decisão de infraestrutura pendente com o André.
5. **App para macOS**: pré-requisito do cenário "estou no MacBook". O app hoje é só Windows (UI Automation, PowerShell, `CREATE_NO_WINDOW`, receitas `.zip` para Windows). Precisa de build Tauri no Mac (existe a pasta antiga `macos-archive`, um projeto Xcode, que não é o app Tauri) e de um agente com ferramentas do macOS (Acessibilidade, AppleScript, `screencapture`). Até lá, o cenário do André funciona com **um notebook Windows** no lugar do MacBook.

## Riscos

- **Firewall do Windows**: o primeiro uso pede permissão de rede, e o app tem de explicar isso.
- **VRAM**: pedidos do chat remoto disputam a GPU com quem está usando o PC da RTX. O PC que responde mostra "ocupado" e enfileira os pedidos.
- **Controle remoto indevido**: continua valendo a política do agente (seguro/confirmar/negar), avaliada **no PC controlado**, nunca no que pediu.
