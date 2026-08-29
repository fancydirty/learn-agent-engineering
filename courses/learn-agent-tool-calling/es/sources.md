# Fuentes

Todos los hechos y definiciones clave de este curso provienen de los siguientes materiales. Las citas se mantienen en su idioma original, el inglés.

## S1 — Function calling — OpenAI API Guides

URL: https://developers.openai.com/api/docs/guides/function-calling

- authority: official-docs

Explica que la llamada a herramientas de OpenAI (function calling) es en el fondo una conversación de varios pasos entre tu aplicación y el modelo: el modelo solo dispara la llamada, y la ejecución real de la función tiene que hacerla la aplicación que llama.

Cita clave:
> "Tool calling is a multi-step conversation between your application and a model via the OpenAI API. When the model calls a function, you must execute it and return the result."

## S2 — Tool use with Claude — Overview

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

- authority: official-docs

Da una visión general del mecanismo de uso de herramientas de Claude, distingue las client tools que ejecuta la aplicación anfitriona de las server tools que ejecutan los servidores de Anthropic, y presenta la estructura básica de la respuesta una vez que se dispara una llamada a herramienta.

Cita clave:
> "It then returns a structured call that your application executes (client tools) or that Anthropic executes (server tools). ... Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. Your code executes the operation and sends back a tool_result."

## S3 — Define tools — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools

- authority: official-docs

Enumera, literalmente, los campos que debe incluir la definición de una herramienta (name, description, input_schema) y qué significa cada uno: la referencia autorizada sobre la estructura del contrato de una herramienta.

Cita clave:
> "A user-defined tool definition includes: name — The name of the tool. ... description — A detailed plaintext description of what the tool does, when it should be used, and how it behaves. input_schema — A JSON Schema object defining the expected parameters for the tool."

## S4 — How tool use works — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

Afirma sin rodeos que el modelo nunca ejecuta nada por sí mismo —solo emite una petición estructurada, y la ejecución real corre a cargo de la aplicación anfitriona o de los servidores de Anthropic— y describe el bucle canónico de varios turnos dirigido por stop_reason. La mejor base autorizada para la afirmación central de este curso.

Cita clave:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."

## S5 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

Da la especificación exacta de los campos de los bloques de contenido tool_use y tool_result (id/name/input y tool_use_id/content/is_error), que sirve para enseñar la forma byte a byte de la petición y de la respuesta.

Cita clave:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."

## S6 — Tools reference — Claude Code Docs

URL: https://code.claude.com/docs/en/tools-reference

- authority: official-docs

Lista las herramientas integradas que Claude Code expone como aplicación anfitriona y los nombres exactos que se usan en las reglas de permisos, las listas de herramientas de los subagentes y los matchers de los hooks, lo que ayuda a entender el concepto de catálogo de herramientas dentro de un bucle anfitrión real.

Cita clave:
> "Claude Code has access to a set of built-in tools that help it understand and modify your codebase. The tool names are the exact strings you use in permission rules, subagent tool lists, and hook matchers."

## S7 — Tool Use — LM Studio Docs (API compatible con OpenAI)

URL: https://lmstudio.ai/docs/developer/openai-compat/tools

- authority: authoritative-guide

Como documentación de implementación de una API compatible con OpenAI, confirma literalmente la ubicación exacta del array tool_calls en la respuesta y el valor de finish_reason igual a tool_calls, cubriendo un hueco que las guías oficiales dejan al describir la estructura de la respuesta.

Cita clave:
> "If the model decides that the user message would be best fulfilled with a tool call, an array of tool call request objects will be provided in the response field, choices[0].message.tool_calls. The finish_reason field of the top-level response object will also be populated with "tool_calls"."

## S8 — Writing effective tools for AI agents—using AI agents | Anthropic Engineering

URL: https://www.anthropic.com/engineering/writing-tools-for-agents

- authority: authoritative-guide

Explica que una buena descripción de herramienta debe eliminar la ambigüedad sobre las entradas y las salidas, y señala que tener más herramientas no significa que el agente rinda mejor: demasiadas herramientas parecidas dificultan la selección.

Cita clave:
> "Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs. ... More tools don't always lead to better outcomes."

## S9 — Introducing advanced tool use on the Claude Developer Platform | Anthropic Engineering

URL: https://www.anthropic.com/engineering/advanced-tool-use

- authority: authoritative-guide

Usa cifras concretas para mostrar cómo un conjunto grande de definiciones de herramientas (sobre todo tras conectar varios servidores MCP) consume una cantidad enorme de tokens de contexto antes incluso de que empiece la conversación, y explica que los resultados intermedios de las herramientas también entran íntegros en el contexto del modelo, desplazando —e incluso expulsando— información importante. Esto es lo que motiva la Tool Search Tool y la llamada programática a herramientas.

Cita clave:
> "That's 58 tools consuming approximately 55K tokens before the conversation even starts. ... At Anthropic, we've seen tool definitions consume 134K tokens before optimization."
> "When Claude analyzes a 10MB log file for error patterns, the entire file enters its context window ... These intermediate results consume massive token budgets and can push important information out of the context window entirely."

## S10 — How to implement tool use - Claude Platform Docs

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use

- authority: official-docs

La documentación oficial da la buena práctica para nombrar herramientas: usar el nombre del servicio como prefijo de espacio de nombres para evitar la ambigüedad, y hacer que las herramientas devuelvan identificadores estables y con mucha señal en lugar de referencias internas.

Cita clave:
> "Use meaningful namespacing in tool names. When your tools span multiple services or resources, prefix names with the service (e.g., github_list_prs, slack_send_message). This makes tool selection unambiguous as your library grows, and is especially important when using tool search."

## S11 — Tools - Model Context Protocol

URL: https://modelcontextprotocol.io/docs/concepts/tools

- authority: official-docs

La especificación de MCP distingue los errores de protocolo de los errores de ejecución de una herramienta, y exige que los clientes expongan al modelo los errores de ejecución accionables para que pueda autocorregirse y reintentar.

Cita clave:
> "Clients SHOULD provide tool execution errors to language models to enable self-correction."

## S12 — Specification - Model Context Protocol

URL: https://modelcontextprotocol.io/specification/2025-11-25

- authority: official-docs

La especificación oficial explica que MCP se apoya en las ideas del Language Server Protocol para estandarizar la integración de herramientas y de contexto en todo el ecosistema de aplicaciones de IA, lo que permite que distintas aplicaciones anfitrionas expongan herramientas mediante un único protocolo uniforme.

Cita clave:
> "MCP takes some inspiration from the Language Server Protocol, which standardizes how to add support for programming languages across a whole ecosystem of development tools. In a similar way, MCP standardizes how to integrate additional context and tools into the ecosystem of AI applications."

## S13 — What is the Model Context Protocol (MCP)? - Model Context Protocol

URL: https://modelcontextprotocol.io/introduction

- authority: official-docs

La página oficial de introducción usa la analogía del puerto USB-C para explicar de forma intuitiva cómo MCP ofrece una manera uniforme y estandarizada de conectar aplicaciones de IA con herramientas y fuentes de datos externas.

Cita clave:
> "Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect electronic devices, MCP provides a standardized way to connect AI applications to external systems."

## S14 — Creating your first schema - JSON Schema

URL: https://json-schema.org/learn/getting-started-step-by-step

- authority: official-docs

La documentación oficial explica que title y description en JSON Schema declaran la intención y no añaden ninguna restricción, y que $schema declara qué versión de la especificación se sigue: la base para diseñar los parámetros de entrada de una herramienta (inputSchema).

Cita clave:
> "title and description: state the intent of the schema. These keywords don't add any constraints to the data being validated. ... $schema: specifies which draft of the JSON Schema standard the schema adheres to."

## S15 — Configure permissions - Claude Code Docs

URL: https://code.claude.com/docs/en/permissions

- authority: official-docs

Como documentación oficial, explica la sintaxis exacta de las reglas de permisos de Claude Code (allow/ask/deny y la forma Tool(specifier)) y su orden de evaluación: la base de primera mano para el tema central del curso sobre la sintaxis de las reglas de permisos.

Cita clave:
> "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn't change the order. A broad deny rule like `Bash(aws *)` blocks every matching call, including calls that also match a narrower allow rule like `Bash(aws s3 ls)`, so a deny rule can't carry allowlist exceptions."

## S16 — Configure the sandboxed Bash tool - Claude Code Docs

URL: https://code.claude.com/docs/en/sandboxing

- authority: official-docs

La documentación oficial explica que el aislamiento del sistema de archivos y el aislamiento de red de un sandbox son dos capas independientes, y por qué la garantía a nivel de sistema operativo se mantiene incluso después de que el modelo haya sido manipulado por una inyección de prompt: sirve para enseñar el radio de impacto de las herramientas de escritura y ejecución y qué garantiza realmente el sandbox.

Cita clave:
> "The two layers also differ in how they are enforced. Claude Code evaluates permission decisions before a command runs, based on the command string and, in auto mode, a separate classifier's judgment about whether the command is safe. The operating system enforces the sandbox boundary on the running process, so it holds regardless of what the model chose to run and even if an allowed command does more than its name suggests."

## S17 — Making Claude Code more secure and autonomous with sandboxing - Anthropic Engineering

URL: https://www.anthropic.com/engineering/claude-code-sandboxing

- authority: official-docs

Esta entrada del blog de ingeniería de Anthropic vincula explícitamente el objetivo de diseño del sandbox con el caso de una inyección de prompt exitosa: la fuente autorizada para la afirmación del curso de que el sandboxing apunta específicamente al riesgo de inyección de prompt.

Cita clave:
> "Sandboxing ensures that even a successful prompt injection is fully isolated, and cannot impact overall user security. ... This is particularly important in preventing a prompt-injected Claude from modifying sensitive system files. ... Without network isolation, a compromised agent could exfiltrate sensitive files like SSH keys."

## S18 — LLM06:2025 Excessive Agency - OWASP Gen AI Security Project

URL: https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM06_ExcessiveAgency.html

- authority: official-docs

La página oficial de OWASP da la definición autorizada de Excessive Agency y sus tres causas raíz (exceso de funcionalidad, exceso de permisos y exceso de autonomía), además de la mitigación concreta de exigir aprobación humana para las acciones de alto riesgo: el respaldo del capítulo del curso sobre los límites de autorización de herramientas de un agente.

Cita clave:
> "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction. ... Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken. This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."

## S19 — The lethal trifecta for AI agents - Simon Willison's Weblog

URL: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/

- authority: authoritative-guide

Esta entrada propone y define con autoridad el marco tan citado de la «trifecta letal» (acceso a datos privados, exposición a contenido no confiable y capacidad de comunicarse hacia fuera): se usa para enseñar el modelo de riesgo de la inyección indirecta de prompt que acaba en exfiltración de datos.

Cita clave:
> "The lethal trifecta of capabilities is: Access to your private data—one of the most common purposes of tools in the first place! Exposure to untrusted content—any mechanism by which text (or images) controlled by a malicious attacker could become available to your LLM. The ability to externally communicate in a way that could be used to steal your data."

## S20 — Strict tool use — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use

- authority: official-docs

La documentación oficial explica que en el modo por defecto (no estricto) las entradas de herramienta del modelo no llevan ninguna garantía de la plataforma de que se ajusten al esquema: los tipos pueden no coincidir o pueden faltar campos obligatorios. Con strict: true, la plataforma usa muestreo restringido por gramática para garantizar que las entradas coincidan con input_schema, y todos los esquemas oficiales de modo estricto fijan additionalProperties: false.

Cita clave:
> "Setting strict: true on a tool definition guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling). ... Without strict mode, Claude might return incompatible types ("2" instead of 2) or omit required fields, breaking your functions and causing runtime errors."

## S21 — Parallel tool use — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use

- authority: official-docs

La documentación oficial especifica el formato de retorno de las llamadas a herramientas en paralelo (todos los bloques tool_result van juntos en el único mensaje de usuario inmediatamente posterior, cada uno reclamado por su tool_use_id) y el interruptor disable_parallel_tool_use: cuando tool_choice es auto, ponerlo en true hace que el modelo llame como mucho a una herramienta por respuesta.

Cita clave:
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."
> "When tool_choice type is auto (the default), setting disable_parallel_tool_use: true means Claude calls at most one tool per response."
