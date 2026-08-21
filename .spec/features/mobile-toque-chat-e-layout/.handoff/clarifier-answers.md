# Respostas do desenvolvedor — 21/08/2026

Confirmadas via checkpoint do router. Vinculantes.

## Q-01 — teto do `#log`: `LOG_MAX_LINES = 6`

Uma primitiva só, exportada de `js/balance.js`. 6 linhas = 95,7px = 11,3vh em 844 e 15,0vh em 640.
O valor em vh é **consequência medida**, nunca segundo portão independente: encolhe cerca de 37%
da área pintada de hoje em 390x844 sem cair abaixo das 5–6 linhas que uma conversa de grupo
precisa. Some com o teto de 12vh do input, que nunca mordia.

Como isso contraria `chat-grupo.md` §6 ("8 linhas mantendo 50vw x 18vh" — que, medido, é
incompatível consigo mesmo em 360x640, onde 8 linhas inteiras dão 19,9vh contra as 18vh que a
mesma seção manda manter), a atualização dessa spec de design entra no escopo. Ver Q-09.

## Q-03 — botão de chat: célula livre da grade

`.slots.potions` é grade 2x2 com 3 filhos; a célula vaga de 48x48 fica em (330, 672) em 390x844 e
(300, 468) em 360x640. O `#actionBar` permanece 102x212. Rejeitada a leitura literal de
`chat-grupo.md` §6 ("abaixo do botão de mochila"), que criaria quarta linha, levaria a barra a
266px e colidiria com o `#minimap` nas alturas 380 e 360 que `ALTURAS_UI03` já visita. Reescrever
§6 para "ao lado do botão de mochila" faz parte do trabalho.

**Independentemente disso**, acrescentar a UI-01 a AC que falta: `rect('#actionBar').height` fixo
e `intersects(rect('#actionBar'), rect('#hudRight')) === false` nas 7 alturas de `ALTURAS_UI03`.
Sem ela, a UI-01 AC 4 continua sendo teste incapaz de falhar — em `pointer: coarse` a borda
direita do `#portalHold` é 264 contra 276 da esquerda da barra, então os dois nunca se cruzam em
390 de largura, com qualquer altura de barra.

## Q-04 — `#chatInput` pode ficar dentro da zona do joystick

Fica onde está, no canto inferior esquerdo, como `chat-grupo.md` §6 pede. Registrar como **AC
explícita** que a sobreposição é permitida enquanto `S.chatting` é verdadeiro, com o porquê: o
portão de zona vive no listener do `canvas` (`js/main.js:602`, teste em `:608`), então o campo
bloqueia apenas os pixels que cobre, e só enquanto o chat está aberto.

## Q-05 — mochila: duas ACs, valem juntas

- `rect('#equipCol').height <= 0.40 * rect('#bag').height` em 360x640. Hoje são 306px de 616
  (49,7%); o teto de 40% são 246px, devolvendo 60px à grade de itens.
- `#btnSell` inteiro dentro da caixa do painel com `scrollTop === 0`.

A AC 4 do input, que já passa no HEAD `2285154` desde `d26ab38`, permanece só como guarda de
não-regressão e sai da lista de requisitos que detectam defeito.

## Decisões técnicas do router (Q-02, Q-06, Q-07, Q-08, Q-09)

- **Q-02** — contagem de linha visível é **contenção por retângulo inteiro**. Corrigir o baseline
  do Context de 10/8 para **9/7** (151,9/15,95 = 9,52 e 115,2/15,95 = 7,22; os números antigos
  contavam a linha cortada no topo). O `mask-image` de `styles.css:253` fica **fora** da contagem,
  declarado explicitamente.
- **Q-06** — a feature não pode entregar abertura por toque sem fechamento por toque. Entra alvo
  de fechar de 44x44 junto ao campo, com AC de toque real: `page.touchscreen.tap()` leva
  `__SF.chatting` a `false` e devolve o campo ao estado oculto. Hoje `closeChat()` só sai do
  `keydown` de Escape (`js/main.js:571`) ou do envio, e celular não tem Escape — enviar vazio é
  descartado em silêncio por `chatGate.clean('')`.
- **Q-07** — acrescentar UI-02 AC 5: na altura 440 com largura 390, com o chat aberto por toque
  real, `rect('#chatInput')` é não-nulo, tem altura >= 44, cabe inteiro na viewport e não cruza o
  `#actionBar`. Declarar que a AC 2 só tem sentido quando `rect('#log')` é não-nulo — abaixo de
  460px o log some, e como `__M.rect` devolve `null` e `intersects` devolve `false` com operando
  nulo (`tests/mobile-helpers.mjs:88-92`), ela passaria vazia justamente em 440, 380 e 360.
- **Q-08** — acrescentar RF-02 AC 5 positiva: a string de toque precisa casar com lista de tokens
  obrigatórios tirada do que está de fato na tela (por exemplo `/joystick/i` mais referência ao
  `aria-label` do alvo de chat), em pt-BR conforme RNF-04, com a lista congelada no PLAN para
  harness e string não divergirem. Sem isso `"Boa sorte."` passa em todas as ACs atuais, que são
  todas negativas, e o botão novo fica sem canal de descoberta.
- **Q-09** — estender o Scope "In" aos **três** docs de design: `chat-grupo.md`,
  `hud-grupo-mobile.md` e `tokens-componentes.md` — este último crava em `:142` o mesmo
  "Log 50vw/18vh" que a UI-04 derruba, e só estava citado por causa do piso de 44x44. Registrar
  que o desenvolvedor aprova reverter as decisões de design gravadas, no mesmo commit do CSS.

## Menores, aplicar todas

- UI-01 AC 3 usa `=== 102` sobre float de `getBoundingClientRect()`. Trocar por
  `Math.abs(w - 102) < 0.5`, como `BARRA_LARGURA` já é derivado em `tests/mobile-helpers.mjs:58`.
- Registrar no texto que **RF-04 AC 1 e AC 2 nascem verdes de propósito**: o portão do joystick é
  listener do `canvas` (`js/main.js:602`) e o `#actionBar` é irmão do `#canvas`, não descendente,
  então toque em botão da barra nunca chega àquele handler. São guarda de não-regressão; só a AC 3
  (borda esquerda >= 259/244) pode falhar. Sem essa nota alguém "conserta" um teste que passa.
- `tokens-componentes.md:146` exige `max(12px, env(safe-area-inset-bottom))` em todo elemento
  ancorado na base, e o `#chatInput` está com `bottom: 12px` puro. Emulação reporta `env()` como 0,
  então nenhum harness pega — vai como linha do PLAN, não como AC.
- Alinhar o `maxLength = 120` do campo com `CHAT_MAX_LEN = 140`. `AGENTS.md:57` já proíbe o
  literal, e o caminho de toque está prestes a virar o principal.
