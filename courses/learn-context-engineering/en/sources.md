# Sources

The key claims in this course rest on the sources below. The lessons cite them with `[^Sn]`; the exact excerpts sit under each entry.

## S1 — Effective context engineering for AI agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

Anthropic engineering's authoritative long-form article on context engineering, and this course's core basis: the relationship between context engineering and prompt engineering, the attention budget and context rot, the "altitude" of a system prompt, tools and examples as context, just-in-time retrieval and progressive disclosure, compaction, structured note-taking, and the subagent architecture — nearly every topic in this course comes from it.

Key quote:
> "we view context engineering as the natural progression of prompt engineering"
> "Prompt engineering refers to methods for writing and organizing LLM instructions for optimal outcomes"
> "the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference"
> "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"
> "LLMs have an "attention budget" that they draw on when parsing large volumes of context"
> "Every new token introduced depletes this budget by some amount"
> "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"
> "some models exhibit more gentle degradation than others, this characteristic emerges across all models"
> "These factors create a performance gradient rather than a hard cliff"
> "context, therefore, must be treated as a finite resource with diminishing marginal returns"
> "agents that operate over multiple turns of inference and longer time horizons"
> "engineers hardcoding complex, brittle logic in their prompts to elicit exact agentic behavior"
> "vague, high-level guidance that fails to give the LLM concrete signals for desired outputs"
> "specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics"
> "tools should be self-contained, robust to error, and extremely clear with respect to their intended use"
> "building tools that are well understood by LLMs and have minimal overlap in functionality"
> "returning information that is token efficient and by encouraging efficient agent behaviors"
> "stuff a laundry list of edge cases into a prompt"
> "curate a set of diverse, canonical examples that effectively portray the expected behavior of the agent"
> "maintain lightweight identifiers (file paths, stored queries, web links, etc.)"
> "the metadata of these references provides a mechanism to efficiently refine behavior"
> "allows agents to incrementally discover relevant context through exploration"
> "retrieving some data up front for speed, and pursuing further autonomous exploration at its discretion"
> "CLAUDE.md files are naively dropped into context up front, while primitives like glob and grep"
> "taking a conversation nearing the context window limit, summarizing its contents, and reinitiating a new context window"
> "passing the message history to the model to summarize and compress the most critical details"
> "preserves architectural decisions, unresolved bugs, and implementation details while discarding redundant tool outputs"
> "the agent regularly writes notes persisted to memory outside of the context window"
> "Like Claude Code creating a to-do list, or your custom agent maintaining a NOTES.md file"
> "Claude playing Pokémon demonstrates how memory transforms agent capabilities in non-coding domains"
> "specialized sub-agents can handle focused tasks with clean context windows"
> "returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)"
> "the detailed search context remains isolated within sub-agents"
> "compaction, structured note-taking, and multi-agent architectures"
> "maintain coherence, context, and goal-directed behavior over sequences of actions"

## S2 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

Anthropic's authoritative article on agent patterns. This course uses it for the loop definition of an agent, the costs and compounding errors of autonomy, and the proportion rule — add complexity only when it demonstrably improves outcomes.

Key quote:
> "They are typically just LLMs using tools based on environmental feedback in a loop."
> "The autonomous nature of agents means higher costs, and the potential for compounding errors."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "you should consider adding complexity only when it demonstrably improves outcomes."

## S3 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

Anthropic's engineering retrospective on its multi-agent research system, providing first-hand data on subagent context isolation and token economics: parallel subagents each hold an independent context window, subagents act as "intelligent filters" compressing findings for the lead agent, and the token multipliers for agents and multi-agent systems.

Key quote:
> "Subagents facilitate compression by operating in parallel with their own context windows"
> "distributes work across agents with separate context windows to add more capacity for parallel reasoning"
> "agents typically use about 4× more tokens than chat interactions"
> "multi-agent systems use about 15× more tokens than chats"
> "Multi-agent systems work mainly because they help spend enough tokens to solve the problem."
> "token usage by itself explains 80% of the variance, with the number of tool calls and the model choice"
> "condensing the most important tokens for the lead research agent"
> "The essence of search is compression: distilling insights from a vast corpus."
> "the subagents act as intelligent filters"
> "agents summarize completed work phases and store essential information in external memory"
> "agents can spawn fresh subagents with clean contexts while maintaining continuity through careful handoffs"

## S4 — Best practices for Claude Code — Claude Code Docs

URL: https://code.claude.com/docs/en/best-practices

- authority: official-docs

Claude Code's official best-practices page (anthropic.com/engineering/claude-code-best-practices now 308-redirects here). Shows what context management looks like in a real product: the discipline around CLAUDE.md, /clear and auto-compaction, subagent investigations isolating the main context, and the headline rule that context is the most important resource.

Key quote:
> "Claude's context window fills up fast, and performance degrades as it fills."
> "The context window is the most important resource to manage."
> "This matters since LLM performance degrades as context fills."
> "CLAUDE.md is a special file that Claude reads at the start of every conversation."
> "CLAUDE.md is loaded every session, so only include things that apply broadly."
> "Claude loads them on demand without bloating every conversation."
> "Keep it concise. For each line, ask: "Would removing this cause Claude to make mistakes?" If not, cut it."
> "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"
> "If your CLAUDE.md is too long, Claude ignores half of it because important rules get lost in the noise."
> "reset context between unrelated tasks. Long sessions with irrelevant context can reduce performance."
> "Run /clear between unrelated tasks to reset the context window entirely"
> "During long sessions, Claude's context window can fill with irrelevant conversation, file contents, and commands."
> "Claude Code automatically compacts conversation history when you approach context limits, which preserves important code and decisions while freeing space."
> "Since context is your fundamental constraint, subagents are one of the most powerful tools available."
> "Subagents run in separate context windows and report back summaries"
> "Scope investigations narrowly or use subagents so the exploration doesn't consume your main context."
> "A clean session with a better prompt almost always outperforms a long session with accumulated corrections."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

A community open-source roadmap organized around harness engineering (AI-assisted writing). This course takes only its framing claims: context management as one component of the harness, and its one-line definition of context engineering. Note: its percentage thresholds, token figures, benchmark scores, salary numbers, and other specifics are never cited as fact; "Prompt engineering is dead as a standalone skill in 2026" is that roadmap's opinionated assertion — any citation must attribute it as such, and the course body prefers S1's more careful "natural progression" framing.

Key quote:
> "Same model, different harness, completely different result."
> "the harness is the union of:"
> "context engineering: deciding what tokens are in front of the model at every step of the loop"
> "Prompt engineering is dead as a standalone skill in 2026."
