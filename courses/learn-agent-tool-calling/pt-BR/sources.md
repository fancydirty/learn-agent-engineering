# Fontes

Todos os fatos e definições centrais deste curso vêm dos materiais a seguir. As citações permanecem no idioma original, o inglês.

## S1 — Function calling — OpenAI API Guides

URL: https://developers.openai.com/api/docs/guides/function-calling

- authority: official-docs

Explica que o tool calling da OpenAI (function calling) é, no fundo, uma conversa de vários passos entre a sua aplicação e o modelo — o modelo apenas dispara a chamada, e a execução da função em si tem de ser feita pela aplicação que chama.

Citação principal:
> "Tool calling is a multi-step conversation between your application and a model via the OpenAI API. When the model calls a function, you must execute it and return the result."

## S2 — Tool use with Claude — Overview

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

- authority: official-docs

Dá uma visão geral do mecanismo de uso de ferramentas do Claude, distinguindo as client tools, executadas pelo aplicativo host, das server tools, executadas pelos servidores da Anthropic, e apresenta a estrutura básica da resposta assim que uma chamada de ferramenta é disparada.

Citação principal:
> "It then returns a structured call that your application executes (client tools) or that Anthropic executes (server tools). ... Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. Your code executes the operation and sends back a tool_result."

## S3 — Define tools — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools

- authority: official-docs

Traz, verbatim, os campos que a definição de uma ferramenta precisa incluir (name, description, input_schema) e o que cada um significa — a referência autoritativa para a estrutura do contrato de uma ferramenta.

Citação principal:
> "A user-defined tool definition includes: name — The name of the tool. ... description — A detailed plaintext description of what the tool does, when it should be used, and how it behaves. input_schema — A JSON Schema object defining the expected parameters for the tool."

## S4 — How tool use works — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works

- authority: official-docs

Afirma sem rodeios que o modelo em si nunca executa nada — ele só emite uma requisição estruturada, e a execução de fato fica com o aplicativo host ou com os servidores da Anthropic — e apresenta o laço canônico de várias rodadas conduzido pelo stop_reason. A melhor base autoritativa para a afirmação central deste curso.

Citação principal:
> "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation. ... 2. Claude responds with stop_reason: "tool_use" and one or more tool_use blocks. 3. Execute each tool. Format the outputs as tool_result blocks. 4. Send a new request... 5. Repeat from step 2 while stop_reason is "tool_use"."

## S5 — Handle tool calls — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

- authority: official-docs

Traz a especificação exata dos campos dos blocos de conteúdo tool_use e tool_result (id/name/input e tool_use_id/content/is_error), usada para ensinar o formato da requisição e da resposta no nível do byte.

Citação principal:
> "id: A unique identifier for this particular tool use block. ... name: The name of the tool being used. input: An object containing the input being passed to the tool, conforming to the tool's input_schema. ... tool_use_id: The id of the tool use request this is a result for. ... is_error (optional): Set to true if the tool execution resulted in an error."

## S6 — Tools reference — Claude Code Docs

URL: https://code.claude.com/docs/en/tools-reference

- authority: official-docs

Lista as ferramentas embutidas que o Claude Code expõe como aplicativo host e os nomes exatos usados nas regras de permissão, nas listas de ferramentas de subagentes e nos matchers de hooks — o que ajuda quem aprende a entender o conceito de catálogo de ferramentas dentro do laço de um host real.

Citação principal:
> "Claude Code has access to a set of built-in tools that help it understand and modify your codebase. The tool names are the exact strings you use in permission rules, subagent tool lists, and hook matchers."

## S7 — Tool Use — LM Studio Docs (OpenAI-compatible API)

URL: https://lmstudio.ai/docs/developer/openai-compat/tools

- authority: authoritative-guide

Como documentação de implementação de uma API compatível com a da OpenAI, confirma verbatim a localização exata do array tool_calls na resposta e o valor tool_calls do finish_reason, preenchendo uma lacuna que os guias oficiais deixam ao descrever a estrutura da resposta.

Citação principal:
> "If the model decides that the user message would be best fulfilled with a tool call, an array of tool call request objects will be provided in the response field, choices[0].message.tool_calls. The finish_reason field of the top-level response object will also be populated with "tool_calls"."

## S8 — Writing effective tools for AI agents—using AI agents | Anthropic Engineering

URL: https://www.anthropic.com/engineering/writing-tools-for-agents

- authority: authoritative-guide

Explica que uma boa description de ferramenta precisa eliminar a ambiguidade sobre entradas e saídas, e aponta que mais ferramentas não significam um desempenho melhor do agente — ferramentas parecidas demais tornam a escolha mais difícil.

Citação principal:
> "Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs. ... More tools don't always lead to better outcomes."

## S9 — Introducing advanced tool use on the Claude Developer Platform | Anthropic Engineering

URL: https://www.anthropic.com/engineering/advanced-tool-use

- authority: authoritative-guide

Usa números concretos para mostrar como um conjunto grande de definições de ferramentas (sobretudo depois de conectar vários servidores MCP) consome uma quantidade enorme de tokens de contexto antes mesmo de a conversa começar, e explica que os resultados intermediários das ferramentas também entram por inteiro no contexto do modelo, espremendo — e até expulsando — informação importante. É o que motiva a Tool Search Tool e o programmatic tool calling.

Citação principal:
> "That's 58 tools consuming approximately 55K tokens before the conversation even starts. ... At Anthropic, we've seen tool definitions consume 134K tokens before optimization."
> "When Claude analyzes a 10MB log file for error patterns, the entire file enters its context window ... These intermediate results consume massive token budgets and can push important information out of the context window entirely."

## S10 — How to implement tool use - Claude Platform Docs

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use

- authority: official-docs

A documentação oficial traz a boa prática para nomear ferramentas: usar o nome do serviço como prefixo de namespace para evitar ambiguidade, e fazer as ferramentas devolverem identificadores estáveis e informativos em vez de referências internas.

Citação principal:
> "Use meaningful namespacing in tool names. When your tools span multiple services or resources, prefix names with the service (e.g., github_list_prs, slack_send_message). This makes tool selection unambiguous as your library grows, and is especially important when using tool search."

## S11 — Tools - Model Context Protocol

URL: https://modelcontextprotocol.io/docs/concepts/tools

- authority: official-docs

A especificação do MCP distingue os erros de protocolo dos erros de execução da ferramenta, e exige que os clientes apresentem ao modelo os erros de execução acionáveis, para que ele possa se autocorrigir e tentar de novo.

Citação principal:
> "Clients SHOULD provide tool execution errors to language models to enable self-correction."

## S12 — Specification - Model Context Protocol

URL: https://modelcontextprotocol.io/specification/2025-11-25

- authority: official-docs

A especificação oficial explica que o MCP se inspira nas ideias do Language Server Protocol para padronizar a integração de ferramentas e de contexto em todo o ecossistema de aplicações de IA, permitindo que aplicativos host diferentes exponham ferramentas por meio de um único protocolo uniforme.

Citação principal:
> "MCP takes some inspiration from the Language Server Protocol, which standardizes how to add support for programming languages across a whole ecosystem of development tools. In a similar way, MCP standardizes how to integrate additional context and tools into the ecosystem of AI applications."

## S13 — What is the Model Context Protocol (MCP)? - Model Context Protocol

URL: https://modelcontextprotocol.io/introduction

- authority: official-docs

A página oficial de introdução usa a analogia do USB-C para explicar de forma intuitiva como o MCP oferece uma maneira uniforme e padronizada de conectar aplicações de IA a ferramentas e fontes de dados externas.

Citação principal:
> "Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect electronic devices, MCP provides a standardized way to connect AI applications to external systems."

## S14 — Creating your first schema - JSON Schema

URL: https://json-schema.org/learn/getting-started-step-by-step

- authority: official-docs

A documentação oficial explica que title e description no JSON Schema declaram a intenção e não acrescentam nenhuma restrição, e que $schema declara qual versão da especificação está sendo seguida — a base para projetar os parâmetros de entrada de uma ferramenta (inputSchema).

Citação principal:
> "title and description: state the intent of the schema. These keywords don't add any constraints to the data being validated. ... $schema: specifies which draft of the JSON Schema standard the schema adheres to."

## S15 — Configure permissions - Claude Code Docs

URL: https://code.claude.com/docs/en/permissions

- authority: official-docs

Como documentação oficial, explica a sintaxe exata das regras de permissão do Claude Code (allow/deny/ask e a forma Tool(specifier)) e a ordem em que são avaliadas — a base de primeira mão para o tópico central do curso sobre sintaxe de regras de permissão.

Citação principal:
> "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn't change the order. A broad deny rule like `Bash(aws *)` blocks every matching call, including calls that also match a narrower allow rule like `Bash(aws s3 ls)`, so a deny rule can't carry allowlist exceptions."

## S16 — Configure the sandboxed Bash tool - Claude Code Docs

URL: https://code.claude.com/docs/en/sandboxing

- authority: official-docs

A documentação oficial explica que o isolamento de sistema de arquivos e o isolamento de rede de um sandbox são duas camadas independentes, e por que a imposição no nível do sistema operacional continua valendo mesmo depois de o modelo ser manipulado por prompt injection — usada para ensinar o raio de impacto das ferramentas de escrita e execução e o que o sandbox de fato garante.

Citação principal:
> "The two layers also differ in how they are enforced. Claude Code evaluates permission decisions before a command runs, based on the command string and, in auto mode, a separate classifier's judgment about whether the command is safe. The operating system enforces the sandbox boundary on the running process, so it holds regardless of what the model chose to run and even if an allowed command does more than its name suggests."

## S17 — Making Claude Code more secure and autonomous with sandboxing - Anthropic Engineering

URL: https://www.anthropic.com/engineering/claude-code-sandboxing

- authority: official-docs

Este post de engenharia da Anthropic amarra explicitamente o objetivo de design do sandbox ao caso de uma prompt injection bem-sucedida — a fonte autoritativa para a afirmação do curso de que o sandboxing mira especificamente o risco de prompt injection.

Citação principal:
> "Sandboxing ensures that even a successful prompt injection is fully isolated, and cannot impact overall user security. ... This is particularly important in preventing a prompt-injected Claude from modifying sensitive system files. ... Without network isolation, a compromised agent could exfiltrate sensitive files like SSH keys."

## S18 — LLM06:2025 Excessive Agency - OWASP Gen AI Security Project

URL: https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM06_ExcessiveAgency.html

- authority: official-docs

A página oficial da OWASP traz a definição autoritativa de Excessive Agency e as suas três causas-raiz (funcionalidade excessiva, permissões excessivas e autonomia excessiva), além da mitigação específica de aprovação humana para ações de alto risco — o que embasa o capítulo do curso sobre os limites de autorização de ferramentas de um agente.

Citação principal:
> "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction. ... Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken. This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."

## S19 — The lethal trifecta for AI agents - Simon Willison's Weblog

URL: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/

- authority: authoritative-guide

Este post propõe e define de forma autoritativa o framework amplamente citado da lethal trifecta (acesso a dados privados, exposição a conteúdo não confiável e a capacidade de se comunicar para fora) — usado para ensinar o modelo de risco da prompt injection indireta que leva à exfiltração de dados.

Citação principal:
> "The lethal trifecta of capabilities is: Access to your private data—one of the most common purposes of tools in the first place! Exposure to untrusted content—any mechanism by which text (or images) controlled by a malicious attacker could become available to your LLM. The ability to externally communicate in a way that could be used to steal your data."

## S20 — Strict tool use — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use

- authority: official-docs

A documentação oficial explica que, no modo padrão (não estrito), as entradas de ferramenta produzidas pelo modelo não têm nenhuma garantia de plataforma de corresponder ao schema — os tipos podem não bater ou campos obrigatórios podem ser omitidos; com strict: true, a plataforma usa amostragem restrita por gramática para garantir que as entradas correspondam ao input_schema, e os schemas oficiais do modo estrito sempre definem additionalProperties: false.

Citação principal:
> "Setting strict: true on a tool definition guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling). ... Without strict mode, Claude might return incompatible types ("2" instead of 2) or omit required fields, breaking your functions and causing runtime errors."

## S21 — Parallel tool use — Claude API

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use

- authority: official-docs

A documentação oficial especifica o formato de retorno das chamadas de ferramenta em paralelo (todos os blocos tool_result vão juntos na única mensagem de usuário imediatamente seguinte, cada um vinculado pelo seu tool_use_id) e a chave disable_parallel_tool_use: quando tool_choice é auto, defini-la como true faz o modelo chamar no máximo uma ferramenta por resposta.

Citação principal:
> "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."
> "When tool_choice type is auto (the default), setting disable_parallel_tool_use: true means Claude calls at most one tool per response."
