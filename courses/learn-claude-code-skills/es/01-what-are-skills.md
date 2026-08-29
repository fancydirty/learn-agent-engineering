# Lección 1: Qué son las Skills: por qué necesitas flujos de trabajo propios

> Objetivos de aprendizaje:
> - Entender el problema de fondo que resuelven las Skills
> - Reconocer qué situaciones de trabajo vale la pena automatizar con una Skill
> - Entender el mecanismo básico con el que funcionan las Skills
>
> Requisitos: Ya usaste las funciones básicas de Claude Code | Siguiente: [Lección 2 >>](./02-skill-anatomy.md)

## Explicas el mismo proceso una y otra vez

Estás usando Claude Code para ordenar las notas de una reunión. Escribes: «Toma esta transcripción de la reunión y conviértela en puntos estructurados: sepárala en decisiones, tareas pendientes y preguntas abiertas, y etiqueta cada tarea con un responsable y una fecha límite».

Claude lo hace. El resultado es bueno.

Al día siguiente, otra reunión. Escribes lo mismo de nuevo.

Día tres, día cuatro. Después de cada reunión vuelves a dar las mismas instrucciones. Claude acierta siempre, pero cada vez tienes que explicarlo desde cero.[^S1]

**Ese es el problema que resuelven las Skills**: tomar un flujo de trabajo que explicas una y otra vez y empaquetarlo como una instrucción reutilizable. Lo escribes una sola vez y lo invocas cuando lo necesites.[^S2]

## Qué es una Skill

**Una Skill es un directorio que contiene un archivo SKILL.md donde le dices a Claude cómo hacer una tarea concreta.**[^S4]

Piénsalo como un procedimiento escrito que le entregas a Claude. Anotas los pasos con claridad y Claude trabaja a partir de ellos. Se acabó eso de empezar la explicación de nuevo.[^S3]

Por ejemplo, el núcleo de una Skill para notas de reunión podría verse así:

```markdown
---
name: meeting-notes
description: Convierte la grabación o transcripción de una reunión en decisiones, tareas pendientes y preguntas abiertas
---

# Ordenar notas de reunión

## Pasos

1. Lee el contenido de la reunión (transcripción o archivo de grabación)
2. Extrae cada decisión que realmente se tomó, una por línea
3. Extrae cada tarea pendiente con este formato: [tarea] - responsable - fecha límite
4. Enumera como preguntas abiertas todo lo que surgió pero no se decidió
5. Ordena la salida por fecha, con las fechas límite más próximas primero
```

Una vez guardado, escribes `/meeting-notes` junto con el contenido de la reunión y Claude ya sabe qué hacer.[^S1]

## Qué escenarios encajan con una Skill

**Los escenarios que encajan con una Skill comparten tres rasgos:**

1. **Repetición**: haces lo mismo cada semana, cada día, a veces cada hora
2. **Pasos fijos**: el proceso se puede escribir como pasos claros en vez de cambiar cada vez
3. **Verificable**: puedes saber si Claude lo hizo bien

**Casos típicos que encajan:**

- Revisión de código (contrastar el trabajo con las convenciones de tu equipo)
- Conversión de formato de documentos (de Markdown a Word, conservando un formato específico)
- Análisis de logs (extraer la señal útil de los logs de error)
- Generación de casos de prueba (convertir la descripción de una funcionalidad en escenarios de prueba)
- Normalización de mensajes de commit (reescribir commits escuetos en el formato acordado por tu equipo)

**Escenarios que no encajan con una Skill:**

- Tareas de una sola vez (como «ayúdame a diseñar la disposición de esta página»)
- Tareas que necesitan mucho criterio humano en cada pasada
- Trabajo creativo totalmente abierto

```agentmentor-check
{
  "id": "skills-zh-01-scenario-judge",
  "label": "Juzgar si el escenario de commits a changelog encaja con una Skill",
  "prompt": "Todos los días conviertes los mensajes de commit de Git de tu equipo en un changelog que los clientes puedan leer. Los pasos son fijos: filtrar los commits internos, reescribir la jerga en lenguaje sencillo, agrupar por funcionalidad. ¿Este escenario encaja con una Skill?",
  "whyHere": "Acabas de aprender los tres rasgos que hacen que un escenario encaje con una Skill (repetición, pasos fijos, verificable). El error habitual en este punto es confundir un *contenido* que varía con un *proceso* que varía y descartar un escenario que en realidad encaja, así que vale la pena poner a prueba los criterios en un caso concreto antes de seguir.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No — el contenido de los commits es distinto cada día",
      "correct": false,
      "feedback": "Que el contenido cambie no es un problema. Una Skill captura un **proceso** que se repite, no un contenido que se repite. Mientras filtrar → reescribir → agrupar siga igual, el escenario encaja."
    },
    {
      "id": "b",
      "text": "Sí — el proceso es fijo, se repite a diario y lo puedes verificar",
      "correct": true,
      "feedback": "Correcto. Se cumplen los tres rasgos: se repite a diario, los pasos son fijos (filtrar → reescribir → agrupar) y puedes juzgar si el changelog reescrito es lo bastante bueno. Para esto sirven exactamente las Skills."
    }
  ]
}
```

## Cómo funcionan las Skills

Cuando creas una Skill, en realidad estás haciendo dos cosas:[^S5]

1. **Escribir el frontmatter YAML** (la parte de arriba del archivo envuelta en `---`), que le dice a Claude cómo se llama esta Skill y cuándo usarla
2. **Escribir las instrucciones en Markdown** (el cuerpo después del frontmatter), que le dice a Claude exactamente cómo llevar a cabo la tarea

**Hay dos formas de usarla:**

- **Invocación manual**: escribes `/meeting-notes`, Claude carga las instrucciones de esa Skill y las ejecuta
- **Activación automática**: dices «ordéname estas notas de reunión», Claude lee las descripciones, decide que la Skill meeting-notes es relevante y la carga por su cuenta[^S6]

La activación automática solo funciona si la description está bien escrita. Lo vemos en detalle en la lección 2.

## Dónde viven las Skills

**Hay dos ubicaciones:**[^S1]

- **Skills personales**: `~/.claude/skills/` — solo tuyas, disponibles en todos los proyectos
- **Skills de proyecto**: `.claude/skills/` — quedan en el directorio del proyecto, así tus compañeros las reciben al clonar el repositorio

Para tu primera Skill, empieza por las personales. Cuando hayas escrito unas cuantas y confirmes que de verdad son útiles, mueve las que más uses al directorio del proyecto para que el equipo las comparta.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Identificar tu primera Skill candidata

Repasa tu última semana de trabajo y encuentra una tarea que le hayas explicado a Claude al menos tres veces.

Anota lo siguiente:
1. ¿Cuál es la tarea?
2. ¿Sus pasos son fijos?
3. ¿Puedes saber si Claude lo hizo bien?

<!-- rubric -->
- La descripción de la tarea es lo bastante clara como para que otra persona entienda en qué consiste
- Se indica explícitamente si los pasos son fijos
- Se explica cómo se verificaría el resultado

<!-- answer -->
Respuesta de ejemplo:

**Tarea**: Clasificar los comentarios de clientes de un canal de Slack en reportes de errores, pedidos de funcionalidades y dudas de uso

**¿Pasos fijos?**: Sí. Siempre es leer los mensajes, decidir la categoría, archivarlo y agregar una etiqueta de prioridad

**¿Verificable?**: Sí. Puedo ver si las categorías son correctas y si las etiquetas de prioridad son razonables

**¿Encaja con una Skill?**: Sí. Mucha repetición, pasos fijos, verificable

<!-- hint -->
Si no se te ocurre nada, prueba con estos ángulos: algo que hagas a diario o cada semana, algo donde tus instrucciones a Claude ocupen más de tres frases, algo que quisieras que el resto de tu equipo hiciera igual

<!-- hint -->
No tiene por qué ser una tarea de programación. Ordenar documentos, limpiar datos, convertir formatos, revisar contenido — todo cuenta

<!-- /exercises -->

## Resumen

- **Las Skills empaquetan un flujo de trabajo repetitivo como una instrucción reutilizable**, así no tienes que explicarlo cada vez
- **Escenarios que encajan con una Skill**: repetición, pasos fijos, resultados verificables
- **Una Skill es un directorio más un archivo SKILL.md** que contiene frontmatter YAML e instrucciones en Markdown
- **Dos formas de usarla**: invocación manual (`/skill-name`) o activación automática (Claude decide a partir de la description)
- **Dos ubicaciones**: Skills personales (`~/.claude/skills/`) y Skills de proyecto (`.claude/skills/`)

En la próxima lección desarmamos un archivo SKILL.md real y vemos qué hace cada una de sus partes.

[Lección 2 >>](./02-skill-anatomy.md)
