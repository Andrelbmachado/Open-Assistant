# posicoes_na_tela.md — mapa da tela para dizer "para onde" sem calcular pixels

**Regra de ouro:** diga o lugar em PALAVRAS no `place`. O app converte em pixels (código: `src-tauri/src/places.rs`).
Não some, não multiplique, não adivinhe pixels num print.

## 1. As 9 zonas (use estes nomes exatos)

A área útil de cada monitor (sem a barra de tarefas) é dividida em 3 × 3:

```
             esquerda            centro             direita
          ┌──────────────────┬──────────────────┬──────────────────┐
  cima    │ 1 cima esquerda  │ 2 cima centro    │ 3 cima direita   │
          ├──────────────────┼──────────────────┼──────────────────┤
  meio    │ 4 meio esquerda  │ 5 centro         │ 6 meio direita   │
          ├──────────────────┼──────────────────┼──────────────────┤
  baixo   │ 7 baixo esquerda │ 8 baixo centro   │ 9 baixo direita  │
          └──────────────────┴──────────────────┴──────────────────┘
```

- `place: "cima direita"` = canto de cima à direita (igual a `"zona 3"` e a `"canto superior direito"`).
- Uma direção só mexe um eixo: `"direita"` leva para a borda direita **na mesma altura**; `"cima"` sobe **na mesma coluna**.
- O objeto nunca fica colado na borda nem sai da tela: o app deixa uma margem sozinho.

## 2. Tabela: o usuário disse → `place`

| O usuário disse | `place` |
|---|---|
| "no canto de cima à direita", "lá em cima na direita", "superior direito" | `cima direita` |
| "embaixo à esquerda", "canto inferior esquerdo" | `baixo esquerda` |
| "no meio da tela", "no centro" | `centro` |
| "no meio lá de cima", "em cima no centro" | `cima centro` |
| "no meio do lado direito" | `meio direita` |
| "para a direita" (sem dizer altura) | `direita` |
| "mais para cima", "um pouco para cima" | `um pouco para cima` |
| "bem para a esquerda" | `bem para a esquerda` |
| "200 pixels para a direita" | `200 px para a direita` |
| "do outro lado da tela" | `outro lado` |
| "a 70 % da largura e 30 % da altura" | `70% 30%` |
| "ao lado da Lixeira", "perto da pasta Fotos" | `ao lado de Lixeira`, `perto de Fotos` |
| "embaixo da pasta Fotos", "acima do Chrome" | `embaixo de Fotos`, `acima de Chrome` |

Relativo: `um pouco` = 12 % da tela, `bem`/`muito` = 30 %, ou o número de `px` dito.
Porcentagem: o 1º número é da **largura** (0 % = esquerda, 100 % = direita), o 2º da **altura** (0 % = topo, 100 % = rodapé).

## 3. Onde as coisas estão agora

`list_windows {"desktop": true}` mostra cada janela e ícone com a zona e a porcentagem, por exemplo:

```
- "Nova pasta" @(358,420) zona 4 meio esquerda · 19% 41%
- "Bloco de notas" (Notepad) em (400,200) 900x600 — centro: zona 5 centro · 44% 48%
```

Use isso para responder "onde está X?" e para escolher um lugar livre ("coloque do outro lado" → a pasta está
na zona 4, o outro lado é a zona 6 → `place: "outro lado"` ou `"meio direita"`).

## 4. Janelas têm quatro lugares a mais

| `place` | resultado |
|---|---|
| `direita` / `esquerda` | encaixa na **metade** da tela (como Win + →) |
| `maximizar` | tela cheia |
| `outro monitor` | mesmo lugar, no próximo monitor |
| qualquer zona (`cima direita`, `centro`…) | o **centro** da janela vai para a zona, sem mudar o tamanho |

## 5. Ponto exato (só se o usuário der números)

- Ícone: `screen_x`/`screen_y` = centro do ícone em pixels da tela.
- Janela: `x`/`y` = novo canto superior esquerdo em pixels da tela.

## 6. Erros e o que fazer

| Resposta da ferramenta | Faça |
|---|---|
| "Lugar desconhecido: …" | troque por um nome da tabela da seção 2 |
| "Não achei "X" na área de trabalho nem nas janelas" (em `ao lado de X`) | `list_windows {"desktop": true}` e use o nome exato |
| "Organizar ícones automaticamente" | explique: botão direito na área de trabalho › Exibir › desmarcar |
