# DESIGN.md — padrões visuais do Open Assistant

Fonte da verdade do visual **como o app está hoje** (25/09/2026). Ao mudar a interface, siga este guia; se
uma mudança criar um padrão novo, atualize este arquivo no mesmo commit.

## Princípios
- **Moldura navy, conteúdo neutro.** Barra de título + barra lateral formam uma moldura única azul-marinho
  (`--frame`), sem linha entre elas. O chat é cinza monocromático (`--chat-bg`).
- **Cor só para ação e estado.** Azul (`--action`) aparece no botão de voz/enviar, sliders e foco. Vermelho
  rosado (`#e45d75`) marca gravação/fechar. Verde (`#30d158`) marca conexão ok. O resto é cinza.
- **Poucos controles visíveis.** O compositor mostra só `+`, projeto, uso de IA, ditado e voz/enviar;
  modelo, esforço, acesso e anexos ficam no menu `+`.
- **Ícones de traço (lucide-react).** Nada de emoji ou glifo de texto como ícone; tamanhos 12–17 px.
- **Português do Brasil** em todo texto, `title` e `aria-label`.

## Tokens (`src/refined.css` e `src/refresh.css`, `:root`)
| Token | Valor | Uso |
|---|---|---|
| `--frame` | `#1b1f2d` | Barra de título e barra lateral |
| `--bg` | `#171923` | Fundo geral |
| `--chat-bg` | `#1f1f1f` | Áreas de chat; compositor `#262626` |
| `--surface` / `-2` / `-3` | `#1c1f2b` / `#232634` / `#2c3040` | Cartões, menus, hover |
| `--border` / `--border-strong` | `rgba(255,255,255,.075)` / `.14` | Bordas de 1 px |
| `--text` / `--muted` / `--faint` | `#f4f4f5` / `#a1a1aa` / `#71717a` | Texto principal / secundário / terciário |
| `--action` / `--action-hover` | `#0a84ff` / `#3b9cff` | Ações primárias, sliders, foco |
| `--accent` | escolhido em Aparência (cinzas) | Detalhes neutros (ícone de Configurações) |
| Item ativo da barra lateral | fundo `#283047`, ícone `#9cc2ff` | Conversa/seção aberta |
| Configurações | superfícies `#1d1d1e` / `#2a2a2c` | Modal com cinza próprio |

Tema claro existe em `App.css` (`[data-theme="light"]`), mas o visual é desenhado e revisado no escuro.

## Tipografia
- Família: `"Aptos Display", "Segoe UI Variable", system-ui, sans-serif`; código em `Consolas, monospace`.
- **Todo `font-size` é `calc(Npx * var(--fs-<categoria>))`** — nunca `font-size: Npx` solto. As três
  categorias são controladas em Configurações › Aparência › Tamanho das fontes (80–140 %, passo 5 %),
  aplicadas na hora via variáveis em `<html>` (`src/utils/fontScale.ts`, estado `fontScale`):

| Variável | Categoria | Exemplos (px base) |
|---|---|---|
| `--fs-title` | Títulos | `h1–h3`, cabeçalhos de vista 16, título de Configurações 17, chat vazio 19 |
| `--fs-subtitle` | Subtítulos e rótulos | `small`, `label`, eyebrow 9, rótulos de seção 9.9, metadados, badges |
| `--fs-body` | Texto corrido | mensagens 13, compositor 15, menus/botões 11, barra lateral 12.1–13.2 |

- Barra lateral: 10 % maior que o resto (itens 12.1 px, seções principais 13.2 px, rótulos 9.9 px).
- Pesos: 400 texto, 600 destaque/ativo, 700 rótulos em caixa-alta (`letter-spacing: .07–.08em`).
- `style={{ fontSize }}` inline também usa `calc(... * var(--fs-*))`.

## Forma e espaçamento
- Raios: 7–9 px em botões e itens de lista, 10–12 px em cartões/menus, 17 px no compositor,
  20 px nas bolhas do usuário (`20 20 6 20`), 50 % em botões circulares, 99 px em pílulas.
- Alturas: itens da barra lateral 31–34 px, botões 30–32 px, botões circulares do compositor 32 px.
- Barra lateral: 252 px (218 px abaixo de 1120 px; 190 px abaixo de 760 px).
- Sombras discretas (`--shadow`); nada de brilho, exceto o logo orbital e o botão azul.

## Componentes
### Compositor (`ChatView`, classes `apple-composer*`)
- Esquerda: `+` (menu rápido) e **chip do projeto** (pasta + nome). Com projeto selecionado, o hover mostra
  um **“x” circular de 17 px no canto superior direito** do chip; clicar fecha o projeto (“Sem projeto”)
  sem abrir o menu.
- Direita, nesta ordem: **anel de uso** (26 px, borda 2 px; modelo local = azul `#69aafc` com ícone
  `Infinity` de 20 px preenchendo o círculo; QA = tracejado), **microfone de ditado** (32 px, transparente;
  gravando = rosado com pulso) e **voz/enviar** (32 px, azul, vira seta ao digitar e quadrado ao parar).
- Ditado (sem ondas no compositor; só a borda fica rosada) escreve o texto no campo **enquanto a pessoa fala** (transcrição parcial a cada ~0,3 s), sem enviar
  e sem abrir o modo voz; Esc cancela e devolve o campo como estava. Modo voz abre o rosto e conversa.
- Botão Parar (quadrado) encerra a resposta **na hora**: a mensagem fecha com o que já chegou, marcada
  "interrompida", e o chat fica livre para outra pergunta.
- Popovers do compositor são mutuamente exclusivos e fecham com Esc ou clique fora.

### Workspace (áreas estilo Blender, `Workspace.tsx`)
- Cada área tem alças invisíveis de 35 × 35 px nos quatro cantos; arrastar ≥ 24 px cria uma nova área
  com prévia translúcida do tamanho final. Mínimo de 50 px por área; divisor de 10 px; arrastar o divisor
  até < 50 px fecha a área.
- A área nova abre **no mesmo tipo** da original, mas nunca duplicada: chat novo = conversa nova e vazia
  (cada área de chat tem a sua conversa; escolher na barra lateral uma conversa já aberta em outra área
  leva o foco para aquela área). Terminal novo = sessão nova.
- Filhos de uma divisão são `position: absolute; inset: 0` dentro da fatia (necessário para divisões
  aninhadas terem altura definida).
- **Botão de trocar o tipo da área** no canto superior esquerdo, em `left: 36px` (logo à direita da alça do
  canto, para não disputar o clique); ao passar o mouse abre a fileira de ícones das vistas.

### Modo voz (rosto do assistente)
- O rosto flutua **solto na janela, sem fundo nem caixa** (`FloatingFace`, portal no `body`, 200 px):
  passeia devagar perto de onde foi deixado, balança mais quando fala e pode ser arrastado (posição salva).
  Abaixo dele, só uma pílula pequena com o estado ("Ouvindo…", "Falando…").
- Robô: boca abre bem ao falar, cabeça vira e inclina para os lados; bravo solta muitas partículas
  vermelhas, rápidas e aleatórias. Partículas somem antes da borda do quadro.
- Modo voz é **contínuo**: depois de cada resposta falada ele volta a ouvir, até a pessoa desligar
  (botão de voz vira quadrado "Desligar modo voz", "×" ao lado do estado do robô, Esc).
- Falar por cima do robô corta a fala e ele passa a ouvir. Trocar de conversa na mesma área encerra o
  modo voz e foca a conversa nova.
- Respostas faladas: curtas, sem Markdown, emojis ou rubricas ("*sorri*", "(risos)"); emojis nunca são
  lidos em voz alta. O app não usa emojis por padrão.

### Robô com mãos (RobotAvatar / RobotHands)
- Mãos em **matriz de LEDs** azul-esverdeados (`#5ff0dc → #1a8a96`, brilho suave), mesma linguagem do visor.
  Poses: `rest` (abertas), `grip` (dedos por cima de uma borda), `press` (aperta), `point` (indicador), `type`.
- Expressões fixas além das de fala: **Sorrindo** (boca em arco), **Quieto/Neutro** (sem boca), **Desconfiado**
  (traço com haste), **Surpreso** (olhos altos e boca "o" com partículas).
- **Robô-mouse do agente** (`AgentCursor`): a ponta do mouse é a **ponta do dedo indicador**. Ele vai apontando,
  pergunta "É este? <item>" quando o acesso pede confirmação, aperta o item com o dedo (clique) ou o pega com
  as duas mãos (arrastar — janela arrastada pela barra de título é o "cartaz" que ele segura) e solta sorrindo.
  Rótulo em pílula escura com borda azul-esverdeada ao lado do rosto. Janela transparente, fora dos prints.
- **Carregar algo** (ícone, pasta, janela) é sempre a mesma coreografia, em velocidade de dar para ver (~5 s):
  chega de lado → agacha (rosto achata um pouco) → estica o braço invisível com as mãos abertas para baixo →
  fecha as mãos na borda de cima → recolhe o braço (o objeto sobe) → levanta e vira para o destino →
  flutua em velocidade média (rosto balança de leve) e freia com um pequeno recuo → agacha → estica o braço
  (o objeto desce) → abre as mãos → sobe. Olha para o objeto ao pegar/soltar e para o destino ao viajar.
  Tempos em `skills/mover-arquivos-e-janelas/movimento_robo.md` (código: `choreo.rs`).
- O cartaz branco com texto aparece só na prévia de Configurações (demonstração do "segurar").

### Telas (Arquivos, Agentes, Painel, Marketplace, Nodes) — padrão do chat
- Fundo igual ao do chat (`--page-bg` = #1f1f1f), cartões #262626 com borda branca 7 %, raio 14 px.
- Cabeçalho `PageHeader`: 56 px, rótulo 10 px em caixa alta + título 15 px/600; ações à direita (botões
  `page-button` 32 px, raio 9; o azul `primary` só para a ação principal). Dentro de uma área o ícone do título
  some (o botão de trocar a área já mostra o ícone).
- Listas suspensas: **sempre** `Dropdown` (painel escuro, busca quando > 8 opções, check na escolhida), nunca
  `<select>` nativo. Menus: `.oa-menu` (busca no topo, rótulo de seção 10,5 px, item com ícone em quadradinho 28 px,
  título + descrição de até 2 linhas).
- Todo menu/popover fecha ao clicar fora ou Esc (`useDismiss`).
- Linhas entre áreas: 6 px escuros (#161618), sem borda; ao passar o mouse, fio azul.
- Editor de nodes: node = cartão 260 px, cabeçalho 38 px com ícone na cor da categoria, resumo 40 px, linhas de
  parâmetro 32 px (portas no centro da linha de Entrada/Saída: `PORT_TOP` = 95), interruptor no lugar de checkbox;
  barras flutuantes (Adicionar node/Frame e zoom) em pílula #262626.
- Arquivos: árvore como o Explorer do VS Code (setas, guias de recuo, ícone colorido por linguagem, marcas git
  M/U/D), prévia com números de linha; em área estreita a prévia ocupa a área com botão de voltar.

### Geração de imagem no chat
- Pedido por texto ("gere uma imagem de…") ou + › Gerar imagem (chip "Imagem · modelo" no compositor).
- Enquanto gera: prévia **quadrada preta com grade de pontinhos** e um **halo suave azul e violeta** — três
  manchas desfocadas que circulam as bordas devagar (9/12/15 s, easing suave), parecendo líquido; fase e passos,
  barra azul fina e Cancelar. Clicar na prévia abre a **cobrinha minimalista** (fundo preto, mini círculos nas
  casas, corpo de pontos azuis que afinam, cabeça maior e clara com olhos, maçã vermelha com folha; o desenho
  desliza entre os passos a 60 fps); quando a imagem fica pronta ela substitui o jogo na hora.
- Pronta: imagem com cantos de 14 px e sombra, legenda "modelo · tempo · semente" e "Abrir pasta".

### Slider de esforço
- Cinco níveis; no **Ultra** o preenchimento é animado e as marcas (pontos brancos) somem.
- Visuais (Configurações › Aparência › Slider de esforço): Plasma, Choque, Fogo, Água, Fumaça e Quadrados.
  Todos seguem o mesmo efeito: nascem presos ao botão, à direita, e são puxados para a esquerda perdendo
  força. Brilho externo e cor do rótulo "Ultra" acompanham o visual (`.skin-*`).

### Barra lateral
- Busca (Ctrl P) → seções fixas (Novo Chat, Agentes, Terminal, Marketplace) → Projetos (clique = tela Arquivos
  do projeto; + escolhe uma pasta) → Recentes (fixadas no topo com alfinete; "⋯" no hover: Fixar, Compartilhar
  › Copiar/Salvar .md, Excluir com confirmação) → rodapé do usuário (avatar, nome e ícone local/nuvem com linha de
  conexão; "Rodando neste computador" fica só na dica do ícone).
- Enquanto a IA pensa, o nome do modelo aparece numa pílula acima do "Pensando". A linha diz o que está
  acontecendo de verdade: ferramenta rodando → "Navegando na internet", "Executando ferramentas", "Acessando a
  base de dados", "Lendo arquivos"…; esperando você → "Aguardando sua confirmação"; depois de uma ferramenta →
  "Analisando o resultado"; só pensando → os verbos (Pensando, Matutando, Rachando a cuca…) trocando a cada 6 s.
- Item ligado no menu "+" (ex.: Gerar imagem): fundo azul 13 %, ícone azul e pílula "Ligado"; o chip "Imagem ·
  modelo" no compositor usa o mesmo azul.
- Texto do compositor vazio: "Pergunte o que quiser, é de graça..."
- Ações secundárias (criar projeto, nova conversa no projeto) aparecem só no hover.

### Modelos locais (Configurações)
- Topo: **barra do disco** dos modelos — ícone de HD, barra azul (usado mais claro, modelos em azul cheio),
  "X livres de Y" e botão **Mover para outro disco** (escolhe o disco em cartões com mini-barra; move texto
  e/ou imagem-e-voz sem baixar de novo).
- Seções: Instalados, Disponíveis, Incompatíveis (texto) e **Modelos de imagem** — cartão com selo de licença
  ("Uso comercial" verde / "Só uso pessoal" âmbar) e aviso "Pesado para este PC" quando falta RAM/VRAM.

### Configurações
- Modal com navegação à esquerda (ícone + rótulo + chevron) e cartões `setting-card` à direita.
- Aparência: tema, cor de destaque, rosto do assistente (as cinco opções dividem a largura do cartão),
  slider de esforço (visual + prévia ao vivo) e **tamanho das fontes** (três sliders com amostra ao vivo e
  botão “Padrão”).
- O menu do usuário (Configurações) é compacto: 30 px de altura, texto 11 px, largura do conteúdo.

## Movimento
- Transições de 120–180 ms em hover/abrir; nada acima de 300 ms fora do rosto do assistente.
- Respeitar `prefers-reduced-motion` (animações contínuas desligam).

## Onde mexer
Ordem de carga do CSS (`main.tsx`): `neutral → blender → workspace-fixes → refined → refresh`. Estilo novo
vai em `refresh.css`, em seção comentada; `App.css` é a base antiga minificada — evite editar.
