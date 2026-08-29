# Lección 1: De la ingeniería de prompts a la ingeniería de contexto

> Objetivos de aprendizaje:
> - Reformular las definiciones de ingeniería de prompts e ingeniería de contexto, y decir por qué las dos son una «evolución» y no un «reemplazo»
> - Usar las dos ideas de «presupuesto de atención» y «degradación de contexto» para explicarle a un colega qué tiene de malo «la ventana es lo bastante grande, así que mete todo adentro»
> - Señalar los puntos del bucle del arnés que construiste en el curso de esta serie «Fundamentos del arnés de agente: bucles y control» donde el contexto solo crece y nunca se encoge
>
> Requisitos: Terminaste el curso de esta serie «Fundamentos del arnés de agente: bucles y control» y tienes a mano un bucle funcional guiado por stop_reason | Siguiente: [Lección 2 >>](./02-anatomy-of-context.md)

## Una escena familiar: en cada turno del bucle la ventana pesa más

En el curso de esta serie «Fundamentos del arnés de agente: bucles y control» escribiste a mano un bucle como este (simplificado; las cuatro válvulas de control —máximo de turnos, presupuesto y las demás— quedan fuera por ahora):

```javascript
let response = await client.messages.create({
  model: MODEL, max_tokens: 1024, tools, messages, // no le quites el ojo al arreglo messages
});

while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });

  const toolResults = await runToolUses(response.content, toolImpls);
  messages.push({ role: "user", content: toolResults }); // los resultados de herramientas también entran

  response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
}
```

En ese momento toda nuestra atención estaba puesta en el flujo de control: cómo leer `stop_reason`, cómo instalar las válvulas de control. Ahora cambia el ángulo y clava la vista en el arreglo `messages`: solo recibe `push`, nunca se recorta. En cada turno entran al menos dos cosas: la respuesta del modelo para ese turno (con sus bloques tool_use) y los resultados que devuelven las herramientas. Lo segundo suele ser el grueso: imagina un solo `list_files` que trae unos cientos de nombres de archivo, o una búsqueda en logs que trae decenas de KB de texto crudo. A partir de ahí se quedan en la ventana para siempre, releídos desde cero en cada ronda de razonamiento.

Esto no es un desliz de tu implementación; es la naturaleza de un agente. "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"[^S1] (un agente que se ejecuta en un bucle genera cada vez más datos que podrían ser relevantes para el siguiente turno de inferencia), y como es él quien tiene la autonomía, puede seguir durante muchísimos turnos[^S2]. En el curso de esta serie «Fundamentos de la ingeniería de prompts: cómo escribir instrucciones eficaces» aprendiste a escribir con claridad una sola instrucción, pero por bien escrita que esté una instrucción, sigue siendo un bloque pequeño dentro de la ventana. Lo que de verdad decide cómo se desempeña el agente en el turno 40 es todo lo que quede alojado en la ventana completa en ese momento.

## Dos definiciones: de «escribir una buena oración» a «gestionar toda la ventana»

Formaliza esa observación y te quedan dos definiciones.

**Ingeniería de prompts**: "Prompt engineering refers to methods for writing and organizing LLM instructions for optimal outcomes"[^S1] (la ingeniería de prompts se refiere a métodos para escribir y organizar instrucciones de LLM con miras a resultados óptimos). La pregunta que responde es: «¿cómo debería escribir y ordenar esta instrucción para que rinda al máximo?».

**Ingeniería de contexto**: "the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference"[^S1] (el conjunto de estrategias para curar y mantener el conjunto óptimo de tokens —información— durante la inferencia del LLM). La pregunta que responde es: «para esta ronda de razonamiento, ¿qué tokens deberían estar en la ventana y cuáles no?».

Fíjate en el cambio de altura de la mirada. Lo primero es un problema de redacción de una sola vez: lo escribes una vez y queda fijo. Lo segundo es una disyuntiva que tienes que volver a responder en cada turno del bucle. Anthropic enmarca explícitamente la ingeniería de contexto como la progresión natural de la ingeniería de prompts —"we view context engineering as the natural progression of prompt engineering"[^S1] (vemos la ingeniería de contexto como la progresión natural de la ingeniería de prompts)—, así que la destreza que acumulaste en el curso de esta serie «Fundamentos de la ingeniería de prompts: cómo escribir instrucciones eficaces» no se desperdicia en absoluto. Se vuelve un subconjunto de un problema mayor: el prompt del sistema sigue teniendo que estar bien escrito, pero es solo uno de los muchos ingredientes de contexto que ahora tienes que gestionar.

En la comunidad hay posturas más agresivas. Una hoja de ruta de ingeniería de agentes de 2026 afirma "Prompt engineering is dead as a standalone skill in 2026."[^S5] (la ingeniería de prompts está muerta como habilidad autónoma en 2026). Ten en cuenta que es la opinión con sesgo propio de esa hoja de ruta, y esta lección no la toma como consenso: la formulación de Anthropic es mucho más medida, evolución y no reemplazo[^S1]. Dicho eso, vale la pena guardarse la definición de una línea que esa misma hoja de ruta da de la ingeniería de contexto: "deciding what tokens are in front of the model at every step of the loop"[^S5] (decidir qué tokens están frente al modelo en cada paso del bucle). Y esa misma hoja de ruta pone el dedo en cuánto importa el arnés: "Same model, different harness, completely different result."[^S5] (mismo modelo, distinto arnés, resultado completamente distinto), algo que ya deberías sentir en las tripas después de los experimentos del curso de esta serie «Fundamentos del arnés de agente: bucles y control».

## Presupuesto de atención: cada token nuevo engorda la cuenta

¿Por qué es esto algo que tienes que gestionar? ¿Una ventana más grande no es simplemente vía libre? Eso nos lleva al primer hecho físico.

"LLMs have an "attention budget" that they draw on when parsing large volumes of context"[^S1] (los LLM tienen un «presupuesto de atención» del que echan mano al analizar grandes volúmenes de contexto). El detalle es que ese presupuesto es finito: "Every new token introduced depletes this budget by some amount"[^S1] (cada token nuevo que se introduce agota ese presupuesto en cierta medida).

Va una analogía. La capacidad de la ventana es la superficie de un almacén; el presupuesto de atención es la cuadrilla que mandas adentro a encontrar la mercancía. Amplía el almacén diez veces y la cuadrilla no crece con él: cuanto más llenos los estantes, más cuesta desenterrar el único artículo que de verdad quieres. Colar un documento más «por si acaso» en la ventana no es un respaldo gratis; es un cargo real contra el presupuesto, pagado para cubrir el costo de leerlo y descartarlo.

Cambia a esta mirada y muchos hábitos merecen una segunda revisión. «La ventana lo aguanta, así que peguemos el documento completo de la API»: que quepa es una pregunta de almacén, que se lea bien es una pregunta de presupuesto, y las dos no son lo mismo.

## Degradación de contexto: una pendiente suave, no un acantilado

La consecuencia macro de un presupuesto que se agota de forma continua tiene un nombre vívido: la **degradación de contexto** (context rot), "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"[^S1] (a medida que aumenta el número de tokens en la ventana de contexto, disminuye la capacidad del modelo de recordar con precisión información de ese contexto).

Dos detalles fáciles de entender mal, fijados aquí:

**Primero, es gradual, no una caída súbita.** Esta degradación aparece como una pendiente de rendimiento —"These factors create a performance gradient rather than a hard cliff"[^S1] (estos factores crean un gradiente de rendimiento en vez de un acantilado abrupto)—, no como un acantilado abrupto donde las cosas dejan de funcionar de golpe pasado cierto número de tokens. Así que nunca vas a recibir un error; el agente simplemente se va poniendo más torpe. En términos cotidianos (esta es la forma típica que toma en la experiencia de ingeniería, no una enumeración de la fuente): las convenciones confirmadas antes empiezan a olvidarse, los archivos ya leídos se vuelven a leer, los bugs ya arreglados se revierten. Una degradación sin alarma cuesta más de rastrear que un error.

**Segundo, es una regla general, no la manía de un modelo.** Algunos modelos se degradan con más suavidad que otros, pero "some models exhibit more gentle degradation than others, this characteristic emerges across all models"[^S1] (aunque algunos modelos exhiben una degradación más suave que otros, esta característica emerge en todos los modelos). Cambiar a un modelo más potente puede posponer el problema; no puede cancelarlo.

Junta esas dos cosas y tienes la primera piedra angular de esta lección: "context, therefore, must be treated as a finite resource with diminishing marginal returns"[^S1] (el contexto, por lo tanto, debe tratarse como un recurso finito con rendimientos marginales decrecientes). El token número mil que embutes en la ventana y el número cien mil ocupan el mismo espacio, pero están a mundos de distancia en el valor que aportan. El instinto de «más es más seguro» apunta exactamente al revés: cada pizca extra de «seguro» que amontonas diluye la atención del modelo sobre la información que de verdad importa.

```agentmentor-check
{
  "id": "ctx-zh-01-finite-attention",
  "label": "Poner a prueba el instinto de «meter todo por seguridad» con el presupuesto de atención",
  "prompt": "Un colega te ve sopesando qué poner en la ventana en cada turno y te dice: «la ventana del modelo es de 200K tokens; mete ahí la documentación del proyecto, el historial completo de la conversación y todas las descripciones de herramientas: tener toda la información es más seguro que quedarse sin alguna». ¿Qué juicio es el correcto?",
  "whyHere": "La sección anterior acaba de cubrir el presupuesto de atención y la degradación de contexto, así que esto comprueba si de verdad soltaste el instinto de «más es más seguro»: es el error de concepto central que esta lección necesita romper, y las cinco lecciones que siguen se apoyan en ese cimiento.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "El colega tiene razón: mientras la ventana no esté llena, la información de más simplemente se queda ahí sin usarse y no cuesta nada.",
      "correct": false,
      "feedback": "«Que no esté llena quiere decir que no cuesta» es un error de concepto: analizar grandes volúmenes de contexto consume por sí mismo el presupuesto de atención, cada token nuevo lo agota en cierta medida, y el contenido irrelevante diluye la capacidad del modelo de recordar la información clave. Todo esto es independiente de si la ventana llegó o no a su tope."
    },
    {
      "id": "b",
      "text": "Cada token nuevo consume el presupuesto finito de atención, y cuantos más tokens hay, peor funciona el recuerdo preciso: el contexto es un recurso finito con rendimientos marginales decrecientes, así que «llena» no quiere decir «segura».",
      "correct": true,
      "feedback": "Correcto. La capacidad de la ventana y el presupuesto de atención son dos cosas distintas: la primera decide cuánto puedes meter, el segundo decide qué tan bien lo puedes usar. Aunque la degradación es una pendiente y no un acantilado, la tendencia aparece en todos los modelos, así que las disyuntivas no son opcionales."
    },
    {
      "id": "c",
      "text": "El problema es solo el costo: más tokens cuestan más dinero, pero mientras puedas pagar la cuenta, llenar la ventana no afecta la calidad de las respuestas.",
      "correct": false,
      "feedback": "El costo sí sube, pero ese no es el problema de fondo: cuantos más tokens hay, peor es la capacidad del modelo de recordar con precisión información del contexto. Es una regla de rendimiento que no tiene relación con la facturación, y ninguna cantidad de dinero recupera la atención diluida."
    }
  ]
}
```

## De vuelta a los agentes: por qué esto es el cimiento y no un adorno

En una pregunta y respuesta de un solo turno quizá ni notes la degradación de contexto: la ventana se usa una vez y se descarta, y el conteo de tokens no suele llegar a la zona de peligro. Los agentes convierten este problema de «algo que se encuentra de vez en cuando» en «algo que empeora en cada turno»: los datos del bucle solo crecen y nunca se encogen[^S1], y los agentes pueden ejecutarse de forma autónoma durante muchos turnos[^S2]. Vuelve a mirar el código de la apertura: ese arreglo `messages` que solo recibe `push` y nunca devuelve nada es este proceso hecho concreto.

La experiencia de ingeniería sobre el terreno coincide por completo. La documentación oficial de Claude Code afirma que "Claude's context window fills up fast, and performance degrades as it fills."[^S4] (la ventana de contexto de Claude se llena rápido, y el rendimiento se degrada a medida que se llena). A la ventana de contexto la llaman "the most important resource to manage."[^S4] (el recurso más importante que hay que gestionar). Esa misma documentación tiene además una observación que vale la pena copiarse: "A clean session with a better prompt almost always outperforms a long session with accumulated corrections."[^S4] (una sesión limpia con un mejor prompt casi siempre rinde más que una sesión larga con correcciones acumuladas). «Haber hablado más rato» no quiere decir «haber hablado mejor», y cada corrección amontonada, cada digresión recorrida, sigue alojada en la ventana participando de la siguiente ronda de razonamiento.

Así que aquí va una ubicación precisa para la ingeniería de contexto: no es el pulido que agregas en la fase de ajuste; es el cimiento de la confiabilidad de un agente. Las cuatro válvulas de control del curso de esta serie «Fundamentos del arnés de agente: bucles y control» gestionan «que el bucle no se desboque»; este curso instala otro juego de mecanismos: «que la ventana no se degrade». Junta los dos juegos y tu arnés queda de verdad listo para que se le confíen tareas largas.

## La hoja de ruta de este curso

Para tareas de horizonte largo, Anthropic resume tres clases de técnicas —"compaction, structured note-taking, and multi-agent architectures," (compactación, toma de notas estructurada y arquitecturas multiagente)— orientadas a ayudar a los agentes a "maintain coherence, context, and goal-directed behavior over sequences of actions"[^S1] (mantener coherencia, contexto y comportamiento dirigido a objetivos a lo largo de secuencias de acciones). Este curso sigue ese camino:

- La **Lección 2** disecciona la ventana: prompt del sistema, definiciones de herramientas, ejemplos; cuánto espacio ocupa cada uno y cómo escribirlos sin desperdicio.
- La **Lección 3** cubre la recuperación justo a tiempo: en vez de embutir todo el material por adelantado, darle al agente identificadores ligeros y dejar que vaya a buscar las cosas bajo demanda.
- La **Lección 4** cubre la compactación y las notas: cuando la ventana se acerca al límite, cómo resumir y reiniciar, y cómo registrar la información clave fuera de la ventana.
- La **Lección 5** cubre los subagentes y el aislamiento de contexto: mandar el trabajo exploratorio desordenado a un subagente con una ventana limpia y traer de vuelta solo la conclusión destilada.
- La **Lección 6** vuelve a tu propio arnés e instala estos mecanismos uno por uno.

Un último recordatorio sobre la proporción. Cada uno de estos mecanismos añade complejidad, y la guía de ingeniería de Anthropic dice "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] (habría que considerar añadir complejidad solo cuando mejora demostrablemente los resultados). Por eso cada lección de aquí en adelante explica «cuándo vale la pena hacerlo» antes de explicar «cómo hacerlo»: no todo agente necesita subagentes, y no toda tarea vale la pena compactarla.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Ordenar seis prácticas en dos cajones

Abajo hay seis prácticas. ¿Cuáles pertenecen sobre todo a la ingeniería de prompts (centrada en «cómo escribir y organizar la instrucción en sí») y cuáles pertenecen sobre todo a la ingeniería de contexto (centrada en «qué tokens mantener en la ventana en cada ronda de razonamiento»)? Clasifica cada una y escribe una oración de justificación para cada cual.

1. Reescribir el prompt del sistema de «eres un asistente» a una descripción concreta de responsabilidades y límites
2. En cada turno del arnés, reemplazar los resultados de herramientas de tres turnos atrás por un resumen de una línea
3. Agregar a la instrucción de la tarea un ejemplo del tipo «la entrada se ve así, la salida se ve asá»
4. Ante un manual de producto de 500 páginas, darle al modelo solo el índice y las rutas de archivo, y dejar que consulte cuando lo necesite
5. Cambiar «sé conciso» en la instrucción por «responde en no más de tres oraciones»
6. Cuando la sesión llega al turno 40, comprimir el historial completo en un resumen y usarlo para reiniciar con una ventana nueva

<!-- rubric -->
- Ofrece un criterio claro para el juicio: si la práctica cambia «la calidad de algún texto de instrucción» o «la entrada, la salida y la permanencia del conjunto de tokens en la ventana», en vez de pegar etiquetas a ojo
- La clasificación coincide con la respuesta de referencia (1, 3 y 5 son ingeniería de prompts; 2, 4 y 6 son ingeniería de contexto), o bien, para los casos en disputa, da un argumento autoconsistente basado en el criterio enunciado
- Sabe usar las ideas de presupuesto de atención o de recurso finito para explicar por qué la categoría de ingeniería de contexto no es opcional en escenarios de agentes de varios turnos

<!-- answer -->
Criterio: mira el objeto sobre el que actúa la práctica. Si modifica **cómo está escrito en sí un texto de instrucción** (redacción, estructura, ejemplos), y una vez escrito queda fijo, eso es ingeniería de prompts. Si decide **qué contenido entra en la ventana, en qué forma se queda y cuándo se va**, y hay que ejecutarlo repetidamente dentro del bucle en marcha, eso es ingeniería de contexto.

Punto por punto:

- **1 → Ingeniería de prompts.** Cambia la calidad del texto del prompt del sistema, se escribe una vez y listo; no involucra la entrada ni la salida del contenido de la ventana.
- **2 → Ingeniería de contexto.** Decide la permanencia y la remoción de los resultados de herramientas viejos en la ventana: cambiar el original por un resumen es una acción de mantenimiento de la ventana que se ejecuta en cada turno.
- **3 → Ingeniería de prompts.** Agregar ejemplos es organizar los componentes de la instrucción para transmitir mejor la intención.
- **4 → Ingeniería de contexto.** Elegir entre «el texto completo en la ventana» y «solo las rutas, consultar bajo demanda» es exactamente decidir qué tokens entran en la ventana.
- **5 → Ingeniería de prompts.** Cambiar una redacción difusa por una restricción comprobable es reescritura de instrucciones de manual.
- **6 → Ingeniería de contexto.** Resumir y reiniciar cambia el conjunto de tokens de toda la ventana y no tiene nada que ver con cómo está escrita una instrucción concreta.

Por qué la segunda categoría no es opcional en escenarios de agentes de varios turnos: los datos del bucle solo crecen y nunca se encogen, mientras que el presupuesto de atención es finito y cada token nuevo consume una parte; el contexto es un recurso finito con rendimientos marginales decrecientes[^S1]. Por bien escrita que esté la instrucción, no puede impedir que la ventana se llene turno a turno de resultados de herramientas e historial de mensajes: alguien (o sea, tu arnés) tiene que hacer las disyuntivas.

<!-- hint -->
Vuelve a las dos definiciones: una trata de «cómo escribir y organizar instrucciones», la otra de «qué conjunto óptimo de tokens mantener en la ventana al momento de razonar». Para cada práctica, pregúntate: ¿cambia la redacción de un texto, o la entrada, la salida y la permanencia del contenido de la ventana?

<!-- hint -->
Otra prueba de tornasol: ¿esta práctica se escribe una vez y listo, o es una acción que hay que ejecutar en cada turno (o en turnos concretos) del bucle? Lo segundo casi siempre es gestionar la ventana.

### Nivel 2: Instalar un medidor mínimo de observación sobre el bucle

Sin llamar a un modelo real, escribe un script independiente que simule el bucle del curso de esta serie «Fundamentos del arnés de agente: bucles y control» ejecutándose durante 20 turnos: en cada turno, agrega a `messages` un mensaje de asistente simulado (supón 200 caracteres) y un resultado de herramienta simulado (supón 3000 caracteres), e imprime el conteo acumulado de caracteres turno a turno. Después agrega un interruptor: conservar solo los resultados de herramientas de los 5 turnos más recientes (sacar los más viejos de la lista) y ejecútalo otra vez. Responde dos preguntas: ¿qué tendencia muestra el conteo acumulado en cada uno de los dos modos? ¿Qué dice esa diferencia?

<!-- rubric -->
- El script se ejecuta de forma independiente y saca el conteo acumulado turno a turno; el modo «conservar todo» muestra crecimiento lineal, lo que confirma que «los datos del bucle solo crecen y nunca se encogen»
- El modo «conservar solo los resultados de herramientas de los 5 turnos más recientes» reduce claramente su tasa de crecimiento a partir del turno 6 (los resultados de herramientas llegan a su tope y solo quedan los mensajes de asistente acumulándose despacio), y sabe señalar que la diferencia viene por entero de recortar los resultados de herramientas
- Sabe conectar la observación con las ideas de esta lección: el crecimiento lineal sin gestionar drena de forma continua el presupuesto finito de atención, así que el contenido que hay que recortar primero es el «más grande en tamaño y más corto en utilidad»

<!-- answer -->
Implementación de referencia:

```javascript
const ASSISTANT_LEN = 200;    // longitud simulada (caracteres) del mensaje de asistente de cada turno
const TOOL_LEN = 3000;        // longitud simulada (caracteres) del resultado de herramienta de cada turno
const TURNS = 20;
const KEEP_RECENT_TOOL = 5;   // conservar solo los resultados de herramientas de los 5 turnos más recientes; poner null para conservarlos todos

let messages = [];
for (let turn = 1; turn <= TURNS; turn++) {
  messages.push({ role: "assistant", size: ASSISTANT_LEN });
  messages.push({ role: "tool", size: TOOL_LEN });

  if (KEEP_RECENT_TOOL !== null) {
    const toolIndexes = messages
      .map((m, i) => (m.role === "tool" ? i : -1))
      .filter((i) => i >= 0);
    const stale = new Set(toolIndexes.slice(0, -KEEP_RECENT_TOOL));
    messages = messages.filter((_, i) => !stale.has(i));
  }

  const total = messages.reduce((sum, m) => sum + m.size, 0);
  console.log(`turn=${String(turn).padStart(2)} total_chars=${total}`);
}
```

Tendencias en los dos modos:

- **Conservar todo** (`KEEP_RECENT_TOOL = null`): ganancia neta de 3200 caracteres en cada turno, una recta estricta, con un total acumulado de 64000 en el turno 20. Así se ve «los datos solo crecen y nunca se encogen»: sin intervención, el crecimiento nunca para.
- **Conservar solo los 5 turnos más recientes**: idéntico a «conservar todo» durante los primeros 5 turnos; a partir del turno 6, cada resultado de herramienta nuevo que entra desplaza al más viejo que sale, y ambos se cancelan, así que la ganancia neta por turno baja a apenas 200 caracteres (el mensaje de asistente), con un total acumulado en el turno 20 de 200 × 20 + 3000 × 5 = 19000. La curva se aplana de forma notoria después del turno 5.

Qué dice esa diferencia: la brecha entre las dos curvas viene por entero de recortar los resultados de herramientas, el contenido más grande en tamaño y más corto en utilidad de la ventana (listados de archivos viejos, texto crudo de búsquedas viejas, que en general ya no se referencian pasados unos turnos). Sin gestión, el crecimiento lineal drena de forma continua el presupuesto finito de atención, y el contexto es un recurso finito con rendimientos marginales decrecientes[^S1]. Este interruptor de «conservar solo los resultados de herramientas de los N turnos más recientes» es la forma más simple de la estrategia de compactación que la Lección 4 desarrollará de manera sistemática.

<!-- hint -->
No necesitas llamar a una API real: el objetivo de observación es el tamaño de `messages`, no el contenido que saca el modelo. Usa mensajes de relleno de longitud fija para simular lo que se agrega en cada turno.

<!-- hint -->
«Conservar solo los 5 turnos más recientes» quiere decir que a partir del turno 6, por cada resultado de herramienta nuevo que entra hay uno más viejo que sale. Haz la cuenta: en ese punto, ¿qué queda de la ganancia neta por turno?

<!-- /exercises -->

## Resumen

- La ingeniería de contexto es la progresión natural de la ingeniería de prompts: la primera gestiona «qué conjunto óptimo de tokens mantener en la ventana al momento de razonar», la segunda gestiona «cómo escribir y organizar instrucciones», y la mirada sube de una oración a la ventana entera[^S1].
- «La ingeniería de prompts está muerta como habilidad autónoma» es una afirmación con sesgo propio de una hoja de ruta comunitaria[^S5]; esta lección usa la formulación más medida: evolución, no reemplazo[^S1].
- Los LLM analizan el contexto con un presupuesto finito de atención, y cada token nuevo consume una parte[^S1]: «la ventana lo aguanta» y «el modelo lo puede usar bien» son dos cosas distintas.
- La degradación de contexto es una pendiente de rendimiento gradual y no un acantilado, más empinada en unos modelos y más suave en otros, pero la tendencia aparece en todos[^S1]; por eso no lanza un error, solo va volviendo al agente más torpe en silencio.
- El contexto es un recurso finito con rendimientos marginales decrecientes[^S1]; los datos del bucle del agente solo crecen y nunca se encogen[^S1], que es la razón por la que la documentación oficial de Claude Code llama a la ventana de contexto "the most important resource to manage."[^S4] (el recurso más importante que hay que gestionar).
- Las tres clases de técnicas para tareas de horizonte largo —compactación, toma de notas estructurada y arquitecturas multiagente[^S1]— corresponden a los hilos principales de las Lecciones 4 y 5; la Lección 6 las instala en tu arnés. Antes de introducir cualquier complejidad, confirma que de verdad mejora los resultados[^S2].

[>> Lección 2: Anatomía del contexto: prompt del sistema, herramientas y ejemplos](./02-anatomy-of-context.md)

