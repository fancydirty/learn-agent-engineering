# Fontes

## S1 — How we built our multi-agent research system (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Um post técnico em primeira mão da equipe de engenharia da Anthropic detalhando a arquitetura do Claude Research, um sistema multiagente de nível de produção: a divisão de trabalho entre orquestrador e subagentes, os princípios de design de prompt, os modos de falha e os métodos de avaliação. As afirmações deste curso sobre “o que é um sistema multiagente”, “o que um prompt de subagente deve conter”, a regra de escalonamento de esforço, a integração de citações/resultados, o custo em tokens e quais tarefas se prestam à paralelização vêm todas deste artigo.

Citação principal:

> "A multi-agent system consists of multiple agents (LLMs autonomously using tools in a loop) working together."

> "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries. Without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information."

> "spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, and distracting each other with excessive updates"

> "Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each, and complex research might use more than 10 subagents with clearly divided responsibilities."

> "a CitationAgent, which processes the documents and research report to identify specific locations for citations. This ensures all claims are properly attributed to their sources."

> "We used an LLM judge that evaluated each output against criteria in a rubric: factual accuracy (do claims match sources?), citation accuracy (do the cited sources match the claims?), completeness (are all requested aspects covered?), source quality (did it use primary sources over lower-quality secondary sources?), and tool efficiency (did it use the right tools a reasonable number of times?)."

> "We started by allowing the lead agent to give simple, short instructions like 'research the semiconductor shortage,' but found these instructions often were vague enough that subagents misinterpreted the task or performed the exact same searches as other agents."

> "In our data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats. For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance."

> "Subagent output to a filesystem to minimize the 'game of telephone.' Direct subagent outputs can bypass the main coordinator for certain types of results, improving both fidelity and performance."

> "most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time. We've found that multi-agent systems excel at valuable tasks that involve heavy parallelization, information that exceeds single context windows, and interfacing with numerous complex tools."

> "the lead agent spins up 3-5 subagents in parallel rather than serially"

> "These changes cut research time by up to 90% for complex queries"

> "Subagents facilitate compression by operating in parallel with their own context windows ... Each subagent also provides a separation of concerns—distinct tools, prompts, and exploration trajectories—which reduces path dependency"

## S2 — Building effective agents (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

O guia em primeira mão da Anthropic sobre quando usar um workflow, quando usar um agente e como definir cada padrão de orquestração — cobrindo as definições oficiais de prompt chaining, orchestrator-workers e evaluator-optimizer (produtor-revisor), mais o conselho central de começar simples e só acrescentar complexidade quando ela comprovadamente valer a pena. As afirmações deste curso sobre a taxonomia dos padrões de colaboração e “quando não usar múltiplos agentes” vêm deste artigo.

Citação principal:

> "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."

> "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."

> "Prompt chaining decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one."

> "one LLM call generates a response while another provides evaluation and feedback in a loop."

> "Reviewing a piece of code for vulnerabilities, where several different prompts review and flag the code if they find a problem."

> "you should consider adding complexity only when it demonstrably improves outcomes."

## S3 — Create custom subagents (Claude Code Docs)

URL: https://code.claude.com/docs/en/sub-agents

- authority: official-docs

A documentação oficial do Claude Code explica o mecanismo de isolamento de contexto de um subagente, os campos obrigatórios do frontmatter, como a delegação é acionada e como os resultados são retornados. As afirmações deste curso sobre “por que um subagente não consegue ver o seu histórico de conversa”, “a delegação é acionada pelo campo description” e “só a conclusão é retornada” vêm todas deste documento.

Citação principal:

> "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read. Claude composes a delegation message that summarizes the task, and the subagent works from there."

> "When subagents complete, their results return to your main conversation. Running many subagents that each return detailed results can consume significant context."

> "The following fields can be used in the YAML frontmatter. Only name and description are required."

> "Claude automatically delegates tasks based on the task description in your request, the description field in subagent configurations, and current context."

> "Each subagent completes its task and returns results to Claude, which then passes relevant context to the next subagent."

> "A fork is a subagent that inherits the entire conversation so far instead of starting fresh... The fork's own tool calls still stay out of your conversation and only its final result comes back, so your main context window stays clean."

## S4 — Agents (OpenAI Agents SDK)

URL: https://openai.github.io/openai-agents-python/agents/

- authority: official-docs

A seção sobre padrões de orquestração multiagente na documentação do OpenAI Agents SDK, definindo os padrões Manager (agents-as-tools) e Handoffs. A seção de “padrões de colaboração” deste curso a usa para contrastar outra divisão de trabalho comum além do orquestrador-worker.

Citação principal:

> "Manager (agents as tools): A central manager/orchestrator invokes specialized sub‑agents as tools and retains control of the conversation."

> "Handoffs: Peer agents hand off control to a specialized agent that takes over the conversation. This is decentralized."

## S5 — Handoffs (OpenAI Agents SDK)

URL: https://openai.github.io/openai-agents-python/handoffs/

- authority: official-docs

A explicação detalhada do mecanismo de Handoffs na documentação do OpenAI Agents SDK, cobrindo como um novo agente assume a conversa depois de um handoff e o limite de que um handoff permanece dentro de uma única execução. Este curso a usa para explicar a diferença essencial na passagem de contexto entre a colaboração no estilo handoff e no estilo orquestrador-worker.

Citação principal:

> "Handoffs stay within a single run."

> "When a handoff occurs, it's as though the new agent takes over the conversation, and gets to see the entire previous conversation history."

## S6 — Best practices for Claude Code (Claude Code Docs)

URL: https://code.claude.com/docs/en/best-practices

- authority: official-docs

O documento oficial de boas práticas do Claude Code, cuja seção sobre a “trust-then-verify gap” nomeia diretamente o modo de falha em que a saída de um modelo parece plausível mas não é necessariamente correta, e dá a resposta: verifique você mesmo, e se não conseguir verificar, não confie. A afirmação central da seção “um subagente que diz ter terminado não pode ser confiado” deste curso vem deste documento.

Citação principal:

> "The trust-then-verify gap. Claude produces a plausible-looking implementation that doesn't handle edge cases. Fix: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."

> "Claude stops when the work looks done. Without a check it can run, \"looks done\" is the only signal available, and you become the verification loop: every mistake waits for you to notice it."

> "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result."

## S7 — Effective context engineering for AI agents (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

O guia em primeira mão da Anthropic sobre context engineering, que dá o relato direto do “context rot” e do “attention budget”: quanto mais tokens na janela de contexto, menor a capacidade do modelo de recuperar informação dela com precisão, e cada novo token esgota um orçamento finito de atenção. Ele também esclarece que essa degradação é um gradiente, não um precipício. As afirmações das seções “poluição de contexto” e “diluição de atenção” deste curso se apoiam neste artigo.

Citação principal:

> "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"

> "LLMs have an 'attention budget' that they draw on when parsing large volumes of context. ... Every new token introduced depletes this budget by some amount"

> "these factors create a performance gradient rather than a hard cliff"

## S8 — Using the Messages API (Claude API)

URL: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

- authority: official-docs

A documentação oficial afirma sem rodeios que a Messages API é stateless: cada requisição precisa carregar o histórico completo da conversa, e a API não guarda estado algum entre requisições. Esta é a premissa de implementação da lição 6 para “cada chamada precisa escrever a tarefa e a informação da rodada anterior no prompt verbatim”.

Citação principal:

> "The Messages API is stateless, which means that you always send the full conversational history to the API."

## S9 — Structured outputs (Claude API)

URL: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

- authority: official-docs

A documentação oficial explica que, sem structured outputs, mesmo com prompts cuidadosos, o modelo ainda pode produzir JSON malformado (erros de sintaxe, campos faltando, tipos inconsistentes); os structured outputs usam amostragem restrita para garantir que a resposta siga estritamente o schema. Esta é a premissa da seção da lição 6 “pede-se ao revisor retornar apenas JSON, mas ainda é preciso um parsing defensivo”.

Citação principal:

> "Structured outputs constrain Claude's responses to follow a specific schema, ensuring valid, parseable output for downstream processing."

> "Without structured outputs, Claude can generate malformed JSON responses or invalid tool inputs that break your applications. Even with careful prompting, you may encounter: Parsing errors from invalid JSON syntax"
