import { commonCheckpoints, chooseStartFloor, unlockedCheckpoints } from '../js/progression.js';
import { createGame, addPlayer, rollItem, sellJunk } from '../js/sim.js';
import { validateSave } from '../js/validate.js';
import * as Save from '../js/save.js';
import { createGameTelemetry } from '../js/telemetry.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.log(`  FAIL ${label} ${extra}`);
    failures++;
  }
}

console.log('\n== checkpoints ==');
check(
  'checkpoint: cada bloco HARDCORE concluído libera o próximo início',
  JSON.stringify(unlockedCheckpoints(10)) === JSON.stringify([1, 4, 7, 10])
);
const party = [{ deepestFloor: 14 }, { deepestFloor: 8 }, { deepestFloor: 11 }];
check(
  'checkpoint: a interseção usa o progresso do integrante menos avançado',
  JSON.stringify(commonCheckpoints(party)) === JSON.stringify([1, 4, 7])
);
check('checkpoint: o padrão é o maior checkpoint comum', chooseStartFloor(party) === 7);
check(
  'checkpoint: o host pode escolher um checkpoint comum anterior',
  chooseStartFloor(party, 4) === 4
);
check(
  'checkpoint: pedido não desbloqueado volta ao maior comum',
  chooseStartFloor(party, 10) === 7
);

// A sala não herda o checkpoint escolhido de uma composição anterior. Quando
// a pessoa menos avançada volta, ela volta a fechar a interseção — inclusive
// se o host tinha deixado uma escolha manual pronta antes da reconexão.
const divergentParty = [
  { deepestFloor: 10 },
  { deepestFloor: 7 },
  { deepestFloor: 4 },
  { deepestFloor: 1 },
];
check(
  'checkpoint: grupo 1/4/7/10 só tem o primeiro andar em comum',
  JSON.stringify(commonCheckpoints(divergentParty)) === JSON.stringify([1])
);
check(
  'checkpoint: pedido acima da interseção divergente nunca inicia adiante',
  chooseStartFloor(divergentParty, 4) === 1
);
const withoutShallow = divergentParty.slice(0, -1);
check(
  'checkpoint: sem a pessoa de andar 1 o host pode escolher o 4 comum',
  chooseStartFloor(withoutShallow, 4) === 4
);
check(
  'checkpoint: reconexão da pessoa de andar 1 invalida a escolha manual 4',
  chooseStartFloor([...withoutShallow, divergentParty[3]], 4) === 1
);

console.log('\n== progresso preservado ==');
const deepRaw = {
  v: 3,
  voc: 'knight',
  name: 'Veterano',
  totalXp: Save.totalXpFor(18, 25),
  level: 18,
  xp: 25,
  gold: 90,
  floor: 13,
  potions: { hp: 4, mp: 4 },
  items: [],
};
const checked = validateSave(structuredClone(deepRaw), { floor: 1 });
check(
  'progresso: entrar no andar 1 não reduz XP nem maior andar legítimo',
  checked.save.totalXp === deepRaw.totalXp && checked.save.floor === 13,
  `andar ${checked.save.floor}, XP ${checked.save.totalXp}`
);

const storage = Save.memoryStorage();
Save.setStorage(storage);
const G = createGame(404, 13);
const player = addPlayer(G, { id: 'p', name: 'Veterano', voc: 'knight' });
player.level = 18;
player.xp = 25;
Save.writeSave(player, 13);
Save.writeSave(player, 1);
check(
  'progresso: gravar uma run baixa não rebaixa o maior andar persistido',
  Save.loadSave('knight').floor === 13
);

console.log('\n== venda segura ==');
const rarities = ['common', 'rare', 'epic', 'legendary'];
for (let i = 0; i < rarities.length; i++) {
  const item = rollItem(G, 8, true);
  item.rarity = rarities[i];
  player.inv[i] = item;
}
sellJunk(G, player);
check(
  'venda: remove apenas itens comuns e raros',
  player.inv[0] === null && player.inv[1] === null
);
check(
  'venda: preserva épicos e lendários',
  player.inv[2]?.rarity === 'epic' && player.inv[3]?.rarity === 'legendary'
);

console.log('\n== telemetria anônima ==');
const metrics = [];
let clock = 1000;
const telemetry = createGameTelemetry({
  send: (name, value) => metrics.push({ name, value }),
  now: () => clock,
});
telemetry.start({ partySize: 4, checkpoint: 7, name: 'não deve viajar', room: 'ABCD' });
telemetry.floor(9);
telemetry.reconnectFailure();
clock += 25000;
telemetry.finish({ deaths: 2, save: deepRaw });
check(
  'telemetria: registra início, grupo, checkpoint, maior andar, mortes e reconexão',
  [
    'game_run_start',
    'game_party_size',
    'game_checkpoint',
    'game_max_floor',
    'game_deaths',
    'game_reconnect_failure',
    'game_run_end',
  ].every(name => metrics.some(metric => metric.name === name))
);
check(
  'telemetria: todo payload é apenas nome conhecido e valor numérico',
  metrics.every(
    metric => Object.keys(metric).join(',') === 'name,value' && Number.isFinite(metric.value)
  )
);
check('telemetria: finalizar duas vezes é idempotente', telemetry.finish({ deaths: 99 }) === false);

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
