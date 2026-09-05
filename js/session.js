// ============================================================
// CICLO DA SESSÃO — perder o host não é o mesmo que o host sair.
// Máquina de estado pura, sem DOM e sem rede: testável em Node.
// ============================================================
import { RECONNECT_WINDOW, RECONNECT_RETRY } from './balance.js';

export const LIVE = 'live';
export const RECONNECTING = 'reconnecting';
export const ENDED = 'ended';

export class SessionGuard {
  constructor({
    window: win = RECONNECT_WINDOW,
    retryEvery = RECONNECT_RETRY,
    onReconnecting = null,
    onRetry = null,
    onEnded = null,
    onResumed = null,
  } = {}) {
    this.window = win;
    this.retryEvery = retryEvery;
    this.onReconnecting = onReconnecting;
    this.onRetry = onRetry;
    this.onEnded = onEnded;
    this.onResumed = onResumed;
    this.state = LIVE;
    this.left = 0;
    this.sinceRetry = 0;
    this.endCount = 0;
  }

  // Conexão caiu sem aviso: pode ser rede momentânea, então tenta voltar.
  hostLost() {
    if (this.state !== LIVE) return false; // já tratando, não reinicia a janela
    this.state = RECONNECTING;
    this.left = this.window;
    this.sinceRetry = 0;
    if (this.onReconnecting) this.onReconnecting(this.left, this.window);
    return true;
  }

  // Host avisou que vai sair, ou o jogador foi expulso: acabou, sem tentar voltar.
  endExpected(title, text) {
    if (this.state === ENDED) return false;
    this.state = ENDED;
    this.endCount++;
    if (this.onEnded) this.onEnded(title, text, true);
    return true;
  }

  tick(dt) {
    if (this.state !== RECONNECTING) return this.state;
    this.left -= dt;
    this.sinceRetry += dt;
    if (this.sinceRetry >= this.retryEvery && this.left > 0) {
      this.sinceRetry = 0;
      if (this.onRetry) this.onRetry();
    }
    if (this.left <= 0) {
      this.state = ENDED;
      this.endCount++;
      // Encerra uma vez só, por mais que o tick continue chegando.
      if (this.onEnded)
        this.onEnded('Partida encerrada', 'O host saiu e a sala foi fechada.', false);
    } else if (this.onReconnecting) {
      this.onReconnecting(Math.max(0, this.left), this.window);
    }
    return this.state;
  }

  rejoined() {
    if (this.state !== RECONNECTING) return false;
    this.state = LIVE;
    this.left = 0;
    if (this.onResumed) this.onResumed();
    return true;
  }

  reset() {
    this.state = LIVE;
    this.left = 0;
    this.sinceRetry = 0;
  }
}
