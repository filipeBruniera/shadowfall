import { makeRng } from './rng.js';
import { T, isSolid } from './data.js';

export const MAP_W = 72;
export const MAP_H = 72;

// Mesma seed + mesmo andar = mesmo mapa nos dois lados da conexão.
export function generateMap(seed, floor) {
  const rng = makeRng((seed ^ (floor * 0x9e3779b9)) >>> 0);
  const w = MAP_W,
    h = MAP_H;
  const tiles = new Uint8Array(w * h);
  const rooms = [];
  const decor = [];

  const roomTries = 140;
  const target = 16 + Math.min(8, floor);
  for (let i = 0; i < roomTries && rooms.length < target; i++) {
    const rw = rng.int(7, 14);
    const rh = rng.int(7, 14);
    const rx = rng.int(3, w - rw - 4);
    const ry = rng.int(3, h - rh - 4);
    let overlaps = false;
    for (const r of rooms) {
      if (rx < r.x + r.w + 3 && rx + rw + 3 > r.x && ry < r.y + r.h + 3 && ry + rh + 3 > r.y) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;
    rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) });
  }

  const carve = (x, y, tile) => {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return;
    tiles[y * w + x] = tile;
  };

  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) carve(x, y, T.FLOOR);
    }
  }

  // Corredores em L ligando salas consecutivas + alguns atalhos.
  const link = (a, b) => {
    let x = a.cx,
      y = a.cy;
    const horizFirst = rng.chance(0.5);
    const stepX = () => {
      while (x !== b.cx) {
        carve(x, y, T.FLOOR);
        carve(x, y + 1, T.FLOOR);
        x += x < b.cx ? 1 : -1;
      }
    };
    const stepY = () => {
      while (y !== b.cy) {
        carve(x, y, T.FLOOR);
        carve(x + 1, y, T.FLOOR);
        y += y < b.cy ? 1 : -1;
      }
    };
    if (horizFirst) {
      stepX();
      stepY();
    } else {
      stepY();
      stepX();
    }
    carve(b.cx, b.cy, T.FLOOR);
  };
  for (let i = 1; i < rooms.length; i++) link(rooms[i - 1], rooms[i]);
  for (let i = 0; i < Math.floor(rooms.length / 4); i++) link(rng.pick(rooms), rng.pick(rooms));

  // Paredes em toda borda de chão.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (tiles[y * w + x] !== T.VOID) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (tiles[(y + dy) * w + (x + dx)] === T.FLOOR) {
            near = true;
            break;
          }
        }
      }
      if (near) tiles[y * w + x] = T.WALL;
    }
  }

  // Bioma e detalhes por sala.
  const spawnRoom = rooms[0];
  let bossRoom = rooms[0];
  let bestDist = -1;
  for (const r of rooms) {
    const d = Math.abs(r.cx - spawnRoom.cx) + Math.abs(r.cy - spawnRoom.cy);
    if (d > bestDist) {
      bestDist = d;
      bossRoom = r;
    }
  }

  for (const r of rooms) {
    if (r === spawnRoom) continue;
    const roll = rng.next();
    if (r !== bossRoom && roll < 0.22) {
      // poça de lava ou água
      const isLava = rng.chance(0.55 + floor * 0.03);
      const px = rng.int(r.x + 2, r.x + r.w - 4);
      const py = rng.int(r.y + 2, r.y + r.h - 4);
      const pw = rng.int(2, 4),
        ph = rng.int(2, 3);
      for (let y = py; y < py + ph; y++) {
        for (let x = px; x < px + pw; x++) {
          if (tiles[y * w + x] === T.FLOOR) tiles[y * w + x] = isLava ? T.LAVA : T.WATER;
        }
      }
    } else if (roll < 0.4) {
      for (let i = 0; i < rng.int(4, 10); i++) {
        const x = rng.int(r.x + 1, r.x + r.w - 2),
          y = rng.int(r.y + 1, r.y + r.h - 2);
        if (tiles[y * w + x] === T.FLOOR) tiles[y * w + x] = T.GRASS;
      }
    } else if (roll < 0.52) {
      for (let i = 0; i < rng.int(2, 5); i++) {
        const x = rng.int(r.x + 1, r.x + r.w - 2),
          y = rng.int(r.y + 1, r.y + r.h - 2);
        if (tiles[y * w + x] === T.FLOOR) tiles[y * w + x] = T.RUBBLE;
      }
    }

    // Braseiros nos cantos: viram fonte de luz no render.
    if (rng.chance(0.6)) {
      const corners = [
        [r.x + 1, r.y + 1],
        [r.x + r.w - 2, r.y + 1],
        [r.x + 1, r.y + r.h - 2],
        [r.x + r.w - 2, r.y + r.h - 2],
      ];
      for (const [bx, by] of corners) {
        if (rng.chance(0.5) && tiles[by * w + bx] === T.FLOOR) {
          tiles[by * w + bx] = T.BRAZIER;
          decor.push({ x: bx, y: by, type: 'brazier' });
        }
      }
    }
  }

  // Portal de saída no centro da sala do chefe.
  const portal = { x: bossRoom.cx, y: bossRoom.cy };
  tiles[portal.y * w + portal.x] = T.FLOOR;

  const spawn = { x: spawnRoom.cx + 0.5, y: spawnRoom.cy + 0.5 };

  return { w, h, tiles, rooms, spawn, portal, bossRoom, spawnRoom, decor, floor, seed };
}

export function tileAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return T.VOID;
  return map.tiles[y * map.w + x];
}

export function solidAt(map, x, y) {
  return isSolid(tileAt(map, Math.floor(x), Math.floor(y)));
}

export function walkable(map, tx, ty) {
  return !isSolid(tileAt(map, tx, ty));
}

// Campo de distância (BFS) a partir dos jogadores — os monstros só descem o gradiente.
// Muito mais barato e estável que rodar A* por monstro a cada frame.
export function buildFlowField(map, sources) {
  const { w, h } = map;
  const dist = new Int16Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let head = 0,
    tail = 0;
  for (const s of sources) {
    const sx = Math.floor(s.x),
      sy = Math.floor(s.y);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const idx = sy * w + sx;
    if (dist[idx] !== -1) continue;
    dist[idx] = 0;
    queue[tail++] = idx;
  }
  const N = [-w, w, -1, 1];
  while (head < tail) {
    const idx = queue[head++];
    const d = dist[idx];
    if (d > 80) continue;
    const x = idx % w;
    for (let i = 0; i < 4; i++) {
      const nIdx = idx + N[i];
      if (nIdx < 0 || nIdx >= w * h) continue;
      if (i >= 2) {
        const nx = nIdx % w;
        if (Math.abs(nx - x) !== 1) continue; // não vaza pela borda
      }
      if (dist[nIdx] !== -1) continue;
      if (isSolid(map.tiles[nIdx])) continue;
      dist[nIdx] = d + 1;
      queue[tail++] = nIdx;
    }
  }
  return dist;
}

// A* curtinho, usado só pelo clique-para-andar do jogador local.
export function findPath(map, sx, sy, tx, ty, maxNodes = 4000) {
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  tx = Math.floor(tx);
  ty = Math.floor(ty);
  if (!walkable(map, tx, ty)) return null;
  if (sx === tx && sy === ty) return [];
  const { w } = map;
  const startIdx = sy * w + sx,
    goalIdx = ty * w + tx;
  const came = new Map();
  const gScore = new Map([[startIdx, 0]]);
  const open = [{ idx: startIdx, f: 0 }];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  let nodes = 0;
  while (open.length && nodes++ < maxNodes) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    if (cur.idx === goalIdx) {
      const path = [];
      let i = goalIdx;
      while (i !== startIdx) {
        path.unshift({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 });
        i = came.get(i);
        if (i === undefined) return null;
      }
      return path;
    }
    const cx = cur.idx % w,
      cy = Math.floor(cur.idx / w);
    const cg = gScore.get(cur.idx) ?? Infinity;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx,
        ny = cy + dy;
      if (!walkable(map, nx, ny)) continue;
      if (dx && dy && (!walkable(map, cx + dx, cy) || !walkable(map, cx, cy + dy))) continue;
      const nIdx = ny * w + nx;
      const ng = cg + (dx && dy ? 1.414 : 1);
      if (ng >= (gScore.get(nIdx) ?? Infinity)) continue;
      gScore.set(nIdx, ng);
      came.set(nIdx, cur.idx);
      open.push({ idx: nIdx, f: ng + Math.hypot(tx - nx, ty - ny) });
    }
  }
  return null;
}
