// Sonda determinística do contrato de custo de `step()`. Ela existe fora do
// loop visual para separar o motor da contenção de CPU/GPU de N abas do
// Chromium. Cada amostra mede um único step; o maior valor é conservado.
import { createGame, addPlayer, setInput, step, TICK } from './sim.js';
import {
  MAX_PLAYERS,
  TICK_BUDGET_FLOORS,
  TICK_BUDGET_SEED,
  TICK_BUDGET_SAMPLES,
  TICK_BUDGET_WARMUP_STEPS,
} from './balance.js';
import { VOC_LIST } from './data.js';
import { mulberry32 } from './rng.js';

function advance(G, players) {
  for (const p of players) setInput(G, p.id, { mx: 0, my: 0, acts: [] });
  step(G, TICK);
}

// O andar 8 pede a população máxima para um grupo de 10; o gerador pode
// descartar nascimentos na sala inicial, por isso o total final é devolvido na
// leitura. O 9 acrescenta a variante HARDCORE. Ambos nascem com os mesmos dez
// jogadores que uma sala cheia, mas sem rede/render na seção cronometrada.
export function measureTickBudget(now = () => performance.now()) {
  const randomOriginal = Math.random;
  Math.random = mulberry32(TICK_BUDGET_SEED);
  try {
    return TICK_BUDGET_FLOORS.map(floor => {
      const G = createGame(TICK_BUDGET_SEED, floor, MAX_PLAYERS);
      const players = [];
      for (let i = 0; i < MAX_PLAYERS; i++) {
        players.push(
          addPlayer(G, { id: `budget-${i}`, name: `B${i}`, voc: VOC_LIST[i % VOC_LIST.length] })
        );
      }

      for (let i = 0; i < TICK_BUDGET_WARMUP_STEPS; i++) advance(G, players);

      let totalMs = 0;
      let maxMs = 0;
      for (let i = 0; i < TICK_BUDGET_SAMPLES; i++) {
        const started = now();
        advance(G, players);
        const elapsed = now() - started;
        totalMs += elapsed;
        maxMs = Math.max(maxMs, elapsed);
      }
      return {
        floor,
        players: players.length,
        monsters: G.monsters.length,
        samples: TICK_BUDGET_SAMPLES,
        meanMs: totalMs / TICK_BUDGET_SAMPLES,
        maxMs,
      };
    });
  } finally {
    Math.random = randomOriginal;
  }
}
