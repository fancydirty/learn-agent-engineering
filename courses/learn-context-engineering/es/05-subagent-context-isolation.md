# Lección 5: Subagentes y aislamiento de contexto

> Objetivos de aprendizaje:
> - Explicar por qué un subagente cuenta como movimiento de gestión de contexto: una ventana limpia más un resumen de vuelta, dejando el «proceso» fuera de la ventana principal
> - Usar la proporción entre tokens de proceso y tokens de conclusión, junto con datos reales de costo, para juzgar si vale la pena entregarle una tarea a un subagente
> - Cablear el despacho de subagentes en el bucle del arnés que escribiste en el curso 7 de esta serie, de modo que cada despacho devuelva exactamente un resumen a la ventana principal
>
> Requisitos: Terminaste la Lección 4 sobre compactación y notas, y sabes ejecutar el bucle del arnés que escribiste en el curso 7 de esta serie, «Fundamentos del arnés de agente: bucles y control» | Anterior: [Lección 4 <<](./04-compaction-and-notes.md) | Siguiente: [Lección 6 >>](./06-build-context-management.md)

## Un cambio de perspectiva: no es división del trabajo, es solo aislamiento

Ya te encontraste con los subagentes en el curso 6 de esta serie, «Colaboración multiagente»: cómo repartir una tarea, cómo reportar resultados, cómo se coordinan varios agentes. Ese curso respondía a la pregunta de cómo trabajan juntos varios agentes. Esta lección responde a otra distinta: **¿qué hace que un subagente sea, en primer lugar, una técnica de gestión de contexto?**

Dicho de otro modo: aunque tengas un solo agente principal y no necesites ninguna coordinación de equipo, igual vas a querer echar mano de un subagente — no por la división del trabajo, sino por el aislamiento.

Recuerda la óptica del presupuesto de la Lección 1. Cuando un modelo analiza contexto, echa mano de un presupuesto de atención, y cada nuevo token que entra al contexto agota un poco ese presupuesto[^S1]. Amontona más tokens y la capacidad del modelo de recordar con precisión información de ese contexto decae[^S1]. Un agente es justamente el escenario más propenso a amontonar tokens: cada turno del bucle produce datos nuevos que podrían ser relevantes para el siguiente turno de inferencia — difíciles de tirar, difíciles de guardar[^S1].

Las tareas de exploración son la versión más filosa de esto. Digamos que el agente principal tiene que rastrear todos los puntos de llamada de una API obsoleta en un repositorio de unos cientos de miles de líneas: una docena de greps, veinte archivos abiertos, unos miles de líneas leídas. Ese contenido intermedio llega a decenas de miles de tokens, mientras que la conclusión que vale la pena conservar podría ser de cinco líneas: «los puntos de llamada se agrupan en estos tres módulos, y este es el orden de migración sugerido». Si todo eso ocurre en la ventana principal, el presupuesto de atención se lo come el proceso y queda poco para la conclusión y para el trabajo que sigue.

El subagente es el cuchillo apuntado exactamente a ese problema.

## La mecánica: ventana limpia adentro, resumen comprimido afuera

La mecánica cabe en una frase: un subagente especializado maneja una tarea acotada en una **ventana de contexto limpia**[^S1]; el gran volumen de contenido intermedio que genera la exploración — resultados de búsqueda, contenidos crudos de archivos, callejones sin salida — **se queda todo dentro del subagente**[^S1]; y lo que vuelve al agente principal es solo un resumen condensado y destilado de su trabajo, a menudo de 1000 a 2000 tokens[^S1].

La ventana del agente principal, por lo tanto, carga solo la conclusión, nunca el proceso. Es un diseño asimétrico: el subagente puede quemar decenas de miles de tokens explorando, pero de él solo sale un pasaje corto de texto.

En código, esto es apenas una apertura nueva para el arnés que escribiste en el curso 7. Para mantenerlo compacto, dos acciones que se repetían a lo largo del bucle de aquel curso vienen envueltas aquí como funciones auxiliares: `textOf` extrae el bloque de texto de una respuesta, y `appendToolResults` ejecuta las herramientas de este turno y anexa los bloques `tool_result` al arreglo de mensajes (por dentro hace exactamente lo que escribiste a mano en ese curso: ejecutar cada `tool_use`, juntar los resultados, devolverlos).

```javascript
const SUBAGENT_SYSTEM = `Eres un subagente de investigación.
Cuando la tarea esté lista, entrega una conclusión de como máximo 1500 tokens:
hallazgos clave, las rutas de archivo involucradas y acciones recomendadas para el agente principal.
No repitas el texto crudo que leíste.`;

async function runSubagent(client, task, maxTurns = 15) {
  // Todo el truco es esta línea: un arreglo de mensajes totalmente nuevo, nada del historial del agente principal
  let messages = [{ role: "user", content: task }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SUBAGENT_SYSTEM, // el prompt del sistema propio del subagente
      tools: SEARCH_TOOLS,     // solo las herramientas que la exploración necesita
      messages,
    });
    if (response.stop_reason === "end_turn") {
      return textOf(response); // solo este texto sale del subagente
    }
    // ejecuta las herramientas, anexa los resultados a messages, todo eso se queda dentro del subagente
    messages = await appendToolResults(messages, response);
  }
  return "La investigación no terminó dentro del presupuesto de turnos";
}
```

Fíjate en tres detalles. Primero, `messages` arranca desde una única descripción de tarea solitaria, sin cargar ni una palabra del historial del agente principal: ese es el significado entero de «ventana limpia». Segundo, la función devuelve `textOf(response)`, una cadena simple; las decenas de idas y vueltas de herramientas que se apilaron dentro del bucle se desvanecen junto con la variable local `messages`. Tercero, el prompt del sistema del subagente exige explícitamente «no repitas el texto crudo»: la calidad de compresión del resumen se fija justo ahí.

Del lado del agente principal, la acción de despacho es apenas una herramienta común que se enchufa al bucle de stop_reason que ya tienes:

```javascript
const DISPATCH_TOOL = {
  name: "dispatch_research",
  description:
    "Entrega una tarea de investigación acotada a un subagente y devuelve su resumen de los hallazgos. " +
    "Úsala para tareas que necesitan exploración pesada pero cuya conclusión se puede enunciar brevemente.",
  input_schema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Una descripción de tarea autocontenida; el subagente no puede ver el historial de esta conversación",
      },
    },
    required: ["task"],
  },
};

async function handleDispatch(mainMessages, toolCall) {
  const summary = await runSubagent(client, toolCall.input.task);
  mainMessages.push({
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: toolCall.id,
      content: summary, // la ventana principal gana solo esta entrada
    }],
  });
}
```

Mira la `description` del campo `task`: «Una descripción de tarea autocontenida; el subagente no puede ver el historial de esta conversación». Esa línea está escrita para el agente principal — tiene que enunciar la tarea completa, porque del otro lado hay una ventana nueva y amnésica. Explicitar el propósito y los límites con esta precisión en la descripción de una herramienta es exactamente la idea de que «las herramientas son contexto» de la Lección 2: las herramientas deberían ser autocontenidas, robustas ante el error y sumamente claras respecto de su uso previsto[^S1].

```agentmentor-check
{
  "id": "ctx-zh-05-clean-window",
  "label": "Cuánto historial del agente principal debería recibir un subagente al arrancar",
  "prompt": "Estás escribiendo la lógica de despacho de un subagente de investigación y un colega sugiere: «Pásale al subagente el historial de mensajes completo del agente principal hasta ahora; así entenderá el panorama general y hará mejor el trabajo». Desde el punto de vista de la economía del contexto, ¿cómo evaluarías esto?",
  "whyHere": "La sección anterior acaba de plantear la mecánica de «ventana limpia adentro, resumen comprimido afuera», y «más contexto no puede hacer daño» es la intuición con más probabilidades de aparecer justo aquí. Esto comprueba en el momento si quien lee ve que el valor viene del aislamiento mismo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Lo tiene al revés: el valor vive en el aislamiento. Una ventana limpia gasta todo el presupuesto de atención en la tarea, y compartir el historial completo hace que ambas ventanas sostengan el mismo montón, con lo que el beneficio cae a cero.",
      "correct": true,
      "feedback": "La clave está en ver de dónde viene el beneficio: una ventana limpia mantiene el presupuesto de atención del subagente enteramente sobre la tarea, y el resumen de vuelta hace que la ventana principal cargue solo la conclusión. En cuanto ambas ventanas sostienen el mismo contenido, estás pagando dos facturas de tokens para mantener un solo contexto, y el aislamiento desapareció."
    },
    {
      "id": "b",
      "text": "El único problema es el costo de transferencia: el historial completo son demasiados tokens, así que comprímelo primero y pásalo después, y te quedas con lo mejor de ambos.",
      "correct": false,
      "feedback": "Eso solo ve la superficie. Incluso comprimido, el subagente arranca cargando historial que no tiene relación con su tarea acotada, así que su ventana no está limpia desde el primer turno y su atención queda dividida: la pérdida cae sobre la calidad de razonamiento del subagente, no sobre la factura de transferencia."
    },
    {
      "id": "c",
      "text": "La sugerencia está bien: más contexto significa que el modelo entiende más del conjunto, así que el resultado solo puede mejorar.",
      "correct": false,
      "feedback": "«Más contexto siempre es mejor» es justo la intuición que este curso viene desarmando desde la Lección 1: más tokens empeoran el recuerdo preciso del modelo desde el contexto, y el presupuesto de atención es un recurso finito. Darle a un subagente historial sin relación con su tarea gasta su presupuesto, no lo ayuda."
    }
  ]
}
```

## Datos de primera mano: los subagentes como filtros inteligentes

La mecánica está zanjada; ahora las mediciones. Anthropic publicó un informe sobre su sistema de investigación multiagente — la arquitectura detrás de la función Research de Claude — que es una pieza poco común de material de ingeniería de primera mano[^S3].

Tres de sus hallazgos tocan directamente esta lección:

- **Los subagentes facilitan la compresión al operar en paralelo con sus propias ventanas de contexto**[^S3]. Cada subagente explora en una ventana propia, sin apretujar a los demás.
- Llaman a los subagentes «filtros inteligentes»: condensan los tokens más importantes para el agente de investigación líder[^S3]. La palabra «filtro» es acertada: entra el corpus, sale lo esencial.
- Una línea que vale la pena masticar: "The essence of search is compression: distilling insights from a vast corpus."[^S3] (la esencia de la búsqueda es la compresión: destilar hallazgos de un corpus enorme). Leída en el contexto de esta lección: cada exploración que ejecuta un subagente existe para producir ese destilado de mil tokens.

Como apunte al margen, el paralelismo también compra velocidad — varias líneas de investigación avanzando a la vez. Pero eso es tema de orquestación, ya cubierto en el curso 6 de esta serie; esta lección mantiene la mirada solo en el lado de la compresión.

## La otra cara del libro contable: el aislamiento no ahorra costos

Con la ventaja expuesta, hay que exponer también la factura. El mismo informe da los números medidos — ojo, son mediciones del sistema de investigación de Anthropic, no leyes universales:

- Los agentes suelen usar unas 4× más tokens que las interacciones de chat[^S3];
- Los sistemas multiagente usan unas 15× más tokens que los chats[^S3];
- Cuando analizaron de dónde venía el rendimiento, el uso de tokens por sí solo explicaba el 80 % de la varianza, y la cantidad de llamadas a herramientas y la elección del modelo daban cuenta de la mayor parte del resto[^S3].

Su propia conclusión es franca: "Multi-agent systems work mainly because they help spend enough tokens to solve the problem."[^S3] (los sistemas multiagente funcionan sobre todo porque ayudan a gastar suficientes tokens para resolver el problema).

Así que digámoslo sin rodeos: **un subagente no ahorra costos.** Los tokens totales solo suben — hay que reenunciar la tarea, volver a tender el trasfondo, varias ventanas quemando a la vez. Lo que compra es otra cosa: cada ventana se mantiene en un rango que no se ha degradado, así que la densidad de atención se sostiene alta de punta a punta. Es una disyuntiva de atención: gastar más tokens en total a cambio de una ventana limpia para cada agente.

¿Cuándo vale la pena aceptar esa disyuntiva? De vuelta a la óptica del presupuesto de la Lección 1: el contexto es un recurso finito con rendimientos marginales decrecientes[^S1]. Dos preguntas para juzgarlo:

1. **Proporción entre proceso y conclusión.** ¿Qué tan grande es el contenido intermedio de esta tarea y qué tan pequeña su conclusión final? Cuanto más despareja la proporción, mayor el rédito del aislamiento. A la inversa, una tarea cuyo proceso ya es corto de entrada es puro sobrecosto de traspaso si la despachas.
2. **Si la complejidad mejora el resultado de forma demostrable.** La guía de Anthropic es considerar agregar complejidad solo cuando mejora los resultados de forma demostrable — la palabra del original es «considerar», una cuestión de proporción, no una regla de hierro[^S2]. Si los tokens extra no compran una mejor salida, vuelve a una sola ventana.

## El combo de tarea larga: notas como base, traspasos para la resistencia

Por muy limpia que sea la ventana de un subagente, sigue siendo finita. Para tareas de horizonte genuinamente largo, el informe describe un combo: los agentes resumen las fases de trabajo completadas y guardan la información esencial en memoria externa[^S3]; después generan subagentes frescos con contextos limpios para continuar, manteniendo la continuidad mediante traspasos cuidadosos[^S3].

Eso enhebra la Lección 4 y esta en una sola secuencia de movimientos:

- Las notas estructuradas de la Lección 4 se ocupan de «poner el estado clave fuera de la ventana» — un NOTES.md, una lista de tareas — viven en el sistema de archivos y no ocupan la atención de ninguna ventana;
- El aislamiento de esta lección se ocupa de «mantener cada tramo de trabajo dentro de una ventana limpia» — lo primero que hace un subagente fresco es leer las notas; no necesita heredar el historial completo de su antecesor, solo lo esencial destilado de su antecesor.

¿Qué va en un documento de traspaso? Reutiliza el mismo criterio de disyuntiva de la compactación de la Lección 4: conservar decisiones arquitectónicas, bugs sin resolver y detalles de implementación, y descartar resultados de herramientas redundantes[^S1]. Escribir un traspaso y escribir un resumen de compactación son el mismo oficio; solo cambia quien lee, de «tu yo futuro» al «siguiente subagente».

## Cómo se ve esto en Claude Code

Por último, contrasta esto con una implementación que usas a diario. Las buenas prácticas oficiales de Claude Code lo dicen llanamente: la ventana de contexto se llena rápido y el rendimiento se degrada a medida que se llena; "The context window is the most important resource to manage."[^S4] (la ventana de contexto es el recurso más importante que hay que gestionar). Dado que el contexto es la restricción fundamental, los subagentes son una de las herramientas más potentes disponibles[^S4].

Su implementación coincide con la mecánica que describe esta lección: los subagentes se ejecutan en ventanas de contexto separadas y reportan resúmenes de vuelta[^S4]. Pídele a Claude Code que «encuentre la causa raíz de este bug» y el subagente al que despache hará greps, leerá archivos y seguirá la cadena de llamadas — toda esa exploración ocurriendo en la ventana propia del subagente, con la conversación principal recibiendo al final solo un resumen de la investigación. Acota bien el alcance de las investigaciones o entrégalas a subagentes, y la exploración no consumirá tu contexto principal[^S4].

Cuando ves una subtarea ejecutándose en segundo plano en la interfaz y la conversación principal gana solo un informe corto al terminar, eso es la «ventana limpia adentro, resumen comprimido afuera» que esta lección viene describiendo desde el principio.

A esta altura ya viste las tres piezas del juego de herramientas para tareas largas: la compactación (Lección 4), las notas estructuradas (Lección 4) y las arquitecturas multiagente (esta lección). Su objetivo compartido es que un agente pueda mantener coherencia, contexto y comportamiento dirigido a objetivos a lo largo de secuencias de acciones[^S1]. En la Lección 6 cableamos las tres en tu propio arnés.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Decidir el aislamiento para tres tareas

Tu agente principal toma tres tareas:

- **Tarea A**: En un repositorio de unos cientos de miles de líneas, encontrar todos los puntos de llamada que todavía usan la API obsoleta `LegacyLedgerReader` y sugerir un orden de migración.
- **Tarea B**: El agente principal acaba de leer una función de 80 líneas al contexto; el usuario señala un bug off-by-one (error por uno) y pide arreglarlo.
- **Tarea C**: Para una decisión de elección de biblioteca, investigar tres bibliotecas de parseo candidatas — leer la documentación de cada una, escarbar en su rastreador de issues y hacer una comparación lado a lado.

Para cada tarea, anota tu decisión — aislar (despachar un subagente) o no (hacerlo en la ventana principal) — señalando el paralelismo donde aplique, y da una o dos frases de razonamiento usando los criterios de esta lección.

<!-- rubric -->
- Los tres juicios giran sobre la proporción entre tokens de proceso y tokens de conclusión: cuanto más pesado el proceso y más pequeña la conclusión, más vale la pena aislar
- La Tarea B se juzga como no-aislar, con un razonamiento que incluye el lado del costo: la función ya está en la ventana principal, así que un subagente fresco tendría que retransferir la función y el trasfondo de la tarea, con lo que el sobrecosto del aislamiento supera al beneficio
- La Tarea C señala que las tres líneas de investigación no dependen entre sí, así que pueden ocupar ventanas separadas en paralelo, devolviendo cada una solo los puntos que la comparación necesita

<!-- answer -->
- **Tarea A: aislar.** El proceso significa una docena de greps y decenas de archivos leídos, con contenido intermedio que posiblemente llegue a decenas de miles de tokens; la conclusión es apenas una lista de puntos de llamada más un orden de migración, unos cientos de tokens como mucho. La proporción entre proceso y conclusión es muy despareja: el caso de manual de «el proceso se queda dentro del subagente, la conclusión vuelve a la ventana principal».
- **Tarea B: no aislar.** La función ya está en la ventana principal y el arreglo es un cambio de un solo paso con casi ningún proceso intermedio; un subagente fresco solo significaría retransferir la función cruda y el trasfondo de la tarea. El aislamiento tiene un costo propio, y una tarea cuyo beneficio es menor que ese sobrecosto no merece despacharse.
- **Tarea C: aislar, y ejecutar las tres en paralelo.** La investigación de las tres bibliotecas no tiene dependencias cruzadas, así que cada una toma una ventana separada avanzando al mismo tiempo, y cada una devuelve solo los puntos que la comparación necesita (estilo de interfaz, estado de mantenimiento, características de rendimiento). El agente principal hace luego su comparación lado a lado sobre tres resúmenes en vez de sobre tres juegos de documentación cruda.

<!-- hint -->
Estima primero qué tan grande es el «contenido intermedio» de cada tarea — cuántos archivos hay que leer, cuántas búsquedas hay que ejecutar — luego estima si la conclusión final cabe en unas pocas frases, y pon los dos números lado a lado.

<!-- hint -->
No olvides la sección de costo: el aislamiento mismo gasta tokens (la descripción de la tarea, el trasfondo reenunciado). ¿Hay alguna tarea cuyo contexto necesario ya esté sentado en la ventana principal?

### Nivel 2: Arreglar una función de despacho de «aislamiento falso»

Cableaste un subagente en el arnés del curso 7 de esta serie, con esta lógica de despacho:

```javascript
async function runSubagent(client, task, maxTurns = 15) {
  let messages = [{ role: "user", content: task }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SUBAGENT_SYSTEM,
      tools: SEARCH_TOOLS,
      messages,
    });
    if (response.stop_reason === "end_turn") {
      // agrega también la respuesta final, devuelve el historial completo
      return [
        ...messages,
        { role: "assistant", content: textOf(response) },
      ];
    }
    messages = await appendToolResults(messages, response);
  }
  return messages;
}

async function handleDispatch(mainMessages, toolCall) {
  const subHistory = await runSubagent(client, toolCall.input.task);
  mainMessages.push({
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: toolCall.id,
      // renderiza el historial entero a texto y lo mete de vuelta en la ventana principal
      content: renderAsText(subHistory),
    }],
  });
}
```

Síntoma: después de tres despachos de investigación, el uso de contexto del agente principal se acerca al límite de la ventana, y la lógica de compactación que instalaste en la Lección 4 se ve forzada a dispararse antes de tiempo. Inspecciona el arreglo de mensajes del agente principal y encontrarás que la gran mayoría de los tokens son los retornos originales de herramientas del subagente.

Señala la causa raíz y edita el código para que cada despacho agregue un solo mensaje de resumen a la ventana principal.

<!-- rubric -->
- Identifica la causa raíz en el valor de retorno de `runSubagent` y en la escritura de vuelta de `handleDispatch`: el historial de mensajes completo del subagente (con todos sus retornos de herramientas) se renderiza en bloque a texto y se mete en la ventana principal, con lo que el aislamiento queda en un cascarón hueco
- Después del arreglo, `runSubagent` devuelve solo el texto del resumen final, el `content` del `tool_result` es ese resumen, y cada despacho agrega un mensaje a la ventana principal
- Explica el vínculo con la Lección 4: la ventana principal deja de inundarse con el contenido de proceso del subagente, así que la lógica de compactación se dispara con menos frecuencia

<!-- answer -->
Causa raíz: `runSubagent` no devuelve la conclusión sino el **historial de mensajes completo** del subagente — `messages` se va rellenando turno tras turno vía `appendToolResults`, llenándose de resultados de búsqueda y contenidos crudos de archivos; luego `handleDispatch` renderiza esa pila entera a texto con `renderAsText` y la mete en la ventana principal. Cuanto más tiempo se ejecuta el subagente, más se inunda la ventana principal — el proceso entero refluye, y el aislamiento queda en un marco vacío. Ese es exactamente el síntoma: tres despachos llenan la ventana principal cerca de su límite, y el relleno son esos retornos crudos de herramientas.

Arreglo: que solo el resumen salga del subagente.

```javascript
async function runSubagent(client, task, maxTurns = 15) {
  let messages = [{ role: "user", content: task }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SUBAGENT_SYSTEM,
      tools: SEARCH_TOOLS,
      messages,
    });
    if (response.stop_reason === "end_turn") {
      // devuelve solo el resumen; el historial completo muere con la variable local
      return textOf(response);
    }
    messages = await appendToolResults(messages, response);
  }
  return "La investigación no terminó dentro del presupuesto de turnos";
}

async function handleDispatch(mainMessages, toolCall) {
  const summary = await runSubagent(client, toolCall.input.task);
  mainMessages.push({
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: toolCall.id,
      content: summary, // cada despacho agrega solo esta entrada
    }],
  });
}
```

Después del arreglo, la ventana principal gana un solo mensaje de resumen por despacho, y el proceso de exploración del subagente desaparece junto con la variable local. El efecto en cadena: la ventana principal ya no se inunda con contenido de proceso, y la lógica de compactación de la Lección 4 no se verá empujada a dispararse antes de tiempo por tres despachos — la compactación queda para las conversaciones que de verdad se alargan, en lugar de limpiar el desastre de una función de despacho con fugas.

<!-- hint -->
Rastrea qué hay realmente dentro de `renderAsText(subHistory)`: `messages` se va poniendo más y más abultado en el bucle vía `appendToolResults` — ¿dónde termina esa pila entera?

<!-- hint -->
Contrasta con la sección de la mecánica: ¿qué debería tener permitido salir del subagente? Entre «un resumen destilado, a menudo de 1000 a 2000 tokens» y «el historial de mensajes completo», ¿cuál debería recibir la ventana principal?

<!-- /exercises -->

## Resumen

- Un subagente es una técnica de gestión de contexto: la tarea acotada se ejecuta en una ventana de contexto limpia, el contenido intermedio de la exploración queda aislado dentro del subagente, y lo que vuelve suele ser solo un resumen destilado de 1000 a 2000 tokens — la ventana principal carga la conclusión, no el proceso[^S1].
- En el sistema de investigación multiagente de Anthropic, los subagentes se ejecutan en ventanas de contexto separadas en paralelo y logran compresión por esa vía, actuando como «filtros inteligentes» que condensan los tokens más importantes para el agente líder; "The essence of search is compression"[^S3].
- Números medidos del mismo sistema: los agentes usan unas 4× más tokens que los chats, los sistemas multiagente unas 15×, y el uso de tokens por sí solo explica el 80 % de la varianza de rendimiento — el aislamiento es una disyuntiva de atención, «gastar más tokens en total a cambio de una ventana que no se degrada», no un ahorro de costos[^S3].
- Que el aislamiento valga la pena depende de la proporción entre proceso y conclusión, y de si la complejidad agregada mejora el resultado de forma demostrable — la palabra de Anthropic es «considerar», una cuestión de proporción más que una regla de hierro[^S2].
- El combo de tarea larga: resumir cuando una fase se completa, guardar lo esencial en memoria externa, y luego generar un subagente fresco con contexto limpio manteniendo la continuidad mediante traspasos cuidadosos — las notas de la Lección 4 y el aislamiento de esta lección hacen juego[^S3].
- En Claude Code la ventana de contexto es el recurso más importante que hay que gestionar, lo que convierte a los subagentes en una de las herramientas más potentes disponibles: se ejecutan en ventanas de contexto separadas y reportan de vuelta solo resúmenes[^S4].

[>> Lección 6: Práctica: cablear la gestión de contexto sobre el arnés](./06-build-context-management.md)
