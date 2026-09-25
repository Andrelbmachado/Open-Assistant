# Design QA — Chat compositor refinado

## Alvos de comparação

- Fontes visuais: `C:\Users\andre\AppData\Local\Temp\codex-clipboard-50cea6d5-9a29-4493-a7d3-02d38e896fa6.png` (Codex para Windows) e `C:\Users\andre\Downloads\WhatsApp Image 2026-09-24 at 03.40.25.jpeg` (1280 × 720 px, referência de chat ocioso).
- Implementação: `http://127.0.0.1:1421/`, capturada no navegador interno em 24/09/2026, 1280 × 720 CSS px; captura transitória emitida no registro desta QA.
- Estado comparado: tema escuro, conversa já iniciada, orbital ociosa, modelo local QA selecionado. A referência é a versão macOS sem navegação persistente; a barra lateral e controles nativos Windows foram avaliados como diferenças intencionais.

## Comparação visual

### Fontes e tipografia

O produto usa `Aptos Display`/`Segoe UI Variable`/fallbacks do sistema, com escala base 120%, pesos regulares e semibold mais contidos. A escala dá prioridade ao texto de conversa e reduz o ruído de rótulos secundários. Sem P0/P1/P2.

### Espaçamento e ritmo

O compositor recebeu altura de 80 px para o campo, cantos de 17 px, controles alinhados na mesma linha e margem horizontal de 5% por área. Em 1280 × 720 ele preserva uma área ampla de escrita mesmo quando o workspace está dividido. Em 1040 × 680 mantém mais de 30 px de respiro e não perde controles persistentes. Sem P0/P1/P2 após a redução das margens percentuais.

### Cores e tokens

As superfícies usam um navy quase preto inspirado no Codex (`#171923`/`#1c1f2b`) e bordas de baixo contraste. Azul (`#0A84FF`) está limitado ao envio/voz e à sinalização local; a orbital mantém seu próprio azul. O estado local exibe `∞` e não finge um saldo de nuvem. Sem P0/P1/P2.

### Imagens, ícones e marca

A orbital existente e a marca raster são preservadas. Ícones funcionais vêm da biblioteca já instalada; não foram introduzidos placeholders ou ilustrações artificiais. Sem P0/P1/P2.

### Conteúdo e affordances

O compositor visível tem somente: botão `+`, seletor de projeto, anel de IA e ação voz/enviar. Modelo, acesso e anexos permanecem disponíveis no menu `+`. Ao digitar, voz se torna Enviar; com modelo local o anel explica `Ilimitado` e a última estimativa de tokens/s. O menu inclui o slider acessível de nível de acesso ao computador, iniciado em `Total`. Sem P0/P1/P2.

## Interações verificadas

- menu `+`: modelo, acesso, documento e foto;
- slider de acesso: padrão `Total`, com rótulo dinâmico `Total`/`Limitado`/`Somente leitura`;
- busca e seleção/criação de projeto;
- popovers mutuamente exclusivos e fecháveis com Escape;
- alternância imediata voz → Enviar ao digitar;
- resposta simulada QA e atualização para `28 tok/s · rápido`;
- seleção de modelo local e anel `Ilimitado`;
- ciclo de voz QA (`Ouvindo…` → resposta simulada → ociosa), sem permissão de microfone;
- Configurações abertas no QA sem erros de console.

## Histórico

1. Encontrado: margem de 10% estreitava excessivamente a barra com o workspace dividido (P2). Corrigido para 5%; recapturado em 1280 × 720.
2. Encontrado: o listener de eventos Tauri era criado na prévia QA do navegador (P2). Corrigido com guarda QA; sessão nova e Configurações verificadas sem erros no console.
3. Encontrado: popovers independentes podiam sobrepor-se e o nível de acesso não existia (P2). Corrigido com estado único de popover, slider acessível e retorno explícito a `Sem projeto`.

## Resultado

final result: passed
