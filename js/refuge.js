// ============================================================
// REFÚGIO — projeção pura do progresso durável para a interface.
// A tela recebe somente textos e números já seguros para exibir; regras de
// checkpoint, bestiário e contratos continuam nos seus módulos de domínio.
// ============================================================
import { BESTIARY_CATALOG, getBestiaryRevelations, getBestiaryTier } from './bestiary.js';
import { CONTRACT_TARGETS } from './contracts.js';
import {
  checkpointForFloor,
  chooseStartFloor,
  commonCheckpoints,
  normalizeDeepestFloor,
  unlockedCheckpoints,
} from './progression.js';

const UNKNOWN_CREATURE = 'Criatura desconhecida';
const NO_CONTRACTS = 'Nenhum contrato disponível.';
const NO_DISCOVERIES = 'Nenhuma criatura registrada.';
const POTION_LABELS = Object.freeze({ hp: 'Poção de vida', mp: 'Poção de mana' });
const KIND_LABELS = Object.freeze({ monster: 'Monstro', boss: 'Chefe' });
const TIER_LABELS = Object.freeze(['Desconhecido', 'Identificado', 'Estudado', 'Dominado']);
const CONTRACT_TARGET_BY_ID = Object.freeze(
  Object.fromEntries(CONTRACT_TARGETS.map(target => [target.id, target]))
);

function freezeTree(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) freezeTree(child);
  }
  return Object.freeze(value);
}

function nonNegativeInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(0, Math.trunc(value)));
}

function positiveInteger(value) {
  const whole = nonNegativeInteger(value);
  return whole > 0 ? whole : 0;
}

function safeDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function rosterFor(save, players) {
  if (Array.isArray(players) && players.length) return players;
  return [{ deepestFloor: save?.floor }];
}

function kindLabel(kind) {
  return KIND_LABELS[kind] ?? 'Tipo desconhecido';
}

function bestiaryRow(entry, kills) {
  const count = positiveInteger(kills?.[entry.id]);
  const tier = getBestiaryTier({ [entry.id]: count }, entry.id) ?? 0;
  const revelations = getBestiaryRevelations({ [entry.id]: count }, entry.id);
  const identity = revelations?.identity;

  return freezeTree({
    id: entry.id,
    name: identity?.name ?? UNKNOWN_CREATURE,
    kind: kindLabel(identity?.kind),
    kills: count,
    tier,
    tierLabel: TIER_LABELS[tier] ?? TIER_LABELS[0],
    unknown: tier === 0,
    revelations: revelations ?? { id: entry.id, tier: 0 },
  });
}

// Mantém o modo solo útil sem obrigar a futura tela a inventar um roster. Com
// roster real, `commonCheckpoints()` continua sendo a única política que decide
// o piso comum; a projeção não altera o save nem a escolha recebida.
export function buildCheckpointView({ save, players, requestedCheckpoint } = {}) {
  const deepestFloor = normalizeDeepestFloor(save?.floor);
  const roster = rosterFor(save, players);
  const available = commonCheckpoints(roster);
  const selected = chooseStartFloor(roster, requestedCheckpoint);

  return freezeTree({
    deepestFloor,
    personalCheckpoint: checkpointForFloor(deepestFloor),
    personalCheckpoints: unlockedCheckpoints(deepestFloor),
    groupSize: roster.length,
    grouped: roster.length > 1,
    commonCheckpoint: available[available.length - 1],
    commonCheckpoints: available,
    selectedCheckpoint: selected,
  });
}

// O catálogo inteiro dá à interface uma ordem estável, mas um tipo de tier 0
// recebe texto neutro. Assim a tela pode listar o progresso sem antecipar nome,
// afinidade ou atributo que o domínio ainda não revelou.
export function buildBestiaryView({ save } = {}) {
  const kills = save?.bestiary?.kills;
  const entries = BESTIARY_CATALOG.map(entry => bestiaryRow(entry, kills));
  const discovered = entries.filter(entry => !entry.unknown).length;

  return freezeTree({
    total: entries.length,
    discovered,
    empty: discovered === 0,
    emptyMessage: discovered === 0 ? NO_DISCOVERIES : '',
    entries,
  });
}

function contractEntry(contract, state) {
  const id = typeof contract?.id === 'string' ? contract.id : '';
  const target = CONTRACT_TARGET_BY_ID[contract?.objective?.targetId];
  const amount = positiveInteger(contract?.objective?.amount);
  const gold = positiveInteger(contract?.reward?.gold);
  const potionKind = contract?.reward?.potion?.kind;
  const potionAmount = positiveInteger(contract?.reward?.potion?.amount);
  const potionLabel = POTION_LABELS[potionKind];
  if (!id || !target || !amount || !gold || !potionLabel || !potionAmount) return null;

  const current = Math.min(amount, nonNegativeInteger(state?.progress?.[id], amount));
  const completed = current === amount;
  const claimed = Array.isArray(state?.claimed) && state.claimed.includes(id);

  return freezeTree({
    id,
    objective: {
      text: `Derrote ${amount} ${target.name}.`,
      targetName: target.name,
      current,
      amount,
      completed,
    },
    reward: {
      gold,
      potion: { kind: potionKind, label: potionLabel, amount: potionAmount },
    },
    status: claimed ? 'claimed' : completed ? 'ready' : 'active',
    claimed,
    claimable: completed && !claimed,
  });
}

// A lista diária vem explicitamente da camada que possui o relógio/seed. Isso
// evita que abrir o Refúgio fabrique uma data ou reinterprete o save local.
export function buildContractsView({ save, contracts } = {}) {
  const state = save?.contracts;
  const day = safeDay(state?.day);
  const source = day && Array.isArray(contracts) ? contracts.slice(0, 3) : [];
  const entries = source.map(contract => contractEntry(contract, state)).filter(Boolean);

  return freezeTree({
    day,
    empty: !day || entries.length === 0,
    emptyMessage: !day || entries.length === 0 ? NO_CONTRACTS : '',
    entries,
  });
}

// Fronteira única para a futura UI: aceita save já normalizado e estado da
// sala explicitamente injetado, não toca em storage, relógio, DOM ou domínio.
export function buildRefugeView(options = {}) {
  const save = options?.save;
  return freezeTree({
    checkpoint: buildCheckpointView({
      save,
      players: options?.players,
      requestedCheckpoint: options?.requestedCheckpoint,
    }),
    bestiary: buildBestiaryView({ save }),
    contracts: buildContractsView({ save, contracts: options?.contracts }),
  });
}
