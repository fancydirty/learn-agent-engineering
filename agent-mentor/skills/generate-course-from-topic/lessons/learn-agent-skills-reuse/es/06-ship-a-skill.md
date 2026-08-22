# Lección 6: Del flujo de trabajo a un Skill entregable

> Objetivos de esta lección:
> - Montar una carpeta de Skill completa con `SKILL.md`, un archivo de referencia, una plantilla o una nota de límite de scripts.
> - Confirmar que el archivo de entrada es válido con la herramienta de validación de la especificación o con la comprobación manual equivalente.
> - Ejecutar 3 pruebas representativas en tu propio Agent, registrando los fallos y las revisiones.
>
> Requisitos previos: tener terminadas la matriz de pruebas de disparo y la auditoría de seguridad | Lección anterior [<< 05](./05-testing-and-safety.md) | Página siguiente [Índice del curso >>](./README.md)

## La entrega es un conjunto de archivos revisables

Llegados a este punto, ya tienes `SKILL.md`, la estratificación de recursos, los límites de ejecución, las pruebas de disparo y la auditoría de seguridad. El último paso es meterlos en una carpeta que otra persona pueda revisar, que el Agent pueda leer y que tú puedas volver a probar.

La meta de esta lección es muy concreta: una carpeta de Skill completa, con al menos el archivo de entrada, un archivo en `references/`, una plantilla o una nota de límite de scripts, y el registro de 3 pruebas representativas. Esta meta no te pide escribir código ejecutable.

## Explicación

### Una carpeta completa se reconoce primero por su forma

La especificación abierta define un Skill como un directorio que contiene al menos `SKILL.md`, y recoge la convención de organizar el contenido opcional habitual con `scripts/`, `references/` y `assets/`. La guía actual de OpenAI adopta la misma forma de directorio.[^S2][^S4]

Este curso usa una forma de entrega mínima pensada para quien empieza:

```text
release-notes/
  SKILL.md
  references/
    release-style.md
  assets/
    release-notes-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md` es la entrada; `references/release-style.md` guarda los detalles de estilo y límites; `assets/release-notes-template.md` guarda el esqueleto fijo de salida; `tests/trigger-tests.md` guarda las tres pruebas representativas; `safety-audit.md` registra qué riesgos has revisado.

Aquí hay un límite fácil de confundir: `tests/` y `safety-audit.md` son un registro de QA propio de este curso, no un directorio de descubrimiento automático recogido por la especificación. Se quedan en la carpeta para que la siguiente persona que mantenga el Skill vea el proceso de pruebas y revisiones.

### La validación tiene dos capas: comprobación de la especificación y comprobación manual equivalente

Si ya instalaste la librería de referencia siguiendo las instrucciones del repositorio `skills-ref` y el comando está disponible en tu entorno virtual actual, puedes usarlo para comprobar el frontmatter de `SKILL.md` y las restricciones de nombre. La librería está marcada explícitamente como de demostración, así que este curso conserva siempre la comprobación manual equivalente.[^S2][^S6]

```text
1. El nombre de la carpeta es exactamente igual al name del frontmatter.
2. SKILL.md empieza con --- desde la primera línea.
3. El frontmatter puede leerse como YAML.
4. name solo contiene letras minúsculas, dígitos y guiones; no empieza ni termina con guion; no tiene guiones consecutivos.
5. description no está vacío y dice qué hace y cuándo usarlo.
6. El cuerpo puede apuntar a una ruta relativa de references/ o assets/ que exista de verdad.
```

La validación no puede demostrar que el Skill funcione bien; solo demuestra que el archivo de entrada no tiene errores estructurales básicos. Si funciona bien de verdad depende de las tres pruebas representativas.

### Las tres pruebas se ejecutan en tu propio Agent

ChatGPT y Codex admiten la invocación explícita y la invocación implícita; la invocación implícita depende de que la tarea case con el `description`. La guía actual de Anthropic también usa un proceso de descubrimiento que primero mira los metadatos y luego lee el texto completo.[^S4][^S7] Antes de probar, instala el Skill siguiendo la documentación vigente del cliente objetivo, confirma que es visible con la lista de skills o una invocación explícita, y luego prueba el disparo implícito abriendo una sesión nueva para cada caso. Cuando el cliente no muestra un registro de invocaciones, que la salida se parezca solo demuestra que el resultado se parece; no demuestra por sí sola que hubo un disparo.

Cada prueba registra cuatro cosas:

```text
Prompt: la solicitud original del usuario
Expected: should trigger / should not trigger
Observed: lo que el Agent hizo realmente
Revision: si hay que cambiar el description, el cuerpo, los recursos o la propia prueba
```

Si has confirmado que el Skill es visible pero el Agent no se dispara, no conviertas el `description` directamente en una lista larga. Mira primero si lo que falta es la palabra de disparo, la palabra de entrada, la palabra de salida, o si la desambiguación negativa se escribió demasiado ancha. Tras el cambio, vuelve a ejecutar la misma prueba en una sesión nueva.

### El registro de fallos es parte de la entrega

Un Skill entregable no debería esconder sus fallos. Anthropic recomienda observar cómo usa el Skill otra sesión nueva sobre tareas representativas, y revisar a partir de los resultados reales.[^S1][^S7] Por eso `tests/trigger-tests.md` debería conservar el registro de fallos y el registro de revisiones.

Formato recomendado:

```markdown
| id | expected | observed | revision |
|---|---|---|---|
| T1 | should trigger | triggered and used template | no change |
| T2 | should trigger | did not trigger on "customer-facing changelog" | add "customer-facing changelog" to description |
| T3 | should not trigger | offered to create Git tag | add "Do not create Git tags" to Instructions |
```

Este registro hace pasar el Skill de «escrito una vez» a «mantenible». La próxima vez que tú u otro Agent lo retomen, sabrán por qué cierta frase está donde está.

## Ejemplo completo: la carpeta del Skill de notas de versión

Abajo va un Skill `release-notes` completo pero muy pequeño. No necesita scripts; solo usa un archivo de referencia y una plantilla.

```text
release-notes/
  SKILL.md
  references/
    release-style.md
  assets/
    release-notes-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md`:

```markdown
---
name: release-notes
description: Turns commits, PR summaries, customer-facing changelog drafts, or change lists into user-facing Markdown release notes. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog. Do not use for tagging, deployment, or publishing operations.
---

# Release Notes

## Instructions

Use this skill when the user asks for user-facing release notes from commits, PR summaries, changelog drafts, or change lists.

Read references/release-style.md before writing if the user asks for house style, audience tone, or wording rules.

Use assets/release-notes-template.md for the output structure unless the user provides a different structure.

Return Markdown grouped by Added, Fixed, Changed, and Known issues. Preserve the facts in the input. Mark missing facts as open questions instead of inventing them.

Do not modify source code, create Git tags, deploy, publish, send announcements, or expose private customer data.
```

`references/release-style.md`:

```markdown
# Release style

- Write for product users, not internal engineers.
- Keep each bullet under 25 words when possible.
- Start each bullet with the user-visible change.
- Avoid commit hashes unless the user asks for an engineering changelog.
- If a change affects privacy, reliability, or data loss, keep the warning explicit.
```

`assets/release-notes-template.md`:

```markdown
# Release notes

## Added

- 

## Changed

- 

## Fixed

- 

## Known issues

- 

## Open questions

- 
```

`tests/trigger-tests.md`:

```markdown
| id | prompt | expected | observed | revision |
|---|---|---|---|---|
| T1 | Escribe las notas de versión a partir de estos resúmenes de PR. | should trigger | pending | pending |
| T2 | Convierte un borrador de customer-facing changelog en release notes más claras. | should trigger | pending | pending |
| T3 | Ponme un tag, publica la versión y luego escribe el anuncio. | should not take over full task | pending | pending |
```

`safety-audit.md`:

```markdown
# Safety audit

- Files: reads only user-provided change material, references/release-style.md, and assets/release-notes-template.md.
- Writes: produces draft Markdown in the conversation unless the user explicitly asks for a file path.
- Secrets: does not request deployment credentials, API keys, private customer lists, or unreleased financial data.
- Network: no network access required.
- Scripts: no executable script included; formatting is instruction-only.
```

Al entregar, valida primero la estructura. Si instalaste la herramienta de validación de la especificación, comprueba según sus instrucciones; si no, revisa punto por punto con las seis comprobaciones manuales de antes. Después coloca el Skill donde el Agent objetivo pueda leerlo, confirma que es visible con la lista de skills o una invocación explícita, y prueba T1, T2 y T3 abriendo una sesión nueva para cada solicitud, para que una prueba no contamine el juicio de la siguiente. Si el cliente no ofrece registro de invocaciones, anota «la salida cumple las reglas» como evidencia de resultado, no como evidencia de disparo.

## Te toca: el Skill de investigación de competidores a medias

Completa las dos posiciones de abajo: el `description` debe decir cuándo se dispara, y `references/research-boundaries.md` debe bloquear un límite de seguridad.

```text
competitor-research/
  SKILL.md
  references/
    research-boundaries.md
  assets/
    competitor-brief-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

El `SKILL.md` a medias:

```markdown
---
name: competitor-research
description: ________________________________________
---

# Competitor Research

## Instructions

Use this skill to turn user-provided competitor notes, public website excerpts, or product comparison notes into a structured competitor brief.

Read references/research-boundaries.md before writing the brief.

Use assets/competitor-brief-template.md for the output structure.
```

El `references/research-boundaries.md` a medias:

```markdown
# Research boundaries

- Use only sources or excerpts the user provides in the task.
- ________________________________________
- Mark unsupported claims as "unverified" instead of presenting them as fact.
```

Respuesta de referencia:

```yaml
description: Turns user-provided competitor notes, public website excerpts, or product comparison notes into a structured competitor brief. Use when the user asks to summarize competitors, compare positioning, or prepare competitor research from supplied material. Do not use for scraping, private-data collection, or claims without sources.
```

```markdown
- Do not collect private employee, customer, or account data; ask the user to provide public, sourceable material instead.
```

La clave de este ejemplo a medias es que, incluso en un Skill de investigación, no hay que escribir «investigar» como un permiso ilimitado. Tanto las fuentes de entrada como las afirmaciones sin verificar necesitan límites.

```agentmentor-action
mode: reasoning_audit
label: Audita mi carpeta final de Skill
description: Pide al Agent que compruebe, según la meta de esta lección, si el SKILL.md, los archivos de referencia, la plantilla o el límite de scripts, las tres pruebas y la auditoría de seguridad son coherentes entre sí.
purpose: Ya he terminado una carpeta de Skill; comprueba si cumple la meta del curso y señala contradicciones entre el description, las rutas de recursos, las pruebas de disparo y los límites de seguridad.
rules:
  - Revisa una sola zona de riesgo cada vez: estructura, disparo, salida, seguridad o registro de pruebas.
  - Cita los fragmentos concretos de archivo que aporto; no vuelvas a explicar en abstracto los conceptos de Agent Skills.
  - Para cada problema, da una sugerencia de revisión que pueda editarse directamente.
```

<!-- exercises -->
## Ejercicios

### Level 1 (Calentamiento)

Monta la carpeta final del Skill en tu directorio de práctica. Debe contener `SKILL.md`, un archivo en `references/`, un archivo de plantilla o una nota de límite de scripts, `tests/trigger-tests.md` y `safety-audit.md`.

Cómo hacerlo: dibuja primero el árbol de archivos, crea después los archivos vacíos uno a uno, y al final traslada el brief, las descripciones de recursos, la matriz de pruebas y la auditoría de seguridad de las lecciones anteriores a su posición correspondiente. No pongas datos originales privados.
<!-- rubric -->
- El árbol de archivos contiene al menos 5 entregables: entrada, referencia, plantilla o límite de scripts, pruebas y auditoría de seguridad.
- Las rutas relativas citadas en `SKILL.md` existen de verdad dentro de la carpeta.
- El Skill no depende de esta página del curso ni de contexto oculto; la carpeta copiada por separado sigue pudiendo entenderse.
<!-- answer -->
Una entrega válida debería parecerse a: `my-skill/SKILL.md`, `my-skill/references/format.md`, `my-skill/assets/output-template.md`, `my-skill/tests/trigger-tests.md`, `my-skill/safety-audit.md`. Si decides no escribir plantilla, escribe igualmente una nota de límite de scripts clara, por ejemplo un `scripts/README.md` que diga «no incluye scripts; si en el futuro se añade uno, debe documentar dependencias, entradas, salidas y mensajes de fallo».
<!-- hint -->
Haz primero que `SKILL.md` cite solo un archivo de referencia y una plantilla, para reducir errores de ruta.
<!-- hint -->
Si no puedes entregar la carpeta copiada a otro Agent para que la lea, es que alguna instrucción sigue escondida en tu conversación.

### Level 2 (Avanzado)

Ejecuta una validación y tres pruebas representativas sobre el Skill final. Si ya instalaste y activaste `skills-ref` siguiendo las instrucciones del repositorio oficial, puedes ejecutar `skills-ref validate ./your-skill`; si no, haz las seis comprobaciones manuales equivalentes de esta lección. Después ejecuta las 3 pruebas en tu propio Agent y escribe el observed y el revision de vuelta en `tests/trigger-tests.md`.

Cómo hacerlo: ejecuta la validación o la comprobación manual en el directorio padre del Skill. Tras confirmar que el cliente objetivo tiene instalado y listado el Skill, envía las tres pruebas al Agent, cada una en una sesión nueva. Observa si se dispara, qué lee, qué entrega y si se extralimita, y registra el resultado tal cual.
<!-- rubric -->
- El resultado de la validación o las 6 comprobaciones manuales quedan registrados.
- Las 3 pruebas tienen `expected`, `observed` y `revision`.
- Al menos 1 registro de prueba indica «no hace falta cambio» o «se modificó cierta línea»; no pueden quedar todas vacías.
- Si una prueba falla, la posición de la revisión se concreta al `description`, al cuerpo, al archivo de referencia, a la plantilla o al caso de prueba.
<!-- answer -->
Ejemplo de registro válido: `T2 expected should trigger; observed did not trigger on "customer-facing changelog"; revision added "customer-facing changelog" to description.` Otro puede ser: `T3 expected should not take over full task; observed offered to tag release; revision added "Do not create Git tags or publish versions" to Instructions.` El registro debe poder explicar por qué se cambió esa frase; no basta con escribir «description ajustado».
<!-- hint -->
Si el Agent no dispara el Skill de forma visible, comprueba primero si el description contiene las palabras de tarea de la jerga del usuario.
<!-- hint -->
Si el Agent se extralimita tras dispararse, corrige primero las acciones prohibidas del cuerpo; si no debería haberse disparado en absoluto, cambia las palabras de alcance del description.
<!-- /exercises -->

## El final del curso, el inicio del mantenimiento

Acabas de completar la tarea final del curso: convertir un flujo de trabajo repetido en una carpeta de Skill completa, y probar el disparo, la salida y los límites con tres solicitudes representativas. En el mantenimiento posterior, no borres el registro de fallos; trátalo como el historial de cambios del Skill. Cada vez que añadas un recurso, una plantilla o un script, actualiza a la vez la matriz de pruebas y la auditoría de seguridad.
