// Catálogo do bestiário: não carrega save, DOM nem estado de uma run.
import { BOSSES, ELEM_NAME, MONSTERS } from '../js/data.js';
import {
  BESTIARY_BY_ID,
  BESTIARY_CATALOG,
  getBestiaryRevelations,
  getBestiaryTier,
  getBestiaryEntry,
  recordBestiaryDefeat,
} from '../js/bestiary.js';
import { BESTIARY_TIER_THRESHOLDS } from '../js/balance.js';
import { addPlayer, createGame, hitMonster } from '../js/sim.js';
import * as Save from '../js/save.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.log(`  FAIL ${label} ${extra}`);
    failures++;
  }
}

const sourceTypes = [
  ...MONSTERS.map(monster => ({ monster, kind: 'monster' })),
  ...BOSSES.map(monster => ({ monster, kind: 'boss' })),
];

console.log('\n== bestiário: catálogo derivado ==');
check(
  'bestiário: cobre cada tipo de monstro e chefe exatamente uma vez, na ordem do conteúdo',
  JSON.stringify(BESTIARY_CATALOG.map(entry => entry.id)) ===
    JSON.stringify(sourceTypes.map(({ monster }) => monster.id)) &&
    Object.keys(BESTIARY_BY_ID).length === sourceTypes.length,
  JSON.stringify(BESTIARY_CATALOG.map(entry => entry.id))
);

console.log('\n== bestiário: revelações em camadas ==');
{
  const rat = getBestiaryEntry('rat');
  const progress = { rat: 0 };
  const hidden = getBestiaryRevelations(progress, 'rat');
  progress.rat = 1;
  const identified = getBestiaryRevelations(progress, 'rat');
  progress.rat = 24;
  const beforeAffinities = getBestiaryRevelations(progress, 'rat');
  progress.rat = 25;
  const studied = getBestiaryRevelations(progress, 'rat');
  progress.rat = 99;
  const beforeAttributes = getBestiaryRevelations(progress, 'rat');
  progress.rat = 100;
  const mastered = getBestiaryRevelations(progress, 'rat');
  check(
    'bestiário: antes da primeira derrota não vaza texto, afinidade ou atributo',
    hidden?.tier === 0 &&
      JSON.stringify(hidden) === JSON.stringify({ id: 'rat', tier: 0 }) &&
      !JSON.stringify(hidden).includes(rat.name) &&
      !JSON.stringify(hidden).includes(String(rat.revelations.attributes.hp)),
    JSON.stringify(hidden)
  );
  check(
    'bestiário: tier 1 revela somente a identidade textual do tipo',
    identified?.tier === 1 &&
      JSON.stringify(identified.identity) === JSON.stringify({ name: rat.name, kind: rat.kind }) &&
      !('affinities' in identified) &&
      !('attributes' in identified) &&
      !('abilities' in identified),
    JSON.stringify(identified)
  );
  check(
    'bestiário: antes de 25 derrotas não antecipa afinidades',
    beforeAffinities?.tier === 1 &&
      !('affinities' in beforeAffinities) &&
      !('attributes' in beforeAffinities) &&
      !('abilities' in beforeAffinities),
    JSON.stringify(beforeAffinities)
  );
  check(
    'bestiário: tier 2 adiciona afinidades sem antecipar atributos',
    studied?.tier === 2 &&
      JSON.stringify(studied.affinities) === JSON.stringify(rat.revelations.affinities) &&
      !('attributes' in studied) &&
      !('abilities' in studied),
    JSON.stringify(studied)
  );
  check(
    'bestiário: antes de 100 derrotas não antecipa atributos ou especiais',
    beforeAttributes?.tier === 2 &&
      !('attributes' in beforeAttributes) &&
      !('abilities' in beforeAttributes),
    JSON.stringify(beforeAttributes)
  );
  check(
    'bestiário: tier 3 libera atributos e especiais derivados do catálogo',
    mastered?.tier === 3 &&
      JSON.stringify(mastered.attributes) === JSON.stringify(rat.revelations.attributes) &&
      JSON.stringify(mastered.abilities) === JSON.stringify(rat.revelations.abilities),
    JSON.stringify(mastered)
  );
  check(
    'bestiário: cada camada é imutável e não grava revelação no progresso',
    Object.isFrozen(hidden) &&
      Object.isFrozen(identified) &&
      Object.isFrozen(identified.identity) &&
      Object.isFrozen(studied.affinities) &&
      Object.isFrozen(mastered.attributes) &&
      Object.isFrozen(mastered.abilities) &&
      JSON.stringify(progress) === JSON.stringify({ rat: 100 }),
    JSON.stringify({ mastered, progress })
  );
}
{
  const boss = getBestiaryEntry('ferumbras');
  const tierTwo = getBestiaryRevelations({ ferumbras: 25 }, 'ferumbras');
  const tierThree = getBestiaryRevelations({ ferumbras: 100 }, 'ferumbras');
  check(
    'bestiário: texto de especial de chefe não vaza antes do tier 3',
    boss.revelations.abilities.length > 0 &&
      !JSON.stringify(tierTwo).includes(boss.revelations.abilities[0].name) &&
      JSON.stringify(tierThree.abilities) === JSON.stringify(boss.revelations.abilities),
    JSON.stringify({ tierTwo, tierThree })
  );
}
check(
  'bestiário: tipo removido, desconhecido ou chave interna tem fallback nulo sem revelar catálogo',
  ['removido', 'constructor', null].every(
    typeId => getBestiaryRevelations({ rat: 100 }, typeId) === null
  ),
  JSON.stringify({
    removed: getBestiaryRevelations({ rat: 100 }, 'removido'),
    inherited: getBestiaryRevelations({ rat: 100 }, 'constructor'),
  })
);

for (const { monster, kind } of sourceTypes) {
  const entry = getBestiaryEntry(monster.id);
  const expectedAbilities = (monster.specials ?? []).map(special => ({
    id: special.id,
    name: special.name,
    kind: special.kind,
    hardcore: Boolean(special.hc),
  }));
  check(
    `bestiário: ${monster.id} deriva identidade, afinidades, atributos e especiais do conteúdo`,
    entry?.id === monster.id &&
      entry.name === monster.name &&
      entry.kind === kind &&
      entry.revelations.affinities.element === ELEM_NAME[monster.elem] &&
      entry.revelations.affinities.weakness === ELEM_NAME[monster.weak] &&
      entry.revelations.affinities.resistance === (ELEM_NAME[monster.resist] ?? null) &&
      entry.revelations.attributes.hp === monster.hp &&
      entry.revelations.attributes.attack === monster.atk &&
      entry.revelations.attributes.defense === monster.def &&
      entry.revelations.attributes.experience === monster.xp &&
      JSON.stringify(entry.revelations.abilities) === JSON.stringify(expectedAbilities),
    JSON.stringify(entry)
  );
}

console.log('\n== bestiário: consulta segura ==');
check(
  'bestiário: id ausente ou chave interna de objeto não produz falsa entrada',
  getBestiaryEntry('não-existe') === null &&
    getBestiaryEntry('constructor') === null &&
    getBestiaryEntry(null) === null
);
check(
  'bestiário: catálogo e revelações são imutáveis e não expõem os objetos de conteúdo',
  Object.isFrozen(BESTIARY_CATALOG) &&
    BESTIARY_CATALOG.every(
      entry =>
        Object.isFrozen(entry) &&
        Object.isFrozen(entry.revelations) &&
        Object.isFrozen(entry.revelations.affinities) &&
        Object.isFrozen(entry.revelations.attributes) &&
        Object.isFrozen(entry.revelations.abilities)
    ) &&
    getBestiaryEntry('rat') !== MONSTERS.find(monster => monster.id === 'rat'),
  JSON.stringify(getBestiaryEntry('rat'))
);

console.log('\n== bestiário: derrotas autoritativas ==');
{
  const before = { rat: 2 };
  const after = recordBestiaryDefeat(before, 'rat');
  check(
    'bestiário: domínio puro incrementa somente tipo conhecido sem mutar a entrada',
    after.rat === 3 && before.rat === 2 && after !== before,
    JSON.stringify({ before, after })
  );
  check(
    'bestiário: tipo ausente não cria contador',
    recordBestiaryDefeat(before, 'removido') === before &&
      recordBestiaryDefeat(before, 'constructor') === before,
    JSON.stringify(before)
  );
}

console.log('\n== bestiário: tiers derivados ==');
const tierCases = [
  { kills: 0, tier: 0 },
  { kills: 1, tier: 1 },
  { kills: 2, tier: 1 },
  { kills: 24, tier: 1 },
  { kills: 25, tier: 2 },
  { kills: 26, tier: 2 },
  { kills: 99, tier: 2 },
  { kills: 100, tier: 3 },
  { kills: 101, tier: 3 },
];
check(
  'bestiário: os marcos de tier são 1, 25 e 100 derrotas',
  JSON.stringify(BESTIARY_TIER_THRESHOLDS) === JSON.stringify([1, 25, 100]),
  JSON.stringify(BESTIARY_TIER_THRESHOLDS)
);
for (const { kills, tier } of tierCases) {
  const progress = { rat: kills };
  check(
    `bestiário: ${kills} derrotas deriva tier ${tier} sem guardar estado adicional`,
    getBestiaryTier(progress, 'rat') === tier &&
      JSON.stringify(progress) === JSON.stringify({ rat: kills }),
    JSON.stringify({ progress, tier: getBestiaryTier(progress, 'rat') })
  );
}
check(
  'bestiário: tipo desconhecido e contagens hostis não produzem tier revelado',
  getBestiaryTier({ rat: 100 }, 'removido') === null &&
    [undefined, null, -1, 0.5, NaN, Infinity, '100', {}].every(
      value => getBestiaryTier({ rat: value }, 'rat') === 0
    ),
  JSON.stringify({
    unknown: getBestiaryTier({ rat: 100 }, 'removido'),
    hostile: [undefined, null, -1, 0.5, NaN, Infinity, '100', {}].map(value =>
      getBestiaryTier({ rat: value }, 'rat')
    ),
  })
);

{
  const game = createGame(5802, 1);
  const hero = addPlayer(game, { id: 'hero', name: 'Contador', voc: 'knight' });
  const target = game.monsters.find(monster => !monster.isBoss);
  hitMonster(game, target, 1_000_000, target.weak, hero);
  hitMonster(game, target, 1_000_000, target.weak, hero);
  const deaths = game.events.filter(event => event.t === 'fx' && event.k === 'death');
  check(
    'bestiário: morte autoritativa conta uma vez mesmo com dano replayado',
    hero.bestiary.kills[target.typeId] === 1 && hero.kills === 1 && deaths.length === 1,
    JSON.stringify({ kills: hero.bestiary, runKills: hero.kills, deaths: deaths.length })
  );
}

{
  const storage = Save.memoryStorage();
  Save.setStorage(storage);
  const firstGame = createGame(5803, 1);
  const firstHero = addPlayer(firstGame, { id: 'first', name: 'Persistente', voc: 'knight' });
  const firstTarget = firstGame.monsters.find(monster => !monster.isBoss);
  hitMonster(firstGame, firstTarget, 1_000_000, firstTarget.weak, firstHero);
  Save.writeSave(firstHero, 1);

  const loaded = Save.loadSave('knight');
  const secondGame = createGame(5804, 1);
  const secondHero = addPlayer(secondGame, { id: 'second', name: 'Persistente', voc: 'knight' });
  secondHero.bestiary = loaded.bestiary;
  const secondTarget = secondGame.monsters.find(monster => !monster.isBoss);
  hitMonster(secondGame, secondTarget, 1_000_000, secondTarget.weak, secondHero);
  Save.writeSave(secondHero, 1);
  const reloaded = Save.loadSave('knight');
  check(
    'bestiário: derrotas sobrevivem a save, reload e nova run',
    reloaded.bestiary.kills[firstTarget.typeId] === 1 &&
      reloaded.bestiary.kills[secondTarget.typeId] ===
        (firstTarget.typeId === secondTarget.typeId ? 2 : 1),
    JSON.stringify(reloaded.bestiary)
  );
  Save.setStorage(null);
}

console.log('\n== bestiário: persistência v4 hostil ==');
{
  const hostile = Save.normalizeSave({
    v: Save.SAVE_VERSION,
    voc: 'knight',
    items: [],
    bestiary: {
      kills: {
        rat: 1.9,
        ferumbras: Save.BESTIARY_KILL_MAX + 1,
        removido: 100,
        constructor: 100,
        spider: -1,
      },
    },
  });
  check(
    'bestiário: save v4 preserva somente tipos conhecidos, inteiros positivos e limitados',
    JSON.stringify(hostile?.bestiary) ===
      JSON.stringify({ kills: { rat: 1, ferumbras: Save.BESTIARY_KILL_MAX } }),
    JSON.stringify(hostile?.bestiary)
  );

  const withoutMeta = Save.normalizeSave({ v: 3, voc: 'knight', items: [] });
  const migratedHostile = Save.normalizeSave({
    v: 3,
    voc: 'knight',
    items: [],
    bestiary: { kills: { rat: 3, removido: 99 } },
  });
  check(
    'bestiário: migração v3 cria defaults e saneia o bloco legado hostil',
    JSON.stringify(withoutMeta?.bestiary) === JSON.stringify({ kills: {} }) &&
      JSON.stringify(migratedHostile?.bestiary) === JSON.stringify({ kills: { rat: 3 } }),
    JSON.stringify({ defaults: withoutMeta?.bestiary, legacy: migratedHostile?.bestiary })
  );
}

process.exit(failures ? 1 : 0);
