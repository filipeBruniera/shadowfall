// Partida completa com 10 jogadores: do spawn ao portal, com bots usando o A* real.
// É o cenário que o delta do MVP promete e o que a suíte antiga não cobria.
import {
  createGame, addPlayer, setInput, step, stats, nextFloor, hitMonster, TICK,
} from '../js/sim.js';
import { findPath } from '../js/world.js';
import { MAX_PLAYERS, PORTAL_HOLD, REVIVE_TIME, groupScale } from '../js/balance.js';
import { VOC_LIST } from '../js/data.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { console.log(`  FAIL ${label} ${extra}`); failures++; }
}

// Bot que caça o monstro mais próximo com o mesmo A* do clique-para-andar.
function makeBot(G) {
  const state = new Map();
  return (p, t, goal = null) => {
    if (!state.has(p.id)) state.set(p.id, { path: [], repath: Math.random() });
    const bs = state.get(p.id);

    let alvo = goal;
    let d = alvo ? Math.hypot(alvo.x - p.x, alvo.y - p.y) : 1e9;
    if (!alvo) {
      for (const m of G.monsters) {
        if (m.hp <= 0) continue;
        const dd = Math.hypot(m.x - p.x, m.y - p.y);
        if (dd < d) { d = dd; alvo = m; }
      }
    }
    bs.repath -= TICK;
    if (alvo && bs.repath <= 0) {
      bs.repath = 0.5;
      bs.path = findPath(G.map, p.x, p.y, alvo.x, alvo.y) || [];
    }
    while (bs.path.length && Math.hypot(bs.path[0].x - p.x, bs.path[0].y - p.y) < 0.35) bs.path.shift();

    let mx = 0, my = 0;
    const parar = goal ? 0.6 : 1.1;
    if (bs.path.length && d > parar) {
      const a = Math.atan2(bs.path[0].y - p.y, bs.path[0].x - p.x);
      mx = Math.cos(a); my = Math.sin(a);
    }
    const acts = [];
    if (!goal && alvo && d < 7 && t % 10 === 0) {
      const key = ['Q', 'W', 'E', 'R'][t % 4];
      acts.push({ id: t * 8 + 1, k: 'cast', slot: key, ax: alvo.x, ay: alvo.y });
    }
    if (t % 90 === 0) acts.push({ id: t * 8 + 2, k: 'pot', slot: 'hp' });
    if (p.dead && p.deathTimer > 6) acts.push({ id: t * 8 + 3, k: 'respawn' });
    setInput(G, p.id, { mx, my, target: !goal && alvo ? alvo.id : 0, acts });
  };
}

console.log('\n== grupo de 10: partida completa ==');
{
  const G = createGame(20250820, 1, MAX_PLAYERS);
  const ps = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    ps.push(addPlayer(G, { id: 'p' + i, name: 'P' + i, voc: VOC_LIST[i % VOC_LIST.length] }));
  }
  const bot = makeBot(G);
  const monstrosIniciais = G.monsters.length;

  // Fase 1: caçar até o chefe cair.
  let t = 0;
  const limite = 300 / TICK;
  while (t < limite && !G.portalOpen) {
    for (const p of ps) bot(p, t);
    step(G, TICK);
    t++;
  }
  check('grupo de 10: o chefe cai e o portal abre', G.portalOpen, `${(t * TICK).toFixed(0)}s`);
  check('grupo de 10: o grupo limpou parte do andar', G.monsters.filter((m) => m.hp > 0).length < monstrosIniciais);
  check('grupo de 10: todo mundo ganhou XP', ps.every((p) => p.level > 1 || p.xp > 0),
    ps.map((p) => p.level).join(','));

  // Fase 2: todos ao portal. Só desce com o grupo inteiro em cima.
  const portal = { x: G.map.portal.x + 0.5, y: G.map.portal.y + 0.5 };
  let desceu = false;
  const limite2 = t + 240 / TICK;
  while (t < limite2 && !desceu) {
    for (const p of ps) bot(p, t, portal);
    step(G, TICK);
    if (G.pendingFloor) desceu = true;
    t++;
  }
  check('grupo de 10: partida completa do spawn ao portal', desceu, `${(t * TICK).toFixed(0)}s`);

  if (desceu) {
    const vivos = ps.filter((p) => !p.dead).length;
    check('grupo de 10: a descida exigiu todos os vivos no portal',
      G.portalTotal === vivos || G.portalReady === G.portalTotal, `${G.portalReady}/${G.portalTotal}`);
    G.pendingFloor = false;
    nextFloor(G);
    check('grupo de 10: o andar seguinte nasce escalado para o grupo',
      G.groupSize === ps.filter((p) => !p.dead).length && G.floor === 2, `grupo ${G.groupSize}`);
    check('grupo de 10: ninguém nasce sobreposto no andar novo',
      ps.every((a, i) => ps.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > 0.4)));
  }
}

console.log('\n== ressurreição por aliado com grupo cheio ==');
{
  const G = createGame(555, 2, MAX_PLAYERS);
  G.monsters.length = 0;
  const ps = [];
  for (let i = 0; i < MAX_PLAYERS; i++) ps.push(addPlayer(G, { id: 'r' + i, name: 'R' + i, voc: 'knight' }));
  const caido = ps[7];
  caido.dead = true; caido.deathTimer = 0; caido.reviveProg = 0;
  // Dois aliados chegam junto; os outros ficam longe.
  ps.forEach((p, i) => { if (i !== 7) { p.x = caido.x + 30; p.y = caido.y + 30; } });
  ps[0].x = caido.x + 0.4; ps[0].y = caido.y;
  ps[1].x = caido.x - 0.4; ps[1].y = caido.y;

  for (let i = 0; i < Math.round((REVIVE_TIME / 2 + 0.3) / TICK); i++) {
    for (const p of ps) setInput(G, p.id, { mx: 0, my: 0, acts: [] });
    step(G, TICK);
  }
  check('grupo de 10: dois aliados erguem o caído em metade do tempo', !caido.dead);
}

console.log('\n== orçamento de tick: 1 contra 10 ==');
{
  const medir = (n) => {
    const G = createGame(31415, 8, n);
    const ps = [];
    for (let i = 0; i < n; i++) ps.push(addPlayer(G, { id: 'm' + i, name: 'M', voc: 'sorcerer' }));
    const bot = makeBot(G);
    // Aquece antes de medir.
    for (let t = 0; t < 60; t++) { for (const p of ps) bot(p, t); step(G, TICK); }
    const t0 = performance.now();
    for (let t = 0; t < 900; t++) { for (const p of ps) bot(p, t); step(G, TICK); }
    return { ms: (performance.now() - t0) / 900, monstros: G.monsters.length };
  };

  const um = medir(1);
  const dez = medir(MAX_PLAYERS);
  console.log(`      1 jogador: ${um.monstros} monstros, ${um.ms.toFixed(3)}ms/tick`);
  console.log(`      ${MAX_PLAYERS} jogadores: ${dez.monstros} monstros, ${dez.ms.toFixed(3)}ms/tick`);

  check('grupo de 10: tick permanece dentro do orçamento de 30Hz', dez.ms < 4, `${dez.ms.toFixed(3)}ms`);
  check('grupo de 10: o andar cresce com o grupo', dez.monstros > um.monstros);
  check('grupo de 10: o custo por tick não explode com o grupo',
    dez.ms < um.ms * 12 + 1, `${um.ms.toFixed(3)} -> ${dez.ms.toFixed(3)}`);
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
