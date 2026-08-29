# Fuentes

Las afirmaciones clave de este curso se apoyan en las fuentes de abajo. Las lecciones las citan con `[^Sn]`; los extractos exactos están bajo cada entrada. Las citas se mantienen en su idioma original, el inglés.

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

El artículo autorizado de la ingeniería de Anthropic sobre qué es un agente, en qué se diferencian los agentes de los workflows y cómo mantener el control: da la definición de agente como «herramientas en un bucle», las condiciones de parada, los puntos de control y los costos y errores acumulados que trae la autonomía. Es la base central del tema de bucle y control de este curso.

Cita clave:
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

Da el bucle multiturno canónico dirigido por stop_reason: el modelo solo emite solicitudes estructuradas, el host ejecuta las herramientas, los resultados vuelven y el bucle se repite mientras stop_reason siga siendo tool_use. Es la base directa de la lección del «bucle central».

Cita clave:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."

## S3 — Effective context engineering for AI agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

Explica que un agente en un bucle sigue acumulando contexto mientras que el «attention budget» del modelo es finito y la recuperación se degrada a medida que crece el contexto, que es por lo que el bucle debe estar restringido y el contexto gobernado. Es la base de «por qué el bucle necesita límites».

Cita clave:
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

Define el riesgo de excessive agency y nombra la mitigación de forma explícita: aprobación human-in-the-loop para las acciones de alto impacto. Es la base, en la lección de «intervención y dirección», para poner un checkpoint humano delante de las operaciones irreversibles.

Cita clave:
> "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction. ... Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken. This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

Una hoja de ruta de código abierto organizada en torno a la ingeniería de harness, que enuncia la tesis central —mismo modelo, distinto harness, resultado completamente distinto— y descompone el harness en control del bucle, tool dispatch, gestión de contexto y otros componentes. Se usa para apoyar la afirmación marco de que el harness determina la fiabilidad. Nota: esta fuente es una hoja de ruta comunitaria asistida por IA; sus puntuaciones de benchmark, cifras salariales y otros números concretos no se citan como hechos, solo se usan sus afirmaciones marco.

Cita clave:
> "Same model, different harness, completely different result."
> "An agent makes its own control-flow decisions inside a loop."
> "the harness is the union of:"
> "loop control. The while-loop driving model→tools→model."
> "tool dispatch. Registry, schema validation, parallel calls, error recovery, retries."

## S6 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

Da la especificación exacta de campos de los bloques de contenido tool_use y tool_result, más la regla de que las llamadas en paralelo deben devolver todos los bloques tool_result juntos. Se usa en la lección 6 para construir con precisión las solicitudes y respuestas del bucle escrito a mano.

Cita clave:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."
