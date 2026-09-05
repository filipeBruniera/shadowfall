# Shadowfall — Ashen Realms — User Stories

<!-- inputs: project-description.md@sha256:b87a4c17848e -->

## Overview

Shadowfall é um MMORPG isométrico de masmorra infinita que roda inteiramente no navegador,
sem servidor de jogo, sem banco de dados e sem conta. A partida acontece por conexão P2P
direta (WebRTC/PeerJS) entre os navegadores; quem cria a sala é o host e roda a simulação
autoritativa. O público é o nostálgico de Tibia: quatro vocações clássicas, magias em latim,
loop de descer andar, matar bicho, catar loot e subir de nível.

Estas histórias cobrem o **baseline já implementado (co-op para dois)** e o **delta do MVP
atual: sala de até 10 jogadores** — topologia estrela com host autoritativo, late join só
entre andares, escalonamento de conteúdo por número de jogadores vivos e mecânicas de grupo
generalizadas. Por decisão do desenvolvedor, **todas as histórias nascem `Pending`**,
inclusive as que o código atual já entrega: elas servem de checklist de validação e
regressão antes e durante o próximo ciclo.

**User Types:**

- **Jogador** - qualquer pessoa dentro de uma partida, independente de ser host ou convidado. Herda todas as capacidades de jogo (mover, lutar, catar loot, morrer, evoluir).
- **Anfitrião (Host)** - o jogador que criou a sala. Sua máquina roda a simulação autoritativa; ele detém as decisões de sala (começar, trancar, expulsar) e sua saída encerra a partida.
- **Convidado** - o jogador que entrou numa sala existente pelo código de 4 letras ou pelo link de convite. Sofre latência de rede e depende de predição local e interpolação.
- **Jogador Solo** - o jogador que cria uma sala e começa sem ninguém mais. Fluxo suportado de primeira classe: precisa da rede de segurança de respawn e do conteúdo escalado para um.

---

## 1. Sala e Lobby

### US-1.1: Criar sala com código curto

**As a** Anfitrião
**I want to** criar uma sala e receber um código curto e um link de convite
**So that** eu chame alguém para jogar sem cadastro, instalação ou troca de IP

**Acceptance Criteria:**

- [ ] O código tem exatamente 4 caracteres, sorteados do alfabeto `ACDEFGHJKLMNPQRTUVWXYZ34679` (sem glifos ambíguos como O/0, I/1, S/5, B/8)
- [ ] O peer é registrado no broker com o id `shadowfall-ashen-{CÓDIGO}`
- [ ] A tela exibe o código e um link de convite copiável que já embute o código
- [ ] A seed da masmorra é derivada do próprio código via `seedFromCode` (FNV-1a), de forma que o mesmo código produz sempre a mesma masmorra
- [ ] Se o id já estiver ocupado no broker, um novo código é sorteado sem erro visível ao jogador

**Expected Result:** O anfitrião tem um código e um link prontos para compartilhar, e a sala está anunciada no broker aguardando conexões.

---

### US-1.2: Entrar por código ou link

**As a** Convidado
**I want to** entrar numa sala digitando o código de 4 letras ou abrindo o link de convite
**So that** eu comece a jogar em segundos, sem criar conta

**Acceptance Criteria:**

- [ ] Abrir o link de convite preenche o código automaticamente e leva direto à escolha de vocação
- [ ] Digitar o código funciona em maiúsculas ou minúsculas
- [ ] Código inexistente ou sala fora do ar exibe mensagem de erro legível, e o jogador continua na tela de entrada (não trava nem recarrega)
- [ ] Tentar entrar numa sala já com 10 jogadores exibe "sala cheia" e a conexão é recusada
- [ ] Tentar entrar numa sala trancada exibe "sala trancada" e a conexão é recusada

**Expected Result:** O convidado está conectado ao host e visível na lista do lobby, ou recebe um motivo claro para a recusa.

---

### US-1.3: Escolher vocação antes de começar

**As a** Jogador
**I want to** escolher entre Cavaleiro, Paladino, Feiticeiro e Druida antes da partida começar
**So that** eu jogue o papel que quero e carregue o progresso daquela vocação

**Acceptance Criteria:**

- [ ] As 4 vocações são exibidas com nome, tag (EK/RP/MS/ED), cor e blurb de papel
- [ ] Selecionar uma vocação carrega o save correspondente (`sf-save-{vocação}`) se existir, mostrando o nível atual
- [ ] Dois jogadores podem escolher a mesma vocação na mesma sala
- [ ] A vocação fica travada quando a partida começa

**Expected Result:** Cada jogador entra na partida com a vocação escolhida e o progresso salvo dela aplicado.

---

### US-1.4: Sala com até 10 jogadores

**As a** Anfitrião
**I want to** que minha sala aceite até 10 jogadores em vez de 2
**So that** eu jogue com um grupo, não só com uma pessoa

**Acceptance Criteria:**

- [ ] O lobby aceita de 1 a 10 jogadores e exibe o contador `n/10`
- [ ] A 11ª tentativa de conexão é recusada com motivo "sala cheia"
- [ ] Todos os convidados conectam **apenas ao host** (topologia estrela); não há conexão convidado↔convidado
- [ ] O host mantém até 9 conexões de saída simultâneas sem perder o tick de 30Hz
- [ ] A lista do lobby mostra nome e vocação de cada jogador conectado, atualizada em tempo real

**Expected Result:** Uma sala comporta um grupo de até 10 pessoas, todas conectadas ao host autoritativo.

---

### US-1.5: Expulsar jogador

**As a** Anfitrião
**I want to** remover um jogador específico da minha sala
**So that** eu recupere o controle quando alguém atrapalha ou entrou por engano

**Acceptance Criteria:**

- [ ] A lista de jogadores no lobby e em partida oferece a ação de expulsar, visível apenas para o host
- [ ] Expulsar encerra a conexão daquele peer e remove a entidade dele da simulação
- [ ] O jogador expulso vê uma mensagem explicando que foi removido da sala, e não uma tela de erro
- [ ] O progresso do jogador expulso permanece salvo no `localStorage` dele
- [ ] O host não pode expulsar a si mesmo

**Expected Result:** O jogador é removido da partida sem quebrar a sessão dos demais, e sem perder o próprio progresso.

---

### US-1.6: Trancar sala

**As a** Anfitrião
**I want to** trancar a sala mesmo havendo vagas
**So that** eu jogue só com quem já está dentro, mesmo que o código tenha vazado

**Acceptance Criteria:**

- [ ] Existe um controle de trancar/destrancar visível apenas para o host
- [ ] Com a sala trancada, novas conexões são recusadas com o motivo "sala trancada", inclusive abaixo do limite de 10
- [ ] Destrancar volta a aceitar conexões imediatamente, sem trocar o código
- [ ] O estado de trancada é visível para todos os jogadores da sala

**Expected Result:** O host controla a entrada independentemente da lotação, sem precisar recriar a sala.

---

### US-1.7: Começar e jogar sozinho

**As a** Jogador Solo
**I want to** criar uma sala e começar sem esperar ninguém
**So that** eu jogue quando não tem grupo disponível

**Acceptance Criteria:**

- [ ] O botão Começar fica habilitado com 1 jogador na sala
- [ ] O conteúdo do andar é escalado para 1 jogador (a mesma regra de escalonamento por jogadores vivos de US-5.3)
- [ ] A rede de segurança de respawn próprio em 5s continua funcionando sem nenhum aliado presente
- [ ] O elo de brasas e o HUD de aliados ficam ocultos quando não há aliado
- [ ] A regra do portal (US-5.2) é satisfeita com o único jogador vivo em cima

**Expected Result:** Uma pessoa sozinha consegue jogar a masmorra do início ao fim sem travar em nenhum mecanismo de grupo.

---

### US-1.8: Definir nome persistente

**As a** Jogador
**I want to** definir meu nome uma vez e ele ser lembrado
**So that** eu não redigite a cada partida e o grupo saiba quem é quem

**Acceptance Criteria:**

- [ ] O nome digitado é gravado em `localStorage` na chave `sf-name`
- [ ] Ao reabrir o jogo, o campo já vem preenchido com o nome salvo
- [ ] O nome aparece no lobby, no HUD dos aliados e no chat
- [ ] Nome vazio recebe um valor padrão em vez de bloquear a entrada

**Expected Result:** O jogador é identificável pelo grupo e não repete a digitação a cada sessão.

---

## 2. Sessão e Rede

### US-2.1: Movimento responsivo apesar da latência

**As a** Convidado
**I want to** que meu personagem responda ao meu comando na hora, sem esperar o host
**So that** o jogo não pareça travado por causa da distância de rede

**Acceptance Criteria:**

- [ ] O convidado envia input a 30Hz e aplica **predição local** do próprio movimento imediatamente
- [ ] Entidades remotas (outros jogadores, monstros, projéteis) são **interpoladas** entre snapshots de 15Hz, sem teleporte visível
- [ ] Divergência entre predição e estado autoritativo é reconciliada suavemente, sem "puxão" perceptível em condição normal de rede
- [ ] O jogo permanece jogável com latência de ida e volta de até 150ms

**Expected Result:** O convidado joga com sensação de resposta imediata, mesmo com o host em outra cidade.

---

### US-2.2: Nenhuma ação perdida por pacote perdido

**As a** Jogador
**I want to** que minha magia, poção ou equipamento não se percam se um pacote cair
**So that** eu não morra por uma ação que "não saiu"

**Acceptance Criteria:**

- [ ] Toda ação discreta (magia, poção, equipar, ressuscitar) recebe um id incremental e entra numa fila
- [ ] A ação é reenviada até o host confirmar o recebimento
- [ ] O host ignora ids já processados (idempotência), de modo que reenvio não dispara a ação duas vezes
- [ ] A fila é limpa ao trocar de andar e ao reconectar

**Expected Result:** Perder um pacote atrasa a ação, mas nunca a cancela nem a duplica.

---

### US-2.3: Host aguenta o grupo de 10

**As a** Anfitrião
**I want to** rodar a simulação para até 10 jogadores sem engasgo
**So that** o grupo inteiro jogue no mesmo ritmo

**Acceptance Criteria:**

- [ ] A simulação mantém o tick de 30Hz e o snapshot de 15Hz com 10 jogadores e a população máxima de monstros do andar
- [ ] O orçamento de tempo por tick da simulação continua sendo verificado pelo teste headless com o grupo cheio
- [ ] Se o custo de banda inviabilizar 9 conexões, um corte por área de interesse é aplicado (enviar só entidades relevantes ao destinatário)
- [ ] Uma conexão lenta de um convidado não degrada o tick dos demais

**Expected Result:** Uma sala cheia roda no mesmo ritmo de uma sala de dois, sem o host virar gargalo.

---

### US-2.4: Aviso claro quando o host sai

**As a** Convidado
**I want to** ser avisado com clareza quando o host fecha a aba
**So that** eu entenda que a partida acabou em vez de olhar uma tela congelada

**Acceptance Criteria:**

- [ ] A perda da conexão com o host mostra uma mensagem explícita de fim de partida
- [ ] O progresso do convidado é gravado no `localStorage` dele antes de sair da partida
- [ ] O convidado é levado de volta ao menu, podendo criar ou entrar noutra sala sem recarregar a página
- [ ] Queda momentânea de rede é distinguida de saída definitiva do host, com tentativa de reconexão antes de encerrar

**Expected Result:** A queda do host termina a sessão de forma explicada e sem perda de progresso.

---

### US-2.5: Entrada rápida sem transferir o mapa

**As a** Jogador
**I want to** entrar na partida sem esperar download de mapa
**So that** a conexão seja instantânea mesmo em rede ruim

**Acceptance Criteria:**

- [ ] O mapa nunca trafega pela rede: cada cliente gera o andar a partir de `seed` + número do andar
- [ ] O mesmo par (seed, andar) produz mapa byte a byte idêntico em qualquer máquina — verificado por teste de determinismo
- [ ] Só entidades e eventos trafegam no snapshot
- [ ] Um cliente que entra recebe apenas seed e andar corrente para reconstruir o cenário

**Expected Result:** Entrar numa sala é imediato e independente do tamanho do mapa.

---

## 3. Combate

### US-3.1: Mover pelo cenário

**As a** Jogador
**I want to** mover por teclado ou clique e contornar paredes sozinho
**So that** eu me concentre no combate em vez de na navegação

**Acceptance Criteria:**

- [ ] WASD move em 8 direções, com velocidade dependente dos stats e do terreno
- [ ] Clique no chão traça rota com A* e contorna paredes
- [ ] Entidades vivem em tiles float e a projeção isométrica só ocorre no desenho: câmera, mira, clique e projétil usam o mesmo espaço de coordenadas
- [ ] Tiles sólidos (`VOID`, `WALL`, `BRAZIER`) bloqueiam o movimento
- [ ] Lava aplica 14 de dano por segundo (elemento Fogo) enquanto o jogador estiver em cima

**Expected Result:** O movimento é preciso pelos dois métodos e nunca deixa o jogador preso em geometria.

---

### US-3.2: Lançar as magias da vocação

**As a** Jogador
**I want to** usar as 4 magias da minha vocação nas teclas 1–4
**So that** eu jogue o papel da classe em vez de só bater

**Acceptance Criteria:**

- [ ] Cada vocação tem exatamente 4 magias, com custo de mana, cooldown e elemento próprios
- [ ] A magia só dispara se houver mana suficiente e o cooldown estiver zerado; caso contrário há retorno visual claro da recusa
- [ ] O simulador resolve corretamente cada `type`: `bolt`, `wave`, `nova`, `ground`, `heal`, `buff`, `dash` e `chain`
- [ ] Efeitos de status aplicam-se conforme a magia: queimadura, veneno, lentidão, congelamento, atordoamento e taunt
- [ ] Cooldown e mana são exibidos no HUD por magia

**Expected Result:** As 16 magias das 4 vocações funcionam conforme os dados de `data.js`, com feedback visual de custo e recarga.

---

### US-3.3: Ataque rápido na direção do mouse

**As a** Jogador
**I want to** disparar a magia 1 com o botão direito na direção do cursor
**So that** eu reaja rápido sem tirar a mão do movimento

**Acceptance Criteria:**

- [ ] O botão direito lança a magia do slot 1 na direção do cursor, respeitando mana e cooldown
- [ ] A direção usada é a mesma do espaço de coordenadas da simulação, não a do espaço da tela
- [ ] O menu de contexto do navegador é suprimido dentro do canvas

**Expected Result:** O jogador ataca na direção que aponta com um único clique, sem trocar de tecla.

---

### US-3.4: Explorar fraqueza elemental

**As a** Jogador
**I want to** que meu elemento importe contra cada tipo de monstro
**So that** escolher a magia certa seja uma decisão real

**Acceptance Criteria:**

- [ ] Dano contra fraqueza é multiplicado por 1,5×; contra resistência, por 0,55×
- [ ] Os 7 elementos (Físico, Fogo, Gelo, Energia, Terra, Sagrado, Morte) têm nome e cor próprios na interface
- [ ] O número de dano exibido reflete o multiplicador aplicado
- [ ] Fraqueza e resistência de cada monstro seguem a tabela de `data.js`

**Expected Result:** Trocar de magia conforme o monstro produz diferença mensurável de dano.

---

### US-3.5: Jogar no celular

**As a** Jogador
**I want to** jogar no celular com controles de toque
**So that** eu não precise de computador para entrar na partida

**Acceptance Criteria:**

- [ ] Joystick virtual na metade esquerda da tela controla o movimento
- [ ] Botões de magia e de poção ficam na metade direita, alcançáveis com o polegar
- [ ] O layout se adapta a viewport de celular sem sobreposição de elementos nem scroll da página
- [ ] O smoke test em Chromium roda o fluxo completo em viewport de celular sem erro de página nem de console

**Expected Result:** Uma partida inteira é jogável no celular, incluindo combate, mochila e descida de andar.

---

### US-3.6: Horda sem queda de framerate

**As a** Jogador
**I want to** enfrentar mais de cem monstros sem o jogo engasgar
**So that** a fantasia de horda funcione de fato

**Acceptance Criteria:**

- [ ] A IA de perseguição usa flow field recalculado periodicamente, não pathfinding por monstro
- [ ] A simulação fica dentro do orçamento de tempo por tick com a população máxima do andar, verificado em teste headless
- [ ] O renderizador desenha chão e paredes em lotes de `Path2D` — uma chamada por cor, não por tile
- [ ] O buffer de iluminação roda em meia resolução com a vinheta em cache

**Expected Result:** O andar mais populoso continua fluido em desktop e celular.

---

## 4. Morte e Ressurreição

### US-4.1: Morrer sem perder o que juntei

**As a** Jogador
**I want to** que a morte custe pouco
**So that** eu arrisque avançar em vez de jogar com medo

**Acceptance Criteria:**

- [ ] A morte custa exatamente 10% do ouro atual, arredondado para baixo
- [ ] Inventário e equipamento nunca são perdidos
- [ ] Nível e XP não são reduzidos
- [ ] A perda é comunicada no log da partida com o valor exato

**Expected Result:** Morrer é um contratempo barato e legível, nunca uma perda de progresso.

---

### US-4.2: Ser erguido por qualquer aliado

**As a** Jogador
**I want to** ser ressuscitado por qualquer companheiro que chegue perto
**So that** o grupo se ajude sem depender de um par fixo

**Acceptance Criteria:**

- [ ] Qualquer aliado dentro de 1,6 tiles do caído acumula progresso de ressurreição
- [ ] O tempo total é de 3,5s e há barra de progresso visível para os dois lados
- [ ] Mais de um aliado erguendo ao mesmo tempo acelera a barra proporcionalmente
- [ ] Sair do raio interrompe o progresso, que decai em vez de zerar instantaneamente
- [ ] O jogador erguido volta em pé no próprio local, sem custo adicional de ouro

**Expected Result:** Numa sala de 10, qualquer pessoa por perto consegue erguer quem caiu.

---

### US-4.3: Nunca ficar preso na tela de morte

**As a** Jogador Solo
**I want to** renascer por conta própria quando não há ninguém para me erguer
**So that** eu não fique olhando uma tela de morte sem saída

**Acceptance Criteria:**

- [ ] Após 5s de morto, a opção de renascer sozinho fica disponível e funciona sem aliado presente
- [ ] Aos 30s, o respawn acontece automaticamente mesmo sem ação do jogador
- [ ] O renascimento reposiciona o jogador no spawn do andar corrente
- [ ] O custo continua sendo apenas os 10% de ouro já cobrados na morte

**Expected Result:** Nenhum jogador, sozinho ou em grupo, fica travado após morrer.

---

## 5. Progressão de Andar

### US-5.1: Matar o chefe e abrir o portal

**As a** Jogador
**I want to** que derrubar o chefe abra o caminho para o andar seguinte
**So that** o andar tenha um objetivo claro

**Acceptance Criteria:**

- [ ] Cada andar tem exatamente um chefe, sorteado entre os 4 disponíveis
- [ ] A morte do chefe abre um portal na sala dele e anuncia o evento a todos os jogadores
- [ ] O chefe dropa loot com nível efetivo +4 em relação aos monstros comuns
- [ ] O portal fica visível no minimapa depois de aberto

**Expected Result:** O grupo sabe qual é o objetivo do andar e vê o caminho abrir ao cumpri-lo.

---

### US-5.2: Descer só com o grupo reunido

**As a** Jogador
**I want to** que a descida de andar exija todos os vivos no portal
**So that** ninguém arraste o grupo para o andar seguinte sozinho

**Acceptance Criteria:**

- [ ] A descida só dispara quando **todos os jogadores vivos** estão em cima do portal por 1,5s
- [ ] O HUD mostra quantos dos vivos já estão no portal (ex.: `3/5`)
- [ ] Jogadores mortos não contam para o requisito, e um jogador morrer com o grupo em cima não interrompe a contagem
- [ ] Alguém sair do portal zera o hold coletivo, com aviso visual
- [ ] Com 1 jogador vivo, basta ele próprio cumprir os 1,5s

**Expected Result:** O grupo desce junto, por decisão coletiva, e ninguém é levado de surpresa.

---

### US-5.3: Conteúdo escala com o tamanho do grupo

**As a** Jogador
**I want to** que o andar continue desafiador com 10 pessoas
**So that** um grupo grande não trivialize a masmorra

**Acceptance Criteria:**

- [ ] A quantidade e o HP dos monstros escalam com o número de jogadores vivos na sala
- [ ] O HP do chefe escala pela mesma regra
- [ ] A escala é recalculada ao trocar de andar, não no meio do andar corrente
- [ ] A escala para 1 jogador reproduz o balanceamento solo atual
- [ ] O teto de população continua respeitando o orçamento de tempo por tick verificado em teste

**Expected Result:** Um andar exige esforço equivalente com 1, 2 ou 10 jogadores.

---

### US-5.4: Subir de nível junto com o grupo

**As a** Jogador
**I want to** ganhar XP pelos abates do grupo sem depender de quem deu o golpe final
**So that** ninguém precise competir por abate

**Acceptance Criteria:**

- [ ] O XP de cada morte é creditado a **todos os jogadores vivos dentro de 26 tiles** do monstro, independente de quem deu o golpe final
- [ ] A parcela de cada jogador é o XP do monstro multiplicado por `1/√(vivos)`, arredondada para baixo, com mínimo de 1 — decisão de balanceamento: **o divisor atual é mantido**, não é XP integral
- [ ] Jogador caído não recebe XP e não entra na contagem de vivos que forma o divisor
- [ ] Jogador a mais de 26 tiles do monstro no momento do abate não recebe XP
- [ ] O XP necessário para o nível N é `floor(80 * N^1.55)`
- [ ] Subir de nível aplica os ganhos por vocação (HP, MP, ATK, DEF, ML) e é anunciado no log
- [ ] Ao trocar de andar, os jogadores voltam com no mínimo 60% de HP e MP e com status limpos

**Expected Result:** O grupo evolui junto e ninguém disputa abate, com a parcela por jogador decrescendo conforme o grupo cresce: 100% sozinho, ~71% em dupla, ~32% com 10 vivos por perto.

---

## 6. Loot e Inventário

### US-6.1: Coleta automática

**As a** Jogador
**I want to** catar loot só de passar por cima
**So that** o combate não seja interrompido por micro-gerência

**Acceptance Criteria:**

- [ ] Itens e ouro no chão são coletados automaticamente dentro de 0,85 tile
- [ ] Ouro dropa por monstro no valor `floor((6 + nível*4) * rand(0,7 a 1,5))` e é somado na hora
- [ ] Item coletado vai para o primeiro slot vazio da mochila
- [ ] Com a mochila cheia, o item permanece no chão e o jogador é avisado

**Expected Result:** O loot entra sozinho enquanto o jogador se movimenta, sem clique extra.

---

### US-6.2: Loot com raridade e afixos

**As a** Jogador
**I want to** encontrar itens de raridades diferentes com modificadores aleatórios
**So that** cada drop tenha chance de ser interessante

**Acceptance Criteria:**

- [ ] Quatro raridades com multiplicador, número de afixos e peso de sorteio: Comum (1,0× / 0 / 100), Raro (1,35× / 1 / 38), Épico (1,8× / 2 / 13), Lendário (2,5× / 3 / 3)
- [ ] Os afixos são sorteados entre os 8 disponíveis (atk, def, ml, hp, mp, speed, crit, leech), dentro das faixas mínima e máxima definidas
- [ ] A raridade é sinalizada por cor no chão e na mochila
- [ ] As raridades e o escalonamento por andar são verificados pelo teste headless

**Expected Result:** Drops variam de forma perceptível e o lendário é raro o bastante para ser um evento.

---

### US-6.3: Gerenciar mochila e equipar

**As a** Jogador
**I want to** abrir a mochila e equipar o que encontrei
**So that** meu personagem melhore com o loot

**Acceptance Criteria:**

- [ ] Tab ou I abre e fecha a mochila; Esc fecha qualquer painel aberto
- [ ] A mochila tem 20 slots e mostra nome, raridade, stats e afixos de cada item
- [ ] Há 6 slots equipáveis: arma, mão secundária, armadura, botas, anel e amuleto
- [ ] Itens com restrição de vocação (`forVoc`) só podem ser equipados pelas vocações listadas, com recusa explicada
- [ ] Equipar recalcula os stats efetivos imediatamente, e o item substituído volta para a mochila

**Expected Result:** O jogador troca de equipamento em segundos e vê o efeito nos stats na hora.

---

### US-6.4: Usar poções sem abrir painel

**As a** Jogador
**I want to** beber poção de vida e de mana por tecla
**So that** eu me cure no meio da luta sem parar

**Acceptance Criteria:**

- [ ] Q consome poção de vida (70 HP) e E consome poção de mana (60 MP)
- [ ] Cada tipo empilha até 20 unidades num único slot
- [ ] Usar sem estoque não consome nada e dá retorno visual da falta
- [ ] A quantidade restante fica visível no HUD, sem precisar abrir a mochila

**Expected Result:** Curar-se é uma tecla, e o jogador sempre sabe quantas poções ainda tem.

---

## 7. Persistência de Progresso

### US-7.1: Progresso salvo por vocação

**As a** Jogador
**I want to** que cada vocação guarde o próprio progresso
**So that** eu alterne de classe sem perder nada

**Acceptance Criteria:**

- [ ] O save é gravado em `localStorage` na chave `sf-save-{vocação}`, uma chave independente por vocação
- [ ] O save contém nível, XP, ouro, equipamento e inventário
- [ ] A gravação acontece nos marcos da partida (troca de andar, fim de sessão), não apenas ao sair
- [ ] Ao escolher a vocação no lobby, o save correspondente é carregado e o nível aparece na seleção

**Expected Result:** Cada uma das 4 vocações tem uma trilha de progresso própria e persistente no navegador.

---

### US-7.2: Levar meu progresso para qualquer sala

**As a** Convidado
**I want to** entrar na sala de outra pessoa com meu personagem evoluído
**So that** meu tempo de jogo conte independente de quem hospeda

**Acceptance Criteria:**

- [ ] Ao conectar, o convidado envia o save da vocação escolhida para o host
- [ ] O host instancia o jogador com o nível, os stats, o equipamento e o inventário recebidos
- [ ] O host não guarda nem sobrescreve o progresso dos convidados: o dono do save é sempre o navegador de quem jogou
- [ ] Ao sair da partida, o convidado grava o progresso atualizado no próprio `localStorage`

**Expected Result:** O personagem é do jogador, não da sala — ele o leva para qualquer host.

---

### US-7.3: Falha de armazenamento não derruba a partida

**As a** Jogador
**I want to** continuar jogando mesmo se o navegador recusar a gravação
**So that** um problema de cota não me tire do jogo

**Acceptance Criteria:**

- [ ] Exceção de gravação (cota cheia, modo privado) é capturada e não propaga
- [ ] A partida continua normalmente após a falha
- [ ] O jogador recebe um aviso não bloqueante de que o progresso pode não ter sido salvo

**Expected Result:** Armazenamento indisponível degrada a persistência, nunca a jogabilidade.

---

## 8. Late Join

### US-8.1: Entrar com a partida em curso

**As a** Convidado
**I want to** entrar numa sala que já está jogando
**So that** eu não precise esperar o grupo recomeçar do andar 1

**Acceptance Criteria:**

- [ ] Conectar a uma sala em partida coloca o jogador numa **fila de entrada**, sem instanciar entidade no andar corrente
- [ ] A tela de espera informa o andar atual do grupo e a posição na fila
- [ ] O jogador na fila enxerga o estado da sala (quem está jogando) e pode desistir a qualquer momento
- [ ] Os limites de sala cheia (10) e sala trancada valem também para a fila

**Expected Result:** Quem chega atrasado entra na sala e aguarda de forma informada, sem interferir na partida em curso.

---

### US-8.2: Entrar junto na virada de andar

**As a** Convidado
**I want to** ser inserido na partida quando o grupo descer de andar
**So that** eu comece junto com todo mundo, no mesmo lugar

**Acceptance Criteria:**

- [ ] Ao cruzar o portal, a fila de entrada é drenada e todos os jogadores em espera entram no novo andar
- [ ] Os jogadores que entraram nascem no spawn do novo andar, junto com o grupo
- [ ] O save de cada jogador que entrou é aplicado no momento da inserção (US-7.2)
- [ ] A escala de conteúdo do novo andar (US-5.3) já considera os jogadores recém-inseridos
- [ ] Nenhum full-state é enviado no meio do combate: o snapshot continua sendo o único transporte

**Expected Result:** O grupo ganha reforços na virada de andar, sem pausa nem estado especial durante o combate.

---

## 9. Comunicação e Consciência de Grupo

### US-9.1: Conversar durante a partida

**As a** Jogador
**I want to** mandar mensagem para o grupo sem sair do jogo
**So that** a gente se combine sem precisar de outro aplicativo

**Acceptance Criteria:**

- [ ] Enter abre a caixa de chat e Enter novamente envia a mensagem
- [ ] Com o chat aberto, as teclas de movimento e magia não disparam ações
- [ ] A mensagem é identificada pelo nome do remetente e visível para todos na sala
- [ ] Esc fecha o chat sem enviar
- [ ] Eventos de sistema (subiu de nível, chefe morto, andar novo) aparecem no mesmo log, com estilo distinto

**Expected Result:** O grupo se comunica dentro do jogo, e o log serve tanto para conversa quanto para eventos.

---

### US-9.2: Não perder o grupo de vista

**As a** Jogador
**I want to** enxergar onde estão meus aliados quando nos separamos
**So that** ninguém se perca na masmorra

**Acceptance Criteria:**

- [ ] Passando de 7 tiles de distância, uma linha de partículas liga o jogador ao **aliado mais próximo**
- [ ] Passando de 14 tiles, aparece um indicador de direção e distância desse aliado
- [ ] Com nenhum aliado na sala, nenhum dos dois elementos é desenhado
- [ ] A ligação acompanha a troca de aliado mais próximo sem piscar nem duplicar

**Expected Result:** Em qualquer tamanho de grupo, o jogador sempre sabe para onde correr para reencontrar alguém.

---

### US-9.3: HUD legível com grupo grande

**As a** Jogador
**I want to** um HUD que continue legível com 10 pessoas na sala
**So that** eu enxergue quem precisa de ajuda sem poluir a tela

**Acceptance Criteria:**

- [ ] O HUD mostra barra de vida e mana apenas dos **3 aliados mais próximos**
- [ ] Os demais aliados aparecem como ícone posicionado no minimapa
- [ ] Um aliado caído é destacado independentemente da distância, para que alguém possa erguê-lo
- [ ] O layout funciona em desktop e em viewport de celular sem sobreposição
- [ ] O layout definitivo depende de medição de uso (ver Open Questions): esta história entrega a regra dos 3 mais próximos, não o redesenho completo

**Expected Result:** Com 10 jogadores, a tela informa quem está por perto e quem precisa de ajuda sem virar poluição visual.

---

## Open Questions

- **Redesenho completo da HUD para grupo de 10.** O desenvolvedor considera o redesenho necessário para a saúde do jogo, mas a decisão depende de dados de uso em mobile e desktop que ainda não existem. US-9.3 entrega a regra dos 3 aliados mais próximos como direção; o layout definitivo fica pendente até haver medição.
- **Migração de host.** Decidido que o convidado recebe aviso claro quando o host cai (US-2.4). Ainda **não** foi decidido se haverá migração de host para preservar a partida de 10 pessoas — hoje a sessão simplesmente termina.
- **Limite prático de banda do host em estrela.** As 9 conexões de saída a 15Hz de snapshot ainda não foram medidas. US-2.3 prevê corte por área de interesse como plano B, mas o gatilho (a partir de quantos jogadores) só sai da medição.
- **Fórmula exata de escalonamento por jogador.** US-5.3 fixa a intenção (quantidade e HP de monstros e chefe crescem com jogadores vivos); a curva exata — linear, raiz, com teto — precisa de teste de balanceamento.

## Verificação

Rodada de validação de **20/08/2026**, ao fim da fase 16 de `project-phases.md`.

Uma história é marcada **`Validado (auto)`** quando existe teste automatizado que assere os
critérios dela — não basta o código existir. As demais seguem **`Pending`**, com o que falta
registrado abaixo. Nenhuma foi marcada por inspeção visual.

**Suítes:** `npm test` (10 arquivos, sem navegador) e `npm run test:multipeer`
(N abas de Chromium numa sessão P2P real pelo broker público do PeerJS).

| História | Coberta por                                                                 |
| -------- | --------------------------------------------------------------------------- |
| US-1.1   | tests/multipeer.mjs · tests/sim.test.mjs (código e seed)                    |
| US-1.2   | tests/multipeer.mjs (recusa cheia/trancada) · tests/room.test.mjs           |
| US-1.4   | tests/room.test.mjs · tests/multipeer.mjs (10 abas + 11º recusado)          |
| US-1.5   | tests/session.test.mjs · tests/multipeer.mjs (caso kick)                    |
| US-1.6   | tests/room.test.mjs · tests/multipeer.mjs (caso lock)                       |
| US-1.8   | tests/save.test.mjs (perfil)                                                |
| US-2.2   | tests/net.test.mjs (fila de ações e idempotência)                           |
| US-2.3   | tests/net.test.mjs · tests/party10.test.mjs · tests/multipeer.mjs (medição) |
| US-2.4   | tests/session.test.mjs · tests/multipeer.mjs (caso drop)                    |
| US-2.5   | tests/sim.test.mjs (determinismo) · tests/net.test.mjs (snapshot sem mapa)  |
| US-3.1   | tests/sim.test.mjs (A*, colisão, parede)                                    |
| US-3.5   | tests/browser.mjs (fluxo completo em viewport de celular)                   |
| US-3.6   | tests/sim.test.mjs · tests/party10.test.mjs (orçamento de tick)             |
| US-4.2   | tests/group.test.mjs (ressurreição em grupo)                                |
| US-4.3   | tests/group.test.mjs (respawn 5s/30s)                                       |
| US-5.1   | tests/sim.test.mjs · tests/party10.test.mjs (chefe e portal)                |
| US-5.2   | tests/group.test.mjs · tests/party10.test.mjs (portal coletivo)             |
| US-5.3   | tests/group.test.mjs (escala por grupo)                                     |
| US-5.4   | tests/group.test.mjs (XP e divisor)                                         |
| US-6.1   | tests/group.test.mjs (coleta determinística)                                |
| US-6.2   | tests/sim.test.mjs · tests/save.test.mjs (raridade e afixos)                |
| US-6.3   | tests/save.test.mjs · tests/net.test.mjs (mochila remota)                   |
| US-7.1   | tests/save.test.mjs (formato, versão, migração)                             |
| US-7.2   | tests/validate.test.mjs · tests/session.test.mjs                            |
| US-7.3   | tests/save.test.mjs (falha de gravação e corrupção)                         |
| US-8.1   | tests/room.test.mjs · tests/multipeer.mjs (caso late)                       |
| US-9.3   | tests/hud.test.mjs (trilho de aliados) · tests/multipeer.mjs (caso shot)    |

**Ainda pendentes de verificação:**

- **US-1.3** — falta teste da trava de vocação e da carga do save na seleção
- **US-1.7** — mecanismos cobertos; falta a partida solo completa ponta a ponta
- **US-2.1** — falta teste de reconciliação de predição sob latência
- **US-3.2** — falta teste por tipo de magia (bolt/wave/nova/ground/dash/chain)
- **US-3.3** — falta teste do disparo pelo botão direito
- **US-3.4** — falta teste do multiplicador elemental no dano final
- **US-4.1** — falta teste do custo de 10% do ouro e da preservação do inventário
- **US-6.4** — uso de poção coberto de raso; falta cura, teto de pilha e falta de estoque
- **US-8.2** — drenagem coberta em unidade; falta a virada de andar ponta a ponta no navegador
- **US-9.1** — antiflood e truncagem cobertos; falta entrega da mensagem ponta a ponta
- **US-9.2** — seta de direção coberta; falta teste do elo ligando só o mais próximo

**Não verificado de forma alguma:** a partida publicada em produção com pessoas em máquinas
diferentes. O harness multi-peer roda abas reais numa sessão P2P real, mas todas na mesma
máquina e na mesma rede — latência entre cidades, NAT restritivo e celular em rede móvel
continuam sem cobertura.

## Appendix: User Story Status

| ID     | Story                                        | Priority | Status                     |
| ------ | -------------------------------------------- | -------- | -------------------------- |
| US-1.1 | Criar sala com código curto                  | High     | Validado (auto) 2026-08-20 |
| US-1.2 | Entrar por código ou link                    | High     | Validado (auto) 2026-08-20 |
| US-1.3 | Escolher vocação antes de começar            | High     | Pending                    |
| US-1.4 | Sala com até 10 jogadores                    | High     | Validado (auto) 2026-08-20 |
| US-1.7 | Começar e jogar sozinho                      | High     | Pending                    |
| US-2.1 | Movimento responsivo apesar da latência      | High     | Pending                    |
| US-2.2 | Nenhuma ação perdida por pacote perdido      | High     | Validado (auto) 2026-08-20 |
| US-2.3 | Host aguenta o grupo de 10                   | High     | Validado (auto) 2026-08-20 |
| US-2.5 | Entrada rápida sem transferir o mapa         | High     | Validado (auto) 2026-08-20 |
| US-3.1 | Mover pelo cenário                           | High     | Validado (auto) 2026-08-20 |
| US-3.2 | Lançar as magias da vocação                  | High     | Pending                    |
| US-3.4 | Explorar fraqueza elemental                  | High     | Pending                    |
| US-3.6 | Horda sem queda de framerate                 | High     | Validado (auto) 2026-08-20 |
| US-4.1 | Morrer sem perder o que juntei               | High     | Pending                    |
| US-4.2 | Ser erguido por qualquer aliado              | High     | Validado (auto) 2026-08-20 |
| US-4.3 | Nunca ficar preso na tela de morte           | High     | Validado (auto) 2026-08-20 |
| US-5.1 | Matar o chefe e abrir o portal               | High     | Validado (auto) 2026-08-20 |
| US-5.2 | Descer só com o grupo reunido                | High     | Validado (auto) 2026-08-20 |
| US-5.3 | Conteúdo escala com o tamanho do grupo       | High     | Validado (auto) 2026-08-20 |
| US-5.4 | Subir de nível junto com o grupo             | High     | Validado (auto) 2026-08-20 |
| US-6.1 | Coleta automática                            | High     | Validado (auto) 2026-08-20 |
| US-6.2 | Loot com raridade e afixos                   | High     | Validado (auto) 2026-08-20 |
| US-6.3 | Gerenciar mochila e equipar                  | High     | Validado (auto) 2026-08-20 |
| US-6.4 | Usar poções sem abrir painel                 | High     | Pending                    |
| US-7.1 | Progresso salvo por vocação                  | High     | Validado (auto) 2026-08-20 |
| US-7.2 | Levar meu progresso para qualquer sala       | High     | Validado (auto) 2026-08-20 |
| US-8.2 | Entrar junto na virada de andar              | High     | Pending                    |
| US-1.5 | Expulsar jogador                             | Medium   | Validado (auto) 2026-08-20 |
| US-1.6 | Trancar sala                                 | Medium   | Validado (auto) 2026-08-20 |
| US-1.8 | Definir nome persistente                     | Medium   | Validado (auto) 2026-08-20 |
| US-2.4 | Aviso claro quando o host sai                | Medium   | Validado (auto) 2026-08-20 |
| US-3.3 | Ataque rápido na direção do mouse            | Medium   | Pending                    |
| US-3.5 | Jogar no celular                             | Medium   | Validado (auto) 2026-08-20 |
| US-7.3 | Falha de armazenamento não derruba a partida | Medium   | Validado (auto) 2026-08-20 |
| US-8.1 | Entrar com a partida em curso                | Medium   | Validado (auto) 2026-08-20 |
| US-9.1 | Conversar durante a partida                  | Medium   | Pending                    |
| US-9.2 | Não perder o grupo de vista                  | Medium   | Pending                    |
| US-9.3 | HUD legível com grupo grande                 | Low      | Validado (auto) 2026-08-20 |
