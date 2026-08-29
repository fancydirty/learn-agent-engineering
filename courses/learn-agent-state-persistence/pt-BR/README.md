---
domain: Desenvolvimento de software
tags: [persistência de estado, checkpoints, retomada após interrupção, idempotência, rebobinagem e bifurcação]
lang: pt-BR
outcome: Faça tarefas longas sobreviverem a uma interrupção: checkpoints, um livro-razão de efeitos, retomada do ponto de parada.
tier: 2
order: 9
---

# Gerenciamento e persistência de estado: fazendo tarefas longas sobreviverem à interrupção

Este curso é sobre o **estado de execução** de um agente — não o que o modelo “lembra” (isso é memória, território dos cursos 5 e 8 desta série), mas a cena em andamento que o próprio harness está segurando: o array `messages`, os contadores de turno e de uso, as chamadas de ferramenta ainda não gravadas no livro-razão. Quando o processo morre, todo arquivo em disco sobrevive, mas aquela cena se foi — e a tarefa recomeça do zero. Este curso ensina você a transformar a cena em algo que dá para gravar em disco e restaurar: gravar um checkpoint a cada passo, puxar o loop de volta do ponto de parada depois de uma queda, dizer na retomada quais ferramentas são seguras de reexecutar e quais não são (idempotência), depois dar aos checkpoints o seu segundo uso — rebobinar para uma cena anterior e bifurcar uma tentativa alternativa — e, por fim, na prática, soldar checkpoint e retomada completos ao harness que você escreveu no curso 7. É para quem já concluiu os oito primeiros cursos desta série. Este curso não reensina memória nem gerenciamento de contexto (o curso 5 cobre o que o modelo lembra entre sessões; o curso 8 cobre o que cada turno mostra ao modelo; este curso cobre o que o próprio harness registra), não ensina APIs de motores de workflow externos como o Temporal e não cobre concorrência entre processos nem consistência distribuída; o checkpointing do Claude Code aparece apenas como referência de produto — o que você constrói aqui é um para o seu próprio harness.

## Conteúdo do curso

1. [Além da memória, existe o estado](01-memory-vs-state.md)
2. [Checkpoints: gravando a cena de execução em disco](02-checkpoint-anatomy.md)
3. [Retomando de um checkpoint: reiniciando o loop](03-resume-from-checkpoint.md)
4. [Efeitos colaterais e idempotência: quais ferramentas são seguras de reexecutar na retomada](04-side-effects-idempotency.md)
5. [Rebobinar e bifurcar: o segundo valor dos checkpoints](05-rewind-and-fork.md)
6. [Mão na massa: soldando checkpoint e retomada no harness](06-build-checkpointing.md)

## Objetivos de aprendizado

Ao final deste curso você será capaz de:
- Separar a memória de um agente (o contexto entregue ao modelo) do seu estado de execução (a cena em andamento que o harness segura) e explicar por que “agentes têm estado e os erros se acumulam” torna uma queda especialmente letal para tarefas longas
- Projetar checkpoints para um loop de harness: que campos precisam entrar no instantâneo, quando gravá-lo e como gravá-lo sem corromper o próprio arquivo de checkpoint
- Implementar a retomada: reconstruir `messages` e os contadores a partir de um checkpoint, reentrar no loop e tratar corretamente a chamada órfã que sobra quando a queda acontece entre a execução da ferramenta e a gravação no livro-razão
- Dar à recuperação uma rede de segurança com idempotência: julgar quais ferramentas são inofensivas de reexecutar e quais precisam ser protegidas de uma execução dupla, e equipar as ferramentas de alto impacto com chaves de idempotência
- Usar checkpoints para além da recuperação de desastre: rebobinar para uma cena anterior e tentar de novo, bifurcar uma tentativa alternativa, e enunciar a divisão de trabalho entre checkpoints e controle de versão
- Soldar no harness do curso 7 o mecanismo completo — persistência a cada turno, recuperação com --resume, reconciliação de chamada órfã, proteção idempotente contra reexecução — e demonstrar uma tarefa longa interrompida no meio e levada até o fim

## Pré-requisitos

- Você concluiu os oito primeiros cursos desta série, ou tem conhecimento equivalente
- Você sabe escrever à mão um loop de harness dirigido por `stop_reason` e entende que `tool_use`/`tool_result` precisam emparelhar um para um (curso 7)
- Você conhece o gerenciamento da janela de contexto e a compactação (curso 8; os checkpoints deste curso cooperam com o contador `tokensUsed` dele)
- Você sabe ler e escrever código JavaScript / Node.js básico (a lição 6 é para acompanhar escrevendo)

## Tempo estimado

Cerca de 3-4 horas, incluindo o exercício prático de cada lição.
