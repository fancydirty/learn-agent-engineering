# Lección 4: Efectos secundarios e idempotencia: qué herramientas es seguro volver a ejecutar al reanudar

> Objetivos de aprendizaje:
> - Explicar por qué repetir al reanudar te entrega por defecto una semántica de ejecución **at-least-once**, nunca exactly-once
> - Juzgar si una operación de herramienta es idempotente, y detectar los efectos secundarios que causan daño real en cuanto se ejecutan dos veces
> - Diseñar e implementar un **registro de efectos** indexado por `tool_use_id`, para que una llamada colgante al reanudar consulte el registro antes de decidir si de verdad ejecuta
>
> Requisitos: Leíste las Lecciones 2 y 3 y entiendes las reglas de conciliación de un `pendingToolUse` colgante en `checkpoint.json` (Lección 3); conoces el conjunto de herramientas `HIGH_IMPACT` y la compuerta de aprobación previa a la ejecución del Curso 7 de esta serie, «Fundamentos del arnés de agente: bucles y control» | Anterior: [Lección 3 <<](./03-resume-from-checkpoint.md) | Siguiente: [Lección 5 >>](./05-rewind-and-fork.md)

## Reanudar te da at-least-once: la Lección 3 dejó sin resolver las herramientas de alto impacto

La Lección 3 te enseñó a leer `pendingToolUse` desde `checkpoint.json` y a usarlo para traer de vuelta al bucle una llamada colgante —una donde la caída aterrizó entre la ejecución de la herramienta y la escritura del registro—. La regla de conciliación de entonces era: las herramientas de solo lectura simplemente se vuelven a ejecutar y, para las de alto impacto que no puedes determinar, se agrega un `tool_result` con `is_error` para que el bucle deje de estar trabado y la pregunta vuelva a una persona. Es un repliegue honesto, y también es un problema sin resolver. «No poder determinarlo» significa que la tarea no puede continuar por su cuenta, así que cada caída sobre una herramienta de alto impacto necesita a alguien vigilando.

La raíz es esta: reanudar, por su propia naturaleza, te da una semántica de ejecución **at-least-once**. El proceso puede morir después de que una herramienta tuvo éxito de verdad pero antes de que el resultado se escriba de vuelta en `messages` o quede confirmado en un punto de control; y en ese momento, «¿esta herramienta se ejecutó o no?» es una pregunta que `checkpoint.json` por sí solo no puede responder. Para una herramienta de solo lectura como `read_file`, no saberlo no te cuesta nada: la lees una vez de más y el resultado es el mismo. Para `send_email`, `create_ticket` o una transferencia de fondos, no saberlo es un incidente: volver a ejecutar significa que el destinatario puede recibir dos correos idénticos, y que un ticket duplicado puede aparecer en el sistema de la nada.

No es un problema nuevo. Antes en este curso dejamos establecido que los agentes tienen estado y los errores se componen[^S1], y ejecutar dos veces un efecto secundario que debía ocurrir una sola vez es una de las formas concretas que toma esa composición. El error no se detiene en «lo ejecutamos una vez de más»: rueda aguas abajo montado sobre ese efecto secundario extra. Esta lección cierra el hueco que la Lección 3 dejó abierto: primero introduce la **idempotencia** como concepto y después le atornilla un **registro de efectos** al bucle de reanudación, para que «no se puede determinar» se convierta en «sí se puede determinar».

## Qué significa idempotente: una ejecución o diez, el mismo efecto

**Idempotente** es una operación que produce el mismo efecto final la ejecutes una vez o muchas. Fíjate que esto va sobre el *efecto* —el estado final que la operación deja atrás en el mundo exterior (archivos, bases de datos, bandejas de entrada)—, no sobre el valor que literalmente devuelve cada llamada.

Para juzgar si una herramienta es idempotente alcanza con una pregunta: «Si esta operación se ejecutara calladamente una vez de más, ¿el mundo exterior terminaría con algo de más, o en un estado distinto?». Pasa estos pequeños ejemplos por esa pregunta y la diferencia aparece de inmediato.

```javascript
// Idempotente: leer un archivo no tiene efectos secundarios; llámalo la cantidad de
// veces que quieras, lo que hay en disco es lo mismo
async function readFileContent(path) {
  return fs.readFile(path, "utf8");
}

// No idempotente: cada llamada agrega de verdad una fila más al arreglo
function appendRow(sheet, row) {
  sheet.rows.push(row);
}

// Idempotente: por muchas llamadas que haya, la línea 42 converge al mismo valor
function setLine(doc, lineNo, text) {
  doc.lines[lineNo] = text;
}

// No idempotente: cada llamada agrega de verdad un mensaje más a la bandeja del destinatario
async function sendEmail(to, subject, body) {
  return mailer.send({ to, subject, body });
}
```

`readFileContent` es idempotente por naturaleza porque no tiene ningún efecto secundario: no hay nada «que quede atrás», propiamente hablando. `setLine` también es idempotente, y sí muta estado de verdad, pero la forma en que muta es **sobrescribiendo**: llámalo una vez y la línea 42 es X, llámalo diez veces y la línea 42 sigue siendo X. El estado final no varía con la cantidad de llamadas. `appendRow` y `sendEmail` no son idempotentes, y en ambos casos por la misma razón: su efecto es **acumulativo**, cada llamada agrega de verdad una cosa más al mundo exterior, así que la cantidad de llamadas aparece directamente en el estado final.

Sostén esa línea divisoria: las escrituras que sobrescriben suelen ser idempotentes, las que agregan al final normalmente no; las lecturas y las operaciones de «consultar primero y después decidir si actuar» suelen ser idempotentes, mientras que las inserciones lisas e incondicionales normalmente no. El registro de efectos de la sección siguiente existe justamente para atrapar las operaciones que no son idempotentes y que no se pueden rediseñar para que lo sean.

## El registro de efectos: anotar qué efectos secundarios ya ocurrieron

La Lección 2 te enseñó a guardar en un punto de control la escena en curso del bucle —`messages`, los contadores, la llamada a herramienta que todavía no quedó anotada—, para que una caída se pueda retomar en el lugar. Pero un punto de control responde «a qué paso del bucle llegamos», no «el efecto secundario de ese paso ocurrió de verdad». Durante la operación normal los dos se mueven casi en sincronía, pero en cuanto una caída aterriza en el hueco entre ambos, dejan de coincidir, que es exactamente la razón por la que la Lección 3 tuvo que dejar sin resolver la conciliación de alto impacto.

Cerrar ese hueco requiere un **registro de efectos**: anotar en disco, aparte del punto de control, qué efectos secundarios ya ocurrieron. La estructura es simple, un mapa indexado por `tool_use_id`:

```javascript
// La forma de effects.json
{
  "toolu_01abc": {
    "name": "create_ticket",
    "result": { "id": "T-1", "title": "Caída del servicio reportada por el cliente" },
    "at": "2026-08-26T09:12:03.000Z"
  }
}
```

El momento en que se escribe el registro importa muchísimo: escríbelo en el instante en que la función de la herramienta tiene éxito de verdad y devuelve un resultado, y escríbelo un instante *antes* que el punto de control del «punto B» de la Lección 2 (la escritura de rutina que ocurre después de que el resultado de herramienta aterriza en `messages`). La razón es directa. Si la caída aterriza dentro de la ventana angosta entre «la herramienta tuvo éxito» y «el punto de control del punto B terminó de escribirse», ese punto de control nunca tuvo la oportunidad de dejar constancia de que esto pasó, y al reanudar lo único que puede decirte la verdad es el registro que terminó de escribirse antes. La escritura del registro también tiene que usar la escritura atómica de `.tmp` + `rename` de las Lecciones 2 y 3, por la misma razón: un archivo de registro escrito a medias es más peligroso que no tener registro, porque te hace creer en un efecto secundario que en realidad nunca se completó.

```javascript
import { promises as fs } from "node:fs";

async function loadEffects(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return {}; // Archivo ausente o corrupto: trátalo como registro vacío, no bloquees la reanudación
  }
}

async function saveEffects(path, effects) {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(effects, null, 2));
  await fs.rename(tmp, path); // Reemplazo atómico, no queda ningún archivo escrito a medias
}
```

Con un registro en la mano, la regla de conciliación al reanudar sube de categoría: del «no se puede determinar» de la Lección 3 al «sí se puede determinar». Toma el `pendingToolUse` de `checkpoint.json` y busca su `id` en el registro. **Acierto**: el efecto secundario de verdad ocurrió, así que saca del registro el `result` guardado, úsalo para rellenar un `tool_result` y no vuelvas a ejecutar nunca. **Fallo**: esta llamada o bien nunca arrancó o bien murió a mitad de camino sin tener éxito, así que ejecutar es seguro. La regla vale para toda herramienta; lo que pasa es que, para las idempotentes, la consulta da lo mismo en cualquier caso. De lo que sí depende todo es de las operaciones que causan daño cuando se repiten.

Hay acá una idea que vale la pena enunciar por sí sola: **`tool_use_id` ya es una clave de idempotencia.** Cada vez que el modelo nombra una herramienta, lleva consigo "A unique identifier for this particular tool use block"[^S4] (un identificador único para este bloque de uso de herramienta en particular), que es la definición textual del campo `id` en la especificación oficial. Si ese mismo nombramiento se ve una segunda vez por una repetición al reanudar, el `id` no cambia. Eso es precisamente lo que le permite al registro reconocer «esta llamada» y «aquella llamada anterior» como uno y el mismo evento, sin que tengas que inventar un esquema de deduplicación propio.

```agentmentor-check
{
  "id": "sp-zh-04-blind-retry",
  "label": "Una llamada send_email colgante: ¿el modelo puede corregirse solo tras volver a ejecutarla?",
  "prompt": "Al reanudar, tu arnés encuentra una llamada send_email colgante en checkpoint.json: la caída aterrizó justo después de que el correo salió y antes de que el resultado se escribiera en el registro. Una colega dice: «Vuelve a ejecutarla a ciegas y ya. El modelo va a ver el resultado que regresa y se va a corregir solo». ¿Se sostiene?",
  "whyHere": "Acabas de aprender la regla de conciliación del registro. Esto comprueba si de verdad entiendes que «volver a ejecutar» y «que el modelo se corrija solo» son dos cosas distintas, que es la razón por la que el registro existe, en lugar de ser un paso extra opcional que podrías saltear.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Se sostiene: en cuanto el modelo vea regresar el resultado «correo enviado» y note que no cuadra con lo que recuerda haber hecho, va a señalar el duplicado y se va a hacer cargo",
      "correct": false,
      "feedback": "Todo lo que el modelo puede ver es lo que regresó en este único tool_result. No tiene ningún canal independiente para percibir si este correo ya se había enviado una vez, ni forma de meter la mano en la bandeja del destinatario y retirar la segunda copia. Los efectos secundarios ocurren en el mundo exterior, y la salida del modelo no puede cambiar lo que ya pasó allí: como mucho puede pedir disculpas en su frase siguiente. Los dos correos igual salieron."
    },
    {
      "id": "b",
      "text": "No se sostiene, pero el arreglo correcto es que el arnés saltee toda llamada a herramienta colgante al reanudar y le entregue cada una a una persona para que la resuelva",
      "correct": false,
      "feedback": "Eso es al revés. Saltear todo trata a todas las herramientas como peligrosas, cuando la mayoría de las llamadas colgantes o bien son de solo lectura (riesgo cero al volver a ejecutarlas) o bien de verdad nunca tuvieron éxito (volver a ejecutarlas es la única jugada correcta). Degrada la reanudación a «cada caída necesita a una persona» y tira por la borda todo el sentido de continuar automáticamente: resuelve por evitación generalizada un problema que debía zanjar la evidencia."
    },
    {
      "id": "c",
      "text": "No se sostiene: el modelo solo ve el resultado que devuelve esta llamada y no puede percibir el duplicado que ya aterrizó en el mundo exterior; el arnés tiene que consultar el registro de efectos por tool_use_id antes de ejecutar",
      "correct": true,
      "feedback": "Correcto. El mundo del modelo son los tool_results que ve, y no tiene otros ojos con los que mirar cuántos mensajes hay ahora mismo en la bandeja del destinatario. Lo único que puede ver eso, y lo único que puede frenar el duplicado, es el arnés: antes de llamar de verdad a la herramienta, busca el tool_use_id de esta llamada en el registro de efectos. Si hay acierto, reutiliza el resultado guardado y no vuelvas a ejecutar; solo si hay fallo es seguro ejecutar. Esa compuerta no se apoya en el juicio del modelo, se apoya en la evidencia definida que el registro dejó en disco."
    }
  ]
}
```

## Dos compuertas en capas: la aprobación pregunta «¿deberíamos?», el registro pregunta «¿ya lo hicimos?»

El Curso 7 de esta serie, «Fundamentos del arnés de agente: bucles y control», le puso a `runToolUses` una compuerta de aprobación: antes de que una herramienta de alto impacto se ejecute de verdad, imprime lo que está por pasar, espera a que una persona confirme y recién ahí la deja pasar[^S3]. Esa compuerta frena la pregunta «¿esto debería hacerse?». El registro de efectos de esta lección frena una pregunta distinta: «¿esto ya se hizo?». Las dos compuertas preguntan cosas diferentes, pero se ubican en el mismo lugar: ambas encajadas en el momento posterior a que el modelo nombró una herramienta y anterior a que la herramienta se ejecutara de verdad. Ninguna de las dos deja que la función de la herramienta se ejecute hasta haber verificado.

Apila las dos y `runToolUses` queda así:

```javascript
const HIGH_IMPACT = new Set(["send_email", "create_ticket", "delete_file"]);

async function runToolUses(content, toolImpls, opts = {}) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const effects = await loadEffects(opts.effectsPath);
  const results = [];

  for (const block of toolUseBlocks) {
    // Compuerta de idempotencia: ¿esta llamada ya ocurrió de verdad?
    const recorded = effects[block.id];
    if (recorded) {
      results.push({ type: "tool_result", tool_use_id: block.id, content: recorded.result });
      continue; // Acierto en el registro: reutiliza el resultado guardado, nunca vuelvas a ejecutar
    }

    // Compuerta de aprobación: las operaciones de alto impacto se confirman antes de ejecutar (Curso 7)
    if (HIGH_IMPACT.has(block.name)) {
      const ok = await opts.approve?.(block.name, block.input);
      if (!ok) {
        results.push({
          type: "tool_result", tool_use_id: block.id,
          content: "La persona usuaria rechazó esta operación de alto impacto; no se ejecutó.", is_error: true,
        });
        continue; // Saltea la ejecución, pero igual devuelve un tool_result para no dejar la llamada colgante
      }
    }

    let output;
    try {
      output = await toolImpls[block.name](block.input);
    } catch (err) {
      // La herramienta misma falló: no ocurrió ningún efecto secundario, así que reporta is_error honestamente
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `Falló la ejecución de la herramienta: ${err.message}`, is_error: true,
      });
      continue;
    }

    // Si llegamos acá, el efecto secundario ocurrió de verdad. Aunque la escritura del registro de abajo
    // falle, jamás hay que reportarlo mal como una falla de ejecución: en cuanto devolvemos is_error, el
    // modelo supone que esto nunca se ejecutó, reintenta con un tool_use_id nuevo, y el registro ya no
    // puede reconocerlo como la misma llamada. Así es como se cuela un efecto secundario duplicado.
    effects[block.id] = { name: block.name, result: output, at: new Date().toISOString() };
    try {
      await saveEffects(opts.effectsPath, effects); // Escribe de inmediato al tener éxito, no acumules
    } catch (err) {
      // Una escritura fallida es un problema de operaciones, no de la herramienta: devuelve el resultado
      // real al modelo y levanta una alerta aparte
      console.error(
        `[falló la escritura del registro] tool_use_id=${block.id} name=${block.name}: ` +
        `el efecto secundario ocurrió pero no quedó anotado; al reanudar hay riesgo de volver a ejecutarlo. Requiere revisión manual. Causa: ${err.message}`,
      );
    }
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

El orden no es negociable: la compuerta de idempotencia tiene que ir primero. La razón es llana: si esta llamada ya está en el registro, preguntar después «¿deberíamos hacerlo?» no significa nada, porque ya está hecho, y volver a preguntar solo confunde a quien responde —el sistema claramente terminó esto, ¿por qué me pide que lo confirme?—. Para una llamada colgante al reanudar, la primera pregunta es siempre «¿esto ocurrió?», y solo una vez zanjada eso le llega el turno a «¿esto debería ocurrir?».

## Idempotencia en la capa de diseño de la herramienta: arregla la causa, no solo atrapes las consecuencias

El registro de efectos es una red de contención del lado del arnés: haya sido o no diseñada la herramienta para ser idempotente, el registro puede bloquear una ejecución duplicada usando `tool_use_id`. Pero una red de contención sigue siendo una red de contención, y la mejor inversión es arreglar la causa: donde puedas cambiar la herramienta, diséñala para que sea idempotente por naturaleza, para que el registro nunca tenga que intervenir.

La versión más común de ese cambio es convertir «crear» en «asegurar que existe»:

```javascript
// Arreglar la causa: idempotente por naturaleza — consulta primero, devuelve lo que existe, no crea de nuevo
async function ensureTicket(input) {
  const existing = await findTicketByTitle(input.title);
  if (existing) return existing;
  return createTicketRecord(input);
}
```

Llama a `ensureTicket` una vez o diez y el sistema termina con exactamente un ticket que coincide con ese título: el estado final no varía con la cantidad de llamadas, que es la definición de idempotente. El mismo razonamiento aplica a escribir archivos: un `write_file` de archivo completo es idempotente por naturaleza, y las llamadas repetidas dejan atrás el mismo contenido; un `append_file` que agrega al final no lo es, y el archivo crece una sección por llamada. Cuando puedas elegir sobrescribir, no elijas agregar al final.

Arreglar la causa y atrapar las consecuencias no son dos opciones entre las que elegir: son una división del trabajo. Las herramientas que puedes diseñar para que sean idempotentes habría que resolverlas en la capa de la herramienta, ahorrándole a cada llamada el rodeo por el registro. Y para las operaciones que genuinamente no se pueden «deduplicar y fusionar» como cuestión de lógica de negocio —dos transferencias que de verdad ocurrieron en momentos distintos, digamos, que deberían reconocerse como dos eventos diferenciados y no se pueden colapsar en uno por diseño ingenioso—, el registro es la única red de contención que hay.

## Retomando el hilo: una barrera de protección más, y saber cuándo vale la pena

Este curso arrancó del punto de que la confiabilidad viene de emparejar la adaptabilidad del modelo con salvaguardas deterministas como la lógica de reintentos y los puntos de control regulares[^S1]. El registro de efectos es una de esas barreras. No le pide al modelo que juzgue «¿esto ya lo hice?»: eso siempre estuvo más allá de lo que el modelo puede percibir. Hace que el arnés emita ese juicio en nombre del modelo, usando evidencia definida escrita en disco.

Conserva también el sentido de la proporción. Si todas las herramientas que sostiene tu agente son de solo lectura, el registro de esta lección probablemente no se gane su lugar: un registro de efectos es en sí mismo una capa de complejidad, y lo que hace que valga la pena agregarlo es que bloquee genuinamente un riesgo real de efectos secundarios duplicados; habría que agregar complejidad solo cuando mejora los resultados de forma demostrable[^S3]. La prueba es la misma que la de la lección anterior: mira primero tu conjunto de herramientas en busca de operaciones no idempotentes y de alto impacto. Si están ahí, vale la pena instalar la compuerta. Si no están, no corras a escribirla.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Calificar seis herramientas por idempotencia y riesgo al volver a ejecutarlas

Para cada una de las seis herramientas de abajo, decide: (1) si es idempotente; (2) si una llamada colgante a ella se vuelve a ejecutar al reanudar, si el riesgo es alto, medio o bajo, y por qué.

- `read_file(path)` — lee el contenido de un archivo
- `send_email(to, subject, body)` — envía un correo
- `ensure_ticket(title, body)` — busca por título, devuelve el ticket existente si lo hay, crea uno nuevo solo si no lo hay
- `append_log(line)` — agrega una línea al final de un archivo de log
- `set_config(key, value)` — fija una clave de configuración a un valor dado (sobrescribiendo)
- `delete_file(path)` — borra un archivo

<!-- rubric -->
- Los seis juicios de idempotencia correctos (idempotentes: read_file, ensure_ticket, set_config, delete_file; no idempotentes: send_email, append_log)
- Niveles de riesgo razonables y acompañados de una razón, no una etiqueta pelada (alto/medio/bajo tiene que estar respaldado por un «por qué»)
- Nombra al menos un caso donde la idempotencia depende de con cuánto cuidado se implementó la herramienta (la lógica de búsqueda de ensure_ticket, o cómo maneja delete_file el «archivo no encontrado»)

<!-- answer -->
`read_file` es idempotente, no tiene efectos secundarios por naturaleza, y volver a ejecutarla no conlleva riesgo alguno (bajo). `send_email` no es idempotente —cada llamada pone de verdad un mensaje más en la bandeja del destinatario—, así que volver a ejecutar una llamada colgante al reanudar provoca un envío duplicado. El riesgo es alto, y solo es seguro repetirla después de consultar el registro. `ensure_ticket` es idempotente por diseño: cuando ya existe un ticket con el mismo título saltea la creación, así que el estado final del sistema no varía con la cantidad de llamadas. Pero esa idempotencia descansa en que la lógica de «buscar por título» sea sólida: si el título carga algo que difiere cada vez, como una marca de tiempo, la búsqueda deja de coincidir y la idempotencia es idempotencia solo de nombre. Llámalo riesgo bajo a medio, y respáldalo igual con el registro. `append_log` no es idempotente —cada llamada agrega de verdad una línea—, así que volver a ejecutarla al reanudar deja entradas duplicadas en el log. El riesgo es medio: no es un incidente de negocio como sí lo es un correo duplicado, pero contamina el log y puede desajustar lógica aguas abajo que cuente líneas o busque coincidencias de contenido. `set_config` es idempotente, una escritura que sobrescribe; fijar la misma clave al mismo valor produce el mismo estado final la llames las veces que la llames, así que el riesgo es bajo y volver a ejecutarla está bien. `delete_file` es idempotente —borrar un archivo que ya no está deja el mismo estado final que el archivo simplemente no existiendo—, así que el riesgo es bajo. Pero atención al detalle de implementación: si `delete_file` lanza una excepción con un archivo ausente y quien la llama trata eso como una falla de ejecución, volver a ejecutarla se malinterpreta como una falla nueva. «Archivo no encontrado» habría que tratarlo como éxito en el sentido idempotente.

<!-- hint -->
Deja el riesgo de lado por un momento y agrupa las seis en dos conjuntos: efectos que sobrescriben y efectos que se acumulan. Esa línea divisoria está en el cuerpo de la lección, y una vez que la agrupación es correcta, los juicios de idempotencia se resuelven casi solos.

<!-- hint -->
El nivel de riesgo no es una copia directa de «idempotente significa bajo, no idempotente significa alto»: piensa si es más grave la consecuencia de `append_log` o la de `send_email`, y después piensa sobre qué premisa descansa la idempotencia de `ensure_ticket` y qué pasa cuando esa premisa falla.

### Nivel 2: Agregar un registro de efectos a un runToolUses que no lo tiene

La semana pasada tu arnés estaba resolviendo una tarea de «un cliente reporta una caída del servicio, abrir un ticket». Ejecutó `create_ticket`, obtuvo un resultado exitoso, y justo ahí dio la casualidad de que reiniciaron el contenedor y lo mataron, antes de que el resultado llegara de vuelta a un `tool_result`. Cuando el proceso volvió, el arnés leyó `pendingToolUse` desde `checkpoint.json` y encontró exactamente esa llamada a `create_ticket`. Con el `runToolUses` sin registro de abajo, su única opción era volver a ejecutar, así que el reporte de caída de un solo cliente se convirtió en un ticket duplicado en el sistema, salido de la nada.

```javascript
// La escena del accidente: este runToolUses no tiene registro de efectos
async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    const output = await toolImpls[block.name](block.input);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

Tu trabajo: (1) escribir las funciones de lectura y escritura `loadEffects`/`saveEffects` para `effects.json`, usando una escritura atómica (primero `.tmp`, después `rename`); (2) reescribir `runToolUses` para agregar la lógica de «consultar el registro antes de ejecutar, ejecutar solo si hay fallo, anotar en el registro en el momento en que la ejecución tiene éxito»; (3) escribir un script de Node que lo demuestre: llamar dos veces a tu `runToolUses` reescrito con el mismo `tool_use_id` (simulando una repetición al reanudar) y mostrar que la segunda llamada no vuelve a ejecutar la implementación real de `create_ticket`.

<!-- rubric -->
- `loadEffects`/`saveEffects` usan la escritura atómica `.tmp` + `rename` en vez de escribir directo sobre el archivo destino; `loadEffects` maneja el archivo ausente (devuelve un objeto vacío) para que la reanudación misma no se caiga
- El `runToolUses` reescrito consulta el registro por `block.id` antes de ejecutar y, si hay acierto, reutiliza el `result` guardado sin llamar a `toolImpls`; escribe el registro solo después de que la ejecución tiene éxito genuinamente, y escribe el resultado real de esta llamada, no un marcador de posición
- El script de verificación usa un `create_ticket` falso que cuenta llamadas, demostrando que «la segunda llamada con el mismo tool_use_id no incrementa el contador»: evidencia real de que la consulta al registro impidió la ejecución, no apenas de que nada lanzó una excepción

<!-- answer -->
```javascript
import { promises as fs } from "node:fs";

async function loadEffects(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return {};
  }
}

async function saveEffects(path, effects) {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(effects, null, 2));
  await fs.rename(tmp, path);
}

async function runToolUses(content, toolImpls, opts) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const effects = await loadEffects(opts.effectsPath);
  const results = [];
  for (const block of toolUseBlocks) {
    const recorded = effects[block.id];
    if (recorded) {
      results.push({ type: "tool_result", tool_use_id: block.id, content: recorded.result });
      continue;
    }
    const output = await toolImpls[block.name](block.input);
    effects[block.id] = { name: block.name, result: output, at: new Date().toISOString() };
    await saveEffects(opts.effectsPath, effects);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}

// Verificar: en una repetición con el mismo tool_use_id, la segunda pasada no abre un ticket
let calls = 0;
async function createTicket(input) {
  calls += 1;
  return { id: "T-1", title: input.title };
}

const block = {
  type: "tool_use",
  id: "toolu_01abc",
  name: "create_ticket",
  input: { title: "Caída del servicio reportada por el cliente" },
};
const effectsPath = "./effects.json";

await runToolUses([block], { create_ticket: createTicket }, { effectsPath });
console.assert(calls === 1, "la primera llamada debería ejecutarse de verdad");

// Simular la reanudación: el mismo tool_use_id aparece otra vez en pendingToolUse
await runToolUses([block], { create_ticket: createTicket }, { effectsPath });
console.assert(calls === 1, "la segunda llamada acierta en el registro y no debería ejecutarse");

console.log("calls =", calls); // imprime calls = 1, probando que la repetición no abrió un segundo ticket
```

Este código se ejecutó bajo Node para verificarlo: en la primera llamada a `runToolUses` el registro está vacío, `create_ticket` se ejecuta de verdad una vez, `calls` pasa a 1, y el archivo de registro anota el resultado de esa llamada. La segunda llamada simula una repetición al reanudar con el mismo `tool_use_id`; `runToolUses` encuentra ese id en el registro, deja caer el `result` guardado directo en un `tool_result`, y `toolImpls.create_ticket` no se vuelve a llamar nunca: `calls` sigue en 1. Eso es exactamente lo que el registro de efectos busca demostrar: una repetición al reanudar no hace que un efecto secundario ya completado ocurra por segunda vez.

<!-- hint -->
Que el registro se escriba o no depende de si la herramienta tuvo éxito de verdad, no de si el bucle `for` llegó hasta este punto: `saveEffects` tiene que ir **después** de la llamada a `toolImpls[...]` y **después** de que tengas el resultado.

<!-- hint -->
El sentido de la verificación no es «la segunda llamada no lanzó una excepción», es «la segunda llamada no volvió a ejecutar la implementación real de `create_ticket`». Una implementación falsa que cuente llamadas, comparada antes y después, es la única evidencia creíble.

<!-- /exercises -->

## Resumen

- Reanudar te entrega una semántica de ejecución at-least-once: el proceso puede morir después de que una herramienta tuvo éxito de verdad pero antes de que el resultado quede escrito en el registro, y el punto de control por sí solo no puede decirte si esa llamada colgante se ejecutó. Esa es la raíz de por qué la Lección 3 tuvo que dejar sin resolver la conciliación de alto impacto.
- La definición de idempotente: una operación que produce el mismo efecto final se ejecute una vez o muchas. Las escrituras que sobrescriben (`set_config`, `write_file`) suelen ser idempotentes; las que agregan al final (`append_log`, `send_email`) normalmente no.
- El registro de efectos anota en disco qué efectos secundarios ya ocurrieron, indexados por `tool_use_id`, el identificador único que el modelo lleva consigo cuando nombra una herramienta[^S4], que no cambia cuando ese mismo nombramiento se repite al reanudar, y que por eso es una clave de idempotencia por naturaleza. Escríbelo con la escritura atómica `.tmp` + `rename`, en el momento en que la herramienta tiene éxito.
- La regla de conciliación al reanudar sube de categoría a: si `pendingToolUse.id` acierta en el registro, reutiliza el resultado guardado y no vuelvas a ejecutar; si falla, ejecuta con seguridad.
- La compuerta de aprobación pregunta «¿esto debería hacerse?», el registro de efectos pregunta «¿esto ya se hizo?». Se complementan, ambas se ubican delante de la ejecución real, y la compuerta de idempotencia va primero.
- Arreglar la causa le gana a atrapar las consecuencias: diseña herramientas idempotentes por naturaleza («asegurar que existe» antes que «crear», sobrescribir antes que agregar al final) y no vas a necesitar el registro para todo. La confiabilidad viene de la adaptabilidad del modelo emparejada con salvaguardas deterministas[^S1], pero una salvaguarda también es complejidad, y habría que agregarla solo cuando mejora los resultados de forma demostrable[^S3].

[>> Lección 5: Rebobinar y bifurcar: el segundo valor de los puntos de control](./05-rewind-and-fork.md)
