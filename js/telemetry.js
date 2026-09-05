// ============================================================
// TELEMETRIA DE JOGO — somente contadores numéricos e efêmeros.
// O módulo não conhece nome, sala, save nem identificador de jogador.
// ============================================================
export const GAME_METRICS = new Set([
  'game_run_start',
  'game_run_end',
  'game_party_size',
  'game_checkpoint',
  'game_max_floor',
  'game_deaths',
  'game_reconnect_failure',
]);

const finite = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function createGameTelemetry({ send, now = () => Date.now() }) {
  let run = null;
  const emit = (name, value) => {
    if (!GAME_METRICS.has(name)) return false;
    send(name, finite(value));
    return true;
  };

  return {
    start({ partySize = 1, checkpoint = 1 } = {}) {
      if (run) return false;
      run = { startedAt: now(), maxFloor: Math.max(1, Math.floor(checkpoint) || 1) };
      emit('game_run_start', 1);
      emit('game_party_size', Math.max(1, Math.floor(partySize) || 1));
      emit('game_checkpoint', run.maxFloor);
      return true;
    },
    floor(value) {
      if (!run) return false;
      run.maxFloor = Math.max(run.maxFloor, Math.max(1, Math.floor(value) || 1));
      return true;
    },
    reconnectFailure() {
      return emit('game_reconnect_failure', 1);
    },
    finish({ deaths = 0 } = {}) {
      if (!run) return false;
      emit('game_max_floor', run.maxFloor);
      emit('game_deaths', Math.max(0, Math.floor(deaths) || 0));
      emit('game_run_end', Math.max(0, (now() - run.startedAt) / 1000));
      run = null;
      return true;
    },
    get active() {
      return !!run;
    },
  };
}
