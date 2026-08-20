import { createGame, addPlayer, setInput, step, stats, nextFloor, hitMonster, rollItem, TICK } from '../js/sim.js';
import { generateMap, findPath } from '../js/world.js';
import { VOC_LIST } from '../js/data.js';
import { isCriticalEvent, drainEvents } from '../js/net.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { console.log(`  FAIL ${label} ${extra}`); failures++; }
}

console.log('\n== mapa determinístico ==');
const a = generateMap(12345, 1);
const b = generateMap(12345, 1);
check('mesma seed gera mapa idêntico', a.tiles.every((v, i) => v === b.tiles[i]));
const c = generateMap(12345, 2);
check('andar diferente gera mapa diferente', !c.tiles.every((v, i) => v === a.tiles[i]));
check('spawn é caminhável', a.tiles[Math.floor(a.spawn.y) * a.w + Math.floor(a.spawn.x)] === 1);
check('gerou salas suficientes', a.rooms.length >= 8, `(${a.rooms.length})`);

console.log('\n== simulação 4 vocações, 90s de jogo ==');
for (const voc of VOC_LIST) {
  const G = createGame(999, 1);
  const p1 = addPlayer(G, { id: 'p1', name: 'Filipe', voc });
  const p2 = addPlayer(G, { id: 'p2', name: 'Namorada', voc: 'paladin' });
  const startMonsters = G.monsters.length;
  let events = 0;
  let dmgEvents = 0;

  // Bot caça-monstro: usa o mesmo A* do clique-para-andar e martela as magias.
  const botState = new Map();
  const botStep = (p, t) => {
    if (!botState.has(p.id)) botState.set(p.id, { path: [], repath: 0 });
    const bs = botState.get(p.id);
    let best = null, bestD = 1e9;
    for (const m of G.monsters) {
      if (m.hp <= 0) continue;
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d < bestD) { bestD = d; best = m; }
    }
    bs.repath -= TICK;
    if (best && bs.repath <= 0) {
      bs.repath = 0.5;
      bs.path = findPath(G.map, p.x, p.y, best.x, best.y) || [];
    }
    while (bs.path.length && Math.hypot(bs.path[0].x - p.x, bs.path[0].y - p.y) < 0.35) bs.path.shift();
    let mx = 0, my = 0;
    if (bs.path.length && bestD > 1.1) {
      const a = Math.atan2(bs.path[0].y - p.y, bs.path[0].x - p.x);
      mx = Math.cos(a); my = Math.sin(a);
    }
    const acts = [];
    if (best && bestD < 7 && t % 12 === 0) {
      const key = ['Q', 'W', 'E', 'R'][Math.floor(Math.random() * 4)];
      acts.push({ id: t * 4 + 1, k: 'cast', slot: key, ax: best.x, ay: best.y });
    }
    if (t % 120 === 0) acts.push({ id: t * 4 + 2, k: 'pot', slot: 'hp' });
    if (p.dead && p.deathTimer > 5.2) acts.push({ id: t * 4 + 3, k: 'respawn' });
    setInput(G, p.id, { mx, my, target: best ? best.id : 0, acts });
  };

  for (let t = 0; t < 90 / TICK; t++) {
    botStep(p1, t);
    botStep(p2, t);
    const evs = step(G, TICK);
    events += evs.length;
    dmgEvents += evs.filter((e) => e.t === 'd').length;
  }

  const st = stats(p1);
  check(`${voc}: sem NaN na posição`, Number.isFinite(p1.x) && Number.isFinite(p1.y));
  check(`${voc}: sem NaN em hp/mp`, Number.isFinite(p1.hp) && Number.isFinite(p1.mp));
  check(`${voc}: hp dentro do máximo`, p1.hp <= st.maxHp + 0.01, `${p1.hp}/${st.maxHp}`);
  check(`${voc}: gerou eventos de dano`, dmgEvents > 0, `(${dmgEvents})`);
  check(`${voc}: monstros morreram`, G.monsters.filter((m) => m.hp > 0).length < startMonsters);
  check(`${voc}: jogador subiu de nível`, p1.level > 1, `(nv ${p1.level}, xp ${p1.xp})`);
  check(`${voc}: nenhum monstro dentro de parede`, G.monsters.filter((m) => m.hp > 0).every((m) => {
    const tt = G.map.tiles[Math.floor(m.y) * G.map.w + Math.floor(m.x)];
    return tt !== 0 && tt !== 2 && tt !== 8;
  }));
  check(`${voc}: jogador não atravessou parede`, (() => {
    const tt = G.map.tiles[Math.floor(p1.y) * G.map.w + Math.floor(p1.x)];
    return tt !== 0 && tt !== 2 && tt !== 8;
  })());
  console.log(`      nv ${p1.level} · ouro ${p1.gold} · kills ${p1.kills} · mortes ${p1.deaths} · dano ${Math.floor(p1.dmgDone)} · eventos ${events}`);
}

console.log('\n== progressão de andar ==');
const G2 = createGame(4242, 1);
const hero = addPlayer(G2, { id: 'h', name: 'Test', voc: 'knight' });
const boss = G2.monsters.find((m) => m.isBoss);
check('chefe existe', !!boss);
boss.hp = 0;
step(G2, TICK);
check('portal abre quando o chefe morre', G2.portalOpen);
const f1 = G2.floor;
nextFloor(G2);
check('avançou de andar', G2.floor === f1 + 1);
check('jogador reposicionado no spawn novo', Math.abs(hero.x - G2.map.spawn.x) < 2);
check('monstros repovoados', G2.monsters.length > 10);
check('novo chefe', G2.monsters.some((m) => m.isBoss && m.hp > 0));

console.log('\n== loot ==');
const G3 = createGame(777, 6);
const looter = addPlayer(G3, { id: 'l', name: 'L', voc: 'sorcerer' });
let equipDrops = 0;
for (let i = 0; i < 80; i++) {
  const m = G3.monsters.find((mm) => mm.hp > 0 && !mm.isBoss);
  if (!m) break;
  const before = G3.items.filter((it) => it.kind === 'equip').length;
  hitMonster(G3, m, 99999, 0, looter, {});
  if (G3.items.filter((it) => it.kind === 'equip').length > before) equipDrops++;
  step(G3, TICK);
}
check('monstros dropam ouro', G3.items.some((it) => it.kind === 'gold'));
check('monstros dropam equipamento às vezes', equipDrops > 0, `(${equipDrops}/80)`);
check('itens têm raridade válida', G3.items.every((it) => ['common', 'rare', 'epic', 'legendary'].includes(it.rarity)));
const legend = rollItem(G3, 30, true);
check('rollItem gera stats coerentes', legend.atk >= 0 && legend.def >= 0 && Number.isFinite(legend.ilvl));

const G4 = createGame(31337, 3);
const p4 = addPlayer(G4, { id: 'x', name: 'X', voc: 'druid' });
let path = [], repath = 0, pathsFound = 0, pathsFailed = 0;
for (let t = 0; t < 90 / TICK; t++) {
  let best = null, bestD = 1e9;
  for (const m of G4.monsters) {
    if (m.hp <= 0) continue;
    const d = Math.hypot(m.x - p4.x, m.y - p4.y);
    if (d < bestD) { bestD = d; best = m; }
  }
  repath -= TICK;
  if (best && repath <= 0) {
    repath = 0.5;
    const found = findPath(G4.map, p4.x, p4.y, best.x, best.y);
    if (found) { path = found; pathsFound++; } else { path = []; pathsFailed++; }
  }
  let mx = 0, my = 0;
  while (path.length && Math.hypot(path[0].x - p4.x, path[0].y - p4.y) < 0.35) path.shift();
  if (path.length && bestD > 1.1) {
    const a = Math.atan2(path[0].y - p4.y, path[0].x - p4.x);
    mx = Math.cos(a); my = Math.sin(a);
  }
  setInput(G4, 'x', {
    mx, my, target: best ? best.id : 0,
    acts: [
      ...(t % 15 === 0 && best && bestD < 6 ? [{ id: t * 3, k: 'cast', slot: 'Q', ax: best.x, ay: best.y }] : []),
      ...(p4.dead && p4.deathTimer > 5.2 ? [{ id: t * 3 + 1, k: 'respawn' }] : []),
    ],
  });
  step(G4, TICK);
}
check('A* encontra caminho na maioria das vezes', pathsFound > pathsFailed * 3, `(ok ${pathsFound} / falha ${pathsFailed})`);
check('jogador matou e acumulou ouro', p4.gold > 0, `(ouro ${p4.gold}, kills ${p4.kills}, mortes ${p4.deaths})`);
check('equipou ou guardou algum item', Object.values(p4.equip).some(Boolean) || p4.inv.some(Boolean));

console.log('\n== variante HARDCORE do chefe ==');
{
  // Chefes giram em ciclo de 4 e o HARDCORE cai em ciclo de 3: o par só se
  // repete a cada 12 andares, um HARDCORE por chefe em cada bloco.
  const esperado = { 3: 'glacier', 6: 'morgaroth', 9: 'ferumbras', 12: 'bonelord' };
  let flagOk = true, idOk = true, detalhe = '';
  for (const [f, typeId] of Object.entries(esperado)) {
    const G = createGame(7777, Number(f));
    const b = G.monsters.find((m) => m.isBoss);
    if (b.hardcore !== true) { flagOk = false; detalhe = `andar ${f} sem flag`; }
    if (b.typeId !== typeId) { idOk = false; detalhe = `andar ${f} é ${b.typeId}`; }
  }
  check('HARDCORE: flag verdadeira nos andares 3, 6, 9 e 12', flagOk, detalhe);
  check('HARDCORE: a identidade do chefe do andar não muda', idOk, detalhe);

  let comumOk = true, comumDet = '';
  for (const f of [1, 2, 4, 5, 7, 8, 10, 11]) {
    const G = createGame(7777, f);
    const b = G.monsters.find((m) => m.isBoss);
    if (b.hardcore !== false) { comumOk = false; comumDet = `andar ${f}`; }
  }
  check('HARDCORE: flag falsa fora do ciclo de 3', comumOk, comumDet);

  // A marcação precisa existir antes do primeiro step(): quem lê o snapshot
  // do nascimento já tem de saber que o andar é HARDCORE.
  const G = createGame(7777, 3);
  check('HARDCORE: a marcação existe antes do primeiro step()',
    G.monsters.find((m) => m.isBoss).hardcore === true);
}

console.log('\n== eventos empilhados fora do tique ==');
{
  // step() zera G.events no primeiro comando: sem o buffer, o anúncio da
  // virada de andar era apagado antes de qualquer consumidor ler.
  const G = createGame(4242, 1);
  addPlayer(G, { id: 'p1', name: 'Filipe', voc: 'knight' });
  step(G, TICK);
  nextFloor(G);
  const lote = step(G, TICK).slice();
  const floorEv = lote.filter((e) => e.t === 'floor');
  const floorLog = lote.filter((e) => e.t === 'log' && /^Andar \d+ —/.test(e.m || ''));
  check('buffer: virada de andar entrega exatamente um evento floor',
    floorEv.length === 1 && floorEv[0].floor === G.floor, `(${floorEv.length})`);
  check('buffer: virada de andar entrega exatamente uma linha de log do andar',
    floorLog.length === 1, `(${floorLog.length})`);
  const seguinte = step(G, TICK).slice();
  check('buffer: o tique seguinte não repete a virada de andar',
    !seguinte.some((e) => e.t === 'floor')
    && !seguinte.some((e) => e.t === 'log' && /^Andar \d+ —/.test(e.m || '')),
    `(${seguinte.filter((e) => e.t === 'floor').length} floor)`);
  check('buffer: esvaziado depois da drenagem', G.pendingEvents.length === 0);
}

console.log('\n== nascimento do chefe HARDCORE ==');
{
  // Um evento por andar múltiplo de 3, zero nos demais.
  let hcOk = true, hcDet = '';
  for (let f = 1; f <= 12; f++) {
    const G = createGame(8181, f);
    const lote = step(G, TICK).slice();
    const spawns = lote.filter((e) => e.t === 'bossSpawn');
    const esperado = f % 3 === 0 ? 1 : 0;
    if (spawns.length !== esperado) { hcOk = false; hcDet = `andar ${f}: ${spawns.length} != ${esperado}`; }
  }
  check('bossSpawn: exatamente 1 por andar HARDCORE e 0 nos demais', hcOk, hcDet);

  const G = createGame(8181, 3);
  const lote = step(G, TICK).slice();
  const spawn = lote.find((e) => e.t === 'bossSpawn');
  const b = G.monsters.find((m) => m.isBoss);
  check('bossSpawn: o evento carrega id, typeId, andar e as marcas hardcore/boss',
    !!spawn && spawn.id === b.id && spawn.typeId === 'glacier'
    && spawn.floor === 3 && spawn.hardcore === 1 && spawn.boss === 1,
    JSON.stringify(spawn));
  check('bossSpawn: boss: 1 torna o evento crítico', isCriticalEvent(spawn));

  // Eventos de nascimento são entregues uma vez só.
  const seguinte = step(G, TICK).slice();
  check('bossSpawn: o tique seguinte não repete o nascimento',
    !seguinte.some((e) => e.t === 'bossSpawn')
    && !seguinte.some((e) => e.t === 'log' && /HARDCORE/.test(e.m || '')));

  // Fila saturada: o teto de 120 de drainEvents não pode comer o aviso.
  const fila = lote.slice();
  for (let i = 0; i < 400; i++) fila.push({ t: 'd', x: 0, y: 0, v: String(i), c: '#fff' });
  const drenado = drainEvents(fila);
  check('bossSpawn: sobrevive a drainEvents com a fila saturada',
    drenado.some((e) => e.t === 'bossSpawn' && e.id === b.id), `(${drenado.length} eventos)`);

  // O andar comum não recebe nem o evento nem a linha de aviso.
  const comum = createGame(8181, 4);
  const loteComum = step(comum, TICK).slice();
  check('bossSpawn: em andar comum não há evento nem linha HARDCORE',
    !loteComum.some((e) => e.t === 'bossSpawn')
    && !loteComum.some((e) => e.t === 'log' && /HARDCORE/.test(e.m || '')));
}

console.log('\n== ordem do lote de virada para andar HARDCORE ==');
{
  const G = createGame(8282, 2);
  step(G, TICK);
  nextFloor(G);
  const lote = step(G, TICK).slice();
  const iFloor = lote.findIndex((e) => e.t === 'floor');
  const iAndar = lote.findIndex((e) => e.t === 'log' && /^Andar \d+ —/.test(e.m || ''));
  const iHc = lote.findIndex((e) => e.t === 'log' && /HARDCORE/.test(e.m || ''));
  const iSpawn = lote.findIndex((e) => e.t === 'bossSpawn');
  check('UI: o mesmo lote traz virada de andar e nascimento HARDCORE',
    iFloor >= 0 && iAndar >= 0 && iHc >= 0 && iSpawn >= 0,
    `floor ${iFloor} andar ${iAndar} hc ${iHc} spawn ${iSpawn}`);
  check('UI: a linha do andar sai antes da linha HARDCORE',
    iAndar < iHc, `${iAndar} vs ${iHc}`);
  // O aviso precede qualquer dano do chefe: no lote de nascimento não há
  // evento de dano nenhum.
  check('UI: o aviso HARDCORE sai antes de qualquer evento de dano',
    !lote.some((e) => e.t === 'd' || e.t === 'hurt'));
}

console.log('\n== desempenho ==');
const G5 = createGame(5150, 8);
addPlayer(G5, { id: 'a', name: 'A', voc: 'knight' });
addPlayer(G5, { id: 'b', name: 'B', voc: 'paladin' });
const t0 = performance.now();
for (let t = 0; t < 1800; t++) {
  setInput(G5, 'a', { mx: 1, my: 0.4, acts: [] });
  setInput(G5, 'b', { mx: -0.6, my: 1, acts: [] });
  step(G5, TICK);
}
const ms = performance.now() - t0;
console.log(`      1800 ticks (60s) com ${G5.monsters.length} monstros em ${ms.toFixed(0)}ms → ${(ms / 1800).toFixed(3)}ms/tick`);
check('tick abaixo de 4ms (folga enorme p/ 30Hz)', ms / 1800 < 4);

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
