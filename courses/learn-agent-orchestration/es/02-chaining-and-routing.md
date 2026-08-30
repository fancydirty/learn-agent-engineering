# Lección 2: Encadenar y enrutar: encadenamiento y enrutamiento

> Objetivos de aprendizaje:
> - Partir un prompt de cuatro tareas en una cadena y enunciar qué estás intercambiando y qué estás ganando
> - Instalar compuertas programáticas entre las etapas de la cadena para que los resultados intermedios que no califican se detengan donde corresponde
> - Decidir cuándo una tarea necesita encadenamiento, enrutamiento, ambos o ninguno, y escribir la llamada de enrutamiento como una sola llamada barata con la salida apretada
>
> Requisitos: Leíste la Lección 1, puedes escribir a mano un bucle de arnés impulsado por `stop_reason` (curso 7 de esta serie), entiendes los verificadores deterministas (curso 10 de esta serie) | Anterior: [<< Lección 1](./01-when-one-loop-isnt-enough.md) | Siguiente: [Lección 3 >>](./03-parallelization.md)

## Un solo prompt haciendo cuatro cosas: una se va a caer

Necesitas escribir la documentación de ayuda de una función nueva: leer los requisitos del producto → redactar un esquema → escribir el texto completo a partir del esquema → revisar el documento en busca de terminología obsoleta.

Tu primera versión probablemente meta los cuatro pasos en un solo prompt y se lo entregue a un bucle de arnés. La primera ejecución se ve bien. El problema aparece en la segunda, y en la tercera: esta vez el esquema es bueno pero al texto le falta una sección; la siguiente vez el texto está completo pero viene mezclado con «grupos de usuarios», que quedaron obsoletos en la versión anterior; después reescribe el esquema a mitad de camino y entrega un esquema que no coincide con el texto.

Estas fallas se ven distintas en la superficie, pero comparten la misma raíz: en una sola llamada, el modelo tiene que hacer malabares al mismo tiempo con entender los requisitos, diseñar la estructura, generar el texto y hacer revisiones de consistencia. No puedes controlar cuál queda apretada hasta salirse, y no puedes verlo ocurrir. Peor todavía, no tienes ningún lugar donde intervenir: para cuando tienes la salida, las cuatro cosas ya están hechas, y «el esquema no cumplió la especificación» quedó enterrado dentro del borrador final.

La Lección 1 habló del eje de «quién tiene el plan». Este prompt de un solo tiro le entrega el plan entero al modelo. Lo primero que hace esta lección es recuperarlo.

## Encadenamiento: cambiar latencia por precisión

La definición oficial de este patrón son solo dos oraciones, y cada palabra carga peso.

El encadenamiento de prompts descompone una tarea en una secuencia de pasos, donde cada llamada al LLM procesa la salida de la anterior. Puedes añadir comprobaciones programáticas (ver "gate" en el diagrama de abajo) en cualquier paso intermedio para asegurarte de que el proceso sigue en curso[^S1]. Cuándo usar este flujo de trabajo: este flujo de trabajo es ideal para situaciones donde la tarea se puede descomponer fácil y limpiamente en subtareas fijas. El objetivo principal es cambiar latencia por mayor precisión, haciendo de cada llamada al LLM una tarea más fácil[^S1].

«Hacer de cada llamada al LLM una tarea más fácil»: esa media oración te da a la vez el diagnóstico y la cura. Una llamada que hace cuatro cosas es una tarea difícil; una llamada que solo redacta un esquema y no escribe nada más es una tarea fácil. El encadenamiento no reduce el trabajo: hace más simple el trabajo que el modelo tiene que completar en cada llamada.

El costo viene impreso en la etiqueta de precio: latencia. Cada etapa adicional suma una ida y vuelta completa. Anthropic dejó planteada esta contabilidad al principio del mismo artículo: los sistemas agénticos a menudo intercambian latencia y costo por un mejor desempeño en la tarea, y habría que considerar cuándo tiene sentido ese intercambio[^S1]. «Lento y caro» no es un efecto secundario accidental del encadenamiento.

```text
Requisitos ──▶ Redactar esquema ──▶ Escribir texto ──▶ Revisar términos ──▶ Entregar
```

La entrada de cada segmento es la salida del segmento anterior. Si un eslabón se tuerce, todo lo que viene después lo sigue.

## Cada etapa es un bucle de arnés completo

Una etapa de la cadena no es «una llamada a la API»: es **un bucle de arnés completo**. El mismo bucle while que escribiste a mano en el curso 7 de esta serie: envía los mensajes, revisa `stop_reason`, si es `tool_use` entonces ejecuta la herramienta y devuelve el resultado, si no, devuelve el texto.

Este uso tiene una fuente. Cuando Anthropic describió cómo evaluar agentes, la configuración recomendada era exactamente esta forma: llamadas directas a la API del LLM, bucles agénticos simples (bucles while que envuelven llamadas alternadas a la API del LLM y a herramientas), un bucle por tarea de evaluación, y a cada agente de evaluación se le da un solo prompt de tarea y tus herramientas[^S3]. Aquel artículo trataba de evaluación, pero el bloque de construcción en sí es de propósito general: una tarea, un bucle, impulsado por código. El encadenamiento es ensartar estos bloques con el código decidiendo el orden.

El resto de las lecciones usa la misma notación:

```javascript
// runAgent es el bucle de arnés del curso 7 envuelto en una función
// Entrada: un prompt de tarea autocontenido + las herramientas disponibles para esta etapa; salida: el texto final tras ejecutar hasta terminar
const answer = await runAgent(client, task, tools);
```

La cadena entera es código secuencial que puedes leer de un vistazo:

```javascript
const outline = await runAgent(client, outlineTask(req));
const g1 = gateOutline(outline);        // Compuerta 1: ¿la estructura del esquema es correcta?
if (!g1.ok) fail(g1.why);               // Si no, detente aquí: no lo mandes aguas abajo

const doc = await runAgent(client, writingTask(outline));
const g2 = gateTerms(doc);              // Compuerta 2: ¿contiene términos obsoletos prohibidos?
if (!g2.ok) fail(g2.why);

const report = await runAgent(client, checkTask(doc), { read_glossary });
```

Fíjate en lo que **no** está en estas líneas: no hay espacio para «el modelo decide qué hacer a continuación». La secuencia está fijada en duro, y los resultados intermedios `outline` y `doc` son variables corrientes del script. El modelo sigue siendo autónomo dentro de cada etapa (puede llamar a herramientas tantas veces como quiera), pero el control entre etapas está en manos del código. Un beneficio adicional: el prompt de cada etapa puede ser estricto en una sola cosa. El prompt del esquema exige solo títulos y prohíbe cualquier texto de cuerpo; el prompt de escritura se concentra en el estilo y en los términos prohibidos; estos dos conjuntos de requisitos chocarían si se empacaran en un solo prompt.

Esta forma aparece también en los productos. La documentación oficial de Claude Code recomienda, para los flujos de trabajo de varios pasos, que Claude use subagentes de forma secuencial, y que cada uno complete su tarea y devuelva los resultados a Claude, que luego pasa el contexto relevante al siguiente subagente[^S4]. La diferencia aterriza sobre el eje de la Lección 1: en la forma de producto, Claude decide «qué pasar»; cuando escribes el script, eso es tu código.

## Compuertas: mover los verificadores del curso 10 entre etapas

La última media oración de la definición es lo que el encadenamiento de verdad añade por encima de «un prompt grande»: puedes añadir comprobaciones programáticas en cualquier paso intermedio para asegurarte de que el proceso sigue en curso[^S1]. El texto original llama a estas comprobaciones "gate", y va entre comillas: `(see "gate" in the diagram below)` —una recta, una curva, exactamente como en la fuente, no es una errata de aquí—.

«Programáticas» es la clave: es código, no otra llamada al modelo, apenas unos cuantos `if`.

El curso 10 de esta serie enseñó verificadores deterministas: cuando algo se puede juzgar como correcto o incorrecto con código, no gastes dinero preguntándole al modelo. Aquel curso instalaba los verificadores en el **estado final**: después de que todo se ejecuta, revisar si la salida es aceptable. El encadenamiento le ofrece a esa misma comprobación una ubicación nueva: **entre etapas**.

```javascript
function gateTerms(doc) {
  const hits = BANNED.filter((w) => doc.includes(w));
  if (hits.length > 0) {
    return { ok: false, why: `El documento contiene términos obsoletos prohibidos: ${hits.join(', ')}` };
  }
  return { ok: true };
}
```

Siete líneas, ni una sola llamada al modelo, y la misma entrada produce siempre el mismo juicio. Bloquea exactamente esa falla del «texto mezclado con términos obsoletos»; una compuerta que cuente cuántos títulos de capítulo hay en el esquema es igual de simple.

Qué hacer cuando una compuerta falla es una decisión de diseño: **detenerse y reportar el error** (lo mejor mientras todavía estás afinando esta cadena, pero el mensaje de falla tiene que decir qué etapa falló, si no solo sabes «no funcionó», no qué prompt de etapa arreglar), **realimentar el motivo de la falla al prompt de la misma etapa y reintentar** (con un tope de reintentos), o **registrarlo y continuar con un valor de repliegue** (solo cuando esta etapa no carga peso). El ejercicio de Nivel 2 usa el primer enfoque.

Esto además salda la cuenta del curso 6 de esta serie: el trabajo que delegas tiene que llevar prompts autocontenidos —objetivo, formato de salida, herramientas disponibles, límites, los cuatro escritos—. La tarea de cada etapa es un prompt de delegación con exactamente esa forma. Estos cuatro elementos tienen una fuente primaria precisa, que la Lección 4 desglosará punto por punto cuando cubra cómo delegan los orquestadores.

## Enrutamiento: primero clasificar, luego despachar

El encadenamiento se ocupa de «una tarea partida en pasos». Otra clase de tareas tiene una forma completamente distinta: lo que entra no es una cosa, son varias clases de cosas, cada una con su propio tratamiento.

La definición oficial: el enrutamiento clasifica una entrada y la dirige hacia una tarea de seguimiento especializada. Este flujo de trabajo permite la separación de responsabilidades y construir prompts más especializados. Sin este flujo de trabajo, optimizar para un tipo de entrada puede perjudicar el desempeño en otras entradas[^S1].

La última oración es la razón de que exista el enrutamiento. Supón que los correos de clientes caen en tres categorías: reembolso, incidencia, facturación. Usas un solo prompt para manejar todo. Para manejar bien los reembolsos añades una línea: «confirma primero el número de pedido y el canal de pago»; esta regla es puro ruido para los correos de incidencia, y el modelo la usará para pedirle el canal de pago a alguien que reporta una página en blanco. Añades otra línea, «si es una incidencia, no pidas el número de pedido», y el prompt empieza a criar parches sobre parches.

Cuándo usar este flujo de trabajo: el enrutamiento funciona bien para tareas complejas donde hay categorías distintas que conviene manejar por separado, y donde la clasificación se puede resolver con precisión, ya sea con un LLM o con un modelo o algoritmo de clasificación más tradicional[^S1]. Esa última precondición no es la guinda del pastel: si la clasificación se equivoca, se equivoca de forma sigilosa —un correo de reembolso enrutado al flujo de incidencias recibe una respuesta concienzuda de diagnóstico técnico—.

En código, el enrutamiento es más simple que el encadenamiento:

```javascript
const HANDLERS = {
  refund: handleRefund,
  incident: handleIncident,
  billing: handleBilling,
  other: handleFallback,
};
const LABELS = Object.keys(HANDLERS);

async function classify(client, letter) {
  const raw = await runAgent(client, [
    'Objetivo: Clasifica el correo de cliente de abajo.',
    `Formato de salida: Devuelve una sola palabra, elegida entre: ${LABELS.join(', ')}. Sin explicación, sin puntuación.`,
    `Correo: ${letter}`,
  ].join('\n'));

  const label = raw.trim();
  return LABELS.includes(label) ? label : 'other';   // Si no encaja en la tabla, al repliegue
}

const category = await classify(client, letter);
const reply = await HANDLERS[category](client, letter);
```

Tres cosas que vale la pena notar.

**Aprieta la salida de la llamada de clasificación a una sola palabra**: el curso 10 de esta serie usó el mismo truco al hablar de los jueces LLM —enumera los valores permitidos, di que no haya explicación; apretar la salida vuelve determinista el paso de análisis sintáctico—. **Si no encaja en la tabla, al repliegue**: esa línea `LABELS.includes(label) ? label : 'other'` no es pedantería defensiva. El modelo ocasionalmente devuelve «creo que podría ser incidencia, o quizá otra cosa», y entonces `HANDLERS[esa cadena entera]` es `undefined` y la línea siguiente se cae. Deja una rama de repliegue y la incertidumbre de la clasificación queda contenida en esta única línea.

**El clasificador no tiene por qué ser un modelo**: la definición dice explícitamente que los modelos o algoritmos de clasificación tradicionales también cuentan[^S1]. Si el correo lleva un formato fijo de número de pedido o viene de un punto de entrada de formulario dedicado, una sola expresión regular alcanza y es mucho más rápida.

Después del despacho, cada manejador puede ser cualquier cosa: un bucle de arnés, una cadena, incluso un tramo de código completamente sin modelo.

```agentmentor-check
{
  "id": "orc-zh-02-chain-vs-one-prompt",
  "label": "Tres llamadas frente a un prompt grande",
  "prompt": "Partiste en tres etapas la cadena de escritura del documento. Tu colega la lee y dice: «Partirla en tres etapas significa llamar al modelo tres veces: lento y caro. Un prompt grande, y que el modelo siga los tres pasos por su cuenta, ¿no funcionaría igual?». ¿Cómo respondes?",
  "whyHere": "La cadena, las compuertas y el enrutamiento ya están cubiertos; este es el lugar adecuado para alinear a la vez la contabilidad del costo y las precondiciones para partir. Ambas partes tienen razón solo a medias.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Tiene razón. Los modelos de hoy son lo bastante fuertes: si escribes los pasos con claridad en un solo prompt, el modelo los seguirá en orden, con el mismo efecto que partirlo pero ahorrando dos idas y vueltas de tiempo y dinero.",
      "correct": false,
      "feedback": "Esta es exactamente la forma de la falla del escenario inicial. El posicionamiento oficial del encadenamiento es hacer de cada llamada al LLM una tarea más fácil; en una sola llamada, el modelo todavía tiene que hacer malabares al mismo tiempo con entender los requisitos, diseñar la estructura, generar el texto y revisar la terminología, y no puedes controlar cuál queda apretada hasta salirse."
    },
    {
      "id": "b",
      "text": "Partir siempre es mejor. Más llamadas al modelo significan más oportunidades de pensar. Que la tarea se pueda descomponer limpiamente da igual: parte todo lo que puedas y la precisión sube sola.",
      "correct": false,
      "feedback": "Demasiado absoluto. La precondición oficial del encadenamiento es que la tarea se pueda descomponer fácil y limpiamente en subtareas fijas; las tareas que no se pueden partir limpiamente perderán información atascada entre etapas. Y el costo que preocupa a tu colega también es dinero real."
    },
    {
      "id": "c",
      "text": "Lo de lento y caro es real: el posicionamiento del encadenamiento es justamente cambiar latencia por precisión; pero un prompt grande no tiene dónde poner comprobaciones programáticas, así que un esquema que no califica va a seguir bajando hasta el final.",
      "correct": true,
      "feedback": "Bien. Se reconocen las dos cosas: el costo es lo que el encadenamiento cotiza explícitamente, y lo que se gana al partir no son solo tareas más fáciles por llamada, sino también las posiciones donde puedes instalar comprobaciones programáticas; un prompt de un solo tiro ni siquiera te da un lugar donde intervenir. La precondición también importa: si no se puede partir limpiamente, no lo fuerces."
    }
  ]
}
```

## Dos variantes de enrutamiento en el vocabulario actual de la API

La definición de enrutamiento de arriba viene del artículo de patrones de finales de 2024, que lleva un cartel diciendo que sus descripciones del ecosistema de herramientas están desactualizadas. Así que vale la pena comprobarlo: ¿este patrón sigue vivo en el vocabulario actual de primera mano? Sí, y se lo nombra explícitamente. La documentación de orquestación multiagente de la plataforma Claude tiene dos entradas que son enrutamiento:

- **Especialización (Specialization)**: Enrutar hacia agentes con prompts de sistema y herramientas centrados en un dominio, como un agente de seguridad o un agente de documentación, en lugar de cargar un solo agente con todas las capacidades[^S6]. Esta es la formulación oficial de la tabla `HANDLERS`.
- **Escalamiento (Escalation)**: Consultar a un agente o modelo más capaz para un subconjunto de subtareas complejas[^S6].

La segunda merece mención aparte: despacha por **dificultad**, no por **tema**. El clasificador no juzga «¿esto es reembolso o incidencia?» sino «¿este correo lo puede manejar mi nivel barato?». Esto es más difícil de juzgar con precisión que la clasificación por tema, así que el camino de escalamiento tiene una escritura más estable: ejecuta primero el nivel barato, y si la salida no pasa la compuerta entonces escala; cambias un problema de clasificación difícil de juzgar por un problema de verificación comprobable.

## Saber cuándo no partir

**Cada eslabón de la cadena suma latencia.** Esto no es una implementación sin optimizar, es el precio que fija la definición oficial: cambiar latencia por mayor precisión[^S1]. La persona usuaria espera la suma de cada segmento. Si está esperando de forma síncrona los resultados en una interfaz, antes de añadir otro eslabón a la cadena, considera si sigue ahí.

**Cuando solo hay una categoría, el enrutamiento es puro sobrecosto.** El beneficio del enrutamiento viene de la separación de responsabilidades[^S1]. Si la entrada de verdad tiene un solo tipo, pagaste el costo y la latencia de una llamada de clasificación y no recibiste nada a cambio, más una oportunidad extra de clasificar mal.

**Cuando la tarea no se puede partir limpiamente, no la fuerces.** La condición «descomponer fácil y limpiamente en subtareas fijas» tiene dientes[^S1]. Un borrador que necesita mirar el panorama completo de ida y vuelta para revisarse bien, si lo partes en «primero revisar la estructura, luego revisar la redacción», la segunda etapa no tiene acceso a las razones que la primera etapa no escribió, y solo revisará según el texto literal. En este caso un bucle, un contexto, es de hecho mejor: este es exactamente el uso de las condiciones inversas de la Lección 1.

**Cuando tengas dudas, mide primero.** Anthropic lo dijo dos veces: habría que considerar añadir complejidad solo cuando mejora demostrablemente los resultados[^S1]. La vía de evaluación del curso 10 de esta serie está construida para esto: ejecuta la versión de un solo prompt y saca una puntuación, ejecuta la versión partida y saca otra, mira cuánta diferencia hay y si vale esos segundos extra de latencia; esa es la evidencia que puedes llevar a una discusión con un colega.

Por último, marca la frontera. El encadenamiento y el enrutamiento son ambos orquestación de **forma fija**: cuántas etapas tiene la cadena, qué categorías tiene el enrutador, todo se decide cuando escribes el código. Ejecutar varias etapas a la vez y luego agregar es la paralelización de la Lección 3; ni siquiera saber cuántas subtareas hay hasta ver la entrada es el orquestador-trabajadores de la Lección 4.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Decidir encadenamiento, enrutamiento o ninguno (sin código)

Para cada una de las cuatro tareas de abajo, decide si usar encadenamiento, enrutamiento, ambos o ninguno. Además de la conclusión, escribe con claridad: si juzgaste encadenamiento, ¿qué revisa la compuerta programática entre etapas? Si juzgaste enrutamiento, ¿dónde va el clasificador, cuántas categorías, es modelo o código?

1. El buzón de clientes recibe cientos de correos al día; las tres categorías reembolso/incidencia/facturación tienen tratamientos completamente distintos, actualmente comparten un solo prompt, y cambiar la redacción para una categoría afecta a otra.
2. Un contrato en inglés necesita primero una revisión que produzca una opinión de riesgo estructurada (cada punto con la ubicación de la cláusula, el nivel de riesgo y una explicación), y luego traducir esa opinión a versiones en chino y japonés para equipos distintos.
3. Una cola mixta de tickets: hay tanto «restablecer contraseña», que se responde en un paso, como «falló la migración de datos», que requiere revisar logs, diagnosticar, proponer una solución y escribir una respuesta —tareas de varios pasos—.
4. La persona usuaria escribe una oración en un cuadro de entrada y necesitas corregir las erratas y devolver la oración corregida.

<!-- rubric -->

- Las cuatro conclusiones son: enrutamiento / encadenamiento / ambos / ninguno.
- El razonamiento de la tarea 1 tiene que aterrizar en «optimizar para un tipo de entrada puede perjudicar el desempeño en otras entradas», y aportar el conjunto de categorías, que tiene que incluir una categoría de repliegue.
- La tarea 2 tiene que señalar que las dos versiones de traducción no tienen dependencia secuencial (la paralelización queda para la Lección 3, basta con reconocerla), y aportar al menos una compuerta específica.
- La tarea 3 tiene que explicar la estructura de dos capas: la capa externa enruta por complejidad, y la rama juzgada como compleja se vuelve internamente una cadena.
- La tarea 4 tiene que decir explícitamente «una llamada basta», con el razonamiento aterrizando en que la latencia de partir no es proporcional al beneficio.
- Cada compuerta tiene que ser comprobable con código puro, no puede ser «que el modelo vea si es aceptable».

<!-- answer -->

**1. Correos de clientes despachados por tema — enrutamiento.**

Los criterios coinciden exactamente con el caso de uso: categorías distintas que conviene manejar por separado, y la clasificación misma se puede resolver con precisión[^S1]. La oración del enunciado «cambiar la redacción para una categoría afecta a otra» es la versión en vivo de la afirmación oficial «sin este flujo de trabajo, optimizar para un tipo de entrada puede perjudicar el desempeño en otras entradas»[^S1]. El clasificador va al frente, el conjunto de categorías es `refund / incident / billing / other`, con «other» atrapando los correos que no encajan en los tres primeros y los casos en que el modelo no responde en el formato esperado. Una llamada barata al modelo, con la salida apretada a una sola palabra. Si la mayoría de los correos de reembolso vienen de un punto de entrada fijo de formulario de posventa, ese camino se puede cortocircuitar primero con una regla de código puro.

**2. Revisión de contrato que produce una opinión estructurada y luego traducción — encadenamiento.**

La tarea se puede partir limpiamente en subtareas fijas: revisar, traducir; la entrada del segundo paso es la salida del primero, que es exactamente la forma de la definición del encadenamiento[^S1]. Los dos idiomas no tienen dependencia secuencial: esta forma de «el mismo paso repetido a lo largo de varios elementos» es territorio de la paralelización de la Lección 3, basta con reconocerla y no escribirla como dos etapas en serie.

La compuerta va entre revisión y traducción, revisando estructura y no contenido, todo con código puro: la salida se puede analizar con `JSON.parse` hasta obtener un arreglo; cada punto tiene los tres campos `clause`, `level`, `note`; `level` cae dentro del conjunto `high / medium / low`; la longitud del arreglo es mayor que 0 (un contrato revisado con cero observaciones es más probablemente el paso anterior saliéndose del curso que un contrato perfecto). La etapa de traducción no puede descubrir que su entrada es mala, simplemente traducirá fielmente la cosa mala a dos idiomas, así que esta compuerta tiene que bloquearla aguas arriba.

**3. Tickets mixtos — ambos.**

Enrutamiento por fuera, encadenamiento por dentro. El clasificador va a la entrada de la cola, juzgando no el tema sino la complejidad, y las categorías pueden ser `respondible-en-un-paso / requiere-diagnóstico / otros`. «Respondible en un paso» va directo a una llamada o incluso a una plantilla; «requiere diagnóstico» se expande en una cadena: revisar logs → diagnosticar la causa → proponer solución → escribir respuesta. Esto es despacho por dificultad, la misma categoría que el escalamiento del vocabulario oficial: esa entrada dice consultar a un agente o modelo más capaz para un subconjunto de subtareas complejas[^S6], solo que aquí se cambia «agente más capaz» por expandir una cadena.

Dentro de la cadena hay al menos dos compuertas de código puro: la salida de la etapa de diagnóstico tiene que llevar al menos una referencia a una línea de log (revisar el formato de marca de tiempo con una expresión regular), y la salida de la etapa de escritura de respuesta tiene que contener el número de ticket que dio la etapa de solución (revisión de inclusión de cadena). Si el clasificador de complejidad mismo es difícil de afinar, cámbialo por «trata primero como respondible en un paso, y si la salida no pasa la compuerta entonces escala».

**4. Corrección de erratas de una oración — ninguno.**

Una llamada basta. No hay subtareas fijas que se puedan separar limpiamente («encontrar errores» y «corregir errores» hechos por separado: la segunda etapa igual tiene que releer la oración entera, equivalente a ejecutar para nada), y no hay categorías que necesiten tratamiento separado. El costo de partir es concreto: una ida y vuelta más de latencia, y la persona usuaria está mirando el cuadro de entrada esperando resultados. El posicionamiento del encadenamiento es cambiar latencia por precisión[^S1], con la precondición de que la precisión de verdad se pueda ganar; esta tarea no la puede ganar. Para mejorar de verdad la calidad, añade primero unos cuantos ejemplos al prompt; Anthropic también dejó este camino antes de los patrones: para muchas aplicaciones, optimizar llamadas individuales al LLM con recuperación y ejemplos en contexto suele bastar[^S1].

<!-- hint -->

Antes de apresurarte a juzgar patrones, hazle a cada tarea dos preguntas: ¿lo que entra es «una cosa» o «varias clases de cosas»? Si es una cosa, ¿se puede partir en pasos que sean cada uno más simple y en un orden fijo? Si la primera pregunta responde «varias clases de cosas», piensa en enrutamiento; si la segunda responde «sí», piensa en encadenamiento.

<!-- hint -->

Al escribir compuertas, autoexamínate: ¿puedes escribir esta revisión con `if` y funciones de cadena, y la misma entrada saca siempre la misma conclusión? Si mientras la escribes se te convierte en «que el modelo juzgue si este esquema es lo bastante bueno», entonces no es la comprobación programática de la que habla esta lección: eso es un bucle de revisión, y queda para la Lección 5.

### Nivel 2: Escribir la cadena de tres etapas y hacerla ejecutar (con código)

Escribe un `chain.mjs` que implemente la tarea inicial de escritura del documento como una cadena de tres etapas: **redactar esquema → escribir el texto completo a partir del esquema → revisar la consistencia terminológica**, con dos compuertas en medio. Requisitos:

1. Usa un cliente simulado (el enfoque usado en los cursos 8 a 11 de esta serie): una cola fija de respuestas, sin red, sin costo, y la misma entrada produce siempre el mismo resultado.
2. `runAgent(client, task, tools)` es un bucle de arnés real —juzgando por `stop_reason`, y si es `tool_use` entonces ejecutar la herramienta y devolver el resultado—. La etapa tres debería pasar de verdad por una llamada a herramienta (leer el glosario).
3. Compuerta 1: el esquema tiene que contener exactamente 3 títulos de capítulo que empiecen con `## `. Compuerta 2: el texto completo no puede contener términos obsoletos prohibidos (define tu propia tabla de dos o tres palabras). Ambas de código puro, sin más llamadas al modelo.
4. Cuando una compuerta falla, imprime en qué **etapa** falló y por qué, y luego sal con un código distinto de cero; si las tres etapas pasan, sal con 0.
5. Prepara dos conjuntos de respuestas fijas y ejecuta dos veces: una pasando todo, otra detenida por la segunda compuerta. Pega la salida real de ambas ejecuciones y los códigos de salida.

<!-- rubric -->

- El cliente simulado es una cola FIFO de respuestas, y cuando la cola está vacía tiene que dar error en lugar de devolver `undefined` en silencio (si no, crees que la cadena se ejecutó entera cuando en realidad giró en vacío).
- `runAgent` tiene un `while` real y ramas por `stop_reason`, no devuelve después de un solo `await`; la secuencia de respuestas de la etapa tres contiene un `tool_use`, así que la rama de herramienta se ejecuta de verdad.
- Las dos funciones de compuerta no llaman al cliente, su valor de retorno lleva el motivo de la falla, y la misma entrada da siempre la misma salida.
- El mensaje de falla escribe entre qué dos etapas ocurre y específicamente qué palabra se encontró; imprimir solo «falló» no cuenta.
- Código de salida: todo pasa 0, compuerta fallida distinto de cero (los errores de parámetros y demás pueden dar otro código distinto de cero).
- El segundo conjunto de respuestas dispara la compuerta 2, y la etapa tres de verdad no se ejecutó (la salida no muestra ninguna impresión suya).
- La salida pegada viene de una ejecución real: los números de etapa, las palabras encontradas y los códigos de salida coinciden todos con el script.

<!-- answer -->

Script completo:

```javascript
// chain.mjs — cadena de tres etapas: redactar esquema → escribir documento → revisar términos
// Script ilustrativo propio de esta lección: las fuentes primarias no traen ejemplos de código de scripts de orquestación
// Uso: node chain.mjs pass    (las tres etapas pasan)
//      node chain.mjs stale   (detenida por la segunda compuerta)

const BANNED = ['grupos de usuarios', 'subcuentas'];

// ---------- Cliente simulado: cola fija de respuestas, sin red ----------
const say = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const useTool = (id, name, input = {}) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name, input }],
});

function makeStubClient(script) {
  const queue = [...script];
  return {
    messages: {
      async create() {
        if (queue.length === 0) throw new Error('Cola del simulador vacía: el script llamó al modelo más veces de las previstas');
        return queue.shift();
      },
    },
  };
}

// ---------- Una etapa = un bucle de arnés completo ----------
async function runAgent(client, task, tools = {}) {
  const messages = [{ role: 'user', content: task }];
  while (true) {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages,
      tools: Object.values(tools).map((t) => t.schema),
    });
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason !== 'tool_use') {
      return res.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
    }

    const results = [];
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      const tool = tools[block.name];
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: tool ? await tool.run(block.input) : `Herramienta desconocida: ${block.name}`,
      });
    }
    messages.push({ role: 'user', content: results });
  }
}

// ---------- Dos compuertas: código puro, sin preguntarle al modelo ----------
function gateOutline(outline) {
  const headings = outline.split('\n').filter((l) => l.startsWith('## '));
  if (headings.length !== 3) {
    return { ok: false, why: `El esquema requiere exactamente 3 títulos de capítulo, se contaron ${headings.length}` };
  }
  return { ok: true, detail: `Capítulos: ${headings.map((h) => h.slice(3)).join(' / ')}` };
}

function gateTerms(doc) {
  const hits = BANNED.filter((w) => doc.includes(w));
  if (hits.length > 0) {
    return { ok: false, why: `El documento contiene términos obsoletos prohibidos: ${hits.join(', ')}` };
  }
  return { ok: true, detail: `Lista de términos prohibidos con ${BANNED.length} entradas, 0 coincidencias` };
}

function fail(where, why) {
  console.error(`\n✗ compuerta fallida @ ${where}`);
  console.error(`  Motivo: ${why}`);
  console.error('  La cadena se detiene aquí, las etapas posteriores no se ejecutarán.');
  process.exit(1);
}

// ---------- Herramientas ----------
const glossary = {
  schema: {
    name: 'read_glossary',
    description: 'Lee el glosario de términos del producto, devuelve el mapeo «término antiguo → término nuevo»',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  run: async () => 'grupos de usuarios → espacios de equipo\nsubcuentas → cuentas de miembro\nflujo de aprobación → flujo de trabajo',
};

// ---------- Tres conjuntos de respuestas fijas ----------
const OUTLINE = ['## Modelo de permisos', '## Crear espacios de equipo y gestionar miembros', '## Preguntas frecuentes'].join('\n');

const CLEAN_DOC = [
  '## Modelo de permisos',
  'Cada cuenta de miembro pertenece a un espacio de equipo, y los permisos los determina el rol dentro del espacio de equipo.',
  '## Crear espacios de equipo y gestionar miembros',
  'Después de que la persona administradora crea un espacio de equipo en la consola, puede invitar cuentas de miembro a unirse.',
  '## Preguntas frecuentes',
  'Una cuenta de miembro puede pertenecer a varios espacios de equipo a la vez, y los permisos se unen.',
].join('\n');

const STALE_DOC = CLEAN_DOC.replace('invitar cuentas de miembro a unirse', 'invitar subcuentas a unirse');

const REPORT = 'La revisión de consistencia terminológica pasó: el texto usa de forma uniforme «espacios de equipo» y «cuentas de miembro», sin términos obsoletos mezclados.';

const SCRIPTS = {
  pass: [say(OUTLINE), say(CLEAN_DOC), useTool('t1', 'read_glossary'), say(REPORT)],
  stale: [say(OUTLINE), say(STALE_DOC)],
};

// ---------- Cuerpo de la cadena ----------
const mode = process.argv[2] ?? 'pass';
if (!SCRIPTS[mode]) {
  console.error(`Modo desconocido: ${mode} (disponibles: ${Object.keys(SCRIPTS).join(', ')})`);
  process.exit(2);
}
const client = makeStubClient(SCRIPTS[mode]);
const req = 'Escribe la documentación de ayuda de la función «Espacios de equipo», para personas administradoras que configuran permisos por primera vez.';

console.log(`Modo: ${mode}`);

console.log('[1/3] Redactar esquema');
const outline = await runAgent(client, [
  'Objetivo: Redactar un esquema de documentación de ayuda para los requisitos de abajo.',
  'Formato de salida: Solo los títulos de capítulo, uno por línea, empezando con "## ", exactamente 3.',
  'Guía de herramientas: Esta etapa no necesita herramientas.',
  'Límites: Solo enumera títulos, no escribas el texto del cuerpo.',
  `Requisitos: ${req}`,
].join('\n'));
const g1 = gateOutline(outline);
console.log(g1.ok ? `      compuerta 1 pasada — ${g1.detail}` : '      compuerta 1 fallida');
if (!g1.ok) fail('etapa 1 → etapa 2 (estructura del esquema)', g1.why);

console.log('[2/3] Escribir el documento a partir del esquema');
const doc = await runAgent(client, [
  'Objetivo: Escribir el cuerpo de la documentación de ayuda a partir del esquema de abajo.',
  'Formato de salida: Conserva los títulos "## " del esquema, escribe 1-2 oraciones por sección.',
  'Guía de herramientas: Esta etapa no necesita herramientas.',
  `Límites: Usa solo los términos nuevos, prohibidos: ${BANNED.join(', ')}.`,
  `Esquema:\n${outline}`,
].join('\n'));
const g2 = gateTerms(doc);
console.log(g2.ok ? `      compuerta 2 pasada — ${g2.detail}` : '      compuerta 2 fallida');
if (!g2.ok) fail('etapa 2 → etapa 3 (términos obsoletos prohibidos)', g2.why);

console.log('[3/3] Revisar la consistencia terminológica');
const report = await runAgent(
  client,
  [
    'Objetivo: Revisar si la terminología del documento de abajo es consistente.',
    'Formato de salida: Una conclusión de una oración.',
    'Guía de herramientas: Llama primero a read_glossary para obtener la tabla de términos, luego coteja el texto completo.',
    'Límites: Reporta solo problemas de terminología, no reescribas el documento.',
    `Documento:\n${doc}`,
  ].join('\n'),
  { read_glossary: glossary },
);

console.log(`\n--- Conclusión de la revisión ---\n${report}`);
console.log('\n✓ Tres etapas y dos compuertas, todo pasado.');
process.exit(0);
```

Primera ejecución, las tres etapas pasan (Node v26.3.0):

```text
$ node chain.mjs pass
Modo: pass
[1/3] Redactar esquema
      compuerta 1 pasada — Capítulos: Modelo de permisos / Crear espacios de equipo y gestionar miembros / Preguntas frecuentes
[2/3] Escribir el documento a partir del esquema
      compuerta 2 pasada — Lista de términos prohibidos con 2 entradas, 0 coincidencias
[3/3] Revisar la consistencia terminológica

--- Conclusión de la revisión ---
La revisión de consistencia terminológica pasó: el texto usa de forma uniforme «espacios de equipo» y «cuentas de miembro», sin términos obsoletos mezclados.

✓ Tres etapas y dos compuertas, todo pasado.
$ echo $?
0
```

Segunda ejecución: la etapa de escritura produjo texto con términos obsoletos, detenida por la compuerta 2:

```text
$ node chain.mjs stale
Modo: stale
[1/3] Redactar esquema
      compuerta 1 pasada — Capítulos: Modelo de permisos / Crear espacios de equipo y gestionar miembros / Preguntas frecuentes
[2/3] Escribir el documento a partir del esquema
      compuerta 2 fallida

✗ compuerta fallida @ etapa 2 → etapa 3 (términos obsoletos prohibidos)
  Motivo: El documento contiene términos obsoletos prohibidos: subcuentas
  La cadena se detiene aquí, las etapas posteriores no se ejecutarán.
$ echo $?
1
```

Tres cosas que vale la pena mirar contra la salida: la segunda ejecución no tiene línea `[3/3]`, la etapa tres de verdad no se ejecutó, lo malo no fluyó aguas abajo; el mensaje de falla señala con precisión «etapa 2 → etapa 3» y la palabra específica «subcuentas», así que sabes que hay que ir a arreglar el prompt de la etapa de escritura; la cola `stale` tiene solo dos respuestas, así que si algún día se borra la compuerta 2 por error, el script entrará en la etapa tres, no conseguirá respuesta y el cliente simulado lanzará «Cola del simulador vacía»: el modo de falla es ruidoso, no silencioso. De paso, calcula la cuenta: la ejecución `pass` llamó de verdad al modelo cuatro veces —la etapa tres, al revisar términos, pasó por una ida y vuelta de herramienta—; la cantidad de etapas es tres, la de idas y vueltas es cuatro, y el costo habría que calcularlo por cantidad de idas y vueltas.

<!-- hint -->

Haz funcionar el cliente simulado y `runAgent` por separado antes de conectar la cadena. Usa una cola que contenga un solo `say(...)` para ejecutar una etapa y confirma que devuelve texto y no `undefined`; verifica la rama de herramienta aparte: haz que la primera respuesta de la cola se detenga en `tool_use` y que la segunda sea el texto de cierre, y el bucle debería girar exactamente dos veces.

<!-- hint -->

«Qué etapa falló» habría que pasarlo como parámetro a `fail()` cuando lo escribes, no esperar verlo después en la traza. Dale a cada compuerta una redacción fija de «etapa X → etapa Y» e imprímela junto con la palabra específica encontrada cuando falle. Usa `process.exit(1)` para el código de salida, no solo `throw`: lo que produce `throw` es efectivamente el código de salida 1, pero la información de la traza tapará las pocas líneas que imprimiste con cuidado.

<!-- /exercises -->

## Resumen

- El encadenamiento descompone una tarea en una secuencia de pasos donde cada llamada procesa la salida anterior, haciendo de cada llamada una tarea más fácil[^S1]; viene cotizado explícitamente: el objetivo principal es cambiar latencia por mayor precisión[^S1].
- Una etapa de la cadena es un bucle de arnés completo, no una llamada a la API: la configuración que Anthropic recomendó para la evaluación es exactamente este bloque de construcción —una tarea, un bucle while, código llamando directamente a la API—[^S3].
- Las posiciones que se añaden después de partir son la clave: puedes añadir comprobaciones programáticas en cualquier paso intermedio para asegurarte de que el proceso sigue en curso[^S1]. Este es el verificador determinista del curso 10 movido a otra ubicación de instalación —del estado final a entre etapas—; en forma de producto se ve como subagentes ejecutándose secuencialmente, cada uno completa y la capa superior pasa el contexto relevante al siguiente[^S4].
- El enrutamiento clasifica la entrada y la despacha hacia tareas de seguimiento especializadas, ganando separación de responsabilidades y prompts más especializados; sin él, optimizar para un tipo de entrada puede perjudicar el desempeño en otras entradas[^S1]. Precondición: categorías claras y que la clasificación misma se pueda resolver con precisión, ya sea con LLM o con algoritmos de clasificación tradicionales[^S1].
- Aprieta la salida de la llamada de clasificación a una sola etiqueta, y deja una rama de repliegue para atrapar las respuestas que no encajan en la tabla.
- Este patrón está vivo en el vocabulario actual de primera mano: despachar por dominio hacia agentes con prompts y herramientas dedicados se llama especialización, y consultar a un agente o modelo más capaz para un subconjunto de subtareas complejas se llama escalamiento[^S6]; este último es enrutamiento despachando por dificultad.
- No lo fuerces: cuando solo hay una categoría el enrutamiento es puro sobrecosto, y cuando la tarea no se puede partir limpiamente forzarlo perderá información entre etapas[^S1]. Cuando tengas dudas, mide primero: la complejidad tiene que pasar el umbral de «mejora demostrablemente los resultados»[^S1].

[>> Lección 3: Paralelización: seccionamiento y votación](./03-parallelization.md)
