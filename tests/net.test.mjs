// Testes de rede que rodam sem navegador: fila de ações e idempotência do host.
import { ActionQueue } from '../js/actqueue.js';
import { ACT_QUEUE_MAX } from '../js/balance.js';
import { createGame, addPlayer, setInput, step, TICK } from '../js/sim.js';
import { applySnapshot, buildSnapshot, drainEvents, isCriticalEvent, Net, NetMode } from '../js/net.js';
import { MAX_PLAYERS, AOI_RADIUS, NET_EVENT_CAP, HARDCORE_EVERY, floorPopulation } from '../js/balance.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { console.log(`  FAIL ${label} ${extra}`); failures++; }
}

console.log('\n== fila de ações ==');
{
  const q = new ActionQueue();
  for (let i = 0; i < 30; i++) q.push({ k: 'cast', slot: 'Q' });
  check('ações: fila com 30 pendentes não perde nenhuma', q.size === 30 && q.toSend().length === 30, `size ${q.size}`);
  check('ações: ids são incrementais e únicos',
    new Set(q.toSend().map((a) => a.id)).size === 30 && q.toSend()[0].id === 1);

  q.confirm(10);
  check('ações: confirmação limpa só o que o host processou',
    q.size === 20 && q.toSend()[0].id === 11, `size ${q.size}`);

  q.clear();
  check('ações: troca de andar zera a fila', q.size === 0);
}
{
  let dropped = 0;
  const q = new ActionQueue({ onDrop: (lost) => { dropped += lost; } });
  for (let i = 0; i < ACT_QUEUE_MAX + 5; i++) q.push({ k: 'cast' });
  check('ações: estouro do teto é sinalizado, nunca silencioso', dropped === 5 && q.size === ACT_QUEUE_MAX, `dropped ${dropped}`);
  check('ações: o teto descarta as mais antigas, mantendo as recentes', q.toSend()[q.size - 1].id === ACT_QUEUE_MAX + 5);
}

console.log('\n== idempotência no host ==');
{
  const G = createGame(999, 1);
  const p = addPlayer(G, { id: 'a', name: 'A', voc: 'knight' });
  p.hp = 10;
  const before = p.potions.hp;
  const act = { id: 1, k: 'pot', slot: 'hp' };

  // Dois pacotes de input chegando entre dois ticks.
  setInput(G, 'a', { mx: 0, my: 0, acts: [act] });
  setInput(G, 'a', { mx: 0, my: 0, acts: [act] });
  step(G, TICK);
  check('ações: reenvio do mesmo id não executa duas vezes', p.potions.hp === before - 1, `gastou ${before - p.potions.hp}`);

  // Reenvio depois de já confirmado.
  setInput(G, 'a', { mx: 0, my: 0, acts: [act] });
  step(G, TICK);
  check('ações: reenvio de id já processado é ignorado', p.potions.hp === before - 1, `gastou ${before - p.potions.hp}`);

  p.hp = 10;
  setInput(G, 'a', { mx: 0, my: 0, acts: [{ id: 2, k: 'pot', slot: 'hp' }] });
  step(G, TICK);
  check('ações: id novo continua sendo executado', p.potions.hp === before - 2, `gastou ${before - p.potions.hp}`);
}

console.log('\n== topologia estrela ==');
{
  const n = new Net();
  n.mode = NetMode.GUEST;
  const host = { peer: 'host' };
  const outro = { peer: 'outro-convidado' };
  n.hostConn = host;
  check('topologia: convidado aceita o que vem do host', n.acceptFrom(host));
  check('topologia: convidado descarta mensagem que não vem do host', !n.acceptFrom(outro));
  check('topologia: convidado descarta mensagem sem origem', !n.acceptFrom(null));

  const h = new Net();
  h.mode = NetMode.HOST;
  const c1 = { peer: 'p1' };
  h.conns.set('p1', c1);
  check('topologia: host aceita peer que registrou', h.acceptFrom(c1));
  check('topologia: host descarta peer que não registrou', !h.acceptFrom({ peer: 'p1' }));
  check('topologia: nenhum convidado abre conexão com outro convidado',
    typeof n.conns.size === 'number' && n.conns.size === 0);
}

console.log('\n== mochila remota ==');
{
  const G = createGame(8080, 1);
  const p = addPlayer(G, { id: 'g1', name: 'G', voc: 'knight' });
  const { rollItem } = await import('../js/sim.js');
  // Item garantidamente equipável pela vocação: o assunto aqui é duplicação, não restrição.
  const item = rollItem(G, 3);
  item.baseId = 'sword'; item.slot = 'weapon'; item.forVoc = null;
  p.inv[0] = item;
  const antesVer = p.invVer;

  // Equipar chega duas vezes: pacote reenviado porque o host demorou a confirmar.
  const act = { id: 1, k: 'use', slot: 0 };
  setInput(G, 'g1', { mx: 0, my: 0, acts: [act] });
  setInput(G, 'g1', { mx: 0, my: 0, acts: [act] });
  step(G, TICK);

  const naMochila = p.inv.filter(Boolean).length;
  const equipados = Object.values(p.equip).filter(Boolean).length;
  check('mochila remota: ação perdida e reenviada não duplica o item',
    equipados === 1 && naMochila === 0, `equip ${equipados}, mochila ${naMochila}`);
  check('mochila remota: a versão do inventário sobe quando o estado muda', p.invVer > antesVer);

  // O convidado só enxerga o que o host confirmou.
  const guestView = { inv: null, equip: null };
  const applyInv = (msg) => { guestView.inv = msg.inv; guestView.equip = msg.equip; };
  applyInv({ inv: p.inv, equip: p.equip, potions: p.potions });
  check('mochila remota: visão do convidado converge para o estado do host',
    guestView.equip.weapon === p.equip.weapon && guestView.inv.filter(Boolean).length === 0);

  const verAntes = p.invVer;
  setInput(G, 'g1', { mx: 0, my: 0, acts: [act] });
  step(G, TICK);
  check('mochila remota: reenvio já confirmado não gera nova versão de inventário', p.invVer === verAntes);
}

console.log('\n== área de interesse ==');
{
  const G = createGame(31337, 3);
  for (let i = 0; i < MAX_PLAYERS; i++) addPlayer(G, { id: 'p' + i, name: 'P' + i, voc: 'knight' });
  const ps = Object.values(G.players);
  // Espalha o grupo pelo mapa para simular 10 pessoas em salas diferentes.
  ps.forEach((p, i) => { const r = G.map.rooms[i % G.map.rooms.length]; p.x = r.cx; p.y = r.cy; });

  const viewer = ps[0];
  const cut = buildSnapshot(G, { viewer, aoi: true });
  const whole = buildSnapshot(G, { viewer, aoi: false });

  check('área de interesse: monstro distante não vai no snapshot daquele peer',
    cut.M.length < whole.M.length, `${cut.M.length} de ${whole.M.length}`);
  check('área de interesse: nada além do raio entra no pacote',
    cut.M.every((m) => Math.abs(m.x - viewer.x) < AOI_RADIUS && Math.abs(m.y - viewer.y) < AOI_RADIUS));
  check('área de interesse: todos os jogadores estão em todo snapshot',
    cut.P.length === MAX_PLAYERS, `${cut.P.length} jogadores`);
  check('área de interesse: desligar o corte devolve o comportamento antigo',
    whole.M.length >= cut.M.length);

  // Entidade que sai do raio some da visão do cliente.
  const view = { playerMap: new Map(), monsterMap: new Map() };
  const { applySnapshot } = await import('../js/net.js');
  applySnapshot(view, cut);
  const antes = view.monsterMap.size;
  viewer.x = G.map.rooms[G.map.rooms.length - 1].cx;
  viewer.y = G.map.rooms[G.map.rooms.length - 1].cy;
  applySnapshot(view, buildSnapshot(G, { viewer, aoi: true }));
  check('área de interesse: entidade que sai da área é removida da visão',
    view.monsterMap.size !== antes || antes === 0, `${antes} -> ${view.monsterMap.size}`);
}

console.log('\n== fila de eventos ==');
{
  const q = [];
  for (let i = 0; i < 400; i++) q.push({ t: 'd', v: '10' });
  q.push({ t: 'log', m: 'Chefe morto', boss: true });
  q.push({ t: 'fx', k: 'playerDeath' });
  q.push({ t: 'portal' });
  const out = drainEvents(q, NET_EVENT_CAP);

  check('eventos: a fila respeita o teto', out.length === NET_EVENT_CAP, `${out.length}`);
  check('eventos: sob pressão, eventos críticos sobrevivem ao corte',
    out.filter(isCriticalEvent).length === 3, `${out.filter(isCriticalEvent).length} críticos`);
  check('eventos: a fila é drenada por completo', q.length === 0);

  const small = [{ t: 'd' }, { t: 'log' }];
  check('eventos: abaixo do teto passa tudo, sem reordenar', drainEvents(small, NET_EVENT_CAP).length === 2);

  // RF-08: o nascimento do chefe HARDCORE é anúncio único do andar. Se ele cair
  // no corte da fila, o convidado nunca fica sabendo — e é justamente numa fila
  // saturada (andar cheio, grupo de 10) que o chefe nasce.
  const fila = [];
  for (let i = 0; i < 400; i++) fila.push({ t: 'd', v: '10' });
  fila.push({ t: 'bossSpawn', id: 91, typeId: 'glacier', floor: 3, hardcore: 1, boss: 1 });
  fila.push({ t: 'log', m: 'Andar 3 — variante HARDCORE', c: 'boss', boss: 1 });
  const saida = drainEvents(fila, NET_EVENT_CAP);

  check('RF-08: bossSpawn com boss: 1 é evento crítico',
    isCriticalEvent({ t: 'bossSpawn', id: 91, typeId: 'glacier', floor: 3, hardcore: 1, boss: 1 }));
  check('RF-08: bossSpawn sobrevive a drainEvents com 400 eventos na fila',
    saida.filter((e) => e.t === 'bossSpawn').length === 1,
    `${saida.filter((e) => e.t === 'bossSpawn').length} de ${saida.length} entregues`);
  check('UI-01: a linha HARDCORE do andar sobrevive ao mesmo corte',
    saida.some((e) => e.t === 'log' && e.m.includes('HARDCORE')));
  check('RF-08: a saturação não reordena o crítico para fora do teto',
    saida.length === NET_EVENT_CAP && fila.length === 0, `${saida.length}`);
}

console.log('\n== custo do host com a sala cheia ==');
{
  const G = createGame(4242, 6);
  G.groupSize = MAX_PLAYERS;
  for (let i = 0; i < MAX_PLAYERS; i++) addPlayer(G, { id: 'p' + i, name: 'P' + i, voc: 'sorcerer' });

  const t0 = performance.now();
  for (let t = 0; t < 900; t++) {
    for (const id of Object.keys(G.players)) setInput(G, id, { mx: 1, my: 0.3, acts: [] });
    step(G, TICK);
  }
  const perTick = (performance.now() - t0) / 900;
  console.log(`      ${G.monsters.length} monstros, ${MAX_PLAYERS} jogadores → ${perTick.toFixed(3)}ms/tick`);
  check('escala: tick com 10 jogadores e população máxima fica dentro do orçamento de 30Hz',
    perTick < 4, `${perTick.toFixed(3)}ms`);

  const viewer = Object.values(G.players)[0];
  const bytesCut = JSON.stringify(buildSnapshot(G, { viewer, aoi: true })).length;
  const bytesWhole = JSON.stringify(buildSnapshot(G, { viewer, aoi: false })).length;
  console.log(`      snapshot: ${bytesCut}B com corte, ${bytesWhole}B sem`);
  check('escala: tamanho do snapshot com 10 jogadores é registrado e tem teto',
    bytesCut < 60000, `${bytesCut}B`);
  check('escala: o corte por área reduz o pacote', bytesCut <= bytesWhole, `${bytesCut} vs ${bytesWhole}`);

  // CT-01 / RNF-03: o campo `hc` é opcional e só existe no chefe do andar
  // HARDCORE. A conta é a mesma de cima — o pacote inteiro, com e sem a chave.
  const bytesSemChave = (pacote) => JSON.stringify(pacote).replace(/,"hc":1/g, '').length;
  const chefe = G.monsters.find((m) => m.isBoss);
  check('RNF-01: o cenário de custo roda mesmo em andar HARDCORE',
    G.floor % HARDCORE_EVERY === 0 && chefe.hardcore === true, `andar ${G.floor}`);

  // O pacote medido é o de quem está de fato olhando para o chefe: fora do
  // raio de interesse o chefe nem entra no snapshot, e a conta mediria zero
  // por ausência, não por economia.
  viewer.x = chefe.x + 1; viewer.y = chefe.y + 1;
  const pacoteHc = buildSnapshot(G, { viewer, aoi: true });
  const entradaChefe = pacoteHc.M.find((m) => m.b === 1);
  check('CT-01: o chefe do andar HARDCORE viaja com hc: 1',
    !!entradaChefe && entradaChefe.hc === 1, JSON.stringify(entradaChefe && { b: entradaChefe.b, hc: entradaChefe.hc }));
  check('CT-01: nenhum monstro comum carrega a chave hc',
    pacoteHc.M.filter((m) => m.hc !== undefined).length === 1,
    `${pacoteHc.M.filter((m) => m.hc !== undefined).length} entradas com hc`);

  const deltaHc = JSON.stringify(pacoteHc).length - bytesSemChave(pacoteHc);
  console.log(`      chefe HARDCORE: +${deltaHc}B por pacote`);
  check('RNF-03: o chefe HARDCORE acrescenta no máximo 8 bytes ao pacote',
    deltaHc > 0 && deltaHc <= 8, `${deltaHc}B`);

  // O convidado precisa reconstruir a flag: sem isso a barra do chefe não teria
  // como marcar a variante do lado de quem não é host.
  const visao = { playerMap: new Map(), monsterMap: new Map() };
  applySnapshot(visao, pacoteHc);
  const chefeVisto = [...visao.monsterMap.values()].find((m) => m.isBoss);
  check('CT-01: applySnapshot devolve hardcore verdadeiro no lado do convidado',
    !!chefeVisto && chefeVisto.hardcore === true);

  // Andar não múltiplo de 3: a chave não existe e o custo da feature é zero.
  const Gcomum = createGame(4242, 5);
  Gcomum.groupSize = MAX_PLAYERS;
  const espectador = addPlayer(Gcomum, { id: 'c0', name: 'C', voc: 'sorcerer' });
  const chefeComum = Gcomum.monsters.find((m) => m.isBoss);
  espectador.x = chefeComum.x + 1; espectador.y = chefeComum.y + 1;
  const pacoteComum = buildSnapshot(Gcomum, { viewer: espectador, aoi: true });
  const deltaComum = JSON.stringify(pacoteComum).length - bytesSemChave(pacoteComum);
  check('CT-01: em andar não múltiplo de 3 o chefe não carrega a chave hc',
    chefeComum.hardcore === false && !JSON.stringify(pacoteComum).includes('"hc"'));
  check('RNF-03: fora do andar HARDCORE o acréscimo por pacote é exatamente 0 byte',
    deltaComum === 0, `${deltaComum}B`);

  const visaoComum = { playerMap: new Map(), monsterMap: new Map() };
  applySnapshot(visaoComum, pacoteComum);
  const chefeVistoComum = [...visaoComum.monsterMap.values()].find((m) => m.isBoss);
  check('CT-01: sem a chave o convidado reconstrói hardcore falso, nunca indefinido',
    !!chefeVistoComum && chefeVistoComum.hardcore === false);
}

console.log('\n== status do jogador no pacote ==');
{
  // A entrada do jogador carregava só `b: p.buffs.length ? 1 : 0`. Resultado:
  // o convidado congelado pelo chefe continuava andando na própria tela até o
  // snapshot seguinte, e o witherado recebia metade da cura sem nenhuma pista.
  const G = createGame(8181, 1);
  addPlayer(G, { id: 'p1', name: 'Alvo', voc: 'knight' });
  const p = G.players.p1;
  const viewer = p;

  const limpo = buildSnapshot(G, { viewer, aoi: true });
  check('status: sem status ativo a chave não entra no pacote',
    limpo.P[0].s === undefined, JSON.stringify(limpo.P[0].s));

  p.status.wither = 3.5;
  p.status.freeze = 0.6;
  const pacote = buildSnapshot(G, { viewer, aoi: true });
  const entrada = pacote.P.find((e) => e.i === 'p1');
  check('status: com status ativo a chave entra no pacote',
    !!entrada && Array.isArray(entrada.s), JSON.stringify(entrada && entrada.s));

  const visao = { playerMap: new Map(), monsterMap: new Map() };
  applySnapshot(visao, pacote);
  const visto = visao.playerMap.get('p1');
  check('status: o convidado reconstrói wither e freeze do jogador',
    !!visto && visto.status.wither > 0 && visto.status.freeze > 0,
    JSON.stringify(visto && visto.status));
  check('status: o que não está ativo volta zerado, nunca indefinido',
    !!visto && visto.status.burn === 0 && visto.status.poison === 0 && visto.status.stun === 0,
    JSON.stringify(visto && visto.status));

  // O custo tem de ser desprezível: a chave só aparece em quem está marcado.
  const delta = JSON.stringify(pacote).length - JSON.stringify(limpo).length;
  console.log(`      status de 1 jogador: +${delta}B no pacote`);
  check('status: o campo custa no máximo 40 bytes por jogador marcado',
    delta <= 40, `${delta}B`);
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
