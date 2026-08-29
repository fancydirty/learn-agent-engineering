# Lección 6: Manos a la obra: conectar tres herramientas a un agente

> Objetivos de aprendizaje:
> - Escribir un bucle de ejecución de herramientas completo que ponga a funcionar de verdad a un agente
> - Registrar la definición de interfaz de una herramienta y su implementación en una sola tabla, para que los dos lados nunca se separen
> - Equipar el bucle con válvulas de seguridad, y leer los logs para detectar cuándo una herramienta está mal conectada

> Requisitos: Terminar las Lecciones 1-5 y saber leer JavaScript / Node.js básico | Anterior: [Lección 5 <<](./05-permissions-and-safety.md)

## Primero la recompensa: una ejecución completa

Esto es a lo que llega esta lección. Escribes una frase en la terminal y el agente decide por su cuenta a qué herramientas llamar y cuántas veces:

```
$ node agent.js "¿Usamos lodash en este proyecto? Averigua cómo le va en GitHub"

[turno 1] llama a search_files { pattern: 'lodash', dir: '.' }
[turno 2] llama a read_file { path: 'package.json' }
[turno 3] llama a github_repo_info { owner: 'lodash', repo: 'lodash' }

Respuesta final:
Sí, el proyecto usa lodash. package.json lo fija en ^4.17.21 y
src/utils/format.js lo requiere directamente. En GitHub, lodash/lodash
tiene ahora más de 60k estrellas y su último push fue hace unas
semanas: el repositorio sigue mantenido. Para confirmar si ^4.17.21 es la
última versión publicada haría falta una consulta más a su lista de releases.
```

Tres turnos, tres herramientas, y los argumentos de cada turno se construyen sobre el resultado del turno anterior: primero encontrar en qué archivos aparece lodash, después leer package.json para confirmar la versión, después tomar ese nombre y preguntarle a GitHub por él. Esto no es un script cableado: el propio modelo decide a qué herramienta llamar a continuación y qué argumentos pasar.

Esta lección lo construye desde cero: tres herramientas, un registro, un bucle de ejecución, unas cuantas válvulas de seguridad.

## Qué pasa por debajo: una ida y vuelta de la API tras otra

Cada «turno» que viste arriba es, por debajo, una petición HTTP completa. La Lección 2, «La ida y vuelta completa de una llamada a herramienta», mostró cómo es una sola llamada; aquí simplemente la conectamos en bucle: el modelo devuelve `stop_reason: "tool_use"`, tu código ejecuta la herramienta, cose el resultado de vuelta en la conversación y envía otra petición, hasta que el modelo deja de pedir llamadas a herramientas.[^S4]

Tres turnos con llamadas a herramientas son en realidad cuatro llamadas a `messages.create`: en las tres primeras el modelo sigue pidiendo herramientas, y en la cuarta ya tiene los datos de GitHub, decide que le basta y da directamente una respuesta de texto, terminando el bucle. El juicio de si seguir pidiendo herramientas vive por completo del lado del modelo; tu código solo ejecuta y devuelve resultados.

## Paso 1: Escribir el contrato de cada herramienta

La Lección 4, «Diseñar interfaces de herramientas: nombre, descripción, parámetros, valor de retorno», cubrió los tres campos centrales de la interfaz de una herramienta: `name`, `description` e `input_schema`.[^S3] Aquí los convertimos directamente en código. Las tres herramientas se corresponden con tres de los cinco tipos de la Lección 3, «Cinco tipos comunes de herramientas: leer, escribir, ejecutar, buscar, llamar»: search, read y call; write y execute se quedan para que las conectes tú en los ejercicios.

```js
const searchFilesSchema = {
  name: "search_files",
  description:
    "Busca en los archivos del proyecto texto que coincida con una expresión regular. Devuelve la ruta, " +
    "el número de línea y el contenido de la línea de cada coincidencia. Úsala para localizar en qué archivos " +
    "aparece una cadena, el nombre de una dependencia o el nombre de una función. " +
    "Cuando no hay coincidencias devuelve un texto explícito que lo dice, nunca una cadena vacía.",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Una expresión regular de JavaScript, sin las barras inicial y final" },
      dir: { type: "string", description: "El directorio desde donde empezar a buscar, relativo a la raíz del proyecto, por defecto \".\"" },
    },
    required: ["pattern"],
  },
};

const readFileSchema = {
  name: "read_file",
  description:
    "Lee el contenido de texto de un archivo dentro del proyecto y devuelve como máximo los primeros 4000 caracteres. " +
    "path debe ser una ruta relativa a la raíz del proyecto; la herramienta no puede acceder a archivos fuera del directorio del proyecto.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Una ruta de archivo relativa a la raíz del proyecto, por ejemplo \"package.json\"" },
    },
    required: ["path"],
  },
};

const githubRepoInfoSchema = {
  name: "github_repo_info",
  description:
    "Consulta información básica de un repositorio público de GitHub: número de estrellas, número de issues abiertos, rama por defecto y fecha del último push. " +
    "owner y repo son dos campos separados para el propietario y el nombre del repositorio; no se acepta una URL completa.",
  input_schema: {
    type: "object",
    properties: {
      owner: { type: "string", description: "El propietario del repositorio, por ejemplo \"lodash\"" },
      repo: { type: "string", description: "El nombre del repositorio, por ejemplo \"lodash\"" },
    },
    required: ["owner", "repo"],
  },
};
```

`github_repo_info` lleva un prefijo `github_`: la guía oficial es usar el servicio como espacio de nombres en los nombres de herramienta cuando una herramienta toca un servicio externo, lo que baja mucho la probabilidad de que el modelo elija la herramienta equivocada.[^S10] `search_files` y `read_file` operan sobre el sistema de archivos local, donde no hay ambigüedad de «qué servicio», así que no necesitan prefijo.

Las tres descripciones detallan qué texto vuelve cuando no se encuentra nada, y eso no es relleno. La Lección 4 señalaba que una buena descripción elimina la ambigüedad en entradas y salidas;[^S8] la ambigüedad aquí no está en los parámetros sino en cómo la herramienta expresa «no encontré nada», una trampa que salta en la sección «Válvulas de seguridad».

## Paso 2: Registrar el contrato y la implementación en una sola tabla

Una trampa habitual: si la lista de esquemas y la tabla de handlers que se usa en tiempo de ejecución se escriben como dos copias separadas, tarde o temprano se separarán. Renombras `search_files` a `find_in_files` pero olvidas actualizar la clave en la tabla de handlers; el modelo emite una llamada contra el esquema nuevo, la tabla de handlers no tiene nada bajo esa clave y lanza un error.

El arreglo es mantener una sola tabla donde `name`, `description`, `input_schema` y la función que realmente se ejecuta vivan en el mismo objeto. La lista de esquemas que necesita la API y la tabla de handlers que necesita la ejecución se derivan las dos de esta única tabla:

```js
const TOOLS = {
  search_files: { ...searchFilesSchema, handler: searchFiles },
  read_file: { ...readFileSchema, handler: readFile },
  github_repo_info: { ...githubRepoInfoSchema, handler: githubRepoInfo },
};

// El parámetro tools que se envía al modelo, derivado de TOOLS
const toolSchemas = Object.values(TOOLS).map(({ handler, ...schema }) => schema);

// La tabla de handlers que se usa en tiempo de ejecución, también derivada de TOOLS
const toolHandlers = Object.fromEntries(
  Object.entries(TOOLS).map(([name, t]) => [name, t.handler])
);
```

`toolSchemas` y `toolHandlers` quedan sincronizados para siempre, porque son dos vistas calculadas a partir de los mismos datos, no dos copias escritas a mano. Renombrar una herramienta o añadir un parámetro significa cambiar `TOOLS` en exactamente un sitio.

## Paso 3: Implementar las tres herramientas, con fronteras

`searchFiles` recorre el directorio por su cuenta en lugar de delegar en `grep` por shell: así se evita empalmar entrada del usuario en una línea de comandos e invitar a la inyección de comandos. El número de coincidencias está limitado, de modo que una sola búsqueda no puede meter miles de líneas en el contexto:

```js
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

async function searchFiles({ pattern, dir = "." }) {
  const root = path.resolve(PROJECT_ROOT, dir);
  // Añade path.sep antes de comparar: un startsWith pelado también dejaría pasar
  // directorios hermanos con el mismo prefijo, como /proj-backup
  const inRoot = root === PROJECT_ROOT || root.startsWith(PROJECT_ROOT + path.sep);
  if (!inRoot) {
    return "Ejecución rechazada: el directorio de búsqueda no puede salir de la raíz del proyecto.";
  }
  let regex;
  try {
    regex = new RegExp(pattern);
  } catch {
    return `Ejecución rechazada: "${pattern}" no es una expresión regular válida.`;
  }

  const hits = [];
  for (const file of walk(root)) {
    let lines;
    try {
      lines = fs.readFileSync(file, "utf8").split("\n");
    } catch {
      continue; // los archivos binarios y similares no se leen como texto, se saltan
    }
    lines.forEach((line, i) => {
      if (regex.test(line)) {
        hits.push(`${path.relative(PROJECT_ROOT, file)}:${i + 1}:${line.trim()}`);
      }
    });
    if (hits.length >= 20) break; // válvula de seguridad: truncar pronto cuando hay demasiadas coincidencias
  }
  return hits.length ? hits.join("\n") : "No se encontró contenido coincidente.";
}
```

`readFile` hace una sola cosa: confirmar que la ruta de destino no se ha escapado de la raíz del proyecto. La idea de frontera de la Lección 5 aparece aquí como una única comprobación de prefijo con separador. Fíjate en que no es un `startsWith(PROJECT_ROOT)` pelado: supongamos que la raíz del proyecto es `/Users/me/proj` y el modelo pasa `../proj-backup/x`; después del resolve obtienes `/Users/me/proj-backup/x`, y una coincidencia de prefijo pelada aún pasaría. Añade `path.sep` y la frontera aterriza por fin en el separador de directorios:

```js
async function readFile({ path: relPath }) {
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const inRoot = abs === PROJECT_ROOT || abs.startsWith(PROJECT_ROOT + path.sep);
  if (!inRoot) {
    return "Ejecución rechazada: la ruta está fuera de la raíz del proyecto y esta herramienta no puede leer archivos fuera del proyecto.";
  }
  if (!fs.existsSync(abs)) {
    return `El archivo no existe: ${relPath}`;
  }
  return fs.readFileSync(abs, "utf8").slice(0, 4000);
}
```

`githubRepoInfo` es la única herramienta que envía datos fuera del proyecto: contenido de archivos locales, destilado por el modelo en las dos cadenas `owner` y `repo`, y después enviado a la internet pública. Este es exactamente el escenario donde se encuentran dos condiciones de alto riesgo, «leer datos privados» más «comunicarse hacia fuera»,[^S19] así que recibe una regla de permisos explícita: los argumentos tienen que coincidir con el formato de nombres válido de GitHub, nada más:

```js
const SAFE_NAME = /^[\w.-]+$/;

async function githubRepoInfo({ owner, repo }) {
  // Regla de permisos: owner/repo solo pueden ser nombres de repositorio válidos,
  // no una cadena arbitraria enviada a la red externa
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo)) {
    return "Ejecución rechazada: los argumentos owner/repo no tienen un formato válido; se bloqueó la petición saliente.";
  }

  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!res.ok) {
    return `La API de GitHub devolvió un error: ${res.status} ${res.statusText}`;
  }
  const data = await res.json();
  return JSON.stringify({
    stars: data.stargazers_count,
    open_issues: data.open_issues_count,
    default_branch: data.default_branch,
    pushed_at: data.pushed_at,
  });
}
```

`GITHUB_TOKEN` se lee de una variable de entorno y nunca aparece en el código; también funciona sin él, solo que con límites de tasa más bajos en las peticiones anónimas. Esta es la misma idea que las reglas de permisos de la Lección 5 en otra forma: aquella lección cubrió las reglas declarativas `allow`/`deny`/`ask` del archivo de configuración de Claude Code,[^S15] y esta es la versión imperativa escrita dentro del código de la herramienta; las dos trazan una línea que una operación de alto riesgo no puede cruzar.[^S18]

## Paso 4: Escribir el bucle de ejecución

Con `toolSchemas` y `toolHandlers` en la mano, el bucle en sí no es complicado. La lógica central son cuatro pasos: enviar la petición, mirar `stop_reason`, devolver texto si no es `tool_use` y, si lo es, ejecutar cada bloque de llamada a herramienta y coser los resultados de vuelta.[^S4]

```js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_TURNS = 8;

async function runAgent(question) {
  const messages = [{ role: "user", content: question }];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5", // sustitúyelo por un modelo que tu cuenta pueda llamar
      max_tokens: 1024,
      tools: toolSchemas,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock ? textBlock.text : "(el modelo no dio ninguna respuesta de texto)";
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      console.log(`[turno ${turn}] llama a ${block.name}`, block.input);
      const handler = toolHandlers[block.name];
      const content = await handler(block.input);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(content) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`Se superó el número máximo de turnos (${MAX_TURNS})`);
}

const question = process.argv[2] ?? "¿Usamos lodash en este proyecto? Averigua cómo le va en GitHub";
runAgent(question).then((answer) => console.log("\nRespuesta final:\n" + answer));
```

Hay aquí un detalle fácil de pasar por alto: `for (const block of response.content)` itera sobre **todos los bloques de contenido devueltos en este turno**, no solo el primero. El modelo pide a menudo dos o tres herramientas en paralelo en un mismo turno; cada una tiene que ejecutarse y producir su propio `tool_result`, con `tool_use_id` emparejado uno a uno, y no puede faltar ninguna.[^S5] El ejercicio de nivel 2 te hará recorrer en primera persona la trampa de que falte una.

## Válvulas de seguridad, y cómo detectar que una herramienta está mal conectada

El bucle de arriba funciona, pero le faltan dos salvaguardas. Vamos a añadirlas:

**Salvaguarda uno: el fallo de una herramienta tiene que devolverse como información, no tumbar el bucle.** Envuelve la llamada en crudo en un `try/catch` y, en caso de fallo, produce igualmente un `tool_result`, solo que marcado con `is_error: true`; cuando el modelo ve esa marca, normalmente ajusta los argumentos y reintenta, en vez de repetir el mismo error.[^S11][^S5]

```js
let content, isError = false;
try {
  if (!handler) throw new Error(`No hay ninguna herramienta registrada con el nombre ${block.name}`);
  content = await handler(block.input);
} catch (err) {
  content = `Error de ejecución de la herramienta: ${err.message}`;
  isError = true;
}
toolResults.push({
  type: "tool_result",
  tool_use_id: block.id,
  content: String(content),
  ...(isError ? { is_error: true } : {}),
});
```

**Salvaguarda dos: la misma herramienta con los mismos argumentos, llamada tres veces seguidas, debería parar.** Esto no es adivinar: se basa en registrar las firmas de las últimas llamadas:

```js
// Pon esto al principio del cuerpo de la función runAgent, no en el nivel superior del módulo,
// para que cada ejecución empiece a registrar desde cero y una segunda tarea en el mismo proceso
// no quede falsamente terminada por los registros de la ejecución anterior
const recentCalls = [];

// ...dentro del bucle for (const block of response.content), antes de ejecutar el handler:
const signature = `${block.name}:${JSON.stringify(block.input)}`;
recentCalls.push(signature);
const last3 = recentCalls.slice(-3);
if (last3.length === 3 && last3.every((s) => s === signature)) {
  return "Se detectó la misma herramienta llamada 3 veces seguidas con argumentos idénticos; se terminó la ejecución.";
}
```

Junto con `MAX_TURNS` como interruptor general, las tres válvulas de seguridad tienen trabajos distintos: `MAX_TURNS` protege contra «el modelo sigue pidiendo herramientas con variaciones nuevas y no para nunca»; la detección de llamadas repetidas protege contra «el modelo se queda dando vueltas con los mismos argumentos»; y las comprobaciones internas de ruta y formato de las herramientas (las escritas en el paso 3) protegen contra «el modelo se inventó un argumento fuera de límites y la herramienta lo ejecutó obedientemente igual». Quita cualquiera de las tres capas y el bucle corre el riesgo de desbocarse o de extralimitarse.[^S18]

**¿Cómo se detecta en los logs que una herramienta está mal conectada?** Dos de las señales más habituales:

- **El modelo llama a la misma herramienta una y otra vez**, con argumentos que varían solo dentro de un rango estrecho (cambios de mayúsculas, añadir o quitar una palabra). Nueve de cada diez veces el modelo no es tonto: el content del `tool_result` es demasiado vago. «No encontrado» devuelve una cadena vacía, el modelo no puede distinguir «de verdad no hay nada» de «la herramienta está rota», y solo puede adivinar y volver a intentarlo.
- **El modelo rellena argumentos adivinando**, por ejemplo pasándole a `read_file` una ruta que no existe. Rastrearlo hacia atrás suele revelar una de dos causas: la `description` no detallaba de dónde debería salir el argumento (eco de la Lección 4), o la salida de la herramienta anterior no daba una ruta precisa y el modelo tuvo que inventarse una.

```agentmentor-check
{
  "id": "tool-zh-06-diagnose-loop",
  "label": "Diagnóstico de llamadas repetidas a la misma herramienta",
  "prompt": "Supón que alguien de la clase cambió el valor de retorno sin coincidencias de searchFiles por una cadena vacía (en lugar del «No se encontró contenido coincidente.» de esta lección). Al tratar «comprueba si el proyecto usa moment.js», este agente modificado llama a search_files durante 5 turnos seguidos, cambiando la expresión regular solo de «moment» a «Moment» y a «MOMENT», y finalmente alcanza MAX_TURNS y se termina. El proyecto, de hecho, no usa moment.js. ¿Cuál es la causa raíz más probable de este bucle?",
  "whyHere": "Justo después de cubrir el bucle de ejecución y las válvulas de seguridad, hay que comprobar si quien aprende sabe conectar el síntoma «el modelo llama una y otra vez a la misma herramienta» con la causa raíz «si el content del tool_result declara el estado con claridad», en vez de culpar a la capacidad del modelo o al límite de turnos",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "El modelo no es lo bastante capaz y no distingue los casos; hay que cambiar a un modelo más potente",
      "correct": false,
      "feedback": "Cambiar de modelo trata el síntoma, no la causa. El problema real está en el tool_result: una cadena vacía apenas se distingue de «la herramienta está rota», así que el modelo no puede separar «de verdad no encontrado» de «la llamada falló» y solo puede reformular y reintentar."
    },
    {
      "id": "b",
      "text": "searchFiles devuelve una cadena vacía cuando no hay coincidencias, y el modelo lo lee como un resultado incierto y reintenta",
      "correct": true,
      "feedback": "Correcto. El content del tool_result es la única base que tiene el modelo para juzgar «¿este paso está hecho o no?». Una cadena vacía es una señal ambigua: el modelo no puede estar seguro de si no encontró nada o si la llamada falló, así que prueba otra expresión regular. Cambia el valor de retorno por un texto explícito como «No se encontró contenido coincidente.» y, en cuanto el modelo lo vea, dejará de reintentar y concluirá directamente que el proyecto no usa esta biblioteca."
    },
    {
      "id": "c",
      "text": "MAX_TURNS está demasiado bajo; súbelo y mira si el bucle para por su cuenta",
      "correct": false,
      "feedback": "Incorrecto. Subir MAX_TURNS solo deja que el bucle dé unas vueltas más antes de chocar contra el muro; no aborda por qué reintenta el modelo. La causa raíz es la señal poco clara que devuelve searchFiles, no el límite de turnos."
    }
  ]
}
```

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Ponlo a funcionar y después conecta una cuarta herramienta

Copia el código de esta lección en un directorio local vacío, ejecuta `npm install @anthropic-ai/sdk`, después `npm pkg set type=module` (todo el código de esta lección usa sintaxis ESM `import`; en versiones de Node inferiores a 22.7, saltarse este paso lanza directamente "Cannot use import statement outside a module"), configura tu `ANTHROPIC_API_KEY` (`GITHUB_TOKEN` es opcional) y ejecuta una vez `node agent.js "¿Usamos lodash en este proyecto? Averigua cómo le va en GitHub"`. Confirma que ves al menos dos turnos distintos con llamadas a herramientas y una respuesta de texto final.

Cuando funcione, conecta una cuarta herramienta, `write_report(path, content)`: escribir los resultados de la comprobación en un archivo Markdown, permitido solo dentro del directorio `reports/` del proyecto, y rechazar escrituras en cualquier otro sitio. Cambia un prompt, por ejemplo «escribe en reports/lodash-check.md los resultados de la comprobación que acabas de reunir», y confirma que el modelo llama por su cuenta a esta herramienta nueva.

<!-- rubric -->
- Las tres herramientas existentes funcionan, los logs muestran al menos dos turnos con llamadas a herramientas, y los argumentos del turno posterior usan el resultado del turno anterior
- La restricción de ruta de `write_report` surte efecto de verdad: intentar escribir una ruta como `reports/../secret.txt` o `reports-evil/x.md` queda rechazado
- `write_report` está registrada correctamente en la tabla `TOOLS`: su esquema aparece en `toolSchemas` y `toolHandlers` puede localizar la función correspondiente

<!-- answer -->
Lo esencial es copiar la idea de comprobación de frontera de `readFile`, cambiando solo «leer» por «escribir» y estrechando el rango permitido de la raíz entera del proyecto al único subdirectorio `reports/`:

```js
const REPORTS_DIR = path.join(PROJECT_ROOT, "reports");

async function writeReport({ path: relPath, content }) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const inReports = abs === REPORTS_DIR || abs.startsWith(REPORTS_DIR + path.sep);
  if (!inReports) {
    return "Ejecución rechazada: solo se pueden escribir archivos dentro del directorio reports/.";
  }
  fs.writeFileSync(abs, content, "utf8");
  return `Se escribió ${path.relative(PROJECT_ROOT, abs)}`;
}

const writeReportSchema = {
  name: "write_report",
  description: "Escribe contenido de texto en un archivo Markdown. Solo puede escribir dentro del directorio reports/, en ningún otro sitio del proyecto.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Una ruta relativa a la raíz del proyecto, debe empezar por \"reports/\"" },
      content: { type: "string", description: "El contenido de texto completo que se va a escribir" },
    },
    required: ["path", "content"],
  },
};

TOOLS.write_report = { ...writeReportSchema, handler: writeReport };
```

<!-- hint -->
La comprobación de ruta se escribe igual que en `readFile`: después de `path.resolve`, añade `path.sep` y haz una comparación de prefijo, cambiando solo la base de `PROJECT_ROOT` a `REPORTS_DIR`; sin añadir el separador, un directorio con el mismo prefijo como `reports-evil/` se colaría por la comprobación.

<!-- hint -->
Antes de escribir el archivo, acuérdate de `fs.mkdirSync(REPORTS_DIR, { recursive: true })`; si no, `writeFileSync` lanza un error directamente la primera vez, cuando el directorio `reports/` todavía no existe.

### Nivel 2: Fabrica un fallo y después arréglalo

El código de bucle de abajo tiene un bug. Explica primero bajo qué condición hace que la siguiente petición a la API dé error, y después da el código corregido.

```js
// versión con bug
const block = response.content.find((b) => b.type === "tool_use");
if (block) {
  const result = await toolHandlers[block.name](block.input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: String(result) }],
  });
}
```

<!-- rubric -->
- Localiza el bug con precisión: usar `.find()` para tomar solo el primer bloque `tool_use` significa que, cuando el modelo pide varias herramientas en paralelo en un turno, las llamadas posteriores se ignoran por completo
- Explica el síntoma real: haya los bloques `tool_use` que haya en el mensaje assistant anterior, en el turno siguiente tiene que haber esa misma cantidad de bloques `tool_result` emparejados; si faltan, da error directamente
- El arreglo lo cambia por iterar sobre todos los bloques con `type === "tool_use"`, producir un `tool_result` emparejado para cada uno y meterlos todos en un único mensaje `user`

<!-- answer -->
El bug es suponer que hay como mucho una llamada a herramienta por turno, cuando en realidad el modelo puede perfectamente pedir dos o tres en paralelo a la vez. El arreglo es exactamente la forma mostrada en el paso 4 de esta lección: sustituir `.find()` por un bucle sobre todos los bloques:

```js
const toolResults = [];
for (const block of response.content) {
  if (block.type !== "tool_use") continue;
  const result = await toolHandlers[block.name](block.input);
  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(result) });
}
messages.push({ role: "user", content: toolResults });
```

<!-- hint -->
Cuenta cuántos elementos de `response.content` podrían tener `type` igual a `"tool_use"`: el modelo puede perfectamente pedir dos herramientas en paralelo a la vez, no siempre una sola.

<!-- hint -->
La regla de la API es: haya los bloques `tool_use` que haya en el mensaje assistant anterior, el siguiente mensaje `user` tiene que llevar esa misma cantidad de bloques `tool_result` emparejados, sin que falte ninguno.

<!-- /exercises -->

## Resumen

- Registra el esquema y el handler de una herramienta en la misma tabla (`TOOLS`), con `toolSchemas` y `toolHandlers` derivados de ella, para que cambiar un sitio nunca deje el otro sin cambiar
- El núcleo del bucle de ejecución es: enviar la petición → comprobar si `stop_reason` es `tool_use` → si lo es, iterar sobre **todos** los bloques de llamada a herramienta, ejecutar y coser de vuelta el `tool_result` → si no, devolver texto y terminar el bucle
- Un turno puede llevar varias llamadas a herramientas en paralelo; cada `tool_use` necesita un `tool_result` emparejado de forma única, y si falta uno la siguiente petición da error
- Las tres válvulas de seguridad protegen cada una su capa: `MAX_TURNS` impide que el modelo pida herramientas indefinidamente, la detección de llamadas repetidas impide que el modelo dé vueltas con el mismo conjunto de argumentos, y las comprobaciones internas de ruta y formato de las herramientas frenan los argumentos fuera de límites
- El content del `tool_result` tiene que declarar con claridad «no encontrado» frente a «ocurrió un error»; un retorno vacío y vago es la causa número uno de que el modelo reintente una y otra vez y de que los logs parezcan los de una herramienta mal conectada

Ya has terminado las seis lecciones de este curso, desde «por qué los agentes necesitan herramientas» hasta escribir tú un bucle de ejecución de herramientas que funciona. Lo más provechoso que puedes hacer ahora no es leer otra lección: es elegir una tarea pequeña y real de tu propio proyecto, partirla en dos o tres herramientas y llevarte este esqueleto de bucle con unos pocos ajustes. Ponerlo a funcionar una vez vale más que leer diez explicaciones más. Cuando estés depurando y tengas dudas sobre un campo concreto, vuelve a `sources.md` y consulta S4 y S5, los dos documentos oficiales; son el texto normativo más primario para este bucle multiturno.
