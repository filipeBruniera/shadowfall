import { createGame, addPlayer, setInput, step, stats, nextFloor, hitMonster, rollItem, healPlayer, TICK } from '../js/sim.js';
import { readFile } from 'node:fs/promises';
import { generateMap, findPath } from '../js/world.js';
import { VOC_LIST, VOCATIONS, CONSUMABLES, ELEM_STATUS, BOSSES, bossSpecials, E } from '../js/data.js';
import { isCriticalEvent, drainEvents } from '../js/net.js';
import {
  WITHER_TIME, WITHER_DPS, WITHER_HEAL_MULT,
  BOSS_TELEGRAPH_TIME, BOSS_WINDUP, MONSTER_WINDUP, BOSS_SPECIAL_CD,
  bossCurve, groupScale, HARDCORE_HP_MULT, HARDCORE_ATK_MULT,
} from '../js/balance.js';
// Puras e sem DOM: bossBarLabel só monta string e telegraphProgress só divide.
// Importá-las aqui mantém a asserção de UI no mesmo lugar que a de simulação.
import { bossBarLabel } from '../js/ui.js';
import { telegraphProgress } from '../js/render.js';

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

console.log('\n== status wither ==');
{
  // Andar sem monstro: assim o único capaz de mexer no HP do jogador é o
  // próprio status, e o teste não depende de quem estava perto do spawn.
  function soloWither(seed, voc = 'druid') {
    const G = createGame(seed, 1);
    addPlayer(G, { id: 'p1', name: 'Filipe', voc });
    G.monsters.length = 0;
    return G;
  }

  const G = soloWither(3131);
  const p = G.players.p1;
  const st = stats(p);
  p.hp = st.maxHp * 0.6;
  p.status.wither = WITHER_TIME;
  const antes = p.hp;
  for (let i = 0; i < 10; i++) step(G, TICK);
  check('wither: HP decresce a cada tique sem outra fonte de dano',
    p.hp < antes, `(${antes.toFixed(1)} -> ${p.hp.toFixed(1)})`);
  check('wither: o dano por tique sai de WITHER_DPS',
    Math.abs((antes - p.hp) - WITHER_DPS * TICK * 10) < st.maxHp * 0.012 * TICK * 10 + 0.01,
    `(perdeu ${(antes - p.hp).toFixed(2)})`);
  check('wither: o status não escreve em poison', p.status.poison === 0);

  // Comparação direta: a mesma cura H nos dois estados, mesmo jogador.
  const H = 40;
  const base = st.maxHp * 0.2;
  const G2 = soloWither(3232);
  const p2 = G2.players.p1;
  p2.status.wither = 0;
  p2.hp = base;
  const semStatus = healPlayer(G2, p2, H);
  p2.status.wither = WITHER_TIME;
  p2.hp = base;
  const comStatus = healPlayer(G2, p2, H);
  check('wither: a mesma cura restaura estritamente menos com o status ativo',
    comStatus < semStatus, `(${comStatus.toFixed(2)} vs ${semStatus.toFixed(2)})`);
  check('wither: sem o status a cura restaura exatamente o valor pedido',
    Math.abs(semStatus - H) < 1e-9, `(${semStatus})`);
  check('wither: a cura reduzida é o valor pedido vezes WITHER_HEAL_MULT',
    Math.abs(comStatus - H * WITHER_HEAL_MULT) < 1e-9, `(${comStatus})`);

  // Ao expirar o campo zera e a cura volta cheia.
  p2.status.wither = TICK;
  step(G2, TICK);
  check('wither: zera ao expirar', p2.status.wither === 0, `(${p2.status.wither})`);
  p2.hp = base;
  const depois = healPlayer(G2, p2, H);
  check('wither: expirado, a cura volta ao valor cheio',
    Math.abs(depois - H) < 1e-9, `(${depois})`);

  // Poção de vida: os dois casos passam pelo mesmo funil.
  function bebePocao(comWither) {
    const g = soloWither(3333, 'knight');
    const jog = g.players.p1;
    const sj = stats(jog);
    jog.hp = sj.maxHp * 0.2;
    jog.status.wither = comWither ? WITHER_TIME : 0;
    const hpAntes = jog.hp;
    setInput(g, 'p1', { mx: 0, my: 0, acts: [{ id: 1, k: 'pot', slot: 'hp' }] });
    step(g, TICK);
    return { ganho: jog.hp - hpAntes, esperado: CONSUMABLES.hpPot.heal + sj.maxHp * 0.12 };
  }
  const potSem = bebePocao(false);
  const potCom = bebePocao(true);
  check('wither: sem o status a poção restaura o mesmo valor de antes da mudança',
    Math.abs(potSem.ganho - potSem.esperado) < 0.5,
    `(${potSem.ganho.toFixed(2)} vs ${potSem.esperado.toFixed(2)})`);
  check('wither: a poção de vida passa pelo funil e restaura menos',
    potCom.ganho < potSem.ganho, `(${potCom.ganho.toFixed(2)} vs ${potSem.ganho.toFixed(2)})`);

  // Magia de cura: mesmo funil, mesma comparação.
  function lancaCura(comWither, casta = true) {
    const g = soloWither(3434, 'druid');
    const jog = g.players.p1;
    const sj = stats(jog);
    jog.mp = sj.maxMp;
    jog.hp = sj.maxHp * 0.2;
    jog.status.wither = comWither ? WITHER_TIME : 0;
    const hpAntes = jog.hp;
    const acts = casta ? [{ id: 1, k: 'cast', slot: 'E', ax: jog.x, ay: jog.y }] : [];
    setInput(g, 'p1', { mx: 0, my: 0, acts });
    step(g, TICK);
    // Valor de antes da mudança, recalculado pela fórmula de castSkill: sem
    // ele o teste só saberia dizer "curou menos", nunca "curou o de sempre".
    const skill = VOCATIONS.druid.skills.find((s) => s.key === 'E');
    const power = sj.atk * 0.8 + sj.ml * 2.0 + jog.level * 2;
    return { ganho: jog.hp - hpAntes, esperado: skill.flat + power * skill.power * 0.5 };
  }
  // O tique também regenera HP por conta própria; sem descontar essa deriva a
  // comparação exata mediria o regen junto com a cura.
  const derivaTique = lancaCura(false, false).ganho;
  const curaSem = lancaCura(false);
  const curaCom = lancaCura(true);
  check('wither: sem o status a magia de cura restaura exatamente o valor de antes da mudança',
    Math.abs((curaSem.ganho - derivaTique) - curaSem.esperado) < 1e-9,
    `(${(curaSem.ganho - derivaTique).toFixed(4)} vs ${curaSem.esperado.toFixed(4)})`);
  check('wither: a magia de cura passa pelo funil e restaura menos',
    curaCom.ganho < curaSem.ganho, `(${curaCom.ganho.toFixed(2)} vs ${curaSem.ganho.toFixed(2)})`);
}

console.log('\n== status do elemento no acerto do chefe ==');
{
  // Um caso por chefe. O andar define quem nasce: BOSSES gira em ciclo de 4,
  // então os andares 1 a 4 cobrem os quatro chefes.
  const CHAVES = ['burn', 'freeze', 'wither', 'poison'];
  function statusDoAcerto(floor, comum = false) {
    const G = createGame(6161, floor);
    const chefe = G.monsters.find((m) => m.isBoss);
    // Só o chefe no andar: o status precisa vir dele, não de quem passava perto.
    G.monsters = [chefe];
    if (comum) chefe.isBoss = false;
    addPlayer(G, { id: 'p1', name: 'Alvo', voc: 'knight' });
    const p = G.players.p1;
    p.x = chefe.x + 1.0; p.y = chefe.y + 0.2;
    chefe.aggro = p.id;
    const esperado = ELEM_STATUS[chefe.elem];
    for (let t = 0; t < 900; t++) {
      setInput(G, 'p1', { mx: 0, my: 0, acts: [] });
      step(G, TICK);
      if (!comum && p.status[esperado] > 0) {
        return { typeId: chefe.typeId, esperado, achou: true, ticks: t,
          outros: CHAVES.filter((k) => k !== esperado && p.status[k] > 0) };
      }
      // O teste é sobre o status aplicado, não sobre sobreviver ao chefe.
      p.hp = stats(p).maxHp;
    }
    return { typeId: chefe.typeId, esperado, achou: false, ticks: 900,
      outros: CHAVES.filter((k) => k !== esperado && G.players.p1.status[k] > 0) };
  }

  const esperados = { ferumbras: 'burn', morgaroth: 'wither', glacier: 'freeze', bonelord: 'wither' };
  for (const floor of [1, 2, 3, 4]) {
    const r = statusDoAcerto(floor);
    check(`RF-02: ${r.typeId} aplica ${esperados[r.typeId]} no acerto`,
      r.achou && r.esperado === esperados[r.typeId], `(${r.esperado}, ${r.ticks} tiques)`);
    check(`RF-02: ${r.typeId} não aplica status de outro elemento`,
      r.outros.length === 0, `(${r.outros.join(',')})`);
  }

  // Nenhum chefe de Morte encosta em poison: é o que separa Morte de Terra.
  for (const floor of [2, 4]) {
    const r = statusDoAcerto(floor);
    check(`RF-02: chefe de Morte do andar ${floor} não aplica poison`,
      r.esperado === 'wither' && !r.outros.includes('poison'), `(${r.outros.join(',')})`);
  }

  // O mapa só vale para isBoss: monstro comum segue no caminho de sempre.
  const semChefe = statusDoAcerto(2, true);
  check('RF-02: monstro comum não passa a aplicar o status do elemento',
    semChefe.outros.length === 0, `(${semChefe.outros.join(',')})`);

  // A fonte do mapeamento é única — nada de elemento decidido dentro de sim.js.
  check('RF-02: ELEM_STATUS cobre os elementos dos 4 chefes',
    BOSSES.every((b) => !!ELEM_STATUS[b.elem]));
  check('RF-02: poison continua reservado ao elemento Terra',
    ELEM_STATUS[E.EARTH] === 'poison' && ELEM_STATUS[E.DEATH] === 'wither');
}

console.log('\n== telegrafia do ataque perigoso ==');
{
  // Arena controlada: só o chefe no andar, golpe básico desligado por um cd
  // alto e o especial pronto para sair no primeiro tique. Sem isolar assim, o
  // dano do golpe básico entraria na conta e o teste mediria a coisa errada.
  function arenaChefe(floor) {
    const G = createGame(7171, floor);
    const chefe = G.monsters.find((m) => m.isBoss);
    G.monsters = [chefe];
    addPlayer(G, { id: 'p1', name: 'Alvo', voc: 'knight' });
    const p = G.players.p1;
    p.x = chefe.x + 1.0; p.y = chefe.y + 0.2;
    chefe.aggro = p.id;
    chefe.cd = 999;
    chefe.special = 0;
    return { G, chefe, p };
  }
  const tique = (G) => { setInput(G, 'p1', { mx: 0, my: 0, acts: [] }); step(G, TICK); };
  // HP cheio antes da janela: o regen do tique é limitado por maxHp, então
  // qualquer HP abaixo do teto só pode ter vindo de dano.
  const encheHp = (p) => { p.hp = stats(p).maxHp; return p.hp; };

  check('RF-07: a janela de telegrafia é maior que o windup genérico',
    BOSS_TELEGRAPH_TIME > BOSS_WINDUP && BOSS_TELEGRAPH_TIME > 0.5,
    `(${BOSS_TELEGRAPH_TIME} vs ${BOSS_WINDUP})`);

  const a = arenaChefe(1);
  tique(a.G);
  const abertura = a.G.events.filter((e) => e.t === 'fx' && e.k === 'telegraph');
  check('RF-07: a telegrafia abre com exatamente 1 evento no primeiro tique',
    abertura.length === 1, `(${abertura.length})`);
  const ev = abertura[0] || {};
  check('CT-02: o evento de telegrafia carrega id, posição, raio, duração, cor e marca de chefe',
    ev.id === a.chefe.id && Number.isFinite(ev.x) && Number.isFinite(ev.y) &&
    ev.r > 0 && ev.d === BOSS_TELEGRAPH_TIME && !!ev.c && ev.boss === 1,
    JSON.stringify(ev));
  check('CT-02: o evento de telegrafia é crítico e escapa do teto da fila',
    isCriticalEvent(ev));
  check('RF-07: a fase começa marcada com o especial escolhido',
    a.chefe.windupKind !== null && a.chefe.windup === BOSS_TELEGRAPH_TIME &&
    a.chefe.windupTotal === BOSS_TELEGRAPH_TIME,
    `(${a.chefe.windupKind}, ${a.chefe.windup})`);

  // Percorre a janela inteira medindo o que o mundo viu enquanto ela durava.
  const cheioA = encheHp(a.p);
  let perdeuNaJanela = false, projNaJanela = false, zonaNaJanela = false;
  let lacaiosNaJanela = false, telegrafiasExtras = 0, tiques = 0;
  const monstrosAntes = a.G.monsters.length;
  while (a.chefe.windup > 0 && tiques < 200) {
    tiques++;
    tique(a.G);
    if (a.chefe.windup <= 0) break;
    telegrafiasExtras += a.G.events.filter((e) => e.t === 'fx' && e.k === 'telegraph').length;
    if (a.p.hp < cheioA) perdeuNaJanela = true;
    if (a.G.projectiles.length > 0) projNaJanela = true;
    if (a.G.zones.length > 0) zonaNaJanela = true;
    if (a.G.monsters.length > monstrosAntes) lacaiosNaJanela = true;
  }
  check('RF-07: nenhum jogador perde HP durante a janela', !perdeuNaJanela);
  check('RF-07: nenhum projétil do ataque existe durante a janela', !projNaJanela);
  check('RF-07: nenhuma zona e nenhum lacaio aparecem durante a janela',
    !zonaNaJanela && !lacaiosNaJanela);
  check('RF-07: o evento de telegrafia não se repete a cada tique da janela',
    telegrafiasExtras === 0, `(${telegrafiasExtras} repetições)`);
  check('RF-07: a janela dura o tempo declarado em js/balance.js',
    Math.abs(tiques * TICK - BOSS_TELEGRAPH_TIME) <= TICK + 1e-9,
    `(${(tiques * TICK).toFixed(3)}s vs ${BOSS_TELEGRAPH_TIME}s)`);
  check('RF-07: a fase se fecha ao resolver',
    a.chefe.windup === 0 && a.chefe.windupTotal === 0 && a.chefe.windupKind === null);
  check('RF-07: o especial entra em cooldown ao ser escolhido, não ao resolver',
    a.chefe.special > 0 && a.chefe.special <= BOSS_SPECIAL_CD, `(${a.chefe.special.toFixed(2)})`);

  // O dano depois da janela: o especial é fixado numa nova para que o efeito
  // seja dano, e não invocação, sem depender do sorteio.
  {
    const b = arenaChefe(1);
    tique(b.G);
    b.chefe.windupKind = BOSSES[0].specials.find((sp) => sp.kind === 'nova').id;
    const cheio = encheHp(b.p);
    let perdeu = false, n = 0;
    while (b.chefe.windup > 0 && n < 200) {
      n++;
      tique(b.G);
      if (b.chefe.windup > 0 && b.p.hp < cheio) perdeu = true;
    }
    check('RF-07: o dano do ataque perigoso só ocorre depois da janela',
      !perdeu && b.p.hp < cheio, `(hp ${b.p.hp.toFixed(1)} de ${cheio})`);
  }

  // Cancelamento (RF-09): morte, atordoamento e congelamento no meio da janela.
  function cancelaNoMeio(aplica) {
    const { G, chefe, p } = arenaChefe(1);
    tique(G);
    const abriu = chefe.windupKind !== null;
    const cheio = encheHp(p);
    // Metade da janela e nada mais: o cancelamento precisa pegar a fase aberta.
    for (let i = 0; i < Math.floor(BOSS_TELEGRAPH_TIME / TICK / 2); i++) tique(G);
    const aindaAberta = chefe.windup > 0;
    aplica(G, chefe, p);
    const zerou = chefe.windup === 0 && chefe.windupTotal === 0 && chefe.windupKind === null;
    // Sobra de janela mais folga, ainda dentro do cooldown do especial: o
    // ataque cancelado não pode ressurgir depois.
    for (let i = 0; i < Math.ceil(BOSS_TELEGRAPH_TIME / TICK) + 30; i++) tique(G);
    return {
      abriu, aindaAberta, zerou,
      semDano: p.hp >= cheio,
      semProjetil: G.projectiles.length === 0,
      semZona: G.zones.length === 0,
      semLacaio: G.monsters.filter((m) => m.summoned).length === 0,
    };
  }

  const morte = cancelaNoMeio((G, chefe, p) => hitMonster(G, chefe, 999999, 0, p, {}));
  check('RF-09: chefe morto no meio da janela zera a fase sem resolver',
    morte.abriu && morte.aindaAberta && morte.zerou);
  check('RF-09: chefe morto não causa dano nem cria projétil, zona ou lacaio',
    morte.semDano && morte.semProjetil && morte.semZona && morte.semLacaio);

  const atordoado = cancelaNoMeio((G, chefe) => { chefe.status.stun = 2; tique(G); });
  check('RF-09: chefe atordoado no meio da janela zera a fase sem resolver',
    atordoado.abriu && atordoado.aindaAberta && atordoado.zerou);
  check('RF-09: chefe atordoado não causa dano nem cria projétil, zona ou lacaio',
    atordoado.semDano && atordoado.semProjetil && atordoado.semZona && atordoado.semLacaio);

  const congelado = cancelaNoMeio((G, chefe) => { chefe.status.freeze = 2; tique(G); });
  check('RF-09: chefe congelado no meio da janela zera a fase sem resolver',
    congelado.abriu && congelado.aindaAberta && congelado.zerou);
  check('RF-09: chefe congelado não causa dano nem cria projétil, zona ou lacaio',
    congelado.semDano && congelado.semProjetil && congelado.semZona && congelado.semLacaio);
}

console.log('\n== kit de especiais por chefe ==');
{
  // Registra a sequência de especiais que o chefe realmente escolheu, lendo a
  // marca da fase de telegrafia. É a única leitura que prova o que foi
  // sorteado sem espiar dentro da função de seleção.
  function sequenciaEspeciais(floor, hardcore, seed) {
    const G = createGame(seed, floor);
    const chefe = G.monsters.find((m) => m.isBoss);
    G.monsters = [chefe];
    chefe.hardcore = hardcore;
    addPlayer(G, { id: 'p1', name: 'Alvo', voc: 'knight' });
    const p = G.players.p1;
    p.x = chefe.x + 3.0; p.y = chefe.y;
    chefe.aggro = p.id;
    const ids = [];
    let anterior = null;
    const n = Math.round(180 / TICK);
    for (let i = 0; i < n; i++) {
      // O teste é sobre o kit escolhido, não sobre sobreviver ao chefe.
      p.hp = stats(p).maxHp;
      setInput(G, 'p1', { mx: 0, my: 0, acts: [] });
      step(G, TICK);
      if (chefe.windupKind && chefe.windupKind !== anterior) ids.push(chefe.windupKind);
      anterior = chefe.windupKind;
    }
    return ids;
  }

  const SEED = 4242;
  const todosIds = new Set(BOSSES.flatMap((b) => b.specials.map((sp) => sp.id)));

  for (let floor = 1; floor <= 4; floor++) {
    const boss = BOSSES[(floor - 1) % BOSSES.length];
    const proprios = new Set(boss.specials.map((sp) => sp.id));
    const idsHc = new Set(boss.specials.filter((sp) => sp.hc).map((sp) => sp.id));
    const alheios = [...todosIds].filter((id) => !proprios.has(id));

    const seqHc = sequenciaEspeciais(floor, true, SEED);
    const seqComum = sequenciaEspeciais(floor, false, SEED);

    check(`RF-01: ${boss.id} dispara especiais e só os do próprio kit`,
      seqComum.length > 0 && seqComum.every((id) => proprios.has(id)),
      `(${seqComum.length} disparos)`);
    check(`RF-01: nenhum especial de outro chefe aparece em ${boss.id}`,
      !seqHc.concat(seqComum).some((id) => alheios.includes(id)));
    check(`RF-04: o ${boss.id} HARDCORE dispara ao menos uma vez um especial hc`,
      seqHc.some((id) => idsHc.has(id)),
      `(${seqHc.filter((id) => idsHc.has(id)).length} de ${seqHc.length})`);
    check(`RF-04: o ${boss.id} comum nunca dispara nenhum especial hc`,
      !seqComum.some((id) => idsHc.has(id)));
    check(`RF-04: o kit HARDCORE de ${boss.id} tem id ausente do kit comum`,
      bossSpecials(boss, true).some((sp) => !bossSpecials(boss, false).some((o) => o.id === sp.id)));

    const repeticao = sequenciaEspeciais(floor, true, SEED);
    check(`RF-01: com a mesma seed o ${boss.id} repete a mesma sequência de especiais`,
      repeticao.length === seqHc.length && repeticao.every((id, i) => id === seqHc[i]),
      `(${repeticao.length} vs ${seqHc.length})`);
  }

  // Determinismo por seed é o que a medição de duração de luta vai exigir:
  // seeds diferentes precisam produzir sequências diferentes, senão o sorteio
  // virou constante e o teste acima passaria por acidente.
  const outraSeed = sequenciaEspeciais(1, true, 909090);
  const mesmaSeed = sequenciaEspeciais(1, true, SEED);
  check('RF-01: seeds diferentes produzem sequências diferentes',
    outraSeed.join(',') !== mesmaSeed.join(','));

  // Nada de sorteio global no ramo do chefe: o texto da função é a prova mais
  // direta de que a seleção e a invocação passam por G.rng.
  const fonte = await readFile(new URL('../js/sim.js', import.meta.url), 'utf8');
  const ramo = fonte
    .slice(fonte.indexOf('function startBossSpecial'), fonte.indexOf('function resolveMonsterAttack'))
    // Sem os comentários: um deles cita o nome da função justamente para
    // explicar por que ela não é usada ali.
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  check('RF-01: o ramo do chefe não usa Math.random()',
    ramo.length > 0 && !ramo.includes('Math.random'),
    `(${ramo.length} caracteres inspecionados)`);
}


console.log('\n== kit declarado na tabela de conteúdo ==');
{
  // Varredura estática de BOSSES. O bloco anterior prova o que o sorteio
  // conseguiu disparar dentro do tempo do teste; este prova o contrato da
  // tabela, que é onde a identidade mecânica de cada chefe realmente mora.
  for (const boss of BOSSES) {
    const comum = bossSpecials(boss, false);
    check(`RF-01: ${boss.id} declara ao menos 3 especiais próprios`,
      comum.length >= 3, `(${comum.length})`);
    check(`RF-04: ${boss.id} declara ao menos 1 especial exclusivo do HARDCORE`,
      boss.specials.some((sp) => sp.hc === true),
      `(${boss.specials.filter((sp) => sp.hc).length})`);
    check(`RF-01: todo especial de ${boss.id} tem id e primitiva conhecida`,
      boss.specials.every((sp) => typeof sp.id === 'string' && sp.id.length > 0
        && ['nova', 'burst', 'summon', 'zone'].includes(sp.kind)));
  }

  // Interseção vazia para todo par (A, B) com A != B: dois chefes que
  // compartilhassem um id voltariam a ser o mesmo bicho com cores diferentes.
  let intersecaoOk = true, intersecaoDet = '';
  for (const a of BOSSES) {
    for (const b of BOSSES) {
      if (a.id === b.id) continue;
      const idsB = new Set(b.specials.map((sp) => sp.id));
      const repetidos = a.specials.filter((sp) => idsB.has(sp.id)).map((sp) => sp.id);
      if (repetidos.length) {
        intersecaoOk = false;
        intersecaoDet = `${a.id} x ${b.id}: ${repetidos.join(',')}`;
      }
    }
  }
  check('RF-01: a interseção de especiais entre todo par de chefes é vazia',
    intersecaoOk, intersecaoDet);

  const todos = BOSSES.flatMap((b) => b.specials.map((sp) => sp.id));
  check('RF-01: nenhum identificador de especial se repete no jogo inteiro',
    new Set(todos).size === todos.length, `(${todos.length} ids)`);
}

console.log('\n== degrau numérico da variante HARDCORE ==');
{
  // Mesmo andar, mesmo chefe e mesmo grupo: o HARDCORE precisa ser degrau de
  // número além de degrau de mecânica. A referência comum é reconstruída da
  // mesma curva que sim.js consome — nenhum número de balanceamento é escrito
  // aqui, tudo vem de js/balance.js e da tabela de conteúdo.
  for (const floor of [3, 6, 9, 12]) {
    for (const players of [1, 10]) {
      const G = createGame(2468, floor, players);
      const b = G.monsters.find((m) => m.isBoss);
      const tipo = BOSSES[(floor - 1) % BOSSES.length];
      const curva = bossCurve(floor);
      const hpComum = Math.round(tipo.hp * curva.hpMult * groupScale(players));
      const atkComum = Math.floor(tipo.atk * curva.atkMult);
      check(`RF-04: ${b.typeId} HARDCORE tem maxHp e atk maiores que o comum (grupo de ${players})`,
        b.hardcore === true && b.maxHp > hpComum && b.atk > atkComum,
        `${b.maxHp}/${b.atk} vs ${hpComum}/${atkComum}`);
    }
  }

  check('RF-04: os dois fatores HARDCORE são estritamente maiores que 1',
    HARDCORE_HP_MULT > 1 && HARDCORE_ATK_MULT > 1,
    `(${HARDCORE_HP_MULT} / ${HARDCORE_ATK_MULT})`);

  // Mecânica exclusiva: o kit HARDCORE contém id ausente do kit comum do
  // mesmo chefe, e nunca o contrário — o HARDCORE acrescenta, não troca.
  for (const boss of BOSSES) {
    const kitHc = bossSpecials(boss, true).map((sp) => sp.id);
    const kitComum = bossSpecials(boss, false).map((sp) => sp.id);
    check(`RF-04: o kit HARDCORE de ${boss.id} acrescenta mecânica ao kit comum`,
      kitHc.some((id) => !kitComum.includes(id))
      && kitComum.every((id) => kitHc.includes(id)),
      `${kitComum.length} -> ${kitHc.length}`);
  }
}

console.log('\n== marca HARDCORE na barra do chefe ==');
{
  // bossBarLabel é pura: importar ui.js em Node não toca DOM porque el() só
  // procura elemento quando é chamada.
  const chefeHc = createGame(7777, 3).monsters.find((m) => m.isBoss);
  const chefeComum = createGame(7777, 4).monsters.find((m) => m.isBoss);
  const rotuloHc = bossBarLabel(chefeHc);
  const rotuloComum = bossBarLabel(chefeComum);

  check('UI-02: a barra do chefe HARDCORE traz o termo HARDCORE',
    rotuloHc.includes('HARDCORE'), rotuloHc);
  check('UI-02: o rótulo do HARDCORE mantém nome e nível do chefe',
    rotuloHc.includes(chefeHc.name) && rotuloHc.includes(String(chefeHc.level)), rotuloHc);
  check('UI-02: com chefe comum o termo HARDCORE está ausente',
    !rotuloComum.includes('HARDCORE'), rotuloComum);

  // A distinção precisa sobreviver à escala de cinza: o mesmo chefe com e sem
  // a flag tem de produzir textos diferentes, não só cores diferentes.
  const semFlag = bossBarLabel({ ...chefeHc, hardcore: false });
  check('UI-02: a distinção é textual — o mesmo chefe muda de rótulo com a flag',
    rotuloHc !== semFlag && !semFlag.includes('HARDCORE'), `${semFlag} | ${rotuloHc}`);
}

console.log('\n== anel de telegrafia ==');
{
  // telegraphProgress é pura e importada de render.js: o anel precisa fechar
  // ao fim da janela para qualquer duração, e não no 0,5s que o divisor fixo
  // assumia.
  for (const D of [BOSS_TELEGRAPH_TIME, BOSS_WINDUP, MONSTER_WINDUP]) {
    check(`UI-03: com janela de ${D}s o anel começa em 0`,
      Math.abs(telegraphProgress(D, D) - 0) <= 0.02, `(${telegraphProgress(D, D)})`);
    check(`UI-03: com janela de ${D}s o anel fecha em 1`,
      Math.abs(telegraphProgress(0, D) - 1) <= 0.02, `(${telegraphProgress(0, D)})`);
    check(`UI-03: com janela de ${D}s o anel é 1 - restante/duração no meio dela`,
      Math.abs(telegraphProgress(D / 2, D) - 0.5) <= 0.02, `(${telegraphProgress(D / 2, D)})`);

    // Erro máximo ao longo de toda a janela, tique a tique.
    let pior = 0, monotonico = true, anterior = -1;
    for (let restante = D; restante >= 0; restante -= TICK) {
      const prog = telegraphProgress(restante, D);
      pior = Math.max(pior, Math.abs(prog - (1 - restante / D)));
      if (prog < anterior) monotonico = false;
      anterior = prog;
    }
    check(`UI-03: com janela de ${D}s o erro do anel fica em 0,02 ou menos`,
      pior <= 0.02, `(${pior.toFixed(4)})`);
    check(`UI-03: com janela de ${D}s o anel só avança`, monotonico);
  }

  // Prova de que o divisor não é mais fixo: o mesmo restante em janelas
  // diferentes precisa dar progresso diferente.
  check('UI-03: o progresso depende da duração declarada, não de um divisor fixo',
    telegraphProgress(BOSS_WINDUP, BOSS_TELEGRAPH_TIME) !== telegraphProgress(BOSS_WINDUP, BOSS_WINDUP),
    `(${telegraphProgress(BOSS_WINDUP, BOSS_TELEGRAPH_TIME)} vs ${telegraphProgress(BOSS_WINDUP, BOSS_WINDUP)})`);
  check('UI-03: fora da janela o progresso fica preso entre 0 e 1',
    telegraphProgress(BOSS_TELEGRAPH_TIME * 2, BOSS_TELEGRAPH_TIME) === 0
    && telegraphProgress(-1, BOSS_TELEGRAPH_TIME) === 1);
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
