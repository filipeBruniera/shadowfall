// ============================================================
// BALANCEAMENTO — todo número que afina o jogo mora aqui.
// Nada de literal solto no meio da lógica: sim.js, save.js e os
// testes leem daqui, então mudar o jogo é mudar um lugar só.
// ============================================================

// ---------- Simulação ----------
export const TICK_HZ = 30;
export const TICK = 1 / TICK_HZ;

// ---------- Inventário ----------
export const INV_SIZE = 20;
export const PICKUP_RADIUS = 0.85;
export const POTION_STACK = 20;
export const START_POTIONS = { hp: 8, mp: 6 };

// ---------- Morte e ressurreição ----------
export const REVIVE_RADIUS = 1.6;
export const REVIVE_TIME = 3.5;
export const REVIVE_DECAY = 0.5;        // fração do dt que a barra perde fora do raio
export const REVIVE_MAX_HELPERS = 3;    // teto de aliados que aceleram a barra
export const RESPAWN_DELAY = 5;         // pode renascer sozinho a partir daqui
export const AUTO_RESPAWN = 30;         // renasce sozinho de qualquer jeito
export const DEATH_GOLD_LOSS = 0.1;     // 10% do ouro
export const REVIVE_HP_FRAC = 0.5;
export const REVIVE_MP_FRAC = 0.4;

// ---------- Progressão ----------
export const PORTAL_HOLD = 1.5;         // segundos em cima do portal
export const XP_RADIUS = 26;            // tiles: além disso não recebe XP do abate
export const FLOOR_RESTORE_FRAC = 0.6;  // HP/MP mínimos ao trocar de andar

// ---------- População do andar ----------
export const POP_BASE = 62;
export const POP_PER_FLOOR = 8;
export const POP_CAP = 150;

// Quantos monstros um andar recebe, já considerando o tamanho do grupo.
// A curva de grupo é sublinear e com teto: 10 jogadores não viram 10x de conteúdo.
export function floorPopulation(floor, players = 1) {
  const base = Math.min(POP_CAP, POP_BASE + floor * POP_PER_FLOOR);
  return Math.min(POP_CAP, Math.round(base * groupScale(players)));
}

// ---------- Escalonamento por tamanho de grupo ----------
// Curva escolhida: raiz quadrada com teto. Linear puniria demais o grupo grande
// (10 jogadores não dão 10x o dano de um), e sem teto o andar estouraria o
// orçamento de tick. Monotônica e limitada, como exige a fase 12.2.
export const GROUP_SCALE_CAP = 2.6;

export function groupScale(players) {
  const n = Math.max(1, Math.floor(players) || 1);
  return Math.min(GROUP_SCALE_CAP, Math.sqrt(n));
}

// XP por abate: a parcela cai conforme o grupo cresce.
export function xpShare(livingCount) {
  const n = Math.max(1, Math.floor(livingCount) || 1);
  return 1 / Math.sqrt(n);
}

// ---------- Sala ----------
export const MAX_PLAYERS = 10;

// ---------- Consciência de grupo ----------
export const EMBER_LINK_MIN = 7;        // tiles: aparece a linha de brasas
export const EMBER_LINK_FAR = 14;       // tiles: aparece direção e distância
export const HUD_ALLY_LIMIT = 3;        // barras de aliado no HUD
export const HUD_ALLY_HYSTERESIS = 1.5; // tiles de margem para trocar quem aparece
export const HUD_ALLY_REORDER_DELAY = 0.5;

// ---------- Chat ----------
export const CHAT_MAX_LEN = 140;
export const CHAT_LOG_LINES = 40;
export const CHAT_BURST = 3;            // mensagens...
export const CHAT_BURST_WINDOW = 5;     // ...por esta janela em segundos

// ---------- Fila de ações do convidado ----------
// Teto de segurança do pacote de input. Antes eram 12 fixas e as mais antigas
// sumiam em silêncio — perder magia por perder pacote. Agora o teto é largo e,
// se ainda assim estourar, o descarte é registrado e sinalizado.
export const ACT_QUEUE_MAX = 120;

// ---------- Sessão ----------
// Janela de reconexão antes de declarar a partida encerrada. Queda momentânea
// de rede é comum no celular; encerrar na hora seria hostil.
export const RECONNECT_WINDOW = 12;
export const RECONNECT_RETRY = 3;

// ---------- Escala da rede em estrela ----------
// Raio de interesse: o que está além disso não vai no snapshot daquele peer.
// Com 10 jogadores espalhados, mandar o mapa inteiro para todos multiplica a
// banda do host por 10 sem mudar nada na tela de ninguém.
//
// 34 era o valor herdado e não cortava nada: num mapa de 72x72 ele cobre quase
// tudo. A tela mostra cerca de 20 tiles na diagonal horizontal e 24 na
// vertical, então 20 cobre o visível com folga e derruba o pacote a um quinto.
export const AOI_RADIUS = 20;
export const NET_EVENT_CAP = 120;
export const SLOW_PEER_BUFFER = 512 * 1024;   // bytes acumulados sem drenar
export const SLOW_PEER_STRIKES = 40;          // envios pulados seguidos antes de derrubar

// ---------- Combate em grupo ----------
export const HEAL_ALLY_RADIUS = 8;   // tiles: alcance da cura em aliado
export const TAUNT_TIME = 6;         // segundos que o monstro fica preso na provocação
