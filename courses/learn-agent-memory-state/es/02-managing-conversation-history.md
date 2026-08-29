# Lección 2: Gestionar el historial de conversación: añadir, truncar, resumir

> Objetivos de aprendizaje:
> - Explicar por qué el historial de conversación solo crece y por defecto nunca se encoge
> - Decir qué descarta el truncado, qué conserva y qué estructura puede romper
> - Distinguir los problemas que resuelven, cada uno, la compactación y el borrado de resultados de herramientas
> - Determinar a qué mecanismo recurrir según el uso de la ventana y el tipo de contenido que la infla
>
> Requisitos: terminar la Lección 1 y entender de qué está hecha una ventana de contexto | Anterior: [Lección 1 <<](./01-context-window-is-memory.md) | Siguiente: [Lección 3 >>](./03-external-memory-files.md)

## Añadir es lo predeterminado: por qué el historial no deja de crecer

La Lección 1 dejó claro que el historial que ve el modelo es lo que la aplicación anfitriona reenvía cada turno. Entonces, ¿cómo se envía realmente? La implementación más simple es **añadir** (append): cuando termina un turno, pegas los mensajes nuevos de ese turno (las palabras del usuario, la respuesta del modelo, las llamadas a herramientas y sus resultados) al final del arreglo `messages` existente, y en el siguiente turno reenvías todo el arreglo tal cual.

La documentación oficial expone este comportamiento por defecto con claridad: a medida que la conversación avanza, cada mensaje del usuario y cada respuesta del modelo se amontonan en la ventana de contexto, y cada turno anterior se conserva completo. "As the conversation advances through turns, each user message and assistant response accumulates within the context window, and previous turns are preserved completely." (a medida que la conversación avanza por turnos, cada mensaje del usuario y cada respuesta del asistente se acumulan dentro de la ventana de contexto, y los turnos previos se conservan por completo).[^S1] Nadie borra nada activamente, así que el historial solo sube: diez turnos después, la ventana contiene el contenido de los diez turnos completos, no un resumen del último turno ni un conjunto autofiltrado de puntos destacados.

En una conversación corta esto no es problema. Pero para un agente que se ejecuta durante mucho tiempo, el problema se agrava: los argumentos completos de cada llamada a herramienta y su valor de retorno completo se embuten en el historial, y una tarea que lee archivos y ejecuta comandos repetidamente puede empujar con facilidad el arreglo `messages` a las decenas de miles de tokens tras unas cuantas docenas de turnos. La Lección 1 cubrió que la ventana tiene un techo de capacidad, y cuanto más llena está, más cerca estás de chocar con él. El costo más sutil es la **degradación de contexto**: cuanto más largo y desordenado es el historial, más difícil le resulta al modelo encontrar ahí dentro la única línea que de verdad importa ahora mismo[^S1]. Deja que el historial crezca sin control y al final pagas ambas facturas.

## Truncado: la opción más simple y más tosca

La respuesta más directa es el **truncado**: cuando la ventana está casi llena, cortas de raíz el lote más antiguo de mensajes y conservas solo los N turnos más recientes. Es lo más fácil de construir: sin llamada extra al modelo, sin formato de resumen que diseñar. Una sola línea de `messages.slice(-N)` lo logra.

Pero lo que el truncado descarta se pierde para siempre. Si el lote que cortaste contenía una restricción clave que el usuario expresó allá en el turno 3 («el presupuesto se mantiene bajo \$5,000») y el agente está ahora en el turno 40 a punto de hacer un pedido, esa información simplemente se esfuma. El modelo no sabrá que una vez la «vio» y luego la «olvidó»: se comporta como si nunca se la hubieran dicho.

El truncado tiene además una trampa más oculta, que conecta directamente con el protocolo de ida y vuelta del curso anterior, Agent Tool Calling: Getting Agents to Actually Do Things, Lección 2 "The Full Round-Trip of a Tool Call": si truncas rebanando ingenuamente hasta «los últimos N mensajes», puedes cortar con facilidad en medio de un par `tool_use` / `tool_result`, conservando el mensaje `assistant` que disparó la llamada pero rebanando el mensaje `tool_result` que venía justo después. Envía ese historial al modelo y el propio protocolo queda roto. La documentación es explícita: "Tool result blocks must immediately follow their corresponding tool use blocks in the message history." (los bloques de resultado de herramienta deben seguir inmediatamente a sus bloques de uso de herramienta correspondientes en el historial de mensajes).[^S7] Un error como "tool_use ids were found without tool_result blocks immediately after" es la señal de que el emparejamiento está roto[^S7]: el modelo ve que «inició una llamada» pero nunca obtiene el resultado de esa llamada, y la siguiente solicitud falla de plano.

```agentmentor-check
{
  "id": "mem-zh-02-truncation-tradeoff",
  "label": "Deducir qué descartó el truncado",
  "prompt": "Un agente ha ejecutado 40 turnos, la ventana está casi llena, y escribiste una línea —messages.slice(-10)— para conservar solo los últimos 10 mensajes antes de enviarlos al modelo. El usuario dijo «el presupuesto se mantiene bajo $5,000» allá en el turno 3. ¿Esa restricción seguirá apareciendo en el comportamiento del modelo?",
  "whyHere": "Acabamos de cubrir que el truncado descarta la información que hay dentro del lote que corta. Esto comprueba si el aprendiz piensa «el modelo tiene buena memoria, siempre conservará lo importante» en lugar de entender que «el contenido que no se envió es contenido que el modelo nunca vio».",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sigue apareciendo: la línea importa lo suficiente como para que el modelo la guardara en su memoria en un turno anterior.",
      "correct": false,
      "feedback": "Incorrecto. La Lección 1 lo cubrió: el modelo no almacena nada entre solicitudes, así que la importancia de una línea no cambia nada. Una vez que el truncado corta el mensaje del turno 3, deja de aparecer en el arreglo messages que envías, y para el modelo esa línea se lee como si nunca se hubiera dicho."
    },
    {
      "id": "b",
      "text": "No aparecerá: el mensaje del turno 3 ya lo descartó el truncado y no está en esta solicitud.",
      "correct": true,
      "feedback": "Correcto. Conservar solo los últimos 10 mensajes deja el «el presupuesto se mantiene bajo $5,000» del turno 3 fuera del arreglo messages de esta solicitud. Lo que no está en la ventana no existe en lo que al modelo respecta, por importante que fuera en su origen."
    },
    {
      "id": "c",
      "text": "Sigue apareciendo: el truncado solo oculta mensajes temporalmente, no los borra de verdad.",
      "correct": false,
      "feedback": "El truncado aquí sí retira esos mensajes del arreglo que estás por enviar; no los está «ocultando». Si esa línea necesita llegar al modelo de nuevo, algún otro mecanismo tiene que transportarla de vuelta (escribirla en un resumen o en memoria externa); no puedes contar con que el truncado la conserve por sí solo."
    }
  ]
}
```

## Compactación: exprimir la ventana hasta un solo resumen

El problema del truncado es que descarta tramos enteros. ¿Hay forma de liberar espacio sin tirar la información por completo? Ese es el problema que resuelve la **compactación**. El Cookbook oficial la define así: "Compaction distills the contents of a context window into a high-fidelity summary, letting the agent continue with minimal performance degradation when the conversation gets long." (la compactación destila el contenido de una ventana de contexto en un resumen de alta fidelidad, dejando que el agente continúe con una degradación mínima de rendimiento cuando la conversación se alarga).[^S2]

A diferencia del «borrar un tramo entero» del truncado, la compactación es un «reescribir todo»: el historial de conversación anterior se comprime en un solo **resumen de alta fidelidad** que reemplaza la larga tirada de mensajes crudos y se queda al frente de la ventana. Lo que el resumen conserva es «qué pasó y qué se concluyó»; lo que descarta es el detalle palabra por palabra del diálogo crudo.

La documentación detalla los parámetros de este mecanismo. Hay un **umbral de disparo** por defecto: la compactación se dispara automáticamente cuando el uso de la ventana llega a 150K tokens; el umbral es configurable pero no puede bajar de 50K tokens, un piso impuesto por el servidor[^S2][^S8]. Cada disparo es un reemplazo discreto: el gran tramo de historial se cambia por el resumen, y los mensajes nuevos siguen añadiéndose con normalidad después. No es un evento único: la documentación es explícita en que una conversación larga puede compactarse más de una vez, y "The last compaction block reflects the final state of the prompt, replacing content prior to it with the generated summary." (el último bloque de compactación refleja el estado final del prompt, reemplazando el contenido previo a él con el resumen generado).[^S8] Cuando compacta de nuevo, el bloque de compactación anterior se pliega dentro del nuevo resumen junto con el resto del historial; la compactación es una operación sobre toda la transcripción donde "user messages, assistant messages, tool calls, tool results, even prior compaction blocks are all flattened into the summary." (los mensajes de usuario, los mensajes del asistente, las llamadas a herramientas, los resultados de herramientas, incluso los bloques de compactación previos, se aplanan todos dentro del resumen).[^S2]

La compactación no es gratis. El acto de compactar cuesta una llamada extra al modelo (ejecuta el modelo resumidor)[^S2], y por más cuidadosamente escrito que esté, el resumen es una versión con pérdidas del original: "The summary preserves key decisions and facts but may drop specific numbers or exact phrasing." (el resumen conserva decisiones y hechos clave, pero puede descartar números específicos o la formulación exacta).[^S2] Si un paso posterior resulta depender de un detalle diminuto que se resumió y se perdió (la ortografía exacta de alguna variable, digamos), ese detalle puede ya no estar. Por eso también la compactación encaja con el problema de grano grueso de «el contexto en general se volvió demasiado grande», en lugar de servir como panacea para todo tipo de inflado del historial.

## Borrado de resultados de herramientas: borrar solo la parte que se vuelve obsoleta

Un gran contribuyente al inflado del historial son las propias llamadas a herramientas. Cada vez que un agente lee un archivo o ejecuta un comando, el valor de retorno completo se embute en el historial: lee un archivo de unos miles de líneas y esas miles de líneas se quedan tal cual en el arreglo `messages`, incluso diez turnos después, cuando ya nadie necesita el detalle. El Cookbook lo señala directamente: "Tool-result clearing addresses the bloat from tool use itself. As an agent pulls in tools and calls them, the results pile up, and deciding how much of that tool output to keep becomes an increasingly important part of managing context." (el borrado de resultados de herramientas aborda el inflado que produce el propio uso de herramientas; a medida que un agente incorpora herramientas y las llama, los resultados se amontonan, y decidir cuánta de esa salida de herramienta conservar se vuelve una parte cada vez más importante de gestionar el contexto).[^S2]

El **borrado de resultados de herramientas** es el mecanismo apuntado de lleno a esto: "drops old, re-fetchable results while keeping the record that the call happened." (descarta resultados antiguos y recuperables mientras conserva el registro de que la llamada ocurrió).[^S2] Esa es la distinción clave: el borrado descarta el contenido concreto que devolvió la herramienta (esas miles de líneas de contenido de archivo), pero no borra el registro de que «el agente llamó a `read_file` con esta ruta». Si ese contenido vuelve a hacer falta más tarde, el agente sabe qué herramienta llamó y qué argumentos pasó, y puede decidir si vuelve a llamarla para recuperar el contenido.

Su umbral de disparo y su política de retención también tienen valores por defecto claros: el borrado se dispara cuando el uso de la ventana llega a 100K tokens, y por defecto conserva los resultados completos de las 3 llamadas a herramientas más recientes, borrando los resultados de herramientas más antiguos[^S2]. El disparo de 100K es más bajo que el de 150K de la compactación, lo cual encaja con su papel: encárgate primero de la salida de herramientas, la parte que «más fácil se infla y más fácil se vuelve a recuperar», y si con eso no basta, entrega la ventana en general a la compactación.

```agentmentor-check
{
  "id": "mem-zh-02-compaction-vs-clearing",
  "label": "Elegir el mejor mecanismo de gestión del historial",
  "prompt": "Un agente llamó a la herramienta read_file una docena de veces seguidas, cada vez leyendo unos miles de líneas de código, y ahora el historial está repleto de esos contenidos crudos de archivo. El uso de la ventana corre hacia el techo. ¿Esto encaja mejor con la compactación o con el borrado de resultados de herramientas?",
  "whyHere": "Acabamos de cubrir la compactación y el borrado de resultados de herramientas por separado. Esto comprueba si el aprendiz puede elegir según «cuál es la fuente concreta del inflado» en lugar de tratar los dos mecanismos como sinónimos intercambiables.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Borrado de resultados de herramientas: el inflado viene sobre todo de salida de herramienta recuperable, que es exactamente para lo que está hecho el borrado.",
      "correct": true,
      "feedback": "Correcto. Casi todo el inflado aquí es contenido devuelto por read_file, la clase de contenido que basta con volver a leer cuando se queda obsoleto, lo cual coincide con el papel del borrado de «descartar resultados obsoletos y recuperables, conservar el registro de la llamada». Su disparo por defecto (100K) es además más bajo que el de la compactación (150K), así que puede intervenir antes."
    },
    {
      "id": "b",
      "text": "Compactación: puede destilar todo en un solo resumen, lo cual es menos trabajo en general.",
      "correct": false,
      "feedback": "La compactación puede manejar el inflado general de la ventana, pero su papel es una «reescritura completa» y lo que produce es un resumen con pérdidas. La fuente del inflado aquí es específica —esas miles de líneas de contenido de archivo que se pueden releer—, así que descartar los resultados obsoletos y conservar el registro de la llamada encaja mejor que plegarlo todo en un resumen, y evita la llamada extra al modelo de la compactación."
    },
    {
      "id": "c",
      "text": "Da igual: elige cualquiera de los dos, al final ambos liberan espacio de la ventana.",
      "correct": false,
      "feedback": "Resuelven problemas distintos: la compactación reescribe todo el historial de la ventana en un solo resumen de alta fidelidad, mientras que el borrado de resultados de herramientas solo descarta salida de herramienta obsoleta y recuperable y conserva el registro de la llamada. La fuente concreta del inflado aquí (resultados de herramienta recuperables) es lo que hace del borrado el mejor encaje."
    }
  ]
}
```

## Elegir entre los tres: un modelo mental

Ahora tenemos dos mecanismos, y sumar la memoria externa que cubre la Lección 3 los hace tres. El Cookbook da un modelo mental compacto que ordena su reparto de tareas: "compaction compresses the whole window when it grows too large, clearing drops stale re-fetchable data inside the window, and memory moves information out of the window so it survives across sessions." (la compactación comprime toda la ventana cuando crece demasiado, el borrado descarta datos obsoletos y recuperables dentro de la ventana, y la memoria mueve la información fuera de la ventana para que sobreviva a través de las sesiones).[^S2]

Sus prioridades y casos de uso no compiten: están por capas.

- El **borrado** de resultados de herramientas maneja «este contenido sigue en la ventana pero se quedó obsoleto, y descartarlo está bien porque se puede volver a recuperar»: el más dirigido, el menos costoso.
- La **compactación** maneja «toda la ventana creció demasiado», sin importar de dónde vino el contenido, reescribiéndolo todo en un solo resumen: mayor alcance, pero con pérdidas y cuesta una llamada extra al modelo.
- La **memoria** (el tema de la próxima lección) maneja «esta información no debería vivir solo en esta conversación, necesita durar hasta la próxima sesión»: no está resolviendo en absoluto «la ventana no puede con todo», sino «cuando esta conversación termine, todo lo que hay en la ventana desaparece».

Volvamos a la pregunta con la que abrió esta lección: el historial solo crece porque nadie lo borra activamente. El truncado, la compactación y el borrado de resultados de herramientas son tres formas de borrarlo a distintos costos y para distintas situaciones; cuál eliges depende de qué quieras conservar y de cuánto estés dispuesto a pagar para conservarlo.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Elegir el mecanismo correcto para tres escenarios

Para cada uno de los tres escenarios de abajo, determina si encaja mejor el truncado, la compactación o el borrado de resultados de herramientas, y explica por qué (la razón tiene que apoyarse en «la fuente concreta del inflado» o en «si te puedes permitir perder detalle», no solo en «este parece más apropiado»).

1. Un agente de revisión de código llama repetidamente a `grep_code` para buscar en el código base, y cada llamada devuelve unas cuantas docenas de líneas de coincidencias. El uso de la ventana está cerca del techo, pero la tarea de revisión no ha terminado.
2. Un agente de soporte lleva 60 turnos conversando con un usuario. La ventana ha crecido mucho en general, conteniendo tanto llamadas a herramientas como largos tramos de diálogo del usuario y del agente: el contenido viene de todas partes.
3. Un agente asistente de toma de notas necesita saber, al inicio de cada nueva sesión diaria, una preferencia de largo plazo que el usuario mencionó la semana pasada («nada de comida picante»). Esta sesión misma acaba de comenzar, y la ventana no está ni cerca de llenarse.

<!-- rubric -->
- El escenario 1 elige el borrado de resultados de herramientas, con una razón que nombra que el inflado viene de contenido de retorno de herramienta recuperable
- El escenario 2 elige la compactación, con una razón de que el contenido viene de todas partes y necesita una reescritura completa en lugar de borrar una sola fuente
- El escenario 3 elige la memoria (no truncado/compactación/borrado), con una razón de que el problema de fondo es «sobrevivir a través de las sesiones», no «esta ventana no puede con todo»

<!-- answer -->
Respuesta de referencia: El escenario 1 debería usar **borrado de resultados de herramientas**: casi todo el inflado viene de los resultados de retorno obsoletos y recuperables de `grep_code`, así que borrar los resultados antiguos mientras conservas el registro de la llamada te deja volver a buscar cuando haga falta, sin nada del sobrecosto extra de la compactación. El escenario 2 debería usar **compactación**: el contenido viene de todas partes, tanto llamadas a herramientas como largo diálogo, así que no es un problema de una sola fuente; necesitas reescribir toda la ventana en un solo resumen de alta fidelidad para liberar espacio mientras conservas el hilo general. El escenario 3 no es algo que el truncado, la compactación ni el borrado de resultados de herramientas puedan resolver: la ventana de esta sesión no está ni cerca de llenarse, y el problema real es que «la preferencia mencionada la semana pasada es simplemente invisible para esta sesión». Ese es el problema de «sobrevivir a través de las sesiones» que resuelve la **memoria**, no un problema de «esta ventana no puede con todo», y le toca a la próxima lección cubrirlo en detalle.

<!-- hint -->
Empieza preguntándote: en este escenario, ¿el problema es «la ventana de esta conversación está por quedarse sin espacio», o «la información no puede pasar de la conversación anterior a esta»? Esos dos tipos de problema piden soluciones completamente distintas.

<!-- hint -->
Recuerda el modelo mental de la sección «Elegir entre los tres»: el borrado apunta a datos obsoletos y recuperables dentro de la ventana, la compactación apunta a una ventana que en general es demasiado grande, la memoria apunta a sobrevivir a través de las sesiones. Sus tareas no se solapan.

### Nivel 2: Diagnosticar un código que trunca hasta provocar un error

El pseudocódigo de abajo intenta borrar el historial cuando el uso de la ventana sube demasiado, conservando solo los mensajes más recientes:

```javascript
function trimHistory(messages, maxKeep) {
  if (messages.length <= maxKeep) return messages;
  return messages.slice(-maxKeep);
}
```

Supón que en cierto momento el arreglo `messages` está exactamente en este orden: `[..., { role: "assistant", content: [tool_use block] }, { role: "user", content: [tool_result block] }, ...]`, y que `maxKeep` justo separa esos dos mensajes, conservando solo el de `tool_result` y cortando el de `tool_use`.

Explica qué problema causa esto al enviarse al modelo, y da un arreglo que lo evite (no hace falta código completo: basta con dejar clara la idea).

<!-- rubric -->
- Señala que el modelo ve un mensaje tool_result sin su tool_use correspondiente, así que la estructura del protocolo queda rota
- Expresa la consecuencia: el modelo puede dar error o comportarse de forma confusa, no solo «tener información incompleta»
- El arreglo propuesto debe garantizar que el punto de corte nunca caiga en medio de un par tool_use / tool_result (por ejemplo, cortar tomando las «idas y vueltas» completas como unidad, no por cantidad de mensajes)

<!-- answer -->
Respuesta de referencia: Cortar así le deja al modelo un mensaje `tool_result` cuyo bloque `tool_use` correspondiente no aparece por ningún lado en el historial: el protocolo exige que el `tool_use_id` de cada `tool_result` coincida con un `tool_use` anterior en el historial, y esa coincidencia ahora está rota, así que el modelo da error por la anomalía estructural (el error de la documentación es la familia de "tool_use ids were found without tool_result blocks immediately after")[^S7]. El arreglo: no cortes contando mensajes, corta con «una ida y vuelta completa» como la unidad más pequeña. Si un mensaje `assistant` contiene un bloque `tool_use`, tiene que conservarse o descartarse junto con el mensaje `user` que viene justo después y que lleva el `tool_result` correspondiente; no puedes rebanar una ida y vuelta por la mitad.

<!-- hint -->
Recuerda «la ida y vuelta completa de una llamada a herramienta» del curso anterior: `tool_use` y `tool_result` son un par unido por `tool_use_id`, y el protocolo espera que siempre aparezcan juntos.

<!-- hint -->
En lugar de contar «conserva los últimos N mensajes», dale la vuelta al enfoque: primero agrupa el historial en unidades de «una ida y vuelta completa», y luego decide cuántos grupos recientes conservar, en vez de rebanar el arreglo de mensajes directamente.

<!-- /exercises -->

## Resumen

- El historial de conversación solo crece por defecto: los mensajes de cada turno se amontonan en la ventana, los turnos anteriores se conservan completos y, sin nadie que los borre activamente, sube sin límite
- El truncado es lo más simple, pero lo que descarta es irreversible, y si el punto de corte cae en medio de un par `tool_use` / `tool_result`, rompe la estructura del protocolo de la llamada a herramienta
- La compactación reescribe todo el historial de la ventana en un solo resumen de alta fidelidad, disparándose por defecto a 150K tokens (el umbral no puede bajar de 50K, impuesto por el servidor), a costa de ser con pérdidas y de una llamada extra al modelo; una conversación larga puede compactarse más de una vez, con los bloques de resumen anteriores plegados dentro del nuevo resumen[^S2][^S8]
- El borrado de resultados de herramientas solo descarta salida de herramienta obsoleta y recuperable mientras conserva el registro de la llamada, disparándose por defecto a 100K tokens y conservando los resultados de las últimas 3 llamadas: más dirigido que la compactación
- Los tres tienen tareas distintas: el borrado maneja datos obsoletos y recuperables, la compactación maneja una ventana que en general es demasiado grande, la memoria maneja sobrevivir a través de las sesiones; cuál eliges depende de la fuente concreta del inflado y de si te puedes permitir perder detalle

[>> Lección 3: Memoria externa: archivos y recuperación](./03-external-memory-files.md)
