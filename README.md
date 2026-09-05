# Shadowfall — Ashen Realms

MMORPG isométrico de masmorra infinita, co-op para até 10, roda 100% no navegador.
Sem servidor, sem banco, sem conta. Deploy estático.

---

## Rodar local

ES modules não funcionam abrindo o `index.html` direto (`file://` bloqueia import).
Precisa de um servidor HTTP:

```bash
npx serve .          # ou: python3 -m http.server 5173
```

Abra `http://localhost:5173`.

Testes da simulação (headless, sem navegador):

```bash
npm test                     # suítes headless, roda em segundos
npm run test:browser         # smoke test em Chromium, inclui viewport de celular
npm run test:multipeer       # 10 abas numa sessão P2P real (precisa de rede)
```

O harness multi-peer aceita `PEERS=n` e `CASE=basic|full|lock|kick|late|queue|drop|measure|shot|all`.
Ele sobe abas de verdade e conecta pelo broker público do PeerJS, então cobre o que a suíte
headless não alcança: handshake, teto de sala, tranca, expulsão, fila e queda do host.

## Publicar na Vercel

**Opção A — CLI:**

```bash
npm i -g vercel
vercel --prod
```

Quando perguntar o framework, escolha **Other**. Não há build step.

**Opção B — Git:** suba a pasta num repo, importe na Vercel, deixe tudo em branco
(build command vazio, output directory `.`). O `vercel.json` já está configurado.

## Jogar com outra pessoa

1. Você escolhe a vocação e clica em **Criar sala**.
2. Aparece um código de 4 letras e um link de convite.
3. Quem for jogar abre o link (ou digita o código em **Entrar na sala**) e escolhe a vocação.
4. Você clica em **Começar**. A sala aceita **até 10 jogadores**.

Quem chega com a partida já em curso entra numa **fila** e sobe junto na virada de andar —
ninguém nasce no meio do combate. O host pode **trancar a sala** e **expulsar** quem atrapalha.

A conexão é P2P direta entre os dois navegadores (WebRTC). O único serviço externo
é o broker público do PeerJS, usado só para o aperto de mão inicial — depois disso o
tráfego é direto. Funciona entre cidades, redes diferentes, celular e desktop.

**Quem cria a sala é o host:** a simulação roda na máquina dele. Se ele fechar a
aba, a partida acaba. Prefira criar a sala na conexão mais estável dos dois.

## Controles

|                    |                                        |
| ------------------ | -------------------------------------- |
| **WASD** ou clique | mover (clique usa A*, contorna parede) |
| **1–4**            | magias                                 |
| **Botão direito**  | magia 1 na direção do mouse            |
| **Q / E**          | poção de vida / mana                   |
| **Tab** ou **I**   | mochila                                |
| **Enter**          | chat                                   |
| **Esc**            | fecha painéis                          |

No celular: joystick na metade esquerda da tela, botões na direita.

## Como o co-op foi desenhado

Sistema pensado para jogar com alguém que você quer manter por perto, não para
competir:

- **Ressuscitar aliado**: qualquer aliado perto de quem caiu por 3,5s ergue. Dois erguendo
  juntos levam metade do tempo, com teto para o grupo grande não zerar a barra.
- **Rede de segurança**: se você estiver sozinho ou longe, dá para renascer sozinho
  depois de 5s. Ninguém fica preso olhando tela de morte.
- **Morte é barata**: custa 10% do ouro. Inventário nunca se perde.
- **XP compartilhado**: quem matou não importa. Todo mundo vivo num raio de 26 tiles recebe,
  com a parcela dividida por `1/√(vivos)` — grupo grande sobe junto, mas não mais rápido.
- **Elo de brasas**: passando de 7 tiles, uma linha de partículas liga você ao aliado **mais
  próximo**. Passou de 14, aparece direção e distância.
- **HUD de grupo**: barras dos **3 aliados mais próximos**; o resto vira ícone no minimapa.
  Quem caiu aparece a qualquer distância.
- **Chat** no Enter, com teto de tamanho e antiflood aplicado no host.

## Progressão

Andares infinitos. Cada andar tem um chefe; matando ele abre um portal na sala dele.
**Todos os jogadores vivos** precisam ficar 1,5s em cima para o grupo descer — ninguém
arrasta o resto. Monstros, chefe e loot escalam com o andar **e com o tamanho do grupo**.

Loot tem 4 raridades e afixos aleatórios. Item cai em slot vazio automaticamente.
O progresso de cada vocação é salvo no `localStorage` do próprio navegador
(`sf-save-{vocação}`), e o convidado leva o save dele para a sala do host.
Cada bloco HARDCORE concluído libera checkpoints 1, 4, 7, 10…; no lobby, o host escolhe
qualquer checkpoint desbloqueado por todos e o padrão é o maior ponto comum.

### Refúgio, bestiário e contratos

Entre expedições, o **Refúgio** reúne a escolha de checkpoint da próxima run, o bestiário e
os contratos diários. Ele não abre durante uma partida, na fila nem depois de um encerramento
que ainda precisa ser explicado ao jogador.

O bestiário guarda somente a contagem de derrotas por tipo no save; nome, afinidades, atributos
e especiais continuam derivados de `js/data.js`. As camadas aparecem em 1, 25 e 100 derrotas.
Os contratos usam a data UTC e uma seed fixa: a lista de até três objetivos é reconstituída,
enquanto o save guarda apenas dia, progresso e resgates. Um resgate concluído concede ouro e
uma poção de vida uma única vez, inclusive após recarregar a página.

## Arquitetura

```
index.html        menu, lobby, HUD, mochila
styles.css        tema gótico, responsivo, modo toque
js/rng.js         mulberry32 determinístico + código de sala
js/balance.js     todo número que afina o jogo, num lugar só
js/data.js        vocações, magias, monstros, itens, afixos
js/world.js       mapa procedural, flow field (IA), A* (clique)
js/sim.js         simulação autoritativa — sem DOM, testável em Node
js/save.js        formato do save, versão e migração (localStorage)
js/validate.js    saneamento do save que chega pela rede
js/bestiary.js    catálogo derivado e tiers de revelação por derrotas
js/contracts.js   contratos UTC determinísticos, progresso e resgate
js/refuge.js      view-model puro do Refúgio
js/room.js        lotação, tranca e fila de entrada
js/session.js     reconexão e fim de partida
js/progression.js checkpoints comuns e andar inicial da run
js/telemetry.js   métricas anônimas de run
js/actqueue.js    fila de ações com reenvio até confirmar
js/chatgate.js    antiflood e truncagem de chat
js/allyrail.js    quais aliados o HUD mostra
js/render.js      isométrico, sprites vetoriais, iluminação dinâmica
js/net.js         P2P: snapshots por destinatário, interpolação, predição
js/ui.js          telas e componentes
js/main.js        loop, input, cola entre rede e render
tests/*.test.mjs     suítes headless
tests/browser.mjs    smoke test em Chromium (Puppeteer)
tests/multipeer.mjs  N abas numa sessão P2P real
```

**Regras que sustentam tudo isso:**

1. **Um único sistema de coordenadas.** Entidades vivem em tiles float. A projeção
   isométrica acontece só na hora de desenhar. Câmera, mira, clique e projétil usam
   o mesmo espaço — foi exatamente isso que quebrava a versão anterior.

2. **Simulação não toca o DOM.** `sim.js` é função pura de estado; por isso roda em
   Node nos testes e por isso o host consegue ser autoritativo sem gambiarra.

3. **O mapa não trafega na rede.** Ele é gerado por seed nos dois lados. Só entidades
   e eventos vão pelo fio.

### Rede

Topologia **estrela**: todos conectam só no host, nunca entre si. Host roda a 30Hz e envia
snapshot a 15Hz — **um pacote por destinatário**, recortado por área de interesse (20 tiles),
porque mandar o mapa inteiro para 9 peers multiplicava a banda sem mudar nada na tela.
Convidado manda input a 30Hz, interpola entidades remotas e faz predição local do próprio
movimento. Ações (magia, poção, equipar) são enfileiradas com id incremental e reenviadas até
o host confirmar, então perder um pacote não perde uma magia — e o host ignora id repetido.

Medido com 10 abas numa sessão real: pacote de ~5 KB, o que projeta ~700 KB/s de upload no
host com 9 peers. O corte por área de interesse é o que segura esse número; sem ele eram
1,4 MB/s.

**O save do convidado não é confiável.** Na entrada o host recalcula o nível a partir do XP
acumulado, limita o nível de item pelo andar alcançado, descarta referência inexistente e
limita as faixas numéricas.

### Performance

Renderizador desenha o chão e as paredes em lotes de `Path2D` (uma chamada por cor,
não por tile) e o buffer de iluminação roda em meia resolução com a vinheta em cache.
Simulação: **~0,1ms por tick com 110 monstros** — 300x de folga para os 30Hz.

## O que foi testado

- `tests/sim.test.mjs`: determinismo do mapa, 4 vocações jogando 90s cada com bots que
  usam o A* real, progressão de andar, portal, loot e raridades, e orçamento de tempo
  por tick. Roda em segundos.
- `tests/browser.mjs`: sobe o jogo em Chromium headless, joga, entra em combate, abre
  mochila, mata o chefe, desce de andar e refaz tudo em viewport de celular.
  Verifica ausência de erro de página e de console.

- `tests/multipeer.mjs`: sobe N abas de Chromium, uma cria a sala e as outras entram pelo
  broker público do PeerJS. Cobre teto de 10 e recusa do 11º, tranca, expulsão, fila de late
  join, queda do host e medição de banda. Roda com `npm run test:multipeer`.

O que **não** foi testado: a partida publicada com pessoas em máquinas diferentes. O harness
usa abas reais numa sessão P2P real, mas todas na mesma máquina e na mesma rede — latência
entre cidades, NAT restritivo e celular em rede móvel continuam sem cobertura.
