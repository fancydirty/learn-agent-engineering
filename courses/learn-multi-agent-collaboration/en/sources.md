# Sources

## S1 — How we built our multi-agent research system (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

A first-hand technical blog post from Anthropic's engineering team detailing the architecture of Claude Research, a production-grade multi-agent system: the orchestrator-subagent division of labor, prompt design principles, failure modes, and evaluation methods. This course's claims about "what a multi-agent system is," "what a subagent prompt should contain," the effort-scaling rule, citation/result integration, token cost, and which tasks suit parallelization all come from this article.

Key quote:

> "A multi-agent system consists of multiple agents (LLMs autonomously using tools in a loop) working together."

> "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries. Without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information."

> "spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, and distracting each other with excessive updates"

> "Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each, and complex research might use more than 10 subagents with clearly divided responsibilities."

> "a CitationAgent, which processes the documents and research report to identify specific locations for citations. This ensures all claims are properly attributed to their sources."

> "We used an LLM judge that evaluated each output against criteria in a rubric: factual accuracy (do claims match sources?), citation accuracy (do the cited sources match the claims?), completeness (are all requested aspects covered?), source quality (did it use primary sources over lower-quality secondary sources?), and tool efficiency (did it use the right tools a reasonable number of times?)."

> "We started by allowing the lead agent to give simple, short instructions like 'research the semiconductor shortage,' but found these instructions often were vague enough that subagents misinterpreted the task or performed the exact same searches as other agents."

> "In our data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats. For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance."

> "Subagent output to a filesystem to minimize the 'game of telephone.' Direct subagent outputs can bypass the main coordinator for certain types of results, improving both fidelity and performance."

> "most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time. We've found that multi-agent systems excel at valuable tasks that involve heavy parallelization, information that exceeds single context windows, and interfacing with numerous complex tools."

> "the lead agent spins up 3-5 subagents in parallel rather than serially"

> "These changes cut research time by up to 90% for complex queries"

> "Subagents facilitate compression by operating in parallel with their own context windows ... Each subagent also provides a separation of concerns—distinct tools, prompts, and exploration trajectories—which reduces path dependency"

## S2 — Building effective agents (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

Anthropic's first-hand guide on when to use a workflow, when to use an agent, and how to define each orchestration pattern — covering the official definitions of prompt chaining, orchestrator-workers, and evaluator-optimizer (producer-reviewer), plus the core advice to start simple and add complexity only when it's demonstrably worth it. This course's claims about the taxonomy of collaboration patterns and "when not to use multiple agents" come from this article.

Key quote:

> "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."

> "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."

> "Prompt chaining decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one."

> "one LLM call generates a response while another provides evaluation and feedback in a loop."

> "Reviewing a piece of code for vulnerabilities, where several different prompts review and flag the code if they find a problem."

> "you should consider adding complexity only when it demonstrably improves outcomes."

## S3 — Create custom subagents (Claude Code Docs)

URL: https://code.claude.com/docs/en/sub-agents

- authority: official-docs

Claude Code's official docs explain a subagent's context-isolation mechanism, the required frontmatter fields, how delegation is triggered, and how results are returned. This course's claims about "why a subagent can't see your conversation history," "delegation is triggered by the description field," and "only the conclusion is returned" all come from this document.

Key quote:

> "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read. Claude composes a delegation message that summarizes the task, and the subagent works from there."

> "When subagents complete, their results return to your main conversation. Running many subagents that each return detailed results can consume significant context."

> "The following fields can be used in the YAML frontmatter. Only name and description are required."

> "Claude automatically delegates tasks based on the task description in your request, the description field in subagent configurations, and current context."

> "Each subagent completes its task and returns results to Claude, which then passes relevant context to the next subagent."

> "A fork is a subagent that inherits the entire conversation so far instead of starting fresh... The fork's own tool calls still stay out of your conversation and only its final result comes back, so your main context window stays clean."

## S4 — Agents (OpenAI Agents SDK)

URL: https://openai.github.io/openai-agents-python/agents/

- authority: official-docs

The section on multi-agent orchestration patterns in the OpenAI Agents SDK docs, defining the Manager (agents-as-tools) and Handoffs patterns. This course's "collaboration patterns" section uses it to contrast another common division of labor beyond orchestrator-worker.

Key quote:

> "Manager (agents as tools): A central manager/orchestrator invokes specialized sub‑agents as tools and retains control of the conversation."

> "Handoffs: Peer agents hand off control to a specialized agent that takes over the conversation. This is decentralized."

## S5 — Handoffs (OpenAI Agents SDK)

URL: https://openai.github.io/openai-agents-python/handoffs/

- authority: official-docs

The detailed explanation of the Handoffs mechanism in the OpenAI Agents SDK docs, covering how a new agent takes over the conversation after a handoff and the boundary that a handoff stays within a single run. This course uses it to explain the key difference in context passing between handoff-style and orchestrator-worker-style collaboration.

Key quote:

> "Handoffs stay within a single run."

> "When a handoff occurs, it's as though the new agent takes over the conversation, and gets to see the entire previous conversation history."

## S6 — Best practices for Claude Code (Claude Code Docs)

URL: https://code.claude.com/docs/en/best-practices

- authority: official-docs

Claude Code's official best-practices doc, whose "trust-then-verify gap" section directly names the failure mode where a model's output looks plausible but isn't necessarily correct, and gives the response: verify it yourself, and if you can't verify it, don't trust it. This course's core claim in the "a subagent claiming it's done can't be trusted" section comes from this document.

Key quote:

> "The trust-then-verify gap. Claude produces a plausible-looking implementation that doesn't handle edge cases. Fix: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."

> "Claude stops when the work looks done. Without a check it can run, \"looks done\" is the only signal available, and you become the verification loop: every mistake waits for you to notice it."

> "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result."

## S7 — Effective context engineering for AI agents (Anthropic Engineering)

URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

- authority: authoritative-guide

Anthropic's first-hand guide on context engineering, giving the direct account of "context rot" and the "attention budget": the more tokens in the context window, the lower the model's ability to accurately recall information from it, and every new token depletes a finite attention budget. It also clarifies that this degradation is a gradient, not a cliff. This course's claims in the "context pollution" and "attention dilution" sections rest on this article.

Key quote:

> "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"

> "LLMs have an 'attention budget' that they draw on when parsing large volumes of context. ... Every new token introduced depletes this budget by some amount"

> "these factors create a performance gradient rather than a hard cliff"

## S8 — Using the Messages API (Claude API)

URL: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

- authority: official-docs

The official docs state plainly that the Messages API is stateless: every request must carry the full conversation history, and the API keeps no state between requests. This is the implementation premise for lesson 6's "every call must write the task and the previous round's information into the prompt verbatim."

Key quote:

> "The Messages API is stateless, which means that you always send the full conversational history to the API."

## S9 — Structured outputs (Claude API)

URL: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

- authority: official-docs

The official docs explain that without structured outputs, even carefully prompted, the model can still produce malformed JSON (syntax errors, missing fields, inconsistent types); structured outputs use constrained sampling to guarantee the response strictly matches the schema. This is the premise for lesson 6's "the reviewer is asked to return only JSON but you still need defensive parsing" section.

Key quote:

> "Structured outputs constrain Claude's responses to follow a specific schema, ensuring valid, parseable output for downstream processing."

> "Without structured outputs, Claude can generate malformed JSON responses or invalid tool inputs that break your applications. Even with careful prompting, you may encounter: Parsing errors from invalid JSON syntax"
