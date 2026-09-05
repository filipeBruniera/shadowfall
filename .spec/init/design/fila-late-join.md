# Fila de late join

Tokens e componentes: `tokens-componentes.md`. Cobre US-8.1.
Tela nova. Hoje quem conecta com a partida em curso é instanciado no meio do andar; a decisão
é **entrar só entre andares**, então quem chega espera aqui.

---

## 1. Layout desktop

`.screen` > `.menu-inner.narrow`, mesma moldura do lobby.

```
┌──────────────────────────────────────────────┐
│              VOCÊ ESTÁ NA FILA               │  .eyebrow, --ember
│                                              │
│                 Andar 7                      │  --display, ~48px
│                                              │
│   Você entra quando o grupo descer para o    │  .subtitle, --bone-dim
│   próximo andar.                             │
│                                              │
│   ┌────────────────────────┐                 │
│   │ Sua posição      2º    │                 │  capacity-counter
│   └────────────────────────┘                 │
│                                              │
│   JOGANDO AGORA                    6/10      │  rótulo + capacity-counter
│   ┌──────────────────────────────────────┐   │
│   │ EK  Bruno        Nv 12  HOST         │   │  roster-row, sem ações
│   │ ED  Marina       Nv  9               │   │
│   │ MS  Caio         Nv 11        caído  │   │
│   └──────────────────────────────────────┘   │
│                                              │
│   NA FILA                                    │
│   ┌──────────────────────────────────────┐   │
│   │ RP  Lia          Nv  4      1º       │   │
│   │ ED  Você         Nv  7      2º  ←    │   │  linha própria: borda --ember
│   └──────────────────────────────────────┘   │
│                                              │
│   [ Trocar vocação ]   [ Desistir ]          │  .btn-ghost ×2
└──────────────────────────────────────────────┘
```

- **Duas listas separadas**, com rótulo próprio: quem está jogando e quem espera. Misturar as
  duas esconde a informação que importa — o grupo já é 6, e a vaga só abre na virada.
- A própria linha do jogador tem borda `--ember` e o sufixo `←`; as outras seguem o padrão.
- O contador `6/10` conta **jogadores em partida mais fila** — é o mesmo teto (US-8.1).
- O andar exibido acompanha o grupo: se eles descem enquanto você espera e você não é inserido
  (por lotação), o número sobe sozinho.

## 2. Layout mobile

Uma coluna. As duas listas rolam juntas, num contêiner com `max-height: 50vh`; o cabeçalho
(andar, posição) e as ações ficam fixos.

```
┌────────────────────┐
│  VOCÊ ESTÁ NA FILA │
│      Andar 7       │
│  Sua posição  2º   │
│ JOGANDO AGORA 6/10 │
│ ┌────────────────┐ │
│ │EK Bruno   HOST │ │  rola
│ │ED Marina       │ │
│ ├────────────────┤ │
│ │NA FILA         │ │
│ │RP Lia       1º │ │
│ │ED Você      2º │ │
│ └────────────────┘ │
│ [ Trocar vocação ] │  altura mínima 44px
│ [ Desistir ]       │
└────────────────────┘
```

Abaixo de `520px`, o `roster-row` da fila mostra só vocação, nome e posição — o nível sai.

## 3. Troca de vocação na fila

Permitida até a inserção (US-8.1 + US-1.3). O botão abre a `.voc-grid` no lugar das listas,
com `Voltar` para desfazer. Trocar de vocação troca o save que será aplicado na inserção — a
tela avisa isso em uma linha: _"Você entra com o progresso da vocação escolhida."_

## 4. Transição para o jogo

Quando o grupo cruza o portal:

1. A tela troca o `.eyebrow` para `ENTRANDO` e as listas somem.
2. `#banner` do jogo assume: `Andar 8` / `Você entrou com o grupo`.
3. A transição é imediata, sem tela de carregamento — o mapa é gerado por seed no cliente e
   não depende de download.

Se a inserção não couber (alguém entrou antes e a sala encheu), a tela volta ao estado de fila
com `.menu-status.err`: _"A sala encheu antes da sua vez. Você continua na fila."_

## 5. Estados

| Estado                             | Tratamento                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vazio** (você é o único na fila) | A seção `NA FILA` mostra só a sua linha; nenhum `.lobby-row.empty` é necessário                                                              |
| **Carregando** (conectando)        | `.eyebrow` = `CONECTANDO`; listas ainda vazias com `.lobby-row.empty`: _"Recebendo o estado da sala…"_; ações `:disabled`                    |
| **Erro**                           | Recusa por sala cheia ou trancada **não chega nesta tela** — é barrada no menu (`menu-entrada.md`). Aqui só aparece erro de perda de conexão |
| **Cheio**                          | Contador em `--ember`; a fila continua aceitando até o teto combinado de partida + fila                                                      |
| **Host caiu**                      | A fila é esvaziada; o jogador vai para o aviso de `aviso-host-caiu.md`, não fica preso aqui                                                  |
| **Expulso da fila**                | Mensagem do `moderacao-sala.md` e retorno ao menu                                                                                            |

## 6. Regras

- `Desistir` é **sempre** visível e sempre funciona, em qualquer estado. Ninguém fica preso.
- A tela nunca mostra o mundo do jogo nem o canvas — quem está na fila não vê o andar em curso.
- A posição na fila é estável: quem chega depois entra atrás, e desistência de alguém à frente
  promove os demais, com a mudança refletida sem animação.

## 7. Aponta para

- Recusa antes de chegar à fila: `menu-entrada.md`
- Expulsão de quem está na fila: `moderacao-sala.md`
- Queda do host durante a espera: `aviso-host-caiu.md`
