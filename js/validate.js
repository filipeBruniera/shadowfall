// ============================================================
// VALIDAÇÃO DE SAVE — o host não confia no localStorage do convidado.
// Numa sala de até 10 pessoas, o save que chega pela rede é entrada
// hostil até prova em contrário. Função pura: mesma entrada, mesma saída.
// ============================================================
import { RARITY, AFFIXES, EQUIP_SLOTS, ITEM_BASES } from './data.js';
import { INV_SIZE, POTION_STACK } from './balance.js';
import { normalizeSave, totalXpFor, levelFromTotalXp } from './save.js';

const AFFIX_BY_ID = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));
const BASE_BY_ID = Object.fromEntries(ITEM_BASES.map((b) => [b.id, b]));

// Teto de nível de item pelo andar alcançado. O chefe dropa com +4 sobre o
// nível do monstro, então a folga cobre o caso legítimo mais generoso.
export const ILVL_SLACK = 6;
export function maxItemLevel(floor) { return Math.max(1, Math.floor(floor) || 1) + ILVL_SLACK; }

// Teto de XP acumulado pelo andar: o que dá para juntar limpando andares com
// folga larga. Existe para que editar o save não vire nível 400 instantâneo.
export function maxTotalXp(floor) {
  const f = Math.max(1, Math.floor(floor) || 1);
  return totalXpFor(Math.min(500, 6 + f * 4), 0);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = (v, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : def);

// Recalcula os stats do item pela mesma fórmula da rolagem original.
function rescale(item) {
  const base = BASE_BY_ID[item.baseId];
  const R = RARITY[item.rarity] || RARITY.common;
  if (!base) return item;
  const scale = (1 + item.ilvl * 0.16) * R.mult;
  const out = {
    ...item,
    atk: base.atk ? Math.max(1, Math.round(base.atk * scale)) : 0,
    def: base.def ? Math.max(1, Math.round(base.def * scale)) : 0,
    ml: base.ml ? Math.max(1, Math.round(base.ml * scale)) : 0,
    hp: base.hp ? Math.round(base.hp * scale) : 0,
    mp: base.mp ? Math.round(base.mp * scale) : 0,
    speed: base.speed ? +(base.speed * Math.min(1.6, R.mult)).toFixed(2) : 0,
    atkSpeed: base.atkSpeed || 0,
    crit: 0, leech: 0,
  };
  // Afixos entram por cima da base, dentro da faixa do próprio tipo.
  for (const a of out.affixes) {
    const type = AFFIX_BY_ID[a.id];
    if (!type) continue;
    const ceiling = type.pct ? 0.35 : type.max * (1 + item.ilvl * 0.05);
    let v = clamp(finite(a.value, type.min), type.min, ceiling);
    // Mesmo arredondamento da rolagem original: inteiro, salvo percentual/decimal.
    v = type.pct || type.dec ? +v.toFixed(type.pct ? 3 : 2) : Math.round(v);
    a.value = v;
    out[type.stat] = (out[type.stat] || 0) + v;
  }
  return out;
}

// Recebe o save cru vindo do convidado e devolve { save, report }.
// Idempotente: aplicar sobre um save já saneado não muda mais nada.
export function validateSave(raw, { floor = 1 } = {}) {
  const report = {
    levelAdjusted: false, xpCapped: false, itemsDowngraded: 0,
    itemsDropped: 0, affixesDropped: 0, movedToBag: 0, clamped: [],
  };

  // normalizeSave já resolve integridade referencial, capacidade e tipos.
  const save = normalizeSave(raw);
  if (!save) return { save: null, report: { ...report, discarded: true } };

  const rawItems = Array.isArray(raw?.items) ? raw.items.length : 0;
  // Slot declarado divergente da base já foi mandado para a mochila pelo
  // normalize; aqui só contamos para o relato.
  for (const r of Array.isArray(raw?.items) ? raw.items : []) {
    const base = BASE_BY_ID[r?.base];
    if (r?.loc === 'equipped' && base && r.slot && r.slot !== base.slot) report.movedToBag++;
  }
  const kept = save.inv.filter(Boolean).length + EQUIP_SLOTS.filter((s) => save.equip[s]).length;
  report.itemsDropped = Math.max(0, rawItems - kept);

  // ---------- Progressão ----------
  const capXp = maxTotalXp(save.floor > floor ? floor : save.floor);
  let total = Math.max(0, finite(save.totalXp, 0));
  if (total > capXp) { total = capXp; report.xpCapped = true; report.clamped.push('totalXp'); }
  const lv = levelFromTotalXp(total);
  report.levelAdjusted = lv.level !== finite(raw?.level, lv.level);
  save.totalXp = total;
  save.level = lv.level;
  save.xp = lv.xp;

  // ---------- Faixas numéricas ----------
  const gold = Math.max(0, Math.floor(finite(save.gold, 0)));
  if (gold !== save.gold) report.clamped.push('gold');
  save.gold = gold;
  for (const k of ['hp', 'mp']) {
    const v = clamp(Math.floor(finite(save.potions[k], 0)), 0, POTION_STACK);
    if (v !== save.potions[k]) report.clamped.push('potions.' + k);
    save.potions[k] = v;
  }
  save.floor = clamp(Math.floor(finite(save.floor, 1)), 1, Math.max(1, Math.floor(floor) || 1));

  // ---------- Itens ----------
  const ceiling = maxItemLevel(floor);
  const fix = (it) => {
    if (!it) return it;
    let out = it;
    if (it.ilvl > ceiling) {
      // Rebaixa em vez de descartar: progresso legítimo não some por causa do teto.
      out = rescale({ ...it, ilvl: ceiling, affixes: it.affixes.map((a) => ({ ...a })) });
      report.itemsDowngraded++;
    } else {
      out = rescale({ ...it, affixes: it.affixes.map((a) => ({ ...a })) });
    }
    return out;
  };

  const overflow = [];
  for (const slot of EQUIP_SLOTS) {
    const it = save.equip[slot];
    if (!it) continue;
    // Slot que não bate com a base vai para a mochila, não fica equipado.
    if (it.slot !== slot) { save.equip[slot] = null; overflow.push(fix(it)); report.movedToBag++; continue; }
    save.equip[slot] = fix(it);
  }
  for (let i = 0; i < save.inv.length; i++) if (save.inv[i]) save.inv[i] = fix(save.inv[i]);

  for (const it of overflow) {
    const free = save.inv.indexOf(null);
    if (free === -1) { report.itemsDropped++; continue; }
    save.inv[free] = it;
  }
  if (save.inv.length > INV_SIZE) save.inv.length = INV_SIZE;

  return { save, report };
}

// Resumo de uma linha para o log do host. Nunca vai para o chat da sala:
// quem foi validado não recebe acusação, a partida segue normal.
export function describeReport(name, report) {
  if (!report || report.discarded) return `Save de ${name} foi descartado.`;
  const bits = [];
  if (report.levelAdjusted) bits.push('nível recalculado');
  if (report.xpCapped) bits.push('XP limitado pelo andar');
  if (report.itemsDowngraded) bits.push(`${report.itemsDowngraded} item(ns) rebaixado(s)`);
  if (report.itemsDropped) bits.push(`${report.itemsDropped} item(ns) descartado(s)`);
  if (report.movedToBag) bits.push(`${report.movedToBag} item(ns) desequipado(s)`);
  if (report.clamped.length) bits.push(`limites aplicados: ${report.clamped.join(', ')}`);
  return bits.length ? `Save de ${name}: ${bits.join('; ')}.` : '';
}
