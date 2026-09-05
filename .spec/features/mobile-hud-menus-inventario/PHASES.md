# Phases: mobile-hud-menus-inventario

> **Status: implementado e coberto nos viewports 390×844 e 360×640.** As caixas abaixo preservam o plano histórico; o código e os testes são a fonte do estado atual.

Gerado por /plan a partir de PLAN.md — view executável para `./ralph.sh .spec/features/mobile-hud-menus-inventario/PHASES.md`.

## Phase 1: Fonte única dos números de toque

Antes de implementar, leia:

1. `.spec/features/mobile-hud-menus-inventario/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-hud-menus-inventario/PLAN.md` — decomposição completa, dependências e riscos

- [x] T01 — Constantes da zona de toque em `js/balance.js`
      Arquivos: `js/balance.js`
      Mudança: criar a seção `// ---------- Toque ----------` no padrão de `js/balance.js:198-204` (identificador em inglês, comentário pt-BR na mesma linha) com `TOUCH_STICK_ZONE = 0.5` (fração da largura que pertence ao joystick, "metade esquerda inteira" de `hud-grupo-mobile.md:35`), `TOUCH_STICK_RADIUS = 64` (metade do `#stick` de 128px) e `TOUCH_STICK_TRAVEL = 54` (curso máximo do polegar). Só a fração muda de valor; 64 e 54 migram iguais.
      Cobre: RF-01, RNF-03, RNF-06
      Acceptance criteria: `node -e "import('./js/balance.js').then(b => process.exit(b.TOUCH_STICK_ZONE === 0.5 ? 0 : 1))"` sai 0; as três constantes são exportadas, têm nome em inglês e comentário pt-BR na mesma linha; `npm test` sai 0.
      Testes: `npm test` — as 10 suítes continuam verdes com o arquivo de balance alterado
- [x] T02 — `js/main.js` lê as constantes e perde os literais
      Arquivos: `js/main.js`
      Mudança: acrescentar `TOUCH_STICK_ZONE`, `TOUCH_STICK_RADIUS` e `TOUCH_STICK_TRAVEL` ao import de `./balance.js` em `js/main.js:15`; escrever `e.clientX < innerWidth * TOUCH_STICK_ZONE` em `:608`, `- TOUCH_STICK_RADIUS` nos dois offsets de `:614-615` e `const max = TOUCH_STICK_TRAVEL` em `:636`. Nenhuma outra linha do arquivo muda — RF-02c proíbe costura de teste em `js/main.js`.
      Cobre: RF-01, RF-02c, RNF-03
      Acceptance criteria: `grep -nE "innerWidth \* 0\.45|- 64\)|max = 54" js/main.js` retorna zero linhas; `grep -cE "e\.clientX < innerWidth \* [A-Z][A-Z0-9_]*" js/main.js` retorna 1; `grep -cE "0\.45|innerWidth \* 0\.[0-9]" js/main.js js/ui.js` retorna zero linhas; `git diff --stat js/main.js` mostra só estas trocas.
      Testes: `npm test` sai 0; `URL=http://localhost:5173 npm run test:browser` sai 0 e sem `PAGEERROR`

## Phase 2: Alvos de toque, barra de ação e specs de design

Antes de implementar, leia:

1. `.spec/features/mobile-hud-menus-inventario/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-hud-menus-inventario/PLAN.md` — decomposição completa, dependências e riscos

- [x] T03 — Piso de 44x44 nos alvos de `pointer: coarse`
      Arquivos: `styles.css`
      Mudança: no bloco `@media (pointer: coarse)` de `styles.css:491`, dar a `.x` (`styles.css:312`, medida 15,1 x 23) `min-inline-size: 44px`, `min-block-size: 44px` e `display: inline-flex; align-items: center; justify-content: center`, e a `.btn.small` (`styles.css:130`, medida 31px) altura mínima de 44px. Repetir os seletores `.roster-row .rr-actions .btn` (`styles.css:417`) e `.confirm-inline .btn` (`styles.css:428`), que fixam `min-height: 30px` com especificidade 0,3,0 e venceriam um `.btn.small` sozinho.
      Cobre: UI-01
      Acceptance criteria: em 390x844 e 360x640, `#btnCloseBag`, `#btnCloseRoster`, `#btnSell`, `#btnRosterLock`, cada botão `Expulsar` e os botões `Sim`/`Não` da confirmação inline têm `rect.width >= 44 && rect.height >= 44`; o desktop (fora do bloco coarse) mantém padding e font-size de hoje.
      Testes: `URL=http://localhost:5173 npm run test:browser` (prefixo `TOQUE`) e `npm run test:multipeer` (prefixo `TOQUE`)
- [x] T04 — `#crewChip` com caixa de 44px e pintura de 21px
      Arquivos: `styles.css`
      Mudança: no bloco coarse, dar ao `#crewChip` `padding-block` que leve a caixa a 44px, `background-clip: content-box`, `border-color: transparent` e `position: relative`; devolver a borda de 1px por `#crewChip::before` sobre a caixa de conteúdo (pseudo-elemento sobrevive ao `textContent` de `UI.setCapacity`, `js/ui.js:411`), com `#crewChip.near::before { border-color: #6b3a18 }`. Acrescentar `.chips { align-items: center }` no mesmo bloco: `.chips` (`styles.css:206`) é flex sem `align-items` e o padrão `stretch` esticaria os chips irmãos para 44px junto. Ver OQ-02 do PLAN.
      Cobre: UI-01
      Acceptance criteria: em 390x844 e 360x640 dentro de sala, `crewChip.rect.height >= 44`, `getComputedStyle(crewChip).backgroundClip === 'content-box'`, e `#floorChip`, `#goldChip`, `#roomChip`, `#crewLock` e `#pingChip` visíveis mantêm `rect.height <= 24`.
      Testes: `npm run test:multipeer` (prefixo `TOQUE`; o `#crewChip` só sai de `hidden` em sala)
- [x] T05 — `.slot` de 48x48 e `#actionBar` de 102px
      Arquivos: `styles.css`
      Mudança: trocar `.slot { width: 62px; height: 62px }` (`styles.css:371`) por 48x48 no bloco coarse. A barra vira `2 × 48 + 6 = 102px` pelo grid de `styles.css:373` com `gap: 6px` de `styles.css:257`, começando em `x = 276` em 390 e `x = 246` em 360 com o `right: 12px` de `styles.css:372`. Não fixar largura no `#actionBar`. Conferir `.slot .key` e `.slot .cost` dentro do slot menor.
      Cobre: UI-01, UI-02
      Acceptance criteria: em 390x844 e 360x640, todo `.slot` visível tem `Math.abs(rect.width - 48) <= 0.5 && Math.abs(rect.height - 48) <= 0.5`, e para todo par de slots `overlapX <= 0 || overlapY <= 0`; a largura medida do `#actionBar` é 102px.
      Testes: `URL=http://localhost:5173 npm run test:browser` (prefixo `BARRA`)
- [x] T06 — `#portalHold` sem interseção com o `#actionBar` em nenhuma altura
      Arquivos: `styles.css`
      Mudança: `#portalHold` no coarse (`styles.css:497`) tem `left: 12px; width: min(280px, 80vw)`, o que dá borda direita 292 nas duas larguras e cruza a barra em qualquer altura. Estreitar para `width: min(280px, calc(100vw - 126px))` — 12 de gutter esquerdo, 102 de barra, 12 de gutter direito — mantendo `bottom: 28vh`.
      Cobre: UI-03
      Acceptance criteria: em 390x844, 360x640 e nas alturas 700, 620, 600, 460, 440, 380 e 360 com largura 390, `intersects(#actionBar, #portalHold) === false`, `intersects(#actionBar, #log) === false`, `intersects(#actionBar, zonaJoystick) === false`, e todo slot tem `rect.left >= innerWidth / 2 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight`.
      Testes: `URL=http://localhost:5173 npm run test:browser` (prefixo `BARRA` nas sete alturas)
- [x] T07 — Atualizar as specs de design para o slot de toque de 48px
      Arquivos: `.spec/init/design/tokens-componentes.md`, `.spec/init/design/hud-grupo-mobile.md`
      Mudança: em `tokens-componentes.md:142` trocar `slot 62px` por `slot 48px`; em `hud-grupo-mobile.md:92` trocar `62×62px` por `48×48px` na linha "Botão de magia", citando a derivação de UI-01 (104px úteis em 360 com `F = 0,50`, piso 44, teto 49). Nenhuma outra seção dos dois arquivos é tocada — §3 de `hud-grupo-mobile.md` fica como está.
      Cobre: escopo In da SPEC (consequência aceita de UI-01)
      Acceptance criteria: as duas linhas passam a dizer 48px e nenhuma outra linha dos dois arquivos muda (`git diff` mostra exatamente duas linhas alteradas).
      Testes: `git diff --stat .spec/init/design/` mostra 2 arquivos e 2 linhas alteradas

## Phase 3: Painéis e menus

Antes de implementar, leia:

1. `.spec/features/mobile-hud-menus-inventario/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-hud-menus-inventario/PLAN.md` — decomposição completa, dependências e riscos

- [x] T08 — `.panel` com altura útil e rolagem contida
      Arquivos: `styles.css`
      Mudança: em `.panel` (`styles.css:300-303`), trocar `max-height: 86vh` por `max-height: calc(100vh - 24px)` seguido de `max-height: calc(100dvh - 24px)` (fallback antes do valor moderno) e acrescentar `overscroll-behavior: contain`. O painel é centrado por `translate(-50%, -50%)`, então o teto de `innerHeight - 24` entrega o gutter de 12px em cima e embaixo. A regra vale também para o `#roster`.
      Cobre: UI-04, UI-05
      Acceptance criteria: em 390x844 e 360x640 com a mochila cheia em 20 itens, `bag.rect.top >= 12 && bag.rect.bottom <= innerHeight - 12 && bag.rect.left >= 0 && bag.rect.right <= innerWidth`; se `bag.scrollHeight <= innerHeight - 24` então `bag.scrollHeight <= bag.clientHeight` e todo descendente visível tem `rect.bottom <= bag.rect.bottom + 0.5`; após `bag.scrollTop = bag.scrollHeight` o documento não rola e `getComputedStyle(bag).overscrollBehaviorY !== 'auto'`.
      Testes: `URL=http://localhost:5173 npm run test:browser` (prefixo `MOCHILA`); `npm run test:multipeer` continua 0 com o `#roster` afetado
- [x] T09 — `.menu-actions` sem estouro e sem truncar rótulo
      Arquivos: `styles.css`
      Mudança: no bloco `@media (pointer: coarse)`, empilhar as ações com `.menu-actions { flex-wrap: wrap }` e `.menu-actions .btn { flex: 1 1 100% }`. Não usar `min-width: 0` isolado: com três colunas cada botão fica com ~69px de conteúdo e `MASMORRA` não cabe, reprovando a AC 2 de UI-06. Nada de `text-overflow: ellipsis`.
      Cobre: UI-06
      Acceptance criteria: em 360x640 e 390x844, com `#menu` e com `#lobby` de 10 jogadores, host, `#lobbyLock` e `#btnLock` visíveis, `screen.scrollWidth === screen.clientWidth` e todo descendente com largura maior que zero tem `rect.left >= -0.5 && rect.right <= innerWidth + 0.5`; todo `.menu-actions .btn` visível tem `el.scrollWidth <= el.clientWidth + 0.5`, `getComputedStyle(el).textOverflow !== 'ellipsis'` e `#btnStart.textContent.trim() === 'Descer para a masmorra'`.
      Testes: `npm run test:multipeer` (prefixo `MENU`, `#lobby` com 10) e `URL=http://localhost:5173 npm run test:browser` (prefixo `MENU`, `#menu`)

## Phase 4: Trilho de aliados e aliado caído

Antes de implementar, leia:

1. `.spec/features/mobile-hud-menus-inventario/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-hud-menus-inventario/PLAN.md` — decomposição completa, dependências e riscos

- [x] T10 — `js/ui.js:173` renderiza o caído primeiro
      Arquivos: `js/ui.js`
      Mudança: exatamente uma linha. `const visible = [...shown, ...downed];` (`js/ui.js:173`) passa a `const visible = [...downed, ...shown];`. Nenhuma outra linha de `js/ui.js` entra — o markup da placa (`js/ui.js:181-183`) continua fora do escopo.
      Cobre: UI-07, UI-08
      Acceptance criteria: `git diff --numstat js/ui.js` mostra `1 1 js/ui.js`; com um aliado caído em sala, `#partyList.firstElementChild` é a placa `.plaque.mate.down`; `npm test` sai 0.
      Testes: `npm test`; `npm run test:multipeer` (prefixos `CORTE` e `CAIDO`)
- [x] T11 — Especificidade e cortes do trilho de aliados
      Arquivos: `styles.css`
      Mudança: trocar `#hudLeft .plaque { width: 190px }` (`styles.css:374`) por `.plaque { width: 190px }` dentro do bloco coarse, baixando a especificidade de 1,0,1 para 0,1,0 e devolvendo a vitória a `.plaque.mate { width: 170px }` (`styles.css:494`) e a `@media (max-height: 460px) { .plaque { width: 180px } }` (`styles.css:379`). Estreitar os cortes para `#partyList .plaque.mate:not(.down):nth-child(n+3)` (`styles.css:500`) e `#partyList .plaque.mate:not(.down):nth-child(n+2)` (`styles.css:503`).
      Cobre: UI-07
      Acceptance criteria: no cenário de 4 aliados com 1 caído, nas alturas 700, 620, 600, 460, 440, 380 e 360 com largura 390, `#partyList .plaque.mate:not(.down)` visíveis tem contagem 3, 1, 1, 0, 0, 0, 0 e `.plaque.mate.down` visíveis tem contagem 1 nas sete; `.plaque.self` mede 190px em 700/620/600 e 180px em 460/440/380/360; `.plaque.mate` mede 170px; `.plaque.self`, `#minimap` e `#actionBar` têm `display !== 'none'` nas sete; `.ally-more`, quando existe, tem `display !== 'none'` nas sete.
      Testes: `npm run test:multipeer` (prefixo `CORTE`)
- [x] T12 — Exceção do aliado caído no bloco `max-height: 380px`
      Arquivos: `styles.css`
      Mudança: em `@media (max-height: 380px)` (`styles.css:506-508`), depois da regra geral, acrescentar `#partyList .plaque.mate.down { display: block }`. UI-08 escreve `display: flex`, que refluiria os filhos da placa em linha; `block` devolve a placa de sempre e nenhuma AC distingue os dois valores — confirmar OQ-01 do PLAN antes de codar.
      Cobre: UI-08
      Acceptance criteria: em 390x360, existe exatamente um elemento visível em `#partyList`, ele é `#partyList.firstElementChild`, tem `getComputedStyle(el).borderColor` resolvendo `--blood` e `el.textContent` contendo `caído`; `#partyList .plaque.mate:not(.down)` visíveis tem contagem 0.
      Testes: `npm run test:multipeer` (prefixo `CAIDO`)

## Phase 5: Harness de solo em tests/browser.mjs

Antes de implementar, leia:

1. `.spec/features/mobile-hud-menus-inventario/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-hud-menus-inventario/PLAN.md` — decomposição completa, dependências e riscos

- [x] T13 — Contextos mobile e helpers de medição
      Arquivos: `tests/browser.mjs`
      Mudança: importar `TOUCH_STICK_ZONE` e `TOUCH_STICK_RADIUS` de `../js/balance.js` (a AC 2 de UI-03 proíbe repetir `0.5` no teste; `tests/multipeer.mjs:11` é o precedente); extrair o trecho de `tests/browser.mjs:141-148` para uma função que recebe `{ width, height }` e abrir dois contextos, 390x844 e 360x640, ambos com `deviceScaleFactor: 2, isMobile: true, hasTouch: true`; injetar por `page.evaluate` os helpers `rect(sel)`, `intersects(a, b)` e `interactiveTargets()` (visível e `BUTTON`/`INPUT`/`onclick`/`onpointerdown`, excluindo `#floorChip`, `#goldChip`, `#lobbyCount`, `#rosterCount` e a linha do trilho). Manter `errors.push('<PREFIXO>: <detalhe pt-BR com valor medido>')` e `process.exit(errors.length ? 1 : 0)`.
      Cobre: RF-02a, CT-01, CT-02, RNF-04
      Acceptance criteria: `grep -c "setViewport" tests/browser.mjs` retorna 3 ou mais e existe chamada com `width: 360, height: 640`; nos dois contextos `matchMedia('(pointer: coarse)').matches` é `true`; o arquivo continua terminando em `process.exit(errors.length ? 1 : 0)`; `URL=http://localhost:5173 npm run test:browser` sai 0 sem `[error]`/`[warning]` de console.
      Testes: `npm run dev` no ar e `URL=http://localhost:5173 npm run test:browser`
- [x] T14 — Casos `BARRA` e a parte solo de `TOQUE` e `MENU`
      Arquivos: `tests/browser.mjs`
      Mudança: nos dois contextos, medir `BARRA:` interseção do `#actionBar` com `#portalHold`, `#log` e a zona `TOUCH_STICK_ZONE * innerWidth + TOUCH_STICK_RADIUS`, slots dentro da viewport e à direita de `innerWidth / 2`, nas alturas 700, 620, 600, 460, 440, 380 e 360 com largura 390 além das duas viewports base, e `.slot` 48±0,5 com interseção zero entre pares; `TOQUE:` varredura de alvos abaixo de 44px no `#menu` e no `#actionBar`; `MENU:` `scrollWidth`, descendentes dentro da viewport e rótulo inteiro em `.menu-actions .btn`.
      Cobre: UI-01, UI-02, UI-03, UI-06, CT-02, RNF-04
      Acceptance criteria: `grep -cE "0\.5[0]?\s*\*\s*innerWidth|innerWidth\s*\*\s*0\.5" tests/browser.mjs` retorna 0; o harness reporta `zonaJoystick.right === 259` em 390 e `=== 244` em 360; contra o código implementado o conjunto de erros com prefixo `BARRA` é vazio e o processo sai 0.
      Testes: `URL=http://localhost:5173 npm run test:browser`
- [x] T15 — Casos `MOCHILA`
      Arquivos: `tests/browser.mjs`
      Mudança: encher o inventário até 20 itens pelo estado exposto em `window.__SF` (`js/main.js:1077`), no mesmo estilo de `tests/browser.mjs:82-94`, preferindo o caminho real de geração de item a fabricar objeto solto; abrir o `#bag` e medir `MOCHILA:` caixa do painel, ausência de transbordo quando o conteúdo cabe, rolagem contida e `overscrollBehaviorY`; varrer também `TOQUE:` dentro do `#bag` (`#btnCloseBag`, `#btnSell`, `.inv-slot` com item, `.equip-slot` equipado).
      Cobre: UI-04, UI-05, UI-01, CT-02
      Acceptance criteria: contra o código implementado, os erros com prefixo `MOCHILA` e os erros `TOQUE` do `#bag` são vazios em 390x844 e 360x640; o console permanece sem `[error]`/`[warning]`; `URL=http://localhost:5173 npm run test:browser` sai 0.
      Testes: `URL=http://localhost:5173 npm run test:browser`

## Phase 6: Harness de sala em tests/multipeer.mjs

Antes de implementar, leia:

1. `.spec/features/mobile-hud-menus-inventario/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-hud-menus-inventario/PLAN.md` — decomposição completa, dependências e riscos

- [x] T16 — Abas em viewport mobile e helpers
      Arquivos: `tests/multipeer.mjs`
      Mudança: `openTab` (`tests/multipeer.mjs:48-67`) passa a receber a viewport em vez do `1280x760` fixo de `:50`; padrão mobile 390x844 com `deviceScaleFactor: 2, isMobile: true, hasTouch: true`; variável `VIEW` no ambiente com `mobile` (padrão), `small` (360x640) e `desktop` (1280x760, escape), documentada no cabeçalho junto de `PEERS`/`CASE`; injetar os mesmos helpers `rect`/`intersects`/`interactiveTargets` de T13; somar `mobile` à lista de `CASE` (`:19` e cabeçalho) e incluí-lo em `all`. Manter `check()`/`failures` e `process.exit(failures ? 1 : 0)`.
      Cobre: RF-02b, CT-01, CT-02, RNF-04, RNF-05
      Acceptance criteria: `grep -c "setViewport" tests/multipeer.mjs` retorna 1 ou mais e o `360x640` é alcançável por variável de ambiente; em toda aba mobile `matchMedia('(pointer: coarse)').matches` é `true`; `npm run test:multipeer:quick` sai 0 e `npm run test:multipeer` sai 0 sem aumentar o número de abas.
      Testes: `npm run test:multipeer:quick` e depois `npm run test:multipeer`
- [x] T17 — Casos `TOQUE` e `MENU` de sala
      Arquivos: `tests/multipeer.mjs`
      Mudança: medir o `#lobby` de 10 jogadores dentro do caso de tranca (`:155-169`), com `#lobbyLock` e `#btnLock` visíveis — única janela em que o estado da AC 1 de UI-06 existe; e medir o `#roster` dentro do caso `late` (`:229-248`), antes do `btnQueueLeave`, quando a sala tem 9 jogadores e 1 na fila, abrindo o painel por `crewChip.click()` (`js/main.js:143`) e varrendo `#btnCloseRoster`, `#btnRosterLock`, cada `Expulsar`, os botões `Sim`/`Não` da confirmação inline, o `#crewChip`, os chips irmãos e a tela `#queue` da aba em espera. Com `PEERS` diferente de 10, registrar o pulo no console como `:141-143` já faz, sem falhar.
      Cobre: UI-01, UI-06, CT-01, CT-02
      Acceptance criteria: contra o código implementado, nenhum erro com prefixo `TOQUE` ou `MENU` sai do harness; no `#roster` medido o conjunto de alvos com `rect.width < 44 || rect.height < 44` é vazio, `crewChip.rect.height >= 44` com `backgroundClip === 'content-box'`, e cada chip irmão visível tem `rect.height <= 24`.
      Testes: `npm run test:multipeer` (PEERS=10 CASE=all)
- [x] T18 — Casos `CORTE` e `CAIDO`
      Arquivos: `tests/multipeer.mjs`
      Mudança: com a partida em curso, derrubar um aliado pelo estado autoritativo do host (`window.__SF`, mesmo recurso de `tests/browser.mjs:82-94`), esperar o trilho se redesenhar (`js/ui.js:176-178` só reconstrói quando o conjunto de ids muda) e percorrer na aba do host as alturas 700, 620, 600, 460, 440, 380 e 360 com largura 390 medindo `CORTE:` contagens do trilho, `#log`, `.plaque.self`, `.plaque.mate` e o que nunca some; e `CAIDO:` em 390x360. O caso escolhe o ramo da AC 5 de UI-07 pela presença de `#partyList .ally-more`: ausente exige `=== null` nas sete alturas, presente exige `display !== 'none'` nas sete; registrar no console qual ramo rodou.
      Cobre: UI-07, UI-08, CT-02
      Acceptance criteria: contra o código implementado, `npm run test:multipeer` não emite erro com prefixo `CORTE` ou `CAIDO` e sai 0; `PEERS=5 CASE=mobile node tests/multipeer.mjs` também sai 0 e registra o ramo `extra === 0` com `.ally-more === null` nas sete alturas.
      Testes: `npm run test:multipeer` e `PEERS=5 CASE=mobile node tests/multipeer.mjs`

## Phase 7: Portão de regressão e suíte completa

Antes de implementar, leia:

1. `.spec/features/mobile-hud-menus-inventario/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/mobile-hud-menus-inventario/PLAN.md` — decomposição completa, dependências e riscos

- [x] T19 — Portão de regressão RF-03 e suíte completa
      Arquivos: nenhum arquivo do produto — execução, com o resultado registrado na entrega
      Mudança: commitar a feature antes (a árvore tem trabalho não commitado e o stash é por caminho); com os casos novos preservados, rodar `git stash push -- js/ styles.css index.html`, então `npm run test:browser; echo $?` e `npm run test:multipeer; echo $?`, conferir os códigos e as mensagens, e voltar com `git stash pop`. Fechar com `npm test`, os greps de RNF-01, RNF-02 e RF-02c, e a conferência dos 28 ids de CT-01 em `index.html`. Nunca usar `git stash` puro: levaria `tests/` junto e anularia a própria AC.
      Cobre: RF-03, RF-02c, CT-01, CT-02, RNF-01, RNF-02, RNF-05
      Acceptance criteria: com o stash aplicado, `npm run test:browser` imprime `1` com ao menos duas mensagens de erro distintas e `npm run test:multipeer` imprime `1` com ao menos quatro distintas, e a união das duas saídas contém ao menos um erro de cada prefixo `TOQUE`, `BARRA`, `MOCHILA`, `MENU`, `CORTE` e `CAIDO`, todos com número medido; após `git stash pop` os dois comandos imprimem `0`; `npm test` sai 0; `grep -cE "document|window|navigator" js/sim.js` retorna 0; `package.json` continua sem chave `dependencies` e `vercel.json` mantém `"framework": null` e `buildCommand` `echo 'sem build'`; `git diff --stat js/main.js` não mostra linha de instrumentação; `git stash list` fica vazio ao final.
      Testes: `npm test`, `URL=http://localhost:5173 npm run test:browser`, `npm run test:multipeer`
