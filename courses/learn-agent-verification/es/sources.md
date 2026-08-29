# Fuentes

Todas las afirmaciones clave de este curso se apoyan en las fuentes listadas abajo. El texto principal las cita como `[^Sn]`, con los extractos concretos bajo cada entrada. Todas las citas se verificaron carácter a carácter contra la página final (incluidas las URL tras la redirección) el 2026-08-26, conservando las comillas tipográficas y las rayas del original y sin reformular nada. Las citas se mantienen en su inglés original.

Disciplina de redacción (aplica a todas las lecciones):
- Las citas solo respaldan afirmaciones que existen de verdad en el texto citado; los números, umbrales o clasificaciones que no aparezcan en la cita NO deben llevar una referencia `[^Sn]`.
- Ninguna de las fuentes contiene material de primera mano sobre «líneas base de tests de regresión / ejecutar evaluaciones en CI / detección de deriva en las puntuaciones»: se pueden describir como sentido común de ingeniería, pero no deben llevar citas ni atribuirse a Anthropic.
- Ninguna fuente da un umbral numérico para «cuán grande tiene que ser un conjunto de evaluación»: no inventes uno.
- Ninguna fuente lista compiladores ni verificadores estáticos de tipos como verificadores: no se los atribuyas a Anthropic.
- S4 es una página de documentación oficial que se actualiza de forma continua (redirigida desde una entrada de blog de 2025, con el contenido reescrito); al citarla, llámala «documentación oficial de Claude Code» y no le pongas fecha de publicación.

## S1 — Building Effective AI Agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/building-effective-agents

- authority: authoritative-guide

El artículo autorizado de Anthropic sobre patrones de agentes (2024-12). Arriba de la página hay un aviso de la propia fuente que señala que la descripción del ecosistema de herramientas está desactualizada, pero este curso solo toma de ahí las afirmaciones de principio sobre evaluación y confianza: la autonomía trae errores acumulativos y por eso exige pruebas en entornos aislados y guardrails, cada paso necesita feedback de ground truth del entorno, la complejidad solo vale la pena cuando la justifica una mejora medible, el código se puede verificar con tests automatizados pero la revisión humana sigue siendo imprescindible, y separar «al que hace» de «al que comprueba» funciona mejor.

Cita clave:
> "The autonomous nature of agents means higher costs, and the potential for compounding errors. We recommend extensive testing in sandboxed environments, along with the appropriate guardrails."
> "During execution, it's crucial for the agents to gain “ground truth” from the environment at each step (such as tool call results or code execution) to assess its progress."
> "Agents can then pause for human feedback at checkpoints or when encountering blockers."
> "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."
> "The key to success, as with any LLM features, is measuring performance and iterating on implementations. To repeat: you should consider adding complexity only when it demonstrably improves outcomes."
> "Start with simple prompts, optimize them with comprehensive evaluation, and add multi-step agentic systems only when simpler solutions fall short."
> "Both applications illustrate how agents add the most value for tasks that require both conversation and action, have clear success criteria, enable feedback loops, and integrate meaningful human oversight."
> "Code solutions are verifiable through automated tests;"
> "Agents can iterate on solutions using test results as feedback;"
> "However, whereas automated testing helps verify functionality, human review remains crucial for ensuring solutions align with broader system requirements."
> "Implementing guardrails where one model instance processes user queries while another screens them for inappropriate content or requests. This tends to perform better than having the same LLM call handle both guardrails and the core response."
> "Automating evals for evaluating LLM performance, where each LLM call evaluates a different aspect of the model’s performance on a given prompt."
> "This workflow is particularly effective when we have clear evaluation criteria, and when iterative refinement provides measurable value. The two signs of good fit are, first, that LLM responses can be demonstrably improved when a human articulates their feedback; and second, that the LLM can provide such feedback."
> "Evaluating whether a given piece of content is inappropriate, with multiple prompts evaluating different aspects or requiring different vote thresholds to balance false positives and negatives."
> "Test how the model uses your tools: Run many example inputs in our workbench to see what mistakes the model makes, and iterate."
> "To fix this, we changed the tool to always require absolute filepaths—and we found that the model used this method flawlessly."
> "Agentic systems often trade latency and cost for better task performance, and you should consider when this tradeoff makes sense."

## S2 — How we built our multi-agent research system — Anthropic Engineering

URL: https://www.anthropic.com/engineering/multi-agent-research-system

- authority: authoritative-guide

La retrospectiva de ingeniería de Anthropic sobre un sistema multiagente de investigación (2025-06), la fuente central de este curso: las pruebas tradicionales dan por hecho que «con la misma entrada se sigue el mismo camino», y los agentes no cumplen esa premisa; hay que evaluar los estados finales en vez de comprobar paso a paso; un conjunto de evaluación que arranca con unas 20 consultas reales ya resulta eficaz, y cuando los tamaños de efecto son grandes hasta unos pocos casos de prueba revelan la diferencia; para el texto libre se usa un juez LLM con puntuación por rúbrica (una sola llamada, con puntuaciones de 0.0 a 1.0 más un veredicto aprobado/fallido, es lo más estable); los casos límite que se les escapan a las evaluaciones automatizadas hay que cazarlos con pruebas manuales.

Cita clave:
> "Good evaluations are essential for building reliable AI applications, and agents are no different. However, evaluating multi-agent systems presents unique challenges."
> "Traditional evaluations often assume that the AI follows the same steps each time: given input X, the system should follow path Y to produce output Z. But multi-agent systems don't work this way."
> "Even with identical starting points, agents might take completely different valid paths to reach their goal. One agent might search three sources while another searches ten, or they might use different tools to find the same answer."
> "Because we don’t always know what the right steps are, we usually can't just check if agents followed the “correct” steps we prescribed in advance. Instead, we need flexible evaluation methods that judge whether agents achieved the right outcomes while also following a reasonable process."
> "We found success focusing on end-state evaluation rather than turn-by-turn analysis. Instead of judging whether the agent followed a specific process, evaluate whether it achieved the correct final state."
> "This approach acknowledges that agents may find alternative paths to the same goal while still ensuring they deliver the intended outcome. For complex workflows, break evaluation into discrete checkpoints where specific state changes should have occurred, rather than attempting to validate every intermediate step."
> "In early agent development, changes tend to have dramatic impacts because there is abundant low-hanging fruit. A prompt tweak might boost success rates from 30% to 80%. With effect sizes this large, you can spot changes with just a few test cases."
> "We started with a set of about 20 queries representing real usage patterns."
> "We often hear that AI developer teams delay creating evals because they believe that only large evals with hundreds of test cases are useful. However, it’s best to start with small-scale testing right away with a few examples, rather than delaying until you can build more thorough evals."
> "Research outputs are difficult to evaluate programmatically, since they are free-form text and rarely have a single correct answer. LLMs are a natural fit for grading outputs."
> "We used an LLM judge that evaluated each output against criteria in a rubric: factual accuracy (do claims match sources?), citation accuracy (do the cited sources match the claims?), completeness (are all requested aspects covered?), source quality (did it use primary sources over lower-quality secondary sources?), and tool efficiency (did it use the right tools a reasonable number of times?)."
> "We experimented with multiple judges to evaluate each component, but found that a single LLM call with a single prompt outputting scores from 0.0-1.0 and a pass-fail grade was the most consistent and aligned with human judgements."
> "People testing agents find edge cases that evals miss. These include hallucinated answers on unusual queries, system failures, or subtle source selection biases."
> "In our case, human testers noticed that our early agents consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources like academic PDFs or personal blogs."
> "Even in a world of automated evaluations, manual testing remains essential."
> "In traditional software, a bug might break a feature, degrade performance, or cause outages. In agentic systems, minor changes cascade into large behavioral changes, which makes it remarkably difficult to write code for complex agents that must maintain state in a long-running process."
> "The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely. One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes."
> "Agents make dynamic decisions and are non-deterministic between runs, even with identical prompts. This makes debugging harder."
> "Adding full production tracing let us diagnose why agents failed and fix issues systematically."
> "We combine the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints."

## S3 — Writing effective tools for agents — with agents — Anthropic Engineering

URL: https://www.anthropic.com/engineering/writing-tools-for-agents

- authority: authoritative-guide

El artículo de Anthropic sobre ingeniería de herramientas (2025-09), del que este curso toma prácticas de primera mano sobre «cómo montar un circuito de evaluación»: el contraste de definición entre los sistemas deterministas y los agentes no deterministas; las tareas de evaluación deben partir del uso real y tener suficiente complejidad; cada prompt de evaluación debe ir emparejado con un resultado verificable, y los verificadores van desde «la comparación exacta de cadenas» hasta «Claude como juez», a lo largo de un espectro; las evaluaciones se ejecutan de forma programática con «una tarea por cada while-loop agéntico»; se recogen métricas más allá de la tasa de aprobación, como el tiempo de ejecución, el número de llamadas, el consumo de tokens y los errores de herramienta; y se usan conjuntos reservados para no sobreajustar.

Cita clave:
> "In computing, deterministic systems produce the same output every time given identical inputs, while non-deterministic systems—like agents—can generate varied responses even with the same starting conditions."
> "Tools are a new kind of software which reflects a contract between deterministic systems and non-deterministic agents."
> "Building an evaluation allows you to systematically measure the performance of your tools."
> "Start by standing up a quick prototype of your tools and testing them locally. Next, run a comprehensive evaluation to measure subsequent changes."
> "Next, you need to measure how well Claude uses your tools by running an evaluation. Start by generating lots of evaluation tasks, grounded in real world uses."
> "We recommend you avoid overly simplistic or superficial “sandbox” environments that don’t stress-test your tools with sufficient complexity. Strong evaluation tasks might require multiple tool calls—potentially dozens."
> "Each evaluation prompt should be paired with a verifiable response or outcome. Your verifier can be as simple as an exact string comparison between ground truth and sampled responses, or as advanced as enlisting Claude to judge the response."
> "Avoid overly strict verifiers that reject correct responses due to spurious differences like formatting, punctuation, or valid alternative phrasings."
> "For each prompt-response pair, you can optionally also specify the tools you expect an agent to call in solving the task, to measure whether or not agents are successful in grasping each tool’s purpose during evaluation."
> "However, because there might be multiple valid paths to solving tasks correctly, try to avoid overspecifying or overfitting to strategies."
> "We recommend running your evaluation programmatically with direct LLM API calls. Use simple agentic loops (while-loops wrapping alternating LLM API and tool calls): one loop for each evaluation task."
> "As well as top-level accuracy, we recommend collecting other metrics like the total runtime of individual tool calls and tasks, the total number of tool calls, the total token consumption, and tool errors."
> "However, keep in mind that what agents omit in their feedback and responses can often be more important than what they include. LLMs don’t always say what they mean."
> "Review the raw transcripts (including tool calls and tool responses) to catch any behavior not explicitly described in the agent’s CoT."
> "Lots of redundant tool calls might suggest some rightsizing of pagination or token limit parameters is warranted; lots of tool errors for invalid parameters might suggest tools could use clearer descriptions or better examples."
> "We relied on held-out test sets to ensure we did not overfit to our “training” evaluations."
> "With your evaluation you can measure the impact of your prompt engineering with greater confidence. Even small refinements to tool descriptions can yield dramatic improvements."

## S4 — Best practices for Claude Code — Claude Code official documentation

URL: https://code.claude.com/docs/en/best-practices

- authority: official-docs

Documentación oficial de buenas prácticas de Claude Code (una página viva que se actualiza de forma continua, redirigida desde entradas de blog anteriores y sin fecha al citarla). Este curso saca de aquí la línea maestra de «dale al agente una comprobación que pueda ejecutar él mismo»: sin una comprobación ejecutable, «parece terminado» es la única señal disponible y tú te conviertes en el bucle de verificación; con una señal de aprobado/fallido, el bucle se cierra solo; la comprobación puede ser tests, el código de salida de una build, un linter, un script que compara la salida con una línea base o una comparación de capturas de pantalla; el modelo que hace el trabajo no debería ser el que se pone la nota; y a un revisor al que le pides que encuentre carencias siempre encuentra alguna, así que hay que acotarlo a «reporta solo los problemas que afectan a la corrección».

Cita clave:
> "Give Claude a check it can run: tests, a build, a screenshot to compare. It's the difference between a session you watch and one you walk away from."
> "Claude stops when the work looks done. Without a check it can run, \"looks done\" is the only signal available, and you become the verification loop: every mistake waits for you to notice it."
> "Give Claude something that produces a pass or fail, and the loop closes on its own. Claude does the work, runs the check, reads the result, and iterates until the check passes."
> "The check is anything that returns a signal Claude can read in the conversation: a test suite, a build exit code, a linter, a script that diffs output against a fixture, or a browser screenshot compared against a design."
> "By a second opinion: a verification subagent or a dynamic workflow that checks its own findings has a fresh model try to refute the result, so the agent doing the work isn't the one grading it."
> "Each step trades setup for attention. The prompt version works on any task today. The /goal and Stop hook versions are what let an unattended run finish correctly without you."
> "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result. Reviewing evidence is faster than re-running the verification yourself, and it works for sessions you weren't watching."
> "The longer Claude works unattended, the more an independent check matters before you count the work as done. A reviewer running in a fresh subagent context sees only the diff and the criteria you give it, not the reasoning that produced the change, so it evaluates the result on its own terms."
> "A reviewer prompted to find gaps will usually report some, even when the work is sound, because that is what it was asked to do. Chasing every finding leads to over-engineering: extra abstraction layers, defensive code, and tests for cases that can't happen."
> "Tell the reviewer to flag only gaps that affect correctness or the stated requirements, and treat the rest as optional."
> "The trust-then-verify gap. Claude produces a plausible-looking implementation that doesn't handle edge cases."
> "Fix: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."

## S5 — Define success criteria and build evaluations — Claude API documentation

URL: https://platform.claude.com/docs/en/test-and-evaluate/develop-tests

- authority: official-docs

Documentación oficial «Test and Evaluate» de la plataforma para desarrolladores de Claude (las antiguas páginas separadas de «definir criterios de éxito», «construir tests» y «herramientas de evaluación» se han fundido en esta única página; no dirijas a nadie a buscar una página aparte de herramientas de evaluación). Da los requisitos de medibilidad de los criterios de éxito con ejemplos completos, tres principios de diseño de evaluaciones (ajustarse a la distribución real, automatizar la calificación siempre que se pueda, priorizar el volumen sobre la calidad de cada caso), el orden de compromisos de los cuatro métodos de calificación (la calificación por código es la más rápida y fiable; la calificación por LLM es rápida y flexible pero exige validar antes al juez; la calificación humana es la más flexible pero lenta y cara, y conviene evitarla si se puede) y técnicas para el prompt del juez (restringir el formato de salida, razonar antes de puntuar).

Cita clave:
> "Building a successful LLM-based application starts with clearly defining your success criteria and then designing evaluations to measure performance against them. This cycle is central to prompt engineering."
> "Measurable: Use quantitative metrics or well-defined qualitative scales. Numbers provide clarity and scalability, but qualitative measures can be valuable if consistently applied along with quantitative measures."
> "Achievable: Base your targets on industry benchmarks, prior experiments, AI research, or expert knowledge. Your success metrics should not be unrealistic to current frontier model capabilities."
> "Most use cases need multidimensional evaluation along several success criteria."
> "The sentiment analysis model should achieve an F1 score of at least 0.85 (Measurable, Specific) on a held-out test set* of 10,000 diverse Twitter posts (Relevant), which is a 5% improvement over the current baseline (Achievable)."
> "Be task-specific: Design evals that mirror your real-world task distribution. Don't forget to factor in edge cases!"
> "Automate when possible: Structure questions to allow for automated grading (for example, multiple-choice, string match, code-graded, LLM-graded)."
> "Prioritize volume over quality: More questions with slightly lower signal automated grading is better than fewer questions with high-quality human hand-graded evals."
> "Ambiguous test cases where even humans would find it hard to reach an assessment consensus"
> "When deciding which method to use to grade evals, choose the fastest, most reliable, most scalable method:"
> "Code-based grading: Fastest and most reliable, extremely scalable, but also lacks nuance for more complex judgments that require less rule-based rigidity."
> "Exact match: output == golden_answer"
> "Exact match evals measure whether the model's output matches a predefined correct answer, typically after normalizing whitespace and case. It's a simple, unambiguous metric that's perfect for tasks with clear-cut, categorical answers like sentiment analysis (positive, negative, neutral)."
> "LLM-based grading: Fast and flexible, scalable and suitable for complex judgment. Test to ensure reliability first then scale."
> "Human grading: Most flexible and high quality, but slow and expensive. Avoid if possible."
> "A given use case, or even a specific success criteria for that use case, might require several rubrics for holistic evaluation."
> "Empirical or specific: For example, instruct the LLM to output only 'correct' or 'incorrect', or to judge from a scale of 1–5. Purely qualitative evaluations are hard to assess quickly and at scale."
> "Encourage reasoning: Ask the LLM to reason first before producing an evaluation score, and then discard the reasoning. This increases evaluation performance, particularly for tasks requiring complex judgment."
> "The LLM-based Likert scale is a psychometric scale that uses an LLM to judge subjective attitudes or perceptions."

## S6 — Tool use with Claude — Claude API documentation

URL: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

- authority: official-docs

Documentación oficial sobre tool calling. Este curso extrae solo dos puntos: `strict: true` garantiza que las llamadas a herramientas se ajusten estrictamente al esquema en la capa de la API (lo que adelanta toda una clase de verificación y la convierte en una garantía de la plataforma); y comportamientos ideales como «el modelo pedirá por iniciativa propia los parámetros que falten» están explícitamente fuera de lo que la documentación oficial garantiza, y los comportamientos que no se garantizan son justo lo que deberían cubrir los conjuntos de evaluación.

Cita clave:
> "Add strict: true to your custom tool definitions to ensure Claude's tool calls always match your schema exactly."
> "Claude responds with stop_reason: \"tool_use\" and one or more tool_use blocks. Your code executes the operation and sends back a tool_result."
> "If the user's prompt doesn't include enough information to fill all the required parameters for a tool, Claude Opus is much more likely to recognize that a parameter is missing and ask for it."
> "This behavior is not guaranteed, especially for more ambiguous prompts and for less capable models."
