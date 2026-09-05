// ============================================================
// PROGRESSÃO DE RUN — política pura de checkpoints cooperativos.
// O save guarda o maior andar histórico; a sala escolhe separadamente
// de onde a run atual começa, sem rebaixar o personagem de ninguém.
// ============================================================
import { HARDCORE_EVERY } from './balance.js';

export function normalizeDeepestFloor(value) {
  return Math.max(1, Math.floor(Number(value)) || 1);
}

export function checkpointForFloor(floor) {
  const deepest = normalizeDeepestFloor(floor);
  return 1 + Math.floor((deepest - 1) / HARDCORE_EVERY) * HARDCORE_EVERY;
}

export function unlockedCheckpoints(deepestFloor) {
  const last = checkpointForFloor(deepestFloor);
  const floors = [];
  for (let floor = 1; floor <= last; floor += HARDCORE_EVERY) floors.push(floor);
  return floors;
}

export function commonCheckpoints(players) {
  const list = Array.isArray(players) ? players : [];
  const commonDeepest = list.length
    ? Math.min(...list.map(player => normalizeDeepestFloor(player?.deepestFloor)))
    : 1;
  return unlockedCheckpoints(commonDeepest);
}

export function chooseStartFloor(players, requested) {
  const available = commonCheckpoints(players);
  if (requested == null) return available[available.length - 1];
  const selected = normalizeDeepestFloor(requested);
  return available.includes(selected) ? selected : available[available.length - 1];
}
