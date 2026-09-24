# Modelos locais, provedores e controles limpos do workspace

## Objetivo

Dar visibilidade honesta às operações locais de IA, permitir a administração de
provedores e remover ruído dos controles de chat e workspace. A versão QA
continua isolada: não executa processos, não abre rede, não solicita microfone
nem lê ou grava credenciais reais.

## Modelos locais

### Scan

`Escanear computador` passa por `idle → scanning → ready | failed`. Durante
`scanning`, a tela bloqueia apenas o botão do scan e mostra o texto
“Escaneando computador…”. Ao concluir, exibe em cartões:

- GPU, fabricante, VRAM e driver;
- CPU;
- RAM total;
- disco livre;
- alertas de inventário.

O cartão do modelo recomendado explica os requisitos mínimos de VRAM, RAM e
disco, o valor detectado para cada um e a decisão final. O resultado é
determinístico: a maior variante Qwen3.5 que mantém as margens já definidas.

### Download e instalação

`LocalModelOperation` transporta identificação, etapa, estado, progresso,
mensagem, modelo, velocidade estimada e tempo restante estimado. O backend lê
as linhas emitidas pelo processo `ollama pull` enquanto ele está em execução e
emite eventos intermediários. O frontend mostra uma barra, percentual, etapa,
tamanho previsto e telemetria estimada enquanto houver informação suficiente.

Estados: `running`, `paused`, `cancelled`, `failed`, `completed`. Em telas de
download, `Cancelar` encerra a operação. `Pausar` encerra a execução de modo
seguro e mantém a intenção de retomada; `Retomar` dispara um novo `ollama pull`
para o mesmo modelo. Ollama reaproveita as camadas que já possui, mas a tela não
promete uma pausa nativa nem uma retomada byte a byte, pois esse protocolo não
é exposto pelo CLI.

O instalador do Ollama continua exigindo confirmação explícita. O download do
modelo também exige confirmação explícita. Nenhuma ação de instalação ou rede
ocorre no modo QA: a operação simulada percorre etapas determinísticas e pode
ser cancelada/retomada visualmente.

## Provedores de IA

Um `ProviderConfig` contém `id`, `name`, `kind`, `baseUrl`, `defaultModel` e
`enabled`; segredos não são colocados nele. A chave fica no Gerenciador de
Credenciais do Windows sob uma conta estável derivada de `id`; no QA ela fica
apenas na memória.

A tela Provedores oferece lista de itens, Adicionar, Editar e Excluir. Os
provedores internos mantêm suas rotas já suportadas. Um provedor personalizado
é do tipo compatível com OpenAI e pede URL base e modelo padrão; passa a poder
ser selecionado e usado pelo Chat. Excluir um provedor personalizado pede
confirmação e exclui sua configuração e credencial correspondente; itens
internos só podem ser desativados, nunca removidos.

## Chat e workspace

- O botão de projeto do composer tem somente ícone de pasta e nome; não tem
  seta. Clique, Enter e Espaço abrem o seletor.
- O seletor de visualização de cada área é um botão somente com o ícone da
  tela ativa. Abre o menu ao hover, preserva clique e teclado para
  acessibilidade, e não usa a seta.
- Cada canto de divisão é individualmente revelado apenas no hover ou foco
  daquele canto. Os outros três permanecem invisíveis.
- A escolha de skin orbital sai do Chat e vai para Configurações → Aparência.
  A seleção continua persistida e acessível.

## Falhas e acessibilidade

- Todo botão em progresso inclui texto de estado e `aria-live` para etapas
  relevantes.
- Falhas de scan, instalação ou pull preservam o resultado de hardware e
  exibem uma mensagem recuperável; mensagens de processo são sanitizadas para
  não expor dados de credenciais.
- O chat continua funcional se eventos de progresso ou canvas não estiverem
  disponíveis.

## Testes

- Unitários para a normalização de eventos de operação, estimativa de tempo,
  regras de pause/cancel/resume e explicação da recomendação.
- Backend para streaming de linhas, cancelamento e operação QA sem processo.
- Frontend para scan, barra de progresso, cancelamento/retomada, CRUD de
  provedor, controles de projeto/área e orbital nas configurações.
- QA manual no executável isolado para scan simulado, download simulado,
  cancelamento, retomada, CRUD simulado e hover de controles.
