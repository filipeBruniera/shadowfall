// Validação de save no host: o localStorage do convidado não é confiável.
import { validateSave, describeReport, maxItemLevel } from '../js/validate.js';
import * as Save from '../js/save.js';
import { INV_SIZE, POTION_STACK } from '../js/balance.js';
import { EQUIP_SLOTS } from '../js/data.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { console.log(`  FAIL ${label} ${extra}`); failures++; }
}
Save.setStorage(Save.memoryStorage());

const it = (over = {}) => ({
  loc: 'inventory', idx: 0, base: 'sword', rarity: 'common', ilvl: 2,
  name: 'Espada', affixes: [], ...over,
});
const raw = (over = {}) => ({ v: 3, voc: 'knight', name: 'X', totalXp: 0, gold: 0, floor: 1, potions: { hp: 5, mp: 5 }, items: [], ...over });

console.log('\n== progressão ==');
{
  const total = Save.totalXpFor(9, 40);
  const { save } = validateSave(raw({ level: 99, totalXp: total, floor: 20 }), { floor: 20 });
  check('validação: nível é derivado do XP e ignora o valor enviado', save.level === 9 && save.xp === 40, `nv ${save.level}`);

  const inflated = validateSave(raw({ totalXp: Save.totalXpFor(400, 0), floor: 3 }), { floor: 3 });
  check('validação: XP acumulado é limitado pelo andar alcançado',
    inflated.save.level < 400 && inflated.report.xpCapped, `nv ${inflated.save.level}`);

  for (const bad of [-100, NaN, Infinity, 'muito', null]) {
    const r = validateSave(raw({ totalXp: bad }), { floor: 1 });
    if (r.save.level !== 1 || r.save.totalXp !== 0) { check(`validação: XP inválido (${bad}) vira 0`, false, `nv ${r.save.level}`); break; }
  }
  check('validação: XP inválido vira 0', validateSave(raw({ totalXp: NaN }), { floor: 1 }).save.totalXp === 0);
}

console.log('\n== nível de item ==');
{
  const r = validateSave(raw({ floor: 4, items: [it({ ilvl: 400, rarity: 'legendary', affixes: [{ id: 'atk', value: 9999 }] })] }), { floor: 4 });
  const item = r.save.inv[0];
  check('validação: item acima do teto do andar é rebaixado',
    item.ilvl === maxItemLevel(4) && r.report.itemsDowngraded === 1, `ilvl ${item.ilvl}`);
  check('validação: o rebaixamento recalcula os stats do item',
    Number.isInteger(item.atk) && item.atk < 200, `atk ${item.atk}`);
  check('validação: afixo fora da faixa é limitado ao teto do tipo',
    item.affixes[0].value <= 6 * (1 + item.ilvl * 0.05), `valor ${item.affixes[0].value}`);

  const ok = validateSave(raw({ floor: 9, items: [it({ ilvl: 5 })] }), { floor: 9 });
  check('validação: item dentro do teto não é rebaixado', ok.report.itemsDowngraded === 0 && ok.save.inv[0].ilvl === 5);
}

console.log('\n== integridade referencial ==');
{
  const r = validateSave(raw({ items: [
    it({ idx: 0, base: 'nao-existe' }),
    it({ idx: 1, rarity: 'inventada' }),
    it({ idx: 2, affixes: [{ id: 'fantasma', value: 5 }, { id: 'atk', value: 3 }] }),
  ] }), { floor: 5 });

  const kept = r.save.inv.filter(Boolean);
  check('validação: item com base inexistente é descartado', kept.length === 2 && r.report.itemsDropped === 1);
  check('validação: raridade inexistente cai para comum', kept.some((i) => i.rarity === 'common'));
  check('validação: afixo com tipo inexistente é descartado e o item sobrevive',
    kept.some((i) => i.affixes.length === 1 && i.affixes[0].id === 'atk'));
}
{
  // Item equipado num slot que não é o da base vai para a mochila.
  const r = validateSave(raw({ items: [it({ loc: 'equipped', slot: 'armor', base: 'sword', idx: null })] }), { floor: 3 });
  check('validação: slot que não bate com a base é movido para a mochila',
    !r.save.equip.armor && r.save.inv.filter(Boolean).length === 1 && r.report.movedToBag === 1);
}

console.log('\n== faixas e capacidade ==');
{
  const r = validateSave(raw({ gold: -50, potions: { hp: 999, mp: -3 } }), { floor: 2 });
  check('validação: valores fora de faixa são limitados',
    r.save.gold === 0 && r.save.potions.hp === POTION_STACK && r.save.potions.mp === 0);
  check('validação: NaN e infinito são rejeitados',
    validateSave(raw({ gold: NaN }), { floor: 1 }).save.gold === 0
    && validateSave(raw({ gold: Infinity }), { floor: 1 }).save.gold >= 0);

  const many = raw({ items: Array.from({ length: 40 }, (_, i) => it({ idx: i })) });
  const r2 = validateSave(many, { floor: 5 });
  check('validação: mochila com 40 itens entra com 20',
    r2.save.inv.filter(Boolean).length === INV_SIZE && r2.report.itemsDropped === 20, `${r2.save.inv.filter(Boolean).length}`);

  const two = raw({ items: [
    it({ loc: 'equipped', slot: 'weapon', base: 'sword', name: 'A', idx: null }),
    it({ loc: 'equipped', slot: 'weapon', base: 'axe', name: 'B', idx: null }),
  ] });
  const r3 = validateSave(two, { floor: 5 });
  check('validação: dois itens no mesmo slot equipável',
    r3.save.equip.weapon.name === 'A' && r3.save.inv.filter(Boolean).some((i) => i.name === 'B'));

  const badIdx = validateSave(raw({ items: [it({ idx: 99 }), it({ idx: -4, name: 'B' })] }), { floor: 3 });
  check('validação: índice fora de 0..19 é reatribuído ao primeiro slot livre',
    badIdx.save.inv.filter(Boolean).length === 2 && badIdx.save.inv[0] && badIdx.save.inv[1]);
}

console.log('\n== pureza ==');
{
  const input = raw({ level: 40, totalXp: Save.totalXpFor(6, 10), floor: 4, gold: 55, items: [it({ ilvl: 300 })] });
  const a = validateSave(structuredClone(input), { floor: 4 });
  const b = validateSave(structuredClone(input), { floor: 4 });
  check('validação: a função é pura e determinística',
    JSON.stringify(a.save) === JSON.stringify(b.save));

  const again = validateSave(JSON.parse(JSON.stringify({ ...a.save, items: [] })), { floor: 4 });
  check('validação: aplicar sobre um save já saneado não altera a progressão',
    again.save.level === a.save.level && again.save.gold === a.save.gold && again.save.totalXp === a.save.totalXp);

  const before = JSON.stringify(input);
  validateSave(input, { floor: 4 });
  check('validação: a entrada original não é mutada', JSON.stringify(input) === before);
}

console.log('\n== relato ==');
{
  const r = validateSave(raw({ level: 99, totalXp: Save.totalXpFor(300, 0), floor: 60, items: [it({ ilvl: 400 })] }), { floor: 3 });
  const note = describeReport('Marina', r.report);
  check('validação: saneamento é registrado com o que mudou', note.includes('Marina') && note.includes('rebaixado'), note);
  check('validação: save limpo não gera relato', describeReport('Bruno', validateSave(raw(), { floor: 1 }).report) === '');
  check('validação: save inaproveitável é relatado como descartado',
    describeReport('Z', validateSave({ v: 3, voc: 'bardo' }, { floor: 1 }).report).includes('descartado'));
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
