// ============================================================
// CONTRATOS DIÁRIOS — regras puras entre runs.
// ============================================================

import {
  CONTRACT_DEFEAT_TARGETS_BY_TIER,
  CONTRACT_REWARD_GOLD_RANGE,
  DAILY_CONTRACT_SEED,
  CONTRACT_REWARD_POTION,
  DAILY_CONTRACT_LIMIT,
  POTION_STACK,
} from './balance.js';
import { MONSTERS } from './data.js';
import { makeRng } from './rng.js';

export const CONTRACT_DAY_KEY_LENGTH = 10;

function epochMilliseconds(instant) {
  if (instant instanceof Date) return instant.getTime();
  return typeof instant === 'number' && Number.isFinite(instant) ? instant : NaN;
}

// A data do contrato é sempre o calendário UTC. Assim duas máquinas na mesma
// sala não discordam na virada do dia só porque o navegador usa outro fuso.
export function dayKeyFromInstant(instant) {
  const epoch = epochMilliseconds(instant);
  if (!Number.isFinite(epoch)) return '';

  const date = new Date(epoch);
  if (!Number.isFinite(date.getTime())) return '';

  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

// A leitura vem de fora para que a virada diária seja reprodutível em testes e
// possa depois ser compartilhada pelo fluxo autoritativo, sem estado global.
export function createDailyClock({ now = () => Date.now() } = {}) {
  const readNow = typeof now === 'function' ? now : () => NaN;
  return Object.freeze({
    dayKey() {
      try {
        return dayKeyFromInstant(readNow());
      } catch {
        return '';
      }
    },
  });
}

function isDailyKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dayKeyFromInstant(Date.parse(`${value}T00:00:00.000Z`)) === value;
}

function freezeEntry(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) freezeEntry(child);
  }
  return Object.freeze(value);
}

// O catálogo é derivado só dos monstros que `populate()` pode gerar. Ordenar
// por id impede que uma alteração incidental na ordem da tabela de conteúdo
// troque os contratos de quem já usa a mesma seed e chave diária.
export const CONTRACT_TARGETS = Object.freeze(
  MONSTERS.filter(
    monster => typeof monster.id === 'string' && monster.id && Number.isInteger(monster.tier)
  )
    .map(monster =>
      freezeEntry({
        id: monster.id,
        name: monster.name,
        tier: monster.tier,
      })
    )
    .sort((left, right) => left.id.localeCompare(right.id, 'en'))
    .filter((target, index, targets) => index === 0 || target.id !== targets[index - 1].id)
);

// O catálogo inicial não inventa telemetria de combate: cada objetivo aponta
// para o único evento que a simulação já produz ao confirmar uma derrota. A
// chave semântica sobrevive a replay de snapshots, enquanto o id da entidade
// separa duas mortes legítimas do mesmo tipo na mesma run.
export const CONTRACT_EVENT_SOURCE = Object.freeze({
  SIMULATION: 'simulation',
});

export const CONTRACT_OBSERVABLE_OBJECTIVES = Object.freeze(
  CONTRACT_TARGETS.map(target =>
    freezeEntry({
      id: `defeat:${target.id}`,
      kind: 'defeat',
      targetId: target.id,
      event: { t: 'fx', k: 'death' },
    })
  )
);

const CONTRACT_OBSERVABLE_BY_TARGET_ID = Object.freeze(
  Object.fromEntries(
    CONTRACT_OBSERVABLE_OBJECTIVES.map(objective => [objective.targetId, objective])
  )
);

const EMPTY_CONTRACT_OBSERVATIONS = Object.freeze([]);

// Esta borda recebe somente eventos drenados diretamente da simulação do host.
// Mensagens de rede e efeitos de apresentação podem ter a mesma forma visual,
// mas não podem conceder progresso quando a P3C-04 consumir esta projeção.
export function observeContractEvent(event, { source } = {}) {
  if (source !== CONTRACT_EVENT_SOURCE.SIMULATION) return null;
  if (!event || event.t !== 'fx' || event.k !== 'death') return null;
  if (!Number.isSafeInteger(event.id) || event.id < 1) return null;

  const objective = CONTRACT_OBSERVABLE_BY_TARGET_ID[event.typeId];
  if (!objective) return null;

  return freezeEntry({
    eventId: `sim:death:${event.id}`,
    objectiveId: objective.id,
    kind: objective.kind,
    targetId: objective.targetId,
  });
}

// A deduplicação fica nesta função pura para que um mesmo lote, inclusive um
// replay de snapshot, não produza duas observações. O estado diário e a guarda
// entre lotes pertencem à P3C-04, não a este catálogo.
export function observeContractEvents(events, options) {
  if (!Array.isArray(events) || events.length === 0) return EMPTY_CONTRACT_OBSERVATIONS;

  const observations = [];
  const seenEventIds = new Set();
  for (const event of events) {
    const observation = observeContractEvent(event, options);
    if (!observation || seenEventIds.has(observation.eventId)) continue;
    seenEventIds.add(observation.eventId);
    observations.push(observation);
  }
  return Object.freeze(observations);
}

function dailyContractMap(contracts) {
  if (!Array.isArray(contracts) || contracts.length > DAILY_CONTRACT_LIMIT) return null;

  const byTarget = new Map();
  const byId = new Map();
  for (const contract of contracts) {
    const id = contract?.id;
    const objective = contract?.objective;
    if (
      typeof id !== 'string' ||
      !id ||
      !objective ||
      objective.kind !== 'defeat' ||
      typeof objective.targetId !== 'string' ||
      !objective.targetId ||
      !Number.isSafeInteger(objective.amount) ||
      objective.amount < 1 ||
      byId.has(id) ||
      byTarget.has(objective.targetId)
    )
      return null;
    byId.set(id, contract);
    byTarget.set(objective.targetId, contract);
  }
  return { byId, byTarget };
}

function countAtMost(value, maximum) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : 0;
}

function copyClaimed(value, contractMap = null) {
  if (!Array.isArray(value)) return [];
  const claimed = [];
  for (const id of value) {
    if (
      typeof id !== 'string' ||
      !id ||
      claimed.includes(id) ||
      (contractMap && !contractMap.byId.has(id))
    )
      continue;
    claimed.push(id);
    if (claimed.length >= DAILY_CONTRACT_LIMIT) break;
  }
  return claimed;
}

function freezeContractState(value) {
  return freezeEntry({
    day: value.day,
    progress: { ...value.progress },
    claimed: value.claimed.slice(),
  });
}

// O save contém só a projeção compacta, não a lista diária. Esta ativação
// aceita a primeira execução de um dia vazio, mas não troca uma chave diferente:
// a virada explícita pertence à P3C-06 e não pode apagar/reinterpretar um
// progresso ainda resgatável durante uma execução atrasada.
function projectDailyState(saved, dayKey, contractMap) {
  if (!isDailyKey(dayKey) || !contractMap) return null;
  const savedDay = typeof saved?.day === 'string' ? saved.day : '';
  if (savedDay && savedDay !== dayKey) return null;

  const progress = {};
  const rawProgress = saved?.progress;
  for (const [id, contract] of contractMap.byId) {
    const count = countAtMost(rawProgress?.[id], contract.objective.amount);
    if (count) progress[id] = count;
  }
  return freezeContractState({
    day: dayKey,
    progress,
    // Uma vez que a lista está presente, só ids dela podem bloquear um novo
    // resgate. O filtro não altera o save por conta própria; só protege a
    // projeção autoritativa contra ids antigos ou hostis.
    claimed: copyClaimed(saved?.claimed, contractMap),
  });
}

// A lista é recriada a partir da chave persistida, portanto o save nunca é
// autoridade para ids, metas ou recompensas. Esta fronteira compacta também
// descarta um resgate que não poderia ter sido concedido: sem a meta completa,
// manter `claimed` permitiria tanto bloquear um prêmio legítimo quanto fingir
// que uma recompensa já foi aplicada.
export function normalizePersistedDailyContracts(saved) {
  const day = typeof saved?.day === 'string' ? saved.day : '';
  if (!isDailyKey(day)) return freezeContractState({ day: '', progress: {}, claimed: [] });

  const contracts = generateDailyContracts(DAILY_CONTRACT_SEED, day);
  const contractMap = dailyContractMap(contracts);
  if (!contractMap) return freezeContractState({ day: '', progress: {}, claimed: [] });
  const progress = {};
  // O normalizador de storage tolera números finitos como os demais
  // contadores de save, mas só consulta os três slots que o dia realmente
  // possui. A projeção de run continua estrita para eventos internos.
  for (const [id, contract] of contractMap.byId) {
    const count = wholeAtMost(saved?.progress?.[id], contract.objective.amount);
    if (count) progress[id] = count;
  }
  const state = projectDailyState({ ...saved, progress }, day, contractMap);
  if (!state) return freezeContractState({ day: '', progress: {}, claimed: [] });

  return freezeContractState({
    day: state.day,
    progress: state.progress,
    claimed: state.claimed.filter(
      id => state.progress[id] === contractMap.byId.get(id).objective.amount
    ),
  });
}

// A lista não mora no save: ela pode ser refeita pela seed e pela chave. Esta
// borda decide qual chave continua ativa antes de uma run. Um relógio atrasado
// jamais apaga o dia já salvo, e um relógio inválido não muda nada. Só uma
// chave UTC posterior limpa progresso/resgates; ouro e poções já concedidos
// pertencem ao jogador e por isso não passam por esta projeção diária.
export function rollDailyContracts({ clock, seed, saved } = {}) {
  let clockDay = '';
  try {
    clockDay = typeof clock?.dayKey === 'function' ? clock.dayKey() : '';
  } catch {
    // Relógio é uma dependência externa; falhar nele nunca autoriza uma troca.
  }
  if (!isDailyKey(clockDay) || !Number.isSafeInteger(seed)) {
    return freezeEntry({ dayKey: '', contracts: [], state: null, changed: false });
  }

  const savedDay = typeof saved?.day === 'string' ? saved.day : '';
  // Um bloco sem dia é o primeiro uso; uma chave malformada fica para a
  // validação de persistência, sem fabricar uma troca que perderia evidência.
  if (savedDay && !isDailyKey(savedDay)) {
    return freezeEntry({ dayKey: '', contracts: [], state: null, changed: false });
  }

  // YYYY-MM-DD preserva a ordem cronológica em comparação léxica. A data salva
  // continua ativa se o sistema voltar no tempo, para não alternar contratos
  // repetidamente por ajustes de relógio ou fuso no dispositivo.
  const nextDay = !savedDay || savedDay < clockDay ? clockDay : savedDay;
  const changed = !!savedDay && savedDay < clockDay;
  const contracts = generateDailyContracts(seed, nextDay);
  const contractMap = dailyContractMap(contracts);
  const state = projectDailyState(changed ? null : saved, nextDay, contractMap);
  return freezeEntry({ dayKey: nextDay, contracts, state, changed });
}

function eventIdSet(value) {
  const out = new Set();
  if (!value || typeof value[Symbol.iterator] !== 'function') return out;
  for (const id of value) if (typeof id === 'string' && id) out.add(id);
  return out;
}

// Processa somente observações originadas na simulação do host. `seenEventIds`
// é deliberadamente efêmero: ids de entidades reiniciam numa run nova, então a
// guarda evita replay dentro da run sem bloquear uma derrota legítima na próxima.
// O estado retornado é sempre uma nova projeção compacta, pronta para `writeSave`.
export function updateDailyContractProgress({
  contracts,
  dayKey,
  saved,
  events,
  seenEventIds,
  source = CONTRACT_EVENT_SOURCE.SIMULATION,
} = {}) {
  const contractMap = dailyContractMap(contracts);
  const state = projectDailyState(saved, dayKey, contractMap);
  const seen = eventIdSet(seenEventIds);
  if (!state) return Object.freeze({ state: null, seenEventIds: Object.freeze([...seen]) });

  const progress = { ...state.progress };
  for (const observation of observeContractEvents(events, { source })) {
    if (seen.has(observation.eventId)) continue;
    seen.add(observation.eventId);
    const contract = contractMap.byTarget.get(observation.targetId);
    if (!contract) continue;
    const current = countAtMost(progress[contract.id], contract.objective.amount);
    if (current < contract.objective.amount) progress[contract.id] = current + 1;
  }

  return Object.freeze({
    state: freezeContractState({ day: state.day, progress, claimed: state.claimed }),
    seenEventIds: Object.freeze([...seen]),
  });
}

// A sessão prende a guarda de replay à run atual e deixa o chamador persistir
// apenas `state`. Ela não olha relógio, rede ou storage; todos entram como
// argumentos verificáveis, conservando a operação reproduzível em Node.
export function createDailyContractProgress(options = {}) {
  let result = updateDailyContractProgress(options);
  return Object.freeze({
    state() {
      return result.state;
    },
    process(events) {
      result = updateDailyContractProgress({
        ...options,
        saved: result.state,
        events,
        seenEventIds: result.seenEventIds,
      });
      return result.state;
    },
  });
}

function wholeAtMost(value, maximum) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maximum, Math.trunc(value)));
}

function rewardProjection(reward) {
  const gold = wholeAtMost(reward?.gold, Number.MAX_SAFE_INTEGER);
  const kind = reward?.potion?.kind;
  const amount = wholeAtMost(reward?.potion?.amount, POTION_STACK);
  if (!gold || (kind !== 'hp' && kind !== 'mp') || !amount) return null;
  return freezeEntry({ gold, potion: { kind, amount } });
}

function potionProjection(potions) {
  return {
    hp: wholeAtMost(potions?.hp, POTION_STACK),
    mp: wholeAtMost(potions?.mp, POTION_STACK),
  };
}

// O resgate não muta o jogador recebido: a camada que já é dona do personagem
// aplica a projeção de volta e a persiste no mesmo passo. Marcar o id antes de
// devolver os saldos torna a mesma chamada inofensiva depois de reload, retry
// ou clique duplicado, sem depender de temporizador, rede ou DOM.
export function claimDailyContractReward({ contracts, dayKey, saved, contractId, player } = {}) {
  const contractMap = dailyContractMap(contracts);
  const state = projectDailyState(saved, dayKey, contractMap);
  const gold = wholeAtMost(player?.gold, Number.MAX_SAFE_INTEGER);
  const potions = potionProjection(player?.potions);
  const denied = Object.freeze({
    granted: false,
    reward: null,
    state,
    gold,
    potions: freezeEntry(potions),
  });
  if (!state || typeof contractId !== 'string' || !contractId) return denied;

  const contract = contractMap.byId.get(contractId);
  const reward = rewardProjection(contract?.reward);
  if (
    !contract ||
    !reward ||
    state.claimed.includes(contractId) ||
    state.progress[contractId] !== contract.objective.amount
  )
    return denied;

  const nextPotions = potionProjection(potions);
  nextPotions[reward.potion.kind] = Math.min(
    POTION_STACK,
    nextPotions[reward.potion.kind] + reward.potion.amount
  );
  const nextState = freezeContractState({
    day: state.day,
    progress: state.progress,
    claimed: [...state.claimed, contractId],
  });
  return Object.freeze({
    granted: true,
    reward,
    state: nextState,
    gold: Math.min(Number.MAX_SAFE_INTEGER, gold + reward.gold),
    potions: freezeEntry(nextPotions),
  });
}

function hashDailySeed(seed, dayKey) {
  let hash = 2166136261;
  for (const char of `${seed >>> 0}:${dayKey}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function objectiveCount(tier) {
  const index = Math.max(0, Math.min(CONTRACT_DEFEAT_TARGETS_BY_TIER.length - 1, tier));
  return CONTRACT_DEFEAT_TARGETS_BY_TIER[index];
}

function rewardGold(rng) {
  const [min, max] = CONTRACT_REWARD_GOLD_RANGE;
  return rng.int(min, max);
}

// P3C-02 escolhe apenas a estrutura estável do contrato. A ligação de
// `defeat` aos eventos autoritativos e a contagem de cada morte entram em
// P3C-03/P3C-04; assim geração não depende de estado de run nem do DOM.
export function generateDailyContracts(seed, dayKey) {
  if (!Number.isSafeInteger(seed) || !isDailyKey(dayKey) || CONTRACT_TARGETS.length === 0)
    return [];

  const rng = makeRng(hashDailySeed(seed, dayKey));
  const available = CONTRACT_TARGETS.slice();
  const count = Math.min(DAILY_CONTRACT_LIMIT, available.length);
  const contracts = [];

  for (let slot = 0; slot < count; slot++) {
    const picked = rng.int(slot, available.length - 1);
    [available[slot], available[picked]] = [available[picked], available[slot]];
    const target = available[slot];
    contracts.push(
      freezeEntry({
        id: `daily_${slot + 1}`,
        objective: {
          kind: 'defeat',
          targetId: target.id,
          targetName: target.name,
          amount: objectiveCount(target.tier),
        },
        reward: {
          gold: rewardGold(rng),
          potion: { ...CONTRACT_REWARD_POTION },
        },
      })
    );
  }

  return Object.freeze(contracts);
}
