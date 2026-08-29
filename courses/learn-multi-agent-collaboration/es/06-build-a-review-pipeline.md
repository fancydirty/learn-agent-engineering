# Lección 6: Práctica: Construir un pipeline de revisión de dos agentes

> Objetivos de aprendizaje:
> - Escribir un pipeline productor-revisor de dos agentes genuinamente ejecutable con la API de Claude
> - Lograr que el revisor devuelva un resultado de revisión estructurado y comprobable en lugar de un «se ve bien» generalizado
> - Poner una válvula de seguridad al bucle para que el productor y el revisor no puedan pulir de ida y vuelta para siempre
>
> Requisitos: haber terminado las Lecciones 1-5, poder leer JavaScript/Node.js básico, y tener una clave de API de Claude que funcione | Anterior: [Lección 5 <<](./05-failure-and-coordination.md)

## Primero, el resultado: una ejecución completa

Esto es lo que tendrás corriendo al final de la lección. Le entregas una tarea a la terminal, y dos agentes se turnan hasta que la revisión pasa o llegas al límite de rondas:

```
$ node review-pipeline.js "Escribe un anuncio de cambio de API para desarrolladores: el endpoint v2 cambia el campo user_id de número a cadena"

[Productor v1]
¡Ya llegó el endpoint v2! Experiencia enormemente mejorada — por favor cámbiate pronto a la nueva versión.

[Revisor ronda 1] Rechazado. Problemas:
- No detalla el campo específico que afecta este cambio (nunca menciona que user_id pasa de número a cadena)
- No da ningún consejo de migración; los desarrolladores no saben cómo actualizar su código
- «Experiencia enormemente mejorada» es una afirmación exagerada e inverificable, sin base concreta

[Productor v2]
Aviso de cambio de la API v2: el tipo del campo user_id cambia de number a string.
Revisa cada trozo de código que parsee este campo y cambia la lógica de lectura de numérica a cadena,
para evitar fallos de parseo por el desajuste de tipo. Este cambio entra en vigor en la v2.1.0.

[Revisor ronda 2] Aprobado

Borrador final (aprobado en la ronda 2):
Aviso de cambio de la API v2: el tipo del campo user_id cambia de number a string.
Revisa cada trozo de código que parsee este campo y cambia la lógica de lectura de numérica a cadena,
para evitar fallos de parseo por el desajuste de tipo. Este cambio entra en vigor en la v2.1.0.
```

La primera versión es rebotada por el revisor, con razones atadas a cada criterio específico; el productor la corrige hacia una segunda versión, el revisor mira de nuevo, y esta vez pasa. Este es el patrón **productor-revisor** de la Lección 4 convertido en código: "one LLM call generates a response while another provides evaluation and feedback in a loop."[^S2]

## La forma general: el mismo esqueleto que un bucle de ejecución

Si tomaste el curso Llamada a herramientas por el agente: hacer que los agentes hagan cosas de verdad de esta serie, el esqueleto de este pipeline te resultará familiar: un bucle, un juicio por ronda, un resultado que decide si seguir, más una válvula de seguridad contra el bucle infinito. La única diferencia es qué juzga el juicio — el bucle de ejecución de herramientas de aquel curso juzga «¿el modelo todavía quiere llamar a una herramienta?» (la semántica del bucle está en la lección El viaje completo de ida y vuelta de una llamada a herramienta de aquel curso y sus fuentes oficiales), mientras que aquí juzga «¿el revisor dijo que pasó?». Mismo esqueleto, distinto contenido en el cuerpo del bucle.

Todo el pipeline son tres funciones cosidas juntas: `runProducer` genera o corrige el texto, `runReviewer` lo puntúa contra criterios y da notas específicas, y `runPipeline` enlaza las dos en un bucle con un techo de rondas como válvula de seguridad.

## Paso 1: El productor — toma la tarea, produce el texto

En su primera ejecución el productor tiene solo la tarea en sí; en una segunda ejecución tras un rechazo, también lleva la **versión anterior completa** y las notas de revisión, para que el productor corrija sobre la última versión según las notas en lugar de improvisar desde cero:

```js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5"; // reemplaza por un modelo que tu cuenta pueda llamar
const MAX_ROUNDS = 3; // válvula de seguridad: el productor-revisor pule a lo sumo 3 rondas, para evitar un bucle infinito

async function runProducer(task, feedback, prevDraft) {
  const prompt = feedback
    ? `Tarea: ${task}\n\nTu versión anterior fue:\n"""\n${prevDraft}\n"""\n\nEl revisor la rechazó con estas notas:\n${feedback}\n\nCorrige tu versión anterior según estas notas. Devuelve solo el texto corregido completo, sin explicación adicional.`
    : `Tarea: ${task}\n\nDevuelve solo el texto, sin explicación adicional.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "";
}
```

El prompt del productor es autocontenido. Como cubrió la Lección 3, un subagente no puede ver lo que pasó del lado del orquestador, y tampoco puede ver cómo fue revisado la última vez[^S3]. Así que cada llamada escribe «cuál es la tarea», «qué decía la versión anterior» y «(si lo hubo) cuáles fueron los problemas de la ronda pasada» de forma literal en el prompt de esta llamada. Fíjate en que hasta el propio borrador anterior del productor tiene que pasarse de forma explícita — esta es la mitad del principio de autocontención que más fácil se pasa por alto: la API de Messages es sin estado, cada petición debe llevar el historial completo que necesita, y el servidor no guarda nada entre peticiones[^S8]. «Corrige tu versión anterior» solo significa algo cuando la versión anterior fue realmente escrita en este prompt.

## Paso 2: El revisor — puntúa contra criterios concretos, sin veredictos vagos

El revisor no se limita a preguntarle al modelo «¿esto está bien?». Como cubrió la Lección 5, la verificación tiene que aterrizar en criterios concretos y comprobables en lugar de una puntuación por impresión[^S1]. Aquí el revisor recibe una lista de comprobación explícita y se le exige responder en un formato JSON fijo:

```js
const REVIEW_CRITERIA = [
  "¿Indica con claridad el campo o endpoint específico que afecta este cambio (no solo 'algo cambió' o 'mejor experiencia')?",
  "¿Da consejo de migración concreto, diciéndoles a los desarrolladores cómo actualizar su código?",
  "¿Se mantiene todo el anuncio por debajo de las 150 palabras?",
  "¿Hay alguna afirmación exagerada e inverificable (como 'enormemente mejorada' sin base concreta)?",
];

async function runReviewer(task, draft) {
  const prompt = `Eres el revisor. Solo encuentras problemas; no reescribes. Requisitos de la tarea: ${task}

Criterios de revisión (comprueba cada uno; no des un veredicto vago):
${REVIEW_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Texto a revisar:
"""
${draft}
"""

Responde estrictamente en el formato JSON de abajo, sin texto fuera del JSON:
{"approved": true o false, "issues": ["enumera cada criterio que falló, con el problema específico de cada uno; si todos pasan, da un arreglo vacío"]}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "{}";
}
```

Juntos, los campos `approved` e `issues` conforman un **resultado de revisión estructurado**: no un único «está bien», sino «pasa o falla» más «el problema específico detrás de cada criterio fallido». Una vez que el productor tiene `issues`, corrige esos problemas específicos en lugar de adivinar hacia dónde ir a partir de un veredicto vago.

## Paso 3: No confíes ciegamente en el resultado de la revisión — trata un fallo de parseo como un rechazo

`runReviewer` devuelve una cadena, no un objeto JSON real, así que todavía hay que parsearla. Aunque al revisor se le diga que «responda estrictamente en JSON», sin una restricción de salida estructurada el modelo todavía puede producir JSON sintácticamente inválido, dejar caer campos, o envolver el JSON en un bloque de código con unas líneas de explicación alrededor[^S9]. La trampa aquí es: ¿qué pasa cuando el parseo falla? Tomar la ruta perezosa — dejarlo pasar por defecto ante un fallo de parseo — convierte en silencio un fallo de «el revisor no hizo su trabajo» en «revisión aprobada». Ese es justo el punto que planteó la Lección 5: una salida que «parece» terminada no es lo mismo que una salida que de verdad es correcta, y lo que no puedas verificar no deberías entregarlo[^S6]. Aquí hacemos lo contrario: un fallo de parseo siempre cuenta como un **rechazo**, nunca como un aprobado:

```js
function extractJson(raw) {
  // El modelo a veces envuelve el JSON en un bloque de código; intenta quitar la cerca primero
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
}

function parseReview(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.issues)) {
      throw new Error("la forma del campo es incorrecta");
    }
    return parsed;
  } catch (err) {
    return {
      approved: false,
      issues: [`El revisor no respondió en el formato acordado. Contenido en bruto: ${raw.slice(0, 200)}`],
    };
  }
}
```

Las líneas `typeof parsed.approved !== "boolean"` y `!Array.isArray(parsed.issues)` extienden la misma idea — incluso cuando `JSON.parse` tiene éxito, todavía confirmas que los campos parseados tengan la forma correcta, y un tipo de campo incorrecto también cuenta como un rechazo. No bajes la guardia solo porque sea «al menos JSON válido».

Un apunte al margen: hay una función oficial de salidas estructuradas que garantiza, a nivel de muestreo, que la respuesta coincida estrictamente con un esquema[^S9]. Esta lección usa a propósito el estilo de «llamada pelada más tu propio parseo defensivo» para que sientas de primera mano que la salida del modelo no se puede confiar a ciegas; en producción puedes usar salidas estructuradas para eliminar este bache por completo.

## Paso 4: Conéctalo en un bucle, agrega la válvula de seguridad

Con `runProducer`, `runReviewer` y `parseReview` en mano, `runPipeline` conecta las tres, y `MAX_ROUNDS` es la única válvula de seguridad aquí — el productor y el revisor podrían en teoría pulir para siempre, así que tiene que haber un techo:

```js
async function runPipeline(task) {
  let draft = await runProducer(task);
  console.log(`[Productor v1]\n${draft}\n`);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const review = parseReview(await runReviewer(task, draft));

    if (review.approved) {
      console.log(`[Revisor ronda ${round}] Aprobado`);
      return { draft, rounds: round, approved: true };
    }

    console.log(`[Revisor ronda ${round}] Rechazado. Problemas:\n- ${review.issues.join("\n- ")}\n`);

    if (round === MAX_ROUNDS) {
      return { draft, rounds: round, approved: false, issues: review.issues };
    }

    draft = await runProducer(task, review.issues.join("\n"), draft);
    console.log(`[Productor v${round + 1}]\n${draft}\n`);
  }
}

const task =
  process.argv[2] ??
  "Escribe un anuncio de cambio de API para desarrolladores: el endpoint v2 cambia el campo user_id de número a cadena";

runPipeline(task)
  .then((result) => {
    if (result.approved) {
      console.log(`Borrador final (aprobado en la ronda ${result.rounds}):\n${result.draft}`);
    } else {
      console.log(
        `Se alcanzó el máximo de rondas (${MAX_ROUNDS}) sin pasar la revisión. Se emite la última versión para revisión humana:\n${result.draft}\n\n` +
          `Problemas sin resolver en la última ronda:\n- ${result.issues.join("\n- ")}`
      );
    }
  })
  .catch((err) => {
    // La propia llamada a la API también puede fallar (red, autenticación, límite de tasa); no te la tragues en silencio tampoco
    console.error(`La ejecución del pipeline falló: ${err.message}`);
    process.exitCode = 1;
  });
```

Cuando llega a `MAX_ROUNDS` todavía sin pasar, `runPipeline` no fuerza un veredicto de «aprobado». Entrega honestamente el último borrador y los problemas aún sin resolver para revisión humana — esto también es el punto de la Lección 5 aplicado al paso de cierre: cuando la etapa de integración de resultados se topa con algo que no puede juzgar, no debería taparlo decidiendo por sí misma en código.

```agentmentor-check
{
  "id": "mac-zh-06-invalid-review-json",
  "label": "El revisor no respondió en el formato acordado — qué deberías hacer",
  "prompt": "Mientras ejecutas este pipeline, el revisor una vez no responde en JSON estricto y en su lugar agrega una línea, «Le eché un vistazo rápido, el contenido está básicamente bien», lo que hace que `JSON.parse` lance un error. Para mantener el pipeline en marcha, ¿deberías tratar este fallo de parseo como una revisión aprobada?",
  "whyHere": "«Solo trátalo como aprobado para que el programa siga corriendo» es una jugada tentadora y de bajo esfuerzo justo cuando el parseo falla; este es el punto para usar el principio de la Lección 5 — «una salida que parece razonable no es lo mismo que una salida que de verdad es correcta» — para rebatir esa idea, y para probar si puedes aplicar ese principio al código que escribes tú mismo",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sí — el revisor sí dijo «básicamente bien», así que déjalo pasar y evita que el pipeline se atasque",
      "correct": false,
      "feedback": "Esto es exactamente la brecha de confiar-entonces-verificar contra la que advirtió la Lección 5. Que el revisor no responda en el formato JSON acordado significa que esta vez no comprobó cada criterio contra el estándar, y un «básicamente bien» en lenguaje natural no puede sustituir a un resultado de revisión estructurado. Tratar un fallo de parseo como un aprobado reempaqueta en silencio un fallo de «el revisor no hizo su trabajo» como «revisión aprobada» y lo sirve."
    },
    {
      "id": "b",
      "text": "Sí — mientras el texto del propio productor se vea bien, el formato en que responde el revisor no importa",
      "correct": false,
      "feedback": "El formato de respuesta del revisor es precisamente la única señal que el pipeline usa para decidir «pasa o falla» de forma automática. Si el formato se puede ignorar a voluntad y aun así contar como un aprobado, el paso de revisión es una cáscara vacía, y los criterios de revisión estructurados que diseñaste pierden su sentido."
    },
    {
      "id": "c",
      "text": "No — un fallo de parseo debería contar como un rechazo; registra la respuesta en bruto como un problema y reintenta, o escala a un humano",
      "correct": true,
      "feedback": "Correcto. Un formato de resultado de revisión incorrecto es en sí mismo una situación de «no puedo verificar esto», y por el principio de la Lección 5, lo que no puedas verificar no deberías entregarlo. Así es como `parseReview` lo maneja en esta lección: un fallo de parseo siempre devuelve `approved: false` y registra el contenido en bruto como un problema, así que el flujo continúa como un rechazo en lugar de dejarlo pasar en silencio."
    }
  ]
}
```

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Ponlo a correr, luego agrega un criterio de revisión

Ensambla el código de esta lección en un `review-pipeline.js`, ejecuta `npm install @anthropic-ai/sdk`, `npm pkg set type=module`, define `ANTHROPIC_API_KEY`, y corre una vez la tarea de ejemplo de esta lección. Confirma que ves al menos una ronda «Rechazado» antes de ver «Aprobado». (Si la primera versión del productor pasa de largo, cambia por una tarea más fácil de tropezar — por ejemplo, pide a propósito «un anuncio muy corto» sin decir qué tan corto.)

Una vez que corra, agrega un nuevo criterio a `REVIEW_CRITERIA`: «¿Menciona el texto el número de versión específico donde el cambio entra en vigor?». Córrelo de nuevo y confirma que los `issues` del revisor ahora incluyen una nota atada a este nuevo criterio.

<!-- rubric -->
- El pipeline corre de verdad, y el log muestra la primera versión del productor más al menos una ronda de notas de revisión
- El criterio de revisión agregado sí cambia el resultado de la revisión — un borrador al que le falta esa información queda marcado
- Puedes explicar qué emite finalmente el pipeline si nunca pasa y llega a `MAX_ROUNDS` (no un crash, sino entregar la última versión y los problemas sin resolver)

<!-- answer -->
Agrega un ítem más al arreglo `REVIEW_CRITERIA`:

```js
const REVIEW_CRITERIA = [
  "¿Indica con claridad el campo o endpoint específico que afecta este cambio (no solo 'algo cambió' o 'mejor experiencia')?",
  "¿Da consejo de migración concreto, diciéndoles a los desarrolladores cómo actualizar su código?",
  "¿Se mantiene todo el anuncio por debajo de las 150 palabras?",
  "¿Hay alguna afirmación exagerada e inverificable (como 'enormemente mejorada' sin base concreta)?",
  "¿Menciona el texto el número de versión específico donde el cambio entra en vigor?",
];
```

No necesitas tocar nada de código en `runReviewer` ni en `runPipeline` — los criterios de revisión se insertan en el prompt del revisor vía una plantilla de cadena, así que agregar un elemento al arreglo significa que el revisor comprueba la nueva lista completa, ítem por ítem, en su siguiente llamada. Si el borrador del productor sigue sin mencionar un número de versión, `issues` llevará una nota específica para este criterio, y el productor corrige hacia esa nota en la siguiente ronda.

<!-- hint -->
Si notas que la primera versión del productor pasa de largo y nunca ves una línea de log «Rechazado», la tarea es demasiado fácil de satisfacer para el productor — intenta hacer más estrictos los criterios de revisión, o agregar a la tarea un requisito específico que el productor tienda a pasar por alto en su primera pasada.

<!-- hint -->
Cuando llega a `MAX_ROUNDS` todavía sin pasar, mira de nuevo el último tramo de `runPipeline` — no lanza un error ni hace crashear el programa. Retorna con normalidad con `approved: false` más el último borrador y la lista de problemas, dejando que el código que llama decida qué hacer.

### Nivel 2: Rompe algo a propósito, luego arréglalo

La versión de `parseReview` de abajo tiene un problema. Primero explica la situación en la que dejaría pasar como «aprobado» un borrador que nunca fue realmente revisado, luego da el código arreglado.

```js
// La versión rota
function parseReview(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { approved: true, issues: [] };
  }
}
```

<!-- rubric -->
- Nombra el problema con precisión: ante un fallo de parseo devuelve `approved: true`, lo que trata un fallo de «el revisor no respondió en el formato acordado» como «revisión aprobada»
- Explica la consecuencia concreta que esto trae (atándola al principio de la Lección 5 de «no puedes confiar a ciegas»)
- El arreglo cambia el respaldo ante fallo de parseo a `approved: false` y registra el contenido en bruto en `issues`, para triaje o para un reintento del productor

<!-- answer -->
El problema es que la rama `catch` fija el respaldo en `{ approved: true, issues: [] }`. Siempre que el revisor no responda en JSON esta vez (aunque solo haya agregado una línea de charla), `JSON.parse` lanza un error, y la rama `catch` marca de inmediato como «aprobado» un borrador que «nunca fue revisado de forma efectiva» y lo deja pasar. Esto es exactamente lo que advirtió la Lección 5: una salida que «parece» terminada no es lo mismo que una salida que de verdad es correcta, y una situación que no puedes verificar no debería tomarse como un resultado aprobado y entregarse.

El arreglo es hacer que un fallo de parseo siempre cuente como un rechazo:

```js
function parseReview(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.issues)) {
      throw new Error("la forma del campo es incorrecta");
    }
    return parsed;
  } catch (err) {
    return {
      approved: false,
      issues: [`El revisor no respondió en el formato acordado. Contenido en bruto: ${raw.slice(0, 200)}`],
    };
  }
}
```

<!-- hint -->
Ponte en el caso específico en que el revisor «no respondió en el formato acordado» — si el respaldo es «aprobado», ese borrador se sirvió sin ninguna comprobación efectiva en absoluto, sin diferencia de que el revisor nunca hubiera corrido.

<!-- hint -->
Para decidir cuál debería ser el respaldo, dale la vuelta a la pregunta: ¿un fallo de parseo está más cerca de «confirmado sin problemas», o de «no puedo confirmar si hay un problema»? La respuesta de la Lección 5: si no puedes confirmarlo, no lo trates como sin-problemas.

<!-- /exercises -->

## Resumen

- El esqueleto del pipeline productor-revisor es la misma cosa que un bucle de ejecución: un bucle, un juicio por ronda, un resultado que decide si seguir, más una válvula de seguridad contra el bucle infinito. La definición oficial de este patrón es exactamente "one LLM call generates a response while another provides evaluation and feedback in a loop"[^S2] — aquí el juicio cambia de «¿debería llamarse a una herramienta?» a «¿el revisor dijo que pasó?».
- El prompt del productor es autocontenido: cada llamada escribe la tarea, la versión anterior completa, y (si los hubo) los problemas específicos de la ronda pasada de forma literal en el prompt — la API de Messages es sin estado, cada petición debe llevar el historial completo, y nada se guarda entre peticiones[^S8], así que no puedes contar con que el modelo recuerde por su cuenta lo que pasó la ronda pasada[^S3].
- El revisor puntúa contra criterios concretos y comprobables, ítem por ítem, y devuelve un `{approved, issues}` estructurado en lugar de un veredicto generalizado[^S1].
- Lo que el revisor devuelve tampoco se puede confiar a ciegas — un fallo de parseo o una forma de campo incorrecta debería contar como un rechazo, no como un aprobado silencioso[^S6]; este principio aplica no solo a «confiar en lo que dice un subagente» sino también a «confiar en el formato de datos que devuelve un subagente».
- Cuando llega al máximo de rondas todavía sin pasar, el pipeline debería entregar honestamente el último borrador y los problemas sin resolver para revisión humana, en lugar de decidir un aprobado por sí mismo en código.

Eso es todo lo de las seis lecciones de este curso: desde «por qué varios agentes», pasando por cómo el orquestador y los subagentes reparten el trabajo, cómo escribir prompts de delegación, qué patrón de colaboración encaja con qué escenario, y cómo manejar los fallos, terminando con construir a mano un pipeline productor-revisor que funciona. Lo más valioso que puedes hacer a continuación no es releer las explicaciones — es tomar una tarea pequeña y real que tengas a mano, dejarla caer en este esqueleto de pipeline, ajustar los criterios de revisión, y correrlo para ver si rebota el borrador y cuántas veces. Ajustar tú mismo los criterios de revisión una vez vale más que releer la teoría diez veces.
