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

// ---------- Chefe ----------
// O chefe do andar era o único conteúdo com número de dificuldade escrito
// dentro de sim.js (`floor + 3` no nascimento e `1 + (level - 1) * 0.22` no
// makeMonster). Isso quebrava a regra da casa e, pior, escondia a curva: para
// saber se o andar 12 estava duro demais era preciso ler o laço de combate.
// Agora a curva mora aqui e sim.js só consome.

// Chefe nasce acima do andar: no andar 1 ele já é nível 4, senão o grupo
// atravessa o portal sem sentir que enfrentou um chefe.
export const BOSS_LEVEL_OFFSET = 3;

// Escala por nível — valores herdados de makeMonster, movidos sem alteração.
// Mudar qualquer um destes reescala TODO monstro do jogo, não só o chefe.
export const LEVEL_HP_SCALE = 0.22;
export const LEVEL_ATK_SCALE = 0.16;
export const LEVEL_DEF_SCALE = 0.1;
export const LEVEL_XP_SCALE = 0.3;

// Fonte única da dificuldade do chefe por andar. Monotônica não decrescente
// porque `floor` só cresce e um andar mais fundo nunca pode devolver um chefe
// mais fraco que o anterior.
export function bossCurve(floor) {
  const f = Math.max(1, Math.floor(floor) || 1);
  const level = f + BOSS_LEVEL_OFFSET;
  return {
    level,
    hpMult: 1 + (level - 1) * LEVEL_HP_SCALE,
    atkMult: 1 + (level - 1) * LEVEL_ATK_SCALE,
  };
}

// ---------- Variante HARDCORE ----------
// Cai a cada 3 andares. Os chefes giram em ciclo de 4, então o par
// chefe x HARDCORE só se repete a cada 12 andares: cada um dos 4 chefes recebe
// exatamente uma aparição HARDCORE por bloco de 12, e nenhum monopoliza a
// variante.
export const HARDCORE_EVERY = 3;

// MEDIDOS, não escolhidos. O requisito vinculante não é o multiplicador e sim
// a razão de duração de luta: derrubar o HARDCORE tem de custar ~2x o tempo do
// comum do mesmo andar (banda 1,8-2,4). Os dois números abaixo saíram do
// harness de RF-11 em tests/group.test.mjs — 5 seeds por andar, grupo de 6,
// nível do chefe + 8, dano do chefe ligado.
//
// Medição de 20/08/2026, razão t_hc / t_comum por chefe:
//   andar  3  glacier   (Rainha Glacial)  → 1,943
//   andar  6  morgaroth (Senhor do Fosso) → 1,990
//   andar  9  ferumbras (Arauto de Cinzas)→ 2,054
//   andar 12  bonelord  (Ossuário Ancião) → 1,987
// Os 4 chefes ficam dentro da banda com margem: pior caso 1,943 (0,14 acima do
// piso) e 2,054 (0,35 abaixo do teto).
//
// Por que 1.75 e não o provisório 1.85: com 1.85 as razões medidas eram
// 2,114 / 2,184 / 2,223 / 2,173 — dentro da banda, mas encostadas no teto de
// 2,4 e longe do "dobro" que o requisito pede. 1.60 derruba tudo para
// 1,74-1,79, abaixo do piso.
//
// Por que o ATK para em 1.45: a razão é dominada pelo HP; o atk só entra pelo
// tempo em que o grupo fica caído. Até 1.45 a medição não registra nenhuma
// morte e as razões não se mexem (idênticas a 1.30); em 1.60 aparece a
// primeira morte e a razão do andar 6 pula para 2,036, ou seja, o degrau de
// dano passa a injetar ruído de seed na medida. 1.45 é o degrau de ameaça mais
// alto que ainda mede estável.
export const HARDCORE_HP_MULT = 1.75;
export const HARDCORE_ATK_MULT = 1.45;

// Recompensa NÃO acompanha o degrau: `xp` e o nível que o loot consulta ficam
// nos valores da variante comum, então o andar HARDCORE custa cerca de duas
// vezes mais tempo pelo mesmo ganho. Isso é decisão registrada, não esquecimento
// — a SPEC de chefes-hardcore põe `mudança no cálculo de loot ou XP do chefe`
// explicitamente fora de escopo. Está anotado aqui porque é o primeiro lugar
// onde alguém vai procurar ao achar que falta algo.

// ---------- Janelas de carga ----------
// Golpe carregado: a janela existe para dar tempo de reagir, então ela é
// tuning de legibilidade, não detalhe de implementação.
export const MONSTER_WINDUP = 0.35;
export const BOSS_WINDUP = 0.5;

// Ataque perigoso do chefe é telegrafado por uma janela maior que o windup
// comum: com 0,5 s o jogador só descobre a área depois de já ter tomado o
// dano. Precisa ser estritamente > BOSS_WINDUP, senão a telegrafia não
// acrescenta nada sobre o golpe normal.
export const BOSS_TELEGRAPH_TIME = 1.1;

// Intervalo entre especiais do chefe. Menor que isso e a luta vira sequência
// de cinemáticas sem espaço para o grupo agir.
export const BOSS_SPECIAL_CD = 7;

// Regeneracao passiva do jogador, fracao de maxHp por segundo. Estava solta
// dentro de updatePlayer como literal. Importa estar aqui porque ela e a
// contraparte direta de WITHER_DPS: o wither so muda alguma coisa se o dano
// por tempo superar o que o jogador recupera sozinho no mesmo intervalo.
export const PLAYER_REGEN_PCT = 0.012;

// ---------- Status wither (elemento Morte) ----------
// Decisão de projeto: o que dá identidade ao elemento Morte é a redução da
// cura recebida, não o dano por tempo. Reusar `poison` deixaria Morte e Terra
// indistinguíveis em jogo — os dois virariam "o inimigo que tira HP devagar".
// Com o funil de cura, a resposta certa do grupo muda: não adianta o druida
// segurar o alvo na cura, alguém precisa terminar a luta antes do tique.
//
// O DPS segue o padrão absoluto de `burn`/`poison` (dano por segundo já
// resolvido, não fração de atk), para caber no mesmo tickStatus.
export const WITHER_TIME = 4;
export const WITHER_DPS = 9;

// Fator da cura recebida enquanto wither está ativo: estritamente entre 0 e 1,
// senão o status ou não faz nada (>= 1) ou trava a cura por completo (<= 0) e
// vira morte garantida sem contrajogo.
export const WITHER_HEAL_MULT = 0.5;

// ---------- Status que o acerto do chefe aplica ----------
// Magnitude por status, indexada pela mesma chave que ELEM_STATUS devolve
// (js/data.js). Tabela e não `if` encadeado: o acerto corpo a corpo e o
// impacto do projétil leem daqui, e com dois caminhos escrevendo número
// próprio eles divergiriam na primeira mudança de balanceamento.
// Só o chefe marca — rebalancear monstro comum está fora do escopo, então
// `poison` da aranha continua vindo da própria tabela de conteúdo.
//
// A janela do freeze é curta de propósito: o golpe básico do chefe sai a cada
// ~2 s (cd + windup) e um congelamento mais longo que isso encadearia,
// tirando o controle do jogador pela luta inteira.
export const BOSS_BURN_TIME = 4;
export const BOSS_BURN_DPS = 11;
export const BOSS_FREEZE_TIME = 0.6;
export const BOSS_POISON_TIME = 4;
export const BOSS_POISON_DPS = 8;

export const BOSS_STATUS_MAG = {
  burn: { time: BOSS_BURN_TIME, dps: BOSS_BURN_DPS },
  freeze: { time: BOSS_FREEZE_TIME },
  wither: { time: WITHER_TIME },
  poison: { time: BOSS_POISON_TIME, dps: BOSS_POISON_DPS },
};

// ---------- Sala ----------
export const MAX_PLAYERS = 10;

// ---------- Consciência de grupo ----------
export const EMBER_LINK_MIN = 7;        // tiles: aparece a linha de brasas
export const EMBER_LINK_FAR = 14;       // tiles: aparece direção e distância
export const HUD_ALLY_LIMIT = 3;        // barras de aliado no HUD
export const HUD_ALLY_HYSTERESIS = 1.5; // tiles de margem para trocar quem aparece
export const HUD_ALLY_REORDER_DELAY = 0.5;

// ---------- Toque ----------
// A metade esquerda inteira da tela é do joystick (hud-grupo-mobile.md:35): o
// polegar esquerdo nunca deveria virar ordem de movimento por 5% de largura.
export const TOUCH_STICK_ZONE = 0.5;    // fração da largura que pertence ao joystick
export const TOUCH_STICK_RADIUS = 64;   // metade do #stick de 128px: centra o anel no dedo
export const TOUCH_STICK_TRAVEL = 54;   // curso máximo do polegar dentro do anel

// ---------- Chat ----------
export const CHAT_MAX_LEN = 140;
export const CHAT_LOG_LINES = 40;
export const CHAT_BURST = 3;            // mensagens...
export const CHAT_BURST_WINDOW = 5;     // ...por esta janela em segundos

// ---------- Registro ----------
// 6 linhas = 95,7px com o line-height medido de 15,95px: ~37% menos área pintada
// em 390x844 que as 9 de hoje, sem cair abaixo das 5-6 que uma conversa de 10 pede.
export const LOG_MAX_LINES = 6;

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
