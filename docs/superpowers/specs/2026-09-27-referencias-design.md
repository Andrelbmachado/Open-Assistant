# Referências de design (ROADMAP §14)

Verificado em 2026-09-26/27.

| Site | É grátis? | O que é | Serve para o Open Assistant? |
|---|---|---|---|
| obsidianui.dev | Sim, código MIT | Biblioteca React + **Tailwind** com efeitos chamativos de cursor, scroll e hover para sites de vitrine | Pouco. O app não usa Tailwind, e o estilo (efeitos de landing page) não combina com um app de trabalho. Nada adotado. |
| bencho.dev | Sim, blocos MIT (o site, o nome e as fotos não); copiar o código pede conta grátis | Blocos interativos pequenos: *Action node*, *Canvas toolbar*, *Command bar*, *Inline confirm*, *Slide to confirm*, *Progress ticks*, *Notify*, *Radial menu* | Sim, como ideia de comportamento. Reimplementar no visual do app (tokens do `DESIGN.md`) em vez de colar o código: mantém o estilo único e evita dependências. |
| designspells.com | Sim (só pede e-mail para a newsletter) | Galeria de "detalhes que parecem mágica" em apps de verdade (animações, easter eggs, microinterações) | Sim, como inspiração. Não tem código para copiar. |

## Ideias escolhidas (por tela)

1. **Rede (§15)**: *linha que flui* entre dois computadores enquanto um pede resposta ao outro (inspirado nos detalhes de movimento da Design Spells; mesma animação `connection-dash` das ligações do Node Editor). **Feito em 2026-09-27.**
2. **Node Editor (§11)**: node que "acende" em sequência já existe (rastro do sistema). Próximo passo: *Progress ticks* (bencho) no painel de execução, com um traço por node concluído.
3. **Chat / agente**: *Inline confirm* (bencho). A confirmação de ação perigosa do agente aparece dentro da própria mensagem ("Confirmar · Cancelar"), sem janela modal. Avaliar junto com a fase 2 da rede, onde o PC controlado precisa confirmar pedidos remotos.
4. **Paleta de nodes**: *Command bar* (bencho). Busca com atalho de teclado (Ctrl+K dentro do canvas) e setas para escolher, reaproveitando o menu atual.

## Regras
- Não copiar fotos, nomes, marcas nem trechos do site. Se algum bloco MIT for colado no futuro, manter o aviso de copyright MIT num comentário no arquivo.
- Tudo com os tokens de cor e fonte do app (`var(--action)`, `var(--card)`, `--fs-body`…).
