// ============================================================
// MEDIÇÃO DE LAYOUT DE TOQUE — compartilhada pelos dois harnesses de navegador.
//
// tests/browser.mjs mede o que a partida solo alcança (#actionBar, #bag) e
// tests/multipeer.mjs mede o que só existe dentro de sala (#roster, #crewChip).
// As caixas medidas são as mesmas (UI-01, UI-02, UI-03), então os helpers vivem
// aqui: uma cópia em cada arquivo divergiria na primeira correção.
//
// A fração da zona do joystick vem de js/balance.js, nunca do literal 0.5 —
// o mesmo número que js/main.js:608 usa para decidir a origem do toque tem de
// governar a medição, senão o teste e o jogo discordam sem ninguém perceber.
// ============================================================
import { TOUCH_STICK_ZONE, TOUCH_STICK_RADIUS } from '../js/balance.js';

// deviceScaleFactor 2, isMobile e hasTouch são o que liga `pointer: coarse` no
// Chromium; sem os três a medição cairia no CSS de desktop.
export const VIEWPORT_MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
export const VIEWPORT_SMALL = { width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
export const VIEWPORT_DESKTOP = { width: 1280, height: 760 };

// Alturas da AC 1 de UI-03, todas com largura 390.
export const ALTURAS_UI03 = [700, 620, 600, 460, 440, 380, 360];

// Piso de alvo de toque (UI-01) e medida única do slot de ação (UI-01 AC 2).
export const ALVO_MIN = 44;
export const SLOT_LADO = 48;
// 2 x 48 + gap 6 do grid de .slots.
export const BARRA_LARGURA = SLOT_LADO * 2 + 6;

// Trocar só largura e altura não recarrega a página no Puppeteer; trocar
// isMobile/hasTouch recarrega. Por isso as viewports de toque compartilham os
// dois campos: dá para medir 390x844 e 360x640 na mesma aba sem derrubar o P2P.
export const alturaMobile = (height) => ({ ...VIEWPORT_MOBILE, height });

// Instala window.__M antes de qualquer script da página, para o helper
// sobreviver a recarga.
export async function installHelpers(page) {
  await page.evaluateOnNewDocument((fracao, raio) => {
    window.__M = {
      visible(el) {
        if (!el) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      },
      rect(alvo) {
        const el = typeof alvo === 'string' ? document.querySelector(alvo) : alvo;
        if (!this.visible(el)) return null;
        const r = el.getBoundingClientRect();
        return {
          left: r.left, top: r.top, right: r.right, bottom: r.bottom,
          width: r.width, height: r.height,
        };
      },
      // Retângulos que só se tocam pela borda não se interceptam: a barra
      // encostada no contador é o arranjo desenhado, não um defeito.
      intersects(a, b) {
        if (!a || !b) return false;
        return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0
          && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
      },
      // Zona reservada do joystick: metade esquerda mais o raio do #stick.
      joystickZone() {
        return { left: 0, top: 0, right: fracao * innerWidth + raio, bottom: innerHeight };
      },
      label(el) {
        if (el.id) return '#' + el.id;
        const cls = typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().split(/\s+/).join('.') : '';
        const txt = (el.textContent || '').trim().slice(0, 16);
        return el.tagName.toLowerCase() + cls + (txt ? ` "${txt}"` : '');
      },
      // Alvo interativo, na definição de UI-01. Ficam de fora os elementos
      // puramente informativos e a linha do trilho de aliados, que por
      // .spec/init/design/hud-grupo-mobile.md:90 não é alvo de toque.
      targets(raizSel) {
        const raiz = document.querySelector(raizSel);
        if (!raiz) return [];
        const informativos = new Set(['floorChip', 'goldChip', 'lobbyCount', 'rosterCount']);
        const saida = [];
        for (const el of [raiz, ...raiz.querySelectorAll('*')]) {
          if (informativos.has(el.id) || el.closest('#partyList')) continue;
          const interativo = el.tagName === 'BUTTON' || el.tagName === 'INPUT'
            || !!el.onclick || !!el.onpointerdown;
          if (!interativo || !this.visible(el)) continue;
          const r = el.getBoundingClientRect();
          saida.push({
            alvo: this.label(el),
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
          });
        }
        return saida;
      },
    };
  }, TOUCH_STICK_ZONE, TOUCH_STICK_RADIUS);
}
