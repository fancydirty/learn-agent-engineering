# Lección 1: Qué es un arnés: el código de control alrededor del modelo

> Objetivos de aprendizaje:
> - Trazar la línea entre el arnés y el modelo, y decir de qué lado cae «proponer una acción» y de qué lado cae «ejecutar y controlar»
> - Usar la diferencia entre agentes y flujos de trabajo para explicar qué le hace ganar a un sistema el nombre de «agente»
> - Decidir si un problema de «nuestro agente no es lo bastante confiable» habría que resolverlo en la capa del modelo o en la capa del arnés
>
> Requisitos: Terminaste los primeros seis cursos de esta serie y entiendes una sola ida y vuelta de llamada a herramienta (`stop_reason: "tool_use"` / `tool_result`) | Siguiente: [Lección 2 >>](./02-the-core-loop.md)

## Ya viste un arnés en aquella sola ida y vuelta

En «Llamada a herramientas del agente: lograr que los agentes hagan cosas de verdad» desarmaste una ida y vuelta completa de llamada a herramienta: el modelo ve tu pregunta más un manifiesto de herramientas, y regresa con `stop_reason: "tool_use"` y un bloque `tool_use` que dice «llama a esta herramienta, con estos parámetros». La documentación es tajante sobre lo que ocurre después: "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation."[^S2] (El modelo nunca ejecuta nada por su cuenta. Emite una solicitud estructurada, tu código —o los servidores de Anthropic— ejecuta la operación, y el resultado vuelve a fluir a la conversación.) Abrir el archivo, ejecutar el comando, hacer la llamada de red: todo eso es el código anfitrión que hace funcionar al agente. Cuando el anfitrión termina, envuelve la salida en un `tool_result`, la anexa a la conversación y dispara otra solicitud.

Ese bloque de código anfitrión —la parte que ejecuta herramientas y luego decide qué hacer a continuación— es el tema de esta lección. Tiene un nombre: el **arnés**, la capa de código de control envuelta alrededor del modelo.

Aquel curso anterior se detuvo tras una sola ida y vuelta, sin embargo. Los agentes reales rara vez van y vienen una sola vez. Una llamada a herramienta regresa, el modelo mira el resultado, y por lo general quiere llamar a otra herramienta, y a otra, girando y girando. ¿Quién impulsa ese girar y girar? ¿Quién decide cuándo es momento de parar? ¿Quién lo trae de vuelta cuando se desvía? Todo eso es tarea del arnés. Esta lección traza la línea entre arnés y modelo; las lecciones que siguen desarman el arnés, una pieza a la vez.

## Qué es un agente: un LLM que usa herramientas en un bucle

El equipo de ingeniería de Anthropic tiene una definición llana de los agentes: "They are typically just LLMs using tools based on environmental feedback in a loop."[^S1] (Son típicamente solo LLM que usan herramientas basándose en la retroalimentación del entorno, dentro de un bucle.) Tres palabras de esa oración cargan el peso: **herramientas**, **retroalimentación del entorno** y **bucle**. El modelo llama a una herramienta (herramientas), el anfitrión la ejecuta y devuelve el resultado (retroalimentación del entorno), el modelo lee el resultado y decide qué hacer a continuación, quizá llamando a otra herramienta, y así sigue (bucle). La ida y vuelta que aprendiste antes era la primera vuelta de exactamente este bucle.

Ese mismo artículo separa dos tipos de sistemas que la gente confunde sin parar. El primero es el **flujo de trabajo**: "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."[^S1] (Los flujos de trabajo son sistemas donde los LLM y las herramientas se orquestan a través de caminos de código predefinidos.) Haz esto, luego aquello, y en esta bifurcación ve a la izquierda: una persona lo dejó todo resuelto de antemano. El segundo es el **agente**: "Agents, on the other hand, are systems where LLMs dynamically direct their own processes and tool usage"[^S1] (Los agentes, en cambio, son sistemas donde los LLM dirigen dinámicamente sus propios procesos y su uso de herramientas).

Pon esas dos definiciones lado a lado y la diferencia no trata de qué tan fuerte es el modelo. Trata de **quién toma las decisiones de flujo de control**. En un flujo de trabajo, el siguiente paso está escrito en duro. En un agente, el siguiente paso es lo que sea que el modelo decida en el momento, dentro del bucle. Eso es lo que le hace ganar el nombre, en la formulación de la hoja de ruta: "An agent makes its own control-flow decisions inside a loop."[^S5] (Un agente toma sus propias decisiones de flujo de control dentro de un bucle.) Y lo que lleva ese bucle, lo que convierte las decisiones del modelo en efectos reales, es el arnés.

Un detalle de fraseo merece cuidado aquí. Decir «el modelo decide el siguiente paso» significa que el modelo propone una acción en cada turno. Si el bucle gira siquiera, si al modelo se le vuelve a preguntar: eso sigue dependiendo del código del arnés. El modelo propone, el arnés dictamina. Esa línea es el cimiento de todo lo que sigue.

## Mismo modelo, distinto arnés, resultados radicalmente distintos

Ahora, la única oración que esta lección más quiere que conserves. Una hoja de ruta comunitaria lo dice sin rodeos: **"Same model, different harness, completely different result."**[^S5] (Mismo modelo, distinto arnés, resultado completamente distinto.)

Al principio suena al revés. Estamos acostumbrados a cargar la confiabilidad de un agente a la cuenta del modelo: este es fuerte, aquel es débil. Pero piensa en lo que el modelo hizo de verdad en aquella ida y vuelta: miró la conversación actual y propuso la siguiente acción. Si esa acción de veras se ejecuta, si el bucle sigue después, si conviene detenerse tras veinte turnos infructuosos, si hay que consultar primero con una persona cuando la acción propuesta dejaría caer una tabla de la base de datos: ni una sola de esas es decisión del modelo. Cada una de ellas pertenece al arnés.

Aquí va una comparación concreta. Mismo modelo, mismo conjunto de herramientas, misma tarea: limpiar las dependencias sin usar de un proyecto.

- **El arnés A** ejecuta cada acción que el modelo propone, sin condiciones. Sin límite de turnos, sin comprobar si el agente está girando en el sitio. El modelo se equivoca en algún turno y propone un borrado erróneo; el arnés borra. Luego el modelo razona hacia adelante desde un estado que ya rompió, y un paso en falso se vuelve diez. El problema con sistemas así viene directo de la autonomía del agente: "The autonomous nature of agents means higher costs, and the potential for compounding errors."[^S1] (La naturaleza autónoma de los agentes implica costos más altos y el potencial de errores que se componen.)
- **El arnés B** ejecuta el mismo modelo y toma las mismas propuestas, pero esta capa de control acota el número de turnos, vigila si hay varios turnos seguidos sin progreso real, y se detiene a preguntarle a una persona antes de ejecutar una acción de alto impacto como un borrado. La misma mala propuesta topa aquí con una válvula de aprobación en vez de topar con el disco.

Modelo idéntico. Posiblemente propuestas idénticas en ambos casos. Una ejecución destroza el proyecto, la otra se mantiene en rieles. Toda la diferencia viene del código de control de afuera. Así que cuando tu agente sea poco confiable, no eches mano de un modelo más fuerte primero: buena parte de las veces el problema vive en la capa del arnés, no en la capa del modelo.

```agentmentor-check
{
  "id": "harness-zh-01-swap-model-vs-harness",
  "label": "Ubicar de qué capa proviene la falta de confiabilidad de un agente",
  "prompt": "Tu agente de vez en cuando borra un paquete que todavía está en uso mientras limpia dependencias sin usar, y el proyecto deja de compilar. Alguien propone cambiar el modelo subyacente por una versión más fuerte, lo cual debería resolverlo. ¿Es acertado ese juicio?",
  "whyHere": "Recién establecimos que el mismo modelo en un arnés distinto produce un resultado completamente distinto, y «solo usa un modelo más fuerte» es justo el instinto que tiene quien lee en este momento. El modelo mental de de qué capa proviene en realidad la confiabilidad hay que corregirlo aquí mismo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Es acertado. Un modelo más fuerte propone acciones más precisas, así que los borrados erróneos deberían cesar en su mayoría.",
      "correct": false,
      "feedback": "Esto confunde un modelo más fuerte con una garantía. Un modelo más fuerte puede bajar las probabilidades de un error de juicio, pero no puede llevarlas a cero. Mientras el modelo todavía pueda proponer un borrado erróneo, y el arnés todavía ejecute sin condiciones y sin pausar para confirmar, esa acción igual aterriza en el disco. Apostar la confiabilidad por entero a que el modelo nunca se equivoque le carga la tarea del arnés a la cuenta del modelo."
    },
    {
      "id": "b",
      "text": "Da lo mismo. El comportamiento del agente es esencialmente aleatorio, así que no hay forma de controlarlo de ninguna manera.",
      "correct": false,
      "feedback": "Eso lleva la conclusión demasiado lejos. El comportamiento del agente es precisamente lo que sí se puede controlar, y ese es todo el sentido de un arnés: los límites de turnos, la detección de falta de progreso y la aprobación humana antes de acciones peligrosas cambian el desenlace de maneras medibles. Llamarlo incontrolable tira por la borda todo lo que esta lección enseña."
    },
    {
      "id": "c",
      "text": "No es acertado. Frenar un borrado erróneo depende de que el arnés controle las acciones de alto impacto, no de la fuerza del modelo.",
      "correct": true,
      "feedback": "Correcto. El modelo solo propone acciones. Si un borrado de veras se ejecuta, y si una persona lo confirma primero, lo decide la lógica de control en el arnés. El mismo modelo no puede borrar nada dentro de un arnés con una válvula de aprobación, y destroza un proyecto dentro de uno que ejecuta a ciegas. La confiabilidad viene en gran medida del código de control fuera del modelo; el modelo es una pieza de ello. Añadir aprobación y detección de progreso al bucle arregla más que un cambio de modelo."
    }
  ]
}
```

## Un arnés no es una sola cosa, es un conjunto de piezas

A esta altura quizá imagines el arnés como «ese bucle»: no del todo. El bucle es su pieza central, pero un arnés es un conjunto de componentes que trabajan juntos. La hoja de ruta lo describe como una unión: "the harness is the union of:" (el arnés es la unión de:) control del bucle, despacho de herramientas, gestión de contexto y más.[^S5] Conoce sus caras ahora; las lecciones siguientes desarman una en cada una:

- **Control del bucle**, descrito en la hoja de ruta como "loop control. The while-loop driving model→tools→model."[^S5] (control del bucle. El bucle while que impulsa modelo→herramientas→modelo.) Lee el `stop_reason` que el modelo regresa y decide si a este turno le sigue otro o una parada. Este es el corazón del arnés, y la Lección 2 está dedicada a él.
- **Despacho de herramientas**: una vez que el modelo propone «llama a esta herramienta con estos parámetros», el código que enruta la solicitud a la función real, la ejecuta y empaca la salida de vuelta en un `tool_result`. Conociste la versión de un solo paso de esto antes; lo que un arnés hace es cablearla dentro del bucle y usarla una y otra vez.
- **Gestión de contexto**: cada turno del bucle amontona más datos en la conversación, porque "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"[^S3] (un agente que se ejecuta en un bucle genera cada vez más datos que podrían ser relevantes para el siguiente turno de inferencia). Y la atención del modelo no es gratis: "LLMs have an "attention budget" that they draw on when parsing large volumes of context"[^S3] (los LLM tienen un «presupuesto de atención» del que echan mano al analizar grandes volúmenes de contexto), y "Every new token introduced depletes this budget by some amount"[^S3] (cada nuevo token introducido agota este presupuesto en cierta medida). Así que el arnés tiene que decidir a dónde va ese historial y cuánto de él se queda, en vez de dejarlo inflarse.

Otras dos piezas reciben tratamiento completo más adelante en este curso. Se nombran aquí para que sepas que también pertenecen al arnés:

- **Condiciones de parada**: más allá de seguir el `stop_reason`, "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."[^S1] (también es común incluir condiciones de parada —como un número máximo de iteraciones— para mantener el control.) Cuándo darlo por terminado es el tema de la Lección 3.
- **Redes de seguridad ante el desbocamiento e intervención humana**: el bucle puede ejecutarse un buen tramo, y "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S1] (El LLM potencialmente operará durante muchos turnos, y debes tener cierto nivel de confianza en su toma de decisiones.) La confianza no es lo mismo que carta blanca, sin embargo: "Agents can then pause for human feedback at checkpoints or when encountering blockers."[^S1] (Los agentes pueden entonces pausar para recibir retroalimentación humana en puntos de control o al encontrar obstáculos.) Cómo atrapar bucles infinitos, giros en el sitio y presupuestos reventados (Lección 4), y cómo una persona interrumpe y redirige a mitad de ejecución (Lección 5), viven ambos en esta capa.

No tienes que memorizar los detalles de cada pieza ahora mismo. Solo sostén la forma general: **un arnés es el nombre colectivo del código de control alrededor del modelo, ensamblado a partir de varias piezas que juntas determinan qué tan firmemente funciona este agente.** Eso también explica por qué intercambiar arneses cambia tanto el desenlace: lo que intercambiaste no es una línea de código, es toda una estrategia para controlar el bucle.

## Cuándo necesitas de verdad esta capa de control

Al ver cuánto puede gestionar un arnés, es fácil deslizarse al extremo opuesto: ¿todo uso de un modelo necesita un montaje completo con control de bucle, válvulas de aprobación y detección de giros? No.

Vuelve a la línea entre agente y flujo de trabajo. Si tu tarea sigue un camino fijo —llega un ticket, se clasifica, se enruta por categoría— y cada bifurcación puede resolverse de antemano, eso es un flujo de trabajo, y orquestarlo "through predefined code paths"[^S1] (a través de caminos de código predefinidos) basta. No hay razón para dejar que un modelo tome decisiones de flujo de control dentro de un bucle. Amarrarle un bucle autónomo solo añade ocasiones para que se desvíe.

Lo que necesita de verdad un arnés completo son las tareas donde **el número de pasos y el camino no pueden enunciarse de antemano**: cuántos archivos hay que cambiar, cuál leer primero, si el resultado de un paso lo manda de vuelta a rehacer uno anterior. Solo el modelo, mirando el estado actual, puede resolver eso. Ahí es cuando quieres un arnés que lo deje decidir por sí mismo dentro de un bucle mientras lo sostienes firmemente bajo control. Vale la pena conservar una pieza de contención general: "you should consider adding complexity only when it demonstrably improves outcomes."[^S1] (habría que considerar añadir complejidad solo cuando mejora los resultados de forma demostrable.) Cada pieza de lógica de control en tu arnés debería estar ahí porque topaste con un problema real de pérdida de control, no porque todos los demás lo construyen así.

El resto de este curso se enfoca en la parte que más importa en ese segundo tipo de tarea, y que más a menudo se rompe: el bucle mismo. Como el arnés decide si un agente es de fiar, y el control del bucle es el corazón del arnés, la siguiente lección arranca con cómo ese bucle crece de una sola ida y vuelta a algo que sigue en marcha.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Aclarar de quién es cada paso

Abajo hay un escenario donde un agente arregla automáticamente pruebas unitarias que fallan. Pasan cinco cosas por el camino. Para cada una, decide si la hace el **modelo** o el **arnés** (el código de control alrededor del modelo), y da una razón breve.

1. El modelo lee el fallo de la prueba, responde con un mensaje diciendo que quiere llamar a `read_file` sobre el archivo que falló, y `stop_reason` es `"tool_use"`.
2. El programa de veras va al disco y lee ese archivo.
3. El programa envuelve el contenido del archivo en un `tool_result`, lo anexa a la conversación y envía otra solicitud.
4. El bucle lleva veinte turnos sin un arreglo, y el programa decide no continuar, parándose y reportando «límite de turnos alcanzado».
5. En algún turno el modelo propone llamar a `delete_file` sobre todo el directorio de pruebas. El programa lo bloquea y despliega «esta operación borra archivos, ¿confirmas?» para esperar a que una persona diga que sí.

<!-- rubric -->
- Los cinco elementos etiquetados explícitamente como «modelo» o «arnés»
- Cada juicio acompañado de una razón, no solo una etiqueta
- El razonamiento identifica de qué lado de la línea entre «proponer una acción» y «ejecutar y controlar» cae cada elemento

<!-- answer -->
1. Modelo. Está mirando la conversación actual y proponiendo la siguiente acción, empacando «llama a read_file» en una solicitud estructurada: una propuesta, no una ejecución.
2. Arnés. El código anfitrión es lo que de veras abre el sistema de archivos y lee el archivo. El modelo no tiene sistema de archivos y no puede hacer esto.
3. Arnés. Envolver el resultado en un `tool_result`, anexarlo a la conversación y enviar otra solicitud es todo orquestación hecha por el código de control del bucle.
4. Arnés. «Parar tras veinte turnos» es una condición de parada explícita (un límite de turnos), que es lógica de control del arnés y no tiene nada que ver con lo que el modelo propuso.
5. Proponer el borrado del directorio es el modelo (todavía solo proponiendo una acción); bloquearlo para esperar confirmación es el arnés. Eso es exactamente lo que es una válvula de aprobación: el modelo todavía puede proponer una acción de alto impacto, pero el arnés la frena antes de que ejecute.

<!-- hint -->
Sigue preguntándote dónde cae la línea: ¿esto es «decidir qué hacer a continuación» (el modelo proponiendo), o «de veras llevar a cabo una acción, o decidir si el bucle continúa» (el arnés controlando)?

<!-- hint -->
Fíjate en que el elemento 5 está a caballo entre ambos lados: el modelo propone, el arnés dictamina si de veras se ejecuta. Un solo evento puede tener una parte de modelo y una parte de arnés, así que no te apures a llenar solo una.

### Nivel 2: Decidir en qué capa arreglarlo

Tu equipo tiene un agente cuya tarea es hacer las inserciones, actualizaciones y borrados correspondientes en una base de datos a partir de la descripción en lenguaje llano de un usuario. Aparecieron dos problemas tras el lanzamiento. Para cada uno, decide si habría que arreglarlo principalmente en la **capa del modelo** (cambiar el modelo, cambiar el prompt) o en la **capa del arnés** (cambiar el código de control de afuera), y explica por qué.

- Problema A: El agente de vez en cuando convierte un vago «limpia esos registros viejos» en una sentencia que borra miles de filas, y la ejecuta de inmediato, lo que causó un incidente real de pérdida de datos.
- Problema B: El SQL que el agente genera a menudo tiene errores de sintaxis y nombres de columnas mal escritos, así que muchas llamadas fallan de plano.

<!-- rubric -->
- Ambos problemas reciben un veredicto explícito de «principalmente capa del modelo» o «principalmente capa del arnés»
- El razonamiento gira en torno a si el asunto es de fondo sobre la calidad de la propuesta o sobre control faltante
- Para el Problema A, la respuesta señala que ni siquiera un modelo más preciso quita el riesgo de pérdida de datos sin un paso de intercepción antes de la ejecución

<!-- answer -->
- Problema A: principalmente la capa del arnés. El asunto de fondo no es si el modelo debería haber propuesto un borrado; es que una acción de alto impacto e irreversible se ejecutó de inmediato y sin condiciones. Lo que falta es una válvula de aprobación humana antes de la ejecución. Ni siquiera un modelo más fuerte que recorte la tasa de error de juicio quita el riesgo: sin esa intercepción, una instrucción vaga todavía puede disparar una pérdida de datos real. Añadir un paso de confirmación antes de las operaciones de tipo borrado es el arreglo de verdad. (Esto hace eco de la idea de la aprobación con humano en el bucle para operaciones de alto impacto, que la Lección 5 desarrolla.)
- Problema B: principalmente la capa del modelo. Los errores de sintaxis y los nombres de columnas mal escritos son problemas de calidad en el paso de propuesta del modelo, y mejoran con un modelo que sea mejor con SQL, o con una estructura de tablas y nombres de columnas precisos aportados en el prompt o en las descripciones de las herramientas. Hay poco que el arnés pueda hacer aquí (a lo sumo marcar el `tool_result` fallido con `is_error` para que el modelo reintente): la causa raíz es la calidad de la propuesta.

<!-- hint -->
Clasifica cada problema primero: ¿es «el modelo propuso mal», o «la propuesta no estaba especialmente errada, pero nada controló la ejecución»? Lo primero apunta a la capa del modelo, lo segundo a la capa del arnés.

<!-- hint -->
Para el Problema A, plantea un contrafactual: si el modelo hubiera propuesto a la perfección esta vez, ¿el problema definitivamente nunca se repetiría? Si el riesgo sobrevive incluso a una propuesta correcta, el punto débil está en la capa de control, no en la capa de propuesta.

<!-- /exercises -->

## Resumen

- **Un arnés es el nombre colectivo del código de control alrededor del modelo**: ejecutar herramientas, impulsar el bucle, decidir cuándo parar y cuándo esperar a una persona. El modelo solo propone la siguiente acción; el arnés dictamina si esa acción ejecuta y si el bucle continúa.[^S2]
- **Un agente es un LLM que usa herramientas en un bucle basándose en la retroalimentación del entorno.**[^S1] Lo que lo separa de un flujo de trabajo no es la fuerza del modelo sino quién toma las decisiones de flujo de control: un flujo de trabajo sigue caminos de código predefinidos, mientras que en un agente el siguiente paso lo fija el modelo dentro del bucle,[^S1] y lo que lleva ese bucle es el arnés: un agente toma sus propias decisiones de flujo de control dentro de un bucle.[^S5]
- **Mismo modelo, distinto arnés, resultado completamente distinto.**[^S5] Así que cuando un agente es poco confiable, revisa primero la capa del arnés: los límites de turnos, la detección de falta de progreso y la aprobación de acciones de alto impacto suelen arreglar más que un modelo más fuerte.
- **Un arnés es un conjunto de piezas, no un objeto único**: el control del bucle, el despacho de herramientas y la gestión de contexto tienen cada uno su propia tarea.[^S5] El contexto en particular necesita gestión, porque cada turno del bucle amontona más datos en la conversación y drena un presupuesto de atención finito.[^S3]
- **No toda situación necesita un arnés completo.** Las tareas con un camino fijo van bien como flujos de trabajo;[^S1] echa mano de un arnés solo cuando los pasos y el camino no pueden enunciarse de antemano y el modelo de verdad tiene que decidir por sí mismo, y añade complejidad solo cuando mejora los resultados de forma demostrable.[^S1]

[>> Lección 2: El bucle central: de una ida y vuelta a la operación continua](./02-the-core-loop.md)
