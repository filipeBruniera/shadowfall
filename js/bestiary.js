// ============================================================
// BESTIÁRIO — catálogo puro, sempre derivado do conteúdo jogável.
// ============================================================
import { BOSSES, ELEM_NAME, MONSTERS } from './data.js';
import { BESTIARY_TIER_THRESHOLDS } from './balance.js';

function elementName(element) {
  return typeof ELEM_NAME[element] === 'string' ? ELEM_NAME[element] : null;
}

function freezeEntry(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) freezeEntry(child);
  }
  return Object.freeze(value);
}

function deriveEntry(monster, kind) {
  return freezeEntry({
    id: monster.id,
    name: monster.name,
    kind,
    revelations: {
      affinities: {
        element: elementName(monster.elem),
        weakness: elementName(monster.weak),
        resistance: elementName(monster.resist),
      },
      attributes: {
        hp: monster.hp,
        attack: monster.atk,
        defense: monster.def,
        experience: monster.xp,
      },
      abilities: (monster.specials ?? []).map(special => ({
        id: special.id,
        name: special.name,
        kind: special.kind,
        hardcore: Boolean(special.hc),
      })),
    },
  });
}

// O save guarda apenas `id -> derrotas`. Nome, afinidades, atributos e nomes
// dos especiais vêm destas tabelas de conteúdo em toda leitura, para que uma
// alteração de design não deixe uma cópia obsoleta no progresso persistido.
export const BESTIARY_CATALOG = Object.freeze([
  ...MONSTERS.map(monster => deriveEntry(monster, 'monster')),
  ...BOSSES.map(boss => deriveEntry(boss, 'boss')),
]);

export const BESTIARY_BY_ID = Object.freeze(
  Object.fromEntries(BESTIARY_CATALOG.map(entry => [entry.id, entry]))
);

export function getBestiaryEntry(id) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(BESTIARY_BY_ID, id)) {
    return null;
  }
  return BESTIARY_BY_ID[id];
}

// A simulação só chama esta operação depois de aceitar a morte da entidade.
// Ela não recebe evento de rede nem olha o DOM: o tipo ainda precisa existir
// no catálogo atual para uma referência removida não criar progresso órfão.
export function recordBestiaryDefeat(kills, typeId) {
  const entry = getBestiaryEntry(typeId);
  if (!entry) return kills;
  const current =
    Number.isSafeInteger(kills?.[entry.id]) && kills[entry.id] > 0 ? kills[entry.id] : 0;
  return { ...(kills && typeof kills === 'object' ? kills : {}), [entry.id]: current + 1 };
}

// Tiers são uma projeção do contador persistido, nunca mais um campo do save.
// Tipo removido não ganha tier e valores hostis contam como progresso nenhum,
// para que uma leitura defensiva não revele informação por acidente.
export function getBestiaryTier(kills, typeId) {
  const entry = getBestiaryEntry(typeId);
  if (!entry) return null;
  const count = kills?.[entry.id];
  if (!Number.isSafeInteger(count) || count < 1) return 0;

  let tier = 0;
  for (const threshold of BESTIARY_TIER_THRESHOLDS) {
    if (count < threshold) break;
    tier++;
  }
  return tier;
}

// A leitura pública nunca devolve o catálogo completo: cada marco libera só
// uma camada. Isso permite que a futura tela do Refúgio exiba um tipo já
// derrotado sem transformar o próprio catálogo em atalho para seus segredos.
const REVELATION_LAYERS = Object.freeze([
  entry => ({ identity: freezeEntry({ name: entry.name, kind: entry.kind }) }),
  entry => ({ affinities: entry.revelations.affinities }),
  entry => ({ attributes: entry.revelations.attributes, abilities: entry.revelations.abilities }),
]);

export function getBestiaryRevelations(kills, typeId) {
  const entry = getBestiaryEntry(typeId);
  const tier = getBestiaryTier(kills, typeId);
  if (!entry || tier === null) return null;

  const revealed = { id: entry.id, tier };
  for (const layer of REVELATION_LAYERS.slice(0, tier)) {
    Object.assign(revealed, layer(entry));
  }
  return freezeEntry(revealed);
}
