# Lección 1: Reutilización de prompts y límites de un Skill

> Objetivos de esta lección:
> - Identificar un flujo de trabajo reutilizable a partir de una tarea real que se repite.
> - Distinguir las responsabilidades de un prompt de un solo uso, una tarea repetida y un Skill.
> - Escribir un Skill brief de cuatro líneas: Disparador, Entrada, Salida y No procesa.
>
> Requisitos previos: saber usar un coding agent y poder editar Markdown | Página anterior [<< Índice del curso](./README.md) | Lección siguiente [02 >>](./02-skill-metadata.md)

## La tarea que vuelves a explicar cada vez

Seguro que ya te ha pasado: cada vez que le pides al Agent que redacte el informe semanal, revise un PR, organice las notas de una reunión o genere las notas de versión, tienes que volver a explicar el tono, los archivos de entrada, el formato de salida y qué directorios no debe tocar. Escribir ese prompt la primera vez es normal; si a la quinta sigues copiando el mismo bloque de instrucciones, el problema ya no es que «el prompt no esté bien escrito», sino que hay un flujo de trabajo repetido que nadie ha fijado.

Esta lección no te pide escribir un Skill completo todavía. Primero vamos a comprimir una tarea recurrente en un registro de límites de cuatro líneas, para que el `SKILL.md` posterior tenga un esqueleto claro.

## Explicación

### Empieza por una tarea concreta

Mira primero un prompt de un solo uso:

```text
Convierte la entrevista con el cliente de ayer en notas en chino. Conserva las citas textuales del cliente y termina con 3 sugerencias de mejora del producto. No modifiques el transcript original.
```

Esta frase basta para una tarea única. El problema aparece a la segunda y a la tercera vez: otra vez tienes que explicar «cómo se conservan las citas textuales», «qué tan concretas deben ser las sugerencias» y «qué archivos no se tocan». Un prompt de un solo uso es una instrucción escrita para la conversación actual; puede ser corto o largo, pero por defecto no se convierte en una capacidad que el Agent descubra por sí mismo más adelante.

Cuando el mismo tipo de tarea aparece una y otra vez, con entradas parecidas, salidas parecidas y límites parecidos, estás ante una tarea repetida. Una tarea repetida no es sinónimo de trabajo molesto; su rasgo clave es que puedes decir con claridad cuándo hay que hacerla, con qué materiales, qué se entrega y qué no debería hacerse de paso.

### Ponle nombre a la tarea repetida: un flujo de trabajo reutilizable

Un flujo de trabajo reutilizable es un conjunto de pasos, restricciones y criterios de salida que puede invocarse de nuevo. Anthropic describe un Skill como un directorio que contiene `SKILL.md`, instrucciones, scripts y recursos; OpenAI/Codex también usa los Agent Skills como extensión de capacidades orientada a tareas para ChatGPT y Codex.[^S1][^S4]

Un Agent Skill permite al Agent descubrir, leer y ejecutar un conjunto de materiales de flujo de trabajo cuando llega la tarea adecuada. Frente a un prompt de un solo uso, añade una entrada descubrible, límites estables y recursos bajo demanda, pero no se hace cargo de un sistema de negocio entero.

Para decidir si una tarea repetida merece convertirse en Skill, hazte cuatro preguntas:

- Disparador: ¿qué dice el usuario, o qué material presenta, para que el Agent deba pensar en este Skill?
- Entrada: ¿qué archivos, campos o contexto necesita el Agent?
- Salida: ¿en qué formato debería entregar el resultado?
- No procesa: ¿qué tareas vecinas es fácil hacer por error, pero no pertenecen a este Skill?

Esas cuatro líneas son el Skill brief que usa este curso. Todavía no son campos formales de la especificación, sino un boceto del límite de responsabilidad antes de escribir `SKILL.md`.

### Estrecha el límite de responsabilidad del Skill

El límite de responsabilidad dice qué hace el Skill y también qué no hace. Si el límite es demasiado estrecho, el Agent solo puede atender un único ejemplo; si es demasiado ancho, el Agent arrastrará también las tareas vecinas. Anthropic recomienda empezar por la solución más simple y componible, y la guía actual de OpenAI también pide que cada Skill se centre en un solo trabajo.[^S4][^S5]

Por ejemplo, «ayúdame con el contenido» es demasiado ancho; «convertir el transcript de una entrevista con un cliente en notas en chino con evidencia de citas textuales» encaja mucho mejor con un Skill. Tiene disparador, entrada y salida claros, y también permite decir qué no procesa: no hace seguimiento comercial, no modifica el transcript y no decide por el producto.

Glosario de esta lección:

- prompt de un solo uso: una instrucción de tarea que solo sirve a la conversación actual.
- tarea repetida: una tarea que aparece muchas veces con entradas y salidas de forma parecida.
- flujo de trabajo reutilizable: un conjunto de pasos, restricciones y criterios de salida que puede invocarse de nuevo.
- límite de responsabilidad: el alcance que define qué procesa un flujo de trabajo y qué no procesa.

```agentmentor-check
{
  "id": "agent-skills-reuse-skill-boundary",
  "label": "Estrecha el límite de las notas de entrevista",
  "prompt": "Cada semana le pides al Agent que convierta transcripts de reuniones con el mismo formato en notas, pero a veces también le encargas de paso las acciones comerciales posteriores. ¿Cuál de estos límites de Skill es más estable?",
  "whyHere": "Este paso comprueba si la persona que aprende mezcla un flujo de trabajo reutilizable con acciones de negocio vecinas.",
  "copyPurpose": "Quiero que el Agent compruebe si he escrito el límite de responsabilidad de un Skill de forma demasiado ancha.",
  "mode": "single",
  "choices": [
    {
      "id": "wide",
      "text": "Crear un customer-success-skill que se encargue de notas, seguimiento, agenda y todas las operaciones con clientes",
      "correct": false,
      "feedback": "Ese límite cubre varios tipos de salida y de decisiones; la condición de disparo se vuelve difusa y es más fácil hacer por error tareas vecinas."
    },
    {
      "id": "focused",
      "text": "Crear un interview-notes-skill que solo convierte transcripts en notas con evidencia de citas textuales",
      "correct": true,
      "feedback": "Este límite gira en torno a una entrada estable y una salida estable; las acciones comerciales posteriores puede atenderlas otro flujo de trabajo."
    }
  ]
}
```

## Ejemplo completo: el Skill brief de notas de entrevista

Supón que cada semana organizas entrevistas con clientes. La tarea original es:

```text
Lee los transcripts de entrevistas en transcripts/ y genera notas en chino que conserven las citas textuales del cliente y terminen con sugerencias de producto.
```

Reescrita como Skill brief de cuatro líneas:

```text
Disparador: el usuario pide organizar entrevistas con clientes, transcripts de investigación de usuarios o sales call notes.
Entrada: uno o más textos de transcript, idealmente con hablantes y orden temporal.
Salida: notas en chino en Markdown, con resumen de temas, evidencia con citas textuales del cliente, lista de preguntas y 3 sugerencias de producto.
No procesa: no modificar el transcript original, no enviar correos en nombre del usuario, no decidir prioridades de la hoja de ruta.
```

Estas cuatro líneas convierten la explicación repetida en un límite revisable, pero no se transforman una a una en campos formales. Al escribir el `description`, incluye la capacidad, las condiciones de disparo positivas y la desambiguación negativa que sea realmente necesaria; los detalles de entrada, los requisitos completos de salida y las prohibiciones de ejecución se quedan en el cuerpo. Por ejemplo, «no lo uses para enviar correos» sirve para excluir tareas de correo y debería condensarse en el `description`; «no modifiques el transcript original» es una regla del cuerpo que debe cumplirse incluso después de que el Skill se haya cargado.

## Ejemplo a medias: el Skill brief de notas de versión

Completa este borrador a medias. Ojo: la línea «No procesa» debe bloquear una tarea vecina que es muy fácil hacer por error de paso.

```text
Disparador: el usuario pide generar notas de versión a partir de commits de Git, PRs o borradores de changelog.
Entrada: ________________________________.
Salida: ________________________________.
No procesa: ________________________________.
```

Respuesta de referencia:

```text
Entrada: lista de commits, resúmenes de PR o un borrador de changelog existente, más el tipo de audiencia objetivo.
Salida: notas de versión en Markdown orientadas al usuario, agrupadas en novedades, correcciones y problemas conocidos.
No procesa: no modificar código, no crear tags de Git, no decidir en lugar del responsable si se publica.
```

Tu redacción puede ser distinta, pero debe permitir al Agent juzgar «cuándo conviene usarlo» y «cuándo hay que parar».

<!-- exercises -->
## Ejercicios

### Level 1 (Calentamiento)

En tu propio directorio de trabajo real, busca una tarea que hayas tenido que explicar al Agent al menos tres veces y escribe su Skill brief de cuatro líneas. No crees un Skill formal todavía; hazlo solo en un Markdown de borrador o en tus notas.

Cómo hacerlo: abre ese directorio, revisa las instrucciones de tarea o conversaciones recientes, copia primero el fragmento de prompt que más repites y luego comprímelo en las cuatro líneas «Disparador, Entrada, Salida, No procesa».
<!-- rubric -->
- Las cuatro líneas existen, y cada una describe un solo tipo de información.
- El disparador permite al Agent juzgar cuándo debería pensar en este flujo de trabajo.
- La línea «No procesa» bloquea al menos una tarea vecina real.
<!-- answer -->
Una respuesta válida parece un registro de límites, no un manual completo. Por ejemplo: «Disparador: el usuario pide generar notas a partir de un transcript de reunión; Entrada: un transcript; Salida: notas en chino en Markdown; No procesa: no enviar correos ni agendar reuniones». El error típico es escribir en el límite cosas como «hazlo con cuidado» o «salida de alta calidad»; esas palabras no ayudan al Agent a juzgar el alcance de la tarea.
<!-- hint -->
Empieza por el fragmento de prompt que más copias y pegas.
<!-- hint -->
Si la línea «No procesa» no te sale, recuerda qué ha hecho el Agent de más alguna vez.

### Level 2 (Avanzado)

Escribe la misma tarea repetida en tres versiones de brief: «demasiado estrecha», «demasiado ancha» y «adecuada», y explica por qué eliges la versión adecuada.

Cómo hacerlo: escribe tres grupos de briefs de cuatro líneas sobre la misma tarea real. La versión demasiado estrecha solo cubre un ejemplo; la demasiado ancha se traga procesos vecinos; la adecuada conserva una entrada estable y una salida estable.
<!-- rubric -->
- Las tres versiones giran en torno a la misma tarea, no a tres tareas distintas.
- El riesgo de la versión demasiado estrecha y el de la demasiado ancha están escritos en una frase cada uno.
- El formato de salida y el límite de «No procesa» de la versión adecuada son comprobables.
<!-- answer -->
Ejemplo: para las notas de versión, la versión demasiado estrecha podría tratar solo los 5 commits de hoy de un repositorio concreto; la demasiado ancha podría incluir modificar código, crear tags y avisar a los usuarios; la adecuada solo genera notas de versión orientadas al usuario a partir del material de cambios dado. La razón para elegir la adecuada es que se puede reutilizar sin sustituir la decisión de publicar.
<!-- hint -->
La versión demasiado estrecha suele incluir fechas concretas, nombres de archivo concretos o nombres de proyecto de un solo uso.
<!-- hint -->
La versión demasiado ancha suele incluir palabras como «todo», «encargarse por completo» o «de principio a fin».
<!-- /exercises -->

## Para llevar: un brief listo para reescribir

Este brief de cuatro líneas ya marca dónde empieza la tarea, qué necesita, qué entrega y dónde se detiene. El siguiente paso es traducirlo a un `SKILL.md` formal: en la fase de descubrimiento solo se conserva la información suficiente para elegir el Skill; los detalles de ejecución pasan al cuerpo.
