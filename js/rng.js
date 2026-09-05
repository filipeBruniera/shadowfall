// Deterministic RNG — host and guest generate the exact same dungeon from a seed.
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const r = mulberry32(seed >>> 0);
  return {
    next: r,
    range: (a, b) => a + r() * (b - a),
    int: (a, b) => Math.floor(a + r() * (b - a + 1)),
    pick: arr => arr[Math.floor(r() * arr.length)],
    chance: p => r() < p,
    weighted: entries => {
      // entries: [[value, weight], ...]
      let total = 0;
      for (const e of entries) total += e[1];
      let roll = r() * total;
      for (const e of entries) {
        roll -= e[1];
        if (roll <= 0) return e[0];
      }
      return entries[entries.length - 1][0];
    },
  };
}

// Stable per-tile hash — used for floor texture variation without storing anything.
export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

// 4-char room codes, no ambiguous glyphs.
const CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXYZ34679';
export function roomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export function seedFromCode(code) {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
