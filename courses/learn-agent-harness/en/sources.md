# Sources

The key claims in this course rest on the sources below. The lessons cite them with `[^Sn]`; the exact excerpts sit under each entry.

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

Anthropic engineering's authoritative article on what an agent is, how agents differ from workflows, and how to stay in control — giving the definition of an agent as "tools in a loop," stop conditions, checkpoints, and the costs and compounding errors that autonomy brings. The core basis for this course's loop-and-control theme.

Key quote:
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

Gives the canonical multi-turn loop driven by stop_reason: the model only emits structured requests, the host executes the tools, results flow back, and the loop repeats while stop_reason is still tool_use. The direct basis for the "core loop" lesson.

Key quote:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."

## S3 — Effective context engineering for AI agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

Explains that an agent in a loop keeps accumulating context while the model's "attention budget" is finite and recall degrades as context grows — which is why the loop must be constrained and the context governed. The basis for "why the loop needs boundaries."

Key quote:
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

Defines the excessive-agency risk and names the mitigation explicitly: human-in-the-loop approval for high-impact actions. The basis, in the "intervention and steering" lesson, for putting a human checkpoint before irreversible operations.

Key quote:
> "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction. ... Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken. This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."

## S5 — The 2026 Agent Engineering Roadmap — GitHub (codejunkie99/agent-roadmap-2026)

URL: https://github.com/codejunkie99/agent-roadmap-2026

- authority: blog

An open-source roadmap organized around harness engineering, stating the core thesis — same model, different harness, completely different result — and decomposing the harness into loop control, tool dispatch, context management, and other components. Used to support the framing claim that the harness determines reliability. Note: this source is an AI-assisted community roadmap; its benchmark scores, salary figures, and other specific numbers are not cited as fact — only its framing claims are used.

Key quote:
> "Same model, different harness, completely different result."
> "An agent makes its own control-flow decisions inside a loop."
> "the harness is the union of:"
> "loop control. The while-loop driving model→tools→model."
> "tool dispatch. Registry, schema validation, parallel calls, error recovery, retries."

## S6 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

Gives the exact field spec for the tool_use and tool_result content blocks, plus the rule that parallel calls must return all tool_result blocks together. Used in lesson 6 to construct requests and responses precisely in the hand-written loop.

Key quote:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."
