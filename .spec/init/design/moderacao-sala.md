# Moderação de sala em partida

Tokens e componentes: `tokens-componentes.md`. Cobre US-1.5, US-1.6.
Tela nova. Hoje não existe lista de jogadores durante a partida, nem expulsão, nem tranca.

---

## 1. Onde fica

Painel (`.panel`), aberto por um chip novo no `#hudRight` — ao lado de `.chip.room`. O chip
mostra a lotação e é o ponto de entrada:

```
#hudRight
  ┌─ minimapa ─┐
  │            │
  └────────────┘
  [Andar 7] [◈ 340] [K7DQ] [4/10] [TRANCADA]
                            ↑ abre o painel
```

O chip de lotação é o `capacity-counter`, clicável, com `pointer-events: auto` (o `#hudRight`
é `pointer-events: none` por padrão). Atalho de teclado: `P`. `Esc` fecha, como todo painel.

## 2. Layout desktop

```
┌────────────────────────────────────────────────┐
│  Sala K7DQ                          4/10   ✕   │  .panel-head + capacity-counter
├────────────────────────────────────────────────┤
│  [ Trancar sala ]                              │  .btn.small — só host
│  Com a sala trancada, ninguém novo entra,      │  --bone-dim, 12px
│  mesmo havendo vaga.                           │
│                                                │
│  EM PARTIDA                                    │  rótulo
│  ┌──────────────────────────────────────────┐  │
│  │ EK  Bruno      Nv 12  HOST               │  │  roster-row, sem ação
│  │ ED  Marina     Nv  9         [Expulsar]  │  │
│  │ MS  Caio       Nv 11  caído  [Expulsar]  │  │  estado em #ff6b5e
│  │ RP  Lia        Nv  4         [Expulsar]  │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  NA FILA                                       │  só aparece se houver fila
│  ┌──────────────────────────────────────────┐  │
│  │ ED  Téo        Nv  6   1º    [Expulsar]  │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

- Largura `min(520px, 94vw)` — menor que a mochila, que usa `680px`.
- **O host não tem `[Expulsar]` na própria linha.**
- A lista rola dentro do painel se passar de 10 linhas (partida + fila).

## 3. Visão do convidado

Mesmo painel, sem nenhuma ação: sem `Trancar`, sem `Expulsar`. Serve para ver quem está na sala,
quem caiu e quem espera. O `lock-badge` continua visível — quem está dentro precisa saber que a
sala está fechada.

## 4. Confirmação de expulsão

`confirm-inline`, **não modal**. A linha troca as ações no lugar:

```
│ ED  Marina     Nv  9    Expulsar?  [Sim] [Não] │
                                      ↑ borda --blood
```

- `Sim` tem borda `--blood`; `Não` é `.btn.small` comum.
- Sem resposta em **5 segundos**, volta sozinho ao estado normal.
- Só uma linha por vez em confirmação; abrir outra cancela a anterior.
- Modal foi descartado: a partida continua rodando atrás, e um diálogo que cobre a tela no meio
  do combate é pior que a linha inline.

## 5. O que o expulso vê

Layout do estado B de `aviso-host-caiu.md`, com texto próprio:

```
        Você saiu da sala
   O host removeu você da partida.
   ◈ Seu progresso foi salvo.
       [ VOLTAR AO MENU ]
```

Nunca uma tela de erro nem a mensagem genérica de conexão perdida. O progresso é gravado
**antes** de a conexão cair.

## 6. Tranca

- Botão do host alterna entre `Trancar sala` e `Destrancar sala`.
- Trancada: `lock-badge` aparece no `#hudRight` para **todos**, e o `capacity-counter` continua
  mostrando a lotação real — tranca e lotação são coisas distintas.
- O código de sala **não muda** ao trancar nem ao destrancar.
- Uma linha de log em `#log .system` registra a mudança para todos: _"O host trancou a sala."_

## 7. Layout mobile

```
┌────────────────────┐
│ Sala K7DQ  4/10  ✕ │
│ [ Trancar sala ]   │  largura total, 44px
│ EM PARTIDA         │
│ ┌────────────────┐ │
│ │EK Bruno   HOST │ │
│ │      Nv 12     │ │
│ ├────────────────┤ │
│ │ED Marina       │ │
│ │      Nv 9   ⋮  │ │  ⋮ abre confirm-inline
│ └────────────────┘ │
└────────────────────┘
```

- `.panel` já usa `min(680px, 94vw)`; aqui `min(520px, 94vw)`.
- Com `pointer: coarse`, `[Expulsar]` vira o alvo `⋮` de `44×44px` na ponta da linha; tocar abre
  o `confirm-inline`, que ocupa a linha inteira com dois botões de largura igual.
- A linha quebra em duas: identidade em cima, nível e estado embaixo.

## 8. Estados

| Estado         | Tratamento                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| **Vazio**      | Só o host na sala: `.lobby-row.empty` — _"Você está sozinho na masmorra."_ Sem seção de fila             |
| **Carregando** | Não se aplica: a lista vem do estado local do host, sem busca                                            |
| **Erro**       | Falha ao expulsar (peer já desconectou): a linha some e `#log .warn` registra _"Marina já tinha saído."_ |
| **Cheio**      | `capacity-counter` em `--ember`; o texto abaixo do botão de tranca acrescenta _"A sala já está cheia."_  |

## 9. Aponta para

- Tela vista pelo expulso: `aviso-host-caiu.md`
- Lista equivalente antes de começar: `lobby-sala-10.md`
- Fila de espera: `fila-late-join.md`
