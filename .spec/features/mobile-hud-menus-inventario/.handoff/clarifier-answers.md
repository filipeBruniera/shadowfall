# Respostas do desenvolvedor — 20/08/2026

Confirmadas pelo desenvolvedor via checkpoint do router. São vinculantes.

## Q-01 + Q-08 — aliado caído: opção (a) das duas

- UI-07 estreita o seletor para `.plaque.mate:not(.down)`.
- Exceção `#partyList .plaque.mate.down { display: flex }` dentro de `@media (max-height: 380px)`
  (`styles.css:506-508`), mantendo o caído visível onde a UI-08 exige.
- `js/ui.js:173` passa a renderizar `[...downed, ...shown]` — caído primeiro, portanto nunca
  atingido pelos cortes `nth-child` que escondem os últimos filhos. É uma linha, sem mudança de
  markup.
- **Scope "Out" fica emendado** para autorizar explicitamente essa linha de `js/ui.js:173`. Nada
  mais de `js/ui.js` é liberado.
- Cenário do trilho, antes indefinido, agora cravado para as ACs de UI-07: **4 aliados, 1 caído**.
  Contagens visíveis esperadas por faixa de altura, e a regra da Q-01 abaixo de 380.

## Q-02 — harness: opção (a), dividir

- Casos alcançáveis em solo — `#bag`, `#actionBar`, zona do joystick, `#menu` — ficam em
  `tests/browser.mjs`, no contexto mobile que já existe (`tests/browser.mjs:141-148`).
- Casos que exigem sala — `#roster`, os dez `Expulsar`, `#lobby`, trilho de aliados, aliado caído —
  vão para `tests/multipeer.mjs`, que ganha viewport mobile.
- RF-03 e RNF-05 nomeiam **os dois** comandos. Nenhuma costura de teste entra em `js/main.js`.

## Q-03 — fração da zona do joystick: F = 0.50

- Vale `hud-grupo-mobile.md:35`, "metade esquerda inteira". `F = 0.50`.
- Fonte única exportada de `js/balance.js` (RF-01 já aprovado); `js/main.js:608` consome.

## Q-04 — botão de magia: tamanho uniforme em todo `pointer: coarse`

- Um único tamanho em qualquer largura de toque, dimensionado para caber no alvo mais apertado
  (360 de largura com F = 0.50: 104px úteis, dois slots mais o gap de 6px ⇒ **slot ≤ 49px**).
- O número escolhido vira RIGID na UI-01, com piso absoluto de 44px. O implementador não escolhe.
- Consequência aceita: o 62×62 de `tokens-componentes.md:142` e `hud-grupo-mobile.md:92` deixa de
  valer no toque. **Atualizar essas duas specs de design faz parte do trabalho** — senão a próxima
  SPEC mede a mesma divergência de novo.

## Decisões técnicas do router (Q-05, Q-06, Q-07, Q-09)

Defeitos com resposta única, decididos sem consultar o desenvolvedor:

- **Q-05** — a AC de `#bag` rejeitaria implementação correta: `box-sizing: border-box`
  (`styles.css:27`) mais borda de 1px de `.panel` fazem `rect.height` contar a borda e
  `scrollHeight` não, dando 772 vs 770 e reprovando em ±1px. Substituir a igualdade por dois
  invariantes: `rect.bottom <= innerHeight - 12`, e `bag.scrollHeight <= bag.clientHeight` quando o
  conteúdo cabe.
- **Q-06** — trocar `git stash` por `git stash push -- js/ styles.css index.html`, deixando
  `tests/` na árvore. Do jeito anterior o stash levava junto os casos novos e a corrida saía com
  exit 0 em vez de 1, anulando a própria AC.
- **Q-07** — reescrever as faixas como `≤620`, `≤460`, `≤380`, casando com os `max-height` de
  `styles.css:377`, `:499`, `:502`, `:506`. Nenhuma mudança de código; a redação anterior divergia
  do CSS exatamente nas alturas que a UI-03 mede.
- **Q-09** — `#crewChip` recebe caixa de 44px transparente, com a pintura de 21px preservada por
  `padding` mais `background-clip: content-box`, no próprio elemento. Sem nó interno, porque
  `UI.setCapacity` (`js/ui.js:411`) escreve `textContent` e apagaria qualquer span. Sem
  `align-items` novo em `.chips`, para não esticar `#floorChip`, `#goldChip`, `#roomChip`,
  `#crewLock` e `#pingChip` junto e somar ~23px ao `#hudRight`.

## Observações menores, aplicar todas

- **CT-01 incompleto.** Acrescentar os seletores de que as ACs dependem: `#lobbyLock`, `#btnLock`,
  `#rosterCount`, `#floorChip`, `#goldChip`, `#lobbyList`, `#rosterList`, e os ganchos de classe
  `.plaque.self`, `.plaque.mate`, `.plaque.mate.down`, `.ally-more`, `.slots.potions`, `.inv-slot`.
- **Citação errada.** `#hudLeft .plaque { width: 190px }` está em `styles.css:374`, não `:373`
  (`:373` é `.slots`). Corrigir nas três ocorrências: Context, diagrama AS IS e FLEXIBLE.
- **RNF-03** — trocar "não retorna linha nova" por "retorna zero linhas", que é verificável sem
  baseline.
- **UI-06** — acrescentar cláusula explícita de que o rótulo não pode ser truncado. Hoje a AC mede
  só retângulos, e `min-width: 0` em `.menu-actions .btn` passaria cortando "Descer para a
  masmorra".
