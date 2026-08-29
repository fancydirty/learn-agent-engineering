---
domain: Desenvolvimento de software
tags: [colaboração multiagente, orquestração, design de prompt, subagentes, Claude API]
lang: pt-BR
outcome: Divida o trabalho entre vários agentes sem caos: divisão de trabalho, prompts de delegação, produtor-revisor.
tier: 2
order: 6
---

# Colaboração Multiagente

Este curso é sobre quando dividir uma tarefa entre vários agentes, e como dividi-la. Você vai aprender a arquitetura orquestrador-worker, como escrever prompts de delegação que um subagente entenda por conta própria, as situações em que cada padrão comum de colaboração (pipeline, revisão, votação) se encaixa, e o modo de falha específico de sistemas multiagente — não se pode acreditar na palavra de um subagente que diz estar “pronto”; você precisa verificar você mesmo. É para quem já concluiu os cinco primeiros cursos desta série, sabe escrever prompts básicos e entende o protocolo de chamada de ferramentas, mas ainda não estudou colaboração multiagente de forma sistemática. Este curso não cobre o código-fonte de frameworks multiagente, algoritmos de consenso de sistemas distribuídos, nem como construir uma plataforma de orquestração de propósito geral do zero; a lição 6 usa a Claude API para escrever um pipeline de dois agentes (produtor-revisor) executável como exercício prático, mas o objetivo é entender os próprios padrões de colaboração, não entregar um framework pronto para produção.

## Conteúdo do curso

1. [Por que múltiplos agentes: os limites de um único contexto](./01-why-multiple-agents.md)
2. [Orquestrador e subagentes: distribuir e agregar](./02-orchestrator-and-subagents.md)
3. [Escrevendo prompts para delegação](./03-writing-prompts-for-delegation.md)
4. [Padrões de colaboração: pipeline, revisão, votação](./04-collaboration-patterns.md)
5. [Falha e coordenação](./05-failure-and-coordination.md)
6. [Mão na massa: construindo um pipeline de revisão de dois agentes](./06-build-a-review-pipeline.md)

## Objetivos de aprendizado

- Julgar se uma tarefa vale a pena dividir entre múltiplos agentes e reconhecer o caso em que o custo de coordenação supera o benefício
- Explicar o valor do isolamento de contexto na arquitetura orquestrador-subagente e por que um subagente deve retornar apenas a sua conclusão
- Escrever prompts de delegação autossuficientes para um subagente, com escopo claro e requisito de formato de saída
- Distinguir os padrões pipeline, produtor-revisor e votação multiperspectiva e julgar onde cada um se encaixa
- Reconhecer as falhas típicas da colaboração multiagente — um “pronto” não verificável, trabalho duplicado, resultados conflitantes — e saber como responder
- Escrever um pipeline produtor-revisor de dois agentes executável com a Claude API

## Pré-requisitos

- Você concluiu os cinco primeiros cursos desta série, sabe escrever prompts básicos, entende o protocolo de chamada de ferramentas, conhece memória e estado de agente e sabe ler JavaScript básico
- Você tem um ambiente Node.js e consegue rodar scripts em um terminal
- Você tem uma chave de API do Claude funcionando (necessária para o exercício prático da lição 6)

## Tempo estimado

Cerca de 4-5 horas, incluindo o exercício prático de cada lição.
