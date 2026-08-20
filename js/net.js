// ============================================================
// CO-OP P2P — o host roda o jogo, o convidado manda comandos.
// Usa WebRTC via PeerJS: nenhum servidor de jogo, nada pra pagar.
// ============================================================
import { MONSTER_BY_ID, ELEM_COLOR } from './data.js';
import { stats } from './sim.js';
import { AOI_RADIUS, NET_EVENT_CAP, SLOW_PEER_BUFFER, SLOW_PEER_STRIKES } from './balance.js';

const PREFIX = 'shadowfall-ashen-';
export const SNAP_HZ = 15;
export const INPUT_HZ = 30;

export const NetMode = { SOLO: 'solo', HOST: 'host', GUEST: 'guest' };

export class Net {
  constructor() {
    this.mode = NetMode.SOLO;
    this.peer = null;
    this.conns = new Map();     // host: peerId -> conn
    this.hostConn = null;       // guest: conexão com o host
    this.code = null;
    this.on = {};               // callbacks
    this.snapTimer = 0;
    this.inputTimer = 0;
    this.lastPing = 0;
    this.ping = 0;
    this.connected = false;
    this.rejected = 0;          // mensagens descartadas por origem inesperada
    this.strikes = new Map();   // peerId -> envios pulados seguidos
    this.aoi = true;            // corte por área de interesse (desligável p/ medir)
    this.bytesOut = 0;          // medição de banda: só contadores, sem custo real
    this.bytesIn = 0;
    this.packetsOut = 0;
  }

  emit(name, ...args) { if (this.on[name]) this.on[name](...args); }

  // Invariante da estrela: o convidado só aceita o que vem da conexão do host;
  // o host só aceita de peer que ele mesmo registrou. Nada de convidado↔convidado.
  acceptFrom(conn) {
    if (this.mode === NetMode.GUEST) return !!conn && conn === this.hostConn;
    return !!conn && this.conns.get(conn.peer) === conn;
  }

  // ---------- HOST ----------
  host(code) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') { reject(new Error('PeerJS não carregou. Verifique sua conexão.')); return; }
      this.mode = NetMode.HOST;
      this.code = code;
      this.peer = new Peer(PREFIX + code, { debug: 0 });
      const timeout = setTimeout(() => reject(new Error('Tempo esgotado ao abrir a sala.')), 15000);

      this.peer.on('open', () => { clearTimeout(timeout); this.connected = true; resolve(code); });
      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        if (err.type === 'unavailable-id') reject(new Error('Esse código já está em uso. Tente outro.'));
        else if (!this.connected) reject(err);
        else this.emit('error', err);
      });
      this.peer.on('connection', (conn) => {
        conn.on('open', () => {
          this.conns.set(conn.peer, conn);
          this.emit('peerOpen', conn.peer);
        });
        conn.on('data', (msg) => {
          if (!this.acceptFrom(conn)) { this.rejected++; return; }
          this.emit('data', msg, conn.peer);
        });
        conn.on('close', () => { this.conns.delete(conn.peer); this.emit('peerLeft', conn.peer); });
        conn.on('error', () => { this.conns.delete(conn.peer); this.emit('peerLeft', conn.peer); });
      });
    });
  }

  // ---------- CONVIDADO ----------
  join(code) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') { reject(new Error('PeerJS não carregou. Verifique sua conexão.')); return; }
      this.mode = NetMode.GUEST;
      this.code = code;
      this.peer = new Peer({ debug: 0 });
      const timeout = setTimeout(() => reject(new Error('Não achei essa sala. Confira o código.')), 20000);

      this.peer.on('open', () => {
        const conn = this.peer.connect(PREFIX + code, { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => { clearTimeout(timeout); this.connected = true; resolve(code); });
        conn.on('data', (msg) => {
          if (!this.acceptFrom(conn)) { this.rejected++; return; }
          this.emit('data', msg, 'host');
        });
        conn.on('close', () => { this.connected = false; this.emit('hostLeft'); });
        conn.on('error', (e) => { if (!this.connected) reject(e); });
      });
      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        if (err.type === 'peer-unavailable') reject(new Error('Sala não encontrada. Confira o código.'));
        else if (!this.connected) reject(err);
        else this.emit('error', err);
      });
    });
  }

  send(msg) {
    if (this.mode === NetMode.GUEST) {
      if (this.hostConn && this.hostConn.open) {
        this.hostConn.send(msg);
        this.packetsOut++;
        this.bytesOut += approxBytes(msg);
      }
      return;
    }
    for (const [id, c] of this.conns) if (c.open) this.trySend(id, c, msg);
  }

  // Um peer que não drena não pode travar o envio aos outros nem o tick do host.
  trySend(id, conn, msg) {
    const buffered = conn.dataChannel?.bufferedAmount ?? 0;
    if (buffered > SLOW_PEER_BUFFER) {
      const n = (this.strikes.get(id) || 0) + 1;
      this.strikes.set(id, n);
      if (n >= SLOW_PEER_STRIKES) {
        this.strikes.delete(id);
        this.dropPeer(id);
        this.emit('peerLeft', id);
      }
      return false;
    }
    this.strikes.set(id, 0);
    try {
      conn.send(msg);
      this.packetsOut++;
      this.bytesOut += approxBytes(msg);
      return true;
    } catch (e) { return false; }
  }

  sendTo(peerId, msg) {
    const c = this.conns.get(peerId);
    if (c && c.open) c.send(msg);
  }

  // Recusa e derruba um peer específico. O motivo vai antes do fecho para o
  // outro lado poder mostrar a mensagem certa em vez de "conexão perdida".
  refuse(peerId, reason) {
    const c = this.conns.get(peerId);
    if (!c) return;
    try { if (c.open) c.send({ t: 'refused', reason }); } catch (e) { /* já caiu */ }
    setTimeout(() => { try { c.close(); } catch (e) { /* ignora */ } this.conns.delete(peerId); }, 250);
  }

  dropPeer(peerId) {
    const c = this.conns.get(peerId);
    if (!c) return;
    try { c.close(); } catch (e) { /* ignora */ }
    this.conns.delete(peerId);
  }

  close() {
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignora */ }
    this.peer = null; this.conns.clear(); this.hostConn = null;
    this.mode = NetMode.SOLO; this.connected = false;
  }

  get snapInterval() { return 1 / SNAP_HZ; }
  get inputInterval() { return 1 / INPUT_HZ; }
}

// ============================================================
// SERIALIZAÇÃO
// ============================================================
const r2 = (v) => Math.round(v * 100) / 100;

// Tamanho aproximado do pacote, só para medição. Não entra no caminho quente:
// o host só chama isso uma vez por envio, com o objeto já montado.
function approxBytes(msg) {
  try { return JSON.stringify(msg).length; } catch (e) { return 0; }
}

// `viewer` recorta o snapshot para um destinatário. Jogadores vão sempre
// inteiros — o HUD de grupo depende disso mesmo com o aliado do outro lado do
// mapa. Só monstro, item, projétil e zona são cortados por distância.
// Ordem fixa das posições de status no pacote, uma só para jogador e monstro.
// Antes o array existia só para monstro e o jogador não mandava status nenhum:
// o convidado congelado pelo chefe não via congelamento, e com o wither ele
// passou a receber metade da cura sem nada na tela explicando por quê.
// Array e não objeto porque a chave repetida por entidade dominaria o pacote.
const STATUS_KEYS = ['burn', 'poison', 'freeze', 'stun', 'wither'];

// Só entra no pacote quando há status ativo — o caso comum é nenhum, e um
// array de zeros por entidade custaria mais que o campo inteiro economiza.
function packStatus(st) {
  if (!st) return null;
  let any = false;
  const out = STATUS_KEYS.map((k) => {
    const v = st[k] || 0;
    if (v > 0) any = true;
    return r2(v);
  });
  return any ? out : null;
}

function unpackStatus(a) {
  const out = {};
  for (let i = 0; i < STATUS_KEYS.length; i++) out[STATUS_KEYS[i]] = (a && a[i]) || 0;
  return out;
}

export function buildSnapshot(G, { viewer = null, aoi = true } = {}) {
  const players = Object.values(G.players);
  const near = (x, y) => {
    if (!aoi || !viewer) return true;
    return Math.abs(viewer.x - x) < AOI_RADIUS && Math.abs(viewer.y - y) < AOI_RADIUS;
  };
  const snap = {
    t: 's', ti: r2(G.time), po: G.portalOpen ? 1 : 0, fl: G.floor,
    pr: G.portalReady | 0, pt: G.portalTotal | 0, ph: r2(G.portalHold || 0),
    P: players.map((p) => {
      const st = stats(p);
      const ps = packStatus(p.status);
      return {
      i: p.id, n: p.name, v: p.voc, x: r2(p.x), y: r2(p.y), d: r2(p.dir),
      h: Math.round(p.hp), m: Math.round(p.mp), mh: st.maxHp, mm: st.maxMp, sp: r2(st.speed),
      l: p.level, xp: p.xp,
      g: p.gold, dd: p.dead ? 1 : 0, rp: r2(p.reviveProg), dt: r2(p.deathTimer),
      ph: p.potions.hp, pm: p.potions.mp,
      a: r2(p.anim.attack), c: r2(p.anim.cast), hu: r2(p.anim.hurt), mv: p.anim.moving ? 1 : 0,
      b: p.buffs.length ? 1 : 0, cd: [p.skillCd.Q, p.skillCd.W, p.skillCd.E, p.skillCd.R].map(r2),
      la: p.lastAct, k: p.kills, op: p.onPortal ? 1 : 0,
      ...(ps ? { s: ps } : null),
      };
    }),
    M: [],
    I: G.items.filter((it) => near(it.x, it.y)).map((it) => ({
      i: it.id, x: r2(it.x), y: r2(it.y), g: it.glyph, r: it.rarity, k: it.kind, n: it.name,
    })),
    R: G.projectiles.filter((pr) => near(pr.x, pr.y)).map((pr) => ({ i: pr.id, x: r2(pr.x), y: r2(pr.y), e: pr.elem, b: pr.big ? 1 : 0 })),
    Z: G.zones.filter((z) => near(z.x, z.y)).map((z) => ({ i: z.id, x: r2(z.x), y: r2(z.y), r: r2(z.r), c: z.color })),
  };

  // Só o que interessa a este destinatário. Sem viewer, cai no comportamento
  // antigo: perto de qualquer jogador.
  for (const m of G.monsters) {
    if (m.hp <= 0 && !(m.deathFade > 0)) continue;
    let visible = false;
    if (viewer && aoi) {
      visible = near(m.x, m.y);
    } else {
      for (const p of players) {
        if (Math.abs(p.x - m.x) < AOI_RADIUS && Math.abs(p.y - m.y) < AOI_RADIUS) { visible = true; break; }
      }
    }
    if (!visible) continue;
    // Campo opcional só entra quando tem valor. O nome vem da tabela de
    // conteúdo no cliente; só o chefe carrega nome próprio no pacote.
    const e = {
      i: m.id, t: m.typeId, x: r2(m.x), y: r2(m.y), d: r2(m.dir),
      h: Math.round(m.hp), mh: m.maxHp, l: m.level,
    };
    if (m.isBoss) { e.b = 1; e.n = m.name; if (m.hardcore) e.hc = 1; }
    if (m.hitFlash > 0) e.f = r2(m.hitFlash);
    if (m.windup > 0) e.w = r2(m.windup);
    if (m.deathFade > 0) e.df = r2(m.deathFade);
    const ms = packStatus(m.status);
    if (ms) e.s = ms;
    snap.M.push(e);
  }
  return snap;
}

// Reconstrói o estado que o renderizador espera, interpolando posições.
export function applySnapshot(view, snap) {
  view.time = snap.ti;
  view.portalOpen = !!snap.po;
  view.portalReady = snap.pr | 0;
  view.portalTotal = snap.pt | 0;
  view.portalHold = snap.ph || 0;
  view.floor = snap.fl;

  const seenP = new Set();
  for (const sp of snap.P) {
    seenP.add(sp.i);
    let p = view.playerMap.get(sp.i);
    if (!p) {
      p = { id: sp.i, x: sp.x, y: sp.y, rx: sp.x, ry: sp.y };
      view.playerMap.set(sp.i, p);
    }
    p.name = sp.n; p.voc = sp.v; p.dir = sp.d;
    p.rx = sp.x; p.ry = sp.y;
    p.hp = sp.h; p.mp = sp.m; p.maxHp = sp.mh; p.maxMp = sp.mm; p.speed = sp.sp;
    p.level = sp.l; p.xp = sp.xp; p.gold = sp.g;
    p.dead = !!sp.dd; p.reviveProg = sp.rp; p.deathTimer = sp.dt;
    p.potions = { hp: sp.ph, mp: sp.pm };
    p.attack = sp.a; p.casting = sp.c; p.hurt = sp.hu > 0; p.moving = !!sp.mv;
    p.buffed = !!sp.b; p.skillCd = { Q: sp.cd[0], W: sp.cd[1], E: sp.cd[2], R: sp.cd[3] };
    p.lastAct = sp.la; p.kills = sp.k; p.onPortal = !!sp.op;
    p.status = unpackStatus(sp.s);
  }
  for (const id of [...view.playerMap.keys()]) if (!seenP.has(id)) view.playerMap.delete(id);

  const seenM = new Set();
  for (const sm of snap.M) {
    seenM.add(sm.i);
    let m = view.monsterMap.get(sm.i);
    const type = MONSTER_BY_ID[sm.t] || {};
    if (!m) {
      m = { id: sm.i, x: sm.x, y: sm.y };
      view.monsterMap.set(sm.i, m);
    }
    m.rx = sm.x; m.ry = sm.y;
    m.dir = sm.d; m.hp = sm.h; m.maxHp = sm.mh; m.level = sm.l; m.isBoss = !!sm.b;
    m.hardcore = !!sm.hc;
    m.hitFlash = sm.f || 0; m.windup = sm.w || 0; m.deathFade = sm.df || 0;
    m.name = sm.n || type.name || '';
    m.shape = type.shape || 'brute';
    m.color = type.color || '#888';
    m.size = type.size || 1;
    m.status = unpackStatus(sm.s);
  }
  for (const id of [...view.monsterMap.keys()]) if (!seenM.has(id)) view.monsterMap.delete(id);

  view.items = snap.I.map((it) => ({ id: it.i, x: it.x, y: it.y, glyph: it.g, rarity: it.r, kind: it.k, name: it.n }));
  view.projectiles = snap.R.map((pr) => ({ id: pr.i, x: pr.x, y: pr.y, elem: pr.e, big: !!pr.b }));
  view.zones = snap.Z.map((z) => ({ id: z.i, x: z.x, y: z.y, r: z.r, color: z.c || ELEM_COLOR[0] }));
}

// Suaviza o movimento entre pacotes: sem isso tudo anda a 15fps.
export function interpolate(view, dt, localId, predicted) {
  const k = Math.min(1, dt * 14);
  for (const p of view.playerMap.values()) {
    if (p.id === localId && predicted) {
      const d = Math.hypot(predicted.x - p.rx, predicted.y - p.ry);
      if (d > 2.2) { predicted.x = p.rx; predicted.y = p.ry; }
      else { predicted.x += (p.rx - predicted.x) * Math.min(1, dt * 5); predicted.y += (p.ry - predicted.y) * Math.min(1, dt * 5); }
      p.x = predicted.x; p.y = predicted.y;
    } else {
      p.x += (p.rx - p.x) * k;
      p.y += (p.ry - p.y) * k;
    }
  }
  for (const m of view.monsterMap.values()) {
    m.x += (m.rx - m.x) * k;
    m.y += (m.ry - m.y) * k;
  }
}

// ============================================================
// FILA DE EVENTOS
// ============================================================
// Sob pressão, evento crítico não pode ser cortado: morte, chefe, andar e
// portal são o que explica o que aconteceu. Efeito e número de dano, sim.
const CRITICAL = new Set(['log', 'portal', 'floor', 'levelup']);

export function isCriticalEvent(ev) {
  return CRITICAL.has(ev.t) || (ev.t === 'fx' && (ev.k === 'playerDeath' || ev.k === 'revive')) || !!ev.boss;
}

export function drainEvents(queue, cap = NET_EVENT_CAP) {
  if (queue.length <= cap) return queue.splice(0, queue.length);
  const critical = [];
  const rest = [];
  for (const ev of queue) (isCriticalEvent(ev) ? critical : rest).push(ev);
  queue.length = 0;
  const out = critical.slice(0, cap);
  for (const ev of rest) { if (out.length >= cap) break; out.push(ev); }
  return out;
}
