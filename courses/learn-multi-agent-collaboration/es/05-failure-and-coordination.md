# Lección 5: Fallos y coordinación

> Objetivos de aprendizaje:
> - Explicar por qué no se puede tomar al pie de la letra a un subagente que dice estar «listo», y por qué necesitas una forma independiente de verificar
> - Reconocer los dos fallos comunes en la colaboración multiagente: trabajo duplicado y resultados en conflicto
> - En la etapa de integración de resultados, saber cómo deduplicar y cómo manejar salidas contradictorias
>
> Requisitos: haber completado la Lección 4, ser capaz de distinguir los tres patrones de colaboración y el handoff | Anterior: [Lección 4 <<](./04-collaboration-patterns.md) | Siguiente: [Lección 6 >>](./06-build-a-review-pipeline.md)

Dos subagentes investigan cada uno el plan inicial del mismo proveedor de nube. Uno reporta que arranca en \$20 al mes, el otro dice \$25 — y ambas salidas se marcan con confianza como «verificado, sin errores». Las lecciones anteriores cubrieron todas cómo montar una colaboración multiagente; esta cubre dónde se rompe después de haberla construido — no se puede confiar en el estado autorreportado de un subagente, trabajo duplicado, resultados en conflicto — y qué debería hacer el orquestador con cada caso.

## Que un subagente diga «listo» no significa que lo haya hecho bien

Cuando un subagente devuelve un resultado, normalmente le añade una línea como «completo» o «verificado, sin errores». Esa afirmación no es evidencia — es solo el propio resumen que hace el subagente de su propia salida, y ese resumen puede estar equivocado. La observación oficial del comportamiento del agente es exactamente esta: "Claude stops when the work looks done. Without a check it can run, "looks done" is the only signal available, and you become the verification loop: every mistake waits for you to notice it."[^S6] Por eso el consejo oficial es "Have Claude show evidence rather than asserting success."[^S6]

La documentación oficial llama a esto la brecha de confiar-entonces-verificar (trust-then-verify gap): "The trust-then-verify gap. Claude produces a plausible-looking implementation that doesn't handle edge cases. Fix: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."[^S6] Ese consejo se escribió pensando en escribir código, pero la misma lógica aplica a cualquier delegación: lo que un subagente devuelve se lee con fluidez, tiene el formato correcto, parece hecho con cuidado — y todo eso es solo «de apariencia plausible», que no es lo mismo que ser realmente correcto. Si el orquestador toma la palabra a un subagente de que está «listo» y empalma la salida directamente en el resultado final, se ha saltado la verificación por completo.

## Cómo verificar: fija un estándar comprobable para la salida de un subagente

«No tomarlo al pie de la letra» es fácil de decir; lo difícil es cómo verificar. Leerlo una vez y decidir que «se ve bien» no es verificación — eso sigue atascado en la primera mitad de la brecha de confiar-entonces-verificar. El enfoque fiable es definir primero un estándar concreto y comprobable, y luego medir la salida del subagente contra él.

Un estándar usado en un sistema de producción se ve así: "We used an LLM judge that evaluated each output against criteria in a rubric: factual accuracy (do claims match sources?), citation accuracy (do the cited sources match the claims?), completeness (are all requested aspects covered?), source quality (did it use primary sources over lower-quality secondary sources?), and tool efficiency (did it use the right tools a reasonable number of times?)."[^S1] Lo que comparten estos cinco criterios es que cada uno se puede comprobar de forma concreta, no puntuar por impresión. La exactitud factual se puede comprobar línea por línea contra las fuentes que el subagente citó; la completitud se puede comprobar contra cada requisito enumerado en la descripción de la tarea, para ver si todos quedaron cubiertos; la eficiencia de herramientas se puede leer directamente del registro de llamadas, para juzgar si hubo llamadas obviamente redundantes o duplicadas.

Llevando esto a tu propia configuración de colaboración, el primer paso para verificar la salida de un subagente no es preguntar «¿esto se ve bien?», sino preguntar «para esta tarea, ¿qué criterios puedo comprobar de forma concreta?» — enuméralos, y luego mide la salida contra cada uno.

```agentmentor-check
{
  "id": "mac-zh-05-trust-subagent",
  "label": "Un subagente dice que la tarea está lista — ¿puedes tomarlo al pie de la letra?",
  "prompt": "Un subagente devuelve su resultado y dice: «Investigación completa, los datos son exactos y sin errores.» La salida tiene un formato pulcro y se lee con fluidez. ¿Cómo debería manejar el orquestador esta afirmación de «datos exactos y sin errores»?",
  "whyHere": "El autorreporte de un subagente se lee con auténtica confianza, y es fácil dejarse llevar por ese tono confiado hasta suponer que cierto tono significa que realmente se verificó — este es el punto para pinchar de inmediato ese malentendido con la brecha oficial de confiar-entonces-verificar",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Tomarlo al pie de la letra — si el subagente dijo explícitamente «exacto y sin errores», normalmente no lo diría sin motivo",
      "correct": false,
      "feedback": "El autorreporte de un subagente no es evidencia. La guía oficial es explícita en que aparece una brecha donde la salida parece plausible pero no maneja los casos límite, y si no puedes verificarla no deberías tomarla directamente — «dicho con confianza» y «realmente verificado» son dos cosas distintas, y el tono no puede sustituir a la verificación."
    },
    {
      "id": "b",
      "text": "No tomarlo al pie de la letra — define un estándar concreto y comprobable para esta tarea (como si los hechos coinciden con las fuentes, si las citas son exactas) y recórrelo punto por punto antes de decidir si usarlo",
      "correct": true,
      "feedback": "Correcto. La lección oficial es que una salida que parece plausible no equivale a una salida que de verdad lo hizo bien, y si no puedes verificarla no puedes tomarla directamente; la forma fiable de verificar es como los criterios que usó el LLM juez oficial — define ítems concretos y comprobables (exactitud factual, exactitud de las citas, completitud, etc.) y mide la salida del subagente contra cada uno, en lugar de juzgar por el propio reporte del subagente o por si se lee con fluidez."
    },
    {
      "id": "c",
      "text": "No tomarlo al pie de la letra, pero mientras el formato sea pulcro y el contenido se lea con fluidez, básicamente puedes juzgar que la salida está bien",
      "correct": false,
      "feedback": "«Formato pulcro, se lee con fluidez» es justo lo que la guía oficial llama parecer plausible, y ahí es precisamente donde es más fácil dejarse engañar — la calidad superficial de la salida y si el contenido es realmente exacto o se salta casos límite son cosas sin relación. La verificación real tiene que aterrizar en criterios concretos y comprobables; no puede quedarse en «se lee bien»."
    }
  ]
}
```

## Trabajo duplicado: varios subagentes haciendo lo mismo

La Lección 3 cubrió cómo una descripción de tarea que no es lo bastante detallada lleva a subagentes que "misinterpreted the task or performed the exact same searches as other agents."[^S1] Esa es la causa raíz, pero el fallo normalmente solo aflora en el momento en que se agregan los resultados — el orquestador recibe varias salidas de subagentes y descubre que dos de ellas se solapan fuertemente, cubriendo lo mismo con palabras distintas.

El trabajo duplicado no es un error catastrófico en sí mismo — el contenido no está mal, solo desperdicia los tokens y las llamadas que deberían haber cubierto otro ángulo. Pero es una señal: los límites de tarea de algunos subagentes no se trazaron con la suficiente claridad, y vale la pena volver a revisar las descripciones de tarea del paso de despacho, en lugar de solo deduplicar a mano este lote de resultados y darlo por hecho. Cuando detectes trabajo duplicado, en vez de solo borrar el contenido repetido, vale más averiguar por qué se repitió — si las dos descripciones de tarea se solapaban en alcance, o si los subagentes derivaron cada uno hacia la misma dirección, la más obvia.

## Resultados en conflicto: dos subagentes llegan a conclusiones contradictorias

Más peliagudo que el trabajo duplicado es un conflicto de resultados — como la escena que abrió esta lección: dos subagentes investigan cada uno por su cuenta y devuelven conclusiones que se contradicen, uno diciendo que el plan inicial arranca en \$20 al mes, el otro diciendo \$25. No puedes lidiar con esto «simplemente eligiendo uno» o «partiendo la diferencia» — ambos enfoques arriesgan servir un número equivocado como conclusión final.

Cuando te topes con un conflicto de resultados, el orden sensato es: primero mira en qué basó cada lado su respuesta — ¿consultaron fuentes distintas, uno usando la página actual en vivo del proveedor y el otro usando por accidente una página vieja en caché?; si se puede rastrear la base, normalmente puedes decir cuál es más fiable y reemplazar el poco fiable; si la base en sí no puede zanjar quién tiene razón, no tomes tú la decisión durante la integración — marca la contradicción tal cual para revisión humana, o levanta un nuevo subagente específicamente para verificar ese punto de desacuerdo. El problema que expone un conflicto de resultados suele ser más preocupante que el trabajo duplicado — significa que al menos una salida de subagente está mal, y si la dejas caer en el resultado final sin manejarla, has empaquetado un error no verificado como una conclusión «lista».

## Integración de resultados y deduplicación: qué hace el orquestador para cerrar

Coser varias salidas de subagentes en un resultado final no es cuestión de concatenarlas una tras otra — significa volver a recorrer las categorías de problema de arriba: ¿hay contenido duplicado que necesite fusionarse, hay conclusiones contradictorias que necesiten verificarse o marcarse, cada afirmación se remonta a una base correspondiente? Este último punto es especialmente fácil de pasar por alto — la Lección 3, «Escribir prompts para la delegación», mencionó que el sistema de producción montó un agente dedicado, descrito como "a CitationAgent, which processes the documents and research report to identify specific locations for citations. This ensures all claims are properly attributed to their sources."[^S1] La misma lógica se sostiene en la etapa de integración: una vez que varias salidas de subagentes se juntan en un pozo común, es fácil que haya una atribución errónea — apuntar como conclusión sobre la empresa de la que se encargaba el subagente B unos datos que encontró el subagente A. Verificar la atribución de fuente de cada afirmación en la etapa de integración importa tanto como verificar si los hechos en sí son exactos.

Deduplicar, verificar conflictos y comprobar la atribución de fuentes — esos tres juntos son el trabajo real del paso de «agregar», y no, como advirtió la Lección 2, solo concatenar las respuestas en bruto de los subagentes y darlo por hecho.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Manejar un conflicto de resultados

Dos subagentes investigan cada uno el monto de la ronda de financiación más reciente de una empresa. El subagente A dice que son \$30 millones, basándose en un reporte de un medio de tecnología; el subagente B dice que son \$35 millones, basándose en un comunicado de prensa que la propia empresa publicó. Explica cómo manejarías este conflicto, y cómo debería presentarse el resultado final.

<!-- rubric -->
- No se limita a «elegir uno» o «partir la diferencia» y seguir adelante
- Menciona formas concretas de verificar la base de cada lado y juzgar la credibilidad de las fuentes
- Explica cómo debería presentarse el resultado final (incluido qué hacer cuando la base no puede zanjar quién tiene razón)

<!-- answer -->
No deberías simplemente elegir un número ni promediar los dos. Empieza comparando la credibilidad de las fuentes de cada lado — un comunicado de prensa oficial suele ser más autoritativo y más cercano a una fuente primaria que la cobertura de medios de terceros, así que en este caso los \$35 millones del subagente B son más fiables. Puedes verificar la fecha de publicación y la redacción exacta del comunicado, confirmar que no hay una mala lectura, y luego usar \$35 millones como resultado final, anotando en la salida «difiere de los \$30 millones de algunos reportes de medios; la cifra del comunicado de prensa oficial es la autoritativa» en lugar de descartar el conflicto en silencio y fingir que no existe. Si las dos fuentes son de credibilidad más o menos igual y no puedes decir cuál es más fiable, no deberías tomar tú la decisión en la etapa de integración — marca el desacuerdo tal cual para revisión humana, o despacha un subagente aparte para verificarlo.

<!-- hint -->
Pregunta primero: ¿en qué basó cada subagente su respuesta? Las fuentes en sí difieren en autoridad, y eso suele bastar para decir en cuál confiar — sin necesidad de adivinar ni de partir la diferencia como atajo.

<!-- hint -->
Si las fuentes de verdad son de igual credibilidad, marcar honestamente el conflicto es más seguro que forzar una elección y arriesgarse a servir información equivocada.

### Nivel 2: Escribir criterios de verificación para la tarea de un subagente

La tarea de un subagente es: «Leer el último mes de feedback de clientes y extraer los 3 problemas mencionados con más frecuencia.» Siguiendo el enfoque de la rúbrica oficial del LLM de esta lección (exactitud factual, completitud, etc.), escribe 3-4 criterios de verificación comprobables para esta tarea específica. Cada criterio debería indicar qué exactamente comprobar y cómo comprobarlo.

<!-- rubric -->
- Escribe 3-4 criterios, cada uno comprobable de forma concreta y no un estándar vago de «¿se lee razonable?»
- Los criterios reflejan esta tarea específica (extraer problemas del feedback), no una copia de los criterios del reporte de investigación del ejemplo oficial
- Cada criterio explica cómo comprobar, no solo el nombre de un criterio

<!-- answer -->
Respuesta de ejemplo:

1. **Exactitud de la extracción**: Contrastar por muestreo contra el feedback original para confirmar que los 3 problemas listados se mencionaron realmente de forma explícita en el feedback en bruto, y no fueron resumidos ni extrapolados por el propio subagente.
2. **Exactitud del ranking**: Verificar que estos 3 problemas de verdad son los tres primeros por cantidad de menciones — puedes hacer que el subagente también aporte la cantidad de menciones concreta de cada problema, o una lista de citas de origen, para comprobar si el ranking se sostiene.
3. **Completitud de la cobertura**: Confirmar que el subagente leyó realmente todo el feedback del último mes en lugar de concluir a partir de solo una parte — ten en cuenta que no puedes limitarte a comprobar la cantidad que el subagente reporta haber manejado, ya que eso sigue dependiendo del estado autorreportado; en su lugar, muestrea al azar varios ítems del feedback del mes (incluidos algunos de los más tempranos y los más tardíos) y comprueba si su contenido aparece en la categorización o los conteos del subagente.
4. **Exactitud de la atribución**: Comprobar que el fragmento de feedback original citado bajo cada problema de verdad sustenta la descripción de ese problema, evitando atribuir por error una pieza de feedback a un problema distinto.

<!-- hint -->
La «exactitud factual» en esta tarea se traduce en: ¿los problemas listados de verdad se mencionan en el texto original, en lugar de inventados por el subagente? — averiguar cómo contrastar por muestreo contra la fuente es el método de comprobación concreto de este criterio.

<!-- hint -->
La «completitud» en esta tarea no es «¿se cubren todos los aspectos pedidos?», es «¿leyó de verdad todo el feedback pedido?» — piensa cómo verificar que el subagente no se apresuró a una conclusión tras leer solo una parte.

<!-- /exercises -->

## Resumen

- «Listo» o «verificado, sin errores» cuando un subagente devuelve algo es solo un autorreporte, no evidencia. Sin una comprobación que pueda ejecutar, «parece listo» es la única señal disponible[^S6]; la documentación oficial es explícita en que Claude "produces a plausible-looking implementation that doesn't handle edge cases", y si no puedes verificarlo, no lo entregues.[^S6]
- La verificación no puede quedarse en «se lee bien» — define criterios comprobables para la tarea específica, como la rúbrica con la que trabajó el LLM juez oficial, donde la exactitud factual, la exactitud de las citas, la completitud, la calidad de las fuentes y la eficiencia de herramientas se pueden comprobar cada una línea por línea.[^S1]
- **El trabajo duplicado** es una consecuencia común de límites de tarea que no se trazaron con claridad[^S1], que normalmente aflora solo cuando se agregan los resultados; detectar un duplicado no es solo borrar el contenido de más, vale la pena volver a revisar las descripciones de tarea del paso de despacho.
- **Los resultados en conflicto** — dos subagentes llegando a conclusiones contradictorias — no se pueden manejar eligiendo uno al azar ni partiendo la diferencia; verifica primero la credibilidad de la base de cada lado, y cuando no puedas ordenarlas, marca el conflicto tal cual para revisión humana.
- La etapa de integración hace tres cosas a la vez: deduplicar, verificar conflictos y comprobar si la atribución de fuente de cada afirmación está mal asignada[^S1] — ese es el trabajo real del paso de «agregar», y no solo concatenar las respuestas en bruto de los subagentes.

[>> Lección 6: Práctica: Construir un pipeline de revisión de dos agentes](./06-build-a-review-pipeline.md)
