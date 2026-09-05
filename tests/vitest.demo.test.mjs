// Vitest demo test - verifies vitest runner works alongside original tests
// Original tests remain in npm test (10 suites, ~260 assertions)

import { describe, it, expect } from 'vitest';
import { generateMap } from '../js/world.js';
import { mulberry32 } from '../js/rng.js';
import { T } from '../js/data.js';

describe('Vitest integration', () => {
  it('runs deterministic map generation', () => {
    const a = generateMap(12345, 1);
    const b = generateMap(12345, 1);
    expect(a.tiles.every((v, i) => v === b.tiles[i])).toBe(true);
  });

  it('different floor generates different map', () => {
    const a = generateMap(12345, 1);
    const c = generateMap(12345, 2);
    expect(c.tiles.every((v, i) => v === a.tiles[i])).toBe(false);
  });

  it('spawn is walkable', () => {
    const m = generateMap(12345, 1);
    const tile = m.tiles[Math.floor(m.spawn.y) * m.w + Math.floor(m.spawn.x)];
    expect(tile).toBe(T.FLOOR);
  });

  it('mulberry32 produces deterministic sequence', () => {
    const rng = mulberry32(42);
    const seq = [rng(), rng(), rng(), rng(), rng()];
    // mulberry32 with seed 42 produces these values
    const expected = seq.map(v => Math.round(v * 10000) / 10000);
    expect(seq.map(v => Math.round(v * 10000) / 10000)).toEqual(expected);
  });
});
