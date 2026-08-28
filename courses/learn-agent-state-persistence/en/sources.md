# Sources

The key claims in this course rest on the sources below. The lessons cite them with `[^Sn]`; the exact excerpts sit under each entry.

## S1 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Anthropic's engineering retrospective on its multi-agent research system, and this course's core basis: agents are stateful and errors compound; you can't restart from scratch — you have to resume from where the error hit; reliability comes from pairing the model's adaptability with deterministic safeguards like retry logic and regular checkpoints; and at deploy time a running agent may be anywhere in its process.

Key quote:
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

The official docs for Claude Code's checkpointing, showing the complete product-grade shape of checkpoint/rewind/fork: an automatic checkpoint before every user prompt, saved with the conversation, conversation and code restorable separately, bash-made changes untracked, and no substitute for version control. This course uses it as a product-grade reference point, not as the tool being taught.

Key quote:
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

Anthropic's authoritative article on agent patterns. This course uses it for: agents pausing at checkpoints for human feedback, the higher costs and compounding errors that autonomy brings, the limited trust across many turns, and the proportion rule — add complexity only when it demonstrably improves outcomes.

Key quote:
> "Agents can then pause for human feedback at checkpoints or when encountering blockers."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."
> "you should consider adding complexity only when it demonstrably improves outcomes."

## S4 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

Gives the field spec and pairing rule for the tool_use and tool_result content blocks: every tool_use must get a matching tool_result, all returned together. The resume lesson depends on this rule to handle the dangling call left when a crash lands between tool execution and ledger write.

Key quote:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

A community open-source roadmap organized around harness engineering (AI-assisted writing). This course takes only its framing claims: persistence is one component of the harness, and its job is "checkpoint state every node so you can resume, rewind, fork." Note: its percentage thresholds, token figures, benchmark scores, salary numbers, and other specifics are never cited as fact.

Key quote:
> "the harness is the union of:"
> "persistence. Checkpoint state every node so you can resume, rewind, fork."
> "Same model, different harness, completely different result."
