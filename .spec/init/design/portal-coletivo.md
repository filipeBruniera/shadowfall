# Indicador de portal coletivo

Tokens e componentes: `tokens-componentes.md`. Cobre US-5.2.
Hoje um jogador segurando 1,5s no portal desce o grupo inteiro, sem nenhum indicador. A regra
passa a exigir **todos os vivos** em cima, o que torna o indicador obrigatório: sem ele
ninguém sabe quem falta.

---

## 1. Onde fica

Centro-baixo da tela, acima do `#actionBar`, no mesmo eixo do `#bossBar` (que fica no topo).
Aparece **só** quando o portal está aberto e há pelo menos um jogador em cima.

```
        ┌─────────────────────────┐
        │   3/5 no portal         │  hold-counter
        │   ████████░░░░░░░░      │  .bar, 4px, --ember
        │   Faltam Caio e Lia     │  --bone-dim, 11px
        └─────────────────────────┘
        [ ][ ][ ][ ]  [Q][E][Tab]    #actionBar
```

- **Contador `n/m`** em `--display`, 19px — mesmo tratamento de `#bossBar span`.
- **Barra de hold** usando `.bar` com altura `4px` (a de `.bar.xp`), preenchida em `--ember`.
  Ela só avança quando a condição está satisfeita: com `3/5`, a barra fica parada em zero.
- **Linha de quem falta**, com até dois nomes; acima disso, _"Faltam 4 jogadores"_.
- Largura `min(320px, 60vw)`, alinhada ao centro como o `#bossBar`.

## 2. Os dois momentos

### Reunindo — condição não satisfeita

Contador em `--bone-dim`, barra vazia e parada, linha de nomes visível. É o estado que responde
"por que não estamos descendo".

### Descendo — todos os vivos em cima

Contador vira `--ember`, a barra preenche em 1,5s, a linha de nomes some e dá lugar a
_"Descendo…"_. Ao completar, `#banner` assume com o andar novo.

## 3. Interrupção

Alguém sai do portal com a barra em curso:

- A barra **zera** (não decai) — a regra é hold coletivo, não acúmulo.
- O contador volta a `--bone-dim`.
- Uma linha em `#log .warn`: _"Marina saiu do portal."_
- O bloco pisca uma vez com a borda em `--ember` (`.14s`, respeitando `prefers-reduced-motion`).

Zerar em vez de decair é deliberado: o decaimento suave existe na ressurreição, onde a
proximidade é contínua; aqui a condição é binária e o feedback precisa ser inequívoco.

## 4. Contagem

- **Denominador `m` = jogadores vivos**, não jogadores na sala. Um caído não trava a descida.
- Alguém morrer com o grupo todo em cima **não interrompe**: `m` cai junto e a condição segue
  satisfeita. O contador atualiza de `5/5` para `4/4` sem zerar a barra.
- Alguém ser erguido no portal entra na contagem na hora, e a barra zera se ele não estiver em cima.
- Com **1 jogador vivo**, o indicador mostra `1/1` e a barra corre normalmente — o jogador solo
  nunca é bloqueado por mecanismo de grupo.

## 5. Layout mobile

```
   ┌──────────────────┐
   │  3/5 no portal   │  min(280px, 80vw)
   │  ███░░░░░░░░░    │
   │  Faltam 2        │  nomes viram contagem
   └──────────────────┘
```

- Com `pointer: coarse`, o `#actionBar` fica na direita em coluna; o indicador desloca para a
  **esquerda-baixo**, acima do `#log`, para não colidir com os botões.
- Abaixo de `520px` a linha de nomes vira só a contagem: _"Faltam 2"_.
- Com `max-height: 460px`, a linha de apoio some; contador e barra ficam.

## 6. Estados

| Estado                                     | Tratamento                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| **Vazio** (portal aberto, ninguém em cima) | O indicador **não é desenhado**. O portal já é visível no mundo e no minimapa |
| **Carregando**                             | Não se aplica — o estado é da simulação, sem espera                           |
| **Erro**                                   | Não se aplica                                                                 |
| **Cheio** (todos os vivos em cima)         | Estado "descendo" descrito acima                                              |

## 7. Aponta para

- Marcação do portal no minimapa: `hud-grupo.md`
- Ausência de elementos de grupo no modo solo: `hud-grupo.md`
