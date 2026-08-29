# Lección 4: Estado estructurado: cómo un agente recuerda en qué punto está una tarea

> Objetivos de aprendizaje:
> - Explicar por qué enterrar el progreso de una tarea en prosa conversacional no es fiable, y por qué tiene que convertirse en estado estructurado
> - Enunciar el ciclo de vida completo que recorre una tarea pendiente, desde su creación hasta su eliminación
> - Distinguir el coste de empezar de cero frente al de retomar desde donde se interrumpió el trabajo
> - Decidir si una pieza del estado de la tarea debería vivir en el historial de la sesión o escribirse en un punto de control separado
>
> Requisitos: terminar la Lección 3 y entender los dos modos de la memoria externa | Anterior: [Lección 3 <<](./03-external-memory-files.md) | Siguiente: [Lección 5 >>](./05-memory-boundaries-and-safety.md)

## Tras reiniciarse el proceso, ¿el agente sigue sabiendo en qué paso estaba?

Un agente va avanzando por una tarea de varios pasos: refactorizar un módulo, que se descompone en cuatro pasos — «actualizar las definiciones de tipos», «actualizar los puntos de llamada», «ejecutar las pruebas», «actualizar la documentación». Acaba de terminar el segundo paso cuando el proceso se interrumpe por un reinicio inesperado. Cuando vuelve a arrancar, se enfrenta a la misma descripción de la tarea. ¿Debería rehacer el paso uno desde cero, o sabe que ya terminó los dos primeros pasos y puede retomar directamente desde el paso tres?

La respuesta se reduce a una sola cosa: si el progreso de la tarea quedó registrado como **estado estructurado**, en lugar de esparcido por un montón de prosa conversacional. Si «las definiciones de tipos ya están actualizadas» no es más que una línea de lenguaje natural en una de las respuestas anteriores del modelo, sepultada entre decenas de mensajes, el código anfitrión no tiene forma fiable de extraer de ahí el hecho concreto «en qué paso estamos». Pero si ese progreso se expresa como una **lista de tareas pendientes** con campos fijos — donde cada tarea lleva un marcador de estado explícito —, el código anfitrión puede leerlo directamente: los pasos uno y dos están completos, el paso tres no ha empezado.

Esa es la pregunta central que aborda esta lección. Las Lecciones 1, 2 y 3 trataban todas de cómo gestionar el *contenido* — el historial de conversación, los archivos de memoria. Esta lección trata de cómo expresar el *progreso*, para que un agente o su aplicación anfitriona, tras una interrupción, sepa exactamente hasta dónde llegó la tarea.

## El ciclo de vida de una tarea pendiente: creada, activada, completada, eliminada

Tomemos como ejemplo la herramienta de seguimiento de tareas de Claude Code. La documentación oficial expone el ciclo de vida completo que recorre una tarea pendiente durante la ejecución — cuatro pasos:[^S4]

1. **Creada**: Claude añade la tarea pendiente como pending cuando identifica una tarea
2. **Activada**: Claude pone la tarea pendiente en in_progress cuando empieza el trabajo
3. **Completada**: Claude la marca como completed cuando la tarea termina con éxito
4. **Eliminada**: Claude borra una tarea pendiente que ya no necesita fijando status: "deleted" en una llamada TaskUpdate[^S4]

Estos cuatro pasos no son el vago «ya está» o «estoy en ello» del lenguaje natural. Son cuatro valores de estado explícitos: pending, in_progress, completed y deleted para la eliminación. Cada cambio de estado sucede a través de una llamada a herramienta explícita, no porque el modelo suelte un comentario en el texto de su respuesta.

La documentación también detalla cómo se manifiesta de verdad este mecanismo en la conversación: "In a session that has the task-tracking tools, Claude keeps a written todo list, updating each item's status as it works. You see each change in the message stream as a structured tool call."[^S4] (En una sesión que dispone de las herramientas de seguimiento de tareas, Claude mantiene por escrito una lista de tareas pendientes y va actualizando el estado de cada elemento a medida que trabaja. Ves cada cambio en el flujo de mensajes como una llamada a herramienta estructurada.) Esa frase fija la distinción clave: el progreso no se «refleja» pasivamente en la conversación, se escribe activamente como una llamada a herramienta que se puede identificar y analizar por sí sola. Esa es la diferencia real entre el estado estructurado y una descripción de progreso esparcida por la prosa.

```agentmentor-check
{
  "id": "mem-zh-04-structured-vs-prose",
  "label": "Juzgar cómo debería expresarse el progreso de una tarea",
  "prompt": "Un agente escribe en una respuesta: «Terminé de actualizar las definiciones de tipos y a continuación me ocuparé de los puntos de llamada». Comparado con una llamada a herramienta estructurada que mueve el estado de una tarea pendiente de pending a in_progress y luego a completed, ¿cuál es la diferencia entre ambos a la hora de que el código anfitrión pueda leer de forma fiable el progreso actual?",
  "whyHere": "Esta comprobación aparece justo después de mostrar que el ciclo de vida de la tarea pendiente se expresa mediante llamadas a herramienta estructuradas. Pone a prueba si el estudiante da por hecho que «que el modelo lo diga equivale a que el estado quede registrado», sin darse cuenta de que una descripción en lenguaje natural y un estado estructurado difieren de raíz en si un programa puede analizarlos de forma fiable.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Ninguna diferencia: ambos expresan el hecho de que las definiciones de tipos están actualizadas, y el código anfitrión los lee de la misma manera.",
      "correct": false,
      "feedback": "No es correcto. Una descripción en lenguaje natural es un fragmento de texto que produjo el modelo; su formato y su redacción pueden variar cada vez, y extraer de ahí de forma fiable «qué paso, qué estado» le resulta difícil al código anfitrión. Una llamada a herramienta estructurada tiene campos fijos (un identificador de tarea y un valor de estado, por ejemplo) que el código anfitrión puede leer directamente, sin adivinanzas y sin necesidad de comprender lenguaje natural."
    },

    {
      "id": "b",
      "text": "Sí hay diferencia: una llamada a herramienta estructurada tiene campos fijos que el código anfitrión puede analizar directamente para obtener un estado, mientras que una descripción en lenguaje natural necesita una interpretación extra para extraer la misma información, así que es mucho menos fiable.",
      "correct": true,
      "feedback": "Correcto. El valor del estado estructurado es que un programa puede leerlo directamente — campos como el identificador de tarea y el valor de estado son fijos, así que el código anfitrión no tiene que apoyarse en la comprensión del lenguaje para adivinar si «esta frase significa que la tarea está hecha». Por eso justamente la documentación insiste en que la herramienta de seguimiento de tareas hace que cada cambio de estado aparezca en el flujo de mensajes como una llamada a herramienta estructurada, no solo como una descripción de texto."
    },
    {
      "id": "c",
      "text": "Sí hay diferencia, pero es solo que una llamada a herramienta estructurada parece más formal; la cantidad de información que transmite en realidad es la misma.",
      "correct": false,
      "feedback": "La diferencia no es solo que «parezca más formal». Lo que importa es si un programa puede analizarla de forma fiable: una descripción en lenguaje natural no tiene formato ni redacción fijos, así que el código anfitrión no puede extraer de forma estable hechos estructurados como «qué paso, qué estado»; una llamada a herramienta estructurada tiene campos fijos. Es una diferencia funcional de fondo, no una cuestión de estilo."
    }
  ]
}
```

## Puntos de control: convertir la recuperación en algo distinto de empezar de cero

Una vez que tienes una lista de tareas pendientes estructurada, la siguiente pregunta es: ¿dónde vive la lista en sí? Si solo existe en el historial de conversación de esta sesión, en el momento en que la sesión termine de verdad (no una interrupción breve, sino un cierre completo, como la idea de la Lección 3 de que «cuando la sesión termina, todo lo que hay en la ventana desaparece»), el registro de progreso se esfuma con ella. En el fondo, la API no tiene estado: "The Messages API is stateless, which means that you always send the full conversational history to the API."[^S6] (La API de Mensajes no tiene estado, lo que significa que siempre envías el historial completo de la conversación a la API.)

Ese es el problema que resuelven los **puntos de control**: escribir el estado de una tarea en un momento dado — qué pasos están hechos, cuál es el paso actual, qué pasos quedan — en una pieza de datos, y persistirla en algún sitio fuera del tiempo de vida de la sesión. Los puntos de control usan el mismo mecanismo subyacente que la memoria externa de la Lección 3 (escribir un archivo, leerlo de vuelta más tarde); la diferencia es que un punto de control no guarda «conocimiento que vale la pena recordar», sino «hasta dónde llegó la tarea» — el tipo de estado que puedes usar directamente para reanudar la ejecución.

Con los puntos de control en su sitio, por fin se sostiene la **recuperabilidad**: tras un reinicio del proceso, el agente no tiene que adivinar «dónde estaba». Lee el punto de control más reciente, ve «los pasos uno y dos están completed, el paso tres está in_progress», y continúa desde el paso tres en lugar de rehacer los pasos uno y dos.

La comparación de costes aquí es concreta. En la tarea de refactorización, el paso «actualizar las definiciones de tipos», si es idempotente (ejecutarlo de nuevo produce el mismo resultado), solo cuesta tiempo perdido cuando se rehace desde cero. Pero si algún paso es una operación no idempotente como «insertar un registro de migración en la base de datos», empezar de cero podría insertar dos registros duplicados e incluso corromper datos. Lo que un punto de control ahorra no es solo tiempo — es el riesgo de volver a ejecutar por accidente ese tipo de operación no idempotente.

```agentmentor-check
{
  "id": "mem-zh-04-checkpoint-durability",
  "label": "Juzgar dónde tiene que vivir el estado de la tarea para ser fiable",
  "prompt": "El estado de la lista de tareas pendientes de un agente siempre ha vivido solo en el historial de conversación de la sesión actual y nunca se escribió en un archivo de punto de control separado. Si esta sesión se cierra por completo (no una interrupción breve, sino un final real), la próxima vez que empiece la misma tarea, ¿puede el agente seguir leyendo el progreso «los dos primeros pasos ya están hechos»?",
  "whyHere": "Esta comprobación aparece justo después de mostrar que un punto de control tiene que escribir el estado fuera del tiempo de vida de la sesión para que la recuperación funcione de verdad. Pone a prueba si el estudiante confunde «la lista de tareas pendientes está estructurada» con «la lista de tareas pendientes sobrevivirá necesariamente después de que termine la sesión» — estar estructurada solo resuelve «puede leerla un programa», no «sigue estando ahí después de que termine la sesión».",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sí, se puede leer, porque la lista de tareas pendientes ya es estado estructurado, y los datos estructurados no se pierden cuando termina una sesión.",
      "correct": false,
      "feedback": "«Estructurado» y «persistente» son dos cosas distintas. Estructurado resuelve «puede el código anfitrión analizar de forma fiable el estado actual»; no resuelve «siguen estando ahí estos datos después de que termine la sesión». La Lección 3 lo cubrió — una vez que una sesión termina, cualquier cosa de la ventana que no se haya movido a otro sitio desaparece para siempre. Si esta lista de tareas pendientes existe solo en el historial de conversación y nunca se escribió en un archivo de punto de control, desaparece junto con la sesión igualmente."
    },
    {
      "id": "b",
      "text": "No, no se puede leer, porque este estado existe solo en el historial de esta sesión y nunca se escribió en un punto de control, así que desaparece cuando termina la sesión.",
      "correct": true,
      "feedback": "Correcto. Que la lista de tareas pendientes esté estructurada solo afecta a si un programa puede analizarla de forma fiable; no afecta a si sobrevive después de que termine la sesión. Para que se pueda leer una vez que la sesión se cierra por completo, tienes que escribirla en un archivo de punto de control separado, igual que la memoria externa de la Lección 3 — el estado estructurado que vive solo en el historial de conversación no puede escapar del destino de esfumarse cuando termina la sesión."
    },
    {
      "id": "c",
      "text": "Sí, se puede leer, porque la herramienta de seguimiento de tareas sincroniza automáticamente cada cambio de estado al disco.",
      "correct": false,
      "feedback": "Esa es una premisa que no puedes dar por sentada. El trabajo propio de la herramienta de seguimiento de tareas es hacer que los cambios de estado aparezcan en el flujo de mensajes como llamadas a herramienta estructuradas. Que haya una capa extra que los sincronice al disco, o que el desarrollador tenga que implementar esa persistencia por su cuenta, depende del diseño concreto — no puedes asumir por defecto que «estructurado significa persistido automáticamente»."
    }
  ]
}
```

## El estado estructurado existe para que la interrupción sea superable

Volviendo al escenario con el que abrió esta lección: tras reiniciarse el proceso, ¿debería el agente empezar de cero o retomar desde donde se interrumpió? Ahora podemos responderlo con claridad — depende de si se hicieron dos cosas. ¿Se expresó el progreso de la tarea como estado estructurado (en lugar de esparcido por la prosa conversacional), y se escribió ese estado en un punto de control (en lugar de vivir solo en el historial de esta única sesión)? Necesitas ambas. Con estado estructurado pero sin punto de control, el estado desaparece igualmente cuando termina la sesión; con un punto de control pero sin estado estructurado, lo que se escribió en el punto de control es a su vez lenguaje natural vago, y leerlo de vuelta sigue sin decirte de forma fiable en qué paso quedó la tarea.

Esta lección trató de cómo expresar y preservar el progreso. La siguiente lección se vuelca en otra pregunta que importa igual de tanto: ¿podría este estado y esta memoria preservados convertirse en un objetivo para atacantes — qué pasa si un atacante puede escribir contenido en un punto de control o en un archivo de memoria?

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Etiquetar el estado del ciclo de vida de una única ejecución de tarea

Un agente recibe la tarea «añadir pruebas unitarias al proyecto» y la descompone en tres tareas pendientes: «escribir los casos de prueba», «ejecutar la batería de pruebas», «corregir los casos que fallan». Siguiendo el orden cronológico de abajo, anota en qué estado del ciclo de vida (pending / in_progress / completed / deleted) debería estar cada tarea pendiente en cada momento.

1. La tarea acaba de descomponerse; ninguna de las tres ha empezado.
2. El agente empieza a escribir los casos de prueba.
3. Los casos de prueba están escritos; el agente empieza a ejecutar la batería de pruebas.
4. Al ejecutar las pruebas se descubren dos casos que fallan (el caso A y el caso B). El agente refina «corregir los casos que fallan» en dos nuevas tareas pendientes, «corregir el caso A» y «corregir el caso B», y empieza a corregir el caso A.
5. Mientras corrige el caso A, resulta que el caso B era en realidad la propia prueba mal escrita y no necesita ningún cambio, así que «corregir el caso B» se elimina.

<!-- rubric -->
- Momento 1: las tres están en pending
- Momento 2: «escribir los casos de prueba» está en in_progress, el resto sigue en pending
- Momento 3: «escribir los casos de prueba» está en completed, «ejecutar la batería de pruebas» está en in_progress
- Momento 4: «ejecutar la batería de pruebas» está en completed, la «corregir los casos que fallan» original se refina, «corregir el caso A» está en in_progress, «corregir el caso B» está en pending
- Momento 5: «corregir el caso B» cambia a deleted, en lugar de simplemente desvanecerse de la lista sin dejar rastro

<!-- answer -->
Respuesta de referencia: en el momento 1, las tres tareas pendientes están en **pending** (creadas pero no iniciadas). En el momento 2, «escribir los casos de prueba» pasa a **in_progress**, mientras que las otras dos siguen en pending. En el momento 3, «escribir los casos de prueba» pasa a **completed** y «ejecutar la batería de pruebas» pasa a in_progress. En el momento 4, «ejecutar la batería de pruebas» pasa a **completed**; la «corregir los casos que fallan» original, un cajón de sastre, se refina en dos nuevas tareas pendientes, «corregir el caso A» y «corregir el caso B», con «corregir el caso A» en **in_progress** y «corregir el caso B» en **pending**. En el momento 5, tras descubrir que el caso B no necesita corrección, «corregir el caso B» debería tener su estado fijado en **deleted** mediante una llamada TaskUpdate — el cuarto paso del ciclo de vida, «eliminada», es exactamente lo que maneja este caso de «ya no se necesita», en lugar de dejar que el elemento se desvanezca en silencio de la lista sin dejar registro.

<!-- hint -->
Los cuatro estados corresponden a los cuatro pasos del ciclo de vida: creada corresponde a pending, activada a in_progress, completada a completed, ya no se necesita a deleted. Repasa cada elemento contra la sección «El ciclo de vida de una tarea pendiente» de esta lección, uno por uno.

<!-- hint -->
El momento 5 es donde es fácil pasar por alto el paso «pasa a deleted» y tratarlo como «este elemento ya no existe». Recuerda el punto de esta lección de que cada cambio de estado sucede a través de una llamada a herramienta explícita — la eliminación también necesita un cambio de estado explícito, no una desaparición implícita.

### Nivel 2: Diagnosticar un diseño de tarea no recuperable

Un equipo diseñó esta lógica de ejecución: el progreso de la tarea del agente aparece solo en el resumen en lenguaje natural de cada una de sus respuestas, algo como «hasta ahora los dos primeros pasos están hechos, actualmente ocupándome del tercero». Ese resumen existe solo en el historial de mensajes de la sesión actual; el equipo no escribe ningún archivo de punto de control. El sistema reinicia el proceso de vez en cuando por límites de recursos, y tras un reinicio se retoma la misma tarea.

Señala los dos problemas de este diseño (uno sobre «si el estado está estructurado», otro sobre «si el estado está persistido»), y da la dirección de corrección correspondiente para cada uno.

<!-- rubric -->
- Problema uno: un resumen en lenguaje natural no es estado estructurado, así que el código anfitrión no puede analizar de forma fiable «exactamente en qué paso quedó»
- Problema dos: el progreso existe solo en el historial de la sesión sin ningún punto de control escrito, así que en cuanto un reinicio del proceso pierde la sesión, el estado se pierde con ella
- Las correcciones corresponden respectivamente a: pasar a una lista de tareas pendientes con campos fijos (como el conjunto de estados pending/in_progress/completed/deleted), y además escribir el estado de la lista en un archivo de punto de control

<!-- answer -->
Respuesta de referencia: problema uno — el progreso existe solo como un resumen en lenguaje natural («hasta ahora los dos primeros pasos están hechos»), sin campos fijos, así que el código anfitrión no tiene forma de analizar de forma fiable «exactamente qué pasos están hechos, cuál es el paso actual». La redacción del resumen puede variar de un turno a otro, así que la lógica de análisis es fácil de equivocar o no se puede automatizar en absoluto. La corrección es pasar a una lista de tareas pendientes estructurada donde cada tarea pendiente tenga un campo de estado explícito (pending / in_progress / completed / deleted), con los cambios de estado hechos mediante llamadas a herramienta explícitas en lugar de reinterpretar lenguaje natural. Problema dos — incluso tras pasar a una lista estructurada, este estado sigue viviendo solo en el historial de mensajes de la sesión actual, y el equipo no escribe ningún archivo de punto de control separado. En cuanto un reinicio del proceso termina la sesión, el historial y la lista de tareas pendientes que hay dentro desaparecen juntos, y la próxima vez que se retome tampoco habrá forma de conocer el progreso. La corrección es persistir además el estado de la lista de tareas pendientes en un archivo de punto de control, para que tras un reinicio del proceso el agente lea primero el punto de control más reciente y luego decida desde qué paso continuar, en lugar de apoyarse solo en el historial de la sesión.

<!-- hint -->
Piensa en los dos problemas por separado: uno es «puede un programa leer de forma fiable esta descripción de progreso», el otro es «aunque pueda, ¿sigue estando ahí la descripción tras un reinicio del proceso?». Esta lección llama a estas dos cosas estado estructurado y puntos de control — resuelven problemas en niveles distintos.

<!-- hint -->
Recuerda el «cuando la sesión termina, todo lo que hay en la ventana desaparece» de la Lección 3 — si la lista de tareas pendientes vive solo en el historial de la sesión, entonces por muy estructurada que esté, en cuanto un reinicio del proceso termina la sesión desaparece junto con ella. Por eso justamente existen los puntos de control.

<!-- /exercises -->

## Resumen

- El progreso de una tarea solo lo puede leer de forma fiable el código anfitrión una vez que se convierte en estado estructurado; una descripción de progreso esparcida por respuestas en lenguaje natural no se puede analizar de forma estable para saber «en qué paso estamos ahora mismo»
- El ciclo de vida completo de una tarea pendiente son cuatro pasos — creada (pending), activada (in_progress), completada (completed), eliminada (deleted) — y cada paso sucede a través de una llamada a herramienta estructurada explícita que se puede observar en el flujo de mensajes
- Estructurado y persistente son dos cosas distintas: estructurado resuelve «puede leerlo un programa», un punto de control resuelve «sigue estando ahí el estado tras un reinicio del proceso o cuando termina la sesión» — necesitas ambas
- Un punto de control escribe el estado de una tarea en un momento dado en algún sitio fuera del tiempo de vida de la sesión, convirtiendo la recuperación en «continuar desde donde se interrumpió» en lugar de «empezar de cero», y evitando en especial volver a ejecutar por accidente operaciones no idempotentes
- El estado estructurado, igual que la memoria externa, se convierte en su propio objetivo de ataque una vez persistido — el tema de la siguiente lección; cuanto más preservas, más límites tienes que sostener

[>> Lección 5: Los límites y la seguridad de la memoria](./05-memory-boundaries-and-safety.md)
