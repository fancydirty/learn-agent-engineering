# Sources

<!-- registry: A8 -->

## S1 — Anthropic: Building effective agents
URL: https://www.anthropic.com/engineering/building-effective-agents
- authority: official-docs
- supports: Supports the definition of an agent as a model using tools in a loop against environmental feedback, the distinction from a predefined workflow, and the cost/latency/compounding-error trade that delegation buys.
- key-fact: "Agents dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks." Also: "They are typically just LLMs using tools based on environmental feedback in a loop." Also: "The autonomous nature of agents means higher costs, and the potential for compounding errors." Also: "include stopping conditions (such as a maximum number of iterations) to maintain control." Published 2024-12-19.

## S2 — Anthropic: Effective harnesses for long-running agents
URL: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- authority: official-docs
- supports: Supports the three named long-run failure patterns taught in Lesson 3 — attempting the whole task in one pass, a later session declaring the job done on seeing prior progress, and marking work complete without verifying it end to end.
- key-fact: "the agent tended to try to do too much at once—essentially to attempt to one-shot the app". Also: "a later agent instance would look around, see that progress had been made, and declare the job done". Also, on a third pattern: "Claude's tendency to mark a feature as complete without proper testing". Also, on the progress file used against the second pattern: the initializer agent sets up "a claude-progress.txt file that keeps a log of what agents have done", and every later session is asked to "make incremental progress, then leave structured updates". Published 2025-11-26.

## S3 — Anthropic: Harness design for long-running application development
URL: https://www.anthropic.com/engineering/harness-design-long-running-apps
- authority: official-docs
- supports: Supports that coherence degrades over a long run as context fills, that agents can wrap up prematurely near a perceived context limit, and — the core claim of Lesson 4 — that an agent asked to judge its own work tends to praise it.
- key-fact: "models tend to lose coherence on lengthy tasks as the context window fills". Also: "Some models also exhibit 'context anxiety,' in which they begin wrapping up work prematurely as they approach what they believe is their context limit." Also: "When asked to evaluate work they've produced, agents tend to respond by confidently praising the work—even when, to a human observer, the quality is obviously mediocre." Also: "Applications from earlier harnesses often looked impressive but still had real bugs when you actually tried to use them." Published 2026-03-24.

## S4 — Anthropic: How we built Claude Code auto mode
URL: https://www.anthropic.com/engineering/claude-code-auto-mode
- authority: official-docs
- supports: Supports Lesson 2's scope-escalation mechanism with vendor-logged real incidents, the blast-radius framing, and Lesson 5's approval-fatigue warning.
- key-fact: "We keep an internal incident log focused on agentic misbehaviors. Past examples include deleting remote git branches from a misinterpreted instruction, uploading an engineer's GitHub auth token to an internal compute cluster, and attempting migrations against a production database. Each of these was the result of the model being overeager, taking initiative in a way the user didn't intend." Also, on scope escalation: "A user asked to 'clean up old branches.' The agent listed remote branches, constructed a pattern match, and issued a delete." Also: "The action instead looks like reasonable problem-solving, only applied past the boundary of what the user authorized or intended." Also: "Over time that leads to approval fatigue, where people stop paying close attention to what they're approving." Published 2026-03-25.

## S5 — Anthropic: Computer use tool (API documentation)
URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- authority: official-docs
- supports: Supports Lesson 4's instruction to review actions and logs rather than the final answer, Lesson 3's claim that an agent may assume a step worked without checking, and Lesson 2's stopping-condition and reversibility guidance.
- key-fact: "Always carefully review and verify Claude's computer use actions and logs. Do not use Claude for tasks requiring perfect precision or sensitive user information without human oversight." Also: "Claude sometimes assumes outcomes of its actions without explicitly checking their results." Also, on the iteration limit: "This safeguard prevents potential infinite loops that could result in unexpected API costs." Also: "Asking a human to confirm decisions that might result in meaningful real-world consequences". Retrieved 2026-08-23; page carries no visible last-updated date.

## S6 — METR: Measuring AI Ability to Complete Long Tasks
URL: https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/
- authority: authoritative-guide
- supports: Supports Lesson 3's claim that measured success falls as a task's length grows, and that the binding constraint is chaining steps rather than per-step skill.
- key-fact: "current models have almost 100% success rate on tasks taking humans less than 4 minutes, but succeed <10% of the time on tasks taking more than around 4 hours". Also: "AI agents often seem to struggle with stringing together longer sequences of actions more than they lack skills or knowledge needed to solve single steps." Published 2025-03-19; the figures cited cover models measured through Nov 2025.

## S7 — METR: Time Horizons
URL: https://metr.org/time-horizons/
- authority: authoritative-guide
- supports: Supports the definition of a 50% time horizon used in Lesson 3 to give the reader a length-based way to size a first task, and the caveat that the longest measurements are unreliable.
- key-fact: "the 50%-time horizon is the duration at which an agent is predicted to succeed half the time." Also: "Measurements above 16 hrs are unreliable with our current task suite". Page last updated 2026-05-08.

## S8 — Anthropic: How we built our multi-agent research system
URL: https://www.anthropic.com/engineering/multi-agent-research-system
- authority: official-docs
- supports: Supports Lesson 1's compounding-error claim and Lesson 5's list of observable runaway behaviours that justify interrupting a run.
- key-fact: "Agents are stateful and errors compound." Also: "One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes." Also, on observed failures: "spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources". Also: "agents continuing when they already had sufficient results". Published 2025-06-13.

## S9 — OpenAI: Codex agent approvals and security
URL: https://learn.chatgpt.com/docs/agent-approvals-security.md
- authority: official-docs
- supports: Supports Lesson 2's two-axis frame — capability limits and approval gates are separate controls — and the point that a default work area is typically the current folder.
- key-fact: "Sandbox mode: What Codex can do technically (for example, where it can write and whether it can reach the network) when it executes model-generated commands." Also: "Approval policy: When Codex must ask you before it executes an action (for example, leaving the sandbox, using the network, or running commands outside a trusted set)." Also: "Locally, Codex uses an OS-enforced sandbox that limits what it can touch (typically to the current workspace), plus an approval policy that controls when it must stop and ask you before acting." Retrieved 2026-08-23; page carries no visible publication date.

## S10 — Anthropic: Configure permissions (Claude Code documentation)
URL: https://code.claude.com/docs/en/permissions
- authority: official-docs
- supports: Supports Lesson 2's claim that an approval gate is a three-way choice rather than an on/off switch, and that a blocking rule is evaluated before a permitting one.
- key-fact: "Allow rules let Claude Code use the specified tool without manual approval. Ask rules prompt for confirmation whenever Claude Code tries to use the specified tool. Deny rules prevent Claude Code from using the specified tool." Also: "Rules are evaluated in order: deny, then ask, then allow." Retrieved 2026-08-23; page is versioned rather than dated.

## S11 — GitHub: Managing agent sessions
URL: https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents
- authority: official-docs
- supports: Supports Lesson 4's claim that a second vendor treats the action log — not the agent's written summary — as the reviewable record, and Lesson 5's point that a run can be redirected without being stopped.
- key-fact: "Session logs show Copilot's internal reasoning and the tools it used to understand your repository, make changes, and validate its work." Also: "Each commit message includes a link to the session logs, so you can trace why a change was made during code review or an audit." Also: "If Copilot is heading in the wrong direction, or you realize your original prompt needs adjusting, you can redirect it without stopping the session." Retrieved 2026-08-23; page carries no visible publication date.

## S12 — Anthropic: Scaling Managed Agents
URL: https://www.anthropic.com/engineering/managed-agents
- authority: official-docs
- supports: Supports Lesson 4's argument that without an action-level record, different causes of failure are indistinguishable from the outside — stated as a problem Anthropic's own engineers hit.
- key-fact: "a session (the append-only log of everything that happened)". Also: "Our only window in was the WebSocket event stream, but that couldn't tell us where failures arose, which meant that a bug in the harness, a packet drop in the event stream, or a container going offline all presented the same." Published 2026-04-08.
