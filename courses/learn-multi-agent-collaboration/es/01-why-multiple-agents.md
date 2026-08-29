# Lección 1: Por qué varios agentes: los límites de un solo contexto

> Objetivos de aprendizaje:
> - Nombrar dos límites concretos con los que choca un solo agente en tareas largas: contaminación de contexto y dilución de la atención
> - Usar las cifras de costo en tokens que reporta Anthropic para juzgar si vale la pena repartir una tarea entre varios agentes
> - Reconocer cuándo la sobrecarga de coordinación supera al beneficio, y decir en qué tipos de tarea los sistemas multiagente no son buenos hoy por hoy
>
> Requisitos: los primeros cinco cursos de esta serie (sabes escribir prompts, entiendes el protocolo de llamada a herramientas, conoces la memoria y el estado del agente, y puedes leer JS básico) | Siguiente: [Lección 2 >>](./02-orchestrator-and-subagents.md)

## Con qué se topa un solo agente cuando lo hace todo

Supón que le entregas a un solo agente esta tarea: «Investiga cómo tres proveedores de nube cambiaron sus precios durante el último año, compáralos lado a lado y escribe una recomendación de 2000 palabras sobre cuál elegir.»

Así es como un agente la resuelve: busca la página de precios del primer proveedor y carga un bloque largo de HTML y tablas de precios; busca la del segundo, otro bloque largo; busca el historial de cambios del tercer proveedor, quizá paginando varias veces; por el camino saca a la luz algunos resultados irrelevantes o caducos y también los carga; por último, trabajando desde esta única conversación que no deja de crecer, escribe la recomendación de 2000 palabras.

Nada de esto está mal en sí mismo. Los cursos anteriores ya te mostraron que así es como trabaja un agente: leer el contexto, decidir el siguiente paso, llamar a una herramienta, devolver el resultado al contexto y repetir. El problema aparece en cuanto la tarea se vuelve más larga y compleja. Ese contexto único, siempre en crecimiento, arrastra el resultado final hacia abajo en dos puntos, de forma silenciosa.

## Contaminación de contexto: un giro equivocado temprano que no te puedes quitar de encima

A mitad de la investigación, el agente saca a la luz un resultado engañoso: quizá una entrada de blog antigua que cita un precio que ya no está vigente. No nota que algo va mal, lo trata como dato real, razona hacia delante a partir de él e incluso lo escribe en un juicio temprano sobre uno de los proveedores.

Una vez que ese juicio equivocado existe, no desaparece. Se queda en el historial de la conversación y pasa a formar parte del trasfondo de cada paso posterior del razonamiento. Para cuando el agente encuentra la página de precios autorizada y actual, ambos hechos contradictorios conviven en la misma ventana de contexto, y puede que el modelo no distinga con nitidez cuál de los dos merece confianza, sobre todo cuando el equivocado apareció antes y se fue referenciando por el camino.

Eso es la **contaminación de contexto**: un error o un fragmento irrelevante de un paso temprano se mezcla en el único contexto del que depende todo el razonamiento posterior, y a la información correcta que llega después le cuesta lavarlo del todo. Como dice Anthropic, "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"[^S7] (a medida que crece el número de tokens en la ventana de contexto, disminuye la capacidad del modelo para recordar con precisión la información de ese contexto). Cuanto más larga sea la tarea y más pasos intermedios tenga, más ocasiones tiene esta clase de contaminación de acumularse.

## Dilución de la atención: cuanto más lee, más borroso lo ve

El segundo problema es distinto del primero. No es que la información sea incorrecta, es que tener demasiada ya es en sí mismo un costo. Las páginas de precios y los historiales de cambios de tres proveedores pueden sumar decenas de miles de palabras de contenido en bruto, todas amontonadas en una sola ventana de contexto. Cuando el modelo escribe la recomendación final, en principio tiene que sostener a la vez cada detalle repartido por esas decenas de miles de palabras, pero su atención a cualquiera de ellos se reparte más y más fina a medida que el contexto crece.

Eso es la **dilución de la atención**. Anthropic lo plantea como un presupuesto de atención: "LLMs have an 'attention budget' that they draw on when parsing large volumes of context" y "Every new token introduced depletes this budget by some amount"[^S7] (los LLM tienen un «presupuesto de atención» del que tiran al procesar grandes volúmenes de contexto, y cada token nuevo agota ese presupuesto en cierta medida). Cuanto más metes en una sola ventana de contexto, menos presupuesto queda para cada detalle individual, y más fácil es equivocarse o dejarse cosas fuera en tareas —resúmenes, comparaciones— que necesitan sostener con precisión muchos detalles a la vez.

Junta la contaminación de contexto y la dilución de la atención y tienes el techo del camino de un solo contexto: en cuanto una tarea se hace lo bastante larga, la calidad se erosiona de forma sostenida si un solo agente la lleva de principio a fin. Anthropic describe este declive como "a performance gradient rather than a hard cliff"[^S7] (un gradiente de rendimiento y no un precipicio abrupto), y un prompt más largo por sí solo rara vez lo recupera.

## Sistemas multiagente: repartir una tarea larga entre varios contextos

La respuesta multiagente es partir una tarea grande en piezas y entregar cada una a un agente aparte e independiente, en lugar de embutirlo todo en el mismo contexto que no para de crecer. La definición de Anthropic: "A multi-agent system consists of multiple agents (LLMs autonomously using tools in a loop) working together."[^S1] (un sistema multiagente consta de varios agentes —LLM que usan herramientas de forma autónoma en un bucle— trabajando juntos).

Volvamos al ejemplo de la investigación de nube: en lugar de que un solo agente lea de principio a fin todo el material de las tres empresas, haz que tres agentes se centren cada uno en una empresa, cada uno con su propia ventana de contexto separada, sin estorbarse[^S1]. La entrada de blog caduca que se recogió investigando la primera empresa solo contamina el contexto de ese agente; nunca se mezcla en el razonamiento sobre las otras dos. Anthropic lo llama una "separation of concerns" (separación de responsabilidades): herramientas, prompts y rutas de exploración distintas que reducen la dependencia de la ruta[^S1]. Y el contenido en bruto que cada agente tiene que manejar baja de «el material de las tres empresas» a «el material de una empresa», lo que también alivia el problema de la dilución de la atención. Cómo funciona exactamente esta estructura —un agente central parte la tarea, varios agentes trabajan en paralelo y luego se agregan los resultados— es lo que aborda la siguiente lección.

## El costo: multiagente es más caro

Repartir entre agentes no sale gratis. Cada subagente tiene que volver a leer el trasfondo de la tarea y organizar su propio razonamiento, y eso quema tokens; luego un paso final agrega los resultados de los varios agentes, y eso también quema tokens. Las cifras que midió Anthropic: "In our data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats."[^S1] (en nuestros datos, los agentes suelen usar unas 4 veces más tokens que las interacciones de chat, y los sistemas multiagente unas 15 veces más que los chats).

15× no es un número pequeño. Significa que traer un sistema multiagente solo compensa cuando la tarea en sí tiene valor suficiente para justificar ese costo extra en tokens; como dice Anthropic, "For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance."[^S1] (para que sean viables económicamente, los sistemas multiagente requieren tareas cuyo valor sea lo bastante alto como para pagar el mayor rendimiento).

Cuántos subagentes ejecutar tampoco es una decisión de «cuantos más, mejor». Anthropic ofreció una regla práctica de escalado: una búsqueda de datos simple va bien con 1 agente y de 3 a 10 llamadas a herramientas; una comparación directa podría llevar de 2 a 4 subagentes con 10 a 15 llamadas cada uno; y solo una investigación lo bastante compleja como para tener responsabilidades claramente divididas vale más de 10 subagentes[^S1]. Al principio, el equipo se topó con los contraejemplos: agentes que generaban 50 subagentes para una consulta simple, o que rastreaban la web sin fin en busca de una fuente que no existía, con agentes que se distraían entre sí enviándose un montón de actualizaciones innecesarias[^S1].

La actitud detrás de esa regla encaja con el consejo que da Anthropic en otro texto sobre arquitectura de agentes: "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] (habría que plantearse añadir complejidad solo cuando mejora los resultados de forma demostrable). Consigue primero que la tarea funcione con un solo agente, observa dónde se atasca de verdad —contaminación de contexto o dilución de la atención— y solo entonces decide si conviene, y en qué paso, traer varios agentes. Eso es mejor que levantar un sistema multiagente complejo desde el arranque.

## Cuándo no usar multiagente: la sobrecarga de coordinación supera al beneficio

El valor de un sistema multiagente descansa en una premisa: la tarea se puede partir en piezas que se manejan cada una de forma independiente. En cuanto esa premisa falla, la propia partición se vuelve peso extra. Eso es la **sobrecarga de coordinación**: el tiempo y los tokens de más que se gastan en que varios agentes se repartan el trabajo y colaboren, incluyendo partir la tarea, agregar resultados y reconciliar salidas contradictorias entre agentes. Cuando una tarea no tiene mucho que se pueda **paralelizar** de verdad, la sobrecarga de coordinación fácilmente supera a lo que la partición te aporta.

Anthropic nombra una clase de tarea que encaja mal: "most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time."[^S1] (la mayoría de las tareas de código tienen menos partes realmente paralelizables que la investigación, y los agentes LLM todavía no son buenos coordinando y delegando entre sí en tiempo real). Arreglar un bug suele significar entender varias piezas de lógica entrelazadas en el código, muy acopladas de principio a fin, difíciles de cortar limpiamente en trozos para distintos agentes sin que se pisen. Eso se acerca más a una **tarea en profundidad**: la respuesta vive en una sola cadena de razonamiento que hay que recorrer paso a paso, no repartida entre varias direcciones sin relación. En cambio, lo que Anthropic ve que los sistemas multiagente hacen de verdad bien es el trabajo de alto valor: "multi-agent systems excel at valuable tasks that involve heavy parallelization, information that exceeds single context windows, and interfacing with numerous complex tools"[^S1] (los sistemas multiagente destacan en tareas valiosas que implican mucha paralelización, información que excede una sola ventana de contexto e interacción con numerosas herramientas complejas); e investigar precios de nube o comparar varios documentos lado a lado es una **tarea en amplitud**: la respuesta se reparte entre unas cuantas direcciones relativamente independientes que puedes ir a perseguir por separado, sin depender de los resultados intermedios de las demás.

Para decidir si una tarea debería ir a multiagente, arranca con tres preguntas: ¿se puede partir la tarea en subtareas independientes entre sí? Una vez partida, ¿la información total supera lo que una sola **ventana de contexto** puede sostener? ¿La tarea es lo bastante valiosa como para cubrir ese costo extra en tokens? Si aunque sea una respuesta se inclina hacia «no» o «no vale la pena», sacar la tarea adelante con honestidad con un **sistema de un solo agente** suele ser mejor negocio que forzarla a varios agentes.

```agentmentor-check
{
  "id": "mac-zh-01-when-to-split",
  "label": "Debería repartirse esta tarea entre varios agentes",
  "prompt": "Alguien dice: «Los sistemas multiagente rinden mejor de todos modos, así que de ahora en adelante voy a ir a multiagente en cada tarea; no puede hacer daño.» ¿Tiene razón?",
  "whyHere": "Acabas de ver las cifras de costo en tokens y la evidencia de que «las tareas de código se paralelizan mal», así que es fácil dejarse arrastrar por la impresión vaga de que «multiagente es más fuerte» y olvidar que arrastra un costo y tiene límites. Este es el punto para pincharlo con un criterio de juicio concreto.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Tiene razón: si un enfoque rinde mejor, úsalo siempre. Multiagente solo cuesta un poco más, y vale la pena.",
      "correct": false,
      "feedback": "Esto se salta dos cosas. Primero, un sistema multiagente usa de media unas 15 veces los tokens de una interacción de chat, así que solo compensa cuando el valor de la tarea es lo bastante alto; no es solo «un poco más». Segundo, Anthropic afirma con claridad que la mayoría de las tareas de código tienen poco que paralelizar, así que repartirlas entre agentes no es necesariamente mejor y puede ser peor por la sobrecarga de coordinación. «Rendir mejor» no es una propiedad por defecto de multiagente; depende de si la tarea se presta a partirse."
    },
    {
      "id": "b",
      "text": "No: los sistemas multiagente sirven solo para ahorrar tokens, así que habría que recurrir a ellos únicamente en tareas simples.",
      "correct": false,
      "feedback": "Esto lo tiene al revés. Las cifras de Anthropic dicen que un sistema multiagente usa de media unas 15 veces los tokens de una interacción de chat, así que no es una herramienta para ahorrar tokens. Y una búsqueda de datos simple va bien con 1 agente y de 3 a 10 llamadas a herramientas, así que las tareas simples necesitan menos multiagente, no más. Son las tareas lo bastante complejas como para partirse limpiamente las que pueden valer varios subagentes."
    },
    {
      "id": "c",
      "text": "No: primero comprueba si la tarea se parte en subtareas realmente independientes, si su información supera un solo contexto, y si su valor cubre los tokens de más.",
      "correct": true,
      "feedback": "Correcto. Los datos de Anthropic muestran que un sistema multiagente usa de media unas 15 veces los tokens de una interacción de chat, así que solo compensa cuando el valor de la tarea cubre ese costo; Anthropic también afirma que el trabajo de tipo código tiene mucho menos que se pueda paralelizar de verdad que la investigación. La decisión se reduce a si la tarea se puede partir en piezas que se manejen de forma independiente, no a «rinde mejor, así que úsalo siempre»."
    }
  ]
}
```

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Juzgar si repartir cuatro tareas

Para las cuatro tareas de abajo, decide si cada una encaja mejor con un solo agente o con repartirla entre varios, y explica por qué.

1. «Averigua por qué esta función devuelve de vez en cuando un resultado equivocado bajo concurrencia, y localiza el bug exacto.»
2. «Investiga las principales empresas de cinco industrias distintas y, para cada una, qué productos relacionados con IA han lanzado en el último año, organizado en una tabla comparativa.»
3. «Traduce al inglés esta descripción de producto de 300 palabras.»
4. «Lee las descripciones y la discusión de los últimos 20 PR de este repo y resume en qué tipos de problema se ha centrado el equipo últimamente.»

<!-- rubric -->
- Las cuatro tareas reciben una decisión clara (un solo agente / multiagente / o bajo qué condiciones elegirías cuál)
- Cada decisión explica su razonamiento, no solo un veredicto
- El razonamiento muestra los criterios de juicio en uso: si se parte en subtareas independientes, si la información supera un solo contexto, si es lo bastante simple como para no valer la pena partirla

<!-- answer -->
1. Un solo agente. Localizar un bug de concurrencia significa avanzar paso a paso por una sola cadena de razonamiento —leer la lógica de la función, seguir el timing de las llamadas, ubicar el estado compartido— y esos pasos dependen mucho unos de otros. Es una tarea en profundidad, difícil de partir en piezas sin relación para distintos agentes.
2. Multiagente. Las cinco industrias son independientes entre sí y se pueden investigar de verdad por separado, una tarea en amplitud; y cinco redacciones combinadas lo más probable es que superen el solo contexto que un agente puede manejar limpiamente. Pon un subagente en cada industria, cada uno reuniendo su propio material, y luego agrega en una tabla comparativa.
3. Un solo agente. La tarea es simple y la información es poca; una traducción es algo que el modelo hace directamente desde su capacidad lingüística y el texto fuente dado. No hay subtareas independientes que valga la pena separar, y multiagente solo desperdiciaría tokens.
4. Depende, inclinándose a un solo agente o a una partición ligera: 20 PR no es un número enorme, y si el contenido no es largo, un agente que los lea y resuma es viable; si la discusión de cada PR es larga y el total supera con claridad lo que sostiene un solo contexto, puedes agrupar los PR entre dos o tres subagentes para leerlos en paralelo, y luego agregar los temas. La clave es estimar primero el volumen total, no ir por defecto a partir solo porque ves «20».

<!-- hint -->
Arranca con «¿la respuesta de esta tarea está repartida entre varias direcciones independientes, o enterrada en una sola cadena de razonamiento que hay que recorrer paso a paso?». Lo primero es en amplitud y se parte bien; lo segundo es en profundidad y solo hace que los agentes se pisen.

<!-- hint -->
Luego pregunta «una vez partida, ¿la información total supera con claridad lo que puede sostener el contexto de un solo agente?». Si el volumen era pequeño de entrada y un solo agente lo maneja bien, la sobrecarga de coordinación de partir normalmente no vale la pena.

### Nivel 2: Estimar un montaje de agentes para una tarea de investigación

La tarea es: «Investiga las funciones recién lanzadas de cada uno de tres competidores en los últimos seis meses, y escribe un resumen de unas 200 palabras para cada uno; no hace falta comparación lado a lado.» Usando la regla práctica de escalado de esta lección, estima aproximadamente cuántos agentes ejecutar y cuántas llamadas a herramientas necesita cada uno, y explica la base de tu estimación.

<!-- rubric -->
- Da una estimación concreta del número de agentes, no solo «ejecuta unos cuantos más»
- Da un rango aproximado de llamadas a herramientas por agente
- La base refleja el juicio de «los tres competidores son independientes y se pueden investigar por separado»

<!-- answer -->
Los tres competidores son independientes entre sí y cada uno necesita una recuperación de profundidad media, lo que sitúa esto en el nivel intermedio de la regla de escalado de Anthropic (2 a 4 subagentes, 10 a 15 llamadas a herramientas cada uno). Como son exactamente tres empresas, un subagente por empresa es el encaje más natural: ejecuta 3 subagentes, cada uno centrado en una empresa; cada subagente necesita en torno a 10 a 15 llamadas a herramientas para buscar los lanzamientos de esa empresa en los últimos seis meses, las actualizaciones de la página de producto, el blog oficial y otras fuentes, reuniendo material suficiente para un resumen de 200 palabras. Como no hace falta comparación lado a lado, el paso final de agregación es mucho más ligero que en una tarea de «tabla comparativa»: se acerca a solo coser los tres resúmenes, sin integración profunda adicional.

<!-- hint -->
La regla de escalado da tres niveles: una búsqueda de datos simple usa 1 agente con 3 a 10 llamadas; una comparación directa usa 2 a 4 subagentes con 10 a 15 llamadas cada uno; solo una investigación lo bastante compleja como para dividir responsabilidades limpiamente llega a más de 10 subagentes. Averigua primero en qué nivel cae esta tarea, y luego afina los números.

<!-- hint -->
Fíjate en que la tarea dice «no hace falta comparación lado a lado», lo que significa que la agregación final es ligera: nada de integración profunda de varias fuentes en un juicio unificado. Eso afecta a cuánta sobrecarga de coordinación hay, y a si partir vale la pena.

<!-- /exercises -->

## Resumen

- Un solo agente haciéndolo de principio a fin choca con dos límites concretos en tareas largas: la **contaminación de contexto** (un error o fragmento irrelevante temprano se mezcla en el razonamiento posterior y cuesta lavarlo) y la **dilución de la atención** (cuanto más metes en un solo contexto, menos atiende el modelo a cada detalle individual).
- Un **sistema multiagente** son varios agentes que usan herramientas de forma independiente trabajando juntos[^S1], que alivia la contaminación y la dilución dándole a cada agente su propia ventana de contexto.
- Multiagente no sale gratis: los datos de Anthropic muestran que usa de media unas 15 veces los tokens de una interacción de chat, así que solo compensa cuando el valor de la tarea es lo bastante alto[^S1]; cuántos subagentes ejecutar también tiene una regla de escalado de Anthropic en la que apoyarse, en lugar de «cuantos más, mejor»[^S1].
- La postura más segura es conseguir primero que la tarea funcione con un solo agente, y plantearse añadir complejidad solo cuando mejora los resultados de forma demostrable[^S2].
- Para decidir si repartir entre agentes, pregunta: ¿se puede partir la tarea en subtareas independientes? ¿La información supera un solo contexto? ¿El valor vale el costo extra en tokens? Anthropic afirma con claridad que las tareas de tipo código, en profundidad y muy acopladas, se paralelizan mal y no son el fuerte de multiagente[^S1]; las tareas de investigación en amplitud que puedes ir a perseguir por separado sí lo son.

[Lección 2: Orquestador y subagentes: repartir y agregar >>](./02-orchestrator-and-subagents.md)
