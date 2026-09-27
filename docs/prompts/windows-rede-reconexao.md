# Prompt para o Windows — reconexão Mac↔Windows, logs e MCP da rede

Cole no Claude/Codex do Windows (repo `Andrelbmachado/Open-Assistant`, branch `feat/agente-local`).

```text
Objetivo: computadores já pareados (Mac "Andres-MacBook-Pro" ↔ PC "ANDREPC") devem RECONECTAR sozinhos e pelo botão Reconectar, sem código novo, mesmo em redes diferentes. E a rede precisa ser fácil de ler por uma IA (logs estruturados, relatório e MCP).

NÃO mude o protocolo (ALPN `open-assistant/1`, mensagens em protocol.rs). Campo novo = opcional com default.

## O que foi verificado (27/09/2026)

1. PORTA ALEATÓRIA: `src-tauri/src/network/node.rs` (linhas ~156/158) faz
   `Endpoint::builder(presets::N0 | presets::Minimal)...bind()` sem porta → o SO sorteia uma porta UDP nova a cada abertura. Endereço IP:porta salvo pelo Mac fica inválido quando o PC reabre.
2. ERRO NA TELA: "Andres-MacBook-Pro.local: Não foi possível conectar: No addressing information available". Significa: o Windows só tem a CHAVE do Mac, sem nenhum endereço (o `addrs` do confiaveis.json está vazio porque o pareamento foi antes do `learn_paths`) e sem descoberta que ache o Mac.
3. REDES DIFERENTES: o Mac (192.168.14.x) não vê o MAC do PC (30:56:0F:68:E9:06) na tabela ARP → os dois NÃO estão na mesma rede local agora. mDNS não vai achar. Só funciona pelo relay/DNS do iroh (preset N0) ligado NOS DOIS.
4. "Internet · reabra": o Windows só aplica "Conectar pela internet" depois de reabrir o app. Enquanto não reabre, roda em `Minimal` (sem relay, sem lookup por DNS) → não acha o Mac pela chave.
5. O laço de Hello a cada 10 s está DENTRO de `start_mdns` (node.rs ~209). Se o mDNS não subir, nada reconecta sozinho.

## O que o Mac já faz (espelhe no Windows)

- Porta UDP fixa: na primeira vez usa porta livre e salva em `rede\porta.json` (só o número, ex. `57405`). Nas próximas faz
  `.clear_ip_transports().bind_addr("0.0.0.0:<porta>")?.bind_addr_with_opts("[::]:<porta>", BindOpts::default().set_is_required(false))?`
  Se falhar (porta ocupada), cai para `bind()` normal e salva a nova porta.
- Endereços no histórico: `TrustedDevice.addrs` + `last_seen` (mesmo formato de vocês, `learn_paths` com `connection.paths()`), chamado no Hello de saída, no Hello recebido, no pareamento de saída e no recebido.
- `addr_of(id)` = chave + endereço visto nesta sessão + TODOS os `addrs` salvos (união).
- Laço de reconexão independente do mDNS: ao abrir (imediato) e a cada 10 s, Hello com prazo de 8 s para todos os pareados.
- Comando `reconnect` (todos ou um `deviceId`), prazo 12 s cada, devolve os ids que responderam; em falha devolve o erro + dica.
- Ligar/desligar Internet reinicia o nó na hora (fecha o Router, recria o Endpoint) — sem "reabra".
- Log estruturado da rede + `estado.json` + socket de controle + modo MCP (detalhes abaixo).

## Tarefas no Windows

1. PORTA FIXA
   - Igual ao Mac (`rede\porta.json`). Função `bind_endpoint(key, internet, port: Option<u16>)` com fallback.
   - Regra no Firewall do Windows para essa porta UDP (perfil Privado; e Público só se o usuário ligar Internet), criada pelo instalador NSIS ou na primeira abertura com `netsh advfirewall firewall add rule name="Open Assistant rede" dir=in action=allow protocol=UDP localport=<porta> profile=private`. Se já existir regra do executável, mantenha.

2. INTERNET SEM REABRIR
   - `net_set_internet` salva o config e REINICIA o nó: `node.shutdown().await`, `start_node(app)` de novo, troca o `NetState` (use `RwLock<Option<Node>>`/`ArcSwap` em vez de `OnceCell`), emite `DEVICES_EVENT`. Tire o "· reabra" da UI.
   - Recomende Internet ligada por padrão quando houver pareado que nunca foi visto na rede local (mostre um aviso claro, não ligue sozinho).

3. RECONEXÃO SEMPRE ATIVA
   - Tire o laço de Hello de dentro de `start_mdns`: função própria `start_reconnect_loop()` chamada sempre, com uma varredura imediata ao abrir e depois a cada 10 s.
   - `net_reconnect(device_id)` e novo `net_reconnect_all()` (botão "Reconectar todos"/Scan): Hello com prazo, sem precisar de código.
   - Clique num computador offline do histórico → Reconectar. Duplo clique → reconecta direto.
   - Quando o Hello de um pareado chega (conexão recebida), marque online na hora e rode `learn_paths` (já existe) — confirme que também roda no Hello RECEBIDO antes de responder.

4. MENSAGENS DE ERRO QUE AJUDAM
   - Troque o texto cru do iroh por português com dica, mantendo o erro original entre parênteses:
     - "No addressing information available" → "Este PC não sabe onde o Mac está. Ligue 'Internet' nos dois computadores (ou coloque os dois na mesma rede) e tente Reconectar. (No addressing information available)"
     - timeout → "O outro computador não respondeu: o Open Assistant está aberto nele? O firewall libera o app?"
   - Mesma função `dica_conexao(erro, internet)` do Mac (`NetworkSidecar/src/network/node.rs`).

5. LOG DA REDE LEGÍVEL POR IA (mesmo esquema do Mac)
   - Arquivo `rede\log.jsonl` (gira em 2 MB → `log.1.jsonl`). Uma linha JSON por evento:
     `{"ts": <ms desde 1970>, "level": "info"|"warn"|"error", "event": "<nome>", ...campos}`
   - Eventos (mesmos nomes do Mac):
     - `rede_iniciada` {id, porta, portaFixa, internet, mdns, pareados}
     - `pareado_online` {id, nome} — só quando muda de estado
     - `pareado_sem_resposta` {id, nome, erro, enderecosTentados, internet, dica} — quando muda de estado ou no botão Reconectar
     - `comando` / `comando_falhou` {comando, deviceId, erro}
     - `tarefa_recebida` {de, deId, taskId, precisaConfirmar, tarefa (≤300 chars)}
     - `tarefa_concluida` {taskId, ok, resposta|erro}
     - `chat_remoto_falhou` {deviceId, modelo, erro}
     - `conexao_recebida_falhou` {de, erro}
   - NUNCA grave conteúdo de chat, chaves, senhas ou tokens.
   - Continue também no `logs.rs` geral (source "rede") para aparecer em Configurações › Logs.

6. ESTADO PARA DIAGNÓSTICO
   - A cada 5 s grave `rede\estado.json`: {atualizadoEm, este, porta, internet, visivel, dispositivos (com lastSeen e addrs), problemasRecentes (últimos 15 warn/error), arquivos (caminhos)}.
   - Menu "+ › Copiar relatório para IA": estado.json + últimas 80 linhas do log em Markdown na área de transferência. "+ › Abrir logs da rede" abre a pasta no Explorer.

7. MCP DA REDE (para uma IA ler e gravar)
   - Servidor de controle local: named pipe `\\.\pipe\open-assistant-rede-<usuário>` (só o usuário atual; ACL do dono) aceitando os MESMOS comandos JSONL internos (`{"id","command",...}` → `{"id","ok","result"|"error"}`): `diagnostico`, `devices`, `log` {limit, problemsOnly}, `reconnect` {deviceId?}, `currentCode`, `setInternet` {enabled}, `agent` {deviceId, requestId, task}.
   - Modo MCP stdio: `Open Assistant.exe --mcp-rede` (ou binário pequeno `open-assistant-rede-mcp.exe`), JSON-RPC 2.0 uma mensagem por linha: `initialize`, `ping`, `tools/list`, `tools/call`. Ferramentas com os MESMOS nomes do Mac:
     `rede_diagnostico`, `rede_log` {limite, soProblemas}, `rede_dispositivos`, `rede_reconectar` {deviceId?}, `rede_codigo`, `rede_internet` {ligar}, `rede_tarefa` {deviceId, tarefa}.
     Com o app fechado, `rede_diagnostico`/`rede_log`/`rede_dispositivos` leem `estado.json` e `log.jsonl` do disco.
   - Referência pronta: `NetworkSidecar/src/mcp.rs` do app Mac.
   - Documente em Configurações › Integrações: `claude mcp add open-assistant-rede -- "C:\...\Open Assistant.exe" --mcp-rede`.

## Testes de aceite

Automáticos (node.rs):
- porta salva é reutilizada ao reiniciar o nó; porta ocupada cai para outra e regrava porta.json;
- dois nós pareados; B limpa `seen` (simula reabrir) e `reconnect(A)` funciona só com `addrs` salvos;
- pareado antigo com `addrs: []` e Internet desligada → erro traduzido com dica;
- log.jsonl recebe `pareado_sem_resposta` uma vez (não a cada 10 s) e `pareado_online` ao voltar;
- MCP: `tools/list` lista as 7 ferramentas; `rede_diagnostico` com o app fechado devolve `servicoRodando:false` + estado salvo.

Com o Mac real (build atual do Assistente pessoal, porta fixa, Internet ligada):
1. Ligar Internet no PC → sem reabrir, o Mac aparece online em até 20 s.
2. Fechar e abrir o Mac → o PC reconecta sozinho (log: `pareado_online`).
3. Fechar e abrir o PC → o PC acha o Mac pelos `addrs` salvos (porta do Mac é fixa) e o Mac acha o PC pelo relay.
4. Botão Reconectar num computador offline → online, ou erro em português com dica.
5. Pelo MCP: `rede_reconectar` e `rede_tarefa` "abra a Calculadora" no Mac funcionam.
```
