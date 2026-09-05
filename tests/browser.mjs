import puppeteer from 'puppeteer';
// A AC 2 de UI-03 proíbe repetir o 0.5 aqui: a fração da zona do joystick e o
// raio do #stick vêm de js/balance.js, a mesma fonte que js/main.js consulta
// para decidir a origem do toque — reexportados por mobile-helpers.mjs, que os
// lê por namespace para o portão de RF-03 não morrer no link do módulo.
// INV_SIZE fecha a mochila cheia de UI-04.
import { DAILY_CONTRACT_SEED, INV_SIZE } from '../js/balance.js';
import { generateDailyContracts } from '../js/contracts.js';
import {
  VIEWPORT_MOBILE, VIEWPORT_SMALL, VIEWPORT_DESKTOP, ALTURAS_UI03, ALVO_MIN, SLOT_LADO, BARRA_LARGURA,
  TOUCH_STICK_ZONE, TOUCH_STICK_RADIUS, LOG_MAX_LINES, CHAT_MAX_LEN,
  SEL_CHAT_ABRIR, SEL_CHAT_FECHAR, errosDeConstante,
  alturaMobile, installHelpers,
} from './mobile-helpers.mjs';

const URL = process.env.URL || 'http://localhost:8099/index.html';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const OUT = process.env.OUT || '/tmp/shadowfall-shots';
const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
// Tolerância de subpixel compartilhada pelas medições de painel e HUD: o
// translate/anti-aliasing do navegador pode devolver uma borda 0,3px fora.
const TOL = 0.5;

async function newSmokePage(scope) {
  const page = await scope.newPage();
  // Preview protegido continua fechado ao público: o segredo oficial só entra
  // na navegação principal e a Vercel grava o cookie para seus subrecursos.
  // Aplicá-lo aos CDNs de fonte e PeerJS provocaria preflight CORS indevido.
  if (BYPASS_SECRET) {
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        request.continue({ headers: {
          ...request.headers(),
          'x-vercel-protection-bypass': BYPASS_SECRET,
          'x-vercel-set-bypass-cookie': 'true',
        } });
        return;
      }
      request.continue();
    });
  }
  return page;
}

async function openSmokePage(page) {
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(() => !!window.__SF, { timeout: 20000 });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

const page = await newSmokePage(browser);
await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });

const errors = [];
const logs = [];
page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (!u.includes('fonts.g') && !u.includes('peerjs')) errors.push('REQFAIL: ' + u + ' ' + r.failure()?.errorText);
});

await page.evaluateOnNewDocument(() => {
  const probe = { contexts: 0, resumes: 0, layerCalls: 0, tracks: 0, stoppedTracks: 0, errors: 0 };
  window.__audioProbe = probe;
  class FakeGain {
    constructor() {
      this.gain = {
        value: 1,
        setTargetAtTime() {},
        linearRampToValueAtTime() {},
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      };
    }
    connect() {}
  }
  class FakeOscillator {
    constructor() {
      this.frequency = { value: 0 };
    }
    connect() {}
    start() { probe.tracks++; }
    stop() { probe.stoppedTracks++; }
  }
  class FakeAudioContext {
    constructor() {
      probe.contexts++;
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
    }
    createGain() { return new FakeGain(); }
    createOscillator() { return new FakeOscillator(); }
    resume() {
      probe.resumes++;
      this.state = 'running';
      return Promise.resolve();
    }
  }
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = undefined;
  addEventListener('error', () => { probe.errors++; });
  addEventListener('unhandledrejection', () => { probe.errors++; });
});

await openSmokePage(page);
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/01-menu.png` });

const audioAntesDoGesto = await page.evaluate(() => ({ ...window.__audioProbe }));
await page.evaluate(() => {
  const original = window.__SF.audio.unlock;
  window.__SF.audio.unlock = () => {
    window.__audioProbe.layerCalls++;
    return original();
  };
});

// P0-01: o smoke fecha o contrato que só existe no DOM do lobby. O contexto
// separado impede que o save de progresso fabricado para esta medição altere a
// partida solo que cobre o restante deste roteiro.
async function medirCheckpointDoLobby() {
  const context = await browser.createBrowserContext();
  const lobby = await newSmokePage(context);
  await lobby.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
  await lobby.evaluateOnNewDocument(() => {
    localStorage.setItem('sf-save-knight', JSON.stringify({
      v: 3,
      voc: 'knight',
      name: 'Veterano',
      totalXp: 0,
      level: 1,
      xp: 0,
      gold: 0,
      floor: 10,
      potions: { hp: 4, mp: 4 },
      items: [],
    }));
  });
  try {
    await openSmokePage(lobby);
    await lobby.click('.voc-card[data-voc="knight"]');
    await lobby.type('#nameInput', 'Veterano');
    await lobby.click('#btnHost');
    await lobby.waitForFunction(
      () => document.querySelectorAll('#startFloorSelect option').length === 4,
      { timeout: 20000 }
    );

    const inicial = await lobby.evaluate(() => {
      const select = document.getElementById('startFloorSelect');
      return {
        opcoes: [...select.options].map(option => option.value),
        selecionado: select.value,
        disabled: select.disabled,
      };
    });
    if (JSON.stringify(inicial.opcoes) !== JSON.stringify(['1', '4', '7', '10'])) {
      errors.push(`CHECKPOINT: opções do roster profundo = ${JSON.stringify(inicial.opcoes)}, esperado ["1","4","7","10"]`);
    }
    if (inicial.selecionado !== '10') {
      errors.push(`CHECKPOINT: padrão = andar ${inicial.selecionado}, esperado maior checkpoint comum 10`);
    }
    if (inicial.disabled) errors.push('CHECKPOINT: host recebeu seletor desabilitado');

    await lobby.select('#startFloorSelect', '4');
    // Trancar a sala chama renderRoster(), que recria as <option>s. A escolha
    // manual deve sobreviver a essa atualização, não apenas ao evento change.
    await lobby.click('#btnLock');
    const manual = await lobby.evaluate(() => document.getElementById('startFloorSelect').value);
    if (manual !== '4') {
      errors.push(`CHECKPOINT: escolha manual anterior foi perdida após renderizar o roster (${manual})`);
    }
  } catch (error) {
    errors.push(`CHECKPOINT: não consegui medir o lobby — ${error.message}`);
  } finally {
    await context.close();
  }
}

await medirCheckpointDoLobby();

// P3D-02: o Refúgio não é uma segunda sala. Ele só troca a superfície entre
// runs, conserva a sessão de host/convidado em espera e não pode esconder uma
// partida que tenha começado enquanto a pessoa estava navegando.
async function medirEntradaDoRefugio() {
  const hostContext = await browser.createBrowserContext();
  const guestContext = await browser.createBrowserContext();
  const host = await newSmokePage(hostContext);
  const guest = await newSmokePage(guestContext);
  const pageErrors = [];
  host.on('pageerror', error => pageErrors.push(`host: ${error.message}`));
  guest.on('pageerror', error => pageErrors.push(`convidado: ${error.message}`));
  await host.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
  await guest.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
  const saveComAndar = (voc, floor) => ({
    v: 3,
    voc,
    name: voc === 'knight' ? 'Guardião' : 'Visitante',
    totalXp: 0,
    level: 1,
    xp: 0,
    gold: 0,
    floor,
    potions: { hp: 4, mp: 4 },
    items: [],
  });
  await host.evaluateOnNewDocument((save) => {
    localStorage.setItem('sf-save-knight', JSON.stringify(save));
  }, saveComAndar('knight', 14));
  await guest.evaluateOnNewDocument((save) => {
    localStorage.setItem('sf-save-druid', JSON.stringify(save));
  }, saveComAndar('druid', 8));

  const visible = (page, id) => page.evaluate((target) => {
    const element = document.getElementById(target);
    return !!element && !element.classList.contains('hidden');
  }, id);

  try {
    await openSmokePage(host);
    await host.click('#btnRefugeMenu');
    const solo = await host.evaluate(() => ({
      refuge: !document.getElementById('refuge').classList.contains('hidden'),
      menu: document.getElementById('menu').classList.contains('hidden'),
      started: window.__SF.started,
      role: window.__SF.role,
      pessoal: document.getElementById('refugePersonalCheckpoint').textContent.trim(),
      comumOculto: document.getElementById('refugeCommonCheckpointRow').classList.contains('hidden'),
      proxima: document.getElementById('refugeSelectedCheckpoint').textContent.trim(),
    }));
    await host.click('#btnLeaveRefuge');
    const soloVoltou = await visible(host, 'menu');
    if (
      !solo.refuge ||
      !solo.menu ||
      solo.started ||
      solo.role !== 'solo' ||
      solo.pessoal !== 'Andar 13' ||
      !solo.comumOculto ||
      solo.proxima !== 'Andar 13' ||
      !soloVoltou
    ) {
      errors.push(`REFÚGIO: entrada solo não voltou ao menu — ${JSON.stringify({ solo, soloVoltou })}`);
    }

    await host.click('.voc-card[data-voc="knight"]');
    await host.type('#nameInput', 'Guardião');
    await host.click('#btnHost');
    await host.waitForFunction(() => !document.getElementById('lobby').classList.contains('hidden'), { timeout: 20000 });
    const code = await host.$eval('#lobbyCode', element => element.textContent.trim());

    await openSmokePage(guest);
    await guest.click('.voc-card[data-voc="druid"]');
    await guest.type('#nameInput', 'Visitante');
    await guest.type('#codeInput', code);
    await guest.click('#btnJoin');
    await guest.waitForFunction(() => !document.getElementById('lobby').classList.contains('hidden'), { timeout: 20000 });
    await host.waitForFunction(() => document.getElementById('lobbyCount').textContent.trim() === '2/10', { timeout: 20000 });
    await host.select('#startFloorSelect', '4');
    await guest.waitForFunction(() => window.__SF.startFloor === 4, { timeout: 20000 });

    await host.click('#btnRefugeLobby');
    await guest.click('#btnRefugeLobby');
    const emRefugio = await Promise.all([host, guest].map(page => page.evaluate(() => ({
      refuge: !document.getElementById('refuge').classList.contains('hidden'),
      lobby: document.getElementById('lobby').classList.contains('hidden'),
      started: window.__SF.started,
      role: window.__SF.role,
      jogadores: window.__SF.room.list().length,
      pessoal: document.getElementById('refugePersonalCheckpoint').textContent.trim(),
      comum: document.getElementById('refugeCommonCheckpoint').textContent.trim(),
      comumVisivel: !document.getElementById('refugeCommonCheckpointRow').classList.contains('hidden'),
      proxima: document.getElementById('refugeSelectedCheckpoint').textContent.trim(),
    }))));
    await host.click('#btnLeaveRefuge');
    await guest.click('#btnLeaveRefuge');
    const voltouAoLobby = await Promise.all([visible(host, 'lobby'), visible(guest, 'lobby')]);
    if (
      emRefugio.some(state => !state.refuge || !state.lobby || state.started || state.jogadores !== 2) ||
      emRefugio[0].role !== 'host' ||
      emRefugio[1].role !== 'guest' ||
      emRefugio[0].pessoal !== 'Andar 13' ||
      emRefugio[1].pessoal !== 'Andar 7' ||
      emRefugio.some(state => state.comum !== 'Andar 7' || !state.comumVisivel || state.proxima !== 'Andar 4') ||
      voltouAoLobby.some(state => !state)
    ) {
      errors.push(`REFÚGIO: sala em espera foi alterada — ${JSON.stringify({ emRefugio, voltouAoLobby })}`);
    }

    // A fila é um estado de transição do protocolo: mesmo um click disparado
    // por script não pode trocar sua tela enquanto o host a está atualizando.
    const filaProtegida = await guest.evaluate(() => {
      window.__SF.queued = true;
      document.getElementById('btnRefugeLobby').click();
      const state = {
        refuge: !document.getElementById('refuge').classList.contains('hidden'),
        lobby: !document.getElementById('lobby').classList.contains('hidden'),
      };
      window.__SF.queued = false;
      return state;
    });
    if (filaProtegida.refuge || !filaProtegida.lobby) {
      errors.push(`REFÚGIO: a fila foi escondida por abertura indevida — ${JSON.stringify(filaProtegida)}`);
    }

    await host.click('#btnStart');
    await host.waitForFunction(() => window.__SF.started && !document.getElementById('game').classList.contains('hidden'), { timeout: 20000 });
    await guest.waitForFunction(() => window.__SF.started && !document.getElementById('game').classList.contains('hidden'), { timeout: 20000 });
    // O botão oculto ainda recebe um click programático: a guarda precisa
    // proteger a partida pelo estado, não só pela visibilidade da tela.
    await host.evaluate(() => document.getElementById('btnRefugeMenu').click());
    const durantePartida = await host.evaluate(() => ({
      refuge: !document.getElementById('refuge').classList.contains('hidden'),
      game: !document.getElementById('game').classList.contains('hidden'),
      started: window.__SF.started,
    }));
    if (durantePartida.refuge || !durantePartida.game || !durantePartida.started) {
      errors.push(`REFÚGIO: abertura interferiu na partida — ${JSON.stringify(durantePartida)}`);
    }

    await host.evaluate(() => document.getElementById('btnLeave').click());
    await host.waitForFunction(() => !window.__SF.started && !document.getElementById('menu').classList.contains('hidden'), { timeout: 10000 });
    await guest.waitForFunction(() => window.__SF.expected && !window.__SF.started, { timeout: 10000 });
    // Encerramento esperado também chega por mensagem; o botão oculto continua
    // invocável pelo DOM, então a guarda precisa preservar o aviso de saída.
    const aposEncerrar = await guest.evaluate(() => {
      document.getElementById('btnRefugeMenu').click();
      return {
        refuge: !document.getElementById('refuge').classList.contains('hidden'),
        game: !document.getElementById('game').classList.contains('hidden'),
        ended: !document.getElementById('dropOverlay').classList.contains('hidden'),
        started: window.__SF.started,
        expected: window.__SF.expected,
      };
    });
    if (aposEncerrar.refuge || !aposEncerrar.game || !aposEncerrar.ended || aposEncerrar.started || !aposEncerrar.expected) {
      errors.push(`REFÚGIO: sessão encerrada não preservou o aviso seguro — ${JSON.stringify(aposEncerrar)}`);
    }
    if (pageErrors.length) errors.push(`REFÚGIO: erro de página — ${pageErrors.join(' · ')}`);
  } catch (error) {
    errors.push(`REFÚGIO: não consegui medir a entrada e saída — ${error.message}`);
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
}

await medirEntradaDoRefugio();

// P3D-04: o Refúgio recebe o save normalizado e só materializa as revelações
// que o view-model liberou. O contexto isolado impede que essas mortes
// fabricadas contaminem o roteiro cooperativo já em execução.
async function medirBestiarioDoRefugio() {
  const context = await browser.createBrowserContext();
  const refuge = await newSmokePage(context);
  const pageErrors = [];
  refuge.on('pageerror', error => pageErrors.push(error.message));
  await refuge.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
  const save = (kills) => ({
    v: 4,
    voc: 'knight',
    name: 'Cronista',
    totalXp: 0,
    level: 1,
    xp: 0,
    gold: 0,
    floor: 1,
    potions: { hp: 4, mp: 4 },
    items: [],
    bestiary: { kills },
    contracts: { day: '', progress: {}, claimed: [] },
  });

  async function abrir(kills) {
    await refuge.evaluateOnNewDocument((nextSave) => {
      localStorage.setItem('sf-save-knight', JSON.stringify(nextSave));
    }, save(kills));
    await openSmokePage(refuge);
    await refuge.click('#btnRefugeMenu');
    return refuge.evaluate(() => ({
      summary: document.getElementById('refugeBestiarySummary').textContent.trim(),
      empty: document.getElementById('refugeBestiaryEmpty').textContent.trim(),
      emptyVisible: !document.getElementById('refugeBestiaryEmpty').classList.contains('hidden'),
      rows: [...document.querySelectorAll('#refugeBestiaryList > li')].map(row => row.textContent.trim()),
    }));
  }

  try {
    const vazio = await abrir({ removido: 100, rat: -1 });
    const conhecido = await abrir({ rat: 25, ferumbras: 100, removido: 999 });
    const rato = conhecido.rows.find(row => row.startsWith('Rato Podre')) || '';
    const chefe = conhecido.rows.find(row => row.includes('100 derrotas')) || '';
    const desconhecido = conhecido.rows.find(row => row.startsWith('Criatura desconhecida')) || '';
    if (
      vazio.summary !== '0 de 16 tipos identificados.' ||
      vazio.empty !== 'Nenhuma criatura registrada.' ||
      !vazio.emptyVisible ||
      vazio.rows.length !== 16 ||
      vazio.rows.some(row => !row.includes('Criatura desconhecida') || row.includes('Rato Podre'))
    ) {
      errors.push(`REFÚGIO: bestiário vazio vazou ou não ficou legível — ${JSON.stringify(vazio)}`);
    }
    if (
      conhecido.summary !== '2 de 16 tipos identificados.' ||
      conhecido.emptyVisible ||
      !rato.includes('25 derrotas') ||
      !rato.includes('Estudado') ||
      !rato.includes('Elemento') ||
      rato.includes('Vida') ||
      !chefe.includes('Dominado') ||
      !chefe.includes('Vida') ||
      !desconhecido.includes('Tipo desconhecido · 0 derrotas · Desconhecido') ||
      desconhecido.includes('Rato Podre')
    ) {
      errors.push(`REFÚGIO: tiers ou revelações do bestiário não respeitaram o view-model — ${JSON.stringify({ conhecido, rato, chefe, desconhecido })}`);
    }
    if (pageErrors.length) errors.push(`REFÚGIO: bestiário gerou erro de página — ${pageErrors.join(' · ')}`);
  } catch (error) {
    errors.push(`REFÚGIO: não consegui medir o bestiário — ${error.message}`);
  } finally {
    await context.close();
  }
}

await medirBestiarioDoRefugio();

// P3D-05: a composição usa somente a recompensa que o domínio recompõe para
// o dia UTC. O segundo clique e a recarga consultam o storage já marcado,
// provando que o botão não duplica ouro nem poções fora de uma run.
async function medirContratosDoRefugio() {
  const context = await browser.createBrowserContext();
  const refuge = await newSmokePage(context);
  const pageErrors = [];
  refuge.on('pageerror', error => pageErrors.push(error.message));
  await refuge.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
  const day = new Date().toISOString().slice(0, 10);
  const contracts = generateDailyContracts(DAILY_CONTRACT_SEED, day);
  const first = contracts[0];
  const save = {
    v: 4,
    voc: 'knight',
    name: 'Cobrador',
    totalXp: 0,
    level: 1,
    xp: 0,
    gold: 17,
    floor: 6,
    potions: { hp: 2, mp: 3 },
    items: [],
    bestiary: { kills: {} },
    contracts: {
      day,
      progress: { [first.id]: first.objective.amount },
      claimed: [],
    },
  };

  try {
    await refuge.evaluateOnNewDocument((nextSave) => {
      if (!localStorage.getItem('sf-save-knight'))
        localStorage.setItem('sf-save-knight', JSON.stringify(nextSave));
    }, save);
    await openSmokePage(refuge);
    await refuge.click('#btnRefugeMenu');
    const before = await refuge.evaluate(() => ({
      summary: document.getElementById('refugeContractsSummary').textContent.trim(),
      empty: !document.getElementById('refugeContractsEmpty').classList.contains('hidden'),
      entries: [...document.querySelectorAll('#refugeContractsList > li')].map(entry => ({
        text: entry.textContent.trim(),
        action: entry.querySelector('button')?.textContent.trim(),
        disabled: entry.querySelector('button')?.disabled,
      })),
    }));
    await refuge.click(`#refugeContractsList button[data-contract-id="${first.id}"]`);
    const afterClaim = await refuge.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('sf-save-knight'));
      const action = document.querySelector('#refugeContractsList button');
      return { save, action: action?.textContent.trim(), disabled: action?.disabled };
    });
    await refuge.evaluate(() => document.querySelector('#refugeContractsList button')?.click());
    const afterSecondClick = await refuge.evaluate(() => localStorage.getItem('sf-save-knight'));
    await refuge.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    await refuge.click('#btnRefugeMenu');
    const afterReload = await refuge.evaluate(() => ({
      save: JSON.parse(localStorage.getItem('sf-save-knight')),
      action: document.querySelector('#refugeContractsList button')?.textContent.trim(),
      disabled: document.querySelector('#refugeContractsList button')?.disabled,
    }));
    const potionKind = first.reward.potion.kind;
    const expectedPotions = Math.min(8, save.potions[potionKind] + first.reward.potion.amount);
    if (
      before.summary !== `Contratos de ${day}.` ||
      before.empty ||
      before.entries.length !== 3 ||
      !before.entries[0].text.includes(`${first.objective.amount} de ${first.objective.amount} derrotas`) ||
      before.entries[0].action !== 'Resgatar recompensa' ||
      before.entries[0].disabled ||
      afterClaim.save.gold !== save.gold + first.reward.gold ||
      afterClaim.save.potions[potionKind] !== expectedPotions ||
      JSON.stringify(afterClaim.save.contracts.claimed) !== JSON.stringify([first.id]) ||
      afterClaim.action !== 'Resgatado' ||
      !afterClaim.disabled ||
      afterSecondClick !== JSON.stringify(afterClaim.save) ||
      afterReload.save.gold !== afterClaim.save.gold ||
      afterReload.save.potions[potionKind] !== afterClaim.save.potions[potionKind] ||
      JSON.stringify(afterReload.save.contracts) !== JSON.stringify(afterClaim.save.contracts) ||
      afterReload.action !== 'Resgatado' ||
      !afterReload.disabled
    ) {
      errors.push(`REFÚGIO: contratos não exibiram ou resgataram de forma idempotente — ${JSON.stringify({ before, afterClaim, afterReload })}`);
    }
    if (pageErrors.length) errors.push(`REFÚGIO: contratos geraram erro de página — ${pageErrors.join(' · ')}`);
  } catch (error) {
    errors.push(`REFÚGIO: não consegui medir contratos — ${error.message}`);
  } finally {
    await context.close();
  }
}

await medirContratosDoRefugio();

// P3D-10: os três painéis do Refúgio são projeções do mesmo save durável. O
// cenário grava o resgate pela ação real da interface e só então recarrega a
// página; assim não confunde nós ainda vivos no DOM com estado restaurado do
// localStorage.
async function medirReloadDoRefugio() {
  const context = await browser.createBrowserContext();
  const refuge = await newSmokePage(context);
  const pageErrors = [];
  refuge.on('pageerror', error => pageErrors.push(error.message));
  await refuge.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
  const day = new Date().toISOString().slice(0, 10);
  const contracts = generateDailyContracts(DAILY_CONTRACT_SEED, day);
  const first = contracts[0];
  const save = {
    v: 4,
    voc: 'knight',
    name: 'Memorialista',
    totalXp: 0,
    level: 1,
    xp: 0,
    gold: 17,
    floor: 11,
    potions: { hp: 2, mp: 3 },
    items: [],
    bestiary: { kills: { rat: 25, ferumbras: 100 } },
    contracts: {
      day,
      progress: { [first.id]: first.objective.amount },
      claimed: [],
    },
  };

  const snapshot = () => refuge.evaluate(() => {
    const contractRows = [...document.querySelectorAll('#refugeContractsList > li')].map(item => {
      const action = item.querySelector('button');
      return {
        id: action?.dataset.contractId ?? '',
        text: item.textContent.trim(),
        action: action?.textContent.trim() ?? '',
        disabled: !!action?.disabled,
      };
    });
    return {
      checkpoint: {
        personal: document.getElementById('refugePersonalCheckpoint').textContent.trim(),
        selected: document.getElementById('refugeSelectedCheckpoint').textContent.trim(),
        hint: document.getElementById('refugeCheckpointHint').textContent.trim(),
      },
      bestiary: {
        summary: document.getElementById('refugeBestiarySummary').textContent.trim(),
        rows: [...document.querySelectorAll('#refugeBestiaryList > li')].map(row => row.textContent.trim()),
      },
      contracts: {
        summary: document.getElementById('refugeContractsSummary').textContent.trim(),
        rows: contractRows,
      },
      persisted: JSON.parse(localStorage.getItem('sf-save-knight')),
    };
  });

  try {
    await refuge.evaluateOnNewDocument((nextSave) => {
      if (!localStorage.getItem('sf-save-knight'))
        localStorage.setItem('sf-save-knight', JSON.stringify(nextSave));
    }, save);
    await openSmokePage(refuge);
    await refuge.click('#btnRefugeMenu');
    const beforeClaim = await snapshot();
    await refuge.click(`#refugeContractsList button[data-contract-id="${first.id}"]`);
    const beforeReload = await snapshot();

    await refuge.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    await refuge.click('#btnRefugeMenu');
    const afterReload = await snapshot();
    const firstBefore = beforeClaim.contracts.rows.find(row => row.id === first.id);
    const firstSaved = beforeReload.contracts.rows.find(row => row.id === first.id);
    const firstRestored = afterReload.contracts.rows.find(row => row.id === first.id);
    const ratBefore = beforeClaim.bestiary.rows.find(row => row.startsWith('Rato Podre')) || '';
    const bossBefore = beforeClaim.bestiary.rows.find(row => row.includes('100 derrotas')) || '';
    const expectedPotion = Math.min(8, save.potions[first.reward.potion.kind] + first.reward.potion.amount);
    const restored =
      afterReload.checkpoint.personal === 'Andar 10' &&
      afterReload.checkpoint.selected === 'Andar 10' &&
      afterReload.checkpoint.hint === 'A próxima run solo usará o andar 10.' &&
      afterReload.bestiary.summary === '2 de 16 tipos identificados.' &&
      JSON.stringify(afterReload.bestiary.rows) === JSON.stringify(beforeReload.bestiary.rows) &&
      afterReload.contracts.summary === `Contratos de ${day}.` &&
      JSON.stringify(afterReload.contracts.rows) === JSON.stringify(beforeReload.contracts.rows) &&
      JSON.stringify(afterReload.persisted) === JSON.stringify(beforeReload.persisted);
    if (
      beforeClaim.checkpoint.personal !== 'Andar 10' ||
      beforeClaim.checkpoint.selected !== 'Andar 10' ||
      !ratBefore.includes('25 derrotas') || !ratBefore.includes('Estudado') ||
      !bossBefore.includes('Dominado') ||
      firstBefore?.action !== 'Resgatar recompensa' || firstBefore.disabled ||
      firstSaved?.action !== 'Resgatado' || !firstSaved.disabled ||
      beforeReload.persisted.floor !== 11 ||
      beforeReload.persisted.bestiary?.kills?.rat !== 25 ||
      beforeReload.persisted.bestiary?.kills?.ferumbras !== 100 ||
      JSON.stringify(beforeReload.persisted.contracts?.claimed) !== JSON.stringify([first.id]) ||
      beforeReload.persisted.gold !== save.gold + first.reward.gold ||
      beforeReload.persisted.potions?.[first.reward.potion.kind] !== expectedPotion ||
      firstRestored?.action !== 'Resgatado' || !firstRestored.disabled ||
      !restored
    ) {
      errors.push(`REFÚGIO: reload não restaurou checkpoint, bestiário e contrato resgatado — ${JSON.stringify({ beforeClaim, beforeReload, afterReload })}`);
    }
    if (pageErrors.length) errors.push(`REFÚGIO: reload gerou erro de página — ${pageErrors.join(' · ')}`);
  } catch (error) {
    errors.push(`REFÚGIO: não consegui medir reload — ${error.message}`);
  } finally {
    await context.close();
  }
}

await medirReloadDoRefugio();

// P3D-06: o Refúgio é uma tela de consulta entre runs. A abertura anuncia o
// contexto pelo título, Tab percorre somente ações disponíveis na ordem do DOM
// e Escape/Voltar devolvem o foco ao botão que abriu a tela, sem criar trap.
async function medirAcessibilidadeDoRefugio() {
  const context = await browser.createBrowserContext();
  const refuge = await newSmokePage(context);
  const pageErrors = [];
  refuge.on('pageerror', error => pageErrors.push(error.message));
  await refuge.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
  const day = new Date().toISOString().slice(0, 10);
  const contracts = generateDailyContracts(DAILY_CONTRACT_SEED, day);
  const first = contracts[0];
  const save = {
    v: 4,
    voc: 'knight',
    name: 'Tecladista',
    totalXp: 0,
    level: 1,
    xp: 0,
    gold: 0,
    floor: 4,
    potions: { hp: 4, mp: 4 },
    items: [],
    bestiary: { kills: {} },
    contracts: { day, progress: { [first.id]: first.objective.amount }, claimed: [] },
  };

  try {
    await refuge.evaluateOnNewDocument((nextSave) => {
      localStorage.setItem('sf-save-knight', JSON.stringify(nextSave));
    }, save);
    await openSmokePage(refuge);
    await refuge.focus('#btnRefugeMenu');
    await refuge.keyboard.press('Enter');
    const opened = await refuge.evaluate(() => {
      const screen = document.getElementById('refuge');
      const title = document.getElementById('refugeTitle');
      title.focus({ focusVisible: true });
      const css = getComputedStyle(title);
      return {
        visible: !screen.classList.contains('hidden'),
        active: document.activeElement?.id,
        labelledBy: screen.getAttribute('aria-labelledby'),
        describedBy: screen.getAttribute('aria-describedby'),
        titleTabIndex: title.tabIndex,
        headings: [...screen.querySelectorAll('h1, h2')].map(node => node.textContent.trim()),
        checkpointText: document.querySelector('.refuge-checkpoints').textContent.trim(),
        contractText: document.querySelector('#refugeContractsList').textContent.trim(),
        status: {
          role: document.getElementById('refugeContractsStatus').getAttribute('role'),
          live: document.getElementById('refugeContractsStatus').getAttribute('aria-live'),
          atomic: document.getElementById('refugeContractsStatus').getAttribute('aria-atomic'),
        },
        focus: { outline: css.outlineStyle, width: parseFloat(css.outlineWidth), shadow: css.boxShadow },
      };
    });
    await refuge.keyboard.press('Tab');
    const firstTab = await refuge.evaluate(() => ({
      id: document.activeElement?.id,
      contractId: document.activeElement?.dataset?.contractId,
    }));
    await refuge.keyboard.press('Tab');
    const secondTab = await refuge.evaluate(() => document.activeElement?.id);
    await refuge.keyboard.press('Escape');
    const escaped = await refuge.evaluate(() => ({
      refugeHidden: document.getElementById('refuge').classList.contains('hidden'),
      menuVisible: !document.getElementById('menu').classList.contains('hidden'),
      active: document.activeElement?.id,
    }));
    await refuge.keyboard.press('Enter');
    await refuge.click('#btnLeaveRefuge');
    const returned = await refuge.evaluate(() => ({
      refugeHidden: document.getElementById('refuge').classList.contains('hidden'),
      active: document.activeElement?.id,
    }));
    const hasVisibleFocus = !((opened.focus.outline === 'none' || opened.focus.width < 1) && opened.focus.shadow === 'none');
    const textNotOnlyColor =
      opened.checkpointText.includes('Maior checkpoint pessoal') &&
      opened.checkpointText.includes('Próxima run') &&
      opened.contractText.includes('Concluído') &&
      opened.contractText.includes('Recompensa:') &&
      opened.contractText.includes('Resgatar recompensa');
    if (
      !opened.visible ||
      opened.active !== 'refugeTitle' ||
      opened.labelledBy !== 'refugeTitle' ||
      opened.describedBy !== 'refugeSubtitle' ||
      opened.titleTabIndex !== -1 ||
      !opened.headings.includes('Checkpoints') ||
      !opened.headings.includes('Bestiário') ||
      !opened.headings.includes('Contratos diários') ||
      opened.status.role !== 'status' || opened.status.live !== 'polite' || opened.status.atomic !== 'true' ||
      !hasVisibleFocus ||
      firstTab.contractId !== first.id ||
      secondTab !== 'btnLeaveRefuge' ||
      !escaped.refugeHidden || !escaped.menuVisible || escaped.active !== 'btnRefugeMenu' ||
      !returned.refugeHidden || returned.active !== 'btnRefugeMenu' ||
      !textNotOnlyColor
    ) {
      errors.push(`REFÚGIO: teclado ou acessibilidade fora do contrato — ${JSON.stringify({ opened, firstTab, secondTab, escaped, returned, textNotOnlyColor })}`);
    }
    if (pageErrors.length) errors.push(`REFÚGIO: teclado gerou erro de página — ${pageErrors.join(' · ')}`);
  } catch (error) {
    errors.push(`REFÚGIO: não consegui medir teclado e acessibilidade — ${error.message}`);
  } finally {
    await context.close();
  }
}

await medirAcessibilidadeDoRefugio();

// P3D-07: a tela inicial do Refúgio inclui as dezesseis entradas ainda
// desconhecidas e os três contratos do dia. Em 1440x900 essa composição comum
// precisa caber inteira, sem converter o canvas fixo em scroll global nem
// deixar painéis se atravessarem; o bestiário detalhado continua podendo rolar
// dentro da própria tela quando houver conteúdo excepcionalmente longo.
async function medirLayoutDesktopDoRefugio() {
  const context = await browser.createBrowserContext();
  const refuge = await newSmokePage(context);
  const pageErrors = [];
  refuge.on('pageerror', error => pageErrors.push(error.message));
  await refuge.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const save = {
    v: 4,
    voc: 'knight',
    name: 'Cartógrafo',
    totalXp: 0,
    level: 1,
    xp: 0,
    gold: 0,
    floor: 1,
    potions: { hp: 8, mp: 6 },
    items: [],
    bestiary: { kills: {} },
    contracts: null,
  };

  try {
    await refuge.evaluateOnNewDocument((nextSave) => {
      localStorage.setItem('sf-save-knight', JSON.stringify(nextSave));
    }, save);
    await openSmokePage(refuge);
    await refuge.click('#btnRefugeMenu');
    await refuge.screenshot({ path: `${OUT}/29-refugio-desktop-1440x900.png` });
    const layout = await refuge.evaluate(() => {
      const screen = document.getElementById('refuge');
      const box = (node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      };
      const blocks = [...document.querySelectorAll('#refuge > .menu-inner > *')].map(box);
      const overlaps = [];
      for (let a = 0; a < blocks.length; a++) {
        for (let b = a + 1; b < blocks.length; b++) {
          if (
            Math.max(blocks[a].left, blocks[b].left) < Math.min(blocks[a].right, blocks[b].right) &&
            Math.max(blocks[a].top, blocks[b].top) < Math.min(blocks[a].bottom, blocks[b].bottom)
          ) {
            overlaps.push([a, b]);
          }
        }
      }
      const back = box(document.getElementById('btnLeaveRefuge'));
      return {
        screen: { scrollHeight: screen.scrollHeight, clientHeight: screen.clientHeight },
        document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
        viewport: { width: innerWidth, height: innerHeight },
        blocks,
        overlaps,
        back,
      };
    });
    const allInside = layout.blocks.every(block =>
      block.left >= -TOL && block.right <= layout.viewport.width + TOL &&
      block.top >= -TOL && block.bottom <= layout.viewport.height + TOL
    );
    const backReachable =
      layout.back.left >= -TOL && layout.back.right <= layout.viewport.width + TOL &&
      layout.back.top >= -TOL && layout.back.bottom <= layout.viewport.height + TOL;
    if (
      layout.screen.scrollHeight > layout.screen.clientHeight + TOL ||
      layout.document.width > layout.viewport.width + TOL ||
      layout.document.height > layout.viewport.height + TOL ||
      !allInside || !backReachable || layout.overlaps.length
    ) {
      errors.push(`REFÚGIO: layout desktop não cabe sem scroll ou sobreposição — ${JSON.stringify(layout)}`);
    }
    if (pageErrors.length) errors.push(`REFÚGIO: layout desktop gerou erro de página — ${pageErrors.join(' · ')}`);
  } catch (error) {
    errors.push(`REFÚGIO: não consegui medir layout desktop — ${error.message}`);
  } finally {
    await context.close();
  }
}

await medirLayoutDesktopDoRefugio();

// P3D-08: em 390x844 o conteúdo normal do Refúgio excede uma viewport alta,
// então a rolagem precisa ficar explicitamente na própria tela. Os dois
// resgates e Voltar são as únicas ações dessa superfície e devem continuar
// alcançáveis pelo centro de um alvo de toque completo, sem overflow lateral.
async function medirLayoutMobileAltoDoRefugio() {
  const context = await browser.createBrowserContext();
  const refuge = await newSmokePage(context);
  const pageErrors = [];
  refuge.on('pageerror', error => pageErrors.push(error.message));
  await refuge.setViewport(VIEWPORT_MOBILE);
  const day = new Date().toISOString().slice(0, 10);
  const contracts = generateDailyContracts(DAILY_CONTRACT_SEED, day);
  const save = {
    v: 4,
    voc: 'knight',
    name: 'Andarilha',
    totalXp: 0,
    level: 1,
    xp: 0,
    gold: 0,
    floor: 4,
    potions: { hp: 8, mp: 6 },
    items: [],
    bestiary: { kills: {} },
    contracts: { day, progress: {}, claimed: [] },
  };

  try {
    await refuge.evaluateOnNewDocument((nextSave) => {
      localStorage.setItem('sf-save-knight', JSON.stringify(nextSave));
    }, save);
    await openSmokePage(refuge);
    await refuge.click('#btnRefugeMenu');
    await refuge.screenshot({ path: `${OUT}/30-refugio-mobile-390x844-topo.png` });
    const layout = await refuge.evaluate(() => {
      const screen = document.getElementById('refuge');
      const box = (node) => {
        const rect = node.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      const targets = [...document.querySelectorAll('#refugeContractsList button, #btnLeaveRefuge')];
      const top = {
        scrollTop: screen.scrollTop,
        scrollHeight: screen.scrollHeight,
        clientHeight: screen.clientHeight,
        scrollWidth: screen.scrollWidth,
        clientWidth: screen.clientWidth,
        overflowX: getComputedStyle(screen).overflowX,
        overflowY: getComputedStyle(screen).overflowY,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        targets: targets.map(box),
      };
      screen.scrollTop = screen.scrollHeight;
      const bottom = {
        scrollTop: screen.scrollTop,
        maxScrollTop: screen.scrollHeight - screen.clientHeight,
        back: box(document.getElementById('btnLeaveRefuge')),
      };
      const center = {
        x: bottom.back.left + bottom.back.width / 2,
        y: bottom.back.top + bottom.back.height / 2,
      };
      const hit = document.elementFromPoint(center.x, center.y);
      return {
        top,
        bottom,
        backHit: hit?.id ?? '',
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    await refuge.screenshot({ path: `${OUT}/31-refugio-mobile-390x844-fim.png` });
    const targetsAreTouchable = layout.top.targets.length === contracts.length + 1 &&
      layout.top.targets.every(target => target.width >= ALVO_MIN && target.height >= ALVO_MIN);
    const verticalScrollIsIntentional =
      layout.top.scrollHeight > layout.top.clientHeight + TOL &&
      layout.top.scrollTop === 0 &&
      layout.bottom.scrollTop >= layout.bottom.maxScrollTop - TOL &&
      layout.top.overflowY === 'auto' && layout.top.overflowX === 'hidden';
    const noHorizontalOverflow =
      layout.top.scrollWidth <= layout.top.clientWidth + TOL &&
      layout.top.documentWidth <= layout.viewport.width + TOL;
    const backReachable =
      layout.bottom.back.left >= -TOL && layout.bottom.back.right <= layout.viewport.width + TOL &&
      layout.bottom.back.top >= -TOL && layout.bottom.back.bottom <= layout.viewport.height + TOL &&
      layout.backHit === 'btnLeaveRefuge';
    if (!targetsAreTouchable || !verticalScrollIsIntentional || !noHorizontalOverflow || !backReachable) {
      errors.push(`REFÚGIO: layout mobile alto fora do contrato — ${JSON.stringify(layout)}`);
    }
    if (pageErrors.length) errors.push(`REFÚGIO: layout mobile alto gerou erro de página — ${pageErrors.join(' · ')}`);
  } catch (error) {
    errors.push(`REFÚGIO: não consegui medir layout mobile alto — ${error.message}`);
  } finally {
    await context.close();
  }
}

await medirLayoutMobileAltoDoRefugio();

// P3D-09: 360x640 é a viewport de toque curta do projeto. O conteúdo completo
// não precisa caber de uma vez, mas cada ação precisa entrar por inteiro na
// janela ao usar a rolagem da própria tela ou a navegação por foco; medir só o
// rodapé esconderia um contrato inalcançável no meio da lista longa.
async function medirLayoutMobileCurtoDoRefugio() {
  const context = await browser.createBrowserContext();
  const refuge = await newSmokePage(context);
  const pageErrors = [];
  refuge.on('pageerror', error => pageErrors.push(error.message));
  await refuge.setViewport(VIEWPORT_SMALL);
  const day = new Date().toISOString().slice(0, 10);
  const contracts = generateDailyContracts(DAILY_CONTRACT_SEED, day);
  const progress = Object.fromEntries(contracts.map(contract => [contract.id, contract.objective.amount]));
  const save = {
    v: 4,
    voc: 'knight',
    name: 'Viajante',
    totalXp: 0,
    level: 1,
    xp: 0,
    gold: 0,
    floor: 4,
    potions: { hp: 8, mp: 6 },
    items: [],
    bestiary: { kills: {} },
    contracts: { day, progress, claimed: [] },
  };

  try {
    await refuge.evaluateOnNewDocument((nextSave) => {
      localStorage.setItem('sf-save-knight', JSON.stringify(nextSave));
    }, save);
    await openSmokePage(refuge);
    await refuge.click('#btnRefugeMenu');
    await refuge.screenshot({ path: `${OUT}/32-refugio-mobile-360x640-topo.png` });
    const layout = await refuge.evaluate(() => {
      const screen = document.getElementById('refuge');
      const box = (node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.id || node.dataset.contractId || '',
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      const targets = [...document.querySelectorAll('#refugeContractsList button, #btnLeaveRefuge')];
      const top = {
        scrollTop: screen.scrollTop,
        scrollHeight: screen.scrollHeight,
        clientHeight: screen.clientHeight,
        scrollWidth: screen.scrollWidth,
        clientWidth: screen.clientWidth,
        overflowX: getComputedStyle(screen).overflowX,
        overflowY: getComputedStyle(screen).overflowY,
        documentWidth: document.documentElement.scrollWidth,
      };
      const reachable = targets.map(target => {
        target.focus();
        target.scrollIntoView({ block: 'center' });
        const targetBox = box(target);
        const center = {
          x: targetBox.left + targetBox.width / 2,
          y: targetBox.top + targetBox.height / 2,
        };
        return {
          ...targetBox,
          focused: document.activeElement === target,
          hit: document.elementFromPoint(center.x, center.y)?.id ||
            document.elementFromPoint(center.x, center.y)?.dataset.contractId || '',
        };
      });
      screen.scrollTop = screen.scrollHeight;
      const bottom = {
        scrollTop: screen.scrollTop,
        maxScrollTop: screen.scrollHeight - screen.clientHeight,
        back: box(document.getElementById('btnLeaveRefuge')),
      };
      return {
        top,
        bottom,
        reachable,
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    await refuge.screenshot({ path: `${OUT}/33-refugio-mobile-360x640-fim.png` });
    const controlsTouchAndFocus = layout.reachable.length === contracts.length + 1 &&
      layout.reachable.every(target =>
        target.width >= ALVO_MIN && target.height >= ALVO_MIN && target.focused &&
        target.left >= -TOL && target.right <= layout.viewport.width + TOL &&
        target.top >= -TOL && target.bottom <= layout.viewport.height + TOL &&
        target.hit === target.id
      );
    const intentionalScroll =
      layout.top.scrollHeight > layout.top.clientHeight + TOL &&
      layout.top.scrollTop === 0 &&
      layout.top.overflowY === 'auto' && layout.top.overflowX === 'hidden' &&
      layout.bottom.scrollTop >= layout.bottom.maxScrollTop - TOL;
    const noHorizontalOverflow =
      layout.top.scrollWidth <= layout.top.clientWidth + TOL &&
      layout.top.documentWidth <= layout.viewport.width + TOL;
    if (!controlsTouchAndFocus || !intentionalScroll || !noHorizontalOverflow) {
      errors.push(`REFÚGIO: layout mobile curto deixou controle inalcançável — ${JSON.stringify(layout)}`);
    }
    if (pageErrors.length) errors.push(`REFÚGIO: layout mobile curto gerou erro de página — ${pageErrors.join(' · ')}`);
  } catch (error) {
    errors.push(`REFÚGIO: não consegui medir layout mobile curto — ${error.message}`);
  } finally {
    await context.close();
  }
}

await medirLayoutMobileCurtoDoRefugio();

async function medirFallbackDeAudio() {
  const context = await browser.createBrowserContext();
  const fallback = await newSmokePage(context);
  const pageErrors = [];
  fallback.on('pageerror', error => pageErrors.push(error.message));
  await fallback.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
  await fallback.evaluateOnNewDocument(() => {
    const probe = { attempts: 0, errors: 0 };
    window.__audioFallback = probe;
    class BrokenAudioContext {
      constructor() {
        probe.attempts++;
        throw new Error('AudioContext indisponível');
      }
    }
    window.AudioContext = BrokenAudioContext;
    window.webkitAudioContext = undefined;
    addEventListener('error', () => { probe.errors++; });
    addEventListener('unhandledrejection', () => { probe.errors++; });
  });
  try {
    await openSmokePage(fallback);
    await fallback.click('.voc-card[data-voc="knight"]');
    await fallback.type('#nameInput', 'Silencioso');
    await fallback.click('#btnSolo');
    await new Promise(resolve => setTimeout(resolve, 400));
    const result = await fallback.evaluate(() => ({
      ...window.__audioFallback,
      started: window.__SF?.started === true,
    }));
    if (result.attempts !== 1 || result.errors !== 0 || !result.started || pageErrors.length) {
      errors.push(`ÁUDIO: fallback não preservou a partida — ${JSON.stringify({ result, pageErrors })}`);
    }
  } catch (error) {
    errors.push(`ÁUDIO: não consegui medir fallback sem Web Audio — ${error.message}`);
  } finally {
    await context.close();
  }
}

await medirFallbackDeAudio();

// escolhe druida e entra sozinho
await page.click('.voc-card[data-voc="druid"]');
await page.type('#nameInput', 'Filipe');
await new Promise((r) => setTimeout(r, 200));
await page.screenshot({ path: `${OUT}/02-menu-voc.png` });

await page.click('#btnSolo');
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${OUT}/03-game-start.png` });

const audioDepoisDasInteracoes = await page.evaluate(() => ({ ...window.__audioProbe }));
if (
  audioAntesDoGesto.contexts !== 0 ||
  audioAntesDoGesto.resumes !== 0 ||
  audioDepoisDasInteracoes.layerCalls !== 1 ||
  audioDepoisDasInteracoes.contexts !== 1 ||
  audioDepoisDasInteracoes.resumes !== 1 ||
  audioDepoisDasInteracoes.tracks !== 2 ||
  audioDepoisDasInteracoes.stoppedTracks !== 0 ||
  audioDepoisDasInteracoes.errors !== 0
) {
  errors.push('ÁUDIO: gesto não destravou uma única vez sem erro — '
    + JSON.stringify({ audioAntesDoGesto, audioDepoisDasInteracoes }));
}

// P1D-10: o mesmo caminho que a pessoa usa para retornar ao menu precisa
// encerrar a fonte atual antes de uma segunda partida criar a próxima. O botão
// só fica visível durante a queda; dispará-lo aqui preserva o handler real sem
// transformar a suíte em uma simulação de rede.
await page.evaluate(() => document.getElementById('btnLeave').click());
await new Promise((r) => setTimeout(r, 200));
const audioDepoisDaSaida = await page.evaluate(() => ({
  ...window.__audioProbe,
  started: window.__SF.started,
}));
await page.click('#btnSolo');
await new Promise((r) => setTimeout(r, 400));
const audioDepoisDeRecriar = await page.evaluate(() => ({
  ...window.__audioProbe,
  started: window.__SF.started,
}));
if (
  audioDepoisDaSaida.started !== false ||
  audioDepoisDaSaida.tracks !== 2 ||
  audioDepoisDaSaida.stoppedTracks !== 2 ||
  audioDepoisDeRecriar.started !== true ||
  audioDepoisDeRecriar.tracks !== 4 ||
  audioDepoisDeRecriar.stoppedTracks !== 2
) {
  errors.push('ÁUDIO: saída e recriação deixaram a fonte de sessão inconsistente — '
    + JSON.stringify({ audioDepoisDaSaida, audioDepoisDeRecriar }));
}

// P1D-12: a etapa só declara o contrato do DOM. O comportamento fica para as
// próximas etapas, mas a marcação precisa nascer no jogo, fechada e navegável.
const controlesDeAudio = await page.evaluate(() => {
  const game = document.getElementById('game');
  const panel = document.getElementById('audioPanel');
  const chip = document.getElementById('audioChip');
  const music = document.getElementById('audioMusic');
  const sfx = document.getElementById('audioSfx');
  const mute = document.getElementById('btnAudioMute');
  const close = document.getElementById('btnCloseAudio');
  return {
    withinGame: !!game && !!panel && game.contains(panel) && game.contains(chip),
    hidden: panel?.classList.contains('hidden'),
    chip: chip && {
      type: chip.type,
      label: chip.getAttribute('aria-label'),
      controls: chip.getAttribute('aria-controls'),
      expanded: chip.getAttribute('aria-expanded'),
    },
    music: music && { type: music.type, min: music.min, max: music.max, step: music.step, value: music.value },
    sfx: sfx && { type: sfx.type, min: sfx.min, max: sfx.max, step: sfx.step, value: sfx.value },
    mute: mute && { text: mute.textContent, pressed: mute.getAttribute('aria-pressed') },
    close: close?.getAttribute('aria-label'),
    labels: ['audioMusic', 'audioSfx'].every(id => document.querySelector(`label[for="${id}"]`)),
  };
});
if (
  !controlesDeAudio.withinGame ||
  !controlesDeAudio.hidden ||
  controlesDeAudio.chip?.type !== 'button' ||
  controlesDeAudio.chip?.label !== 'Abrir controles de áudio' ||
  controlesDeAudio.chip?.controls !== 'audioPanel' ||
  controlesDeAudio.chip?.expanded !== 'false' ||
  JSON.stringify(controlesDeAudio.music) !== JSON.stringify({ type: 'range', min: '0', max: '1', step: '0.01', value: '0.5' }) ||
  JSON.stringify(controlesDeAudio.sfx) !== JSON.stringify({ type: 'range', min: '0', max: '1', step: '0.01', value: '0.7' }) ||
  controlesDeAudio.mute?.text !== 'Som ligado' ||
  controlesDeAudio.mute?.pressed !== 'false' ||
  controlesDeAudio.close !== 'Fechar controles de áudio' ||
  !controlesDeAudio.labels
) {
  errors.push('ÁUDIO: marcação inicial dos controles inválida — ' + JSON.stringify(controlesDeAudio));
}

// P1D-14: os controles atualizam a camada já em partida, persistem cada ajuste
// e fecham pelo mesmo estado acessível que o chip abre. O contador de fontes é
// lido antes/depois para garantir que ganho não recria a faixa ambiente.
const controlesAudioAtivos = await page.evaluate(() => ({ tracks: window.__audioProbe.tracks }));
await page.click('#audioChip');
const preferenciasAudioSalvas = await page.evaluate(() => {
  const change = (id, value) => {
    const input = document.getElementById(id);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return JSON.parse(localStorage.getItem('sf-audio'));
  };
  const music = change('audioMusic', '0.23');
  const sfx = change('audioSfx', '0.61');
  document.getElementById('btnAudioMute').click();
  const muted = JSON.parse(localStorage.getItem('sf-audio'));
  return { music, sfx, muted };
});
const controlesAudioDepois = await page.evaluate(() => {
  const panel = document.getElementById('audioPanel');
  const chip = document.getElementById('audioChip');
  const mute = document.getElementById('btnAudioMute');
  return {
    tracks: window.__audioProbe.tracks,
    panelHidden: panel.classList.contains('hidden'),
    expanded: chip.getAttribute('aria-expanded'),
    music: document.getElementById('audioMusic').value,
    sfx: document.getElementById('audioSfx').value,
    mute: { text: mute.textContent, pressed: mute.getAttribute('aria-pressed') },
    saved: JSON.parse(localStorage.getItem('sf-audio')),
  };
});
await page.click('#btnCloseAudio');
const controlesAudioFechados = await page.evaluate(() => ({
  hidden: document.getElementById('audioPanel').classList.contains('hidden'),
  expanded: document.getElementById('audioChip').getAttribute('aria-expanded'),
}));
if (
  controlesAudioDepois.tracks !== controlesAudioAtivos.tracks ||
  controlesAudioDepois.panelHidden ||
  controlesAudioDepois.expanded !== 'true' ||
  controlesAudioDepois.music !== '0.23' ||
  controlesAudioDepois.sfx !== '0.61' ||
  controlesAudioDepois.mute.text !== 'Som desligado' ||
  controlesAudioDepois.mute.pressed !== 'true' ||
  JSON.stringify(preferenciasAudioSalvas.music) !== JSON.stringify({ v: 1, muted: false, music: 0.23, sfx: 0.7 }) ||
  JSON.stringify(preferenciasAudioSalvas.sfx) !== JSON.stringify({ v: 1, muted: false, music: 0.23, sfx: 0.61 }) ||
  JSON.stringify(preferenciasAudioSalvas.muted) !== JSON.stringify({ v: 1, muted: true, music: 0.23, sfx: 0.61 }) ||
  JSON.stringify(controlesAudioDepois.saved) !== JSON.stringify({ v: 1, muted: true, music: 0.23, sfx: 0.61 }) ||
  !controlesAudioFechados.hidden ||
  controlesAudioFechados.expanded !== 'false'
) {
  errors.push('ÁUDIO: controles não atualizaram ganhos, painel ou persistência — '
    + JSON.stringify({ controlesAudioAtivos, preferenciasAudioSalvas, controlesAudioDepois, controlesAudioFechados }));
}

// P1D-15: M alterna o mudo pelo mesmo caminho do controle, mas campos de
// formulário, chat e qualquer combinação de modificador mantêm a tecla livre.
await page.keyboard.press('m');
const atalhoMDesmutado = await page.evaluate(() => {
  const mute = document.getElementById('btnAudioMute');
  return {
    text: mute.textContent,
    pressed: mute.getAttribute('aria-pressed'),
    saved: JSON.parse(localStorage.getItem('sf-audio')),
  };
});
await page.keyboard.press('m');
const atalhoMMutado = await page.evaluate(() => {
  const mute = document.getElementById('btnAudioMute');
  return {
    text: mute.textContent,
    pressed: mute.getAttribute('aria-pressed'),
    saved: JSON.parse(localStorage.getItem('sf-audio')),
  };
});

await page.click('#audioChip');
await page.focus('#audioMusic');
await page.keyboard.press('m');
const atalhoMNoRange = await page.evaluate(() => ({
  active: document.activeElement?.id,
  pressed: document.getElementById('btnAudioMute').getAttribute('aria-pressed'),
  saved: JSON.parse(localStorage.getItem('sf-audio')),
}));

await page.click('#btnCloseAudio');
await page.click('#canvas');
await page.keyboard.press('Enter');
await page.keyboard.press('m');
const atalhoMNoChat = await page.evaluate(() => ({
  chatting: window.__SF.chatting,
  value: document.getElementById('chatInput')?.value,
  pressed: document.getElementById('btnAudioMute').getAttribute('aria-pressed'),
  saved: JSON.parse(localStorage.getItem('sf-audio')),
}));
await page.keyboard.press('Escape');
const chatFechadoPeloEscape = await page.evaluate(() => window.__SF.chatting);

await page.click('#canvas');
for (const modifier of ['Control', 'Alt', 'Meta', 'Shift']) {
  await page.keyboard.down(modifier);
  await page.keyboard.press('m');
  await page.keyboard.up(modifier);
}
const atalhoMComModificadores = await page.evaluate(() => ({
  pressed: document.getElementById('btnAudioMute').getAttribute('aria-pressed'),
  saved: JSON.parse(localStorage.getItem('sf-audio')),
}));
const audioMudoSalvo = { v: 1, muted: true, music: 0.23, sfx: 0.61 };
if (
  atalhoMDesmutado.text !== 'Som ligado' ||
  atalhoMDesmutado.pressed !== 'false' ||
  JSON.stringify(atalhoMDesmutado.saved) !== JSON.stringify({ ...audioMudoSalvo, muted: false }) ||
  atalhoMMutado.text !== 'Som desligado' ||
  atalhoMMutado.pressed !== 'true' ||
  JSON.stringify(atalhoMMutado.saved) !== JSON.stringify(audioMudoSalvo) ||
  atalhoMNoRange.active !== 'audioMusic' ||
  atalhoMNoRange.pressed !== 'true' ||
  JSON.stringify(atalhoMNoRange.saved) !== JSON.stringify(audioMudoSalvo) ||
  !atalhoMNoChat.chatting ||
  atalhoMNoChat.value !== 'm' ||
  atalhoMNoChat.pressed !== 'true' ||
  JSON.stringify(atalhoMNoChat.saved) !== JSON.stringify(audioMudoSalvo) ||
  chatFechadoPeloEscape ||
  atalhoMComModificadores.pressed !== 'true' ||
  JSON.stringify(atalhoMComModificadores.saved) !== JSON.stringify(audioMudoSalvo)
) {
  errors.push('ÁUDIO: atalho M não respeitou mudo, foco editável ou modificadores — '
    + JSON.stringify({
      atalhoMDesmutado,
      atalhoMMutado,
      atalhoMNoRange,
      atalhoMNoChat,
      chatFechadoPeloEscape,
      atalhoMComModificadores,
  }));
}

await medirIndicadorConexao(page, '1440x860');

// P1D-11: o simulador já usa `pendingEvents` como fronteira entre o estado puro
// e a composição. Injetar o lote ali mantém o caminho real hostTick →
// applyEvent → áudio, inclusive os retornos precoces que não têm FX na tela.
async function entregarEventoDeAudio(ev, minTracks) {
  await page.evaluate((evento) => window.__SF.G.pendingEvents.push(evento), ev);
  await page.waitForFunction((minimo) => window.__audioProbe.tracks >= minimo, { timeout: 5000 }, minTracks);
}

const baseAudioEventos = await page.evaluate(() => ({ ...window.__audioProbe }));
try {
  await entregarEventoDeAudio({ t: 'bossEngage', hardcore: 1, boss: 1 }, baseAudioEventos.tracks + 2);
  await entregarEventoDeAudio({ t: 'fx', k: 'death', boss: 1, x: 0, y: 0, c: '#fff' }, baseAudioEventos.tracks + 4);
  await entregarEventoDeAudio({ t: 'bossEngage', hardcore: 1, boss: 1 }, baseAudioEventos.tracks + 6);
  await page.evaluate(() => { window.__SF.G.pendingFloor = true; });
  await page.waitForFunction((minimo) => window.__audioProbe.tracks >= minimo, { timeout: 5000 }, baseAudioEventos.tracks + 8);
  await entregarEventoDeAudio({ t: 'bossEngage', hardcore: 1, boss: 1 }, baseAudioEventos.tracks + 10);
  await entregarEventoDeAudio({ t: 'bossDisengage', hardcore: 1, boss: 1 }, baseAudioEventos.tracks + 12);
  const audioDepoisDosEventos = await page.evaluate(() => ({ ...window.__audioProbe }));
  if (audioDepoisDosEventos.stoppedTracks < baseAudioEventos.stoppedTracks + 12) {
    errors.push('ÁUDIO: luta não retornou à ambiente pelos quatro fins — '
      + JSON.stringify({ baseAudioEventos, audioDepoisDosEventos }));
  }
} catch (error) {
  errors.push(`ÁUDIO: não consegui atravessar os eventos de luta pela composição — ${error.message}`);
}

// anda um pouco e ataca
for (const key of ['KeyD', 'KeyS']) {
  await page.keyboard.down(key);
  await new Promise((r) => setTimeout(r, 900));
  await page.keyboard.up(key);
}
await page.mouse.move(900, 400);
for (const k of ['1', '2', '3', '4']) {
  await page.keyboard.press(`Digit${k}`);
  await new Promise((r) => setTimeout(r, 350));
}
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/04-combat.png` });

// teleporta o jogador para perto de um monstro para forçar combate real
const combat = await page.evaluate(async () => {
  const S = window.__SF;
  if (!S) return { error: 'estado não exposto' };
  const G = S.G;
  const p = G.players.host;
  const m = G.monsters.find((x) => x.hp > 0 && !x.isBoss);
  if (!m) return { error: 'sem monstros' };
  p.x = m.x + 1.2; p.y = m.y;
  await new Promise((r) => setTimeout(r, 2500));
  return {
    monstersAlive: G.monsters.filter((x) => x.hp > 0).length,
    playerHp: Math.round(p.hp),
    dmgDone: Math.round(p.dmgDone),
    gold: p.gold,
    items: G.items.length,
    fx: window.__FX ? window.__FX.particles.length : -1,
  };
});
await page.screenshot({ path: `${OUT}/05-fight.png` });

// mochila
await page.keyboard.press('Tab');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `${OUT}/06-bag.png` });
await page.keyboard.press('Escape');

// mata o chefe para checar portal e troca de andar
const floorTest = await page.evaluate(async () => {
  const S = window.__SF;
  const G = S.G;
  const boss = G.monsters.find((m) => m.isBoss);
  if (boss) boss.hp = 0;
  await new Promise((r) => setTimeout(r, 600));
  const portal = G.portalOpen;
  const p = G.players.host;
  p.x = G.map.portal.x + 0.5;
  p.y = G.map.portal.y + 0.5;
  await new Promise((r) => setTimeout(r, 2400));
  return { portal, floor: G.floor, monsters: G.monsters.length };
});
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/07-floor2.png` });

// UI-02: em andar múltiplo de 3 a barra do chefe tem de dizer HARDCORE por
// texto, não por cor. É a única asserção da SPEC que só o navegador fecha —
// tests/sim.test.mjs cobre bossBarLabel(), mas não o texto real do #bossName.
const hardcore = await page.evaluate(async () => {
  const G = window.__SF.G;
  // Desce pelo mesmo gatilho do jogo: main.js consome pendingFloor e chama
  // nextFloor(). Nada de fabricar estado que a partida real não produziria.
  let guarda = 0;
  while (G.floor % 3 !== 0 && guarda++ < 6) {
    G.pendingFloor = true;
    await new Promise((r) => setTimeout(r, 500));
  }
  const boss = G.monsters.find((m) => m.isBoss && m.hp > 0);
  if (!boss) return { error: 'sem chefe no andar' };
  // A barra só aparece com o chefe a menos de 18 tiles do jogador local.
  const p = G.players.host;
  p.x = boss.x + 2; p.y = boss.y + 2;
  await new Promise((r) => setTimeout(r, 700));
  const bar = document.getElementById('bossBar');
  return {
    floor: G.floor,
    hardcore: !!boss.hardcore,
    barVisivel: !bar.classList.contains('hidden'),
    bossName: document.getElementById('bossName').textContent,
  };
});
await page.screenshot({ path: `${OUT}/10-boss-hardcore.png` });
if (hardcore.error) errors.push('HARDCORE: ' + hardcore.error);
else {
  if (hardcore.floor % 3 !== 0) errors.push(`HARDCORE: não chegou a andar múltiplo de 3 (andar ${hardcore.floor})`);
  if (!hardcore.hardcore) errors.push(`HARDCORE: o chefe do andar ${hardcore.floor} não veio marcado`);
  if (!hardcore.barVisivel) errors.push('HARDCORE: a barra do chefe não apareceu');
  if (!/HARDCORE/.test(hardcore.bossName)) errors.push(`HARDCORE: #bossName sem o termo — "${hardcore.bossName}"`);
}

const fps = await page.evaluate(() => new Promise((res) => {
  let frames = 0;
  const t0 = performance.now();
  const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(frames / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(tick);
}));

// ============================================================
// CONTEXTOS DE TOQUE — 390x844 e 360x640, os dois de UI-01, UI-02 e UI-03.
// Aqui só entra o que a partida solo alcança: #menu, #actionBar, seus slots e o
// #bag. O que exige sala de verdade (#roster, #crewChip, #lobby) é medido por
// tests/multipeer.mjs.
// ============================================================

// Gutter de painel praticado em styles.css:161 e styles.css:372; a altura útil
// de UI-04 é innerHeight menos ele duas vezes.
const GUTTER = 12;

// P2-05 roda as mesmas transições puras que a composição usa, mas entrega cada
// mudança ao renderizador do HUD real. Assim não forja mensagem PeerJS nem cria
// uma porta de depuração de produção só para o browser medir o DOM acessível.
async function medirIndicadorConexao(page, ctx) {
  const m = await page.evaluate(async () => {
    const [connection, ui, balance] = await Promise.all([
      import(new URL('js/connection.js', location.href).href),
      import(new URL('js/ui.js', location.href).href),
      import(new URL('js/balance.js', location.href).href),
    ]);
    const indicator = document.getElementById('connectionIndicator');
    const ler = (state) => ({
      state: { ...state },
      className: indicator.className,
      title: document.getElementById('connectionState').textContent,
      text: document.getElementById('connectionText').textContent,
      latency: document.getElementById('connectionLatency').textContent,
      latencyHidden: document.getElementById('connectionLatency').classList.contains('hidden'),
      icon: indicator.querySelector('.connection-indicator-icon').textContent,
      ariaLabel: indicator.getAttribute('aria-label'),
      role: indicator.getAttribute('role'),
      live: indicator.getAttribute('aria-live'),
      atomic: indicator.getAttribute('aria-atomic'),
      iconHidden: indicator.querySelector('.connection-indicator-icon').getAttribute('aria-hidden'),
    });
    const signal = (state, type, latencyMs) => connection.applyConnectionSignal(
      state,
      latencyMs == null ? { type } : { type, latencyMs },
      ui.renderConnectionIndicator
    );

    let state = connection.createConnectionState();
    ui.renderConnectionIndicator(state);
    const connecting = ler(state);

    state = signal(state, connection.ConnectionSignal.OPENING);
    state = signal(state, connection.ConnectionSignal.OPEN);
    state = signal(state, connection.ConnectionSignal.ACK, 47.6);
    const stable = ler(state);

    for (let i = 0; i < balance.CONNECTION_UNSTABLE_ACK_WINDOW - 1; i++) {
      state = signal(state, connection.ConnectionSignal.ACK, balance.CONNECTION_UNSTABLE_RTT_MS);
    }
    const beforeUnstable = ler(state);
    state = signal(state, connection.ConnectionSignal.ACK, balance.CONNECTION_UNSTABLE_RTT_MS);
    const unstable = ler(state);
    state = signal(state, connection.ConnectionSignal.ACK, balance.CONNECTION_UNSTABLE_RTT_MS - 1);
    const unstableMiddle = ler(state);
    state = signal(state, connection.ConnectionSignal.LOST);
    const reconnecting = ler(state);

    state = signal(state, connection.ConnectionSignal.REJOINED);
    for (let i = 0; i < balance.CONNECTION_UNSTABLE_ACK_WINDOW; i++) {
      state = signal(state, connection.ConnectionSignal.ACK, balance.CONNECTION_UNSTABLE_RTT_MS);
    }
    for (let i = 0; i < balance.CONNECTION_RECOVERY_ACK_WINDOW - 1; i++) {
      state = signal(state, connection.ConnectionSignal.ACK, balance.CONNECTION_RECOVERY_RTT_MS);
    }
    const recoveryPending = ler(state);
    state = signal(state, connection.ConnectionSignal.ACK, balance.CONNECTION_RECOVERY_RTT_MS);
    const recovered = ler(state);

    indicator.focus({ focusVisible: true });
    const css = getComputedStyle(indicator);
    const rect = indicator.getBoundingClientRect();
    return {
      connecting, stable, beforeUnstable, unstable, unstableMiddle, reconnecting, recoveryPending, recovered,
      focus: {
        active: document.activeElement === indicator,
        tabIndex: indicator.tabIndex,
        outline: css.outlineStyle,
        outlineWidth: parseFloat(css.outlineWidth),
        shadow: css.boxShadow,
      },
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      innerWidth,
      innerHeight,
      windows: {
        unstable: balance.CONNECTION_UNSTABLE_ACK_WINDOW,
        recovery: balance.CONNECTION_RECOVERY_ACK_WINDOW,
      },
    };
  });

  const states = [m.connecting, m.stable, m.unstable, m.reconnecting];
  const names = states.map(({ title }) => title);
  const semantica = states.every(({ role, live, atomic, iconHidden, ariaLabel, title, text }) =>
    role === 'status' && live === 'polite' && atomic === 'true' && iconHidden === 'true' &&
    ariaLabel.includes(title) && ariaLabel.includes(text)
  );
  const textoDistinto = new Set(names).size === 4 && new Set(states.map(({ text }) => text)).size === 4;
  const classes = [
    [m.connecting, 'is-connecting'],
    [m.stable, 'is-stable'],
    [m.unstable, 'is-unstable'],
    [m.reconnecting, 'is-reconnecting'],
  ].every(([view, classe]) => view.className.includes(classe));
  const rtt =
    m.connecting.latencyHidden && !m.connecting.latency &&
    !m.stable.latencyHidden && m.stable.latency === '≈ 48 ms' &&
    !m.unstable.latencyHidden && m.unstable.latency === '≈ 280 ms' &&
    !m.reconnecting.latencyHidden && m.reconnecting.latency === '≈ 279 ms';
  const hysteresis =
    m.beforeUnstable.state.status === 'stable' &&
    m.beforeUnstable.state.slowAcks === m.windows.unstable - 1 &&
    m.unstable.state.status === 'unstable' &&
    m.unstableMiddle.state.status === 'unstable' &&
    m.unstableMiddle.state.healthyAcks === 0 &&
    m.recoveryPending.state.status === 'unstable' &&
    m.recoveryPending.state.healthyAcks === m.windows.recovery - 1 &&
    m.recovered.state.status === 'stable' &&
    m.recovered.state.healthyAcks === 0;
  const foco = m.focus.active && m.focus.tabIndex === 0 &&
    !((m.focus.outline === 'none' || m.focus.outlineWidth < 1) && m.focus.shadow === 'none');
  const dentroDaTela = m.rect.width > 0 && m.rect.height > 0 &&
    m.rect.left >= -TOL && m.rect.top >= -TOL &&
    m.rect.right <= m.innerWidth + TOL && m.rect.bottom <= m.innerHeight + TOL;
  if (!semantica || !textoDistinto || !classes || !rtt || !hysteresis || !foco || !dentroDaTela) {
    errors.push(`CONEXÃO: ${ctx} indicador sem contrato visual/acessível — ${JSON.stringify(m)}`);
  }
}

// As viewports moram em mobile-helpers.mjs porque tests/multipeer.mjs mede as
// mesmas caixas. O par pequeno é contrato de RF-02a: se o módulo compartilhado
// derivar, este harness passaria medindo duas vezes 390 sem avisar ninguém.
const ALVO_PEQUENO = { width: 360, height: 640 };
if (VIEWPORT_SMALL.width !== ALVO_PEQUENO.width || VIEWPORT_SMALL.height !== ALVO_PEQUENO.height) {
  errors.push(`TOQUE: o contexto pequeno virou ${VIEWPORT_SMALL.width}x${VIEWPORT_SMALL.height},`
    + ` esperado ${ALVO_PEQUENO.width}x${ALVO_PEQUENO.height}`);
}

// RF-01: a zona de UI-03 só é medível se js/balance.js for mesmo a fonte única.
// Contra o código anterior à feature a constante nem existe, a zona vira NaN e
// as asserções de zona passariam caladas — por isso a falta vira erro medido.
errors.push(...errosDeConstante('BARRA'));

// UI-03 AC 3: a borda direita da zona reservada, medida em cada largura, sai no
// relatório final — 259 em 390 e 244 em 360.
const zonas = new Map();

// RF-02 AC 2 compara a linha de abertura dos dois modos de entrada por igualdade
// estrita, e as duas só existem juntas no fim da execução: a de toque nasce no
// laço de viewport, a de mouse na aba de abrirMouse(). Guardar por modo é o que
// permite a comparação sem reabrir aba nenhuma.
const aberturas = new Map();
async function abrirToque(viewport) {
  const ctx = `${viewport.width}x${viewport.height}`;
  const p = await newSmokePage(browser);
  await p.setViewport(viewport);
  await installHelpers(p);
  p.on('pageerror', (e) => errors.push(`PAGEERROR ${ctx}: ${e.message}`));
  await openSmokePage(p);
  await new Promise((r) => setTimeout(r, 600));
  if (!(await p.evaluate(() => matchMedia('(pointer: coarse)').matches))) {
    errors.push(`TOQUE: ${ctx} não ativou "pointer: coarse" — a medição cairia no CSS de desktop`);
  }
  await p.screenshot({ path: `${OUT}/08-mobile-menu-${ctx}.png` });
  await medirMenu(p, ctx);
  await p.click('.voc-card[data-voc="paladin"]');
  await p.click('#btnSolo');
  await new Promise((r) => setTimeout(r, 1800));
  await p.screenshot({ path: `${OUT}/09-mobile-game-${ctx}.png` });
  return p;
}

// UI-06: nem rolagem horizontal, nem descendente fora da viewport, nem rótulo
// de botão truncado. Medido com o #menu ainda na tela — o #lobby, que exige sala
// de verdade, fica com tests/multipeer.mjs. A varredura de UI-01 aproveita a
// mesma visita: o menu é a primeira superfície de toque da partida.
async function medirMenu(page, ctx) {
  const m = await page.evaluate((alvoMin) => {
    const M = window.__M;
    const tela = document.querySelector('.screen:not(.hidden)');
    if (!tela) return { erro: 'nenhuma .screen visível' };
    const fora = [];
    for (const el of tela.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0) continue;
      if (r.left < -0.5 || r.right > innerWidth + 0.5) {
        fora.push(`${M.label(el)} ocupa ${r.left.toFixed(1)}–${r.right.toFixed(1)}`);
      }
    }
    // Encolher o flex item de .menu-actions não pode virar corte de texto: a
    // caixa cabe, mas o rótulo em caixa alta some atrás de um ellipsis.
    const truncados = [];
    for (const el of tela.querySelectorAll('.menu-actions .btn')) {
      if (!M.visible(el)) continue;
      if (el.scrollWidth > el.clientWidth + 0.5) {
        truncados.push(`${M.label(el)} pede ${el.scrollWidth}px numa caixa de ${el.clientWidth}px`);
      }
      if (getComputedStyle(el).textOverflow === 'ellipsis') {
        truncados.push(`${M.label(el)} com text-overflow: ellipsis`);
      }
    }
    const dentro = tela.querySelector('.menu-inner');
    return {
      id: tela.id, innerWidth,
      scrollWidth: tela.scrollWidth, clientWidth: tela.clientWidth,
      // Mesmo defeito de `.screen` que derrubou o #lobby: com align-items
      // center o excedente sobe para fora do alcance de scrollTop.
      topoConteudo: dentro ? +dentro.getBoundingClientRect().top.toFixed(1) : null,
      fora, truncados,
      pequenos: M.targets('#menu')
        .filter((t) => t.w < alvoMin || t.h < alvoMin)
        .map((t) => `${t.alvo} ${t.w}x${t.h}`),
    };
  }, ALVO_MIN);
  if (m.erro) { errors.push(`MENU: ${ctx} ${m.erro}`); return; }
  if (m.scrollWidth !== m.clientWidth) {
    errors.push(`MENU: ${ctx} o #${m.id} rola na horizontal — scrollWidth ${m.scrollWidth}`
      + ` contra clientWidth ${m.clientWidth}`);
  }
  if (m.topoConteudo !== null && m.topoConteudo < -0.5) {
    errors.push(`MENU: ${ctx} o topo do #${m.id} vaza acima da origem de rolagem`
      + ` — .menu-inner em ${m.topoConteudo}px, inalcançável por scrollTop`);
  }
  if (m.fora.length) {
    errors.push(`MENU: ${ctx} ${m.fora.length} descendente(s) do #${m.id} fora dos`
      + ` ${m.innerWidth}px da viewport — ${m.fora.join(' · ')}`);
  }
  if (m.truncados.length) {
    errors.push(`MENU: ${ctx} ${m.truncados.length} rótulo(s) truncado(s) em .menu-actions .btn`
      + ` — ${m.truncados.join(' · ')}`);
  }
  if (m.pequenos.length) {
    errors.push(`TOQUE: ${ctx} o #menu tem ${m.pequenos.length} alvo(s) abaixo de`
      + ` ${ALVO_MIN}x${ALVO_MIN} — ${m.pequenos.join(' · ')}`);
  }
}

// UI-01: nenhum alvo interativo abaixo de 44x44 na barra de ação. O #bag entra
// pela medirMochila, que só o abre depois de encher o inventário — varrer a
// mochila vazia deixaria de fora as .inv-slot e as .equip-slot, que só viram
// alvo de toque quando têm item.
async function medirToque(page, ctx) {
  const m = await page.evaluate((alvoMin) => {
    const M = window.__M;
    return {
      pequenos: M.targets('#actionBar')
        .filter((t) => t.w < alvoMin || t.h < alvoMin)
        .map((t) => `${t.alvo} ${t.w}x${t.h}`),
    };
  }, ALVO_MIN);
  if (m.pequenos.length) {
    errors.push(`TOQUE: ${ctx} o #actionBar tem ${m.pequenos.length} alvo(s) abaixo de`
      + ` ${ALVO_MIN}x${ALVO_MIN} — ${m.pequenos.join(' · ')}`);
  }
}

// A mochila cheia é o pior caso de altura de UI-04, e os 20 itens saem do
// caminho real do jogo: rollItem() (js/sim.js:1241) larga o item no pé do
// jogador e o próprio updatePickup() (js/sim.js:483) recolhe. Fabricar objeto
// solto faria renderBag() (js/ui.js:245) receber um item que a partida nunca
// produziria, e o console pararia de ficar limpo (RNF-04).
async function encherMochila(page, ctx) {
  const m = await page.evaluate(async (invSize) => {
    const sim = await import(new URL('js/sim.js', location.href).href);
    const G = window.__SF.G;
    const p = G.players.host;
    // grabItem equipa sozinho quando o espaço está vazio, devolvendo a vaga à
    // mochila; por isso o laço repõe só o que falta em vez de largar 20 de uma vez.
    let rodadas = 0;
    while (p.inv.some((vaga) => !vaga) && rodadas++ < 8) {
      const faltam = p.inv.filter((vaga) => !vaga).length;
      for (let i = 0; i < faltam; i++) {
        const it = sim.rollItem(G, G.floor + 2);
        it.x = p.x; it.y = p.y;
        G.items.push(it);
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    return { ocupados: p.inv.filter(Boolean).length, esperado: invSize, rodadas, morto: !!p.dead };
  }, INV_SIZE);
  if (m.ocupados !== m.esperado) {
    errors.push(`MOCHILA: ${ctx} a mochila parou em ${m.ocupados} de ${m.esperado} itens`
      + ` depois de ${m.rodadas} rodada(s)${m.morto ? ' — o jogador morreu antes de recolher' : ''}`);
  }
  return m;
}

// UI-03 — proporção da .equip-col e visibilidade do #btnSell. As duas ACs novas
// (3 e 4) são escritas para 360x640 e valem em conjunto: fechar só uma não fecha
// o requisito. Em 390x844 a medida é IMPRESSA no relatório, não asserida — o
// alvo grande nunca foi o caso apertado. A guarda de AC 1 (linha de 5 .inv-slot
// inteira no painel) e a de AC 2 (5 colunas, INV_SIZE slots) valem nos dois.
const TETO_EQUIP = 0.40;
function medirUI03(m, ctx) {
  const u = m.ui03;
  const c = m.caixa;
  const estreito = m.innerWidth === VIEWPORT_SMALL.width && m.innerHeight === VIEWPORT_SMALL.height;
  // AC 1 — guarda de não regressão do ganho de d26ab38: a primeira linha da
  // grade continua inteira dentro do painel, com os 5 filhos no mesmo top.
  if (u.primeiros.length !== 5) {
    errors.push(`MOCHILA: ${ctx} o #invGrid tem ${u.primeiros.length} dos 5 primeiros filhos`
      + ' medíveis (UI-03 AC 1)');
  } else {
    const topo = u.primeiros[0].top;
    const desalinhados = u.primeiros.filter((f) => Math.abs(f.top - topo) > TOL);
    if (desalinhados.length) {
      errors.push(`MOCHILA: ${ctx} a primeira linha do #invGrid não está alinhada —`
        + ` ${desalinhados.map((f) => `${f.rotulo} em ${f.top.toFixed(1)}`).join(' · ')} contra ${topo.toFixed(1)} (UI-03 AC 1)`);
    }
    const cortados = u.primeiros.filter((f) => f.top < c.top - TOL || f.bottom > c.bottom + TOL);
    if (cortados.length) {
      errors.push(`MOCHILA: ${ctx} ${cortados.length} dos 5 primeiros .inv-slot saem da caixa`
        + ` do painel (${c.top.toFixed(1)}–${c.bottom.toFixed(1)}) —`
        + ` ${cortados.map((f) => `${f.rotulo} ${f.top.toFixed(1)}–${f.bottom.toFixed(1)}`).join(' · ')} (UI-03 AC 1)`);
    }
  }
  // AC 2 — a grade continua em 5 colunas e INV_SIZE slots.
  if (u.colunas !== 5) {
    errors.push(`MOCHILA: ${ctx} o #invGrid tem ${u.colunas} coluna(s) em grid-template-columns,`
      + ' esperado 5 (UI-03 AC 2)');
  }
  if (u.slots !== INV_SIZE) {
    errors.push(`MOCHILA: ${ctx} o #invGrid tem ${u.slots} .inv-slot, esperado ${INV_SIZE} (UI-03 AC 2)`);
  }
  // AC 3 e AC 4 — o par que reprova hoje, asserido só no alvo estreito.
  if (!u.equip) {
    errors.push(`MOCHILA: ${ctx} não conseguiu medir a #equipCol com o painel aberto (UI-03 AC 3)`);
  } else {
    const fracao = u.equip.height / c.height;
    const linha = `#equipCol ${u.equip.height.toFixed(1)}px de ${c.height.toFixed(1)}px`
      + ` do painel = ${(fracao * 100).toFixed(1)}% (teto ${(TETO_EQUIP * 100).toFixed(0)}% =`
      + ` ${(TETO_EQUIP * c.height).toFixed(1)}px)`;
    if (estreito && fracao > TETO_EQUIP) {
      errors.push(`MOCHILA: ${ctx} a ${linha} (UI-03 AC 3)`);
    } else {
      console.log(`  MOCHILA: ${ctx} a ${linha}`);
    }
  }
  const sellDentro = !!u.sell && u.sell.top >= c.top - TOL && u.sell.bottom <= c.bottom + TOL;
  const linhaSell = u.sell
    ? `#btnSell em ${u.sell.top.toFixed(1)}–${u.sell.bottom.toFixed(1)} contra a caixa do painel`
      + ` ${c.top.toFixed(1)}–${c.bottom.toFixed(1)}`
    : '#btnSell não é mensurável com o painel aberto';
  if (estreito && !sellDentro) {
    errors.push(`MOCHILA: ${ctx} com scrollTop 0 o ${linhaSell} (UI-03 AC 4)`);
  } else {
    console.log(`  MOCHILA: ${ctx} ${linhaSell}${sellDentro ? ' — inteiro no painel' : ''}`);
  }
}

// UI-04 e UI-05: com a mochila cheia o painel cabe inteiro na viewport com o
// gutter de 12px, não corta conteúdo que caiba na altura útil e prende a
// rolagem em si mesmo. A varredura de UI-01 do #bag vem junto, agora que as
// .inv-slot e as .equip-slot têm item e portanto são alvo de toque.
async function medirMochila(page, ctx) {
  await page.evaluate(() => document.getElementById('btnBag').click());
  await new Promise((r) => setTimeout(r, 400));
  const m = await page.evaluate((gutter, alvoMin) => {
    const M = window.__M;
    const bag = document.getElementById('bag');
    const caixa = M.rect('#bag');
    if (!caixa) return { erro: 'o #bag não ficou visível' };
    const util = innerHeight - 2 * gutter;
    const cabe = bag.scrollHeight <= util;
    const transbordo = [];
    if (cabe) {
      for (const el of bag.querySelectorAll('*')) {
        if (!M.visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom > caixa.bottom + 0.5) {
          transbordo.push(`${M.label(el)} termina em ${r.bottom.toFixed(1)}`);
        }
      }
    }
    const pequenos = M.targets('#bag')
      .filter((t) => t.w < alvoMin || t.h < alvoMin)
      .map((t) => `${t.alvo} ${t.w}x${t.h}`);
    // UI-03: a razão entre .equip-col e #bag sai de dois getBoundingClientRect()
    // na página em execução, nunca de leitura do CSS (RNF-07). O painel é medido
    // com scrollTop === 0, senão o #btnSell entraria na dobra por rolagem em vez
    // de por layout.
    bag.scrollTop = 0;
    const equip = M.rect('#equipCol');
    const sell = M.rect('#btnSell');
    const grade = document.getElementById('invGrid');
    const primeiros = grade ? [...grade.children].slice(0, 5).map((el) => {
      const r = el.getBoundingClientRect();
      return { rotulo: M.label(el), top: r.top, bottom: r.bottom };
    }) : [];
    const ui03 = {
      equip, sell,
      // AC 2: 5 colunas e INV_SIZE slots. grid-template-columns devolve os
      // valores resolvidos em px, um por coluna.
      colunas: grade ? getComputedStyle(grade).gridTemplateColumns.trim().split(/\s+/).length : null,
      slots: grade ? grade.querySelectorAll('.inv-slot').length : null,
      primeiros,
    };
    // A AC 1 de UI-01 nomeia estes dois: se sumirem do DOM a varredura acima
    // passaria vazia e o teste viraria enfeite.
    const nomeados = ['#btnCloseBag', '#btnSell'].map((sel) => ({ sel, r: M.rect(sel) }));
    // Rolar até o fim é a última medida: mexe no rect de todo descendente.
    bag.scrollTop = bag.scrollHeight;
    const doc = document.documentElement;
    const rolagem = {
      docTop: doc.scrollTop, bodyTop: document.body.scrollTop,
      docScroll: doc.scrollHeight, docClient: doc.clientHeight,
      overscroll: getComputedStyle(bag).overscrollBehaviorY,
    };
    bag.scrollTop = 0;
    return {
      innerWidth, innerHeight, util, cabe, caixa, transbordo, pequenos, nomeados, rolagem, ui03,
      scrollHeight: bag.scrollHeight, clientHeight: bag.clientHeight,
      itens: window.__SF.G.players.host.inv.filter(Boolean).length,
    };
  }, GUTTER, ALVO_MIN);
  if (m.erro) { errors.push(`MOCHILA: ${ctx} ${m.erro}`); return; }
  if (m.itens !== INV_SIZE) {
    errors.push(`MOCHILA: ${ctx} medida com ${m.itens} de ${INV_SIZE} itens — não é o pior caso`);
  }
  const c = m.caixa;
  if (c.top < GUTTER - TOL || c.bottom > m.innerHeight - GUTTER + TOL
    || c.left < -TOL || c.right > m.innerWidth + TOL) {
    errors.push(`MOCHILA: ${ctx} o #bag ocupa ${c.left.toFixed(1)},${c.top.toFixed(1)} até`
      + ` ${c.right.toFixed(1)},${c.bottom.toFixed(1)} e fura o gutter de ${GUTTER}px`
      + ` em ${m.innerWidth}x${m.innerHeight}`);
  }
  if (m.cabe && m.scrollHeight > m.clientHeight) {
    errors.push(`MOCHILA: ${ctx} o conteúdo cabe nos ${m.util}px úteis mas transborda —`
      + ` scrollHeight ${m.scrollHeight} contra clientHeight ${m.clientHeight}`);
  }
  if (m.transbordo.length) {
    errors.push(`MOCHILA: ${ctx} ${m.transbordo.length} descendente(s) abaixo da borda do`
      + ` painel (${c.bottom.toFixed(1)}) — ${m.transbordo.join(' · ')}`);
  }
  const rl = m.rolagem;
  if (rl.docTop !== 0 || rl.bodyTop !== 0 || rl.docScroll !== rl.docClient) {
    errors.push(`MOCHILA: ${ctx} a rolagem do painel escapou para a página — scrollTop`
      + ` ${rl.docTop}/${rl.bodyTop} e documento ${rl.docScroll} contra ${rl.docClient}`);
  }
  if (rl.overscroll === 'auto') {
    errors.push(`MOCHILA: ${ctx} o #bag está com overscroll-behavior-y: ${rl.overscroll} —`
      + ' o gesto no fim da lista encadeia na página');
  }
  if (m.pequenos.length) {
    errors.push(`TOQUE: ${ctx} o #bag tem ${m.pequenos.length} alvo(s) abaixo de`
      + ` ${ALVO_MIN}x${ALVO_MIN} — ${m.pequenos.join(' · ')}`);
  }
  for (const { sel, r } of m.nomeados) {
    if (!r) errors.push(`TOQUE: ${ctx} não encontrou ${sel} visível com o #bag aberto`);
    else if (r.width < ALVO_MIN || r.height < ALVO_MIN) {
      errors.push(`TOQUE: ${ctx} ${sel} mede ${r.width.toFixed(1)}x${r.height.toFixed(1)},`
        + ` abaixo de ${ALVO_MIN}x${ALVO_MIN}`);
    }
  }
  medirUI03(m, ctx);
  await page.screenshot({ path: `${OUT}/11-mobile-bag-${ctx}.png` });
  await page.evaluate(() => document.getElementById('btnCloseBag').click());
  await new Promise((r) => setTimeout(r, 300));
}

// P1D-13: o CSS do painel é verificável antes de existir a ligação de clique
// da P1D-14. Abrir por classe isola a geometria e deixa claro que não estamos
// testando persistência, mudo ou atalho nesta etapa.
async function medirAudioLayout(page, ctx, modo) {
  const m = await page.evaluate(() => {
    const panel = document.getElementById('audioPanel');
    const chip = document.getElementById('audioChip');
    const rect = (el) => {
      if (!el || getComputedStyle(el).display === 'none') return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0
        ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
        : null;
    };
    const intersects = (a, b) => a && b &&
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
    const originalHidden = panel.classList.contains('hidden');
    panel.classList.remove('hidden');
    const panelRect = rect(panel);
    const center = panelRect && {
      x: panelRect.left + panelRect.width / 2,
      y: panelRect.top + panelRect.height / 2,
    };
    const atCenter = center && document.elementFromPoint(center.x, center.y);
    const combat = ['#stick', '#actionBar', '#bossBar', '#portalHold']
      .map((sel) => ({ sel, rect: rect(document.querySelector(sel)) }))
      .filter(({ rect: box }) => box);
    const overlaps = combat.filter(({ rect: box }) => intersects(panelRect, box)).map(({ sel }) => sel);
    const focus = ['audioChip', 'audioMusic', 'audioSfx', 'btnAudioMute', 'btnCloseAudio'].map((id) => {
      const el = document.getElementById(id);
      // `focus()` programático não satisfaz :focus-visible no Chromium: isso
      // imita clique de mouse, não navegação de teclado. A opção pede o mesmo
      // indicador que Tab expõe sem depender da ordem global de tabulação.
      el.focus({ focusVisible: true });
      const cs = getComputedStyle(el);
      return {
        id,
        outline: cs.outlineStyle,
        outlineWidth: parseFloat(cs.outlineWidth),
        shadow: cs.boxShadow,
      };
    });
    const controls = ['audioMusic', 'audioSfx', 'btnAudioMute', 'btnCloseAudio'].map((id) => ({ id, rect: rect(document.getElementById(id)) }));
    const chipStyle = getComputedStyle(chip);
    const result = {
      innerWidth,
      innerHeight,
      chip: rect(chip),
      panel: panelRect,
      centerInPanel: !!atCenter && panel.contains(atCenter),
      overlaps,
      controls,
      focus,
      chipStyle: { color: chipStyle.color, backgroundImage: chipStyle.backgroundImage, borderColor: chipStyle.borderColor },
    };
    if (originalHidden) panel.classList.add('hidden');
    return result;
  });
  const box = (r) => r ? `${r.width.toFixed(1)}x${r.height.toFixed(1)} em ${r.left.toFixed(1)},${r.top.toFixed(1)}` : 'ausente';
  if (!m.chip || !m.panel) {
    errors.push(`ÁUDIO: ${ctx} não conseguiu medir ${!m.chip ? '#audioChip' : '#audioPanel'}`);
    return;
  }
  if (m.panel.left < -TOL || m.panel.top < GUTTER - TOL || m.panel.right > m.innerWidth + TOL || m.panel.bottom > m.innerHeight - GUTTER + TOL) {
    errors.push(`ÁUDIO: ${ctx} #audioPanel sai da viewport útil — ${box(m.panel)} em ${m.innerWidth}x${m.innerHeight}`);
  }
  if (!m.centerInPanel || m.overlaps.length) {
    errors.push(`ÁUDIO: ${ctx} #audioPanel cobre o combate — ${JSON.stringify({ centerInPanel: m.centerInPanel, overlaps: m.overlaps })}`);
  }
  if (m.chipStyle.color === 'rgba(0, 0, 0, 0)' || m.chipStyle.backgroundImage === 'none' || m.chipStyle.borderColor === 'rgba(0, 0, 0, 0)') {
    errors.push(`ÁUDIO: ${ctx} #audioChip perdeu contraste próprio — ${JSON.stringify(m.chipStyle)}`);
  }
  const semFoco = m.focus.filter(({ outline, outlineWidth, shadow }) =>
    (outline === 'none' || outlineWidth < 1) && shadow === 'none');
  if (semFoco.length) {
    errors.push(`ÁUDIO: ${ctx} ${semFoco.map(({ id }) => '#' + id).join(', ')} não tem foco visível`);
  }
  if (modo === 'toque') {
    const pequenos = [{ id: 'audioChip', rect: m.chip }, ...m.controls]
      .filter(({ rect }) => !rect || rect.width < ALVO_MIN || rect.height < ALVO_MIN)
      .map(({ id, rect }) => `${id} ${box(rect)}`);
    if (pequenos.length) {
      errors.push(`TOQUE: ${ctx} controles de áudio abaixo de ${ALVO_MIN}x${ALVO_MIN} — ${pequenos.join(' · ')}`);
    }
  }
  await page.evaluate(() => document.getElementById('audioPanel').classList.remove('hidden'));
  await page.screenshot({ path: `${OUT}/13-audio-${ctx}.png` });
  await page.evaluate(() => document.getElementById('audioPanel').classList.add('hidden'));
}

// UI-01 AC 2 e UI-02: o slot é 48x48 em qualquer largura de toque e a barra
// derivada tem 102px; nenhum par de slots se sobrepõe.
async function medirBarra(page, ctx) {
  const m = await page.evaluate(() => {
    const M = window.__M;
    return {
      barra: M.rect('#actionBar'),
      slots: [...document.querySelectorAll('#actionBar .slot')]
        .filter((el) => M.visible(el))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { alvo: M.label(el), left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
        }),
    };
  });
  if (!m.barra) { errors.push(`BARRA: ${ctx} não encontrou o #actionBar visível`); return; }
  if (Math.abs(m.barra.width - BARRA_LARGURA) > 0.5) {
    errors.push(`BARRA: ${ctx} o #actionBar mede ${m.barra.width.toFixed(1)}px de largura, esperado ${BARRA_LARGURA}px`);
  }
  if (!m.slots.length) { errors.push(`BARRA: ${ctx} nenhum .slot visível no #actionBar`); return; }
  const fora = m.slots.filter((s) => Math.abs(s.w - SLOT_LADO) > 0.5 || Math.abs(s.h - SLOT_LADO) > 0.5);
  if (fora.length) {
    errors.push(`BARRA: ${ctx} ${fora.length} de ${m.slots.length} slots fora de ${SLOT_LADO}x${SLOT_LADO}`
      + ` — ${fora.map((s) => `${s.alvo} ${s.w.toFixed(1)}x${s.h.toFixed(1)}`).join(' · ')}`);
  }
  for (let i = 0; i < m.slots.length; i++) {
    for (let j = i + 1; j < m.slots.length; j++) {
      const a = m.slots[i], b = m.slots[j];
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 0 && overlapY > 0) {
        errors.push(`BARRA: ${ctx} os slots ${a.alvo} e ${b.alvo} se sobrepõem em`
          + ` ${overlapX.toFixed(1)}x${overlapY.toFixed(1)}px`);
      }
    }
  }
}

// UI-03: em nenhuma altura o #actionBar pode cruzar o contador do portal, o
// #log ou a zona reservada do joystick, e todo slot fica na metade direita e
// dentro da viewport.
async function medirGeometria(page, ctx) {
  const m = await page.evaluate(() => {
    const M = window.__M;
    const ph = document.getElementById('portalHold');
    // O contador nasce com `hidden` e só aparece com o portal aberto. A AC é de
    // geometria, não de estado: medimos com ele visível e devolvemos a classe,
    // senão o retângulo viria vazio e a asserção passaria sem medir nada.
    const oculto = ph.classList.contains('hidden');
    if (oculto) ph.classList.remove('hidden');
    const barra = M.rect('#actionBar');
    const portal = M.rect('#portalHold');
    const log = M.rect('#log');
    const zona = M.joystickZone();
    const medida = {
      innerWidth, innerHeight, barra, portal, log, zona,
      cruzaPortal: M.intersects(barra, portal),
      cruzaLog: M.intersects(barra, log),
      cruzaZona: M.intersects(barra, zona),
      slots: [...document.querySelectorAll('#actionBar .slot')]
        .filter((el) => M.visible(el))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { alvo: M.label(el), left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }),
    };
    if (oculto) ph.classList.add('hidden');
    return medida;
  });
  // A zona sai da mesma constante que js/main.js usa no pointerdown; conferir a
  // borda aqui é o que amarra os 259px de 390 e os 244px de 360 da AC 3.
  const zonaEsperada = TOUCH_STICK_ZONE * m.innerWidth + TOUCH_STICK_RADIUS;
  zonas.set(m.innerWidth, Math.round(m.zona.right * 10) / 10);
  if (Math.abs(m.zona.right - zonaEsperada) > TOL) {
    errors.push(`BARRA: ${ctx} a zona do joystick termina em ${m.zona.right.toFixed(1)},`
      + ` esperado ${zonaEsperada.toFixed(1)} para ${m.innerWidth}px de largura`);
  }
  if (!m.barra) { errors.push(`BARRA: ${ctx} não encontrou o #actionBar visível`); return; }
  if (!m.portal) errors.push(`BARRA: ${ctx} não conseguiu medir o #portalHold`);
  if (m.cruzaPortal) {
    errors.push(`BARRA: ${ctx} o #actionBar (${m.barra.left.toFixed(1)}–${m.barra.right.toFixed(1)})`
      + ` cruza o #portalHold (${m.portal.left.toFixed(1)}–${m.portal.right.toFixed(1)})`);
  }
  if (m.cruzaLog) {
    errors.push(`BARRA: ${ctx} o #actionBar (${m.barra.left.toFixed(1)}–${m.barra.right.toFixed(1)})`
      + ` cruza o #log (${m.log.left.toFixed(1)}–${m.log.right.toFixed(1)})`);
  }
  if (m.cruzaZona) {
    errors.push(`BARRA: ${ctx} o #actionBar começa em ${m.barra.left.toFixed(1)}, dentro da zona`
      + ` do joystick que vai até ${m.zona.right.toFixed(1)}`);
  }
  for (const s of m.slots) {
    if (s.left < m.innerWidth / 2 || s.right > m.innerWidth || s.top < 0 || s.bottom > m.innerHeight) {
      errors.push(`BARRA: ${ctx} o slot ${s.alvo} sai da metade direita ou da viewport —`
        + ` ${s.left.toFixed(1)},${s.top.toFixed(1)} até ${s.right.toFixed(1)},${s.bottom.toFixed(1)}`);
    }
  }
}

// RF-01: no dedo o HUD não pode anunciar tecla que o aparelho não tem. Os 7
// spans continuam no DOM em qualquer modo (AC 2) — `1`,`2`,`3`,`4` gerados por
// js/ui.js:119 e `Q`,`E`,`Tab` estáticos de index.html:162-164 —, o que muda é
// quantos o __M.visible enxerga: 0 no toque (AC 1) e 7 no mouse (AC 3).
const TECLAS_NO_DOM = 7;
async function medirTeclas(page, ctx, modo) {
  const m = await page.evaluate(() => {
    const M = window.__M;
    const todos = [...document.querySelectorAll('.slot .key')];
    return {
      total: todos.length,
      visiveis: todos.filter((el) => M.visible(el)).length,
      rotulos: todos.filter((el) => M.visible(el)).map((el) => el.textContent.trim()),
    };
  });
  if (m.total !== TECLAS_NO_DOM) {
    errors.push(`TECLA: ${ctx} o DOM tem ${m.total} elemento(s) .slot .key, esperado`
      + ` ${TECLAS_NO_DOM} — esconder não pode virar remoção (RF-01 AC 2)`);
  }
  const esperado = modo === 'toque' ? 0 : TECLAS_NO_DOM;
  if (m.visiveis !== esperado) {
    errors.push(`TECLA: ${ctx} ${m.visiveis} de ${m.total} .slot .key visíveis no modo`
      + ` ${modo}, esperado ${esperado}${m.rotulos.length ? ` — ${m.rotulos.join(', ')}` : ''}`);
  }
}

// RF-02: a linha de abertura tem de descrever o que existe na tela daquele modo
// de entrada. A âncora é o `lastElementChild` do #log porque UI.pushLog faz
// prepend (js/ui.js:96): a mais antiga fica por último, e numa partida solo
// medida logo depois da entrada a abertura é justamente a primeira linha.
const PROIBIDAS_RF02 = [/1\s*[–-]\s*4/, /Q\s*\/\s*E/, /\bTab\b/, /\bEnter\b/];
const ABERTURA_MOUSE = 'Use 1–4 para magias, Q/E para poções, Enter para conversar.';
async function medirAbertura(page, ctx, modo) {
  const m = await page.evaluate(() => {
    const box = document.getElementById('log');
    if (!box) return { erro: 'o #log não existe no DOM' };
    const linha = box.lastElementChild;
    return {
      logInnerText: box.innerText,
      linhas: box.querySelectorAll('p').length,
      // Null-safe de propósito: contra o código de hoje o #btnChat não existe e
      // o caso precisa emitir erro medido, não estourar TypeError — uma exceção
      // aqui abortaria o arquivo e mataria os outros quatro prefixos.
      texto: linha ? linha.innerText : null,
      classe: linha ? linha.className : null,
      // Controles do #actionBar que têm aria-label e NENHUM texto visível.
      // innerText, e não textContent, justamente porque respeita o CSS: no dedo
      // os spans .slot .key estão em display: none e não contam como texto que
      // o jogador enxerga.
      fantasmas: [...document.querySelectorAll('#actionBar [aria-label]')]
        .map((el) => ({
          sel: el.id ? '#' + el.id : el.tagName.toLowerCase(),
          rotulo: el.getAttribute('aria-label'),
          textoVisivel: (el.innerText || '').trim(),
        }))
        .filter((f) => f.rotulo && !f.textoVisivel),
    };
  });
  if (m.erro) { errors.push(`ABERTURA: ${ctx} ${m.erro}`); return; }
  if (m.texto === null) {
    errors.push(`ABERTURA: ${ctx} o #log não tem nenhuma linha depois da entrada em ${modo}`);
    return;
  }
  aberturas.set(modo, m.texto);
  // AC 4 — a linha sai pelo mesmo UI.pushLog(..., 'system') e por isso respeita
  // o teto de CHAT_LOG_LINES de js/ui.js:97.
  if (m.classe !== 'system') {
    errors.push(`ABERTURA: ${ctx} (${modo}) a linha de abertura tem classe "${m.classe}",`
      + ' esperado "system"');
  }
  if (modo === 'mouse') {
    // AC 3 — a string de teclado fica byte a byte igual à de js/main.js:270.
    if (m.texto !== ABERTURA_MOUSE) {
      errors.push(`ABERTURA: ${ctx} (mouse) a linha mudou — medido "${m.texto}",`
        + ` esperado "${ABERTURA_MOUSE}"`);
    }
    return;
  }
  // AC 1 — as quatro negativas, medidas sobre o innerText do #log inteiro e só
  // em `pointer: coarse`: no mouse os mesmos tokens são obrigatórios (AC 3).
  for (const re of PROIBIDAS_RF02) {
    if (re.test(m.logInnerText)) {
      errors.push(`ABERTURA: ${ctx} (toque) o #log cita tecla de teclado — ${re}`
        + ` casa em "${m.logInnerText.replace(/\n/g, ' · ')}"`);
    }
  }
  // AC 5 — a lista positiva. Sem ela, "Boa sorte." passaria nas quatro negativas
  // e o alvo novo de chat ficaria sem canal de descoberta.
  if (!/joystick/i.test(m.texto)) {
    errors.push(`ABERTURA: ${ctx} (toque) a linha não cita o joystick — "${m.texto}"`);
  }
  if (!/convers|falar|balão/i.test(m.texto)) {
    errors.push(`ABERTURA: ${ctx} (toque) a linha não menciona a conversa — "${m.texto}"`);
  }
  // AC 5b — GUARDA DE RÓTULO FANTASMA.
  //
  // Este caso nasceu de defeito medido em aparelho real (Chrome/Android,
  // 375x689), não de leitura de código. A versão anterior desta AC EXIGIA que a
  // linha citasse o aria-label do #btnChat — e o #btnChat é um botão só de
  // ícone, sem texto visível. Resultado: a mensagem mandava tocar em
  // "Conversar com o grupo", rótulo que o jogador vidente não encontra em lugar
  // nenhum da tela. A frase aparecia em negrito dentro do #log, no canto
  // ESQUERDO, e o botão fica no DIREITO. O jogador tocava no texto; o #log é
  // pointer-events: none, o toque atravessava para o #canvas e, por cair em
  // x < innerWidth/2, virava joystick — o personagem andava e a conversa nunca
  // abria. Doze toques gravados na sessão real, nenhum a menos de 89,8px da
  // borda do alvo. A suíte estava verde o tempo todo, porque só toca no centro
  // exato do botão e porque esta mesma AC obrigava a frase enganosa.
  //
  // A regra agora é a inversa e é geral: instrução de toque não pode mandar
  // procurar um rótulo que só existe em aria-label.
  for (const f of m.fantasmas) {
    if (m.texto.includes(f.rotulo)) {
      errors.push(`ABERTURA: ${ctx} (toque) a linha manda procurar "${f.rotulo}", que é só o`
        + ` aria-label de ${f.sel} — controle sem texto visível. Quem enxerga não acha esse`
        + ' rótulo na tela e acaba tocando no próprio texto do #log, que é'
        + ` pointer-events: none e deixa o toque cair no #canvas — "${m.texto}"`);
    }
  }
}

// Aba de mouse: 1280x760 sem hasTouch, para RF-01 AC 3, RF-02 AC 3, UI-01 AC 6 e
// UI-04 AC 4 saírem da mesma execução dos casos de toque, sem novo boot.
async function abrirMouse() {
  const ctx = `${VIEWPORT_DESKTOP.width}x${VIEWPORT_DESKTOP.height}`;
  const p = await newSmokePage(browser);
  await p.setViewport(VIEWPORT_DESKTOP);
  await installHelpers(p);
  p.on('pageerror', (e) => errors.push(`PAGEERROR ${ctx}: ${e.message}`));
  await openSmokePage(p);
  await new Promise((r) => setTimeout(r, 600));
  if (await p.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
    errors.push(`ABERTURA: ${ctx} ativou "pointer: coarse" — a passagem de mouse mediria o CSS de toque`);
  }
  // Entrada por evento real de mouse do CDP, mirando o centro medido do alvo:
  // é o análogo de mouse do page.touchscreen.tap() que CT-02 AC 1 exige no
  // toque, e mantém o arquivo sem nenhuma ocorrência nova de .click().
  for (const sel of ['.voc-card[data-voc="paladin"]', '#btnSolo']) {
    const c = await p.evaluate((alvo) => window.__M.centro(alvo), sel);
    if (!c) { errors.push(`ABERTURA: ${ctx} (mouse) não encontrou ${sel} para entrar em solo`); return p; }
    await p.mouse.click(c.x, c.y);
    await new Promise((r) => setTimeout(r, 200));
  }
  await new Promise((r) => setTimeout(r, 1800));
  return p;
}

// UI-01 AC 6: no mouse o alvo de chat pode existir ou não, mas não pode entrar no
// layout da barra. A prova é a contagem de .slot visíveis em .slots.potions (3),
// e não a largura do #actionBar — cravar a largura aqui introduziria um literal
// de layout novo no harness, contra RNF-07.
async function medirBarraMouse(page, ctx) {
  const m = await page.evaluate((selAbrir) => {
    const M = window.__M;
    const alvo = document.querySelector(selAbrir);
    return {
      existe: !!alvo,
      visivel: M.visible(alvo),
      display: alvo ? getComputedStyle(alvo).display : null,
      slotsVisiveis: [...document.querySelectorAll('.slots.potions .slot')]
        .filter((el) => M.visible(el)).length,
    };
  }, SEL_CHAT_ABRIR);
  if (m.visivel) {
    errors.push(`ABERTURA: ${ctx} (mouse) ${SEL_CHAT_ABRIR} está visível — o alvo é de toque`
      + ` e no mouse o Enter de js/main.js:574 continua sendo o caminho`);
  }
  if (m.existe && m.display !== 'none') {
    errors.push(`ABERTURA: ${ctx} (mouse) ${SEL_CHAT_ABRIR} está com display: ${m.display},`
      + ' esperado none');
  }
  if (m.slotsVisiveis !== 3) {
    errors.push(`ABERTURA: ${ctx} (mouse) a .slots.potions mostra ${m.slotsVisiveis} .slot`
      + ' visíveis, esperado 3 — o alvo de chat entrou no layout de mouse');
  }
}

// ============================================================
// CHAT NO DEDO — RF-03, RF-04, RF-05, UI-01, UI-02, UI-05, RNF-03 AC 2
//
// PROIBIÇÃO DE CT-02 AC 1, registrada aqui de propósito: `element.click()`,
// `page.click()` e `el.dispatchEvent(new MouseEvent('click'))` são PROIBIDOS
// neste caso. O #hudRight é `pointer-events: none` (styles.css:169) e um clique
// programático já escondeu exatamente esta classe de defeito nesta casa — o
// comentário de styles.css:222-226 registra o handler que só disparava por
// `.click()` enquanto o dedo real atravessava para o canvas. Aqui só entram
// `page.touchscreen.tap()` e `page.touchscreen.touchStart()/touchEnd()`, sempre
// confirmados por `document.elementFromPoint` na mesma coordenada.
// ============================================================
const SENTINELA_CHAT = 'sentinela de conversa';

// Uma leitura só de tudo que as ACs do chat nomeiam. Todo acesso é null-safe:
// contra o código de hoje o #btnChat e o #btnChatClose não existem, e o caso
// precisa emitir erro medido em vez de estourar TypeError — uma exceção
// abortaria o arquivo e mataria os outros quatro prefixos de CT-02 AC 6.
const lerChat = (page) => page.evaluate((selFechar) => {
  const M = window.__M;
  const S = window.__SF;
  const campo = document.querySelector('#chatInput');
  const fechar = document.querySelector(selFechar);
  const stick = document.getElementById('stick');
  const rCampo = M.rect('#chatInput');
  const rFechar = M.rect(selFechar);
  const rLog = M.rect('#log');
  const acerto = (el, r) => {
    if (!el || !r) return null;
    const alvo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!alvo) return null;
    return alvo === el || el.contains(alvo) ? 'alvo' : M.label(alvo);
  };
  return {
    innerWidth, innerHeight,
    chatting: S ? S.chatting : null,
    stickActive: S ? S.stick.active : null,
    moveGoal: S ? S.moveGoal : null,
    stickHidden: stick ? stick.classList.contains('hidden') : null,
    existeCampo: !!campo,
    qtdCampos: document.querySelectorAll('#chatInput').length,
    campoHidden: campo ? campo.classList.contains('hidden') : null,
    campoVisivel: M.visible(campo),
    campoFocado: !!campo && document.activeElement === campo,
    ativo: document.activeElement ? document.activeElement.id || document.activeElement.tagName.toLowerCase() : null,
    maxLength: campo ? campo.maxLength : null,
    valor: campo ? campo.value : null,
    rCampo, rLog, rFechar,
    logInnerText: document.getElementById('log') ? document.getElementById('log').innerText : '',
    cruzaLog: M.intersects(rCampo, rLog),
    existeFechar: !!fechar,
    fecharVisivel: M.visible(fechar),
    fecharPointerEvents: fechar ? getComputedStyle(fechar).pointerEvents : null,
    fecharCruzaCampo: M.intersects(rFechar, rCampo),
    fecharCruzaLog: M.intersects(rFechar, rLog),
    acertoFechar: acerto(fechar, rFechar),
    centroFechar: M.centro(selFechar),
    centroCampo: M.centro('#chatInput'),
    cruzaBarra: M.intersects(rCampo, M.rect('#actionBar')),
  };
}, SEL_CHAT_FECHAR);

const dentroDaViewport = (r, largura, altura) => !!r
  && r.left >= -TOL && r.top >= -TOL && r.right <= largura + TOL && r.bottom <= altura + TOL;
const caixa = (r) => (r ? `${r.width.toFixed(1)}x${r.height.toFixed(1)} em ${r.left.toFixed(1)},${r.top.toFixed(1)}` : 'ausente');

// Ponto do alvo de abrir. Quando o #btnChat ainda não existe, a mira cai na
// célula livre do grid `.slots.potions`: mesma coluna do slot de mana e mesma
// linha do #btnBag, derivada de dois getBoundingClientRect() e nunca do CSS
// (RNF-07) — medida em (330, 672) no alvo 390x844 e (300, 468) no 360x640.
const lerAlvoAbrir = (page) => page.evaluate((selAbrir) => {
  const M = window.__M;
  const el = document.querySelector(selAbrir);
  const centro = M.centro(selAbrir);
  let livre = null;
  const slots = [...document.querySelectorAll('.slots.potions .slot')]
    .filter((s) => M.visible(s))
    .map((s) => s.getBoundingClientRect());
  if (slots.length === 3) {
    livre = {
      x: Math.max(...slots.map((r) => r.left + r.width / 2)),
      y: Math.max(...slots.map((r) => r.top + r.height / 2)),
    };
  }
  const ponto = centro || livre;
  let acerto = null;
  if (ponto) {
    const sob = document.elementFromPoint(ponto.x, ponto.y);
    acerto = !sob ? null : (el && (sob === el || el.contains(sob)) ? 'alvo' : M.label(sob));
  }
  return {
    innerWidth, innerHeight,
    existe: !!el,
    caixa: M.rect(selAbrir),
    pointerEvents: el ? getComputedStyle(el).pointerEvents : null,
    ponto, origem: centro ? 'alvo' : 'célula livre do grid',
    acerto,
  };
}, SEL_CHAT_ABRIR);

// Abre por toque real e, se nada abrir, mede pelo Enter de js/main.js:574 com
// registro explícito: sem o alvo de UI-01 o dedo não abre nada hoje, e as ACs de
// UI-02, UI-05 e RNF-03 AC 2 ficariam sem número medido — o campo é o mesmo nos
// dois caminhos, então medi-lo pelo teclado não inventa estado nenhum.
async function abrirChatPorToque(page, ctx, ponto, etapa) {
  await page.touchscreen.tap(ponto.x, ponto.y);
  await new Promise((r) => setTimeout(r, 350));
  let est = await lerChat(page);
  const abriuNoToque = est.chatting === true;
  if (!abriuNoToque) {
    console.log(`  CHAT: ${ctx} ${etapa} — o toque em ${ponto.x.toFixed(1)},${ponto.y.toFixed(1)}`
      + ' não abriu o chat; medindo o campo pelo Enter de js/main.js:574');
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 350));
    est = await lerChat(page);
  }
  return { est, abriuNoToque };
}

// Fecha pelo alvo de UI-05 com toque real; sem ele, cai no Escape de
// js/main.js:571 só para devolver a página limpa aos casos seguintes.
async function fecharChat(page, est) {
  if (est.centroFechar) {
    await page.touchscreen.tap(est.centroFechar.x, est.centroFechar.y);
  } else {
    await page.keyboard.press('Escape');
  }
  await new Promise((r) => setTimeout(r, 350));
  return lerChat(page);
}

async function medirChat(page, ctx) {
  // ---------- 1. Abrir ----------
  const abrir = await lerAlvoAbrir(page);
  if (!abrir.existe) {
    errors.push(`CHAT: ${ctx} não encontrou ${SEL_CHAT_ABRIR} no DOM — o dedo não tem`
      + ' como abrir a conversa (UI-01, RF-03)');
  }
  if (!abrir.caixa) {
    errors.push(`CHAT: ${ctx} ${SEL_CHAT_ABRIR} não tem caixa visível para medir (UI-01 AC 1)`);
  } else {
    if (abrir.caixa.width < ALVO_MIN || abrir.caixa.height < ALVO_MIN) {
      errors.push(`CHAT: ${ctx} o alvo de abrir mede ${caixa(abrir.caixa)}, abaixo de`
        + ` ${ALVO_MIN}x${ALVO_MIN} (UI-01 AC 1)`);
    }
    // RF-04 AC 3: a borda esquerda sai de TOUCH_STICK_ZONE e TOUCH_STICK_RADIUS
    // lidos de js/balance.js — 259 em 390x844 e 244 em 360x640, nunca literais.
    const bordaZona = TOUCH_STICK_ZONE * abrir.innerWidth + TOUCH_STICK_RADIUS;
    if (abrir.caixa.left < bordaZona) {
      errors.push(`CHAT: ${ctx} o alvo de abrir começa em ${abrir.caixa.left.toFixed(1)},`
        + ` dentro da zona do joystick que vai até ${bordaZona.toFixed(1)} (RF-04 AC 3)`);
    }
  }
  if (abrir.existe && abrir.pointerEvents !== 'auto') {
    errors.push(`CHAT: ${ctx} o alvo de abrir está com pointer-events: ${abrir.pointerEvents},`
      + ' esperado auto (RF-03 AC 3)');
  }
  if (!abrir.ponto) {
    errors.push(`CHAT: ${ctx} não achou nem o alvo de abrir nem a célula livre do grid`
      + ' .slots.potions — sem coordenada não há toque real a medir');
    return;
  }
  // RF-03 AC 2: o teste de acerto é o que separa alvo de verdade de caixa
  // geometricamente certa que o dedo atravessa.
  if (abrir.acerto !== 'alvo') {
    errors.push(`CHAT: ${ctx} o elementFromPoint na ${abrir.origem}`
      + ` (${abrir.ponto.x.toFixed(1)},${abrir.ponto.y.toFixed(1)}) devolve ${abrir.acerto},`
      + ` esperado ${SEL_CHAT_ABRIR} ou descendente (RF-03 AC 2)`);
  }

  const { est: pos, abriuNoToque } = await abrirChatPorToque(page, ctx, abrir.ponto, 'primeira abertura');

  // ---------- 2. Estado depois do toque ----------
  if (!abriuNoToque) {
    errors.push(`CHAT: ${ctx} o toque real na ${abrir.origem} não abriu o campo —`
      + ' __SF.chatting continuou false depois do tap (RF-03 AC 1 e AC 4)');
  }
  if (!pos.existeCampo) {
    errors.push(`CHAT: ${ctx} o #chatInput não existe nem depois de abrir (RF-03 AC 1)`);
  } else {
    if (pos.campoHidden) errors.push(`CHAT: ${ctx} o #chatInput continuou com a classe hidden (RF-03 AC 1)`);
    if (!pos.campoVisivel) errors.push(`CHAT: ${ctx} o #chatInput não ficou visível (RF-03 AC 1)`);
    if (!pos.campoFocado) {
      errors.push(`CHAT: ${ctx} o foco ficou em "${pos.ativo}", esperado chatInput`
        + ' (RF-03 AC 1, UI-02 AC 4)');
    }
  }
  // RF-04 AC 1 e AC 2 — GUARDA DE NÃO REGRESSÃO, verde por construção. O portão
  // do joystick é listener do #canvas (js/main.js:602, teste de zona em :608) e
  // o #actionBar é IRMÃO do #canvas (index.html:159), não descendente: um toque
  // em botão da barra nunca chega àquele handler. As duas reprovam se alguém
  // mover o portão para document/#game ou reparentar a barra. Ninguém deve
  // "consertar" as duas por passarem de primeira.
  if (pos.stickActive !== false) {
    errors.push(`CHAT: ${ctx} o toque no alvo de chat ativou o joystick —`
      + ` __SF.stick.active = ${pos.stickActive} (RF-04 AC 1)`);
  }
  if (pos.moveGoal !== null) {
    errors.push(`CHAT: ${ctx} o toque no alvo de chat emitiu ordem de movimento —`
      + ` __SF.moveGoal = ${JSON.stringify(pos.moveGoal)} (RF-04 AC 1)`);
  }
  if (pos.stickHidden !== true) {
    errors.push(`CHAT: ${ctx} o #stick perdeu a classe hidden depois do toque no alvo`
      + ' de chat (RF-04 AC 2)');
  }

  // ---------- 3. Campo ----------
  if (!pos.rCampo) {
    errors.push(`CHAT: ${ctx} o #chatInput não tem caixa visível para medir (UI-02 AC 1)`);
  } else {
    if (pos.rCampo.height < ALVO_MIN) {
      errors.push(`CHAT: ${ctx} o #chatInput mede ${pos.rCampo.height.toFixed(1)}px de altura,`
        + ` abaixo do piso de ${ALVO_MIN} (UI-02 AC 1)`);
    }
    if (!dentroDaViewport(pos.rCampo, pos.innerWidth, pos.innerHeight)) {
      errors.push(`CHAT: ${ctx} o #chatInput ocupa ${caixa(pos.rCampo)} e sai da viewport`
        + ` de ${pos.innerWidth}x${pos.innerHeight} (UI-02 AC 3)`);
    }
    // UI-02 AC 2 só tem sentido com o #log na tela: abaixo de 460px de altura
    // ele some por styles.css:410, __M.rect devolve null e __M.intersects
    // devolveria false com operando nulo — a AC passaria vazia.
    if (!pos.rLog) {
      console.log(`  CHAT: ${ctx} #log oculto por max-height: 460px — UI-02 AC 2 pulada`);
    } else if (pos.cruzaLog) {
      errors.push(`CHAT: ${ctx} o #chatInput (${caixa(pos.rCampo)}) cobre o #log`
        + ` (${caixa(pos.rLog)}) — chat-grupo.md §5 (UI-02 AC 2)`);
    }
  }
  if (pos.existeCampo && pos.maxLength !== CHAT_MAX_LEN) {
    errors.push(`CHAT: ${ctx} o #chatInput está com maxLength ${pos.maxLength},`
      + ` esperado CHAT_MAX_LEN = ${CHAT_MAX_LEN} de js/balance.js (RNF-03 AC 2)`);
  }

  // ---------- 4. Alvo de fechar ----------
  if (!pos.existeFechar) {
    errors.push(`CHAT: ${ctx} não existe alvo de fechar (${SEL_CHAT_FECHAR}) com o chat`
      + ' aberto — no celular não há Escape e o jogador fica preso no campo (UI-05 AC 1, RF-05)');
  } else {
    if (!pos.rFechar) {
      errors.push(`CHAT: ${ctx} ${SEL_CHAT_FECHAR} existe mas não está visível com o chat aberto (UI-05 AC 2)`);
    } else {
      if (pos.rFechar.width < ALVO_MIN || pos.rFechar.height < ALVO_MIN) {
        errors.push(`CHAT: ${ctx} o alvo de fechar mede ${caixa(pos.rFechar)}, abaixo de`
          + ` ${ALVO_MIN}x${ALVO_MIN} (UI-05 AC 1)`);
      }
      if (!dentroDaViewport(pos.rFechar, pos.innerWidth, pos.innerHeight)) {
        errors.push(`CHAT: ${ctx} o alvo de fechar ocupa ${caixa(pos.rFechar)} e sai da`
          + ` viewport de ${pos.innerWidth}x${pos.innerHeight} (UI-05 AC 3)`);
      }
      if (pos.fecharCruzaCampo) {
        errors.push(`CHAT: ${ctx} o alvo de fechar (${caixa(pos.rFechar)}) cobre o #chatInput`
          + ` (${caixa(pos.rCampo)}) (UI-05 AC 4)`);
      }
      if (pos.rLog && pos.fecharCruzaLog) {
        errors.push(`CHAT: ${ctx} o alvo de fechar (${caixa(pos.rFechar)}) cobre o #log`
          + ` (${caixa(pos.rLog)}) (UI-05 AC 4)`);
      }
      if (pos.acertoFechar !== 'alvo') {
        errors.push(`CHAT: ${ctx} o elementFromPoint no centro do alvo de fechar devolve`
          + ` ${pos.acertoFechar}, esperado ${SEL_CHAT_FECHAR} ou descendente (RF-05 AC 4)`);
      }
    }
    if (pos.fecharPointerEvents !== 'auto') {
      errors.push(`CHAT: ${ctx} o alvo de fechar está com pointer-events:`
        + ` ${pos.fecharPointerEvents}, esperado auto (UI-05 AC 3)`);
    }
  }

  // ---------- 5. Fechar por toque, sem enviar ----------
  if (pos.campoFocado) await page.keyboard.type(SENTINELA_CHAT);
  const fechado = await fecharChat(page, pos);
  if (fechado.chatting !== false) {
    errors.push(`CHAT: ${ctx} depois do toque no alvo de fechar __SF.chatting continua`
      + ` ${fechado.chatting} (RF-05 AC 1)`);
  }
  if (fechado.existeCampo && (!fechado.campoHidden || fechado.campoVisivel)) {
    errors.push(`CHAT: ${ctx} o #chatInput continua visível depois de fechar —`
      + ` hidden ${fechado.campoHidden}, visível ${fechado.campoVisivel} (RF-05 AC 2)`);
  }
  if (fechado.ativo === 'chatInput') {
    errors.push(`CHAT: ${ctx} o #chatInput continua com o foco depois de fechar (RF-05 AC 2)`);
  }
  if (fechado.logInnerText.includes(SENTINELA_CHAT)) {
    errors.push(`CHAT: ${ctx} fechar por toque enviou a mensagem — a sentinela`
      + ` "${SENTINELA_CHAT}" apareceu no #log (RF-05 AC 5)`);
  }
  if (fechado.fecharVisivel) {
    errors.push(`CHAT: ${ctx} o alvo de fechar continua visível com o chat fechado —`
      + ' a visibilidade tem de ser exatamente __SF.chatting (UI-05 AC 2)');
  }

  // ---------- 6. Reabrir ----------
  const { est: rea, abriuNoToque: reabriuNoToque } = await abrirChatPorToque(page, ctx, abrir.ponto, 'reabertura');
  if (!reabriuNoToque) {
    errors.push(`CHAT: ${ctx} o segundo toque no alvo de abrir não reabriu o campo (RF-03 AC 5)`);
  }
  if (rea.qtdCampos !== 1) {
    errors.push(`CHAT: ${ctx} a reabertura deixou ${rea.qtdCampos} #chatInput no DOM,`
      + ' esperado 1 — chatEl é memoizado em js/main.js:668 (RF-03 AC 5)');
  }
  if (rea.valor !== '') {
    errors.push(`CHAT: ${ctx} a reabertura trouxe o campo com "${rea.valor}", esperado vazio`
      + ' (RF-05 AC 5)');
  }
  if (rea.existeCampo && (rea.campoHidden || !rea.campoVisivel || !rea.campoFocado)) {
    errors.push(`CHAT: ${ctx} a reabertura não devolveu campo visível e focado —`
      + ` hidden ${rea.campoHidden}, visível ${rea.campoVisivel}, foco "${rea.ativo}" (RF-03 AC 5)`);
  }

  // ---------- 6b. Toque repetido no alvo de abrir não pode apagar o rascunho ----------
  // O #btnChat mora no canto inferior direito e o campo no esquerdo: o botão
  // continua visível e tocável com a conversa já aberta. Sem guarda de
  // reentrância, o segundo toque caía no `chatEl.value = ''` de openChat() e
  // levava junto o que a pessoa tinha digitado. O caminho de teclado nunca
  // sofreu disso — o keydown global retorna cedo quando S.chatting é true —,
  // então isto é regressão exclusiva do caminho de toque.
  if (rea.existeCampo) {
    const RASCUNHO = 'mensagem em rascunho';
    await page.type('#chatInput', RASCUNHO);
    await page.touchscreen.tap(abrir.ponto.x, abrir.ponto.y);
    await new Promise((r) => setTimeout(r, 350));
    const depoisDoSegundoToque = await lerChat(page);
    if (depoisDoSegundoToque.valor !== RASCUNHO) {
      errors.push(`CHAT: ${ctx} o segundo toque no alvo de abrir com a conversa já aberta`
        + ` apagou o rascunho — campo virou "${depoisDoSegundoToque.valor}",`
        + ` esperado "${RASCUNHO}"`);
    }
    if (depoisDoSegundoToque.chatting !== true) {
      errors.push(`CHAT: ${ctx} o segundo toque no alvo de abrir fechou a conversa em vez`
        + ' de mantê-la aberta');
    }
    if (depoisDoSegundoToque.existeCampo && !depoisDoSegundoToque.campoFocado) {
      errors.push(`CHAT: ${ctx} o segundo toque no alvo de abrir tirou o foco do campo —`
        + ` foco em "${depoisDoSegundoToque.ativo}"`);
    }
    // Devolve o campo limpo para os casos seguintes não herdarem o rascunho.
    await page.evaluate(() => { const c = document.getElementById('chatInput'); if (c) c.value = ''; });
  }

  // ---------- 6c. Encanamento do --kb (teclado virtual) ----------
  // Emulação não tem teclado virtual, então a medida real de visualViewport nunca
  // dispara aqui. O que dá para testar é o encanamento: empurrar a property na mão
  // e conferir que campo, ✕ e #log sobem juntos. Sem isto, uma regressão que
  // desligasse o --kb do CSS passaria despercebida, e o defeito só apareceria em
  // aparelho de verdade, com o teclado cobrindo a faixa de chat.
  if (rea.existeCampo) {
    const KB = 260;
    const antes = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return +b.bottom.toFixed(1); };
      return { campo: r('#chatInput'), fechar: r('#btnChatClose'), log: r('#log') };
    });
    const depois = await page.evaluate((kb) => {
      document.documentElement.style.setProperty('--kb', kb + 'px');
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return +b.bottom.toFixed(1); };
      return { campo: r('#chatInput'), fechar: r('#btnChatClose'), log: r('#log') };
    }, KB);
    for (const [nome, sel] of [['#chatInput', 'campo'], ['#btnChatClose', 'fechar'], ['#log', 'log']]) {
      if (antes[sel] === null || depois[sel] === null) continue;
      const subiu = antes[sel] - depois[sel];
      if (Math.abs(subiu - KB) > 1) {
        errors.push(`CHAT: ${ctx} com --kb de ${KB}px o ${nome} subiu ${subiu.toFixed(1)}px,`
          + ` esperado ${KB} — o deslocamento do teclado virtual não chega nesse elemento`);
      }
    }
    await page.evaluate(() => { document.documentElement.style.removeProperty('--kb'); });
  }

  // ---------- 7. UI-02 AC 6: o bloqueio da zona do joystick é temporário ----------
  // touchStart/touchEnd SEPARADOS, obrigatoriamente: endStick está pendurado em
  // pointerup no window (js/main.js:644-649), então um tap() completo devolveria
  // stick.active === false sempre e a AC viraria falso vermelho.
  const alvoZona = rea.centroCampo;
  if (!alvoZona) {
    errors.push(`CHAT: ${ctx} sem caixa de #chatInput não dá para medir o bloqueio`
      + ' temporário da zona do joystick (UI-02 AC 6)');
  } else {
    await page.touchscreen.touchStart(alvoZona.x, alvoZona.y);
    await new Promise((r) => setTimeout(r, 200));
    const comChat = await page.evaluate(() => window.__SF.stick.active);
    await page.touchscreen.touchEnd();
    await new Promise((r) => setTimeout(r, 200));
    if (comChat !== false) {
      errors.push(`CHAT: ${ctx} com o chat aberto o toque no centro do campo ativou o`
        + ` joystick — __SF.stick.active = ${comChat} (UI-02 AC 6)`);
    }
    const depois = await fecharChat(page, rea);
    if (depois.chatting !== false) {
      errors.push(`CHAT: ${ctx} não conseguiu fechar o chat antes de medir a mesma`
        + ` coordenada com o campo oculto — chatting ${depois.chatting} (UI-02 AC 6)`);
    }
    await page.touchscreen.touchStart(alvoZona.x, alvoZona.y);
    await new Promise((r) => setTimeout(r, 200));
    const semChat = await page.evaluate(() => window.__SF.stick.active);
    await page.touchscreen.touchEnd();
    await new Promise((r) => setTimeout(r, 200));
    if (semChat !== true) {
      errors.push(`CHAT: ${ctx} com o chat fechado o toque em`
        + ` ${alvoZona.x.toFixed(1)},${alvoZona.y.toFixed(1)} não ativou o joystick —`
        + ` __SF.stick.active = ${semChat}; o bloqueio do campo não era temporário (UI-02 AC 6)`);
    }
  }

  // Devolve a página com o chat fechado: medirBarra e medirGeometria medem
  // depois daqui e um campo aberto mudaria a caixa que elas leem.
  const final = await lerChat(page);
  if (final.chatting !== false) {
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 250));
  }
  await page.screenshot({ path: `${OUT}/12-mobile-chat-${ctx}.png` });
}

// UI-02 AC 5 — a tela mais apertada em que o chat ainda existe. Em 390x440 o
// #log já sumiu por styles.css:410 e a AC 2 se cala; sem esta medição o campo
// ficaria sem nenhum número nessa altura.
async function medirChatAltura(page, ctx) {
  const abrir = await lerAlvoAbrir(page);
  if (!abrir.ponto) {
    errors.push(`CHAT: ${ctx} não achou coordenada de abertura para medir UI-02 AC 5`);
    return;
  }
  const { est } = await abrirChatPorToque(page, ctx, abrir.ponto, 'abertura em altura reduzida');
  if (!est.rCampo) {
    errors.push(`CHAT: ${ctx} o #chatInput não tem caixa visível com o chat aberto (UI-02 AC 5)`);
  } else {
    if (est.rCampo.height < ALVO_MIN) {
      errors.push(`CHAT: ${ctx} o #chatInput mede ${est.rCampo.height.toFixed(1)}px de altura,`
        + ` abaixo do piso de ${ALVO_MIN} (UI-02 AC 5)`);
    }
    if (!dentroDaViewport(est.rCampo, est.innerWidth, est.innerHeight)) {
      errors.push(`CHAT: ${ctx} o #chatInput ocupa ${caixa(est.rCampo)} e sai da viewport`
        + ` de ${est.innerWidth}x${est.innerHeight} (UI-02 AC 5)`);
    }
    if (est.cruzaBarra) {
      errors.push(`CHAT: ${ctx} o #chatInput (${caixa(est.rCampo)}) cruza o #actionBar`
        + ' (UI-02 AC 5)');
    }
  }
  const fim = await fecharChat(page, est);
  if (fim.chatting !== false) {
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 250));
  }
}

// UI-04 — teto de linhas do #log. LOG_MAX_LINES é a única primitiva (lida de
// js/balance.js por mobile-helpers.mjs) e a altura é CONSEQUÊNCIA MEDIDA dela:
// LOG_MAX_LINES x o line-height lido na página em execução, mais 1px de folga
// de subpixel. Nenhum literal em px ou vh entra aqui (RNF-07, UI-04 AC 3).
//
// A régua de linha visível é a contenção de retângulo inteiro de __M.linhasContidas.
// Como o #log é `flex-direction: column-reverse` e UI.pushLog faz prepend, a
// linha mais nova fica embaixo e as antigas transbordam pelo topo — por isso
// empurrar LOG_MAX_LINES + 3 linhas satura a caixa e a contagem passa a medir
// geometria, não histórico. medirLog é o ÚLTIMO caso do alvo: ele suja o #log.
// UI-04 AC 4: o #log de mouse continua em min(340px, 42vw) por 26vh. Os três
// números são os da própria AC, e a comparação é sempre contra a página em
// execução — getComputedStyle e innerWidth/innerHeight, nunca leitura do
// arquivo .css (RNF-07). O teto de LOG_MAX_LINES é do toque e não desce aqui:
// aplicá-lo no desktop reprovaria justamente a AC que manda não mexer (RNF-06).
const LOG_MOUSE = { larguraMax: 340, larguraVw: 0.42, alturaVh: 0.26 };
async function medirLog(page, ctx, modo = 'toque') {
  const m = await page.evaluate((extra) => {
    const box = document.getElementById('log');
    if (!box) return { erro: 'o #log não existe no DOM' };
    // Uma <p class="system"> por linha, com prepend, exatamente como
    // UI.pushLog faz em js/ui.js:90-98.
    for (let i = 1; i <= extra; i++) {
      const p = document.createElement('p');
      p.className = 'system';
      p.textContent = `Linha de medição ${i} do registro.`;
      box.prepend(p);
    }
    const r = window.__M.rect('#log');
    return {
      oculto: !r,
      caixa: r,
      empurradas: extra,
      total: box.querySelectorAll('p').length,
      contidas: window.__M.linhasContidas('#log', 'p'),
      lineHeight: parseFloat(getComputedStyle(box).lineHeight),
      larguraCalculada: parseFloat(getComputedStyle(box).width),
      alturaMaxCalculada: parseFloat(getComputedStyle(box).maxHeight),
      innerWidth, innerHeight,
    };
  }, LOG_MAX_LINES + 3);
  if (m.erro) { errors.push(`LOG: ${ctx} ${m.erro}`); return; }
  if (modo === 'mouse') {
    if (m.oculto) { errors.push(`LOG: ${ctx} (mouse) o #log não está visível (UI-04 AC 4)`); return; }
    const larguraEsperada = Math.min(LOG_MOUSE.larguraMax, LOG_MOUSE.larguraVw * m.innerWidth);
    const alturaEsperada = LOG_MOUSE.alturaVh * m.innerHeight;
    if (Math.abs(m.larguraCalculada - larguraEsperada) > TOL) {
      errors.push(`LOG: ${ctx} (mouse) o #log mede ${m.larguraCalculada.toFixed(1)}px de largura,`
        + ` esperado ${larguraEsperada.toFixed(1)}px = min(${LOG_MOUSE.larguraMax}px,`
        + ` ${LOG_MOUSE.larguraVw * 100}vw) (UI-04 AC 4)`);
    }
    if (Math.abs(m.alturaMaxCalculada - alturaEsperada) > TOL) {
      errors.push(`LOG: ${ctx} (mouse) o #log está com max-height ${m.alturaMaxCalculada.toFixed(1)}px,`
        + ` esperado ${alturaEsperada.toFixed(1)}px = ${LOG_MOUSE.alturaVh * 100}vh (UI-04 AC 4)`);
    }
    console.log(`  LOG: ${ctx} (mouse) ${m.contidas} linha(s) contida(s) de ${m.total},`
      + ` ${m.larguraCalculada.toFixed(1)}x${m.caixa.height.toFixed(1)}px,`
      + ` max-height ${m.alturaMaxCalculada.toFixed(1)}px`);
    return;
  }
  // AC 5: nas alturas 440, 380 e 360 a regra @media (max-height: 460px) de
  // styles.css:410 apaga o #log. As ACs 1 e 2 são PULADAS COM REGISTRO, nunca
  // dadas por aprovadas em silêncio.
  if (m.oculto) {
    console.log(`  LOG: ${ctx} #log oculto por max-height: 460px, ACs 1 e 2 puladas`);
    return;
  }
  if (m.contidas > LOG_MAX_LINES) {
    errors.push(`LOG: ${ctx} o #log mostra ${m.contidas} linhas inteiras com ${m.total}`
      + ` empurradas, teto de ${LOG_MAX_LINES} (UI-04 AC 1)`);
  }
  const teto = LOG_MAX_LINES * m.lineHeight + 1;
  if (m.caixa.height > teto) {
    errors.push(`LOG: ${ctx} o #log mede ${m.caixa.height.toFixed(1)}px de altura contra o teto`
      + ` derivado de ${teto.toFixed(1)}px (${LOG_MAX_LINES} x ${m.lineHeight.toFixed(2)}px de`
      + ' line-height medido + 1) (UI-04 AC 2)');
  }
  console.log(`  LOG: ${ctx} ${m.contidas} linha(s) contida(s) de ${m.total},`
    + ` caixa ${m.caixa.height.toFixed(1)}px, line-height ${m.lineHeight.toFixed(2)}px`);
}

for (const viewport of [VIEWPORT_MOBILE, VIEWPORT_SMALL]) {
  const ctx = `${viewport.width}x${viewport.height}`;
  const mob = await abrirToque(viewport);
  await medirIndicadorConexao(mob, ctx);
  // Antes de qualquer caso que empurre linha no #log: a âncora de RF-02 é a
  // primeira linha da partida e o teto de CHAT_LOG_LINES roda o resto para fora.
  await medirAbertura(mob, ctx, 'toque');
  await medirTeclas(mob, ctx, 'toque');
  await medirToque(mob, ctx);
  await medirAudioLayout(mob, ctx, 'toque');
  // Cedo na partida de propósito: o paladino solo sobrevive tranquilo aos
  // primeiros segundos, e updatePickup() ignora jogador morto.
  await encherMochila(mob, ctx);
  await medirMochila(mob, ctx);
  // Depois de medirMochila, que já fecha o #bag: um painel aberto cobriria o
  // alvo de abrir e o elementFromPoint mediria o painel em vez do botão.
  await medirChat(mob, ctx);
  await medirBarra(mob, ctx);
  await medirGeometria(mob, ctx);
  // Último caso do alvo cheio: medirLog empurra 9 sentinelas e suja o #log.
  await medirLog(mob, ctx);
  // As sete alturas da AC 1 de UI-03 são medidas na largura 390. Trocar só a
  // altura não mexe em isMobile/hasTouch, então o Puppeteer não recarrega a aba
  // e a partida em curso continua de pé.
  if (viewport === VIEWPORT_MOBILE) {
    for (const height of ALTURAS_UI03) {
      await mob.setViewport(alturaMobile(height));
      await new Promise((r) => setTimeout(r, 300));
      await medirGeometria(mob, `390x${height}`);
      if (height === 440) await medirChatAltura(mob, `390x${height}`);
      await medirLog(mob, `390x${height}`);
    }
    await mob.setViewport(VIEWPORT_MOBILE);
  }
  await mob.close();
}

// A passagem de mouse fecha RF-01 AC 3, RF-02 AC 3 e UI-01 AC 6 sem tocar nos
// alvos de toque: viewport própria, aba própria, mesma execução.
const CTX_MOUSE = `${VIEWPORT_DESKTOP.width}x${VIEWPORT_DESKTOP.height}`;
const mouse = await abrirMouse();
await medirIndicadorConexao(mouse, CTX_MOUSE);
await medirAbertura(mouse, CTX_MOUSE, 'mouse');
await medirTeclas(mouse, CTX_MOUSE, 'mouse');
await medirBarraMouse(mouse, CTX_MOUSE);
// P1D-13: a abertura por chip ainda pertence à próxima etapa; aqui o browser
// revela o painel diretamente para medir apenas a superfície que o CSS entrega.
await mouse.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await medirAudioLayout(mouse, '1440x900', 'mouse');
// UI-04 AC 4: no mouse o #log continua em min(340px, 42vw) por 26vh — a mesma
// régua de contenção, contra o teto do CSS de desktop, que esta feature não toca.
await medirLog(mouse, CTX_MOUSE, 'mouse');
await mouse.close();

// P1D-14: a página nova monta a camada com a preferência salva e espelha esse
// estado antes de o jogo começar; não é necessário entrar em outra sessão para
// provar a restauração dos controles.
await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
await new Promise((r) => setTimeout(r, 300));
const controlesAudioRestaurados = await page.evaluate(() => {
  const panel = document.getElementById('audioPanel');
  const mute = document.getElementById('btnAudioMute');
  return {
    hidden: panel.classList.contains('hidden'),
    expanded: document.getElementById('audioChip').getAttribute('aria-expanded'),
    music: document.getElementById('audioMusic').value,
    sfx: document.getElementById('audioSfx').value,
    mute: { text: mute.textContent, pressed: mute.getAttribute('aria-pressed') },
  };
});
if (
  !controlesAudioRestaurados.hidden ||
  controlesAudioRestaurados.expanded !== 'false' ||
  controlesAudioRestaurados.music !== '0.23' ||
  controlesAudioRestaurados.sfx !== '0.61' ||
  controlesAudioRestaurados.mute.text !== 'Som desligado' ||
  controlesAudioRestaurados.mute.pressed !== 'true'
) {
  errors.push('ÁUDIO: reload não restaurou o estado persistido nos controles — '
    + JSON.stringify(controlesAudioRestaurados));
}

// RF-02 AC 2: a comparação é de igualdade estrita entre as duas linhas medidas
// nesta mesma execução. Hoje as duas são a mesma string de teclado.
const aberturaToque = aberturas.get('toque');
const aberturaMouse = aberturas.get('mouse');
if (aberturaToque === undefined || aberturaMouse === undefined) {
  errors.push('ABERTURA: faltou medir a linha de abertura de um dos modos —'
    + ` toque ${aberturaToque === undefined ? 'ausente' : 'ok'},`
    + ` mouse ${aberturaMouse === undefined ? 'ausente' : 'ok'}`);
} else if (aberturaToque === aberturaMouse) {
  errors.push('ABERTURA: as duas mensagens são iguais — toque e mouse mostram'
    + ` "${aberturaToque}"`);
}

console.log('\n--- resultado ---');
console.log('combate:', JSON.stringify(combat));
console.log('andar:  ', JSON.stringify(floorTest));
console.log('chefe HC:', JSON.stringify(hardcore));
console.log('fps:    ', fps);
console.log('zona joystick:', JSON.stringify(Object.fromEntries(zonas)));
console.log('abertura:', JSON.stringify(Object.fromEntries(aberturas)));
console.log('erros:  ', errors.length ? errors : 'nenhum');
const warn = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[warning]'));
console.log('console:', warn.length ? warn.slice(0, 10) : 'limpo');

await browser.close();
process.exit(errors.length ? 1 : 0);
