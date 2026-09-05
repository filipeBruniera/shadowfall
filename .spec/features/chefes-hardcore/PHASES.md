# Phases: chefes-hardcore

> **Status: implementado e coberto pelas suítes headless/browser.** As caixas abaixo preservam o plano histórico; o código e os testes são a fonte do estado atual.

Gerado por /plan a partir de PLAN.md — view executável para `./ralph.sh .spec/features/chefes-hardcore/PHASES.md`.

Regras que valem para toda fase: `js/sim.js` continua sem `document`/`window`/`canvas`; nenhum número de tuning fora de `js/balance.js`; comentário, log, UI e rótulo de teste em pt-BR, identificador em inglês; teste sem framework, com `check()` local e `process.exit(failures ? 1 : 0)`; rode `npm test` antes de dar a fase por concluída.

## Phase 1: Fundação de números e conteúdo

Antes de implementar, leia:

1. `.spec/features/chefes-hardcore/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/chefes-hardcore/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T01 — Curva de chefe, fatores HARDCORE e janelas de carga em `js/balance.js`
      Arquivos: `js/balance.js`
      Mudança: criar a seção `// ---------- Chefe ----------` com `BOSS_LEVEL_OFFSET` (o `floor + 3` de `js/sim.js:101`), `LEVEL_HP_SCALE`/`LEVEL_ATK_SCALE`/`LEVEL_DEF_SCALE`/`LEVEL_XP_SCALE` (0.22 / 0.16 / 0.1 / 0.3 de `js/sim.js:113-118` — mover, não mudar), `bossCurve(floor)` devolvendo `{ level, hpMult, atkMult }`, `HARDCORE_EVERY = 3`, `HARDCORE_HP_MULT` e `HARDCORE_ATK_MULT` provisórios (comentário dizendo que T18 os substitui pela medição), `MONSTER_WINDUP`/`BOSS_WINDUP` (0.35 / 0.5 de `js/sim.js:816`), `BOSS_TELEGRAPH_TIME` > `BOSS_WINDUP` e `BOSS_SPECIAL_CD` (7, de `js/sim.js:823`). Comentário explica o PORQUÊ, não o quê.
      Cobre: RF-05, RF-04, RF-03, RF-07, UI-03
      Acceptance criteria: `bossCurve` é monotônica não decrescente para `floor` 1..30; a variante comum reproduz exatamente os valores de hoje (nível `floor + 3` e escala de HP `1 + (level - 1) * 0.22`); `HARDCORE_HP_MULT > 1` e `HARDCORE_ATK_MULT > 1`; `BOSS_TELEGRAPH_TIME > 0.5`; nenhum arquivo além de `js/balance.js` foi tocado.
      Testes: cobertura entra em T16 (`tests/group.test.mjs`); nesta task basta `npm test` seguir verde.

- [ ] T02 — Constantes do status `wither` em `js/balance.js`
      Arquivos: `js/balance.js`
      Mudança: exportar `WITHER_TIME`, `WITHER_DPS` (padrão absoluto de `burn`/`poison`) e `WITHER_HEAL_MULT` (fator de cura recebida, estritamente entre 0 e 1), com comentário pt-BR registrando a decisão de projeto: a redução de cura é o que dá identidade ao elemento Morte.
      Cobre: RF-10
      Acceptance criteria: as três constantes existem e são exportadas de `js/balance.js`; `0 < WITHER_HEAL_MULT < 1`; `WITHER_DPS > 0` e `WITHER_TIME > 0`; nenhum desses números aparece como literal em `js/sim.js`.
      Testes: cobertura entra em T15 (`tests/sim.test.mjs`), que importa as constantes em vez de repetir o valor.

- [ ] T03 — Kit de especiais por chefe e mapa `ELEM_STATUS` em `js/data.js`
      Arquivos: `js/data.js`
      Mudança: cada entrada de `BOSSES` (`js/data.js:98-103`) ganha `specials: [{ id, kind, ... }]` com ids prefixados pelo id do chefe, e ao menos uma entrada marcada `hc: true` (exclusiva do HARDCORE); `kind` reusa as primitivas existentes (`nova`, `burst`, `summon`, `zone`), sem sistema novo. Acrescentar `ELEM_STATUS` (`E.FIRE → 'burn'`, `E.ICE → 'freeze'`, `E.DEATH → 'wither'`, `E.EARTH → 'poison'`) e o helper puro `bossSpecials(boss, hardcore)`.
      Cobre: RF-01, RF-02, RF-04
      Acceptance criteria: cada chefe declara ≥ 3 especiais próprios; para todo par de chefes a interseção de ids é vazia; cada chefe tem ≥ 1 id marcado `hc: true`; `bossSpecials(boss, false)` nunca devolve entrada `hc`; `ELEM_STATUS` é a única fonte do mapeamento elemento→status.
      Testes: cobertura entra em T15 (`tests/sim.test.mjs`), varredura de `BOSSES`.

## Phase 2: Nascimento do chefe em sim.js

Antes de implementar, leia:

1. `.spec/features/chefes-hardcore/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/chefes-hardcore/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T04 — Buffer `G.pendingEvents` para eventos empilhados fora do tique
      Arquivos: `js/sim.js`
      Mudança: `createGame()` cria `pendingEvents: []`; `populate()` e `nextFloor()` empilham ali em vez de em `G.events`, por um par de helpers `pushPending(G, ev)` / `logPending(G, m, c)` ao lado de `pushEvent`/`log` (`js/sim.js:1226-1227`); `step()` drena o buffer para `G.events` logo depois de `G.events.length = 0` (`js/sim.js:280`) e o esvazia no mesmo comando. Motivo verificado: `step()` zera `G.events` no primeiro comando, então tudo que é empilhado fora do tique é apagado antes de qualquer consumidor — inclusive o `{ t: 'floor' }` e o log `Andar N — o ar fica mais pesado` de `js/sim.js:75-76`. Decisão do desenvolvedor: o buffer cobre também `nextFloor()`, consertando esse bug preexistente — entregar esses dois é comportamento pretendido, não efeito colateral. Mover o `pushEvent`/`log` de `js/sim.js:75-76` para logo depois de `G.floor++` (`js/sim.js:49`), antes de `populate()`, para a linha do andar sair antes da linha HARDCORE de T06. Eventos empilhados durante `step()` mantêm o descarte por tique de hoje.
      Cobre: RF-08, UI-01 (habilitador); correção do descarte preexistente dos eventos de virada de andar
      Acceptance criteria: em `createGame(seed, 3)` o primeiro `step()` devolve os eventos de nascimento e o segundo `step()` não os repete; depois de `nextFloor(G)`, o próximo `step()` devolve ao chamador exatamente um `{ t: 'floor' }` e exatamente uma linha de log de virada de andar, e o `step()` seguinte não devolve nenhum dos dois; num andar HARDCORE o mesmo lote traz também os eventos de nascimento, com a linha de andar antes da linha HARDCORE; nenhum evento empilhado durante `step()` muda de semântica; `js/sim.js` continua sem DOM.
      Testes: `tests/sim.test.mjs` — entrega única no primeiro tique após `createGame` e após `nextFloor`, e ausência de repetição no tique seguinte (implementado em T15).

- [ ] T05 — `populate()` e `makeMonster()` com `bossCurve` e flag HARDCORE
      Arquivos: `js/sim.js`
      Mudança: importar `bossCurve`, `HARDCORE_EVERY`, `HARDCORE_HP_MULT`, `HARDCORE_ATK_MULT` e as constantes `LEVEL_*` de `js/balance.js`; trocar os literais de `js/sim.js:113-118` pelas constantes, sem mudar valor; no bloco do chefe (`js/sim.js:100-109`) definir `hardcore = floor % HARDCORE_EVERY === 0`, marcar `b.hardcore`, tirar o nível de `bossCurve(floor).level` e compor `maxHp` como curva × `groupScale(G.groupSize || 1)` × fator HARDCORE (e `atk` de forma análoga). `groupScale` continua sendo chamada, nunca reescrita.
      Cobre: RF-03, RF-04, RF-05, RF-06
      Acceptance criteria: nos andares 3, 6, 9 e 12 a flag é verdadeira e o `typeId` é, respectivamente, `glacier`, `morgaroth`, `ferumbras`, `bonelord`; nos andares 1, 2, 4, 5, 7, 8, 10 e 11 a flag é falsa; a marcação existe antes do primeiro `step()`; `js/sim.js` não contém mais nenhum literal numérico no cálculo de nível, HP ou dano do chefe; nenhuma ocorrência nova de `Math.sqrt` ou do teto 2.6 fora de `js/balance.js`; `tests/group.test.mjs:250-254` segue verde sem alteração.
      Testes: `tests/sim.test.mjs` e `tests/group.test.mjs` (implementados em T15 e T16).

- [ ] T06 — Evento `bossSpawn` (CT-03) e log de andar HARDCORE (UI-01)
      Arquivos: `js/sim.js`
      Mudança: em `populate()`, quando `hardcore` for verdadeiro, empilhar em `G.pendingEvents`, exatamente uma vez e nesta ordem, `{ t: 'bossSpawn', id: b.id, typeId: boss.id, floor, hardcore: 1, boss: 1 }` e uma linha `{ t: 'log', m: '…HARDCORE…', c: 'boss' }` em pt-BR. Em andar não múltiplo de 3, nenhum dos dois é empilhado. No lote drenado, estes saem depois dos eventos de virada de andar de T04.
      Cobre: RF-08, UI-01, CT-03
      Acceptance criteria: exatamente 1 evento `bossSpawn` por andar múltiplo de 3 e 0 nos demais; o evento carrega `boss: 1`, logo `isCriticalEvent()` devolve `true`; a linha de log contém o termo `HARDCORE` e sai no mesmo lote da virada de andar, antes de qualquer evento de dano do chefe; em andar comum a linha não aparece.
      Testes: `tests/sim.test.mjs` — contagem por andar, presença do log e sobrevivência a `drainEvents` com fila saturada (implementado em T15).

## Phase 3: Combate do chefe em sim.js

Antes de implementar, leia:

1. `.spec/features/chefes-hardcore/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/chefes-hardcore/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T07 — Status `wither`: tique de dano e funil de cura
      Arquivos: `js/sim.js`
      Mudança: `emptyStatus()` (`js/sim.js:153-154`) ganha `wither: 0`; `tickStatus()` (`js/sim.js:904-920`) ganha o ramo de `wither` no padrão de `burn`/`poison`, usando `WITHER_DPS` e dano `silent`; criar `healPlayer(G, p, amount)` como ponto único de cura recebida, aplicando `amount × WITHER_HEAL_MULT` quando `p.status.wither > 0`; redirecionar para ela a poção de vida (`js/sim.js:508-510`) e o `case 'heal'` de `castSkill` (`js/sim.js:586-606`). `poison` fica intocado.
      Cobre: RF-10
      Acceptance criteria: com `wither > 0` o HP do jogador decresce a cada tique sem nova fonte de dano; uma cura `H` com `wither > 0` restaura estritamente menos que `H` e a mesma cura com `wither === 0` restaura `H`; ao expirar, `wither` zera e a cura volta a `H`; sem `wither` ativo, poção e magia de cura restauram exatamente o mesmo valor de antes da mudança.
      Testes: `tests/sim.test.mjs` — comparação direta dos dois casos no mesmo teste (implementado em T15).

- [ ] T08 — Status do elemento aplicado no acerto do chefe
      Arquivos: `js/sim.js`
      Mudança: em `resolveMonsterAttack()` (`js/sim.js:856-871`) e no impacto do projétil do chefe, quando `m.isBoss` acertar um jogador, aplicar `ELEM_STATUS[m.elem]` com `Math.max` sobre o valor atual e magnitudes vindas de `js/balance.js`. O mapa é a única fonte — nada de `if` encadeado por elemento. Monstro comum segue no caminho atual (`m.poison`, `js/sim.js:869`).
      Cobre: RF-02
      Acceptance criteria: após o acerto, o campo de status correspondente ao elemento do chefe fica > 0 em `p.status`, para os 4 chefes (`E.FIRE → burn`, `E.ICE → freeze`, `E.DEATH → wither`); nenhum chefe aplica status de elemento diferente do próprio; nenhum chefe `E.DEATH` aplica `poison`; monstro comum não passa a aplicar status novo.
      Testes: `tests/sim.test.mjs` — um caso por chefe (implementado em T15).

- [ ] T09 — Fase de telegrafia do ataque perigoso, com cancelamento
      Arquivos: `js/sim.js`
      Mudança: estender o padrão de `windup` (`js/sim.js:802-806`, `js/sim.js:815-820`) com `windupTotal` e `windupKind`; ao iniciar um especial do chefe, marcar `m.windup = m.windupTotal = BOSS_TELEGRAPH_TIME`, `m.windupKind = special.id` e emitir uma única vez, no primeiro tique da fase, `{ t: 'fx', k: 'telegraph', id, x, y, r, d: BOSS_TELEGRAPH_TIME, c: ELEM_COLOR[m.elem], boss: 1 }`; o golpe básico continua em `BOSS_WINDUP`/`MONSTER_WINDUP` com `windupKind = null`; no portão de `stun`/`freeze` (`js/sim.js:759`) e na morte, zerar `windup`, `windupTotal` e `windupKind` sem resolver.
      Cobre: RF-07, RF-09, CT-02
      Acceptance criteria: a duração da telegrafia vem de constante exportada de `js/balance.js` e é > 0,5 s; entre o início da janela e o fim dela nenhum jogador perde HP por aquele ataque e nenhum projétil dele existe em `G.projectiles`; o dano só ocorre depois da janela; exatamente 1 evento `k: 'telegraph'` por ataque perigoso; chefe morto, atordoado ou congelado no meio da janela não resolve o ataque e não cria projétil.
      Testes: `tests/sim.test.mjs` — avanço de tiques com HP intocado e três casos de cancelamento (implementado em T15).

- [ ] T10 — Seleção do kit por chefe com `G.rng` e mecânica exclusiva do HARDCORE
      Arquivos: `js/sim.js`
      Mudança: substituir o pool único de `js/sim.js:822-853` pela seleção sobre `bossSpecials(type, m.hardcore)` usando `G.rng.pick`, trocando os `Math.random()` de `js/sim.js:824` e `js/sim.js:843`; `m.special = BOSS_SPECIAL_CD`; resolver por `switch (special.kind)` sobre as primitivas existentes, disparado ao fim da telegrafia (T09), nunca no tique da escolha.
      Cobre: RF-01, RF-04
      Acceptance criteria: com seed fixa, o chefe HARDCORE dispara ao menos uma vez um especial marcado `hc` e o chefe comum do mesmo andar nunca dispara nenhum; nenhum especial de outro chefe aparece; nenhum `Math.random()` resta no ramo `ai === 'boss'`; o especial só causa dano depois da janela de telegrafia.
      Testes: `tests/sim.test.mjs` — execução determinística por seed (implementado em T15).

## Phase 4: Transporte e apresentação

Antes de implementar, leia:

1. `.spec/features/chefes-hardcore/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/chefes-hardcore/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T11 — Campo opcional `hc` no snapshot (CT-01)
      Arquivos: `js/net.js`
      Mudança: em `buildSnapshot`, dentro do bloco `if (m.isBoss)` (`js/net.js:227-233`), acrescentar `if (m.hardcore) e.hc = 1;`; em `applySnapshot` (`js/net.js:285-293`), `m.hardcore = !!sm.hc`. O array de 4 posições de status de monstro (`js/net.js:238-239`) fica intocado.
      Cobre: CT-01, RNF-03
      Acceptance criteria: a chave `hc` aparece só no chefe e só quando ele é HARDCORE; em andar não múltiplo de 3 o pacote tem exatamente 0 byte a mais que antes da feature; em andar HARDCORE o acréscimo é ≤ 8 bytes por chefe por pacote; `applySnapshot` reflete `m.hardcore` no convidado.
      Testes: `tests/net.test.mjs` — presença/ausência e contagem de bytes (implementado em T17).

- [ ] T12 — Anel de telegrafia com duração real (UI-03)
      Arquivos: `js/render.js`
      Mudança: remover o divisor fixo `0.5` de `js/render.js:925`; exportar `telegraphProgress(remaining, total)` = `clamp(1 - remaining / total, 0, 1)` e usá-la no arco; `handleFxEvent` ganha `case 'telegraph'`, que desenha o aviso de área (`spawnRing` no raio `ev.r`, cor `ev.c`) e registra `ev.d` por id de monstro; na falta do registro, cair em `BOSS_WINDUP`/`MONSTER_WINDUP` importados de `js/balance.js` — nunca em literal. O restante continua chegando pelo campo `w` do snapshot.
      Cobre: UI-03, CT-02
      Acceptance criteria: o progresso é `1 - restante / duracaoTotal`; para uma janela de duração D o anel está em 0 no primeiro tique e em 1 no último, com erro ≤ 0,02; o literal `0.5` não existe mais no cálculo do anel; nenhum byte novo é acrescentado ao pacote por causa do anel.
      Testes: `tests/sim.test.mjs` importa `telegraphProgress` de `js/render.js` (import em Node verificado) e assere as bordas e o erro (implementado em T15).

- [ ] T13 — Marca textual HARDCORE na barra do chefe (UI-02)
      Arquivos: `js/ui.js`
      Mudança: exportar a função pura `bossBarLabel(boss)`, que devolve `` `${boss.name} · Nv ${boss.level}` `` acrescido do termo `HARDCORE` quando `boss.hardcore`; `updateHud` (`js/ui.js:215-219`) passa a escrever `el('bossName').textContent = bossBarLabel(boss)`. Sem mudança em `index.html` e em `styles.css`.
      Cobre: UI-02
      Acceptance criteria: com chefe HARDCORE, `#bossName` (`index.html:148`) contém o termo `HARDCORE` além do nome e do nível; com chefe comum o termo está ausente; a distinção é textual e continua legível em escala de cinza; a função é pura e não toca `document`.
      Testes: `tests/sim.test.mjs` importa `bossBarLabel` de `js/ui.js` e assere os dois casos (implementado em T15); `tests/browser.mjs` confere o texto real (T20).

- [ ] T14 — Encaminhamento do evento `bossSpawn` na composição
      Arquivos: `js/main.js`
      Mudança: acrescentar `'bossSpawn'` à lista de tipos que entram em `S.netEvents` (`js/main.js:965`) e acrescentar `bossSpawn` **e `floor`** à linha de tipos ignorados por `applyEvent` (`js/main.js:545`), junto de `loot`/`hurt`/`respawn` — `floor` porque T04 passa a entregá-lo de fato e sem o ignore ele desce até o `default` de `handleFxEvent` (`js/render.js:74`). O `{ t: 'floor' }` do simulador **não** entra em `S.netEvents`: o host já anuncia a virada por `net.send({ t: 'floor', … })` (`js/main.js:975`), que dispara `case 'floor'` no convidado (`js/main.js:506-514`); encaminhar os dois duplicaria o anúncio e regeraria o mapa duas vezes. A linha de log da virada viaja sem mudança, porque `'log'` já está na lista. Nenhuma regra de jogo entra em `main.js`.
      Cobre: RF-08, CT-03
      Acceptance criteria: o evento `bossSpawn` chega a `drainEvents` (`js/main.js:920`) na produção; `isCriticalEvent({ t: 'bossSpawn', boss: 1 })` é `true` e o evento sobrevive ao teto de 120 com a fila saturada; o host não cai no `default` do `handleFxEvent` ao receber `bossSpawn` nem `floor`; `'floor'` não aparece na lista de `js/main.js:965` e o convidado continua recebendo exatamente um anúncio de virada de andar; o convidado passa a ver a linha de log da virada.
      Testes: `tests/net.test.mjs` — criticidade e sobrevivência (implementado em T17).

## Phase 5: Suítes de comportamento

Antes de implementar, leia:

1. `.spec/features/chefes-hardcore/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/chefes-hardcore/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T15 — Asserções de comportamento em `tests/sim.test.mjs`
      Arquivos: `tests/sim.test.mjs`
      Mudança: acrescentar blocos no padrão verbatim da suíte (o `check()` local do topo, rótulos pt-BR no formato `área: comportamento`, `process.exit` final inalterado) cobrindo kit por chefe (RF-01), status por elemento (RF-02), `wither` (RF-10), flag HARDCORE por andar (RF-03), degrau de `maxHp`/`atk` e mecânica exclusiva (RF-04), telegrafia e cancelamento (RF-07, RF-09), `bossSpawn` e log (RF-08, UI-01), entrega única de `{ t: 'floor' }` e do log de virada de andar depois de `nextFloor()` sem repetição no tique seguinte (T04), `bossBarLabel` (UI-02) e `telegraphProgress` (UI-03). Todo número vem importado de `js/balance.js`.
      Cobre: RF-01, RF-02, RF-03, RF-04, RF-07, RF-08, RF-09, RF-10, UI-01, UI-02, UI-03, CT-02, CT-03, RNF-04
      Acceptance criteria: `node tests/sim.test.mjs` roda em Node puro e sai verde; cada RF e UI listado tem ≥ 1 `check()` com rótulo em pt-BR; nenhum literal numérico de balanceamento aparece nas asserções; nenhuma referência a DOM na suíte.
      Testes: a própria suíte — `node tests/sim.test.mjs`.

- [ ] T16 — Curva, composição de escala e harness de duração em `tests/group.test.mjs`
      Arquivos: `tests/group.test.mjs`
      Mudança: acrescentar (a) monotonicidade de `bossCurve` em `floor` 1..30 e valor em ≥ 3 andares, importando a função de `js/balance.js`; (b) `maxHp` do chefe = curva × `groupScale` × fator HARDCORE, independente da ordem dos fatores até o arredondamento, e maior com 10 jogadores que com 1 nas duas variantes; (c) o harness de medição de RF-11 nos 4 chefes (andares 3, 6, 9 e 12), com mesma seed, mesmo `groupSize` e mesmo nível, medindo `t_hc` e `t_comum` até `hp <= 0`. Manter o dano recebido ligado. Determinismo: substituir `Math.random` por gerador semeado de `js/rng.js` durante a medição e restaurar depois.
      Cobre: RF-05, RF-06, RF-11, RNF-04
      Acceptance criteria: `node tests/group.test.mjs` sai verde; a razão `t_hc / t_comum` é medida e reportada para os 4 chefes e asserida dentro de 1,8–2,4; as asserções existentes de `tests/group.test.mjs:250-254` seguem verdes sem alteração; a medição é reprodutível — duas execuções seguidas devolvem a mesma razão.
      Testes: a própria suíte — `node tests/group.test.mjs`.

- [ ] T17 — Contrato de snapshot e evento crítico em `tests/net.test.mjs`
      Arquivos: `tests/net.test.mjs`
      Mudança: no bloco `== custo do host com a sala cheia ==` (já em `createGame(4242, 6)`, andar HARDCORE — `tests/net.test.mjs:172`), asserir `hc: 1` no chefe, ausência da chave em andar não múltiplo de 3 e o delta de bytes reusando a contagem de `tests/net.test.mjs:187-190`; no bloco de eventos, asserir criticidade e sobrevivência de `bossSpawn` com fila saturada.
      Cobre: CT-01, RNF-03, RNF-01, RF-08
      Acceptance criteria: `node tests/net.test.mjs` sai verde; o acréscimo por chefe HARDCORE é ≤ 8 bytes por pacote e exatamente 0 fora do andar HARDCORE; `bossSpawn` aparece na saída de `drainEvents` mesmo com 400 eventos na fila; o teto de 4 ms por tique de `tests/net.test.mjs:183-184` segue válido nesse andar HARDCORE.
      Testes: a própria suíte — `node tests/net.test.mjs`.

## Phase 6: Calibração medida e regressão

Antes de implementar, leia:

1. `.spec/features/chefes-hardcore/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/chefes-hardcore/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T18 — Calibração medida de `HARDCORE_HP_MULT` e `HARDCORE_ATK_MULT`
      Arquivos: `js/balance.js`
      Mudança: com o harness de T16 rodando, iterar os dois multiplicadores até a razão de duração cair na banda para os 4 chefes; registrar em comentário pt-BR, ao lado das constantes, a razão medida por chefe e a data da medição. Se nenhum par fechar a banda, o desvio está no kit (T03) ou na janela de telegrafia (T01/T09): ajustar lá e remedir.
      Cobre: RF-11, RF-04
      Acceptance criteria: `1.8 ≤ t_hc / t_comum ≤ 2.4` nos 4 chefes em 3 execuções consecutivas de `tests/group.test.mjs`; `HARDCORE_HP_MULT > 1` e `HARDCORE_ATK_MULT > 1`; o comentário ao lado das constantes cita a razão medida por chefe; a banda não foi afrouxada em nenhum momento.
      Testes: `tests/group.test.mjs` — harness de RF-11, 3 execuções.

- [ ] T19 — Janelas de tempo medidas em `tests/party10.test.mjs`
      Arquivos: `tests/party10.test.mjs`
      Mudança: medir antes de escolher. (a) Instrumentar a fase 1 (`tests/party10.test.mjs:66-74`, hoje `const limite = 300 / TICK`) com teto folgado e registrar o tempo real até `G.portalOpen` em ≥ 5 seeds — a corrida nasce em andar 1, que não é HARDCORE, então "300 s continua bastando" é resultado legítimo; anotar a medição em comentário pt-BR e só mexer no número se a medição exigir. (b) Acrescentar cenário em andar HARDCORE (`createGame(seed, 9, MAX_PLAYERS)`) com janela derivada da mesma medição, com margem declarada no comentário. (c) Estender `medir(n)` (`tests/party10.test.mjs:126-140`) com parâmetro de andar e asserir tique médio < 4 ms em andar HARDCORE.
      Cobre: RF-11 (consequência operacional), RNF-01
      Acceptance criteria: `node tests/party10.test.mjs` sai verde em 3 execuções consecutivas; toda janela de tempo do arquivo tem, em comentário, o valor medido que a justifica e a margem adotada; existe asserção de tique médio < 4 ms com 10 jogadores em andar múltiplo de 3; o teto de 4 ms de RNF-01 não foi alterado.
      Testes: a própria suíte — `node tests/party10.test.mjs`, 3 execuções.

- [ ] T20 — Regressão completa e inventário de cobertura
      Arquivos: `tests/browser.mjs`
      Mudança: rodar `npm test` (10 suítes encadeadas) e confirmar verde; conferir que a contagem de `check()` não regrediu do piso de 238 chamadas em 10 suítes; conferir por `grep` que `js/sim.js` não tem `document`, `window` nem `canvas`; acrescentar a `tests/browser.mjs` a leitura de `#bossName` em andar HARDCORE e rodar `npm run test:browser` e `npm run test:multipeer:quick`.
      Cobre: RNF-01, RNF-02, RNF-04
      Acceptance criteria: `npm test` verde; `npm run test:browser` sem erro de página e com `#bossName` contendo `HARDCORE` no andar HARDCORE; `npm run test:multipeer:quick` verde; `grep -n "document\|window\|canvas" js/sim.js` não retorna nada; todo RF e UI da SPEC tem ≥ 1 asserção em `tests/sim.test.mjs` ou `tests/group.test.mjs`.
      Testes: `npm test`, `npm run test:browser`, `npm run test:multipeer:quick`.
