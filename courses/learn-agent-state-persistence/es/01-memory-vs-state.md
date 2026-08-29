# Lección 1: Más allá de la memoria está el estado

> Objetivos de aprendizaje:
> - Distinguir en una sola frase la «memoria» (el contexto que le das al modelo) del «estado de ejecución» (la escena en curso que sostiene el arnés), y dar un ejemplo de cada uno
> - Nombrar al menos tres fundamentos concretos de por qué «una caída resulta especialmente letal para una tarea larga», y señalar a qué parte de la ejecución apunta cada uno
> - Ante una lista de cosas que un arnés en ejecución hace malabares para sostener, decidir si cada una es memoria, estado de ejecución o salida en disco, y si sobrevive a que maten el proceso
>
> Requisitos: Terminaste los cursos anteriores de esta serie y entiendes el bucle del arnés guiado por `stop_reason` de «Fundamentos del arnés de agente: bucles y control» y la gestión de contexto de «Ingeniería de contexto: gastar una atención finita donde más rinde» | Siguiente: [Lección 2 >>](./02-checkpoint-anatomy.md)

## Turno 23, y matan el proceso

Imagina el arnés que escribiste en «Fundamentos del arnés de agente: bucles y control» ejecutando una tarea larga que toma 40 turnos: leer un lote de archivos, analizarlos de a uno y agregar conclusiones a un reporte sobre la marcha. En el turno 23, matan el proceso: quizá una actualización de despliegue, quizá el servidor perdió la corriente, quizá le erraste al Ctrl+C.

Revisas el disco: los archivos de reporte de los primeros 22 turnos están todos ahí; `NOTES.md` (ese resumen de progreso de la tarea que preparaste en «Ingeniería de contexto: gastar una atención finita donde más rinde») todavía registra «hasta qué archivo analicé y cuál fue la conclusión». Parece que no se perdió gran cosa: basta con reiniciar el proceso y retomar donde quedó.

Pero al reiniciar descubres que el arreglo `messages` de `runAgent` está vacío: hay que reconstruirlo desde `[{ role: "user", content: userInput }]`. El contador `turns` volvió a cero. `tokensUsed` también volvió a cero. Y si la caída se produjo en el turno 23 justo entre «el modelo nombró una herramienta» y «el resultado de la herramienta se empujó de vuelta a `messages`», esa llamada a herramienta —tanto si recién había empezado a ejecutarse como si ya había terminado— tampoco deja rastro alguno.

La tarea no se reanuda desde el turno 23: arranca de nuevo desde el turno 1. Los archivos en disco están todos ahí, pero el propio registro del arnés sobre «hasta dónde llegué» no dejó nada atrás.

## Qué es la memoria, qué es el estado

Antes de que este curso pueda enseñar lo que vino a enseñar, tiene que trazar una línea frente a un concepto que se difumina con facilidad.

La **memoria** es el contexto que le das al modelo: el curso 5, «Memoria y estado del agente», cubre cómo persistirla entre sesiones, y el curso 8, «Ingeniería de contexto: gastar una atención finita donde más rinde», cubre exactamente qué le das a mirar al modelo en cada turno. Responde a la pregunta «¿qué ha visto el modelo?». `NOTES.md` es un vehículo para la memoria: ya está escrito en disco, y el turno siguiente o la sesión siguiente pueden leerlo de vuelta y soltarlo dentro del prompt.

El **estado de ejecución** es la escena en curso que sostiene el propio proceso del arnés: el arreglo `messages`, contadores como `turns` y `tokensUsed`, la llamada a herramienta que todavía no quedó registrada. Responde a la pregunta «¿recuerda el arnés hasta dónde llegó?».

La diferencia clave entre ambos no es «cuál es el contenido» sino «dónde vive ahora mismo». La memoria puede estar ya en disco (`NOTES.md` está en el sistema de archivos, y que el proceso viva o muera no cambia que siga ahí); el estado de ejecución, por omisión, vive solo en la memoria del proceso: eso que crea la línea `let messages = [...]` se recupera junto con la memoria en el instante en que el proceso termina, a menos que alguien lo escriba deliberadamente en disco. Nada de la sección anterior —`messages`, `turns`, `tokensUsed`, la llamada colgante a herramienta— se escribe en disco por su cuenta.

```javascript
// En el instante en que se ejecuta el turno 23, estas cosas viven solo en la memoria del proceso node
let state = {
  messages,        // el historial completo de la conversación: la única fuente para restaurar el contexto
  turns,           // en qué turno vamos
  tokensUsed,      // consumo acumulado
  pendingToolUse,  // una herramienta que el modelo nombró, cuyo resultado todavía no se empujó de vuelta a messages
};
```

Este `state` es exactamente lo que este curso te va a enseñar a convertir en algo que se pueda escribir en disco y restaurar.

## Por qué esto es decisivo para las tareas largas

Primero, hagamos las cuentas: "Agents can run for long periods of time, maintaining state across many tool calls."[^S1] (los agentes pueden ejecutarse durante largos periodos, manteniendo estado a lo largo de muchas llamadas a herramientas). Por eso justamente el arreglo `messages` del turno 23 no deja de crecer. Pero también significa que "Agents are stateful and errors compound."[^S1]: los agentes tienen estado y los errores se componen; cuanto más estado se apila, en el momento en que algo de la cadena sale mal el costo no es lineal, se acumula.

Suma uno más: "Without effective mitigations, minor system failures can be catastrophic for agents."[^S1] (sin mitigaciones efectivas, fallas menores del sistema pueden ser catastróficas para los agentes). Poner «menor» y «catastrófico» uno al lado del otro describe exactamente la situación del turno 23: que maten el proceso es, por sí solo, un evento operativo corriente, pero borra de un solo golpe 22 turnos de estado de ejecución, y eso es lo que magnifica el costo.

Después de un error, "When errors occur, we can't just restart from the beginning: restarts are expensive and frustrating for users."[^S1] (cuando ocurren errores no podemos simplemente reiniciar desde el principio: los reinicios son costosos y frustrantes para los usuarios). Así que lo que conviene construir es un sistema en el que, "Instead, we built systems that can resume from where the agent was when the errors occurred."[^S1] (en cambio, construimos sistemas que pueden reanudar desde donde estaba el agente cuando ocurrieron los errores), que es la razón por la que «más allá de la memoria está el estado» no es una distinción académica sino el cimiento de si una tarea larga puede sobrevivir a una interrupción.

Cuanto más larga la tarea, más pesada esta cuenta: "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S3], y "The autonomous nature of agents means higher costs, and the potential for compounding errors."[^S3]. Cuantos más turnos se ejecutan, más espeso es el estado de ejecución que acumula, y más puede borrar una sola interrupción.

## Las caídas no son raras

Ese «mataron el proceso» del turno 23 suena a accidente de baja probabilidad, pero para una tarea larga que se ejecuta durante decenas de turnos, ser interrumpida a mitad de camino no tiene nada de inusual. Hasta la actualización de despliegue más rutinaria puede chocar con un agente en ejecución, que es la razón por la que los equipos deliberadamente "use rainbow deployments to avoid disrupting running agents, by gradually shifting traffic from old to new versions"[^S1] (usan despliegues arcoíris para no perturbar a los agentes en ejecución, desviando el tráfico gradualmente de las versiones viejas a las nuevas), y el motivo es que "whenever we deploy updates, agents might be anywhere in their process."[^S1] (cada vez que desplegamos actualizaciones, los agentes pueden estar en cualquier punto de su proceso).

Dicho de otro modo: hasta quienes están a cargo de la operación asumen que «el agente puede ser interrumpido en cualquier momento» es algo que va a pasar, y diseñan mecanismos específicamente para esquivarlo. Tu arnés no tiene motivo para suponer que va a tener más suerte.

## La cura, en avance: la hoja de ruta de este curso

El estado de ejecución perdido en el turno 23 tiene una solución de cinco pasos, que es también el orden de las cinco lecciones siguientes:

1. **Puntos de control** (Lección 2): serializar periódicamente a un archivo de punto de control en disco el estado de ejecución, como `messages`, `turns`, `tokensUsed` y la llamada colgante a herramienta.
2. **Reanudar desde un punto de control** (Lección 3): después de que el proceso reinicia, leer ese estado de vuelta desde el archivo de punto de control, reconstruir `messages` y dejar que el bucle retome donde se rompió en vez de arrancar de nuevo desde el turno 1.
3. **Efectos secundarios e idempotencia** (Lección 4): lo más difícil de reanudar no es «el estado se perdió», es «algunas llamadas a herramientas quizá ya se ejecutaron de verdad»: qué herramientas se pueden volver a ejecutar sin riesgo y cuáles hay que proteger para que no se ejecuten dos veces.
4. **Rebobinar y bifurcar** (Lección 5): los puntos de control no sirven solo para recuperarse de desastres; también te permiten rebobinar a una escena anterior y reintentar, o bifurcar otro intento desde algún nodo.
5. **Manos a la obra** (Lección 6): tomar la maquinaria de las lecciones anteriores, encajarla en el arnés de «Fundamentos del arnés de agente: bucles y control» y llevar tú mismo una tarea larga por el recorrido «matada a mitad, reinicio, ejecución hasta el final».

Una hoja de ruta comunitaria de código abierto construida alrededor de la «ingeniería del arnés» lo resume en una línea: "Checkpoint state every node so you can resume, rewind, fork."[^S5] (guardar el estado en un punto de control en cada nodo para poder reanudar, rebobinar y bifurcar). Es apenas una nota de encuadre de un documento comunitario sobre de qué se hace cargo el componente de persistencia, no una especificación que este curso copie al pie de la letra, pero el orden que señala coincide con los cinco pasos de arriba.

## Proporción: no toda tarea necesita esto

No todo agente tiene que cargar con la maquinaria de puntos de control. Sobre agregar complejidad, "you should consider adding complexity only when it demonstrably improves outcomes."[^S3] (habría que considerar agregar complejidad solo cuando mejora los resultados de forma demostrable): una tarea que se resuelve en unos pocos turnos de llamadas a herramientas tiene apenas un puñado de entradas en `messages`, y si el proceso muere basta con volver a ejecutarla; el costo es preguntar una vez más, y no amerita diseñar todo un mecanismo de guardado y restauración.

Lo que sí necesita la maquinaria de este curso es un escenario como el del turno 23 del comienzo: una tarea que se ejecuta durante decenas de turnos, puede tomar de minutos a horas y acumula por el camino una pila grande de estado de ejecución sin persistir. Para decidir si traer puntos de control, hazte primero una pregunta: si la mataran ahora mismo, ¿podrías vivir con el costo de volver a ejecutarla? Si no puedes, ahí es donde entran las próximas lecciones.

```agentmentor-check
{
  "id": "sp-zh-01-restart-illusion",
  "label": "Juzgar si basta con reiniciar y volver a ejecutar tras una caída del proceso",
  "prompt": "Tu arnés está ejecutando una tarea larga de 40 turnos y en el turno 23 matan el proceso (digamos que chocó con una actualización de despliegue). Revisas el disco: los archivos de reporte de los primeros 22 turnos están todos ahí, y `NOTES.md` registra el progreso completado hasta el momento. Concluyes: esta caída no hizo daño real, basta con reiniciar el proceso y ejecutar la tarea desde arriba. ¿Se sostiene esa conclusión?",
  "whyHere": "Esto llega justo después de enseñar la diferencia de ubicación física entre memoria y estado de ejecución: la memoria puede estar ya en disco, el estado de ejecución vive por omisión solo en la memoria del proceso. «Los archivos de salida están todos en disco, así que no se perdió nada» es la trampa intuitiva en la que más fácil se cae aquí, y hay que corregirla en el acto.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Se sostiene: los archivos de reporte y NOTES.md están ambos en disco, así que no se perdió nada; basta con reiniciar y volver a ejecutar desde arriba",
      "correct": false,
      "feedback": "Que haya archivos en disco no significa que el estado de ejecución siga ahí. El arreglo `messages`, `turns` y `tokensUsed` son variables en la memoria del proceso, y hasta que alguien los serialice deliberadamente en disco se recuperan junto con la memoria en el instante en que el proceso muere: ellos y los archivos de reporte ya persistidos y `NOTES.md` viven físicamente en dos lugares distintos, y que uno haya desaparecido no significa que el otro siga estando."
    },
    {
      "id": "b",
      "text": "No se sostiene, pero lo único que se perdió de verdad es el contador tokensUsed; el arreglo messages y la llamada colgante a herramienta se pueden reconstruir a partir de los archivos de reporte ya generados",
      "correct": false,
      "feedback": "Los archivos de reporte son la salida de la tarea ejecutada hasta cierto paso, no un registro de la ejecución misma: no preservan lo que dijo el modelo en cada turno, ni los argumentos completos y el resultado de cada llamada a herramienta, ni si la caída atrapó una llamada a herramienta en pleno vuelo. No puedes deducir esos detalles a partir de la salida, así que el arreglo messages y la llamada colgante no se pueden recuperar de ahí; eso requiere una instantánea hecha a propósito."
    },
    {
      "id": "c",
      "text": "No se sostiene: la escena en curso que sostiene el arnés (el arreglo messages, los contadores de turnos y de consumo, la llamada a herramienta todavía sin registrar) vive por omisión solo en la memoria del proceso y desaparece en el instante en que el proceso muere; reiniciar es costoso, y volver a ejecutar desde arriba también puede repetir efectos secundarios que ya ocurrieron",
      "correct": true,
      "feedback": "Correcto. No puedes reiniciar desde el principio tras un error, porque los reinicios son costosos y frustrantes, que es justamente la razón por la que se construyen sistemas que reanudan desde donde ocurrió el error. Peor todavía: «ejecutar todo de nuevo» no es solo tiempo desperdiciado; si una herramienta de los primeros 22 turnos se ejecutó de verdad (envió un correo, cambió un registro), ejecutar de nuevo desde el turno 1 significa que esas acciones ocurren una segunda vez. Cómo manejar ese tipo de efecto secundario es asunto de la Lección 4."
    }
  ]
}
```

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Clasificar seis «cosas» en ejecución

Abajo hay seis «cosas» involucradas en un arnés en ejecución. Clasifica cada una en «memoria», «estado de ejecución» o «salida en disco», y di: si matan el proceso en este instante, ¿sigue ahí?

1. El resumen de progreso de la tarea ya escrito en `NOTES.md` (el que preparaste en «Ingeniería de contexto: gastar una atención finita donde más rinde»)
2. El arreglo `messages` en memoria
3. El archivo de reporte `report.md` ya escrito en disco
4. El contador `turns` (en qué turno vamos)
5. Un tramo de análisis sobre la estructura del proyecto dentro del texto de respuesta que el modelo acaba de producir este turno, todavía no escrito en `NOTES.md`
6. Un bloque `tool_use` que el modelo nombró, cuya herramienta no terminó de ejecutarse y cuyo resultado no se empujó de vuelta a `messages`

<!-- rubric -->
- Las seis reciben una clasificación y los trazos gruesos son correctos: `messages`, `turns` y el `tool_use` colgante van a «estado de ejecución»; el resumen ya persistido de `NOTES.md` va a «memoria» (con la nota de que está en disco), y `report.md` va a «salida en disco»; ambos están en disco, pero uno es contexto para devolverle al modelo y el otro es un artefacto de salida de la tarea, así que pertenecen a categorías distintas; el ítem 5 va a «memoria» pero con la nota especial de que todavía no está persistido
- Sabe articular que «memoria» no es lo mismo que «ya persistido»: el ítem 5 demuestra que la memoria misma puede estar todavía en la memoria del proceso y perderse con él, el mismo aprieto que el estado de ejecución
- El veredicto «sigue ahí / desapareció» tras una caída es preciso: los ítems 1 y 3 siguen ahí; los ítems 2, 4 y 6 desaparecieron; el ítem 5 también desapareció (porque, aunque sea contenido de memoria, no se persistió a tiempo)

<!-- answer -->
1. **Memoria, ya persistida**: `NOTES.md` es un vehículo para el contexto que se le da al modelo, y este resumen ya está escrito en el archivo; una caída del proceso no lo toca, y se puede leer de vuelta tras el reinicio.
2. **Estado de ejecución**: el arreglo `messages` es el historial de conversación que sostiene el propio arnés, y vive solo en la memoria del proceso; se borra en una caída y hay que reconstruirlo desde cero.
3. **Salida en disco**: `report.md` es el artefacto que produjo la ejecución de la tarea, ya persistido, y sigue ahí sin cambios tras una caída.
4. **Estado de ejecución**: `turns` es una variable contador en memoria, de vuelta a cero tras una caída; al reanudar necesitas saber desde qué turno seguir contando.
5. **Memoria, pero no persistida**: este «entendimiento de la estructura del proyecto» es esencialmente el mismo tipo de cosa que lo que hay en `NOTES.md` (ambos son contexto para darle al modelo), pero en este instante existe solo en el texto de respuesta del modelo de este turno. Si el arnés todavía no lo llevó a `NOTES.md` y el proceso se cae, ese entendimiento se va con él. Esto muestra que la clasificación «memoria» frente a «estado de ejecución» no es exactamente lo mismo que «en disco» frente a «en memoria»: la memoria también puede estar todavía sin persistir.
6. **Estado de ejecución**: este bloque `tool_use` colgante es el caso clásico de «caída entre la ejecución de la herramienta y el registro del resultado», y existe solo en los `messages` en memoria o en alguna cola pendiente; tras una caída no deja registro alguno, y la Lección 3 se ocupa específicamente de este tipo de ruptura.

<!-- hint -->
No uses «en disco» frente a «en memoria» como única prueba: el ítem 5 es un contraejemplo, es memoria por su contenido pero en este instante todavía no está persistido.

<!-- hint -->
Los ítems 2, 4 y 6 comparten algo: son todos cosas que el bucle del arnés usa mientras se ejecuta para registrar «hasta dónde llegué», y sin un mecanismo de persistencia hecho a propósito mueren con el proceso.

### Nivel 2: Escribir un inventario de pérdidas por caída para el arnés de «Fundamentos del arnés de agente»

Volvamos al escenario del comienzo: el `runAgent` de «Fundamentos del arnés de agente: bucles y control» (guiado por un bucle sobre `stop_reason` con las variables `messages`, `turns` y `tokensUsed`) está ejecutando una tarea de 40 turnos, y en el turno 23 matan el proceso, y la caída se produce exactamente entre «el modelo nombró una herramienta» y «el resultado de la herramienta se empujó de vuelta a `messages`». Sin escribir código, haz dos cosas en palabras:

1. **Inventario de pérdidas por caída**: ¿qué perdió exactamente esta caída? ¿Qué no se vio afectado y sigue ahí?
2. **Qué debería sostener el punto de control**: si este arnés tuviera un mecanismo de puntos de control, ¿qué campos crees que necesita sostener el archivo de punto de control, como mínimo, para dejar esta pérdida lo más chica posible? Enumera los nombres de campo y di por qué hay que guardar cada uno.

<!-- rubric -->
- El inventario de pérdidas señala explícitamente el arreglo `messages`, `turns`, `tokensUsed` y la llamada `tool_use` atascada entre la ejecución de la herramienta y el registro del resultado: todas estas cosas en memoria se pierden; y reconoce que los archivos de salida ya generados en disco y `NOTES.md` quedan intactos y siguen ahí
- La propuesta de campos cubre al menos `messages`, `turns` y `tokensUsed` —las tres variables ya listas que puedes reconocer directamente en el código de `runAgent`— y da una línea de «por qué guardarlo» para cada una (por ejemplo, `messages` es la única fuente para restaurar el contexto de conversación, `turns` sirve para juzgar cuán lejos está el tope de turnos, `tokensUsed` alimenta el presupuesto y el umbral de compactación de «Ingeniería de contexto: gastar una atención finita donde más rinde»)
- Reconoce que «una llamada a herramienta ejecutándose, todavía sin registrar» necesita su propio campo (aunque le pongas tú el nombre; no tiene que coincidir con el que usan las lecciones posteriores), y explica que esto es porque la caída puede producirse exactamente entre que la herramienta termina y que el resultado se escribe de vuelta en `messages`, así que sin un registro aparte no hay manera de juzgar si la llamada cuenta

<!-- answer -->
**Inventario de pérdidas por caída**:
- Perdido: el arreglo `messages` en memoria (los primeros 22 turnos más la parte del turno 23 ya ensamblada en él), el contador `turns` (que debería haber estado en 22 o 23), el consumo acumulado `tokensUsed`, y la llamada a herramienta atascada entre «el modelo ya la nombró» y «el resultado todavía no se empujó de vuelta a `messages`»: si terminó sin quedar registrada o si nunca llegó a terminar es completamente indecidible tras el reinicio.
- No perdido: los archivos de reporte ya escritos en disco en los turnos anteriores, y el resumen de progreso ya persistido en `NOTES.md`; una caída del proceso no toca nada de esto, y siguen ahí sin cambios.

**Campos que debería sostener el punto de control**:
- `messages`: la única fuente para restaurar el contexto de conversación; sin él, todo lo que el modelo vio y dijo antes del turno 23 no se puede reconstruir.
- `turns`: tras reanudar tienes que saber cuántos turnos llevas ejecutados para juzgar correctamente cuán lejos está el tope de turnos, y no chocar con el tope apenas reanudas ni, al revés, regalarte turnos de más.
- `tokensUsed`: tras reanudar tienes que seguir contando el consumo para alinearte con el presupuesto y el umbral de compactación fijados en «Ingeniería de contexto: gastar una atención finita donde más rinde»; de lo contrario reanudaste un agente que no sabe cuánto lleva gastado.
- Un campo dedicado a registrar «una llamada a herramienta ejecutándose, todavía sin registrar», porque la caída puede producirse exactamente entre que la herramienta termina y que el resultado se escribe de vuelta en `messages`. Sin registrar aparte la identidad y los argumentos de esta llamada, al reanudar no sabes ni si volver a ejecutarla ni qué tipo de resultado rellenar en `messages`.

<!-- hint -->
Vuelve al cuerpo de `runAgent` en «Fundamentos del arnés de agente: bucles y control» y fíjate en qué variables va empujando cosas a medida que gira el bucle: esas variables son básicamente la columna vertebral tanto del inventario de pérdidas como de los campos del punto de control.

<!-- hint -->
El instante exacto de la caída importa: una caída entre «llegó la respuesta del modelo» y «la herramienta empezó a ejecutarse de verdad» lleva a respuestas distintas que una entre «la herramienta terminó» y «el resultado se empujó de vuelta a messages» sobre si la llamada cuenta y cómo manejarla; resuelve eso primero y después decide qué información debería registrar este campo.

<!-- /exercises -->

## Resumen

- Los agentes pueden ejecutarse durante largos periodos, manteniendo estado a lo largo de muchas llamadas a herramientas, y precisamente por eso tienen estado y los errores se componen[^S1]: cuanto más estado se apila, más puede borrar una sola falla.
- Sin mitigaciones efectivas, una falla menor del sistema puede ser catastrófica para un agente[^S1]; tras un error no puedes reiniciar desde el principio, porque los reinicios son costosos y frustrantes para los usuarios, así que se construyen sistemas que reanudan desde donde ocurrió el error[^S1].
- Las caídas no son raras: hasta una actualización de despliegue rutinaria exige despliegues arcoíris justamente para no perturbar a los agentes en ejecución, porque al momento de desplegar un agente puede estar en cualquier punto de su proceso[^S1].
- La operación autónoma acarrea de por sí costos más altos y el riesgo de errores que se componen[^S3]; cuanto más larga la tarea, más pesada esta cuenta, y más necesita un mecanismo que sobreviva a la interrupción.
- No toda tarea tiene que cargar con esta maquinaria: habría que agregar complejidad solo cuando mejora los resultados de forma demostrable[^S3], y para una tarea que se resuelve en unos pocos turnos el costo de simplemente volver a ejecutarla suele ser aceptable.
- La memoria (el contexto que se le da al modelo) y el estado de ejecución (la escena en curso que sostiene el arnés) son dos cosas distintas: la memoria puede estar ya persistida, el estado de ejecución vive por omisión solo en la memoria del proceso, y las próximas lecciones tratan de convertir también ese estado de ejecución en algo que se pueda escribir en disco y restaurar.

[>> Lección 2: Puntos de control: escribir la escena de ejecución en disco](./02-checkpoint-anatomy.md)
