# Tokens visuais e componentes compartilhados

Base de todos os specs desta pasta. **Nenhum spec define cor, fonte ou espaçamento próprio** —
todos referenciam os nomes daqui. Os valores foram extraídos de `styles.css` como ele existe
hoje; este documento **descreve o tema atual**, não propõe um novo.

Regra que vale para todas as telas novas: **compor com o que já existe**. Um componente novo
nasce de `.plaque`, `.chip`, `.bar`, `.btn` ou `.panel` — não de estilo solto.

---

## 1. Tokens de cor

Declarados em `:root` de `styles.css`.

| Token | Valor | Uso |
|---|---|---|
| `--pitch` | `#0b0910` | Fundo de página e de overlay opaco |
| `--stone` | `#16121d` | Fundo de campo, card, linha de lista |
| `--stone-2` | `#1f1a29` | Fundo de slot e topo de gradiente de placa |
| `--edge` | `#352c42` | Borda padrão de tudo |
| `--bone` | `#d6c9ae` | Texto primário |
| `--bone-dim` | `#8d8474` | Texto secundário, rótulo, borda em hover |
| `--ember` | `#ff7a2f` | Ação primária, destaque, código de sala, aviso |
| `--blood` | `#b3232b` | Estado crítico, aliado caído |
| `--arcane` | `#6f8cff` | Mana, custo, afixo |
| `--verdigris` | `#5fb39a` | Aliado, cura, sucesso |
| `--gold` | `#ffcf6b` | Ouro, loot |

Cores fora de `:root` que já circulam no CSS e podem ser reutilizadas — **não invente novas**:

| Papel | Valor | Onde já é usado |
|---|---|---|
| Erro / texto de falha | `#ff6b5e` | `.menu-status.err`, `#log .death`, `.overlay h2` |
| Aviso | `#d19a4a` | `#log .warn` |
| Texto de chat | `#ffd9a8` | `#log .chat` |
| Texto apagado / placeholder | `#5c5468` | `.menu-foot`, `.lobby-row.empty`, rótulo de slot |
| Placeholder de input | `#574d63` | `input::placeholder` |
| Fundo de barra | `#0a0810` / borda `#2a2335` | `.bar` |

Raridade (texto e borda de slot), já definidas: `.r-common #a49b88` · `.r-rare #6f8cff` ·
`.r-epic #b06bff` · `.r-legendary #ff9c2f`.

## 2. Tipografia

| Token | Fonte | Uso |
|---|---|---|
| `--display` | `"Grenze Gotisch", Georgia, serif` | Títulos, nome de jogador, código de sala, nome de chefe, banner |
| `--ui` | `"Alegreya Sans", system-ui, sans-serif` | Todo o resto |

Escala em uso, para não inventar tamanho novo:

| Papel | Tamanho | Tratamento |
|---|---|---|
| Título de marca | `clamp(52px, 12vw, 92px)` | `--display` 900, gradiente dourado |
| Código de sala | `clamp(44px, 16vw, 76px)` | `--display`, `letter-spacing: .12em` |
| Título de painel | `24px` | `--display` 700 |
| Nome do próprio jogador | `17px` | `--display` 700 |
| Nome de aliado | `15px` | `--display` 700, cor `--verdigris` |
| Corpo | `13–15px` | `--ui` |
| Rótulo | `10–11px` | maiúsculas, `letter-spacing: .16em a .34em`, cor `--bone-dim` ou `#5c5468` |
| Log | `12.5px` (desktop) · `11px` (toque) | linha `1.45` |

## 3. Forma e espaçamento

- **Raio de borda:** `2px` no geral, `3px` em slot e painel. Nada é redondo, exceto o joystick.
- **Borda:** sempre `1px solid var(--edge)`; hover muda para `--bone-dim`; estado ativo muda para a cor do estado.
- **Sombra de elevação:** `0 6px 24px rgba(0,0,0,.6)` em placa e minimapa · `0 24px 80px rgba(0,0,0,.8)` em painel · `0 10px 40px rgba(0,0,0,.8)` em tooltip.
- **Espaçamento de HUD:** `12px` da borda da tela; `8px` entre blocos empilhados.
- **Espaçamento interno:** placa `8px 10px` · linha de lista `12px 14px` · botão `13px 18px` · chip `3px 9px`.
- **Largura:** placa própria `232px` · placa de aliado `190px` · minimapa `164px` · painel `min(680px, 94vw)` · tela de menu `min(680px, 100%)`, estreita `min(460px, 100%)`.

## 4. Componentes existentes

| Componente | Classe | Do que serve |
|---|---|---|
| Tela cheia | `.screen` + `.menu-inner` (`.narrow`) | Menu, lobby, e toda tela nova fora do jogo |
| Cabeçalho de marca | `.brand` > `.eyebrow` + `h1` + `.subtitle` | Topo de tela cheia |
| Campo rotulado | `.field` > `span` + `input` | Nome, código |
| Botão | `.btn` · `.btn-primary` · `.btn-ghost` · `.btn.small` | Toda ação |
| Linha de lista | `.lobby-row` (`.empty`) | Roster, fila, lista de jogadores |
| Card de vocação | `.voc-card` (`.on`) | Seleção de vocação |
| Status de tela | `.menu-status` (`.err`, `.ok`) | Retorno de ação e recusa |
| Placa de HUD | `.plaque` (`.self`, `.mate`, `.mate.down`) | Bloco de jogador no HUD |
| Barra | `.bar` (`.hp`, `.mp`, `.xp`, `.boss`) > `i` + `b` | Vida, mana, XP, chefe, progresso |
| Chip | `.chip` (`.gold`, `.room`, `.ping`) | Indicador curto no canto |
| Painel | `.panel` > `.panel-head` + corpo | Mochila e todo painel novo |
| Sobreposição | `.overlay` > `h2` + `p` + `.btn` | Morte, conexão perdida |
| Slot de ação | `.slot` (`.potion`, `.bag`, `.ready`, `.nomana`) | Barra de magias |
| Dica flutuante | `#tooltip` | Detalhe de item |

## 5. Componentes novos exigidos pelas fases 6, 7, 14 e 15

Cada um é **composição** dos de cima. Nenhum introduz cor ou fonte nova.

### 5.1 `roster-row` — linha de jogador com ações
Estende `.lobby-row`. Anatomia: `[chip de vocação] [nome] [nível] [·········] [estado] [ações]`.
- Chip de vocação = `.voc-chip`, cor da vocação.
- Nome em `--display` 15px; anfitrião ganha o rótulo `HOST` em `--ember`, 10px, maiúsculas.
- Estado ocupa o mesmo lugar em todas as linhas: `conectando` (`--bone-dim`), `pronto` (`--verdigris`), `na fila` (`--ember`), `caído` (`#ff6b5e`).
- Ações só existem na visão do host, alinhadas à direita, como `.btn.small` de largura automática.

### 5.2 `capacity-counter` — contador de lotação
Estende `.chip`. Texto `n/10`. Cor `--bone-dim` até 8; `--ember` em 9 e 10. Nunca vermelho:
sala cheia é um estado normal, não um erro.

### 5.3 `lock-badge` — indicador de sala trancada
Estende `.chip`, texto `TRANCADA`, cor `--ember`, borda `#6b3a18` — o mesmo par de `.chip.room`.
Visível para todos os jogadores, não só para o host.

### 5.4 `ally-rail` — trilho de aliados no HUD
Contêiner de até 3 `.plaque.mate`, empilhadas com `8px`. Substitui o `#partyList` atual, que
hoje renderiza todos os aliados sem corte. Detalhado em `hud-grupo.md`.

### 5.5 `hold-counter` — contagem coletiva
Estende `.chip` com uma `.bar` de `4px` embaixo (mesma altura de `.bar.xp`). Texto `n/m no portal`.
Detalhado em `portal-coletivo.md`.

### 5.6 `confirm-inline` — confirmação de ação destrutiva
Não é modal. A linha do `roster-row` troca as ações por `Expulsar?` + `Sim` / `Não`, em
`.btn.small`. `Sim` usa borda `--blood`. Volta ao estado normal em 5s sem resposta.

## 6. Estados obrigatórios

Toda tela desta pasta especifica os quatro:

| Estado | Tratamento padrão |
|---|---|
| **Vazio** | `.lobby-row.empty` — texto itálico centralizado em `#5c5468`, nunca um espaço em branco |
| **Carregando** | `.menu-status` com texto em `--ember`; ações da tela desabilitadas via `:disabled` (opacidade `.4`) |
| **Erro** | `.menu-status.err` em `#ff6b5e`; a tela **permanece**, nada recarrega |
| **Cheio / limite** | `capacity-counter` em `--ember` + recusa explicada; não é erro, é estado normal |

## 7. Responsivo

Pontos de quebra que já existem — reutilizar, não criar novos:

| Consulta | Efeito atual |
|---|---|
| `max-width: 520px` | `.voc-grid` passa de 4 para 2 colunas |
| `max-width: 620px` | `.bag-cols` vira coluna única |
| `pointer: coarse` | Log 50vw/18vh · slot 48px · `#actionBar` vertical à direita · placa 190px · minimapa 108px |
| `max-height: 460px` | Log some · placa 180px |
| `prefers-reduced-motion` | Animações e transições reduzidas a `.01ms` |

Regra de área segura: qualquer elemento ancorado embaixo usa `max(12px, env(safe-area-inset-bottom))`,
como `#actionBar` já faz.

## 8. Acessibilidade e toque

- Alvo de toque mínimo `44×44px`. `.btn.small` isolado num `roster-row` precisa de altura mínima explícita.
- Foco de teclado usa o mesmo tratamento de `input:focus`: borda `--ember` + `box-shadow 0 0 0 3px rgba(255,122,47,.14)`.
- Contraste: texto sobre `--stone` usa `--bone` ou `--bone-dim`; `#5c5468` só para rótulo não essencial.
- Nenhum estado é comunicado **só** por cor: aliado caído tem borda `--blood` **e** o texto `caído`.
