# Input confirmado — mobile-toque-chat-e-layout

Fonte da verdade. Não há issue tracker; o desenvolvedor confirmou este conteúdo em 21/08/2026.

## Descrição original do desenvolvedor

> controles de toque sem equivalente no celular: o HUD mostra dicas de tecla Q/E/Tab nos botões e
> a mensagem de abertura manda usar 1-4, Q/E e Enter, teclas que não existem no telefone; o chat
> só abre pelo keydown de Enter (js/main.js:574), sem botão nem gesto, então quem joga no celular
> não consegue falar num co-op de até 10; a mochila em 360x640 gasta quase o painel inteiro com os
> seis campos de equipamento e empurra a grade de itens para baixo da dobra; e o log ocupa o canto
> inferior esquerdo, dentro da metade reservada ao joystick, com quatro linhas de texto sobre a
> área de jogo. Achados olhando o build em produção com emulação de iPhone 390x844 e Android
> 360x640.

## Summary

Dar equivalente de toque ao que hoje só existe no teclado e reorganizar mochila e log no celular.

## Acceptance criteria (confirmados, as seis juntas)

1. Em `pointer: coarse`, nenhum `.slot .key` fica visível (hoje mostram `Q`, `E`, `Tab` —
   `index.html:162-164`, regra em `styles.css:280` sem override de toque).
2. Em `pointer: coarse`, a mensagem de abertura não contém `1–4`, `Q/E`, `Tab` nem `Enter`, e o
   texto exibido difere do de teclado (hoje é fixo em `js/main.js:270`).
3. Em `pointer: coarse` existe alvo visível de no mínimo 44x44 que abre o chat, e um **toque real**
   nele — não `.click()` programático — faz o campo de chat aparecer. Hoje `openChat()` só é
   alcançável pelo `keydown` de Enter (`js/main.js:574`), sem botão nem gesto.
4. Em 360x640, com a mochila aberta, ao menos uma linha completa da grade de itens fica visível
   sem rolar dentro do painel.
5. Em `pointer: coarse` o `#log` fica em no máximo 2 linhas e não passa de 12vh de altura (hoje
   18vh e 4 linhas na tela medida).
6. Sem regressão: `npm test`, `tests/browser.mjs` e `tests/multipeer.mjs` seguem verdes.

## Alvos de tela confirmados

Os mesmos da feature anterior: 390x844 (deviceScaleFactor 2, isMobile, hasTouch) e 360x640.

## Contexto que o desenvolvedor não citou mas existe no repo

- `.spec/init/design/chat-grupo.md` — spec de design do chat de grupo. A AC 3 deve honrá-la em vez
  de inventar UI nova.
- `.spec/init/design/hud-grupo-mobile.md` §1 — mapa de ocupação da tela em toque; o canto inferior
  esquerdo é declarado ali como área do `#log` (50vw x 18vh), então a AC 5 muda uma decisão de
  design já registrada e essa spec precisa ser atualizada junto.
- `.spec/init/design/tokens-componentes.md:151` — alvo de toque de 44x44.
- Infra pronta pela feature `mobile-hud-menus-inventario` (já em produção): `tests/mobile-helpers.mjs`
  com `rect`/`intersects`/`interactiveTargets`; viewport mobile nos dois harness; constantes
  `TOUCH_STICK_*` em `js/balance.js`; `ALVO_MIN` de 44 já medido nos dois.
- A AC 3 é a maior de longe — é UI nova, não ajuste de CSS. As outras cinco são pequenas. O
  desenvolvedor optou por manter tudo numa feature só, ciente disso.
- A AC 5 é a mais frágil: o número (2 linhas, 12vh) foi cravado pelo router para ter critério
  binário, sem medição por trás. É candidata a reescrita na etapa de clarificação.
