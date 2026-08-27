# Sources

Every key fact and definition in this course comes from the following materials.

## S1 — Claude Code docs: Workflows

URL: https://code.claude.com/docs/en/workflows

- authority: official-docs

The official Claude Code workflows page, which explains how a dynamic workflow drives several subagents from a script — the shape that fits large codebase audits, wide migrations, and cross-checked research.

Key quote:
> "Reach for a workflow when a task needs more agents than one conversation can coordinate, or when you want the orchestration codified as a script you can read and rerun."

## S2 — Alex Op: Claude Code Workflows and Deterministic Orchestration

URL: https://alexop.dev/posts/claude-code-workflows-deterministic-orchestration/

- authority: authoritative-guide

A close reading of the deterministic orchestration pattern: the script owns the loops and branches, each `agent()` call hands work to a fresh subagent, and only the work itself is model-driven.

Key quote:
> "A normal agent decides the control flow as it goes. A workflow inverts that. You write the control flow as plain code, and each individual step is delegated to a fresh subagent."

## S3 — ClaudeWorld: What Is a Workflow? Multi-Agent Orchestration Explained

URL: https://claude-world.com/articles/what-is-a-workflow-multi-agent-orchestration/

- authority: authoritative-guide

Traces how Claude Code moved from a single agent to subagent fan-out to script-driven workflows, and lays out the four stages plus the core idea of orchestration.

Key quote:
> "Orchestration is exactly what it sounds like: one score, many musicians. A script deciding it — for loop, if statement — is orchestration."

## S4 — MindStudio: Five Claude Code Agentic Workflow Patterns

URL: https://www.mindstudio.ai/blog/claude-code-agentic-workflow-patterns

- authority: authoritative-guide

Walks through five workflow patterns — sequential, operator, split-and-merge, agent teams, and headless — and which task complexity each one suits.

Key quote:
> "Understanding the five core Claude workflow patterns — sequential, operator, split-and-merge, agent teams, and headless — determines how much you can actually get done."

## S5 — Mae Capozzi: Building a Multi-Agent Orchestrator

URL: https://maecapozzi.com/blog/building-a-multi-agent-orchestrator

- authority: blog

A field report on building a six-phase orchestrator for specialized coding agents, using distributed tracing, phase-based orchestration, and process isolation.

Key quote:
> "Phase-based orchestration: Break work into discrete phases (planning, implementation, testing, review) rather than letting agents free-roam."

## S6 — AWS Marketplace: Agent Orchestration

URL: https://aws.amazon.com/marketplace/build-learn/ai-agent-learning-series/agent-orchestration

- authority: official-docs

AWS's own guide to multi-agent orchestration with Step Functions, Bedrock Agents, and MWAA, covering the control plane, state management, and human approval steps.

Key quote:
> "An orchestrated workflow needs configurable retry policies with exponential backoff and jitter so that transient errors don't permanently fail long-running workflows."

## S7 — Vasanthan: Handling Failures in Agent-Based Workflows

URL: https://medium.com/@vasanthancomrads/handling-failures-in-agent-based-workflows-c0fd9489b2ee

- authority: blog

A practical rundown of failure handling in agent workflows — retries, fallbacks, validation, and circuit breakers — aimed at systems that have to hold up in production.

Key quote:
> "User Input → Agent → Tool Call → Retry → Circuit Breaker → Validation → Fallback (if needed) → Confidence Check → Human-in-loop (optional) → Final Output"

## S8 — Augment Code: How Async AI Agent Workflows Survive Failure

URL: https://www.augmentcode.com/guides/async-ai-agent-workflows

- authority: authoritative-guide

The recovery sequence used by production systems: exponential backoff with jitter for transient errors, provider switching, compensating actions, and how AWS Step Functions configures error handling.

Key quote:
> "Retry with exponential backoff and jitter for transient errors (5xx, network timeouts). AWS Step Functions provides error handling with configurable backoff and jitter for retries."

## S9 — Agents Arcade: Error Handling in Agentic Systems

URL: https://agentsarcade.com/blog/error-handling-agentic-systems-retries-rollbacks-graceful-failure

- authority: blog

Draws the line that matters for retries: replaying a stateless model call is cheap, but replaying a tool call that writes to a database or sends mail is a different thing entirely.

Key quote:
> "Retrying a stateless model call is usually fine. Retrying a tool invocation that writes to a database, sends an email, or triggers a downstream workflow is often a bug disguised as resilience."

## S10 — Temporal: 11 Production Failure Patterns in AI Agent Orchestration

URL: https://www.xgrid.co/resources/temporal-ai-agent-orchestration-failure-patterns/

- authority: authoritative-guide

Eleven failure patterns seen when deploying AI agents on Temporal, with analysis and fixes for LLM orchestration, retries, cancellation, load, and human-in-the-loop steps.

Key quote:
> "LLM activity retry policies should be defined per error class, not as a single catch-all policy on the activity registration."

## S11 — MindStudio: Workflow State vs. Session State

URL: https://www.mindstudio.ai/blog/workflow-state-vs-session-state-ai-agents

- authority: authoritative-guide

Separates the two kinds of state — session state, the throwaway context of the current conversation, and workflow state, the task history that outlives it — and argues the state machine is the clearest way to model the latter.

Key quote:
> "Claude Code uses a file called CLAUDE.md in projects as a form of persistent workflow context — a place to store project-specific instructions, conventions, and state that survives across sessions."

## S12 — MachineLearningMastery: 5 Architectural Patterns for Persistent Memory and State in AI Agents

URL: https://machinelearningmastery.com/5-architectural-patterns-for-persistent-memory-and-state-in-ai-agents/

- authority: authoritative-guide

Distinguishes state from memory — state is the snapshot of the current task, memory is what was learned from past ones — and shows how checkpoints save workflow state so a run can resume.

Key quote:
> "State is a snapshot. It's everything the agent currently knows about a task right now: what step it's on, what the last tool call returned, what variables it's tracking."

## S13 — Appamass: State Management Patterns for Reliable AI Agent Workflows

URL: https://appamass.com/en/blog/state-management-patterns-for-reliable-ai-agent-workflows-5yemlru6ui6cacast3l5

- authority: blog

How to hold state outside the model's native context window: represent the current situation as a plain object so it stays structured and queryable, then persist it for recovery.

Key quote:
> "Using Plain Old Java Objects (POJOs) or similar structures to represent the 'current situation' allows for a structured, queryable state."

## S14 — Ranjan Kumar: Building Agents That Remember

URL: https://ranjankumar.in/building-agents-that-remember-state-management-in-multi-agent-ai-systems

- authority: blog

Introduces the task memory tree — a hierarchy where each node is one step with its action, inputs, outputs, and status — as a way to support non-linear reasoning and manage a workflow.

Key quote:
> "Store this state externally (Redis, Postgres, etc.) and load it at the start of each agent turn. If the agent crashes, you can resume exactly where it left off."

## S15 — Chrono Innovation: Architecture for Scalable Agentic AI Workflows

URL: https://www.chronoinnovation.com/resources/agentic-ai-workflows-architecture/

- authority: authoritative-guide

Makes the case for treating context assembly as a design decision in its own right: structured state objects with named fields, fetched as the next step needs them, instead of context that just piles up.

Key quote:
> "Treat context assembly as a first-class operation in your workflow design. One pattern that works well: structured state objects with explicit fields rather than free-form context accumulation."

## S16 — ApX Machine Learning: Task Decomposition Strategies for LLM Agents

URL: https://apxml.com/courses/agentic-llm-memory-architectures/chapter-4-complex-planning-tool-integration/task-decomposition-strategies

- authority: authoritative-guide

The baseline approach to decomposition: ask the model to do it, via zero-shot prompting, few-shot examples, or chain-of-thought, turning a high-level goal into a sequence of steps.

Key quote:
> "The most direct approach uses the LLM itself to perform the decomposition. This typically involves prompting the LLM with the high-level goal and asking it to generate a sequence of steps or sub-tasks."

## S17 — ACONIC paper: Systematic LLM Task Decomposition

URL: https://arxiv.org/html/2510.07772v1

- authority: research

Presents ACONIC, which models a task as a constraint problem and uses formal complexity measures to guide how it gets split — worth 10 to 40 percentage points on combinatorial and database query tasks.

Key quote:
> "A principled measure of task complexity would enable systematic decomposition strategies and the ability to study tasks of comparable difficulty, and provide guidance on when tools are needed."

## S18 — OneUpTime: How to Create a Task Decomposition

URL: https://oneuptime.com/blog/post/2026-01-30-task-decomposition/view

- authority: blog

Three decomposition strategies — plain sequential, parallel where the pieces are independent, and hybrid for anything real — built from atomic subtasks with dependencies stated outright.

Key quote:
> "Start with simple sequential decomposition, add parallelism where tasks are independent, and use hybrid approaches for real-world complexity."

## S19 — AI21: What Is Task Decomposition?

URL: https://www.ai21.com/glossary/foundational-llm/task-decomposition/

- authority: official-docs

How hierarchical planning and prompt chaining break a task into ordered layers or parallel modules, letting an agent plan, run, and review subtasks with fewer hallucinations and less wasted reasoning.

Key quote:
> "Hierarchical planning and prompt chaining decompose tasks into ordered layers or parallel modules, enabling LLM agents to plan, execute, and reflect on subtasks efficiently."

## S20 — ClaudFlow: 7 Patterns for Claude Code Workflow Automation

URL: https://claudflow.com/guides/claude-code-workflow-automation.html

- authority: authoritative-guide

Seven patterns for everyday work — code review, refactoring, test generation, documentation, bug diagnosis, migration, and security audits — each turning a hand-run process into something repeatable.

Key quote:
> "Claude code workflow automation transforms development tasks from inconsistent manual processes into reliable, repeatable pipelines."

## S21 — Kinde: Multi-Agent Workflows for Complex Refactoring

URL: https://www.kinde.com/learn/ai-for-software-engineering/ai-agents/multi-agent-workflows-for-complex-refactoring-orchestrating-ai-teams/

- authority: authoritative-guide

Coordinating several agents across a large refactor — one on architecture analysis, one on code migration, one on test validation — with worked examples in Autogen and CrewAI.

Key quote:
> "Learn to coordinate multiple AI agents for large-scale refactoring projects—one for architecture analysis, another for code migration, and a third for test validation."

## S22 — RefAgent paper: A Multi-Agent LLM Framework for Automated Software Refactoring

URL: https://arxiv.org/html/2511.03153v1

- authority: research

RefAgent mirrors the sequence a human refactor follows, splitting the work across agents: planning, transformation, validation, and iterative correction through reasoning and collaboration.

Key quote:
> "RefAgent orchestrates an end-to-end workflow that includes planning, transformation, validation, and iterative correction through reasoning and collaboration."
