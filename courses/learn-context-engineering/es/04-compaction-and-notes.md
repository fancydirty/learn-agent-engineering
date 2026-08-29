# Lección 4: Compactación y notas: gestión de contexto para tareas largas

> Objetivos de aprendizaje:
> - Enunciar qué es la compactación y cómo se implementa: cuando una conversación se acerca al límite de la ventana, se le entrega el historial de mensajes al modelo para que lo resuma y luego se reinicia una ventana nueva a partir de ese resumen
> - Escribir la instrucción de resumen y la lista de qué conservar y qué descartar de una compactación, siguiendo la regla: preservar decisiones arquitectónicas y bugs sin resolver, descartar resultados de herramientas redundantes
> - Distinguir los papeles de la compactación y de las notas estructuradas, y diseñar un esquema de notas escritas sobre la marcha para un agente de tarea larga
>
> Requisitos: Terminaste las Lecciones 1 a 3 de este curso y sabes escribir a mano el bucle del arnés del curso 7 de esta serie, «Fundamentos del arnés de agente: bucles y control» | Anterior: [Lección 3 <<](./03-just-in-time-context.md) | Siguiente: [Lección 5 >>](./05-subagent-context-isolation.md)

## Una tarea que una sola ventana no aguanta

Empecemos por una escena con la que vas a toparte pronto. Tomas el arnés que escribiste a mano en el curso 7 de esta serie, «Fundamentos del arnés de agente: bucles y control», y lo apuntas a una tarea de depuración: arreglar una condición de carrera que solo aparece bajo concurrencia. El agente lee archivos, ejecuta pruebas, edita código, vuelve a ejecutar las pruebas — cuarenta y tantos turnos después la tarea sigue sin terminar, pero el historial de mensajes se ha hinchado más allá de los cien mil tokens y la ventana está a punto de llenarse.

Las cuatro válvulas de control del curso 7 (turnos máximos, presupuesto, detección de giro en vacío, la válvula de aprobación) no sirven de nada aquí. Gobiernan el «no dejes que el bucle se desboque», pero el bucle se está portando bien: la tarea misma es simplemente larga. Eso no es un accidente; es la naturaleza del bucle: "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"[^S1] (un agente que se ejecuta en un bucle genera cada vez más datos que podrían ser relevantes para el siguiente turno de inferencia) — resultados de herramientas, conclusiones intermedias, intentos fallidos, todo amontonándose en el historial de mensajes.

Y la ventana no es gratis. Un modelo que analiza grandes volúmenes de contexto echa mano de un «presupuesto de atención», y "Every new token introduced depletes this budget by some amount."[^S1] (cada nuevo token introducido agota ese presupuesto en cierta medida). Cuantos más tokens se acumulan, peor se le da al modelo recordar con precisión: "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"[^S1] (a medida que aumenta el número de tokens en la ventana de contexto, la capacidad del modelo de recordar con precisión información de ese contexto disminuye) — una pendiente suave hacia abajo más que un precipicio, pero cuesta abajo al fin y al cabo, así que "context, therefore, must be treated as a finite resource with diminishing marginal returns."[^S1] (el contexto, por tanto, debe tratarse como un recurso finito con rendimientos marginales decrecientes). La documentación de buenas prácticas de Claude Code lo dice de forma más directa — "Claude's context window fills up fast, and performance degrades as it fills," y "The context window is the most important resource to manage."[^S4] (la ventana de contexto de Claude se llena rápido y el rendimiento se degrada a medida que se llena; la ventana de contexto es el recurso más importante que hay que gestionar).

Cuando una tarea se alarga más de lo que una sola ventana aguanta, tienes dos armas: la compactación y las notas estructuradas. Esta lección trabaja las dos.

## Compactación: resumir y luego abrir una ventana nueva

La compactación es exactamente lo que dice el nombre: "taking a conversation nearing the context window limit, summarizing its contents, and reinitiating a new context window."[^S1] (tomar una conversación que se acerca al límite de la ventana de contexto, resumir su contenido y reiniciar una ventana de contexto nueva). Fíjate en la última parte: no metes el resumen de vuelta en la conversación vieja para seguir apretujando; reinicias. La ventana vieja se abandona entera y la nueva viaja ligera, cargando solo el prompt del sistema y el resumen.

La implementación es más llana de lo que suena: es "passing the message history to the model to summarize and compress the most critical details."[^S1] (pasarle el historial de mensajes al modelo para que resuma y comprima los detalles más críticos). Lo que significa que la compactación es en sí misma una llamada extra al modelo. En código se ve más o menos así (`formatHistory` solo une el arreglo de mensajes en texto plano legible; se omite la implementación):

```javascript
const COMPACT_INSTRUCTION = `Abajo está el registro de trabajo completo de un agente hasta ahora.
Comprímelo en un resumen de traspaso para que una sesión totalmente nueva continúe esta tarea.
El resumen debe conservar:
1. Las decisiones arquitectónicas ya tomadas y el razonamiento detrás de ellas
2. Los problemas todavía sin resolver (bugs, errores, puntos de atasco) y hasta dónde ha
   llegado la investigación
3. Los detalles clave de implementación de los cambios ya hechos (qué archivos y funciones
   cambiaron, y por qué)
Lo siguiente se puede descartar, o reducir a una conclusión de una línea:
- Resultados de herramientas redundantes (retornos crudos de leer el mismo archivo una y otra vez,
  o de repetir las mismas pruebas)
- La crónica completa de los intentos intermedios que después se descartaron
`;

async function compact(client, messages) {
  const resp = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: COMPACT_INSTRUCTION + "\n\n" + formatHistory(messages),
    }],
  });
  const summary = resp.content[0].text;
  // Reiniciar: el historial de la ventana nueva es solo este resumen (el arnés deja el prompt del sistema tal cual)
  return [{
    role: "user",
    content: "Aquí tienes un resumen de traspaso del trabajo previo; continúa desde aquí:\n\n" + summary,
  }];
}
```

Empalmarlo en aquel bucle del curso 7 requiere una sola idea más: al inicio de cada turno, revisa el uso de tokens del historial de mensajes y, en cuanto se acerque al límite, llama a `compact()` y reemplaza el arreglo `messages` entero con el valor de retorno. Construir esto de verdad dentro del arnés — cómo fijar el umbral de disparo, qué hacer cuando la compactación falla — es el material práctico de la Lección 6; por ahora, basta con tener clara la mecánica.

## El arte de la compactación: qué conservar, qué descartar

La parte difícil de la compactación no es «cómo resumir», sino «qué conservar y qué descartar». La dirección en realidad está clara: "preserves architectural decisions, unresolved bugs, and implementation details while discarding redundant tool outputs."[^S1] (preserva decisiones arquitectónicas, bugs sin resolver y detalles de implementación, mientras descarta resultados de herramientas redundantes).

¿Por qué esa disyuntiva? Imagina al agente «despertando» en la ventana nueva; ese resumen es toda su memoria. El costo de comprimir en la dirección equivocada es concreto: digamos que tu instrucción de resumen solo dice «resume brevemente el contenido de la conversación», y el modelo deja caer sin darle importancia que «hay una condición de carrera sin terminar en `orders/service.js`» — el agente despierta viendo únicamente registros marcados como «completo», así que o declara el trabajo terminado o hurga en cosas que ya arreglaste. Una compactación, y cuarenta turnos de trabajo se acaban de descarrilar.

Dale la vuelta: los resultados de herramientas redundantes es el blanco más jugoso. Un grep devuelve 200 líneas coincidentes; la señal útil ya quedó capturada en la conclusión del paso siguiente, «acotado a la función `updateStatus`». Las 200 líneas crudas que se quedan ahí solo queman presupuesto de atención y no le agregan casi ningún valor de decisión al siguiente movimiento.[^S1]

Una autocomprobación práctica: después de escribir la instrucción de resumen, toma una conversación larga real y compáctala una vez; luego responde tres preguntas usando solo el resumen — «qué debería pasar a continuación», «qué decisiones están cerradas», «qué huecos siguen sin tapar». Si las tres salen limpias, las reglas de conservar y descartar de tu instrucción aprueban; si alguna se queda en blanco, vuelve y parchea esa regla de conservación.

```agentmentor-check
{
  "id": "ctx-zh-04-compaction-tradeoff",
  "label": "Juzgar qué información hay que preservar al compactar una conversación larga",
  "prompt": "Un agente de depuración lleva 50 turnos y la ventana de contexto se acerca a su límite. El arnés está a punto de disparar la compactación. Estás escribiendo la instrucción de resumen: ¿qué clase de información tendrías que exigirle explícitamente que conserve?",
  "whyHere": "La sección anterior acaba de plantear el principio de conservar y descartar: preservar decisiones arquitectónicas y bugs sin resolver, descartar resultados de herramientas redundantes. Esto comprueba si quien lee sabe aplicar esa regla a un escenario concreto, en lugar de tratar la compactación como un «conservarlo todo» o un «borrarlo todo» indiferenciados.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Preservar el original literal de los resultados de herramientas de los 50 turnos, asegurando cero pérdida de información",
      "correct": false,
      "feedback": "No exactamente. El sentido entero de la compactación es liberar espacio en la ventana; conservar el original completo significa que no hubo compactación. Los resultados de herramientas redundantes (como los retornos crudos de leer el mismo archivo una y otra vez) es justo lo que el principio de conservar y descartar manda tirar: quema presupuesto de atención, y cualquier conclusión útil ya se asentó en los registros de decisión posteriores."
    },
    {
      "id": "b",
      "text": "No hace falta clasificar: basta con conservar el original literal de los últimos 10 turnos y borrar físicamente todo lo anterior; es más rápido y ahorra una llamada de resumen",
      "correct": false,
      "feedback": "No exactamente. Eso es truncado, no compactación. Un corte por tiempo elimina físicamente las decisiones arquitectónicas tomadas al principio y los registros de problemas todavía sin resolver, que pueden no aparecer en los últimos 10 turnos. La definición de compactación es «resumir y luego reiniciar»: dejar que el modelo juzgue qué se queda, permitiendo que la información clave sobreviva en forma de resumen, no descartarla por posición."
    },
    {
      "id": "c",
      "text": "Bugs todavía sin arreglar y decisiones arquitectónicas ya tomadas",
      "correct": true,
      "feedback": "Correcto. La compactación pierde información; la clave es que la pérdida caiga sobre lo redundante y no sobre lo que importa. Los problemas sin resolver y las decisiones cerradas son el mínimo apoyo que el agente necesita para seguir trabajando en la ventana nueva: si pierde los primeros, creerá que la tarea está terminada; si pierde las segundas, volverá a debatir desde cero opciones ya zanjadas."
    }
  ]
}
```

## La compactación en producción: autocompactación y /clear

La herramienta que usas a diario tiene una referencia lista. Claude Code "automatically compacts conversation history when you approach context limits, which preserves important code and decisions while freeing space"[^S4] (compacta automáticamente el historial de conversación cuando te acercas a los límites de contexto, lo que preserva código y decisiones importantes mientras libera espacio) — la misma mecánica del `compact()` escrito a mano de arriba, solo que productizada, con el disparo y las reglas de conservar y descartar ya resueltos.

Pero la compactación no es la única opción. Si estás cambiando a una tarea nueva **sin relación** con la anterior, el contexto viejo no solo es inútil: es dañino, porque "Long sessions with irrelevant context can reduce performance."[^S4] (las sesiones largas con contexto irrelevante pueden reducir el rendimiento). Llegado ese punto, la documentación dice "Run /clear between unrelated tasks to reset the context window entirely"[^S4] (ejecuta /clear entre tareas sin relación para reiniciar por completo la ventana de contexto) — sin resumir, sin preservar, un reinicio total. El razonamiento es simple: la compactación cuesta una llamada al modelo y carga con el riesgo de equivocarse al decidir qué conservar y qué descartar; para una tarea sin relación, limpiar de plano sale más barato y más limpio. La compactación sirve al «la misma tarea todavía no termina», mientras que `/clear` sirve al «ahora estoy haciendo otra cosa».

Esa documentación tiene además una línea que vale la pena tener a mano: "A clean session with a better prompt almost always outperforms a long session with accumulated corrections."[^S4] (una sesión limpia con un mejor prompt casi siempre supera a una sesión larga con correcciones acumuladas). Traducido: cuando el historial de una sesión es sobre todo «no, inténtalo otra vez» y «sigue mal», el valor histórico para el paso siguiente es probablemente negativo — reabrir una sesión y incorporar la lección directamente en un prompt nuevo suele ganarle a arrastrar todo ese lastre.

## Notas estructuradas: escribir el estado clave fuera de la ventana

La compactación tiene una debilidad de fábrica: es reactiva. Esperas a que la ventana esté casi llena y solo entonces miras atrás y resumes, así que lo que sobrevive depende por entero del juicio de ese momento — y el juicio puede fallar. ¿Hay alguna manera de preservar la información mientras está fresca?

Sí, y es llana: "the agent regularly writes notes persisted to memory outside of the context window."[^S1] (el agente escribe con regularidad notas que se persisten en memoria fuera de la ventana de contexto). "Like Claude Code creating a to-do list, or your custom agent maintaining a NOTES.md file."[^S1] (como Claude Code creando una lista de pendientes, o tu agente propio manteniendo un archivo NOTES.md). Retoma aquella tarea inicial de la condición de carrera; un juego de notas que aprueba se ve más o menos así:

```markdown
# NOTES.md — Arreglar condición de carrera del servicio de pedidos

## Decisiones tomadas
- Framework de pruebas: se cambió a vitest (decidido en el turno 3, motivo: las fixtures de prueba existentes dependen de él)

## Sin resolver
- orders/service.js updateStatus tiene una condición de carrera:
  dos peticiones concurrentes modificando el mismo pedido, la última escritura pisa a la primera
- Ya se intentó: mutex en proceso -> funciona con una sola instancia, falla en despliegue multiinstancia

## Siguiente paso
- Probar bloqueo optimista a nivel de base de datos (agregar campo version a orders)
```

El cableado es algo que aprendiste en el curso 7: dale al agente una herramienta de escritura de archivos y luego agrega un requisito al prompt del sistema — «cada vez que tomes una decisión importante, descubras un problema nuevo o termines una etapa, actualiza `NOTES.md` primero y después continúa». De ahí en adelante, el estado clave de la ventana tiene una copia de respaldo fuera de la ventana. No importa cómo se compacte o se reinicie la ventana: las notas están en disco, y lo primero que hace la ventana nueva es leerlas de vuelta.

Este truco no es exclusivo de tareas de programación. "Claude playing Pokémon demonstrates how memory transforms agent capabilities in non-coding domains."[^S1] (Claude jugando Pokémon demuestra cómo la memoria transforma las capacidades del agente en dominios que no son de programación). El sistema de investigación multiagente de Anthropic hace lo mismo para tareas largas: "agents summarize completed work phases and store essential information in external memory."[^S3] (los agentes resumen las fases de trabajo completadas y guardan la información esencial en memoria externa).

## División del trabajo: la compactación como red, las notas como rutina

Pon las dos armas lado a lado y la división del trabajo se aclara. La compactación es pasiva: se dispara cuando la ventana se acerca a su límite, en un momento que tú no eliges, y pierde información — lo que sobrevive depende del juicio de conservar y descartar de ese instante. Las notas son activas: escribes el estado clave en el momento en que nace, el contenido no se pierde, y el costo son unas pocas líneas de escritura a archivo cada vez. En una frase: las notas son la rutina diaria, la compactación es la red de seguridad.

Las dos no chocan; se refuerzan. Cuanto más diligentes sean tus notas, más leve es la consecuencia de que la compactación deje caer algo — si el resumen se salta un detalle, las notas todavía lo tienen. Yendo en la otra dirección, tener a la compactación como red significa que las notas no tienen que ser exhaustivas, solo cubrir las pocas categorías que «el agente debe saber al despertar».

El sentido de la proporción también importa. No toda tarea se gana esta maquinaria: la guía de Anthropic es "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] (habría que considerar agregar complejidad solo cuando mejora los resultados de forma demostrable). Fíjate en el verbo: *considerar*. Es una postura de sopesar, no una prohibición. Para una tarea que termina en diez turnos, tanto la compactación como las notas son piezas de repuesto; empieza con el bucle más simple y agrégalas cuando de verdad choques con el techo.

Dos límites finales, para que no pierdas tiempo buscando respuestas que esta lección no cubre:

- La persistencia **entre sesiones** de los archivos de notas — cómo organizarlos, cómo recuperarlos en una sesión nueva, el mantenimiento a largo plazo — es el tema del curso 5 de esta serie, «Memoria y estado del agente». Esta lección solo se ocupa de cómo las notas aligeran la carga de la ventana dentro de una misma tarea larga.
- Manejar tareas de horizonte largo tiene en realidad tres movimientos: "compaction, structured note-taking, and multi-agent architectures,"[^S1] (compactación, toma de notas estructurada y arquitecturas multiagente), todos apuntados a que los agentes puedan "maintain coherence, context, and goal-directed behavior over sequences of actions."[^S1] (mantener coherencia, contexto y comportamiento dirigido a objetivos a lo largo de secuencias de acciones). Los dos primeros ya están; el tercero — repartir la tarea entre subagentes que llevan ventanas limpias — es la Lección 5.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Escribir la instrucción de resumen de una compactación

Tu agente de depuración lleva cuarenta y tantos turnos, y el historial de mensajes mezcla varias categorías: una decisión temprana de cambiarse a vitest, un bug de carrera descubierto a mitad de camino pero todavía sin arreglar, decenas de salidas repetidas de herramientas de lectura de archivos, y además los detalles clave de implementación de las dos funciones que arreglaste al final. La ventana está casi llena; el arnés está por disparar la compactación. Escribe la instrucción de resumen que le entregarías al modelo (puede ser en inglés) y, por separado, enumera fuera de la instrucción misma la «lista de conservar» y la «lista de descartar» correspondientes.

<!-- rubric -->
- La instrucción de resumen exige explícitamente conservar: el bug de carrera sin resolver y el avance de la investigación, la decisión arquitectónica (cambiarse a vitest) y su razonamiento, los detalles clave de implementación de las funciones ya cambiadas
- La instrucción de resumen exige explícitamente descartar o reducir a una conclusión de una línea: las salidas redundantes de lectura de archivos y otros retornos repetidos de herramientas
- La instrucción explica que el propósito del resumen es reiniciar una ventana nueva (como contexto de apertura de una conversación nueva), no anexarse de vuelta a la conversación vieja

<!-- answer -->
Una instrucción de resumen que aprueba:

«Abajo está el registro de trabajo completo de un agente de depuración. Comprímelo en un resumen de traspaso para que una sesión totalmente nueva continúe esta tarea. El resumen debe conservar: primero, las decisiones arquitectónicas tomadas y su razonamiento (por ejemplo, la elección del framework de pruebas); segundo, los bugs todavía sin resolver y las pistas actuales de la investigación; tercero, los detalles clave de implementación de los cambios ya hechos (qué funciones cambiaron, por qué las cambiaste de esa manera). Descarta o reduce a una conclusión de una línea: los retornos crudos redundantes de lectura de archivos, la crónica completa de los intentos intermedios que después se descartaron.»

Lista de conservar: el bug de carrera sin arreglar y el punto donde se detuvo la investigación; la decisión de «cambiarse a vitest» y su razonamiento; los nombres, contenidos de cambio y motivación de las dos funciones modificadas.  
Lista de descartar: decenas de salidas repetidas de lectura de archivos (la conclusión útil ya está reflejada en las decisiones); el ida y vuelta completo de los intentos abandonados.

Nota de uso: este resumen no se mete de vuelta en la conversación vieja; se usa para reiniciar una ventana nueva — la ventana nueva carga solo el prompt del sistema más este resumen, y el agente continúa desde el resumen.[^S1]

<!-- hint -->
Pregúntate primero: «¿Qué es lo mínimo que el agente debe saber al despertar en la ventana nueva para poder seguir trabajando?». Aplica ingeniería inversa a la respuesta para armar la lista de conservar.

<!-- hint -->
Redundante no es lo mismo que inútil: esas salidas de herramientas fueron útiles en su momento, pero si su conclusión ya se asentó en registros de decisión posteriores, los originales pueden irse.

### Nivel 2: Diagnosticar la «amnesia después de compactar»

Alguien escribió esta función de «compactación» para el arnés y la llama cuando la ventana está casi llena:

```javascript
function compact(messages, keepLast = 10) {
  // Ventana casi llena: conserva el primer mensaje y los últimos 10, descarta el resto
  return [messages[0], ...messages.slice(-keepLast)];
}
```

Después de engancharla, el agente disparó la compactación en el turno 45. Entonces observaste dos síntomas: primero, en el turno 47 volvió a abrir el debate sobre «si el framework de pruebas debería ser node:test o vitest», una pregunta ya decidida en el turno 3 a favor de vitest; segundo, nunca volvió a mencionar el bug de carrera sin resolver registrado en el turno 5, y unos turnos después declaró la tarea terminada. Explica la causa de ambos síntomas y da un arreglo en dos capas.

<!-- rubric -->
- Señala que este `compact()` es truncado puro, no resumen: conserva solo el primer mensaje y los últimos 10, borrando físicamente la decisión del turno 3 y el registro del bug del turno 5. Después de compactar, esas piezas de información ya no existen en el contexto, así que el agente vuelve a debatir decisiones zanjadas y no tiene manera de recordar bugs sin terminar
- Arreglo de primera capa: reemplazar el truncado por resumen del modelo — entregarle el historial de mensajes al modelo para que lo comprima, con una instrucción que preserve explícitamente decisiones arquitectónicas, bugs sin resolver y detalles clave de implementación mientras descarta resultados de herramientas redundantes, y luego reiniciar una ventana nueva desde el resumen
- Arreglo de segunda capa: agregar notas estructuradas — darle al agente una herramienta de escritura de archivos, exigirle que actualice un `NOTES.md` fuera de la ventana al tomar decisiones o descubrir problemas, y leer las notas después de compactar o reiniciar para recuperar el estado, de modo que el estado clave deje de depender del juicio del momento de la compactación

<!-- answer -->
Causa: este `compact()` no «resume» en absoluto — es truncado. Conserva el primer mensaje (normalmente la descripción de la tarea) y los últimos 10, tirando los treinta y tantos turnos del medio como un bloque macizo: el mensaje del turno 3 que cierra vitest y el mensaje del turno 5 que registra el bug de carrera caen ambos en la zona descartada. La información se borró físicamente, no se comprimió, así que en la siguiente inferencia del agente esos mensajes son como si nunca hubieran ocurrido: sin registro de decisión, naturalmente vuelve a debatir la elección del framework de pruebas; sin registro del bug, no ve evidencia de que «hay trabajo sin terminar», así que declararlo hecho unos turnos después es perfectamente razonable.

El arreglo va en dos capas. Primera capa, reemplazar el truncado por compactación de verdad: entregarle al modelo el historial de mensajes que estaba por descartarse para que lo resuma, con una instrucción que exija explícitamente conservar las decisiones arquitectónicas ya tomadas, los bugs todavía sin resolver y los detalles clave de implementación, descartar la salida repetida de herramientas, y luego reiniciar una ventana nueva a partir de ese resumen.[^S1] Así la información de los turnos 3 y 5 sobrevive en forma de resumen. Segunda capa, agregar notas estructuradas como seguro: darle al agente una herramienta de escritura de archivos y exigirle que actualice un `NOTES.md` fuera de la ventana al cerrar decisiones o descubrir problemas;[^S1] leer las notas primero después de compactar o reiniciar. Así, aunque el juicio de un resumen falle, el estado clave todavía tiene una copia de respaldo sin pérdidas en disco.

<!-- hint -->
Contrasta «truncado» y «resumen»: el truncado descarta mensajes enteros, el resumen descarta detalle pero conserva conclusiones. Pregúntate: después de esta compactación, ¿siguen esos dos mensajes de los turnos 3 y 5 en el contexto?

<!-- hint -->
Si el estado clave ya se hubiera escrito fuera de la ventana antes de ser descartado, ¿seguiría siendo fatal que la compactación dejara caer algo? Piensa desde aquí hacia el arreglo de segunda capa.

<!-- /exercises -->

## Resumen

- Compactación = cuando una conversación se acerca al límite de la ventana, "passing the message history to the model to summarize and compress the most critical details,"[^S1] y luego "reinitiating a new context window"[^S1] a partir de ese resumen — reiniciar, no anexar de vuelta a la conversación vieja
- El arte de la compactación está en la elección de qué conservar y qué descartar: "preserves architectural decisions, unresolved bugs, and implementation details while discarding redundant tool outputs";[^S1] comprime en la dirección equivocada y el agente despierta sin recordar qué estaba haciendo
- Claude Code "automatically compacts conversation history when you approach context limits, which preserves important code and decisions"[^S4]; entre tareas sin relación se usa `/clear` para un reinicio total — "A clean session with a better prompt almost always outperforms a long session with accumulated corrections"[^S4]
- Notas estructuradas: "the agent regularly writes notes persisted to memory outside of the context window" (lista de pendientes, `NOTES.md`);[^S1] la compactación es red de seguridad pasiva y con pérdidas, las notas son externalización activa escrita sobre la marcha
- Los tres movimientos para tareas de horizonte largo son "compaction, structured note-taking, and multi-agent architectures";[^S1] los dos primeros ya están en mano, el tercero es la Lección 5. La persistencia de notas entre sesiones es el tema del curso 5 de esta serie, «Memoria y estado del agente»

[>> Lección 5: Subagentes y aislamiento de contexto](./05-subagent-context-isolation.md)
