# Lección 2: Orquestador y subagentes: repartir y agregar

> Objetivos de aprendizaje:
> - Enunciar de qué es responsable el orquestador y de qué son responsables los subagentes en una arquitectura orquestador-subagente
> - Explicar qué aísla en realidad el «aislamiento de contexto», y por qué alivia la contaminación de contexto y la dilución de la atención de la lección anterior
> - Explicar por qué un subagente debería devolver al orquestador solo su conclusión, en lugar de volcar de vuelta todo su hilo de pensamiento acumulado
>
> Requisitos: Terminar la Lección 1 y entender la definición de «sistema multiagente» y dónde encaja | Anterior: [Lección 1 <<](./01-why-multiple-agents.md) | Siguiente: [Lección 3 >>](./03-writing-prompts-for-delegation.md)

## El orquestador: partir la tarea, repartirla, esperar los resultados

La lección pasada decidimos que una tarea como «investigar los precios de tres proveedores de nube» encaja bien con repartirla entre varios agentes, pero nunca detallamos cómo funciona ese reparto en realidad. Una estructura habitual para ello es la arquitectura **orquestador-subagente**. La definición oficial es "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."[^S2] (un LLM central descompone dinámicamente las tareas, las delega a LLM trabajadores y sintetiza sus resultados).

Esa definición nombra tres acciones, y se corresponden con las tres cosas que hace el orquestador: **descomponer** —mirar una tarea grande y averiguar en qué trozos se parte—; **delegar** —entregar cada trozo, junto con el trasfondo que necesita, a un subagente para que lo lleve a cabo—; **sintetizar** —una vez que los subagentes han devuelto sus resultados, combinarlos en la respuesta final—. El orquestador mismo nunca baja a leer la página de precios de un proveedor. Su trabajo es decidir cómo dividir el trabajo, quién recibe qué, y cómo coser varios resultados en una respuesta que se sostenga como un todo.

## El subagente: tomar una tarea, terminarla dentro de su propio contexto

Del lado del subagente, las cosas funcionan de forma bastante distinta. La documentación es explícita: "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read. Claude composes a delegation message that summarizes the task, and the subagent works from there."[^S3] (cada subagente arranca con una ventana de contexto fresca y aislada; no ve tu historial de conversación, las skills que ya has invocado ni los archivos que Claude ya ha leído; Claude compone un mensaje de delegación que resume la tarea, y el subagente trabaja a partir de ahí). Dicho de otro modo, un subagente no tiene ni idea de qué le dijiste primero al orquestador, ni de cómo el orquestador sopesó internamente «¿deberíamos partir esto?» y «¿en cuántas piezas?». Todo lo que puede ver es el único informe de tarea que el orquestador le entregó.

Esto parece una limitación, pero en realidad es la cura para los dos problemas de la lección pasada. El contexto del subagente no arrastra el historial completo de conversación del orquestador, así que tampoco arrastra los callejones sin salida en los que el orquestador se metió en otra parte ni el material irrelevante que vio. Eso es el **aislamiento de contexto**: confinar el ámbito de trabajo de cada agente a su propia ventana de contexto, de modo que la contaminación de contexto dentro de un agente no se propague a otro. El subagente sostiene solo el material de su propia porción de la tarea, y no tiene que hacer malabares con todo el contenido de tres empresas a la vez, así que la presión de la dilución de la atención también baja. En cuanto a cómo escribir un informe de tarea lo bastante claro como para que un subagente pueda hacer buen trabajo por su cuenta sin ver jamás el historial de conversación, eso es la siguiente lección.

```agentmentor-check
{
  "id": "mac-zh-02-subagent-visibility",
  "label": "Juzgar si un subagente debería ver el historial completo de conversación del orquestador",
  "prompt": "Tres subagentes están investigando en paralelo los precios de tres proveedores de nube. Alguien sugiere: «Dejemos sin más que cada subagente vea el historial completo de conversación del orquestador hasta ahora, incluido lo que los otros dos subagentes ya han encontrado. Así pueden cruzar referencias entre sí y evitar duplicar búsquedas.» ¿Es buena idea?",
  "whyHere": "Acabamos de ver que un subagente arranca por defecto desde un contexto fresco y aislado, lo que hace fácil dejarse llevar por la afirmación de sonido plausible de que «compartir el historial evita el trabajo duplicado». Este es el momento de trazar la raya: el aislamiento de contexto es el mecanismo por defecto, y evitar el trabajo duplicado viene de que el orquestador trace límites de tarea claros al delegar, no de que los subagentes se espíen entre sí.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Razonable: cuanto más pueda ver un subagente, menos probable es que duplique trabajo o se pierda información.",
      "correct": false,
      "feedback": "Esto pone un signo de igualdad entre «evitar el trabajo duplicado» y «compartir todo el historial», pero el mecanismo oficial es explícito en que cada subagente arranca por defecto desde un contexto fresco y aislado y no puede ver el historial de conversación. Dejar que los subagentes vean el proceso completo de los demás mueve la contaminación de contexto y la dilución de la atención de la Lección 1 de «dentro de un agente» a «entre varios subagentes», con un costo real. La herramienta de verdad para evitar el trabajo duplicado es que el orquestador trace límites de tarea claros y sin solape al delegar."
    },
    {
      "id": "b",
      "text": "No razonable: un subagente no ve ni el historial de conversación ni a los demás por defecto; evitar el trabajo duplicado es tarea del orquestador cuando traza los límites de la tarea.",
      "correct": true,
      "feedback": "Correcto. La documentación dice sin rodeos que un subagente arranca desde una ventana de contexto fresca y aislada y no puede ver el historial de conversación. Darle a cada subagente solo el único informe de tarea que necesita es exactamente cómo el aislamiento de contexto alivia la contaminación de contexto y la dilución de la atención. El trabajo duplicado debería resolverse cuando el orquestador descompone la tarea y divide los límites, no parchearse haciendo que los subagentes compartan grandes cantidades de contexto."
    },
    {
      "id": "c",
      "text": "Da igual: el orquestador agrega al final de todos modos, así que que los subagentes vean o no el trabajo de los demás no cambiará el resultado final.",
      "correct": false,
      "feedback": "Sí importa. La independencia de contexto de cada subagente decide directamente si se sale del rumbo por información irrelevante o equivocada que otro subagente sacó a la luz, y si quema atención haciendo malabares con material de más. La agregación ocurre después de que los subagentes terminan su trabajo; no puede deshacer la calidad perdida durante ese trabajo por haberle dado a un subagente un contexto que nunca necesitó."
    }
  ]
}
```

## Repartir (fan-out): partir la tarea y entregarla a varios subagentes a la vez

Volvamos al ejemplo de los precios de tres proveedores. Una vez que el orquestador ha descompuesto el trabajo en «comprobar el primero», «comprobar el segundo», «comprobar el tercero», no los pone en cola uno a uno. Los reparte todos a la vez, que es exactamente lo que hace el sistema en producción: el agente líder pone en marcha de 3 a 5 subagentes en paralelo en lugar de en serie[^S1]. Ese movimiento de «repartirlo todo al mismo tiempo» es el **repartir (fan-out)**: el orquestador distribuye en paralelo las subtareas ya partidas a un número equivalente de subagentes, dejando que cada uno empiece a trabajar de forma independiente y simultánea, en lugar de esperar a que el primer subagente termine antes de despachar el segundo.

El beneficio del repartir es directo: tres subagentes trabajando en paralelo significa que el tiempo total se acerca al de hacer una sola pieza de investigación, no a la suma de tres. Después de que el sistema en producción introdujo esta clase de paralelización, el tiempo de investigación en consultas complejas bajó hasta un 90%[^S1]. Pero repartir no es solo trocear la tarea y darla por hecha: cómo cortas importa. Tres empresas son naturalmente independientes, así que cortar en tres encaja limpiamente. Cambia a «revisar un contrato de 20 páginas» y las cláusulas pueden referenciarse y condicionarse entre sí; un mal corte deja a cada subagente sin contexto clave, llegando a conclusiones que se contradicen entre ellas. Decidir cómo y con qué finura cortar vuelve a la prueba de la lección pasada: ¿cada trozo que recortas es de verdad algo que se puede manejar por su cuenta, sin depender de los resultados intermedios de otro trozo?

## Agregar: juntar los resultados, no solo pegarlos

Después de que los tres subagentes terminan cada uno de comprobar los precios de su propia empresa y devuelven los resultados, lo que hace el orquestador no es pegar tres bloques de texto uno tras otro. Lo que los subagentes devuelven son conclusiones de investigación desde sus propios puntos de vista, y el trabajo del orquestador es **agregar**: poner varios resultados producidos de forma independiente uno al lado del otro, compararlos, resolver la duplicación o contradicción que aparezca, y reorganizarlos en la forma del entregable final, escribiendo un documento que se lea como un todo, no como tres piezas cosidas de forma evidente.

La documentación, al describir cómo los subagentes hacen la entrega en secuencia, señala que "Each subagent completes its task and returns results to Claude, which then passes relevant context to the next subagent."[^S3] (cada subagente completa su tarea y devuelve resultados a Claude, que luego pasa el contexto relevante al siguiente subagente). Así que la agregación no es necesariamente tan simple como «esperar a que cada subagente entregue su trabajo, y luego el orquestador lo recoge todo de una vez y lo procesa». En algunos casos el resultado del subagente anterior es en sí parte del informe de tarea del siguiente subagente, y el orquestador va y viene entre repartir y agregar hasta que cada subtarea tiene un resultado.

El camino que recorre un resultado tampoco tiene que pasar siempre por el orquestador. Cuando el contenido que un subagente produce es grande y hay que mantenerlo intacto, la documentación menciona un enfoque: "Subagent output to a filesystem to minimize the 'game of telephone.' Direct subagent outputs can bypass the main coordinator for certain types of results, improving both fidelity and performance."[^S1] (que el subagente escriba su salida a un sistema de archivos para minimizar el «teléfono descompuesto»; las salidas directas del subagente pueden saltarse el coordinador principal para ciertos tipos de resultado, mejorando tanto la fidelidad como el rendimiento). Escribir directo al sistema de archivos es, en el fondo, una forma de evitar que un resultado sea parafraseado, comprimido y pierda detalle a lo largo de la cadena «subagente → orquestador → salida final».

## Devolver solo la conclusión, no todo el hilo de pensamiento del subagente

Para terminar su tarea, un subagente puede leer por el camino muchas páginas de material irrelevante, probar unos cuantos caminos que no llevan a nada, incluso cometer pequeños errores y corregirse. Ese proceso no necesita —ni debería— volver a meterse tal cual en el contexto del orquestador. Lo que el orquestador necesita es la conclusión final y defendible del subagente y la evidencia clave que la respalda, no todo el rastro de razonamiento con sus rodeos.

La razón vuelve al punto de la Lección 1: el orquestador tiene una ventana de contexto propia, y pasa también por contaminación de contexto y dilución de la atención. La documentación es directa al respecto: cuando los subagentes terminan, sus resultados vuelven a la conversación principal, y ejecutar muchos subagentes que devuelven cada uno resultados detallados puede consumir un contexto considerable[^S3]. Si tres subagentes vuelcan de vuelta tal cual varios miles de palabras de razonamiento completo, el orquestador acaba encontrándose, en su propia capa, con el mismísimo problema que se suponía que varios agentes iban a aliviar. El **devolver** debería llevar solo la conclusión en sí, y dejar el detalle de «cómo llegué ahí» en el propio contexto del subagente, que ya ha gastado y está a punto de descartar.

Esto no significa que cada delegación arranque desde cero. La documentación menciona un tipo especial de subagente —un **fork**—: "A fork is a subagent that inherits the entire conversation so far instead of starting fresh... The fork's own tool calls still stay out of your conversation and only its final result comes back, so your main context window stays clean."[^S3] (un fork es un subagente que hereda toda la conversación hasta ahora en lugar de arrancar de cero; las propias llamadas a herramientas del fork siguen quedándose fuera de tu conversación y solo vuelve su resultado final, así que tu ventana de contexto principal se mantiene limpia). Así que incluso cuando un subagente sí necesita en algún caso raro ver el historial completo (digamos que tiene que producir un resumen profundo apoyado en toda la discusión previa), su pensamiento intermedio sigue sin entrar tal cual en el contexto del orquestador. El principio de «devolver solo la conclusión» es estable; lo único que cambia es si el subagente arranca con el historial en la mano.

## Dicho de otro modo: la misma división del trabajo aparece en otros marcos

«Orquestador-subagente» no es la fórmula privada de un solo proveedor. La documentación del Agents SDK de OpenAI llama a la misma estructura el **patrón Manager**: "A central manager/orchestrator invokes specialized sub‑agents as tools and retains control of the conversation."[^S4] (un manager/orquestador central invoca subagentes especializados como herramientas y retiene el control de la conversación). Cambia las palabras —manager por orquestador, agentes-como-herramientas por subagentes— y describe lo mismo: un nodo central descompone la tarea, reparte el trabajo y mantiene el control del conjunto, mientras que la ejecución real recae en subordinados especializados que devuelven sus resultados, y el nodo central sigue dirigiendo lo que viene después. Reconocer la forma de esta división del trabajo importa más que memorizar la terminología de un marco concreto: verás alguna variante de esta lógica en la documentación de casi cualquier marco multiagente.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Dibujar el reparto orquestador/subagente para una tarea de revisión de código

La tarea es: «Revisa los últimos 10 PR de un proyecto de código abierto, encuentra los PR que tocaron la lógica central de permisos, y escribe una nota de riesgo para cada uno de esos PR.» Responde:

1. ¿Qué debería hacer el orquestador?
2. ¿Cómo debería repartirse esta tarea, en cuántos trozos, y a grandes rasgos qué es cada trozo?
3. Cuando un subagente termina, ¿qué debería devolver? Y una vez que el orquestador tiene lo devuelto, ¿qué es exactamente el paso de «agregar»?

<!-- rubric -->
- Las responsabilidades del orquestador reflejan «descomponer, delegar, sintetizar», en lugar de que el orquestador lea los PR él mismo
- El plan de reparto da una base concreta para el corte (p. ej. agrupar por PR), no un vago «partir en unas cuantas piezas»
- Deja claro si el subagente devuelve una conclusión o todo su hilo de pensamiento, y qué está haciendo de verdad la agregación

<!-- answer -->
1. El orquestador toma primero la lista de 10 PR y decide que esta tarea se parte en una capa de subtareas paralelizables: «comprobar uno a uno si cada PR tocó la lógica de permisos». Entrega cada PR (o un grupo de unos pocos PR) a un subagente para que lo compruebe. Una vez que los subagentes devuelven, organiza las notas de riesgo de los PR que sí tocaron la lógica de permisos en un único informe de revisión unificado.
2. Puedes repartir por PR: digamos que cada subagente maneja 2-3 PR, para 4-5 subagentes comprobando en paralelo; o más fino, un subagente por PR a lo largo de los 10. La granularidad exacta depende de cuán grandes son los cambios de cada PR y de cuánto contexto necesita la comprobación.
3. Un subagente debería devolver solo la conclusión: si este PR tocó la lógica central de permisos y, en tal caso, la nota de riesgo más las ubicaciones clave del código que respaldan el juicio; no todo el diff que leyó ni su pensamiento de ensayo y error por el camino. Una vez que el orquestador tiene lo devuelto, «agregar» significa seleccionar cada PR que los subagentes marcaron como de riesgo y organizarlos en un único informe con un formato consistente de nota de riesgo, en lugar de pegar 10 respuestas en bruto de subagentes una tras otra.

<!-- hint -->
Entre las tres acciones del orquestador —descomponer, delegar, sintetizar— la que es fácil pasar por alto es que no va a leer el contenido real de un PR. En el momento en que el orquestador lee un diff completo él mismo, está haciendo el trabajo del subagente, y la línea de división se difumina.

<!-- hint -->
Para lo que un subagente debería devolver, razona hacia atrás: si el orquestador recibiera el hilo de pensamiento completo de cada subagente, ¿su propio contexto se volvería largo y abarrotado otra vez? Si es así, entonces lo que debería devolverse es solo la conclusión.

### Nivel 2: Detectar el problema en este diseño de orquestación

Alguien diseñó un flujo orquestador-subagente así: «Justo al arranque, el orquestador empaqueta su historial completo de conversación con el usuario —incluidas unas rondas de charla informal sin relación con esta tarea— y lo envía como trasfondo a cada subagente, con la lógica de que ‹por si un subagente necesita algo de trasfondo, dárselo por adelantado es mejor que dejarlo fuera›.» Encuentra el problema en este diseño y da un enfoque mejor.

<!-- rubric -->
- Nombra el problema y cita un principio concreto de esta lección (no un vago «está mal»)
- Explica la consecuencia concreta que provoca esta práctica
- La mejora refleja el principio de «proveer bajo demanda, trazar límites claros»

<!-- answer -->
El problema es que echa por tierra todo el sentido de que un subagente arranque por defecto desde un contexto fresco y aislado. Empaquetar la charla informal sin relación en cada subagente reintroduce artificialmente el material irrelevante del propio contexto del orquestador en el contexto de cada subagente: esto es exactamente la contaminación de contexto de la Lección 1, solo que con la fuente cambiada de «información equivocada que el agente encontró por sí mismo» a «historial irrelevante que el orquestador metió con buena intención». La consecuencia es que un subagente gasta atención de más separando el trasfondo real y útil de la cháchara irrelevante, así que aparece también la dilución de la atención, y la preocupación de «por si falta algo» ni siquiera queda resuelta: el trasfondo que de verdad se necesita debería escribirse explícitamente en el informe de tarea, no respaldarse volcando todo el historial. El enfoque mejor: el orquestador selecciona solo el trasfondo que esta tarea necesita de verdad, lo escribe explícitamente en el informe del subagente, y no pasa nada del historial no usado.

<!-- hint -->
Recuerda la pregunta de «¿debería un subagente ver el historial completo de conversación?»: «por si se necesita» y «claramente se necesita» son dos cosas distintas. Lo primero se desliza fácil hacia meterlo todo; lo segundo pide a quien delega que piense primero qué trasfondo necesita de verdad esta tarea.

<!-- hint -->
Compara: si ese «historial completo de conversación» es en sí de varios miles de palabras, dárselo a tres subagentes significa que el orquestador, antes incluso de haber repartido, ya ha pasado el costo de la contaminación de contexto y la dilución de la atención a cada subagente.

<!-- /exercises -->

## Resumen

- En la arquitectura **orquestador-subagente**, un LLM central descompone la tarea, delega subtareas a varios LLM trabajadores y sintetiza sus resultados[^S2]; el orquestador mismo no baja a manejar el contenido detallado de una subtarea.
- Cada subagente arranca por defecto desde una ventana de contexto fresca y aislada y no puede ver el historial de conversación del orquestador[^S3]: esto es el **aislamiento de contexto**, el mecanismo clave para aliviar la contaminación de contexto y la dilución de la atención de la lección pasada.
- El **repartir (fan-out)** distribuye en paralelo las subtareas ya partidas a varios subagentes para que trabajen a la vez; **agregar** no es un simple pegado de las respuestas de los subagentes sino un paso de comparar, resolver contradicciones y reorganizar a un formato único; y el paso de resultados también puede saltarse el orquestador y escribir directo al sistema de archivos, para reducir la información perdida en la paráfrasis[^S1].
- Después de que un subagente termina, su resultado vuelve al orquestador[^S3]; lo que se devuelve debería ser solo la **conclusión**, no los rodeos con los que se topó ni todo su hilo de pensamiento; la documentación es explícita en que muchos subagentes que devuelven cada uno resultados detallados pueden consumir un contexto considerable[^S3], y el orquestador se encontraría con la contaminación de contexto y la dilución de la atención otra vez en su propia capa.
- «Orquestador-subagente» no es la fórmula privada de un marco: el Agents SDK de OpenAI llama a la misma estructura el patrón Manager, un manager central que invoca subagentes como herramientas mientras retiene el control de la conversación[^S4]. Reconocer la lógica compartida detrás de esta división del trabajo importa más que memorizar cualquier término concreto.

[>> Lección 3: Escribir prompts para delegar](./03-writing-prompts-for-delegation.md)
