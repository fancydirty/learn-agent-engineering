# 참고 자료

이 코스의 핵심 사실과 정의는 모두 다음 자료에 근거합니다. 인용문은 영어 원문 그대로 싣습니다.

## S1 — Claude Code 문서: Workflows

URL: https://code.claude.com/docs/en/workflows

- authority: official-docs

Claude Code의 공식 워크플로 페이지입니다. 동적 워크플로가 스크립트에서 여러 서브에이전트를 구동하는 방식을 설명하며, 대규모 코드베이스 감사, 광범위한 마이그레이션, 교차 검증이 필요한 조사에 맞는 형태를 제시합니다.

핵심 인용:
> "Reach for a workflow when a task needs more agents than one conversation can coordinate, or when you want the orchestration codified as a script you can read and rerun."

## S2 — Alex Op: Claude Code Workflows and Deterministic Orchestration

URL: https://alexop.dev/posts/claude-code-workflows-deterministic-orchestration/

- authority: authoritative-guide

결정적 오케스트레이션 패턴을 꼼꼼히 읽어 냅니다. 스크립트가 반복과 분기를 소유하고, 각 `agent()` 호출이 새로운 서브에이전트에게 작업을 넘기며, 모델이 주도하는 부분은 작업 그 자체뿐이라는 구조를 다룹니다.

핵심 인용:
> "A normal agent decides the control flow as it goes. A workflow inverts that. You write the control flow as plain code, and each individual step is delegated to a fresh subagent."

## S3 — ClaudeWorld: What Is a Workflow? Multi-Agent Orchestration Explained

URL: https://claude-world.com/articles/what-is-a-workflow-multi-agent-orchestration/

- authority: authoritative-guide

Claude Code가 단일 에이전트에서 서브에이전트 팬아웃으로, 다시 스크립트 주도 워크플로로 옮겨 간 과정을 추적하고, 네 단계와 오케스트레이션의 핵심 아이디어를 정리합니다.

핵심 인용:
> "Orchestration is exactly what it sounds like: one score, many musicians. A script deciding it — for loop, if statement — is orchestration."

## S4 — MindStudio: Five Claude Code Agentic Workflow Patterns

URL: https://www.mindstudio.ai/blog/claude-code-agentic-workflow-patterns

- authority: authoritative-guide

다섯 가지 워크플로 패턴(순차, 오퍼레이터, 분할·병합, 에이전트 팀, 헤드리스)을 훑고, 각 패턴이 어느 정도의 작업 복잡도에 적합한지 짚습니다.

핵심 인용:
> "Understanding the five core Claude workflow patterns — sequential, operator, split-and-merge, agent teams, and headless — determines how much you can actually get done."

## S5 — Mae Capozzi: Building a Multi-Agent Orchestrator

URL: https://maecapozzi.com/blog/building-a-multi-agent-orchestrator

- authority: blog

전문화된 코딩 에이전트를 위한 6단계 오케스트레이터를 만든 현장 기록입니다. 분산 트레이싱, 단계 기반 오케스트레이션, 프로세스 격리를 사용합니다.

핵심 인용:
> "Phase-based orchestration: Break work into discrete phases (planning, implementation, testing, review) rather than letting agents free-roam."

## S6 — AWS Marketplace: Agent Orchestration

URL: https://aws.amazon.com/marketplace/build-learn/ai-agent-learning-series/agent-orchestration

- authority: official-docs

Step Functions, Bedrock Agents, MWAA를 사용한 멀티 에이전트 오케스트레이션에 대한 AWS 자체 가이드로, 컨트롤 플레인, 상태 관리, 사람의 승인 단계를 다룹니다.

핵심 인용:
> "An orchestrated workflow needs configurable retry policies with exponential backoff and jitter so that transient errors don't permanently fail long-running workflows."

## S7 — Vasanthan: Handling Failures in Agent-Based Workflows

URL: https://medium.com/@vasanthancomrads/handling-failures-in-agent-based-workflows-c0fd9489b2ee

- authority: blog

에이전트 워크플로의 실패 처리(재시도, 폴백, 검증, 서킷 브레이커)를 실무 관점에서 정리합니다. 프로덕션에서 버텨야 하는 시스템을 겨냥한 내용입니다.

핵심 인용:
> "User Input → Agent → Tool Call → Retry → Circuit Breaker → Validation → Fallback (if needed) → Confidence Check → Human-in-loop (optional) → Final Output"

## S8 — Augment Code: How Async AI Agent Workflows Survive Failure

URL: https://www.augmentcode.com/guides/async-ai-agent-workflows

- authority: authoritative-guide

프로덕션 시스템이 사용하는 복구 시퀀스를 다룹니다. 일시적 에러에 대한 지터를 곁들인 지수 백오프, 프로바이더 전환, 보상 액션, 그리고 AWS Step Functions가 에러 처리를 구성하는 방식입니다.

핵심 인용:
> "Retry with exponential backoff and jitter for transient errors (5xx, network timeouts). AWS Step Functions provides error handling with configurable backoff and jitter for retries."

## S9 — Agents Arcade: Error Handling in Agentic Systems

URL: https://agentsarcade.com/blog/error-handling-agentic-systems-retries-rollbacks-graceful-failure

- authority: blog

재시도에서 정말 중요한 경계선을 긋습니다. 상태 없는 모델 호출을 다시 실행하는 것은 값싸지만, 데이터베이스에 쓰거나 메일을 보내는 도구 호출을 다시 실행하는 것은 전혀 다른 문제라는 점입니다.

핵심 인용:
> "Retrying a stateless model call is usually fine. Retrying a tool invocation that writes to a database, sends an email, or triggers a downstream workflow is often a bug disguised as resilience."

## S10 — Temporal: 11 Production Failure Patterns in AI Agent Orchestration

URL: https://www.xgrid.co/resources/temporal-ai-agent-orchestration-failure-patterns/

- authority: authoritative-guide

Temporal 위에 AI 에이전트를 배포할 때 나타나는 열한 가지 실패 패턴을 LLM 오케스트레이션, 재시도, 취소, 부하, 사람 개입 단계별 분석과 해결책과 함께 제시합니다.

핵심 인용:
> "LLM activity retry policies should be defined per error class, not as a single catch-all policy on the activity registration."

## S11 — MindStudio: Workflow State vs. Session State

URL: https://www.mindstudio.ai/blog/workflow-state-vs-session-state-ai-agents

- authority: authoritative-guide

두 종류의 상태를 구분합니다. 현재 대화의 일회성 컨텍스트인 세션 상태와, 그 대화보다 오래 남는 작업 이력인 워크플로 상태입니다. 그리고 후자를 모델링하는 가장 명료한 방법이 상태 머신이라고 주장합니다.

핵심 인용:
> "Claude Code uses a file called CLAUDE.md in projects as a form of persistent workflow context — a place to store project-specific instructions, conventions, and state that survives across sessions."

## S12 — MachineLearningMastery: 5 Architectural Patterns for Persistent Memory and State in AI Agents

URL: https://machinelearningmastery.com/5-architectural-patterns-for-persistent-memory-and-state-in-ai-agents/

- authority: authoritative-guide

상태와 기억을 구분합니다. 상태는 현재 작업의 스냅숏이고 기억은 과거 작업에서 배운 것이라는 관점이며, 체크포인트가 워크플로 상태를 저장해 실행을 재개할 수 있게 하는 방식을 보여 줍니다.

핵심 인용:
> "State is a snapshot. It's everything the agent currently knows about a task right now: what step it's on, what the last tool call returned, what variables it's tracking."

## S13 — Appamass: State Management Patterns for Reliable AI Agent Workflows

URL: https://appamass.com/en/blog/state-management-patterns-for-reliable-ai-agent-workflows-5yemlru6ui6cacast3l5

- authority: blog

모델의 네이티브 컨텍스트 윈도 바깥에서 상태를 유지하는 방법입니다. 현재 상황을 평범한 객체로 표현해 구조화되고 조회 가능한 상태로 두고, 복구를 위해 그것을 영속화합니다.

핵심 인용:
> "Using Plain Old Java Objects (POJOs) or similar structures to represent the 'current situation' allows for a structured, queryable state."

## S14 — Ranjan Kumar: Building Agents That Remember

URL: https://ranjankumar.in/building-agents-that-remember-state-management-in-multi-agent-ai-systems

- authority: blog

작업 기억 트리(각 노드가 액션, 입력, 출력, 상태를 가진 하나의 단계인 계층 구조)를 비선형 추론을 뒷받침하고 워크플로를 관리하는 방법으로 소개합니다.

핵심 인용:
> "Store this state externally (Redis, Postgres, etc.) and load it at the start of each agent turn. If the agent crashes, you can resume exactly where it left off."

## S15 — Chrono Innovation: Architecture for Scalable Agentic AI Workflows

URL: https://www.chronoinnovation.com/resources/agentic-ai-workflows-architecture/

- authority: authoritative-guide

컨텍스트 조립을 그 자체로 하나의 설계 결정으로 다뤄야 한다고 주장합니다. 그냥 쌓이기만 하는 컨텍스트 대신, 이름 붙은 필드를 가진 구조화된 상태 객체를 다음 단계가 필요로 할 때 가져오는 방식입니다.

핵심 인용:
> "Treat context assembly as a first-class operation in your workflow design. One pattern that works well: structured state objects with explicit fields rather than free-form context accumulation."

## S16 — ApX Machine Learning: Task Decomposition Strategies for LLM Agents

URL: https://apxml.com/courses/agentic-llm-memory-architectures/chapter-4-complex-planning-tool-integration/task-decomposition-strategies

- authority: authoritative-guide

분해의 기본 접근법입니다. zero-shot 프롬프팅, few-shot 예시, chain-of-thought를 통해 모델에게 분해를 시켜, 상위 수준의 목표를 단계의 나열로 바꿉니다.

핵심 인용:
> "The most direct approach uses the LLM itself to perform the decomposition. This typically involves prompting the LLM with the high-level goal and asking it to generate a sequence of steps or sub-tasks."

## S17 — ACONIC 논문: Systematic LLM Task Decomposition

URL: https://arxiv.org/html/2510.07772v1

- authority: research

작업을 제약 문제로 모델링하고 형식적 복잡도 척도로 분할 방식을 안내하는 ACONIC을 제시합니다. 조합 문제와 데이터베이스 질의 작업에서 10~40퍼센트포인트의 이득을 얻습니다.

핵심 인용:
> "A principled measure of task complexity would enable systematic decomposition strategies and the ability to study tasks of comparable difficulty, and provide guidance on when tools are needed."

## S18 — OneUpTime: How to Create a Task Decomposition

URL: https://oneuptime.com/blog/post/2026-01-30-task-decomposition/view

- authority: blog

세 가지 분해 전략을 다룹니다. 단순한 순차, 조각이 서로 독립일 때의 병렬, 그리고 현실의 모든 것을 위한 하이브리드이며, 의존 관계를 명시한 원자적 하위 작업으로 조립합니다.

핵심 인용:
> "Start with simple sequential decomposition, add parallelism where tasks are independent, and use hybrid approaches for real-world complexity."

## S19 — AI21: What Is Task Decomposition?

URL: https://www.ai21.com/glossary/foundational-llm/task-decomposition/

- authority: official-docs

계층적 계획 수립과 프롬프트 체이닝이 작업을 순서가 있는 계층이나 병렬 모듈로 쪼개어, 에이전트가 환각과 낭비되는 추론을 줄이면서 하위 작업을 계획하고 실행하고 되짚어 보게 하는 방식을 설명합니다.

핵심 인용:
> "Hierarchical planning and prompt chaining decompose tasks into ordered layers or parallel modules, enabling LLM agents to plan, execute, and reflect on subtasks efficiently."

## S20 — ClaudFlow: 7 Patterns for Claude Code Workflow Automation

URL: https://claudflow.com/guides/claude-code-workflow-automation.html

- authority: authoritative-guide

일상 업무를 위한 일곱 가지 패턴(코드 리뷰, 리팩터링, 테스트 생성, 문서화, 버그 진단, 마이그레이션, 보안 감사)을 다루며, 각각 손으로 돌리던 과정을 반복 가능한 것으로 바꿉니다.

핵심 인용:
> "Claude code workflow automation transforms development tasks from inconsistent manual processes into reliable, repeatable pipelines."

## S21 — Kinde: Multi-Agent Workflows for Complex Refactoring

URL: https://www.kinde.com/learn/ai-for-software-engineering/ai-agents/multi-agent-workflows-for-complex-refactoring-orchestrating-ai-teams/

- authority: authoritative-guide

대규모 리팩터링 전반에서 여러 에이전트를 조율합니다. 하나는 아키텍처 분석, 하나는 코드 마이그레이션, 하나는 테스트 검증을 맡으며, Autogen과 CrewAI로 된 실제 예제가 함께 제시됩니다.

핵심 인용:
> "Learn to coordinate multiple AI agents for large-scale refactoring projects—one for architecture analysis, another for code migration, and a third for test validation."

## S22 — RefAgent 논문: A Multi-Agent LLM Framework for Automated Software Refactoring

URL: https://arxiv.org/html/2511.03153v1

- authority: research

RefAgent는 사람이 리팩터링할 때 따르는 순서를 그대로 반영해 작업을 에이전트들에게 나눕니다. 추론과 협업을 통한 계획 수립, 변환, 검증, 반복 교정입니다.

핵심 인용:
> "RefAgent orchestrates an end-to-end workflow that includes planning, transformation, validation, and iterative correction through reasoning and collaboration."
