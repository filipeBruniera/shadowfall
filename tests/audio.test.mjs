// Testes da política de áudio — rodam sem navegador, com storage injetável.
import { readFileSync } from 'node:fs';
import * as AudioPrefs from '../js/audioprefs.js';
import { createAudioLayer, memoryBackend } from '../js/audio.js';
import { createWebAudioBackend } from '../js/audioweb.js';
import { memoryStorage } from '../js/save.js';
import {
  MUSIC_FADE_TIME,
  MUSIC_VOLUME_DEFAULT,
  SFX_MAX_VOICES,
  SFX_MIN_INTERVAL,
  SFX_VOLUME_DEFAULT,
} from '../js/balance.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.log(`  FAIL ${label} ${extra}`);
    failures++;
  }
}

function fresh(initial = {}) {
  const storage = memoryStorage(initial);
  AudioPrefs.setStorage(storage);
  return storage;
}

console.log('\n== áudio: preferências válidas ==');
{
  const prefs = AudioPrefs.defaultPrefs();
  check(
    'áudio: padrão usa os volumes de balance e começa desmutado',
    prefs.v === AudioPrefs.AUDIO_PREFS_VERSION &&
      prefs.muted === false &&
      prefs.music === MUSIC_VOLUME_DEFAULT &&
      prefs.sfx === SFX_VOLUME_DEFAULT,
    JSON.stringify(prefs)
  );
}

{
  fresh();
  const prefs = AudioPrefs.loadAudioPrefs();
  check(
    'áudio: chave ausente devolve o padrão',
    prefs.v === AudioPrefs.AUDIO_PREFS_VERSION &&
      prefs.muted === false &&
      prefs.music === MUSIC_VOLUME_DEFAULT &&
      prefs.sfx === SFX_VOLUME_DEFAULT,
    JSON.stringify(prefs)
  );
}

{
  const stored = {
    v: AudioPrefs.AUDIO_PREFS_VERSION,
    muted: false,
    music: 0.35,
    sfx: 0.8,
  };
  fresh({ [AudioPrefs.AUDIO_KEY]: JSON.stringify(stored) });
  const prefs = AudioPrefs.loadAudioPrefs();
  check(
    'áudio: lê os três valores persistidos',
    prefs.muted === stored.muted && prefs.music === stored.music && prefs.sfx === stored.sfx,
    JSON.stringify(prefs)
  );
}

{
  const storage = fresh();
  const saved = AudioPrefs.saveAudioPrefs({ muted: false, music: 0.25, sfx: 0.65 });
  const raw = JSON.parse(storage.getItem(AudioPrefs.AUDIO_KEY));
  const loaded = AudioPrefs.loadAudioPrefs();
  check(
    'áudio: grava o contrato completo e o relê',
    saved &&
      raw.v === AudioPrefs.AUDIO_PREFS_VERSION &&
      raw.muted === false &&
      raw.music === 0.25 &&
      raw.sfx === 0.65 &&
      loaded.muted === false &&
      loaded.music === 0.25 &&
      loaded.sfx === 0.65,
    JSON.stringify({ raw, loaded })
  );
}

{
  fresh();
  AudioPrefs.saveAudioPrefs({ muted: false, music: 0.2, sfx: 0.7 });
  AudioPrefs.saveAudioPrefs({ muted: true, music: 0.2, sfx: 0.7 });
  const muted = AudioPrefs.loadAudioPrefs();
  AudioPrefs.saveAudioPrefs({ ...muted, muted: false });
  const unmuted = AudioPrefs.loadAudioPrefs();
  check(
    'áudio: mudo preserva os dois volumes para desmutar',
    muted.muted === true &&
      muted.music === 0.2 &&
      muted.sfx === 0.7 &&
      unmuted.muted === false &&
      unmuted.music === 0.2 &&
      unmuted.sfx === 0.7,
    JSON.stringify({ muted, unmuted })
  );
}

{
  const storage = fresh();
  AudioPrefs.saveAudioPrefs({ muted: true, music: 0.4, sfx: 0.6 });
  check(
    'áudio: storage injetável recebe a preferência sem localStorage',
    JSON.parse(storage.getItem(AudioPrefs.AUDIO_KEY)).music === 0.4 &&
      AudioPrefs.loadAudioPrefs().sfx === 0.6
  );
}

console.log('\n== áudio: preferências hostis ==');
{
  const storage = fresh({ [AudioPrefs.AUDIO_KEY]: '{incompleto' });
  const before = storage.getItem(AudioPrefs.AUDIO_KEY);
  const prefs = AudioPrefs.loadAudioPrefs();
  check(
    'áudio: JSON inválido devolve o padrão sem apagar a chave',
    prefs.muted === false &&
      prefs.music === MUSIC_VOLUME_DEFAULT &&
      prefs.sfx === SFX_VOLUME_DEFAULT &&
      storage.getItem(AudioPrefs.AUDIO_KEY) === before,
    JSON.stringify(prefs)
  );
}

{
  const stored = { v: AudioPrefs.AUDIO_PREFS_VERSION + 1, muted: true, music: 0.4, sfx: 0.6 };
  const storage = fresh({ [AudioPrefs.AUDIO_KEY]: JSON.stringify(stored) });
  const before = storage.getItem(AudioPrefs.AUDIO_KEY);
  const prefs = AudioPrefs.loadAudioPrefs();
  check(
    'áudio: versão desconhecida devolve o padrão sem apagar a chave',
    prefs.muted === false &&
      prefs.music === MUSIC_VOLUME_DEFAULT &&
      prefs.sfx === SFX_VOLUME_DEFAULT &&
      storage.getItem(AudioPrefs.AUDIO_KEY) === before,
    JSON.stringify(prefs)
  );
}

{
  const stored = { v: AudioPrefs.AUDIO_PREFS_VERSION, muted: 'sim', music: '0.4', sfx: null };
  const storage = fresh({ [AudioPrefs.AUDIO_KEY]: JSON.stringify(stored) });
  const before = storage.getItem(AudioPrefs.AUDIO_KEY);
  const prefs = AudioPrefs.loadAudioPrefs();
  check(
    'áudio: tipos errados devolvem o padrão sem apagar a chave',
    prefs.muted === false &&
      prefs.music === MUSIC_VOLUME_DEFAULT &&
      prefs.sfx === SFX_VOLUME_DEFAULT &&
      storage.getItem(AudioPrefs.AUDIO_KEY) === before,
    JSON.stringify(prefs)
  );
}

{
  const storage = fresh();
  const saved = AudioPrefs.saveAudioPrefs({ muted: false, music: -0.4, sfx: 1.4 });
  const raw = JSON.parse(storage.getItem(AudioPrefs.AUDIO_KEY));
  check(
    'áudio: gravação limita volumes ao intervalo de zero a um',
    saved && raw.music === 0 && raw.sfx === 1,
    JSON.stringify(raw)
  );
}

{
  let warnings = 0;
  const originalWarn = console.warn;
  AudioPrefs.setStorage({
    getItem: () => null,
    setItem: () => {
      throw new Error('quota cheia');
    },
  });
  console.warn = () => {
    warnings++;
  };
  let first;
  let second;
  try {
    first = AudioPrefs.saveAudioPrefs({ muted: false, music: 0.4, sfx: 0.6 });
    second = AudioPrefs.saveAudioPrefs({ muted: true, music: 0.2, sfx: 0.8 });
  } finally {
    console.warn = originalWarn;
  }
  check(
    'áudio: quota cheia falha sem lançar e avisa uma única vez',
    first === false && second === false && warnings === 1,
    JSON.stringify({ first, second, warnings })
  );
}

function audioLayer() {
  const backend = memoryBackend();
  return {
    backend,
    layer: createAudioLayer({
      backend,
      now: () => 0,
      prefs: { muted: false, music: MUSIC_VOLUME_DEFAULT, sfx: SFX_VOLUME_DEFAULT },
    }),
  };
}

function startsHardcoreFight(layer) {
  return layer.handle({ t: 'bossEngage', hardcore: 1 });
}

function fakeAudioContext() {
  const state = { gains: [], oscillators: [], resumes: 0 };
  class FakeGain {
    constructor() {
      this.gain = {
        value: 1,
        targets: [],
        setTargetAtTime: (...args) => {
          this.gain.targets.push(args);
        },
        setValueAtTime: (...args) => {
          this.gain.targets.push(args);
        },
        exponentialRampToValueAtTime: (...args) => {
          this.gain.targets.push(args);
        },
        linearRampToValueAtTime: (...args) => {
          this.gain.targets.push(args);
        },
      };
      state.gains.push(this);
    }
    connect() {}
  }
  class FakeOscillator {
    constructor() {
      this.frequency = { value: 0 };
      this.onended = null;
      state.oscillators.push(this);
    }
    connect() {}
    start() {}
    stop() {}
    end() {
      this.onended?.();
    }
  }
  class FakeAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 10;
      this.destination = {};
    }
    resume() {
      state.resumes++;
      this.state = 'running';
      return Promise.resolve();
    }
    createGain() {
      return new FakeGain();
    }
    createOscillator() {
      return new FakeOscillator();
    }
  }
  return { FakeAudioContext, state };
}

console.log('\n== áudio: máquina de faixas ==');
{
  const { backend, layer } = audioLayer();
  const beforeGame = startsHardcoreFight(layer);
  const started = layer.startGame();
  const repeated = layer.startGame();
  check(
    'áudio: só a partida inicia ambiente uma única vez com fade declarado',
    beforeGame === false &&
      started === true &&
      repeated === false &&
      backend.state.track === 'ambient' &&
      JSON.stringify(backend.state.trackCalls) ===
        JSON.stringify([{ track: 'ambient', fade: MUSIC_FADE_TIME }]),
    JSON.stringify(backend.state)
  );
}

{
  const { backend, layer } = audioLayer();
  layer.startGame();
  const common = layer.handle({ t: 'bossEngage', hardcore: 0 });
  const hardcore = startsHardcoreFight(layer);
  const duplicate = startsHardcoreFight(layer);
  check(
    'áudio: apenas engajamento HARDCORE troca ambiente por luta com o fade declarado',
    common === false &&
      hardcore === true &&
      duplicate === false &&
      backend.state.track === 'bossfight' &&
      JSON.stringify(backend.state.trackCalls) ===
        JSON.stringify([
          { track: 'ambient', fade: MUSIC_FADE_TIME },
          { track: 'bossfight', fade: MUSIC_FADE_TIME },
        ]),
    JSON.stringify(backend.state)
  );
}

{
  const cases = [
    {
      name: 'morte do chefe',
      end: layer => layer.handle({ t: 'fx', k: 'death', boss: true }),
    },
    {
      name: 'virada de andar',
      end: layer => layer.floorChanged(),
    },
    {
      name: 'abandono',
      end: layer => layer.handle({ t: 'bossDisengage' }),
    },
  ];
  const results = cases.map(({ name, end }) => {
    const { backend, layer } = audioLayer();
    layer.startGame();
    startsHardcoreFight(layer);
    const first = end(layer);
    const repeated = end(layer);
    return {
      name,
      first,
      repeated,
      track: backend.state.track,
      trackCalls: backend.state.trackCalls,
    };
  });
  check(
    'áudio: morte, andar e abandono voltam uma vez ao ambiente com fade',
    results.every(
      result =>
        result.first === true &&
        result.repeated === false &&
        result.track === 'ambient' &&
        JSON.stringify(result.trackCalls) ===
          JSON.stringify([
            { track: 'ambient', fade: MUSIC_FADE_TIME },
            { track: 'bossfight', fade: MUSIC_FADE_TIME },
            { track: 'ambient', fade: MUSIC_FADE_TIME },
          ])
    ),
    JSON.stringify(results)
  );
}

{
  const { backend, layer } = audioLayer();
  layer.startGame();
  startsHardcoreFight(layer);
  const first = layer.stopGame();
  const repeated = layer.stopGame();
  const afterSession = layer.handle({ t: 'bossDisengage' });
  check(
    'áudio: fim de sessão para uma vez com fade e ignora fins posteriores',
    first === true &&
      repeated === false &&
      afterSession === false &&
      backend.state.track === null &&
      JSON.stringify(backend.state.stopCalls) === JSON.stringify([{ fade: MUSIC_FADE_TIME }]),
    JSON.stringify(backend.state)
  );
}

{
  const { backend, layer } = audioLayer();
  layer.startGame();
  startsHardcoreFight(layer);
  const disengaged = layer.handle({ t: 'bossDisengage' });
  const reengaged = startsHardcoreFight(layer);
  check(
    'áudio: reengajamento após abandono reinicia a faixa de luta sem violar alternância',
    disengaged === true &&
      reengaged === true &&
      backend.state.track === 'bossfight' &&
      layer.stats.alternationViolations === 0 &&
      JSON.stringify(backend.state.trackCalls) ===
        JSON.stringify([
          { track: 'ambient', fade: MUSIC_FADE_TIME },
          { track: 'bossfight', fade: MUSIC_FADE_TIME },
          { track: 'ambient', fade: MUSIC_FADE_TIME },
          { track: 'bossfight', fade: MUSIC_FADE_TIME },
        ]),
    JSON.stringify({ state: backend.state, stats: layer.stats })
  );
}

console.log('\n== áudio: efeitos ==');
{
  const { backend, layer } = audioLayer();
  layer.startGame();
  const played = layer.handle({ t: 'fx', k: 'cast' }, 'local');
  check(
    'áudio: reprodução válida pede um único efeito ao backend',
    played === true && JSON.stringify(backend.state.effects) === JSON.stringify(['cast']),
    JSON.stringify({ played, effects: backend.state.effects })
  );
}

{
  const cases = [
    { event: { t: 'fx', k: 'cast' }, effect: 'cast' },
    { event: { t: 'fx', k: 'slash' }, effect: 'hit' },
    { event: { t: 'fx', k: 'impact' }, effect: 'hit' },
    { event: { t: 'fx', k: 'death' }, effect: 'death' },
    { event: { t: 'fx', k: 'playerDeath' }, effect: 'death' },
    { event: { t: 'loot', id: 'local' }, effect: 'loot' },
    { event: { t: 'portal' }, effect: 'portal' },
  ];
  const results = cases.map(({ event, effect }) => {
    const { backend, layer } = audioLayer();
    layer.startGame();
    return { effect, played: layer.handle(event, 'local'), effects: backend.state.effects };
  });
  check(
    'áudio: mapeamento fechado cobre cast, hit, death, loot e portal',
    results.every(
      result =>
        result.played === true && JSON.stringify(result.effects) === JSON.stringify([result.effect])
    ),
    JSON.stringify(results)
  );
}

{
  const cases = [{ t: 'bossSpawn' }, { t: 'cast' }, { t: 'fx', k: 'summon' }];
  const results = cases.map(event => {
    const { backend, layer } = audioLayer();
    layer.startGame();
    return { event, played: layer.handle(event, 'local'), effects: backend.state.effects };
  });
  check(
    'áudio: tipo desconhecido não pede reprodução',
    results.every(result => result.played === false && result.effects.length === 0),
    JSON.stringify(results)
  );
}

{
  const foreign = [
    { t: 'loot', id: 'other' },
    { t: 'fx', k: 'level', id: 'other' },
  ].map(event => {
    const { backend, layer } = audioLayer();
    layer.startGame();
    return { event, played: layer.handle(event, 'local'), effects: backend.state.effects };
  });
  const local = [
    { t: 'loot', id: 'local' },
    { t: 'fx', k: 'level', id: 'local' },
  ].map(event => {
    const { backend, layer } = audioLayer();
    layer.startGame();
    return { event, played: layer.handle(event, 'local'), effects: backend.state.effects };
  });
  const global = [
    { t: 'fx', k: 'cast', id: 'other' },
    { t: 'fx', k: 'death', id: 'other' },
    { t: 'portal', id: 'other' },
  ].map(event => {
    const { backend, layer } = audioLayer();
    layer.startGame();
    return { event, played: layer.handle(event, 'local'), effects: backend.state.effects };
  });
  check(
    'áudio: efeitos pessoais respeitam dono e os globais seguem audíveis',
    foreign.every(result => result.played === false && result.effects.length === 0) &&
      local.every(result => result.played === true && result.effects[0] === 'loot') &&
      global.every(result => result.played === true && result.effects.length === 1),
    JSON.stringify({ foreign, local, global })
  );
}

console.log('\n== áudio: limites operacionais ==');
{
  let at = 10;
  const backend = memoryBackend();
  const layer = createAudioLayer({
    backend,
    now: () => at,
    prefs: { muted: false, music: MUSIC_VOLUME_DEFAULT, sfx: SFX_VOLUME_DEFAULT },
  });
  layer.startGame();
  const first = layer.handle({ t: 'fx', k: 'cast' }, 'local');
  at += SFX_MIN_INTERVAL - 0.001;
  const early = layer.handle({ t: 'fx', k: 'cast' }, 'local');
  at += 0.002;
  const afterLimit = layer.handle({ t: 'fx', k: 'cast' }, 'local');
  check(
    'áudio: intervalo mínimo de balance descarta repetição precoce e aceita após o limite',
    first === true &&
      early === false &&
      afterLimit === true &&
      layer.stats.dropped === 1 &&
      JSON.stringify(backend.state.effects) === JSON.stringify(['cast', 'cast']),
    JSON.stringify({ first, early, afterLimit, stats: layer.stats, effects: backend.state.effects })
  );
}

{
  const backend = memoryBackend();
  let activeVoices = 0;
  backend.playSfx = name => {
    if (activeVoices >= SFX_MAX_VOICES) return false;
    activeVoices++;
    backend.state.effects.push(name);
    return true;
  };
  let at = 20;
  const layer = createAudioLayer({
    backend,
    now: () => at,
    prefs: { muted: false, music: MUSIC_VOLUME_DEFAULT, sfx: SFX_VOLUME_DEFAULT },
  });
  layer.startGame();
  const accepted = Array.from({ length: SFX_MAX_VOICES }, () => {
    const played = layer.handle({ t: 'fx', k: 'cast' }, 'local');
    at += SFX_MIN_INTERVAL + 0.001;
    return played;
  });
  const discarded = layer.handle({ t: 'fx', k: 'cast' }, 'local');
  activeVoices--;
  const beforeNewRequest = backend.state.effects.length;
  at += SFX_MIN_INTERVAL + 0.001;
  const afterNewRequest = layer.handle({ t: 'fx', k: 'cast' }, 'local');
  check(
    'áudio: política aceita o teto do backend, descarta excedente sem fila e só toca novo pedido',
    accepted.every(Boolean) &&
      discarded === false &&
      beforeNewRequest === SFX_MAX_VOICES &&
      afterNewRequest === true &&
      backend.state.effects.length === SFX_MAX_VOICES + 1 &&
      layer.stats.dropped === 1,
    JSON.stringify({ accepted, discarded, beforeNewRequest, afterNewRequest, stats: layer.stats })
  );
}

{
  const { backend, layer } = audioLayer();
  const prefs = layer.setPrefs({ muted: true, music: 0.25, sfx: 0.45 });
  const unmuted = layer.setPrefs({ muted: false });
  check(
    'áudio: ganhos são aplicados ao iniciar e a cada preferência sem perder os volumes no mudo',
    JSON.stringify(backend.state.gains) ===
      JSON.stringify({ muted: false, music: 0.25, sfx: 0.45 }) &&
      prefs.muted === true &&
      unmuted.muted === false &&
      unmuted.music === 0.25 &&
      unmuted.sfx === 0.45,
    JSON.stringify({ gains: backend.state.gains, prefs, unmuted })
  );
}

{
  const { backend, layer } = audioLayer();
  layer.startGame();
  const before = backend.state.trackCalls.length;
  const prefs = layer.setPrefs({ music: 0.23, sfx: 0.61, muted: true });
  check(
    'áudio: atualizar ganhos durante a partida não reinicia a faixa corrente',
    before === 1 &&
      backend.state.track === 'ambient' &&
      backend.state.trackCalls.length === before &&
      JSON.stringify(backend.state.gains) === JSON.stringify(prefs),
    JSON.stringify({
      before,
      track: backend.state.track,
      calls: backend.state.trackCalls,
      gains: backend.state.gains,
      prefs,
    })
  );
}

{
  const { FakeAudioContext, state } = fakeAudioContext();
  const previousAudioContext = globalThis.AudioContext;
  const previousWebkitAudioContext = globalThis.webkitAudioContext;
  let result;
  try {
    globalThis.AudioContext = FakeAudioContext;
    globalThis.webkitAudioContext = undefined;
    const backend = createWebAudioBackend();
    const unlocked = await backend.unlock();
    const unlockedAgain = await backend.unlock();
    backend.applyGains({ muted: false, music: 0.25, sfx: 0.45 });
    backend.applyGains({ muted: true });
    const mutedGains = state.gains.slice(0, 2).map(node => node.gain.targets.at(-1)[0]);
    backend.applyGains({ muted: false });
    const restoredGains = state.gains.slice(0, 2).map(node => node.gain.targets.at(-1)[0]);
    const played = Array.from({ length: SFX_MAX_VOICES }, () => backend.playSfx('cast'));
    const discarded = backend.playSfx('cast');
    const beforeRelease = state.oscillators.length;
    state.oscillators[0].end();
    const afterReleaseWithoutRequest = state.oscillators.length;
    const afterNewRequest = backend.playSfx('cast');
    result = {
      mutedGains,
      restoredGains,
      played,
      discarded,
      beforeRelease,
      afterReleaseWithoutRequest,
      afterNewRequest,
      oscillators: state.oscillators.length,
      unlocked,
      unlockedAgain,
      resumes: state.resumes,
    };
  } finally {
    if (previousAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previousAudioContext;
    if (previousWebkitAudioContext === undefined) delete globalThis.webkitAudioContext;
    else globalThis.webkitAudioContext = previousWebkitAudioContext;
  }
  check(
    'áudio: backend destrava uma vez, limita vozes, não reanima descarte e aplica ganhos',
    JSON.stringify(result.mutedGains) === JSON.stringify([0, 0]) &&
      JSON.stringify(result.restoredGains) === JSON.stringify([0.25, 0.45]) &&
      result.played.every(Boolean) &&
      result.discarded === false &&
      result.beforeRelease === SFX_MAX_VOICES &&
      result.afterReleaseWithoutRequest === SFX_MAX_VOICES &&
      result.afterNewRequest === true &&
      result.oscillators === SFX_MAX_VOICES + 1,
    result.unlocked === true && result.unlockedAgain === true && result.resumes === 1,
    JSON.stringify(result)
  );
}

{
  const previousAudioContext = globalThis.AudioContext;
  const previousWebkitAudioContext = globalThis.webkitAudioContext;
  let result;
  try {
    globalThis.AudioContext = undefined;
    globalThis.webkitAudioContext = undefined;
    result = await createWebAudioBackend().unlock();
  } finally {
    if (previousAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previousAudioContext;
    if (previousWebkitAudioContext === undefined) delete globalThis.webkitAudioContext;
    else globalThis.webkitAudioContext = previousWebkitAudioContext;
  }
  check('áudio: backend sem AudioContext falha em silêncio', result === false, String(result));
}

{
  const pureAudio = readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');
  check(
    'áudio: política pura não agenda timeout nem interval',
    !/\bsetTimeout\b|\bsetInterval\b/.test(pureAudio)
  );
}

console.log('\n== áudio: composição ==');
{
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const importsLayer = /import\s*\{\s*createAudioLayer\s*\}\s*from\s*'\.\/audio\.js';/.test(main);
  const importsBackend =
    /import\s*\{\s*createWebAudioBackend\s*\}\s*from\s*'\.\/audioweb\.js';/.test(main);
  const importsPrefs =
    /import\s*\{\s*loadAudioPrefs,\s*saveAudioPrefs\s*\}\s*from\s*'\.\/audioprefs\.js';/.test(main);
  const composed =
    /let\s+audioPrefs\s*=\s*loadAudioPrefs\(\);[\s\S]*?audio:\s*createAudioLayer\(\{\s*backend:\s*createWebAudioBackend\(\),\s*prefs:\s*audioPrefs,\s*\}\)/s.test(
      main
    );
  const gestureUnlock =
    /let\s+audioUnlockRequested\s*=\s*false;[\s\S]*?if\s*\(audioUnlockRequested\)\s*return;[\s\S]*?audioUnlockRequested\s*=\s*true;[\s\S]*?S\.audio\.unlock\(\)/.test(
      main
    );
  const captureGestures =
    /for\s*\(const\s+eventType\s+of\s*\['pointerdown',\s*'keydown',\s*'touchend'\]\)[\s\S]*?addEventListener\(eventType,\s*unlockAudio,\s*\{\s*once:\s*true,\s*capture:\s*true\s*\}\)/.test(
      main
    );
  const between = (from, to) => {
    const start = main.indexOf(from);
    const end = main.indexOf(to, start + from.length);
    return start < 0 ? '' : main.slice(start, end < 0 ? main.length : end);
  };
  const enterGame = between(
    'function enterGame()',
    '// ============================================================\n// REDE'
  );
  const leaveSession = between('function leaveSession()', 'function hostMsg(');
  const ended = between('onEnded: (title, text) => {', '},\n});\n\nasync function tryRejoin');
  const applyEvent = between(
    'function applyEvent(ev) {',
    '// ============================================================\n// ENTRADA'
  );
  const guestFloor = between("case 'floor':", "case 'chat':");
  const hostFloor = between('if (S.G.pendingFloor) {', '// Movimento local imediato no convidado');
  const startsAtEntry = /S\.started\s*=\s*true;[\s\S]*?S\.audio\.startGame\(\)/.test(enterGame);
  const stopsAtLeave = /S\.audio\.stopGame\(\)/.test(leaveSession);
  const stopsAtTerminalDrop = /S\.audio\.stopGame\(\)/.test(ended);
  const receivesEveryEvent =
    applyEvent.indexOf('S.audio.handle(ev, S.localId);') >= 0 &&
    applyEvent.indexOf('S.audio.handle(ev, S.localId);') < applyEvent.indexOf('if (ev.t');
  const endsAtGuestFloor = /S\.audio\.floorChanged\(\)/.test(guestFloor);
  const endsAtHostFloor = /S\.audio\.floorChanged\(\)/.test(hostFloor);
  const controlsPersistPrefs =
    /function\s+updateAudioPrefs\(next\)\s*\{[\s\S]*?audioPrefs\s*=\s*S\.audio\.setPrefs\(next\);[\s\S]*?saveAudioPrefs\(audioPrefs\);[\s\S]*?renderAudioControls\(\);[\s\S]*?\}/.test(
      main
    );
  const controlsOpenClose =
    /audioChip\.onclick\s*=\s*\(\)\s*=>\s*toggleAudioPanel\(true\);[\s\S]*?btnCloseAudio[\s\S]*?toggleAudioPanel\(false\);/.test(
      main
    );
  const controlsUseInput =
    /audioMusic\.oninput\s*=\s*\(\)\s*=>\s*updateAudioPrefs\(\{\s*music:[\s\S]*?audioSfx\.oninput\s*=\s*\(\)\s*=>\s*updateAudioPrefs\(\{\s*sfx:[\s\S]*?audioMute\.onclick\s*=\s*\(\)\s*=>\s*updateAudioPrefs\(\{\s*muted:\s*!audioPrefs\.muted\s*\}\)/s.test(
      main
    );
  const lifecycleCalls = [
    ...main.matchAll(/\bS\.audio\.(startGame|stopGame|floorChanged|handle|preload|setPrefs)\b/g),
  ].map(match => match[1]);
  check(
    'áudio: composição entrega eventos, ciclo e controles persistentes sem acoplar DOM à política',
    importsLayer &&
      importsBackend &&
      importsPrefs &&
      composed &&
      gestureUnlock &&
      captureGestures &&
      startsAtEntry &&
      stopsAtLeave &&
      stopsAtTerminalDrop &&
      receivesEveryEvent &&
      endsAtGuestFloor &&
      endsAtHostFloor &&
      controlsPersistPrefs &&
      controlsOpenClose &&
      controlsUseInput &&
      JSON.stringify(lifecycleCalls.sort()) ===
        JSON.stringify([
          'floorChanged',
          'floorChanged',
          'handle',
          'setPrefs',
          'startGame',
          'stopGame',
          'stopGame',
        ]),
    JSON.stringify({
      importsLayer,
      importsBackend,
      importsPrefs,
      composed,
      gestureUnlock,
      captureGestures,
      startsAtEntry,
      stopsAtLeave,
      stopsAtTerminalDrop,
      receivesEveryEvent,
      endsAtGuestFloor,
      endsAtHostFloor,
      controlsPersistPrefs,
      controlsOpenClose,
      controlsUseInput,
      lifecycleCalls,
    })
  );
}

console.log('\n== áudio: marcação dos controles ==');
{
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const gameStart = page.indexOf('<div id="game"');
  const gameEnd = page.indexOf('\n    <script', gameStart);
  const panelAt = page.indexOf('id="audioPanel"');
  const game = page.slice(gameStart, gameEnd);
  const panel = game.slice(game.indexOf('id="audioPanel"'));
  const hasRange = (id, label, value) =>
    new RegExp(
      `<label\\s+for="${id}">${label}</label>[\\s\\S]*?<input\\s+id="${id}"\\s+type="range"\\s+min="0"\\s+max="1"\\s+step="0\\.01"\\s+value="${value}"\\s*/?>`
    ).test(panel);
  const chip =
    /<button[\s\S]*?id="audioChip"[\s\S]*?class="chip"[\s\S]*?type="button"[\s\S]*?aria-label="Abrir controles de áudio"[\s\S]*?aria-controls="audioPanel"[\s\S]*?aria-expanded="false"[\s\S]*?>\s*Som\s*<\/button>/.test(
      game
    );
  const hiddenPanel =
    /<div\s+id="audioPanel"\s+class="panel hidden"\s+aria-labelledby="audioTitle">/.test(game);
  const mute =
    /<button\s+id="btnAudioMute"\s+type="button"\s+aria-pressed="false">Som ligado<\/button>/.test(
      panel
    );
  const close =
    /<button\s+id="btnCloseAudio"\s+class="x"\s+type="button"\s+aria-label="Fechar controles de áudio">\s*✕\s*<\/button>/.test(
      panel
    );
  check(
    'áudio: controles têm ids estáveis, rótulos acessíveis e estado inicial coerente dentro do jogo',
    gameStart >= 0 &&
      gameEnd > gameStart &&
      panelAt > gameStart &&
      panelAt < gameEnd &&
      chip &&
      hiddenPanel &&
      hasRange('audioMusic', 'Música', '0.5') &&
      hasRange('audioSfx', 'Efeitos', '0.7') &&
      mute &&
      close,
    JSON.stringify({ gameStart, gameEnd, panelAt, chip, hiddenPanel, mute, close })
  );
}

console.log('\n== áudio: estilo dos controles ==');
{
  const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const has = pattern => pattern.test(styles);
  check(
    'áudio: chip e painel têm contraste, foco e pisos de toque declarados no CSS',
    has(/#audioChip\s*\{[\s\S]*?pointer-events:\s*auto;[\s\S]*?color:\s*var\(--bone\);/) &&
      has(/#audioPanel\s*\{[\s\S]*?top:\s*56px;[\s\S]*?right:\s*12px;[\s\S]*?transform:\s*none;/) &&
      has(/\.audio-controls\s*\{[\s\S]*?grid-template-columns:/) &&
      has(/\.audio-controls input\[type='range'\]\s*\{[\s\S]*?min-block-size:\s*44px;/) &&
      has(/\.audio-controls button\s*\{[\s\S]*?min-block-size:\s*44px;/) &&
      has(
        /#audioChip:focus-visible,[\s\S]*?#audioPanel button:focus-visible,[\s\S]*?#audioPanel input:focus-visible/
      ) &&
      has(
        /@media \(pointer: coarse\)\s*\{[\s\S]*?#audioChip\s*\{[\s\S]*?min-inline-size:\s*44px;[\s\S]*?min-block-size:\s*44px;/
      ),
    'faltou uma das regras de contraste, foco ou alvo de 44px'
  );
}

AudioPrefs.setStorage(null);
process.exit(failures ? 1 : 0);
