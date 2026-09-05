// Trilho de aliados: quem aparece no HUD com grupo grande, e por quê.
import { AllyRail, directionArrow } from '../js/allyrail.js';
import {
  HUD_ALLY_LIMIT,
  HUD_ALLY_HYSTERESIS,
  HUD_ALLY_REORDER_DELAY,
  KEYBOARD_MAX_FRACTION,
} from '../js/balance.js';
import { alturaTeclado } from '../js/ui.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.log(`  FAIL ${label} ${extra}`);
    failures++;
  }
}

const me = { x: 0, y: 0 };
const ally = (id, d, dead = false) => ({ id, x: d, y: 0, dead });

console.log('\n== seleção do trilho ==');
{
  const rail = new AllyRail();
  const nove = Array.from({ length: 9 }, (_, i) => ally('a' + i, i + 1));
  const r = rail.select(me, nove, 1);
  check(
    'HUD: com 9 aliados apenas 3 têm barra',
    r.shown.length === HUD_ALLY_LIMIT,
    `${r.shown.length}`
  );
  check('HUD: os 3 são os mais próximos', r.shown.map(a => a.id).join(',') === 'a0,a1,a2');
  check('HUD: os demais viram linha de excedente', r.extra === 6, `extra ${r.extra}`);
}
{
  const rail = new AllyRail();
  for (const n of [0, 1, 3, 9]) {
    const lista = Array.from({ length: n }, (_, i) => ally('b' + i, i + 1));
    const r = rail.select(me, lista, 1);
    const esperado = Math.min(n, HUD_ALLY_LIMIT);
    if (r.shown.length !== esperado) {
      check(`HUD: layout com ${n} aliados`, false, `${r.shown.length}`);
      break;
    }
  }
  check('HUD: 0, 1, 3 e 9 aliados produzem trilho coerente', true);
  check('HUD: sem aliados o trilho fica vazio', rail.select(me, [], 1).shown.length === 0);
}

console.log('\n== estabilidade ==');
{
  const rail = new AllyRail();
  // Três fixos e um quarto oscilando bem na fronteira do terceiro.
  const base = [ally('a', 1), ally('b', 2), ally('c', 5)];
  rail.select(me, [...base, ally('d', 5.2)], 1);
  const antes = rail.current.join(',');

  let trocas = 0;
  for (let i = 0; i < 60; i++) {
    const jitter = 5 + (i % 2 ? 0.2 : -0.2); // oscila em torno de 5
    const r = rail.select(me, [...base, ally('d', jitter)], 1 / 30);
    const agora = r.shown.map(x => x.id).join(',');
    if (agora !== antes) trocas++;
  }
  check(
    'HUD: a seleção dos 3 mais próximos é estável na fronteira',
    trocas === 0,
    `${trocas} trocas`
  );

  // Vantagem clara acima da histerese: aí sim troca.
  for (let i = 0; i < 40; i++)
    rail.select(me, [...base, ally('d', 5 - HUD_ALLY_HYSTERESIS - 1)], 1 / 30);
  check(
    'HUD: vantagem acima da histerese troca quem aparece',
    rail.current.includes('d'),
    rail.current.join(',')
  );
}

console.log('\n== aliado caído ==');
{
  const rail = new AllyRail();
  const lista = [ally('a', 1), ally('b', 2), ally('c', 3), ally('d', 4), ally('longe', 40, true)];
  const r = rail.select(me, lista, 1);
  check(
    'HUD: aliado caído aparece mesmo fora dos 3',
    r.downed.length === 1 && r.downed[0].id === 'longe'
  );
  check('HUD: o caído não rouba vaga dos vivos', r.shown.length === HUD_ALLY_LIMIT);
  check('HUD: o excedente desconta o caído já mostrado', r.extra === 1, `extra ${r.extra}`);

  const muitos = [
    ally('a', 1),
    ...Array.from({ length: 4 }, (_, i) => ally('d' + i, 10 + i, true)),
  ];
  const r2 = rail.select(me, muitos, 1);
  check('HUD: o trilho aceita no máximo 2 caídos', r2.downed.length === 2, `${r2.downed.length}`);
}

console.log('\n== direção ==');
{
  check('HUD: seta aponta para a direita', directionArrow({ x: 0, y: 0 }, { x: 5, y: 0 }) === '→');
  check('HUD: seta aponta para cima', directionArrow({ x: 0, y: 0 }, { x: 0, y: -5 }) === '↑');
  check('HUD: seta aponta para baixo', directionArrow({ x: 0, y: 0 }, { x: 0, y: 5 }) === '↓');
  check(
    'HUD: seta aponta para a esquerda',
    directionArrow({ x: 0, y: 0 }, { x: -5, y: 0 }) === '←'
  );
  check('HUD: seta cobre as diagonais', directionArrow({ x: 0, y: 0 }, { x: 5, y: 5 }) === '↘');
}

console.log('\n== altura do teclado virtual (--kb) ==');
{
  // Sem teclado: visual viewport do tamanho da de layout.
  check(
    'TECLADO: sem teclado o deslocamento é zero',
    alturaTeclado({ height: 844, scale: 1, offsetTop: 0 }, 844) === 0
  );

  // Android/Chrome: a visual viewport encolhe e a de layout fica.
  check(
    'TECLADO: teclado de 260px vira deslocamento de 260px',
    alturaTeclado({ height: 584, scale: 1, offsetTop: 0 }, 844) === 260
  );

  // iOS: rola a visual viewport em vez de encolhê-la por inteiro.
  check(
    'TECLADO: a rolagem da visual viewport entra na conta',
    alturaTeclado({ height: 584, scale: 1, offsetTop: 100 }, 844) === 160
  );

  // Pinça: `height` já vem dividido pela escala. Sem multiplicar de volta, isto
  // devolveria 422 — meia tela de teclado fantasma — e jogaria a faixa de chat
  // para fora do visor de quem usa "forçar zoom" na acessibilidade.
  check(
    'TECLADO: zoom de pinça não vira teclado fantasma',
    alturaTeclado({ height: 422, scale: 2, offsetTop: 0 }, 844) === 0,
    `${alturaTeclado({ height: 422, scale: 2, offsetTop: 0 }, 844)}`
  );
  check(
    'TECLADO: zoom com teclado junto ainda mede só o teclado',
    alturaTeclado({ height: 292, scale: 2, offsetTop: 0 }, 844) === 260,
    `${alturaTeclado({ height: 292, scale: 2, offsetTop: 0 }, 844)}`
  );

  // Teto: nada pode empurrar a faixa para fora da tela.
  const teto = Math.round(844 * KEYBOARD_MAX_FRACTION);
  check(
    'TECLADO: o deslocamento para no teto de sanidade',
    alturaTeclado({ height: 10, scale: 1, offsetTop: 0 }, 844) === teto,
    `${alturaTeclado({ height: 10, scale: 1, offsetTop: 0 }, 844)} contra ${teto}`
  );
  check(
    'TECLADO: valor negativo nunca vira deslocamento',
    alturaTeclado({ height: 900, scale: 1, offsetTop: 0 }, 844) === 0
  );

  // Ausência de visualViewport (engine antiga) não pode virar NaN no CSS.
  check('TECLADO: sem visualViewport o deslocamento é zero', alturaTeclado(null, 844) === 0);
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
