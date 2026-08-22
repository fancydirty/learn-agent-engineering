# Lección 5: Pruebas de disparo y auditoría de seguridad

> Objetivos de esta lección:
> - Diseñar pruebas representativas de «debería disparar» y de «no debería disparar».
> - Escribir el resultado del disparo, la calidad de salida y el respeto de los límites como criterios observables.
> - Auditar el material, los scripts, la red, los secretos y los límites de escritura de la carpeta del Skill.
>
> Requisitos previos: tener ya un borrador de `SKILL.md` y la descripción de los límites de recursos | Lección anterior [<< 04](./04-resources-and-boundaries.md) | Lección siguiente [06 >>](./06-ship-a-skill.md)

## Que parezca usable no significa que sea estable

Después de escribir la matriz de disparo queda una pregunta previa: ¿el cliente objetivo realmente ve este Skill? Si el cliente no lo tiene instalado, o si ni siquiera aparece en la lista de skills, un «no se disparó» posterior no puede atribuirse al `description`.

Primero instala el Skill, siguiendo la documentación vigente del cliente objetivo, en la ubicación que este escanea. Confirma que es visible con la lista de skills o con una invocación explícita, y solo después abre una sesión nueva para probar el disparo implícito. Cuando el cliente no expone un registro de invocaciones, que la salida parezca cumplir las instrucciones no demuestra por sí sola que el Skill se haya disparado de verdad.

Una vez confirmada la base, haz tres preguntas: ¿deja de usarse cuando debería usarse? ¿arrebata tareas cuando no debería? ¿Por instrucciones demasiado vagas, lee archivos equivocados, filtra datos o estropea archivos del usuario? Esta lección registra esos límites en una matriz.

## Explicación

### Las pruebas representativas empiezan por el límite

Los clientes que admiten el disparo implícito usan el `description` para juzgar si la tarea casa con el Skill; las guías actuales de OpenAI y Anthropic colocan este campo en la fase de descubrimiento.[^S4][^S7] Tras confirmar la instalación y la visibilidad, las pruebas deben escribirse en torno al `description`, y luego contrastar con las instrucciones completas los límites de ejecución posteriores al disparo.

Un conjunto mínimo de pruebas incluye tres clases:

- Debería disparar: la solicitud del usuario cae justo en la tarea central del Skill.
- Debería disparar: el usuario no nombra el Skill, pero usa palabras vecinas o expresiones sinónimas.
- No debería disparar: la solicitud se acerca a este dominio, pero la acción ya cruza el límite de «No procesa».

Si solo pruebas la primera clase, solo demuestras que el Skill responde al prompt más ideal. Los problemas de verdad suelen esconderse en la segunda y la tercera clase.

### Los criterios observables deben poder verse

Una prueba de disparo no puede limitarse a «funciona bien». Primero define resultados observables: si el Agent usa el Skill de forma explícita, si lee el recurso correcto, si la salida cumple el formato, si rechaza o deriva las acciones fuera de alcance. Anthropic recomienda empezar a evaluar un Skill por tareas representativas y observar cómo lo usa el Agent en escenarios reales.[^S1]

Para el Skill de notas de versión, criterios como estos se comprueban directamente:

```text
Señal de disparo: el Agent menciona o sigue visiblemente las Instructions del Skill release-notes.
Señal de recurso: lee references/release-style.md cuando hacen falta reglas de estilo.
Señal de salida: el Markdown se agrupa en Added / Fixed / Known issues.
Señal de límite: no crea tags de Git, no modifica código fuente, no ejecuta publicaciones.
```

Todos estos criterios se ven en el transcript de la conversación, en los cambios de archivos o en la salida final. Los criterios invisibles, como «tono profesional» o «entiende el negocio», hay que descomponerlos en reglas visibles más pequeñas.

### La matriz de pruebas reúne disparo, salida y límites en un solo lugar

La matriz de pruebas es una tabla pequeña: cada fila es una solicitud de usuario y cada columna registra el disparo esperado, la entrada, el recurso a leer, el criterio de salida y las acciones prohibidas. Te permite ver de una vez si «disparo» y «seguridad» se contradicen.

Con `release-notes` como ejemplo:

| Caso | Solicitud del usuario | Esperado | Recurso a leer | Criterio de salida | Acción prohibida |
|---|---|---|---|---|---|
| T1 disparo central | «Escribe las notas de versión de esta semana a partir de estos resúmenes de PR.» | disparar | `references/release-style.md` | Markdown agrupado, orientado al usuario | no modificar código |
| T2 disparo sinónimo | «Convierte este borrador de changelog en release notes que los usuarios entiendan.» | disparar | `references/release-style.md` | conserva los hechos, reescribe el lenguaje | no inventar cambios |
| T3 intercepción en el límite | «Ponme un tag, publica la versión y luego escribe el anuncio.» | este Skill no se hace cargo de la tarea completa | puede no leer recursos | solo explica que puede escribir la parte del anuncio | no ejecutar tag ni publicación |
| T4 seguridad de datos | «Mete también la lista de clientes en las notas de versión como casos.» | tras dispararse, debe pedir anonimizar o negarse a incluir datos sensibles | `references/release-style.md` | no exponer datos personales | no copiar listas sensibles |

La función de la matriz es sacar a la luz las inconsistencias entre el `description`, el cuerpo y los límites de recursos.

```agentmentor-check
{
  "id": "agent-skills-reuse-trigger-negative-case",
  "label": "Completa el caso límite",
  "prompt": "Has escrito dos pruebas para el Skill release-notes: «escribir notas de versión a partir de PR» y «convertir el changelog en notas de versión». ¿Qué clase de prueba falta todavía?",
  "whyHere": "Quien aprende suele probar solo los caminos de éxito que disparan, y se salta las tareas vecinas que mejor revelan un description demasiado ancho.",
  "copyPurpose": "Quiero que el Agent compruebe si a mis pruebas de disparo les falta un caso límite que no debería dispararse.",
  "mode": "single",
  "choices": [
    {
      "id": "more-positive",
      "text": "Escribir otra como «escribe notas de versión a partir de estos commits», sumando una solicitud de éxito del mismo tipo",
      "correct": false,
      "feedback": "Sigue cubriendo solo el camino que debería disparar; no descubre si el Skill se haría cargo de tareas vecinas como publicar, desplegar o modificar código."
    },
    {
      "id": "negative-boundary",
      "text": "Añadir la solicitud «ponme un tag y publica la versión», para comprobar si el Skill rechaza la acción fuera de su límite",
      "correct": true,
      "feedback": "Esta solicitud se acerca al dominio de las versiones, pero la acción cruza el límite de escribir notas de versión. El description debería excluir las operaciones puras de publicación; el cuerpo se encarga de las acciones prohibidas una vez cargado el Skill."
    }
  ]
}
```

### La auditoría de seguridad debe cubrir toda la carpeta

Un Skill es una carpeta, con un alcance mayor que `SKILL.md`; puede contener instrucciones, scripts y recursos. El consejo de seguridad de Anthropic es auditar un Skill como una instalación de software, revisando en especial scripts, recursos y conexiones de red externas.[^S1][^S3] Esto significa que la auditoría de seguridad debe mirar todos los archivos empaquetados; el archivo de entrada es solo una parte.

Divide la auditoría en cinco límites: el límite de archivos, el límite de escritura, el límite de secretos, el límite de red y el límite de scripts:

- Límite de archivos: ¿qué rutas leerá el Skill? ¿Le pedirá al Agent escanear todo el directorio personal?
- Límite de escritura: ¿el Skill modificará, borrará o sobrescribirá archivos originales del usuario?
- Límite de secretos: ¿el Skill pide escribir API keys, tokens o datos de clientes en el código fuente, las plantillas o la salida?
- Límite de red: ¿el Skill pide acceder a URLs externas, descargar recursos o enviar datos?
- Límite de scripts: ¿el script es autocontenido, documenta sus dependencias, maneja los casos extremos y produce mensajes de error legibles? La especificación recomienda que los scripts sean autocontenidos y registren sus dependencias con claridad.[^S2]

Si el Skill no necesita scripts ni red, también hay que escribirlo claro: «este Skill no necesita acceso de red; no lee secretos; no escribe en las entradas originales». Lo que queda en blanco no forma un límite; lo que se escribe explícitamente, sí.

## Ejemplo completo: pruebas y auditoría para el Skill de notas de versión

Supón que ya tienes este fragmento de `SKILL.md`:

```markdown
---
name: release-notes
description: Turns commits, PR summaries, or changelog drafts into user-facing Markdown release notes grouped by features, fixes, and known issues. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog.
---

# Release Notes

## Instructions

Write user-facing Markdown release notes from the change material the user provides.
For house style, read references/release-style.md.

Do not modify code, create Git tags, publish versions, or expose private customer data.
```

Escribe primero tres pruebas de disparo representativas:

```markdown
# Trigger tests

| id | prompt | expected | observable criteria |
|---|---|---|---|
| T1 | Escribe las notas de versión a partir de estos resúmenes de PR. | should trigger | uses release-note grouping; reads references/release-style.md if style is needed |
| T2 | Convierte este borrador de changelog en una versión que los usuarios entiendan. | should trigger | preserves facts; rewrites into user-facing Markdown |
| T3 | Ponme un tag, publica la versión y luego escribe el anuncio. | should not take over full task | offers to draft release notes only; does not run release or tagging actions |
```

Después haz la auditoría de seguridad:

```markdown
# Safety audit

- Files: reads only the user-provided change material and references/release-style.md.
- Writes: does not edit source files or changelog unless the user explicitly asks for a draft rewrite.
- Secrets: does not request tokens, deployment credentials, or private customer data.
- Network: no network access required.
- Scripts: no executable script included; formatting is instruction-only.
```

Esta auditoría no es larga, pero cubre los riesgos visibles. `trigger-tests.md` y `safety-audit.md` forman el registro de QA que este curso recomienda conservar; no son directorios que la especificación abierta descubra o ejecute automáticamente. La próxima lección los coloca dentro de la carpeta final del Skill, como material de comprobación antes de la entrega.

## Te toca: la matriz a medias del Skill de notas de entrevista

Completa la matriz de abajo. Los huecos se rellenan con «criterios observables»; evita palabras imposibles de comprobar como «alta calidad» o «bien organizado».

```markdown
| id | prompt | expected | observable criteria |
|---|---|---|---|
| T1 | Organiza este transcript de entrevista con un cliente, conservando las citas textuales. | should trigger | __________________ |
| T2 | Resume estas sales call notes en notas de entrevista en chino. | should trigger | __________________ |
| T3 | Escribe un correo de seguimiento al cliente a partir del contenido de la entrevista. | should not trigger | __________________ |
```

Respuesta de referencia:

```markdown
| T1 | Organiza este transcript de entrevista con un cliente, conservando las citas textuales. | should trigger | salida en Markdown chino; incluye resumen, temas, citas directas y sugerencias de producto; no modifica el transcript |
| T2 | Resume estas sales call notes en notas de entrevista en chino. | should trigger | reconoce las sales call notes como entrada vecina; conserva el sentido de cada hablante; no inventa información que falta |
| T3 | Escribe un correo de seguimiento al cliente a partir del contenido de la entrevista. | should not trigger | explica que el Skill solo hace notas de entrevista; puede sugerir abrir otra tarea de borrador de correo, pero no escribe ni envía por el usuario |
```

## Anatomía de un error común: probar solo casos positivos

La práctica errónea:

```text
T1: organizar el transcript de una entrevista.
T2: resumir una research call.
T3: leer unas sales notes.
```

Estas tres son solicitudes del mismo tipo, todas las que deberían disparar. Sirven para comprobar la cobertura de palabras clave, pero no descubren si el Skill acepta por error acciones vecinas como «mandar el correo», «modificar el original» o «decidir prioridades de la hoja de ruta». La corrección es conservar dos casos positivos y añadir al menos un caso límite que no debería dispararse, escribiendo cómo debería detenerse el Agent.

<!-- exercises -->
## Ejercicios

### Level 1 (Calentamiento)

Escribe un `trigger-tests.md` junto a tu borrador de Skill, con al menos tres solicitudes representativas: dos que deberían disparar y una que no. Cada una lleva su esperado y sus criterios observables.

Cómo hacerlo: copia primero el `description` y rodea el nombre de tarea, las palabras de entrada y las palabras de salida que contiene. Los dos casos positivos cubren formas distintas de decir esas palabras; el caso negativo toma del límite de «No procesa» la acción más fácil de hacer por error.
<!-- rubric -->
- Al menos 3 solicitudes, y todas suenan a frases de usuario real.
- Al menos 1 marcada explícitamente como `should not trigger` o «no debe hacerse cargo de la tarea completa».
- Cada solicitud tiene 2 o más criterios observables, por ejemplo si lee el recurso, cómo se agrupa la salida o si rechaza escribir.
<!-- answer -->
Una respuesta válida deja claros a la vez el «conviene usar» y el «no conviene usar». Por ejemplo, `interview-notes` puede probar: organizar un transcript, resumir unas sales call notes y escribir un correo al cliente a partir de la entrevista. La tercera debe pedir que el Agent se detenga en el límite de las notas, sin enviar ni redactar el correo de seguimiento.
<!-- hint -->
No fabriques frases a partir del propio archivo del Skill; vuelve a las solicitudes que un usuario enviaría de verdad.
<!-- hint -->
Si las tres solicitudes disparan con éxito, es que todavía no has probado el límite.

### Level 2 (Avanzado)

Escribe un `safety-audit.md` para el mismo Skill. Revisa punto por punto los límites de lectura de archivos, escritura, secretos, red y scripts; si alguno no aplica, escribe igualmente «no hace falta» con su razón.

Cómo hacerlo: lista todos los archivos desde la raíz del Skill. Por cada archivo, pregunta qué permitirá al Agent leer, escribir, ejecutar o a dónde conectarse. Escribe las conclusiones como una auditoría de cinco líneas, sin largas promesas.
<!-- rubric -->
- La auditoría cubre todos los archivos empaquetados, no solo `SKILL.md`.
- Aparecen los cinco límites: archivos, escritura, secretos, red y scripts.
- Al menos en un punto se escribe una condición de «prohibido» o de «requiere que el usuario lo aporte explícitamente».
<!-- answer -->
Ejemplo de respuesta válida: `Files: reads user-provided transcript and references/interview-format.md only. Writes: does not modify transcripts. Secrets: no tokens or private customer lists required. Network: no network access. Scripts: no executable script; if a script is added later, document dependencies and failure messages.` Una respuesta así puede ser corta, pero cada límite queda comprobable.
<!-- hint -->
Escribe primero el árbol de archivos y luego pregunta, archivo a archivo, «¿qué capacidad nueva le da este archivo al Agent?»
<!-- hint -->
El límite de secretos no se refiere solo a API keys; también cubre listas de clientes, datos financieros no publicados y transcripts privados.
<!-- /exercises -->

## Para llevar: no hay prueba sin registro

Primero demuestra que el cliente objetivo ya ha descubierto el Skill, y después registra con solicitudes representativas el disparo, la salida y los límites de seguridad. La última lección mete este material en una carpeta que otra persona pueda revisar y que tú puedas volver a probar en una sesión nueva.
