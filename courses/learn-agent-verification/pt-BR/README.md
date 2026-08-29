---
domain: Desenvolvimento de software
tags: [evals de agente, verificadores, juiz LLM, conjuntos de avaliação, garantia de qualidade]
lang: pt-BR
outcome: Construa uma trilha de eval para a saída do seu agente que separe “parece pronto” de “está pronto”.
tier: 2
order: 10
---

# Verificação e garantia de qualidade: não deixe passar o que só “parece certo”

Este curso é sobre **aceitar a saída de um agente**. Os últimos cursos puseram o seu agente para rodar, e para rodar por muito tempo: o loop do harness do curso 7, a gestão de contexto do curso 8, os checkpoints e a recuperação do curso 9. Mas “terminou a execução” e “acertou” são duas coisas diferentes — agentes são não determinísticos, a mesma tarefa toma dois caminhos diferentes em duas execuções, e a premissa do teste tradicional (“dada a entrada X, siga o caminho Y, produza a saída Z”) simplesmente desaba. Este curso ensina você a fazer uma aceitação sólida sob essa premissa: primeiro separar “parece pronto” de “está pronto”, depois decidir o que verificar (o estado final primeiro, o processo como rede de segurança), com o que verificar (verificadores determinísticos que produzem passa/falha vêm primeiro; LLMs juízes apenas para texto livre) e contra quantos casos verificar (comece com 20 tarefas reais — não espere juntar centenas) e, por fim, construir uma trilha de eval para o seu próprio agente: uma tarefa por loop, um relatório no fim, de modo que uma mudança de prompt apareça como uma mudança de pontuação. É para quem já concluiu os nove primeiros cursos desta série. Este curso não ensina metodologia geral de teste de software (como escrever testes unitários não é coberto), não ensina nenhum framework de eval específico nem API de plataforma, e não cobre a construção de benchmarks do lado do treinamento de modelo; ligar os evals ao CI é mencionado como bom senso de engenharia, mas não é desenvolvido.

## Conteúdo do curso

1. [“Parece pronto” não é “está pronto”](01-looks-done-vs-is-done.md)
2. [O que verificar: estado final primeiro, processo como rede de segurança](02-what-to-verify.md)
3. [Verificadores determinísticos: só valem verificações que produzem passa/falha](03-deterministic-checks.md)
4. [LLM como juiz: rubricas, formatos e o que não deixar ele julgar](04-llm-as-judge.md)
5. [Conjuntos de avaliação: comece com 20 tarefas reais](05-eval-sets.md)
6. [Mão na massa: construa uma trilha de eval para o seu agente](06-build-eval-harness.md)

## Objetivos de aprendizado

Ao final deste curso você será capaz de:
- Explicar como o fato de os agentes serem não determinísticos quebra a premissa de caminho do teste tradicional, e por que “parece pronto” vira o único sinal quando não há uma verificação executável
- Definir critérios de sucesso mensuráveis para uma tarefa de agente e decidir entre verificar o estado final e definir checkpoints intermediários nos pontos-chave — em vez de conferir a trajetória passo a passo
- Escolher verificadores na ordem mais rápido–mais confiável–mais escalável: primeiro as verificações determinísticas (correspondência exata, comparação por script, suítes de testes), e reconhecer armadilhas como um verificador rígido demais reprovando uma saída correta
- Projetar um juiz LLM para saída em texto livre: uma rubrica multidimensional, um formato de saída restrito, raciocinar antes de pontuar — e explicar por que o modelo que fez o trabalho não deveria dar a nota, e por que um juiz instruído a achar problemas sempre acha algum
- Construir um conjunto de avaliação a partir de cerca de 20 tarefas reais: espelhar a distribuição real, acrescentar casos extremos, favorecer a quantidade sobre o polimento de cada item, reservar um conjunto held-out contra o overfitting — e explicar por que um punhado de casos iniciais basta quando o tamanho de efeito é grande
- Construir uma trilha de eval repetível para o seu próprio agente: um loop de harness por tarefa, pontuação em camadas com verificadores determinísticos mais um juiz LLM, métricas de duração e de número de chamadas registradas além da taxa de aprovação — e usá-la para medir o impacto real de uma mudança de prompt

## Pré-requisitos

- Você concluiu os nove primeiros cursos desta série, ou tem conhecimento equivalente
- Você sabe escrever à mão um loop de harness dirigido por `stop_reason` e entende o emparelhamento `tool_use`/`tool_result` (curso 7)
- Você sabe como os checkpoints e o livro-razão de efeitos chegam ao disco (curso 9; a trilha de eval deste curso reaproveita o esqueleto do loop do harness)
- Você sabe ler e escrever código JavaScript / Node.js básico (a lição 6 é para acompanhar escrevendo)

## Tempo estimado

Cerca de 3-4 horas, incluindo o exercício prático de cada lição.
