# 참고 자료

이 코스의 핵심 사실과 정의는 모두 다음 자료에 근거합니다. 인용문은 영어 원문 그대로 싣습니다.

## S1 — Function calling — OpenAI API Guides

URL: https://developers.openai.com/api/docs/guides/function-calling

- authority: official-docs

OpenAI의 도구 호출(function calling)이 근본적으로 애플리케이션과 모델 사이의 여러 단계에 걸친 대화임을 설명합니다. 모델은 호출을 촉발할 뿐이고, 실제 함수 실행은 호출하는 애플리케이션이 해야 합니다.

핵심 인용:
> "Tool calling is a multi-step conversation between your application and a model via the OpenAI API. When the model calls a function, you must execute it and return the result."

## S2 — Tool use with Claude — Overview

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

- authority: official-docs

Claude의 도구 사용 메커니즘을 개괄합니다. 호스트 애플리케이션이 실행하는 "client tools"와 Anthropic의 서버가 실행하는 "server tools"를 구분하고, 도구 호출이 촉발된 뒤의 기본 응답 구조를 제시합니다.

핵심 인용:
> "It then returns a structured call that your application executes (client tools) or that Anthropic executes (server tools). ... Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. Your code executes the operation and sends back a tool_result."

## S3 — Define tools — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools

- authority: official-docs

도구 정의에 반드시 포함되어야 하는 필드(name, description, input_schema)와 각각의 의미를 원문 그대로 제시합니다. 도구 "계약"의 구조에 대한 권위 있는 레퍼런스입니다.

핵심 인용:
> "A user-defined tool definition includes: name — The name of the tool. ... description — A detailed plaintext description of what the tool does, when it should be used, and how it behaves. input_schema — A JSON Schema object defining the expected parameters for the tool."

## S4 — How tool use works — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

모델 자체는 결코 아무것도 실행하지 않으며 구조화된 요청만 내보낼 뿐이고, 실제 실행은 호스트 애플리케이션이나 Anthropic의 서버가 한다는 점을 분명히 밝힙니다. 또한 stop_reason이 이끄는 표준적인 멀티턴 루프를 제시합니다. 이 코스의 핵심 주장을 뒷받침하는 가장 좋은 권위 있는 근거입니다.

핵심 인용:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."

## S5 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

tool_use와 tool_result 콘텐츠 블록의 정확한 필드 사양(id/name/input과 tool_use_id/content/is_error)을 제시합니다. 요청과 응답의 바이트 수준 형태를 가르치는 데 사용합니다.

핵심 인용:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."

## S6 — Tools reference — Claude Code Docs

URL: https://code.claude.com/docs/en/tools-reference

- authority: official-docs

Claude Code가 호스트 애플리케이션으로서 노출하는 내장 도구 목록과, 권한 규칙·서브에이전트 도구 목록·훅 매처에서 쓰이는 정확한 이름을 나열합니다. 실제 호스트 루프 안에서 도구 카탈로그 개념을 이해하는 데 도움이 됩니다.

핵심 인용:
> "Claude Code has access to a set of built-in tools that help it understand and modify your codebase. The tool names are the exact strings you use in permission rules, subagent tool lists, and hook matchers."

## S7 — Tool Use — LM Studio Docs (OpenAI-compatible API)

URL: https://lmstudio.ai/docs/developer/openai-compat/tools

- authority: authoritative-guide

OpenAI 호환 API의 구현 문서로서, 응답에서 tool_calls 배열이 놓이는 정확한 위치와 finish_reason 값 "tool_calls"를 원문 그대로 확인해 줍니다. 공식 가이드가 응답 구조 설명에서 남긴 빈틈을 메웁니다.

핵심 인용:
> "If the model decides that the user message would be best fulfilled with a tool call, an array of tool call request objects will be provided in the response field, choices[0].message.tool_calls. The finish_reason field of the top-level response object will also be populated with "tool_calls"."

## S8 — Writing effective tools for AI agents—using AI agents | Anthropic Engineering

URL: https://www.anthropic.com/engineering/writing-tools-for-agents

- authority: authoritative-guide

좋은 도구 description은 입력과 출력에 대한 모호함을 없애야 한다고 설명하고, 도구가 많다고 해서 에이전트 성능이 좋아지지는 않는다는 점을 지적합니다. 비슷한 도구가 너무 많으면 선택이 오히려 어려워집니다.

핵심 인용:
> "Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs. ... More tools don't always lead to better outcomes."

## S9 — Introducing advanced tool use on the Claude Developer Platform | Anthropic Engineering

URL: https://www.anthropic.com/engineering/advanced-tool-use

- authority: authoritative-guide

구체적인 수치로, 방대한 도구 정의 집합(특히 여러 MCP 서버를 연결한 뒤)이 대화가 시작되기도 전에 얼마나 막대한 컨텍스트 토큰을 소비하는지 보여 줍니다. 또한 중간 도구 결과 역시 모델의 컨텍스트에 통째로 들어가 중요한 정보를 밀어내고 심지어 쫓아낼 수 있음을 설명합니다. 이것이 Tool Search Tool과 프로그래매틱 도구 호출의 동기가 됩니다.

핵심 인용:
> "That's 58 tools consuming approximately 55K tokens before the conversation even starts. ... At Anthropic, we've seen tool definitions consume 134K tokens before optimization."
> "When Claude analyzes a 10MB log file for error patterns, the entire file enters its context window ... These intermediate results consume massive token budgets and can push important information out of the context window entirely."

## S10 — How to implement tool use - Claude Platform Docs

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use

- authority: official-docs

공식 문서가 도구 이름 짓기의 모범 사례를 제시합니다. 모호함을 피하기 위해 서비스 이름을 네임스페이스 접두사로 쓰고, 도구는 내부 참조가 아니라 안정적이고 정보량이 높은 식별자를 반환하게 하라는 것입니다.

핵심 인용:
> "Use meaningful namespacing in tool names. When your tools span multiple services or resources, prefix names with the service (e.g., github_list_prs, slack_send_message). This makes tool selection unambiguous as your library grows, and is especially important when using tool search."

## S11 — Tools - Model Context Protocol

URL: https://modelcontextprotocol.io/docs/concepts/tools

- authority: official-docs

MCP 명세는 프로토콜 에러와 도구 실행 에러를 구분하고, 모델이 스스로 교정하고 재시도할 수 있도록 클라이언트가 실행 가능한 도구 실행 에러를 모델에 전달해야 한다고 요구합니다.

핵심 인용:
> "Clients SHOULD provide tool execution errors to language models to enable self-correction."

## S12 — Specification - Model Context Protocol

URL: https://modelcontextprotocol.io/specification/2025-11-25

- authority: official-docs

공식 명세는 MCP가 Language Server Protocol의 아이디어를 빌려 와 AI 애플리케이션 생태계 전반에서 도구와 컨텍스트의 통합을 표준화한다고 설명합니다. 서로 다른 호스트 애플리케이션이 하나의 균일한 프로토콜로 도구를 노출할 수 있게 됩니다.

핵심 인용:
> "MCP takes some inspiration from the Language Server Protocol, which standardizes how to add support for programming languages across a whole ecosystem of development tools. In a similar way, MCP standardizes how to integrate additional context and tools into the ecosystem of AI applications."

## S13 — What is the Model Context Protocol (MCP)? - Model Context Protocol

URL: https://modelcontextprotocol.io/introduction

- authority: official-docs

공식 소개 페이지가 USB-C 비유를 사용해, MCP가 AI 애플리케이션을 외부 도구 및 데이터 소스에 연결하는 균일하고 표준화된 방법을 어떻게 제공하는지 직관적으로 설명합니다.

핵심 인용:
> "Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect electronic devices, MCP provides a standardized way to connect AI applications to external systems."

## S14 — Creating your first schema - JSON Schema

URL: https://json-schema.org/learn/getting-started-step-by-step

- authority: official-docs

공식 문서가 JSON Schema의 title/description은 의도를 밝힐 뿐 제약을 더하지 않으며, $schema는 어느 버전의 명세를 따르는지 선언한다고 설명합니다. 도구의 입력 파라미터(inputSchema)를 설계하는 근거입니다.

핵심 인용:
> "title and description: state the intent of the schema. These keywords don't add any constraints to the data being validated. ... $schema: specifies which draft of the JSON Schema standard the schema adheres to."

## S15 — Configure permissions - Claude Code Docs

URL: https://code.claude.com/docs/en/permissions

- authority: official-docs

공식 문서로서 Claude Code 권한 규칙의 정확한 문법(allow/deny/ask와 Tool(specifier) 형태)과 평가 순서를 설명합니다. 이 코스의 핵심 주제인 "권한 규칙 문법"의 1차 근거입니다.

핵심 인용:
> "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn't change the order. A broad deny rule like `Bash(aws *)` blocks every matching call, including calls that also match a narrower allow rule like `Bash(aws s3 ls)`, so a deny rule can't carry allowlist exceptions."

## S16 — Configure the sandboxed Bash tool - Claude Code Docs

URL: https://code.claude.com/docs/en/sandboxing

- authority: official-docs

공식 문서가 샌드박스의 파일 시스템 격리와 네트워크 격리가 서로 독립된 두 계층임을 설명하고, 모델이 프롬프트 인젝션에 조종당한 뒤에도 OS 수준의 강제가 여전히 유효한 이유를 밝힙니다. 쓰기·실행 도구의 "영향 반경"과 샌드박스가 실제로 보장하는 것을 가르치는 데 사용합니다.

핵심 인용:
> "The two layers also differ in how they are enforced. Claude Code evaluates permission decisions before a command runs, based on the command string and, in auto mode, a separate classifier's judgment about whether the command is safe. The operating system enforces the sandbox boundary on the running process, so it holds regardless of what the model chose to run and even if an allowed command does more than its name suggests."

## S17 — Making Claude Code more secure and autonomous with sandboxing - Anthropic Engineering

URL: https://www.anthropic.com/engineering/claude-code-sandboxing

- authority: official-docs

이 Anthropic 엔지니어링 글은 샌드박스의 설계 목표를 "성공한 프롬프트 인젝션조차도"와 명시적으로 연결합니다. 샌드박싱이 특히 프롬프트 인젝션 위험을 겨냥한다는 이 코스의 주장을 뒷받침하는 권위 있는 출처입니다.

핵심 인용:
> "Sandboxing ensures that even a successful prompt injection is fully isolated, and cannot impact overall user security. ... This is particularly important in preventing a prompt-injected Claude from modifying sensitive system files. ... Without network isolation, a compromised agent could exfiltrate sensitive files like SSH keys."

## S18 — LLM06:2025 Excessive Agency - OWASP Gen AI Security Project

URL: https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM06_ExcessiveAgency.html

- authority: official-docs

공식 OWASP 페이지가 "Excessive Agency"의 권위 있는 정의와 세 가지 근본 원인(과도한 기능, 과도한 권한, 과도한 자율성), 그리고 고위험 액션에 사람의 승인을 요구하는 구체적인 완화책을 제시합니다. 에이전트의 도구 권한 경계를 다루는 이 코스의 장을 뒷받침합니다.

핵심 인용:
> "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction. ... Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken. This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."

## S19 — The lethal trifecta for AI agents - Simon Willison's Weblog

URL: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/

- authority: authoritative-guide

이 글은 널리 인용되는 "lethal trifecta" 프레임워크(비공개 데이터 접근, 신뢰할 수 없는 콘텐츠에 대한 노출, 외부와 통신할 수 있는 능력)를 제안하고 권위 있게 정의합니다. 간접 프롬프트 인젝션이 데이터 유출로 이어지는 위험 모델을 가르치는 데 사용합니다.

핵심 인용:
> "The lethal trifecta of capabilities is: Access to your private data—one of the most common purposes of tools in the first place! Exposure to untrusted content—any mechanism by which text (or images) controlled by a malicious attacker could become available to your LLM. The ability to externally communicate in a way that could be used to steal your data."

## S20 — Strict tool use — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use

- authority: official-docs

공식 문서가 기본(비 strict) 모드에서는 모델의 도구 입력이 스키마와 일치한다는 플랫폼 수준의 보장이 없어 타입이 어긋나거나 필수 필드가 빠질 수 있음을 설명합니다. strict: true에서는 플랫폼이 문법 제약 샘플링으로 입력이 input_schema와 일치하도록 보장하며, 공식 strict 모드 스키마는 모두 additionalProperties: false를 설정합니다.

핵심 인용:
> "Setting strict: true on a tool definition guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling). ... Without strict mode, Claude might return incompatible types ("2" instead of 2) or omit required fields, breaking your functions and causing runtime errors."

## S21 — Parallel tool use — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use

- authority: official-docs

공식 문서가 병렬 도구 호출의 반환 형식(모든 tool_result 블록이 바로 다음 단일 user 메시지에 함께 들어가고, 각각은 자신의 tool_use_id로 짝지어짐)과 disable_parallel_tool_use 스위치를 규정합니다. tool_choice가 auto일 때 이 값을 true로 두면 모델은 응답당 최대 하나의 도구만 호출합니다.

핵심 인용:
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."
> "When tool_choice type is auto (the default), setting disable_parallel_tool_use: true means Claude calls at most one tool per response."
