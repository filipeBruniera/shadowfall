# Shadowfall — Ashen Realms — Database Schema

<!-- inputs: project-description.md@sha256:b87a4c17848e user-stories.md@sha256:734782be92c9 -->

## Overview

**Shadowfall não tem banco de dados.** Não há backend, não há servidor de persistência e
nenhum dado sai do navegador de quem jogou. Toda a persistência acontece em **`localStorage`**,
em chaves JSON: `sf-name` (o nome do jogador) e `sf-save-{vocação}` (um save independente por
vocação). O esquema abaixo modela **a estrutura lógica desses dados persistidos**, não um
banco relacional em produção — ele existe para dar nomes, tipos, cardinalidades e invariantes
ao que hoje é um blob JSON solto, e para servir de contrato caso o projeto ganhe um backend
mais adiante (não descartado, mas fora do escopo atual).

As entidades centrais são o **character_save** (a raiz de agregação: uma linha por vocação,
uma chave de `localStorage` por linha, versionada em `schema_version` e com a progressão em
`total_xp`), os **item_instances** que ele carrega (equipados ou na
mochila), os **item_instance_affixes** rolados em cada item e os **character_consumables**
(poções). Em volta deles ficam as tabelas de referência que hoje vivem como constantes em
`js/data.js`: **vocations**, **elements**, **rarities**, **equipment_slots**, **item_bases**,
**affix_types**, **consumable_types** e **storage_locations**.

**Convenções em vigor:** não há framework nem ORM detectado — o projeto é JavaScript ES2022
puro, sem build e sem dependências de runtime além do PeerJS via CDN. Aplica-se, portanto, o
perfil padrão: nomes de tabela no **plural, snake_case**; `id bigint [pk, increment]`; chaves
estrangeiras `<singular>_id`; `created_at` / `updated_at` nas tabelas de domínio; pivot com
os dois nomes singulares em ordem alfabética. **Nenhum campo enum ou string categórica** — todo
valor de um conjunto predefinido vira tabela de lookup com foreign key. Nenhuma entidade usa
soft delete (ver Notes).

**Mapeamento físico:** a tabela `character_saves` corresponde 1:1 a uma chave
`sf-save-{vocação}`; suas tabelas filhas (`item_instances`, `item_instance_affixes`,
`character_consumables`) são, no armazenamento real, arrays e objetos aninhados dentro do
mesmo JSON — a chave estrangeira é a relação de aninhamento, não um índice de banco.

## Schema (DBML)

```dbml
// ============================================================
// LOOKUPS — hoje constantes em js/data.js
// ============================================================

Table elements {
  id bigint [pk, increment]
  name varchar [not null, note: 'Físico, Fogo, Gelo, Energia, Terra, Sagrado, Morte']
  slug varchar [unique, not null]
  color varchar [not null, note: 'Hex usado no HUD e nos números de dano']
  is_active boolean [not null, default: true]
  created_at timestamp
  updated_at timestamp
}

Table vocations {
  id bigint [pk, increment]
  name varchar [not null]
  slug varchar [unique, not null, note: 'knight, paladin, sorcerer, druid']
  tag varchar [not null, note: 'EK, RP, MS, ED']
  color varchar [not null]
  blurb text [null]
  element_id bigint [ref: > elements.id, not null]
  base_hp int [not null]
  base_mp int [not null]
  base_atk int [not null]
  base_def int [not null]
  base_ml int [not null]
  atk_speed decimal(4,2) [not null]
  attack_range decimal(4,2) [not null]
  growth_hp decimal(5,2) [not null, note: 'Ganho por nível']
  growth_mp decimal(5,2) [not null]
  growth_atk decimal(5,2) [not null]
  growth_def decimal(5,2) [not null]
  growth_ml decimal(5,2) [not null]
  is_active boolean [not null, default: true]
  created_at timestamp
  updated_at timestamp
}

Table rarities {
  id bigint [pk, increment]
  name varchar [not null]
  slug varchar [unique, not null, note: 'common, rare, epic, legendary']
  color varchar [not null]
  stat_multiplier decimal(4,2) [not null, note: '1.00 / 1.35 / 1.80 / 2.50']
  affix_count int [not null, note: '0 / 1 / 2 / 3']
  roll_weight int [not null, note: '100 / 38 / 13 / 3']
  sort_order int [not null]
  is_active boolean [not null, default: true]
  created_at timestamp
  updated_at timestamp
}

Table equipment_slots {
  id bigint [pk, increment]
  name varchar [not null, note: 'Arma, Mão sec., Armadura, Botas, Anel, Amuleto']
  slug varchar [unique, not null, note: 'weapon, offhand, armor, boots, ring, amulet']
  sort_order int [not null]
  is_active boolean [not null, default: true]
  created_at timestamp
  updated_at timestamp
}

Table item_bases {
  id bigint [pk, increment]
  name varchar [not null]
  slug varchar [unique, not null, note: 'sword, axe, bow, spear, wand, rod, ...']
  equipment_slot_id bigint [ref: > equipment_slots.id, not null]
  glyph varchar [not null, note: 'Sprite vetorial usado no desenho']
  base_atk int [not null, default: 0]
  base_def int [not null, default: 0]
  base_ml int [not null, default: 0]
  base_hp int [not null, default: 0]
  base_mp int [not null, default: 0]
  base_speed decimal(4,2) [not null, default: 0]
  base_atk_speed decimal(4,2) [not null, default: 0]
  is_active boolean [not null, default: true]
  created_at timestamp
  updated_at timestamp
}

Table affix_types {
  id bigint [pk, increment]
  name varchar [not null, note: 'Afiado, Reforçado, Arcano, Vital, Etéreo, Veloz, Cruel, Vampírico']
  slug varchar [unique, not null, note: 'atk, def, ml, hp, mp, speed, crit, leech']
  target_stat varchar [not null, note: 'Stat que o afixo incrementa']
  min_value decimal(6,3) [not null]
  max_value decimal(6,3) [not null]
  is_percent boolean [not null, default: false]
  decimals int [not null, default: 0]
  is_active boolean [not null, default: true]
  created_at timestamp
  updated_at timestamp
}

Table consumable_types {
  id bigint [pk, increment]
  name varchar [not null, note: 'Poção de Vida, Poção de Mana']
  slug varchar [unique, not null, note: 'hpPot, mpPot']
  glyph varchar [not null]
  restore_hp int [not null, default: 0]
  restore_mp int [not null, default: 0]
  max_stack int [not null, default: 20]
  is_active boolean [not null, default: true]
  created_at timestamp
  updated_at timestamp
}

Table storage_locations {
  id bigint [pk, increment]
  name varchar [not null, note: 'Equipado, Mochila']
  slug varchar [unique, not null, note: 'equipped, inventory']
  is_active boolean [not null, default: true]
  created_at timestamp
  updated_at timestamp
}

// ============================================================
// PIVOT — restrição de vocação por base de item (forVoc)
// ============================================================

Table item_base_vocation {
  item_base_id bigint [ref: > item_bases.id, not null]
  vocation_id bigint [ref: > vocations.id, not null]

  indexes {
    (item_base_id, vocation_id) [pk]
  }
}

// ============================================================
// DOMÍNIO PERSISTIDO — o conteúdo real do localStorage
// ============================================================

// Chave `sf-name`. Uma linha por navegador — a identidade local do jogador.
Table browser_profiles {
  id bigint [pk, increment]
  storage_key varchar [unique, not null, default: 'sf-name']
  display_name varchar [not null, note: 'Máx. 14 caracteres, truncado em addPlayer']
  created_at timestamp
  updated_at timestamp
}

// Chave `sf-save-{vocação}`. Uma linha por vocação, no máximo 4 por navegador.
Table character_saves {
  id bigint [pk, increment]
  browser_profile_id bigint [ref: > browser_profiles.id, not null]
  vocation_id bigint [ref: > vocations.id, not null]
  storage_key varchar [unique, not null, note: 'sf-save-knight, sf-save-paladin, ...']
  schema_version int [not null, default: 3, note: 'Formato do save; v1 e v2 migram, versão desconhecida é descartada']
  display_name varchar [not null, note: 'Cópia do nome no momento da gravação']
  total_xp bigint [not null, default: 0, note: 'Fonte da verdade da progressão. Nível e xp residual saem daqui; o nível enviado pelo cliente é ignorado']
  level int [not null, default: 1, note: 'Derivado de total_xp. Existe por conveniência de exibição, nunca é confiado']
  xp bigint [not null, default: 0, note: 'XP residual rumo ao próximo nível. Sempre menor que floor(80 * nível^1.55)']
  gold bigint [not null, default: 0, note: 'Morte cobra 10%, arredondado para baixo']
  deepest_floor int [not null, default: 1, note: 'Campo `floor` do save']
  saved_at timestamp [not null]
  created_at timestamp
  updated_at timestamp

  indexes {
    (browser_profile_id, vocation_id) [unique]
  }
}

// Item rolado por rollItem(). Vive equipado ou num slot da mochila (20 slots).
Table item_instances {
  id bigint [pk, increment]
  character_save_id bigint [ref: > character_saves.id, not null]
  item_base_id bigint [ref: > item_bases.id, not null]
  rarity_id bigint [ref: > rarities.id, not null]
  equipment_slot_id bigint [ref: > equipment_slots.id, not null]
  storage_location_id bigint [ref: > storage_locations.id, not null]
  inventory_index int [null, note: '0..19 quando na mochila; NULL quando equipado']
  rolled_name varchar [not null, note: 'Nome base + primeiro afixo, quando houver']
  item_level int [not null, note: 'ilvl — escala os stats junto com a raridade']
  atk int [not null, default: 0]
  def int [not null, default: 0]
  ml int [not null, default: 0]
  hp int [not null, default: 0]
  mp int [not null, default: 0]
  speed decimal(5,2) [not null, default: 0]
  atk_speed decimal(5,2) [not null, default: 0]
  crit decimal(5,3) [not null, default: 0, note: 'Fração; teto de 0.35 por afixo']
  leech decimal(5,3) [not null, default: 0, note: 'Fração; teto de 0.35 por afixo']
  created_at timestamp
  updated_at timestamp

  indexes {
    (character_save_id, storage_location_id, inventory_index) [unique]
  }
}

// Afixos rolados no item. 0 a 3 linhas por item, conforme a raridade.
Table item_instance_affixes {
  id bigint [pk, increment]
  item_instance_id bigint [ref: > item_instances.id, not null]
  affix_type_id bigint [ref: > affix_types.id, not null]
  value decimal(6,3) [not null, note: 'Valor rolado já escalado pelo ilvl']
  is_percent boolean [not null, default: false]
  created_at timestamp
  updated_at timestamp

  indexes {
    (item_instance_id, affix_type_id) [unique, note: 'Um afixo não repete no mesmo item']
  }
}

// Poções. Contador por tipo, empilhado até max_stack.
Table character_consumables {
  id bigint [pk, increment]
  character_save_id bigint [ref: > character_saves.id, not null]
  consumable_type_id bigint [ref: > consumable_types.id, not null]
  quantity int [not null, default: 0, note: 'Inicial: 8 de vida, 6 de mana']
  created_at timestamp
  updated_at timestamp

  indexes {
    (character_save_id, consumable_type_id) [unique]
  }
}
```

## Relationships

- Um **browser_profile** tem muitos **character_saves** (no máximo um por vocação, logo no máximo 4).
- Um **character_save** pertence a um **browser_profile** e a uma **vocation**.
- Um **character_save** guarda a progressão em **total_xp**; `level` e `xp` são derivados dele a cada carregamento, nunca lidos como vieram.
- Uma **vocation** pertence a um **element** (o elemento temático da classe).
- Uma **vocation** tem muitos **character_saves** — um por navegador que jogou aquela classe.
- Um **character_save** tem muitos **item_instances** (equipados e na mochila) e muitos **character_consumables** (um por tipo de poção).
- Um **item_instance** pertence a um **character_save**, a um **item_base**, a uma **rarity**, a um **equipment_slot** e a um **storage_location**.
- Um **item_instance** tem de 0 a 3 **item_instance_affixes**, conforme a `affix_count` da sua raridade.
- Um **item_instance_affix** pertence a um **item_instance** e a um **affix_type**.
- Um **item_base** pertence a um **equipment_slot**.
- **item_bases** e **vocations** são muitos-para-muitos via **item_base_vocation** — a restrição `forVoc`. Base sem nenhuma linha no pivot é utilizável por todas as vocações.
- Um **character_consumable** pertence a um **character_save** e a um **consumable_type**.

## Lookup Table Seeds

**elements** (7 — `E` e `ELEM_NAME` em `js/data.js`)

| slug   | name    | color     |
| ------ | ------- | --------- |
| phys   | Físico  | `#d9cbb0` |
| fire   | Fogo    | `#ff7a2f` |
| ice    | Gelo    | `#7fd4ff` |
| energy | Energia | `#ffd84d` |
| earth  | Terra   | `#8fbf4d` |
| holy   | Sagrado | `#ffeeba` |
| death  | Morte   | `#b06bff` |

**vocations** (4)

| slug     | name       | tag | element | hp/mp    | atk/def/ml | atk_speed | range |
| -------- | ---------- | --- | ------- | -------- | ---------- | --------- | ----- |
| knight   | Cavaleiro  | EK  | phys    | 185 / 40 | 11 / 9 / 0 | 0,85      | 1,15  |
| paladin  | Paladino   | RP  | holy    | 125 / 80 | 9 / 5 / 2  | 0,55      | 6,50  |
| sorcerer | Feiticeiro | MS  | fire    | 82 / 150 | 4 / 2 / 6  | 0,70      | 6,00  |
| druid    | Druida     | ED  | ice     | 90 / 140 | 4 / 2 / 5  | 0,70      | 6,00  |

Ganhos por nível: knight 22/3/3,2/2,4/0,3 · paladin 14/7/2,4/1,3/1,0 · sorcerer 8/16/0,8/0,7/2,2 · druid 9/14/0,8/0,8/2,0 (hp/mp/atk/def/ml).

**rarities** (4)

| slug      | name     | multiplier | affix_count | weight |
| --------- | -------- | ---------- | ----------- | ------ |
| common    | Comum    | 1,00       | 0           | 100    |
| rare      | Raro     | 1,35       | 1           | 38     |
| epic      | Épico    | 1,80       | 2           | 13     |
| legendary | Lendário | 2,50       | 3           | 3      |

**equipment_slots** (6): `weapon` (Arma), `offhand` (Mão sec.), `armor` (Armadura), `boots` (Botas), `ring` (Anel), `amulet` (Amuleto).

**item_bases** (14)

| slug    | name               | slot    | stats                   | forVoc          |
| ------- | ------------------ | ------- | ----------------------- | --------------- |
| sword   | Espada             | weapon  | atk 9                   | knight          |
| axe     | Machado de Guerra  | weapon  | atk 11, atk_speed −0,08 | knight          |
| bow     | Arco Élfico        | weapon  | atk 8                   | paladin         |
| spear   | Lança Real         | weapon  | atk 10                  | paladin         |
| wand    | Varinha            | weapon  | atk 3, ml 6             | sorcerer        |
| rod     | Cajado             | weapon  | atk 3, ml 6             | druid           |
| leather | Armadura de Couro  | armor   | def 5                   | todas           |
| plate   | Peitoral de Placas | armor   | def 11                  | knight, paladin |
| robe    | Manto Arcano       | armor   | def 4, ml 3             | sorcerer, druid |
| boots   | Botas de Pressa    | boots   | speed 0,5               | todas           |
| ring    | Anel               | ring    | atk 2, ml 2             | todas           |
| amulet  | Amuleto            | amulet  | def 3, hp 15            | todas           |
| shield  | Escudo             | offhand | def 7                   | knight, paladin |
| book    | Grimório           | offhand | ml 5, mp 20             | sorcerer, druid |

**affix_types** (8)

| slug  | name      | stat  | min  | max  | formato               |
| ----- | --------- | ----- | ---- | ---- | --------------------- |
| atk   | Afiado    | atk   | 2    | 6    | inteiro               |
| def   | Reforçado | def   | 2    | 5    | inteiro               |
| ml    | Arcano    | ml    | 2    | 5    | inteiro               |
| hp    | Vital     | hp    | 12   | 40   | inteiro               |
| mp    | Etéreo    | mp    | 10   | 35   | inteiro               |
| speed | Veloz     | speed | 0,2  | 0,6  | 2 casas               |
| crit  | Cruel     | crit  | 0,03 | 0,09 | percentual, teto 0,35 |
| leech | Vampírico | leech | 0,02 | 0,07 | percentual, teto 0,35 |

**consumable_types** (2): `hpPot` (Poção de Vida, restaura 70 HP, pilha 20), `mpPot` (Poção de Mana, restaura 60 MP, pilha 20).

**storage_locations** (2): `equipped` (Equipado), `inventory` (Mochila).

## Notes & Conventions

**Natureza do esquema**

- **Não existe banco de dados no projeto.** Este documento modela a estrutura lógica do que é gravado em `localStorage`; nenhuma migration decorre dele hoje. Ele serve para (a) dar contrato e invariantes ao formato do save e (b) ser o ponto de partida caso um backend entre em escopo mais adiante — possibilidade explicitamente não descartada pelo desenvolvedor.
- As tabelas de lookup (`vocations`, `elements`, `rarities`, `equipment_slots`, `item_bases`, `affix_types`, `consumable_types`) **não são gravadas no `localStorage`** — hoje elas vivem como constantes em `js/data.js`. Aparecem aqui porque o save referencia esses valores por slug e porque a regra da casa proíbe campos enum: qualquer migração para banco precisaria destas tabelas antes das de domínio.
- No armazenamento real, `item_instances`, `item_instance_affixes` e `character_consumables` são arrays e objetos **aninhados dentro do JSON de `character_saves`** — a foreign key representa aninhamento, não índice relacional.

**Convenções**

- Sem framework nem ORM detectado (JavaScript ES2022 puro, sem build, sem dependências de runtime além do PeerJS via CDN) → perfil padrão: plural snake_case, `id bigint [pk, increment]`, FK `<singular>_id`, `created_at`/`updated_at` nas tabelas de domínio.
- **Nenhum campo enum ou string categórica.** Todo conjunto predefinido (vocação, raridade, slot, elemento, tipo de afixo, tipo de poção, local de armazenamento) é tabela de lookup com FK.
- **Nenhum soft delete.** Nenhuma entidade do modelo precisa de histórico após remoção: item descartado some do save, e um save é sobrescrito por inteiro a cada gravação. `deleted_at` não aparece em tabela alguma.
- **Nenhum upload de arquivo.** O jogo não persiste imagem ou documento: sprites são vetoriais e desenhados em runtime. Nenhuma coluna `_path` é necessária.
- Índices que valem a pena caso vire banco: `character_saves (browser_profile_id, vocation_id)` único (um save por vocação por navegador), `item_instances (character_save_id, storage_location_id, inventory_index)` único (impede dois itens no mesmo slot da mochila) e `item_instance_affixes (item_instance_id, affix_type_id)` único (`rollItem` já rejeita afixo repetido no mesmo item).

**Decisões tomadas depois da primeira redação deste documento**

- **O host valida todo save recebido.** Decisão do desenvolvedor: numa sala de até 10 pessoas (US-1.4), o save vindo do `localStorage` do convidado não é confiável. Na entrada, o host recalcula `level` a partir de `xp`, limita `item_level` pelo andar alcançado, descarta referência inexistente em `item_bases`, `rarities`, `equipment_slots` e `affix_types`, limita as faixas numéricas de `character_consumables` e de `item_instance_affixes`, e corta a capacidade de `item_instances` em 20 na mochila e um por slot equipado. A validação é função pura, determinística e idempotente. Implementada na fase 9 de `project-phases.md`.
- **O save é versionado.** `character_saves.schema_version` acompanha todo save gravado, hoje na **versão 3**. v1 (equip/inv aninhados, sem campo de versão) e v2 (itens em lista, sem XP acumulado) migram no carregamento; versão desconhecida ou futura é descartada inteira, nunca aplicada pela metade. Implementado em `js/save.js`, coberto por `tests/save.test.mjs`.
- **`total_xp` é a fonte da verdade da progressão, não `xp`.** O `xp` do jogador é **residual**: sobe de nível consumindo o que passa do limiar, então sozinho ele não determina nada — nível 99 e nível 1 podem ter o mesmo `xp`. Por isso a v3 passou a gravar o acumulado, de onde `level` e `xp` são derivados a cada carregamento. Sem isso, "recalcular o nível a partir do XP" seria impossível. A parcela por abate é `xp_do_monstro * 1/√(vivos)`, creditada aos vivos dentro de 26 tiles (US-5.4) — regra de simulação, não de persistência.
- **Limites que o host aplica na entrada.** `total_xp` é limitado pelo andar alcançado; `item_instances.item_level` é limitado a `andar + 6` e o item excedente é **rebaixado com stats recalculados**, não descartado; referência inexistente em `item_bases`, `rarities`, `equipment_slots` ou `affix_types` é descartada; `character_consumables.quantity` e os valores de `item_instance_affixes` são limitados às faixas do próprio tipo. Implementado em `js/validate.js`, coberto por `tests/validate.test.mjs`.

**Rastreabilidade às histórias**

- `character_saves.storage_key` e o índice único por vocação vêm de **US-7.1** (progresso salvo por vocação, chave `sf-save-{vocação}`).
- `browser_profiles.storage_key = 'sf-name'` e `display_name` vêm de **US-1.8** (nome persistente).
- `character_saves` sendo enviado ao host na conexão, sem o host guardar cópia, vem de **US-7.2** (o dono do save é sempre o navegador de quem jogou).
- O limite de 20 slots em `item_instances.inventory_index` vem de **US-6.3**; o teto de pilha em `character_consumables.quantity` vem de **US-6.4**.
- `rarities.roll_weight` e `affix_count`, e as faixas de `affix_types`, vêm de **US-6.2**.
- `character_saves.total_xp` como única fonte da progressão, e `level` derivado dela, vem de **US-5.4** e da validação decidida acima.
- `character_saves.gold` como único campo afetado pela morte vem de **US-4.1** (10% do ouro, inventário intacto).
- A ausência de qualquer coluna de escrita pelo host reflete **US-7.3**: falha de gravação é engolida e a partida continua.

**Conceitos não persistidos** (aparecem nas Key Concepts da descrição, mas não têm tabela)

- **Sala (room)** — não persistido: o código de 4 letras é sorteado por sessão e existe apenas no broker PeerJS enquanto o host estiver no ar.
- **Host** — não persistido: é um papel de sessão, decidido por quem clicou em criar a sala.
- **Simulação determinística** — não persistido: a seed é derivada do código da sala em runtime (`seedFromCode`), e o mapa é regerado, nunca guardado.
- **Monstro** — não persistido: os 12 tipos e os 4 chefes são conteúdo estático em `js/data.js`, e as instâncias vivem só na memória do host durante o andar.
- **Morte** — não persistida como evento: só o efeito colateral fica gravado, em `character_saves.gold`.
- **Elo de brasas** — não persistido: efeito visual calculado por distância a cada quadro.
- **Portal** — não persistido: estado do andar corrente, descartado na troca de andar.
- **Andar (floor)** — persistido apenas de forma parcial, como `character_saves.deepest_floor`: guarda-se o número do andar, nunca o mapa nem o estado dele.

## Open Questions

- **Um save por vocação, sem múltiplos personagens.** O modelo atual força no máximo 4 personagens por navegador. Não foi decidido se personagens múltiplos da mesma vocação entram em escopo — isso trocaria a chave `sf-save-{vocação}` por uma lista indexada e mudaria o índice único de `character_saves`.
- **Ainda sem migração escrita.** A coluna `schema_version` fixa o mecanismo, mas nenhuma migração concreta existe: a primeira mudança incompatível de formato terá de escrever a sua. Enquanto isso, save de versão desconhecida é descartado por inteiro, e o jogador perde o progresso daquela vocação.
