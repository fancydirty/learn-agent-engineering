# Lección 5: Rebobinar y bifurcar: el segundo valor de los puntos de control

> Objetivos de aprendizaje:
> - Explicar los dos usos proactivos de los puntos de control más allá de la recuperación ante desastres —rebobinar a una escena anterior para reintentar y bifurcar una segunda línea temporal para explorar— y ver que ambos descansan sobre la misma secuencia de puntos de control que la reanudación
> - Convertir los puntos de control de «conservar solo el último» a una secuencia retenida por turno, implementar `rewindTo(turn)` y explicar que rebobinar revierte la escena de decisión, no los efectos secundarios externos que ya ocurrieron
> - Implementar `forkFrom(turn, branchName)` para copiar una línea temporal independiente desde la misma escena, y trazar las líneas divisorias entre lo que le corresponde a los puntos de control, a Git y al registro de efectos
>
> Requisitos: Terminaste las Lecciones 1 a 4 y conoces la disposición de campos de `checkpoint.json` (`version`, `task`, `turns`, `tokensUsed`, `messages`, `pendingToolUse`) más las escrituras atómicas, cómo la reanudación concilia una llamada colgante, y el registro de efectos y las claves de idempotencia de la Lección 4 | Anterior: [Lección 4 <<](./04-side-effects-idempotency.md) | Siguiente: [Lección 6 >>](./06-build-checkpointing.md)

## Los puntos de control no son solo un fusible

Las primeras lecciones trataron los puntos de control como un seguro contra el desastre: el proceso se cae y retomas el bucle desde el punto de control más reciente. Nada de malo en usarlos así, pero si el único momento en que echas mano de ellos es después de una caída, están ociosos la mayor parte del tiempo. No hubo caída, entonces ¿el estado que guardaste se desperdició?

No se desperdició. Una hilera de puntos de control acumulados es en realidad una línea temporal de la tarea: qué estaba pensando en cada turno, qué estaba por hacer, qué efectos ya había confirmado, todo dejado como rastro. Más allá de la recuperación ante desastres, esa línea temporal sostiene dos usos más proactivos: rebobinar a un turno anterior para empezar de nuevo, y bifurcar desde un turno para ejecutar una segunda ruta en paralelo con la primera. Una hoja de ruta comunitaria construida alrededor de la ingeniería del arnés resume el componente de persistencia atando exactamente esos tres: guardar el estado en un punto de control en cada nodo para poder reanudar, rebobinar y bifurcar[^S5]. Es una nota de encuadre de la hoja de ruta —no prescribe una implementación—, pero señala una cosa: la reanudación es apenas un tercio de para qué sirven los puntos de control, y los otros dos son el tema de esta lección.

- **Rebobinar**: la tarea no se cayó, pero se salió del camino. Revierte la escena de decisión a un turno anterior al desvío y empieza de nuevo.
- **Bifurcar**: no estás seguro de qué ruta es mejor, así que copias dos líneas temporales independientes desde la misma escena, ejecutas cada una y eliges el resultado.

Ninguno de los dos es «limpieza después de un desastre»: ambos pueden aparecer mientras la tarea corre perfectamente bien.

## Rebobinar: revierte la escena de decisión, no el mundo exterior

Imagina una tarea que ejecuta veintipico de turnos de llamadas a herramientas. En el turno 15 el modelo toma una mala decisión: elige el archivo equivocado para editar, o hace una suposición errónea sobre un requisito vago. Durante los 10 turnos siguientes sigue construyendo encima de ese error. El Curso 8 de esta serie, «Ingeniería de contexto: gastar una atención finita donde más rinde», mostró que a medida que el contexto se apila más largo y más desprolijo, la capacidad del modelo de recordar información de ahí con precisión se degrada, y este tramo de historia carga además con una decisión equivocada. En vez de dejar que el modelo siga forcejeando dentro de un contexto largo y descarriado, revierte la escena al turno 14, el punto anterior a la mala decisión, y empieza de nuevo desde ahí.

Para hacer eso, un punto de control ya no puede ser «solo el último». El `saveCheckpoint` de las lecciones anteriores sobrescribía el mismo `checkpoint.json` cada vez, así que al recuperar solo podías obtener el último estado escrito: alcanza para recuperación ante desastres, pero no sirve para rebobinar, porque la escena del turno 14 hacía rato que la había sobrescrito el turno 15. Para soportar el rebobinado, los puntos de control tienen que retenerse como una secuencia por turno, con el número de turno y el punto de guardado en el nombre del archivo: `checkpoints/turn-014-A.json`, `checkpoints/turn-014-B.json`, y así. Dentro de cada turno, el punto de guardado A aterriza cuando el modelo propuso su plan pero la herramienta todavía no se ejecutó; el punto de guardado B aterriza cuando el resultado de herramienta del turno queda escrito de vuelta en `messages` y el turno está genuinamente terminado. Por defecto, «volver al turno N» significa la escena posterior a que ese turno terminó, es decir, el último punto de guardado escrito en ese turno:

```javascript
import fs from "node:fs/promises";
import path from "node:path";

function turnFileName(turn, point) {
  return `turn-${String(turn).padStart(3, "0")}-${point}.json`;
}

// Toma el último punto de guardado escrito en un turno: A y B ordenan lexicográficamente, B después de A,
// que coincide exactamente con el orden «antes de ejecutar la herramienta» -> «después de anotar el resultado»
async function pickLatestPoint(turn, dir) {
  const files = await fs.readdir(dir);
  const prefix = `turn-${String(turn).padStart(3, "0")}-`;
  const points = files
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, prefix.length + 1))
    .sort();
  if (points.length === 0) throw new Error(`No checkpoint for turn ${turn}`);
  return points[points.length - 1];
}

async function rewindTo(turn, { point, dir = "checkpoints" } = {}) {
  const wanted = point ?? (await pickLatestPoint(turn, dir));
  const raw = await fs.readFile(path.join(dir, turnFileName(turn, wanted)), "utf8");
  return JSON.parse(raw); // { version, task, turns, tokensUsed, messages, pendingToolUse }
}
```

Con la escena que devuelve `rewindTo(14)`, lo que sigue es el mismo flujo que el de la reanudación: usa estos `messages` para reconstruir la historia y continúa el bucle desde este conteo de `turns`. La única diferencia es que esta vez el modelo se enfrenta a una escena limpia, anterior a que la decisión se tomara, y no al contexto que el turno 15 contaminó.

Pero hay algo que vale la pena decir en voz alta: rebobinar revierte la **escena de decisión**, no el **mundo exterior**. Si la mala decisión del turno 16 ya llamó a una herramienta de alto impacto —envió de verdad un correo, digamos—, rebobinar al turno 14 no trae ese correo de vuelta. Un punto de control guarda `messages`, `turns`, `pendingToolUse` y cualquier otro campo de estado que hayas definido dentro de la instantánea; nunca tuvo la intención de deshacer una acción externa que ya aterrizó, ni puede hacerlo. El registro de efectos de la Lección 4 (`effects.json`) sigue cumpliendo su regla de solo agregar: después de que rebobines y vuelvas a ejecutar desde el turno 15, incluso si el modelo elige esta vez una acción completamente distinta, el registro solo gana una anotación nueva, no borra la vieja. Lo que haya pasado en los diez turnos descartados sigue dejando su rastro en el registro, que es exactamente la mirada sobre la idempotencia de la Lección 4 llevada al escenario del rebobinado.

## Bifurcar: ejecutar dos líneas temporales desde una misma escena

Rebobinar resuelve «esta ruta estaba mal, retrocede y rehazla». Pero a veces la pregunta no es «¿estaba mal?», es «no estoy seguro de cuál es mejor»: dos planes de refactorización tienen sentido, y quieres ejecutar cada uno y comparar antes de elegir. En ese caso, no elijas uno de forma destructiva: copia dos líneas temporales independientes desde el mismo punto de control y ejecuta cada una:

```javascript
async function forkFrom(turn, branchName, { point, baseDir = "checkpoints" } = {}) {
  const startPoint = point ?? (await pickLatestPoint(turn, baseDir));
  const state = await rewindTo(turn, { point: startPoint, dir: baseDir });

  const branchDir = `${baseDir}-${branchName}`;
  await fs.mkdir(branchDir, { recursive: true });
  await fs.writeFile(
    path.join(branchDir, turnFileName(turn, startPoint)),
    JSON.stringify(state, null, 2)
  );

  // Registro de efectos independiente: esta línea temporal corre por su cuenta, cada una anota sus
  // propios efectos, y no arrastra las anotaciones de la línea principal
  await fs.writeFile(path.join(branchDir, "effects.json"), "[]\n");
  return branchDir;
}
```

Después de `forkFrom(14, "plan-b")`, `checkpoints-plan-b/` tiene su propia secuencia de puntos de control y un registro de efectos en blanco. Del turno 14 en adelante, adónde va esta línea temporal, cuántos turnos ejecuta, cuántos puntos de control aterriza: nada de eso interfiere con la línea principal.

Que las dos líneas temporales bifurcadas sean independientes es una advertencia para las herramientas de alto impacto: si ambas líneas llamaran a la misma acción genuinamente externa —las dos necesitan enviar el mismo correo, digamos—, dejar que cada una corra hasta el final sin aprobación significa que cada línea lo envía una vez, lo que se convierte en un efecto secundario duplicado. Cablearles una compuerta de aprobación a herramientas así, o pasar a un modo de simulación durante la bifurcación, vale la pena antes de bifurcar. Es el mismo razonamiento que el de que el registro no se revierta al rebobinar: un punto de control se puede copiar en dos, pero un efecto externo que ya aterrizó no se puede copiar en «uno por mundo paralelo».

## Comparación con un producto: Claude Code ya lo lanzó como funcionalidad

El rebobinado y la bifurcación de arriba son algo que Claude Code ya trae como funcionalidad de nivel producto; esto es solo para comparar, no es la herramienta que se enseña. Su mecanismo de puntos de control captura automáticamente el estado de tu código antes de cada prompt de la persona usuaria[^S2]: cada prompt crea un punto de control nuevo[^S2], y Claude Code guarda los puntos de control junto con la conversación, así que todavía puedes ejecutar `/rewind` después de reanudar una sesión[^S2].

Su menú `/rewind` divide «qué restaurar» en tres opciones: "Restore conversation: rewind to that message while keeping current code" (restaurar la conversación: rebobinar hasta ese mensaje conservando el código actual), "Restore code: revert file changes while keeping the conversation" (restaurar el código: revertir los cambios de archivos conservando la conversación), o "Restore code and conversation: revert both code and conversation to that point"[^S2] (restaurar el código y la conversación: revertir ambos hasta ese punto), que resulta ser la versión producto de la frase de esta lección, «rebobinar revierte la escena de decisión». Puedes elegir revertir solo la escena de decisión (la conversación), o revertir también el código junto con ella. La documentación oficial también lista algunos casos de uso habituales de los puntos de control, como "Exploring alternatives: try different implementation approaches without losing your starting point" (explorar alternativas: probar distintos enfoques de implementación sin perder tu punto de partida) y "Recovering from mistakes: quickly undo changes that introduced bugs or broke functionality"[^S2] (recuperarse de errores: deshacer rápido cambios que introdujeron bugs o rompieron funcionalidad). Vale la pena notar que esos casos de uso están listados de forma genérica bajo los puntos de control (`/rewind`), no separados en «rebobinar» y «bifurcar». Pero puestos contra los dos usos de esta lección —«salió mal, retrocede y rehaz» y «no estoy seguro, bifurca y prueba»—, la dirección coincide.

Del lado de la bifurcación, Claude Code ofrece `/branch` o `claude --continue --fork-session`: "To branch off and try a different approach while preserving the original session intact, use /branch or claude --continue --fork-session"[^S2] (para ramificarte y probar un enfoque distinto conservando intacta la sesión original, usa /branch o claude --continue --fork-session).

## Fronteras y división del trabajo: de qué se hace cargo cada uno —puntos de control, Git y registro de efectos

La documentación de Claude Code también traza una frontera propia: su mecanismo de puntos de control "does not track files modified by bash commands"[^S2] (no rastrea archivos modificados por comandos bash), y "Only direct file edits made through Claude's file editing tools are tracked"[^S2] (solo se rastrean las ediciones directas de archivos hechas a través de las herramientas de edición de archivos de Claude). Por la misma lógica, los puntos de control de tu propio arnés cubren solo los campos de estado que definiste explícitamente dentro de la instantánea: `messages`, `turns`, `tokensUsed`, `pendingToolUse`. Los cambios que una herramienta hizo en el mundo exterior —escribir en una base de datos, llamar a otro servicio, enviar un correo— no son asunto de un punto de control. Ese es el trabajo del registro de efectos.

La documentación oficial enuncia con claridad el papel del mecanismo: los puntos de control están diseñados para una recuperación rápida a nivel de sesión, y para la historia de largo plazo y la colaboración habría que "continue using version control, such as Git, for commits, branches, and long-term history."[^S2] (seguir usando control de versiones, como Git, para commits, ramas e historia de largo plazo). Los tres se hacen cargo de tramos distintos, y lado a lado queda más claro:

| Mecanismo | De qué se hace cargo | Escala temporal |
| --- | --- | --- |
| Punto de control | La escena en curso: `messages`, conteos de turnos, la llamada a herramienta todavía no ejecutada | Minutos, a nivel de sesión |
| Git | La historia propia del código: commits, ramas, colaboración | Permanente, colaborativa |
| Registro de efectos | Efectos secundarios externos que ya ocurrieron: correos enviados, escrituras en bases de datos | Solo agregar, conservado de forma permanente |

```agentmentor-check
{
  "id": "sp-zh-05-checkpoint-vs-git",
  "label": "Juzgar si los puntos de control pueden reemplazar al control de versiones",
  "prompt": "Alguien del equipo propone: ahora que los puntos de control pueden rebobinar por turno, se parecen bastante al historial de commits de Git, así que de acá en adelante manejemos los cambios de código con puntos de control y dejemos Git de lado por completo. ¿Se sostiene la propuesta?",
  "whyHere": "Acabas de terminar la división del trabajo entre puntos de control, Git y el registro de efectos. «Los puntos de control ya pueden rebobinar, ¿entonces Git no es redundante?» es la sobreextensión que más probablemente aparezca justo acá, y esta frontera hay que clavarla en el momento; si no, quien lee funde en una sola cosa la recuperación de sesión en escala de minutos y la historia permanente del código.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Se sostiene. Los puntos de control ya guardan la escena de cada paso por turno —version, turns, messages están todos ahí—, así que hacen el mismo trabajo que los registros de commit de Git, y con puntos de control puedes tanto rebobinar como leer la historia.",
      "correct": false,
      "feedback": "Los campos que guarda un punto de control existen para reconstruir la escena en curso de una sesión, que no es lo mismo que lo que anota un commit de Git: los archivos de código en sí, con control de versiones completo. Los puntos de control se diseñaron para una recuperación rápida a nivel de sesión, mientras que la historia de largo plazo y la colaboración siguen descansando sobre control de versiones como Git[^S2]. No se hacen cargo de lo mismo, así que no hay tal cosa como que uno reemplace al otro."
    },
    {
      "id": "b",
      "text": "No se sostiene. Los puntos de control son recuperación de la escena en curso, en escala de minutos y a nivel de sesión; Git es la historia propia del código, permanente y colaborativa. Se hacen cargo de dos cosas completamente distintas y no pueden suplirse entre sí.",
      "correct": true,
      "feedback": "Correcto. La documentación enuncia la frontera con claridad: los puntos de control están diseñados para una recuperación rápida a nivel de sesión, y la historia de largo plazo y la colaboración siguen requiriendo control de versiones como Git[^S2]. Los puntos de control ni siquiera rastrean archivos modificados por comandos bash, solo las ediciones hechas a través de las propias herramientas de edición de archivos de Claude[^S2], así que ya de entrada su anotación de qué cambió realmente en el código es mucho más angosta que la de Git. Los puntos de control, Git y el registro de efectos se hacen cargo cada uno de un tramo; ninguno reemplaza a otro."
    },
    {
      "id": "c",
      "text": "Se sostiene en parte. Los puntos de control ya pueden rebobinar, así que mientras registres cada rebobinado, es en esencia una gestión de ramas simplificada —apenas una forma distinta de operar— y reemplazar Git gradualmente no está descartado.",
      "correct": false,
      "feedback": "El rebobinado de puntos de control y la gestión de ramas de Git no son dos maneras de escribir lo mismo. Los puntos de control ni siquiera rastrean archivos modificados por comandos bash, solo las ediciones hechas a través de las propias herramientas de edición de archivos de Claude[^S2], así que su cobertura de los cambios de código es mucho más angosta que la de Git, y no tienen nada de la maquinaria de commit, merge y colaboración de Git. Su papel es la recuperación rápida a nivel de sesión, no un reemplazo del control de versiones[^S2]."
    }
  ]
}
```

## El costo de retener: elige tu compromiso

Retener una secuencia de puntos de control por turno no es gratis: dos puntos de guardado por turno y, cuanto más largo corra la tarea, más archivos se apilan en disco. El principio de Anthropic de que "you should consider adding complexity only when it demonstrably improves outcomes"[^S3] (habría que considerar agregar complejidad solo cuando mejora los resultados de forma demostrable) aplica igual acá. Si la tarea corre apenas unos pocos turnos y rara vez necesita un rebobinado, conservar la secuencia entera puede costar más de lo que vale; como en las lecciones anteriores, con conservar solo el último alcanza. Del otro lado, si la tarea corre decenas de turnos y necesita habitualmente rebobinar o bifurcar para probar algunos enfoques, la secuencia que conservas se gana su lugar: cuando algo sale mal no tienes que empezar de cero, y el costo del ensayo y error baja. Esto es en el fondo un juicio a escala del tamaño de la tarea, no una cuestión de qué enfoque es intrínsecamente correcto.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Cuatro escenarios, elige la herramienta correcta

Para cada uno de los cuatro escenarios de abajo, ¿qué deberías usar: rebobinar, reanudar, bifurcar o Git? Responde cada uno y da tu razonamiento.

1. Una tarea corrió veintipico de turnos y notas que el modelo eligió el plan de refactorización equivocado en el turno 12. Los turnos siguientes construyeron todos encima de ese plan equivocado, pero el proceso en sí sigue corriendo bien, sin caída.
2. La misma tarea llegó al turno 18, reiniciaron la máquina anfitriona, el proceso murió por completo y no terminó nada.
3. No estás seguro de si dividir un módulo en dos servicios o en tres, y quieres que el agente ejecute cada plan una vez para poder comparar resultados.
4. Quieres saber cómo se veía este código hace tres días, y quién lo cambió y cuándo.

<!-- rubric -->
- El escenario 1 elige rebobinar, con un razonamiento que apunta a «no hubo caída, pero la decisión salió mal y los turnos posteriores construyeron todos sobre ese error», no reanudar ni bifurcar
- El escenario 2 elige reanudar, con un razonamiento que apunta a «se interrumpió el proceso entero, no fue un error de decisión», usando la reanudación desde un punto de control y no el rebobinado
- El escenario 3 elige bifurcar, con un razonamiento que apunta a «ambos planes necesitan ejecutarse de verdad para obtener resultados comparables», no apostar primero a uno
- El escenario 4 elige Git, con un razonamiento que apunta a «se pregunta por la historia propia del código bajo control de versiones, escala temporal de días y no de minutos», que no entra en el rango a nivel de sesión de un punto de control

<!-- answer -->
1. **Rebobinar**. El proceso no se cayó; el problema es la decisión misma del turno 12, y la docena de turnos siguientes construyeron todos encima de ese error. En vez de empujar hacia adelante dentro de un tramo de historia que ya está descarriado, revierte la escena al turno 11 (antes de la mala decisión) y empieza de nuevo, cambiando la escena de decisión por una que todavía no salió mal.
2. **Reanudar**. Este no es un problema de decisión; el proceso en sí murió por completo, sin relación con lo que estaba pensando el turno 12. Lo que hace falta es retomar el bucle desde el punto de control más reciente, continuando la escena de ejecución original, sin cambiar ninguna decisión.
3. **Bifurcar**. Esto no es «uno estaba mal, retrocede»: ambos planes tienen sentido, y necesitas ejecutar cada uno de verdad para saber cuál es mejor. Copia dos líneas temporales independientes desde el punto de control actual, cada una con su propio registro de efectos, y ejecuta cada una por separado. Más directo que apostar a uno, encontrarlo insuficiente y después rebobinar para reintentar.
4. **Git**. La pregunta acá es sobre el código en sí —«cómo se veía hace tres días, quién lo cambió»—, que es lo que gestionan los sistemas de control de versiones: historia permanente, que abarca días y no minutos. Los puntos de control se retienen por turno para una recuperación rápida de sesión y normalmente no se conservan tanto tiempo, y mucho menos anotan datos de colaboración como «quién lo cambió».

<!-- hint -->
Pregúntate primero: ¿el proceso murió por completo? Si sí, es reanudar; si no, pero se salió del camino, ahí es donde entra rebobinar.

<!-- hint -->
«No estoy seguro de cuál elegir» y «ya elegí el equivocado» no son lo mismo. Lo primero pide bifurcar para comparar; lo segundo pide rebobinar para rehacer. Y si aparece «la historia propia del código», piensa en Git, no en puntos de control.

### Nivel 2: Convertir saveCheckpoint en una secuencia por turno

El código de abajo es la versión vieja de las lecciones anteriores: sobrescribe el mismo `checkpoint.json` cada vez, así que puede soportar la reanudación pero no el rebobinado. Reescríbelo como pide esta lección: los nombres de archivo siguen la regla de retención por turno `turn-NNN-A.json` / `turn-NNN-B.json`; provee un `loadLatest()` para la reanudación que por defecto tome el último punto de guardado escrito en el turno más nuevo; y provee un `rewindTo(turn)` que tome la escena de un turno específico. Cuando termines, escribe la verificación: guarda 5 turnos seguidos, llama a `rewindTo(3)` y confirma que el `turns` de la escena devuelta es 3 y que el largo del registro de efectos `effects.json` no se revirtió.

```javascript
// Versión vieja: sobrescribe el mismo archivo cada vez, solo puede tomar el «último», no el «turno N»
import fs from "node:fs/promises";

async function saveCheckpoint(state) {
  const tmp = "checkpoint.json.tmp";
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, "checkpoint.json");
}

async function loadCheckpoint() {
  const raw = await fs.readFile("checkpoint.json", "utf8");
  return JSON.parse(raw);
}
```

<!-- rubric -->
- `saveCheckpoint` reescrito para nombrar los archivos `turn-NNN-A.json` / `turn-NNN-B.json` en disco y conserva la escritura atómica (escribir primero `.tmp`, después renombrar)
- Provee la lógica para encontrar «el último punto de guardado escrito en un turno», y `loadLatest()` toma correctamente el punto de guardado más nuevo del turno más alto que se ejecutó
- `rewindTo(turn)` toma la escena del turno indicado y no toca `effects.json`
- El script de verificación corre completo: después de guardar 5 turnos, `rewindTo(3).turns === 3`, y el largo de `effects.json` sigue siendo 5 (la acción de rebobinar no lo cambió)

<!-- answer -->
```javascript
import fs from "node:fs/promises";
import path from "node:path";

function turnFileName(turn, point) {
  return `turn-${String(turn).padStart(3, "0")}-${point}.json`;
}

async function saveCheckpoint(state, turn, point, dir = "checkpoints") {
  const file = path.join(dir, turnFileName(turn, point));
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, file); // Escritura atómica: primero tmp, después renombrar en bloque
}

async function pickLatestPoint(turn, dir) {
  const files = await fs.readdir(dir);
  const prefix = `turn-${String(turn).padStart(3, "0")}-`;
  const points = files
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, prefix.length + 1))
    .sort();
  if (points.length === 0) throw new Error(`No checkpoint for turn ${turn}`);
  return points[points.length - 1];
}

async function rewindTo(turn, { point, dir = "checkpoints" } = {}) {
  const wanted = point ?? (await pickLatestPoint(turn, dir));
  const raw = await fs.readFile(path.join(dir, turnFileName(turn, wanted)), "utf8");
  return JSON.parse(raw);
}

async function loadLatest(dir = "checkpoints") {
  const files = await fs.readdir(dir);
  const maxTurn = Math.max(
    ...files.filter((f) => f.startsWith("turn-")).map((f) => Number(f.slice(5, 8)))
  );
  return rewindTo(maxTurn, { dir });
}

export { saveCheckpoint, rewindTo, loadLatest };
```

Script de verificación (`effects.json` usa la misma escritura atómica para agregar, representando el registro que ni la reanudación ni el rebobinado tocan jamás):

```javascript
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { saveCheckpoint, rewindTo, loadLatest } from "./checkpoint.mjs";

async function appendEffect(entry, file = "effects.json") {
  let ledger = [];
  try {
    ledger = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  ledger.push(entry);
  await fs.writeFile(file, JSON.stringify(ledger, null, 2));
}

await fs.mkdir("checkpoints", { recursive: true });

for (let turn = 1; turn <= 5; turn++) {
  const stateA = {
    version: 1,
    task: "demo",
    turns: turn,
    tokensUsed: turn * 100,
    messages: [{ role: "user", content: `turn ${turn} A` }],
    pendingToolUse: { name: "send_email" },
  };
  await saveCheckpoint(stateA, turn, "A");

  const stateB = {
    ...stateA,
    messages: [...stateA.messages, { role: "user", content: `turn ${turn} B` }],
    pendingToolUse: null,
  };
  await saveCheckpoint(stateB, turn, "B");

  await appendEffect({ turn, action: "send_email" });
}

const rewound = await rewindTo(3);
assert.equal(rewound.turns, 3);
console.log("rewindTo(3).turns =", rewound.turns); // rewindTo(3).turns = 3

const effects = JSON.parse(await fs.readFile("effects.json", "utf8"));
assert.equal(effects.length, 5);
console.log("effects.json length =", effects.length); // effects.json length = 5

console.log("PASSED");
```

Ejecutar `node verify.mjs` localmente imprime:

```
rewindTo(3).turns = 3
effects.json length = 5
PASSED
```

La primera línea prueba que `rewindTo(3)` de verdad revirtió la escena al turno 3, y no reanudó al turno 5, el más nuevo. La segunda línea prueba que la acción de rebobinar solo reconstruyó la escena de decisión: el registro de efectos no se tocó nunca, y las 5 anotaciones de lo que ocurrió genuinamente en esos turnos siguen todas ahí.

<!-- hint -->
¿Cómo juzgas «el último punto de guardado escrito en un turno»? A y B ordenan lexicográficamente, alineándose exactamente con el orden temporal «antes de ejecutar la herramienta» → «después de anotar el resultado», así que basta con tomar el último después de ordenar. No hacen falta marcas de tiempo extra.

<!-- hint -->
El registro de efectos es un archivo aparte (`effects.json`), completamente independiente de la secuencia de puntos de control. Mientras `rewindTo` no tenga ninguna línea de código que lo toque, esta verificación va a pasar sola. No hace falta «protegerlo» de forma especial.

<!-- /exercises -->

## Resumen

- Los puntos de control no son solo un seguro de recuperación ante desastres: una hilera retenida de puntos de control es la línea temporal de la tarea y, más allá de la reanudación, soportan rebobinar y bifurcar; una hoja de ruta comunitaria encuadra esos tres juntos como aquello de lo que se hace cargo el componente de persistencia[^S5]
- Rebobinar revierte la **escena de decisión**, no el **mundo exterior**: las acciones externas que de verdad ocurrieron no se deshacen al rebobinar, y el registro de efectos se mantiene de solo agregar; es la mirada sobre la idempotencia de la Lección 4 llevada al escenario del rebobinado
- Soportar el rebobinado exige que los puntos de control se retengan como una secuencia por turno (tipo `turn-014-A/B.json`) en vez de sobrescribir para conservar solo el último; `rewindTo(turn)` toma por defecto el último punto de guardado escrito en ese turno
- Bifurcar copia líneas temporales independientes desde la misma escena, cada una con su propia secuencia de puntos de control y su propio registro de efectos. Si ambas líneas fueran a golpear la misma herramienta de alto impacto, acuérdate de cablear una compuerta de aprobación o pasar a modo de simulación; si no, son efectos secundarios duplicados
- Claude Code ya trae el rebobinado y la bifurcación como funcionalidades de producto: puntos de control creados automáticamente por prompt, `/rewind` puede restaurar la conversación o el código por separado, `/branch` y `--fork-session` para bifurcar[^S2]. Pero traza su propia frontera: solo rastrea las ediciones hechas desde las propias herramientas de edición de archivos de Claude, no los cambios de comandos bash[^S2], y está posicionado como recuperación rápida a nivel de sesión, con Git haciéndose cargo todavía de la historia de largo plazo y la colaboración[^S2]
- Tres trabajos distintos: los puntos de control se hacen cargo de la escena en curso en escala de minutos, Git de la historia permanente y colaborativa del código, el registro de efectos de los efectos secundarios externos que ya ocurrieron. Retener una secuencia completa de puntos de control por turno tiene un costo en disco; si vale la pena depende de la escala de la tarea, no de qué enfoque es intrínsecamente correcto[^S3]

[>> Lección 6: Manos a la obra: conectar los puntos de control y la reanudación al arnés](./06-build-checkpointing.md)


