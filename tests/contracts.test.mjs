import {
  CONTRACT_DAY_KEY_LENGTH,
  CONTRACT_EVENT_SOURCE,
  CONTRACT_OBSERVABLE_OBJECTIVES,
  CONTRACT_TARGETS,
  claimDailyContractReward,
  createDailyContractProgress,
  createDailyClock,
  dayKeyFromInstant,
  generateDailyContracts,
  normalizePersistedDailyContracts,
  observeContractEvent,
  observeContractEvents,
  rollDailyContracts,
} from '../js/contracts.js';
import { DAILY_CONTRACT_LIMIT, DAILY_CONTRACT_SEED, POTION_STACK } from '../js/balance.js';
import { E } from '../js/data.js';
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

console.log('\n== contratos: geração diária determinística ==');
{
  const first = generateDailyContracts(31415, '2026-08-28');
  const repeat = generateDailyContracts(31415, '2026-08-28');
  const changedSeed = generateDailyContracts(27182, '2026-08-28');
  const changedDay = generateDailyContracts(31415, '2026-08-29');
  const targetIds = first.map(contract => contract.objective.targetId);
  const knownIds = new Set(CONTRACT_TARGETS.map(target => target.id));

  check(
    'contratos: mesma seed e chave diária produzem a mesma lista imutável',
    JSON.stringify(first) === JSON.stringify(repeat) &&
      Object.isFrozen(first) &&
      first.every(contract => Object.isFrozen(contract) && Object.isFrozen(contract.objective)),
    JSON.stringify(first)
  );
  check(
    'contratos: seed ou chave diária diferentes alteram a seleção determinística',
    JSON.stringify(first) !== JSON.stringify(changedSeed) &&
      JSON.stringify(first) !== JSON.stringify(changedDay),
    JSON.stringify({ first, changedSeed, changedDay })
  );
  check(
    'contratos: nunca excedem o teto e cada id e alvo diário é único',
    first.length === Math.min(DAILY_CONTRACT_LIMIT, CONTRACT_TARGETS.length) &&
      new Set(first.map(contract => contract.id)).size === first.length &&
      new Set(targetIds).size === targetIds.length,
    JSON.stringify(first)
  );
  check(
    'contratos: todo objetivo vem de monstro disponível e carrega meta e recompensa válidas',
    first.every(
      contract =>
        contract.objective.kind === 'defeat' &&
        knownIds.has(contract.objective.targetId) &&
        Number.isSafeInteger(contract.objective.amount) &&
        contract.objective.amount > 0 &&
        Number.isSafeInteger(contract.reward.gold) &&
        contract.reward.gold > 0 &&
        (contract.reward.potion.kind === 'hp' || contract.reward.potion.kind === 'mp') &&
        Number.isSafeInteger(contract.reward.potion.amount) &&
        contract.reward.potion.amount > 0
    ),
    JSON.stringify(first)
  );
  check(
    'contratos: seed ou chave inválida não fabricam contratos diários',
    generateDailyContracts(NaN, '2026-08-28').length === 0 &&
      generateDailyContracts(31415, '2026-02-30').length === 0 &&
      generateDailyContracts(31415, 'ontem').length === 0,
    'entrada inválida foi aceita'
  );
}

console.log('\n== contratos: resgate idempotente ==');
{
  const day = '2026-08-28';
  // O mesmo catálogo que saneia o save precisa validar o resgate depois de
  // reload; fixtures inventadas aqui esconderiam divergência de recompensa.
  const contracts = generateDailyContracts(DAILY_CONTRACT_SEED, day);
  const firstContract = contracts[0];
  const saved = {
    day,
    progress: { [firstContract.id]: firstContract.objective.amount },
    claimed: [],
  };
  const player = { gold: 40, potions: { hp: POTION_STACK - 1, mp: 3 } };
  const first = claimDailyContractReward({
    contracts,
    dayKey: day,
    saved,
    contractId: firstContract.id,
    player,
  });
  const firstStorage = Save.memoryStorage();
  Save.setStorage(firstStorage);
  const written = Save.writeSave(
    {
      voc: 'knight',
      name: 'Nina',
      level: 1,
      xp: 0,
      gold: first.gold,
      equip: {},
      inv: [],
      potions: first.potions,
      contracts: first.state,
    },
    1
  );
  // Outra instância do storage representa a aba depois da recarga: a segunda
  // tentativa só pode consultar o estado que realmente foi serializado.
  const reloadedStorage = Save.memoryStorage({
    'sf-save-knight': firstStorage.getItem('sf-save-knight'),
  });
  Save.setStorage(reloadedStorage);
  const persisted = Save.loadSave('knight');
  const afterReload = claimDailyContractReward({
    contracts,
    dayKey: day,
    saved: persisted?.contracts,
    contractId: firstContract.id,
    player: persisted,
  });
  const incomplete = claimDailyContractReward({
    contracts,
    dayKey: day,
    saved: {
      day,
      progress: { [firstContract.id]: firstContract.objective.amount - 1 },
      claimed: [],
    },
    contractId: firstContract.id,
    player,
  });
  const capped = claimDailyContractReward({
    contracts,
    dayKey: day,
    saved,
    contractId: firstContract.id,
    player: { gold: Number.MAX_SAFE_INTEGER, potions: { hp: POTION_STACK, mp: 0 } },
  });

  check(
    'contratos: conclusão concede ouro e consumível, marca o id e respeita a pilha',
    first.granted &&
      first.gold === 40 + firstContract.reward.gold &&
      first.potions.hp === POTION_STACK &&
      first.potions.mp === 3 &&
      JSON.stringify(first.state.claimed) === JSON.stringify([firstContract.id]) &&
      Object.isFrozen(first.state) &&
      Object.isFrozen(first.potions),
    JSON.stringify(first)
  );
  check(
    'contratos: resgate incompleto ou repetido após reload não concede novamente',
    written &&
      !incomplete.granted &&
      !afterReload.granted &&
      afterReload.gold === first.gold &&
      JSON.stringify(afterReload.potions) === JSON.stringify(first.potions) &&
      JSON.stringify(afterReload.state) === JSON.stringify(first.state),
    JSON.stringify({ incomplete, afterReload })
  );
  check(
    'contratos: resgate hostil preserva inteiros seguros e os dois tetos de recompensa',
    capped.granted && capped.gold === Number.MAX_SAFE_INTEGER && capped.potions.hp === POTION_STACK,
    JSON.stringify(capped)
  );
}

console.log('\n== contratos: projeção persistida ==');
{
  const day = '2026-08-28';
  const [firstContract, secondContract] = generateDailyContracts(DAILY_CONTRACT_SEED, day);
  const state = normalizePersistedDailyContracts({
    day,
    progress: {
      [firstContract.id]: firstContract.objective.amount + 100,
      [secondContract.id]: secondContract.objective.amount - 1,
      daily_4: 100,
    },
    claimed: [secondContract.id, firstContract.id, 'daily_4'],
  });
  check(
    'contratos: save diário só retém ids, metas e resgate possíveis da recompensa determinística',
    Object.isFrozen(state) &&
      JSON.stringify(state) ===
        JSON.stringify({
          day,
          progress: {
            [firstContract.id]: firstContract.objective.amount,
            [secondContract.id]: secondContract.objective.amount - 1,
          },
          claimed: [firstContract.id],
        }),
    JSON.stringify(state)
  );
  check(
    'contratos: calendário impossível não deixa progresso ou resgate sobreviver',
    JSON.stringify(
      normalizePersistedDailyContracts({
        day: '2026-02-30',
        progress: { [firstContract.id]: firstContract.objective.amount },
        claimed: [firstContract.id],
      })
    ) === JSON.stringify({ day: '', progress: {}, claimed: [] })
  );
}

console.log('\n== contratos: relógio diário UTC ==');
{
  const before = Date.UTC(2026, 7, 28, 23, 59, 59, 999);
  const after = Date.UTC(2026, 7, 29, 0, 0, 0, 0);
  check(
    'contratos: a chave UTC só vira no primeiro instante do novo dia',
    dayKeyFromInstant(before) === '2026-08-28' && dayKeyFromInstant(after) === '2026-08-29',
    JSON.stringify({ before: dayKeyFromInstant(before), after: dayKeyFromInstant(after) })
  );
  check(
    'contratos: janeiro e ano novo preservam calendário UTC com zeros',
    dayKeyFromInstant(Date.UTC(2026, 0, 1, 0, 0, 0)) === '2026-01-01' &&
      dayKeyFromInstant(Date.UTC(2025, 11, 31, 23, 59, 59, 999)) === '2025-12-31' &&
      dayKeyFromInstant(Date.UTC(2026, 0, 1)).length === CONTRACT_DAY_KEY_LENGTH,
    dayKeyFromInstant(Date.UTC(2026, 0, 1))
  );
}

console.log('\n== contratos: fuso não participa do contrato ==');
{
  const instant = Date.UTC(2026, 7, 29, 1, 30, 0);
  const representations = [
    instant,
    new Date('2026-08-28T22:30:00-03:00'),
    new Date('2026-08-29T10:30:00+09:00'),
  ];
  check(
    'contratos: o mesmo instante ganha a mesma chave apesar de offsets locais opostos',
    representations.every(value => dayKeyFromInstant(value) === '2026-08-29'),
    JSON.stringify(representations.map(dayKeyFromInstant))
  );
}

console.log('\n== contratos: injeção e entrada hostil ==');
{
  let instant = Date.UTC(2026, 1, 28, 23, 59, 59, 999);
  const clock = createDailyClock({ now: () => instant });
  const before = clock.dayKey();
  instant = Date.UTC(2026, 2, 1, 0, 0, 0);
  const after = clock.dayKey();
  check(
    'contratos: relógio injetável permite provar a virada sem relógio do processo',
    before === '2026-02-28' && after === '2026-03-01' && Object.isFrozen(clock),
    JSON.stringify({ before, after })
  );
  check(
    'contratos: instantes inválidos e fonte defeituosa nunca inventam uma chave diária',
    [NaN, Infinity, -Infinity, null, '2026-08-29', new Date('inválido')].every(
      value => dayKeyFromInstant(value) === ''
    ) &&
      createDailyClock({ now: null }).dayKey() === '' &&
      createDailyClock({
        now() {
          throw new Error('relógio indisponível');
        },
      }).dayKey() === '',
    'entrada inválida foi aceita'
  );
}

console.log('\n== contratos: objetivos observáveis ==');
{
  const knownObjectiveIds = new Set(CONTRACT_OBSERVABLE_OBJECTIVES.map(objective => objective.id));
  const knownTargetIds = new Set(CONTRACT_TARGETS.map(target => target.id));
  check(
    'contratos: catálogo inicial só descreve derrotas que a simulação pode observar',
    CONTRACT_OBSERVABLE_OBJECTIVES.length === CONTRACT_TARGETS.length &&
      CONTRACT_OBSERVABLE_OBJECTIVES.every(
        objective =>
          knownTargetIds.has(objective.targetId) &&
          objective.id === `defeat:${objective.targetId}` &&
          objective.kind === 'defeat' &&
          objective.event.t === 'fx' &&
          objective.event.k === 'death' &&
          Object.isFrozen(objective) &&
          Object.isFrozen(objective.event)
      ),
    JSON.stringify(CONTRACT_OBSERVABLE_OBJECTIVES)
  );

  const game = createGame(4601, 1);
  const player = addPlayer(game, { id: 'p1', name: 'Nina', voc: 'knight' });
  const monster = game.monsters.find(entry => !entry.isBoss && knownTargetIds.has(entry.typeId));
  game.events.length = 0;
  hitMonster(game, monster, monster.hp + monster.def + 100, E.PHYS, player);
  const death = game.events.find(event => event.t === 'fx' && event.k === 'death');
  const observed = observeContractEvent(death, { source: CONTRACT_EVENT_SOURCE.SIMULATION });
  check(
    'contratos: morte já emitida pela simulação projeta objetivo com ids estáveis',
    !!death &&
      death.id === monster.id &&
      death.typeId === monster.typeId &&
      observed?.eventId === `sim:death:${monster.id}` &&
      observed?.objectiveId === `defeat:${monster.typeId}` &&
      knownObjectiveIds.has(observed?.objectiveId) &&
      Object.isFrozen(observed),
    JSON.stringify({ death, observed })
  );

  const replay = observeContractEvents([death, death, { ...death }], {
    source: CONTRACT_EVENT_SOURCE.SIMULATION,
  });
  check(
    'contratos: duplicata e replay do mesmo evento contam no máximo uma vez',
    replay.length === 1 && replay[0].eventId === observed.eventId,
    JSON.stringify(replay)
  );

  const invalid = [
    null,
    {},
    { t: 'loot', id: monster.id, typeId: monster.typeId },
    { t: 'fx', k: 'death', id: 0, typeId: monster.typeId },
    { t: 'fx', k: 'death', id: monster.id, typeId: 'removido' },
  ];
  check(
    'contratos: eventos inválidos, cosméticos ou sem tipo contratável não viram objetivo',
    invalid.every(
      event => observeContractEvent(event, { source: CONTRACT_EVENT_SOURCE.SIMULATION }) === null
    ) && observeContractEvents(invalid, { source: CONTRACT_EVENT_SOURCE.SIMULATION }).length === 0,
    JSON.stringify(invalid)
  );
  check(
    'contratos: evento de rede ou sem proveniência autoritativa nunca é aceito',
    observeContractEvent(death) === null &&
      observeContractEvent(death, { source: 'network' }) === null &&
      observeContractEvents([death], { source: 'network' }).length === 0,
    JSON.stringify(death)
  );
}

console.log('\n== contratos: progresso autoritativo por run ==');
{
  const day = '2026-08-28';
  const contracts = generateDailyContracts(DAILY_CONTRACT_SEED, day);
  const [firstContract, secondContract] = contracts;
  const target = { id: firstContract.objective.targetId };
  const base = {
    day,
    progress: {
      [firstContract.id]: firstContract.objective.amount - 3,
      [secondContract.id]: secondContract.objective.amount,
    },
    claimed: [secondContract.id],
  };
  const run = createDailyContractProgress({ contracts, dayKey: day, saved: base });
  const first = run.process([
    { t: 'fx', k: 'death', id: 91, typeId: target.id },
    { t: 'fx', k: 'death', id: 91, typeId: target.id },
    { t: 'fx', k: 'death', id: 92, typeId: target.id },
  ]);
  const replay = run.process([
    { t: 'fx', k: 'death', id: 91, typeId: target.id },
    { t: 'fx', k: 'death', id: 92, typeId: target.id },
  ]);
  const nextRun = createDailyContractProgress({ contracts, dayKey: day, saved: replay });
  const acrossRuns = nextRun.process([{ t: 'fx', k: 'death', id: 91, typeId: target.id }]);
  const afterCap = nextRun.process([{ t: 'fx', k: 'death', id: 92, typeId: target.id }]);

  check(
    'contratos: fonte autoritativa avança uma vez por morte, conserva outro slot e preserva resgate',
    first?.day === day &&
      first.progress[firstContract.id] === firstContract.objective.amount - 1 &&
      first.progress[secondContract.id] === secondContract.objective.amount &&
      JSON.stringify(first.claimed) === JSON.stringify([secondContract.id]),
    JSON.stringify(first)
  );
  check(
    'contratos: replay dentro da mesma run não regride nem incrementa novamente',
    JSON.stringify(replay) === JSON.stringify(first),
    JSON.stringify(replay)
  );
  check(
    'contratos: nova run no mesmo dia aceita id reiniciado, mantém monotonia e respeita a meta',
    acrossRuns?.progress[firstContract.id] === firstContract.objective.amount &&
      acrossRuns.progress[secondContract.id] === secondContract.objective.amount &&
      Object.isFrozen(acrossRuns),
    JSON.stringify(acrossRuns)
  );
  check(
    'contratos: mortes autoritativas além da meta não ultrapassam o teto do objetivo',
    afterCap?.progress[firstContract.id] === firstContract.objective.amount,
    JSON.stringify(afterCap)
  );

  const noRollover = createDailyContractProgress({
    contracts,
    dayKey: '2026-08-29',
    saved: acrossRuns,
  });
  check(
    'contratos: dia diferente não reinterpreta o progresso antes da virada explícita',
    noRollover.state() === null,
    JSON.stringify(noRollover.state())
  );

  const persisted = Save.normalizeSave(
    Save.serializeCharacter({
      voc: 'knight',
      name: 'Nina',
      level: 1,
      xp: 0,
      gold: 0,
      equip: {},
      inv: [],
      potions: { hp: 8, mp: 6 },
      contracts: acrossRuns,
    })
  );
  check(
    'contratos: projeção monotônica entra no save sem carregar a guarda efêmera de replay',
    JSON.stringify(persisted?.contracts) === JSON.stringify(acrossRuns),
    JSON.stringify(persisted?.contracts)
  );
}

console.log('\n== contratos: virada diária segura ==');
{
  let instant = Date.UTC(2026, 7, 28, 12, 0, 0);
  const clock = createDailyClock({ now: () => instant });
  const seed = 0;
  const firstDay = rollDailyContracts({
    clock,
    seed,
    saved: { day: '', progress: {}, claimed: [] },
  });
  const completed = {
    day: firstDay.dayKey,
    progress: Object.fromEntries(
      firstDay.contracts.map(contract => [contract.id, contract.objective.amount])
    ),
    claimed: [],
  };
  const rewardPlayer = { gold: 40, potions: { hp: 3, mp: 2 } };
  const claimed = claimDailyContractReward({
    contracts: firstDay.contracts,
    dayKey: firstDay.dayKey,
    saved: completed,
    contractId: firstDay.contracts[0]?.id,
    player: rewardPlayer,
  });
  const storage = Save.memoryStorage();
  Save.setStorage(storage);
  const written = Save.writeSave(
    {
      voc: 'knight',
      name: 'Nina',
      level: 1,
      xp: 0,
      gold: claimed.gold,
      equip: {},
      inv: [],
      potions: claimed.potions,
      contracts: claimed.state,
    },
    1
  );
  const reloaded = Save.loadSave('knight');

  instant = Date.UTC(2026, 7, 29, 0, 0, 0);
  const advanced = rollDailyContracts({ clock, seed, saved: reloaded?.contracts });
  const savedGold = reloaded?.gold;
  const savedPotions = JSON.stringify(reloaded?.potions);

  instant = Date.UTC(2026, 7, 28, 12, 0, 0);
  const returned = rollDailyContracts({ clock, seed, saved: advanced.state });
  const beforeInvalid = JSON.stringify(advanced.state);
  instant = NaN;
  const invalid = rollDailyContracts({ clock, seed, saved: advanced.state });
  const throwing = rollDailyContracts({
    clock: {
      dayKey() {
        throw new Error('sem relógio');
      },
    },
    seed,
    saved: advanced.state,
  });

  check(
    'contratos: avanço UTC troca a lista e zera somente o estado diário após reload',
    written &&
      reloaded?.contracts?.day === '2026-08-28' &&
      claimed.granted &&
      advanced.changed &&
      advanced.dayKey === '2026-08-29' &&
      JSON.stringify(advanced.contracts) ===
        JSON.stringify(generateDailyContracts(seed, '2026-08-29')) &&
      JSON.stringify(advanced.state) ===
        JSON.stringify({ day: '2026-08-29', progress: {}, claimed: [] }),
    JSON.stringify({ claimed, advanced })
  );
  check(
    'contratos: virada não apaga ouro ou poções já incorporados ao save',
    reloaded?.gold === claimed.gold &&
      JSON.stringify(reloaded?.potions) === JSON.stringify(claimed.potions) &&
      reloaded?.gold === savedGold &&
      JSON.stringify(reloaded?.potions) === savedPotions,
    JSON.stringify(reloaded)
  );
  check(
    'contratos: retorno do relógio conserva o dia mais novo e sua lista',
    !returned.changed &&
      returned.dayKey === '2026-08-29' &&
      JSON.stringify(returned.contracts) === JSON.stringify(advanced.contracts) &&
      JSON.stringify(returned.state) === JSON.stringify(advanced.state),
    JSON.stringify(returned)
  );
  check(
    'contratos: relógio inválido não fabrica lista nem altera estado diário',
    invalid.dayKey === '' &&
      invalid.contracts.length === 0 &&
      invalid.state === null &&
      !invalid.changed &&
      throwing.dayKey === '' &&
      throwing.contracts.length === 0 &&
      throwing.state === null &&
      JSON.stringify(advanced.state) === beforeInvalid,
    JSON.stringify({ invalid, throwing, advanced: advanced.state })
  );
}

process.exit(failures ? 1 : 0);
