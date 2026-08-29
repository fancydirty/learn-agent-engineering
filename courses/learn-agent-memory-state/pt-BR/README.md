---
domain: Desenvolvimento de software
tags: [memória de agente, janela de contexto, compactação por resumo, memória persistente, prompt injection]
lang: pt-BR
outcome: Distinga memória de estado e dê a um agente uma memória que sobrevive entre sessões sem ser envenenada.
tier: 2
order: 5
---

# Memória e Estado de Agente

Um agente parece “lembrar” o que você discutiu dez minutos atrás, mas essa memória não vive de fato na cabeça do modelo — ela foi apenas enfiada, verbatim, na janela de contexto de cada requisição. Este curso desmonta essa ilusão: por que a janela de contexto equivale a toda a memória de um agente, por que o histórico de conversa só cresce, quando você deveria escrever memória em um arquivo, como um agente lembra em que ponto uma tarefa está, e quais riscos de segurança a própria memória introduz. É para quem já concluiu os quatro primeiros cursos desta série e quer que um agente lembre informações entre sessões. O foco é a cadeia que vai da janela de contexto até a memória persistente em nível de arquivo — não cobre construir um banco de dados vetorial ou um sistema de recuperação RAG, nem o treinamento de memória no nível do modelo. Ao final, você mesmo vai conectar a um agente uma camada de memória persistente que se pode ler, escrever e comprimir.

## Conteúdo do curso

1. [A janela de contexto é toda a memória que um agente tem](01-context-window-is-memory.md)
2. [Gerenciando o histórico da conversa: acrescentar, truncar, resumir](02-managing-conversation-history.md)
3. [Memória externa: arquivos e recuperação](03-external-memory-files.md)
4. [Estado estruturado: como um agente lembra em que ponto uma tarefa está](04-structured-task-state.md)
5. [Os limites e a segurança da memória](05-memory-boundaries-and-safety.md)
6. [Mão na massa: adicionando uma camada de memória persistente a um agente](06-build-a-memory-layer.md)

## Objetivos de aprendizado

Ao final deste curso você será capaz de:

- Explicar por que “o agente tem memória” é uma ilusão e dizer exatamente o que a janela de contexto de fato guarda
- Nomear três estratégias para um histórico de conversa que cresceu demais e julgar o que cada uma descarta e mantém
- Projetar um esquema de memória externa baseada em arquivos, sabendo o que escrever nele e quando buscá-lo de volta
- Usar estado estruturado (listas de tarefas, checkpoints) para deixar um agente retomar de uma interrupção em vez de recomeçar
- Reconhecer os caminhos de ataque do envenenamento de memória e nomear pelo menos duas defesas específicas
- Conectar você mesmo ferramentas de leitura/escrita e lógica de compactação a um agente, construindo uma camada de memória persistente executável

## Pré-requisitos

- Você concluiu os quatro primeiros cursos desta série e sabe escrever prompts estruturados
- Você entende o protocolo de ida e volta da chamada de ferramentas (tool_use / tool_result)
- Você sabe ler JavaScript básico (variáveis, funções, async/await, métodos de array)
- Você tem um ambiente local capaz de rodar scripts Node.js

## Tempo estimado

Cerca de 3-4 horas, incluindo o exercício prático de cada lição.
