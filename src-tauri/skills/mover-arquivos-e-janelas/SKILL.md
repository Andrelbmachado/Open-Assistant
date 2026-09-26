---
name: mover-arquivos-e-janelas
description: O robô anda pela tela, pega arquivos, pastas e atalhos da área de trabalho e janelas de qualquer programa e os leva para outro lugar (A → B) — de frente para o usuário ao pegar e soltar, de lado enquanto anda, na velocidade escolhida pelo usuário, com o mouse virtual (sem mexer no mouse do usuário e sem adivinhar pixels em prints). Use quando o usuário disser "mova", "leve", "arraste", "coloque", "pegue", "anda com", "organize as janelas", "joga pra direita", "abre a pasta X da área de trabalho".
---

# Mover arquivos e janelas (mouse virtual do robô)

O robô **não usa o mouse do usuário** e **não precisa de print** para pegar coisas. O app pergunta ao
Windows onde cada item está (nome exato + retângulo) e move o próprio item; o robô encena por cima: anda
até lá, gira de frente para o usuário, pega com as duas mãos, gira de lado, anda carregando, gira de frente
e solta. Por isso acerta de primeira — inclusive a barra de título do Chrome e do Explorador com abas.

## Faça assim (3 passos, nesta ordem)

1. **Descubra o nome exato** se não tiver certeza: `list_windows {"desktop": true}` (janelas e ícones, cada um
   com a zona onde está). Não precisa quando o usuário já disse o nome certinho.
2. **Escolha o lugar em palavras** pela tabela de `posicoes_na_tela.md` (resumo abaixo).
3. **Uma chamada só:** `move_file` (ícone/pasta/arquivo da área de trabalho) ou `move_window` (janela de
   programa). Espere a resposta; ela já diz onde o item ficou. Não chame nada de movimento no meio.

## Lugares (`place`) — mapa 3 × 3 da tela

```
cima esquerda  | cima centro  | cima direita
meio esquerda  | centro       | meio direita
baixo esquerda | baixo centro | baixo direita
```

Também valem: `direita`, `esquerda`, `cima`, `baixo` (um eixo só), `outro lado`, `zona 1`…`zona 9`,
`"70% 30%"` (largura, altura), `"um pouco para cima"`, `"bem para a esquerda"`, `"200 px para a direita"`,
`"ao lado de <nome>"`, `"embaixo de <nome>"`. Janelas: `direita`/`esquerda` = metade da tela, `maximizar`,
`outro monitor`. Tabela completa e exemplos de frases: `read_skill_file {"path":"references/posicoes_na_tela.md"}`.

## Ferramentas

| Ferramenta | Para quê | Exemplo |
|---|---|---|
| `list_windows` | monitores, janelas (posição, tamanho, zona); `desktop: true` inclui os ícones com zona | `list_windows {"desktop": true}` |
| `desktop_items` | só os nomes exatos e centros dos ícones da área de trabalho | `desktop_items {}` |
| `move_file` | leva um ícone/pasta/arquivo da área de trabalho | `move_file {"name": "Nova pasta", "place": "cima direita"}` |
| `move_file` + `into` | guarda o item dentro de uma pasta da área de trabalho | `move_file {"name": "foto.png", "into": "Fotos"}` |
| `move_window` | leva uma janela; `direita`/`esquerda` encaixa em metade da tela | `move_window {"query": "chrome", "place": "direita"}` |
| `open_file` | abre um item da área de trabalho (clique duplo virtual) | `open_file {"name": "relatorio.pdf"}` |
| `focus_window` | traz uma janela para frente | `focus_window {"query": "bloco de notas"}` |

Opcionais em `move_file`/`move_window` (só se o usuário pedir): `speed` = `devagar` | `normal` | `rapido`
(padrão: o que o usuário escolheu em **+ › Velocidade do robô**) e `path` = `reto` (padrão: `natural`,
uma curva leve como uma pessoa andando).

## Receitas (copie)

1. **"Mova a Nova pasta para o canto de cima à direita"** → `move_file {"name":"Nova pasta","place":"cima direita"}`.
2. **"Leva a pasta teste para o outro lado da tela, devagar"** → `move_file {"name":"teste","place":"outro lado","speed":"devagar"}`.
3. **"Coloca a pasta fotos ao lado da Lixeira"** → `move_file {"name":"fotos","place":"ao lado de Lixeira"}`.
4. **"Sobe um pouco o ícone do Chrome"** → `move_file {"name":"Google Chrome","place":"um pouco para cima"}`.
5. **"Coloca o Chrome na direita e o Bloco de notas na esquerda"** →
   `move_window {"query":"chrome","place":"direita"}` → `move_window {"query":"bloco de notas","place":"esquerda"}`.
6. **"Joga essa janela para o outro monitor"** → `list_windows` (a primeira é a da frente) → `move_window {"query":"<título>","place":"outro monitor"}`.
7. **"Põe a calculadora no meio da tela"** → `move_window {"query":"calculadora","place":"centro"}`.
8. **"Guarda o foto.png na pasta Fotos"** → `move_file {"name":"foto.png","into":"Fotos"}`.
9. **"Abre a pasta arquivos da área de trabalho"** → `open_file {"name":"arquivos"}`.
10. **"Cria uma pasta X e coloca no canto"** → `run_intent {"id":"new_folder","slots":{"path":"X"}}` (vai para a
    área de trabalho) → `move_file {"name":"X","place":"baixo direita"}`.

## Regras

- **Nunca** use `look` + `drag`/`click` para mover janela ou ícone: use `move_window`/`move_file`.
- Pasta ou arquivo da área de trabalho **não é janela**: `move_file`. Janela de programa: `move_window`.
- Uma chamada de movimento por vez; espere a resposta antes da próxima.
- Se `move_file` disser que a área de trabalho organiza os ícones automaticamente, explique ao usuário como
  desligar (botão direito na área de trabalho › Exibir › "Organizar ícones automaticamente").
- Nome parecido com vários itens? Pergunte com `ask_user` citando os nomes.
- Detalhes do movimento (girar de frente/de lado/de costas, tempos, onde segura a janela): `references/movimento_robo.md`.
