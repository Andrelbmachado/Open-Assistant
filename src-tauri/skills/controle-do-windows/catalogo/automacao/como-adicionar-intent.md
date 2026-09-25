# Como adicionar um intent novo

1. Escolha `id` curto em snake_case.
2. Acrescente no `runtime/intents.yaml` com aliases reais da sua boca.
3. Acrescente uma linha em `catalogo/INDEX.md`.
4. Se precisar de detalhe (pré-requisito, extração), crie `catalogo/<area>/<id>.md`.
5. Implemente o ramo no `scripts/windows/dispatch.ps1`.
6. Marque o id em `IMPLEMENTED` no `runtime/executor.py`.
7. Ponha 3 frases em `exemplos/frases.md`.
8. Teste: `python runtime/router.py "sua frase"`.

Não peça para o Qwen “descobrir” o comando. Cadastre.
