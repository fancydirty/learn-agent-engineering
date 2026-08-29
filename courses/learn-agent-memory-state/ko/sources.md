# 참고 자료

## S1 — Context windows

URL: https://platform.claude.com/docs/en/build-with-claude/context-windows

- authority: official-docs

Anthropic 공식 문서는 모델의 작업 기억인 '컨텍스트 윈도우'가 무엇으로 이루어지는지 설명합니다. 시스템 프롬프트, 모든 메시지(툴 결과, 이미지, 문서 포함), 툴 정의, 그리고 그 턴에서 모델이 스스로 생성한 출력(확장 사고 포함)까지 모두 포함됩니다. 또한 '컨텍스트 로트'(토큰 수가 늘수록 정확도와 회수율이 떨어지는 현상)를 정의하고, 각 응답이 usage 필드로 소비량을 보고한다는 점을 짚습니다. 레슨 1('컨텍스트 윈도우가 에이전트가 가진 메모리의 전부')의 핵심 근거이자 레슨 2('대화 히스토리은 늘어나기만 한다')의 배경 근거입니다.

핵심 인용:
> "As token count grows, accuracy and recall degrade, a phenomenon known as *context rot*. This makes curating what's in context just as important as how much space is available."
> "Everything in the request counts toward the context window: the system prompt, every message in messages (including tool results, images, and documents), and your tool definitions. The output Claude generates for the turn, including its extended thinking, counts too."
> "As the conversation advances through turns, each user message and assistant response accumulates within the context window, and previous turns are preserved completely."
> "The context window (up to 1M tokens, depending on the model) holds the conversation history plus the new output Claude generates."
> "Every response reports what the request consumed in its `usage` field."

## S2 — Context engineering: memory, compaction, and tool clearing

URL: https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools

- authority: official-docs

Anthropic 공식 쿡북은 컨텍스트 비대화를 다루는 세 가지 메커니즘을 정확하게 정의합니다. compaction(윈도우 전체를 고충실도 요약으로 응축하며, 요약 추론 한 번의 비용이 든다), tool-result clearing(호출 기록은 남긴 채 오래되고 다시 가져올 수 있는 툴 결과만 버린다), memory 툴 프리미티브(정보를 윈도우 밖으로 옮겨 세션을 넘어 살아남게 한다)입니다. 이들은 따로 쓸 수도 있고 함께 쓸 수도 있으며, clearing과 compaction은 현재 컨텍스트에만 작용해 새 세션에는 도움이 되지 않는다는 점을 설명합니다. 레슨 2('대화 히스토리 관리')의 핵심 근거이자 레슨 3, 4, 6의 배경입니다.

핵심 인용:
> "Compaction distills the contents of a context window into a high-fidelity summary, letting the agent continue with minimal performance degradation when the conversation gets long."
> "Tool-result clearing addresses the bloat from tool use itself. As an agent pulls in tools and calls them, the results pile up, and deciding how much of that tool output to keep becomes an increasingly important part of managing context. Clearing drops old, re-fetchable results while keeping the record that the call happened."
> "A rough mental model for prioritizing: compaction compresses the whole window when it grows too large, clearing drops stale re-fetchable data inside the window, and memory moves information out of the window so it survives across sessions."
> "Compaction | compact_20260112 | compact-2026-01-12 | Token threshold (server-side, min 50K) | trigger (default 150K), instructions, pause_after_compaction"
> "Tool clearing | clear_tool_uses_20250919 | context-management-2025-06-27 | Token threshold (server-side) | trigger (default 100K), keep (default 3 tool uses), clear_at_least, exclude_tools, clear_tool_inputs"
> "The summary preserves key decisions and facts but may drop specific numbers or exact phrasing. It costs inference (the summarizer model runs), but handles all context growth, not just tool results."
> "Clearing and compaction both operate on the current context; neither helps when a new session starts and the window is empty. Memory solves that problem."
> "Compaction is a _whole-transcript_ operation: user messages, assistant messages, tool calls, tool results, even prior compaction blocks are all flattened into the summary."
> "This cookbook works through how to think about designing with them: when each one applies, how to configure them, what changes when you use them independently vs. together, and sample use-cases where different combinations make sense."

## S3 — How Claude remembers your project

URL: https://code.claude.com/docs/en/memory

- authority: official-docs

Anthropic 공식 문서는 서로 보완하는 두 가지 메모리 메커니즘을 설명합니다. CLAUDE.md는 사람이 작성하며 모든 세션 시작 시 전체가 로드됩니다(권장 목표는 200줄 미만, 실제 하드 한계는 4 MiB이며 그 이상이면 파일이 통째로 건너뛰어짐). Auto memory는 Claude가 MEMORY.md 인덱스와 필요할 때 읽는 토픽 파일로 작성하며, 인덱스의 처음 200줄 또는 25KB만 세션마다 로드되고 토픽 파일은 필요할 때 읽어 들입니다. 또한 블록 수준 HTML 주석은 주입 전에 제거되며, 프로젝트 루트의 CLAUDE.md는 /compact 이후 다시 읽혀 재주입된다는 점도 짚습니다. 레슨 3('외부 메모리: 파일과 조회')의 핵심 근거이며 레슨 5와 6에서 재사용됩니다.

핵심 인용:
> "CLAUDE.md files are loaded into the context window at the start of every session, consuming tokens alongside your conversation... **Size**: target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence."
> "Claude Code loads a CLAUDE.md file of up to 4 MiB in full and skips a larger file. Shorter files produce better adherence."
> "Block-level HTML comments (`<!-- maintainer notes -->`) in CLAUDE.md files are stripped before the content is injected into Claude's context."
> "The first 200 lines of MEMORY.md, or the first 25KB, whichever comes first, are loaded at the start of every conversation. Content beyond that threshold is not loaded at session start."
> "Claude Code doesn't load topic files such as `user_role.md` or `feedback_testing.md` at startup. Claude reads them on demand using its standard file tools when it needs the information."
> "Project-root CLAUDE.md survives compaction: after /compact, Claude re-reads it from disk and re-injects it into the session."
> "Who writes it | You | Claude" / "Loaded into | Every session | Every session (first 200 lines or 25KB)"

## S4 — Track todos

URL: https://code.claude.com/docs/en/agent-sdk/todo-tracking

- authority: official-docs

Anthropic 공식 문서는 에이전트 실행 중 todo의 전체 수명 주기(Created, Activated, Completed, Removed)를 정의하고, 이 상태가 메시지 스트림에서 관찰 가능한 구조화된 툴 호출(TaskCreate / TaskUpdate)로 노출된다는 점을 설명합니다. 레슨 4('구조화된 상태')의 핵심 근거입니다.

핵심 인용:
> "Claude moves each todo through a predictable lifecycle:\n\n1. **Created**: Claude adds the todo as pending when it identifies a task\n2. **Activated**: Claude sets the todo to in_progress when it starts the work\n3. **Completed**: Claude marks it completed when the task finishes successfully\n4. **Removed**: Claude deletes a todo it no longer needs by setting status: \"deleted\" in a TaskUpdate call"
> "In a session that has the task-tracking tools, Claude keeps a written todo list, updating each item's status as it works. You see each change in the message stream as a structured tool call."

## S5 — Memory Is a Feature. It Is Also an Attack Surface

URL: https://genai.owasp.org/2026/05/13/memory-is-a-feature-it-is-also-an-attack-surface/

- authority: authoritative-guide

OWASP Gen AI Security Project 공식 블로그에 ASI06(memory and context poisoning) 항목의 공동 리드가 게시한 이 글은 Cisco 연구팀이 공개한 MemoryTrap 취약점을 예로 듭니다. 무해해 보이는 루틴(리포지터리 클론, 의존성 설치 승인)이 악성 페이로드를 지속 메모리, 전역 훅 설정, 나아가 시스템 프롬프트를 통한 고신뢰 지시 계층까지 도달하게 만들어, 한 번의 동작이 세션과 프로젝트를 넘어 모델의 향후 동작을 바꿀 수 있음을 보입니다. 또한 Cisco의 공개 이후 Anthropic이 Claude Code v2.1.50에서 시스템 프롬프트에서 사용자 메모리를 제거했다는 점도 짚습니다. 레슨 5('메모리의 경계와 안전성')의 핵심 근거이며, 레슨 6에서 지속 메모리 계층의 보안 설계에 재사용됩니다.

핵심 인용:
> "Agentic systems do not just respond in the moment. They retain context, reuse memory, and rely on persistent state to guide future reasoning and actions. That is what makes them useful. It is also what makes them vulnerable."
> "In the vulnerability we called MemoryTrap, we found that a routine developer workflow could turn into persistent prompt injection. The path was surprisingly ordinary: clone a repository, let the agent help, approve a dependency installation, and move on."
> "Instead, it reached persistent memory, the global hooks configuration, and even influenced a highly trusted instruction layer through the system prompt. In other words, a one-time action could shape the model's future behavior across sessions, projects, and even reboots."
> "To Anthropic's credit, after we at Cisco disclosed the issue, Claude Code v2.1.50 removed user memories from the system prompt, reducing the specific high-trust override path we identified. That was the right fix for the path we found."
> "Once malicious content reaches trusted surfaces like memory, hooks, or configuration, the attacker is no longer just influencing one response. They are influencing future reasoning."
> "That is why MemoryTrap maps so clearly to ASI06: Memory & Context Poisoning."

## S6 — Using the Messages API

URL: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

- authority: official-docs

공식 문서는 Messages API가 스테이트리스라는 점을 분명히 밝힙니다. 모든 요청은 전체 대화 히스토리을 실어 보내야 하며, API는 요청 사이에 어떤 상태도 보관하지 않습니다. 레슨 1의 핵심 주장('API 호출은 스테이트리스')의 직접 근거이자, 세션이 끝나면 진행 기록이 윈도우와 함께 사라진다는 레슨 4의 전제를 뒷받침합니다.

핵심 인용:
> "The Messages API is stateless, which means that you always send the full conversational history to the API."

## S7 — Handle tool calls

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

공식 문서는 툴 호출의 짝 규칙을 제시합니다. tool_result 블록은 대응하는 tool_use 블록 바로 뒤에 와야 하며, 짝이 깨지면 요청이 오류로 실패합니다. 레슨 2('잘라내기는 tool_use/tool_result 짝을 끊어서는 안 된다')의 직접 근거이자 레슨 6의 splitKeepingToolPairs 설계 동기입니다.

핵심 인용:
> "Tool result blocks must immediately follow their corresponding tool use blocks in the message history. You cannot include any messages between the assistant's tool use message and the user's tool result message."
> "If you receive an error like \"tool_use ids were found without tool_result blocks immediately after\", check that your tool results are formatted correctly."

## S8 — Compaction

URL: https://platform.claude.com/docs/en/build-with-claude/compaction

- authority: official-docs

공식 문서는 서버 측 요약 compaction의 파라미터 세부를 제시합니다. 최소 트리거 임계값은 50,000 토큰(서버 강제), 긴 대화에서는 compaction이 여러 번 일어날 수 있다는 점, 마지막 compaction 블록이 프롬프트의 최종 상태를 반영한다는 점, 그리고 하나의 요청 안에서 compaction이 두 번 이상 발생할 수 있다는 점입니다. 레슨 2의 compaction 세부의 직접 근거입니다.

핵심 인용:
> "`input_tokens` is the only supported trigger type. `value` must be at least 50,000 tokens."
> "A long-running conversation might result in multiple compactions. The last compaction block reflects the final state of the prompt, replacing content prior to it with the generated summary."
> "Compaction might occur multiple times within a single request depending on your trigger threshold and the amount of output generated."

## S9 — How tool use works

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

공식 문서는 stop_reason이 이끄는 툴 실행 루프 명세를 제시합니다. 모델은 스스로 아무것도 실행하지 않고 구조화된 요청만 발행하며, 호스트가 이를 실행해 결과를 되돌려 보냅니다. stop_reason이 여전히 tool_use인 동안 루프는 계속됩니다. 레슨 6의 '출발점: 툴 호출 코스의 실행 루프' 단락의 직접 근거입니다.

핵심 인용:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."
