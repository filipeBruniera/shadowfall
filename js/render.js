import { TILE_W, TILE_H, WALL_H, T, VOCATIONS, RARITY, ELEM_COLOR } from './data.js';
import { hash2 } from './rng.js';
import { EMBER_LINK_MIN, BOSS_WINDUP, MONSTER_WINDUP } from './balance.js';

export const cam = { x: 0, y: 0, zoom: 1, shake: 0, shakeX: 0, shakeY: 0 };
const HALF_W = TILE_W / 2, HALF_H = TILE_H / 2;

export function project(x, y) {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H };
}

export function screenToWorld(sx, sy, canvas) {
  const wx = (sx - canvas.width / 2) / cam.zoom + cam.x;
  const wy = (sy - canvas.height / 2) / cam.zoom + cam.y;
  return {
    x: (wx / HALF_W + wy / HALF_H) / 2,
    y: (wy / HALF_H - wx / HALF_W) / 2,
  };
}

export function worldToScreen(x, y, canvas) {
  const p = project(x, y);
  return {
    x: (p.x - cam.x) * cam.zoom + canvas.width / 2,
    y: (p.y - cam.y) * cam.zoom + canvas.height / 2,
  };
}

// ============================================================
// EFEITOS VISUAIS (vivem só no cliente, alimentados por eventos do sim)
// ============================================================
export const fx = { floaters: [], particles: [], flashes: [], beams: [], rings: [] };
if (typeof window !== 'undefined') window.__FX = fx;

export function spawnFloater(x, y, text, color, opts = {}) {
  fx.floaters.push({
    x, y, text, color, life: opts.small ? 0.7 : 1.1, max: opts.small ? 0.7 : 1.1,
    vy: -1.2, dx: (Math.random() - 0.5) * 0.5,
    size: opts.crit ? 20 : opts.big ? 16 : opts.small ? 11 : 13,
    crit: !!opts.crit,
  });
}

export function spawnParticles(x, y, color, count, opts = {}) {
  for (let i = 0; i < count; i++) {
    const a = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread || 1) : Math.random() * Math.PI * 2;
    const sp = (opts.speed || 3) * (0.4 + Math.random() * 0.8);
    fx.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: (opts.life || 0.6) * (0.6 + Math.random() * 0.6),
      max: opts.life || 0.6, color, size: opts.size || 3, rise: opts.rise || 0,
    });
  }
}

// `hold`: o anel fica no raio real e ganha presença até o impacto, em vez de
// crescer e sumir. É o que a telegrafia precisa — um anel que se apaga bem na
// hora em que o golpe cai não avisa ninguém, e um que só chega ao raio
// verdadeiro no fim engana quem se afastou até a borda visível.
export function spawnRing(x, y, r, color, opts = {}) {
  fx.rings.push({
    x, y, r, color, life: opts.life || 0.45, max: opts.life || 0.45,
    fill: !!opts.fill, width: opts.width || 3, hold: !!opts.hold,
  });
}

// ---------- Telegrafia ----------
// Duração total da janela por id de monstro, aprendida pelo evento CT-02. Sem
// isso o anel não teria como saber quanto dura a carga: o snapshot só carrega
// o que falta (`w`), nunca o total.
const telegraphTotals = new Map();

export function registerTelegraph(id, total) {
  if (total > 0) telegraphTotals.set(id, total);
}

// Fallback quando o anel começa a ser desenhado sem o evento correspondente —
// convidado que entrou no meio da carga, ou pacote de evento descartado. Vem de
// balance.js e nunca de literal (AGENTS.md:38).
export function telegraphTotal(m) {
  const known = telegraphTotals.get(m.id);
  if (known > 0) return known;
  return m.isBoss ? BOSS_WINDUP : MONSTER_WINDUP;
}

export function forgetTelegraph(id) {
  telegraphTotals.delete(id);
}

// Progresso do anel de carga: 0 no primeiro tique da janela, 1 no último,
// qualquer que seja a duração. O divisor fixo de 0.5s que existia aqui mentia
// para toda telegrafia mais longa que o windup genérico.
export function telegraphProgress(remaining, total) {
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, 1 - remaining / total));
}

export function spawnBeam(x, y, x2, y2, color, life = 0.3) {
  fx.beams.push({ x, y, x2, y2, color, life, max: life });
}

export function updateFx(dt) {
  for (let i = fx.floaters.length - 1; i >= 0; i--) {
    const f = fx.floaters[i];
    f.life -= dt; f.y += f.vy * dt * 0.55; f.x += f.dx * dt * 0.3;
    if (f.life <= 0) fx.floaters.splice(i, 1);
  }
  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.94; p.vy *= 0.94;
    if (p.life <= 0) fx.particles.splice(i, 1);
  }
  for (let i = fx.rings.length - 1; i >= 0; i--) {
    const r = fx.rings[i]; r.life -= dt;
    if (r.life <= 0) fx.rings.splice(i, 1);
  }
  for (let i = fx.beams.length - 1; i >= 0; i--) {
    const b = fx.beams[i]; b.life -= dt;
    if (b.life <= 0) fx.beams.splice(i, 1);
  }
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt * 38);
    cam.shakeX = (Math.random() - 0.5) * cam.shake;
    cam.shakeY = (Math.random() - 0.5) * cam.shake * 0.6;
  } else { cam.shakeX = 0; cam.shakeY = 0; }
}

// Traduz eventos do simulador em coisas bonitas na tela.
export function handleFxEvent(ev) {
  switch (ev.t) {
    case 'd':
      spawnFloater(ev.x, ev.y, ev.v, ev.c, { crit: ev.crit, big: ev.big, small: ev.small });
      break;
    case 'shake':
      cam.shake = Math.max(cam.shake, ev.v);
      break;
    case 'fx':
      switch (ev.k) {
        case 'slash':
          spawnParticles(ev.x, ev.y, ev.c || '#ffffff', 6, { angle: ev.a, spread: 1.1, speed: 4, life: 0.25, size: 2 });
          spawnRing(ev.x, ev.y, 0.6, ev.c || '#fff', { life: 0.18, width: 2 });
          break;
        case 'nova':
          spawnRing(ev.x, ev.y, ev.r, ev.c, { life: 0.5, width: 5 });
          spawnRing(ev.x, ev.y, ev.r * 0.6, ev.c, { life: 0.35, width: 3 });
          spawnParticles(ev.x, ev.y, ev.c, 26, { speed: 7, life: 0.6, size: 3 });
          break;
        case 'wave':
          for (let i = 0; i < 14; i++) {
            const d = (i / 14) * ev.r;
            spawnParticles(ev.x + Math.cos(ev.a) * d, ev.y + Math.sin(ev.a) * d, ev.c, 3,
              { angle: ev.a, spread: 2.4, speed: 2.5, life: 0.4, size: 3 });
          }
          spawnBeam(ev.x, ev.y, ev.x + Math.cos(ev.a) * ev.r, ev.y + Math.sin(ev.a) * ev.r, ev.c, 0.22);
          break;
        case 'ground':
          spawnRing(ev.x, ev.y, ev.r, ev.c, { life: 0.6, width: 4 });
          break;
        case 'impact':
          spawnParticles(ev.x, ev.y, ev.c, 8, { speed: 4, life: 0.35, size: 3 });
          break;
        case 'cast':
          spawnRing(ev.x, ev.y, 0.9, ev.c, { life: 0.3, width: 2 });
          break;
        case 'death':
          spawnParticles(ev.x, ev.y, ev.c, ev.boss ? 60 : 16, { speed: ev.boss ? 9 : 5, life: ev.boss ? 1.2 : 0.7, size: ev.boss ? 5 : 3 });
          if (ev.boss) { spawnRing(ev.x, ev.y, 5, '#ff9c2f', { life: 1.0, width: 8 }); cam.shake = 22; }
          break;
        case 'heal':
          spawnParticles(ev.x, ev.y, '#7de08a', 14, { speed: 2, life: 0.8, size: 3 });
          break;
        case 'revive':
          spawnRing(ev.x, ev.y, 2.2, '#ffe8a3', { life: 0.9, width: 5 });
          spawnParticles(ev.x, ev.y, '#ffe8a3', 30, { speed: 4, life: 1.0, size: 3 });
          break;
        case 'level':
          spawnRing(ev.x, ev.y, 2.6, '#ffd84d', { life: 0.9, width: 6 });
          spawnParticles(ev.x, ev.y, '#ffd84d', 34, { speed: 5, life: 1.1, size: 3 });
          spawnFloater(ev.x, ev.y - 0.4, 'NÍVEL!', '#ffd84d', { crit: true });
          break;
        case 'buff':
          spawnRing(ev.x, ev.y, 1.6, ev.c, { life: 0.7, width: 4 });
          break;
        case 'dash':
          spawnBeam(ev.x, ev.y, ev.x2, ev.y2, ev.c, 0.3);
          spawnParticles(ev.x, ev.y, ev.c, 12, { speed: 3, life: 0.4, size: 2 });
          break;
        case 'summon':
          spawnRing(ev.x, ev.y, 1.2, '#b06bff', { life: 0.6, width: 3 });
          break;
        case 'playerDeath':
          spawnParticles(ev.x, ev.y, '#ff5a4a', 30, { speed: 5, life: 1.0, size: 3 });
          cam.shake = 14;
          break;
        case 'windup':
          spawnRing(ev.x, ev.y, 0.8, '#ff7a2f', { life: 0.3, width: 2 });
          break;
        case 'telegraph':
          // O aviso desenha a área ameaçada inteira: é o que dá ao grupo a
          // chance de sair antes de o golpe existir no mundo. `hold` é o que
          // torna isso verdade — sem ele o anel só passava pelo raio real no
          // meio da janela, e já quase transparente.
          spawnRing(ev.x, ev.y, ev.r, ev.c, { life: ev.d, width: 4, hold: true });
          registerTelegraph(ev.id, ev.d);
          break;
        default: break;
      }
      break;
    default: break;
  }
}

// ============================================================
// DESENHO DO MUNDO
// ============================================================
let lightCanvas = null, lightCtx = null;

let vignette = null;
function getVignette(w, h) {
  if (vignette && vignette.width === w && vignette.height === h) return vignette;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  vignette = cv;
  return cv;
}
const LIGHT_DIV = 2; // buffer de luz em meia resolucao: 4x menos pixels, mesma aparencia
function ensureLight(canvas) {
  const w = Math.max(1, Math.round(canvas.width / LIGHT_DIV));
  const h = Math.max(1, Math.round(canvas.height / LIGHT_DIV));
  if (!lightCanvas || lightCanvas.width !== w || lightCanvas.height !== h) {
    lightCanvas = document.createElement('canvas');
    lightCanvas.width = w;
    lightCanvas.height = h;
    lightCtx = lightCanvas.getContext('2d');
  }
}

function diamondPath(path, px, py, w = TILE_W, h = TILE_H) {
  const hw = w / 2, hh = h / 2;
  path.moveTo(px, py - hh);
  path.lineTo(px + hw, py);
  path.lineTo(px, py + hh);
  path.lineTo(px - hw, py);
  path.closePath();
}

function diamond(ctx, px, py, w = TILE_W, h = TILE_H) {
  ctx.beginPath();
  ctx.moveTo(px, py - h / 2);
  ctx.lineTo(px + w / 2, py);
  ctx.lineTo(px, py + h / 2);
  ctx.lineTo(px - w / 2, py);
  ctx.closePath();
}

export const SPRITE_SCALE = 1.28;

const FLOOR_PALETTE = {
  [T.FLOOR]: ['#332c3d', '#2d2735', '#392f44'],
  [T.GRASS]: ['#2b3b29', '#31432c', '#263424'],
  [T.RUBBLE]: ['#3d3544', '#342d3b'],
  [T.WATER]: ['#1d3358', '#223c66'],
  [T.LAVA]: ['#5c2110', '#6e290f'],
};

export function drawWorld(ctx, canvas, view, now) {
  const { map, monsters, players, items, projectiles, zones, localId } = view;
  ctx.fillStyle = '#07060a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(canvas.width / 2 + cam.shakeX, canvas.height / 2 + cam.shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // Limites visíveis em coordenadas de tile
  const pad = 3;
  const halfW = canvas.width / 2 / cam.zoom, halfH = canvas.height / 2 / cam.zoom;
  const corners = [
    [cam.x - halfW, cam.y - halfH], [cam.x + halfW, cam.y - halfH],
    [cam.x - halfW, cam.y + halfH], [cam.x + halfW, cam.y + halfH],
  ].map(([wx, wy]) => ({ x: (wx / HALF_W + wy / HALF_H) / 2, y: (wy / HALF_H - wx / HALF_W) / 2 }));
  const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))) - pad);
  const maxX = Math.min(map.w - 1, Math.ceil(Math.max(...corners.map((c) => c.x))) + pad);
  const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))) - pad);
  const maxY = Math.min(map.h - 1, Math.ceil(Math.max(...corners.map((c) => c.y))) + pad);

  const P = (typeof window!=='undefined') && window.__PROF;
  const mark = P ? (k)=>{ const n=performance.now(); if(P.last!=null) P.t[P.k]=(P.t[P.k]||0)+n-P.last; P.k=k; P.last=n; } : ()=>{};
  mark('setup');
  const lights = [];
  const local = players.find((p) => p.id === localId);
  const walls = [];

  mark('floor');
  // --- Chão ---
  // Um fill/stroke por tile custava 22ms/quadro. Agora tudo vira lote:
  // um Path2D por cor, um fill por lote. Mesmo desenho, ~4x mais barato.
  const batch = new Map();
  const gridPath = new Path2D();
  const grassPath = new Path2D();
  const rubblePath = new Path2D();
  const crackPath = new Path2D();
  const lavaPath = new Path2D();
  const waterPath = new Path2D();
  let lavaPulse = 0, waterPulse = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = map.tiles[y * map.w + x];
      if (t === T.VOID) continue;
      const p = project(x + 0.5, y + 0.5);
      if (t === T.WALL || t === T.BRAZIER) { walls.push({ x, y, t, px: p.x, py: p.y, depth: x + y }); continue; }

      const n = hash2(x, y);
      const pal = FLOOR_PALETTE[t] || FLOOR_PALETTE[T.FLOOR];
      const col = pal[Math.floor(n * pal.length)];
      let path = batch.get(col);
      if (!path) { path = new Path2D(); batch.set(col, path); }
      diamondPath(path, p.x, p.y);
      diamondPath(gridPath, p.x, p.y);

      if (t === T.LAVA) {
        diamondPath(lavaPath, p.x, p.y, TILE_W * 0.82, TILE_H * 0.82);
        lavaPulse = 0.55 + Math.sin(now * 2 + x * 1.7 + y) * 0.25;
        lights.push({ x: x + 0.5, y: y + 0.5, r: 200, c: [255, 120, 40], i: 0.55 });
      } else if (t === T.WATER) {
        diamondPath(waterPath, p.x, p.y, TILE_W * 0.8, TILE_H * 0.8);
        waterPulse = 0.12 + Math.sin(now * 1.5 + x + y) * 0.05;
      } else if (t === T.GRASS) {
        for (let i = 0; i < 3; i++) {
          const gx = p.x - 8 + i * 8 + n * 5, gy = p.y + 2;
          grassPath.moveTo(gx, gy); grassPath.lineTo(gx + (n - 0.5) * 4, gy - 6 - n * 3);
        }
      } else if (t === T.RUBBLE) {
        rubblePath.moveTo(p.x + 10, p.y + 1);
        rubblePath.ellipse(p.x, p.y + 1, 10, 5, 0, 0, Math.PI * 2);
      } else if (n > 0.93) {
        crackPath.moveTo(p.x - 10, p.y - 2);
        crackPath.lineTo(p.x + (n - 0.5) * 12, p.y + 3);
      }
    }
  }

  for (const [col, path] of batch) { ctx.fillStyle = col; ctx.fill(path); }
  if (lavaPulse) { ctx.fillStyle = `rgba(255,110,40,${lavaPulse})`; ctx.fill(lavaPath); }
  if (waterPulse) { ctx.fillStyle = `rgba(90,160,220,${waterPulse})`; ctx.fill(waterPath); }
  ctx.fillStyle = 'rgba(140,130,150,0.22)';
  ctx.fill(rubblePath);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(120,170,90,0.35)';
  ctx.stroke(grassPath);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke(crackPath);
  // grade sutil dá leitura de distância, herança direta do Tibia
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke(gridPath);

  mark('rest');
  // Marca do portal
  if (view.portalOpen) {
    const p = project(map.portal.x + 0.5, map.portal.y + 0.5);
    const pulse = 0.5 + Math.sin(now * 3) * 0.3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(150,90,255,${pulse * 0.5})`;
    diamond(ctx, p.x, p.y, TILE_W * 1.6, TILE_H * 1.6);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = `rgba(200,150,255,${pulse})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      diamond(ctx, p.x, p.y - i * 6, TILE_W * (1.2 - i * 0.25), TILE_H * (1.2 - i * 0.25));
      ctx.stroke();
    }
    lights.push({ x: map.portal.x + 0.5, y: map.portal.y + 0.5, r: 300, c: [150, 90, 255], i: 0.85 });
  }

  // Zonas persistentes (chuva de meteoro, campo de espinhos)
  for (const z of zones) {
    const p = project(z.x, z.y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, z.r * TILE_W * 0.5);
    g.addColorStop(0, hexA(z.color, 0.45));
    g.addColorStop(1, hexA(z.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, z.r * HALF_W, z.r * HALF_H, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = hexA(z.color, 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, z.r * HALF_W, z.r * HALF_H, 0, 0, Math.PI * 2);
    ctx.stroke();
    lights.push({ x: z.x, y: z.y, r: z.r * 60, c: hexRgb(z.color), i: 0.6 });
  }

  // Anéis de efeito no chão
  for (const r of fx.rings) {
    const t = 1 - r.life / r.max;
    const p = project(r.x, r.y);
    const rad = r.hold ? r.r : r.r * (0.4 + t * 0.8);
    if (r.hold) {
      // Área ameaçada inteira, do primeiro quadro ao último, escurecendo por
      // dentro conforme o impacto se aproxima: quem está dentro vê que está.
      ctx.fillStyle = hexA(r.color, 0.06 + t * 0.16);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rad * HALF_W, rad * HALF_H, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA(r.color, 0.45 + t * 0.5);
      ctx.lineWidth = r.width;
    } else {
      ctx.strokeStyle = hexA(r.color, (1 - t) * 0.9);
      ctx.lineWidth = r.width * (1 - t * 0.5);
    }
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rad * HALF_W, rad * HALF_H, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- Fila de profundidade: paredes + entidades ---
  const queue = walls.map((w) => ({ depth: w.depth, kind: 'wall', obj: w }));

  for (const it of items) queue.push({ depth: it.x + it.y, kind: 'item', obj: it });
  for (const m of monsters) queue.push({ depth: m.x + m.y, kind: 'monster', obj: m });
  for (const p of players) queue.push({ depth: p.x + p.y, kind: 'player', obj: p });
  for (const pr of projectiles) queue.push({ depth: pr.x + pr.y + 0.4, kind: 'proj', obj: pr });
  queue.sort((a, b) => a.depth - b.depth);

  const localDepth = local ? local.x + local.y : 0;

  const wallAcc = makeWallAcc();
  for (const q of queue) {
    if (q.kind === 'wall') {
      const w = q.obj;
      // Parede na frente do herói vira translúcida — sem isso o jogo é injogável em corredor.
      let alpha = 1;
      if (local && w.depth > localDepth + 0.5) {
        const dx = Math.abs(w.x - local.x), dy = Math.abs(w.y - local.y);
        if (dx < 3.2 && dy < 3.2) alpha = 0.32;
      }
      collectWall(wallAcc, ctx, w, alpha, now, lights);
      continue;
    }
    flushWalls(wallAcc, ctx);
    if (q.kind === 'item') {
      drawItem(ctx, q.obj, now);
    } else if (q.kind === 'monster') {
      drawMonster(ctx, q.obj, now, view);
    } else if (q.kind === 'player') {
      drawPlayer(ctx, q.obj, now, view, lights);
    } else {
      drawProjectile(ctx, q.obj, lights);
    }
  }
  flushWalls(wallAcc, ctx);

  // Elo entre os heróis: uma linha só, ligando ao aliado mais próximo acima do
  // limite. Com 9 aliados distantes, desenhar nove linhas seria poluição e custo.
  if (players.length > 1 && local) {
    let perto = null, pertoD = Infinity;
    for (const o of players) {
      if (o.id === localId) continue;
      const dd = Math.hypot(o.x - local.x, o.y - local.y);
      if (dd < pertoD) { pertoD = dd; perto = o; }
    }
    for (const o of perto && pertoD >= EMBER_LINK_MIN ? [perto] : []) {
      const d = pertoD;
      const a = project(local.x, local.y), b = project(o.x, o.y);
      const steps = 22;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const ex = a.x + (b.x - a.x) * t;
        const ey = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 26;
        const flick = 0.25 + Math.sin(now * 5 + i) * 0.15;
        ctx.fillStyle = `rgba(255,140,60,${flick})`;
        ctx.beginPath();
        ctx.arc(ex, ey, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Feixes
  for (const b of fx.beams) {
    const t = 1 - b.life / b.max;
    const a = project(b.x, b.y), c = project(b.x2, b.y2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(b.color, (1 - t) * 0.85);
    ctx.lineWidth = 10 * (1 - t) + 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 14); ctx.lineTo(c.x, c.y - 14);
    ctx.stroke();
    ctx.restore();
  }

  // Partículas
  for (const p of fx.particles) {
    const t = p.life / p.max;
    const sp = project(p.x, p.y);
    ctx.globalAlpha = Math.max(0, Math.min(1, t));
    ctx.fillStyle = p.color;
    const s = p.size * (0.5 + t * 0.8);
    ctx.fillRect(sp.x - s / 2, sp.y - 12 - s / 2, s, s);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // --- Iluminação ---
  mark('light');
  drawLighting(ctx, canvas, lights, view, now);
  mark(null);

  // --- Números de dano (sem zoom, sempre legíveis) ---
  ctx.save();
  ctx.textAlign = 'center';
  for (const f of fx.floaters) {
    const s = worldToScreen(f.x, f.y, canvas);
    const t = f.life / f.max;
    ctx.globalAlpha = Math.min(1, t * 1.8);
    ctx.font = `${f.crit ? '900' : '700'} ${f.size}px "Alegreya Sans", system-ui, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    const yy = s.y - 30 - (1 - t) * 26;
    ctx.strokeText(f.text, s.x, yy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, s.x, yy);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}


// Paredes em lote: acumula faces por (alpha, cor do topo) e descarrega
// sempre que uma entidade precisa entrar na frente. Mantém a ordem de
// profundidade e troca ~5 chamadas de path por parede por 5 no lote inteiro.
function makeWallAcc() { return new Map(); }

function collectWall(acc, ctx, w, alpha, now, lights) {
  const { px, py, t } = w;
  const n = hash2(w.x, w.y);
  const top = t === T.BRAZIER ? '#4a4053' : (n > 0.5 ? '#524860' : '#483f56');
  const key = alpha + '|' + top;
  let g = acc.get(key);
  if (!g) {
    g = { alpha, top, left: new Path2D(), right: new Path2D(), topP: new Path2D(), detail: new Path2D() };
    acc.set(key, g);
  }

  g.left.moveTo(px - HALF_W, py);
  g.left.lineTo(px, py + HALF_H);
  g.left.lineTo(px, py + HALF_H - WALL_H);
  g.left.lineTo(px - HALF_W, py - WALL_H);
  g.left.closePath();

  g.right.moveTo(px + HALF_W, py);
  g.right.lineTo(px, py + HALF_H);
  g.right.lineTo(px, py + HALF_H - WALL_H);
  g.right.lineTo(px + HALF_W, py - WALL_H);
  g.right.closePath();

  diamondPath(g.topP, px, py - WALL_H);

  if (n > 0.6) {
    g.detail.moveTo(px - HALF_W + 6, py - WALL_H + 8);
    g.detail.lineTo(px - 4, py - WALL_H + 14);
  }

  if (t === T.BRAZIER) {
    const flick = 0.7 + Math.sin(now * 9 + w.x * 3.1 + w.y) * 0.3;
    if (!acc.braziers) acc.braziers = [];
    acc.braziers.push({ px, py, flick });
    lights.push({ x: w.x + 0.5, y: w.y + 0.5, r: 285 * flick, c: [255, 150, 60], i: 1.0, h: WALL_H + 8 });
  }
}

function flushWalls(acc, ctx) {
  if (!acc.size && !acc.braziers) return;
  for (const g of acc.values()) {
    ctx.globalAlpha = g.alpha;
    ctx.fillStyle = '#2a2336'; ctx.fill(g.left);
    ctx.fillStyle = '#372e45'; ctx.fill(g.right);
    ctx.fillStyle = g.top; ctx.fill(g.topP);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke(g.topP);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke(g.detail);
  }
  if (acc.braziers) {
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of acc.braziers) {
      const r = 26 * b.flick;
      const g2 = ctx.createRadialGradient(b.px, b.py - WALL_H - 8, 0, b.px, b.py - WALL_H - 8, r);
      g2.addColorStop(0, 'rgba(255,190,90,0.95)');
      g2.addColorStop(0.5, 'rgba(255,120,40,0.5)');
      g2.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(b.px, b.py - WALL_H - 8, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    acc.braziers = null;
  }
  ctx.globalAlpha = 1;
  acc.clear();
}

function drawWall(ctx, w, alpha, now, lights) {
  const { px, py, t } = w;
  ctx.globalAlpha = alpha;
  const n = hash2(w.x, w.y);
  const top = t === T.BRAZIER ? '#4a4053' : (n > 0.5 ? '#524860' : '#483f56');
  const left = '#2a2336';
  const right = '#372e45';

  // face esquerda
  ctx.fillStyle = left;
  ctx.beginPath();
  ctx.moveTo(px - HALF_W, py);
  ctx.lineTo(px, py + HALF_H);
  ctx.lineTo(px, py + HALF_H - WALL_H);
  ctx.lineTo(px - HALF_W, py - WALL_H);
  ctx.closePath();
  ctx.fill();

  // face direita
  ctx.fillStyle = right;
  ctx.beginPath();
  ctx.moveTo(px + HALF_W, py);
  ctx.lineTo(px, py + HALF_H);
  ctx.lineTo(px, py + HALF_H - WALL_H);
  ctx.lineTo(px + HALF_W, py - WALL_H);
  ctx.closePath();
  ctx.fill();

  // topo
  ctx.fillStyle = top;
  diamond(ctx, px, py - WALL_H);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // junta de pedra
  if (n > 0.6) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(px - HALF_W + 6, py - WALL_H + 8);
    ctx.lineTo(px - 4, py - WALL_H + 14);
    ctx.stroke();
  }

  if (t === T.BRAZIER) {
    const flick = 0.7 + Math.sin(now * 9 + w.x * 3.1 + w.y) * 0.3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(px, py - WALL_H - 8, 0, px, py - WALL_H - 8, 26 * flick);
    g.addColorStop(0, 'rgba(255,190,90,0.95)');
    g.addColorStop(0.5, 'rgba(255,120,40,0.5)');
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py - WALL_H - 8, 26 * flick, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    lights.push({ x: w.x + 0.5, y: w.y + 0.5, r: 285 * flick, c: [255, 150, 60], i: 1.0, h: WALL_H + 8 });
  }
  ctx.globalAlpha = 1;
}

function shadow(ctx, px, py, size) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(px, py, 13 * size, 6 * size, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawItem(ctx, it, now) {
  const p = project(it.x, it.y);
  const bob = Math.sin(now * 2.5 + it.id) * 3;
  const color = RARITY[it.rarity]?.color || '#a49b88';
  shadow(ctx, p.x, p.y, 0.5);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(p.x, p.y - 8 + bob, 0, p.x, p.y - 8 + bob, 22);
  g.addColorStop(0, hexA(color, 0.5));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.x, p.y - 8 + bob, 22, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawGlyph(ctx, it.glyph, p.x, p.y - 10 + bob, 1, color);
}

// Ícones vetoriais — sem emoji, para o visual não depender da fonte do sistema.
export function drawGlyph(ctx, glyph, x, y, scale, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.fillStyle = color;
  switch (glyph) {
    case 'gold':
      ctx.fillStyle = '#ffcf6b';
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a8801f';
      ctx.beginPath(); ctx.ellipse(0, 0, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'potionRed': case 'potionBlue': {
      const c = glyph === 'potionRed' ? '#e0324a' : '#4a7ce0';
      ctx.fillStyle = '#2a2333';
      ctx.fillRect(-2, -12, 4, 4);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(6, -8); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-4, -6, 2, 8);
      break;
    }
    case 'sword':
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(3, -6); ctx.lineTo(2, 8); ctx.lineTo(-2, 8); ctx.lineTo(-3, -6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6b5535'; ctx.fillRect(-6, 6, 12, 3);
      break;
    case 'axe':
      ctx.fillRect(-1, -10, 2, 20);
      ctx.beginPath(); ctx.moveTo(1, -10); ctx.quadraticCurveTo(12, -6, 8, 2); ctx.lineTo(1, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    case 'bow':
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 9, -Math.PI / 2.2, Math.PI / 2.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(3, -8); ctx.lineTo(3, 8); ctx.stroke();
      break;
    case 'spear':
      ctx.fillRect(-1, -6, 2, 16);
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(4, -5); ctx.lineTo(-4, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 'wand':
      ctx.fillStyle = '#4a3c2c'; ctx.fillRect(-1.5, -4, 3, 14);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(0, -8, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'rod':
      ctx.fillStyle = '#3c4a2c'; ctx.fillRect(-1.5, -2, 3, 14);
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -8, 6, 0.4, Math.PI * 1.8); ctx.stroke();
      break;
    case 'armor': case 'robe':
      ctx.beginPath();
      ctx.moveTo(-8, -8); ctx.lineTo(8, -8); ctx.lineTo(6, 9); ctx.lineTo(-6, 9); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 9); ctx.stroke();
      break;
    case 'shield':
      ctx.beginPath();
      ctx.moveTo(0, -10); ctx.lineTo(8, -6); ctx.lineTo(7, 5); ctx.lineTo(0, 11); ctx.lineTo(-7, 5); ctx.lineTo(-8, -6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 'book':
      ctx.beginPath(); ctx.moveTo(-9, -7); ctx.lineTo(9, -7); ctx.lineTo(9, 8); ctx.lineTo(-9, 8); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 8); ctx.stroke();
      break;
    case 'boots':
      ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(2, -8); ctx.lineTo(2, 4); ctx.lineTo(9, 4); ctx.lineTo(9, 9);
      ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 'ring':
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 2, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -5, 3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'amulet':
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, -4, 7, 0.2 * Math.PI, 0.8 * Math.PI, true); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(5, 6); ctx.lineTo(0, 11); ctx.lineTo(-5, 6); ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    default:
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function bodyGradient(ctx, px, py, color, h) {
  const g = ctx.createLinearGradient(px, py - h, px, py);
  g.addColorStop(0, lighten(color, 0.35));
  g.addColorStop(1, darken(color, 0.45));
  return g;
}

function drawCreature(ctx, px, py, shape, color, size, opts) {
  const { facing = 1, bob = 0, flash = 0, dead = 0 } = opts;
  const s = size;
  ctx.save();
  ctx.translate(px, py + bob);
  ctx.scale(facing < 0 ? -s : s, s);
  ctx.lineWidth = 1.2 / s;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  const fill = flash > 0 ? '#ffffff' : color;
  const grad = flash > 0 ? '#ffffff' : null;

  const paint = (h) => { ctx.fillStyle = grad || bodyGradient(ctx, 0, 0, fill, h); };

  switch (shape) {
    case 'bones':
      paint(26);
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-4, -14); ctx.lineTo(4, -14); ctx.lineTo(5, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-4, -4 - i * 3.5); ctx.lineTo(4, -4 - i * 3.5); ctx.stroke(); }
      ctx.fillStyle = grad || fill;
      ctx.beginPath(); ctx.arc(0, -20, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.stroke();
      ctx.fillStyle = '#ff5a4a';
      ctx.beginPath(); ctx.arc(-2.4, -21, 1.4, 0, Math.PI * 2); ctx.arc(2.4, -21, 1.4, 0, Math.PI * 2); ctx.fill();
      break;

    case 'beast':
      paint(18);
      ctx.beginPath();
      ctx.ellipse(0, -8, 11, 6.5, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(9, -13, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, -17); ctx.lineTo(8, -22); ctx.lineTo(10, -16); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-10, -10); ctx.quadraticCurveTo(-17, -14, -14, -4); ctx.lineWidth = 2.4 / s;
      ctx.strokeStyle = grad || darken(fill, 0.2); ctx.stroke();
      ctx.fillStyle = '#ffcf6b';
      ctx.beginPath(); ctx.arc(11, -14, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.6 / s;
      for (const lx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(lx, -3); ctx.lineTo(lx, 0); ctx.stroke(); }
      break;

    case 'robed':
      paint(30);
      ctx.beginPath();
      ctx.moveTo(-10, 1); ctx.quadraticCurveTo(-6, -20, 0, -22); ctx.quadraticCurveTo(6, -20, 10, 1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = darken(grad || fill, 0.55);
      ctx.beginPath(); ctx.ellipse(0, -22, 6, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.arc(-2, -22, 1.2, 0, Math.PI * 2); ctx.arc(2, -22, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = darken(grad || fill, 0.2); ctx.lineWidth = 2 / s;
      ctx.beginPath(); ctx.moveTo(9, -26); ctx.lineTo(11, -2); ctx.stroke();
      break;

    case 'brute':
      paint(30);
      ctx.beginPath();
      ctx.moveTo(-12, 1); ctx.lineTo(-9, -19); ctx.lineTo(9, -19); ctx.lineTo(12, 1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -24, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff7a2f';
      ctx.beginPath(); ctx.arc(-2.6, -25, 1.6, 0, Math.PI * 2); ctx.arc(2.6, -25, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = grad || darken(fill, 0.15);
      ctx.beginPath(); ctx.ellipse(-13, -12, 3.5, 7, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(13, -12, 3.5, 7, -0.3, 0, Math.PI * 2); ctx.fill();
      break;

    case 'wisp': {
      const t = Math.sin(Date.now() / 300) * 2;
      ctx.globalAlpha = 0.8;
      paint(24);
      ctx.beginPath();
      ctx.moveTo(-8, 2 + t); ctx.quadraticCurveTo(-9, -18, 0, -22);
      ctx.quadraticCurveTo(9, -18, 8, 2 + t);
      ctx.quadraticCurveTo(4, -2, 0, 2); ctx.quadraticCurveTo(-4, -2, -8, 2 + t);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0b0910';
      ctx.beginPath(); ctx.ellipse(-2.6, -19, 1.5, 2.2, 0, 0, Math.PI * 2); ctx.ellipse(2.6, -19, 1.5, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }

    case 'dragon':
      paint(30);
      ctx.fillStyle = darken(grad || fill, 0.35);
      ctx.beginPath(); ctx.moveTo(-4, -16); ctx.quadraticCurveTo(-22, -30, -14, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, -16); ctx.quadraticCurveTo(22, -30, 14, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
      paint(24);
      ctx.beginPath(); ctx.ellipse(0, -11, 10, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(9, -20, 6.5, 4.5, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd84d';
      ctx.beginPath(); ctx.arc(11, -21, 1.5, 0, Math.PI * 2); ctx.fill();
      break;

    default:
      paint(20);
      ctx.beginPath(); ctx.arc(0, -12, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawMonster(ctx, m, now, view) {
  const msz = m.size * SPRITE_SCALE;
  const p = project(m.x, m.y);
  if (m.hp <= 0) {
    ctx.globalAlpha = Math.max(0, (m.deathFade || 0) / 0.6) * 0.5;
    shadow(ctx, p.x, p.y, msz);
    ctx.globalAlpha = 1;
    return;
  }
  shadow(ctx, p.x, p.y, msz);

  const bob = Math.sin(now * 5 + m.id) * (m.shape === 'wisp' ? 3 : 1.2);
  const facing = Math.cos(m.dir || 0) >= 0 ? 1 : -1;

  if (m.status?.freeze > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(120,210,255,0.25)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 14, 16 * msz, 22 * msz, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawCreature(ctx, p.x, p.y, m.shape, m.color, msz, { facing, bob, flash: m.hitFlash > 0 ? 1 : 0 });

  if (m.status?.burn > 0) {
    for (let i = 0; i < 2; i++) {
      const fx2 = p.x + (Math.random() - 0.5) * 14, fy = p.y - 10 - Math.random() * 18;
      ctx.fillStyle = `rgba(255,${120 + Math.random() * 90 | 0},40,0.7)`;
      ctx.fillRect(fx2, fy, 2.5, 2.5);
    }
  }
  if (m.status?.poison > 0) {
    ctx.fillStyle = 'rgba(143,191,77,0.75)';
    ctx.fillRect(p.x + (Math.random() - 0.5) * 12, p.y - 8 - Math.random() * 12, 2, 2);
  }

  // Barra de vida só quando importa
  const hurt = m.hp < m.maxHp;
  const targeted = view.targetId === m.id;
  if ((hurt || targeted) && !m.isBoss) {
    const w = 30 * msz;
    const barY = p.y - 34 * msz;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(p.x - w / 2 - 1, barY - 1, w + 2, 5);
    ctx.fillStyle = targeted ? '#ff9c2f' : '#c0392b';
    ctx.fillRect(p.x - w / 2, barY, w * Math.max(0, m.hp / m.maxHp), 3);
  }
  if (targeted) {
    ctx.strokeStyle = 'rgba(255,156,47,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 16 * msz, 8 * msz, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (m.isBoss) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p.x, p.y - 10, 2, p.x, p.y - 10, 60);
    g.addColorStop(0, hexA(m.color, 0.35));
    g.addColorStop(1, hexA(m.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y - 10, 60, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (m.windup > 0) {
    ctx.strokeStyle = 'rgba(255,122,47,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 18 * msz, 9 * msz, 0, 0, Math.PI * 2 * telegraphProgress(m.windup, telegraphTotal(m)));
    ctx.stroke();
  } else {
    forgetTelegraph(m.id);
  }
}

// Status sobre o jogador, no mesmo vocabulário visual já usado no monstro
// (drawMonster): congelamento em manto azul, queimadura em fagulhas, veneno em
// pontos verdes. `wither` é o único que precisou de marca nova — ele corta a
// cura recebida pela metade e, sem nada na tela, o jogador só via o druida
// curando menos e não tinha como saber por quê.
function drawPlayerStatus(ctx, p, pos, now) {
  const st = p.status;
  if (!st) return;

  if (st.freeze > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(120,210,255,0.22)';
    ctx.beginPath(); ctx.ellipse(pos.x, pos.y - 14, 15, 21, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (st.stun > 0) {
    ctx.fillStyle = '#ffd84d';
    for (let i = 0; i < 3; i++) {
      const a = now * 5 + (i / 3) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(pos.x + Math.cos(a) * 11, pos.y - 30 + Math.sin(a) * 4, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (st.burn > 0) {
    for (let i = 0; i < 2; i++) {
      const fx2 = pos.x + (Math.random() - 0.5) * 13, fy = pos.y - 10 - Math.random() * 17;
      ctx.fillStyle = `rgba(255,${120 + Math.random() * 90 | 0},40,0.7)`;
      ctx.fillRect(fx2, fy, 2.5, 2.5);
    }
  }
  if (st.poison > 0) {
    ctx.fillStyle = 'rgba(143,191,77,0.75)';
    ctx.fillRect(pos.x + (Math.random() - 0.5) * 12, pos.y - 8 - Math.random() * 12, 2, 2);
  }
  if (st.wither > 0) {
    // Anel roxo pulsando no chão: some junto com o status e é a única pista de
    // que a cura está pela metade.
    ctx.strokeStyle = hexA('#9a5bd6', 0.45 + Math.sin(now * 7) * 0.25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, 15, 7.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(154,91,214,0.7)';
    ctx.fillRect(pos.x + (Math.random() - 0.5) * 12, pos.y - 12 - Math.random() * 14, 2, 2);
  }
}

function drawPlayer(ctx, p, now, view, lights) {
  const pos = project(p.x, p.y);
  const V = VOCATIONS[p.voc] || VOCATIONS.knight;
  const isLocal = p.id === view.localId;

  if (p.dead) {
    ctx.globalAlpha = 0.55;
    shadow(ctx, pos.x, pos.y, SPRITE_SCALE);
    ctx.fillStyle = '#4a4453';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y - 4, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ff5a4a';
    ctx.font = '700 11px "Alegreya Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${p.name} caiu`, pos.x, pos.y - 22);
    if (p.reviveProg > 0) {
      const w = 40;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(pos.x - w / 2, pos.y - 18, w, 4);
      ctx.fillStyle = '#7de08a';
      ctx.fillRect(pos.x - w / 2, pos.y - 18, w * Math.min(1, p.reviveProg / 3.5), 4);
    }
    return;
  }

  shadow(ctx, pos.x, pos.y, SPRITE_SCALE);
  const walking = p.moving ? Math.sin(now * 11) * 2 : Math.sin(now * 2) * 0.8;
  const facing = Math.cos(p.dir || 0) >= 0 ? 1 : -1;

  ctx.save();
  ctx.translate(pos.x, pos.y + walking * 0.4);
  ctx.scale(facing * SPRITE_SCALE, SPRITE_SCALE);

  // capa
  ctx.fillStyle = darken(V.color, 0.55);
  ctx.beginPath();
  ctx.moveTo(-9, 0); ctx.quadraticCurveTo(-11, -18, -3, -24);
  ctx.lineTo(3, -24); ctx.quadraticCurveTo(11, -18, 9, 0);
  ctx.closePath(); ctx.fill();

  // corpo
  const g = ctx.createLinearGradient(0, -24, 0, 0);
  g.addColorStop(0, lighten(V.color, 0.3));
  g.addColorStop(1, darken(V.color, 0.35));
  ctx.fillStyle = p.hurt ? '#ffffff' : g;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-7, 0); ctx.lineTo(-6, -18); ctx.lineTo(6, -18); ctx.lineTo(7, 0);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // cabeça
  ctx.fillStyle = '#d9c2a4';
  ctx.beginPath(); ctx.arc(0, -23, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = darken(V.color, 0.2);
  ctx.beginPath(); ctx.arc(0, -25, 5.6, Math.PI, Math.PI * 2); ctx.fill();

  // arma girando no golpe
  const swing = p.attack > 0 ? (1 - p.attack / 0.22) : 0;
  ctx.save();
  ctx.translate(8, -12);
  ctx.rotate(-0.6 + swing * 2.2);
  if (V.id === 'knight') {
    ctx.fillStyle = '#cfd6e0';
    ctx.fillRect(-1.5, -16, 3, 18);
    ctx.fillStyle = '#6b5535'; ctx.fillRect(-4, 0, 8, 3);
  } else if (V.id === 'paladin') {
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -6, 9, -Math.PI / 2.2, Math.PI / 2.2); ctx.stroke();
  } else {
    ctx.fillStyle = '#4a3c2c'; ctx.fillRect(-1.5, -14, 3, 16);
    ctx.fillStyle = V.color;
    ctx.beginPath(); ctx.arc(0, -16, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.restore();

  if (p.casting > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(pos.x, pos.y - 12, 2, pos.x, pos.y - 12, 34);
    cg.addColorStop(0, hexA(V.color, 0.5));
    cg.addColorStop(1, hexA(V.color, 0));
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(pos.x, pos.y - 12, 34, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  if (p.buffed) {
    ctx.strokeStyle = hexA(V.color, 0.6 + Math.sin(now * 6) * 0.25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, 18, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawPlayerStatus(ctx, p, pos, now);

  // Nome e vida por cima — em co-op você precisa ver a barra do outro de longe.
  ctx.textAlign = 'center';
  ctx.font = '700 11px "Alegreya Sans", sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  const label = isLocal ? p.name : `${p.name} · ${p.level}`;
  ctx.strokeText(label, pos.x, pos.y - 42);
  ctx.fillStyle = isLocal ? '#d6c9ae' : '#8fd4c0';
  ctx.fillText(label, pos.x, pos.y - 42);

  if (!isLocal) {
    const w = 38;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(pos.x - w / 2 - 1, pos.y - 37, w + 2, 5);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(pos.x - w / 2, pos.y - 36, w * Math.max(0, p.hp / p.maxHp), 3);
  }

  lights.push({ x: p.x, y: p.y, r: isLocal ? 445 : 310, c: [255, 205, 150], i: isLocal ? 1.05 : 0.8, h: 14 });
}

function drawProjectile(ctx, pr, lights) {
  const p = project(pr.x, pr.y);
  const c = ELEM_COLOR[pr.elem] || '#fff';
  const size = pr.big ? 7 : 4.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(p.x, p.y - 14, 0, p.x, p.y - 14, size * 3.4);
  g.addColorStop(0, hexA(c, 0.95));
  g.addColorStop(0.4, hexA(c, 0.4));
  g.addColorStop(1, hexA(c, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.x, p.y - 14, size * 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(p.x, p.y - 14, size * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  lights.push({ x: pr.x, y: pr.y, r: pr.big ? 165 : 115, c: hexRgb(c), i: 0.65, h: 14 });
}

function drawLighting(ctx, canvas, lights, view, now) {
  ensureLight(canvas);
  const lc = lightCtx;
  const D = LIGHT_DIV;
  lc.globalCompositeOperation = 'source-over';
  lc.fillStyle = 'rgba(5,4,10,0.865)';
  lc.fillRect(0, 0, lightCanvas.width, lightCanvas.height);

  lc.globalCompositeOperation = 'destination-out';
  for (const L of lights) {
    const sw = worldToScreen(L.x, L.y, canvas);
    const s = { x: sw.x / D, y: sw.y / D };
    const sy = s.y - ((L.h || 10) * cam.zoom) / D;
    const r = (L.r * cam.zoom * (0.96 + Math.sin(now * 7 + L.x) * 0.04)) / D;
    if (s.x + r < 0 || s.x - r > lightCanvas.width || sy + r < 0 || sy - r > lightCanvas.height) continue;
    const g = lc.createRadialGradient(s.x, sy, 0, s.x, sy, r);
    g.addColorStop(0, `rgba(0,0,0,${L.i})`);
    g.addColorStop(0.45, `rgba(0,0,0,${L.i * 0.6})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lc.fillStyle = g;
    lc.beginPath(); lc.arc(s.x, sy, r, 0, Math.PI * 2); lc.fill();
  }
  // Vinheta: estática, então é gerada uma vez e aplicada dentro do buffer de
  // luz (meia resolução) em vez de um gradiente de tela cheia todo quadro.
  lc.globalCompositeOperation = 'source-over';
  lc.drawImage(getVignette(lightCanvas.width, lightCanvas.height), 0, 0);
  ctx.drawImage(lightCanvas, 0, 0, canvas.width, canvas.height);

  // Brilho colorido por cima da escuridão
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    if (!L.c) continue;
    const s = worldToScreen(L.x, L.y, canvas);
    const sy = s.y - (L.h || 10) * cam.zoom;
    const r = L.r * cam.zoom * 0.7;
    if (s.x + r < 0 || s.x - r > canvas.width || sy + r < 0 || sy - r > canvas.height) continue;
    const g = ctx.createRadialGradient(s.x, sy, 0, s.x, sy, r);
    g.addColorStop(0, `rgba(${L.c[0]},${L.c[1]},${L.c[2]},${0.12 * L.i})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x, sy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

}

// ============================================================
// MINIMAPA
// ============================================================
export function drawMinimap(mm, view, now = 0) {
  const ctx = mm.getContext('2d');
  const { map, monsters, players, localId } = view;
  const size = mm.width;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#07060a';
  ctx.fillRect(0, 0, size, size);

  const local = players.find((p) => p.id === localId) || { x: map.w / 2, y: map.h / 2 };
  const span = 46; // tiles visíveis no minimapa
  const scale = size / span;
  const ox = local.x - span / 2, oy = local.y - span / 2;

  for (let y = 0; y < span; y++) {
    for (let x = 0; x < span; x++) {
      const tx = Math.floor(ox + x), ty = Math.floor(oy + y);
      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
      const t = map.tiles[ty * map.w + tx];
      if (t === T.VOID) continue;
      ctx.fillStyle = t === T.WALL || t === T.BRAZIER ? '#241f2c'
        : t === T.LAVA ? '#5a1e0c' : t === T.WATER ? '#16304f' : '#3b3348';
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }

  for (const m of monsters) {
    if (m.hp <= 0) continue;
    const x = (m.x - ox) * scale, y = (m.y - oy) * scale;
    if (x < 0 || y < 0 || x > size || y > size) continue;
    ctx.fillStyle = m.isBoss ? '#ff9c2f' : '#c0392b';
    const r = m.isBoss ? 3.5 : 1.8;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  if (view.portalOpen) {
    const x = (map.portal.x - ox) * scale, y = (map.portal.y - oy) * scale;
    ctx.fillStyle = '#b06bff';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }

  // Aliado fora do trilho do HUD aparece aqui: é o que garante que ninguém
  // some da consciência do grupo com 10 pessoas na sala.
  const railIds = view.railIds || null;
  for (const p of players) {
    const x = (p.x - ox) * scale, y = (p.y - oy) * scale;
    if (p.id === localId) {
      ctx.fillStyle = '#ffe8a3';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    if (p.dead) {
      // Caído pulsa, para ser achado mesmo no meio de nove pontos.
      const pulse = 3.4 + Math.sin(now * 4) * 1.2;
      ctx.strokeStyle = '#b3232b';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, pulse, 0, Math.PI * 2); ctx.stroke();
      continue;
    }
    const V = VOCATIONS[p.voc];
    const noTrilho = !railIds || railIds.includes(p.id);
    ctx.globalAlpha = noTrilho ? 1 : 0.7;
    ctx.fillStyle = V ? V.color : '#8fd4c0';
    ctx.beginPath(); ctx.arc(x, y, noTrilho ? 2.5 : 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = 'rgba(214,201,174,0.25)';
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
}

// ============================================================
// CORES
// ============================================================
function hexRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
export function hexA(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function lighten(hex, amt) {
  const [r, g, b] = hexRgb(hex);
  return `rgb(${Math.min(255, r + 255 * amt) | 0},${Math.min(255, g + 255 * amt) | 0},${Math.min(255, b + 255 * amt) | 0})`;
}
function darken(hex, amt) {
  if (hex.startsWith('rgb')) return hex;
  const [r, g, b] = hexRgb(hex);
  return `rgb(${(r * (1 - amt)) | 0},${(g * (1 - amt)) | 0},${(b * (1 - amt)) | 0})`;
}
