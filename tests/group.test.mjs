// Combate, morte e progressão com grupo grande — nada pode pressupor dois jogadores.
import {
  createGame, addPlayer, setInput, step, stats, nextFloor, hitMonster, TICK,
} from '../js/sim.js';
import {
  MAX_PLAYERS, HEAL_ALLY_RADIUS, REVIVE_TIME, REVIVE_RADIUS, XP_RADIUS, PORTAL_HOLD,
  xpShare, groupScale, floorPopulation, GROUP_SCALE_CAP,
  bossCurve, HARDCORE_EVERY, HARDCORE_HP_MULT, HARDCORE_ATK_MULT,
} from '../js/balance.js';
import { BOSSES } from '../js/data.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { console.log(`  FAIL ${label} ${extra}`); failures++; }
}

// Monta uma partida com N jogadores juntos no spawn.
function party(n, voc = 'knight', seed = 777, { peaceful = false } = {}) {
  const G = createGame(seed, 1);
  // Nos testes de cura o assunto é a escolha do alvo: monstro batendo no meio
  // só adiciona ruído.
  if (peaceful) G.monsters.length = 0;
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(addPlayer(G, { id: 'p' + i, name: 'P' + i, voc }));
  const s = G.map.spawn;
  ps.forEach((p) => { p.x = s.x; p.y = s.y; });
  return { G, ps };
}
const idle = (G) => { for (const id of Object.keys(G.players)) setInput(G, id, { mx: 0, my: 0, acts: [] }); };

console.log('\n== cura em grupo ==');
{
  const { G, ps } = party(10, 'druid', 777, { peaceful: true });
  // Espalha levemente e fere todo mundo em graus diferentes.
  ps.forEach((p, i) => { p.x = G.map.spawn.x + i * 0.4; p.hp = stats(p).maxHp * (1 - i * 0.08); });
  const alvo = ps[9];                       // o mais ferido
  const curador = ps[0];
  curador.mp = 999;

  const antes = alvo.hp;
  setInput(G, curador.id, { mx: 0, my: 0, acts: [{ id: 1, k: 'cast', slot: 'E', ax: curador.x, ay: curador.y }] });
  step(G, TICK);
  check('combate em grupo: cura escolhe o aliado mais ferido entre 9',
    alvo.hp > antes, `hp ${antes.toFixed(1)} -> ${alvo.hp.toFixed(1)}`);

  // Regeneração natural move o HP alguns centésimos por tick: o que não pode
  // acontecer é um segundo salto de cura.
  const outros = ps.slice(1, 9);
  check('combate em grupo: a cura vai para um alvo só, não para todos',
    outros.every((p, i) => p.hp - stats(p).maxHp * (1 - (i + 1) * 0.08) < 1),
    outros.map((p, i) => (p.hp - stats(p).maxHp * (1 - (i + 1) * 0.08)).toFixed(2)).join(' '));
}
{
  const { G, ps } = party(3, 'druid', 777, { peaceful: true });
  ps[1].x = G.map.spawn.x + HEAL_ALLY_RADIUS + 5;   // fora do alcance
  ps[1].hp = 1;
  ps[2].hp = stats(ps[2]).maxHp * 0.5;
  ps[0].mp = 999;
  const antesLonge = ps[1].hp;
  setInput(G, ps[0].id, { mx: 0, my: 0, acts: [{ id: 1, k: 'cast', slot: 'E', ax: ps[0].x, ay: ps[0].y }] });
  step(G, TICK);
  check('combate em grupo: aliado fora do alcance não é curado',
    ps[1].hp - antesLonge < 1 && ps[2].hp > stats(ps[2]).maxHp * 0.5 + 1,
    `longe ${antesLonge.toFixed(1)}->${ps[1].hp.toFixed(1)}, perto ${ps[2].hp.toFixed(1)}`);
}

console.log('\n== provocação em grupo ==');
{
  const { G, ps } = party(10, 'knight');
  const tank = ps[0];
  tank.mp = 999;
  // Traz monstros para perto do grupo.
  const perto = G.monsters.slice(0, 12);
  perto.forEach((m, i) => { m.x = tank.x + Math.cos(i) * 2; m.y = tank.y + Math.sin(i) * 2; m.aggro = 'p' + ((i % 9) + 1); });

  setInput(G, tank.id, { mx: 0, my: 0, acts: [{ id: 1, k: 'cast', slot: 'E', ax: tank.x, ay: tank.y }] });
  step(G, TICK);
  const presos = perto.filter((m) => m.hp > 0 && m.tauntedBy === tank.id);
  check('combate em grupo: provocação funciona com 10 jogadores no raio',
    presos.length > 0, `${presos.length} de ${perto.length}`);
  check('combate em grupo: provocação muda o alvo dos monstros no raio',
    presos.every((m) => m.aggro === tank.id));
}

console.log('\n== XP compartilhado ==');
{
  const { G, ps } = party(4);
  const m = G.monsters.find((x) => x.hp > 0);
  ps.forEach((p) => { p.x = m.x + 1; p.y = m.y + 1; });
  const longe = ps[3];
  longe.x = m.x + XP_RADIUS + 10;             // fora do raio de XP
  const antes = ps.map((p) => p.xp);

  m.hp = 1;
  hitMonster(G, m, 9999, ps[0], 0);
  step(G, TICK);

  check('XP: creditado a todos os vivos no raio, sem depender de autoria',
    ps[1].xp > antes[1] && ps[2].xp > antes[2], `p1 ${antes[1]}->${ps[1].xp}`);
  check('XP: quem está além do raio não recebe', longe.xp === antes[3], `${antes[3]} -> ${longe.xp}`);
}
{
  check('XP: divisor por raiz do número de vivos confere com 1, 2 e 10',
    Math.abs(xpShare(1) - 1) < 1e-9
    && Math.abs(xpShare(2) - 0.7071) < 1e-3
    && Math.abs(xpShare(10) - 0.3162) < 1e-3);
  check('XP: mais gente viva significa parcela menor', xpShare(2) > xpShare(5) && xpShare(5) > xpShare(10));
}

console.log('\n== escalonamento por grupo ==');
{
  check('escala: a curva é monotônica', groupScale(1) < groupScale(4) && groupScale(4) < groupScale(10));
  check('escala: a curva respeita o teto', groupScale(1000) === GROUP_SCALE_CAP);
  check('escala: 1 jogador não altera nada', groupScale(1) === 1);
  check('escala: entrada inválida cai para 1 jogador', groupScale(0) === 1 && groupScale(-3) === 1 && groupScale(NaN) === 1);
  check('escala: 10 jogadores enfrentam mais monstros que 1',
    floorPopulation(5, 10) > floorPopulation(5, 1), `${floorPopulation(5, 1)} -> ${floorPopulation(5, 10)}`);
  check('escala: com 1 jogador o andar é idêntico ao balanceamento atual',
    floorPopulation(5, 1) === Math.min(150, 62 + 5 * 8));
}

console.log('\n== ressurreição em grupo ==');
// Simula segundos de jogo com o grupo parado.
function run(G, seconds) { const n = Math.round(seconds / TICK); for (let i = 0; i < n; i++) { idle(G); step(G, TICK); } }

{
  const { G, ps } = party(10, 'knight', 4242, { peaceful: true });
  const caido = ps[9];
  caido.dead = true; caido.deathTimer = 0; caido.reviveProg = 0;
  // Só um aliado no raio, os outros longe.
  ps.forEach((p, i) => { if (i > 0 && i < 9) { p.x = G.map.spawn.x + 40; p.y = G.map.spawn.y + 40; } });
  ps[0].x = caido.x + 0.5; ps[0].y = caido.y;

  run(G, REVIVE_TIME - 0.5);
  check('ressurreição: ainda não ergueu antes do tempo', caido.dead, `prog ${caido.reviveProg.toFixed(2)}`);
  run(G, 1);
  check('ressurreição: qualquer um dos 9 aliados no raio ergue', !caido.dead);
  check('ressurreição: leva 3,5s e devolve o jogador em pé no local',
    Math.abs(caido.x - ps[0].x) < 2 && caido.hp > 0);
}
{
  // Dois erguendo ao mesmo tempo: metade do tempo.
  const { G, ps } = party(3, 'knight', 4243, { peaceful: true });
  const caido = ps[2];
  caido.dead = true; caido.deathTimer = 0; caido.reviveProg = 0;
  ps[0].x = caido.x + 0.5; ps[0].y = caido.y;
  ps[1].x = caido.x - 0.5; ps[1].y = caido.y;

  run(G, REVIVE_TIME / 2 + 0.2);
  check('ressurreição: dois aliados erguem em metade do tempo', !caido.dead);
}
{
  // Nove em volta não zeram o tempo: o ganho por aliado tem teto.
  const { G, ps } = party(10, 'knight', 4244, { peaceful: true });
  const caido = ps[9];
  caido.dead = true; caido.deathTimer = 0; caido.reviveProg = 0;
  ps.slice(0, 9).forEach((p, i) => { p.x = caido.x + Math.cos(i) * 0.6; p.y = caido.y + Math.sin(i) * 0.6; });

  run(G, REVIVE_TIME / 9);
  check('ressurreição: o ganho por aliado tem teto', caido.dead, `prog ${caido.reviveProg.toFixed(2)}`);
  run(G, REVIVE_TIME);
  check('ressurreição: com o teto, o grupo grande ainda ergue', !caido.dead);
}
{
  // Sair do raio decai; voltar retoma de onde parou.
  const { G, ps } = party(2, 'knight', 4245, { peaceful: true });
  const caido = ps[1];
  caido.dead = true; caido.deathTimer = 0; caido.reviveProg = 0;
  ps[0].x = caido.x + 0.5; ps[0].y = caido.y;

  run(G, 2);
  const noMeio = caido.reviveProg;
  ps[0].x = caido.x + 20;
  run(G, 0.5);
  const apos = caido.reviveProg;
  check('ressurreição: sair do raio decai em vez de zerar',
    apos < noMeio && apos > 0, `${noMeio.toFixed(2)} -> ${apos.toFixed(2)}`);

  ps[0].x = caido.x + 0.5;
  run(G, 0.2);
  check('ressurreição: voltar ao raio retoma de onde parou',
    caido.reviveProg > apos, `${apos.toFixed(2)} -> ${caido.reviveProg.toFixed(2)}`);
}
{
  // Rede de segurança continua valendo sem ninguém por perto.
  const { G, ps } = party(1, 'knight', 4246, { peaceful: true });
  const solo = ps[0];
  solo.dead = true; solo.deathTimer = 0;
  run(G, 31);
  check('respawn: automático aos 30s mesmo sem aliado', !solo.dead);
}

console.log('\n== portal coletivo ==');
function noPortal(G, p) { p.x = G.map.portal.x + 0.5; p.y = G.map.portal.y + 0.5; }
function forapdoPortal(G, p) { p.x = G.map.portal.x + 20; p.y = G.map.portal.y + 20; }

{
  const { G, ps } = party(3, 'knight', 5150, { peaceful: true });
  G.portalOpen = true;
  noPortal(G, ps[0]); noPortal(G, ps[1]);
  forapdoPortal(G, ps[2]);

  run(G, PORTAL_HOLD + 1);
  check('portal: com 3 vivos, 2 em cima não desce', G.floor === 1 && !G.pendingFloor,
    `${G.portalReady}/${G.portalTotal}`);
  check('portal: a contagem mostra quantos vivos estão em cima',
    G.portalReady === 2 && G.portalTotal === 3, `${G.portalReady}/${G.portalTotal}`);

  noPortal(G, ps[2]);
  run(G, PORTAL_HOLD + 0.2);
  check('portal: todos os vivos em cima descem em 1,5s', G.pendingFloor === true);
}
{
  const { G, ps } = party(3, 'knight', 5151, { peaceful: true });
  G.portalOpen = true;
  noPortal(G, ps[0]); noPortal(G, ps[1]);
  ps[2].dead = true; ps[2].deathTimer = 0;
  forapdoPortal(G, ps[2]);

  run(G, PORTAL_HOLD + 0.2);
  check('portal: morto não conta para o requisito', G.pendingFloor === true && G.portalTotal === 2);
}
{
  const { G, ps } = party(2, 'knight', 5152, { peaceful: true });
  G.portalOpen = true;
  noPortal(G, ps[0]); noPortal(G, ps[1]);
  run(G, PORTAL_HOLD * 0.6);
  const meio = G.portalHold;
  forapdoPortal(G, ps[1]);
  run(G, 0.2);
  check('portal: sair zera o hold coletivo', meio > 0 && G.portalHold === 0, `${meio.toFixed(2)} -> ${G.portalHold}`);
}
{
  const { G, ps } = party(1, 'knight', 5153, { peaceful: true });
  G.portalOpen = true;
  noPortal(G, ps[0]);
  run(G, PORTAL_HOLD + 0.2);
  check('portal: com 1 jogador vivo, basta ele cumprir os 1,5s', G.pendingFloor === true);
}

console.log('\n== composição da dificuldade do chefe ==');
{
  // maxHp do chefe é o produto de três fatores independentes: curva do andar,
  // groupScale e degrau HARDCORE. Nenhum deles é reescrito em sim.js.
  const cenarios = [
    { floor: 3, players: 1 }, { floor: 3, players: 10 },
    { floor: 5, players: 1 }, { floor: 6, players: 4 },
    { floor: 9, players: 10 }, { floor: 12, players: 2 },
  ];
  let produtoOk = true, produtoDet = '';
  for (const { floor, players } of cenarios) {
    const G = createGame(3131, floor, players);
    const b = G.monsters.find((m) => m.isBoss);
    const tipo = BOSSES[(floor - 1) % BOSSES.length];
    const curva = bossCurve(floor);
    const hc = floor % HARDCORE_EVERY === 0;
    const hpEsperado = Math.round(
      tipo.hp * curva.hpMult * groupScale(players) * (hc ? HARDCORE_HP_MULT : 1));
    const atkEsperado = Math.floor(
      tipo.atk * curva.atkMult * (hc ? HARDCORE_ATK_MULT : 1));
    if (b.maxHp !== hpEsperado || b.atk !== atkEsperado || b.level !== curva.level) {
      produtoOk = false;
      produtoDet = `andar ${floor}/${players}: ${b.maxHp}x${b.atk}x${b.level} != ${hpEsperado}x${atkEsperado}x${curva.level}`;
    }
  }
  check('chefe: maxHp e atk são o produto de curva x groupScale x fator HARDCORE',
    produtoOk, produtoDet);

  // A ordem dos fatores não muda o resultado até o arredondamento final.
  const curva9 = bossCurve(9);
  const tipo9 = BOSSES[(9 - 1) % BOSSES.length];
  const ordemA = tipo9.hp * curva9.hpMult * groupScale(6) * HARDCORE_HP_MULT;
  const ordemB = HARDCORE_HP_MULT * groupScale(6) * curva9.hpMult * tipo9.hp;
  check('chefe: o produto independe da ordem dos fatores',
    Math.abs(ordemA - ordemB) < 1e-9, `${ordemA} vs ${ordemB}`);

  // Degrau HARDCORE: mesmo chefe, mesmo grupo, andares 9 e 21 (ambos ferumbras
  // e ambos múltiplos de 3) contra o mesmo chefe fora do ciclo.
  for (const players of [1, 10]) {
    const hcG = createGame(3131, 3, players).monsters.find((m) => m.isBoss);
    const tipo = BOSSES[(3 - 1) % BOSSES.length];
    const curva = bossCurve(3);
    const hpComum = Math.round(tipo.hp * curva.hpMult * groupScale(players));
    const atkComum = Math.floor(tipo.atk * curva.atkMult);
    check(`chefe: HARDCORE tem HP e dano estritamente maiores (grupo de ${players})`,
      hcG.maxHp > hpComum && hcG.atk > atkComum,
      `${hcG.maxHp}/${hcG.atk} vs ${hpComum}/${atkComum}`);
  }

  // A escala por grupo continua valendo nas duas variantes.
  for (const floor of [3, 5]) {
    const solo = createGame(3131, floor, 1).monsters.find((m) => m.isBoss);
    const cheio = createGame(3131, floor, 10).monsters.find((m) => m.isBoss);
    check(`chefe: HP cresce com o grupo no andar ${floor}`,
      cheio.maxHp > solo.maxHp, `${solo.maxHp} -> ${cheio.maxHp}`);
  }

  // A curva é a fonte única da dificuldade: monotônica não decrescente em 1..30.
  let mono = true;
  for (let f = 2; f <= 30; f++) {
    const prev = bossCurve(f - 1);
    const cur = bossCurve(f);
    if (cur.level < prev.level || cur.hpMult < prev.hpMult || cur.atkMult < prev.atkMult) mono = false;
  }
  check('chefe: bossCurve é monotônica não decrescente de 1 a 30', mono);
}

console.log('\n== escala do andar ==');
{
  const solo = createGame(9001, 5, 1);
  const grupo = createGame(9001, 5, 10);
  const hpSolo = solo.monsters.reduce((t, m) => t + m.maxHp, 0);
  const hpGrupo = grupo.monsters.reduce((t, m) => t + m.maxHp, 0);
  check('escala: 10 jogadores enfrentam mais monstros e mais HP que 1',
    grupo.monsters.length > solo.monsters.length && hpGrupo > hpSolo,
    `${solo.monsters.length}/${hpSolo} -> ${grupo.monsters.length}/${hpGrupo}`);

  const bSolo = solo.monsters.find((m) => m.isBoss);
  const bGrupo = grupo.monsters.find((m) => m.isBoss);
  check('escala: HP do chefe acompanha o tamanho do grupo',
    bGrupo.maxHp > bSolo.maxHp && bGrupo.hp === bGrupo.maxHp,
    `${bSolo.maxHp} -> ${bGrupo.maxHp}`);

  const solo2 = createGame(9001, 5, 1);
  check('escala: com 1 jogador o andar é idêntico ao balanceamento atual',
    solo2.monsters.length === solo.monsters.length
    && solo2.monsters.every((m, i) => m.maxHp === solo.monsters[i].maxHp));

  // A escala não muda no meio do andar: só ao entrar no próximo.
  const G = createGame(9002, 3, 2);
  const antes = G.monsters.length;
  for (let i = 0; i < 8; i++) addPlayer(G, { id: 'x' + i, name: 'X', voc: 'knight' });
  idle(G); step(G, TICK);
  check('escala: é calculada na entrada do andar, não no meio dele', G.monsters.length === antes);
  nextFloor(G);
  check('escala: o andar seguinte já considera o grupo maior', G.groupSize === Object.keys(G.players).length);
}

console.log('\n== coleta com grupo grande ==');
function dropAt(G, x, y) {
  const it = { id: G.nextId++, kind: 'gold', x, y, amount: 50, glyph: 'gold', rarity: 'common', name: 'Ouro' };
  G.items.push(it);
  return it;
}
{
  const { G, ps } = party(10, 'knight', 6100, { peaceful: true });
  G.items.length = 0;
  // Todos no mesmo ponto: 10 jogadores disputando a mesma moeda.
  ps.forEach((p) => { p.x = G.map.spawn.x; p.y = G.map.spawn.y; });
  dropAt(G, G.map.spawn.x, G.map.spawn.y);
  const ouroAntes = ps.map((p) => p.gold);

  idle(G); step(G, TICK);
  const ganharam = ps.filter((p, i) => p.gold > ouroAntes[i]);
  check('coleta em grupo: item é coletado uma única vez com 10 jogadores no raio',
    ganharam.length === 1 && G.items.length === 0, `${ganharam.length} ganharam`);
  check('coleta em grupo: nenhum item some sem entrar em mochila alguma',
    ganharam.length + G.items.length === 1);
}
{
  // Mesma situação, duas execuções: mesmo vencedor.
  const vencedor = () => {
    const { G, ps } = party(6, 'knight', 6101, { peaceful: true });
    G.items.length = 0;
    ps.forEach((p, i) => { p.x = G.map.spawn.x + i * 0.1; p.y = G.map.spawn.y; });
    dropAt(G, G.map.spawn.x + 0.25, G.map.spawn.y);
    const antes = ps.map((p) => p.gold);
    idle(G); step(G, TICK);
    return ps.findIndex((p, i) => p.gold > antes[i]);
  };
  const a = vencedor(), b = vencedor();
  check('coleta em grupo: a regra é determinística', a === b && a !== -1, `${a} vs ${b}`);
}
{
  const { G, ps } = party(3, 'knight', 6102, { peaceful: true });
  G.items.length = 0;
  ps[0].x = G.map.spawn.x; ps[0].y = G.map.spawn.y;
  ps[1].x = G.map.spawn.x + 0.7; ps[1].y = G.map.spawn.y;
  ps[2].x = G.map.spawn.x + 30; ps[2].y = G.map.spawn.y;
  dropAt(G, G.map.spawn.x + 0.65, G.map.spawn.y);   // bem mais perto de ps[1]
  const antes = ps.map((p) => p.gold);
  idle(G); step(G, TICK);
  check('coleta em grupo: leva o mais próximo', ps[1].gold > antes[1] && ps[0].gold === antes[0]);
}
{
  const { G, ps } = party(2, 'knight', 6103, { peaceful: true });
  G.items.length = 0;
  ps[0].dead = true;
  ps.forEach((p) => { p.x = G.map.spawn.x; p.y = G.map.spawn.y; });
  dropAt(G, G.map.spawn.x, G.map.spawn.y);
  const antes = ps[1].gold;
  idle(G); step(G, TICK);
  check('coleta em grupo: quem está caído não coleta', ps[1].gold > antes && G.items.length === 0);
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
