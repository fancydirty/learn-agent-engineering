# Fuentes

Las afirmaciones clave de este curso se apoyan en las fuentes de abajo. Las lecciones las citan con `[^Sn]`; los extractos exactos están bajo cada entrada. Las citas se mantienen en su inglés original.

## S1 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

La retrospectiva de ingeniería de Anthropic sobre su sistema multiagente de investigación, y la base central de este curso: los agentes tienen estado y los errores se acumulan; no se puede reiniciar desde cero, hay que reanudar desde donde golpeó el error; la fiabilidad sale de combinar la adaptabilidad del modelo con salvaguardas deterministas como la lógica de reintentos y los puntos de control periódicos; y en el momento del despliegue un agente en marcha puede estar en cualquier punto de su proceso.

Cita clave:
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

La documentación oficial de los puntos de control de Claude Code, que muestra la forma completa de punto de control / rebobinar / bifurcar a nivel de producto: un punto de control automático antes de cada prompt del usuario, guardado junto con la conversación, la conversación y el código restaurables por separado, los cambios hechos por comandos bash sin seguimiento, y ningún sustituto del control de versiones. Este curso la usa como punto de referencia de nivel producto, no como la herramienta que se enseña.

Cita clave:
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

El artículo autorizado de Anthropic sobre patrones de agentes. Este curso lo usa para: los agentes que se detienen en los puntos de control a esperar feedback humano, los costos más altos y los errores acumulativos que trae la autonomía, la confianza limitada a lo largo de muchos turnos, y la regla de proporción: añadir complejidad solo cuando mejora los resultados de forma demostrable.

Cita clave:
> "Agents can then pause for human feedback at checkpoints or when encountering blockers."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."
> "you should consider adding complexity only when it demonstrably improves outcomes."

## S4 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

Da la especificación de campos y la regla de emparejamiento de los bloques de contenido tool_use y tool_result: cada tool_use tiene que recibir su tool_result correspondiente, y todos se devuelven juntos. La lección sobre la reanudación depende de esta regla para tratar la llamada colgante que queda cuando un fallo cae entre la ejecución de la herramienta y la escritura en el registro de efectos.

Cita clave:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

Un roadmap comunitario de código abierto organizado en torno a la ingeniería del arnés (escrito con ayuda de IA). Este curso toma solo sus afirmaciones de encuadre: la persistencia es uno de los componentes del arnés, y su trabajo es «checkpoint state every node so you can resume, rewind, fork». Nota: sus umbrales porcentuales, cifras de tokens, puntuaciones de benchmark, salarios y demás datos concretos nunca se citan como hechos.

Cita clave:
> "the harness is the union of:"
> "persistence. Checkpoint state every node so you can resume, rewind, fork."
> "Same model, different harness, completely different result."
