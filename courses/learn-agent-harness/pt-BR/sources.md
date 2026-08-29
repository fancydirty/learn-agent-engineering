# Fontes

As afirmações centrais deste curso se apoiam nas fontes abaixo. As lições as citam com `[^Sn]`; os trechos exatos ficam sob cada entrada.

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

O artigo autoritativo da engenharia da Anthropic sobre o que é um agente, como os agentes diferem dos workflows e como manter o controle — dando a definição de um agente como “ferramentas em um loop”, condições de parada, checkpoints, e os custos e erros que se acumulam com a autonomia. A base central do tema loop-e-controle deste curso.

Citação principal:
> "They are typically just LLMs using tools based on environmental feedback in a loop."
> "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."
> "Agents, on the other hand, are systems where LLMs dynamically direct their own processes and tool usage"
> "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."
> "Agents can then pause for human feedback at checkpoints or when encountering blockers."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "you should consider adding complexity only when it demonstrably improves outcomes."

## S2 — How tool use works — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

Dá o loop canônico de múltiplas rodadas dirigido pelo stop_reason: o modelo só emite requisições estruturadas, o host executa as ferramentas, os resultados voltam, e o loop se repete enquanto o stop_reason ainda for tool_use. A base direta da lição do “loop central”.

Citação principal:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."

## S3 — Effective context engineering for AI agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

Explica que um agente em um loop acumula cada vez mais contexto, enquanto o “attention budget” do modelo é finito e o recall degrada conforme o contexto cresce — que é por que o loop precisa ser restringido e o contexto governado. A base para “por que o loop precisa de limites”.

Citação principal:
> "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"
> "LLMs autonomously using tools in a loop"
> "LLMs have an "attention budget" that they draw on when parsing large volumes of context"
> "Every new token introduced depletes this budget by some amount"
> "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"
> "some models exhibit more gentle degradation than others, this characteristic emerges across all models"
> "These factors create a performance gradient rather than a hard cliff"
> "agents that operate over multiple turns of inference and longer time horizons"
> "context, therefore, must be treated as a finite resource with diminishing marginal returns"

## S4 — LLM06:2025 Excessive Agency — OWASP Gen AI Security Project

URL: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/

- authority: authoritative-guide

Define o risco de excessive agency e nomeia a mitigação explicitamente: aprovação human-in-the-loop para ações de alto impacto. A base, na lição de “intervenção e direcionamento”, para colocar um checkpoint humano antes de operações irreversíveis.

Citação principal:
> "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction. ... Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken. This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

Um roadmap open-source organizado em torno da engenharia de harness, enunciando a tese central — mesmo modelo, harness diferente, resultado completamente diferente — e decompondo o harness em controle de loop, dispatch de ferramentas, gerenciamento de contexto e outros componentes. Usado para apoiar a afirmação de enquadramento de que o harness determina a confiabilidade. Nota: esta fonte é um roadmap comunitário assistido por IA; seus scores de benchmark, cifras de salário e outros números específicos não são citados como fato — apenas suas afirmações de enquadramento são usadas.

Citação principal:
> "Same model, different harness, completely different result."
> "An agent makes its own control-flow decisions inside a loop."
> "the harness is the union of:"
> "loop control. The while-loop driving model→tools→model."
> "tool dispatch. Registry, schema validation, parallel calls, error recovery, retries."

## S6 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

Dá a especificação exata de campos dos blocos de conteúdo tool_use e tool_result, mais a regra de que chamadas paralelas precisam retornar todos os blocos tool_result juntos. Usado na lição 6 para construir requisições e respostas com precisão no loop escrito à mão.

Citação principal:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."
