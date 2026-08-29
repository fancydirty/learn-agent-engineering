# Lección 3: Escribir prompts para delegar

> Objetivos de aprendizaje:
> - Escribir un prompt de delegación autocontenido que no dependa de que el subagente vea la conversación entre tú y el orquestador
> - Detallar el alcance, los límites y qué fuentes usar de la tarea dentro del propio prompt de delegación
> - Explicar el principio de «un dominio de problema, un agente» y qué te cuesta romperlo
>
> Requisitos: Terminar la Lección 2 y entender la arquitectura orquestador-subagente y el aislamiento de contexto | Anterior: [Lección 2 <<](./02-orchestrator-and-subagents.md) | Siguiente: [Lección 4 >>](./04-collaboration-patterns.md)

## Recordatorio: todo lo que el subagente no puede ver, tienes que escribírselo tú

La Lección 2 cubrió un mecanismo que importa aquí: "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read. Claude composes a delegation message that summarizes the task, and the subagent works from there."[^S3] (cada subagente arranca con una ventana de contexto fresca y aislada; no ve tu historial de conversación, las skills que ya has invocado ni los archivos que Claude ya ha leído; Claude compone un mensaje de delegación que resume la tarea, y el subagente trabaja a partir de ahí). Esta lección lo concreta. Significa que todo el trasfondo que hablaste con el usuario a nivel del orquestador, los compromisos que cerraste en rondas anteriores, la restricción que el usuario soltó al pasar: el subagente no sabe nada de eso. Lo único que el subagente sabe son las palabras que escribiste en esta única tarea de delegación.

Esto no es un recordatorio amable, es una restricción dura: **el techo de calidad del prompt de delegación fija el techo de calidad de lo que el subagente produce**. Todo lo que el prompt no detalle, el subagente lo adivinará, lo saltará o se inventará una suposición y seguirá adelante. Adivina bien y tuviste suerte. Adivina mal y esa subtarea entera queda básicamente desperdiciada.

## Autocontenido: el prompt tiene que decirlo todo por sí solo

**Autocontenido**: tras leer un prompt de delegación, el subagente no necesita trasfondo extra para deducir con precisión qué debería hacer. Hay una prueba simple para saber si un prompt es autocontenido. Sácalo por su cuenta, quita todo el contexto entre tú y el orquestador, y léelo en frío. Si aun así tienes que *adivinar* para rellenar los detalles de la tarea, el prompt no pasa la prueba.

Toma el ejemplo de la Lección 1 de investigar precios en tres proveedores de nube. Si el orquestador entrega al subagente una tarea que dice solo «busca los precios de AWS», esa única línea lleva información suficiente para el orquestador mismo, porque el contexto del orquestador todavía sostiene el trasfondo de «por qué lo estamos buscando», «con quién lo compararemos después» y «en qué dimensiones estamos comparando». Pero el subagente no puede ver nada de eso. Lo que recibe es una línea solitaria, «busca los precios de AWS», y le toca adivinar: ¿los precios de qué categorías de producto? ¿Solo los precios actuales, o los cambios del último año? ¿Qué aspecto debería tener el entregable una vez encontrado? Cada suposición es una apuesta que puede salir mal.

## Detallar alcance y restricciones: qué hacer, qué no, qué fuentes usar

La guía oficial lista lo que debería contener una descripción de tarea de subagente sólida: "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries. Without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information."[^S1] (cada subagente necesita un objetivo, un formato de salida, orientación sobre las herramientas y fuentes a usar, y límites de tarea claros; sin descripciones de tarea detalladas, los agentes duplican trabajo, dejan huecos o no logran encontrar la información necesaria).

Abre esa lista. «Objetivo» y «formato de salida» son fáciles de captar. Los dos que se saltan son el último par: **orientación sobre las fuentes** y **límites de la tarea**. La orientación sobre las fuentes le dice al subagente dónde buscar la respuesta: la página oficial de precios, un sitio externo de comparación de precios, o ambos con la página oficial teniendo prioridad. Los límites de la tarea le dicen al subagente que esta ejecución solo cubre esta porción, que no se pase de ahí: solo los precios actuales, sin cambios históricos de precio; solo las líneas de producto principales, sin listar cada servicio oscuro. Sáltate esos dos y el subagente tiende a irse por uno de dos caminos. O se pierde información que sí querías, o trae mucho más de lo que querías y quema llamadas a herramientas y tokens que podrías haber ahorrado.

Reescrita como una descripción de tarea autocontenida y con alcance claro, la investigación del proveedor de nube se ve a grandes rasgos así:

```json
{
  "objective": "Investigar la estructura de precios actual del principal servicio de cómputo de AWS (EC2), centrado en los dos modelos de facturación: instancias bajo demanda e instancias reservadas",
  "scope": "Buscar solo los precios vigentes ahora mismo, sin cambios históricos de precio; cubrir solo los tipos de instancia de propósito general y optimizadas para cómputo, sin necesidad de cubrir cada familia de instancias",
  "sources": "Usar la página oficial de precios de AWS como fuente de verdad; si la página oficial no es lo bastante clara, puedes complementar con la calculadora oficial de precios de AWS",
  "output_format": "Un resumen de texto de menos de 300 palabras que cubra: el rango de precio por hora de las instancias bajo demanda, el descuento que ofrecen las instancias reservadas frente a las de bajo demanda, y una conclusión de una línea sobre qué modelo de facturación conviene a cada caso de uso"
}
```

Sacada por su cuenta, esta descripción le permite al subagente juzgar con precisión «qué buscar, hasta dónde llevarlo, qué entregar» sin conocer nada de lo que el orquestador discutió internamente.

## El contraejemplo: las instrucciones vagas dejan a los subagentes improvisar

Qué sale mal de verdad cuando no detallas alcance y límites: el equipo oficial dio un ejemplo real de la práctica: "We started by allowing the lead agent to give simple, short instructions like 'research the semiconductor shortage,' but found these instructions often were vague enough that subagents misinterpreted the task or performed the exact same searches as other agents."[^S1] (empezamos permitiendo que el agente líder diera instrucciones simples y cortas como «investiga la escasez de semiconductores», pero descubrimos que esas instrucciones a menudo eran lo bastante vagas como para que los subagentes malinterpretaran la tarea o hicieran exactamente las mismas búsquedas que otros agentes).

«investiga la escasez de semiconductores» se lee como si entregara una tarea, pero no fija nada: ¿en qué rango de tiempo? ¿Centrada en el lado de la oferta, el de la demanda o el impacto de las políticas? ¿Entregada en qué forma? Tres subagentes a los que se entrega la misma instrucción vaga muy probablemente busquen todos hacia «las causas de la escasez de semiconductores», el ángulo que viene primero a la mente, y el resultado son tres cuerpos de investigación que se solapan mucho, mientras que los ángulos que de verdad necesitaban cobertura (digamos, el impacto en las industrias derivadas, o cómo respondieron distintos países) quedan sin tocar. Esta es la raíz, a nivel de prompt, del problema del «trabajo duplicado» de la Lección 2: no es que los subagentes no hagan caso, es que la descripción de la tarea misma nunca trazó los límites.

```agentmentor-check
{
  "id": "mac-zh-03-vague-instruction",
  "label": "Es esta instrucción de delegación lo bastante buena",
  "prompt": "El orquestador envía la misma instrucción a tres subagentes: «Echa un vistazo a la actividad reciente de producto de esta empresa.» Cada subagente busca por su cuenta, y lo que devuelven se solapa mucho a la vez que se pierde lo que al orquestador más le importaba: «los lanzamientos de funciones nuevas de los últimos seis meses». ¿Dónde está el problema?",
  "whyHere": "Acabamos de ver cómo las instrucciones vagas hacen que los subagentes malinterpreten la tarea o corran búsquedas duplicadas unos contra otros. Esto da un caso concreto de trabajo duplicado para comprobar si quien aprende sabe ubicar la causa raíz como «a la descripción de la tarea le faltan alcance y límites» en lugar de culpar a una capacidad débil del subagente o a la mala suerte.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "La capacidad de búsqueda de los subagentes no es lo bastante fuerte; deberías cambiar a un modelo más capaz",
      "correct": false,
      "feedback": "El problema no es la capacidad del modelo. El caso real oficial muestra que incluso el mismo lote de subagentes, ante una instrucción vaga como \"research the semiconductor shortage\", malinterpretará la tarea y correrá búsquedas duplicadas unos contra otros, porque la instrucción misma no fija ningún alcance, lo que no tiene nada que ver con lo fuerte que sea el modelo. Un modelo más fuerte no arreglará una instrucción a la que le faltan límites."
    },
    {
      "id": "b",
      "text": "Esta instrucción nunca detalla el objetivo, el alcance y el formato de salida, así que los subagentes solo pueden buscar según su propia lectura de ella, amontonándose de forma natural en el ángulo más obvio por duplicado mientras se pierden el ángulo que el orquestador de verdad quería",
      "correct": true,
      "feedback": "Correcto. «Echa un vistazo a la actividad reciente de producto» no dice en qué aspecto concreto centrarse (como «los lanzamientos de funciones nuevas de los últimos seis meses»), ni traza alcance ni formato de salida, así que los subagentes solo pueden buscar según su propia lectura y tienden a agruparse en el ángulo más obvio, produciendo mucho solape mientras el ángulo concreto que al orquestador le importaba queda sin cubrir. Esto es exactamente lo que la guía oficial quiere decir con «las instrucciones vagas llevan a malinterpretar la tarea o a búsquedas duplicadas»."
    },
    {
      "id": "c",
      "text": "Los tres subagentes deberían sincronizar entre sí su progreso de búsqueda para evitar buscar el mismo contenido",
      "correct": false,
      "feedback": "Esto equivale a pedirles a los subagentes que compartan contexto, pero la Lección 2 ya cubrió que el mecanismo por defecto es que cada subagente arranque desde un contexto aislado y reciba solo la descripción de tarea que el orquestador escribió para él, así que tampoco puede ver el trabajo de los demás. El sistema oficial cayó justo en esta trampa al principio: varios agentes \"distracting each other with excessive updates\"[^S1] (distrayéndose mutuamente con actualizaciones excesivas), llenando la atención unos de otros. El arreglo de verdad es escribir con claridad el alcance y los límites de cada subagente al delegar, previniendo el solape en el origen, en lugar de confiar en que los subagentes se coordinen en tiempo de ejecución después del hecho."
    }
  ]
}
```

## Un dominio de problema, un agente

Más allá de escribir un solo prompt con claridad, cómo varios subagentes se reparten el trabajo también sigue un principio que puedes destilar de la práctica oficial —el equipo oficial nunca lo nombró, este nombre es nuestro—: **un dominio de problema, un agente**: cada subagente debería ser dueño solo de una clase de problema con límites claros, en lugar de que un único subagente haga malabares con varias cosas sin relación a la vez.

El sistema oficial tiene un ejemplo directo: montaron un CitationAgent dedicado, "a CitationAgent, which processes the documents and research report to identify specific locations for citations. This ensures all claims are properly attributed to their sources."[^S1] (un CitationAgent, que procesa los documentos y el informe de investigación para identificar las ubicaciones concretas de las citas; esto garantiza que todas las afirmaciones se atribuyan correctamente a sus fuentes). Encontrar dónde van las citas es una clase de trabajo completamente distinta de «investigar la estrategia de precios de alguna empresa»: lo primero es comprobar y ubicar, lo segundo es buscar y juzgar. Entrega ambas al mismo subagente y tiene que ir y venir entre dos modos de pensamiento del todo distintos, y su descripción de tarea crece larga y enredada por intentar servir a dos objetivos, fácil de descuidar uno por el otro. Divide en dos subagentes enfocados y la descripción de tarea de cada uno se mantiene simple y con límites claros, lo que hace eco de la vara de medir de la Lección 1: si se puede partir en subtareas independientes, vale la pena partirlo.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Criticar una instrucción vaga y reescribirla

La instrucción de delegación del orquestador a un subagente es: «Echa un vistazo a los issues recientes de este proyecto de código abierto y encuentra cualquier cosa que valga la pena tener en cuenta.» Señala qué elementos le faltan a esta instrucción, y reescríbela como una descripción de tarea autocontenida con alcance claro (puedes usar la estructura JSON del ejemplo de la Lección 3, o tu propio formato, pero tiene que cubrir los cuatro tipos de elemento: objetivo, alcance, fuentes y formato de salida).

<!-- rubric -->
- Señala los elementos concretos que le faltan a la instrucción original (en lugar de decir vagamente «no está claro»)
- La descripción de tarea reescrita cubre los cuatro tipos de elemento: objetivo, alcance, fuentes, formato de salida
- El alcance refleja límites concretos de «qué buscar, qué no» en lugar de adjetivos vacíos

<!-- answer -->
Elementos que le faltan a la instrucción original: nunca dice qué rango de tiempo significa «recientes»; nunca define el criterio de «valga la pena tener en cuenta» (¿por número de estrellas, por actividad de discusión, o por si es un bug?); nunca dice qué fuentes usar (¿la propia lista de issues, o también las discusiones y PR enlazados?); nunca dice en qué formato entregar.

Ejemplo de reescritura:

```json
{
  "objective": "De los issues abiertos en este proyecto de código abierto en los últimos 30 días, encontrar los etiquetados como bugs con más de 5 comentarios",
  "scope": "Mirar solo los issues abiertos en los últimos 30 días, sin necesidad de cubrir issues históricos más antiguos; mirar solo los que tienen la etiqueta de bug, ignorar los issues de solicitud de función",
  "sources": "Usar la lista de issues del repo de GitHub del proyecto y los comentarios de cada issue como fuente de verdad",
  "output_format": "Una lista donde cada entrada contenga el título del issue, el enlace y el número de comentarios, ordenada por número de comentarios de mayor a menor, con como máximo 10 entradas"
}
```

<!-- hint -->
Empieza por rodear con un círculo cada palabra vaga de la instrucción original: «recientes», «valga la pena tener en cuenta». Detrás de cada palabra vaga hay un criterio de juicio que tienes que decidir en nombre del subagente. Escribe esos criterios con claridad, y solo entonces la instrucción es autocontenida.

<!-- hint -->
El «formato de salida» es fácil de dejar fuera, pero decide si el orquestador puede usar el resultado directamente cuando vuelva. Imagina qué hace el orquestador a continuación después de recibir la respuesta del subagente, y trabaja hacia atrás hasta lo que el subagente debería entregar.

### Nivel 2: Juzgar si una delegación rompe «un dominio de problema, un agente»

El orquestador diseñó este subagente: «Responsable de buscar las noticias recientes de financiación de esta empresa, y al mismo tiempo resumir el estilo del texto de la página de inicio de la empresa, para que el equipo tenga una referencia al escribir textos más adelante.» Juzga si este diseño es sólido y explica por qué; si no lo es, da una forma más razonable de repartirlo.

<!-- rubric -->
- Juzga si el diseño encaja con «un dominio de problema, un agente» y explica por qué
- El razonamiento refleja en qué difieren en naturaleza estas dos tareas (en lugar de solo decir «no me cuadra»)
- El reparto propuesto (si se juzga poco sólido) separa con claridad en subagentes independientes

<!-- answer -->
No es sólido; rompe «un dominio de problema, un agente». Buscar noticias de financiación cae en la clase de trabajo de «buscar y verificar datos factuales», que necesita juzgar si las fuentes son autorizadas y si los números son exactos; resumir el estilo del texto de la página de inicio cae en la clase de trabajo de «leer y destilar el tono de la escritura», que necesita sensibilidad al estilo del lenguaje y casi no tiene nada que ver con verificar exactitud numérica. Mete ambas en la misma descripción de tarea y el subagente tiene que cambiar entre dos modos de trabajo distintos, y la descripción de tarea misma crece más larga y más enredada por cubrir dos objetivos, fácil de quedarse corta en uno de ellos. El reparto más razonable monta dos subagentes: uno dedicado a verificar las noticias de financiación, con un formato de salida de datos estructurados como ronda de financiación, monto y fecha; el otro dedicado a leer el texto de la página de inicio y resumir sus rasgos de estilo, con un formato de salida de unas cuantas descripciones de estilo más frases de ejemplo.

<!-- hint -->
Para juzgar si dos cosas son el mismo «dominio de problema», pregunta: ¿las dos tareas piden la misma clase de juicio? Verificar exactitud numérica y resumir estilo de escritura claramente piden criterios distintos.

<!-- hint -->
Compara con el ejemplo del CitationAgent de esta lección: encontrar ubicaciones de citas e investigar la estrategia de precios de una empresa se reparten en dos subagentes distintos precisamente porque piden clases de trabajo distintas, aunque ambas al final sirvan al mismo informe de investigación.

<!-- /exercises -->

## Resumen

- El subagente no puede ver el historial de conversación del orquestador,[^S3] lo que significa que un prompt de delegación tiene que ser **autocontenido**: legible por su cuenta, aparte de cualquier trasfondo conversacional, y aun así suficiente para que el subagente juzgue con precisión qué debería hacer.
- Una descripción de tarea sólida tiene que contener un objetivo, un formato de salida, orientación sobre las fuentes y límites de tarea claros; sin esto, los subagentes duplican trabajo, dejan huecos o no logran encontrar la información necesaria.[^S1]
- El contraejemplo real oficial demuestra que las instrucciones vagas como «investiga la escasez de semiconductores» llevan a los subagentes a malinterpretar la tarea o a correr exactamente las mismas búsquedas que otros subagentes[^S1]: el alcance y los límites no son opcionales, son la clave para evitar el trabajo duplicado.
- **Un dominio de problema, un agente** (la destilación que hace esta lección de la práctica oficial): cada subagente debería ser dueño solo de una clase de problema con límites claros, como montar un CitationAgent dedicado para manejar las ubicaciones de citas, repartiendo trabajo de naturaleza distinta entre subagentes distintos[^S1] para que cada descripción de tarea se mantenga simple y enfocada.
- Para juzgar si un prompt de delegación es lo bastante bueno, la prueba es simple: sácalo por su cuenta y léelo una vez, y mira si el subagente tiene que adivinar para rellenar los detalles de la tarea.

[>> Lección 4: Patrones de colaboración: pipeline, revisión, votación](./04-collaboration-patterns.md)
