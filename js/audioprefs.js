import { MUSIC_VOLUME_DEFAULT, SFX_VOLUME_DEFAULT } from './balance.js';

export const AUDIO_PREFS_VERSION = 1;
export const AUDIO_KEY = 'sf-audio';
let injected = null;
let warned = false;

export function setStorage(storage) {
  injected = storage;
}

function store() {
  if (injected) return injected;
  try {
    return globalThis.localStorage ?? null;
  } catch (e) {
    return null;
  }
}

export function defaultPrefs() {
  return {
    v: AUDIO_PREFS_VERSION,
    muted: false,
    music: MUSIC_VOLUME_DEFAULT,
    sfx: SFX_VOLUME_DEFAULT,
  };
}

const validVolume = value =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

export function loadAudioPrefs() {
  const storage = store();
  if (!storage) return defaultPrefs();
  try {
    const raw = JSON.parse(storage.getItem(AUDIO_KEY));
    if (
      raw?.v !== AUDIO_PREFS_VERSION ||
      typeof raw.muted !== 'boolean' ||
      !validVolume(raw.music) ||
      !validVolume(raw.sfx)
    )
      return defaultPrefs();
    return { v: AUDIO_PREFS_VERSION, muted: raw.muted, music: raw.music, sfx: raw.sfx };
  } catch (e) {
    return defaultPrefs();
  }
}

export function saveAudioPrefs(prefs) {
  const storage = store();
  if (!storage) return false;
  const safe = {
    v: AUDIO_PREFS_VERSION,
    muted: !!prefs.muted,
    music: Math.min(1, Math.max(0, Number(prefs.music) || 0)),
    sfx: Math.min(1, Math.max(0, Number(prefs.sfx) || 0)),
  };
  try {
    storage.setItem(AUDIO_KEY, JSON.stringify(safe));
    return true;
  } catch (e) {
    if (!warned) console.warn('Não consegui salvar as preferências de áudio neste navegador.');
    warned = true;
    return false;
  }
}
