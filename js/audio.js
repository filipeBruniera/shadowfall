import { MUSIC_FADE_TIME, SFX_MIN_INTERVAL } from './balance.js';

const FX_EFFECTS = {
  cast: 'cast',
  slash: 'hit',
  impact: 'hit',
  death: 'death',
  playerDeath: 'death',
  level: 'loot',
};

const EVENT_EFFECTS = {
  loot: 'loot',
  portal: 'portal',
};

function effectFor(ev) {
  if (ev.t === 'fx') return FX_EFFECTS[ev.k] || null;
  return EVENT_EFFECTS[ev.t] || null;
}

export function memoryBackend() {
  const state = {
    track: null,
    tracks: [],
    trackCalls: [],
    effects: [],
    gains: null,
    unlocked: false,
    preloads: 0,
    stopCalls: [],
  };
  return {
    state,
    unlock() {
      state.unlocked = true;
      return true;
    },
    preload() {
      state.preloads++;
    },
    setTrack(track, options) {
      state.track = track;
      state.tracks.push(track);
      state.trackCalls.push({ track, ...options });
    },
    stopTrack(options) {
      state.track = null;
      state.stopCalls.push({ ...options });
    },
    playSfx(name) {
      state.effects.push(name);
      return true;
    },
    applyGains(prefs) {
      state.gains = { ...prefs };
    },
  };
}

export function createAudioLayer({ backend, now = () => performance.now() / 1000, prefs }) {
  let currentPrefs = { ...prefs };
  let inGame = false;
  let hardcoreFight = false;
  const lastEffect = new Map();
  const stats = { alternationViolations: 0, dropped: 0 };

  backend.applyGains(currentPrefs);
  const setTrack = track => backend.setTrack(track, { fade: MUSIC_FADE_TIME });
  const endFight = () => {
    if (!hardcoreFight) return false;
    hardcoreFight = false;
    if (inGame) setTrack('ambient');
    return true;
  };

  return {
    stats,
    unlock: () => backend.unlock(),
    preload: () => backend.preload(),
    startGame() {
      if (inGame) return false;
      inGame = true;
      setTrack('ambient');
      return true;
    },
    stopGame() {
      if (!inGame) return false;
      inGame = false;
      hardcoreFight = false;
      backend.stopTrack({ fade: MUSIC_FADE_TIME });
      return true;
    },
    floorChanged() {
      return endFight();
    },
    setPrefs(next) {
      currentPrefs = { ...currentPrefs, ...next };
      backend.applyGains(currentPrefs);
      return { ...currentPrefs };
    },
    handle(ev, localId) {
      if (!ev || !inGame) return false;
      if (ev.t === 'bossEngage') {
        if (!ev.hardcore || hardcoreFight) return false;
        hardcoreFight = true;
        setTrack('bossfight');
        return true;
      }
      if (ev.t === 'bossDisengage' || ev.t === 'floor') return endFight();
      if (ev.t === 'fx' && ev.k === 'death' && ev.boss) return endFight();

      const effect = effectFor(ev);
      if (!effect) return false;
      if ((ev.t === 'loot' || (ev.t === 'fx' && ev.k === 'level')) && ev.id !== localId)
        return false;

      const at = now();
      if (at - (lastEffect.get(effect) ?? -Infinity) < SFX_MIN_INTERVAL) {
        stats.dropped++;
        return false;
      }
      lastEffect.set(effect, at);
      if (!backend.playSfx(effect)) {
        stats.dropped++;
        return false;
      }
      return true;
    },
  };
}
