// Sala: lotação, tranca, fila e posição de spawn com grupo grande.
import { Room, REFUSE_FULL, REFUSE_LOCKED } from '../js/room.js';
import { MAX_PLAYERS } from '../js/balance.js';
import { createGame, addPlayer, nextFloor, collides } from '../js/sim.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.log(`  FAIL ${label} ${extra}`);
    failures++;
  }
}

const fill = (room, n, from = 0) => {
  for (let i = from; i < from + n; i++) room.admit({ id: 'p' + i, name: 'P' + i, voc: 'knight' });
};

console.log('\n== lotação ==');
{
  const r = new Room();
  r.admit({ id: 'host', name: 'Host', voc: 'knight', isHost: true });
  fill(r, MAX_PLAYERS - 1);
  check('sala: aceita até 10 jogadores', r.count === MAX_PLAYERS, `count ${r.count}`);

  const v = r.admit({ id: 'extra', name: 'Extra', voc: 'druid' });
  check(
    'sala: 11º jogador é recusado por lotação',
    !v.ok && v.reason === REFUSE_FULL,
    JSON.stringify(v)
  );
  check(
    'sala: recusa por lotação não derruba os já conectados',
    r.count === MAX_PLAYERS && r.list().length === MAX_PLAYERS
  );
  check('sala: quem já está dentro nunca é recusado', r.canAccept('p0').ok);

  r.remove('p0');
  check(
    'sala: vaga liberada volta a aceitar',
    r.canAccept('extra').ok && r.count === MAX_PLAYERS - 1
  );
}

console.log('\n== tranca ==');
{
  const r = new Room();
  fill(r, 3);
  r.setLocked(true);
  const v = r.admit({ id: 'novo', name: 'Novo', voc: 'druid' });
  check(
    'tranca: conexão é recusada mesmo com vaga',
    !v.ok && v.reason === REFUSE_LOCKED,
    JSON.stringify(v)
  );
  check('tranca: quem já está dentro continua dentro', r.count === 3);

  r.setLocked(false);
  check(
    'tranca: destrancar volta a aceitar',
    r.admit({ id: 'novo', name: 'Novo', voc: 'druid' }).ok && r.count === 4
  );
}

console.log('\n== ordem do roster ==');
{
  const r = new Room();
  r.admit({ id: 'a', name: 'A', voc: 'knight' });
  r.admit({ id: 'host', name: 'Host', voc: 'druid', isHost: true });
  r.admit({ id: 'b', name: 'B', voc: 'paladin' });
  check('roster: host aparece primeiro', r.list()[0].id === 'host');
  check(
    'roster: os demais seguem a ordem de chegada',
    r.list()[1].id === 'a' && r.list()[2].id === 'b'
  );
}

console.log('\n== spawn com grupo grande ==');
{
  const G = createGame(4242, 1);
  for (let i = 0; i < MAX_PLAYERS; i++) addPlayer(G, { id: 'p' + i, name: 'P' + i, voc: 'knight' });
  const ps = Object.values(G.players);

  check('início: 10 jogadores são instanciados', ps.length === MAX_PLAYERS);
  check(
    'início: nenhum jogador nasce dentro de parede',
    ps.every(p => !collides(G.map, p.x, p.y, 0.32))
  );

  let overlaps = 0;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      if (Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) < 0.5) overlaps++;
    }
  }
  check(
    'início: nenhum jogador nasce sobreposto a outro',
    overlaps === 0,
    `${overlaps} sobreposições`
  );

  nextFloor(G);
  const after = Object.values(G.players);
  let overlaps2 = 0;
  for (let i = 0; i < after.length; i++) {
    for (let j = i + 1; j < after.length; j++) {
      if (Math.hypot(after[i].x - after[j].x, after[i].y - after[j].y) < 0.5) overlaps2++;
    }
  }
  check(
    'andar novo: o grupo também nasce espalhado',
    overlaps2 === 0 && after.every(p => !collides(G.map, p.x, p.y, 0.32)),
    `${overlaps2} sobreposições`
  );
}

console.log('\n== fila de late join ==');
{
  const r = new Room();
  r.admit({ id: 'host', name: 'Host', voc: 'knight', isHost: true });
  r.admit({ id: 'a', name: 'A', voc: 'druid' });
  r.started = true;

  const v = r.admit({ id: 'novo', name: 'Novo', voc: 'paladin' });
  check(
    'late join: conectar em partida vai para a fila, não para o andar',
    v.ok && v.queued === true && r.players.size === 2 && r.queue.length === 1
  );
  check('late join: quem está na fila não conta como jogador em partida', !r.players.has('novo'));
  check('late join: a posição na fila é informada', r.positionOf('novo') === 1);

  r.admit({ id: 'outro', name: 'Outro', voc: 'druid' });
  check('late join: quem chega depois entra atrás', r.positionOf('outro') === 2);
}
{
  const r = new Room();
  r.started = true;
  fill(r, MAX_PLAYERS - 2);
  r.admit({ id: 'f1', name: 'F1', voc: 'knight' });
  r.admit({ id: 'f2', name: 'F2', voc: 'knight' });
  const v = r.admit({ id: 'f3', name: 'F3', voc: 'knight' });
  check(
    'fila: teto de 10 conta jogadores em partida mais fila',
    !v.ok && v.reason === REFUSE_FULL && r.count === MAX_PLAYERS,
    `count ${r.count}`
  );

  r.setLocked(true);
  const r2 = new Room();
  r2.started = true;
  r2.setLocked(true);
  const locked = r2.admit({ id: 'x', name: 'X', voc: 'knight' });
  check(
    'fila: sala trancada recusa a fila pelo motivo de tranca, não por lotação',
    !locked.ok && locked.reason === REFUSE_LOCKED && r2.count === 0,
    JSON.stringify(locked)
  );
}
{
  const r = new Room();
  r.admit({ id: 'host', name: 'Host', voc: 'knight', isHost: true });
  r.started = true;
  r.admit({ id: 'a', name: 'A', voc: 'druid' });
  r.admit({ id: 'b', name: 'B', voc: 'paladin' });
  check(
    'fila: desistir libera a vaga e promove quem estava atrás',
    r.remove('a') && r.positionOf('b') === 1 && r.count === 2
  );
}
{
  const r = new Room();
  r.admit({ id: 'host', name: 'Host', voc: 'knight', isHost: true });
  r.started = true;
  r.admit({ id: 'a', name: 'A', voc: 'druid', save: { level: 3 } });
  r.admit({ id: 'b', name: 'B', voc: 'paladin', save: { level: 7 } });

  const entrando = r.drain();
  check(
    'fila: todos os jogadores em espera entram no novo andar',
    entrando.length === 2 && r.players.size === 3 && r.queue.length === 0
  );
  check(
    'fila: o save de cada um viaja junto para a inserção',
    entrando.find(e => e.id === 'b').save.level === 7
  );
  check('fila: depois de drenar, a fila fica vazia', r.queueList().length === 0);
  check(
    'fila: quem entrou deixa de estar marcado como enfileirado',
    [...r.players.values()].every(p => p.queued === false)
  );
}
{
  // Trocar de vocação na fila troca o save que será aplicado.
  const r = new Room();
  r.started = true;
  r.admit({ id: 'a', name: 'A', voc: 'druid', save: { level: 3 }, level: 3 });
  r.update('a', { voc: 'sorcerer', save: { level: 11 }, level: 11 });
  const e = r.queueList()[0];
  check(
    'fila: trocar de vocação troca o save aplicado na inserção',
    e.voc === 'sorcerer' && e.save.level === 11
  );

  const dentro = r.drain()[0];
  check('fila: a vocação escolhida é a que entra na partida', dentro.voc === 'sorcerer');
}
{
  // A ordem é a do primeiro join aceito. Quando ele sai, quem vinha atrás sobe
  // de posição, mas só entra de fato na virada — nunca no meio do combate.
  const r = new Room({ max: 4 });
  r.admit({ id: 'host', name: 'Host', voc: 'knight', isHost: true });
  r.started = true;
  r.admit({ id: 'a', name: 'A', voc: 'druid' });
  r.admit({ id: 'b', name: 'B', voc: 'paladin' });
  r.admit({ id: 'c', name: 'C', voc: 'sorcerer' });
  check(
    'P2-11: fila conserva FIFO e o teto soma partida mais espera',
    r.count === 4 &&
      r
        .queueList()
        .map(e => e.id)
        .join(',') === 'a,b,c' &&
      r.positionOf('a') === 1 &&
      r.positionOf('c') === 3,
    JSON.stringify(r.queueList().map(e => e.id))
  );
  r.remove('a');
  check(
    'P2-11: saída da frente promove a próxima posição sem inseri-la no andar atual',
    r.positionOf('b') === 1 && r.positionOf('c') === 2 && !r.players.has('b'),
    JSON.stringify({ players: [...r.players.keys()], queue: r.queueList().map(e => e.id) })
  );
  const entering = r.drain();
  check(
    'P2-11: a virada promove o restante na mesma ordem FIFO',
    entering.map(e => e.id).join(',') === 'b,c' &&
      r
        .list()
        .map(e => e.id)
        .join(',') === 'host,b,c' &&
      r.queue.length === 0,
    JSON.stringify({ entering: entering.map(e => e.id), players: r.list().map(e => e.id) })
  );
}
{
  // A expulsão da fila preserva a ordem de quem ficou; o host deve reenviar
  // essa posição imediatamente, sem esperar o close do peer removido.
  const r = new Room();
  r.admit({ id: 'host', name: 'Host', voc: 'knight', isHost: true });
  r.started = true;
  r.admit({ id: 'z', name: 'Z', voc: 'druid' });
  r.admit({ id: 'w', name: 'W', voc: 'paladin' });
  check(
    'P2-12: expulsar da fila remove só o alvo e promove a posição seguinte',
    r.remove('z') && !r.has('z') && r.has('w') && r.positionOf('w') === 1 && r.queue.length === 1,
    JSON.stringify(r.queueList().map(e => e.id))
  );
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
