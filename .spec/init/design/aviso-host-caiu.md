# Aviso de queda do host

Tokens e componentes: `tokens-componentes.md`. Cobre US-2.4.
Substitui o `#dropOverlay` atual, que mostra um texto único e resolve tudo com
`location.reload()` — recarregar descarta a sessão inteira e não distingue queda momentânea
de saída definitiva.

---

## 1. Dois estados, não um

O ponto do redesenho: **reconectando** e **encerrada** são situações diferentes e precisam
parecer diferentes.

### Estado A — reconectando

```
┌──────────────────────────────────────────────┐
│                                              │
│              Conexão instável                │  .overlay h2, --ember (não vermelho)
│                                              │
│      Tentando reconectar ao host…            │  .overlay p, --bone-dim
│                                              │
│      ████████████░░░░░░░░░░░  8s             │  .bar, largura 240px
│                                              │
│              [ Sair agora ]                  │  .btn-ghost
└──────────────────────────────────────────────┘
```

- `.overlay` com o gradiente **âmbar**, não o vermelho de morte:
  `radial-gradient(ellipse at center, rgba(60,40,8,.45), rgba(5,4,8,.93))`.
- Título em `--ember`, não em `#ff6b5e` — ainda não é uma falha.
- Barra de progresso regressiva usando `.bar` com preenchimento `--ember`, contando o prazo de
  reconexão. O número em segundos fica ao lado, em `--bone-dim`.
- `Sair agora` permite desistir antes do prazo.
- **O jogo continua desenhando atrás do overlay**, congelado no último estado conhecido. Isso
  comunica que a partida ainda existe.

### Estado B — partida encerrada

```
┌──────────────────────────────────────────────┐
│                                              │
│             Partida encerrada                │  .overlay h2, #ff6b5e
│                                              │
│      O host saiu e a sala foi fechada.       │  .overlay p
│                                              │
│      ◈ Seu progresso foi salvo.              │  linha própria, --verdigris
│                                              │
│           [ VOLTAR AO MENU ]                 │  .btn-primary
└──────────────────────────────────────────────┘
```

- `.overlay` com o gradiente vermelho padrão.
- A linha de progresso salvo é **obrigatória** e usa `--verdigris` com o glifo `◈` — o mesmo de
  `.chip.gold`. É a informação que tira a ansiedade de perder o personagem.
- Se a gravação falhou, a linha vira `--ember`: *"Não consegui salvar o progresso neste
  navegador."* — nunca omitir.

## 2. Transição entre os estados

```
perda de conexão ──▶ [A] reconectando ──── reconectou ────▶ volta ao jogo, overlay some
                          │
                          └── prazo esgotado ──▶ [B] encerrada
```

- Saída **deliberada** do host (ele fecha a sala pelo botão) pula direto para o estado B, com o
  texto *"O host encerrou a partida."*
- Fechamento de aba, sem aviso, entra pelo estado A.
- Reconexão bem-sucedida remove o overlay sem banner nem comemoração — o jogo simplesmente volta.

## 3. Voltar ao menu sem recarregar

`VOLTAR AO MENU` **não usa `location.reload()`**. Ele:
1. Grava o progresso (se ainda não gravou).
2. Limpa visão, mapa, filas de ação e conexões.
3. Mostra `#menu` com nome e vocação preservados, pronto para criar ou entrar em outra sala.

Recarregar custa o download das fontes e do PeerJS de novo, e apaga o estado do menu — por isso
sai.

## 4. Layout mobile

O `.overlay` já é centralizado e responsivo. Ajustes:
- `h2` usa `clamp(28px, 8vw, 48px)`.
- A barra de reconexão ocupa `min(240px, 70vw)`.
- O botão ocupa largura total com `max-width: 280px`, altura mínima `44px`.
- Com `max-height: 460px`, a linha de progresso salvo e o título ficam; o parágrafo de apoio some.

## 5. Estados

| Estado | Tratamento |
|---|---|
| **Vazio** | Não se aplica — o overlay só existe quando há o que avisar |
| **Carregando** | É o próprio estado A, com a barra regressiva |
| **Erro** | Estado B; a falha de gravação aparece como linha em `--ember`, não como segundo overlay |
| **Cheio** | Não se aplica |

## 6. Vale também para

- **Jogador expulso** (`moderacao-sala.md`): mesmo layout do estado B, com título
  *"Você saiu da sala"* e texto *"O host removeu você."* — nunca uma tela de erro.
- **Jogador na fila** (`fila-late-join.md`) quando o host cai: mesmo estado B.

## 7. Aponta para

- Expulsão: `moderacao-sala.md`
- Espera na fila: `fila-late-join.md`
