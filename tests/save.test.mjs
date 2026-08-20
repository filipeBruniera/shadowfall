// Testes do formato do save — rodam sem navegador, sobre armazenamento de memória.
import * as S from '../js/save.js';
import { INV_SIZE, POTION_STACK, START_POTIONS } from '../js/balance.js';
import { EQUIP_SLOTS } from '../js/data.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { console.log(`  FAIL ${label} ${extra}`); failures++; }
}

const item = (over = {}) => ({
  baseId: 'sword', slot: 'weapon', rarity: 'rare', ilvl: 9,
  name: 'Espada Afiada', glyph: 'sword',
  atk: 14, def: 0, ml: 0, hp: 0, mp: 0, speed: 0, atkSpeed: 0, crit: 0, leech: 0,
  affixes: [{ id: 'atk', name: 'Afiado', stat: 'atk', value: 4, pct: false }],
  ...over,
});

const hero = (over = {}) => ({
  voc: 'knight', name: 'Bruno', level: 12, xp: 1200, gold: 340,
  equip: { weapon: null, offhand: null, armor: null, boots: null, ring: null, amulet: null },
  inv: new Array(INV_SIZE).fill(null),
  potions: { hp: 8, mp: 6 },
  ...over,
});

function fresh(initial = {}) { const st = S.memoryStorage(initial); S.setStorage(st); S.resetWarnings(); return st; }

// ============================================================
console.log('\n== save: ida e volta ==');
fresh();
{
  const p = hero();
  p.equip.weapon = item();
  p.inv[3] = item({ baseId: 'ring', slot: 'ring', rarity: 'epic', name: 'Anel Cruel', atk: 2, ml: 2, crit: 0.05, affixes: [{ id: 'crit', value: 0.05, pct: true }] });
  S.writeSave(p, 7);
  const b = S.loadSave('knight');

  check('save: gravar e ler devolve o mesmo personagem',
    b && b.voc === 'knight' && b.name === 'Bruno' && b.level === 12 && b.xp === 1200 && b.gold === 340 && b.floor === 7,
    JSON.stringify({ l: b?.level, x: b?.xp, g: b?.gold, f: b?.floor }));
  check('save: stats do item sobrevivem à ida e volta',
    b.equip.weapon.atk === 14 && b.equip.weapon.rarity === 'rare' && b.equip.weapon.ilvl === 9);
  check('save: afixo volta com nome e stat derivados do tipo',
    b.equip.weapon.affixes[0].name === 'Afiado' && b.equip.weapon.affixes[0].stat === 'atk' && b.equip.weapon.affixes[0].value === 4);
  check('save: afixo percentual mantém o formato',
    b.inv[3].affixes[0].pct === true && b.inv[3].crit === 0.05);
  check('save: forVoc é derivado da base, não gravado',
    Array.isArray(b.equip.weapon.forVoc) && b.equip.weapon.forVoc.includes('knight'));
}

console.log('\n== save: nível derivado do XP acumulado ==');
fresh();
{
  const total = S.totalXpFor(10, 50);
  const b = S.normalizeSave({ v: 3, voc: 'knight', level: 99, xp: 0, totalXp: total, items: [] });
  check('save: o nível vem do XP acumulado, não do campo enviado', b.level === 10 && b.xp === 50, `nv ${b.level}`);
  check('save: XP residual fica sempre abaixo do limiar do nível', b.xp < 80 * Math.pow(b.level, 1.55));

  // XP residual acima do limiar significa level-up não aplicado: sobe agora.
  const up = S.normalizeSave({ v: 2, voc: 'knight', level: 12, xp: 4210, items: [] });
  check('save: XP residual acima do limiar aplica o nível pendente', up.level === 13 && up.xp < 4210, `nv ${up.level} xp ${up.xp}`);

  const neg = S.normalizeSave({ v: 3, voc: 'knight', totalXp: -500, items: [] });
  check('save: XP acumulado negativo vira nível 1', neg.level === 1 && neg.totalXp === 0);

  const migrated = S.normalizeSave({ voc: 'knight', level: 8, xp: 100, equip: {}, inv: [] });
  check('save: migração v1 calcula o XP acumulado a partir de nível e residual',
    migrated.level === 8 && migrated.xp === 100 && migrated.totalXp === S.totalXpFor(8, 100));
}

console.log('\n== save: posição de itens ==');
fresh();
{
  const p = hero();
  // Uma base por slot: o slot do item vem da base, não é escolhido à mão.
  const baseForSlot = { weapon: 'sword', offhand: 'shield', armor: 'plate', boots: 'boots', ring: 'ring', amulet: 'amulet' };
  for (const slot of EQUIP_SLOTS) p.equip[slot] = item({ baseId: baseForSlot[slot], slot, name: `Eq ${slot}` });
  for (let i = 0; i < INV_SIZE; i++) p.inv[i] = item({ name: `Inv ${i}` });
  S.writeSave(p, 1);
  const b = S.loadSave('knight');

  check('save: itens equipados e da mochila voltam no mesmo lugar',
    EQUIP_SLOTS.every((s) => b.equip[s] && b.equip[s].name === `Eq ${s}`)
    && b.inv.every((it, i) => it && it.name === `Inv ${i}`));
  check('save: mochila volta com exatamente 20 posições', b.inv.length === INV_SIZE);
}

fresh();
{
  // Dois itens reivindicando o mesmo índice: o segundo vai para o primeiro slot livre.
  const raw = {
    v: 2, voc: 'knight', name: 'X', level: 1, xp: 0, gold: 0, floor: 1,
    potions: { hp: 1, mp: 1 },
    items: [
      { loc: 'inventory', idx: 5, base: 'sword', rarity: 'common', ilvl: 1, name: 'A', affixes: [] },
      { loc: 'inventory', idx: 5, base: 'sword', rarity: 'common', ilvl: 1, name: 'B', affixes: [] },
      { loc: 'equipped', slot: 'weapon', base: 'sword', rarity: 'common', ilvl: 1, name: 'C', affixes: [] },
      { loc: 'equipped', slot: 'weapon', base: 'axe', rarity: 'common', ilvl: 1, name: 'D', affixes: [] },
    ],
  };
  const b = S.normalizeSave(raw);
  const occupied = b.inv.filter(Boolean);
  check('save: dois itens não ocupam o mesmo índice de mochila',
    b.inv[5].name === 'A' && occupied.length === 3 && occupied.some((i) => i.name === 'B'));
  check('save: dois itens não ocupam o mesmo slot equipado',
    b.equip.weapon.name === 'C' && occupied.some((i) => i.name === 'D'));
}

fresh();
{
  const raw = {
    v: 2, voc: 'knight', name: 'X', level: 1, xp: 0, gold: 0, floor: 1, potions: { hp: 1, mp: 1 },
    items: [{ loc: 'inventory', idx: 0, base: 'sword', rarity: 'rare', ilvl: 3, name: 'A',
      affixes: [{ id: 'atk', value: 3 }, { id: 'atk', value: 9 }, { id: 'hp', value: 20 }] }],
  };
  const b = S.normalizeSave(raw);
  check('save: afixo não duplica no mesmo item',
    b.inv[0].affixes.length === 2 && b.inv[0].affixes.filter((a) => a.id === 'atk').length === 1);
}

console.log('\n== save: poções (character_consumables) ==');
fresh();
{
  const over = S.normalizeSave({ v: 2, voc: 'knight', potions: { hp: 999, mp: -5 }, items: [] });
  check('save: quantidade de poção é limitada entre 0 e o teto ao carregar',
    over.potions.hp === POTION_STACK && over.potions.mp === 0, `${over.potions.hp}/${over.potions.mp}`);

  const missing = S.normalizeSave({ v: 2, voc: 'knight', items: [] });
  check('save: save sem poções assume os valores iniciais',
    missing.potions.hp === START_POTIONS.hp && missing.potions.mp === START_POTIONS.mp);
}

console.log('\n== save: versão de esquema ==');
fresh();
{
  const future = S.normalizeSave({ v: S.SAVE_VERSION + 1, voc: 'knight', level: 99, gold: 999999, items: [] });
  check('save: versão desconhecida é descartada e não aplica dados parciais', future === null);

  // Formato v1: equip/inv aninhados, sem campo de versão.
  const v1 = {
    voc: 'druid', name: 'Marina', level: 9, xp: 900, gold: 77, floor: 4,
    potions: { hp: 5, mp: 3 },
    equip: { weapon: item({ baseId: 'rod', slot: 'weapon', name: 'Cajado' }), offhand: null, armor: null, boots: null, ring: null, amulet: null },
    inv: [null, item({ baseId: 'boots', slot: 'boots', name: 'Botas' })],
  };
  const m = S.normalizeSave(v1);
  check('save: versão ausente é tratada como 1 e migra',
    m && m.v === S.SAVE_VERSION && m.level === 9 && m.equip.weapon.name === 'Cajado' && m.inv[1].name === 'Botas',
    JSON.stringify({ v: m?.v, lvl: m?.level }));
  check('save: migração preserva ouro, XP e andar', m.gold === 77 && m.xp === 900 && m.floor === 4);
}

console.log('\n== save: falha de gravação ==');
{
  let calls = 0, warns = 0;
  S.setStorage({ getItem: () => null, setItem: () => { calls++; throw new Error('QuotaExceededError'); }, removeItem: () => {} });
  S.resetWarnings();
  S.setWarnHandler(() => { warns++; });

  let threw = false;
  try { S.writeSave(hero(), 1); S.writeSave(hero(), 1); S.writeSave(hero(), 1); } catch (e) { threw = true; }
  check('save: falha de gravação não propaga', !threw && calls === 3, `chamadas ${calls}`);
  check('save: falha de gravação sinaliza uma única vez', warns === 1, `avisos ${warns}`);
  S.setWarnHandler(null);
}

console.log('\n== save: leitura corrompida ==');
{
  fresh({ 'sf-save-knight': '{isto não é json' });
  check('save: JSON inválido retorna nulo', S.loadSave('knight') === null);

  let warns = 0;
  fresh({ 'sf-save-knight': 'nada disso' });
  S.setWarnHandler(() => { warns++; });
  S.loadSave('knight');
  check('save: JSON inválido avisa o jogador', warns === 1);
  S.setWarnHandler(null);

  const b = S.normalizeSave({
    v: 2, voc: 'knight', level: 'doze', xp: null, gold: [1, 2], floor: {}, potions: 'nenhuma',
    items: [
      { loc: 'inventory', idx: 0, base: 'inexistente', rarity: 'rare', name: 'Fantasma', affixes: [] },
      { loc: 'inventory', idx: 1, base: 'sword', rarity: 'nao-existe', ilvl: 2, name: 'Ok', affixes: [{ id: 'sumiu', value: 3 }] },
    ],
  });
  check('save: campo com tipo errado é ignorado sem derrubar o resto',
    b && b.level === 1 && b.xp === 0 && b.gold === 0 && b.floor === 1 && b.potions.hp === START_POTIONS.hp,
    JSON.stringify({ l: b?.level, x: b?.xp, g: b?.gold, f: b?.floor }));
  check('save: item com base inexistente é descartado e o resto sobrevive',
    b.inv.filter(Boolean).length === 1 && b.inv[1].name === 'Ok');
  check('save: raridade inválida cai para comum e afixo inexistente é descartado',
    b.inv[1].rarity === 'common' && b.inv[1].affixes.length === 0);

  check('save: vocação inexistente descarta o save', S.normalizeSave({ v: 2, voc: 'bardo', items: [] }) === null);
}

console.log('\n== perfil (browser_profiles) ==');
{
  const st = fresh();
  check('perfil: nome vazio vira padrão', S.writeName('   ') === S.DEFAULT_NAME);
  check('perfil: nome longo é truncado em 14', S.writeName('Arauto das Cinzas Eternas').length === S.NAME_MAX);
  check('perfil: nome é gravado na chave sf-name', st.getItem('sf-name') === 'Arauto das Cin');
  check('perfil: nome é lido de volta', S.readName() === 'Arauto das Cin');
  fresh();
  check('perfil: sem nome gravado devolve o padrão', S.readName() === S.DEFAULT_NAME);
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
