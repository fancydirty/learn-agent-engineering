# Lección 1: La ventana de contexto es toda la memoria que tiene un agente

> Objetivos de aprendizaje:
> - Explicar por qué «el agente recuerda nuestra conversación anterior» es una ilusión
> - Identificar qué cuenta para la ventana de contexto de una sola solicitud y qué no
> - Explicar qué es la degradación de contexto (context rot) y por qué una ventana más grande no es automáticamente mejor para trabajar
> - Determinar si una llamada a la API es sin estado y qué implica eso para la memoria
>
> Requisitos: los primeros cuatro cursos de esta serie, incluido el protocolo de ida y vuelta de las llamadas a herramientas de Agent Tool Calling: Getting Agents to Actually Do Things | Siguiente: [Lección 2 >>](./02-managing-conversation-history.md)

## Una conversación que parece recordar

Estás conversando con un agente de atención al cliente:

```text
Usuario: Me llamo Sarah, número de pedido ORD-2026-8842.
Agente: Entendido, Sarah. Déjame revisar ORD-2026-8842... está en reparto, con entrega prevista para mañana.
Usuario: ¿Y el que compré la vez pasada?
Agente: ¿Te refieres a ORD-2026-8842? Ese llega mañana; si preguntas por un pedido distinto, ¿me puedes dar el número de pedido?
```

En el segundo turno, el agente claramente «recuerda» que te llamas Sarah y recuerda que preguntaste por ORD-2026-8842. Parece que archivó esos detalles en algún lugar y que puede recuperarlos la próxima vez.

La verdad es mucho más simple. En cada solicitud, tu código vuelve a empaquetar **cada mensaje desde el inicio de la conversación hasta ahora** y lo envía al modelo tal cual.[^S6] El modelo no está viendo «recuerdo que te llamas Sarah»: está releyendo desde cero «el usuario dijo: me llamo Sarah», cada vez. Cada oración del turno anterior, cada llamada a herramienta, tiene que ser colocada en la solicitud de este turno por tu propio código. El modelo no almacena nada por su cuenta.

## La llamada a la API es sin estado

Dicho de forma aún más directa: entre una llamada y la siguiente, no se guarda nada por ti en el servidor. Una vez que se procesa esta solicitud, esos tokens desaparecen de la vista del modelo. Si la siguiente solicitud no lleva nada, el modelo ve una hoja en blanco: ni siquiera sabe tu nombre.

La razón por la que se siente como memoria es que la aplicación anfitriona hace el trabajo pesado por ti: reenvía el arreglo completo de mensajes del historial. Eso no es una capacidad del modelo; es un arreglo en tu código que no deja de crecer. Esta propiedad tiene un nombre: **sin estado** (stateless). En palabras de la documentación oficial: "The Messages API is stateless, which means that you always send the full conversational history to the API." (la API de mensajes es sin estado, así que siempre envías el historial completo de la conversación a la API).[^S6] El servidor no guarda ningún estado privado por sesión entre solicitudes; toda la «memoria» tiene que ser transportada y reenviada por el propio cliente.

## Qué hay realmente en la ventana de contexto

Todo lo que el modelo puede ver vive en un contenedor llamado **ventana de contexto**. La documentación es explícita en que todo lo que va en una solicitud cuenta: "Everything in the request counts toward the context window: the system prompt, every message in messages (including tool results, images, and documents), and your tool definitions. The output Claude generates for the turn, including its extended thinking, counts too." (todo en la solicitud cuenta para la ventana de contexto: el prompt del sistema, cada mensaje en messages —incluidos resultados de herramientas, imágenes y documentos— y tus definiciones de herramientas; la salida que Claude genera en el turno, incluido su razonamiento extendido, también cuenta).[^S1]

```json
{
  "model": "claude-sonnet-5",
  "system": "Eres un asistente de atención al cliente ...",
  "tools": [ { "name": "get_order_status", "...": "..." } ],
  "messages": [
    { "role": "user", "content": "Me llamo Sarah, número de pedido ORD-2026-8842." },
    { "role": "assistant", "content": "Entendido, Sarah ..." },
    { "role": "user", "content": "¿Y el que compré la vez pasada?" }
  ]
}
```

En esta solicitud, `system`, `tools` y los tres mensajes del arreglo `messages` cuentan para la ventana de contexto. Una vez que se genera la respuesta del modelo, esos tokens de salida también cuentan para el uso de la ventana de este mismo turno. La respuesta lleva un **campo `usage`** que te dice cuántos tokens de entrada y de salida consumió realmente el turno: "Every response reports what the request consumed in its `usage` field." (cada respuesta informa lo que consumió la solicitud en su campo usage).[^S1]

Cualquier cosa que no esté empaquetada en esta solicitud —digamos un registro de pedido en una base de datos que ninguna herramienta ha consultado todavía— no forma parte de la ventana de contexto. El modelo no puede verla ni puede saber que existe de la nada. Por eso la «memoria» tiene que ser transportada activamente a esta solicitud mediante algún mecanismo; no es alcanzable de forma automática.

```agentmentor-check
{
  "id": "mem-zh-01-stateless-check",
  "label": "Deducir qué puede ver el modelo en la siguiente solicitud",
  "prompt": "En el primer turno el usuario le dijo al agente «me llamo Sarah», y el agente respondió con normalidad. Si el arreglo messages de la segunda solicitud contiene solo lo que el usuario acaba de decir en este turno, y no los dos mensajes del primer turno, ¿el modelo seguirá recordando que el usuario se llama Sarah?",
  "whyHere": "Acabas de aprender que la llamada a la API es sin estado y que el historial tiene que ser reenviado por el cliente. Esto comprueba si al aprendiz le queda el instinto residual de que «el modelo guardó la conversación por sí mismo», en lugar de captar que si el historial no se empaqueta en esta solicitud, el modelo simplemente no puede verlo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sí, porque el modelo ya guardó ese detalle en su propia memoria mientras procesaba el primer turno",
      "correct": false,
      "feedback": "Incorrecto. La llamada a la API es sin estado: no se comparte ningún estado del lado del servidor entre una llamada y la siguiente. Una vez procesado el primer turno, esos tokens dejan de ser visibles para el modelo. No existe eso de «el modelo recordándolo por sí mismo»."
    },
    {
      "id": "b",
      "text": "No, porque la ventana de contexto solo contiene lo que se envía realmente en esta solicitud, así que el historial que no se empaquetó no existe para el modelo",
      "correct": true,
      "feedback": "Correcto. La ventana de contexto contiene lo que esta solicitud lleva realmente: el prompt del sistema, el arreglo messages, las definiciones de herramientas. Si los dos mensajes del primer turno no se colocaron en el turno de la segunda solicitud, el modelo ve una hoja en blanco, y el nombre «Sarah» nunca apareció para él."
    },
    {
      "id": "c",
      "text": "Sí, porque los mensajes del historial bajo el mismo ID de usuario los enlaza automáticamente el servidor",
      "correct": false,
      "feedback": "No existe tal enlace automático. Que el contexto viaje entre solicitudes depende por completo de si el cliente volvió a colocar los mensajes del historial en el arreglo messages y los envió de nuevo; no tiene nada que ver con un ID de usuario."
    }
  ]
}
```

## La ventana se degrada: más grande no es mejor

Hay un techo para lo que la ventana puede contener —la capacidad varía según el modelo, y la cifra oficial llega hasta 1 millón de tokens: "The context window (up to 1M tokens, depending on the model) holds the conversation history plus the new output Claude generates." (la ventana de contexto —hasta 1M de tokens, según el modelo— contiene el historial de la conversación más la nueva salida que genera Claude).[^S1] Pero eso no significa que debas llenarla lo máximo posible. La documentación nombra un fenómeno concreto, la **degradación de contexto** (context rot): "As token count grows, accuracy and recall degrade, a phenomenon known as *context rot*. This makes curating what's in context just as important as how much space is available." (a medida que crece el número de tokens, la precisión y la recuperación se degradan, un fenómeno conocido como context rot; esto hace que curar lo que hay en el contexto sea tan importante como cuánto espacio hay disponible).[^S1] En otras palabras, cuanto más contenido contiene la ventana y más desordenada se vuelve, peor le va al modelo para extraer de ahí la respuesta correcta, lo que hace que *qué* pones en el contexto importe tanto como cuánto espacio queda.[^S1]

Esto moldea directamente el diseño de la memoria: volcar todo el historial en el contexto no es gratis (llena la capacidad de la ventana) y tampoco es sin costo (obliga al modelo a esforzarse más para encontrar la única oración que de verdad importa ahora mismo, sepultada bajo un montón de información obsoleta). La Lección 2 cubre cómo manejar esa **acumulación** en la práctica: cómo truncar el historial, cómo resumirlo, en lugar de dejarlo crecer sin límite.

## La palabra «memoria» es en realidad una metáfora

Volvamos a esa conversación de soporte del principio. Cuando decimos «el agente recuerda que te llamas Sarah», la forma precisa de expresarlo es: tu código reenvió el historial completo —el que contiene «me llamo Sarah»— al modelo tal cual, una vez más, y el modelo lo releyó dentro de esta solicitud. No hay almacenamiento, no hay recuperación, solo un **reenvío**.

Esto no es hilar fino. Entender que «la memoria es una ilusión producida por el reenvío» moldea directamente cómo diseñas un agente que de verdad «recuerde»:

- Si el arreglo del historial crece sin límite, la ventana se llena tarde o temprano, y encima chocas con la degradación de contexto: el problema que resuelve la Lección 2.
- Si cierta información necesita persistir a través de **varias sesiones** (no solo dentro de esta conversación), no puedes contar con embutirla en el arreglo messages; tiene que escribirse en algún lugar externo: la memoria externa que cubre la Lección 3.
- Si el agente necesita saber «hasta dónde he avanzado» a mitad de una tarea, ese progreso igualmente tiene que ser **estado estructurado** visible en la ventana de contexto, no algo que el modelo adivine: el tema de la Lección 4.

Los tres hilos son corolarios distintos del mismo hecho: el modelo solo conoce lo que está en la ventana; lo que no está en la ventana no existe en lo que al modelo respecta.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Marcar qué cuenta para la ventana de contexto

Abajo hay una solicitud real enviada al modelo (simplificada), más tres cosas que «también existen» pero que **no** aparecen en esta solicitud:

```json
{
  "model": "claude-sonnet-5",
  "system": "Eres un asistente de pedidos.",
  "tools": [ { "name": "get_order_status", "input_schema": { "...": "..." } } ],
  "messages": [
    { "role": "user", "content": "Búscame ORD-2026-8842" }
  ]
}
```

Las tres cosas extra que existen:

1. El contenido real del registro del pedido ORD-2026-8842 en la base de datos (todavía no consultado por ninguna herramienta)
2. Una dirección de envío que el mismo usuario mencionó la semana pasada en una sesión con un agente distinto
3. El texto de respuesta que el modelo genera después de procesar esta solicitud

Para cada uno, decide: de estos cuatro tipos de contenido (`system` / `tools` / el mensaje del usuario en `messages` / los tres elementos extra de arriba), cuáles cuentan para la ventana de contexto de esta solicitud y cuáles no, con una oración de razonamiento cada uno.

<!-- rubric -->
- Identifica correctamente que `system`, `tools` y el mensaje del usuario en `messages` cuentan todos para la ventana de contexto
- Identifica correctamente que el registro del pedido y la dirección de envío de la semana pasada no cuentan ahora mismo, porque no se colocaron en esta solicitud
- Identifica correctamente que el texto de respuesta que genera el modelo cuenta para el uso de la ventana de **este turno**, aunque se produzca después de procesar la solicitud

<!-- answer -->
Respuesta de referencia: `system`, `tools` y el mensaje del usuario en `messages` están todos en esta solicitud, así que los tres cuentan para la ventana de contexto. El registro del pedido en la base de datos y la dirección de envío mencionada la semana pasada no aparecen en ningún campo de esta solicitud, así que ahora mismo no existen para el modelo y no cuentan para la ventana, a menos que alguna herramienta consulte más tarde el registro del pedido y lo empaquete en `messages` como un `tool_result`, momento en el que contaría para la ventana de algún turno posterior. El texto de respuesta que el modelo genera en este turno también cuenta para el uso de la ventana de este turno, porque la salida del modelo es en sí misma parte de la ventana.

<!-- hint -->
Solo hay una prueba: ¿la cosa apareció realmente en la solicitud JSON enviada al modelo? Si no lo hizo, no cuenta, por más «objetivamente real» que sea en la base de datos.

<!-- hint -->
La salida del modelo es fácil de pasar por alto: es «generada», pero el acto de generar también consume capacidad de la ventana, y el campo `usage` de la respuesta lo incluye.

### Nivel 2: Encontrar la suposición equivocada en esta descripción

Un colega describe así un agente que está diseñando: «Nuestra conversación ya lleva 20 turnos, y la base de datos guarda el historial completo, así que aunque la solicitud de este turno solo envíe la última oración del usuario, el modelo puede seguir la conversación, porque el servidor sabe que es la misma sesión».

Señala la suposición equivocada en esta descripción, y explica en qué escenario se rompe si de verdad se construyera así.

<!-- rubric -->
- Identifica con claridad que el error es suponer que el servidor enlaza automáticamente los mensajes del historial de la misma sesión
- Explica que la llamada a la API es sin estado, y que el modelo solo ve el contenido de `messages` que esta solicitud lleva realmente
- Da un escenario concreto de «aquí se rompe», como que el modelo «olvide» de repente, responda fuera de tema o dé error

<!-- answer -->
Respuesta de referencia: la suposición equivocada es «el servidor sabe que es la misma sesión», creer que si la base de datos guarda el historial, el modelo puede verlo automáticamente. En realidad la llamada a la API es sin estado, y el modelo solo puede ver lo que el arreglo `messages` lleva en esta única solicitud. Que la base de datos guarde el historial y que el modelo pueda verlo en este turno son dos cosas distintas; entremedio, el cliente tiene que volver a colocar activamente los mensajes del historial en la solicitud. Construido así, la solicitud número 21 envía solo «¿y el que compré la vez pasada?», y el modelo ve una pregunta aislada sin contexto alguno: lo más probable es que responda fuera de tema o vuelva a preguntar «¿a qué pedido te refieres?», como si el agente hubiera «perdido la memoria» de repente. Pero nunca «olvidó»; simplemente nunca «vio».

<!-- hint -->
Pregúntate: ¿el historial «guardado» en la base de datos es lo mismo que el historial «incluido» en la solicitud JSON enviada al modelo esta vez?

<!-- hint -->
Recuerda la sección «La llamada a la API es sin estado» de esta lección: el servidor no guarda ningún estado privado por sesión entre solicitudes, lo cual es un golpe letal para la suposición equivocada de este problema.

<!-- /exercises -->

## Resumen

- «El agente recuerda nuestra conversación anterior» es una ilusión: la verdad es que la aplicación anfitriona vuelve a empaquetar el historial completo en cada solicitud, y el modelo no almacena nada por sí mismo[^S6]
- La llamada a la API es sin estado; el servidor no guarda ningún estado privado por sesión entre solicitudes, así que toda la «memoria» tiene que ser transportada activamente por el cliente[^S6]
- La ventana de contexto contiene todo lo que esta solicitud lleva realmente: el prompt del sistema, cada mensaje en `messages` (incluidos resultados de herramientas, imágenes, documentos), las definiciones de herramientas y la propia salida del modelo para el turno[^S1]
- La ventana tiene un techo de tamaño, y más grande no es automáticamente mejor de usar: la degradación de contexto significa que cuantos más tokens amontonas, más se degradan la precisión y la recuperación[^S1]
- Captar que «el modelo solo conoce lo que está en la ventana» lleva directo a los problemas que resuelven las tres lecciones siguientes: cómo gestionar el historial, cómo externalizar la memoria, cómo estructurar el estado

[Lección 2: Gestionar el historial de conversación: añadir, truncar, resumir >>](./02-managing-conversation-history.md)
