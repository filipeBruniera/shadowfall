// Ciclo da sessão: reconexão, encerramento único, expulsão e limpeza de estado.
import { SessionGuard, LIVE, RECONNECTING, ENDED } from '../js/session.js';
import { Room } from '../js/room.js';
import { createGame, addPlayer, removePlayer } from '../js/sim.js';
import * as Save from '../js/save.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { console.log(`  FAIL ${label} ${extra}`); failures++; }
}

console.log('\n== queda do host ==');
{
  let retries = 0, ended = 0, reconnecting = 0;
  const g = new SessionGuard({
    window: 12, retryEvery: 3,
    onReconnecting: () => { reconnecting++; },
    onRetry: () => { retries++; },
    onEnded: () => { ended++; },
  });

  g.hostLost();
  check('queda: perda momentânea entra em reconexão, não encerra', g.state === RECONNECTING && ended === 0);

  for (let i = 0; i < 5; i++) g.tick(1);
  check('queda: tenta reconectar dentro da janela', retries >= 1 && g.state === RECONNECTING, `retries ${retries}`);
  check('queda: a tela de reconexão é atualizada a cada tick', reconnecting >= 5, `updates ${reconnecting}`);

  for (let i = 0; i < 20; i++) g.tick(1);
  check('queda: esgotado o prazo, a sessão encerra', g.state === ENDED);
  check('queda: esgotado o prazo, a sessão encerra uma única vez', ended === 1, `ended ${ended}`);
}
{
  const g = new SessionGuard({ window: 12 });
  g.hostLost();
  const restarted = g.hostLost();
  check('queda: um segundo aviso não reinicia a janela', restarted === false);

  g.tick(4);
  g.rejoined();
  check('queda: reconectar volta ao estado normal', g.state === LIVE);
  g.tick(60);
  check('queda: depois de reconectar, o tempo não encerra a sessão', g.state === LIVE);
}
{
  let ended = 0;
  const g = new SessionGuard({ onEnded: () => { ended++; } });
  g.endExpected('Partida encerrada', 'O host encerrou a partida.');
  check('saída do host: aviso deliberado encerra sem tentar reconectar', g.state === ENDED && ended === 1);
  g.endExpected('outra', 'coisa');
  check('saída do host: encerrar duas vezes não duplica o aviso', ended === 1);
}

console.log('\n== expulsão ==');
{
  const room = new Room();
  room.admit({ id: 'host', name: 'Host', voc: 'knight', isHost: true });
  room.admit({ id: 'g1', name: 'Marina', voc: 'druid' });
  const G = createGame(7, 1);
  addPlayer(G, { id: 'host', name: 'Host', voc: 'knight' });
  addPlayer(G, { id: 'g1', name: 'Marina', voc: 'druid' });

  room.remove('g1');
  removePlayer(G, 'g1');
  check('expulsão: peer removido sai da simulação e da lista',
    !room.has('g1') && !G.players.g1 && room.count === 1);
  check('expulsão: os demais continuam na partida', !!G.players.host && room.has('host'));

  // O host nunca é alvo: a interface não oferece a ação para a própria linha.
  const kickable = room.list().filter((p) => !p.isHost).map((p) => p.id);
  check('expulsão: host não pode expulsar a si mesmo', !kickable.includes('host'));
}
{
  const st = Save.memoryStorage();
  Save.setStorage(st); Save.resetWarnings();
  const saved = Save.writeSave({
    voc: 'druid', name: 'Marina', level: 9, xp: 900, gold: 77,
    equip: {}, inv: [], potions: { hp: 3, mp: 2 },
  }, 5);
  check('expulsão: progresso do expulso é gravado antes da saída',
    saved === true && JSON.parse(st.getItem('sf-save-druid')).level === 9);
  check('queda: progresso do convidado é gravado antes de encerrar',
    Save.loadSave('druid').gold === 77);
}

console.log('\n== limpeza de sessão ==');
{
  // Encerrar e entrar noutra sala não pode vazar estado da anterior.
  const room = new Room();
  room.admit({ id: 'host', name: 'A', voc: 'knight', isHost: true });
  room.admit({ id: 'g1', name: 'B', voc: 'druid' });
  room.setLocked(true);
  room.started = true;

  const novo = new Room();
  check('sessão: sala nova nasce vazia, destrancada e não iniciada',
    novo.count === 0 && !novo.locked && !novo.started && novo.list().length === 0);

  const g = new SessionGuard();
  g.hostLost(); g.tick(1); g.reset();
  check('sessão: o guardião volta a live depois do reset', g.state === LIVE);
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
