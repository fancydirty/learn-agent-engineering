# Lección 3: Logs estructurados y métricas: convertir cada paso en datos

> Objetivos de aprendizaje:
> - Explicar las cuatro preguntas que la observabilidad en producción debe responder, y reconocer que son los mismos números que las métricas de evaluación, solo que usados de otra forma
> - Diseñar logs estructurados para tu arnés: un registro por solicitud al modelo, uno por llamada a herramienta, con campos que cubran duración, tokens, nombre de herramienta y errores
> - Mapear patrones de métricas a arreglos concretos mediante lecturas diagnósticas, y detectar cuándo señales como «cero errores» están deformadas por la manera en que se registran
>
> Requisitos: Completar las Lecciones 1 y 2, y tener un bucle de arnés funcionando (Curso 7 de esta serie) | Anterior: [<< Lección 2](./02-transcripts-as-evidence.md) | Siguiente: [Lección 4 >>](./04-tracing.md)

## Una ejecución que puedes leer, doscientas que no

Al final de la Lección 2 hiciste algo que vale la pena: leíste una transcripción cruda de principio a fin y atrapaste tres problemas que el agente nunca mencionó. El método funciona y la evidencia es sólida. El problema es que eso fue **una** ejecución.

Ahora pon el mismo agente en producción: doscientas ejecuciones por día, cada una con una docena de iteraciones del bucle, sumando dos o tres mil idas y vueltas de llamadas a herramientas. El lunes por la mañana alguien dice «el lote del viernes por la tarde se sintió especialmente lento», ¿y cómo respondes? Leer doscientas transcripciones obviamente no es realista. Y aunque lo hicieras, seguirías sin poder responder dónde estuvo lento — ese juicio requiere mirar la distribución entre ejecuciones, no leer una muestra. Los ojos humanos pueden responder «por qué hizo esto en esta ejecución en particular», pero no «en qué se diferenció este lote del lote anterior».

Así que el trabajo de esta lección cabe en una frase: **convertir preguntas que requieren leer transcripciones en preguntas que una sola consulta puede responder.** Las primeras son «por qué buscó la misma palabra repetidamente esta vez»; las segundas son «qué herramienta se llamó más en los últimos siete días, y si los errores están todos en el mismo parámetro». La regla de la Lección 2 sigue en pie — las transcripciones crudas son evidencia de primera mano, el autorreporte del agente no cuenta. Esta lección solo guarda la misma evidencia en otro formato, para que pueda leerse por personas Y además filtrarse, agregarse y analizarse por distribución.

## Cuatro preguntas que los entornos de producción deben responder

La documentación oficial lista cuatro cosas que necesitas ver con claridad en la observabilidad de producción: **qué herramientas se llamaron, cuánto tardó cada solicitud al modelo, cuántos tokens se gastaron y dónde ocurrieron los fallos**[^S6]. Al tomar decisiones de diseño volverás a estas cuatro preguntas una y otra vez: ¿este campo ayuda a responder alguna de ellas? Si no, es ruido.

Esto quizá te suene conocido. El Curso 10 de esta serie usó el mismo conjunto de números al hablar de evaluación: más allá de la exactitud del estado final, recomendaba recolectar el tiempo de ejecución de llamadas a herramientas individuales y de tareas completas, el conteo total de llamadas a herramientas, el consumo total de tokens y los errores de herramienta[^S3]. Mismas métricas, dos apariciones, usos distintos:

| Este número | Curso 10: en la vía de evaluación | Esta lección: en el monitoreo diario |
| --- | --- | --- |
| Tiempo de ejecución de llamadas individuales y de tareas completas | Si el cambio hizo la tarea más lenta | Qué ventana de tiempo se puso lenta hoy, y si es el modelo o las herramientas |
| Conteo total de llamadas a herramientas | Qué versión del prompt da menos rodeos | Detectar patrones nuevos de llamadas repetitivas aparecidos en producción |
| Consumo total de tokens | Calcular el costo de ejecutar la evaluación completa | Vigilar el gasto diario, encontrar las sesiones que se comen los tokens |
| Errores de herramienta | Si el cambio introdujo fallos nuevos | Ver qué herramienta está inestable, y en qué parámetro está fallando |

La diferencia no está en los números — está en **con qué los comparas**. En evaluación comparas «antes del cambio frente a después del cambio» sobre un conjunto de pruebas fijo, así que los números tienen que ser reproducibles. En monitoreo comparas «hoy frente a los últimos siete días» o «esta sesión frente a otras sesiones», así que la referencia es el historial de las propias ejecuciones, lo que significa que los números tienen que ser continuos, marcados con hora y segmentables por dimensión. Esta lección cubre lo segundo.

## Logs estructurados: un registro por paso

> Esta sección describe una práctica de ingeniería. No hay guía autorizada sobre cómo nombrar campos de log ni a qué formato escribir en disco — lo que sigue es un punto de partida por defecto que funciona, no una especificación oficial. Los nombres de campo toman prestados términos que sí aparecen en materiales oficiales (session id, prompt id, nombre de herramienta, `tool_input`, `tool_response`, `duration_ms`, conteos de tokens, `error`), así que cuando más adelante te integres con telemetría oficial no tendrás que remapear el vocabulario.

### Unidad de registro: uno para solicitud al modelo, uno para llamada a herramienta

El bucle del agente tiene naturalmente dos tipos de «paso»: una solicitud al modelo y una ejecución de herramienta. Tienen atributos muy distintos —las solicitudes al modelo tienen conteos de tokens pero no nombre de herramienta; las ejecuciones de herramienta son al revés— pero comparten el mismo lote de campos de contexto (qué sesión, qué prompt, cuánto tardó).

Entonces: **escribe un registro por solicitud al modelo y uno por llamada a herramienta**, y usa un campo `type` para distinguirlos. No comprimas una iteración entera del bucle en un solo registro — así nunca podrás calcular el reparto entre tiempo de modelo y tiempo de herramienta. Tampoco escribas un único registro resumen cuando la tarea termine — si la tarea se estanca a mitad de camino, ni siquiera sabrás en qué paso se estancó.

### Formato: JSON Lines, un objeto por línea

JSON Lines (comúnmente escrito JSONL) es exactamente lo que suena: un archivo, cada línea es un objeto JSON completo, sin comas entre líneas y sin arreglo envolvente.

```json
{"ts":"2026-08-26T09:12:03.118Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-01","duration_ms":1840,"input_tokens":2310,"output_tokens":180}
{"ts":"2026-08-26T09:12:05.002Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-01","tool":"search_docs","duration_ms":412}
```

Las razones para elegirlo son todas mundanas pero todas válidas: las escrituras solo-append funcionan sin necesidad de volver atrás a agregar un `]` al final del archivo, así que aunque maten el proceso no terminas con un archivo sintácticamente roto (la última línea podría quedar a medio escribir, pero todas las anteriores siguen siendo parseables — este es también el origen real del requisito del ejercicio de que «las líneas malas se reportan pero no detienen el procesamiento»). Cuando el archivo crece a cientos de megabytes, puedes procesarlo por streaming línea por línea. Cada línea es autocontenida, así que `grep` puede filtrar, `jq` puede procesar y los ojos humanos pueden leer.

Compara esto con los logs en prosa que muchos arneses ya tienen — `[09:12:05] search_docs devolvió 3 resultados, tardó 412ms`. Se lee bien, pero solo lo pueden leer humanos. Para responder «cuál es la duración promedio de `search_docs` en los últimos siete días» tendrías que escribir una expresión regular que extraiga ese `412ms`; si alguien cambia «tardó» por «demoró», la regex empieza a devolver cero en silencio. Los logs en prosa codifican la estructura dentro del lenguaje natural, y el lenguaje natural es para que lo decodifiquen humanos. Los logs estructurados lo invierten: la estructura vive en campos, y las máquinas la leen sin ambigüedad. **Se pueden filtrar, agregar y analizar por distribución** — esas tres capacidades son las que de verdad necesitas al pasar de una ejecución a doscientas.

### Vocabulario de campos

Contexto que va en cada registro: `ts` (marca de tiempo ISO 8601 con milisegundos y zona horaria), `type` (`model_call` o `tool_call`), `session_id` (identificador de una sesión, se mantiene constante entre múltiples turnos), `prompt_id` (identificador de un prompt del usuario; todas las solicitudes al modelo y llamadas a herramientas que dispara comparten este valor), `duration_ms`. Las solicitudes al modelo agregan `model`, `stop_reason`, `input_tokens` / `output_tokens`. Las llamadas a herramientas agregan `tool`, `tool_use_id` (para emparejar con las respuestas) y `error` (presente solo cuando falla).

`prompt_id` es el campo menos llamativo de aquí, pero después se vuelve el más útil. Ahora mismo solo lo estás escribiendo en cada registro; la Lección 4 lo usará para cercar los registros dispersos en «eventos del mismo prompt» y después hilvanarlos en un árbol mediante relaciones padre-hijo. En cuanto a la entrada y el valor de retorno de la herramienta en sí (`tool_input` / `tool_response`) — **no escribas el texto completo por defecto**; registra solo largo o conteo de bytes. La justificación viene en la penúltima sección.

### Integrarlo en el arnés

El fragmento de abajo se apoya en el bucle gobernado por `stop_reason` del Curso 7 de esta serie. Primero, el logger:

```javascript
// logger.mjs
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const LOG_PATH = process.env.AGENT_LOG ?? './agent.jsonl';

export function createLogger({ sessionId = randomUUID() } = {}) {
  let promptId = null;
  return {
    startPrompt() {
      promptId = randomUUID();
      return promptId;
    },
    logRecord(fields) {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        session_id: sessionId,
        prompt_id: promptId,
        ...fields,
      });
      appendFileSync(LOG_PATH, line + '\n');
    },
  };
}
```

`logRecord()` hace una sola cosa: fusionar el contexto común con los campos que le pasa quien lo llama en una línea de JSON y agregarla al final del archivo. No juzga, no formatea, no hace nada «inteligente» — mientras más tonto el logger, mejor, porque cuando se rompe te quedas sin logs que revisar. Después, los dos puntos de instrumentación del bucle:

```javascript
// loop.mjs
import { createLogger } from './logger.mjs';

// El ciclo de vida del logger es «una sesión», no «un turno»: créalo una vez al
// arrancar la sesión y después, por cada prompt, solo llama a startPrompt() para
// obtener un prompt_id nuevo — session_id se mantiene constante entre turnos, que
// es exactamente de donde viene. No muevas createLogger() dentro de runTurn o cada
// turno se vuelve una sesión nueva, y session_id queda como un duplicado de prompt_id.
const log = createLogger();

export async function runTurn({ client, model, tools, runTool, userInput }) {
  log.startPrompt();
  const messages = [{ role: 'user', content: userInput }];

  while (true) {
    // Punto de instrumentación uno: cada solicitud al modelo
    const t0 = Date.now();
    const response = await client.messages.create({ model, max_tokens: 2048, tools, messages });
    log.logRecord({
      type: 'model_call',
      model,
      stop_reason: response.stop_reason,
      duration_ms: Date.now() - t0,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    if (response.stop_reason !== 'tool_use') return response;
    messages.push({ role: 'assistant', content: response.content });
    const results = [];

    for (const block of response.content.filter((b) => b.type === 'tool_use')) {
      // Punto de instrumentación dos: cada llamada a herramienta
      const t1 = Date.now();
      let output;
      let error = null;
      try {
        output = await runTool(block.name, block.input);
      } catch (e) {
        error = e.message;
        output = `Falló la ejecución de la herramienta: ${e.message}`;
      }
      log.logRecord({
        type: 'tool_call',
        tool: block.name,
        tool_use_id: block.id,
        duration_ms: Date.now() - t1,
        input_bytes: Buffer.byteLength(JSON.stringify(block.input), 'utf8'),
        output_bytes: Buffer.byteLength(String(output), 'utf8'),
        ...(error ? { error } : {}),
      });
      results.push({ type: 'tool_result', tool_use_id: block.id, content: String(output) });
    }

    messages.push({ role: 'user', content: results });
  }
}
```

Dos detalles que vale la pena señalar.

**Dónde arrancas y dónde detienes el cronómetro determina qué significa este número.** `t1` arranca antes de `runTool` y se detiene después de que retorna, así que `duration_ms` incluye los reintentos propios de la herramienta, las esperas de backoff y las idas y vueltas de red, pero no la validación de parámetros previa a la llamada. Tú defines esta frontera; una vez definida, escríbela — dentro de seis meses, cuando estés mirando un `duration_ms` de 30 segundos, vas a necesitar saber si incluye reintentos.

**Los errores van tanto al log como al contexto del modelo.** El bloque `catch` mete el mensaje de error de vuelta en `tool_result`, así que el agente lo ve en el siguiente turno. La guía oficial encaja perfecto aquí: cuando una llamada a herramienta lanza un error, habría que aplicarle ingeniería de prompts a la respuesta para que comunique con claridad mejoras específicas y accionables, no un código de error opaco ni una traza de pila[^S3]. Puedes escribir `ETIMEDOUT` en el log, pero lo que vuelve al modelo debería ser «La solicitud expiró (30 segundos). Este endpoint tiende a expirar en consultas de rango amplio; intenta reducir `date_range` a 7 días o menos».

## Leer métricas de forma diagnóstica

El valor de una métrica no está en «hoy hicimos 1,283 llamadas a herramientas» como número — está en que **ciertos patrones apuntan a ciertos arreglos**. Las correlaciones oficiales son todas pistas que vale la pena verificar primero:

**Muchas llamadas redundantes → quizá haya que ajustar los parámetros de paginación o de límite de tokens.** Muchas llamadas redundantes a herramientas podrían sugerir que se justifica un ajuste de tamaño de los parámetros de paginación o de límite de tokens[^S3]. El modelo necesita encontrar un pasaje en la documentación, tu `search_docs` devuelve solo 5 resultados por página, así que tiene que hojear 28 páginas. Cada una de esas 28 llamadas es legal, cada una tiene éxito, las métricas no muestran ningún «error», pero todas son desperdicio. Sube los resultados por página a 25 y este patrón desaparece.

**Muchos errores de parámetro inválido → probablemente a la descripción de la herramienta le falta claridad o ejemplos.** Muchos errores de herramienta por parámetros inválidos podrían sugerir que a las herramientas les vendrían bien descripciones más claras o mejores ejemplos[^S3]. Esta es potente cuando los errores se agrupan en **el mismo parámetro**: siete errores diciendo todos `invalid parameter: date_range` significa que deberías revisar primero si tu descripción explica qué formato espera ese parámetro. La dirección de investigación es la descripción de la herramienta, no el modelo.

**Rastrear las llamadas a herramientas revela otras cosas.** Rastrear las llamadas a herramientas puede ayudar a revelar flujos de trabajo comunes que los agentes siguen y ofrecer algunas oportunidades para consolidar herramientas[^S3]. Por ejemplo, si el 90% de las llamadas a `read_file` van seguidas de `parse_config`, quizá deberías ofrecer un `read_config` de un solo paso. Este tipo de descubrimiento nunca emerge de una sola ejecución — solo de agregados. Otro conjunto de lecturas útiles: analiza tus métricas de llamadas a herramientas para identificar las herramientas más usadas, las tasas de éxito por herramienta, los tiempos promedio de ejecución y los patrones de error por tipo de herramienta[^S4].

Algunos problemas son inherentemente problemas de magnitud — no puedes decir «dónde está el mucho» sin mirar agregados. Anthropic documentó problemas tempranos así: rastrear la web sin parar buscando fuentes inexistentes[^S1] — mirar cualquier búsqueda individual no va a marcar ningún error; necesitas alinear decenas de llamadas para ver que «está girando en el vacío».

Una experiencia general (sin fuente autorizada): la duración promedio casi siempre miente. 99 llamadas de 80ms más 1 llamada de 30 segundos promedian 379ms, que se ve algo lento pero aceptable; la realidad son 99 llamadas rápidas más una completamente estancada. Al leer duración, mira como mínimo la mediana y los percentiles altos, o ve directo a los pocos registros más lentos.

## La trampa de leer números: qué está contando realmente tu señal

La forma más fácil de que una métrica mienta no es contando mal — es cuando **lo que cuenta no es lo que tú crees que cuenta**.

Mira un diseño de producto real. Claude Code reintenta internamente las solicitudes de API fallidas y emite un único evento `api_error` solo después de rendirse — ese evento es la **señal terminal** de esa solicitud; los intentos de reintento intermedios no se registran como eventos separados[^S4]. Este diseño tiene sentido: si cada reintento registrara un error, el gráfico de errores quedaría inundado de hipos transitorios que la autorrecuperación resolvió, ocultando cuántas solicitudes fallaron de verdad. El costo es que tienes que recordar esta semántica — «3 eventos api_error hoy» significa «3 solicitudes fallaron en última instancia», no «3 hipos de red», y no dice nada sobre cuántos reintentos exitosos se esconden debajo.

La misma página de documentación ofrece una lectura muy práctica: para distinguir si una sesión **se recuperó de un error** o **se estancó por completo**, agrupa los eventos por session id y revisa si existe un evento de solicitud de API posterior al error[^S4]. Si hay uno posterior, siguió adelante; si no, ahí se detuvo. Este juicio requiere un agrupamiento más una revisión de «si hay registros después del error», con una relación valor/esfuerzo altísima — el ejercicio de Nivel 2 te hace escribir exactamente esto. (El JSONL escrito por append está naturalmente ordenado en el tiempo, así que no necesitas ordenar explícitamente dentro de un solo archivo; cuando los logs vienen de múltiples procesos, ordena primero por `ts`.)

```agentmentor-check
{
  "id": "obs-zh-03-error-count-lies",
  "label": "Qué te dice realmente «cero errores»",
  "prompt": "El tablero muestra cero errores de herramienta hoy. Un compañero le echa un vistazo y dice: «Todas las ejecuciones están sanas hoy». Tu arnés reintenta silenciosamente los fallos de llamadas a herramientas hasta tres veces, y solo escribe un registro de error cuando los tres intentos fallan. ¿Cuál es el problema principal de esta conclusión?",
  "whyHere": "Acabas de aprender a convertir cada paso en un registro; la siguiente habilidad a practicar es preguntar lo inverso: qué registró realmente este número y qué dejó afuera. Las métricas normalmente no mienten porque las cuentas estén mal, sino porque el método de registro define una semántica que nadie escribió.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No hay problema — cero errores sí significa que la capa de herramientas está sana. Los reintentos son detalles internos que la herramienta absorbe; si no se registró error, es que todo terminó teniendo éxito. Si algo salió mal hoy, solo puede estar en el juicio del modelo.",
      "correct": false,
      "feedback": "«No está en el registro» no significa «no ocurrió» — esta es la versión métrica de la regla de la Lección 2. Tu lógica de reintentos determina qué condiciones tiene que cumplir un fallo para quedar escrito; la capa de herramientas podría perfectamente haber estado inestable todo el día, con cada hipo atrapado calladamente por el segundo o el tercer reintento."
    },
    {
      "id": "b",
      "text": "Esta métrica cuenta «fallaron los tres reintentos», no «falló la llamada». Hoy pudo haber tenido montones de llamadas que fallaron una o dos veces y después tuvieron éxito al reintentar, y el conteo de errores se queda en cero. La pista real está en la duración — los reintentos van a empujar el duration_ms de esas llamadas al doble o al triple de lo normal.",
      "correct": true,
      "feedback": "Correcto. La semántica de una señal la define cómo se registra, sin importar cómo se llame la métrica. Este diseño en sí está bien — Claude Code hace lo mismo: reintenta internamente las solicitudes de API fallidas y solo emite un evento api_error cuando se rinde, sin registrar los reintentos intermedios por separado. La clave es saber qué cuenta tu número y después buscar la pista que esta señal no cubre — en este caso, el alza general de la distribución de duraciones."
    },
    {
      "id": "c",
      "text": "El problema es usar un número absoluto. Cambia el tablero a tasa de error (errores ÷ conteo de llamadas) con una media móvil de siete días como referencia — proporción más tendencia es lo que refleja la salud real.",
      "correct": false,
      "feedback": "Cambiar el denominador no arregla un numerador que semánticamente excluye los reintentos — 0 dividido por cualquier cosa sigue siendo 0. La tasa de error es en sí misma una métrica útil, pero no rescata a una señal cuya semántica nunca cubrió los reintentos en primer lugar. Lo que hay que cambiar aquí es el método de registro (registrar cada intento de reintento con un número de secuencia), no la fórmula."
    }
  ]
}
```

De esta trampa puedes extraer una práctica general: **escribe una frase por cada métrica que diga «esto cuenta qué».** Escríbela en comentarios de código o en la documentación de campos. «Conteo de errores de herramienta = un conteo después de que fallan todos los reintentos» y «= un conteo por cada excepción lanzada» son dos métricas completamente distintas, pero el nombre puede ser idéntico, y quien lea el tablero dentro de seis meses no podrá distinguirlas solo por el número.

## Costo y tokens: el número que más vale la pena vigilar

Si solo pudieras vigilar un número, vigila los tokens.

Primero, la magnitud. En los datos de Anthropic, los agentes suelen usar unas 4× más tokens que las interacciones de chat, y los sistemas multiagente usan unas 15× más tokens que los chats[^S1]. Esta es su observación sobre sus propios sistemas, no una constante universal, pero fija una expectativa: cuando conviertas una funcionalidad de chat en un agente, la factura no va a subir «un poquito». Tienen otra observación estadística: el uso de tokens por sí solo explica el 80% de la varianza, con el número de llamadas a herramientas y la elección de modelo como los otros dos factores explicativos[^S1] — esto viene de su párrafo que analiza el desempeño de la evaluación, o sea «qué cantidades explican mejor las diferencias entre ejecuciones», y los tokens quedan primeros. Léelas juntas: los tokens son a la vez la parte más grande de la factura y el principal factor explicativo de la varianza entre ejecuciones, así que entre las métricas candidatas es la que más vale la pena vigilar primero.

Dos notas prácticas. **Los números de costo son aproximaciones**: la documentación oficial dice que las métricas de costo son aproximaciones; para datos de facturación oficiales, consulta a tu proveedor de API[^S4]. Así que su uso es «detectar anomalías, comparar tendencias», no «cuadrar con finanzas». **La atribución necesita segmentarse por dimensión**: las métricas de uso se pueden usar para rastrear tendencias entre equipos o individuos, identificar sesiones de alto uso y además atribuir el gasto a cosas específicas como nombre de skill, nombre de plugin o tipo de subagente[^S4]. La implicación para arneses caseros es directa — escribe esas dimensiones en los registros de log desde el principio, no intentes unirlas después; unir dimensiones a posteriori es básicamente volver a ejecutar. Además, copia los conteos de tokens directamente del campo `usage` de la respuesta del modelo; no los estimes con conteo de caracteres dividido entre 4 ni métodos parecidos — esos se desvían notablemente en escenarios de idiomas mezclados, con mucho código o con imágenes incluidas.

## Contención: no inventes umbrales, no registres contenido completo

Una vez que tienes métricas, el siguiente impulso natural es poner alertas: tasa de error por encima del 5%, alerta; duración del percentil alto por encima de 10 segundos, alerta.

Alto. **Esta lección no da números de umbral, porque no los hay en materiales autorizados.** La documentación oficial menciona que alguien debería encargarse de las alertas, pero nunca ha dado valores específicos — presupuestos de error, objetivos de SLO, umbrales de alerta, ni un solo número. Si yo escribiera aquí «se recomienda 5%», eso me lo estaría inventando, y tú lo usarías. Los umbrales solo pueden crecer desde tu propia línea base: registra dos semanas de datos primero, mira el rango de fluctuación normal, y después define qué cuenta como anormal. Invierte el orden y obtienes una regla que da falsas alarmas tres veces al día y que todo el mundo silencia a las dos semanas.

La división de responsabilidades también vale la pena copiarla de los productos oficiales: Claude Code emite únicamente el flujo de eventos crudo; la detección de anomalías, el cálculo de líneas base, la correlación entre sesiones y las alertas son responsabilidad de tu SIEM o de tu backend de observabilidad[^S4]. Para arneses caseros esto significa: **el sistema observado no emite juicios por sí mismo.** No escribas «después de 3 errores de herramienta seguidos, manda un correo» dentro del arnés — esa lógica se despliega con el agente, se reinicia con el agente y se rompe con el agente, y no tiene datos históricos con los cuales comparar.

Una última cosa, y también la más fácil de convertirse en incidente tres meses después del lanzamiento: **no registres contenido por defecto.** Claude Code no recolecta el contenido de los prompts del usuario por defecto — solo el largo del prompt; para incluir contenido tienes que definir explícitamente una variable de entorno[^S4]. La telemetría del Agent SDK es igualmente estructural primero — cada span registra duración, nombre de modelo y nombre de herramienta; los conteos de tokens se registran cuando la API devuelve datos de uso, pero el contenido que tu agente lee y escribe no se registra por defecto[^S6].

Estos dos valores por defecto reflejan el mismo juicio: la información estructural (quién, cuándo, cuánto tardó, qué herramienta, cuántos tokens) alcanza para responder la enorme mayoría de las preguntas de operación; el contenido no. Una vez que el contenido entra a los logs, sigue a los logs hacia los respaldos, hacia el almacenamiento de largo plazo, hacia la vista de cualquiera con permisos de lectura. Así que tu arnés debería registrar por defecto `input_bytes: 137` en lugar de `tool_input: {...}`; cuando de verdad necesites diagnosticar los parámetros exactos de una llamada específica, activa el registro completo para ese caso puntual. Esto no entra en conflicto con el «las transcripciones crudas son evidencia de primera mano» de la Lección 2: al depurar sí deberías ver la ida y vuelta completa, en un entorno que controlas, para una ejecución específica, y terminas cuando la leíste. Los logs de producción están por defecto en retención de largo plazo y visibilidad para varias personas — eso es otra cosa.

## Fronteras: dónde se detiene esta lección

A esta altura tienes un montón de registros estructurados y un conjunto de métricas legibles. Tres cosas que esta lección no hace: hilvanar relaciones padre-hijo entre registros (qué solicitudes al modelo disparó un prompt, qué llamada a herramienta se anida bajo qué subagente) requiere ID de correlación para construir un árbol — eso es la Lección 4. Enganchar sondas en los puntos de control del ciclo de vida sin modificar el código del arnés son los hooks de la Lección 5. Montar toda esta capa sobre tu arnés del Curso 7 y recorrer un simulacro de depuración completo es la Lección 6.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Leer tres tipos de problema en una tabla de métricas

No se necesita código. Abajo hay un resumen de métricas de cinco tareas que tu agente ejecutó ayer:

| Tarea | Tiempo total | Conteo de llamadas | Tokens totales | Conteo de errores |
| --- | --- | --- | --- | --- |
| T1 Arreglar una prueba que falla | 42s | 9 | 38,400 | 0 |
| T2 Buscar uso de la API en la documentación | 186s | 41 | 214,000 | 0 |
| T3 Generar un reporte semanal | 71s | 12 | 44,900 | 7 |
| T4 Refactorizar un módulo | 402s | 16 | 806,000 | 1 |
| T5 Responder una pregunta de configuración | 55s | 8 | 31,200 | 0 |

Contexto adicional sacado de los logs:

- Las 41 llamadas de T2 incluyen 28 llamadas a `search_docs`, con solo el parámetro `offset` cambiando: 0, 20, 40, 60…
- Los 7 errores de T3 vinieron todos de `search_issues`, con texto de error idéntico: `invalid parameter: date_range`
- Las 16 llamadas de T4 incluyen 4 llamadas a `read_file` leyendo el mismo archivo de 3,000 líneas; el 1 error es un timeout de `run_tests`
- T1 y T5 no muestran llamadas repetidas a la misma herramienta

Responde tres preguntas, declarando en qué número (o detalle de contexto) te apoyaste para cada una: ¿qué patrón apunta a «hay que ajustar los parámetros de paginación o de límite de tokens»? ¿Cuál apunta a «a la descripción de la herramienta le falta claridad o ejemplos»? ¿Qué valor de tokens vale la pena investigar primero, y por qué ese y no el segundo total más alto? Más una de verdadero/falso: ¿el 1 error de T4 constituye una señal de que «hay que arreglar la descripción de la herramienta»?

<!-- rubric -->

**Criterios de calificación**

- La pregunta 1 responde T2, con base en «misma herramienta llamada 28 veces con solo el offset cambiando» como patrón de llamada redundante, correspondiente a que hay que ajustar el tamaño de página o los parámetros de límite de tokens. Responder solo «el conteo de llamadas más alto» no alcanza — el conteo alto en sí no es el problema, la repetición sí.
- La pregunta 2 responde T3, con base en que los 7 errores se agrupan todos en la misma herramienta y el mismo parámetro, o sea errores de parámetro inválido, correspondiente a que a la descripción de la herramienta le falta claridad o ejemplos.
- La pregunta 3 responde T4, y el razonamiento debe ser **tokens por llamada** (806,000 ÷ 16 = 50,375), no tokens totales. Debe explicar que aunque T2 tiene el segundo total más alto, por llamada es de solo unos 5,200, en el mismo rango que las demás; T4 está un orden de magnitud por encima.
- La de verdadero/falso responde «falso»: un solo error no es un patrón; la guía oficial dice «**muchos** errores de parámetro inválido» apuntan a la descripción de la herramienta; además, este es un timeout de ejecución, no un parámetro inválido.
- A lo largo de todo, no trata 5 muestras como conclusiones estadísticas: sin porcentajes, sin afirmaciones sobre «la producción en general». Detectar un patrón y probar una distribución son dos cosas distintas.

<!-- answer -->

**Respuesta de referencia**

**1. Parámetros de paginación / límite de tokens: T2.** La base no es «41 llamadas es el máximo», sino que 28 de esas 41 son la misma herramienta con solo el `offset` incrementándose. El agente va hojeando página por página porque una página no le da lo suficiente para tomar una decisión. Lectura oficial de este patrón — muchas llamadas redundantes a herramientas podrían sugerir que se justifica un ajuste de tamaño de los parámetros de paginación o de límite de tokens[^S3]. Arreglo: sube los resultados por página de `search_docs` de 20 a 60 o 100, o agrega un parámetro `max_results` que le permita al agente pedir suficiente de una vez; vuelve a ejecutar la misma tarea después del cambio y mira cuántas de esas 28 llamadas se comprimen. Vale la pena notar que un buen pedazo de esos 214,000 tokens vino de que estos 28 resultados paginados entraran repetidamente al contexto — las llamadas redundantes y el consumo de tokens suelen ser dos caras del mismo problema.

**2. Descripción de la herramienta / agregar ejemplos: T3.** La base es la distribución de los errores: no dispersos entre herramientas, sino aterrizando todos en el parámetro `date_range` de `search_issues`, con texto de error idéntico. Esta es la forma clásica de los errores de parámetro inválido; la guía oficial da como arreglo correspondiente hacer más claras las descripciones de las herramientas y agregar ejemplos[^S3]. Arreglo en dos pasos: en la descripción del parámetro, especifica qué formato espera `date_range` y da un ejemplo copiable; simultáneamente, reescribe la propia respuesta de error — no devuelvas `invalid parameter: date_range`, devuelve «`date_range` requiere formato `YYYY-MM-DD/YYYY-MM-DD`, por ejemplo `2026-08-01/2026-08-26`; pasaste `last week`». Cuando una llamada a herramienta lanza un error, la respuesta debería comunicar con claridad mejoras específicas y accionables, no un código de error opaco[^S3].

**3. Investigar tokens primero: T4.** No porque tenga el total más alto (aunque lo tiene), sino porque los **tokens por llamada** están absurdamente fuera de rango: T1 unos 4,300, T2 unos 5,200, T3 unos 3,700, T5 es 3,900 — cuatro tareas agrupadas en un mismo nivel; T4 es 806,000 ÷ 16 = 50,375, un orden de magnitud por encima. Las tareas más difíciles normalmente se manifiestan como más llamadas (como T2), no como que cada llamada cueste diez veces más. El sospechoso es obvio: 4 llamadas a `read_file` leyendo el mismo archivo de 3,000 líneas — cada lectura trae una copia completa, y cada copia se queda en el contexto participando en todas las solicitudes al modelo posteriores. La verificación es simple: revisa si los `input_tokens` de los registros `model_call` de T4 saltan en escalones después de ciertos turnos.

Por qué investigarlo **primero**: cuatro tareas tienen los tokens por llamada agrupados entre 3,700 y 5,200, T4 está en 50,375 — desviado por un orden de magnitud. Eso solo ya alcanza para abrir un caso. La magnitud de un valor atípico no necesita ninguna otra justificación.

**Verdadero/falso: falso.** Un error no es un patrón. La guía oficial dice que «**muchos** errores de parámetro inválido» apuntan a la descripción de la herramienta[^S3] — una sola ocurrencia solo significa que pasó una vez. Y este ni siquiera es un problema de parámetros — un timeout de `run_tests` es un asunto de la capa de ejecución (las pruebas realmente tardan, o el timeout está demasiado ajustado), sin relación con si la descripción de la herramienta es clara. Anótalo y sigue; espera a que se vuelva un patrón.

**Sobre esta tabla en sí**: cinco puntos de datos te dejan detectar un patrón, no calcular proporciones. «El 20% de las tareas de hoy tuvo errores» no significa nada dicho desde 5 muestras — cambia cinco tareas distintas y este número puede ser 0% o 60%. Para probar una distribución, escala la muestra; estas cinco te dicen dónde escarbar.

<!-- hint -->

**Pista 1**: Las tres preguntas corresponden a tres lecturas distintas; no te obsesiones con «qué número es el más grande». La pregunta 1 busca «¿se está repitiendo la misma cosa?», la pregunta 2 busca «¿los errores están dispersos o agrupados?», la pregunta 3 busca «¿este número dividido entre otro número sigue viéndose normal?». Las cuatro columnas se pueden dividir de a pares — prueba qué razones resultan interesantes.

<!-- hint -->

**Pista 2**: La trampa de la pregunta 3 está en la frase «y no el segundo total más alto». Divide los tokens de cada tarea entre su conteo de llamadas, alinea las cinco razones y verás cuatro apiñadas y una volando aparte — esa es tu respuesta. Y no te olvides de la de verdadero/falso: «7 errores idénticos» y «1 error» no tienen la misma fuerza probatoria.

### Nivel 2: Escribir un script de agregación de logs

Este requiere código que se ejecute de verdad. Abajo hay un segmento de log JSONL de tu arnés (20 registros, 4 prompts, 2 sesiones). Guárdalo como `agent.jsonl`:

```json
{"ts":"2026-08-26T09:12:03.118Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-01","duration_ms":1840,"input_tokens":2310,"output_tokens":180}
{"ts":"2026-08-26T09:12:05.002Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-01","tool":"search_docs","duration_ms":412}
{"ts":"2026-08-26T09:12:05.460Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-01","duration_ms":2260,"input_tokens":3480,"output_tokens":210}
{"ts":"2026-08-26T09:12:07.780Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-01","tool":"read_file","duration_ms":86}
{"ts":"2026-08-26T09:12:07.900Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-01","duration_ms":1970,"input_tokens":4120,"output_tokens":330}
{"ts":"2026-08-26T09:18:41.004Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-02","duration_ms":2010,"input_tokens":2280,"output_tokens":160}
{"ts":"2026-08-26T09:18:43.060Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-02","tool":"search_docs","duration_ms":455}
{"ts":"2026-08-26T09:18:43.560Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-02","tool":"search_docs","duration_ms":448}
{"ts":"2026-08-26T09:18:44.050Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-02","tool":"search_docs","duration_ms":437}
{"ts":"2026-08-26T09:18:44.530Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-02","duration_ms":3120,"input_tokens":9640,"output_tokens":240}
{"ts":"2026-08-26T09:18:47.700Z","type":"tool_call","session_id":"s-4f1","prompt_id":"p-02","tool":"read_file","duration_ms":91}
{"ts":"2026-08-26T09:18:47.840Z","type":"model_call","session_id":"s-4f1","prompt_id":"p-02","duration_ms":2450,"input_tokens":11200,"output_tokens":420}
{"ts":"2026-08-26T10:02:11.220Z","type":"model_call","session_id":"s-9c7","prompt_id":"p-03","duration_ms":1760,"input_tokens":2260,"output_tokens":140}
{"ts":"2026-08-26T10:02:13.030Z","type":"tool_call","session_id":"s-9c7","prompt_id":"p-03","tool":"fetch_url","duration_ms":30150,"error":"ETIMEDOUT"}
{"ts":"2026-08-26T11:31:52.410Z","type":"model_call","session_id":"s-9c7","prompt_id":"p-04","duration_ms":2130,"input_tokens":2340,"output_tokens":170}
{"ts":"2026-08-26T11:31:54.600Z","type":"tool_call","session_id":"s-9c7","prompt_id":"p-04","tool":"run_tests","duration_ms":8420}
{"ts":"2026-08-26T11:32:03.080Z","type":"model_call","session_id":"s-9c7","prompt_id":"p-04","duration_ms":2890,"input_tokens":6180,"output_tokens":520}
{"ts":"2026-08-26T11:32:06.030Z","type":"tool_call","session_id":"s-9c7","prompt_id":"p-04","tool":"write_file","duration_ms":74}
{"ts":"2026-08-26T11:32:06.150Z","type":"tool_call","session_id":"s-9c7","prompt_id":"p-04","tool":"run_tests","duration_ms":7960}
{"ts":"2026-08-26T11:32:14.170Z","type":"model_call","session_id":"s-9c7","prompt_id":"p-04","duration_ms":2040,"input_tokens":7050,"output_tokens":260}
```

Escribe un `stats.mjs` que se ejecute con `node stats.mjs agent.jsonl` y haga cuatro cosas: leer JSONL (un objeto por línea, saltar líneas vacías, atrapar y reportar líneas malas sin detenerse); agregar por `type` para producir conteo, duración total, tokens totales y conteo de errores; agrupar por `prompt_id` para encontrar ejecuciones donde «existe error y no le siguen registros posteriores» e imprimir su `prompt_id`, `session_id` y mensaje de error; código de salida 1 significa que se detectó un estancamiento sospechoso, 0 significa que no hay ninguno (para que pueda enchufarse a CI o a cron). Usa solo la biblioteca estándar de Node, sin dependencias.

<!-- rubric -->

**Criterios de calificación**

- El script se ejecuta de verdad, `node stats.mjs agent.jsonl` produce salida sin lanzar excepciones; las líneas vacías se saltan, los fallos de parseo de una línea se atrapan, se reportan y el procesamiento continúa con las líneas restantes.
- Agrega por `type` en dos grupos, con los cuatro números correctos: `model_call` 10 registros, duración total 22,470ms, tokens totales 53,490, errores 0; `tool_call` 10 registros, duración total 48,533ms, tokens totales 0, errores 1. Los campos faltantes (los registros de herramienta no tienen campos de token) se tratan como 0, no como `NaN`.
- La lógica de detección de estancamiento es «el último registro de ese grupo de `prompt_id` tiene `error`», no «el grupo contiene error». Solo encuentra `p-03`.
- Cuando se detecta un estancamiento sospechoso, `process.exit(1)` (o equivalente) surte efecto; ejecutar sobre estos datos y después `echo $?` debe devolver 1.
- Agrupa por `prompt_id`, no por `session_id`: la sesión `s-9c7` contiene dos prompts, p-03 y p-04; agrupar por sesión haría que los registros de p-04 aparecieran como «posteriores» al error de p-03, y el estancamiento se perdería.

<!-- answer -->

**Respuesta de referencia**

```javascript
// stats.mjs
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'agent.jsonl';

// Un JSON por línea, saltar líneas vacías, reportar líneas malas sin detenerse
const records = readFileSync(file, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      console.error(`El registro ${i + 1} no es JSON válido, se salta`);
      return null;
    }
  })
  .filter((r) => r !== null);

// 1. Agregar por tipo de registro: conteo / duración total / tokens totales / errores
const byType = new Map();
for (const r of records) {
  const acc = byType.get(r.type) ?? { count: 0, ms: 0, tokens: 0, errors: 0 };
  acc.count += 1;
  acc.ms += r.duration_ms ?? 0;
  acc.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
  if (r.error) acc.errors += 1;
  byType.set(r.type, acc);
}

console.log('=== Por tipo ===');
for (const [type, acc] of byType) {
  console.log(
    `${type.padEnd(11)} count=${String(acc.count).padStart(3)}` +
      ` total_ms=${String(acc.ms).padStart(7)}ms` +
      ` total_tokens=${String(acc.tokens).padStart(7)}` +
      ` errors=${acc.errors}`,
  );
}

// 2. Agrupar por prompt_id, encontrar «existe error y no le siguen registros posteriores»
const byPrompt = new Map();
records.forEach((r, i) => {
  if (!byPrompt.has(r.prompt_id)) byPrompt.set(r.prompt_id, []);
  byPrompt.get(r.prompt_id).push({ ...r, seq: i + 1 });
});

const stalled = [];
for (const [promptId, group] of byPrompt) {
  const lastErrorAt = group.findLastIndex((r) => r.error);
  if (lastErrorAt === -1) continue; // Este prompt no tuvo ningún error
  if (lastErrorAt === group.length - 1) {
    // El error es el último registro de este prompt: sin acción posterior, estancamiento sospechoso
    const last = group[lastErrorAt];
    stalled.push({ promptId, sessionId: last.session_id, error: last.error, seq: last.seq });
  }
}

console.log('\n=== Estancamientos sospechosos (error sin registros posteriores) ===');
if (stalled.length === 0) {
  console.log('Ninguno');
} else {
  for (const s of stalled) {
    console.log(`prompt_id=${s.promptId} session_id=${s.sessionId} error=${s.error} (registro ${s.seq})`);
  }
}

console.log(`\nTotal ${records.length} registros, ${byPrompt.size} prompts, estancamientos sospechosos ${stalled.length}`);
process.exit(stalled.length > 0 ? 1 : 0);
```

Ejecutándolo en Node v26 produce esto (salida real):

```text
$ node stats.mjs agent.jsonl
=== Por tipo ===
model_call  count= 10 total_ms=  22470ms total_tokens=  53490 errors=0
tool_call   count= 10 total_ms=  48533ms total_tokens=      0 errors=1

=== Estancamientos sospechosos (error sin registros posteriores) ===
prompt_id=p-03 session_id=s-9c7 error=ETIMEDOUT (registro 14)

Total 20 registros, 4 prompts, estancamientos sospechosos 1

$ echo $?
1
```

**Por qué agrupar por `prompt_id` y no por `session_id`.** La guía oficial dice agrupar por session id y revisar si hay un evento de solicitud posterior al error[^S4], porque en ese contexto la sesión es la unidad de correlación. Aplicado a estos datos, la sesión `s-9c7` contiene dos prompts: p-03 dio error y se estancó a las 10:02, p-04 es un prompt completamente nuevo lanzado una hora y media después. Agrupar por sesión haría que los registros de p-04 parecieran «acción posterior» al error de p-03, y el estancamiento se perdería. Por qué ID agrupas depende de la frontera de la pregunta que estás haciendo — aquí la pregunta es «¿terminó este prompt?», así que la frontera es el prompt.

**`findLastIndex` es la clave.** La condición debe ser «el último registro tiene error», no «existe error». Escribir `group.some(r => r.error)` marcaría ejecuciones que dieron error y después se recuperaron y siguieron — exactamente los dos casos que esta lectura busca distinguir. Además, maneja los campos faltantes con `?? 0` en todas partes: los registros de herramienta no tienen campos de token, los de modelo no tienen `error`; sin atraparlos, `undefined + número` da `NaN`, que contamina toda la columna de agregación sin lanzar ninguna excepción.

**Construye un contraejemplo para confirmar que la detección realmente separa los dos casos.** Copia los datos, inserta un registro `model_call` de p-03 después de la línea 14 (simulando «el agente siguió después del error»), ejecuta de nuevo — la salida pasa a ser «Ninguno / Total 21 registros, 4 prompts, estancamientos sospechosos 0», código de salida 0. No te saltes este paso — un script de verificación que siempre devuelve 0 es lo mismo que no tener script de verificación. Con el 0/1 funcionando, el script se puede enchufar a cron, a CI o a cualquier sistema de «no-cero dispara alerta»; nota que solo emite la señal cruda — el sistema observado solo emite señales crudas; la detección de anomalías y las alertas son trabajo del backend[^S4].

<!-- hint -->

**Pista 1**: Constrúyelo en cuatro pasos, ejecutando después de cada uno para revisar la salida. Primero solo «leer, `JSON.parse`, imprimir el conteo» — confirma que sean 20. Después agrega la agregación por tipo usando un `Map` para guardar los acumuladores, con `?? 0` en cada campo faltante. Después haz el agrupamiento y la detección de estancamiento. Agrega `process.exit` solo al final. Escribir el script entero de una vez significa que cuando algo se rompa no podrás distinguir si falló el parseo o falló la agregación.

<!-- hint -->

**Pista 2**: El núcleo de la detección de estancamiento es una frase — **¿es el último registro de este prompt el que tiene `error`?**. `findLastIndex` devuelve el índice de la última coincidencia; compáralo con `group.length - 1` y tienes la respuesta. Fíjate especialmente en que el agrupamiento usa `prompt_id`: la sesión `s-9c7` contiene dos prompts; agrupar por `session_id` dejaría que los registros del segundo prompt «taparan» el estancamiento del primero. Después de escribirlo, acuérdate de hacer `echo $?` para revisar el código de salida — la salida en pantalla por sí sola no cuenta como verificación.

<!-- /exercises -->

## Resumen

- La observabilidad en producción debe responder cuatro preguntas: qué herramientas se llamaron, cuánto tardó cada solicitud al modelo, cuántos tokens se gastaron y dónde ocurrieron los fallos[^S6]. Estas cuatro y las métricas de evaluación del Curso 10 de esta serie (tiempo de ejecución de llamadas individuales y de tareas completas, conteo total de llamadas a herramientas, consumo total de tokens, errores de herramienta)[^S3] son el mismo conjunto de números — en evaluación los usas para juzgar si un cambio mejoró las cosas; en monitoreo los usas para vigilar la salud de las ejecuciones.
- El diseño de campos de log y la elección de JSONL no tienen especificación autorizada — es tu decisión de ingeniería. Punto de partida por defecto: un registro por solicitud al modelo, uno por llamada a herramienta, un objeto JSON por línea, con session id, prompt id, duración, conteos de tokens, nombre de herramienta y errores. Los logs en prosa solo los pueden leer humanos; los estructurados se pueden filtrar, agregar y analizar por distribución.
- El valor de las métricas está en que los patrones se mapean directamente a arreglos: muchas llamadas redundantes significan que hay que ajustar los parámetros de paginación o de límite de tokens; muchos errores de parámetro inválido significan que a las descripciones de las herramientas les falta claridad o ejemplos[^S3]. Rastrear las llamadas a herramientas también revela flujos de trabajo comunes de los agentes y oportunidades para consolidar herramientas[^S3]. Cuando una llamada a herramienta lanza un error, la respuesta en sí debería escribirse como una guía específica y accionable, no como un código de error opaco[^S3].
- La semántica de una señal la define cómo se registra. Claude Code reintenta internamente las solicitudes de API fallidas y emite un único evento `api_error` solo después de rendirse — es una señal terminal para esa solicitud; los reintentos intermedios no se registran por separado[^S4] — así que un «conteo de errores» puede esconder debajo muchos reintentos invisibles. Para distinguir si una sesión se recuperó o se estancó, agrupa los eventos por session id y revisa si existe un evento de solicitud posterior al error[^S4].
- Los tokens son la métrica que más vale la pena vigilar: en los datos de Anthropic, los agentes usan unas 4× los tokens del chat, y los sistemas multiagente unas 15×[^S1]. Al analizar el desempeño de la evaluación, encontraron que el uso de tokens por sí solo explica el 80% de la varianza, con el conteo de llamadas a herramientas y la elección de modelo como los otros dos factores explicativos[^S1]. Las métricas de costo son aproximaciones; la facturación oficial viene de tu proveedor de API[^S4]. El gasto se puede atribuir a cosas específicas como nombre de skill, nombre de plugin o tipo de subagente[^S4].
- Dos principios de contención: el sistema observado emite únicamente el flujo de eventos crudo; la detección de anomalías, el cálculo de líneas base y las alertas son responsabilidad del backend[^S4]. Los logs no deberían registrar contenido por defecto — los productos oficiales por defecto no recolectan el contenido de los prompts, solo el largo[^S4]; la telemetría por defecto registra solo información estructural, no lo que el agente lee y escribe[^S6]. Los umbrales de alerta y los SLO no tienen números en materiales autorizados — no los inventes; registra primero una línea base de dos semanas.

[>> Lección 4: Trazado: hilvanar una ejecución en un árbol](./04-tracing.md)
