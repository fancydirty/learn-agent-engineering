# Fuentes

Las citas de las fuentes se mantienen en su idioma original, el inglés.

## S1 — Context windows

URL: https://platform.claude.com/docs/en/build-with-claude/context-windows

- authority: official-docs

La documentación oficial de Anthropic explica de qué se compone la ventana de contexto —la memoria de trabajo del modelo—: cuentan el system prompt, cada mensaje (incluidos los resultados de herramientas, las imágenes y los documentos), las definiciones de herramientas y la propia salida del modelo en el turno (incluido el extended thinking). También define el «context rot» (la precisión y la recuperación se degradan a medida que crece el número de tokens) y señala que cada respuesta informa de su consumo en el campo usage. Es la base principal de la lección 1 («La ventana de contexto es toda la memoria que tiene un agente») y apoyo de fondo para la lección 2 («el historial de conversación solo crece»).

Cita clave:
> "As token count grows, accuracy and recall degrade, a phenomenon known as *context rot*. This makes curating what's in context just as important as how much space is available."
> "Everything in the request counts toward the context window: the system prompt, every message in messages (including tool results, images, and documents), and your tool definitions. The output Claude generates for the turn, including its extended thinking, counts too."
> "As the conversation advances through turns, each user message and assistant response accumulates within the context window, and previous turns are preserved completely."
> "The context window (up to 1M tokens, depending on the model) holds the conversation history plus the new output Claude generates."
> "Every response reports what the request consumed in its `usage` field."

## S2 — Context engineering: memory, compaction, and tool clearing

URL: https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools

- authority: official-docs

El cookbook oficial de Anthropic define con precisión los tres mecanismos para manejar el crecimiento del contexto: la compaction (destila toda la ventana en un resumen de alta fidelidad, a costa de una inferencia del sumarizador), el tool-result clearing (descarta solo los resultados de herramientas obsoletos y recuperables, conservando el registro de la llamada) y la primitiva memory tool (saca información de la ventana para que sobreviva entre sesiones). Explica que se pueden usar de forma independiente o combinada, y que el clearing y la compaction actúan solo sobre el contexto actual y no ayudan a una sesión nueva. Es la base principal de la lección 2 («gestionar el historial de conversación») y apoyo de fondo para las lecciones 3, 4 y 6.

Cita clave:
> "Compaction distills the contents of a context window into a high-fidelity summary, letting the agent continue with minimal performance degradation when the conversation gets long."
> "Tool-result clearing addresses the bloat from tool use itself. As an agent pulls in tools and calls them, the results pile up, and deciding how much of that tool output to keep becomes an increasingly important part of managing context. Clearing drops old, re-fetchable results while keeping the record that the call happened."
> "A rough mental model for prioritizing: compaction compresses the whole window when it grows too large, clearing drops stale re-fetchable data inside the window, and memory moves information out of the window so it survives across sessions."
> "Compaction | compact_20260112 | compact-2026-01-12 | Token threshold (server-side, min 50K) | trigger (default 150K), instructions, pause_after_compaction"
> "Tool clearing | clear_tool_uses_20250919 | context-management-2025-06-27 | Token threshold (server-side) | trigger (default 100K), keep (default 3 tool uses), clear_at_least, exclude_tools, clear_tool_inputs"
> "The summary preserves key decisions and facts but may drop specific numbers or exact phrasing. It costs inference (the summarizer model runs), but handles all context growth, not just tool results."
> "Clearing and compaction both operate on the current context; neither helps when a new session starts and the window is empty. Memory solves that problem."
> "Compaction is a _whole-transcript_ operation: user messages, assistant messages, tool calls, tool results, even prior compaction blocks are all flattened into the summary."
> "This cookbook works through how to think about designing with them: when each one applies, how to configure them, what changes when you use them independently vs. together, and sample use-cases where different combinations make sense."

## S3 — How Claude remembers your project

URL: https://code.claude.com/docs/en/memory

- authority: official-docs

La documentación oficial de Anthropic describe dos mecanismos de memoria complementarios: CLAUDE.md lo escriben las personas y se carga por completo al inicio de cada sesión (el objetivo recomendado es menos de 200 líneas; el límite duro real es de 4 MiB, a partir del cual el archivo se omite por entero); la Auto memory la escribe Claude como un índice MEMORY.md más archivos de tema bajo demanda, de los cuales solo se cargan las primeras 200 líneas o 25 KB del índice por sesión, mientras que los archivos de tema se leen bajo demanda. También señala que los comentarios HTML de nivel de bloque se eliminan antes de la inyección, y que el CLAUDE.md de la raíz del proyecto se vuelve a leer y a inyectar tras /compact. Es la base principal de la lección 3 («memoria externa: archivos y recuperación») y se reutiliza en las lecciones 5 y 6.

Cita clave:
> "CLAUDE.md files are loaded into the context window at the start of every session, consuming tokens alongside your conversation... **Size**: target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence."
> "Claude Code loads a CLAUDE.md file of up to 4 MiB in full and skips a larger file. Shorter files produce better adherence."
> "Block-level HTML comments (`<!-- maintainer notes -->`) in CLAUDE.md files are stripped before the content is injected into Claude's context."
> "The first 200 lines of MEMORY.md, or the first 25KB, whichever comes first, are loaded at the start of every conversation. Content beyond that threshold is not loaded at session start."
> "Claude Code doesn't load topic files such as `user_role.md` or `feedback_testing.md` at startup. Claude reads them on demand using its standard file tools when it needs the information."
> "Project-root CLAUDE.md survives compaction: after /compact, Claude re-reads it from disk and re-injects it into the session."
> "Who writes it | You | Claude" / "Loaded into | Every session | Every session (first 200 lines or 25KB)"

## S4 — Track todos

URL: https://code.claude.com/docs/en/agent-sdk/todo-tracking

- authority: official-docs

La documentación oficial de Anthropic define el ciclo de vida completo de un todo durante la ejecución de un agente —Created, Activated, Completed, Removed— y explica que ese estado se expone mediante llamadas a herramientas estructuradas (TaskCreate / TaskUpdate) observables en el flujo de mensajes. Es la base principal de la lección 4 («estado estructurado»).

Cita clave:
> "Claude moves each todo through a predictable lifecycle:\n\n1. **Created**: Claude adds the todo as pending when it identifies a task\n2. **Activated**: Claude sets the todo to in_progress when it starts the work\n3. **Completed**: Claude marks it completed when the task finishes successfully\n4. **Removed**: Claude deletes a todo it no longer needs by setting status: \"deleted\" in a TaskUpdate call"
> "In a session that has the task-tracking tools, Claude keeps a written todo list, updating each item's status as it works. You see each change in the message stream as a structured tool call."

## S5 — Memory Is a Feature. It Is Also an Attack Surface

URL: https://genai.owasp.org/2026/05/13/memory-is-a-feature-it-is-also-an-attack-surface/

- authority: authoritative-guide

Publicado en el blog oficial del OWASP Gen AI Security Project por un co-lead de la entrada ASI06 (envenenamiento de memoria y contexto), este artículo usa como ejemplo la vulnerabilidad MemoryTrap divulgada por el equipo de investigación de Cisco: una rutina aparentemente inofensiva —clonar un repositorio, aprobar la instalación de una dependencia— dejó que un payload malicioso alcanzara la memoria persistente, la configuración global de hooks e incluso una capa de instrucciones de alta confianza a través del system prompt, de modo que una acción puntual podía cambiar el comportamiento futuro del modelo a través de sesiones y proyectos. También señala que, tras la divulgación de Cisco, Anthropic retiró las memorias de usuario del system prompt en Claude Code v2.1.50. Es la base principal de la lección 5 («los límites y la seguridad de la memoria») y se reutiliza en la lección 6 para el diseño de seguridad de una capa de memoria persistente.

Cita clave:
> "Agentic systems do not just respond in the moment. They retain context, reuse memory, and rely on persistent state to guide future reasoning and actions. That is what makes them useful. It is also what makes them vulnerable."
> "In the vulnerability we called MemoryTrap, we found that a routine developer workflow could turn into persistent prompt injection. The path was surprisingly ordinary: clone a repository, let the agent help, approve a dependency installation, and move on."
> "Instead, it reached persistent memory, the global hooks configuration, and even influenced a highly trusted instruction layer through the system prompt. In other words, a one-time action could shape the model's future behavior across sessions, projects, and even reboots."
> "To Anthropic's credit, after we at Cisco disclosed the issue, Claude Code v2.1.50 removed user memories from the system prompt, reducing the specific high-trust override path we identified. That was the right fix for the path we found."
> "Once malicious content reaches trusted surfaces like memory, hooks, or configuration, the attacker is no longer just influencing one response. They are influencing future reasoning."
> "That is why MemoryTrap maps so clearly to ASI06: Memory & Context Poisoning."

## S6 — Using the Messages API

URL: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

- authority: official-docs

La documentación oficial afirma con claridad que la Messages API es stateless: cada solicitud debe llevar el historial de conversación completo, y la API no conserva ningún estado entre solicitudes. Es la base directa de la afirmación central de la lección 1 («las llamadas a la API son stateless») y apoyo para la premisa de la lección 4 de que un registro de progreso desaparece con la ventana cuando termina la sesión.

Cita clave:
> "The Messages API is stateless, which means that you always send the full conversational history to the API."

## S7 — Handle tool calls

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

La documentación oficial da la regla de emparejamiento para las llamadas a herramientas: un bloque tool_result debe seguir inmediatamente a su bloque tool_use correspondiente, y un par roto hace que la solicitud dé error. Es la base directa de la lección 2 («el truncado no debe romper un par tool_use/tool_result») y de la motivación de diseño de splitKeepingToolPairs en la lección 6.

Cita clave:
> "Tool result blocks must immediately follow their corresponding tool use blocks in the message history. You cannot include any messages between the assistant's tool use message and the user's tool result message."
> "If you receive an error like \"tool_use ids were found without tool_result blocks immediately after\", check that your tool results are formatted correctly."

## S8 — Compaction

URL: https://platform.claude.com/docs/en/build-with-claude/compaction

- authority: official-docs

La documentación oficial da los detalles de parámetros de la compaction de resumen del lado del servidor: un umbral de disparo mínimo de 50 000 tokens (impuesto por el servidor), la posibilidad de múltiples compactions en una conversación larga, el último bloque de compaction reflejando el estado final del prompt y la posibilidad de que la compaction ocurra más de una vez dentro de una sola solicitud. Es la base directa de los detalles de compaction de la lección 2.

Cita clave:
> "`input_tokens` is the only supported trigger type. `value` must be at least 50,000 tokens."
> "A long-running conversation might result in multiple compactions. The last compaction block reflects the final state of the prompt, replacing content prior to it with the generated summary."
> "Compaction might occur multiple times within a single request depending on your trigger threshold and the amount of output generated."

## S9 — How tool use works

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

La documentación oficial da la especificación del bucle de ejecución de herramientas dirigido por stop_reason: el modelo nunca ejecuta nada por sí mismo, solo emite una solicitud estructurada; el host la ejecuta y devuelve el resultado; mientras stop_reason siga siendo tool_use, el bucle continúa. Es la base directa del pasaje de la lección 6 «punto de partida: el bucle de ejecución del curso de tool calling».

Cita clave:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."
