// ============================================================
// HARNESS MULTI-PEER — N abas de Chromium na mesma sala, sessão P2P real.
// É o único jeito de exercitar o que a suíte headless não alcança:
// handshake no broker, teto de sala, tranca, expulsão, fila e queda do host.
//
//   node tests/multipeer.mjs            # 2 abas, fluxo básico
//   PEERS=10 node tests/multipeer.mjs   # sala cheia
//   CASE=all PEERS=4 node tests/multipeer.mjs
//
// Variáveis de ambiente:
//   PEERS  número de abas na sala (padrão 2)
//   CASE   basic (padrão) | checkpoint | full | lock | kick | late | drop | measure | shot
//          | probe | mobile | audio | recovery | floor | all
//   VIEW   viewport das abas: mobile (padrão, 390x844) | small (360x640)
//          | desktop (1280x760, escape para depurar no layout antigo)
//
// As abas abrem em viewport de toque por padrão: `pointer: coarse` é a condição
// de UI-01 e dos cortes de UI-07, e uma aba de 1280x760 mediria outro CSS.
// Trocar isMobile/hasTouch depois da carga recarregaria a aba e derrubaria a
// sessão P2P, então a decisão é do primeiro quadro. VIEW=desktop devolve o
// 1280x760 de antes da feature mobile.
//
// CASE=mobile mede os alvos de toque que só existem dentro de sala e o trilho
// de aliados sob os cortes por altura — prefixos TOQUE, MENU, CORTE e CAIDO.
// Cada medida mora na janela do roteiro em que o seu estado existe:
//   #lobby de 10 trancado   caso de tranca, com PEERS=10
//   trilho e aliado caído   partida em curso, com PEERS>=5
//   #roster 9+1 e #queue    caso `late`, antes do btnQueueLeave, com PEERS=10 —
//                           os 9 em partida vêm da expulsão do caso `kick`, por
//                           isso essa janela só existe em CASE=all
//
//   PEERS=5 CASE=mobile node tests/multipeer.mjs   # cenário cravado de UI-07
// ============================================================
import puppeteer from 'puppeteer';
import { SNAP_HZ } from '../js/net.js';
import {
  MAX_PLAYERS,
  SNAPSHOT_BUDGET_BYTES,
  TICK_BUDGET_FLOORS,
  TICK_BUDGET_MS,
  TICK_BUDGET_SAMPLES,
} from '../js/balance.js';
import {
  VIEWPORT_MOBILE, VIEWPORT_SMALL, VIEWPORT_DESKTOP, ALTURAS_UI03, ALVO_MIN,
  BARRA_LARGURA, SEL_CHAT_ABRIR,
  alturaMobile, installHelpers,
} from './mobile-helpers.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 5199);
const PEERS = Number(process.env.PEERS || 2);
const CASE = process.env.CASE || 'basic';
// `late` injeta um bossEngage já drenado antes de abrir a aba tardia: é a
// fronteira que prova que a fila recebe estado, não a história transitória.
const MEDE_AUDIO = CASE === 'audio' || CASE === 'late' || CASE === 'all';
const CHECKPOINT_SAVES = CASE === 'checkpoint'
  ? {
      'sf-save-knight': { v: 3, voc: 'knight', name: 'Host', totalXp: 0, level: 1, xp: 0, gold: 0, floor: 10, potions: { hp: 4, mp: 4 }, items: [] },
      'sf-save-druid': { v: 3, voc: 'druid', name: 'P1', totalXp: 0, level: 1, xp: 0, gold: 0, floor: 7, potions: { hp: 4, mp: 4 }, items: [] },
      'sf-save-paladin': { v: 3, voc: 'paladin', name: 'P2', totalXp: 0, level: 1, xp: 0, gold: 0, floor: 4, potions: { hp: 4, mp: 4 }, items: [] },
      'sf-save-sorcerer': { v: 3, voc: 'sorcerer', name: 'P3', totalXp: 0, level: 1, xp: 0, gold: 0, floor: 1, potions: { hp: 4, mp: 4 }, items: [] },
    }
  : null;
// Viewport das abas: mobile por padrão, porque `pointer: coarse` é a condição
// medida por UI-01 e pelos cortes de UI-07. `desktop` é o escape de depuração.
const VIEWS = { mobile: VIEWPORT_MOBILE, small: VIEWPORT_SMALL, desktop: VIEWPORT_DESKTOP };
const VIEW = process.env.VIEW || 'mobile';
const VIEWPORT_ABA = VIEWS[VIEW] || VIEWPORT_MOBILE;
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
// BASE aponta o harness para uma URL já publicada em vez do servidor local.
const BASE = process.env.BASE || '';
const HEADLESS = process.env.HEADED ? false : 'new';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { console.log(`  FAIL ${label} ${extra}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- servidor estático ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
function serve() {
  return createServer(async (req, res) => {
    try {
      // O harness só precisa que a telemetria não vire erro de console. A
      // validação do contrato HTTP fica em api/vitals.js; não há serviço Vercel
      // neste servidor estático local para encaminhar a métrica de verdade.
      if (req.method === 'POST' && req.url.split('?')[0] === '/api/vitals') {
        res.writeHead(204).end();
        return;
      }
      const path = normalize(decodeURIComponent(req.url.split('?')[0]));
      const file = join(ROOT, path === '/' ? 'index.html' : path);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) { res.writeHead(404).end('nao encontrado'); }
  }).listen(PORT);
}

// VIEW=desktop entra aqui de propósito: as medições de toque trocam a viewport
// das abas para mobile e depois devolvem. Trocar só largura e altura não
// recarrega a página, mas `isMobile`/`hasTouch` recarregam — e num run desktop
// cada troca dessas derrubaria a sessão P2P no meio do roteiro.
const MEDE_TOQUE = (CASE === 'mobile' || CASE === 'all') && VIEW !== 'desktop';
// A AC 1 de UI-06 só existe com a sala trancada e 10 jogadores no #lobby, e a
// AC 1 de UI-01 só com 9 em partida e 1 na fila. O caso mobile alcança a
// primeira janela reaproveitando a tranca; a segunda depende da expulsão do
// caso `kick`, então mora dentro de `all`.
const RODA_LOCK = CASE === 'lock' || CASE === 'all' || (MEDE_TOQUE && PEERS === 10);
// Para onde as medições de UI-07 e UI-08 devolvem a aba do host depois de
// percorrer as sete alturas: a viewport em que o resto do roteiro mede.
const VIEW_HOST = VIEWPORT_ABA;

// ---------- aba ----------
async function openTab(browser, name, viewport = VIEWPORT_ABA) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await installHelpers(page);
  if (MEDE_AUDIO) {
    await page.evaluateOnNewDocument(() => {
      const probe = { starts: [], stops: [], resumes: 0 };
      window.__audioProbe = probe;
      class FakeGain {
        constructor() {
          this.gain = {
            value: 1,
            setTargetAtTime() {},
            linearRampToValueAtTime() {},
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
          };
        }
        connect() {}
      }
      class FakeOscillator {
        constructor() {
          this.frequency = { value: 0 };
          this.onended = null;
        }
        connect() {}
        start() { probe.starts.push(this.frequency.value); }
        stop() {
          probe.stops.push(this.frequency.value);
          if (this.onended) this.onended();
        }
      }
      class FakeAudioContext {
        constructor() {
          this.state = 'suspended';
          this.currentTime = 0;
          this.destination = {};
        }
        createGain() { return new FakeGain(); }
        createOscillator() { return new FakeOscillator(); }
        resume() {
          probe.resumes++;
          this.state = 'running';
          return Promise.resolve();
        }
      }
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = undefined;
    });
  }
  // Sem isto, só a última aba aberta roda o requestAnimationFrame: as demais
  // ficam ocultas para o navegador e o loop do jogo congela nelas. Com 10 abas
  // isso mediria o congelamento, não o jogo.
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: console ${m.text()}`); });
  const alvo = BASE ? `${BASE.replace(/\/$/, '')}/index.html?debug=1` : `http://localhost:${PORT}/index.html?debug=1`;
  if (CHECKPOINT_SAVES) {
    await page.evaluateOnNewDocument((saves) => {
      for (const [key, save] of Object.entries(saves)) localStorage.setItem(key, JSON.stringify(save));
    }, CHECKPOINT_SAVES);
  }
  await page.goto(alvo, { waitUntil: 'networkidle2' });
  await page.evaluate((n) => {
    const i = document.getElementById('nameInput');
    i.value = n;
    i.dispatchEvent(new Event('input', { bubbles: true }));
  }, name);
  // RF-02b exige `pointer: coarse` em toda aba de toque; a leitura fica guardada
  // na aba porque o caso `drop` fecha a do host antes da conferência final.
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  return { page, name, errors, viewport, coarse };
}

const pickVoc = (tab, voc) => tab.page.evaluate((v) => document.querySelector(`.voc-card[data-voc="${v}"]`)?.click(), voc);
const click = (tab, id) => tab.page.evaluate((i) => document.getElementById(i)?.click(), id);
const text = (tab, id) => tab.page.evaluate((i) => document.getElementById(i)?.textContent?.trim() ?? null, id);
const visible = (tab, id) => tab.page.evaluate((i) => {
  const e = document.getElementById(i);
  return !!e && !e.classList.contains('hidden');
}, id);

async function waitFor(fn, ms = 20000, every = 250) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return true;
    await sleep(every);
  }
  return false;
}

async function hostRoom(tab) {
  await pickVoc(tab, 'knight');
  await click(tab, 'btnHost');
  const ok = await waitFor(async () => {
    const c = await text(tab, 'lobbyCode');
    return c && c !== '----' && c.length === 4;
  });
  if (!ok) throw new Error('sala não abriu — broker inacessível?');
  return text(tab, 'lobbyCode');
}

async function joinRoom(tab, code, voc = 'druid') {
  await pickVoc(tab, voc);
  await tab.page.evaluate((c) => {
    const i = document.getElementById('codeInput');
    i.value = c;
    i.dispatchEvent(new Event('input', { bubbles: true }));
  }, code);
  await click(tab, 'btnJoin');
}

// Rótulos declarados em index.html:76-78. A AC 2 de UI-06 compara o texto
// renderizado com eles: encolher o flex item de .menu-actions não pode virar
// corte de rótulo, e um `min-width: 0` passaria na AC 1 cortando a palavra.
const ROTULOS_LOBBY = {
  btnCopyLink: 'Copiar link do convite',
  btnLock: 'Trancar sala',
  btnStart: 'Descer para a masmorra',
};

// UI-06 e a parte de UI-01 que mora no #lobby. A janela é a do caso de tranca:
// é o único momento do roteiro com 10 jogadores na lista, o host presente e
// #lobbyLock e #btnLock visíveis ao mesmo tempo. Medimos nas duas viewports de
// toque na mesma aba — trocar só largura e altura não recarrega a página.
async function medirLobbyTrancado(tab) {
  for (const viewport of [VIEWPORT_MOBILE, VIEWPORT_SMALL]) {
    const ctx = `${viewport.width}x${viewport.height}`;
    await tab.page.setViewport(viewport);
    await sleep(500);

    const m = await tab.page.evaluate((alvoMin, rotulos) => {
      const M = window.__M;
      const tela = document.getElementById('lobby');
      const fora = [];
      for (const el of tela.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0) continue;
        if (r.left < -0.5 || r.right > innerWidth + 0.5) {
          fora.push(`${M.label(el)} ocupa ${r.left.toFixed(1)}–${r.right.toFixed(1)}`);
        }
      }
      const truncados = [];
      for (const el of tela.querySelectorAll('.menu-actions .btn')) {
        if (!M.visible(el)) continue;
        if (el.scrollWidth > el.clientWidth + 0.5) {
          truncados.push(`${M.label(el)} pede ${el.scrollWidth}px numa caixa de ${el.clientWidth}px`);
        }
        if (getComputedStyle(el).textOverflow === 'ellipsis') {
          truncados.push(`${M.label(el)} com text-overflow: ellipsis`);
        }
        const esperado = rotulos[el.id];
        if (esperado && el.textContent.trim() !== esperado) {
          truncados.push(`#${el.id} diz "${el.textContent.trim()}" e não "${esperado}"`);
        }
      }
      return {
        coarse: matchMedia('(pointer: coarse)').matches,
        visivel: M.visible(tela),
        trancada: M.visible(document.getElementById('lobbyLock')),
        botaoTranca: M.visible(document.getElementById('btnLock')),
        contador: document.getElementById('lobbyCount').textContent.trim(),
        linhas: tela.querySelectorAll('#lobbyList .lobby-row.roster-row').length,
        innerWidth, scrollWidth: tela.scrollWidth, clientWidth: tela.clientWidth,
        // Alcançabilidade vertical: `.screen` é flex com overflow-y auto, e com
        // `align-items: center` o que passa da altura vaza ACIMA da origem de
        // rolagem, onde scrollTop nunca chega. Mede-se o topo real do conteúdo
        // e a posição do #lobbyCode, que é o dado sem o qual ninguém entra.
        topoConteudo: +tela.querySelector('.menu-inner').getBoundingClientRect().top.toFixed(1),
        topoCodigo: +document.getElementById('lobbyCode').getBoundingClientRect().top.toFixed(1),
        fora, truncados, acoes: tela.querySelectorAll('.menu-actions .btn').length,
        pequenos: M.targets('#lobby')
          .filter((t) => t.w < alvoMin || t.h < alvoMin)
          .map((t) => `${t.alvo} ${t.w}x${t.h}`),
      };
    }, ALVO_MIN, ROTULOS_LOBBY);

    check(`MENU: ${ctx} o topo do #lobby não vaza acima da origem de rolagem`,
      m.topoConteudo >= -0.5, `topo em ${m.topoConteudo}px`);
    check(`MENU: ${ctx} o #lobbyCode fica dentro da tela`,
      m.topoCodigo >= -0.5, `#lobbyCode em ${m.topoCodigo}px`);

    // Sem o estado certo a varredura passaria vazia e o caso viraria decoração.
    check(`MENU: ${ctx} o #lobby está trancado, visível e com 10 jogadores`,
      m.visivel && m.coarse && m.trancada && m.botaoTranca && m.linhas === 10,
      `${m.contador} · ${m.linhas} linha(s) · #lobbyLock ${m.trancada} · #btnLock ${m.botaoTranca}`);
    check(`MENU: ${ctx} o #lobby não rola na horizontal`,
      m.scrollWidth === m.clientWidth, `scrollWidth ${m.scrollWidth} contra clientWidth ${m.clientWidth}`);
    check(`MENU: ${ctx} nenhum descendente do #lobby passa dos ${m.innerWidth}px da viewport`,
      m.fora.length === 0, m.fora.join(' · '));
    check(`MENU: ${ctx} os ${m.acoes} rótulos de .menu-actions .btn saem inteiros`,
      m.acoes > 0 && m.truncados.length === 0, m.truncados.join(' · '));
    check(`TOQUE: ${ctx} não deixa alvo do #lobby abaixo de ${ALVO_MIN}x${ALVO_MIN}`,
      m.pequenos.length === 0, m.pequenos.join(' · '));

    // Sem screenshot aqui de propósito: no lobby a aba do host não desenha
    // quadro novo, e Page.captureScreenshot numa aba de fundo parada trava o
    // harness. A prova visual do toque sai do #roster e do caso `shot`.
  }
  await tab.page.setViewport(VIEW_HOST);
  await sleep(400);
}

// A tela de espera é a única superfície de toque de quem está na fila, e só
// existe enquanto o retardatário não desiste (o btnQueueLeave vem logo depois).
async function medirToqueFila(tab) {
  for (const viewport of [VIEWPORT_MOBILE, VIEWPORT_SMALL]) {
    const ctx = `${viewport.width}x${viewport.height}`;
    await tab.page.setViewport(viewport);
    await sleep(400);
    const q = await tab.page.evaluate((alvoMin) => {
      const M = window.__M;
      const alvos = M.targets('#queue');
      return {
        coarse: matchMedia('(pointer: coarse)').matches,
        visivel: M.visible(document.getElementById('queue')),
        total: alvos.length,
        pequenos: alvos.filter((t) => t.w < alvoMin || t.h < alvoMin).map((t) => `${t.alvo} ${t.w}x${t.h}`),
      };
    }, ALVO_MIN);
    check(`TOQUE: ${ctx} a #queue da aba em espera está visível em "pointer: coarse"`,
      q.visivel && q.coarse, `visível ${q.visivel} · coarse ${q.coarse}`);
    check(`TOQUE: ${ctx} os ${q.total} alvos da #queue têm caixa de ${ALVO_MIN}x${ALVO_MIN}`,
      q.total > 0 && q.pequenos.length === 0, q.pequenos.join(' · ') || `${q.total} alvo(s)`);
  }
  await tab.page.setViewport(VIEWPORT_ABA);
  await sleep(300);
}

// UI-01 dentro de sala real: com o alvo de chat, o #actionBar passa a ter 8
// alvos de 48x48 sem crescer em nenhum dos dois eixos e sem encostar no
// #hudRight. Aqui só entra GEOMETRIA — nenhuma abertura de chat, porque o
// roteiro de toque real de RF-03 e RF-05 vive inteiro em tests/browser.mjs
// (CT-02 AC 5) —, e nenhum `.click()`, pela mesma proibição de CT-02 AC 1.
//
// Roda em qualquer CASE com aba de toque: a barra depende só de haver partida
// em curso, não da composição da sala, e é justamente a não regressão que a
// corrida curta (`npm run test:multipeer:quick`) precisa enxergar. Medir nas
// duas viewports na mesma aba não recarrega a página — VIEWPORT_MOBILE e
// VIEWPORT_SMALL compartilham isMobile/hasTouch —, então a sessão P2P sobrevive.
const ALVOS_BARRA = 8;      // os 7 de hoje mais o alvo de chat de UI-01
const BARRA_ALTURA = 212;   // duas grades .slots de 2 linhas (2 x 48 + gap 6) mais o gap de 8 do #actionBar, medido no HEAD 2285154
async function medirBarraChatSala(tab) {
  for (const viewport of [VIEWPORT_MOBILE, VIEWPORT_SMALL]) {
    const ctx = `${viewport.width}x${viewport.height}`;
    await tab.page.setViewport(viewport);
    await sleep(500);
    const barra = await tab.page.evaluate((selAbrir, alvoMin) => {
      const M = window.__M;
      const alvos = M.targets('#actionBar');
      return {
        total: alvos.length,
        pequenos: alvos.filter((t) => t.w < alvoMin || t.h < alvoMin).map((t) => `${t.alvo} ${t.w}x${t.h}`),
        caixa: M.rect('#actionBar'),
        cruzaHudRight: M.intersects(M.rect('#actionBar'), M.rect('#hudRight')),
        abrir: M.rect(selAbrir),
      };
    }, SEL_CHAT_ABRIR, ALVO_MIN);
    check(`CHAT: ${ctx} o #actionBar tem ${ALVOS_BARRA} alvos de toque em sala`,
      barra.total === ALVOS_BARRA, `${barra.total} alvos, esperado ${ALVOS_BARRA}`);
    check(`CHAT: ${ctx} nenhum alvo do #actionBar fica abaixo de ${ALVO_MIN}x${ALVO_MIN}`,
      barra.total > 0 && barra.pequenos.length === 0,
      barra.pequenos.join(' · ') || `${barra.total} alvo(s)`);
    check(`CHAT: ${ctx} o #actionBar mantém ${BARRA_LARGURA}px de largura com o alvo novo`,
      !!barra.caixa && Math.abs(barra.caixa.width - BARRA_LARGURA) < 0.5,
      barra.caixa ? `${barra.caixa.width.toFixed(1)}px` : 'ausente ou invisível');
    check(`CHAT: ${ctx} o #actionBar mantém ${BARRA_ALTURA}px de altura com o alvo novo`,
      !!barra.caixa && Math.abs(barra.caixa.height - BARRA_ALTURA) < 0.5,
      barra.caixa ? `${barra.caixa.height.toFixed(1)}px` : 'ausente ou invisível');
    check(`CHAT: ${ctx} o #actionBar não cruza o #hudRight`,
      barra.cruzaHudRight === false,
      barra.caixa ? `barra em ${barra.caixa.top.toFixed(1)}–${barra.caixa.bottom.toFixed(1)}` : 'barra ausente');
    check(`CHAT: ${ctx} o alvo de abrir conversa (${SEL_CHAT_ABRIR}) está visível em sala com ${ALVO_MIN}x${ALVO_MIN}`,
      !!barra.abrir && barra.abrir.width >= ALVO_MIN && barra.abrir.height >= ALVO_MIN,
      barra.abrir ? `${barra.abrir.width.toFixed(1)}x${barra.abrir.height.toFixed(1)}` : 'ausente ou invisível');
  }
  // Devolve a aba à viewport em que os demais casos do roteiro medem.
  await tab.page.setViewport(VIEW_HOST);
  await sleep(400);
}

// UI-01 dentro de sala: o #roster só tem linha com ação de moderação, e o
// #crewChip só perde a classe `hidden`, quando há partida com outros jogadores.
// A janela é a do caso `late`, antes do btnQueueLeave: 9 jogadores em partida e
// 1 na fila é exatamente o estado da AC 1 de UI-01, e é o único momento em que
// o #roster mostra as duas listas ao mesmo tempo. Medimos nas duas viewports de
// toque na mesma aba — trocar só largura e altura não recarrega a página, então
// a sessão P2P sobrevive à segunda medida.
async function medirToqueSala(tab) {
  for (const viewport of [VIEWPORT_MOBILE, VIEWPORT_SMALL]) {
    const ctx = `${viewport.width}x${viewport.height}`;
    await tab.page.setViewport(viewport);
    await sleep(500);
    check(`TOQUE: ${ctx} ativa "pointer: coarse" na aba do host`,
      await tab.page.evaluate(() => matchMedia('(pointer: coarse)').matches));

    // O #crewChip é alvo de toque (abre o #roster, js/main.js:143), mas os
    // chips irmãos da mesma linha são informação: a caixa de 44px não pode
    // subir junto com eles, e a pintura do próprio chip fica nos 21px.
    const chips = await tab.page.evaluate(() => {
      const M = window.__M;
      const chip = document.getElementById('crewChip');
      // O #roster pode ter ficado aberto do passo anterior, e como `.panel` é
      // centralizado com z-index 20 ele cobre o chip — o teste de acerto mediria
      // o painel em vez do alvo. Fecha primeiro; o roteiro abaixo reabre.
      document.getElementById('btnCloseRoster')?.click();
      return {
        crew: M.rect('#crewChip'),
        // Mede o resultado, não o mecanismo: a placa visível é o ::before, e o
        // que a AC exige é que ela continue nos 21px de sempre enquanto a caixa
        // de toque vai a 44. Afirmar `background-clip` amarrava o teste a uma
        // implementação e reprovava outra igualmente correta.
        placa: chip ? parseFloat(getComputedStyle(chip, '::before').height) : null,
        placaFundo: chip ? getComputedStyle(chip, '::before').backgroundColor : null,
        // Teste de acerto de verdade: #hudRight é `pointer-events: none`, então
        // um alvo de 44x44 ali dentro pode estar geometricamente certo e mesmo
        // assim deixar o toque atravessar para o canvas. Abrir o painel por
        // `.click()` programático não pega isso — só elementFromPoint pega.
        alvoNoCentro: (() => {
          if (!chip) return null;
          const r = chip.getBoundingClientRect();
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!el) return null;
          return el === chip || chip.contains(el) ? 'crewChip' : (el.id || el.tagName.toLowerCase());
        })(),
        irmaos: ['floorChip', 'goldChip', 'roomChip', 'crewLock', 'pingChip']
          .map((id) => ({ id, r: M.rect('#' + id) }))
          .filter((x) => x.r)
          .map((x) => ({ id: x.id, h: x.r.height })),
      };
    });
    check(`TOQUE: ${ctx} o #crewChip tem caixa de ao menos 44px de altura`,
      !!chips.crew && chips.crew.height >= ALVO_MIN,
      chips.crew ? `${chips.crew.height.toFixed(1)}px` : 'ausente ou invisível');
    check(`TOQUE: ${ctx} o #crewChip tem caixa de ao menos 44px de largura`,
      !!chips.crew && chips.crew.width >= ALVO_MIN,
      chips.crew ? `${chips.crew.width.toFixed(1)}px` : 'ausente ou invisível');
    check(`TOQUE: ${ctx} o toque no centro do #crewChip chega nele, não no canvas`,
      chips.alvoNoCentro === 'crewChip', String(chips.alvoNoCentro));
    check(`TOQUE: ${ctx} a placa pintada do #crewChip fica nos 21px, não nos 44`,
      chips.placa !== null && chips.placa <= 24 && chips.placa > 0,
      `${chips.placa}px de placa em ${chips.crew ? chips.crew.height.toFixed(1) : '?'}px de caixa`);
    check(`TOQUE: ${ctx} a placa do #crewChip é opaca, sem furo entre borda e fundo`,
      !!chips.placaFundo && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(chips.placaFundo),
      String(chips.placaFundo));
    const inchados = chips.irmaos.filter((c) => c.h > 24);
    check(`TOQUE: ${ctx} os ${chips.irmaos.length} chips informativos ficam em 24px ou menos`,
      chips.irmaos.length > 0 && inchados.length === 0,
      inchados.map((c) => `#${c.id} ${c.h.toFixed(1)}px`).join(' · ')
        || chips.irmaos.map((c) => `#${c.id} ${c.h.toFixed(1)}px`).join(' · '));

    // Abre o painel pelo mesmo caminho do jogador (js/main.js:143).
    await tab.page.evaluate(() => document.getElementById('crewChip').click());
    await sleep(500);

    const sala = await tab.page.evaluate(() => {
      const M = window.__M;
      const pequenos = M.targets('#roster')
        .filter((t) => t.w < 44 || t.h < 44)
        .map((t) => `${t.alvo} ${t.w}x${t.h}`);
      // A AC 1 de UI-01 nomeia estes dois; sem eles a varredura passaria vazia.
      const nomeados = ['#btnCloseRoster', '#btnRosterLock']
        .map((sel) => ({ sel, r: M.rect(sel) }));
      // #roster e não #rosterList: nesta janela a linha da fila também traz
      // Expulsar (js/ui.js:461-467) e é alvo de toque como as demais.
      const expulsar = [...document.querySelectorAll('#roster .roster-row .rr-actions .btn')]
        .filter((b) => b.textContent.includes('Expulsar') && M.visible(b))
        .map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height }; });
      return { pequenos, nomeados, expulsar, aberto: M.visible(document.getElementById('roster')) };
    });

    check(`TOQUE: ${ctx} abre o #roster pelo #crewChip`, sala.aberto);
    check(`TOQUE: ${ctx} não deixa alvo do #roster abaixo de 44x44`,
      sala.pequenos.length === 0, sala.pequenos.join(' · '));
    for (const { sel, r } of sala.nomeados) {
      check(`TOQUE: ${ctx} ${sel} tem caixa de 44x44`,
        !!r && r.width >= ALVO_MIN && r.height >= ALVO_MIN,
        r ? `${r.width.toFixed(1)}x${r.height.toFixed(1)}` : 'ausente ou invisível');
    }
    const curtos = sala.expulsar.filter((b) => b.w < ALVO_MIN || b.h < ALVO_MIN);
    check(`TOQUE: ${ctx} os ${sala.expulsar.length} botões Expulsar têm caixa de 44x44`,
      sala.expulsar.length > 0 && curtos.length === 0,
      curtos.map((b) => `${b.w.toFixed(1)}x${b.h.toFixed(1)}`).join(' · ') || `${sala.expulsar.length} botões`);

    // A confirmação inline troca as ações da linha (js/ui.js:385) e se desfaz
    // sozinha em 5s: medir e cancelar na mesma volta, sem expulsar ninguém —
    // o caso `kick` mede a expulsão de verdade mais adiante.
    const confirma = await tab.page.evaluate(() => {
      const linha = [...document.querySelectorAll('#roster .roster-row')]
        .find((r) => [...r.querySelectorAll('.rr-actions .btn')].some((b) => b.textContent.includes('Expulsar')));
      if (!linha) return { erro: 'nenhuma linha com Expulsar' };
      [...linha.querySelectorAll('.rr-actions .btn')].find((b) => b.textContent.includes('Expulsar')).click();
      const botoes = [...linha.querySelectorAll('.rr-actions .btn')].map((b) => {
        const r = b.getBoundingClientRect();
        return { rotulo: b.textContent, w: r.width, h: r.height };
      });
      const nao = [...linha.querySelectorAll('.rr-actions .btn')].find((b) => b.textContent === 'Não');
      if (nao) nao.click();
      return { botoes };
    });
    const simNao = (confirma.botoes || []).filter((b) => b.rotulo === 'Sim' || b.rotulo === 'Não');
    const simNaoCurtos = simNao.filter((b) => b.w < ALVO_MIN || b.h < ALVO_MIN);
    check(`TOQUE: ${ctx} os botões Sim/Não da confirmação inline têm caixa de 44x44`,
      simNao.length === 2 && simNaoCurtos.length === 0,
      confirma.erro || simNao.map((b) => `${b.rotulo} ${b.w.toFixed(1)}x${b.h.toFixed(1)}`).join(' · '));

    await tab.page.screenshot({ path: `${process.env.OUT || '/tmp/shadowfall-shots'}/toque-roster-${ctx}.png` });
    await tab.page.evaluate(() => document.getElementById('btnCloseRoster').click());
    await sleep(300);
  }
  // Devolve a aba à viewport em que os demais casos do roteiro medem.
  await tab.page.setViewport(VIEW_HOST);
  await sleep(400);
}

// ============================================================
// TRILHO DE ALIADOS (UI-07) E ALIADO CAÍDO (UI-08)
// O cenário cravado da SPEC é o jogador local mais 4 aliados, 1 deles caído —
// estado que só existe dentro de sala, por isso a medição mora aqui e não em
// tests/browser.mjs. Com PEERS=5 `AllyRail.select` devolve extra 0 e o
// `.ally-more` não chega ao DOM; com os PEERS=10 de `npm run test:multipeer`
// roda o outro ramo da AC 5 de UI-07, com a linha de excedente presente. As
// contagens são as mesmas nos dois ramos porque dependem só da posição no DOM.
// ============================================================
const PEERS_TRILHO = 5;             // local + 4 aliados: o mínimo do cenário cravado
const VIVOS_POR_ALTURA = [3, 1, 1, 0, 0, 0, 0];   // AC 1 de UI-07, na ordem de ALTURAS_UI03

// Derruba um aliado no estado autoritativo do host — o mesmo recurso que
// tests/browser.mjs:82-94 usa para matar o chefe. Os campos escritos são os que
// damagePlayer (js/sim.js:774-780) grava na morte. O `setInterval` reafirma a
// queda a cada 100ms porque qualquer aliado vivo dentro de REVIVE_RADIUS ergue
// o caído em poucos segundos (js/sim.js:375-392) e a contagem passaria a medir
// um trilho sem caído no meio da varredura de sete alturas.
async function derrubarAliado(tab) {
  return tab.page.evaluate(() => {
    const S = window.__SF;
    if (!S || !S.G) return null;
    const alvo = Object.values(S.G.players).find((p) => p.id !== S.localId);
    if (!alvo) return null;
    window.__mantemCaido = setInterval(() => {
      const p = window.__SF.G.players[alvo.id];
      if (!p) return;
      p.hp = 0; p.dead = true; p.reviveProg = 0;
    }, 100);
    return alvo.name;
  });
}

// Parar o intervalo não bastava: o aliado continuava `dead` com hp 0, e o caso
// `shot` mais adiante conta as placas do trilho. Como o caído entra ALÉM do teto
// de vivos (js/allyrail.js), a contagem passava a depender de a ressurreição em
// jogo acontecer dentro do sleep — ordem, não invariante. Aqui ele volta de pé.
const erguerAliado = (tab) => tab.page.evaluate(() => {
  clearInterval(window.__mantemCaido);
  window.__mantemCaido = null;
  const S = window.__SF;
  if (!S || !S.G) return;
  // maxHp não mora no jogador do simulador (vem de stats()); a view já resolveu
  // esse número, então lê de lá quando houver e cai num valor de pé quando não.
  const daView = new Map((S.view?.players || []).map((p) => [p.id, p.maxHp]));
  for (const p of Object.values(S.G.players)) {
    if (!p.dead) continue;
    p.dead = false;
    p.deathTimer = 0;
    p.reviveProg = 0;
    p.hp = Math.max(1, Math.floor((daView.get(p.id) || 2) * 0.5));
  }
});

// Uma leitura só por altura: display, contagem e caixa de tudo que as ACs de
// UI-07 e UI-08 nomeiam.
const lerTrilho = (tab) => tab.page.evaluate(() => {
  const lista = document.getElementById('partyList');
  const vis = (el) => !!el && getComputedStyle(el).display !== 'none';
  const conta = (sel) => [...document.querySelectorAll(sel)].filter(vis).length;
  const disp = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).display : null; };
  const larg = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect().width : null; };
  // A cor do caído é comparada com o valor resolvido de --blood, não com um
  // literal: se o token mudar, o teste continua medindo a mesma intenção.
  const sonda = document.createElement('div');
  sonda.style.cssText = 'position:absolute;left:-9999px;top:-9999px;border:1px solid var(--blood)';
  document.body.appendChild(sonda);
  const blood = getComputedStyle(sonda).borderTopColor;
  sonda.remove();

  const primeiro = lista.firstElementChild;
  const visiveis = [...lista.children].filter(vis);
  const more = lista.querySelector('.ally-more');
  return {
    vivos: conta('#partyList .plaque.mate:not(.down)'),
    caidos: conta('#partyList .plaque.mate.down'),
    visiveis: visiveis.length,
    // AC 2 de UI-08: o caído é o primeiro filho em todas as faixas.
    primeiroEhCaido: !!primeiro && primeiro.classList.contains('mate') && primeiro.classList.contains('down'),
    primeiroVisivel: vis(primeiro),
    primeiroEhOPrimeiroVisivel: visiveis.length > 0 && visiveis[0] === primeiro,
    rotuloPrimeiro: primeiro ? (primeiro.className || primeiro.tagName.toLowerCase()) : 'sem filhos',
    borda: primeiro ? getComputedStyle(primeiro).borderColor : null,
    blood,
    texto: primeiro ? primeiro.textContent : '',
    log: disp('#log'),
    self: larg('.plaque.self'),
    mate: larg('#partyList .plaque.mate'),
    dispSelf: disp('.plaque.self'),
    dispMinimap: disp('#minimap'),
    dispBarra: disp('#actionBar'),
    dispMore: more ? getComputedStyle(more).display : null,
    temMore: !!more,
  };
});

async function medirTrilho(tab) {
  const nome = await derrubarAliado(tab);
  if (!nome) { check('CORTE: o host derruba um aliado para montar o cenário cravado', false, 'nenhum aliado no estado do host'); return; }
  // O trilho só é remontado quando o conjunto de ids muda (js/ui.js:177): a
  // espera é pela placa `.down` no DOM, não por um tempo fixo.
  const montou = await waitFor(() => tab.page.evaluate(() => !!document.querySelector('#partyList .plaque.mate.down')), 15000);
  check('CORTE: o host derruba um aliado e a placa de caído entra no trilho', montou, `alvo ${nome}`);
  if (!montou) { await erguerAliado(tab); return; }
  const temMore = await tab.page.evaluate(() => !!document.querySelector('#partyList .ally-more'));
  console.log(`      ramo da AC 5 de UI-07: .ally-more ${temMore
    ? 'presente — extra > 0, o trilho declara o excedente'
    : 'ausente — extra === 0, cenário cravado'}`);

  try {
    for (let i = 0; i < ALTURAS_UI03.length; i++) {
      const altura = ALTURAS_UI03[i];
      const ctx = `390x${altura}`;
      await tab.page.setViewport(alturaMobile(altura));
      await sleep(450);
      const t = await lerTrilho(tab);

      check(`CORTE: ${ctx} o caído é o primeiro filho de #partyList`,
        t.primeiroEhCaido, `primeiro filho: ${t.rotuloPrimeiro}`);
      check(`CORTE: ${ctx} o caído continua visível`,
        t.primeiroVisivel && t.caidos === 1, `${t.caidos} placa(s) .down visível(is)`);

      const esperados = VIVOS_POR_ALTURA[i];
      check(`CORTE: ${ctx} mostra ${esperados} aliado(s) vivo(s) no trilho`,
        t.vivos === esperados, `${t.vivos} visível(is)`);

      // O #log some a partir de 460 (styles.css:397). A AC 2 de UI-07 escreve
      // `block`, mas o #log é `display: flex` desde styles.css:238 e nenhuma
      // regra desta feature o altera: o que a faixa decide é aparecer ou não.
      const logEsperado = altura > 460;
      check(`CORTE: ${ctx} o #log ${logEsperado ? 'continua no HUD' : 'sai do HUD'}`,
        (t.log !== 'none') === logEsperado, `display ${t.log}`);

      const selfEsperado = altura > 460 ? 190 : 180;
      check(`CORTE: ${ctx} a .plaque.self mede ${selfEsperado}px`,
        t.self !== null && Math.abs(t.self - selfEsperado) <= 0.5,
        t.self === null ? 'ausente' : `${t.self.toFixed(1)}px`);
      check(`CORTE: ${ctx} a .plaque.mate mede 170px`,
        t.mate !== null && Math.abs(t.mate - 170) <= 0.5,
        t.mate === null ? 'ausente' : `${t.mate.toFixed(1)}px`);

      // AC 4: nada pode sumir fora da ordem de corte declarada.
      const somidos = [
        ['.plaque.self', t.dispSelf], ['#minimap', t.dispMinimap], ['#actionBar', t.dispBarra],
      ].filter(([, d]) => d === null || d === 'none');
      check(`CORTE: ${ctx} .plaque.self, #minimap e #actionBar continuam no HUD`,
        somidos.length === 0, somidos.map(([sel, d]) => `${sel} ${d || 'ausente'}`).join(' · '));

      // AC 5 tem dois ramos e o harness escolhe pela presença do nó: o cenário
      // cravado (PEERS=5, extra 0) exige `.ally-more` ausente; com extra > 0 ela
      // precisa sobreviver a todos os cortes por altura.
      if (t.temMore) {
        check(`CORTE: ${ctx} a linha .ally-more do excedente não é cortada pela altura`,
          t.dispMore !== 'none', `display ${t.dispMore}`);
      } else {
        check(`CORTE: ${ctx} sem excedente, o trilho não cria a linha .ally-more`,
          t.temMore === false);
      }

      // UI-08 fecha na faixa mais baixa, onde a regra geral de
      // styles.css:562 esconde toda placa de aliado e só a exceção `.down`
      // devolve o pedido de ressurreição.
      if (altura === 360) {
        // No cenário cravado o caído é o único nó do trilho; com excedente
        // sobra também a linha `.ally-more`, que a AC 5 de UI-07 manda manter.
        const esperadoVisivel = t.temMore ? 2 : 1;
        check(`CAIDO: ${ctx} deixa ${esperadoVisivel} elemento(s) visível(is) em #partyList`,
          t.visiveis === esperadoVisivel, `${t.visiveis} visível(is)`);
        check(`CAIDO: ${ctx} o caído é o #partyList.firstElementChild e abre os visíveis`,
          t.primeiroEhOPrimeiroVisivel && t.primeiroEhCaido, `primeiro filho: ${t.rotuloPrimeiro}`);
        check(`CAIDO: ${ctx} a placa do caído tem borda --blood`,
          !!t.borda && t.borda === t.blood, `${t.borda} contra ${t.blood}`);
        check(`CAIDO: ${ctx} a placa do caído diz "caído" por texto, não só por cor`,
          /caído/.test(t.texto), JSON.stringify((t.texto || '').trim().slice(0, 40)));
        check(`CAIDO: ${ctx} a exceção não vaza para aliado vivo`,
          t.vivos === 0, `${t.vivos} vivo(s) visível(is)`);
      }
    }
  } finally {
    await erguerAliado(tab);
    await tab.page.setViewport(VIEW_HOST);
    await sleep(400);
  }
}

// ============================================================
// Com BASE definido não subimos servidor: o alvo é o que já está no ar.
const server = BASE ? null : serve();
if (BASE) console.log(`      alvo: ${BASE}`);
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: HEADLESS,
  args: [
    '--no-sandbox', '--disable-dev-shm-usage',
    // Sem isto o Chrome congela as abas em segundo plano e a medição vira ficção:
    // 9 das 10 abas parariam de rodar o requestAnimationFrame.
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--use-gl=swiftshader',
  ],
});
const tabs = [];
let validarAudioTardeNaFila = false;

try {
  console.log(`\n== harness multi-peer: ${PEERS} abas, caso "${CASE}" ==`);

  for (let i = 0; i < PEERS; i++) {
    tabs.push(await openTab(browser, i === 0 ? 'Host' : 'P' + i));
  }
  const [host, ...guests] = tabs;

  const code = await hostRoom(host);
  console.log(`      sala ${code}`);
  check('multi-peer: o host abre a sala e recebe um código de 4 letras', /^[A-Z0-9]{4}$/.test(code), code);

  const checkpointVocations = ['druid', 'paladin', 'sorcerer'];
  for (const [i, g] of guests.entries()) {
    await joinRoom(g, code, CASE === 'checkpoint' ? checkpointVocations[i] : 'druid');
  }

  const entraram = await waitFor(async () => (await text(host, 'lobbyCount')) === `${PEERS}/10`, 30000);
  check(`multi-peer: ${PEERS} abas entram na mesma sala`, entraram, await text(host, 'lobbyCount'));

  // P2-10 começa antes do botão de início: o convidado admitido precisa estar
  // no roster canônico, sem fila nem mundo criado. A prova depois do primeiro
  // snapshot fica logo após `start`, para não confundir a admissão com a
  // renderização local do lobby.
  let lateEarly = null;
  if (CASE === 'late') {
    lateEarly = guests[0];
    const antesDoInicio = await waitFor(() => lateEarly.page.evaluate(() => {
      const S = window.__SF;
      const roster = [...S.room.players.values()];
      return !S.started
        && !S.queued
        && roster.some(p => p.isHost)
        && roster.some(p => p.name === 'P1' && !p.pending)
        && document.getElementById('lobbyCount')?.textContent?.trim() === '2/10';
    }), 15000);
    const estadoAntes = await lateEarly.page.evaluate(() => {
      const S = window.__SF;
      return {
        started: S.started,
        queued: S.queued,
        lobby: !document.getElementById('lobby').classList.contains('hidden'),
        jogo: !document.getElementById('game').classList.contains('hidden'),
        jogadores: [...S.room.players.values()].map(p => ({ name: p.name, pending: !!p.pending, host: !!p.isHost })),
        fila: S.room.queue.length,
        mapa: !!S.map,
      };
    });
    check('P2-10: entrada antes do início é admitida no roster sem entrar na fila',
      antesDoInicio && estadoAntes.lobby && !estadoAntes.jogo && estadoAntes.fila === 0 && !estadoAntes.mapa,
      JSON.stringify(estadoAntes));
  }

  const runQueueCase = async () => {
    // P2-11 usa oito em partida: há espaço para duas pessoas na fila e ainda
    // dá para separar a recusa por tranca da recusa por lotação. Não usa
    // expulsão: a promoção de posição vem da saída voluntária da primeira aba.
    check('P2-11: cenário de fila começa com oito jogadores em partida', PEERS === 8,
      `PEERS=${PEERS}; rode PEERS=8 CASE=queue`);

    const filaA = await openTab(browser, 'FilaA');
    tabs.push(filaA);
    await joinRoom(filaA, code, 'paladin');
    const primeiraNaFila = await waitFor(() => filaA.page.evaluate(() => {
      const S = window.__SF;
      return S.queued && S.room.players.size === 8 && S.room.queue.length === 1
        && S.room.queue[0]?.name === 'FilaA'
        && document.getElementById('queuePos')?.textContent?.trim() === '1º de 1';
    }), 25000);
    check('P2-11: primeira entrada tardia ocupa a posição 1 sem nascer no andar',
      primeiraNaFila && !(await visible(filaA, 'game')), await text(filaA, 'queuePos'));

    // A sala está em 9/10 aqui. Assim "trancada" é provado com uma vaga física
    // disponível, em vez de mascarar a recusa de lotação.
    await host.page.evaluate(() => document.getElementById('crewChip')?.click());
    await waitFor(() => visible(host, 'roster'));
    await click(host, 'btnRosterLock');
    const lockAtiva = await waitFor(() => host.page.evaluate(() => window.__SF.room.locked));
    const trancado = await openTab(browser, 'FilaTrancada');
    tabs.push(trancado);
    await joinRoom(trancado, code, 'sorcerer');
    const recusadoPorTranca = await waitFor(async () => /trancada/i.test(await text(trancado, 'menuStatus') || ''), 25000);
    const estadoTranca = await host.page.evaluate(() => ({
      locked: window.__SF.room.locked,
      count: window.__SF.room.count,
      queue: window.__SF.room.queue.map(e => e.name),
    }));
    check('P2-11: tranca recusa com vaga e preserva a fila existente',
      lockAtiva && recusadoPorTranca && estadoTranca.count === 9
        && estadoTranca.queue.join(',') === 'FilaA', JSON.stringify(estadoTranca));
    await click(host, 'btnRosterLock');
    await waitFor(() => host.page.evaluate(() => !window.__SF.room.locked));

    const filaB = await openTab(browser, 'FilaB');
    tabs.push(filaB);
    await joinRoom(filaB, code, 'druid');
    const fifoVisivel = await waitFor(async () => {
      const [a, b, hostQueue] = await Promise.all([
        filaA.page.evaluate(() => document.getElementById('queuePos')?.textContent?.trim()),
        filaB.page.evaluate(() => document.getElementById('queuePos')?.textContent?.trim()),
        host.page.evaluate(() => window.__SF.room.queue.map(e => e.name)),
      ]);
      return a === '1º de 2' && b === '2º de 2' && hostQueue.join(',') === 'FilaA,FilaB';
    }, 25000);
    check('P2-11: duas entradas tardias exibem a ordem FIFO para ambas as abas', fifoVisivel,
      JSON.stringify(await host.page.evaluate(() => window.__SF.room.queue.map(e => e.name))));

    const lotado = await openTab(browser, 'FilaLotada');
    tabs.push(lotado);
    await joinRoom(lotado, code, 'knight');
    const recusadoPorLotacao = await waitFor(async () => /cheia/i.test(await text(lotado, 'menuStatus') || ''), 25000);
    const estadoLotado = await host.page.evaluate(() => ({
      locked: window.__SF.room.locked,
      count: window.__SF.room.count,
      queue: window.__SF.room.queue.map(e => e.name),
    }));
    check('P2-11: décima vaga ocupada recusa por lotação sem confundir com tranca',
      recusadoPorLotacao && !estadoLotado.locked && estadoLotado.count === 10,
      JSON.stringify(estadoLotado));

    // A saída é o botão real da fila, não a ação de expulsar da P2-12. Fechar
    // uma Page pode manter o transporte do Puppeteer vivo por tempo indefinido;
    // este gesto percorre o net.close() que a pessoa usa de verdade.
    await click(filaA, 'btnQueueLeave');
    const promoveuPosicao = await waitFor(async () => {
      const [pos, hostQueue] = await Promise.all([
        text(filaB, 'queuePos'),
        host.page.evaluate(() => window.__SF.room.queue.map(e => e.name)),
      ]);
      return pos === '1º de 1' && hostQueue.join(',') === 'FilaB';
    }, 25000);
    check('P2-11: saída da frente promove a posição seguinte, confirmada no P2P',
      promoveuPosicao, await text(filaB, 'queuePos'));

    // A vaga recém-aberta aceita a próxima pessoa no fim; ela não fura quem já
    // esperava. As duas serão promovidas juntas somente na virada de andar.
    const filaC = await openTab(browser, 'FilaC');
    tabs.push(filaC);
    await joinRoom(filaC, code, 'sorcerer');
    const filaRecomposta = await waitFor(async () => {
      const [b, c, hostQueue] = await Promise.all([
        text(filaB, 'queuePos'), text(filaC, 'queuePos'),
        host.page.evaluate(() => window.__SF.room.queue.map(e => e.name)),
      ]);
      return b === '1º de 2' && c === '2º de 2' && hostQueue.join(',') === 'FilaB,FilaC';
    }, 25000);
    check('P2-11: vaga reaberta mantém quem aguardava à frente da nova entrada', filaRecomposta,
      JSON.stringify(await host.page.evaluate(() => window.__SF.room.queue.map(e => e.name))));

    // O pendingFloor é a mesma fronteira que o host observa após o portal; só
    // torna a virada determinística para o harness, sem inventar mensagem nova.
    await host.page.evaluate(() => { window.__SF.G.pendingFloor = true; });
    const promovidos = await waitFor(async () => {
      const [hostState, bState, cState] = await Promise.all([
        host.page.evaluate(() => ({
          floor: window.__SF.floor,
          queue: window.__SF.room.queue.length,
          names: Object.values(window.__SF.G.players).map(p => p.name).slice(-2),
        })),
        filaB.page.evaluate(() => ({ queued: window.__SF.queued, game: !document.getElementById('game').classList.contains('hidden'), floor: window.__SF.floor })),
        filaC.page.evaluate(() => ({ queued: window.__SF.queued, game: !document.getElementById('game').classList.contains('hidden'), floor: window.__SF.floor })),
      ]);
      return hostState.floor === 2 && hostState.queue === 0 && hostState.names.join(',') === 'FilaB,FilaC'
        && !bState.queued && bState.game && bState.floor === 2
        && !cState.queued && cState.game && cState.floor === 2;
    }, 30000);
    check('P2-11: virada promove a fila em FIFO e confirma ambas no novo andar', promovidos,
      JSON.stringify(await host.page.evaluate(() => ({ floor: window.__SF.floor, queue: window.__SF.room.queue.length, names: Object.values(window.__SF.G.players).map(p => p.name) }))));
  }

  if (CASE === 'measure' || CASE === 'all') {
    // A sala cheia já está viva, mas ainda não iniciou os rAFs de jogo. Assim a
    // sonda mede o motor em V8 sem transformar disputa de CPU/GPU entre abas em
    // falso pico de `step()`. A sonda conserva o máximo de todos os steps
    // de cada andar; aquecimento só remove compilação inicial do V8.
    const tickBudget = await host.page.evaluate(() => window.__sf?.tickBudget?.());
    const resumo = Array.isArray(tickBudget)
      ? tickBudget.map((x) => `andar ${x.floor}: ${x.meanMs.toFixed(3)}ms médio / ${x.maxMs.toFixed(3)}ms máximo (${x.samples} steps)`).join(' · ')
      : 'sonda indisponível';
    console.log(`      orçamento de step (motor isolado): ${resumo}`);
    const probeValido = Array.isArray(tickBudget)
      && tickBudget.length === TICK_BUDGET_FLOORS.length
      && tickBudget.every((x) => x.players === MAX_PLAYERS && x.samples === TICK_BUDGET_SAMPLES && x.maxMs < TICK_BUDGET_MS);
    check(`multi-peer: cada step do probe de 10 jogadores fica abaixo de ${TICK_BUDGET_MS}ms`, probeValido, resumo);
  }

  if (CASE === 'checkpoint') {
    check('P2-14: cenário de checkpoints divergentes usa quatro pessoas', PEERS === 4,
      `PEERS=${PEERS}; rode PEERS=4 CASE=checkpoint`);
    const controles = await Promise.all(tabs.slice(0, PEERS).map((tab) => tab.page.evaluate(() => {
      const select = document.getElementById('startFloorSelect');
      return {
        opcoes: [...select.options].map(option => option.value),
        valor: select.value,
        disabled: select.disabled,
        dica: document.getElementById('checkpointHint').textContent,
      };
    })));
    const [doHost, ...dosConvidados] = controles;
    check('P2-14: grupo 1/4/7/10 só oferece o andar comum',
      JSON.stringify(doHost.opcoes) === JSON.stringify(['1']) && doHost.valor === '1',
      JSON.stringify(doHost));
    check('P2-14: todos os convidados recebem o mesmo limite comum e seletor bloqueado',
      dosConvidados.every(control => control.valor === '1' && control.disabled && /andar 1/i.test(control.dica)),
      JSON.stringify(dosConvidados));

    // A desconexão acontece ainda no lobby: o mesmo perfil voltará com um
    // peer novo, como acontece quando o navegador reconecta a uma sala aberta.
    // Enquanto ele está fora, 4 é o maior checkpoint comum dos três restantes.
    const shallow = tabs[3];
    // `Page.close()` não garante que o WebRTC em memória dispare o close antes
    // de o Chromium encerrar o processo. O botão percorre o `net.close()` que
    // a pessoa usa de verdade e, portanto, o `peerLeft` do host.
    await click(shallow, 'btnLeave');
    const saiu = await waitFor(() => host.page.evaluate(() => {
      const S = window.__SF;
      return S.room.players.size === 3 && ![...S.room.players.values()].some(p => p.name === 'P3');
    }), 20000);
    const aposSaida = await host.page.evaluate(() => {
      const select = document.getElementById('startFloorSelect');
      return {
        players: [...window.__SF.room.players.values()].map(p => `${p.name}:${p.deepestFloor}`),
        opcoes: [...select.options].map(option => option.value),
        valor: select.value,
      };
    });
    check('P2-14: desconexão do menor progresso libera somente 1 e 4 aos restantes',
      saiu && JSON.stringify(aposSaida.opcoes) === JSON.stringify(['1', '4']) && aposSaida.valor === '4',
      JSON.stringify(aposSaida));

    await host.page.select('#startFloorSelect', '4');
    const propagou = await waitFor(async () => (await Promise.all(tabs.slice(0, 3).map((tab) => tab.page.evaluate(
      () => document.getElementById('startFloorSelect').value
    )))).every(value => value === '4'));
    check('P2-14: a escolha manual anterior do host chega aos convidados restantes', propagou);

    await shallow.page.close();
    const rejoined = await openTab(browser, 'P3');
    tabs[3] = rejoined;
    await joinRoom(rejoined, code, 'sorcerer');
    const reconectou = await waitFor(async () => {
      const estados = await Promise.all(tabs.slice(0, PEERS).map(tab => tab.page.evaluate(() => {
        const select = document.getElementById('startFloorSelect');
        return {
          roster: [...window.__SF.room.players.values()].map(p => `${p.name}:${p.deepestFloor}`),
          opcoes: [...select.options].map(option => option.value),
          valor: select.value,
          disabled: select.disabled,
        };
      })));
      return estados.every(estado =>
        estado.roster.length === 4 &&
        estado.roster.some(player => player === 'P3:1') &&
        JSON.stringify(estado.opcoes) === JSON.stringify(['1']) &&
        estado.valor === '1'
      );
    }, 30000);
    check('P2-14: reconexão do perfil menos avançado rebaixa a escolha manual para o comum', reconectou);
  }

  if ((CASE === 'full' || CASE === 'all') && PEERS < 10) {
    console.log(`      (pulando o caso de lotação: precisa de PEERS=10, rodando com ${PEERS})`);
  } else if (CASE === 'full' || CASE === 'all') {
    // Recusa por lotação: a aba extra tem de ser barrada com o motivo certo.
    const extra = await openTab(browser, 'Extra');
    tabs.push(extra);
    await joinRoom(extra, code, 'paladin');
    const barrado = await waitFor(async () => {
      const s = await text(extra, 'menuStatus');
      return s && /cheia/i.test(s);
    }, 20000);
    check('multi-peer: peer além do teto é recusado por lotação', barrado, await text(extra, 'menuStatus'));
  }

  // O caso mobile depende do tamanho da sala: sem os 10 não existe o #lobby da
  // AC 1 de UI-06, e sem a expulsão do caso `kick` não existem os 9 em partida
  // mais 1 na fila da AC 1 de UI-01. Registrar o pulo, como o caso de lotação
  // já faz, é melhor que reprovar uma corrida que nunca teve o estado.
  if (MEDE_TOQUE && PEERS !== 10) {
    console.log(`      (pulando #lobby, #roster e #queue: precisam de PEERS=10, rodando com ${PEERS})`);
  } else if (MEDE_TOQUE && CASE !== 'all') {
    console.log(`      (pulando #roster e #queue: a janela de 9 em partida e 1 na fila só existe em CASE=all, rodando "${CASE}")`);
  }

  if (RODA_LOCK) {
    await click(host, 'btnLock');
    const trancada = await waitFor(() => visible(host, 'lobbyLock'));
    check('multi-peer: a tranca fica visível para o host', trancada);

    // Única janela do roteiro com o estado que a AC 1 de UI-06 descreve.
    if (MEDE_TOQUE && PEERS === 10 && trancada) await medirLobbyTrancado(host);

    if (CASE === 'lock' || CASE === 'all') {
      const tarde = await openTab(browser, 'Tarde');
      tabs.push(tarde);
      await joinRoom(tarde, code, 'sorcerer');
      const recusado = await waitFor(async () => {
        const s = await text(tarde, 'menuStatus');
        return s && /trancada/i.test(s);
      }, 20000);
      check('multi-peer: tranca recusa mesmo com vaga', recusado, await text(tarde, 'menuStatus'));
    }
    await click(host, 'btnLock');
  }

  // Começar a partida.
  await click(host, 'btnStart');
  const noJogo = await waitFor(async () => (await Promise.all(tabs.slice(0, PEERS).map((t) => visible(t, 'game')))).every(Boolean), 30000);
  check('multi-peer: a partida começa em todas as abas da sala', noJogo);

  await sleep(4000);
  const andares = await Promise.all(tabs.slice(0, PEERS).map((t) => text(t, 'floorChip')));
  check('multi-peer: todas as abas concordam sobre o andar',
    new Set(andares).size === 1, andares.join(' | '));

  if (CASE === 'floor') {
    // O primeiro par snapshot + inventário é a base do checkpoint do
    // convidado. Esperar por ele impede que a virada prove só a troca visual
    // enquanto a confirmação autoritativa ainda não chegou.
    const baseConfirmada = await waitFor(async () => {
      const estados = await Promise.all(guests.map(tab => tab.page.evaluate(() => {
        const S = window.__SF;
        const checkpoint = S.confirmedProgress?.toSaveProjection();
        return {
          floor: S.floor,
          viewFloor: S.view.floor,
          checkpointFloor: checkpoint?.floor,
          checkpointTime: checkpoint?.order?.snapshotTime,
        };
      })));
      return estados.every(estado =>
        estado.floor === estado.viewFloor && estado.checkpointFloor === estado.floor && Number.isFinite(estado.checkpointTime)
      );
    }, 15000);
    check('P2-13: convidados têm checkpoint confirmado antes da virada', baseConfirmada);

    const antes = await Promise.all(tabs.slice(0, PEERS).map(tab => tab.page.evaluate(() => {
      const S = window.__SF;
      const checkpoint = S.confirmedProgress?.toSaveProjection();
      return {
        floor: S.floor,
        seed: S.seed,
        sent: S.floorAnnouncementsSent,
        received: S.floorAnnouncementsReceived,
        checkpointTime: checkpoint?.order?.snapshotTime ?? null,
      };
    })));
    const floorAnterior = antes[0].floor;
    const proximoAndar = floorAnterior + 1;
    const residuo = `P2-13-residuo-${Date.now()}`;

    // Um snapshot pode não ter item, projétil ou zona no instante da virada.
    // Semear uma visão velha deliberadamente prova que a mensagem `floor` a
    // limpa antes do snapshot novo, em vez de depender desse acaso da luta.
    await Promise.all(guests.map(tab => tab.page.evaluate(marker => {
      const S = window.__SF;
      S.view.monsterMap.set(`${marker}-monster`, {
        id: `${marker}-monster`, x: 1, y: 1, rx: 1, ry: 1, dir: 0,
        hp: 1, maxHp: 1, level: 1, shape: 'brute', color: '#000', size: 1, status: {},
      });
      S.view.monsters = [...S.view.monsterMap.values()];
      S.view.items = [{ id: 9913, x: 1, y: 1, glyph: '?', rarity: 'common', kind: 'item', name: marker }];
      S.view.projectiles = [{ id: 9914, x: 1, y: 1, elem: 0, big: false }];
      S.view.zones = [{ id: 9915, x: 1, y: 1, r: 1, color: '#000' }];
      S.view.portalOpen = true;
      S.view.portalReady = 1;
      S.view.portalTotal = 1;
      S.view.portalHold = 1;
    }, residuo)));

    // Segura somente o snapshot seguinte. O anúncio continua atravessando o
    // DataChannel real e abre uma janela observável para a limpeza local.
    await host.page.evaluate(() => {
      window.__SF.snapTimer = 60;
      window.__SF.G.pendingFloor = true;
    });
    const anuncioUnicoELimpeza = await waitFor(async () => {
      const estados = await Promise.all(tabs.slice(0, PEERS).map((tab, index) => tab.page.evaluate((base, next, marker, host) => {
        const S = window.__SF;
        const limpo = host || (
          !S.view.monsterMap.has(`${marker}-monster`) &&
          S.view.monsters.length === 0 &&
          S.view.items.length === 0 &&
          S.view.projectiles.length === 0 &&
          S.view.zones.length === 0 &&
          !S.view.portalOpen && S.view.portalReady === 0 && S.view.portalTotal === 0 && S.view.portalHold === 0
        );
        return {
          floor: S.floor,
          gameFloor: S.G?.floor ?? null,
          sent: S.floorAnnouncementsSent,
          received: S.floorAnnouncementsReceived,
          limpo,
          base,
        };
      }, antes[index], proximoAndar, residuo, index === 0)));
      return estados.every((estado, index) =>
        estado.floor === proximoAndar &&
        (index === 0 ? estado.gameFloor === proximoAndar && estado.sent === estado.base.sent + 1 :
          estado.received === estado.base.received + 1 && estado.limpo)
      );
    }, 15000);
    const duranteAnuncio = await Promise.all(tabs.slice(0, PEERS).map(tab => tab.page.evaluate(() => {
      const S = window.__SF;
      return {
        floor: S.floor,
        sent: S.floorAnnouncementsSent,
        received: S.floorAnnouncementsReceived,
        monsters: S.view.monsterMap.size,
        items: S.view.items.length,
        projectiles: S.view.projectiles.length,
        zones: S.view.zones.length,
        portal: S.view.portalOpen,
      };
    })));
    check('P2-13: host anuncia uma vez e cada convidado recebe uma única virada', anuncioUnicoELimpeza,
      JSON.stringify(duranteAnuncio));

    const protocolo = await readFile(join(ROOT, 'js/main.js'), 'utf8');
    check('P2-13: anúncio de andar transporta só o número, nunca o mapa',
      /net\.send\(\{ t: 'floor', floor: S\.G\.floor \}\)/.test(protocolo));

    const mapasDeterministicos = await Promise.all(tabs.slice(0, PEERS).map(tab => tab.page.evaluate(async () => {
      const S = window.__SF;
      const { generateMap } = await import('/js/world.js');
      const esperado = generateMap(S.seed, S.floor);
      const iguais = S.map
        && S.map.seed === esperado.seed
        && S.map.floor === esperado.floor
        && S.map.w === esperado.w
        && S.map.h === esperado.h
        && S.map.tiles.length === esperado.tiles.length
        && S.map.tiles.every((tile, index) => tile === esperado.tiles[index]);
      return { floor: S.floor, seed: S.seed, iguais };
    })));
    check('P2-13: host e convidados geram o mesmo mapa só de seed + andar',
      mapasDeterministicos.every(mapa => mapa.floor === proximoAndar && mapa.iguais)
        && new Set(mapasDeterministicos.map(mapa => `${mapa.seed}/${mapa.floor}`)).size === 1,
      JSON.stringify(mapasDeterministicos));

    // Libera o primeiro snapshot do andar novo. O inventário anterior continua
    // válido para a mesma `iv`; a confirmação só pode avançar quando este ack
    // autoritativo trouxer o novo andar e tempo maior.
    await host.page.evaluate(() => { window.__SF.snapTimer = 0; });
    const progressoConfirmado = await waitFor(async () => {
      const estados = await Promise.all(guests.map((tab, index) => tab.page.evaluate((base, next) => {
        const S = window.__SF;
        const checkpoint = S.confirmedProgress?.toSaveProjection();
        return {
          floor: S.floor,
          viewFloor: S.view.floor,
          checkpointFloor: checkpoint?.floor,
          checkpointTime: checkpoint?.order?.snapshotTime,
          baseTime: base.checkpointTime,
          monsters: S.view.monsterMap.size,
        };
      }, antes[index + 1], proximoAndar)));
      return estados.every(estado =>
        estado.floor === proximoAndar &&
        estado.viewFloor === proximoAndar &&
        estado.checkpointFloor === proximoAndar &&
        estado.checkpointTime > estado.baseTime &&
        estado.monsters > 0
      );
    }, 15000);
    check('P2-13: snapshot novo repovoa o andar e confirma o checkpoint do convidado', progressoConfirmado);
  }

  let transientLateMarker = null;
  if (CASE === 'late' && lateEarly) {
    // O primeiro `s` é a fonte de verdade do convidado que entrou antes do
    // início. Além de existir, ele deve conter a própria entidade, o host e o
    // mesmo andar do mapa derivado por seed; um `start` sem snapshot não passa.
    const snapshotInicial = await waitFor(() => lateEarly.page.evaluate(() => {
      const S = window.__SF;
      const me = S.view.playerMap.get(S.localId);
      return S.started
        && !S.queued
        && S.view.floor === S.floor
        && S.map?.floor === S.floor
        && S.view.playerMap.size === 2
        && !!me
        && Number.isFinite(me.rx)
        && Number.isFinite(me.ry)
        && [...S.view.playerMap.values()].some(p => p.id === 'host');
    }), 15000);
    const estadoSnapshot = await lateEarly.page.evaluate(() => {
      const S = window.__SF;
      const me = S.view.playerMap.get(S.localId);
      return {
        started: S.started,
        queued: S.queued,
        floor: S.floor,
        viewFloor: S.view.floor,
        mapFloor: S.map?.floor,
        localId: S.localId,
        proprio: me && { id: me.id, x: me.rx, y: me.ry },
        jogadores: [...S.view.playerMap.values()].map(p => p.id),
      };
    });
    check('P2-10: quem entra antes recebe snapshot inicial coerente ao começar',
      snapshotInicial, JSON.stringify(estadoSnapshot));

    // Um evento que já saiu de pendingEvents chega uma vez ao jogador ativo,
    // mas uma conexão aberta depois não pode reconstruí-lo por snapshot.
    transientLateMarker = `P2-10-${Date.now()}`;
    await host.page.evaluate((marker) => {
      window.__SF.G.pendingEvents.push({ t: 'log', m: marker, c: 'system' });
    }, transientLateMarker);
    const drenadoUmaVez = await waitFor(async () => (await lateEarly.page.evaluate((marker) =>
      [...document.querySelectorAll('#log p')].filter(line => line.textContent === marker).length
    , transientLateMarker)) === 1, 10000);
    await sleep(500);
    const repeticoes = await lateEarly.page.evaluate((marker) =>
      [...document.querySelectorAll('#log p')].filter(line => line.textContent === marker).length
    , transientLateMarker);
    check('P2-10: evento transitório drenado chega uma vez a quem já estava na partida',
      drenadoUmaVez && repeticoes === 1, `${repeticoes} linhas para ${transientLateMarker}`);
  }

  if (CASE === 'recovery') {
    // O canal real reenvia `acts` até o snapshot com `la` voltar. Seguramos o
    // próximo snapshot no host para abrir deterministicamente essa janela e
    // medimos os pacotes reais emitidos pelo convidado, sem forjar DataChannel
    // nem acrescentar mensagem ao protocolo.
    const guest = guests[0];
    const before = await host.page.evaluate((name) => {
      const player = Object.values(window.__SF.G.players).find(p => p.name === name);
      if (!player) return null;
      // A poção só é consumida fora do teto de vida; preparar essa condição
      // mantém o assert sobre idempotência, não sobre a regra de cura.
      player.hp = Math.max(1, player.hp - 20);
      return { id: player.id, potions: player.potions.hp, lastAct: player.lastAct };
    }, guest.name);
    const packetsBefore = await guest.page.evaluate(() => window.__NET_GET().packetsOut);
    await host.page.evaluate(() => { window.__SF.snapTimer = 0.45; });
    await guest.page.bringToFront();
    await guest.page.keyboard.press('q');
    const resentBeforeAck = await waitFor(async () => (await guest.page.evaluate(() =>
      window.__NET_GET().packetsOut
    )) >= packetsBefore + 2, 10000);
    const actionRecovered = await waitFor(async () => {
      const now = await host.page.evaluate((id) => {
        const player = window.__SF.G.players[id];
        return player ? { potions: player.potions.hp, lastAct: player.lastAct } : null;
      }, before?.id);
      return !!now && now.lastAct === (before?.lastAct || 0) + 1 && now.potions === before?.potions - 1;
    }, 10000);
    await sleep(500);
    const after = await host.page.evaluate((id) => {
      const player = window.__SF.G.players[id];
      return player ? { potions: player.potions.hp, lastAct: player.lastAct } : null;
    }, before?.id);
    check('recuperação multi-peer: reenvios reais de input não duplicam a ação',
      resentBeforeAck &&
        actionRecovered &&
        after?.potions === before?.potions - 1 &&
        after?.lastAct === before?.lastAct + 1,
      JSON.stringify({ before, after, packetsBefore, packetsAfter: await guest.page.evaluate(() => window.__NET_GET().packetsOut) }));

    const marker = `P2-09-${Date.now()}`;
    await host.page.evaluate((message) => {
      window.__SF.G.pendingEvents.push({ t: 'log', m: message, c: 'system' });
    }, marker);
    const eventRecovered = await waitFor(async () => (await guest.page.evaluate((message) =>
      [...document.querySelectorAll('#log p')].filter(line => line.textContent === message).length
    , marker)) === 1, 10000);
    await sleep(500);
    const eventCount = await guest.page.evaluate((message) =>
      [...document.querySelectorAll('#log p')].filter(line => line.textContent === message).length
    , marker);
    check('recuperação multi-peer: evento real drenado chega uma vez ao convidado',
      eventRecovered && eventCount === 1, `${eventCount} linhas para ${marker}`);
  }

  if (MEDE_AUDIO) {
    // A entrada no buffer é a fronteira real da simulação. O host despacha o
    // lote para si e o replica por `E`; o convidado só pode trocar faixa ao
    // receber esse mesmo lote, não por consultar estado de chefe no snapshot.
    const ativas = tabs.slice(0, PEERS);
    const lerAudio = (tab) => tab.page.evaluate(() => ({ ...window.__audioProbe }));
    const conta = (probe, frequency) => probe.starts.filter((f) => f === frequency).length;
    const antes = await Promise.all(ativas.map(lerAudio));
    await Promise.all(ativas.map((tab) => tab.page.evaluate(() => window.__SF.audio.unlock())));

    await host.page.evaluate(() => window.__SF.G.pendingEvents.push({
      t: 'bossEngage', id: 91, typeId: 'glacier', floor: window.__SF.floor, hardcore: 1, boss: 1,
    }));
    const iniciou = await waitFor(async () => {
      const probes = await Promise.all(ativas.map(lerAudio));
      return probes.every((probe, i) => conta(probe, 123) === conta(antes[i], 123) + 1);
    }, 10000);
    check('áudio multi-peer: bossEngage HARDCORE inicia a luta no mesmo lote para host e convidado', iniciou,
      JSON.stringify(await Promise.all(ativas.map(lerAudio))));

    // Quem entra depois do lote fica na fila e não recebe replay transitório:
    // iniciar a faixa aqui significaria que a composição consultou estado em
    // vez de reagir ao evento que já foi drenado.
    // Na matriz cheia não há vaga neste instante. O caso `kick` abre uma logo
    // antes da janela `late`, onde a mesma entrada tardia será conferida sem
    // transformar uma recusa por lotação numa falsa falha de áudio.
    if ((CASE === 'all' && PEERS === 10) || CASE === 'late') {
      validarAudioTardeNaFila = true;
    } else {
      const tardeAudio = await openTab(browser, 'TardeAudio');
      tabs.push(tardeAudio);
      await joinRoom(tardeAudio, code, 'paladin');
      const tardeNaFila = await waitFor(() => visible(tardeAudio, 'queue'), 25000);
      await tardeAudio.page.evaluate(() => window.__SF.audio.unlock());
      const probeTarde = await lerAudio(tardeAudio);
      check('áudio multi-peer: entrada tardia não reexecuta bossEngage já drenado',
        tardeNaFila && conta(probeTarde, 123) === 0 && conta(probeTarde, 55) === 0,
        JSON.stringify({ tardeNaFila, probeTarde }));
    }

    await host.page.evaluate(() => window.__SF.G.pendingEvents.push({
      t: 'bossDisengage', id: 91, typeId: 'glacier', floor: window.__SF.floor, hardcore: 1, boss: 1,
    }));
    const terminou = await waitFor(async () => {
      const probes = await Promise.all(ativas.map(lerAudio));
      return probes.every((probe, i) => conta(probe, 55) === conta(antes[i], 55) + 1);
    }, 10000);
    check('áudio multi-peer: bossDisengage devolve ambiente no mesmo lote para host e convidado', terminou,
      JSON.stringify(await Promise.all(ativas.map(lerAudio))));
  }

  if (CASE === 'checkpoint') {
    check('P2-14: start.floor nunca inicia acima do checkpoint comum após reconexão',
      andares.every(andar => /Andar 1/.test(andar || '')), andares.join(' | '));
    const mapas = await Promise.all(tabs.slice(0, PEERS).map((tab) => tab.page.evaluate(async () => {
      const { S } = { S: window.__SF };
      const { generateMap } = await import('/js/world.js');
      const esperado = generateMap(S.seed, S.floor);
      const assinatura = (map) => `${map.seed}/${map.floor}/${map.tiles.length}/${map.tiles.reduce((sum, tile) => sum + tile, 0)}`;
      return { seed: S.seed, floor: S.floor, local: assinatura(S.map), derivado: assinatura(esperado) };
    })));
    check('checkpoint: cada mapa continua derivado somente de seed + floor',
      mapas.every(map => map.local === map.derivado) && new Set(mapas.map(map => map.local)).size === 1,
      JSON.stringify(mapas));
  }

  // VIEW=desktop fica de fora: trocar isMobile/hasTouch recarrega a aba e
  // derrubaria a sessão P2P que os casos seguintes usam.
  if (VIEW !== 'desktop') await medirBarraChatSala(host);

  if (MEDE_TOQUE) {
    // O #roster é medido mais adiante, na janela do caso `late`; aqui só o
    // trilho, que depende da partida em curso e não da composição da sala.
    if (PEERS < PEERS_TRILHO) {
      console.log(`      (pulando o trilho de aliados: precisa de PEERS>=${PEERS_TRILHO}, rodando com ${PEERS})`);
    } else {
      await medirTrilho(host);
    }
  }

  if (CASE === 'kick' || CASE === 'all') {
    const alvo = guests[0];
    // A expulsão tira exatamente uma pessoa em qualquer tamanho de matriz: o
    // caso isolado usa 3 (host + sobrevivente), enquanto `all` preserva os 9.
    const participantesAposExpulsao = PEERS - 1;
    await host.page.evaluate(() => document.getElementById('crewChip')?.click());
    await sleep(500);
    // Alvo pelo nome, não pela posição: casos anteriores podem ter mudado a ordem.
    const expulsou = await host.page.evaluate((nome) => {
      const row = [...document.querySelectorAll('#rosterList .roster-row')]
        .find((r) => r.querySelector('.rr-name')?.textContent === nome);
      if (!row) return false;
      const btn = [...row.querySelectorAll('.btn')].find((b) => b.textContent.includes('Expulsar'));
      if (!btn) return false;
      btn.click();
      const sim = [...row.querySelectorAll('.btn')].find((b) => b.textContent === 'Sim');
      if (!sim) return false;
      sim.click();
      return true;
    }, alvo.name);
    check('multi-peer: o host consegue disparar a expulsão', expulsou);
    const removido = await waitFor(async () => alvo.page.evaluate(() => {
      const S = window.__SF;
      const overlay = document.getElementById('dropOverlay');
      return S.expected
        && !S.started
        && !overlay.classList.contains('hidden')
        && !overlay.classList.contains('warn-state')
        && /voc[eê] saiu da sala/i.test(document.getElementById('dropTitle').textContent)
        && /host removeu voc[eê] da partida/i.test(document.getElementById('dropText').textContent)
        && !document.getElementById('dropSaved').classList.contains('hidden')
        && /voltar ao menu/i.test(document.getElementById('btnLeave').textContent);
    }), 15000);
    const hostLimpo = await waitFor(async () => host.page.evaluate(({ nome, esperados }) => {
      const S = window.__SF;
      return ![...S.room.players.values(), ...S.room.queue].some(p => p.name === nome)
        && !Object.values(S.G.players).some(p => p.name === nome)
        && S.room.count === esperados;
    }, { nome: alvo.name, esperados: participantesAposExpulsao }), 10000);
    const sobrevivente = guests[1];
    const outroLadoLimpo = await waitFor(async () => sobrevivente.page.evaluate(({ nome, esperados }) => {
      const S = window.__SF;
      return ![...S.room.players.values(), ...S.room.queue].some(p => p.name === nome)
        && ![...S.view.playerMap.values()].some(p => p.name === nome)
        && S.view.playerMap.size === esperados;
    }, { nome: alvo.name, esperados: participantesAposExpulsao }), 15000);
    check('P2-12: expulso recebe fim acionável, salvo e sem loop ativo', removido);
    check('P2-12: host remove o alvo do roster e da simulação', hostLimpo);
    check('P2-12: sobrevivente recebe a limpeza do roster e do snapshot', outroLadoLimpo);

    // A fila só existe depois do início. Este ramo dedicado cria duas pessoas
    // esperando, remove a primeira pela ação real e confere a nova posição da
    // segunda; CASE=all já usa a vaga da expulsão para o cenário P2-10.
    if (CASE === 'kick') {
      const filaA = await openTab(browser, 'FilaExpulsa');
      const filaB = await openTab(browser, 'FilaSeguinte');
      tabs.push(filaA, filaB);
      await joinRoom(filaA, code, 'sorcerer');
      await joinRoom(filaB, code, 'paladin');
      const filaPronta = await waitFor(async () => {
        const [a, b] = await Promise.all([text(filaA, 'queuePos'), text(filaB, 'queuePos')]);
        return /1º.*2/.test(a || '') && /2º.*2/.test(b || '');
      }, 20000);
      check('P2-12: duas entradas tardias entram na fila em ordem', filaPronta,
        `${await text(filaA, 'queuePos')} · ${await text(filaB, 'queuePos')}`);

      const expulsouFila = await host.page.evaluate((nome) => {
        const row = [...document.querySelectorAll('#rosterQueue .roster-row')]
          .find((r) => r.querySelector('.rr-name')?.textContent === nome);
        if (!row) return false;
        const btn = [...row.querySelectorAll('.btn')].find((b) => b.textContent.includes('Expulsar'));
        if (!btn) return false;
        btn.click();
        const sim = [...row.querySelectorAll('.btn')].find((b) => b.textContent === 'Sim');
        if (!sim) return false;
        sim.click();
        return true;
      }, filaA.name);
      check('P2-12: host consegue expulsar uma pessoa da fila', expulsouFila);
      const filaRemovida = await waitFor(async () => filaA.page.evaluate(() =>
        !window.__SF.queued
          && !document.getElementById('menu').classList.contains('hidden')
          && /host removeu voc[eê] da sala/i.test(document.getElementById('menuStatus').textContent)
      ), 15000);
      const filaPromovida = await waitFor(async () => {
        const [posicao, hostState] = await Promise.all([
          text(filaB, 'queuePos'),
          host.page.evaluate((nome) => {
            const S = window.__SF;
            return {
              queue: S.room.queue.map(p => p.name),
              players: Object.values(S.G.players).map(p => p.name),
              count: S.room.count,
            };
          }, filaA.name),
        ]);
        return /1º.*1/.test(posicao || '')
          && hostState.queue.length === 1
          && hostState.queue[0] === filaB.name
          && !hostState.players.includes(filaA.name)
          && hostState.count === 3;
      }, 15000);
      check('P2-12: removido da fila volta ao menu com mensagem acionável', filaRemovida);
      check('P2-12: fila remanescente é republicada com a posição promovida', filaPromovida,
        await text(filaB, 'queuePos'));
    }
  }

  if (CASE === 'shot' || CASE === 'all') {
    // Prova visual: com aliados na sala, o trilho e o minimapa precisam aparecer.
    await sleep(6000);
    const dir = process.env.OUT || '/tmp/shadowfall-shots';
    for (let i = 0; i < Math.min(2, tabs.length); i++) {
      await tabs[i].page.bringToFront();
      await sleep(700);
      await tabs[i].page.screenshot({ path: `${dir}/grupo-${i}.png` });
    }
    const temTrilho = await host.page.evaluate(() => document.querySelectorAll('#partyList .plaque.mate').length);
    // O teto vale para os vivos: o caído entra além dele (js/allyrail.js), então
    // contar `.plaque.mate` cru media coisa diferente do invariante.
    const vivosTrilho = await host.page.evaluate(() => document.querySelectorAll('#partyList .plaque.mate:not(.down)').length);
    check('multi-peer: o trilho de aliados aparece no HUD', temTrilho > 0, `${temTrilho} placas`);
    check('multi-peer: o trilho respeita o teto de 3 placas vivas', vivosTrilho <= 3, `${vivosTrilho} vivas de ${temTrilho} placas`);
  }

  if (CASE === 'probe') {
    for (let i = 0; i < 6; i++) {
      await sleep(1000);
      const linha = await Promise.all(tabs.slice(0, PEERS).map((t) => t.page.evaluate(() => window.__sf?.stats())));
      console.log('      ' + linha.map((s, i) => `${i}:${s?.frames}f/${s?.packetsOut}p/${Math.round((s?.bytesOut||0)/1024)}K/${s?.players}j`).join('  '));
    }
  }

  if (CASE === 'late' || CASE === 'all') {
    // Quem chega com a partida em curso vai para a fila, não para o andar.
    const tarde = await openTab(browser, 'Tarde');
    tabs.push(tarde);
    await joinRoom(tarde, code, 'paladin');
    const naFila = await waitFor(() => visible(tarde, 'queue'), 25000);
    check('multi-peer: quem entra em partida cai na tela de espera', naFila);
    if (naFila) {
      if (CASE === 'late') {
        const estadoFila = await waitFor(() => tarde.page.evaluate((peers) => {
          const S = window.__SF;
          return S.queued
            && !S.started
            && S.room.players.size === peers
            && S.room.queue.length === 1
            && [...S.room.queue].some(p => p.name === 'Tarde');
        }, PEERS), 10000);
        const filaCanonica = await tarde.page.evaluate(() => {
          const S = window.__SF;
          return {
            queued: S.queued,
            started: S.started,
            jogo: !document.getElementById('game').classList.contains('hidden'),
            mapa: !!S.map,
            jogadores: [...S.room.players.values()].map(p => p.name),
            fila: S.room.queue.map(p => p.name),
            entidades: S.view.playerMap.size,
          };
        });
        check('P2-10: entrada após o início recebe fila canônica, sem estado do andar',
          estadoFila && !filaCanonica.jogo && !filaCanonica.mapa && filaCanonica.entidades === 0,
          JSON.stringify(filaCanonica));
        await sleep(500);
        if (transientLateMarker) {
          const replays = await tarde.page.evaluate((marker) =>
            [...document.querySelectorAll('#log p')].filter(line => line.textContent === marker).length
          , transientLateMarker);
          check('P2-10: entrada após evento drenado não recebe replay transitório',
            replays === 0, `${replays} linhas para ${transientLateMarker}`);
        }
      }
      if (validarAudioTardeNaFila) {
        await tarde.page.evaluate(() => window.__SF.audio.unlock());
        const probeTarde = await tarde.page.evaluate(() => ({ ...window.__audioProbe }));
        const contaAudio = (probe, frequency) => probe.starts.filter((f) => f === frequency).length;
        check('áudio multi-peer: entrada tardia não reexecuta bossEngage já drenado',
          contaAudio(probeTarde, 123) === 0 && contaAudio(probeTarde, 55) === 0,
          JSON.stringify({ probeTarde }));
        validarAudioTardeNaFila = false;
      }
      const andar = await text(tarde, 'queueFloor');
      const pos = await text(tarde, 'queuePos');
      check('multi-peer: a fila informa o andar do grupo e a posição',
        /Andar \d+/.test(andar || '') && /1º/.test(pos || ''), `${andar} · ${pos}`);
      check('multi-peer: quem espera não entra no andar em curso', !(await visible(tarde, 'game')));

      // Antes do btnQueueLeave: 9 em partida e 1 na fila (AC 1 de UI-01).
      if (MEDE_TOQUE && PEERS === 10) {
        await medirToqueSala(host);
        await medirToqueFila(tarde);
      }

      const antes = await text(host, 'crewChip');
      await click(tarde, 'btnQueueLeave');
      const desistiu = await waitFor(async () => (await text(host, 'crewChip')) !== antes, 15000);
      check('multi-peer: desistir da fila libera a vaga', desistiu, `${antes} -> ${await text(host, 'crewChip')}`);
    }
  }

  if (CASE === 'queue') await runQueueCase();

  if (CASE === 'measure' || CASE === 'all') {
    // Mede a sessão real. Ressalva honesta: N abas dividem uma CPU e uma GPU
    // por software (swiftshader), então o quadro por segundo aqui mede o
    // harness. Com 1 aba o host fica estável em ~48fps nesta mesma máquina.
    // O número que importa e que não dava para obter de outro jeito é a banda
    // de saída do host em estrela.
    await sleep(1500);
    const zero = await host.page.evaluate(() => window.__sf?.stats());
    const t0 = Date.now();
    const amostras = [];
    for (let i = 0; i < 5; i++) {
      await sleep(1000);
      amostras.push(await Promise.all(tabs.slice(0, PEERS).map((t) => t.page.evaluate(() => window.__sf?.stats()))));
    }
    const segundos = (Date.now() - t0) / 1000;
    const fim = amostras[amostras.length - 1];
    const hostFim = fim[0];

    const bytesPorSeg = (hostFim.bytesOut - (zero?.bytesOut || 0)) / segundos;
    const pacotesPorSeg = (hostFim.packetsOut - (zero?.packetsOut || 0)) / segundos;
    const porPeer = PEERS > 1 ? bytesPorSeg / (PEERS - 1) : 0;

    const fpsConvidados = amostras.flatMap((a) => a.slice(1).map((x) => x?.frames || 0)).sort((a, b) => a - b);
    const mediana = fpsConvidados.length ? fpsConvidados[Math.floor(fpsConvidados.length / 2)] : 0;
    const pings = fim.slice(1).map((x) => x?.ping || 0).filter((v) => v > 0);
    const pingMedio = pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : 0;

    console.log(`      host: ${(bytesPorSeg / 1024).toFixed(1)} KB/s para ${PEERS - 1} peers`
      + ` (${(porPeer / 1024).toFixed(1)} KB/s por peer, ${pacotesPorSeg.toFixed(0)} pacotes/s)`);
    console.log(`      convidados: ${mediana} quadros/s (mediana) · latência ${pingMedio}ms`);
    console.log('      ressalva: N abas dividem uma CPU e uma GPU por software neste harness');

    // O host aqui está estrangulado pela contenção, então a taxa medida está
    // abaixo da real. O que projeta a banda de produção é o tamanho do pacote
    // vezes a frequência de snapshot vezes o número de peers.
    const pacotes = hostFim.packetsOut - (zero?.packetsOut || 0);
    const bytesPorPacote = pacotes ? (hostFim.bytesOut - (zero?.bytesOut || 0)) / pacotes : 0;
    const projetado = bytesPorPacote * SNAP_HZ * (PEERS - 1);
    console.log(`      pacote médio: ${(bytesPorPacote / 1024).toFixed(1)} KB`
      + ` · projeção a ${SNAP_HZ}Hz para ${PEERS - 1} peers: ${(projetado / 1024).toFixed(0)} KB/s`);
    console.log(`      máximo observado: tick ${hostFim.maxHostTickMs.toFixed(3)} ms`
      + ` · snapshot ${hostFim.maxSnapshotBytes} B`);

    // Todo convidado precisa estar recebendo estado: é o que prova que o host
    // alcança os 9, e não só os primeiros.
    // Cada convidado precisa enxergar a mesma sala que o host: é o que prova
    // que o snapshot chega aos 9, e não só aos primeiros. Comparar com o host
    // e não com PEERS mantém o teste válido depois de uma expulsão.
    // O expulso precisa sair da conta pelo #dropOverlay, e não por `started`:
    // guard.endExpected (js/session.js:43) só marca S.expected, então o
    // convidado removido continua com started true e com a contagem congelada
    // de antes da expulsão — comparar com ele reprovava o host sem motivo.
    const encerrados = await Promise.all(tabs.slice(1, PEERS).map((t) => visible(t, 'dropOverlay')));
    const noHost = hostFim.players;
    const vivos = fim.slice(1).filter((x, i) => x && x.started && !x.queued && !encerrados[i]);
    const todosRecebendo = vivos.length > 0 && vivos.every((x) => x.players === noHost);
    check('multi-peer: o host envia snapshot a todos os peers', todosRecebendo,
      `host ${noHost} · convidados ${vivos.map((x) => x.players).join(',')}`);
    check(
      `multi-peer: maior snapshot real fica abaixo de ${SNAPSHOT_BUDGET_BYTES}B`,
      Number.isFinite(hostFim.maxSnapshotBytes) && hostFim.maxSnapshotBytes < SNAPSHOT_BUDGET_BYTES,
      `${hostFim.maxSnapshotBytes}B`
    );
    check('multi-peer: a projeção de banda do host cabe no limite declarado',
      projetado < 900 * 1024, `${(projetado / 1024).toFixed(0)} KB/s projetados`);
    check('multi-peer: a banda projetada por peer cabe no limite declarado',
      PEERS === 1 || bytesPorPacote * SNAP_HZ < 120 * 1024, `${(bytesPorPacote * SNAP_HZ / 1024).toFixed(0)} KB/s por peer`);
    check('multi-peer: o jogo continua rodando em todas as abas', mediana > 0, `${mediana} quadros/s`);
    check('multi-peer: a latência medida é plausível', pingMedio >= 0 && pingMedio < 2000, `${pingMedio}ms`);
  }

  if (CASE === 'drop' || CASE === 'all') {
    const sobrevivente = guests[guests.length - 1];
    await host.page.close();
    const avisado = await waitFor(async () => {
      const t = await text(sobrevivente, 'dropTitle');
      return t && /(instável|encerrada)/i.test(t);
    }, 20000);
    check('multi-peer: queda do host avisa quem ficou', avisado, await text(sobrevivente, 'dropTitle'));
  }

  // Toda aba aberta em viewport de toque precisa ter entrado em `pointer:
  // coarse` (RF-02b) — inclusive as que entram tarde no roteiro (`Extra`,
  // `Tarde`), que passam pelo mesmo openTab.
  const erradas = tabs.filter((t) => t.coarse !== !!t.viewport.hasTouch);
  check(`multi-peer: as ${tabs.length} abas casam com o "pointer: coarse" da sua viewport (VIEW=${VIEW})`,
    erradas.length === 0,
    erradas.map((t) => `${t.name} coarse=${t.coarse}`).join(' | '));

  // Nenhuma aba pode registrar erro de página ou de console.
  const comErro = tabs.filter((t) => t.errors.length);
  check('multi-peer: nenhuma aba registra erro de página ou console',
    comErro.length === 0, comErro.map((t) => t.errors[0]).join(' | '));
} catch (e) {
  console.log(`  FAIL harness abortado: ${e.message}`);
  failures++;
} finally {
  await browser.close().catch(() => {});
  if (server) server.close();
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
