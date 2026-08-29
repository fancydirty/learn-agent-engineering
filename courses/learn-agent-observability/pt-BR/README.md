---
domain: Desenvolvimento de software
tags: [observabilidade, depuração, tracing, logs estruturados, métricas]
lang: pt-BR
outcome: Instrumente seu agente com logs, métricas e uma árvore de trace, para que uma falha seja rastreada até a mensagem exata.
tier: 3
order: 11
---

# Observabilidade e depuração: enxergando cada passo do seu agente

Este curso é sobre **enxergar o que o seu agente de fato fez**. O curso anterior (o décimo desta série) resolveu o “passou ou não passou” — pontuação de estado final, verificadores, conjuntos de avaliação. Mas um eval só te entrega um passou/falhou. Quando alguém relata que “ele não acha uma informação que está bem ali”, você continua sem conseguir dizer por quê: a consulta de busca estava mal formulada? As fontes foram mal escolhidas? A ferramenta simplesmente deu erro? De fora, essas causas são idênticas. Pior ainda: agentes são não determinísticos entre execuções — o mesmo prompt toma dois caminhos diferentes em duas execuções, então a intuição tradicional de depuração, “reproduza e depure”, para de funcionar. Este curso ensina você a transformar o “não sei dizer” em “dá para consultar”: primeiro estabelece que a transcrição bruta (as idas e voltas completas de chamadas de ferramenta e respostas) é a evidência de primeira mão e que o autorrelato do agente não conta; depois instrumenta o harness com logs estruturados e métricas (duração, número de chamadas, tokens, erros — desta vez não para dar nota, e sim para acompanhar a produção); depois costura os registros espalhados em uma árvore de trace com IDs de correlação, de modo que cada requisição ao modelo e cada execução de ferramenta disparadas por um mesmo prompt se leiam como um todo; depois ensina a colocar sondas nas comportas do loop com hooks e a percorrer um fluxo de depuração feito para o não determinismo; e, por fim, liga uma camada completa de observabilidade ao harness do curso 7 e rastreia um sintoma de “não sei dizer” até o passo exato que deu errado. É para quem já concluiu os dez primeiros cursos desta série. Este curso não ensina nenhuma plataforma específica de observabilidade (Datadog, Grafana e afins só aparecem onde as citações os nomeiam), não cobre limiares de alerta nem desenho de SLO (o material de primeira mão não traz números) e não repete os métodos de eval do curso 10 — lá as métricas dão nota, aqui as mesmas métricas diagnosticam.

## Conteúdo do curso

1. [Por que você não consegue dizer o que deu errado](01-why-you-cant-see-why.md)
2. [Evidência de primeira mão: a transcrição bruta, não o autorrelato](02-transcripts-as-evidence.md)
3. [Logs estruturados e métricas: transformando cada etapa em dado](03-logs-and-metrics.md)
4. [Tracing: costurando uma execução em uma árvore](04-tracing.md)
5. [Sondas nas comportas: hooks e um fluxo de depuração](05-hooks-and-debugging.md)
6. [Mão na massa: instalando uma camada de observabilidade no harness](06-build-observability.md)

## Objetivos de aprendizado

Ao final deste curso você será capaz de:
- Explicar como o não determinismo quebra o “reproduza e depure”: o mesmo prompt toma dois caminhos diferentes e igualmente legítimos, e um sintoma se assenta sobre várias causas que, de fora, parecem idênticas
- Usar as transcrições brutas como evidência de primeira mão: ler as idas e voltas completas de chamadas de ferramenta e respostas, flagrar comportamentos que a cadeia de raciocínio e o autorrelato do agente nunca mencionam, e explicar por que o autorrelato não merece confiança
- Desenhar logs estruturados e métricas para o seu próprio harness: um registro por requisição ao modelo e por chamada de ferramenta, cobrindo duração, número de chamadas, tokens e erros — e mapear padrões de métrica para correções concretas usando as leituras diagnósticas oficiais
- Costurar registros espalhados em uma árvore de trace com IDs de correlação: tudo o que um prompt disparou se lê como um todo, os subagentes se aninham no trace do agente pai — e saber de que maneiras o próprio pipeline de telemetria mente para você (falhas silenciosas, perda de lote)
- Colocar sondas nas comportas do ciclo de vida do loop: separar os pontos de observação por sessão, por turno e por chamada de ferramenta, capturar registros completos de chamada com PostToolUse, e localizar problemas seguindo o fluxo de filtrar por prompt id → achar a primeira divergência → repetir passo a passo com entradas idênticas
- Instrumentar o harness do curso 7 com uma camada de observabilidade completa (logs estruturados em JSONL + impressão da árvore de trace + resumo de métricas) e percorrer uma prática de depuração inteira: sintoma → filtro → localização → correção → comparação da nova execução (execuções reais retomam do ponto de falha)

## Pré-requisitos

- Você concluiu os dez primeiros cursos desta série, ou tem conhecimento equivalente
- Você sabe escrever à mão um loop de harness dirigido por `stop_reason` e entende o emparelhamento `tool_use`/`tool_result` (curso 7)
- Você conhece a trilha de avaliação e as métricas além da taxa de aprovação (curso 10; este curso move as mesmas métricas da pontuação para o diagnóstico)
- Você sabe ler e escrever código JavaScript / Node.js básico (a lição 6 é para acompanhar escrevendo)

## Tempo estimado

Cerca de 3-4 horas, incluindo o exercício prático de cada lição.
