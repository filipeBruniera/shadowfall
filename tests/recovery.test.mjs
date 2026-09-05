// Perda e reordenação são injetadas fora do DataChannel: em produção ele é
// confiável e ordenado. O roteiro reproduz, de forma determinística, o que um
// replay, uma troca de aba ou uma instrumentação pode entregar ao cliente.
import { ActionQueue } from '../js/actqueue.js';
import { ConfirmedProgress, persistConfirmedProjection } from '../js/confirmedprogress.js';
import { buildSnapshot, drainEvents } from '../js/net.js';
import { addPlayer, createGame, setInput, step, TICK } from '../js/sim.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.log(`  FAIL ${label} ${extra}`);
    failures++;
  }
}

function inventory(player) {
  return JSON.parse(
    JSON.stringify({
      t: 'inv',
      i: player.id,
      iv: player.invVer,
      inv: player.inv,
      equip: player.equip,
      potions: player.potions,
    })
  );
}

console.log('\n== recuperação determinística após perda e reordenação ==');
{
  const game = createGame(2909, 1);
  const guest = addPlayer(game, { id: 'guest', name: 'Convidado', voc: 'druid' });
  guest.hp = 10;
  const queue = new ActionQueue();
  const action = queue.push({ k: 'pot', slot: 'hp' });
  const potionsBefore = guest.potions.hp;

  const inputPacket = () => ({
    mx: 0,
    my: 0,
    // A cópia simula a desserialização: o host não pode depender da referência
    // da fila local para deduplicar o mesmo comando reenviado.
    acts: queue.toSend().map(value => ({ ...value })),
  });
  // O primeiro pacote nunca chega ao host. Dois reenvios idênticos chegam antes
  // do tick seguinte, que é justamente a janela que `lastQueued` fecha.
  const lostInput = inputPacket();
  const resentInput = inputPacket();
  const duplicateInput = inputPacket();
  setInput(game, guest.id, resentInput);
  setInput(game, guest.id, duplicateInput);
  step(game, TICK);
  const actionSnapshot = buildSnapshot(game, { viewer: guest });
  const actionAck = actionSnapshot.P.find(player => player.i === guest.id)?.la;
  queue.confirm(actionAck);

  // Um lote de evento deixa o host uma única vez. O próximo snapshot não tem
  // como reaproveitá-lo porque drainEvents esvazia a mesma fila que main.js usa.
  game.pendingEvents.push({ t: 'log', m: 'P2-09: evento transitório', c: 'system' });
  const eventBatch = step(game, TICK);
  const outboundEvents = [...eventBatch];
  const firstEvents = drainEvents(outboundEvents);
  const laterEvents = drainEvents(outboundEvents);

  const progress = new ConfirmedProgress({ id: guest.id, voc: guest.voc });
  const firstSnapshot = buildSnapshot(game, { viewer: guest });
  const firstInventory = inventory(guest);
  progress.acceptSnapshot(firstSnapshot);
  progress.acceptInventory(firstInventory);

  // A versão 2 se perde inteira. A versão 3 chega com o inventário antes do
  // snapshot e um snapshot antigo reaparece no meio do caminho.
  game.time += 1;
  guest.xp = 20;
  guest.gold = 2;
  guest.inv[0] = { id: 2, name: 'Perdido' };
  guest.invVer++;
  const lostSnapshot = buildSnapshot(game, { viewer: guest });
  const lostInventory = inventory(guest);

  game.time += 1;
  guest.xp = 50;
  guest.gold = 5;
  guest.inv[0] = { id: 3, name: 'Recuperado' };
  guest.invVer++;
  const recoveredSnapshot = buildSnapshot(game, { viewer: guest });
  const recoveredInventory = inventory(guest);

  // v2 ficou fora da entrega. v3 chega primeiro como `inv`, depois chega um
  // snapshot velho, e por fim v3 e sua duplicata: ordem que o canal normal não
  // produz, mas que replay/instrumentação precisa deixar segura.
  const delivered = [
    recoveredInventory,
    firstSnapshot,
    recoveredSnapshot,
    recoveredSnapshot,
    recoveredInventory,
  ];
  const view = { playerMap: new Map(), monsterMap: new Map() };
  // O render pode receber uma imagem velha durante a recuperação, mas a última
  // imagem autoritativa restaura a tela; a confirmação jamais regride.
  const { applySnapshot } = await import('../js/net.js');
  applySnapshot(view, recoveredSnapshot);
  applySnapshot(view, firstSnapshot);
  applySnapshot(view, recoveredSnapshot);

  const acceptedInventory = progress.acceptInventory(delivered[0]);
  const rejectedOldSnapshot = !progress.acceptSnapshot(delivered[1]);
  const acceptedRecovery = progress.acceptSnapshot(delivered[2]);
  const rejectedDuplicate =
    !progress.acceptSnapshot(delivered[3]) && !progress.acceptInventory(delivered[4]);
  const projection = progress.toSaveProjection();
  let writes = 0;
  const firstSave = persistConfirmedProjection(projection, null, () => {
    writes++;
    return true;
  });
  const repeatedSave = persistConfirmedProjection(projection, firstSave.fingerprint, () => {
    writes++;
    return true;
  });

  check(
    'recuperação: reenvio de ação perdida executa uma única poção e confirma a fila',
    lostInput.acts[0]?.id === action.id &&
      resentInput.acts[0]?.id === action.id &&
      duplicateInput.acts[0]?.id === action.id &&
      guest.potions.hp === potionsBefore - 1 &&
      guest.lastQueued === action.id &&
      actionAck === action.id &&
      queue.size === 0,
    `poções ${potionsBefore} -> ${guest.potions.hp}; lastQueued ${guest.lastQueued}; ack ${actionAck}; fila ${queue.size}`
  );
  check(
    'recuperação: evento drenado não reaparece no snapshot posterior',
    firstEvents.filter(event => event.m === 'P2-09: evento transitório').length === 1 &&
      laterEvents.length === 0,
    `${firstEvents.length} no primeiro lote; ${laterEvents.length} no seguinte`
  );
  check(
    'recuperação: perda de v2 e inv v3 adiantado convergem no snapshot v3',
    lostSnapshot.ti < recoveredSnapshot.ti &&
      lostInventory.iv < recoveredInventory.iv &&
      !delivered.includes(lostSnapshot) &&
      !delivered.includes(lostInventory) &&
      acceptedInventory &&
      rejectedOldSnapshot &&
      acceptedRecovery &&
      rejectedDuplicate &&
      projection?.player.xp === 50 &&
      projection.player.gold === 5 &&
      projection.player.inv[0]?.name === 'Recuperado',
    JSON.stringify(projection)
  );
  check(
    'recuperação: a tela termina no snapshot novo após reordenação',
    view.playerMap.get(guest.id)?.xp === 50 && view.playerMap.get(guest.id)?.gold === 5,
    JSON.stringify(view.playerMap.get(guest.id))
  );
  check(
    'recuperação: a confirmação recuperada grava uma vez mesmo se o terminal repetir',
    firstSave.saved && !repeatedSave.saved && writes === 1,
    `gravações ${writes}`
  );
}

process.exit(failures ? 1 : 0);
