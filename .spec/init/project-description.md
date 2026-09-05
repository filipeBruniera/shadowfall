# Shadowfall — Ashen Realms — Project Description

## Overview

Shadowfall é um **MMORPG isométrico de masmorra infinita que roda 100% no navegador**, sem
servidor de jogo, sem banco de dados e sem conta. O deploy é estático (Vercel) e a partida
acontece por **conexão P2P direta via WebRTC** entre os navegadores dos jogadores — o único
serviço externo é o broker público do PeerJS, usado apenas para o aperto de mão inicial.

O público-alvo são **nostálgicos de Tibia**: as vocações são as quatro clássicas (Cavaleiro/EK,
Paladino/RP, Feiticeiro/MS, Druida/ED), as magias têm nomes em latim (`Exori`, `Exura San`,
`Flam Hur`) e o loop é o de sempre — descer andar, matar bicho, catar loot, subir de nível.
O que muda é o atrito: **entrar numa partida custa um código de 4 letras**, não um cadastro.

O loop central é: criar sala, escolher vocação, descer a masmorra andar por andar. **Andares
são infinitos**; cada andar tem um chefe e, ao matá-lo, abre um portal na sala dele —
**ficar 1,5s em cima do portal desce o grupo**. Monstros e loot escalam com o andar. O
progresso de cada vocação é salvo no `localStorage` do próprio navegador
(`sf-save-{vocação}`), e cada jogador leva o save dele para a sala do host.

O **estado atual do código já entrega o co-op para dois jogadores** — ele é o baseline
funcional e testado. O **MVP deste documento é esse baseline mais um delta: a sala passa a
aceitar até 10 jogadores.** Esse delta é o próximo ciclo de desenvolvimento e está
especificado nas seções abaixo (topologia estrela, late join entre andares, escalonamento
por número de jogadores, mecânicas de grupo generalizadas).

Não há não-objetivos permanentes. Backend próprio, conta/login, party acima de 10,
monetização e PvP estão **fora do escopo atual mas explicitamente não descartados** — podem
entrar em ciclos futuros.

### Key Concepts

- **Sala (room):** sessão de jogo identificada por um **código de 4 caracteres** sorteado de um alfabeto sem glifos ambíguos (`ACDEFGHJKLMNPQRTUVWXYZ34679`). O código também deriva a seed da masmorra (`seedFromCode`, hash FNV-1a). Capacidade atual: 2 jogadores. Capacidade alvo do MVP: **até 10**.
- **Host:** quem cria a sala. A simulação roda na máquina dele e ele é **autoritativo**. Se ele fecha a aba, a partida acaba. Recomendação ao jogador: criar a sala na conexão mais estável do grupo.
- **Andar (floor):** nível da masmorra, começa em 1 e é **infinito**. Mapa procedural de **72×72 tiles**, gerado por seed (`seed ^ floor * 0x9e3779b9`), com alvo de `16 + min(8, floor)` salas. Cada andar tem exatamente um chefe.
- **Simulação determinística:** RNG `mulberry32` semeado. **Mesma seed + mesmo andar = mesmo mapa nos dois lados.** Por isso o mapa nunca trafega na rede — só entidades e eventos.
- **Vocação:** classe do personagem. Quatro fixas, cada uma com 4 magias (teclas 1–4 / Q,W,E,R) e stats base + ganho por nível:

  | Vocação    | Tag | HP/MP base | ATK/DEF/ML base | Alcance | Papel                                 |
  | ---------- | --- | ---------- | --------------- | ------- | ------------------------------------- |
  | Cavaleiro  | EK  | 185 / 40   | 11 / 9 / 0      | 1,15    | Frente, taunt, dano físico em área    |
  | Paladino   | RP  | 125 / 80   | 9 / 5 / 2       | 6,5     | Dano à distância + cura de emergência |
  | Feiticeiro | MS  | 82 / 150   | 4 / 2 / 6       | 6,0     | Vidro puro, dano em área altíssimo    |
  | Druida     | ED  | 90 / 140   | 4 / 2 / 5       | 6,0     | Controle (congela/envenena) + cura    |

- **Elemento:** todo dano tem elemento — Físico, Fogo, Gelo, Energia, Terra, Sagrado, Morte. **Fraqueza multiplica por 1,5×; resistência por 0,55×.**
- **Monstro:** 12 tipos em 5 tiers (`rat` tier 0 … `wyrm` tier 4), mais **4 chefes** (Arauto de Cinzas, Senhor do Fosso, Rainha Glacial, Ossuário Ancião — 900 a 1400 HP). O pool disponível por andar é `tier <= min(4, floor((andar-1)/1.5)+1)`; a população é `min(150, 62 + andar*8)`. IA por arquétipo: `melee`, `pack`, `ranged`, `caster`, `tank`, `boss`.
- **Loot:** 14 bases de item em 6 slots equipáveis (arma, mão sec., armadura, botas, anel, amuleto) + 2 consumíveis. **4 raridades** com multiplicador, número de afixos e peso de sorteio:

  | Raridade | Mult. | Afixos | Peso |
  | -------- | ----- | ------ | ---- |
  | Comum    | 1,0×  | 0      | 100  |
  | Raro     | 1,35× | 1      | 38   |
  | Épico    | 1,8×  | 2      | 13   |
  | Lendário | 2,5×  | 3      | 3    |

- **Afixo:** modificador aleatório sorteado sobre o item (8 tipos: Afiado/atk, Reforçado/def, Arcano/ml, Vital/hp, Etéreo/mp, Veloz/speed, Cruel/crit, Vampírico/leech).
- **Inventário:** **20 slots**. Item cai em slot vazio automaticamente. Poções empilham até 20. **O inventário nunca se perde na morte.**
- **Progressão:** XP para o nível N = `floor(80 * N^1.55)`. **XP é compartilhado** — quem matou não importa.
- **Morte:** custa **10% do ouro**, nada mais. Um aliado ressuscita ficando perto por **3,5s** (raio 1,6 tiles); sozinho, o jogador renasce por conta própria após **5s**; respawn automático forçado em **30s**.
- **Elo de brasas:** linha de partículas que liga jogadores separados por mais de **7 tiles**. Passando de **14 tiles**, aparece indicador de direção e distância. Existe para que ninguém se perca do grupo.
- **Save:** por vocação, em `localStorage` sob a chave `sf-save-{vocação}`. Não há servidor de persistência — o progresso vive no navegador de quem jogou.
- **Portal:** abre na sala do chefe após a morte dele. Descer exige **1,5s parado em cima**.

## Tech Stack

| Camada       | Tecnologia                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linguagem    | JavaScript ES2022, **ES modules nativos** (`"type": "module"`) — sem transpilação                                                                                                                 |
| Build        | **Nenhum.** Sem bundler, sem step de build. Os arquivos servidos são os arquivos-fonte                                                                                                            |
| Runtime      | Navegador (desktop + mobile). Node.js apenas para os testes headless                                                                                                                              |
| Render       | **Canvas 2D** — projeção isométrica (tile 64×32, parede 30px), sprites vetoriais, iluminação dinâmica em meia resolução, batches de `Path2D` (uma chamada por cor, não por tile)                  |
| Rede         | **WebRTC via PeerJS 1.5.4** (CDN unpkg, tag `<script>` no `index.html`). Broker público só para handshake; tráfego de jogo é P2P direto                                                           |
| Simulação    | Módulo puro (`js/sim.js`) — **não toca o DOM**, roda em Node. Tick fixo de **30Hz**                                                                                                               |
| Persistência | `localStorage` do navegador. **Sem banco de dados, sem backend**                                                                                                                                  |
| Mapa         | Geração procedural por seed (`mulberry32`), flow field para IA de perseguição, A* para movimento por clique                                                                                       |
| Testes       | `node tests/sim.test.mjs` (headless, sem navegador) + `tests/browser.mjs` (Puppeteer/Chromium)                                                                                                    |
| Dev server   | `npx serve -l 5173 .` (`npm run dev`) — `file://` não funciona, ES modules bloqueiam import                                                                                                       |
| Deploy       | **Vercel estático**, sem build command, output `.`. `vercel.json` define `cleanUrls`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` e no-cache em `/js/*` |

Layout dos módulos:

```
index.html           menu, lobby, HUD, mochila
styles.css           tema gótico, responsivo, modo toque
js/rng.js            mulberry32 determinístico + código de sala
js/data.js           vocações, magias, monstros, itens, afixos
js/world.js          mapa procedural, flow field (IA), A* (clique)
js/sim.js            simulação autoritativa — sem DOM, testável em Node
js/render.js         isométrico, sprites vetoriais, iluminação dinâmica
js/net.js            P2P: snapshots, interpolação, predição
js/ui.js             telas e componentes
js/main.js           loop, input, cola entre rede e render
tests/sim.test.mjs   testes headless da simulação
tests/browser.mjs    smoke test em Chromium (Puppeteer)
```

**Três regras arquiteturais que sustentam o resto:**

1. **Um único sistema de coordenadas.** Entidades vivem em tiles float. A projeção isométrica acontece só na hora de desenhar. Câmera, mira, clique e projétil usam o mesmo espaço.
2. **Simulação não toca o DOM.** `sim.js` é função pura de estado — por isso roda em Node nos testes e por isso o host consegue ser autoritativo sem gambiarra.
3. **O mapa não trafega na rede.** É gerado por seed nos dois lados. Só entidades e eventos vão pelo fio.

## Core Workflows

### 1. Criar sala e entrar (lobby)

1. Jogador abre a URL, digita o nome (persistido em `sf-name`) e escolhe uma vocação.
2. Clica em **Criar sala** → `roomCode()` sorteia 4 caracteres; o peer registra o id `shadowfall-ashen-{CÓDIGO}` no broker PeerJS; a UI mostra o código e um link de convite.
3. Convidado abre o link (ou digita o código em **Entrar na sala**), escolhe a vocação dele e conecta. O save dele (`sf-save-{vocação}`) viaja para a sala do host.
4. Host clica em **Começar**. A seed da masmorra sai do próprio código da sala (`seedFromCode`).

**Alvo do MVP — sala de até 10:** o teto sobe de 2 para 10 jogadores. A topologia continua
**estrela com host autoritativo**: cada convidado abre uma conexão apenas com o host, que
simula tudo e distribui snapshots. Nenhuma conexão convidado↔convidado. O custo é upload do
host crescendo linearmente (até 9 conexões de saída) — aceito para preservar a autoridade
única e não reescrever `sim.js`/`net.js`.

### 2. Loop de partida (rede)

- Host roda a simulação a **30Hz** e envia snapshot a **15Hz**.
- Convidado envia input a **30Hz**, **interpola** entidades remotas e faz **predição local do próprio movimento** — sem isso o personagem responderia com o atraso da rede.
- Ações discretas (magia, poção, equipar) são **enfileiradas com id incremental e reenviadas até o host confirmar**. Perder um pacote não perde uma magia.
- O mapa nunca é enviado: cada cliente gera o mesmo mapa a partir de seed + andar.

### 3. Combate

1. Jogador se move com **WASD** ou clique (o clique usa A* e contorna parede); no celular, joystick na metade esquerda e botões na direita.
2. Ataque básico ocorre por proximidade/alcance da vocação; magias saem nas teclas **1–4**, e **botão direito** dispara a magia 1 na direção do mouse.
3. O simulador resolve cada magia pelo campo `type`: `bolt` (projétil), `wave` (linha), `nova` (círculo), `ground` (zona persistente com tick), `heal`, `buff`, `dash`, `chain`.
4. Dano final aplica o multiplicador elemental — **1,5× em fraqueza, 0,55× em resistência** — mais os efeitos de status (queimadura, veneno, lentidão, congelamento, atordoamento).
5. Terreno perigoso é parte do combate: **lava causa 14 de dano por segundo** (elemento Fogo).
6. IA de perseguição usa **flow field** recalculado periodicamente, não pathfinding por monstro — é o que segura 110+ monstros dentro do orçamento de tick.

### 4. Morte e ressurreição

1. Jogador cai → perde **10% do ouro**. Inventário e equipamento ficam intactos.
2. Um aliado que fique dentro de **1,6 tiles** por **3,5s** o ergue. Barra de progresso na tela.
3. Se estiver sozinho ou longe de todos, o jogador pode **renascer por conta própria após 5s** — a rede de segurança existe para ninguém ficar preso olhando tela de morte.
4. Passados **30s**, o respawn acontece automaticamente.

**Alvo do MVP — sala de até 10:** ressuscitar passa a valer para **qualquer aliado**, não para
um par fixo; o tempo continua **3,5s**, e ressurreição simultânea por mais de um jogador
acelera a barra. A rede de segurança de 5s permanece inalterada.

### 5. Progressão de andar

1. O grupo limpa o caminho até a sala do chefe e mata o chefe do andar.
2. O portal abre na sala dele.
3. Ficar **1,5s** em cima do portal desce o grupo para o próximo andar.
4. No novo andar: mapa regerado por seed, monstros e itens zerados e repopulados, jogadores reposicionados no spawn com **no mínimo 60% de HP e MP** restaurados, status limpos.
5. O pool de monstros e a população crescem com o andar (`min(150, 62 + andar*8)`); o loot escala junto (o chefe rola item com +4 de nível efetivo).

**Alvo do MVP — sala de até 10:** o conteúdo passa a **escalar com o número de jogadores
vivos** — quantidade e HP dos monstros e HP do chefe multiplicam pelo tamanho do grupo, para
que 10 pessoas não trivializem o andar.

### 6. Loot e inventário

1. Monstro morto dropa ouro (`floor((6 + nível*4) * rand(0.7, 1.5))`) e, por sorteio, um item.
2. O item é rolado com base + raridade (pesos 100/38/13/3) + afixos conforme a raridade.
3. **Coleta é automática por proximidade** (raio 0,85 tile) e o item cai em slot vazio.
4. **Tab** ou **I** abre a mochila (20 slots); equipar respeita o slot e a restrição de vocação (`forVoc`).
5. **Q** e **E** consomem poção de vida (70 HP) e de mana (60 MP); ambas empilham até 20.

### 7. Persistência de progresso

1. Ao longo da partida, o estado do personagem (nível, XP, ouro, equipamento, inventário) é gravado em `localStorage` sob `sf-save-{vocação}`.
2. Cada vocação tem seu próprio save independente. Falha de gravação por cota cheia é engolida silenciosamente — a partida não quebra.
3. Ao entrar numa sala, o jogador **leva o save dele**. Não há progresso no lado do host nem no servidor: o dono do progresso é o navegador de quem jogou.

### 8. Late join (entrada no meio da partida) — alvo do MVP

Decisão: **entrada permitida somente entre andares**.

1. Um jogador conecta com o código enquanto a partida já corre.
2. Ele entra numa **fila de entrada** e aguarda — não nasce no andar em curso.
3. Quando o grupo cruza o portal para o próximo andar, a fila é drenada: os jogadores em espera entram junto com o grupo, no spawn do novo andar.

Isso evita ter de enviar full-state no meio do combate (o caminho mais caro e mais frágil) e
mantém o snapshot como transporte único.

### 9. Comunicação e consciência de grupo

1. **Enter** abre o chat; a barra de vida dos aliados fica visível no HUD.
2. O **elo de brasas** desenha uma linha de partículas quando a distância passa de **7 tiles**; acima de **14 tiles**, aparece indicador de direção e distância.

**Alvo do MVP — sala de até 10:**

- O elo de brasas passa a ligar o jogador ao **aliado mais próximo**, não a um par fixo.
- **XP continua compartilhado com todos da sala**, independente de quem matou e de distância.
- O HUD mostra barras apenas dos **3 aliados mais próximos**; os demais viram ícone no minimapa.

## Open Questions

- **Redesenho da HUD para grupo de 10.** O desenvolvedor considera o redesenho necessário para a saúde do jogo, mas a decisão depende de dados de uso em **mobile e desktop que ainda não existem**. A regra "3 aliados mais próximos + ícones no minimapa" está registrada como direção, não como layout final — o layout definitivo fica pendente até haver medição.
- **Comportamento do host ao desconectar com 10 jogadores.** Hoje, com dois, fechar a aba do host encerra a partida. Com 10, o custo de perder a sessão é muito maior; ainda não foi decidido se haverá migração de host, aviso prévio ou nada.
- **Limite prático de banda do host em estrela.** 9 conexões de saída a 15Hz de snapshot ainda não foram medidas; pode exigir corte de snapshot por área de interesse.
