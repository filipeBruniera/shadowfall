# Input confirmado — mobile-hud-menus-inventario

Fonte da verdade. Não há issue tracker; o desenvolvedor confirmou este conteúdo em 20/08/2026.

## Descrição original do desenvolvedor

> jogabilidade do mobile comprometida, menus mal adaptados estão muito grandes, magias empilham
> no canto da tela, mal distribuidas, inventario abrindo sem visualização completa.

## Summary

Adaptar HUD, menus e inventário do Shadowfall a telas de toque — alvos grandes demais, magias
empilhadas no canto da tela e inventário abrindo cortado.

## Acceptance criteria (confirmados)

1. Em `pointer: coarse`, todo alvo interativo de HUD e menus mede no mínimo 44x44px, medido por
   bounding box em teste de navegador, não por inspeção visual.
2. Os slots de magia do `#actionBar` não se sobrepõem entre si nem invadem `#stick`, `#log` e
   `#portalHold`, verificado por interseção de retângulos em 390x844.
3. O painel `#bag` cabe inteiro na viewport de celular: nenhuma borda fora da área visível e a
   rolagem acontece dentro do painel, nunca na página.
4. Menu de entrada e lobby não produzem scroll horizontal em 360x640, e nenhum controle estoura
   a largura da viewport.
5. A ordem de corte por altura de `.spec/init/design/hud-grupo-mobile.md` §3 vale nas alturas
   declaradas — nada some fora de ordem.
6. `tests/browser.mjs` ganha casos mobile que reprovam no código de hoje e aprovam depois, com
   console limpo.

## Alvos de tela confirmados

- 390x844, deviceScaleFactor 2, isMobile, hasTouch — já é o segundo contexto de `tests/browser.mjs:142`
- 360x640 — menor Android comum, para a AC 4

## Contexto que o desenvolvedor não citou mas existe no repo

- `.spec/init/design/hud-grupo-mobile.md` — mapa de ocupação de tela em `pointer: coarse`, trilho
  compacto de aliados, ordem de corte por altura. A queixa sugere divergência entre esta spec e o
  código implementado; medir a divergência é trabalho da SPEC.
- `.spec/init/design/tokens-componentes.md:151` — alvo de toque mínimo de 44x44px já declarado.
- `styles.css` tem blocos `@media (pointer: coarse)` em :369 e :491, e cortes por altura em
  :377, :499, :502, :506.
