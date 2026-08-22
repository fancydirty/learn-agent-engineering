# Lección 4: Recursos, scripts y límites de ejecución

> Objetivos de esta lección:
> - Distinguir los usos de `references/`, `assets/` y `scripts/`.
> - Juzgar si un material debe ir a las instrucciones, al material de referencia, a una plantilla o a un script.
> - Hacer una estratificación de recursos para una carpeta de Skill real, sin necesidad de saber programar.
>
> Requisitos previos: entender la capa de metadatos, la capa de instrucciones, la capa de recursos y la carga bajo demanda | Lección anterior [<< 03](./03-progressive-disclosure.md) | Lección siguiente [05 >>](./05-testing-and-safety.md)

## La capa de recursos también necesita límites

La lección 3 sacó el material largo fuera de `SKILL.md`. Pero después de sacarlo aparece un desorden nuevo: explicaciones de etiquetas, archivos de ejemplo, plantillas en blanco y comandos de comprobación, todo junto; el Agent no sabe qué es conocimiento, qué es una forma que debe copiar y qué es una acción que puede ejecutarse de forma estable.

Un mismo Markdown puede ser una regla, material de referencia o una plantilla de salida, según cómo deba usarlo el Agent. Aquí hay que decidir el destino de cada contenido: quedarse en las instrucciones, servir para que el Agent lo lea, servir para que lo copie y lo rellene, o reservarse para un script determinista. Este juicio no requiere escribir ni ejecutar scripts.

## Explicación

### `references/`: material de fondo para que el Agent lo lea

`references/` es bueno para explicaciones largas, glosarios, definiciones de etiquetas, reglas de revisión y análisis de ejemplos. Su rasgo es «leer y juzgar». El Agent lo lee para entender mejor los criterios de la tarea, no para copiarlo al pie de la letra.

En el Skill de notas de entrevista, `references/tag-guide.md` puede explicar las tres etiquetas `pain-point`, `workaround` y `buying-signal`, con un ejemplo de juicio para cada una. No debería cargar con el esqueleto de salida final, porque el uso principal del material de referencia es explicar.

### `assets/`: formas para que el Agent las reutilice

`assets/` es bueno para formas de salida estables y activos estáticos, por ejemplo notas en blanco, plantillas de configuración, imágenes o tablas de datos. Las plantillas de texto no necesitan un directorio `templates/` aparte; van directamente en `assets/` con un nombre de archivo que diga su uso. La especificación abierta y la guía actual de OpenAI usan esta convención de directorio.[^S2][^S4]

Si tus notas de entrevista tienen siempre las cuatro secciones «resumen, evidencia con citas textuales, temas, preguntas abiertas», mete ese esqueleto en `assets/note-template.md`. El Agent lo lee cuando necesita una forma fija y lo rellena con el material del usuario.

### `scripts/`: el lugar de la operación determinista

`scripts/` es bueno para operaciones repetibles, de reglas claras y con resultado comprobable. Por ejemplo: comprobar si un Markdown contiene los encabezados obligatorios, convertir un CSV a nombres de campo unificados, o revisar si falta una plantilla en un directorio. La documentación oficial lista los scripts como parte de lo que un Skill puede organizar, y también recuerda auditar dependencias, recursos y acceso de red externo antes de instalar.[^S1][^S3]

Este curso no te pide escribir código. Para juzgar si un script merece existir basta con tres preguntas: si la regla es fija, si hacerlo a mano es fácil de fallar y si el resultado de ejecutarlo puede comprobarse. Si las tres respuestas son claras, en el futuro puedes plantearte un script; si todavía hace falta mucho juicio semántico, déjalo en las instrucciones o en el material de referencia.

### El límite determinista: qué no entregar a un script

El límite determinista es la línea que separa «la máquina ejecuta según reglas» de «el Agent juzga según la semántica». Un script es bueno comprobando si un encabezado existe, si un nombre de archivo coincide o si un campo está vacío; el Agent es bueno juzgando si una cita textual de un cliente realmente sostiene una conclusión.

En las notas de entrevista, «comprobar si la salida contiene `## 原话证据`» puede ser un script; «juzgar si esta cita textual es una señal de compra fuerte» encaja mejor con material de referencia más el juicio del Agent. Meter a la fuerza un juicio semántico en un script suele producir reglas que parecen estables pero que en realidad son rígidas.

Glosario de esta lección:

- `references/`: directorio de material de referencia con contexto largo, explicaciones de reglas y criterios de juicio.
- `assets/`: directorio de activos estáticos con plantillas reutilizables, imágenes y archivos de datos.
- `scripts/`: directorio de scripts para operaciones de reglas claras, repetibles y comprobables.
- límite determinista: la frontera que separa la ejecución de reglas fijas del juicio semántico.

## Ejemplo completo: repartir seis contenidos del Skill de notas de entrevista en cuatro destinos

Supón que estás organizando este Skill ficticio:

```text
interview-notes/
  SKILL.md
```

Tienes seis contenidos en la mano:

```text
1. Cuando el usuario aporta un transcript, entregar notas en chino en Markdown.
2. No modificar el transcript original ni inventar citas textuales del cliente.
3. Explicación de las etiquetas pain-point, workaround y buying-signal.
4. Un esqueleto fijo de notas.
5. Tres transcripts ficticios con sus correspondientes ejemplos de buenas notas.
6. Comprobar si la salida incluye los encabezados «摘要», «原话证据» y «开放问题».
```

Primero reparte las reglas de lectura obligatoria. Los puntos 1 y 2 deben cumplirse en cada ejecución; se quedan en el cuerpo de `SKILL.md`:

```markdown
## Instructions

When the user provides interview transcripts, produce Chinese Markdown notes.
Preserve quoted evidence and do not modify the original transcript.
Do not invent quotes that are not present in the source material.
```

Después reparte los criterios de juicio que necesitan explicación. El punto 3 es material de referencia:

```text
references/tag-guide.md
```

Su función es ayudar al Agent a juzgar las etiquetas, no dar una maquetación fija a las notas finales.

Luego reparte la forma reutilizable. El punto 4 pertenece a una plantilla:

```text
assets/note-template.md
```

El Agent la lee cuando el usuario pide una estructura fija y la rellena con el contenido real.

El punto 5 puede ir a `references/examples.md`, porque sirve sobre todo para entender qué cuenta como «buenas notas». Si los ejemplos contuvieran información privada, no podrían entrar en un Skill público; aquí hay que usar material público o ficticio.

El punto 6 es el que se acerca al límite de scripts. Su regla es fija, la comprobación manual se deja cosas fácilmente y el resultado puede decir con claridad «qué encabezado falta». En el futuro podría vivir en:

```text
scripts/check-note-headings.js
```

Pero si no sabes programar, también vale escribirlo primero como una lista de comprobación en `references/quality-check.md`. Lo importante es no inventar scripts peligrosos de la nada y no dejar que un script modifique archivos del usuario; primero deja claro el límite.

Estructura final:

```text
interview-notes/
  SKILL.md
  references/
    tag-guide.md
    examples.md
    quality-check.md
  assets/
    note-template.md
  scripts/
    check-note-headings.js
```

Aquí `scripts/` es una posición futura, no código que esta lección te pida implementar ya. Tienes que saber explicar por qué pertenece a una comprobación determinista y no a un juicio semántico.

```agentmentor-check
{
  "id": "agent-skills-reuse-deterministic-boundary",
  "label": "Elige el script de comprobación de encabezados",
  "prompt": "En el Skill de notas de entrevista, ¿cuál de estas opciones encaja mejor para un futuro `scripts/` de comprobación determinista?",
  "whyHere": "El límite de los scripts es el punto más malentendido de esta lección: no toda tarea que parece repetida conviene entregarla a un script.",
  "copyPurpose": "Quiero que el Agent compruebe si estoy tomando un juicio semántico por una tarea de script determinista.",
  "mode": "single",
  "choices": [
    {
      "id": "semantic",
      "text": "Juzgar si una cita textual del cliente es una señal de compra fuerte",
      "correct": false,
      "feedback": "Eso requiere entender el contexto y la fuerza de la evidencia; encaja mejor con material de referencia más el juicio del Agent."
    },
    {
      "id": "deterministic",
      "text": "Comprobar si la salida incluye los tres encabezados «摘要、原话证据、开放问题»",
      "correct": true,
      "feedback": "La presencia de un encabezado es una regla fija y el resultado es fácil de comprobar; es apta para una futura conversión en script."
    }
  ]
}
```

## Ejemplo a medias: poner cada contenido en su lugar correcto

Abajo va la lista de recursos de un Skill de notas de versión. Coloca cada elemento en `SKILL.md`, `references/`, `assets/` o `scripts/`.

```text
A. Tras recibir el resumen de un PR, entregar notas de versión en Markdown orientadas al usuario.
B. No crear tags de Git ni ejecutar despliegues.
C. Explicación de cómo juzgar «breaking change», «known issue» y «migration note».
D. Estructura fija de las notas de versión: novedades, correcciones, problemas conocidos.
E. Comprobar si el Markdown contiene los encabezados de segundo nivel «novedades» y «correcciones».
```

Completa:

```text
`SKILL.md`: ________________________________
`references/`: ________________________________
`assets/`: ________________________________
`scripts/`: ________________________________
```

Respuesta de referencia:

```text
`SKILL.md`: A y B. Son las instrucciones centrales y los límites que toda tarea debe respetar.
`references/`: C. Explica criterios de juicio que el Agent necesita leer y entender.
`assets/`: D. Es un esqueleto de salida reutilizable, apto para copiar y rellenar.
`scripts/`: E. Es una comprobación de encabezados fija cuyo resultado se juzga con claridad.
```

Si metes C en un script, conviertes un juicio semántico en un casado rígido de palabras clave; si escribes D en largo dentro de `SKILL.md`, la entrada se vuelve pesada.

<!-- exercises -->
## Ejercicios

### Level 1 (Calentamiento)

Elige un borrador de Skill que ya hayas escrito, lista 8 contenidos y repártelos en cuatro destinos: `SKILL.md`, `references/`, `assets/`, `scripts/`. No hace falta escribir el script de verdad; basta con señalar qué contenidos podrían scriptarse en el futuro.

Cómo hacerlo: abre tu borrador o brief de Skill y descompón cada regla, ejemplo, plantilla y comprobación en elementos sueltos. Etiqueta cada uno al final como «lectura obligatoria cada vez», «leer y juzgar», «copiar y rellenar» o «comprobación fija».
<!-- rubric -->
- Al menos 8 contenidos listados.
- Al menos tres de las cuatro categorías tienen contenido; si alguna queda vacía, escribe una frase de justificación.
- Cada contenido lleva una frase con la razón de su asignación.
- Se señala al menos un juicio semántico que no conviene scriptar.
<!-- answer -->
Una respuesta válida mete «entrada, salida y límites de No procesa» en `SKILL.md`, «explicaciones de términos y ejemplos buenos y malos» en `references/`, «esqueleto fijo del informe» en `assets/`, y lista como candidatos futuros de `scripts/` comprobaciones fijas como «si el encabezado existe» o «si el campo está vacío». El error típico es listar «juzgar si el contenido tiene insight» como script; depende demasiado de la semántica y debe volver a los criterios de referencia y al juicio del Agent.
<!-- hint -->
No pienses todavía en nombres de directorio; pega a cada contenido una de las cuatro etiquetas.
<!-- hint -->
Si una frase contiene «juzgar si realmente sostiene la conclusión», normalmente no es un script determinista.

### Level 2 (Avanzado)

Haz una estratificación de recursos en tu carpeta real de Skill de práctica. Puedes crear solo archivos vacíos o de borrador, pero debe quedar un directorio legible: `SKILL.md` más al menos dos archivos de recurso. No pongas datos privados ni escribas scripts que modifiquen o borren archivos.

Cómo hacerlo: abre la carpeta del Skill de práctica en el IDE o en el terminal. Reduce el cuerpo de `SKILL.md` a las instrucciones centrales y los apuntes a recursos; crea al menos un archivo en `references/` y uno en `assets/`. Si crees que algo convendría a un script futuro, crea solo `scripts/README.md` explicando el objetivo de la comprobación, sin código ejecutable.
<!-- rubric -->
- El directorio contiene como mínimo `SKILL.md`, un archivo en `references/` y un archivo en `assets/`.
- El cuerpo de `SKILL.md` contiene apuntes a recursos, pero no embute material de referencia largo.
- Los nombres de archivo de recurso y los títulos de su contenido explican su uso.
- Sin material privado real, sin scripts peligrosos y sin comandos que modifiquen archivos del usuario automáticamente.
<!-- answer -->
Un directorio válido podría ser: `SKILL.md`, `references/tag-guide.md`, `assets/note-template.md`, `scripts/README.md`. El `SKILL.md` dice «cuando hagan falta definiciones de etiquetas, lee `references/tag-guide.md`; cuando haga falta una estructura fija de salida, lee `assets/note-template.md`». El `scripts/README.md` solo anota «en el futuro se puede comprobar si existen los encabezados obligatorios». Así la estratificación de recursos ya está hecha, aunque todavía no haya ningún script ejecutable.
<!-- hint -->
En la carpeta real puedes escribir primero contenido marcador muy corto, por ejemplo un título y dos notas.
<!-- hint -->
Si quieres escribir un script, reescríbelo primero como una frase con el objetivo de la comprobación; esta lección solo pide límites claros.
<!-- /exercises -->

## Para llevar: un mapa de capas donde cada cosa tiene su lugar

Con la estratificación de recursos terminada, las reglas de entrada, el material de referencia, la forma de salida y las comprobaciones fijas tienen cada uno su destino. La próxima lección devuelve este mapa de capas a tareas reales, para comprobar si el Skill aparece cuando debe, se detiene cuando no debe hacerse cargo, y si los archivos adjuntos traen riesgos.
