# Lección 3: Condiciones de parada: cuándo debería rendirse un agente

> Objetivos de aprendizaje:
> - Explicar por qué dejar que el modelo regrese `end_turn` por su cuenta no basta para terminar un bucle, y enunciar la tensión sin rodeos: tienes que confiar en el modelo, y sin embargo puede seguir girando durante muchos turnos
> - Añadir una compuerta dura de turnos máximos a un bucle esqueleto, y explicar por qué el contador solo funciona si vive fuera del bucle
> - Distinguir una parada dura (alto forzado en el techo) de una parada suave / suspensión (pausa para una persona, reanudable), y listar las condiciones bajo las cuales un agente dado debe parar
>
> Requisitos: Leíste la Lección 2, puedes escribir un bucle `while` impulsado por `stop_reason`, y sabes que el bucle termina por sí solo cuando regresa `end_turn` | Anterior: [Lección 2 <<](./02-the-core-loop.md) | Siguiente: [Lección 4 >>](./04-loop-failure-modes.md)

## No cuentes con que el modelo lo dé por terminado

El bucle esqueleto de la Lección 2 se para por exactamente una razón: en alguna ronda el modelo deja de pedir herramientas, `stop_reason` pasa de `tool_use` a `end_turn`, la condición del `while` se vuelve falsa, y el bucle termina por sí solo.[^S2] Dicho de otro modo, la decisión de si dar otra vuelta se le ha entregado por entero al modelo: el bucle se para cuando el modelo dice que ya terminó de hablar.

La mayoría de las veces eso funciona, pero ten claro quién toma la decisión. Un agente es, por definición, un sistema donde el modelo dirige dinámicamente su propio proceso y su propio uso de herramientas,[^S1] y decidir cuándo rendirse es parte de eso. La autonomía es exactamente lo que hace útil a un agente, pero la otra cara de esa misma moneda es que "The autonomous nature of agents means higher costs, and the potential for compounding errors."[^S1] (La naturaleza autónoma de los agentes implica costos más altos y el potencial de errores que se componen.) Y la oración que más importa aquí: "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S1] (El LLM potencialmente operará durante muchos turnos, y debes tener cierto nivel de confianza en su toma de decisiones.)

La palabra con la que hay que quedarse es *confianza*. Confianza no es lo mismo que dejar al modelo sin supervisión. Si el modelo se atasca en algún paso, o se desvía por algo que una herramienta le devolvió, y simplemente nunca regresa `end_turn`, un bucle que solo vigila `stop_reason` no se impacientará por ti. Le hará compañía al modelo, ronda tras ronda, girando, porque nada en la condición del `while` que escribiste dice «ya bastó de vueltas». Así que la autoterminación por parte del modelo no basta por sí sola. Necesitas condiciones de parada que el anfitrión decida, unas que no esperen al humor del modelo.

## Primero, una compuerta dura sobre el bucle: turnos máximos

La condición de parada más básica de todas está nombrada justo en la guía de ingeniería de Anthropic: "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."[^S1] (también es común incluir condiciones de parada —como un número máximo de iteraciones— para mantener el control.) Traducido a código, eso es un techo sobre cuántas veces se le permite al bucle dar la vuelta.

Sobre el esqueleto de la Lección 2, el cambio es pequeño:

```javascript
// tools es el manifiesto de definiciones de herramientas que envias en cada ronda
const MAX_TURNS = 10;              // la compuerta dura: deja que el bucle de la vuelta 10 veces como maximo
const messages = [{ role: "user", content: userInput }];
let turns = 0;                     // el contador vive fuera del bucle para poder acumular a lo largo de las rondas

let response = await callModel({ tools, messages });

while (response.stop_reason === "tool_use") {
  // revisa la compuerta antes de que empiece esta ronda: en el tope, parada dura y no envies mas solicitudes
  if (turns >= MAX_TURNS) {
    return { stopped: "max_turns", turns, last: response };
  }
  turns += 1;

  messages.push({ role: "assistant", content: response.content });

  const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
  const toolResults = await Promise.all(
    toolUseBlocks.map(async (block) => ({
      type: "tool_result",
      tool_use_id: block.id,
      content: await executeTool(block.name, block.input),
    }))
  );
  messages.push({ role: "user", content: toolResults });

  response = await callModel({ tools, messages });
}

// dos salidas del bucle: el return temprano de arriba, o stop_reason dejando de ser tool_use
return { stopped: "end_turn", turns, last: response };
```

Dos cosas llevan el peso aquí. Primero, `let turns = 0` se declara **fuera** del bucle. Tiene que seguir viva a lo largo de las rondas y sumar cada una, o la compuerta no tiene idea de cuántas vueltas han pasado; muévela al cuerpo del bucle y obtienes exactamente la trampa que el ejercicio de Nivel 2 desarma. Segundo, a la compuerta no le importa **por qué** el modelo sigue pidiendo herramientas: atascado, dando vueltas en círculo, desviado por la salida de una herramienta, nunca lo pregunta. Una vez que la cuenta de vueltas toca el techo, el anfitrión se para, no envía más solicitudes, y recupera el control para su propio lado.

Eso es una **parada dura**: en la frontera se detiene sin condiciones y el bucle se acabó. Es algo distinto del final suave de `end_turn`, donde el modelo decide que ya terminó: una es un techo que tú fijas, la otra es el propio juicio del modelo. Fíjate que no hay una respuesta estándar para qué tan grande debería ser `MAX_TURNS`; depende de más o menos cuántas rondas la tarea debería necesitar. El 10 de aquí es un valor de relleno. Lo que importa es que la compuerta exista y de veras pueda parar un bucle que se ha desbocado.

```agentmentor-check
{
  "id": "harness-zh-03-self-stop-insufficient",
  "label": "Juzgar si la autoterminación del modelo por sí sola basta, sin otra condición de parada",
  "prompt": "Estás diseñando un agente de operaciones que llamará herramientas ronda tras ronda. Un colega argumenta: los modelos ya son lo bastante listos como para regresar end_turn por su cuenta una vez que la tarea está hecha, así que el bucle no necesita ninguna condición de parada externa; deja la decisión de rendirse al modelo. ¿Deberías seguirle la corriente?",
  "whyHere": "Esta sección acaba de argumentar que end_turn por sí solo no basta, y le atornilló al bucle una compuerta dura de turnos máximos. La comprobación existe para frenar la creencia de que un modelo es lo bastante listo como para pararse en el momento justo por sí mismo y por lo tanto no necesita condición de parada externa, porque esa creencia es precisamente cómo la decisión de rendirse se le entrega por mayoreo al modelo y el bucle se desboca.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sí. El modelo puede juzgar por sí mismo si la tarea está terminada y regresará end_turn cuando lo esté, así que una condición de parada extra es sobreingeniería.",
      "correct": false,
      "feedback": "Esto confunde la confianza con carta blanca. El modelo sí dirige su propio proceso, pero también puede atascarse en algún paso, o desviarse por lo que una herramienta devolvió, y nunca volver con end_turn, ejecutándose durante muchos turnos mientras un bucle que solo vigila stop_reason le hace compañía y gira. Justo por eso añadir una condición de parada explícita (un número máximo de iteraciones, digamos) para mantener el control es una práctica común, en vez de dejarle la frontera por entero al modelo."
    },
    {
      "id": "b",
      "text": "No. Más allá del propio end_turn del modelo, necesitas una condición de parada explícita que el anfitrión decida; un tope de turnos, por ejemplo.",
      "correct": true,
      "feedback": "Correcto. end_turn es el propio juicio del modelo, y la autonomía en sí trae costos más altos y errores que se componen. Sí tienes que depositar cierto nivel de confianza en su toma de decisiones para dejarlo ejecutarse siquiera, pero la confianza no es la ausencia de una frontera; una compuerta dura de turnos máximos recupera el control del modelo hacia el anfitrión cuando el modelo no se rinde por su cuenta."
    }
  ]
}
```

## Más allá de la parada dura, otra clase: pararse a esperar a una persona

Compuertas como los turnos máximos comparten una propiedad: topar con una es el fin del camino —el bucle se acabó y no continuará por sí solo. Pero esa no es la única clase de condición de parada. El mismo artículo nombra otra: "Agents can then pause for human feedback at checkpoints or when encountering blockers."[^S1] (Los agentes pueden entonces pausar para recibir retroalimentación humana en puntos de control o al encontrar obstáculos.) Ese es un animal distinto de una parada dura, y vale la pena desglosarlo:

- **Parada dura**: en el techo se detiene, el bucle queda terminado para siempre, nada continúa automáticamente. Los turnos máximos y el presupuesto agotado pertenecen ambos aquí. Es un **estado terminal**.
- **Parada suave / suspensión**: el bucle se detiene deliberadamente en un punto de control, entrega el control a una persona, y puede retomar desde ese punto exacto una vez que ella haya respondido. No es un final; es una **pausa reanudable**.

En código la diferencia aterriza en lo que regresas. Una parada dura regresa un resultado final: aquí es donde terminó. Una parada suave tiene que preservar el estado: regresa una instantánea de la escena desde la que se puede reanudar, entregando los `messages` actuales junto con la acción pendiente en la que se estancó, de modo que una vez que una persona la haya atendido, esa instantánea baste para seguir:

```javascript
while (response.stop_reason === "tool_use") {
  if (turns >= MAX_TURNS) {
    return { stopped: "max_turns", turns, last: response };   // parada dura: terminal
  }

  const block = response.content.find((b) => b.type === "tool_use");
  if (needsHumanApproval(block)) {
    // parada suave / suspension: no es un final, una pausa. Entrega toda la escena para que pueda reanudar aqui
    return { paused: "awaiting_human", pending: block, messages, turns };
  }

  // ...de lo contrario ejecuta la herramienta, anexa al historial, y envía la siguiente solicitud como de costumbre
}
```

El caso clásico de parada suave es que el siguiente paso del modelo sea algo irreversible —dejar caer una base de datos, disparar un correo, enviar un pedido— y quieres que una persona mire antes de que pase; o que el modelo reporte por su cuenta que está atascado y necesita más información. Trazar la línea entre parada dura y parada suave basta por ahora. Cómo decide de veras `needsHumanApproval`, y cómo el bucle reanuda desde esa instantánea una vez que una persona responde, es el tema principal de la Lección 5 sobre mantener a una persona en el bucle.

## Un marco: empieza preguntando «¿bajo qué condiciones debe parar?»

Con las paradas duras y las paradas suaves en mano, diseñar un agente gana una jugada de apertura útil. Antes de escribir cualquier bucle, deja respondida una pregunta: **¿bajo qué condiciones debe parar esta cosa?** Lista las respuestas y por lo general se reducen a estas cuatro:

1. **La tarea está hecha** — el modelo regresa `end_turn`. Esta es la más suave de las cuatro, juzgada por el modelo, y aun así tienes que confirmar que de veras terminó en vez de haberse rendido a medias.
2. **El techo de turnos** — una parada dura. Esa es la compuerta `MAX_TURNS` de arriba, atrapando el peor caso donde el bucle arranca y no puede refrenarse.
3. **Un obstáculo que necesita una decisión humana** — una parada suave / suspensión, pausando para recibir retroalimentación humana.[^S1] Disparada por operaciones irreversibles, o por el modelo reportando explícitamente que está bloqueado.
4. **Presupuesto agotado** — una parada dura. Tokens, gasto o tiempo transcurrido: el que primero toque su techo para el bucle. Los detalles (cómo contar, dónde instrumentar) esperan a la Lección 4.

Alinea esas cuatro y algo se vuelve visible: la decisión de parar no se asienta toda en el modelo. La número 1 pertenece al modelo, las números 2 y 4 pertenecen al anfitrión (paran en la marca sin importar lo que el modelo piense), y la número 3 es compartida. Ese bucle esqueleto de la Lección 2 implementaba solo la número 1 y dejaba caer las otras tres; esta lección añade la número 2, la compuerta dura más básica, mientras que las números 3 y 4 llegan en la Lección 5 y la Lección 4 respectivamente.

El valor del marco no es memorizar cuatro elementos. Es construir un hábito: antes de escribir el bucle, cuenta las condiciones de «debe parar» explícitamente, en vez de dejarlas enterradas bajo la suposición por defecto de que el modelo va a parar de todos modos.

## Las condiciones de parada son un seguro barato, no sobreingeniería

Alguien puede refunfuñar que estas compuertas convierten un bucle simple en uno complicado. Lo cual saca a relucir un principio al que Anthropic vuelve una y otra vez: "you should consider adding complexity only when it demonstrably improves outcomes."[^S1] (habría que considerar añadir complejidad solo cuando mejora los resultados de forma demostrable.) Esa línea suele citarse para disuadir a la gente de amontonar maquinaria elaborada, pero para las condiciones de parada apunta al otro lado: las deja pasar.

Haz la aritmética y es obvio. Un contador de turnos máximos es una declaración fuera del bucle y una comparación dentro de él, unas pocas líneas de código. Lo que frena —un bucle que no para de girar, costos que trepan fuera de control, una acción irreversible tomada sobre una salida manipulada o malformada— cuesta muchísimo más. La autonomía del agente ya carga costos más altos y el potencial de errores que se componen,[^S1] y una condición de parada es el freno más barato apuntado de lleno a ese riesgo.

Así que una condición de parada no es la clase de complejidad que habría que añadir solo cuando mejora los resultados de forma demostrable[^S1]; supera esa vara de sobra. Comprime la frontera del peor caso de «sin límite» a «con límite», lo cual es en sí una mejora verificable en los resultados. Es el control más básico que hace de un bucle autónomo algo que te atreves a dejar en marcha, no un extra decorativo.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Cuenta las condiciones de parada de un agente

Estás diseñando un agente de «arregla CI automáticamente». Recoge un pipeline que falla y tiene estas herramientas: `read_logs` (leer los logs), `edit_file` (cambiar código), `run_tests` (ejecutar las pruebas) y `push` (empujar al remoto, disparando una corrida fresca de CI). La meta es dejar las pruebas en verde. Responde esto para él:

1. Lista al menos cuatro condiciones bajo las cuales este agente debe parar.
2. Para cada una, márcala como una **parada dura** o una **parada suave / suspensión**, y di si la decisión de parar pertenece al modelo, al anfitrión, o a ambos.
3. ¿Diseñarías `push` (que empuja al remoto y dispara una corrida de CI que otras personas pueden ver) como una parada suave a la espera de que una persona apruebe? Da una línea de razonamiento.

<!-- rubric -->
- Al menos cuatro condiciones de parada dadas, cubriendo la mayoría de las cuatro categorías: tarea hecha / techo de turnos / obstáculo que necesita una decisión humana / presupuesto agotado
- Cada condición clasificada correctamente como dura o suave, con una decisión razonable sobre quién decide (tarea hecha → el modelo, turnos y presupuesto → el anfitrión, tipo obstáculo → compartida)
- Una postura clara sobre `push` con una razón: la reconoce como una acción visible por fuera y relativamente costosa, bien adecuada a una parada suave a la espera de aprobación

<!-- answer -->
1. Cuatro (o más) condiciones de parada:
   - **Las pruebas están en verde / la tarea está hecha** — el modelo juzga que quedó arreglado y regresa `end_turn`.
   - **El techo de turnos** — por ejemplo, varias rondas de «editar código → ejecutar pruebas» sin llegar al verde, topando con `MAX_TURNS` y siendo forzado a parar.
   - **Justo antes de empujar al remoto (`push`)** — detente y espera aprobación, porque este paso es visible por fuera y dispara una corrida de CI que otras personas pueden ver.
   - **Presupuesto agotado** — los tokens / gasto / tiempo transcurrido acumulados tocan un techo y se para (detalles en la Lección 4).
   - (Opcional) **El modelo reporta un obstáculo** — por ejemplo decide que necesita un permiso o una credencial que no puede conseguir, y se suspende para una persona.
2. Clasificación y quién decide:
   - Tarea hecha: **final suave**, decidido por el **modelo** (regresa `end_turn`).
   - Techo de turnos: **parada dura**, decidido por el **anfitrión** (para en la marca, sin importar lo que el modelo quiera).
   - Presupuesto agotado: **parada dura**, decidido por el **anfitrión**.
   - Aprobación antes de `push`, y el modelo reportando un obstáculo: **parada suave / suspensión**, **compartida** (el anfitrión fija el punto de control, una persona decide si continuar).
3. Sí. `push` envía cambios al remoto y arranca una corrida de CI que otras personas pueden ver —una acción visible por fuera que cuesta algo revertir, lo cual encaja con una parada suave: el bucle se detiene antes del push, una persona mira los cambios y decide si dejarlos pasar, en vez de dejar que el modelo empuje hasta afuera por su cuenta.

<!-- hint -->
Vuelve a las cuatro del texto principal: tarea hecha, techo de turnos, obstáculo que necesita una decisión humana, presupuesto agotado. Aplica cada una a este escenario de arreglar CI y mira a qué paso concreto se mapea.

<!-- hint -->
Para distinguir una parada dura de una suave, hazte una sola pregunta: después de que para, ¿puede retomar desde donde se quedó? Si no puede y eso es el final, es una parada dura. Si puede reanudar una vez que una persona responde, es una parada suave.

### Nivel 2: Por qué esta compuerta de turnos máximos no atrapó nada

Un colega quería una salvaguarda de turnos máximos sobre el bucle y escribió la versión de abajo. La probó en tareas que necesitaban una o dos llamadas a herramienta y «se veía bien». Pero en cuanto el modelo cayó en llamar a la misma herramienta una y otra vez sin regresar `end_turn`, esta compuerta no atrapó nada en absoluto y el bucle siguió desbocado. Encuentra la causa raíz y arréglala.

```javascript
async function runAgent(userInput, tools) {
  const MAX_TURNS = 10;
  const messages = [{ role: "user", content: userInput }];
  let response = await callModel({ tools, messages });

  while (response.stop_reason === "tool_use") {
    let turns = 0;                       // pretende atrapar un bucle desbocado
    if (turns >= MAX_TURNS) {
      return { stopped: "max_turns", response };
    }
    turns += 1;

    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });

    response = await callModel({ tools, messages });
  }
  return response;
}
```

<!-- rubric -->
- Nombra la causa raíz exacta: `let turns = 0` se declara dentro del cuerpo del bucle, se reinicia a 0 en cada ronda, `turns >= MAX_TURNS` nunca es verdadero, y la compuerta es código muerto
- Explica en qué difiere esto del bucle infinito de la Lección 2: aquí `response` sí se reasigna y el bucle todavía puede pararse con el propio `end_turn` del modelo, que es por lo que «las tareas cortas se ven bien»; pero el respaldo de turnos máximos que debería haber atrapado el desbocamiento nunca se activó
- Da el arreglo: mueve `let turns = 0;` arriba del `while` (el estado del contador tiene que acumular a lo largo de las rondas), manteniendo `turns += 1` dentro del cuerpo del bucle

<!-- answer -->
Causa raíz: **el contador `turns` se declara dentro del cuerpo del bucle.** `let turns = 0` se ejecuta de nuevo al comienzo de cada ronda, así que `turns` se reinicia a 0 cada vuelta; `turns += 1` lo sube a 1, la siguiente ronda lo devuelve a 0, y la prueba `turns >= MAX_TURNS` (10) nunca puede salir verdadera. La compuerta es código muerto de principio a fin —una condición de parada funciona porque su estado acumula a lo largo de las rondas, y el alcance de una declaración `let` termina en ese par de llaves, así que no puede transferirse.

Por qué «las tareas cortas se ven bien»: este código no es lo mismo que el bucle infinito de la Lección 2. El error de allá era olvidar reasignar `response`, así que el bucle nunca podía salir en absoluto. Aquí `response` sí se reasigna, y el bucle puede pararse normalmente cuando el modelo regresa `end_turn` en alguna ronda. Así que mientras el modelo se porte bien y se rinda dentro de una ronda o dos, nunca notas que la compuerta está inerte —simplemente nunca se la llamó a la acción. Pero en cuanto el modelo se niega a regresar `end_turn` y empieza a girar, la salvaguarda que creías tener resulta no haber estado cableada nunca, y el bucle se desboca igual.

El arreglo — mueve el contador fuera del bucle para que acumule a lo largo de las rondas:

```javascript
async function runAgent(userInput, tools) {
  const MAX_TURNS = 10;
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;                         // movido afuera: el estado tiene que vivir a lo largo de las rondas para parar algo
  let response = await callModel({ tools, messages });

  while (response.stop_reason === "tool_use") {
    if (turns >= MAX_TURNS) {
      return { stopped: "max_turns", response };
    }
    turns += 1;

    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });

    response = await callModel({ tools, messages });
  }
  return response;
}
```

<!-- hint -->
Una condición de parada solo puede refrenar un bucle si su estado acumula a lo largo de las rondas. Mira qué línea declara `turns`: al comienzo de la segunda ronda, ¿todavía recuerda lo que la primera ronda sumó?

<!-- hint -->
Una variable declarada con `let` tiene su alcance acotado al par de llaves en el que se asienta. Ahora mismo `turns` vive dentro del cuerpo del `while`, así que cada ronda ejecuta un flamante `let turns = 0`.

<!-- /exercises -->

## Resumen

- El bucle termina naturalmente con `end_turn`, pero ese es el propio juicio del modelo; solo puedes depositar cierto nivel de confianza en su toma de decisiones, y puede operar durante muchos turnos, así que fiarse solo de la autoterminación del modelo no basta[^S1]
- La compuerta dura más básica es un tope de turnos: incluir una condición de parada explícita como un número máximo de iteraciones para mantener el control es una práctica común[^S1]; el contador tiene que asentarse **fuera** del bucle para acumular a lo largo de las rondas, y moverlo al cuerpo lo convierte en código muerto que no para nada
- Más allá de las paradas duras hay paradas suaves / suspensiones: pausar para recibir retroalimentación humana en puntos de control o al encontrar obstáculos[^S1] —no un estado terminal sino una pausa reanudable que retoma desde una instantánea de la escena
- Al diseñar un agente, pregunta primero bajo qué condiciones debe parar: tarea hecha (`end_turn`, decisión del modelo), techo de turnos (parada dura, decisión del anfitrión), un obstáculo que necesita una decisión humana (parada suave, compartida), presupuesto agotado (parada dura, cubierto en la Lección 4)
- Las condiciones de parada son un control barato con un gran rédito: la autonomía ya trae costos más altos y errores que se componen,[^S1] y una compuerta de turnos máximos atrapa exactamente el peor caso; frente al principio de añadir complejidad solo cuando mejora los resultados de forma demostrable,[^S1] supera la vara de sobra —comprimir lo sin límite en lo con límite es una mejora verificable

[>> Lección 4: Desbocamiento y repliegue: bucles muertos, giros en vacío, agotamiento del presupuesto](./04-loop-failure-modes.md)
