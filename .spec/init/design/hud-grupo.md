# HUD de grupo — 3 aliados mais próximos

Tokens e componentes: `tokens-componentes.md`. Cobre US-9.3 (e US-4.2, US-9.2 no destaque de caído).

> **Este é o layout de transição, não o redesenho completo.** O desenvolvedor considera o
> redesenho da HUD necessário para a saúde do jogo com grupo grande, mas a decisão depende de
> dados de uso em mobile e desktop que ainda não existem. O que está aqui resolve o problema
> imediato — `#partyList` hoje renderiza **todos** os aliados, e com 9 isso toma a coluna
> esquerda inteira. Medir primeiro, redesenhar depois.

---

## 1. Layout desktop

`#hudLeft` mantém a placa própria e troca o `#partyList` pelo `ally-rail`.

```
┌ #hudLeft ──────────────┐
│ ┌────────────────────┐ │
│ │ EK  Bruno    Nv 12 │ │  .plaque.self, 232px
│ │ ███████████░░ 148  │ │
│ │ ████████░░░░░  32  │ │
│ │ ▁▁▁▁▁▁▁▁              │  .bar.xp
│ └────────────────────┘ │
│ ┌──────────────────┐   │
│ │ Marina     Nv  9 │   │  .plaque.mate, 190px  ← 4,2 tiles
│ │ ████████░░       │   │
│ │ ██████░░░░       │   │
│ ├──────────────────┤   │
│ │ Caio       Nv 11 │   │  ← 7,8 tiles
│ │ ███░░░░░░░       │   │
│ │ ██████████       │   │
│ │ ↝ 8 tiles        │   │  .away, --ember (>14 mostra distância)
│ ├──────────────────┤   │
│ │ Lia        Nv  4 │   │  ← 12,1 tiles
│ │ █░░░░░░░░░       │   │
│ │ ██░░░░░░░░       │   │
│ └──────────────────┘   │
│  +6 no minimapa        │  --bone-dim, 11px
└────────────────────────┘
```

- **No máximo 3 `.plaque.mate`**, ordenadas por distância crescente.
- **Linha de excedente** abaixo do trilho: `+6 no minimapa`. Sem ela, o jogador não sabe que
  existem outros seis.
- Os demais aliados aparecem como **ícone no minimapa** (seção 4).

## 2. Estabilidade da seleção

O problema real de "3 mais próximos": dois aliados oscilando em torno da mesma distância fazem
as placas trocarem a cada quadro.

Regras obrigatórias:

- **Histerese de 1,5 tile.** Um aliado fora do trilho só entra se ficar 1,5 tile mais perto que
  o terceiro colocado. Um que está dentro só sai quando alguém cumpre essa margem.
- **Reordenação com atraso mínimo de 0,5s.** A distância é reavaliada continuamente, mas a
  ordem só muda depois desse intervalo.
- **A placa não é recriada ao reordenar** — o nó do DOM é reaproveitado, com a posição mudando
  por reordenação, nunca por remoção e inserção. Recriar apaga o estado visual da barra.

## 3. Aliado caído

Um caído é **sempre** visível, mesmo fora dos 3 mais próximos (US-4.2 — alguém precisa poder ir
erguê-lo).

```
│ ┌──────────────────┐   │
│ │ Caio       Nv 11 │   │  .plaque.mate.down, borda --blood
│ │ ░░░░░░░░░  caído │   │  texto "caído" em .bar b
│ │ ↝ 22 tiles ↗     │   │  distância + seta de direção
│ └──────────────────┘   │
```

- Entra num **quarto lugar** no trilho, abaixo dos 3 — não desloca ninguém.
- Com mais de um caído, o trilho aceita até 2 extras; acima disso vira uma linha:
  _"3 aliados caídos"_, e o minimapa marca cada um.
- O estado é comunicado por **borda `--blood` e pelo texto `caído`** — nunca só por cor.

## 4. Minimapa

O `#minimap` (164px) passa a marcar aliados:

| Marca                 | Aparência                                    |
| --------------------- | -------------------------------------------- |
| Jogador local         | Ponto `--bone`, 3px                          |
| Aliado no trilho      | Ponto na cor da vocação, 2,5px               |
| Aliado fora do trilho | Ponto na cor da vocação, 2px, opacidade `.7` |
| Aliado caído          | Anel `--blood`, 4px, pulsando 1×/s           |
| Portal aberto         | Losango `--ember`                            |

Com 9 aliados, o minimapa continua legível porque os pontos são pequenos e o mapa é 72×72 —
nenhum agrupamento é necessário.

## 5. Indicador de direção e distância (>14 tiles)

Reaproveita `.plaque.mate .away`, que já existe e já dispara em 14 tiles. Muda o conteúdo:
hoje mostra `↝ 22 tiles de distância`; passa a mostrar **seta de direção + distância**:
`↝ 22 tiles ↗`. A seta aponta no espaço de tiles projetado, não no espaço da tela.

Para aliado fora do trilho e além de 14 tiles, o indicador **não** é desenhado — só o ponto no
minimapa. A exceção é o caído, que sempre mostra direção e distância.

## 6. Elo de brasas

Regra visual no mundo, não no HUD (detalhe em `render.js`): a linha de partículas liga o jogador
ao **aliado mais próximo** acima de 7 tiles — uma linha só, nunca uma por aliado. Com 9 aliados
distantes, o custo de desenho é o de uma linha.

## 7. Modo solo — 0 aliados

Nada de grupo é desenhado: sem trilho, sem linha de excedente, sem elo de brasas, sem contador
de portal. **O `#hudLeft` não deixa espaço reservado** — a placa própria fica sozinha, colada no
topo. Espaço vazio reservado para um grupo que não existe é o erro a evitar.

## 8. Contagem de aliados — os quatro casos

| Aliados | Trilho        | Linha de excedente | Minimapa     |
| ------- | ------------- | ------------------ | ------------ |
| 0       | não desenhado | não desenhada      | só o jogador |
| 1       | 1 placa       | não desenhada      | 1 ponto      |
| 3       | 3 placas      | não desenhada      | 3 pontos     |
| 9       | 3 placas      | `+6 no minimapa`   | 9 pontos     |

## 9. Layout mobile

Detalhado em `hud-grupo-mobile.md`.

## 10. Estados

| Estado         | Tratamento                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **Vazio**      | Sem aliados: trilho inteiro ausente, sem placeholder                                                  |
| **Carregando** | Aliado recém-inserido entra com barras zeradas até o primeiro snapshot; sem esqueleto de carregamento |
| **Erro**       | Aliado que desconecta some do trilho na hora; `#log .warn` registra a saída                           |
| **Cheio**      | 9 aliados: 3 placas + linha de excedente; o trilho nunca passa de 3 (+2 caídos)                       |

## 11. Aponta para

- Layout de toque e cortes por altura: `hud-grupo-mobile.md`
- Contador do portal: `portal-coletivo.md`
- Lista completa de jogadores: `moderacao-sala.md`
