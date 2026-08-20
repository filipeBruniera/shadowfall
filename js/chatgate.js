// ============================================================
// ANTIFLOOD DE CHAT — aplicado no host, que é a autoridade.
// Com 10 pessoas na sala, uma sozinha enche o log de todo mundo.
// Sem DOM: testável em Node.
// ============================================================
import { CHAT_BURST, CHAT_BURST_WINDOW, CHAT_MAX_LEN } from './balance.js';

export class ChatGate {
  constructor({ burst = CHAT_BURST, window: win = CHAT_BURST_WINDOW, maxLen = CHAT_MAX_LEN } = {}) {
    this.burst = burst;
    this.window = win;
    this.maxLen = maxLen;
    this.history = new Map();   // id -> [timestamps]
  }

  // `now` vem do relógio da simulação, não do relógio de parede: assim o
  // comportamento é reproduzível no teste.
  allow(id, now) {
    const list = (this.history.get(id) || []).filter((t) => now - t < this.window);
    if (list.length >= this.burst) {
      this.history.set(id, list);
      return { ok: false, reason: 'burst' };
    }
    list.push(now);
    this.history.set(id, list);
    return { ok: true };
  }

  // Trunca antes do envio: texto que ninguém verá não gasta banda do host.
  clean(text) {
    return String(text ?? '').slice(0, this.maxLen).trim();
  }

  forget(id) { this.history.delete(id); }
  reset() { this.history.clear(); }
}
