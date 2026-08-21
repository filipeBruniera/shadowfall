import puppeteer from 'puppeteer';
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
// Aqui só entra o que a partida solo alcança: #actionBar, seus slots e o #bag.
// O que exige sala de verdade (#roster, #crewChip, #lobby) é medido por
// tests/multipeer.mjs.
// ============================================================
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
  await p.click('.voc-card[data-voc="paladin"]');
  await p.click('#btnSolo');
  await new Promise((r) => setTimeout(r, 1800));
  await p.screenshot({ path: `${OUT}/09-mobile-game-${ctx}.png` });
  return p;
}

// UI-01: nenhum alvo interativo abaixo de 44x44 nas telas alcançáveis em solo.
async function medirToque(page, ctx) {
  await page.evaluate(() => document.getElementById('btnBag').click());
  await new Promise((r) => setTimeout(r, 400));
  const m = await page.evaluate(() => {
    const M = window.__M;
    const pequenos = [];
    for (const raiz of ['#actionBar', '#bag']) {
      for (const t of M.targets(raiz)) {
        if (t.w < 44 || t.h < 44) pequenos.push(`${raiz} ${t.alvo} ${t.w}x${t.h}`);
      }
    }
    // A AC 1 de UI-01 nomeia estes dois: se sumirem do DOM a varredura acima
    // passaria vazia e o teste viraria enfeite.
    const nomeados = ['#btnCloseBag', '#btnSell'].map((sel) => ({ sel, r: M.rect(sel) }));
    return { pequenos, nomeados };
  });
  if (m.pequenos.length) {
    errors.push(`TOQUE: ${ctx} tem ${m.pequenos.length} alvo(s) abaixo de 44x44 — ${m.pequenos.join(' · ')}`);
  }
  for (const { sel, r } of m.nomeados) {
    if (!r) errors.push(`TOQUE: ${ctx} não encontrou ${sel} visível com o #bag aberto`);
    else if (r.width < ALVO_MIN || r.height < ALVO_MIN) {
      errors.push(`TOQUE: ${ctx} ${sel} mede ${r.width.toFixed(1)}x${r.height.toFixed(1)}, abaixo de 44x44`);
    }
  }
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
console.log('erros:  ', errors.length ? errors : 'nenhum');
const warn = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[warning]'));
console.log('console:', warn.length ? warn.slice(0, 10) : 'limpo');

await browser.close();
process.exit(errors.length ? 1 : 0);
