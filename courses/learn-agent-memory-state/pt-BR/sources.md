# Fontes

## S1 — Context windows

URL: https://platform.claude.com/docs/en/build-with-claude/context-windows

- authority: official-docs

A documentação oficial da Anthropic explica do que é feita a “janela de contexto” — a memória de trabalho do modelo: o system prompt, cada mensagem (incluindo resultados de ferramentas, imagens e documentos), as definições de ferramentas e a própria saída do modelo naquela vez (incluindo o extended thinking) contam todos. Ela também define o “context rot” (a precisão e o recall degradam conforme a contagem de tokens cresce) e observa que cada resposta reporta seu consumo no campo usage. É a base principal da lição 1 (“A janela de contexto é toda a memória que um agente tem”) e um apoio de fundo para a lição 2 (“o histórico de conversa só cresce”).

Citação principal:
> "As token count grows, accuracy and recall degrade, a phenomenon known as *context rot*. This makes curating what's in context just as important as how much space is available."
> "Everything in the request counts toward the context window: the system prompt, every message in messages (including tool results, images, and documents), and your tool definitions. The output Claude generates for the turn, including its extended thinking, counts too."
> "As the conversation advances through turns, each user message and assistant response accumulates within the context window, and previous turns are preserved completely."
> "The context window (up to 1M tokens, depending on the model) holds the conversation history plus the new output Claude generates."
> "Every response reports what the request consumed in its `usage` field."

## S2 — Context engineering: memory, compaction, and tool clearing

URL: https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools

- authority: official-docs

O cookbook oficial da Anthropic define com precisão os três mecanismos para lidar com o inchaço de contexto: compaction (condensa toda a janela em um resumo de alta fidelidade, ao custo de uma inferência do modelo resumidor), tool-result clearing (descarta apenas resultados de ferramentas antigos e re-obteníveis, mantendo o registro da chamada) e o primitivo da ferramenta memory (move informação para fora da janela para que ela sobreviva entre sessões). Explica que eles podem ser usados de forma independente ou em conjunto, e que clearing e compaction só atuam sobre o contexto atual e não ajudam uma nova sessão. Base principal da lição 2 (“gerenciando o histórico de conversa”) e apoio de fundo para as lições 3, 4 e 6.

Citação principal:
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

A documentação oficial da Anthropic descreve dois mecanismos de memória complementares: o CLAUDE.md é escrito por humanos e carregado por completo no início de cada sessão (alvo recomendado abaixo de 200 linhas; o limite rígido real é 4 MiB, acima do qual o arquivo é ignorado por completo); a Auto memory é escrita pelo Claude como um índice MEMORY.md mais arquivos de tópico sob demanda, dos quais apenas as primeiras 200 linhas ou 25KB do índice são carregadas por sessão, enquanto os arquivos de tópico são lidos sob demanda. Ela também observa que comentários HTML de nível de bloco são removidos antes da injeção, e que o CLAUDE.md da raiz do projeto é relido e reinjetado depois do /compact. Base principal da lição 3 (“memória externa: arquivos e recuperação”), reutilizada nas lições 5 e 6.

Citação principal:
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

A documentação oficial da Anthropic define o ciclo de vida completo de um todo durante a execução de um agente — Created, Activated, Completed, Removed — e explica que esse estado é exposto por meio de chamadas de ferramenta estruturadas (TaskCreate / TaskUpdate) observáveis no fluxo de mensagens. Base principal da lição 4 (“estado estruturado”).

Citação principal:
> "Claude moves each todo through a predictable lifecycle:\n\n1. **Created**: Claude adds the todo as pending when it identifies a task\n2. **Activated**: Claude sets the todo to in_progress when it starts the work\n3. **Completed**: Claude marks it completed when the task finishes successfully\n4. **Removed**: Claude deletes a todo it no longer needs by setting status: \"deleted\" in a TaskUpdate call"
> "In a session that has the task-tracking tools, Claude keeps a written todo list, updating each item's status as it works. You see each change in the message stream as a structured tool call."

## S5 — Memory Is a Feature. It Is Also an Attack Surface

URL: https://genai.owasp.org/2026/05/13/memory-is-a-feature-it-is-also-an-attack-surface/

- authority: authoritative-guide

Publicado no blog oficial do OWASP Gen AI Security Project por um dos co-líderes do item ASI06 (envenenamento de memória e de contexto), este artigo usa como exemplo a vulnerabilidade MemoryTrap divulgada pela equipe de pesquisa da Cisco: uma rotina aparentemente inofensiva — clonar um repositório, aprovar a instalação de uma dependência — deixou um payload malicioso chegar à memória persistente, à configuração global de hooks e até a uma camada de instruções de alta confiança por meio do system prompt, de modo que uma ação única pôde alterar o comportamento futuro do modelo entre sessões e projetos. Ele também observa que, após a divulgação da Cisco, a Anthropic removeu as memórias do usuário do system prompt no Claude Code v2.1.50. Base principal da lição 5 (“os limites e a segurança da memória”), reutilizada na lição 6 para o design de segurança de uma camada de memória persistente.

Citação principal:
> "Agentic systems do not just respond in the moment. They retain context, reuse memory, and rely on persistent state to guide future reasoning and actions. That is what makes them useful. It is also what makes them vulnerable."
> "In the vulnerability we called MemoryTrap, we found that a routine developer workflow could turn into persistent prompt injection. The path was surprisingly ordinary: clone a repository, let the agent help, approve a dependency installation, and move on."
> "Instead, it reached persistent memory, the global hooks configuration, and even influenced a highly trusted instruction layer through the system prompt. In other words, a one-time action could shape the model's future behavior across sessions, projects, and even reboots."
> "To Anthropic's credit, after we at Cisco disclosed the issue, Claude Code v2.1.50 removed user memories from the system prompt, reducing the specific high-trust override path we identified. That was the right fix for the path we found."
> "Once malicious content reaches trusted surfaces like memory, hooks, or configuration, the attacker is no longer just influencing one response. They are influencing future reasoning."
> "That is why MemoryTrap maps so clearly to ASI06: Memory & Context Poisoning."

## S6 — Using the Messages API

URL: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

- authority: official-docs

A documentação oficial afirma sem rodeios que a Messages API é stateless: cada requisição precisa carregar o histórico completo da conversa, e a API não guarda estado algum entre requisições. Base direta da afirmação central da lição 1 (“as chamadas de API são stateless”) e apoio à premissa da lição 4 de que um registro de progresso desaparece junto com a janela quando a sessão termina.

Citação principal:
> "The Messages API is stateless, which means that you always send the full conversational history to the API."

## S7 — Handle tool calls

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

A documentação oficial dá a regra de emparelhamento das chamadas de ferramenta: um bloco tool_result precisa vir imediatamente depois do bloco tool_use correspondente, e um par quebrado faz a requisição dar erro. Base direta da lição 2 (“a truncagem não pode separar um par tool_use/tool_result”) e da motivação de design do splitKeepingToolPairs da lição 6.

Citação principal:
> "Tool result blocks must immediately follow their corresponding tool use blocks in the message history. You cannot include any messages between the assistant's tool use message and the user's tool result message."
> "If you receive an error like \"tool_use ids were found without tool_result blocks immediately after\", check that your tool results are formatted correctly."

## S8 — Compaction

URL: https://platform.claude.com/docs/en/build-with-claude/compaction

- authority: official-docs

A documentação oficial dá os detalhes de parâmetro da compaction por resumo do lado do servidor: um limiar mínimo de disparo de 50.000 tokens (imposto pelo servidor), a possibilidade de várias compactions em uma conversa longa, o último bloco de compaction refletindo o estado final do prompt, e a compaction possivelmente ocorrendo mais de uma vez dentro de uma única requisição. Base direta dos detalhes de compaction da lição 2.

Citação principal:
> "`input_tokens` is the only supported trigger type. `value` must be at least 50,000 tokens."
> "A long-running conversation might result in multiple compactions. The last compaction block reflects the final state of the prompt, replacing content prior to it with the generated summary."
> "Compaction might occur multiple times within a single request depending on your trigger threshold and the amount of output generated."

## S9 — How tool use works

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

A documentação oficial dá a especificação do loop de execução de ferramentas dirigido pelo stop_reason: o modelo nunca executa nada por conta própria, apenas emite uma requisição estruturada; o host a executa e envia o resultado de volta; enquanto o stop_reason ainda for tool_use, o loop continua. Base direta da passagem da lição 6 “ponto de partida: o loop de execução do curso de tool calling”.

Citação principal:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."
