# Lección 4: Patrones de colaboración: pipeline, revisión, votación

> Objetivos de aprendizaje:
> - Distinguir cómo funcionan realmente el pipeline, el productor-revisor y la votación multiperspectiva
> - Juzgar qué patrón encaja con una tarea dada, y nombrar el perfil de costo de cada uno
> - Entender la diferencia clave sobre quién retiene el control entre la colaboración por handoff y la colaboración orquestador-subagente
>
> Requisitos: haber terminado la Lección 3, tener soltura escribiendo prompts de delegación autocontenidos y con alcance claro | Anterior: [Lección 3 <<](./03-writing-prompts-for-delegation.md) | Siguiente: [Lección 5 >>](./05-failure-and-coordination.md)

La estructura orquestador-subagente de las dos lecciones anteriores es una forma: un nodo central divide la tarea, varios subagentes trabajan en paralelo, y sus resultados se fusionan de vuelta. Pero esa no es la única manera de conectar varios agentes. Esta lección cubre tres patrones de colaboración más específicos —pipeline, productor-revisor y votación multiperspectiva—, dónde encaja cada uno y a dónde se va su costo, y luego una cuarta forma de colaborar que funciona con una idea completamente distinta de la de orquestador-subagente: ceder el control por completo.

## Pipeline: un paso tras otro, cada uno alimentándose del anterior

**Pipeline** (encadenamiento de prompts): "Prompt chaining decomposes a task into a sequence of steps, where each LLM call processes the output of the previous one."[^S2] La mayor diferencia entre un pipeline y orquestador-subagente es esta: orquestador-subagente es una estructura paralela — "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results."[^S2] Un pipeline es estrictamente un paso tras otro — el siguiente paso no puede empezar hasta que el anterior termine, y toma la salida de ese paso anterior directamente como su propia entrada.

Toma una entrada de blog para el lanzamiento de un producto. Puedes dividirla en tres pasos: redactar una primera versión, traducir el borrador a otro idioma, y luego revisar la versión traducida en busca de terminología inconsistente. La entrada del segundo paso es la salida del primero; la entrada del tercero es la salida del segundo; ninguno puede adelantarse y empezar por su cuenta. Esta forma encaja con tareas que llevan un orden natural, donde el siguiente paso realmente no puede avanzar sin el resultado del anterior. A diferencia de investigar los precios de tres empresas, que sí se divide en fragmentos independientes, cada paso de un pipeline depende del que le precede.

## Productor-revisor: uno escribe, otro lo desmenuza, y vuelta a empezar

**Productor-revisor** (evaluador-optimizador): "one LLM call generates a response while another provides evaluation and feedback in a loop."[^S2] La diferencia clave respecto a un pipeline es ese bucle. Un pipeline recorre un conjunto fijo de pasos y se detiene; el productor-revisor va borrador, el revisor da retroalimentación, se corrige según esa retroalimentación, se vuelve a revisar, y no para hasta que el revisor queda conforme (o se alcanza un número máximo de rondas preestablecido). Cuántas rondas hacen falta normalmente no se sabe de antemano.

Por ejemplo, haz que un agente escriba código que maneje la lógica de pago, y otro agente cuyo único trabajo sea comprobar si ese código pasa por alto casos límite — un importe negativo, un envío duplicado bajo concurrencia. Si el agente revisor encuentra un problema, el código vuelve al agente productor para otra pasada, y luego regresa al revisor, hasta que el revisor no ve problemas evidentes. Esta forma encaja con tareas donde «¿lo hizo bien?» no puede juzgarse con precisión de una sola vez y necesita pulido repetido para converger. La primera versión rara vez es la definitiva; el paso de revisión existe para cazar problemas evidentes antes de la entrega y empujar al productor a corregir una vez más.

## Votación multiperspectiva: varios juicios independientes sobre una misma cosa

**Votación multiperspectiva**: varios agentes juzgan cada uno el mismo contenido de forma independiente, en lugar de procesarlo paso a paso en un relevo. El ejemplo oficial es una revisión de seguridad de código: "Reviewing a piece of code for vulnerabilities, where several different prompts review and flag the code if they find a problem."[^S2] Aquí los "several different prompts" miran cada uno el mismo código de forma independiente, sin que ninguno dependa del juicio de otro; basta con que un prompt marque un problema para que el código quede marcado y merezca una mirada más cercana.

Este patrón difiere del productor-revisor. La votación no es un bucle de borrador-y-corrección; los agentes juzgan una pieza de contenido ya existente en paralelo y de forma independiente. El objetivo es reducir la probabilidad de que algo se escape comprobando desde varios ángulos distintos, no mejorar el contenido mediante ediciones repetidas. Encaja en situaciones donde preferirías gastar unas cuantas llamadas de más antes que dejar pasar un problema — en revisiones de seguridad y comprobaciones de cumplimiento, pasar por alto un problema real suele costar mucho más que unos cuantos tokens de más.

## Elegir entre los tres, y a dónde se va el costo

Los tres patrones tienen estructuras de costo distintas, así que elige haciendo las cuentas contra tu situación real:

- **Pipeline**: el costo total es más o menos la suma de las llamadas a lo largo de los pasos. La cantidad de pasos es fija y predecible, pero como la ejecución es estrictamente secuencial, la latencia total es la suma del tiempo de cada paso, así que no será rápido. Bueno para tareas con dependencias claras de un paso al siguiente donde el alcance de cada paso es bastante pequeño.
- **Productor-revisor**: el costo depende de cuántas rondas hagan falta para converger, y esa cantidad de rondas es incierta. Una vez que el productor y el revisor se enredan en un ida y vuelta, el costo puede dispararse muy por encima de lo que esperabas — por eso este patrón suele necesitar un tope máximo de rondas en el bucle, para que no gire indefinidamente. Bueno para tareas donde la primera versión probablemente no sea suficientemente buena y necesite pulido repetido.
- **Votación multiperspectiva**: el costo es más o menos el de una sola revisión por el número de agentes que votan — una multiplicación directa, así que N agentes significan N veces el costo. Bueno para tareas donde un descuido sale caro y prefieres pagar más por una cobertura más amplia; mal ajuste para situaciones sensibles al costo donde el contenido en sí no es muy arriesgado.

Para elegir, vuelve a la forma de la tarea en sí. ¿Tiene un orden natural de pasos? Si es así, considera un pipeline. ¿La calidad de la salida necesita pulido repetido para ser suficientemente buena? Si es así, considera el productor-revisor. ¿Pasar por alto un problema sale lo bastante caro como para que valga la pena comprobar desde varios ángulos? Si es así, considera la votación multiperspectiva. Los tres tampoco son mutuamente excluyentes — un flujo de trabajo completo puede recorrer un pipeline fijo y anidar un bucle productor-revisor dentro de uno de sus pasos. La Lección 6 construye exactamente este tipo de combinación de forma práctica.

```agentmentor-check
{
  "id": "mac-zh-04-pipeline-vs-reviewer",
  "label": "¿Pipeline o productor-revisor?",
  "prompt": "La tarea: hacer que un agente escriba un borrador de documentación de una API, y luego que otro agente compruebe si al borrador le falta alguna descripción de parámetro; si falta algo, devolverlo al agente de documentación para que lo complete, y repetir hasta que la comprobación pase. ¿Es esto un patrón de pipeline o de productor-revisor?",
  "whyHere": "El pipeline y el productor-revisor entregan ambos la salida de un agente al siguiente, así que en la superficie se parecen, y es fácil dejarse llevar por esa estructura superficial y pasar por alto la diferencia clave — si vuelve al bucle. Los tres patrones y cómo elegir entre ellos se acaban de cubrir, así que un escenario concreto aquí fija el criterio de juicio en algo práctico.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Productor-revisor — un bucle de escribir-revisar-corregir que termina solo cuando la comprobación pasa.",
      "correct": true,
      "feedback": "Correcto. La definición oficial del productor-revisor es una llamada que genera una respuesta mientras otra aporta evaluación y retroalimentación en un bucle; el bucle aquí converge solo cuando la comprobación pasa. «Devolverlo para reescribir si la comprobación falla» es exactamente ese bucle, a diferencia del recorrido fijo y unidireccional de un pipeline — un pipeline no devuelve la salida de un paso para rehacer un paso anterior solo porque no quedó suficientemente bien."
    },
    {
      "id": "b",
      "text": "Pipeline — hay dos pasos, y el primero entrega su salida al segundo.",
      "correct": false,
      "feedback": "Fijarse solo en «hay un orden de pasos, y el paso posterior procesa la salida del anterior» no basta. Un pipeline recorre un conjunto fijo de pasos y se detiene; no devuelve trabajo. Aquí una comprobación fallida vuelve al agente de documentación para añadir más, una y otra vez hasta que pasa, así que la cantidad de rondas no es fija. Eso es el bucle del productor-revisor, no el recorrido secuencial de una sola pasada de un pipeline."
    },
    {
      "id": "c",
      "text": "Ninguno — esto es votación multiperspectiva, ya que dos agentes emiten cada uno un juicio.",
      "correct": false,
      "feedback": "La votación multiperspectiva requiere que varios agentes juzguen el mismo contenido ya existente de forma independiente, en paralelo y sin depender entre sí, para ampliar la cobertura frente a problemas que se escapan. Aquí los dos agentes están en un relevo — escribir, comprobar, corregir — y la retroalimentación del agente que comprueba cambia lo que hace a continuación el agente productor. Eso no es un juicio independiente en paralelo, así que no encaja con la definición de votación."
    }
  ]
}
```

## Otra manera de colaborar: ceder el control por completo

Los patrones vistos hasta ahora comparten una cosa: el orquestador (o el nodo que conecta un pipeline) se mantiene al mando de todo, y los subagentes devuelven resultados cuando terminan en lugar de quedarse con el volante y dirigir lo que viene después. Pero hay una idea completamente distinta para colaborar — **handoff**: "Handoffs: Peer agents hand off control to a specialized agent that takes over the conversation. This is decentralized."[^S4]

La diferencia central entre el handoff y el orquestador-subagente no es solo quién retiene el control — es también que el agente que toma el relevo ve una cantidad de información completamente distinta. La documentación es explícita: "When a handoff occurs, it's as though the new agent takes over the conversation, and gets to see the entire previous conversation history."[^S5] Ese es el comportamiento por defecto, y hay opciones de configuración como los filtros de entrada para cambiar cuánto historial ve el agente nuevo. Esto es exactamente lo opuesto al mecanismo de subagentes de las Lecciones 2 y 3: los subagentes arrancan desde un contexto nuevo y aislado y no ven la conversación anterior[^S3], mientras que el agente receptor de un handoff ve todo el historial por defecto, porque no se le despacha para hacer una tarea aislada y devolver un resultado — genuinamente toma el relevo de la conversación y sigue con el usuario o con la siguiente etapa desde ahí.

Esta diferencia decide qué situaciones encajan con cada estilo. El orquestador-subagente encaja con separar un lote de subtareas independientes donde cada una devuelve una conclusión y el nodo central se mantiene al mando de todo. El handoff encaja con el caso en que, a medida que la conversación avanza, te das cuenta de que un agente más especializado debería tomarla desde aquí, y le cedes la conversación entera intacta — por ejemplo, en soporte al cliente, un agente de soporte general juzga que el problema del usuario involucra un reembolso y cede la conversación completa a un agente especializado en reembolsos, para que el usuario no tenga que describir el problema otra vez desde cero. Esta transferencia de control ocurre igualmente dentro de una sola ejecución: "Handoffs stay within a single run."[^S5]

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Emparejar tres tareas con patrones de colaboración

Para cada una de las tres tareas de abajo, decide si encaja mejor con pipeline, productor-revisor o votación multiperspectiva, y explica por qué.

1. «Traducir un documento técnico a otro idioma, luego comprobar si la terminología especializada se usa de forma consistente en la traducción, y por último darle el formato de la plantilla de documentos de la empresa.»
2. «Revisar el borrador de un contrato y encontrar cada cláusula que pueda acarrear riesgo legal, esforzándose por no pasar por alto un solo riesgo.»
3. «Escribir el código central de un algoritmo de recomendación, con el objetivo de optimizar su rendimiento tanto como sea posible, permitiendo varias rondas de pulido hasta que quede satisfactorio.»

<!-- rubric -->
- Las tres tareas reciben una asignación clara de patrón
- El razonamiento muestra la característica clave de cada patrón (pasos fijos / volver al bucle / juicio independiente en paralelo), no solo una conclusión
- No trata «hay varios agentes involucrados» como que automáticamente implica un patrón concreto

<!-- answer -->
1. Pipeline. Traducción, consistencia terminológica y formato son tres pasos fijos con un orden de dependencias claro; cada paso procesa la salida del paso anterior, no hay devolución de trabajo para rehacerlo a partir de una comprobación, y termina una vez hechos los tres pasos.
2. Votación multiperspectiva. «Esforzarse por no pasar por alto un solo riesgo» significa que un descuido sale caro, así que encaja usar varios ángulos de revisión independientes (por ejemplo, uno centrado en las condiciones de pago, uno en la responsabilidad por incumplimiento, uno en la propiedad intelectual) revisando cada uno el mismo contrato; basta con que un ángulo marque un riesgo para que merezca atención, cambiando varias perspectivas por una cobertura más amplia.
3. Productor-revisor. «Permitiendo varias rondas de pulido hasta que quede satisfactorio» es exactamente el bucle de escribir-un-borrador, recibir-retroalimentación, corregir, volver-a-revisar; la cantidad de rondas no es fija, y solo se detiene una vez que converge en una versión satisfactoria.

<!-- hint -->
Las palabras clave te ayudan a ubicar una tarea rápido: una descripción clara de «primero… luego… por último…» con pasos fijos suele apuntar a pipeline; «tratar de no dejar pasar nada» y «varios ángulos» apuntan a votación; «pulir repetidamente» y «repetir en bucle hasta quedar satisfecho» apuntan a productor-revisor.

<!-- hint -->
La trampa fácil es la tarea 1 — también es «un paso tras otro», pero fíjate en que no involucra «devolverlo para reescribir si la comprobación falla». Los tres pasos son estrictamente unidireccionales, y eso es lo que la hace un pipeline y no un productor-revisor.

### Nivel 2: Elegir un enfoque para una revisión de seguridad con presupuesto limitado

La tarea: antes de enviarlo, revisar una pieza de código en busca de vulnerabilidades de seguridad, con un presupuesto de a lo sumo 3 llamadas al LLM, con el objetivo de maximizar la probabilidad de encontrar vulnerabilidades reales. Decide qué patrón de colaboración usar, y explica exactamente cómo configurar esas 3 llamadas.

<!-- rubric -->
- El enfoque elegido es la votación multiperspectiva, no el productor-revisor ni el pipeline
- Explica por qué, bajo esta restricción de presupuesto, la votación gana frente a repetir el bucle y el pulido
- Da una división concreta de las 3 llamadas (por ejemplo, centrándose en distintos tipos de vulnerabilidad)

<!-- answer -->
La votación multiperspectiva encaja. La necesidad central de la tarea es «maximizar la probabilidad de encontrar vulnerabilidades reales» — un descuido sale caro y quieres una cobertura más amplia desde varios ángulos, que es justo la fortaleza de la votación. La cantidad de rondas del productor-revisor es incierta, y bajo un presupuesto rígido de solo 3 llamadas probablemente agotarías las llamadas antes de que el bucle terminara de pulir; gastar las 3 llamadas directamente en revisiones independientes en paralelo es más predecible. Configuración concreta: usa las 3 llamadas para revisar el mismo código de forma independiente, cada una centrada en un tipo de vulnerabilidad distinto — la primera en fallos de inyección (inyección SQL, inyección de comandos), la segunda en problemas de permisos y de escalada de privilegios, la tercera en filtraciones de información sensible (claves, datos privados en los logs). Basta con que una llamada marque un problema para que merezca una revisión humana, cambiando tres ángulos distintos por una cobertura más amplia que una sola revisión.

<!-- hint -->
Descarta primero el productor-revisor — su cantidad de llamadas no es fija de antemano; depende de cuántas rondas tarde en converger, lo que no cuadra bien con el presupuesto rígido de «a lo sumo 3 llamadas» de la tarea.

<!-- hint -->
Si las 3 llamadas usan el mismo prompt para revisar el mismo código, el rédito es limitado; hacer que cada llamada se centre en una categoría de problema distinta es lo que de verdad amplía la cobertura — que es el sentido de los "several different prompts" que revisan cada uno en el ejemplo oficial.

<!-- /exercises -->

## Resumen

- **El pipeline** divide una tarea en una cadena de pasos fijos dependientes del orden, cada uno procesando la salida del paso anterior[^S2]; bueno para tareas con un orden natural que no necesitan devolución de trabajo.
- **El productor-revisor** es un bucle de escribir-un-borrador, recibir-retroalimentación, corregir, volver-a-revisar que corre hasta converger[^S2]; bueno para tareas cuya calidad de salida necesita pulido repetido, con el costo determinado por la cantidad de rondas, así que suele necesitar un tope máximo de rondas.
- **La votación multiperspectiva** tiene varios agentes juzgando el mismo contenido en paralelo y de forma independiente, marcándolo en cuanto cualquier ángulo encuentra un problema[^S2]; buena para situaciones donde un descuido sale caro y pagarás varias veces el costo por una cobertura más amplia, con un costo de más o menos el costo de una sola pasada por el número de agentes que juzgan.
- Para elegir entre los tres, mira la forma de la tarea: ¿tiene un orden natural de pasos, necesita pulido repetido, y sale caro un descuido? — las tres preguntas apuntan a pipeline, productor-revisor y votación multiperspectiva respectivamente.
- **El handoff** es una idea de colaboración distinta: los agentes se ceden el control por completo unos a otros, el agente receptor toma el relevo de la conversación y por defecto ve todo el historial previo de la conversación[^S5], lo opuesto al mecanismo de orquestador-subagente donde los subagentes arrancan desde un contexto nuevo y aislado y solo devuelven una conclusión[^S3] — un handoff se mantiene dentro de una sola ejecución y encaja con el caso en que un agente más especializado debería tomar el relevo de la conversación desde aquí[^S4].

[>> Lección 5: Fallos y coordinación](./05-failure-and-coordination.md)
