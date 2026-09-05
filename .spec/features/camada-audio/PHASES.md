# Phases: camada-audio

> **Status: pendente.** Este arquivo continua sendo o plano executável da camada de áudio.

Gerado por /plan a partir de PLAN.md — view executável para `./ralph.sh .spec/features/camada-audio/PHASES.md`.

Ordem externa: **`chefes-hardcore` primeiro, `camada-audio` depois**. As emissões desta feature escrevem `hardcore: m.hardcore ? 1 : 0` e funcionam com a marcação ausente (RF-07), mas o caminho positivo de RF-05 só é verificável depois que aquela feature existir.

Regras que valem para toda fase: `js/sim.js` continua sem `document`/`window`/`canvas`/`Audio`/`AudioContext` e recebe **exatamente duas** emissões novas, nada mais; nenhum número de tuning fora de `js/balance.js`; nenhuma dependência npm de runtime e nenhum passo de build; comentário, log, UI e rótulo de teste em pt-BR, identificador em inglês; teste sem framework, com `check(label, cond, extra = '')` local e `process.exit(failures ? 1 : 0)`; rode `npm test` antes de dar a fase por concluída, e também `npm run test:browser` e `npm run test:multipeer:quick` a partir da fase 5.

## Phase 1: Fundação — números, assets e contrato de deploy

Antes de implementar, leia:

1. `.spec/features/camada-audio/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/camada-audio/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T01 — Seção de áudio em `js/balance.js`, com o prazo de desengajamento calibrado
      Arquivos: `js/balance.js`
      Mudança: criar `// ---------- Áudio ----------` no fim do arquivo exportando `BOSS_DISENGAGE_TIME = 12` (segundos sem troca de dano antes de `bossDisengage`; o pior caso natural dentro de uma luta é ≈ 8 s — ciclo de especial `7` em `js/sim.js:823`, primeiro sorteado em `G.rng.range(4, 8)`, cooldown `1.5` e carga `0.5` em `js/sim.js:815-816` —, então 12 s deixa 4 s de folga), `MUSIC_VOLUME_DEFAULT = 0.5`, `SFX_VOLUME_DEFAULT = 0.7`, `MUSIC_FADE_TIME = 0.8`, `SFX_MAX_VOICES = 8`, `SFX_MIN_INTERVAL = 0.06`, `AUDIO_BUDGET_TOTAL = 4 * 1024 * 1024`, `AUDIO_BUDGET_MUSIC = 1.2 * 1024 * 1024` e `AUDIO_BUDGET_SFX = 40 * 1024`. Cada constante com comentário pt-BR explicando o PORQUÊ, nunca o quê.
      Cobre: RF-12, RF-15, RF-17, RNF-02, RNF-07
      Acceptance criteria: as nove constantes existem e são exportadas de `js/balance.js`; `BOSS_DISENGAGE_TIME > 8`; `0 <= MUSIC_VOLUME_DEFAULT <= 1` e `0 <= SFX_VOLUME_DEFAULT <= 1`; `SFX_MAX_VOICES >= 1` e `SFX_MIN_INTERVAL > 0`; nenhuma constante preexistente foi alterada; nenhum arquivo além de `js/balance.js` foi tocado; `npm test` continua verde.
      Testes: cobertura entra em T18 e T19, que importam as constantes em vez de repetir o número.

- [ ] T02 — Tabela `AUDIO_ASSETS` em `js/data.js`
      Arquivos: `js/data.js`
      Mudança: exportar `AUDIO_ASSETS` como fonte única de nome de arquivo e categoria, no padrão das demais tabelas de conteúdo: duas músicas (`ambient` → `/audio/ambient.v1.mp3`, `bossfight` → `/audio/bossfight.v1.mp3`) e cinco efeitos, um por categoria de RF-10 (`cast`, `hit`, `death`, `loot`, `portal` → `/audio/<nome>.v1.mp3`), cada entrada com `kind: 'music' | 'sfx'`. Comentário pt-BR registra a regra de CT-04: sem passo de build não há hash de conteúdo, então a invalidação é por versão no nome — nunca sobrescrever um nome já publicado sob cache imutável.
      Cobre: RF-04, RF-05, RF-10, CT-04, CT-05
      Acceptance criteria: toda entrada começa com `/audio/` e casa `^[a-z0-9]+\.v[0-9]+\.mp3$`; todo `kind` é `music` ou `sfx`; existem exatamente duas faixas de música e as cinco categorias de efeito de RF-10, cada uma uma única vez; nenhum caminho tem acento, espaço ou maiúscula.
      Testes: `tests/audio.test.mjs` (T18) — varredura da tabela.

- [ ] T03 — Header de cache imutável para `/audio/` e permanência fora do `.vercelignore`
      Arquivos: `vercel.json`, `.vercelignore`
      Mudança: em `vercel.json`, acrescentar entrada `headers` com `source: "/audio/(.*)"` e `Cache-Control: public, max-age=31536000, immutable`, **antes** da regra genérica `/(.*)`, deixando a regra de `/js/(.*)` e os dois headers de segurança bit a bit como estão. Em `.vercelignore`, **não** listar `/audio` — acrescentar só uma linha de comentário pt-BR registrando que o áudio precisa ficar no deploy, para que ninguém repita o padrão de `tests` e `.spec`.
      Cobre: CT-04, RNF-02, RNF-07
      Acceptance criteria: `vercel.json` tem a entrada de `/audio/(.*)` com `immutable` e a de `/js/(.*)` segue com `public, max-age=0, must-revalidate`; `framework` continua `null`, `buildCommand` continua `echo 'sem build'` e `outputDirectory` continua `"."`; nenhuma linha não comentada de `.vercelignore` casa com `audio`; o JSON continua válido.
      Testes: `tests/audio.test.mjs` (T18) — leitura dos dois arquivos.

- [ ] T04 — Diretório `/audio/` e manifesto de procedência `audio/CREDITOS.md`
      Arquivos: `audio/CREDITOS.md`
      Mudança: criar o manifesto de CT-05 com cabeçalho pt-BR declarando o critério de admissão — licença CC0/domínio público ou equivalente **sem atribuição embutida** (crédito visível é recusado: não há tela de créditos e criar uma está fora de escopo), MP3 obrigatório como linha de base para todo asset, efeitos em mono e música em estéreo, 44,1 kHz, pico normalizado sem clipe, nome minúsculo sem acento com sufixo `vN`, e os três tetos de RNF-02 citando as constantes de T01 — e uma tabela `arquivo | título | autor | licença | URL`, nascendo vazia, com a regra "arquivo sem linha aqui não entra no deploy".
      Cobre: CT-05, RNF-02
      Acceptance criteria: `audio/CREDITOS.md` existe e declara licença, formato, canais, taxa, nível e nomenclatura; todo arquivo presente em `/audio/` que não seja o manifesto tem uma linha citando seu nome (vacuamente verdadeiro com o diretório vazio); nenhum arquivo de `/audio/` começa com a assinatura `version https://git-lfs`.
      Testes: `tests/audio.test.mjs` (T18) — bloco `== assets e deploy ==`.

## Phase 2: Módulos puros de política

Antes de implementar, leia:

1. `.spec/features/camada-audio/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/camada-audio/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T05 — `js/audioprefs.js`: preferência `sf-audio` com armazenamento injetável
      Arquivos: `js/audioprefs.js`
      Mudança: módulo de política puro, sem DOM e sem global, com cabeçalho pt-BR no padrão de `js/room.js:1-3`. Exporta `AUDIO_PREFS_VERSION = 1` (independente de `SAVE_VERSION` 3 — a chave não entra no schema de `js/save.js` e não exige migração), `AUDIO_KEY = 'sf-audio'`, `setStorage(s)` e `store()` verbatim no molde de `js/save.js:39-45`, `defaultPrefs()` lendo os padrões de `js/balance.js`, `loadAudioPrefs()` que valida e clampa, e `saveAudioPrefs(prefs)` que grava `{ v: 1, muted, music, sfx }` e avisa uma única vez por sessão em falha de cota, no precedente de `js/save.js:294-301`.
      Cobre: RF-12, RF-13, CT-01
      Acceptance criteria: ida e volta dos três valores é idêntica; chave ausente, JSON inválido, `v` desconhecido, `music`/`sfx` fora de `[0, 1]` e `muted` não booleano caem no padrão **sem lançar** e **sem apagar a chave**; storage que lança em `setItem` faz `saveAudioPrefs` devolver `false` e avisar uma vez só; sem `localStorage` o módulo opera em memória; `js/save.js` não foi tocado e `SAVE_VERSION` continua 3; o módulo importa em Node puro sem lançar.
      Testes: `tests/audio.test.mjs` (T18) — bloco `== preferência de áudio ==` com `memoryStorage()` importado de `js/save.js`.

- [ ] T06 — `js/audio.js`: política de áudio pura, com backend e relógio injetáveis
      Arquivos: `js/audio.js`
      Mudança: módulo puro, zero DOM e zero `AudioContext`, exportando `createAudioLayer({ backend, now, prefs })` e `memoryBackend()`. Backend injetável (`playSfx`, `setTrack`, `stopTrack`, `applyGains`, `preload`) e relógio injetado no precedente de `ChatGate.allow(id, now)` (`js/chatgate.js:17-21`). Concentra: máquina de faixas (ambiente em partida, `bossEngage hardcore:1` troca no mesmo turno, quatro caminhos de fim idempotentes, uma única janela de coexistência de `MUSIC_FADE_TIME`); guarda da invariante de alternância com contador exposto `stats.alternationViolations`; mapa fechado de efeitos das cinco categorias com `default` inerte; filtro de escopo pessoal por `ev.id === localId` para `loot` e `fx k='level'`; teto de vozes e intervalo mínimo com descarte, nunca enfileiramento; e aplicação de ganhos sem reiniciar faixa. Proibido: `setTimeout`, `setInterval` ou agendamento próprio.
      Cobre: RF-04, RF-05, RF-06, RF-07, RF-08, RF-09, RF-10, RF-11, RF-12, RF-15
      Acceptance criteria: existe no máximo uma faixa ativa fora da janela de `MUSIC_FADE_TIME`; `bossEngage` com `hardcore: 0` não troca faixa; cada um dos quatro caminhos de fim volta à ambiente sozinho, sem esperar prazo, e encerrar duas vezes é no-op; `bossDisengage` com a faixa já encerrada é no-op sem erro; reengajamento após `bossDisengage` reinicia a faixa; `stats.alternationViolations === 0` numa sequência válida; tipo não mapeado (inclusive `bossSpawn`) produz zero pedido; `loot`/`fx k='level'` de outro jogador produzem zero pedido; um lote de 120 eventos inicia no máximo `SFX_MAX_VOICES` fontes e descarta o excedente; dois eventos da mesma categoria dentro de `SFX_MIN_INTERVAL` produzem uma reprodução; mudo não zera os volumes guardados e desmutar restaura os dois; `grep -c 'setTimeout\|setInterval'` no arquivo devolve 0; o módulo importa em Node puro sem lançar.
      Testes: `tests/audio.test.mjs` (T18) — blocos `== política de faixa ==` e `== efeitos ==` com `memoryBackend()` e relógio falso.

## Phase 3: Emissões na simulação

Antes de implementar, leia:

1. `.spec/features/camada-audio/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/camada-audio/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T07 — Estado de engajamento e emissão de `bossEngage` pelo lado jogador→chefe
      Arquivos: `js/sim.js`
      Mudança: `createGame()` ganha `engagedBosses: []` e `nextFloor()` zera a lista junto com as demais (`js/sim.js:52-56`); `makeMonster()` ganha `engaged: false` e `lastDamageTime: 0` ao lado de `isBoss: false`; helper novo `markBossDamage(G, m)` que sai imediatamente se `!m || !m.isBoss` (teste de campo único, RNF-05), atualiza `m.lastDamageTime = G.time`, retorna se `m.engaged` já é verdadeiro, e senão liga o campo, empilha em `G.engagedBosses` e emite uma vez `{ t: 'bossEngage', id, typeId, floor, hardcore: m.hardcore ? 1 : 0, boss: 1 }`; chamada em `hitMonster()` **depois** de `m.hp -= dmg` (`js/sim.js:654`) e **antes** de `killMonster()` (`js/sim.js:670`); `killMonster()` remove o chefe da lista e zera `m.engaged` **sem** emitir `bossDisengage`.
      Cobre: RF-16, CT-06, RNF-03, RNF-05
      Acceptance criteria: dano de jogador em chefe emite exatamente 1 `bossEngage` e mais 10 golpes mantêm em 1; chefe morto de um golpe produz `bossEngage` antes de `fx k='death'` na mesma lista; dano em monstro comum emite 0; o campo `hardcore` sai `0` com a marcação ausente; o evento carrega `boss: 1` e o formato de campos de CT-06 verbatim; `node tests/sim.test.mjs` roda em Node puro e verde; nenhuma linha de dano, aggro, XP, loot, status ou geração de andar mudou de comportamento.
      Testes: `tests/sim.test.mjs` (T19) — unicidade por engajamento, ordem engajamento→morte, zero para monstro comum.

- [ ] T08 — Emissão de `bossEngage` pelo lado chefe→jogador, nos três chamadores que conhecem o monstro
      Arquivos: `js/sim.js`
      Mudança: chamar `markBossDamage(G, m)` **antes** de `damagePlayer` nos três chamadores que têm o monstro em mão — especial/investida (`js/sim.js:828`), corpo a corpo em `resolveMonsterAttack` (`js/sim.js:866`) e projétil de monstro acertando jogador (`js/sim.js:982`). Como `damagePlayer()` (`js/sim.js:713`) não recebe o agressor e o terceiro ponto não tem o monstro em escopo, `spawnProjectile()` passa a copiar `bossRef: o.bossRef || null` e os dois pontos de spawn de projétil de monstro passam `bossRef: m.isBoss ? m : null`; o acerto faz `if (pr.bossRef) markBossDamage(G, pr.bossRef)` — O(1), sem varredura de `G.monsters` (RNF-05). Dano de lava (`js/sim.js:389`) e monstro comum continuam sem emitir.
      Cobre: RF-16, CT-06, RNF-05
      Acceptance criteria: chefe batendo primeiro emite exatamente 1 `bossEngage` em cada um dos três caminhos, e repetir o ataque mantém em 1; dano de lava emite 0; monstro comum emite 0 no corpo a corpo e no projétil; `bossRef` não aparece em `JSON.stringify(buildSnapshot(...))`; nenhuma varredura de `G.monsters` foi introduzida no caminho de dano; `npm test` verde.
      Testes: `tests/sim.test.mjs` (T19) e `tests/net.test.mjs` (T20) — as duas direções e a ausência do campo no pacote.

- [ ] T09 — `bossDisengage` no tique, com invariante de alternância
      Arquivos: `js/sim.js`
      Mudança: em `step()`, logo depois de `updateZones(G, dt)` e antes da limpeza de `G.monsters`, varrer **apenas** `G.engagedBosses`; para cada chefe engajado vivo com `G.time - m.lastDamageTime >= BOSS_DISENGAGE_TIME` (constante importada de `js/balance.js`), desligar `m.engaged`, remover da lista e emitir uma vez `{ t: 'bossDisengage', id, typeId, floor, hardcore: m.hardcore ? 1 : 0, boss: 1 }`. A alternância é consequência mecânica de `m.engaged` ser o portão dos dois lados.
      Cobre: RF-17, CT-07, RNF-03, RNF-05
      Acceptance criteria: avançar o tempo até pouco antes da constante lida de `js/balance.js` dá 0 evento e ultrapassá-la dá exatamente 1; qualquer troca de dano em qualquer direção reinicia a contagem, e lava, dano de status em monstro e monstro comum não reiniciam; chefe nunca engajado, chefe morto e chefe deixado para trás em `nextFloor()` não emitem; a sequência `engage → disengage → engage` é alternada do primeiro ao último elemento, começando por `bossEngage`, sem dois iguais seguidos; `js/sim.js` tem exatamente **dois** pontos de emissão novos e zero ocorrência de `document|window|canvas|Audio|AudioContext`; nenhum literal numérico novo em `js/sim.js`.
      Testes: `tests/sim.test.mjs` (T19) — prazo, rearme e asserção explícita da invariante.

## Phase 4: Transporte na composição

Antes de implementar, leia:

1. `.spec/features/camada-audio/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/camada-audio/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T10 — Entrega do evento `loot` na composição, nos dois pontos que hoje o matam
      Arquivos: `js/main.js`
      Mudança: tirar `loot` da linha de descarte de `applyEvent` (`js/main.js:545`, `if (ev.t === 'loot' || ev.t === 'hurt' || ev.t === 'respawn') return;`), mantendo `hurt` e `respawn` descartados; e acrescentar `'loot'` à lista de tipos que entram em `S.netEvents` (`js/main.js:965`). O evento viaja na forma exata em que a simulação já o emite — `{ t:'loot', id, rarity, name }` (`js/sim.js:1105`) —, sem reformatação em `main.js`, e continua **não crítico**.
      Cobre: CT-02, RF-10, RF-11
      Acceptance criteria: `loot` chega ao consumidor de áudio no host e no convidado pelo mesmo código; `hurt` e `respawn` continuam descartados; `isCriticalEvent({ t:'loot', ... })` é `false` e o evento é cortado antes dos críticos com a fila saturada; o acréscimo é ≤ 128 bytes por item coletado e exatamente 0 byte em snapshot sem coleta; nenhum campo do evento foi renomeado ou reformatado.
      Testes: `tests/net.test.mjs` (T20) — criticidade e bytes; `tests/audio.test.mjs` (T18) — filtro por dono.

- [ ] T11 — Transporte de `bossEngage` e `bossDisengage` na composição
      Arquivos: `js/main.js`
      Mudança: acrescentar `'bossEngage'` e `'bossDisengage'` à lista de tipos que entram em `S.netEvents` (`js/main.js:965`), junto do `'loot'` de T10, e declarar os dois como tipos ignorados pela camada de FX em `applyEvent` (`js/main.js:541-547`) — sem FX, sem log e sem banner. `js/net.js` **não** é tocado: `boss: 1` já faz `isCriticalEvent()` devolver `true` (`js/net.js:329-331`).
      Cobre: CT-06, CT-07, RF-05, RF-09
      Acceptance criteria: os dois tipos entram em `S.netEvents` e chegam ao convidado pelo campo `E`; nenhum dos dois produz FX, log ou banner; `isCriticalEvent` é `true` para ambos e os dois sobrevivem a `drainEvents` com fila acima de 120; ≤ 128 bytes cada e 0 byte em snapshot sem transição de luta; `js/net.js` não foi alterado; nenhuma regra de jogo entrou em `js/main.js`.
      Testes: `tests/net.test.mjs` (T20) — criticidade, fila saturada e orçamento de bytes.

## Phase 5: Backend de navegador e superfície de UI

Antes de implementar, leia:

1. `.spec/features/camada-audio/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/camada-audio/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T12 — `js/audioweb.js`: backend Web Audio, destravamento por gesto e falha silenciosa
      Arquivos: `js/audioweb.js`
      Mudança: único arquivo do repositório com `AudioContext`; implementa a superfície que `js/audio.js` consome, sem política própria, e é importado só por `js/main.js`. Um `AudioContext`, dois `GainNode` (música e efeitos) e um ganho mestre para o mudo; `decodeAudioData` + `AudioBufferSourceNode` em vez de `<audio>`. Destravamento por um único ouvinte em `window` com `{ once: true, capture: true }` para `pointerdown`/`keydown`/`touchend`, chamando `ctx.resume()` e tocando um buffer mínimo **de forma síncrona dentro do manipulador**, sem `await` anterior, sem `setTimeout` e sem esperar rede, mais a declaração de `navigator.audioSession` sob detecção de recurso. `preload(assetIds)` só busca bytes quando chamado. Falha de arquivo: no máximo uma tentativa nova por carga por arquivo, um `console.warn` em pt-BR, nunca no chat nem no log da sala, nenhuma exceção escapando. `applyGains` usa rampa com `MUSIC_FADE_TIME` e nunca reinicia a faixa em curso.
      Cobre: RF-01, RF-02, RF-03, RF-14, UI-02, RNF-01, RNF-07
      Acceptance criteria: antes do primeiro gesto o contexto não está `running`, zero fonte foi iniciada e zero erro ou rejeição não tratada apareceu; no primeiro gesto o contexto passa a `running` e do segundo em diante nenhuma tentativa nova é feita; em navegador sem `navigator.audioSession` nada é lançado e o destravamento continua valendo; com um arquivo removido do servidor o jogo entra, roda e desce de andar, com exatamente um `console.warn` em pt-BR e no máximo uma nova tentativa; alterar volume não reinicia a faixa; `grep -c 'setTimeout\|setInterval'` no arquivo devolve 0; `package.json` continua sem `dependencies` e `index.html` sem tag `<script>` nova.
      Testes: `tests/browser.mjs` (T21) — estado do contexto, coletor de erros, registro de rede e `console.warn`.

- [ ] T13 — Painel `#audioPanel` e seu gatilho em `index.html`
      Arquivos: `index.html`
      Mudança: dentro da tela `#game`, ao lado de `#bag` (`index.html:179`) e `#roster` (`index.html:195`), acrescentar `<div id="audioPanel" class="panel hidden">` com `.panel-head` (título `Som` e `<button id="btnCloseAudio" class="x">✕</button>`) e três controles separados, nenhum dividindo widget: `input[type=range]#audioMusic` (Música), `input[type=range]#audioSfx` (Efeitos) e `button#btnAudioMute` cujo **texto** alterna entre `Som ligado` e `Som mudo`. Gatilho: `<span class="chip" id="audioChip">` na fileira de `#hudRight` (`index.html:133-142`), no padrão de `crewChip`. Nenhum controle de áudio nas telas `#menu`, `#lobby` e `#queue`.
      Cobre: UI-01, UI-03
      Acceptance criteria: `#audioPanel` existe com `class="panel hidden"` e cabeçalho no padrão `.panel-head`; os três controles existem com ids distintos e nenhum compartilha widget; o estado mudo é distinguível por **texto**, não só por cor; `#audioChip` existe em `#hudRight`; nenhuma das três telas anteriores ao jogo ganhou controle de áudio; todos os rótulos em pt-BR.
      Testes: `tests/browser.mjs` (T21) — presença, estrutura e geometria.

- [ ] T14 — Estilo do painel e do gatilho em `styles.css`
      Arquivos: `styles.css`
      Mudança: o painel herda `.panel` (`styles.css:300-306`) e `.panel-head` (`styles.css:307-313`) sem regra de caixa própria; entra apenas a grade interna das três linhas de controle no espaçamento de `.spec/init/design/tokens-componentes.md`, o estilo do `input[type=range]` alinhado aos tokens de `.bar`, e — nos blocos `@media (pointer: coarse)` já existentes (`styles.css:369`, `styles.css:491`) — altura mínima explícita para `#audioChip` e para os três controles respeitando o alvo de toque de **44×44px** (`tokens-componentes.md:151`). A posição do chip segue a ordem de corte de `hud-grupo-mobile.md` §3, sem criar exceção nova.
      Cobre: UI-01, UI-03
      Acceptance criteria: em viewport de celular, retrato e paisagem, com o painel **fechado**, o retângulo de `#audioChip` não intercepta `#stick`, `#actionBar`, `#bossBar` nem `#portalHold`; o alvo de toque do gatilho e dos três controles é ≥ 44×44px; com o painel **aberto**, `elementFromPoint` no centro devolve elemento do painel e o HUD não recebe toque por baixo; o painel cabe na viewport (`width: min(680px, 94vw)`, `max-height: 86vh`); nenhuma regra existente de `.panel` foi alterada.
      Testes: `tests/browser.mjs` (T21) — `getBoundingClientRect` e `elementFromPoint`.

- [ ] T15 — `renderAudioPanel` e `toggleAudioPanel` em `js/ui.js`
      Arquivos: `js/ui.js`
      Mudança: duas funções novas no padrão exato de `renderRosterPanel`/`toggleRosterPanel` (`js/ui.js:436-472`): `toggleAudioPanel(force)` com a mesma assinatura e o mesmo `classList.toggle('hidden', !show)`, devolvendo o estado; e `renderAudioPanel(prefs, handlers)` que escreve os três controles a partir do objeto de preferência e chama de volta `onMusic(v)`, `onSfx(v)` e `onMute(muted)`, sem guardar estado próprio e sem importar `js/audio.js` ou `js/audioprefs.js`. Texto do botão de mudo em pt-BR. `el()` continua o único ponto que toca `document`.
      Cobre: UI-01, UI-02
      Acceptance criteria: as duas funções são exportadas e `js/ui.js` continua importável em Node puro sem lançar; `toggleAudioPanel(false)` esconde e `toggleAudioPanel(true)` mostra, e sem argumento alterna; `renderAudioPanel` não muta preferência nem chama a camada de áudio diretamente; mover um controle dispara o retorno correspondente com o valor lido; o texto do botão de mudo alterna entre os dois rótulos pt-BR.
      Testes: `tests/audio.test.mjs` (T18) — exportação e importabilidade; `tests/browser.mjs` (T21) — interação.

## Phase 6: Cola final na composição

Antes de implementar, leia:

1. `.spec/features/camada-audio/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/camada-audio/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T16 — Cola em `js/main.js`: instanciar a camada, assinar `applyEvent`, telas e carga preguiçosa
      Arquivos: `js/main.js`
      Mudança: importar `createAudioLayer` de `js/audio.js`, o backend de `js/audioweb.js` e `loadAudioPrefs`/`saveAudioPrefs` de `js/audioprefs.js`, montando a camada uma vez com a preferência lida **antes** de qualquer pedido de reprodução. Ligar: uma linha no fim de `applyEvent` (`js/main.js:541-547`) entregando o evento com `S.localId` como dono; `enterGame()` (`js/main.js:254-255`) e `leaveSession()` (`js/main.js:353-371`) para início e fim de partida; virada de andar nos **dois** pontos de composição existentes — bloco `S.G.pendingFloor` no host (`js/main.js:966-976`) e `case 'floor'` no convidado (`js/main.js:506-514`) —, o que torna o caminho 2 de RF-06 independente de `chefes-hardcore`; e um marcador de uma linha no laço `frame()` que chama `preload()` na primeira execução com `S.started === true` (`js/main.js:887-892`), depois do quadro desenhado.
      Cobre: RF-04, RF-05, RF-06, RF-08, RF-10, RF-11, RF-13, RNF-01, RNF-05
      Acceptance criteria: existe exatamente uma fonte de música durante a partida e nenhuma em `#menu`, `#lobby` e `#queue`; a ambiente **não** reinicia na virada de andar (posição de reprodução no tique seguinte maior que a do anterior), nem no host nem no convidado; zero requisição a `/audio/` antes da primeira execução de `frame()` com `S.started === true`, e o tempo até esse marco não regride na mesma máquina; host e convidado disparam efeito pelo mesmo código; nenhuma chamada de áudio dentro de `step()` nem em `hostTick` antes do despacho de eventos; nenhuma regra de jogo entrou em `main.js`.
      Testes: `tests/browser.mjs` (T21) — telas, virada de andar e registro de rede; `tests/multipeer.mjs` (T22) — mesmo lote de eventos.

- [ ] T17 — Gatilho, atalho `m` e persistência na interação
      Arquivos: `js/main.js`
      Mudança: `UI.el('audioChip').onclick` abre o painel no padrão de `UI.el('crewChip').onclick` (`js/main.js:142`) e `UI.el('btnCloseAudio').onclick` fecha, como `btnCloseBag`/`btnCloseRoster`. Atalho de teclado **`m`** — verificado livre contra o manipulador inteiro (`js/main.js:552-572`: `w`/`a`/`s`/`d`, setas, `1`–`4`, `q`, `e`, `p`, `tab`, `i`, `Enter`, `Escape`) e escolhido entre as três livres (`o`, `m`, `k`) pela mnemônica de **m**udo/**m**ute; ramo colocado depois do bloco de `Escape` e antes das teclas de movimento, sem `preventDefault`. Acrescentar `UI.toggleAudioPanel(false)` à linha de `Escape` que já fecha `#bag` e o roster (`js/main.js:561`). Os três retornos de `renderAudioPanel` aplicam o valor na camada no mesmo gesto e gravam por `saveAudioPrefs`.
      Cobre: UI-01, UI-02, RF-12, RF-13
      Acceptance criteria: `m` abre e fecha o painel; `Escape` e o botão `.x` fecham; abrir e ajustar custa no máximo dois toques a partir da tela de jogo; `m` digitado com o chat aberto **não** abre o painel; alterar mudo ou volume muda o ganho no mesmo gesto, sem recarregar, sem reentrar em partida e sem reiniciar a faixa; alterar volume durante o mudo não produz som e o valor fica guardado; recarregar a página restaura os três valores gravados; nenhum atalho existente mudou de comportamento.
      Testes: `tests/browser.mjs` (T21) — abertura, fechamento, chat e persistência.

## Phase 7: Suítes headless

Antes de implementar, leia:

1. `.spec/features/camada-audio/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/camada-audio/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T18 — Suíte nova `tests/audio.test.mjs` e registro em `package.json`
      Arquivos: `tests/audio.test.mjs`, `package.json`
      Mudança: única suíte nova da feature e única linha nova do script `test` (`node tests/audio.test.mjs` no **fim** do encadeamento com `&&`). Estrutura verbatim: `let failures = 0;` e `check(label, cond, extra = '')` no topo, rótulos pt-BR `área: comportamento`, `process.exit(failures ? 1 : 0)` na última linha. Blocos: `== preferência de áudio ==` (RF-12, RF-13, CT-01, com `memoryStorage()` importado de `js/save.js`), `== política de faixa ==` (RF-04 a RF-09, com `memoryBackend()` e relógio falso), `== efeitos ==` (RF-10, RF-11, RF-15), `== assets e deploy ==` (CT-04, CT-05, RNF-02, RNF-07, com os tetos lidos de `js/balance.js`) e `== disciplina de camada ==` (RF-09, RNF-03, por `grep` programático e importação em Node puro).
      Cobre: RF-04 a RF-15, CT-01, CT-04, CT-05, RNF-02, RNF-03, RNF-06, RNF-07
      Acceptance criteria: `node tests/audio.test.mjs` sai verde sem navegador e sem rede; `npm test` encadeia **11** suítes e continua verde; `package.json` continua sem chave `dependencies`; as asserções de asset ficam verdes com `/audio/` vazio; os tetos de bytes vêm de `js/balance.js` e não de literal repetido; cada RF de RF-04 a RF-15 tem ao menos um `check()` nomeado nesta suíte.
      Testes: a própria suíte.

- [ ] T19 — Emissões e alternância em `tests/sim.test.mjs`
      Arquivos: `tests/sim.test.mjs`
      Mudança: acrescentar blocos no padrão verbatim da suíte, em Node puro, importando `BOSS_DISENGAGE_TIME` de `js/balance.js` em vez de repetir o número: unicidade de `bossEngage` por engajamento nas duas direções; ordem engajamento→morte; zero para monstro comum, lava e dano de status; `bossDisengage` exatamente uma vez ao ultrapassar a constante e zero antes; reinício da contagem por troca de dano de qualquer jogador em qualquer direção; zero para chefe nunca engajado, morto ou deixado para trás em `nextFloor()`; asserção explícita da invariante de alternância sobre a lista completa de eventos de luta de uma instância; `hardcore: 0` com a marcação ausente; formato de campos de CT-06/CT-07 verbatim.
      Cobre: RF-07, RF-16, RF-17, CT-06, CT-07, RNF-03, RNF-06
      Acceptance criteria: `node tests/sim.test.mjs` verde em Node puro; nenhum número de prazo aparece como literal na suíte; a asserção de alternância percorre a lista elemento a elemento e reprova com dois eventos iguais seguidos; as asserções preexistentes da suíte continuam presentes e sem afrouxamento.
      Testes: a própria suíte.

- [ ] T20 — Criticidade, transporte e orçamento de bytes em `tests/net.test.mjs`
      Arquivos: `tests/net.test.mjs`
      Mudança: acrescentar, no padrão verbatim: `isCriticalEvent` verdadeiro para `{ t:'bossEngage', boss:1 }` e `{ t:'bossDisengage', boss:1 }` e falso para `{ t:'loot' }`; os dois eventos de luta sobrevivendo a `drainEvents` com fila acima de `NET_EVENT_CAP` enquanto o `loot` é cortado; medição de RNF-04 pela contagem de bytes já existente (`tests/net.test.mjs:186-192`) comparando lote com e sem cada um dos três eventos; e ausência de `bossRef` no `JSON.stringify` de qualquer snapshot.
      Cobre: CT-02, CT-06, CT-07, RF-09, RNF-04
      Acceptance criteria: `node tests/net.test.mjs` verde; ≤ 128 bytes por item coletado, por `bossEngage` e por `bossDisengage`, e exatamente 0 byte em snapshot sem coleta e sem transição de luta; o teto de 60000 bytes por snapshot (`tests/net.test.mjs:190-191`) continua verde; `bossRef` não aparece em nenhum pacote serializado.
      Testes: a própria suíte.

## Phase 8: Navegador, sincronia, calibração e fechamento

Antes de implementar, leia:

1. `.spec/features/camada-audio/SPEC.md` — requisitos RIGID que esta fase cobre
2. `.spec/features/camada-audio/PLAN.md` — decomposição completa, dependências e riscos

- [ ] T21 — Navegador: destravamento, silêncio, painel e orçamento em `tests/browser.mjs`
      Arquivos: `tests/browser.mjs`
      Mudança: acrescentar `let failures = 0;` e o `check(label, cond, extra = '')` idêntico ao das demais suítes no topo, e trocar a última linha por `process.exit(failures || errors.length ? 1 : 0)` — somando ao comportamento atual, nunca substituindo. Cenários novos: coletor de `window.onerror`/`unhandledrejection` com contagem zero antes e depois do gesto; estado do contexto antes e depois de um clique sintético, com e sem segunda tentativa; caminho com e sem `navigator.audioSession`; registro de rede sem requisição a `/audio/` antes do primeiro quadro jogável, mais medição comparativa do tempo até esse marco; arquivo removido produzindo exatamente um `console.warn` em pt-BR; uma fonte de música em partida e silêncio nas três telas anteriores; ambiente não reiniciando na virada de andar; painel abrindo por `#audioChip` e por `m`, fechando por `Escape` e pelo `.x`, com o mudo alternando texto; e `getBoundingClientRect` provando não-interseção com o painel fechado e ausência de toque por baixo com ele aberto.
      Cobre: RF-01, RF-02, RF-03, RF-04, RF-14, UI-01, UI-02, UI-03, RNF-01, RNF-06
      Acceptance criteria: `npm run test:browser` sai verde com `URL` apontando para uma instância já rodando (o harness não sobe servidor); o contador de erros de página continua reprovando como hoje; cada um de RF-01, RF-02, RF-03, RF-14, UI-01 e UI-03 tem ao menos um `check()` nomeado em pt-BR; a medição de RNF-01 é comparativa antes/depois na mesma máquina e no mesmo navegador.
      Testes: o próprio harness.

- [ ] T22 — Sincronia da faixa entre abas em `tests/multipeer.mjs`
      Arquivos: `tests/multipeer.mjs`
      Mudança: acrescentar um `CASE` novo (`audio`, incluído em `all`) no padrão dos existentes, usando o `check()` que a suíte já tem: com N abas conectadas, forçar a primeira troca de dano com o chefe e assertar que todas registram o início da faixa dentro do **mesmo lote** de eventos de snapshot e que nenhuma inicia por caminho diferente do evento; deixar passar o prazo sem troca de dano e assertar que todas registram o fim no mesmo lote; e um cenário de entrada tardia, reusando o caminho de `late`, em que a aba que conecta depois do lote com `bossEngage` permanece na ambiente, sem reenvio, sem replay e sem byte novo no snapshot.
      Cobre: RF-05, RF-06, RF-08, RNF-06
      Acceptance criteria: `PEERS=10 CASE=all node tests/multipeer.mjs` verde e `npm run test:multipeer:quick` verde; a asserção de sincronia é sobre **mesmo lote de eventos**, nunca sobre milissegundos de relógio; a aba tardia não recebe a faixa retroativamente e o tamanho do snapshot não muda por causa dela.
      Testes: o próprio harness.

- [ ] T23 — Calibração medida de `BOSS_DISENGAGE_TIME`
      Arquivos: `js/balance.js`, `tests/sim.test.mjs`
      Mudança: substituir o valor provisório de T01 pelo **medido**. Harness em `tests/sim.test.mjs`: luta completa contra o chefe até a morte dele, registrando a maior lacuna entre duas trocas de dano consecutivas em qualquer direção com a luta em curso; e um cenário de fuga em que os jogadores se afastam além da visão do chefe (`vision: 16`, `js/data.js:98-103`) e param de atacar. A constante fica estritamente acima da maior lacuna medida, com folga declarada, e o comentário pt-BR passa a citar o número medido no lugar da estimativa.
      Cobre: RF-17, CT-07, RNF-06
      Acceptance criteria: a maior lacuna medida numa luta em curso é estritamente menor que `BOSS_DISENGAGE_TIME`; o cenário de fuga emite exatamente um `bossDisengage`; o número novo aparece **só** em `js/balance.js` e o teste continua lendo a constante em vez do literal; `npm test` verde depois da troca.
      Testes: `tests/sim.test.mjs` — a própria medição vira asserção.

- [ ] T24 — Regressão completa e inventário de cobertura
      Arquivos: nenhum de produção — execução e, se faltar cobertura, retorno às suítes de T18–T22
      Mudança: portão final. Rodar `npm test` (11 suítes), `npm run test:browser` e `npm run test:multipeer:quick`; aplicar os portões de `grep` com resultado esperado explícito; e montar o inventário de RNF-06 ligando cada RF-01..RF-17 e UI-01..UI-03 a pelo menos uma asserção nomeada, com arquivo e rótulo pt-BR.
      Cobre: RNF-03, RNF-05, RNF-06, RNF-07
      Acceptance criteria: as três execuções saem verdes; o total de chamadas a `check()` é estritamente maior que o baseline de **238** e o de asserções executadas estritamente maior que **260**, sem nenhuma asserção preexistente removida ou afrouxada; `grep` em `js/sim.js` devolve zero para `document|window|canvas|Audio|AudioContext|audio` e o diff daquele arquivo contém apenas as duas emissões e o estado de engajamento (teto de dois pontos confirmado por contagem); zero `setTimeout|setInterval` em `js/audio.js` e `js/audioweb.js`; zero literal de tuning novo fora de `js/balance.js`; `package.json` sem `dependencies` e `index.html` sem CDN nova; toda RF e toda UI tem linha no inventário — sem linha, o portão reprova.
      Testes: as três execuções acima mais os `grep` de disciplina.
