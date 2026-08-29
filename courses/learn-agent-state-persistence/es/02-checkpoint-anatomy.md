# Lección 2: Puntos de control: escribir la escena de ejecución en disco

> Objetivos de aprendizaje:
> - Nombrar los seis campos que corresponden a checkpoint.json y, para cada uno, decir con qué se topa la reanudación cuando falta
> - Distinguir los dos puntos de guardado dentro de un mismo turno del bucle (después de que el modelo nombra una herramienta, después de que el resultado de la herramienta queda registrado) y explicar a qué te expone escribir solo uno de ellos
> - Escribir un `saveCheckpoint` que no pueda corromper el propio archivo de punto de control: escribir un archivo temporal y después renombrar de forma atómica, en vez de sobrescribir en el lugar
>
> Requisitos: Leíste la Lección 1 y sabes distinguir memoria de estado de ejecución; te manejas con el arreglo `messages` y el esqueleto de bucle guiado por `stop_reason` de «Fundamentos del arnés de agente: bucles y control» | Anterior: [Lección 1 <<](./01-memory-vs-state.md) | Siguiente: [Lección 3 >>](./03-resume-from-checkpoint.md)

## La escena de ejecución vive en memoria por omisión

La Lección 1 separó memoria y estado de ejecución: la memoria es lo que le das al modelo, el estado de ejecución es la escena en curso que sostiene el propio arnés, el arreglo `messages`, el contador de turnos, la llamada a herramienta cuyo resultado todavía no quedó registrado. Por omisión esa escena existe solo en la memoria del proceso. Cuando el proceso muere se va con él, y aun con todos los demás archivos intactos en disco, la tarea solo puede arrancar de nuevo desde cero.

Escribir esa escena en disco, convertirla en algo que un proceso reiniciado pueda leer de vuelta, es lo que es un **punto de control**. Lo que sostiene de verdad la confiabilidad de las tareas largas en la práctica no suele ser pedirle al modelo que absorba cada falla por su cuenta; es combinar "the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints"[^S1] (la adaptabilidad de los agentes de IA construidos sobre Claude con salvaguardas deterministas como lógica de reintento y puntos de control regulares). Esta lección cubre la mitad del punto de control: qué corresponde poner en uno, en qué lugar del bucle escribirlo y cómo realizar la escritura misma, porque un punto de control mal escrito puede dejarte peor que no tener ninguno.

## Qué guardar: los seis campos de checkpoint.json

Un punto de control no es «volcar a un archivo todo lo que hay en memoria». Es «registrar lo que necesita la reanudación del bucle, ni más ni menos». Todas las lecciones posteriores de este curso funcionan con el mismo protocolo:

```javascript
const checkpoint = {
  version: 1,
  task: "Clasificar los tickets de soporte del último trimestre por tipo de problema y consolidarlos en una sola tabla",
  turns: 3,
  tokensUsed: 14208,
  messages: [/* el historial completo de la conversación */],
  pendingToolUse: null, // o { id, name, input }
};
```

- **version**: el número de versión del protocolo. Este formato va a cambiar en algún momento (compresión para `messages`, una forma nueva para `pendingToolUse`), y `version` le permite a la ruta de reanudación preguntar «¿reconozco este punto de control?» antes que nada; ante una versión que no conoce, habría que negarse a cargar y fallar ruidosamente en vez de apretar los dientes y seguir parseando.
- **task**: la tarea original del usuario, en palabras. Tras un reinicio, el código del arnés no recuerda qué estaba haciendo; todo lo que puede leer es este archivo en disco. Sin `task`, el arnés no puede ni decir a qué tarea pertenece el punto de control, mucho menos reportarle al usuario el progreso de la reanudación.
- **turns**: cuántos turnos se ejecutaron ya. Es lo que decide si se disparan las condiciones de parada de «Fundamentos del arnés de agente: bucles y control» (un tope máximo de turnos, digamos), y es el número desde el que la reanudación sigue contando en lugar de arrancar de cero.
- **tokensUsed**: el gasto acumulado de tokens. El umbral de compactación de «Ingeniería de contexto: gastar una atención finita donde más rinde» se dispara a partir de este número. Déjalo afuera del punto de control y la reanudación o bien finge que la cuenta arranca en cero —dejando desfasada cada decisión de compactación— o bien tiene que volver a estimar el consumo de cada mensaje de `messages`, y en la mayoría de las configuraciones las cifras históricas de consumo sencillamente ya no están disponibles.
- **messages**: la escena de conversación entera, cada mensaje user / assistant / tool_result que el modelo vio. Es lo más grande del punto de control y lo único que no puedes saltear: el modelo no tiene memoria propia, y todo lo que sabe sobre lo que pasó antes es este arreglo que le pasas en la solicitud siguiente. Elimínalo y lo que reanudas no es «seguir adelante»: es una tarea nueva que arranca de cero mientras arrastra cada efecto secundario que la ejecución vieja ya produjo.
- **pendingToolUse**: o bien `null`, o bien un registro con forma `{ id, name, input }`, una herramienta que el modelo nombró y cuyo resultado todavía no está registrado. Qué hacer con este campo es asunto de la Lección 3, donde la reanudación concilia contra él; aquí solo necesitas saber que es la ranura designada del punto de control para marcar un estado a medio terminar. Para mantener su forma simple, todos los ejemplos de esta lección suponen un bloque `tool_use` por turno; cuando un turno emite varias llamadas concurrentes a herramientas, conviértelo en un arreglo, que el razonamiento es el mismo.

## Cuándo guardar: dos puntos de guardado por turno

Mete esos campos en el bucle y resulta que el momento no es tan simple como «escribir una vez al final de cada turno». Hay dos puntos de guardado:

```javascript
while (response.stop_reason === "tool_use") {
  state.messages.push({ role: "assistant", content: response.content });

  const block = response.content.find((b) => b.type === "tool_use");

  // Punto de guardado A: el modelo nombró una herramienta, todavía no se ejecutó
  state.pendingToolUse = { id: block.id, name: block.name, input: block.input };
  saveCheckpoint(state);

  const result = await executeTool(block.name, block.input);

  state.messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
  });
  state.turns += 1;
  state.pendingToolUse = null;

  // Punto de guardado B: el resultado de herramienta de este turno quedó totalmente registrado en messages
  saveCheckpoint(state);

  response = await callModel({ tools, messages: state.messages });
  state.tokensUsed += response.usage?.output_tokens ?? 0;
}
```

El **punto A** va después de que llega la respuesta del modelo y antes de que la herramienta se ejecute: registra el bloque `tool_use` de la respuesta en `pendingToolUse` y después escribe. El **punto B** va después de que el resultado de la herramienta se agregó a `messages`: devuelve `pendingToolUse` a `null` y escribe de nuevo.

¿Alcanza con B solo? La exposición es la ventana entre A y B: el modelo nombró una herramienta y la herramienta se está ejecutando, o terminó pero su resultado no llegó a `messages` ni se escribió en disco. Si el proceso muere en esa ventana, el último punto de control en disco sigue siendo el que escribió B en el turno anterior, y no sabe nada de la llamada de este turno: no es que se haya perdido algún detalle, es que esta llamada a herramienta no dejó rastro alguno en disco. La Lección 3 concilia al reanudar —si esa herramienta terminó de verdad, si hace falta volver a ejecutarla— y contra lo que concilia es precisamente el `pendingToolUse` que escribió A. Esta lección solo cava el pozo; los ejercicios de la lección 6 te ponen delante un punto de control de solo B y te hacen diagnosticar qué sale mal al reanudar.

## Cómo guardar: no puedes sobrescribir en el lugar

El enfoque obvio es hacer `JSON.stringify` del objeto `state` y `fs.writeFileSync` directo encima del viejo `checkpoint.json`. Eso está bien cuando el proceso termina normalmente, pero «termina normalmente» es exactamente el caso para el que los puntos de control no son. Los puntos de control existen para que maten el proceso en cualquier momento, para el corte de corriente, para que el contenedor sea desalojado. Escribir un archivo no es una operación atómica. Si el proceso se interrumpe a mitad de la escritura, el `checkpoint.json` que queda en disco puede estar a medio escribir: ni la versión vieja, ni la nueva, solo JSON truncado. La reanudación siguiente lanza una excepción en `JSON.parse`, y ese archivo era la única copia de la escena de la tarea: no hay ninguna versión más vieja a la que recurrir.

La jugada es «escribir un archivo temporal y después renombrar de forma atómica». Escribe el contenido completo en `checkpoint.json.tmp`; si te caes a mitad de ese paso, la única baja es el archivo temporal, y el `checkpoint.json` de verdad sigue siendo la versión más vieja e intacta de antes de la caída, que la reanudación lee sin problema. Una vez que el archivo `.tmp` está completo, hazle `fs.renameSync` sobre el nombre real. En el mismo sistema de archivos, `rename` es un reemplazo atómico de un solo paso: el sistema operativo o bien apunta la entrada de directorio al archivo nuevo por completo, o bien la deja apuntando al viejo. No hay ningún estado intermedio a medio renombrar.

```javascript
import fs from "node:fs";
import path from "node:path";

function saveCheckpoint(state, dir = "./checkpoints") {
  fs.mkdirSync(dir, { recursive: true });

  const finalPath = path.join(dir, "checkpoint.json");
  const tmpPath = `${finalPath}.tmp`;

  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, finalPath); // en un mismo sistema de archivos, rename es un reemplazo atómico
}
```

```agentmentor-check
{
  "id": "sp-zh-02-direct-overwrite-risk",
  "label": "Juzgar qué sale mal cuando sobrescribes el archivo de punto de control en el lugar",
  "prompt": "Estás por escribir saveCheckpoint así: hacer JSON.stringify del objeto state y después fs.writeFileSync directo encima del mismo checkpoint.json. ¿Cuál es el problema con eso?",
  "whyHere": "Esto llega justo después de la receta de escribir un .tmp y después renombrar, para comprobar si de verdad entiendes por qué sobrescribir en el lugar es inseguro, en vez de memorizar la conclusión de que habría que usar tmp más rename.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Ningún problema: checkpoint.json solo tiene que sostener la instantánea más reciente, así que sobrescribirlo en el lugar es apenas cambiar el contenido viejo por el nuevo, sin archivo extra ni paso extra",
      "correct": false,
      "feedback": "Si el archivo debería conservar solo la instantánea más reciente y cómo metes el contenido nuevo en él son dos preguntas distintas. Un punto de control efectivamente necesita una sola copia vigente, pero la sobrescritura en sí no es atómica. Una caída puede interrumpir la escritura, y en ese instante lo que queda en disco no es ni una versión vieja completa ni una nueva completa; es un archivo escrito a medias."
    },
    {
      "id": "b",
      "text": "Sí hay un problema: si matan el proceso a mitad de la escritura, checkpoint.json puede quedar a medio escribir, con contenido truncado que JSON.parse no puede leer, y es la única copia de la escena de la tarea, sin ningún otro lugar del que recuperarse",
      "correct": true,
      "feedback": "Correcto. Escribir un archivo no es un paso atómico único, al proceso lo pueden matar en cualquier momento, y una escritura interrumpida convierte la única copia de la escena en medio documento JSON. Escribe primero el archivo temporal y solo cuando esté completo renómbralo sobre el nombre real: así el checkpoint.json en disco es, en todo instante, o bien la versión vieja completa o bien la nueva completa, nunca algo intermedio."
    },
    {
      "id": "c",
      "text": "Sí hay un problema, pero el problema es el uso de disco: escribir una y otra vez sobre el mismo archivo hace que checkpoint.json crezca con cada guardado, así que una tarea larga termina comiéndose mucho más espacio del que debería",
      "correct": false,
      "feedback": "Sobrescribir no hace crecer el archivo: cada escritura reemplaza el contenido viejo, así que el tamaño acompaña más o menos cuánto hay en el estado actual, no cuántas veces guardaste. El riesgo real no es el espacio en disco; es que la escritura misma puede quedar cortada por una caída, dejando un archivo que no está ni completo ni parseable."
    }
  ]
}
```

## Referencia de producto: cómo se ve un punto de control en Claude Code

El protocolo que enseña esta lección es para tareas largas desatendidas, con una granularidad de dos puntos de guardado por turno del bucle. Para contrastar, mira dónde pone la palabra «checkpoint» un producto real, Claude Code: "checkpointing automatically captures the state of your code before each user prompt."[^S2] (los puntos de control capturan automáticamente el estado de tu código antes de cada prompt del usuario). "Every user prompt creates a new checkpoint"[^S2] (cada prompt del usuario crea un punto de control nuevo), y "Claude Code saves checkpoints with the conversation, so you can still run /rewind after you resume a session"[^S2] (Claude Code guarda los puntos de control junto con la conversación, así que puedes ejecutar /rewind incluso después de reanudar una sesión).

El escenario al que sirve no es este. Los puntos de control de Claude Code están hechos para una sesión con una persona en el circuito: el usuario puede frenar todo en cualquier momento, probar un enfoque, decidir volver a antes de cierto mensaje y darle otra pasada, así que la unidad natural es «el usuario dijo algo». Lo que estás construyendo aquí es para tareas largas desatendidas: nadie está de guardia para dar el alto, la unidad es «el bucle dio una vuelta», y dentro de un mismo turno se parte otra vez en los puntos de guardado A y B, porque una caída puede producirse entre «el modelo nombró una herramienta» y «el resultado quedó registrado». Los dos no resuelven el mismo problema. Ponerlos uno al lado del otro sirve sobre todo para dejar una cosa clara: cuán fino cortar un punto de control, y cada cuánto escribir uno, depende de a qué sirve el punto de control. No hay una sola respuesta.

## Los puntos de control no son gratis

Los puntos de control cuestan algo. Bajo el protocolo de esta lección, un turno del bucle escribe en disco dos veces. Para una tarea corta que termina en tres o cinco turnos, eso es puro sobrecosto: el proceso se ejecuta hasta el final y esos archivos de punto de control nunca se leen. Si conviene meter esta maquinaria en tu propio arnés es algo que vale la pena medir contra la regla de que "you should consider adding complexity only when it demonstrably improves outcomes."[^S3] (habría que considerar agregar complejidad solo cuando mejora los resultados de forma demostrable). Cuanto más larga la tarea y más alto el costo de una caída, mejor se pone ese canje; para algo que termina en unos segundos, probablemente no lo necesites.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Completar un punto de control incompleto

Alguien escribió `saveCheckpoint` así:

```javascript
function saveCheckpoint(state) {
  fs.writeFileSync("checkpoint.json", JSON.stringify({ messages: state.messages }));
}
```

Frente al protocolo que planteó esta lección, ¿qué campos le faltan todavía a este punto de control? Para cada campo faltante, di específicamente: si intentaras reanudar desde este punto de control incompleto, ¿dónde exactamente se caería?

<!-- rubric -->
- Enumera los cinco campos faltantes: `version`, `task`, `turns`, `tokensUsed`, `pendingToolUse`
- Sobre `version`: explica que la ruta de reanudación no tiene manera de juzgar la versión de protocolo del archivo, ni de decidir si negarse a cargar una vez que el formato cambie
- Sobre `task`: explica que el arnés no sabe a qué tarea original pertenece esta escena, y no puede reportarle al usuario qué tarea se está reanudando
- Sobre `turns`: explica que la cuenta de turnos arranca de cero tras reanudar, y ya no coincide con los turnos realmente ejecutados, lo que puede hacer que una condición de parada por tope máximo de turnos se dispare antes de tiempo o no se dispare nunca
- Sobre `tokensUsed`: explica que el umbral de compactación no tiene un total acumulado preciso con el que trabajar, así que la reanudación o bien juzga mal que todavía no llegó al umbral, o bien tiene que volver a estimar el consumo (y volver a estimarlo por lo general no puede alcanzar las cifras históricas de consumo)
- Sobre `pendingToolUse`: explica que si la caída se produjo en la ventana en la que el modelo había nombrado una herramienta pero la ejecución no había terminado, la reanudación no tiene idea de que quedó una llamada a herramienta colgando, y no puede hacer la conciliación que cubre la Lección 3

<!-- answer -->
Este punto de control conservó solo `messages` y le faltan los otros cinco campos:

1. **`version`**: sin él, la ruta de reanudación no puede confirmar si reconoce el formato del archivo. Una vez que el protocolo cambie (que un campo tome una forma nueva, digamos), el código de reanudación no tiene contra qué juzgar «¿es esta una versión de punto de control que puedo manejar?». Solo puede apretar los dientes y parsear, y cuando eso falle no puede decir qué no cuadró.
2. **`task`**: sin él, todo lo que lee el arnés reiniciado es una pila de `messages`, sin manera de enunciar para qué se encadenaron esos mensajes. No puede reportarle el progreso al usuario al reanudar, y en una configuración con varias tareas no puede confirmar cuál acaba de retomar.
3. **`turns`**: sin él, la reanudación solo puede empezar a contar desde cero. Si fijaste una condición de parada como «detenerse tras N turnos», la cuenta posterior a la reanudación ya no coincide con los turnos que de verdad ocurrieron, así que la condición o se dispara antes de tiempo o deja de significar algo.
4. **`tokensUsed`**: sin él, el umbral de compactación no tiene un total acumulado que consultar. La reanudación o bien finge que la cuenta arranca en cero —dejando desfasada toda la decisión de «¿debería compactar este turno?»— o bien intenta volver a estimar el consumo a lo largo de los mensajes históricos de `messages`, y en la mayoría de las configuraciones esas cifras históricas de `usage` no se pueden recuperar.
5. **`pendingToolUse`**: sin él, si la última caída se produjo en la ventana en la que el modelo ya había nombrado una herramienta pero la ejecución no había terminado o el resultado no había quedado registrado, este punto de control no guarda registro alguno de eso. La reanudación no puede saber si de verdad quedó una llamada a herramienta colgando, y no puede hacer la conciliación de «¿hace falta volver a ejecutar esta llamada?» que cubre la Lección 3. Solo puede actuar como si no hubiera pasado nada.

<!-- hint -->
Vuelve a la sección de «qué guardar» y recorre uno a uno los seis campos del objeto de punto de control, comprobando cuáles no aparecen en esta versión recortada.

<!-- hint -->
No te quedes en «falta X»: empuja un paso más. Si el código del arnés de verdad reconstruyera `state` a partir de este archivo y volviera a entrar al bucle, ¿con qué se toparía primero?

<!-- rubric -->

### Nivel 2: Dos fallas latentes, corregidas

Un colega escribió el `runAgent` de abajo para ejecutar una tarea que llama herramientas dos veces seguidas. Se ve bien en el día a día, pero apenas matan el proceso a mitad de la ejecución, la escena que recuperas o no abre o no cuadra. Encuentra los dos puntos que ceden ante una caída, di a qué lleva cada uno y corrígelos: el código corregido tiene que ejecutarse de verdad.

```javascript
import fs from "node:fs";

function saveCheckpoint(state) {
  fs.writeFileSync("checkpoint.json", JSON.stringify(state, null, 2));
}

async function runAgent(task, tools, callModel, executeTool) {
  const state = {
    version: 1,
    task,
    turns: 0,
    tokensUsed: 0,
    messages: [{ role: "user", content: task }],
    pendingToolUse: null,
  };

  let response = await callModel({ tools, messages: state.messages });

  while (response.stop_reason === "tool_use") {
    state.messages.push({ role: "assistant", content: response.content });

    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    state.turns += 1;

    saveCheckpoint(state);
    response = await callModel({ tools, messages: state.messages });
  }

  return state;
}
```

<!-- rubric -->
- Identifica la primera falla: `saveCheckpoint` sobrescribe el mismo archivo con un `fs.writeFileSync` pelado, así que una escritura interrumpida deja medio documento JSON que no se puede parsear, sin ninguna versión más vieja a la que recurrir
- Identifica la segunda falla: todo el bucle escribe solo después de que el resultado de la herramienta queda registrado (punto B), sin ningún guardado entre que el modelo nombra una herramienta y que la herramienta termina (punto A), así que una caída en esa ventana deja la llamada a herramienta sin rastro en disco
- Corrección uno: reescribir `saveCheckpoint` para que escriba primero un archivo `.tmp` y después lo ponga en su lugar de forma atómica con `fs.renameSync`
- Corrección dos: después de leer `block` y antes de llamar a `executeTool`, agregar la asignación de `pendingToolUse` más un `saveCheckpoint` (punto A), y devolver `pendingToolUse` a `null` en el punto B
- El código corregido es estructuralmente completo y ejecutable (aunque sea solo contra los `callModel` / `executeTool` falsos del ejemplo)

<!-- answer -->
Dos fallas:

1. **Sobrescribir en el lugar no es seguro.** `saveCheckpoint` escribe directo encima del viejo `checkpoint.json` con `fs.writeFileSync`. Al proceso lo pueden matar en cualquier momento, y si la escritura se interrumpe, lo que queda en disco no es ni una versión vieja completa ni una nueva completa: es contenido truncado que `JSON.parse` no puede leer. Y ese archivo es la única copia de la escena; no hay ningún otro lugar del que recuperarse.
2. **Guarda solo en B, nunca en A.** El bucle llama a `saveCheckpoint` una vez, después de que el resultado de la herramienta se agregó a `messages`. Si la caída se produce entre «el modelo nombró una herramienta» y «el resultado quedó registrado» —mientras la herramienta se está ejecutando, o después de que terminó pero antes de que el resultado llegara a `messages`—, el último punto de control en disco sigue siendo el estado viejo del turno anterior, sin conocimiento alguno de esta llamada a herramienta.

La corrección, escritura atómica más un guardado en A:

```javascript
import fs from "node:fs";
import path from "node:path";

function saveCheckpoint(state, dir = "./checkpoints") {
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, "checkpoint.json");
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, finalPath); // en un mismo sistema de archivos, rename es un reemplazo atómico
}

async function runAgent(task, tools, callModel, executeTool, dir) {
  const state = {
    version: 1,
    task,
    turns: 0,
    tokensUsed: 0,
    messages: [{ role: "user", content: task }],
    pendingToolUse: null,
  };

  let response = await callModel({ tools, messages: state.messages });

  while (response.stop_reason === "tool_use") {
    state.messages.push({ role: "assistant", content: response.content });

    const block = response.content.find((b) => b.type === "tool_use");

    // Punto de guardado A: el modelo nombró una herramienta, todavía no se ejecutó
    state.pendingToolUse = { id: block.id, name: block.name, input: block.input };
    saveCheckpoint(state, dir);

    const result = await executeTool(block.name, block.input);

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    state.turns += 1;
    state.pendingToolUse = null;

    // Punto de guardado B: el resultado de herramienta de este turno quedó totalmente registrado en messages
    saveCheckpoint(state, dir);

    response = await callModel({ tools, messages: state.messages });
  }

  return state;
}
```

Alcanza con un par de falsos que nunca tocan un modelo real para verificarlo: un `fakeCallModel` que pide una llamada a herramienta dos veces seguidas y solo devuelve `end_turn` en la tercera llamada, junto con un `fakeExecuteTool` que devuelve una cadena fija. Ejecútalo y verás `checkpoint.json` escrito 4 veces en disco (2 turnos × puntos de guardado A y B), terminando con `pendingToolUse` en `null` y `turns` en `2`, exactamente igual al estado final en memoria.

<!-- hint -->
Empieza por `saveCheckpoint` solo. Compáralo con la versión de la sección «cómo guardar» de esta lección y fíjate qué paso falta.

<!-- hint -->
Después cuenta cuántas veces aparece `saveCheckpoint(state)` en el cuerpo del bucle, y en qué líneas. Pregúntate: entre que el modelo nombra una herramienta (leer `block`) y que la herramienta de verdad termina (que retorne `await executeTool`), ¿se escribe algo en disco?

<!-- /exercises -->

## Resumen

- La escena de ejecución vive en memoria por omisión y muere con el proceso. Los puntos de control existen para ahorrarle a una tarea larga volver a ejecutarse desde cero tras cada caída, y así poder retomar donde se rompió[^S1]
- checkpoint.json sostiene seis campos: `version`, `task`, `turns`, `tokensUsed`, `messages`, `pendingToolUse`. `messages` es la pieza más grande, y sin él el modelo no tiene nada sobre lo que pasó antes; `pendingToolUse` es la marca de llamada colgante contra la que concilia la Lección 3
- Un turno del bucle tiene dos puntos de guardado: A después de que el modelo nombra una herramienta y antes de que la herramienta se ejecute, B después de que el resultado de la herramienta queda totalmente registrado en `messages`. Guardar solo en B deja un punto ciego en toda la ventana en la que el modelo nombró una herramienta que no terminó
- Sobrescribir el archivo de punto de control en el lugar no es seguro. Al proceso lo pueden matar en cualquier momento, y una caída a mitad de la escritura convierte la única copia de la escena en medio documento JSON. Escribe primero un archivo `.tmp` y ponlo en su lugar con `fs.renameSync`: eso es lo que garantiza que lo que hay en disco en cualquier instante sea una versión completa
- Los puntos de control de Claude Code trabajan con otra granularidad —capturados automáticamente antes de cada prompt del usuario[^S2]—, al servicio de una sesión con una persona en el circuito. Lo que construye esta lección es para tareas largas desatendidas. Los puntos de corte difieren, pero ambos responden a la misma pregunta: cuando algo sale mal, ¿a dónde vuelves?
- Los puntos de control no son gratis. Dos escrituras a disco por turno son puro sobrecosto en una tarea corta, y si vale la pena agregarlos se reduce a si mejora el resultado de forma demostrable, no a suponer que más es mejor[^S3]

[>> Lección 3: Reanudar desde un punto de control: reiniciar el bucle](./03-resume-from-checkpoint.md)
