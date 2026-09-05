# Diário de implementação — Roadmap híbrido Diablo/Tibia

Atualizado em 31/08/2026. Este documento registra o delta implementado pelo Codex sobre um
worktree que já continha muitas alterações locais do usuário. Ele não atribui ao roadmap as
mudanças preexistentes listadas pelo `git status`.

## Protocolo de execução a partir daqui

Este arquivo é a fonte de verdade do desenvolvimento pendente. Cada nova run deve:

1. escolher a primeira checkbox `[ ]` cujas dependências já estejam marcadas;
2. executar **somente essa checkbox**, sem antecipar a próxima;
3. validar a fatia com o comando indicado e corrigir apenas defeitos do mesmo escopo;
4. marcar `[x]` somente depois de todos os critérios da linha passarem;
5. acrescentar na própria linha a data e a evidência curta, por exemplo
   `— 27/08/2026: node tests/net.test.mjs verde`;
6. executar `graphify update .` quando houver mudança de código e então parar.

Uma checkbox de checkpoint só pode começar quando todas as checkboxes do seu bloco estiverem
marcadas. Falha, dependência externa ou teste inconclusivo não recebe `[x]`: registre o bloqueio
logo abaixo da linha e encerre a run. Mudanças locais preexistentes pertencem ao usuário e não
devem ser revertidas nem incluídas como trabalho da checkbox atual.

### Definição de pronto de uma checkbox

- A alteração é a menor fatia que satisfaz o texto e não amplia o escopo.
- Números de tuning novos ficam em `js/balance.js`; comentários e UI ficam em pt-BR.
- Mudança em `js/` passa pelo teste direcionado e por `npm test` antes de ser marcada.
- Mudança em render, UI ou rede passa também pelos harnesses exigidos na própria linha.
- O documento é atualizado com `[x]` e evidência somente após a validação.

## Baseline e Graphify

- O repositório foi mapeado localmente com Graphify v0.9.50, sem LLM e sem envio de código.
- Foram gerados `graphify-out/graph.html`, `graph.json`, `GRAPH_REPORT.md` e metadados.
- O bloco oficial do Graphify foi instalado em `AGENTS.md` e o hook inerte em
  `.codex/hooks.json`.
- O mapa registrou 632 nós, 1.534 relações e 21 comunidades na geração inicial.
- A arquitetura confirmada é `main → sim/net/render`, com `save`/`validate` na fronteira de
  persistência e host autoritativo sobre WebRTC em estrela.

## P0 — implementado localmente

### Progresso do convidado

- `validateSave()` deixou de usar o andar atual da sala como teto histórico. XP, itens e
  maior andar agora são saneados contra o andar declarado no próprio save.
- `writeSave()` preserva o maior andar já gravado ao salvar uma run iniciada em checkpoint
  inferior.
- A decisão mantém o modelo declarado do produto: PVE entre amigos, sem ranking ou economia
  competitiva.

Arquivos principais: `js/save.js`, `js/validate.js`, `js/main.js`.

### Checkpoints cooperativos

- Criado `js/progression.js`, módulo puro com:
  - checkpoints 1, 4, 7, 10…;
  - interseção pelo integrante menos avançado;
  - padrão no maior checkpoint comum;
  - escolha manual de checkpoint anterior pelo host.
- Lobby ganhou `#startFloorSelect` e texto do checkpoint comum.
- Estado de sessão ganhou `startFloor`; `createGame(seed, floor, groupSize)` e a mensagem
  `start.floor` existentes foram reutilizados.
- Roster transmite apenas `deepestFloor` numérico e `startFloor`, sem conteúdo do save.

Arquivos principais: `js/progression.js`, `js/main.js`, `index.html`, `styles.css`.

### Venda segura

- `sellJunk()` agora remove somente itens `common` e `rare`.
- Itens `epic` e `legendary` são preservados, alinhando comportamento e texto da interface.

Arquivo principal: `js/sim.js`.

### Telemetria anônima

- Criado `js/telemetry.js`, módulo puro e idempotente.
- Métricas implementadas: `game_run_start`, `game_run_end`, `game_party_size`,
  `game_checkpoint`, `game_max_floor`, `game_deaths` e `game_reconnect_failure`.
- O cliente envia somente nome conhecido, valor numérico, página e timestamp.
- `/api/vitals` usa allowlist para `game_*` e omite rating, delta, id e user-agent nesses
  eventos. Nome, código de sala, save e identificador persistente não entram no contrato.

Arquivos principais: `js/telemetry.js`, `js/main.js`, `api/vitals.js`.

### Dependências e documentação

- `web-vitals` foi movido de `dependencies` para `devDependencies`; o runtime continua usando
  o import map CDN, sem dependência npm de produção e sem build.
- HARDCORE e os dois pacotes mobile receberam status explícito de implementados.
- A camada de áudio permanece marcada como pendente.
- README, AGENTS e contrato HTTP foram atualizados para checkpoint, telemetria e dependências.

Arquivos principais: `package.json`, `package-lock.json`, `README.md`, `AGENTS.md`,
`docs/agents/api_contracts.md`, `docs/agents/tech_stack.md` e `.spec/features/*/PHASES.md`.

### Cobertura criada

- Criado `tests/progression.test.mjs` e incluído no `npm test`.
- Cobre checkpoints comuns, fallback de escolha, save profundo em sala no andar 1,
  preservação do maior andar na escrita, venda de raridades e payload numérico de telemetria.

## P1 — implementação parcial, ainda não liberável

### Elites

- Criado `js/elite.js` com códigos compactos `f`, `a`, `v` para Frenético, Blindado e
  Vampírico.
- A rolagem usa `G.rng`, e monstros normais não recebem campo de snapshot.
- O snapshot envia `el` somente em elites; o convidado reconstrói `monster.elite`.
- O render mostra ícone e texto acima do monstro, portanto a distinção não depende de cor.
- Modificadores numéricos estão centralizados em `js/balance.js`.

Estado: integrado e coberto pela regressão geral, mas ainda sem suíte dedicada de
determinismo, custo de bytes e efeito individual. Não considerar concluído antes da task 2.

### Quatro afixos de build

- `AFFIXES` recebeu redução de recarga, amplificação elemental, potência/duração de status e
  área de efeito.
- Faixas numéricas novas vivem em `BUILD_AFFIX_RANGES`, em `js/balance.js`.
- Serialização, desserialização e recálculo hostil reconhecem os quatro campos.
- `stats()` agrega os campos e `castSkill()` os aplica em cooldown, dano elemental, duração/
  potência de status e dimensões de área.

Estado: integrado e coberto pela regressão geral, mas ainda sem testes direcionados de
rolagem, save, saneamento e efeito por vocação. Não considerar concluído antes da task 3.

### Fundação de áudio

- Criados `js/audioprefs.js`, `js/audio.js` e `js/audioweb.js`.
- Preferências usam a chave separada `sf-audio` v1.
- A política pura conhece faixa ambiente/HARDCORE e efeitos cast, hit, death, loot e portal.
- O backend Web Audio sintetiza música e efeitos sem asset externo, dependência ou build.
- `AUDIO_ASSETS` e `audio/CREDITOS.md` reservam o contrato para futuros arquivos licenciados.
- Tetos de volume, vozes, intervalo, fade e orçamento estão em `js/balance.js`.

Estado: **fundação somente**. Ainda faltam eventos `bossEngage`/`bossDisengage`, transporte,
integração em `main.js`, controles de UI e testes. O jogo ainda não toca essa camada.

## Verificação executada nesta run

- `node --check` passou em todos os módulos novos e nos principais módulos alterados.
- `npm test` passou nas 11 suítes encadeadas.
- Medições desta execução:
  - 10 jogadores: 0,151 ms/tick;
  - 10 jogadores em HARDCORE: 0,165 ms/tick;
  - snapshot com corte de AOI: 5.575 bytes;
  - todos abaixo dos tetos permanentes de 4 ms e 60.000 bytes.

Ainda não executados depois deste delta: `npm run test:browser`,
`npm run test:multipeer:quick`, matriz completa de 10 abas, Graphify update e deploy.

## Fila executável — uma checkbox por run

Ordem de dependência: **P0 → P1A → P1B → P1C → P1D → checkpoint P1 → P2 → checkpoint P2 →
P3A → P3B → P3C → P3D → checkpoint P3 → release**.

### P0 — fechar checkpoints cooperativos

- [x] **P0-01 — Cobrir o seletor no browser.** Em `tests/browser.mjs`, verificar opções 1, 4,
      7… conforme o progresso do roster, maior checkpoint comum selecionado por padrão e escolha
      manual anterior preservada. Validação: `npm run test:browser` com servidor local ativo.
      — 26/08/2026: `URL=http://localhost:43987/index.html npm run test:browser` verde.
- [x] **P0-02 — Cobrir cálculo multipeer.** Em `tests/multipeer.mjs`, criar caso com dois saves
      de profundidades diferentes e provar que host e guest exibem o checkpoint do integrante
      menos avançado. Validação: caso direcionado com `PEERS=2`.
      — 26/08/2026: `PEERS=2 CASE=checkpoint node tests/multipeer.mjs` verde.
- [x] **P0-03 — Cobrir `start.floor` ponta a ponta.** Provar que a escolha do host viaja na
      mensagem `start`, que todos iniciam no mesmo andar e que o mapa continua derivado apenas de
      `seed` + `floor`. Validação: caso direcionado em `tests/multipeer.mjs`.
      — 26/08/2026: `PEERS=2 CASE=checkpoint node tests/multipeer.mjs` verde.
- [x] **P0-04 — Revalidar regressão headless.** Rodar `npm test` e corrigir somente regressões de
      checkpoint introduzidas pelas três tarefas anteriores.
      — 26/08/2026: `npm test` verde.
- [x] **P0-05 — Revalidar os dois harnesses.** Rodar `npm run test:browser` e
      `npm run test:multipeer:quick`; registrar duração e resultado.
      — 26/08/2026: browser e multipeer curto verdes.
- [x] **CHECKPOINT P0 — Liberar checkpoints.** Confirmar P0-01…P0-05 marcadas, ausência de save
      do guest fora de `validateSave()`, nenhum mapa em pacote de rede e evidência dos três comandos
      verdes. Este checkpoint não implementa funcionalidade nova.
      — 26/08/2026: inspeção de `main.js`/`net.js` e três comandos verdes confirmados.

### P1A — fechar elites

- [x] **P1A-01 — Testar rolagem determinística.** Cobrir mesmo seed → mesma sequência de elites,
      seeds diferentes e monstro normal sem campo `elite`. Validação: `node tests/sim.test.mjs`.
      — 26/08/2026: `node tests/sim.test.mjs` verde.
- [x] **P1A-02 — Testar Frenético.** Isolar o código `f` e provar a alteração de recarga de ataque
      sem mudar dano, vida ou comportamento de monstro normal.
      — 26/08/2026: `node tests/sim.test.mjs` verde.
- [x] **P1A-03 — Testar Blindado.** Isolar o código `a` e provar a redução de dano recebida nos
      limites definidos em `js/balance.js`.
      — 26/08/2026: `node tests/sim.test.mjs` verde.
- [x] **P1A-04 — Testar Vampírico.** Isolar o código `v` e provar cura por dano, teto de vida e
      ausência de cura quando não há dano efetivo.
      — 26/08/2026: `node tests/sim.test.mjs` verde.
- [x] **P1A-05 — Testar contrato de snapshot.** Cobrir `el` ausente em normais, presente apenas em
      elites e round-trip `buildSnapshot()` → `applySnapshot()`. Validação: `node tests/net.test.mjs`.
      — 26/08/2026: `node tests/net.test.mjs` verde.
- [x] **P1A-06 — Testar identificação não cromática.** Cobrir `eliteLabel()` para os três códigos,
      código desconhecido e ausência de elite; confirmar ícone + texto no render.
      — 26/08/2026: `node tests/sim.test.mjs` verde.
- [x] **P1A-07 — Medir custo de rede.** Comparar snapshot equivalente com e sem `el`, registrar o
      delta e manter o teto permanente de 60.000 bytes.
      — 26/08/2026: `node tests/net.test.mjs` verde; `el` acrescenta 9 B (1.566 B total).
- [x] **CHECKPOINT P1A — Liberar elites.** Rodar `npm test`, confirmar P1A-01…P1A-07 e registrar
      determinismo, três efeitos, round-trip, rótulo e custo de bytes.
      — 26/08/2026: `npm test` verde; sequência determinística, efeitos f/a/v, `el` em round-trip,
      rótulos textuais e +9 B por elite confirmados.

### P1B — fechar os quatro afixos de build

- [x] **P1B-01 — Testar rolagem.** Cobrir os quatro ids novos, faixas mínima/máxima de
      `BUILD_AFFIX_RANGES`, formato `{id,value,pct}` e ausência de literal de tuning fora de
      `js/balance.js`.
      — 26/08/2026: `node tests/sim.test.mjs` verde; quatro mínimos/máximos e referências a
      `balance.js` confirmados.
- [x] **P1B-02 — Testar round-trip de save.** Gravar e carregar item com cada afixo novo sem perda
      de id, valor ou percentual. Validação: `node tests/save.test.mjs`.
      — 26/08/2026: `node tests/save.test.mjs` verde; cooldown, elemental, status e area preservados.
- [x] **P1B-03 — Testar entrada hostil.** Filtrar id desconhecido, duplicata, `NaN`, infinito e
      valores fora da faixa; preservar um exemplar válido de cada afixo. Validação:
      `node tests/validate.test.mjs`. — 26/08/2026: verde; não finitos descartados e faixa finita limitada.
- [x] **P1B-04 — Testar redução de recarga.** Para as quatro vocações, provar efeito observável
      em uma habilidade representativa e clamp seguro do cooldown.
      — 26/08/2026: `node tests/sim.test.mjs` verde nas quatro vocações e clamp de 40%.
- [x] **P1B-05 — Testar amplificação elemental.** Para as quatro vocações, provar aumento apenas
      no dano elemental compatível e ausência de efeito em dano não elemental.
      — 26/08/2026: `node tests/sim.test.mjs` verde; corrigido bônus indevido em magia física.
- [x] **P1B-06 — Testar potência e duração de status.** Para as quatro vocações, provar os dois
      componentes separadamente e seus limites.
      — 26/08/2026: `node tests/sim.test.mjs` verde para atordoamento, queimadura, controle e ausência de status.
- [x] **P1B-07 — Testar área de efeito.** Para as quatro vocações, provar aumento da dimensão
      correta sem alterar alcance, alvo ou forma não relacionados.
      — 26/08/2026: `node tests/sim.test.mjs` verde nas quatro vocações; projétil inalterado.
- [x] **CHECKPOINT P1B — Liberar afixos.** Rodar `npm test` e confirmar P1B-01…P1B-07 com evidência
      de rolagem, persistência, saneamento e efeito nas quatro vocações. — 26/08/2026: `npm test`
      verde; rolagem, round-trip, saneamento hostil e os quatro efeitos nas quatro vocações confirmados.

### P1C — emitir e transportar engajamento de chefe

- [x] **P1C-01 — Criar estado mínimo de engajamento.** Adicionar estado puro por chefe, lista de
      engajados e limpeza em morte/virada de andar, sem DOM e sem alterar combate. — 26/08/2026:
      `node tests/sim.test.mjs` verde; chefe nasce desligado e morte/virada descartam referências antigas.
- [x] **P1C-02 — Emitir ataque jogador→chefe.** No primeiro dano efetivo, emitir uma vez
      `{t:'bossEngage',id,typeId,floor,hardcore,boss:1}`; golpes seguintes não repetem. — 26/08/2026:
      `node tests/sim.test.mjs` verde; emissão única, contrato, morte no mesmo golpe e monstro normal cobertos.
- [x] **P1C-03 — Emitir ataque chefe→jogador.** Cobrir corpo a corpo e cada caminho de projétil/
      zona que conserva referência do chefe; lava e monstro normal emitem zero. — 26/08/2026:
      `node tests/sim.test.mjs` verde; corpo a corpo, projétil, zona, lava e monstro comum cobertos.
- [x] **P1C-04 — Emitir abandono por timeout.** Após `BOSS_DISENGAGE_TIME` sem troca de dano,
      emitir uma vez `bossDisengage`; morte e virada de andar não emitem evento órfão. — 26/08/2026:
      `node tests/sim.test.mjs` verde; prazo, reinício, idempotência e limpezas cobertos.
- [x] **P1C-05 — Provar alternância.** Cobrir `engage → disengage → engage`, reinício do relógio
      por dano em qualquer direção e impossibilidade de dois eventos iguais consecutivos.
      — 26/08/2026: `node tests/sim.test.mjs` e `npm test` verdes.
- [x] **P1C-06 — Transportar eventos críticos.** Encaminhar os dois tipos em `main.js`, consumi-los
      antes da camada de FX e provar que `boss:1` preserva ambos sob corte de fila. — 26/08/2026:
      `node --check js/main.js`, `node tests/net.test.mjs`, `npm test`, `npm run test:browser` e
      `npm run test:multipeer:quick` verdes; a fila saturada preserva `bossEngage` e
      `bossDisengage` marcados com `boss:1`.
- [x] **P1C-07 — Medir contrato de rede.** Cobrir ≤128 bytes por evento, zero bytes quando não há
      transição, ausência de `bossRef` no snapshot e teto total de 60.000 bytes. — 26/08/2026:
      `bossEngage`/`bossDisengage` medem 77 B/80 B; sem transição mede 0 B; snapshot não serializa
      `bossRef`; snapshot com as duas transições mede 3.341 B. `node tests/net.test.mjs`, `npm test`,
      `npm run test:browser` e `npm run test:multipeer:quick` verdes.
- [x] **CHECKPOINT P1C — Liberar eventos de luta.** Rodar `node tests/sim.test.mjs`,
      `node tests/net.test.mjs` e `npm test`; confirmar exatamente os dois pontos de emissão novos
      previstos pela especificação de áudio.
      — 26/08/2026: `node tests/sim.test.mjs`, `node tests/net.test.mjs` e `npm test` verdes;
      P1C-01…P1C-07 confirmadas. `js/sim.js` emite somente `bossEngage` e `bossDisengage`,
      ambos são encaminhados em `js/main.js`, preservados por `boss:1` no corte de `drainEvents()`,
      e `buildSnapshot()` não serializa `bossRef`.

### P1D — fechar e integrar a camada de áudio

- [x] **P1D-01 — Testar preferências válidas.** Cobrir defaults, leitura, gravação, mudo sem perda
      de volumes e storage injetável em `js/audioprefs.js`. — 26/08/2026:
      `node tests/audio.test.mjs` verde; defaults de `balance.js`, chave ausente, leitura, round-trip,
      mudo sem perda dos dois volumes e `memoryStorage()` injetável cobertos. `npm test` verde.
- [x] **P1D-02 — Testar preferências hostis.** Cobrir JSON inválido, versão desconhecida, tipos
      errados, clamp 0…1 e falha de quota avisada uma única vez. — 26/08/2026:
      `node tests/audio.test.mjs` verde; JSON inválido, versão desconhecida e tipos errados
      retornam o padrão sem apagar a chave, a gravação limita volumes a 0…1 e quota cheia falha
      sem lançar com um único aviso. `npm test` verde.
- [x] **P1D-03 — Testar máquina de faixas.** Cobrir ambiente, entrada apenas em chefe HARDCORE,
      fade, morte, andar, fim de sessão, abandono, reengajamento e idempotência de todos os fins.
      — 26/08/2026: `node tests/audio.test.mjs` verde; início único em ambiente, transição apenas
      em `bossEngage` HARDCORE e encaminhamento de `MUSIC_FADE_TIME` ao backend cobertos. Morte,
      virada de andar, `bossDisengage` e fim de sessão são idempotentes; reengajamento reinicia a
      faixa de luta. `npm test` verde.
- [x] **P1D-04 — Testar os cinco efeitos.** Cobrir uma reprodução válida e o mapeamento fechado
      de `cast`, `hit`, `death`, `loot` e `portal`; tipo desconhecido produz zero pedido.
      — 26/08/2026: `node tests/audio.test.mjs` verde; uma reprodução válida, os eventos
      `fx/cast`, `fx/slash|impact`, `fx/death|playerDeath`, `loot` e `portal`, e os tipos
      desconhecidos `bossSpawn`, `cast` direto e `fx/summon` estão cobertos. `npm test` verde.
- [x] **P1D-05 — Testar escopo pessoal.** `loot` e `fx level` de outro jogador produzem zero
      pedido; eventos globais continuam audíveis. — 26/08/2026: `node tests/audio.test.mjs`
      verde; `loot` e `fx/level` remotos não pedem SFX, os mesmos eventos locais usam o efeito
      de recompensa e `fx/cast`, `fx/death` e `portal` seguem audíveis mesmo com id remoto.
      `npm test` verde.
- [x] **P1D-06 — Testar limites operacionais.** Cobrir teto de vozes, intervalo mínimo, descarte
      sem fila, aplicação de ganho e ausência de `setTimeout`/`setInterval` no módulo puro.
      — 27/08/2026: `node tests/audio.test.mjs` verde; intervalo usa `SFX_MIN_INTERVAL`, o teto
      de `SFX_MAX_VOICES` é imposto pelo backend Web Audio, excedentes são descartados sem fila,
      ganhos de mudo/volume são aplicados e `js/audio.js` não agenda temporizadores. `npm test`
      verde.
- [x] **P1D-07 — Registrar suíte de áudio.** Criar `tests/audio.test.mjs`, manter padrão `check()`
      do repositório e incluí-la em `npm test`. — 27/08/2026: `tests/audio.test.mjs` mantém o
      contador `failures`, o helper `check()` e `process.exit(failures ? 1 : 0)`; `package.json`
      a encadeia em `npm test` com `&&`, portanto falha ao primeiro teste reprovado. `node
tests/audio.test.mjs` e `npm test` verdes.
- [x] **P1D-08 — Instanciar áudio na composição.** Ligar preferências, política e backend em
      `main.js` sem importar APIs do navegador nos módulos puros. — 27/08/2026:
      `S.audio` é montada uma vez com `loadAudioPrefs()`, `createAudioLayer()` e
      `createWebAudioBackend()`; a prova de composição em `tests/audio.test.mjs` confirma que
      ainda não há desbloqueio, ciclo de sessão, pré-carga, eventos ou controles. `node --check
js/main.js`, `node tests/audio.test.mjs`, `npm test`, `npm run test:browser` e `npm run
test:multipeer:quick` verdes.
- [x] **P1D-09 — Destravar por gesto.** Reusar um gesto explícito do usuário, tornar o desbloqueio
      idempotente e manter o jogo funcional quando `AudioContext` falhar. — 27/08/2026:
      `js/main.js` captura o primeiro `pointerdown`, `keydown` ou `touchend`, chama `S.audio.unlock()`
      uma única vez e absorve a falha opcional; não inicia faixa, ciclo, evento ou controle. `node --check
js/main.js`, `node tests/audio.test.mjs`, `npm test`, `npm run test:browser` e `npm run
test:multipeer:quick` verdes; a suíte browser mede contexto suspenso antes do gesto, uma retomada
      após ele e partida funcional quando o construtor de `AudioContext` falha.
- [x] **P1D-10 — Ligar ciclo de sessão.** Iniciar ambiente ao começar, encerrar em saída/queda e
      impedir fonte órfã ao recriar ou trocar de sala. — 27/08/2026: `enterGame()` inicia a
      ambiente e `leaveSession()` ou o encerramento definitivo do `SessionGuard` a param de forma
      idempotente; uma falha ao construir `AudioContext` permanece silenciosa e não é repetida. A
      suíte browser mede duas fontes na primeira partida, as duas encerradas ao sair e somente duas
      novas ao recriar a partida. `node --check js/main.js`, `node tests/audio.test.mjs`, `npm test`,
      `npm run test:browser` e `npm run test:multipeer:quick` verdes.
- [x] **P1D-11 — Ligar eventos.** Entregar eventos a `createAudioLayer()`, trocar faixa somente em
      `bossEngage` HARDCORE e voltar nos quatro caminhos de fim. — 27/08/2026:
      `applyEvent()` entrega cada evento ao áudio antes dos retornos de UI/FX; a virada chama
      `floorChanged()` no host e no convidado, enquanto morte do chefe, `bossDisengage` e fim de
      sessão usam os caminhos idempotentes já ligados. `tests/audio.test.mjs` confirma a cola;
      `tests/browser.mjs` atravessa início e os quatro fins pelo `hostTick`; `CASE=audio` do
      multipeer confirma início/fim para host e convidado e ausência de replay para entrada tardia.
      `node --check js/main.js`, `node tests/audio.test.mjs`, `npm test`, `npm run test:browser`,
      `npm run test:multipeer:quick` e `PEERS=2 CASE=audio node tests/multipeer.mjs` verdes.
- [x] **P1D-12 — Criar marcação dos controles.** Adicionar chip/painel com mudo, música e efeitos,
      ids estáveis, labels acessíveis e estado inicial coerente. — 27/08/2026: `#audioChip` abre
      caminho para `#audioPanel` dentro de `#game`; painel começa oculto, `audioMusic`/`audioSfx`
      começam em 0,5/0,7 e `btnAudioMute` começa desativado textualmente. `tests/audio.test.mjs`
      e `tests/browser.mjs` cobrem ids, rótulos, escopo e estado inicial. `node tests/audio.test.mjs`,
      `npm test`, `npm run test:browser` e `npm run test:multipeer:quick` verdes.
- [x] **P1D-13 — Estilizar desktop e mobile.** Garantir contraste, foco visível, painel sem cobrir
      combate e alvos de toque equivalentes nas três viewports oficiais. — 27/08/2026: `#audioChip`
      tem contraste próprio e foco visível; `#audioPanel` fica compacto no canto superior direito,
      fora da área de combate, e seus controles preservam foco visível. `tests/audio.test.mjs` cobre
      as regras declaradas e `tests/browser.mjs` mede foco, contenção, ausência de sobreposição e
      alvos de 44×44 em 1440×900, 390×844 e 360×640, com capturas `13-audio-*`. `node
tests/audio.test.mjs`, `npm test`, `npm run test:browser` e `npm run test:multipeer:quick`
      verdes.
- [x] **P1D-14 — Ligar controles e persistência.** Atualizar ganhos sem reiniciar faixa, salvar
      cada alteração e refletir estado restaurado ao recarregar. — 27/08/2026: o chip abre e o
      botão fecha o painel preservando `aria-expanded`; música, efeitos e mudo passam por
      `S.audio.setPrefs()` e `saveAudioPrefs()` sem recriar a faixa. O browser confirma os três
      snapshots persistidos individualmente e a restauração completa depois do reload. `node
--check js/main.js`, `node tests/audio.test.mjs`, `npm test`, `npm run test:browser` e
      `npm run test:multipeer:quick` verdes.
- [x] **P1D-15 — Implementar atalho `M`.** Alternar mudo fora de campos editáveis, atualizar UI,
      persistir e não capturar combinações com modificadores. — 27/08/2026: `M` usa
      `updateAudioPrefs()` na partida, portanto atualiza ganhos, texto/estado acessível e
      `sf-audio` pelo mesmo caminho do botão; inputs, textarea, select e conteúdo editável, o
      chat e combinações Ctrl/Alt/Meta/Shift permanecem fora do atalho. `tests/browser.mjs`
      cobre as duas alternâncias, foco no range, digitação e Escape no chat e os quatro
      modificadores. `node --check js/main.js`, `node tests/audio.test.mjs`, `npm test`, `npm run
test:browser` e `npm run test:multipeer:quick` verdes.
- [x] **P1D-16 — Cobrir UI no browser.** Testar desbloqueio, painel, volumes, mudo, `M`, reload e
      fallback sem Web Audio. Validação: `npm run test:browser`. — 27/08/2026: `tests/browser.mjs`
      comprova o desbloqueio único pelo primeiro gesto, abertura/fechamento do painel, volumes e
      mudo persistidos, as duas alternâncias por `M`, reload completo e a continuidade da partida
      quando `AudioContext` falha. `node --check tests/browser.mjs`, `node tests/audio.test.mjs`,
      `npm test`, `npm run test:browser` e `npm run test:multipeer:quick` verdes.
- [x] **P1D-17 — Cobrir sincronia multipeer.** Criar caso `audio` em `tests/multipeer.mjs` para
      início/fim no mesmo lote e late join sem replay do engajamento antigo. — 27/08/2026:
      `PEERS=2 CASE=audio node tests/multipeer.mjs` confirma `bossEngage` e `bossDisengage`
      para host e convidado no mesmo lote e zero replay para a entrada tardia. `node --check
tests/multipeer.mjs`, `node tests/audio.test.mjs`, `npm test`, `npm run test:browser` e
      `npm run test:multipeer:quick` verdes.

### CHECKPOINT P1 — release automatizável

- [x] **P1-G01 — Regressão headless.** Rodar `npm test` completo e registrar as medições de
      snapshot e tick incluídas nas suítes. — 27/08/2026: `npm test` verde nas 12 suítes. Nesta
      execução, o snapshot de 10 jogadores mediu 5.839 B com corte de AOI (6.334 B sem corte), e
      snapshot com duas transições de chefe mediu 3.341 B; ticks: 0,140 ms com 10 jogadores no
      host, 0,149 ms no cenário de grupo de 10 e 0,150 ms no mesmo cenário HARDCORE — todos abaixo
      dos tetos de 60.000 B e 4 ms.
- [x] **P1-G02 — Smoke de browser.** Rodar `npm run test:browser` nas viewports 1440×900,
      390×844 e 360×640. — 27/08/2026: smoke verde com `URL=http://localhost:36199 npm run
test:browser`; o harness percorreu 390×844 e 360×640 em `abrirToque()` e mediu o painel de
      áudio em 1440×900, sem erros.
- [x] **P1-G03 — Multipeer curto.** Rodar `npm run test:multipeer:quick`, incluindo checkpoint e
      áudio. — 27/08/2026: comando curto agora encadeia 2 abas nos casos `basic`, `checkpoint` e
      `audio`; todos verdes. O checkpoint comum iniciou ambas as abas no andar 4 com mapa derivado
      de `seed + floor`; áudio confirmou `bossEngage`/`bossDisengage` no mesmo lote e zero replay
      para entrada tardia.
- [x] **P1-G04 — Multipeer de 10 abas.** Rodar `npm run test:multipeer` e registrar tick máximo,
      maior snapshot e resultado por caso. — 27/08/2026: `PEERS=10 CASE=all` verde; o roteiro
      completo aprovou lotação, tranca, áudio, HUD/toque, expulsão, fila, banda e queda do host,
      sem erro de página/console. Antes de iniciar a partida, o host mede o motor isolado no mesmo
      V8 de uma sala com 10 abas: andares 8 e 9, 10 jogadores, aquecimento de 90 e 900 `step()`
      individuais por andar; a asserção conserva o máximo completo, sem média/percentil. A última
      corrida `PEERS=10 CASE=measure` marcou 0,600 ms (andar 8) e 0,400 ms (HARDCORE), ambos abaixo
      do teto obrigatório de 4 ms. O contador diagnóstico da sessão continuou registrando 7,000 ms
      sob contenção de dez renderizadores — dado de agendamento do harness, não substituto do gate
      do motor. Maior snapshot serializado: 4.513 B; pacote médio 4,2 KB e projeção de 570 KB/s
      para 9 peers.
- [x] **P1-G05 — Atualizar arquitetura.** Rodar `graphify update .`, consultar god nodes/ciclos e
      registrar qualquer regressão arquitetural acionável. — 27/08/2026: `graphify update .`
      gerou 1.429 nós, 2.460 relações e 86 comunidades; não há ciclos de importação. Os god nodes
      são `stats()` (27 relações), `step()` (25) e `frame()` (20), mantendo a simulação e o loop
      como fronteiras centrais esperadas. A regressão de P1-G04 foi removida: `js/tickbudget.js`
      separa o motor do agendador de abas e o gate de `tests/multipeer.mjs` reprova qualquer um dos
      900 `step()` acima de 4 ms. O pico sintético de 5 ms em `tests/party10.test.mjs` confirma que
      a sonda não mascara outlier; `js/sim.js` também deixou de alocar a lista de jogadores uma vez
      por monstro no mesmo tique.
- [x] **CHECKPOINT P1 — Liberar P1.** Confirmar todos os blocos P1 e P1-G01…P1-G05 marcados;
      manter explicitamente externos os cinco playtests humanos. — 27/08/2026: auditoria confirmou
      P1A, P1B, P1C, P1D e P1-G01…P1-G05 sem checkbox pendente. `npm test` verde nas 12 suítes;
      o probe individual de 10 jogadores preservou os 900 `step()` de cada cenário abaixo de 4 ms
      (0,785 ms no andar 8 e 0,494 ms no andar 9). `npm run test:browser` verde nas três viewports;
      `npm run test:multipeer:quick` verde nos casos basic, checkpoint e audio; e
      `npm run test:multipeer` verde com 10 abas, cujo gate do motor mediu máximos de 0,700 ms no
      andar 8 e 0,400 ms no HARDCORE, ambos em 900 `step()` individuais. O maior snapshot da matriz
      foi 4.603 B. `git diff --check` verde. Não foram executados nem declarados concluídos os cinco
      playtests completos humanos com decisão de “outra run”; matriz física, métrica real de sessões,
      uso por três dias e deploy de produção continuam limites externos.

### P2 — conexão, confirmação de progresso e resiliência

- [x] **P2-01 — Definir modelo puro de conexão.** Mapear sinais existentes para
      `connecting`, `stable`, `unstable` e `reconnecting`, com transições testáveis e sem alterar o
      protocolo de jogo. — 27/08/2026: `node tests/connection.test.mjs` e `npm test` verdes.
- [x] **P2-02 — Calibrar latência e instabilidade.** Centralizar janelas/limiares em
      `js/balance.js` e testar histerese para impedir oscilação visual. — 27/08/2026:
      `node tests/connection.test.mjs` e `npm test` verdes; três acks lentos degradam e três
      saudáveis, abaixo do limiar de recuperação, restauram sem flapping.
- [x] **P2-03 — Renderizar indicador.** Exibir estado, latência aproximada e texto acionável com
      paridade desktop/mobile e sem depender apenas de cor. — 27/08/2026: projeção pura
      `connectionIndicatorPresentation()` cobre os quatro estados e RTT opcional em
      `node tests/connection.test.mjs`; `npm test`, `npm run test:browser` e
      `npm run test:multipeer:quick` verdes.
- [x] **P2-04 — Ligar sinais reais.** Alimentar o modelo com abertura, ping/ack, fechamento e
      tentativa de reconexão já disponíveis, sem criar canal paralelo. — 27/08/2026:
      `node tests/connection.test.mjs`, `npm test`, browser e multipeer curto verdes; callbacks
      existentes alimentam o indicador sem nova mensagem de rede.
- [x] **P2-05 — Cobrir indicador no browser.** Simular as quatro transições, recuperação e foco/
      acessibilidade. Validação: `npm run test:browser`. — 27/08/2026: o smoke percorre
      `connecting`, `stable`, `unstable` e `reconnecting` pelo renderizador real, mede RTT,
      histerese, texto/ARIA, foco visível e contenção em desktop, 390×844 e 360×640; `npm test`,
      browser e multipeer curto verdes.
- [x] **P2-06 — Definir último progresso confirmado.** Identificar o ack autoritativo mínimo para
      XP, andar e inventário do guest, sem confiar em estado local especulativo. — 27/08/2026:
      `ConfirmedProgress` só compõe a projeção serializável após o snapshot do host (`ti`, identidade,
      XP, andar e `iv`) e a mensagem privada `inv` do mesmo dono/`iv`; duplicados e ordem antiga são
      recusados em `node tests/confirmedprogress.test.mjs`. Nenhuma gravação de queda foi ligada nesta etapa.
- [x] **P2-07 — Persistir confirmação em queda.** Em timeout/queda do host, gravar somente o último
      estado confirmado e manter escrita idempotente. — 27/08/2026: o terminal do `SessionGuard`
      grava a projeção `snapshot` + `inv` confirmada pelo host, nunca `S.view` ou inventário
      especulativo; o fingerprint de andar+personagem evita regravação do mesmo checkpoint.
      `node tests/confirmedprogress.test.mjs`, `npm test`, browser e multipeer curto verdes.
- [x] **P2-08 — Testar confirmação fora de ordem.** Cobrir ack duplicado, atrasado, reordenado e
      queda durante troca de andar; nunca regredir um save mais novo. — 27/08/2026: a suíte cobre
      `inv` adiantado, snapshot reordenado, duplicatas e acks tardios; na queda entre snapshot e
      inventário do andar novo grava somente o último par completo. O fingerprint terminal preserva
      `ti`/`iv` como watermark sem regravar o mesmo save e recusa projeção atrasada. `node
tests/confirmedprogress.test.mjs`, save/sessão/rede pertinentes e `npm test` verdes.
- [x] **P2-09 — Testar perda e reordenação.** O roteiro puro determinístico fixa o primeiro
      input perdido e dois reenvios desserializados, perda total de v2, `inv` v3 adiantado,
      snapshot antigo e duplicata; termina com projeção e tela v3, uma ação, um evento e uma
      gravação. `CASE=recovery` segura o snapshot seguinte e mede ao menos dois envios reais antes
      do ack, além da drenagem única do evento P2P, sem alterar mensagem de protocolo. — 28/08/2026:
      `node tests/recovery.test.mjs`, `PEERS=2 CASE=recovery node tests/multipeer.mjs`, `npm test`,
      `npm run test:browser` e `npm run test:multipeer:quick` verdes.
- [x] **P2-10 — Testar late join.** Cobrir entrada antes/depois do início, snapshot inicial e
      ausência de replay de evento transitório. — 28/08/2026: `PEERS=2 CASE=late node
tests/multipeer.mjs` prova a admissão pré-início no roster, o primeiro snapshot coerente ao
      começar, a fila canônica sem mundo para quem chega depois e a ausência de replay de log e
      `bossEngage` já drenados. `npm test`, `npm run test:browser` e `npm run test:multipeer:quick`
      verdes.
- [x] **P2-11 — Testar fila e tranca.** Cobrir capacidade, ordem da fila, sala trancada e promoção
      quando uma vaga abre. — 28/08/2026: `node tests/room.test.mjs` fixa FIFO, teto somando
      partida+espera, promoção de posição sem nascimento no andar atual e drenagem ordenada na
      virada. O fluxo P2P real `PEERS=8 CASE=queue node tests/multipeer.mjs` começa com 8 em
      partida: a primeira pessoa espera em `1º de 1`; a tranca recusa outra com 9/10, portanto
      sem confundir com lotação; a segunda entrada atualiza ambas para `1º de 2` e `2º de 2`; com
      10/10 a recusa é explicitamente por sala cheia e sem tranca. A saída voluntária da primeira
      promove a segunda a `1º de 1`, a vaga aceita uma nova pessoa atrás dela, e a virada confirma
      as duas no andar 2 em ordem FIFO. Corrigido o reenvio de `queued` para toda a fila, que antes
      deixava a primeira aba com o total visual antigo. `npm test`, `npm run test:browser` e
      `npm run test:multipeer:quick` verdes; `graphify update .` e `git diff --check` verdes.
- [x] **P2-12 — Testar expulsão.** Cobrir remoção pelo host, limpeza nos dois lados e mensagem
      acionável para o removido. — 28/08/2026: `PEERS=3 CASE=kick node tests/multipeer.mjs`
      percorre a confirmação inline real: o host remove o alvo do roster e da simulação, o
      sobrevivente recebe roster e snapshot limpos, e o removido encerra sem loop/autosave local,
      vê “Você saiu da sala”, progresso salvo e `Voltar ao menu`. O mesmo fluxo cria duas pessoas
      na fila, expulsa a primeira e prova a segunda em `1º de 1`; o host republica `queued` sem
      esperar o close do removido. `node tests/room.test.mjs`, `node tests/session.test.mjs`,
      `npm test`, `URL=http://localhost:5173/index.html npm run test:browser` e
      `npm run test:multipeer:quick` verdes; `graphify update .` e `git diff --check` verdes.
- [x] **P2-13 — Testar troca de andar.** Cobrir anúncio único, mapa determinístico, limpeza do
      andar anterior e confirmação de progresso. — 28/08/2026: `PEERS=2 CASE=floor node
tests/multipeer.mjs` atravessa a fronteira real `pendingFloor`: o host anuncia exatamente uma
      vez e cada convidado recebe uma, o pacote transporta apenas `floor`, e cada lado regenera o
      mapa de `seed` + andar. A janela antes do snapshot seguinte comprova a limpeza imediata de
      monstros, itens, projéteis, zonas e portal; o snapshot novo repovoa a visão e avança a projeção
      de `ConfirmedProgress`. Corrigida essa limpeza transitória do convidado. `npm test`,
      `URL=http://localhost:5173/index.html npm run test:browser` e `npm run test:multipeer:quick`
      verdes; `graphify update .` e `git diff --check` verdes.
- [x] **P2-14 — Testar checkpoints divergentes.** Cobrir grupo 1/4/7/10, reconexão e escolha
      manual anterior sem permitir andar ainda não comum. — 28/08/2026: a política pura fixa
      1/4/7/10 em somente andar 1 e invalida a escolha 4 quando o perfil de andar 1 retorna.
      `PEERS=4 CASE=checkpoint node tests/multipeer.mjs` percorre o lobby real: a saída desse
      perfil libera 1/4, o host escolhe 4, a reconexão restaura apenas 1 e o `start` efetivamente
      inicia todas as quatro abas no andar 1, com mapa ainda derivado de seed+andar. `npm test`,
      `npm run test:browser` e `npm run test:multipeer:quick` verdes; `graphify update .` e
      `git diff --check` verdes.
- [x] **P2-15 — Preservar orçamentos.** Rodar matriz com 10 abas e confirmar snapshot <60.000
      bytes e tick <4 ms em normal e HARDCORE. — 28/08/2026: `PEERS=10 CASE=measure node
tests/multipeer.mjs` verde; a sonda de 900 `step()` individuais marcou máximo de 0,900 ms
      no andar 8 e 0,500 ms no andar 9 HARDCORE, com maior snapshot real de 5.691 B. `npm test`
      e `npm run test:browser` verdes. A matriz integral de 10 abas manteve os dois orçamentos,
      mas permanece com falha independente nas asserções P2-12, sem avanço deste checkpoint.
- [x] **CHECKPOINT P2 — Liberar resiliência.** Rodar `npm test`, `npm run test:browser` e
      `npm run test:multipeer`; confirmar P2-01…P2-15 e registrar evidências. — 28/08/2026:
      `npm test`, `URL=http://localhost:5173/index.html npm run test:browser` e
      `npm run test:multipeer` verdes. A matriz integral de 10 abas voltou a validar expulsão,
      fila, queda e recuperação, sem erro de página/console; no probe de 900 `step()` o máximo foi
      0,500 ms no andar 8 normal e 0,400 ms no andar 9 HARDCORE, ambos abaixo de 4 ms. O maior
      snapshot observado foi 5.397 B, abaixo de 60.000 B.

### P3A — migrar o save v3→v4

- [x] **P3A-01 — Definir schema meta v4.** Acrescentar somente os blocos mínimos de bestiário e
      contratos, defaults vazios e limites validados; não misturar estado de run. — 28/08/2026:
      `emptySaveMetaV4()` e `normalizeSaveMetaV4()` definem `bestiary.kills` e o estado diário
      mínimo `contracts.{day,progress,claimed}`, com contadores, ids e coleções limitados; seed,
      andar e estado transitório são descartados. A versão gravada continua em v3 até a P3A-02,
      portanto esta etapa não introduz migração implícita. `node tests/save.test.mjs`,
      `node tests/validate.test.mjs` e `npm test` verdes.
- [x] **P3A-02 — Implementar migração v3→v4.** Torná-la pura, determinística e idempotente,
      preservando todo o progresso v3. — 28/08/2026: `migrateV3ToV4()` promove somente a versão
      e os defaults permanentes, sem mutar nem perder os campos v3; a normalização integra a etapa
      à cadeia. A suíte cobre reexecução, meta ausente/hostil e preservação integral.
      `node tests/save.test.mjs`, `node tests/validate.test.mjs` e `npm test`
      verdes; `graphify update .` e `git diff --check` verdes.
- [x] **P3A-03 — Preservar cadeia v1→v4.** Cobrir fixtures v1, v2 e v3 chegando ao mesmo formato
      canônico v4 sem perda de campos existentes. — 28/08/2026: fixtures históricas equivalentes
      atravessam toda a cadeia e são comparadas campo a campo após normalização, cobrindo
      progressão, poções, equipamento, índices de inventário, stats, afixos e defaults meta v4.
      `node tests/save.test.mjs`, `node tests/validate.test.mjs` e `npm test` verdes;
      `graphify update .` e `git diff --check` verdes.
- [x] **P3A-04 — Rejeitar futuro e hostil.** Cobrir versão >4, JSON inválido, campos excessivos,
      ids desconhecidos e números fora de faixa em `validateSave()`. — 28/08/2026: versões futuras,
      não inteiras e inválidas agora descartam o save integralmente, sem aplicar meta, item ou
      progresso parcial; JSON inválido também retorna nulo. A normalização limita itens e afixos à
      capacidade canônica, limita `ilvl` ao mínimo 1 e rejeita ids especiais de objeto sem deixar
      que eles ocultem ids válidos posteriores. `node tests/save.test.mjs`,
      `node tests/validate.test.mjs` e `npm test` verdes.
- [x] **P3A-05 — Provar round-trip e reload.** Cobrir write→read→write estável e falha de storage
      sem corromper o último save válido. — 28/08/2026: a serialização agora deriva `glyph` da
      base, tornando o JSON v4 canônico após reload; leitura indisponível aborta a gravação para
      não sobrescrever meta ou maior andar. A suíte prova igualdade byte a byte, meta v4 completa
      e preservação do save anterior quando `getItem` ou `setItem` lançam. `node tests/save.test.mjs`,
      `node tests/validate.test.mjs` e `npm test` verdes.
- [x] **CHECKPOINT P3A — Liberar schema v4.** Rodar `node tests/save.test.mjs`,
      `node tests/validate.test.mjs` e `npm test`; atualizar `docs/agents/data_model.md` com linhas.
      — 28/08/2026: as suítes direcionadas e `npm test` verdes. A cadeia v1→v4 chega ao
      mesmo formato canônico sem perder progresso, equipamento, mochila, stats ou afixos;
      `migrateV3ToV4()` é pura, determinística e idempotente. Versões futuras/malformadas,
      JSON inválido, ids especiais, coleções excessivas e números fora de faixa são descartados
      ou normalizados antes de entrarem na simulação. O round-trip write→read→write é byte a byte
      estável, preserva a meta v4 e não sobrescreve o último save válido quando o storage falha.
      `docs/agents/data_model.md` sincronizado para v4 e migrações atuais; `graphify update .` e
      `git diff --check` verdes.

### P3B — implementar bestiário puro

- [x] **P3B-01 — Definir catálogo derivado.** Usar os tipos existentes em `js/data.js` como fonte
      única de ids, nomes e revelações; não duplicar conteúdo no save. — 28/08/2026:
      `js/bestiary.js` deriva catálogo imutável dos 12 monstros e 4 chefes, incluindo nomes,
      afinidades, atributos e especiais; `getBestiaryEntry()` recusa ids ausentes sem consultar
      ou duplicar dados no save. `node tests/bestiary.test.mjs`, `npm test` e ESLint direcionado
      verdes; `graphify update .` e `git diff --check` verdes.
- [x] **P3B-02 — Contabilizar derrotas.** Incrementar por tipo apenas na morte autoritativa,
      ignorar duplicatas/replay e preservar contagem entre runs. — 28/08/2026: a transição
      viva→morta de `killMonster()` é guardada por entidade, e apenas ela incrementa o tipo
      conhecido do autor da derrota; o domínio puro recusa ids ausentes. O bloco `bestiary`
      passa do save normalizado ao jogador da run seguinte. `node tests/bestiary.test.mjs`,
      `npm test`, browser e multipeer quick verdes.
- [x] **P3B-03 — Calcular tiers.** Derivar marcos 1/25/100 sem gravar estado redundante e cobrir
      exatamente antes, no e depois de cada limiar. — 28/08/2026: `getBestiaryTier(kills, typeId)`
      deriva tiers 0–3 apenas do contador de tipo conhecido; ids removidos retornam `null` e
      contagens hostis não revelam tier. Os limiares vivem em `js/balance.js`, e os testes cobrem
      0/1/2, 24/25/26 e 99/100/101 derrotas sem mutar o progresso. `node tests/bestiary.test.mjs`,
      `npm test`, `graphify update .` e `git diff --check` verdes.
- [x] **P3B-04 — Derivar revelações.** Liberar texto/atributos somente pelo tier alcançado, com
      fallback seguro para tipo removido ou desconhecido. — 28/08/2026:
      `getBestiaryRevelations()` projeta somente identidade no tier 1, afinidades no tier 2 e
      atributos/especiais no tier 3; no tier 0 não vaza conteúdo e ids removidos, desconhecidos ou
      internos retornam `null`. As revelações continuam derivadas do catálogo imutável e não criam
      estado no progresso. `node tests/bestiary.test.mjs`, `npm test`, ESLint/Prettier direcionados,
      `graphify update .` e `git diff --check` verdes.
- [x] **P3B-05 — Persistir e validar.** Cobrir save, migração, clamp, round-trip e entrada hostil
      do bloco de bestiário. — 28/08/2026: o normalizador v4 aceita apenas ids do catálogo atual,
      limita contagens inteiras positivas e descarta tipos removidos/chaves especiais. A migração v3
      cria defaults ou saneia meta legada; save→reload→save preserva contagens canônicas entre runs.
      `node tests/bestiary.test.mjs`, `node tests/save.test.mjs`, `node tests/validate.test.mjs` e
      `npm test` verdes; `graphify update .` e `git diff --check` verdes.
- [x] **CHECKPOINT P3B — Liberar bestiário.** Rodar suíte pura direcionada e `npm test`; confirmar
      contagem, tiers, revelações e persistência. — 28/08/2026: `node tests/bestiary.test.mjs` e
      `npm test` verdes. O catálogo é derivado integralmente de `MONSTERS`/`BOSSES`; a única
      transição viva→morta autoritativa incrementa o tipo uma vez e o save preserva-o entre runs.
      Os tiers 0–3 são derivados de 1/25/100, as camadas não vazam conteúdo antes do marco, e
      migração, clamp, ids removidos/hostis e round-trip v4 mantêm somente contagens canônicas.

### P3C — implementar contratos puros

- [x] **P3C-01 — Definir relógio diário injetável.** Derivar chave de dia sem depender do timezone
      do host da sala e permitir teste determinístico. — 28/08/2026: `js/contracts.js` define o
      calendário UTC puro, `dayKeyFromInstant()` e `createDailyClock({now})`; a fonte injetável
      permite provar bordas e falhas sem usar o relógio do processo. `node tests/contracts.test.mjs`
      e `npm test` verdes; `graphify update .` e `git diff --check` verdes.
- [x] **P3C-02 — Gerar contratos determinísticos.** Produzir no máximo três por dia a partir de
      seed/dia, sem objetivo impossível para o conteúdo disponível. — 28/08/2026: `generateDailyContracts()`
      seleciona sem repetição até três monstros do catálogo que `populate()` pode gerar, ordenado por id e
      embaralhado por hash de `seed`+chave UTC. IDs estáveis, meta mínima de derrota e ouro determinístico
      já nascem imutáveis; o vínculo com eventos e progresso fica explicitamente para P3C-03/P3C-04. Mesma
      entrada, variação de seed/dia, teto, unicidade, catálogo disponível e entrada inválida são cobertos em
      `node tests/contracts.test.mjs`; `npm test`, `graphify update .` e `git diff --check` verdes.
- [x] **P3C-03 — Definir objetivos observáveis.** Limitar o catálogo inicial a eventos que a
      simulação já emite; cada evento conta no máximo uma vez. — 28/08/2026:
      `CONTRACT_OBSERVABLE_OBJECTIVES` deriva exclusivamente as mortes de tipos que `populate()`
      pode gerar; o evento já emitido `fx/death` agora carrega `id` e `typeId`, e a projeção pura
      exige a fonte `simulation`. IDs de evento e objetivo estáveis eliminam duplicatas no lote,
      enquanto a guarda de estado entre lotes permanece para P3C-04. Eventos inválidos, cosméticos,
      de tipo removido e de rede são descartados. `node tests/contracts.test.mjs`,
      `node tests/sim.test.mjs` e `npm test` verdes; `graphify update .` e `git diff --check` verdes.
- [x] **P3C-04 — Atualizar progresso.** Processar eventos autoritativos, ignorar replay e manter
      progresso monotônico entre runs do mesmo dia. — 28/08/2026: a projeção pura aceita somente
      mortes da simulação, deduplica ids durante a run, preserva a contagem entre runs da mesma chave
      UTC e limita cada slot à meta atual; chave divergente não é reinterpretada antes da P3C-06.
      O ciclo do host inicializa a lista diária estável, carrega/salva `p.contracts` e aplica o lote
      de `step()` sem transportar a guarda efêmera. `node tests/contracts.test.mjs`,
      `node tests/save.test.mjs`, `node tests/sim.test.mjs`, `npm test`, `npm run test:browser` e
      `npm run test:multipeer:quick` verdes; `graphify update .` e `git diff --check` verdes.
- [x] **P3C-05 — Resgatar recompensa.** Conceder ouro/consumível uma única vez, com valores em
      `js/balance.js` e operação idempotente mesmo após reload. — 28/08/2026:
      `claimDailyContractReward()` devolve uma projeção pura e imutável, exige objetivo concluído,
      marca o id antes de retornar ouro/poção e limita ouro a inteiro seguro e poções à pilha.
      O contrato diário passa a carregar a recompensa estável completa; reload por `writeSave()`/
      `loadSave()` não permite segunda concessão. `node tests/contracts.test.mjs`,
      `node tests/save.test.mjs`, `node tests/sim.test.mjs` e `npm test` verdes.
- [x] **P3C-06 — Virar o dia.** Substituir a lista anterior sem apagar recompensa já incorporada
      ao save; cobrir avanço, retorno e relógio inválido. — 28/08/2026:
      `rollDailyContracts()` recebe o relógio injetável, só troca a chave em avanço UTC válido e
      conserva a lista mais nova se o relógio retorna ou falha. A nova projeção limpa apenas os
      contratos; ouro e poções já resgatados continuam no personagem e atravessam reload. O host
      reinicia a guarda efêmera a cada run antes de aplicar a projeção diária. `node tests/contracts.test.mjs`,
      `node tests/save.test.mjs`, `npm test` e `npm run test:browser` verdes; `graphify update .`
      e `git diff --check` verdes.
- [x] **P3C-07 — Persistir e validar.** Cobrir round-trip, migração e payload hostil do bloco de
      contratos. — 28/08/2026: `normalizePersistedDailyContracts()` recompõe a lista diária a
      partir da chave UTC e aceita somente slots, metas e resgates que a recompensa determinística
      permite; ids estranhos, excesso, calendário impossível e resgate sem objetivo concluído são
      removidos antes de `writeSave()`/`validateSave()`. `node tests/contracts.test.mjs`,
      `node tests/save.test.mjs`, `node tests/validate.test.mjs` e `npm test` verdes.
- [x] **CHECKPOINT P3C — Liberar contratos.** — 28/08/2026: `node tests/contracts.test.mjs`,
      `node tests/save.test.mjs`, `node tests/validate.test.mjs` e `npm test` verdes. A auditoria
      confirmou chave UTC injetável, geração determinística limitada ao catálogo observável,
      progresso autoritativo monotônico com deduplicação efêmera, resgate idempotente, virada segura
      e saneamento/migração/persistência v4 do bloco diário.

### P3D — criar o Refúgio

- [x] **P3D-01 — Definir estado de apresentação.** Criar um view-model puro para checkpoint,
      resumo de bestiário e contratos sem acoplar DOM aos módulos de domínio. — 28/08/2026:
      `js/refuge.js` projeta checkpoints pessoais/comuns, catálogo do bestiário sem antecipar
      revelações e contratos diários com estado de resgate; a API recebe save/roster/lista
      explicitamente, não muta entradas e devolve apenas valores imutáveis e seguros para exibir.
      `node tests/refuge.test.mjs` e `npm test` verdes.
- [x] **P3D-02 — Criar entrada e saída.** Abrir o Refúgio entre runs, voltar ao lobby/jogo e não
      interferir em sala já iniciada. — 29/08/2026: a navegação conserva a origem menu/lobby e
      só reabre o lobby com sessão ainda conectada; partida, fila e encerramento confirmado recusam
      abertura, e o encerramento reexpõe seu aviso acima do Refúgio. O smoke cobre solo, host,
      convidado, fila, início de partida e fim de sessão. `node --check js/main.js`, `npm test`,
      `npm run test:browser` e `npm run test:multipeer:quick` verdes.
- [x] **P3D-03 — Exibir checkpoints.** Mostrar maior checkpoint pessoal, maior comum quando há
      grupo e escolha que será usada na próxima run. — 29/08/2026: o Refúgio projeta somente o
      checkpoint pessoal, o comum quando o roster está confirmado e a escolha efetiva da próxima
      run, sem alterar save, sala ou partida. Roster ausente/hostil cai em solo seguro; a tela se
      atualiza com roster e escolha do host. `node --check js/main.js`, `node tests/refuge.test.mjs`,
      `npm test`, `npm run test:browser` e `npm run test:multipeer:quick` verdes; `graphify update .`
      e `git diff --check` verdes.
- [x] **P3D-04 — Exibir bestiário.** Listar progresso, tiers e revelações com estado vazio e tipo
      desconhecido legíveis. — 29/08/2026: o Refúgio renderiza a projeção imutável do catálogo com
      contagem, tier e somente as camadas de revelação já liberadas; entradas ainda ocultas recebem
      texto neutro sem ids, nomes ou atributos vazados. O smoke cobre save vazio/hostil, tier 2 e
      tier 3 em browser. `node tests/refuge.test.mjs`, `npm test`, `npm run test:browser` e
      `npm run test:multipeer:quick` verdes; `graphify update .` e `git diff --check` verdes.
- [x] **P3D-05 — Exibir contratos.** Mostrar até três objetivos, progresso, conclusão, recompensa
      e ação de resgate idempotente. — 29/08/2026: o Refúgio recompõe a lista diária pelo domínio,
      apresenta objetivo, progresso, status e recompensa seguros e concede apenas por
      `claimDailyContractReward()` seguido de `writeSave()`. Clique repetido e reload mantêm o id
      resgatado, ouro e poções sem duplicação. `node tests/refuge.test.mjs`, `npm test`,
      `npm run test:browser` e `npm run test:multipeer:quick` verdes; `graphify update .` e
      `git diff --check` verdes.
- [x] **P3D-06 — Garantir teclado e acessibilidade.** Ordem de foco, labels, Escape/voltar, foco
      restaurado e informação não dependente apenas de cor. — 29/08/2026: o Refúgio recebe foco no
      título ao abrir, mantém a ordem natural de Tab sem trap e restaura o botão de origem tanto por
      Escape quanto por Voltar. Os textos de checkpoint, progresso, conclusão e recompensa não
      dependem de cor, e o resgate anuncia confirmação em `role="status"`. O smoke cobre foco,
      nomes, ordem de teclado, Escape/Voltar e indicador visível; `npm test`, `npm run test:browser`
      e `npm run test:multipeer:quick` verdes.
- [x] **P3D-07 — Fechar layout desktop.** Verificar 1440×900 sem scroll ou sobreposição indevida.
      — 29/08/2026: a composição larga usa checkpoints e contratos lado a lado e distribui o
      bestiário em quatro colunas, preservando a faixa de toque fora dessa media query. O smoke
      registra `29-refugio-desktop-1440x900.png` e mede as 16 entradas desconhecidas com três
      contratos sem scroll, estouro horizontal, painel cruzado ou botão Voltar fora da viewport;
      revelações completas podem rolar apenas dentro da tela quando o conteúdo excepcional cresce.
      `npm test`, `npm run test:browser` e `npm run test:multipeer:quick` verdes; `graphify update .`
      e `git diff --check` verdes.
- [x] **P3D-08 — Fechar layout mobile alto.** Verificar 390×844 com alvos de toque e scroll
      intencional. — 29/08/2026: a rolagem longa do bestiário fica contida no Refúgio, somente no
      eixo vertical, sem arrasto lateral ou scroll da página. O smoke mobile registra topo e fim,
      mede os três resgates e Voltar com pelo menos 44px e rola até o fim para provar que Voltar
      continua visível e recebe o toque no centro. `npm test`, `npm run test:browser` e
      `npm run test:multipeer:quick` verdes; `graphify update .` e `git diff --check` verdes.
- [x] **P3D-09 — Fechar layout mobile curto.** Verificar 360×640 sem controles inalcançáveis.
      — 29/08/2026: em 360×640, a rolagem permanece contida no Refúgio, no eixo vertical,
      e o smoke percorre cada resgate e Voltar por foco e rolagem para provar alvo de pelo menos
      44px, centro tocável e caixa inteiramente visível, sem estouro horizontal. Registra topo e
      fim em `32-refugio-mobile-360x640-topo.png` e `33-refugio-mobile-360x640-fim.png`.
      `npm test`, `npm run test:browser` e `npm run test:multipeer:quick` verdes; `graphify update .`
      e `git diff --check` verdes.
- [x] **P3D-10 — Cobrir reload no browser.** Provar que bestiário, contratos resgatados e seleção
      de checkpoint reaparecem após recarga. — 30/08/2026: o smoke grava o resgate pela própria
      interface, recarrega a página e compara o save com a projeção reaberta: tiers do bestiário,
      checkpoint pessoal/próxima run no andar 10, contrato resgatado, ouro e poções sobrevivem sem
      mutação. `npm test`, `npm run test:browser` e `npm run test:multipeer:quick` verdes;
      `graphify update .` e `git diff --check` verdes.
- [x] **CHECKPOINT P3D — Liberar Refúgio.** — 30/08/2026: a auditoria confirmou P3D-01…P3D-10
      no estado atual. O smoke de browser executou 1440×900 sem scroll/sobreposição, 390×844 com
      rolagem vertical contida e alvos de 44px, 360×640 com todos os controles focáveis e tocáveis,
      além do reload de checkpoint, bestiário e contrato resgatado. `npm test`,
      `npm run test:browser` e `npm run test:multipeer:quick` verdes; `graphify update .` e
      `git diff --check` verdes.

### CHECKPOINT P3 — release candidate local

- [x] **P3-G01 — Regressão de migração.** Rodar fixtures v1→v4, reload e rejeição de versão
      futura em sequência limpa. — 30/08/2026: `tests/save.test.mjs` agora percorre cada fixture
      histórica pelo storage, regrava no formato v4, recarrega em instância nova e confirma a
      equivalência canônica; a versão futura é descartada em storage próprio sem contaminar a
      inicialização seguinte. `node tests/save.test.mjs`, `npm test`, `graphify update .` e
      `git diff --check` verdes.
- [x] **P3-G02 — Regressão de browser.** Rodar o smoke completo nas três viewports oficiais.
      — 30/08/2026: `npm run test:browser` verde no smoke integral. O roteiro executa os fluxos
      P3 do Refúgio — entrada/saída, checkpoint, bestiário, contratos com resgate idempotente,
      reload e acessibilidade — e mede 1440×900 sem scroll/sobreposição, 390×844 com rolagem
      vertical intencional e alvos de 44px, e 360×640 com todos os controles focáveis e tocáveis.
      `graphify update .` e `git diff --check` verdes.
- [x] **P3-G03 — Regressão multipeer.** Rodar todos os casos com 10 abas e registrar orçamento.
      — 30/08/2026: `PORT=5215 PEERS=10 CASE=all npm run test:multipeer` terminou com código 0
      e “Tudo verde”, cobrindo sala cheia, tranca, entrada tardia/fila, áudio, corte/expulsão,
      queda do host, HUD e toque em 13 abas totais quando o roteiro abre extras. No probe isolado
      de 10 jogadores, andares 8/9 ficaram em 0,130/0,161 ms médios e 1,700/1,500 ms máximos
      (900 steps, limite 4 ms). Na sessão real: snapshot máximo 3.813 B (limite 60.000 B), pacote
      médio 3,3 KB e projeção de 441 KB/s para nove peers (49 KB/s por peer, abaixo de 900/120
      KB/s); tick observado 7,200 ms. A medição é de harness com CPU/GPU compartilhadas, por isso
      o FPS mediano de 1 não é usado como teto de produção; todos os convidados continuaram a
      receber snapshots e não houve erro de página ou console.
- [x] **P3-G04 — Atualizar o grafo.** Rodar `graphify update .`, revisar god nodes, ciclos e novas
      dependências cruzadas; abrir checkbox corretiva se houver regressão. — 30/08/2026:
      `graphify update .` reextraiu 55 arquivos de código e não detectou mudança de topologia; o
      grafo permanece com 1.596 nós. Os god nodes seguem no núcleo da simulação (`addPlayer()`,
      `createGame()`, `step()` e `stats()`), sem novo acoplamento P3. Não há ciclos de importação;
      as travessias confirmam `main.js→save.js`, `main.js→contracts.js`, `main.js→refuge.js` e
      `validate.js→save.js→contracts.js`, todas no sentido esperado. Nenhuma regressão concreta
      justificou checkbox corretiva.
- [x] **P3-G05 — Atualizar documentação.** Sincronizar README, arquitetura, modelo de dados,
      protocolo e troubleshooting com os contratos realmente implementados. — 30/08/2026:
      `README.md` registra Refúgio, tiers e contratos; `docs/agents/architecture.md` delimita
      `bestiary.js`/`contracts.js`/`refuge.js`; `data_model.md` descreve o save v4 sem duplicar
      catálogo ou lista diária; `api_contracts.md` atualiza o `save` de `join`/`revoc` e deixa
      explícita a ausência de nova mensagem P2P; e `troubleshooting.md` cobre os estados e
      recuperações P3. `npx prettier --check` nos documentos, `graphify update .` e
      `git diff --check` verdes.
- [x] **CHECKPOINT P3 — Declarar release candidate local.** — 30/08/2026: auditoria estrita no
      estado atual confirmou P3A…P3D e P3-G01…P3-G05. `npm test` passou; o smoke oficial passou
      nas viewports 1440×900, 390×844 e 360×640; e
      `PORT=5215 PEERS=10 CASE=all npm run test:multipeer` passou com 10 peers, máximo de 0,500 ms
      nos probes isolados de `step()`, snapshot máximo de 5.170 B e projeção de 630 KB/s do host
      para nove peers. `graphify update .` não encontrou alteração de topologia, e o grafo segue sem
      ciclos de importação; `git diff --check` passou. Permanecem externos os testes físicos e o uso
      por três dias.

### Release — publicar e verificar

- [x] **REL-01 — Preparar a Vercel CLI (ação de ambiente).** — 30/08/2026: Vercel CLI 59.10.0
      instalada; autenticação concluída e `vercel whoami` confirmou `filipebruniera`.
- [x] **REL-02 — Confirmar vínculo do projeto.** — 30/08/2026: vínculo confirmou
      `filipebrunieras-projects/shadowfall`; `vercel env pull --yes` criou `.env.local` sem
      sobrescrever segredo local existente.
- [x] **REL-03 — Criar preview.** — 30/08/2026: preview em
      `https://shadowfall-n4s1g5cfz-filipebrunieras-projects.vercel.app`; smoke Chromium passou
      sobre entrada, lobby, run, áudio, queda/reconexão e Refúgio, sem erro de console.
- [x] **REL-04 — Verificar observabilidade.** — 30/08/2026: logs do preview confirmaram HTTP 200
      somente para `CLS`, `FCP`, `INP`, `LCP`, `TTFB` e métricas `game_*` permitidas, sem erro da
      função nem nome, sala ou save; `/api/vitals` agora fecha a allowlist e a página em `/`.
- [x] **REL-05 — Publicar produção.** Executar `vercel --prod` somente após preview verde e
      registrar URL/deployment id. — 31/08/2026: produção `Ready` em
      `https://shadowfall-91vclp1nh-filipebrunieras-projects.vercel.app` (deployment
      `dpl_CCSKVNdyEfqWGbKH3R7x3BtWJKYP`); aliases
      `shadowfall-taupe.vercel.app` e `shadowfall-filipebrunieras-projects.vercel.app` criados.
- [x] **REL-06 — Smoke pós-produção.** Repetir o caminho crítico em produção, validar headers de
      áudio/cache e confirmar ausência de erro novo nos logs. — 31/08/2026: após desativar somente
      o SSO de deployment, `URL=https://shadowfall-91vclp1nh-filipebrunieras-projects.vercel.app`
      `npm run test:browser` passou com combate, virada, chefe HARDCORE, toque e áudio, sem erro de
      página/console. `GET /`, `js/audio.js` e `js/audioweb.js` retornaram 200 com
      `Cache-Control: public, max-age=0, must-revalidate`, `X-Content-Type-Options: nosniff` e
      `Referrer-Policy: strict-origin-when-cross-origin`; `POST /api/vitals` retornou 200 e
      `vercel logs --level error --since 15m` não encontrou erros.
- [x] **CHECKPOINT RELEASE — Encerrar o roadmap técnico.** Confirmar REL-01…REL-06 e separar no
      relatório final o que foi automatizado do que continua dependendo dos testes humanos abaixo.
      — 31/08/2026: REL-01…REL-06 confirmadas. Produção Ready, regressão headless e smoke público
      verdes, headers de segurança/cache e telemetria HTTP verificados, sem erros nos logs. Os cinco
      limites externos abaixo permanecem deliberadamente fora deste checkpoint técnico.

## P4 — contas sociais, persistência na VPS, telemetria e feedback

Esta fase começa depois do release técnico local. Ela não transforma o host P2P em servidor de
simulação: `js/sim.js` continua puro, o mapa continua derivado de `seed` + `floor` e o save de um
convidado continua hostil até passar por `validateSave()`. A conta é opcional; quem não entrar
continua jogando e salvando localmente.

Estado verificado antes do planejamento: a VPS SSH `Capabilities` já possui PostgreSQL 16 em
loopback, Nginx e PHP 8.4-FPM, mas a API/banco existentes pertencem a `mare_mahjong`. O Shadowfall
receberá banco, papel, diretório, vhost, credenciais e logs próprios; nunca reutilizará tabelas,
usuários ou segredos daquele projeto. A Vercel mantém o frontend e `/api/vitals`; a VPS atenderá
uma nova API HTTPS de dados do Shadowfall. `VITALS_SHEETS_URL` permanece uma trilha anônima e
separada para métricas agregadas.

### Decisões registradas para a entrevista P4A-01

- Proposta-base: conta opcional com Google e Facebook por Auth0; Instagram não entra no primeiro
  release sem uma verificação específica de compatibilidade e política da Meta.
- Identidade persistida: somente o `sub` opaco do provedor. E-mail, nome, foto, código de sala,
  token social e save cru nunca entram na planilha de vitals nem no protocolo P2P.
- Feedback: anônimo por padrão; uma pessoa autenticada poderá marcar voluntariamente que aceita
  vinculá-lo ao identificador opaco. Não haverá campo de contato sem decisão expressa posterior.
- Save em nuvem: o `localStorage` v4 continua como cache/fallback. A primeira sincronização é
  explícita e mostra conflito; nenhuma cópia local ou remota é sobrescrita silenciosamente.
- Topologia: navegador → Auth0 → API HTTPS dedicada na VPS → PostgreSQL em loopback. O navegador
  não abre conexão com a porta 5432, e token de conta não atravessa PeerJS/DataChannel.

Ordem de dependência: **P4A → P4B → P4C → P4D → P4E/P4F → checkpoint P4 → rollout P4**. As
fases P4E e P4F podem avançar em paralelo somente depois de P4D, mas cada run ainda executa uma
única checkbox. Qualquer integração Marketplace é provisionada antes do código que a consome; a
etapa que exigir login em dashboard do provedor deve parar e solicitar a conclusão do usuário.

### P4A — decisão, privacidade e contrato de fronteira

- [ ] **P4A-01 — Fechar a entrevista de produto.** Registrar aprovação explícita para Google,
      Facebook, conta opcional, feedback anônimo com vínculo opt-in, retenção inicial e exclusão
      de Instagram do v1. Registrar também quem controla domínio/DNS e quem pode concluir os
      consoles Auth0, Google e Meta. Validação: documento de decisão assinado no repositório; não
      iniciar provisionamento enquanto uma escolha material permanecer ambígua.
  - **Bloqueio — 31/08/2026:** há apenas uma proposta-base em “Decisões registradas”; falta a
    aprovação explícita do responsável pelo produto, a retenção inicial e a identificação de quem
    controla domínio/DNS e conclui os consoles Auth0, Google e Meta. Nenhum provisionamento foi iniciado.
- [ ] **P4A-02 — Definir dados e consentimento.** Enumerar campos permitidos de conta, save,
      telemetria identificada e feedback; definir finalidade, prazo de retenção, exportação e
      exclusão. Proibir e-mail/nome/token em `VITALS_SHEETS_URL`, chat, snapshot e logs de jogo.
      Validação: matriz campo→finalidade→destino e teste de rejeição de campos extras.
- [ ] **P4A-03 — Fixar domínios e callbacks.** Escolher o domínio público do jogo e o subdomínio
      exclusivo da API; registrar origens CORS exatas, URLs de callback/logout do Auth0 e política
      de preview. Não aceitar `*` para origens autenticadas. Validação: tabela de URLs aprovada e
      `curl -I` em produção/preview sem redirecionamento inesperado.
- [ ] **P4A-04 — Criar ADR da exceção arquitetural.** Documentar que conta/nuvem introduzem API
      PHP e PostgreSQL fora do frontend estático, e que qualquer dependência de autenticação só
      entra depois do provisionamento. Preservar as fronteiras: simulação sem DOM, save hostil
      validado, P2P sem token e mapa fora da rede. Validação: revisão de `AGENTS.md`, arquitetura,
      dados e contrato HTTP com as regras negativas explícitas.
- [ ] **CHECKPOINT P4A — Autorizar infraestrutura.** Confirmar P4A-01…P4A-04, a política de
      privacidade mínima e as contas que exigem ação manual do usuário. Este checkpoint não cria
      banco, chave, usuário nem aplicação.

### P4B — fundação isolada na VPS Capabilities

- [ ] **P4B-01 — Auditar sem tocar no Mahjong.** Inventariar versão PostgreSQL, backups, espaço,
      atualização de segurança, vhosts Nginx, certificados e processo de deploy existentes;
      confirmar que `mare_mahjong` não será alterado. Validação: inventário somente-leitura
      arquivado, com portas 5432 restrita a loopback e 80/443 como únicas entradas públicas.
- [ ] **P4B-02 — Criar isolamento PostgreSQL.** Criar database, schema e role exclusivos de
      Shadowfall, com privilégio mínimo, senha fora do repositório e sem acesso ao banco Mahjong.
      Validação: conexão do novo role acessa apenas seu schema; consultas ao schema Mahjong falham.
- [ ] **P4B-03 — Criar API e vhost separados.** Implantar diretório/processo PHP próprios atrás de
      Nginx em subdomínio dedicado, com TLS, `Host` esperado, limites de corpo e `GET /healthz`
      sem dados sensíveis. Validação: `curl --fail https://api.<domínio>/healthz` retorna 200;
      host inválido e HTTP sem TLS não expõem a aplicação.
- [ ] **P4B-04 — Definir segredos e operação.** Criar usuário de deploy sem login interativo,
      permissões de arquivo mínimas, arquivo de ambiente fora da raiz web, rotação documentada e
      logs por aplicação. Validação: busca no diretório servido e no repositório não encontra DSN,
      senha, segredo Auth0 ou chave de serviço; reinício preserva a configuração.
- [ ] **P4B-05 — Implantar migração basal reversível.** Versionar o schema da nova API com tabela
      de migrações e rollback validado em banco vazio. Ainda não criar tabelas de gameplay sem o
      contrato de P4C/P4D. Validação: aplicar→listar versão→rollback→reaplicar em instância de
      teste sem tocar em `mare_mahjong`.
- [ ] **P4B-06 — Criar gate de testes da API.** Adotar runner PHP canônico e fixtures isoladas;
      ele deve rodar sem rede externa e falhar em primeiro erro. Validação: comando documentado
      `php tests/run.php` cobre health, configuração ausente e banco de teste; incluí-lo no gate de
      release junto de `npm test`.
- [ ] **P4B-07 — Provar backup e restauração.** Executar dump criptografado/retido conforme P4A,
      restaurar em banco de teste e medir que o banco de produção não foi usado como destino.
      Validação: checksum do dump, contagem equivalente após restore e ausência de credenciais no
      relatório.
- [ ] **CHECKPOINT P4B — Liberar a API vazia.** Confirmar isolamento de banco, HTTPS, segredos,
      migração, testes e backup. Nenhuma conta, save ou feedback real é aceito antes deste ponto.

### P4C — autenticação social opcional

- [ ] **P4C-01 — Provisionar Auth0 antes do frontend.** Adicionar a integração Auth0 descoberta
      no Marketplace ao projeto Vercel, listar apenas nomes de variáveis e registrar o handoff de
      dashboard. Validação: `vercel integration list` mostra o recurso; nenhum segredo é impresso
      ou gravado em `.env.local` versionado.
- [ ] **P4C-02 — Configurar Google.** Criar credenciais OAuth próprias, tela de consentimento e
      callback autorizado do Auth0; pedir somente escopos mínimos de identidade. Validação: login
      e logout reais em conta de teste, callback exato e ausência de escopo sensível desnecessário.
- [ ] **P4C-03 — Configurar Facebook.** Criar aplicação Meta própria, URL de privacidade, domínio
      e callback autorizados; testar conta de teste separada. Validação: fluxo completo não expõe
      token no URL, no console ou no log da VPS.
- [ ] **P4C-04 — Manter Instagram fora do v1.** Registrar a decisão como não suportada até haver
      documentação atual de OAuth de identidade, perfil mapeável e aprovação de política; não
      apresentar botão enganoso. Validação: login mostra apenas provedores efetivamente configurados.
- [ ] **P4C-05 — Integrar login sem bloquear o jogo.** Inserir entrar/sair no menu e no Refúgio,
      mantendo Solo/Host/Entrar em sala funcionais sem conta e com foco, teclado, leitor de tela e
      estados de carregamento/erro claros. Validação: `npm run test:browser` cobre visitante,
      sessão autenticada mockada, cancelamento, logout e 360×640/390×844/1440×900.
- [ ] **P4C-06 — Validar tokens exclusivamente na API.** A API verifica assinatura, emissor,
      audiência, expiração e `sub` via JWKS cacheado; CORS aceita somente as origens aprovadas.
      PeerJS, snapshots, chat, `localStorage` de save e Google Sheets nunca recebem bearer token.
      Validação: `php tests/run.php` recusa token ausente, adulterado, expirado, de audiência/origem
      errada e aceita somente fixture assinada válida; inspeção de pacotes P2P prova zero token.
- [ ] **P4C-07 — Criar perfil opaco e direitos da conta.** Persistir apenas `sub` e timestamps;
      oferecer apagar conta/dados e exportar dados pelo mesmo sujeito autenticado. Validação:
      dois provedores não colidem, um sujeito não lê outro e exclusão/exportação passa pelo teste
      de autorização.
- [ ] **CHECKPOINT P4C — Liberar login opcional.** Rodar gates PHP/browser/headless e testar os
      dois provedores reais com ações manuais do usuário. O jogo offline/local continua jogável.

### P4D — save v4 na nuvem sem quebrar o P2P

- [ ] **P4D-01 — Especificar envelope de save remoto.** Definir tabelas para perfil, save por
      vocação, revisão monotônica, payload v4 normalizado e data de atualização; nunca aceitar
      mapa, estado de run, token ou inventário sem saneamento. Validação: schema SQL revisado e
      fixtures v1→v4 existentes mapeadas sem perda de campos permitidos.
- [ ] **P4D-02 — Garantir paridade de validação.** Extrair contrato testável ou implementar
      validador equivalente na API, comparado contra fixtures de `validateSave()` e `save.test`.
      Uma divergência entre navegador e servidor bloqueia a escrita. Validação: matriz de fixtures
      válidas/hostis produz o mesmo veredito e forma canônica nos dois lados.
- [ ] **P4D-03 — Criar leitura e escrita condicionais.** Expor somente endpoints autenticados de
      leitura/escrita por vocação, com revisão/ETag ou compare-and-swap para impedir que duas abas
      sobrescrevam progresso silenciosamente. Validação: corrida de duas revisões preserva a mais
      nova ou devolve conflito explícito, nunca resposta 200 enganosa.
- [ ] **P4D-04 — Implementar reconciliação inicial explícita.** Ao entrar, comparar save local e
      remoto e mostrar Local, Nuvem e Cancelar com resumo seguro de XP/andar/data. Não usar regra
      automática enquanto houver divergência. Validação: browser cobre local maior, nuvem maior,
      empate, payload hostil e cancelamento sem escrita remota.
- [ ] **P4D-05 — Sincronizar só estado confirmado.** No host e convidado, enviar ao backend apenas
      a projeção já pronta para `writeSave()`/`persistConfirmedProjection()` e nunca `S.view` ou
      ação especulativa. Validação: queda, reordenação e troca de andar mantêm as garantias de
      `confirmedprogress.test.mjs`; teste de rede comprova zero alteração do protocolo PeerJS.
- [ ] **P4D-06 — Proteger contra rollback e duplicação.** Guardar watermark/revisão por vocação,
      tornar retries idempotentes e rejeitar escrita antiga, versão futura e payload excessivo.
      Validação: testes PHP e Node cobrem reenvio, timeout, duas abas, versão >4 e perda entre
      snapshot/inventário.
- [ ] **P4D-07 — Preservar degradação local.** Falha de Auth0, API, CORS, banco ou quota remota
      mostra estado acionável e deixa `localStorage` funcionar sem apagar nem rebaixar o save.
      Validação: browser com API indisponível completa uma run e recarrega o save local íntegro.
- [ ] **P4D-08 — Cobrir migração e exclusão.** Exportar JSON canônico por conta, apagar todos os
      saves/revisões no escopo do sujeito e manter o save local até o usuário optar por limpá-lo.
      Validação: export não mistura contas; exclusão impede nova leitura e não toca dados Mahjong.
- [ ] **CHECKPOINT P4D — Liberar nuvem opt-in.** Rodar `npm test`, `npm run test:browser`,
      `php tests/run.php` e smoke HTTPS; confirmar paridade, conflitos, offline e P2P intacto.

### P4E — telemetria útil sem identificação indevida

- [ ] **P4E-01 — Congelar a trilha anônima existente.** Manter `/api/vitals` e `VITALS_SHEETS_URL`
      somente para Core Web Vitals e `game_*` numéricos permitidos. Não acrescentar `sub`, e-mail,
      nome, sala, save, IP bruto ou texto de feedback à planilha. Validação: `node tests/vitals.test.mjs`
      e inspeção de logs/payload continuam aceitando apenas allowlist.
- [ ] **P4E-02 — Definir eventos identificados opt-in.** Criar catálogo fechado de eventos de
      conta/sincronização e uma finalidade para cada um; cada linha usa sujeito opaco e retenção
      definida por P4A. Validação: API rejeita evento fora do catálogo, sujeito ausente e tentativa
      de gravar atributo pessoal.
- [ ] **P4E-03 — Registrar funil de nuvem corretamente.** Medir login iniciado/concluído, conflito,
      escolha local/nuvem, sync sucesso/falha e primeiro checkpoint posterior, sem confundir
      tentativas nem criar identificador persistente para visitante. Validação: fluxo de teste gera
      uma linha por transição e retries não duplicam eventos.
- [ ] **P4E-04 — Montar consultas operacionais.** Criar visão de sessões agregadas da planilha e
      visão protegida da VPS para adoção de conta, sucesso de sync, mortes, duração e avanço por
      checkpoint. Distinguir claramente total de eventos de total de contas. Validação: fixtures
      calculam métricas conhecidas e a consulta não retorna e-mail, token, texto de feedback ou save.
- [ ] **P4E-05 — Definir observabilidade e retenção.** Alertar erros de API/sync sem logar corpo de
      save; documentar inspeção de logs Vercel/VPS e expiração de dados. Validação: falha simulada
      produz código/correlação opaca e nenhum dado pessoal no log.
- [ ] **CHECKPOINT P4E — Liberar análise separada.** Confirmar que planilha anônima e banco de
      contas não se misturam, com dashboards reprodutíveis e política de retenção executável.

### P4F — feedback do jogador

- [ ] **P4F-01 — Definir contrato de feedback.** Fixar campos: nota 1…5, categoria fechada,
      comentário limitado, contexto técnico seguro (versão, viewport, modo e andar) e sinal
      explícito de vínculo à conta. Não coletar contato por padrão. Validação: tabela de payload
      com mínimos/máximos e campos proibidos revisada em P4A.
- [ ] **P4F-02 — Criar endpoint isolado.** Implementar `POST /feedback` na API VPS, distinto de
      `/api/vitals` e da planilha; validar JSON, tamanho, UTF-8 e categoria antes de gravar.
      Validação: `php tests/run.php` aceita caso válido e recusa HTML/script, corpo excessivo,
      categoria inválida e método/origem errados.
- [ ] **P4F-03 — Proteger o envio anônimo.** Aplicar limite por janela, honeypot/tempo mínimo,
      resposta uniforme e limpeza de conteúdo para impedir spam, XSS e exfiltração. Não depender
      de `localStorage` como limite de segurança. Validação: rajada excedente recebe 429, input
      malicioso não é renderizado e usuário legítimo volta a enviar após a janela.
- [ ] **P4F-04 — Construir a UI acessível.** Adicionar entrada em Menu/Refúgio, diálogo com foco,
      Escape/Voltar, labels, estado de envio/sucesso/erro e botão de continuar anônimo. Não cobrir
      combate nem abrir automaticamente. Validação: `npm run test:browser` cobre teclado, leitor
      de tela, erros, envio repetido e as três viewports oficiais.
- [ ] **P4F-05 — Implementar vínculo opt-in.** Quando autenticado e o checkbox estiver marcado,
      a API associa apenas o sujeito opaco; desmarcado ou visitante gera feedback sem conta. Nunca
      derivar vínculo de nome, sala, IP ou save. Validação: consultas mostram separação inequívoca
      entre feedback anônimo e vinculado; outra conta não lê nem altera o registro.
- [ ] **P4F-06 — Criar consulta de triagem protegida.** Fornecer visão administrativa mínima por
      categoria, nota, versão e status, com acesso autenticado e sem expor feedback publicamente.
      Validação: rota anônima recebe 401/403; exportação administrativa registra acesso e respeita
      a exclusão de conta.
- [ ] **CHECKPOINT P4F — Liberar feedback.** Confirmar contrato, antispam, acessibilidade,
      privacidade, isolamento da planilha e testes completos antes de convidar jogadores externos.

### CHECKPOINT P4 — integração de conta e dados

- [ ] **P4-G01 — Regressão do jogo.** Rodar `npm test`, `npm run test:browser`,
      `npm run test:multipeer:quick` e a matriz de 10 abas; corrigir apenas regressões causadas por
      login/sync/feedback. Validação: simulação, save local, P2P, mapa derivado, orçamento e áudio
      conservam seus gates atuais.
- [ ] **P4-G02 — Regressão da API.** Rodar `php tests/run.php`, migração em banco de teste,
      smoke TLS, teste de backup/restore e testes de autorização Google/Facebook com contas de
      teste. Validação: nenhum endpoint aceita token inválido, origem indevida, save hostil ou
      acesso cruzado entre sujeitos.
- [ ] **P4-G03 — Revisão de segurança e privacidade.** Inspecionar repositórios, logs, Vercel,
      Nginx e PostgreSQL para segredos, CORS amplo, tokens no browser/P2P, banco exposto ou PII
      fora do destino autorizado. Validação: checklist assinado e correção de cada achado P0/P1.
- [ ] **P4-G04 — Atualizar grafo e documentação.** Rodar `graphify update .` após alterações de
      código, revisar novas dependências e sincronizar README, arquitetura, dados, API,
      troubleshooting e política de privacidade. Validação: sem ciclo de importação novo, contratos
      de save/P2P citados por arquivo:linha e `git diff --check` verde.
- [ ] **CHECKPOINT P4 — Declarar beta de contas.** Confirmar P4A…P4F e P4-G01…P4-G04. A beta
      continua com conta opcional e sem Instagram; não declara concluídos os testes humanos abaixo.

### Rollout P4 — publicar sem perda de progresso

- [ ] **P4-R01 — Criar preview isolado.** Usar Auth0/DB de teste, domínio de preview e banco sem
      dados reais; nunca apontar preview ao banco de produção. Validação: login, save, conflito e
      feedback de teste não aparecem em produção.
- [ ] **P4-R02 — Fazer playtest de migração.** Em dois navegadores/perfis, provar visitante→login,
      local→nuvem, conflito, logout, offline, exclusão e retorno ao jogo local. Validação: roteiro
      manual assinado com capturas e nenhum save anterior perdido.
- [ ] **P4-R03 — Publicar a API e o frontend.** Aplicar migrações, verificar backup, publicar VPS
      e Vercel na ordem documentada, sem abrir PostgreSQL. Validação: health, smoke de produção,
      headers, logs, dashboard e rollback ensaiado verdes.
- [ ] **P4-R04 — Convidar grupo pequeno.** Convidar 5 jogadores para a beta, coletar somente
      consentimentos necessários e acompanhar feedback/erros por período definido em P4A.
      Validação: cada pessoa consegue jogar sem conta e, quando escolhe entrar, sincroniza sem
      acesso a dados de outra pessoa.
- [ ] **P4-R05 — Avaliar dados e decidir expansão.** Revisar telemetria, conflito, falha de sync,
      feedback e suporte; decidir manter, ajustar ou encerrar beta antes de cogitar Instagram ou
      tornar conta obrigatória. Validação: relatório compara métricas com a linha de base solo e
      lista ações corretivas fechadas ou nova checkbox.
- [ ] **CHECKPOINT ROLLOUT P4 — Encerrar a beta.** Confirmar P4-R01…P4-R05, backup recuperável,
      conta opcional e relatório de dados/feedback. Produção ampla exige decisão explícita do dono.

## Limites externos que código local não pode declarar concluídos

- Cinco playtests completos com decisão de “outra run”.
- Matriz física Chrome desktop, Android Chrome e iOS Safari em duas redes.
- Meta de 9/10 sessões reais chegando ao checkpoint seguinte.
- Uso por cinco jogadores em três dias distintos.
- Deploy de produção sem CLI/autenticação Vercel disponível.
