// ============================================================
// SHADOWFALL — atlas de sprites (assets/tiles.png)
// ============================================================
// Pack CC0 "Isometric Miniature Dungeon" (Kenney), retintado para a paleta do
// dungeon por tools/build-atlas.py. Carregamento é assíncrono e SEM promessa de
// sucesso: enquanto a imagem não chega (ou se falhar — teste headless, offline),
// atlasReady() fica false e o render continua no chão procedural. Nada de rede
// ou save depende disto; é puro visual.
import { T } from './data.js';

// Célula fixa do atlas: 64 de largura, 48 de altura (32 do losango do topo +
// 16 de saia/espessura que pende abaixo da linha do chão).
export const ATLAS_CELL_W = 64;
export const ATLAS_CELL_H = 48;

// Linha do atlas por tipo de tile; o número de variantes de cada linha precisa
// bater com tools/build-atlas.py. WATER e LAVA ficam de fora de propósito: são
// animados por pulso no render e o procedural comunica melhor o perigo.
export const ATLAS_ROWS = {
  [T.FLOOR]: { row: 0, variants: 4 },
  [T.RUBBLE]: { row: 1, variants: 2 },
  [T.GRASS]: { row: 2, variants: 2 },
};

// Linha da parede: monólito de obsidiana com espinhos. Célula 64x86:
// 24px de espinho acima + 32 do losango + 30 de extrusão (WALL_H do bloco
// procedural). spikeH é o quanto o sprite sobe ALÉM do topo do bloco — o
// render sobe o destino por ele. BRAZIER fica fora: a chama é procedural.
export const ATLAS_WALL = { y: 3 * ATLAS_CELL_H, h: 86, spikeH: 24, variants: 4 };

let img = null;
let ready = false;

export function loadAtlas(src = 'assets/tiles.png') {
  if (typeof Image === 'undefined') return; // Node headless: segue procedural
  img = new Image();
  img.onload = () => {
    ready = true;
  };
  img.onerror = () => {
    img = null; // 404/offline: fallback procedural silencioso
  };
  img.src = src;
}

export function atlasReady() {
  return ready;
}

export function atlasImage() {
  return img;
}
