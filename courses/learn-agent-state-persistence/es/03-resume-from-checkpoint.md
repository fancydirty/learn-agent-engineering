# Lección 3: Reanudar desde un punto de control: reiniciar el bucle

> Objetivos de aprendizaje:
> - Decir por qué una «llamada colgante» aparece sí o sí en un escenario de recuperación tras una caída, y en qué se diferencia de una falla común de ejecución de herramienta
> - Escribir la ruta de reanudación completa desde `loadCheckpoint()` de vuelta al bucle, verificación de versión y reconstrucción del estado incluidas
> - Conciliar una llamada colgante según la naturaleza de la herramienta —las herramientas de solo lectura se vuelven a ejecutar directamente, las de alto impacto pasan primero al plan de repliegue— en vez de volver a ejecutar a ciegas o borrar a ciegas
>
> Requisitos: Terminaste la Lección 2 y entiendes los campos de `checkpoint.json` y los dos puntos de guardado | Anterior: [Lección 2 <<](./02-checkpoint-anatomy.md) | Siguiente: [Lección 4 >>](./04-side-effects-idempotency.md)

## Reanudar, no reiniciar

Un agente se cae a mitad de camino, y el primer impulso suele ser volver a ejecutarlo. Pero para una tarea larga que ya lleva una docena de turnos de profundidad y llamó herramientas varias veces, reiniciar es un mal canje: "restarts are expensive and frustrating for users"[^S1] (los reinicios son costosos y frustrantes para los usuarios). La Lección 2 escribió la escena de ejecución en `checkpoint.json` —`version`, `task`, `turns`, `tokensUsed`, `messages`, `pendingToolUse`—, guardando una vez después de que el modelo responde (punto de guardado A) y otra después de que el resultado de la herramienta queda registrado (punto de guardado B). Lo que hace esta lección es convertir esa escena guardada de vuelta en un bucle que pueda avanzar: construir un sistema que pueda "resume from where the agent was when the errors occurred"[^S1] (reanudar desde donde estaba el agente cuando ocurrieron los errores) en vez de arrancar de nuevo desde arriba cada vez.

## La columna vertebral de la reanudación: una mitad es fácil

Empecemos por la mitad fácil. La columna vertebral de la reanudación son cuatro pasos: leer el archivo, hacerle `JSON.parse`, verificar `version` y desparramar los campos de vuelta en el estado en tiempo de ejecución. Una vez hechos esos cuatro, `runAgent` no necesita reconstruir un arreglo `messages` inicial: el punto de control ya sostiene uno completo, así que saltea la inicialización y cae directo en el bucle.

```javascript
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const CHECKPOINT_PATH = "./checkpoint.json";
const CHECKPOINT_VERSION = 1;
const MAX_TURNS = 40;

function saveCheckpoint(state) {
  const tmpPath = `${CHECKPOINT_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, CHECKPOINT_PATH); // .tmp + rename: una escritura fallida no puede corromper el último punto de control utilizable
}

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  const raw = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
  if (raw.version !== CHECKPOINT_VERSION) {
    throw new Error(`Versión de punto de control incompatible: el archivo es v${raw.version}, el código es v${CHECKPOINT_VERSION}`);
  }
  return raw; // { version, task, turns, tokensUsed, messages, pendingToolUse }
}
```

Con esas dos funciones en su lugar, el arranque de `runAgent` se vuelve una bifurcación simple:

```javascript
async function runAgent(task) {
  const cp = loadCheckpoint();

  let state;
  if (cp) {
    // Reanudación: el estado sale del punto de control; pendingToolUse se maneja enseguida
    state = cp.pendingToolUse ? await reconcile(cp) : cp;
  } else {
    // Arranque desde cero: se escribe a mano el primer mensaje del usuario, el resto en cero
    state = {
      version: CHECKPOINT_VERSION,
      task,
      turns: 0,
      tokensUsed: 0,
      messages: [{ role: "user", content: task }],
      pendingToolUse: null,
    };
  }

  while (state.turns < MAX_TURNS) {
    state.turns++;
    const response = await client.messages.create({ messages: state.messages });
    state.tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    state.messages.push({ role: "assistant", content: response.content });

    const toolUseBlock = response.content.find((b) => b.type === "tool_use");
    state.pendingToolUse = toolUseBlock
      ? { id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input }
      : null;
    saveCheckpoint(state); // Punto de guardado A: después de la respuesta del modelo

    if (response.stop_reason !== "tool_use") break;

    const output = await executeTool(toolUseBlock.name, toolUseBlock.input);
    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseBlock.id, content: output }],
    });
    state.pendingToolUse = null;
    saveCheckpoint(state); // Punto de guardado B: después de que el resultado de la herramienta queda registrado
  }

  return state;
}
```

Después de reanudar, lo primero que hace el bucle es exactamente lo que hace siempre: tomar `state.messages` y disparar el siguiente `client.messages.create()`. Los `messages` que ve el modelo son idénticos a los que veía antes de la caída: no tiene idea de que hubo un reinicio de proceso en el medio. Por eso la Lección 2 insistió en que `messages` entrara al punto de control sin tocar: mientras ese arreglo se restaure fielmente, la reanudación es invisible para el modelo.

## La mitad difícil: conciliar una llamada colgante

El problema de verdad es el punto de control donde `state.pendingToolUse` no es `null`. Recuerda dónde van los dos puntos de guardado: el punto A viene después de la respuesta del modelo, y en ese momento `pendingToolUse` sostiene el `{id, name, input}` de esta respuesta; el punto B viene después de que el resultado de la herramienta queda registrado, y `pendingToolUse` vuelve a `null`. Si el proceso muere justo entre A y B —la herramienta todavía no se ejecutó, o terminó pero el resultado nunca llegó a `messages`—, lo que conserva el punto de control es un `pendingToolUse` que no es `null`.

Ahora la cola de `messages` es un mensaje `assistant` que carga un bloque `tool_use`, sin ningún `tool_result` que le corresponda. Este no es un estado en el que puedas seguir renqueando: el protocolo exige "return one tool_result for each tool_use block, all together in the next user message"[^S4] (devolver un tool_result por cada bloque tool_use, todos juntos en el siguiente mensaje del usuario). Sin ese resultado, la reanudación no puede hacer la llamada siguiente en absoluto: lo que ve el modelo es un intercambio a medio terminar en el que arrancó una llamada a herramienta y nunca va a recibir respuesta. Hay que ocuparse de esta llamada colgante antes de volver a entrar al bucle.

## Tres maneras de manejarlo, solo una se sostiene

Frente a este mensaje `assistant` colgante hay tres jugadas obvias, pero solo una se sostiene de verdad.

**Jugada uno: borrar el mensaje `assistant` de `messages` y hacer de cuenta que nunca pasó.** Parece lo más limpio: la conversación reanudada ya no tiene ningún hueco. Pero el costo viene en dos capas. Primero, el modelo olvida una decisión que ya tomó, así que puede recorrer la misma exploración otra vez y quemar un turno extra para nada. Segundo, y más peligroso: si esa llamada a herramienta de hecho ya se había ejecutado, y el proceso simplemente murió antes de registrar el resultado, borrar el mensaje no deshace el efecto secundario que ya ocurrió; solo hace que el modelo, y cada entrada de registro posterior, dejen de saber que ocurrió. Borrar esconde el hecho, no el riesgo.

**Jugada dos: simplemente volver a ejecutar la herramienta y rellenar el resultado en un `tool_result`.** Para una herramienta de solo lectura (`read_file`, `grep` y similares) esto es exactamente lo correcto: leer dos veces no se diferencia en nada de leer una vez, el efecto secundario es cero. Para una herramienta de alto impacto (enviar correo, escribir en una base de datos) es peligroso: es muy probable que la herramienta ya se haya ejecutado una vez, y volver a ejecutarla sin condiciones significa ejecutarla una segunda vez. Este es precisamente el problema de idempotencia que la Lección 4 toma en detalle; por ahora esta lección fija una regla accionable: **las herramientas de solo lectura se vuelven a ejecutar directamente; las de alto impacto primero tienen que confirmar si ya se ejecutaron antes de decidir si volver a ejecutarlas.**

**Jugada tres: agregar un `tool_result` con `is_error: true` que diga «estado de ejecución desconocido, por favor reevalúa», y devolverle la decisión al modelo.** Este es el repliegue conservador para cuando no puedes saber si se ejecutó: el campo `is_error` está justamente para "Set to true if the tool execution resulted in an error"[^S4] (ponerlo en true si la ejecución de la herramienta resultó en un error). Y resulta que "letting the agent know when a tool is failing and letting it adapt works surprisingly well"[^S1] (avisarle al agente cuando una herramienta está fallando y dejarlo adaptarse funciona sorprendentemente bien): el modelo relee el contexto y decide si confirmar el resultado por otra vía, en lugar de quemarse con una acción silenciosa y posiblemente repetida.

Alinea las tres y la jugada uno queda descartada; las jugadas dos y tres cubren respectivamente los casos de «puedes saberlo» y «no puedes saberlo», y solo juntas forman la regla de conciliación completa.

```agentmentor-check
{
  "id": "sp-zh-03-dangling-tool-use",
  "label": "Manejar una llamada colgante",
  "prompt": "Al reanudar encuentras que pendingToolUse no es null en el punto de control: el último mensaje assistant tiene dentro un tool_use sin ningún tool_result que le corresponda. Alguien sostiene que la jugada más limpia es borrar ese mensaje assistant de messages y hacer de cuenta que nunca pasó, así la conversación reanudada no tiene ningún hueco. ¿Está en lo cierto?",
  "whyHere": "Esto llega justo después de presentar las tres jugadas, con el borrado como la tentadora, para comprobar si ves por qué eliminar el mensaje assistant colgante no es una opción segura.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No. Borrar ambos hace que el modelo olvide una decisión que ya tomó y puede esconder un efecto secundario que de verdad ocurrió; la jugada correcta es conciliar según la naturaleza de la herramienta y proveer el tool_result que corresponde, no borrar el tool_use",
      "correct": true,
      "feedback": "Correcto. Borrar cuesta en dos capas: el modelo puede volver a explorar algo que ya hizo y, más peligroso, si la herramienta de hecho ya se había ejecutado, borrar solo hace que ese hecho se esfume de la conversación y de todo juicio posterior. El protocolo exige un tool_result que corresponda a cada tool_use, y conciliar en vez de borrar es como vuelves a un estado desde el que se puede continuar."
    },
    {
      "id": "b",
      "text": "Sí: una vez que messages ya no sostiene un tool_use sin resultado que le corresponda, la conversación reanudada queda limpia y es segura para continuar",
      "correct": false,
      "feedback": "«Sin huecos» es limpio solo en la superficie. Si esa llamada a herramienta de hecho ya se había ejecutado (el correo ya salió, digamos), borrar el mensaje no deshace lo que pasó: solo hace que el modelo y los registros dejen de saber que pasó. El riesgo queda enmascarado, no eliminado."
    },
    {
      "id": "c",
      "text": "Sí: las herramientas de solo lectura y las de alto impacto terminan igual consultando al modelo de nuevo, así que descartar el tool_use viejo no va a tener ningún efecto real",
      "correct": false,
      "feedback": "Los dos tipos de herramienta no se manejan igual: una herramienta de solo lectura habría que volver a ejecutarla directamente para obtener el resultado real, y una de alto impacto cuyo estado de ejecución previa no puedes determinar debería replegarse a is_error. Ambos caminos le proveen al tool_use colgante un tool_result que le corresponde: ninguno lo borra, y ninguno se limita a consultar al modelo de nuevo en todos los casos."
    }
  ]
}
```

## reconcile(cp): convertir la conciliación en código

Convierte esa regla en una función: decidir a partir del nombre de la herramienta si es de solo lectura y, en ese caso, volver a ejecutarla; si no lo es, ir a consultar el «registro de efectos» para confirmar si esta llamada ya se ejecutó. Todavía no hay registro de efectos en esta lección, así que un comentario ocupa su lugar, y la Lección 4 da la implementación real. Cuando no puedes saberlo, cae al repliegue de `is_error`.

```javascript
const READ_ONLY_TOOLS = new Set(["read_file", "grep", "list_dir", "web_search"]);

async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  let toolResult;
  if (READ_ONLY_TOOLS.has(name)) {
    // Herramienta de solo lectura: cero efectos secundarios, se vuelve a ejecutar directamente para obtener el resultado real
    const output = await executeTool(name, input);
    toolResult = { type: "tool_result", tool_use_id: id, content: output };
  } else {
    // Herramienta de alto impacto: consultar primero el registro de efectos para ver si ya se ejecutó (la Lección 4 introduce el registro; aquí va un marcador de posición)
    // const record = await ledger.checkExecuted(id);
    // if (record) toolResult = { type: "tool_result", tool_use_id: id, content: record.result };
    // else toolResult = { type: "tool_result", tool_use_id: id, content: await executeTool(name, input) };
    //
    // En esta lección no hay ningún registro conectado; cuando no puedes saberlo, usa el repliegue conservador:
    toolResult = {
      type: "tool_result",
      tool_use_id: id,
      content: "Estado de ejecución desconocido: el proceso se cayó antes de que esta llamada terminara, así que no hay manera de confirmar si tuvo efecto. Por favor, reevalúa la situación actual.",
      is_error: true,
    };
  }

  messages.push({ role: "user", content: [toolResult] });
  cp.pendingToolUse = null;
  return cp;
}
```

Una vez que `reconcile()` termina, la cola de `cp.messages` tiene rellenado el `tool_result` que corresponde y `cp.pendingToolUse` volvió a `null`. Este `cp` es ahora indistinguible de un punto de control que quedó registrado normalmente en el punto de guardado B, y puede ir directo al bucle `while` para seguir adelante.

## Después de reanudar: contar turns y tokensUsed

Hay dos contadores que la ruta de reanudación desajusta con facilidad, y vale la pena detallarlos aparte.

`turns` no se reinicia al reanudar. Cuenta los turnos totales de la tarea desde el comienzo hasta ahora, no «cuántos turnos ejecutó esta instancia del proceso»: el `turns` del punto de control debería seguir incrementándose desde donde quedó, que es la única manera de que el tope `MAX_TURNS` fijado en la Lección 2 siga haciendo su trabajo. Pon `turns` en cero al reanudar y una tarea que se cae y se recupera una y otra vez puede esquivar el techo de turnos y ejecutarse para siempre.

`tokensUsed` funciona igual: se arrastra desde el punto de control, no se recalcula. Cuando «Ingeniería de contexto: gastar una atención finita donde más rinde» cubre la compactación de contexto, `tokensUsed` significa «el consumo de la ventana actual», y lo que guardó el punto de control es precisamente el consumo de esa ventana en el instante de la caída. Los dos cargan el mismo significado, así que al reanudar lo tomas y sigues, sin ninguna conversión extra.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Tres puntos de control, tres acciones de reanudación

Abajo hay tres puntos de control leídos al momento de reanudar (el contenido de `messages` está elidido para que se lea mejor). Para cada uno, escribe qué debería hacer `runAgent` al reanudar, y por qué.

```javascript
// Punto de control A
const cpA = {
  version: 1,
  task: "Ayúdame a juntar las notas de reunión de esta semana",
  turns: 6,
  tokensUsed: 18420,
  messages: [/* … el último es una respuesta assistant de texto plano … */],
  pendingToolUse: null,
};

// Punto de control B
const cpB = {
  version: 1,
  task: "Ayúdame a juntar las notas de reunión de esta semana",
  turns: 7,
  tokensUsed: 19310,
  messages: [/* … el último es un mensaje assistant que contiene un tool_use … */],
  pendingToolUse: { id: "toolu_01A", name: "read_file", input: { path: "./notes/meeting-08-25.md" } },
};

// Punto de control C
const cpC = {
  version: 1,
  task: "Enviarle un correo al equipo para avisarle de las conclusiones",
  turns: 9,
  tokensUsed: 24003,
  messages: [/* … el último es un mensaje assistant que contiene un tool_use … */],
  pendingToolUse: { id: "toolu_01B", name: "send_email", input: { to: "team@example.com", subject: "Conclusiones de esta semana" } },
};
```

<!-- rubric -->
- cpA: `pendingToolUse` es `null`, lo que significa que la caída se produjo después del punto de guardado B y antes del siguiente `create()`; al reanudar basta con tomar `messages` y disparar la llamada siguiente, sin ninguna conciliación
- cpB: `pendingToolUse` apunta a `read_file`, una herramienta de solo lectura con cero efectos secundarios; al reanudar, volver a ejecutarla directamente para obtener el resultado, rellenar un `tool_result` y continuar
- cpC: `pendingToolUse` apunta a `send_email`, una herramienta de alto impacto que no se puede volver a ejecutar sin condiciones; en esta lección todavía no hay registro de efectos, así que hay que replegarse a `is_error` y decirle la verdad al modelo («estado de ejecución desconocido») en vez de reenviar un correo

<!-- hint -->
1. Primero fíjate si `pendingToolUse` es `null`: si lo es, no hay ninguna conciliación involucrada, y la pregunta en realidad va sobre los otros dos. 2. Después mira el nombre de la herramienta: ¿está en `READ_ONLY_TOOLS`? 3. Solo una herramienta de alto impacto cuyo estado de «¿ya se ejecutó?» no puedas determinar amerita el repliegue en vez de volver a ejecutarla.

<!-- answer -->
cpA no necesita conciliación: `pendingToolUse` es `null`, lo que significa que la caída se produjo después del punto de guardado B, `messages` está completo, y al reanudar lo usas para disparar directamente el siguiente `client.messages.create()`. cpB necesita volver a ejecutarse: `read_file` es una herramienta de solo lectura, repetirla no produce ningún efecto secundario, y al reanudar la llamada a `reconcile()` cae naturalmente en la rama de `READ_ONLY_TOOLS`, obtiene el contenido real del archivo y lo rellena en un `tool_result`. cpC no se puede volver a ejecutar: `send_email` es una herramienta de alto impacto que muy probablemente ya se ejecutó una vez, y volver a ejecutarla sin condiciones le dejaría al equipo un correo duplicado; en esta lección todavía no hay registro de efectos para confirmar si se ejecutó, así que `reconcile()` debería caer en la rama de repliegue de `is_error` y entregarle al modelo un honesto «estado de ejecución desconocido, por favor reevalúa» en lugar de enviar de nuevo.

### Nivel 2: Encontrar la causa raíz del correo duplicado

Un reporte de incidente de operaciones: «El proceso fue matado y reiniciado por el OOM killer después de la llamada a la herramienta `send_email` pero antes de que el resultado quedara registrado. Al reiniciar, el arnés hizo `--resume` automáticamente, y unos minutos después un usuario reportó haber recibido dos correos idénticos.»

El `reconcile()` que corría en producción en ese momento se veía así:

```javascript
// La versión que estaba viva en producción cuando ocurrió el incidente
async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  const output = await executeTool(name, input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: id, content: output }],
  });
  cp.pendingToolUse = null;
  return cp;
}
```

Determina la causa raíz y después reescribe este `reconcile()` en una versión que enrute según la naturaleza de la herramienta (pista: la regla que fijó esta lección es «solo lectura se vuelve a ejecutar directamente; una herramienta de alto impacto sin registro se repliega a `is_error`»). Una vez reescrito, ejecútalo con `node` y verifica que una herramienta de alto impacto como `send_email` ya no dispare `executeTool()`.

<!-- rubric -->
- Causa raíz: `reconcile()` llama a `executeTool()` para volver a ejecutar cada `pendingToolUse` sin distinguir herramientas de solo lectura de las de alto impacto; `send_email` muy probablemente ya se había ejecutado una vez antes de la caída, así que volver a ejecutarla sin condiciones la ejecuta una segunda vez y envía el correo dos veces
- Corrección: traer un conjunto `READ_ONLY_TOOLS` para enrutar según el nombre de la herramienta; solo las de solo lectura tienen permitido llamar a `executeTool()` y volver a ejecutarse; una herramienta de alto impacto (como `send_email`) ya no se vuelve a ejecutar sin condiciones sino que recibe un `tool_result` con `is_error: true` que le devuelve al modelo el juicio de «estado de ejecución desconocido»
- En el código reescrito, una llamada como `read_file` y una como `send_email` tienen que tomar dos caminos distintos, pero ambos caminos tienen que terminar proveyéndole a `messages` un `tool_result` que corresponda; de lo contrario la reanudación no puede continuar la conversación normalmente

<!-- answer -->
La causa raíz es que `reconcile()` trata cada `pendingToolUse` como «seguro de volver a ejecutar», sin distinguir las herramientas por sus efectos secundarios. `send_email` lo más probable es que ya hubiera enviado el correo antes de la caída; el proceso simplemente no llegó a registrar el resultado en `messages`. Llamar a `executeTool("send_email", …)` una vez más al reanudar envía genuinamente el mismo correo una segunda vez. La versión corregida tiene que enrutar según el nombre de la herramienta:

```javascript
const READ_ONLY_TOOLS = new Set(["read_file", "grep", "list_dir", "web_search"]);

async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  let toolResult;
  if (READ_ONLY_TOOLS.has(name)) {
    const output = await executeTool(name, input);
    toolResult = { type: "tool_result", tool_use_id: id, content: output };
  } else {
    toolResult = {
      type: "tool_result",
      tool_use_id: id,
      content: "Estado de ejecución desconocido: el proceso se cayó antes de que esta llamada terminara, así que no hay manera de confirmar si tuvo efecto. Por favor, reevalúa la situación actual.",
      is_error: true,
    };
  }

  messages.push({ role: "user", content: [toolResult] });
  cp.pendingToolUse = null;
  return cp;
}
```

Después de la corrección, una herramienta como `send_email` que no está en `READ_ONLY_TOOLS` nunca vuelve a disparar `executeTool()`: `reconcile()` solo le provee un `tool_result` con `is_error`; solo una herramienta de solo lectura como `read_file` se vuelve a ejecutar de verdad. Ejecútalo con `node`, llamando a `reconcile()` una vez con un nombre de herramienta de solo lectura y otra con `send_email`, y revisa el registro de llamadas a `executeTool`: debería aparecer en la ejecución de solo lectura y no en la de `send_email`.
<!-- /exercises -->

## Resumen

La columna vertebral de la reanudación no es difícil: leer el punto de control, verificar la versión, desparramar los campos de vuelta en el estado en tiempo de ejecución, saltear la inicialización y caer directo en el bucle; el modelo ni siquiera puede sentir que hubo una caída en el medio. Lo que sí hay que diseñar es la conciliación de la llamada colgante: borrar pierde una decisión y enmascara un efecto secundario que ya ocurrió; una herramienta de solo lectura se puede volver a ejecutar sin preocuparse; y para una herramienta de alto impacto cuyo estado de ejecución previa no puedes determinar, un repliegue a `is_error` es una elección más segura que volver a ejecutarla a ciegas. Pero esa regla todavía deja un problema sin resolver: ¿cómo verificas de verdad si una herramienta de alto impacto ya se ejecutó? Esta lección solo se replegó a «no se puede saber»; poder saberlo genuinamente requiere un registro de efectos, y eso es exactamente lo que resuelve la lección siguiente.

[>> Lección 4: Efectos secundarios e idempotencia: qué herramientas es seguro volver a ejecutar al reanudar](./04-side-effects-idempotency.md)
