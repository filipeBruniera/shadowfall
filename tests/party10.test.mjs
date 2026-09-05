// Partida completa com 10 jogadores: do spawn ao portal, com bots usando o A* real.
// É o cenário que o delta do MVP promete e o que a suíte antiga não cobria.
import {
  createGame,
  addPlayer,
  setInput,
  step,
  stats,
  nextFloor,
  hitMonster,
  TICK,
} from '../js/sim.js';
import { findPath } from '../js/world.js';
import {
  MAX_PLAYERS,
  PORTAL_HOLD,
  REVIVE_TIME,
  groupScale,
  bossCurve,
  HARDCORE_EVERY,
  TICK_BUDGET_MS,
  TICK_BUDGET_SAMPLES,
} from '../js/balance.js';
import { VOC_LIST } from '../js/data.js';
// Toda janela de tempo deste arquivo sai de medição, e medição só vale se
// repetir de um processo para o outro. A produção ainda tira crítico, vagar de
// monstro e queda de loot de Math.random() (js/sim.js:457, js/sim.js:851-852,
// js/sim.js:1331), então o gerador semeado entra no lugar dele durante as
// corridas e sai no fim do arquivo.
import { mulberry32 } from '../js/rng.js';
import { measureTickBudget } from '../js/tickbudget.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.log(`  FAIL ${label} ${extra}`);
    failures++;
  }
}

// Medição de 20/08/2026 que justifica semear, andar 1, 6 seeds x 3 execuções,
// teto folgado de 900 s: com Math.random livre o tempo até G.portalOpen variou
// de 33,8 s a 86,0 s e uma das 18 corridas não chegou ao portal nem em 600 s;
// com Math.random semeado as 18 devolveram o mesmo tempo, seed a seed. Era essa
// cauda — não a média — que derrubava a suíte em ~1 de 8 execuções, porque a
// seed fixa de createGame() não governa o crítico nem o vagar do monstro.
// tests/group.test.mjs:427-447 semeia pelo mesmo motivo e restaura do mesmo
// jeito.
const randomOriginal = Math.random;
const semear = seed => {
  Math.random = mulberry32(seed);
};

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
        if (dd < d) {
          d = dd;
          alvo = m;
        }
      }
    }
    bs.repath -= TICK;
    if (alvo && bs.repath <= 0) {
      bs.repath = 0.5;
      bs.path = findPath(G.map, p.x, p.y, alvo.x, alvo.y) || [];
    }
    while (bs.path.length && Math.hypot(bs.path[0].x - p.x, bs.path[0].y - p.y) < 0.35)
      bs.path.shift();

    let mx = 0,
      my = 0;
    const parar = goal ? 0.6 : 1.1;
    if (bs.path.length && d > parar) {
      const a = Math.atan2(bs.path[0].y - p.y, bs.path[0].x - p.x);
      mx = Math.cos(a);
      my = Math.sin(a);
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
  semear(20250820);
  const G = createGame(20250820, 1, MAX_PLAYERS);
  const ps = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    ps.push(addPlayer(G, { id: 'p' + i, name: 'P' + i, voc: VOC_LIST[i % VOC_LIST.length] }));
  }
  const bot = makeBot(G);
  const monstrosIniciais = G.monsters.length;

  // Fase 1: caçar até o chefe cair.
  //
  // A janela de 300 s foi remedida em 20/08/2026, depois do degrau HARDCORE
  // entrar: 6 seeds x 3 execuções semeadas, teto folgado de 900 s, tempo real
  // até G.portalOpen entre 40,2 s e 75,8 s — esta corrida, seed 20250820, fecha
  // em 53,9 s. Ela nasce em andar 1, que NÃO é múltiplo de 3: o chefe aqui é o
  // comum, então RF-11 não alonga esta fase e a medição não pediu número novo.
  // Margem adotada: 3,9x o pior caso medido, 5,6x esta corrida. O andar
  // HARDCORE tem cenário próprio mais abaixo.
  let t = 0;
  const limite = 300 / TICK;
  while (t < limite && !G.portalOpen) {
    for (const p of ps) bot(p, t);
    step(G, TICK);
    t++;
  }
  check('grupo de 10: o chefe cai e o portal abre', G.portalOpen, `${(t * TICK).toFixed(0)}s`);
  check(
    'grupo de 10: o grupo limpou parte do andar',
    G.monsters.filter(m => m.hp > 0).length < monstrosIniciais
  );
  check(
    'grupo de 10: todo mundo ganhou XP',
    ps.every(p => p.level > 1 || p.xp > 0),
    ps.map(p => p.level).join(',')
  );

  // Fase 2: todos ao portal. Só desce com o grupo inteiro em cima.
  const portal = { x: G.map.portal.x + 0.5, y: G.map.portal.y + 0.5 };
  let desceu = false;
  // Medição de 20/08/2026 nas mesmas execuções semeadas: a caminhada dos 10 até
  // o portal levou de 2,6 s a 20,9 s no andar 1 e no máximo 29,4 s no andar 9 —
  // esta corrida gasta 12,5 s. Margem adotada: 11,5x o pior caso medido. Janela
  // larga de propósito, porque aqui ela só existe para o teste falhar em vez de
  // travar se ninguém chegar ao portal. Sem semear, uma das 18 corridas livres
  // passou de 600 s nesta mesma fase.
  const limite2 = t + 240 / TICK;
  while (t < limite2 && !desceu) {
    for (const p of ps) bot(p, t, portal);
    step(G, TICK);
    if (G.pendingFloor) desceu = true;
    t++;
  }
  check('grupo de 10: partida completa do spawn ao portal', desceu, `${(t * TICK).toFixed(0)}s`);

  if (desceu) {
    const vivos = ps.filter(p => !p.dead).length;
    check(
      'grupo de 10: a descida exigiu todos os vivos no portal',
      G.portalTotal === vivos || G.portalReady === G.portalTotal,
      `${G.portalReady}/${G.portalTotal}`
    );
    G.pendingFloor = false;
    nextFloor(G);
    check(
      'grupo de 10: o andar seguinte nasce escalado para o grupo',
      G.groupSize === ps.filter(p => !p.dead).length && G.floor === 2,
      `grupo ${G.groupSize}`
    );
    check(
      'grupo de 10: ninguém nasce sobreposto no andar novo',
      ps.every((a, i) => ps.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > 0.4))
    );
  }
}

console.log('\n== grupo de 10 em andar HARDCORE ==');
{
  // O andar 9 é múltiplo de 3, então o chefe nasce HARDCORE e RF-11 manda a
  // luta dele durar ~2x a do comum. A corrida do bloco anterior nasce em andar
  // 1 e nunca encosta nesse caso; sem este cenário, o dobro de duração
  // entraria em produção sem nenhuma janela de tempo medida em cima dele.
  const ANDAR_HC = 9;
  semear(20250820);
  const G = createGame(20250820, ANDAR_HC, MAX_PLAYERS);
  const chefe = G.monsters.find(m => m.isBoss);
  const ps = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const p = addPlayer(G, { id: 'h' + i, name: 'H' + i, voc: VOC_LIST[i % VOC_LIST.length] });
    // Grupo que desceu até o andar 9 chega nele por volta do nível do chefe.
    // Deixar todo mundo no nível 1 mediria a curva de progressão, não o degrau.
    p.level = bossCurve(ANDAR_HC).level;
    const st = stats(p);
    p.hp = st.maxHp;
    p.mp = st.maxMp;
    ps.push(p);
  }
  const bot = makeBot(G);

  check(
    'andar HARDCORE: o chefe do andar 9 nasce na variante HARDCORE',
    ANDAR_HC % HARDCORE_EVERY === 0 && chefe.hardcore === true
  );

  // Janela medida em 20/08/2026 no mesmo harness da fase 1: 6 seeds x 3
  // execuções semeadas em andar 9 com o grupo nivelado, teto folgado de 900 s,
  // tempo real até G.portalOpen entre 62,7 s e 120,0 s — esta corrida, seed
  // 20250820, fecha em 116,4 s, pouco mais que o dobro dos 53,9 s do andar 1, o
  // degrau que RF-11 manda. Margem adotada: 2,5x o pior caso medido, que dá o
  // mesmo 300 s da fase 1.
  const limiteHc = 300 / TICK;
  let t = 0;
  while (t < limiteHc && !G.portalOpen) {
    for (const p of ps) bot(p, t);
    step(G, TICK);
    t++;
  }
  console.log(
    `      andar ${ANDAR_HC} (HARDCORE): portal em ${(t * TICK).toFixed(1)}s de simulação`
  );
  check(
    'andar HARDCORE: o chefe cai e o portal abre dentro da janela medida',
    G.portalOpen,
    `${(t * TICK).toFixed(0)}s de ${(limiteHc * TICK).toFixed(0)}s`
  );
  check(
    'andar HARDCORE: o chefe HARDCORE realmente morreu, não sumiu da lista',
    chefe.hp <= 0,
    `${chefe.hp}/${chefe.maxHp}`
  );
}

console.log('\n== ressurreição por aliado com grupo cheio ==');
{
  const G = createGame(555, 2, MAX_PLAYERS);
  G.monsters.length = 0;
  const ps = [];
  for (let i = 0; i < MAX_PLAYERS; i++)
    ps.push(addPlayer(G, { id: 'r' + i, name: 'R' + i, voc: 'knight' }));
  const caido = ps[7];
  caido.dead = true;
  caido.deathTimer = 0;
  caido.reviveProg = 0;
  // Dois aliados chegam junto; os outros ficam longe.
  ps.forEach((p, i) => {
    if (i !== 7) {
      p.x = caido.x + 30;
      p.y = caido.y + 30;
    }
  });
  ps[0].x = caido.x + 0.4;
  ps[0].y = caido.y;
  ps[1].x = caido.x - 0.4;
  ps[1].y = caido.y;

  // Única "janela" que não sai de medição: ela é derivada de REVIVE_TIME (dois
  // aliados erguem o caído na metade do tempo) mais 0,3 s de folga de
  // arredondamento de tique. Chefe e HARDCORE não entram nesta conta — o andar
  // aqui roda sem monstro nenhum.
  for (let i = 0; i < Math.round((REVIVE_TIME / 2 + 0.3) / TICK); i++) {
    for (const p of ps) setInput(G, p.id, { mx: 0, my: 0, acts: [] });
    step(G, TICK);
  }
  check('grupo de 10: dois aliados erguem o caído em metade do tempo', !caido.dead);
}

console.log('\n== orçamento de tick: 1 contra 10 ==');
{
  // O andar entra por parâmetro porque o orçamento de tique precisa valer
  // também em andar HARDCORE: kit exclusivo, telegrafia e invocação do chefe só
  // existem lá. O padrão continua sendo o 8 de antes, que não é múltiplo de 3.
  const medir = (n, floor = 8) => {
    // Semeia aqui também: as três medições têm de comparar a MESMA carga de
    // trabalho, senão a diferença de ms/tique mistura custo com sorteio.
    semear(31415);
    const G = createGame(31415, floor, n);
    const ps = [];
    for (let i = 0; i < n; i++) ps.push(addPlayer(G, { id: 'm' + i, name: 'M', voc: 'sorcerer' }));
    const bot = makeBot(G);
    // 60 tiques de aquecimento e 900 de medição: são tamanhos de amostra, não
    // janelas de tempo de jogo — 900 tiques são 30 s de simulação, o bastante
    // para o chefe girar 4 especiais (BOSS_SPECIAL_CD = 7 s).
    for (let t = 0; t < 60; t++) {
      for (const p of ps) bot(p, t);
      step(G, TICK);
    }
    const t0 = performance.now();
    for (let t = 0; t < 900; t++) {
      for (const p of ps) bot(p, t);
      step(G, TICK);
    }
    return { ms: (performance.now() - t0) / 900, monstros: G.monsters.length };
  };

  const um = medir(1);
  const dez = medir(MAX_PLAYERS);
  const dezHc = medir(MAX_PLAYERS, 9);
  console.log(`      1 jogador: ${um.monstros} monstros, ${um.ms.toFixed(3)}ms/tick`);
  console.log(
    `      ${MAX_PLAYERS} jogadores: ${dez.monstros} monstros, ${dez.ms.toFixed(3)}ms/tick`
  );
  console.log(
    `      ${MAX_PLAYERS} jogadores em andar HARDCORE: ${dezHc.monstros} monstros, ${dezHc.ms.toFixed(3)}ms/tick`
  );

  check(
    'grupo de 10: tick permanece dentro do orçamento de 30Hz',
    dez.ms < TICK_BUDGET_MS,
    `${dez.ms.toFixed(3)}ms`
  );
  // RNF-01: o teto de 4 ms é o mesmo de antes e não se move por causa do
  // HARDCORE — se o kit do chefe estourar o orçamento, o certo é enxugar o kit.
  check(
    'grupo de 10: tick permanece dentro do orçamento também em andar HARDCORE',
    dezHc.ms < TICK_BUDGET_MS,
    `${dezHc.ms.toFixed(3)}ms no andar 9`
  );
  check('grupo de 10: o andar cresce com o grupo', dez.monstros > um.monstros);
  check(
    'grupo de 10: o custo por tick não explode com o grupo',
    dez.ms < um.ms * 12 + 1,
    `${um.ms.toFixed(3)} -> ${dez.ms.toFixed(3)}`
  );
}

console.log('\n== teto individual de step: 10 jogadores ==');
{
  const probes = measureTickBudget();
  for (const probe of probes) {
    console.log(
      `      andar ${probe.floor}: ${probe.players} jogadores, ${probe.monsters} monstros, ` +
        `${probe.meanMs.toFixed(3)}ms médio, ${probe.maxMs.toFixed(3)}ms máximo em ${probe.samples} steps`
    );
    // Não é média nem percentil: cada step da amostra já entrou no máximo.
    check(
      `grupo de 10: nenhum step do probe excede ${TICK_BUDGET_MS}ms no andar ${probe.floor}`,
      probe.maxMs < TICK_BUDGET_MS,
      `${probe.maxMs.toFixed(3)}ms máximo em ${probe.samples} steps`
    );
  }

  // Regressão da sonda: um outlier legítimo não pode desaparecer por média,
  // percentil ou descarte pós-aquecimento. O relógio sintético só troca tempo;
  // os mesmos steps reais ainda rodam nos dois andares.
  let calls = 0;
  let sample = 0;
  const withSpike = () => {
    if (calls++ % 2 === 0) return sample * 10;
    const elapsed = sample++ % TICK_BUDGET_SAMPLES === 17 ? TICK_BUDGET_MS + 1 : 1;
    return (sample - 1) * 10 + elapsed;
  };
  const spikes = measureTickBudget(withSpike);
  check(
    'grupo de 10: o probe conserva o outlier individual acima do teto',
    spikes.every(probe => probe.maxMs === TICK_BUDGET_MS + 1),
    spikes.map(probe => `${probe.floor}: ${probe.maxMs.toFixed(3)}ms`).join(' · ')
  );
}

// A semeadura é instrumento de medição, não estado global: o gerador de
// produção volta antes de a suíte sair.
const semeouDurante = Math.random !== randomOriginal;
Math.random = randomOriginal;
check(
  'grupo de 10: a medição semeou Math.random e devolveu o original',
  semeouDurante && Math.random === randomOriginal
);

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
