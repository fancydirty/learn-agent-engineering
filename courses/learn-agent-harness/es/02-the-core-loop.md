# Lección 2: El bucle central: de una ida y vuelta a la operación continua

> Objetivos de aprendizaje:
> - Recitar los cuatro pasos del bucle multiturno que impulsa stop_reason, y conectar una ida y vuelta de llamada a herramienta en un bucle while que sigue en marcha
> - Usar el valor de stop_reason (tool_use / end_turn) para decidir si el bucle continúa o se para, y explicar por qué ese campo es la condición del while del bucle
> - Señalar qué fronteras le faltan a este bucle esqueleto, y explicar por qué el historial crece en cada turno y por qué no puedes fiarte solo de que el modelo diga «terminé»
>
> Requisitos: Leíste la Lección 1 y sabes que un arnés es la capa de código de control alrededor del modelo; puedes leer el tool_use / tool_result de una sola ida y vuelta de llamada a herramienta | Anterior: [Lección 1 <<](./01-what-is-a-harness.md) | Siguiente: [Lección 3 >>](./03-stop-conditions.md)

## Una sola ida y vuelta deja de bastar

La Lección 1 ya desarmó una ida y vuelta completa de llamada a herramienta: el modelo regresa `stop_reason: "tool_use"` junto con un bloque `tool_use`, tu código anfitrión lee el `name` y el `input`, ejecuta de veras la cosa, empaca la salida en un `tool_result` y la envía de vuelta, y solo entonces el modelo da su respuesta final. Tres trozos de JSON, un viaje, listo.

Las tareas reales rara vez son tan corteses. Cambia el escenario: estás escribiendo un bot de guardia, y un usuario dice: «Reinicia el servicio api por mí, luego revisa si los logs todavía tienen errores, y pégalos si los hay». Esa sola oración empaca dos trabajos, y el segundo depende del primero: revisar los logs no significa nada hasta que el reinicio haya terminado. El modelo no puede hacer ambos en el primer turno. Todo lo que puede hacer es esto:

1. El turno uno regresa `tool_use`, llamando a `restart_service`. Lo corres y devuelves «reinicio exitoso».
2. El turno dos regresa `tool_use` otra vez, esta vez llamando a `read_logs`. Lo corres y devuelves el contenido de los logs.
3. El turno tres por fin regresa `stop_reason: "end_turn"`, con una línea como «Reinicio completo; los logs tienen dos errores de timeout, pegados abajo».

Una solicitud del usuario, tres viajes de ida y vuelta. Lo que el modelo puede ver en cada paso, y lo que hace a continuación, depende de lo que regresó en el `tool_result` previo, que es exactamente la definición de agente de Anthropic: un LLM que usa herramientas basándose en la retroalimentación del entorno, dentro de un bucle.[^S1] La sola ida y vuelta de la Lección 1 es apenas el caso especial donde ese bucle resultó girar una sola vez. Lo que hace esta lección es conectar «una ida y vuelta» en «idas y vueltas que siguen y siguen», y lograr una vista clara de qué es el bucle del medio, qué lo impulsa y dónde necesita un freno.

## Los cuatro pasos del bucle

Convertir una sola ida y vuelta en un bucle no exige inventar nada nuevo. Solo repites los movimientos que ya conoces. La documentación de la API de Claude escribe este proceso multiturno como una secuencia fija:[^S2]

1. Envías una solicitud que carga `messages` y el manifiesto `tools` (`tools` tiene que ir junto en cada turno, sin excepción).
2. El modelo regresa una respuesta. Si todavía necesita una herramienta, `stop_reason` es `"tool_use"` y `content` carga uno o más bloques `tool_use`.
3. Ejecutas cada bloque `tool_use` y conviertes cada salida en un bloque `tool_result`. La palabra clave de ese paso es *cada*: por más bloques `tool_use` que hayan regresado en una respuesta, el siguiente mensaje `user` necesita esa misma cantidad de bloques `tool_result` coincidentes, cada uno reclamado por su `tool_use_id`, todos empacados en ese único mensaje `user` inmediatamente siguiente. La documentación pone la regla así: "Whichever strategy you use, return one tool_result for each tool_use block, all together in the next user message. Match each result to its call with tool_use_id, and put every tool_result block before any text content in that message."[^S6] (Cualquiera que sea la estrategia que uses, devuelve un tool_result por cada bloque tool_use, todos juntos en el siguiente mensaje del usuario. Empareja cada resultado con su llamada mediante tool_use_id, y pon cada bloque tool_result antes de cualquier contenido de texto en ese mensaje.)
4. Anexas tanto la respuesta completa del modelo de ese turno (rol `assistant`) como el lote de `tool_result` que armaste (rol `user`) a `messages`, y luego envías otra solicitud.

Después viene la oración que más importa: repite desde el paso 2 mientras `stop_reason` sea `"tool_use"`.[^S2] Ese «repite mientras» es el eje que estira una sola ida y vuelta en un bucle. El ejemplo de la Lección 1 se detuvo en el primer `end_turn` porque un viaje era todo lo que esa tarea necesitaba; el bot de guardia ejecuta los pasos 2 al 4 tres veces, hasta que el turno tres regresa `end_turn`.

Vale la pena recordar: los campos de los bloques `tool_use` y `tool_result` no han cambiado en nada. Un bloque `tool_use` carga `id` / `name` / `input`; un bloque `tool_result` carga `tool_use_id` / `content`, más un `is_error` opcional cuando la llamada falló.[^S6] El bucle no reescribe lo que significa ninguno de esos campos. Solo hace que el mismo conjunto de campos se llene y se envíe de vuelta, una y otra vez.

## stop_reason es la condición del while del bucle

Esa línea de arriba —«repite mientras `stop_reason` siga siendo `tool_use`»— se traduce en código como la prueba de un bucle while. Y la única oración que deberías llevarte de esta lección es esta: **decidir si el bucle continúa o se para se reduce a ese único campo, `stop_reason`.** Tiene muchos valores posibles, pero para el control del bucle, distinguir dos de ellos basta para empezar:

- `"tool_use"`: el modelo todavía quiere una herramienta. Te entrega la solicitud y espera a que ejecutes y devuelvas el resultado antes de continuar. El bucle gira una vuelta más.
- `"end_turn"`: el modelo ya no quiere una herramienta; cree que dijo lo que tenía que decir. El bucle termina por sí solo y le entregas el texto final al usuario.

Una hoja de ruta de código abierto sobre ingeniería de arneses pone esta capa de control sin rodeos: lo que impulsa un arnés es el bucle while que impulsa modelo→herramientas→modelo.[^S5] Y lo que se asienta en la expresión de condición de ese while es `stop_reason`. Mismo modelo, mismo conjunto de herramientas: cuántas vueltas gira y cuándo se para lo decide por entero cómo el anfitrión lee ese campo y cómo escribe esa condición. Por eso la Lección 1 dijo "Same model, different harness, completely different result."[^S5] (Mismo modelo, distinto arnés, resultado completamente distinto.)

Una cosa que conviene zanjar de entrada, para que no leas la señal al revés: `stop_reason: "tool_use"` significa que el modelo **quiere** usar una herramienta, no que una herramienta **se ha** usado. El modelo nunca ejecuta nada por su cuenta. Emite una solicitud estructurada; lo que de veras ejecuta la herramienta es tu código anfitrión (o los servidores de Anthropic), y el resultado solo vuelve a fluir a la conversación después.[^S2] Así que en el instante en que `tool_use` aparece en el bucle, nada ha pasado todavía. La acción pasa en las pocas líneas de tu código que leen el `name` y el `input` y van a hacer el trabajo. Tratar «recibí un tool_use» como «la herramienta terminó de ejecutarse» es el tropiezo más fácil al pasar de una sola ida y vuelta a un bucle: te hace juzgar mal en qué paso está de veras el bucle en este momento.

```agentmentor-check
{
  "id": "harness-zh-02-tooluse-not-executed",
  "label": "Decidir si la herramienta ya se ejecutó tras llegar stop_reason tool_use",
  "prompt": "Tu bucle envía su tercera solicitud. El modelo regresa stop_reason: «tool_use», y content contiene un bloque tool_use cuyo name es run_migration (ejecutar una migración de base de datos en la base de datos de producción). En el momento en que tu código lee esta respuesta, ¿el script de migración ya se ejecutó contra la base de datos?",
  "whyHere": "Esta sección acaba de hacer de stop_reason la condición del while del bucle y señaló que tool_use significa que el modelo quiere una herramienta, no que una se haya usado. La comprobación frena la creencia de que un bloque tool_use devuelto significa que la herramienta de este turno ya terminó, porque esa creencia te hace juzgar mal en qué paso está el bucle en este momento.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Ya se ejecutó. Como el modelo regresó un bloque tool_use, la migración de este turno ya está hecha en la base de datos y el bucle debería cerrarse.",
      "correct": false,
      "feedback": "Eso trata una señal como un recibo de ejecución. Un bloque tool_use es solo la boleta de solicitud que el modelo entrega, con el sentido de «quiero llamar a run_migration»: el modelo mismo no tiene forma de conectarse a una base de datos ni de ejecutar un script. La migración pasa solo después de que tu código anfitrión lee el bloque y de veras lo ejecuta; en este instante nada en la base de datos se ha movido."
    },
    {
      "id": "b",
      "text": "Todavía no. Esto es solo el modelo solicitando una llamada; la migración solo sucede cuando el anfitrión la ejecuta y devuelve el tool_result, y el siguiente turno sigue.",
      "correct": true,
      "feedback": "Correcto. tool_use es la señal para seguir en el bucle, no un recibo que diga que la herramienta terminó. La ejecución siempre se queda del lado del anfitrión: lees el name y el input, llamas a la lógica real de migración, empacas la salida como un tool_result y la devuelves, y solo entonces el bucle gira otra vez y el modelo llega a ver lo que la migración de veras hizo."
    }
  ]
}
```

## Escrito, son solo unas pocas líneas

Pon esos cuatro pasos y la condición del while sobre `stop_reason` en JavaScript y el esqueleto es sorprendentemente corto:

```javascript
// tools es la lista de definiciones de herramientas que tiene que ir junto en cada turno
const messages = [{ role: "user", content: userInput }];

let response = await callModel({ tools, messages });

while (response.stop_reason === "tool_use") {
  // 1. Anexa al historial la respuesta completa del modelo de este turno
  messages.push({ role: "assistant", content: response.content });

  // 2. Ejecuta cada bloque tool_use de este turno, empacando cada uno en un tool_result
  const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
  const toolResults = await Promise.all(
    toolUseBlocks.map(async (block) => ({
      type: "tool_result",
      tool_use_id: block.id,
      content: await executeTool(block.name, block.input),
    }))
  );

  // 3. Anexa este lote de bloques tool_result al historial como un mensaje user
  messages.push({ role: "user", content: toolResults });

  // 4. Envia otra solicitud con el historial ahora mas largo; de vuelta a la prueba del while
  response = await callModel({ tools, messages });
}

// Salimos del bucle, asi que stop_reason ya no es tool_use (end_turn, digamos),
// y response contiene la respuesta de texto final
```

Recorre los cuatro pasos una vez más contra el código: la línea `while` es «repite mientras siga siendo `tool_use`»; dentro del cuerpo, tanto la respuesta `assistant` como el mensaje `user` de bloques `tool_result` se hacen `push` a `messages`, y luego `response` se reasigna. Esa última asignación es lo que hace posible parar siquiera: quítala, y `response.stop_reason` conserva su valor viejo para siempre, así que el bucle while nunca sale (ese sabor de bucle infinito es la estrella de la Lección 4).

Este código funciona, pero es un esqueleto: lo bastante simple para hacer visible el bucle mismo, y ni de cerca seguro para entregarlo a producción. Da por sentado que el modelo siempre regresará `end_turn` en algún turno, da por sentado que cada herramienta ejecuta sin problemas, y da por sentado que no importa cuán largo se vuelva el historial. Esas tres suposiciones son exactamente lo que las siguientes lecciones desarman una por una.

## Cada turno de más alarga el historial

Mira otra vez esas líneas de `messages.push`: cada turno del bucle mete dos mensajes más en `messages` —la respuesta `assistant` del modelo y el lote de `tool_result` que devolviste. Y el siguiente `callModel` tiene que despachar todo `messages` de nuevo, sin cambios. Así que cuanto más se ejecuta este bucle, más historial carga cada solicitud, y solo crece.

Eso no es un descuido en la implementación. Es una propiedad inherente del bucle como estructura: un agente que se ejecuta en un bucle genera cada vez más datos que podrían ser relevantes para el siguiente turno de inferencia.[^S3] Tres turnos del bot de guardia solo amontonan un resultado de reinicio más un trozo de logs. Pero una tarea que necesita decenas de turnos enrolla el historial hasta algo enorme.

Escondido aquí hay un problema que solo se abre en el curso «Memoria y estado del agente», pero que tiene que plantarse ahora: los modelos tienen un «presupuesto de atención», y cada nuevo token introducido agota ese presupuesto en cierta medida.[^S3] Un historial más largo significa más tokens, y a medida que el número de tokens en la ventana de contexto aumenta, la capacidad del modelo de recordar con precisión información de ese contexto disminuye.[^S3] Fíjate que esto es un gradiente de rendimiento que baja con suavidad conforme a la longitud, no un precipicio duro del que caes pasado cierto umbral[^S3]; no lo leas como «pasado el límite queda inservible». Pero la dirección es inequívoca: el contexto tiene que tratarse como un recurso finito con rendimientos marginales decrecientes.[^S3] Ese `messages.push` irreflexivo del bucle esqueleto no hace nada al respecto. Da por sentado que el historial puede crecer para siempre, y «Memoria y estado del agente» es el curso que vuelve a saldar esa cuenta.

## Un bucle solo no basta; hay que añadirle fronteras

Ahora tienes un bucle que gira. Pero «puede girar» y «gira con seguridad» son dos cosas distintas. El bucle esqueleto le entrega al modelo por entero la decisión de parar o continuar: el turno en que regrese `end_turn` es el turno en que el bucle se para. Sin embargo, los agentes son sistemas donde el modelo dirige dinámicamente su propio proceso y su uso de herramientas.[^S1] Esa autonomía es precisamente de donde viene la utilidad, y precisamente donde vive el riesgo: la autonomía implica costos más altos y el potencial de errores que se componen acumulándose alrededor de turno tras turno del bucle.[^S1] El modelo potencialmente operará durante muchos turnos, y debes tener cierto nivel de confianza en su toma de decisiones antes de dejarlo ejecutarse.[^S1]

El truco está en que la confianza no es lo mismo que la ausencia de supervisión. Si el modelo se atasca en algún paso, o se desvía por lo que una herramienta devolvió, y simplemente nunca regresa `end_turn`, un bucle que no vigila más que `stop_reason` seguirá girando a su lado indefinidamente. Así que sobre la propia señal de fin del modelo, por lo general añades condiciones de parada explícitas también —un tope al número máximo de iteraciones, por ejemplo, para mantener el control de tu lado.[^S1] El escueto `while (response.stop_reason === "tool_use")` del esqueleto no tiene tal fusible: le tiene confianza al modelo sin dejarse una salida.

Eso planta los dos montajes de esta lección: **este bucle necesita fronteras** (no puedes depender de que el modelo diga `end_turn`; necesitas condiciones de parada explícitas — Lección 3), y **el historial que este bucle produce necesita gestión** (los tokens son un recurso finito, así que no puedes solo echar cosas dentro — queda para el curso Memoria y estado del agente). Cómo se ve de verdad un bucle cuando se sale de los rieles, y cómo atraparlo, es el tema de la Lección 4. Para esta lección basta con dejar puesto el eje: cómo gira el bucle, y que `stop_reason` es lo que lo impulsa.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Cuenta cuántas veces gira este bucle

Un agente asistente de agenda está montado con dos herramientas, `search_calendar` (mirar el calendario) y `create_event` (reservar algo). El usuario dice: «Fíjate si estoy libre el jueves por la tarde, y si lo estoy, reserva una revisión de 30 minutos». El anfitrión lo impulsa con el bucle esqueleto de esta lección, y la secuencia de `stop_reason` que de veras ocurre es:

- El 1.º `callModel` regresa → `stop_reason: "tool_use"` (un bloque `tool_use`, llamando a `search_calendar`)
- El 2.º `callModel` regresa → `stop_reason: "tool_use"` (un bloque `tool_use`, llamando a `create_event`)
- El 3.º `callModel` regresa → `stop_reason: "end_turn"` (texto: «Reservé la revisión para el jueves a las 14:00»)

Responde esto: (1) ¿Cuántas veces se llamó a `callModel` en total? (2) ¿Cuántas veces se llamó a `executeTool` en total? (3) ¿Cuántas veces se ejecutó el cuerpo del bucle while? (4) ¿Al leer qué `stop_reason` salió el bucle?

<!-- rubric -->
- La cuenta de `callModel` es correcta (3), con una explicación clara de de dónde viene: «1 fuera del bucle + 1 por turno dentro del cuerpo»
- La cuenta de `executeTool` es correcta (2), coincidiendo con los dos bloques `tool_use`
- El número de ejecuciones del cuerpo del while es correcto (2), y la salida ocurre al leer `end_turn`
- Explica que el 3.º `callModel` se emitió desde dentro del cuerpo del bucle, pero su regreso hace falsa la condición del while, así que no hubo una 3.ª pasada por el cuerpo

<!-- answer -->
1. `callModel` se llamó **3 veces**: una fuera del bucle (la solicitud de apertura), más la línea `response = await callModel(...)` al final del cuerpo ejecutándose dos veces (una en cada uno de los primeros dos turnos). El tercer regreso es `end_turn`.
2. `executeTool` se llamó **2 veces**: los turnos 1 y 2 tuvieron cada uno un bloque `tool_use`, ejecutado una vez cada uno; el turno `end_turn` no tiene bloque `tool_use`, así que no ejecuta ninguna herramienta.
3. El cuerpo del while se ejecutó **2 veces**: la 1.ª respuesta es `tool_use`, así que entramos a la primera pasada; la 2.ª respuesta sigue siendo `tool_use`, así que entramos a la segunda pasada; la 3.ª respuesta es `end_turn`, la condición del while es falsa, y no entramos de nuevo.
4. El bucle sale al leer **`end_turn`**: en concreto, el `callModel` al final de la segunda pasada regresó `end_turn`, así que cuando el control volvió a la prueba del while la condición era falsa y salimos.

<!-- hint -->
Marca ambas llamadas a `callModel` en el código esqueleto: una antes del while, una en la última línea del cuerpo. Cada vez que el cuerpo se ejecuta, la segunda se llama una vez.

<!-- hint -->
En el turno donde `stop_reason` es `end_turn`, la respuesta del modelo no tiene bloque `tool_use`. Así que «cuántas veces se ejecutó `executeTool`» y «si entramos al cuerpo» son dos cosas separadas que contar.

### Nivel 2: Por qué este bucle nunca se para

Un colega intentó convertir una sola ida y vuelta en un bucle multiturno y escribió el código de abajo. «Parece funcionar» en tareas que solo necesitan una llamada a herramienta, pero en cuanto una tarea necesita que el modelo llame a herramientas dos veces seguidas, el proceso se cuelga, se comen los recursos, y los logs muestran la misma herramienta llamada una y otra vez. Encuentra la causa raíz y arréglala.

```javascript
async function runAgent(userInput, tools) {
  const messages = [{ role: "user", content: userInput }];
  let response = await callModel({ tools, messages });

  while (response.stop_reason === "tool_use") {
    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    // fin del cuerpo del bucle
  }

  return response;
}
```

<!-- rubric -->
- Nombra la causa raíz con precisión: el cuerpo nunca reasigna `response`, así que `response.stop_reason` se queda en el `tool_use` del primer turno para siempre y la condición del while es permanentemente verdadera
- Explica por qué esto aparece como «bien en una ida y vuelta, se cuelga en tareas multiturno»: una vez que una respuesta de veras entra al cuerpo es un bucle infinito sin salida; la razón por la que a veces «parece funcionar» es que la respuesta no era `tool_use` en absoluto y nunca entró al bucle, no que «se paró normalmente tras el primer tool_use»
- El arreglo añade `response = await callModel({ tools, messages })` al final del cuerpo

<!-- answer -->
Causa raíz: **el final del cuerpo del bucle nunca reasigna `response`.** `response` se asigna exactamente una vez, fuera del bucle; el cuerpo solo anexa mensajes a `messages` y nunca envía una nueva solicitud ni actualiza `response`. Así que `response.stop_reason` se queda en ese primer `"tool_use"` para siempre, la condición del while es permanentemente verdadera, y el bucle nunca puede salir: `messages` crece sin límite, el mismo bloque `tool_use` se ejecuta una y otra vez, y el proceso se cuelga.

En cuanto a «bien en una ida y vuelta»: es una ilusión. Incluso cuando una tarea necesita solo una llamada a herramienta, este código no saldrá una vez que entre al cuerpo. Cuando alguien cree que funciona, suele ser porque lo ejecutó en otro lado, o la respuesta resultó no ser `tool_use` y nunca entró al bucle en absoluto. Una vez que estás de veras en el cuerpo, es un bucle infinito.

El arreglo — añade la línea de nueva solicitud al final del cuerpo:

```javascript
  while (response.stop_reason === "tool_use") {
    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });

    response = await callModel({ tools, messages }); // agrega esta linea para que el bucle pueda leer un stop_reason nuevo
  }
```

<!-- hint -->
La condición del while lee `response.stop_reason`. Busca en todo el cuerpo la variable `response` y comprueba si alguna vez se reasigna en alguna pasada.

<!-- hint -->
Un bucle solo puede pararse porque cada turno produce un `stop_reason` fresco para probar de nuevo. Si el `response` que sostienes al final de una pasada sigue siendo el de la pasada anterior, la condición del while computa la misma respuesta para siempre.

<!-- /exercises -->

## Resumen

- Conectar una ida y vuelta de llamada a herramienta en un bucle no necesita ningún mecanismo nuevo, solo cuatro pasos repetidos: envía la solicitud → lee `stop_reason` y los bloques `tool_use` → ejecuta las herramientas y empaca los bloques `tool_result` → anexa al historial y envía de nuevo; repite mientras `stop_reason` siga siendo `tool_use`[^S2]
- `stop_reason` es la condición del while de este bucle: `tool_use` significa que el modelo todavía quiere una herramienta y el bucle continúa, `end_turn` significa que el modelo está cerrando y el bucle termina por sí solo; el eje modelo→herramientas→modelo lo impulsa ese campo[^S5]
- `tool_use` es la señal de que el modelo quiere una herramienta, no un recibo que diga que una se ejecutó; el modelo nunca ejecuta nada por sí mismo, y la acción pasa donde el anfitrión lee el `name` y el `input` y se pone a trabajar[^S2]
- Cada turno del bucle alarga el historial y nunca lo acorta, ya que un agente en un bucle sigue generando más datos que podrían ser relevantes[^S3]; y con un presupuesto de atención finito, el recuerdo se degrada conforme el contexto crece, así que los tokens tienen que tratarse como un recurso finito con rendimientos marginales decrecientes[^S3]
- Un bucle solo no basta: la autonomía trae costos más altos y errores que se componen, y el modelo puede operar durante muchos turnos[^S1], así que sobre el propio `end_turn` del modelo por lo general añades condiciones de parada explícitas (un número máximo de iteraciones, digamos) para mantener el control de tu lado[^S1]; cómo fijarlas es el tema de la Lección 3

[>> Lección 3: Condiciones de parada: cuándo debería rendirse un agente](./03-stop-conditions.md)
