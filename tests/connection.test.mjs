import {
  applyConnectionSignal,
  ConnectionSignal,
  ConnectionStatus,
  createConnectionState,
  transitionConnection,
} from '../js/connection.js';
import { SessionGuard } from '../js/session.js';
import { readFileSync } from 'node:fs';
import {
  CONNECTION_RECOVERY_ACK_WINDOW,
  CONNECTION_RECOVERY_RTT_MS,
  CONNECTION_UNSTABLE_ACK_WINDOW,
  CONNECTION_UNSTABLE_RTT_MS,
} from '../js/balance.js';
import { connectionIndicatorPresentation } from '../js/ui.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.log(`  FAIL ${label} ${extra}`);
    failures++;
  }
}

console.log('\n== modelo de conexão ==');
{
  const initial = createConnectionState();
  const opening = transitionConnection(initial, { type: ConnectionSignal.OPENING });
  const open = transitionConnection(opening, { type: ConnectionSignal.OPEN });

  check(
    'conexão: abrir sala ou entrar começa conectando e open estabiliza',
    initial.status === ConnectionStatus.CONNECTING &&
      opening.status === ConnectionStatus.CONNECTING &&
      open.status === ConnectionStatus.STABLE
  );
  check(
    'conexão: transição é pura e não altera o estado anterior',
    initial.status === ConnectionStatus.CONNECTING &&
      initial.latencyMs === null &&
      initial.retries === 0 &&
      initial.slowAcks === 0 &&
      initial.healthyAcks === 0
  );
}

console.log('\n== acks de ping com histerese ==');
{
  let stable = transitionConnection(createConnectionState(), { type: ConnectionSignal.OPEN });
  for (let i = 0; i < CONNECTION_UNSTABLE_ACK_WINDOW - 1; i++) {
    stable = transitionConnection(stable, {
      type: ConnectionSignal.ACK,
      latencyMs: CONNECTION_UNSTABLE_RTT_MS,
    });
  }

  check(
    'conexão: janela de acks lentos não degrada antes do último ack',
    stable.status === ConnectionStatus.STABLE &&
      stable.slowAcks === CONNECTION_UNSTABLE_ACK_WINDOW - 1
  );

  const unstable = transitionConnection(stable, {
    type: ConnectionSignal.ACK,
    latencyMs: CONNECTION_UNSTABLE_RTT_MS,
  });
  const belowUnstable = transitionConnection(unstable, {
    type: ConnectionSignal.ACK,
    latencyMs: CONNECTION_UNSTABLE_RTT_MS - 1,
  });

  check(
    'conexão: limiar de degradação é inclusivo e atualiza RTT arredondado',
    unstable.status === ConnectionStatus.UNSTABLE &&
      unstable.latencyMs === CONNECTION_UNSTABLE_RTT_MS
  );
  check(
    'conexão: faixa entre os limiares continua instável até recuperação real',
    belowUnstable.status === ConnectionStatus.UNSTABLE && belowUnstable.healthyAcks === 0
  );

  let recovering = unstable;
  for (let i = 0; i < CONNECTION_RECOVERY_ACK_WINDOW - 1; i++) {
    recovering = transitionConnection(recovering, {
      type: ConnectionSignal.ACK,
      latencyMs: CONNECTION_RECOVERY_RTT_MS,
    });
  }
  const recovered = transitionConnection(recovering, {
    type: ConnectionSignal.ACK,
    latencyMs: CONNECTION_RECOVERY_RTT_MS,
  });

  check(
    'conexão: recuperação também espera janela completa de acks saudáveis',
    recovering.status === ConnectionStatus.UNSTABLE &&
      recovering.healthyAcks === CONNECTION_RECOVERY_ACK_WINDOW - 1
  );
  check(
    'conexão: limiar de recuperação é inclusivo e zera contadores ao estabilizar',
    recovered.status === ConnectionStatus.STABLE &&
      recovered.latencyMs === CONNECTION_RECOVERY_RTT_MS &&
      recovered.slowAcks === 0 &&
      recovered.healthyAcks === 0
  );
}

console.log('\n== sem flapping ==');
{
  let state = transitionConnection(createConnectionState(), { type: ConnectionSignal.OPEN });
  for (let i = 0; i < CONNECTION_UNSTABLE_ACK_WINDOW * 2; i++) {
    state = transitionConnection(state, {
      type: ConnectionSignal.ACK,
      latencyMs: i % 2 ? CONNECTION_UNSTABLE_RTT_MS - 1 : CONNECTION_UNSTABLE_RTT_MS,
    });
  }

  check(
    'conexão: acks alternados perto do limite não acumulam janela lenta',
    state.status === ConnectionStatus.STABLE && state.slowAcks === 0
  );

  for (let i = 0; i < CONNECTION_UNSTABLE_ACK_WINDOW; i++) {
    state = transitionConnection(state, {
      type: ConnectionSignal.ACK,
      latencyMs: CONNECTION_UNSTABLE_RTT_MS,
    });
  }
  state = transitionConnection(state, {
    type: ConnectionSignal.ACK,
    latencyMs: CONNECTION_RECOVERY_RTT_MS,
  });
  state = transitionConnection(state, {
    type: ConnectionSignal.ACK,
    latencyMs: CONNECTION_RECOVERY_RTT_MS + 1,
  });

  check(
    'conexão: um ack fora da faixa saudável reinicia a recuperação',
    state.status === ConnectionStatus.UNSTABLE && state.healthyAcks === 0
  );
}

console.log('\n== queda e reconexão ==');
{
  const stable = transitionConnection(createConnectionState(), { type: ConnectionSignal.OPEN });
  const lost = transitionConnection(stable, { type: ConnectionSignal.LOST });
  const opening = transitionConnection(lost, { type: ConnectionSignal.OPENING });
  const retry = transitionConnection(opening, { type: ConnectionSignal.RETRY });
  const resumed = transitionConnection(retry, { type: ConnectionSignal.REJOINED });
  const retryOutOfBand = transitionConnection(stable, { type: ConnectionSignal.RETRY });

  check(
    'conexão: fechamento do host entra em reconectando e abrir o novo Peer preserva o estado',
    lost.status === ConnectionStatus.RECONNECTING &&
      opening.status === ConnectionStatus.RECONNECTING
  );
  check(
    'conexão: tentativa incrementa apenas enquanto reconecta',
    retry.status === ConnectionStatus.RECONNECTING &&
      retry.retries === 1 &&
      retryOutOfBand.status === ConnectionStatus.STABLE &&
      retryOutOfBand.retries === 0
  );
  check(
    'conexão: reentrada confirmada restaura estável e zera dados antigos da tentativa',
    resumed.status === ConnectionStatus.STABLE &&
      resumed.latencyMs === null &&
      resumed.retries === 0
  );

  const stalePong = transitionConnection(retry, {
    type: ConnectionSignal.ACK,
    latencyMs: 3,
  });
  check(
    'conexão: pong atrasado não interrompe a reconexão',
    stalePong.status === ConnectionStatus.RECONNECTING && stalePong.retries === 1
  );
}

console.log('\n== entradas hostis ==');
{
  const normalized = transitionConnection(
    { status: 'desconhecido', latencyMs: -50, retries: -8 },
    { type: 'sinal-inexistente' }
  );
  const invalidLatency = transitionConnection(createConnectionState(), {
    type: ConnectionSignal.ACK,
    latencyMs: Infinity,
  });

  check(
    'conexão: estado e sinal desconhecidos voltam ao formato canônico',
    JSON.stringify(normalized) === JSON.stringify(createConnectionState())
  );
  check(
    'conexão: RTT inválido não inventa latência nem muda a classificação',
    JSON.stringify(invalidLatency) === JSON.stringify(createConnectionState())
  );
}

console.log('\n== projeção visual do indicador ==');
{
  const connecting = connectionIndicatorPresentation(createConnectionState());
  const stable = connectionIndicatorPresentation({
    status: ConnectionStatus.STABLE,
    latencyMs: 47.6,
  });
  const unstable = connectionIndicatorPresentation({
    status: ConnectionStatus.UNSTABLE,
    latencyMs: 320,
  });
  const reconnecting = connectionIndicatorPresentation({
    status: ConnectionStatus.RECONNECTING,
    latencyMs: 91,
  });
  const hostile = connectionIndicatorPresentation({ status: 'inventado', latencyMs: -1 });

  check(
    'indicador: os quatro estados têm símbolo, título e orientação distintos',
    [connecting, stable, unstable, reconnecting].every(
      view => view.icon && view.title && view.text && view.ariaLabel.includes(view.title)
    ) && new Set([connecting.title, stable.title, unstable.title, reconnecting.title]).size === 4
  );
  check(
    'indicador: latência arredondada só aparece quando a amostra existe',
    connecting.latency === null && stable.latency === '≈ 48 ms' && unstable.latency === '≈ 320 ms'
  );
  check(
    'indicador: reconexão preserva a amostra e orienta a aguardar',
    reconnecting.latency === '≈ 91 ms' && reconnecting.text.includes('Aguarde')
  );
  check(
    'indicador: entrada hostil volta ao estado inicial sem inventar RTT',
    hostile.status === ConnectionStatus.CONNECTING && hostile.latency === null
  );
}

console.log('\n== sinais reais da composição ==');
{
  const renders = [];
  let state = createConnectionState();
  const signal = (type, latencyMs) => {
    state = applyConnectionSignal(state, latencyMs == null ? { type } : { type, latencyMs }, next =>
      renders.push(next)
    );
  };
  const guard = new SessionGuard({
    window: 8,
    retryEvery: 2,
    onRetry: () => signal(ConnectionSignal.RETRY),
    onResumed: () => signal(ConnectionSignal.REJOINED),
  });

  signal(ConnectionSignal.OPENING);
  signal(ConnectionSignal.OPEN);
  signal(ConnectionSignal.ACK, 84);
  signal(ConnectionSignal.LOST);
  guard.hostLost();
  guard.tick(2);
  signal(ConnectionSignal.OPENING);
  guard.rejoined();

  check(
    'conexão: abertura, pong, queda, nova tentativa e retorno redesenham cada mudança',
    state.status === ConnectionStatus.STABLE &&
      state.latencyMs === null &&
      state.retries === 0 &&
      renders.length === 5 &&
      JSON.stringify(renders.map(view => [view.status, view.latencyMs, view.retries])) ===
        JSON.stringify([
          [ConnectionStatus.STABLE, null, 0],
          [ConnectionStatus.STABLE, 84, 0],
          [ConnectionStatus.RECONNECTING, 84, 0],
          [ConnectionStatus.RECONNECTING, 84, 1],
          [ConnectionStatus.STABLE, null, 0],
        ]),
    JSON.stringify(renders)
  );
}

{
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const host =
    /btnHost[\s\S]*?signalConnection\(ConnectionSignal\.OPENING\)[\s\S]*?await net\.host\(code\)[\s\S]*?signalConnection\(ConnectionSignal\.OPEN\)/.test(
      main
    );
  const join =
    /btnJoin[\s\S]*?signalConnection\(ConnectionSignal\.OPENING\)[\s\S]*?await net\.join\(code\)[\s\S]*?signalConnection\(ConnectionSignal\.OPEN\)/.test(
      main
    );
  const pong =
    /case 'pong':[\s\S]*?net\.ping\s*=[\s\S]*?signalConnection\(ConnectionSignal\.ACK, net\.ping\)/.test(
      main
    );
  const closed =
    /net\.on\.hostLeft\s*=\s*\(\)\s*=>\s*\{[\s\S]*?signalConnection\(ConnectionSignal\.LOST\)/.test(
      main
    );
  const reconnect =
    /onRetry:[\s\S]*?signalConnection\(ConnectionSignal\.RETRY\)[\s\S]*?onResumed:[\s\S]*?signalConnection\(ConnectionSignal\.REJOINED\)/.test(
      main
    );
  const retryOpen =
    /async function tryRejoin[\s\S]*?net\.close\(\);[\s\S]*?signalConnection\(ConnectionSignal\.OPENING\)[\s\S]*?await net\.join\(code\)[\s\S]*?guard\.rejoined\(\)/.test(
      main
    );

  check(
    'conexão: main usa apenas abertura, pong e callbacks já existentes, sem protocolo paralelo',
    host && join && pong && closed && reconnect && retryOpen,
    JSON.stringify({ host, join, pong, closed, reconnect, retryOpen })
  );
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
