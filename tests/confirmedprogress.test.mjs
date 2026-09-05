// O último checkpoint do convidado precisa nascer só de mensagens do host.
import { ConfirmedProgress, persistConfirmedProjection } from '../js/confirmedprogress.js';
import * as Save from '../js/save.js';
import { readFileSync } from 'node:fs';
import { buildSnapshot } from '../js/net.js';
import { addPlayer, createGame } from '../js/sim.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.log(`  FAIL ${label} ${extra}`);
    failures++;
  }
}

function snapshot({
  time = 1,
  floor = 1,
  iv = 1,
  xp = 0,
  gold = 0,
  id = 'guest',
  voc = 'knight',
} = {}) {
  return {
    t: 's',
    ti: time,
    fl: floor,
    P: [{ i: id, n: 'Convidado', v: voc, l: 3, xp, g: gold, iv }],
  };
}

function inventory({ iv = 1, id = 'guest', item = 'Espada', hp = 7, mp = 5 } = {}) {
  return {
    t: 'inv',
    i: id,
    iv,
    inv: [{ id: iv, name: item }],
    equip: { weapon: null },
    potions: { hp, mp },
  };
}

console.log('\n== progresso confirmado do convidado ==');
{
  const game = createGame(616, 3);
  const guest = addPlayer(game, { id: 'guest', name: 'Convidado', voc: 'knight' });
  guest.invVer = 9;
  const wire = buildSnapshot(game, { viewer: guest });
  check(
    'confirmado: o snapshot transporta a versão autoritativa do inventário',
    wire.P.find(player => player.i === 'guest')?.iv === 9
  );
}
{
  const progress = new ConfirmedProgress({ id: 'guest', voc: 'knight' });
  check(
    'confirmado: snapshot sozinho não vira checkpoint',
    progress.acceptSnapshot(snapshot()) && progress.toSaveProjection() === null
  );
  check(
    'confirmado: inventário de outro dono é recusado',
    !progress.acceptInventory(inventory({ id: 'intruso' })) && progress.toSaveProjection() === null
  );
  check(
    'confirmado: snapshot de outra identidade não entra no modelo',
    !progress.acceptSnapshot(snapshot({ time: 2, id: 'intruso' })) &&
      progress.toSaveProjection() === null
  );
  check(
    'confirmado: versão correspondente compõe XP, andar e inventário do host',
    progress.acceptInventory(inventory()) &&
      JSON.stringify(progress.toSaveProjection()) ===
        JSON.stringify({
          id: 'guest',
          floor: 1,
          order: { snapshotTime: 1, inventoryVersion: 1 },
          player: {
            name: 'Convidado',
            voc: 'knight',
            level: 3,
            xp: 0,
            gold: 0,
            potions: { hp: 7, mp: 5 },
            equip: { weapon: null },
            inv: [{ id: 1, name: 'Espada' }],
          },
        })
  );
}

console.log('\n== confirmação fora de ordem ==');
{
  const progress = new ConfirmedProgress({ id: 'guest', voc: 'knight' });
  progress.acceptSnapshot(snapshot({ time: 20, floor: 4, iv: 4, xp: 400, gold: 40 }));
  progress.acceptInventory(inventory({ iv: 4, item: 'Quarto' }));
  const fourth = progress.toSaveProjection();

  check(
    'ordem: ack duplicado não recompõe nem altera o checkpoint',
    !progress.acceptSnapshot(snapshot({ time: 20, floor: 4, iv: 4, xp: 400, gold: 40 })) &&
      !progress.acceptInventory(inventory({ iv: 4, item: 'Duplicado' })) &&
      JSON.stringify(progress.toSaveProjection()) === JSON.stringify(fourth)
  );
  check(
    'ordem: inv adiantado espera o snapshot correspondente sem misturar versões',
    progress.acceptInventory(inventory({ iv: 5, item: 'Quinto' })) &&
      JSON.stringify(progress.toSaveProjection()) === JSON.stringify(fourth)
  );
  check(
    'ordem: snapshot reordenado fecha somente o ack da versão adiantada',
    progress.acceptSnapshot(snapshot({ time: 21, floor: 5, iv: 5, xp: 500, gold: 50 })) &&
      progress.toSaveProjection().floor === 5 &&
      progress.toSaveProjection().player.xp === 500 &&
      progress.toSaveProjection().player.inv[0].name === 'Quinto'
  );
  const fifth = progress.toSaveProjection();
  check(
    'ordem: ack atrasado não regride confirmação já mais nova',
    !progress.acceptSnapshot(snapshot({ time: 19, floor: 3, iv: 3, xp: 300, gold: 30 })) &&
      !progress.acceptInventory(inventory({ iv: 3, item: 'Terceiro' })) &&
      JSON.stringify(progress.toSaveProjection()) === JSON.stringify(fifth)
  );
}

{
  const progress = new ConfirmedProgress({ id: 'guest', voc: 'knight' });
  progress.acceptSnapshot(snapshot({ time: 10, floor: 4, iv: 1, xp: 81, gold: 12 }));
  progress.acceptInventory(inventory({ iv: 1, item: 'Anel' }));
  const first = progress.toSaveProjection();

  check(
    'confirmado: snapshot novo não mistura inventário de versão anterior',
    progress.acceptSnapshot(snapshot({ time: 11, floor: 5, iv: 2, xp: 120, gold: 18 })) &&
      progress.toSaveProjection().floor === first.floor &&
      progress.toSaveProjection().player.xp === first.player.xp
  );
  check(
    'confirmado: novo inv da mesma versão libera o checkpoint inteiro',
    progress.acceptInventory(inventory({ iv: 2, item: 'Cajado', hp: 4, mp: 9 })) &&
      JSON.stringify(progress.toSaveProjection()) ===
        JSON.stringify({
          id: 'guest',
          floor: 5,
          order: { snapshotTime: 11, inventoryVersion: 2 },
          player: {
            name: 'Convidado',
            voc: 'knight',
            level: 3,
            xp: 120,
            gold: 18,
            potions: { hp: 4, mp: 9 },
            equip: { weapon: null },
            inv: [{ id: 2, name: 'Cajado' }],
          },
        })
  );

  const before = progress.toSaveProjection();
  check(
    'confirmado: duplicados e pacotes antigos não regredem a ordem',
    !progress.acceptInventory(inventory({ iv: 1, item: 'Velho' })) &&
      !progress.acceptSnapshot(snapshot({ time: 10, floor: 1, iv: 1, xp: 1 })) &&
      JSON.stringify(progress.toSaveProjection()) === JSON.stringify(before)
  );
}
{
  const progress = new ConfirmedProgress({ id: 'guest', voc: 'knight' });
  progress.acceptSnapshot(snapshot({ time: 60, floor: 7, iv: 7, xp: 300, gold: 70 }));
  progress.acceptInventory(inventory({ iv: 7, item: 'Sétimo' }));
  const beforeFloorSwap = progress.toSaveProjection();
  // O anúncio `floor` atualiza a tela antes do próximo `s`/`inv`; se a conexão
  // cair nesse intervalo, a única confirmação completa ainda é a do andar 7.
  progress.acceptSnapshot(snapshot({ time: 61, floor: 8, iv: 8, xp: 400, gold: 80 }));
  const duringFloorSwap = progress.toSaveProjection();
  const storage = Save.memoryStorage();
  Save.setStorage(storage);
  Save.resetWarnings();
  const dropped = persistConfirmedProjection(duringFloorSwap, null, (player, floor) =>
    Save.writeSave(player, floor)
  );

  check(
    'queda na troca: timeout grava o último par completo, não o snapshot sem inv novo',
    dropped.saved &&
      JSON.stringify(duringFloorSwap) === JSON.stringify(beforeFloorSwap) &&
      Save.loadSave('knight')?.floor === 7 &&
      Save.loadSave('knight')?.xp === 300
  );

  progress.acceptInventory(inventory({ iv: 8, item: 'Oitavo' }));
  const newer = persistConfirmedProjection(
    progress.toSaveProjection(),
    dropped.fingerprint,
    (player, floor) => Save.writeSave(player, floor)
  );
  const late = persistConfirmedProjection(beforeFloorSwap, newer.fingerprint, (player, floor) =>
    Save.writeSave(player, floor)
  );
  const loaded = Save.loadSave('knight');
  check(
    'queda na troca: confirmação atrasada nunca regride save terminal mais novo',
    newer.saved && !late.saved && loaded?.floor === 8 && loaded?.xp === 400 && loaded?.gold === 80
  );
}

{
  const progress = new ConfirmedProgress({ id: 'guest', voc: 'knight' });
  const confirmedInventory = inventory({ item: 'Confirmado' });
  progress.acceptSnapshot(snapshot({ time: 2, floor: 2, iv: 1, xp: 30 }));
  progress.acceptInventory(confirmedInventory);
  confirmedInventory.inv[0].name = 'Especulativo';
  const projection = progress.toSaveProjection();
  projection.player.inv[0].name = 'Mutado fora';

  check(
    'confirmado: projeção é serializável e isolada de estado especulativo local',
    JSON.stringify(progress.toSaveProjection()) ===
      JSON.stringify({
        id: 'guest',
        floor: 2,
        order: { snapshotTime: 2, inventoryVersion: 1 },
        player: {
          name: 'Convidado',
          voc: 'knight',
          level: 3,
          xp: 30,
          gold: 0,
          potions: { hp: 7, mp: 5 },
          equip: { weapon: null },
          inv: [{ id: 1, name: 'Confirmado' }],
        },
      })
  );
}

console.log('\n== persistência confirmada na queda ==');
{
  const progress = new ConfirmedProgress({ id: 'guest', voc: 'knight' });
  let writes = 0;
  const result = persistConfirmedProjection(progress.toSaveProjection(), null, () => {
    writes++;
    return true;
  });
  check(
    'queda: sem checkpoint confirmado não tenta gravar',
    !result.saved && result.fingerprint === null && writes === 0
  );
}
{
  const progress = new ConfirmedProgress({ id: 'guest', voc: 'knight' });
  progress.acceptSnapshot(snapshot({ time: 40, floor: 6, iv: 2, xp: 420, gold: 55 }));
  progress.acceptInventory(inventory({ iv: 2, item: 'Confirmado', hp: 3, mp: 8 }));
  const speculative = {
    name: 'Especulativo',
    xp: 999999,
    gold: 999999,
    inv: [{ id: 99, name: 'Nunca confirmado' }],
  };
  const writes = [];
  const write = (player, floor) => {
    writes.push({ player, floor });
    return true;
  };
  const first = persistConfirmedProjection(progress.toSaveProjection(), null, write);
  const repeated = persistConfirmedProjection(
    progress.toSaveProjection(),
    first.fingerprint,
    write
  );
  check(
    'queda: grava apenas XP, andar e inventário confirmados, nunca a visão especulativa',
    first.saved &&
      writes.length === 1 &&
      writes[0].floor === 6 &&
      writes[0].player.xp === 420 &&
      writes[0].player.gold === 55 &&
      writes[0].player.name !== speculative.name &&
      writes[0].player.xp !== speculative.xp &&
      JSON.stringify(writes[0].player.inv) !== JSON.stringify(speculative.inv)
  );
  check(
    'queda: sinal repetido com a mesma confirmação não regrava nem degrada',
    !repeated.saved && repeated.fingerprint === first.fingerprint && writes.length === 1
  );
}
{
  const progress = new ConfirmedProgress({ id: 'guest', voc: 'knight' });
  progress.acceptSnapshot(snapshot({ time: 50, floor: 7, iv: 3, xp: 2, gold: 70 }));
  progress.acceptInventory({
    t: 'inv',
    i: 'guest',
    iv: 3,
    inv: [],
    equip: {},
    potions: { hp: 4, mp: 2 },
  });
  const storage = Save.memoryStorage();
  Save.setStorage(storage);
  Save.resetWarnings();
  const result = persistConfirmedProjection(progress.toSaveProjection(), null, (player, floor) =>
    Save.writeSave(player, floor)
  );
  const loaded = Save.loadSave('knight');
  check(
    'queda: a projeção confirmada usa o schema de save existente',
    result.saved &&
      loaded?.floor === 7 &&
      loaded.level === 3 &&
      loaded.xp === 2 &&
      loaded.gold === 70 &&
      loaded.potions.hp === 4 &&
      loaded.potions.mp === 2
  );
}
{
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const onEnded = main.slice(main.indexOf('onEnded:'), main.indexOf('async function tryRejoin'));
  check(
    'queda: timeout do guard usa o caminho confirmado, não saveGuestProgress',
    /S\.role\s*===\s*'guest'\s*\?\s*saveConfirmedGuestProgress\(\)\s*:\s*saveProgress\(\)/.test(
      onEnded
    ) && !/saveGuestProgress\(\)/.test(onEnded)
  );
}

process.exit(failures ? 1 : 0);
