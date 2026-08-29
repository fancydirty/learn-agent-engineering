# Lección 6: Práctica: construye un circuito de evaluación para tu agente

> Objetivos de aprendizaje:
> - Unir conjuntos de evaluación, calificación estratificada y bucles de arnés en un `eval-runner.mjs` ejecutable — una tarea de evaluación por bucle independiente
> - Hacer que los reportes capturen no solo la tasa de aprobación, sino también la duración por tarea, el número de llamadas a herramientas, el consumo de tokens y los errores de herramienta, y usar esas columnas para diagnosticar problemas
> - Usar este circuito para medir el impacto real de un cambio en el prompt del sistema, y atrapar un verificador demasiado estricto que rechaza salidas correctas
>
> Requisitos: Leer las lecciones 1–5, tener a mano el bucle de arnés del curso 7 y poder ejecutarlo | Anterior: [Lección 5 <<](./05-eval-sets.md)

Las primeras cinco lecciones fueron todas componentes: verifica el estado final y no paso por paso (lección 2), verificaciones deterministas primero y ojo con los verificadores demasiado estrictos (lección 3), el texto de forma libre solo admite jueces LLM (lección 4), los conjuntos de evaluación arrancan con unas veinte tareas reales (lección 5). Cada uno tiene sentido por su cuenta, pero después de cambiar tu prompt sigues sin tener algo que puedas ejecutar con un solo comando para que los números te digan «mejor o peor».

Esta lección suelda los componentes. Lo que obtienes es un archivo de trescientas líneas que se ejecuta en menos de dos segundos. La guía oficial sobre «cómo ejecutar evaluaciones» es directa: usa llamadas programáticas y directas a la API del LLM; usa bucles agénticos simples — bucles `while` que alternan llamadas al LLM y llamadas a herramientas — **una tarea de evaluación por bucle**[^S3]. Ese es exactamente el bucle guiado por `stop_reason` del curso 7 de esta serie. Puedes trasplantarlo tal cual.

## Cómo se ve cuando se ejecuta

Guarda el `eval-runner.mjs` completo que aparece más adelante en esta lección y después `node eval-runner.mjs`:

```text
=== Reporte · Prompt v1 · Verificador normalizado (corregido) ===
Tarea             Calificador   Resultado    Puntuación  Llamadas  Errores    Tokens  Duración
----------------------------------------------------------------------------------------------
t1-total          determinista  pass               1.00         3        0     1,800     123ms
t2-pending        determinista  pass               1.00         1        0       995      82ms
t3-no-orderid     determinista  FAIL               0.00         2        1     1,550     123ms
t4-refund-note    juez LLM      FAIL               0.67         1        0     1,432     123ms
t5-missing-order  determinista  pass               1.00         1        1       966      83ms
----------------------------------------------------------------------------------------------
Tasa de aprobación 3/5 (60%) · Llamadas a herramientas 8 · Errores de herramienta 2 · Tokens 6,743 · Total 534ms

Casos fallidos:
  [t3-no-orderid] Criterio: Con parámetros incompletos debería llamar cero herramientas y preguntar por el ID de pedido
  Respuesta del agente: El estado del pedido SO-1001 es completado.
  [t4-refund-note] Criterio: El monto coincide con el pedido y el tono es apropiado; pero falta el tiempo de acreditación del reembolso, el cliente se queda sin expectativa, falta 1 de 3 ítems.
  Respuesta del agente: Hola, recibimos la cancelación del pedido SO-1003 (monto ¥320.00), el reembolso se devolverá al método de pago original. Lamentamos las molestias.

=== Reporte · Prompt v2 · Verificador normalizado (corregido) ===
Tarea             Calificador   Resultado    Puntuación  Llamadas  Errores    Tokens  Duración
----------------------------------------------------------------------------------------------
t1-total          determinista  pass               1.00         3        0     1,800     124ms
t2-pending        determinista  pass               1.00         1        0       995      80ms
t3-no-orderid     determinista  pass               1.00         0        0       487      41ms
t4-refund-note    juez LLM      pass               1.00         1        0     1,518     124ms
t5-missing-order  determinista  pass               1.00         1        1       966      81ms
----------------------------------------------------------------------------------------------
Tasa de aprobación 5/5 (100%) · Llamadas a herramientas 6 · Errores de herramienta 1 · Tokens 5,766 · Total 450ms

=== Cambio de puntuación v1 -> v2 ===
Tarea                  v1     v2  Cambio
--------------------------------------------------
t1-total             1.00   1.00  sin cambio
t2-pending           1.00   1.00  sin cambio
t3-no-orderid        0.00   1.00  fail => pass
t4-refund-note       0.67   1.00  fail => pass
t5-missing-order     1.00   1.00  sin cambio
--------------------------------------------------
Tasa de aprobación 3/5 -> 5/5
```

Esto no es un ejemplo hecho a mano — está copiado textualmente de una ejecución real en un directorio temporal. Copia el código completo y ejecútalo una vez; todo excepto la columna «Duración» (tiempo real de reloj, que varía con la carga de la máquina) va a coincidir hasta el milisegundo. Los números son los mismos porque el cliente stub devuelve respuestas prefijadas.

Esta salida contiene todo lo que enseña esta lección: cinco tareas ejecutando cada una su propio bucle, dos modos de calificación mezclados en una sola tabla, tasa de aprobación más cuatro columnas de diagnóstico, y la diferencia entre dos versiones colapsada en una tabla comparativa. El resto de la lección lo desempaqueta.

## Las cinco piezas de un circuito

1. **Sistema bajo prueba**: definiciones de herramientas, implementaciones reales de las herramientas y los datos detrás de ellas. La evaluación ejecuta «el agente usa tus herramientas para trabajar» — las herramientas son parte de lo que estás probando.
2. **Cliente stub**: un `messages.create` falso que devuelve respuestas prefijadas en una cola fija, y que vuelve reproducible todo el circuito.
3. **Conjunto de evaluación**: un arreglo `tasks`, cada entrada es `{id, prompt, verify}`. Requisito oficial: cada prompt de evaluación debería estar emparejado con una respuesta o un resultado verificable[^S3] — un prompt sin verificador no es una tarea de evaluación, es una demo.
4. **Calificación**: lo que se puede calificar de forma determinista va a una función `verify`; el texto de forma libre va al juez.
5. **Bucle y reporte**: una tarea, un bucle `while`; al terminar, agrega las métricas en una tabla.

Una cosa que conviene dejar clara desde ya: **las tareas no comparten `messages`**. El `messages` de cada tarea arranca solo con el prompt de usuario de esa tarea, ejecuta su propio bucle y después se descarta[^S3]. Por qué esto importa tanto — el cuestionario del medio lo va a preguntar directamente.

## Pieza uno: las herramientas y los datos detrás de ellas

El sistema bajo prueba es un asistente de pedidos, cuatro pedidos, dos herramientas: `search_orders` (busca por nombre de cliente o estado, devuelve una lista de IDs de pedido) y `get_order` (consulta el detalle de un solo pedido por su ID). Dos detalles son deliberados: `search_orders` solo devuelve IDs de pedido sin montos, lo que obliga al agente a llamar `get_order` de nuevo por cada pedido — la columna «Llamadas» del reporte va a exponer este defecto de diseño. El otro: lanza un error cuando ambas condiciones de filtro vienen vacías:

```javascript
search_orders({ customer, status }) {
  if (!customer && !status) {
    throw new Error("Parámetros inválidos: debe proporcionarse al menos uno de customer o status");
  }
  // ...filtra por condiciones, devuelve { order_ids: [...] }
}
```

Este es el error de herramienta por «parámetro inválido». La guía oficial dice que cuando estos errores se agrupan, normalmente significa que las descripciones de herramientas deberían ser más claras o necesitan ejemplos[^S3]. Lo vamos a ver en el reporte en un momento. Los errores de herramienta no son caídas — el bloque de ejecución de herramientas atrapa la excepción, la envuelve en un `tool_result` con `is_error: true`, se lo devuelve al modelo e incrementa un contador. `tool_use` y `tool_result` se emparejan por `tool_use_id` — esa es la base que puso el curso 7, aquí solo agregamos dos contadores.

## Pieza dos: el cliente stub y el interludio de verificación

Hace falta una pausa acá, si no, ninguno de los números de abajo se sostiene.

Claude de verdad no es determinista: el mismo prompt ejecutado dos veces puede tomar caminos completamente distintos[^S2]. Eso es bueno para producción y desastroso para lecciones de demostración — corres hoy y sacas 3/5, mañana 4/5, y no puedes decir si la diferencia viene del cambio de prompt o del humor del modelo. Así que las lecciones prácticas de los cursos 8 y 9 usan todas el mismo método: **cambia el modelo por un stub que devuelve respuestas prefijadas en una cola fija**, para volver el comportamiento probado una variable controlada. Esto verifica la lógica de control que escribiste, no el desempeño del modelo ese día.

```javascript
function stubClient(script, label) {
  if (!script) throw new Error(`[stub] No hay cola de respuestas para ${label}`);
  let cursor = 0;
  return {
    messages: {
      async create() {
        if (cursor >= script.length) {
          throw new Error(`[stub] cola de respuestas de ${label} agotada (${cursor} solicitudes emitidas)`);
        }
        const res = script[cursor++];
        await sleep(res.latency_ms);
        return res;
      },
    },
  };
}
```

Cuando la cola se agota lanza un error, sin respuesta de reserva — si el bucle da una vuelta de más lo ves de inmediato: `Error: [stub] cola de respuestas de v1/t2-pending agotada (1 solicitudes emitidas)` (ese es el texto de error real después de que borré la última respuesta de la cola de t2), y no un `end_turn` falso colándose. Cada respuesta carga su propio `latency_ms`; el stub duerme realmente ese tiempo, así que la columna «Duración» mide cuántos turnos tomó el bucle. Cada tarea recibe un cliente fresco con su propio script; los cursores no se cruzan entre tareas.

**La diferencia entre las dos versiones del prompt está fijada en las dos colas de respuestas del stub.** En un escenario real cambias el prompt del sistema y el comportamiento del modelo lo sigue; acá no tengo modelo, así que preescribí `SCRIPT_V1` y `SCRIPT_V2`, dejando que v2 devuelva respuestas distintas en dos tareas — «supongamos que el prompt v2 hace efecto y el modelo responde así» queda codificado como datos:

```javascript
// v2 solo cambia las respuestas de dos tareas — la diferencia entre versiones está fijada aquí
const SCRIPT_V2 = {
  ...SCRIPT_V1,
  "t3-no-orderid": [
    finish("¿A cuál pedido te refieres? Mándame el ID de pedido (formato SO-1001).", [455, 32]),
  ],
  "t4-refund-note": [/* versión con el tiempo de acreditación agregado */],
};
```

Usa la sintaxis de propagación para heredar de v1 y lista solo las entradas que cambian — quien lea el código ve de un vistazo el alcance de la diferencia. Este circuito **se verifica a sí mismo**: si los verificadores califican bien, si las métricas se registran con exactitud, si los reportes calculan correcto, si dos ejecuciones se pueden comparar. Cuando cambies a un cliente real, el circuito no cambia — solo los números empiezan a saltar.

## Pieza tres: el conjunto de evaluación — cuatro normales más un caso límite

La lección 5 dijo que los conjuntos de evaluación deberían corresponder a la distribución real y cubrir casos límite[^S5]; lo oficial también advirtió contra los entornos sandbox demasiado simplistas que no ponen las herramientas bajo suficiente complejidad[^S3]. Acá solo entran cinco tareas por espacio, pero la estructura sigue la de los conjuntos de evaluación reales:

| Tarea | Qué prueba | Calificación |
| --- | --- | --- |
| `t1-total` | Agregación de varios pasos: buscar la lista y después traer el monto de cada uno | Determinista |
| `t2-pending` | Filtrado de conjunto: los IDs de pedido deberían ser exactamente estos, ni más ni menos | Determinista |
| `t3-no-orderid` | **Caso límite**: el usuario no dio el ID de pedido | Determinista |
| `t4-refund-note` | Texto de forma libre: aviso de reembolso al cliente | Juez LLM |
| `t5-missing-order` | Tras un error de herramienta, reportar con honestidad, no fabricar datos | Determinista |

`t3-no-orderid` merece mención especial. El prompt es «Ayúdame a revisar el estado de ese pedido» — ¿cuál? No lo especifica. El comportamiento ideal es pedir el ID de pedido en vez de adivinar uno para consultarlo. La documentación oficial es cuidadosa con este comportamiento: si el prompt del usuario no provee suficiente información para llenar todos los parámetros requeridos, Claude Opus tiene muchas más probabilidades de reconocer el parámetro faltante y pedirlo, pero ese comportamiento no está garantizado, especialmente para prompts más ambiguos y modelos menos capaces[^S6]. **Los comportamientos «no garantizados» son exactamente los que un conjunto de evaluación debería cubrir** — las cosas garantizadas no necesitan prueba.

```javascript
{
  id: "t3-no-orderid",
  grader: "determinista",
  prompt: "Ayúdame a revisar el estado de ese pedido.",
  verify: (r) => ({
    pass: r.toolCalls === 0 && r.answer.includes("?") && r.answer.includes("ID de pedido"),
    note: "Con parámetros incompletos debería llamar cero herramientas y preguntar por el ID de pedido",
  }),
},
```

El `r` que recibe `verify` contiene no solo `answer` sino también `toolCalls`, `toolErrors` y `tokens`, así que el verificador puede revisar «estado final más métricas clave» y no solo texto: `t3` de hecho revisa «llamó cero herramientas», `t5` revisa «reportó exactamente un error y dijo con honestidad que no lo encontró» — el «estado final primero» de la lección 2 se materializa a través de estos campos. `note` es para humanos; cuando una tarea falla, el reporte imprime el criterio junto a la respuesta real del agente.

Si tu tarea de la lección 5 usó el conjunto de campos `{id, prompt, expected, verifier, rubricRef, tags, split}`, mapéalo ahora para evitar confusiones: el `verifier` de la lección 5 acá se llama `grader` y es solo para mostrar — el tipo de calificación real lo determina si esta tarea tiene una función `verify` o `judge: true`. Las afirmaciones declarativas de `expected` acá se escriben directamente dentro del cuerpo de la función `verify` (las afirmaciones de cada tarea se ven distintas; escribirlas como funciones es más simple que diseñar un formato universal de afirmaciones). `rubricRef` queda incorporado como `JUDGE_PROMPT`, ya que la suite entera tiene un solo caso de juez. `tags` y `split` se omiten por brevedad; la disciplina del conjunto reservado se repite como siempre en la sección «Alcance». Tu JSON de la lección 5 no quedó obsoleto — es la versión declarativa de este arreglo `TASKS`. Avanzar significa traducir cada afirmación a una función.

## Pieza cuatro: calificación estratificada, primero lo determinista

Los métodos de calificación tienen un orden: la calificación basada en código es la más rápida y la más confiable, escala extremadamente bien pero le falta matiz para juicios complejos; la calificación basada en LLM es rápida y flexible, puede manejar juicios complejos, pero primero prueba que es confiable y después escala; la calificación humana es la más flexible y de mayor calidad pero lenta y cara, evítala si es posible[^S5].

Así que la regla es: **lo que se puede calificar por código nunca va a un juez**. Cuatro de las cinco tareas de acá usan `verify`; solo `t4-refund-note`, ese pedazo de texto de forma libre, va al juez — «¿este párrafo se le puede mandar a un cliente?» no se responde con coincidencia de cadenas. La forma del juez sigue a la lección 4: rúbrica fijada en tres ítems, formato de salida fijado en JSON, primero razonar y después puntuar:

```javascript
const JUDGE_PROMPT = `Eres un calificador. Puntúa esta respuesta de atención al cliente según la rúbrica de abajo, primero razona y después puntúa.
Rúbrica (cada ítem 0 o 1, se promedia para el puntaje total):
- Monto exacto: indica el monto del reembolso y coincide con el monto del pedido
- Tiempo de acreditación: indica cuándo se acredita el reembolso
- Tono apropiado: la redacción sirve para comunicarse directo con el cliente
Emite solo JSON: {"reasoning": "...", "score": 0.0-1.0, "grade": "pass" | "fail"}
score >= 0.8 cuenta como pass.`;
```

Cada punto tiene su fuente: haz que el juez primero razone y después puntúe, y luego descarta el razonamiento — mejora la calidad de la calificación, en especial para tareas que requieren juicios complejos[^S5]; la salida debería ser empírica o específica, no una evaluación puramente cualitativa[^S5]; y «una sola llamada al LLM, un solo prompt, salida de 0.0 a 1.0 más un aprobado/fallido» es la combinación que lo oficial encontró más consistente y más alineada con los juicios humanos después de probar varios esquemas de juez en su sistema multiagente de investigación[^S2].

El juez acá también es un stub: la respuesta de v1 no tiene el tiempo de acreditación, dos de tres ítems dan 0.67 y se califica fallido; v2 lo agregó, los tres aciertan y dan 1.00, calificado aprobado. La puntuación es autoconsistente con la rúbrica — tres ítems binarios promediados solo pueden caer en 0, 0.33, 0.67 o 1.00; una puntuación de 0.85 significaría que el juez no siguió la aritmética de la rúbrica. El juez mismo quema tokens; su consumo se suma a los tokens de esa tarea, y por eso `t4` llama una sola herramienta pero sus tokens no son bajos.

Una disciplina más de la lección 4: el modelo que trabajó no debería calificarse a sí mismo. Lo oficial dice que hagas que una instancia fresca del modelo intente refutar el resultado — el que hace el trabajo no es el que lo califica[^S4]. En código: el juez usa su propio cliente, su propio prompt del sistema, su propio arreglo de messages, solo ve el prompt de la tarea y la respuesta a calificar, y no ve la transcripción de llamadas a herramientas del agente.

## Pieza cinco: bucle y reporte

El bucle es el bucle del curso 7 textual, con el esqueleto sin cambios — solo se agregaron el `model` y el `max_tokens` que la API real exige (el stub los ignora), y después se envolvió con contadores:

```javascript
let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content, metrics);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
  metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
}
```

`messages` es una variable local dentro de `runTask`; la función retorna y desaparece. Esa es la implementación entera de «las tareas no comparten contexto» — no hace falta ningún mecanismo extra, basta con no sacarla de ahí.

Para las métricas, la lista de verificación oficial es: más allá de la exactitud de alto nivel, recolecta también el tiempo total de ejecución de cada llamada a herramienta y de cada tarea, el número total de llamadas a herramientas, el consumo total de tokens y los errores de herramienta[^S3]. Las columnas de la tabla del reporte siguen exactamente esa lista. La tasa de aprobación solo te dice «si aprobó», estas columnas te dicen «cómo aprobó» — una tarea que aprueba llamando doce herramientas y una que aprueba con dos llamadas son dos niveles de calidad distintos. Estas columnas también se autodocumentan: muchas llamadas a herramientas redundantes normalmente sugieren que los parámetros de paginación o de límite de tokens necesitan ajuste; muchos errores de herramienta por parámetros inválidos normalmente sugieren que las descripciones de herramientas podrían ser más claras o necesitan mejores ejemplos[^S3]. Los ejercicios van a usar esto directamente.

Que el reporte sea legible para humanos tiene valor intrínseco. La sugerencia oficial es: haz que Claude muestre evidencia en vez de afirmaciones de éxito — la salida de las pruebas, el comando que ejecutó y lo que devolvió, o una captura de pantalla del resultado; revisar evidencia es más rápido que volver a ejecutar la verificación tú mismo, y funciona para sesiones que no estuviste mirando[^S4]. Esta tabla del reporte es esa evidencia — pégala en la descripción de un PR o mándasela a un colega, y puede juzgar sin volver a ejecutar nada. (El único detalle al imprimir es que los caracteres CJK de ancho completo cuentan como ancho 2 y un `padEnd` crudo desalinea — el código tiene un `pad` consciente del ancho.)

```agentmentor-check
{
  "id": "vq-zh-06-shared-session",
  "label": "Todas las tareas de evaluación comparten una sola sesión larga: ¿funciona?",
  "prompt": "Un colega miró eval-runner.mjs y sugirió una optimización: ahora mismo cada tarea crea un arreglo messages nuevo y ejecuta un bucle independiente — un desperdicio. ¿Por qué no hacer que las cinco tareas compartan una sola sesión larga y se ejecuten en secuencia? Da dos razones: los datos de pedidos ya consultados se pueden reutilizar después (ahorra tokens), y el modelo se «calienta», así que las tareas posteriores obtienen mejores respuestas. ¿Cuál es el problema de fondo de esta propuesta?",
  "whyHere": "En la estructura de este circuito, lo que más probablemente se «optimice» hasta desaparecer es el aislamiento entre tareas. Parece trabajo duplicado, pero en realidad es la precondición para poder comparar resultados.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "El problema es que de fondo no ahorra tokens: con una sesión compartida cada solicitud reenvía los messages de todas las tareas anteriores, y los tokens de entrada suben linealmente.",
      "correct": false,
      "feedback": "Esta media oración es correcta — las sesiones largas compartidas sí acumulan tokens de entrada, y la cuenta del ahorro no cierra. Pero eso solo invalida la razón dada, no vuelve inutilizable el enfoque en sí. Aunque de verdad ahorrara tokens, las puntuaciones que salen de correrlo así siguen sin servir. Ver la opción c."
    },
    {
      "id": "b",
      "text": "El problema es que las métricas no se pueden separar por tarea: con una sesión compartida, las llamadas a herramientas, la duración y los tokens se mezclan, y no se puede llenar la tabla del reporte.",
      "correct": false,
      "feedback": "Separar las métricas es más difícil, cierto, pero eso es un problema contable: marca los límites en el borde de cada tarea, reinicia los contadores, y separarlas y contarlas sigue siendo factible. Lo que se resuelve por medios de ingeniería no es la causa raíz. La causa raíz está en c."
    },
    {
      "id": "c",
      "text": "El problema es que las tareas se contaminan entre sí: una tarea de evaluación debería ejecutar un bucle independiente; con una sesión compartida, el contexto que deja la tarea anterior se arrastra a la siguiente — el modelo podría usar directamente los datos de pedidos ya consultados en la tarea previa para responder, y la prueba deja de medir la capacidad propia de esta tarea; además, cambiar el orden de las tareas cambia los resultados, y dos ejecuciones dejan de ser comparables.",
      "correct": true,
      "feedback": "Correcto. La guía oficial es «una tarea de evaluación por bucle»; el aislamiento no es desperdicio, es precondición. La contaminación tiene dos capas: una es que cambia lo que estás probando — los datos que trajo la tarea anterior siguen en el contexto, y si la siguiente tarea toca contenido relacionado podría responder directo desde el contexto previo sin llamar herramientas, o dejarse desviar por contexto viejo irrelevante hacia una respuesta equivocada; entonces estás probando «si sabe hojear el contexto previo» y no «si sabe usar herramientas». La otra capa es que las tareas quedan dependientes del orden; cambia el orden o borra una tarea del medio, y las puntuaciones de las tareas restantes se corren todas, con lo que el circuito pierde su único propósito: hacer comparables dos ejecuciones."
    }
  ]
}
```

## El `eval-runner.mjs` completo

Cópialo y guárdalo como `eval-runner.mjs`; `node eval-runner.mjs` lo ejecuta directo. Sin dependencias, sin `package.json`, Node 18+ (usa `await` de nivel superior, así que la extensión debe ser `.mjs`).

```javascript
// eval-runner.mjs — circuito de evaluación con un bucle de arnés por tarea
//
// Uso:
//   node eval-runner.mjs                  usa el verificador corregido (normalizado)
//   node eval-runner.mjs --strict-verify  usa el verificador antiguo sin normalizar, para ver los falsos negativos

const STRICT = process.argv.includes("--strict-verify");
const MODEL = "claude-opus-5"; // el stub lo ignora; al cambiar a un cliente real, model y max_tokens son parámetros requeridos

// ============ 1. Sistema bajo prueba: herramientas y datos ============

const ORDERS = {
  "SO-1001": { customer: "Qiming Tech", status: "complete", month: "2026-08", amount: 780.0 },
  "SO-1002": { customer: "Qiming Tech", status: "complete", month: "2026-08", amount: 500.0 },
  "SO-1003": { customer: "Qiming Tech", status: "pending", month: "2026-08", amount: 320.0 },
  "SO-1004": { customer: "Yuanshan Logistics", status: "pending", month: "2026-08", amount: 96.5 },
};

const TOOLS = [
  {
    name: "search_orders",
    description: "Busca pedidos por nombre de cliente o estado del pedido, devuelve una lista de IDs de pedido. Debe proporcionarse al menos uno de customer o status.",
    input_schema: {
      type: "object",
      properties: { customer: { type: "string" }, status: { type: "string" } },
    },
  },
  {
    name: "get_order",
    description: "Consulta el cliente, el estado y el monto de un solo pedido por su ID de pedido.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
    },
  },
];

const TOOL_IMPL = {
  search_orders({ customer, status }) {
    if (!customer && !status) {
      throw new Error("Parámetros inválidos: debe proporcionarse al menos uno de customer o status");
    }
    const ids = Object.keys(ORDERS).filter(
      (id) =>
        (!customer || ORDERS[id].customer === customer) &&
        (!status || ORDERS[id].status === status)
    );
    return { order_ids: ids };
  },
  get_order({ order_id }) {
    const o = ORDERS[order_id];
    if (!o) throw new Error(`El pedido ${order_id} no existe`);
    return { order_id, ...o };
  },
};

// ============ 2. Cliente stub: cola de respuestas fija ============

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (s) => ({ type: "text", text: s });
const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });
const useTools = (blocks, [i, o]) => ({
  stop_reason: "tool_use",
  content: blocks,
  usage: { input_tokens: i, output_tokens: o },
  latency_ms: 40,
});
const finish = (s, [i, o]) => ({
  stop_reason: "end_turn",
  content: [text(s)],
  usage: { input_tokens: i, output_tokens: o },
  latency_ms: 40,
});

function stubClient(script, label) {
  if (!script) throw new Error(`[stub] No hay cola de respuestas para ${label}`);
  let cursor = 0;
  return {
    messages: {
      async create() {
        if (cursor >= script.length) {
          throw new Error(`[stub] cola de respuestas de ${label} agotada (${cursor} solicitudes emitidas)`);
        }
        const res = script[cursor++];
        await sleep(res.latency_ms);
        return res;
      },
    },
  };
}

// ============ 3. Dos prompts de sistema y sus colas de respuestas ============

const SYSTEM_PROMPTS = {
  v1: "Eres un asistente de pedidos. Usa las herramientas para consultar pedidos y después responde al usuario.",
  v2:
    "Eres un asistente de pedidos. Usa las herramientas para consultar pedidos y después responde al usuario.\n" +
    "Dos reglas duras:\n" +
    "1. Cuando el usuario no haya dado el ID de pedido, pide primero el ID de pedido, no adivines uno para consultarlo.\n" +
    "2. Los avisos de reembolso a clientes deben indicar el monto del reembolso y el tiempo de acreditación.",
};

const SCRIPT_V1 = {
  "t1-total": [
    useTools([toolUse("tu_1", "search_orders", { customer: "Qiming Tech", status: "complete" })], [420, 60]),
    useTools(
      [
        toolUse("tu_2", "get_order", { order_id: "SO-1001" }),
        toolUse("tu_3", "get_order", { order_id: "SO-1002" }),
      ],
      [520, 88]
    ),
    finish("El cliente Qiming Tech tiene 2 pedidos completados en agosto de 2026 (SO-1001, SO-1002), por un total de ¥1,280.00.", [660, 52]),
  ],
  "t2-pending": [
    useTools([toolUse("tu_1", "search_orders", { status: "pending" })], [415, 46]),
    finish("Los pedidos pendientes actualmente son SO-1003 y SO-1004.", [500, 34]),
  ],
  "t3-no-orderid": [
    useTools([toolUse("tu_1", "search_orders", {})], [408, 38]),
    useTools([toolUse("tu_2", "get_order", { order_id: "SO-1001" })], [470, 44]),
    finish("El estado del pedido SO-1001 es completado.", [560, 30]),
  ],
  "t4-refund-note": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-1003" })], [430, 42]),
    finish(
      "Hola, recibimos la cancelación del pedido SO-1003 (monto ¥320.00), el reembolso se devolverá al método de pago original. Lamentamos las molestias.",
      [540, 76]
    ),
  ],
  "t5-missing-order": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-9999" })], [412, 40]),
    finish("El sistema no encontró el pedido SO-9999, confirma que el ID de pedido sea correcto.", [478, 36]),
  ],
};

// v2 solo cambia las respuestas de dos tareas — la diferencia entre versiones está fijada aquí
const SCRIPT_V2 = {
  ...SCRIPT_V1,
  "t3-no-orderid": [
    finish("¿A cuál pedido te refieres? Mándame el ID de pedido (formato SO-1001).", [455, 32]),
  ],
  "t4-refund-note": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-1003" })], [462, 42]),
    finish(
      "Hola, recibimos la solicitud de cancelación del pedido SO-1003 (monto ¥320.00), el reembolso se devolverá al método de pago original y suele acreditarse en 3-5 días hábiles. Lamentamos las molestias.",
      [572, 94]
    ),
  ],
};

const SCRIPTS = { v1: SCRIPT_V1, v2: SCRIPT_V2 };

// ============ 4. Juez: también un stub, emite 0.0-1.0 más aprobado/fallido ============

const JUDGE_PROMPT = `Eres un calificador. Puntúa esta respuesta de atención al cliente según la rúbrica de abajo, primero razona y después puntúa.
Rúbrica (cada ítem 0 o 1, se promedia para el puntaje total):
- Monto exacto: indica el monto del reembolso y coincide con el monto del pedido
- Tiempo de acreditación: indica cuándo se acredita el reembolso
- Tono apropiado: la redacción sirve para comunicarse directo con el cliente
Emite solo JSON: {"reasoning": "...", "score": 0.0-1.0, "grade": "pass" | "fail"}
score >= 0.8 cuenta como pass.`;

const JUDGE_SCRIPTS = {
  v1: {
    "t4-refund-note": [
      finish(
        JSON.stringify({
          reasoning: "El monto coincide con el pedido y el tono es apropiado; pero falta el tiempo de acreditación del reembolso, el cliente se queda sin expectativa, falta 1 de 3 ítems.",
          score: 0.67,
          grade: "fail",
        }),
        [286, 58]
      ),
    ],
  },
  v2: {
    "t4-refund-note": [
      finish(
        JSON.stringify({
          reasoning: "Monto, tiempo de acreditación y tono, los tres ítems satisfechos, se puede enviar directo al cliente.",
          score: 1.0,
          grade: "pass",
        }),
        [302, 46]
      ),
    ],
  },
};

async function judgeAnswer(task, answer, version, metrics) {
  const client = stubClient(JUDGE_SCRIPTS[version][task.id], `judge/${version}/${task.id}`);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: JUDGE_PROMPT,
    messages: [{ role: "user", content: `【Tarea】${task.prompt}\n【Respuesta a calificar】${answer}` }],
  });
  metrics.tokens += res.usage.input_tokens + res.usage.output_tokens;
  const verdict = JSON.parse(res.content.map((b) => b.text).join(""));
  return { pass: verdict.grade === "pass", score: verdict.score, note: verdict.reasoning };
}

// ============ 5. Conjunto de evaluación: 4 normales + 1 caso límite ============

function amountsIn(s) {
  return [...s.replace(/[,，\s¥￥]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
function orderIdsIn(s) {
  return [...new Set(s.match(/SO-\d+/g) ?? [])].sort();
}

const TASKS = [
  {
    id: "t1-total",
    grader: "determinista",
    prompt: "Los pedidos completados del cliente Qiming Tech en agosto de 2026, ¿cuál es el monto total?",
    verify: (r) => ({
      pass: amountsIn(r.answer).some((n) => Math.abs(n - 1280) < 0.005),
      note: "La respuesta debe contener 1280 (se permite símbolo de moneda, separador de miles, unidad)",
    }),
    strictVerify: (r) => ({
      pass: r.answer.includes("1280.00"),
      note: "La respuesta debe contener la cadena literal 1280.00",
    }),
  },
  {
    id: "t2-pending",
    grader: "determinista",
    prompt: "¿Qué pedidos siguen sin enviarse? Enumera los IDs de pedido.",
    verify: (r) => ({
      pass: JSON.stringify(orderIdsIn(r.answer)) === JSON.stringify(["SO-1003", "SO-1004"]),
      note: "El conjunto de IDs de pedido de la respuesta debe ser exactamente SO-1003 + SO-1004",
    }),
  },
  {
    id: "t3-no-orderid",
    grader: "determinista",
    prompt: "Ayúdame a revisar el estado de ese pedido.",
    verify: (r) => ({
      pass: r.toolCalls === 0 && r.answer.includes("?") && r.answer.includes("ID de pedido"),
      note: "Con parámetros incompletos debería llamar cero herramientas y preguntar por el ID de pedido",
    }),
  },
  {
    id: "t4-refund-note",
    grader: "juez LLM",
    judge: true,
    prompt: "El cliente solicita cancelar y que le reembolsen el pedido SO-1003, escríbele una respuesta.",
  },
  {
    id: "t5-missing-order",
    grader: "determinista",
    prompt: "Revisa el estado del pedido SO-9999.",
    verify: (r) => ({
      pass: r.toolErrors === 1 && /no encontr|no existe|inexistente/.test(r.answer) && !/[¥￥]|yuan|dólar/.test(r.answer),
      note: "Tras el error de herramienta debe decir con honestidad que no lo encontró, sin fabricar un monto",
    }),
  },
];

// ============ 6. Una tarea, un bucle de arnés ============

async function runToolUses(content, metrics) {
  const results = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    metrics.toolCalls += 1;
    try {
      const out = TOOL_IMPL[block.name](block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
    } catch (err) {
      metrics.toolErrors += 1;
      results.push({ type: "tool_result", tool_use_id: block.id, content: err.message, is_error: true });
    }
  }
  return results;
}

async function runTask(task, version) {
  const metrics = { toolCalls: 0, toolErrors: 0, tokens: 0 };
  const client = stubClient(SCRIPTS[version][task.id], `${version}/${task.id}`);
  const system = SYSTEM_PROMPTS[version];
  const messages = [{ role: "user", content: task.prompt }];
  const startedAt = Date.now();

  let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
  metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, metrics);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
    metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
  }

  const answer = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let verdict;
  if (task.judge) {
    verdict = await judgeAnswer(task, answer, version, metrics);
  } else {
    const fn = STRICT && task.strictVerify ? task.strictVerify : task.verify;
    const out = fn({ answer, ...metrics });
    verdict = { pass: out.pass, score: out.pass ? 1 : 0, note: out.note };
  }

  return {
    id: task.id,
    grader: task.grader,
    pass: verdict.pass,
    score: verdict.score,
    note: verdict.note,
    answer,
    durationMs: Date.now() - startedAt,
    ...metrics,
  };
}

async function runSuite(version) {
  const rows = [];
  for (const task of TASKS) rows.push(await runTask(task, version));
  return {
    version,
    verifier: STRICT ? "estricto (antiguo, sin normalizar)" : "normalizado (corregido)",
    rows,
    passed: rows.filter((r) => r.pass).length,
    total: rows.length,
    toolCalls: rows.reduce((n, r) => n + r.toolCalls, 0),
    toolErrors: rows.reduce((n, r) => n + r.toolErrors, 0),
    tokens: rows.reduce((n, r) => n + r.tokens, 0),
    durationMs: rows.reduce((n, r) => n + r.durationMs, 0),
  };
}

// ============ 7. Reporte ============

const CJK = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, ch) => n + (CJK.test(ch) ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - width(s)));
const padL = (s, n) => " ".repeat(Math.max(0, n - width(s))) + String(s);

function printReport(report) {
  console.log(`\n=== Reporte · Prompt ${report.version} · Verificador ${report.verifier} ===`);
  console.log(
    pad("Tarea", 18) + pad("Calificador", 14) + pad("Resultado", 11) + padL("Puntuación", 12) +
    padL("Llamadas", 10) + padL("Errores", 9) + padL("Tokens", 10) + padL("Duración", 10)
  );
  console.log("-".repeat(94));
  for (const r of report.rows) {
    console.log(
      pad(r.id, 18) + pad(r.grader, 14) + pad(r.pass ? "pass" : "FAIL", 11) +
      padL(r.score.toFixed(2), 12) + padL(r.toolCalls, 10) + padL(r.toolErrors, 9) +
      padL(r.tokens.toLocaleString("en-US"), 10) + padL(`${r.durationMs}ms`, 10)
    );
  }
  console.log("-".repeat(94));
  const rate = ((report.passed / report.total) * 100).toFixed(0);
  console.log(
    `Tasa de aprobación ${report.passed}/${report.total} (${rate}%) · Llamadas a herramientas ${report.toolCalls} · ` +
    `Errores de herramienta ${report.toolErrors} · Tokens ${report.tokens.toLocaleString("en-US")} · Total ${report.durationMs}ms`
  );
  const failed = report.rows.filter((r) => !r.pass);
  if (failed.length) {
    console.log("\nCasos fallidos:");
    for (const r of failed) {
      console.log(`  [${r.id}] Criterio: ${r.note}`);
      console.log(`  Respuesta del agente: ${r.answer}`);
    }
  }
}

function printDiff(a, b) {
  console.log(`\n=== Cambio de puntuación ${a.version} -> ${b.version} ===`);
  console.log(pad("Tarea", 18) + padL(a.version, 7) + padL(b.version, 7) + "  Cambio");
  console.log("-".repeat(50));
  for (let i = 0; i < a.rows.length; i++) {
    const x = a.rows[i], y = b.rows[i];
    let mark = "sin cambio";
    if (!x.pass && y.pass) mark = "fail => pass";
    else if (x.pass && !y.pass) mark = "pass => FAIL";
    else if (y.score !== x.score) mark = `puntuación ${(y.score - x.score).toFixed(2)}`;
    console.log(pad(x.id, 18) + padL(x.score.toFixed(2), 7) + padL(y.score.toFixed(2), 7) + "  " + mark);
  }
  console.log("-".repeat(50));
  console.log(`Tasa de aprobación ${a.passed}/${a.total} -> ${b.passed}/${b.total}`);
}

// ============ 8. Punto de entrada ============

const reportV1 = await runSuite("v1");
printReport(reportV1);
const reportV2 = await runSuite("v2");
printReport(reportV2);
printDiff(reportV1, reportV2);
```

## Recuperando la trampa de la lección 3: verificadores demasiado estrictos

La lección 3 cubrió una trampa, en las palabras exactas de lo oficial: evita los verificadores demasiado estrictos que rechazan respuestas correctas por diferencias espurias como el formato, la puntuación o formulaciones alternativas válidas[^S3]. Suena de sentido común pero es casi inevitable en código, porque los verificadores demasiado estrictos son los más fáciles de escribir.

El circuito tiene uno incrustado. `t1-total` tiene dos versiones de verificador; la antigua es `pass: r.answer.includes("1280.00")` — parece a prueba de balas: la respuesta correcta es 1280.00, así que revisa si la respuesta contiene esa cadena. Ejecuta `node eval-runner.mjs --strict-verify` (abajo se pega solo el reporte de v1; el reporte de v2 y la tabla de diferencias se imprimen como siempre):

```text
=== Reporte · Prompt v1 · Verificador estricto (antiguo, sin normalizar) ===
Tarea             Calificador   Resultado    Puntuación  Llamadas  Errores    Tokens  Duración
----------------------------------------------------------------------------------------------
t1-total          determinista  FAIL               0.00         3        0     1,800     123ms
t2-pending        determinista  pass               1.00         1        0       995      82ms
t3-no-orderid     determinista  FAIL               0.00         2        1     1,550     124ms
t4-refund-note    juez LLM      FAIL               0.67         1        0     1,432     122ms
t5-missing-order  determinista  pass               1.00         1        1       966      83ms
----------------------------------------------------------------------------------------------
Tasa de aprobación 2/5 (40%) · Llamadas a herramientas 8 · Errores de herramienta 2 · Tokens 6,743 · Total 534ms

Casos fallidos:
  [t1-total] Criterio: La respuesta debe contener la cadena literal 1280.00
  Respuesta del agente: El cliente Qiming Tech tiene 2 pedidos completados en agosto de 2026 (SO-1001, SO-1002), por un total de ¥1,280.00.
  [t3-no-orderid] Criterio: Con parámetros incompletos debería llamar cero herramientas y preguntar por el ID de pedido
  Respuesta del agente: El estado del pedido SO-1001 es completado.
  [t4-refund-note] Criterio: El monto coincide con el pedido y el tono es apropiado; pero falta el tiempo de acreditación del reembolso, el cliente se queda sin expectativa, falta 1 de 3 ítems.
  Respuesta del agente: Hola, recibimos la cancelación del pedido SO-1003 (monto ¥320.00), el reembolso se devolverá al método de pago original. Lamentamos las molestias.
```

Esto también sale de una ejecución real. Mira el detalle de `t1-total`: el agente respondió «por un total de ¥1,280.00» — monto correcto, pedidos correctos, redacción normal. Su único crimen es poner una coma como separador de miles entre el 1 y el 280, así que `includes("1280.00")` devuelve false y una respuesta completamente correcta se califica fallida.

**En este punto arregla el verificador, no el agente.** Los reportes solo te dicen «t1 fallido», no te dicen de quién es la culpa; la forma de saberlo es leer las palabras reales del agente en el detalle — y para eso exactamente es que los reportes imprimen la respuesta cruda. El arreglo es la normalización. La descripción oficial de la coincidencia exacta ya incluye este paso: las evaluaciones por coincidencia exacta miden si la salida del modelo coincide con una respuesta correcta predefinida, típicamente después de normalizar los espacios en blanco y las mayúsculas[^S5]. Los escenarios con montos necesitan más lavado — símbolos de moneda, separadores de miles, unidades — así que el verificador corregido lava primero el ruido, extrae los números y después compara numéricamente:

```javascript
function amountsIn(s) {
  return [...s.replace(/[,，\s¥￥]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
verify: (r) => ({
  pass: amountsIn(r.answer).some((n) => Math.abs(n - 1280) < 0.005),
  note: "La respuesta debe contener 1280 (se permite símbolo de moneda, separador de miles, unidad)",
}),
```

Quita `--strict-verify` y ejecuta otra vez; `t1-total` pasa de 0.00 a 1.00, y la línea base de v1 sube de 2/5 de vuelta a 3/5 — y entre medio, el agente no cambió ni un carácter, y la cola de respuestas del stub tampoco cambió ni un carácter. **La puntuación cambió pero el sistema bajo prueba no — esa es la prueba de fuego del «problema del verificador».**

Un comentario al margen sobre el alcance: normalizar no es «cuanto más flojo mejor». Afloja hasta «si parece contener 1280, aprueba», y el agente que responde «total de 1280 pedidos, monto desconocido» también aprueba. Los verificadores deberían pararse en «deja pasar las diferencias irrelevantes, bloquea los errores sustantivos» — y el único método para encontrar esa posición es probar con respuestas reales.

## Cambia un solo lugar del prompt y mira moverse la puntuación

Circuito calibrado, listo para trabajo real. Cambié un solo lugar — el prompt del sistema, agregándole dos reglas después de v1:

```javascript
const SYSTEM_PROMPTS = {
  v1: "Eres un asistente de pedidos. Usa las herramientas para consultar pedidos y después responde al usuario.",
  v2:
    "Eres un asistente de pedidos. Usa las herramientas para consultar pedidos y después responde al usuario.\n" +
    "Dos reglas duras:\n" +
    "1. Cuando el usuario no haya dado el ID de pedido, pide primero el ID de pedido, no adivines uno para consultarlo.\n" +
    "2. Los avisos de reembolso a clientes deben indicar el monto del reembolso y el tiempo de acreditación.",
};
```

Esas dos no son inventadas; salen de leer los «Casos fallidos» del reporte de v1: `t3` falla porque adivinó un ID de pedido con parámetros incompletos, `t4` recibió descuento por faltarle el tiempo de acreditación. **El reporte dice qué, tú cambias eso** — esa es la diferencia más concreta entre tener circuito y no tenerlo. Sin circuito, después de cambiar el prompt puedes echarle un ojo a la salida y sentir que «parece mejor»; con circuito, «cuál mejoró, cuál se quedó igual, algo retrocedió» son tres líneas de números.

Vuelve a ejecutar: la tabla de diferencias es el último segmento de la salida del comienzo — tasa de aprobación de 60% a 100%, dos tareas pasan de fallido a aprobado, las otras tres no se mueven. Esa última media oración importa tanto como la primera: dice que este cambio no rompió lo que ya funcionaba. Sin circuito, después de cambiar el prompt solo miras la salida una vez y piensas «se ve mejor»; con circuito, «cuál mejoró / cuál igual / algo retrocedió» son tres filas de números.

La formulación oficial para esto es: con evaluaciones puedes medir con mucha más confianza el impacto de tu ingeniería de prompts; incluso refinamientos pequeños a las descripciones de herramientas pueden rendir mejoras dramáticas[^S3]. Acá también hay una ganga para agarrar: en el desarrollo temprano de agentes los cambios tienden a tener un impacto dramático porque todavía abunda la fruta al alcance de la mano — un retoque del prompt podría subir la tasa de éxito de 30% a 80%; con tamaños de efecto así de grandes puedes detectar los cambios con apenas unos pocos casos de prueba[^S2]. Ahora tienes solo cinco tareas — eso no es un déficit, es el punto de partida.

Mira otra vez las columnas de métricas: las llamadas a herramientas de v2 bajaron de 8 a 6, los errores de herramienta de 2 a 1, y los tokens bajaron casi mil, porque `t3` ya no adivina a ciegas para llamar herramientas. **El mismo cambio mejoró simultáneamente la exactitud y el costo** — este tipo de cosa solo se vuelve visible cuando registras estas columnas juntas.

## Alcance: qué administra este circuito y qué no

**Qué administra**: un agente, un lote de tareas, una ejecución en tu máquina, un reporte legible para humanos.

**Cambiar a un modelo real** — la estructura del circuito no cambia. Reemplaza `stubClient(...)` por el cliente real de `@anthropic-ai/sdk`; el bucle `while` de `runTask` no cambia ni una línea — ya está escrito con la forma de `stop_reason` / `tool_use` / `tool_result` de la API real; los parámetros requeridos `model` y `max_tokens` ya están ahí (el stub los ignora, el cliente real los usa). Después del cambio dos cosas se mueven: las puntuaciones van a temblar porque los agentes no son deterministas entre ejecuciones ni siquiera con prompts idénticos[^S2], así que no leas de más una sola ejecución; y ejecutar una ronda cuesta dinero y tiempo, con cinco tareas da igual, pero con doscientas ya conviene pensar en concurrencia y costo.

**Qué no administra**: enganchar las evaluaciones a CI, ejecutarlas en cada commit, compararlas contra versiones históricas, bloquear merges cuando las puntuaciones bajan de cierto umbral — todas son prácticas de ingeniería comunes y sí funcionan bien, pero esta lección no las desarrolla. El Nivel 2 de los ejercicios te va a llevar por «comparar dos reportes», y el resto de la orquestación es trabajo de tu CI.

Una disciplina más de la lección 5 para repetir: **no ajustes contra el conjunto reservado**. Sigues los reportes para cambiar prompts; después de varias rondas las puntuaciones definitivamente van a subir, pero la subida podría ser solo «puntuaciones en estas cinco tareas». La práctica oficial es apoyarse en conjuntos de prueba reservados para asegurar que no hay sobreajuste a las evaluaciones «de entrenamiento»[^S3]. Así que en un montaje real las tareas deberían dividirse en dos pilas: una se ejecuta a diario para orientarte, la otra queda bajo llave y solo se abre cuando piensas «esta versión debería funcionar» — las puntuaciones de la primera pila son navegación, las de la segunda son veredicto.

Último recordatorio viejo: las evaluaciones automáticas se van a perder cosas. Los evaluadores humanos siempre dan con casos límite que las evaluaciones no ven — alucinaciones ante consultas inusuales, fallos sistémicos, sesgos sutiles de selección de fuentes[^S2]. Que el circuito se ejecute sin problemas no significa que dejes de usarlo tú mismo.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Leer reportes, sin apurarse a cambiar código

Sin código. Vuelve a los dos reportes del comienzo de la lección (línea base v1 y v2 posterior al cambio), cuyas líneas de resumen son:

```text
v1: Tasa de aprobación 3/5 (60%)  · Llamadas a herramientas 8 · Errores de herramienta 2 · Tokens 6,743
v2: Tasa de aprobación 5/5 (100%) · Llamadas a herramientas 6 · Errores de herramienta 1 · Tokens 5,766
```

Contra las dos tablas completas responde tres preguntas, de tres a cinco oraciones cada una:

1. `t1-total` aprueba en ambos reportes pero tiene la cuenta de llamadas a herramientas más alta, 3. ¿Qué problema indica esto? ¿Qué debería cambiarse?
2. v1 tiene 2 errores de herramienta, v2 tiene 1. ¿Son estos dos errores la misma clase de problema? ¿Qué significa cada uno, debería arreglarse cada uno?
3. La lección tiene un tercer reporte (el de `--strict-verify`) donde `t1-total` da 0.00. La misma tarea, un reporte 0.00 y otro 1.00 — ¿cómo distingues que esta diferencia de puntuación es problema del verificador y no del agente?

<!-- rubric -->

- La pregunta 1 debe señalar como causa-efecto que «`search_orders` solo devuelve IDs de pedido sin montos, así que cada pedido necesita otra llamada a `get_order`», notar que si escala la cantidad de pedidos escala la cantidad de llamadas, y según la lectura de S3 identificar las llamadas redundantes como señal de que «los parámetros de paginación / volumen de retorno necesitan ajuste»; el objetivo a cambiar debe caer sobre la **herramienta** (hacer que `search_orders` cargue campos de resumen), no sobre el prompt ni sobre el agente.
- La pregunta 2 debe distinguir la naturaleza de los dos errores: el de `t3` es un error de **parámetro inválido** (`search_orders({})`), que según la lectura de S3 apunta a una descripción de herramienta poco clara o sin ejemplos, y debería arreglarse; el de `t5` es que el pedido en sí no existe, que es lo que esta tarea prueba **a propósito**, así que la aparición del error es lo esperado. La respuesta debe declarar explícitamente que «la cuenta de errores de herramienta no es cuanto más baja mejor».
- La pregunta 3 debe dar un criterio operativo: en ambos reportes el texto de respuesta del agente, la cuenta de llamadas y los tokens son idénticos, y solo cambió el verificador, así que el cambio viene del lado de la calificación; y declarar que la base del juicio es leer las palabras reales del agente en el detalle, confirmando que la respuesta es sustantivamente correcta (1,280.00 frente a 1280.00 solo difieren en el separador de miles).
- Las tres preguntas no requieren código; haber escrito código pero no haber respondido los juicios de arriba no cuenta como aprobado.

<!-- hint -->

Para la pregunta 1 no te quedes mirando «3 son muchas», mira qué devuelve `search_orders`. Devuelve `{ order_ids: [...] }` — solo IDs de pedido. El agente quiere el monto; además de llamar `get_order` uno por uno, ¿hay otra manera?

<!-- hint -->

La clave de la pregunta 3 es controlar variables. Compara cada columna de la fila `t1-total` entre ambos reportes: ¿cambiaron la cuenta de llamadas, la de errores, los tokens? Después compara el texto crudo de la respuesta del agente en ambos detalles. La columna que haya cambiado indica de qué lado está el problema.

<!-- answer -->

**Pregunta 1.** `t1-total` necesita 3 llamadas a herramientas por culpa del diseño del valor de retorno de `search_orders`: solo devuelve `{ order_ids: ["SO-1001", "SO-1002"] }`, sin monto alguno, así que el agente que quiera calcular el total tiene que llamar `get_order` de nuevo por cada ID de pedido. La cuenta de llamadas es 1 + N, donde N son los pedidos que acertó — con cuatro pedidos se ve bien, pero cuando un cliente tenga cincuenta pedidos esta sola tarea va a llegar a cincuenta y una llamadas, con tokens y duración escalando linealmente y chocando fácil con los límites de contexto.

La lectura oficial de esta señal es: muchas llamadas a herramientas redundantes normalmente sugieren que los parámetros de paginación o de límite de tokens necesitan ajuste[^S3]. El arreglo concreto es hacer que `search_orders` devuelva directamente campos de resumen (ID de pedido + estado + monto), y después agregar parámetros de paginación para controlar el volumen de cada retorno. **Cambia la herramienta, no el prompt, no el agente.** Esto también explica por qué se deben registrar métricas más allá de la tasa de aprobación — `t1` aprueba en ambos reportes, y mirando solo la tasa de aprobación nunca descubrirías este problema.

**Pregunta 2.** No son la misma clase; la naturaleza de los dos errores es opuesta.

El error de `t3-no-orderid` es que el agente llamó `search_orders({})` sin ID de pedido, con ambos parámetros de filtro vacíos, y la herramienta lo rechazó — este es un error de **parámetro inválido**. La lectura oficial es: cuando estos errores se agrupan, normalmente significa que las descripciones de herramientas podrían ser más claras o necesitan mejores ejemplos[^S3]. Este sí debería arreglarse; v2 agregó «pide primero el ID de pedido» y desapareció. Si no cambias el prompt, otra dirección es endurecer la descripción de la herramienta o agregarle `strict: true` a la definición de la herramienta, para que las restricciones de parámetros tengan efecto en la capa de la API[^S6].

El error de `t5-missing-order` es que se consultó `SO-9999` y la herramienta reporta «el pedido no existe». No es un defecto, es exactamente lo que esta tarea prueba: tras un error de herramienta, ¿el agente dice con honestidad que no lo encontró o fabrica un monto? El verificador de esta tarea escribe `r.toolErrors === 1`, lo que significa que **este error debe ocurrir**; que la cuenta de errores llegue a 0 significaría en realidad que la prueba no dio en el blanco. Así que la columna de errores de herramienta no es cuanto más baja mejor, depende de dónde vienen los errores; mezclar las dos clases y leer «los errores bajaron de 2 a 1, mejoramos» es revolver un arreglo real con un comportamiento esperado dentro de un mismo número.

**Pregunta 3.** El criterio es controlar variables: compara la fila `t1-total` entre ambos reportes columna por columna — llamadas 3 frente a 3, errores 0 frente a 0, tokens 1,800 frente a 1,800, del lado del agente todo sin cambios. Después mira el detalle; el reporte de `--strict-verify` imprime las palabras reales del agente como «…por un total de ¥1,280.00.» — monto bien, pedidos bien, redacción normal. Entre las dos ejecuciones lo único que cambió es esa bandera de línea de comandos, es decir el lado de la calificación, así que la diferencia de puntuación viene enteramente del verificador: la versión antigua hace la comparación literal `includes("1280.00")` y la tumba la coma del separador de miles. Este es exactamente el tipo de error contra el que advirtió lo oficial — no dejes que los verificadores rechacen respuestas correctas por diferencias espurias de formato o puntuación[^S3]. El objetivo del cambio es la función `verify`; cambiar el agente para acomodarse al verificador es colgarle el defecto del circuito al sistema bajo prueba.

Que este juicio se pueda hacer depende de que los reportes impriman la respuesta cruda del agente en el detalle. Si el reporte solo imprimiera aprobado/fallido tendrías que volver a ejecutarlo a mano para ver qué respondió en realidad — para que los reportes funcionen como evidencia tienen que cargar el material de origen[^S4].

---

### Nivel 2: Agregarle al circuito la «comparación de dos ejecuciones»

Escribe código, debe ser ejecutable. Agrégale dos cosas a `eval-runner.mjs`:

1. **Persistencia del reporte**: agrega `writeJsonAtomic(file, obj)`, usando la escritura atómica del curso 9 (escribir primero `.tmp` y después `rename`) para guardar el reporte de una ejecución como JSON. La línea de comandos admite `--version v1 --out reports/v1.json`.
2. **Escribe un `compare.mjs`**: lee dos JSON de reporte, imprime la diferencia de puntuación por tarea (puntuación base, puntuación nueva, delta, estado), imprime al final el cambio de la tasa de aprobación; si alguna tarea pasa de aprobado a fallido, imprime un resumen a stderr y sale con código distinto de cero.

Ejecuta estos cuatro comandos y pega la salida:

```text
node eval-runner.mjs --version v1 --out reports/v1.json
node eval-runner.mjs --version v2 --out reports/v2.json
node compare.mjs reports/v1.json reports/v2.json   # debería salir con 0
node compare.mjs reports/v2.json reports/v1.json   # debería salir con 1
```

(Invertir el orden de los parámetros simula «la versión nueva es peor que la línea base», verificando que la ruta de salida distinta de cero de verdad funciona.)

<!-- rubric -->

- `writeJsonAtomic` debe ser en dos pasos, «escribir archivo temporal + `fs.renameSync`»; no puede hacer directamente `fs.writeFileSync(file, ...)` y darlo por hecho; debe crear el directorio automáticamente (`fs.mkdirSync(..., { recursive: true })`).
- El JSON persistido debe ser consumible por un `compare.mjs` independiente: como mínimo incluir `version`, `passed`, `total` y un arreglo `rows`, con `id`, `pass` y `score` en cada fila. **No escribas `durationMs`** — la duración tiembla en cada ejecución, y escribirla hace que dos JSON nunca sean iguales; escribirla no está mal, pero la comparación debe ignorar esa columna.
- `compare.mjs` debe alinear los dos reportes por id de tarea, no por índice del arreglo — después de agregar o borrar tareas los índices se desalinean.
- Tras cambiar el punto de entrada debe borrarse el `printDiff` huérfano; el archivo modificado no puede dejar funciones sin llamar.
- El código de salida tiene dos niveles: si hay algún aprobado que pasa a fallido, `process.exit(1)`, y el resumen de la regresión va a stderr; sin regresión, salida normal (0). Los parámetros faltantes pueden usar otro código distinto de cero (por ejemplo 2) para distinguir «error de uso» de «hay regresión».
- Debe pegarse la salida real de los cuatro comandos; el tercero sale con 0 y el cuarto con 1.

<!-- hint -->

La escritura atómica son solo tres líneas, no le des tantas vueltas: `fs.writeFileSync(file + ".tmp", JSON.stringify(obj, null, 2))` y después `fs.renameSync(file + ".tmp", file)`. En el mismo sistema de archivos `rename` es atómico, así que `compare.mjs` lee o el archivo viejo completo o el nuevo completo, nunca uno a medio escribir.

<!-- hint -->

Para juzgar regresiones no uses el delta de puntuación. Que la puntuación baje de 1.00 a 0.67 es un descenso pero podría seguir por encima de la línea de aprobación (la línea de aprobación de la tarea de juez es 0.8); bajar de 1.00 a 0.00 sí es fallo seguro. Compara directamente el campo booleano `pass`: `was.pass && !now.pass` es regresión, y el cambio de puntuación se imprime aparte como una columna.

<!-- answer -->

**Modifica `eval-runner.mjs`.** Agrega dos imports y la función de escritura atómica arriba del archivo:

```javascript
import fs from "node:fs";
import path from "node:path";

const STRICT = process.argv.includes("--strict-verify");

// Escritura atómica: primero .tmp, después rename — compare.mjs nunca lee un archivo a medio escribir
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
```

Después reemplaza la sección 8 entera del punto de entrada — ejecuta una versión a la vez y escribe al archivo indicado:

```javascript
// ============ 8. Punto de entrada ============
// Uso: node eval-runner.mjs --version v1 --out reports/v1.json
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const version = argOf("--version", "v1");
const out = argOf("--out", null);

const report = await runSuite(version);
printReport(report);

if (out) {
  writeJsonAtomic(out, {
    version: report.version,
    passed: report.passed,
    total: report.total,
    ranAt: new Date().toISOString(),
    rows: report.rows.map(({ id, pass, score, toolCalls, toolErrors, tokens }) => ({
      id, pass, score, toolCalls, toolErrors, tokens,
    })),
  });
  console.log(`\nReporte escrito en ${out}`);
}
```

Tras cambiar el punto de entrada, `printDiff` se queda sin quien lo llame — **borra esta función por completo**, no la dejes como código muerto. Su trabajo pasa desde ahora a `compare.mjs`: `printDiff` solo puede comparar dos reportes de la misma ejecución del proceso; `compare.mjs` puede comparar dos ejecuciones cualesquiera, con días de diferencia o en máquinas distintas. Al persistir quitamos a propósito `durationMs` y `answer`: la duración tiembla en cada ejecución y la respuesta cruda es demasiado larga, y ambas meten ruido en las comparaciones de JSON.

**`compare.mjs` completo:**

```javascript
// compare.mjs — lee dos reportes, imprime la diferencia de puntuación por tarea; sale con código distinto de cero si un pass pasa a fail
// Uso: node compare.mjs reports/v1.json reports/v2.json
import fs from "node:fs";

const [baseFile, headFile] = process.argv.slice(2);
if (!baseFile || !headFile) {
  console.error("Uso: node compare.mjs <base.json> <nuevo.json>");
  process.exit(2);
}
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const base = read(baseFile);
const head = read(headFile);
const wasById = new Map(base.rows.map((r) => [r.id, r]));
const regressions = [];

console.log(`base ${baseFile} (${base.version})  ->  nueva ${headFile} (${head.version})`);
console.log("tarea".padEnd(18) + "base".padStart(6) + "nueva".padStart(8) + "delta".padStart(8) + "  estado");
console.log("-".repeat(52));

for (const now of head.rows) {
  const was = wasById.get(now.id);
  if (!was) {
    console.log(now.id.padEnd(18) + "-".padStart(6) + now.score.toFixed(2).padStart(8) + "-".padStart(8) + "  tarea nueva");
    continue;
  }
  const delta = now.score - was.score;
  let state = "sin cambio";
  if (was.pass && !now.pass) {
    state = "regresión pass => FAIL";
    regressions.push(now.id);
  } else if (!was.pass && now.pass) {
    state = "corregida fail => pass";
  } else if (Math.abs(delta) > 1e-9) {
    state = delta > 0 ? "puntuación sube" : "puntuación baja";
  }
  console.log(
    now.id.padEnd(18) + was.score.toFixed(2).padStart(6) + now.score.toFixed(2).padStart(8) +
    (delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)).padStart(8) + "  " + state
  );
}

console.log("-".repeat(52));
console.log(`Tasa de aprobación ${base.passed}/${base.total} -> ${head.passed}/${head.total}`);
const missing = base.rows.filter((r) => !head.rows.some((n) => n.id === r.id)).map((r) => r.id);
if (missing.length) console.log(`Tareas ausentes en el reporte nuevo: ${missing.join(", ")}`);

if (regressions.length) {
  console.error(`\n${regressions.length} tareas pasaron de pass a fail: ${regressions.join(", ")}`);
  process.exit(1);
}
console.log("\nNinguna tarea pasó de pass a fail.");
```

(Acá se puede usar `padEnd` crudo sin riesgo: las columnas rellenadas son todas IDs de tarea ASCII y números; las palabras de estado en español solo aparecen al final de la línea y no participan en la alineación; donde las columnas contengan texto de ancho completo sigue haciendo falta el `pad` consciente del ancho de la lección principal.)

**Salida real de la ejecución.** Los reportes de ambas ejecuciones de evaluación son iguales al texto principal, acá solo se conserva la última línea; la línea `exit code=` sale de agregarle `echo "exit code=$?"` después del comando.

```text
$ node eval-runner.mjs --version v1 --out reports/v1.json | tail -1
Reporte escrito en reports/v1.json

$ node eval-runner.mjs --version v2 --out reports/v2.json | tail -1
Reporte escrito en reports/v2.json
```

Comparación hacia adelante, sin regresión, sale con 0:

```text
$ node compare.mjs reports/v1.json reports/v2.json
base reports/v1.json (v1)  ->  nueva reports/v2.json (v2)
tarea               base   nueva   delta  estado
----------------------------------------------------
t1-total            1.00    1.00   +0.00  sin cambio
t2-pending          1.00    1.00   +0.00  sin cambio
t3-no-orderid       0.00    1.00   +1.00  corregida fail => pass
t4-refund-note      0.67    1.00   +0.33  corregida fail => pass
t5-missing-order    1.00    1.00   +0.00  sin cambio
----------------------------------------------------
Tasa de aprobación 3/5 -> 5/5

Ninguna tarea pasó de pass a fail.
exit code=0
```

Invierte los dos archivos, simulando «la versión nueva revirtió los cambios de v2», y la ruta de salida distinta de cero también funciona:

```text
$ node compare.mjs reports/v2.json reports/v1.json
base reports/v2.json (v2)  ->  nueva reports/v1.json (v1)
tarea               base   nueva   delta  estado
----------------------------------------------------
t1-total            1.00    1.00   +0.00  sin cambio
t2-pending          1.00    1.00   +0.00  sin cambio
t3-no-orderid       1.00    0.00   -1.00  regresión pass => FAIL
t4-refund-note      1.00    0.67   -0.33  regresión pass => FAIL
t5-missing-order    1.00    1.00   +0.00  sin cambio
----------------------------------------------------
Tasa de aprobación 5/5 -> 3/5

2 tareas pasaron de pass a fail: t3-no-orderid, t4-refund-note
exit code=1
```

Dos detalles de implementación que vale la pena conservar. Uno es alinear por `id` y no por índice — el Map `wasById` hace eso, y cuando más adelante insertes una tarea nueva en el conjunto de evaluación, los reportes viejos siguen comparándose. Dos es que el juicio de regresión usa `was.pass && !now.pass` y no un umbral de puntuación: que `t4` baje de 1.00 a 0.67 es un descenso de puntuación **y** cruzó la línea de aprobación de 0.8 del juez, y cumplir ambas condiciones es regresión; si algún día se ajusta la rúbrica y la línea de aprobación la sigue, este código no necesita cambios.

<!-- /exercises -->

## Resumen

- La forma estándar de ejecutar evaluaciones son llamadas programáticas y directas a la API más bucles agénticos simples — **una tarea de evaluación por bucle**; las tareas no comparten `messages`, o el contexto de la tarea anterior contamina a la siguiente y los resultados dejan de ser comparables[^S3].
- Cada prompt de evaluación debería estar emparejado con un resultado verificable; los verificadores forman un espectro que va de la comparación exacta de cadenas a pedirle al modelo que juzgue — lo que se puede calificar por código nunca va a un juez, porque la calificación basada en código es la más rápida, la más confiable y escala extremadamente bien[^S3][^S5].
- El texto de forma libre va al juez; la forma es una sola llamada, un solo prompt, salida de 0.0 a 1.0 más aprobado/fallido; la rúbrica debe razonar primero y puntuar después, con el formato de salida fijado[^S2][^S5].
- Más allá de la tasa de aprobación, los reportes deben registrar la duración de la tarea, el número de llamadas a herramientas, el consumo de tokens y los errores de herramienta; estas columnas se autodocumentan — las llamadas redundantes apuntan a parámetros de paginación/volumen de retorno que necesitan ajuste, y los errores de parámetro inválido apuntan a descripciones de herramientas que necesitan claridad[^S3].
- Los verificadores demasiado estrictos rechazan respuestas correctas: el formato, la puntuación y formulaciones distintas pero razonables pueden tumbar una comparación literal; normaliza antes de la coincidencia exacta[^S3][^S5]. La puntuación cambió pero el sistema bajo prueba no — es culpa del verificador.
- Con un circuito, el impacto de un cambio de prompt se vuelve medible; incluso refinamientos pequeños pueden rendir mejoras dramáticas; los tamaños de efecto tempranos son grandes y unos pocos casos bastan para ver diferencias[^S3][^S2]. El reporte mismo es evidencia que otros pueden revisar, más rápido que volver a ejecutar la verificación tú mismo, y sirve para sesiones que no estuviste mirando[^S4].
- Sigue los reportes para cambiar prompts y las puntuaciones van a subir, pero la subida podría ser solo sobre este lote de tareas; guarda bajo llave el conjunto reservado para evitar el sobreajuste[^S3]. Las evaluaciones automáticas tienen puntos ciegos; los evaluadores humanos siguen atrapando casos límite que las evaluaciones no ven[^S2].

## Después de terminar este curso

Mirando hacia atrás, el hilo principal es en realidad corto. La lección 1 separó «parece terminado» de «está terminado» — sin verificaciones ejecutables, «parece terminado» es la única señal disponible y tú te conviertes en el paso de verificación[^S4]. La lección 2 fijó qué verificar: los agentes podrían recorrer caminos razonables completamente distintos hacia el mismo objetivo, así que evalúa el estado final, no revises la trayectoria paso por paso[^S2]. La lección 3 convirtió las «verificaciones» en verificadores deterministas ejecutables que emiten aprobado/fallido, y también advirtió que los verificadores demasiado estrictos rechazan respuestas correctas[^S3]. La lección 4 se ocupó del texto de forma libre — rúbricas, formato de salida, y que el modelo que trabajó no debería calificarse a sí mismo[^S2][^S4]. La lección 5 resolvió «con cuántos casos verificar»: unas veinte tareas reales alcanzan para arrancar, no esperes a acumular cientos para empezar[^S2]. Esta lección soldó las primeras cinco en un archivo de trescientas líneas.

Ese archivo no es complejo, se ejecuta en menos de dos segundos, pero lo que cambia es concreto: desde hoy, cuando cambies una versión del prompt, no dependes de «leer unos párrafos de salida y sentir que está mejor» para juzgar — ejecutas un comando y la tabla de diferencias de v1 a v2 habla por ti, igual que esta vez, cuando `t3` y `t4` se pusieron en verde mientras las otras tres se quedaron sin cambio. La próxima vez que tu agente diga «listo», tienes dos comandos y un código de salida para verificar esa afirmación.

La próxima vez que tu agente diga «listo», tienes un circuito ejecutable para verificarlo.

