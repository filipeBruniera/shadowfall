import { MUSIC_FADE_TIME, SFX_MAX_VOICES } from './balance.js';

const TONES = {
  cast: [520, 0.09],
  hit: [130, 0.07],
  death: [80, 0.35],
  loot: [880, 0.14],
  portal: [330, 0.45],
};

export function createWebAudioBackend() {
  let context = null;
  let unavailable = false;
  let musicGain = null;
  let sfxGain = null;
  let track = null;
  let prefs = { muted: false, music: 0.5, sfx: 0.7 };
  let voices = 0;

  const ensure = () => {
    if (context) return context;
    if (unavailable) return null;
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      context = new AudioCtx();
    } catch (e) {
      // A camada é opcional: navegador restrito não pode repetir construtores
      // falhos a cada troca de tela nem impedir a partida de continuar.
      unavailable = true;
      return null;
    }
    musicGain = context.createGain();
    sfxGain = context.createGain();
    musicGain.connect(context.destination);
    sfxGain.connect(context.destination);
    applyGains(prefs);
    return context;
  };

  function applyGains(next) {
    prefs = { ...prefs, ...next };
    if (!context) return;
    musicGain.gain.setTargetAtTime(prefs.muted ? 0 : prefs.music, context.currentTime, 0.02);
    sfxGain.gain.setTargetAtTime(prefs.muted ? 0 : prefs.sfx, context.currentTime, 0.02);
  }

  function stopTrack() {
    if (!track || !context) return;
    const old = track;
    old.gain.gain.linearRampToValueAtTime(0, context.currentTime + MUSIC_FADE_TIME);
    old.oscillators.forEach(node => node.stop(context.currentTime + MUSIC_FADE_TIME));
    track = null;
  }

  return {
    async unlock() {
      const ctx = ensure();
      if (!ctx) return false;
      if (ctx.state === 'suspended') await ctx.resume();
      return ctx.state === 'running';
    },
    preload() {
      ensure();
    },
    applyGains,
    setTrack(name) {
      const ctx = ensure();
      if (!ctx || track?.name === name) return;
      stopTrack();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(musicGain);
      const frequencies = name === 'bossfight' ? [82, 123] : [55, 82];
      const oscillators = frequencies.map((frequency, index) => {
        const oscillator = ctx.createOscillator();
        oscillator.type = index ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start();
        return oscillator;
      });
      gain.gain.linearRampToValueAtTime(0.09, ctx.currentTime + MUSIC_FADE_TIME);
      track = { name, gain, oscillators };
    },
    stopTrack,
    playSfx(name) {
      const ctx = ensure();
      const tone = TONES[name];
      if (!ctx || !tone || voices >= SFX_MAX_VOICES) return false;
      voices++;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = tone[0];
      oscillator.type = name === 'hit' || name === 'death' ? 'sawtooth' : 'triangle';
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + tone[1]);
      oscillator.connect(gain);
      gain.connect(sfxGain);
      oscillator.onended = () => {
        voices = Math.max(0, voices - 1);
      };
      oscillator.start();
      oscillator.stop(ctx.currentTime + tone[1]);
      return true;
    },
  };
}
