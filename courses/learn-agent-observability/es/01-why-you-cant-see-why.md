# Lección 1: Por qué no puedes decir qué salió mal

> Objetivos de aprendizaje:
> - Entender por qué un solo síntoma visible para el usuario puede esconder varias causas raíz indistinguibles entre sí
> - Explicar cómo el no determinismo rompe la intuición tradicional de depuración «reprodúcelo y pon un punto de interrupción»
> - Reconocer las distintas formas que toman los errores en sistemas de agentes: fallos en cascada, divergencia de trayectoria, acumulación entre turnos y emergencia multiagente
>
> Requisitos: Completar los primeros 10 cursos de esta serie, poder escribir a mano un bucle de arnés gobernado por `stop_reason`, entender que la vía de evaluación solo te da aprobado/fallido | Siguiente: [Lección 2 >>](./02-transcripts-as-evidence.md)

## Un martes por la tarde que no puedes explicar

Tu agente de investigación interno lleva dos semanas en producción. El martes por la tarde, el equipo de operaciones te reenvía un reporte de un usuario:

> Le pedí que buscara nuestro plan de precios del año pasado. Dijo que no encontraba nada. Pero ese documento está ahí mismo, en la base de conocimiento — a mí me tomó dos segundos abrirlo.

Abres la sesión. Dos cosas en pantalla: la pregunta del usuario y la respuesta final del agente, «No encontré materiales relevantes». ¿Qué pasó en medio? No tienes nada.

Así que empiezas a adivinar.

¿Construyó una mala consulta de búsqueda — por ejemplo, tomar la pregunta del usuario en lenguaje natural y meterla entera y literal en la recuperación en lugar de extraer palabras clave? ¿O quizá encontró resultados pero eligió las fuentes equivocadas, leyendo los dos resultados menos relevantes de ocho y concluyendo «aquí no hay nada»? ¿O la herramienta de recuperación lanzó un error, y el agente interpretó el fallo como «no hay información en esta dirección» y siguió de largo?

Las tres conjeturas se ven idénticas desde el lado del usuario: el agente no puede encontrar información que está obviamente ahí.

Esto no te pasa solo a ti. Cuando el equipo de Anthropic hizo una retrospectiva de su sistema multiagente de investigación, anotaron exactamente el mismo problema: los usuarios reportaban que los agentes «no encontraban información obvia», pero ellos no podían ver por qué. ¿Los agentes estaban usando malas consultas de búsqueda? ¿Eligiendo fuentes de baja calidad? ¿Topándose con fallos de herramientas?[^S1] Las mismas tres preguntas, sin respuestas.

## La vía de evaluación solo responde «¿se rompió?»

Tu primer instinto probablemente sea abrir el sistema que construiste en el curso anterior (el Curso 10 de esta serie): calificación del estado final, validadores, conjuntos de evaluación. Ese es el primer paso correcto. Agregas esta pregunta real del usuario al conjunto de evaluación, escribes un criterio «la respuesta debe citar el documento de precios» y lo ejecutas.

Resultado: una línea roja. `fail`.

Esa línea roja sirve — convierte una queja subjetiva en un veredicto reproducible y testeable frente a regresiones. Pero no responde la pregunta que de verdad necesitas responder ahora mismo: por qué. El calificador mira el estado final. El estado final es «no citó el documento». Si ese «no citó» vino de una mala consulta, de la selección de fuentes o de un error de herramienta que se tragó — al calificador no le importa ni tiene manera de que le importe. Se queda en la meta levantando una tarjeta de puntuación.

Este curso llena la parte del medio. Con un marco que este curso acuñó:

> **La verificación te dice si se rompió. La observabilidad te dice por qué.**

Esta no es una frase de ninguna documentación oficial — es el encuadre de este curso para amarrar las siguientes cinco lecciones, respaldado por dos experiencias reales. Una viene de esa retrospectiva del sistema multiagente: agregar trazado completo en producción les permitió diagnosticar por qué fallaban los agentes y arreglar los problemas de forma sistemática[^S1]. La otra viene del lado de la ingeniería de herramientas: analizar las transcripciones crudas que deja tu agente de evaluación puede ayudarte a sondear por qué los agentes llaman o no llaman ciertas herramientas[^S3]. Ambas frases apuntan a lo mismo — solo cuando el proceso deja un rastro puedes preguntar «por qué».

```agentmentor-check
{
  "id": "obs-zh-01-rerun-to-reproduce",
  "label": "¿Puedes reproducir volviendo a ejecutar?",
  "prompt": "Una ejecución en producción falló. Tu colega dice: «Vuelve a ejecutarlo con la misma entrada — una vez que lo reproduzcamos podemos localizar el problema». ¿Funciona este enfoque con agentes?",
  "whyHere": "Este es el primer reflejo que casi todo el mundo arrastra desde la depuración tradicional, y también es la base que la siguiente sección desarma. Respóndelo por tu cuenta antes de seguir leyendo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Funciona. Ejecútalo suficientes veces y tarde o temprano caerás en el mismo camino. Es como rastrear un bug intermitente de concurrencia.",
      "correct": false,
      "feedback": "Los bugs intermitentes de concurrencia al menos se ejecutan sobre el mismo código determinista — ejecútalo suficientes veces y sí tienes chance de dar con el fallo. Los agentes son distintos: toman decisiones en cada paso. Incluso con condiciones iniciales idénticas, lo más probable es que caigas en un camino diferente pero igual de válido."
    },
    {
      "id": "b",
      "text": "No funciona. El interior de un agente es fundamentalmente inobservable. Cuando algo se rompe solo puedes ajustar el prompt y ver qué pasa — es prueba y error hasta converger.",
      "correct": false,
      "feedback": "La primera mitad es correcta, la segunda está muy mal. Reproducir no funciona, pero eso no significa que no haya evidencia — las solicitudes al modelo, los parámetros de herramienta y las respuestas de herramienta de la ejecución que falló se pueden registrar todos. Las siguientes cinco lecciones cubren cómo registrarlos y cómo leerlos."
    },
    {
      "id": "c",
      "text": "No funciona. Incluso con prompts idénticos, dos ejecuciones pueden tomar caminos diferentes pero igual de válidos. Para reconstruir qué pasó necesitas los registros que esa ejecución específica dejó atrás.",
      "correct": true,
      "feedback": "Correcto. Los puntos de interrupción dan por sentado que «la segunda ejecución llegará a la misma línea». Los agentes no lo garantizan. Así que el centro de gravedad de la depuración se desplaza de «ejecútalo otra vez» a «qué dejó atrás la última ejecución» — y ese es el problema que resuelve la observabilidad."
    }
  ]
}
```

## Por qué «reprodúcelo y pon un punto de interrupción» no funciona aquí

Primero, definiciones. Un sistema **determinista** significa: dale la misma entrada y produce la misma salida cada vez. Un sistema **no determinista** es lo contrario — los agentes son sistemas de este tipo. En computación, los sistemas deterministas producen la misma salida cada vez ante entradas idénticas, mientras que los sistemas no deterministas —como los agentes— pueden generar respuestas variadas incluso con las mismas condiciones iniciales[^S3].

Esto le quita el piso a la depuración tradicional. Los agentes toman decisiones dinámicas y son no deterministas entre ejecuciones, incluso con prompts idénticos. Eso hace más difícil depurarlos[^S1]. Las evaluaciones tradicionales suelen suponer que la IA sigue los mismos pasos cada vez: dada la entrada X, el sistema debería seguir el camino Y para producir la salida Z. Pero los sistemas multiagente no funcionan así. Incluso con puntos de partida idénticos, los agentes podrían tomar caminos válidos completamente diferentes para llegar a su meta[^S1].

Así se ve en la práctica:

```text
Misma pregunta, misma versión del prompt, dos ejecuciones

Ejecución A                                   Ejecución B
1 search("plan de precios 2024")              1 search("plan de precios 2024 docs internos")
2 read_doc(doc_17)                            2 search("archivo de precios")
3 respond (cita doc_17)                       3 read_doc(doc_09)
                                              4 read_doc(doc_17)
                                              5 respond (cita doc_17 y doc_09)
```

Ninguno de los dos caminos está mal, y ambos estados finales pasarían. Pero si el fallo ocurrió en el paso 2 de la Ejecución A, y vuelves a ejecutar diez veces y obtienes nueve Ejecuciones B, esas nueve ejecuciones no te sirven.

Los puntos de interrupción son igual de inútiles. Un punto de interrupción se para sobre una línea de código, con la condición previa de que «la segunda ejecución llegará a esta línea con el mismo contexto». Pero donde los agentes se equivocan a menudo no es en tu código — es en una decisión del modelo. Y aunque quisieras pausar, no sabrías en qué turno pausar: esta vez se rompe en el turno 3, la próxima vez quizá en el turno 11, o quizá no se rompa nada.

Podrías pensar en bajar la temperatura de muestreo o en grabar y reproducir las respuestas de herramienta. Estas técnicas de ingeniería sí reducen algo del ruido, y este curso no te desaconseja usarlas. Pero cambian la ejecución que estás haciendo en tu laboratorio, no la que ya falló en producción — esa se fue, y lo único que dejó atrás son sus registros.

El equipo de Anthropic tomó un camino distinto. Lo llaman «pensar como tus agentes»: construir una simulación usando exactamente los mismos prompts y herramientas del sistema, y después observar a los agentes trabajar paso a paso. Esto reveló de inmediato modos de fallo: agentes que seguían adelante cuando ya tenían resultados suficientes, que usaban consultas de búsqueda demasiado verbosas o que seleccionaban herramientas incorrectas[^S1].

La clave no es «reproducir la misma ejecución» — es «ver cada paso». Ahí es donde la observabilidad se separa de la depuración tradicional.

## Los errores que lanzan los agentes vienen en distintas formas

Aunque aceptes que «necesitas registros», hay otra capa por entender: la forma de los errores en sistemas de agentes no es la misma que la de los bugs tradicionales.

En el software tradicional, un bug podría romper una funcionalidad, degradar el rendimiento o provocar caídas. En los sistemas agénticos, cambios menores se propagan en cascada hasta convertirse en cambios grandes de comportamiento, lo que hace notablemente difícil escribir código para agentes complejos que deben mantener estado en un proceso de larga duración[^S1].

Dentro de una sola ejecución, la forma más típica es la **divergencia de trayectoria**. Los agentes tienen estado y los errores se acumulan. La naturaleza acumulativa de los errores en sistemas agénticos significa que problemas menores para el software tradicional pueden descarrilar por completo a los agentes. Que un paso falle puede hacer que los agentes exploren trayectorias completamente distintas, llevando a resultados impredecibles[^S1].

```text
Turno 3: la búsqueda expira, la herramienta devuelve "Error: upstream timeout"
         ↓
El agente lo lee como "no hay información en esta dirección"
         ↓
Cambia a un ángulo de recuperación completamente distinto
         ↓
Los siguientes 12 turnos crecen todos sobre esta rama equivocada
         ↓
Estado final: un informe aparentemente completo, todas las fuentes de material tangencial
```

Fíjate en lo pequeño que es el primer eslabón de esa cadena: un solo timeout. En un servicio tradicional podría ser apenas una línea de log de reintento. Aquí reescribe los siguientes doce turnos, y el informe del estado final no da error, no se cae, se lee perfectamente fluido.

La segunda forma es la **acumulación entre turnos**. Los agentes tienen estado y los errores se acumulan. Los agentes pueden ejecutarse durante períodos largos, manteniendo estado a lo largo de muchas llamadas a herramientas. Esto significa que necesitamos ejecutar código de forma durable y manejar los errores en el camino[^S1]. Por eso tampoco puedes simplemente reiniciar desde el principio cuando ocurren errores: los reinicios son caros y frustrantes para los usuarios. En su lugar, construyeron sistemas que pueden reanudar desde donde estaba el agente cuando ocurrieron los errores[^S1]. La implicación para ti es directa: si el estado al momento del fallo no quedó registrado, la pregunta «desde dónde reanudar» no tiene respuesta.

La tercera forma solo aparece en sistemas multiagente: el **comportamiento emergente**. Los sistemas multiagente tienen comportamientos emergentes, que surgen sin haber sido programados específicamente. Por ejemplo, cambios pequeños en el agente líder pueden cambiar de forma impredecible cómo se comportan los subagentes. El éxito requiere entender los patrones de interacción, no solo el comportamiento de agentes individuales[^S1].

Sobre cómo se ven estas formas cuando convergen todas, la versión temprana de ese equipo dio una respuesta muy directa: los agentes tempranos cometían errores como lanzar 50 subagentes para consultas simples, rastrear la web sin parar buscando fuentes inexistentes y distraerse entre sí con actualizaciones excesivas[^S1].

Estos tres tipos de error tienen algo en común: vistos desde afuera, el estado final podría verse simplemente como «la calidad de la respuesta está regular». No puedes distinguir cuál de los tres es.

## Las capas de abstracción esconden la evidencia

Hay otra capa de problema, y no viene del modelo — viene de tus herramientas.

Los frameworks de agentes facilitan arrancar porque simplifican tareas estándar de bajo nivel como llamar a los LLM, definir y parsear herramientas y encadenar llamadas. Sin embargo, a menudo crean capas extra de abstracción que pueden ocultar los prompts y las respuestas subyacentes, haciéndolos más difíciles de depurar[^S2]. Por eso el consejo a los desarrolladores es: empieza usando las API de LLM directamente — muchos patrones se pueden implementar en unas pocas líneas de código. Si usas un framework, asegúrate de entender el código subyacente. Las suposiciones incorrectas sobre lo que hay debajo del capó son una fuente común de error del cliente[^S2]. (Ese artículo incluye una nota editorial que dice que su descripción del ecosistema de herramientas está desactualizada, así que aquí citamos los principios, no lo tratamos como guía vigente de selección.)

Para ti, esto en realidad es una buena noticia. Escribiste a mano el bucle del arnés en el Curso 7 de esta serie. No tienes esa capa de abstracción:

```javascript
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  // Lo que pasa por esta línea: nombre de herramienta, parámetros, cuerpo de respuesta, duración, errores
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ model, max_tokens, tools, messages });
  // Lo que pasa por esta línea: qué número de solicitud, cuánto tardó, cuántos tokens, qué stop_reason
}
```

La evidencia fluye por este bucle cada vez, sin falta. El problema es que después de fluir, se fue. No tienes obstrucción, pero tampoco tienes retención — desde la perspectiva de pedir evidencia después del hecho, esas dos cosas duelen igual.

Así que el diagnóstico de este curso es: la mitad de la dificultad de depurar agentes viene del hecho objetivo del no determinismo, y la otra mitad viene de que «cosas que se podían haber registrado no se registraron». La primera mitad no se puede cambiar. La segunda está en tus manos.

## El camino adelante: qué te dan las siguientes cinco lecciones

El equipo de ese sistema multiagente puso esto al mismo nivel que la ingeniería de prompts y el diseño de herramientas: lograrlo bien depende de un prompting y un diseño de herramientas cuidadosos, heurísticas sólidas, observabilidad y ciclos de retroalimentación estrechos[^S1]. La retrospectiva tiene una frase todavía más directa — se enfocaron en un ciclo de iteración rápido con observabilidad y casos de prueba[^S1].

Fíjate en la mitad de «casos de prueba»: la observabilidad no viene a reemplazar la vía de evaluación. Son los dos extremos de la misma vara de carga. La evaluación te dice si esta ejecución se rompió y si el cambio mejoró las cosas. La observación te dice por qué se rompió esta ejecución y qué parte cambiar.

Las siguientes cinco lecciones avanzan en este orden:

- La **Lección 2** pone los cimientos: los registros crudos son la evidencia de primera mano. Lo que el agente dice sobre sí mismo no cuenta — lo que omite suele ser más importante que lo que incluye.
- La **Lección 3** convierte cada paso en datos: logs estructurados y métricas. Las mismas métricas que el Curso 10 usó para calificar, este curso las usa para diagnosticar.
- La **Lección 4** hilvana los registros dispersos en un árbol: leer como una sola unidad todas las solicitudes al modelo y ejecuciones de herramienta que disparó un prompt, con las llamadas a subagentes anidadas dentro del padre.
- La **Lección 5** instala sondas en los puntos de control del ciclo de vida del bucle y recorre el flujo de localizar-bajo-no-determinismo: encontrar la primera divergencia dentro de un montón de registros.
- La **Lección 6** es práctica: instalar una capa de observabilidad completa sobre el arnés que escribiste en el Curso 7, y trazar desde un síntoma que «no puedes explicar» hasta el paso específico que divergió.

Esta lección solo los nombra sin desarrollarlos: cómo leer registros es trabajo de la Lección 2, cómo diseñar métricas es de la Lección 3, qué estructura tiene una traza es de la Lección 4.

## Cuándo no necesitas el stack completo

No todos los agentes necesitan todo esto. Un script de una sola vez —lo ejecutas una vez, le echas un ojo a la salida, lo borras— darle logs, métricas y trazas es puro desperdicio.

El criterio de juicio es simple: **la inversión en observabilidad debería ser proporcional a «cuánto te tomaría explicar por qué después de que algo se rompa».** Si lo ejecutas tú, lo miras tú, y no cuesta nada volver a ejecutarlo cuando falla, no registres. Si lo usa alguien más, si se ejecuta largo, si gastarías medio día escarbando transcripciones de chat cuando falle, registra desde el día uno.

Hay una línea que no tiene nada que ver con la escala: si el agente puede tomar acciones —escribir archivos, enviar solicitudes, gastar dinero— no te saltes las pruebas. La naturaleza autónoma de los agentes implica costos más altos y potencial de errores acumulativos. Recomendamos pruebas extensivas en entornos aislados, junto con los guardrails apropiados[^S2].

En cuanto a saber si lo hiciste bien: la clave del éxito, como con cualquier funcionalidad de LLM, es medir el rendimiento e iterar sobre las implementaciones[^S2]. Y la condición previa para medir es tener algo que medir — lo cual vuelve al problema que este curso resuelve.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Un síntoma, tres causas indistinguibles

No se requiere código. Abajo hay tres síntomas con los que te toparías en producción, cada uno con solo la información visible desde el lado del usuario:

1. El informe de investigación del agente cita un archivo llamado `docs/pricing-2024.md`, pero ese archivo no existe en absoluto en el repositorio.
2. La misma tarea de archivado tomó 12 turnos ayer y terminó. Hoy llegó al turno 47 antes de detenerse, con más o menos el mismo resultado.
3. El usuario pregunta «ayúdame a revisar cuántas veces aparece este error en nuestro código», y el agente responde con una explicación larga de qué significa el error.

Para cada síntoma:

- Lista **al menos tres** causas candidatas que sean indistinguibles desde afuera.
- Para cada causa candidata, escribe «para confirmar que es esta y descartar las otras dos, necesito ver qué evidencia» — sé específico hasta el nivel de campo. «Revisa los logs» no es una respuesta.

<!-- rubric -->

- Cada síntoma tiene al menos tres causas candidatas, y caen en etapas distintas (la decisión del modelo, la entrada y salida de la herramienta, el flujo de control o el manejo de contexto del arnés), no tres reformulaciones de la misma causa.
- Cada causa candidata viene emparejada con evidencia lo bastante específica como para decir «mira qué turno, qué registro, qué campo», no respuestas genéricas como «mira los logs».
- Cada síntoma explica: cuando solo tienes la salida final, por qué estas causas son indistinguibles entre sí — en otras palabras, explica por qué la evidencia de proceso no es negociable.

<!-- answer -->

**Síntoma 1: el informe cita un nombre de archivo inexistente**

- Etapa de decisión del modelo: las herramientas de recuperación devolvieron archivos que eran todos reales, pero al escribir el informe el modelo mezcló nombres de archivo o inventó uno siguiendo las convenciones de nombres. Evidencia — lista los parámetros de cada llamada a `read_file` / `read_doc` de esa ejecución y revisa si este nombre de archivo alguna vez apareció como parámetro. Si nunca apareció, se fabricó durante la generación.
- Etapa de entrada/salida de herramienta: la herramienta de recuperación sí devolvió este nombre porque el índice se construyó hace tres semanas y el archivo se renombró o borró después. Evidencia — mira el cuerpo de respuesta crudo del `search` de ese turno y ve si trae este nombre de archivo.
- Etapa de flujo de control: al leer el archivo la herramienta lanzó «no existe», pero el arnés se tragó la excepción y solo puso una cadena vacía en `tool_result`, así que el modelo siguió con su suposición previa. Evidencia — mira si el contenido de `tool_result` de ese turno está vacío y si trae un marcador de error.
- Por qué son indistinguibles: los tres caminos terminan con el mismo informe conteniendo el mismo nombre de archivo falso, y ningún campo los separa.

**Síntoma 2: 12 turnos se volvieron 47 turnos**

- Etapa de decisión del modelo: los resultados de recuperación de hoy estaban más fragmentados, así que el modelo probó formulaciones distintas una y otra vez. Evidencia — lista el nombre de herramienta y los parámetros del `tool_use` de cada turno y revisa si se llamó a la misma herramienta una docena de veces con distinta redacción.
- Etapa de entrada/salida de herramienta: el tamaño de página o el límite de retorno de una herramienta cambió hoy, así que no pudo traer todo de una y tuvo que hacer varios viajes. Evidencia — compara el tamaño del cuerpo de respuesta y el conteo de llamadas de la misma herramienta entre ambos días.
- Etapa de flujo de control: un paso falló, así que el agente cambió de rama y rehizo la primera mitad del trabajo. Evidencia — alinea ambas ejecuciones por número de turno, encuentra el **primer** paso que difiere y mira solo la respuesta de herramienta de ese turno.
- Por qué son indistinguibles: ambos estados finales son «tarea completada, tardó un poco más». El conteo de turnos es solo un agregado; no te dice dónde crecieron los 35 turnos extra.

**Síntoma 3: respondió la pregunta equivocada**

- Etapa de decisión del modelo: el modelo interpretó «cuántas veces aparece» como «qué significa». Evidencia — revisa si llamó a la herramienta de recuperación en el turno 1, o si simplemente empezó a generar una respuesta.
- Etapa de entrada/salida de herramienta: la herramienta de recuperación dio error o devolvió vacío, así que el modelo recurrió a responder desde su conocimiento paramétrico. Evidencia — el contenido de `tool_result` de ese turno y sus marcadores de error.
- Etapa de contexto: el historial previo a este turno se truncó o comprimió, así que el calificativo del usuario «en nuestro código» ya no estaba presente en los `messages` realmente enviados. Evidencia — mira los `messages` enviados en esa solicitud, no los que creías haber enviado.
- Por qué son indistinguibles: en los tres casos el usuario recibe texto «fuera de tema pero que se lee fluido». Para distinguirlos necesitas ver tanto «qué entró» como «qué volvió».

<!-- hint -->

Prepárate tres cajones: la decisión del modelo, la entrada y salida de la herramienta, el flujo de control y el manejo de contexto del arnés. El mismo síntoma suele tener una causa plausible en cada cajón. Si las tres causas caen en el mismo cajón, no has salido de tu primer reflejo.

<!-- hint -->

Al escribir la evidencia, oblígate a llegar al nivel de campo: no «revisa los logs», sino «revisa el contenido de `tool_result` de ese turno y si venía marcado como error». Si no puedes llegar al nivel de campo, significa que todavía no has descifrado qué dejar en los registros — que es exactamente lo que las Lecciones 2 y 3 te harán hacer en la práctica.

### Nivel 2: Desarmar paso a paso el flujo de depuración tradicional

No se requiere código. Abajo está el flujo de depuración de cuatro pasos que conoce todo ingeniero de backend:

```text
1 Reproducir                      Ejecuta el bug en local con la misma entrada
2 Poner un punto de interrupción  Detente en la línea sospechosa
3 Avanzar paso a paso             Línea por línea, mira cuándo se desvían las variables
4 Arreglar y verificar            Cámbialo y ejecuta de nuevo; verde significa arreglado
```

Para cada paso, responde dos preguntas:

- ¿Por qué falla con agentes? Ancla la razón en mecanismos específicos (no determinismo, divergencia de trayectoria, evidencia escondida o nunca registrada).
- ¿Cuál es el reemplazo correspondiente en el mundo de los agentes? Escribe solo la dirección —«qué evidencia obtener, organizada según qué dimensión»— la implementación concreta es trabajo de lecciones posteriores.

<!-- rubric -->

- Los cuatro pasos se tratan individualmente, cada uno con el por-qué-falla y la dirección de reemplazo escritos, incluido el Paso 4 «arreglar y verificar», que es fácil de saltarse.
- La razón del fallo está anclada en mecanismos específicos (no determinismo entre ejecuciones, un paso que falla y hace divergir toda la trayectoria, capas de abstracción o registros faltantes que esconden la evidencia), no en afirmaciones vagas como «porque los modelos son inciertos».
- La dirección de reemplazo dice «qué evidencia obtener y cómo organizarla», no «instala el producto de observabilidad X». Dar la dirección sin desarrollar los detalles de implementación también cuenta como aprobado.

<!-- answer -->

**Paso 1: Reproducir**

Razón del fallo: Los agentes son no deterministas entre ejecuciones, incluso con prompts idénticos. Incluso con puntos de partida idénticos, podrían tomar caminos válidos completamente diferentes para llegar a su meta. Lo ejecutas diez veces en local y probablemente nunca recorras el camino que tomó la ejecución que falló.

Dirección de reemplazo: Abandona la meta de «ejecutarlo otra vez» y haz que la ejecución que falla registre su proceso mientras ocurre. La evidencia a obtener son las solicitudes al modelo y las idas y vueltas de herramienta completas de esa ejecución — eso es contenido de la Lección 2.

**Paso 2: Poner un punto de interrupción**

Razón del fallo: Los puntos de interrupción se paran sobre líneas de código, pero donde los agentes se equivocan a menudo no es en tu código — es en una decisión del modelo. Y el bucle podría ejecutarse durante decenas de turnos; no sabes en qué turno pausar. Si además usas un framework que envuelve prompts y respuestas bajo capas de abstracción, ni siquiera puedes ubicar qué línea mirar.

Dirección de reemplazo: Cambia «pausar en una línea» por «registrar una entrada por paso», y después filtra por ID de correlación para sacar todos los registros que pertenecen a un prompt. En qué punto exacto del ciclo de vida del bucle colgar las sondas es contenido de las Lecciones 3 y 5.

**Paso 3: Avanzar paso a paso**

Razón del fallo: Avanzar paso a paso supone que los cambios de estado son locales y predecibles. Pero los agentes tienen estado y los errores se acumulan; que un paso falle puede hacer que toda la trayectoria diverja. El paso 5 que recorres a mano probablemente no sea la misma cosa que el paso 5 de la ejecución que falló.

Dirección de reemplazo: No leas una ejecución como una secuencia lineal de comandos; léela como un árbol — todas las solicitudes al modelo y ejecuciones de herramienta disparadas por un prompt agrupadas juntas, con la actividad de subagentes anidada dentro del padre. Lo que buscas no es «qué línea estaba mal» sino **la primera divergencia**: a partir de qué paso esta ejecución se volvió distinta de la exitosa. Cómo construir el árbol es contenido de la Lección 4; el flujo para encontrar la divergencia está en la Lección 5.

**Paso 4: Arreglar y verificar**

Razón del fallo: Una ejecución en verde no significa que esté arreglado, porque la siguiente ejecución podría tomar un camino distinto. Y los cambios menores se propagan en cascada hasta convertirse en cambios grandes de comportamiento; un ajuste pequeño en el agente principal puede cambiar de forma impredecible a los subagentes. Si solo miras que este caso se ponga en verde, es fácil confundir «esta vez no cayó en esa rama» con «arreglado».

Dirección de reemplazo: Después del cambio, vuelve al conjunto de evaluación y ejecuta en lote (el sistema del Curso 10 de esta serie), mirando al mismo tiempo si la distribución del comportamiento en los datos de observabilidad se movió — conteo de llamadas a herramientas, conteo de turnos, tasas de error. La evaluación responde «¿mejoraron las cosas en general?», la observación responde «¿la razón por la que mejoraron es la que yo creía?».

<!-- hint -->

En los cuatro pasos tradicionales, cada paso depende en secreto de una condición previa: reproducir depende de «la misma entrada debe recorrer el mismo camino», el punto de interrupción depende de «el problema está en alguna línea de código», avanzar paso a paso depende de «los cambios de estado son locales», verificar depende de «pasar una vez significa pasar». Escribe primero estas cuatro condiciones previas al pie de la letra, y después pregunta una por una si cada una sigue siendo válida para los agentes.

<!-- hint -->

La dirección de reemplazo no necesita escribirse como un plan de implementación. «Hace falta un registro completo de ida y vuelta alineado por turno» es una respuesta aprobatoria. También lo es «hace falta agrupar juntas todas las solicitudes disparadas por el mismo prompt». Cómo aterrizarlo concretamente es trabajo de lecciones posteriores; este ejercicio solo evalúa si puedes articular el requisito con claridad.

<!-- /exercises -->

## Resumen

- Un solo síntoma visible para el usuario suele esconder varias causas completamente indistinguibles desde afuera. Cuando los usuarios reportan que los agentes «no encuentran información obvia», no puedes distinguir si son malas consultas de búsqueda, mala selección de fuentes o fallos de herramientas[^S1].
- La vía de evaluación responde «¿se rompió?». Este curso usa un encuadre que acuñó para aclarar la división del trabajo: la verificación te dice si se rompió, la observabilidad te dice por qué. Lo respaldan dos experiencias reales — agregar trazado completo en producción les permitió diagnosticar fallos y arreglar de forma sistemática[^S1], y leer transcripciones crudas puede ayudarte a sondear por qué los agentes llaman o no llaman ciertas herramientas[^S3].
- «Reproducir y poner un punto de interrupción» falla porque los agentes toman decisiones dinámicas y son no deterministas entre ejecuciones, incluso con prompts idénticos[^S1]. Los sistemas deterministas dan la misma salida ante la misma entrada; los agentes, como sistemas no deterministas, no lo garantizan[^S3]. La suposición de la evaluación tradicional —«la entrada X sigue el camino Y y produce la salida Z»— tampoco se sostiene. Puntos de partida idénticos pueden producir caminos válidos completamente diferentes[^S1].
- Las formas de error de los agentes difieren de los bugs tradicionales: en el software tradicional los bugs rompen una funcionalidad, pero en los sistemas agénticos los cambios menores se propagan en cascada hasta convertirse en cambios grandes de comportamiento, lo que hace notablemente difícil escribir código para agentes complejos que deben mantener estado[^S1]. Que un paso falle puede hacer que los agentes exploren trayectorias completamente distintas, llevando a resultados impredecibles[^S1]. Los agentes tienen estado y los errores se acumulan, así que necesitas ejecutar de forma durable y manejar los errores en el camino[^S1]. Los sistemas multiagente además tienen comportamientos emergentes — cambios pequeños en el agente líder pueden cambiar de forma impredecible el comportamiento de los subagentes; lo que necesitas entender son los patrones de interacción, no solo los individuos[^S1]. La versión temprana llegó a lanzar 50 subagentes para consultas simples, a rastrear la web sin parar buscando fuentes inexistentes y a distraerse entre sí con actualizaciones excesivas[^S1].
- Las capas de abstracción esconden la evidencia: los frameworks a menudo crean capas extra de abstracción que pueden ocultar los prompts y las respuestas subyacentes, haciéndolos más difíciles de depurar[^S2]. El consejo es empezar con las API de LLM directamente y, si usas un framework, entender el código de abajo[^S2]. Tu arnés escrito a mano no tiene obstrucción, pero tampoco retención.
- El camino adelante es tratar la observabilidad y los ciclos de retroalimentación estrechos como requisitos de primer nivel[^S1], integrados en un ciclo de iteración rápido con observabilidad y casos de prueba[^S1]. Las siguientes cinco lecciones en secuencia: registros crudos, logs y métricas, trazas, hooks y flujo de localización, instalación práctica.
- Juicio sobre el alcance: los scripts de una sola vez no necesitan el stack completo. Pero si el agente puede tomar acciones, haz pruebas extensivas en entornos aislados con los guardrails apropiados[^S2]. Saber si lo hiciste bien depende de medir el rendimiento e iterar sobre las implementaciones[^S2].

[Lección 2 >>](./02-transcripts-as-evidence.md)
