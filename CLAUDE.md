# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> `AGENTS.md`, `CLAUDE.md` e `docs/agents/*.md` são gerados por `/ai-context`
> (plugin `bc-harness`). Rodar o comando de novo sobrescreve edições manuais deste
> arquivo — reaplique o conteúdo abaixo depois de regenerar.

## O que é

Shadowfall — MMORPG isométrico de masmorra infinita, co-op até 10 jogadores, 100% no
navegador. Sem build, sem bundler, sem backend de jogo, sem banco, sem conta. ESM puro
servido estático; o único deploy é `outputDirectory: "."` na Vercel.

## Comandos

```sh
npm run dev                  # npx serve -l 5173 . (file:// não funciona: ESM bloqueia)
npm test                     # 11 suítes headless em Node, encadeadas com &&
node tests/sim.test.mjs      # suíte única — rode o arquivo direto
npm run lint                 # eslint . --ext .js,.mjs
npm run format:check         # prettier --check
npm run check                # lint + format:check + test — o mesmo que o CI roda
npm run test:browser         # smoke em Chromium (Puppeteer), inclui viewport mobile
npm run test:multipeer       # PEERS=10 CASE=all — abas reais em sessão P2P real
npm run test:multipeer:quick # PEERS=2
```

- `tests/browser.mjs` **não sobe servidor**: rode `npm run dev` e exporte
  `URL=http://localhost:5173`. Aceita também `CHROME` e `OUT`.
- `tests/multipeer.mjs` sobe servidor `node:http` próprio. Env: `PORT`, `PEERS`,
  `CASE` (`basic|full|lock|kick|late|drop|measure|shot|all`), `CHROME`, `BASE`, `HEADED`.
  Precisa de rede: o handshake passa pelo broker público do PeerJS.
- CI (`.github/workflows/ci.yml`) roda só `npm run check` em Node 22. `test:browser` e
  `test:multipeer` ficam fora — rode local ao mexer em render, UI ou rede.
- Pré-commit: husky + lint-staged (`prettier --write` e `eslint --fix` no que está staged).

### Armadilhas dos testes

- `tests/audio.test.mjs` **não está** na cadeia do `npm test`. Roda e passa avulso
  (`node tests/audio.test.mjs`); mexeu em `js/audio*.js`, chame na mão.
- `test:vitest` é demo: `vitest.config.js` inclui só `tests/vitest.*.test.mjs`, e o único
  arquivo é `tests/vitest.demo.test.mjs`. A suíte real são os `*.test.mjs` sem framework.
- `eslint.config.js` e `.prettierignore` ignoram `tests/browser.mjs` e `tests/multipeer.mjs`.
- Suíte nova segue o padrão verbatim: `let failures = 0`, `check(label, cond, extra='')`
  imprimindo `  ok  ` / ` FAIL`, `process.exit(failures ? 1 : 0)` no fim. Sem framework,
  sem helper compartilhado. Adicione o arquivo ao script `test` do `package.json`.

## Arquitetura

Host autoritativo em topologia estrela: todo mundo conecta só no host, nunca entre si.
Host simula a 30Hz e envia snapshot a 15Hz, **um pacote por destinatário**, recortado por
área de interesse (~20 tiles). Convidado manda input a 30Hz, interpola remotos e prediz o
próprio movimento.

Camadas, do puro ao sujo:

| Camada                         | Arquivos                                                                                                                                                                                                                           | Regra                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Política pura (Node, zero DOM) | `sim.js`, `save.js`, `validate.js`, `room.js`, `session.js`, `progression.js`, `actqueue.js`, `chatgate.js`, `allyrail.js`, `elite.js`, `telemetry.js`, `audio.js`, `audioprefs.js`, `world.js`, `rng.js`, `balance.js`, `data.js` | testável direto em Node; é onde os `*.test.mjs` batem |
| Transporte                     | `net.js`                                                                                                                                                                                                                           | snapshot/AOI/interpolação; classe `Net` sobre PeerJS  |
| Navegador                      | `render.js`, `ui.js`, `audioweb.js`, `main.js`                                                                                                                                                                                     | Canvas 2D, DOM, WebAudio                              |

`js/main.js` é a cola: loop, input, save, e o protocolo P2P — `hostMsg()`
(`js/main.js:609`) trata o que chega no host (`join`, `revoc`, `in`, `chat`, `lock`,
`checkpoint`, `bye`…), `guestMsg()` (`js/main.js:677`) trata o que chega no convidado
(`s` = snapshot, `start`, `floor`, `roster`, `queued`, `refused`, `chatBlocked`…).
Mensagem nova exige os dois lados e, se muda estado de jogo, teste em `tests/net.test.mjs`.

### Invariantes que sustentam o resto

1. **`js/sim.js` nunca toca DOM.** `window`/`document` ali quebram `node tests/sim.test.mjs`.
2. **Número de tuning só em `js/balance.js`.** `sim.js`, `save.js`, `net.js`, `audio.js` e
   os testes importam de lá. Literal solto na lógica é bug de convenção.
3. **O mapa não trafega.** Os dois lados geram 72x72 de `(seed ^ floor * 0x9e3779b9)` em
   `js/world.js:9`. Só entidade e evento vão pelo fio.
4. **Save de convidado é entrada hostil.** `js/validate.js` recomputa nível a partir de
   `totalXp`, limita `ilvl` pelo andar, descarta referência inexistente e clampa faixas
   antes de qualquer coisa entrar na simulação.
5. **Um só sistema de coordenadas.** Entidade em tile float; a projeção isométrica só
   acontece no desenho (`js/render.js`). Câmera, mira, clique e projétil no mesmo espaço.
6. **Save v3 com migração.** `SAVE_VERSION = 3` e as migrações v1→v2→v3 em `js/save.js`;
   storage é injetável (`setStorage()` / `memoryStorage()`). Mudou schema: nova migração +
   caso em `tests/save.test.mjs`.
7. **Zero dependência de runtime.** `package.json` não tem `"dependencies"`. PeerJS 1.5.4
   vem de `<script>` CDN (`index.html:280`) e `web-vitals` do import map
   (`index.html:23`); tudo em `devDependencies` é ferramenta.
8. **Zero build.** `vercel.json` tem `framework: null` e `buildCommand: "echo 'sem build'"`.
   Não introduza bundler, transpiler nem passo de geração.

### Fora do jogo

`api/vitals.js` é a única função serverless: recebe POST de Web Vitals e de métricas
`game_*` (allowlist fechada), loga e repassa para `VITALS_SHEETS_URL` se a env existir
(setup em `GOOGLE_SHEETS_SETUP.md`). Nada de jogo passa por ela.

## Convenções

- pt-BR em comentários, strings de UI, labels de teste e mensagens de commit; identificadores
  em inglês. Commits seguem `tipo(escopo): descrição` (`fix(mobile): …`).
- Comentário explica o **porquê** — normalmente citando o bug ou o número medido que forçou a
  decisão —, não o que o código faz.
- Prettier: aspas simples, `printWidth` 100, `arrowParens: "avoid"`, `trailingComma: "es5"`.
- Imports relativos com `.js` explícito.

## Depuração em runtime

`window.__SF` (estado) e `window.__VIEW_GET()` existem sempre (`js/main.js:1565`).
`window.__sf` — sonda de medição usada pelo harness multi-peer — só com `?debug=1`
(`js/main.js:1529`). Save quebrado: limpe `sf-save-${voc}`, `sf-name` e `sf-audio` no
`localStorage`.

## Fluxo de spec

`.spec/init/*` e `.spec/features/<slug>/{SPEC,PLAN,PHASES}.md` são do plugin `bc-harness`
(`/plan`, `/init`); `.phases/` guarda a execução por fase. Documentos de planejamento —
não descrevem necessariamente o código como está. A verdade do implementado é o código e
`docs/agents/*.md`.
