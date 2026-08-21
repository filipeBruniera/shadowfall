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
//   CASE   basic (padrão) | full | lock | kick | late | drop | measure | shot
//          | probe | mobile | all
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
  VIEWPORT_MOBILE, VIEWPORT_SMALL, VIEWPORT_DESKTOP, ALTURAS_UI03, ALVO_MIN,
  alturaMobile, installHelpers,
} from './mobile-helpers.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 5199);
const PEERS = Number(process.env.PEERS || 2);
const CASE = process.env.CASE || 'basic';
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
      const path = normalize(decodeURIComponent(req.url.split('?')[0]));
      const file = join(ROOT, path === '/' ? 'index.html' : path);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) { res.writeHead(404).end('nao encontrado'); }
  }).listen(PORT);
}

const MEDE_TOQUE = CASE === 'mobile' || CASE === 'all';
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
  // Sem isto, só a última aba aberta roda o requestAnimationFrame: as demais
  // ficam ocultas para o navegador e o loop do jogo congela nelas. Com 10 abas
  // isso mediria o congelamento, não o jogo.
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: console ${m.text()}`); });
  const alvo = BASE ? `${BASE.replace(/\/$/, '')}/index.html?debug=1` : `http://localhost:${PORT}/index.html?debug=1`;
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
        fora, truncados, acoes: tela.querySelectorAll('.menu-actions .btn').length,
        pequenos: M.targets('#lobby')
          .filter((t) => t.w < alvoMin || t.h < alvoMin)
          .map((t) => `${t.alvo} ${t.w}x${t.h}`),
      };
    }, ALVO_MIN, ROTULOS_LOBBY);

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
      return {
        crew: M.rect('#crewChip'),
        clip: chip ? getComputedStyle(chip).backgroundClip : null,
        irmaos: ['floorChip', 'goldChip', 'roomChip', 'crewLock', 'pingChip']
          .map((id) => ({ id, r: M.rect('#' + id) }))
          .filter((x) => x.r)
          .map((x) => ({ id: x.id, h: x.r.height })),
      };
    });
    check(`TOQUE: ${ctx} o #crewChip tem caixa de ao menos 44px de altura`,
      !!chips.crew && chips.crew.height >= ALVO_MIN,
      chips.crew ? `${chips.crew.height.toFixed(1)}px` : 'ausente ou invisível');
    check(`TOQUE: ${ctx} o #crewChip pinta só a caixa de conteúdo`,
      chips.clip === 'content-box', String(chips.clip));
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

const erguerAliado = (tab) => tab.page.evaluate(() => {
  clearInterval(window.__mantemCaido);
  window.__mantemCaido = null;
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

try {
  console.log(`\n== harness multi-peer: ${PEERS} abas, caso "${CASE}" ==`);

  for (let i = 0; i < PEERS; i++) {
    tabs.push(await openTab(browser, i === 0 ? 'Host' : 'P' + i));
  }
  const [host, ...guests] = tabs;

  const code = await hostRoom(host);
  console.log(`      sala ${code}`);
  check('multi-peer: o host abre a sala e recebe um código de 4 letras', /^[A-Z0-9]{4}$/.test(code), code);

  for (const g of guests) await joinRoom(g, code, 'druid');

  const entraram = await waitFor(async () => (await text(host, 'lobbyCount')) === `${PEERS}/10`, 30000);
  check(`multi-peer: ${PEERS} abas entram na mesma sala`, entraram, await text(host, 'lobbyCount'));

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
    const viu = await waitFor(async () => {
      const t = await text(alvo, 'dropTitle');
      const s = await text(alvo, 'menuStatus');
      return (t && /saiu da sala/i.test(t)) || (s && /removeu/i.test(s));
    }, 15000);
    check('multi-peer: expulso vê a mensagem certa e sai da simulação', viu);
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
    check('multi-peer: o trilho de aliados aparece no HUD', temTrilho > 0, `${temTrilho} placas`);
    check('multi-peer: o trilho respeita o teto de 3 placas', temTrilho <= 3, `${temTrilho} placas`);
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
