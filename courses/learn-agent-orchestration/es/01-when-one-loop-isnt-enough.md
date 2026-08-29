# Lección 1: Cuando un solo bucle no basta

> Objetivos de aprendizaje:
> - Usar una tarea real que rompe a los agentes de un solo bucle para mostrar por qué «conseguir una ventana más grande» no resuelve el problema de forma
> - Enunciar la distinción arquitectónica entre flujos de trabajo y agentes, y usar «quién tiene el plan» para ubicar cualquier sistema sobre ese eje
> - Enumerar los disparadores para subir de nivel y las condiciones para quedarse donde estás, con la latencia y los costos en tokens sobre la mesa desde el principio
>
> Requisitos: Terminaste los primeros 11 cursos de esta serie y puedes escribir a mano un bucle de arnés impulsado por `stop_reason` (curso 7, «Fundamentos del arnés de agente: bucles y control») | Siguiente: [Lección 2 >>](./02-chaining-and-routing.md)

## Para el módulo 30, algo va mal

Necesitas migrar un repositorio de backend del framework interno de RPC v1 al v2. Antes de empezar necesitas un inventario: el repositorio tiene 40 módulos, y cada módulo necesita una evaluación de migración —enumerar los puntos de riesgo, estimar el alcance de los cambios, adjuntar un manifiesto de dependencias—. El trabajo no es difícil, solo es numeroso. Tienes aquel arnés del curso 7 de esta serie:

```javascript
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ model, max_tokens, tools, messages });
}
```

(Un arnés es el código anfitrión que envuelve las llamadas al modelo: enviar la solicitud, ejecutar las herramientas que el modelo quiere usar, devolver los resultados, decidir si conviene continuar.)

Le entregas la lista de 40 módulos de una sola vez, escribes «evalúa cada uno, un informe por módulo» y te vas a preparar un café.

Los primeros 5 módulos se ven estupendos: hace grep de los sitios de llamada, lee la configuración, revisa los archivos de prueba, y los informes salen más detallados de lo que esperabas.

En el módulo 15 vuelves y revisas los registros. El arreglo `messages` ya resulta impresionante: la salida de grep de los primeros 14 módulos, trozos enteros de archivos de configuración leídos, acuses de escritura de archivos, rastros de caminos tomados y luego abandonados, todo eso sigue ahí sobre esa misma línea de tiempo. Nada de este contenido era erróneo: cada pieza fue necesaria en su momento. Pero su función actual quedó reducida a una sola cosa: ocupar espacio.

Para el módulo 30, la calidad se desploma. Copia la conclusión del módulo 27 sobre el módulo 30 porque los nombres se parecen; se salta calladamente el paso de «revisar si hay interceptores personalizados» que había hecho siempre antes; para el módulo 34, hasta el formato de salida empieza a derivar.

Tu primera reacción probablemente sea: cambiar a un modelo con una ventana de contexto más grande.

Esa reacción solo te lleva a mitad de camino. Duplica la ventana y el punto de colapso probablemente se mueva del módulo 30 al 55. Tu siguiente repositorio tiene 120 módulos. No resolviste el problema, compraste una prórroga.

Lo que de verdad se agotó no es la ventana, es **la forma de «un solo bucle»**: 40 elementos independientes forzados a compartir una línea de tiempo, un presupuesto de atención. La calidad de la evaluación del módulo 30 depende de cuánto residuo dejaron atrás los primeros 29 módulos, y esas dos cosas no tienen nada que ver entre sí.

Lo que hace este curso es cambiar esa forma.

## Primero, ordenar el vocabulario oficial

**Los agentes pueden encargarse de tareas sofisticadas, pero su implementación suele ser sencilla. Son típicamente solo LLM que usan herramientas basándose en la retroalimentación del entorno, dentro de un bucle**[^S1]. Aquel `while` que escribiste en el curso 7 de esta serie es exactamente eso, ni una línea de diferencia. Así que ubícate: ya construiste un agente, este curso no arranca desde cero.

Una capa más arriba. Anthropic clasifica todas estas variaciones como **sistemas agénticos** (dicho en llano: sistemas armados con modelos, herramientas y alguna forma de flujo de control, capaces de recorrer varios pasos por su cuenta), pero dentro de esta categoría amplia traza una distinción arquitectónica importante[^S1]:

- **Los flujos de trabajo son sistemas donde los LLM y las herramientas se orquestan a través de caminos de código predefinidos**[^S1]. «Caminos de código predefinidos» es la frase clave: lo que pasa a continuación está escrito en el código.
- **Los agentes, en cambio, son sistemas donde los LLM dirigen dinámicamente sus propios procesos y su uso de herramientas, y mantienen el control sobre cómo cumplen las tareas**[^S1]. Lo que pasa a continuación lo decide el modelo en el momento.

Un término fundamental más, que usarás una y otra vez en las próximas lecciones. **En computación, los sistemas deterministas producen la misma salida cada vez ante entradas idénticas, mientras que los sistemas no deterministas —como los agentes— pueden generar respuestas variadas incluso con las mismas condiciones iniciales**[^S3].

Aplica esa definición a tu `while` y verás que son dos cosas cosidas entre sí: cómo enviar la solicitud, cómo ejecutar las llamadas a herramientas, cuándo parar —eso es determinista, lo escribiste tú en código—; mientras que «qué hay que buscar con grep a continuación, si este informe ya está terminado» —eso es no determinista, lo decide el modelo en el momento—. La cirugía que estás a punto de practicar consiste en mover el poder de decisión entre estas dos mitades.

## El eje de «quién tiene el plan»

La documentación de Claude Code lo plantea de forma más directa: **los subagentes, las Skills, los equipos de agentes y los flujos de trabajo pueden ejecutar todos una tarea de varios pasos. La diferencia está en quién tiene el plan**[^S5].

(«Subagente» = un asistente que trabaja de forma independiente en su propia ventana de contexto y devuelve solo un resumen; «fan-out» = despachar varios subagentes para que trabajen a la vez. El curso 6 de esta serie cubrió ambos términos.)

Esa oración atraviesa un montón de enfoques que se parecen entre sí. Toma «ejecutar evaluaciones para 40 módulos»:

- Dejas que el modelo recorra los 40 en una sola conversación: el plan está en manos del modelo, y es implícito, escondido en el historial de la conversación. Tendrías que escarbar en los registros para adivinar el camino que pretendía seguir.
- Conviertes al modelo en orquestador, y decide en cada turno qué subagente despachar para qué módulo: el plan sigue en manos del modelo, solo que un poco más explícito.
- Escribes un script, y el script recorre esos 40 módulos con un `for`: el plan está en el código. Puedes abrir el archivo y leerlo entero, y ejecutarlo mañana otra vez sin cambios.

El tercer enfoque tiene una descripción precisa: **un flujo de trabajo mueve el plan al código. El script del flujo de trabajo retiene él mismo el bucle, las bifurcaciones y los resultados intermedios, de modo que el contexto de Claude retiene solo la respuesta final**[^S5]. Y **los resultados intermedios se quedan en variables del script en lugar de aterrizar en el contexto de Claude**[^S5]. La salida de grep del módulo 27 se queda en un arreglo de JavaScript, así que la evaluación del módulo 30 naturalmente no puede verla: no porque el modelo haya aprendido a ignorarla, sino porque nunca tuvo la oportunidad de verla.

Para los dos extremos de este eje, la guía oficial le dedica a cada uno una oración sobre su encaje: **cuando se justifica más complejidad, los flujos de trabajo ofrecen previsibilidad y consistencia para tareas bien definidas, mientras que los agentes son la mejor opción cuando hacen falta flexibilidad y toma de decisiones dirigida por el modelo a escala**[^S1].

**Una aclaración**: este curso llama a este eje el «espectro de determinismo» y llama a los patrones de composición de la lección 5 «grafos», «nodos» y «aristas». Esas etiquetas son **metáforas de ingeniería propias de este curso y nunca aparecen en las fuentes primarias**: los materiales primarios solo aportan las definiciones de los dos extremos (caminos de código predefinidos frente a decisiones dirigidas por el modelo)[^S1] y el planteamiento de «quién tiene el plan»[^S5]. Tomamos prestadas las metáforas del espectro y del grafo porque resultan cómodas para ordenar patrones que sí existen de verdad; no vas a leer estos términos en ninguna documentación oficial, así que no los presentes como conceptos oficiales.

## Cuándo subir de nivel

«Un solo bucle no basta» suena a intuición, pero hay disparadores que sí se pueden enunciar.

**Disparador uno: la tarea necesita más agentes de los que una sola conversación puede coordinar, o quieres la orquestación codificada como un script que puedas leer y volver a ejecutar**[^S5]. La primera mitad es un asunto de capacidad, la segunda es un asunto de ingeniería: aunque una sola conversación apenas logre coordinarlo, «¿podemos ejecutar esto exactamente igual mañana?» califica como razón por sí sola.

**Disparador dos: cuando la tarea es más grande de lo que un solo agente puede retener en contexto, o cuando el mismo paso necesita ejecutarse a lo largo de muchos elementos**[^S5]. Estas dos oraciones juntas describen exactamente el escenario de los 40 módulos del principio. Fíjate en la segunda: la cantidad de elementos es una razón por sí misma, sin importar si cada elemento es difícil.

**Disparador tres: cuando una tarea lateral inundaría tu conversación principal**. La descripción del escenario en la documentación de subagentes: cuando una tarea lateral inundaría tu conversación principal con resultados de búsqueda, registros o contenidos de archivos que no volverás a consultar, despacha un subagente, que hace ese trabajo en su propio contexto y devuelve solo el resumen[^S4], **preservando el contexto al mantener la exploración y la implementación fuera de tu conversación principal**[^S4]. Nota que este disparador receta «despachar un subagente»: el plan sigue quedándose en manos del modelo; eso y «mover el plan al código» son dos cosas distintas. Las columnas B y C del ejercicio de Nivel 2 desglosarán esta distinción.

Mira este código para hacerte una idea de qué forma queda después del cambio:

```javascript
// Ilustración propia de este curso, únicamente para comparar formas; los materiales
// primarios no contienen ejemplos de código de scripts de orquestación.
const findings = [];
for (const mod of modules) {
  // Cada módulo recibe un bucle de arnés fresco: messages limpio, con el trabajo de este módulo y nada más
  const messages = [{ role: "user", content: assessPrompt(mod) }];
  findings.push(await runHarnessLoop(messages)); // Los resultados intermedios aterrizan en este arreglo
}
const report = await summarize(findings);        // Solo el paso de resumen vuelve al modelo
```

El bucle sigue siendo aquel bucle: dentro de `runHarnessLoop` está el `while` que escribiste en el curso 7 de esta serie. Solo cambió una cosa: **quién cuenta hasta 40**. Antes contaba el modelo. Ahora cuenta el `for`.

```agentmentor-check
{
  "id": "orc-zh-01-bigger-window",
  "label": "Ventana insuficiente, o forma equivocada",
  "prompt": "Tu evaluación de migración de 40 módulos se vino abajo: después del módulo 30 empieza a contaminar unas conclusiones con otras y a saltarse elementos de la revisión. Un colega le echa un vistazo y dice: 'Nada más cambia a un modelo con más contexto. No hace falta cambiar la arquitectura.' ¿Cuál de estos juicios se sostiene mejor?",
  "whyHere": "Acabas de leer los disparadores para subir de nivel. El error de juicio más común no es ignorar que la orquestación existe, sino tratar un problema de forma como un problema de capacidad; esta pregunta separa los dos.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "El colega tiene razón: la causa inmediata del colapso es que el contexto se llena. Duplica la ventana y este repositorio llega al final. No hace falta tocar la arquitectura.",
      "correct": false,
      "feedback": "Una ventana más grande sí empuja el punto de colapso hacia atrás, y este repositorio quizá llegue de verdad al final; pero cuánto es suficiente depende de la cantidad de elementos, y esa cantidad la da la tarea, no tu elección. Cada residuo de lectura y escritura que dejaron los primeros 29 módulos era legítimo en su momento, pero aun así consume el presupuesto de atención de los módulos posteriores (el curso 8 de esta serie cubrió cómo ocurre ese consumo). Cuando el siguiente repositorio tenga 120 módulos, estarás recalculando esta misma cuenta."
    },
    {
      "id": "b",
      "text": "Cambiar de ventana solo pospone el punto de colapso: la raíz es el mismo paso ejecutándose a lo largo de muchos elementos, con el residuo previo consumiendo la atención posterior. Habría que mover el plan al código.",
      "correct": true,
      "feedback": "Correcto. Esta tarea activa dos disparadores a la vez: «más grande de lo que un solo agente puede retener en contexto» y «el mismo paso necesita ejecutarse a lo largo de muchos elementos»; ambas son señales del nivel de la forma. Después de mover el plan al código, cada uno de los 40 módulos ejecuta un bucle de arnés limpio, la calidad de la evaluación del módulo 30 ya no queda determinada por el residuo de los primeros 29, y los resultados intermedios se quedan en variables del script."
    },
    {
      "id": "c",
      "text": "Demuestra que el enfoque de un solo bucle quedó obsoleto: de ahora en adelante cualquier tarea debería empezar con orquestación. Los días de arrancar desde un bucle único habría que darlos por terminados.",
      "correct": false,
      "feedback": "Te pasaste de largo. La línea oficial es encontrar primero la solución más simple y añadir complejidad solo cuando haga falta, lo que podría significar no construir sistemas agénticos en absoluto. Para muchas aplicaciones, optimizar llamadas individuales al LLM con recuperación y ejemplos en contexto suele bastar. Y los problemas abiertos, con una cantidad de pasos impredecible que no se puede fijar en duro en un camino fijo, habría que dejarlos en bucles autónomos."
    }
  ]
}
```

## Cuándo quedarse donde estás

Detrás de las señales de disparo hay una lista de comprobación igual de larga en sentido contrario, y esta es más fácil de saltarse.

**Encuentra la solución más simple posible, y aumenta la complejidad solo cuando haga falta. Esto podría significar no construir sistemas agénticos en absoluto**[^S1]. **Para muchas aplicaciones, sin embargo, optimizar llamadas individuales al LLM con recuperación y ejemplos en contexto suele bastar**[^S1]. Ese trabajo de renombrar una función en 12 lugares no necesita un arnés, no necesita orquestación: una llamada más un `grep` y está listo.

**Algunos dominios hoy no encajan bien con los sistemas multiagente**: los que requieren que todos los agentes compartan el mismo contexto, o donde hay muchas dependencias entre agentes. El texto nombra un ejemplo: **la mayoría de las tareas de programación implican menos tareas verdaderamente paralelizables que la investigación, y los agentes LLM todavía no son muy buenos coordinándose con otros agentes y delegándoles en tiempo real**[^S2]. Estás refactorizando un módulo de pedidos fuertemente acoplado, y los cambios se propagan por una cadena de llamadores; repartir esto en abanico a cinco subagentes solo lo hace más lento y más enredado, porque todos necesitan mirar lo mismo, y quien se mueva primero invalida la información de todos los demás.

A la inversa, las condiciones de encaje positivo están enunciadas con la misma llaneza: encontraron que los sistemas multiagente destacan en tareas que **implican mucha paralelización, información que excede una sola ventana de contexto, e interactuar con numerosas herramientas complejas**[^S2], y **tareas donde el valor de la tarea es lo bastante alto como para pagar por el rendimiento añadido**[^S2]. Cuantas más de estas tres condiciones cumplas, más vale la pena subir de nivel.

Hay además una categoría de tareas que **habría que dejar en bucles autónomos**, sin forzarlas hacia la orquestación: **problemas abiertos donde es difícil o imposible predecir la cantidad de pasos necesaria, y donde no puedes fijar en duro un camino fijo**; estos se les pueden dar a los agentes, que potencialmente operarán durante muchos turnos, y tienes que tener cierto nivel de confianza en su toma de decisiones[^S1]. El propio sistema de investigación de Anthropic es de este tipo: **el trabajo de investigación implica problemas abiertos donde es muy difícil predecir de antemano los pasos necesarios. No puedes fijar en duro un camino fijo para explorar temas complejos, porque el proceso es inherentemente dinámico y dependiente del camino**[^S2].

Así que «¿debería pasarme a la orquestación?» no es una barra de progreso de un solo sentido. La evaluación de los 40 módulos debería moverse hacia la orquestación porque los pasos son fijos, solo que numerosos; «¿deberíamos cambiar la cola de mensajes de A a B?» no debería moverse hacia la orquestación porque ni siquiera sabes cuántos artículos vas a necesitar leer.

## Poner los costos sobre la mesa primero

Antes de empezar a aprender los cinco patrones, abre el libro de cuentas.

**Los sistemas agénticos a menudo intercambian latencia y costo por un mejor desempeño en la tarea, y habría que considerar cuándo tiene sentido ese intercambio**[^S1]. Ni una palabra de aquí es retórica: está describiendo un **intercambio**.

¿Qué tan caro? Anthropic aporta un conjunto de observaciones de sus propios datos: **los agentes suelen usar unas 4× más tokens que las interacciones de chat, y los sistemas multiagente usan unas 15× más tokens que los chats**[^S2]. Así que su conclusión es: **para ser económicamente viables, los sistemas multiagente requieren tareas donde el valor de la tarea sea lo bastante alto como para pagar por el rendimiento añadido**[^S2].

Fíjate en el contexto de este número: viene de sus propios datos, no de un banco de pruebas universal, y no dice «todos los enfoques de orquestación cuestan 15× más». Pero la dirección es clara: cada paso que das hacia «más agentes, más paralelismo», la cuenta salta un escalón. Un límite rápido: este multiplicador mide sistemas multiagente respecto al chat, no la etiqueta de precio de «mover el plan al código» en sí; los materiales primarios nunca dieron una cifra de costo independiente para los scripts de orquestación. Esto es también por lo que a esos 40 módulos les vale la pena subir de nivel y a los 12 renombres no: no porque uno sea «complejo» y el otro «simple», sino porque una evaluación de migración que ahorra dos semanas de retrabajo puede permitirse este costo.

## Las cinco lecciones que siguen

El resto de este curso empieza con la forma más ligera y avanza hacia la composición:

- **Lección 2: Encadenamiento y enrutamiento**: Partir una tarea en pasos fijos con compuertas programáticas entre cada uno; clasificar y luego despachar hacia prompts especializados. La forma más ligera de «el plan en el código».
- **Lección 3: Paralelización**: Seccionamiento (partir en subtareas independientes ejecutadas en paralelo) y votación (ejecutar la misma tarea varias veces para obtener salidas diversas), además de cómo agregar resultados en código.
- **Lección 4: Orquestador-trabajadores**: Un LLM central descompone tareas dinámicamente, delega en LLM trabajadores y sintetiza sus resultados. La diferencia clave: las subtareas no están predefinidas.
- **Lección 5: Bucles de evaluación y composición de patrones en grafos**: Revisar, corregir y volver a revisar hasta que pase o deje de haber progreso, y luego coser los patrones anteriores. Esa lección volverá a enunciarlo: «grafo» es una visualización propia de este curso.
- **Lección 6: Manos a la obra**: Convertir aquel arnés de un solo bucle del curso 7 de esta serie en un script de orquestación determinista.

Esta taxonomía de patrones no es una reliquia de 2024: la documentación actual de orquestación multiagente de la plataforma Claude sigue nombrando de forma independiente **Parallelization (repartir subtareas independientes en abanico a la vez, y que el coordinador sintetice los resultados), Specialization (enrutar hacia agentes con prompts de sistema y herramientas centrados en un dominio), Escalation (consultar a un agente o modelo más capaz para un subconjunto de subtareas complejas)**[^S6]. Cambió la piel, el esqueleto es el mismo.

Una cosa más sobre cómo se separa este curso de los dos anteriores: el **curso 2** de esta serie enseñó el concepto de flujo de trabajo —pasos, estado, bifurcaciones, entendimiento a nivel de diagrama—; el **curso 6** de esta serie enseñó la división del trabajo y la comunicación en la colaboración multiagente —fan-out, prompts de delegación autocontenidos, productor-revisor—. Este curso no vuelve a enseñar ninguno de los dos. Lo que cubre es **el flujo de control en sí**: quién cuenta, quién bifurca, adónde van los resultados intermedios, qué pasa cuando se cae. Un puente rápido de vocabulario: a lo que el curso 6 de esta serie llamó «productor-revisor», los materiales primarios lo llaman **evaluator-optimizer**[^S1], y la documentación de flujos de trabajo de Claude Code lo llama **hacer que agentes independientes revisen de forma adversarial los hallazgos de los demás**[^S5].

## Proporcionalidad: todo tiene que pasar por «mejora medible»

Este curso te enseñará cinco patrones y un montón de métodos de composición. Todos comparten la misma línea de reconocimiento, y el texto original es inequívoco: **estos bloques de construcción no son prescriptivos. Son patrones comunes que los desarrolladores pueden moldear y combinar para encajar con distintos casos de uso. La clave del éxito, como con cualquier funcionalidad de LLM, es medir el desempeño e iterar sobre las implementaciones. Lo repetimos: habría que considerar añadir complejidad solo cuando mejora demostrablemente los resultados**[^S1].

«Mejora demostrablemente los resultados» requiere respaldo concreto, y ese respaldo viene de las evaluaciones del curso 10 y de la observabilidad del curso 11 de esta serie: sin un conjunto de evaluación, no puedes decir con claridad «¿añadir enrutamiento mejoró de verdad las cosas?». El cierre del texto canónico sigue este orden: **empieza con prompts simples, optimízalos con una evaluación exhaustiva, y añade sistemas agénticos de varios pasos solo cuando las soluciones más simples se queden cortas**[^S1].

Así que después de aprender cada patrón, pregúntate: **¿puedo producir un número que muestre que los resultados mejoraron después de añadirlo?** Si no puedes, todavía no lo añadas.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Repartir cinco tareas en tres categorías

No hace falta código. Para cada una de estas 5 tareas, juzga en qué categoría cae:

- **Un solo bucle basta** (o incluso una sola llamada alcanza, no añadas complejidad)
- **Pasar a orquestación** (mover el plan al código)
- **Dejar en bucle autónomo** (que el modelo decida la cantidad de pasos)

La primera y la tercera categoría se ejecutan ambas como un solo bucle; están listadas por separado porque **la razón para no pasar a orquestación es distinta**: en una, el trabajo es demasiado simple para justificarlo; en la otra, el trabajo es demasiado abierto para descomponerlo. Juzgar categorías es juzgar razones. Cada juicio necesita una oración de razonamiento que nombre una **condición específica de esta lección** (el mismo paso ejecutándose a lo largo de muchos elementos / más grande que un solo contexto / demasiados para coordinar en una sola conversación / cantidad de pasos impredecible que no se puede fijar en duro en un camino fijo / las tareas simples no necesitan complejidad / los dominios que requieren contexto compartido y muchas dependencias no encajan bien con multiagente). No digas solo «la tarea es grande» o «la tarea es compleja».

1. Escribir una evaluación de migración por módulo para 40 módulos de un repositorio, cada una con puntos de riesgo, estimación de alcance y manifiesto de dependencias.
2. Renombrar `getUserProfile` a `fetchUserProfile`, 12 sitios de llamada a lo largo del repositorio.
3. Investigar «¿deberíamos cambiar nuestra cola de mensajes de A a B?», sin lista predeterminada de fuentes de información, leyendo sobre la marcha.
4. Etiquetar con una categoría cada uno de los 200 tickets de soporte pendientes (8 categorías en total); las reglas de etiquetado están escritas en un documento.
5. Refactorizar un módulo de pedidos fuertemente acoplado: partir 3 clases, mover 2 interfaces, con cambios que se propagan por una cadena de llamadores.

<!-- rubric -->

- Cada una de las cinco tareas recibe un juicio de categoría y las categorías son correctas: tareas 1 y 4 «pasar a orquestación», tarea 2 «un solo bucle basta», tareas 3 y 5 «dejar en bucle autónomo»
- Cada razón nombra una condición específica de esta lección, no un vago «la tarea es grande» o «la tarea es compleja»; la razón de la tarea 4 tiene que aterrizar en la cantidad de elementos y señalar que los elementos individuales son en realidad simples
- La tarea 5 además señala «no repartir en abanico a multiagente», con el razonamiento aterrizando en «los dominios que requieren contexto compartido y muchas dependencias entre agentes no encajan bien» y «la mayoría de las tareas de programación implican menos tareas verdaderamente paralelizables que la investigación»

<!-- answer -->

**1. Evaluaciones de migración para 40 módulos — pasar a orquestación.**
Activa dos disparadores a la vez: más grande de lo que un solo agente puede retener en contexto, y el mismo paso necesita ejecutarse a lo largo de muchos elementos[^S5]. Los pasos de evaluación de cada módulo son fijos (leer código, encontrar sitios de llamada, estimar alcance, escribir informe), solo varían los elementos. Después de mover el plan al código, el `for` cuenta hasta 40, cada módulo abre un bucle de arnés limpio y los resultados intermedios se quedan en variables del script[^S5].

**2. 12 renombres de función — un solo bucle basta, o incluso una llamada más un `grep` alcanza.**
Esto pone a prueba la condición inversa: encuentra la solución más simple posible y añade complejidad solo cuando haga falta, lo que podría significar no construir sistemas agénticos en absoluto[^S1]. Los pasos están completamente determinados, son solo 12 elementos, y cada cambio es mecánico e independiente de los demás. Envolverlo en orquestación significa que pagas en latencia y costo y recibes cero a cambio[^S1].

**3. Investigación para elegir cola de mensajes — dejar en bucle autónomo.**
Problemas abiertos, difíciles de predecir en cuanto a la cantidad de pasos necesaria, sin poder fijar en duro un camino fijo: este es exactamente el encaje de los agentes[^S1]. El trabajo de tipo investigación fue nombrado explícitamente: el proceso es inherentemente dinámico y dependiente del camino, no sabes de antemano qué artículos leer[^S2]. Forzarlo hacia una orquestación de pasos fijos solo lo encadena al único camino que adivinaste al principio.

**4. Etiquetar 200 tickets — pasar a orquestación.**
Activa «el mismo paso necesita ejecutarse a lo largo de muchos elementos»[^S5]. Nota la diferencia con la tarea 1: cada elemento individual es **extremadamente simple** —las reglas están escritas en un documento, una llamada al LLM más unos pocos ejemplos alcanza para juzgar un ticket—, y este es justamente el caso típico de «optimizar llamadas individuales con recuperación y ejemplos suele bastar»[^S1]. Lo que hay que mover al código no es «cómo juzgar un ticket», sino «cómo contar hasta 200»: que cuente el script, para que el ticket 150 y el ticket 1 reciban el mismo contexto inicial limpio.

**5. Refactorizar el módulo de pedidos fuertemente acoplado — dejar en bucle autónomo, y explícitamente no repartir en abanico a multiagente.**
Dos capas de razonamiento. Primera capa, cantidad de pasos impredecible: solo después de partir la primera clase sabes cómo mover la segunda interfaz, no se puede fijar en duro un camino fijo[^S1]. La segunda capa es la clave: este dominio hoy no encaja bien con multiagente —todos los agentes necesitan compartir el mismo contexto, hay muchas dependencias mutuas, y el texto nombra directamente que la mayoría de las tareas de programación implican menos tareas verdaderamente paralelizables que la investigación, y que los agentes LLM todavía no son muy buenos coordinándose y delegando en tiempo real[^S2]—. Lo que habría que hacer es un solo bucle completando el trabajo, añadiendo comprobaciones deterministas en puntos clave cuando sea necesario, no añadiendo cantidad de agentes.

<!-- hint -->

Antes de correr a juzgar, separa primero los **pasos** de cada tarea de sus **elementos**: ¿los pasos de esta tarea son fijos o se determinan sobre la marcha? ¿Cuántos elementos hay que repetir? «Pasos fijos + muchos elementos» y «pasos no fijos» te llevarán a categorías completamente distintas.

<!-- hint -->

La tarea 5 es la única donde **hay que escribir las dos razones**: pisa a la vez dos condiciones inversas distintas. Escribir solo una deja fuera la condición inversa que más fácilmente se pisa de toda la lista de comprobación de esta lección.

### Nivel 2: La misma tarea, tres versiones de «quién tiene el plan»

No hace falta código. Sigue siendo aquella evaluación de migración de 40 módulos, con tres enfoques:

- **A: Un bucle grande** — Entregar la lista de 40 módulos a un solo bucle de arnés de una vez, y dejar que los recorra por su cuenta.
- **B: El modelo como orquestador despachando subagentes uno por uno** — El modelo decide en cada turno de la conversación principal qué subagente despachar para qué módulo, y el subagente devuelve los resultados a la conversación principal.
- **C: El plan escrito en un script** — Un script recorre esos 40 módulos con un `for`, y cada módulo arranca un bucle de arnés limpio.

Completa esta tabla (los signos de interrogación son lo que tienes que llenar). La tercera fila es la clave: cuando el proceso muere o se cae la sesión en el módulo 25, ¿qué pierde cada enfoque?

| | A: Un bucle grande | B: El modelo como orquestador | C: El plan escrito en un script |
| --- | --- | --- | --- |
| Quién tiene el plan | ? | ? | ? |
| Dónde aterrizan los resultados intermedios | ? | ? | ? |
| Cuando se cae en el módulo 25, qué se pierde | ? | ? | ? |

<!-- rubric -->

- Las tres celdas de «quién tiene el plan» son correctas: en A y B lo tiene el modelo, y la diferencia entre ambas queda clara (en A es implícito, escondido en un historial de conversación; en B es el modelo decidiendo turno a turno a quién despachar); en C el script retiene el bucle, las bifurcaciones y los resultados intermedios
- «Dónde aterrizan los resultados intermedios» distingue con claridad: A y B terminan aterrizando en la ventana de contexto (B tiene una capa extra: los resultados de los subagentes vuelven a la conversación principal, y varios subagentes devolviendo cada uno resultados detallados consumen contexto considerable); C se queda en variables del script, y el contexto del modelo retiene solo la respuesta final
- «Qué se pierde» responde la recuperabilidad de C **condicionada a la persistencia incremental** (correspondiente a: el runtime rastrea el resultado de cada agente a medida que avanza la ejecución, lo que hace que una ejecución sea reanudable dentro de la misma sesión), y señala que A y B pierden el progreso entero, mientras que C, tras la persistencia, pierde principalmente solo ese elemento en curso

<!-- answer -->

| | A: Un bucle grande | B: El modelo como orquestador | C: El plan escrito en un script |
| --- | --- | --- | --- |
| Quién tiene el plan | El modelo, de forma **implícita**. El plan nunca se escribió, está escondido en el historial de la conversación, tienes que escarbar en los registros para adivinar el camino que pretendía seguir: esta es exactamente la definición de «los LLM dirigen dinámicamente sus propios procesos y mantienen el control sobre cómo cumplen las tareas»[^S1] | El modelo, un poco más **explícito**. Dice en cada turno «ahora despacho a alguien para que mire el módulo de pedidos», pero sigue decidiendo turno a turno[^S5] | **El script**. El script mismo retiene el bucle, las bifurcaciones y los resultados intermedios, de modo que el contexto de Claude retiene solo la respuesta final[^S5] |
| Dónde aterrizan los resultados intermedios | Todo en el mismo arreglo `messages`: la salida de grep de 40 módulos, los archivos leídos, los rastros de giros equivocados y vueltas atrás, compartiendo una línea de tiempo | De vuelta a la conversación principal. Cuando los subagentes terminan, sus resultados vuelven a tu conversación principal; ejecutar muchos subagentes que devuelven cada uno resultados detallados puede consumir contexto considerable[^S4] | Se queda en variables del script, no aterriza en el contexto del modelo[^S5] |
| Cuando se cae en el módulo 25, qué se pierde | Casi todo. El progreso es ese mismo historial de conversación; cuando la sesión desaparece, el progreso desaparece; incluso si los primeros 24 cayeron a disco, no tienes un punto de entrada limpio de «continuar desde el módulo 25» | La misma pérdida del estado entero de orquestación de la conversación principal. Peor todavía, tras reiniciar el modelo tiene que volver a pensar el plan: su plan anterior nunca se escribió en ninguna parte | **Condicionado a que persistas cada resultado sobre la marcha** (escribir las variables del script a archivos es una línea de código): pierdes solo el módulo 25 en sí, y el punto de entrada para continuar desde el 26 ya está listo; si lo guardaste solo en memoria, el proceso muere y pierdes tanto como en A. Correspondiente a: el runtime del flujo de trabajo rastrea el resultado de cada agente a medida que avanza la ejecución, lo que hace que una ejecución sea reanudable **dentro de la misma sesión**[^S5]; la recuperación entre procesos sigue exigiendo que persistas tú |

**Proceso de razonamiento:**

Las tres filas son en realidad tres facetas de lo mismo. **Quienquiera que tenga el plan, los resultados intermedios aterrizarán en el contenedor de ese titular, y cuando el proceso se caiga perderás lo que haya en ese contenedor.**

En A y B el plan está en manos del modelo, así que el contenedor es la ventana de contexto, y la ventana de contexto es una cosa a nivel de sesión que se pone a cero cuando la sesión termina; de modo que el «progreso» y el «contexto» de A y B son la misma cosa: pierdes uno y pierdes el otro. B parece más fuerte que A porque la evaluación de cada módulo se hace limpiamente en la ventana propia del subagente; pero los resúmenes igual se van apilando uno a uno en la conversación principal, y para el resumen número 25 la conversación principal está igual de apretada. Solo pospuso el problema de A, no cambió el contenedor.

C sí cambió el contenedor: los resultados intermedios están en variables del script, y las variables del script se pueden escribir a archivos o a bases de datos con una línea. Esta es la idea de que **el rastreo incremental trae recuperabilidad**: la versión del runtime es rastrear el resultado de cada agente a medida que avanza la ejecución, reanudable dentro de la misma sesión[^S5]; la versión del script eres tú escribiendo cada resultado a un archivo. Aquí es también donde el pensamiento del curso 9 de esta serie sobre «que las tareas largas sobrevivan a una interrupción» aterriza en la capa de orquestación: el progreso tiene que existir en un lugar que **viva más que el contexto del modelo**. Beneficio adicional: el módulo 25 y el módulo 1 de C reciben exactamente el mismo contexto inicial, así que volver a ejecutar el módulo 25 es un reintento de verdad, no un «probar otra vez en una escena ensuciada por los primeros 24».

<!-- hint -->

Llena primero la fila del medio. Piensa con claridad en qué contenedor **existen físicamente** los resultados intermedios de cada enfoque (¿un arreglo `messages`? ¿La ventana de contexto de la conversación principal? ¿Una variable de JavaScript?), y la respuesta de la tercera fila saldrá sola: lo que se pierde al caerse es lo que haya en ese contenedor.

<!-- hint -->

A B se le juzga fácilmente como «más o menos igual que C» porque también aísla el trabajo sucio de cada módulo en el contexto independiente del subagente. Piensa en esto: después de que el subagente termina, ¿adónde **va** ese resultado? Para el módulo 25, ¿cuántos resúmenes hay sentados en la conversación principal?

<!-- /exercises -->

## Resumen

- Aquel `while` que escribiste en el curso 7 de esta serie es un agente: los agentes pueden encargarse de tareas sofisticadas, pero su implementación suele ser sencilla, y son típicamente solo LLM que usan herramientas basándose en la retroalimentación del entorno, dentro de un bucle[^S1].
- Estas variaciones se llaman en conjunto sistemas agénticos, y dentro de ellas se traza una distinción arquitectónica: los flujos de trabajo son sistemas donde los LLM y las herramientas se orquestan a través de caminos de código predefinidos, y los agentes son sistemas donde los LLM dirigen dinámicamente sus propios procesos y su uso de herramientas, manteniendo el control sobre cómo cumplen las tareas[^S1].
- El eje que los distingue es «quién tiene el plan»: un flujo de trabajo mueve el plan al código, el script mismo retiene el bucle, las bifurcaciones y los resultados intermedios, de modo que el contexto de Claude retiene solo la respuesta final[^S5]. Este curso llama a este eje el «espectro de determinismo» y llama a la visualización de composición de la lección 5 «grafos»; ambos términos son metáforas propias de este curso y no aparecen en los materiales primarios.
- Disparadores para subir de nivel: la tarea necesita más agentes de los que una sola conversación puede coordinar, o quieres la orquestación codificada como un script que puedas leer y volver a ejecutar[^S5]; cuando la tarea es más grande de lo que un solo agente puede retener en contexto, o cuando el mismo paso necesita ejecutarse a lo largo de muchos elementos[^S5]; cuando una tarea lateral inundaría tu conversación principal con contenido que no volverás a consultar[^S4].
- Condiciones para quedarse donde estás: encuentra la solución más simple posible y añade complejidad solo cuando haga falta, lo que podría significar no construir sistemas agénticos en absoluto[^S1]; para muchas aplicaciones, optimizar llamadas individuales al LLM con recuperación y ejemplos en contexto suele bastar[^S1]; los dominios que requieren contexto compartido o muchas dependencias entre agentes hoy no encajan bien con multiagente, y la mayoría de las tareas de programación implican menos tareas verdaderamente paralelizables que la investigación[^S2].
- Dejar en bucles autónomos: problemas abiertos, difíciles de predecir en cuanto a la cantidad de pasos, sin poder fijar en duro un camino fijo[^S1]; el trabajo de tipo investigación es el caso típico, porque el proceso es inherentemente dinámico y dependiente del camino[^S2].
- Consigue la cuenta primero: los sistemas agénticos a menudo intercambian latencia y costo por un mejor desempeño en la tarea[^S1]; en sus propios datos, los agentes usan unas 4× más tokens que el chat, los multiagente unas 15×, y la viabilidad económica requiere que el valor de la tarea sostenga esa mejora[^S2].
- Todo lo que enseña este curso tiene que pasar por la misma compuerta: añade complejidad solo cuando mejora demostrablemente los resultados[^S1]; empieza con prompts simples, optimízalos con una evaluación exhaustiva, y añade sistemas agénticos de varios pasos solo cuando las soluciones más simples se queden cortas[^S1].

[>> Lección 2: Encadenar y enrutar: encadenamiento y enrutamiento](./02-chaining-and-routing.md)
