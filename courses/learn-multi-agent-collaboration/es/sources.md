# Fuentes

Las citas de las fuentes se mantienen en su idioma original, el inglés.

## S1 — How we built our multi-agent research system (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Una entrada de blog técnica de primera mano del equipo de ingeniería de Anthropic que detalla la arquitectura de Claude Research, un sistema multiagente de nivel productivo: la división del trabajo entre orquestador y subagentes, los principios de diseño de prompts, los modos de fallo y los métodos de evaluación. De este artículo provienen las afirmaciones del curso sobre «qué es un sistema multiagente», «qué debe contener el prompt de un subagente», la regla de escalar el esfuerzo, la integración de citas y resultados, el coste en tokens y qué tareas se prestan a la paralelización.

Cita clave:

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

La guía de primera mano de Anthropic sobre cuándo usar un workflow, cuándo usar un agente y cómo definir cada patrón de orquestación: cubre las definiciones oficiales de prompt chaining, orchestrator-workers y evaluator-optimizer (producer-reviewer), más el consejo central de empezar simple y añadir complejidad solo cuando compensa de forma demostrable. De este artículo provienen las afirmaciones del curso sobre la taxonomía de patrones de colaboración y «cuándo no usar varios agentes».

Cita clave:

> "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."

> "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."

> "Prompt chaining decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one."

> "one LLM call generates a response while another provides evaluation and feedback in a loop."

> "Reviewing a piece of code for vulnerabilities, where several different prompts review and flag the code if they find a problem."

> "you should consider adding complexity only when it demonstrably improves outcomes."

## S3 — Create custom subagents (Claude Code Docs)

URL: https://code.claude.com/docs/en/sub-agents

- authority: official-docs

La documentación oficial de Claude Code explica el mecanismo de aislamiento de contexto de un subagente, los campos obligatorios del frontmatter, cómo se dispara la delegación y cómo se devuelven los resultados. De este documento provienen las afirmaciones del curso sobre «por qué un subagente no puede ver tu historial de conversación», «la delegación se dispara por el campo description» y «solo se devuelve la conclusión».

Cita clave:

> "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read. Claude composes a delegation message that summarizes the task, and the subagent works from there."

> "When subagents complete, their results return to your main conversation. Running many subagents that each return detailed results can consume significant context."

> "The following fields can be used in the YAML frontmatter. Only name and description are required."

> "Claude automatically delegates tasks based on the task description in your request, the description field in subagent configurations, and current context."

> "Each subagent completes its task and returns results to Claude, which then passes relevant context to the next subagent."

> "A fork is a subagent that inherits the entire conversation so far instead of starting fresh... The fork's own tool calls still stay out of your conversation and only its final result comes back, so your main context window stays clean."

## S4 — Agents (OpenAI Agents SDK)

URL: https://openai.github.io/openai-agents-python/agents/

- authority: official-docs

La sección sobre patrones de orquestación multiagente en la documentación del OpenAI Agents SDK, que define los patrones Manager (agents-as-tools) y Handoffs. La sección de «patrones de colaboración» del curso la usa para contrastar otra división del trabajo habitual más allá de orquestador-worker.

Cita clave:

> "Manager (agents as tools): A central manager/orchestrator invokes specialized sub‑agents as tools and retains control of the conversation."

> "Handoffs: Peer agents hand off control to a specialized agent that takes over the conversation. This is decentralized."

## S5 — Handoffs (OpenAI Agents SDK)

URL: https://openai.github.io/openai-agents-python/handoffs/

- authority: official-docs

La explicación detallada del mecanismo de Handoffs en la documentación del OpenAI Agents SDK, que cubre cómo un nuevo agente toma el control de la conversación tras un handoff y el límite de que un handoff se mantiene dentro de una sola run. El curso la usa para explicar la diferencia clave en el paso de contexto entre la colaboración de estilo handoff y la de estilo orquestador-worker.

Cita clave:

> "Handoffs stay within a single run."

> "When a handoff occurs, it's as though the new agent takes over the conversation, and gets to see the entire previous conversation history."

## S6 — Best practices for Claude Code (Claude Code Docs)

URL: https://code.claude.com/docs/en/best-practices

- authority: official-docs

La documentación oficial de buenas prácticas de Claude Code, cuya sección sobre el «trust-then-verify gap» nombra directamente el modo de fallo en el que la salida de un modelo parece plausible pero no es necesariamente correcta, y da la respuesta: verifícalo tú mismo, y si no puedes verificarlo, no confíes en ello. De este documento proviene la afirmación central de la sección «un subagente que dice que ha terminado no es de fiar».

Cita clave:

> "The trust-then-verify gap. Claude produces a plausible-looking implementation that doesn't handle edge cases. Fix: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."

> "Claude stops when the work looks done. Without a check it can run, \"looks done\" is the only signal available, and you become the verification loop: every mistake waits for you to notice it."

> "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result."

## S7 — Effective context engineering for AI agents (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

La guía de primera mano de Anthropic sobre context engineering, que da la explicación directa del «context rot» y el «attention budget»: cuantos más tokens hay en la ventana de contexto, menor es la capacidad del modelo para recuperar información de ella con precisión, y cada token nuevo agota un presupuesto de atención finito. También aclara que esta degradación es un gradiente, no un precipicio. Sobre este artículo se apoyan las afirmaciones del curso en las secciones de «contaminación del contexto» y «dilución de la atención».

Cita clave:

> "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"

> "LLMs have an 'attention budget' that they draw on when parsing large volumes of context. ... Every new token introduced depletes this budget by some amount"

> "these factors create a performance gradient rather than a hard cliff"

## S8 — Using the Messages API (Claude API)

URL: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

- authority: official-docs

La documentación oficial afirma con claridad que la Messages API es stateless: cada solicitud debe llevar el historial de conversación completo, y la API no conserva ningún estado entre solicitudes. Es la premisa de implementación de la lección 6 para «cada llamada debe escribir la tarea y la información de la ronda anterior en el prompt verbatim».

Cita clave:

> "The Messages API is stateless, which means that you always send the full conversational history to the API."

## S9 — Structured outputs (Claude API)

URL: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

- authority: official-docs

La documentación oficial explica que, sin structured outputs, incluso con un prompt cuidadoso, el modelo aún puede producir JSON mal formado (errores de sintaxis, campos faltantes, tipos inconsistentes); los structured outputs usan constrained sampling para garantizar que la respuesta se ajusta estrictamente al schema. Es la premisa de la sección de la lección 6 «se le pide al revisor que devuelva solo JSON pero aun así necesitas un parseo defensivo».

Cita clave:

> "Structured outputs constrain Claude's responses to follow a specific schema, ensuring valid, parseable output for downstream processing."

> "Without structured outputs, Claude can generate malformed JSON responses or invalid tool inputs that break your applications. Even with careful prompting, you may encounter: Parsing errors from invalid JSON syntax"
