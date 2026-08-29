---
domain: Desenvolvimento de software
tags: [harness de agente, controle de laço, condições de parada, human-in-the-loop, confiabilidade de agente]
lang: pt-BR
outcome: Escreva à mão um laço de agente dirigido pelo stop_reason e equipe-o com quatro válvulas de parada.
tier: 2
order: 7
---

# Fundamentos do Harness de Agente: Laços e Controle

Este curso é sobre o **harness** do agente — a camada de código de controle fora do modelo que de fato faz um agente rodar: ela dirige o laço “modelo → executar ferramentas → devolver resultados → perguntar de novo”, decide quando esse laço para, o segura quando ele foge do controle, e deixa um humano interromper e redirecionar no meio do caminho. O curso se concentra no laço de execução de um único agente e termina com você escrevendo à mão um harness mínimo com condições de parada, um teto de orçamento, detecção de giro em falso e uma válvula de aprovação humana. É para quem já concluiu os seis primeiros cursos desta série — você precisa entender uma ida e volta de chamada de ferramentas (`stop_reason: "tool_use"` / `tool_result`), memória de agente e a janela de contexto, e o básico da divisão de trabalho multiagente. Este curso não é um tutorial de API de nenhum framework em particular (nada de especificidades do Claude Agent SDK ou do LangChain), não cobre orquestração multiagente (esse é outro curso desta série) e não cobre avaliação e regressão (guardado para o curso de verificação); o foco é uma camada — como o próprio laço é mantido sob controle.

## Conteúdo do curso

1. [O que é um harness: o código de controle ao redor do modelo](01-what-is-a-harness.md)
2. [O loop central: de uma ida e volta à operação contínua](02-the-core-loop.md)
3. [Condições de parada: quando um agente deve desistir](03-stop-conditions.md)
4. [Descontrole e fallback: loops mortos, giro em falso, esgotamento de orçamento](04-loop-failure-modes.md)
5. [Intervenção e direção: interromper, redirecionar, humano no loop](05-intervention-and-steering.md)
6. [Mão na massa: escrevendo à mão um harness de agente com controles](06-build-a-harness.md)

## Objetivos de aprendizado

Ao final deste curso você será capaz de:
- Traçar a linha entre o harness e o modelo e explicar por que o mesmo modelo com um harness diferente pode produzir resultados radicalmente diferentes
- Escrever à mão o laço central que dirige um agente e explicar como o `stop_reason` decide se o laço continua ou para
- Projetar um conjunto explícito de condições de parada para um agente em vez de depender de o modelo dizer “terminei”
- Reconhecer os modos de descontrole — loops mortos, giro em falso, esgotamento de orçamento, erros que se acumulam — e equipar o laço com um fallback para cada um
- Julgar onde no laço um checkpoint humano deve ficar, mantendo operações irreversíveis fora da execução automática
- Construir, do zero, um harness mínimo com condições de parada, um teto de rodadas, um teto de orçamento, detecção de giro em falso e uma válvula de aprovação

## Pré-requisitos

- Você concluiu os seis primeiros cursos desta série, ou tem o equivalente
- Você entende uma ida e volta completa de chamada de ferramentas: o modelo retorna `stop_reason: "tool_use"`, o host executa a ferramenta, e o `tool_result` é reinserido na conversa
- Você sabe que a janela de contexto é um recurso finito e que o histórico continua se acumulando (curso 5 desta série, “Memória e Estado de Agente”)
- Você sabe ler código básico de JavaScript / Node.js (na lição 6 você escreve junto)
- Nenhum conhecimento de machine learning ou de treinamento de modelos é necessário

## Tempo estimado

Cerca de 3-4 horas, incluindo o exercício prático de cada lição.
