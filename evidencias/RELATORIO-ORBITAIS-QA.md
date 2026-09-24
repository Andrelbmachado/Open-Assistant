# QA offline — orbitais reativas

Data: 24/09/2026

## Ambiente

- Build Tauri QA com `VITE_QA_OFFLINE=true`.
- Nenhuma chave, runtime, Ollama, microfone ou rede externa foi utilizada.
- Validação automatizada: 21 testes unitários aprovados.

## Cenários verificados

| Cenário | Resultado |
| --- | --- |
| Tentáculos azuis em repouso | Aprovado: exibidos como padrão com estado `Pode falar`. |
| Esfera azul | Aprovado: seleção acessível e partículas próprias. |
| Átomo | Aprovado: seleção persistida após recarregar o app. |
| Escuta QA | Aprovado: estado `Ouvindo…` e sinal visual simulado, sem pedido de microfone. |
| Conversa por voz QA | Aprovado: `Ouvindo… → Falando… → Pode falar`; resposta veio do simulador offline. |
| Erro QA controlado | Aprovado: estado de erro vermelho seguido de recuperação segura. |
| Seletor acessível | Aprovado: três controles com `radiogroup`, rótulos e estado marcado. |
| Fala manual | Coberta pelo mesmo fluxo de síntese e botão de interrupção; síntese real exige suporte do WebView. |

## Evidências de código

- `src/utils/orbitalState.test.ts`: 6 testes de estados, skins e sinal QA.
- `src/utils/SpeechController.test.ts`: 2 testes de ciclo de vida e cancelamento de fala.
- Suíte completa: 21 testes aprovados.

## Observações

- O Canvas tenta WebGL2 primeiro e recorre a Canvas 2D quando necessário.
- Quando a síntese não fornece amplitude de saída, a visualização usa envelope determinístico sincronizado com a fala.
- O executável QA não solicita permissão de microfone: a escuta é simulada localmente.
