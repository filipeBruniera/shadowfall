// Chat com grupo grande: teto de tamanho, antiflood e limite do log.
import { ChatGate } from '../js/chatgate.js';
import { CHAT_MAX_LEN, CHAT_BURST, CHAT_BURST_WINDOW, CHAT_LOG_LINES } from '../js/balance.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { console.log(`  FAIL ${label} ${extra}`); failures++; }
}

console.log('\n== tamanho da mensagem ==');
{
  const g = new ChatGate();
  const longa = 'a'.repeat(CHAT_MAX_LEN + 200);
  check('chat: mensagem acima do limite é truncada antes do envio',
    g.clean(longa).length === CHAT_MAX_LEN, `${g.clean(longa).length}`);
  check('chat: mensagem só com espaços não é enviada', g.clean('     ') === '');
  check('chat: mensagem nula não derruba nada', g.clean(null) === '' && g.clean(undefined) === '');
  check('chat: mensagem normal passa inteira', g.clean('  vem cá  ') === 'vem cá');
}

console.log('\n== antiflood ==');
{
  const g = new ChatGate();
  let t = 0;
  const ok = [];
  for (let i = 0; i < CHAT_BURST + 2; i++) ok.push(g.allow('p1', t += 0.1).ok);
  check('chat: rajada acima do limite é barrada',
    ok.filter(Boolean).length === CHAT_BURST, `${ok.filter(Boolean).length} passaram`);

  // Passada a janela, volta a aceitar.
  check('chat: depois da janela volta a aceitar', g.allow('p1', t + CHAT_BURST_WINDOW + 1).ok);

  const g2 = new ChatGate();
  for (let i = 0; i < CHAT_BURST; i++) g2.allow('p1', 0);
  check('chat: o limite é por jogador, não da sala inteira', g2.allow('p2', 0).ok);
  check('chat: o jogador barrado não afeta os outros', !g2.allow('p1', 0).ok);

  g2.forget('p1');
  check('chat: esquecer um jogador libera o histórico dele', g2.allow('p1', 0).ok);
}

console.log('\n== log ==');
{
  // O teto de linhas é do balanceamento, e a interface o consome.
  check('chat: o teto de linhas do log está declarado', CHAT_LOG_LINES >= 20 && CHAT_LOG_LINES <= 200);

  // Simula a poda que a interface faz.
  const linhas = [];
  for (let i = 0; i < CHAT_LOG_LINES + 50; i++) {
    linhas.unshift('linha ' + i);
    while (linhas.length > CHAT_LOG_LINES) linhas.pop();
  }
  check('chat: o log respeita o teto de linhas', linhas.length === CHAT_LOG_LINES);
  check('chat: as linhas mais novas ficam, as antigas caem',
    linhas[0] === 'linha ' + (CHAT_LOG_LINES + 49));
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
