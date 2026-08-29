# Fontes

Todos os fatos e definições centrais deste curso vêm dos materiais a seguir. As citações permanecem no idioma original, o inglês.

## S1 — Documentação do Claude Code: Workflows

URL: https://code.claude.com/docs/en/workflows

- authority: official-docs

A página oficial de workflows do Claude Code, que explica como um workflow dinâmico conduz vários subagentes a partir de um script — o formato que serve para auditorias de bases de código grandes, migrações amplas e pesquisas com verificação cruzada.

Citação principal:
> "Reach for a workflow when a task needs more agents than one conversation can coordinate, or when you want the orchestration codified as a script you can read and rerun."

## S2 — Alex Op: Claude Code Workflows and Deterministic Orchestration

URL: https://alexop.dev/posts/claude-code-workflows-deterministic-orchestration/

- authority: authoritative-guide

Uma leitura atenta do padrão de orquestração determinística: o script é dono dos loops e das ramificações, cada chamada `agent()` entrega o trabalho a um subagente novo, e só o trabalho em si é conduzido pelo modelo.

Citação principal:
> "A normal agent decides the control flow as it goes. A workflow inverts that. You write the control flow as plain code, and each individual step is delegated to a fresh subagent."

## S3 — ClaudeWorld: What Is a Workflow? Multi-Agent Orchestration Explained

URL: https://claude-world.com/articles/what-is-a-workflow-multi-agent-orchestration/

- authority: authoritative-guide

Traça como o Claude Code saiu de um agente único para o fan-out de subagentes e daí para workflows conduzidos por script, e apresenta os quatro estágios mais a ideia central da orquestração.

Citação principal:
> "Orchestration is exactly what it sounds like: one score, many musicians. A script deciding it — for loop, if statement — is orchestration."

## S4 — MindStudio: Five Claude Code Agentic Workflow Patterns

URL: https://www.mindstudio.ai/blog/claude-code-agentic-workflow-patterns

- authority: authoritative-guide

Percorre cinco padrões de workflow — sequencial, operador, dividir-e-juntar, times de agentes e headless — e a complexidade de tarefa que cada um atende.

Citação principal:
> "Understanding the five core Claude workflow patterns — sequential, operator, split-and-merge, agent teams, and headless — determines how much you can actually get done."

## S5 — Mae Capozzi: Building a Multi-Agent Orchestrator

URL: https://maecapozzi.com/blog/building-a-multi-agent-orchestrator

- authority: blog

Um relato de campo sobre a construção de um orquestrador de seis fases para agentes de programação especializados, usando tracing distribuído, orquestração por fases e isolamento de processos.

Citação principal:
> "Phase-based orchestration: Break work into discrete phases (planning, implementation, testing, review) rather than letting agents free-roam."

## S6 — AWS Marketplace: Agent Orchestration

URL: https://aws.amazon.com/marketplace/build-learn/ai-agent-learning-series/agent-orchestration

- authority: official-docs

O guia da própria AWS sobre orquestração multiagente com Step Functions, Bedrock Agents e MWAA, cobrindo o control plane, a gestão de estado e as etapas de aprovação humana.

Citação principal:
> "An orchestrated workflow needs configurable retry policies with exponential backoff and jitter so that transient errors don't permanently fail long-running workflows."

## S7 — Vasanthan: Handling Failures in Agent-Based Workflows

URL: https://medium.com/@vasanthancomrads/handling-failures-in-agent-based-workflows-c0fd9489b2ee

- authority: blog

Um apanhado prático do tratamento de falhas em workflows de agentes — retries, fallbacks, validação e circuit breakers — voltado a sistemas que precisam se sustentar em produção.

Citação principal:
> "User Input → Agent → Tool Call → Retry → Circuit Breaker → Validation → Fallback (if needed) → Confidence Check → Human-in-loop (optional) → Final Output"

## S8 — Augment Code: How Async AI Agent Workflows Survive Failure

URL: https://www.augmentcode.com/guides/async-ai-agent-workflows

- authority: authoritative-guide

A sequência de recuperação usada por sistemas em produção: backoff exponencial com jitter para erros transitórios, troca de provedor, ações compensatórias e como o AWS Step Functions configura o tratamento de erros.

Citação principal:
> "Retry with exponential backoff and jitter for transient errors (5xx, network timeouts). AWS Step Functions provides error handling with configurable backoff and jitter for retries."

## S9 — Agents Arcade: Error Handling in Agentic Systems

URL: https://agentsarcade.com/blog/error-handling-agentic-systems-retries-rollbacks-graceful-failure

- authority: blog

Traça a linha que importa para os retries: repetir uma chamada de modelo sem estado é barato, mas repetir uma chamada de ferramenta que escreve em um banco de dados ou envia e-mail é outra coisa completamente diferente.

Citação principal:
> "Retrying a stateless model call is usually fine. Retrying a tool invocation that writes to a database, sends an email, or triggers a downstream workflow is often a bug disguised as resilience."

## S10 — Temporal: 11 Production Failure Patterns in AI Agent Orchestration

URL: https://www.xgrid.co/resources/temporal-ai-agent-orchestration-failure-patterns/

- authority: authoritative-guide

Onze padrões de falha observados ao rodar agentes de IA no Temporal, com análise e correções para orquestração de LLM, retries, cancelamento, carga e etapas com humano no circuito.

Citação principal:
> "LLM activity retry policies should be defined per error class, not as a single catch-all policy on the activity registration."

## S11 — MindStudio: Workflow State vs. Session State

URL: https://www.mindstudio.ai/blog/workflow-state-vs-session-state-ai-agents

- authority: authoritative-guide

Separa os dois tipos de estado — o estado de sessão, o contexto descartável da conversa atual, e o estado do workflow, o histórico da tarefa que sobrevive a ela — e defende que a máquina de estados é a forma mais clara de modelar o segundo.

Citação principal:
> "Claude Code uses a file called CLAUDE.md in projects as a form of persistent workflow context — a place to store project-specific instructions, conventions, and state that survives across sessions."

## S12 — MachineLearningMastery: 5 Architectural Patterns for Persistent Memory and State in AI Agents

URL: https://machinelearningmastery.com/5-architectural-patterns-for-persistent-memory-and-state-in-ai-agents/

- authority: authoritative-guide

Distingue estado de memória — o estado é o retrato da tarefa atual, a memória é o que foi aprendido com as anteriores — e mostra como os checkpoints salvam o estado do workflow para que uma execução possa continuar.

Citação principal:
> "State is a snapshot. It's everything the agent currently knows about a task right now: what step it's on, what the last tool call returned, what variables it's tracking."

## S13 — Appamass: State Management Patterns for Reliable AI Agent Workflows

URL: https://appamass.com/en/blog/state-management-patterns-for-reliable-ai-agent-workflows-5yemlru6ui6cacast3l5

- authority: blog

Como manter o estado fora da janela de contexto nativa do modelo: representar a situação atual como um objeto simples, para que ela continue estruturada e consultável, e depois persisti-la para permitir a recuperação.

Citação principal:
> "Using Plain Old Java Objects (POJOs) or similar structures to represent the 'current situation' allows for a structured, queryable state."

## S14 — Ranjan Kumar: Building Agents That Remember

URL: https://ranjankumar.in/building-agents-that-remember-state-management-in-multi-agent-ai-systems

- authority: blog

Apresenta a árvore de memória de tarefas — uma hierarquia em que cada nó é um passo com sua ação, entradas, saídas e status — como forma de dar suporte a raciocínio não linear e de gerenciar um workflow.

Citação principal:
> "Store this state externally (Redis, Postgres, etc.) and load it at the start of each agent turn. If the agent crashes, you can resume exactly where it left off."

## S15 — Chrono Innovation: Architecture for Scalable Agentic AI Workflows

URL: https://www.chronoinnovation.com/resources/agentic-ai-workflows-architecture/

- authority: authoritative-guide

Defende tratar a montagem do contexto como uma decisão de projeto por direito próprio: objetos de estado estruturados com campos nomeados, buscados conforme o próximo passo precisa, em vez de um contexto que só se acumula.

Citação principal:
> "Treat context assembly as a first-class operation in your workflow design. One pattern that works well: structured state objects with explicit fields rather than free-form context accumulation."

## S16 — ApX Machine Learning: Task Decomposition Strategies for LLM Agents

URL: https://apxml.com/courses/agentic-llm-memory-architectures/chapter-4-complex-planning-tool-integration/task-decomposition-strategies

- authority: authoritative-guide

A abordagem de referência para a decomposição: pedir ao próprio modelo que a faça, via prompting zero-shot, exemplos few-shot ou chain-of-thought, transformando um objetivo de alto nível em uma sequência de passos.

Citação principal:
> "The most direct approach uses the LLM itself to perform the decomposition. This typically involves prompting the LLM with the high-level goal and asking it to generate a sequence of steps or sub-tasks."

## S17 — ACONIC paper: Systematic LLM Task Decomposition

URL: https://arxiv.org/html/2510.07772v1

- authority: research

Apresenta o ACONIC, que modela uma tarefa como um problema de restrições e usa medidas formais de complexidade para orientar como ela é dividida — o que vale de 10 a 40 pontos percentuais em tarefas combinatórias e de consulta a bancos de dados.

Citação principal:
> "A principled measure of task complexity would enable systematic decomposition strategies and the ability to study tasks of comparable difficulty, and provide guidance on when tools are needed."

## S18 — OneUpTime: How to Create a Task Decomposition

URL: https://oneuptime.com/blog/post/2026-01-30-task-decomposition/view

- authority: blog

Três estratégias de decomposição — sequencial simples, paralela quando as partes são independentes e híbrida para qualquer coisa real — construídas a partir de subtarefas atômicas com as dependências declaradas de forma explícita.

Citação principal:
> "Start with simple sequential decomposition, add parallelism where tasks are independent, and use hybrid approaches for real-world complexity."

## S19 — AI21: What Is Task Decomposition?

URL: https://www.ai21.com/glossary/foundational-llm/task-decomposition/

- authority: official-docs

Como o planejamento hierárquico e o encadeamento de prompts quebram uma tarefa em camadas ordenadas ou módulos paralelos, permitindo que um agente planeje, execute e revise subtarefas com menos alucinações e menos raciocínio desperdiçado.

Citação principal:
> "Hierarchical planning and prompt chaining decompose tasks into ordered layers or parallel modules, enabling LLM agents to plan, execute, and reflect on subtasks efficiently."

## S20 — ClaudFlow: 7 Patterns for Claude Code Workflow Automation

URL: https://claudflow.com/guides/claude-code-workflow-automation.html

- authority: authoritative-guide

Sete padrões para o trabalho do dia a dia — code review, refatoração, geração de testes, documentação, diagnóstico de bugs, migração e auditorias de segurança —, cada um transformando um processo feito à mão em algo repetível.

Citação principal:
> "Claude code workflow automation transforms development tasks from inconsistent manual processes into reliable, repeatable pipelines."

## S21 — Kinde: Multi-Agent Workflows for Complex Refactoring

URL: https://www.kinde.com/learn/ai-for-software-engineering/ai-agents/multi-agent-workflows-for-complex-refactoring-orchestrating-ai-teams/

- authority: authoritative-guide

A coordenação de vários agentes ao longo de uma refatoração grande — um na análise de arquitetura, um na migração de código, um na validação dos testes — com exemplos resolvidos em Autogen e CrewAI.

Citação principal:
> "Learn to coordinate multiple AI agents for large-scale refactoring projects—one for architecture analysis, another for code migration, and a third for test validation."

## S22 — RefAgent paper: A Multi-Agent LLM Framework for Automated Software Refactoring

URL: https://arxiv.org/html/2511.03153v1

- authority: research

O RefAgent espelha a sequência que uma refatoração humana segue, dividindo o trabalho entre agentes: planejamento, transformação, validação e correção iterativa por meio de raciocínio e colaboração.

Citação principal:
> "RefAgent orchestrates an end-to-end workflow that includes planning, transformation, validation, and iterative correction through reasoning and collaboration."
