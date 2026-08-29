# Fontes

As principais afirmações deste curso se apoiam nas fontes abaixo. As lições as citam com `[^Sn]`; os trechos exatos ficam sob cada entrada.

## S1 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

A retrospectiva de engenharia da Anthropic sobre seu sistema de pesquisa multiagente, e a base central deste curso: agentes têm estado e os erros se acumulam; não dá para recomeçar do zero — é preciso retomar do ponto em que o erro aconteceu; a confiabilidade vem de juntar a adaptabilidade do modelo a salvaguardas determinísticas, como lógica de retry e checkpoints regulares; e, na hora de fazer deploy, um agente em execução pode estar em qualquer ponto do seu processo.

Citação principal:
> "Agents can run for long periods of time, maintaining state across many tool calls."
> "Agents are stateful and errors compound."
> "Without effective mitigations, minor system failures can be catastrophic for agents."
> "When errors occur, we can't just restart from the beginning: restarts are expensive and frustrating for users."
> "Instead, we built systems that can resume from where the agent was when the errors occurred."
> "This means we need to durably execute code and handle errors along the way."
> "the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints"
> "letting the agent know when a tool is failing and letting it adapt works surprisingly well"
> "we use rainbow deployments to avoid disrupting running agents, by gradually shifting traffic from old to new versions"
> "whenever we deploy updates, agents might be anywhere in their process."
> "agents summarize completed work phases and store essential information in external memory before proceeding to new tasks"

## S2 — Checkpointing — Claude Code Docs

URL: https://code.claude.com/docs/en/checkpointing

- authority: official-docs

A documentação oficial do checkpointing do Claude Code, que mostra a forma completa e de nível de produto do checkpoint/rewind/fork: um checkpoint automático antes de cada prompt da pessoa usuária, salvo junto com a conversa, conversa e código restauráveis separadamente, mudanças feitas por bash não rastreadas, e nenhum substituto para o controle de versão. Este curso a usa como ponto de referência de nível de produto, não como a ferramenta que está sendo ensinada.

Citação principal:
> "checkpointing automatically captures the state of your code before each user prompt."
> "Every user prompt creates a new checkpoint"
> "Claude Code saves checkpoints with the conversation, so you can still run /rewind after you resume a session"
> "Restore code and conversation: revert both code and conversation to that point"
> "Restore conversation: rewind to that message while keeping current code"
> "Restore code: revert file changes while keeping the conversation"
> "Exploring alternatives: try different implementation approaches without losing your starting point"
> "Recovering from mistakes: quickly undo changes that introduced bugs or broke functionality"
> "Checkpointing does not track files modified by bash commands."
> "Only direct file edits made through Claude's file editing tools are tracked."
> "Checkpoints are designed for quick, session-level recovery."
> "continue using version control, such as Git, for commits, branches, and long-term history."
> "To branch off and try a different approach while preserving the original session intact, use /branch or claude --continue --fork-session"

## S3 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

O artigo autoritativo da Anthropic sobre padrões de agente. Este curso o usa para: agentes que pausam em checkpoints à espera de feedback humano, os custos mais altos e os erros que se acumulam com a autonomia, a confiança limitada ao longo de muitos turnos, e a regra de proporção — acrescentar complexidade só quando isso melhora os resultados de forma demonstrável.

Citação principal:
> "Agents can then pause for human feedback at checkpoints or when encountering blockers."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."
> "you should consider adding complexity only when it demonstrably improves outcomes."

## S4 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

Dá a especificação dos campos e a regra de emparelhamento dos blocos de conteúdo tool_use e tool_result: todo tool_use precisa receber um tool_result correspondente, todos devolvidos juntos. A lição sobre retomada depende dessa regra para lidar com a chamada órfã que sobra quando uma queda acontece entre a execução da ferramenta e a gravação no livro-razão.

Citação principal:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

Um roadmap comunitário de código aberto organizado em torno da engenharia de harness (escrito com auxílio de IA). Este curso toma dele apenas as afirmações de enquadramento: a persistência como um dos componentes do harness, e o trabalho dela — “checkpoint state every node so you can resume, rewind, fork.” Observação: seus limiares percentuais, números de tokens, notas de benchmark, valores de salário e outros dados específicos nunca são citados como fato.

Citação principal:
> "the harness is the union of:"
> "persistence. Checkpoint state every node so you can resume, rewind, fork."
> "Same model, different harness, completely different result."
