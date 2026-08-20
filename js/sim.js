import { makeRng, randomSeed } from './rng.js';
import {
  T, E, VOCATIONS, MONSTERS, BOSSES, MONSTER_BY_ID, RARITY, RARITY_ORDER,
  ITEM_BASES, AFFIXES, CONSUMABLES, EQUIP_SLOTS, elemMult, xpForLevel, ELEM_COLOR,
  ELEM_STATUS, bossSpecials,
} from './data.js';
import { generateMap, tileAt, buildFlowField, MAP_W, MAP_H } from './world.js';
import {
  TICK, INV_SIZE, PICKUP_RADIUS, POTION_STACK, START_POTIONS,
  REVIVE_RADIUS, REVIVE_TIME, REVIVE_DECAY, RESPAWN_DELAY, AUTO_RESPAWN,
  DEATH_GOLD_LOSS, REVIVE_HP_FRAC, REVIVE_MP_FRAC,
  PORTAL_HOLD, XP_RADIUS, FLOOR_RESTORE_FRAC, floorPopulation, xpShare, groupScale,
  HEAL_ALLY_RADIUS, TAUNT_TIME, REVIVE_MAX_HELPERS,
  bossCurve, HARDCORE_EVERY, HARDCORE_HP_MULT, HARDCORE_ATK_MULT,
  LEVEL_HP_SCALE, LEVEL_ATK_SCALE, LEVEL_DEF_SCALE, LEVEL_XP_SCALE,
  WITHER_DPS, WITHER_HEAL_MULT, BOSS_STATUS_MAG, PLAYER_REGEN_PCT,
  MONSTER_WINDUP, BOSS_WINDUP, BOSS_TELEGRAPH_TIME, BOSS_SPECIAL_CD,
} from './balance.js';

export { TICK };

// ============================================================
// CRIAÇÃO DO ESTADO
// ============================================================
export function createGame(seed = randomSeed(), floor = 1, groupSize = 1) {
  const G = {
    seed, floor,
    map: generateMap(seed, floor),
    players: {},
    monsters: [],
    items: [],
    projectiles: [],
    zones: [],
    events: [],
    // step() zera G.events no primeiro comando, então evento empilhado fora do
    // tique (nascimento do andar, virada de andar) morria antes de qualquer
    // consumidor ler. Este buffer segura até o próximo step() drenar.
    pendingEvents: [],
    time: 0,
    nextId: 1,
    rng: makeRng((seed ^ 0xabcd1234) >>> 0),
    flow: null,
    flowTimer: 0,
    bossId: null,
    portalOpen: false,
    portalTimer: 0,
    portalHold: 0,
    portalReady: 0,
    portalTotal: 0,
    groupSize: Math.max(1, groupSize),
    cleared: false,
  };
  populate(G);
  return G;
}

export function nextFloor(G) {
  G.floor++;
  // Anúncio do andar sai antes de populate() para a linha do andar aparecer na
  // tela antes da linha do chefe HARDCORE que populate() empilha.
  pushPending(G, { t: 'floor', floor: G.floor });
  logPending(G, `Andar ${G.floor} — o ar fica mais pesado.`, 'system');
  // A escala do andar novo considera quem está vivo agora, incluindo quem
  // acabou de entrar pela fila.
  G.groupSize = Math.max(1, Object.values(G.players).filter((p) => !p.dead).length);
  G.map = generateMap(G.seed, G.floor);
  G.monsters.length = 0;
  G.items.length = 0;
  G.projectiles.length = 0;
  G.zones.length = 0;
  G.portalOpen = false;
  G.portalHold = 0;
  G.portalReady = 0;
  G.cleared = false;
  G.flow = null;
  populate(G);
  let slot = 0;
  for (const p of Object.values(G.players)) {
    const spot = spawnSlot(G, slot++);
    p.x = spot.x; p.y = spot.y;
    p.dead = false; p.deathTimer = 0; p.reviveProg = 0;
    const st = stats(p);
    p.hp = Math.max(p.hp, Math.floor(st.maxHp * FLOOR_RESTORE_FRAC));
    p.mp = Math.max(p.mp, Math.floor(st.maxMp * FLOOR_RESTORE_FRAC));
    p.status = emptyStatus();
    p.portalHold = 0;
  }
  return G;
}

function populate(G) {
  const rng = G.rng;
  const floor = G.floor;
  const pool = MONSTERS.filter((m) => m.tier <= Math.min(4, Math.floor((floor - 1) / 1.5) + 1));
  const count = floorPopulation(floor, G.groupSize || 1);

  const hpScale = groupScale(G.groupSize || 1);
  for (let i = 0; i < count; i++) {
    const room = rng.pick(G.map.rooms);
    if (room === G.map.spawnRoom) continue;
    const type = rng.pick(pool);
    const x = rng.range(room.x + 1.5, room.x + room.w - 1.5);
    const y = rng.range(room.y + 1.5, room.y + room.h - 1.5);
    if (tileAt(G.map, Math.floor(x), Math.floor(y)) !== T.FLOOR) continue;
    const mob = makeMonster(G, type, x, y, floor + rng.int(0, 2));
    mob.maxHp = Math.round(mob.maxHp * hpScale);
    mob.hp = mob.maxHp;
    G.monsters.push(mob);
  }

  const boss = BOSSES[(floor - 1) % BOSSES.length];
  // A identidade do chefe continua vindo do ciclo de 4; HARDCORE é acréscimo
  // por andar múltiplo de 3, nunca troca de chefe.
  const hardcore = floor % HARDCORE_EVERY === 0;
  const curve = bossCurve(floor);
  const b = makeMonster(G, boss, G.map.bossRoom.cx + 0.5, G.map.bossRoom.cy - 1.5, curve.level);
  b.isBoss = true;
  b.hardcore = hardcore;
  // Três fatores independentes e multiplicativos: curva do andar, tamanho do
  // grupo (groupScale, nunca reescrita aqui) e o degrau HARDCORE. 10 pessoas
  // não podem transformar o chefe num ponto de passagem.
  const gScale = groupScale(G.groupSize || 1);
  const hcHp = hardcore ? HARDCORE_HP_MULT : 1;
  const hcAtk = hardcore ? HARDCORE_ATK_MULT : 1;
  b.maxHp = Math.round(boss.hp * curve.hpMult * gScale * hcHp);
  b.hp = b.maxHp;
  b.atk = Math.floor(boss.atk * curve.atkMult * hcAtk);
  b.name = `${boss.name} · Andar ${floor}`;
  G.monsters.push(b);
  G.bossId = b.id;

  if (hardcore) {
    // Empilha no buffer, não em G.events: populate() roda fora do tique e o
    // primeiro comando de step() zeraria os dois eventos antes de qualquer
    // consumidor ler. `boss: 1` é o que faz isCriticalEvent() devolver true,
    // então nem a fila saturada corta o aviso.
    pushPending(G, { t: 'bossSpawn', id: b.id, typeId: boss.id, floor, hardcore: 1, boss: 1 });
    logPending(G, `Andar HARDCORE — ${boss.name} desceu em sua forma mais cruel.`, 'boss');
  }
}

function makeMonster(G, type, x, y, level) {
  const scale = 1 + (level - 1) * LEVEL_HP_SCALE;
  const hp = Math.floor(type.hp * scale);
  return {
    id: G.nextId++,
    typeId: type.id,
    name: type.name,
    shape: type.shape,
    x, y, dir: 0,
    hp, maxHp: hp,
    atk: Math.floor(type.atk * (1 + (level - 1) * LEVEL_ATK_SCALE)),
    def: Math.floor(type.def * (1 + (level - 1) * LEVEL_DEF_SCALE)),
    xp: Math.floor(type.xp * (1 + (level - 1) * LEVEL_XP_SCALE)),
    level,
    speed: type.speed,
    vision: type.vision,
    ai: type.ai,
    elem: type.elem,
    weak: type.weak,
    resist: type.resist,
    color: type.color,
    size: type.size,
    lifesteal: type.lifesteal || 0,
    poison: type.poison || null,
    enrage: !!type.enrage,
    home: { x, y },
    cd: G.rng.range(0, 1.5),
    windup: 0,
    // A telegrafia reusa o windup em vez de abrir uma máquina paralela:
    // windupTotal é o que o anel precisa para fechar em qualquer duração, e
    // windupKind diz qual especial resolve no fim (null = golpe básico).
    windupTotal: 0,
    windupKind: null,
    windupTarget: null,
    special: G.rng.range(4, 8),
    aggro: null,
    tauntedBy: null,
    tauntTime: 0,
    status: emptyStatus(),
    hitFlash: 0,
    isBoss: false,
    hardcore: false,
    summoned: false,
    phase: 0,
  };
}

// `wither` é campo próprio e não reuso de `poison`. Morte também tira HP com o
// tempo, mas o que a define é o funil de cura de healPlayer(); somados no mesmo
// campo, Terra e Morte ficariam indistinguíveis em jogo.
function emptyStatus() {
  return { burn: 0, burnDps: 0, poison: 0, poisonDps: 0, wither: 0, slow: 0, slowMult: 1, stun: 0, freeze: 0 };
}

// ============================================================
// JOGADORES
// ============================================================
// Com 10 jogadores, empilhar todo mundo no mesmo tile não serve. Anel de 6 por
// volta, sempre caindo em chão livre.
export function spawnSlot(G, index) {
  const s = G.map.spawn;
  if (!index) return { x: s.x, y: s.y };
  const ring = Math.ceil(index / 6);
  const k = (index - 1) % 6;
  const ang = (k / 6) * Math.PI * 2 + ring * 0.6;
  const r = 1.2 * ring;
  return findFreeSpot(G.map, s.x + Math.cos(ang) * r, s.y + Math.sin(ang) * r, 2);
}

export function addPlayer(G, { id, name, voc }) {
  const V = VOCATIONS[voc] || VOCATIONS.knight;
  const spot = spawnSlot(G, Object.keys(G.players).length);
  const p = {
    id, name: (name || 'Herói').slice(0, 14), voc: V.id,
    x: spot.x,
    y: spot.y,
    dir: 0,
    level: 1, xp: 0, gold: 0,
    hp: V.hp, mp: V.mp,
    equip: { weapon: null, offhand: null, armor: null, boots: null, ring: null, amulet: null },
    inv: new Array(INV_SIZE).fill(null),
    potions: { ...START_POTIONS },
    atkCd: 0,
    skillCd: { Q: 0, W: 0, E: 0, R: 0 },
    buffs: [],
    status: emptyStatus(),
    dead: false, deathTimer: 0, reviveProg: 0,
    lastAct: 0,
    lastQueued: 0,
    reviveHelpers: 0,
    invVer: 1,
    kills: 0, deaths: 0, dmgDone: 0,
    anim: { attack: 0, cast: 0, moving: false, hurt: 0 },
    input: { mx: 0, my: 0, target: 0, acts: [] },
    portalHold: 0,
    onPortal: false,
  };
  const st = stats(p);
  p.hp = st.maxHp; p.mp = st.maxMp;
  G.players[id] = p;
  log(G, `${p.name} entrou na masmorra como ${V.name}.`, 'system');
  return p;
}

export function removePlayer(G, id) {
  const p = G.players[id];
  if (p) log(G, `${p.name} saiu.`, 'system');
  delete G.players[id];
}

// Estatísticas finais: base da vocação + nível + equipamento + buffs ativos.
export function stats(p) {
  const V = VOCATIONS[p.voc];
  const L = p.level - 1;
  const s = {
    maxHp: V.hp + V.gHp * L,
    maxMp: V.mp + V.gMp * L,
    atk: V.atk + V.gAtk * L,
    def: V.def + V.gDef * L,
    ml: V.ml + V.gMl * L,
    speed: 3.5,
    crit: 0.05,
    leech: 0,
    atkSpeed: V.atkSpeed,
    range: V.range,
    dmgRes: 0,
  };
  for (const slot of EQUIP_SLOTS) {
    const it = p.equip[slot];
    if (!it) continue;
    s.maxHp += it.hp || 0;
    s.maxMp += it.mp || 0;
    s.atk += it.atk || 0;
    s.def += it.def || 0;
    s.ml += it.ml || 0;
    s.speed += it.speed || 0;
    s.crit += it.crit || 0;
    s.leech += it.leech || 0;
    s.atkSpeed += it.atkSpeed || 0;
  }
  for (const b of p.buffs) {
    if (b.atk) s.atk *= b.atk;
    if (b.def) s.def *= b.def;
    if (b.ml) s.ml *= b.ml;
    if (b.speed) s.speed *= b.speed;
    if (b.dmgRes) s.dmgRes = Math.max(s.dmgRes, b.dmgRes);
  }
  if (p.status.slow > 0) s.speed *= p.status.slowMult;
  s.maxHp = Math.floor(s.maxHp);
  s.maxMp = Math.floor(s.maxMp);
  s.atkSpeed = Math.max(0.22, s.atkSpeed);
  return s;
}

export function setInput(G, id, input) {
  const p = G.players[id];
  if (!p) return;
  p.input.mx = input.mx || 0;
  p.input.my = input.my || 0;
  p.input.target = input.target || 0;
  if (input.acts && input.acts.length) {
    for (const a of input.acts) {
      // lastAct só sobe quando a ação é processada, então dois pacotes chegando
      // entre dois ticks enfileiravam a mesma ação duas vezes. lastQueued fecha isso.
      if (a.id > p.lastAct && a.id > p.lastQueued) {
        p.input.acts.push(a);
        p.lastQueued = a.id;
      }
    }
  }
}

// ============================================================
// LOOP PRINCIPAL
// ============================================================
export function step(G, dt) {
  G.time += dt;
  G.events.length = 0;
  // Drenagem única: o buffer é esvaziado no mesmo comando, senão o lote de
  // nascimento se repetiria a cada tique.
  const pending = G.pendingEvents;
  if (pending && pending.length) {
    for (const ev of pending) G.events.push(ev);
    pending.length = 0;
  }

  const alive = Object.values(G.players).filter((p) => !p.dead);

  G.flowTimer -= dt;
  if (G.flowTimer <= 0 || !G.flow) {
    G.flow = buildFlowField(G.map, alive.length ? alive : [G.map.spawn]);
    G.flowTimer = 0.2;
  }

  for (const p of Object.values(G.players)) updatePlayer(G, p, dt);
  updatePickup(G);
  updatePortal(G, dt);
  for (const m of G.monsters) updateMonster(G, m, dt);
  updateProjectiles(G, dt);
  updateZones(G, dt);

  // Limpeza
  if (G.monsters.length > 200) G.monsters = G.monsters.filter((m) => m.hp > 0);
  else G.monsters = G.monsters.filter((m) => m.hp > 0 || m.deathFade > 0);

  const boss = G.monsters.find((m) => m.id === G.bossId && m.hp > 0);
  if (!boss && !G.portalOpen) {
    G.portalOpen = true;
    log(G, 'O chefe caiu. Um portal se abriu na sala dele — pisem juntos para descer.', 'boss');
    pushEvent(G, { t: 'portal' });
  }

  return G.events;
}

function updatePlayer(G, p, dt) {
  const st = stats(p);
  p.hp = Math.min(p.hp, st.maxHp);
  p.mp = Math.min(p.mp, st.maxMp);

  // Ações enfileiradas (magias, poções, equipar) — processa mesmo morto p/ nada travar.
  const acts = p.input.acts;
  p.input.acts = [];
  for (const a of acts) {
    p.lastAct = Math.max(p.lastAct, a.id);
    if (p.dead) {
      // Único comando válido de quem caiu: voltar ao início por conta própria.
      if (a.k === 'respawn' && p.deathTimer >= RESPAWN_DELAY) respawn(G, p, st);
      continue;
    }
    handleAct(G, p, a, st);
  }

  if (p.dead) {
    p.deathTimer += dt;
    // Qualquer aliado vivo por perto ergue. Mais de um acelera, com teto:
    // com 9 em volta a barra não pode virar instantânea.
    let reviver = null;
    let helpers = 0;
    for (const o of Object.values(G.players)) {
      if (o === p || o.dead) continue;
      if (dist(o, p) < REVIVE_RADIUS) { helpers++; if (!reviver) reviver = o; }
    }
    p.reviveHelpers = helpers;
    if (reviver) {
      p.reviveProg += dt * Math.min(helpers, REVIVE_MAX_HELPERS);
      if (p.reviveProg >= REVIVE_TIME) {
        p.dead = false; p.reviveProg = 0; p.deathTimer = 0;
        p.hp = Math.floor(st.maxHp * REVIVE_HP_FRAC);
        p.mp = Math.floor(st.maxMp * REVIVE_MP_FRAC);
        p.status = emptyStatus();
        pushEvent(G, { t: 'fx', k: 'revive', x: p.x, y: p.y });
        p.reviveHelpers = 0;
        log(G, helpers > 1
          ? `${reviver.name} e mais ${helpers - 1} reergueram ${p.name}.`
          : `${reviver.name} reergueu ${p.name}.`, 'heal');
      }
    } else {
      p.reviveProg = Math.max(0, p.reviveProg - dt * REVIVE_DECAY);
      // Rede de segurança: ninguém fica preso na tela de morte pra sempre.
      if (p.deathTimer >= AUTO_RESPAWN) respawn(G, p, st);
    }
    return;
  }

  // Buffs e status
  p.buffs = p.buffs.filter((b) => (b.time -= dt) > 0);
  tickStatus(G, p, dt, true);
  for (const k of ['Q', 'W', 'E', 'R']) p.skillCd[k] = Math.max(0, p.skillCd[k] - dt);
  p.atkCd = Math.max(0, p.atkCd - dt);
  p.anim.attack = Math.max(0, p.anim.attack - dt);
  p.anim.cast = Math.max(0, p.anim.cast - dt);
  p.anim.hurt = Math.max(0, p.anim.hurt - dt);

  // Regeneração lenta (o jogo é de poção, não de esperar sentado). Passa pelo
  // funil como qualquer outra cura: escrever `p.hp` direto aqui deixava o
  // wither de fora justamente da fonte de cura que nunca para, e o status
  // virava quase inerte para quem tem maxHp alto.
  healPlayer(G, p, st.maxHp * PLAYER_REGEN_PCT * dt, { silent: true });
  p.mp = Math.min(st.maxMp, p.mp + (2.5 + st.ml * 0.35) * dt);

  // Movimento
  if (p.status.stun <= 0 && p.status.freeze <= 0) {
    let mx = p.input.mx, my = p.input.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.01) {
      const sp = st.speed * dt;
      moveEntity(G.map, p, mx * sp, my * sp);
      p.dir = Math.atan2(my, mx);
      p.anim.moving = true;
    } else p.anim.moving = false;
  } else p.anim.moving = false;

  // Terreno perigoso
  const tile = tileAt(G.map, Math.floor(p.x), Math.floor(p.y));
  if (tile === T.LAVA) damagePlayer(G, p, 16 * dt, E.FIRE, { silent: true });

  // Ataque automático no alvo mais próximo dentro do alcance
  if (p.atkCd <= 0 && p.status.stun <= 0 && p.status.freeze <= 0) {
    let target = null;
    if (p.input.target) {
      const t = G.monsters.find((m) => m.id === p.input.target && m.hp > 0);
      if (t && dist(t, p) <= st.range + t.size * 0.4) target = t;
    }
    if (!target) target = nearestMonster(G, p.x, p.y, st.range + 0.4);
    if (target) {
      p.atkCd = st.atkSpeed;
      p.anim.attack = 0.22;
      p.dir = Math.atan2(target.y - p.y, target.x - p.x);
      const V = VOCATIONS[p.voc];
      const base = st.range > 3 ? st.atk * 0.9 + st.ml * 0.7 : st.atk * 1.15;
      if (st.range > 3) {
        spawnProjectile(G, {
          x: p.x, y: p.y, tx: target.x, ty: target.y, speed: 15,
          dmg: base, elem: V.elem, ownerId: p.id, owner: 'player', homing: target.id, range: st.range + 2,
        });
      } else {
        const crit = Math.random() < st.crit;
        hitMonster(G, target, base * (crit ? 1.9 : 1), V.elem, p, { crit });
        pushEvent(G, { t: 'fx', k: 'slash', x: target.x, y: target.y, a: p.dir, c: VOCATIONS[p.voc].color });
      }
    }
  }

  // Portal do andar: aqui só marcamos quem está em cima. A decisão de descer
  // é coletiva e sai em updatePortal, depois que todos foram atualizados.
  if (G.portalOpen) {
    const d = Math.hypot(p.x - (G.map.portal.x + 0.5), p.y - (G.map.portal.y + 0.5));
    p.onPortal = d < 1.2;
    if (!p.onPortal) p.portalHold = 0;
    else p.portalHold += dt;
  } else {
    p.onPortal = false;
    p.portalHold = 0;
  }
}

// Coleta automática. Com 10 pessoas no mesmo raio, quem fica com o item
// precisa ser regra e não ordem de iteração: leva o mais próximo, e o id
// desempata. Determinístico e coletado uma vez só.
function updatePickup(G) {
  const players = Object.values(G.players).filter((p) => !p.dead);
  if (!players.length) return;

  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i];
    let winner = null;
    let best = Infinity;
    for (const p of players) {
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (d > PICKUP_RADIUS) continue;
      if (d < best - 1e-9 || (Math.abs(d - best) <= 1e-9 && winner && String(p.id) < String(winner.id))) {
        best = d; winner = p;
      }
    }
    if (!winner) continue;
    if (grabItem(G, winner, it)) G.items.splice(i, 1);
  }
}

// Descer é decisão do grupo: todos os vivos precisam estar em cima por 1,5s.
// Um jogador arrastar nove para o andar seguinte seria fonte de atrito.
function updatePortal(G, dt) {
  if (!G.portalOpen) { G.portalHold = 0; G.portalReady = 0; G.portalTotal = 0; return; }
  const living = Object.values(G.players).filter((p) => !p.dead);
  const onPortal = living.filter((p) => p.onPortal);
  G.portalReady = onPortal.length;
  G.portalTotal = living.length;

  const todos = living.length > 0 && onPortal.length === living.length;
  if (!todos) {
    // Alguém saiu com a contagem em curso: zera e avisa. Zerar em vez de decair
    // porque a condição é binária, diferente da ressurreição.
    if (G.portalHold > 0) {
      G.portalHold = 0;
      pushEvent(G, { t: 'portalReset' });
    }
    return;
  }
  G.portalHold += dt;
  if (G.portalHold > PORTAL_HOLD) { G.pendingFloor = true; G.portalHold = 0; }
}

function respawn(G, p, st) {
  p.dead = false;
  p.deathTimer = 0;
  p.reviveProg = 0;
  p.hp = Math.floor(st.maxHp * 0.5);
  p.mp = Math.floor(st.maxMp * 0.5);
  p.status = emptyStatus();
  p.x = G.map.spawn.x;
  p.y = G.map.spawn.y;
  pushEvent(G, { t: 'fx', k: 'revive', x: p.x, y: p.y });
  pushEvent(G, { t: 'respawn', id: p.id });
  log(G, `${p.name} voltou do começo do andar.`, 'system');
}

function handleAct(G, p, a, st) {
  switch (a.k) {
    case 'cast': castSkill(G, p, a.slot, a.ax, a.ay, st); break;
    case 'pot': usePotion(G, p, a.slot, st); break;
    case 'use': useInvSlot(G, p, a.slot); break;
    case 'drop': dropInvSlot(G, p, a.slot); break;
    case 'unequip': unequip(G, p, a.slot); break;
    case 'sell': sellJunk(G, p); break;
    default: break;
  }
}

function usePotion(G, p, kind, st) {
  if (kind === 'hp') {
    if (p.potions.hp <= 0) { log(G, 'Sem poção de vida.', 'warn'); return; }
    if (p.hp >= st.maxHp) return;
    p.potions.hp--;
    healPlayer(G, p, CONSUMABLES.hpPot.heal + st.maxHp * 0.12);
  } else {
    if (p.potions.mp <= 0) { log(G, 'Sem poção de mana.', 'warn'); return; }
    if (p.mp >= st.maxMp) return;
    p.potions.mp--;
    const gain = CONSUMABLES.mpPot.mana + st.maxMp * 0.1;
    p.mp = Math.min(st.maxMp, p.mp + gain);
    pushEvent(G, { t: 'd', x: p.x, y: p.y, v: '+' + Math.floor(gain), c: '#6f8cff' });
  }
  p.invVer++;
}

// ============================================================
// MAGIAS
// ============================================================
function castSkill(G, p, slotKey, ax, ay, st) {
  const V = VOCATIONS[p.voc];
  const skill = V.skills.find((s) => s.key === slotKey);
  if (!skill) return;
  if (p.skillCd[slotKey] > 0) return;
  if (p.mp < skill.mana) { log(G, 'Mana insuficiente.', 'warn'); return; }
  if (p.status.stun > 0 || p.status.freeze > 0) return;

  p.mp -= skill.mana;
  p.skillCd[slotKey] = skill.cd;
  p.anim.cast = 0.3;

  const aimA = Math.atan2(ay - p.y, ax - p.x);
  p.dir = aimA;
  const power = st.atk * 0.8 + st.ml * 2.0 + p.level * 2;

  if (skill.shake) pushEvent(G, { t: 'shake', v: skill.shake });
  pushEvent(G, { t: 'fx', k: 'cast', x: p.x, y: p.y, c: V.color });

  switch (skill.type) {
    case 'bolt':
      spawnProjectile(G, {
        x: p.x, y: p.y, tx: ax, ty: ay, speed: skill.speed,
        dmg: power * skill.mult, elem: skill.elem, ownerId: p.id, owner: 'player',
        range: skill.range, burn: skill.burn, big: true,
      });
      break;

    case 'wave': {
      const hits = [];
      for (const m of G.monsters) {
        if (m.hp <= 0) continue;
        const dx = m.x - p.x, dy = m.y - p.y;
        const along = dx * Math.cos(aimA) + dy * Math.sin(aimA);
        const side = Math.abs(-dx * Math.sin(aimA) + dy * Math.cos(aimA));
        if (along > -0.4 && along < skill.range && side < skill.width + m.size * 0.3) hits.push(m);
      }
      for (const m of hits) applySkillHit(G, p, m, power * skill.mult, skill, st);
      pushEvent(G, { t: 'fx', k: 'wave', x: p.x, y: p.y, a: aimA, r: skill.range, w: skill.width, c: ELEM_COLOR[skill.elem] });
      break;
    }

    case 'nova': {
      for (const m of G.monsters) {
        if (m.hp <= 0) continue;
        if (dist(m, p) <= skill.radius + m.size * 0.4) applySkillHit(G, p, m, power * skill.mult, skill, st);
      }
      pushEvent(G, { t: 'fx', k: 'nova', x: p.x, y: p.y, r: skill.radius, c: ELEM_COLOR[skill.elem] });
      break;
    }

    case 'ground': {
      G.zones.push({
        id: G.nextId++, x: ax, y: ay, r: skill.radius, elem: skill.elem,
        dmg: power * skill.mult, time: skill.time, tick: skill.tick, tickTimer: 0,
        ownerId: p.id, poison: skill.poison || null, color: ELEM_COLOR[skill.elem],
      });
      pushEvent(G, { t: 'fx', k: 'ground', x: ax, y: ay, r: skill.radius, c: ELEM_COLOR[skill.elem] });
      break;
    }

    case 'heal': {
      const amount = skill.flat + power * skill.power * 0.5;
      let target = p;
      if (skill.ally) {
        let worst = null, worstPct = skill.allyFirst ? 1.01 : (p.hp / st.maxHp);
        // Vale para qualquer tamanho de grupo: varre todos os aliados vivos no raio.
        for (const o of Object.values(G.players)) {
          if (o.dead || o === p) continue;
          if (dist(o, p) > HEAL_ALLY_RADIUS) continue;
          const pct = o.hp / stats(o).maxHp;
          if (pct < worstPct) { worstPct = pct; worst = o; }
        }
        if (worst) target = worst;
      }
      healPlayer(G, target, amount);
      pushEvent(G, { t: 'fx', k: 'heal', x: target.x, y: target.y });
      break;
    }

    case 'buff': {
      p.buffs.push({ ...skill.buff, name: skill.name });
      pushEvent(G, { t: 'fx', k: 'buff', x: p.x, y: p.y, c: V.color });
      if (skill.taunt) {
        for (const m of G.monsters) {
          if (m.hp > 0 && dist(m, p) <= skill.radius) { m.tauntedBy = p.id; m.tauntTime = TAUNT_TIME; m.aggro = p.id; }
        }
      }
      break;
    }

    case 'dash': {
      const steps = 14;
      let bx = p.x, by = p.y;
      for (let i = 1; i <= steps; i++) {
        const nx = p.x + Math.cos(aimA) * (skill.range * i / steps);
        const ny = p.y + Math.sin(aimA) * (skill.range * i / steps);
        if (collides(G.map, nx, ny, 0.3)) break;
        bx = nx; by = ny;
      }
      pushEvent(G, { t: 'fx', k: 'dash', x: p.x, y: p.y, x2: bx, y2: by, c: V.color });
      p.x = bx; p.y = by;
      break;
    }
    default: break;
  }
}

function applySkillHit(G, p, m, dmg, skill, st) {
  const crit = Math.random() < st.crit;
  hitMonster(G, m, dmg * (crit ? 1.8 : 1), skill.elem, p, { crit });
  if (m.hp <= 0) return;
  if (skill.stun) m.status.stun = Math.max(m.status.stun, skill.stun);
  if (skill.freeze) m.status.freeze = Math.max(m.status.freeze, skill.freeze);
  if (skill.slow) { m.status.slow = Math.max(m.status.slow, skill.slow.time); m.status.slowMult = skill.slow.mult; }
  if (skill.burn) { m.status.burn = Math.max(m.status.burn, skill.burn.time); m.status.burnDps = skill.burn.dps + st.ml; }
  if (skill.poison) { m.status.poison = Math.max(m.status.poison, skill.poison.time); m.status.poisonDps = skill.poison.dps + st.ml * 0.5; }
}

// ============================================================
// COMBATE
// ============================================================
export function hitMonster(G, m, raw, elem, source, opts = {}) {
  if (m.hp <= 0) return 0;
  const mult = elemMult(elem, m);
  const dmg = Math.max(1, Math.floor((raw * mult) - m.def * 0.45));
  m.hp -= dmg;
  m.hitFlash = 0.15;
  if (source && source.id) {
    m.aggro = m.tauntedBy || source.id;
    const sp = G.players[source.id];
    if (sp) {
      sp.dmgDone += dmg;
      const st = stats(sp);
      // Também pelo funil: o roubo de vida é cura recebida e o wither tem de
      // pegá-lo, senão o status é anulado por quem tem equipamento com leech.
      if (st.leech > 0) healPlayer(G, sp, dmg * st.leech, { silent: true });
    }
  }
  pushEvent(G, {
    t: 'd', x: m.x, y: m.y, v: String(dmg),
    c: opts.crit ? '#ffd84d' : ELEM_COLOR[elem], crit: !!opts.crit,
    big: mult > 1.2,
  });
  if (m.hp <= 0) killMonster(G, m, source);
  return dmg;
}

function killMonster(G, m, source) {
  m.hp = 0;
  m.deathFade = 0.6;
  // Morrer no meio da telegrafia não resolve o golpe: o grupo que derrubou o
  // chefe a tempo não pode levar o ataque de um cadáver.
  cancelWindup(m);
  pushEvent(G, { t: 'fx', k: 'death', x: m.x, y: m.y, c: m.color, boss: m.isBoss });

  const living = Object.values(G.players).filter((p) => !p.dead);
  const share = xpShare(living.length);
  for (const p of living) {
    if (dist(p, m) > XP_RADIUS) continue;
    gainXp(G, p, Math.max(1, Math.floor(m.xp * share)));
  }
  if (source && G.players[source.id]) G.players[source.id].kills++;

  if (m.isBoss) {
    log(G, `${m.name} foi derrotado!`, 'boss');
    pushEvent(G, { t: 'shake', v: 20 });
    for (let i = 0; i < 5; i++) dropLoot(G, m, true);
  } else if (!m.summoned) {
    dropLoot(G, m, false);
  }
}

function gainXp(G, p, amount) {
  p.xp += amount;
  pushEvent(G, { t: 'd', x: p.x, y: p.y, v: `+${amount} xp`, c: '#b06bff', small: true });
  let leveled = false;
  while (p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level);
    p.level++;
    leveled = true;
  }
  if (leveled) {
    const st = stats(p);
    p.hp = st.maxHp; p.mp = st.maxMp;
    pushEvent(G, { t: 'fx', k: 'level', x: p.x, y: p.y, id: p.id });
    log(G, `${p.name} alcançou o nível ${p.level}!`, 'level');
  }
}

export function damagePlayer(G, p, raw, elem, opts = {}) {
  if (p.dead) return;
  const st = stats(p);
  let dmg = raw * (1 - st.dmgRes);
  dmg = Math.max(1, dmg - st.def * 0.5);
  if (opts.silent) dmg = raw; // lava e afins ignoram defesa mas não geram número por tick
  p.hp -= dmg;
  p.anim.hurt = 0.2;
  if (!opts.silent) {
    pushEvent(G, { t: 'd', x: p.x, y: p.y, v: String(Math.floor(dmg)), c: '#ff5a4a', player: true });
    pushEvent(G, { t: 'hurt', id: p.id });
  }
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    p.deaths++;
    p.deathTimer = 0;
    p.reviveProg = 0;
    p.buffs.length = 0;
    p.status = emptyStatus();
    // Punição leve: perde parte do ouro, não o inventário. Ninguém quer perder tudo jogando com a namorada.
    const lost = Math.floor(p.gold * DEATH_GOLD_LOSS);
    p.gold -= lost;
    pushEvent(G, { t: 'fx', k: 'playerDeath', x: p.x, y: p.y, id: p.id });
    log(G, `${p.name} tombou. Um aliado pode reerguê-lo ficando por perto.`, 'death');
  }
}

// Ponto único por onde passa toda cura recebida por jogador — poção e magia.
// Existe por causa do funil de `wither`: com dois caminhos de cura, o status
// reduziria um e esqueceria o outro, e a diferença só apareceria em jogo.
// O número que sobe na tela é o ganho real, não o valor pedido: com wither
// ativo mostrar o valor cheio seria mentira para o jogador.
// `silent`: cura contínua (regeneração, roubo de vida) não sobe número, senão
// a tela vira uma coluna de `+0` a 30 quadros por segundo. O funil vale igual
// para ela — o que muda é só o feedback.
export function healPlayer(G, p, amount, opts = {}) {
  if (p.dead || !(amount > 0)) return 0;
  const st = stats(p);
  const eff = p.status.wither > 0 ? amount * WITHER_HEAL_MULT : amount;
  const before = p.hp;
  p.hp = Math.min(st.maxHp, p.hp + eff);
  const gained = p.hp - before;
  if (!opts.silent && gained > 0) {
    pushEvent(G, { t: 'd', x: p.x, y: p.y, v: '+' + Math.floor(gained), c: '#7de08a' });
  }
  return gained;
}

// ============================================================
// MONSTROS
// ============================================================
function updateMonster(G, m, dt) {
  if (m.hp <= 0) {
    if (m.deathFade > 0) m.deathFade -= dt;
    return;
  }
  m.hitFlash = Math.max(0, m.hitFlash - dt);
  if (collides(G.map, m.x, m.y, 0.3)) {
    const spot = findFreeSpot(G.map, m.x, m.y, 2);
    m.x = spot.x; m.y = spot.y;
  }
  m.cd -= dt;
  m.special -= dt;
  if (m.tauntTime > 0) { m.tauntTime -= dt; if (m.tauntTime <= 0) m.tauntedBy = null; }
  tickStatus(G, m, dt, false);
  if (m.hp <= 0) return;
  if (m.status.stun > 0 || m.status.freeze > 0) {
    // Atordoado ou congelado no meio da janela, o golpe telegrafado morre sem
    // resolver: quem gastou o controle no chefe precisa ver o ataque sumir.
    cancelWindup(m);
    return;
  }

  // Alvo
  let target = null;
  if (m.tauntedBy && G.players[m.tauntedBy] && !G.players[m.tauntedBy].dead) target = G.players[m.tauntedBy];
  if (!target && m.aggro && G.players[m.aggro] && !G.players[m.aggro].dead) {
    const a = G.players[m.aggro];
    if (dist(a, m) < m.vision * 1.8) target = a;
  }
  if (!target) {
    let best = null, bestD = m.vision;
    for (const p of Object.values(G.players)) {
      if (p.dead) continue;
      const d = dist(p, m);
      if (d < bestD) { bestD = d; best = p; }
    }
    target = best;
    if (target) m.aggro = target.id;
  }

  const speedMult = m.status.slow > 0 ? m.status.slowMult : 1;
  const enraged = m.enrage && m.hp < m.maxHp * 0.4;
  const speed = m.speed * speedMult * (enraged ? 1.35 : 1) * dt;

  if (!target) {
    // Perder o alvo no meio da carga não pode congelar a janela: `m.windup` só
    // desce depois deste return, então o golpe ficaria estacionado e resolveria
    // muito depois, na posição nova do monstro e sem nenhum anel na tela. Isso
    // quebraria a promessa de RF-07 — nada acerta sem aviso. Cancelar é o mesmo
    // desfecho que RF-09 já dá para morte, atordoamento e congelamento.
    if (m.windup > 0) cancelWindup(m);
    // Ronda preguiçosa perto de casa
    if (m.cd <= 0) {
      m.cd = 1.5 + Math.random() * 2;
      m.wander = Math.random() * Math.PI * 2;
    }
    if (m.wander !== undefined && Math.hypot(m.x - m.home.x, m.y - m.home.y) < 4) {
      moveEntity(G.map, m, Math.cos(m.wander) * speed * 0.4, Math.sin(m.wander) * speed * 0.4, 0.3);
    }
    return;
  }

  const d = dist(target, m);
  m.dir = Math.atan2(target.y - m.y, target.x - m.x);

  const attackRange = m.ai === 'ranged' || m.ai === 'caster' || m.ai === 'boss' ? 7.5 : 0.9 + m.size * 0.4;
  const keepAway = (m.ai === 'ranged' || m.ai === 'caster') ? 4.0 : 0;

  // Golpe carregado: dá tempo do jogador reagir. Com windupKind, a janela é a
  // telegrafia do ataque perigoso e nada acontece até ela fechar — nenhum dano,
  // nenhum projétil.
  if (m.windup > 0) {
    m.windup -= dt;
    if (m.windup <= 0) {
      const kind = m.windupKind;
      cancelWindup(m);
      if (kind) resolveBossSpecial(G, m, kind, target);
      else resolveMonsterAttack(G, m, target, attackRange);
    }
    return;
  }

  if (d > attackRange * 0.95) {
    followFlow(G, m, speed, target);
  } else if (keepAway && d < keepAway) {
    moveEntity(G.map, m, -Math.cos(m.dir) * speed * 0.8, -Math.sin(m.dir) * speed * 0.8, 0.3);
  }

  // O ataque perigoso tem precedência sobre o golpe básico: os dois na mesma
  // janela empilhariam duas telegrafias no mesmo anel.
  if (m.ai === 'boss' && m.special <= 0) startBossSpecial(G, m, target);

  if (d <= attackRange && m.cd <= 0 && m.windup <= 0) {
    m.cd = m.ai === 'boss' ? 1.5 : (m.ai === 'caster' || m.ai === 'ranged' ? 2.2 : 1.4);
    m.windup = m.windupTotal = m.ai === 'boss' ? BOSS_WINDUP : MONSTER_WINDUP;
    m.windupKind = null;
    m.windupTarget = target.id;
    pushEvent(G, { t: 'fx', k: 'windup', x: m.x, y: m.y, id: m.id });
  }
}

// Fecha a fase de carga sem resolver nada. Um lugar só porque são três os
// caminhos que cancelam (morte, atordoamento, congelamento) e um deles
// esquecido deixaria o chefe preso numa telegrafia que nunca fecha.
function cancelWindup(m) {
  m.windup = 0;
  m.windupTotal = 0;
  m.windupKind = null;
}

// Área ameaçada em tiles, para o aviso desenhar o tamanho certo. Sai da própria
// declaração do especial: quem muda o raio na tabela de conteúdo muda o aviso
// junto, sem tocar em sim.js.
// Raio ameaçado que o anel de telegrafia desenha. Todo especial precisa
// devolver um número > 0: com 0 o anel não desenha nada e o golpe chega sem
// aviso nenhum, que é exatamente o que RF-07 proíbe.
function specialRadius(sp) {
  return sp.r || sp.range || 0;
}

// Abre a telegrafia do ataque perigoso. Nada é resolvido aqui — nem dano, nem
// projétil, nem invocação: tudo espera o fim da janela em resolveBossSpecial().
function startBossSpecial(G, m, target) {
  const type = MONSTER_BY_ID[m.typeId];
  const kit = bossSpecials(type, m.hardcore);
  if (!kit.length) return;
  // G.rng e não Math.random(): o host é autoritativo, então o sorteio global
  // não era bug de correção, mas impedia medir o kit do chefe com seed fixa.
  const sp = G.rng.pick(kit);
  m.special = BOSS_SPECIAL_CD;
  m.windup = m.windupTotal = BOSS_TELEGRAPH_TIME;
  m.windupKind = sp.id;
  m.windupTarget = target.id;
  // Uma única vez, no primeiro tique da fase: o aviso é o que dá ao grupo a
  // chance de sair da área, então repeti-lo por tique só entupiria a fila.
  pushEvent(G, {
    t: 'fx', k: 'telegraph', id: m.id, x: m.x, y: m.y,
    r: specialRadius(sp), d: BOSS_TELEGRAPH_TIME, c: ELEM_COLOR[m.elem], boss: 1,
  });
}

// Fim da janela: agora o golpe existe no mundo.
function resolveBossSpecial(G, m, id, target) {
  const type = MONSTER_BY_ID[m.typeId];
  const sp = ((type && type.specials) || []).find((x) => x.id === id);
  if (!sp) return;
  switch (sp.kind) {
    case 'nova': {
      for (const p of Object.values(G.players)) {
        if (p.dead) continue;
        if (dist(p, m) < sp.r) damagePlayer(G, p, m.atk * sp.mult, m.elem);
      }
      pushEvent(G, { t: 'fx', k: 'nova', x: m.x, y: m.y, r: sp.r, c: ELEM_COLOR[m.elem] });
      pushEvent(G, { t: 'shake', v: sp.shake });
      break;
    }
    case 'burst': {
      for (let i = 0; i < sp.count; i++) {
        const a = (i / sp.count) * Math.PI * 2;
        spawnProjectile(G, {
          x: m.x, y: m.y, tx: m.x + Math.cos(a) * sp.range, ty: m.y + Math.sin(a) * sp.range,
          speed: sp.speed, dmg: m.atk * sp.mult, elem: m.elem, ownerId: m.id,
          owner: 'monster', range: sp.range, big: true,
          bossElem: m.isBoss ? m.elem : null,
        });
      }
      break;
    }
    case 'summon': {
      const pool = MONSTERS.filter((t) => t.tier <= sp.tierMax);
      for (let i = 0; i < sp.count; i++) {
        const t = G.rng.pick(pool);
        const spot = findFreeSpot(G.map, m.x, m.y, sp.r);
        const s = makeMonster(G, t, spot.x, spot.y, m.level - 1);
        s.summoned = true;
        s.aggro = target ? target.id : null;
        G.monsters.push(s);
        pushEvent(G, { t: 'fx', k: 'summon', x: s.x, y: s.y });
      }
      log(G, `${m.name} invoca lacaios!`, 'boss');
      break;
    }
    case 'zone': {
      // Zona do chefe: a de jogador bate em monstro, esta bate em jogador. O
      // campo `owner` é o que separa os dois lados em updateZones.
      G.zones.push({
        id: G.nextId++, x: m.x, y: m.y, r: sp.r, elem: m.elem,
        dmg: m.atk * sp.mult, time: sp.time, tick: sp.tick, tickTimer: 0,
        ownerId: m.id, owner: 'monster', poison: null, color: ELEM_COLOR[m.elem],
      });
      pushEvent(G, { t: 'fx', k: 'ground', x: m.x, y: m.y, r: sp.r, c: ELEM_COLOR[m.elem] });
      break;
    }
    default: break;
  }
}

function resolveMonsterAttack(G, m, target, attackRange) {
  const p = G.players[m.windupTarget] || target;
  if (!p || p.dead) return;
  const d = dist(p, m);
  if (m.ai === 'ranged' || m.ai === 'caster' || m.ai === 'boss') {
    spawnProjectile(G, {
      x: m.x, y: m.y, tx: p.x, ty: p.y, speed: 9,
      dmg: m.atk, elem: m.elem, ownerId: m.id, owner: 'monster', range: 12,
      // O chefe ataca de longe: sem carimbar o elemento aqui, o status teria de
      // ser decidido no impacto procurando o dono na lista de monstros.
      bossElem: m.isBoss ? m.elem : null,
    });
  } else if (d <= attackRange + 0.5) {
    damagePlayer(G, p, m.atk, m.elem);
    pushEvent(G, { t: 'fx', k: 'slash', x: p.x, y: p.y, a: m.dir, c: m.color });
    if (m.lifesteal) m.hp = Math.min(m.maxHp, m.hp + m.atk * m.lifesteal);
    if (m.poison) { p.status.poison = Math.max(p.status.poison, m.poison.time); p.status.poisonDps = m.poison.dps; }
    // Inalcançável hoje: todo chefe de BOSSES tem `ai: 'boss'` e sai pelo ramo
    // do projétil acima, onde o status vem de `pr.bossElem`. Fica aqui porque é
    // o ponto certo caso um chefe futuro nasça corpo a corpo — sem esta linha
    // ele perderia o status do próprio elemento sem nada apontar o porquê.
    if (m.isBoss) applyBossStatus(G, p, m.elem);
  }
}

// Status do elemento do chefe no jogador atingido. O mapeamento vem inteiro de
// ELEM_STATUS (js/data.js) e a magnitude de BOSS_STATUS_MAG (js/balance.js):
// nenhum `if` por elemento mora aqui, senão o acerto corpo a corpo e o impacto
// do projétil manteriam duas cópias da mesma regra.
// Elemento sem entrada no mapa (PHYS, ENERGY, HOLY) não marca — é por projeto.
function applyBossStatus(G, p, elem) {
  if (p.dead) return;
  const key = ELEM_STATUS[elem];
  const mag = key && BOSS_STATUS_MAG[key];
  if (!mag) return;
  // Math.max: um segundo acerto renova a janela, nunca a encurta.
  p.status[key] = Math.max(p.status[key], mag.time);
  // Os status de dano por tempo guardam o DPS ao lado do tempo (burnDps,
  // poisonDps); os de controle puro não têm campo equivalente.
  if (mag.dps) p.status[key + 'Dps'] = Math.max(p.status[key + 'Dps'] || 0, mag.dps);
}

// Desce o gradiente do campo de fluxo; se travar, tenta ir reto.
function followFlow(G, m, speed, target) {
  const map = G.map;
  const mx = Math.floor(m.x), my = Math.floor(m.y);
  const flow = G.flow;
  let bestX = 0, bestY = 0, bestD = flow ? flow[my * map.w + mx] : -1;
  if (bestD >= 0 && flow) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = mx + dx, ny = my + dy;
        if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
        if (dx && dy && (collides(map, nx + 0.5, my + 0.5, 0.3) || collides(map, mx + 0.5, ny + 0.5, 0.3))) continue;
        const nd = flow[ny * map.w + nx];
        if (nd < 0) continue;
        if (nd < bestD) { bestD = nd; bestX = dx; bestY = dy; }
      }
    }
  }
  let dirX, dirY;
  if (bestX || bestY) {
    // mira o centro do tile alvo para não raspar em quina
    const tx = mx + bestX + 0.5, ty = my + bestY + 0.5;
    const a = Math.atan2(ty - m.y, tx - m.x);
    dirX = Math.cos(a); dirY = Math.sin(a);
  } else {
    dirX = Math.cos(m.dir); dirY = Math.sin(m.dir);
  }
  moveEntity(G.map, m, dirX * speed, dirY * speed, 0.3);
}

function tickStatus(G, e, dt, isPlayer) {
  const s = e.status;
  if (s.burn > 0) {
    s.burn -= dt;
    const dmg = s.burnDps * dt;
    if (isPlayer) damagePlayer(G, e, dmg, E.FIRE, { silent: true });
    else { e.hp -= dmg; if (e.hp <= 0) killMonster(G, e, null); }
  }
  if (s.poison > 0) {
    s.poison -= dt;
    const dmg = s.poisonDps * dt;
    if (isPlayer) damagePlayer(G, e, dmg, E.EARTH, { silent: true });
    else { e.hp -= dmg; if (e.hp <= 0) killMonster(G, e, null); }
  }
  if (s.wither > 0) {
    // Zera de fato no fim, em vez de ficar negativo como burn/poison: quem lê
    // este campo é healPlayer(), e "expirou" precisa ser exatamente 0 para a
    // cura voltar cheia sem depender do sinal.
    s.wither = Math.max(0, s.wither - dt);
    const dmg = WITHER_DPS * dt;
    if (isPlayer) damagePlayer(G, e, dmg, E.DEATH, { silent: true });
    else { e.hp -= dmg; if (e.hp <= 0) killMonster(G, e, null); }
  }
  if (s.slow > 0) s.slow -= dt;
  if (s.stun > 0) s.stun -= dt;
  if (s.freeze > 0) s.freeze -= dt;
}

// ============================================================
// PROJÉTEIS E ZONAS
// ============================================================
function spawnProjectile(G, o) {
  const a = Math.atan2(o.ty - o.y, o.tx - o.x);
  G.projectiles.push({
    id: G.nextId++,
    x: o.x, y: o.y,
    vx: Math.cos(a) * o.speed, vy: Math.sin(a) * o.speed,
    dmg: o.dmg, elem: o.elem, owner: o.owner, ownerId: o.ownerId,
    life: (o.range || 8) / o.speed, homing: o.homing || 0,
    burn: o.burn || null, big: !!o.big, a,
    bossElem: o.bossElem == null ? null : o.bossElem,
  });
}

function updateProjectiles(G, dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    pr.life -= dt;
    if (pr.homing) {
      const t = G.monsters.find((m) => m.id === pr.homing && m.hp > 0);
      if (t) {
        const want = Math.atan2(t.y - pr.y, t.x - pr.x);
        const cur = Math.atan2(pr.vy, pr.vx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const speed = Math.hypot(pr.vx, pr.vy);
        const na = cur + Math.max(-6 * dt, Math.min(6 * dt, diff));
        pr.vx = Math.cos(na) * speed; pr.vy = Math.sin(na) * speed;
        pr.a = na;
      }
    }
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;

    if (pr.life <= 0 || collides(G.map, pr.x, pr.y, 0.1)) {
      pushEvent(G, { t: 'fx', k: 'impact', x: pr.x, y: pr.y, c: ELEM_COLOR[pr.elem] });
      G.projectiles.splice(i, 1);
      continue;
    }

    if (pr.owner === 'player') {
      const src = G.players[pr.ownerId];
      for (const m of G.monsters) {
        if (m.hp <= 0) continue;
        if (Math.hypot(m.x - pr.x, m.y - pr.y) > 0.45 + m.size * 0.35) continue;
        const st = src ? stats(src) : { crit: 0 };
        const crit = Math.random() < (st.crit || 0);
        hitMonster(G, m, pr.dmg * (crit ? 1.8 : 1), pr.elem, src, { crit });
        if (pr.burn && m.hp > 0) { m.status.burn = Math.max(m.status.burn, pr.burn.time); m.status.burnDps = pr.burn.dps; }
        pushEvent(G, { t: 'fx', k: 'impact', x: pr.x, y: pr.y, c: ELEM_COLOR[pr.elem] });
        G.projectiles.splice(i, 1);
        break;
      }
    } else {
      for (const p of Object.values(G.players)) {
        if (p.dead) continue;
        if (Math.hypot(p.x - pr.x, p.y - pr.y) > 0.45) continue;
        damagePlayer(G, p, pr.dmg, pr.elem);
        if (pr.bossElem != null) applyBossStatus(G, p, pr.bossElem);
        pushEvent(G, { t: 'fx', k: 'impact', x: pr.x, y: pr.y, c: ELEM_COLOR[pr.elem] });
        G.projectiles.splice(i, 1);
        break;
      }
    }
  }
}

function updateZones(G, dt) {
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i];
    z.time -= dt;
    z.tickTimer -= dt;
    if (z.tickTimer <= 0) {
      z.tickTimer = z.tick;
      if (z.owner === 'monster') {
        for (const p of Object.values(G.players)) {
          if (p.dead) continue;
          if (Math.hypot(p.x - z.x, p.y - z.y) > z.r) continue;
          damagePlayer(G, p, z.dmg, z.elem);
        }
        if (z.time <= 0) G.zones.splice(i, 1);
        continue;
      }
      const owner = G.players[z.ownerId];
      for (const m of G.monsters) {
        if (m.hp <= 0) continue;
        if (Math.hypot(m.x - z.x, m.y - z.y) > z.r + m.size * 0.3) continue;
        hitMonster(G, m, z.dmg, z.elem, owner, {});
        if (z.poison && m.hp > 0) {
          m.status.poison = Math.max(m.status.poison, z.poison.time);
          m.status.poisonDps = z.poison.dps;
        }
      }
    }
    if (z.time <= 0) G.zones.splice(i, 1);
  }
}

// ============================================================
// LOOT E INVENTÁRIO
// ============================================================
function dropLoot(G, m, guaranteed) {
  const rng = G.rng;
  const floor = G.floor;
  G.items.push({
    id: G.nextId++, kind: 'gold', x: m.x + rng.range(-0.3, 0.3), y: m.y + rng.range(-0.3, 0.3),
    amount: Math.floor((6 + m.level * 4) * rng.range(0.7, 1.5)), glyph: 'gold', rarity: 'common', name: 'Ouro',
  });
  if (rng.chance(0.3)) {
    const isHp = rng.chance(0.6);
    G.items.push({
      id: G.nextId++, kind: 'potion', potion: isHp ? 'hp' : 'mp',
      x: m.x + rng.range(-0.5, 0.5), y: m.y + rng.range(-0.5, 0.5),
      glyph: isHp ? 'potionRed' : 'potionBlue', rarity: 'common',
      name: isHp ? 'Poção de Vida' : 'Poção de Mana', amount: 1,
    });
  }
  const dropChance = guaranteed ? 1 : (m.isBoss ? 1 : 0.26 + Math.min(0.15, floor * 0.012));
  if (rng.chance(dropChance)) {
    const item = rollItem(G, m.level + (m.isBoss ? 4 : 0), m.isBoss);
    item.x = m.x + rng.range(-0.6, 0.6);
    item.y = m.y + rng.range(-0.6, 0.6);
    G.items.push(item);
  }
}

export function rollItem(G, ilvl, forceGood = false) {
  const rng = G.rng;
  const base = rng.pick(ITEM_BASES);
  const weights = RARITY_ORDER.map((r) => [r, forceGood
    ? (r === 'common' ? 5 : RARITY[r].weight * 3)
    : RARITY[r].weight]);
  const rarity = rng.weighted(weights);
  const R = RARITY[rarity];
  const scale = (1 + ilvl * 0.16) * R.mult;

  const item = {
    id: G.nextId++, kind: 'equip', baseId: base.id, slot: base.slot,
    name: base.name, glyph: base.glyph, rarity, ilvl,
    forVoc: base.forVoc || null,
    atk: base.atk ? Math.max(1, Math.round(base.atk * scale)) : 0,
    def: base.def ? Math.max(1, Math.round(base.def * scale)) : 0,
    ml: base.ml ? Math.max(1, Math.round(base.ml * scale)) : 0,
    hp: base.hp ? Math.round(base.hp * scale) : 0,
    mp: base.mp ? Math.round(base.mp * scale) : 0,
    speed: base.speed ? +(base.speed * Math.min(1.6, R.mult)).toFixed(2) : 0,
    atkSpeed: base.atkSpeed || 0,
    crit: 0, leech: 0,
    affixes: [],
  };

  const used = new Set();
  for (let i = 0; i < R.affixes; i++) {
    const aff = rng.pick(AFFIXES);
    if (used.has(aff.id)) continue;
    used.add(aff.id);
    let v = rng.range(aff.min, aff.max) * (1 + ilvl * 0.05);
    if (aff.pct) v = Math.min(0.35, v);
    v = aff.pct || aff.dec ? +v.toFixed(aff.pct ? 3 : 2) : Math.round(v);
    item[aff.stat] = (item[aff.stat] || 0) + v;
    item.affixes.push({ id: aff.id, name: aff.name, stat: aff.stat, value: v, pct: !!aff.pct });
  }
  if (item.affixes.length) item.name = `${base.name} ${item.affixes[0].name}`;
  return item;
}

function grabItem(G, p, it) {
  if (it.kind === 'gold') {
    p.gold += it.amount;
    pushEvent(G, { t: 'd', x: p.x, y: p.y, v: `+${it.amount}`, c: '#ffcf6b', small: true });
    p.invVer++;
    return true;
  }
  if (it.kind === 'potion') {
    const key = it.potion;
    if (p.potions[key] >= POTION_STACK) return false;
    p.potions[key]++;
    p.invVer++;
    return true;
  }
  const slot = p.inv.indexOf(null);
  if (slot === -1) {
    if (!p.bagWarned || G.time - p.bagWarned > 5) {
      log(G, `${p.name}: mochila cheia.`, 'warn');
      p.bagWarned = G.time;
    }
    return false;
  }
  p.inv[slot] = it;
  p.invVer++;
  // x/y viajam no evento: quem desenha o brilho é o cliente, e o convidado não
  // tem como resolver a posição de um id de jogador antes do próximo snapshot.
  pushEvent(G, { t: 'loot', id: p.id, x: p.x, y: p.y, rarity: it.rarity, name: it.name });
  log(G, `${p.name} pegou ${it.name} [${RARITY[it.rarity].name}]`, 'loot');
  // Equipa sozinho se o espaço está vazio e a vocação permite — menos fricção pra quem tá começando.
  if (!p.equip[it.slot] && canUse(p, it)) equipFromInv(G, p, slot);
  return true;
}

export function canUse(p, item) {
  if (!item.forVoc) return true;
  return item.forVoc.includes(p.voc);
}

function useInvSlot(G, p, slot) {
  const it = p.inv[slot];
  if (!it) return;
  if (it.kind === 'equip') equipFromInv(G, p, slot);
}

function equipFromInv(G, p, slot) {
  const it = p.inv[slot];
  if (!it || it.kind !== 'equip') return;
  if (!canUse(p, it)) { log(G, `${VOCATIONS[p.voc].name} não usa ${it.name}.`, 'warn'); return; }
  const old = p.equip[it.slot];
  p.equip[it.slot] = it;
  p.inv[slot] = old || null;
  p.invVer++;
  const st = stats(p);
  p.hp = Math.min(p.hp, st.maxHp);
  p.mp = Math.min(p.mp, st.maxMp);
}

function unequip(G, p, slot) {
  const it = p.equip[slot];
  if (!it) return;
  const free = p.inv.indexOf(null);
  if (free === -1) { log(G, 'Mochila cheia.', 'warn'); return; }
  p.inv[free] = it;
  p.equip[slot] = null;
  p.invVer++;
  const st = stats(p);
  p.hp = Math.min(p.hp, st.maxHp);
  p.mp = Math.min(p.mp, st.maxMp);
}

function dropInvSlot(G, p, slot) {
  const it = p.inv[slot];
  if (!it) return;
  p.inv[slot] = null;
  p.invVer++;
  it.x = p.x + (Math.random() - 0.5) * 0.6;
  it.y = p.y + (Math.random() - 0.5) * 0.6;
  G.items.push(it);
}

// Vender tudo que não é lendário — atalho de conforto no portal.
export function sellJunk(G, p) {
  let total = 0;
  for (let i = 0; i < p.inv.length; i++) {
    const it = p.inv[i];
    if (!it || it.kind !== 'equip') continue;
    if (it.rarity === 'legendary') continue;
    total += Math.floor((it.ilvl + 1) * 6 * RARITY[it.rarity].mult);
    p.inv[i] = null;
  }
  p.gold += total;
  p.invVer++;
  if (total) log(G, `${p.name} vendeu itens por ${total} de ouro.`, 'loot');
  return total;
}

// ============================================================
// UTILITÁRIOS
// ============================================================
export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

export function nearestMonster(G, x, y, maxDist) {
  let best = null, bestD = maxDist;
  for (const m of G.monsters) {
    if (m.hp <= 0) continue;
    const d = Math.hypot(m.x - x, m.y - y) - m.size * 0.3;
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

// Acha um ponto livre perto de (x,y) — usado por invocações e destravamento.
export function findFreeSpot(map, x, y, radius) {
  if (!collides(map, x, y, 0.32)) return { x, y };
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 0.6 + Math.random() * radius;
    const nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
    if (!collides(map, nx, ny, 0.32)) return { x: nx, y: ny };
  }
  for (let ring = 1; ring <= 6; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        const nx = Math.floor(x) + dx + 0.5, ny = Math.floor(y) + dy + 0.5;
        if (!collides(map, nx, ny, 0.32)) return { x: nx, y: ny };
      }
    }
  }
  return { x: map.spawn.x, y: map.spawn.y };
}

export function collides(map, x, y, r) {
  const pts = [[-r, -r], [r, -r], [-r, r], [r, r]];
  for (const [ox, oy] of pts) {
    const tx = Math.floor(x + ox), ty = Math.floor(y + oy);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
    const t = map.tiles[ty * map.w + tx];
    if (t === T.VOID || t === T.WALL || t === T.BRAZIER) return true;
  }
  return false;
}

export function moveEntity(map, e, dx, dy, r = 0.32) {
  if (dx) { const nx = e.x + dx; if (!collides(map, nx, e.y, r)) e.x = nx; }
  if (dy) { const ny = e.y + dy; if (!collides(map, e.x, ny, r)) e.y = ny; }
}

function pushEvent(G, ev) { G.events.push(ev); }
function log(G, m, c) { G.events.push({ t: 'log', m, c }); }

// Empilham fora do tique: quem chama populate() ou nextFloor() não está dentro
// de step(), então precisa do buffer para o evento sobreviver até a drenagem.
function pushPending(G, ev) { (G.pendingEvents || (G.pendingEvents = [])).push(ev); }
function logPending(G, m, c) { pushPending(G, { t: 'log', m, c }); }

export { pushEvent, log, pushPending, logPending, MAP_W, MAP_H };
