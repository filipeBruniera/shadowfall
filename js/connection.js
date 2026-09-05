// ============================================================
// ESTADO DE CONEXÃO — projeção pura dos sinais já existentes.
// Não fala com PeerJS nem DOM: main.js adapta open/pong/close/SessionGuard
// para estes sinais quando o indicador visual entrar no P2-04.
// ============================================================

export const ConnectionStatus = Object.freeze({
  CONNECTING: 'connecting',
  STABLE: 'stable',
  UNSTABLE: 'unstable',
  RECONNECTING: 'reconnecting',
});

// Mapa para os pontos reais, sem acrescentar mensagem ao protocolo:
// - OPENING: início de Net.host()/Net.join();
// - OPEN: callback `open` do peer/canal;
// - ACK: `pong` já medido em main.js; P2-02 decide a qualidade;
// - LOST: callback `hostLeft` existente;
// - RETRY/REJOINED: onRetry()/rejoined() do SessionGuard.
import {
  CONNECTION_RECOVERY_ACK_WINDOW,
  CONNECTION_RECOVERY_RTT_MS,
  CONNECTION_UNSTABLE_ACK_WINDOW,
  CONNECTION_UNSTABLE_RTT_MS,
} from './balance.js';

export const ConnectionSignal = Object.freeze({
  OPENING: 'opening',
  OPEN: 'open',
  ACK: 'ack',
  LOST: 'lost',
  RETRY: 'retry',
  REJOINED: 'rejoined',
});

const statuses = new Set(Object.values(ConnectionStatus));

function latencyOf(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const latency = Number(value);
  return Number.isFinite(latency) && latency >= 0 ? Math.round(latency) : fallback;
}

function currentOf(value) {
  return {
    status: statuses.has(value?.status) ? value.status : ConnectionStatus.CONNECTING,
    latencyMs: latencyOf(value?.latencyMs),
    retries: Math.max(0, Math.floor(Number(value?.retries) || 0)),
    slowAcks: Math.max(0, Math.floor(Number(value?.slowAcks) || 0)),
    healthyAcks: Math.max(0, Math.floor(Number(value?.healthyAcks) || 0)),
  };
}

function next(
  status,
  current,
  latencyMs = current.latencyMs,
  retries = current.retries,
  slowAcks = current.slowAcks,
  healthyAcks = current.healthyAcks
) {
  return { status, latencyMs, retries, slowAcks, healthyAcks };
}

export function createConnectionState() {
  return {
    status: ConnectionStatus.CONNECTING,
    latencyMs: null,
    retries: 0,
    slowAcks: 0,
    healthyAcks: 0,
  };
}

function transitionAck(current, latencyMs) {
  if (latencyMs == null || current.status === ConnectionStatus.RECONNECTING) return current;

  if (current.status === ConnectionStatus.UNSTABLE) {
    if (latencyMs <= CONNECTION_RECOVERY_RTT_MS) {
      const healthyAcks = current.healthyAcks + 1;
      return healthyAcks >= CONNECTION_RECOVERY_ACK_WINDOW
        ? next(ConnectionStatus.STABLE, current, latencyMs, current.retries, 0, 0)
        : next(ConnectionStatus.UNSTABLE, current, latencyMs, current.retries, 0, healthyAcks);
    }
    return next(ConnectionStatus.UNSTABLE, current, latencyMs, current.retries, 0, 0);
  }

  // OPEN sempre estabiliza a conexão antes do primeiro ack; só a janela de
  // acks lentos pode degradá-la, para o chip não piscar durante o handshake.
  const slowAcks = latencyMs >= CONNECTION_UNSTABLE_RTT_MS ? current.slowAcks + 1 : 0;
  return slowAcks >= CONNECTION_UNSTABLE_ACK_WINDOW
    ? next(ConnectionStatus.UNSTABLE, current, latencyMs, current.retries, 0, 0)
    : next(current.status, current, latencyMs, current.retries, slowAcks, 0);
}

export function transitionConnection(state, signal) {
  const current = currentOf(state);
  const type = signal?.type;
  const sampleLatency = latencyOf(signal?.latencyMs);

  switch (type) {
    case ConnectionSignal.OPENING:
      // Durante a recuperação, abrir outro Peer ainda é reconectar, não uma sala nova.
      return current.status === ConnectionStatus.RECONNECTING
        ? current
        : next(ConnectionStatus.CONNECTING, current, null, 0, 0, 0);
    case ConnectionSignal.OPEN:
      return next(ConnectionStatus.STABLE, current, null, 0, 0, 0);
    case ConnectionSignal.ACK:
      return transitionAck(current, sampleLatency);
    case ConnectionSignal.LOST:
      return current.status === ConnectionStatus.RECONNECTING
        ? current
        : next(ConnectionStatus.RECONNECTING, current, current.latencyMs, current.retries, 0, 0);
    case ConnectionSignal.RETRY:
      return current.status === ConnectionStatus.RECONNECTING
        ? next(ConnectionStatus.RECONNECTING, current, current.latencyMs, current.retries + 1)
        : current;
    case ConnectionSignal.REJOINED:
      return current.status === ConnectionStatus.RECONNECTING
        ? next(ConnectionStatus.STABLE, current, null, 0, 0, 0)
        : current;
    default:
      return current;
  }
}

// A composição precisa redesenhar somente quando o estado observável mudou.
// Assim, os ticks repetidos do SessionGuard não inundam o leitor de tela, mas
// uma nova tentativa (que incrementa `retries`) continua chegando ao HUD.
function sameConnectionState(a, b) {
  return (
    a.status === b.status &&
    a.latencyMs === b.latencyMs &&
    a.retries === b.retries &&
    a.slowAcks === b.slowAcks &&
    a.healthyAcks === b.healthyAcks
  );
}

export function applyConnectionSignal(state, signal, render = null) {
  const nextState = transitionConnection(state, signal);
  if (!sameConnectionState(state, nextState) && render) render(nextState);
  return nextState;
}
