# Lección 6: Práctica: cablear la gestión de contexto sobre el arnés

> Objetivos de aprendizaje:
> - Cablear el seguimiento del uso de tokens sobre un bucle de arnés guiado por `stop_reason`: acumular con `response.usage`, decidir si el contexto se acerca al límite de la ventana
> - Convertir el `compact()` de la Lección 4 en un mecanismo disparado por umbral: fijar la proporción de disparo, pensar cómo deberían reiniciarse `messages` y el contador de uso después del disparo
> - Cablear las notas estructuradas en este flujo de compactación para que `NOTES.md` se lea de vuelta cada vez que una ventana nueva reinicia, y ejecutar una tarea que excede la capacidad de una sola ventana
>
> Requisitos: Terminaste la Lección 4 sobre compactación y notas, la Lección 5 sobre aislamiento con subagentes, y tienes a mano el bucle del arnés del curso 7 de esta serie, «Fundamentos del arnés de agente: bucles y control» | Anterior: [Lección 5 <<](./05-subagent-context-isolation.md)

## Primero, verlo en marcha

Las primeras cinco lecciones fueron todas principios: por qué el contexto es un recurso finito, cómo funciona la compactación, cómo funcionan las notas, cómo aíslan los subagentes. Esta lección suelda los dos primeros — compactación y notas — dentro del bucle del arnés que escribiste en el curso 7 de esta serie. Primero mira cómo se ve en marcha, y después desarmamos el código.

Abajo hay un registro de ejecución real (usando un cliente de prueba que simula respuestas del modelo en varios turnos, para que una tarea larga quepa en unas pocas líneas de registro; la implementación del cliente de prueba aparece al final de esta lección). La tarea es aquel escenario familiar de la Lección 4: arreglar un bug de carrera por concurrencia en un servicio de pedidos. Para disparar la compactación en pocos turnos, la demostración fija a propósito una ventana de contexto diminuta:

```text
[llamada 1] stop_reason=tool_use tokensUsed=400
[llamada 2] stop_reason=tool_use tokensUsed=1050
[llamada 3] stop_reason=tool_use tokensUsed=1850
[llamada 4] >>> compactación disparada (vez 1), tokensUsed reiniciado a 0
[llamada 5] stop_reason=tool_use tokensUsed=280
[llamada 6] stop_reason=end_turn tokensUsed=490

Respuesta final: Se agregó el campo version a la tabla orders y se cableó el bloqueo optimista; bug de carrera arreglado.
Llamadas al modelo en total: 6 (incluida 1 llamada de compactación)
Disparos de compactación: 1

Contenido final de NOTES.md:
## Decisiones tomadas
- Enfoque de arreglo: bloqueo optimista de base de datos (agregar campo version a la tabla orders)
## Sin resolver
- (ninguno -- carrera de updateStatus resuelta con fusión por bloqueo optimista)
```

Léelo línea por línea: las primeras tres llamadas empujan `tokensUsed` de 400 a 1050 a 1850; después de que los resultados de herramientas de la tercera ronda se anexan al historial, el valor acumulado cruza el umbral fijado, así que el arnés no espera a que la ventana reviente de verdad — dispara proactivamente una llamada de compactación (llamada 4; `stop_reason` ya no importa porque esta respuesta nunca entra al bucle principal, su salida se usa directamente para reiniciar `messages`); `tokensUsed` vuelve a cero; las dos rondas siguientes cuentan desde cero en la ventana nueva hasta que el modelo cierra. El proceso entero tiene un solo artefacto visible para el usuario — esa respuesta final; la compactación y las notas ocurren fuera de escena. El resto de esta lección es construir, línea por línea, el código detrás de ese registro.

## I. Cablear el seguimiento del uso de tokens sobre el bucle

El paso uno es directo: saber cuántos tokens llevas usados, porque ese es el requisito previo para decidir si compactar. Ya usaste este campo cuando escribiste la válvula de presupuesto (válvula 2) en el curso 7 de esta serie — `response.usage` trae `input_tokens` y `output_tokens` de esta llamada, y cada vez que recibes una respuesta los sumas a un acumulador:

```javascript
function trackUsage(tokensUsed, response) {
  return tokensUsed + response.usage.input_tokens + response.usage.output_tokens;
}
```

La válvula `TOKEN_BUDGET` del curso 7 usaba este valor acumulado para una sola cosa: parar al llegar al techo. Esta lección hace otra cosa: compactar proactivamente en una proporción mucho más temprana y seguir trabajando, en lugar de parar. Ambas usan el mismo acumulador; lo que pasa después del disparo es completamente distinto — una frena, la otra toma aire.

¿De qué tamaño es la ventana misma? Esa es una constante que defines con tu propio criterio de ingeniería:

```javascript
const CONTEXT_WINDOW = 2000; // ventana pequeña de demostración para disparar en pocos turnos; en proyectos reales se fija al límite real de tu modelo
const COMPACT_RATIO = 0.7;   // umbral: compactar cuando el uso supera el 70 % de la ventana

function shouldCompact(tokensUsed) {
  return tokensUsed >= CONTEXT_WINDOW * COMPACT_RATIO;
}
```

No hay respuesta estándar sobre cuánto debería valer `COMPACT_RATIO` — es un criterio de ingeniería, no una cláusula de especificación. Fíjalo demasiado alto y, para cuando te des cuenta de que «toca compactar», la ventana podría estar tan apretada que ni siquiera puedas enviar la petición siguiente; fíjalo demasiado bajo y la compactación interrumpirá la tarea antes y más seguido de lo que debería, desperdiciando llamadas al modelo. Como regla práctica, dejar alrededor de un 30 % de aire (es decir, un umbral de 0.7) suele funcionar; el número concreto habría que ajustarlo según el tamaño real de la ventana de tu modelo y el volumen de resultados de herramientas por turno.

## II. Compactación disparada por umbral: cablear el `compact()` de la Lección 4 al bucle

Con la mecánica fijada, el paso siguiente es cablearla en el cuerpo del bucle. Recuerda la conclusión de la Lección 4: la compactación no mete un resumen de vuelta en la conversación vieja para seguir apretando — **reinicia** una ventana nueva con el resumen, abandonando por completo el `messages` viejo[^S1]. Cableado al bucle, eso significa reemplazar `messages` en bloque en el momento correcto:

```javascript
while (response.stop_reason === "tool_use") {
  messages = await appendToolResults(messages, response, toolImpls); // reutiliza la función auxiliar de la Lección 5

  if (shouldCompact(tokensUsed)) {
    messages = await compact(client, messages); // reinicio: reemplazo en bloque
    tokensUsed = 0;                              // ventana nueva, se cuenta desde cero
  }

  response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  tokensUsed = trackUsage(tokensUsed, response);
}
```

Tres posiciones determinan si este código es correcto:

- **Dónde va la revisión**: inmediatamente después de que los resultados de herramientas de esta ronda se anexan a `messages`, antes del siguiente `client.messages.create`. Si va demasiado temprano (revisar antes de anexar), se pierde los resultados de herramientas recién producidos; si va demasiado tarde (anexar después de revisar), envías contenido ya por encima del umbral en una petición extra.
- **Después de compactar, `messages` se reemplaza en bloque, no se le anexa**: el valor de retorno de `compact()` se asigna directamente a `messages`, y el arreglo viejo con sus decenas de idas y vueltas de herramientas se descarta — esa es la frontera entre «reiniciar» y «seguir amontonando sobre la conversación vieja».
- **`tokensUsed` debe volver a cero**: la ventana nueva arranca desde un resumen, así que el uso debería contarse a partir de ese resumen y no seguir arrastrando el valor acumulado de la ventana vieja. Saltarse este paso es una trampa común; los ejercicios de esta lección la diagnostican específicamente.

`compact()` en sí reutiliza la implementación de la Lección 4; `COMPACT_INSTRUCTION` y los principios de clasificación (preservar decisiones arquitectónicas, bugs sin resolver y detalles clave de implementación; descartar resultados de herramientas redundantes) siguen igual[^S1]. La sección siguiente le agrega una capacidad nueva: al reiniciar, leer no solo el resumen sino también `NOTES.md`.

## III. Notas estructuradas como respaldo: NOTES.md se lee de vuelta durante la compactación

La compactación es pasiva y a posteriori: resume «lo que queda en la ventana en el momento del disparo». La Lección 4 ya explicó que las notas son un seguro activo escrito sobre la marcha: el agente escribe decisiones y problemas en `NOTES.md`, fuera de la ventana, en el momento en que ocurren[^S1]. La manera de cablear las dos cosas es directa: **cuando una ventana nueva reinicia, además de leer el resumen, leer también `NOTES.md` de vuelta** — así, aunque la clasificación del resumen de esta ronda se haya equivocado, las notas siguen teniendo un respaldo independiente.

Primero, dale al agente una herramienta para escribir notas:

```javascript
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const NOTES_PATH = path.join(process.cwd(), "NOTES.md");

async function readNotes() {
  try {
    return await readFile(NOTES_PATH, "utf8");
  } catch {
    return "(NOTES.md todavía está vacío)";
  }
}

async function writeNotes(content) {
  await writeFile(NOTES_PATH, content, "utf8");
}

const NOTES_TOOL = {
  name: "update_notes",
  description: "Sobrescribe NOTES.md con el contenido completo que quieras guardar, para registrar decisiones arquitectónicas, problemas sin resolver y planes de próximos pasos",
  input_schema: {
    type: "object",
    properties: { content: { type: "string" } },
    required: ["content"],
  },
};

const toolImpls = {
  update_notes: async ({ content }) => {
    await writeNotes(content);
    return "NOTES.md actualizado";
  },
  // ...tus otras herramientas
};
```

El `input` de `update_notes` es el contenido **completo** de la nota que se va a guardar, y la implementación lo escribe en bloque — esta es la semántica más simple: el agente mantiene un corpus de notas completo y cada actualización significa «este es el estado actual», sin ninguna fusión incremental que atender. Cablea un requisito en el prompt del sistema: «Cada vez que tomes una decisión importante, descubras un problema nuevo o completes una fase, llama a `update_notes` para actualizar las notas antes de continuar», tal como en la Lección 4.

Después viene el paso nuevo de esta lección: cuando `compact()` genera el resumen, además lee `NOTES.md` dentro del mensaje de reinicio:

```javascript
async function compact(client, messages) {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: COMPACT_INSTRUCTION + "\n\n" + formatHistory(messages),
    }],
  });
  const summary = resp.content.find((b) => b.type === "text").text;
  const notes = await readNotes(); // nuevo: traer también las notas de fuera de la ventana
  return [{
    role: "user",
    content:
      "Abajo hay un resumen de traspaso del trabajo previo; continúa desde aquí:\n\n" + summary +
      "\n\nAbajo está el contenido actual de NOTES.md:\n" + notes,
  }];
}
```

Cuando la ventana nueva despierta, tiene dos materiales: el resumen del propio modelo, y las notas que el agente escribió a mano. El primero puede perder detalle por la clasificación del resumen; las segundas no pierden nada — eso es el «cuanto más diligentes las notas, más leves las consecuencias de que la compactación pierda algo» de la Lección 4, en forma de código.

```agentmentor-check
{
  "id": "ctx-zh-06-notes-every-turn",
  "label": "Evaluar la propuesta de meter NOTES.md en el prompt del sistema de cada turno",
  "prompt": "Después de ver el código donde compact() «lee NOTES.md una vez al reiniciar», un colega propone ir más lejos: poner el texto completo de NOTES.md en el prompt del sistema para que salga con cada petición, y así el modelo siempre pueda ver las notas más recientes sin esperar a que se dispare la compactación. ¿Qué te parece esta propuesta?",
  "whyHere": "El bloque de código anterior acaba de demostrar «leer las notas una vez en el momento del reinicio por compactación»; si quien lee no se da cuenta de que eso es deliberado, es fácil pensar «¿no sería más seguro llevarse las notas en cada turno?». Aquí hace falta comprobar si se entiende que externalizar las notas significa no ocupar la ventana, no volver el contenido siempre visible.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Más completo y más seguro: total, las notas no son tan grandes, y llevarlas en cada turno asegura que no se pierda información, sin desventajas",
      "correct": false,
      "feedback": "No exactamente. «No son tan grandes» es relativo: las notas se irán alargando conforme avanza la tarea, y el prompt del sistema es contenido que se envía de nuevo en cada turno. Meterlo en el prompt del sistema de cada turno significa que el volumen completo de las notas consume presupuesto de atención una y otra vez a lo largo de la tarea — y externalizar las notas significa justamente mover ese estado fuera de la ventana, para traerlo solo cuando hace falta."
    },
    {
      "id": "b",
      "text": "No recomendable: cada nuevo token agota parte del presupuesto de atención, y externalizar las notas significa que no ocupan la ventana; leerlas una vez en el momento del reinicio genuino es más económico que llevarlas en cada turno",
      "correct": true,
      "feedback": "Correcto. Ese es el nudo: las notas se escriben fuera de la ventana precisamente para que no ocupen el presupuesto de atención de cada turno; cada nuevo token agota parte de ese presupuesto. El reinicio por compactación es el momento en que la ventana genuinamente «cambió a una tanda nueva de memoria», y ahí leer las notas una vez es un costo razonable; meter el mismo contenido repetidamente en cada turno es como devolver lo «externo» a lo «interno» — y conforme las notas se alargan, el costo hace bola de nieve."
    },
    {
      "id": "c",
      "text": "Da igual: total, las notas y el resumen los va a volver a resumir la siguiente compactación, así que cuántas veces se lean no afecta el resultado final",
      "correct": false,
      "feedback": "No exactamente. El costo aquí no es «si el resultado final es correcto», sino «cuánto presupuesto de atención gastas para llegar a ese resultado». Llevar las notas completas en cada turno es un costo real de tokens y de presupuesto por turno, independiente de si alguna compactación futura las resumirá: antes de que la compactación ocurra, las copias redundantes de las notas ya venían bajando la densidad de atención de forma sostenida."
    }
  ]
}
```

## IV. Armarlo todo: una tarea que excede la capacidad de una sola ventana

Tres componentes — seguimiento del uso, compactación disparada por umbral, lectura y escritura de `NOTES.md` — cableados dentro del mismo `runAgent` producen el código completo detrás del registro de apertura:

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-sonnet-5";

async function runAgent(userInput, tools, toolImpls, opts = {}) {
  let messages = [{ role: "user", content: userInput }];
  let tokensUsed = 0;

  let response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
  tokensUsed = trackUsage(tokensUsed, response);

  while (response.stop_reason === "tool_use") {
    messages = await appendToolResults(messages, response, toolImpls);

    if (shouldCompact(tokensUsed)) {
      messages = await compact(client, messages);
      tokensUsed = 0;
      opts.onCompact?.();
    }

    response = await client.messages.create({
      model: MODEL, max_tokens: 1024, tools, messages,
    });
    tokensUsed = trackUsage(tokensUsed, response);
  }

  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

Esta es la fuente completa del registro de apertura: tres llamadas a herramientas empujan `tokensUsed` de 400 a 1050 a 1850, cruzando la línea del umbral `2000 * 0.7 = 1400`; se llama a `compact()`, `messages` se reemplaza en bloque, el contador vuelve a cero; luego dos rondas más en la ventana nueva, y el modelo cierra. Solo hubo una compactación en toda la ejecución, pero si la tarea continuara y volviera a tocar el umbral, la misma lógica dispararía una segunda y una tercera — a `shouldCompact` no le importa de qué ventana se trata, solo mira el uso de la ventana actual. Eso es lo que significa «ejecutar una tarea que excede la capacidad de una sola ventana»: la longitud total de la tarea no está acotada por la capacidad de ninguna ventana en particular, solo por «una inferencia continua sin interrupciones».

Para ejecutar una verificación completa, engancha un cliente de prueba que simule respuestas del modelo en varios turnos (cámbialo por `new Anthropic()` en llamadas reales; el código de `runAgent` no cambia ni un carácter):

```javascript
let callIndex = 0;
const queue = [ /* ...respuestas en orden de llamada, donde la 4.ª es la respuesta propia de la compactación... */ ];

const stubClient = {
  messages: {
    create: async () => queue[callIndex++],
  },
};
```

El valor de verificar con un cliente de prueba así es que fija «si el modelo llamará herramientas este turno, cuántos tokens usó» como cantidades conocidas, de modo que si la compactación se dispara y en qué turno, si `tokensUsed` vuelve a cero, si `NOTES.md` se escribe y luego se lee de vuelta — todo se puede comprobar con aserciones en lugar de entrecerrar los ojos ante salidas de llamadas reales y adivinar.

## Sentido de la proporción: no toda tarea necesita esta maquinaria

Después de cablear todo esto, es fácil quedarse con una impresión falsa: que de ahora en adelante, escribir agentes debería incluir por defecto el paquete de seguimiento del uso, compactación por umbral y notas estructuradas. Vuelve al sentido de la proporción establecido en la Lección 2: considerar agregar complejidad solo cuando puede mejorar los resultados de forma demostrable[^S2]. Para tareas que terminan en una docena de turnos, la compactación y las notas son ambas piezas superfluas — arranca desde el bucle pelado más las válvulas de control básicas del curso 7 de esta serie, y agrega esta capa solo cuando de verdad choques con el límite de la ventana o veas síntomas de amnesia del tipo «la ventana nueva no sabe qué hizo la vieja».

Llegados a este punto, todo lo que este curso enseñó de la Lección 1 a la Lección 6 — presupuesto de atención, altitud de los prompts del sistema, recuperación justo a tiempo, compactación y notas, aislamiento con subagentes — converge en la misma conclusión: lo que el modelo debería ver en cada turno es siempre un criterio de ingeniería que revisas una y otra vez, no una configuración que dejas puesta de una vez y para siempre.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Seguir cuándo se dispara la compactación

Un arnés está configurado con `CONTEXT_WINDOW = 6000` y `COMPACT_RATIO = 0.75`. Después de ejecutar la tarea, el uso por turno (suma de `input_tokens + output_tokens`) de cuatro turnos consecutivos es: 1200, 1500, 900, 1100. Responde:

1. ¿Después de qué turno se disparará la compactación? ¿Cuál es el `tokensUsed` acumulado en el momento del disparo?
2. Después de que la compactación se dispara y completa, ¿cuánto debería valer `tokensUsed`?
3. Si la llamada al modelo inmediatamente posterior a la compactación devuelve `usage = { input_tokens: 300, output_tokens: 100 }`, ¿en cuánto queda `tokensUsed`?

<!-- rubric -->
- Calcula correctamente el umbral como `6000 * 0.75 = 4500`, y acumula correctamente el uso de los cuatro turnos: 1200, 2700, 3600, 4700, señalando que después del turno 4 el valor acumulado 4700 alcanza o supera el umbral por primera vez, así que la compactación se dispara en ese punto
- Enuncia claramente que después de completar la compactación `tokensUsed` debería reiniciarse a 0, porque el uso de la ventana nueva debería contarse a partir de ese resumen, sin arrastrar el valor acumulado de la ventana vieja
- Calcula correctamente que la primera llamada después del reinicio da `tokensUsed = 0 + 300 + 100 = 400`

<!-- answer -->
1. Acumulando turno a turno: después del turno 1: 1200, después del turno 2: 2700, después del turno 3: 3600, después del turno 4: 4700. El umbral es `6000 * 0.75 = 4500`, y 4700 es el primer valor acumulado de los cuatro que alcanza o supera el umbral, así que la compactación se dispara **después del turno 4**, con un `tokensUsed` acumulado de **4700**.
2. La compactación reemplaza `messages` en bloque con el mensaje de reinicio que devuelve `compact()`; la ventana nueva arranca fresca desde ese resumen (más `NOTES.md`), así que `tokensUsed` debería reiniciarse a **0** — no debería seguir arrastrando los 4700 de la ventana vieja, porque si no la revisión del turno siguiente creería siempre, por error, que «la ventana ya está muy llena».
3. La primera llamada después del reinicio devuelve `usage = { input_tokens: 300, output_tokens: 100 }`, así que `tokensUsed = 0 + 300 + 100 = 400`.

<!-- hint -->
Acumula honestamente el uso de los cuatro turnos en una secuencia de sumas parciales, y luego compara cada una con el umbral `6000 * 0.75` para encontrar la primera posición que cruza la línea.

<!-- hint -->
El «reinicio» de la compactación no es solo cambiar el arreglo de mensajes; el contador de uso también debería recibir un punto de partida nuevo — piensa en qué está contando realmente: «uso histórico total» o «uso de la ventana actual».

### Nivel 2: Diagnosticar una «tormenta de compactación»

Alguien cableó la compactación disparada por umbral en el bucle, pero olvidó una línea:

```javascript
while (response.stop_reason === "tool_use") {
  messages = await appendToolResults(messages, response, toolImpls);

  if (shouldCompact(tokensUsed)) {
    messages = await compact(client, messages);
    // falta tokensUsed = 0
  }

  response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  tokensUsed = trackUsage(tokensUsed, response);
}
```

Después de cablearlo, la tarea se ejecutó hasta cierto turno en que la compactación se disparó por primera vez; pero de ahí en adelante, cada turno vuelve a disparar la compactación, aunque la ventana nueva solo haya pasado por uno o dos turnos y acumulado muy poco contenido. Explica por qué ocurre esto y da el arreglo.

<!-- rubric -->
- Señala la causa raíz: `tokensUsed` es un acumulador siempre creciente; en el primer disparo de compactación ya alcanzó o superó el umbral; sin reiniciarlo, cada `trackUsage` posterior solo sigue sumando encima, así que `shouldCompact(tokensUsed)` es verdadero desde el primer disparo en adelante
- Explica la consecuencia: cada turno dispara otro `compact()` (desperdiciando una llamada al modelo), mientras que el uso real de la ventana nueva no se acerca ni de lejos al umbral; la compactación se vuelve más frecuente de lo que debería, desperdiciando llamadas y potencialmente ralentizando la tarea
- Arreglo: agregar una línea `tokensUsed = 0` después de que `compact()` tiene éxito, para que la semántica del contador siga siendo «uso de la ventana actual» y no «uso histórico total»

<!-- answer -->
La causa raíz es que `shouldCompact` revisa `tokensUsed`, un acumulador siempre creciente. En el momento en que la primera compactación se dispara, `tokensUsed` ya alcanzó o superó el umbral; `compact()` cambia `messages` por una ventana nueva y limpia, pero el código olvidó devolver `tokensUsed` a un punto de partida acorde con la ventana nueva. Así que el siguiente `trackUsage(tokensUsed, response)` solo le suma más a ese número que ya está por encima del umbral — sin importar cuántos tokens haya agregado realmente el turno de la ventana nueva, `shouldCompact(tokensUsed)` es permanentemente verdadero desde el primer disparo en adelante. El resultado es: aunque la ventana nueva solo haya pasado por uno o dos turnos con muy poco contenido, la revisión al inicio del bucle siguiente igual da positivo, así que vuelve a llamar a `compact()`, y otra vez. Cada compactación redundante es una llamada extra al modelo; la tarea debería estar avanzando, pero en cambio gira en el mismo lugar: «resumir, reiniciar, volver a resumir».

El arreglo es apenas devolver la línea de reinicio:

```javascript
if (shouldCompact(tokensUsed)) {
  messages = await compact(client, messages);
  tokensUsed = 0; // ventana nueva, se cuenta desde cero
}
```

Una vez agregada, la semántica de `tokensUsed` pasa a ser «cuánto lleva usado la ventana actual», y la compactación solo se vuelve a disparar cuando la ventana nueva acumula también el uso del umbral, sin quedar arrastrada por el número histórico de la ventana vieja.

<!-- hint -->
`shouldCompact` solo compara `tokensUsed` con un umbral fijo. En el momento en que la compactación se dispara, ¿`tokensUsed` es mayor o menor respecto del umbral? Si después nunca se reduce, ¿cuál será el resultado de cada comparación posterior?

<!-- hint -->
Consulta el Nivel 1: después de completar la compactación, ¿qué debería representar `tokensUsed`? ¿Es «uso total desde el inicio de la tarea hasta ahora» o «uso de la ventana actual»? Este bug es exactamente mezclar esas dos semánticas.

<!-- /exercises -->

## Resumen

- Cablear el seguimiento del uso sobre el arnés solo necesita un acumulador: cada vez que recibes una respuesta, sumas `response.usage.input_tokens + response.usage.output_tokens`; comparte los mismos datos con la válvula `TOKEN_BUDGET` del curso 7, pero la acción posterior al disparo es distinta — la válvula de presupuesto para al tocar el techo; el umbral de esta lección compacta y sigue trabajando.
- La compactación disparada por umbral cablea el `compact()` de la Lección 4 al cuerpo del bucle: la revisión va en «los resultados de herramientas de esta ronda ya anexados, antes de que salga la petición siguiente»; tras el disparo, `messages` se reemplaza en bloque con el resultado de la compactación — es un reinicio, no un anexado[^S1]; `tokensUsed` debe reiniciarse en sincronía, o caes en una tormenta de compactaciones repetidas.
- Las notas y la compactación se cablean juntas en esta lección: la herramienta `update_notes` escribe sobre la marcha — eso es persistir notas fuera de la ventana de contexto[^S1] — y `compact()` lee `NOTES.md` dentro del mensaje de reinicio además de generar el resumen; el resumen puede perder contenido por la clasificación, las notas se leen de vuelta como copia sin pérdidas. «Leer una sola vez en momentos críticos como el reinicio de la ventana, no meterlas en el prompt del sistema de cada turno» es la disyuntiva de ingeniería de esta lección, basado en el principio del presupuesto de atención (cada nuevo token agota ese presupuesto[^S1]).
- Una verificación real de punta a punta muestra: tres llamadas a herramientas empujan el uso de 400 a 1850, cruzan el umbral y disparan una compactación, el contador se reinicia, y luego dos rondas más para cerrar — la longitud total de la tarea ya no está acotada por la capacidad de una sola ventana, solo por «una inferencia continua sin interrupciones».
- No trates esta maquinaria como configuración por defecto: agrégala solo cuando la complejidad extra pueda mejorar los resultados de forma demostrable[^S2]; para tareas que terminan en unos pocos turnos, el bucle pelado más las válvulas de control básicas del curso 7 de esta serie alcanzan.
