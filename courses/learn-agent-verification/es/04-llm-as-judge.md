# Lección 4: Juez LLM: rúbricas, formatos y lo que no debes dejarle juzgar

> Objetivos de aprendizaje:
> - Escribir una rúbrica multidimensional para salidas de texto de forma libre, dejar clara la pregunta de cada dimensión y entender que un mismo criterio de éxito suele necesitar varias rúbricas para evaluarse por completo
> - Ajustar la salida del juez a una forma que los programas puedan procesar: primero el razonamiento y después la puntuación, 0.0–1.0 más aprobado/fallido, y explicar por qué una sola llamada suele ser más estable que varios jueces evaluando aspectos separados
> - Reconocer tres modos de fallo de los jueces —calificar su propio trabajo, encontrar problemas siempre porque se les pidió encontrarlos, creerle solo al autorreporte del agente— y dar una mitigación accionable para cada uno
>
> Requisitos: Lecciones 1–3, entender la evaluación «primero el estado final» y la prioridad de los verificadores deterministas | Anterior: [<< Lección 3](./03-deterministic-checks.md) | Siguiente: [Lección 5 >>](./05-eval-sets.md)

## Dónde topa el techo de la Lección 3, y dónde encaja un juez LLM

Le diste una tarea a tu agente de investigación: resumir cómo cambiaron los subsidios nacionales a la carga de vehículos eléctricos en los últimos tres años y producir un informe de dos páginas. Corrió quince minutos, llamó herramientas de búsqueda, descargó PDF, escribió 1.800 palabras. Se lee plausible.

Ahora quieres verificarlo. Ninguna de las verificaciones deterministas de la Lección 3 aplica aquí: no hay suite de pruebas que ejecutar, no hay código de salida de compilación que leer, no hay `golden_answer` para `output == golden_answer` porque no puedes escribirlo — pon a dos analistas humanos frente al mismo informe y no producirán textos idénticos.

Esto no es falta de imaginación. Así son estas salidas. Cuando Anthropic reflexionó sobre su sistema multiagente de investigación, fueron directos: las salidas de investigación son texto de forma libre, rara vez tienen una única respuesta correcta, así que son difíciles de evaluar programáticamente — los LLM encajan naturalmente para calificar salidas de este tipo[^S2].

Pero antes de lanzarle el informe a la ligera a otro modelo y preguntarle «¿cómo se ve esto?», entiende dónde se sitúan los jueces LLM dentro del ranking oficial. El principio para elegir un método de calificación es "fastest, most reliable, most scalable" (el más rápido, el más confiable, el más escalable)[^S5]: la calificación basada en código es la más rápida y la más confiable, extremadamente escalable, pero le falta matiz para juicios complejos que requieren menos rigidez basada en reglas[^S5]; la calificación basada en LLM es rápida, flexible, escalable y apta para juicios complejos — y la guía oficial acompaña eso con un requisito previo en la misma oración: primero prueba para asegurar que es confiable, y después escala[^S5]; la calificación humana es la más flexible y de mayor calidad, pero lenta y cara, así que evítala si es posible[^S5].

Trata ese requisito previo de la opción intermedia como una exigencia dura, no como un descargo de responsabilidad. Un juez LLM no es «una verificación más inteligente», es una llamada al modelo: puede equivocarse, cuesta dinero, y podría puntuar la misma entrada de forma distinta en ejecuciones sucesivas. Su valor es uno solo — alcanza cosas que las verificaciones deterministas no pueden alcanzar.

Así que esta lección no trata de «cómo hacer que un modelo puntúe tu salida». Eso es trivial — cualquier prompt te devuelve un número. Trata de hacer que ese número valga la pena de creerse: cómo estructurar rúbricas, cómo restringir la salida, quién ejecuta el juez, cómo se rompe y cuándo directamente no deberías preguntarle.

## Rúbricas: descomponer «bueno» en preguntas que se responden por separado

La palabra rúbrica suena formal. En términos llanos, es una planilla de calificación: descomponer el vago «¿esto está bien?» en preguntas específicas, responder cada una por separado y puntuar cada una por separado.

¿Por qué descomponer? Pregunta «¿este informe está bien?» y el modelo te da elogios vagos o críticas vagas. Pregunta «¿cada afirmación del informe aparece en las fuentes que cita?» y el modelo puede revisar afirmación por afirmación. La mayoría de los casos de uso necesitan evaluación multidimensional a lo largo de varios criterios de éxito[^S5].

El agente de investigación de Anthropic usó una rúbrica de cinco dimensiones[^S2], y detrás de cada dimensión hay un modo de fallo real:

- **Exactitud factual: ¿las afirmaciones coinciden con las fuentes?** El modelo dice «los subsidios cayeron 30% en 2023»; ¿el documento citado contiene realmente ese número? Esta dimensión atrapa alucinaciones.
- **Exactitud de las citas: ¿las fuentes citadas se corresponden con las afirmaciones?** Dirección opuesta a la dimensión anterior; mucha gente las confunde. La primera pregunta «¿esta declaración está respaldada?», esta pregunta «¿el enlace pegado a esta oración de verdad habla de este tema?». Un fallo común de los agentes: la afirmación está bien, pero viene etiquetada con una fuente cuyo título apenas parecía relevante.
- **Completitud: ¿cubre todos los aspectos solicitados?** Dijiste «los últimos tres años» y solo escribió sobre el año pasado; dijiste «cambios» y solo escribió el estado actual. Revisa cada requisito, no evalúes qué tan linda quedó la prosa.
- **Calidad de las fuentes: ¿fuentes primarias o secundarias de baja calidad?** Esta dimensión atrapa los problemas más insidiosos. Los evaluadores humanos de Anthropic encontraron que los agentes iniciales elegían de manera consistente granjas de contenido optimizadas para SEO por encima de fuentes autorizadas pero peor rankeadas, como PDF académicos o blogs personales[^S2]. La salida se lee completamente normal, pero los cimientos están podridos.
- **Eficiencia de herramientas: ¿las herramientas correctas, con un número razonable de llamadas?** Llegar a la misma respuesta con tres búsquedas frente a treinta búsquedas difiere en un orden de magnitud de costo. Esta dimensión evalúa la economía del proceso, no «¿siguió los pasos que le prescribí?» — eso último no funciona, como explicó la Lección 2.

Estas cinco dimensiones son para tareas de investigación. Tareas distintas necesitan conjuntos distintos. Lo que sí puedes llevarte es el método de descomposición: parte de «si esta salida se rompe, ¿cómo se rompe?», deriva las dimensiones desde ahí, un modo de fallo por dimensión. Y no te pierdas esto: un caso de uso dado, o incluso un criterio de éxito específico de ese caso de uso, podría requerir varias rúbricas para una evaluación integral[^S5]. No esperes que una sola planilla lo cubra todo.

## Formato de salida: una llamada, una puntuación, un veredicto

**Primero, la forma del veredicto.** Anthropic probó con varios jueces evaluando componentes distintos — un juez por componente. El resultado: una sola llamada al LLM con un solo prompt que emite puntuaciones de 0.0 a 1.0 y una calificación de aprobado/fallido fue lo más consistente y lo más alineado con los juicios humanos[^S2].

Para ser justos: dividir la evaluación en varias llamadas al LLM, cada una evaluando un aspecto, también es en sí un patrón de automatización de evaluaciones que la guía oficial ha descrito[^S1]. Ninguno de los dos enfoques está mal. La diferencia es que «una sola llamada es mejor» proviene de la comparación que Anthropic hizo sobre su propio sistema real[^S2]. Enfoque recomendado: empieza con una sola llamada y divide solo cuando tengas evidencia de que dividir mejora la precisión.

**Después, qué tan apretado restringir la salida.** La guía oficial para prompts de juez es "empirical or specific" (empírico o específico): por ejemplo, instruye al LLM a emitir únicamente 'correct' o 'incorrect', o a juzgar en una escala de 1 a 5; las evaluaciones puramente cualitativas son difíciles de valorar rápido y a escala[^S5]. En términos llanos: si el juez devuelve «la calidad general es aceptable, pero algunos detalles quedaron algo toscos», no tienes nada — no puedes promediar 200 respuestas así, no puedes decir si hoy salió mejor que ayer, y de todos modos tienes que leerlas una por una. Entonces, ¿para qué le preguntaste al juez?

**La técnica decisiva: primero razona, después puntúa, y luego descarta el razonamiento.** La guía oficial lo dice explícitamente: pídele al LLM que razone antes de producir una puntuación de evaluación, y después descarta ese razonamiento — esto mejora el desempeño de la evaluación, en particular para tareas que requieren juicios complejos[^S5]. «Descartar» no significa «no lo mires». El razonamiento es el andamio del juez — necesita escribir «la afirmación del párrafo 3 corresponde a qué segmento de la transcripción» antes de poder juzgar con exactitud. Pero ese texto no debería entrar a tus estadísticas aguas abajo. El reporte quiere puntuaciones y veredictos; el razonamiento va a los logs, esperándote para cuando una puntuación se vea sospechosa.

**¿Y las dimensiones subjetivas?** Algunas dimensiones no pueden ser binarias, como «¿el tono de este informe es apropiado para enviárselo a clientes?». La guía oficial ofrece una herramienta: la escala Likert basada en LLM, que usa un LLM para juzgar actitudes o percepciones subjetivas[^S5] — una escala Likert es ese formato de cuestionario con incrementos fijos, tipo «muy en desacuerdo / en desacuerdo / neutral / de acuerdo / muy de acuerdo» (la cantidad de puntos es una convención de diseño de encuestas, no un mandato oficial). El principio clave sigue siendo el mismo: dale incrementos fijos, no lo dejes escribir libre.

Juntando todo, la salida del juez se ve más o menos así (el ejemplo muestra solo las primeras tres dimensiones; `source_quality` y `tool_efficiency` tienen la misma forma y se omiten por brevedad). Los programas leen `score` y `verdict`; `reasoning` se persiste para revisión:

```json
{
  "factual_accuracy": { "reasoning": "El «30% de reducción» del párrafo 2 aparece textual en la página 4 de la fuente A; el «varias regiones suspendieron los pagos» del párrafo 4 no tiene respaldo en ninguna de las tres fuentes.", "score": 0.5 },
  "citation_accuracy": { "reasoning": "4 de 5 citas coinciden con sus afirmaciones; el enlace de la cita 3 lleva a otro artículo del mismo sitio.", "score": 0.8 },
  "completeness": { "reasoning": "La tarea pedía los últimos tres años, el informe solo cubre 2024 y 2025.", "score": 0.6 },
  "verdict": "fail"
}
```

## Quien hace el trabajo no puede ser el juez

Llegado este punto aparece un atajo tentador: que el agente se califique a sí mismo al final. Nadie sabe mejor que él lo que acaba de hacer.

Reprime esa tentación. Dos razones. **Primera, la experiencia oficial**: implementar salvaguardas donde una instancia del modelo procesa las consultas del usuario mientras otra las filtra por contenido o solicitudes inapropiadas tiende a funcionar mejor que hacer que la misma llamada al LLM se encargue tanto de las salvaguardas como de la respuesta principal[^S1] — esa experiencia describía originalmente moderación de contenido (una instancia responde, otra filtra), pero el principio «no le pongas dos sombreros a la misma llamada» aplica aquí. Fíjate que dice «la misma llamada» — el problema es el contexto compartido, no la falta de inteligencia. **Segunda, el mecanismo**: la documentación oficial de Claude Code describe una práctica donde un revisor que se ejecuta en el contexto fresco de un subagente ve únicamente el diff y los criterios que le das, no el razonamiento que produjo el cambio, así que evalúa el resultado en sus propios términos[^S4].

Léelo al revés y verás por qué falla la autocalificación: la cadena de razonamiento que produjo la salida sigue colgada en el contexto. El modelo acaba de convencerse a sí mismo de que «escribirlo así es correcto», tú le sigues inmediatamente con «¿esto es correcto?», y lo más probable es que repita el mismo razonamiento. Lo que obtienes no es un juicio independiente, es autorrepetición.

**Si te preocupa que el juez sea demasiado laxo o demasiado estricto**, la guía oficial ofrece una perilla: evaluar si un contenido dado es inapropiado, con varios prompts evaluando aspectos distintos o exigiendo umbrales de voto distintos para balancear falsos positivos y negativos[^S1]. En un escenario de verificación, un falso positivo es «marcar como roto algo que está bien» — te van a matar a falsas alarmas; un falso negativo es «dejar pasar algo roto» — trabajo malo llega a producción. Tres jueces donde dos deben decir fallido para que cuente como fallido es más laxo que un solo juez cuyo fallido ya cuenta — cuál configuración eliges depende de qué tipo de error cuesta más en tu escenario.

```agentmentor-check
{
  "id": "vq-zh-04-self-grading",
  "label": "Piénsalo bien",
  "prompt": "Un colega propone: que el agente se califique a sí mismo al final e incluya la puntuación en el reporte final. Su razonamiento es que él entiende mejor que nadie el contexto de la tarea, así que juzgará con más exactitud, y además ahorra una llamada al modelo. ¿Qué le respondes?",
  "whyHere": "Esta sección acaba de cubrir «separa a quien hace el trabajo de quien lo controla». Aquí se comprueba si tratas «ahorrar una llamada» como justificación aceptable, y si rechazar la autocalificación te hace saltar hasta «solo sirve la revisión humana».",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Ahorrar la llamada tiene sentido, que se autocalifique. Basta con agregar una línea al prompt tipo «sé honesto, no protejas tu propio trabajo», escribir los criterios con claridad, y el problema queda resuelto.",
      "correct": false,
      "feedback": "«Sé honesto» no le cambia la posición. La cadena de razonamiento que produjo esa salida sigue en el mismo contexto. El modelo acaba de convencerse de que «esto es correcto»; preguntarle de inmediato «¿es correcto?» lo más probable es que devuelva una repetición de la misma justificación, no un juicio independiente. La práctica oficial es separar los roles: una instancia del modelo hace el trabajo, otra filtra — y eso tiende a funcionar mejor que la misma llamada usando dos sombreros."
    },
    {
      "id": "b",
      "text": "La autocalificación está mal. Entrega la evaluación a un revisor en contexto fresco: solo ve la salida y los criterios que le diste, no puede ver el razonamiento que la produjo, así que juzga el resultado en sí. La llamada ahorrada no vale tanto como un juicio independiente.",
      "correct": true,
      "feedback": "Correcto. La diferencia clave no es la capacidad del modelo, es el contexto: un revisor en contexto fresco no tiene acceso a la justificación de «por qué lo escribimos así», solo puede hablar del resultado contra los criterios. Esto también explica por qué los prompts de juez necesitan que les pegues los requisitos completos de la tarea y la rúbrica — no tiene el trasfondo que tú crees que tiene."
    },
    {
      "id": "c",
      "text": "La autocalificación definitivamente no sirve, así que este tipo de salida de texto de forma libre solo puede usar revisión humana. Los jueces LLM no son confiables en este escenario.",
      "correct": false,
      "feedback": "La primera mitad es correcta, la segunda salta demasiado lejos. La calificación humana es la más flexible y de mayor calidad, pero lenta y cara; la guía oficial es evitarla si es posible. El problema con los jueces LLM no es «no se pueden usar», es que necesitas una instancia distinta con contexto limpio para ejecutarlo, y debes validar que es confiable antes de escalar. La autocalificación falla específicamente por el contexto compartido, no porque los jueces LLM sean intrínsecamente poco confiables."
    }
  ]
}
```

## Cómo se rompen los jueces

Ya cambiaste a una instancia distinta, ya escribiste una rúbrica, y el juez se rompe igual. Se rompe de maneras predecibles.

**Uno: un revisor al que le piden encontrar problemas siempre encontrará problemas.** El más contraintuitivo y el más caro. La documentación oficial es clara: un revisor al que se le pide encontrar huecos normalmente reportará algunos, incluso cuando el trabajo está sólido, porque eso es lo que se le pidió[^S4]. La consecuencia no es solo «unas cuantas sugerencias inútiles»: el mismo pasaje señala que perseguir cada hallazgo lleva a sobreingeniería — capas extra de abstracción, código defensivo y pruebas para casos que no pueden ocurrir[^S4]. Tu agente entra en un bucle de autoescalada: el revisor sugiere tres cosas, tú las arreglas, la re-revisión sugiere tres más, el código se engorda, los problemas reales siguen sin resolverse.

Seguro has visto estos reportes: «se sugiere agregar defensa de cadena vacía a `parseDate`» — pero río arriba ya se garantiza que no viene vacía; «se sugiere extraer estas tres constantes a configuración» — pero no cambian desde hace tres años; «se sugiere agregar pruebas de reintento para timeout de red» — pero esta ruta no tiene llamadas de red. Ninguna de las tres está equivocada, ninguna de las tres vale la pena hacer, pero mezcladas en un reporte de revisión se ven idénticas a los problemas reales.

La guía oficial ofrece la mitigación: dile al revisor que marque únicamente los huecos que afectan la corrección o los requisitos declarados, y que trate el resto como opcional[^S4]. Escribe eso textualmente en el prompt del juez, y dale a las «otras sugerencias» un lugar a dónde ir — agrega un campo `optional_notes` y declara explícitamente que no participa en la puntuación. Tener dónde escribirlas significa que no tiene que meter sus preferencias de estilo dentro de las justificaciones de los descuentos.

**Dos: los autorreportes del agente no son evidencia.** Mucha gente toma el atajo de pasarle al juez solo el resumen final del agente: «recuperé tres fuentes autorizadas y las contrasté antes de confirmar la tasa del subsidio». El juez lo lee, le parece que el proceso suena sólido y da una puntuación alta. Pero esa declaración no es evidencia. La guía oficial sobre evaluación de herramientas lo plantea así: lo que los agentes omiten en su retroalimentación y sus respuestas suele ser más importante que lo que incluyen — los LLM no siempre dicen lo que quieren decir[^S3]. Dice «contrasté tres fuentes» pero pudo haber llamado la búsqueda una sola vez; el reintento fallido que no menciona, el momento en que obtuvo resultados vacíos y siguió fabricando, eso es lo que más necesitas ver. La solución también es directa: revisa las transcripciones crudas (incluidas las llamadas a herramientas y sus respuestas) para detectar cualquier comportamiento que no esté descrito explícitamente en la cadena de pensamiento del agente[^S3]. Traducido a solución: **la entrada del juez debe incluir los logs crudos, no solo el autorreporte.** La dimensión «eficiencia de herramientas» necesita esto especialmente — evalúa el número real de llamadas y si fueron correctas; esa información solo existe en los logs.

**Tres: la pregunta misma es ambigua.** Estrictamente hablando esto no es que el juez se rompa, es que le diste una pregunta rota. La guía oficial sobre diseño de evaluaciones nombra una categoría a evitar: casos de prueba ambiguos en los que hasta a los humanos les costaría llegar a un consenso de valoración[^S5]. Los vas a reconocer al validar el juez: tú y un colega juzgan la misma salida y obtienen resultados opuestos. No corras a arreglar el prompt del juez — el juez es «inexacto» porque esta pregunta no tiene respuesta exacta. O afinas los criterios hasta que los humanos puedan ponerse de acuerdo, o eliminas el caso. Usarlo para calcular la tasa de consistencia del juez solo produce un número autoengañoso.

## Cuándo construir un bucle de revisión y corrección

¿El juez termina y ya está, o le pasas su retroalimentación al agente para que corrija y luego vuelves a juzgar? Este bucle es tentador, y se convierte fácilmente en una máquina de movimiento perpetuo que quema tokens.

La guía oficial ofrece dos señales de cuándo este flujo de trabajo encaja de verdad[^S1]: primera, que las respuestas del LLM pueden mejorarse demostrablemente cuando un humano articula su retroalimentación; y segunda, que el LLM puede proveer esa retroalimentación. El mismo pasaje agrega un requisito previo: este flujo de trabajo es particularmente efectivo cuando tenemos criterios de evaluación claros y cuando el refinamiento iterativo aporta valor medible[^S1].

Usa esas dos condiciones como pruebas de admisión. El procedimiento es directo: sé tú el juez primero, escríbele retroalimentación al agente y observa si de verdad mejora tras corregir. **Si la retroalimentación escrita por un humano no lo mueve, la escrita por un LLM lo moverá todavía menos.** En ese punto lo que necesita arreglo es el prompt o las herramientas, no agregar una capa de revisión. A la inversa, si la retroalimentación humana claramente funciona, revisa la segunda condición — haz que un LLM escriba retroalimentación contra la rúbrica y compárala con la tuya. Si ambas pasan, vale la pena construir el bucle.

## Proporcionalidad: un juez también es una llamada al modelo

Volvamos al ranking de la Lección 3. El principio para elegir un método de calificación es el más rápido, el más confiable, el más escalable[^S5]; la calificación basada en código va por delante de la basada en LLM en los tres ejes[^S5]. Así que los jueces van donde las verificaciones deterministas no alcanzan, no como reemplazo de ellas. Para el mismo informe, la estratificación correcta se ve así:

```text
Capa 1 (determinista, milisegundos, costo cero)
  ¿JSON / Markdown válido? ¿Longitud dentro del rango requerido?
  ¿Enlaces de las citas alcanzables (estado HTTP)? ¿Cantidad de citas >= 3?
  Cualquier ítem que falle → fallido inmediato, no invocar al juez

Capa 2 (juez LLM, segundos, facturado por token)
  Puntuación con rúbrica de cinco dimensiones + aprobado/fallido
  Entrada: requisitos de la tarea + salida + logs crudos (llamadas y respuestas de herramientas)

Capa 3 (humano, lento y caro, solo muestreo)
  El juez dijo fallido pero tú sospechas
  Muestra aleatoria de los que el juez aprobó, para cuidarte de una laxitud sistemática
```

No mandes a la Capa 2 a pagar lo que la Capa 1 ya atrapó — una salida que ni siquiera tiene formato válido no necesita una llamada al modelo para saber que es inaceptable. La Capa 3 no se puede saltar: las personas que prueban agentes encuentran casos límite que las evaluaciones no ven[^S2]; el sesgo de «preferir consistentemente granjas de contenido» que vimos antes lo atrapó la prueba humana[^S2].

**El límite de esta lección**: cómo organizar conjuntos de evaluación, contra cuántos casos ejecutar este juez — eso es la Lección 5. Cablear el juez dentro de un arnés de evaluación repetible que produzca reportes — eso es la Lección 6. Esta lección solo resuelve cómo hacer que un juicio individual sea digno de confianza.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Diagnosticar un prompt de juez roto (sin código)

Alguien le agregó «autoverificación» a su agente de investigación, con este prompt:

```text
Acabas de terminar de escribir este informe sectorial. Ahora evalúa tu propio resumen:
¿Te parece que este resumen es bueno? Evalúa en detalle sus fortalezas y debilidades,
sé lo más exhaustivo posible y enumera todas las sugerencias de mejora que se te ocurran.
¡Gracias!
```

**Tu tarea:** ① Enumera **al menos 4** defectos de este prompt, cada uno correspondiente a una regla cubierta en esta lección (escribe qué regla es y por qué esto la viola); ② Reescríbelo en una versión funcional directamente utilizable, no una descripción de «cómo debería escribirse».

<!-- hint -->
Pista 1: Recórrelo desde tres ángulos — **quién juzga** (¿hay un problema con la identidad de este juez?), **qué juzga** (¿sabe qué significa bueno?), **cómo emite la salida** (¿tu programa puede procesar lo que te devuelve?). Cada ángulo rinde al menos un defecto.
<!-- /hint -->

<!-- hint -->
Pista 2: Fíjate en esa parte final: «sé lo más exhaustivo posible», «enumera todas las sugerencias que se te ocurran». Vuelve al primer modo de «Cómo se rompen los jueces» y piensa qué produce eso y qué pasa cuando implementas todo. Después pregúntate: ¿dónde está en este prompt el **material fuente** que el juez necesita para verificar hechos?
<!-- /hint -->

<!-- rubric -->
Criterios de autoevaluación:
- Identificaste al menos 4 defectos, cada uno mapeado a una regla de la lección; cubriste al menos 4 de estos problemas: ① hacer que el modelo que trabajó se autocalifique viola «separa a quien hace del que controla»; ② no hay rúbrica, «bueno» no está descompuesto en dimensiones que se respondan por separado; ③ no hay restricción de formato de salida, la retroalimentación puramente cualitativa no se puede valorar rápido y a escala; ④ no hay puntuación ni aprobado/fallido, no queda nada que comparar entre versiones; ⑤ no hay orden de «primero escribe la evidencia, después puntúa»; ⑥ «sé exhaustivo / enumera todas las sugerencias» fomenta el rebusque, y perseguir cada una lleva a sobreingeniería; ⑦ no le da al juez la entrada que necesita — sin requisitos de la tarea, sin materiales fuente, sin logs de llamadas a herramientas.
- La reescritura es un **prompt completo directamente utilizable**, no una lista de viñetas, e incluye como mínimo: identidad de revisor en contexto fresco (declarando que este prompt va a una llamada nueva e independiente, no anexado a la llamada que escribió), marcadores de posición para la salida bajo revisión y sus materiales fuente/logs, rúbrica que declare qué pregunta cada dimensión, puntuación de 0.0 a 1.0 por dimensión, aprobado/fallido global, requisito de orden «primero escribe la evidencia de respaldo, después puntúa», restricción de «marca únicamente los problemas que afectan la corrección o los requisitos declarados, el resto va a sugerencias opcionales y no cuenta para la puntuación», y formato JSON de salida fijo.
- La reescritura no contiene preguntas del tipo «¿te parece que … es bueno?», que carecen de línea base.
<!-- /rubric -->

<!-- answer -->
**Parte 1: Defectos y reglas correspondientes**

1. «Acabas de terminar de escribir … ahora evalúa el tuyo» — el modelo que trabajó se juzga a sí mismo. Viola: implementar salvaguardas donde una instancia del modelo procesa las consultas del usuario mientras otra las filtra tiende a funcionar mejor que hacer que la misma llamada al LLM se encargue de ambas[^S1]; un revisor en contexto fresco no puede ver el razonamiento que produjo el resultado, así que evalúa el resultado en sus propios términos[^S4].
2. «¿Te parece que este resumen es bueno?» — sin rúbrica. Viola: la mayoría de los casos de uso necesitan evaluación multidimensional a lo largo de varios criterios de éxito[^S5], y un criterio dado incluso podría requerir varias rúbricas[^S5].
3. «Evalúa en detalle sus fortalezas y debilidades» — retroalimentación puramente cualitativa, sin puntuación, sin formato. Viola: instruye al LLM a emitir 'correct'/'incorrect' o del 1 al 5; las evaluaciones puramente cualitativas son difíciles de valorar rápido y a escala[^S5].
4. No exige «primero escribe la evidencia, después puntúa». Viola: pídele al LLM que razone antes de producir una puntuación de evaluación y después descarta el razonamiento — mejora el desempeño de la evaluación, en particular para tareas que requieren juicios complejos[^S5].
5. «Sé lo más exhaustivo posible», «enumera todas las sugerencias que se te ocurran» — fomenta el rebusque. Viola: un revisor al que se le pide encontrar huecos normalmente reportará algunos incluso cuando el trabajo está sólido; perseguir cada hallazgo lleva a sobreingeniería[^S4]; el arreglo es marcar únicamente los huecos que afectan la corrección o los requisitos declarados[^S4].
6. No incluye los requisitos originales de la tarea, ni los materiales fuente, ni los logs de llamadas a herramientas. Viola: lo que los agentes omiten puede ser más importante que lo que incluyen; revisa las transcripciones crudas (llamadas a herramientas y respuestas) para detectar comportamiento que no está en la autodescripción del agente[^S3].

**Parte 2: Reescritura (directamente utilizable)**

```text
Eres un revisor independiente. No participaste en la escritura del informe sectorial de abajo
y no puedes ver su proceso de escritura. Juzga el informe en sí basándote únicamente en los
requisitos de la tarea, los materiales fuente y los logs de ejecución que siguen.

【Requisitos originales de la tarea】{{task_spec}}
【Informe bajo revisión】{{report}}
【Texto completo de las fuentes citadas en el informe】{{source_documents}}
【Logs crudos de esta ejecución: llamadas a herramientas y sus respuestas】{{raw_transcript}}

【Rúbrica】Responde cada dimensión por separado:
1. factual_accuracy: ¿Cada afirmación del informe se puede encontrar en los materiales fuente?
   Números, fechas, nombres y conclusiones ausentes de las fuentes cuentan como inexactos;
   resumir y parafrasear no cuentan.
2. citation_accuracy: ¿La fuente enlazada por cada cita de verdad habla de la afirmación que respalda?
   Que la fuente exista pero su contenido no coincida con la afirmación descuenta aquí (no afecta a la dimensión 1).
3. completeness: ¿Están cubiertos todos los aspectos nombrados en los requisitos de la tarea? Revisa los requisitos línea por línea.
4. source_quality: ¿Se usaron fuentes primarias (documentos originales, comunicados oficiales, material académico)
   o refritos secundarios bien rankeados pero de baja calidad?
5. tool_efficiency: Según los logs de ejecución, ¿se usaron las herramientas correctas?, ¿el número de llamadas es
   obviamente redundante? Básate solo en los logs, no confíes en la autodescripción del proceso que hace el informe.

【Requisitos de puntuación】
- Orden: para cada dimensión, escribe primero la evidencia (debe citar específicamente qué oración del informe,
  qué parte de las fuentes o qué llamada de los logs; si no encuentras problema escribe «ninguno encontrado»).
  Escribe la evidencia completa y después da la puntuación.
- score: de 0.0 a 1.0. 1.0 significa que no se encontraron problemas en esta dimensión, 0.0 significa fallo grave.
- verdict: "pass" si todas las dimensiones >= 0.7 Y factual_accuracy >= 0.9; de lo contrario "fail".
- Marca únicamente los problemas que afectan la corrección o el cumplimiento de los requisitos de la tarea. Redacción,
  estructura y preferencias de formato van todas a optional_notes; ese campo no participa en la puntuación
  y no afecta al verdict.
- Emite estrictamente la estructura JSON de abajo, sin texto fuera del JSON.

【Formato de salida】
{
  "factual_accuracy":  { "evidence": "", "score": 0.0 },
  "citation_accuracy": { "evidence": "", "score": 0.0 },
  "completeness":      { "evidence": "", "score": 0.0 },
  "source_quality":    { "evidence": "", "score": 0.0 },
  "tool_efficiency":   { "evidence": "", "score": 0.0 },
  "optional_notes": [],
  "verdict": "<pass o fail>"
}
```

Una cosa más que no está en el prompt pero es igual de crítica: manda este prompt en una **llamada independiente y fresca** (una conversación nueva o un subagente sin historial de escritura). Por más convincente que declares «eres un revisor independiente» en la identidad, si lo anexas a la llamada que escribió, sigue viendo todo el razonamiento de la escritura.

Esos dos umbrales finales (0.7 y 0.9) son elección tuya; ninguna fuente oficial da esos números. Su propósito es hacer que aprobado/fallido sea computable. Después de completar la validación del juez del Nivel 2, vuelve y ajústalos.
<!-- /answer -->

### Nivel 2: Diseñar un esquema de juicio completo para «resumen de reunión a partir de transcripción»

Escenario: tu agente comprime a diario transcripciones de reuniones en notas de resumen con conclusiones y ítems de acción. Los resúmenes son texto de forma libre sin respuesta estándar, pero los errores son caros — si se pierde un ítem de acción, nadie hace esa tarea.

**Tu tarea:** ① Diseña una rúbrica de tres dimensiones (fidelidad a los hechos, cobertura de los puntos clave, ningún ítem de acción faltante), cada dimensión de 0.0 a 1.0 más un aprobado/fallido global, escribiendo con claridad qué pregunta cada dimensión y qué cuenta como descuento; ② Escribe el **prompt de juez completo**, incluyendo el orden de primero razonar y después puntuar, y restricciones estrictas de formato de salida; ③ Diseña los pasos para «validar al juez mismo»: prepara un conjunto pequeño de ejemplos buenos/malos etiquetados por humanos, ejecuta el juez, compara la tasa de concordancia y especifica **qué arreglar primero y qué después** cuando la concordancia sea insuficiente. No hace falta llamar APIs de verdad; los entregables son el prompt, el JSON y los pasos en sí.

<!-- hint -->
Pista 1: Tres dimensiones no son tres eslóganes; cada una debe responder «qué cuenta como descuento y qué no». Por ejemplo, fidelidad: información que no está en la transcripción escrita dentro del resumen cuenta como descuento, pero condensar tres oraciones en una no. Escribe esas fronteras dentro del prompt para que el juez se mantenga estable. La dimensión de ítems de acción también necesita cubrir algo adicional: si el responsable y la fecha límite quedaron intercambiados.
<!-- /hint -->

<!-- hint -->
Pista 2: Los ejemplos etiquetados por humanos no pueden ser todos buenos. Fabrica ejemplos malos por dimensión: uno que meta números que no están en la transcripción, uno que omita un punto de agenda ya concluido, uno que se equivoque en el responsable de un ítem de acción. Así, cuando el juez esté en desacuerdo contigo, ves de inmediato qué definición de dimensión no quedó clara. Además, cuando tú y un colega juzguen un caso de forma inconsistente, sospecha primero del caso, no del juez.
<!-- /hint -->

<!-- rubric -->
Criterios de autoevaluación:
- **Rúbrica**: cada una de las tres dimensiones tiene fronteras claras de «qué descuenta / qué no», no solo nombres de dimensión; la dimensión de ítems de acción cubre tanto «omisión» como «responsable o fecha límite equivocados».
- **Prompt**: completo y directamente utilizable, contiene marcadores de posición para transcripción y resumen; declara explícitamente que el revisor no es quien escribió; exige que cada dimensión escriba primero la evidencia de respaldo (señalando una ubicación específica en la transcripción/resumen) y después puntúe; tiene puntuaciones de 0.0 a 1.0, tiene aprobado/fallido con su regla de decisión; tiene la restricción de «marca únicamente los problemas que afectan la corrección, el resto va a un campo que no puntúa»; termina con formato JSON fijo y el requisito de no emitir otro contenido.
- **Esquema de validación**: contiene un conjunto de ejemplos etiquetados por humanos (ejemplos buenos + ejemplos malos diseñados por separado por dimensión), los humanos juzgan primero línea por línea, el juez ejecuta el mismo lote, se compara la tasa de concordancia por aprobado/fallido y por puntuaciones de cada dimensión, y se observa aparte en qué dimensión se concentran los desacuerdos.
- **Orden de arreglo** especificado con su razonamiento; el orden es: revisar primero los ejemplos/criterios mismos (los casos ambiguos donde hasta los humanos discrepan se reescriben o se eliminan) → arreglar después el prompt del juez (agregar definiciones de dimensión, agregar ejemplos positivos/negativos, apretar la salida) → solo entonces considerar cambiar de modelo o agregar votación multiprompt.
- Declara explícitamente «no escales al conjunto completo de casos hasta que la validación del juez pase»; los umbrales pueden definirse por cuenta propia pero debes declarar que son tuyos, sin inventar números oficiales.
<!-- /rubric -->

<!-- answer -->
**1. Rúbrica de tres dimensiones**

- **faithfulness**: ¿Cada declaración del resumen se puede encontrar en la transcripción? Descuenta: números, nombres, fechas y conclusiones que no están en la transcripción; subir «alguien propuso» a «la reunión decidió» (escalamiento de fuerza). No descuenta: resumir, fusionar, reformular.
- **coverage**: ¿Se mencionan todos los temas discutidos por varias personas o con conclusiones explícitas? Descuenta: omitir un punto de agenda ya concluido; escribir la conclusión al revés. No descuenta: omitir contenido mencionado una sola vez al pasar y sin conclusión.
- **action_items**: ¿Están en la lista todos los compromisos de «quién hace qué para cuándo» de la transcripción? Descuenta: falta un ítem; responsable equivocado; fecha límite equivocada o fabricar una fecha límite que la transcripción no declaró. No descuenta: la transcripción genuinamente no declaró fecha límite y el resumen marca con precisión «sin determinar».

Veredicto global: cualquier dimensión por debajo de 0.6, o faithfulness por debajo de 0.8, veredicto fallido; de lo contrario aprobado. Esos dos umbrales son puntos de partida definidos por ti; ajústalos tras la validación del paso 3.

**2. Prompt de juez completo**

```text
Eres un revisor independiente de notas de resumen de reuniones. No participaste en la escritura de este
resumen y no puedes ver su proceso de generación. Juzga este resumen basándote únicamente en la
transcripción de la reunión y en la rúbrica de abajo.

【Transcripción original de la reunión】{{transcript}}
【Resumen bajo revisión】{{summary}}

【Rúbrica】
1. faithfulness: ¿Cada declaración del resumen se puede encontrar en la transcripción?
   - Descuenta: números, nombres, fechas y conclusiones que no están en la transcripción escritos dentro del resumen;
     expresar «alguien propuso» como «la reunión decidió» (escalar la fuerza de la conclusión).
   - No descuenta: condensar varias oraciones en una; reformular; omitir
     charla fuera de tema sin relación con la agenda.
2. coverage: ¿Todos los temas discutidos por varias personas o con conclusiones explícitas en la transcripción
   se mencionan en el resumen?
   - Descuenta: omitir un punto de agenda que llegó a conclusión; escribir al revés la conclusión de un tema.
   - No descuenta: omitir contenido mencionado una sola vez al pasar y sin conclusión.
3. action_items: Por cada compromiso de «quién hace qué para cuándo» en la transcripción, ¿está en la lista de
   ítems de acción del resumen, con responsable y fecha límite sin errores ni intercambios?
   - Descuenta: falta un ítem de acción; responsable escrito como otra persona; fecha límite equivocada;
     fabricar una fecha límite cuando la transcripción no declaró ninguna.
   - No descuenta: la transcripción genuinamente no determinó fecha límite y el resumen escribe con precisión
     «fecha límite sin determinar».

【Requisitos de puntuación】
- Orden: para cada dimensión, escribe primero la evidencia y después da la puntuación. La evidencia debe ser específica —
  señala qué oración del resumen corresponde a qué parte de la transcripción (basta con citar el fragmento
  original); si la dimensión no tiene problemas escribe «ninguno encontrado».
- score: de 0.0 a 1.0. 1.0 significa que esta dimensión está completamente bien, 0.0 significa fallo grave.
- verdict: cualquier dimensión por debajo de 0.6, o faithfulness por debajo de 0.8, emite "fail"; de lo contrario "pass".
- Marca únicamente los problemas que afectan la corrección o que afectan el uso de estas notas como referencia de trabajo.
  Estilo del lenguaje, orden de los ítems y preferencias de detalle van todos en optional_notes; ese campo no
  participa en la puntuación y no afecta al verdict.
- Emite estrictamente la estructura JSON de abajo, sin texto fuera del JSON, sin explicaciones, sin bloques de código.

【Formato de salida】
{
  "faithfulness": { "evidence": "", "score": 0.0 },
  "coverage":     { "evidence": "", "score": 0.0 },
  "action_items": { "evidence": "", "score": 0.0 },
  "optional_notes": [],
  "verdict": "<pass o fail>"
}
```

Del lado del programa solo se toman los tres valores de `score` y el `verdict` para las estadísticas; `evidence` y `optional_notes` se persisten a disco para revisarlos cuando las puntuaciones se vean sospechosas. Igual que en el Nivel 1: manda este prompt a una llamada independiente y fresca, no lo anexes a la llamada que generó el resumen.

**3. Pasos para validar al juez mismo**

Paso uno, fabricar el conjunto de ejemplos. Toma de 12 a 20 transcripciones reales de reuniones (esta escala es un punto de partida propio, no viene de ninguna fuente oficial) y empareja cada reunión con 2 resúmenes, uno bueno y uno malo, con los malos diseñados por dimensión:

```json
{
  "cases": [
    { "id": "m01-good", "summary": "s/m01-good.md", "human_verdict": "pass",
      "human_notes": "Las tres dimensiones bien" },
    { "id": "m01-bad-faith", "summary": "s/m01-bad-faith.md", "human_verdict": "fail",
      "broken_dimension": "faithfulness",
      "human_notes": "El resumen dice «presupuesto aprobado por 800 mil», la transcripción solo menciona «presentado para aprobación»" },
    { "id": "m02-bad-coverage", "summary": "s/m02-bad-cov.md", "human_verdict": "fail",
      "broken_dimension": "coverage",
      "human_notes": "El cambio de proveedor, un punto de agenda ya concluido, falta la sección entera" },
    { "id": "m03-bad-actions", "summary": "s/m03-bad-act.md", "human_verdict": "fail",
      "broken_dimension": "action_items",
      "human_notes": "El responsable de «borrador para el viernes» es Li, el resumen escribió Wang" }
  ]
}
```

Paso dos, los humanos juzgan primero. Tú y un colega juzgan cada uno de forma independiente aprobado/fallido y escriben su razonamiento, **sin ver la salida del juez**. Los casos en los que ustedes dos discrepan se apartan por separado — ver el paso cuatro.

Paso tres, ejecuta el juez y compara dos cosas: **tasa de concordancia del veredicto** (porcentaje en que el `verdict` del juez coincide con la etiqueta humana) y **tasa de acierto de atribución por dimensión** (para los ejemplos malos, ¿la dimensión donde el juez descontó más fuerte es el `broken_dimension` que etiquetaste?). Lo segundo suele revelar más — un veredicto correcto por coincidencia pero con la atribución equivocada significa que las definiciones de las dimensiones no están claras.

Paso cuatro, cuando sea insuficiente, arregla en este orden, **el orden no se puede invertir**:

1. **Revisa primero los ejemplos y los criterios.** Los desacuerdos se concentran en los casos donde tú y tu colega también discreparon — el problema está en la pregunta, no en el juez. Los casos de prueba ambiguos en los que hasta a los humanos les costaría llegar a un consenso son justo lo que el diseño de evaluaciones debería evitar[^S5]. Afina los criterios hasta que los humanos coincidan, o elimina el caso si no lo logras.
2. **Arregla después el prompt del juez.** Criterios claros, humanos de acuerdo, y el juez sigue equivocándose — eso es problema del prompt. Agrega a la dimensión donde se concentran los desacuerdos: escribe «qué descuenta / qué no» de forma más rígida, inserta uno o dos ejemplos positivos/negativos, restringe más el formato de salida. Vuelve a ejecutar el mismo lote.
3. **Solo entonces toca el modelo y la estructura.** El prompt ya es muy específico y el juez sigue inestable — entonces considera cambiar a un modelo más fuerte, o usar varios prompts evaluando cada uno una dimensión y combinar los veredictos con un umbral de voto — el umbral de voto es exactamente la perilla para balancear falsos positivos y falsos negativos[^S1]. Este paso va al final porque sube tanto el costo como la complejidad.

Paso cinco, fija el umbral y luego escala. Define tu propio umbral de tasa de concordancia (ninguna fuente oficial da este número; básalo en el costo de un juicio errado); antes de alcanzar el umbral no escales el juez al conjunto completo de casos — la guía oficial para la calificación basada en LLM es primero probar para asegurar que es confiable y después escalar[^S5]. A partir de ahí, cada vez que cambies el prompt del juez, vuelve a ejecutar este lote pequeño para confirmar que no lo rompiste.
<!-- /answer -->

<!-- /exercises -->

## Resumen

- Las salidas de texto de forma libre no tienen una única respuesta correcta y son difíciles de evaluar programáticamente; los LLM encajan naturalmente para calificar salidas de este tipo[^S2]; pero el posicionamiento oficial de la calificación basada en LLM es «rápida, flexible, escalable, apta para juicios complejos — requisito previo: primero probar que es confiable y después escalar»; la calificación humana es la más flexible y de mayor calidad pero lenta y cara, evítala si es posible[^S5].
- Una rúbrica descompone «bueno» en preguntas que se responden por separado. La descomposición ya hecha para tareas de investigación son cinco dimensiones: exactitud factual, exactitud de las citas, completitud, calidad de las fuentes, eficiencia de herramientas[^S2]; un caso de uso dado, o incluso un solo criterio de éxito dentro de él, podría requerir varias rúbricas para una evaluación integral[^S5].
- Para la forma de la salida, una sola llamada al LLM con un solo prompt que emite puntuaciones de 0.0 a 1.0 y aprobado/fallido fue lo más consistente y lo más alineado con los juicios humanos en la medición real[^S2]; instruye al LLM a emitir 'correct'/'incorrect' o del 1 al 5; las evaluaciones puramente cualitativas son difíciles de valorar rápido y a escala[^S5]. Pídele al LLM que razone antes de producir una puntuación de evaluación y después descarta el razonamiento — mejora el desempeño de la evaluación, en particular para juicios complejos[^S5]; las dimensiones subjetivas pueden usar escalas Likert basadas en LLM[^S5].
- Quien hace el trabajo no puede ser el juez: implementar salvaguardas donde una instancia del modelo procesa las consultas mientras otra filtra tiende a funcionar mejor que hacer que la misma llamada se encargue de ambas[^S1]; un revisor en contexto fresco solo ve la salida y tus criterios, no puede ver el razonamiento que produjo la salida, así que juzga el resultado en sus propios términos[^S4]. La evaluación multiprompt con umbrales de voto balancea falsos positivos y falsos negativos[^S1].
- Un revisor al que se le pide encontrar huecos normalmente reportará algunos incluso cuando el trabajo está sólido, y perseguir cada hallazgo lleva a sobreingeniería; el arreglo es decirle que marque únicamente los huecos que afectan la corrección o los requisitos declarados, y que trate el resto como opcional[^S4].
- No le pases al juez solo el autorreporte del agente: lo que omite suele ser más importante que lo que incluye, los LLM no siempre dicen lo que quieren decir[^S3]; revisa las transcripciones crudas (llamadas a herramientas y sus respuestas) para detectar comportamiento que no está en la autodescripción[^S3].
- Que valga la pena construir un bucle de revisión y corrección depende de dos señales: que las respuestas del LLM puedan mejorarse demostrablemente cuando un humano articula su retroalimentación, y que el LLM pueda proveer esa retroalimentación por sí mismo[^S1].
- Un juez también es una llamada al modelo, con su costo y su ruido. El principio para elegir métodos de calificación es el más rápido, el más confiable, el más escalable; la calificación basada en código va por delante en los tres ejes[^S5] — lo que una verificación determinista puede atrapar no debería mandarse a un juez; más allá de las evaluaciones automatizadas siguen haciendo falta muestreos humanos, porque las personas que prueban agentes encuentran casos límite que las evaluaciones no ven[^S2].

[>> Lección 5: Conjuntos de evaluación: empieza con 20 tareas reales](./05-eval-sets.md)
