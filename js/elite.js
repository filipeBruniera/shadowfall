// Política pura dos três modificadores de elite. A escolha recebe o RNG do
// jogo, portanto a mesma seed produz exatamente a mesma sequência.
import {
  ELITE_CHANCE,
  ELITE_FRENZY_SPEED,
  ELITE_FRENZY_ATTACK,
  ELITE_ARMORED_HP,
  ELITE_ARMORED_DEF,
  ELITE_VAMPIRIC_LEECH,
} from './balance.js';

export const ELITES = {
  f: { name: 'Frenético', icon: '⚡' },
  a: { name: 'Blindado', icon: '⬢' },
  v: { name: 'Vampírico', icon: '◆' },
};

export function rollElite(rng) {
  if (!rng.chance(ELITE_CHANCE)) return null;
  return rng.pick(Object.keys(ELITES));
}

export function applyElite(monster, code) {
  if (!ELITES[code]) return monster;
  monster.elite = code;
  if (code === 'f') monster.speed *= ELITE_FRENZY_SPEED;
  if (code === 'a') {
    monster.maxHp = Math.round(monster.maxHp * ELITE_ARMORED_HP);
    monster.hp = monster.maxHp;
    monster.def = Math.round(monster.def * ELITE_ARMORED_DEF);
  }
  if (code === 'v') monster.lifesteal = Math.max(monster.lifesteal, ELITE_VAMPIRIC_LEECH);
  return monster;
}

export function eliteLabel(monster) {
  const elite = ELITES[monster?.elite];
  return elite ? `${elite.icon} ${elite.name}` : '';
}

export function eliteAttackCooldown(monster) {
  return monster?.elite === 'f' ? ELITE_FRENZY_ATTACK : 1;
}
