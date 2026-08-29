# Fuentes

Todos los hechos y definiciones clave de este curso provienen de los siguientes materiales. Las citas se mantienen en su idioma original, el inglés.

## S1 — Documentación de Claude Code: Workflows

URL: https://code.claude.com/docs/en/workflows

- authority: official-docs

La página oficial de flujos de trabajo de Claude Code, que explica cómo un flujo de trabajo dinámico dirige varios subagentes desde un script: la forma que encaja con auditorías de bases de código grandes, migraciones amplias e investigaciones con verificación cruzada.

Cita clave:
> "Reach for a workflow when a task needs more agents than one conversation can coordinate, or when you want the orchestration codified as a script you can read and rerun."

## S2 — Alex Op: Claude Code Workflows and Deterministic Orchestration

URL: https://alexop.dev/posts/claude-code-workflows-deterministic-orchestration/

- authority: authoritative-guide

Una lectura detallada del patrón de orquestación determinista: el script es dueño de los bucles y las ramas, cada llamada a `agent()` entrega el trabajo a un subagente nuevo, y solo el trabajo en sí lo dirige el modelo.

Cita clave:
> "A normal agent decides the control flow as it goes. A workflow inverts that. You write the control flow as plain code, and each individual step is delegated to a fresh subagent."

## S3 — ClaudeWorld: What Is a Workflow? Multi-Agent Orchestration Explained

URL: https://claude-world.com/articles/what-is-a-workflow-multi-agent-orchestration/

- authority: authoritative-guide

Rastrea cómo Claude Code pasó de un solo agente al fan-out de subagentes y de ahí a los flujos de trabajo dirigidos por un script, y expone las cuatro etapas junto con la idea central de la orquestación.

Cita clave:
> "Orchestration is exactly what it sounds like: one score, many musicians. A script deciding it — for loop, if statement — is orchestration."

## S4 — MindStudio: Five Claude Code Agentic Workflow Patterns

URL: https://www.mindstudio.ai/blog/claude-code-agentic-workflow-patterns

- authority: authoritative-guide

Recorre cinco patrones de flujo de trabajo —secuencial, operador, dividir y unir, equipos de agentes y headless— y a qué grado de complejidad de tarea se ajusta cada uno.

Cita clave:
> "Understanding the five core Claude workflow patterns — sequential, operator, split-and-merge, agent teams, and headless — determines how much you can actually get done."

## S5 — Mae Capozzi: Building a Multi-Agent Orchestrator

URL: https://maecapozzi.com/blog/building-a-multi-agent-orchestrator

- authority: blog

Un informe de campo sobre la construcción de un orquestador de seis fases para agentes de programación especializados, con trazado distribuido, orquestación por fases y aislamiento de procesos.

Cita clave:
> "Phase-based orchestration: Break work into discrete phases (planning, implementation, testing, review) rather than letting agents free-roam."

## S6 — AWS Marketplace: Agent Orchestration

URL: https://aws.amazon.com/marketplace/build-learn/ai-agent-learning-series/agent-orchestration

- authority: official-docs

La guía propia de AWS sobre orquestación multiagente con Step Functions, Bedrock Agents y MWAA, que cubre el plano de control, la gestión de estado y los pasos de aprobación humana.

Cita clave:
> "An orchestrated workflow needs configurable retry policies with exponential backoff and jitter so that transient errors don't permanently fail long-running workflows."

## S7 — Vasanthan: Handling Failures in Agent-Based Workflows

URL: https://medium.com/@vasanthancomrads/handling-failures-in-agent-based-workflows-c0fd9489b2ee

- authority: blog

Un repaso práctico del manejo de fallos en flujos de trabajo de agentes —reintentos, fallbacks, validación y circuit breakers— pensado para sistemas que tienen que aguantar en producción.

Cita clave:
> "User Input → Agent → Tool Call → Retry → Circuit Breaker → Validation → Fallback (if needed) → Confidence Check → Human-in-loop (optional) → Final Output"

## S8 — Augment Code: How Async AI Agent Workflows Survive Failure

URL: https://www.augmentcode.com/guides/async-ai-agent-workflows

- authority: authoritative-guide

La secuencia de recuperación que usan los sistemas en producción: backoff exponencial con jitter para los errores transitorios, cambio de proveedor, acciones compensatorias y cómo configura AWS Step Functions el manejo de errores.

Cita clave:
> "Retry with exponential backoff and jitter for transient errors (5xx, network timeouts). AWS Step Functions provides error handling with configurable backoff and jitter for retries."

## S9 — Agents Arcade: Error Handling in Agentic Systems

URL: https://agentsarcade.com/blog/error-handling-agentic-systems-retries-rollbacks-graceful-failure

- authority: blog

Traza la línea que de verdad importa para los reintentos: repetir una llamada al modelo sin estado sale barato, pero repetir una llamada a herramienta que escribe en una base de datos o envía correo es otra cosa completamente distinta.

Cita clave:
> "Retrying a stateless model call is usually fine. Retrying a tool invocation that writes to a database, sends an email, or triggers a downstream workflow is often a bug disguised as resilience."

## S10 — Temporal: 11 Production Failure Patterns in AI Agent Orchestration

URL: https://www.xgrid.co/resources/temporal-ai-agent-orchestration-failure-patterns/

- authority: authoritative-guide

Once patrones de fallo observados al desplegar agentes de IA sobre Temporal, con análisis y correcciones para la orquestación de LLM, los reintentos, la cancelación, la carga y los pasos con intervención humana.

Cita clave:
> "LLM activity retry policies should be defined per error class, not as a single catch-all policy on the activity registration."

## S11 — MindStudio: Workflow State vs. Session State

URL: https://www.mindstudio.ai/blog/workflow-state-vs-session-state-ai-agents

- authority: authoritative-guide

Separa los dos tipos de estado —el estado de sesión, el contexto desechable de la conversación en curso, y el estado del flujo de trabajo, el historial de la tarea que le sobrevive— y defiende que la máquina de estados es la forma más clara de modelar el segundo.

Cita clave:
> "Claude Code uses a file called CLAUDE.md in projects as a form of persistent workflow context — a place to store project-specific instructions, conventions, and state that survives across sessions."

## S12 — MachineLearningMastery: 5 Architectural Patterns for Persistent Memory and State in AI Agents

URL: https://machinelearningmastery.com/5-architectural-patterns-for-persistent-memory-and-state-in-ai-agents/

- authority: authoritative-guide

Distingue el estado de la memoria —el estado es la instantánea de la tarea actual, la memoria es lo que se aprendió de las anteriores— y muestra cómo los checkpoints guardan el estado del flujo de trabajo para que una ejecución pueda reanudarse.

Cita clave:
> "State is a snapshot. It's everything the agent currently knows about a task right now: what step it's on, what the last tool call returned, what variables it's tracking."

## S13 — Appamass: State Management Patterns for Reliable AI Agent Workflows

URL: https://appamass.com/en/blog/state-management-patterns-for-reliable-ai-agent-workflows-5yemlru6ui6cacast3l5

- authority: blog

Cómo mantener el estado fuera de la ventana de contexto nativa del modelo: representar la situación actual como un objeto plano para que siga siendo estructurado y consultable, y persistirlo después para poder recuperarse.

Cita clave:
> "Using Plain Old Java Objects (POJOs) or similar structures to represent the 'current situation' allows for a structured, queryable state."

## S14 — Ranjan Kumar: Building Agents That Remember

URL: https://ranjankumar.in/building-agents-that-remember-state-management-in-multi-agent-ai-systems

- authority: blog

Presenta el árbol de memoria de tareas —una jerarquía donde cada nodo es un paso con su acción, entradas, salidas y estado— como una forma de sostener el razonamiento no lineal y gestionar un flujo de trabajo.

Cita clave:
> "Store this state externally (Redis, Postgres, etc.) and load it at the start of each agent turn. If the agent crashes, you can resume exactly where it left off."

## S15 — Chrono Innovation: Architecture for Scalable Agentic AI Workflows

URL: https://www.chronoinnovation.com/resources/agentic-ai-workflows-architecture/

- authority: authoritative-guide

Defiende tratar el ensamblado del contexto como una decisión de diseño por derecho propio: objetos de estado estructurados con campos con nombre, recuperados según los necesite el paso siguiente, en lugar de un contexto que solo se va acumulando.

Cita clave:
> "Treat context assembly as a first-class operation in your workflow design. One pattern that works well: structured state objects with explicit fields rather than free-form context accumulation."

## S16 — ApX Machine Learning: Task Decomposition Strategies for LLM Agents

URL: https://apxml.com/courses/agentic-llm-memory-architectures/chapter-4-complex-planning-tool-integration/task-decomposition-strategies

- authority: authoritative-guide

El enfoque de base para la descomposición: pedírsela al modelo, mediante prompting zero-shot, ejemplos few-shot o chain-of-thought, convirtiendo un objetivo de alto nivel en una secuencia de pasos.

Cita clave:
> "The most direct approach uses the LLM itself to perform the decomposition. This typically involves prompting the LLM with the high-level goal and asking it to generate a sequence of steps or sub-tasks."

## S17 — Artículo ACONIC: Systematic LLM Task Decomposition

URL: https://arxiv.org/html/2510.07772v1

- authority: research

Presenta ACONIC, que modela una tarea como un problema de restricciones y usa medidas formales de complejidad para guiar cómo se divide: entre 10 y 40 puntos porcentuales de mejora en tareas combinatorias y de consultas a bases de datos.

Cita clave:
> "A principled measure of task complexity would enable systematic decomposition strategies and the ability to study tasks of comparable difficulty, and provide guidance on when tools are needed."

## S18 — OneUpTime: How to Create a Task Decomposition

URL: https://oneuptime.com/blog/post/2026-01-30-task-decomposition/view

- authority: blog

Tres estrategias de descomposición —secuencial simple, paralela cuando las piezas son independientes e híbrida para cualquier caso real— construidas a partir de subtareas atómicas con las dependencias declaradas de forma explícita.

Cita clave:
> "Start with simple sequential decomposition, add parallelism where tasks are independent, and use hybrid approaches for real-world complexity."

## S19 — AI21: What Is Task Decomposition?

URL: https://www.ai21.com/glossary/foundational-llm/task-decomposition/

- authority: official-docs

Cómo la planificación jerárquica y el encadenamiento de prompts dividen una tarea en capas ordenadas o módulos paralelos, lo que permite a un agente planificar, ejecutar y revisar subtareas con menos alucinaciones y menos razonamiento desperdiciado.

Cita clave:
> "Hierarchical planning and prompt chaining decompose tasks into ordered layers or parallel modules, enabling LLM agents to plan, execute, and reflect on subtasks efficiently."

## S20 — ClaudFlow: 7 Patterns for Claude Code Workflow Automation

URL: https://claudflow.com/guides/claude-code-workflow-automation.html

- authority: authoritative-guide

Siete patrones para el trabajo del día a día —revisión de código, refactorización, generación de pruebas, documentación, diagnóstico de bugs, migración y auditorías de seguridad—, cada uno convirtiendo un proceso hecho a mano en algo repetible.

Cita clave:
> "Claude code workflow automation transforms development tasks from inconsistent manual processes into reliable, repeatable pipelines."

## S21 — Kinde: Multi-Agent Workflows for Complex Refactoring

URL: https://www.kinde.com/learn/ai-for-software-engineering/ai-agents/multi-agent-workflows-for-complex-refactoring-orchestrating-ai-teams/

- authority: authoritative-guide

La coordinación de varios agentes a lo largo de una refactorización grande —uno en el análisis de arquitectura, otro en la migración del código, otro en la validación de las pruebas— con ejemplos resueltos en Autogen y CrewAI.

Cita clave:
> "Learn to coordinate multiple AI agents for large-scale refactoring projects—one for architecture analysis, another for code migration, and a third for test validation."

## S22 — Artículo RefAgent: A Multi-Agent LLM Framework for Automated Software Refactoring

URL: https://arxiv.org/html/2511.03153v1

- authority: research

RefAgent replica la secuencia que sigue una refactorización humana y reparte el trabajo entre varios agentes: planificación, transformación, validación y corrección iterativa mediante razonamiento y colaboración.

Cita clave:
> "RefAgent orchestrates an end-to-end workflow that includes planning, transformation, validation, and iterative correction through reasoning and collaboration."
