import {
  createGame,
  addPlayer,
  removePlayer,
  setInput,
  step,
  stats,
  nextFloor,
  sellJunk,
  collides,
  TICK,
} from './sim.js';
import { generateMap, findPath } from './world.js';
import { TILE_W, TILE_H, EQUIP_SLOTS, RARITY } from './data.js';
import { randomSeed, roomCode } from './rng.js';
import {
  cam,
  drawWorld,
  drawMinimap,
  updateFx,
  handleFxEvent,
  project,
  screenToWorld,
  spawnRing,
  spawnParticles,
} from './render.js';
import { Net, NetMode, buildSnapshot, applySnapshot, interpolate, drainEvents } from './net.js';
import * as Save from './save.js';
import { validateSave, describeReport } from './validate.js';
import { ActionQueue } from './actqueue.js';
import {
  MAX_PLAYERS,
  RECONNECT_WINDOW,
  RECONNECT_RETRY,
  CHAT_MAX_LEN,
  DAILY_CONTRACT_SEED,
  TOUCH_STICK_ZONE,
  TOUCH_STICK_RADIUS,
  TOUCH_STICK_TRAVEL,
} from './balance.js';
import { measureTickBudget } from './tickbudget.js';
import { ChatGate } from './chatgate.js';
import { Room } from './room.js';
import { SessionGuard } from './session.js';
import { ConnectionSignal, applyConnectionSignal, createConnectionState } from './connection.js';
import { chooseStartFloor, commonCheckpoints } from './progression.js';
import { createGameTelemetry } from './telemetry.js';
import * as UI from './ui.js';
import { createAudioLayer } from './audio.js';
import { createWebAudioBackend } from './audioweb.js';
import { loadAudioPrefs, saveAudioPrefs } from './audioprefs.js';
import { ConfirmedProgress, persistConfirmedProjection } from './confirmedprogress.js';
import {
  claimDailyContractReward,
  createDailyClock,
  createDailyContractProgress,
  rollDailyContracts,
} from './contracts.js';
import { buildBestiaryView, buildCheckpointView, buildContractsView } from './refuge.js';
import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';

const canvas = UI.el('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const mm = UI.el('minimap');
const net = new Net();
let connectionState = createConnectionState();

// O indicador observa somente os callbacks e mensagens que a partida já usa.
// Nenhum estado de conexão entra no protocolo: host e convidado continuam
// trocando exatamente ping/pong e os pacotes de jogo existentes.
function signalConnection(type, latencyMs) {
  connectionState = applyConnectionSignal(
    connectionState,
    latencyMs == null ? { type } : { type, latencyMs },
    UI.renderConnectionIndicator
  );
  return connectionState;
}

UI.renderConnectionIndicator(connectionState);
// A preferência é a fonte da UI e da camada: uma mudança de controle só
// atualiza ganhos, portanto não pode reiniciar nem trocar a faixa corrente.
let audioPrefs = loadAudioPrefs();

function sendVitals(metric) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    page: location.pathname,
    timestamp: Date.now(),
  });
  navigator.sendBeacon('/api/vitals', body);
}

function sendGameMetric(name, value) {
  navigator.sendBeacon(
    '/api/vitals',
    JSON.stringify({ name, value, page: location.pathname, timestamp: Date.now() })
  );
}

const gameTelemetry = createGameTelemetry({ send: sendGameMetric });
const contractClock = createDailyClock();

onCLS(sendVitals);
onINP(sendVitals);
onLCP(sendVitals);
onFCP(sendVitals);
onTTFB(sendVitals);

const S = {
  role: 'solo', // solo | host | guest
  started: false,
  // A composição monta a camada uma vez; gesto, sessão e eventos a alimentam sem
  // mudar o estado da simulação.
  audio: createAudioLayer({
    backend: createWebAudioBackend(),
    prefs: audioPrefs,
  }),
  G: null, // simulação (host/solo)
  map: null,
  seed: randomSeed(),
  floor: 1,
  startFloor: 1,
  checkpointManual: false,
  localId: 'host',
  name: 'Herói',
  voc: 'knight',
  view: {
    map: null,
    monsters: [],
    players: [],
    items: [],
    projectiles: [],
    zones: [],
    localId: 'host',
    targetId: 0,
    portalOpen: false,
    floor: 1,
    playerMap: new Map(),
    monsterMap: new Map(),
  },
  guest: { inv: new Array(20).fill(null), equip: {}, predicted: null },
  confirmedProgress: null,
  confirmedSaveFingerprint: null,
  room: new Room(),
  keys: {},
  mouse: { x: 0, y: 0, world: { x: 0, y: 0 }, hasMouse: false },
  stick: { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 },
  moveGoal: null,
  path: [],
  repath: 0,
  targetId: 0,
  netEvents: [],
  // A virada usa uma mensagem própria para o convidado regerar o mapa antes do
  // próximo snapshot. Os contadores deixam o harness P2P provar que ela sai e
  // entra uma vez, sem abrir outro canal nem alterar o pacote do jogo.
  floorAnnouncementsSent: 0,
  floorAnnouncementsReceived: 0,
  snapTimer: 0,
  inputTimer: 0,
  lastInvVer: new Map(),
  saveTimer: 0,
  contractRuns: new Map(),
  chatting: false,
  expected: false, // true quando o fim da sessão já foi explicado
  queued: false, // esperando a virada de andar para entrar
};

// O contexto precisa nascer dentro de uma ação real da pessoa. A trava fica
// aqui, na composição, para que os três gestos existentes não multipliquem a
// tentativa e uma implementação de áudio indisponível nunca interrompa o jogo.
let audioUnlockRequested = false;
function unlockAudio() {
  if (audioUnlockRequested) return;
  audioUnlockRequested = true;
  try {
    void Promise.resolve(S.audio.unlock()).catch(() => {});
  } catch (e) {
    /* áudio é opcional */
  }
}
for (const eventType of ['pointerdown', 'keydown', 'touchend']) {
  addEventListener(eventType, unlockAudio, { once: true, capture: true });
}

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
UI.buildVocationCards(voc => {
  S.voc = voc;
});
UI.selectVocation('knight');

Save.setWarnHandler(msg => UI.pushLog(msg, 'warn'));
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
  S.name = readName();
  S.role = 'solo';
  S.localId = 'host';
  startHostGame();
};

UI.el('btnHost').onclick = async () => {
  S.name = readName();
  S.role = 'host';
  S.localId = 'host';
  signalConnection(ConnectionSignal.OPENING);
  UI.setStatus('Abrindo sala…');
  const code = roomCode();
  try {
    await net.host(code);
    signalConnection(ConnectionSignal.OPEN);
    UI.el('lobbyCode').textContent = code;
    UI.showScreen('lobby');
    S.room = new Room();
    const hostSave = loadSave(S.voc);
    S.room.admit({
      id: 'host',
      name: S.name,
      voc: S.voc,
      isHost: true,
      state: 'pronto',
      stateCls: 'ready',
      save: hostSave,
      level: hostSave?.level || 1,
      deepestFloor: hostSave?.floor || 1,
    });
    renderRoster();
    UI.el('lobbyStatus').textContent = 'Sala aberta. Desça quando quiser.';
  } catch (e) {
    UI.setStatus(e.message || 'Não consegui abrir a sala.', 'err');
    net.close();
  }
};

UI.el('btnJoin').onclick = async () => {
  const code = UI.el('codeInput').value.trim().toUpperCase();
  if (code.length !== 4) {
    UI.setStatus('O código tem 4 letras.', 'err');
    return;
  }
  S.name = readName();
  S.role = 'guest';
  signalConnection(ConnectionSignal.OPENING);
  UI.setStatus('Procurando a sala…');
  try {
    await net.join(code);
    signalConnection(ConnectionSignal.OPEN);
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
    () => {
      UI.el('lobbyStatus').textContent = 'Link copiado. Manda pra ela.';
    },
    () => {
      UI.el('lobbyStatus').textContent = url;
    }
  );
};

UI.el('btnLock').onclick = () => toggleLock();
UI.el('btnRosterLock').onclick = () => toggleLock();
UI.el('btnCloseRoster').onclick = () => UI.toggleRosterPanel(false);
UI.el('crewChip').onclick = () => openRoster();
UI.el('btnLeave').onclick = () => leaveSession();

// O Refúgio só cabe entre expedições. A origem é guardada de forma explícita
// porque host e convidado continuam recebendo eventos da sala enquanto olham a
// tela; se a partida começar nesse intervalo, `enterGame()` vence e a volta não
// pode ressuscitar o lobby por cima do jogo.
let refugeReturnScreen = 'menu';
let refugeFocusOrigin = null;

function refugeFloorLabel(floor) {
  return `Andar ${floor}`;
}

// O Refúgio só apresenta a escolha que a sala já calculou. Ler o save e o
// roster aqui não altera o checkpoint durável nem a partida que ainda vai
// começar; o view-model continua sendo a fronteira da política cooperativa.
function renderRefugeCheckpoints() {
  const roster = S.room.list();
  const players = S.role === 'solo' || roster.length === 0 ? undefined : roster;
  const requestedCheckpoint =
    S.role === 'guest' && players ? S.startFloor : S.checkpointManual ? S.startFloor : undefined;
  const checkpoint = buildCheckpointView({
    save: loadSave(S.voc),
    players,
    requestedCheckpoint,
  });
  UI.el('refugePersonalCheckpoint').textContent = refugeFloorLabel(checkpoint.personalCheckpoint);
  UI.el('refugeCommonCheckpointRow').classList.toggle('hidden', !checkpoint.grouped);
  UI.el('refugeCommonCheckpoint').textContent = refugeFloorLabel(checkpoint.commonCheckpoint);
  UI.el('refugeSelectedCheckpoint').textContent = refugeFloorLabel(checkpoint.selectedCheckpoint);
  UI.el('refugeCheckpointHint').textContent = checkpoint.grouped
    ? `A próxima run usará o andar ${checkpoint.selectedCheckpoint}, permitido para todo o grupo.`
    : `A próxima run solo usará o andar ${checkpoint.selectedCheckpoint}.`;
  return checkpoint;
}

function refugeDetail(label, value) {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = value;
  row.append(term, description);
  return row;
}

// O view-model já omite cada camada ainda bloqueada. Esta composição só cria
// nós para os campos presentes e usa `textContent`, para que um save hostil ou
// tipo desconhecido nunca transforme a tela em via de vazamento do catálogo.
function renderRefugeBestiary() {
  const bestiary = buildBestiaryView({ save: loadSave(S.voc) });
  const summary = UI.el('refugeBestiarySummary');
  const empty = UI.el('refugeBestiaryEmpty');
  const list = UI.el('refugeBestiaryList');
  summary.textContent = `${bestiary.discovered} de ${bestiary.total} tipos identificados.`;
  empty.textContent = bestiary.emptyMessage;
  empty.classList.toggle('hidden', !bestiary.empty);
  list.replaceChildren();

  for (const entry of bestiary.entries) {
    const item = document.createElement('li');
    item.className = 'refuge-bestiary-entry';
    const heading = document.createElement('h3');
    const progress = document.createElement('p');
    heading.textContent = entry.name;
    progress.className = 'refuge-bestiary-progress';
    progress.textContent = `${entry.kind} · ${entry.kills} derrotas · ${entry.tierLabel}`;
    item.append(heading, progress);

    const details = document.createElement('dl');
    details.className = 'refuge-bestiary-details';
    const affinities = entry.revelations.affinities;
    if (affinities) {
      details.append(
        refugeDetail('Elemento', affinities.element ?? 'Não informado'),
        refugeDetail('Fraqueza', affinities.weakness ?? 'Não informada'),
        refugeDetail('Resistência', affinities.resistance ?? 'Nenhuma')
      );
    }
    const attributes = entry.revelations.attributes;
    if (attributes) {
      details.append(
        refugeDetail('Vida', String(attributes.hp)),
        refugeDetail('Ataque', String(attributes.attack)),
        refugeDetail('Defesa', String(attributes.defense)),
        refugeDetail('Experiência', String(attributes.experience))
      );
    }
    const abilities = entry.revelations.abilities;
    if (abilities?.length) {
      details.append(refugeDetail('Especiais', abilities.map(ability => ability.name).join(', ')));
    }
    if (details.childElementCount) item.append(details);
    list.append(item);
  }
  return bestiary;
}

// A lista diária é reconstruída pelo domínio a partir do relógio e da seed;
// o Refúgio não confia em ids ou recompensas que vieram do armazenamento.
// Ainda que a pessoa abra a tela antes da primeira run do dia, a projeção
// permite ler os objetivos sem gravar um estado vazio só por ter sido exibido.
function refugeDailyContracts(save) {
  return rollDailyContracts({
    clock: contractClock,
    seed: DAILY_CONTRACT_SEED,
    saved: save?.contracts,
  });
}

function refugeRewardLabel(reward) {
  return `${reward.gold} ouro · ${reward.potion.amount} ${reward.potion.label}`;
}

// A composição cria somente texto vindo do view-model e botões reais para os
// resgates. A autorização continua em `claimDailyContractReward()`, de modo
// que reabrir a tela, clicar duas vezes ou recarregar não concede duas vezes.
function renderRefugeContracts() {
  const save = loadSave(S.voc);
  const daily = refugeDailyContracts(save);
  const statefulSave = daily.state ? { ...save, contracts: daily.state } : save;
  const contracts = buildContractsView({ save: statefulSave, contracts: daily.contracts });
  const summary = UI.el('refugeContractsSummary');
  const empty = UI.el('refugeContractsEmpty');
  const list = UI.el('refugeContractsList');
  summary.textContent = contracts.day ? `Contratos de ${contracts.day}.` : '';
  empty.textContent = contracts.emptyMessage;
  empty.classList.toggle('hidden', !contracts.empty);
  list.replaceChildren();

  for (const entry of contracts.entries) {
    const item = document.createElement('li');
    item.className = 'refuge-contract-entry';
    const heading = document.createElement('h3');
    const progress = document.createElement('p');
    const reward = document.createElement('p');
    const action = document.createElement('button');
    heading.textContent = entry.objective.text;
    progress.className = 'refuge-contract-progress';
    progress.textContent = `${entry.objective.current} de ${entry.objective.amount} derrotas · ${entry.objective.completed ? 'Concluído' : 'Em andamento'}`;
    reward.className = 'refuge-contract-reward';
    reward.textContent = `Recompensa: ${refugeRewardLabel(entry.reward)}.`;
    action.className = 'btn btn-ghost refuge-contract-claim';
    action.type = 'button';
    action.dataset.contractId = entry.id;
    action.disabled = !entry.claimable;
    action.textContent = entry.claimed
      ? 'Resgatado'
      : entry.claimable
        ? 'Resgatar recompensa'
        : 'Resgate indisponível';
    action.onclick = () => claimRefugeContract(entry.id);
    item.append(heading, progress, reward, action);
    list.append(item);
  }
  return contracts;
}

function claimRefugeContract(contractId) {
  const save = loadSave(S.voc);
  const daily = refugeDailyContracts(save);
  const result = claimDailyContractReward({
    contracts: daily.contracts,
    dayKey: daily.dayKey,
    saved: daily.state,
    contractId,
    player: save,
  });
  if (!result.granted) {
    renderRefugeContracts();
    return false;
  }
  const saved = Save.writeSave(
    { ...save, gold: result.gold, potions: result.potions, contracts: result.state },
    save.floor
  );
  renderRefugeContracts();
  UI.el('refugeContractsStatus').textContent = 'Recompensa resgatada.';
  return saved;
}

function isVisibleRefugeFocusTarget(target) {
  return (
    target instanceof HTMLElement &&
    target.isConnected &&
    !target.matches(':disabled') &&
    !target.closest('.hidden')
  );
}

function restoreRefugeFocus(fallback) {
  const target = isVisibleRefugeFocusTarget(refugeFocusOrigin)
    ? refugeFocusOrigin
    : isVisibleRefugeFocusTarget(fallback)
      ? fallback
      : null;
  refugeFocusOrigin = null;
  target?.focus({ preventScroll: true });
}

function openRefuge(from) {
  // A tela pode ser chamada por um clique programático mesmo depois de sumir.
  // Fila, partida e o fim já explicado são superfícies exclusivas: sobrepor o
  // Refúgio esconderia a fila ou o aviso que oferece a única saída segura.
  if (S.started || S.queued || S.expected) return false;
  refugeReturnScreen = from === 'lobby' ? 'lobby' : 'menu';
  refugeFocusOrigin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderRefugeCheckpoints();
  renderRefugeBestiary();
  renderRefugeContracts();
  UI.el('refugeContractsStatus').textContent = '';
  UI.showScreen('refuge');
  UI.el('refugeTitle').focus({ preventScroll: true });
  return true;
}

function closeRefuge() {
  const lobbyStillOpen =
    refugeReturnScreen === 'lobby' &&
    !S.started &&
    !S.queued &&
    net.connected &&
    (S.role === 'host' || S.role === 'guest');
  const screen = S.started ? 'game' : S.queued ? 'queue' : lobbyStillOpen ? 'lobby' : 'menu';
  UI.showScreen(screen);
  restoreRefugeFocus(UI.el(screen === 'lobby' ? 'btnRefugeLobby' : 'btnRefugeMenu'));
}

UI.el('btnRefugeMenu').onclick = () => openRefuge('menu');
UI.el('btnRefugeLobby').onclick = () => openRefuge('lobby');
UI.el('btnLeaveRefuge').onclick = () => closeRefuge();

// O painel é uma superfície da composição. A política de áudio não conhece DOM
// nem storage; cada ajuste chega a ela como preferência completa e é persistido
// na mesma interação, inclusive o mudo que preserva os dois volumes escolhidos.
const audioChip = UI.el('audioChip');
const audioPanel = UI.el('audioPanel');
const audioMusic = UI.el('audioMusic');
const audioSfx = UI.el('audioSfx');
const audioMute = UI.el('btnAudioMute');

function renderAudioControls() {
  audioMusic.value = String(audioPrefs.music);
  audioSfx.value = String(audioPrefs.sfx);
  audioMute.textContent = audioPrefs.muted ? 'Som desligado' : 'Som ligado';
  audioMute.setAttribute('aria-pressed', String(audioPrefs.muted));
}

function toggleAudioPanel(open) {
  audioPanel.classList.toggle('hidden', !open);
  audioChip.setAttribute('aria-expanded', String(open));
}

function updateAudioPrefs(next) {
  audioPrefs = S.audio.setPrefs(next);
  saveAudioPrefs(audioPrefs);
  renderAudioControls();
}

renderAudioControls();
audioChip.onclick = () => toggleAudioPanel(true);
UI.el('btnCloseAudio').onclick = () => toggleAudioPanel(false);
audioMusic.oninput = () => updateAudioPrefs({ music: Number(audioMusic.value) });
audioSfx.oninput = () => updateAudioPrefs({ sfx: Number(audioSfx.value) });
audioMute.onclick = () => updateAudioPrefs({ muted: !audioPrefs.muted });
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
UI.buildVocationCards(
  voc => {
    S.voc = voc;
    net.send({ t: 'revoc', voc, save: loadSave(voc) });
    UI.setQueueStatus('Você entra com o progresso de ' + voc + '.', 'ok');
  },
  'queueVocGrid',
  false
);

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
    onKick: id => kickPlayer(id),
  });
}

// Estado da fila para quem espera: andar atual, posição e as duas listas.
function sendQueueState(peerId) {
  if (S.role !== 'host') return;
  const strip = e => ({
    id: e.id,
    name: e.name,
    voc: e.voc,
    level: e.level,
    isHost: !!e.isHost,
    state: e.state,
    stateCls: e.stateCls,
  });
  const targets = peerId ? [peerId] : S.room.queue.map(e => e.id);
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
    beginContractRun(gp);
    const note = describeReport(e.name, checked.report);
    if (note) console.info('[sala]', note);
    S.room.update(e.id, { state: 'pronto', stateCls: 'ready' });
    net.sendTo(e.id, { t: 'start', seed: S.seed, floor: S.G.floor });
    UI.pushLog(`${e.name} entrou na masmorra.`, 'system');
  }
  if (entering.length) {
    renderRoster();
    sendQueueState();
  }
  return entering.length;
}

function kickPlayer(id) {
  if (S.role !== 'host' || id === 'host') return;
  const p = S.room.players.get(id) || S.room.queue.find(e => e.id === id);
  if (!p) return;
  const wasQueued = S.room.queue.some(e => e.id === id);
  net.refuse(id, 'kicked');
  S.room.remove(id);
  if (S.G && S.G.players[id]) removePlayer(S.G, id);
  UI.pushLog(`${p.name} foi removido da sala.`, 'warn');
  renderRoster();
  // A recusa fecha o canal logo depois, mas a fila que ficou não deve depender
  // desse callback tardio para descobrir sua nova posição.
  if (wasQueued || S.room.queue.length) sendQueueState();
  openRoster(true);
}

UI.el('btnStart').onclick = () => startHostGame();
UI.el('startFloorSelect').onchange = event => {
  if (S.role !== 'host') return;
  S.checkpointManual = true;
  S.startFloor = chooseStartFloor(S.room.list(), Number(event.currentTarget.value));
  net.send({ t: 'checkpoint', floor: S.startFloor });
  renderCheckpointControl();
};

// ============================================================
// INÍCIO DE PARTIDA
// ============================================================
function startHostGame() {
  S.floorAnnouncementsSent = 0;
  S.floorAnnouncementsReceived = 0;
  S.seed = randomSeed();
  const localSave = loadSave(S.voc);
  const checkpointPlayers =
    S.role === 'solo'
      ? [{ deepestFloor: localSave?.floor || 1 }]
      : S.room.list().filter(p => !p.pending);
  S.startFloor = chooseStartFloor(checkpointPlayers, S.checkpointManual ? S.startFloor : undefined);
  // O andar já nasce escalado para o tamanho do grupo que vai descer.
  S.G = createGame(S.seed, S.startFloor, Math.max(1, S.room.list().filter(p => !p.pending).length));
  S.map = S.G.map;
  S.floor = S.startFloor;
  const me = addPlayer(S.G, { id: 'host', name: S.name, voc: S.voc });
  applySave(me, localSave);
  beginContractRun(me);

  S.room.started = true;
  for (const lp of S.room.list()) {
    if (lp.id === 'host' || lp.pending) continue;
    const gp = addPlayer(S.G, { id: lp.id, name: lp.name, voc: lp.voc });
    applySave(gp, lp.save);
    beginContractRun(gp);
  }

  net.send({ t: 'start', seed: S.seed, floor: S.startFloor });
  enterGame();
  UI.banner('Andar ' + S.startFloor, 'Ashen Realms');
}

function enterGame() {
  S.started = true;
  S.audio.startGame();
  UI.lockVocation(true);
  UI.showScreen('game');
  UI.buildSkillBar(S.voc, castByKey);
  S.view.localId = S.localId;
  S.view.map = S.map;
  gameTelemetry.start({ partySize: Math.max(1, S.room.count), checkpoint: S.floor });
  UI.el('roomChip').classList.toggle('hidden', S.role === 'solo');
  UI.el('crewChip').classList.toggle('hidden', S.role === 'solo');
  if (S.role !== 'solo') {
    UI.el('roomChip').textContent = net.code;
    UI.setCapacity('crewChip', S.room.count, S.room.max);
  }
  const local = getLocal();
  if (local) {
    cam.x = project(local.x, local.y).x;
    cam.y = project(local.x, local.y).y;
  }
  // A abertura só pode citar o que existe na tela daquele modo de entrada: no
  // dedo não há 1-4, Q/E, Tab nem Enter. As duas strings ficam lado a lado de
  // propósito, para a diferença saltar na revisão.
  //
  // A versão de toque mandava "toque em <b>Conversar com o grupo</b>", que é o
  // aria-label do #btnChat — um botão SÓ DE ÍCONE, sem texto visível nenhum.
  // Medido em aparelho real (Chrome/Android, 375x689): o jogador procurava esse
  // rótulo, achava a frase em negrito no #log — canto ESQUERDO, enquanto o botão
  // fica no DIREITO — e tocava nela. O #log é pointer-events: none, então o
  // toque atravessava para o #canvas e, por cair em x < innerWidth/2, virava
  // joystick: o personagem andava e a conversa nunca abria. Doze toques gravados,
  // nenhum a menos de 89,8px da borda do alvo.
  //
  // Agora a frase descreve o que se vê — posição e desenho do botão — e nada de
  // negrito nesta linha: negrito era justamente o que fazia o texto do log
  // parecer um alvo tocável.
  const abertura = matchMedia('(pointer: coarse)').matches
    ? 'Arraste o polegar na metade esquerda para o joystick; use os botões à direita para magias, poções e mochila; o balão ao lado da mochila abre a conversa.'
    : 'Use <b>1–4</b> para magias, <b>Q/E</b> para poções, <b>Enter</b> para conversar.';
  UI.pushLog(abertura, 'system');
  if (S.role !== 'solo')
    UI.pushLog('Fiquem por perto: quem cai só levanta se alguém chegar junto.', 'system');
}

// ============================================================
// REDE
// ============================================================
net.on.data = (msg, from) => {
  if (S.role === 'guest') return guestMsg(msg);
  return hostMsg(msg, from);
};

function renderRoster() {
  if (!S.started)
    UI.renderLobby(S.room.list(), S.role === 'host', { max: S.room.max, locked: S.room.locked });
  if (!S.started) renderCheckpointControl();
  if (!UI.el('refuge').classList.contains('hidden')) renderRefugeCheckpoints();
  UI.setCapacity('crewChip', S.room.count, S.room.max);
  UI.el('crewLock').classList.toggle('hidden', !S.room.locked);
  if (S.role === 'host' && net.mode === NetMode.HOST) {
    // Convidado precisa da lista para ver quem está na sala e quem espera.
    const strip = e => ({
      id: e.id,
      name: e.name,
      voc: e.voc,
      level: e.level,
      isHost: !!e.isHost,
      state: e.state,
      stateCls: e.stateCls,
      deepestFloor: e.deepestFloor || 1,
    });
    net.send({
      t: 'roster',
      players: S.room.list().map(strip),
      queue: S.room.queueList().map(strip),
      startFloor: S.startFloor,
    });
  }
  if (S.started && !UI.el('roster').classList.contains('hidden')) openRoster(true);
}

function renderCheckpointControl() {
  const players = S.room.list();
  const available = commonCheckpoints(players);
  if (S.role === 'host') {
    S.startFloor = chooseStartFloor(players, S.checkpointManual ? S.startFloor : undefined);
  }
  const select = UI.el('startFloorSelect');
  select.innerHTML = '';
  for (const floor of available) {
    const option = document.createElement('option');
    option.value = String(floor);
    option.textContent = `Andar ${floor}`;
    option.selected = floor === S.startFloor;
    select.appendChild(option);
  }
  select.disabled = S.role !== 'host';
  UI.el('checkpointHint').textContent =
    S.role === 'host'
      ? `Disponível para todos: ${available.map(floor => `andar ${floor}`).join(', ')}.`
      : `O host escolheu o andar ${S.startFloor}.`;
  if (!UI.el('refuge').classList.contains('hidden')) renderRefugeCheckpoints();
}

net.on.peerOpen = peerId => {
  const verdict = S.room.canAccept(peerId);
  if (!verdict.ok) {
    net.refuse(peerId, verdict.reason);
    return;
  }
  S.room.admit({ id: peerId, name: '…', voc: 'knight', pending: true, state: 'conectando' });
  renderRoster();
  UI.el('lobbyStatus').textContent = 'Alguém chegou…';
};

net.on.peerLeft = peerId => {
  const gone = S.room.players.get(peerId) || S.room.queue.find(e => e.id === peerId);
  const naFila = S.room.queue.some(e => e.id === peerId);
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
  // É o callback real de fechamento do canal do host. O guard decide depois se
  // isso vira fim esperado, retorno ao menu ou uma janela de reconexão.
  signalConnection(ConnectionSignal.LOST);
  if (S.queued) {
    // Ninguém fica preso na tela de espera quando a sala morre.
    S.queued = false;
    net.close();
    UI.showScreen('menu');
    UI.setStatus('O host encerrou a partida. A fila foi desfeita.', 'err');
    return;
  }
  if (!S.started) {
    UI.setStatus('O host fechou a sala.', 'err');
    return;
  }
  guard.hostLost();
};

// Queda momentânea e saída definitiva são coisas diferentes: primeiro tenta
// voltar, e só declara encerrada quando a janela esgota.
const guard = new SessionGuard({
  onReconnecting: (left, total) => {
    UI.showReconnecting(left, total);
  },
  onRetry: () => {
    signalConnection(ConnectionSignal.RETRY);
    tryRejoin(net.code);
  },
  onResumed: () => {
    signalConnection(ConnectionSignal.REJOINED);
    UI.hideDrop();
    UI.pushLog('Reconectado.', 'system');
  },
  onEnded: (title, text) => {
    S.expected = true;
    // A queda definitiva preserva a tela para explicar o que houve, mas a
    // partida já acabou: não deixa previsão, inputs ou autosave vivos atrás
    // do aviso do host/da expulsão.
    S.started = false;
    actQueue.clear();
    S.path = [];
    S.moveGoal = null;
    S.targetId = 0;
    S.audio.stopGame();
    // Em queda, previsão local não vale como progresso. Só a projeção que o
    // host confirmou por snapshot + inv pode chegar ao save.
    const saved = S.role === 'guest' ? saveConfirmedGuestProgress() : saveProgress();
    gameTelemetry.reconnectFailure();
    finishGameTelemetry();
    // Se a sala fechar enquanto a pessoa consulta o Refúgio entre runs, o
    // overlay mora dentro de #game. Reexibir a superfície do fim garante que
    // ela não fique invisível atrás da tela de consulta.
    UI.showScreen('game');
    UI.showEnded(title, text, saved);
  },
});

async function tryRejoin(code) {
  if (guard.state !== 'reconnecting' || !code) return;
  try {
    net.close();
    signalConnection(ConnectionSignal.OPENING);
    await net.join(code);
    net.send({ t: 'join', name: S.name, voc: S.voc, save: loadSave(S.voc) });
    guard.rejoined();
  } catch (e) {
    /* segue tentando até a janela fechar */
  }
}

// Sai da sessão sem recarregar: recarregar baixaria fontes e PeerJS de novo
// e apagaria nome e vocação já escolhidos.
function leaveSession() {
  guard.reset();
  if (!S.expected) {
    if (S.role === 'guest') saveGuestProgress();
    else saveProgress();
  }
  if (S.role === 'host') net.send({ t: 'bye' });
  S.audio.stopGame();
  finishGameTelemetry();
  net.close();

  S.started = false;
  S.expected = false;
  S.queued = false;
  S.role = 'solo';
  S.localId = 'host';
  S.G = null;
  S.map = null;
  S.view.playerMap.clear();
  S.view.monsterMap.clear();
  S.view.players = [];
  S.view.monsters = [];
  S.view.items = [];
  S.view.projectiles = [];
  S.view.zones = [];
  S.view.map = null;
  S.guest = { inv: new Array(20).fill(null), equip: {}, predicted: null };
  S.confirmedProgress = null;
  S.confirmedSaveFingerprint = null;
  S.floorAnnouncementsSent = 0;
  S.floorAnnouncementsReceived = 0;
  S.room = new Room();
  S.netEvents.length = 0;
  S.contractRuns.clear();
  S.lastInvVer.clear();
  S.path = [];
  S.moveGoal = null;
  S.targetId = 0;
  S.floor = 1;
  S.startFloor = 1;
  S.checkpointManual = false;
  S.chatting = false;
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
      const checked = validateSave(msg.save);
      const note = describeReport(msg.name, checked.report);
      if (note) console.info('[sala]', note); // log do host, nunca o chat da sala
      const verdict = S.room.admit({
        id: from,
        name: msg.name,
        voc: msg.voc,
        save: checked.save,
        level: checked.save?.level || 1,
        deepestFloor: checked.save?.floor || 1,
        state: 'pronto',
        stateCls: 'ready',
      });
      if (!verdict.ok) {
        net.refuse(from, verdict.reason);
        break;
      }
      renderRoster();
      if (verdict.queued) {
        // Com a partida em curso ninguém nasce no meio do andar: espera a virada.
        S.room.update(from, { state: 'na fila', stateCls: 'queued' });
        UI.pushLog(`${msg.name} está esperando o próximo andar.`, 'system');
        // A chegada muda o total e a ordem exibidos para quem já espera. Mandar
        // só para o novo deixava o primeiro preso em "1º de 1" até outra saída.
        sendQueueState();
      } else {
        UI.el('lobbyStatus').textContent = `${msg.name} entrou.`;
      }
      break;
    }
    case 'revoc': {
      // Quem está na fila ainda escolhe a vocação, e com ela o save aplicado.
      const e = S.room.queue.find(q => q.id === from);
      if (!e) break;
      const rev = validateSave(msg.save);
      e.voc = msg.voc;
      e.save = rev.save;
      e.level = rev.save?.level || 1;
      e.deepestFloor = rev.save?.floor || 1;
      renderRoster();
      sendQueueState(from);
      break;
    }
    case 'in':
      if (S.G && S.G.players[from]) setInput(S.G, from, msg);
      break;
    case 'chat': {
      // Antiflood no host, que é a autoridade da sala.
      if (!chatGate.allow(from, S.G ? S.G.time : 0).ok) {
        net.sendTo(from, { t: 'chatBlocked' });
        break;
      }
      const text = chatGate.clean(msg.m);
      if (!text) break;
      chatLine(msg.name, text);
      net.send({ t: 'chat', name: msg.name, m: text });
      break;
    }
    case 'ping':
      net.sendTo(from, { t: 'pong', ts: msg.ts });
      break;
    default:
      break;
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
      S.room.players = new Map(msg.players.map(e => [e.id, e]));
      S.room.queue = msg.queue || [];
      S.startFloor = msg.startFloor || 1;
      if (!S.started) {
        UI.renderLobby(msg.players, false, { max: MAX_PLAYERS, locked: S.room.locked });
        renderCheckpointControl();
      }
      if (!UI.el('roster').classList.contains('hidden')) openRoster(true);
      UI.setCapacity('crewChip', msg.players.length + (msg.queue?.length || 0), MAX_PLAYERS);
      break;
    case 'checkpoint':
      S.startFloor = msg.floor || 1;
      if (!S.started) renderCheckpointControl();
      if (!UI.el('refuge').classList.contains('hidden')) renderRefugeCheckpoints();
      break;
    case 'bye':
      // Saída deliberada do host: pula a tentativa de reconexão.
      guard.endExpected('Partida encerrada', 'O host encerrou a partida.');
      break;
    case 'queued':
      S.queued = true;
      UI.showScreen('queue');
      UI.renderQueue({
        floor: msg.floor,
        position: msg.position,
        players: msg.players,
        queue: msg.queue,
        myId: net.peer?.id,
        max: MAX_PLAYERS,
      });
      break;
    case 'start':
      S.queued = false;
      S.seed = msg.seed;
      S.floor = msg.floor;
      S.floorAnnouncementsReceived = 0;
      S.localId = net.peer.id;
      // O convidado só ganha um checkpoint persistível depois de receber o
      // par snapshot + inventário do host; movimento previsto nunca entra.
      S.confirmedProgress = new ConfirmedProgress({ id: S.localId, voc: S.voc });
      S.confirmedSaveFingerprint = null;
      S.map = generateMap(S.seed, S.floor);
      S.view.playerMap.clear();
      S.view.monsterMap.clear();
      enterGame();
      UI.banner('Andar ' + S.floor, 'Ashen Realms');
      break;
    case 's':
      S.confirmedProgress?.acceptSnapshot(msg);
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
      S.confirmedProgress?.acceptInventory(msg);
      S.guest.inv = msg.inv;
      S.guest.equip = msg.equip;
      if (UI.el('bag').classList.contains('hidden') === false) renderBag();
      break;
    case 'floor':
      // O host anuncia a virada por mensagem própria, fora de `E`: sem este
      // aviso o convidado que estava na luta manteria a faixa até outro evento.
      S.audio.floorChanged();
      S.floorAnnouncementsReceived++;
      S.floor = msg.floor;
      gameTelemetry.floor(S.floor);
      S.map = generateMap(S.seed, S.floor);
      S.view.map = S.map;
      S.view.floor = S.floor;
      S.view.monsterMap.clear();
      S.view.monsters = [];
      // O snapshot novo pode levar até o próximo intervalo. Não deixar a tela
      // misturar resíduos do andar anterior nessa janela curta evita item,
      // projétil, zona ou portal antigo sobre o mapa que acabou de nascer.
      S.view.items = [];
      S.view.projectiles = [];
      S.view.zones = [];
      S.view.portalOpen = false;
      S.view.portalReady = 0;
      S.view.portalTotal = 0;
      S.view.portalHold = 0;
      S.guest.predicted = null;
      actQueue.clear();
      S.path = [];
      S.moveGoal = null;
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
      signalConnection(ConnectionSignal.ACK, net.ping);
      UI.el('pingChip').classList.remove('hidden');
      UI.el('pingChip').textContent = net.ping + ' ms';
      break;
    default:
      break;
  }
}

function chatLine(name, m) {
  UI.pushLog(`<b>${escapeHtml(name)}:</b> ${escapeHtml(m)}`, 'chat');
}
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// ============================================================
// EVENTOS DO SIMULADOR → TELA
// ============================================================
function applyEvent(ev) {
  // Host e convidado convergem aqui. A política decide se o evento tem som;
  // a tela continua livre para retornar cedo nos tipos sem representação visual.
  S.audio.handle(ev, S.localId);
  if (ev.t === 'portalReset') {
    UI.flashPortalReset();
    return;
  }
  if (ev.t === 'log') {
    UI.pushLog(ev.m, ev.c || 'system');
    return;
  }
  if (ev.t === 'portal') {
    UI.banner('Portal aberto', 'Sala do chefe');
    return;
  }
  // Brilho na cor da raridade. O evento existia desde sempre e caía no ignore
  // abaixo sem nenhum consumidor: quem pegava um lendário via a mesma tela de
  // quem pegava um item comum.
  if (ev.t === 'loot') {
    const cor = (RARITY[ev.rarity] || RARITY.common).color;
    spawnRing(ev.x, ev.y, 1.4, cor, { life: 0.6, width: 3 });
    spawnParticles(ev.x, ev.y, cor, 14, { speed: 3.2, life: 0.7, size: 2 });
    return;
  }
  // Eventos de luta de chefe não têm FX, log ou banner próprios: a camada de
  // áudio os consome antes deste ponto. `floor` continua na mensagem própria
  // do host, para não regerar o mapa duas vezes no convidado.
  if (
    ev.t === 'hurt' ||
    ev.t === 'respawn' ||
    ev.t === 'bossSpawn' ||
    ev.t === 'bossEngage' ||
    ev.t === 'bossDisengage' ||
    ev.t === 'floor'
  )
    return;
  handleFxEvent(ev);
}

// ============================================================
// ENTRADA
// ============================================================
function isEditableTarget(target) {
  return (
    target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
  );
}

addEventListener('keydown', e => {
  if (e.key === 'Escape' && !UI.el('refuge').classList.contains('hidden')) {
    e.preventDefault();
    closeRefuge();
    return;
  }
  if (!S.started) return;
  const k = e.key.toLowerCase();

  if (S.chatting) {
    if (k === 'escape') closeChat();
    return;
  }
  if (k === 'enter') {
    openChat();
    e.preventDefault();
    return;
  }
  if (k === 'escape') {
    UI.el('bag').classList.add('hidden');
    UI.toggleRosterPanel(false);
    return;
  }
  if (
    k === 'm' &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.metaKey &&
    !e.shiftKey &&
    !isEditableTarget(e.target)
  ) {
    updateAudioPrefs({ muted: !audioPrefs.muted });
    return;
  }
  if (k === 'p') {
    openRoster();
    return;
  }

  S.keys[k] = true;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    S.moveGoal = null;
    S.path = [];
  }
  if (k >= '1' && k <= '4') {
    castByKey(['Q', 'W', 'E', 'R'][+k - 1]);
    e.preventDefault();
  }
  if (k === 'q') queueAct({ k: 'pot', slot: 'hp' });
  if (k === 'e') queueAct({ k: 'pot', slot: 'mp' });
  if (k === 'tab' || k === 'i') {
    toggleBag();
    e.preventDefault();
  }
});
addEventListener('keyup', e => {
  S.keys[e.key.toLowerCase()] = false;
});
addEventListener('blur', () => {
  S.keys = {};
});

canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') S.mouse.hasMouse = true;
  const dpr = canvas.width / innerWidth;
  S.mouse.x = e.clientX * dpr;
  S.mouse.y = e.clientY * dpr;
  S.mouse.world = screenToWorld(S.mouse.x, S.mouse.y, canvas);
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (S.started) castByKey('Q');
});

canvas.addEventListener('pointerdown', e => {
  if (!S.started) return;
  const dpr = canvas.width / innerWidth;
  const px = e.clientX * dpr,
    py = e.clientY * dpr;

  if (e.pointerType === 'touch' && e.clientX < innerWidth * TOUCH_STICK_ZONE) {
    S.stick.active = true;
    S.stick.id = e.pointerId;
    S.stick.ox = e.clientX;
    S.stick.oy = e.clientY;
    S.stick.dx = 0;
    S.stick.dy = 0;
    const st = UI.el('stick');
    st.classList.remove('hidden');
    st.style.left = e.clientX - TOUCH_STICK_RADIUS + 'px';
    st.style.top = e.clientY - TOUCH_STICK_RADIUS + 'px';
    st.querySelector('i').style.transform = 'translate(0,0)';
    return;
  }

  const w = screenToWorld(px, py, canvas);
  const m = monsterAt(w.x, w.y);
  if (m) {
    S.targetId = m.id;
    S.moveGoal = null;
    S.path = [];
  } else {
    S.targetId = 0;
    S.moveGoal = { x: w.x, y: w.y };
    S.repath = 0;
  }
});

addEventListener('pointermove', e => {
  if (!S.stick.active || e.pointerId !== S.stick.id) return;
  const dx = e.clientX - S.stick.ox,
    dy = e.clientY - S.stick.oy;
  const len = Math.hypot(dx, dy);
  const max = TOUCH_STICK_TRAVEL;
  const cl = len > max ? max / len : 1;
  S.stick.dx = (dx * cl) / max;
  S.stick.dy = (dy * cl) / max;
  UI.el('stick').querySelector('i').style.transform = `translate(${dx * cl}px, ${dy * cl}px)`;
});

function endStick(e) {
  if (!S.stick.active || (e && e.pointerId !== S.stick.id)) return;
  S.stick.active = false;
  S.stick.dx = 0;
  S.stick.dy = 0;
  UI.el('stick').classList.add('hidden');
}
addEventListener('pointerup', endStick);
addEventListener('pointercancel', endStick);

for (const b of document.querySelectorAll('.slot.potion')) {
  b.onpointerdown = e => {
    e.preventDefault();
    queueAct({ k: 'pot', slot: b.dataset.pot });
  };
}
UI.el('btnBag').onclick = toggleBag;
// onpointerdown é o padrão da casa para slot de ação (js/ui.js:120) e evita o
// clique sintético; o preventDefault impede o foco do botão de brigar com o
// chatEl.focus() de openChat(). Só abre: o envio continua no caminho único que
// passa pelo chatGate.
UI.el('btnChat').onpointerdown = e => {
  e.preventDefault();
  openChat();
};
UI.el('btnCloseBag').onclick = () => UI.el('bag').classList.add('hidden');
UI.el('btnRespawn').onclick = () => queueAct({ k: 'respawn' });
UI.el('btnSell').onclick = () => {
  if (S.role === 'guest') {
    queueAct({ k: 'sell' });
    return;
  }
  const p = S.G.players[S.localId];
  sellJunk(S.G, p);
  renderBag();
};

// --- Conversa ---
let chatEl = null;
// O ✕ é o único caminho de fechamento no dedo: closeChat() só era alcançado
// pelo Escape de js/main.js:571 ou pelo envio de mensagem não vazia, o celular
// não tem Escape e enviar vazio é descartado em silêncio por chatGate.clean('') —
// quem abrisse a conversa no toque ficava preso no campo.
let chatCloseEl = null;
// Altura do teclado virtual, publicada como --kb para o CSS subir a faixa de
// chat. visualViewport é o único caminho que cobre iOS e Android: a
// VirtualKeyboard API por trás de env(keyboard-inset-height) exige
// `navigator.virtualKeyboard.overlaysContent = true` e não existe no Safari, e
// `interactive-widget=resizes-content` no meta resolveria só no Chrome — ao
// custo de encolher a viewport de layout e disparar o corte de altura que
// esconde o #log (styles.css:489) bem na hora de digitar.
// offsetTop entra na conta porque o iOS rola a visual viewport em vez de
// encolhê-la quando o campo focado ficaria atrás do teclado.
// A conta vive em UI.alturaTeclado (js/ui.js) porque precisa ser chamável sem
// navegador: o harness não abre teclado virtual nem emula pinça, e sem função
// pura o zoom fantasma e o teto ficariam sem nenhum teste.
function medirTeclado() {
  const vv = window.visualViewport;
  if (!vv) return;
  document.documentElement.style.setProperty('--kb', UI.alturaTeclado(vv, innerHeight) + 'px');
}
if (window.visualViewport) {
  addEventListener('resize', medirTeclado);
  window.visualViewport.addEventListener('resize', medirTeclado);
  window.visualViewport.addEventListener('scroll', medirTeclado);
  medirTeclado();
}

function openChat() {
  // O #btnChat fica no canto inferior direito e o campo no esquerdo, então o
  // botão continua visível e tocável com a conversa aberta. Sem esta guarda o
  // segundo toque cairia no `chatEl.value = ''` lá embaixo e apagaria o que a
  // pessoa já tinha digitado. O caminho de teclado nunca sofreu disso porque o
  // keydown global (js/main.js:571) retorna cedo quando S.chatting é true.
  if (S.chatting && chatEl) {
    chatEl.focus();
    return;
  }
  S.chatting = true;
  if (!chatEl) {
    chatEl = document.createElement('input');
    chatEl.id = 'chatInput';
    // O teto de caracteres é primitiva de js/balance.js (AGENTS.md:57): o literal
    // 120 daqui divergia do CHAT_MAX_LEN = 140 que o chatGate do host já aplica.
    chatEl.maxLength = CHAT_MAX_LEN;
    chatEl.placeholder = 'Falar com o grupo…';
    chatEl.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        // Trunca antes de enviar: não faz sentido gastar banda do host com
        // texto que ninguém vai ver.
        const m = chatGate.clean(chatEl.value);
        if (m) {
          if (S.role === 'guest') net.send({ t: 'chat', name: S.name, m });
          else {
            chatLine(S.name, m);
            net.send({ t: 'chat', name: S.name, m });
          }
        }
        closeChat();
      } else if (e.key === 'Escape') closeChat();
    });
    UI.el('game').appendChild(chatEl);
    // Memoizado junto do campo, no mesmo bloco: o alvo de fechar acompanha o
    // ciclo de vida do #chatInput e nunca vira um segundo nó no DOM. O handler
    // chama closeChat() direto — sem lógica duplicada e sem estado paralelo ao
    // S.chatting. onpointerdown é o padrão da casa para alvo de toque
    // (js/ui.js:120) e o preventDefault impede o botão de roubar o foco do campo
    // antes de closeChat() dar o blur.
    chatCloseEl = document.createElement('button');
    chatCloseEl.id = 'btnChatClose';
    chatCloseEl.className = 'x';
    chatCloseEl.type = 'button';
    chatCloseEl.setAttribute('aria-label', 'Fechar conversa');
    chatCloseEl.textContent = '✕';
    chatCloseEl.onpointerdown = e => {
      e.preventDefault();
      closeChat();
    };
    UI.el('game').appendChild(chatCloseEl);
  }
  chatEl.value = '';
  chatEl.classList.remove('hidden');
  // A visibilidade do ✕ é exatamente S.chatting: sai junto do campo aqui e volta
  // junto dele em closeChat(), senão sobraria flutuando sobre o jogo.
  chatCloseEl.classList.remove('hidden');
  chatEl.focus();
}
function closeChat() {
  S.chatting = false;
  if (chatEl) {
    chatEl.blur();
    chatEl.classList.add('hidden');
  }
  if (chatCloseEl) chatCloseEl.classList.add('hidden');
}

// ============================================================
// AÇÕES
// ============================================================
const chatGate = new ChatGate();

const actQueue = new ActionQueue({
  onDrop: lost => UI.pushLog(`${lost} ação(ões) descartada(s) — a fila encheu.`, 'warn'),
});

function queueAct(act) {
  if (S.role === 'guest') {
    actQueue.push(act);
    return;
  }
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
  const t =
    S.view.monsters.find(m => m.id === S.targetId && m.hp > 0) || nearestVisibleMonster(local, 9);
  if (t) return { x: t.x, y: t.y };
  const a = local.dir || 0;
  return { x: local.x + Math.cos(a) * 4, y: local.y + Math.sin(a) * 4 };
}

function nearestVisibleMonster(local, range) {
  let best = null,
    bestD = range;
  for (const m of S.view.monsters) {
    if (m.hp <= 0) continue;
    const d = Math.hypot(m.x - local.x, m.y - local.y);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

function monsterAt(wx, wy) {
  let best = null,
    bestD = 1.1;
  for (const m of S.view.monsters) {
    if (m.hp <= 0) continue;
    const d = Math.hypot(m.x - wx, m.y - wy);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
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
  let sx = 0,
    sy = 0;
  if (S.keys.a || S.keys.arrowleft) sx -= 1;
  if (S.keys.d || S.keys.arrowright) sx += 1;
  if (S.keys.w || S.keys.arrowup) sy -= 1;
  if (S.keys.s || S.keys.arrowdown) sy += 1;
  if (S.stick.active) {
    sx += S.stick.dx;
    sy += S.stick.dy;
  }

  let dir = screenDirToWorld(sx, sy);

  // Clique-para-andar (Tibia): segue o caminho calculado localmente.
  if (!sx && !sy && S.moveGoal) {
    const local = getLocal();
    if (local) {
      while (S.path.length && Math.hypot(S.path[0].x - local.x, S.path[0].y - local.y) < 0.4)
        S.path.shift();
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
  else {
    S.path = [];
    S.moveGoal = null;
  }
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
      voc: v?.voc || S.voc,
      level: v?.level || 1,
      inv: S.guest.inv,
      equip: S.guest.equip,
      buffs: [],
      status: { slow: 0 },
    };
  }
  return S.G?.players[S.localId];
}

function renderBag() {
  const p = localPlayerData();
  if (!p) return;
  UI.renderBag(p, {
    use: i => {
      queueAct({ k: 'use', slot: i });
      setTimeout(renderBag, 60);
    },
    drop: i => {
      queueAct({ k: 'drop', slot: i });
      setTimeout(renderBag, 60);
    },
    unequip: slot => {
      queueAct({ k: 'unequip', slot });
      setTimeout(renderBag, 60);
    },
    stats: () =>
      stats({ voc: p.voc, level: p.level, equip: p.equip, buffs: [], status: { slow: 0 } }),
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

function loadSave(voc) {
  return Save.loadSave(voc);
}

function applySave(p, save) {
  if (!save || save.voc !== p.voc) return;
  p.level = Math.max(1, save.level || 1);
  p.xp = save.xp || 0;
  p.gold = save.gold || 0;
  if (save.equip) for (const s of EQUIP_SLOTS) if (save.equip[s]) p.equip[s] = save.equip[s];
  if (Array.isArray(save.inv))
    for (let i = 0; i < Math.min(save.inv.length, p.inv.length); i++) p.inv[i] = save.inv[i];
  if (save.potions) p.potions = { hp: save.potions.hp ?? 8, mp: save.potions.mp ?? 6 };
  if (save.bestiary) p.bestiary = save.bestiary;
  if (save.contracts) p.contracts = save.contracts;
  const st = stats(p);
  p.hp = st.maxHp;
  p.mp = st.maxMp;
  p.invVer++;
}

function beginContractRun(p) {
  // Uma run anterior não pode continuar contando se a leitura do relógio falhar
  // nesta entrada; o save fica intacto, mas a guarda efêmera é sempre da run.
  S.contractRuns.delete(p.id);
  const daily = rollDailyContracts({
    clock: contractClock,
    seed: DAILY_CONTRACT_SEED,
    saved: p.contracts,
  });
  if (!daily.state) return;
  const run = createDailyContractProgress({
    contracts: daily.contracts,
    dayKey: daily.dayKey,
    saved: daily.state,
  });
  if (!run.state()) return;
  p.contracts = run.state();
  S.contractRuns.set(p.id, run);
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
    id: p.id,
    name: p.name,
    voc: p.voc,
    x: p.x,
    y: p.y,
    dir: p.dir,
    hp: p.hp,
    maxHp: st.maxHp,
    mp: p.mp,
    maxMp: st.maxMp,
    level: p.level,
    xp: p.xp,
    gold: p.gold,
    dead: p.dead,
    reviveProg: p.reviveProg,
    deathTimer: p.deathTimer,
    potions: p.potions,
    onPortal: !!p.onPortal,
    attack: p.anim.attack,
    casting: p.anim.cast,
    hurt: p.anim.hurt > 0,
    moving: p.anim.moving,
    buffed: p.buffs.length > 0,
    skillCd: p.skillCd,
    kills: p.kills,
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
const DEBUG_PROBE = new URLSearchParams(location.search).has('debug');
let maxHostTickMs = 0;
let maxSnapshotBytes = 0;

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
    if (S.saveTimer <= 0) {
      S.saveTimer = 5;
      saveGuestProgress();
    }
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
        if (DEBUG_PROBE) maxSnapshotBytes = Math.max(maxSnapshotBytes, JSON.stringify(snap).length);
        net.trySend(peerId, conn, snap);

        const gp = S.G.players[peerId];
        if (!gp) continue;
        // Inventário só quando muda, e só para o dono dele.
        if (S.lastInvVer.get(peerId) !== gp.invVer) {
          S.lastInvVer.set(peerId, gp.invVer);
          net.sendTo(peerId, {
            t: 'inv',
            // Continua sendo a mesma mensagem privada de inventário: estes
            // dois campos só tornam dono e ordem verificáveis no convidado.
            i: peerId,
            iv: gp.invVer,
            inv: gp.inv,
            equip: gp.equip,
            potions: gp.potions,
          });
        }
      }
    }
    S.saveTimer -= dt;
    if (S.saveTimer <= 0) {
      S.saveTimer = 8;
      saveProgress();
    }
  }

  updateFx(dt);
  buildView();
  updateCamera(dt);

  drawWorld(ctx, canvas, S.view, now / 1000);
  drawMinimap(mm, S.view, now / 1000);

  const local = getLocal();
  if (local) {
    const st =
      S.role === 'guest'
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
  const tickStarted = DEBUG_PROBE ? performance.now() : 0;
  const evs = step(S.G, TICK);
  for (const player of Object.values(S.G.players)) {
    const run = S.contractRuns.get(player.id);
    if (!run) continue;
    const state = run.process(evs);
    if (state) player.contracts = state;
  }
  if (DEBUG_PROBE) maxHostTickMs = Math.max(maxHostTickMs, performance.now() - tickStarted);
  for (const ev of evs) applyEvent(ev);
  if (net.mode === NetMode.HOST && net.conns.size) {
    // 'floor' fica de fora de propósito: o host já anuncia a virada por
    // net.send({ t: 'floor' }), e encaminhar os dois regeraria o mapa duas vezes
    // no convidado.
    for (const ev of evs)
      if (
        ev.t === 'd' ||
        ev.t === 'fx' ||
        ev.t === 'shake' ||
        ev.t === 'log' ||
        ev.t === 'portal' ||
        ev.t === 'portalReset' ||
        ev.t === 'bossSpawn' ||
        ev.t === 'bossEngage' ||
        ev.t === 'bossDisengage' ||
        ev.t === 'loot'
      )
        S.netEvents.push(ev);
  }
  if (S.G.pendingFloor) {
    S.G.pendingFloor = false;
    // A virada é anunciada ao convidado por `floor`, não pelo evento pendente
    // da simulação. Encerrar aqui mantém o host no mesmo instante da transição.
    S.audio.floorChanged();
    // A fila entra antes da geração do andar: assim a escala já conta com eles.
    drainQueue();
    nextFloor(S.G);
    S.map = S.G.map;
    S.floor = S.G.floor;
    gameTelemetry.floor(S.floor);
    S.path = [];
    S.moveGoal = null;
    S.targetId = 0;
    S.floorAnnouncementsSent++;
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
    const nx = p.x + inp.mx * speed,
      ny = p.y + inp.my * speed;
    if (!collides(S.map, nx, p.y, 0.32)) p.x = nx;
    if (!collides(S.map, p.x, ny, 0.32)) p.y = ny;
  }
}

function saveGuestProgress() {
  const me = S.view.playerMap.get(S.localId);
  if (!me) return false;
  return Save.writeSave(
    {
      name: me.name,
      voc: me.voc,
      level: me.level,
      xp: me.xp,
      gold: me.gold,
      equip: S.guest.equip,
      inv: S.guest.inv,
      potions: me.potions,
    },
    S.floor
  );
}

function saveConfirmedGuestProgress() {
  const result = persistConfirmedProjection(
    S.confirmedProgress?.toSaveProjection(),
    S.confirmedSaveFingerprint,
    (player, floor) => Save.writeSave(player, floor)
  );
  S.confirmedSaveFingerprint = result.fingerprint;
  return result.saved;
}

function finishGameTelemetry() {
  const local = getLocal();
  gameTelemetry.finish({ deaths: local?.deaths || 0 });
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
if (DEBUG_PROBE) {
  let frames = 0;
  const tick = () => {
    frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__sf = {
    stats() {
      const f = frames;
      frames = 0;
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
        maxHostTickMs,
        maxSnapshotBytes,
        monsters: S.view.monsters.length,
      };
    },
    // A sonda cria um cenário isolado, porém idêntico à carga máxima de uma
    // sala: dez jogadores, população no teto e a variante HARDCORE. Misturar
    // isso ao rAF das dez abas mediria o agendador do Chromium, não `step()`.
    tickBudget() {
      return measureTickBudget();
    },
  };
}

addEventListener('beforeunload', () => {
  if (S.role === 'host') {
    try {
      net.send({ t: 'bye' });
    } catch (e) {
      /* já foi */
    }
  }
  if (S.role !== 'guest') saveProgress();
  else saveGuestProgress();
});

requestAnimationFrame(frame);

// Ponte para os testes automatizados (inofensiva em produção).
window.__SF = S;
window.__VIEW_GET = () => S.view;
// Leitura mínima para os harnesses P2P: os contadores já existem em Net e não
// mudam o protocolo. Expor apenas números impede o teste de manipular a conexão.
window.__NET_GET = () => ({ packetsOut: net.packetsOut, bytesOut: net.bytesOut });
