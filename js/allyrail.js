// ============================================================
// TRILHO DE ALIADOS — quais aliados o HUD mostra com grupo grande.
// Sem DOM: a regra de seleção é testável, e é ela que evita a placa
// piscando quando dois aliados oscilam na mesma distância.
// ============================================================
import { HUD_ALLY_LIMIT, HUD_ALLY_HYSTERESIS, HUD_ALLY_REORDER_DELAY } from './balance.js';

export class AllyRail {
  constructor({
    limit = HUD_ALLY_LIMIT,
    hysteresis = HUD_ALLY_HYSTERESIS,
    reorderDelay = HUD_ALLY_REORDER_DELAY,
    maxDowned = 2,
  } = {}) {
    this.limit = limit;
    this.hysteresis = hysteresis;
    this.reorderDelay = reorderDelay;
    this.maxDowned = maxDowned;
    this.current = []; // ids mostrados agora
    this.sinceReorder = 0;
  }

  // local: { x, y } · allies: [{ id, x, y, dead }]
  select(local, allies, dt = 0) {
    this.sinceReorder += dt;
    if (!local || !allies.length) {
      this.current = [];
      return { shown: [], downed: [], extra: 0 };
    }

    const dist = a => Math.hypot(a.x - local.x, a.y - local.y);
    // Um caído sempre aparece, mesmo fora dos mais próximos: alguém precisa ir erguê-lo.
    const downed = allies
      .filter(a => a.dead)
      .sort((a, b) => dist(a) - dist(b))
      .slice(0, this.maxDowned);
    const downedIds = new Set(downed.map(a => a.id));

    const living = allies
      .filter(a => !a.dead && !downedIds.has(a.id))
      .sort((a, b) => dist(a) - dist(b));

    const keep = this.current.map(id => living.find(a => a.id === id)).filter(Boolean);

    let shown;
    if (keep.length < this.limit || this.sinceReorder >= this.reorderDelay) {
      shown = keep.slice(0, this.limit);
      // Preenche vaga com o mais próximo de fora.
      for (const a of living) {
        if (shown.length >= this.limit) break;
        if (!shown.includes(a)) shown.push(a);
      }
      // Troca só quem estiver a uma margem clara de vantagem — sem isso, dois
      // aliados na mesma distância trocariam de lugar a cada quadro.
      if (this.sinceReorder >= this.reorderDelay && shown.length === this.limit) {
        const pior = shown[shown.length - 1];
        const fora = living.find(a => !shown.includes(a));
        if (fora && dist(fora) < dist(pior) - this.hysteresis) {
          shown[shown.length - 1] = fora;
        }
        this.sinceReorder = 0;
      }
      shown.sort((a, b) => dist(a) - dist(b));
    } else {
      shown = keep.slice(0, this.limit);
    }

    this.current = shown.map(a => a.id);
    const extra = allies.length - shown.length - downed.length;
    return { shown, downed, extra: Math.max(0, extra) };
  }
}

// Seta de direção em 8 pontos, no espaço de tiles.
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
export function directionArrow(from, to) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const i = Math.round(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return ARROWS[i];
}
