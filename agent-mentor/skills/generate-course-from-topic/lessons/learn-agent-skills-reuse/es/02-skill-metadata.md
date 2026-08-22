# Lección 2: La estructura de metadatos de SKILL.md

> Objetivos de esta lección:
> - Escribir la estructura mínima de `SKILL.md` que exige la especificación abierta.
> - Distinguir las responsabilidades del bloque de metadatos y del cuerpo.
> - Conseguir que el `description` diga a la vez qué hace el Skill y cuándo se dispara.
>
> Requisitos previos: tener terminado un Skill brief de cuatro líneas | Lección anterior [<< 01](./01-prompt-to-skill.md) | Lección siguiente [03 >>](./03-progressive-disclosure.md)

## El Agent no ve primero tus instrucciones completas

Ya tienes el brief de cuatro líneas, pero si lo sueltas tal cual en un archivo Markdown, el Agent no necesariamente sabe que eso es un Skill ni cuándo debería cargarlo. Los clientes compatibles con Agent Skills ven primero el `name` y el `description`, y solo después de casar la tarea leen el `SKILL.md` completo.[^S1][^S4]

El segundo paso es escribir un `SKILL.md` mínimo que una comprobación estática pueda reconocer y que el Agent pueda disparar correctamente. Las explicaciones largas se añaden después, una vez que la entrada funciona.

## Explicación

### La estructura mínima solo tiene dos capas

La especificación abierta exige que `SKILL.md` contenga YAML frontmatter seguido de contenido Markdown. El frontmatter necesita como mínimo `name` y `description`; el cuerpo lleva las instrucciones operativas que el Agent debe seguir cuando el Skill se activa.[^S2][^S7]

Un archivo mínimo tiene este aspecto:

```markdown
---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quotes, themes, and product suggestions. Use when the user asks to summarize interviews, research calls, or transcript notes.
---

# Interview Notes

## Instructions

Read the transcript the user provides. Produce Chinese Markdown notes with:

- a short summary
- quoted evidence from the customer
- recurring themes
- 3 product suggestions

Do not edit the original transcript, send follow-up messages, or decide roadmap priority.
```

El frontmatter es el bloque de metadatos YAML al inicio del archivo, rodeado arriba y abajo por líneas `---`. El cuerpo son las instrucciones Markdown que van después del frontmatter. La diferencia entre ambos importa: los metadatos ayudan al Agent a descubrir el Skill; el cuerpo ayuda al Agent a ejecutarlo.

### `name` es un identificador estable

`name` es el nombre legible por máquina del Skill. La especificación abierta exige que tenga entre 1 y 64 caracteres, que solo use letras minúsculas, dígitos y guiones, que no empiece ni termine con guion, que no contenga guiones consecutivos y que coincida con el nombre del directorio padre. Las buenas prácticas actuales de Anthropic dan los mismos límites de longitud y caracteres.[^S2][^S7]

Esto significa que los siguientes nombres tienen problemas distintos:

```yaml
name: InterviewNotes      # tiene mayúsculas
name: interview_notes     # tiene guiones bajos
name: -interview-notes    # empieza con guion
name: interview--notes    # guiones consecutivos
```

Un nombre válido debería parecerse al nombre de un directorio:

```yaml
name: interview-notes
```

Al nombrar no busques ser ingenioso; busca primero estabilidad, brevedad y legibilidad. No es un titular ni un eslogan.

### `description` responde por la capacidad y por el disparo

`description` es el texto corto con el que el Agent decide si carga el Skill. La especificación exige que no esté vacío y que tenga como máximo 1024 caracteres, y recomienda describir a la vez qué hace el Skill y cuándo usarlo, incluyendo palabras clave que ayuden al Agent a reconocer la tarea. Las guías actuales de OpenAI y Anthropic apoyan el casado implícito en este campo.[^S2][^S4][^S7]

Una redacción débil:

```yaml
description: Helps write notes.
```

Esta frase no dice ni la entrada, ni la salida, ni el escenario de disparo. Una redacción más concreta:

```yaml
description: Turns customer interview transcripts into Chinese Markdown notes with quotes, themes, and product suggestions. Use when the user asks to summarize interviews, research calls, or transcript notes.
```

La primera mitad de la frase describe la capacidad; la segunda mitad dice cuándo se dispara. El brief de cuatro líneas no se traslada mecánicamente a dos sitios: la capacidad, el disparo positivo y la desambiguación negativa necesaria entran en el `description`; los detalles de entrada, los requisitos completos de salida y las prohibiciones de ejecución entran en el cuerpo. Si alguna línea de «No procesa» implica que el Skill no debería seleccionarse en absoluto, condénsala como desambiguación negativa dentro del `description` y deja la prohibición concreta en el cuerpo.

Glosario de esta lección:

- `SKILL.md`: el archivo de entrada obligatorio en el directorio del Skill, con metadatos e instrucciones.
- frontmatter: el bloque de metadatos YAML en la parte superior del archivo Markdown.
- `name`: el identificador estable que cumple las restricciones de nombre y coincide con el directorio padre.
- `description`: el texto corto que dice qué hace el Skill y cuándo se dispara.

```agentmentor-check
{
  "id": "agent-skills-reuse-description-trigger",
  "label": "Revisa el description de disparo",
  "prompt": "¿Cuál de los siguientes description es más adecuado para que el Agent juzgue cuándo cargar un Skill de notas de entrevista?",
  "whyHere": "Este paso comprueba si la persona que aprende escribe el description como una presentación genérica de capacidad, en vez de escribir a la vez la capacidad y el disparo.",
  "copyPurpose": "Quiero que el Agent compruebe si mi description incluye a la vez qué hace el Skill y cuándo se dispara.",
  "mode": "single",
  "choices": [
    {
      "id": "vague",
      "text": "Descripción vaga: Helps with customer content.",
      "correct": false,
      "feedback": "No indica entrada estable, salida ni palabras clave de disparo; al Agent le cuesta decidir cuándo cargarlo."
    },
    {
      "id": "specific",
      "text": "Descripción con capacidad y disparadores: Turns customer interview transcripts into Chinese Markdown notes with quotes and themes. Use when summarizing interviews, research calls, or transcript notes.",
      "correct": true,
      "feedback": "Escribe a la vez la capacidad, la forma de la salida y el escenario de disparo; sirve para un juicio rápido en la capa de metadatos."
    }
  ]
}
```

## Ejemplo completo: un SKILL.md mínimo comprobable

Supón que el brief de la lección anterior era:

```text
Disparador: el usuario pide organizar entrevistas con clientes, transcripts de investigación de usuarios o sales call notes.
Entrada: uno o más textos de transcript, idealmente con hablantes y orden temporal.
Salida: notas en chino en Markdown, con resumen de temas, evidencia con citas textuales del cliente, lista de preguntas y 3 sugerencias de producto.
No procesa: no modificar el transcript original, no enviar correos en nombre del usuario, no decidir prioridades de la hoja de ruta.
```

Primero crea el nombre de directorio y el `name`:

```text
interview-notes/
  SKILL.md
```

Después escribe el `SKILL.md` mínimo:

```markdown
---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quoted evidence, themes, open questions, and product suggestions. Use when summarizing interviews, research calls, sales call notes, or transcript files.
---

# Interview Notes

## Instructions

Use this skill when the user provides or points to customer interview transcripts, research call notes, or sales call notes.

Input can be one or more transcript files or pasted transcript text. Preserve customer meaning and mark direct quotes clearly.

Return Chinese Markdown with:

- summary
- quoted evidence
- recurring themes
- open questions
- 3 product suggestions

Do not modify the original transcript, send follow-up messages, or decide roadmap priority.
```

Supera la comprobación estática más básica porque: el frontmatter existe, el `name` es válido y coincide con el directorio, el `description` no está vacío y contiene capacidad y disparo, y el cuerpo da las reglas de ejecución.

## Ejemplo a medias: un SKILL.md de notas de versión

A partir de este brief, completa el `name` y el `description`:

```text
Nombre de directorio: release-notes
Disparador: el usuario pide generar notas de versión a partir de commits de Git, PRs o borradores de changelog.
Salida: notas de versión en Markdown orientadas al usuario, agrupadas en novedades, correcciones y problemas conocidos.
```

El borrador a medias:

```markdown
---
name: __________________
description: __________________
---

# Release Notes

## Instructions

Write user-facing Markdown release notes from the change material the user provides.
```

Respuesta de referencia:

```yaml
name: release-notes
description: Turns commits, PR summaries, or changelog drafts into user-facing Markdown release notes grouped by features, fixes, and known issues. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog.
```

Fíjate en que el `description` no necesita meter todos los detalles operativos. Primero tiene que ayudar al Agent a juzgar «si esta tarea debería cargarme a mí».

<!-- exercises -->
## Ejercicios

### Level 1 (Calentamiento)

Crea un directorio de práctica junto a tu directorio de trabajo real, por ejemplo `skill-drafts/<your-skill-name>/`, y escribe un `SKILL.md` mínimo para el brief de la lección anterior. No pongas datos privados; escribe solo estructura e instrucciones.

Cómo hacerlo: primero pasa el nombre del directorio a kebab-case en minúsculas y haz que `name` sea exactamente igual al nombre del directorio. Comprime la capacidad, el disparo positivo y la desambiguación negativa necesaria del brief en un solo `description`; escribe en el cuerpo los detalles de entrada, los requisitos completos de salida y las prohibiciones de ejecución.
<!-- rubric -->
- El archivo se llama `SKILL.md` y empieza con frontmatter.
- `name` solo contiene letras minúsculas, dígitos y guiones, y coincide con el nombre del directorio padre.
- `description` dice a la vez qué hace, cuándo se dispara y la desambiguación negativa realmente necesaria.
- El cuerpo escribe como mínimo los detalles de entrada, los requisitos completos de salida y las prohibiciones de ejecución.
<!-- answer -->
Una respuesta válida debería empezar con un frontmatter válido de varias líneas:

```markdown
---
name: release-notes
description: Turns ... Use when ...
---
```

y después escribir las Instructions en Markdown. El error típico es que el directorio se llame `ReleaseNotes` pero `name` diga `release-notes`; la especificación abierta exige que ambos coincidan.
<!-- hint -->
Revisa primero solo las tres primeras líneas de frontmatter; no te pongas a embellecer el cuerpo todavía.
<!-- hint -->
Si el description no te sale, fusiona directamente las líneas «Disparador» y «Salida» de la lección anterior en una frase corta.

### Level 2 (Avanzado)

Escribe tres solicitudes de usuario representativas para el mismo Skill y comprueba si tu `description` produce un disparo erróneo o un disparo perdido. Al menos una solicitud debería ser una tarea vecina que no debe dispararlo.

Cómo hacerlo: crea en el directorio de práctica un borrador `trigger-cases.md` con «debería disparar 1», «debería disparar 2» y «no debería disparar 1». Contrasta cada una con las palabras clave y los límites del `description`.
<!-- rubric -->
- Las tres solicitudes suenan a frases que un usuario real diría.
- Al menos dos solicitudes que deberían disparar encuentran palabras clave o semántica correspondiente en el description.
- La solicitud que no debería disparar queda excluida por las palabras de alcance del `description`; el cuerpo tiene además la acción prohibida correspondiente.
<!-- answer -->
Con `release-notes` como ejemplo: «escribe notas de versión a partir de estos PR» debería disparar; «convierte el changelog en una versión que los usuarios entiendan» debería disparar; «ponme un Git tag y publícalo en producción» no debería disparar. Si el `description` solo dice "Helps with releases", la tercera es fácil de juzgar mal; conviene estrechar el alcance a "write release notes" y escribir explícitamente "Do not use for tagging, deployment, or publishing operations". El cuerpo añade «no crear tags, no ejecutar publicaciones», para limitar la ejecución cuando el Skill ya se ha cargado o el usuario plantea una tarea mixta.
<!-- hint -->
Escribe las solicitudes como las diría un usuario de verdad, no como campos de la especificación.
<!-- hint -->
Las tareas vecinas suelen contener acciones como «enviar, publicar, desplegar, modificar archivos fuente, decidir prioridades».
<!-- /exercises -->

## Para llevar: las dos responsabilidades de los metadatos

El `SKILL.md` mínimo tiene ahora dos responsabilidades: el frontmatter se encarga del descubrimiento y la selección, y el cuerpo se encarga de la ejecución real. Una vez que la entrada funciona, aparece un problema nuevo: el material no deja de crecer. El siguiente paso es conseguir que el Agent solo lea etiquetas, ejemplos y plantillas cuando la tarea lo necesita.
