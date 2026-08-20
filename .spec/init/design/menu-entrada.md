# Menu de entrada e estados de recusa

Tokens e componentes: `tokens-componentes.md`. Cobre US-1.2, US-1.3.
A estrutura do menu atual (`#menu` em `index.html`) já está certa; o que falta é o
vocabulário de recusa com quatro motivos distintos.

---

## 1. Layout desktop

Sem mudança estrutural. `.screen` > `.menu-inner` > `.brand` + `.menu-body` + `.menu-foot`.

```
┌──────────────────────────────────────────┐
│  MASMORRA INFINITA · CO-OP ATÉ 10        │  .eyebrow  ← texto atualizado
│            Shadowfall                    │  h1
│            ASHEN REALMS                  │  .subtitle
│                                          │
│  SEU NOME                                │  .field
│  ┌────────────────────────────────────┐  │
│  │ Herói                              │  │  maxlength 14
│  └────────────────────────────────────┘  │
│                                          │
│  VOCAÇÃO                                 │
│  ┌──────┬──────┬──────┬──────┐           │  .voc-grid, 4 col
│  │  EK  │  RP  │  MS  │  ED  │           │  .voc-card
│  └──────┴──────┴──────┴──────┘           │
│  │ Aguenta pancada. Segura a linha…      │  .voc-detail
│                                          │
│  [ Jogar sozinho ]  [ CRIAR SALA ]       │  .btn-ghost + .btn-primary
│  [CÓDIGO] [ Entrar na sala ]             │  .join-row
│                                          │
│  Sala não encontrada. Confira o código.  │  .menu-status.err
└──────────────────────────────────────────┘
```

Único ajuste de texto: o `.eyebrow` deixa de dizer "co-op para dois".

## 2. Layout mobile

Já resolvido pelo CSS atual: abaixo de `520px` a `.voc-grid` vira 2 colunas. Ajustes:
- `.menu-actions` e `.join-row` empilham em coluna abaixo de `420px`.
- O campo de código mantém `130px` e continua centralizado, em `--display` com `letter-spacing: .3em`.
- Alvo de toque dos `.voc-card` já passa de `44px` pela altura natural do card.

## 3. Entrada por link de convite

URL: `?sala=CÓDIGO`.

1. O código chega preenchido no campo, em maiúsculas.
2. A tela rola até a seleção de vocação, que é o único passo que falta.
3. O `.eyebrow` troca para `VOCÊ FOI CONVIDADO` e o botão `Entrar na sala` vira `.btn-primary`,
   invertendo a hierarquia com `Criar sala`.
4. Código no link com formato inválido é ignorado em silêncio — a tela abre como menu normal,
   sem mensagem de erro para algo que o jogador não digitou.

## 4. Recusas — quatro motivos distintos

Todas em `.menu-status.err` (`#ff6b5e`). **Nenhuma recarrega a página nem tira o jogador da tela.**
O campo de código preserva o valor digitado para permitir correção.

| Motivo | Quando | Texto |
|---|---|---|
| **Código inválido** | Validação local: menos de 4 caracteres, ou caractere fora do alfabeto | *"O código tem 4 letras."* / *"Esse caractere não existe em código de sala."* |
| **Sala inexistente** | Broker devolve `peer-unavailable` | *"Sala não encontrada. Confira o código."* |
| **Sala cheia** | O host recusa por lotação | *"Sala cheia — já são 10 jogadores."* |
| **Sala trancada** | O host recusa por tranca | *"Sala trancada pelo host."* |

Distinções que importam:
- **Cheia e trancada não são erro de digitação.** O texto não sugere conferir o código.
- **Cheia e trancada chegam do host**, depois do handshake — o campo continua preenchido e o
  botão volta de `Procurando a sala…` para `Entrar na sala`.
- **Sala fora do ar** e **código errado** produzem o mesmo sintoma no broker; usar o texto de
  sala inexistente para os dois, sem tentar adivinhar.

## 5. Estados

| Estado | Tratamento |
|---|---|
| **Vazio** | Nome com placeholder `Herói`; nenhuma vocação selecionada desabilita `Criar sala`, `Jogar sozinho` e `Entrar na sala` |
| **Carregando** | `.menu-status` em `--ember`: *"Abrindo sala…"* ou *"Procurando a sala…"*; as três ações `:disabled` |
| **Erro** | `.menu-status.err` com um dos quatro textos; ações reabilitadas na hora |
| **Cheio** | Caso de erro acima, com texto próprio; nenhum tratamento visual extra no menu |

O alfabeto do código é `ACDEFGHJKLMNPQRTUVWXYZ34679` — sem `O/0`, `I/1`, `S/5`, `B/8`. O campo
aceita minúscula e converte na hora; caractere fora do alfabeto é bloqueado na digitação, não
só na validação.

## 6. Aponta para

- Tela seguinte ao criar ou entrar: `lobby-sala-10.md`
- Entrada com partida em curso: `fila-late-join.md`
