import { VOCATIONS, VOC_LIST, RARITY, EQUIP_SLOTS, SLOT_LABEL, ITEM_BASES, xpForLevel } from './data.js';
import { drawGlyph } from './render.js';
import { AllyRail, directionArrow } from './allyrail.js';
import { EMBER_LINK_FAR, PORTAL_HOLD, CHAT_LOG_LINES, LOG_MAX_LINES } from './balance.js';

export const el = (id) => document.getElementById(id);

const WEAPON_GLYPH = { knight: 'sword', paladin: 'bow', sorcerer: 'wand', druid: 'rod' };

export function showScreen(name) {
  el('menu').classList.toggle('hidden', name !== 'menu');
  el('lobby').classList.toggle('hidden', name !== 'lobby');
  el('queue').classList.toggle('hidden', name !== 'queue');
  el('game').classList.toggle('hidden', name !== 'game');
}

export function setStatus(msg, cls = '') {
  const s = el('menuStatus');
  s.textContent = msg;
  s.className = 'menu-status ' + cls;
}

// ---------- Recusa de entrada ----------
// Um vocabulário só para os quatro motivos, usado pelo menu e pelo retorno do lobby.
// Cheia e trancada não são erro de digitação, então o texto não manda conferir o código.
export const REFUSAL = {
  short: 'O código tem 4 letras.',
  charset: 'Esse caractere não existe em código de sala.',
  notfound: 'Sala não encontrada. Confira o código.',
  full: 'Sala cheia — já são 10 jogadores.',
  locked: 'Sala trancada pelo host.',
  offline: 'Não consegui falar com o servidor de encontro. Verifique sua conexão.',
};

export function refusalText(reason, fallback = '') {
  return REFUSAL[reason] || fallback || 'Não consegui entrar na sala.';
}

// Mostra a recusa sem tirar o jogador da tela e sem recarregar nada.
export function refuse(reason, fallback = '') {
  const msg = refusalText(reason, fallback);
  setStatus(msg, 'err');
  return msg;
}

// ---------- Menu ----------
export function buildVocationCards(onPick, gridId = 'vocGrid', respectLock = true) {
  const grid = el(gridId);
  grid.innerHTML = '';
  for (const id of VOC_LIST) {
    const V = VOCATIONS[id];
    const card = document.createElement('button');
    card.className = 'voc-card';
    card.style.setProperty('--vc', V.color);
    card.dataset.voc = id;
    const cv = document.createElement('canvas');
    cv.width = 40; cv.height = 40;
    const cx = cv.getContext('2d');
    drawGlyph(cx, WEAPON_GLYPH[id], 20, 20, 1.35, V.color);
    card.appendChild(cv);
    const b = document.createElement('b'); b.textContent = V.name; card.appendChild(b);
    const i = document.createElement('i'); i.textContent = V.tag; card.appendChild(i);
    card.onclick = () => { if (respectLock && vocLocked) return; selectVocation(id); onPick(id); };
    grid.appendChild(card);
  }
}

// A vocação trava quando a partida começa. Quem está na fila de late join
// continua podendo trocar até ser inserido, por isso é uma trava explícita
// e não a simples ausência da tela.
let vocLocked = false;
export function lockVocation(v) {
  vocLocked = !!v;
  for (const c of document.querySelectorAll('.voc-card')) {
    c.disabled = vocLocked;
    c.classList.toggle('locked', vocLocked);
  }
}
export function isVocationLocked() { return vocLocked; }

export function selectVocation(id) {
  for (const c of document.querySelectorAll('.voc-card')) c.classList.toggle('on', c.dataset.voc === id);
  if (!el('vocDetail')) return;
  const V = VOCATIONS[id];
  el('vocDetail').innerHTML = `<b>${V.name}</b> — ${V.blurb}<br>`
    + V.skills.map((s) => `<span style="color:${V.color}">${s.icon}</span> ${s.name}`).join(' · ');
}

// ---------- Registro / avisos ----------
export function pushLog(msg, cls = 'system') {
  const box = el('log');
  const p = document.createElement('p');
  p.className = cls;
  p.innerHTML = msg;
  box.prepend(p);
  // Teto de linhas: com 10 pessoas conversando o log não pode crescer sem fim.
  while (box.children.length > CHAT_LOG_LINES) box.lastChild.remove();
}

let bannerTimer = null;
export function banner(title, sub = '', ms = 2600) {
  el('bannerTitle').textContent = title;
  el('bannerSub').textContent = sub;
  el('banner').classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el('banner').classList.add('hidden'), ms);
}

// ---------- HUD ----------
// O teto de linhas do #log no toque é primitiva de js/balance.js (AGENTS.md:57) e o
// CSS precisa dele sem repetir o número: publicamos a constante como custom
// property e o styles.css deriva a altura dela. Escrito aqui porque o #log é HUD, e
// HUD é de js/ui.js pela tabela de camadas de docs/agents/architecture.md. Sem
// fallback no var() do CSS de propósito: se esta linha sumir, o max-height cai por
// inteiro e o log volta a crescer — falha barulhenta em vez de literal escondido.
// A guarda de typeof é pelo Node: tests/sim.test.mjs:13 importa bossBarLabel daqui e
// um efeito de módulo tocando document quebraria a suíte antes do primeiro check.
if (typeof document !== 'undefined') {
  document.documentElement.style.setProperty('--log-linhas', LOG_MAX_LINES);
}

export function buildSkillBar(voc, onCast) {
  const V = VOCATIONS[voc];
  const box = el('skillSlots');
  box.innerHTML = '';
  V.skills.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'slot skill';
    b.style.setProperty('--sc', V.color);
    b.dataset.key = s.key;
    b.innerHTML = `<span class="key">${i + 1}</span><span class="icon">${s.icon}</span><span class="cost">${s.mana}</span>`;
    b.onpointerdown = (e) => { e.preventDefault(); onCast(s.key); };
    b.onpointerenter = (e) => showTooltip(e, `<div class="tt-name" style="color:${V.color}">${s.icon} ${s.name}</div>`
      + `<div class="tt-slot">${s.mana} mana · ${s.cd}s de recarga</div>${s.desc}`);
    b.onpointerleave = hideTooltip;
    box.appendChild(b);
  });
}

export function updateSkillBar(local) {
  if (!local) return;
  const V = VOCATIONS[local.voc];
  for (const b of document.querySelectorAll('.slot.skill')) {
    const s = V.skills.find((x) => x.key === b.dataset.key);
    const cd = local.skillCd?.[b.dataset.key] || 0;
    let overlay = b.querySelector('.cd');
    if (cd > 0.05) {
      if (!overlay) { overlay = document.createElement('span'); overlay.className = 'cd'; b.appendChild(overlay); }
      overlay.textContent = cd >= 1 ? Math.ceil(cd) : cd.toFixed(1);
    } else if (overlay) overlay.remove();
    b.classList.toggle('nomana', local.mp < s.mana);
    b.classList.toggle('ready', cd <= 0.05 && local.mp >= s.mana);
  }
}

const rail = new AllyRail();

export function updateHUD(view, local, st, dt = 0) {
  if (!local) return;
  el('selfName').textContent = local.name;
  el('selfLevel').textContent = 'Nv ' + local.level;
  const V = VOCATIONS[local.voc];
  const chip = el('selfVoc');
  chip.textContent = V.tag;
  chip.style.color = V.color;

  const hpPct = Math.max(0, local.hp / st.maxHp) * 100;
  const mpPct = Math.max(0, local.mp / st.maxMp) * 100;
  el('barHp').style.width = hpPct + '%';
  el('barMp').style.width = mpPct + '%';
  el('txtHp').textContent = `${Math.ceil(local.hp)} / ${st.maxHp}`;
  el('txtMp').textContent = `${Math.ceil(local.mp)} / ${st.maxMp}`;
  const need = xpForLevel(local.level);
  el('barXp').style.width = Math.min(100, (local.xp / need) * 100) + '%';

  el('goldChip').textContent = local.gold;
  el('floorChip').textContent = 'Andar ' + view.floor;
  el('potHp').textContent = local.potions?.hp ?? 0;
  el('potMp').textContent = local.potions?.mp ?? 0;

  // Grupo: no máximo 3 aliados no trilho, mais os caídos, mais a linha de excedente.
  const list = el('partyList');
  const mates = view.players.filter((p) => p.id !== local.id);
  const { shown, downed, extra } = rail.select(local, mates, dt);
  const visible = [...downed, ...shown];
  // O minimapa precisa saber quem já tem barra para desenhar o resto diferente.
  view.railIds = visible.map((m) => m.id);

  const wanted = visible.map((m) => m.id).join('|');
  if (list.dataset.ids !== wanted) {
    list.dataset.ids = wanted;
    list.innerHTML = '';
    for (const m of visible) {
      const d = document.createElement('div');
      d.className = 'plaque mate';
      d.dataset.pid = m.id;
      d.innerHTML = `<div class="plaque-head"><span class="plaque-name"></span><span class="plaque-level"></span></div>
        <div class="bar hp"><i></i><b></b></div><div class="bar mp"><i></i></div><span class="away hidden"></span>`;
      list.appendChild(d);
    }
    if (extra > 0) {
      const more = document.createElement('div');
      more.className = 'ally-more';
      more.textContent = `+${extra} no minimapa`;
      list.appendChild(more);
    }
  }
  for (const d of list.children) {
    if (!d.dataset.pid) continue;
    const m = visible.find((x) => x.id === d.dataset.pid);
    if (!m) continue;
    d.querySelector('.plaque-name').textContent = m.name;
    d.querySelector('.plaque-level').textContent = 'Nv ' + m.level;
    d.querySelector('.bar.hp i').style.width = Math.max(0, (m.hp / m.maxHp) * 100) + '%';
    d.querySelector('.bar.hp b').textContent = m.dead ? 'caído' : Math.ceil(m.hp);
    d.querySelector('.bar.mp i').style.width = Math.max(0, (m.mp / m.maxMp) * 100) + '%';
    d.classList.toggle('down', !!m.dead);
    const away = d.querySelector('.away');
    const dist = Math.hypot(m.x - local.x, m.y - local.y);
    // Caído mostra direção e distância a qualquer distância; vivo, só além do limite.
    const show = m.dead || dist >= EMBER_LINK_FAR;
    away.classList.toggle('hidden', !show);
    if (show) away.innerHTML = `↝ ${Math.round(dist)} tiles <i>${directionArrow(local, m)}</i>`;
  }

  // Chefe
  const boss = view.monsters.find((m) => m.isBoss && m.hp > 0 && Math.hypot(m.x - local.x, m.y - local.y) < 18);
  el('bossBar').classList.toggle('hidden', !boss);
  if (boss) {
    el('bossName').textContent = bossBarLabel(boss);
    el('barBoss').style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
  }
}

// Marca a variante por texto e não por cor: a barra do chefe precisa continuar
// dizendo HARDCORE em escala de cinza (UI-02). Pura de propósito — quem testa
// importa isto sem precisar de DOM.
export function bossBarLabel(boss) {
  const base = `${boss.name} · Nv ${boss.level}`;
  return boss.hardcore ? `${base} · HARDCORE` : base;
}

export function updateDeathOverlay(local) {
  const ov = el('deathOverlay');
  if (!local || !local.dead) { ov.classList.add('hidden'); return; }
  ov.classList.remove('hidden');
  const btn = el('btnRespawn');
  const canRespawn = local.deathTimer >= 5;
  btn.disabled = !canRespawn;
  btn.textContent = canRespawn ? 'Voltar ao início do andar' : `Aguarde ${Math.ceil(5 - local.deathTimer)}s`;
  el('deathHint').textContent = local.reviveProg > 0
    ? `Sendo reerguido… ${Math.round((local.reviveProg / 3.5) * 100)}%`
    : 'Um aliado pode reerguer você ficando por perto.';
}

// ---------- Mochila ----------
export function renderBag(player, handlers) {
  const equipCol = el('equipCol');
  equipCol.innerHTML = '';
  for (const slot of EQUIP_SLOTS) {
    const it = player.equip[slot];
    const row = document.createElement('div');
    row.className = 'equip-slot';
    const cv = document.createElement('canvas');
    cv.width = 30; cv.height = 30;
    if (it) drawGlyph(cv.getContext('2d'), it.glyph, 15, 15, 1, RARITY[it.rarity].color);
    row.appendChild(cv);
    const txt = document.createElement('div');
    txt.innerHTML = `<div class="lbl">${SLOT_LABEL[slot]}</div>`
      + `<div class="nm ${it ? 'r-' + it.rarity : ''}">${it ? it.name : '—'}</div>`;
    row.appendChild(txt);
    if (it) {
      row.onclick = () => handlers.unequip(slot);
      row.onpointerenter = (e) => showTooltip(e, itemHtml(it, player, 'Clique para tirar'));
      row.onpointerleave = hideTooltip;
    }
    equipCol.appendChild(row);
  }

  const grid = el('invGrid');
  grid.innerHTML = '';
  player.inv.forEach((it, i) => {
    const cell = document.createElement('div');
    cell.className = 'inv-slot' + (it ? ' r-' + it.rarity : '');
    if (it) {
      const cv = document.createElement('canvas');
      cv.width = 40; cv.height = 40;
      drawGlyph(cv.getContext('2d'), it.glyph, 20, 20, 1.1, RARITY[it.rarity].color);
      cell.appendChild(cv);
      cell.onclick = () => handlers.use(i);
      cell.oncontextmenu = (e) => { e.preventDefault(); handlers.drop(i); };
      cell.onpointerenter = (e) => showTooltip(e, itemHtml(it, player, 'Clique para equipar · botão direito descarta'));
      cell.onpointerleave = hideTooltip;
    }
    grid.appendChild(cell);
  });

  const st = handlers.stats();
  el('statBlock').innerHTML = [
    ['Ataque', Math.round(st.atk)], ['Defesa', Math.round(st.def)], ['Magia', Math.round(st.ml)],
    ['Velocidade', st.speed.toFixed(1)], ['Crítico', Math.round(st.crit * 100) + '%'],
    ['Roubo de vida', Math.round(st.leech * 100) + '%'],
  ].map(([k, v]) => `<div>${k} <b>${v}</b></div>`).join('');
}

function itemHtml(it, player, hint) {
  const R = RARITY[it.rarity];
  const base = ITEM_BASES.find((b) => b.id === it.baseId);
  let h = `<div class="tt-name r-${it.rarity}">${it.name}</div>`;
  h += `<div class="tt-slot">${SLOT_LABEL[it.slot] || it.slot} · ${R.name} · nível ${it.ilvl}</div>`;
  const rows = [];
  if (it.atk) rows.push(`+${it.atk} ataque`);
  if (it.def) rows.push(`+${it.def} defesa`);
  if (it.ml) rows.push(`+${it.ml} magia`);
  if (it.hp) rows.push(`+${it.hp} vida`);
  if (it.mp) rows.push(`+${it.mp} mana`);
  if (it.speed) rows.push(`+${it.speed} velocidade`);
  if (it.crit) rows.push(`+${Math.round(it.crit * 100)}% crítico`);
  if (it.leech) rows.push(`+${Math.round(it.leech * 100)}% roubo de vida`);
  h += rows.map((r) => `<div class="tt-stat">${r}</div>`).join('');
  if (it.affixes?.length) h += `<div class="tt-affix">${it.affixes.map((a) => a.name).join(' · ')}</div>`;
  if (base?.forVoc && !base.forVoc.includes(player.voc)) {
    h += `<div class="tt-warn">Sua vocação não usa este item.</div>`;
  }
  if (hint) h += `<div class="tt-hint">${hint}</div>`;
  return h;
}

export function showTooltip(e, html) {
  const tt = el('tooltip');
  tt.innerHTML = html;
  tt.classList.remove('hidden');
  const r = tt.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
  tt.style.left = x + 'px';
  tt.style.top = y + 'px';
}

export function hideTooltip() { el('tooltip').classList.add('hidden'); }

// Uma linha de jogador, usada no lobby, no painel de moderação e na fila.
// `actions` recebe [{label, cls, onClick}] e só é montado para o host.
export function rosterRow(p, { actions = [], me = false } = {}) {
  const V = VOCATIONS[p.voc] || VOCATIONS.knight;
  const row = document.createElement('div');
  row.className = 'lobby-row roster-row' + (me ? ' me' : '');
  row.dataset.pid = p.id;

  const voc = document.createElement('span');
  voc.className = 'voc-chip rr-voc';
  voc.textContent = V.tag;
  voc.style.color = V.color;

  const name = document.createElement('span');
  name.className = 'rr-name';
  name.textContent = p.name;

  row.append(voc, name);

  if (p.isHost) {
    const h = document.createElement('span');
    h.className = 'rr-host';
    h.textContent = 'Host';
    row.appendChild(h);
  }
  if (p.level) {
    const lv = document.createElement('span');
    lv.className = 'rr-level';
    lv.textContent = 'Nv ' + p.level;
    row.appendChild(lv);
  }

  const state = document.createElement('span');
  state.className = 'rr-state ' + (p.stateCls || '');
  state.textContent = p.state || '';
  row.appendChild(state);

  if (actions.length) {
    const box = document.createElement('div');
    box.className = 'rr-actions';
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = 'btn small ' + (a.cls || '');
      b.textContent = a.label;
      b.onclick = () => a.onClick(row, p);
      box.appendChild(b);
    }
    row.appendChild(box);
  }
  return row;
}

// Troca as ações da linha por uma confirmação inline. Sem modal: a partida
// continua rodando atrás, e um diálogo no meio do combate seria pior.
export function confirmInline(row, label, onYes, timeout = 5000) {
  const box = row.querySelector('.rr-actions');
  if (!box) return;
  const original = box.innerHTML;
  let done = false;
  const restore = () => { if (done) return; done = true; clearTimeout(timer); box.innerHTML = original; };
  const timer = setTimeout(restore, timeout);

  box.innerHTML = '';
  box.classList.add('confirm-inline');
  const q = document.createElement('span');
  q.textContent = label;
  const yes = document.createElement('button');
  yes.className = 'btn small yes';
  yes.textContent = 'Sim';
  yes.onclick = () => { done = true; clearTimeout(timer); onYes(); };
  const no = document.createElement('button');
  no.className = 'btn small';
  no.textContent = 'Não';
  no.onclick = restore;
  box.append(q, yes, no);
}

export function setCapacity(elId, n, max) {
  const c = el(elId);
  if (!c) return;
  c.textContent = `${n}/${max}`;
  c.classList.toggle('near', n >= max - 1);
}

export function renderLobby(players, isHost, { max = 10, locked = false } = {}) {
  const list = el('lobbyList');
  list.innerHTML = '';
  setCapacity('lobbyCount', players.length, max);
  el('lobbyLock').classList.toggle('hidden', !locked);
  list.classList.toggle('grown', players.length > 5);

  const others = players.filter((p) => !p.isHost);
  if (!others.length) {
    list.appendChild(rosterRow(players[0] || { id: 'host', name: '—', voc: 'knight', isHost: true }));
    const empty = document.createElement('div');
    empty.className = 'lobby-row empty';
    empty.textContent = 'Ninguém chegou ainda. O link está na sua mão.';
    list.appendChild(empty);
  } else {
    for (const p of players) list.appendChild(rosterRow(p));
  }

  if (players.length >= max) {
    const full = document.createElement('div');
    full.className = 'lobby-row empty';
    full.textContent = 'Sala cheia — novas entradas serão recusadas.';
    list.appendChild(full);
  }
  el('btnStart').classList.toggle('hidden', !isHost);
  el('btnLock').classList.toggle('hidden', !isHost);
}

// ---------- Painel de sala em partida ----------
export function renderRosterPanel(players, queue, { isHost, locked, max, code, onKick }) {
  el('rosterTitle').textContent = code ? `Sala ${code}` : 'Sala';
  setCapacity('rosterCount', players.length + queue.length, max);
  el('crewLock').classList.toggle('hidden', !locked);
  el('btnRosterLock').classList.toggle('hidden', !isHost);
  el('rosterHint').classList.toggle('hidden', !isHost);
  el('btnRosterLock').textContent = locked ? 'Destrancar sala' : 'Trancar sala';

  const build = (target, list, queued) => {
    target.innerHTML = '';
    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'lobby-row empty';
      e.textContent = queued ? 'Ninguém esperando.' : 'Você está sozinho na masmorra.';
      target.appendChild(e);
      return;
    }
    for (const p of list) {
      // O host nunca pode expulsar a si mesmo.
      const actions = isHost && !p.isHost
        ? [{ label: 'Expulsar', onClick: (row) => confirmInline(row, 'Expulsar?', () => onKick(p.id)) }]
        : [];
      target.appendChild(rosterRow(p, { actions }));
    }
  };
  build(el('rosterList'), players, false);
  el('rosterQueueLabel').classList.toggle('hidden', !queue.length);
  el('rosterQueue').classList.toggle('hidden', !queue.length);
  if (queue.length) build(el('rosterQueue'), queue, true);
}

export function toggleRosterPanel(force) {
  const p = el('roster');
  const show = force === undefined ? p.classList.contains('hidden') : force;
  p.classList.toggle('hidden', !show);
  return show;
}

// ---------- Queda do host ----------
// Dois estados distintos: ainda tentando (âmbar) e acabou (vermelho).
export function showReconnecting(secondsLeft, total) {
  const ov = el('dropOverlay');
  ov.classList.remove('hidden');
  ov.classList.add('warn-state');
  el('dropTitle').textContent = 'Conexão instável';
  el('dropText').textContent = `Tentando reconectar ao host… ${Math.ceil(secondsLeft)}s`;
  el('dropBarWrap').classList.remove('hidden');
  el('dropBar').style.width = Math.max(0, (secondsLeft / total) * 100) + '%';
  el('dropSaved').classList.add('hidden');
  el('btnLeave').textContent = 'Sair agora';
  el('btnLeave').className = 'btn btn-ghost';
}

export function showEnded(title, text, saved) {
  const ov = el('dropOverlay');
  ov.classList.remove('hidden');
  ov.classList.remove('warn-state');
  el('dropTitle').textContent = title;
  el('dropText').textContent = text;
  el('dropBarWrap').classList.add('hidden');
  const note = el('dropSaved');
  note.classList.remove('hidden');
  note.classList.toggle('failed', !saved);
  note.textContent = saved
    ? '◈ Seu progresso foi salvo.'
    : 'Não consegui salvar o progresso neste navegador.';
  el('btnLeave').textContent = 'Voltar ao menu';
  el('btnLeave').className = 'btn btn-primary';
}

export function hideDrop() { el('dropOverlay').classList.add('hidden'); }

// ---------- Contagem coletiva do portal ----------
// Só existe quando o portal está aberto e alguém está em cima. Com 0 aliados
// o bloco some por inteiro: nada de espaço reservado para grupo que não existe.
export function updatePortalHold(view, local) {
  const box = el('portalHold');
  const show = view.portalOpen && view.portalTotal > 0 && view.portalReady > 0;
  box.classList.toggle('hidden', !show);
  if (!show) return;

  const armed = view.portalReady === view.portalTotal;
  box.classList.toggle('armed', armed);
  box.querySelector('.ph-count').textContent = `${view.portalReady}/${view.portalTotal} no portal`;
  box.querySelector('.bar i').style.width = Math.min(100, ((view.portalHold || 0) / PORTAL_HOLD) * 100) + '%';

  const missing = view.players.filter((p) => !p.dead && !p.onPortal && p.id !== local?.id);
  const falta = box.querySelector('.ph-missing');
  if (armed) falta.textContent = 'Descendo…';
  else if (view.portalTotal - view.portalReady <= 2 && missing.length) falta.textContent = 'Faltam ' + missing.slice(0, 2).map((p) => p.name).join(' e ');
  else falta.textContent = `Faltam ${view.portalTotal - view.portalReady} jogador(es)`;
}

export function flashPortalReset() {
  const box = el('portalHold');
  box.classList.remove('reset');
  void box.offsetWidth;
  box.classList.add('reset');
}

// ---------- Fila de entrada ----------
// Duas listas separadas de propósito: misturar quem joga com quem espera
// esconde justamente a informação que importa.
export function renderQueue({ floor, position, players, queue, myId, max }) {
  el('queueFloor').textContent = 'Andar ' + floor;
  el('queuePos').textContent = position ? position + 'º' : '—';
  setCapacity('queuePos', position, queue.length || 1);
  el('queuePos').textContent = position ? `${position}º de ${queue.length}` : '—';

  const fill = (target, list, vazio) => {
    target.innerHTML = '';
    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'lobby-row empty';
      e.textContent = vazio;
      target.appendChild(e);
      return;
    }
    for (const p of list) target.appendChild(rosterRow(p, { me: p.id === myId }));
  };
  fill(el('queuePlaying'), players, 'Recebendo o estado da sala…');
  fill(el('queueWaiting'), queue, 'Ninguém esperando.');
}

export function setQueueStatus(msg, cls = '') {
  const s = el('queueStatus');
  s.textContent = msg;
  s.className = 'menu-status ' + cls;
}
