# Lección 1: «Parece terminado» no es «está terminado»

> Objetivos de aprendizaje:
> - Explicar por qué Claude se detiene cuando el trabajo *parece* terminado, y quién termina haciendo la verificación cuando eso pasa
> - Usar el contraste entre sistemas deterministas y no deterministas para explicar por qué los supuestos de las pruebas tradicionales —«entrada X, camino Y, salida Z»— se derrumban con los agentes
> - Ante un reporte de finalización, distinguir qué enunciados son afirmaciones y cuáles son evidencia, e identificar qué falta todavía para el visto bueno
>
> Requisitos: Terminaste los primeros 9 cursos de esta serie; escribes a mano bucles de arnés guiados por `stop_reason`; entiendes los puntos de control y la recuperación | Siguiente: [Lección 2 >>](./02-what-to-verify.md)

## Se lanzó el martes, se rompió el viernes

El martes por la tarde le pides a un agente que agregue una función de «importación masiva de usuarios» a un panel de administración interno: subir un CSV, parsearlo, validar los campos, escribir en la base de datos. Dejas los requisitos bien claros y te vas a una reunión.

Cuando vuelves, la sesión ya se detuvo. El último mensaje se ve así:

```text
Listo.

- Agregué src/importer/parseCsv.js para el parseo y el mapeo de campos
- Agregué src/importer/validate.js para revisar el formato del email y los campos obligatorios
- Conecté la inserción por lotes en POST /api/users/import

La implementación sigue el estilo de código de los módulos existentes. Sin errores durante la ejecución.
```

Le echas un vistazo al diff. Las funciones están bien separadas, los nombres coinciden con los de los módulos vecinos, los casos límite parecen contemplados: los archivos vacíos devuelven un error explícito, la expresión regular del email no está rota de manera evidente. Lo fusionas. Lo lanzas.

El viernes por la tarde, operaciones escribe en el canal: «¿Por qué acabamos de importar 400 usuarios vacíos?».

La causa es sencilla. Operaciones generó ese CSV con un «Guardar como» desde Excel, lo que agregó un BOM: tres bytes invisibles `﻿` que a Excel le gusta anteponer a los archivos UTF-8. Así, el nombre de la primera columna se parseó como `﻿email` en lugar de `email`, todo el mapeo de campos se cayó, y cada fila terminó siendo «todos los campos son undefined». ¿Y esa capa de validación? Revisaba «si el formato del email es válido», pero undefined tomó otra rama y se trató como «esta columna no se llenó», así que pasó.

Nadie hizo las cosas a medias. El agente escribió código que funciona. Se probó a sí mismo con un CSV que él mismo generó, y por supuesto su propio CSV no tiene BOM. Cuando revisaste el diff, estabas comprobando «si este código está bien escrito», no «qué pasa cuando este código se encuentra con una entrada del mundo real». Ambas partes hicieron su mejor esfuerzo. La brecha ocurrió igual.

El problema está en **el momento en que se detuvo**. Cuando el agente se detuvo, lo que tenía era «lo escribí, lo leí una vez, se ve bien». No se detuvo en «confirmé que está terminado». Se detuvo en «parece terminado». Y en el historial de la conversación no puedes distinguir la diferencia.

## Se detiene donde las cosas parecen terminadas

La documentación de Claude Code lo dice sin rodeos: Claude se detiene cuando el trabajo parece terminado; sin una comprobación que pueda ejecutar, «parece terminado» es la única señal disponible, y tú te conviertes en el bucle de verificación: cada error espera a que tú lo notes[^S4].

Vale la pena leer esta oración dos veces, palabra por palabra. No dice «Claude a veces hace las cosas a medias» ni «el modelo todavía no da la talla». Describe un hecho estructural: **si nada en todo el pipeline puede producir un resultado objetivo, entonces «parece terminado» es la única señal que existe en ese sistema.** El modelo solo puede decidir con esa señal. No tiene ninguna otra.

La misma documentación le pone nombre a este fenómeno: la brecha de confiar-y-después-verificar, donde Claude produce una implementación de apariencia plausible que no maneja los casos límite[^S4]. En palabras simples: primero confías (el código se ve bien), y la verificación o no ocurre o llega demasiado tarde (el viernes por la tarde, en el canal de operaciones). El ejemplo del BOM de arriba es la forma estándar de esta brecha: el código no está mal, pero nadie preguntó «¿qué pasa con un archivo exportado desde Excel?».

Hay una segunda capa que es fácil pasar por alto. La solución que sugiere la documentación termina así: **si no lo puedes verificar, no lo lances**[^S4]. El énfasis no está en «verificar», está en «no lo lances». Reconoce que hay cosas que simplemente no puedes verificar. Cuando no puedes, la jugada correcta no es «esta vez confía en tu instinto». Es reducir el alcance, cambiar el requisito o postergar el lanzamiento.

## Afirmaciones frente a evidencia: ¿cuál es la diferencia?

Vuelve a ese mensaje de finalización. Divídelo en oraciones sueltas y hazte la misma pregunta con cada una: **¿puedo confirmar esta oración sin leer código, usando solo lo que me mostró?**

- «Agregué `src/importer/parseCsv.js`»: lo puedes confirmar. Que el archivo exista se comprueba de un vistazo. Esto es evidencia (aunque de la clase más débil).
- «La implementación sigue el estilo de código de los módulos existentes»: no lo puedes confirmar. Es un juicio estético del modelo. Afirmación.
- «Sin errores durante la ejecución»: suena a evidencia, pero en realidad es una afirmación. Dice que las herramientas que llamó no lanzaron excepciones, no que la salida sea correcta. Que todas las herramientas devuelvan éxito mientras el resultado está completamente mal: totalmente posible.
- «Revisar el formato del email y los campos obligatorios»: no lo puedes confirmar. Esto describe la intención, no el comportamiento. ¿Qué permite o rechaza en realidad esa expresión regular? Esta oración no dice nada al respecto.

¿Dónde está la línea? **La evidencia es algo que una segunda persona puede volver a ejecutar exactamente igual**: un comando con su salida en bruto, un código de salida, una lista de nombres de pruebas que fallaron, una captura de pantalla, una comparación numérica de antes y después. **Las afirmaciones son cosas que solo puedes elegir creer o no**: «la lógica es correcta», «debería estar bien», «ya está optimizado», «no va a volver a pasar».

La documentación oficial traza exactamente esta línea: haz que Claude muestre evidencia en lugar de afirmar el éxito: la salida de las pruebas, el comando que ejecutó y lo que devolvió, o una captura de pantalla del resultado. Revisar evidencia es más rápido que volver a ejecutar la verificación tú mismo, y funciona para las sesiones que no estuviste mirando[^S4].

Esa última media oración es la clave. Si estuviste mirando todo el tiempo, la distinción entre «afirmación» y «evidencia» no te aporta mucho: lo viste tú mismo. Pero en el momento en que apartas la vista, lo único que queda en el historial de la conversación es texto, y en el texto las afirmaciones se ven tan seguras como la evidencia.

## Por qué los agentes chocan especialmente con este problema

El «se ve bien pero está mal» también lo vemos en el software tradicional. ¿Por qué merece una lección propia en el caso de los agentes?

Porque las pruebas tradicionales descansan sobre un supuesto que los agentes no cumplen.

Empecemos por las definiciones. En computación, los sistemas deterministas producen la misma salida cada vez que reciben entradas idénticas, mientras que los sistemas no deterministas —como los agentes— pueden generar respuestas variadas incluso con las mismas condiciones iniciales[^S3]. Esto no es «tiene errores y por eso es inestable». Así es como funciona. Aunque no cambies nada en tu prompt, no hay garantía de que las decisiones de dos ejecuciones coincidan[^S2].

Así que la premisa de la evaluación tradicional se derrumba. Las evaluaciones tradicionales suelen suponer que la IA sigue los mismos pasos cada vez: dada la entrada X, el sistema debería seguir el camino Y para producir la salida Z[^S2]. Los sistemas multiagente no funcionan así. **Incluso con puntos de partida idénticos, los agentes podrían tomar caminos válidos completamente distintos para llegar a su objetivo**: un agente podría buscar en tres fuentes mientras otro busca en diez, o podrían usar herramientas distintas para encontrar la misma respuesta[^S2].

Así se ve en concreto:

```text
Misma tarea, mismo prompt, dos ejecuciones

Ejecución 1: read_file(schema.sql) → grep("user_id") → edit(models/user.js)
             → run_tests → listo

Ejecución 2: list_dir(src/) → read_file(models/user.js) → read_file(models/order.js)
             → edit(models/user.js) → edit(models/order.js) → run_tests
             → run_tests → listo
```

No puedes llamar «incorrecta» a ninguna de las dos trayectorias. La segunda ejecución leyó un archivo de más, modificó un lugar de más y ejecutó las pruebas dos veces: quizá dio un rodeo, o quizá detectó un acoplamiento que la primera ejecución se perdió. Si escribes una aserción que dice «debe leer schema.sql primero», la segunda ejecución falla, y sin embargo puede que la segunda ejecución haya hecho un mejor trabajo.

**Cotejar la trayectoria con un guion prescrito no funciona aquí**: como no siempre sabemos cuáles son los pasos correctos, por lo general no podemos limitarnos a comprobar si los agentes siguieron los pasos «correctos» que prescribimos de antemano[^S2].

Agrega una capa más: los errores en los sistemas de agentes **se componen**. Un fallo menor del software tradicional, cuando le toca a un agente, puede descarrilar la tarea entera: que un paso falle puede llevar a los agentes a explorar trayectorias completamente distintas, con resultados impredecibles[^S2]. Esto no es como un programa tradicional donde «una función devuelve un valor malo y se propaga hacia arriba». Un agente toma un mal resultado y **toma decisiones nuevas a partir de ese mal resultado**: si lee mal un archivo, podría concluir que «este módulo no existe» y crear uno nuevo; y después sigue trabajando alrededor de ese módulo nuevo. Para cuando ves la salida final, el error ya no está en su lugar original. Creció hasta convertirse en otra cosa.

La propia conclusión de Anthropic aterriza aquí: la naturaleza autónoma de los agentes implica costos más altos y el potencial de errores que se componen. Recomiendan pruebas exhaustivas en entornos de sandbox, junto con los guardrails adecuados[^S1]. Y una línea más, directa: el LLM operará potencialmente durante muchos turnos, y debes tener cierto nivel de confianza en su toma de decisiones[^S1].

Fíjate en la formulación «cierto nivel de confianza». No dice «tienes que confiar en él». Dice que esa confianza tiene que venir de algún lado. Y la confianza tiene solo dos fuentes: lo miraste tú mismo (con lo cual el agente no te ahorró nada de tiempo), o algo lo miró por ti. Todo este curso trata de la segunda.

```agentmentor-check
{
  "id": "vq-zh-01-plausible-not-correct",
  "label": "Decidir si confiar en este reporte de finalización",
  "prompt": "Le pides a un agente que agregue una función de «dividir el monto por moneda» al módulo de facturación. Recorre unas veinte llamadas a herramientas y al final reporta: «Listo. La implementación cumple los requisitos. Sin errores durante la ejecución.» Le echas un vistazo al diff: la estructura es razonable, los nombres siguen las convenciones, no hay problemas evidentes. El proyecto tiene una suite de pruebas, pero el agente no la ejecutó y tú tampoco. ¿Qué deberías hacer a continuación?",
  "whyHere": "La primera mitad de la lección acaba de explicar por qué los agentes se detienen en «parece terminado»; la segunda mitad mostrará cómo darles una comprobación que puedan ejecutar. Esta pregunta va en el medio y te obliga a emitir un juicio concreto antes de llegar a los principios que lo sustentan: primero el juicio, y después los principios se fijan mejor.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No hubo errores en el proceso y el diff se ve bien: fusionarlo. Si hay un problema real, va a salir a la luz aguas abajo.",
      "correct": false,
      "feedback": "«Sin errores» significa que las herramientas que llamó no lanzaron excepciones, no que la salida sea correcta: que todas las herramientas devuelvan éxito y que el resultado esté completamente mal pueden ser ciertas a la vez. Y en cuanto a «va a salir a la luz aguas abajo»: así se ve exactamente que tú te conviertas en el bucle de verificación, solo que el momento de la verificación quedó aplazado hasta después de una falla. Con montos de facturación, para cuando sale a la luz aguas abajo, contabilidad ya suele estar haciendo preguntas."
    },
    {
      "id": "b",
      "text": "Ejecutar primero la suite de pruebas, dejar que este cambio obtenga un resultado de aprobado/fallido y después decidir si confiar en él.",
      "correct": true,
      "feedback": "Correcto. El valor de este paso no es «ejecuté una prueba». Es que convertiste una situación que solo podías juzgar por intuición en una situación con un resultado objetivo. Y este paso se puede mover más temprano: como esta comprobación existe y tú conoces el comando, la próxima vez puedes decirle al agente de entrada «después del cambio, ejecuta npm test; avísame cuando esté todo en verde». Y entonces no eres tú quien lee el resultado."
    },
    {
      "id": "c",
      "text": "Mandar otra ronda pidiéndole al agente que se revise a sí mismo; si dice que no hay problema, fusionarlo.",
      "correct": false,
      "feedback": "Esta intuición es común, pero está al revés. El modelo que hizo el trabajo no debería ser además el árbitro: el consejo de la documentación oficial es que un modelo nuevo, con el contexto limpio, intente refutar el resultado. Cuando se revisa a sí mismo, sigue mirando el razonamiento que acaba de escribir, que ya era coherente consigo mismo; si no, no lo habría escrito así en primer lugar. Pedirle que «lo mire otra vez» casi siempre solo repite el mismo juicio en un tono más seguro."
    }
  ]
}
```

## La salida: darle una comprobación que pueda ejecutar

Todo ese planteo aterriza en una sola oración: **dale a Claude una comprobación que pueda ejecutar**: pruebas, una compilación, una captura de pantalla para comparar. Es la diferencia entre una sesión que miras y una de la que te puedes alejar[^S4].

¿De dónde sale la diferencia? Dale a Claude algo que produzca un aprobado o un fallido y el bucle se cierra solo. Claude hace el trabajo, ejecuta la comprobación, lee el resultado e itera hasta que la comprobación pasa[^S4].

Puedes mapear esta oración de vuelta al bucle de arnés del curso 7 de esta serie. Primero mira dónde se detiene tu bucle actual:

```javascript
let response = await client.messages.create({ tools, messages });
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ tools, messages });
}
// El bucle se detiene aquí: stop_reason pasó de "tool_use" a "end_turn"
```

¿Qué significa `end_turn`? Significa que el modelo cree que terminó de hablar en este turno. **Eso es todo.** No significa que el trabajo esté correcto, y ni siquiera garantiza que la respuesta esté completa: este bucle solo reconoce `tool_use`; si `stop_reason` pasa a ser cualquier otra cosa, va a salir, incluso cuando la salida quedó cortada a mitad de una oración por `max_tokens`. Nada en la condición de salida tiene que ver con la «calidad de la salida».

Entonces, ¿cómo se ve conectar una comprobación? Hay dos posiciones que funcionan.

Posición uno: convertir la comprobación en una herramienta que pueda llamar, y dejar que se ejecute dentro del bucle:

```javascript
const tools = [
  ...editTools,
  {
    name: "run_checks",
    description:
      "Ejecuta la suite de pruebas del módulo importer. Devuelve el código de salida y los nombres de las pruebas que fallaron. " +
      "Debe llamarse una vez después de modificar cualquier archivo bajo src/importer/.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];
```

Posición dos: agregar una compuerta después de que el bucle sale; no confíes en su autorreporte, ejecútala tú mismo:

```javascript
// el bucle while terminó, no lo trates todavía como completado
messages.push({ role: "assistant", content: response.content }); // la respuesta de cierre del modelo también va al historial
let verdict = await runChecks(); // { exitCode, failed: ["parseo del encabezado con BOM", ...] }

while (verdict.exitCode !== 0) {
  messages.push({
    role: "user",
    content: `Las comprobaciones no pasaron. Pruebas fallidas: ${verdict.failed.join(", ")}. Corrígelas y avisa.`,
  });
  response = await client.messages.create({ tools, messages });
  // …de vuelta al bucle tool_use de arriba, hasta que vuelva a cerrar…
  messages.push({ role: "assistant", content: response.content }); // cada respuesta de cierre va al historial
  verdict = await runChecks();
}
```

El código en sí no tiene trucos. La clave es que **la condición de salida cambió de dueño**: de «el modelo dice que no quiere llamar más herramientas» a «un pedazo de código determinista devolvió 0». Lo primero es la autoevaluación del modelo. Lo segundo no.

¿Y qué puede ser una «comprobación»? La documentación oficial da un rango más amplio de lo que esperarías: la comprobación es cualquier cosa que devuelva una señal que Claude pueda leer en la conversación: una suite de pruebas, el código de salida de una compilación, un linter, un script que compare la salida con un fixture, o una captura de pantalla del navegador comparada con un diseño[^S4].

Aclaremos «fixture»: es un «archivo de respuesta de referencia» que guardaste de antemano; después de ejecutar, comparas la salida con él, y no puede diferir ni en un carácter. Suena tosco, pero para las tareas del tipo «el formato de salida debe ser estable» es la forma de comprobación más simple y más confiable.

Esta línea de pensamiento se alinea con la recomendación de Anthropic para la ejecución de agentes: durante la ejecución, es crucial que los agentes obtengan la «ground truth» del entorno en cada paso (por ejemplo, los resultados de las llamadas a herramientas o la ejecución de código) para evaluar su progreso[^S1]. Fíjate en «del entorno», no de su propio razonamiento. El razonamiento del modelo lo genera él mismo. Los valores que devuelve el entorno, no.

## Qué resuelven las cinco lecciones siguientes

Con «darle una comprobación que se pueda ejecutar» como hilo conductor, las preguntas que quedan se vuelven concretas.

**Lección 2: qué verificar.** Si cotejar la trayectoria con un guion prescrito no funciona, ¿qué compruebas? Respuesta: primero el estado final; evalúa si alcanzó el estado final correcto, no si siguió algún proceso específico; para los flujos de trabajo complejos, divide la evaluación en puntos de control discretos donde deberían haber ocurrido cambios de estado específicos[^S2]. Esta lección también cubre cómo convertir un requisito difuso en un criterio de éxito medible.

**Lección 3: verificadores deterministas.** Cómo elegir y escribir comprobaciones que puedan producir un aprobado/fallido. Coincidencia exacta, comparación por script, suites de pruebas: qué encaja dónde, y una trampa contraintuitiva: un verificador demasiado estricto va a rechazar respuestas correctas. El catálogo concreto de verificadores y el orden de prioridad van en esa lección; aquí no los desarrollamos.

**Lección 4: el juez LLM.** El texto de forma libre no admite comparación de cadenas; hay que pedirle a un modelo que lo puntúe. Cómo escribir rúbricas, cómo restringir el formato de salida, si conviene razonar primero o puntuar primero, y por qué el modelo que hizo el trabajo no debería calificarse a sí mismo: ya lo tocamos en el cuestionario de más arriba. El diseño concreto de rúbricas va en la lección 4.

**Lección 5: los conjuntos de evaluación.** Una comprobación se ocupa de una tarea; un conjunto de tareas forma un conjunto de evaluación. Cómo recolectar casos del uso real, cómo completar los casos límite, para qué sirve un conjunto reservado y «cuántos alcanzan»: todo se responde en la lección 5; la respuesta puede ser más chica de lo que crees.

**Lección 6: constrúyelo tú mismo.** Conecta las cinco lecciones anteriores: cada tarea de evaluación recibe un bucle de arnés, lo ejecutas y produce un reporte; cambias una versión del prompt y ves si la puntuación se movió.

## Proporcionalidad: no envuelvas cada cosita en un proceso de visto bueno

Llegados a este punto, es fácil irse al otro extremo: suponer que toda tarea necesita pruebas, un juez y un conjunto de evaluación. No es así.

La línea original de Anthropic es: **la clave del éxito, como con cualquier funcionalidad basada en LLM, es medir el desempeño e iterar sobre las implementaciones. Lo repetimos: habría que considerar agregar complejidad solo cuando mejora los resultados de manera demostrable**[^S1]. El mismo artículo trae una recomendación de ruta más específica: empieza con prompts simples, optimízalos con una evaluación exhaustiva, y agrega sistemas agénticos de varios pasos solo cuando las soluciones más simples se queden cortas[^S1].

Aplicado a la verificación, los criterios de decisión se reducen a unas pocas líneas:

- **¿Esta tarea se va a ejecutar repetidamente?** Un script de una sola vez, un procesamiento de datos ad hoc, un trabajo de tres minutos que piensas mirar: montar un mecanismo de visto bueno es una pérdida neta. Las cosas que se ejecutan repetidamente, que otros modifican o que se ejecutan cuando no estás cerca: ahí vale la pena.
- **¿Quién carga con el costo de un error?** Corriges mal un typo, lo reviertes tú mismo y listo. Rompes la lógica de facturación y el costo lo carga contabilidad. Cuanto más aguas abajo esté el costo y más difícil sea revertirlo, más deberías ponerle una compuerta por adelantado.
- **¿Cuánto tiempo dedicas ahora a verificarla?** Si cada vez tienes que abrir tres páginas a mano y compararlas, poner esa comparación de tres páginas en un script es lo que más merece automatizarse: ya estás pagando ese costo, solo que no lo habías notado.

Un caso más que merece mención aparte: **algunas comprobaciones ya las tienes, solo que no las conectaste al agente.** Esa suite de pruebas del proyecto, ese comando de lint, ese script de compilación: lo más probable es que ya existieran. Escribirlos en la descripción de la tarea o convertirlos en una herramienta no cuesta casi nada, pero la naturaleza de la sesión cambia. Este es el paso de mayor retorno, y es el punto de partida de las próximas lecciones de este curso.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Distinguir afirmaciones de evidencia

Abajo hay tres reportes de finalización de un agente, de tres sesiones distintas. Para cada uno, juzga: ¿qué partes son afirmaciones y cuáles son evidencia? Después escribe **qué piezas concretas de evidencia le faltan todavía** a cada reporte antes de que lo trates como «visto bueno aprobado».

Respuestas en texto, no hace falta código.

**Reporte A**

```text
Listo. Refactoricé src/importer.js, extraje el mapeo de campos a una función
independiente mapFields(), la lógica quedó mucho más clara que antes. Los cambios
no afectaron el comportamiento existente.
```

**Reporte B**

```text
Listo. Después de ejecutar npm test -- importer, la salida fue:

  PASS  test/importer.test.js
  Tests: 14 passed, 14 total
  Time:  1.842 s

Los 3 casos de prueba nuevos son "handles BOM in header", "rejects duplicate email"
y "errors on missing column". No ejecuté la suite completa, solo este grupo de
importer.
```

**Reporte C**

```text
Listo. Arreglé el problema donde el BOM del encabezado hacía fallar el mapeo de
campos. Revisé el código dos veces, la lógica es correcta, no deberían volver a
aparecer problemas similares. Además, de paso optimicé un poco el rendimiento del
parseo.
```

<!-- rubric -->

- Los tres reciben un juicio de «mayormente afirmaciones / mayormente evidencia», y los resultados son: B es mayormente evidencia (el único de los tres cercano a estar listo para el visto bueno), A y C son mayormente afirmaciones
- Para cada reporte se identifica al menos una pieza **concreta** de evidencia faltante —en forma de un comando con su salida en bruto, una comparación de fallido a aprobado, números de antes y después, etcétera—, no un vago «faltan pruebas»
- Se señala que «revisé el código dos veces» en C es el modelo que hizo el trabajo calificándose a sí mismo, lo cual no cuenta como verificación independiente; y se nota que «optimicé un poco el rendimiento» es un cambio fuera de alcance sin ningún dato de línea base de antes y después que lo respalde
- Se identifica la oración más peligrosa del reporte A: «los cambios no afectaron el comportamiento existente»; es una afirmación completamente verificable (la definición de refactorización es comportamiento sin cambios), pero el reporte no aporta ninguna verificación, y un enunciado verificable presentado como afirmación es más fácil de dejar pasar que el puro relleno, porque suena a conclusión

<!-- answer -->

**Reporte A: casi por completo afirmaciones.**

- «Extraje el mapeo de campos a una función independiente `mapFields()`»: evidencia débil. Que la función exista y cómo se llama se puede confirmar desde el diff, pero eso solo prueba que el cambio ocurrió, no que el cambio sea correcto.
- «La lógica quedó mucho más clara que antes»: afirmación. Es un juicio estético; no es verificable y no es lo que le debería importar al visto bueno.
- «Los cambios no afectaron el comportamiento existente»: **esta es la oración más peligrosa**. Es una afirmación completamente verificable (la definición de refactorización es comportamiento sin cambios), pero el reporte no aporta ninguna verificación. Un enunciado verificable dicho como afirmación se cuela más fácil que el puro relleno, porque suena a conclusión.

Qué falta todavía para el visto bueno:

1. La salida de las pruebas de antes y de después de la refactorización, hacen falta las dos copias, mostrando que la cantidad de pruebas y la cantidad de aprobadas se mantuvieron iguales (esta es la evidencia mínima de «comportamiento sin cambios»)
2. Si `importer.js` no tenía cobertura de pruebas desde el principio, eso hay que decirlo de entrada: «no hay pruebas, así que no puedo probar que el comportamiento no cambió» es un estado honesto, mucho más útil que «los cambios no afectaron el comportamiento existente»
3. El alcance del cambio: `git diff --stat`, confirmando que solo tocó `src/importer.js` y que no modificó nada más de paso

**Reporte B: mayormente evidencia.**

- El comando `npm test -- importer` con su salida en bruto: puedes volver a ejecutar esto exactamente igual. Esta es la forma estándar de la evidencia.
- Se listan los tres nombres de las pruebas nuevas; puedes ver qué direcciones cubren (BOM, email duplicado, columna faltante).
- «No ejecuté la suite completa, solo este grupo de importer»: esta oración vale. Declara por iniciativa propia lo que no hizo. Cuando un reporte incluye un «no hice X», suele significar que tiene una noción de sus propios límites.

Qué falta todavía para el visto bueno:

1. Los resultados de la suite de pruebas completa. Que pase localmente no descarta que este cambio rompa otro módulo: justo ahí es donde a los errores que se componen les encanta esconderse
2. Los nombres de las pruebas son solo nombres. Qué asegura en realidad `"handles BOM in header"` por dentro, hay que mirarlo en el código fuente o en una salida más detallada; una prueba bien nombrada que no asegura nada igual va a salir en verde
3. Estrictamente hablando, también debería haber un registro de «la vi en rojo primero»: revertir el arreglo y confirmar que estas tres pruebas fallan. Una prueba que nunca estuvo en rojo no puede probar qué está probando

**Reporte C: afirmaciones, más un cambio fuera de alcance sin verificar.**

- «Arreglé el problema donde el BOM del encabezado hacía fallar el mapeo de campos»: afirmación. Dice qué se hizo, no dice cómo resultó.
- «Revisé el código dos veces, la lógica es correcta»: el modelo que hizo el trabajo se está calificando a sí mismo. Cuando vuelve a revisar, está leyendo el razonamiento que acaba de generar, y ese razonamiento ya era coherente consigo mismo. Esta oración no cuenta como verificación independiente.
- «No deberían volver a aparecer problemas similares»: afirmación, y de la clase menos informativa. Formulaciones como «no debería» o «no va a volver a pasar» no contienen nada verificable.
- «De paso optimicé un poco el rendimiento del parseo»: cambio fuera de alcance. Sin números de antes y después, sin decir siquiera dónde cambió ni qué técnica usó. El riesgo aquí es mayor que el del error que arregló: arreglar un error al menos tiene un blanco claro; «optimizar de paso», no.

Qué falta todavía para el visto bueno:

1. Un caso de prueba que reproduzca el problema del BOM, con su salida comparada de fallido a aprobado (lo único que puede probar el «arreglado»)
2. Datos de línea base para la afirmación de rendimiento: los tiempos de antes y después ejecutando la misma entrada, más el método de medición. Si no puede producirlos, la jugada correcta es revertir este cambio y enviarlo por separado, no dejar que se fusione empaquetado con el arreglo del error
3. Los resultados de la suite de pruebas completa: los arreglos de BOM suelen tocar el punto de entrada del parseo, el lugar más fácil para afectar otras ramas sin querer

**Resumen de los tres en una oración**: el criterio de juicio es siempre el mismo, **¿puedo confirmar esta oración sin leer código, usando solo lo que me mostró?** Lo confirmable es evidencia; lo que solo puedes elegir creer o no es afirmación. Que B sea el mejor no es porque sea el más largo; es porque lo que pegó se puede volver a ejecutar exactamente igual.

<!-- hint -->

Hazte la misma pregunta con cada oración: **¿puedo confirmar esto sin abrir el código, usando solo lo que pegó aquí?** Si sí, es evidencia; si solo puedo elegir creer o no, es afirmación. No te dejes llevar por el tono de la oración: «los cambios no afectaron el comportamiento existente» suena muy seguro, pero no te dio nada que puedas verificar.

<!-- hint -->

«Sin errores», «la lógica es correcta», «no debería pasar», «ya está optimizado»: estas formulaciones comparten una cosa: el sujeto siempre es la evaluación que hace el modelo de su propio trabajo. Dale la vuelta: ¿cómo se ve algo realmente verificable? Por lo general lleva líneas de comando, códigos de salida, nombres de pruebas, tiempos, cantidades de líneas —cosas concretas—, y una segunda persona lo puede volver a ejecutar igual. Presta atención especial a las oraciones del reporte A que «podrían verificarse pero no lo hacen»: se cuelan por las defensas más fácil que la pura charla vacía.

### Nivel 2: Diseñar una lista de evidencia para una tarea pequeña

La tarea es esta:

> Escribe un script que elimine las filas duplicadas de `data/contacts.csv` según la columna `email`, conservando solo la **primera aparición** de cada email, y que escriba el resultado de vuelta en el mismo archivo.

Supón que le entregas esta tarea a un agente, se ejecuta y reporta «Listo, duplicados eliminados».

Diseña una **lista de evidencia**: ¿qué cosas necesitas ver para darle el visto bueno a esta tarea? Para cada ítem, escribe con claridad qué forma toma (¿un comando con su salida? ¿una comparación de antes y después? ¿un archivo?). Después responde la segunda pregunta: **cuál de estos puede hacer que el bucle se cierre solo**, es decir, que el agente lo pueda ejecutar, leer el resultado e iterar hasta que pase, sin que tú estés ahí.

Sirve con pseudocódigo o ejemplos de comandos, no hace falta código completo.

<!-- rubric -->

- La lista tiene al menos un ítem en forma de «comando con su salida en bruto», y escribe con claridad qué mirar **antes y después** del cambio, no solo el resultado posterior
- Se identifica de forma explícita qué comprobación puede producir un aprobado/fallido para que el bucle se cierre, con un razonamiento que aterriza en «no necesita que una persona lo interprete, tiene un valor esperado claro» y no en «esta es la más importante»; y se detecta que una métrica sola es burlable: indicadores como «la cantidad de duplicados es 0» se pueden lograr truncando el archivo hasta dejarlo vacío, así que una comprobación que de verdad cierre el bucle tiene que empaquetar «sin duplicados, se conservó la primera aparición, la cantidad de filas coincide con lo esperado» en un solo código de salida, sin depender de ninguna por separado
- Se advierte que «ya no hay duplicados» ≠ «lo hizo bien»; la lista tiene al menos un ítem que protege contra el borrado accidental (por ejemplo, verificar que la fila conservada es la primera aparición, que las filas no duplicadas quedaron intactas, o que hay un respaldo o un `git diff` para revertir)

<!-- answer -->

**Lista de evidencia**

**1. Cantidad de filas antes y después**

```text
Antes del cambio:   wc -l data/contacts.csv   →  1204
Después del cambio: wc -l data/contacts.csv   →  1187
```

Hacen falta los dos números. El número posterior por sí solo no significa nada: no sabes desde qué valor cambió. Fíjate además si la fila de encabezado se está contando; ese desfase de una línea es el más fácil de pasar por alto al dar el visto bueno.

**2. Cantidad de emails duplicados (valor esperado: 0)**

```text
cut -d, -f2 data/contacts.csv | tail -n +2 | sort | uniq -d | wc -l
Antes del cambio   → 17
Después del cambio → 0
```

La clave es que este comando **es independiente del script que escribió el agente**. Si vuelves a ejecutar su propio script para probar que su propio script es correcto, no probaste nada: los errores del script de deduplicación van a aparecer idénticos en la comprobación. Un 0 calculado con un conjunto de herramientas distinto: eso sí es evidencia.

**3. La fila conservada es de verdad la primera aparición**

Elige un email que estuviera duplicado en el archivo original, pega todas sus apariciones (con números de línea), y después pega la única fila que quedó en el archivo resultante:

```text
Antes del cambio:
  grep -n "lucia.mendez@example.com" data/contacts.csv
  42:1042,lucia.mendez@example.com,Lucía Méndez,2024-03-11
  877:1877,lucia.mendez@example.com,Lucía Méndez (importación duplicada),2025-01-20

Después del cambio:
  grep -n "lucia.mendez@example.com" data/contacts.csv
  42:1042,lucia.mendez@example.com,Lucía Méndez,2024-03-11
```

Lo que queda es la línea 42, no la 877. Esta comprobación en particular no la atrapa «la cantidad de duplicados es 0»: borrar cualquiera de las dos filas deja la cantidad de duplicados en 0.

**4. Las filas no duplicadas quedaron intactas**

```text
git diff --stat data/contacts.csv
 data/contacts.csv | 17 -----------------
 1 file changed, 17 deletions(-)
```

Solo borrados, sin agregados, y sin «modificaciones» (que en un diff se ven como un borrado más un agregado). Esto protege contra los «de paso unifiqué los formatos de fecha» o «recorté los espacios en blanco»: cambios fuera de alcance.

**5. Rastro de reversión**

Escribir de vuelta en el archivo original es una operación destructiva. O bien hay una ruta de archivo de respaldo (`data/contacts.csv.bak`), o bien este archivo ya estaba en git y `git checkout` lo puede revertir con un solo comando. Esto no es «probar que está bien»; es «si está mal, lo podemos deshacer», pero pertenece igualmente al visto bueno.

**Cuál puede hacer que el bucle se cierre solo**

El ítem 2 es el que más se acerca, pero **por sí solo no alcanza**.

Primero, por qué se acerca: es la única comprobación de la lista que necesita cero interpretación humana: un comando, un número, un valor esperado claro de 0. El valor devuelto se traduce directo a aprobado/fallido; el agente sabe después de ejecutarlo si pasó. El ítem 1 exige que una persona juzgue si «17 filas menos es razonable», el ítem 3 necesita que una persona mire dos bloques de texto, el ítem 4 necesita que una persona entienda la forma del diff, y el ítem 5 ni siquiera es una comprobación. Solo el ítem 2 puede juzgar por sí mismo.

Ahora, por qué no alcanza: solo protege contra «no dedupliqué bien», no contra «borré de más». `truncate -s 0 data/contacts.csv` vacía el archivo; la cantidad de duplicados sigue siendo 0; esta comprobación sigue pasando en verde. **Le pegó a la métrica, rompió la tarea**: este es ese escenario.

Así que el enfoque correcto es fusionar los ítems 2, 3 y 4 en un solo script de validación, donde las tres aserciones deben pasar para salir con 0:

```javascript
// scripts/check-dedupe.js
// Uso: node scripts/check-dedupe.js <respaldo-del-archivo-original> <archivo-resultante>
// Código de salida 0 = pasa, 1 = falla

const before = readRows(process.argv[2]);
const after = readRows(process.argv[3]);
const failures = [];

// Aserción uno: el resultado no tiene emails duplicados
const emails = after.map((r) => r.email);
if (new Set(emails).size !== emails.length) {
  failures.push("El archivo resultante todavía contiene emails duplicados");
}

// Aserción dos: las filas conservadas son la primera aparición de cada email (protege contra borrar la equivocada)
const expected = [];
const seen = new Set();
for (const row of before) {
  if (seen.has(row.email)) continue;
  seen.add(row.email);
  expected.push(row);
}
if (JSON.stringify(expected) !== JSON.stringify(after)) {
  failures.push("Las filas conservadas no coinciden con la expectativa de 'primera aparición'");
}

// Aserción tres: la cantidad de filas es exactamente la esperada tras la deduplicación (protege contra borrar de más o de menos)
if (after.length !== expected.length) {
  failures.push(`Cantidad de filas no coincide: se esperaban ${expected.length}, hay ${after.length}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("check-dedupe: passed");
```

Fíjate en que la aserción dos en realidad implica la uno y la tres, pero separarlas en tres reportes distintos hace que el agente reciba información de falla más específica y una dirección de arreglo más clara. Darle a las comprobaciones la capacidad de «decir con claridad qué está mal» es tan importante como la comprobación misma.

Con este script, la descripción de la tarea puede pasar a ser: «Antes de deduplicar, respalda el archivo original como `data/contacts.csv.bak`; después de deduplicar, ejecuta `node scripts/check-dedupe.js data/contacts.csv.bak data/contacts.csv`; si el código de salida no es 0, sigue corrigiendo hasta que pase.» En ese punto el agente hace el trabajo, ejecuta la comprobación, lee el resultado e itera hasta pasar: todo el proceso no te necesita ahí[^S4].

El ítem 5 que queda (el rastro de reversión) va mejor fuera del script: que tu código de arnés haga un respaldo sin condiciones antes de ejecutar la tarea. El respaldo no debería depender de que el modelo se acuerde de hacerlo.

<!-- hint -->

La escritura destructiva de vuelta al archivo es el arrecife oculto de este problema. El resultado «los duplicados ya no están» también se logra con `truncate -s 0` para vaciar el archivo. ¿Tu lista bloquea este caso de «métrica lograda, tarea rota»? Piensa primero en esa dirección: ¿qué falta todavía?

<!-- hint -->

Al elegir «cuál puede hacer que el bucle se cierre solo» hay un único criterio: **después de que el agente ejecute esta comprobación, ¿puede saber si pasó sin preguntarle a una persona?** Cualquier cosa que te exija mirar dos bloques de texto o juzgar si «este número es razonable» no cuenta. Piensa también si, cuando ningún ítem califica por sí solo, puedes fusionar varios en un script que juntos produzcan un único código de salida.

<!-- /exercises -->

## Resumen

- Claude se detiene cuando el trabajo **parece** terminado. Sin una comprobación que pueda ejecutar, «parece terminado» es la única señal disponible, y tú te conviertes en el bucle de verificación: cada error espera a que tú lo notes[^S4].
- La documentación oficial le pone nombre a esta brecha: la brecha de confiar-y-después-verificar, donde Claude produce una implementación de apariencia plausible que no maneja los casos límite. La segunda mitad de la solución que la acompaña es igual de importante: **si no lo puedes verificar, no lo lances**[^S4].
- La línea entre afirmaciones y evidencia es «si una segunda persona puede volver a ejecutar esto exactamente igual». Haz que Claude muestre evidencia —la salida de las pruebas, el comando que ejecutó y lo que devolvió, una captura de pantalla del resultado— y no afirmaciones de éxito. Revisar evidencia es más rápido que volver a ejecutar la verificación tú mismo, y funciona para las sesiones que no estuviste mirando[^S4].
- Los agentes son sistemas no deterministas: incluso con las mismas condiciones iniciales pueden generar respuestas variadas[^S3]; incluso con prompts idénticos, no hay garantía de que las decisiones de distintas ejecuciones coincidan[^S2]. Así que el supuesto de la evaluación tradicional —«dada la entrada X, sigue el camino Y, produce la salida Z»— falla[^S2]: puntos de partida idénticos pueden producir caminos completamente distintos pero válidos[^S2].
- Los errores en los sistemas de agentes se componen: que un paso falle puede llevar a los agentes a explorar trayectorias completamente distintas, con resultados impredecibles[^S2]. La autonomía trae costos más altos y el potencial de errores que se componen, así que se recomiendan pruebas exhaustivas en entornos de sandbox con guardrails[^S1].
- La salida es darle una comprobación que se pueda ejecutar. Con algo que produzca un aprobado o un fallido, el bucle se cierra solo: hace el trabajo, ejecuta la comprobación, lee el resultado, itera hasta que pasa[^S4]. La comprobación puede ser una suite de pruebas, el código de salida de una compilación, un linter, un script que compare la salida con un fixture, o una captura de pantalla del navegador comparada con un diseño[^S4].
- Durante la ejecución, deja que el agente obtenga la «ground truth» del entorno en cada paso (resultados de herramientas, resultados de la ejecución de código) para evaluar su progreso, y no de su propio razonamiento[^S1].
- El LLM operará potencialmente durante muchos turnos, y debes tener cierto nivel de confianza en su toma de decisiones[^S1], pero esa confianza tiene que venir de algún lado.
- No envuelvas cada cosita en un mecanismo completo de visto bueno. Habría que considerar agregar complejidad solo cuando mejora los resultados de manera demostrable[^S1]; revisa primero si esta tarea se ejecuta repetidamente, quién carga con el costo de los errores y cuánto tiempo dedicas ahora a verificarla a mano.
- El paso de mayor retorno suele ser este: esa suite de pruebas, ese comando de lint, ese script de compilación de tu proyecto ya existen, solo que todavía no se los conectaste al agente.

[>> Lección 2: Qué verificar: primero el estado final, el proceso como respaldo](./02-what-to-verify.md)
