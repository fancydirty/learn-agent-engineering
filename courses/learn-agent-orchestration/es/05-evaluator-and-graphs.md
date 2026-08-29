# Lección 5: El bucle de revisión, y componer patrones en un grafo

> Objetivos de aprendizaje:
> - Implementar un bucle de revisar y refinar (generar un borrador, evaluarlo, corregirlo según la retroalimentación), y usar dos criterios de decisión para determinar si vale la pena construir este bucle
> - Escribir condiciones de parada más inteligentes que «máximo N rondas», y colocar los chequeos deterministas antes del juez
> - Componer cinco patrones en lo que esta lección llama un «grafo», y dejar documentado en tus propios materiales que este sistema visual es una metáfora propia anclada a una cita concreta de una fuente primaria
>
> Requisitos: Leíste las Lecciones 1–4 (quién tiene el plan, encadenamiento y enrutamiento, paralelización, orquestador-trabajadores), puedes escribir a mano un bucle de arnés impulsado por `stop_reason` | Anterior: [<< Lección 4](./04-orchestrator-workers.md) | Siguiente: [Lección 6 >>](./06-build-a-graph.md)

## El borrador al que siempre le falta un paso

Le pides a un agente que escriba un plan de migración de base de datos. El primer borrador vuelve con aspecto razonable: contexto, pasos, ventana de tiempo, todo presente. Pero de un vistazo detectas dos huecos—la sección de reversión apenas dice «revertir si es necesario», y no hay clasificación de riesgo por ninguna parte. Escribes dos líneas de retroalimentación señalándolos, vuelve el segundo borrador, los dos huecos están llenos, y el conjunto sube un escalón de calidad.

Has repetido este proceso decenas de veces. Cada vez es lo mismo: la salida se queda corta, una persona aporta dos frases de retroalimentación, la salida mejora notablemente.

El problema no es que el modelo escriba mal. El problema es que **tus dos frases de retroalimentación no son difíciles de producir**. «Los pasos de reversión deben incluir comandos concretos», «Cada paso necesita una clasificación de riesgo»—estas son cosas que una lista de verificación podría cubrir. Si tú lo puedes articular con claridad, el modelo probablemente también. Entonces, ¿por qué tienes que ser tú quien lo dice cada vez?

Esta forma vale la pena escribirla como un bucle.

## Revisar y refinar: escribir «corrígelo una vez más» en el flujo de control

La fuente primaria lo define en una frase: una llamada a un LLM genera una respuesta mientras otra aporta evaluación y retroalimentación en un bucle[^S1].

Los cuatro patrones de las primeras cuatro lecciones tienen cada uno su propia topología: el encadenamiento descompone una tarea en una secuencia de pasos, donde cada paso procesa la salida del anterior[^S1]; el enrutamiento clasifica y luego despacha hacia tareas de seguimiento especializadas[^S1]; la paralelización ejecuta cosas simultáneamente y agrega los resultados por programa[^S1]; orquestador-trabajadores hace que un LLM central descomponga dinámicamente las tareas, delegue en trabajadores y sintetice los resultados[^S1]. Todos comparten un rasgo: los datos fluyen hacia adelante. El bucle de revisión es el primer patrón **con una arista de retorno**—la salida vuelve en bucle al nodo de generación.

¿Cómo se ve en un producto? La documentación de flujos de trabajo dinámicos de Claude Code da una descripción en lenguaje llano: ejecutar un verificador, corregir lo que falló, y repetir hasta que pase o deje de haber progreso[^S5]. Otra descripción cubre un uso distinto de la misma división del trabajo: hacer que agentes independientes revisen de forma adversarial los hallazgos de los demás antes de que se reporten[^S5]. Esa es una revisión cruzada única antes de reportar, sin arista de retorno y sin iteración—meterla dentro del bucle de revisión es una categorización de esta lección, no que el texto original describa la misma topología.

### Un concepto, tres nombres

Aquí necesitamos tender un puente explícito, o vas a creer que estás aprendiendo tres cosas distintas.

El curso 6 de esta serie, que enseña colaboración multiagente, llama a esta división de «uno hace el trabajo, otro lo critica» **productor-revisor**. Ese es vocabulario didáctico nuestro. En los materiales primarios, la documentación de flujos de trabajo de Claude Code describe su uso de producto en una frase: hacer que agentes independientes revisen de forma adversarial los hallazgos de los demás (la abreviatura de esta lección para esa frase es «revisión cruzada adversarial»). La misma forma tiene dos nombres en las fuentes primarias: la referencia de patrones de Anthropic la llama **evaluator-optimizer**[^S1]; la documentación de flujos de trabajo de Claude Code no le da nombre, solo describe el uso—esa frase sobre revisar de forma adversarial los hallazgos de los demás[^S5].

Tres nombres, una forma. La diferencia está en desde qué ángulo lo miras: al hablar de roles de colaboración ves dos actores, al hablar de patrones de orquestación ves una arista de retorno, al hablar de capacidades de producto ves una técnica de calidad reutilizable.

Hay una división del trabajo más que aclarar. El curso 10 de esta serie dedica un curso entero a enseñarte **cómo ser un buen juez**: cómo escribir rúbricas, cómo restringir el formato de salida del juez, por qué el juez necesita su propio contexto independiente, por qué el trabajador no debería ser también el juez. Ese curso enseña la calidad del juez en sí. Esta lección no repite esos temas. Esta lección enseña **cómo cablear al juez dentro del flujo de control**—en qué parte del bucle se sienta, cuándo se ejecuta, cuántas rondas se ejecuta, cuándo se detiene.

## Cuándo vale la pena construir este bucle

Los criterios de aplicabilidad de la fuente primaria: este flujo de trabajo es particularmente efectivo cuando tenemos criterios de evaluación claros, y cuando el refinamiento iterativo aporta valor medible; las dos señales de buen encaje son, primero, que las respuestas del LLM se pueden mejorar demostrablemente cuando una persona articula su retroalimentación; y segundo, que el LLM puede aportar esa retroalimentación[^S1].

Ya viste esta cita antes. El curso 10 de esta serie citó exactamente esta frase al responder la pregunta de «¿vale la pena construir un bucle de revisar y corregir?». Los mismos criterios, replanteados en un contexto de orquestación—salvo que esta vez estás implementando la respuesta como un bucle en el flujo de control.

Desglosadas, estas dos señales protegen cada una contra modos de fallo distintos:

**La primera señal protege contra «corregir no ayuda».** Algunas tareas no mejorarán en un segundo borrador por más clara que enuncies la retroalimentación—porque el problema son datos de entrada faltantes o una tarea definida de forma vaga, no la redacción de la salida. En este caso, construir un bucle solo significa que pagas dos veces para obtener dos versiones igual de inutilizables. El método de validación es tosco pero efectivo: **hazlo tú mismo a mano tres veces**. ¿Cuántas de esas tres fueron «claramente mejor después de la retroalimentación humana»? Si dos de tres fueron «la retroalimentación no ayudó», no construyas el bucle.

**La segunda señal protege contra «el juez no puede dar ese tipo de retroalimentación».** Aun si la retroalimentación humana funciona, todavía debes preguntar: ¿puede el modelo mismo aportar el mismo tipo de retroalimentación? Si tu retroalimentación depende de cosas que solo tú sabes (de qué se quejó este cliente el trimestre pasado, qué informó legal de palabra la semana pasada), el modelo no tiene esa información, así que la retroalimentación que dé será algo completamente distinto. En ese caso, o alimentas esa información dentro del prompt del juez—conviértela en criterios que el modelo pueda evaluar—o aceptas que este paso necesita a una persona.

**Hay una precondición que entra en juego incluso antes que estas dos señales: los criterios de evaluación deben ser claros.** Cuando los criterios no son claros, el bucle produce de forma confiable un tipo específico de fallo—el juez da retroalimentación que apunta en direcciones distintas o incluso contradictorias en cada ronda, la salida rebota entre dos versiones, las rondas se agotan, y el borrador final es peor que el primero. Esto no es culpa del bucle. Es que los criterios todavía no se han definido.

### Los chequeos deterministas van antes del juez

La distinción definicional de la fuente primaria entre sistemas deterministas y no deterministas: los sistemas deterministas producen la misma salida cada vez dadas entradas idénticas, mientras que los sistemas no deterministas—como los agentes—pueden generar respuestas variadas incluso con las mismas condiciones iniciales[^S3].

Los jueces son no deterministas. Cada regla que «el código puede decidir de forma definitiva» y que le entregas a un juez significa que estás usando algo que podría dar resultados distintos cada vez para evaluar algo que debería dar el mismo resultado siempre—y además pagando por una llamada extra al modelo.

El curso 10 de esta serie llama a esta disciplina puntuación por capas: usa código para lo que el código puede decidir, y entrégale al modelo solo lo que el código no puede. Esta lección la copia tal cual al ordenamiento de nodos del bucle. La cita de la Lección 2 sigue aplicando aquí—puedes añadir chequeos programáticos en cualquier paso intermedio para asegurar que el proceso sigue en curso[^S1]. Cada borrador del bucle es un paso intermedio.

Aplicado al ejemplo del plan de migración: «¿cada paso tiene su comando de reversión correspondiente?» se puede decidir de forma definitiva con expresiones regulares o parseo estructurado—eso es una compuerta. «¿Están escritos de forma creíble los comandos de reversión?» necesita un juez. Que falle el primero ni siquiera despierta al juez; apenas dile a quien escribe qué pasos faltan y sigue adelante.

## El esqueleto de código del bucle

```javascript
const MAX_ROUNDS = 3;

async function reviewLoop(task) {
  let draft = null;
  let bestDraft = null;
  let feedback = null;
  let bestScore = -1;
  let rounds = 0;

  while (rounds < MAX_ROUNDS) {
    rounds++;

    // Nodo A: generar. En la primera ronda feedback es null; en las siguientes reescribe con la retroalimentación previa
    draft = await runAgent(writerPrompt(task, draft, feedback));

    // Compuerta determinista antes del juez: no pagues por preguntarle al modelo lo que el código puede decidir
    const gate = checkDeterministic(draft);
    if (!gate.pass) {
      feedback = gate.problems.join('\n');
      continue;
    }

    // Nodo B: juez. Contexto independiente, prompt independiente, no ve el proceso de escritura
    const verdict = await runVerdict(rubricPrompt(task, draft));
    if (verdict.pass) {
      return { draft, rounds, reason: 'passed' };
    }

    // Condición de parada: esta ronda no superó a la anterior, deja de quemar otra
    if (verdict.score <= bestScore) {
      return { draft: bestDraft ?? draft, rounds, reason: 'no-progress' };
    }

    bestScore = verdict.score;
    bestDraft = draft;
    feedback = verdict.notes;
  }

  return { draft: bestDraft ?? draft, rounds, reason: 'max-rounds' };
}
```

Vale la pena señalar unos cuantos detalles por separado.

**`runAgent` es un bucle de arnés completo.** Esto no ha cambiado desde la Lección 2: detrás de cada `await runAgent(...)` de este script está en ejecución el bucle impulsado por `stop_reason` del curso 7 de esta serie. Esto es apenas otra capa de flujo de control escrito en código envuelta alrededor del bucle.

**Estos valores de `reason` son desenlaces distintos, no los colapses en un booleano (los sistemas reales a menudo necesitan subdividir más—por ejemplo, que la compuerta falle repetidamente merece su propio balde).** `passed` se puede entregar directamente; `max-rounds` significa que las rondas se agotaron sin pasar, y probablemente necesita traspaso a una persona; `no-progress` significa que el modelo se atascó, y quemar más dinero no lo va a mejorar. Estos tres desenlaces deberían ser tres líneas separadas en tus datos de observabilidad—el enfoque de registro que enseña el curso 11 de esta serie debería aterrizar aquí, sobre este campo `reason`.

**Que falle la compuerta también cuenta como ronda.** Antes del `continue`, `rounds` ya se incrementó. Esto es intencional: fallar la compuerta repetidamente significa que el prompt de quien escribe tiene un problema, y dejarlo reintentar indefinidamente solo quema dinero en el mismo hueco.

**Necesitas los dos tipos de condiciones de parada.** La fuente primaria, al hablar de bucles de agente, dice: la tarea a menudo termina al completarse, pero también es habitual incluir condiciones de parada (como una cantidad máxima de iteraciones) para mantener el control[^S1]. De ahí viene «máximo N rondas»—es un fusible, que garantiza que este código se detiene bajo cualquier circunstancia. El mecanismo de parada de «no hay más progreso» viene de otra parte: ejecutar un verificador, corregir lo que falló, y repetir hasta que pase o deje de haber progreso[^S5]. Es más inteligente que el fusible porque vigila **si esta ronda superó a la anterior**, no cuántas rondas se han ejecutado.

Que el puntaje no suba significa salir—esa es la implementación más fácil, pero no la única. Si tu juez no emite un puntaje, puedes cambiar a vigilar **si bajó la cantidad de ítems que fallan**; si la tarea misma tiene mucha varianza, puedes cambiar a «salir solo tras dos rondas consecutivas sin mejora» con un contador `stalled`. Cuál elijas depende de qué tan estable sea tu juez, no de cuál suena más sofisticado. (Fíjate en el `bestDraft` del esqueleto: salir cuando el puntaje no sube presupone que siempre estás reteniendo el borrador con puntaje más alto; llevar solo `bestScore` sin `bestDraft` significa que las salidas `no-progress` y `max-rounds` entregarán la versión actual, que es peor.)

## Componer patrones: esta lección lo llama un «grafo»

Cinco patrones, todos cubiertos. La siguiente pregunta es cómo disponerlos juntos.

Primero la postura oficial: estos bloques de construcción no son prescriptivos, son patrones comunes que los desarrolladores pueden moldear y combinar para encajar con distintos casos de uso; la clave del éxito, como con cualquier funcionalidad de LLM, es medir el desempeño e iterar sobre las implementaciones[^S1].

Dicho de otro modo, para «cómo componer», la fuente primaria da permiso, no una receta. La receta la escribes tú.

### Una declaración honesta sobre la terminología de grafos

**El uso de «grafo / nodos / aristas» a lo largo de esta lección es una metáfora de ingeniería propia de esta lección, no terminología oficial (las secciones anteriores ya usaron «nodo» y «arista de retorno» con este significado).**

Copia esta frase a tu propia documentación de arquitectura. Las palabras «grafo», «nodo», «arista», «DAG», «máquina de estados» aparecen cero veces en todas las fuentes primarias que cita esta lección. El vocabulario de las fuentes primarias es flujos de trabajo, patrones, orquestador-trabajadores, fan-out—está hablando de un catálogo de patrones, no de estructura topológica.

Aun así necesitamos usar la palabra «grafo», porque cuando cinco patrones se sientan juntos necesitas un lenguaje para hablar de ellos con claridad, y «grafo» es la opción de menor esfuerzo. Pero esta metáfora debe tener un punto de anclaje, o es apenas jerga inventada. El ancla es esta frase que sí existe de verdad en los materiales primarios: el script del flujo de trabajo mismo retiene el bucle, las bifurcaciones y los resultados intermedios, mientras que el contexto del modelo retiene solo la respuesta final[^S5].

Esa frase ya nombra los tres elementos de un grafo: bucle (arista de retorno), bifurcación (punto de bifurcación), resultados intermedios (estado). Todo lo que hacemos es ponerle un nombre a cada uno.

### Convenciones de dibujo

En el sistema visual de esta lección:

- **Nodo** = un bucle `runAgent`, o una pieza de código puro (compuerta, clasificación, agregación, agrupamiento en lotes). Etiquetar el tipo de cada nodo es la acción más valiosa al dibujar—te obliga a responder «¿este paso necesita de verdad al modelo?».
- **Arista** = «quién alimenta a quién con su salida». Una arista no es una estructura de datos, apenas la siguiente línea de código que lee la variable de la línea anterior.
- **Estado** = variables del script. El ancla primaria también tiene una frase aquí: los resultados intermedios se quedan en variables del script en vez de aterrizar en el contexto del modelo[^S5]. **No existe ningún concepto oficial de «un objeto de estado que se pasa entre nodos»**—esa es una expresión que tomamos prestada de otros dominios; esta lección no construye esa abstracción, apenas pasa las variables que necesites.

```agentmentor-check
{
  "id": "orc-zh-05-graph-is-ours",
  "label": "Alguien del equipo dice que no encuentra «nodo» ni «arista» en la documentación oficial",
  "prompt": "El documento de arquitectura de tu equipo usa «nodos» y «aristas» para organizar los cinco patrones de orquestación. Durante la revisión, alguien del equipo deja un comentario: «Busqué 'nodes' y 'edges' en la documentación de Anthropic y no encontré nada. ¿Estás inventando citas?». Tiene razón—este sistema visual efectivamente es tuyo. ¿Cómo respondes, y qué debería decir el documento?",
  "whyHere": "Esta lección acaba de introducir el sistema visual de «grafo / nodos / aristas», y aparece cero veces en las fuentes primarias. Esta pregunta practica la honestidad en las citas: las metáforas organizativas propias se pueden usar, pero debes marcarlas como propias en el documento y declarar a qué cita real están ancladas. Los principios de verificación del curso 10 rematan aquí.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Si no se puede buscar, es un problema. Borrar toda la terminología de grafos del documento y reescribirlo usando solo palabras oficiales, aunque quede verboso—más vale prevenir que confundir.",
      "correct": false,
      "feedback": "Eso es reaccionar de más. Las metáforas propias no son lo mismo que fabricar—fabricar es disfrazar de oficial una terminología propia. Borrar el sistema visual pierde el lenguaje que organiza los cinco patrones y se lo pone más difícil a quien lee. El problema es apenas que la procedencia no está etiquetada; arregla la etiqueta y conserva el vocabulario."
    },
    {
      "id": "b",
      "text": "Responder: grafo, nodo y arista son términos generales de la ingeniería de software, usados en compiladores y flujo de datos desde hace décadas—son de conocimiento común y no necesitan explicación de fuentes en el documento.",
      "correct": false,
      "feedback": "Ese es exactamente el problema. Los términos efectivamente son generales, pero en el documento los estás usando como si fueran la clasificación oficial de este conjunto de patrones de orquestación de agentes—quien lee va a suponer naturalmente que «el bucle de revisión es un tipo de nodo oficial dentro de los cinco patrones». Lo que se malinterpreta no es la palabra «grafo» en sí, sino su relación con las fuentes primarias."
    },
    {
      "id": "c",
      "text": "Agregar un párrafo al inicio del documento: marcar que grafo / nodos / aristas es el sistema visual de nuestro equipo, no vocabulario oficial, y señalar a qué cita de fuente está anclado; después verificar las citas de todo el documento.",
      "correct": true,
      "feedback": "Correcto. El costo del vocabulario propio no es «no se puede usar», es «hay que ponerle precio». Marca «este es nuestro sistema visual», señala a qué cita real está anclado, y quien lee se lleva las dos cosas: un lenguaje organizativo útil y una cadena de citas verificable. La pregunta de la búsqueda fallida también se resuelve sola—esa persona estaba buscando vocabulario oficial, y tú nunca afirmaste que lo fuera."
    }
  ]
}
```

## Los cinco patrones en las formas de este sistema visual

```text
Encadenamiento    A ──> B ──> C                    Una línea recta

Enrutamiento         ┌──> B1
                  A ─┼──> B2                       Un punto de bifurcación
                     └──> B3

Paralelización       ┌──> W1 ──┐
                  A ─┼──> W2 ──┼──> fusión         Un abanico: abrir y luego fusionar
                     └──> W3 ──┘

Orquestador-         ┌──> W? ──┐                   El punto de bifurcación es dinámico:
  trabajadores    A ─┼──> W? ──┼──> fusión         cuántas aristas y qué hace cada una
                     └──> W? ──┘                   lo decide A tras ver la entrada

Bucle de revisión A ──> J ──┐                      Un bucle con una arista de retorno
                  ^         │
                  └───no────┘
```

Vale la pena releer la anotación de esa cuarta forma. La paralelización y orquestador-trabajadores son topográficamente similares en forma, y la diferencia clave es que las subtareas no vienen predefinidas sino que las determina el orquestador según la entrada concreta[^S1]. Dibujada en papel, la diferencia es «yo dibujé tres aristas» frente a «A dibujó tres aristas»—indistinguibles en papel, pero muy distintas en código.

### Un ejemplo de composición

Hilando enrutamiento, fan-out, fusión y bucle de revisión:

```text
[clasificar] ─┬─ simple ──> [respuesta directa] ──────────────> entregar
 código puro  │
 (palabras +  └─ complejo ─┬─> [trabajador1] ─┐
   reglas)                 ├─> [trabajador2] ─┼─> {fusión} ─> [borrador] <──┐
                           └─> [trabajador3] ─┘                   │         │
                                                                  v         │
                                                             {compuerta} ─no┤
                                                                  │ pasa    │
                                                                  v         │
                                                             [revisión] ─no─┘
                                                                  │ sí
                                                                  v
                                                              entregar
```

La Lección 6 implementa **una variante de este grafo**: esa tanda de tickets resulta tener criterios de aceptación que se pueden escribir todos como reglas, así que la capa de [revisión] degrada a una {compuerta}, y el fan-out pasa de «un ítem complejo hacia tres trabajadores» a «una tanda de tickets, cada uno despachado a un manejador». Qué partes cambiaron y por qué—la apertura de la Lección 6 las enumera punto por punto. Mira primero la forma que hay aquí; el código espera hasta la lección siguiente.

## Beneficios de ingeniería que trae la composición

Mover el flujo de control al código entrega más que solo «se entiende». Unos cuantos beneficios tienen respaldo primario:

**El seguimiento paso a paso trae recuperabilidad.** El runtime rastrea el resultado de cada agente a medida que avanza la ejecución, que es lo que hace que una ejecución se pueda reanudar dentro de la misma sesión[^S5]. Traducido al sistema visual de esta lección: cada nodo del grafo es naturalmente una ubicación de punto de control—el nodo termina, el resultado aterriza en una variable del script, y esa variable es el registro de «hasta dónde llegamos». El diseño de puntos de control que enseña el curso 9 de esta serie no necesita una base aparte aquí; las fronteras de los nodos son puntos de aterrizaje naturales.

**El fan-out de grano fino preserva más progreso.** Las palabras de la fuente primaria: un flujo de trabajo que reparte el trabajo entre muchos agentes pequeños preserva más progreso que un solo agente largo[^S5]. Un agente largo de cuarenta minutos se cae, y se fueron cuarenta minutos; cuarenta nodos pequeños de un minuto y uno se cae, pierdes un minuto y sabes cuál.

**Las técnicas de calidad repetibles se vuelven reutilizables.** Mover el plan al código también le permite a un flujo de trabajo aplicar un patrón de calidad repetible, no solo ejecutar más agentes: puede hacer que agentes independientes revisen de forma adversarial los hallazgos de los demás antes de que se reporten, o redactar un plan desde varios ángulos y sopesarlos entre sí, de modo que obtienes un resultado más confiable que con una sola pasada[^S5]. La palabra clave aquí es «repetible»—hacer una revisión cruzada a mano es una operación, escribirla en un script es una capacidad.

**Las barreras deterministas envuelven a los agentes no deterministas.** La retrospectiva del sistema multiagente de investigación de Anthropic declara: combinan la adaptabilidad de los agentes de IA construidos sobre Claude con salvaguardas deterministas como lógica de reintento y puntos de control periódicos[^S2]. Traducido al sistema visual de esta lección: el esqueleto del grafo es determinista (quién llama a quién, cuándo parar, qué arista tomar ante un fallo), y el interior de los nodos es no determinista. Esta estratificación no es preferencia estética, es un prerrequisito para hacer el sistema operable.

## Disciplina de composición: cada capa añadida debe pasar una compuerta

Dichos los beneficios, ahora las restricciones.

**Cada capa añadida debe pasar la compuerta de la «mejora medible».** La fuente primaria dice lo mismo en dos lugares, y el segundo lo marca explícitamente como una reiteración: habría que considerar añadir complejidad solo cuando mejora demostrablemente los resultados[^S1]. Esto es especialmente crítico para esta lección—con cinco patrones desplegados frente a ti, el error más fácil es usarlos todos. Añadir un nodo significa una llamada más al modelo, un lugar más donde puede fallar, una cosa más que diagnosticar. Antes de añadirlo, pregunta: si lo quito, ¿bajan las métricas? No poder responder significa que todavía no has medido.

**El reintento y el tiempo límite a nivel de nodo son práctica de ingeniería, no diseño oficial.** Las fuentes primarias mencionan esto solo como una oración subordinada (salvaguardas deterministas como lógica de reintento y puntos de control periódicos[^S2]). Así que lo que sigue está escrito como práctica de ingeniería; no vas a encontrar su respaldo en ninguna documentación primaria: envuelve cada nodo `runAgent` en un tiempo límite, y tras agotarse o bien reintenta o bien marca ese nodo como fallido y continúa; la cantidad de reintentos depende de la naturaleza del nodo (los nodos de recuperación de solo lectura pueden reintentar varias veces, los nodos con efectos secundarios idealmente no se reintentan solos ni una vez); cuando un nodo falla, distingue «esta arista se puede saltar» de «el grafo entero debe detenerse», y no dejes que el fallo de un nodo opcional arrastre la ejecución completa. Esto es sentido común corriente de sistemas distribuidos, apenas aplicado a los agentes—no lo trates como algo nuevo.

**La profundidad está acotada.** La referencia a nivel de producto está ahí mismo: por omisión, un subagente puede lanzar subagentes propios, hasta tres capas por debajo de la conversación principal[^S4]. Tres capas no es un umbral que inventó esta lección, pero el mensaje es claro—la profundidad de anidamiento en productos reales no es ilimitada, y alguien pensó en serio dónde parar. Tu grafo debería tener una respuesta parecida. Si el grafo que dibujaste tiene cinco capas de anidamiento, sospecha primero que la tarea está descompuesta demasiado fino; no te pongas a pensar en cómo soportar más profundidad.

## El grafo no es el objetivo, es una descripción de la forma de la tarea

Hay un modo de fallo que vale especialmente la pena prevenir al final de este curso: **elegir primero una topología vistosa, y después buscar tareas que meterle adentro.**

El orden debería invertirse. Dibuja primero la forma de dependencias propia de la tarea—qué pasos deben hacer fila (la salida del paso anterior es la entrada del siguiente), qué pasos no se afectan entre sí (da igual cuál se ejecute primero), qué paso necesita ver la entrada antes de saber en cuántas piezas partirse, qué paso necesita que alguien critique su salida antes de que sea confiable. Terminado ese dibujo, qué patrones usar queda básicamente decidido: los lugares donde se hace fila son cadenas, los lugares mutuamente independientes son abanicos, los lugares de ver-y-luego-decidir son orquestadores, los lugares que necesitan crítica son bucles.

Los patrones son nombres para formas de tareas, no un menú del que puedes elegir arbitrariamente.

Y por encima de esa disciplina hay una que entra en juego incluso antes: encontrar la solución más simple posible, y aumentar la complejidad solo cuando haga falta[^S1]. Esta frase apareció en la Lección 1, y al final de esta lección sigue siendo la misma frase. Después de aprender cinco patrones, «con una sola llamada a un LLM alcanza» sigue siendo una respuesta completamente válida—las fuentes primarias mismas dicen que para muchas aplicaciones, optimizar llamadas individuales a LLM con recuperación y ejemplos en contexto suele ser suficiente[^S1].

El código de composición completo y ejecutable está en la Lección 6. Esta lección se detiene aquí. Lo que tienes ahora: cinco patrones, un sistema visual, y una lista de cuándo no usarlos.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Dibujar dos grafos y diseñar condiciones de parada para los bucles

Sin código. Usa el sistema visual de esta lección para dibujar un diagrama ASCII para cada una de las dos tareas de abajo (en cercas ```text), **etiquetando cada nodo como bucle `runAgent` o como código puro**.

**Tarea uno · Tickets de clientes**: Llega un ticket, primero se clasifica (reembolso / técnico / queja), se enruta por categoría hacia flujos de manejo distintos; después del manejo, se hace puntaje de riesgo, los de riesgo alto deben pasar por un bucle de revisión antes de enviarse, los de riesgo bajo se envían directamente.

**Tarea dos · Evaluación de código de 40 módulos**: Una ejecución evalúa 40 módulos, los agrupa en lotes y los reparte en abanico para evaluación en paralelo, termina y fusiona, y después un nodo escribe el informe resumen; el informe debe pasar una compuerta (¿los 40 módulos tienen conclusión? ¿los puntajes están en rango válido? ¿las referencias se pueden parsear?), y que falle significa patearlo de vuelta para reescritura.

Después de dibujar, diseña condiciones de parada para el bucle de cada grafo (el bucle de revisión de la tarea uno, el bucle de la compuerta del informe de la tarea dos): la cantidad máxima de rondas es un fusible obligatorio y no participa en la selección; entre «pasa» y «no hay más progreso», decide cuál es el mecanismo de parada principal y explica por qué conservaste o descartaste el otro.

<!-- rubric -->

- Los dos grafos etiquetan cada nodo como `runAgent` o código puro, y clasifican, puntúan riesgo, agrupan en lotes, fusionan y compuertan como código puro (clasificar usando un LLM también vale si explicas por qué no un clasificador tradicional)
- El grafo de la tarea uno tiene un punto de bifurcación real (tres o más aristas mutuamente excluyentes), el grafo de la tarea dos muestra tanto la acción de fan-out como la de fusión
- Los dos bucles dibujan la arista de retorno (falla → de vuelta al nodo de generación), no dibujada como línea recta
- Cada bucle conserva el fusible de cantidad máxima de rondas y aclara cuál es principal y cuál secundario entre «pasa» y «no hay más progreso», con un razonamiento atado a la naturaleza de la tarea
- «No hay más progreso» se define como una cantidad decidible (el puntaje no subió, la cantidad de ítems que fallan no bajó), no apenas «el modelo parece no haber mejorado»
- Declara qué pasa después de cada desenlace de parada (entregar / traspaso a una persona / escalar), no colapsa los tres desenlaces en un booleano

<!-- answer -->

**Grafo de referencia de la tarea uno**

```text
[clasificar] ──┬── reembolso ──> [manejo reembolso] ──┐
  código puro  │                                      │
 (palabras +   ├── técnico ────> [manejo técnico] ────┤
   reglas)     │                                      │
               └── queja ──────> [manejo queja] ──────┤
                                   runAgent × 3       │
                                                      v
                                            {puntaje de riesgo}                   código puro
                                                      │                           (umbral de monto /
                                                      │                            palabras sensibles / marca VIP)
                       riesgo bajo ───────────────────┴── riesgo alto
                            │                                  │
                            │                        [redactar respuesta] <────┐  runAgent
                            │                                  │               │
                            │                     {compuerta de cumplimiento}  │  código puro
                            │                                  │               │
                            │                             [revisión] ──── no ──┘  runAgent
                            │                                  │ sí
                            v                                  v
                        [enviar] ────────────────────> [enviar]                   código puro
```

Marcar clasificar como código puro es intencional: la clasificación de tickets es territorio típico de «un modelo o algoritmo de clasificación tradicional lo puede manejar con precisión»—no uses un modelo si no hace falta. Si las fronteras de tus categorías son difusas y no se pueden escribir reglas, cambiarlo a `runAgent` también es correcto, pero anota la razón en el grafo.

**Condiciones de parada de la tarea uno: pasa + máximo de rondas.**

Descarta «no hay más progreso». Razón: este bucle evalúa **cumplimiento**—«no pasó» significa que esta respuesta no puede salir, no es un puntaje de calidad con el que puedas transigir. Si sales porque el puntaje no subió y la envías igual, estás usando una regla de ahorro para liberar contenido que no cumple. El máximo de rondas actúa aquí como fusible: se agotan las rondas sin pasar, y el desenlace es **traspaso a una persona**, no enviar. Tres desenlaces: `passed` → enviar directamente, `max-rounds` → entrar a la cola humana con la retroalimentación de la última ronda del juez adjunta, la compuerta falla repetidamente → alerta (significa que el prompt del borrador está roto).

**Grafo de referencia de la tarea dos**

```text
[leer lista de 40 módulos]                            código puro
                          │
            {lotes: 5 lotes × 8 cada uno}             código puro (techo de concurrencia fijo en el código)
                          │
    ┌──────────┬──────────┼──────────┬──────────┐
    v          v          v          v          v
[evaluar]  [evaluar]  [evaluar]  [evaluar]  [evaluar]  runAgent × 5, por módulo dentro del lote
    │          │          │          │          │
    └──────────┴──────────┬──────────┴──────────┘     código puro: recolectar resultados, registrar fallos, rellenar si hace falta
                          │
                 [escribir resumen] <─────────────┐   runAgent
                          │                       │
               {compuerta del informe} ── falla ──┘    código puro: ¿los 40 módulos tienen conclusión?
                          │                           ¿puntajes de 0 a 100? ¿referencias parseables?
                          │ pasa
                          v
                      entregar
```

**Condiciones de parada de la tarea dos: pasa + no hay más progreso.**

Esta compuerta revisa **huecos enumerables** (qué módulos carecen de conclusión, qué referencias no se pueden parsear), así que «hay progreso» se puede definir de forma muy rígida: ¿bajó la cantidad de ítems que fallan de esta ronda comparada con la anterior? Si bajó, continúa; si no bajó, para—que pase una ronda con la cantidad de huecos sin cambios suele significar que la causa raíz está aguas arriba (los resultados de evaluación de esos módulos venían vacíos desde el principio), y reescribir el nodo del informe cien veces no los va a materializar. Detenerse en este punto y entregarle a una persona la lista de huecos más el registro de fallos de aguas arriba es más útil que seguir quemando dinero.

Descarta «máximo de rondas» como mecanismo principal (puedes superponer un valor grande como fusible de respaldo, digamos 10, pero normalmente no debería dispararse). Razón: «no hay más progreso» decide antes y con más precisión para esta tarea; el techo de rondas solo entra a jugar cuando aquel falla.

<!-- hint -->

Al etiquetar tipos de nodo, si te atascas en «¿este paso cuenta como código puro?», pregunta: **dada la misma entrada ejecutada dos veces, ¿la salida de este paso será distinta?** Será distinta = `runAgent`, no lo será = código puro. Los nodos de tu grafo que hacen agregación, filtrado y decisiones probablemente caen todos en esta última categoría.

<!-- hint -->

Al diseñar condiciones de parada, primero piensa con claridad **cuál es la acción del paso siguiente para cada mecanismo de parada**. Si «no hay más progreso» y «pasa» disparan la misma acción (ambos entregan), este bucle probablemente no necesita «no hay más progreso» en absoluto; si los tres desenlaces mapean a tres manejadores distintos aguas abajo, seguramente necesitas conservar los tres.

### Nivel 2: Tres escenarios, juzgar si vale la pena construir cada bucle

Sin código. Usa las dos señales de decisión de esta lección—(1) cuando una persona articula la retroalimentación con claridad, la salida efectivamente se puede mejorar de forma demostrable; (2) el LLM también puede aportar esa retroalimentación—para juzgar cada uno de los tres escenarios de abajo, y da tu recomendación de manejo.

**Escenario uno · Pulido de textos**: Un generador de titulares para una landing page de marketing. La persona a cargo del producto dice que los textos generados actualmente son «usables pero planos», aporta dos o tres puntos concretos cada vez (el argumento de venta no aterriza en la primera frase, la llamada a la acción es demasiado suave, el largo excede el límite de dos líneas en móvil), y la versión posterior a su retroalimentación es notablemente mejor. El equipo pregunta si añadir un bucle de revisión.

**Escenario dos · Verificación de totales financieros**: Un agente que genera resúmenes financieros mensuales a partir de comprobantes crudos. Varios totales del resumen frecuentemente no cuadran; alguien propone añadir un «agente auditor» que lea el resumen, señale las partes mal calculadas, las patee de vuelta para recalcular, y repita hasta que el agente auditor apruebe.

**Escenario tres · Estilo de nombres de componentes**: Un agente que nombra componentes nuevos y escribe la documentación. Las valoraciones de la salida por parte de tres colegas de frontend son crónicamente inconsistentes: A dice que los nombres son demasiado verbosos, B dice que no son lo bastante descriptivos, C piensa que cualquiera de las dos está bien pero que el tono de la documentación es demasiado formal. Alguien propone añadir un bucle de revisión con un «agente revisor de estilo» como guardián.

<!-- rubric -->

- Los tres escenarios se contrastan uno por uno contra ambas señales, cada señal recibe un juicio claro de «cumple / no cumple» con su razonamiento, no apenas un puntaje de impresión general
- El escenario uno se juzga «vale la pena construirlo», con diseño de condiciones de parada incluido, no se queda en la palabra «vale»
- El escenario dos se juzga «no debería construirse un agente revisor», señala explícitamente que el reemplazo es un verificador determinista (el código recalcula los totales y compara), y explica que la razón es que lo que el código puede decidir de forma definitiva no debería entregarse a un juez no determinista
- El escenario tres se juzga «el problema está en la precondición», señala que los criterios de evaluación no son claros y que los juicios de las propias personas son inconsistentes, y la conclusión es definir criterios primero en vez de construir el bucle primero
- Al menos un escenario nombra «qué pasa si construyes mal el bucle» con consecuencias concretas (dinero extra gastado, salida que rebota, errores que se cuelan)
- No equipara «vale la pena construirlo» con «más rondas es mejor»

<!-- answer -->

**Escenario uno: Vale la pena construirlo.**

La señal uno se cumple, y la evidencia está hecha—la retroalimentación de la persona de producto lleva a versiones notablemente mejores, y este ciclo de «la retroalimentación humana funciona» ya se ejecutó muchas veces a mano, no hace falta volver a validarlo. La señal dos también se cumple: sus tres puntos (posición del argumento de venta, fuerza de la llamada a la acción, largo) se pueden escribir todos en una rúbrica, y el modelo puede perfectamente dar el mismo tipo de retroalimentación. Los criterios de evaluación también son razonablemente claros.

Recomendación: solidifica sus tres puntos en la rúbrica del juez, pero **no le entregues al juez «excede el límite de dos líneas en móvil»**—usa el conteo de caracteres para decidirlo de forma definitiva, ponlo en una compuerta. Las condiciones de parada usan «pasa + máximo de rondas», con las rondas fijadas en 2–3; los textos tienden a volverse más planos con demasiadas correcciones, así que el máximo de rondas aquí no es apenas un fusible, es en sí mismo un control de calidad. Si las rondas se agotan sin pasar, entrega la versión final más la retroalimentación del juez a la persona de producto para el corte final.

**Escenario dos: No debería construirse este agente auditor.**

Las dos señales no son lo clave aquí—hay un juicio que entra en juego incluso antes: el código puede decidir esto de forma definitiva. Si un total es correcto es un problema determinista: toma los números de los comprobantes crudos y súmalos de nuevo, si no coincide no coincide, y el resultado es idéntico cada vez. Hacer que un juez no determinista evalúe algo que debería ser determinista te cuesta dos cosas (una llamada extra al modelo) más un riesgo (el juez mismo podría marcar erróneamente como incorrecto lo correcto, o dejar colar lo incorrecto).

Recomendación: escribe un verificador, usa código para recalcular cada total y cada relación de contraste, y que fallar signifique lanzar «qué ítem, valor calculado, valor que debería ser» directo de vuelta al nodo de generación. Esto sigue siendo un bucle, con la misma forma que el bucle de revisión, pero el nodo dentro del bucle es código puro y no un agente—esta es la disciplina de puntuación por capas del curso 10: usa código para lo que el código puede decidir, y entrégale al modelo solo lo que el código no puede. Si de verdad quieres dejarle un lugar al modelo, déjaselo para las partes que el código no puede decidir, como «¿la narrativa textual del resumen concuerda con los números?».

**Escenario tres: No construyas el bucle primero, define los criterios primero.**

La señal uno ya no se cumple: la retroalimentación de las tres personas se contradice entre sí, lo que significa que no hay una retroalimentación de consenso del tipo «mejora cuando una persona la aporta»—implementas la retroalimentación de A y B queda más insatisfecho. La señal dos todavía menos, el modelo no puede dar una retroalimentación sobre la que ni siquiera las personas han llegado a consenso. La precondición de «criterios de evaluación claros» directamente no se sostiene aquí.

Si lo construyes a la fuerza, obtendrás de forma confiable ese fallo predecible: la retroalimentación del juez apunta en direcciones distintas cada ronda, los nombres rebotan entre verbosos y escuetos, las rondas se agotan, el borrador final no es mejor que el primero, y las tres personas siguen teniendo cada una sus quejas—apenas automatizaste una discusión sin conclusión mientras pagabas por cada ronda.

Recomendación: que las tres personas primero se sienten y escriban las reglas de nombres en una lista de verificación decidible (usar abreviaturas o no, verbo primero o sustantivo primero, máximo cuántas palabras, la documentación en qué persona). Una vez que exista la lista, la señal uno y la señal dos se van a sostener las dos, y ahí sí vuelve a construir el bucle, y para entonces la mayoría de las condiciones ya se podrán decidir de forma definitiva en una compuerta. **La verdadera lección de este escenario: los bucles de revisión no producen criterios, solo ejecutan criterios.**

<!-- hint -->

Antes de juzgar, haz una cosa primero: escribe textualmente «la retroalimentación que daría una persona». Mira a qué se parece después de escribirla—si parece una afirmación que puede ser verdadera o falsa en el acto («a esta sección le falta el número de ticket»), probablemente debería ir al código; si parece un juicio que requiere criterio («el tono es demasiado suave»), entonces es el turno del juez.

<!-- hint -->

Si algún escenario te tiene atascado, prueba a interpretar el papel del juez: despliega la entrada que tienes, y fíjate si tú mismo puedes escribir un enunciado de retroalimentación claro y específico para quien escribe. Si tú no lo puedes escribir, el modelo probablemente tampoco—eso no es un problema del modelo, es un problema de los criterios.

<!-- /exercises -->

## Resumen

- Revisar y refinar es una llamada a un LLM que genera una respuesta mientras otra aporta evaluación y retroalimentación en un bucle[^S1]; su forma de producto es «ejecutar un verificador, corregir lo que falló, repetir hasta que pase o deje de haber progreso»[^S5], y la revisión cruzada adversarial es otro uso de la misma división del trabajo (revisión cruzada única, sin arista de retorno); meterla dentro del bucle de revisión es una categorización de esta lección[^S5]. El curso 6 de esta serie la llama productor-revisor, ese es vocabulario didáctico nuestro, y el vocabulario primario es evaluator-optimizer[^S1].
- Que valga la pena construirlo depende de dos señales: las respuestas del LLM se pueden mejorar demostrablemente cuando una persona articula su retroalimentación, y el LLM también puede aportar esa retroalimentación; es particularmente efectivo cuando los criterios de evaluación son claros y el refinamiento iterativo aporta valor medible[^S1]. Cuando los criterios no son claros, define criterios primero, no construyas el bucle primero.
- Las condiciones de parada no son de un solo tipo: las condiciones de parada como una cantidad máxima de iteraciones se usan para mantener el control[^S1], y «no hay más progreso» es otro mecanismo de parada más rentable[^S5]; tres desenlaces (pasa / rondas agotadas / sin progreso) mapean a tres acciones distintas aguas abajo, no los colapses en un booleano. Las compuertas deterministas van antes de los jueces.
- Los cinco patrones se pueden componer: estos bloques de construcción no son prescriptivos, son patrones comunes que los desarrolladores pueden moldear y combinar para encajar con distintos casos de uso, y la clave del éxito es medir el desempeño e iterar sobre las implementaciones[^S1].
- «Grafo / nodos / aristas» es el sistema visual propio de esta lección, no terminología oficial; su ancla primaria es apenas una frase—el script del flujo de trabajo mismo retiene el bucle, las bifurcaciones y los resultados intermedios, mientras que el contexto del modelo retiene solo la respuesta final[^S5], más que los resultados intermedios se quedan en variables del script[^S5]. Cuando uses este vocabulario en tus propios documentos, incluye esta declaración junto con él.
- Los beneficios de la composición están documentados: el runtime rastrea el resultado de cada agente a medida que avanza la ejecución, que es lo que hace que una ejecución se pueda reanudar dentro de la misma sesión[^S5]; un flujo de trabajo que reparte el trabajo entre muchos agentes pequeños preserva más progreso que un solo agente largo[^S5]; mover el plan al código también le permite a un flujo de trabajo aplicar técnicas de calidad repetibles (revisión cruzada adversarial, redactar desde varios ángulos y luego sopesar)[^S5]; las salvaguardas deterministas (lógica de reintento y puntos de control periódicos) envuelven a los agentes no deterministas[^S2].
- Las restricciones son igual de claras: habría que considerar añadir complejidad solo cuando mejora demostrablemente los resultados[^S1]; el reintento y el tiempo límite a nivel de nodo son práctica de ingeniería corriente, y las fuentes primarias ofrecen apenas una oración subordinada[^S2]; la profundidad también está acotada, y la referencia a nivel de producto es que los subagentes se anidan hasta tres capas por debajo de la conversación principal[^S4]; la solución más simple primero[^S1].

[>> Lección 6: Manos a la obra: convertir tu arnés en un grafo pequeño](./06-build-a-graph.md)
