import {
  createGame, addPlayer, removePlayer, setInput, step, stats, nextFloor, sellJunk, collides, TICK,
} from './sim.js';
import { generateMap, findPath } from './world.js';
import { TILE_W, TILE_H, EQUIP_SLOTS, RARITY } from './data.js';
import { randomSeed, roomCode } from './rng.js';
import {
  cam, drawWorld, drawMinimap, updateFx, handleFxEvent, project, screenToWorld,
  spawnRing, spawnParticles,
} from './render.js';
import { Net, NetMode, buildSnapshot, applySnapshot, interpolate, drainEvents } from './net.js';
import * as Save from './save.js';
import { validateSave, describeReport } from './validate.js';
import { ActionQueue } from './actqueue.js';
import { MAX_PLAYERS, RECONNECT_WINDOW, RECONNECT_RETRY, CHAT_MAX_LEN } from './balance.js';
import { ChatGate } from './chatgate.js';
import { Room } from './room.js';
import { SessionGuard } from './session.js';
import * as UI from './ui.js';

const canvas = UI.el('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const mm = UI.el('minimap');
const net = new Net();

const S = {
  role: 'solo',            // solo | host | guest
  started: false,
  G: null,                 // simulação (host/solo)
  map: null,
  seed: randomSeed(),
  floor: 1,
  localId: 'host',
  name: 'Herói',
  voc: 'knight',
  view: { map: null, monsters: [], players: [], items: [], projectiles: [], zones: [], localId: 'host', targetId: 0, portalOpen: false, floor: 1, playerMap: new Map(), monsterMap: new Map() },
  guest: { inv: new Array(20).fill(null), equip: {}, predicted: null },
  room: new Room(),
  keys: {},
  mouse: { x: 0, y: 0, world: { x: 0, y: 0 }, hasMouse: false },
  stick: { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 },
  moveGoal: null,
  path: [],
  repath: 0,
  targetId: 0,
  netEvents: [],
  snapTimer: 0,
  inputTimer: 0,
  lastInvVer: new Map(),
  saveTimer: 0,
  chatting: false,
  expected: false,        // true quando o fim da sessão já foi explicado
  queued: false,          // esperando a virada de andar para entrar
};

// ============================================================
// TELA
// ============================================================
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  const fit = Math.min(innerWidth / 900, innerHeight / 620);
  cam.zoom = Math.max(0.6, Math.min(1.15, fit)) * dpr;
}
addEventListener('resize', resize);
resize();

// ============================================================
// MENU
// ============================================================
UI.buildVocationCards((voc) => { S.voc = voc; });
UI.selectVocation('knight');

Save.setWarnHandler((msg) => UI.pushLog(msg, 'warn'));
UI.el('nameInput').value = Save.readName();

const urlCode = new URLSearchParams(location.search).get('sala');
if (urlCode) {
  UI.el('codeInput').value = urlCode.toUpperCase().slice(0, 4);
  UI.setStatus('Convite detectado — escolha a vocação e entre na sala.', 'ok');
}

function readName() {
  return Save.writeName(UI.el('nameInput').value);
}

UI.el('btnSolo').onclick = () => {
  S.name = readName(); S.role = 'solo'; S.localId = 'host';
  startHostGame();
};

UI.el('btnHost').onclick = async () => {
  S.name = readName(); S.role = 'host'; S.localId = 'host';
  UI.setStatus('Abrindo sala…');
  const code = roomCode();
  try {
    await net.host(code);
    UI.el('lobbyCode').textContent = code;
    UI.showScreen('lobby');
    S.room = new Room();
    S.room.admit({ id: 'host', name: S.name, voc: S.voc, isHost: true, state: 'pronto', stateCls: 'ready' });
    renderRoster();
    UI.el('lobbyStatus').textContent = 'Sala aberta. Desça quando quiser.';
  } catch (e) {
    UI.setStatus(e.message || 'Não consegui abrir a sala.', 'err');
    net.close();
  }
};

UI.el('btnJoin').onclick = async () => {
  const code = UI.el('codeInput').value.trim().toUpperCase();
  if (code.length !== 4) { UI.setStatus('O código tem 4 letras.', 'err'); return; }
  S.name = readName(); S.role = 'guest';
  UI.setStatus('Procurando a sala…');
  try {
    await net.join(code);
    net.send({ t: 'join', name: S.name, voc: S.voc, save: loadSave(S.voc) });
    UI.el('lobbyCode').textContent = code;
    UI.showScreen('lobby');
    UI.el('btnStart').classList.add('hidden');
    UI.el('btnLock').classList.add('hidden');
    UI.el('lobbyStatus').textContent = 'Conectado. Esperando o host descer.';
  } catch (e) {
    UI.refuse(e.type === 'peer-unavailable' ? 'notfound' : '', e.message);
    net.close();
  }
};

UI.el('btnCopyLink').onclick = () => {
  const url = `${location.origin}${location.pathname}?sala=${net.code}`;
  navigator.clipboard?.writeText(url).then(
    () => { UI.el('lobbyStatus').textContent = 'Link copiado. Manda pra ela.'; },
    () => { UI.el('lobbyStatus').textContent = url; },
  );
};

UI.el('btnLock').onclick = () => toggleLock();
UI.el('btnRosterLock').onclick = () => toggleLock();
UI.el('btnCloseRoster').onclick = () => UI.toggleRosterPanel(false);
UI.el('crewChip').onclick = () => openRoster();
UI.el('btnLeave').onclick = () => leaveSession();
UI.el('btnQueueLeave').onclick = () => leaveSession();
UI.el('btnQueueVoc').onclick = () => {
  const field = UI.el('queueVocField');
  const abrir = field.classList.contains('hidden');
  field.classList.toggle('hidden', !abrir);
  UI.el('btnQueueVoc').textContent = abrir ? 'Voltar' : 'Trocar vocação';
  UI.el('queueScroll').classList.toggle('hidden', abrir);
};

// Grade própria da fila: a vocação continua trocável até a inserção, então
// ela não respeita a trava que vale para quem já está em partida.
UI.buildVocationCards((voc) => {
  S.voc = voc;
  net.send({ t: 'revoc', voc, save: loadSave(voc) });
  UI.setQueueStatus('Você entra com o progresso de ' + voc + '.', 'ok');
}, 'queueVocGrid', false);

function toggleLock() {
  if (S.role !== 'host') return;
  S.room.setLocked(!S.room.locked);
  net.send({ t: 'lock', locked: S.room.locked });
  UI.pushLog(S.room.locked ? 'Você trancou a sala.' : 'Você destrancou a sala.', 'system');
  renderRoster();
  if (S.started) openRoster(true);
}

function openRoster(refreshOnly) {
  if (!refreshOnly) UI.toggleRosterPanel(true);
  UI.renderRosterPanel(S.room.list(), S.room.queueList(), {
    isHost: S.role === 'host',
    locked: S.room.locked,
    max: S.room.max,
    code: net.code,
    onKick: (id) => kickPlayer(id),
  });
}

// Estado da fila para quem espera: andar atual, posição e as duas listas.
function sendQueueState(peerId) {
  if (S.role !== 'host') return;
  const strip = (e) => ({ id: e.id, name: e.name, voc: e.voc, level: e.level, isHost: !!e.isHost, state: e.state, stateCls: e.stateCls });
  const targets = peerId ? [peerId] : S.room.queue.map((e) => e.id);
  for (const id of targets) {
    net.sendTo(id, {
      t: 'queued',
      floor: S.G?.floor || 1,
      position: S.room.positionOf(id),
      players: S.room.list().map(strip),
      queue: S.room.queueList().map(strip),
    });
  }
}

// Chamado na virada de andar: todo mundo que esperava entra de uma vez, antes
// do cálculo de escala do andar novo.
function drainQueue() {
  if (S.role !== 'host' || !S.G) return 0;
  const entering = S.room.drain();
  for (const e of entering) {
    const gp = addPlayer(S.G, { id: e.id, name: e.name, voc: e.voc });
    // O save é aplicado agora, não na conexão: e revalidado com o andar atual.
    const checked = validateSave(e.save, { floor: S.G.floor });
    applySave(gp, checked.save);
    const note = describeReport(e.name, checked.report);
    if (note) console.info('[sala]', note);
    S.room.update(e.id, { state: 'pronto', stateCls: 'ready' });
    net.sendTo(e.id, { t: 'start', seed: S.seed, floor: S.G.floor });
    UI.pushLog(`${e.name} entrou na masmorra.`, 'system');
  }
  if (entering.length) { renderRoster(); sendQueueState(); }
  return entering.length;
}

function kickPlayer(id) {
  if (S.role !== 'host' || id === 'host') return;
  const p = S.room.players.get(id) || S.room.queue.find((e) => e.id === id);
  net.refuse(id, 'kicked');
  S.room.remove(id);
  if (S.G && S.G.players[id]) removePlayer(S.G, id);
  if (p) UI.pushLog(`${p.name} foi removido da sala.`, 'warn');
  renderRoster();
  openRoster(true);
}

UI.el('btnStart').onclick = () => startHostGame();

// ============================================================
// INÍCIO DE PARTIDA
// ============================================================
function startHostGame() {
  S.seed = randomSeed();
  // O andar já nasce escalado para o tamanho do grupo que vai descer.
  S.G = createGame(S.seed, 1, Math.max(1, S.room.list().filter((p) => !p.pending).length));
  S.map = S.G.map;
  S.floor = 1;
  const me = addPlayer(S.G, { id: 'host', name: S.name, voc: S.voc });
  applySave(me, loadSave(S.voc));

  S.room.started = true;
  for (const lp of S.room.list()) {
    if (lp.id === 'host' || lp.pending) continue;
    const gp = addPlayer(S.G, { id: lp.id, name: lp.name, voc: lp.voc });
    applySave(gp, lp.save);
  }

  net.send({ t: 'start', seed: S.seed, floor: 1 });
  enterGame();
  UI.banner('Andar 1', 'Ashen Realms');
}

function enterGame() {
  S.started = true;
  UI.lockVocation(true);
  UI.showScreen('game');
  UI.buildSkillBar(S.voc, castByKey);
  S.view.localId = S.localId;
  S.view.map = S.map;
  UI.el('roomChip').classList.toggle('hidden', S.role === 'solo');
  UI.el('crewChip').classList.toggle('hidden', S.role === 'solo');
  if (S.role !== 'solo') {
    UI.el('roomChip').textContent = net.code;
    UI.setCapacity('crewChip', S.room.count, S.room.max);
  }
  const local = getLocal();
  if (local) { cam.x = project(local.x, local.y).x; cam.y = project(local.x, local.y).y; }
  UI.pushLog('Use <b>1–4</b> para magias, <b>Q/E</b> para poções, <b>Enter</b> para conversar.', 'system');
  if (S.role !== 'solo') UI.pushLog('Fiquem por perto: quem cai só levanta se alguém chegar junto.', 'system');
}

// ============================================================
// REDE
// ============================================================
net.on.data = (msg, from) => {
  if (S.role === 'guest') return guestMsg(msg);
  return hostMsg(msg, from);
};

function renderRoster() {
  if (!S.started) UI.renderLobby(S.room.list(), S.role === 'host', { max: S.room.max, locked: S.room.locked });
  UI.setCapacity('crewChip', S.room.count, S.room.max);
  UI.el('crewLock').classList.toggle('hidden', !S.room.locked);
  if (S.role === 'host' && net.mode === NetMode.HOST) {
    // Convidado precisa da lista para ver quem está na sala e quem espera.
    const strip = (e) => ({ id: e.id, name: e.name, voc: e.voc, level: e.level, isHost: !!e.isHost, state: e.state, stateCls: e.stateCls });
    net.send({ t: 'roster', players: S.room.list().map(strip), queue: S.room.queueList().map(strip) });
  }
  if (S.started && !UI.el('roster').classList.contains('hidden')) openRoster(true);
}

net.on.peerOpen = (peerId) => {
  const verdict = S.room.canAccept(peerId);
  if (!verdict.ok) { net.refuse(peerId, verdict.reason); return; }
  S.room.admit({ id: peerId, name: '…', voc: 'knight', pending: true, state: 'conectando' });
  renderRoster();
  UI.el('lobbyStatus').textContent = 'Alguém chegou…';
};

net.on.peerLeft = (peerId) => {
  const gone = S.room.players.get(peerId) || S.room.queue.find((e) => e.id === peerId);
  const naFila = S.room.queue.some((e) => e.id === peerId);
  S.room.remove(peerId);
  renderRoster();
  // Quem estava atrás na fila sobe: a posição precisa refletir isso.
  if (naFila || S.room.queue.length) sendQueueState();
  if (gone && !gone.pending && !S.started) UI.el('lobbyStatus').textContent = `${gone.name} saiu.`;
  if (S.G && S.G.players[peerId]) {
    UI.pushLog(`${S.G.players[peerId].name} desconectou.`, 'warn');
    removePlayer(S.G, peerId);
  }
};

net.on.hostLeft = () => {
  if (S.queued) {
    // Ninguém fica preso na tela de espera quando a sala morre.
    S.queued = false;
    net.close();
    UI.showScreen('menu');
    UI.setStatus('O host encerrou a partida. A fila foi desfeita.', 'err');
    return;
  }
  if (!S.started) { UI.setStatus('O host fechou a sala.', 'err'); return; }
  guard.hostLost();
};

// Queda momentânea e saída definitiva são coisas diferentes: primeiro tenta
// voltar, e só declara encerrada quando a janela esgota.
const guard = new SessionGuard({
  onReconnecting: (left, total) => UI.showReconnecting(left, total),
  onRetry: () => tryRejoin(net.code),
  onResumed: () => { UI.hideDrop(); UI.pushLog('Reconectado.', 'system'); },
  onEnded: (title, text) => {
    S.expected = true;
    const saved = S.role === 'guest' ? saveGuestProgress() : saveProgress();
    UI.showEnded(title, text, saved);
  },
});

async function tryRejoin(code) {
  if (guard.state !== 'reconnecting' || !code) return;
  try {
    net.close();
    await net.join(code);
    net.send({ t: 'join', name: S.name, voc: S.voc, save: loadSave(S.voc) });
    guard.rejoined();
  } catch (e) { /* segue tentando até a janela fechar */ }
}

// Sai da sessão sem recarregar: recarregar baixaria fontes e PeerJS de novo
// e apagaria nome e vocação já escolhidos.
function leaveSession() {
  guard.reset();
  if (!S.expected) { if (S.role === 'guest') saveGuestProgress(); else saveProgress(); }
  if (S.role === 'host') net.send({ t: 'bye' });
  net.close();

  S.started = false; S.expected = false; S.queued = false;
  S.role = 'solo'; S.localId = 'host';
  S.G = null; S.map = null;
  S.view.playerMap.clear(); S.view.monsterMap.clear();
  S.view.players = []; S.view.monsters = []; S.view.items = [];
  S.view.projectiles = []; S.view.zones = []; S.view.map = null;
  S.guest = { inv: new Array(20).fill(null), equip: {}, predicted: null };
  S.room = new Room();
  S.netEvents.length = 0; S.lastInvVer.clear();
  S.path = []; S.moveGoal = null; S.targetId = 0;
  S.floor = 1; S.chatting = false;
  actQueue.clear();

  UI.hideDrop();
  UI.toggleRosterPanel(false);
  UI.el('queueVocField').classList.add('hidden');
  UI.el('queueScroll').classList.remove('hidden');
  UI.el('btnQueueVoc').textContent = 'Trocar vocação';
  UI.el('deathOverlay').classList.add('hidden');
  UI.el('bag').classList.add('hidden');
  UI.lockVocation(false);
  UI.showScreen('menu');
  UI.setStatus('');
}

function hostMsg(msg, from) {
  switch (msg.t) {
    case 'join': {
      // O save vem do localStorage do convidado: entrada hostil até ser saneada.
      const checked = validateSave(msg.save, { floor: S.G?.floor || S.floor || 1 });
      const note = describeReport(msg.name, checked.report);
      if (note) console.info('[sala]', note);   // log do host, nunca o chat da sala
      const verdict = S.room.admit({
        id: from, name: msg.name, voc: msg.voc, save: checked.save,
        level: checked.save?.level || 1, state: 'pronto', stateCls: 'ready',
      });
      if (!verdict.ok) { net.refuse(from, verdict.reason); break; }
      renderRoster();
      if (verdict.queued) {
        // Com a partida em curso ninguém nasce no meio do andar: espera a virada.
        S.room.update(from, { state: 'na fila', stateCls: 'queued' });
        UI.pushLog(`${msg.name} está esperando o próximo andar.`, 'system');
        sendQueueState(from);
      } else {
        UI.el('lobbyStatus').textContent = `${msg.name} entrou.`;
      }
      break;
    }
    case 'revoc': {
      // Quem está na fila ainda escolhe a vocação, e com ela o save aplicado.
      const e = S.room.queue.find((q) => q.id === from);
      if (!e) break;
      const rev = validateSave(msg.save, { floor: S.G?.floor || 1 });
      e.voc = msg.voc;
      e.save = rev.save;
      e.level = rev.save?.level || 1;
      renderRoster();
      sendQueueState(from);
      break;
    }
    case 'in':
      if (S.G && S.G.players[from]) setInput(S.G, from, msg);
      break;
    case 'chat': {
      // Antiflood no host, que é a autoridade da sala.
      if (!chatGate.allow(from, S.G ? S.G.time : 0).ok) { net.sendTo(from, { t: 'chatBlocked' }); break; }
      const text = chatGate.clean(msg.m);
      if (!text) break;
      chatLine(msg.name, text);
      net.send({ t: 'chat', name: msg.name, m: text });
      break;
    }
    case 'ping':
      net.sendTo(from, { t: 'pong', ts: msg.ts });
      break;
    default: break;
  }
}

function guestMsg(msg) {
  switch (msg.t) {
    case 'refused':
      // Recusa explicada, não "conexão perdida": o motivo veio do host.
      if (msg.reason === 'kicked' && S.queued) {
        S.queued = false;
        net.close();
        UI.showScreen('menu');
        UI.setStatus('O host removeu você da sala.', 'err');
      } else if (msg.reason === 'kicked') {
        guard.endExpected('Você saiu da sala', 'O host removeu você da partida.');
      } else {
        net.close();
        UI.showScreen('menu');
        UI.refuse(msg.reason);
      }
      break;
    case 'lock':
      S.room.setLocked(msg.locked);
      UI.el('crewLock').classList.toggle('hidden', !msg.locked);
      UI.el('lobbyLock').classList.toggle('hidden', !msg.locked);
      UI.pushLog(msg.locked ? 'O host trancou a sala.' : 'O host destrancou a sala.', 'system');
      break;
    case 'roster':
      S.room.players = new Map(msg.players.map((e) => [e.id, e]));
      S.room.queue = msg.queue || [];
      if (!UI.el('roster').classList.contains('hidden')) openRoster(true);
      UI.setCapacity('crewChip', msg.players.length + (msg.queue?.length || 0), MAX_PLAYERS);
      break;
    case 'bye':
      // Saída deliberada do host: pula a tentativa de reconexão.
      guard.endExpected('Partida encerrada', 'O host encerrou a partida.');
      break;
    case 'queued':
      S.queued = true;
      UI.showScreen('queue');
      UI.renderQueue({
        floor: msg.floor, position: msg.position,
        players: msg.players, queue: msg.queue, myId: net.peer?.id, max: MAX_PLAYERS,
      });
      break;
    case 'start':
      S.queued = false;
      S.seed = msg.seed;
      S.floor = msg.floor;
      S.localId = net.peer.id;
      S.map = generateMap(S.seed, S.floor);
      S.view.playerMap.clear();
      S.view.monsterMap.clear();
      enterGame();
      UI.banner('Andar ' + S.floor, 'Ashen Realms');
      break;
    case 's':
      applySnapshot(S.view, msg);
      if (!S.guest.predicted) {
        const me = S.view.playerMap.get(S.localId);
        if (me) S.guest.predicted = { x: me.rx, y: me.ry };
      }
      if (msg.E) for (const ev of msg.E) applyEvent(ev);
      // Confirma comandos já processados pelo host
      const me = S.view.playerMap.get(S.localId);
      if (me) actQueue.confirm(me.lastAct);
      break;
    case 'inv':
      S.guest.inv = msg.inv;
      S.guest.equip = msg.equip;
      if (UI.el('bag').classList.contains('hidden') === false) renderBag();
      break;
    case 'floor':
      S.floor = msg.floor;
      S.map = generateMap(S.seed, S.floor);
      S.view.map = S.map;
      S.view.monsterMap.clear();
      S.guest.predicted = null;
      actQueue.clear();
      S.path = []; S.moveGoal = null;
      UI.banner('Andar ' + S.floor, 'A masmorra se aprofunda');
      break;
    case 'chat':
      chatLine(msg.name, msg.m);
      break;
    case 'chatBlocked':
      UI.pushLog('Espera um pouco antes de mandar de novo.', 'warn');
      break;
    case 'pong':
      net.ping = Math.round(performance.now() - msg.ts);
      UI.el('pingChip').classList.remove('hidden');
      UI.el('pingChip').textContent = net.ping + ' ms';
      break;
    default: break;
  }
}

function chatLine(name, m) {
  UI.pushLog(`<b>${escapeHtml(name)}:</b> ${escapeHtml(m)}`, 'chat');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============================================================
// EVENTOS DO SIMULADOR → TELA
// ============================================================
function applyEvent(ev) {
  if (ev.t === 'portalReset') { UI.flashPortalReset(); return; }
  if (ev.t === 'log') { UI.pushLog(ev.m, ev.c || 'system'); return; }
  if (ev.t === 'portal') { UI.banner('Portal aberto', 'Sala do chefe'); return; }
  // Brilho na cor da raridade. O evento existia desde sempre e caía no ignore
  // abaixo sem nenhum consumidor: quem pegava um lendário via a mesma tela de
  // quem pegava um item comum.
  if (ev.t === 'loot') {
    const cor = (RARITY[ev.rarity] || RARITY.common).color;
    spawnRing(ev.x, ev.y, 1.4, cor, { life: 0.6, width: 3 });
    spawnParticles(ev.x, ev.y, cor, 14, { speed: 3.2, life: 0.7, size: 2 });
    return;
  }
  // 'bossSpawn' e 'floor' são consumidos fora daqui: o primeiro pela camada de
  // áudio que vai assinar CT-03, o segundo pela mensagem própria do host
  // (net.send({ t: 'floor' }) em hostTick). Sem este ignore os dois desceriam
  // até o default de handleFxEvent.
  if (ev.t === 'hurt' || ev.t === 'respawn' || ev.t === 'bossSpawn' || ev.t === 'floor') return;
  handleFxEvent(ev);
}

// ============================================================
// ENTRADA
// ============================================================
addEventListener('keydown', (e) => {
  if (!S.started) return;
  const k = e.key.toLowerCase();

  if (S.chatting) {
    if (k === 'escape') closeChat();
    return;
  }
  if (k === 'enter') { openChat(); e.preventDefault(); return; }
  if (k === 'escape') { UI.el('bag').classList.add('hidden'); UI.toggleRosterPanel(false); return; }
  if (k === 'p') { openRoster(); return; }

  S.keys[k] = true;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    S.moveGoal = null; S.path = [];
  }
  if (k >= '1' && k <= '4') { castByKey(['Q', 'W', 'E', 'R'][+k - 1]); e.preventDefault(); }
  if (k === 'q') queueAct({ k: 'pot', slot: 'hp' });
  if (k === 'e') queueAct({ k: 'pot', slot: 'mp' });
  if (k === 'tab' || k === 'i') { toggleBag(); e.preventDefault(); }
});
addEventListener('keyup', (e) => { S.keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { S.keys = {}; });

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') S.mouse.hasMouse = true;
  const dpr = canvas.width / innerWidth;
  S.mouse.x = e.clientX * dpr;
  S.mouse.y = e.clientY * dpr;
  S.mouse.world = screenToWorld(S.mouse.x, S.mouse.y, canvas);
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (S.started) castByKey('Q');
});

canvas.addEventListener('pointerdown', (e) => {
  if (!S.started) return;
  const dpr = canvas.width / innerWidth;
  const px = e.clientX * dpr, py = e.clientY * dpr;

  if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.45) {
    S.stick.active = true; S.stick.id = e.pointerId;
    S.stick.ox = e.clientX; S.stick.oy = e.clientY;
    S.stick.dx = 0; S.stick.dy = 0;
    const st = UI.el('stick');
    st.classList.remove('hidden');
    st.style.left = (e.clientX - 64) + 'px';
    st.style.top = (e.clientY - 64) + 'px';
    st.querySelector('i').style.transform = 'translate(0,0)';
    return;
  }

  const w = screenToWorld(px, py, canvas);
  const m = monsterAt(w.x, w.y);
  if (m) {
    S.targetId = m.id;
    S.moveGoal = null; S.path = [];
  } else {
    S.targetId = 0;
    S.moveGoal = { x: w.x, y: w.y };
    S.repath = 0;
  }
});

addEventListener('pointermove', (e) => {
  if (!S.stick.active || e.pointerId !== S.stick.id) return;
  const dx = e.clientX - S.stick.ox, dy = e.clientY - S.stick.oy;
  const len = Math.hypot(dx, dy);
  const max = 54;
  const cl = len > max ? max / len : 1;
  S.stick.dx = (dx * cl) / max;
  S.stick.dy = (dy * cl) / max;
  UI.el('stick').querySelector('i').style.transform = `translate(${dx * cl}px, ${dy * cl}px)`;
});

function endStick(e) {
  if (!S.stick.active || (e && e.pointerId !== S.stick.id)) return;
  S.stick.active = false; S.stick.dx = 0; S.stick.dy = 0;
  UI.el('stick').classList.add('hidden');
}
addEventListener('pointerup', endStick);
addEventListener('pointercancel', endStick);

for (const b of document.querySelectorAll('.slot.potion')) {
  b.onpointerdown = (e) => { e.preventDefault(); queueAct({ k: 'pot', slot: b.dataset.pot }); };
}
UI.el('btnBag').onclick = toggleBag;
UI.el('btnCloseBag').onclick = () => UI.el('bag').classList.add('hidden');
UI.el('btnRespawn').onclick = () => queueAct({ k: 'respawn' });
UI.el('btnSell').onclick = () => {
  if (S.role === 'guest') { queueAct({ k: 'sell' }); return; }
  const p = S.G.players[S.localId];
  sellJunk(S.G, p);
  renderBag();
};

// --- Conversa ---
let chatEl = null;
function openChat() {
  S.chatting = true;
  if (!chatEl) {
    chatEl = document.createElement('input');
    chatEl.id = 'chatInput';
    chatEl.maxLength = 120;
    chatEl.placeholder = 'Falar com o grupo…';
    chatEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        // Trunca antes de enviar: não faz sentido gastar banda do host com
        // texto que ninguém vai ver.
        const m = chatGate.clean(chatEl.value);
        if (m) {
          if (S.role === 'guest') net.send({ t: 'chat', name: S.name, m });
          else { chatLine(S.name, m); net.send({ t: 'chat', name: S.name, m }); }
        }
        closeChat();
      } else if (e.key === 'Escape') closeChat();
    });
    UI.el('game').appendChild(chatEl);
  }
  chatEl.value = '';
  chatEl.classList.remove('hidden');
  chatEl.focus();
}
function closeChat() {
  S.chatting = false;
  if (chatEl) { chatEl.blur(); chatEl.classList.add('hidden'); }
}

// ============================================================
// AÇÕES
// ============================================================
const chatGate = new ChatGate();

const actQueue = new ActionQueue({
  onDrop: (lost) => UI.pushLog(`${lost} ação(ões) descartada(s) — a fila encheu.`, 'warn'),
});

function queueAct(act) {
  if (S.role === 'guest') { actQueue.push(act); return; }
  if (S.G) setInput(S.G, S.localId, { ...localInput(), acts: [actQueue.push(act)] });
}

function castByKey(key) {
  const aim = aimPoint();
  queueAct({ k: 'cast', slot: key, ax: aim.x, ay: aim.y });
}

function aimPoint() {
  const local = getLocal();
  if (!local) return { x: 0, y: 0 };
  if (S.mouse.hasMouse && !S.stick.active) return S.mouse.world;
  const t = S.view.monsters.find((m) => m.id === S.targetId && m.hp > 0)
    || nearestVisibleMonster(local, 9);
  if (t) return { x: t.x, y: t.y };
  const a = local.dir || 0;
  return { x: local.x + Math.cos(a) * 4, y: local.y + Math.sin(a) * 4 };
}

function nearestVisibleMonster(local, range) {
  let best = null, bestD = range;
  for (const m of S.view.monsters) {
    if (m.hp <= 0) continue;
    const d = Math.hypot(m.x - local.x, m.y - local.y);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

function monsterAt(wx, wy) {
  let best = null, bestD = 1.1;
  for (const m of S.view.monsters) {
    if (m.hp <= 0) continue;
    const d = Math.hypot(m.x - wx, m.y - wy);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

// Direção na tela → direção no mundo isométrico.
function screenDirToWorld(sx, sy) {
  if (!sx && !sy) return { x: 0, y: 0 };
  const wx = (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2;
  const wy = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
  const len = Math.hypot(wx, wy) || 1;
  return { x: wx / len, y: wy / len };
}

function localInput() {
  let sx = 0, sy = 0;
  if (S.keys.a || S.keys.arrowleft) sx -= 1;
  if (S.keys.d || S.keys.arrowright) sx += 1;
  if (S.keys.w || S.keys.arrowup) sy -= 1;
  if (S.keys.s || S.keys.arrowdown) sy += 1;
  if (S.stick.active) { sx += S.stick.dx; sy += S.stick.dy; }

  let dir = screenDirToWorld(sx, sy);

  // Clique-para-andar (Tibia): segue o caminho calculado localmente.
  if (!sx && !sy && S.moveGoal) {
    const local = getLocal();
    if (local) {
      while (S.path.length && Math.hypot(S.path[0].x - local.x, S.path[0].y - local.y) < 0.4) S.path.shift();
      if (S.path.length) {
        const a = Math.atan2(S.path[0].y - local.y, S.path[0].x - local.x);
        dir = { x: Math.cos(a), y: Math.sin(a) };
      } else if (Math.hypot(S.moveGoal.x - local.x, S.moveGoal.y - local.y) < 0.6) {
        S.moveGoal = null;
      }
    }
  }

  return { mx: dir.x, my: dir.y, target: S.targetId, acts: [] };
}

function updatePathing(dt) {
  if (!S.moveGoal) return;
  S.repath -= dt;
  if (S.repath > 0) return;
  S.repath = 0.4;
  const local = getLocal();
  if (!local || !S.map) return;
  const found = findPath(S.map, local.x, local.y, S.moveGoal.x, S.moveGoal.y);
  if (found) S.path = found;
  else { S.path = []; S.moveGoal = null; }
}

// ============================================================
// MOCHILA
// ============================================================
function toggleBag() {
  const bag = UI.el('bag');
  const willOpen = bag.classList.contains('hidden');
  bag.classList.toggle('hidden', !willOpen);
  if (willOpen) renderBag();
}

function localPlayerData() {
  if (S.role === 'guest') {
    const v = S.view.playerMap.get(S.localId);
    return {
      voc: v?.voc || S.voc, level: v?.level || 1,
      inv: S.guest.inv, equip: S.guest.equip,
      buffs: [], status: { slow: 0 },
    };
  }
  return S.G?.players[S.localId];
}

function renderBag() {
  const p = localPlayerData();
  if (!p) return;
  UI.renderBag(p, {
    use: (i) => { queueAct({ k: 'use', slot: i }); setTimeout(renderBag, 60); },
    drop: (i) => { queueAct({ k: 'drop', slot: i }); setTimeout(renderBag, 60); },
    unequip: (slot) => { queueAct({ k: 'unequip', slot }); setTimeout(renderBag, 60); },
    stats: () => stats({ voc: p.voc, level: p.level, equip: p.equip, buffs: [], status: { slow: 0 } }),
  });
}

// ============================================================
// SALVAR PROGRESSO
// ============================================================
function saveProgress() {
  const p = S.role === 'guest' ? null : S.G?.players[S.localId];
  if (!p) return false;
  return Save.writeSave(p, S.G.floor);
}

function loadSave(voc) { return Save.loadSave(voc); }

function applySave(p, save) {
  if (!save || save.voc !== p.voc) return;
  p.level = Math.max(1, save.level || 1);
  p.xp = save.xp || 0;
  p.gold = save.gold || 0;
  if (save.equip) for (const s of EQUIP_SLOTS) if (save.equip[s]) p.equip[s] = save.equip[s];
  if (Array.isArray(save.inv)) for (let i = 0; i < Math.min(save.inv.length, p.inv.length); i++) p.inv[i] = save.inv[i];
  if (save.potions) p.potions = { hp: save.potions.hp ?? 8, mp: save.potions.mp ?? 6 };
  const st = stats(p);
  p.hp = st.maxHp; p.mp = st.maxMp;
  p.invVer++;
}

// ============================================================
// VISÃO PARA O RENDERIZADOR
// ============================================================
function getLocal() {
  if (S.role === 'guest') return S.view.playerMap.get(S.localId);
  const p = S.G?.players[S.localId];
  if (!p) return null;
  return viewPlayer(p);
}

function viewPlayer(p) {
  const st = stats(p);
  return {
    id: p.id, name: p.name, voc: p.voc, x: p.x, y: p.y, dir: p.dir,
    hp: p.hp, maxHp: st.maxHp, mp: p.mp, maxMp: st.maxMp,
    level: p.level, xp: p.xp, gold: p.gold, dead: p.dead,
    reviveProg: p.reviveProg, deathTimer: p.deathTimer, potions: p.potions, onPortal: !!p.onPortal,
    attack: p.anim.attack, casting: p.anim.cast, hurt: p.anim.hurt > 0,
    moving: p.anim.moving, buffed: p.buffs.length > 0, skillCd: p.skillCd, kills: p.kills,
    // O convidado recebe o status pelo snapshot; o host lê daqui. Sem isto o
    // desenho de status ficaria só do lado de quem hospeda.
    status: p.status,
  };
}

function buildView() {
  S.view.map = S.map;
  S.view.localId = S.localId;
  S.view.targetId = S.targetId;
  if (S.role === 'guest') {
    S.view.players = [...S.view.playerMap.values()];
    S.view.monsters = [...S.view.monsterMap.values()];
  } else {
    S.view.players = Object.values(S.G.players).map(viewPlayer);
    S.view.monsters = S.G.monsters;
    S.view.items = S.G.items;
    S.view.projectiles = S.G.projectiles;
    S.view.zones = S.G.zones;
    S.view.portalOpen = S.G.portalOpen;
    S.view.portalReady = S.G.portalReady;
    S.view.portalTotal = S.G.portalTotal;
    S.view.portalHold = S.G.portalHold;
    S.view.floor = S.G.floor;
  }
}

// ============================================================
// LOOP
// ============================================================
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.08, (now - last) / 1000);
  last = now;

  if (!S.started) return;
  if (guard.state === 'reconnecting') guard.tick(dt);

  updatePathing(dt);

  if (S.role === 'guest') {
    guestPredict(dt);
    interpolate(S.view, dt, S.localId, S.guest.predicted);
    S.inputTimer -= dt;
    if (S.inputTimer <= 0) {
      S.inputTimer = net.inputInterval;
      const inp = localInput();
      inp.acts = actQueue.toSend();
      net.send({ t: 'in', ...inp });
    }
    S.saveTimer -= dt;
    if (S.saveTimer <= 0) { S.saveTimer = 5; saveGuestProgress(); }
  } else {
    acc += dt;
    let guard = 0;
    while (acc >= TICK && guard++ < 6) {
      acc -= TICK;
      hostTick();
    }
    S.snapTimer -= dt;
    if (S.snapTimer <= 0 && net.mode === NetMode.HOST && net.conns.size) {
      S.snapTimer = net.snapInterval;
      // Um pacote por destinatário: cada um recebe só o que está no raio dele.
      const events = drainEvents(S.netEvents);
      for (const [peerId, conn] of net.conns) {
        if (!conn.open) continue;
        const viewer = S.G.players[peerId] || null;
        const snap = buildSnapshot(S.G, { viewer, aoi: net.aoi });
        snap.E = events;
        net.trySend(peerId, conn, snap);

        const gp = S.G.players[peerId];
        if (!gp) continue;
        // Inventário só quando muda, e só para o dono dele.
        if (S.lastInvVer.get(peerId) !== gp.invVer) {
          S.lastInvVer.set(peerId, gp.invVer);
          net.sendTo(peerId, { t: 'inv', inv: gp.inv, equip: gp.equip, potions: gp.potions });
        }
      }
    }
    S.saveTimer -= dt;
    if (S.saveTimer <= 0) { S.saveTimer = 8; saveProgress(); }
  }

  updateFx(dt);
  buildView();
  updateCamera(dt);

  drawWorld(ctx, canvas, S.view, now / 1000);
  drawMinimap(mm, S.view, now / 1000);

  const local = getLocal();
  if (local) {
    const st = S.role === 'guest'
      ? { maxHp: local.maxHp, maxMp: local.maxMp }
      : stats(S.G.players[S.localId]);
    UI.updateHUD(S.view, local, st, dt);
    UI.updatePortalHold(S.view, local);
    UI.updateSkillBar(local);
    UI.updateDeathOverlay(local);
  }
}

function hostTick() {
  setInput(S.G, S.localId, localInput());
  const evs = step(S.G, TICK);
  for (const ev of evs) applyEvent(ev);
  if (net.mode === NetMode.HOST && net.conns.size) {
    // 'floor' fica de fora de propósito: o host já anuncia a virada por
    // net.send({ t: 'floor' }), e encaminhar os dois regeraria o mapa duas vezes
    // no convidado.
    for (const ev of evs) if (ev.t === 'd' || ev.t === 'fx' || ev.t === 'shake' || ev.t === 'log' || ev.t === 'portal' || ev.t === 'portalReset' || ev.t === 'bossSpawn' || ev.t === 'loot') S.netEvents.push(ev);
  }
  if (S.G.pendingFloor) {
    S.G.pendingFloor = false;
    // A fila entra antes da geração do andar: assim a escala já conta com eles.
    drainQueue();
    nextFloor(S.G);
    S.map = S.G.map;
    S.floor = S.G.floor;
    S.path = []; S.moveGoal = null; S.targetId = 0;
    net.send({ t: 'floor', floor: S.G.floor });
    UI.banner('Andar ' + S.G.floor, 'A masmorra se aprofunda');
    saveProgress();
  }
}

// Movimento local imediato no convidado — sem isso tudo responde com atraso de rede.
function guestPredict(dt) {
  const p = S.guest.predicted;
  const me = S.view.playerMap.get(S.localId);
  if (!p || !me || me.dead || !S.map) return;
  // Mesmo portão do host (js/sim.js, movimento em updatePlayer): sem isto o
  // convidado congelado pelo chefe continuava andando na própria tela e era
  // arrancado de volta pelo snapshot seguinte, sem nada explicando o tranco.
  const st = me.status;
  if (st && (st.stun > 0 || st.freeze > 0)) return;
  const inp = localInput();
  const speed = (me.speed || 3.5) * dt;
  if (inp.mx || inp.my) {
    const nx = p.x + inp.mx * speed, ny = p.y + inp.my * speed;
    if (!collides(S.map, nx, p.y, 0.32)) p.x = nx;
    if (!collides(S.map, p.x, ny, 0.32)) p.y = ny;
  }
}

function saveGuestProgress() {
  const me = S.view.playerMap.get(S.localId);
  if (!me) return false;
  return Save.writeSave({
    name: me.name, voc: me.voc, level: me.level, xp: me.xp, gold: me.gold,
    equip: S.guest.equip, inv: S.guest.inv, potions: me.potions,
  }, S.floor);
}

function updateCamera(dt) {
  const local = getLocal();
  if (!local) return;
  const target = project(local.x, local.y);
  const k = Math.min(1, dt * 7);
  cam.x += (target.x - cam.x) * k;
  cam.y += (target.y - cam.y - 14) * k;
}

// Mede latência de vez em quando
setInterval(() => {
  if (S.role === 'guest' && net.connected) net.send({ t: 'ping', ts: performance.now() });
}, 3000);

// Sonda de medição, só com ?debug=1 na URL. Serve ao harness multi-peer e
// não deixa nada exposto numa partida normal.
if (new URLSearchParams(location.search).has('debug')) {
  let frames = 0;
  const tick = () => { frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__sf = {
    stats() {
      const f = frames; frames = 0;
      return {
        frames: f,
        role: S.role,
        started: S.started,
        queued: S.queued,
        floor: S.floor,
        players: S.view.players.length,
        peers: net.conns.size,
        ping: net.ping,
        bytesOut: net.bytesOut,
        packetsOut: net.packetsOut,
        monsters: S.view.monsters.length,
      };
    },
  };
}

addEventListener('beforeunload', () => {
  if (S.role === 'host') { try { net.send({ t: 'bye' }); } catch (e) { /* já foi */ } }
  if (S.role !== 'guest') saveProgress(); else saveGuestProgress();
});

requestAnimationFrame(frame);

// Ponte para os testes automatizados (inofensiva em produção).
window.__SF = S;
window.__VIEW_GET = () => S.view;
