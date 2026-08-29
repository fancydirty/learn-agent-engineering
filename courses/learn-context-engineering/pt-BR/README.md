---
domain: Desenvolvimento de software
tags: [context engineering, orçamento de atenção, compactação de contexto, recuperação just-in-time, isolamento de subagentes]
lang: pt-BR
outcome: Decida o que entra — e o que sai — do contexto a cada turno, para que tarefas longas não estourem a janela.
tier: 2
order: 8
---

# Context Engineering: gastando a atenção finita onde ela conta

Este curso ensina **context engineering** — o ofício de decidir, a cada turno do loop de um agente, quais tokens o modelo pode ver. Do curso 7 você já sabe que o histórico cresce toda vez que o loop gira e que o orçamento de atenção do modelo é finito; este curso encara isso de frente: em que “altitude” um system prompt deve ser escrito, se ferramentas e exemplos contam como contexto, que informação pré-carregar e qual deixar o agente buscar por conta própria, como compactar o histórico e tomar notas em tarefas longas, por que subagentes são uma técnica de gestão de contexto — e, por fim, na prática, você vai ligar uma camada de gestão de contexto ao harness que construiu no curso 7. É para quem já concluiu os sete primeiros cursos desta série. Este curso não reensina a técnica de escrever prompts (curso 3 desta série), não cobre a persistência de arquivos entre sessões nem a recuperação de estado (tema do curso 5 — aqui o foco é “dentro desta única tarefa longa, o que cada turno deve entregar ao modelo”), não reensina os padrões de colaboração multiagente (curso 6 — subagentes aparecem aqui só pela lente do contexto) e não cobre a construção de RAG ou de bancos de dados vetoriais.

## Conteúdo do curso

1. [De prompt engineering a context engineering](01-from-prompt-to-context.md)
2. [Anatomia do contexto: system prompt, ferramentas e exemplos](02-anatomy-of-context.md)
3. [Recuperação just-in-time: deixando o agente buscar o próprio contexto](03-just-in-time-context.md)
4. [Compactação e notas: gestão de contexto para tarefas longas](04-compaction-and-notes.md)
5. [Subagentes e isolamento de contexto](05-subagent-context-isolation.md)
6. [Prática: ligando a gestão de contexto ao harness](06-build-context-management.md)

## Objetivos de aprendizado

Ao final deste curso você será capaz de:
- Explicar como o context engineering se relaciona com o prompt engineering e usar o orçamento de atenção e o apodrecimento do contexto para explicar por que o contexto é um recurso finito com retornos marginais decrescentes
- Julgar a “altitude” de um system prompt — lógica frágil hardcoded em um extremo, orientação vaga e sem sinal no outro — e reescrevê-lo até o ponto específico o bastante para guiar o comportamento e que ainda assim deixe boas heurísticas
- Traçar a fronteira entre pré-carregamento e recuperação just-in-time para uma tarefa, usando identificadores leves (caminhos de arquivo, consultas, links) para que o agente descubra o contexto progressivamente, sob demanda
- Projetar uma estratégia de compactação para uma tarefa longa: julgar o que precisa sobreviver (decisões, problemas em aberto, detalhes-chave de implementação) e o que pode ir embora (saídas de ferramenta redundantes), e usar notas estruturadas para estacionar o estado-chave fora da janela de contexto
- Explicar subagentes em termos de economia de contexto: uma janela limpa, um resumo comprimido de apenas uns mil e poucos tokens devolvido, e quando isso compensa gastar várias vezes mais tokens
- Equipar um loop de harness dirigido por stop_reason com rastreio de uso de tokens, compactação disparada por limiar e um caderno estruturado NOTES.md, e levar até o fim uma tarefa grande demais para uma única janela

## Pré-requisitos

- Você concluiu os sete primeiros cursos desta série, ou tem conhecimento equivalente
- Você sabe escrever à mão um loop de agente dirigido por `stop_reason` e entende que o histórico `messages` cresce a cada turno e que os blocos `tool_result` voltam juntos (curso 7)
- Você sabe que a janela de contexto é um recurso finito e que o histórico de conversa só cresce (curso 5)
- Você sabe que um subagente parte de um contexto independente e devolve apenas a sua conclusão (curso 6)
- Você sabe ler e escrever código JavaScript / Node.js básico (a última lição é para acompanhar escrevendo)

## Tempo estimado

Cerca de 3-4 horas, incluindo o exercício prático de cada lição.
