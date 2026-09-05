# Shadowfall — Ashen Realms — Project Phases

<!-- inputs: project-description.md@sha256:b87a4c17848e user-stories.md@sha256:734782be92c9 database-schema.md@sha256:971830f76efa -->

## Overview

O plano quebra a construção em **16 fases**, ordenadas fundação primeiro e só depois os fluxos
de produto. O projeto parte de um baseline já shipado — co-op para dois jogadores, completo e
testado — e o alvo é o delta do MVP: **sala de até 10 jogadores**, com topologia estrela,
late join entre andares, escalonamento de conteúdo por grupo e mecânicas de grupo
generalizadas. Por isso, muitas tarefas das fases de fundação e de fluxo já nascem `[x]`: o
código existe. As fases 6 a 9 e 14 a 15 concentram o trabalho novo.

A ordem é: **especificações de design** (fase 1, decisão do desenvolvedor de projetar antes de
codificar as telas novas), **fundação de dados** (fase 2), **fundação de simulação** (fase 3),
**fundação de render e interface** (fase 4), **fundação de rede** (fase 5) e, a partir da fase
6, os fluxos — sala, moderação, escala de rede, validação de save, combate, morte,
progressão, loot, late join, HUD de grupo — fechando na fase 16 com testes, harness
multi-peer e release. **A linha de corte do MVP é a fase 16:** concluí-la entrega a primeira
versão com sala de 10. Fica de fora, por falta de dados de uso, o redesenho completo da HUD
além da regra dos 3 aliados mais próximos; e fica fora, por decisão registrada, a migração de
host.

Cada fase é entregue a um agente **pelo número** (`Phase 6`, `Phase 12.2`). Uma fase e suas
sub-fases cabem numa sessão. `[x]` significa **implementado no código hoje** — não significa
validado: as histórias em `user-stories.md` seguem todas `Pending` de propósito, e a fase 16
é o portão de validação de tudo, inclusive do que já está marcado `[x]`.

**Conventions:**

- `[ ]` pendente · `[x]` feito no código.
- Fases e sub-fases são numeradas (`Phase 1`, `Phase 5.3`) para referência por agentes de IA.
- Tarefas de regra de negócio listam os testes automatizados a gerar; tarefas só de tela listam condições validáveis e a referência de design.
- O runner de teste do projeto é o `check()` de `tests/sim.test.mjs` (`npm test`), não um framework. Todo teste novo segue esse formato.

---

## Phase 1: Especificações de design

**Goal:** Produzir os specs de tela em `.spec/init/design/` antes de codificar a interface nova do delta de 10 jogadores. · **Depends on:** nenhuma · **Covers:** US-1.2, US-1.4, US-1.5, US-1.6, US-2.4, US-3.5, US-5.2, US-8.1, US-9.1, US-9.3

> Esta fase **produz** os artefatos de `.spec/init/design/`; todas as fases seguintes que constroem tela apontam para eles. Cada spec deve conter: layout desktop, layout mobile, estados (vazio, carregando, erro, cheio), e os tokens visuais reutilizados de `styles.css`. Nenhum spec inventa identidade nova — todos estendem o tema gótico existente.

### Phase 1.1: Telas de sala e sessão

- [x] **Task:** Especificar o lobby para até 10 jogadores em `.spec/init/design/lobby-sala-10.md`
  - **Acceptance criteria:**
    - Mostra o roster com nome e vocação de cada jogador, e o contador `n/10`
    - Define o estado do roster com 1, 5 e 10 jogadores sem scroll horizontal e sem quebra em viewport de celular
    - Define a posição dos controles exclusivos do host (Começar, tranca, expulsar) e como eles somem para o convidado
    - Define o estado "sala cheia" visto por quem já está dentro
  - **Design ref:** `.spec/init/design/lobby-sala-10.md` (produzido por esta tarefa)
  - **Traces:** US-1.4, US-1.5, US-1.6

- [x] **Task:** Especificar o menu de entrada e seus estados de recusa em `.spec/init/design/menu-entrada.md`
  - **Acceptance criteria:**
    - Define o campo de código de 4 caracteres, o campo de nome e a grade de vocações
    - Define as mensagens de recusa distintas: código inválido, sala inexistente, sala cheia, sala trancada
    - Nenhuma recusa recarrega a página nem tira o jogador da tela de entrada
    - Define o estado de entrada por link (`?sala=CODE`), com o código já preenchido
  - **Design ref:** `.spec/init/design/menu-entrada.md` (produzido por esta tarefa)
  - **Traces:** US-1.2, US-1.3

- [x] **Task:** Especificar a tela de fila de late join em `.spec/init/design/fila-late-join.md`
  - **Acceptance criteria:**
    - Mostra o andar atual do grupo, a posição na fila e quem está jogando
    - Tem ação de desistir sempre visível
    - Define a transição da fila para o jogo na virada de andar
  - **Design ref:** `.spec/init/design/fila-late-join.md` (produzido por esta tarefa)
  - **Traces:** US-8.1

- [x] **Task:** Especificar o aviso de queda do host em `.spec/init/design/aviso-host-caiu.md`
  - **Acceptance criteria:**
    - Diferencia visualmente "tentando reconectar" de "partida encerrada"
    - Oferece retorno ao menu sem recarregar a página
    - Informa que o progresso foi gravado
  - **Design ref:** `.spec/init/design/aviso-host-caiu.md` (produzido por esta tarefa)
  - **Traces:** US-2.4

- [x] **Task:** Especificar a moderação de sala em partida em `.spec/init/design/moderacao-sala.md`
  - **Acceptance criteria:**
    - Lista de jogadores acessível durante a partida, com ação de expulsar visível só para o host
    - Define a confirmação antes de expulsar e o retorno visual para quem foi expulso
    - Define o indicador de sala trancada visível para todos
  - **Design ref:** `.spec/init/design/moderacao-sala.md` (produzido por esta tarefa)
  - **Traces:** US-1.5, US-1.6

### Phase 1.2: Telas de jogo

- [x] **Task:** Especificar a HUD de grupo em `.spec/init/design/hud-grupo.md`
  - **Acceptance criteria:**
    - Define as barras dos 3 aliados mais próximos e o tratamento dos demais como ícone no minimapa
    - Define o destaque de aliado caído, independentemente da distância
    - Define o comportamento quando há 0, 1, 3 e 9 aliados
    - Registra explicitamente que este é o layout de transição, não o redesenho completo (ver Open Questions)
  - **Design ref:** `.spec/init/design/hud-grupo.md` (produzido por esta tarefa)
  - **Traces:** US-9.3

- [x] **Task:** Especificar o layout mobile da HUD de grupo em `.spec/init/design/hud-grupo-mobile.md`
  - **Acceptance criteria:**
    - Define a convivência das barras de aliado com o joystick (metade esquerda) e os botões (metade direita)
    - Nenhuma sobreposição entre HUD de grupo, barra de magias e barra do chefe
    - Define o que é cortado primeiro quando a altura da viewport é pequena
  - **Design ref:** `.spec/init/design/hud-grupo-mobile.md` (produzido por esta tarefa)
  - **Traces:** US-3.5, US-9.3

- [x] **Task:** Especificar o indicador de portal coletivo em `.spec/init/design/portal-coletivo.md`
  - **Acceptance criteria:**
    - Mostra a contagem `n/m` de jogadores vivos em cima do portal
    - Define o aviso quando alguém sai do portal e o hold coletivo zera
    - Define o estado com 1 jogador vivo
  - **Design ref:** `.spec/init/design/portal-coletivo.md` (produzido por esta tarefa)
  - **Traces:** US-5.2

- [x] **Task:** Especificar o chat com grupo grande em `.spec/init/design/chat-grupo.md`
  - **Acceptance criteria:**
    - Define o limite de linhas visíveis e o descarte das antigas com 10 pessoas conversando
    - Distingue visualmente mensagem de jogador de evento de sistema
    - Define o estado de foco (chat aberto) que suprime as teclas de jogo
  - **Design ref:** `.spec/init/design/chat-grupo.md` (produzido por esta tarefa)
  - **Traces:** US-9.1

- [x] **Task:** Extrair tokens visuais e componentes compartilhados para `.spec/init/design/tokens-componentes.md`
  - **Acceptance criteria:**
    - Documenta cores, tipografia, espaçamentos e raios já usados em `styles.css`, com o nome de cada token
    - Documenta os componentes reutilizados pelas telas novas: placa de jogador, barra, chip, overlay, botão primário e secundário
    - Todo spec das fases 1.1 e 1.2 referencia tokens deste documento em vez de valores soltos
  - **Design ref:** `.spec/init/design/tokens-componentes.md` (produzido por esta tarefa)
  - **Traces:** US-3.5

---

## Phase 2: Fundação de dados — tabelas de referência e formato do save

**Goal:** Deixar o conteúdo estático completo e extrair a persistência para um módulo próprio, com todas as entidades do esquema representadas e versionadas. · **Depends on:** nenhuma · **Covers:** todas as 14 tabelas do esquema, US-1.3, US-1.8, US-6.2, US-6.3, US-6.4, US-7.1, US-7.3

### Phase 2.1: Tabelas de referência (conteúdo estático em `js/data.js`)

- [x] **Task:** Definir a tabela de referência `elements` — os 7 elementos com nome e cor
  - **Acceptance criteria:**
    - Existem exatamente 7 elementos: Físico, Fogo, Gelo, Energia, Terra, Sagrado, Morte
    - Cada elemento tem nome exibível e cor hex usada no HUD e nos números de dano
    - O multiplicador elemental resolve 1,5× em fraqueza e 0,55× em resistência
  - **Feature tests:** `elementos: fraqueza multiplica por 1,5 e resistência por 0,55` → assere `elemMult` nos três casos (fraco, resistente, neutro)
  - **Traces:** tabela `elements`, US-3.4

- [x] **Task:** Definir a tabela de referência `vocations` — 4 vocações com stats base e ganhos por nível
  - **Acceptance criteria:**
    - Existem exatamente 4 vocações com slug, nome, tag, cor, elemento e blurb
    - Cada vocação tem hp, mp, atk, def, ml, atkSpeed e range base, e os cinco ganhos por nível
    - Cada vocação tem exatamente 4 magias com custo, cooldown, tipo e elemento
  - **Feature tests:** `vocações: as 4 existem com 4 magias cada e stats completos` → assere a presença de todos os campos base e de ganho em cada vocação
  - **Traces:** tabela `vocations`, US-1.3, US-3.2

- [x] **Task:** Definir a tabela de referência `rarities` — 4 raridades com multiplicador, contagem de afixos e peso
  - **Acceptance criteria:**
    - Comum 1,0×/0 afixos/peso 100; Raro 1,35×/1/38; Épico 1,8×/2/13; Lendário 2,5×/3/3
    - Cada raridade tem cor própria usada no chão e na mochila
    - A ordem de exibição é estável (comum → lendário)
  - **Feature tests:** `raridades: multiplicador, afixos e peso conferem com a tabela` → assere os 4 conjuntos de valores
  - **Traces:** tabela `rarities`, US-6.2

- [x] **Task:** Definir a tabela de referência `equipment_slots` — os 6 slots equipáveis
  - **Acceptance criteria:**
    - Existem exatamente 6 slots: weapon, offhand, armor, boots, ring, amulet
    - Cada slot tem rótulo exibível em português
  - **Feature tests:** `slots: os 6 slots equipáveis existem com rótulo` → assere a lista e os rótulos
  - **Traces:** tabela `equipment_slots`, US-6.3

- [x] **Task:** Definir a tabela de referência `item_bases` — as 14 bases de item
  - **Acceptance criteria:**
    - Existem 14 bases, cada uma com slug, nome, slot, glyph e stats base
    - Toda base aponta para um slot válido de `equipment_slots`
  - **Feature tests:** `bases de item: as 14 existem e apontam para slot válido` → assere contagem e integridade referencial com a lista de slots
  - **Traces:** tabela `item_bases`, US-6.2

- [x] **Task:** Definir a relação `item_base_vocation` — a restrição `forVoc` por base
  - **Acceptance criteria:**
    - Bases restritas listam as vocações permitidas; base sem restrição é utilizável por todas
    - Toda vocação listada existe em `vocations`
  - **Feature tests:** `restrição de vocação: forVoc só cita vocações existentes` → assere que nenhum item base referencia vocação inexistente
  - **Traces:** tabela `item_base_vocation`, US-6.3

- [x] **Task:** Definir a tabela de referência `affix_types` — os 8 afixos com faixa e formato
  - **Acceptance criteria:**
    - Existem 8 afixos com slug, nome, stat alvo, mínimo, máximo e formato (inteiro, decimal, percentual)
    - Afixos percentuais têm teto de 0,35 aplicado na rolagem
  - **Feature tests:** `afixos: valor rolado respeita faixa e teto percentual` → rola muitos itens e assere que nenhum afixo sai da faixa nem passa de 0,35 quando percentual
  - **Traces:** tabela `affix_types`, US-6.2

- [x] **Task:** Definir a tabela de referência `consumable_types` — as 2 poções
  - **Acceptance criteria:**
    - Poção de vida restaura 70 HP e poção de mana restaura 60 MP
    - Ambas empilham até 20
  - **Feature tests:** `consumíveis: cura, mana e teto de pilha conferem` → assere os valores e o limite de empilhamento
  - **Traces:** tabela `consumable_types`, US-6.4

### Phase 2.2: Módulo de persistência (`js/save.js`)

- [x] **Task:** Criar `js/save.js` e mover para ele toda a leitura e gravação de `localStorage` hoje espalhada em `js/main.js`
  - **Acceptance criteria:**
    - `js/main.js` não chama `localStorage` diretamente em nenhum ponto
    - O módulo expõe funções de ler, gravar e apagar save por vocação, e roda em Node (sem tocar o DOM) para poder ser testado
    - O comportamento observável do save atual não muda: mesmas chaves, mesmos campos
  - **Feature tests:** `save: gravar e ler devolve o mesmo personagem` → grava um personagem completo, lê de volta e assere igualdade campo a campo
  - **Traces:** tabela `character_saves`, US-7.1

- [x] **Task:** Representar `browser_profiles` no módulo de save — o nome do jogador na chave `sf-name`
  - **Acceptance criteria:**
    - O nome é lido e gravado pelo módulo, nunca direto pela tela
    - Nome vazio recebe valor padrão em vez de gravar string vazia
    - O nome é truncado em 14 caracteres na gravação, como já ocorre ao entrar na partida
  - **Feature tests:** `perfil: nome vazio vira padrão e nome longo é truncado em 14` → assere os dois casos de borda
  - **Traces:** tabela `browser_profiles`, US-1.8

- [x] **Task:** Serializar `item_instances`, `item_instance_affixes` e `storage_locations` no save
  - **Acceptance criteria:**
    - Cada item gravado carrega base, raridade, slot, nível de item, stats calculados e a lista de afixos com valor e formato
    - O local de armazenamento é explícito: equipado (com o slot) ou mochila (com o índice de 0 a 19)
    - Dois itens nunca ocupam o mesmo índice de mochila nem o mesmo slot equipado após a leitura
    - Um afixo não aparece duas vezes no mesmo item
  - **Feature tests:** `save: itens equipados e da mochila voltam no mesmo lugar` → grava com mochila cheia e todos os slots ocupados, lê e assere posição idêntica; `save: afixo não duplica no mesmo item` → assere unicidade por tipo de afixo
  - **Traces:** tabelas `item_instances`, `item_instance_affixes`, `storage_locations`, US-6.2, US-6.3

- [x] **Task:** Serializar `character_consumables` — as quantidades de poção por tipo
  - **Acceptance criteria:**
    - As quantidades de poção de vida e de mana são gravadas e lidas por tipo
    - Quantidade nunca é negativa nem passa do teto de pilha ao ser lida
    - Save antigo sem o campo de poções assume os valores iniciais (8 de vida, 6 de mana)
  - **Feature tests:** `save: quantidade de poção é limitada entre 0 e o teto ao carregar` → assere clamp nos dois extremos e o padrão do save antigo
  - **Traces:** tabela `character_consumables`, US-6.4

- [x] **Task:** Adicionar versão de esquema ao save e a política de leitura de versão incompatível
  - **Acceptance criteria:**
    - Todo save gravado carrega a coluna `schema_version` de `character_saves`, declarada no esquema
    - Save de versão anterior conhecida é migrado no carregamento; save de versão desconhecida ou futura é descartado com aviso, não aplicado pela metade
    - Save sem campo de versão é tratado como versão 1 e migrado
    - A versão corrente grava `total_xp` em `character_saves`: o `xp` do jogador é residual e sozinho não determina o nível, então o acumulado passa a ser o campo persistido, e `level` e `xp` viram valores derivados na leitura
  - **Feature tests:** `save: versão desconhecida é descartada e não aplica dados parciais` → carrega save com versão futura e assere personagem no estado inicial; `save: versão ausente é tratada como 1 e migra` → assere migração do formato atual
  - **Traces:** tabela `character_saves`, US-7.1

- [x] **Task:** Tornar a falha de gravação visível sem quebrar a partida
  - **Acceptance criteria:**
    - Exceção de gravação (cota cheia, modo privado) é capturada e não propaga
    - A partida continua normalmente após a falha
    - O jogador recebe um aviso não bloqueante de que o progresso pode não ter sido salvo, no máximo uma vez por sessão
  - **Feature tests:** `save: falha de gravação não propaga e sinaliza uma única vez` → injeta um armazenamento que sempre lança e assere que a chamada retorna sem exceção e sinaliza uma vez
  - **Traces:** tabela `character_saves`, US-7.3

- [x] **Task:** Ler o save corrompido sem derrubar o jogo
  - **Acceptance criteria:**
    - JSON inválido na chave retorna nulo em vez de lançar
    - Campo com tipo errado (nível string, inventário objeto) é ignorado, e o restante do save é aproveitado
    - O jogador é avisado quando o save foi descartado
  - **Feature tests:** `save: JSON inválido retorna nulo` e `save: campo com tipo errado é ignorado sem derrubar o resto` → asserem os dois caminhos de falha
  - **Traces:** tabela `character_saves`, US-7.3

---

## Phase 3: Fundação de simulação — mundo determinístico e tick autoritativo

**Goal:** Garantir que o mapa, a IA e o passo de simulação sejam determinísticos, sem DOM e testáveis em Node — a base sobre a qual host autoritativo e escalonamento por grupo se apoiam. · **Depends on:** Phase 2 · **Covers:** US-1.1, US-1.3, US-2.3, US-2.5, US-3.1, US-3.6, US-5.1, US-5.3, US-9.1

### Phase 3.1: Determinismo e geração de mundo

- [x] **Task:** Implementar o RNG determinístico e a derivação de código de sala
  - **Acceptance criteria:**
    - `mulberry32` produz a mesma sequência para a mesma seed
    - O código de sala tem 4 caracteres do alfabeto sem glifos ambíguos `ACDEFGHJKLMNPQRTUVWXYZ34679`
    - `seedFromCode` deriva a mesma seed para o mesmo código, de forma estável entre máquinas
  - **Feature tests:** `rng: mesma seed produz a mesma sequência` e `código de sala: mesmo código deriva a mesma seed` → asserem determinismo e ausência de glifos ambíguos no alfabeto
  - **Traces:** US-1.1, US-2.5

- [x] **Task:** Gerar o mapa procedural de 72×72 por seed e andar
  - **Acceptance criteria:**
    - Mesma seed e mesmo andar produzem tiles idênticos; andar diferente produz mapa diferente
    - O spawn é sempre caminhável
    - O andar tem pelo menos 8 salas conectadas, com alvo de `16 + min(8, andar)`
  - **Feature tests:** `mapa determinístico` (já existente) → assere igualdade por seed, diferença por andar, spawn caminhável e contagem mínima de salas
  - **Traces:** US-2.5

- [x] **Task:** Implementar o flow field de perseguição usado pela IA
  - **Acceptance criteria:**
    - O campo é recalculado periodicamente, não por monstro
    - Nenhum monstro termina dentro de parede depois de perseguir
    - A perseguição contorna geometria sem pathfinding individual
  - **Feature tests:** `nenhum monstro dentro de parede` (já existente) → assere posição válida de todos os monstros vivos após a simulação
  - **Traces:** US-3.6

- [x] **Task:** Implementar o A* usado pelo movimento por clique
  - **Acceptance criteria:**
    - O caminho contorna paredes e termina no destino pedido, ou falha explicitamente
    - A taxa de sucesso é alta em mapas gerados aleatoriamente
  - **Feature tests:** `A* encontra caminho na maioria das vezes` (já existente) → assere sucesso muito acima da falha em amostragem ampla
  - **Traces:** US-3.1

### Phase 3.2: Núcleo do passo de simulação

- [x] **Task:** Implementar `createGame`, `populate` e `nextFloor`
  - **Acceptance criteria:**
    - O andar é populado com `min(150, 62 + andar*8)` monstros, do pool `tier <= min(4, floor((andar-1)/1.5)+1)`
    - Nenhum monstro nasce na sala de spawn
    - Cada andar tem exatamente um chefe
    - Trocar de andar limpa monstros, itens, projéteis e zonas, e repovoa
  - **Feature tests:** `progressão de andar` (já existente) → assere chefe presente, repovoamento e reposicionamento no novo spawn
  - **Traces:** US-5.1

- [x] **Task:** Implementar o passo de simulação a 30Hz sem tocar o DOM
  - **Acceptance criteria:**
    - `js/sim.js` não referencia `document`, `window` nem `localStorage`
    - O módulo roda em Node e é importado pelos testes headless
    - O tick é de tamanho fixo (1/30) e o acumulador do loop não deixa o passo variar
  - **Feature tests:** `desempenho: tick abaixo do orçamento de 30Hz` (já existente) → assere o tempo médio por tick com a população máxima do andar
  - **Traces:** US-2.3

- [x] **Task:** Implementar `stats()` — base da vocação + nível + equipamento + buffs
  - **Acceptance criteria:**
    - O cálculo soma base, ganho por nível, stats de equipamento, afixos e buffs ativos
    - HP e MP correntes nunca ultrapassam o máximo calculado
    - Trocar de equipamento recalcula na mesma chamada, sem estado intermediário inválido
  - **Feature tests:** `stats: hp dentro do máximo` (já existente) e `stats: equipar aumenta o stat correspondente` → asserem clamp e efeito do equipamento
  - **Traces:** US-1.3, US-6.3

- [x] **Task:** Implementar a fila de eventos e o log da partida
  - **Acceptance criteria:**
    - Eventos de dano, efeito, tremor, log e portal são empurrados pela simulação e consumidos pelo chamador
    - O log distingue mensagem de sistema, dano, cura, morte e chefe
    - A fila é drenada a cada passo e não cresce sem limite
  - **Feature tests:** `eventos: a simulação gera eventos de dano em combate` (já existente) → assere que o combate produz eventos
  - **Traces:** US-9.1

- [x] **Task:** Implementar colisão, terreno perigoso e reposicionamento por sobreposição
  - **Acceptance criteria:**
    - Tiles `VOID`, `WALL` e `BRAZIER` bloqueiam o movimento de jogador e monstro
    - Lava aplica 14 de dano por segundo, com elemento Fogo
    - Entidade que termine dentro de parede é reposicionada para o espaço livre mais próximo
  - **Feature tests:** `jogador não atravessou parede` (já existente) e `lava aplica 14 de dano por segundo` → asserem bloqueio e taxa de dano do terreno
  - **Traces:** US-3.1

- [x] **Task:** Extrair as constantes de balanceamento da simulação para um ponto único e parametrizável
  - **Acceptance criteria:**
    - `INV_SIZE`, `PICKUP_RADIUS`, `REVIVE_RADIUS`, `REVIVE_TIME`, `RESPAWN_DELAY`, `AUTO_RESPAWN`, o hold do portal e a fórmula de população passam a viver num único bloco exportado
    - Nenhum desses números permanece escrito à mão no meio da lógica
    - Os testes leem as constantes em vez de repetir os literais
  - **Feature tests:** `constantes: os valores exportados batem com o comportamento observado` → assere, por exemplo, que o tempo de ressurreição efetivo é o da constante exportada
  - **Traces:** US-5.3, US-4.2

---

## Phase 4: Fundação de render e interface base

**Goal:** Consolidar o renderizador isométrico e os componentes de interface reutilizados por todas as telas, alinhados aos tokens produzidos na fase 1. · **Depends on:** Phase 1, Phase 3 · **Covers:** US-1.2, US-3.1, US-3.2, US-3.5, US-3.6, US-6.3, US-6.4, US-9.2

### Phase 4.1: Renderizador

- [x] **Task:** Implementar a projeção isométrica com sistema de coordenadas único
  - **Acceptance criteria:**
    - Entidades vivem em tiles float; a projeção acontece só no desenho
    - Câmera, mira, clique e projétil usam o mesmo espaço de coordenadas
    - Tile de 64×32 e parede de 30px de altura
  - **Feature tests:** `projeção: converter e reverter uma posição devolve a original` → assere ida e volta da projeção dentro da tolerância
  - **Traces:** US-3.1

- [x] **Task:** Desenhar chão e paredes em lotes de `Path2D`
  - **Acceptance criteria:**
    - Uma chamada de desenho por cor, não por tile
    - O andar mais populoso mantém o quadro fluido em desktop e celular
  - **Traces:** US-3.6

- [x] **Task:** Implementar a iluminação dinâmica em meia resolução com vinheta em cache
  - **Acceptance criteria:**
    - O buffer de luz roda em metade da resolução do canvas
    - A vinheta é recalculada só quando o tamanho do canvas muda
  - **Traces:** US-3.6

- [x] **Task:** Desenhar sprites vetoriais de jogador, monstro, chefe, projétil e zona
  - **Acceptance criteria:**
    - Cada arquétipo de monstro tem forma própria (bones, beast, robed, brute, wisp, dragon)
    - Projéteis e zonas usam a cor do elemento
    - Estados visuais aparecem: ataque, conjuração, dano recebido, morte e status
  - **Traces:** US-3.2, US-3.4

- [x] **Task:** Desenhar o minimapa
  - **Acceptance criteria:**
    - Mostra o mapa explorado, o jogador local e os aliados
    - Marca o portal depois de aberto
  - **Traces:** US-9.2, US-5.1

### Phase 4.2: Componentes de interface

- [x] **Task:** Implementar a HUD do próprio jogador
  - **Acceptance criteria:**
    - Mostra vida, mana, XP, nível, ouro, andar e quantidade de cada poção
    - As barras acompanham o valor corrente a cada quadro
  - **Design ref:** `.spec/init/design/tokens-componentes.md`
  - **Traces:** US-6.4

- [x] **Task:** Implementar a barra de magias com custo e recarga
  - **Acceptance criteria:**
    - Mostra as 4 magias da vocação com ícone, tecla e cooldown restante
    - Magia sem mana ou em recarga aparece visualmente indisponível
  - **Design ref:** `.spec/init/design/tokens-componentes.md`
  - **Traces:** US-3.2

- [x] **Task:** Implementar a mochila e os slots de equipamento
  - **Acceptance criteria:**
    - Mostra os 20 slots da mochila e os 6 slots equipáveis
    - Cada item exibe nome, raridade por cor, stats e afixos
    - Tab ou I abre e fecha; Esc fecha qualquer painel
  - **Design ref:** `.spec/init/design/tokens-componentes.md`
  - **Traces:** US-6.3

- [x] **Task:** Implementar os controles de toque para celular
  - **Acceptance criteria:**
    - Joystick na metade esquerda e botões de magia e poção na metade direita
    - O layout se adapta a viewport de celular sem sobreposição nem scroll da página
  - **Design ref:** `.spec/init/design/tokens-componentes.md`
  - **Traces:** US-3.5

- [x] **Task:** Extrair os componentes compartilhados para bater com os tokens definidos na fase 1
  - **Acceptance criteria:**
    - Placa de jogador, barra, chip, overlay e botões passam a usar os tokens nomeados em vez de valores soltos
    - Nenhuma regressão visual nas telas existentes: menu, lobby, jogo e mochila
    - As telas novas das fases 6, 7, 14 e 15 consomem esses componentes sem redefinir estilo
  - **Design ref:** `.spec/init/design/tokens-componentes.md`
  - **Traces:** US-3.5

- [x] **Task:** Implementar o componente reutilizável de recusa de entrada
  - **Acceptance criteria:**
    - Exibe mensagens distintas para código inválido, sala inexistente, sala cheia e sala trancada
    - Nenhuma recusa recarrega a página nem tira o jogador da tela de entrada
    - O componente é usado tanto pelo menu quanto pelo retorno de erro do lobby
  - **Design ref:** `.spec/init/design/menu-entrada.md`
  - **Traces:** US-1.2

---

## Phase 5: Fundação de rede — sessão P2P, snapshot e predição

**Goal:** Consolidar o transporte P2P, a serialização de estado e a predição local, para que a escala até 10 seja um ajuste de política e não uma reescrita. · **Depends on:** Phase 3 · **Covers:** US-1.1, US-1.2, US-2.1, US-2.2, US-2.5

### Phase 5.1: Transporte

- [x] **Task:** Implementar a abertura de sala pelo host no broker PeerJS
  - **Acceptance criteria:**
    - O peer registra o id `shadowfall-ashen-{CÓDIGO}`
    - Id já ocupado devolve erro tratável em vez de travar a tela
    - Falha de carregamento do PeerJS devolve mensagem explícita
    - O tempo limite de abertura é finito e devolve erro legível
  - **Feature tests:** `sala: id ocupado devolve erro tratável` → simula o erro `unavailable-id` e assere a mensagem, sem exceção não capturada
  - **Traces:** US-1.1

- [x] **Task:** Implementar a entrada do convidado por código
  - **Acceptance criteria:**
    - O convidado conecta ao id derivado do código e envia sua identificação com nome, vocação e save
    - Sala inexistente devolve mensagem específica em vez de erro genérico
    - O tempo limite de conexão é finito
  - **Feature tests:** `entrada: sala inexistente devolve mensagem específica` → simula `peer-unavailable` e assere a mensagem
  - **Traces:** US-1.2, US-7.2

- [x] **Task:** Manter o registro de conexões do host como mapa de peers
  - **Acceptance criteria:**
    - O host guarda uma conexão por peer, com remoção em fechamento e em erro
    - Existe envio para todos e envio para um peer específico
    - A saída de um peer emite evento próprio, distinto do erro de rede
  - **Feature tests:** `conexões: fechar e errar removem o peer do registro` → assere o mapa após os dois caminhos
  - **Traces:** US-1.4, US-2.3

### Phase 5.2: Estado e sincronia

- [x] **Task:** Implementar a construção do snapshot a 15Hz
  - **Acceptance criteria:**
    - O snapshot carrega jogadores, monstros, itens, projéteis e zonas, com números arredondados para 2 casas
    - O mapa nunca entra no snapshot
    - Monstro morto e sem animação de morte não é enviado
  - **Feature tests:** `snapshot: não contém tiles de mapa` e `snapshot: monstro morto sem animação não é enviado` → asserem o conteúdo serializado
  - **Traces:** US-2.5, US-2.1

- [x] **Task:** Aplicar o snapshot no cliente e remover entidades ausentes
  - **Acceptance criteria:**
    - Entidade presente no snapshot é criada ou atualizada; entidade ausente é removida da visão
    - O convidado reconstrói o mapa por seed e andar, nunca pelo snapshot
  - **Feature tests:** `snapshot: entidade ausente é removida da visão` → aplica dois snapshots em sequência e assere a remoção
  - **Traces:** US-2.1, US-2.5

- [x] **Task:** Implementar interpolação de entidades remotas e predição local do convidado
  - **Acceptance criteria:**
    - Entidades remotas são interpoladas entre snapshots, sem teleporte visível
    - O movimento do próprio convidado é aplicado localmente antes da confirmação do host
    - Divergência acima do limite reposiciona de uma vez; abaixo dele, converge suavemente
  - **Feature tests:** `predição: divergência grande reposiciona e divergência pequena converge` → assere os dois regimes de reconciliação
  - **Traces:** US-2.1

- [x] **Task:** Implementar a fila de ações com id incremental e reenvio até confirmação
  - **Acceptance criteria:**
    - Toda ação discreta recebe id incremental e fica na fila até o host confirmar pelo último id processado
    - O host ignora id já processado, de modo que reenvio não dispara a ação duas vezes
    - A fila é limpa ao trocar de andar e ao reconectar
  - **Feature tests:** `ações: reenvio do mesmo id não executa duas vezes` → envia a mesma ação duas vezes e assere execução única; `ações: confirmação limpa a fila` → assere a limpeza pelo último id
  - **Traces:** US-2.2

- [x] **Task:** Remover o teto silencioso de 12 ações por pacote de input
  - **Acceptance criteria:**
    - Uma fila maior que 12 ações pendentes deixa de descartar as mais antigas em silêncio
    - Ou todas as pendentes são enviadas, ou o descarte é registrado e sinalizado ao jogador
    - Uma rajada de ações durante perda de pacotes não perde nenhuma magia
  - **Feature tests:** `ações: fila com 30 pendentes não perde nenhuma` → enfileira acima do teto anterior e assere que todas chegam ao host
  - **Traces:** US-2.2

- [x] **Task:** Medir e exibir a latência da sessão
  - **Acceptance criteria:**
    - O convidado mede o tempo de ida e volta periodicamente e exibe o valor
    - A medição não interfere no fluxo de input nem de snapshot
  - **Traces:** US-2.1

---

## Phase 6: Sala e lobby para até 10 jogadores

**Goal:** Levar a sala de 2 para 10 jogadores, com teto real, roster ao vivo e o fluxo de início preservado para host, convidado e solo. · **Depends on:** Phase 1, Phase 4, Phase 5 · **Covers:** US-1.1, US-1.2, US-1.3, US-1.4, US-1.7, US-1.8

### Phase 6.1: Capacidade e roster

- [x] **Task:** Implementar o teto de 10 jogadores por sala
  - **Acceptance criteria:**
    - A sala aceita de 1 a 10 jogadores; a 11ª conexão é recusada com motivo "sala cheia"
    - A recusa é enviada ao peer antes de a conexão ser encerrada, para que ele mostre a mensagem certa
    - O teto vale tanto no lobby quanto com a partida em curso
    - O jogador recusado permanece no menu e pode tentar outra sala sem recarregar
  - **Feature tests:** `sala: 11º jogador é recusado por lotação` → conecta 11 peers e assere 10 aceitos e 1 recusado com o motivo correto; `sala: recusa por lotação não derruba os já conectados` → assere que os 10 continuam na sessão
  - **Traces:** US-1.4, US-1.2

- [x] **Task:** Renderizar o roster do lobby com contador `n/10`
  - **Acceptance criteria:**
    - Mostra nome e vocação de cada jogador conectado, atualizados na entrada e na saída
    - O contador reflete a lotação corrente
    - Com 10 jogadores o roster não gera scroll horizontal nem quebra em viewport de celular
  - **Design ref:** `.spec/init/design/lobby-sala-10.md`
  - **Traces:** US-1.4

- [x] **Task:** Substituir o texto de lobby escrito para dupla por texto neutro de grupo
  - **Acceptance criteria:**
    - Nenhuma mensagem de lobby ou de entrada em partida pressupõe exatamente dois jogadores
    - As mensagens funcionam com 1, 2 e 10 jogadores na sala
  - **Design ref:** `.spec/init/design/lobby-sala-10.md`
  - **Traces:** US-1.4, US-1.7

- [x] **Task:** Gerar e exibir o código de sala e o link de convite
  - **Acceptance criteria:**
    - O código tem 4 caracteres do alfabeto sem glifos ambíguos
    - A tela exibe o código e um link copiável no formato `?sala=CÓDIGO`
    - A cópia falha de forma silenciosa e mostra o link em texto como alternativa
  - **Feature tests:** `código de sala: 4 caracteres, todos do alfabeto sem ambiguidade` → gera muitos códigos e assere tamanho e alfabeto
  - **Traces:** US-1.1

- [x] **Task:** Preencher o código automaticamente ao abrir pelo link de convite
  - **Acceptance criteria:**
    - Abrir a URL com o parâmetro de sala leva direto à escolha de vocação com o código preenchido
    - O código digitado é aceito em maiúsculas ou minúsculas
  - **Design ref:** `.spec/init/design/menu-entrada.md`
  - **Traces:** US-1.2

### Phase 6.2: Escolha de vocação, nome e início

- [x] **Task:** Implementar a seleção de vocação com carga do save correspondente
  - **Acceptance criteria:**
    - As 4 vocações são exibidas com nome, tag, cor e blurb
    - Selecionar uma vocação carrega o save daquela vocação e mostra o nível atual
    - Dois jogadores podem escolher a mesma vocação na mesma sala
  - **Feature tests:** `vocação: selecionar carrega o save da vocação escolhida` → assere nível e equipamento vindos da chave certa
  - **Traces:** US-1.3, US-7.1

- [x] **Task:** Travar a vocação quando a partida começa
  - **Acceptance criteria:**
    - Depois do início, a troca de vocação fica indisponível para todos os jogadores
    - Um jogador na fila de late join ainda pode trocar de vocação até ser inserido
  - **Design ref:** `.spec/init/design/lobby-sala-10.md`
  - **Traces:** US-1.3

- [x] **Task:** Persistir o nome do jogador e usá-lo em lobby, HUD e chat
  - **Acceptance criteria:**
    - O nome digitado é gravado e vem preenchido na próxima sessão
    - Nome vazio recebe valor padrão em vez de bloquear a entrada
    - O nome aparece no lobby, na HUD de aliados e no chat
  - **Feature tests:** `nome: vazio vira padrão e é reaproveitado na sessão seguinte` → assere persistência e valor padrão
  - **Traces:** US-1.8

- [x] **Task:** Iniciar a partida instanciando todos os jogadores do lobby
  - **Acceptance criteria:**
    - O host instancia a si mesmo e todos os convidados do roster, aplicando o save de cada um
    - Todos recebem a mesma seed e o andar inicial
    - Com 10 jogadores, nenhum é instanciado dentro de parede nem sobreposto no spawn
  - **Feature tests:** `início: 10 jogadores nascem em posição livre e distinta no spawn` → assere ausência de colisão e de sobreposição
  - **Traces:** US-1.4, US-1.3

- [x] **Task:** Permitir começar e jogar sozinho
  - **Acceptance criteria:**
    - O início fica habilitado com 1 jogador na sala
    - Nenhum mecanismo de grupo bloqueia o jogador solo
    - O modo solo dispensa a abertura de sala no broker
  - **Feature tests:** `solo: partida completa de um jogador chega ao portal` → simula um jogador do spawn ao portal sem aliado
  - **Traces:** US-1.7

- [x] **Task:** Ocultar os elementos de grupo quando não há aliado
  - **Acceptance criteria:**
    - Elo de brasas, HUD de aliados e contagem coletiva do portal não são desenhados com 0 aliados
    - A ausência desses elementos não deixa espaço vazio no layout
  - **Design ref:** `.spec/init/design/hud-grupo.md`
  - **Traces:** US-1.7, US-9.3

---

## Phase 7: Moderação de sala e queda do host

**Goal:** Dar ao host controle sobre quem está na sala e tornar a saída dele um fim de partida explicado, não uma tela travada. · **Depends on:** Phase 6 · **Covers:** US-1.5, US-1.6, US-2.4

### Phase 7.1: Moderação

- [x] **Task:** Implementar a expulsão de jogador pelo host
  - **Acceptance criteria:**
    - A ação existe no lobby e em partida, e é visível apenas para o host
    - Expulsar encerra a conexão daquele peer e remove a entidade dele da simulação
    - O host não pode expulsar a si mesmo
    - O jogador expulso vê uma mensagem explicando a remoção, não uma tela de erro
    - O progresso do expulso é gravado no armazenamento dele antes da saída
  - **Feature tests:** `expulsão: peer removido sai da simulação e da lista` → assere estado após a ação; `expulsão: host não pode expulsar a si mesmo` → assere recusa; `expulsão: progresso do expulso é gravado antes da saída` → assere a gravação
  - **Design ref:** `.spec/init/design/moderacao-sala.md`
  - **Traces:** US-1.5

- [x] **Task:** Implementar a tranca de sala
  - **Acceptance criteria:**
    - O controle de trancar e destrancar é visível apenas para o host
    - Com a sala trancada, novas conexões são recusadas com o motivo "sala trancada", inclusive abaixo do teto de 10
    - Destrancar volta a aceitar conexões imediatamente, sem trocar o código
    - O estado de trancada é visível para todos os jogadores da sala
  - **Feature tests:** `tranca: conexão é recusada mesmo com vaga` → assere a recusa com sala trancada e 3 de 10 ocupadas; `tranca: destrancar volta a aceitar sem trocar o código` → assere aceitação e código estável
  - **Design ref:** `.spec/init/design/moderacao-sala.md`
  - **Traces:** US-1.6

- [x] **Task:** Exibir a lista de jogadores durante a partida
  - **Acceptance criteria:**
    - A lista mostra todos os jogadores da sala, com nome, vocação e nível
    - Para o host, cada linha traz a ação de expulsar com confirmação
    - A lista funciona em desktop e em viewport de celular
  - **Design ref:** `.spec/init/design/moderacao-sala.md`
  - **Traces:** US-1.5, US-1.6

### Phase 7.2: Saída do host e reconexão

- [x] **Task:** Distinguir queda momentânea de saída definitiva do host
  - **Acceptance criteria:**
    - A perda de conexão dispara tentativa de reconexão por um período finito antes de encerrar
    - A tela diferencia "tentando reconectar" de "partida encerrada"
    - Reconexão bem-sucedida devolve o jogador à partida sem recarregar
  - **Feature tests:** `queda: perda momentânea tenta reconectar antes de encerrar` → assere a transição de estados; `queda: esgotado o prazo, a sessão encerra uma única vez` → assere que o encerramento não dispara duas vezes
  - **Design ref:** `.spec/init/design/aviso-host-caiu.md`
  - **Traces:** US-2.4

- [x] **Task:** Gravar o progresso do convidado antes de encerrar a sessão
  - **Acceptance criteria:**
    - A gravação acontece antes de sair da partida, tanto na queda do host quanto na expulsão
    - A falha de gravação não impede o retorno ao menu
  - **Feature tests:** `queda: progresso do convidado é gravado antes de encerrar` → assere o conteúdo gravado após a queda
  - **Traces:** US-2.4, US-7.2

- [x] **Task:** Devolver o jogador ao menu sem recarregar a página
  - **Acceptance criteria:**
    - Encerrada a sessão, o jogador pode criar ou entrar em outra sala imediatamente
    - O estado da partida anterior (visão, mapa, fila de ações, conexões) é limpo por completo
    - Nenhum resíduo da sessão anterior aparece na sessão seguinte
  - **Feature tests:** `sessão: encerrar e entrar noutra sala não vaza estado da anterior` → assere visão, mapa e filas zerados
  - **Design ref:** `.spec/init/design/aviso-host-caiu.md`
  - **Traces:** US-2.4

- [x] **Task:** Encerrar a partida de todos quando o host sai deliberadamente
  - **Acceptance criteria:**
    - O host avisa os peers antes de destruir a conexão, quando a saída é deliberada
    - Todos os convidados recebem o mesmo aviso de fim de partida
    - A saída por fechamento de aba, sem aviso, cai no caminho de detecção de queda
  - **Feature tests:** `saída do host: aviso deliberado chega a todos os peers` → assere a recepção em múltiplos convidados
  - **Traces:** US-2.4

---

## Phase 8: Escala da rede em estrela

**Goal:** Sustentar 9 conexões de saída sem perder o tick nem estourar banda, mantendo o host como única autoridade. · **Depends on:** Phase 5, Phase 6 · **Covers:** US-2.1, US-2.3

- [x] **Task:** Garantir a topologia estrela como invariante
  - **Acceptance criteria:**
    - Nenhum convidado abre conexão com outro convidado, em nenhum caminho de código
    - O convidado só aceita mensagem vinda da conexão do host
    - Mensagem de origem inesperada é descartada e registrada
  - **Feature tests:** `topologia: convidado descarta mensagem que não vem do host` → assere o descarte
  - **Traces:** US-2.3

- [x] **Task:** Medir o custo do host com a sala cheia
  - **Acceptance criteria:**
    - Existe uma medição reproduzível de tempo de tick e de bytes por segundo com 10 jogadores e a população máxima do andar
    - O resultado da medição fica registrado como número, não como impressão
    - A medição roda no teste headless, sem depender de navegador
  - **Feature tests:** `escala: tick com 10 jogadores e população máxima fica dentro do orçamento de 30Hz` → assere o tempo médio por tick; `escala: tamanho do snapshot com 10 jogadores é registrado` → assere um teto explícito de bytes
  - **Traces:** US-2.3

- [x] **Task:** Implementar o corte por área de interesse por destinatário
  - **Acceptance criteria:**
    - O snapshot enviado a cada peer inclui apenas as entidades relevantes para aquele jogador, em vez do mesmo pacote para todos
    - Entidade que sai da área de interesse é removida da visão do cliente, sem ficar congelada na tela
    - Jogadores da sala continuam sempre presentes no snapshot de todos, para que a HUD de grupo funcione
    - O corte é desligável por configuração, para comparar com o envio integral na medição
  - **Feature tests:** `área de interesse: monstro distante não vai no snapshot daquele peer` → assere conteúdo por destinatário; `área de interesse: todos os jogadores estão em todo snapshot` → assere presença dos aliados independentemente da distância; `área de interesse: entidade que sai da área é removida da visão` → assere a remoção no cliente
  - **Traces:** US-2.3, US-2.1

- [x] **Task:** Enxugar o pacote de snapshot para caber na banda do host
  - **Acceptance criteria:**
    - O raio de área de interesse cobre o que a tela mostra com folga, e não o mapa inteiro: 34 tiles num mapa de 72×72 não cortava praticamente nada
    - Campo opcional só entra no pacote quando tem valor: brilho de acerto, preparo de golpe, esmaecimento de morte e vetor de status ficam de fora quando zerados
    - Nome de monstro não trafega: o cliente resolve pela tabela de conteúdo, e só o chefe carrega nome próprio no pacote
    - O cliente lê o pacote enxuto sem regressão, tratando campo ausente como zero
  - **Feature tests:** a medição vive em `escala: tamanho do snapshot com 10 jogadores é registrado e tem teto` e na projeção de banda do harness multi-peer
  - **Traces:** US-2.3, US-2.1

- [x] **Task:** Enviar o inventário por peer apenas quando ele muda
  - **Acceptance criteria:**
    - O host envia o inventário de um jogador só quando a versão do inventário dele muda
    - Com 10 jogadores, a mudança do inventário de um não gera envio para os outros nove
  - **Feature tests:** `inventário: envio ocorre só na mudança e só para o dono` → assere contagem de envios por peer
  - **Traces:** US-2.3

- [x] **Task:** Isolar o efeito de uma conexão lenta
  - **Acceptance criteria:**
    - Um peer lento ou travado não bloqueia o envio aos demais
    - O tick do host não é afetado pelo estado de uma conexão individual
    - Conexão que não drena é encerrada após um limite, com evento de saída normal
  - **Feature tests:** `escala: peer travado não afeta o tick nem o envio aos demais` → assere continuidade dos outros peers
  - **Traces:** US-2.3

- [x] **Task:** Limitar a fila de eventos de rede com grupo grande
  - **Acceptance criteria:**
    - A fila de eventos enviada por snapshot tem teto explícito e descarta os menos relevantes primeiro
    - Com 10 jogadores em combate, nenhum evento crítico (morte, chefe, andar) é descartado
  - **Feature tests:** `eventos: sob pressão, eventos críticos sobrevivem ao corte` → satura a fila e assere a presença dos críticos
  - **Traces:** US-2.3, US-9.1

---

## Phase 9: Validação de save no host

**Goal:** Impedir que um save editado no navegador do convidado entre na sala com progresso ou itens arbitrários. · **Depends on:** Phase 2, Phase 6 · **Covers:** US-7.1, US-7.2

- [x] **Task:** Recalcular o nível a partir do XP na entrada
  - **Acceptance criteria:**
    - O host deriva o nível de `character_saves.total_xp` usando `floor(80 * N^1.55)`, ignorando o nível enviado
    - XP acumulado negativo, não numérico ou ausente vira 0
    - O jogador entra com o nível recalculado, sem mensagem de erro que exponha a validação
  - **Feature tests:** `validação: nível é derivado do XP e ignora o valor enviado` → envia nível inflado e assere o nível derivado; `validação: XP inválido vira 0` → assere os casos negativo, texto e ausente
  - **Traces:** tabela `character_saves`, US-7.2

- [x] **Task:** Limitar o nível de item pelo andar alcançado
  - **Acceptance criteria:**
    - Todo item recebido tem seu nível de item limitado ao teto derivado do andar mais profundo registrado no save
    - Item acima do teto é rebaixado, não descartado, para não apagar progresso legítimo
    - O rebaixamento recalcula os stats do item pela mesma fórmula da rolagem
  - **Feature tests:** `validação: item acima do teto do andar é rebaixado e tem stats recalculados` → assere nível e stats resultantes
  - **Traces:** tabelas `item_instances`, `character_saves`, US-7.2

- [x] **Task:** Validar a integridade referencial do save recebido
  - **Acceptance criteria:**
    - Item com base, raridade ou slot inexistente é descartado
    - Afixo com tipo inexistente é descartado, e o item sobrevive sem ele
    - Item cujo slot não bate com o da base é movido para a mochila em vez de ficar equipado
  - **Feature tests:** `validação: referência inexistente é descartada sem derrubar o save` → assere os três casos
  - **Traces:** tabelas `item_bases`, `rarities`, `equipment_slots`, `affix_types`, `item_instance_affixes`, US-7.2

- [x] **Task:** Limitar as faixas numéricas do save recebido
  - **Acceptance criteria:**
    - Ouro, XP e quantidade de poção são limitados a valores não negativos e ao teto de pilha
    - Valores de afixo são limitados à faixa declarada do tipo, com o teto de 0,35 para percentuais
    - Nenhum campo numérico aceita `NaN` nem infinito
  - **Feature tests:** `validação: valores fora de faixa são limitados` → assere clamp de ouro, poções e afixos; `validação: NaN e infinito são rejeitados` → assere substituição por valor seguro
  - **Traces:** tabelas `character_consumables`, `affix_types`, US-7.2

- [x] **Task:** Limitar a capacidade do inventário e dos slots recebidos
  - **Acceptance criteria:**
    - No máximo 20 itens entram na mochila; o excedente é descartado
    - No máximo um item por slot equipável; o excedente vai para a mochila, e o que não couber é descartado
    - Índices de mochila fora de 0 a 19 são reatribuídos ao primeiro slot livre
  - **Feature tests:** `validação: mochila com 40 itens entra com 20` → assere o corte; `validação: dois itens no mesmo slot equipável` → assere um equipado e o outro na mochila
  - **Traces:** tabelas `item_instances`, `storage_locations`, US-7.2

- [x] **Task:** Executar a validação como passo único e testável na entrada
  - **Acceptance criteria:**
    - Existe uma função pura que recebe o save cru e devolve o save saneado, sem tocar rede nem DOM
    - A `schema_version` é conferida antes do saneamento: versão desconhecida descarta o save inteiro em vez de sanear campo a campo
    - Toda entrada de jogador — no lobby e na fila de late join — passa por essa função
    - A função é determinística: mesma entrada, mesma saída
  - **Feature tests:** `validação: a função é pura e determinística` → aplica duas vezes e assere igualdade; `validação: aplicar sobre um save já saneado não altera nada` → assere idempotência
  - **Traces:** tabela `character_saves`, US-7.2, US-7.1

- [x] **Task:** Registrar no log do host quando um save é saneado
  - **Acceptance criteria:**
    - O host registra o que foi ajustado, sem expor o dado bruto no chat da sala
    - O jogador validado não recebe mensagem acusatória; a partida segue normalmente
  - **Feature tests:** `validação: saneamento é registrado sem vazar para o chat` → assere destino do registro
  - **Traces:** US-7.2

---

## Phase 10: Combate

**Goal:** Consolidar movimento, magias, elementos e controles, e garantir que nada disso pressuponha dois jogadores. · **Depends on:** Phase 3, Phase 4 · **Covers:** US-3.1, US-3.2, US-3.3, US-3.4, US-3.5, US-3.6

### Phase 10.1: Movimento e mira

- [x] **Task:** Implementar o movimento por teclado e por clique
  - **Acceptance criteria:**
    - WASD move em 8 direções, com velocidade derivada dos stats e do terreno
    - Clique no chão traça rota com A* e contorna paredes
    - O jogador nunca fica preso em geometria; sobreposição com parede reposiciona
  - **Feature tests:** `movimento: WASD e clique respeitam colisão` → assere ausência de travessia de parede nos dois modos
  - **Traces:** US-3.1

- [x] **Task:** Implementar a mira no mesmo espaço de coordenadas da simulação
  - **Acceptance criteria:**
    - O ponto de mira é convertido da tela para tiles float antes de virar direção
    - Câmera, mira, clique e projétil concordam em qualquer posição do mapa
  - **Feature tests:** `mira: direção calculada bate com a posição em tiles` → assere a conversão em pontos extremos da tela
  - **Traces:** US-3.1, US-3.3

- [x] **Task:** Implementar o disparo rápido pelo botão direito
  - **Acceptance criteria:**
    - O botão direito lança a magia do primeiro slot na direção do cursor, respeitando mana e recarga
    - O menu de contexto do navegador é suprimido dentro do canvas
  - **Feature tests:** `disparo rápido: respeita mana e recarga como o slot 1` → assere recusa sem mana e em recarga
  - **Traces:** US-3.3

- [x] **Task:** Implementar os controles de toque no celular
  - **Acceptance criteria:**
    - Joystick na metade esquerda controla o movimento; botões de magia e poção na metade direita
    - O toque não dispara scroll nem zoom da página
    - O fluxo completo — combate, mochila, descida de andar — é jogável em viewport de celular
  - **Design ref:** `.spec/init/design/tokens-componentes.md`
  - **Traces:** US-3.5

### Phase 10.2: Magias, elementos e horda

- [x] **Task:** Implementar a resolução das magias por tipo
  - **Acceptance criteria:**
    - Os oito tipos resolvem corretamente: `bolt`, `wave`, `nova`, `ground`, `heal`, `buff`, `dash` e `chain`
    - A magia só dispara com mana suficiente e recarga zerada, com retorno visual claro da recusa
    - Cada magia aplica seu elemento, seu multiplicador e seus efeitos de status
  - **Feature tests:** `magias: cada tipo produz o efeito esperado` → cobre os oito tipos e assere dano, cura, buff ou deslocamento conforme o tipo; `magias: sem mana ou em recarga não dispara` → assere as duas recusas
  - **Traces:** US-3.2

- [x] **Task:** Implementar os efeitos de status
  - **Acceptance criteria:**
    - Queimadura, veneno, lentidão, congelamento, atordoamento e provocação aplicam e expiram no tempo declarado
    - Status não se acumula além do declarado por magia
    - Morte limpa todos os status do jogador
  - **Feature tests:** `status: cada efeito aplica e expira no tempo declarado` → assere duração; `status: morte limpa todos os efeitos` → assere estado limpo após a queda
  - **Traces:** US-3.2

- [x] **Task:** Aplicar o multiplicador elemental no dano
  - **Acceptance criteria:**
    - Dano contra fraqueza é multiplicado por 1,5×; contra resistência, por 0,55×; neutro fica em 1×
    - O número exibido reflete o multiplicador aplicado
    - Fraqueza e resistência de cada monstro seguem a tabela de conteúdo
  - **Feature tests:** `elementos: o dano final reflete fraqueza e resistência` → assere as três razões contra o mesmo monstro
  - **Traces:** US-3.4

- [x] **Task:** Implementar a IA por arquétipo
  - **Acceptance criteria:**
    - Os arquétipos `melee`, `pack`, `ranged`, `caster`, `tank` e `boss` têm comportamento distinto de aproximação e ataque
    - Monstro com `enrage`, `lifesteal` ou `phasing` aplica sua regra própria
    - Nenhum arquétipo trava contra geometria
  - **Feature tests:** `IA: cada arquétipo persegue e ataca dentro do próprio alcance` → assere aproximação e dano por arquétipo
  - **Traces:** US-3.6

- [x] **Task:** Sustentar a horda dentro do orçamento de tick
  - **Acceptance criteria:**
    - A simulação fica dentro do orçamento com a população máxima do andar
    - A IA usa flow field compartilhado, não pathfinding por monstro
  - **Feature tests:** `desempenho: tick abaixo do orçamento com a população máxima` (já existente) → assere o tempo médio por tick
  - **Traces:** US-3.6

- [x] **Task:** Revisar o combate para grupo grande
  - **Acceptance criteria:**
    - Nenhuma regra de combate pressupõe exatamente dois jogadores — provocação, cura em aliado e seleção de alvo funcionam com 10
    - A cura em aliado escolhe o mais ferido dentro do alcance, entre todos os aliados presentes
    - A provocação afeta os monstros no raio, independentemente de quantos jogadores há na sala
  - **Feature tests:** `combate em grupo: cura escolhe o aliado mais ferido entre 9` → assere o alvo escolhido; `combate em grupo: provocação funciona com 10 jogadores no raio` → assere a mudança de alvo dos monstros
  - **Traces:** US-3.2, US-3.4

---

## Phase 11: Morte e ressurreição em grupo

**Goal:** Generalizar a morte e a ressurreição de par fixo para qualquer tamanho de grupo, preservando o custo baixo e a rede de segurança. · **Depends on:** Phase 3, Phase 6 · **Covers:** US-4.1, US-4.2, US-4.3

- [x] **Task:** Implementar o custo da morte
  - **Acceptance criteria:**
    - A morte custa exatamente 10% do ouro corrente, arredondado para baixo
    - Inventário, equipamento, nível e XP não são afetados
    - A perda é registrada no log com o valor exato
  - **Feature tests:** `morte: custa 10% do ouro e não toca inventário nem XP` → assere ouro, itens, nível e XP antes e depois; `morte: com 0 de ouro não gera valor negativo` → assere o caso de borda
  - **Traces:** US-4.1

- [x] **Task:** Limpar o estado do jogador ao cair
  - **Acceptance criteria:**
    - Buffs e status são limpos, e o contador de morte zera
    - O jogador caído não recebe mais dano nem colide com monstro
    - A única ação aceita de quem caiu é renascer por conta própria
  - **Feature tests:** `morte: caído só aceita a ação de renascer` → assere que magia e poção são ignoradas
  - **Traces:** US-4.1, US-4.3

- [x] **Task:** Permitir que qualquer aliado erga o caído
  - **Acceptance criteria:**
    - Qualquer jogador vivo dentro de 1,6 tiles acumula progresso de ressurreição, não apenas um par fixo
    - O tempo total é de 3,5 segundos
    - O jogador erguido volta em pé no próprio local, sem custo adicional de ouro
    - O log nomeia quem ergueu
  - **Feature tests:** `ressurreição: qualquer um dos 9 aliados no raio ergue` → assere sucesso com aliados variados; `ressurreição: leva 3,5s e devolve o jogador em pé no local` → assere tempo e posição
  - **Traces:** US-4.2

- [x] **Task:** Acelerar a barra quando mais de um aliado ergue ao mesmo tempo
  - **Acceptance criteria:**
    - O progresso acumula proporcionalmente ao número de aliados no raio
    - Com dois aliados, o tempo efetivo é metade; o ganho tem teto explícito para não virar instantâneo com 9
    - O teto é uma constante exportada, não um número solto na lógica
  - **Feature tests:** `ressurreição: dois aliados erguem em metade do tempo` → assere a proporção; `ressurreição: o ganho por aliado tem teto` → assere que 9 aliados não zeram o tempo
  - **Traces:** US-4.2

- [x] **Task:** Fazer o progresso decair ao sair do raio, em vez de zerar
  - **Acceptance criteria:**
    - Sair do raio faz o progresso decair gradualmente
    - Voltar ao raio retoma de onde parou, sem reiniciar do zero
    - O decaimento é visível na barra
  - **Feature tests:** `ressurreição: sair do raio decai e voltar retoma` → assere o progresso nos três momentos
  - **Traces:** US-4.2

- [x] **Task:** Implementar a rede de segurança de respawn próprio
  - **Acceptance criteria:**
    - Após 5 segundos de morto, renascer por conta própria fica disponível e funciona sem aliado presente
    - Aos 30 segundos, o respawn acontece automaticamente mesmo sem ação do jogador
    - O renascimento reposiciona no spawn do andar corrente
  - **Feature tests:** `respawn: disponível aos 5s e automático aos 30s` → assere os dois prazos; `respawn: reposiciona no spawn do andar corrente` → assere a posição
  - **Traces:** US-4.3

- [x] **Task:** Destacar o aliado caído na interface, a qualquer distância
  - **Acceptance criteria:**
    - Um aliado caído aparece destacado mesmo fora dos 3 mais próximos
    - O destaque mostra a distância e a direção até ele
    - Com ninguém caído, o destaque não ocupa espaço
  - **Design ref:** `.spec/init/design/hud-grupo.md`
  - **Traces:** US-4.2, US-9.3

- [x] **Task:** Exibir a tela de morte com a barra de ressurreição
  - **Acceptance criteria:**
    - Mostra o tempo restante para renascer sozinho e o progresso de quem está erguendo
    - A tela some assim que o jogador volta em pé
  - **Design ref:** `.spec/init/design/hud-grupo.md`
  - **Traces:** US-4.3

---

## Phase 12: Progressão de andar e escalonamento por grupo

**Goal:** Tornar a descida uma decisão coletiva e o andar proporcional ao tamanho do grupo. · **Depends on:** Phase 3, Phase 6 · **Covers:** US-5.1, US-5.2, US-5.3, US-5.4

### Phase 12.1: Chefe e portal

- [x] **Task:** Implementar o chefe do andar e a abertura do portal
  - **Acceptance criteria:**
    - Cada andar tem exatamente um chefe, sorteado entre os quatro disponíveis
    - A morte do chefe abre o portal na sala dele e anuncia o evento a todos
    - O chefe dropa loot com nível efetivo maior que o dos monstros comuns
  - **Feature tests:** `portal abre quando o chefe morre` (já existente) → assere a abertura; `chefe: dropa loot com nível efetivo maior` → assere a diferença de nível de item
  - **Traces:** US-5.1

- [x] **Task:** Marcar o portal no minimapa depois de aberto
  - **Acceptance criteria:**
    - O portal aparece no minimapa a partir da abertura
    - A marcação some ao trocar de andar
  - **Design ref:** `.spec/init/design/portal-coletivo.md`
  - **Traces:** US-5.1

- [x] **Task:** Exigir todos os jogadores vivos no portal para descer
  - **Acceptance criteria:**
    - A descida só dispara quando **todos** os jogadores vivos estão em cima do portal por 1,5 segundos
    - Jogadores mortos não contam para o requisito
    - Um jogador morrer com o grupo em cima não interrompe a contagem
    - Alguém sair do portal zera o hold coletivo
    - Com 1 jogador vivo, basta ele cumprir os 1,5 segundos
  - **Feature tests:** `portal: com 3 vivos, 2 em cima não desce` → assere ausência de descida; `portal: todos os vivos em cima descem em 1,5s` → assere a descida; `portal: morto não conta para o requisito` → assere descida com um caído fora; `portal: sair zera o hold coletivo` → assere o reinício
  - **Traces:** US-5.2

- [x] **Task:** Exibir a contagem coletiva do portal
  - **Acceptance criteria:**
    - Mostra `n/m` de jogadores vivos em cima do portal
    - Avisa quando o hold coletivo zera por alguém ter saído
    - Some quando o portal não está aberto
  - **Design ref:** `.spec/init/design/portal-coletivo.md`
  - **Traces:** US-5.2

### Phase 12.2: Escalonamento e progressão

- [x] **Task:** Escalar quantidade e vida dos monstros pelo número de jogadores vivos
  - **Acceptance criteria:**
    - A população e o HP dos monstros crescem com o número de jogadores vivos na sala
    - A escala é calculada na entrada do andar e não muda no meio dele
    - A escala para 1 jogador reproduz o balanceamento solo atual, sem regressão
    - O teto de população continua respeitando o orçamento de tempo por tick
  - **Feature tests:** `escala: 10 jogadores enfrentam mais monstros e mais HP que 1` → assere as duas grandezas; `escala: com 1 jogador o andar é idêntico ao balanceamento atual` → assere ausência de regressão; `escala: a população escalada não estoura o orçamento de tick` → assere o tempo por tick no pior caso
  - **Traces:** US-5.3

- [x] **Task:** Escalar a vida do chefe pela mesma regra
  - **Acceptance criteria:**
    - O HP do chefe cresce com o número de jogadores vivos, pela mesma curva dos monstros comuns
    - O chefe continua morrendo em tempo comparável com 1 e com 10 jogadores
  - **Feature tests:** `escala: HP do chefe acompanha o tamanho do grupo` → assere o valor por tamanho de grupo
  - **Traces:** US-5.3

- [x] **Task:** Definir e documentar a curva de escalonamento
  - **Acceptance criteria:**
    - A curva é uma constante exportada e documentada, com teto explícito
    - A escolha entre linear, raiz ou com teto está registrada com o motivo
    - A curva é aplicada num único ponto do código, consumido por monstros e chefe
  - **Feature tests:** `escala: a curva é monotônica e respeita o teto` → assere crescimento e limite de 1 a 10 jogadores
  - **Traces:** US-5.3

- [x] **Task:** Implementar a distribuição de XP por abate
  - **Acceptance criteria:**
    - O XP é creditado a todos os jogadores vivos dentro de 26 tiles do monstro, independentemente de quem deu o golpe final
    - A parcela de cada um é o XP do monstro multiplicado por `1/√(vivos)`, arredondado para baixo, com mínimo de 1 — o divisor já implementado, confirmado por decisão do desenvolvedor e agora refletido em US-5.4
    - Jogador caído não recebe XP e não entra na contagem de vivos que forma o divisor
    - O XP necessário para o nível N é `floor(80 * N^1.55)`
    - Subir de nível aplica os ganhos da vocação e é anunciado no log
  - **Feature tests:** `XP: creditado a todos os vivos no raio, sem depender de autoria` → assere ganho de quem não abateu; `XP: divisor por √(vivos) confere com 1, 2 e 10 jogadores` → assere as três parcelas; `XP: quem está além de 26 tiles não recebe` → assere a exclusão
  - **Traces:** US-5.4

- [x] **Task:** Reposicionar e restaurar os jogadores na troca de andar
  - **Acceptance criteria:**
    - Todos voltam ao spawn do novo andar com no mínimo 60% de HP e MP
    - Status são limpos e o hold do portal zera
    - Jogadores caídos voltam em pé no novo andar
  - **Feature tests:** `andar: todos entram com ao menos 60% de HP e MP e sem status` → assere o estado de cada jogador; `andar: jogador caído volta em pé no novo andar` → assere o estado do caído
  - **Traces:** US-5.4, US-4.3

---

## Phase 13: Loot, inventário e consumíveis

**Goal:** Garantir que a economia de itens funcione igual com 1 e com 10 jogadores na sala. · **Depends on:** Phase 2, Phase 3 · **Covers:** US-6.1, US-6.2, US-6.3, US-6.4

### Phase 13.1: Drop e coleta

- [x] **Task:** Implementar o drop de ouro e item por abate
  - **Acceptance criteria:**
    - O ouro dropado é `floor((6 + nível*4) * rand(0,7 a 1,5))`
    - Monstro comum dropa item por sorteio; chefe dropa vários
    - Monstro invocado não dropa
  - **Feature tests:** `loot: monstros dropam ouro e às vezes equipamento` (já existente) → assere presença de ambos; `loot: invocado não dropa` → assere ausência de drop
  - **Traces:** US-6.1, US-6.2

- [x] **Task:** Implementar a coleta automática por proximidade
  - **Acceptance criteria:**
    - Item e ouro no chão são coletados dentro de 0,85 tile
    - O item vai para o primeiro slot vazio da mochila
    - Com a mochila cheia, o item permanece no chão e o jogador é avisado
  - **Feature tests:** `coleta: item entra no primeiro slot vazio` → assere a posição; `coleta: mochila cheia deixa o item no chão e avisa` → assere o item no chão e o aviso
  - **Traces:** US-6.1

- [x] **Task:** Definir a regra de coleta com grupo grande
  - **Acceptance criteria:**
    - Fica registrado e implementado quem fica com o item quando vários jogadores estão no raio de coleta ao mesmo tempo
    - A regra é determinística: mesma situação, mesmo resultado
    - Nenhum item é coletado duas vezes nem desaparece sem entrar em mochila alguma
  - **Feature tests:** `coleta em grupo: item é coletado uma única vez com 10 jogadores no raio` → assere unicidade; `coleta em grupo: a regra é determinística` → assere o mesmo resultado em duas execuções
  - **Traces:** US-6.1

- [x] **Task:** Implementar a rolagem de item com raridade e afixos
  - **Acceptance criteria:**
    - A raridade é sorteada pelos pesos 100/38/13/3
    - O número de afixos segue a raridade, e um afixo não repete no mesmo item
    - Os stats escalam por nível de item e pelo multiplicador da raridade
    - O nome exibido incorpora o primeiro afixo, quando houver
  - **Feature tests:** `itens têm raridade válida` (já existente) → assere o domínio; `rolagem: afixo não repete e respeita a contagem da raridade` → assere unicidade e contagem; `rolagem: stats escalam com nível de item e raridade` → assere a monotonia
  - **Traces:** US-6.2

### Phase 13.2: Mochila e uso

- [x] **Task:** Implementar a mochila de 20 slots e os 6 slots equipáveis
  - **Acceptance criteria:**
    - A mochila tem exatamente 20 slots e mostra nome, raridade, stats e afixos
    - Equipar respeita o slot da base e a restrição de vocação, com recusa explicada
    - O item substituído volta para a mochila; sem espaço, a troca é recusada
    - Equipar recalcula os stats efetivos imediatamente
  - **Feature tests:** `equipar: vocação errada é recusada com motivo` → assere a recusa; `equipar: item substituído volta para a mochila` → assere as posições; `equipar: sem espaço na mochila a troca é recusada` → assere o estado inalterado
  - **Traces:** US-6.3

- [x] **Task:** Implementar descartar e vender itens
  - **Acceptance criteria:**
    - Descartar libera o slot e remove o item do save
    - Vender converte o item em ouro e some da mochila
    - Nenhuma das ações pode ser executada por quem está caído
  - **Feature tests:** `mochila: descartar libera o slot` e `mochila: vender converte em ouro` → asserem os dois efeitos
  - **Traces:** US-6.3

- [x] **Task:** Implementar o uso de poções por tecla
  - **Acceptance criteria:**
    - Q consome poção de vida (70 HP) e E consome poção de mana (60 MP)
    - Usar sem estoque não consome nada e dá retorno visual da falta
    - Cada tipo empilha até 20; coletar acima do teto deixa a poção no chão
    - A quantidade restante fica visível no HUD
  - **Feature tests:** `poção: cura 70 e gasta uma unidade` → assere HP e estoque; `poção: sem estoque não consome nada` → assere estado inalterado; `poção: coletar acima de 20 deixa no chão` → assere o teto de pilha
  - **Traces:** US-6.4

- [x] **Task:** Sincronizar a mochila do convidado com o estado autoritativo
  - **Acceptance criteria:**
    - O convidado só vê a mochila que o host confirmou, nunca uma versão local divergente
    - Ação de mochila enviada e ainda não confirmada não corrompe a visão quando o pacote se perde
    - A tela de mochila aberta reflete a atualização sem precisar ser fechada e reaberta
  - **Feature tests:** `mochila remota: ação perdida e reenviada não duplica o item` → assere unicidade após reenvio; `mochila remota: visão do convidado converge para o estado do host` → assere a igualdade após confirmação
  - **Traces:** US-6.3, US-2.2

---

## Phase 14: Late join entre andares

**Goal:** Trocar a inserção imediata no meio do andar por uma fila drenada na virada de andar. · **Depends on:** Phase 6, Phase 9, Phase 12 · **Covers:** US-7.2, US-8.1, US-8.2

- [x] **Task:** Remover a inserção imediata de jogador com a partida em curso
  - **Acceptance criteria:**
    - Conectar com a partida em curso deixa de instanciar o jogador no andar corrente
    - Nenhum estado completo do andar é enviado no meio do combate
    - O comportamento anterior não sobrevive em nenhum caminho de código
  - **Feature tests:** `late join: conectar em partida não instancia jogador no andar corrente` → assere ausência da entidade após a conexão
  - **Traces:** US-8.1

- [x] **Task:** Implementar a fila de entrada no host
  - **Acceptance criteria:**
    - O jogador que conecta em partida entra numa fila, com sua identificação e save já saneados pela validação da fase 9
    - A fila respeita o teto de 10 contando jogadores em partida mais jogadores na fila
    - Sala trancada recusa a entrada na fila
    - Um jogador que desiste sai da fila e libera a vaga
  - **Feature tests:** `fila: teto de 10 conta jogadores em partida mais fila` → assere a recusa do 11º; `fila: sala trancada recusa a fila` → assere a recusa; `fila: desistir libera a vaga` → assere a lotação após a saída
  - **Traces:** US-8.1, US-1.4, US-1.6

- [x] **Task:** Exibir a tela de espera da fila
  - **Acceptance criteria:**
    - Mostra o andar atual do grupo, a posição na fila e quem está jogando
    - A ação de desistir está sempre disponível
    - A tela atualiza quando o grupo troca de andar
  - **Design ref:** `.spec/init/design/fila-late-join.md`
  - **Traces:** US-8.1

- [x] **Task:** Drenar a fila na virada de andar
  - **Acceptance criteria:**
    - Ao cruzar o portal, todos os jogadores da fila são inseridos no novo andar
    - Os inseridos nascem no spawn do novo andar, junto com o grupo
    - A inserção acontece antes do cálculo de escala do novo andar
    - A fila fica vazia depois da drenagem
  - **Feature tests:** `fila: todos os jogadores em espera entram no novo andar` → assere as entidades após a troca; `fila: os inseridos contam para a escala do novo andar` → assere a população escalada considerando o grupo maior
  - **Traces:** US-8.2, US-5.3

- [x] **Task:** Aplicar o save do jogador no momento da inserção
  - **Acceptance criteria:**
    - O save enviado na conexão é aplicado quando o jogador entra, não quando ele conecta
    - O save passa pela validação do host antes de ser aplicado
    - O jogador entra com nível, equipamento, inventário e poções do próprio save
  - **Feature tests:** `fila: save é aplicado na inserção e passa pela validação` → assere o estado do jogador inserido a partir de um save adulterado
  - **Traces:** US-7.2, US-8.2

- [x] **Task:** Permitir troca de vocação enquanto se espera na fila
  - **Acceptance criteria:**
    - O jogador na fila pode trocar de vocação até ser inserido
    - Trocar de vocação troca o save que será aplicado
    - Depois da inserção, a vocação fica travada como para os demais
  - **Feature tests:** `fila: trocar de vocação troca o save aplicado na inserção` → assere o save efetivo após a troca
  - **Traces:** US-8.1, US-1.3

- [x] **Task:** Tratar a saída do host e a expulsão com jogadores na fila
  - **Acceptance criteria:**
    - Queda do host esvazia a fila e devolve todos ao menu com o mesmo aviso dos jogadores em partida
    - O host pode expulsar um jogador que está na fila
    - Nenhum jogador fica preso na tela de espera após o fim da sessão
  - **Feature tests:** `fila: queda do host esvazia a fila e devolve ao menu` → assere o estado dos jogadores em espera; `fila: host pode expulsar quem está na fila` → assere a remoção
  - **Traces:** US-8.1, US-2.4, US-1.5

---

## Phase 15: Comunicação e consciência de grupo

**Goal:** Fazer chat, elo de brasas e HUD funcionarem com 10 pessoas sem virar poluição visual. · **Depends on:** Phase 1, Phase 4, Phase 6 · **Covers:** US-9.1, US-9.2, US-9.3

### Phase 15.1: Chat e log

- [x] **Task:** Implementar o chat da sala
  - **Acceptance criteria:**
    - Enter abre a caixa e Enter novamente envia; Esc fecha sem enviar
    - Com o chat aberto, teclas de movimento e magia não disparam ações
    - A mensagem é identificada pelo nome do remetente e chega a todos da sala
  - **Feature tests:** `chat: mensagem chega a todos os peers com o nome do remetente` → assere a entrega; `chat: com o chat aberto as teclas de jogo não disparam` → assere a supressão
  - **Traces:** US-9.1

- [x] **Task:** Unificar chat e eventos de sistema no mesmo log
  - **Acceptance criteria:**
    - Subir de nível, chefe morto, andar novo e entrada e saída de jogador aparecem no log
    - Eventos de sistema têm estilo distinto de mensagem de jogador
  - **Design ref:** `.spec/init/design/chat-grupo.md`
  - **Traces:** US-9.1

- [x] **Task:** Limitar o log com 10 pessoas conversando
  - **Acceptance criteria:**
    - O log tem teto de linhas e descarta as mais antigas
    - Uma rajada de mensagens não trava o quadro nem faz o log crescer sem limite
    - O tamanho do texto de cada mensagem é limitado antes do envio
  - **Feature tests:** `chat: mensagem acima do limite é truncada antes do envio` → assere o tamanho enviado; `chat: o log respeita o teto de linhas` → assere a contagem após uma rajada
  - **Design ref:** `.spec/init/design/chat-grupo.md`
  - **Traces:** US-9.1

### Phase 15.2: Elo de brasas e HUD de grupo

- [x] **Task:** Desenhar o elo de brasas acima de 7 tiles
  - **Acceptance criteria:**
    - A linha de partículas aparece quando a distância passa de 7 tiles
    - A linha não é desenhada quando não há aliado na sala
  - **Traces:** US-9.2

- [x] **Task:** Ligar o elo de brasas apenas ao aliado mais próximo
  - **Acceptance criteria:**
    - Com vários aliados distantes, apenas uma linha é desenhada, ligando ao mais próximo acima de 7 tiles
    - A ligação acompanha a troca de aliado mais próximo sem piscar nem duplicar
    - Com 9 aliados distantes, o custo de desenho é o de uma linha, não de nove
  - **Feature tests:** `elo: com 9 aliados distantes só o mais próximo é ligado` → assere o alvo escolhido; `elo: a troca de aliado mais próximo é estável` → assere ausência de alternância a cada quadro na fronteira
  - **Traces:** US-9.2

- [x] **Task:** Exibir direção e distância do aliado acima de 14 tiles
  - **Acceptance criteria:**
    - Passando de 14 tiles, aparece um indicador de direção e distância do aliado mais próximo
    - O indicador some quando a distância volta a ficar abaixo do limite
    - O indicador funciona em desktop e em viewport de celular
  - **Design ref:** `.spec/init/design/hud-grupo.md`
  - **Traces:** US-9.2

- [x] **Task:** Limitar a HUD de grupo aos 3 aliados mais próximos
  - **Acceptance criteria:**
    - A HUD mostra vida e mana apenas dos 3 aliados mais próximos
    - Os demais aparecem como ícone posicionado no minimapa
    - Um aliado caído é destacado mesmo fora dos 3 mais próximos
    - Com 0, 1, 3 e 9 aliados o layout não quebra em desktop nem em celular
    - A troca de quem está entre os 3 mais próximos não pisca a cada quadro
  - **Feature tests:** `HUD: com 9 aliados apenas 3 têm barra` → assere a contagem; `HUD: aliado caído aparece mesmo fora dos 3` → assere a presença; `HUD: a seleção dos 3 mais próximos é estável na fronteira` → assere ausência de alternância por quadro
  - **Design ref:** `.spec/init/design/hud-grupo.md`
  - **Traces:** US-9.3

- [x] **Task:** Marcar os aliados restantes no minimapa
  - **Acceptance criteria:**
    - Todo aliado fora dos 3 mais próximos aparece como ícone no minimapa, com a cor da vocação
    - Aliado caído tem marcação distinta
    - Com 9 ícones o minimapa continua legível
  - **Design ref:** `.spec/init/design/hud-grupo-mobile.md`
  - **Traces:** US-9.3

---

## Phase 16: Testes, harness multi-peer e release

**Goal:** Validar todo o baseline e todo o delta — inclusive o que já está marcado `[x]` — e publicar. · **Depends on:** todas as fases anteriores · **Covers:** todas as histórias

### Phase 16.1: Suíte headless

- [x] **Task:** Manter a suíte headless de simulação existente
  - **Acceptance criteria:**
    - `npm test` roda sem navegador e cobre determinismo de mapa, 4 vocações jogando, progressão de andar, loot e orçamento de tick
    - A suíte termina em segundos e falha com mensagem legível
  - **Feature tests:** a suíte atual de `tests/sim.test.mjs` é o próprio critério; nenhum teste novo nesta tarefa
  - **Traces:** US-2.3, US-3.6, US-5.1, US-6.2

- [x] **Task:** Estender a suíte headless para grupo de 10
  - **Acceptance criteria:**
    - Existe um cenário com 10 jogadores simulados por bots que usam o A* real, do spawn até a descida de andar
    - O cenário assere escala de conteúdo, XP, ressurreição por aliado e portal coletivo
    - O tempo por tick é medido no cenário de 10 e comparado ao de 1
  - **Feature tests:** `grupo de 10: partida completa do spawn ao portal` → assere a descida; `grupo de 10: tick permanece dentro do orçamento` → assere o tempo por tick
  - **Traces:** US-1.4, US-4.2, US-5.2, US-5.3, US-5.4

- [x] **Task:** Cobrir o módulo de save e a validação com testes headless
  - **Acceptance criteria:**
    - Todos os testes declarados nas fases 2.2 e 9 estão implementados e passando
    - Os testes rodam sem navegador, sobre um armazenamento simulado
  - **Feature tests:** a suíte reúne os testes de `character_saves`, `browser_profiles`, `item_instances`, `item_instance_affixes`, `character_consumables` e `storage_locations` declarados nas fases 2.2 e 9
  - **Traces:** US-7.1, US-7.2, US-7.3

### Phase 16.2: Harness multi-peer em Chromium

- [x] **Task:** Manter o smoke test de navegador existente
  - **Acceptance criteria:**
    - Sobe o jogo em Chromium headless, joga, entra em combate, abre a mochila, mata o chefe e desce de andar
    - Repete o fluxo em viewport de celular
    - Verifica ausência de erro de página e de console
  - **Traces:** US-3.5, US-6.3

- [x] **Task:** Recolocar o smoke test de navegador em funcionamento
  - **Acceptance criteria:**
    - O teste deixa de apontar para um caminho de Puppeteer de outra máquina e passa a resolver a dependência do projeto
    - O executável do Chromium é configurável por ambiente, com o do sistema como padrão
    - O diretório de capturas é configurável e não aponta para caminho fixo de outra máquina
    - O fluxo completo volta a rodar: combate, mochila, chefe, descida de andar e a repetição em viewport de celular
  - **Traces:** US-3.5, US-6.3

- [x] **Task:** Construir o harness multi-peer com N abas
  - **Acceptance criteria:**
    - O harness sobe N abas em Chromium, uma cria a sala e as demais entram pelo código
    - O harness roda com N configurável e é usado com 2 e com 10
    - A execução falha com mensagem legível quando qualquer aba registra erro de página ou de console
    - O harness não depende de rede externa além do broker PeerJS, e falha explicitamente se o broker estiver indisponível
  - **Feature tests:** `multi-peer: 10 abas entram na mesma sala e a partida começa` → assere a entrada de todas; `multi-peer: nenhuma aba registra erro de página ou console` → assere a ausência de erro
  - **Traces:** US-1.1, US-1.2, US-1.4, US-2.1

- [x] **Task:** Cobrir o delta de sala no harness multi-peer
  - **Acceptance criteria:**
    - O harness exercita teto de 10, recusa do 11º, tranca de sala e expulsão
    - Cada caso assere a mensagem vista pelo peer recusado ou removido
  - **Feature tests:** `multi-peer: 11º peer é recusado por lotação` → assere a mensagem; `multi-peer: tranca recusa mesmo com vaga` → assere a mensagem; `multi-peer: expulso vê a mensagem certa e sai da simulação` → assere os dois lados
  - **Traces:** US-1.4, US-1.5, US-1.6

- [x] **Task:** Cobrir late join e queda do host no harness multi-peer
  - **Acceptance criteria:**
    - O harness exercita a fila de entrada e a drenagem na virada de andar
    - O harness derruba a aba do host e assere o aviso e o retorno ao menu nas demais
    - O harness assere que o progresso do convidado foi gravado após a queda
  - **Feature tests:** `multi-peer: quem entra em partida espera e entra no andar seguinte` → assere a inserção; `multi-peer: queda do host avisa todos e devolve ao menu` → assere o estado das abas restantes
  - **Traces:** US-2.4, US-8.1, US-8.2

- [x] **Task:** Medir a sessão real de 10 peers
  - **Acceptance criteria:**
    - O harness registra quadros por segundo, latência e bytes por segundo do host com 10 abas
    - Os números ficam registrados como saída da execução, não como impressão
    - Existe um limite declarado abaixo do qual a execução falha
  - **Feature tests:** `multi-peer: banda e quadros do host com 10 peers ficam dentro do limite declarado` → assere as medições
  - **Traces:** US-2.3

### Phase 16.3: Release

- [x] **Task:** Manter o deploy estático na Vercel
  - **Acceptance criteria:**
    - Sem build step: o output é a própria pasta do projeto
    - `vercel.json` mantém `cleanUrls`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` e sem cache em `/js/*`
  - **Traces:** US-2.5

- [x] **Task:** Revalidar as histórias marcadas `Pending` antes de publicar
  - **Acceptance criteria:**
    - Cada história de `user-stories.md` tem seus critérios verificados, por teste automatizado ou por roteiro manual registrado
    - As histórias validadas são marcadas no apêndice de `user-stories.md`, com a data
    - Nenhuma história fica sem veredito
  - **Feature tests:** a verificação é a própria suíte reunida nas fases 16.1 e 16.2; o que não for automatizável fica em roteiro manual registrado
  - **Traces:** US-1.7, US-1.8, US-3.1, US-3.2, US-3.3, US-3.4, US-4.1, US-4.3, US-6.1, US-6.4, US-9.1, US-9.2

- [ ] **Task:** Publicar e verificar em produção
  - **Acceptance criteria:**
    - Uma sessão real de pelo menos 3 pessoas em máquinas diferentes conclui um andar na URL publicada
    - O celular e o desktop são exercitados na mesma sala
    - Nenhum erro de console aparece em nenhuma das pontas
  - **Traces:** US-1.1, US-1.2, US-3.5

## Open Questions

> Estado em 20/08/2026: **146 das 147 tarefas concluídas**. A única aberta é publicar e
> verificar em produção, que depende de deploy e de pessoas em máquinas diferentes.
> As dúvidas que a execução fechou saíram desta lista — a regra de coleta com vários
> jogadores no raio, por exemplo, virou "leva o mais próximo, id desempata", determinística
> e coberta por teste na fase 13.1. O que sobrou precisa de playtest, de medição fora do
> harness, ou de gente de verdade jogando.

- **Redesenho completo da HUD.** A fase 15.2 entrega a regra dos 3 aliados mais próximos como layout de transição. O redesenho completo depende de dados de uso em mobile e desktop que ainda não existem, e permanece fora do plano.
- **Migração de host.** Fora do escopo: a fase 7.2 encerra a sessão com aviso quando o host cai. Preservar a partida de 10 pessoas com troca de host não está planejado.
- **Curva de escalonamento: forma decidida, valor por confirmar.** A fase 12.2 fixou raiz quadrada com teto (`GROUP_SCALE_CAP = 2.6`), monotônica e exportada. A forma deixou de ser dúvida; falta playtest para dizer se o teto está no lugar certo.
- **Teto de aceleração da ressurreição: valor por confirmar.** A fase 11 fixou `REVIVE_MAX_HELPERS = 3` — dois aliados erguem em metade do tempo e nove não zeram a barra. O número em si ainda não passou por playtest com grupo grande.
- **Banda do host em estrela: medida, com margem estreita.** Com 10 abas numa sessão real o pacote ficou em ~5 KB, o que projeta **~700 KB/s de upload** no host com 9 peers a 15Hz; antes do enxugamento da fase 8 eram ~1,4 MB/s. Cabe no limite declarado, mas é upload alto para conexão residencial. Se apertar, os próximos cortes são `maxHp` e nível do monstro, que são estáticos e hoje viajam a cada pacote.
- **Quadros por segundo com grupo grande, fora do harness.** O harness mede abas dividindo uma CPU e uma GPU por software, então o número dele não representa o jogo — com uma aba a mesma máquina fica estável em ~48 quadros/s. Falta medir com jogadores em máquinas separadas.
