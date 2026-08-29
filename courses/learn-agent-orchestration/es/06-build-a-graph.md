# Lección 6: Manos a la obra: convertir tu arnés en un grafo pequeño

> Objetivos de aprendizaje:
> - Soldar el enrutamiento, el fan-out, la fusión, el bucle de revisión y el informe de las primeras cinco lecciones en un solo `orchestrate.mjs`: el plan vive en el código, cada nodo sigue ejecutando el bucle de `stop_reason` del curso 7 (Fundamentos del arnés de agente: bucles y control), y los resultados intermedios se quedan en variables del script
> - Poner el bucle de revisión a girar de verdad, y ver las dos formas en que puede parar—un ticket corregido según el informe de la compuerta y listo, otro devolviendo informes idénticos dos rondas seguidas, juzgado sin más progreso, marcado needs_human
> - Persistir la traza de ejecución del grafo entero en `run-state.json` y `run.jsonl`, y después conciliarla contra la tabla resumen de la ejecución real: qué nodo gastó cuánto tiempo, cuántas llamadas al modelo, cuántos tokens, cuántas rondas de compuerta
>
> Requisitos: Completaste las Lecciones 1–5, puedes ejecutar el bucle del arnés del curso 7 (Fundamentos del arnés de agente: bucles y control) | Anterior: [<< Lección 5](./05-evaluator-and-graphs.md)

## Primero, verlo ejecutarse

Las primeras cinco lecciones separaron las piezas: quién tiene el plan (Lección 1), encadenamiento y enrutamiento (Lección 2), seccionamiento y votación más un pool de concurrencia acotado (Lección 3), orquestador-trabajadores y los cuatro elementos de los prompts de delegación (Lección 4), el bucle de revisión y cómo componer estos patrones en lo que la Lección 5 llama un «grafo» (Lección 5). Esta lección los suelda en un solo archivo.

La tarea es deliberadamente mundana: `inbox/` tiene seis tickets de atención al cliente, y el trabajo es escribir para cada uno una respuesta que se pueda enviar tal cual. Primero, cómo se ve cuando termina:

```text
\$ node orchestrate.mjs
inbox/ recibió 6 tickets: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[fanout] techo de concurrencia 2, produjo 6 borradores
[merge] escribió 6 archivos en out/, pasando aguas abajo solo referencias y resúmenes de una línea
[review] reescrituras por compuerta: 2 rondas en total

=== Resumen de ejecución del grafo completo ===
Nodo      Tiempo   Llamadas   Tokens   Rondas   Estado
route     63ms     1          720      -        ok
fanout    246ms    8          8903     -        ok
merge     2ms      0          0        -        ok
review    129ms    2          3033     2        ok

=== Desglose por ticket ===
Ticket   Categoría  Manejador         Rondas   Motivo de parada  Estado
T-1001   billing    worker:billing    0        gate_pass         pass
T-1002   bug        worker:bug        0        gate_pass         pass
T-1003   other      template          0        gate_pass         pass
T-1004   billing    worker:billing    1        no_progress       needs_human
T-1005   bug        worker:bug        1        gate_pass         pass
T-1006   other      template          0        gate_pass         pass

Directorio de salida out/: 6 respuestas; requieren traspaso a una persona: 1 ticket
  - T-1004 (no_progress): Ticket T-1004: pasar la factura de nombre personal a nombre …
Traza: run-state.json / run.jsonl (run_id=run-mtemep4r)
\$ echo \$?
1
```

Cada salida de terminal de esta lección viene de ejecuciones reales de este script, copiada línea por línea—ni una sola línea es un ejemplo escrito a mano. Dos cosas cambian en cada ejecución: los tiempos en milisegundos, y el `run_id` (es una marca de tiempo en base 36). Todo lo demás—resultados de clasificación, cantidad de llamadas, números de tokens, cantidad de rondas de compuerta, cuál ticket queda en `needs_human`—es una constante fijada. La razón se explica más adelante, en la sección «Preparación de la verificación».

Vale la pena quedarse mirando ese `1` final. No es un error—es un veredicto: seis tickets, uno no pudo terminarse solo, así que el código de salida no es 0. Cada ejecución de este grafo produce una conclusión que CI o un cron pueden parsear, no apenas un montón de logs.

## Cómo se ve el grafo: el plan son esa docena de líneas de `main()`

Empieza por el esqueleto del script. Usar «grafo» y «nodo» es el vocabulario que introdujo la Lección 5—es un sistema visual nuestro, no un concepto oficial, y descansa en exactamente un ancla primaria: el script del flujo de trabajo mismo retiene el bucle, las bifurcaciones y los resultados intermedios[^S5]. El fragmento de abajo es la implementación literal de ese enunciado:

La Lección 5 dibujó primero un grafo compuesto; este grafo es una **variante** de aquel, con tres diferencias: la Lección 5 partía por dificultad en «simple / complejo», aquí partimos por tema en `billing` / `bug` / `other`; el fan-out de la Lección 5 era «un ticket complejo despachado a tres trabajadores y después fusionado», aquí es seccionamiento—«seis tickets, a cada uno se le asigna un manejador»; la arista de retorno de la Lección 5 volvía a un nodo `[borrador]` aparte, aquí vuelve al trabajador original. Por qué todos estos cambios está recogido en la sección «Tabla de conciliación» del final.

```javascript
async function main() {
  seedWorkspace();
  initLog();
  saveState();

  const tickets = loadInbox();
  console.log(`inbox/ recibió ${tickets.length} tickets: ${tickets.map((t) => t.id).join(", ")}`);

  const { routed } = await node("route", () => routeNode(tickets));
  console.log(`[route] ${routed.map((t) => `${t.id}=${t.category}`).join("  ")}`);

  const { drafts } = await node("fanout", () => fanoutNode(routed));
  console.log(`[fanout] techo de concurrencia ${POOL_SIZE}, produjo ${drafts.length} borradores`);

  const { items } = await node("merge", async () => mergeNode(drafts));
  console.log(`[merge] escribió ${items.length} archivos en out/, pasando aguas abajo solo referencias y resúmenes de una línea`);

  if (process.env.STOP_AFTER === "merge") {
    console.log("[stop] STOP_AFTER=merge: parando antes de la revisión, esta ejecución no da veredicto");
    process.exit(2);
  }

  const byId = new Map(routed.map((t) => [t.id, t]));
  const reviewed = await node("review", () => reviewNode(items, byId));
  console.log(`[review] reescrituras por compuerta: ${reviewed.totalRounds} rondas en total`);

  const { needsHuman } = await node("report", async () => reportNode(items, reviewed.totalRounds));

  process.exit(needsHuman > 0 ? 1 : 0);
}
```

`routed`, `drafts`, `items`—estas tres declaraciones `const` son todo el estado del grafo. Son variables corrientes de JavaScript, no objetos de estado tipados, y no hay estrategia de fusión—los resultados intermedios se quedan en variables del script[^S5], y los nodos se pasan datos por el valor de retorno de las funciones. Ningún modelo ve el panorama completo: el modelo de enrutamiento ve solo los textos de seis tickets, el trabajador de billing ve solo el ticket que le tocó, la compuerta de revisión ve solo un archivo de respuesta.

Así se ve en código la distinción arquitectónica entre flujo de trabajo y agente: los LLM y las herramientas se orquestan a través de caminos de código predefinidos[^S1], y no es el modelo dirigiendo autónomamente sus propios procesos[^S1].

Cinco nodos, cada uno se encarga de un tramo:

| Nodo | Qué hace | Quién lo hace |
| --- | --- | --- |
| `route` | Una llamada barata parte seis tickets en tres categorías | Un bucle de modelo |
| `fanout` | Despacha por categoría a trabajadores especializados, con la concurrencia acotada | Dos tipos de bucles de modelo + una plantilla de código puro |
| `merge` | La salida aterriza en disco, aguas abajo solo van referencias y resúmenes de una línea | Código puro |
| `review` | La compuerta determinista filtra primero, lo que falla entra a revisar-corregir-revisar | Código puro + bucles de modelo bajo demanda |
| `report` | Imprime las tablas resumen, determina el código de salida | Código puro |

Solo dos de los cinco nodos llaman de verdad a un modelo. **No todo nodo tiene que ser un modelo**—esta es la regla más barata de la lección y la que más fácil se pasa por alto: `merge` y `report` son funciones puras, la categoría `other` de `fanout` usa una plantilla de cadenas, y el primer filtro de `review` son unas pocas líneas de `includes`. Donde el código determinista pueda dar la misma respuesta, no hay razón para pagar el costo y la latencia de una llamada al modelo.

## Dentro de los nodos: sigue siendo el bucle del curso 7

Fija primero la capa más interna y después el grafo cobra sentido. Cada nodo de modelo ejecuta internamente el bucle de `stop_reason` del curso 7 (Fundamentos del arnés de agente: bucles y control), sin cambios:

```javascript
async function runAgent(client, system, userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // —— Válvula 1: máximo de turnos. Al inicio del cuerpo del bucle, antes de turns++ ——
    if (turns >= MAX_TURNS) {
      return `Se alcanzó el máximo de turnos ${MAX_TURNS}, deteniendo (la tarea puede ser muy difícil o el modelo se atascó)`;
    }
    turns++;

    // Agrega al historial la respuesta completa de este turno (rol assistant)
    messages.push({ role: "assistant", content: response.content });

    // Ejecuta todos los bloques tool_use de este turno, envuelve cada uno como tool_result
    const toolResults = await runToolUses(response.content, toolImpls);

    // Todos los bloques tool_result de un turno van en el mensaje user inmediatamente siguiente
    messages.push({ role: "user", content: toolResults });

    // Envía de nuevo con el historial alargado, vuelve a la condición del while
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // stop_reason ya no es tool_use, extrae el texto final y devuelve
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

Los cuatro pasos del cuerpo del bucle—empujar assistant, ejecutar herramientas, empujar tool_result, reasignar `response`—son palabra por palabra idénticos a la Lección 6 del curso 7, hasta los comentarios están copiados. La válvula 1 (máximo de turnos) está en su posición original: al inicio del cuerpo del bucle, antes de `turns++`. Dejar un máximo de iteraciones como condición de parada de los bucles es práctica estándar para mantener el control[^S1].

Frente al curso 7 hay dos cambios, los dos fuera del cuerpo del bucle: `client` y `system` pasaron de constantes a nivel de módulo a parámetros (tres roles necesitan stubs distintos y prompts de sistema distintos, hay que pasarlos); y el conteo de tokens y de llamadas se movió de dentro del cuerpo del bucle a una capa envolvente por fuera del cliente, con el interior del bucle sin cambios:

```javascript
function metered(client) {
  const meter = { calls: 0, tokens: 0 };
  const wrapped = {
    messages: {
      async create(req) {
        const res = await client.messages.create(req);
        meter.calls += 1;
        meter.tokens += res.usage.input_tokens + res.usage.output_tokens;
        return res;
      },
    },
  };
  return { client: wrapped, meter };
}
```

Este cambio tiene un costo y hay que declararlo: la válvula 2 del curso 7 (presupuesto de tokens) se apoyaba originalmente en el acumulador del cuerpo del bucle; ese acumulador ya no está en el bucle, así que la válvula 2 tampoco hizo la mudanza. En este grafo, la cola de respuestas del stub de cada nodo tiene largo fijo y agotarla lanza directamente, así que no se puede desbocar; pero cuando cambies los stubs por un cliente real, vuelve a poner la válvula 2—o haces que `metered` lance al pasarse del presupuesto, o mueves el conteo de vuelta al cuerpo del bucle y restauras la forma original del curso 7. La válvula 3 (detección de giro en falso) y la válvula 4 (aprobación humana) tampoco se mudaron; la razón está en la sección «Tabla de conciliación» más adelante.

La mitad de las herramientas también está copiada: la respuesta de un turno contiene varios bloques `tool_use`, se devuelven esa misma cantidad de bloques `tool_result`, y si una herramienta lanza se envuelve en `is_error: true` y se le pasa de vuelta al modelo, en vez de tumbar el proceso entero.

## Nodo uno: enrutamiento—una llamada barata, y después ajustar la salida

El enrutamiento clasifica una entrada y la dirige hacia tareas de seguimiento especializadas[^S1]. Es la llamada al modelo más barata del grafo: una petición clasifica los seis, sin herramientas, sin escribir respuestas.

```javascript
async function routeNode(tickets) {
  const { client, meter } = metered(makeStubClient(SCRIPTS.router));
  const input = tickets.map((t) => `${t.id}: ${t.text}`).join("\n");
  const text = await runAgent(client, ROUTER_PROMPT, input, [], {});

  // Ajuste de la salida: solo reconoce líneas "id_de_ticket: categoría"; la categoría fuera de la lista blanca cae a other
  const parsed = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(T-\d+)\s*:\s*(\S+)\s*$/);
    if (!m) continue;
    const [, id, raw] = m;
    const category = CATEGORIES.includes(raw) ? raw : "other";
    if (category !== raw) log({ node: "route", event: "clamped", ticket: id, raw, category });
    parsed.set(id, category);
  }

  const routed = tickets.map((t) => ({ ...t, category: parsed.get(t.id) ?? "other" }));
  for (const t of routed) log({ node: "route", event: "routed", ticket: t.id, category: t.category });
  return { routed, calls: meter.calls, tokens: meter.tokens };
}
```

La clave son las diez líneas del medio, no la llamada al modelo. El modelo devuelve texto libre, cada rama de aguas abajo depende de ese valor, así que hay que ajustarlo a una de tres etiquetas legales antes de que entre aguas abajo: las líneas que no coinciden con el formato se descartan; las categorías fuera de la lista blanca caen a `other`; los tickets para los que no coincidió ni una línea los atrapa `parsed.get(t.id) ?? "other"`.

Hice que el stub devolviera deliberadamente «queja» para el último ticket—no está en la lista blanca. El log de la ejecución real muestra ese ajuste:

```text
{"ts":"2026-08-29T16:54:21.691Z","run_id":"run-mtemep4r","node":"route","event":"clamped","ticket":"T-1006","raw":"queja","category":"other"}
```

El modelo dio una etiqueta inventada, el código la acotó de vuelta a `other`, y dejó un registro de qué se acotó. **Las ramas de aguas abajo solo reconocen valores que el código ya validó**—esta es la diferencia práctica entre un nodo de enrutamiento y «dejar que el modelo decida directamente hacia dónde saltar», y es por lo que el enrutamiento se puede probar unitariamente.

## Nodo dos: fan-out—tres trabajadores y un pool de concurrencia acotado

El fan-out sigue el seccionamiento: partir la tarea en subtareas mutuamente independientes y ejecutarlas en paralelo[^S1]. Aquí lo de «independientes» es natural—los seis tickets no tienen ninguna dependencia entre sí, el orden no importa.

Tres categorías, tres manejadores, y solo dos son modelos:

```javascript
const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
  if (ticket.category === "other") {
    const text = otherTemplate(ticket.id);
    log({ node: "fanout", event: "template_done", ticket: ticket.id });
    return { ticket, handler: "template", text };
  }
  const r = await callWorker(ticket, 1);
  calls += r.calls;
  tokens += r.tokens;
  return { ticket, handler: `worker:${ticket.category}`, text: r.text };
});
```

El pool de concurrencia es el pool de la Lección 3 (allá se llamaba `pool`, aquí `runPool`): las tareas esperan detrás de un cursor, se lanzan `limit` consumidores a tomarlas, y se termina cuando se agotan. El techo funciona de verdad, no es decorativo. Ajústalo a 1 y ejecuta de nuevo: el tiempo de la línea `fanout` se alarga notablemente (la cantidad de llamadas y los tokens son idénticos, los milisegundos fluctúan como siempre):

```text
\$ POOL_SIZE=1 node orchestrate.mjs
...
=== Resumen de ejecución del grafo completo ===
Nodo      Tiempo   Llamadas   Tokens   Rondas   Estado
route     62ms     1          720      -        ok
fanout    491ms    8          8903     -        ok
merge     2ms      0          0        -        ok
review    128ms    2          3033     2        ok
```

491ms frente a 246ms, con cantidad de llamadas y tokens idénticos. La concurrencia compra tiempo de reloj, no menos trabajo—esto sigue siendo cierto tras cambiar a una API real, salvo que entonces además tienes que considerar los límites de tasa del proveedor, lo que vuelve el techo todavía más esencial.

### Prompts de delegación: los cuatro elementos presentes

Los prompts de los tres roles de modelo siguen los cuatro elementos de la Lección 4: objetivo, formato de salida, guía de herramientas, límites de la tarea. Los subagentes necesitan un objetivo, un formato de salida, guía sobre las herramientas y fuentes, y límites claros de la tarea; sin una descripción adecuada, los trabajadores duplican trabajo, dejan huecos, o no encuentran lo que deberían[^S2]. El trabajador de billing:

```javascript
billing: [
  "Eres especialista en tickets de facturación y manejas un ticket a la vez.",
  "Objetivo: investigar los hechos de facturación de este ticket y producir una respuesta completa en español.",
  "Formato de salida: párrafo de texto plano que empieza con 'Respuesta al ticket <id_de_ticket>:', declara los hechos encontrados, las acciones ya tomadas y qué puede esperar la persona a continuación; sin listas de viñetas, sin cortesías.",
  "Guía de herramientas: los hechos de facturación deben salir de lookup_order, pasando el id de pedido del ticket tal cual; si no aparece dilo, no infieras montos ni cantidad de cobros a partir de la descripción del ticket.",
  "Límites de la tarea: maneja solo la parte de facturación de este ticket, no modifiques pedidos, no prometas compensaciones extra, no respondas preguntas ajenas a facturación; no escribas muletillas como 'espera un poco', 'gracias por tu paciencia' o 'lo resolveremos pronto'.",
].join("\n"),
```

Cuatro líneas, cada una haciendo su trabajo: el objetivo determina qué escribe; el formato de salida le da a la compuerta de aguas abajo algo que revisar (el requisito de «empezar con el id del ticket» mapea directamente a la primera regla de la compuerta); la guía de herramientas clava «de dónde salen los montos» en `lookup_order`, bloqueando el camino de inventar cifras a partir de la descripción del ticket; los límites de la tarea bloquean acciones fuera de alcance y prohíben de antemano las muletillas.

La versión del trabajador de bug cambia el contenido a consultar la base de problemas conocidos, citar números de problema y prohibir números inventados; la «guía de herramientas» del enrutador dice «este paso no te da herramientas, juzga solamente por el texto del ticket», lo que concuerda con el arreglo vacío de tools que se pasa en el código. Las diferencias entre estos tres prompts son en sí mismas el rédito del enrutamiento: después de clasificar, cada uno escribe lo suyo, sin necesidad de embutir los requisitos de tres tipos de trabajo en un solo prompt—esto es precisamente la separación de responsabilidades y los prompts más especializados que habilita el enrutamiento[^S1].

## Nodo tres: fusión—pasar referencias, no cargas

`merge` es código puro, cero llamadas al modelo. Hace dos cosas: escribir cada borrador en `out/`, y después recolectar un manifiesto liviano para aguas abajo—`{id, category, handler, file, oneLine}`, una ruta de archivo más un resumen de una línea, no seis respuestas completas. (Al mismo tiempo también crea un registro para cada ticket en `run-state.json`, con los campos que se ven en la sección 9 del código completo.)

Esto trae a un script de un solo proceso el consejo de ingeniería de los sistemas multiagente: hacer que los agentes especializados guarden sus salidas en sistemas externos y le pasen de vuelta al coordinador solo referencias livianas[^S2]. En aquella retrospectiva, este consejo resolvía el inflado de contexto de «todo se retransmite vía el agente líder»; aquí resuelve la versión a pequeña escala de lo mismo—el nodo de revisión necesita «qué archivo hay que revisar», no los seis textos completos apilados en una variable que se pasa de mano en mano.

Por eso la primera acción del nodo de revisión es releer el contenido desde el archivo:

```javascript
let reply = fs.readFileSync(full, "utf8").trim(); // Carga la payload desde el archivo, no viene arrastrada del nodo anterior
```

Este paso parece redundante—total, todo está en el mismo proceso, basta con pasar la cadena directamente. Pero compra dos cosas: el archivo en `out/` se vuelve la única fuente de verdad de ese ticket, y quien sea que lo edite, eso es lo que la revisión revisa; y en cuanto esta arista necesite cruzar procesos o máquinas, solo cambia esta línea de `readFileSync`, y el contrato entre nodos no se mueve.

## Una pregunta

A esta altura, tres de los cinco nodos del grafo están completos: el enrutamiento está ajustado por código, la fusión es código puro, y la compuerta que viene también será código puro. La pregunta que más se escucha en este punto se puede plantear directamente.

```agentmentor-check
{
  "id": "orc-zh-06-llm-as-glue",
  "label": "Juzgar si la lógica de pegamento habría que dejársela a un modelo líder para que decida sobre la marcha",
  "prompt": "Alguien del equipo termina de leer orchestrate.mjs y pregunta: «¿Por qué dejar fija en el código la lógica de pegamento del enrutamiento, la fusión y la compuerta? ¿No sería más flexible que un modelo líder mirara los resultados intermedios y decidiera el paso siguiente sobre la marcha?». Para esta tanda de tareas de tickets, ¿cómo deberías responder?",
  "whyHere": "Tres de los cinco nodos son código puro, y quien lee acaba de ver tres capas deterministas de pegamento seguidas. Este es el momento justo para comprobar si logra articular qué compra el «plan en el código», y cuándo sí vale la pena devolverle la autoridad de decisión al modelo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Los pasos de estas tareas ya eran descomponibles de antemano; dejarlos fijos en el código compra predictibilidad y consistencia, los resultados intermedios se quedan en variables del script y no ocupan contexto del modelo; el trabajo verdaderamente no descomponible es el que justifica devolverle la autoridad de decisión al modelo",
      "correct": true,
      "feedback": "Correcto, y esta es precisamente la aplicación práctica de la distinción arquitectónica entre flujo de trabajo y agente: el flujo de trabajo son LLM y herramientas orquestados a través de caminos de código predefinidos, el agente es el modelo dirigiendo autónomamente sus propios procesos. Cuando la tarea está bien definida, el flujo de trabajo aporta predictibilidad y consistencia; cuando hacen falta flexibilidad a escala y decisiones dirigidas por el modelo, el agente es la elección correcta. Los cinco pasos «llegan los tickets → clasificar → manejar por categoría → revisar → informar» ya estaban determinados antes de escribir la primera línea de código; hacer que el modelo los vuelva a decidir en cada ronda se paga con impredecibilidad y llamadas extra repetidas, comprando una flexibilidad que esta tarea no necesita. Un beneficio lateral es que los resultados intermedios no entran al contexto del modelo: el script mismo retiene el bucle, las bifurcaciones y los resultados intermedios, y el contexto del modelo retiene solo lo que necesita para este único paso."
    },
    {
      "id": "b",
      "text": "Dirigir con el modelo es obviamente más inteligente: que un modelo líder mire los resultados intermedios de cada paso y se adapte sobre la marcha, así el enrutamiento, la fusión y la compuerta se ajustan a las condiciones reales, más potente que una lógica fija en el código",
      "correct": false,
      "feedback": "Lo de «más inteligente» no tiene dónde cobrarse aquí. La clasificación tiene apenas tres valores legales, y la compuerta revisa «¿la respuesta contiene el id del ticket?, ¿contiene muletillas?»—son hechos comprobables de una pasada—; si se los entregas a un modelo obtienes una respuesta que podría diferir cada vez, y aun así tendrías que escribir código para ajustarla. El costo real no es solo ese: para que un modelo dirija, tiene que ver los resultados intermedios, los seis textos completos de respuesta tienen que entrar a su contexto, y ese contenido no se va a volver a referenciar nunca. La flexibilidad tiene precio, cómprala solo cuando de verdad la necesites."
    },
    {
      "id": "c",
      "text": "Los dos enfoques son más o menos lo mismo, la salida final es idéntica, y el resto es preferencia personal y costumbre del equipo, elige cualquiera",
      "correct": false,
      "feedback": "Esta no es una cuestión de estilo, es una decisión con criterio: si los pasos se pueden descomponer de antemano. Se pueden descomponer → escríbelos en el código y compra predictibilidad y consistencia; no se pueden descomponer—preguntas abiertas, pasos impredecibles de antemano, sin poder fijar un camino en el código—ahí sí debería volver a un bucle autónomo. (Cuando la cantidad y el contenido de las subtareas no se pueden fijar pero los pasos generales siguen en tus manos, orquestador-trabajadores de la Lección 4 es el escalón intermedio; el trabajo de este grafo ni siquiera necesita ese paso, la clasificación y el despacho quedaron cerrados antes del código.) Tratarlo como cuestión de gusto tiene una consecuencia habitual: levantar un sistema sobre un flujo de cinco pasos que vuelve a pensar cómo seguir en cada turno, caro, lento, y cuando algo sale mal no sabes qué línea arreglar."
    }
  ]
}
```

## Nodo cuatro: bucle de revisión—la compuerta filtra primero, lo que falla vuelve al horno

El nodo de revisión hace revisar-corregir-revisar: ejecutar un verificador, corregir lo que falló, y repetir hasta que pase o deje de haber progreso[^S5]. Es el único lugar de este grafo donde «la salida de un modelo se manda de vuelta para reescribirla».

El primer filtro es determinista, unas pocas líneas de `includes` y listo:

```javascript
function gateCheck(ticketId, reply) {
  const problems = [];
  if (!reply.includes(ticketId)) problems.push("missing_ticket_id");
  for (const w of FILLER_WORDS) {
    if (reply.includes(w)) problems.push(`filler_word:${w}`);
  }
  return { pass: problems.length === 0, report: problems.join(" | ") };
}
```

Dos reglas, las dos del tipo que el curso 10 (Verificación y aseguramiento de calidad: que lo que «parece correcto» no se cuele) llamó «si se puede determinar de forma determinista, no le preguntes a un juez»: la respuesta debe contener el id del ticket (los sistemas de atención se indexan por él), y no debe contener muletillas sin contenido informativo como «espera un poco», «gracias por tu paciencia» o «lo resolveremos pronto». Ninguna de las dos requiere comprensión semántica, con inclusión de cadenas alcanza, el resultado es el mismo siempre, y de paso produce una cadena de informe que se le puede devolver directamente al trabajador.

El juez LLM aquí podría encargarse de «¿el tono de la respuesta es apropiado?», «¿los hechos exceden lo que devolvieron las herramientas?»—cosas verdaderamente no juzgables con `includes`. Pero tiene que ir después de la compuerta: la compuerta es gratis y determinista, deja que filtre primero los problemas claros, y lo que quede vale la pena gastar una llamada en consultarle al juez. Este grafo solo instaló la capa de compuerta, porque los criterios de aceptación de esta tanda de tickets resultan expresables como reglas; cuando los criterios de aceptación incluyan palabras como «apropiado el tono», agrega la capa de juez según la asignación por niveles de juicio del curso 10.

El bucle en sí se ve así:

```javascript
while (!gate.pass) {
  reports.push(gate.report);
  if (rounds >= MAX_REVIEW_ROUNDS) {
    verdict = "max_rounds";
    break;
  }
  if (gate.report === lastReport) {
    verdict = "no_progress"; // Dos rondas seguidas con informe idéntico, el bucle ya no avanza
    break;
  }
  if (item.handler === "template") {
    verdict = "no_rewriter"; // La plantilla de código puro no tiene trabajador al que devolverle, se traspasa directo
    break;
  }
  lastReport = gate.report;
  rounds += 1;
  totalRounds += 1;
  const r = await callWorker(byId.get(item.id), rounds + 1, { prev: reply, report: gate.report });
  calls += r.calls;
  tokens += r.tokens;
  reply = r.text;
  fs.writeFileSync(full, `${reply}\n`);
  gate = gateCheck(item.id, reply);
  log({ node: "review", event: "gate", ticket: item.id, round: rounds, pass: gate.pass, report: gate.report });
}
```

Las tres sentencias `break` corresponden a tres formas de parar, que coinciden con lo que declaró la Lección 5: pasa (la condición del `while` se vuelve falsa naturalmente), no hay más progreso, se alcanzó el máximo de rondas. El tercer `if` es un parche—las respuestas de la categoría `other` las genera una plantilla de código puro, no hay trabajador al que devolvérselas, y si la plantilla misma está rota la única opción es el traspaso directo. Esta ejecución no lo alcanzó (la plantilla es constante y por fuerza pasa la compuerta); se conserva porque si alguien corrompe la cadena de la plantilla, prefiero ver un registro `no_rewriter` antes que un bucle girando en falso.

Lo que se le devuelve al trabajador al reciclar es sencillo: el texto completo de la versión anterior + el informe de la compuerta + una frase de «corrige solo los problemas nombrados en el informe y reescribe la respuesta completa» (se arma en `callWorker`).

### Las dos formas de parar ocurrieron de verdad en esta ejecución

Planté dos guiones en los stubs para que cada salida del bucle se ejecute una vez.

**T-1005: Corregido bien, listo.** La primera versión del trabajador de bug se olvidó del id del ticket (falla la primera regla), la compuerta devuelve `missing_ticket_id`, el trabajador agrega la línea de apertura según el informe, y la segunda versión pasa:

```text
{"ts":"2026-08-29T16:54:22.009Z","run_id":"run-mtemep4r","node":"review","event":"gate","ticket":"T-1005","round":0,"pass":false,"report":"missing_ticket_id"}
{"ts":"2026-08-29T16:54:22.070Z","run_id":"run-mtemep4r","node":"review","event":"worker_done","ticket":"T-1005","round":2,"calls":1,"tokens":1638}
{"ts":"2026-08-29T16:54:22.072Z","run_id":"run-mtemep4r","node":"review","event":"gate","ticket":"T-1005","round":1,"pass":true,"report":""}
```

**T-1004: Corregido, pero no arreglado, y el bucle se detuvo solo.** La primera versión del trabajador de billing escribió «espera un poco», la compuerta devuelve `filler_word:espera un poco`; el trabajador reescribió una versión, con la frase completamente distinta, más larga, con una explicación agregada, pero esa expresión sigue ahí. El informe de la segunda ronda es idéntico al de la primera:

```text
{"ts":"2026-08-29T16:54:21.947Z","run_id":"run-mtemep4r","node":"review","event":"gate","ticket":"T-1004","round":0,"pass":false,"report":"filler_word:espera un poco"}
{"ts":"2026-08-29T16:54:22.008Z","run_id":"run-mtemep4r","node":"review","event":"worker_done","ticket":"T-1004","round":2,"calls":1,"tokens":1395}
{"ts":"2026-08-29T16:54:22.008Z","run_id":"run-mtemep4r","node":"review","event":"gate","ticket":"T-1004","round":1,"pass":false,"report":"filler_word:espera un poco"}
```

En este momento se cumple `gate.report === lastReport`, el bucle juzga que no hay más progreso, para, y marca este ticket como `needs_human`. Originalmente le quedaban dos rondas de presupuesto (`MAX_REVIEW_ROUNDS` es 3), pero gastarlas sería desperdicio—se le devuelve el mismo informe, y lo más probable es que vuelva la misma respuesta. El valor de la salida por «no hay más progreso» está aquí: corta pérdidas antes que el máximo de rondas, y da una conclusión informativa—no «se intentó tres veces y sigue fallando», sino «no entiende esta retroalimentación», que es justamente la señal para escalar a una persona.

La diferencia entre las dos salidas se ve de inmediato en los datos:

```json
"T-1004": {
  "gate_rounds": 1,
  "gate_reports": [
    "filler_word:espera un poco",
    "filler_word:espera un poco"
  ],
  "stop": "no_progress",
  "status": "needs_human"
},
"T-1005": {
  "gate_rounds": 1,
  "gate_reports": [
    "missing_ticket_id"
  ],
  "stop": "gate_pass",
  "status": "pass"
}
```

Los `gate_rounds` de los dos tickets son 1, así que la cantidad de rondas por sí sola no distingue el éxito del fracaso; la línea divisoria es el largo de `gate_reports`—registra cada informe fallido, incluido el último, el que causó la parada. T-1005 deja una sola entrada (la segunda versión pasó, no hubo segundo informe), T-1004 deja dos de contenido idéntico, y el campo `stop` escribe la conclusión directamente como `no_progress`.

## Nodo cinco: informe y traza

El último nodo también es código puro: imprimir `state.nodes` y el desglose por ticket como dos tablas, contar los `needs_human`, determinar el código de salida. Todos pasaron es 0, uno requiere persona es 1.

La traza se parte en dos archivos, cada uno con su propósito. `run.jsonl` es el registro estructurado del curso 11 (Observabilidad y depuración: ver cada paso que da tu agente), un evento JSON por línea, cada uno llevando `ts` y `run_id`, grepeable después del hecho—esta ejecución totalizó 39 líneas, y los extractos de las secciones anteriores están todos grepeados de ahí tal cual.

`run-state.json` registra la traza de ejecución (distinta del «estado del grafo = esas pocas variables del script»), escrita al estilo del curso 9 (Gestión de estado y persistencia: hacer que las tareas largas sobrevivan a las interrupciones): primero se escribe `.tmp` y después un `rename` de intercambio atómico, así que si te matan en cualquier momento, en disco está o el estado completo anterior o el estado completo nuevo, nunca medio JSON:

```javascript
function saveState() {
  state.updated_at = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}
```

El momento de escritura es «persistir después de cada paso pequeño»: tras completarse cada nodo se persiste una vez, y dentro del nodo de revisión se persiste otra vez tras el veredicto de cada ticket. La razón la citó la Lección 5—rastrear incrementalmente el resultado de cada agente es precisamente la premisa para recuperar una ejecución dentro de la misma sesión[^S5]; un flujo de trabajo que reparte el trabajo entre muchos agentes pequeños preserva más progreso que un solo agente largo[^S5]. Este grafo no es un runtime multiagente, pero el mismo enunciado se sostiene aquí: seis tickets son seis unidades de progreso independientes, y si muere a mitad de la revisión, lo ya persistido no debería desaparecer con él (la fase de fan-out todavía no logra esto—ver el punto 3 de la Tabla de conciliación).

Para ver el efecto real de este enunciado, usa `STOP_AFTER=merge` para detener el proceso después del fan-out y antes de la revisión:

```text
\$ STOP_AFTER=merge node orchestrate.mjs
inbox/ recibió 6 tickets: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[fanout] techo de concurrencia 2, produjo 6 borradores
[merge] escribió 6 archivos en out/, pasando aguas abajo solo referencias y resúmenes de una línea
[stop] STOP_AFTER=merge: parando antes de la revisión, esta ejecución no da veredicto
\$ echo \$?
2
```

`run-state.json` en este momento (extracto):

```json
{
  "version": 1,
  "run_id": "run-mtemd2bq",
  "nodes": {
    "route": { "ms": 62, "calls": 1, "tokens": 720, "status": "ok" },
    "fanout": { "ms": 246, "calls": 8, "tokens": 8903, "status": "ok" },
    "merge": { "ms": 2, "calls": 0, "tokens": 0, "status": "ok" }
  },
  "tickets": {
    "T-1004": {
      "category": "billing",
      "handler": "worker:billing",
      "file": "out/T-1004.txt",
      "one_line": "Ticket T-1004: cambiar los datos de la factura requiere revi…",
      "gate_rounds": 0,
      "gate_reports": [],
      "stop": null,
      "status": "drafted"
    },
    "T-1005": {
      "category": "bug",
      "handler": "worker:bug",
      "file": "out/T-1005.txt",
      "one_line": "Este es el problema conocido KI-91: en la app el avatar toda…",
      "gate_rounds": 0,
      "gate_reports": [],
      "stop": null,
      "status": "drafted"
    }
  }
}
```

Las cuentas de tres nodos están, la categoría, el manejador y las rutas de archivo de salida de los seis tickets están, y seis archivos de borrador ya están persistidos en `out/`. Solo se perdió el tramo de revisión: todos los tickets quedaron en `status: "drafted"`, con `stop: null`. Este estado alcanza para sostener una reanudación—leer los borradores de vuelta desde `out/` y arrancar directamente desde el nodo de revisión. Fíjate en que el `one_line` de T-1005 justamente deja al descubierto el defecto del borrador: a la apertura le falta el id del ticket. La revisión todavía no se ejecutó, así que ese defecto todavía no se atrapó.

(`STOP_AFTER` solo reconoce `merge` como valor único; es la versión simplificada del punto de caída controlada del curso 9: código de salida 0 todos pasaron, 1 hay tickets para una persona, 2 se detuvo antes sin veredicto, 3 el script mismo se cayó—cuatro códigos que no se solapan, y CI distingue de un vistazo «se ejecutó pero algunos necesitan traspaso» de «se cayó».)

## `orchestrate.mjs` completo

Abajo está el texto completo, un solo bloque continuo; cópialo y pégalo en `orchestrate.mjs` dentro de un directorio vacío y después `node orchestrate.mjs`. Cero dependencias, sin necesidad de `npm i`, sin necesidad de `package.json` (el sufijo `.mjs` ya declara que es un módulo ES), y sin necesidad de clave de API—el cliente del modelo es un stub. La primera ejecución creará `inbox/`, `kb/`, `out/` y escribirá esos seis tickets.

```javascript
// orchestrate.mjs —— grafo pequeño de procesamiento por lotes de tickets: enrutar → fan-out → fusión → bucle de revisión → informe
// Cero dependencias, node orchestrate.mjs se ejecuta directamente. El cliente del modelo es un stub que reproduce una cola fija.
import fs from "node:fs";
import path from "node:path";

// ============ 0. Constantes y directorios ============

const MODEL = "claude-sonnet-5";
const MAX_TURNS = 6;          // Techo del bucle interno de un nodo (válvula 1 del curso 7)
const POOL_SIZE = Math.max(1, Number(process.env.POOL_SIZE) || 2); // Techo de concurrencia del fan-out (Lección 3); 0/inválido cae a 1
const STUB_LATENCY_MS = 60;   // Latencia fija del stub, reemplaza el viaje de red real, para que la columna de tiempo tenga algo que mostrar
const MAX_REVIEW_ROUNDS = 3;  // Máximo de rondas de reescritura del bucle de revisión (Lección 5)
const FILLER_WORDS = ["espera un poco", "gracias por tu paciencia", "lo resolveremos pronto"];
const CATEGORIES = ["billing", "bug", "other"];

const ROOT = process.cwd();
const INBOX = path.join(ROOT, "inbox");
const OUT = path.join(ROOT, "out");
const KB = path.join(ROOT, "kb");
const STATE_PATH = path.join(ROOT, "run-state.json");
const LOG_PATH = path.join(ROOT, "run.jsonl");

// ============ 1. Entrada: 6 tickets en inbox/ y una base de problemas conocidos ============

const TICKET_TEXT = {
  "T-1001": "Al pedido A-77301 le cobraron dos veces este mes, revísenlo por favor y devuélvanme el cobro de más.",
  "T-1002": "En la página de reportes hago clic en «Exportar CSV» y el botón se queda girando; esperé cinco minutos y nada. Chrome, red de la oficina.",
  "T-1003": "¿Cuál es su número de atención telefónica? Quiero preguntar directamente por teléfono.",
  "T-1004": "La factura del pedido A-77420 salió con los datos equivocados: quedó a mi nombre personal y necesito que sea a nombre de la empresa.",
  "T-1005": "En la app del celular, después de iniciar sesión el avatar no se muestra nunca; en la web funciona bien.",
  "T-1006": "Llevo tres meses usándolo, reporté problemas varias veces y nunca hubo respuesta. ¿Todavía hay alguien manteniendo este producto?",
};

const KNOWN_ISSUES = [
  "## KI-88 La exportación a CSV de la página de reportes no responde",
  "Impacto: al hacer clic en exportar el botón sigue girando; la cola de exportación del backend está saturada. Estado: corregido en 3.4.2, a la espera de publicación.",
  "Alternativa temporal: usar «Exportar XLSX» en la misma página; las columnas de datos son idénticas.",
  "",
  "## KI-91 El avatar no se muestra en móvil",
  "Impacto: en la app la URL del avatar todavía apunta al dominio CDN viejo; la web no se ve afectada. Estado: en corrección, se publicará este viernes con la versión.",
  "Alternativa temporal: cerrar sesión y volver a entrar; el avatar suele reaparecer.",
].join("\n");

function seedWorkspace() {
  fs.mkdirSync(INBOX, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(KB, { recursive: true });
  for (const [id, text] of Object.entries(TICKET_TEXT)) {
    fs.writeFileSync(path.join(INBOX, `${id}.txt`), `${text}\n`);
  }
  fs.writeFileSync(path.join(KB, "known-issues.md"), `${KNOWN_ISSUES}\n`);
}

function loadInbox() {
  return fs
    .readdirSync(INBOX)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => ({
      id: path.basename(f, ".txt"),
      text: fs.readFileSync(path.join(INBOX, f), "utf8").trim(),
    }));
}

// ============ 2. Cliente stub: SCRIPTS fija cada respuesta por id de ticket ============

const say = (text) => ({ type: "text", text });
const call = (id, name, input) => ({ type: "tool_use", id, name, input });
const turn = (stop_reason, content, inTok, outTok) => ({
  stop_reason,
  content,
  usage: { input_tokens: inTok, output_tokens: outTok },
});

const SCRIPTS = {
  // Nodo de enrutamiento: una llamada clasifica los seis. Nota: la última línea deliberadamente no es una etiqueta legal, el código la acota.
  router: [
    turn(
      "end_turn",
      [
        say(
          [
            "T-1001: billing",
            "T-1002: bug",
            "T-1003: other",
            "T-1004: billing",
            "T-1005: bug",
            "T-1006: queja",
          ].join("\n")
        ),
      ],
      624,
      96
    ),
  ],

  // trabajador de billing: consulta el pedido y luego escribe con claridad; la primera versión pasa la compuerta.
  "T-1001#1": [
    turn(
      "tool_use",
      [say("Primero consulto el historial del pedido."), call("toolu_a1", "lookup_order", { order_id: "A-77301" })],
      781,
      92
    ),
    turn(
      "end_turn",
      [
        say(
          "Respuesta al ticket T-1001: al pedido A-77301 efectivamente se le cobró dos veces este mes, 399,00 cada cobro, y el sistema lo marcó como cobro duplicado. " +
            "El cobro de más ya fue enviado a reembolso y se devolverá por el mismo medio de pago; el tiempo de acreditación depende del banco emisor, normalmente de 3 a 5 días hábiles. " +
            "Si al quinto día hábil todavía no aparece, responde en este mismo ticket y llevamos el identificador de la transacción al canal de pago."
        ),
      ],
      1124,
      168
    ),
  ],

  // trabajador de bug: consulta la base de problemas conocidos y responde; la primera versión pasa la compuerta.
  "T-1002#1": [
    turn(
      "tool_use",
      [say("Primero reviso la base de problemas conocidos."), call("toolu_b1", "read_file", { path: "kb/known-issues.md" })],
      763,
      88
    ),
    turn(
      "end_turn",
      [
        say(
          "Respuesta al ticket T-1002: diste con el problema conocido KI-88, la exportación a CSV de la página de reportes tiene la cola del backend saturada y el botón se queda girando. " +
            "La corrección ya está integrada en la 3.4.2 y se aplicará sola con la próxima publicación. Mientras tanto puedes usar «Exportar XLSX» en la misma página, con columnas idénticas. " +
            "El día de la publicación te avisamos en este mismo ticket."
        ),
      ],
      1312,
      176
    ),
  ],

  // trabajador de billing: la primera versión trae muletilla, la segunda trae la misma muletilla — los dos informes de compuerta salen idénticos.
  "T-1004#1": [
    turn(
      "tool_use",
      [say("Primero confirmo los datos de esta factura."), call("toolu_c1", "lookup_order", { order_id: "A-77420" })],
      786,
      90
    ),
    turn(
      "end_turn",
      [
        say(
          "Ticket T-1004: cambiar los datos de la factura requiere revisión del área de finanzas; ya envié la solicitud del pedido A-77420, espera un poco."
        ),
      ],
      1133,
      96
    ),
  ],
  "T-1004#2": [
    turn(
      "end_turn",
      [
        say(
          "Ticket T-1004: pasar la factura de nombre personal a nombre de la empresa obliga a que finanzas la anule y la vuelva a emitir en el sistema; la solicitud sigue en la cola de revisión, espera un poco, y en cuanto termine la revisión te envío la factura nueva a este ticket."
        ),
      ],
      1291,
      104
    ),
  ],

  // trabajador de bug: a la primera versión le falta el id del ticket, la segunda lo agrega según el informe de la compuerta.
  "T-1005#1": [
    turn(
      "tool_use",
      [say("Reviso si es un problema conocido."), call("toolu_d1", "read_file", { path: "kb/known-issues.md" })],
      752,
      86
    ),
    turn(
      "end_turn",
      [
        say(
          "Este es el problema conocido KI-91: en la app el avatar todavía apunta al dominio CDN viejo y la web no se ve afectada; la corrección se publica este viernes con la versión. " +
            "Mientras tanto cierra sesión y vuelve a entrar, con eso el avatar suele reaparecer."
        ),
      ],
      1298,
      158
    ),
  ],
  "T-1005#2": [
    turn(
      "end_turn",
      [
        say(
          "Respuesta al ticket T-1005: este es el problema conocido KI-91, en la app el avatar todavía apunta al dominio CDN viejo y la web no se ve afectada; la corrección se publica este viernes con la versión. " +
            "Mientras tanto cierra sesión y vuelve a entrar, con eso el avatar suele reaparecer. Si después de la publicación sigue en blanco, adjunta una captura a este ticket y revisamos tu cuenta."
        ),
      ],
      1466,
      172
    ),
  ],
};

function makeStubClient(queue) {
  let i = 0;
  return {
    messages: {
      async create(req) {
        if (!req.model || !req.max_tokens) {
          throw new Error("Cliente stub: create debe traer model y max_tokens");
        }
        if (i >= queue.length) {
          throw new Error(`Cola del stub agotada: la petición ${i + 1} no tiene respuesta preparada`);
        }
        await new Promise((r) => setTimeout(r, STUB_LATENCY_MS));
        return queue[i++];
      },
    },
  };
}

// Envoltorio de medición por fuera del cliente, el interior del bucle no cambia.
function metered(client) {
  const meter = { calls: 0, tokens: 0 };
  const wrapped = {
    messages: {
      async create(req) {
        const res = await client.messages.create(req);
        meter.calls += 1;
        meter.tokens += res.usage.input_tokens + res.usage.output_tokens;
        return res;
      },
    },
  };
  return { client: wrapped, meter };
}

// ============ 3. Interior del nodo: el bucle del curso 7, traído tal cual ============

async function runAgent(client, system, userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // —— Válvula 1: máximo de turnos. Al inicio del cuerpo del bucle, antes de turns++ ——
    if (turns >= MAX_TURNS) {
      return `Se alcanzó el máximo de turnos ${MAX_TURNS}, deteniendo (la tarea puede ser muy difícil o el modelo se atascó)`;
    }
    turns++;

    // Agrega al historial la respuesta completa de este turno (rol assistant)
    messages.push({ role: "assistant", content: response.content });

    // Ejecuta todos los bloques tool_use de este turno, envuelve cada uno como tool_result
    const toolResults = await runToolUses(response.content, toolImpls);

    // Todos los bloques tool_result de un turno van en el mensaje user inmediatamente siguiente
    messages.push({ role: "user", content: toolResults });

    // Envía de nuevo con el historial alargado, vuelve a la condición del while
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // stop_reason ya no es tool_use, extrae el texto final y devuelve
  return response.content.find((b) => b.type === "text")?.text ?? "";
}

async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  return Promise.all(
    toolUseBlocks.map(async (block) => {
      const impl = toolImpls[block.name];
      try {
        const output = await impl(block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error de ejecución de la herramienta: ${err.message}`,
          is_error: true,
        };
      }
    })
  );
}

// ============ 4. Dos herramientas ============

const ORDERS = {
  "A-77301": { order_id: "A-77301", amount_cents: 39900, charged_times: 2, status: "duplicate_charge", invoice_title: "Luis Martínez (particular)" },
  "A-77420": { order_id: "A-77420", amount_cents: 128000, charged_times: 1, status: "paid", invoice_title: "Luis Martínez (particular)" },
};

const TOOLS = [
  {
    name: "read_file",
    description: "Lee un archivo de texto bajo el directorio de trabajo, para consultar la base de problemas conocidos o el texto original del ticket.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Ruta relativa al directorio de trabajo" } },
      required: ["path"],
    },
  },
  {
    name: "lookup_order",
    description: "Consulta los hechos de facturación por id de pedido: monto, cantidad de cobros, estado, datos de la factura.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Id de pedido, por ejemplo A-77301" } },
      required: ["order_id"],
    },
  },
];

const toolImpls = {
  read_file({ path: rel }) {
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT)) throw new Error("Ruta fuera de límites");
    return fs.readFileSync(full, "utf8");
  },
  lookup_order({ order_id }) {
    const row = ORDERS[order_id];
    if (!row) throw new Error(`Pedido no encontrado: ${order_id}`);
    return JSON.stringify(row);
  },
};

// ============ 5. Tres prompts de delegación: objetivo / formato de salida / guía de herramientas / límites de la tarea ============

const ROUTER_PROMPT = [
  "Eres el enrutador de tickets de clientes.",
  "Objetivo: clasificar cada ticket de abajo en billing (facturación, cobros, facturas, reembolsos), bug (funcionalidad que no anda), other (todo lo demás).",
  "Formato de salida: una línea por ticket, con el formato estricto 'id_de_ticket: categoría'; la categoría debe ser billing / bug / other, no escribas razones, no emitas otro contenido.",
  "Guía de herramientas: este paso no te da herramientas, juzga solamente por el texto del ticket, no afirmes que consultaste sistemas.",
  "Límites de la tarea: solo clasificar, no escribir respuestas, no sacar conclusiones, no fusionar tickets; si tienes dudas pon other.",
].join("\n");

const WORKER_PROMPTS = {
  billing: [
    "Eres especialista en tickets de facturación y manejas un ticket a la vez.",
    "Objetivo: investigar los hechos de facturación de este ticket y producir una respuesta completa en español.",
    "Formato de salida: párrafo de texto plano que empieza con 'Respuesta al ticket <id_de_ticket>:', declara los hechos encontrados, las acciones ya tomadas y qué puede esperar la persona a continuación; sin listas de viñetas, sin cortesías.",
    "Guía de herramientas: los hechos de facturación deben salir de lookup_order, pasando el id de pedido del ticket tal cual; si no aparece dilo, no infieras montos ni cantidad de cobros a partir de la descripción del ticket.",
    "Límites de la tarea: maneja solo la parte de facturación de este ticket, no modifiques pedidos, no prometas compensaciones extra, no respondas preguntas ajenas a facturación; no escribas muletillas como 'espera un poco', 'gracias por tu paciencia' o 'lo resolveremos pronto'.",
  ].join("\n"),
  bug: [
    "Eres especialista en tickets de fallos y manejas un ticket a la vez.",
    "Objetivo: determinar si este ticket es un problema conocido y producir una respuesta completa en español.",
    "Formato de salida: párrafo de texto plano que empieza con 'Respuesta al ticket <id_de_ticket>:', declara el número de problema conocido que coincide y la conclusión, la alternativa temporal y cuándo llega la corrección; sin listas de viñetas, sin cortesías.",
    "Guía de herramientas: usa read_file para leer kb/known-issues.md y contrastar; si hay coincidencia cita el número adentro; si no coincide dilo, no inventes un número de problema.",
    "Límites de la tarea: haz solo la identificación del problema y la respuesta, no deshabilites funcionalidades, no prometas tiempos de corrección al minuto, no pidas contraseñas de la cuenta; no escribas muletillas como 'espera un poco', 'gracias por tu paciencia' o 'lo resolveremos pronto'.",
  ].join("\n"),
};

// la categoría other no entra al modelo: es una plantilla de código puro. No todo nodo tiene que ser un modelo.
const otherTemplate = (id) =>
  `Ticket ${id} recibido. Este ticket no involucra facturación ni es una falla de funcionalidad, así que se derivó al equipo de atención para seguimiento manual: ` +
  `de lunes a viernes de 9:00 a 18:00 puedes llamar al 400-000-1234 para hablar directamente, o agregar información en este ticket, donde queda registrada toda la conversación.`;

// ============ 6. Observabilidad: log estructurado JSONL + traza incremental en run-state.json ============

const RUN_ID = `run-${Date.now().toString(36)}`;

function initLog() {
  fs.writeFileSync(LOG_PATH, "");
}

function log(fields) {
  const line = { ts: new Date().toISOString(), run_id: RUN_ID, ...fields };
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(line)}\n`);
}

const state = {
  version: 1,
  run_id: RUN_ID,
  started_at: new Date().toISOString(),
  updated_at: null,
  nodes: {},
  tickets: {},
};

// Escritura atómica: primero .tmp y después rename (la práctica del curso 9)
function saveState() {
  state.updated_at = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

async function node(name, fn) {
  const t0 = Date.now();
  log({ node: name, event: "node_start" });
  const result = await fn();
  const ms = Date.now() - t0;
  state.nodes[name] = {
    ms,
    calls: result.calls ?? 0,
    tokens: result.tokens ?? 0,
    status: result.status ?? "ok",
  };
  saveState(); // Persiste una vez tras completarse cada nodo
  log({ node: name, event: "node_end", ms, calls: result.calls ?? 0, tokens: result.tokens ?? 0 });
  return result;
}

// ============ 7. Nodo uno: enrutamiento ============

async function routeNode(tickets) {
  const { client, meter } = metered(makeStubClient(SCRIPTS.router));
  const input = tickets.map((t) => `${t.id}: ${t.text}`).join("\n");
  const text = await runAgent(client, ROUTER_PROMPT, input, [], {});

  // Ajuste de la salida: solo reconoce líneas "id_de_ticket: categoría"; la categoría fuera de la lista blanca cae a other
  const parsed = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(T-\d+)\s*:\s*(\S+)\s*$/);
    if (!m) continue;
    const [, id, raw] = m;
    const category = CATEGORIES.includes(raw) ? raw : "other";
    if (category !== raw) log({ node: "route", event: "clamped", ticket: id, raw, category });
    parsed.set(id, category);
  }

  const routed = tickets.map((t) => ({ ...t, category: parsed.get(t.id) ?? "other" }));
  for (const t of routed) log({ node: "route", event: "routed", ticket: t.id, category: t.category });
  return { routed, calls: meter.calls, tokens: meter.tokens };
}

// ============ 8. Nodo dos: fan-out (seccionamiento + techo del pool de concurrencia) ============

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function callWorker(ticket, round, extra) {
  const key = `${ticket.id}#${round}`;
  const queue = SCRIPTS[key];
  if (!queue) throw new Error(`Falta el guion del stub: ${key}`);
  const { client, meter } = metered(makeStubClient(queue));
  const input = extra
    ? [
        `Abajo está tu versión anterior para el ticket ${ticket.id}:`,
        "---",
        extra.prev,
        "---",
        `El chequeo determinista no pasó, informe: ${extra.report}`,
        "Corrige solo los problemas nombrados en el informe y reescribe la respuesta completa.",
      ].join("\n")
    : `Id de ticket ${ticket.id}\nTexto original de la persona: ${ticket.text}`;
  const text = await runAgent(client, WORKER_PROMPTS[ticket.category], input, TOOLS, toolImpls);
  log({ node: extra ? "review" : "fanout", event: "worker_done", ticket: ticket.id, round, calls: meter.calls, tokens: meter.tokens });
  return { text, calls: meter.calls, tokens: meter.tokens };
}

async function fanoutNode(routed) {
  let calls = 0;
  let tokens = 0;

  const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
    if (ticket.category === "other") {
      const text = otherTemplate(ticket.id);
      log({ node: "fanout", event: "template_done", ticket: ticket.id });
      return { ticket, handler: "template", text };
    }
    const r = await callWorker(ticket, 1);
    calls += r.calls;
    tokens += r.tokens;
    return { ticket, handler: `worker:${ticket.category}`, text: r.text };
  });

  return { drafts, calls, tokens };
}

// ============ 9. Nodo tres: fusión (código puro, pasa referencias y no cargas) ============

function oneLineOf(text) {
  const head = text.split(".")[0];
  return head.length > 60 ? `${head.slice(0, 60)}…` : head;
}

function mergeNode(drafts) {
  const items = drafts.map((d) => {
    const rel = path.join("out", `${d.ticket.id}.txt`);
    fs.writeFileSync(path.join(ROOT, rel), `${d.text}\n`);
    const item = {
      id: d.ticket.id,
      category: d.ticket.category,
      handler: d.handler,
      file: rel,
      oneLine: oneLineOf(d.text),
    };
    state.tickets[item.id] = {
      category: item.category,
      handler: item.handler,
      file: item.file,
      one_line: item.oneLine,
      gate_rounds: 0,
      gate_reports: [],
      stop: null,
      status: "drafted",
    };
    log({ node: "merge", event: "collected", ticket: item.id, file: item.file, chars: d.text.length });
    return item;
  });
  return { items };
}

// ============ 10. Nodo cuatro: bucle de revisión (compuerta determinista primero, revisar-corregir-revisar) ============

function gateCheck(ticketId, reply) {
  const problems = [];
  if (!reply.includes(ticketId)) problems.push("missing_ticket_id");
  for (const w of FILLER_WORDS) {
    if (reply.includes(w)) problems.push(`filler_word:${w}`);
  }
  return { pass: problems.length === 0, report: problems.join(" | ") };
}

async function reviewNode(items, byId) {
  let calls = 0;
  let tokens = 0;
  let totalRounds = 0;

  for (const item of items) {
    const full = path.join(ROOT, item.file);
    let reply = fs.readFileSync(full, "utf8").trim(); // Carga la payload desde el archivo, no viene arrastrada del nodo anterior
    let rounds = 0;
    let lastReport = null;
    const reports = [];
    let verdict = null;
    let gate = gateCheck(item.id, reply);
    log({ node: "review", event: "gate", ticket: item.id, round: 0, pass: gate.pass, report: gate.report });

    while (!gate.pass) {
      reports.push(gate.report);
      if (rounds >= MAX_REVIEW_ROUNDS) {
        verdict = "max_rounds";
        break;
      }
      if (gate.report === lastReport) {
        verdict = "no_progress"; // Dos rondas seguidas con informe idéntico, el bucle ya no avanza
        break;
      }
      if (item.handler === "template") {
        verdict = "no_rewriter"; // La plantilla de código puro no tiene trabajador al que devolverle, se traspasa directo
        break;
      }
      lastReport = gate.report;
      rounds += 1;
      totalRounds += 1;
      const r = await callWorker(byId.get(item.id), rounds + 1, { prev: reply, report: gate.report });
      calls += r.calls;
      tokens += r.tokens;
      reply = r.text;
      fs.writeFileSync(full, `${reply}\n`);
      gate = gateCheck(item.id, reply);
      log({ node: "review", event: "gate", ticket: item.id, round: rounds, pass: gate.pass, report: gate.report });
    }

    const rec = state.tickets[item.id];
    rec.gate_rounds = rounds;
    rec.gate_reports = reports;
    rec.stop = gate.pass ? "gate_pass" : verdict;
    rec.status = gate.pass ? "pass" : "needs_human";
    rec.one_line = oneLineOf(reply);
    item.oneLine = rec.one_line;
    item.status = rec.status;
    item.rounds = rounds;
    item.stop = rec.stop;
    saveState(); // Persiste una vez tras el veredicto de cada ticket
  }

  return { items, calls, tokens, totalRounds };
}

// ============ 11. Nodo cinco: informe (código puro) ============

const pad = (s, n) => {
  const w = [...String(s)].length;
  return String(s) + " ".repeat(Math.max(1, n - w));
};

function reportNode(items, totalRounds) {
  console.log("\n=== Resumen de ejecución del grafo completo ===");
  console.log(pad("Nodo", 10) + pad("Tiempo", 9) + pad("Llamadas", 11) + pad("Tokens", 9) + pad("Rondas", 9) + "Estado");
  // El nodo de informe no entra en esta tabla: él es esta tabla; su tiempo lo registra el node() externo en run-state.json
  const order = ["route", "fanout", "merge", "review"];
  for (const name of order) {
    const n = state.nodes[name];
    if (!n) continue;
    const rounds = name === "review" ? String(totalRounds) : "-";
    console.log(pad(name, 10) + pad(`${n.ms}ms`, 9) + pad(n.calls, 11) + pad(n.tokens, 9) + pad(rounds, 9) + n.status);
  }

  console.log("\n=== Desglose por ticket ===");
  console.log(pad("Ticket", 9) + pad("Categoría", 11) + pad("Manejador", 18) + pad("Rondas", 9) + pad("Motivo de parada", 18) + "Estado");
  for (const it of items) {
    console.log(
      pad(it.id, 9) + pad(it.category, 11) + pad(it.handler, 18) + pad(it.rounds, 9) + pad(it.stop, 18) + it.status
    );
  }

  const needsHuman = items.filter((it) => it.status === "needs_human");
  console.log(`\nDirectorio de salida out/: ${items.length} respuestas; requieren traspaso a una persona: ${needsHuman.length} ticket${needsHuman.length === 1 ? "" : "s"}`);
  for (const it of needsHuman) {
    console.log(`  - ${it.id} (${it.stop}): ${it.oneLine}`);
  }
  console.log(`Traza: run-state.json / run.jsonl (run_id=${RUN_ID})`);
  return { needsHuman: needsHuman.length };
}

// ============ 12. Flujo principal: el plan son esta docena de líneas de abajo ============

async function main() {
  seedWorkspace();
  initLog();
  saveState();

  const tickets = loadInbox();
  console.log(`inbox/ recibió ${tickets.length} tickets: ${tickets.map((t) => t.id).join(", ")}`);

  const { routed } = await node("route", () => routeNode(tickets));
  console.log(`[route] ${routed.map((t) => `${t.id}=${t.category}`).join("  ")}`);

  const { drafts } = await node("fanout", () => fanoutNode(routed));
  console.log(`[fanout] techo de concurrencia ${POOL_SIZE}, produjo ${drafts.length} borradores`);

  const { items } = await node("merge", async () => mergeNode(drafts));
  console.log(`[merge] escribió ${items.length} archivos en out/, pasando aguas abajo solo referencias y resúmenes de una línea`);

  if (process.env.STOP_AFTER === "merge") {
    console.log("[stop] STOP_AFTER=merge: parando antes de la revisión, esta ejecución no da veredicto");
    process.exit(2);
  }

  const byId = new Map(routed.map((t) => [t.id, t]));
  const reviewed = await node("review", () => reviewNode(items, byId));
  console.log(`[review] reescrituras por compuerta: ${reviewed.totalRounds} rondas en total`);

  const { needsHuman } = await node("report", async () => reportNode(items, reviewed.totalRounds));

  process.exit(needsHuman > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(3); }); // Un crash sale con 3, distinto del 1 de needs_human
```

Seiscientas setenta y nueve líneas en total, de las cuales alrededor de ciento noventa son datos alimentados a los stubs (la tabla `SCRIPTS`, los textos originales de los seis tickets, la base de problemas conocidos, el cliente stub); la lógica de orquestación propiamente dicha—cinco nodos, pool de concurrencia, compuerta y punto de entrada—ronda las doscientas cincuenta líneas, y otras cuarenta y pico son observabilidad y traza de estado. Esta escala es deliberada: un bucle más unos cuantos patrones es genuinamente algo implementable en unas pocas líneas de código[^S1].

## Preparación de la verificación

Cada salida de terminal de esta lección vino de ejecuciones reales de este script, no de «ejecutar varias veces y elegir la que se ve bien», sino de fijar de antemano dos fuentes de no determinismo.

**Cambiar el modelo por un stub que reproduce una cola fija.** `SCRIPTS` es una tabla cuya clave es «id de ticket + qué versión» y cuyo valor es una secuencia de respuestas escrita de antemano; cada llamada a `messages.create` escupe la siguiente en orden, y si la cola se agota y todavía se llama, lanza directamente. Así, «qué ticket llama a qué herramienta en qué ronda, cuándo termina el modelo» son todas constantes. El stub además dejó una aserción: `create` debe traer `model` y `max_tokens`, y si falta uno lanza—el cliente real exige esos dos parámetros, el stub no te va a tapar el hueco, así que no lo descubres el día que cambias al cliente real. Este método se usa desde la práctica del curso 8 hasta aquí, de modo que lo que se verifica es tu lógica de control, no el desempeño del modelo ese día (los modelos reales son no deterministas, y la misma entrada puede dar respuestas distintas[^S3]).

El stub además agrega un retardo fijo de 60 ms que reemplaza el viaje de red real. Sin él cada nodo daría 0 ms y el efecto del pool de concurrencia no se vería en la tabla resumen—la comparación de `POOL_SIZE=1` de más arriba (491 ms frente a 246 ms) se apoya en eso.

**Dos guiones de bucle plantados en los stubs.** El bucle de revisión necesita girar de verdad, y para eso hace falta que algo falle de verdad en la compuerta. Entonces:

- `T-1005#1` (la primera versión del trabajador de bug) omite deliberadamente el id del ticket y dispara `missing_ticket_id`; `T-1005#2` agrega la línea de apertura y la segunda versión pasa—esto demuestra la salida por finalización normal de «revisar-corregir-revisar».
- `T-1004#1` y `T-1004#2` (las dos versiones del trabajador de billing) traen las dos «espera un poco». Las frases de las dos versiones son completamente distintas y de largo distinto, pero la compuerta busca si esa expresión está presente, así que las cadenas de informe de las dos rondas salen idénticas y se dispara el «no hay más progreso»—esto demuestra la salida que corta pérdidas.

La escritura de los dos guiones tiene su artesanía: no hacer que la segunda versión repita textualmente la primera (así hasta una persona vería que es un bucle muerto), sino hacerla «corregida, pero no arreglada». Este es el modo de fallo más común en los bucles reales, y es exactamente lo que atrapa el criterio de «dos rondas seguidas con informe idéntico».

**Las constantes que dependen del idioma se localizaron junto con los textos.** Tres constantes de este script están atadas al idioma de las respuestas, así que se movieron con él: `FILLER_WORDS` guarda las muletillas en español que efectivamente aparecen en las respuestas de los stubs (si se dejaran las de otro idioma, la compuerta nunca dispararía y el bucle de revisión no giraría ni una vez); `oneLineOf` corta por el punto de la oración en español; y `pad` cuenta puntos de código en vez de aplicar la regla de ancho doble, porque los acentos y la ñ ocupan una sola columna y con la regla de ancho doble las tablas quedarían desalineadas. La lógica de control no cambió en ninguno de los tres casos—cambió el dato dependiente del idioma que esa lógica consume.

**Parada temprana controlada.** `STOP_AFTER=merge` detiene el proceso después del fan-out y antes de la revisión, con código de salida 2. Es la versión simplificada del `CRASH_AFTER` del curso 9: hacer que «en qué paso se interrumpe» sea un parámetro especificable con precisión, en vez de depender de la suerte para dar con él. El `run-state.json` en estado `drafted` de más arriba salió de esa ejecución.

## Tabla de conciliación: este grafo le debe cuentas a lecciones anteriores, salda línea por línea

Cuando un curso llega a su práctica final, el error más fácil es tumbar en silencio reglas establecidas antes. Así que conciliemos línea por línea aquí, con las discrepancias escritas explícitamente.

**1. El cuerpo del bucle coincide con el curso 7.** Los cuatro pasos del cuerpo del bucle—empujar assistant, ejecutar herramientas, empujar tool_result, reasignar `response`—son palabra por palabra idénticos a la Lección 6 del curso 7, hasta los comentarios sin cambios. La válvula 1 también en su posición original. **Diferencias declaradas**: la firma de `runAgent` agregó los dos parámetros `client` y `system` (tres roles necesitan stubs distintos y prompts de sistema distintos), y la llamada a `create` agregó un campo `system`; la medición de tokens se movió del cuerpo del bucle al envoltorio `metered`, así que la válvula 2 del curso 7 (presupuesto de tokens) no siguió, y la válvula 3 (detección de giro en falso) y la válvula 4 (aprobación humana) tampoco se movieron—las herramientas de este grafo son solo leer archivo y consultar pedido, las dos operaciones de solo lectura, sin acciones de alto impacto que requieran aprobación; y la cola del stub es finita, no puede girar en falso indefinidamente. Antes de conectar la API real, esas tres válvulas hay que instalarlas de vuelta.

**2. Los cuatro elementos de los prompts de delegación están completos (Lección 4).** Los tres prompts—enrutador, trabajador de billing, trabajador de bug—escribieron cada uno las cuatro secciones completas de objetivo, formato de salida, guía de herramientas y límites de la tarea, una línea cada una, comparables línea por línea[^S2].

**3. El pool de concurrencia tiene techo, y la fusión pasa referencias y no cargas (Lección 3).** El `limit` de `runPool` es un techo duro, y la diferencia de tiempo entre `POOL_SIZE=1` y `POOL_SIZE=2` ya quedó verificada. De `merge` en adelante se pasa aguas abajo `{id, category, handler, file, oneLine}`, el texto completo se queda en `out/`, y el nodo de revisión lo lee de vuelta desde el archivo por su cuenta[^S2]. **Diferencia declarada**: el pool de la Lección 3 era «la misma tanda de subtareas ejecutadas en paralelo», aquí el pool abarca tres tipos de manejador—dos trabajadores de modelo más una plantilla de código puro, y la entrada de la plantilla al pool casi no cuesta tiempo. La semántica del pool no cambió (la cantidad de tareas en vuelo no supera el techo), apenas las tareas mismas son heterogéneas. También hay algo que la Lección 3 estableció y aquí se omitió por brevedad del script: la Lección 3 exigía un `try/catch` separado por carril, para que el fallo de un carril no arrastrara la tanda entera, y a `runPool` le falta ese envoltorio—el costo es que si en la fase de fan-out cualquier carril lanza, la tanda entera de borradores no se persiste. Antes de conectar la API real hay que agregarlo; con red real, el tiempo agotado de un carril suelto es normal.

**4. La compuerta antes del juez, y las condiciones de parada del bucle coinciden con la Lección 5.** El primer filtro es código determinista, no modelo; esta lección no instaló la capa de juez LLM porque los criterios de aceptación de esta tanda de tickets resultan expresables como reglas, e instalarla sería dinero desperdiciado—el juicio por niveles del curso 10 tiene este orden: primero lo que se puede juzgar de forma determinista, y lo que quede se le consulta al juez. Las condiciones de parada del bucle son de tres tipos: pasa, no hay más progreso, se alcanzó el máximo de rondas[^S5][^S1], y los conceptos se corresponden uno a uno con la Lección 5. **Pero los nombres de campo y de valores cambiaron**: la Lección 5 aterrizaba en el campo `reason`, con valores `passed`/`no-progress`/`max-rounds`, y aquí aterriza en el campo `stop`, con valores `gate_pass`/`no_progress`/`max_rounds` (el criterio cambió de juez a compuerta, y el guion también cambió a guion bajo según la convención snake_case de esta lección); además, el `rounds` de la Lección 5 cuenta las veces de generación, y el borrador cuenta como ronda 1, mientras que el `gate_rounds` de esta lección cuenta las veces de reescritura, y el borrador es la ronda 0, así que para un mismo ticket el punto de partida del conteo de las dos lecciones difiere en uno. **Diferencia declarada**: el código tiene una cuarta salida, `no_rewriter` (la plantilla de código puro no tiene trabajador al que devolverle). No es un patrón que la Lección 5 haya omitido, es la situación específica de este grafo—el bucle de la Lección 5 presuponía «quien produce es un modelo», y aquí una categoría de productores es una plantilla. Esta ejecución no alcanzó esa rama.

**5. La forma de hablar de «grafo» coincide con la declaración de la Lección 5.** El «grafo» y el «nodo» de todo el texto son la metáfora de ingeniería propia de esta lección, la Lección 5 ya lo declaró explícitamente al introducir este sistema visual, y no es un concepto oficial de ningún material primario; el ancla primaria sobre la que se puede parar es solo esa: el script del flujo de trabajo mismo retiene el bucle, las bifurcaciones y los resultados intermedios[^S5]. Esta lección no agregó terminología nueva—«máquina de estados» y «objetos de estado que se pasan entre nodos» no se usan; la «arista» que definió la Lección 5 (quién alimenta a quién con su salida) apareció solo una vez, al explicar el flujo de datos de `merge → review`, y no es vocabulario nuevo. `routed` / `drafts` / `items` son apenas tres variables locales corrientes.

**6. La escritura atómica de `run-state.json` coincide con el curso 9.** Primero se escribe `.tmp`, después el intercambio con `renameSync`, sin faltar un paso. El momento de escritura también sigue el calibre de ese curso: persistir una vez tras completarse cada paso pequeño, no una vez tras completarse la ejecución entera.

**7. El calibre de observabilidad tiene la misma forma que el curso 11, pero con grano más grueso.** Un evento JSON por línea, cada uno llevando `ts` y `run_id`, grepeable después del hecho. **Cuatro diferencias**: (a) el logger del curso 11 registra un resumen del contenido (forma, largo, primeros caracteres), y esta lección registra solo id, categoría, nombre de archivo, cadena de informe y contadores, sin registrar el texto completo de la respuesta—el texto completo ya está en `out/`; (b) el campo de asociación que el curso 11 llama `trace_id` aquí se llama `run_id`; (c) el núcleo de ese curso es usar `span_id`/`parent_id` para encadenar un árbol de traza, y este grafo, aunque tiene el anidamiento de tres capas nodo→trabajador→herramienta, no implementó el enlace padre-hijo, así que no hay árbol de traza; (d) `initLog()` limpia `run.jsonl` en cada ejecución y conserva solo la más reciente, así que para hacer la comparación entre ejecuciones del curso 11 (`v-good` frente a `v-bug`) habría que cambiarlo a agregar en archivos separados por `run_id`. Para conectar este grafo a un sistema de trazas real, hay que agregar los campos de span del curso 11 siguiendo ese patrón.

**8. El patrón orquestador-trabajadores esta lección no lo implementó a propósito (Lección 4).** En orquestador-trabajadores de la Lección 4, la clave es que «cuántos despachar y qué hace cada uno» lo decide el modelo mirando la entrada sobre la marcha; este grafo no es así—cómo se clasifican los seis tickets y a qué trabajador va cada categoría quedó cerrado en `CATEGORIES` y en tres prompts constantes antes de escribir la primera línea de código. Esto es precisamente la aplicación directa del «si lo puedes predefinir, no lo vuelvas dinámico» de la Lección 4: la forma de esta tanda de trabajo es conocida, así que no habría que devolverle la autoridad de decisión al modelo. Así que, en rigor, lo soldado en este archivo son cuatro patrones (encadenamiento, enrutamiento, paralelización-seccionamiento, bucle de revisión); la votación completa el quinto en el ejercicio de Nivel 2, y orquestador-trabajadores es el que queda vedado por la naturaleza de esta tanda de tareas.

## Límites

Este grafo maneja algo pequeño: un proceso, una tanda de tickets, se ejecuta y sale. Vale la pena construirlo porque los cinco pasos «llegan los tickets → clasificar → manejar por categoría → revisar → informar» quedaron cerrados antes de escribir la primera línea de código. Si la tarea se vuelve «averigua con qué se topó de verdad este cliente en los últimos seis meses, y cuántos pasos hacen falta júzgalo tú», entonces este grafo es la arquitectura equivocada—ese tipo de problema abierto, donde no puedes predecir los pasos de antemano ni fijar un camino en el código, pertenece por naturaleza a un bucle autónomo[^S1].

Varios límites, declarados explícitamente:

**El fan-out es síncrono y va a doler a escala.** El pool de `fanoutNode` debe esperar a que la tanda entera se complete antes de entrar a `merge`. Este es precisamente el cuello de botella que aquel sistema real en producción reconoció: la ejecución síncrona simplifica la coordinación, pero crea cuellos de botella en el flujo de información—un subagente que se demora una eternidad y el sistema entero atascado esperando[^S2]. Seis tickets, a lo sumo dos llamadas cada uno, y este cuello de botella no duele nada; seiscientos tickets, diez llamadas cada uno, y se vuelve «el más lento determina el tiempo de reloj de la tanda entera». Si conviene cambiar a asíncrono hay que calcular el costo: lo asíncrono deja a los agentes trabajar de forma concurrente y lanzar nuevos bajo demanda, pero agrega dificultad en la coordinación de resultados, la consistencia de estado y la propagación de errores entre los subagentes[^S2]—esos tres no existen en la versión síncrona, porque el orden lo determina el código.

**Las dos reglas del bucle de revisión son superficiales y frágiles.** `includes("espera un poco")` va a marcar mal frases como «no hace falta que esperes ni un poco, ya está resuelto». Este es el viejo problema del que advertía el curso 10: los validadores deterministas demasiado estrictos juzgan lo correcto como incorrecto. Para producción real, estas dos reglas necesitan calibrarse contra una tanda pequeña de respuestas reales, o degradarse a «marcar para que el juez lo revise de nuevo» en vez de mandarlo de vuelta a reescribir directamente.

**Cambiar a la API real es cambiar solo el stub, la estructura no se mueve.** Cambia `makeStubClient(queue)` por `new Anthropic()`, borra la tabla `SCRIPTS` entera, y el resto no cambia ni una línea—`runAgent` siempre estuvo escrito con la forma `stop_reason` / `tool_use` / `tool_result` de la API real, y `model` y `max_tokens` siempre se llevaron. Tras el cambio van a cambiar tres cosas: el resultado de la clasificación va a fluctuar (los mismos tickets, dos ejecuciones podrían caer en categorías distintas), las rondas de compuerta van a fluctuar, y el conteo de tokens va a fluctuar; una ejecución va a costar dinero y tiempo; y las tres válvulas del curso 7 que no se movieron hay que instalarlas de vuelta.

**Cada capa de complejidad agregada debe pasar la compuerta de la «mejora medible».** Cada patrón de este grafo se puede quitar por separado: sin enrutamiento, un prompt genérico también puede responder tickets; sin fan-out, ejecutarlos en serie también termina; sin bucle de revisión, la inspección manual por muestreo también es un método. Si al quitarlo bajan las métricas, y cuánto bajan, hay que probarlo para saberlo. Solo cuando la complejidad mejora genuinamente los resultados vale la pena agregarla[^S1].

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Leer el diagrama—qué pasó de verdad en el bucle

Abajo está la tabla resumen de una ejecución completa de este grafo, más los registros de dos tickets tomados de `run-state.json` (resultados de ejecución real; los milisegundos y el `run_id` cambian cada vez):

```text
=== Resumen de ejecución del grafo completo ===
Nodo      Tiempo   Llamadas   Tokens   Rondas   Estado
route     63ms     1          720      -        ok
fanout    246ms    8          8903     -        ok
merge     2ms      0          0        -        ok
review    129ms    2          3033     2        ok

=== Desglose por ticket ===
Ticket   Categoría  Manejador         Rondas   Motivo de parada  Estado
T-1001   billing    worker:billing    0        gate_pass         pass
T-1002   bug        worker:bug        0        gate_pass         pass
T-1003   other      template          0        gate_pass         pass
T-1004   billing    worker:billing    1        no_progress       needs_human
T-1005   bug        worker:bug        1        gate_pass         pass
T-1006   other      template          0        gate_pass         pass
```

```json
"T-1004": {
  "category": "billing",
  "handler": "worker:billing",
  "file": "out/T-1004.txt",
  "one_line": "Ticket T-1004: pasar la factura de nombre personal a nombre …",
  "gate_rounds": 1,
  "gate_reports": ["filler_word:espera un poco", "filler_word:espera un poco"],
  "stop": "no_progress",
  "status": "needs_human"
},
"T-1005": {
  "category": "bug",
  "handler": "worker:bug",
  "file": "out/T-1005.txt",
  "one_line": "Respuesta al ticket T-1005: este es el problema conocido KI-…",
  "gate_rounds": 1,
  "gate_reports": ["missing_ticket_id"],
  "stop": "gate_pass",
  "status": "pass"
}
```

Sin escribir código, responde tres preguntas: (1) ¿Cuáles de los seis tickets entraron al bucle de revisión, cuántas rondas giró cada uno, y de qué campo lo leíste? (2) Los `gate_rounds` de T-1004 y T-1005 son ambos 1, ¿por qué uno queda en `pass` y el otro en `needs_human`? ¿La evidencia está en qué campo y cómo se lee? (3) Supón que el proceso se mata justo después de que termina el fan-out, antes de que arranque la revisión: ¿qué puede conservar `run-state.json` y qué se pierde? Al reiniciar, ¿desde qué paso se puede reanudar?

<!-- rubric -->
- (1) Entraron T-1004 y T-1005, y cada uno giró 1 ronda; la base es que la columna `Rondas` de la tabla por ticket es distinta de cero, o que `gate_rounds` de `run-state.json` es mayor que 0; los otros cuatro están en 0, lo que significa que el borrador pasó la compuerta a la primera. El 2 de la fila `review` de la tabla resumen es la suma de 1 ronda de cada uno de esos dos
- (2) La línea divisoria es `gate_reports`, no `gate_rounds`: T-1005 tiene un solo informe, `missing_ticket_id`, lo que significa que tras la reescritura la segunda versión pasó el chequeo y no produjo un segundo informe, así que `stop` es `gate_pass`; T-1004 tiene dos entradas de contenido idéntico, `filler_word:espera un poco`, lo que significa que tras la reescritura el informe de la compuerta no cambió nada, se dispara «dos rondas seguidas con informe idéntico se juzga sin más progreso», así que `stop` es `no_progress` y `status` es `needs_human`. Hay que señalar que `gate_rounds` cuenta las veces de reescritura y `gate_reports` registra cada informe fallido (incluido el último), y que los dos no son equivalentes
- (3) Conservado: `nodes` tiene el tiempo y el consumo de los tres nodos `route` / `fanout` / `merge`; `category`, `handler`, `file` y `one_line` de los seis tickets; y los seis archivos de borrador ya persistidos en `out/`. Perdido: el veredicto de la revisión, con todos los tickets en `status: "drafted"`, `stop: null`, `gate_reports: []`. Al reiniciar se pueden leer los borradores de vuelta desde `out/` y arrancar directamente desde el nodo de revisión, sin necesidad de volver a ejecutar route ni fan-out—porque el estado se persiste una vez tras completarse cada nodo, no una vez tras completarse la ejecución entera
- Explica el sentido de esta «traza incremental»: registrar incrementalmente el resultado de cada paso durante la ejecución es precisamente la premisa para que una ejecución sea recuperable; y se empareja con la escritura atómica de «escribir .tmp y después rename» del curso 9—si te matan en ese instante, en disco está o el estado completo anterior o el nuevo

<!-- answer -->
(1) Entraron al bucle T-1004 y T-1005, y cada uno giró 1 ronda. El campo más directo es la columna `Rondas` de la tabla por ticket (en `run-state.json` corresponde a `gate_rounds`): esos dos están en 1 y los otros cuatro en 0. El 0 significa que el borrador pasó la compuerta en el primer chequeo y no se llamó de vuelta al trabajador ni una vez. Ese 2 de la fila `review` de la tabla resumen es la suma de 1 ronda de cada uno de esos dos, no que alguno haya girado dos rondas.

(2) Mirando solo `gate_rounds` efectivamente no se distingue el éxito del fracaso—cuenta «cuántas veces se llamó de vuelta al trabajador a reescribir», y si el resultado de la reescritura fue bueno o malo, eso no le importa. La evidencia real es `gate_reports`, que registra cada informe fallido, incluido el último, el que causó la parada del bucle. El arreglo de T-1005 tiene una sola entrada, `missing_ticket_id`: al borrador le faltaba el id del ticket y se lo devolvió; la segunda versión reescrita lo agregó, la compuerta pasó, no se produjo otro informe, así que `stop` queda registrado como `gate_pass` y `status` es `pass`. El arreglo de T-1004 tiene dos entradas, y las cadenas son idénticas, las dos `filler_word:espera un poco`: el borrador escribió «espera un poco» y se lo devolvió; el trabajador reescribió una versión—frase cambiada, más larga, con más explicación—pero esa expresión seguía ahí, y la compuerta devolvió un informe carácter por carácter igual al de la ronda anterior. El criterio del bucle es «el informe de esta ronda igual al de la anterior se juzga sin más progreso», así que no gastó las dos rondas de presupuesto que le quedaban, paró directamente y lo marcó `needs_human`, con `stop` registrado como `no_progress`. En una frase: `gate_rounds` cuenta las veces de reescritura, y `gate_reports` refleja si cada reescritura produjo un resultado distinto.

(3) La porción conservada no es poca. `nodes` ya tiene las cuentas completas de `route`, `fanout` y `merge` (tiempo, cantidad de llamadas al modelo, tokens); los seis tickets tienen cada uno `category`, `handler`, `file` y `one_line`; y los seis archivos de borrador del directorio `out/` están todos escritos y persistidos. Solo se perdió el tramo de revisión—todos los tickets quedaron en `status: "drafted"`, `stop: null` y `gate_reports` en arreglo vacío, sin que se haya juzgado todavía quién debería reescribir y quién debería traspasarse. Así que al reiniciar se pueden saltar por completo route y fan-out (los productos de esos dos pasos están todos en disco), leer los seis borradores de vuelta desde `out/` y entrar directamente al nodo de revisión. Esto se puede hacer por el momento de escritura del estado: persistir una vez tras completarse cada nodo, y dentro de la revisión persistir otra vez tras el veredicto de cada ticket, en vez de esperar a que la ejecución entera termine para escribir. Registrar incrementalmente el resultado de cada paso es precisamente la premisa para que una ejecución sea recuperable dentro de la misma sesión; que esta lección extienda el estado a disco es una promoción de una capa propia agregada; y emparejado con el intercambio atómico de «escribir `.tmp` y después `rename`», si te matan en cualquier momento, en disco hay un estado completo o el otro, sin dejar medio JSON que ni siquiera se pueda leer de vuelta.

<!-- hint -->
Primero distingue qué cuenta cada uno de los dos campos: uno cuenta «cuántas veces se llamó de vuelta al trabajador», el otro registra «qué dijo cada informe de chequeo». El primer número de los dos tickets es el mismo, pero el largo y el contenido del segundo campo son distintos—la diferencia se esconde ahí.

<!-- hint -->
Para la tercera pregunta no razones: mira directamente el `run-state.json` pegado de aquella ejecución con `STOP_AFTER=merge`; qué claves tienen valor y qué campos de ticket siguen en sus valores iniciales (`stop` en `null`, `gate_reports` en `[]`, `status` en `drafted`). Los que tienen valor son los conservados, y los que siguen en el valor inicial son los perdidos.

### Nivel 2: Agregar un nodo de votación al grafo

La categoría `other` tiene un ticket con el tono difícil de calibrar—T-1006: «Llevo tres meses usándolo, reporté problemas varias veces y nunca hubo respuesta. ¿Todavía hay alguien manteniendo este producto?». Responderle con una plantilla fija lo más probable es que quede inapropiado: demasiado frío parece desdén, demasiado cálido arriesga prometer de más.

Agrega un nodo de votación a este grafo: el mismo ticket, la misma tarea, ejecutada una vez desde dos ángulos[^S1], y después usa código puro para comparar las dos versiones y meter la superior en la fusión. Las reglas de comparación son solo dos y ninguna puede preguntarle al modelo: primero usa las reglas deterministas de la compuerta para eliminar (si tiene palabras prohibidas o le falta el id del ticket, queda fuera directamente), y entre los sobrevivientes elige el más corto (las respuestas de atención no divagan).

Requisitos: los prompts de los dos ángulos deben tener todos los cuatro elementos; las dos llamadas deben pasar honestamente por `runAgent` (es decir, pasar por el bucle completo), y los stubs le dan a cada una una cola de respuestas; el proceso de selección debe dejar traza en la terminal y en `run.jsonl`, para que se sepa por qué se eligió esa versión. Después de escribirlo ejecútalo de verdad una vez y pega la salida. Responde además una pregunta: ¿por qué usar comparación en código puro aquí, y no llamar a un modelo para que juzgue qué versión es mejor?

<!-- rubric -->
- Los dos ángulos son puntos de entrada distintos para la misma tarea (por ejemplo «primero recoger la emoción» frente a «solo dar los hechos»), no partir la tarea a la mitad—esto es votación, no seccionamiento
- Las dos llamadas pasan por el bucle completo de `runAgent`, y cada una tiene una cola de respuestas del stub; la cantidad de llamadas al modelo y los tokens muestran el aumento correspondiente en la tabla resumen (frente a la versión base, 2 llamadas más)
- Los prompts de los dos ángulos escriben completos los cuatro elementos de objetivo, formato de salida, guía de herramientas y límites de la tarea
- La selección es código puro: primero ejecutar `gateCheck` para eliminar, y después entre los candidatos que pasan elegir el más corto por largo; el orden de las dos reglas está escrito con claridad, y se puede declarar cuál regla jugó el papel decisivo esta vez
- Traza: la terminal tiene una línea que muestra el veredicto y el largo de cada candidato, más quién quedó elegido al final; `run.jsonl` tiene el evento estructurado correspondiente
- Los dos ángulos se ejecutan en serie, o se declara explícitamente por qué hacerlo concurrente tampoco rompe el techo del pool—no se puede abrir a escondidas otra capa de concurrencia dentro del pool, dejando la concurrencia total en `POOL_SIZE × 2`
- Declara con claridad la razón de usar código puro y no un juez: estas dos reglas (palabras prohibidas, largo) son inherentemente juzgables de forma determinista, la misma entrada da siempre el mismo resultado, no cuesta una llamada, no introduce no determinismo nuevo; el juez LLM habría que reservarlo para «¿el tono es apropiado?», ese tipo de juicio que no se puede escribir como regla, y debe ir después del chequeo determinista

<!-- answer -->
Los cambios se concentran en cuatro lugares: una constante, dos colas de respuestas del stub, dos prompts de ángulo, más una rama agregada en `fanoutNode` y dos funciones. El resto del código no se mueve ni una línea.

Primer lugar, marcar qué tickets necesitan votación:

```javascript
const CATEGORIES = ["billing", "bug", "other"];
const VOTE_TICKETS = new Set(["T-1006"]); // Tickets con tono difícil de calibrar, vale la pena ejecutar dos ángulos
```

Segundo lugar, los stubs agregan dos colas de respuestas (en `SCRIPTS`, después de `T-1005#2`):

```javascript
  // Votación: mismo ticket, dos ángulos ejecutados una vez cada uno.
  "T-1006@warm#1": [
    turn(
      "end_turn",
      [
        say(
          "Respuesta al ticket T-1006: primero una disculpa, los reportes anteriores nunca te dieron un resultado claro y eso es un problema de nuestro seguimiento. " +
            "Volví a hilar los tickets que abriste en estos tres meses y los derivé a las personas responsables de cada uno; lo resolveremos pronto y el avance queda escrito en este ticket. " +
            "El producto sigue con mantenimiento y las novedades de cada versión se consultan en el «Registro de cambios» del centro de ayuda."
        ),
      ],
      812,
      164
    ),
  ],
  "T-1006@plain#1": [
    turn(
      "end_turn",
      [
        say(
          "Respuesta al ticket T-1006: el producto sigue con mantenimiento y las novedades de cada versión se consultan en el «Registro de cambios» del centro de ayuda. " +
            "Los reportes que abriste antes no dieron resultado y eso es un problema de nuestro seguimiento; ya los consolidé de nuevo hacia las personas responsables y el avance queda escrito en este ticket."
        ),
      ],
      806,
      142
    ),
  ],
```

Tercer lugar, los dos prompts de ángulo (antes de `otherTemplate`), con los cuatro elementos completos:

```javascript
// Dos ángulos para la votación: la tarea es la misma, cambia el punto de entrada (votación de la Lección 3)
const ANGLE_PROMPTS = {
  warm: [
    "Eres especialista en tickets de clientes y manejas un ticket a la vez; esta versión toma el ángulo de «primero recoger la emoción».",
    "Objetivo: primero reconocer que el seguimiento fue insuficiente y después responder con claridad la pregunta real de la persona, si el producto sigue con mantenimiento.",
    "Formato de salida: párrafo de texto plano que empieza con 'Respuesta al ticket <id_de_ticket>:', primero la disculpa y lo que ya se hizo, después el estado del producto; sin listas de viñetas.",
    "Guía de herramientas: este paso no te da herramientas del sistema, usa solo los hechos del texto original del ticket, no afirmes que consultaste la cantidad exacta del historial de tickets.",
    "Límites de la tarea: no prometas fechas concretas de corrección, no otorgues compensaciones, no evalúes a colegas; no escribas muletillas como 'espera un poco', 'gracias por tu paciencia' o 'lo resolveremos pronto'.",
  ].join("\n"),
  plain: [
    "Eres especialista en tickets de clientes y manejas un ticket a la vez; esta versión toma el ángulo de «solo dar los hechos».",
    "Objetivo: responder directamente si el producto sigue con mantenimiento y después declarar quién le da seguimiento a estos reportes.",
    "Formato de salida: párrafo de texto plano que empieza con 'Respuesta al ticket <id_de_ticket>:', la primera frase da la conclusión y después viene el paso siguiente; sin listas de viñetas, sin fórmulas de disculpa.",
    "Guía de herramientas: este paso no te da herramientas del sistema, usa solo los hechos del texto original del ticket, no inventes números de versión.",
    "Límites de la tarea: no prometas fechas concretas de corrección, no otorgues compensaciones, no evalúes a colegas; no escribas muletillas como 'espera un poco', 'gracias por tu paciencia' o 'lo resolveremos pronto'.",
  ].join("\n"),
};
```

Cuarto lugar, dos funciones nuevas (antes de `fanoutNode`):

```javascript
async function callAngle(ticket, angle) {
  const key = `${ticket.id}@${angle}#1`;
  const queue = SCRIPTS[key];
  if (!queue) throw new Error(`Falta el guion del stub: ${key}`);
  const { client, meter } = metered(makeStubClient(queue));
  const input = `Id de ticket ${ticket.id}\nTexto original de la persona: ${ticket.text}`;
  const text = await runAgent(client, ANGLE_PROMPTS[angle], input, [], {}); // Los dos prompts de ángulo dicen "sin herramientas del sistema", así que aquí hay que pasar tools vacío, igual que en routeNode
  log({ node: "fanout", event: "vote_candidate", ticket: ticket.id, angle, chars: text.length, calls: meter.calls, tokens: meter.tokens });
  return { angle, text, calls: meter.calls, tokens: meter.tokens };
}

// Selección en código puro: primero elimina con las reglas deterministas de la compuerta, después entre los sobrevivientes elige el más corto
function pickBest(ticketId, candidates) {
  const scored = candidates.map((c) => ({ ...c, gate: gateCheck(ticketId, c.text) }));
  const alive = scored.filter((c) => c.gate.pass);
  const pool = alive.length > 0 ? alive : scored; // Si se eliminan todos, se conservan todos y que el nodo de revisión juzgue
  const winner = pool.reduce((a, b) => (b.text.length < a.text.length ? b : a));
  return { winner, scored, allFailed: alive.length === 0 };
}
```

Y al inicio del callback del pool de `fanoutNode` se agrega una rama (la rama de plantilla `other` se queda igual, T-1003 sigue pasando por ella):

```javascript
  const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
    if (VOTE_TICKETS.has(ticket.id)) {
      // Los dos ángulos se ejecutan en serie: el techo de concurrencia lo unifica el pool, no abras concurrencia a escondidas dentro del pool
      const candidates = [];
      for (const angle of ["warm", "plain"]) {
        const c = await callAngle(ticket, angle);
        calls += c.calls;
        tokens += c.tokens;
        candidates.push(c);
      }
      const { winner, scored } = pickBest(ticket.id, candidates);
      log({
        node: "fanout",
        event: "vote_pick",
        ticket: ticket.id,
        winner: winner.angle,
        detail: scored.map((c) => `${c.angle}/${c.gate.pass ? "ok" : c.gate.report}/${c.text.length}car`).join(" | "),
      });
      console.log(
        `[vote] ${ticket.id} ` +
          scored.map((c) => `${c.angle}=${c.gate.pass ? "ok" : c.gate.report}(${c.text.length}car)`).join("  ") +
          `  → elige ${winner.angle}`
      );
      return { ticket, handler: `vote:${winner.angle}`, text: winner.text };
    }
    if (ticket.category === "other") {
      const text = otherTemplate(ticket.id);
      log({ node: "fanout", event: "template_done", ticket: ticket.id });
      return { ticket, handler: "template", text };
    }
    const r = await callWorker(ticket, 1);
    calls += r.calls;
    tokens += r.tokens;
    return { ticket, handler: `worker:${ticket.category}`, text: r.text };
  });
```

Resultado de la ejecución real:

```text
\$ node orchestrate.mjs
inbox/ recibió 6 tickets: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[vote] T-1006 warm=filler_word:lo resolveremos pronto(460car)  plain=ok(353car)  → elige plain
[fanout] techo de concurrencia 2, produjo 6 borradores
[merge] escribió 6 archivos en out/, pasando aguas abajo solo referencias y resúmenes de una línea
[review] reescrituras por compuerta: 2 rondas en total

=== Resumen de ejecución del grafo completo ===
Nodo      Tiempo   Llamadas   Tokens   Rondas   Estado
route     61ms     1          720      -        ok
fanout    368ms    10         10827    -        ok
merge     3ms      0          0        -        ok
review    128ms    2          3033     2        ok

=== Desglose por ticket ===
Ticket   Categoría  Manejador         Rondas   Motivo de parada  Estado
T-1001   billing    worker:billing    0        gate_pass         pass
T-1002   bug        worker:bug        0        gate_pass         pass
T-1003   other      template          0        gate_pass         pass
T-1004   billing    worker:billing    1        no_progress       needs_human
T-1005   bug        worker:bug        1        gate_pass         pass
T-1006   other      vote:plain        0        gate_pass         pass

Directorio de salida out/: 6 respuestas; requieren traspaso a una persona: 1 ticket
  - T-1004 (no_progress): Ticket T-1004: pasar la factura de nombre personal a nombre …
Traza: run-state.json / run.jsonl (run_id=run-mteme0w4)
```

Comparado con la versión base: las llamadas al modelo de `fanout` subieron de 8 a 10, los tokens de 8903 a 10827, y el tiempo de 246 ms a 368 ms—ese es el precio de la votación, el trabajo del mismo ticket hecho dos veces. En la tabla por ticket, el manejador de T-1006 pasó de `template` a `vote:plain`.

Esta vez la primera regla decidió la victoria: la versión `warm` tiene «lo resolveremos pronto», dio con una expresión prohibida y quedó fuera directamente, y la regla del largo ni siquiera llegó a jugar. Para ver la regla del largo en acción, cambia en el stub `T-1006@warm#1` esa frase «los derivé a las personas responsables de cada uno; lo resolveremos pronto y el avance queda escrito en este ticket» por «los derivé a las personas responsables de cada uno y el avance queda escrito en este ticket» y ejecuta de nuevo; la salida real es:

```text
[vote] T-1006 warm=ok(436car)  plain=ok(353car)  → elige plain
```

Las dos versiones pasaron el chequeo determinista, así que por la segunda regla se elige la más corta, y `plain` gana con 353 caracteres frente a 436.

**¿Por qué usar comparación en código puro y no llamar a un modelo para que juzgue?** Porque estas dos reglas son inherentemente juzgables de forma determinista. «¿Hay palabras prohibidas presentes o no?», «¿qué versión es más corta?»—esas preguntas las contesta una línea de operaciones con cadenas, el mismo resultado siempre para la misma entrada, sin costar una llamada, sin agregar una espera de red, y sin introducir no determinismo nuevo—el juicio por niveles del curso 10 dice exactamente este orden: primero se juzga lo que se puede juzgar de forma determinista, y lo que queda es el turno del juez. Al revés: si el criterio de comparación pasa a ser «¿qué versión tiene un tono que da más ganas de seguir conversando?», eso efectivamente no se puede escribir como regla y habría que consultarle al juez; pero incluso entonces, el juez debería ir después de estas dos reglas deterministas—primero eliminar a los candidatos claramente no aptos, y después gastar dinero en juzgar lo que queda.

Y de paso, una trampa en la que es fácil pisar: los dos ángulos se ejecutan en serie. Si por comodidad lo escribes como `Promise.all`, las llamadas al modelo simultáneamente en vuelo del pool pasan a ser `POOL_SIZE × 2`, y el techo que creías que era 2 en realidad es 4. O en serie como aquí, o tratando también a los candidatos de la votación como tareas del pool y entregándolos a la misma planificación—en cualquier caso, el techo solo puede tener un lugar donde se declare.

<!-- hint -->
Primero deja clara la diferencia entre votación y seccionamiento: el seccionamiento parte una cosa en pedazos y cada pedazo hace solo una parte; la votación hace la misma cosa entera dos veces, apenas con puntos de entrada distintos, y al final hay que elegir una. Así que en los prompts de los dos ángulos, la línea del «objetivo» debería decir lo mismo, y la diferencia está en cómo se entra, qué se dice primero.

<!-- hint -->
Para la selección no escribas otro juego de reglas—`gateCheck` ya está ahí, tómalo directamente como primer tamiz, ejecuta los dos candidatos una vez cada uno y mira de quién es `true` el `pass`. El trabajo que queda es apenas esa frase de «entre los sobrevivientes elige el más corto», un `reduce`. Ejecútalo de verdad una vez y mira esa línea `[vote]` de la terminal, con el estado de cada candidato; ahí sabrás qué regla jugó el papel esta vez.

<!-- /exercises -->

## Resumen

- Cuatro patrones soldados en un solo archivo (la votación completa el quinto en el ejercicio, y orquestador-trabajadores está ausente a propósito porque el despacho se puede predefinir); el enunciado del «plan en el código» tiene forma concreta: la docena de líneas de `main()` son todas flujo de control, y las tres variables corrientes `routed` / `drafts` / `items` son todo el estado. Los LLM y las herramientas se orquestan a través de caminos de código predefinidos[^S1], el script mismo retiene el bucle, las bifurcaciones y los resultados intermedios, y el contexto del modelo retiene solo lo que necesita para este paso[^S5]
- No todo nodo tiene que ser un modelo: de cinco nodos, dos llaman al modelo; `merge`, `report` y el primer filtro de la compuerta son todos código puro, y la categoría `other` pasa por una plantilla de cadenas. Donde el código determinista pueda dar la misma respuesta, no hay razón para pagar el dinero y la latencia de una llamada
- El valor del enrutamiento no está en esa llamada, sino en esas diez líneas de código de ajuste posteriores a la llamada: el texto libre del modelo se comprime a una de tres etiquetas legales, y las ramas de aguas abajo solo reconocen valores que el código ya validó; los prompts especializados son el dividendo que compró la clasificación[^S1]
- La concurrencia del fan-out debe tener techo, y la fusión debe pasar referencias y no cargas—la salida aterriza en disco y aguas abajo solo van referencias livianas[^S2], y el nodo de revisión las lee de vuelta desde el archivo por su cuenta. El fan-out síncrono no duele a esta escala, pero a escala grande se vuelve cuello de botella[^S2], y cambiar a asíncrono obliga a pagar tres costos: coordinación de resultados, consistencia de estado, propagación de errores entre subagentes[^S2]
- El bucle de revisión es revisar-corregir-revisar, hasta que pase o deje de haber progreso[^S5], más una red de seguridad de máximo de rondas[^S1]. La compuerta determinista va antes del juez; el criterio de «dos rondas seguidas con informe idéntico» corta pérdidas antes que el máximo de rondas, y la conclusión que da es más informativa: no «se intentó tres veces y falla», sino «no entiende esta retroalimentación»
- La traza incremental trae recuperabilidad: persistir una vez tras completarse cada nodo es precisamente la premisa para que una ejecución se pueda continuar dentro de la misma sesión[^S5] (la continuación entre procesos y entre máquinas es una promoción de una capa propia de esta lección tras persistir el estado a disco); emparejado con el intercambio atómico de escribir `.tmp` y después `rename`, si te matan en cualquier momento el disco tiene un estado completo que se puede leer de vuelta
- Este grafo maneja un proceso, una tanda de tickets, un trabajo de pasos cerrados. Los problemas abiertos de pasos impredecibles deberían volver a bucles autónomos[^S1]; y cada capa de complejidad agregada debe pasar la compuerta de la «mejora medible»[^S1]

Las doce lecciones terminan aquí.

Mirando hacia atrás, lo que tienes ahora llegó pieza por pieza: en el curso 1 (Skills de Claude Code: construye tus propios flujos de trabajo de IA) escribiste tu primer prompt y aprendiste a enunciar requisitos con claridad; después vinieron las llamadas a herramientas, los flujos de trabajo, las Skills, la colaboración multiagente, hasta el curso 7—ese curso te hizo escribir un bucle con tus propias manos, `while (response.stop_reason === "tool_use")`, y desde ese día los agentes dejaron de ser una caja negra para ti y pasaron a ser un pedazo de código que puedes leer. El curso 8 (Ingeniería de contexto: gastar la atención finita donde cuenta) te enseñó a gestionar su contexto, a no dejar que el bucle girara hasta reventar la ventana. El curso 9 te enseñó a hacerlo sobrevivir a las interrupciones, a que si lo matan pueda continuar desde donde se quedó. El curso 10 te enseñó a verificar su salida, a separar «parece terminado» de «terminado». El curso 11 te enseñó a ver su proceso, a que cuando algo se rompa haya logs y trazas que consultar. Este curso te enseñó a componer varios bucles en un grafo que tiene el plan él mismo.

Estas seis cosas son seis caras de una sola: **dentro de un código que escribiste tú, estás controlando algo no determinista.** El bucle lo escribes tú, el contexto lo gestionas tú, los puntos de control los guardas tú, los criterios de aceptación los defines tú, los logs los imprimes tú, el plan lo dispones tú. El modelo es muy potente, pero trabaja dentro de este código de control que construiste.

El paso final aterriza en una acción concreta: cambia el `makeStubClient(queue)` de `orchestrate.mjs` por `new Anthropic()`, borra la tabla `SCRIPTS`, instala de vuelta las tres válvulas del curso 7 que no se movieron, y después vuelca en `inbox/` esa tanda real de tareas apiladas de tu trabajo—tickets reales, logs reales, pendientes reales—y ejecútalo por primera vez. Lo más probable es que unos cuantos aterricen en `needs_human`, y así es exactamente como debería verse este grafo.
