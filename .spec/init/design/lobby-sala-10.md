# Lobby — sala de até 10 jogadores

Tokens e componentes: `tokens-componentes.md`. Cobre US-1.4, US-1.5, US-1.6.
Substitui o lobby atual (`#lobby` em `index.html`), que assume dupla e não tem lotação,
tranca nem expulsão.

---

## 1. Layout desktop

Estende `.screen` > `.menu-inner.narrow` — a mesma estrutura de hoje, com o roster crescido.

```
┌──────────────────────────────────────────────┐
│                SALA ABERTA                   │  .eyebrow, --ember
│                                              │
│                  K7DQ                        │  #lobbyCode, --display, clamp(44,16vw,76)
│                                              │
│   Passe esse código para quem vai jogar      │  .subtitle, --bone-dim
│                                              │
│   ┌────────────────────────┐  ┌──────────┐   │
│   │ Jogadores        4/10  │  │TRANCADA  │   │  capacity-counter + lock-badge
│   └────────────────────────┘  └──────────┘   │
│                                              │
│   ┌──────────────────────────────────────┐   │
│   │ EK  Bruno       Nv 12  HOST   pronto │   │  roster-row
│   │ ED  Marina      Nv  9         pronto │   │
│   │ MS  Caio        Nv  1     conectando │   │
│   │ RP  Lia         Nv  4  pronto  [Expulsar] │
│   └──────────────────────────────────────┘   │
│                                              │
│   [ Copiar link ] [ Trancar ] [ DESCER ]     │  .btn-ghost ×2 + .btn-primary
│                                              │
│   Sala aberta. Desça quando quiser.          │  .menu-status
└──────────────────────────────────────────────┘
```

- **Roster:** lista de `roster-row`, empilhada com `8px`, dentro de `.lobby-list`.
- **Altura:** com 10 linhas o roster passa de uma tela baixa. Ele rola **dentro de si**
  (`max-height: 46vh; overflow-y: auto`), com a máscara de desvanecimento já usada em `#log`
  (`mask-image: linear-gradient(0deg, #000 88%, transparent)`). O cabeçalho e as ações nunca
  saem de vista.
- **Nunca há scroll horizontal.** O nome trunca com reticências; o resto da linha tem largura fixa.
- **Ordem das linhas:** host primeiro, depois por ordem de chegada. A ordem não muda quando
  alguém troca de vocação — só na entrada e na saída.

## 2. Visão do convidado

Mesma tela, três diferenças:

- Sem `Trancar`, sem `Expulsar`, sem `Descer`.
- No lugar de `Descer`, o texto de espera em `.menu-status`: `Esperando o host descer.`
- O `lock-badge` continua visível — quem está dentro precisa saber que a sala está fechada.

## 3. Layout mobile

Uma coluna, `.menu-inner.narrow` já resolve a largura.

```
┌────────────────────┐
│    SALA ABERTA     │
│       K7DQ         │  código encolhe por clamp
│  Jogadores  4/10   │  contador vira linha própria
│ ┌────────────────┐ │
│ │EK Bruno    HOST│ │  nível e estado descem
│ │        Nv 12 · pronto │
│ ├────────────────┤ │
│ │ED Marina       │ │
│ │        Nv 9 · pronto  │
│ └────────────────┘ │  roster rola: max-height 40vh
│ [ Copiar link ]    │  ações empilham, largura total
│ [ Trancar ]        │
│ [ DESCER ]         │
└────────────────────┘
```

- Abaixo de `520px` o `roster-row` quebra em duas linhas: identidade em cima, nível e estado embaixo.
- Ações empilham em coluna, cada uma com altura mínima `44px`.
- Com `pointer: coarse`, `[Expulsar]` sai da linha e aparece ao tocar na própria linha, abrindo
  o `confirm-inline` — evita alvo de toque minúsculo encostado na borda.

## 4. Estados

| Estado                        | Tratamento                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vazio** (só o host)         | `.lobby-row.empty`: _"Ninguém chegou ainda. O link está na sua mão."_ Contador `1/10`. `Descer` continua **habilitado** — jogar sozinho é fluxo válido (US-1.7) |
| **Carregando** (abrindo sala) | Código exibido como `----`; `.menu-status` em `--ember`: _"Abrindo sala…"_; todas as ações `:disabled`                                                          |
| **Entrando** (linha nova)     | A linha aparece com estado `conectando` em `--bone-dim`, e troca para `pronto` quando o peer confirma. Sem animação de entrada além do padrão                   |
| **Erro** (falha ao abrir)     | `.menu-status.err`: _"Não consegui abrir a sala."_; a tela volta ao menu com o motivo preservado                                                                |
| **Cheio** (10/10)             | `capacity-counter` em `--ember`. Linha de rodapé do roster: _"Sala cheia — novas entradas serão recusadas."_ Não é erro; o host segue podendo descer            |
| **Trancada**                  | `lock-badge` visível para todos; botão do host vira `Destrancar`                                                                                                |
| **Saída de jogador**          | A linha some sem animação de colapso; `.menu-status` registra _"Marina saiu."_ por 4s                                                                           |

## 5. Regras de conteúdo

- O contador é **sempre** `n/10`, mesmo com 1 jogador. Nunca "aguardando o segundo jogador".
- **Nenhum texto pressupõe dois jogadores.** O texto atual — _"Assim que ela entrar, o botão desce vocês dois"_ — sai. Substitutos: `Sala aberta. Desça quando quiser.` · `Passe esse código para quem vai jogar.`
- O código de sala nunca muda enquanto a sala existe, nem ao trancar e destrancar.
- Dois jogadores podem escolher a mesma vocação; o roster não deduplica nem avisa.

## 6. Aponta para

- Ação de expulsar e o `confirm-inline`: `moderacao-sala.md`
- Recusa vista por quem tenta entrar: `menu-entrada.md`
- Entrada com partida em curso: `fila-late-join.md`
