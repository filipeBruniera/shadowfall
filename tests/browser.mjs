import puppeteer from 'puppeteer';
// A AC 2 de UI-03 proíbe repetir o 0.5 aqui: a fração da zona do joystick e o
// raio do #stick vêm de js/balance.js, a mesma fonte que js/main.js consulta
// para decidir a origem do toque. INV_SIZE fecha a mochila cheia de UI-04.
import { TOUCH_STICK_ZONE, TOUCH_STICK_RADIUS, INV_SIZE } from '../js/balance.js';
import {
  VIEWPORT_MOBILE, VIEWPORT_SMALL, ALTURAS_UI03, ALVO_MIN, SLOT_LADO, BARRA_LARGURA,
  alturaMobile, installHelpers,
} from './mobile-helpers.mjs';

const URL = process.env.URL || 'http://localhost:8099/index.html';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const OUT = process.env.OUT || '/tmp/shadowfall-shots';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });

const errors = [];
const logs = [];
page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (!u.includes('fonts.g') && !u.includes('peerjs')) errors.push('REQFAIL: ' + u + ' ' + r.failure()?.errorText);
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/01-menu.png` });

// escolhe druida e entra sozinho
await page.click('.voc-card[data-voc="druid"]');
await page.type('#nameInput', 'Filipe');
await new Promise((r) => setTimeout(r, 200));
await page.screenshot({ path: `${OUT}/02-menu-voc.png` });

await page.click('#btnSolo');
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${OUT}/03-game-start.png` });

// anda um pouco e ataca
for (const key of ['KeyD', 'KeyS']) {
  await page.keyboard.down(key);
  await new Promise((r) => setTimeout(r, 900));
  await page.keyboard.up(key);
}
await page.mouse.move(900, 400);
for (const k of ['1', '2', '3', '4']) {
  await page.keyboard.press(`Digit${k}`);
  await new Promise((r) => setTimeout(r, 350));
}
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/04-combat.png` });

// teleporta o jogador para perto de um monstro para forçar combate real
const combat = await page.evaluate(async () => {
  const S = window.__SF;
  if (!S) return { error: 'estado não exposto' };
  const G = S.G;
  const p = G.players.host;
  const m = G.monsters.find((x) => x.hp > 0 && !x.isBoss);
  if (!m) return { error: 'sem monstros' };
  p.x = m.x + 1.2; p.y = m.y;
  await new Promise((r) => setTimeout(r, 2500));
  return {
    monstersAlive: G.monsters.filter((x) => x.hp > 0).length,
    playerHp: Math.round(p.hp),
    dmgDone: Math.round(p.dmgDone),
    gold: p.gold,
    items: G.items.length,
    fx: window.__FX ? window.__FX.particles.length : -1,
  };
});
await page.screenshot({ path: `${OUT}/05-fight.png` });

// mochila
await page.keyboard.press('Tab');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `${OUT}/06-bag.png` });
await page.keyboard.press('Escape');

// mata o chefe para checar portal e troca de andar
const floorTest = await page.evaluate(async () => {
  const S = window.__SF;
  const G = S.G;
  const boss = G.monsters.find((m) => m.isBoss);
  if (boss) boss.hp = 0;
  await new Promise((r) => setTimeout(r, 600));
  const portal = G.portalOpen;
  const p = G.players.host;
  p.x = G.map.portal.x + 0.5;
  p.y = G.map.portal.y + 0.5;
  await new Promise((r) => setTimeout(r, 2400));
  return { portal, floor: G.floor, monsters: G.monsters.length };
});
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/07-floor2.png` });

// UI-02: em andar múltiplo de 3 a barra do chefe tem de dizer HARDCORE por
// texto, não por cor. É a única asserção da SPEC que só o navegador fecha —
// tests/sim.test.mjs cobre bossBarLabel(), mas não o texto real do #bossName.
const hardcore = await page.evaluate(async () => {
  const G = window.__SF.G;
  // Desce pelo mesmo gatilho do jogo: main.js consome pendingFloor e chama
  // nextFloor(). Nada de fabricar estado que a partida real não produziria.
  let guarda = 0;
  while (G.floor % 3 !== 0 && guarda++ < 6) {
    G.pendingFloor = true;
    await new Promise((r) => setTimeout(r, 500));
  }
  const boss = G.monsters.find((m) => m.isBoss && m.hp > 0);
  if (!boss) return { error: 'sem chefe no andar' };
  // A barra só aparece com o chefe a menos de 18 tiles do jogador local.
  const p = G.players.host;
  p.x = boss.x + 2; p.y = boss.y + 2;
  await new Promise((r) => setTimeout(r, 700));
  const bar = document.getElementById('bossBar');
  return {
    floor: G.floor,
    hardcore: !!boss.hardcore,
    barVisivel: !bar.classList.contains('hidden'),
    bossName: document.getElementById('bossName').textContent,
  };
});
await page.screenshot({ path: `${OUT}/10-boss-hardcore.png` });
if (hardcore.error) errors.push('HARDCORE: ' + hardcore.error);
else {
  if (hardcore.floor % 3 !== 0) errors.push(`HARDCORE: não chegou a andar múltiplo de 3 (andar ${hardcore.floor})`);
  if (!hardcore.hardcore) errors.push(`HARDCORE: o chefe do andar ${hardcore.floor} não veio marcado`);
  if (!hardcore.barVisivel) errors.push('HARDCORE: a barra do chefe não apareceu');
  if (!/HARDCORE/.test(hardcore.bossName)) errors.push(`HARDCORE: #bossName sem o termo — "${hardcore.bossName}"`);
}

const fps = await page.evaluate(() => new Promise((res) => {
  let frames = 0;
  const t0 = performance.now();
  const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(frames / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(tick);
}));

// ============================================================
// CONTEXTOS DE TOQUE — 390x844 e 360x640, os dois de UI-01, UI-02 e UI-03.
// Aqui só entra o que a partida solo alcança: #menu, #actionBar, seus slots e o
// #bag. O que exige sala de verdade (#roster, #crewChip, #lobby) é medido por
// tests/multipeer.mjs.
// ============================================================

// Gutter de painel praticado em styles.css:161 e styles.css:372; a altura útil
// de UI-04 é innerHeight menos ele duas vezes.
const GUTTER = 12;
// Tolerância de subpixel: getBoundingClientRect devolve fração e o painel é
// centrado por translate(-50%, -50%), então o topo de 12 vira 11,7 sem defeito.
const TOL = 0.5;

// As viewports moram em mobile-helpers.mjs porque tests/multipeer.mjs mede as
// mesmas caixas. O par pequeno é contrato de RF-02a: se o módulo compartilhado
// derivar, este harness passaria medindo duas vezes 390 sem avisar ninguém.
const ALVO_PEQUENO = { width: 360, height: 640 };
if (VIEWPORT_SMALL.width !== ALVO_PEQUENO.width || VIEWPORT_SMALL.height !== ALVO_PEQUENO.height) {
  errors.push(`TOQUE: o contexto pequeno virou ${VIEWPORT_SMALL.width}x${VIEWPORT_SMALL.height},`
    + ` esperado ${ALVO_PEQUENO.width}x${ALVO_PEQUENO.height}`);
}

// UI-03 AC 3: a borda direita da zona reservada, medida em cada largura, sai no
// relatório final — 259 em 390 e 244 em 360.
const zonas = new Map();
async function abrirToque(viewport) {
  const ctx = `${viewport.width}x${viewport.height}`;
  const p = await browser.newPage();
  await p.setViewport(viewport);
  await installHelpers(p);
  p.on('pageerror', (e) => errors.push(`PAGEERROR ${ctx}: ${e.message}`));
  await p.goto(URL, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 600));
  if (!(await p.evaluate(() => matchMedia('(pointer: coarse)').matches))) {
    errors.push(`TOQUE: ${ctx} não ativou "pointer: coarse" — a medição cairia no CSS de desktop`);
  }
  await p.screenshot({ path: `${OUT}/08-mobile-menu-${ctx}.png` });
  await medirMenu(p, ctx);
  await p.click('.voc-card[data-voc="paladin"]');
  await p.click('#btnSolo');
  await new Promise((r) => setTimeout(r, 1800));
  await p.screenshot({ path: `${OUT}/09-mobile-game-${ctx}.png` });
  return p;
}

// UI-06: nem rolagem horizontal, nem descendente fora da viewport, nem rótulo
// de botão truncado. Medido com o #menu ainda na tela — o #lobby, que exige sala
// de verdade, fica com tests/multipeer.mjs. A varredura de UI-01 aproveita a
// mesma visita: o menu é a primeira superfície de toque da partida.
async function medirMenu(page, ctx) {
  const m = await page.evaluate((alvoMin) => {
    const M = window.__M;
    const tela = document.querySelector('.screen:not(.hidden)');
    if (!tela) return { erro: 'nenhuma .screen visível' };
    const fora = [];
    for (const el of tela.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0) continue;
      if (r.left < -0.5 || r.right > innerWidth + 0.5) {
        fora.push(`${M.label(el)} ocupa ${r.left.toFixed(1)}–${r.right.toFixed(1)}`);
      }
    }
    // Encolher o flex item de .menu-actions não pode virar corte de texto: a
    // caixa cabe, mas o rótulo em caixa alta some atrás de um ellipsis.
    const truncados = [];
    for (const el of tela.querySelectorAll('.menu-actions .btn')) {
      if (!M.visible(el)) continue;
      if (el.scrollWidth > el.clientWidth + 0.5) {
        truncados.push(`${M.label(el)} pede ${el.scrollWidth}px numa caixa de ${el.clientWidth}px`);
      }
      if (getComputedStyle(el).textOverflow === 'ellipsis') {
        truncados.push(`${M.label(el)} com text-overflow: ellipsis`);
      }
    }
    return {
      id: tela.id, innerWidth,
      scrollWidth: tela.scrollWidth, clientWidth: tela.clientWidth,
      fora, truncados,
      pequenos: M.targets('#menu')
        .filter((t) => t.w < alvoMin || t.h < alvoMin)
        .map((t) => `${t.alvo} ${t.w}x${t.h}`),
    };
  }, ALVO_MIN);
  if (m.erro) { errors.push(`MENU: ${ctx} ${m.erro}`); return; }
  if (m.scrollWidth !== m.clientWidth) {
    errors.push(`MENU: ${ctx} o #${m.id} rola na horizontal — scrollWidth ${m.scrollWidth}`
      + ` contra clientWidth ${m.clientWidth}`);
  }
  if (m.fora.length) {
    errors.push(`MENU: ${ctx} ${m.fora.length} descendente(s) do #${m.id} fora dos`
      + ` ${m.innerWidth}px da viewport — ${m.fora.join(' · ')}`);
  }
  if (m.truncados.length) {
    errors.push(`MENU: ${ctx} ${m.truncados.length} rótulo(s) truncado(s) em .menu-actions .btn`
      + ` — ${m.truncados.join(' · ')}`);
  }
  if (m.pequenos.length) {
    errors.push(`TOQUE: ${ctx} o #menu tem ${m.pequenos.length} alvo(s) abaixo de`
      + ` ${ALVO_MIN}x${ALVO_MIN} — ${m.pequenos.join(' · ')}`);
  }
}

// UI-01: nenhum alvo interativo abaixo de 44x44 na barra de ação. O #bag entra
// pela medirMochila, que só o abre depois de encher o inventário — varrer a
// mochila vazia deixaria de fora as .inv-slot e as .equip-slot, que só viram
// alvo de toque quando têm item.
async function medirToque(page, ctx) {
  const m = await page.evaluate((alvoMin) => {
    const M = window.__M;
    return {
      pequenos: M.targets('#actionBar')
        .filter((t) => t.w < alvoMin || t.h < alvoMin)
        .map((t) => `${t.alvo} ${t.w}x${t.h}`),
    };
  }, ALVO_MIN);
  if (m.pequenos.length) {
    errors.push(`TOQUE: ${ctx} o #actionBar tem ${m.pequenos.length} alvo(s) abaixo de`
      + ` ${ALVO_MIN}x${ALVO_MIN} — ${m.pequenos.join(' · ')}`);
  }
}

// A mochila cheia é o pior caso de altura de UI-04, e os 20 itens saem do
// caminho real do jogo: rollItem() (js/sim.js:1241) larga o item no pé do
// jogador e o próprio updatePickup() (js/sim.js:483) recolhe. Fabricar objeto
// solto faria renderBag() (js/ui.js:245) receber um item que a partida nunca
// produziria, e o console pararia de ficar limpo (RNF-04).
async function encherMochila(page, ctx) {
  const m = await page.evaluate(async (invSize) => {
    const sim = await import(new URL('js/sim.js', location.href).href);
    const G = window.__SF.G;
    const p = G.players.host;
    // grabItem equipa sozinho quando o espaço está vazio, devolvendo a vaga à
    // mochila; por isso o laço repõe só o que falta em vez de largar 20 de uma vez.
    let rodadas = 0;
    while (p.inv.some((vaga) => !vaga) && rodadas++ < 8) {
      const faltam = p.inv.filter((vaga) => !vaga).length;
      for (let i = 0; i < faltam; i++) {
        const it = sim.rollItem(G, G.floor + 2);
        it.x = p.x; it.y = p.y;
        G.items.push(it);
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    return { ocupados: p.inv.filter(Boolean).length, esperado: invSize, rodadas, morto: !!p.dead };
  }, INV_SIZE);
  if (m.ocupados !== m.esperado) {
    errors.push(`MOCHILA: ${ctx} a mochila parou em ${m.ocupados} de ${m.esperado} itens`
      + ` depois de ${m.rodadas} rodada(s)${m.morto ? ' — o jogador morreu antes de recolher' : ''}`);
  }
  return m;
}

// UI-04 e UI-05: com a mochila cheia o painel cabe inteiro na viewport com o
// gutter de 12px, não corta conteúdo que caiba na altura útil e prende a
// rolagem em si mesmo. A varredura de UI-01 do #bag vem junto, agora que as
// .inv-slot e as .equip-slot têm item e portanto são alvo de toque.
async function medirMochila(page, ctx) {
  await page.evaluate(() => document.getElementById('btnBag').click());
  await new Promise((r) => setTimeout(r, 400));
  const m = await page.evaluate((gutter, alvoMin) => {
    const M = window.__M;
    const bag = document.getElementById('bag');
    const caixa = M.rect('#bag');
    if (!caixa) return { erro: 'o #bag não ficou visível' };
    const util = innerHeight - 2 * gutter;
    const cabe = bag.scrollHeight <= util;
    const transbordo = [];
    if (cabe) {
      for (const el of bag.querySelectorAll('*')) {
        if (!M.visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom > caixa.bottom + 0.5) {
          transbordo.push(`${M.label(el)} termina em ${r.bottom.toFixed(1)}`);
        }
      }
    }
    const pequenos = M.targets('#bag')
      .filter((t) => t.w < alvoMin || t.h < alvoMin)
      .map((t) => `${t.alvo} ${t.w}x${t.h}`);
    // A AC 1 de UI-01 nomeia estes dois: se sumirem do DOM a varredura acima
    // passaria vazia e o teste viraria enfeite.
    const nomeados = ['#btnCloseBag', '#btnSell'].map((sel) => ({ sel, r: M.rect(sel) }));
    // Rolar até o fim é a última medida: mexe no rect de todo descendente.
    bag.scrollTop = bag.scrollHeight;
    const doc = document.documentElement;
    const rolagem = {
      docTop: doc.scrollTop, bodyTop: document.body.scrollTop,
      docScroll: doc.scrollHeight, docClient: doc.clientHeight,
      overscroll: getComputedStyle(bag).overscrollBehaviorY,
    };
    bag.scrollTop = 0;
    return {
      innerWidth, innerHeight, util, cabe, caixa, transbordo, pequenos, nomeados, rolagem,
      scrollHeight: bag.scrollHeight, clientHeight: bag.clientHeight,
      itens: window.__SF.G.players.host.inv.filter(Boolean).length,
    };
  }, GUTTER, ALVO_MIN);
  if (m.erro) { errors.push(`MOCHILA: ${ctx} ${m.erro}`); return; }
  if (m.itens !== INV_SIZE) {
    errors.push(`MOCHILA: ${ctx} medida com ${m.itens} de ${INV_SIZE} itens — não é o pior caso`);
  }
  const c = m.caixa;
  if (c.top < GUTTER - TOL || c.bottom > m.innerHeight - GUTTER + TOL
    || c.left < -TOL || c.right > m.innerWidth + TOL) {
    errors.push(`MOCHILA: ${ctx} o #bag ocupa ${c.left.toFixed(1)},${c.top.toFixed(1)} até`
      + ` ${c.right.toFixed(1)},${c.bottom.toFixed(1)} e fura o gutter de ${GUTTER}px`
      + ` em ${m.innerWidth}x${m.innerHeight}`);
  }
  if (m.cabe && m.scrollHeight > m.clientHeight) {
    errors.push(`MOCHILA: ${ctx} o conteúdo cabe nos ${m.util}px úteis mas transborda —`
      + ` scrollHeight ${m.scrollHeight} contra clientHeight ${m.clientHeight}`);
  }
  if (m.transbordo.length) {
    errors.push(`MOCHILA: ${ctx} ${m.transbordo.length} descendente(s) abaixo da borda do`
      + ` painel (${c.bottom.toFixed(1)}) — ${m.transbordo.join(' · ')}`);
  }
  const rl = m.rolagem;
  if (rl.docTop !== 0 || rl.bodyTop !== 0 || rl.docScroll !== rl.docClient) {
    errors.push(`MOCHILA: ${ctx} a rolagem do painel escapou para a página — scrollTop`
      + ` ${rl.docTop}/${rl.bodyTop} e documento ${rl.docScroll} contra ${rl.docClient}`);
  }
  if (rl.overscroll === 'auto') {
    errors.push(`MOCHILA: ${ctx} o #bag está com overscroll-behavior-y: ${rl.overscroll} —`
      + ' o gesto no fim da lista encadeia na página');
  }
  if (m.pequenos.length) {
    errors.push(`TOQUE: ${ctx} o #bag tem ${m.pequenos.length} alvo(s) abaixo de`
      + ` ${ALVO_MIN}x${ALVO_MIN} — ${m.pequenos.join(' · ')}`);
  }
  for (const { sel, r } of m.nomeados) {
    if (!r) errors.push(`TOQUE: ${ctx} não encontrou ${sel} visível com o #bag aberto`);
    else if (r.width < ALVO_MIN || r.height < ALVO_MIN) {
      errors.push(`TOQUE: ${ctx} ${sel} mede ${r.width.toFixed(1)}x${r.height.toFixed(1)},`
        + ` abaixo de ${ALVO_MIN}x${ALVO_MIN}`);
    }
  }
  await page.screenshot({ path: `${OUT}/11-mobile-bag-${ctx}.png` });
  await page.evaluate(() => document.getElementById('btnCloseBag').click());
  await new Promise((r) => setTimeout(r, 300));
}

// UI-01 AC 2 e UI-02: o slot é 48x48 em qualquer largura de toque e a barra
// derivada tem 102px; nenhum par de slots se sobrepõe.
async function medirBarra(page, ctx) {
  const m = await page.evaluate(() => {
    const M = window.__M;
    return {
      barra: M.rect('#actionBar'),
      slots: [...document.querySelectorAll('#actionBar .slot')]
        .filter((el) => M.visible(el))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { alvo: M.label(el), left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
        }),
    };
  });
  if (!m.barra) { errors.push(`BARRA: ${ctx} não encontrou o #actionBar visível`); return; }
  if (Math.abs(m.barra.width - BARRA_LARGURA) > 0.5) {
    errors.push(`BARRA: ${ctx} o #actionBar mede ${m.barra.width.toFixed(1)}px de largura, esperado ${BARRA_LARGURA}px`);
  }
  if (!m.slots.length) { errors.push(`BARRA: ${ctx} nenhum .slot visível no #actionBar`); return; }
  const fora = m.slots.filter((s) => Math.abs(s.w - SLOT_LADO) > 0.5 || Math.abs(s.h - SLOT_LADO) > 0.5);
  if (fora.length) {
    errors.push(`BARRA: ${ctx} ${fora.length} de ${m.slots.length} slots fora de ${SLOT_LADO}x${SLOT_LADO}`
      + ` — ${fora.map((s) => `${s.alvo} ${s.w.toFixed(1)}x${s.h.toFixed(1)}`).join(' · ')}`);
  }
  for (let i = 0; i < m.slots.length; i++) {
    for (let j = i + 1; j < m.slots.length; j++) {
      const a = m.slots[i], b = m.slots[j];
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 0 && overlapY > 0) {
        errors.push(`BARRA: ${ctx} os slots ${a.alvo} e ${b.alvo} se sobrepõem em`
          + ` ${overlapX.toFixed(1)}x${overlapY.toFixed(1)}px`);
      }
    }
  }
}

// UI-03: em nenhuma altura o #actionBar pode cruzar o contador do portal, o
// #log ou a zona reservada do joystick, e todo slot fica na metade direita e
// dentro da viewport.
async function medirGeometria(page, ctx) {
  const m = await page.evaluate(() => {
    const M = window.__M;
    const ph = document.getElementById('portalHold');
    // O contador nasce com `hidden` e só aparece com o portal aberto. A AC é de
    // geometria, não de estado: medimos com ele visível e devolvemos a classe,
    // senão o retângulo viria vazio e a asserção passaria sem medir nada.
    const oculto = ph.classList.contains('hidden');
    if (oculto) ph.classList.remove('hidden');
    const barra = M.rect('#actionBar');
    const portal = M.rect('#portalHold');
    const log = M.rect('#log');
    const zona = M.joystickZone();
    const medida = {
      innerWidth, innerHeight, barra, portal, log, zona,
      cruzaPortal: M.intersects(barra, portal),
      cruzaLog: M.intersects(barra, log),
      cruzaZona: M.intersects(barra, zona),
      slots: [...document.querySelectorAll('#actionBar .slot')]
        .filter((el) => M.visible(el))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { alvo: M.label(el), left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }),
    };
    if (oculto) ph.classList.add('hidden');
    return medida;
  });
  // A zona sai da mesma constante que js/main.js usa no pointerdown; conferir a
  // borda aqui é o que amarra os 259px de 390 e os 244px de 360 da AC 3.
  const zonaEsperada = TOUCH_STICK_ZONE * m.innerWidth + TOUCH_STICK_RADIUS;
  zonas.set(m.innerWidth, Math.round(m.zona.right * 10) / 10);
  if (Math.abs(m.zona.right - zonaEsperada) > TOL) {
    errors.push(`BARRA: ${ctx} a zona do joystick termina em ${m.zona.right.toFixed(1)},`
      + ` esperado ${zonaEsperada.toFixed(1)} para ${m.innerWidth}px de largura`);
  }
  if (!m.barra) { errors.push(`BARRA: ${ctx} não encontrou o #actionBar visível`); return; }
  if (!m.portal) errors.push(`BARRA: ${ctx} não conseguiu medir o #portalHold`);
  if (m.cruzaPortal) {
    errors.push(`BARRA: ${ctx} o #actionBar (${m.barra.left.toFixed(1)}–${m.barra.right.toFixed(1)})`
      + ` cruza o #portalHold (${m.portal.left.toFixed(1)}–${m.portal.right.toFixed(1)})`);
  }
  if (m.cruzaLog) {
    errors.push(`BARRA: ${ctx} o #actionBar (${m.barra.left.toFixed(1)}–${m.barra.right.toFixed(1)})`
      + ` cruza o #log (${m.log.left.toFixed(1)}–${m.log.right.toFixed(1)})`);
  }
  if (m.cruzaZona) {
    errors.push(`BARRA: ${ctx} o #actionBar começa em ${m.barra.left.toFixed(1)}, dentro da zona`
      + ` do joystick que vai até ${m.zona.right.toFixed(1)}`);
  }
  for (const s of m.slots) {
    if (s.left < m.innerWidth / 2 || s.right > m.innerWidth || s.top < 0 || s.bottom > m.innerHeight) {
      errors.push(`BARRA: ${ctx} o slot ${s.alvo} sai da metade direita ou da viewport —`
        + ` ${s.left.toFixed(1)},${s.top.toFixed(1)} até ${s.right.toFixed(1)},${s.bottom.toFixed(1)}`);
    }
  }
}

for (const viewport of [VIEWPORT_MOBILE, VIEWPORT_SMALL]) {
  const ctx = `${viewport.width}x${viewport.height}`;
  const mob = await abrirToque(viewport);
  await medirToque(mob, ctx);
  // Cedo na partida de propósito: o paladino solo sobrevive tranquilo aos
  // primeiros segundos, e updatePickup() ignora jogador morto.
  await encherMochila(mob, ctx);
  await medirMochila(mob, ctx);
  await medirBarra(mob, ctx);
  await medirGeometria(mob, ctx);
  // As sete alturas da AC 1 de UI-03 são medidas na largura 390. Trocar só a
  // altura não mexe em isMobile/hasTouch, então o Puppeteer não recarrega a aba
  // e a partida em curso continua de pé.
  if (viewport === VIEWPORT_MOBILE) {
    for (const height of ALTURAS_UI03) {
      await mob.setViewport(alturaMobile(height));
      await new Promise((r) => setTimeout(r, 300));
      await medirGeometria(mob, `390x${height}`);
    }
    await mob.setViewport(VIEWPORT_MOBILE);
  }
  await mob.close();
}

console.log('\n--- resultado ---');
console.log('combate:', JSON.stringify(combat));
console.log('andar:  ', JSON.stringify(floorTest));
console.log('chefe HC:', JSON.stringify(hardcore));
console.log('fps:    ', fps);
console.log('zona joystick:', JSON.stringify(Object.fromEntries(zonas)));
console.log('erros:  ', errors.length ? errors : 'nenhum');
const warn = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[warning]'));
console.log('console:', warn.length ? warn.slice(0, 10) : 'limpo');

await browser.close();
process.exit(errors.length ? 1 : 0);
