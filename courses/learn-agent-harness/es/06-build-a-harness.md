# Lección 6: Manos a la obra: escribir a mano un arnés de agente con controles

> Objetivos de aprendizaje:
> - Convertir el bucle de `stop_reason` de las lecciones anteriores en un bucle `while` funcional sobre `@anthropic-ai/sdk`, decidiendo por ti mismo si seguir llamando herramientas o devolver texto y cerrar
> - Construir bloques de contenido `tool_use` y `tool_result` exactamente según la especificación, y enviar los varios resultados de un solo turno de vuelta dentro de un mismo mensaje `user`
> - Equipar ese bucle con cuatro válvulas de control — tope de turnos, tope de presupuesto, detección de falta de progreso y aprobación para acciones de alto impacto — y decir con precisión en qué paso del bucle va cada una
>
> Requisitos: Lee las Lecciones 2 a 5; entiende el bucle guiado por `stop_reason`, las condiciones de parada, las salvaguardas de desbocamiento y la intervención human-in-the-loop | Anterior: [Lección 5 <<](./05-intervention-and-steering.md)

## Primero, cómo se ve corriendo

Las primeras cinco lecciones desarmaron la máquina pieza por pieza: cómo gira el bucle, cuándo debería detenerse, cómo se ve el desbocamiento, cómo interviene una persona. Esta lección suelda esas piezas en el arnés funcional más pequeño posible. Antes de cualquier código, mira lo que hace en una terminal — un agente cableado con dos herramientas de juguete (`get_time` reporta la hora, `read_file` lee un archivo dentro del proyecto), al que se le pasa una sola oración: «lee la primera línea de README.md, y luego dime qué hora es».

```text
$ node agent.js "Lee la primera línea de README.md, y luego dime qué hora es"

[turn 1] el modelo solicita herramienta: read_file({"path":"README.md"})
[turn 1] la herramienta devolvió: "# Fundamentos del arnés de agentes\n..."
[turn 2] el modelo solicita herramienta: get_time({})
[turn 2] la herramienta devolvió: "2026-08-26T10:42:07+08:00"
[turn 3] el modelo cierra (end_turn)

La primera línea de README.md es "# Fundamentos del arnés de agentes", y son las 10:42 del 26 de agosto de 2026.
Eso tomó 2 turnos de llamadas a herramientas a lo largo de 3 peticiones al modelo.
```

Mira de cerca lo que pasó: **la persona dijo una sola oración, y cuántas herramientas se llamaron, cuál fue primero, y cuándo detenerse los decidió todo el modelo dentro del bucle.** Esa es la línea entre un agente y un flujo de trabajo — el camino de un flujo de trabajo está fijado en código, mientras que un agente es el modelo dirigiendo dinámicamente su propio proceso y decidiendo qué herramientas usar[^S1]. El código anfitrión (el arnés que escribimos en esta lección) nunca especificó «lee el archivo primero, luego revisa la hora». Solo giró fielmente el bucle, corrió la herramienta que el modelo nombró, y devolvió el resultado. Ambas herramientas aquí son inofensivas, así que nada interrumpió la corrida — pero este arnés también tiene una válvula de aprobación soldada, y si el modelo echa mano de algo de alto impacto como borrar un archivo o disparar una petición, se detiene y espera un asentimiento humano antes de actuar (eso lo escribimos más adelante en la lección). El resto de esta lección construye, línea por línea, el código detrás de esa salida de terminal.

## El bucle central: acarrea el esqueleto, mete el SDK real

El `callModel` de la Lección 2: El bucle central: de una ida y vuelta a operación continua era pseudocódigo. Ahora se vuelve el `@anthropic-ai/sdk` de verdad. El esqueleto del bucle es idéntico: envía una petición que carga `messages`, mira `response.stop_reason` — si es `"tool_use"`, corre las herramientas, cose los resultados de vuelta, y envía de nuevo; si no lo es (digamos, `end_turn`), devuelve el texto y sal del bucle[^S2].

Aquí está la versión mínima sin ninguna válvula, para que el bucle mismo quede visible:

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // lee la clave de la variable de entorno ANTHROPIC_API_KEY

// Cambia por un id de modelo que tu cuenta de verdad pueda usar
const MODEL = "claude-sonnet-5";

async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // Agrega al historial la respuesta completa del modelo para este turno (rol assistant)
    messages.push({ role: "assistant", content: response.content });

    // Corre cada bloque tool_use de este turno, empacando cada uno en un tool_result
    const toolResults = await runToolUses(response.content, toolImpls);

    // Todos los bloques tool_result de un turno van en el único mensaje user que sigue
    messages.push({ role: "user", content: toolResults });

    // Envía de nuevo con el historial ahora más largo; el control vuelve a la verificación del while
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools,
      messages,
    });
  }

  // stop_reason ya no es tool_use — saca el texto final y devuélvelo
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

Pon esto al lado del esqueleto de la Lección 2 y la estructura no se ha movido: la línea `while` todavía dice «repite mientras `stop_reason` sea `tool_use`», y el cuerpo son todavía los mismos cuatro pasos — push del assistant, corre herramientas, push del tool_result, reasigna `response`. El único cambio sustantivo es `callModel` volviéndose `client.messages.create(...)`, más esa reasignación al final del cuerpo. Esa reasignación es lo que hace posible detenerse siquiera; quítala y `stop_reason` se queda en su valor viejo para siempre, que es exactamente el bucle muerto de la Lección 4: Desbocamiento y salvaguarda: bucles muertos, giro en vacío, agotamiento del presupuesto.

## Los campos de tool_use / tool_result, sin que falte ni uno

`runToolUses` es donde de verdad corre la herramienta que el modelo nombró. Lo más fácil de equivocar aquí son los campos del bloque de contenido, así que sigue la especificación: un bloque `tool_use` carga `id` / `name` / `input`, un bloque `tool_result` carga `tool_use_id` (declarando a qué llamada responde) y `content`, y cuando la ejecución de la herramienta falla agregas `is_error: true`[^S6]. Hay una regla dura más: por más bloques `tool_use` que contenga una respuesta, ese mismo número de bloques `tool_result` debe volver, todos empacados en el único mensaje `user` que sigue inmediatamente[^S6] — la línea `messages.push({ role: "user", content: toolResults })` del cuerpo del bucle de arriba es lo que sostiene esa regla.

```javascript
async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  // Córrelos en paralelo, pero los resultados igual se juntan en un mismo mensaje user
  return Promise.all(
    toolUseBlocks.map(async (block) => {
      const impl = toolImpls[block.name];
      try {
        const output = await impl(block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id, // la declaración: esto responde a la llamada con id block.id
          content: output,
        };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: `La ejecución de la herramienta falló: ${err.message}`,
          is_error: true, // se pone ante una falla, para que el modelo sepa que la llamada no tuvo éxito
        };
      }
    })
  );
}
```

Fíjate en el `try/catch`: que una herramienta reviente no debería llevarse todo el arnés consigo. Envuelve el error en un `tool_result` marcado `is_error: true` y devuélvelo, y el modelo obtiene una oportunidad de reintentar con argumentos distintos o tomar otra ruta. Eso es mucho más estable que lanzar y matar el proceso.

## Atornillando cuatro válvulas de control

El bucle gira ahora, pero es el bucle pelado de la Lección 2 — el que confía en el modelo y no se deja salida. Se detiene en el turno en que el modelo devuelve `end_turn`, sin ninguna frontera en medio. Y la autonomía de un agente implica costos más altos más la posibilidad de que los errores se compongan vuelta tras vuelta del bucle, con el modelo operando potencialmente durante muchos turnos[^S1] — un bucle pelado apuesta toda la decisión de detener-o-continuar al modelo, lo que es demasiado arriesgado. Ahora soldamos las cuatro válvulas de las lecciones anteriores, una a la vez.

```javascript
const MAX_TURNS = 8;        // Válvula 1: tope de turnos (Lección 3, condiciones de parada)
const TOKEN_BUDGET = 40000; // Válvula 2: presupuesto acumulado de tokens (Lección 4, agotamiento del presupuesto)

async function runAgent(userInput, tools, toolImpls, opts = {}) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;
  let tokensUsed = 0;
  let lastSignature = null; // para la válvula 3: la firma de llamadas a herramientas del turno anterior

  let response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

  while (response.stop_reason === "tool_use") {
    // —— Válvula 1: tope de turnos. Lo primero del cuerpo: antes de esta vuelta, pregunta «¿todavía se me permite girar?» ——
    if (turns >= MAX_TURNS) {
      return `Alcancé el tope de turnos de ${MAX_TURNS}, me detengo por mi cuenta (la tarea puede ser demasiado difícil, o el modelo puede estar atascado)`;
    }
    // —— Válvula 2: tope de presupuesto. Los tokens acumulados tocan el techo, detente; no quemes la billetera ——
    if (tokensUsed >= TOKEN_BUDGET) {
      return `Alcancé el presupuesto de tokens de ${TOKEN_BUDGET}, me detengo por mi cuenta`;
    }
    turns++;

    // —— Válvula 3: detección de falta de progreso. La firma de llamadas de este turno coincide con la del anterior: llámalo giro en vacío ——
    const signature = signatureOf(response.content);
    if (signature === lastSignature) {
      return `Dos turnos seguidos hicieron llamadas a herramientas idénticas (${signature}); lo llamo giro en vacío y me detengo por mi cuenta`;
    }
    lastSignature = signature;

    messages.push({ role: "assistant", content: response.content });

    // —— Válvula 4: la válvula de aprobación. Las acciones de alto impacto se confirman antes de ejecutar (desglosada abajo) ——
    const toolResults = await runToolUses(response.content, toolImpls, opts);
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: MODEL, max_tokens: 1024, tools, messages,
    });
    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
  }

  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

Cada válvula vigila una cosa, y ninguna de sus posiciones es arbitraria:

- **Válvula 1, tope de turnos** (Lección 3: Condiciones de parada: cuándo un agente debería renunciar): `turns >= MAX_TURNS` se sienta en la cima misma del cuerpo, delante de `turns++`. Significa «antes de esta vuelta, verifica si otra vuelta todavía está permitida». Esta condición de parada explícita existe para que, junto al `end_turn` propio del modelo, mantengas el control en tus propias manos[^S1].
- **Válvula 2, tope de presupuesto** (Lección 4: Desbocamiento y salvaguarda: bucles muertos, giro en vacío, agotamiento del presupuesto): cada vez que vuelve una respuesta, suma los tokens de `response.usage` y detente en el techo. Cuando los turnos son pocos pero el contexto de cada turno es enorme, el conteo de turnos por sí solo no frenará el gasto; necesitas los tokens como una compuerta aparte e independiente.
- **Válvula 3, detección de falta de progreso** (Lección 4): aplana las llamadas a herramientas de este turno en una firma y compárala con la anterior; idéntica significa giro en vacío. Esto atrapa el caso estancado donde los turnos no pasan del límite y el presupuesto no ha reventado, pero el modelo camina en el sitio, llamando la misma herramienta con los mismos argumentos una y otra vez.
- **Válvula 4, la válvula de aprobación** (Lección 5: Intervención y dirección: interrumpir, redirigir, human-in-the-loop): dentro de `runToolUses`, delante de ejecutar de verdad una herramienta, las acciones de alto impacto obtienen una confirmación humana primero. La aprobación human-in-the-loop sobre acciones de alto impacto es precisamente la manera recomendada de contener el riesgo de agencia excesiva[^S4].

La función de firma de la válvula 3 es sencilla hasta el aburrimiento — une los nombres y argumentos de cada bloque `tool_use` del turno en una sola cadena. Distinguir «qué se llamó con qué argumentos» es todo lo que necesita hacer:

```javascript
function signatureOf(content) {
  return content
    .filter((b) => b.type === "tool_use")
    .map((b) => `${b.name}(${JSON.stringify(b.input)})`)
    .sort()
    .join(" | ");
}
```

## La válvula de aprobación: encajada en el momento antes de la ejecución

De las cuatro válvulas, la posición de la válvula de aprobación es la que más importa y la más fácil de equivocar. Tiene que encajar en el momento en que el modelo nombró una herramienta pero la herramienta todavía no ha corrido — imprime la acción por ocurrir, espera a una persona, ejecuta solo tras la confirmación. Un paso más tarde y el archivo ya está escrito, la petición ya enviada, y preguntar «¿confirmar?» no tiene sentido. Así que va dentro de `runToolUses`, delante de la línea `impl(...)`:

```javascript
const HIGH_IMPACT = new Set(["write_file", "http_post", "delete_file"]);

async function runToolUses(content, toolImpls, opts = {}) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  const results = [];
  for (const block of toolUseBlocks) {
    // La válvula de aprobación: las acciones de alto impacto se confirman antes de ejecutar
    if (HIGH_IMPACT.has(block.name)) {
      const ok = await opts.approve?.(block.name, block.input);
      if (!ok) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "La persona rechazó esta acción de alto impacto; no se ejecutó.",
          is_error: true,
        });
        continue; // salta la ejecución, pero igual devuelve un tool_result — no dejes la llamada colgando
      }
    }

    try {
      const output = await toolImpls[block.name](block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: output });
    } catch (err) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `La ejecución de la herramienta falló: ${err.message}`, is_error: true,
      });
    }
  }
  return results;
}
```

`approve` es una función pasada desde afuera; en una terminal significa «imprime la acción, lee una línea de entrada»:

```javascript
import readline from "node:readline/promises";

async function approveInTerminal(name, input) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `[approve] Por correr la acción de alto impacto ${name}(${JSON.stringify(input)}) — Enter para permitir / escribe n para rechazar: `
  );
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}
```

Un detalle que importa: incluso cuando la persona rechaza, igual devuelves un `tool_result` marcado `is_error: true` en lugar de no devolver nada. La especificación exige que cada `tool_use` tenga un `tool_result` correspondiente enviado de vuelta[^S6]; sáltalo y la siguiente petición se cae porque una llamada a herramienta no tiene resultado. Rechazar no es lo mismo que ignorar — un rechazo es en sí mismo un resultado que el modelo merece conocer, y un modelo que aprende que fue rechazado a menudo cambiará a una ruta que no necesita la acción de alto impacto en absoluto.

```agentmentor-check
{
  "id": "harness-zh-06-approval-before-exec",
  "label": "Colocar la válvula de aprobación correctamente en el flujo de control del bucle",
  "prompt": "Un colega cablea la válvula de aprobación así: dentro de runToolUses, cada herramienta corre como de costumbre y produce su salida primero; luego, justo antes de que el resultado se empuje a results, las acciones de alto impacto sacan un aviso de «¿confirmar?», y si la persona dice que no, ese tool_result se marca is_error y se descarta. Argumenta: «el resultado se tira de todas formas cuando se rechaza, así que es equivalente». ¿Es correcto este cableado?",
  "whyHere": "Esta sección acaba de insistir en que la válvula de aprobación debe encajar en el momento antes de que la herramienta de verdad haya corrido. Seguirla de inmediato con un error concreto de ubicación de código — la confirmación movida después de que impl ejecuta — prueba si quien lee de verdad capta que la válvula intercepta la ejecución misma, no si el resultado se usa.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No. La aprobación tiene que completarse antes de que se llame a impl; correr primero y preguntar después significa que el efecto secundario ya aterrizó, así que confirmar no intercepta nada",
      "correct": true,
      "feedback": "Correcto. Sobre lo que actúa la válvula de aprobación es sobre ejecutar la acción misma, no sobre si aceptar su resultado. Así que tiene que sentarse delante de la línea impl(...) — llama a impl solo una vez que vuelve la aprobación, y ante un rechazo simplemente continua sin tocar impl jamás. Ese es el punto entero de la aprobación human-in-the-loop sobre acciones de alto impacto: sostener la compuerta antes de que una acción irreversible de verdad ocurra, en lugar de archivar un aviso nulo después de que ocurrió."
    },
    {
      "id": "b",
      "text": "Sí. Como un tool_result rechazado se marca como error y nunca se usa, ejecutar o no no hace diferencia; corre primero, pregunta después, mismo desenlace",
      "correct": false,
      "feedback": "El problema es que la herramienta de verdad ya corrió. Para acciones de alto impacto como write_file, http_post y delete_file, el efecto secundario aterriza en el momento en que impl retorna — el archivo está escrito, la petición salió, el registro está borrado. Preguntar «¿confirmar?» en ese punto controla solo si usas este resultado; no puede controlar un efecto secundario que ya ocurrió, lo que deja a la válvula de aprobación sin hacer nada en absoluto."
    }
  ]
}
```

## Dos herramientas de juguete, para que el bucle de verdad corra

Las válvulas están puestas; lo que falta son herramientas que el modelo pueda llamar. Esta lección usa solo dos juguetes absolutamente seguros y mantiene las operaciones peligrosas afuera: `get_time` reporta la hora actual, y `read_file` lee un archivo — con `path.resolve` clavándolo firmemente dentro del directorio del proyecto, para que el modelo (o un modelo sacado de rumbo por la salida de una herramienta) no pueda ir a leer rutas fuera de límites como `/etc/passwd`:

```javascript
import path from "node:path";
import fs from "node:fs/promises";

const ROOT = process.cwd();

const toolImpls = {
  get_time: async () => new Date().toISOString(),

  read_file: async ({ path: p }) => {
    const abs = path.resolve(ROOT, p);
    // Verificación de frontera: la ruta absoluta resuelta debe seguir dentro del directorio del proyecto
    if (!abs.startsWith(ROOT + path.sep)) {
      throw new Error(`Me niego a leer una ruta fuera del directorio del proyecto: ${p}`);
    }
    return (await fs.readFile(abs, "utf8")).slice(0, 2000);
  },
};

const tools = [
  {
    name: "get_time",
    description: "Return the current time as an ISO 8601 string",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_file",
    description: "Read the first 2000 characters of a text file inside the project directory",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Path relative to the project root" } },
      required: ["path"],
    },
  },
];
```

Ninguna de las dos herramientas está en el conjunto `HIGH_IMPACT`, así que ninguna dispara aprobación — son inofensivas por construcción. Para demostrar la válvula de aprobación, agrega un `write_file` a `toolImpls` y a `HIGH_IMPACT`. Esta lección deliberadamente evita introducir una operación de escritura real para que correr el ejemplo no pueda dañar tus archivos.

## Juntándolo todo: un punto de entrada que puedes correr con node agent.js

Por último, reúne `runAgent`, `runToolUses`, las definiciones de herramientas y la función de aprobación en un punto de entrada que puedas correr directamente — la cosa detrás de la salida de terminal del inicio de esta lección:

```javascript
async function main() {
  const userInput = process.argv[2] ?? "Lee la primera línea de README.md, y luego dime qué hora es";
  const answer = await runAgent(userInput, tools, toolImpls, {
    approve: approveInTerminal,
  });
  console.log("\n" + answer);
}

main().catch((err) => {
  console.error("el arnés se cayó:", err);
  process.exit(1);
});
```

Deja las piezas anteriores (`import`, `client`, `MODEL`, `runAgent`, `runToolUses`, `signatureOf`, `approveInTerminal`, `toolImpls`, `tools`, `main`) en un solo `agent.js`, define `ANTHROPIC_API_KEY`, corre `npm i @anthropic-ai/sdk`, y `node agent.js "tu tarea"` correrá.

Mira de nuevo estas cien y tantas líneas y notarás que ni una sola es un concepto nuevo: el bucle `while` y `stop_reason` vinieron de la Lección 2, `MAX_TURNS` de la Lección 3, el presupuesto y la detección de giro en vacío de la Lección 4, y la válvula de aprobación de la Lección 5. **Un arnés no es un marco profundo; es esta capa de bucle-más-válvulas que tú mismo escribes y controlas.** Mismo modelo, mismas dos herramientas — pero un arnés con estas cuatro válvulas y el bucle pelado de la Lección 2 pueden diferir enormemente en qué tan establemente corren la misma tarea, porque lo que decide si un agente es confiable es en gran medida esta capa externa de código de control, no solo el modelo adentro[^S5].

Mantén también un sentido de proporción sobre la complejidad: no todo agente necesita las cuatro válvulas, y una línea que vale la pena recordar es que habría que considerar agregar complejidad solo cuando mejore los resultados de forma demostrable[^S1]. Una herramienta pequeña que corre de tres a cinco turnos en un entorno controlado podría estar bien con `MAX_TURNS` solo; cuatro válvulas son para los casos que corren muchos turnos seguidos y pueden echar mano de acciones de alto impacto.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Agrega al arnés una válvula de control escalonada por herramienta

Ahora mismo la válvula de aprobación tiene dos ajustes: preguntar si es de alto impacto, permitir todo lo demás. Un colega de producto plantea un requisito más fino — control por nombre de herramienta en tres niveles: `allow` (de largo, como `get_time`), `ask` (confirmación humana requerida antes de ejecutar, como `write_file`), y `deny` (siempre rechazada, nunca llamable en absoluto, como un `send_email` retirado). Agrega esta válvula de política al arnés: diseña su estructura de datos, di en qué paso del bucle va y cómo se relaciona con la válvula de aprobación existente, y escribe qué debería volver al modelo cuando pega `deny`.

<!-- rubric -->
- Da una estructura de política capaz de expresar tres niveles (por ejemplo `{ get_time: "allow", write_file: "ask", send_email: "deny" }`), y enuncia el nivel por defecto (a qué nivel caen las herramientas no listadas)
- Coloca la válvula de política dentro de `runToolUses`, evaluada por bloque `tool_use`, antes de que impl ejecute — la misma posición que la válvula de aprobación, con el nivel `ask` reutilizando la lógica de confirmación existente
- Ante un `deny`, no ejecuta la herramienta pero igual devuelve un `tool_result` con `is_error: true` diciéndole al modelo que la herramienta está prohibida por política, en lugar de descartarla en silencio

<!-- answer -->
Estructura de datos: un mapa de nombre de herramienta a nivel, más un nivel por defecto al que caen las herramientas no listadas (de forma conservadora, tener por defecto `ask` o `deny` es razonable — solo no tengas por defecto `allow`):

```javascript
const POLICY = { get_time: "allow", read_file: "allow", write_file: "ask", send_email: "deny" };
const DEFAULT_POLICY = "ask"; // las herramientas no listadas requieren confirmación de forma conservadora
```

Posición: exactamente donde se sienta la válvula de aprobación — dentro de `runToolUses`, mientras recorre cada bloque `tool_use`, antes de que se llame a `impl`. Dos de los tres niveles, `ask` y `deny`, tienen ambos que interceptar antes de que la herramienta de verdad corra, que es el mismo momento en que intercepta la válvula de aprobación. En realidad es una generalización de la válvula de aprobación: la original equivalía a dos niveles, alto impacto = ask y todo lo demás = allow, y ahora hay un nivel `deny` también.

```javascript
for (const block of toolUseBlocks) {
  const policy = POLICY[block.name] ?? DEFAULT_POLICY;

  if (policy === "deny") {
    results.push({
      type: "tool_result", tool_use_id: block.id,
      content: `La herramienta ${block.name} está prohibida por política; no se ejecutó.`, is_error: true,
    });
    continue; // nunca toques impl en absoluto
  }
  if (policy === "ask") {
    const ok = await opts.approve?.(block.name, block.input);
    if (!ok) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: "La persona rechazó esta acción; no se ejecutó.", is_error: true,
      });
      continue;
    }
  }
  // allow, o ask que fue aprobada: ejecuta
  const output = await toolImpls[block.name](block.input);
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });
}
```

El punto clave ante un `deny` es el mismo que ante una aprobación rechazada: no ejecutes, pero igual devuelve un `tool_result` con `is_error: true`, porque cada `tool_use` debe tener un resultado correspondiente enviado de vuelta[^S6]. Un modelo al que se le dice «esta herramienta está prohibida» normalmente cambiará a una herramienta distinta o le dirá a la persona claramente que no se puede, en lugar de trabarse.

<!-- hint -->
Pregúntate primero: ¿cuáles de los tres niveles necesitan interceptar antes de que la herramienta ejecute? Tanto `deny` como `ask` lo hacen; `allow` no — así que esta válvula solo puede ir donde va la válvula de aprobación, delante de la línea `impl(...)`.

<!-- hint -->
No dejes colgando las llamadas denegadas o rechazadas. La especificación exige que cada `tool_use` de un turno tenga un `tool_result` en el siguiente mensaje user; negarse a ejecutar igual significa devolver uno (marcado `is_error`), o la siguiente petición se cae por un resultado faltante.

### Nivel 2: Qué compuertas le faltan a este bucle, y cómo se desboca

Un colega dice que el bucle de arnés de abajo «funciona», pero en el momento en que el modelo deja de devolver `end_turn` por su cuenta, o cae en caminar en el sitio, se rompe. Señala: (1) qué controles le faltan y qué comportamiento de desbocamiento produce cada ausencia; (2) el arreglo mínimo — al menos una frontera dura que garantice que el bucle se detendrá, con un enunciado claro de en qué paso va.

```javascript
async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });

  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, toolImpls);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  }
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

<!-- rubric -->
- Señala que le entrega la decisión de detener-o-continuar enteramente al `stop_reason` del modelo, sin condición de parada explícita — mientras el modelo siga devolviendo `tool_use`, gira para siempre, que es justo donde un bucle autónomo necesita que sostengas el control por separado
- Nombra al menos dos clases de desbocamiento: que el modelo nunca cierre, así que los turnos se queman sin límite (desbocamiento de turnos/presupuesto), y que las llamadas idénticas repetidas a la misma herramienta con los mismos argumentos (sin progreso) nunca se detecten
- Arreglo mínimo: agrega un contador y verificación `MAX_TURNS`, con la verificación en la cima del cuerpo del bucle delante de `turns++`, garantizando que el bucle se detendrá

<!-- answer -->
(1) Controles faltantes: aparte del `end_turn` propio del modelo, este código no tiene condición de parada explícita, ni tope de presupuesto, ni detección de falta de progreso, ni aprobación para acciones de alto impacto. Las consecuencias, una por una:

- **Sin condición de parada explícita**: mientras el modelo devuelva `tool_use` cada turno, la condición del `while` se queda verdadera y el bucle gira para siempre. La autonomía de un agente ya significa que puede operar durante muchos turnos, con costos que suben y errores que se componen[^S1], y aquí no hay ni una sola frontera dura — se apoya puramente en que el modelo se porte lo bastante bien como para cerrar.
- **Sin tope de presupuesto**: el historial crece cada vuelta (Lección 2), los tokens solo suben, y una corrida larga quemará el presupuesto sin que nadie la detenga.
- **Sin detección de falta de progreso**: si el modelo sigue llamando la misma herramienta con los mismos argumentos, caminando en el sitio, este código lo acepta todo y nunca nota el giro en vacío.
- **Sin válvula de aprobación**: si `toolImpls` contiene algo de alto impacto como `write_file`, se ejecuta sin condiciones, y un solo mal juicio puede producir un desenlace irreversible.

(2) Arreglo mínimo: agrega al menos una frontera dura que garantice que el bucle se detendrá — `MAX_TURNS`. El contador se inicializa fuera del bucle, y la verificación va en la cima misma del cuerpo, delante de `turns++`:

```javascript
const MAX_TURNS = 8;
async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;
  let response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });

  while (response.stop_reason === "tool_use") {
    if (turns >= MAX_TURNS) return `Alcancé el tope de turnos de ${MAX_TURNS}, me detengo por mi cuenta`; // frontera dura, justo en la cima
    turns++;

    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, toolImpls);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  }
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

Con esa sola adición, cierre o no el modelo y gire en vacío o no, el bucle gira a lo sumo `MAX_TURNS` vueltas y luego con certeza sale — el paso más básico para recuperar el control del modelo y llevarlo a las manos del anfitrión[^S1]. El presupuesto, la falta de progreso y la aprobación pueden apilarse encima según se necesite.

<!-- hint -->
Clava la vista en la línea `while (response.stop_reason === "tool_use")`: aparte de que el modelo elija devolver `end_turn`, ¿hay algo en absoluto que pueda volverla `false`? Si no, entonces si el bucle se detiene es enteramente decisión del modelo.

<!-- hint -->
Una frontera que «con certeza se detendrá» se apoya en un contador que el anfitrión mantiene por sí mismo, independiente de la salida del modelo. Averigua dónde debería inicializarse ese contador, dónde incrementarse, y dónde verificarse — la verificación va antes del incremento, para que no dejes pasar una vuelta de más.

<!-- /exercises -->

## Resumen

- El núcleo de un arnés funcional sigue siendo el bucle de la Lección 2: envía una petición que carga `messages` → verifica `stop_reason`, y si es `tool_use`, corre las herramientas, cose un `tool_result` de vuelta, y envía de nuevo; si no lo es, devuelve texto y cierra[^S2]. Cambiar al SDK real solo convierte `callModel` en `client.messages.create(...)`
- Los campos del bloque de contenido siguen la especificación sin que falte ninguno: `tool_use` carga `id` / `name` / `input`, `tool_result` carga `tool_use_id` / `content` más `is_error` ante una falla; por más bloques `tool_use` que tenga un turno, ese mismo número de bloques `tool_result` vuelve, todos empacados en el único mensaje `user` que sigue inmediatamente[^S6]
- Cada una de las cuatro válvulas de control vigila un punto, y sus posiciones no se pueden barajar: el tope de turnos (Lección 3) y el tope de presupuesto (Lección 4) son las fronteras duras que hacen que el bucle con certeza se detenga, la detección de falta de progreso (Lección 4) atrapa el caminar en el sitio, y la válvula de aprobación (Lección 5) tiene que encajar delante de la ejecución de la herramienta — porque la autonomía de un agente trae costos más altos y errores que se componen, y el modelo puede operar durante muchos turnos[^S1], así que el `end_turn` propio del modelo no puede sostenerlo
- La válvula de aprobación que exige confirmación humana en acciones de alto impacto es la manera recomendada de contener el riesgo de agencia excesiva[^S4]; incluso ante un rechazo, devuelve un `tool_result` con `is_error` y no dejes la llamada colgando[^S6]
- Un arnés no es un marco profundo; es esta capa de bucle-más-válvulas que tú mismo escribes y controlas — mismo modelo, código de control distinto, y la confiabilidad puede diferir enormemente[^S5]. Pero tampoco apiles válvulas por apilarlas: agrega complejidad solo cuando mejore los resultados de forma demostrable[^S1]

Terminaste este curso. De «qué es un arnés» a escribir a mano un bucle con cuatro válvulas de control, lo que sostienes ahora no es solo un conjunto de conceptos — es código real que corre, que puedes editar, y al que puedes seguir agregándole control. Conéctalo a tus propias herramientas y déjalo hacer algo de trabajo por ti.
