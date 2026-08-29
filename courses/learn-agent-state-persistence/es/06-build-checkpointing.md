# Lección 6: Manos a la obra: conectar los puntos de control y la reanudación al arnés

> Objetivos de aprendizaje:
> - Soldar de verdad al bucle `runAgent` del Curso 7 de esta serie el esquema de puntos de control «guardar la llamada colgante en el punto A, limpiarla en el punto B», en vez de dejarlo como un diagrama conceptual
> - Adosarle a `runToolUses` un registro de efectos secundarios: en el momento en que una herramienta tiene éxito, escribir en disco una anotación para que la reanudación pueda saber si «esta herramienta se ejecutó de verdad o no»
> - Escribir la división en tres de `reconcile`, y usar una corrida controlada de «muerte simulada + `--resume`» para ver, con tus propios ojos, que la recuperación se comporta como debería
>
> Requisitos: Leíste las Lecciones 1 a 5 y puedes ejecutar el bucle del arnés del Curso 7 de esta serie, «Fundamentos del arnés de agente: bucles y control» | Anterior: [Lección 5 <<](./05-rewind-and-fork.md)

## Primero, cómo se ve corriendo

Las primeras cinco lecciones desarmaron los puntos de control, la reanudación, la idempotencia y el par rebobinar/bifurcar, y explicaron cada pieza. Esta lección las suelda en un arnés que corre de verdad: el mismo bucle conocido —llamar al modelo con `messages` y, cuando `stop_reason === "tool_use"`, ejecutar la herramienta y volver a llamar—, salvo que esta vez cada turno escribe dos puntos de control en disco, más un registro que anota los resultados de ejecución de herramientas. La tarea es «convertir notas de ventas en un reporte», llamando a tres herramientas en secuencia: `read_notes`, `count_words`, `write_report`. Así se ve cuando corre normalmente hasta el turno tres y ahí lo matan de golpe:

```text
$ CRASH_AFTER=after-effect-write:3 node agent.js

[turn 1][save A] pending=read_notes
[turn 1][save B]
[turn 2][save A] pending=count_words
[turn 2][save B]
[turn 3][save A] pending=write_report
[kill] caída simulada en after-effect-write:3
EXIT=137
```

Los turnos 1 y 2 recorrieron completos los tres pasos `save A` → ejecutar → `save B`, todo normal. El turno 3 guardó `save A` (anotando que la llamada colgante es `write_report`), la herramienta de hecho terminó de ejecutarse y su resultado ya estaba escrito en el registro, pero el `save B` del paso siguiente nunca llegó a guardarse antes de que mataran al proceso. Esta es exactamente la ventana que esta lección sale a clavar: en este momento `checkpoint.json` todavía sostiene un `pendingToolUse` colgante. Cargando esa escena, retómalo con `--resume`:

```text
$ node agent.js --resume

[resume] leído turn=3 pending=write_report
[resume][reconcile] tool_use_id=toolu_03 name=write_report acierto en el registro, reutilizando resultado, sin volver a ejecutar
[turn 3][save B] rellenado el resultado de herramienta de este turno tras reanudar
[done] Reporte escrito en report.txt, tarea completa.
```

El flujo de reanudación lee `turn=3 pending=write_report`, consulta el registro y encuentra que esta llamada de hecho había terminado y quedado anotada antes de la muerte, así que reutiliza esa anotación directamente y **no vuelve a ejecutar `write_report`**, rellena el `save B` que le faltaba a este turno y sigue hacia el cierre del modelo como siempre. La tarea entera nunca empezó de cero, y el reporte nunca se escribió dos veces.

Estas dos salidas de terminal no son ejemplos escritos a mano. Son la salida real del script de Node impulsado por una cola de respuestas fija de la sección «El arnés de verificación» más abajo, copiadas acá línea por línea.

## Construirlo bloque por bloque

### Leer y escribir puntos de control: `saveCheckpoint` / `loadCheckpoint`

Un punto de control es apenas esta escena —`{version, task, turns, tokensUsed, messages, pendingToolUse}`— serializada a disco. Lo único con lo que hay que tener cuidado es no corromper el archivo: escribe primero en un archivo temporal y después ponlo en su lugar de forma atómica con `fs.renameSync`; `rename` es una operación indivisible dentro del mismo sistema de archivos, así que nunca hay un estado intermedio «escrito a medias»:

```javascript
function saveCheckpoint(cp) {
  const tmp = CHECKPOINT_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cp, null, 2));
  fs.renameSync(tmp, CHECKPOINT_PATH);
}
```

La lectura tiene que aguantar dos cosas: que el archivo no exista (nunca se ejecutó antes, o se quiere arrancar de cero) y que el archivo no se pueda parsear. El segundo caso merece cuidado extra: una falla de `JSON.parse` normalmente significa que la escritura anterior misma quedó interrumpida (`saveCheckpoint` es atómico en teoría, pero si matan al proceso antes de que siquiera el archivo `.tmp` se escriba completo, o si el disco mismo tiene un problema, se puede leer mal un archivo a medio terminar de antes del `rename`). En ese punto jamás hay que reiniciar el estado a vacío calladamente y hacer como si nada hubiera pasado: ahí es donde las tareas de verdad se pierden. La jugada correcta es lanzar el error de forma llana, diciéndole a la persona usuaria que este punto de control ya no es confiable y que habría que borrarlo para poder empezar de nuevo, en vez de dejar que el programa adivine su camino de vuelta a un estado entero:

```javascript
function loadCheckpoint() {
  let raw;
  try {
    raw = fs.readFileSync(CHECKPOINT_PATH, "utf8");
  } catch {
    throw new Error(`No se encuentra ${CHECKPOINT_PATH}; no hay nada desde donde hacer --resume`);
  }
  let cp;
  try {
    cp = JSON.parse(raw);
  } catch {
    throw new Error(
      `No se pudo parsear ${CHECKPOINT_PATH}; puede que el archivo haya quedado interrumpido a mitad de escritura. Bórralo y empieza de nuevo sin --resume en vez de seguir usándolo: un punto de control escrito a medias no se puede adivinar de vuelta a su forma.`,
    );
  }
  if (cp.version !== 1) {
    throw new Error(`${CHECKPOINT_PATH} tiene version=${cp.version}; este programa solo acepta version=1 y se niega a cargarlo.`);
  }
  return cp;
}
```

Ya que estás, verifica el campo `version`: si la estructura del punto de control cambia más adelante, un archivo viejo no debería parsearse a la fuerza como si fuera el formato nuevo; mejor negarse a cargarlo que leer un estado medio correcto y medio equivocado. Las dos funciones se probaron con JSON truncado real: dale un `{"version":1,"turns":3,"pendingT` escrito a medias y `loadCheckpoint` lanza exactamente el error de «bórralo y empieza de nuevo» de arriba, sin devolver jamás ningún valor por defecto de apariencia plausible.

### Punto A y punto B: conectarlos al bucle `runAgent`

El esqueleto del bucle del Curso 7 de esta serie no cambió —`while (response.stop_reason === "tool_use")`, `push assistant` → ejecutar herramienta → `push tool_result` → volver a pedirle al modelo—. Esta lección inserta dos puntos de control en el cuerpo del bucle, y dónde van es el punto entero de la lección:

```javascript
while (response.stop_reason === "tool_use") {
  if (turns >= MAX_TURNS) return `Se alcanzó el máximo de ${MAX_TURNS} turnos, deteniéndonos por nuestra cuenta`;
  turns++;

  const toolUseBlock = response.content.find((b) => b.type === "tool_use");
  // —— Punto A: apenas obtenemos la respuesta del modelo, anota la llamada colgante de este turno ——
  saveCheckpoint({
    version: 1, task, turns, tokensUsed, messages,
    pendingToolUse: { id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input },
  });

  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });

  // —— Punto B: los resultados de herramienta están en messages (el registro también en disco), llamada colgante limpiada ——
  saveCheckpoint({ version: 1, task, turns, tokensUsed, messages, pendingToolUse: null });

  response = await client.messages.create({ tools, messages });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
}
```

El punto A va después de que llega `response` y antes de `messages.push({ role: "assistant", ... })`, el momento en que el modelo «nombró una herramienta pero todavía no la ejecutó», y `pendingToolUse` anota ese nombramiento textualmente. El punto B va después de que `runToolUses` termina y el `tool_result` quedó empujado dentro de `messages`; en ese punto este turno está completamente cerrado, y `pendingToolUse` se limpia a `null`. Entre los dos guardados queda intercalado exactamente el tramo de código donde la herramienta se ejecuta de verdad; si el proceso da la casualidad de morir durante ese tramo o justo después, lo que queda en disco es la escena «punto A guardado, punto B no guardado», con `pendingToolUse` no vacío, que es precisamente la señal que la lógica de recuperación está construida para manejar.

Para que este protocolo de una sola llamada colgante (`pendingToolUse` es un objeto, no un arreglo) se sostenga, esta lección diseña la tarea de modo que el modelo nombre exactamente una herramienta por turno: una simplificación deliberada cuya frontera detalla la sección «Proporción».

### El registro de efectos: conectarlo a `runToolUses`

El problema que el registro resuelve es: si una caída aterriza justo entre «la herramienta terminó de ejecutarse de verdad» y «el resultado aterrizó en messages», ¿cómo sabe la reanudación si esta llamada ya se ejecutó y no debe volver a ejecutarse? El enfoque es que, en el momento en que una herramienta tiene éxito, su resultado se escriba aparte en un registro indexado por `tool_use_id` (otra vez con la escritura atómica de archivo temporal más `rename`):

```javascript
function saveEffect(toolUseId, entry) {
  const effects = loadEffects();
  effects[toolUseId] = entry;
  const tmp = EFFECTS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(effects, null, 2));
  fs.renameSync(tmp, EFFECTS_PATH);
}

async function runToolUses(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    let output;
    try {
      output = await toolImpls[block.name](block.input);
    } catch (err) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `Error de ejecución de la herramienta: ${err.message}`, is_error: true,
      });
      continue;
    }
    // El efecto secundario ya ocurrió: aunque la escritura del registro falle, no hay que mentir
    // con is_error (eso haría que el modelo reintente con un tool_use_id nuevo y provoque un
    // efecto secundario duplicado); solo alerta por separado para que lo maneje una persona
    try {
      saveEffect(block.id, { name: block.name, result: output, at: Date.now() });
    } catch (err) {
      console.error(`[falló la escritura del registro] tool_use_id=${block.id}: el efecto secundario ya ocurrió, riesgo de ejecución duplicada al reanudar, por favor revisa a mano`);
    }
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

El orden no se puede invertir: **primero tienes que obtener el resultado real de `toolImpls[block.name](block.input)`, y recién ahí `saveEffect` puede anotarlo**; ejecutar primero, anotar después. El registro anota «esto ocurrió de verdad, y este fue su resultado». Si lo dieras vuelta y anotaras antes de ejecutar, todo lo que podría aterrizar en el registro sería un marcador de posición, y el registro perdería todo el sentido de su promesa de «ya está hecho» (el ejercicio de Nivel 2 te hace reproducir este antipatrón con tus propias manos).

En una ejecución normal y única, `runToolUses` recorre los dos pasos «ejecutar → anotar», porque cada `tool_use_id` aparece por primera vez y no hay nada que consultar. La única llamada colgante que la reanudación tiene que manejar recorre los tres pasos más completos «consultar el registro → ejecutar (si hace falta) → anotar (si se ejecutó)»; el `reconcile` de abajo es la implementación de esos tres pasos, y ambos siguen la misma disciplina: nunca escribir «ya está hecho» en el registro antes de tener un resultado real.

### `reconcile`: la división en tres para una llamada colgante tras una caída

Lo que la reanudación tiene que manejar es ese único (si es que hay) `pendingToolUse` del punto de control. Se corresponde con tres posibilidades:

```javascript
async function reconcile(cp) {
  const pending = cp.pendingToolUse;
  if (!pending) return null; // no hay llamada colgante, simplemente seguir

  const effects = loadEffects();
  const hit = effects[pending.id];

  if (hit) {
    console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} acierto en el registro, reutilizando resultado, sin volver a ejecutar`);
    return { type: "tool_result", tool_use_id: pending.id, content: hit.result };
  }

  if (READ_ONLY.has(pending.name)) {
    console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} fallo en el registro, herramienta de solo lectura, volviendo a ejecutar`);
    const output = await toolImpls[pending.name](pending.input);
    saveEffect(pending.id, { name: pending.name, result: output, at: Date.now() });
    return { type: "tool_result", tool_use_id: pending.id, content: output };
  }

  console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} fallo en el registro con efectos secundarios, no resoluble, agregando is_error`);
  return {
    type: "tool_result", tool_use_id: pending.id, is_error: true,
    content: `Se desconoce el estado de ejecución previo a la reanudación de esta llamada a ${pending.name}: no hay anotación en el registro y, para evitar un efecto secundario duplicado, no se volvió a ejecutar. Por favor verifica por tu cuenta si se completó.`,
  };
}
```

Tres ramas, para tres escenarios que se probaron todos de verdad:

- **Acierto en el registro**: esta es la demostración de la caída del comienzo de la lección; `write_report` de hecho había terminado de ejecutarse y quedado anotado, solo que el `save B` no llegó. Al reanudar, reutiliza directamente el resultado del registro, no vuelvas a ejecutar, evita escribir el reporte dos veces.
- **Fallo en el registro + herramienta de solo lectura**: algo como `read_notes`, una herramienta sin efectos secundarios; caerse antes de que la anotación aterrice no importa, así que basta con volver a ejecutarla una vez para obtener el resultado y, ya que estás, anotar esta corrida en el registro:
  ```text
  [resume][reconcile] tool_use_id=toolu_ro name=read_notes fallo en el registro, herramienta de solo lectura, volviendo a ejecutar
  ```
- **Fallo en el registro + efectos secundarios**: algo como `write_report`, una herramienta que cambia estado externo, cayéndose antes de que la anotación aterrice: no sabes si de verdad se ejecutó (en un sistema de archivos real, el efecto secundario de `write_report` bien podría haber ocurrido ya, solo que sin quedar anotado en el registro). Acá, en vez de adivinar, usa un `tool_result` con `is_error: true` para decirle honestamente al modelo «el estado de esta llamada se desconoce», devolviéndole el juicio a él:
  ```text
  [resume][reconcile] tool_use_id=toolu_side name=write_report fallo en el registro con efectos secundarios, no resoluble, agregando is_error
  ```

Las tres líneas de log son salida real, no inventada: `reconcile` en sí no necesita saber cuál es la tarea; dale un `pendingToolUse` y el estado del registro que le corresponde y cada una de las tres ramas se puede probar de forma independiente.

```agentmentor-check
{
  "id": "sp-zh-06-a-point-necessity",
  "label": "Decidir si conservar solo el punto de control del punto B es seguro",
  "prompt": "Un colega mira las dos posiciones de punto de control de esta lección y propone una simplificación: «Igual cada turno termina con una instantánea completa en el punto B, y el punto B ya guarda todos los campos que guarda el punto A, así que saquemos el punto A y guardemos un solo punto de control al final del bucle, después de que el resultado de herramienta está en messages y el registro está escrito, ahorrándonos una escritura a disco». ¿Se sostiene esta simplificación?",
  "whyHere": "Recién se cubrió la división en tres de reconcile, así que justo acá una propuesta concreta de «sacar el punto A» pone a prueba si quien lee entiende de verdad qué anota el punto A y por qué el punto B por sí solo no puede llenar ese hueco.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No se sostiene: si la caída aterriza entre «el modelo nombró una herramienta» y «el resultado quedó anotado», un punto de control que vive solo en el punto B no sabe nada de esa llamada, así que al reanudar no hay ningún tool_result que producir ni ninguna anotación de registro que consultar",
      "correct": true,
      "feedback": "Correcto. El protocolo exige que cada tool_use vuelva emparejado con un tool_result. Si el punto de control solo guarda en el punto B y la caída aterriza en la ventana entre «el modelo dio una llamada a herramienta» y «el resultado quedó confirmado», no hay nada en disco que diga «este turno alguna vez nombró una herramienta»: no es que al registro le falte una anotación, es que el punto de control mismo no sabe que la llamada colgante existió. reconcile no tiene nada que consultar ni ninguna rama que tomar. El punto A anota la llamada apenas llega la respuesta, precisamente para que lo que sea que pase dentro de esa ventana quede asentado."
    },
    {
      "id": "b",
      "text": "Se sostiene: el punto B ya guarda todos los campos que guarda el punto A, así que sacar el punto A cuesta apenas una escritura a disco de más sin ninguna pérdida de funcionalidad, y lo puedes quitar del bucle sin riesgo",
      "correct": false,
      "feedback": "Tratar esto como «un archivo menos que escribir» pasa por alto que el punto A y el punto B no guardan lo mismo: el punto A anota «el modelo acaba de nombrar esta herramienta, y todavía está pendiente», el punto B anota «este turno está hecho y quedó atrás». Sacar el punto A no pierde una escritura redundante, pierde la capacidad de asentar toda la ventana mientras la herramienta se ejecuta, y esa ventana es exactamente donde es más probable que maten al proceso."
    },
    {
      "id": "c",
      "text": "No se sostiene, pero la razón es que los puntos de control del punto B no se escriben con suficiente frecuencia: habría que guardar cada tanto varias instantáneas extra del punto B mientras la herramienta se ejecuta, como red de contención",
      "correct": false,
      "feedback": "El problema no es cada cuánto se guarda el punto B: el contenido del punto B solo refleja un estado, «este turno está completo». Por muchas instantáneas del punto B que tomes, todas anotan la misma información «a posteriori» y nunca pueden reconstruir el estado intermedio de «la herramienta se está ejecutando y no terminó». Lo que falta no es frecuencia, es un punto de guardado dedicado a asentar el hecho mismo de «recién nombrada, todavía no terminada»."
    }
  ]
}
```

### El punto de entrada: `--resume` en `main()`

Por último, el punto de entrada. `main()` toma exactamente una decisión: si la línea de comandos trae `--resume`. Si la trae, recupera pasando por `loadCheckpoint()`; si no la trae, limpia los archivos de punto de control y de registro que quedaron de la vez anterior y arranca de cero. Esta limpieza garantiza que «empezar de nuevo sin `--resume`» sea siempre una apertura limpia, nunca contaminada por una escena a medio terminar de una corrida previa:

```javascript
async function main() {
  const resume = process.argv.includes("--resume");
  const task = "Convierte sales-notes.txt en un reporte breve y escríbelo en report.txt.";
  const tools = [];

  const client = resume ? makeStubClient([R4]) : makeStubClient([R1, R2, R3]);

  try {
    const result = await runAgent(client, task, tools, { resume });
    console.log(`[done] ${result}`);
  } catch (err) {
    if (err instanceof SimulatedCrash) {
      console.log(`[kill] ${err.message}`);
      process.exit(137);
    }
    throw err;
  }
}
```

Dentro de `runAgent` hay dos caminos que se corresponden: cuando `opts.resume` es verdadero llama a `loadCheckpoint()`, ejecuta `reconcile`, empuja el resultado conciliado (si lo hay) dentro de `messages` y guarda un punto de control del punto B, y después le manda la solicitud al modelo como siempre; cuando es falso hace `fs.rmSync` del punto de control y del registro viejos y arranca con `messages` vacío. En el `agent.js` real, el cliente del modelo se cambia por el `client.messages.create({ model, max_tokens, tools, messages })` de `@anthropic-ai/sdk`, y nada más de la estructura cambia.

## Citar el protocolo

Ninguna de las dos decisiones de diseño de esta lección se fijó arbitrariamente.

Cuando el registro falta y `reconcile` no puede estar seguro del estado, elige agregar un `tool_result` con `is_error: true` en vez de saltear en silencio, apoyándose en el requisito duro del protocolo sobre el emparejamiento de bloques de contenido: cada `tool_use` tiene que volver con un `tool_result` que le corresponda, devueltos todos juntos, y cada uno reclamado por su `tool_use_id`[^S4]. Saltear el guardado del punto A dejaría al flujo de reanudación sin enterarse de que la llamada siquiera ocurrió, así que no podría satisfacer esa regla de emparejamiento en absoluto; el sentido entero de que `reconcile` exista es garantizar que, con acierto o con fallo en el registro, la llamada colgante termine con un `tool_result` emparejado.

Elegir «reanudar y seguir» antes que «lanzar un error y empezar de nuevo» se hace eco de lo que el equipo de ingeniería de Anthropic describió en la retrospectiva sobre su sistema de investigación: cuando ocurren errores no puedes simplemente reiniciar, porque "restarts are expensive and frustrating for users" (los reinicios son caros y frustrantes para las personas usuarias), así que en cambio "built systems that can resume from where the agent was when the errors occurred"[^S1] (construyeron sistemas que pueden reanudar desde donde estaba el agente cuando ocurrieron los errores). La misma retrospectiva señala que la adaptabilidad de un agente se puede emparejar con salvaguardas deterministas, en vez de enfrentarse a ellas, combinando "the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints"[^S1] (la adaptabilidad de los agentes de IA construidos sobre Claude con salvaguardas deterministas como la lógica de reintentos y los puntos de control regulares). Los puntos de control atrapan la falla determinista —«el proceso murió»—, mientras que la adaptabilidad del modelo maneja el tipo de caso que el código no puede decidir en duro, como «el registro no es resoluble». La rama `is_error` de `reconcile` es donde ambos se encuentran: le dice al modelo la verdad sobre el estado desconocido y lo deja decidir si verificar o reintentar, y "letting the agent know when a tool is failing and letting it adapt works surprisingly well"[^S1] (hacerle saber al agente cuándo una herramienta está fallando y dejarlo adaptarse funciona sorprendentemente bien).

## El arnés de verificación

Las dos demostraciones de terminal de esta lección no dependen de matar de verdad un proceso para ver qué pasa: así el momento de la caída sería distinto en cada corrida, y no podrías hacer una afirmación puntual como «la caída ocurrió después de la enésima llamada a herramienta, y el comportamiento de recuperación es correcto». El enfoque es cambiar el cliente del modelo por un stub que juega sus cartas en un orden fijo: una cola de respuestas que, en cada llamada a `messages.create`, entrega la siguiente respuesta preescrita en secuencia, y lanza una excepción sin más si sigues llamando después de que la cola se vació. Así, qué herramienta llama la tarea en qué turno, y cuándo cierra el modelo, son todas constantes fijas que no se corren por culpa de una llamada real.

«Matar al proceso» es un `crashPoint(label)` controlado por una variable de entorno: cada vez que `runToolUses` termina una escritura en el registro, cose «cuál escritura es esta» en una etiqueta de texto, la compara contra la variable de entorno `CRASH_AFTER` y, si coincide, lanza una excepción dedicada `SimulatedCrash`. Esto convierte «caerse después de la enésima llamada a herramienta» en un entero que puedes especificar con precisión, en vez de un evento al azar a merced del temporizado. `main()` atrapa solo esta única excepción en la capa más externa, imprime una sola línea de log `[kill]` y sale con `137` (el código de salida convencional de «matado por `SIGKILL`»), de modo que la demostración se lee como una muerte de proceso real y no como una traza de pila fea.

Este método de «fijar el contenido con una cola de respuestas, fijar el conteo de caídas con una etiqueta» es la misma idea que usó la Lección 6 del Curso 8 de esta serie, «Ingeniería de contexto: gastar una atención finita donde más rinde», para verificar la ingeniería de contexto: fija primero como cantidades constantes las cosas que de otro modo serían no deterministas (qué dice el modelo esta vez, dónde muere el proceso esta vez), y recién entonces el comportamiento de recuperación se puede afirmar línea por línea en vez de salir distinto en cada corrida. Así fue como esta lección verificó las tres ramas —«acierto en el registro, no volver a ejecutar», «fallo en el registro con herramienta de solo lectura, volver a ejecutar directamente», «fallo en el registro con herramienta de efectos secundarios, agregar `is_error`»— más la tolerancia de `loadCheckpoint` a un archivo truncado, cada una comprobada una por una con una corrida real de `node` y no razonada solo sobre el papel.

## Proporción: no toda tarea necesita esto

La maquinaria soldada en esta lección —dos puntos de control, un registro, un `reconcile` de tres ramas— está pensada para tareas largas que corren muchos turnos seguidos y tienen efectos secundarios en el medio. En una tarea chica que termina en unos segundos y que simplemente se puede volver a ejecutar si falla, puede no valer la pena cargar con todo este aparato de E/S a disco y máquina de estados; acá puedes tomar prestada la misma proporción que citó el Curso 7 de esta serie, «Fundamentos del arnés de agente: bucles y control»: lo que vale la pena considerar es que "you should consider adding complexity only when it demonstrably improves outcomes"[^S3] (habría que considerar agregar complejidad solo cuando mejora los resultados de forma demostrable). Esta no es una regla dura de «tienes que hacerlo así», es más bien una pregunta para hacerte antes de arrancar: ¿esta tarea es de verdad lo bastante larga, lo bastante importante, como para que valga la pena mantenerle un punto de control?

La implementación de esta lección también traza dos fronteras explícitas, que vale la pena decir en voz alta para que no la tomes como «apréndelo y tíralo directo a producción»:

- Cada turno maneja exactamente un `pendingToolUse` colgante, lo que coincide con la tarea de demostración donde el modelo nombra una herramienta por turno. En un entorno real, una sola respuesta del modelo bien podría cargar varios bloques `tool_use` concurrentes (el `runToolUses` del Curso 7 de esta serie los ejecuta en paralelo con `Promise.all`); extender el protocolo de una sola llamada colgante de esta lección a un conjunto de llamadas colgantes significa convertir `pendingToolUse` de un objeto en un arreglo y ejecutar `reconcile` sobre cada uno. Esta lección dejó afuera esa capa de complejidad a propósito, para primero dejar clara la lógica de conciliación de una sola llamada colgante.
- El punto de control y el registro de esta lección gobiernan una cosa: «un proceso, ejecutando una tarea». Cómo comparten estado varias sesiones, si varios procesos que tocan el mismo punto de control a la vez entran en conflicto, cómo se garantiza la consistencia entre máquinas: eso pertenece a la concurrencia multisesión y a la consistencia distribuida, y no está en esta lección ni en el alcance de este curso.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Un manual de simulacro para el momento de la caída

Dentro de un turno, los puntos de control de esta lección pueden atrapar como mucho tres «momentos de caída»: ① el punto A recién guardado, la herramienta todavía no empezó a ejecutarse; ② la función de implementación de la herramienta ya terminó, pero el registro todavía no se escribió; ③ el punto B recién guardado. Contra el `saveCheckpoint` / `saveEffect` / `reconcile` que implementa esta lección, escribe cada uno de esos momentos con claridad: después de la caída, en qué estado quedan `checkpoint.json` y `effects.json` respectivamente; al hacer `--resume`, en qué rama aterriza `reconcile`; y si lo que quedó interrumpido fue una herramienta con efectos secundarios, no de solo lectura (digamos `write_report`), si los estados observables en disco de ① y ② son iguales, y si el comportamiento de recuperación es el mismo, y si lo son, qué te dice eso.

<!-- rubric -->
- Momento ① (punto A guardado, herramienta no ejecutada): el `pendingToolUse` de `checkpoint.json` es la llamada de este turno; `effects.json` no tiene anotación para este `tool_use_id`; al reanudar `reconcile` toma la rama de «fallo en el registro»: una herramienta de solo lectura se vuelve a ejecutar directamente, una que no es de solo lectura recibe `is_error`
- Momento ② (herramienta terminó de ejecutarse, registro no escrito): el estado de `checkpoint.json` es exactamente igual al de ① (`pendingToolUse` sigue siendo el guardado en el punto A), y `effects.json` tampoco tiene anotación, igual que ①, así que al reanudar `reconcile` toma exactamente la misma rama que ①; hay que señalar que «el código no puede distinguir ① de ②»: en ② la herramienta de hecho terminó de ejecutarse (digamos que `report.txt` ya está escrito), pero como el registro no se escribió, la reanudación lo trata como estado desconocido, y una herramienta que no es de solo lectura recibe `is_error` en vez de reutilizarse directamente, que es exactamente por qué el registro se escribe en el instante en que una herramienta tiene éxito, para achicar esta ventana de incertidumbre todo lo posible
- Momento ③ (punto B guardado): el `pendingToolUse` de `checkpoint.json` es `null`, `messages` ya contiene el `tool_result` de este turno; `effects.json` tiene la anotación que corresponde; al reanudar, `reconcile(cp)` devuelve `null` de inmediato porque `pending` está vacío, `runAgent` no hace el paso de «rellenar» y le vuelve a pedir al modelo directamente con los `messages` completos

<!-- answer -->
Los momentos ① y ② dejan exactamente el mismo estado en disco: el `pendingToolUse` de `checkpoint.json` sigue siendo en ambos la descripción de la llamada guardada en el punto A, y `effects.json` no tiene anotación para este `tool_use_id` en ninguno de los dos (la única diferencia es que en ② la herramienta de hecho terminó de correr, solo que ese hecho todavía no quedó escrito en ningún lado persistente). Como `reconcile` solo mira el estado en disco y no sabe qué pasó en memoria, ① y ② disparan exactamente la misma rama: no puede leer la herramienta desde el registro, así que si la juzga de solo lectura simplemente la vuelve a ejecutar una vez; si la juzga con efectos secundarios no se atreve a adivinar y le agrega al modelo un `tool_result` con `is_error: true` de vuelta; mejor entregar información incompleta que adivinar una respuesta que podría causar un efecto secundario duplicado.

El momento ③ es un camino completamente distinto: `pendingToolUse` ya es `null`, `reconcile` devuelve `null` apenas entra en la función, la verificación `if (reconciled)` de `runAgent` es falsa, saltea el bloque entero de «agregar un resultado de herramienta, guardar otro punto B», y va directo a la siguiente solicitud al modelo con los `messages` ya completos; en lo que respecta al flujo de recuperación, este turno quedó cerrado hace rato.

<!-- hint -->
Piensa primero por separado en «lo que el código puede ver» y «lo que de verdad pasó en el mundo»: en el momento ② la herramienta claramente terminó de ejecutarse, pero mientras ese hecho no se haya escrito en `checkpoint.json` o en `effects.json`, `reconcile` no tiene forma de saber que ocurrió.

<!-- hint -->
Decidir en qué rama aterriza solo necesita dos valores de los dos archivos en disco: si `cp.pendingToolUse` es `null`, y si `effects.json` tiene este `tool_use_id`. Escribe primero esos dos valores para cada uno de ①②③ y la rama se resuelve sola.

### Nivel 2: Encontrar el error de orden donde el registro se escribió al revés

El reporte de incidente dice: «La persona usuaria interrumpió una tarea y, después de `--resume`, una herramienta quedó salteada: el log la mostraba como "ya hecha", pero esta herramienta nunca se ejecutó de verdad, y el archivo que debía escribir simplemente no existe». Desenterraste el `runToolUses` que estaba corriendo en producción en ese momento y encuentras una diferencia con la versión de esta lección:

```javascript
async function runToolUses_prod(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    saveEffect(block.id, { name: block.name, result: null, at: Date.now() });
    const output = await toolImpls[block.name](block.input);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

Encuentra este error de orden, explica con claridad por qué causa que «una herramienta que claramente nunca se ejecutó se trate como hecha», y corrige el orden. Después, siguiendo el método de la sección «El arnés de verificación» de esta lección, escribe un script chico que lo reproduzca: inserta un punto de caída simulada controlado por variable de entorno entre `saveEffect` y `toolImpls[block.name](...)`, y ejecútalo de verdad con `node`; con el orden equivocado, el registro ya sostiene una anotación con `result: null` antes de la caída; con el orden corregido, el mismo punto de caída no deja ninguna anotación para este `tool_use_id` en el registro.

<!-- rubric -->
- Señala el bug: `saveEffect` está puesto antes de `toolImpls(...)`, punto en el cual la herramienta todavía no se ejecutó, así que no puede haber un `output` real: solo se puede meter un marcador de posición (como `result: null`)
- Explica la consecuencia: si la caída da la casualidad de aterrizar después de la escritura del registro pero antes de que la herramienta termine de ejecutarse de verdad, al reanudar `reconcile` consulta el registro, acierta con esta anotación de marcador de posición y la juzga «acierto en el registro, reutilizar resultado, no volver a ejecutar», tratando como hecha una llamada que nunca se ejecutó de verdad, usando un resultado `null` para satisfacer el requisito de emparejamiento del `tool_result`, en vez de que el registro refleje honestamente «todavía no ejecutada»
- Da el orden correcto: hay que hacer `await toolImpls[block.name](block.input)` para obtener primero el resultado real y, solo después de que tiene éxito, llamar a `saveEffect` para escribir ese resultado real en el registro, y después empujar el `tool_result`; el orden de ejecutar y anotar no se puede invertir
- Verifica con un script: inserta un punto de caída controlado entre `saveEffect` y `toolImpls`, ejecuta el orden equivocado y el corregido con `node`, y observa si `effects.json` ya tiene escrito este `tool_use_id` antes de la caída: con el orden equivocado sí (con `result` como marcador de posición), después de la corrección no

<!-- answer -->
El bug es que `saveEffect(block.id, { ..., result: null, ... })` está escrito antes de `const output = await toolImpls[block.name](block.input)`. En ese punto la herramienta todavía no fue llamada, la función no tiene ni idea de cuál es el resultado real, y solo puede meter un marcador de posición (acá `null`) para reservar el `tool_use_id`. Si al proceso da la casualidad de que lo matan después de la escritura del registro pero antes de que `toolImpls` termine de verdad, el registro en disco muestra que «este `tool_use_id` ya tiene una anotación», pero la herramienta correspondiente nunca se ejecutó de verdad. Al reanudar, `reconcile` solo verifica si el registro tiene este id, lo encuentra, y lo juzga «acierto en el registro» y reutiliza esa anotación; así, una llamada que nunca se ejecutó se maneja como una llamada hecha con resultado `null`, que es exactamente la causa detrás del «herramienta salteada, el log dice hecha, pero el archivo simplemente no existe» del reporte de incidente.

La corrección es dar vuelta el orden a «ejecutar primero, anotar después»:

```javascript
async function runToolUses(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    const output = await toolImpls[block.name](block.input); // ejecutar primero, obtener el resultado real
    saveEffect(block.id, { name: block.name, result: output, at: Date.now() }); // después anotar
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

La verificación la puedes escribir siguiendo la línea de «El arnés de verificación» de esta lección: escribe un script mínimo que maneje un solo `block`, inserta un `crashPoint` que lea una variable de entorno después de `saveEffect` (la versión equivocada) o después de `toolImpls` (la versión correcta), ejecuta `node` dos veces, y compara si `effects.json` tiene este `tool_use_id` después de la caída: con el orden equivocado ya hay escrita una anotación con `result: null` antes de la caída, con el orden correcto no hay nada en el registro antes de la caída.

<!-- hint -->
Que exista una anotación en el registro se supone equivalente a «esta herramienta terminó de correr de verdad, y este es su resultado real». Piénsalo al revés: si el paso de anotar ocurre antes de la ejecución, ¿esa anotación todavía puede garantizar eso?

<!-- hint -->
Construir el script de verificación no requiere reconstruir todo `runAgent`; solo necesitas sacar aparte la ejecución de este único `block`, insertar un `throw` controlado por variable de entorno y, después de correrlo, leer nomás el archivo de registro para ver si este id está ahí.

<!-- /exercises -->

## Resumen

- El punto de control guarda dos veces por turno: el punto A anota el `pendingToolUse` colgante después de que llega la respuesta del modelo, el punto B lo limpia a null después de que el resultado de herramienta aterriza en `messages`; guardar solo el punto B vuelve completamente invisible en el punto de control la ventana entre «el modelo nombra una herramienta» y «el resultado queda anotado» y, como cada `tool_use` tiene que volver emparejado con un `tool_result`[^S4], el punto A es exactamente lo que hace rastreable la llamada colgante dentro de esa ventana
- El registro de efectos secundarios anota por `tool_use_id`, y su disciplina es «ejecutar primero, anotar después»: anotar tiene como premisa tener ya un resultado real; inviértelo y anotas mal «todavía no ejecutada» como «ya hecha»
- La división en tres de `reconcile` maneja la llamada colgante al reanudar: acierto en el registro, reutilizar y no volver a ejecutar; fallo en el registro pero de solo lectura, volver a ejecutar directamente; fallo en el registro con efectos secundarios, no adivinar y agregar un `tool_result` con `is_error` que le devuelva el estado honestamente al modelo. Esto se hace eco de las dos lecciones de ingeniería de «ante un error no puedes empezar de cero, tienes que reanudar desde donde golpeó» y «hazle saber al modelo que una herramienta falló, déjalo adaptarse, y funciona sorprendentemente bien»[^S1], y se alinea con la idea de «salvaguardas deterministas emparejadas con la adaptabilidad del modelo»[^S1]
- La maquinaria de punto de control y registro no es gratis; agrégala solo cuando la complejidad mejora los resultados de forma demostrable[^S3]; la implementación de esta lección gobierna solo «un proceso ejecutando una tarea», y la concurrencia multisesión y la consistencia distribuida no están entre sus preocupaciones ni en el alcance de este curso

Con esto terminaste este curso. Partiendo del juicio de que «los agentes tienen estado y los errores se componen», trabajaste todo el camino a través de qué debería guardar un punto de control, cuándo escribirlo en disco, cómo manejar una llamada colgante al reanudar, cómo la idempotencia respalda la recuperación y cómo un punto de control puede servir además para rebobinar y bifurcar, hasta esta lección, donde los soldaste a mano en un arnés que corre de verdad, que de verdad lo matan y que de verdad retoma y termina. Lo que tienes ahora no es apenas un conjunto de conceptos, sino un tramo de código verificado con ejecuciones reales de `node`. Conéctalo a tu propio arnés y, la próxima vez que de verdad lo maten, va a retomar justo desde donde lo dejó.
