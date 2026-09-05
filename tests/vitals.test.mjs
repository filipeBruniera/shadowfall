import { Readable } from 'node:stream';
import handler from '../api/vitals.js';

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    console.error(`  FAIL ${label} ${extra}`);
    failures++;
  }
}

function request(payload, method = 'POST') {
  const req = Readable.from([Buffer.from(JSON.stringify(payload))]);
  req.method = method;
  req.headers = { 'user-agent': 'teste-vitals' };
  return req;
}

function response() {
  return {
    code: 0,
    body: null,
    headers: {},
    status(code) {
      this.code = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function call(payload, method) {
  const res = response();
  await handler(request(payload, method), res);
  return res;
}

console.log('\n== contrato HTTP de vitals ==');

const oldUrl = process.env.VITALS_SHEETS_URL;
const oldFetch = globalThis.fetch;
const forwards = [];
process.env.VITALS_SHEETS_URL = 'https://sheets.example.test/vitals';
globalThis.fetch = async (url, options) => {
  forwards.push({ url, body: JSON.parse(options.body) });
  return { ok: true, status: 200 };
};

try {
  const valid = await call({ name: 'game_run_start', value: 1, page: '/' });
  check('vitals: aceita métrica de jogo permitida', valid.code === 200 && valid.body?.ok === true);
  check(
    'vitals: encaminha a métrica confirmada antes de responder',
    forwards.length === 1 && forwards[0].body.name === 'game_run_start'
  );

  const webVital = await call({ name: 'LCP', value: 120, page: '/', id: 'efêmero' });
  check('vitals: aceita Core Web Vital permitido', webVital.code === 200);

  const unknown = await call({ name: 'cpf', value: 1, page: '/' });
  check('vitals: rejeita nome fora da allowlist', unknown.code === 400);

  const hostilePage = await call({ name: 'game_run_start', value: 1, page: '/sala/segredo' });
  check('vitals: rejeita página fora do contrato', hostilePage.code === 400);

  const wrongMethod = await call({ name: 'LCP', value: 1, page: '/' }, 'GET');
  check('vitals: rejeita método diferente de POST', wrongMethod.code === 405);
} finally {
  globalThis.fetch = oldFetch;
  if (oldUrl === undefined) delete process.env.VITALS_SHEETS_URL;
  else process.env.VITALS_SHEETS_URL = oldUrl;
}

console.log(failures ? `\n${failures} FALHA(S)\n` : '\nTudo verde.\n');
process.exit(failures ? 1 : 0);
