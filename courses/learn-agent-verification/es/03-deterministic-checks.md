# Lección 3: Verificadores deterministas: solo cuentan las comprobaciones que dan aprobado/fallido

> Objetivos de aprendizaje:
> - Ordenar los verificadores candidatos por «el más rápido, el más confiable, el más escalable» y elegir el correcto para una salida específica
> - Escribir un script de verificación determinista que devuelva un aprobado/fallido en una forma que el agente pueda leer y sobre la que pueda iterar
> - Reconocer los falsos negativos donde un verificador demasiado estricto rechaza salidas correctas, arreglarlos con normalización, y entender dónde tocan techo las comprobaciones deterministas
>
> Requisitos: Lecciones 1 y 2 (sin una comprobación que se pueda ejecutar, «parece terminado» es la única señal; primero el estado final, el proceso como respaldo; los criterios de éxito deben ser medibles) | Anterior: [<< Lección 2](./02-what-to-verify.md) | Siguiente: [Lección 4 >>](./04-llm-as-judge.md)

## De «qué verificar» a «con qué verificarlo»

Al final de la Lección 2 deberías tener escrito un criterio de éxito concreto. Toma el ejemplo que usa esta lección: el agente lee un lote de CSV de ventas y los agrega en un `report.json` con un título, ítems por canal y un total. La Lección 2 te enseñó a plantear el criterio como estado final —el archivo existe, los campos están presentes, el total es igual a la suma de los `count` de los ítems— y no como comprobaciones de proceso turno por turno del tipo «lee el archivo, después calcula la suma, después escribe el archivo».

Ya tienes el criterio. La pregunta siguiente es práctica: **¿con qué lo compruebas?**

Puedes mirarlo a ojo. Puedes hacer que otro modelo lo lea y dé su devolución. O puedes escribir una docena de líneas de Node que cargue el JSON, sume los `count` y salga con un código distinto de cero si no coinciden. Los tres llegan a una conclusión, pero el costo y la confiabilidad difieren muchísimo.

La documentación oficial ofrece un principio de ordenamiento: **elige el método de calificación más rápido, más confiable y más escalable**[^S5]. Con esa vara, las tres categorías quedan en un orden claro:

- **Calificación basada en código**: la más rápida y la más confiable, extremadamente escalable; su debilidad es que le falta matiz para los juicios complejos que necesitan menos rigidez de reglas[^S5].
- **Calificación mediante LLM**: rápida y flexible, escalable y apta para el juicio complejo, pero primero pruébala para asegurar su confiabilidad y después escala[^S5]. (Eso es la Lección 4.)
- **Calificación humana**: la más flexible y de más alta calidad, pero lenta y cara; evítala si es posible[^S5].

«Confiable» aquí significa **misma entrada, mismo veredicto siempre**. La calificación basada en código queda primera no porque sea inteligente, sino porque es predeciblemente tonta: no te va a aprobar hoy por buena onda y reprobar mañana por una formulación. En computación, los sistemas deterministas producen la misma salida cada vez que reciben entradas idénticas, mientras que los sistemas no deterministas —como los agentes— pueden generar respuestas variadas incluso con las mismas condiciones iniciales[^S3]. Los «verificadores deterministas» que cubre esta lección son esa clase de comprobación predeciblemente tonta: una cosa determinista que evalúa una cosa no determinista.

Un principio relacionado para diseñar tareas de evaluación: **estructura las preguntas de modo que permitan la calificación automatizada** (por ejemplo, opción múltiple, coincidencia de cadenas, calificadas por código, calificadas por LLM)[^S5]. Donde tengas una oportunidad de automatizar, tómala.

## El menú de verificadores: cualquier cosa que devuelva una señal

«Verificador» suena a framework especializado, pero la vara está mucho más baja. La definición de la documentación oficial es casi brusca: **la comprobación es cualquier cosa que devuelva una señal que Claude pueda leer en la conversación: una suite de pruebas, el código de salida de una compilación, un linter, un script que compare la salida con un fixture, o una captura de pantalla del navegador comparada con un diseño**[^S4].

Desarmemos esa lista. Ejecutar `npm test` y que salga todo en verde es un aprobado, perfecto para los entregables de código: las soluciones de código son verificables mediante pruebas automatizadas[^S1]. Los códigos de salida de una compilación son lo más fácil: la cadena de herramientas ya escribió las aserciones por ti. Un linter por sí solo no alcanza, pero es excelente como piso de «errores que no deberías cometer». Un script de comparación coteja la salida de esta ejecución con un archivo fixture que preparaste (una muestra que se sabe buena), apropiado cuando la salida es estable y el formato es fijo. La comparación de capturas de pantalla es para cuando estás retocando estilos de frontend.

Una nota de práctica de ingeniería: los compiladores y los verificadores estáticos de tipos (como `tsc --noEmit`) se usan seguido de esta manera en los proyectos reales, porque también emiten códigos de salida y ubicaciones de error legibles. Eso es un agregado mío, no está en la lista oficial: no lo tomes como avalado oficialmente.

Estos métodos no son mutuamente excluyentes. Los verificadores forman **un espectro**: en un extremo está «la coincidencia exacta de cadenas con un fixture», en el otro extremo está «pedirle a Claude que juzgue»[^S3]. Esta lección cubre la mitad izquierda; la Lección 4 va hacia la derecha.

## Forma mínima: `output == golden_answer`

El borde izquierdo del espectro se ve así[^S5]:

```text
output == golden_answer
```

Solo una comprobación de igualdad. A esto se lo llama coincidencia exacta. Mide si la salida del modelo coincide con una respuesta correcta predefinida, **normalmente después de normalizar los espacios en blanco y las mayúsculas y minúsculas**; es una métrica simple y sin ambigüedad, perfecta para las tareas con respuestas categóricas y bien delimitadas, como el análisis de sentimiento (positivo, negativo, neutral)[^S5].

La «normalización» aquí es simple: antes de comparar, borra las diferencias que no cargan significado. En código:

```javascript
// Clasificación de sentimiento en tres vías: la respuesta debe ser positive / negative / neutral
function grade(output, goldenAnswer) {
  const normalize = (s) => s.trim().toLowerCase();
  return normalize(output) === normalize(goldenAnswer);
}

grade("Positive\n", "positive"); // true — mayúsculas y salto de línea borrados
grade("positive.", "positive");  // false — pero un punto igual la hace fallar
```

Vale la pena quedarse mirando el resultado de la segunda llamada. `trim()` y `toLowerCase()` rescatan los saltos de línea y las mayúsculas, pero no ese punto. Hasta dónde debería llegar la normalización depende de qué diferencias son irrelevantes **para tu tarea**, un juicio que ninguna biblioteca puede hacer por ti. La sección de la trampa, más adelante en esta lección, trata de qué pasa cuando ese juicio sale mal.

## Haz que la salida del verificador sea legible

Esa definición traía una cláusula que se suele saltear: la señal tiene que ser **algo que Claude pueda leer en la conversación**[^S4]. Esa cláusula determina cómo debería escribir su salida tu script de verificación. Compara dos mensajes de falla:

```text
FAIL: la validación no pasó
```

```text
FAIL  report.json
  - total no coincide: declarado 48, la suma de los count de items da 50
```

El primero le dice al agente «estás mal» y lo deja adivinando. El segundo le dice qué campo falló, qué se esperaba y qué había en realidad: en el turno siguiente puede ir a arreglar ese número directo. Mismo aprobado/fallido, un orden de magnitud de diferencia en información. Otra pieza de la guía oficial dice lo mismo: **haz que Claude muestre evidencia en lugar de afirmar el éxito**: la salida de las pruebas, el comando que ejecutó y lo que devolvió, o una captura de pantalla del resultado; revisar evidencia es más rápido que volver a ejecutar la verificación tú mismo, y funciona para las sesiones que no estuviste mirando[^S4]. Tu script de verificación es el productor de esa evidencia. Si es vago, la evidencia es vaga.

Dos reglas prácticas: usa el código de salida `0` para el aprobado y uno distinto de cero para el fallido (CI y el `&&` de la shell lo pueden usar directo). En stdout, una falla por línea, indicando «qué campo, qué se esperaba, qué se obtuvo».

## Con un aprobado/fallido, el comportamiento del agente cambia

Durante la ejecución, los agentes necesitan **la «ground truth» del entorno en cada paso (por ejemplo, los resultados de las llamadas a herramientas o la ejecución de código) para evaluar su progreso**[^S1]. Sin un verificador, la única señal de progreso que puede obtener es el párrafo que acaba de escribir: si cree que terminó, terminó. Con un verificador, el entorno contiene una fuente de hechos independiente de su propio juicio.

Así que la cadena de comportamiento cambia: **dale a Claude algo que produzca un aprobado o un fallido y el bucle se cierra solo; Claude hace el trabajo, ejecuta la comprobación, lee el resultado e itera hasta que la comprobación pasa**[^S4]. Dicho de otra manera: los agentes pueden iterar sobre las soluciones usando los resultados de las pruebas como retroalimentación[^S1].

En la clase de bucle de arnés que escribiste a mano en el curso 7 de esta serie, la implementación consiste en exponer la comprobación como una herramienta:

```javascript
const tools = [
  { name: "write_file", /* ... */ },
  {
    name: "run_check",
    description: "Ejecuta verify.mjs para comprobar report.json; devuelve PASS/FAIL y las razones de falla ítem por ítem",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

import { execFile } from "node:child_process";

// Utilidad: ejecutar verify.mjs y recolectar tanto el código de salida como la salida
// (No uses promisify(exec): lanza una excepción cuando el código de salida no es cero, y ese no-cero es la señal que queremos)
function runVerify() {
  return new Promise((resolve) => {
    execFile("node", ["verify.mjs", "report.json"], (err, stdout, stderr) => {
      resolve({ code: err?.code ?? 0, stdout: stdout + stderr });
    });
  });
}

async function runTool(name, input) {
  if (name !== "run_check") return runOtherTool(name, input);
  const { code, stdout } = await runVerify();
  // Clave: pasa el código de salida y stdout tal cual, no los comprimas a «falló»
  return `exit code: ${code}\n${stdout}`;
}

while (response.stop_reason === "tool_use") {
  const toolUse = response.content.find((block) => block.type === "tool_use");
  const output = await runTool(toolUse.name, toolUse.input);
  messages.push({ role: "assistant", content: response.content });
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: toolUse.id, content: output }],
  });
  response = await client.messages.create({ model, tools, messages });
}
```

La salida del verificador vuelve a fluir a la conversación vía `tool_result`. El modelo lee `total no coincide: declarado 48, la suma de los count de items da 50` y en el turno siguiente va a arreglarlo. Tú participaste en cero pasos.

Dos extensiones cómodas. **Primero, las comprobaciones no tienen que ir solo al final.** La Lección 2 cubrió cómo los flujos de trabajo complejos se pueden dividir en puntos de control discretos donde deberían haber ocurrido cambios de estado específicos, en lugar de validar cada paso intermedio[^S2]. Esos puntos de control de verificación son lugares naturales para aterrizar comprobaciones deterministas, como «después de leer todos los CSV, la cantidad de filas debería ser igual a la suma de las cantidades de filas de cada archivo». La misma retrospectiva también menciona combinar la adaptabilidad de los agentes con salvaguardas deterministas como la lógica de reintentos y los puntos de control regulares[^S2] (ten en cuenta que ahí «puntos de control» se refiere a la clase de puntos de control de recuperación con guardado de estado del curso 9 de esta serie).

**Segundo, una clase de verificación se puede mover aguas arriba, a la capa de la API.** Agrega `strict: true` a tus definiciones de herramientas para asegurar que las llamadas a herramientas de Claude siempre coincidan exactamente con tu esquema[^S6]. El esquema es tu declaración de la estructura de parámetros.

```json
{
  "name": "write_report",
  "description": "Escribe los resultados agregados en report.json",
  "strict": true,
  "input_schema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": { "name": { "type": "string" }, "count": { "type": "integer" } },
          "required": ["name", "count"]
        }
      },
      "total": { "type": "integer" }
    },
    "required": ["title", "items", "total"]
  }
}
```

Con esa sola línea, los problemas estructurales como «typo en el nombre del campo» o «count pasado como cadena» dejan de ser «algo para lo que escribes código de comprobación» y pasan a ser una garantía a nivel de plataforma. Las herramientas son un contrato entre los sistemas deterministas y los agentes no deterministas[^S3], y `strict` es la manera de escribir ese contrato dentro de la interfaz.

Pero vigila la estructura, no la semántica. Si `total` de verdad es igual a la suma de todos los valores de `count`, el esquema no tiene nada que decir: esa parte la sigues verificando tú.

```agentmentor-check
{
  "id": "vq-zh-03-strict-verifier",
  "label": "Juzgar si «más estricto» es más seguro",
  "prompt": "Un colega escribió un verificador: la salida del agente debe coincidir con el archivo fixture byte por byte, cada espacio y cada signo de puntuación idénticos, o falla. Su razonamiento es que «más estricto es más seguro, mejor rechazar de más que de menos». ¿Se sostiene ese razonamiento?",
  "whyHere": "Acabas de ver los beneficios de las comprobaciones deterministas; ahora te toca ver la manera más fácil que tienen de tropezar. Antes de escribir un verificador, aclara qué debería significar «estricto».",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No se sostiene. Los verificadores demasiado estrictos rechazan salidas correctas por diferencias espurias como el formato, la puntuación o formulaciones alternativas válidas; el rigor debería aplicarse a la semántica (como si total es igual a la suma de los count), y el formato irrelevante debería normalizarse primero.",
      "correct": true,
      "feedback": "Correcto. El rigor pertenece a las partes que cargan significado, no a los espacios en blanco ni a la puntuación. La práctica estándar de la coincidencia exacta es normalizar los espacios en blanco y las mayúsculas y minúsculas antes de comparar."
    },
    {
      "id": "b",
      "text": "Se sostiene en su mayor parte. Ser más estricto solo significa unas cuantas falsas alarmas más; las personas pueden revisarlas, y es mejor que dejar pasar errores reales.",
      "correct": false,
      "feedback": "Las falsas alarmas no son gratis. Los falsos negativos contaminan tu tasa de aprobación y hacen que una mejora real parezca no haber tenido efecto; peor todavía, cuando los resultados de la verificación se le devuelven al agente como retroalimentación, va a gastar varios turnos «arreglando» algo que nunca estuvo roto."
    },
    {
      "id": "c",
      "text": "Está al revés: debería ser lo más laxo posible; mientras la salida no esté vacía, que pase, y lo demás que lo revise una persona.",
      "correct": false,
      "feedback": "Eso es retroceder al estado de no tener ninguna comprobación que se pueda ejecutar. Una comprobación que siempre pasa es lo mismo que ninguna comprobación, «parece terminado» vuelve a ser la única señal, y tú te conviertes en el bucle de verificación. Lo laxo y lo estricto no son un único deslizador: sé estricto con la semántica y laxo con el formato irrelevante."
    }
  ]
}
```

## La trampa: los verificadores demasiado estrictos rechazan salidas correctas

Esta es la manera más común en que fallan las comprobaciones deterministas, y muchas veces no te vas a dar cuenta cuando pasa.

La guía oficial para las evaluaciones de herramientas es filosa: **evita los verificadores demasiado estrictos que rechazan respuestas correctas por diferencias espurias como el formato, la puntuación o formulaciones alternativas válidas**[^S3].

«Diferencias espurias» es la frase clave. La misma respuesta correcta podría llevar un espacio al final, podría escribir `positive` como `Positive`, podría tener dos espacios entre palabras en lugar de uno. Estas diferencias no significan nada **para la tarea**, pero para un verificador que compara byte por byte son catastróficas. La dirección de la falla también es insidiosa: no deja pasar errores, **castiga salidas correctas**; eso es un falso negativo.

Acá va un choque concreto con su arreglo. El título del fixture es `Resumen de canales Q1 2026`. El `report.json` del agente tiene todos los datos correctos, solo que con espacios antes y después del título y dos espacios entre palabras. El verificador estricto ingenuo se ve así:

```javascript
// strict.mjs — versión estricta ingenua
import { readFileSync } from "node:fs";

const GOLDEN_TITLE = "Resumen de canales Q1 2026";
const data = JSON.parse(readFileSync(process.argv[2], "utf8"));

if (data.title === GOLDEN_TITLE) {
  console.log("PASS");
  process.exit(0);
} else {
  console.log(`FAIL: title no coincide, se obtuvo ${JSON.stringify(data.title)}`);
  process.exit(1);
}
```

Al ejecutarlo, la salida real es:

```text
$ node strict.mjs spacey.json
FAIL: title no coincide, se obtuvo "  Resumen de   canales Q1 2026\n"
```

Un reporte con el contenido completamente correcto, reprobado por un salto de línea al final. Si este resultado se le devuelve al agente, va a ponerse a juguetear con los espacios del título: una dirección que no tiene relación con la tarea.

El arreglo es una función:

```javascript
function normalize(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

if (normalize(data.title) === normalize(GOLDEN_TITLE)) { /* PASS */ }
```

`replace(/\s+/g, " ")` pliega los espacios consecutivos en uno solo, `trim()` quita los de los extremos y `toLowerCase()` unifica mayúsculas y minúsculas. Después del cambio, el mismo archivo pasa: el script completo y los resultados reales de la ejecución están en el Nivel 2 de los ejercicios de más abajo.

Un recordatorio en la dirección contraria: la normalización no es una cosa de «cuanto más, mejor». Si además quitas la puntuación, podrías alisar errores reales como `total: 48` frente a `total: 4.8`. El criterio de juicio es siempre el mismo: **¿esta diferencia carga significado?** Si sí, sé estricto. Si no, normalízala.

## Dónde tocan techo las comprobaciones deterministas

Los verificadores deterministas tienen un límite de aplicabilidad bien definido.

**El primer límite es el texto libre.** Las salidas de investigación son difíciles de evaluar por programa, porque son texto de forma libre y rara vez tienen una única respuesta correcta[^S2]. No puedes escribir `output == golden_answer` para un resumen: con el mismo material, dos resúmenes bien escritos pueden usar una redacción completamente distinta. Esa clase de juicio pasa al dominio de la Lección 4.

**El segundo límite es el «encaja con los requisitos más amplios del sistema».** Las soluciones de código son verificables mediante pruebas automatizadas, pero para asegurar que las soluciones se alineen con los requisitos más amplios del sistema, la revisión humana sigue siendo crucial[^S1]. Un parche puede pasar todas las pruebas y aun así ser un mal diseño que vuelve inmantenible el módulo entero. La retrospectiva multiagente hace eco de esto: incluso en un mundo de evaluaciones automatizadas, las pruebas manuales siguen siendo esenciales[^S2].

Las comprobaciones deterministas son dueñas del piso de «las cosas que no deberían estar mal no están mal». Por encima de ese piso necesitas otras herramientas.

## Proporción: no todo merece un verificador

El error opuesto también es común: construir una suite completa de verificación para un script de una sola vez.

El agente escribe un script de migración de datos que se ejecuta una vez y después se borra, y tú montas validación de estructura, comparación con fixture y muestras de regresión: el tiempo que gastaste escribiendo el verificador supera al tiempo de simplemente mirar la salida a ojo.

La vara de juicio sigue siendo esa línea vieja: **habría que considerar agregar complejidad solo cuando mejora los resultados de manera demostrable**[^S1]. Para los verificadores en concreto, hazte una pregunta:

- ¿Cuántas veces se va a ejecutar esta comprobación? Si es una sola y estás parado ahí mirando, tus ojos pueden ser más rápidos.
- Sin ella, ¿cuánto tarda en descubrirse un error? «De inmediato, lo estoy mirando» frente a «cuando se rompa algo aguas abajo, dos días después» dan conclusiones totalmente distintas.
- ¿Cuántas iteraciones de prompt tienes planeadas para esta tarea? En cuanto sea más de una, necesitas una vara estable para comparar el antes y el después, o el «¿esto mejoró?» va a ser siempre una conjetura.

En cuanto a cuándo tienes que escribir uno, la guía oficial es dura: **provee siempre verificación (pruebas, scripts, capturas de pantalla); si no lo puedes verificar, no lo lances**[^S4].

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Elegir un verificador para 6 salidas (sin código)

Abajo hay 6 salidas comunes de agentes. Para cada una, responde: ¿qué verificador usarías? ¿Por qué ese?

1. Un archivo de configuración JSON (nombre del servicio, puerto, tiempo de espera)
2. Un CSV ordenado por «monto descendente»
3. Un resumen en texto libre (300 palabras destiladas de un informe largo)
4. Un parche de código (que arregla un error conocido)
5. Una lista de nombres de archivo (el agente afirma que procesó estos archivos)
6. Una etiqueta de sentimiento (produce positive / negative / neutral para un comentario)

Después de responder las seis, responde una pregunta más: **¿cuáles de estas seis no se pueden juzgar solo con comprobaciones deterministas?** Para esas, ¿qué piso pueden sostener todavía las comprobaciones deterministas? ¿Qué queda para los métodos de la Lección 4?

<!-- hint -->
Empieza cada una con esta pregunta: «Para esta salida, ¿qué diferencias cargan significado y cuáles son espurias?». Las partes que cargan significado determinan qué compruebas; las espurias determinan qué normalizas. Por ejemplo, en la 2 el orden de las filas carga significado (la tarea es ordenar), pero que el fin de línea sea `\n` o `\r\n` no.

<!-- hint -->
No tomes por defecto la «comparación byte por byte con un archivo fixture» como respuesta universal. Un enfoque más robusto suele ser **calcular una propiedad a partir de la salida y comprobar esa propiedad**, en lugar de compararla con una muestra fija. Para la 2, en vez de compararla con un CSV fixture, comprueba que «las filas adyacentes tengan montos monótonamente no crecientes»: así el script sigue funcionando cuando cambias los datos.

<!-- rubric -->
- Las 6 tienen un verificador concreto, en una forma que produce un aprobado/fallido (decir «comprobar la calidad» no cuenta)
- Al menos 4 razonamientos tocan «qué diferencias son espurias y necesitan normalizarse o evitarse», y no solo «usar un script para comprobar»
- Identifica de forma explícita que la 3 (resumen en texto libre) no se puede juzgar por completo con comprobaciones deterministas, y enuncia el piso que lo determinista sí puede sostener (el largo, que aparezcan las entidades requeridas, que no haya números de fuera del original), dejando el juicio de calidad para la Lección 4
- Para la 4 (parche de código), señala que la suite de pruebas, el código de salida de la compilación y el linter pueden verificar automáticamente la funcionalidad, pero que el «encaja con los requisitos más amplios del sistema» sigue necesitando revisión humana o los métodos de la Lección 4
- Para la 5 (lista de nombres de archivo), reconoce que «el orden normalmente no carga significado» y que habría que hacer una comparación de conjuntos, no una comparación ordenada
- Para la 6 (etiqueta de sentimiento), reconoce que este es el escenario clásico de la coincidencia exacta, y menciona normalizar primero los espacios en blanco y las mayúsculas y minúsculas

<!-- answer -->
**1. Archivo de configuración JSON → validación de esquema más unas pocas aserciones semánticas.**
El esquema vigila la estructura (campos presentes, tipos correctos, campos obligatorios completados), y después agregas unas pocas aserciones que el esquema no puede expresar, como que el puerto esté en el rango 1–65535 o que el tiempo de espera sea positivo. No compares byte por byte con un fixture de configuración: el orden de las claves, la indentación y las comas finales son todas diferencias espurias que van a causar falsas alarmas a diario. Si la configuración la produce el agente vía una llamada a herramienta, la mitad estructural incluso se puede mover aguas arriba a la capa de la API con `strict: true`[^S6].

**2. CSV ordenado → un script lo carga y comprueba propiedades.**
Comprueba que los nombres de las columnas estén bien, que la cantidad de filas esté bien, y que las filas adyacentes tengan montos monótonamente no crecientes. La tercera es el núcleo de la tarea; las dos primeras evitan el «el orden está bien pero falta la mitad de los datos». Esta en particular no debería usar comparación con archivo fixture: el fin de línea, el formato numérico (`1000` frente a `1000.00`) y los espacios finales son todos espurios, y cambiar los datos de entrada invalida el fixture.

**3. Resumen en texto libre → las comprobaciones deterministas sostienen el piso, el juicio de calidad pasa a la Lección 4.**
Las salidas de investigación son difíciles de evaluar por programa, porque son texto de forma libre y rara vez tienen una única respuesta correcta[^S2]. El piso igual se puede sostener: cantidad de palabras dentro del rango requerido, que aparezcan las entidades especificadas (nombres, nombres de producto, trimestres), y que no haya números que no vengan del informe original. Pero el «¿captó los puntos clave?» o el «¿malinterpretó la intención?» necesitan la puntuación de un juez LLM sobre una rúbrica: eso es contenido de la Lección 4.

**4. Parche de código → suite de pruebas, código de salida de la compilación y linter, con la revisión humana como respaldo.**
Las soluciones de código son verificables mediante pruebas automatizadas[^S1], y esos tres están justo en el menú oficial de comprobaciones[^S4]. Pero **las pruebas automatizadas ayudan a verificar la funcionalidad; para asegurar que las soluciones se alineen con los requisitos más amplios del sistema, la revisión humana sigue siendo crucial**[^S1]: el parche puede pasar todas las pruebas y aun así ser un diseño que mata la mantenibilidad.

**5. Lista de nombres de archivo → comparación de conjuntos (ordenar primero y después comparar, o usar `Set`).**
El **orden** de los nombres de archivo normalmente no carga significado; que `a.csv` se procesara antes o después de `b.csv` no afecta si la tarea está completa. Una comparación ordenada línea por línea va a dar falsas alarmas por un orden distinto. Agrega una comprobación más: si estos archivos de verdad existen en disco; que el agente reporte archivos procesados que no coinciden con lo que hay en realidad es un modo de falla clásico.

**6. Etiqueta de sentimiento → coincidencia exacta, después de normalizar.**
`output == golden_answer`[^S5], normaliza los espacios en blanco y las mayúsculas y minúsculas antes de comparar. Esto es exactamente en lo que sobresale la coincidencia exacta: tareas con respuestas categóricas y bien delimitadas, con solo tres valores válidos[^S5]. Ojo con que el modelo produzca `Positive.` o `Sentiment: positive`: la normalización tiene que tolerar esa clase de envoltura espuria, o si no, fija el formato de salida bien duro en el prompt.

**Cuáles no se pueden juzgar solo con comprobaciones deterministas:** la 3 por completo, y la capa del «encaja con los requisitos más amplios del sistema» de la 4. Esas dos pasan al juez LLM de la Lección 4, o a las personas.

### Nivel 2: Escribir un `verify.mjs` real

**Planteo de la tarea.** El agente tiene que producir un `report.json` con estos requisitos:

- Tiene `title`, de tipo cadena
- Tiene `items`, un arreglo donde cada ítem tiene `name` (cadena) y `count` (entero)
- Tiene `total` (entero), y `total` es igual a la suma de todos los valores de `count`
- `title` debería coincidir con el título del fixture `Resumen de canales Q1 2026`

Escribe un script de Node `verify.mjs` que haga tres capas de comprobaciones: **validación de estructura**, **comprobación de consistencia de `total`** y **comparación del título tras normalizar los espacios en blanco**. El uso es `node verify.mjs report.json`, sale con 0 cuando pasa, y sale con 1 cuando falla e imprime las razones una por línea.

Después de escribirlo, crea tres archivos de muestra para validarlo: uno completamente correcto, uno donde `total` está genuinamente mal calculado, y uno de «todo el contenido correcto pero el título tiene espacios de más». El tercero tiene que pasar: es tu prueba de que la normalización rescató un falso negativo.

<!-- hint -->
Las tres capas tienen un orden de dependencia: cuando la estructura no pasa, no te apures a calcular `total`. Si `items` ni siquiera es un arreglo, llamar a `.reduce()` sobre él va a lanzar una excepción, y convierte un claro «items no es un arreglo» en un rastro de pila difícil de leer. El patrón es: la capa de estructura recolecta errores y retorna temprano; las dos capas siguientes solo se ejecutan si la estructura pasó.

<!-- hint -->
Al normalizar el título, `trim()` solo quita los espacios de los extremos, no va a quitar el espacio de más entre palabras. Para manejar las dos cosas, usa `text.replace(/\s+/g, " ").trim()`: primero pliega todos los espacios consecutivos (incluidos saltos de línea y tabulaciones) en un único espacio normal, y después recorta los extremos. Para comprobar enteros, no uses `typeof x === "number"`: `3.5` también es un número. Usa `Number.isInteger(x)`.

<!-- rubric -->
- Usa el código de salida para expresar el veredicto: `process.exit(0)` cuando pasa, `process.exit(1)` cuando falla
- La validación de estructura cubre que `title` sea una cadena, que `items` sea un arreglo, que cada ítem tenga un `name` de tipo cadena y un `count` entero, y que `total` sea entero
- La falla de parseo del JSON se captura por separado y se reporta como un error legible, sin dejar que la excepción tumbe el proceso
- Cuando la validación de estructura falla, retorna temprano sin ejecutar la suma ni la comparación
- La consistencia de `total` usa la «suma de todos los valores de `count`» calculada al vuelo, no comparada con un número escrito en duro
- La comparación de `title` normaliza antes de comparar, como mínimo plegando los espacios consecutivos y recortando los extremos
- Los mensajes de falla tanto de `total` como de `title` incluyen el valor esperado y el valor real
- Los veredictos de los tres archivos de muestra son PASS, FAIL (`total` no coincide) y PASS, y el pase del tercero se debe demostrablemente a la normalización

<!-- answer -->
Script completo:

```javascript
// verify.mjs
import { readFileSync } from "node:fs";

const GOLDEN_TITLE = "Resumen de canales Q1 2026";

// Normalizar: plegar los espacios consecutivos, recortar los extremos, unificar mayúsculas y minúsculas
function normalize(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function verify(raw) {
  const errors = [];

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { pass: false, errors: [`falló el parseo del JSON: ${err.message}`] };
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { pass: false, errors: ["el nivel superior no es un objeto JSON"] };
  }

  // Primera capa: validación de estructura
  if (typeof data.title !== "string") {
    errors.push("falta title o no es una cadena");
  }
  if (!Array.isArray(data.items)) {
    errors.push("falta items o no es un arreglo");
  } else {
    data.items.forEach((item, i) => {
      if (item === null || typeof item !== "object") {
        errors.push(`items[${i}] no es un objeto`);
        return;
      }
      if (typeof item.name !== "string") {
        errors.push(`falta items[${i}].name o no es una cadena`);
      }
      if (!Number.isInteger(item.count)) {
        errors.push(`falta items[${i}].count o no es un entero`);
      }
    });
  }
  if (!Number.isInteger(data.total)) {
    errors.push("falta total o no es un entero");
  }

  // La estructura falla, no sigas o los errores se van a encadenar
  if (errors.length > 0) {
    return { pass: false, errors };
  }

  // Segunda capa: consistencia de total
  const sum = data.items.reduce((acc, item) => acc + item.count, 0);
  if (sum !== data.total) {
    errors.push(`total no coincide: declarado ${data.total}, la suma de los count de items da ${sum}`);
  }

  // Tercera capa: comparación del título, normalizando primero
  if (normalize(data.title) !== normalize(GOLDEN_TITLE)) {
    errors.push(
      `title no coincide: normalizado da "${normalize(data.title)}", se esperaba "${normalize(GOLDEN_TITLE)}"`
    );
  }

  return { pass: errors.length === 0, errors };
}

const path = process.argv[2];
if (!path) {
  console.error("Uso: node verify.mjs <report.json>");
  process.exit(2);
}

const result = verify(readFileSync(path, "utf8"));
if (result.pass) {
  console.log(`PASS  ${path}`);
  process.exit(0);
}
console.log(`FAIL  ${path}`);
for (const e of result.errors) {
  console.log(`  - ${e}`);
}
process.exit(1);
```

Tres muestras. `good.json`, todo correcto:

```json
{
  "title": "Resumen de canales Q1 2026",
  "items": [
    { "name": "Venta directa", "count": 12 },
    { "name": "Distribuidores", "count": 30 },
    { "name": "Autoservicio en línea", "count": 8 }
  ],
  "total": 50
}
```

`broken.json`: `items` y `title` idénticos a `good.json`, solo se cambió la última línea, con `total` genuinamente mal calculado (12 + 30 + 8 = 50, pero escribió 48):

```json
  "total": 48
```

`spacey.json`: `items` y `total` idénticos a `good.json`, solo se cambió el título por una versión con espacios al principio y al final, dos espacios de más en el medio y un salto de línea al final. Este es el caso del falso negativo:

```json
  "title": "  Resumen de   canales Q1 2026\n",
```

Ejecútalo (`node --version` es v26.3.0; el script no usa sintaxis nueva, así que las versiones más viejas también funcionan):

```text
$ for f in good.json broken.json spacey.json; do node verify.mjs "$f"; echo "  exit code: $?"; done
PASS  good.json
  exit code: 0
FAIL  broken.json
  - total no coincide: declarado 48, la suma de los count de items da 50
  exit code: 1
PASS  spacey.json
  exit code: 0
```

Los tres veredictos corresponden a tres puntos clave de esta lección. Que `good.json` pase es la línea base. `broken.json` queda atrapado, y el mensaje de falla trae el valor esperado y el real (`declarado 48, la suma de los count de items da 50`): el agente lee esta línea y sabe qué número arreglar. `spacey.json` pasa; si la comparación de `title` estuviera escrita byte por byte, este daría una falla falsa, y el agente gastaría el turno siguiente jugueteando con un salto de línea que no tiene relación con la tarea; la normalización es lo que rescató este falso negativo. Toma el `strict.mjs` de la sección de la trampa y ejecútalo sobre el mismo archivo para ver cómo se ve sin normalización:

```text
$ node strict.mjs spacey.json
FAIL: title no coincide, se obtuvo "  Resumen de   canales Q1 2026\n"
```

<!-- /exercises -->

## Resumen

- El principio de ordenamiento de los métodos de calificación es «el más rápido, el más confiable, el más escalable»; la calificación basada en código queda primera en los tres, y la contrapartida es que le falta matiz para los juicios complejos que necesitan menos rigidez de reglas[^S5].
- Una comprobación puede ser cualquier cosa que devuelva una señal que Claude pueda leer en la conversación: una suite de pruebas, el código de salida de una compilación, un linter, un script que compare la salida con un fixture, o una captura de pantalla comparada con un diseño[^S4].
- Los verificadores forman un espectro; el borde izquierdo es la coincidencia exacta de cadenas con un fixture, el borde derecho es pedirle a Claude que juzgue[^S3]; la forma mínima es apenas `output == golden_answer`, normalmente después de normalizar los espacios en blanco y las mayúsculas y minúsculas, perfecta para las tareas con respuestas categóricas y bien delimitadas[^S5].
- Con un aprobado/fallido, el bucle se cierra solo: hace el trabajo, ejecuta la comprobación, lee el resultado, itera hasta que pasa[^S4]; y eso es porque los agentes necesitan la ground truth del entorno en cada paso para evaluar su progreso[^S1], y por lo mismo pueden iterar usando los resultados de las pruebas como retroalimentación[^S1].
- Los flujos de trabajo complejos se pueden dividir en puntos de control de verificación discretos donde deberían haber ocurrido cambios de estado específicos, en lugar de validar cada paso intermedio[^S2]; una clase de validación de estructura incluso se puede mover aguas arriba a la capa de la API con `strict: true`, para que las llamadas a herramientas se ajusten estrictamente al esquema[^S6].
- La trampa más grande son los verificadores demasiado estrictos: rechazan respuestas correctas por diferencias espurias como el formato, la puntuación o formulaciones alternativas válidas[^S3]. El arreglo es normalizar primero y comparar después, y guardar el rigor para las partes que de verdad cargan significado.
- Las comprobaciones deterministas tienen un techo: las salidas de investigación son difíciles de evaluar por programa[^S2]; las pruebas automatizadas verifican la funcionalidad, pero para asegurar que las soluciones se alineen con los requisitos más amplios del sistema, la revisión humana sigue siendo crucial[^S1], e incluso con evaluaciones automatizadas maduras, las pruebas manuales siguen siendo esenciales[^S2].
- No construyas un verificador completo para un script de una sola vez: habría que considerar agregar complejidad solo cuando mejora los resultados de manera demostrable[^S1]; pero en la otra dirección, si no lo puedes verificar, no lo lances[^S4].

[>> Lección 4: Juez LLM: rúbricas, formatos y lo que no debes dejarle juzgar](./04-llm-as-judge.md)
