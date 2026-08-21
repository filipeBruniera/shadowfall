# Phases: mobile-toque-chat-e-layout

Gerado por /plan a partir de PLAN.md — view executável para `./ralph.sh .spec/features/mobile-toque-chat-e-layout/PHASES.md`.

Regra de gate das fases 1 a 5: a medição é escrita antes da implementação de propósito (CT-02 AC 6 exige que a saída reprove hoje nos cinco prefixos). Entre a fase 1 e a fase 5, `node tests/browser.mjs` e `node tests/multipeer.mjs` saem 1 por construção; o critério de cada fase é a ausência do prefixo daquela fase na saída, nunca o código de saída. `npm test` sai 0 em todas as fases. Só a fase 6 exige saída 0 nos três comandos. `npm run test:browser` precisa de `npm run dev` de pé e de `URL=http://localhost:5173`.

## Phase 1: Primitiva e medição vermelha

Antes de implementar, leia:
1. `.spec/features/mobile-toque-chat-e-layout/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-toque-chat-e-layout/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T01 — `LOG_MAX_LINES` em `js/balance.js`
      Arquivos: `js/balance.js`
      Mudança: acrescentar, depois do bloco `// ---------- Chat ----------` (`js/balance.js:215-219`), a seção `// ---------- Registro ----------` com `export const LOG_MAX_LINES = 6;` e comentário pt-BR de uma linha registrando a medição: 6 linhas = 95,7px com o `line-height` medido de 15,95px, ~37% menos área pintada em 390x844 que as 9 de hoje. É a única primitiva nova; a altura do `#log` é consequência medida dela, nunca uma segunda constante, e nenhum valor em `vh` entra aqui.
      Cobre: UI-04, RNF-03
      Acceptance criteria: `node -e "import('./js/balance.js').then(b => process.exit(b.LOG_MAX_LINES === 6 ? 0 : 1))"` sai 0; o identificador tem comentário pt-BR na mesma seção; nenhum outro export do arquivo muda; `npm test` sai 0.
      Testes: `npm test` — as 10 suítes continuam verdes com `js/balance.js` alterado
- [ ] T02 — Helpers compartilhados: constante, seletores e medidores
      Arquivos: `tests/mobile-helpers.mjs`
      Mudança: reexportar `LOG_MAX_LINES` e `CHAT_MAX_LEN` pelo `import * as balance` já existente (`tests/mobile-helpers.mjs:20`, namespace e não import nomeado, pelo motivo comentado no topo do arquivo); estender `errosDeConstante(prefixo)` com `LOG_MAX_LINES === 6` e `CHAT_MAX_LEN === 140` para a ausência virar erro medido em vez de `NaN` calado; exportar os seletores congelados `SEL_CHAT_ABRIR = '#btnChat'` e `SEL_CHAT_FECHAR = '#btnChatClose'` (CT-01 AC 2, nada de `nth-child` nem busca por texto); acrescentar em `installHelpers` dois medidores null-safe a `window.__M` — `centro(alvo)` devolvendo `{ x, y }` do centro do retângulo e `linhasContidas(sel, filhoSel)` contando filhos com retângulo inteiro dentro do pai (`top >= pai.top && bottom <= pai.bottom`), a régua de UI-04 AC 1. Comentários pt-BR explicando a contenção por retângulo inteiro e por que o `mask-image` de `styles.css:253` não participa da contagem.
      Cobre: CT-01, CT-02, UI-04, RNF-03
      Acceptance criteria: `node -e` importando `tests/mobile-helpers.mjs` expõe `LOG_MAX_LINES`, `CHAT_MAX_LEN`, `SEL_CHAT_ABRIR` e `SEL_CHAT_FECHAR`; `errosDeConstante('X')` devolve `[]` com o `js/balance.js` de T01; `__M.centro` e `__M.linhasContidas` devolvem `null`/`0` para seletor ausente sem lançar; os dois harness continuam saindo com o mesmo código de hoje (0), porque ainda não há caso novo.
      Testes: `URL=http://localhost:5173 npm run test:browser` e `npm run test:multipeer:quick` — ainda saem 0
- [ ] T03 — Casos `TECLA` e `ABERTURA` em `tests/browser.mjs`, mais a passagem de mouse
      Arquivos: `tests/browser.mjs`
      Mudança: `medirTeclas(page, ctx)` conta `document.querySelectorAll('.slot .key').length` (7 em qualquer modo) e quantos passam em `__M.visible` (0 no toque, 7 no mouse). `medirAbertura(page, ctx, modo)` lê o `innerText` do `#log` e o `<p>` da linha de abertura; assere as quatro regex negativas de RF-02 AC 1, a classe `system` no `<p>` (AC 4) e, no toque, a lista positiva de AC 5 — `/joystick/i` mais o `aria-label` lido em runtime de `document.querySelector(SEL_CHAT_ABRIR)`, sem literal do rótulo no teste — e guarda a string por modo num `Map` para a comparação estrita de AC 2. `abrirMouse()` abre uma aba em `VIEWPORT_DESKTOP` com `installHelpers`, entra em solo e serve RF-01 AC 3, RF-02 AC 3, UI-01 AC 6 e UI-04 AC 4 na mesma execução. Chamar `medirAbertura` imediatamente após `abrirToque(viewport)`, antes de qualquer caso que empurre linha no `#log`. UI-01 AC 6 no mouse: `__M.visible(SEL_CHAT_ABRIR) === false`, `display === 'none'` e `.slots.potions` com exatamente 3 `.slot` visíveis. Todo acesso null-safe: hoje `#btnChat` não existe e o caso precisa emitir erro medido em vez de estourar `TypeError`, que abortaria o arquivo e mataria os outros prefixos.
      Cobre: RF-01, RF-02, UI-01, UI-04, CT-01, CT-02, RNF-06
      Acceptance criteria: `node tests/browser.mjs` sai 1 com pelo menos um erro `TECLA` (7 visíveis em 390x844 e em 360x640) e um `ABERTURA` (mensagem de teclado medida no toque); nenhuma exceção aborta o arquivo — os demais casos existentes continuam rodando e imprimindo; nenhum `.click()`/`page.click()` novo; `npm test` sai 0.
      Testes: `URL=http://localhost:5173 npm run test:browser` — vermelho esperado, com os dois prefixos novos presentes
- [ ] T04 — Casos `CHAT` em `tests/browser.mjs` com toque real
      Arquivos: `tests/browser.mjs`
      Mudança: `medirChat(page, ctx)`, chamado depois de `medirMochila` (que já fecha o `#bag`) e antes de `medirLog`, com comentário pt-BR registrando a proibição de CT-02 AC 1 — `element.click()`, `page.click()` e `new MouseEvent('click')` são proibidos porque o clique programático já escondeu esta classe de defeito nesta casa (`styles.css:222-226`). Roteiro: (1) abrir com `__M.centro(SEL_CHAT_ABRIR)` + `elementFromPoint` + `page.touchscreen.tap()`, medindo alvo ≥ `ALVO_MIN`, `pointerEvents === 'auto'` e `left >= TOUCH_STICK_ZONE * innerWidth + TOUCH_STICK_RADIUS` lido dos exports; (2) estado — `#chatInput` visível e focado, `__SF.chatting === true`, `stick.active === false`, `moveGoal === null`, `#stick` com `hidden` (RF-04 AC 1 e AC 2 são guarda verde por construção, não "consertar"); (3) campo — altura ≥ 44, sem interseção com o `#log` com pré-condição `rect('#log') !== null` e pulo registrado quando nulo, caixa dentro da viewport, `maxLength === CHAT_MAX_LEN`; (4) alvo de fechar — ≥ 44x44, `pointerEvents auto`, dentro da viewport, sem cruzar o campo, hit test por `elementFromPoint`; (5) fechar — sentinela pt-BR digitada, `tap()` no ✕, `chatting === false`, campo oculto e desfocado, sentinela ausente do `#log`, ✕ invisível com o chat fechado; (6) reabrir — repete (2), `querySelectorAll('#chatInput').length === 1` e `value === ''`, fechando ao final; (7) UI-02 AC 6 com `touchStart`/`touchEnd` separados (nunca `tap()` completo: `endStick` está em `pointerup` no `window`, `js/main.js:644-649`) — com o chat aberto `stick.active === false` no centro do campo, e depois de fechar `true` na mesma coordenada; (8) na altura 440 do laço `ALTURAS_UI03`, abrir por toque e asserir campo não-nulo, ≥ 44, dentro da viewport e sem cruzar o `#actionBar`. Toda falha vira `errors.push('CHAT: ...')` com valor medido; todo acesso null-safe.
      Cobre: RF-03, RF-04, RF-05, UI-01, UI-02, UI-05, CT-01, CT-02, RNF-03
      Acceptance criteria: `node tests/browser.mjs` sai 1 com erros `CHAT` medidos contra o código de hoje — `elementFromPoint` na célula livre devolvendo `.slots potions`, `#btnChat` ausente, `#chatInput` 37px, interseção com o `#log` verdadeira, `maxLength` 120, alvo de fechar ausente; `grep -n "\.click()\|page\.click" tests/browser.mjs` não mostra nenhuma ocorrência dentro de `medirChat`; a página é devolvida com o chat fechado e `medirBarra`/`medirGeometria` seguem imprimindo suas medições.
      Testes: `URL=http://localhost:5173 npm run test:browser` — vermelho esperado no prefixo `CHAT`
- [ ] T05 — Casos `MOCHILA` e `LOG` em `tests/browser.mjs`
      Arquivos: `tests/browser.mjs`
      Mudança: em `medirMochila` (`tests/browser.mjs:321`), com o painel aberto e `bag.scrollTop = 0`, asserir apenas em 360x640 (em 390x844 a medida é impressa, não asserida) `rect('#equipCol').height <= 0.40 * rect('#bag').height` (UI-03 AC 3) e `#btnSell` não-nulo com `top >= bag.top && bottom <= bag.bottom` (AC 4); acrescentar a guarda de AC 1 sobre os 5 primeiros filhos de `#invGrid` (mesmo `top`, retângulo inteiro no painel) e a de AC 2 (`grid-template-columns` com 5 valores e `INV_SIZE` slots, já importado em `tests/browser.mjs:7`). A razão sai de dois `getBoundingClientRect()`, nunca do CSS (RNF-07). `medirLog(page, ctx)` empurra `LOG_MAX_LINES + 3` = 9 linhas curtas em pt-BR no `#log` (uma `<p class="system">` por linha, prepend como `UI.pushLog` faz), conta por `__M.linhasContidas('#log', 'p')` e assere `<= LOG_MAX_LINES` (AC 1) e `rect('#log').height <= LOG_MAX_LINES * parseFloat(getComputedStyle(log).lineHeight) + 1` (AC 2); quando `rect('#log') === null` (alturas 440, 380 e 360) pula com registro explícito no console, nunca em silêncio (AC 5). Chamar nos dois alvos cheios, dentro do laço `ALTURAS_UI03` e uma vez na aba de mouse de T03 (UI-04 AC 4). `medirLog` é o último caso do alvo, porque suja o `#log`.
      Cobre: UI-03, UI-04, CT-02, RNF-07
      Acceptance criteria: `node tests/browser.mjs` sai 1 com erros `MOCHILA` (49,7% contra o teto de 40%; `#btnSell` em y=724,3 contra a borda em y=628) e `LOG` (9 e 7 linhas contra o teto de 6; 151,9px e 115,2px contra o teto derivado de 95,7px); o console mostra a linha de pulo explícito em 390x440, 390x380 e 390x360; nenhum limiar é lido de arquivo `.css`.
      Testes: `URL=http://localhost:5173 npm run test:browser` — vermelho esperado nos prefixos `MOCHILA` e `LOG`
- [ ] T06 — Não regressão `CHAT` do `#actionBar` em sala real
      Arquivos: `tests/multipeer.mjs`
      Mudança: no passo de toque em sala (`tests/multipeer.mjs:283-345`, laço de `VIEWPORT_MOBILE`/`VIEWPORT_SMALL` na aba do host), acrescentar bloco com prefixo `CHAT`: `__M.targets('#actionBar')` devolve 8 alvos, todos `>= ALVO_MIN` nos dois eixos (hoje 7); `Math.abs(rect('#actionBar').width - BARRA_LARGURA) < 0.5` e `Math.abs(rect('#actionBar').height - 212) < 0.5`; `intersects(rect('#actionBar'), rect('#hudRight')) === false`; alvo de abrir visível com `rect(SEL_CHAT_ABRIR)` ≥ 44x44 dentro de sala. Padrão da casa `check('CHAT: <rótulo pt-BR>', <condição>, '<valor medido>')` (CT-02 AC 4), sem `.click()`. Nenhuma abertura de chat aqui: o roteiro de toque real vive inteiro em `tests/browser.mjs` (CT-02 AC 5).
      Cobre: UI-01, CT-01, CT-02, RNF-05
      Acceptance criteria: `PEERS=2 node tests/multipeer.mjs` sai 1 com `CHAT: ... 7 alvos, esperado 8` e valor medido em cada `check`; nenhum caso existente do arquivo passa a falhar; o encerramento continua em `process.exit(failures ? 1 : 0)`.
      Testes: `npm run test:multipeer:quick` e `npm run test:multipeer` — vermelho esperado só no prefixo `CHAT`

## Phase 2: Dicas de tecla, alvo de chat e mensagem de abertura

Antes de implementar, leia:
1. `.spec/features/mobile-toque-chat-e-layout/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-toque-chat-e-layout/PLAN.md` — decomposição completa, dependências e riscos

Os prefixos `CHAT` parcial, `MOCHILA` e `LOG` seguem vermelhos até as fases 3 a 5; o critério aqui é a ausência de `TECLA` e `ABERTURA` na saída e o avanço medido do `CHAT` de abertura.

- [ ] T07 — Dicas de tecla invisíveis no toque
      Arquivos: `styles.css`
      Mudança: dentro do bloco `@media (pointer: coarse)` já existente (`styles.css:390-408`), acrescentar `.slot .key { display: none; }` com comentário pt-BR citando a medição — 7 spans visíveis no dedo, `1`,`2`,`3`,`4` de `js/ui.js:119` e `Q`,`E`,`Tab` de `index.html:162-164`, anunciando teclas que o celular não tem. Esconder, nunca remover: os nós continuam no DOM (RF-01 AC 2) porque são a fonte do rótulo no mouse (AC 3, RNF-06). Não tocar em `js/ui.js:119` nem em `index.html:162-164`.
      Cobre: RF-01
      Acceptance criteria: em 390x844 e 360x640, `document.querySelectorAll('.slot .key').length === 7` e nenhum deles passa em `__M.visible`; em 1280x760 os 7 continuam visíveis; nenhum erro com prefixo `TECLA` na saída do harness.
      Testes: `URL=http://localhost:5173 npm run test:browser` — prefixo `TECLA` limpo
- [ ] T08 — `#btnChat` na célula livre ao lado do `#btnBag`
      Arquivos: `index.html`
      Mudança: acrescentar, como quarto e último filho de `.slots.potions` (`index.html:161-165`, logo depois do `#btnBag`), `<button class="slot chat" id="btnChat" aria-label="Conversar com o grupo"><i class="glyph-chat"></i></button>`. A grade de toque é `repeat(2, 1fr)` com 3 filhos, então o quarto cai na célula livre de 48x48 medida em (330, 672) em 390x844 e (300, 468) em 360x640 — ao lado do `#btnBag`, sem quarta linha, mantendo o `#actionBar` em 102x212. Sem `<span class="key">` dentro do botão: um oitavo nó `.slot .key` reprovaria RF-01 AC 2. O `aria-label` é o valor congelado no PLAN — RF-02 AC 5 o lê do DOM em runtime. Nenhuma outra linha de `index.html` muda.
      Cobre: UI-01, RF-03, CT-01
      Acceptance criteria: `document.querySelectorAll('.slots.potions > .slot').length === 4` e `document.querySelectorAll('.slot .key').length === 7`; `#btnChat` é `<button>` descendente de `#actionBar` com `aria-label === 'Conversar com o grupo'`; `git diff index.html` mostra exatamente uma linha acrescentada.
      Testes: `URL=http://localhost:5173 npm run test:browser` e `npm run test:multipeer:quick` — o erro `não encontrou #btnChat` some e o `CHAT` do multipeer passa a contar 8 alvos
- [ ] T09 — Caixa e glifo do `#btnChat`, sem mexer no mouse
      Arquivos: `styles.css`
      Mudança: fora de media query, junto das regras de `.slot`, `#btnChat { display: none; }` com comentário pt-BR — no desktop a `.slots` é flex e um quarto slot alargaria o `#actionBar`, reprovando UI-01 AC 6 e RNF-06; no mouse o `Enter` de `js/main.js:574` continua sendo o caminho. Dentro do bloco `@media (pointer: coarse)`, `#btnChat { display: flex; }` (id contra id, para vencer a regra anterior), herdando os 48x48 de `.slot` daquele bloco. `.glyph-chat` no padrão de `.glyph-bag` (`styles.css:299`): bloco com gradiente em `var(--chat)`, cantos `3px 3px 3px 0` sugerindo balão, `width: 24px; height: 20px`. Nada de largura ou altura fixa no `#actionBar`.
      Cobre: UI-01, RNF-06
      Acceptance criteria: em 390x844 e 360x640, `rect('#btnChat')` mede 48x48 com `left >= 259` e `>= 244` respectivamente, e `__M.targets('#actionBar')` devolve 8 alvos `>= 44`; `Math.abs(rect('#actionBar').width - 102) < 0.5` e `Math.abs(rect('#actionBar').height - 212) < 0.5` nos dois alvos e nas 7 alturas de `ALTURAS_UI03`, sem cruzar `#hudRight`; em 1280x760 `__M.visible('#btnChat') === false` e `.slots.potions` mostra 3 `.slot` visíveis.
      Testes: `URL=http://localhost:5173 npm run test:browser` (prefixos `CHAT` e `BARRA`) e `npm run test:multipeer` (prefixo `CHAT`)
- [ ] T10 — Ligação do alvo de chat com `openChat()`
      Arquivos: `js/main.js`
      Mudança: ao lado das ligações de HUD existentes (`js/main.js:654-657`), acrescentar `UI.el('btnChat').onpointerdown = (e) => { e.preventDefault(); openChat(); };` com comentário pt-BR — `onpointerdown` é o padrão da casa para slot de ação (`js/ui.js:120`) e `preventDefault()` impede o foco do botão de brigar com o `chatEl.focus()` de `js/main.js:687`. O handler só chama `openChat()`: não muta estado do simulador, não envia pacote e não duplica o caminho de envio, que continua em `js/main.js:673-685` via `chatGate`. Não tocar no listener de `pointerdown` do `#canvas` (`js/main.js:602`) — o `#actionBar` é irmão do `#canvas`, e é isso que mantém RF-04 AC 1 e AC 2 verdes.
      Cobre: RF-03, RF-04
      Acceptance criteria: após `page.touchscreen.tap()` no centro de `#btnChat` em 390x844 e 360x640, `elementFromPoint` devolve o botão ou um descendente, `#chatInput` existe sem `hidden` e visível, `document.activeElement.id === 'chatInput'`, `window.__SF.chatting === true`, `window.__SF.stick.active === false`, `window.__SF.moveGoal === null` e `#stick` continua com `hidden`; segunda abertura pelo mesmo alvo repete o resultado com um único `#chatInput` no DOM.
      Testes: `URL=http://localhost:5173 npm run test:browser` — o roteiro `CHAT` de abrir passa
- [ ] T11 — Mensagem de abertura por modo de entrada
      Arquivos: `js/main.js`
      Mudança: em `enterGame()` (`js/main.js:255-272`), trocar a linha fixa de `js/main.js:270` por ramificação em `matchMedia('(pointer: coarse)').matches`, com as duas strings lado a lado para a diferença ficar óbvia na revisão. As duas saem pelo mesmo `UI.pushLog(<texto>, 'system')` (RF-02 AC 4), respeitando o teto de `CHAT_LOG_LINES` (`js/ui.js:97`). Usar exatamente as strings congeladas no PLAN: a de toque é `Arraste o polegar na metade esquerda para o joystick; use os botões à direita para magias, poções e mochila; toque em <b>Conversar com o grupo</b> para falar.` e a de mouse continua byte a byte igual a `Use <b>1–4</b> para magias, <b>Q/E</b> para poções, <b>Enter</b> para conversar.` com travessão U+2013. Não montar a string lendo o `aria-label` do DOM: RF-02 AC 5 existe para reprovar a divergência, e montar a partir do botão tornaria a AC incapaz de falhar.
      Cobre: RF-02, RNF-04, RNF-06
      Acceptance criteria: em 390x844 e 360x640 o `innerText` do `#log` logo após entrar não casa `/1\s*[–-]\s*4/`, `/Q\s*\/\s*E/`, `/\bTab\b/` nem `/\bEnter\b/`, casa `/joystick/i`, contém o `aria-label` lido em runtime de `#btnChat`, e o `<p>` da linha tem a classe `system`; em 1280x760 a string é exatamente a de `js/main.js:270`; as duas strings medidas na mesma execução são diferentes entre si.
      Testes: `URL=http://localhost:5173 npm run test:browser` — prefixo `ABERTURA` limpo

## Phase 3: Chat operável e fechável no dedo

Antes de implementar, leia:
1. `.spec/features/mobile-toque-chat-e-layout/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-toque-chat-e-layout/PLAN.md` — decomposição completa, dependências e riscos

Os prefixos `MOCHILA` e `LOG` seguem vermelhos até as fases 4 e 5; o critério aqui é a ausência de `CHAT` na saída.

- [ ] T12 — Alvo de fechar, `maxLength` e o par abrir/fechar no mesmo estado
      Arquivos: `js/main.js`
      Mudança: no bloco de conversa (`js/main.js:664-695`): trocar o literal `chatEl.maxLength = 120` (`js/main.js:671`) por `CHAT_MAX_LEN`, já importado em `js/main.js:15` e igual a 140 (RNF-03 AC 2, `AGENTS.md:57`, `chat-grupo.md` §3); declarar `let chatCloseEl = null;` ao lado de `let chatEl = null;` (`js/main.js:665`) e, dentro do mesmo bloco memoizado `if (!chatEl) { ... }`, criar `<button id="btnChatClose" class="x" type="button" aria-label="Fechar conversa">✕</button>` anexado a `UI.el('game')`, com `chatCloseEl.onpointerdown = (e) => { e.preventDefault(); closeChat(); };` — chamando `closeChat()` direto, sem duplicar lógica e sem estado paralelo; em `openChat()` remover `hidden` do alvo de fechar junto do campo e em `closeChat()` (`js/main.js:692-695`) acrescentá-lo, para a visibilidade do ✕ ser exatamente `S.chatting`. Comentário pt-BR registrando o porquê: `closeChat()` só era alcançado por `Escape` (`js/main.js:571`) ou envio não vazio, celular não tem `Escape` e enviar vazio é descartado em silêncio por `chatGate.clean('')`. O caminho de teclado não muda.
      Cobre: RF-05, UI-05, RNF-03, RNF-06
      Acceptance criteria: com o chat aberto por toque, `#btnChatClose` existe, é visível e tem `pointerEvents === 'auto'`; `page.touchscreen.tap()` no centro dele leva `window.__SF.chatting` a `false`, põe `hidden` no `#chatInput`, tira o foco do campo e não imprime a sentinela digitada no `#log`; a reabertura traz `#chatInput.value === ''` e um único `#chatInput` no DOM; `document.querySelector('#chatInput').maxLength === 140` nos dois alvos e `grep -n "maxLength = 120" js/main.js` volta vazio; em 1280x760 `Enter` continua abrindo e `Escape` continua fechando.
      Testes: `URL=http://localhost:5173 npm run test:browser` — o roteiro `CHAT` de fechar e o de `maxLength` passam
- [ ] T13 — Linha de chat no toque: 44px, área segura e `#log` acima do campo
      Arquivos: `styles.css`
      Mudança: no bloco `@media (pointer: coarse)` (`styles.css:390-408`), com a geometria congelada no PLAN: `#chatInput { left: 12px; right: calc(126px + 52px); width: auto; min-block-size: 44px; box-sizing: border-box; bottom: max(12px, env(safe-area-inset-bottom)); }` — o `126px` repete a conta que `#portalHold` já faz em `styles.css:538` (12 de gutter + 102 de `#actionBar` + 12 de respiro) e o `52px` reserva o ✕ mais 8 de folga; `#btnChatClose { position: absolute; right: 126px; bottom: max(12px, env(safe-area-inset-bottom)); z-index: 25; display: inline-flex; }` com a moldura do campo (`background: rgba(9, 7, 13, .96)`, `border: 1px solid var(--ember)`), herdando o piso de 44x44 da regra `.x` do bloco de toque (`styles.css:540-543`), e `#btnChatClose { display: none; }` fora do toque; `#log { bottom: calc(max(12px, env(safe-area-inset-bottom)) + 52px); }`, que sobe o log 52px e o faz nunca cruzar o campo, cumprindo `chat-grupo.md` §5 sem estado novo em JS. O `max(12px, env(safe-area-inset-bottom))` é exigência de `tokens-componentes.md:146` e é item de revisão humana no code review: a emulação reporta `env()` como 0 e nenhum harness pega. Desktop intocado (`styles.css:419-423`).
      Cobre: UI-02, UI-05, RNF-06
      Acceptance criteria: em 390x844 e 360x640 com o chat aberto por toque real, `rect('#chatInput').height >= 44`, a caixa cabe inteira na viewport, `intersects(rect('#chatInput'), rect('#log')) === false` quando `rect('#log') !== null`, `intersects(rect('#btnChatClose'), rect('#chatInput')) === false` e `rect('#btnChatClose')` mede ≥ 44x44 dentro da viewport; em 390x440 o campo é não-nulo, ≥ 44, cabe na viewport e não cruza o `#actionBar`; `grep -n "env(safe-area-inset-bottom)" styles.css` mostra a regra do `#chatInput`; em 1280x760 a caixa do `#chatInput` e o comportamento de `Escape` ficam idênticos aos de hoje.
      Testes: `URL=http://localhost:5173 npm run test:browser` — prefixo `CHAT` limpo, incluindo o caso de 390x440

## Phase 4: Log em seis linhas

Antes de implementar, leia:
1. `.spec/features/mobile-toque-chat-e-layout/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-toque-chat-e-layout/PLAN.md` — decomposição completa, dependências e riscos

O prefixo `MOCHILA` segue vermelho até a fase 5; o critério aqui é a ausência de `LOG` na saída.

- [ ] T14 — `js/ui.js` publica o teto de linhas como custom property
      Arquivos: `js/ui.js`
      Mudança: acrescentar `LOG_MAX_LINES` ao import de `./balance.js` (`js/ui.js:4`) e, em escopo de módulo junto das demais preparações de HUD, escrever `document.documentElement.style.setProperty('--log-linhas', LOG_MAX_LINES);` com comentário pt-BR — o teto é primitiva de `js/balance.js` (`AGENTS.md:57`) e o CSS precisa dele sem repetir o número; o `#log` é HUD, e HUD é de `js/ui.js` pela tabela de camadas de `docs/agents/architecture.md`. Sem fallback numérico no CSS: `var(--log-linhas, 6)` reporia o literal em `styles.css` e reprovaria RNF-03 AC 1.
      Cobre: UI-04, RNF-03
      Acceptance criteria: `getComputedStyle(document.documentElement).getPropertyValue('--log-linhas').trim() === '6'` na página em execução, nos dois alvos e em 1280x760; `grep -n "6" js/ui.js` não mostra o valor escrito à mão como teto de linha; `npm test` sai 0 e nenhum `PAGEERROR` novo aparece na saída do harness.
      Testes: `npm test` e `URL=http://localhost:5173 npm run test:browser` — `LOG` ainda vermelho, console limpo
- [ ] T15 — `#log` de toque em `LOG_MAX_LINES` linhas
      Arquivos: `styles.css`
      Mudança: no bloco `@media (pointer: coarse)`, trocar o `max-height: 18vh` do `#log` (`styles.css:391`) por `max-height: calc(var(--log-linhas) * 1lh);`, mantendo `width: 50vw`, `font-size: 11px`, a máscara e o `pointer-events: none`. `1lh` resolve o `line-height` medido do próprio elemento (15,95px hoje), então o teto vira 95,7px por consequência — nenhum valor em `vh` e nenhum literal de linha entram no CSS. Comentário pt-BR com a medição: 9 linhas contidas em 390x844 e 7 em 360x640 antes, teto de 6 depois; a regra `@media (max-height: 460px) { #log { display: none } }` (`styles.css:410`) continua valendo. O `#log` de mouse (`styles.css:249-251`) não é tocado.
      Cobre: UI-04, RNF-03, RNF-06
      Acceptance criteria: com 9 linhas empurradas, o número de `#log p` com retângulo inteiro dentro do retângulo do `#log` é `<= 6` em 390x844 e 360x640, e `rect('#log').height <= 6 * parseFloat(getComputedStyle(log).lineHeight) + 1`; em 390x440, 390x380 e 390x360 `rect('#log')` é `null` e o caso registra o pulo explicitamente; em 1280x760 o `#log` continua em `min(340px, 42vw)` por `26vh`; `grep -n "18vh" styles.css` não devolve mais a regra do `#log`.
      Testes: `URL=http://localhost:5173 npm run test:browser` — prefixo `LOG` limpo

## Phase 5: Mochila estreita e specs de design

Antes de implementar, leia:
1. `.spec/features/mobile-toque-chat-e-layout/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-toque-chat-e-layout/PLAN.md` — decomposição completa, dependências e riscos

Ao fim desta fase os cinco prefixos ficam limpos; a saída 0 dos três comandos é cobrada na fase 6.

- [ ] T16 — Mochila em telas estreitas: `.equip-col` em duas colunas
      Arquivos: `styles.css`
      Mudança: no bloco `@media (max-width: 620px)` já existente (`styles.css:337`, onde `.bag-cols` vira coluna única — reutilizar ponto de quebra, não criar novo, por `tokens-componentes.md` §7): `.equip-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }`, levando os 6 campos de 6 linhas de 46px para 3, de 306px para ~150px (24% do painel de 616 contra o teto de 40%) e economizando ~156px de `scrollHeight`; `.bag-cols { padding: 12px; gap: 12px; }` para mais ~12px de folga, levando o `scrollHeight` medido de 771 para ~603 contra `clientHeight` 614; `.equip-slot .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }` no mesmo bloco, porque em duas colunas cada linha cai para ~150px e um nome longo quebraria em duas linhas (mesmo tratamento de `.roster-row .rr-name`, `styles.css:341`). Não reduzir o padding de `.equip-slot`: a linha tem `row.onclick` quando há item equipado (`js/ui.js:261`) e entra em `__M.targets('#bag')` — abaixo de 44px reprova o caso `TOQUE` existente. Comentário pt-BR com os números medidos. Desktop intocado.
      Cobre: UI-03
      Acceptance criteria: em 360x640 com o `#bag` aberto, 20 itens e `scrollTop === 0`: `rect('#equipCol').height <= 0.40 * rect('#bag').height`, `rect('#btnSell')` não-nulo com `top >= rect('#bag').top` e `bottom <= rect('#bag').bottom`, os 5 primeiros `.inv-slot` inteiros dentro do painel com o mesmo `top`, `#invGrid` em 5 colunas com 20 slots, `bag.scrollHeight <= bag.clientHeight` e nenhum descendente visível terminando abaixo da borda do painel; toda linha de `.equip-slot` clicável mede ≥ 44x44; em 1280x760 a mochila fica idêntica à de hoje.
      Testes: `URL=http://localhost:5173 npm run test:browser` — prefixo `MOCHILA` limpo, incluindo as guardas de transbordo que só ligam quando o conteúdo passa a caber
- [ ] T17 — Reescrever as três specs de design que esta feature derruba
      Arquivos: `.spec/init/design/chat-grupo.md`, `.spec/init/design/hud-grupo-mobile.md`, `.spec/init/design/tokens-componentes.md`
      Mudança: no mesmo commit do CSS, com aprovação registrada do desenvolvedor. Em `chat-grupo.md` §6: teto de "8" linhas vira `LOG_MAX_LINES = 6` exportado de `js/balance.js`; "`#log` 50vw × 18vh — mantém" vira "50vw de largura e altura derivada de `LOG_MAX_LINES × line-height` medido (95,7px hoje)"; "abaixo do botão de mochila" vira "ao lado do botão de mochila, na célula livre de 48x48 do grid `.slots.potions`, mantendo o `#actionBar` em 102x212"; registrar que o campo pode cobrir a zona do joystick enquanto `S.chatting` é verdadeiro e que existe alvo de fechar de 44x44 ao lado do campo. Em `chat-grupo.md` §5: registrar que no toque o `#log` fica permanentemente acima da faixa do campo (empilhamento estático). Em `hud-grupo-mobile.md:38`: "Canto inferior esquerdo é o `#log` (50vw × 18vh)" vira "…(50vw de largura; altura derivada de `LOG_MAX_LINES`, 95,7px medidos), com a faixa imediatamente inferior reservada ao `#chatInput` e ao alvo de fechar". Em `tokens-componentes.md:142`: "Log 50vw/18vh" vira "Log 50vw / altura por `LOG_MAX_LINES`". Citar em cada edição o número medido que a motivou (8 linhas inteiras exigiriam 19,9vh contra as 18vh que a mesma seção mandava manter em 360x640). Nenhuma outra seção é tocada.
      Cobre: escopo "In" da SPEC (consequência aceita de UI-01 e UI-04)
      Acceptance criteria: `grep -rn "18vh" .spec/init/design/` volta vazio; `grep -rn "abaixo do botão de mochila" .spec/init/design/` volta vazio; `grep -rn "LOG_MAX_LINES" .spec/init/design/` devolve as três specs; `git diff --stat .spec/init/design/` mostra exatamente 3 arquivos alterados e nenhuma outra seção modificada.
      Testes: `git diff --stat .spec/init/design/` — 3 arquivos; nenhum harness depende destes arquivos

## Phase 6: Fechamento de regressão

Antes de implementar, leia:
1. `.spec/features/mobile-toque-chat-e-layout/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-toque-chat-e-layout/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T18 — Fechamento: regressão completa e greps de fonte única
      Arquivos: nenhum (verificação); correção pontual volta à task de origem
      Mudança: rodar e registrar, nesta ordem — (1) `npm test` (10 suítes) e `grep -c "document\|window\|navigator" js/sim.js` igual a 0; (2) `URL=http://localhost:5173 npm run test:browser` com `npm run dev` de pé; (3) `PEERS=10 CASE=all node tests/multipeer.mjs`; (4) `git diff --name-only` sem `js/sim.js`, `js/net.js`, `js/render.js`, `js/save.js`; (5) `grep -n "18vh" styles.css` vazio para o `#log` de toque, `grep -rn "maxLength = 120" js/` vazio e revisão manual de que nenhum `6` é teto de linha fora de `js/balance.js`; (6) `node -e` sobre `index.html` confirmando os ids e ganchos estáticos de CT-01 AC 1 mais o `#btnChat`, e `window.__SF`/`window.__VIEW_GET` ainda expostos (`js/main.js:1077-1078`); (7) `package.json` sem chave `dependencies` e `vercel.json` com `"framework": null` e `buildCommand` `echo 'sem build'`; (8) revisão manual pt-BR das strings novas e do `max(12px, env(safe-area-inset-bottom))` do `#chatInput`, que nenhum harness mede.
      Cobre: RNF-01, RNF-02, RNF-03, RNF-04, RNF-05, RNF-06, RNF-07, CT-01, CT-02
      Acceptance criteria: os três comandos saem com código 0; a saída de `tests/browser.mjs` não traz `PAGEERROR` nem `REQFAIL` novos e a linha `erros:` diz `nenhum`; `node tests/sim.test.mjs` sai 0; os greps de (4), (5) e (7) devolvem exatamente o descrito; a revisão de (8) está registrada na descrição do commit em pt-BR.
      Testes: `npm test`, `URL=http://localhost:5173 npm run test:browser` e `npm run test:multipeer` — os três saem 0
</content>
