// Testes do formato do save — rodam sem navegador, sobre armazenamento de memória.
import * as S from '../js/save.js';
import {
  INV_SIZE,
  POTION_STACK,
  START_POTIONS,
  BUILD_AFFIX_RANGES,
  DAILY_CONTRACT_SEED,
} from '../js/balance.js';
import { AFFIXES, EQUIP_SLOTS } from '../js/data.js';
import { BESTIARY_CATALOG } from '../js/bestiary.js';
import { generateDailyContracts } from '../js/contracts.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.log(`  FAIL ${label} ${extra}`);
    failures++;
  }
}

const item = (over = {}) => ({
  baseId: 'sword',
  slot: 'weapon',
  rarity: 'rare',
  ilvl: 9,
  name: 'Espada Afiada',
  glyph: 'sword',
  atk: 14,
  def: 0,
  ml: 0,
  hp: 0,
  mp: 0,
  speed: 0,
  atkSpeed: 0,
  crit: 0,
  leech: 0,
  affixes: [{ id: 'atk', name: 'Afiado', stat: 'atk', value: 4, pct: false }],
  ...over,
});

const hero = (over = {}) => ({
  voc: 'knight',
  name: 'Bruno',
  level: 12,
  xp: 1200,
  gold: 340,
  equip: { weapon: null, offhand: null, armor: null, boots: null, ring: null, amulet: null },
  inv: new Array(INV_SIZE).fill(null),
  potions: { hp: 8, mp: 6 },
  ...over,
});

function fresh(initial = {}) {
  const st = S.memoryStorage(initial);
  S.setStorage(st);
  S.resetWarnings();
  return st;
}

const DAILY_DAY = '2026-08-28';
const DAILY_CONTRACTS = generateDailyContracts(DAILY_CONTRACT_SEED, DAILY_DAY);
const [DAILY_ONE, DAILY_TWO] = DAILY_CONTRACTS;
const completeDailyState = contract => ({
  day: DAILY_DAY,
  progress: { [contract.id]: contract.objective.amount },
  claimed: [contract.id],
});

// ============================================================
console.log('\n== save: ida e volta ==');
fresh();
{
  const p = hero();
  p.equip.weapon = item();
  p.inv[3] = item({
    baseId: 'ring',
    slot: 'ring',
    rarity: 'epic',
    name: 'Anel Cruel',
    atk: 2,
    ml: 2,
    crit: 0.05,
    affixes: [{ id: 'crit', value: 0.05, pct: true }],
  });
  S.writeSave(p, 7);
  const b = S.loadSave('knight');

  check(
    'save: gravar e ler devolve o mesmo personagem',
    b &&
      b.voc === 'knight' &&
      b.name === 'Bruno' &&
      b.level === 12 &&
      b.xp === 1200 &&
      b.gold === 340 &&
      b.floor === 7,
    JSON.stringify({ l: b?.level, x: b?.xp, g: b?.gold, f: b?.floor })
  );
  check(
    'save: stats do item sobrevivem à ida e volta',
    b.equip.weapon.atk === 14 && b.equip.weapon.rarity === 'rare' && b.equip.weapon.ilvl === 9
  );
  check(
    'save: afixo volta com nome e stat derivados do tipo',
    b.equip.weapon.affixes[0].name === 'Afiado' &&
      b.equip.weapon.affixes[0].stat === 'atk' &&
      b.equip.weapon.affixes[0].value === 4
  );
  check(
    'save: afixo percentual mantém o formato',
    b.inv[3].affixes[0].pct === true && b.inv[3].crit === 0.05
  );
  check(
    'save: forVoc é derivado da base, não gravado',
    Array.isArray(b.equip.weapon.forVoc) && b.equip.weapon.forVoc.includes('knight')
  );
}

console.log('\n== save: afixos de build ==');
fresh();
{
  const buildAffixes = [
    ['cooldown', 'cooldown'],
    ['elemental', 'elemental'],
    ['status', 'status'],
    ['area', 'area'],
  ];
  const expected = buildAffixes.map(([id, rangeId]) => ({
    id,
    value: BUILD_AFFIX_RANGES[rangeId][1],
    pct: true,
  }));
  const valuesByStat = Object.fromEntries(
    buildAffixes.map(([id, rangeId]) => {
      const affix = AFFIXES.find(a => a.id === id);
      return [affix.stat, BUILD_AFFIX_RANGES[rangeId][1]];
    })
  );
  const p = hero();
  p.equip.weapon = item({
    ...valuesByStat,
    affixes: expected,
  });
  S.writeSave(p, 7);
  const loaded = S.loadSave('knight');
  const actual = loaded?.equip.weapon?.affixes.map(({ id, value, pct }) => ({ id, value, pct }));
  check(
    'save: os quatro afixos de build sobrevivem à ida e volta sem perda',
    JSON.stringify(actual) === JSON.stringify(expected),
    JSON.stringify(actual)
  );
}

console.log('\n== save: nível derivado do XP acumulado ==');
fresh();
{
  const total = S.totalXpFor(10, 50);
  const b = S.normalizeSave({ v: 3, voc: 'knight', level: 99, xp: 0, totalXp: total, items: [] });
  check(
    'save: o nível vem do XP acumulado, não do campo enviado',
    b.level === 10 && b.xp === 50,
    `nv ${b.level}`
  );
  check(
    'save: XP residual fica sempre abaixo do limiar do nível',
    b.xp < 80 * Math.pow(b.level, 1.55)
  );

  // XP residual acima do limiar significa level-up não aplicado: sobe agora.
  const up = S.normalizeSave({ v: 2, voc: 'knight', level: 12, xp: 4210, items: [] });
  check(
    'save: XP residual acima do limiar aplica o nível pendente',
    up.level === 13 && up.xp < 4210,
    `nv ${up.level} xp ${up.xp}`
  );

  const neg = S.normalizeSave({ v: 3, voc: 'knight', totalXp: -500, items: [] });
  check('save: XP acumulado negativo vira nível 1', neg.level === 1 && neg.totalXp === 0);

  const migrated = S.normalizeSave({ voc: 'knight', level: 8, xp: 100, equip: {}, inv: [] });
  check(
    'save: migração v1 calcula o XP acumulado a partir de nível e residual',
    migrated.level === 8 && migrated.xp === 100 && migrated.totalXp === S.totalXpFor(8, 100)
  );
}

console.log('\n== save: posição de itens ==');
fresh();
{
  const p = hero();
  // Uma base por slot: o slot do item vem da base, não é escolhido à mão.
  const baseForSlot = {
    weapon: 'sword',
    offhand: 'shield',
    armor: 'plate',
    boots: 'boots',
    ring: 'ring',
    amulet: 'amulet',
  };
  for (const slot of EQUIP_SLOTS)
    p.equip[slot] = item({ baseId: baseForSlot[slot], slot, name: `Eq ${slot}` });
  for (let i = 0; i < INV_SIZE; i++) p.inv[i] = item({ name: `Inv ${i}` });
  S.writeSave(p, 1);
  const b = S.loadSave('knight');

  check(
    'save: itens equipados e da mochila voltam no mesmo lugar',
    EQUIP_SLOTS.every(s => b.equip[s] && b.equip[s].name === `Eq ${s}`) &&
      b.inv.every((it, i) => it && it.name === `Inv ${i}`)
  );
  check('save: mochila volta com exatamente 20 posições', b.inv.length === INV_SIZE);
}

fresh();
{
  // Dois itens reivindicando o mesmo índice: o segundo vai para o primeiro slot livre.
  const raw = {
    v: 2,
    voc: 'knight',
    name: 'X',
    level: 1,
    xp: 0,
    gold: 0,
    floor: 1,
    potions: { hp: 1, mp: 1 },
    items: [
      {
        loc: 'inventory',
        idx: 5,
        base: 'sword',
        rarity: 'common',
        ilvl: 1,
        name: 'A',
        affixes: [],
      },
      {
        loc: 'inventory',
        idx: 5,
        base: 'sword',
        rarity: 'common',
        ilvl: 1,
        name: 'B',
        affixes: [],
      },
      {
        loc: 'equipped',
        slot: 'weapon',
        base: 'sword',
        rarity: 'common',
        ilvl: 1,
        name: 'C',
        affixes: [],
      },
      {
        loc: 'equipped',
        slot: 'weapon',
        base: 'axe',
        rarity: 'common',
        ilvl: 1,
        name: 'D',
        affixes: [],
      },
    ],
  };
  const b = S.normalizeSave(raw);
  const occupied = b.inv.filter(Boolean);
  check(
    'save: dois itens não ocupam o mesmo índice de mochila',
    b.inv[5].name === 'A' && occupied.length === 3 && occupied.some(i => i.name === 'B')
  );
  check(
    'save: dois itens não ocupam o mesmo slot equipado',
    b.equip.weapon.name === 'C' && occupied.some(i => i.name === 'D')
  );
}

fresh();
{
  const raw = {
    v: 2,
    voc: 'knight',
    name: 'X',
    level: 1,
    xp: 0,
    gold: 0,
    floor: 1,
    potions: { hp: 1, mp: 1 },
    items: [
      {
        loc: 'inventory',
        idx: 0,
        base: 'sword',
        rarity: 'rare',
        ilvl: 3,
        name: 'A',
        affixes: [
          { id: 'atk', value: 3 },
          { id: 'atk', value: 9 },
          { id: 'hp', value: 20 },
        ],
      },
    ],
  };
  const b = S.normalizeSave(raw);
  check(
    'save: afixo não duplica no mesmo item',
    b.inv[0].affixes.length === 2 && b.inv[0].affixes.filter(a => a.id === 'atk').length === 1
  );
}

console.log('\n== save: poções (character_consumables) ==');
fresh();
{
  const over = S.normalizeSave({ v: 2, voc: 'knight', potions: { hp: 999, mp: -5 }, items: [] });
  check(
    'save: quantidade de poção é limitada entre 0 e o teto ao carregar',
    over.potions.hp === POTION_STACK && over.potions.mp === 0,
    `${over.potions.hp}/${over.potions.mp}`
  );

  const missing = S.normalizeSave({ v: 2, voc: 'knight', items: [] });
  check(
    'save: save sem poções assume os valores iniciais',
    missing.potions.hp === START_POTIONS.hp && missing.potions.mp === START_POTIONS.mp
  );
}

console.log('\n== save: versão de esquema ==');
fresh();
{
  const future = S.normalizeSave({
    v: S.SAVE_VERSION + 1,
    voc: 'knight',
    level: 99,
    gold: 999999,
    items: [],
  });
  check('save: versão desconhecida é descartada e não aplica dados parciais', future === null);

  // Formato v1: equip/inv aninhados, sem campo de versão.
  const v1 = {
    voc: 'druid',
    name: 'Marina',
    level: 9,
    xp: 900,
    gold: 77,
    floor: 4,
    potions: { hp: 5, mp: 3 },
    equip: {
      weapon: item({ baseId: 'rod', slot: 'weapon', name: 'Cajado' }),
      offhand: null,
      armor: null,
      boots: null,
      ring: null,
      amulet: null,
    },
    inv: [null, item({ baseId: 'boots', slot: 'boots', name: 'Botas' })],
  };
  const m = S.normalizeSave(v1);
  check(
    'save: versão ausente é tratada como 1 e migra',
    m &&
      m.v === S.SAVE_VERSION &&
      m.level === 9 &&
      m.equip.weapon.name === 'Cajado' &&
      m.inv[1].name === 'Botas',
    JSON.stringify({ v: m?.v, lvl: m?.level })
  );
  check('save: migração preserva ouro, XP e andar', m.gold === 77 && m.xp === 900 && m.floor === 4);
}

console.log('\n== save: meta v4 preparada ==');
{
  const a = S.emptySaveMetaV4();
  const b = S.emptySaveMetaV4();
  a.bestiary.kills.rat = 1;
  check(
    'save: meta v4 inicia bestiário e contratos vazios sem compartilhar referência',
    JSON.stringify(b) ===
      JSON.stringify({ bestiary: { kills: {} }, contracts: { day: '', progress: {}, claimed: [] } })
  );

  const meta = S.normalizeSaveMetaV4({
    bestiary: {
      kills: {
        rat: 12.9,
        'id inválido': 20,
        dragon: -1,
        ferumbras: S.BESTIARY_KILL_MAX + 99,
      },
    },
    contracts: {
      day: '2026-08-28',
      progress: {
        daily_1: 4.8,
        daily_2: S.CONTRACT_PROGRESS_MAX + 1,
        'id inválido': 7,
        daily_3: -2,
      },
      claimed: ['daily_1', 'daily_1', 'daily_2', 'daily_3'],
      seed: 12345,
      runFloor: 99,
    },
    run: { seed: 99, floor: 7 },
  });
  check(
    'save: meta v4 preserva apenas contadores permanentes e estado diário mínimo',
    JSON.stringify(meta) ===
      JSON.stringify({
        bestiary: { kills: { rat: 12, ferumbras: S.BESTIARY_KILL_MAX } },
        contracts: {
          day: DAILY_DAY,
          progress: { [DAILY_ONE.id]: 4, [DAILY_TWO.id]: DAILY_TWO.objective.amount },
          claimed: [DAILY_TWO.id],
        },
      }),
    JSON.stringify(meta)
  );

  const tooMany = Object.fromEntries(
    BESTIARY_CATALOG.map((entry, i) => [entry.id, i + 1]).concat(
      Array.from({ length: S.BESTIARY_MAX_ENTRIES + 5 }, (_, i) => [`mob_${i}`, i + 1])
    )
  );
  const bounded = S.normalizeSaveMetaV4({
    bestiary: { kills: tooMany },
    contracts: {
      day: 'ontem',
      progress: Object.fromEntries(
        Array.from({ length: S.CONTRACTS_MAX_PER_DAY + 4 }, (_, i) => [`daily_${i}`, i + 1])
      ),
      claimed: Array.from({ length: S.CONTRACTS_MAX_PER_DAY + 4 }, (_, i) => `daily_${i}`),
    },
  });
  check(
    'save: meta v4 limita bestiário e zera contratos com chave diária inválida',
    Object.keys(bounded.bestiary.kills).length ===
      Math.min(S.BESTIARY_MAX_ENTRIES, BESTIARY_CATALOG.length) &&
      JSON.stringify(bounded.contracts) === JSON.stringify({ day: '', progress: {}, claimed: [] }),
    JSON.stringify(bounded)
  );
}

console.log('\n== save: contratos v4 canônicos ==');
{
  const hostile = S.normalizeSaveMetaV4({
    contracts: {
      day: DAILY_DAY,
      progress: {
        [DAILY_ONE.id]: DAILY_ONE.objective.amount + 999,
        [DAILY_TWO.id]: DAILY_TWO.objective.amount - 1,
        daily_4: 99,
        __proto__: 99,
        constructor: 99,
      },
      claimed: [DAILY_TWO.id, DAILY_ONE.id, 'daily_4', DAILY_ONE.id, '__proto__'],
    },
  });
  check(
    'save: contratos aceitam só slots diários conhecidos, limitam progresso e exigem meta antes do resgate',
    JSON.stringify(hostile.contracts) ===
      JSON.stringify({
        day: DAILY_DAY,
        progress: {
          [DAILY_ONE.id]: DAILY_ONE.objective.amount,
          [DAILY_TWO.id]: DAILY_TWO.objective.amount - 1,
        },
        claimed: [DAILY_ONE.id],
      }),
    JSON.stringify(hostile.contracts)
  );
  check(
    'save: data impossível não carrega progresso nem resgates de outro calendário',
    JSON.stringify(
      S.normalizeSaveMetaV4({
        contracts: { day: '2026-02-30', progress: { [DAILY_ONE.id]: 99 }, claimed: [DAILY_ONE.id] },
      }).contracts
    ) === JSON.stringify({ day: '', progress: {}, claimed: [] })
  );
}

console.log('\n== save: migração v3 para v4 ==');
{
  const v3 = {
    v: 3,
    voc: 'knight',
    name: 'Bruno',
    totalXp: S.totalXpFor(12, 1200),
    level: 12,
    xp: 1200,
    gold: 340,
    floor: 7,
    potions: { hp: 8, mp: 6 },
    items: [
      {
        loc: 'inventory',
        idx: 3,
        base: 'sword',
        rarity: 'rare',
        ilvl: 9,
        name: 'Espada antiga',
        affixes: [],
      },
    ],
  };
  const before = structuredClone(v3);
  const migrated = S.migrateV3ToV4(v3);
  const again = S.migrateV3ToV4(migrated);
  const v3Progress = ['voc', 'name', 'totalXp', 'level', 'xp', 'gold', 'floor', 'potions', 'items'];
  check(
    'save: migração v3 para v4 preserva integralmente o progresso existente',
    v3Progress.every(key => JSON.stringify(migrated[key]) === JSON.stringify(v3[key])) &&
      JSON.stringify(v3) === JSON.stringify(before),
    JSON.stringify(migrated)
  );
  check(
    'save: migração v3 para v4 adiciona somente os defaults meta',
    migrated.v === 4 &&
      JSON.stringify(migrated.bestiary) === JSON.stringify({ kills: {} }) &&
      JSON.stringify(migrated.contracts) === JSON.stringify({ day: '', progress: {}, claimed: [] }),
    JSON.stringify(migrated)
  );
  check(
    'save: migração v3 para v4 é determinística e idempotente',
    JSON.stringify(migrated) === JSON.stringify(again),
    JSON.stringify(again)
  );

  const hostile = S.migrateV3ToV4({
    ...v3,
    bestiary: { kills: { rat: 2.8, 'id inválido': 99 } },
    contracts: { day: 'inválido', progress: { daily_1: -3 }, claimed: ['daily_1', 'daily_1'] },
  });
  check(
    'save: migração v3 para v4 normaliza meta ausente ou hostil sem tocar no progresso v3',
    JSON.stringify(hostile.bestiary) === JSON.stringify({ kills: { rat: 2 } }) &&
      JSON.stringify(hostile.contracts) ===
        JSON.stringify({ day: '', progress: {}, claimed: [] }) &&
      v3Progress.every(key => JSON.stringify(hostile[key]) === JSON.stringify(v3[key])),
    JSON.stringify(hostile)
  );

  const migratedContracts = S.migrateV3ToV4({
    ...v3,
    contracts: completeDailyState(DAILY_ONE),
  });
  check(
    'save: migração v3 para v4 conserva contrato diário concluído e seu resgate canônico',
    JSON.stringify(migratedContracts.contracts) === JSON.stringify(completeDailyState(DAILY_ONE)),
    JSON.stringify(migratedContracts.contracts)
  );

  const canonical = S.normalizeSave(v3);
  check(
    'save: normalização integra a cadeia v3 para o formato canônico v4',
    canonical?.v === 4 &&
      JSON.stringify(canonical.bestiary) === JSON.stringify({ kills: {} }) &&
      JSON.stringify(canonical.contracts) ===
        JSON.stringify({ day: '', progress: {}, claimed: [] }),
    JSON.stringify(canonical)
  );
}

console.log('\n== save: cadeia histórica v1 até v4 ==');
{
  // As três fixtures representam o mesmo personagem nos formatos que cada
  // versão realmente entendia. A comparação é feita após normalizar, porque
  // campos derivados (nível, glyph e forVoc) pertencem ao formato canônico.
  const legacyWeapon = item({
    baseId: 'sword',
    slot: 'weapon',
    name: 'Lâmina das Cinzas',
    ilvl: 14,
    atk: 31,
    def: 2,
    speed: 0.15,
    atkSpeed: 0.2,
    crit: 0.08,
    leech: 0.03,
    cooldown: 0.11,
    elemental: 7,
    statusPower: 0.18,
    area: 0.09,
    affixes: [
      { id: 'atk', value: 6, pct: false },
      { id: 'cooldown', value: 0.11, pct: true },
      { id: 'elemental', value: 7, pct: true },
    ],
  });
  const legacyAmulet = item({
    baseId: 'amulet',
    slot: 'amulet',
    rarity: 'epic',
    name: 'Amuleto do Vento',
    ilvl: 12,
    atk: 1,
    ml: 4,
    hp: 18,
    mp: 11,
    speed: 0.08,
    affixes: [{ id: 'speed', value: 0.08, pct: true }],
  });
  const legacyBoots = item({
    baseId: 'boots',
    slot: 'boots',
    name: 'Passos de Pedra',
    ilvl: 10,
    def: 8,
    speed: 0.12,
    affixes: [{ id: 'def', value: 4, pct: false }],
  });
  const legacyRing = item({
    baseId: 'ring',
    slot: 'ring',
    rarity: 'legendary',
    name: 'Círculo Solar',
    ilvl: 16,
    atk: 5,
    ml: 5,
    crit: 0.14,
    leech: 0.05,
    affixes: [
      { id: 'crit', value: 0.14, pct: true },
      { id: 'leech', value: 0.05, pct: true },
    ],
  });

  const legacyItems = [
    { loc: 'equipped', slot: 'weapon', idx: null, ...legacyWeapon },
    { loc: 'equipped', slot: 'amulet', idx: null, ...legacyAmulet },
    { loc: 'inventory', slot: null, idx: 2, ...legacyBoots },
    { loc: 'inventory', slot: null, idx: 13, ...legacyRing },
  ];
  const storedItems = legacyItems.map(({ baseId, ...raw }) => ({ ...raw, base: baseId }));
  const common = {
    voc: 'knight',
    name: 'Ariela',
    level: 17,
    xp: 456,
    gold: 987,
    floor: 11,
    potions: { hp: 14, mp: 9 },
  };
  const v1 = {
    ...common,
    equip: { weapon: legacyWeapon, amulet: legacyAmulet },
    inv: [null, null, legacyBoots, ...new Array(10).fill(null), legacyRing],
  };
  const v2 = { ...common, v: 2, items: storedItems };
  const v3 = {
    ...common,
    v: 3,
    totalXp: S.totalXpFor(common.level, common.xp),
    items: storedItems,
  };

  const itemProjection = raw =>
    raw && {
      baseId: raw.baseId,
      slot: raw.slot,
      name: raw.name,
      glyph: raw.glyph,
      rarity: raw.rarity,
      ilvl: raw.ilvl,
      forVoc: raw.forVoc,
      atk: raw.atk,
      def: raw.def,
      ml: raw.ml,
      hp: raw.hp,
      mp: raw.mp,
      speed: raw.speed,
      atkSpeed: raw.atkSpeed,
      crit: raw.crit,
      leech: raw.leech,
      cooldown: raw.cooldown,
      elemental: raw.elemental,
      statusPower: raw.statusPower,
      area: raw.area,
      affixes: raw.affixes.map(({ id, value, pct }) => ({ id, value, pct })),
    };
  const projection = save => ({
    v: save.v,
    voc: save.voc,
    name: save.name,
    totalXp: save.totalXp,
    level: save.level,
    xp: save.xp,
    gold: save.gold,
    floor: save.floor,
    potions: save.potions,
    equip: Object.fromEntries(EQUIP_SLOTS.map(slot => [slot, itemProjection(save.equip[slot])])),
    inv: save.inv.map(itemProjection),
    bestiary: save.bestiary,
    contracts: save.contracts,
  });

  const canonical = [v1, v2, v3].map(S.normalizeSave);
  const normalized = canonical.map(projection);
  const expected = normalized[0];
  check(
    'save: fixtures v1, v2 e v3 chegam ao mesmo save canônico v4 campo a campo',
    canonical.every(save => save?.v === S.SAVE_VERSION) &&
      normalized.every(save => JSON.stringify(save) === JSON.stringify(expected)),
    JSON.stringify(normalized)
  );
  check(
    'save: a cadeia preserva progresso, poções, equipados e índices da mochila',
    expected.voc === common.voc &&
      expected.name === common.name &&
      expected.totalXp === S.totalXpFor(common.level, common.xp) &&
      expected.level === common.level &&
      expected.xp === common.xp &&
      expected.gold === common.gold &&
      expected.floor === common.floor &&
      JSON.stringify(expected.potions) === JSON.stringify(common.potions) &&
      expected.equip.weapon?.name === legacyWeapon.name &&
      expected.equip.amulet?.name === legacyAmulet.name &&
      expected.inv[2]?.name === legacyBoots.name &&
      expected.inv[13]?.name === legacyRing.name,
    JSON.stringify(expected)
  );
  check(
    'save: a cadeia não perde stats, afixos ou os defaults meta v4',
    expected.equip.weapon?.cooldown === legacyWeapon.cooldown &&
      expected.equip.weapon?.elemental === legacyWeapon.elemental &&
      expected.equip.weapon?.statusPower === legacyWeapon.statusPower &&
      expected.equip.weapon?.area === legacyWeapon.area &&
      JSON.stringify(expected.equip.weapon?.affixes) === JSON.stringify(legacyWeapon.affixes) &&
      JSON.stringify(expected.bestiary) === JSON.stringify({ kills: {} }) &&
      JSON.stringify(expected.contracts) === JSON.stringify({ day: '', progress: {}, claimed: [] }),
    JSON.stringify(expected)
  );

  // Cada fixture entra pelo mesmo caminho do navegador: storage, load, autosave
  // canônico e uma nova instância após reload. Assim uma normalização isolada não
  // mascara regressão no formato que realmente fica gravado.
  const afterReload = [v1, v2, v3].map(raw => {
    const storage = fresh({ 'sf-save-knight': JSON.stringify(raw) });
    const loaded = S.loadSave('knight');
    const written = loaded && S.writeSave(loaded, loaded.floor);
    const persisted = storage.getItem('sf-save-knight');
    fresh({ 'sf-save-knight': persisted });
    return { written, persisted, reloaded: S.loadSave('knight') };
  });
  check(
    'save: fixtures v1, v2 e v3 migram pelo storage e recarregam como o mesmo v4 canônico',
    afterReload.every(
      ({ written, persisted, reloaded }) =>
        written === true &&
        JSON.parse(persisted).v === S.SAVE_VERSION &&
        JSON.stringify(projection(reloaded)) === JSON.stringify(expected)
    ),
    JSON.stringify(afterReload.map(({ persisted }) => persisted))
  );

  // A tentativa futura também começa num storage novo; o descarte não pode
  // deixar dados parciais para uma nova inicialização da mesma vocação.
  const futureRaw = JSON.stringify({
    v: S.SAVE_VERSION + 1,
    voc: 'knight',
    gold: 999999,
    bestiary: { kills: { rat: 999999 } },
    contracts: completeDailyState(DAILY_ONE),
    items: [{ loc: 'inventory', idx: 0, base: 'sword', name: 'Não pode entrar', affixes: [] }],
  });
  const futureStorage = fresh({ 'sf-save-knight': futureRaw });
  const rejected = S.loadSave('knight');
  const untouchedFuture = futureStorage.getItem('sf-save-knight');
  const cleanStorage = fresh();
  const cleanLoad = S.loadSave('knight');
  check(
    'save: versão futura é rejeitada em sequência limpa sem contaminar o próximo storage',
    rejected === null &&
      untouchedFuture === futureRaw &&
      cleanLoad === null &&
      cleanStorage.getItem('sf-save-knight') === null
  );
}

console.log('\n== save: round-trip v4 e reload ==');
{
  const p = hero({
    bestiary: { kills: { rat: 47, ferumbras: 3 } },
    contracts: {
      day: DAILY_DAY,
      progress: { [DAILY_ONE.id]: 9, [DAILY_TWO.id]: DAILY_TWO.objective.amount },
      claimed: [DAILY_TWO.id],
    },
  });
  p.equip.weapon = item({ cooldown: 0.11, elemental: 8, statusPower: 0.14, area: 0.07 });
  p.inv[6] = item({ baseId: 'ring', slot: 'ring', name: 'Anel persistente', crit: 0.08 });

  const firstStorage = fresh();
  const firstWrite = S.writeSave(p, 13);
  const firstRaw = firstStorage.getItem('sf-save-knight');

  // Uma nova injeção representa a página depois do reload: nada da referência
  // do personagem original participa da segunda escrita.
  const reloadedStorage = fresh({ 'sf-save-knight': firstRaw });
  const reloaded = S.loadSave('knight');
  const secondWrite = reloaded && S.writeSave(reloaded, 1);
  const secondRaw = reloadedStorage.getItem('sf-save-knight');
  const afterReload = S.loadSave('knight');

  check(
    'save: write-read-write v4 é canônico e estável byte a byte',
    firstWrite === true && secondWrite === true && firstRaw === secondRaw,
    JSON.stringify({ firstRaw, secondRaw })
  );
  check(
    'save: reload preserva progresso, itens e meta v4 completa',
    afterReload?.floor === 13 &&
      afterReload.equip.weapon?.cooldown === 0.11 &&
      afterReload.inv[6]?.name === 'Anel persistente' &&
      JSON.stringify(afterReload.bestiary) ===
        JSON.stringify({ kills: { rat: 47, ferumbras: 3 } }) &&
      JSON.stringify(afterReload.contracts) ===
        JSON.stringify({
          day: DAILY_DAY,
          progress: { [DAILY_ONE.id]: 9, [DAILY_TWO.id]: DAILY_TWO.objective.amount },
          claimed: [DAILY_TWO.id],
        }),
    JSON.stringify(afterReload)
  );
}

console.log('\n== save: falha de storage ==');
{
  let calls = 0,
    warns = 0;
  S.setStorage({
    getItem: () => null,
    setItem: () => {
      calls++;
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {},
  });
  S.resetWarnings();
  S.setWarnHandler(() => {
    warns++;
  });

  let threw = false;
  try {
    S.writeSave(hero(), 1);
    S.writeSave(hero(), 1);
    S.writeSave(hero(), 1);
  } catch (e) {
    threw = true;
  }
  check('save: falha de gravação não propaga', !threw && calls === 3, `chamadas ${calls}`);
  check('save: falha de gravação sinaliza uma única vez', warns === 1, `avisos ${warns}`);
  S.setWarnHandler(null);
}

{
  const stable = fresh();
  const original = hero({
    bestiary: { kills: { rat: 22 } },
    contracts: completeDailyState(DAILY_ONE),
  });
  S.writeSave(original, 12);
  const before = stable.getItem('sf-save-knight');
  const changed = hero({ bestiary: { kills: { rat: 999 } } });
  let writes = 0;
  S.setStorage({
    getItem: stable.getItem.bind(stable),
    setItem: () => {
      writes++;
      throw new Error('QuotaExceededError');
    },
    removeItem: stable.removeItem.bind(stable),
  });
  const written = S.writeSave(changed, 1);
  const unchanged = stable.getItem('sf-save-knight') === before;
  S.setStorage(stable);
  const recovered = S.loadSave('knight');
  check(
    'save: setItem que lança mantém o último save válido intacto',
    written === false &&
      writes === 1 &&
      unchanged &&
      recovered?.floor === 12 &&
      JSON.stringify(recovered?.bestiary) === JSON.stringify({ kills: { rat: 22 } }) &&
      JSON.stringify(recovered?.contracts) === JSON.stringify(completeDailyState(DAILY_ONE)),
    JSON.stringify(recovered)
  );
}

{
  const stable = fresh();
  const original = hero({
    bestiary: { kills: { rat: 31 } },
    contracts: completeDailyState(DAILY_TWO),
  });
  S.writeSave(original, 14);
  const before = stable.getItem('sf-save-knight');
  let writes = 0,
    warns = 0;
  S.setStorage({
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      writes++;
    },
    removeItem: () => {},
  });
  S.setWarnHandler(() => {
    warns++;
  });
  const raw = S.readRaw('knight');
  const written = S.writeSave(hero({ bestiary: { kills: { rat: 999 } } }), 1);
  S.setWarnHandler(null);
  const unchanged = stable.getItem('sf-save-knight') === before;
  S.setStorage(stable);
  const recovered = S.loadSave('knight');
  check(
    'save: getItem que lança não sobrescreve o último save válido',
    raw === null &&
      written === false &&
      writes === 0 &&
      warns === 1 &&
      unchanged &&
      recovered?.floor === 14 &&
      JSON.stringify(recovered?.bestiary) === JSON.stringify({ kills: { rat: 31 } }) &&
      JSON.stringify(recovered?.contracts) === JSON.stringify(completeDailyState(DAILY_TWO)),
    JSON.stringify(recovered)
  );
}

console.log('\n== save: leitura corrompida ==');
{
  fresh({ 'sf-save-knight': '{isto não é json' });
  check(
    'save: JSON inválido retorna nulo sem aplicar progresso parcial',
    S.loadSave('knight') === null && S.readRaw('knight') === null
  );

  let warns = 0;
  fresh({ 'sf-save-knight': 'nada disso' });
  S.setWarnHandler(() => {
    warns++;
  });
  S.loadSave('knight');
  check('save: JSON inválido avisa o jogador', warns === 1);
  S.setWarnHandler(null);

  const b = S.normalizeSave({
    v: 2,
    voc: 'knight',
    level: 'doze',
    xp: null,
    gold: [1, 2],
    floor: {},
    potions: 'nenhuma',
    items: [
      {
        loc: 'inventory',
        idx: 0,
        base: 'inexistente',
        rarity: 'rare',
        name: 'Fantasma',
        affixes: [],
      },
      {
        loc: 'inventory',
        idx: 1,
        base: 'sword',
        rarity: 'nao-existe',
        ilvl: 2,
        name: 'Ok',
        affixes: [{ id: 'sumiu', value: 3 }],
      },
    ],
  });
  check(
    'save: campo com tipo errado é ignorado sem derrubar o resto',
    b &&
      b.level === 1 &&
      b.xp === 0 &&
      b.gold === 0 &&
      b.floor === 1 &&
      b.potions.hp === START_POTIONS.hp,
    JSON.stringify({ l: b?.level, x: b?.xp, g: b?.gold, f: b?.floor })
  );
  check(
    'save: item com base inexistente é descartado e o resto sobrevive',
    b.inv.filter(Boolean).length === 1 && b.inv[1].name === 'Ok'
  );
  check(
    'save: raridade inválida cai para comum e afixo inexistente é descartado',
    b.inv[1].rarity === 'common' && b.inv[1].affixes.length === 0
  );

  check(
    'save: vocação inexistente descarta o save',
    S.normalizeSave({ v: 2, voc: 'bardo', items: [] }) === null
  );

  const future = {
    v: S.SAVE_VERSION + 1,
    voc: 'knight',
    totalXp: S.totalXpFor(400, 0),
    gold: 999999,
    items: [
      {
        loc: 'inventory',
        idx: 0,
        base: 'sword',
        rarity: 'legendary',
        ilvl: 999,
        name: 'Não pode entrar',
        affixes: [],
      },
    ],
    bestiary: { kills: { rat: 999999 } },
    contracts: { day: '2026-08-28', progress: { daily_1: 99 }, claimed: ['daily_1'] },
  };
  fresh({ 'sf-save-knight': JSON.stringify(future) });
  check(
    'save: v4 futura lida do storage é descartada inteira sem meta, item ou progresso parcial',
    S.loadSave('knight') === null
  );

  const hostileMeta = S.normalizeSave(
    JSON.parse(
      '{"v":4,"voc":"knight","items":[],"bestiary":{"kills":{"__proto__":9,"constructor":8,"prototype":7,"rat":2}},"contracts":{"progress":{"__proto__":9,"constructor":8,"prototype":7,"daily_1":3}}}'
    )
  );
  check(
    'save: ids especiais desconhecidos não atravessam para meta v4',
    JSON.stringify(hostileMeta?.bestiary.kills) === JSON.stringify({ rat: 2 }) &&
      JSON.stringify(hostileMeta?.contracts) ===
        JSON.stringify({ day: '', progress: {}, claimed: [] }),
    JSON.stringify(hostileMeta)
  );
}

console.log('\n== perfil (browser_profiles) ==');
{
  const st = fresh();
  check('perfil: nome vazio vira padrão', S.writeName('   ') === S.DEFAULT_NAME);
  check(
    'perfil: nome longo é truncado em 14',
    S.writeName('Arauto das Cinzas Eternas').length === S.NAME_MAX
  );
  check('perfil: nome é gravado na chave sf-name', st.getItem('sf-name') === 'Arauto das Cin');
  check('perfil: nome é lido de volta', S.readName() === 'Arauto das Cin');
  fresh();
  check('perfil: sem nome gravado devolve o padrão', S.readName() === S.DEFAULT_NAME);
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
