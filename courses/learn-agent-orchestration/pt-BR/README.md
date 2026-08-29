---
domain: Desenvolvimento de software
tags: [orquestração, padrões de fluxo de trabalho, paralelização, orquestrador-workers, sistemas multiagente]
lang: pt-BR
outcome: Eleve seu harness de laço único a um script de orquestração com roteamento, fan-out e um laço de revisão.
tier: 3
order: 12
---

# De loops a grafos: engenharia de orquestração para sistemas de agentes

Este é o encerramento da série, e ele é sobre **a camada de engenharia acima de um laço só**. O harness que você escreveu à mão no curso 7 é um laço — na formulação oficial, agentes “are typically just LLMs using tools based on environmental feedback in a loop.” Mas, passado certo tamanho de tarefa, um laço deixa de bastar: o que há para processar não cabe em uma janela de contexto, o mesmo passo precisa se repetir em dezenas de itens, ou o trabalho exige mais agentes do que uma conversa consegue coordenar. Este curso ensina você a retomar o controle de fluxo das mãos do modelo e trazê-lo para o código: primeiro traça a linha arquitetural entre um fluxo de trabalho (LLMs e ferramentas orquestrados por caminhos de código predefinidos) e um agente (o modelo dirigindo o próprio processo), tendo “quem detém o plano” como eixo; depois escreve em código, um a um, os padrões de fluxo de trabalho comprovados em produção — encadeamento e roteamento, paralelização (seccionamento e votação), orquestrador-workers, o laço evaluator-optimizer; encara com honestidade o balanço de um sistema real em produção: a melhora de 90,2% (no eval interno de pesquisa deles, com um lead Opus 4 e subagentes Sonnet 4, mais forte em consultas de amplitude) e o custo de 15× em tokens são dois lados da mesma moeda, e o gargalo da execução síncrona, a explosão da complexidade de coordenação e os quatro elementos de um despacho são todos buracos em que eles caíram; e, por fim, compõe os padrões — a essa composição este curso chama de “grafo”, um desenho nosso e não vocabulário oficial — e eleva na prática o harness de laço único do curso 7 a um script de orquestração determinístico: roteamento, fan-out, merge, laço de revisão. O laço continua sendo o mesmo laço; o que mudou de lugar foi o plano, que agora mora no código. É para quem já concluiu os onze primeiros cursos desta série. Este curso não ensina nenhum framework de orquestração de terceiros (LangGraph e afins nem são mencionados), não repete a divisão de trabalho e a comunicação entre múltiplos agentes (curso 6) e não repete conceitos e diagramas de fluxo de trabalho (curso 2) — o que é deste curso é **como o controle de fluxo vira um pedaço de código que você pode ler, rodar e rodar de novo**.

## Conteúdo do curso

1. [Quando um loop só não basta](01-when-one-loop-isnt-enough.md)
2. [Encadeie, roteie: encadeamento e roteamento](02-chaining-and-routing.md)
3. [Paralelização: seccionamento e votação](03-parallelization.md)
4. [Orquestrador-workers: tornar a própria decomposição dinâmica](04-orchestrator-workers.md)
5. [O laço de revisão, e compor padrões em um grafo](05-evaluator-and-graphs.md)
6. [Mão na massa: elevando seu harness a um pequeno grafo](06-build-a-graph.md)

## Objetivos de aprendizado

Ao final deste curso você será capaz de:
- Enunciar a distinção arquitetural entre fluxo de trabalho e agente (caminhos de código predefinidos vs. o modelo dirigindo o próprio processo), situar um sistema no espectro de determinismo perguntando quem detém o plano, e reconhecer tanto os gatilhos reais do “um laço não basta” quanto os casos que não merecem orquestração
- Escrever encadeamento e roteamento como código: cada estágio um laço de harness completo, portões programáticos entre os estágios, a classificação despachando para prompts especializados — e saber o que isso compra e o que isso custa
- Implementar as duas variantes da paralelização (seccionamento e votação), agregar os resultados no código, explicar os ganhos do fan-out (velocidade, perspectivas independentes, capacidade de contexto em paralelo) e seus custos (os resultados voltam para o orquestrador; todo produto real põe teto na concorrência), e controlar o custo do merge passando referências, não payloads
- Implementar orquestrador-workers e enunciar sua diferença central em relação à paralelização (as subtarefas não são predefinidas — quem as decide é o orquestrador, a partir da entrada); equipar os despachos com os quatro elementos (objetivo, formato de saída, orientação sobre ferramentas, fronteiras da tarefa), dimensionar o orçamento pela complexidade da tarefa, e encarar o gargalo síncrono e os três custos de partir para o assíncrono
- Implementar o laço evaluator-optimizer (checar, corrigir, checar de novo — até passar ou parar de melhorar) com os dois sinais que dizem se vale a pena construí-lo; compor os cinco padrões naquilo que este curso chama de “grafo” — sabendo que é uma metáfora de engenharia própria do curso, ancorada na afirmação de primeira mão de que o próprio script do fluxo de trabalho guarda os laços, as ramificações e os resultados intermediários
- Na prática, elevar o harness de laço único do curso 7 a um script de orquestração determinístico — rotear → distribuir para três workers → fazer o merge → laço de revisão → relatório — com o estado em variáveis do script e um rastro de execução passo a passo, e conferi-lo linha a linha contra as promessas feitas pelas lições 3, 4 e 5 e pelos cursos 7, 9, 10 e 11

## Pré-requisitos

- Você concluiu os onze primeiros cursos desta série, ou tem conhecimento equivalente
- Você sabe escrever à mão um laço de harness dirigido por `stop_reason` (curso 7; cada nó do “grafo” deste curso é um deles)
- Você conhece os princípios de divisão de trabalho entre múltiplos agentes e os despachos (curso 6), a verificação baseada em eval (curso 10) e a observabilidade (curso 11)
- Você sabe ler e escrever código JavaScript / Node.js básico (a lição 6 é para acompanhar escrevendo)

## Tempo estimado

Cerca de 3-4 horas, incluindo o exercício prático de cada lição.
