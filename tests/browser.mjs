import puppeteer from 'puppeteer';

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

// visão mobile
const mob = await browser.newPage();
await mob.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await mob.goto(URL, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 600));
await mob.screenshot({ path: `${OUT}/08-mobile-menu.png` });
await mob.click('.voc-card[data-voc="paladin"]');
await mob.click('#btnSolo');
await new Promise((r) => setTimeout(r, 1800));
await mob.screenshot({ path: `${OUT}/09-mobile-game.png` });

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
