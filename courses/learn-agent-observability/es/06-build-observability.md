# Lección 6: Práctica: cablear una capa de observabilidad sobre el arnés

> Objetivos de aprendizaje:
> - Cablear una capa de observabilidad funcional en tu propio arnés: logs estructurados JSON Lines, árbol de trazas reconstruido desde los logs, resumen de métricas en una línea
> - Recorrer una tarea con error real desde síntoma → filtrado → primer punto de divergencia → arreglo → comparación de la reejecución (lado del modelo fijado con stubs para permitir reejecuciones completas; con APIs reales se vuelve a recuperar-desde-el-error), y explicar qué absurdos son causas frente a cuáles son contagio
> - Trazar los límites de esta capa de observabilidad: cubre un proceso, una ejecución; el contenido viene desactivado por defecto; los umbrales no se inventan
>
> Requisitos: Completar las lecciones 1–5, tener a mano y funcionando el bucle del arnés del curso 7 (Fundamentos del arnés de agentes: bucles y control) | Anterior: [Lección 5 <<](./05-hooks-and-debugging.md)

## El síntoma: una región de más en summary.md que no existe

Empecemos con un escenario concreto, de los que se huelen desde el escritorio.

Escribiste un agente pequeño para procesar informes semanales: el directorio `data/` contiene tres CSV de ventas trimestrales, el agente los lee, agrega por región y escribe `summary.md`. Tres herramientas: `list_files`, `read_file`, `write_file`. Funcionó bien durante semanas.

El lunes por la mañana, un colega pregunta en el chat: «¿De dónde salió esta región Central China? Nosotros no tenemos una región Central China».

Abres `summary.md` y, en efecto:

```text
# Resumen de ventas por región 2026 Q1

| Región | Total (¥) |
| --- | --- |
| East China | 548550 |
| Central China | 208000 |
| North China | 432600 |
| Total general | 1189150 |

Fuente de datos: archivos CSV del directorio data/
```

Abres `data/` y adentro hay tres archivos: `2026-q1-east.csv`, `2026-q1-south.csv`, `2026-q1-north.csv`, y sus contenidos tienen los nombres de región East China, South China, North China. Buscas «Central China» en todo el directorio: cero coincidencias. South China se esfumó por completo, Central China apareció de la nada y el número 208000 salió de quién sabe dónde.

La pregunta ahora es: **¿en qué paso se torció esto?**

Sin una capa de observabilidad tienes dos cosas: un `summary.md` mal escrito y la frase «el modelo se lo inventó». Esa frase no resuelve nada: no sabes si de entrada no logró leer el archivo, o si lo leyó pero calculó mal, o si leyó los tres pero mezcló filas al escribir. Y no puedes «reproducirlo con un breakpoint» para forzar la salida del bug: los agentes son no deterministas entre ejecuciones, y los mismos prompts con las mismas herramientas podrían tomar un camino completamente distinto pero igual de válido[^S1]. Lo ejecutas tres veces y las tres podrían salir bien, o la cuarta podría fallar de una manera nueva.

Peor todavía, los errores se componen. Que falle un paso puede desviar al agente hacia una trayectoria completamente distinta, y el resultado final parece no tener relación con el pequeño fallo original[^S1]. Así que no puedes quedarte mirando el punto final: el absurdo del punto final suele ser apenas **contagio** (la lección 1 lo llamó desvío de trayectoria, es lo mismo), y la lesión real está río arriba, en algún paso.

El trabajo de esta lección es convertir «no se puede decir» en «se puede verificar»: soldar una capa de observabilidad al arnés y después recorrer este bug real una vez para localizarlo. Todo lo de las cinco lecciones anteriores aterriza en un único archivo ejecutable.

## El kit de observabilidad de tres piezas: qué registrar

Cuando ejecutas agentes en producción necesitas visibilidad sobre cuatro cosas: qué herramientas llamaron, cuánto tardó cada solicitud al modelo, cuántos tokens se gastaron, dónde ocurrieron los fallos[^S6]. El enfoque oficial es exportar esto como trazas, métricas y eventos de log de OpenTelemetry; esta lección no incorpora ninguna biblioteca de OTel, armamos a mano una versión mínima de tres piezas:

1. **Logs estructurados**: una entrada JSON Lines por solicitud al modelo, una por llamada a herramienta, escritas en `run.log.jsonl`.
2. **Árbol de trazas**: terminada la ejecución, reconstruir las relaciones padre-hijo desde ese JSONL e imprimirlo indentado.
3. **Resumen de métricas**: una línea que saca rondas totales, cantidad de llamadas a herramientas, tokens, cantidad de errores y duración total.

### Modelo de spans: quién es padre de quién

Con la telemetría mejorada activada, oficialmente cada paso del bucle del agente se vuelve un span inspeccionable: una interaction es el span raíz, y las solicitudes al modelo y las ejecuciones de herramientas son sus spans hijos[^S6]. Fíjate que en el árbol oficial las solicitudes al modelo y las llamadas a herramientas son **hermanas al mismo nivel** bajo la raíz: el árbol que reconstruiste en la lección 4 tiene esa forma. Nuestra versión mínima usa deliberadamente un enganche distinto: colgamos las llamadas a herramientas de **la solicitud al modelo que las disparó**, de modo que la forma del árbol muestra directamente «qué quiso hacer el modelo en esta ronda», con las herramientas paralelas bajo el mismo padre visibles de un vistazo. El mecanismo padre-hijo es exactamente el mismo, solo elegimos otro padre para las herramientas; ambos enganches son válidos, y cuál elijas depende de qué pregunta quieras que el árbol responda primero. Nuestras tres capas se ven así:

```text
agent_run                 ← Una ejecución, registro raíz
├─ model_call turn-1      ← Un messages.create
│  └─ tool_call ...       ← Llamada a herramienta de esta solicitud al modelo
├─ model_call turn-2
│  ├─ tool_call ...       ← Varias herramientas pedidas en paralelo en la misma ronda son hermanas
│  ├─ tool_call ...
│  └─ tool_call ...
└─ model_call turn-3
```

Las relaciones padre-hijo no dependen de una pila de llamadas en memoria, dependen de dos campos en los logs: cada registro lleva un `span_id`, más un `parent_id` que apunta a su padre. El árbol se **reconstruye desde el JSONL en disco después de que termina la ejecución**, no se imprime sobre la marcha. Este punto importa: cualquier cosa visible en el árbol tuvo que registrarse primero en los logs. Si encuentras que algo falta en el árbol, no es un problema del código que imprime, es un problema del código que registra.

### Tabla de campos

El diseño de campos de abajo es el enfoque de ingeniería de esta lección, no una especificación oficial; oficialmente serían nombres de atributos de span de OTel, y cuando escribas tu propio arnés los nombres de campo los decides tú. Cuatro nombres difieren de las lecciones 3 y 4, así que mapeémoslos primero para que no los tomes por erratas: el `type` de la lección 3 se llama `kind` acá (en aquel momento había solo dos clases de registro, ahora tenemos `agent_run`, y un término semánticamente más amplio encaja mejor); `input_tokens`/`output_tokens` se pliegan en un objeto `tokens:{input,output}` (las cosas propias de la llamada al modelo empaquetadas juntas); `tool_response` se llama `tool_result` acá (el payload del hook lo llama response, pero acá el valor de retorno viene directo de la implementación de la herramienta, siguiendo la nomenclatura del bloque de contenido de la API); el `parent_span_id` de la lección 4 se acorta a `parent_id`. El costo también se dice: el `stats.mjs` de la lección 3 necesita dos cambios de nombre de campo para leer este log; esta es una demostración en vivo de que «alinear vocabulario importa más que nombrar bonito». El **vocabulario** de campos sí vale la pena alinearlo con los materiales oficiales, para que cuando termines conectando un backend no tengas que cambiar de conceptos, solo de ortografía:

| Campo | Qué contiene | Por qué lo necesitas |
| --- | --- | --- |
| `ts` | Marca de tiempo ISO | Ordenar, alinear en el tiempo, lo único que se puede alinear entre procesos |
| `trace_id` | Uno por ejecución | Ata las líneas dispersas de vuelta a la misma ejecución |
| `span_id` / `parent_id` | Id de este registro / del registro padre | Reconstruye el árbol, se apoya en él para reconocer «quién está bajo quién» |
| `kind` | `model_call` / `tool_call` / `agent_run` | Primer campo que usas al filtrar |
| `name` | `turn-2` / `read_file` | Lo primero que mira el ojo humano |
| `duration_ms` | Tiempo gastado en este paso | Encontrar cuellos de botella de rendimiento, también sirve para ver «¿está estancado?» |
| `tokens` | in / out de la llamada al modelo | El uso de tokens por sí solo es la variable explicativa individual más fuerte en los datos oficiales[^S1] |
| `tool_input` / `tool_result` | Forma + longitud + fragmento truncado | Juzgar «¿son correctos los parámetros?», «¿el retorno está vacío?» |
| `error` | Fragmento del mensaje de error, `null` si no hay | Primer campo por el que filtrar al localizar |

El truco del `trace_id` se aprendió de lo oficial: un prompt de usuario dispara varias llamadas a la API y varias herramientas, y lo oficial usa un atributo `prompt.id` para atarlas todas de vuelta al prompt disparador; el enfoque oficial de trazado también es directo: para trazar toda la actividad disparada por un solo prompt, filtra los eventos por un valor concreto de `prompt.id`[^S4]. Acá usamos `trace_id`: una ejecución es una tarea, así que usamos `trace_id`, que hace exactamente lo mismo. Por cierto, acá no hay `session_id`: una ejecución de este script es una sesión, mantener ese campo no tendría sentido; los escenarios multi-ronda y multi-sesión lo vuelven a agregar, con la referencia de vocabulario de la lección 3.

La línea de métricas tampoco se eligió al azar. Además de la exactitud de alto nivel, lo oficial recomienda recolectar: el tiempo total de ejecución de llamadas a herramientas individuales y de tareas, la cantidad total de llamadas a herramientas, el consumo total de tokens y los errores de herramientas[^S3]; estas cuatro cosas tienen su lugar de aterrizaje en la línea de resumen y en el `duration_ms` de cada registro. `rounds` es el quinto número que agregué, cómodo para ver de un vistazo cuántas iteraciones de bucle hubo. Ya usaste el conjunto oficial en el curso 10 (Verificación y aseguramiento de calidad: que no se cuele lo que «se ve bien»): allá para calificar, acá para diagnosticar con la misma regla.

### Cuánto contenido registrar: la única línea que esta lección te pide trazar a ti

`tool_input` y `tool_result` podrían ser un CSV entero, la entrada completa del usuario, un documento entero escrito. Registrarlo todo es técnicamente una línea de código, pero por defecto no habría que hacerlo.

La postura por defecto de la telemetría oficial es clara: **lo estructural siempre se registra, el contenido nunca se registra**; cada span tiene duración, nombre de modelo, nombre de herramienta y conteo de tokens registrado cuando la API devuelve datos de uso, mientras que el contenido que el agente lee y escribe por defecto no se recolecta[^S6]. Con los prompts de usuario pasa igual: por defecto solo se registra la longitud, y registrar el contenido exige una variable de entorno aparte[^S4]. Y lo oficial acompaña este tipo de interruptor con una afirmación dura: a menos que tu pipeline de observabilidad esté aprobado para almacenar los datos que maneja tu agente, deja estos sin definir[^S6].

Nuestra capa deja un compromiso: por defecto registra `shape` (si es string u objeto, qué tan largo, qué claves), `chars` (cantidad de caracteres), más un fragmento de los primeros 60 caracteres como resumen de cabecera. El fragmento está para que puedas reconocer de un vistazo «qué archivo leyó esta vez» durante tu propia depuración, sin reejecutar una y otra vez. El `HEAD_CHARS = 60` del código es donde se sitúa esa línea; ponlo en `0` y ni una palabra de contenido toca el disco. Dónde traces esa línea en tu propio proyecto depende de dónde aterrizan los logs, quién puede verlos y si se pasó la aprobación de datos: esta es una pregunta de cumplimiento normativo, no técnica.

## El montaje de verificación: dónde quedan fijadas las diferencias de las tres versiones

Esta lección se ejecuta tres veces: una normal, una con bug, una arreglada. Las tres salidas tienen que ser comparables línea por línea, así que **las respuestas del modelo no pueden ser reales**: las respuestas reales difieren cada vez y no puedes usarlas para enseñar a localizar. Siguiendo el viejo enfoque de los cursos 8 a 10 de esta serie: **cliente stub con cola de respuestas fija**. `client.messages.create()` no manda ninguna solicitud de red, devuelve en orden objetos de respuesta preescritos de un arreglo, cada uno con su `stop_reason`, `content` y `usage` completos. El bucle del arnés no cambia ni una palabra: lo que recibe tiene la misma forma que lo que devuelve un cliente real.

Todas las diferencias de las tres versiones quedan fijadas en la tabla `VERSIONS` del código, y cada versión tiene dos cosas:

| Versión | Cola de respuestas | Mensaje de error de `read_file` | Resultado |
| --- | --- | --- | --- |
| `v-good` | Los tres CSV se leen correctamente | Versión opaca | `summary.md` correcto |
| `v-bug` | El segundo nombre de archivo mal escrito como `sourth` | Versión opaca | Inventó una región Central China |
| `v-fixed` | El mismo error de tipeo `sourth` | Versión con consejo accionable | Correcto |

Fuera de esta tabla, **cada otra línea de código es compartida por las tres versiones**. Las herramientas leen y escriben disco de verdad: `list_files` hace un `readdirSync` real, `read_file` lee archivos de verdad y lanza de verdad porque el archivo no existe, `write_file` escribe `summary.md` de verdad en disco. Así que ese error de `v-bug` no es un objeto de error falsificado, es el sistema de archivos genuinamente no encontrando ese archivo.

Para que quede claro: los stubs resuelven «el lado del modelo es reproducible», no «el agente es determinista». Al ejecutar de verdad, el mismo prompt dos veces podría elegir herramientas distintas y tomar caminos distintos[^S1]. El valor de esta capa de observabilidad está justo acá: los caminos difieren cada vez, pero cada vez hay un registro para revisar.

Lo que hay que decir con claridad: los stubs fijan el lado del modelo para que las reejecuciones completas funcionen; con APIs reales se vuelve a recuperar-desde-el-error. Esta lección se anima a hacer reejecuciones completas justamente porque el lado del modelo está fijado con stubs: las reejecuciones no introducen variables nuevas y la comparación línea por línea se sostiene. Cuando conectes APIs reales, los stubs desaparecen y vuelves al enfoque de la lección 5: recuperar desde el error.

## Código completo: observed-agent.mjs

Un archivo entero, cero dependencias, se ejecuta con `node` pelado. Guárdalo como `observed-agent.mjs` y después `node observed-agent.mjs --version v-bug` lo ejecuta.

```javascript
#!/usr/bin/env node
// observed-agent.mjs —— Cablear una capa de observabilidad sobre el arnés (logs estructurados + árbol de trazas + resumen de métricas)
// Uso: node observed-agent.mjs --version v-good|v-bug|v-fixed
// Cero dependencias, se ejecuta con node pelado. Las llamadas al modelo las maneja un cliente stub con cola de respuestas fija; las diferencias entre las tres versiones están en la tabla VERSIONS de abajo.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 4096;
const MAX_ROUNDS = 12;      // Techo del bucle: superarlo significa descontrol, salida distinta de cero
const HEAD_CHARS = 60;      // Máximo de caracteres por fragmento de contenido en los logs; ponlo en 0 para no registrar ni una palabra

// ============ 1. Tarea bajo prueba: leer varios CSV de ventas de data/, agregar por región, escribir summary.md ============

const CSV_FILES = {
  "2026-q1-east.csv":
    "region,month,amount\nEast China,2026-01,182400\nEast China,2026-02,161250\nEast China,2026-03,204900\n",
  "2026-q1-south.csv":
    "region,month,amount\nSouth China,2026-01,97300\nSouth China,2026-02,88600\nSouth China,2026-03,120450\n",
  "2026-q1-north.csv":
    "region,month,amount\nNorth China,2026-01,143000\nNorth China,2026-02,150700\nNorth China,2026-03,138900\n",
};

function setupWorkspace(root) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  for (const [name, body] of Object.entries(CSV_FILES)) {
    fs.writeFileSync(path.join(root, "data", name), body);
  }
}

// ============ 2. Tres herramientas (leen/escriben disco de verdad, los errores son errores genuinos) ============

const tools = [
  {
    name: "list_files",
    description: "Lista los nombres de archivo de un directorio, devuelve en orden alfabético, uno por línea.",
    input_schema: {
      type: "object",
      properties: { dir: { type: "string", description: "Ruta relativa al directorio de trabajo, por ejemplo data" } },
      required: ["dir"],
    },
  },
  {
    name: "read_file",
    description: "Lee un archivo de texto por su ruta y devuelve el texto completo. La ruta debe usar el nombre de archivo original tal como lo devolvió list_files.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Ruta de archivo relativa al directorio de trabajo" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Escribe texto en la ruta indicada, sobrescribe el archivo del mismo nombre.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Ruta de archivo relativa al directorio de trabajo" },
        content: { type: "string", description: "Texto completo a escribir" },
      },
      required: ["path", "content"],
    },
  },
];

function resolveInRoot(root, p) {
  const abs = path.resolve(root, p);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`La ruta se escapa del límite, se rechaza el acceso: ${p}`);
  }
  return abs;
}

const impls = {
  list_files({ dir }, ctx) {
    const abs = resolveInRoot(ctx.root, dir);
    return fs.readdirSync(abs).sort().join("\n");
  },
  read_file({ path: p }, ctx) {
    const abs = resolveInRoot(ctx.root, p);
    if (fs.existsSync(abs)) return fs.readFileSync(abs, "utf8");
    // El mismo «archivo no encontrado», dos juegos de mensaje. v-fixed usa el de consejo accionable.
    if (ctx.errorStyle === "actionable") {
      const available = fs
        .readdirSync(path.join(ctx.root, "data"))
        .sort()
        .map((f) => `data/${f}`)
        .join(", ");
      throw new Error(
        `Archivo ${p} no encontrado. Actualmente en data/: ${available}. ` +
          `Reintenta con el nombre de archivo original tal como lo devolvió list_files; si los datos que necesitas realmente no están, ` +
          `detente y dile al usuario qué archivo falta, no estimes por tu cuenta los números que faltan.`
      );
    }
    throw new Error(`ENOENT: no such file or directory, open '${p}'`);
  },
  write_file({ path: p, content }, ctx) {
    const abs = resolveInRoot(ctx.root, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    return `Escrito ${p} (${content.length} caracteres)`;
  },
};

// ============ 3. Cliente stub: cola de respuestas fija ============

const SUMMARY_CORRECT = `# Resumen de ventas por región 2026 Q1

| Región | Total (¥) |
| --- | --- |
| East China | 548550 |
| South China | 306350 |
| North China | 432600 |
| Total general | 1287500 |

Fuente de datos: data/2026-q1-east.csv, data/2026-q1-south.csv, data/2026-q1-north.csv
`;

const SUMMARY_FABRICATED = `# Resumen de ventas por región 2026 Q1

| Región | Total (¥) |
| --- | --- |
| East China | 548550 |
| Central China | 208000 |
| North China | 432600 |
| Total general | 1189150 |

Fuente de datos: archivos CSV del directorio data/
`;

const say = (text) => ({ type: "text", text });
const call = (id, name, input) => ({ type: "tool_use", id, name, input });
const turn = (stop_reason, content, input_tokens, output_tokens) => ({
  id: `msg_stub_${crypto.randomBytes(3).toString("hex")}`,
  model: MODEL,
  stop_reason,
  content,
  usage: { input_tokens, output_tokens },
});

const READ_EAST = call("toolu_e", "read_file", { path: "data/2026-q1-east.csv" });
const READ_NORTH = call("toolu_n", "read_file", { path: "data/2026-q1-north.csv" });
const READ_SOUTH = call("toolu_s", "read_file", { path: "data/2026-q1-south.csv" });
const READ_TYPO = call("toolu_x", "read_file", { path: "data/2026-q1-sourth.csv" });

const VERSIONS = {
  // Viento en popa: los tres CSV se leen, la agregación es correcta.
  "v-good": {
    errorStyle: "opaque",
    queue: [
      turn("tool_use", [say("Primero veamos qué archivos hay en data/."), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("Tres CSV regionales, los leo juntos."), READ_EAST, READ_SOUTH, READ_NORTH], 946, 218),
      turn("tool_use", [say("Ya tengo las tres regiones, escribo la agregación."), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_CORRECT })], 1584, 342),
      turn("end_turn", [say("Escribí summary.md: East China 548550, South China 306350, North China 432600, total 1287500.")], 1961, 74),
    ],
  },
  // Versión con bug: el nombre del segundo CSV tiene un error de tipeo, la herramienta devuelve un error opaco, el modelo no se detiene, inventa una región y sigue escribiendo.
  "v-bug": {
    errorStyle: "opaque",
    queue: [
      turn("tool_use", [say("Primero veamos qué archivos hay en data/."), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("Tres CSV regionales, los leo juntos."), READ_EAST, READ_TYPO, READ_NORTH], 946, 218),
      turn("tool_use", [say("Los datos están completos, escribo la agregación."), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_FABRICATED })], 1602, 355),
      turn("end_turn", [say("Escribí summary.md: East China 548550, Central China 208000, North China 432600, total 1189150.")], 1990, 81),
    ],
  },
  // Versión arreglada: el mismo error de tipeo, pero el mensaje de error se cambió por el de consejo accionable, y el modelo pasa a reintentar en vez de inventar.
  "v-fixed": {
    errorStyle: "actionable",
    queue: [
      turn("tool_use", [say("Primero veamos qué archivos hay en data/."), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("Tres CSV regionales, los leo juntos."), READ_EAST, READ_TYPO, READ_NORTH], 946, 218),
      turn("tool_use", [say("Escribí mal el nombre como sourth, releo con el nombre original del mensaje de error."), READ_SOUTH], 1688, 64),
      turn("tool_use", [say("Ya tengo las tres regiones, escribo la agregación."), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_CORRECT })], 1849, 342),
      turn("end_turn", [say("Escribí summary.md: East China 548550, South China 306350, North China 432600, total 1287500. Nota al margen: al principio escribí mal el nombre como data/2026-q1-sourth.csv y reintenté con el nombre original de list_files. Si hay datos de otras regiones fuera de data/, dime dónde está el archivo, no voy a completar números por mi cuenta.")], 2226, 118),
    ],
  },
};

function makeStubClient(queue) {
  let i = 0;
  return {
    messages: {
      async create(req) {
        if (!req.model || !req.max_tokens) {
          throw new Error("Cliente stub: create debe llevar model y max_tokens");
        }
        if (i >= queue.length) {
          const err = new Error(`Cola del stub agotada: la solicitud ${i + 1} no tiene respuesta preparada`);
          err.code = "STUB_QUEUE_EXHAUSTED";
          throw err;
        }
        return queue[i++];
      },
    },
  };
}

// ============ 4. Capa de observabilidad, parte uno: logs estructurados (JSON Lines) ============

const newId = (prefix) => `${prefix}-${crypto.randomBytes(4).toString("hex")}`;

function shapeOf(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "string") return `string(${value.length})`;
  if (typeof value === "object") return `object{${Object.keys(value).join(",")}}`;
  return typeof value;
}

// Por defecto solo registra forma + longitud + fragmento de los primeros HEAD_CHARS caracteres, no el texto completo.
function summarize(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const out = { shape: shapeOf(value), chars: text.length };
  if (HEAD_CHARS > 0) {
    const flat = text.replace(/\s+/g, " ").trim();
    out.head = flat.length > HEAD_CHARS ? `${flat.slice(0, HEAD_CHARS)}…` : flat;
  }
  return out;
}

function createLogger(logPath, traceId) {
  fs.writeFileSync(logPath, "");
  return {
    record(fields) {
      const line = { ts: new Date().toISOString(), trace_id: traceId, ...fields };
      fs.appendFileSync(logPath, `${JSON.stringify(line)}\n`);
    },
  };
}

// ============ 5. Capa de observabilidad, parte dos: reconstruir el árbol de trazas desde el JSONL ============

function buildTree(records) {
  const byId = new Map(records.map((r) => [r.span_id, { ...r, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function labelOf(n) {
  const name = n.name.padEnd(13);
  const dur = `${String(n.duration_ms).padStart(3)}ms`;
  if (n.kind === "agent_run") return `agent_run  ${name}${dur}  trace_id=${n.trace_id}`;
  if (n.kind === "model_call") {
    const t = n.tokens;
    return `model_call ${name}${dur}  in=${t.input} out=${t.output}  stop=${n.stop_reason}`;
  }
  if (n.kind === "harness_error") return `harness_err ${name}${dur}  ${n.error.head ?? n.error.shape}`;
  const inHead = clip(n.tool_input.head ?? n.tool_input.shape, 34);
  const out = n.error ? `ERROR ${clip(n.error.head ?? n.error.shape, 44)}` : `ok ${n.tool_result.shape}`;
  return `tool_call  ${name}${dur}  in=${inHead}  ${out}`;
}

function renderTree(nodes, prefix, lines) {
  nodes.forEach((node, idx) => {
    const last = idx === nodes.length - 1;
    lines.push(prefix === null ? labelOf(node) : `${prefix}${last ? "└─ " : "├─ "}${labelOf(node)}`);
    const childPrefix = prefix === null ? "" : `${prefix}${last ? "   " : "│  "}`;
    renderTree(node.children, childPrefix, lines);
  });
  return lines;
}

// ============ 6. Capa de observabilidad, parte tres: resumen de métricas ============

function metricsOf(records) {
  const model = records.filter((r) => r.kind === "model_call");
  const tool = records.filter((r) => r.kind === "tool_call");
  const root = records.find((r) => r.kind === "agent_run");
  return {
    // En este arnés una ronda equivale a una solicitud al modelo, así que rounds toma directamente los model_calls;
    // cuando la cola del stub se agota y lanza harness_error, la última ronda no tiene su model_call correspondiente: en esa ejecución estos dos números difieren en 1
    rounds: model.length,
    model_calls: model.length,
    tool_calls: tool.length,
    errors: records.filter((r) => r.error).length,
    tokens_in: model.reduce((s, r) => s + r.tokens.input, 0),
    tokens_out: model.reduce((s, r) => s + r.tokens.output, 0),
    wall_ms: root ? root.duration_ms : 0,
  };
}

// ============ 7. El bucle del arnés, ya observado ============

async function runToolUses(content, ctx) {
  const results = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    const spanId = newId("span");
    const startedAt = Date.now();
    const base = {
      span_id: spanId,
      parent_id: ctx.parentId,
      kind: "tool_call",
      name: block.name,
      tool_input: summarize(block.input),
    };
    try {
      const impl = impls[block.name];
      if (!impl) throw new Error(`Herramienta desconocida: ${block.name}`);
      const result = impl(block.input, ctx);
      ctx.log.record({ ...base, duration_ms: Date.now() - startedAt, tool_result: summarize(result), error: null });
      results.push({ type: "tool_result", tool_use_id: block.id, content: result });
    } catch (e) {
      ctx.log.record({ ...base, duration_ms: Date.now() - startedAt, tool_result: null, error: summarize(e.message) });
      results.push({ type: "tool_result", tool_use_id: block.id, content: e.message, is_error: true });
    }
  }
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const version = argv[argv.indexOf("--version") + 1];
  if (!argv.includes("--version") || !VERSIONS[version]) {
    console.error("Uso: node observed-agent.mjs --version v-good|v-bug|v-fixed");
    process.exit(2);
  }

  const root = path.resolve(process.cwd(), "runs", version);
  setupWorkspace(root);

  const traceId = newId("tr");
  const log = createLogger(path.join(root, "run.log.jsonl"), traceId);
  const rootSpan = newId("span");
  const runStartedAt = Date.now();

  const { queue, errorStyle } = VERSIONS[version];
  const client = makeStubClient(queue);
  const ctx = { root, errorStyle, log, parentId: rootSpan };
  const messages = [
    {
      role: "user",
      content: "Agrega los CSV de ventas del directorio data/ en totales por región y escríbelos en summary.md. Usa únicamente datos que existan realmente en los archivos.",
    },
  ];

  let rounds = 0;
  let exitCode = 0;
  const callModel = async () => {
    const spanId = newId("span");
    const startedAt = Date.now();
    rounds += 1;
    const response = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, tools, messages });
    log.record({
      span_id: spanId,
      parent_id: rootSpan,
      kind: "model_call",
      name: `turn-${rounds}`,
      duration_ms: Date.now() - startedAt,
      stop_reason: response.stop_reason,
      tokens: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      error: null,
    });
    ctx.parentId = spanId;
    return response;
  };

  try {
    let response = await callModel();
    while (response.stop_reason === "tool_use") {
      if (rounds >= MAX_ROUNDS) throw new Error(`Se superó MAX_ROUNDS=${MAX_ROUNDS}, se juzga como descontrol`);
      messages.push({ role: "assistant", content: response.content });
      const toolResults = await runToolUses(response.content, ctx);
      messages.push({ role: "user", content: toolResults });
      response = await callModel();
    }
  } catch (e) {
    log.record({
      span_id: newId("span"),
      parent_id: rootSpan,
      kind: "harness_error",
      name: e.code ?? "harness_error",
      duration_ms: 0,
      error: summarize(e.message),
    });
    console.error(`Arnés interrumpido: ${e.message}`);
    exitCode = 2;
  }

  log.record({
    span_id: rootSpan,
    parent_id: null,
    kind: "agent_run",
    name: "sales-summary",
    duration_ms: Date.now() - runStartedAt,
    error: null,
  });

  // Terminada la ejecución, las vistas se reconstruyen solo desde el JSONL en disco: la copia en memoria no cuenta.
  const records = fs
    .readFileSync(path.join(root, "run.log.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const m = metricsOf(records);
  console.log(`\n=== Árbol de trazas (${version}, reconstruido desde run.log.jsonl) ===`);
  console.log(renderTree(buildTree(records), null, []).join("\n"));
  console.log(
    `\n=== Resumen de métricas (${version}) ===\n` +
      `rounds=${m.rounds} model_calls=${m.model_calls} tool_calls=${m.tool_calls} ` +
      `errors=${m.errors} tokens_in=${m.tokens_in} tokens_out=${m.tokens_out} ` +
      `tokens_total=${m.tokens_in + m.tokens_out} wall=${m.wall_ms}ms`
  );
  console.log(`Log: runs/${version}/run.log.jsonl  Artefacto: runs/${version}/summary.md`);
  process.exit(exitCode);
}

main();
```

Unos cuantos puntos que vale la pena señalar por separado:

- **El bucle en sí no cambió.** Ese `while (response.stop_reason === "tool_use")` del curso 7 (Fundamentos del arnés de agentes: bucles y control) no movió ni una palabra, la observabilidad se envuelve por fuera: `callModel()` registra una marca de tiempo antes y después de la solicitud, y `runToolUses()` envolvió cada bloque de herramienta con un try/catch más un cronómetro. Quítale esos dos envoltorios y lo que queda es el bucle original.
- **`MAX_ROUNDS` es una compuerta dura.** Los agentes necesitan condiciones de parada, como una cantidad máxima de iteraciones; esto es parte del control[^S2]. Superarla lanza un error, registra un `harness_error` y sale con código 2.
- **Reparto de tareas de los códigos de salida.** Este script solo se ocupa de ejecutar y registrar: si la ejecución termina, es 0; si los parámetros están mal o hay descontrol, es distinto de cero. «¿Es correcta la salida?» es trabajo de la suite verificadora del curso 10 (Verificación y aseguramiento de calidad: que no se cuele lo que «se ve bien»); fíjate que `v-bug` también sale con 0, el arnés cree que terminó sin problemas. La verificación te dice si se rompió, esta capa te dice por qué.
- **Los errores de herramienta no rompen el bucle.** Los errores se envuelven en un `tool_result` con `is_error: true` y se devuelven al modelo, y el bucle continúa. Esto es correcto: los agentes necesitan obtener «ground truth» del entorno en cada paso para evaluar su progreso[^S2], y los errores también son retroalimentación. Todo el bug de esta lección ocurre en la segunda mitad de esa frase: hubo retroalimentación, pero fue pésima.

## Primera ejecución, viento en popa: v-good

Veamos primero cómo se ve lo normal. La salida de terminal de abajo y todas las salidas de terminal siguientes **están genuinamente ejecutadas, no son ejemplos escritos a mano**.

```text
$ node observed-agent.mjs --version v-good

=== Árbol de trazas (v-good, reconstruido desde run.log.jsonl) ===
agent_run  sales-summary  1ms  trace_id=tr-cdb9b3ff
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(98)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-south.csv"}  ok string(99)
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(101)
├─ model_call turn-3         0ms  in=1584 out=342  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(35)
└─ model_call turn-4         0ms  in=1961 out=74  stop=end_turn

=== Resumen de métricas (v-good) ===
rounds=4 model_calls=4 tool_calls=5 errors=0 tokens_in=5303 tokens_out=730 tokens_total=6033 wall=1ms
Log: runs/v-good/run.log.jsonl  Artefacto: runs/v-good/summary.md
```

Tu `trace_id`, tu `span_id`, tu `ts` y los milisegundos van a diferir de los míos: los ids se generan al azar en cada ejecución y los milisegundos son duración genuina. Fuera de eso, cada línea debería coincidir palabra por palabra.

Leer este árbol hacia abajo es una sola frase completa: primero listar el directorio (`turn-1`), después **leer tres archivos en paralelo en una sola ronda** (`turn-2` con tres nodos hermanos debajo), después escribir el archivo (`turn-3`) y finalmente cerrar (`turn-4`, `stop=end_turn`). Esas tres líneas paralelas son tres bloques `tool_use` de la misma respuesta del modelo, así que su `parent_id` apunta al mismo `model_call`: la forma del árbol muestra directamente «qué quiso hacer el modelo en esta ronda».

No te tomes en serio esa columna de `0ms` en `model_call`: el cliente stub no tiene ida y vuelta de red, así que la duración de las solicitudes al modelo es toda 0. Después de conectar APIs reales esta columna gana valor diagnóstico: rastrear las duraciones de las solicitudes a la API y los tiempos de ejecución de herramientas es exactamente para encontrar cuellos de botella de rendimiento[^S4].

El archivo de log se ve así, un JSON completo por línea, se le puede hacer `grep` directamente:

```text
$ head -3 runs/v-good/run.log.jsonl
{"ts":"2026-08-29T16:48:49.414Z","trace_id":"tr-cdb9b3ff","span_id":"span-825dbd08","parent_id":"span-1702ebc8","kind":"model_call","name":"turn-1","duration_ms":0,"stop_reason":"tool_use","tokens":{"input":812,"output":96},"error":null}
{"ts":"2026-08-29T16:48:49.415Z","trace_id":"tr-cdb9b3ff","span_id":"span-0fb9c9d4","parent_id":"span-825dbd08","kind":"tool_call","name":"list_files","tool_input":{"shape":"object{dir}","chars":14,"head":"{\"dir\":\"data\"}"},"duration_ms":0,"tool_result":{"shape":"string(52)","chars":52,"head":"2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv"},"error":null}
{"ts":"2026-08-29T16:48:49.415Z","trace_id":"tr-cdb9b3ff","span_id":"span-d2034727","parent_id":"span-1702ebc8","kind":"model_call","name":"turn-2","duration_ms":0,"stop_reason":"tool_use","tokens":{"input":946,"output":218},"error":null}
```

La línea dos es ese `list_files`: su `parent_id` apunta al `span_id` de la línea uno (así que cuelga de `turn-1`), y adentro `tool_input` solo tiene forma, longitud y un fragmento chico, igual que `tool_result`: `shape` es `string(52)` y `head` tiene los tres nombres de archivo. Ni un byte de esta línea es «contenido de archivo», y sin embargo ya puedes responder «qué llamó este paso, qué forma de cosa recibió, si dio error».

Mira otra vez la línea del resumen de métricas: 4 rondas, 5 llamadas a herramientas, 0 errores, 6033 tokens, y al final de la línea también la duración total. Vale la pena echarle un vistazo a esta línea de números cada vez que termina una ejecución: la cantidad de llamadas a herramientas puede exponer rutinas fijas que el agente recorre repetidamente, y un montón de llamadas redundantes suele sugerir que habría que ajustar los parámetros de paginación o de límite de tokens; mientras que un montón de errores de parámetros inválidos podría decir que las descripciones de herramientas habría que escribirlas más claras y dar los ejemplos más completos[^S3]. Los tokens especialmente valen la pena mirarlos: al analizar el rendimiento de las evaluaciones, lo oficial encontró que el uso de tokens por sí solo explica el 80% de la varianza, y los otros dos factores explicativos son la cantidad de llamadas a herramientas y la elección del modelo[^S1].

```agentmentor-check
{
  "id": "obs-zh-06-log-everything",
  "label": "Cuánto de la entrada y salida de las herramientas habría que registrar",
  "prompt": "Acabas de cablear esta capa de observabilidad en tu proyecto. Un colega mira el log y dice que tool_input y tool_result con solo el fragmento de los primeros 60 caracteres es demasiado tacaño, y propone cambiarlo para registrar la entrada/salida completa de cada llamada a herramienta: «total, el disco es barato, registrar todo no puede hacer daño, y cuando algo se rompa de verdad va a estar todo ahí». ¿Qué le respondes?",
  "whyHere": "El lector acaba de ver un run.log.jsonl real, donde el campo head efectivamente está truncado; esta es la única decisión de diseño de la capa de observabilidad de esta lección en la que la línea la trazas tú, y también el lugar donde es más fácil dejarse llevar por la intuición de «registrar todo no puede hacer daño», un buen punto para comprobar si entendió la postura por defecto y las precondiciones para activar el texto completo",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "De acuerdo, el disco de verdad es barato, registrar el texto completo es lo más confiable, y cuando algo se rompa no hace falta reejecutar para reconstruir la escena",
      "correct": false,
      "feedback": "«Registrar todo no puede hacer daño» solo se sostiene en la dimensión del disco. Lo que queda sentado en los logs es contenido de negocio que el agente leyó y escribió: entrada de usuarios, contenido de archivos, documentos redactados; una vez que eso aterriza en un lugar aprobado solo como «logs operativos», se convierte en una copia no gestionada de datos sensibles. Y los archivos se inflan rápido: una ejecución son decenas de registros, cada uno metiendo unos KB de texto completo, y después de miles de ejecuciones hasta un solo grep tarda una eternidad, con lo cual en realidad es más difícil de buscar. Cuando genuinamente necesitas el texto completo, lo correcto es leer la transcripción de la sesión, no acumular una copia en los logs de telemetría."
    },
    {
      "id": "b",
      "text": "Por defecto se sigue registrando estructura y fragmento —forma, longitud, primeras decenas de caracteres—, y eso alcanza para localizar «qué paso, qué parámetro, si el retorno está vacío»; para registrar el texto completo, primero confirma que el lugar donde aterrizan los logs está aprobado para almacenar este tipo de datos, y cuando una revisión puntual necesite el texto completo ve a leer la transcripción de la sesión",
      "correct": true,
      "feedback": "Bien. La postura por defecto de la telemetría oficial es exactamente esta: lo estructural, como duración, nombre de modelo y nombre de herramienta, se registra en cada span, y el conteo de tokens se registra cuando la API devuelve datos de uso, mientras que el contenido que el agente lee y escribe por defecto no se recolecta; con los prompts de usuario pasa igual, por defecto solo se registra la longitud, y registrar el contenido exige activar un interruptor aparte. Y la afirmación oficial para este tipo de interruptor es «a menos que tu pipeline de observabilidad esté aprobado para almacenar los datos que maneja tu agente, deja estos sin definir»: es una restricción de cumplimiento normativo, no una sugerencia de rendimiento. Aquello de lo que genuinamente depende la localización es la estructura: qué paso, qué parámetros, qué forma de retorno, si dio error. El texto completo solo hace falta durante revisiones puntuales, y para eso ve a leer la transcripción."
    },
    {
      "id": "c",
      "text": "Al revés, no registrar ni una palabra de contenido, alcanza con contar cuántas veces se llamó a cada herramienta, y el resto apoyarse en la reejecución para reproducir",
      "correct": false,
      "feedback": "Es pasarse de corrección, y «apoyarse en la reejecución para reproducir» es un camino que no funciona con agentes: el mismo prompt en dos ejecuciones va a tomar caminos distintos pero igual de válidos, y podrías reejecutar diez veces y obtener diez resultados correctos. Con solo estadísticas de cantidad de llamadas, ni siquiera puedes responder «por qué camino pasó ese read_file que dio error», y todo el proceso de localización de esta lección se rompe en el primer paso. La verdadera línea divisoria no es «registrar o no», es «registrar estructura o registrar contenido»: forma, longitud, nombres de parámetros y mensajes de error pertenecen a la estructura y permiten localizar; el contenido de los archivos y las palabras textuales del usuario pertenecen al contenido y por defecto no se escriben en disco."
    }
  ]
}
```

## Reproducir el síntoma: v-bug

Ahora ejecutemos la versión con bug. La cola del stub tiene enterrada la divergencia real del inicio de la lección; no espíes primero, encuéntrala tú desde la salida.

```text
$ node observed-agent.mjs --version v-bug

=== Árbol de trazas (v-bug, reconstruido desde run.log.jsonl) ===
agent_run  sales-summary  1ms  trace_id=tr-ebad58f6
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(98)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(101)
├─ model_call turn-3         0ms  in=1602 out=355  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(35)
└─ model_call turn-4         0ms  in=1990 out=81  stop=end_turn

=== Resumen de métricas (v-bug) ===
rounds=4 model_calls=4 tool_calls=5 errors=1 tokens_in=5350 tokens_out=750 tokens_total=6100 wall=1ms
Log: runs/v-bug/run.log.jsonl  Artefacto: runs/v-bug/summary.md
```

El artefacto está efectivamente mal:

```text
$ cat runs/v-bug/summary.md
# Resumen de ventas por región 2026 Q1

| Región | Total (¥) |
| --- | --- |
| East China | 548550 |
| Central China | 208000 |
| North China | 432600 |
| Total general | 1189150 |

Fuente de datos: archivos CSV del directorio data/
```

Fíjate primero en unas cuantas cosas invisibles desde afuera:

- La cantidad de rondas y la cantidad de llamadas a herramientas son idénticas a `v-good`: 4 rondas, 5 llamadas. Mirando solo esos dos números, las dos ejecuciones se ven iguales.
- Los tokens suben apenas 67 (6100 frente a 6033). Si tu alerta es «los tokens superan un umbral», esta ni siquiera sonaría.
- Solo `errors=1`, ese único número cambió. Por esto los errores de herramienta tienen que ser ciudadanos de primera clase en las métricas[^S3]: es la única señal a nivel de resumen de que esta ejecución se ve mal.
- Ese último `model_call` es `stop=end_turn`: el agente cree que **completó la tarea con éxito**. No dio error, no pidió ayuda, no mencionó que le faltaba un pedazo de datos. Lo que omite en su retroalimentación suele ser más importante que lo que incluye[^S3].

## Localización en cinco pasos: del rastreo del síntoma al primer punto de divergencia

La localización en cinco pasos de la lección 5 es una orquestación general; los materiales de esta ronda son especiales —tres logs comparables línea por línea en la mano—, así que tres de los cinco pasos cambian de forma, escritos uno al lado del otro:

| Pasos generales de la lección 5 | Forma en esta ronda | Por qué cambia |
| --- | --- | --- |
| 1 Acotar | Fijar esta única ejecución | Igual, filtrar por id |
| 2 Encontrar el primer punto de divergencia | Identificarlo en el árbol | Igual, solo que la evidencia pasó a ser un árbol |
| 3 Reproducir y observar | Reconocer lo de río abajo como contagio | Los stubs son en sí mismos una reproducción fijada, y el lugar de este paso se le cede al análisis de contagio |
| 4 Machacar repetidamente el mismo componente | Determinar la causa | Los tres logs se comparan línea por línea, no hace falta machacar para forzar la salida de fallos probabilísticos |
| 5 Tras el arreglo, recuperar desde el error | Comparación de la reejecución | Ver abajo: no se contradicen, difieren las condiciones de aplicación |

El paso cinco necesita explicación aparte. La lección 5 aboga por «después de arreglar, recuperar desde el error, no reejecutar desde cero», y la razón es que las reejecuciones completas reintroducen no determinismo y no puedes distinguir «lo arreglé bien» de «esta vez tuve suerte». Esta lección se anima a hacer reejecuciones completas justamente porque el lado del modelo está fijado con stubs: las reejecuciones no introducen variables nuevas y la comparación línea por línea se sostiene. Cuando conectes APIs reales, los stubs desaparecen y vuelves al enfoque de la lección 5: recuperar desde el error.

Aterrizado en los materiales de esta ronda, quedan los cinco pasos de abajo. Haz de cuenta que todavía no sabes la respuesta y recórrelos una vez.

### Paso uno: fijar esta única ejecución

En un entorno de producción, los logs de todas las ejecuciones se mezclan en un solo flujo. Simulemos primero esa situación fusionando los logs de las tres ejecuciones:

```text
$ cat runs/v-good/run.log.jsonl runs/v-bug/run.log.jsonl runs/v-fixed/run.log.jsonl > all-runs.log.jsonl
$ wc -l < all-runs.log.jsonl
      32
$ grep -c 'tr-ebad58f6' all-runs.log.jsonl
10
```

De 32 líneas, solo 10 pertenecen a la ejecución con bug. Este paso usa el enfoque de trazado que da lo oficial: para trazar toda la actividad disparada por un prompt, filtra los eventos por ese id concreto[^S4]. Que se llame `prompt.id` o `trace_id` no importa; lo que importa es que ese id exista y que cada registro lo lleve.

Ya que estamos, podemos revisar cuántos errores hay en todo el flujo:

```text
$ grep -c '"error":{"shape"' all-runs.log.jsonl
2
```

Dos: uno de `v-bug`, uno de `v-fixed`. `v-good` impecable.

### Paso dos: identificar el primer punto de divergencia en el árbol

El árbol ya está impreso; recórrelo de arriba abajo y encuentra el **primer registro que no coincide con lo esperado**:

```text
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
```

Bajo `turn-2` hay tres lecturas paralelas y la del medio se rompió. La razón está escrita en `tool_input`: la ruta es `data/2026-q1-sourth.csv`, con `south` mal escrito como `sourth`. Esa línea de `list_files` en el árbol solo muestra `ok string(52)`, y los nombres de archivo correctos hay que ir a excavarlos a los logs: saca ese registro (ya lo viste en el `head -3` de arriba) y su `tool_result.head` dice `2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv`: el modelo sí recibió el nombre correcto. El árbol se ocupa de localizar, los logs se ocupan de los detalles, y las dos capas cooperan exactamente así.

Para ver ese registro completo, péscalo del flujo:

```text
$ node -e '
const fs = require("node:fs");
const TRACE = "tr-ebad58f6";
for (const line of fs.readFileSync("all-runs.log.jsonl", "utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(line);
  if (r.trace_id === TRACE && r.error) console.log(r.kind, r.name, r.tool_input.head, "->", r.error.head);
}'
tool_call read_file {"path":"data/2026-q1-sourth.csv"} -> ENOENT: no such file or directory, open 'data/2026-q1-sourth…
```

Este es el punto de divergencia. Fíjate en **cómo se reconoció**: no adivinando, sino con tres campos: `trace_id` acota el alcance a esta única ejecución, que `error` sea distinto de null lo distingue entre los diez registros, y `tool_input.head` te dice dónde se torcieron los parámetros. Tres campos, ninguno prescindible.

### Paso tres: reconocer los absurdos de río abajo como contagio, no arreglarlos por separado

Después del punto de divergencia, en `turn-3` el modelo escribe una agregación con una región Central China, y en `turn-4` reporta «tarea completa». Ambos pasos parecen bastante absurdos, pero los dos son río abajo:

| Registro | Comportamiento | Causa o contagio |
| --- | --- | --- |
| El error de `read_file` de `turn-2` | Parámetro mal escrito, la herramienta devuelve una línea de ENOENT | **Causa** |
| El `write_file` de `turn-3` | Escribió una región Central China inexistente | Contagio |
| El `end_turn` de `turn-4` | Afirma haber terminado con éxito | Contagio |

En los sistemas de agentes, que falle un paso alcanza para desviarlo hacia una trayectoria completamente distinta, con un resultado final impredecible[^S1]: este es el ejemplo más limpio. Si solo tuvieras el `summary.md` final, ¿adónde irías a arreglar? Probablemente a cambiar el prompt: «no inventes datos», «tienes que indicar las fuentes». Todos esos cambios le pegan al contagio, no le pegan a la lesión. La próxima vez cambia el método del error de tipeo y va a inventar igual.

Por cierto, por qué este síntoma creció hacia «Central China» en vez de hacia «falta South China»: el modelo sí recibió el nombre de archivo (`2026-q1-south.csv` está ahí mismo en el retorno de `list_files`), y las correspondencias east→East China y north→North China ya estaban en los contenidos de las dos lecturas exitosas iniciales; lo único que le faltaban eran los números concretos de esos tres meses. Pero ese ENOENT opaco no le dijo ni «reintenta con el nombre correcto» ni «detente y explica con claridad», así que eligió el camino más fácil: disfrazar el hueco de completo y rellenar tanto el nombre de la región como los números. La invención no ocurre porque no sepa nada, ocurre porque el error no le dio una salida mejor.

### Paso cuatro: determinar la causa — la retroalimentación que recibió fue pésima

En este paso no te apures a culpar al modelo. Mira lo que ese error le dio realmente:

```text
ENOENT: no such file or directory, open 'data/2026-q1-sourth.csv'
```

Esta línea tiene información suficiente para un ingeniero humano; para un agente que decide «qué hago después» está casi vacía. No puede leer ahí «qué archivos de este directorio se pueden leer», no puede leer «¿escribí mal o estos datos genuinamente no existen?», y menos todavía «ante esta situación debería detenerme y preguntar, no rellenar por mi cuenta». Los agentes necesitan apoyarse en la «ground truth» que el entorno da en cada paso para juzgar su progreso[^S2], y este ENOENT es toda la retroalimentación que recibió.

La sugerencia oficial sobre ingeniería de herramientas apunta exactamente a este hueco: cuando las llamadas a herramientas lanzan errores, las respuestas de error deberían estar bien escritas, explicando con claridad mejoras específicas y accionables, en lugar de arrojar un código de error opaco o una traza de pila[^S3]. Así que lo que hay que cambiar esta vez no es el prompt, es el mensaje de error de `read_file`.

### Paso cinco: comparación de la reejecución (los stubs fijaron el lado del modelo, acá se puede reejecutar completo)

El método de arreglo va en la sección siguiente; después de ejecutarlo volvemos a ver si los números cambiaron. La localización no termina en «sé cuál es la causa», termina en «después de arreglar, ese paso en la misma traza realmente es distinto».

## Arreglar y reejecutar: v-fixed

Lo que cambió es la sección `read_file` del código, solo el mensaje de error:

```javascript
if (ctx.errorStyle === "actionable") {
  const available = fs
    .readdirSync(path.join(ctx.root, "data"))
    .sort()
    .map((f) => `data/${f}`)
    .join(", ");
  throw new Error(
    `Archivo ${p} no encontrado. Actualmente en data/: ${available}. ` +
      `Reintenta con el nombre de archivo original tal como lo devolvió list_files; si los datos que necesitas realmente no están, ` +
      `detente y dile al usuario qué archivo falta, no estimes por tu cuenta los números que faltan.`
  );
}
```

Este mensaje mete tres cosas: **el estado actual** (qué hay realmente en el directorio), **qué hacer después** (reintentar con el nombre original) y **cuándo detenerse** (si los datos genuinamente no están, pregúntale a una persona, no estimes). Las dos primeras le dan al modelo un camino por donde andar; la tercera le bloquea el camino de la invención.

La cola de respuestas de `v-fixed` demuestra la reacción del modelo tras recibir este error: ya no inventa hacia abajo, sino que se da vuelta a buscar verificación en el entorno —relee una vez con el nombre de archivo original que aparece en el error— y al final, en la frase de cierre, además le pregunta de vuelta al usuario si hay datos de otras regiones fuera de `data/`, que le diga dónde está el archivo, que él no va a completar números por su cuenta.

```text
$ node observed-agent.mjs --version v-fixed

=== Árbol de trazas (v-fixed, reconstruido desde run.log.jsonl) ===
agent_run  sales-summary  1ms  trace_id=tr-0c316ca3
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(98)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR Archivo data/2026-q1-sourth.csv no encontrad…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(101)
├─ model_call turn-3         0ms  in=1688 out=64  stop=tool_use
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-south.csv"}  ok string(99)
├─ model_call turn-4         0ms  in=1849 out=342  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(35)
└─ model_call turn-5         0ms  in=2226 out=118  stop=end_turn

=== Resumen de métricas (v-fixed) ===
rounds=5 model_calls=5 tool_calls=6 errors=1 tokens_in=7521 tokens_out=838 tokens_total=8359 wall=1ms
Log: runs/v-fixed/run.log.jsonl  Artefacto: runs/v-fixed/summary.md
```

La forma del árbol cambió: ese ERROR de `turn-2` sigue en su lugar original, pero debajo le creció un `turn-3` con una relectura usando el nombre de archivo correcto. El artefacto es correcto:

```text
$ diff runs/v-good/summary.md runs/v-fixed/summary.md
$ echo $?
0
```

Los dos `summary.md` son idénticos byte a byte, y la región Central China desapareció.

Las tres ejecuciones lado a lado:

| | `v-good` | `v-bug` | `v-fixed` |
| --- | --- | --- | --- |
| rounds | 4 | 4 | 5 |
| tool_calls | 5 | 5 | 6 |
| errors | 0 | 1 | 1 |
| tokens_total | 6033 | 6100 | 8359 |
| `summary.md` | Correcto | Tiene una región Central China | Correcto |

Hay dos cosas que decir con claridad, o este arreglo es fácil de malinterpretar:

**Primero, `errors` no volvió a cero, ni debería.** Esa lectura con el nombre mal escrito igual dio error; solo cambiamos el mensaje de error, dejando que el modelo saliera trepando del error. El arreglo que genuinamente devuelve `errors` a cero va en otra dirección: escribir descripciones de herramientas más explícitas, dar ejemplos, para que el modelo no escriba mal el nombre en primer lugar. La lectura diagnóstica oficial se corresponde exactamente así: grandes cantidades de errores por parámetros inválidos dicen que las descripciones de herramientas habría que hacerlas más claras y los ejemplos más completos[^S3]. La descripción de `read_file` en este script ya dice «La ruta debe usar el nombre de archivo original tal como lo devolvió list_files», y claramente todavía no alcanza: la próxima ronda habría que darle un ejemplo positivo.

**Segundo, el arreglo no es gratis.** Los tokens pasaron de 6033 a 8359, un aumento de 2326, un 38% más, y lo extra vino de esa ronda de ida y vuelta de la relectura. No es una explosión, pero tampoco es costo cero. El costo del arreglo hay que ponerlo sobre la mesa y calcularlo; no se puede mirar solo «el resultado es correcto» y darlo por terminado.

## Dónde están los límites de esta capa de observabilidad

Esta cosa es chica y hay que enunciar sus límites con claridad, no sea que creas que cablearla significa que ya tienes observabilidad de producción.

**Cubre un proceso, una ejecución.** Los logs son un `appendFileSync` escribiendo directo a un archivo local, y aunque maten el proceso no se pierden: esto es deliberado. Conecta un backend real y ya no es el mismo trato: en el camino de OTLP, el fallo de exportación es silencioso por defecto, el endpoint inalcanzable o que rechaza, el agente se sigue ejecutando, la telemetría directamente descartada, sin que aparezca siquiera un error en tu aplicación; y la telemetría se agrupa en lotes antes de exportarse por intervalos, y si matan el proceso antes de exportar, lo que haya en el búfer del lote se perdió[^S6]. El «el pipeline de observabilidad te va a mentir en silencio» de la lección 4 habla de ese tramo. El archivo local esquiva ese pozo, y el costo es que solo está en la máquina local.

**Conectar backends reales y la agregación multiproceso no están en esta lección.** Para conectar esta capa a Honeycomb, Datadog, Grafana, Langfuse o un colector autoalojado hace falta el conjunto del protocolo OTLP[^S6], los campos hay que remapearlos, y eso es otro tema. Cómo se agregan juntos los logs de varios procesos de agente, cómo distinguirlos por nombre de servicio, lo mismo.

**Los umbrales de alerta: esta lección no da números.** «A partir de qué tasa de error de herramientas habría que alertar», «cuántos tokens en una ejecución cuentan como anomalía»: la documentación oficial solo mencionó que las alertas debería hacerlas tu backend, sin dar ningún número[^S4]. Yo tampoco voy a inventar. Tus propios umbrales solo pueden crecer desde tu propia línea base: primero ejecuta un tiempo, mira cómo se ve la distribución de las ejecuciones normales, y después traza la línea.

**El registro de contenido viene desactivado por defecto.** Ese `HEAD_CHARS = 60` de arriba dejó apenas un fragmento muy corto. Para activar de verdad el texto completo, el prerrequisito es que tu pipeline de observabilidad esté aprobado para almacenar los datos que maneja tu agente[^S6]: primero pasa la aprobación de datos, después cambia el código, no al revés.

**La tasa de muestreo y la ventana de retención de logs tampoco se amplían.** Una ejecución son decenas de líneas de JSONL, y unos cientos de ejecuciones locales no hay que gestionarlas; cuando necesites considerar esto, ya es un problema de backend.

Palabra final: el valor de esta capa de observabilidad no está en cuánto registró, está en que **te deja hacer una pregunta específica**. «¿Por qué inventó una región Central China?» es una pregunta sin respuesta; «en esta ejecución con `trace_id=tr-ebad58f6`, ¿cuál es el primer registro con `error` distinto de null, y cuáles son sus parámetros?» es una pregunta con respuesta. Después de cablear un trazado de producción completo, recién ahí puedes diagnosticar sistemáticamente por qué fallaron los agentes y arreglarlo sistemáticamente[^S1].

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Leer este árbol por tu cuenta, sin la explicación

El árbol de trazas de abajo está genuinamente ejecutado desde `v-bug` (el mismo del texto principal; `trace_id` y milisegundos varían según la ejecución). Haz de cuenta que lo ves por primera vez y que un colega solo te tiró una línea: «summary.md tiene una región Central China que nuestra empresa no tiene».

```text
agent_run  sales-summary  1ms  trace_id=tr-ebad58f6
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(98)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(101)
├─ model_call turn-3         0ms  in=1602 out=355  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(35)
└─ model_call turn-4         0ms  in=1990 out=81  stop=end_turn
```

El colega también te sacó ese registro de log de `list_files`: en el árbol solo muestra `ok string(52)`, y los detalles están en el log (los ids y los milisegundos, como siempre, varían según la ejecución):

```json
{"trace_id":"tr-ebad58f6","span_id":"span-5f06686e","parent_id":"span-6c948ec8","kind":"tool_call","name":"list_files","tool_input":{"shape":"object{dir}","chars":14,"head":"{\"dir\":\"data\"}"},"duration_ms":0,"tool_result":{"shape":"string(52)","chars":52,"head":"2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv"},"error":null}
```

Sin escribir código, responde cuatro preguntas en texto:

1. ¿El primer punto de divergencia es **cuál línea**?
2. ¿Tu **base** para juzgarlo como el punto de divergencia son qué campos del árbol y de este registro de log? Nombra los campos y qué descarta cada uno.
3. Después de la divergencia, ¿cuáles líneas son **contagio** y no fallos independientes? Dilo línea por línea.
4. Si solo tuvieras ese `summary.md` final, sin este árbol, ¿a quién **culparías por error** probablemente? ¿Por qué esa dirección no puede arreglar este bug?

<!-- rubric -->

- La P1 apunta a ese `read_file` con ERROR bajo `turn-2`, e indica que el parámetro es `data/2026-q1-sourth.csv` (el mal escrito)
- La P2 nombra al menos tres campos y el papel de cada uno: `error` (distinto de null, lo separa de los demás registros), `tool_input` (expone el error de tipeo del parámetro, descarta «el archivo genuinamente no existe»), el `tool_result.head` de ese registro de log de `list_files` (prueba que el modelo sí recibió el nombre de archivo correcto, descarta «no sabe qué archivos existen»)
- La P3 juzga que el `write_file` de `turn-3` y el `end_turn` de `turn-4` son ambos contagio, y explica que sus absurdos derivan todos de esa lectura fallida de río arriba
- La P4 señala que se culparía por error a la «alucinación» del modelo o al prompt, y explica por qué agregarle «no inventar» al prompt no puede arreglarlo: porque la lesión es que la retroalimentación de la herramienta es demasiado pobre, no que la instrucción no sea lo bastante estricta

<!-- answer -->

1. El primer punto de divergencia es el **del medio de los tres `read_file` paralelos** bajo `turn-2`: `in={"path":"data/2026-q1-sourth.csv"}`, resultado ERROR. Las dos líneas de arriba y la de abajo son todas `ok`, solo esa se rompió.

2. Tres campos juntos lo reconocen:

   - El campo `error` distinto de null: este es el único registro con ERROR en todo el árbol, los otros nueve están normales. Comprime el rango de candidatos de diez a uno.
   - El fragmento de `tool_input`: la ruta dice `sourth`, no `south`. Esto descarta «esos datos genuinamente no existen»: lo que está mal es el parámetro, no los datos.
   - El `tool_result.head` de ese registro de log de `list_files` tiene `2026-q1-south.csv`: el modelo claramente sí recibió el nombre de archivo correcto. Esto descarta «no sabe qué hay en el directorio».

   Si falta cualquiera de los tres campos, la conclusión no se sostiene: solo con `error` sabes que pasó algo pero no dónde se torció; solo con `tool_input` no puedes saber si esta llamada tuvo éxito o falló; sin ese retorno de `list_files` no puedes juzgar si el modelo siquiera tuvo la oportunidad de conocer el nombre correcto.

3. Las dos líneas posteriores a la divergencia son contagio:

   - El `write_file` de `turn-3`: la región Central China que escribió es inventada, pero cuando el modelo la inventó genuinamente le faltaba un pedazo de datos, y el error que recibió no le dijo qué faltaba. Este paso es una decisión tomada sobre los escombros del paso anterior.
   - El `end_turn` de `turn-4`: reporta tarea completa y no menciona en absoluto que le faltaba un pedazo de datos. Esto es igualmente la continuación de los escombros: cree que lo que había que hacer está hecho.

   Que falle un paso alcanza para desviar al agente hacia una trayectoria completamente distinta, y estas dos líneas son dos puntos sobre esa trayectoria, no dos bugs independientes. Arregla cualquiera por separado, cambia el método del fallo y van a crecer otros nuevos.

4. Mirando solo `summary.md`, lo más fácil es culpar **al modelo**: decir que produjo alucinaciones, que inventó datos, y entonces agregarle al prompt «no inventes datos», «tienes que indicar de dónde sale cada número». Esta dirección no puede arreglarlo, y la razón tiene dos capas:

   - La lesión no está en las instrucciones, está en la retroalimentación. En ese paso, toda la información que recibió el modelo es una línea `ENOENT: no such file or directory`, y adentro no hay ni «qué archivos hay en el directorio» ni «¿deberías reintentar o detenerte y preguntarle a una persona?». Grita más fuerte en el prompt y, en ese paso, el material que tiene en la mano sigue siendo esa línea.
   - El prompt es global, la divergencia es local. Agregar una línea de «no inventar» afecta su comportamiento en cada ronda, mientras que el punto que genuinamente necesita cambio de comportamiento es solo «el paso siguiente a un error de herramienta», ese único punto. Cambiar el mensaje de error le pega al punto; cambiar el prompt lo espolvorea por la superficie.

   Nota al margen: si ni siquiera tienes `trace_id` y los logs están mezclados en un solo flujo, no puedes ni encerrar «cuáles diez líneas pertenecen a esta ejecución», y ninguna de estas cuatro preguntas se puede ni empezar.

<!-- hint -->

Recorre de arriba abajo, no infieras hacia atrás desde `summary.md`. ¿En qué capa aparece el primer registro que viola las expectativas? «Violar las expectativas» tiene una marca visual muy obvia en este árbol.

<!-- hint -->

La P2 no quiere «porque dice ERROR», sino **tres** campos que descarten cada uno una posibilidad. Prueba preguntando por separado: ¿esta llamada tuvo éxito o falló (qué campo)? ¿Lo que está mal es el parámetro o los datos en sí (qué campo)? ¿El modelo conocía en ese momento el nombre de archivo correcto (qué campo: en el árbol o en ese registro de log)?

### Nivel 2: Agregarle una «comparación de ejecuciones» a la capa de observabilidad

Mirar solo las métricas de una ejecución hace difícil juzgar si un cambio es bueno o malo. Escribe un `compare-runs.mjs` que lea dos `run.log.jsonl`, agregue por `kind` y después compare lado a lado. Requisitos:

- La línea de comandos toma dos rutas de archivo de log: `node compare-runs.mjs <A> <B>`; si faltan parámetros, imprime el uso y termina con código de salida 2.
- Compara al menos esto: cantidad de llamadas al modelo, cantidad de llamadas a herramientas, cantidad de errores, `tokens_in` / `tokens_out` / `tokens_total`, duración total; las líneas de tokens dan además el cambio porcentual.
- Después agrupa por nombre de herramienta y compara cuántas veces se llamó a cada una.
- **Que cualquiera de los dos lados tenga una cantidad de errores mayor que cero significa salida distinta de cero**, e imprime qué lado y cuántas veces.
- Después de escribirlo, úsalo para comparar `v-good` con `v-fixed` y responde: ¿el arreglo introdujo errores nuevos? ¿Cuánto subieron los tokens?

<!-- rubric -->

- El script sin dependencias, se ejecuta con `node` pelado; si faltan ambos parámetros, imprime el uso y hace `process.exit(2)`
- El método de agregación es filtrar por `kind` (`model_call` / `tool_call` / `agent_run`) y después contar, no números de línea hardcodeados
- Las tres líneas de tokens tienen cambio porcentual, y las líneas de conteo dan los números de aumento/disminución
- La comparación agrupada por nombre de herramienta cubre todos los nombres de herramienta que aparecen en ambos lados (cuando un lado tiene y el otro no, rellena con 0)
- La compuerta de errores funciona de verdad: ambos lados en 0 significa código de salida 0; cualquier lado mayor que 0 significa código de salida distinto de cero, e imprime la cantidad de errores de cada lado
- La sección de conclusiones dice con claridad que la cantidad de errores de `v-fixed` sigue siendo 1 (esa lectura mal escrita sigue ahí) y el número concreto del aumento de tokens

<!-- answer -->

Abajo está la implementación completa; ponla en el mismo directorio que `observed-agent.mjs`:

```javascript
#!/usr/bin/env node
// compare-runs.mjs —— Comparar los run.log.jsonl de dos ejecuciones
// Uso: node compare-runs.mjs <run.log.jsonl de A> <run.log.jsonl de B>
// Que cualquiera de los dos lados tenga errores de herramienta significa salida distinta de cero.
import fs from "node:fs";

function load(file) {
  const records = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const model = records.filter((r) => r.kind === "model_call");
  const tool = records.filter((r) => r.kind === "tool_call");
  const root = records.find((r) => r.kind === "agent_run");
  const byTool = new Map();
  for (const r of tool) byTool.set(r.name, (byTool.get(r.name) ?? 0) + 1);
  return {
    file,
    trace_id: records[0]?.trace_id ?? "(log vacío)",
    model_calls: model.length,
    tool_calls: tool.length,
    errors: records.filter((r) => r.error).length,
    tokens_in: model.reduce((s, r) => s + r.tokens.input, 0),
    tokens_out: model.reduce((s, r) => s + r.tokens.output, 0),
    wall_ms: root?.duration_ms ?? 0,
    byTool,
  };
}

const pad = (v, w) => String(v).padStart(w);

function deltaOf(a, b, asPercent) {
  const d = b - a;
  const sign = d > 0 ? "+" : d < 0 ? "" : "±";
  if (!asPercent || a === 0) return `${sign}${d === 0 ? 0 : d}`;
  return `${sign}${d} (${sign}${((d / a) * 100).toFixed(1)}%)`;
}

function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error("Uso: node compare-runs.mjs <run.log.jsonl de A> <run.log.jsonl de B>");
    process.exit(2);
  }
  const a = load(fileA);
  const b = load(fileB);

  console.log(`A: ${a.file}  trace_id=${a.trace_id}`);
  console.log(`B: ${b.file}  trace_id=${b.trace_id}`);
  console.log(`\n${"Métrica".padEnd(13)}${pad("A", 7)}${pad("B", 8)}   Cambio`);
  const rows = [
    ["model_calls", a.model_calls, b.model_calls, false],
    ["tool_calls", a.tool_calls, b.tool_calls, false],
    ["errors", a.errors, b.errors, false],
    ["tokens_in", a.tokens_in, b.tokens_in, true],
    ["tokens_out", a.tokens_out, b.tokens_out, true],
    ["tokens_total", a.tokens_in + a.tokens_out, b.tokens_in + b.tokens_out, true],
    ["wall_ms", a.wall_ms, b.wall_ms, false],
  ];
  for (const [name, va, vb, pct] of rows) {
    console.log(`${name.padEnd(13)}${pad(va, 7)}${pad(vb, 8)}   ${deltaOf(va, vb, pct)}`);
  }

  console.log("\nPor nombre de herramienta:");
  for (const name of [...new Set([...a.byTool.keys(), ...b.byTool.keys()])].sort()) {
    const va = a.byTool.get(name) ?? 0;
    const vb = b.byTool.get(name) ?? 0;
    console.log(`${name.padEnd(13)}${pad(va, 7)}${pad(vb, 8)}   ${deltaOf(va, vb, false)}`);
  }

  if (a.errors > 0 || b.errors > 0) {
    console.log(`\nLa compuerta FALLA: lado A ${a.errors} errores, lado B ${b.errors} errores.`);
    process.exit(1);
  }
  console.log("\nLa compuerta pasa: ninguno de los dos lados tiene registros de error.");
  process.exit(0);
}

main();
```

**Primero verifica la compuerta misma.** Esta es la aplicación directa de la regla de la lección 4: detector recién cableado, primero confirma que genuinamente deja pasar en las situaciones donde «debería pasar», si no, cada código de salida que leas después es poco confiable. Toma `v-good` y compáralo consigo mismo:

```text
$ node compare-runs.mjs runs/v-good/run.log.jsonl runs/v-good/run.log.jsonl
A: runs/v-good/run.log.jsonl  trace_id=tr-cdb9b3ff
B: runs/v-good/run.log.jsonl  trace_id=tr-cdb9b3ff

Métrica            A       B   Cambio
model_calls        4       4   ±0
tool_calls         5       5   ±0
errors             0       0   ±0
tokens_in       5303    5303   ±0 (±0.0%)
tokens_out       730     730   ±0 (±0.0%)
tokens_total    6033    6033   ±0 (±0.0%)
wall_ms            1       1   ±0

Por nombre de herramienta:
list_files         1       1   ±0
read_file          3       3   ±0
write_file         1       1   ±0

La compuerta pasa: ninguno de los dos lados tiene registros de error.
$ echo $?
0
```

Todo en `±0`, código de salida 0. La compuerta sabe dejar pasar, lista para usar.

**Después compara `v-good` con `v-fixed`:**

```text
$ node compare-runs.mjs runs/v-good/run.log.jsonl runs/v-fixed/run.log.jsonl
A: runs/v-good/run.log.jsonl  trace_id=tr-cdb9b3ff
B: runs/v-fixed/run.log.jsonl  trace_id=tr-0c316ca3

Métrica            A       B   Cambio
model_calls        4       5   +1
tool_calls         5       6   +1
errors             0       1   +1
tokens_in       5303    7521   +2218 (+41.8%)
tokens_out       730     838   +108 (+14.8%)
tokens_total    6033    8359   +2326 (+38.6%)
wall_ms            1       1   ±0

Por nombre de herramienta:
list_files         1       1   ±0
read_file          3       4   +1
write_file         1       1   ±0

La compuerta FALLA: lado A 0 errores, lado B 1 errores.
$ echo $?
1
```

Respondamos esas dos preguntas:

- **¿Introdujo errores nuevos?** Nuevos no, pero el viejo sigue ahí. El `errors=1` de `v-fixed` es exactamente esa lectura que escribió `south` como `sourth`: cambiar el mensaje de error cambió «qué hace el modelo después del error», no cambió «si el modelo va a escribir mal el nombre». Así que la compuerta juzga que falla, código de salida 1, y este resultado es correcto: esta compuerta pregunta «¿esta ejecución todavía tiene errores de herramienta?», no «¿es correcto el artefacto final?». Si el artefacto es correcto se verifica aparte (`diff runs/v-good/summary.md runs/v-fixed/summary.md` sale vacío). Para devolver genuinamente `errors` a cero, lo siguiente que habría que mover es la descripción de `read_file`, darle un ejemplo positivo, para que el modelo no escriba mal el nombre en primer lugar.
- **¿Cuánto subieron los tokens?** El total pasó de 6033 a 8359, un aumento de 2326, un incremento del 38,6%; lo extra está todo en esa ronda de ida y vuelta de la relectura (`read_file` pasó de 3 veces a 4, y las llamadas al modelo de 4 a 5). Un 38% no es una explosión, pero tampoco es gratis: el costo del arreglo hay que reconocerlo en esta tabla, no se puede ver solo que el resultado es correcto y darlo por terminado.

Y ese `±0` de la línea `wall_ms` tampoco te lo tomes en serio: el cliente stub no manda solicitudes de red, así que el tiempo de reloj de pared de las dos ejecuciones es básicamente ruido de E/S de archivos y sale distinto en cada ejecución. Después de conectar APIs reales esta línea gana sentido.

<!-- hint -->

`load()` solo necesita un `readFileSync` más un `split("\n")`, y después todas las estadísticas son `filter` y `reduce` sobre el mismo arreglo. Acumular `byTool` con un `Map` es lo más fácil; al buscar la unión de los nombres de herramienta de ambos lados acuérdate de usar `new Set([...a.keys(), ...b.keys()])`, si no las herramientas exclusivas de un lado se te van a escapar.

<!-- hint -->

El código de salida necesita un `process.exit()` explícito, no esperes que un script que termina normalmente se convierta en 0 automáticamente; después de un `console.log` el código de salida por defecto del proceso efectivamente es 0, pero el camino de compuerta-falla tienes que escribirlo tú con `process.exit(1)`. Al verificar, usa `echo $?` en la shell para ver el código de salida del comando anterior.

<!-- /exercises -->

## Resumen

- Cada pieza del trío de observabilidad se ocupa de un tramo: los logs JSON Lines se ocupan de «dejarlo registrado», el árbol de trazas se ocupa de «ver claro el orden y la pertenencia», el resumen de métricas se ocupa de «ver de un vistazo si esta ejecución se ve normal»; el árbol y el resumen se reconstruyen ambos desde el JSONL en disco, y lo que no se registró en los logs jamás va a aparecer en el árbol
- Cada registro tiene que llevar `trace_id` y `parent_id`: el primero encierra los registros dispersos de vuelta en la misma ejecución, el segundo les permite reconstruirse en árbol; esta es exactamente la misma técnica que usa lo oficial para atar con `prompt.id` todos los eventos disparados por un prompt, y filtrar por él para localizar[^S4]
- El contenido por defecto no se escribe completo: la postura por defecto de la telemetría oficial es que lo estructural se registra todo, el contenido leído y escrito por el agente no se recolecta, y de los prompts de usuario solo se registra la longitud; para activar el registro de contenido, el prerrequisito es que tu pipeline de observabilidad esté aprobado para almacenar este tipo de datos[^S6]
- Esos cinco números de métricas (duración, cantidad de llamadas, tokens, cantidad de errores, duración total) son el mismo conjunto que se usa para calificar en el curso 10 (Verificación y aseguramiento de calidad: que no se cuele lo que «se ve bien»)[^S3], acá cambiado a uso diagnóstico; en la comparación de esta ronda, la cantidad de rondas, de llamadas y los tokens de `v-good` y `v-bug` son casi idénticos, y lo único que cambió es la cantidad de errores
- La acción clave de la localización es identificar el **primer** punto de divergencia en el árbol, y después tratar uniformemente todos los absurdos de río abajo como contagio: que falle un paso alcanza para desviar al agente hacia una trayectoria completamente distinta[^S1], e ir a arreglar esa capa del artefacto final equivale a arreglar una sombra
- Arreglar el mensaje de error de la herramienta es un arreglo que le pega a la lesión: las respuestas de error deberían explicar con claridad mejoras específicas y accionables, en lugar de arrojar un código de error opaco o una traza de pila[^S3]; después de este arreglo el modelo pasó de «inventar una región Central China» a «releer una vez con el nombre de archivo original, y darse vuelta a preguntarle al usuario si hay otros datos»
- Después de arreglar hay que reejecutar y comparar, y hay que reconocer la factura: `errors` no volvió a cero (el error de tipeo sigue ahí), los tokens subieron un 38% (se agregó una ida y vuelta); «el resultado es correcto» no equivale a «el costo es cero»

La línea principal de las seis lecciones termina acá. La lección 1 dejó claro por qué no se puede decir: un agente toma caminos distintos en dos ejecuciones, y debajo de un síntoma se apretujan varias causas que desde afuera se ven idénticas. La lección 2 fijó la evidencia de primera mano en la transcripción cruda, no en su autoinforme. La lección 3 convirtió cada paso en datos con campos. La lección 4 hilvanó los datos dispersos en un árbol y, de paso, te dijo que ese pipeline mismo va a mentir en silencio. La lección 5 instaló sondas en las puertas del bucle y dio el método de caminar de la localización. Esta lección soldó las cinco lecciones anteriores en un archivo de unas 400 líneas y cero dependencias, y lo usó para rastrear genuinamente «de dónde salió la región Central China» hasta esa lectura con la ruta mal escrita de `turn-2`.

Este es también el curso 11 de esta serie. La próxima vez que tu agente no pueda decir dónde se torció, ya no vas a tener en la mano solo la frase «el modelo se lo inventó»: vas a tener un log al que hacerle grep, un árbol donde puedes señalar una línea concreta y hablar, una tabla de resumen con la que calcular el costo, y un conjunto de métodos de caminar que va del rastreo del síntoma al primer punto de divergencia. Lo que queda es mover enteros los tres tramos de observabilidad de `observed-agent.mjs` (logger, árbol de trazas, resumen de métricas) a tu propio arnés, envolver esas dos capas alrededor de tu bucle siguiendo el patrón de la sección 7 —los fixtures y los stubs son el andamiaje didáctico de esta lección, no te los lleves— y después ejecutar la primera tarea real, a ver qué hay en ese primer `run.log.jsonl` de lo que originalmente no tenías ni idea.


