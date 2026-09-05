// ============================================================
// SALA — quem está dentro, quem espera, quem é recusado.
// Política pura, sem DOM e sem rede: dá para testar em Node.
// ============================================================
import { MAX_PLAYERS } from './balance.js';

export const REFUSE_FULL = 'full';
export const REFUSE_LOCKED = 'locked';

export class Room {
  constructor({ max = MAX_PLAYERS } = {}) {
    this.max = max;
    this.locked = false;
    this.started = false;
    this.players = new Map(); // id -> entry (lobby ou em partida)
    this.queue = []; // entradas esperando a virada de andar
  }

  // O teto conta quem está jogando MAIS quem espera na fila.
  get count() {
    return this.players.size + this.queue.length;
  }

  canAccept(id) {
    if (this.players.has(id) || this.queue.some(e => e.id === id)) return { ok: true };
    if (this.locked) return { ok: false, reason: REFUSE_LOCKED };
    if (this.count >= this.max) return { ok: false, reason: REFUSE_FULL };
    return { ok: true };
  }

  // Antes de começar entra direto; com a partida em curso, vai para a fila.
  admit(entry) {
    const verdict = this.canAccept(entry.id);
    if (!verdict.ok) return verdict;

    this.remove(entry.id);
    if (this.started) {
      this.queue.push({ ...entry, queued: true });
      return { ok: true, queued: true };
    }
    this.players.set(entry.id, { ...entry, queued: false });
    return { ok: true, queued: false };
  }

  update(id, patch) {
    const p = this.players.get(id);
    if (p) {
      Object.assign(p, patch);
      return p;
    }
    const q = this.queue.find(e => e.id === id);
    if (q) {
      Object.assign(q, patch);
      return q;
    }
    return null;
  }

  remove(id) {
    const had = this.players.delete(id);
    const before = this.queue.length;
    this.queue = this.queue.filter(e => e.id !== id);
    return had || this.queue.length !== before;
  }

  has(id) {
    return this.players.has(id) || this.queue.some(e => e.id === id);
  }

  // Host primeiro, depois ordem de chegada.
  list() {
    const all = [...this.players.values()];
    return all.sort((a, b) => (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0));
  }

  queueList() {
    return this.queue.slice();
  }

  // 1º, 2º, … na fila. Zero quando não está na fila.
  positionOf(id) {
    const i = this.queue.findIndex(e => e.id === id);
    return i === -1 ? 0 : i + 1;
  }

  // Chamado na virada de andar: todo mundo que esperava entra de uma vez.
  drain() {
    const entering = this.queue;
    this.queue = [];
    for (const e of entering) this.players.set(e.id, { ...e, queued: false });
    return entering;
  }

  setLocked(v) {
    this.locked = !!v;
    return this.locked;
  }
}
