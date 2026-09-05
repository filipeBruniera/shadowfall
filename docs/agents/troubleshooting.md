# Troubleshooting

## P3 — save, Refúgio, bestiário e contratos

| Sintoma                                                        | Verificação e comportamento confirmado                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| O Refúgio não abre                                             | A tela só abre entre expedições. `openRefuge()` recusa partida iniciada, fila e encerramento pendente; volte ao menu ou lobby fora desses estados (`js/main.js`).                                                                                      |
| Uma criatura continua desconhecida                             | Tier 0 não revela nome nem atributos. As revelações são derivadas de 1, 25 e 100 derrotas por tipo, em `BESTIARY_TIER_THRESHOLDS`; o save conserva só a contagem (`js/balance.js`, `js/bestiary.js`).                                                  |
| Contratos aparecem vazios ou mudaram de dia                    | A lista é derivada da data UTC e de `DAILY_CONTRACT_SEED`. Save com data impossível, ids desconhecidos ou resgate sem objetivo completo é normalizado para o estado seguro por `normalizePersistedDailyContracts()` (`js/contracts.js`, `js/save.js`). |
| O progresso de contrato não avança por efeitos visuais ou rede | Só mortes emitidas pela simulação autoritativa do host entram em `createDailyContractProgress()`; eventos de rede e de apresentação não concedem progresso (`js/contracts.js`, `js/main.js`).                                                          |
| Um resgate parece indisponível ou já resgatado                 | `claimDailyContractReward()` exige a meta completa e um id ainda não presente em `claimed`. O id é gravado junto com ouro e poções antes de recarregar, por isso clique repetido ou reload não duplica a recompensa (`js/contracts.js`, `js/main.js`). |
| Save v3 ou anterior                                            | `migrateV3ToV4()` preserva os dados existentes e cria os defaults P3 vazios. Save com versão futura ou formato irrecuperável é descartado em vez de ser parcialmente aplicado (`js/save.js`).                                                          |

Verificações direcionadas: `node tests/save.test.mjs`, `node tests/bestiary.test.mjs`,
`node tests/contracts.test.mjs` e `node tests/refuge.test.mjs`. O smoke da interface é
`npm run test:browser`.
