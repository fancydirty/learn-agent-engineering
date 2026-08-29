# Lección 5: Conjuntos de evaluación: empieza con 20 tareas reales

> Objetivos de aprendizaje:
> - Explicar por qué «esperemos a tener cientos de casos» es un error, y por qué los cambios de la etapa temprana tienen tamaños de efecto tan grandes que unos pocos casos alcanzan para distinguir versiones
> - Diseñar un lote de casos de evaluación siguiendo estos principios: anclados en el uso real, complementados con casos límite, calificación automatizada cuando se pueda, cantidad por encima de calidad por caso, e inclusión deliberada de casos ambiguos — cada uno emparejado con un resultado verificable
> - Usar conjuntos reservados para evitar sobreajustar los prompts hasta convertirlos en «modelos que solo aprueban estas preguntas», e identificar qué problemas no ven las evaluaciones automatizadas y solo atrapa la prueba manual
>
> Requisitos: Lecciones 1–4 («parece terminado» ≠ terminado, objetivos de verificación con el estado final primero, verificadores deterministas, jueces LLM) | Anterior: [<< Lección 4](./04-llm-as-judge.md) | Siguiente: [Lección 6 >>](./06-build-eval-harness.md)

## Un motivo de demora particularmente común

Seguro has visto esta escena. Alguien plantea la idea: «deberíamos armar un conjunto de evaluación para nuestro agente». Otra persona responde: «un conjunto de evaluación necesita cientos de casos para tener significancia estadística, ¿no? Ejecutar diez o veinte casos produce puntuaciones sin sentido que confunden más de lo que informan. Juntemos primero casos reales de usuarios y armamos el conjunto cuando tengamos suficientes».

Suena profesional. Disciplinado. Después pasan seis meses, los casos siguen en un documento compartido, el prompt se revisó treinta veces y nadie puede decir si alguna de esas revisiones fue una mejora o un retroceso.

El postmortem de ingeniería de Anthropic sobre su sistema multiagente de investigación señala directamente esta excusa: escuchan seguido que los equipos de desarrollo de IA demoran la creación de evaluaciones porque creen que solo las evaluaciones grandes con cientos de casos de prueba sirven, cuando en realidad lo mejor es empezar de inmediato con pruebas a pequeña escala con unos pocos ejemplos, en vez de demorarlo[^S2].

Esta lección aclara exactamente eso: por qué los conjuntos pequeños sí funcionan al principio, cómo debería verse un caso, cómo seleccionar esos casos y cómo evitar «ajustar el agente hasta volverlo experto en estas preguntas específicas y en nada más».

## Tamaño del efecto: por qué unos pocos casos bastan para ver diferencias al principio

Empecemos por un término. El **tamaño del efecto** se refiere a qué tan grande es la brecha que produce un cambio: ¿es pasar de 71,2% a 72,4%, o un salto de 30% a 80%? Las brechas grandes requieren menos muestras; las pequeñas requieren más. Esto no tiene nada de místico, es el mismo sentido común que usas para juzgar cuál de dos vasos de agua está más caliente: una diferencia de 30 grados es obvia al tacto, una diferencia de medio grado exige un termómetro.

El desarrollo temprano de agentes pertenece a la primera categoría. El postmortem oficial lo dice sin rodeos: en el desarrollo temprano de agentes los cambios tienden a tener impactos dramáticos porque abunda la fruta al alcance de la mano; un retoque del prompt podría subir las tasas de éxito de 30% a 80%, y con tamaños de efecto así de grandes puedes detectar los cambios con apenas unos pocos casos de prueba[^S2].

Imagina esta escena: tienes 6 casos, 2 aprueban antes del cambio, 5 aprueban después. ¿Necesitas un valor p? No. Lo que necesitas es fijar esta versión del prompt e ir a buscar la siguiente mejora de 30% a 80%.

La escala con la que ellos empezaron tampoco es misteriosa: un conjunto de unas 20 consultas que representaban patrones de uso reales[^S2]. Veinte no es un umbral mágico, es apenas una cantidad que puedes terminar en una tarde y empezar a usar ese mismo día.

Lo inverso también se sostiene: cuando tu agente ya está en 80% o más y los cambios que quedan mueven la aguja uno o dos puntos, unos pocos casos genuinamente no alcanzan para distinguirlos. En ese punto necesitas más casos — pero para entonces ya tienes un conjunto de evaluación en funcionamiento, y ampliarlo es muchísimo más fácil que construirlo de cero. **Consigue la regla primero y después hablamos de precisión; no esperes a que la regla sea precisa para empezar a medir.**

## Composición mínima de un caso de evaluación

Un conjunto de evaluación no es «una pila de prompts». Una pila de prompts solo te permite mirar salidas de reojo, lo cual se vuelve tedioso a la segunda lectura y autoengañoso a la tercera.

El artículo de ingeniería de herramientas es directo: cada prompt de evaluación debería estar emparejado con una respuesta o un resultado verificable; tu verificador puede ser tan simple como una comparación exacta de cadenas entre la verdad de referencia y las respuestas muestreadas, o tan avanzado como reclutar a Claude para juzgar la respuesta[^S3]. Esto se conecta directamente con los criterios de éxito de la Lección 2, los verificadores deterministas de la Lección 3 y los jueces LLM de la Lección 4 — esas lecciones te enseñaron cómo verificar, esta te enseña qué verificar.

Así que un caso utilizable necesita al menos tres componentes escritos con claridad:

```text
prompt   : Entrada al agente (escríbela como la diría un usuario)
expected : Un resultado verificable (estado final, cadena, cambio de estado o rúbrica)
verifier : Quién juzga — verificador determinista o juez LLM
```

Estructurado como datos, se ve así:

```json
{
  "id": "cs-003-address-change-after-ship",
  "prompt": "¿Puedo cambiar la dirección de mi pedido? Pedido SO-88213, me mudé.",
  "expected": {
    "mustCallTools": ["getOrder"],
    "mustContain": ["ya fue enviado"],
    "mustNotContain": ["te la cambié"]
  },
  "verifier": "deterministic"
}
```

El campo `expected` aquí describe estados finales y evidencia observable, no «la secuencia que el agente debería razonar». La conclusión de la Lección 2 sigue aplicando: para un mismo objetivo, el agente podría tomar varios caminos válidos, así que no fijes el camino en el código. El artículo de ingeniería de herramientas también te recuerda que opcionalmente puedes especificar las herramientas que esperas que un agente llame, para medir si los agentes captan el propósito de cada herramienta, pero que como podría haber varios caminos válidos, evites sobreespecificar o sobreajustar a estrategias[^S3].

El campo `mustCallTools` quizá te recuerde a `expectedTools` de la Lección 2. Vale la pena dejar clara la relación entre ambos. Las **afirmaciones negativas** (`mustNotContain`, `mustNotCallTools` — no digas «te la cambié», no adivines un número de pedido y lo consultes) son en esencia salvaguardas de estado final que describen «lo que no debía pasar no pasó», y se pueden imponer de forma estricta. Las **afirmaciones positivas sobre herramientas** (que haya llamado cierta herramienta) son las afirmaciones de trayectoria de la Lección 2, y esas tres disciplinas aplican sin cambios: afirma solo pertenencia al conjunto, lista solo la o las dos herramientas que de verdad te importan, y si la afirmación falla pero el estado final aprueba, registra una observación en vez de reprobar el caso de inmediato. Solo se endurece en un escenario: **cuando la información clave de la respuesta solo puede provenir del valor de retorno de esa herramienta**. El caso cs-003 es exactamente de ese tipo — el juicio «ya fue enviado» solo puede venir de `getOrder`, así que si la herramienta no se llamó, esa declaración es fabricada, y eso vuelve exigible esta afirmación positiva. Ante la duda, trátala como blanda.

Una nota más: este caso tiene `mustNotContain` con «te la cambié» — se cuida de que el agente acepte de palabra cambiar la dirección mientras en realidad no hace nada. Esa «finalización verbal» es justamente el tema de la Lección 1.

## Cinco reglas para diseñar conjuntos de evaluación

Las cinco reglas de abajo combinan los principios de diseño de la documentación «Test and Evaluate» de la plataforma de Claude y las prácticas del artículo de ingeniería de herramientas en una sola lista de verificación — las citas después de cada regla indican su fuente.

**Uno: anclar en el uso real.** Genera muchas tareas de evaluación, ancladas en usos del mundo real[^S3]; diseña evaluaciones que reflejen tu distribución real de tareas[^S5]. El criterio es directo: si este prompt no se copió de logs reales, ¿puedes señalarlo y decir «tres usuarios preguntaron exactamente esto la semana pasada»? Si no, probablemente sea algo que imaginaste sentado en tu escritorio.

**Dos: no te pierdas los casos límite.** La documentación oficial acompaña «refleja tu distribución real de tareas» inmediatamente con un recordatorio: no olvides tener en cuenta los casos límite[^S5]. La distribución real es el cuerpo, los casos límite son el seguro. Un conjunto de evaluación compuesto enteramente de casos límite te va a confundir — te vas a pasar un mes arreglando un problema que aparece dos veces al mes.

**Tres: automatiza la calificación cuando se pueda.** Estructura las preguntas para permitir calificación automatizada, por ejemplo opción múltiple, coincidencia de cadenas, calificación por código, calificación por LLM[^S5]. Esto determina si tu conjunto de evaluación se puede ejecutar repetidamente. Los casos que te exigen leer cinco minutos para juzgar aprobado/fallido — después de escribir diez de esos, nunca vas a querer ejecutarlos una segunda vez.

**Cuatro: prioriza cantidad sobre calidad.** La redacción oficial: más preguntas con calificación automatizada de señal levemente menor es mejor que menos preguntas con evaluaciones humanas de alta calidad calificadas a mano[^S5]. Esta es la más contraintuitiva y también la que más tiempo te ahorra — invierte tu tiempo en escribir diez casos más, no en pulir hasta la perfección los criterios de calificación de un caso.

**Cinco: recolecta casos ambiguos a propósito.** La documentación lista explícitamente un tipo de caso de prueba que vale la pena incluir: casos de prueba ambiguos en los que hasta a los humanos les costaría llegar a un consenso de valoración[^S5]. No son para subir las puntuaciones, son para sacar los desacuerdos a la superficie. Cuando tu agente titubea en estos casos, es señal de que las reglas mismas a nivel producto no están definidas, y eso lo tiene que resolver producto, no es algo que la ingeniería de prompts pueda arreglar.

Un punto más que no es un «principio de diseño» pero es igual de crítico: no hagas el entorno de evaluación demasiado simple. El artículo de ingeniería de herramientas recomienda evitar entornos «sandbox» demasiado simplistas o superficiales que no pongan tus herramientas bajo suficiente complejidad; las tareas de evaluación fuertes podrían requerir varias llamadas a herramientas, potencialmente decenas[^S3]. Una pregunta que se responde con una sola consulta a la base de datos no va a revelar si tu agente pierde el contexto para la séptima llamada a herramienta.

```agentmentor-check
{
  "id": "vq-zh-05-wait-for-hundreds",
  "label": "Tamaño mínimo para que valga la pena armar un conjunto de evaluación",
  "prompt": "El equipo discute si armar el conjunto de evaluación ahora. Alguien dice: «cualquier cosa por debajo de cien casos no tiene significancia estadística; las puntuaciones que sacaríamos serían puro ruido. Esperemos a que el producto se estabilice y hayamos juntado suficientes casos reales». Tú eres quien más sabe de verificación. ¿Cómo respondes?",
  "whyHere": "Este es el motivo más común y más creíble para demorar las evaluaciones. El postmortem oficial lo refuta específicamente, con un razonamiento atado directamente al concepto de tamaño del efecto — comprobarlo después de las reglas de diseño asegura que te lleves el criterio de decisión, no solo un eslogan.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Ármalo ahora, empezando con unas 20 tareas que representen el uso real. Los cambios de la etapa temprana tienen tamaños de efecto enormes — un solo retoque del prompt podría subir las tasas de éxito de 30% a 80% — y diferencias de esa magnitud se ven con apenas unos pocos casos, sin necesidad de esperar a cientos.",
      "correct": true,
      "feedback": "Correcto. El postmortem oficial señala directamente esta excusa de demora: los equipos suelen demorar la creación de evaluaciones porque creen que solo las evaluaciones grandes con cientos de casos sirven, cuando en realidad lo mejor es empezar de inmediato con pruebas a pequeña escala con unos pocos ejemplos; ellos mismos empezaron con un conjunto de unas 20 consultas que representaban el uso real. El razonamiento es el tamaño del efecto: los cambios tempranos podrían subir las tasas de éxito de 30% a 80%, y una brecha así de grande se distingue con apenas unos pocos casos."
    },
    {
      "id": "b",
      "text": "Tiene razón — esperar a que el producto se estabilice sí es más eficiente. Armar un conjunto de evaluación mientras el producto todavía cambia significa que los casos quedan obsoletos rápido; esperar a que las interfaces y los flujos estén cerrados hace más rentable armarlo todo de una vez.",
      "correct": false,
      "feedback": "Este razonamiento tiene la secuencia al revés. La fase en que el producto cambia es exactamente cuando cada cambio tiene el mayor tamaño de efecto y más vale la pena medirlo; esperar a que esté «estable» significa que ya hiciste decenas de revisiones sin ninguna regla, y no puedes decir cuál fue mejor. Que los casos queden obsoletos es real, pero el costo de reescribir unos pocos casos es muchísimo menor que el costo de seis meses sin medir."
    },
    {
      "id": "c",
      "text": "Punto medio: armemos 5 casos como gesto, los ponemos en el repo para mostrar que tenemos evaluaciones, pero no los ejecutamos de verdad ni tomamos decisiones con esas puntuaciones — dejemos la evaluación real para después.",
      "correct": false,
      "feedback": "Esto paga el costo de armar evaluaciones sin obtener ninguno de sus beneficios. El valor de un conjunto de evaluación viene de ejecutarlo de verdad después de cada cambio y de mirar de verdad las puntuaciones. Los casos que quedan sin usar no aportan ni siquiera un valor de recordatorio. O armas un lote que vas a ejecutar, juzgar y dejar influir de verdad en tus decisiones, o reconoces con honestidad que por ahora no lo estás haciendo — la peor opción es el estado intermedio."
    }
  ]
}
```

## Conjuntos reservados: no ajustes tu prompt hasta que solo sea bueno en estas preguntas

Supongamos que armaste juiciosamente 20 casos y empezaste a ajustar prompts. La primera versión aprueba 8 casos, una revisión aprueba 12, otra aprueba 16, otra aprueba 19. Excelente.

El problema: ¿cuánto de ese éxito de 19 casos viene de que el agente de verdad se volvió más fuerte, y cuánto de que fuiste incrustando calladamente las características de estas 20 preguntas dentro del prompt? Por ejemplo, notas que el caso 7 sigue fallando, así que le agregas una línea al prompt del sistema: «para temas de devolución prioriza citar la política de 7 días sin preguntas» — el caso 7 aprueba, pero lo que realmente hiciste fue escribir la respuesta de esa pregunta.

Este fenómeno se llama **sobreajuste**: el modelo (o, en este contexto, la configuración entera de prompt más herramientas) aprende las características del material de entrenamiento en vez de las regularidades de la tarea misma.

El remedio del artículo de ingeniería de herramientas es una sola oración, pero crítica: se apoyaron en conjuntos de prueba reservados para asegurarse de no sobreajustar a sus evaluaciones «de entrenamiento»[^S3].

Un **conjunto reservado** es un lote de casos apartados desde el principio, que no miras, no ejecutas y no tocas durante el ajuste del día a día. Todo su valor viene de «no estar contaminado». Algunas disciplinas que vale la pena codificar en los acuerdos del equipo:

- **Ejecútalo solo en hitos.** El ajuste diario de prompts ejecuta solo el conjunto de desarrollo (las evaluaciones «de entrenamiento» de la cita anterior — esta lección lo llama conjunto de desarrollo, registrado como `dev` en el campo JSON); ejecuta el conjunto reservado solo antes de una entrega o después de cambios estructurales (cambiar de modelo, reescribir descripciones de herramientas, modificar el bucle de arnés).
- **Mira solo los agregados.** Revisa la tasa de aprobación global y los IDs de los casos que fallaron, no abras la transcripción completa de cada caso reservado que falló para depurarlos uno por uno. En cuanto modificas un prompt para arreglar un caso reservado específico, ese caso ya pasó a ser parte del conjunto de desarrollo.
- **Retíralo si se contamina.** Si de verdad abriste unos cuantos casos reservados mientras depurabas un problema, fusiónalos al conjunto de desarrollo y repón un lote fresco de casos reservados. El conjunto reservado es consumible, no una reliquia familiar.
- **Documenta quién tiene acceso.** Los equipos pequeños suelen saltarse esto. Acordar que «las ejecuciones del conjunto reservado las hace una sola persona antes de las entregas, y los resultados se publican en el canal como una única línea con la puntuación» es muchísimo más efectivo que promesas verbales de «disciplina, muchachos».

Vale mencionar una práctica de ingeniería común: enganchar las evaluaciones a CI para que cada commit ejecute automáticamente el conjunto de desarrollo, compare las puntuaciones con la versión anterior y bloquee si la puntuación baja. Esto es práctica de ingeniería estándar, la orquestación depende de tu pipeline y este curso no la va a desarrollar — la Lección 6 va a construir «el circuito de evaluación que de verdad se ejecuta», y si lo conectas a CI es decisión tuya.

## Lo que las evaluaciones automatizadas se pierden, lo atrapan los humanos

Una vez que el conjunto de evaluación está armado, en marcha y puntuando bien, ¿puedes eliminar las pruebas humanas?

No. El postmortem oficial es explícito: incluso en un mundo de evaluaciones automatizadas, la prueba manual sigue siendo esencial[^S2]. La razón es que las personas que prueban agentes encuentran casos límite que las evaluaciones no ven — incluidas respuestas alucinadas ante consultas inusuales, fallos del sistema o sesgos sutiles de selección de fuentes[^S2].

La tercera categoría merece mención especial por lo típica que es. Sus evaluadores humanos notaron que los agentes iniciales elegían de manera consistente granjas de contenido optimizadas para SEO por encima de fuentes autorizadas pero peor rankeadas, como PDF académicos o blogs personales[^S2].

Detente un momento a considerar cómo se ve ese sesgo. Cada instancia individual parece estar bien — el agente da una respuesta citada, con fuentes, que suena plausible. La verificación de hechos aprueba, el formato de las citas aprueba, la completitud aprueba, y ninguna de tus dimensiones de puntuación detecta problema alguno (a menos que tu rúbrica incluya justo la dimensión «calidad de las fuentes» de la Lección 4 y sus criterios sean lo bastante afilados). Pero mirar cien salidas juntas revela el patrón: está eligiendo sistemáticamente el tipo de contenido más fácil de encontrar.

Tu conjunto de evaluación no puede ver esta clase de patrón por adelantado, porque el conjunto de evaluación se escribe con base en modos de fallo que **ya conoces** — los modos que no se te ocurrieron naturalmente no tienen casos que los cuiden. La prueba manual no reemplaza a las evaluaciones, les **suministra entradas nuevas**: cada vez que descubres un patrón así, codifícalo en un caso para que la próxima vez se revise automáticamente.

Otra clase pertenece naturalmente al conjunto de evaluación: **los comportamientos que la documentación dice explícitamente que «no están garantizados».** La documentación de uso de herramientas ofrece un buen ejemplo — si el prompt del usuario no incluye suficiente información para llenar todos los parámetros requeridos de una herramienta, Claude Opus tiene muchas más probabilidades de reconocer que falta un parámetro y pedirlo; pero la documentación aclara de inmediato que ese comportamiento no está garantizado, especialmente para prompts más ambiguos y para modelos menos capaces[^S6].

«Muchas más probabilidades» y «no está garantizado» son señales: si eso se sostiene en tu escenario, lo tienes que probar tú. Cualquier comportamiento del que dependa la lógica de tu producto pero que la documentación solo describa en términos probabilísticos vale la pena monitorearlo con unos pocos casos de forma continua.

## El conjunto de evaluación es una regla: primero consigue la regla, después los cambios importan

Retomemos esta lección en conjunto.

La secuencia del artículo de ingeniería de herramientas es: empieza levantando un prototipo rápido de tus herramientas y probándolas localmente, y después ejecuta una evaluación exhaustiva para medir los cambios posteriores[^S3]. Fíjate en «los cambios posteriores» — la evaluación no es para darle una puntuación al estado actual y darlo por terminado, su valor es **volver medibles todos los cambios que vienen después**. Con ella, «esta versión del prompt es mejor» pasa de ser una sensación a ser una conclusión.

El artículo sobre construcción de agentes va más lejos: como con cualquier funcionalidad basada en LLM, la clave del éxito es medir el desempeño e iterar sobre las implementaciones; y lo repiten — deberías considerar agregar complejidad solo cuando mejora demostrablemente los resultados[^S1].

Esta afirmación pesa cuando se lee en contexto. Las técnicas que aprendiste en los nueve cursos anteriores — división del trabajo multiagente, sistemas de memoria, compactación de contexto, recuperación desde puntos de control — todas y cada una agregan complejidad. Sin un conjunto de evaluación no puedes responder «¿agregar esto realmente mejoró las cosas?», así que solo puedes agregar por instinto, y agregar por instinto significa que sigues agregando. El conjunto de evaluación es la evidencia que te permite **quitar** un diseño vistoso.

## Cuán grande es suficientemente grande: no hay respuesta numérica

Para cerrar, una palabra sobre proporciones.

Busqué en cada fuente primaria que cita este curso, y ninguna da un umbral de «cuántos casos hacen suficiente un conjunto de evaluación». Lo que existe es una escala de arranque (unas 20 consultas reales) y una guía direccional (prioriza cantidad sobre calidad por caso). Así que no salgas a buscar ese número, y no le creas a nadie que cite a la ligera «al menos 50».

El criterio real es con lo que abrió esta lección: **dado el tamaño del efecto de tus cambios actuales, ¿tus casos existentes todavía pueden distinguirlos?**

- Cambias una versión, la cuenta de aprobados salta de 6 a 15 — suficiente, sigue adelante.
- Cambias una versión, la cuenta de aprobados oscila entre 17 y 18, y ejecutar dos veces da resultados distintos — insuficiente por ahora, momento de agregar casos o de reducir el ruido del método de calificación (repasa la consistencia del juez de la Lección 4).
- Los dos enfoques que quieres comparar difieren en un solo caso — esa no es una pregunta de «cuál es mejor», es una pregunta de «tu regla no resuelve esta diferencia».

La cantidad de casos sigue a la necesidad de resolución, no a algún número psicológico.

En cuanto a cómo ejecutar de verdad este lote de casos — un bucle por tarea, cómo estratificar la calificación, qué rastrear además de la tasa de aprobación — eso es la Lección 6. Lo que necesitas llevarte de esta lección es el lote de casos en sí.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Redactar 10 casos de evaluación para un asistente de tickets de soporte

Fija un agente concreto: **asistente de tickets de soporte al cliente**. Su flujo de trabajo es — leer el mensaje del usuario → llamar herramientas de consulta de pedidos (`getOrder` devuelve estado del pedido, número de rastreo y si ya fue enviado; `cancelOrder` cancela pedidos no enviados; `createEscalation` escala a un agente humano) → redactar una respuesta.

Tu tarea: redacta 10 casos de evaluación. No hace falta código, una tabla o una lista sirve. Requisitos de composición:

- Unos 7 casos que cubran la distribución real (el tipo de mensajes que soporte recibe realmente a diario)
- 2 casos límite
- 1 caso ambiguo «donde hasta los agentes humanos batallarían para llegar a un consenso»

Para cada uno, escribe con claridad tres componentes: resumen del prompt, resultado verificable, y qué tipo de verificador (determinista / juez / ambos).

<!-- hint -->
Pista 1: No pienses primero en los casos límite, llena primero los 7 de «distribución real». El método es preguntarte: si sacaras los tickets de soporte de un día, ¿cuáles son los siete tipos de pregunta más frecuentes? Rastrear un envío, política de devoluciones, cambiar dirección, cancelar pedido, pedir factura… de ese estilo. Cuando termines, vuelve y mira cuáles se pueden juzgar puramente con coincidencia de cadenas.

<!-- hint -->
Pista 2: Para decidir qué tipo de verificador necesita un caso, mira cómo se ve su resultado verificable. Si el resultado es «llamó cierta herramienta / la respuesta contiene o no contiene cierta cadena / el estado del pedido cambió a cancelado», usa un verificador determinista; si el resultado es «el tono es apropiado», «se atendieron las tres solicitudes», «no prometió descuentos inexistentes», necesitas un juez. Los dos no son mutuamente excluyentes — un mismo caso puede pasar una verificación dura determinista y después ir a un juez por una puntuación blanda.

<!-- rubric -->
Criterios de aprobación:

1. Exactamente 10 casos, la composición cumple los requisitos: unos 7 de distribución real, 2 límite, 1 ambiguo; cada caso está claramente etiquetado con la categoría a la que pertenece.
2. Cada caso tiene los tres componentes: resumen del prompt, resultado verificable, tipo de verificador — no puede faltar ninguno.
3. El «resultado verificable» declara un estado final o evidencia observable (llamadas a herramientas, presencia/ausencia de cadenas, cambio de estado del pedido, dimensiones de rúbrica), no una descripción de proceso tipo «el agente debería pensar antes de responder».
4. Al menos 5 casos se pueden juzgar con verificadores deterministas — demostrando «automatiza la calificación cuando se pueda».
5. Los 2 casos límite son situaciones genuinamente poco frecuentes pero que ocurren de verdad (como información faltante o varias solicitudes mezcladas), no trampas puramente inventadas.
6. El caso ambiguo explica «dónde está el punto de desacuerdo humano», no solo lo etiqueta como «esto es difícil».
7. Entre los 7 casos de distribución real, al menos uno requiere varias llamadas a herramientas, no solo una pregunta y una respuesta.

<!-- answer -->
Respuesta de referencia (10 ejemplos completos):

**Distribución real (7 casos)**

| # | Resumen del prompt | Resultado verificable | Verificador |
|---|---|---|---|
| 1 | «¿Dónde está el pedido SO-88101?» | Llamó `getOrder`; la respuesta contiene el número de rastreo de ese pedido y el texto de su estado actual | Determinista (afirmación de llamada a herramienta + contención de cadena) |
| 2 | «¿Cómo devuelvo algo?» (sin número de pedido) | La respuesta contiene los puntos clave de la política de devoluciones (plazo, empaque original, responsabilidad del flete); **no** llamó `getOrder` | Determinista (coincidencia de palabras clave + afirmar herramienta no llamada) |
| 3 | «Pedido SO-88213, me mudé, ¿puedo cambiar la dirección?» (pedido ya enviado) | Llamó `getOrder`; la respuesta declara el juicio «ya fue enviado» y ofrece alternativas (rechazar la entrega / contactar al transportista para redirigir); no debe contener «te la cambié» | Determinista (verificaciones duras) + Juez (adecuación del tono) |
| 4 | «Dice entregado pero no recibí nada» | Llamó `getOrder` para confirmar el registro de entrega; llamó `createEscalation` para escalar a un humano; la respuesta informa la escalación y un plazo aproximado | Determinista (dos llamadas a herramientas + cambio de estado) |
| 5 | «¿Dónde consigo una factura?» | La respuesta contiene con precisión la dirección del portal de facturación y los datos requeridos | Determinista (contención de cadena, la URL debe coincidir byte a byte) |
| 6 | «Quiero cancelar el SO-88190 que hice la semana pasada» (pedido aún no enviado) | Llamó `cancelOrder`; el estado final del pedido es cancelado; la respuesta confirma la cancelación y explica los tiempos del reembolso | Determinista (llamada a herramienta + afirmación de estado final) |
| 7 | «¿Me hacen descuento por llevar dos? ¿Tienen cupones?» | La respuesta no debe prometer ningún descuento ni cupón inexistente; debería guiar a la página de promociones vigentes | Juez (si fabrica ofertas, juicio binario) |

El caso 4 requiere al menos dos llamadas a herramientas, cumpliendo «no pruebes solo una pregunta y una respuesta».

**Casos límite (2 casos)**

| # | Resumen del prompt | Resultado verificable | Verificador |
|---|---|---|---|
| 8 | «¿Por qué mi pedido sigue sin moverse?» (el mensaje entero no tiene número de pedido, ni fecha, ni nombre de producto) | La respuesta contiene una oración interrogativa pidiendo el número de pedido; **no** llamó `getOrder` (no debe adivinar un número de pedido para consultarlo) | Determinista (afirmar herramienta no llamada + detección de interrogación) |
| 9 | Un mensaje empaqueta tres cosas: quiere devolver un artículo + cambiar la dirección de otro pedido + quejarse de la actitud del agente anterior | Las tres solicitudes se atienden, no se pierde ninguna; la devolución y el cambio de dirección llegan cada una a su rama de decisión correspondiente | Juez (rúbrica de completitud: 3 ítems puntuados cada uno) + Determinista (las llamadas a herramientas cubren ambos pedidos) |

El caso 8 corresponde a la declaración de la documentación oficial «el modelo va a pedir los parámetros faltantes, pero no está garantizado» — precisamente porque no está garantizado, amerita monitoreo continuo.

**Caso ambiguo (1 caso)**

| # | Resumen del prompt | Resultado verificable | Verificador |
|---|---|---|---|
| 10 | El usuario está exaltado, el producto tiene un defecto menor que no afecta el uso, la política no cubre compensación, el usuario es un cliente recurrente de alta frecuencia y exige «compensación inmediata» | Se impone una sola regla dura: **no** debe prometer unilateralmente un monto específico de compensación ni ninguna compensación que exceda su autorización; todo lo demás (si emite un cupón pequeño de buena voluntad, si escala directo a un humano, tono suave o firme) va al juez para puntuación por rúbrica, y se acepta la volatilidad de la puntuación | Juez principalmente + una línea roja determinista |

Punto de desacuerdo humano: algunos agentes emitirían de inmediato un cupón pequeño de buena voluntad para bajar la tensión, otros seguirían la política estrictamente para negarse y escalar a un supervisor. Los dos enfoques tienen practicantes y detractores en equipos reales. El valor de este caso no es mejorar la puntuación global, es recordarte que la regla de producto sobre la «frontera de autorización para compensar» todavía no está definida — que las puntuaciones oscilen en este caso significa que deberías ir a pedirle a producto que fije la regla, no seguir ajustando el prompt.

### Nivel 2: Diseñar el formato de almacenamiento y el esquema de división

Convierte los 10 casos del Nivel 1 en una forma que un programa pueda leer, y planifica cómo dividirlos por propósito. No hace falta ejecutarlos de verdad (eso es la Lección 6).

Entrega tres cosas:

1. **Estructura JSON**: define los campos de cada caso — `id`, `prompt`, `expected` (o una referencia a una rúbrica), tipo de verificador, `tags`. Provee al menos 3 instancias completamente llenadas.
2. **Esquema de división**: divide los 10 casos entre uso de ajuste diario y conjunto reservado, y escribe las disciplinas de uso del conjunto reservado (cada cuánto ejecutarlo, qué mirar, quién lo ejecuta, bajo qué condiciones retirarlo).
3. **Dos señales de sobreajuste**: enumera dos señales específicas y observables que indiquen «ya sobreajustamos».

<!-- hint -->
Pista 1: El campo `expected` se topa con un problema estructural — los casos deterministas esperan «un conjunto de afirmaciones verificables», los casos de juez esperan «una rúbrica», y las dos cosas tienen formas distintas. No las fuerces dentro de un mismo campo. Un enfoque viable es dejar que `expected` guarde solo afirmaciones deterministas y abrir otro campo `rubricRef` que apunte a un archivo de rúbrica; el campo `verifier` admite entonces `both`, que significa que ambas compuertas deben aprobar.

<!-- hint -->
Pista 2: Al pensar en señales de sobreajuste, no te quedes en descripciones tipo «las puntuaciones no son reales», pregunta «¿qué vería específicamente en un tablero de monitoreo?». Dos direcciones para escarbar: una es que las trayectorias de puntuación de los dos conjuntos diverjan; la otra es que el prompt mismo empiece a contener contenido que solo tiene sentido para ciertos casos específicos (palabras clave fijas, números de pedido fijos, redacciones fijas).

<!-- rubric -->
Criterios de aprobación:

1. La estructura JSON incluye todos los campos requeridos: `id`, `prompt`, `expected` o referencia a rúbrica, tipo de verificador, `tags`; provee al menos 3 instancias completamente llenadas, y las instancias corresponden a los casos del Nivel 1.
2. Maneja correctamente el problema de que «expectativas deterministas» y «expectativas de rúbrica» tienen formas distintas (campos separados, o una estructura de unión con `type`), y no forzó las rúbricas dentro de `expected`.
3. Los `tags` tienen uso práctico, pueden sostener al menos un tipo de vista segmentada (como ver tasas de aprobación por categoría `distribution` / `edge` / `ambiguous`, o por herramientas involucradas).
4. El esquema de división especifica qué casos van al conjunto reservado y da la justificación de la selección; el conjunto reservado cubre casos de distribución real, no está compuesto solo de casos límite/ambiguos (los casos ambiguos ya aceptan volatilidad de puntuación, no deberían ocupar la señal de compuerta).
5. Las disciplinas del conjunto reservado cubren al menos cuatro puntos: momento de las ejecuciones, con qué granularidad ver los resultados, quién lo ejecuta, cómo manejar la contaminación posterior.
6. Las dos señales de sobreajuste son **observables**, declaran «qué número mirar / qué texto leer», no descripciones abstractas.
7. Señala explícitamente que tus números de división son solo el arreglo de este ejemplo, no un umbral universal.

<!-- answer -->
Respuesta de referencia:

**1. Estructura JSON**

```json
{
  "version": 1,
  "agent": "cs-ticket-assistant",
  "cases": [
    {
      "id": "cs-001-track-order",
      "prompt": "¿Dónde está el pedido SO-88101? Ayúdame a revisarlo por favor.",
      "verifier": "deterministic",
      "expected": {
        "mustCallTools": ["getOrder"],
        "mustContain": ["SO-88101", "número de rastreo"],
        "mustNotContain": ["no se pudo consultar"]
      },
      "rubricRef": null,
      "tags": ["distribution", "logistics", "tool:getOrder", "single-turn"],
      "split": "dev"
    },
    {
      "id": "cs-008-missing-order-id",
      "prompt": "¿Por qué mi pedido sigue sin moverse? Llevo varios días esperando.",
      "verifier": "deterministic",
      "expected": {
        "mustNotCallTools": ["getOrder"],
        "mustMatch": ["(número de pedido|ID de pedido)", "[?¿]"],
        "mustNotContain": ["ya te lo consulté"]
      },
      "rubricRef": null,
      "tags": ["edge", "missing-parameter", "not-guaranteed-behavior"],
      "split": "holdout"
    },
    {
      "id": "cs-010-goodwill-compensation",
      "prompt": "El artículo viene con la esquina dañada, llevo tres años comprándoles, esto exige una explicación, ¡compénsenme de inmediato!",
      "verifier": "both",
      "expected": {
        "mustNotMatch": ["(compensar|compensación|reembolso|reembolsar|indemniz\\w*)\\s*(te|le)?\\s*\\d+(\\.\\d+)?\\s*(pesos|dólares)"]
      },
      "rubricRef": "rubrics/cs-tone-and-authority.md",
      "tags": ["ambiguous", "policy-boundary", "human-disagreement"],
      "split": "monitor"
    }
  ]
}
```

Explicación de los campos:

- `verifier` toma `deterministic` / `judge` / `both`. Cuando es `both`, se ejecutan primero las afirmaciones deterministas; si alguna falla, falla de inmediato sin desperdiciar una llamada al juez (cómo escribir esta orquestación en código, ver el circuito de la Lección 6).
- `expected` solo carga afirmaciones deterministas; las rúbricas van en archivos aparte, apuntadas por `rubricRef`. Así las rúbricas pueden reutilizarse en varios casos, y cambiar una rúbrica no obliga a cambiar los casos.
- `mustMatch` con varios patrones de expresión regular significa «todos deben acertar, pero el orden entre ellos no está fijado» — los dos patrones de cs-008 solo exigen que la respuesta contenga «número de pedido/ID de pedido» y una oración interrogativa, sin importar qué palabra viene primero. Fijar el orden de las palabras (como exigir que «número de pedido» aparezca antes de «por favor proporciona») haría fallar la respuesta correcta más natural, «¿Me podrías dar tu número de pedido?», que es exactamente la trampa del «verificador demasiado estricto» de la Lección 3.
- La expresión regular de línea roja `mustNotMatch` se escribe según el **costo de dejar pasar una violación**: prefiere escribir la clase de caracteres ancha (compensar/compensación/reembolso/reembolsar/indemnizar, todo cuenta), sobrerreportando de vez en cuando para revisión humana, antes que escribirla angosta y dejar pasar un «te compenso con 200 pesos» real. La dirección de fallo de una línea roja es opuesta a la de las afirmaciones normales — prefiere el falso positivo antes que dejar colar violaciones.
- `rubricRef` escribe explícitamente `null` para los casos puramente deterministas, distinguiendo la ausencia de «no necesita una».
- `split` toma `dev` / `holdout` / `monitor`: `monitor` es para los casos ambiguos — no cuenta para ninguna tasa de aprobación, solo se usa para vigilar la divergencia (detallado abajo en «Esquema de división»).
- `tags` cargan al menos una etiqueta de composición (`distribution` / `edge` / `ambiguous`) para ver las tasas de aprobación por categoría; también cargan etiquetas de negocio y etiquetas con prefijo `tool:` para localizar «si todos los casos que involucran getOrder fallaron juntos».

**2. Esquema de división**

Este ejemplo divide 10 casos en tres porciones: 6 para ajuste, 3 reservados, 1 de monitoreo de divergencia. **Esta división es el arreglo de este ejemplo, no un umbral universal**; el material público no da respuesta estándar para el tamaño de un conjunto de evaluación ni para las proporciones de división.

- **Conjunto de desarrollo (dev, 6 casos)**: #1, #2, #3, #5, #7, #9. El ajuste diario de prompts ejecuta solo este lote, cuanto más seguido mejor.
- **Conjunto reservado (holdout, 3 casos)**: #4, #6, #8 — dos casos de distribución real (incluido el único caso con varias llamadas a herramientas, el #4) más un caso límite.
- **Monitoreo de divergencia (monitor, 1 caso)**: #10. Este es el caso ambiguo donde «hasta los humanos batallan para llegar a un consenso», que ya acepta volatilidad de puntuación y no cuenta para ninguna tasa de aprobación; vigila de forma independiente cómo oscila su juicio entre versiones, y si oscila mucho, ve a pedirle a producto que fije la regla.

Por qué el conjunto reservado debe abarcar la composición y debe tener casos de distribución real: el objetivo principal del conjunto reservado es atrapar el «sobreajuste a la distribución real» — como escribir en el prompt del sistema «prioriza citar la política de 7 días sin preguntas» para hacer aprobar cierto caso de devolución. Un conjunto reservado compuesto enteramente de casos límite y ambiguos no puede atrapar esto, porque contiene cero casos de distribución real del tipo devolución/logística; y los casos ambiguos no convergen por sí mismos, así que ocupar un tercio de la señal de compuerta solo distorsiona la lectura. A la inversa, poner el #4, un caso pesado de varias llamadas a herramientas, dentro del conjunto reservado también cuida de los retrocesos del tipo «las tareas complejas se resuelven de forma simplista».

Disciplinas de uso:

- **Cuándo ejecutarlo**: solo en tres situaciones — antes de una entrega, después de cambiar de modelo o de versión de modelo, y después de cambios estructurales al bucle de arnés o a las descripciones de herramientas. El ajuste diario de prompts nunca lo ejecuta.
- **Qué mirar**: solo la tasa de aprobación y los IDs de los casos que fallaron. No abras la transcripción completa de los casos fallidos, no analices las causas de fallo caso por caso.
- **Quién lo ejecuta**: lo ejecuta quien lidera la entrega, y el resultado se publica en el canal del equipo, publicando solo una línea del tipo «3 casos, 2 aprobados, falló cs-008».
- **Manejo tras contaminación**: si depurar un problema de producción genuinamente requirió abrir la transcripción de un caso reservado y modificar el prompt con base en ella, mueve ese caso permanentemente al conjunto de desarrollo (cambia el campo `split`), y al mismo tiempo repón el conjunto reservado con un caso nuevo del mismo tipo tomado de tickets reales recientes. El conjunto reservado es consumible.

**3. Dos señales de sobreajuste**

**Señal uno: las trayectorias de puntuación de los dos conjuntos divergen.** Cada vez que ejecutes el conjunto reservado, registra también la puntuación del conjunto de desarrollo de ese día. El estado sano es que ambos mejoren juntos; ver «el conjunto de desarrollo subió de 4/6 a 6/6, el reservado bajó de 2/3 a 1/3 (o se quedó plano)» indica que las versiones recientes del prompt aprendieron las características de esas 6 preguntas, no la tarea misma. Qué mirar: las cuentas de aprobados de ambos lados, registradas por entrega; que la dirección diverja de forma continua es la alarma. Un punto a aclarar: un conjunto reservado de 3 casos solo tiene cuatro lecturas posibles (0/1/2/3), no puede mostrar tendencias finas del tipo «bajó unos puntos porcentuales», solo alcanza para responder «¿las últimas entregas vienen retrocediendo de forma sostenida?» — para graficar una curva de porcentaje, primero amplía el conjunto reservado a algunas decenas de casos, y cuánto ampliarlo sigue igualmente la necesidad de resolución, no algún umbral numérico.

**Señal dos: el prompt acumula contenido que solo tiene sentido para casos específicos.** La manifestación concreta es que el prompt del sistema o las descripciones de herramientas empiezan a contener cosas fijas — un número de pedido específico, la redacción exacta del usuario en un caso, una rama a medida del tipo «cuando te encuentres con X responde Y». Método de inspección: lee el prompt del sistema completo y pregunta línea por línea «si quitara esta línea, ¿fallaría un solo caso de evaluación mientras los usuarios reales no notan absolutamente nada?». Cualquier línea cuya respuesta sea «sí» creció por sobreajuste. Complétalo con una versión cuantificable: toma un ticket real completamente nuevo, que nunca haya estado en ningún conjunto, y ejecútalo; si rinde significativamente por debajo del promedio del conjunto de desarrollo, la puntuación del conjunto de desarrollo ya no representa la capacidad real.

<!-- /exercises -->

## Resumen

- «Esperemos a tener cientos de casos antes de armar un conjunto de evaluación» es la excusa de demora más común, y el postmortem oficial la refuta directamente: los equipos suelen demorar la creación de evaluaciones porque creen que solo las evaluaciones grandes con cientos de casos sirven, cuando el enfoque correcto es empezar de inmediato con pruebas a pequeña escala con unos pocos ejemplos[^S2].
- Los conjuntos pequeños sí funcionan al principio, y la base es el tamaño del efecto — un solo retoque del prompt podría subir las tasas de éxito de 30% a 80%, y una brecha así de grande se distingue con apenas unos pocos casos; ellos mismos empezaron con un conjunto de unas 20 consultas que representaban patrones de uso reales[^S2].
- Las tareas de evaluación deberían estar ancladas en usos del mundo real[^S3], reflejar tu distribución real de tareas y tener en cuenta los casos límite[^S5]; al mismo tiempo evita los entornos sandbox demasiado simplistas, ya que las tareas de evaluación fuertes podrían requerir varias llamadas a herramientas, potencialmente decenas[^S3].
- Estructura las preguntas para permitir calificación automatizada (opción múltiple, coincidencia de cadenas, calificación por código, calificación por LLM)[^S5], y prioriza cantidad sobre calidad — más preguntas con calificación automatizada de señal levemente menor es mejor que menos preguntas con evaluaciones humanas de alta calidad calificadas a mano[^S5].
- Recolecta a propósito una categoría de casos de prueba ambiguos en los que hasta a los humanos les costaría llegar a un consenso de valoración[^S5]: no son para subir las puntuaciones, son para sacar a la superficie los desacuerdos en las reglas mismas del producto.
- Cada prompt de evaluación debería estar emparejado con un resultado verificable, con verificadores que van desde la comparación exacta de cadenas hasta reclutar a Claude como juez[^S3] — esto se conecta directamente con las Lecciones 2, 3 y 4.
- Los conjuntos de prueba reservados previenen el sobreajuste, y apoyarse en ellos asegura no sobreajustar a las evaluaciones «de entrenamiento»[^S3]; las disciplinas centrales son no mirarlos a diario, mirar solo los agregados y retirarlos si se contaminan.
- Las evaluaciones automatizadas tienen puntos ciegos inherentes: las personas que prueban agentes encuentran casos límite que las evaluaciones no ven, incluidas respuestas alucinadas ante consultas inusuales, fallos del sistema y sesgos sutiles de selección de fuentes[^S2]; el ejemplo real es que los agentes iniciales elegían de manera consistente granjas de contenido optimizadas para SEO por encima de fuentes autorizadas pero peor rankeadas, como PDF académicos o blogs personales[^S2]. Incluso con evaluaciones automatizadas, la prueba manual sigue siendo esencial[^S2].
- Los comportamientos que la documentación dice explícitamente que «no están garantizados» pertenecen naturalmente al conjunto de evaluación, como si el modelo va a pedir por su cuenta los parámetros requeridos que faltan — la documentación declara que ese comportamiento no está garantizado, especialmente para prompts más ambiguos y para modelos menos capaces[^S6].
- El valor del conjunto de evaluación es volver medibles todos los cambios posteriores: ejecuta una evaluación exhaustiva para medir los cambios posteriores[^S3]; el éxito depende de medir el desempeño e iterar, y la complejidad solo vale la pena agregarla cuando mejora demostrablemente los resultados[^S1].
- Ninguna fuente primaria da un umbral numérico de «cuán grande es suficientemente grande». El criterio es: dado el tamaño del efecto de tus cambios actuales, ¿tus casos existentes todavía pueden distinguirlos? Cuando ya no puedas distinguirlos, ese es el momento de ampliar.

[>> Lección 6: Práctica: construye un circuito de evaluación para tu agente](./06-build-eval-harness.md)
