// ============================================================
// FILA DE AÇÕES — magia, poção, equipar. Cada uma leva id incremental
// e fica na fila até o host confirmar. Sem DOM: testável em Node.
// ============================================================
import { ACT_QUEUE_MAX } from './balance.js';

export class ActionQueue {
  constructor({ max = ACT_QUEUE_MAX, onDrop = null } = {}) {
    this.max = max;
    this.onDrop = onDrop;
    this.nextId = 1;
    this.items = [];
    this.dropped = 0;
  }

  get size() {
    return this.items.length;
  }

  // Enfileira e devolve a ação já com id.
  push(act) {
    const a = { id: this.nextId++, ...act };
    this.items.push(a);
    if (this.items.length > this.max) {
      const lost = this.items.length - this.max;
      this.items.splice(0, lost);
      this.dropped += lost;
      // Nunca em silêncio: quem perdeu uma magia precisa saber por quê.
      if (this.onDrop) this.onDrop(lost, this.dropped);
    }
    return a;
  }

  // Tudo que ainda não foi confirmado. Reenviado a cada pacote de input.
  toSend() {
    return this.items;
  }

  // O host confirma pelo maior id que já processou.
  confirm(lastAct) {
    if (!Number.isFinite(lastAct)) return 0;
    const before = this.items.length;
    this.items = this.items.filter(a => a.id > lastAct);
    return before - this.items.length;
  }

  // Troca de andar e reconexão zeram a fila: o que não foi confirmado não vale mais.
  clear() {
    this.items.length = 0;
  }
}
