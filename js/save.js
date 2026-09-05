// ============================================================
// PERSISTÊNCIA — tudo que vai para o localStorage passa por aqui.
// Sem DOM: roda em Node, então dá para testar o formato do save
// sem subir navegador. A tela nunca toca localStorage direto.
// ============================================================
import { VOCATIONS, ITEM_BASES, AFFIXES, RARITY, EQUIP_SLOTS, xpForLevel } from './data.js';
import { DAILY_CONTRACT_LIMIT, INV_SIZE, POTION_STACK, START_POTIONS } from './balance.js';
import { BESTIARY_BY_ID } from './bestiary.js';
import { normalizePersistedDailyContracts } from './contracts.js';

export const SAVE_VERSION = 4;
export const MAX_LEVEL = 500;

// O alvo v4 ganha apenas progresso permanente. SAVE_META_VERSION nomeia o
// formato do bloco adicional para que a migração fique explícita e reexecutável.
export const SAVE_META_VERSION = 4;
export const BESTIARY_MAX_ENTRIES = 64;
export const BESTIARY_KILL_MAX = 1_000_000;
export const CONTRACTS_MAX_PER_DAY = DAILY_CONTRACT_LIMIT;
export const CONTRACT_PROGRESS_MAX = 1_000_000;
export const SAVE_META_ID_MAX = 64;
export const CONTRACT_DAY_LENGTH = 10;

// O `xp` do jogador é residual: sobe de nível consumindo o que passou do limiar.
// Só o XP acumulado determina o nível, então é ele que o save guarda a partir
// da v3 — o nível vira informação derivada, não algo em que o host confia.
export function totalXpFor(level, residual = 0) {
  let t = Math.max(0, residual);
  for (let n = 1; n < Math.min(level, MAX_LEVEL); n++) t += xpForLevel(n);
  return t;
}

export function levelFromTotalXp(total) {
  let level = 1;
  let rest = Math.max(0, Math.floor(total) || 0);
  while (level < MAX_LEVEL && rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level++;
  }
  return { level, xp: rest };
}
export const NAME_KEY = 'sf-name';
export const NAME_MAX = 14;
export const DEFAULT_NAME = 'Herói';

export function saveKey(voc) {
  return `sf-save-${voc}`;
}

const BASE_BY_ID = Object.fromEntries(ITEM_BASES.map(b => [b.id, b]));
const AFFIX_BY_ID = Object.fromEntries(AFFIXES.map(a => [a.id, a]));
// Um save canônico nunca precisa inspecionar mais itens que os slots físicos.
// Cortar a entrada antes de desserializar impede que uma lista hostil enorme
// consuma trabalho proporcional ao tamanho dela.
const MAX_SAVE_ITEMS = EQUIP_SLOTS.length + INV_SIZE;

// ---------- Armazenamento injetável ----------
// Em produção é o localStorage; nos testes, um objeto qualquer com
// getItem/setItem/removeItem. Assim dá para simular cota cheia.
let injected = null;
export function setStorage(s) {
  injected = s;
}

function store() {
  if (injected) return injected;
  try {
    return globalThis.localStorage ?? null;
  } catch (e) {
    return null;
  }
}

// ---------- Aviso ao jogador ----------
// Uma vez por sessão e por motivo: falha de gravação não pode virar spam.
let warnHandler = null;
const warned = new Set();
export function setWarnHandler(fn) {
  warnHandler = fn;
}
export function resetWarnings() {
  warned.clear();
}

function warnOnce(reason, message) {
  if (warned.has(reason)) return false;
  warned.add(reason);
  if (warnHandler) {
    try {
      warnHandler(message, reason);
    } catch (e) {
      /* aviso nunca derruba */
    }
  }
  return true;
}

// ---------- Helpers de tipo ----------
// Campo com tipo errado é ignorado, e o resto do save é aproveitado.
const num = (v, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const int = (v, def = 0) => Math.trunc(num(v, def));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const str = (v, def = '') => (typeof v === 'string' ? v : def);

// ============================================================
// META V4 — progresso entre runs; a cadeia v1→v4 entra na P3A-02.
// ============================================================
const stableId = v => {
  const id = str(v).trim();
  // Essas três chaves têm semântica própria em objetos JavaScript; não são ids
  // de conteúdo válidos e não podem atravessar a fronteira do save.
  if (id === '__proto__' || id === 'constructor' || id === 'prototype') return null;
  return /^[a-z0-9][a-z0-9:_-]*$/i.test(id) && id.length <= SAVE_META_ID_MAX ? id : null;
};

function normalizeCounterMap(raw, maxEntries, maxValue, acceptsId = () => true) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  let inspected = 0;
  // Há folga para descartar ids hostis antes de lotar a coleção, mas o laço
  // continua finito mesmo que o objeto recebido tenha milhares de chaves.
  const inspectLimit = maxEntries * 4;
  for (const rawId in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, rawId)) continue;
    if (inspected++ >= inspectLimit || Object.keys(out).length >= maxEntries) break;
    const id = stableId(rawId);
    if (!id || !acceptsId(id)) continue;
    const value = clamp(int(raw[rawId]), 0, maxValue);
    // Zero não carrega progresso; omiti-lo também impede mapas vazios enormes.
    if (value > 0) out[id] = value;
  }
  return out;
}

export function emptySaveMetaV4() {
  return {
    bestiary: { kills: {} },
    contracts: { day: '', progress: {}, claimed: [] },
  };
}

// O bestiário consulta o catálogo atual para não reter tipos removidos. A lista
// diária recriada pelo domínio é a fonte dos slots, metas e resgates válidos.
export function normalizeSaveMetaV4(raw) {
  const bestiary = raw?.bestiary;
  return {
    bestiary: {
      // O catálogo atual é a fonte de ids. Descartar conteúdo removido aqui
      // impede que uma entrada hostil ou antiga ocupe espaço no progresso.
      kills: normalizeCounterMap(bestiary?.kills, BESTIARY_MAX_ENTRIES, BESTIARY_KILL_MAX, id =>
        Object.prototype.hasOwnProperty.call(BESTIARY_BY_ID, id)
      ),
    },
    contracts: normalizePersistedDailyContracts(raw?.contracts),
  };
}

// ============================================================
// NOME DO JOGADOR — chave `sf-name` (browser_profiles)
// ============================================================
export function normalizeName(raw) {
  const v = str(raw, '').trim();
  if (!v) return DEFAULT_NAME;
  return v.slice(0, NAME_MAX);
}

export function readName() {
  const s = store();
  if (!s) return DEFAULT_NAME;
  try {
    return normalizeName(s.getItem(NAME_KEY));
  } catch (e) {
    return DEFAULT_NAME;
  }
}

export function writeName(raw) {
  const name = normalizeName(raw);
  const s = store();
  if (!s) return name;
  try {
    s.setItem(NAME_KEY, name);
  } catch (e) {
    warnOnce('write', 'Não consegui salvar neste navegador. Seu progresso pode não ser guardado.');
  }
  return name;
}

// ============================================================
// ITENS — item_instances + item_instance_affixes + storage_locations
// ============================================================
function serializeItem(it, loc, slot, idx) {
  return {
    loc, // 'equipped' | 'inventory'
    slot: slot ?? null, // equipment_slots.slug quando equipado
    idx: idx ?? null, // 0..19 quando na mochila
    base: it.baseId,
    rarity: it.rarity,
    ilvl: int(it.ilvl),
    name: str(it.name),
    // O glyph pertence à base; persistir um valor transitório faria a segunda
    // gravação após reload diferir da primeira, pois a leitura já o deriva.
    glyph: BASE_BY_ID[it.baseId]?.glyph ?? str(it.glyph),
    atk: num(it.atk),
    def: num(it.def),
    ml: num(it.ml),
    hp: num(it.hp),
    mp: num(it.mp),
    speed: num(it.speed),
    atkSpeed: num(it.atkSpeed),
    crit: num(it.crit),
    leech: num(it.leech),
    cooldown: num(it.cooldown),
    elemental: num(it.elemental),
    statusPower: num(it.statusPower),
    area: num(it.area),
    affixes: Array.isArray(it.affixes)
      ? it.affixes
          .filter(a => a && AFFIX_BY_ID[a.id])
          .map(a => ({ id: a.id, value: num(a.value), pct: !!a.pct }))
      : [],
  };
}

// Devolve o item pronto para o runtime, ou null se a referência não existe mais.
function deserializeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const base = BASE_BY_ID[raw.base];
  if (!base) return null;
  const rarity = RARITY[raw.rarity] ? raw.rarity : 'common';

  // Um afixo não aparece duas vezes no mesmo item.
  const seen = new Set();
  const affixes = [];
  const rawAffixes = Array.isArray(raw.affixes) ? raw.affixes : [];
  for (let i = 0; i < Math.min(rawAffixes.length, AFFIXES.length); i++) {
    const a = rawAffixes[i];
    const type = a && AFFIX_BY_ID[a.id];
    // O valor vem do save do convidado: NaN e infinito não têm versão segura
    // para recalcular. Faixas numéricas finitas continuam sendo limitadas em
    // validate.js, mas estes formatos inválidos saem antes de entrar no item.
    if (!type || seen.has(a.id) || typeof a.value !== 'number' || !Number.isFinite(a.value))
      continue;
    seen.add(a.id);
    affixes.push({
      id: type.id,
      name: type.name,
      stat: type.stat,
      value: num(a.value),
      pct: !!type.pct,
    });
  }

  return {
    id: int(raw.id),
    kind: 'equip',
    baseId: base.id,
    slot: base.slot,
    name: str(raw.name, base.name),
    glyph: base.glyph,
    rarity,
    ilvl: int(raw.ilvl),
    forVoc: base.forVoc || null,
    atk: num(raw.atk),
    def: num(raw.def),
    ml: num(raw.ml),
    hp: num(raw.hp),
    mp: num(raw.mp),
    speed: num(raw.speed),
    atkSpeed: num(raw.atkSpeed),
    crit: num(raw.crit),
    leech: num(raw.leech),
    cooldown: num(raw.cooldown),
    elemental: num(raw.elemental),
    statusPower: num(raw.statusPower),
    area: num(raw.area),
    affixes,
  };
}

// ============================================================
// PERSONAGEM — character_saves + character_consumables
// ============================================================
export function serializeCharacter(p, floor = 1, previousMeta = null) {
  const items = [];
  for (const slot of EQUIP_SLOTS) {
    const it = p.equip && p.equip[slot];
    if (it) items.push(serializeItem(it, 'equipped', slot, null));
  }
  const inv = Array.isArray(p.inv) ? p.inv : [];
  for (let i = 0; i < Math.min(inv.length, INV_SIZE); i++) {
    if (inv[i]) items.push(serializeItem(inv[i], 'inventory', null, i));
  }

  // Durante a transição, o jogador ainda não carrega meta em memória. Reusar
  // o bloco persistido evita que um autosave normal apague progresso v4 antes
  // das fases P3B/P3C passarem a atualizá-lo diretamente.
  const meta = normalizeSaveMetaV4({
    bestiary: p.bestiary ?? previousMeta?.bestiary,
    contracts: p.contracts ?? previousMeta?.contracts,
  });

  return {
    v: SAVE_VERSION,
    voc: p.voc,
    name: normalizeName(p.name),
    totalXp: totalXpFor(Math.max(1, int(p.level, 1)), Math.max(0, int(p.xp))),
    level: Math.max(1, int(p.level, 1)), // conveniência de exibição; nunca é fonte da verdade
    xp: Math.max(0, int(p.xp)),
    gold: Math.max(0, int(p.gold)),
    floor: Math.max(1, int(floor, 1)),
    potions: {
      hp: clamp(int(p.potions?.hp, START_POTIONS.hp), 0, POTION_STACK),
      mp: clamp(int(p.potions?.mp, START_POTIONS.mp), 0, POTION_STACK),
    },
    items,
    ...meta,
  };
}

// v2 -> v3: o XP acumulado passa a ser gravado, derivado do par (nível, xp residual).
function migrateV2(raw) {
  return {
    ...raw,
    v: 3,
    totalXp: totalXpFor(Math.max(1, int(raw.level, 1)), Math.max(0, int(raw.xp))),
  };
}

// v3 -> v4: o progresso já existente permanece byte a byte; só entram os
// defaults permanentes. Rodar de novo sobre a saída não muda o resultado.
export function migrateV3ToV4(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    ...src,
    v: SAVE_META_VERSION,
    ...normalizeSaveMetaV4(src),
  };
}

// Converte o formato antigo (equip/inv aninhados, sem versão) no atual.
function migrateV1(raw) {
  const items = [];
  const equip = raw.equip && typeof raw.equip === 'object' ? raw.equip : {};
  for (const slot of EQUIP_SLOTS) {
    const it = equip[slot];
    if (it && typeof it === 'object') items.push(serializeItem(it, 'equipped', slot, null));
  }
  const inv = Array.isArray(raw.inv) ? raw.inv : [];
  for (let i = 0; i < Math.min(inv.length, INV_SIZE); i++) {
    if (inv[i] && typeof inv[i] === 'object')
      items.push(serializeItem(inv[i], 'inventory', null, i));
  }
  return migrateV2({ ...raw, v: 2, items, equip: undefined, inv: undefined });
}

// Save cru -> save normalizado, pronto para applySave. Null quando não dá para aproveitar.
export function normalizeSave(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // A ausência de versão é o único atalho compatível para v1. Converter uma
  // versão malformada para 1 poderia aplicar parcialmente um formato futuro.
  const version = raw.v === undefined ? 1 : raw.v;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return null;
  if (version > SAVE_VERSION) {
    // Versão futura: descartar inteiro. Aplicar campo a campo um formato que
    // não conhecemos é pior do que começar do zero.
    warnOnce(
      'future',
      'Save mais novo que este jogo. Comecei um personagem novo para esta vocação.'
    );
    return null;
  }
  let src = raw;
  if (version <= 1) src = migrateV1(raw);
  else if (version === 2) src = migrateV2(raw);
  if (src.v === 3) src = migrateV3ToV4(src);

  const voc = VOCATIONS[src.voc] ? src.voc : null;
  if (!voc) return null;

  const equip = { weapon: null, offhand: null, armor: null, boots: null, ring: null, amulet: null };
  const inv = new Array(INV_SIZE).fill(null);
  let dropped = 0;

  const rawItems = Array.isArray(src.items) ? src.items : [];
  const list = rawItems.slice(0, MAX_SAVE_ITEMS);
  const pending = [];

  // Equipados primeiro: um por slot, o excedente cai na mochila.
  for (const raw2 of list) {
    const it = deserializeItem(raw2);
    if (!it) {
      dropped++;
      continue;
    }
    // Slot declarado que não bate com o da base é sinal de save adulterado:
    // o item vai para a mochila em vez de ganhar o lugar equipado de graça.
    const slotOk = !raw2.slot || raw2.slot === it.slot;
    if (raw2.loc === 'equipped' && slotOk && EQUIP_SLOTS.includes(it.slot) && !equip[it.slot])
      equip[it.slot] = it;
    else pending.push({ it, idx: Number.isInteger(raw2.idx) ? raw2.idx : -1 });
  }
  // Depois a mochila: índice pedido quando livre e válido, senão o primeiro vago.
  for (const { it, idx } of pending) {
    if (idx >= 0 && idx < INV_SIZE && !inv[idx]) {
      inv[idx] = it;
      continue;
    }
    const free = inv.indexOf(null);
    if (free === -1) {
      dropped++;
      continue;
    }
    inv[free] = it;
  }
  dropped += rawItems.length - list.length;
  if (dropped) warnOnce('dropped', `${dropped} item(ns) do save não puderam ser carregados.`);

  // Nível sempre derivado: o valor que veio do cliente é ignorado de propósito.
  const totalXp = Math.max(
    0,
    int(src.totalXp, totalXpFor(Math.max(1, int(src.level, 1)), Math.max(0, int(src.xp))))
  );
  const lv = levelFromTotalXp(totalXp);
  const derived = { total: totalXp, level: lv.level, xp: lv.xp };

  const meta = normalizeSaveMetaV4(src);
  return {
    v: SAVE_VERSION,
    voc,
    name: normalizeName(src.name),
    totalXp: derived.total,
    level: derived.level,
    xp: derived.xp,
    gold: Math.max(0, int(src.gold)),
    floor: Math.max(1, int(src.floor, 1)),
    potions: {
      hp: clamp(int(src.potions?.hp, START_POTIONS.hp), 0, POTION_STACK),
      mp: clamp(int(src.potions?.mp, START_POTIONS.mp), 0, POTION_STACK),
    },
    equip,
    inv,
    ...meta,
  };
}

// ============================================================
// LEITURA E GRAVAÇÃO
// ============================================================
function readStored(voc) {
  const s = store();
  if (!s) return { ok: false, value: null };
  let text;
  try {
    text = s.getItem(saveKey(voc));
  } catch (e) {
    return { ok: false, value: null };
  }
  if (!text) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    // JSON inválido: devolve nulo em vez de lançar, e avisa que o save foi descartado.
    warnOnce('corrupt', 'O save desta vocação estava corrompido e foi descartado.');
    return { ok: true, value: null };
  }
}

export function readRaw(voc) {
  return readStored(voc).value;
}

export function loadSave(voc) {
  const raw = readRaw(voc);
  if (!raw) return null;
  const save = normalizeSave(raw);
  if (!save || save.voc !== voc) return null;
  return save;
}

export function writeSave(p, floor = 1) {
  const s = store();
  if (!s) return false;
  // Entrar numa sala em checkpoint baixo nunca apaga o maior andar já alcançado.
  // O andar da run é efêmero; esta chave representa progresso histórico.
  const stored = readStored(p.voc);
  // Uma falha temporária de leitura não significa que o save não existe. Não
  // gravar nesse caso conserva a última versão válida em vez de zerar meta ou
  // o maior andar por engano.
  if (!stored.ok) {
    warnOnce(
      'read',
      'Não consegui ler o save neste navegador. Seu progresso anterior foi preservado.'
    );
    return false;
  }
  const candidate = stored.value ? normalizeSave(stored.value) : null;
  const previous = candidate?.voc === p.voc ? candidate : null;
  const deepestFloor = Math.max(Math.max(1, int(floor, 1)), previous?.floor || 1);
  const data = serializeCharacter(p, deepestFloor, previous);
  try {
    s.setItem(saveKey(data.voc), JSON.stringify(data));
    return true;
  } catch (e) {
    // Cota cheia ou modo privado: a partida continua, o jogador é avisado uma vez.
    warnOnce('write', 'Não consegui salvar neste navegador. Seu progresso pode não ser guardado.');
    return false;
  }
}

export function clearSave(voc) {
  const s = store();
  if (!s) return false;
  try {
    s.removeItem(saveKey(voc));
    return true;
  } catch (e) {
    return false;
  }
}

// Armazenamento de memória — usado nos testes e quando o navegador bloqueia o localStorage.
export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: k => {
      map.delete(k);
    },
    _map: map,
  };
}
