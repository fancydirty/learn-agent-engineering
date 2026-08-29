---
domain: Desenvolvimento de software
tags: [tool calling de agentes, prompt injection, design de permissões, design de interface de ferramentas, Claude API]
lang: pt-BR
outcome: Leia o protocolo de tool calling e projete interfaces de ferramentas que o modelo escolhe certo, preenche certo e não consegue extrapolar.
tier: 1
order: 4
---

# Tool calling de agentes: fazendo agentes agirem de verdade

Este curso percorre o mecanismo completo do tool calling de agentes (tool use / function calling): exatamente quais campos viajam entre a requisição de uma chamada de ferramenta e a sua resposta, os limites de risco dos cinco tipos comuns de ferramenta (ler, escrever, executar, buscar, chamar uma API externa), como escrever uma interface de ferramenta que o modelo escolhe corretamente e também preenche corretamente, e como colocar em prática os níveis de permissão e as defesas contra prompt injection. Ele é para quem já sabe escrever prompts básicos e já usou uma ferramenta como o Claude Code, mas ainda não estudou de forma sistemática o protocolo de tool calling por baixo. Ele não ensina nenhum framework de agente específico (LangChain, AutoGPT) e não cobre treinamento nem fine-tuning de modelos — o foco é a cadeia em si: como o modelo pede uma ação e como a aplicação hospedeira a executa com segurança.

## Conteúdo do curso

1. [De “só conversar” a “agir de verdade”: por que agentes precisam de ferramentas](01-why-agents-need-tools.md)
2. [A ida e volta completa de uma chamada de ferramenta](02-one-tool-call-round-trip.md)
3. [Cinco tipos comuns de ferramenta: ler, escrever, executar, buscar, chamar](03-tool-types.md)
4. [Projetando interfaces de ferramentas: nome, descrição, parâmetros, valor de retorno](04-designing-tool-interfaces.md)
5. [Permissões e segurança: os limites do que um agente pode fazer](05-permissions-and-safety.md)
6. [Mão na massa: conectando três ferramentas a um agente](06-build-a-tool-using-agent.md)

## Objetivos de aprendizado

Ao final deste curso você será capaz de:
- Enunciar a linha do tool calling em que o modelo apenas propõe e a aplicação hospedeira executa, e usá-la para julgar se uma tarefa de fato precisa de ferramentas
- Ler e escrever à mão uma ida e volta completa de tool_use / tool_result, incluindo o retorno em lote de várias chamadas em paralelo
- Classificar os cinco tipos de ferramenta (ler, escrever, executar, buscar, chamar uma API externa) por raio de impacto e identificar a armadilha a que cada um é mais propenso
- Escrever a description da ferramenta, o JSON Schema e o valor de retorno que permitem ao modelo escolher a ferramenta certa, preencher os parâmetros corretamente e se autocorrigir depois de uma falha
- Graduar as operações de ferramenta com allow / ask / deny e reconhecer os riscos da autorização excessiva e da combinação da lethal trifecta
- Construir do zero um agente de tool calling com laço de execução, registro de ferramentas e válvula de segurança

## Pré-requisitos

- Você sabe escrever prompts básicos e entende o formato geral de uma conversa com um LLM
- Você já usou o Claude Code ou uma ferramenta de programação com IA parecida e sabe que ela consegue ler e escrever arquivos e rodar comandos
- Você consegue ler código básico em JavaScript / Node.js (na lição 6 você acompanha pelo código)
- Nenhuma formação em aprendizado de máquina ou treinamento de modelos é necessária

## Tempo estimado

Cerca de 3-4 horas, incluindo o exercício prático de cada lição.
