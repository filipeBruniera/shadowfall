// View-model do Refúgio: puro, imutável e sem dependência de browser.
import { generateDailyContracts } from '../js/contracts.js';
import { getBestiaryEntry } from '../js/bestiary.js';
import {
  buildBestiaryView,
  buildCheckpointView,
  buildContractsView,
  buildRefugeView,
} from '../js/refuge.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.log(`  FAIL ${label} ${extra}`);
    failures++;
  }
}

console.log('\n== refúgio: checkpoints apresentados ==');
{
  const save = { floor: 14 };
  const solo = buildCheckpointView({ save });
  const group = buildCheckpointView({
    save,
    players: [{ deepestFloor: 14 }, { deepestFloor: 8 }, { deepestFloor: 11 }],
    requestedCheckpoint: 4,
  });
  const denied = buildCheckpointView({
    save,
    players: [{ deepestFloor: 14 }, { deepestFloor: 8 }, { deepestFloor: 11 }],
    requestedCheckpoint: 10,
  });

  check(
    'refúgio: separa maior andar pessoal, checkpoints pessoais e escolha solo',
    solo.deepestFloor === 14 &&
      solo.personalCheckpoint === 13 &&
      JSON.stringify(solo.personalCheckpoints) === JSON.stringify([1, 4, 7, 10, 13]) &&
      solo.commonCheckpoint === 13 &&
      solo.selectedCheckpoint === 13 &&
      !solo.grouped,
    JSON.stringify(solo)
  );
  check(
    'refúgio: grupo usa somente checkpoints comuns e conserva escolha válida',
    group.grouped &&
      group.groupSize === 3 &&
      JSON.stringify(group.commonCheckpoints) === JSON.stringify([1, 4, 7]) &&
      group.commonCheckpoint === 7 &&
      group.selectedCheckpoint === 4 &&
      denied.selectedCheckpoint === 7,
    JSON.stringify({ group, denied })
  );

  const hostile = buildCheckpointView({
    save: { floor: 'inexistente' },
    players: [],
    requestedCheckpoint: 999,
  });
  check(
    'refúgio: roster ausente ou hostil cai em checkpoint solo seguro',
    !hostile.grouped &&
      hostile.groupSize === 1 &&
      hostile.personalCheckpoint === 1 &&
      hostile.commonCheckpoint === 1 &&
      hostile.selectedCheckpoint === 1,
    JSON.stringify(hostile)
  );
}

console.log('\n== refúgio: bestiário apresentado ==');
{
  const empty = buildBestiaryView({ save: { bestiary: { kills: {} } } });
  const known = buildBestiaryView({ save: { bestiary: { kills: { rat: 25 } } } });
  const ratEmpty = empty.entries.find(entry => entry.id === 'rat');
  const ratKnown = known.entries.find(entry => entry.id === 'rat');
  const rat = getBestiaryEntry('rat');

  check(
    'refúgio: estado vazio mantém catálogo ordenado sem vazar criatura não descoberta',
    empty.empty &&
      empty.discovered === 0 &&
      empty.emptyMessage === 'Nenhuma criatura registrada.' &&
      ratEmpty?.name === 'Criatura desconhecida' &&
      ratEmpty.kind === 'Tipo desconhecido' &&
      ratEmpty.tier === 0 &&
      !JSON.stringify(ratEmpty).includes('Rat'),
    JSON.stringify(ratEmpty)
  );
  check(
    'refúgio: tier e revelações do tipo conhecido vêm exclusivamente do domínio',
    !known.empty &&
      known.discovered === 1 &&
      ratKnown?.name === rat?.name &&
      ratKnown.kind === 'Monstro' &&
      ratKnown.kills === 25 &&
      ratKnown.tier === 2 &&
      ratKnown.tierLabel === 'Estudado' &&
      !!ratKnown.revelations.affinities &&
      !ratKnown.revelations.attributes,
    JSON.stringify(ratKnown)
  );
  const hostile = buildBestiaryView({
    save: { bestiary: { kills: { rat: -99, removido: 100, constructor: 100 } } },
  });
  const hostileRat = hostile.entries.find(entry => entry.id === 'rat');
  check(
    'refúgio: tipo removido e contagem hostil continuam desconhecidos sem mutar a projeção',
    hostile.empty &&
      hostileRat?.unknown &&
      hostileRat.kills === 0 &&
      hostileRat.name === 'Criatura desconhecida' &&
      Object.isFrozen(hostile) &&
      Object.isFrozen(hostileRat) &&
      !JSON.stringify(hostile).includes('Rat'),
    JSON.stringify(hostileRat)
  );
}

console.log('\n== refúgio: contratos apresentados ==');
{
  const day = '2026-08-28';
  const contracts = generateDailyContracts(0, day);
  const first = contracts[0];
  const active = buildContractsView({
    save: { contracts: { day, progress: { [first.id]: first.objective.amount - 1 }, claimed: [] } },
    contracts,
  });
  const ready = buildContractsView({
    save: { contracts: { day, progress: { [first.id]: first.objective.amount }, claimed: [] } },
    contracts,
  });
  const claimed = buildContractsView({
    save: {
      contracts: { day, progress: { [first.id]: first.objective.amount }, claimed: [first.id] },
    },
    contracts,
  });
  const empty = buildContractsView({ save: { contracts: { day: 'amanhã' } }, contracts });
  const overLimit = buildContractsView({
    save: { contracts: { day, progress: {}, claimed: [] } },
    contracts: [...contracts, contracts[0]],
  });

  check(
    'refúgio: contrato ativo limita progresso e expõe recompensa segura',
    active.day === day &&
      !active.empty &&
      active.entries.length === 3 &&
      active.entries[0].objective.current === first.objective.amount - 1 &&
      active.entries[0].status === 'active' &&
      !active.entries[0].claimable &&
      active.entries[0].reward.gold === first.reward.gold &&
      active.entries[0].reward.potion.label === 'Poção de vida',
    JSON.stringify(active.entries[0])
  );
  check(
    'refúgio: conclusão e resgate mudam apenas a ação apresentada',
    ready.entries[0].status === 'ready' &&
      ready.entries[0].claimable &&
      !ready.entries[0].claimed &&
      claimed.entries[0].status === 'claimed' &&
      !claimed.entries[0].claimable &&
      claimed.entries[0].claimed,
    JSON.stringify({ ready: ready.entries[0], claimed: claimed.entries[0] })
  );
  check(
    'refúgio: estado diário ausente ou inválido tem fallback legível sem contratos',
    empty.empty &&
      empty.entries.length === 0 &&
      empty.emptyMessage === 'Nenhum contrato disponível.',
    JSON.stringify(empty)
  );
  check(
    'refúgio: exposição limita a três slots mesmo se a entrada repetir contratos',
    overLimit.entries.length === 3 &&
      overLimit.entries.every(entry => entry.id && entry.objective.text && entry.reward.gold > 0),
    JSON.stringify(overLimit)
  );
}

console.log('\n== refúgio: fronteira pura ==');
{
  const save = {
    floor: 10,
    bestiary: { kills: { rat: 1 } },
    contracts: { day: '2026-08-28', progress: {}, claimed: [] },
  };
  const before = structuredClone(save);
  const view = buildRefugeView({ save, contracts: generateDailyContracts(0, '2026-08-28') });

  check(
    'refúgio: não muta a entrada e congela todos os ramos de apresentação',
    JSON.stringify(save) === JSON.stringify(before) &&
      Object.isFrozen(view) &&
      Object.isFrozen(view.checkpoint) &&
      Object.isFrozen(view.bestiary.entries) &&
      Object.isFrozen(view.bestiary.entries[0]) &&
      Object.isFrozen(view.contracts.entries) &&
      Object.isFrozen(view.contracts.entries[0].reward.potion),
    JSON.stringify(view)
  );
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
