# Lección 4: Orquestador-trabajadores: volver dinámica la descomposición misma

> Objetivos de aprendizaje:
> - Definir orquestador-trabajadores y articular la diferencia clave frente a la paralelización: topográficamente parecidos, pero las subtareas no vienen predefinidas—el orquestador las decide según la entrada concreta
> - Equipar cada despacho con los cuatro elementos (objetivo, formato de salida, guía sobre herramientas y fuentes, límites de la tarea), y escribir en el prompt las reglas de escalado («cuántos lanzar, cuánto puede gastar cada uno»)
> - Leer un balance completo de un sistema real en producción: dónde aparece la mejora del 90,2 %, por qué la factura de 15× es la otra mitad del mismo mecanismo, qué bloquea la ejecución síncrona, y qué tres costos nuevos te obliga a cargar la asincronía
>
> Requisitos: Lecciones 1–3 completadas (esta lección retoma la pregunta que quedó sin responder al final de la Lección 3) | Anterior: [<< Lección 3](./03-parallelization.md) | Siguiente: [Lección 5 >>](./05-evaluator-and-graphs.md)

## El hueco que dejó abierto la Lección 3

En la Lección 3 escribiste seccionamiento: partir una tarea en subtareas independientes, ejecutarlas a la vez, y luego agregar los resultados con código. Vuelve a mirar ese código—¿dónde vive la lógica de la partición? Está en el arreglo que codificaste a mano: `SECTIONS = ['security', 'performance', 'readability']`. Las tres ramas quedaron decididas cuando escribiste el código; el tiempo de ejecución apenas las ejecuta.

Este enfoque funciona bajo una suposición rígida: **ya sabes en tiempo de escritura cómo dividir la tarea**. La revisión de código encaja en esa suposición porque las dimensiones de revisión son estables—cambias de repositorio y sigues revisando los mismos aspectos.

Ahora considera una tarea distinta:

> «Investiga los problemas de rendimiento de este código base.»

¿Cuántas piezas? ¿Cuáles piezas? No lo puedes codificar a mano. Tal vez el cuello de botella esté en las consultas a la base de datos, así que despacharías a alguien a escanear los sitios de llamada del ORM. Tal vez esté en un bucle de ruta caliente, así que mandarías a alguien a leer la salida del profiler. Tal vez sea el tamaño del artefacto de compilación, sin relación con el tiempo de ejecución. Qué archivos cambiar, qué direcciones investigar—tienes que mirar este repositorio concreto, esta descripción concreta del problema, antes de saberlo.

Dicho de otro modo: **la descomposición misma debe computarse en tiempo de ejecución**. Tu código ya no guarda la decisión de «en qué piezas partirlo»; solo guarda el mecanismo de «cómo despachar, cómo recolectar, cómo sintetizar». ¿Quién toma esa decisión? Un LLM.

Ese es el cuarto patrón.

## Definición, y en qué se diferencia de la paralelización

La fuente oficial da una definición de una sola frase: en el flujo de trabajo orquestador-trabajadores, un LLM central descompone dinámicamente las tareas, las delega a LLM trabajadores y sintetiza sus resultados[^S1].

Tres acciones: **descomponer, delegar, sintetizar**. La del medio—delegar—ya la escribiste en la Lección 3; el código de fan-out es casi idéntico. Lo verdaderamente nuevo es la primera acción: la descomposición pasa del código a manos del modelo.

El enunciado de caso de uso es más preciso: este flujo de trabajo encaja bien con tareas complejas en las que no puedes predecir las subtareas necesarias; el ejemplo oficial es la programación—la cantidad de archivos que hay que cambiar y la naturaleza de cada cambio probablemente dependen de la tarea misma[^S1].

Después viene la comparación que debes recordar. La fuente dice: aunque es topográficamente similar a la paralelización, la diferencia clave es la flexibilidad—las subtareas no vienen predefinidas, sino que las determina el orquestador según la entrada concreta[^S1].

El término que usa es "topographically similar" (topográficamente similar): parecidos en forma. Vale la pena detenerse en esta formulación. Si diagramas el seccionamiento de la Lección 3 y el orquestador-trabajadores de esta lección, dibujarás formas casi idénticas: un nodo se abre en abanico hacia tres, que después colapsan de vuelta en uno. La forma engaña. La diferencia no está en el diagrama; está en **cuándo se toma esa decisión**:

| | Seccionamiento (Lección 3) | Orquestador-trabajadores (esta lección) |
|---|---|---|
| Quién decide la partición | Tú, al escribir el código | El LLM orquestador, en tiempo de ejecución |
| Contenido de la subtarea | Codificado a mano | Puede diferir en cada ejecución |
| Cantidad de subtareas | Fija | Determinada por la entrada |
| ¿Puedes escribir de antemano el prompt de cada rama? | Sí | No—solo puedes aportar plantillas |

Esa última fila es donde está el dolor de ingeniería. Con seccionamiento, el prompt de cada rama es artesanal; puedes iterarlo y afinarlo, agregar ejemplos para cada dimensión. Orquestador-trabajadores no puede hacer eso—los prompts de despacho los genera el orquestador sobre la marcha, y tú solo controlas **las reglas que sigue al generarlos**. Las dos secciones siguientes explican qué deberían contener esas reglas.

Primero, escribamos el mecanismo como un esqueleto. El código de abajo es una ilustración propia de esta lección; no existe ningún script de orquestación oficial en los materiales primarios, así que no lo tomes como una implementación estándar:

```javascript
// Ilustración propia de esta lección, no es código oficial
async function orchestrate(userTask) {
  // 1) El orquestador lee la tarea y computa cuántos despachos y qué hace cada uno
  const plan = await runOrchestrator({
    system: ORCHESTRATOR_PROMPT,   // las reglas de escalado van aquí
    input: userTask,
    outputSchema: DispatchList,    // { dispatches: [{ objective, outputFormat, tools, boundaries, budget }] }
  });

  // 2) Cada despacho se ejecuta como un bucle de trabajador completo (el bucle del curso 7).
  //    dispatches.length lo computa el modelo, así que el techo de concurrencia
  //    lo debe imponer el código—usa el pool de la Lección 3, nunca Promise.all pelado
  const results = await pool(plan.dispatches, LIMIT, (d) =>
    runWorker({
      system: buildWorkerPrompt(d),  // los cuatro elementos aterrizan aquí
      tools: d.tools,
      maxToolCalls: d.budget,
    })
  );

  // 3) El orquestador sintetiza
  return runOrchestrator({ system: SYNTHESIS_PROMPT, input: results });
}
```

Compara esto línea por línea con el código de fan-out de la Lección 3; verás que solo se agregó el paso 1. Ese paso agregado reemplaza la predictibilidad de todo el sistema—que es también por qué la contabilidad de las secciones siguientes necesita detallarse partida por partida.

## Cómo se ve un sistema real en producción

Puedes memorizar definiciones de patrones sin saber cómo se ven en producción. Esta lección tiene una ventaja: Anthropic publicó una retrospectiva de ingeniería sobre su función Research, que es un sistema orquestador-trabajador en ejecución en producción. Esta sección y las siguientes se apoyan en ese balance.

Cita de arquitectura: su sistema Research usa una arquitectura multiagente con un patrón orquestador-trabajador, donde un agente líder coordina el proceso mientras delega a subagentes especializados que operan en paralelo[^S2].

Cómo se ve en ejecución: cuando una persona envía una consulta, el agente líder la analiza, desarrolla una estrategia, y lanza subagentes para explorar distintos aspectos simultáneamente[^S2].

Fíjate en «la analiza, desarrolla una estrategia»—esa es la decisión en tiempo de ejecución que mencionaba la sección anterior. Alguien pregunta algo; el agente líder averigua en el momento cuántas direcciones perseguir y qué debería investigar cada una.

Vale la pena extraer una cita definicional más: un sistema multiagente consiste en varios agentes (LLM que usan herramientas de forma autónoma en un bucle) trabajando juntos[^S2].

Ese paréntesis debería sonarte familiar. **Un trabajador no es nada nuevo—es el bucle del arnés que escribiste en el curso 7 de esta serie.** Orquestador-trabajadores no introduce una unidad de ejecución nueva; introduce «un bucle que arranca otra tanda de bucles». Ya sabes escribir ese bucle. Esta lección enseña a conectarlos.

La misma retrospectiva explica por qué ayuda el fan-out: la esencia de la búsqueda es la compresión—destilar hallazgos de un corpus enorme. Los subagentes facilitan la compresión al operar en paralelo con sus propias ventanas de contexto, explorando distintos aspectos de la pregunta simultáneamente antes de condensar los tokens más importantes para el agente líder de investigación. Cada subagente aporta además separación de responsabilidades—herramientas, prompts y trayectorias de exploración distintas—lo que reduce la dependencia del camino y habilita investigaciones a fondo e independientes[^S2].

«Ventanas de contexto independientes»—esas cuentas ya las sacaste en la Lección 3. Aquí reaparecen en otro papel: no solo capacidad, sino **aislamiento**. Tres investigaciones no pueden ver los pasos intermedios de las otras, así que no se desviarán del rumbo por los errores ajenos.

## El anverso del balance: 90,2 % y ese 80 %

El número más famoso de esta retrospectiva es también el que más se cita mal. Aquí va la cita completa: sus evaluaciones internas muestran que los sistemas multiagente de investigación destacan especialmente en consultas de amplitud primero, que implican perseguir varias direcciones independientes simultáneamente. Encontraron que un sistema multiagente con Claude Opus 4 como agente líder y subagentes Claude Sonnet 4 superó al Claude Opus 4 de agente único en un 90,2 % en su evaluación interna de investigación[^S2].

**No puedes citar este número sin todas y cada una de estas condiciones**:

- **En su evaluación interna de investigación**—no es un benchmark público, no lo puedes reproducir, y no sabes si se parece a tu distribución de tareas.
- **Opus 4 como líder + subagentes Sonnet 4**—el resultado de ese emparejamiento concreto. Otra combinación de modelos no promete nada.
- **Destaca especialmente en consultas de amplitud primero**—las que requieren varias direcciones independientes simultáneamente. Las tareas con dependencias profundas (cada paso espera la conclusión del anterior) quedan fuera del alcance de este enunciado.

Una disciplina crítica más: **este número compara multiagente contra agente único, no «orquestación estructurada contra bucles».** No lo puedes usar para argumentar que «mover el control de flujo al código le gana a dejar que el modelo corra un bucle»—esa es otra afirmación, y ninguno de los materiales primarios de esta lección los compara. Esta lección usa una y otra vez el eje de «quién sostiene el plan», pero no hay datos primarios de benchmark sobre ese eje, solo compromisos de ingeniería.

¿Por qué es efectivo el multiagente en general? La retrospectiva ofrece una explicación menos romántica—nota que su análisis de respaldo viene de otra evaluación, no de la que produce el 90,2 %: los sistemas multiagente funcionan principalmente porque ayudan a gastar suficientes tokens para resolver el problema. En su análisis de la evaluación BrowseComp (que pone a prueba la capacidad de los agentes de navegación para localizar información difícil de encontrar), tres factores explicaron el 95 % de la varianza de rendimiento, y el uso de tokens por sí solo explica el 80 %, con la cantidad de llamadas a herramientas y la elección del modelo como los otros dos factores explicativos[^S2]. Dicen que este hallazgo valida su arquitectura, que distribuye el trabajo entre agentes con ventanas de contexto separadas para agregar más capacidad de razonamiento en paralelo[^S2].

Las cifras del 95 % y del 80 % solo valen para el análisis de BrowseComp; no las muevas a otra parte como conclusiones generales.

Pero esta explicación del mecanismo tiene un uso práctico: **si tu tarea no requiere tantos tokens para resolverse, la base de las ganancias de orquestador-trabajadores desaparece.** (Este es un juicio de ingeniería inferido del enunciado del mecanismo, no una consecuencia directa de las cifras del 95 %/80 %.) Una pregunta que se responde con una sola búsqueda en la documentación no se volverá más correcta por despachar tres trabajadores; solo se volverá más cara.

## El reverso del balance: 4× y 15×

Estos dos números aparecieron en la Lección 1; aquí va la cita completa. La misma retrospectiva continúa de inmediato: hay una desventaja—en la práctica, estas arquitecturas queman tokens rápido. En sus datos, los agentes suelen usar unas 4× más tokens que las interacciones de chat, y los sistemas multiagente usan unas 15× más tokens que los chats. Para ser viables económicamente, los sistemas multiagente requieren tareas donde el valor de la tarea sea lo bastante alto como para pagar por el aumento de rendimiento[^S2].

Pon los números de ambas secciones lado a lado: de un lado, 90,2 % (bajo condiciones específicas); del otro, 15×. La sección anterior dejó claro que la ganancia de rendimiento viene principalmente de gastar tokens, así que la factura más alta no es un efecto secundario—es **la otra mitad del mismo mecanismo**.

¿Cómo operacionalizas «el valor de la tarea tiene que corresponder»? En realidad te está pidiendo responder una pregunta de negocio antes que una técnica: si esta investigación sale bien, ¿cuánto vale? Si la respuesta es «le ahorra media hora a una persona del equipo», la factura de 15× probablemente no se paga sola. Si la respuesta es «evita un incidente en producción», eso ya es otra historia.

La retrospectiva traza además un límite más duro: algunos dominios que requieren que todos los agentes compartan el mismo contexto, o que implican muchas dependencias entre agentes, hoy no encajan bien con los sistemas multiagente. Por ejemplo, la mayoría de las tareas de programación implican menos tareas verdaderamente paralelizables que la investigación, y los agentes LLM todavía no son buenos coordinándose y delegando a otros agentes en tiempo real[^S2]. A la inversa, han encontrado que los sistemas multiagente destacan en tareas valiosas que implican paralelización pesada, información que excede una sola ventana de contexto, y trato con numerosas herramientas complejas[^S2].

Hay dos frases aquí que deben leerse juntas, o las malentenderás: la fuente oficial del patrón usa la programación como ejemplo de «las subtareas no se pueden predecir»[^S1], mientras que la retrospectiva multiagente dice que la mayoría de las tareas de programación implican menos tareas verdaderamente paralelizables que la investigación[^S2]. No se contradicen—hablan de dos cosas distintas. La primera dice que **la descomposición debe computarse dinámicamente**; la segunda dice que **puede que las subtareas computadas no corran todas simultáneamente**. La descomposición dinámica no implica paralelismo inevitable. Un orquestador puede perfectamente computar cinco subtareas, y luego ejecutar tres en secuencia y dos en paralelo.

## Los cuatro elementos del prompt de delegación

Esta es la disciplina de ingeniería que más deberías recordar de esta lección; la cita original es breve:

> "Teach the orchestrator how to delegate. In our system, the lead agent decomposes queries into subtasks and describes them to subagents. **Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries.** Without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information"[^S2].

(Enséñale al orquestador a delegar. En nuestro sistema, el agente líder descompone las consultas en subtareas y se las describe a los subagentes. **Cada subagente necesita un objetivo, un formato de salida, guía sobre las herramientas y fuentes a usar, y límites claros de la tarea.** Sin descripciones detalladas de la tarea, los agentes duplican trabajo, dejan huecos, o no logran encontrar la información necesaria.)

Cuatro elementos, ninguno opcional:

**Objetivo**—qué conclusión debe producir este trabajador. No «investiga el rendimiento», sino «encuentra los 3 puntos calientes de CPU en tiempo de ejecución con mayor self-time». El objetivo debe ser lo bastante estrecho como para juzgar si se cumplió.

**Formato de salida**—cómo se ve el artefacto devuelto. Campos, techo de cantidad de ítems, orden. Este punto determina directamente qué tan fácil es escribir la etapa de síntesis del orquestador: si tres trabajadores devuelven tres párrafos de prosa, la síntesis solo puede apoyarse en que el modelo los vuelva a leer. Si devuelven JSON conforme al mismo esquema, la mitad de la síntesis se puede hacer en código.

**Guía sobre herramientas y fuentes**—qué herramientas tiene permitido usar, dónde mirar. Este punto es a la vez control de costos y prevención de deriva: si no le das una herramienta de búsqueda web, no puede irse a buscar algo que no existe.

**Límites de la tarea**—explícitamente qué **no** debería hacer. Este punto es el más fácil de omitir, y el que más directamente determina si los trabajadores chocan. «No mires dentro de `src/server/`; ese es territorio de otro trabajador»—una sola frase así es más efectiva que cualquier deduplicación posterior.

El caso de fallo de la retrospectiva es casi de manual: por ejemplo, un subagente exploró la crisis de chips automotrices de 2021 mientras otros 2 duplicaban trabajo investigando las cadenas de suministro actuales de 2025, sin una división del trabajo efectiva[^S2].

Tres trabajadores, dos duplicando y uno lanzado hacia un año irrelevante—esto es exactamente cómo se ve «duplican trabajo, dejan huecos» en términos concretos.

Puente con lo que ya aprendiste: **el curso 6 de esta serie, al enseñar colaboración multiagente, ya desglosó estos cuatro puntos (llamándolos objetivo, alcance, fuentes y formato de salida); la Lección 2 también los mencionó.** Esta lección hace lo que esos dos lugares no hicieron: poner los cuatro elementos en la posición de **despachos generados por el orquestador sobre la marcha**—ya no controlas el contenido de cada despacho, solo las reglas que el orquestador sigue al generarlos. Los cuatro elementos siguen funcionando como lista de verificación: después de escribir un despacho, cuéntalos uno por uno para confirmar que están los cuatro.

```agentmentor-check
{
  "id": "orc-zh-04-vague-dispatch",
  "label": "Tres despachos de una frase, estrellados",
  "prompt": "Tu orquestador repartió una investigación de cadena de suministro entre tres trabajadores, y le mandó a cada uno la misma frase única: «Investiga los problemas de la cadena de suministro». Cuando termina la ejecución, descubres: el trabajador A y el trabajador B devolvieron informes con contenido muy superpuesto, y el trabajador C se fue a investigar una crisis vieja de hace años que no tiene relación con la situación actual que preguntaste. La factura de tokens es del triple, pero conseguiste una sola conclusión usable. ¿Qué deberías hacer a continuación?",
  "whyHere": "Acabamos de enseñar los cuatro elementos; las reglas de escalado todavía no se cubren. Practicar el reconocimiento de la causa raíz en una escena donde solo se ven los síntomas.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Agregar un paso de deduplicación en la etapa de síntesis para fusionar los dos informes superpuestos en uno, y hacer que el orquestador añada una nota que diga «el resultado de C es irrelevante, ignóralo».",
      "correct": false,
      "feedback": "Esto es ponerle una curita a los síntomas. La deduplicación puede dejar el informe final con aspecto limpio, pero los tres cargos de tokens ya se gastaron, y el trabajo que A y B superpusieron—la dirección que alguien debería haber cubierto—sigue faltando. El posprocesamiento no puede arreglar una división del trabajo fallida."
    },
    {
      "id": "b",
      "text": "Equipar cada uno de los tres despachos con los cuatro elementos: su propio objetivo, formato de salida, guía sobre herramientas y fuentes, y límites de la tarea.",
      "correct": true,
      "feedback": "Correcto. Los despachos de una sola frase son exactamente lo que se ve cuando faltan los cuatro elementos. El fallo prototípico de la retrospectiva oficial es casi idéntico: un subagente exploró una crisis vieja de hace años mientras otros dos duplicaban trabajo sobre la cadena de suministro actual, sin una división del trabajo efectiva. La causa raíz son descripciones de tarea insuficientes, así que los agentes duplican trabajo y dejan huecos. El arreglo está en la misma cita: objetivo, formato de salida, guía sobre herramientas y fuentes, límites claros de la tarea—equipa los cuatro, y el punto de los límites debería declarar explícitamente «no toques el territorio de los otros dos trabajadores»."
    },
    {
      "id": "c",
      "text": "Reemplazar los tres trabajadores por un modelo más capaz, para que juzguen por su cuenta qué direcciones distintas perseguir.",
      "correct": false,
      "feedback": "Cambiar de modelo no puede arreglar el hecho de que los tres trabajadores recibieron cada uno la misma frase única—no se pueden ver entre sí, así que por más fuertes que sean, cada uno solo puede hacer su propia conjetura razonable sobre la misma entrada, y la probabilidad de colisión no baja. Una sección posterior mostrará que la retrospectiva también dice que a los agentes les cuesta juzgar el esfuerzo apropiado para tareas distintas, así que ellos incrustaron reglas en los prompts. Lo que falta aquí son descripciones de tarea, no capacidad del modelo."
    }
  ]
}
```

## Escalar el esfuerzo según la complejidad: escribir las reglas de asignación en el prompt

Los cuatro elementos resuelven «qué hace cada trabajador»; queda una pregunta: **cuántos lanzar, cuánto puede gastar cada uno**.

Este conjunto de números apareció en la apertura del curso 6; aquí se usa de otro modo—no para juzgar si usar multiagente, sino para escribirlo en el prompt del orquestador y que él mismo asigne las cuotas. El diagnóstico de la retrospectiva es directo: a los agentes les cuesta juzgar el esfuerzo apropiado para tareas distintas, así que incrustaron reglas de escalado en los prompts. La búsqueda simple de datos requiere apenas 1 agente con 3-10 llamadas a herramientas, las comparaciones directas podrían necesitar 2-4 subagentes con 10-15 llamadas cada uno, y la investigación compleja podría usar más de 10 subagentes con responsabilidades claramente divididas[^S2].

Una disciplina de citación sobre estos números: **su identidad es «reglas que ellos incrustaron en sus propios prompts», no estándares de la industria, ni escalas que debas copiar al pie de la letra.** Tu distribución de tareas, la velocidad de tus herramientas y tus modelos son todos distintos de los suyos. Lo verdaderamente portable es la práctica en sí—**escribir las reglas de asignación explícitamente en el prompt del orquestador, en vez de esperar que el orquestador se autorregule**.

¿Qué pasa si no las escribes? La retrospectiva aporta la escena: los sistemas multiagente tienen diferencias clave frente a los sistemas de agente único, incluido un crecimiento rápido de la complejidad de coordinación. Los agentes tempranos cometían errores como lanzar 50 subagentes para consultas simples, rastrear la web sin fin buscando fuentes inexistentes, y distraerse entre sí con actualizaciones excesivas[^S2].

"Spawning 50 subagents for simple queries" (lanzar 50 subagentes para consultas simples)—convierte eso usando el balance de la sección anterior y lo entenderás: según sus datos, multiagente es unas 15× los tokens de un chat[^S2], así que este tipo de fan-out desbocado empuja ese multiplicador mucho más arriba. Las reglas de cuota no son tacañería; son **el medio para mantener el costo y el valor de la tarea en el mismo orden de magnitud**.

¿Cómo escribes esta regla en el prompt de tu propio orquestador? Sigue su forma y rellena tu propia escala: clasifica tus tareas en unos pocos niveles, especifica para cada nivel el techo de cantidad de subagentes y el techo de llamadas a herramientas por subagente, y luego agrega una cláusula del tipo «si superas el techo, devuelve los hallazgos actuales; no continúes». Esto puede reducir la probabilidad de desbocamiento, pero sigue siendo apenas un prompt—para modelos no deterministas, un techo escrito en el prompt siempre es solo un consejo. La compuerta real está del lado del código: el `LIMIT` del `pool` del esqueleto. La capa del prompt se ocupa de la «autoconciencia del modelo»; la capa del código se ocupa del «respaldo». Necesitas las dos.

## Cuellos de botella síncronos, y el precio de la asincronía

Esta sección discute problemas que la arquitectura no ha resuelto hoy. El texto original viene en dos párrafos.

Primer párrafo, estado actual: la ejecución síncrona crea cuellos de botella. Actualmente, sus agentes líderes ejecutan a los subagentes de forma síncrona, esperando a que cada tanda de subagentes termine antes de seguir. Esto simplifica la coordinación, pero crea cuellos de botella en el flujo de información entre agentes. Por ejemplo, el agente líder no puede dirigir a los subagentes, los subagentes no se pueden coordinar, y el sistema entero puede quedar bloqueado mientras espera a que un solo subagente termine de buscar[^S2].

Tres puntos de «no puede», cada uno correspondiente a una pérdida real:

- **El agente líder no puede reorientar sobre la marcha**—en el minuto 2 ya puede darse cuenta de que la dirección del trabajador C está equivocada, pero tiene que esperar a que termine la tanda para hacer algo.
- **Los subagentes no se pueden coordinar**—el trabajador A ya encontró algo, el trabajador B no lo sabe, y podría estar buscándolo de nuevo justo ahora.
- **La tanda entera queda bloqueada por el más lento**—dos trabajadores que terminan en 3 minutos esperarán junto a uno que agota su tiempo a los 25 minutos, hasta el minuto 25.

Segundo párrafo, el costo del otro camino: la ejecución asíncrona habilitaría paralelismo adicional—agentes trabajando de forma concurrente y creando subagentes nuevos cuando haga falta. Pero esta asincronía agrega desafíos en la coordinación de resultados, la consistencia de estado, y la propagación de errores entre los subagentes[^S2].

Fíjate en el tono de esta frase: el material primario **enumera estos tres puntos como desafíos**, no como problemas resueltos. Así que esta lección no te va a dar «el esquema de orquestación asíncrona recomendado oficialmente»—eso no existe. Si te vas a asíncrono por tu cuenta, estos tres puntos son tuyos para cargar:

- **Coordinación de resultados**: los trabajadores vuelven a cuentagotas; «cuándo hemos terminado lo suficiente para empezar la síntesis» es un juicio que debes definir tú.
- **Consistencia de estado**: el agente líder cambió el alcance de la investigación sobre la marcha; los trabajadores en curso siguen usando el alcance viejo; las premisas de ambos lados se bifurcaron.
- **Propagación de errores**: un trabajador falló, pero su salida intermedia ya se usó para lanzar trabajadores nuevos. Quién de esa cadena debería volver a ejecutarse, de quién se anulan los resultados—esto requiere reglas explícitas.

El ejercicio de Nivel 2 de esta lección te pedirá dar una instancia concreta de cada uno sobre una línea de tiempo específica.

## Comportamiento emergente, y la última milla

Algunas lecciones de ingeniería más de la misma retrospectiva; cada una es corta, pero cada una vale un incidente en producción.

**Los sistemas multiagente tienen comportamientos emergentes, que surgen sin programación específica. Por ejemplo, cambios pequeños en el agente líder pueden cambiar de forma impredecible cómo se comportan los subagentes. El éxito requiere entender los patrones de interacción, no solo el comportamiento de un agente individual**[^S2]. La misma retrospectiva agrega una línea más dura: en el software tradicional, un bug podría romper una función, degradar el rendimiento, o causar caídas. En los sistemas agénticos, los cambios menores se propagan en cascada hacia cambios grandes de comportamiento, lo que hace notablemente difícil escribir código para agentes complejos que deben mantener estado en un proceso de larga duración[^S2].

Impacto en tu trabajo diario: **cambia el prompt del orquestador, y debes volver a ejecutar la suite de evaluación entera; no puedes limitarte a revisar la salida del propio orquestador**. La pista de evaluación del curso 10 entra en juego aquí—es el único instrumento que tienes para ver si un cambio pequeño sacó de rumbo a los subagentes.

**La última milla a menudo se vuelve la mayor parte del viaje**: al construir agentes de IA, la última milla a menudo se vuelve la mayor parte del viaje. Los códigos base que funcionan en las máquinas de desarrollo requieren ingeniería significativa para volverse sistemas de producción confiables. La naturaleza compuesta de los errores en los sistemas agénticos significa que problemas menores para el software tradicional pueden descarrilar por completo a los agentes[^S2].

Dos prácticas que la acompañan: combinan la adaptabilidad de los agentes de IA construidos sobre Claude con salvaguardas deterministas como lógica de reintento y puntos de control periódicos[^S2]; usan despliegues arcoíris para evitar interrumpir a los agentes en curso, desplazando gradualmente el tráfico de las versiones viejas a las nuevas mientras mantienen ambas en ejecución simultáneamente[^S2].

Despliegues arcoíris—esto enlaza de vuelta con un problema mencionado en la apertura del curso 9 al usar las actualizaciones de despliegue como escenario de caída: un servicio web normal se reinicia, la gente reintenta una vez y listo. Un agente que lleva 20 minutos en ejecución queda interrumpido por un reinicio, y perdiste 20 minutos de trabajo más los tokens ya gastados. **Desplegar tareas de larga duración no es lo mismo que desplegar servicios sin estado.**

## Calibración: este es el más caro de los cinco patrones

A esta altura ya viste cuatro de los cinco patrones. Ordenados por costo, orquestador-trabajadores es el más caro hasta ahora: sobre la sobrecarga de la paralelización, agrega otra invocación de «que el modelo compute la partición», más el riesgo de «que la partición se compute mal».

Así que antes de empezar, hazte tres preguntas en orden:

**Primera, ¿se puede codificar la partición a mano?** Si sí, vuelve a la Lección 3 y usa seccionamiento. En seccionamiento, el prompt de cada rama está pulido a mano; en orquestador-trabajadores, los despachos los genera el modelo sobre la marcha—el primero tiene un techo de calidad más alto y es más fácil de depurar. **Si lo puedes predefinir, no lo vuelvas dinámico.**

**Segunda, ¿vale esta tarea tanto dinero?** Según sus datos, multiagente es unas 15× los tokens de un chat[^S2], y para ser viable económicamente, el valor de la tarea debe ser lo bastante alto como para pagar por el aumento[^S2]. Este es un juicio de negocio, no técnico, pero hay que hacerlo antes de escribir código.

**Tercera, si tienes dudas, mide primero.** La postura de cierre de la fuente oficial sobre todo el conjunto de patrones es: estos bloques de construcción no son prescriptivos. La clave del éxito es medir el rendimiento e iterar sobre las implementaciones; habría que considerar añadir complejidad solo cuando mejora demostrablemente los resultados[^S1]. El curso 10 te dio esa pista—primero ejecuta tu conjunto real de tareas con un solo bucle, consigue una línea base, y después juzga si orquestador-trabajadores la levanta. Sin línea base, «se siente mejor» y «gasté 15× para llegar al mismo resultado» se te ven idénticos.

Esta lección solo cubrió «despachar hacia afuera, recolectar de vuelta». Qué pasa si el trabajo devuelto es de baja calidad—si otro agente debería revisarlo, y cómo combinas estos cuatro patrones—ese es el contenido de la Lección 5.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Reescribir despachos de una frase en tres despachos calificados

Un equipo necesita investigar problemas de rendimiento en una biblioteca. El orquestador les mandó a tres trabajadores la misma frase única:

> «Esta biblioteca parece más lenta últimamente; ve a investigar.»

Volvieron tres informes: dos con contenido muy superpuesto, el tercero sobre velocidad de compilación—nadie tocó el tiempo de ejecución.

Entorno dado (sin código, solo prompts):

- Estructura del repositorio: `src/core/` (algoritmos y estructuras de datos), `src/server/` (rutas de manejo de peticiones), `profiles/latest.cpuprofile` (un perfil de CPU ya generado)
- Los trabajadores solo tienen tres herramientas disponibles: `read_file`, `grep`, `read_profile`
- Ninguno de los tres trabajadores puede modificar código

Tu tarea:

1. Reescribe esa frase en **tres** despachos, cada uno con los cuatro elementos: objetivo, formato de salida, guía sobre herramientas y fuentes, límites de la tarea. Los tres territorios no deben superponerse—deberías poder explicar en una frase «por qué el trabajador B no puede devolver lo mismo que el trabajador A».
2. Agrega **una línea** de justificación de cuota para toda la tanda: cuántos trabajadores lanzar, techo de llamadas a herramientas por trabajador, con qué nivel lo estás comparando, y explica la identidad de ese nivel.

<!-- rubric -->

- [ ] Tres despachos, cada uno señalando dónde aparecen los cuatro elementos; cualquier despacho al que le falte algún elemento no califica
- [ ] Los tres **objetivos** no se superponen, y cada uno es lo bastante estrecho como para juzgar su cumplimiento (no a escala de «mira el rendimiento»)
- [ ] El **formato de salida** es fusionable por programa: nombres de campo fijos, techo de cantidad de ítems; idealmente los tres usan el mismo esquema para que la síntesis haga la mitad del trabajo en código
- [ ] La **guía sobre herramientas y fuentes** especifica rutas o archivos concretos, no «usa las herramientas que necesites»
- [ ] Los **límites de la tarea** incluyen al menos un punto de «no hagas X», y al menos uno bloquea explícitamente el territorio de otro trabajador
- [ ] La línea de cuota da: cantidad de trabajadores, techo de llamadas a herramientas por trabajador, con qué nivel se compara, y declara que esta escala son reglas que un equipo incrustó en sus propios prompts, no estándares universales
- [ ] La línea de cuota incluye una cláusula de repliegue del tipo «si superas el techo, devuelve los hallazgos actuales»
- [ ] Señales que descalifican: los tres despachos son en realidad la misma frase reformulada; o apoyarse en «agregar un paso final de deduplicación» para tapar la división del trabajo

<!-- answer -->

**Despacho A (puntos calientes del perfil)**

- Objetivo: A partir del perfil de CPU existente, encontrar las 3 funciones con mayor porcentaje de self-time, y aportar sus ubicaciones en el código fuente.
- Formato de salida: arreglo JSON, máximo 3 ítems, cada uno `{ "file": string, "line": number, "self_time_pct": number, "reason": string }`, ordenado por `self_time_pct` descendente.
- Herramientas y fuentes: usar solo `read_profile` para leer `profiles/latest.cpuprofile`; usar `read_file` para abrir los archivos fuente coincidentes y confirmar los números de línea. No usar `grep` para escaneos de todo el repositorio.
- Límites: no modificar código; no meterse en `src/server/` a analizar rutas de peticiones (esa es la tarea de B); no evaluar complejidad algorítmica (esa es la tarea de C); si detectas un bug sospechoso, apenas anótalo en `reason`, no lo expandas.

**Despacho B (E/S repetida en rutas de peticiones)**

- Objetivo: En las rutas de manejo de peticiones de `src/server/`, encontrar llamadas a fuentes de datos que se leen repetidamente dentro de una misma petición (la misma clave/consulta leída varias veces).
- Formato de salida: el mismo esquema JSON, máximo 5 ítems; rellenar `self_time_pct` con `null` si no aplica; `reason` debe declarar el objeto que se lee repetidamente y cuántas veces dentro de una petición.
- Herramientas y fuentes: `grep` y `read_file`, rutas restringidas a `src/server/`. No leer el perfil (A lo está leyendo).
- Límites: no modificar código; no meterse en `src/core/`; no juzgar complejidad algorítmica; no proponer arreglos, solo reportar fenómenos y ubicaciones.

**Despacho C (estructuras algorítmicas superlineales)**

- Objetivo: En `src/core/`, encontrar estructuras que se degradan de forma superlineal a medida que crece el tamaño de la entrada—recorridos anidados, búsquedas lineales dentro de bucles, objetos grandes construidos repetidamente en cuerpos de bucle.
- Formato de salida: el mismo esquema JSON, máximo 5 ítems; rellenar `self_time_pct` con `null`; `reason` debería declarar la estructura de anidamiento y la expresión de la tasa de crecimiento (por ejemplo, «bucle externo sobre n, el `indexOf` interno también es n, juntos n²»).
- Herramientas y fuentes: `read_file` y `grep`, rutas restringidas a `src/core/`. No leer el perfil—evitar llegar a la misma tanda de conclusiones que A.
- Límites: no modificar código; no meterse en `src/server/`; no dar propuestas de reescritura; no ejecutar benchmarks.

**Justificación de cuota (una línea)**

> Esta es una investigación de «comparación multidireccional», más pesada que la búsqueda simple de datos pero muy lejos de necesitar más de 10 subagentes con división explícita de responsabilidades, así que lanzo 3 trabajadores con un techo de 12 llamadas cada uno; si un trabajador supera el techo, devuelve los hallazgos actuales y para. El nivel de comparación es el "direct comparisons might need 2-4 subagents with 10-15 calls each" (las comparaciones directas podrían necesitar 2-4 subagentes con 10-15 llamadas cada uno) de la retrospectiva pública—esas son reglas que ellos incrustaron en sus propios prompts, no un estándar de la industria; yo apenas le pido prestado el orden de magnitud.

**Por qué esta partición**: los tres despachos se dividen por **fuente de evidencia** (perfil / sitios de llamada del lado servidor / estructura algorítmica del núcleo), no por dimensiones vagas como «tres aspectos del rendimiento». Fuentes que no se superponen producen naturalmente conclusiones que no se superponen. Los tres usan el mismo esquema, así que la etapa de síntesis del orquestador puede primero usar código para fusionar por `file`, y después hacer que el modelo juzgue solamente los conflictos fusionados.

<!-- hint -->

No te apures a escribir objetivos. Primero pregúntate: **cuando vuelvan estos tres informes, ¿cómo los voy a combinar en una sola conclusión?** Los campos del formato de salida y el techo de cantidad de ítems deberían derivarse hacia atrás de ese plan de combinación. Si no logras figurarte cómo combinarlos, tus objetivos están mal partidos.

<!-- hint -->

La mitad de los límites que más fácil se omite es «no hagas X». Revisa de a pares: entre A y B, entre B y C, entre A y C—¿tiene cada par una frase que bloquee explícitamente el territorio del otro? ¿Puede algún par leer el mismo archivo y llegar a la misma conclusión?

### Nivel 2: Calcular los costos sobre una línea de tiempo de orquestación síncrona

Una orquestación se ejecutó así (el tiempo empieza cuando el agente líder envía los despachos):

- Minuto 0: el agente líder despacha a los trabajadores A, B y C simultáneamente.
- Minuto 3: A devuelve resultados.
- Minuto 4: B devuelve resultados.
- Minuto 25: C nunca devolvió nada; se alcanza el tiempo límite de 25 minutos del lado del trabajador, C se juzga como agotado, no devuelve nada.
- Minuto 25: esta tanda por fin termina; el agente líder empieza la síntesis.

El agente líder ejecuta a los subagentes de forma **síncrona**: espera a que la tanda entera termine antes de continuar.

Responde tres cosas (sin código):

1. **Calcula el desperdicio de espera de esta tanda**. Da al menos tres perspectivas con sus fórmulas.
2. **Señala tres cosas que el agente líder no puede hacer bajo el modelo síncrono**, y ancla cada una a un momento concreto de esta línea de tiempo.
3. **Si se pasa a asíncrono, qué tres costos nuevos debes cargar**, y da una manifestación concreta de cada uno sobre esta línea de tiempo.

<!-- rubric -->

- [ ] La pregunta 1 da al menos tres perspectivas con fórmulas autoconsistentes: perspectiva de latencia (tanda entera 25 min frente a 4 min sin C; C por sí solo agregó 21 min), perspectiva de salida ociosa (A ociosa 22 min + B ociosa 21 min = 43 min), perspectiva de consumo (3 + 4 + 25 = 32 minutos-trabajador, los 25 de C no produjeron nada, ~78 %)
- [ ] Declara explícitamente que el propio agente líder quedó bloqueado por la barrera síncrona desde el minuto 4 hasta el minuto 25, 21 minutos: sosteniendo dos resultados completos pero sin poder actuar
- [ ] Los tres puntos de la pregunta 2 coinciden: **no puede reorientar a los subagentes sobre la marcha**, **los subagentes no se pueden coordinar entre sí**, **el sistema entero queda bloqueado por el más lento**; cada uno anclado a un momento concreto de la línea de tiempo, no una simple repetición de definiciones
- [ ] Los tres costos de la pregunta 3 coinciden: **coordinación de resultados**, **consistencia de estado**, **propagación de errores entre los subagentes**; cada uno emparejado con una manifestación concreta sobre esta línea de tiempo
- [ ] No escribe lo asíncrono como «tiene una solución oficial, basta con seguirla»—los materiales primarios enumeran estos tres como desafíos
- [ ] Señales que descalifican: solo responde «lo síncrono es lento, vete a asíncrono»; o los números calculados se contradicen entre sí (por ejemplo, dice que la tanda entera termina a los 4 min, y también que A estuvo ociosa 22 min)

<!-- answer -->

**1. Desperdicio de espera, tres perspectivas**

- **Perspectiva de latencia**: tiempo de reloj de la tanda entera = 25 minutos, determinado por el trabajador más lento, C. Si C no existiera, esta tanda podría terminar en el minuto 4. Así que C por sí solo agregó `25 − 4 = 21` minutos de latencia.
- **Perspectiva de salida ociosa**: el resultado de A lleva sin usarse desde el minuto 3, sentado `25 − 3 = 22` minutos; el resultado de B estuvo sentado `25 − 4 = 21` minutos. En total `22 + 21 = 43` minutos de «completado pero inutilizable». El propio agente líder también está bloqueado durante esta ventana: desde el minuto 4 hasta el minuto 25, 21 minutos en total, sostiene dos resultados completos pero no puede empezar la síntesis, no puede reorientar, no puede reportar antes.
- **Perspectiva de consumo**: los tres trabajadores estuvieron en ejecución en realidad `3 + 4 + 25 = 32` minutos-trabajador, de los cuales los 25 minutos de C no produjeron nada por agotarse el tiempo, lo que representa `25 ÷ 32 ≈ 78 %`. Dicho de otro modo, más de tres cuartos del tiempo de ejecución de esta tanda no produjeron salida usable—y los tokens correspondientes igual se cobran.

**2. Tres cosas que el agente líder no puede hacer bajo el modelo síncrono**

- **No puede reorientar a los subagentes sobre la marcha**. Supongamos que el agente líder ya ve, por los resultados de A y B en el minuto 6, que la dirección de C es probablemente un callejón sin salida; aun así no le puede mandar ninguna instrucción a C, no lo puede detener, no le puede cambiar el tema. Solo puede esperar hasta el minuto 25.
- **Los subagentes no se pueden coordinar entre sí**. A devolvió en el minuto 3 una pista clave que C necesita desesperadamente—pero C no la puede ver. Durante sus 25 minutos, C podría estar buscando de nuevo lo que A ya investigó, sin ningún mecanismo para enterarse.
- **El sistema entero queda bloqueado por el más lento**. En esta línea de tiempo, dos trabajadores que terminan dentro de 4 minutos esperan junto a un trabajador que agota su tiempo hasta el minuto 25. La latencia de la tanda equivale a la latencia de su miembro más lento, sin importar qué tan rápido se ejecutaron los otros dos.

**3. Al pasar a asíncrono, tres costos nuevos que cargar**

- **Coordinación de resultados**. Después de pasar a asíncrono, A vuelve en el minuto 3, B en el minuto 4, y C podría no volver nunca. «Cuándo hemos terminado lo suficiente para empezar la síntesis» ya no tiene respuesta natural—la debes definir tú: ¿esperar un tiempo límite fijo? ¿Seguir después de recolectar 2? ¿O actualizar las conclusiones de forma incremental cada vez que llega una? Manifestación concreta sobre esta línea de tiempo: en el minuto 4 sostienes dos resultados; ¿debería empezar la síntesis ahora? El código debe tener un criterio explícito.
- **Consistencia de estado**. El beneficio de lo asíncrono es que el agente líder puede estrechar el alcance de la investigación en el minuto 6 basándose en los resultados de A y B. Pero C sigue en ejecución bajo el alcance viejo desde el minuto 0. Si C efectivamente devuelve un resultado en el minuto 20, ese resultado está construido sobre una premisa que quedó revocada—necesitas una forma de identificarlo y marcarlo, o entrará a la síntesis como «un resultado legítimo».
- **Propagación de errores entre los subagentes**. Asíncrono significa que el agente líder puede despachar a D y E en el minuto 8 basándose en la salida intermedia de C. Después de que C agota su tiempo en el minuto 25, ¿los resultados de D y E siguen contando? Están construidos sobre una investigación que nunca terminó. Quién debería volver a ejecutarse, de quién se anulan los resultados, hasta dónde se propaga el fallo por esta cadena de lanzamientos—el modelo síncrono no tiene este problema (el fallo de C es apenas un resultado vacío); lo asíncrono requiere un conjunto explícito de reglas.

Los materiales primarios enumeran estos tres como **desafíos no resueltos**, no como recetas. Así que si efectivamente te vas a asíncrono, trata estos tres como tareas de diseño propias, no como copiar la tarea.

<!-- hint -->

No calcules un solo número para la pregunta 1. El «desperdicio» bajo tres perspectivas distintas son tres cantidades distintas: **cuánto más tardó el reloj**, **cuánto tiempo estuvo ociosa la salida ya completada**, **qué parte del tiempo de ejecución no produjo nada**. Calcula las tres; así es como ves exactamente dónde aterriza el costo de lo síncrono.

<!-- hint -->

Las preguntas 2 y 3 están emparejadas: cada cosa que el agente líder **no puede** hacer bajo lo síncrono se vuelve algo que **puede** hacer pero con un costo bajo lo asíncrono. Prueba a emparejarlas—¿qué punto de costo corresponde a «no puede reorientar sobre la marcha»? Después de emparejarlas, verás que lo asíncrono no arregló estas tres cosas; las cambió por tres cosas más difíciles.

<!-- /exercises -->

## Resumen

- Orquestador-trabajadores es un flujo de trabajo donde un LLM central descompone dinámicamente las tareas, las delega a LLM trabajadores y sintetiza sus resultados; encaja bien con tareas complejas en las que no puedes predecir las subtareas necesarias[^S1]
- Aunque es topográficamente similar a la paralelización, la diferencia clave es la flexibilidad: las subtareas no vienen predefinidas, sino que las determina el orquestador según la entrada concreta[^S1]—misma forma, distinto momento de la decisión
- Un trabajador no es nada nuevo: un sistema multiagente son varios «LLM que usan herramientas de forma autónoma en un bucle» trabajando juntos, con un agente líder que coordina el proceso y delega a subagentes especializados que operan en paralelo[^S2]
- El 90,2 % solo vale en su contexto completo: su evaluación interna de investigación, Claude Opus 4 como líder + subagentes Claude Sonnet 4, destacando especialmente en consultas de amplitud primero[^S2]; la explicación del mecanismo es que el multiagente ayuda principalmente a gastar suficientes tokens—en el análisis de BrowseComp, tres factores explican el 95 % de la varianza, y el uso de tokens por sí solo representa el 80 %[^S2]
- La factura es la otra cara del mismo balance: según sus datos, los agentes son unas 4× los tokens de un chat, el multiagente unas 15×, y para ser viable económicamente el valor de la tarea debe ser lo bastante alto como para pagarlo[^S2]
- Cada subagente necesita un objetivo, un formato de salida, guía sobre las herramientas y fuentes a usar, y límites claros de la tarea; sin descripciones detalladas de la tarea, los agentes duplican trabajo, dejan huecos, o no logran encontrar la información necesaria[^S2]—los «prompts de delegación autocontenidos» del curso 6 se expanden en estos cuatro puntos
- A los agentes les cuesta juzgar el esfuerzo apropiado, así que escribe las reglas de asignación en el prompt: su escala es búsqueda simple de datos 1 agente 3-10 llamadas, comparaciones directas 2-4 subagentes 10-15 llamadas cada uno, investigación compleja más de 10 subagentes con división clara[^S2]; sin reglas escritas ya vieron las consecuencias—lanzar 50 subagentes para consultas simples, rastrear la web sin fin buscando fuentes inexistentes, distraerse entre sí con actualizaciones excesivas[^S2]
- La ejecución síncrona simplifica la coordinación pero bloquea el flujo de información: el agente líder no puede reorientar sobre la marcha, los subagentes no se pueden coordinar, el sistema entero puede quedar bloqueado por un solo subagente[^S2]; lo asíncrono habilita más paralelismo, al costo de la coordinación de resultados, la consistencia de estado, y la propagación de errores entre los subagentes—estos tres son desafíos en los materiales primarios, no soluciones resueltas[^S2]
- Los sistemas multiagente tienen comportamientos emergentes; cambios pequeños en el agente líder pueden cambiar de forma impredecible el comportamiento de los subagentes; importa entender los patrones de interacción, no solo los agentes individuales[^S2]; la última milla a menudo se vuelve la mayor parte del viaje; los códigos base que funcionan en las máquinas de desarrollo requieren ingeniería significativa para volverse sistemas de producción confiables[^S2]; las prácticas que la acompañan son salvaguardas deterministas (lógica de reintento, puntos de control periódicos)[^S2] y despliegues arcoíris—desplazar el tráfico gradualmente manteniendo ambas versiones en ejecución, evitando interrumpir a los agentes en curso[^S2]
- Este es el más caro de los cuatro patrones aprendidos hasta ahora: antes de empezar, confirma que la descomposición verdaderamente no se puede predefinir (si se puede, vuelve al seccionamiento de la Lección 3), y después confirma que el valor de la tarea puede sostener 15×; si tienes dudas, usa la pista del curso 10 para medir primero una línea base—añade complejidad solo cuando mejora demostrablemente los resultados[^S1]

[>> Lección 5: El bucle de revisión, y componer patrones en un grafo](./05-evaluator-and-graphs.md)
