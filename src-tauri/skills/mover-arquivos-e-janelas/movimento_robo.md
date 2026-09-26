# movimento_robo.md — como o robô carrega coisas pela tela

**Regra de ouro:** UMA chamada de `move_file`/`move_window` = a coreografia inteira (andar, virar, pegar,
carregar, soltar). Não encene passo a passo, não use `look`/`drag`/`click` para mover. Espere o resultado.
Código: `src-tauri/src/choreo.rs` (tempos) e `src/components/AgentCursor.tsx` (desenho).

## Qual ferramenta

| Pedido | Chamada |
|---|---|
| mover ícone/pasta/arquivo da área de trabalho | `move_file {"name":"<nome>","place":"cima direita"}` |
| guardar arquivo dentro de uma pasta da área de trabalho | `move_file {"name":"<arquivo>","into":"<pasta>"}` |
| mover janela de programa | `move_window {"query":"<título ou app>","place":"direita"}` |
| só mostrar ("é este?") | nada: o app aponta sozinho antes de pedir confirmação |

Lugares (`place`): veja `posicoes_na_tela.md` (9 zonas, "outro lado", "70% 30%", "um pouco para cima",
"ao lado de X"). Nome incerto → `list_windows {"desktop": true}` antes. Vários parecidos → `ask_user`.

## Velocidade e caminho (opcionais)

| Parâmetro | Valores | Padrão |
|---|---|---|
| `speed` | `bem devagar`, `devagar`, `normal`, `rapido`, `muito rapido` ou px/s (60–900) | a do usuário (menu **+ › Velocidade do robô**) |
| `path` | `natural` (curva leve e um balanço mínimo, como uma pessoa andando) ou `reto` (linha reta) | `natural` |

Só passe `speed`/`path` se o usuário pedir ("leva devagar", "em linha reta"). A curva natural é pequena
(no máximo ~34 px de desvio) e começa/termina exatamente no objeto e no destino.

## Para onde o robô olha

| Vista | Quando |
|---|---|
| **de lado** (virado para onde anda) | andando para a esquerda ou para a direita |
| **de costas** | andando para cima da tela ("entrando" na tela) |
| **de frente** (para o usuário) | andando para baixo; e SEMPRE ao pegar e ao soltar |

Ao chegar ao objeto ele **gira de frente** para o usuário, pega, **gira de lado** para o destino, anda, e ao
chegar **gira de frente de novo** para soltar.

## Estados (sempre nesta ordem)

| # | estado | o que se vê | ms (velocidade normal) |
|---|---|---|---|
| 1 | approach | anda de mãos vazias até em cima do objeto (de lado/costas/frente) | distância ÷ velocidade |
| 2 | face | gira e fica de frente para o usuário | 420 |
| 3 | crouch | abaixa o corpo | 300 |
| 4 | reach | estica o braço, mãos abertas para baixo | 340 |
| 5 | grab | fecha as mãos na borda de cima do objeto | 260 |
| 6 | lift | recolhe o braço; o objeto sobe junto | 380 |
| 7 | turn | levanta e gira de lado para o destino | 460 |
| 8 | carry | anda carregando: acelera, anda constante, freia sem tranco; o corpo sobe e desce a cada passo | distância ÷ velocidade |
| 9 | arrive | gira de frente para o usuário, ainda segurando | 420 |
| 10 | lower | abaixa o corpo segurando | 320 |
| 11 | extend | estica o braço; o objeto desce ao lugar | 340 |
| 12 | release | abre as mãos e solta (guardar na pasta acontece aqui) | 300 |
| 13 | rise | recolhe o braço e sobe, deixando o objeto à vista | 460 |

Gestos ficam até 1,7× mais calmos quando a velocidade escolhida é baixa. Carregar algo por 1.400 px
(uma tela Full HD) leva ~12 s andando em "Devagar" e ~8 s em "Normal", mais 4–6 s de gestos.

## Janelas: onde segurar

O robô segura a janela onde uma pessoa seguraria: num **trecho livre da barra de título** — nunca num botão
(fechar, maximizar, minimizar), aba, campo de busca ou menu. O app pergunta ao próprio programa ponto a ponto
(`WM_NCHITTEST`) e, em barras desenhadas pelo programa (Explorador com abas, apps em WebView), procura os
botões/abas pelo UI Automation e segura no maior vão entre eles. A resposta diz onde segurou.

## Medidas (fração do tamanho do robô, 128 px)
braço recolhido 0,37 · braço esticado +0,20 · agachar 0,12 · subir no fim 0,35 · corpo atrás do objeto
andando de lado 0,14 · passo 46 px com 3 px de sobe-e-desce.

## Erros comuns (resposta da ferramenta → o que fazer)
- "Organizar ícones automaticamente" → explique como desligar (botão direito › Exibir). `into` funciona mesmo assim.
- "Já existe … dentro de …" → pergunte outro nome; nunca sobrescreva.
- "Não há … na área de trabalho" → a própria mensagem lista os nomes; use um deles.
- "Nenhuma janela com …" → se for pasta/ícone, use `move_file` (o app já tenta sozinho).
- "Interrompido: o mouse foi levado ao canto…" → o usuário parou o robô; pergunte antes de tentar de novo.
