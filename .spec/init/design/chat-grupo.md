# Chat com grupo grande

Tokens e componentes: `tokens-componentes.md`. Cobre US-9.1.
O chat existe (`#chatInput` + `#log`), mas foi dimensionado para dois. Com 10 pessoas
conversando, o log vira uma cachoeira e o texto de jogo — nível, chefe, loot — se perde nela.

---

## 1. Layout desktop

O `#log` já ocupa `min(340px, 42vw)` no canto inferior esquerdo, empilhando de baixo para cima
com máscara de desvanecimento. A estrutura fica; muda a densidade e a distinção.

```
┌ #log ───────────────────────────────┐
│ Andar 7 — o ar fica mais pesado.    │  .system, --bone-dim
│ Bruno: fica perto do braseiro       │  .chat — nome --verdigris, texto #ffd9a8
│ Marina reergueu Caio.               │  .heal, --verdigris
│ Arauto de Cinzas foi derrotado!     │  .boss, --ember, 700
│ Lia: to sem mana                    │  .chat
│ ◈ Manto Arcano Vital                │  .loot, --gold
└─────────────────────────────────────┘  mask-image já existente

[ digite e Enter para enviar…        ]   #chatInput, borda --ember
```

- **Teto de 40 linhas** em memória; acima disso a mais antiga é descartada. Hoje não há teto.
- Máscara de desvanecimento inalterada, agora em `88%` em vez de `60%`, para o topo do bloco
  não ficar ilegível com o log cheio.
- Mensagem longa quebra em até 3 linhas visuais; além disso, trunca com reticências.

## 2. Distinção jogador × sistema

Com 10 pessoas, os dois tipos de linha precisam ser separáveis num relance:

| Tipo                                                                                      | Tratamento                                                                               |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Mensagem de jogador** (`.chat`)                                                         | Nome em `--verdigris` 700 seguido de `:`; texto em `#ffd9a8`. Recuo à esquerda de `0`    |
| **Evento de sistema** (`.system`, `.loot`, `.level`, `.heal`, `.boss`, `.death`, `.warn`) | Sem nome; recuo à esquerda de `8px` e opacidade `.9`. Cores já definidas em `styles.css` |

O recuo é o sinal barato que separa os dois grupos sem inventar cor nova.

## 3. Limite de mensagem

- **140 caracteres** por mensagem, truncados **antes do envio** — não depois, para não gastar
  banda do host com texto que ninguém verá.
- O contador aparece no `#chatInput` só a partir de 120 caracteres, à direita, em `--bone-dim`.
- Mensagem vazia ou só com espaços não é enviada.

## 4. Antiflood

Com 10 pessoas, uma sozinha pode encher o log:

- Máximo **3 mensagens por 5 segundos** por jogador, aplicado **no host**, que é a autoridade.
- A quarta é descartada em silêncio para os outros; quem enviou vê em `#log .warn`:
  _"Espera um pouco antes de mandar de novo."_
- O limite não vale para eventos de sistema.

## 5. Estado de foco

`Enter` abre o `#chatInput`; `Enter` de novo envia; `Esc` fecha sem enviar.

Com o chat aberto:

- **Nenhuma tecla de jogo dispara** — nem WASD, nem 1–4, nem Q/E, nem Tab.
- O joystick e os botões de toque continuam funcionando: no celular, escrever não pode significar
  parar de se mover.
- A borda do `#chatInput` em `--ember` já sinaliza o foco; acrescentar o `box-shadow` de foco
  padrão (`0 0 0 3px rgba(255,122,47,.14)`).
- No mouse o `#log` sobe para dar lugar ao campo, sem sobrepor. **No toque o empilhamento é
  estático**: o `#log` fica permanentemente acima da faixa do `#chatInput`, aberta ou fechada, em
  vez de subir só na abertura. O `bottom` do log já reserva os 44px da linha do campo mais 8px de
  respiro, então nem a abertura nem o fechamento mexem na geometria do log — e a medição de 6
  linhas contidas vale igual nos dois estados.

## 6. Layout mobile

```
┌──────────────────┐
│ ...              │
│ Bruno: vem cá    │  #log 50vw × LOG_MAX_LINES
│ Andar 7          │
└──────────────────┘
[ mensagem…      ] │  #chatInput 60vw
```

- O `#log` em `pointer: coarse` mantém `50vw` de largura e `11px`, mas a altura passa a ser
  **derivada de `LOG_MAX_LINES × line-height` medido** (95,7px hoje, com `line-height` de 15,95px),
  não mais uma fração da viewport. A fração que esta seção mandava manter foi descartada porque
  variava com a tela: media 151,9px em 390x844, onde couberam 9 linhas inteiras, e 115,2px em
  360x640, onde couberam 7. Pior, as **8** linhas que esta mesma seção pedia ocupam 127,6px —
  **19,9vh** em 360x640, acima dos 115,2px que a fração dava ali. Os dois tetos da seção se
  contradiziam.
- Teto de linhas visíveis no celular: **`LOG_MAX_LINES = 6`, exportado de `js/balance.js`**. É a
  **única primitiva**: a altura da caixa é consequência medida dela, nunca um segundo número. As
  demais linhas existem em memória e somem pela máscara.
- Abrir o chat **pode** cobrir a zona do joystick, e isso é aceito: o campo ocupa a faixa inferior
  esquerda enquanto `S.chatting` é verdadeiro e bloqueia só os pixels que cobre, porque o portão de
  zona vive no listener do `#canvas` e o campo é irmão dele. O bloqueio é temporário — fechado o
  chat, a mesma coordenada volta a armar o joystick. O teclado do sistema empurra a página — usar
  `env(keyboard-inset-height)` quando disponível, com recuo de `12px` como alternativa.
- Com `max-height: 460px` o `#log` some (regra existente), **mas o `#chatInput` continua
  funcionando**: enviar mensagem é possível mesmo sem ver o histórico.
- Botão de abrir chat no celular: um alvo de `44×44px` no `#actionBar`, **ao lado do botão de
  mochila**, na célula livre de 48x48 do grid `.slots.potions` — as poções, a mochila e o chat
  fecham 2x2 e o `#actionBar` continua em 102x212. Pendurá-lo _abaixo_ da mochila, como esta seção
  pedia, abriria uma quinta célula e esticaria a barra, comendo altura que a faixa do `#chatInput`
  já reserva.
- Fechar no dedo: um alvo de `44×44px` ao lado do campo, na mesma linha e rente à borda de baixo —
  o `Esc` do teclado não existe no toque, e sem ele o único jeito de sair do chat seria enviar.

## 7. Estados

| Estado         | Tratamento                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Vazio**      | Log sem nenhuma linha: nada é desenhado, sem placeholder. O log nasce com a linha de sistema de entrada no andar |
| **Carregando** | Não se aplica — a mensagem aparece quando o host confirma; sem estado intermediário de "enviando"                |
| **Erro**       | Mensagem não entregue (conexão caiu): `#log .warn` — _"Mensagem não enviada."_; o texto volta para o campo       |
| **Cheio**      | Log no teto de 40 linhas: as antigas somem sem aviso. Antiflood ativo: `#log .warn` para quem estourou           |

## 8. Regras

- O nome exibido é o do remetente, vindo do host — **nunca o que o cliente afirma ser**.
- Nenhuma marcação é interpretada: o texto é sempre exibido como texto puro, sem HTML.
- O log é o mesmo canal para conversa e evento; não existe aba nem filtro no MVP.

## 9. Aponta para

- Ocupação da tela no celular: `hud-grupo-mobile.md`
- Nome do jogador e persistência: `menu-entrada.md`
