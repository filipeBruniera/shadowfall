# HUD de grupo — layout mobile

Tokens e componentes: `tokens-componentes.md`. Complementa `hud-grupo.md`. Cobre US-3.5, US-9.3.

O problema: no celular a tela já carrega joystick à esquerda, botões à direita, minimapa,
chips, log e barra do chefe. Somar 3 placas de aliado sem regra de corte produz sobreposição.

---

## 1. Mapa de ocupação da tela (`pointer: coarse`)

```
┌───────────────────────────────────────────────┐
│ ┌─────────┐              ┌────────┐ ┌───────┐ │
│ │ própria │              │minimapa│ │ chips │ │  hudLeft 190px · minimapa 108px
│ │ 190px   │              │ 108px  │ └───────┘ │
│ └─────────┘              └────────┘           │
│ ┌─────────┐                                   │
│ │ ally-rail                                   │  ← trilho compacto
│ └─────────┘        [ barra do chefe ]         │
│                                               │
│                                               │
│      ╭───╮                            ┌─┬─┐   │
│      │ ● │  joystick 128px            │1│2│   │  #actionBar vertical
│      ╰───╯                            ├─┼─┤   │
│ ┌───────────┐                         │3│4│   │
│ │ log 50vw  │                         ├─┼─┤   │
│ │ 18vh      │                         │Q│E│   │
│ └───────────┘                         └─┴─┘   │
└───────────────────────────────────────────────┘
   metade esquerda: toque = joystick    metade direita: botões
```

Zonas que **não podem** ser invadidas:
- **Metade esquerda inteira** é área do joystick. Ele nasce onde o dedo toca, em qualquer ponto
  dessa metade — por isso o `ally-rail` fica **colado no topo**, nunca no meio vertical.
- **Canto inferior direito** é o `#actionBar`, que em toque vira coluna com `env(safe-area-inset-bottom)`.
- **Canto inferior esquerdo** é o `#log` (50vw × 18vh).

## 2. Trilho compacto

No celular a placa de aliado perde as barras separadas e vira uma linha só:

```
┌──────────────────────────┐
│ ED Marina  ███████░░  4t │  altura 26px
│ MS Caio    ███░░░░░░  8t │
│ RP Lia     █░░░░░░░░ 12t │
└──────────────────────────┘
```

- **Uma barra só**, a de vida. Mana de aliado não cabe e não muda decisão no celular.
- Nome truncado em 8 caracteres.
- Distância em tiles sempre visível, abreviada (`4t`), no lugar do `.away` que só aparece acima de 14.
- Largura `170px`, altura `26px` por linha — o trilho inteiro ocupa `78px`.
- Aliado caído: fundo `rgba(179,35,43,.18)` e o texto `caído` no lugar da distância.

## 3. Ordem de corte por altura

Quando a altura da viewport aperta, cortar **nesta ordem**:

| Altura | O que sai |
|---|---|
| `> 620px` | Nada sai: trilho com 3 linhas |
| `460–620px` | Trilho cai para **2 linhas** + `+n no minimapa` |
| `< 460px` | `#log` some (regra que já existe); trilho cai para **1 linha**; a placa própria encolhe para 180px |
| `< 380px` | Trilho vira **só a linha de excedente**: `4 aliados · 1 caído` |

Nunca sai, em nenhuma altura: a placa própria, o minimapa, o `#actionBar` e o destaque de aliado
caído. Se um caído existe e o trilho já foi cortado a zero, ele reaparece como uma linha única
em `--blood`.

## 4. Aliado caído no celular

Prioridade máxima: ocupa a primeira linha do trilho, empurrando os vivos para baixo — inverso do
desktop, onde ele entra por último. No celular há espaço para poucas linhas, e a que importa é a
de quem precisa de ajuda.

## 5. Landscape e portrait

- **Landscape** é a orientação de referência: o mapa de ocupação acima assume paisagem.
- **Portrait** reduz a largura útil: o trilho encolhe para `150px` e o nome trunca em 6
  caracteres. O `#log` cai para `60vw`. Nada mais muda.
- Não há bloqueio de orientação nem aviso para girar o aparelho.

## 6. Alvos de toque

| Elemento | Tamanho |
|---|---|
| Linha do trilho | `170×26px` — **não é alvo de toque**, é informação |
| Chip de lotação (abre moderação) | `44×44px` mínimo, com área de toque estendida além do visual |
| Botão de magia | `62×62px` (já definido em `pointer: coarse`) |
| Botão do painel de moderação | `44px` de altura mínima |

O trilho não recebe toque de propósito: ele fica dentro da metade do joystick, e qualquer alvo
ali roubaria o movimento.

## 7. Estados

| Estado | Tratamento |
|---|---|
| **Vazio** | Sem aliados: trilho ausente, sem espaço reservado. O joystick usa a área inteira |
| **Carregando** | Aliado inserido entra com a barra zerada até o primeiro snapshot |
| **Erro** | Aliado desconectado some da linha na hora |
| **Cheio** | 9 aliados em landscape alto: 3 linhas + `+6 no minimapa`; em `< 380px`, só a linha de excedente |

## 8. Medição pendente

Este layout é uma hipótese informada, não um resultado medido. Antes do redesenho completo,
coletar: distribuição real de altura de viewport, proporção landscape/portrait, e com que
frequência o jogador precisa da informação de aliado em combate no celular. Registrado como
pergunta em aberto em `../project-phases.md`.

## 9. Aponta para

- Regras de seleção, histerese e minimapa: `hud-grupo.md`
- Contador do portal no celular: `portal-coletivo.md`
- Chat no celular: `chat-grupo.md`
