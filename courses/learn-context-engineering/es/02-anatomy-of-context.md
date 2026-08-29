# Lección 2: Anatomía del contexto: prompt del sistema, herramientas y ejemplos

> Objetivos de aprendizaje:
> - Desarmar el contexto de una sola solicitud a un LLM (prompt del sistema, definiciones de herramientas, ejemplos, historial de mensajes) y explicar por qué los cuatro gastan el mismo presupuesto de atención
> - Diagnosticar el problema de «altitud» en un prompt del sistema —cableado y frágil en un extremo, vago y sin señal en el otro— y reescribirlo a la altitud correcta
> - Auditar definiciones de herramientas y ejemplos con la lente del costo de contexto: fusionar funcionalidad superpuesta, recortar lo que vuelve y reemplazar una lista de casos límite por unos pocos ejemplos canónicos
>
> Requisitos: Terminaste la Lección 1 y aceptas la premisa de que el contexto es un recurso finito | Anterior: [Lección 1 <<](./01-from-prompt-to-context.md) | Siguiente: [Lección 3 >>](./03-just-in-time-context.md)

## Abrir el capó: qué se carga de verdad en una solicitud

La Lección 1 tomó prestada la definición de Anthropic: la ingeniería de contexto es "the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference"[^S1] (el conjunto de estrategias para curar y mantener el conjunto óptimo de tokens —información— durante la inferencia del LLM). Eso sigue siendo abstracto: ¿de qué tokens consta en realidad «el conjunto óptimo»? Esta lección hace una sola cosa: abrir el capó para que veas qué se carga en la ventana cada vez que sale una solicitud.

Escribiste a mano un bucle de arnés en «Fundamentos del arnés de agente: bucles y control», así que la forma de una solicitud debería resultarte familiar. Ordenado por lo que contiene, el contexto de una sola solicitud son más o menos estos cuatro bloques:

```text
Contexto de una solicitud
├── Prompt del sistema (rol, reglas, conocimiento de fondo)
├── Definiciones de herramientas (nombre, descripción y esquema de parámetros de cada herramienta)
├── Ejemplos (few-shot: muestras de entrada/salida que retratan el comportamiento esperado)
└── Historial de mensajes (mensajes del usuario, respuestas del modelo, llamadas a herramientas y resultados de cada turno)
```

Esto es lo que importa: estos cuatro no son cuatro compartimientos sellados, son vecinos en una misma ventana. "LLMs have an "attention budget" that they draw on when parsing large volumes of context," (los LLM tienen un «presupuesto de atención» del que echan mano al analizar grandes volúmenes de contexto) y "Every new token introduced depletes this budget by some amount"[^S1] (cada token nuevo que se introduce agota ese presupuesto en cierta medida). Un párrafo de relleno de más en el prompt del sistema es atención que el historial de mensajes no recibe; diez herramientas sentadas en el manifiesto que nadie llama nunca adelgazan la porción que les toca a los ejemplos. Y como cubrió la Lección 1, "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"[^S1] (a medida que aumenta el número de tokens en la ventana de contexto, disminuye la capacidad del modelo de recordar con precisión información de ese contexto): una degradación que llega como pendiente y no como caída, ya que "These factors create a performance gradient rather than a hard cliff"[^S1] (estos factores crean un gradiente de rendimiento en vez de un acantilado abrupto). Por eso el desperdicio en cualquiera de los bloques nunca se anuncia con un error. Simplemente vuelve todo un poco más tonto, en silencio, y para cuando lo notas normalmente ya no puedes señalar la línea que lo causó.

Los cuatro bloques también crecen a ritmos distintos. El prompt del sistema, las definiciones de herramientas y los ejemplos son básicamente estáticos: lo largos que los hayas escrito es lo largos que se quedan. El historial de mensajes, en cambio, se hincha dentro del bucle, porque "An agent running in a loop generates more and more data that could be relevant for the next turn of inference"[^S1] (un agente que se ejecuta en un bucle genera cada vez más datos que podrían ser relevantes para el siguiente turno de inferencia). En el arnés que construiste en «Fundamentos del arnés de agente: bucles y control», la línea que hace `push` del resultado de herramienta de cada turno al arreglo `messages` es esa hinchazón, en vivo. Qué hacer con el historial no es tarea de esta lección: la Lección 4, «Compactación y notas: gestión de contexto para tareas largas», está dedicada a eso. Esta lección pone bajo control los tres bloques estáticos, porque son el costo fijo que pagas en absolutamente cada turno.

Convertir "context, therefore, must be treated as a finite resource with diminishing marginal returns"[^S1] (el contexto, por lo tanto, debe tratarse como un recurso finito con rendimientos marginales decrecientes) en algo sobre lo que puedas actuar significa hacerle a cada bloque la misma pregunta: ¿cuánta mejora de comportamiento compraron estos tokens? Vamos bloque por bloque.

## La altitud de un prompt del sistema: dos formas de fallar

El artículo de ingeniería de Anthropic usa «altitud» para el nivel de abstracción en el que se ubica un prompt del sistema, y nombra dos extremos de fallo. En una punta, "engineers hardcoding complex, brittle logic in their prompts to elicit exact agentic behavior"[^S1] (ingenieros que cablean lógica compleja y frágil en sus prompts para provocar un comportamiento agéntico exacto). En la otra, "vague, high-level guidance that fails to give the LLM concrete signals for desired outputs"[^S1] (orientación vaga y de alto nivel que no logra darle al LLM señales concretas de las salidas deseadas). Escribamos tres versiones de un prompt del sistema para el mismo agente de soporte de pedidos, para que las dos trampas y la buena respuesta queden lado a lado.

**Volar demasiado bajo**: la lógica queda cableada.

```text
Eres un agente de soporte de pedidos. Sigue estas reglas al pie de la letra:
1. Si el usuario dice «nunca llegó», responde con la plantilla A.
2. Si el usuario dice «llegó dañado», responde con la plantilla B y emite un cupón de $10.
3. Números de pedido que empiezan con TB: revisa primero el envío. Con JD: revisa primero el inventario.
4. Si el mensaje del usuario contiene la palabra «reclamo», deriva a una persona.
… (se omiten 14 reglas más)
19. Cuando un usuario cumple a la vez la regla 2 y la regla 4, gana la regla 4.
20. Si nada de lo anterior coincide, responde «Disculpa, no estoy seguro de entender».
```

Cada regla cubre exactamente el caso que deletrea. ¿Qué pasa cuando el usuario escribe «la caja llegó aplastada» en vez de «dañado»? Ninguna regla lo atrapa, así que cae hasta la regla 20 y se hace el tonto. Peor todavía, las reglas empiezan a pelearse entre sí, así que agregas la regla 19 de árbitro, y a esa altura estás escribiendo un intérprete de if-else en lenguaje natural. Cada agregado hace el prompt más largo, más frágil y más caro en atención, mientras que los casos que no escribiste siempre van a ser más que los que sí.

**Flotar demasiado alto**: puras consignas.

```text
Eres un agente de soporte de pedidos. Sé profesional y amable, maneja los problemas de los usuarios con flexibilidad y mantén contentos a los usuarios.
```

Ahorraste los tokens, pero el modelo no recibe ninguna señal concreta. ¿Dónde está el límite de los reembolsos? ¿Cuánta compensación puede autorizar? ¿Qué tiene que ir a una persona? Todo es adivinanza. «Mantén contentos a los usuarios», llevado al extremo, puede significar devolver plata que nunca debió devolverse, y eso no es desobediencia: eso es que no le dijiste nada.

**La altitud correcta**: el estándar de Anthropic es un prompt que sea "specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics"[^S1] (lo bastante específico para guiar el comportamiento de forma eficaz, y a la vez lo bastante flexible para darle al modelo heurísticas fuertes).

```text
Eres un agente de soporte de pedidos. Tu objetivo es resolver el problema posventa del usuario dentro de una sola conversación.

Principios de juicio:
- Si un pedido no ha salido, puedes reembolsar a pedido; si ya salió, guía al usuario a rechazar la entrega o iniciar una devolución.
- Daño, artículo equivocado y artículo faltante son culpa nuestra: ofrece compensación de entrada, no esperes a que el usuario la pida.
- Cuando la culpa no está clara, confirma primero los hechos clave (número de pedido, fotos) y después decide.

Límites infranqueables (nunca los cruces):
- Ninguna compensación individual por encima de $50; por encima de eso, deriva a una persona.
- Cualquier conversación que involucre lesiones físicas o una disputa legal: deriva de inmediato a una persona y márcala.
```

Mira la estructura de esa versión: **los principios hacen la generalización, las líneas rojas hacen el cumplimiento**. «La caja llegó aplastada» no está escrito literalmente en ninguna regla, y sin embargo cae con naturalidad bajo «el daño es culpa nuestra»; las cosas que de verdad no son negociables (el techo de compensación, las disputas legales) quedan clavadas como un puñado de límites infranqueables. Tiene menos de la mitad del largo de la versión de 20 reglas y cubre estrictamente más terreno.

Hay una pregunta atajo para juzgar la altitud: **ante un caso que no escribiste, ¿este prompt le da al modelo una dirección desde la cual razonar?** La versión baja no puede (solo sabe caer al final), la versión alta da una dirección vacía («contentos»), y la versión a la altitud correcta da principios que transfieren.

```agentmentor-check
{
  "id": "ctx-zh-02-altitude-fix",
  "label": "Diagnosticar el problema de altitud en un prompt del sistema cableado y elegir el arreglo",
  "prompt": "Un agente de revisión de devoluciones tiene un prompt del sistema con 18 reglas de la forma «si el usuario dice X, haz Y», que termina con «si nada de lo anterior coincide, responde que la solicitud no se puede procesar». En producción, cada solicitud cuya redacción las reglas no anticiparon cae en esa rama comodín. ¿Qué enfoque arregla esto de raíz?",
  "whyHere": "La sección acaba de poner lado a lado tres versiones de un prompt de soporte: demasiado bajo, demasiado alto y correcto. Esto cambia el escenario para comprobar que puedas detectar por tu cuenta la enfermedad de fondo de un prompt de baja altitud, y elegir entre «seguir agregando ramas» y «subirlo a principios» sin tener la comparación delante.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Reescribir los 18 casos especiales como unos pocos principios de juicio más un número pequeño de límites infranqueables, para que los principios cubran redacciones que nadie enumeró mientras las verdaderas líneas rojas de cumplimiento quedan clavadas.",
      "correct": true,
      "feedback": "Los principios generalizan a redacciones que nunca se enumeraron, y los límites infranqueables sostienen la línea en lo que no es negociable: esa es exactamente la altitud que resulta lo bastante específica para guiar el comportamiento y a la vez le deja al modelo heurísticas fuertes. Además el prompt se acorta, así que el presupuesto de atención compra más."
    },
    {
      "id": "b",
      "text": "Conservar la estructura y subdividir la rama comodín: llevar registro de qué redacciones fallaron en producción y agregar cada semana unas cuantas reglas nuevas de si-entonces al prompt.",
      "correct": false,
      "feedback": "Agregar reglas solo persigue redacciones que ya aparecieron; cualquier cosa nueva sigue cayendo en la rama comodín. La lista crece, los conflictos entre reglas se vuelven más probables, y cada turno de inferencia paga atención por un manifiesto que no deja de alargarse."
    },
    {
      "id": "c",
      "text": "Borrar las 18 reglas y reemplazarlas por una sola línea, «maneja las solicitudes de devolución con flexibilidad y prudencia», para ahorrar la mayor cantidad posible de tokens.",
      "correct": false,
      "feedback": "Eso salta de un extremo al otro. Los tokens se ahorran, pero «con flexibilidad y prudencia» no lleva ninguna señal concreta, así que el modelo no tiene idea de dónde están los límites de la devolución ni su nivel de autoridad, y el comportamiento se desvía de forma impredecible. Ahorrar tokens solo funciona si sobreviven las heurísticas que guían el comportamiento."
    }
  ]
}
```

## La capa siempre cargada: la disciplina de CLAUDE.md

El prompt del sistema no es solo la cadena que escribiste. Muchos arneses estacionan configuración a nivel de proyecto de forma permanente en la capa de sistema, y el CLAUDE.md de Claude Code es el caso canónico: la documentación dice "CLAUDE.md is a special file that Claude reads at the start of every conversation."[^S4] (CLAUDE.md es un archivo especial que Claude lee al inicio de cada conversación). «Leído cada vez» quiere decir que cada línea suya gasta presupuesto de atención en cada sesión, y por eso la disciplina que la documentación le impone es estricta.

Regla uno: pon ahí solo lo que aplica de forma amplia, "CLAUDE.md is loaded every session, so only include things that apply broadly."[^S4] (CLAUDE.md se carga en cada sesión, así que incluye solo cosas que apliquen de forma amplia). Un comando de compilación que necesita un solo subdirectorio, una convención que necesita un solo tipo de tarea: ninguno se ganó un asiento en la capa siempre cargada.

Regla dos: pásale a cada línea una prueba de eliminación. "Keep it concise. For each line, ask: "Would removing this cause Claude to make mistakes?" If not, cut it."[^S4] (mantenlo conciso; para cada línea, pregúntate: «¿quitar esto haría que Claude cometa errores?». Si no, córtala). Esto no es quisquillosidad. La documentación advierte sin rodeos que "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"[^S4] (¡los archivos CLAUDE.md inflados hacen que Claude ignore tus instrucciones reales!). Ese es el presupuesto de atención hecho concreto: cada línea opcional que embutes diluye las pocas líneas que de verdad importan. La misma página llega a llamar a la ventana de contexto "the most important resource to manage," señalando que "Claude's context window fills up fast, and performance degrades as it fills."[^S4] (el recurso más importante que hay que gestionar; la ventana de contexto de Claude se llena rápido, y el rendimiento se degrada a medida que se llena).

Entonces, ¿dónde vive el material que rara vez se necesita pero que a veces es imprescindible? La respuesta de Claude Code son las Skills: cargadas bajo demanda, ya que "Claude loads them on demand without bloating every conversation."[^S4] (Claude las carga bajo demanda sin inflar cada conversación). Ese emparejamiento —mantener mínima la capa residente y traer el resto cuando se necesita— es exactamente el tema de la Lección 3, así que dejémoslo apuntado aquí.

Un aparte: si tu propio proyecto tiene un AGENTS.md, un `system_prompt.txt` o algo similar sentado de forma permanente en el contexto, pásale la misma prueba de eliminación. El inflado de la capa siempre cargada es el más solapado de todos: nunca aparece en ningún turno concreto de la conversación, y le cobra impuesto a todos.

## Las herramientas son contexto: cuesta la definición y cuesta el retorno

Una herramienta aparece dos veces en el contexto: su **definición** viaja con cada solicitud, y su **valor de retorno** entra en el historial de mensajes. Los dos extremos gastan presupuesto.

El curso anterior «Llamada a herramientas en agentes: conseguir que los agentes hagan cosas de verdad» cubrió el lado funcional del diseño de herramientas: cómo definir parámetros, cómo manejar errores. Esta lección toma otro ángulo: cada definición de herramienta es un tramo de tokens que el modelo tiene que leer y entender. La vara de Anthropic es que "tools should be self-contained, robust to error, and extremely clear with respect to their intended use"[^S1] (las herramientas deberían ser autocontenidas, robustas ante errores y extremadamente claras respecto de su uso previsto), y que estás "building tools that are well understood by LLMs and have minimal overlap in functionality"[^S1] (construyendo herramientas que los LLM entiendan bien y que tengan una superposición mínima de funcionalidad). Va un par que falla en las dos cosas (esquemas abreviados por legibilidad):

```json
[
  {
    "name": "get_order_info",
    "description": "Busca un pedido.",
    "parameters": { "order_id": "string" }
  },
  {
    "name": "search_order",
    "description": "También busca pedidos, admite palabras clave.",
    "parameters": { "keyword": "string" }
  }
]
```

Las dos herramientas pueden buscar un pedido, las dos descripciones son vagas, y la frontera entre ellas no es algo que ni siquiera su autor haya fijado. De eso se trata por completo el requisito de "minimal overlap in functionality"[^S1] (superposición mínima de funcionalidad): amontona herramientas con fronteras difusas y le habrás entregado al modelo la pregunta «¿cuál uso?» recién horneada en cada turno. Fusiónalas en una sola y enuncia con claridad el propósito y el comportamiento, y la pregunta desaparece:

```json
[
  {
    "name": "search_orders",
    "description": "Busca un pedido por número de pedido exacto, o busca pedidos por palabra clave. Devuelve como máximo 5 resultados por defecto, cada uno con solo cuatro campos: número de pedido, estado, monto, fecha del pedido. Para el conjunto completo de campos, vuelve a consultar un único número de pedido con detail=true. Devuelve una lista vacía cuando no hay coincidencias; no lanza error.",
    "parameters": {
      "query": "Número de pedido o palabra clave de búsqueda",
      "detail": "Booleano, si devolver el conjunto completo de campos, por defecto false"
    }
  }
]
```

Esa descripción dice más que «qué hace»: deletrea la forma de lo que vuelve y qué pasa cuando no hay nada que devolver, que es "robust to error"[^S1] (robusta ante errores) hecho literal: el modelo no tiene que adivinar cómo se ve un fallo de búsqueda, así que es mucho menos probable que invente alguna maniobra rara de recuperación cuando una consulta sale vacía.

Ahora el lado del retorno. Anthropic pide herramientas que estén "returning information that is token efficient and by encouraging efficient agent behaviors"[^S1] (devolviendo información que sea eficiente en tokens y fomentando comportamientos eficientes del agente). Una herramienta que vuelca los cuarenta y pico campos internos de un pedido más su registro de auditoría completo derrama un balde de tokens de bajo valor en el historial de mensajes en cada llamada, y esos tokens se quedan en el historial, gravados otra vez en cada turno que sigue. «Recortado por defecto, `detail=true` bajo demanda», como en el ejemplo de arriba, es la forma estándar del arreglo.

Por último, el manifiesto de herramientas también necesita resta. Diez herramientas en contexto que nunca se llaman igual se facturan completas cada turno por sus definiciones. Auditar una lista de herramientas y auditar un CLAUDE.md son el mismo movimiento: ¿quitarlo causaría errores? Si no, córtalo.

## Ejemplos: elige canónicos, no amontones una lista

Los ejemplos (few-shot) son el tercer costo estático. Su descomposición habitual va así: cada caso fallido de producción se gana un ejemplo correspondiente agregado al prompt, y seis meses después eres dueño de un catálogo de 30 entradas de casos límite. Anthropic es tajante al respecto: no hay que "stuff a laundry list of edge cases into a prompt"[^S1] (embutir una lista interminable de casos límite en un prompt); en cambio, hay que "curate a set of diverse, canonical examples that effectively portray the expected behavior of the agent"[^S1] (curar un conjunto de ejemplos diversos y canónicos que retraten de manera eficaz el comportamiento esperado del agente).

«Canónico» quiere decir que un ejemplo representa una **clase** de comportamiento, no una situación específica. De vuelta al agente de soporte: tres ejemplos alcanzan para enmarcar todo el espacio de comportamiento.

1. **El flujo estándar**: el recorrido completo de buscar el pedido, asignar la culpa y ofrecer una resolución.
2. **Hacerse cargo de entrada**: enviamos el artículo equivocado y se ofrece compensación antes de que el usuario la pida.
3. **Escalamiento**: excede la autoridad del agente, así que explica con cortesía y deriva a una persona.

«Diversos» quiere decir que esos tres cubren ramas distintas del juicio, en vez de ser tres variaciones del mismo comportamiento.

Entonces, ¿a dónde van los casos límite? La mayoría debería ascenderse de vuelta a la capa de principios del prompt del sistema. «Qué pasa si el usuario es agresivo» no necesita un ejemplo de conversación completa de 300 tokens; un principio —«cuando un usuario está molesto, mantente mesurado y conserva el foco en resolver el problema»— hace el trabajo. Los ejemplos enseñan cómo se ve el comportamiento esperado; los principios enseñan en qué dirección razonar cuando aparece algo nuevo. Quizá ya lo notaste: agregar un caso límite a la lista de ejemplos y agregar una rama al prompt del sistema son dos caras de la misma moneda, las dos son parches a baja altitud, y solo subir a la capa de principios sella el hueco de verdad.

## Una lista de chequeo bloque por bloque: poner la anatomía a trabajar

Comprimir esta lección en algo ejecutable. Antes de agregar cualquier cosa al contexto, pásale la pregunta que le corresponde:

| Bloque | Pregunta que hay que hacer |
|---|---|
| Prompt del sistema | ¿Es correcta la altitud? Ante un caso que no escribiste, ¿le da al modelo una dirección desde la cual juzgar?[^S1] |
| Archivos siempre cargados | ¿Esta línea aplica de forma amplia? ¿Quitarla causaría errores?[^S4] |
| Definiciones de herramientas | ¿Es lo bastante claro el propósito? ¿Se superpone con otra herramienta? ¿Está recortado el retorno por defecto?[^S1] |
| Ejemplos | ¿Cada uno representa una clase de comportamiento? ¿La lista se está volviendo a alargar?[^S1] |
| Historial de mensajes | No se trata aquí; ve la Lección 4, «Compactación y notas: gestión de contexto para tareas largas» |

Hay un principio más que vale la pena llevarse de esta lección, más allá de la tabla. Escribiendo sobre construir sistemas de agentes, Anthropic ofrece un sentido de la proporción: "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] (habría que considerar añadir complejidad solo cuando mejora demostrablemente los resultados). El contexto original es la arquitectura de sistemas, pero se sostiene igual de bien para cada bloque de contexto: una herramienta más, una regla más, un ejemplo más son toda complejidad agregada. Haz que demuestre que compra mejora de comportamiento antes de dejarla subir a bordo.

Con eso pasamos por los tres bloques estáticos. Pero queda esperando una pregunta más: parte de la información no debería cargarse por adelantado en la ventana en absoluto; en vez de adivinar qué va a necesitar el modelo, deja que el agente vaya a buscarlo en tiempo de ejecución. De eso trata la próxima lección.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Reescribir una lista de reglas a la altitud correcta

Este es el prompt del sistema de un agente de aprobación de gastos:

```text
Eres un asistente de aprobación de gastos. Aprueba según estas reglas:
1. Boletas de taxi por menos de $100: aprueba directamente.
2. Boletas de taxi de $100 o más: pide una descripción del viaje.
3. Boletas de comida entre las 12:00 y las 14:00 en día hábil: aprueba directamente.
4. Boletas de comida en fin de semana: rechaza.
5. Artículos de oficina de la categoría «electrónica»: manda a un gerente.
6. Boletas cuyo nombre de facturación no coincide con el nombre de la empresa: rechaza.
7. Si nada de lo anterior coincide, rechaza con la nota «por favor contacta a administración».
```

Con este conjunto, la boleta de hotel de un viaje de negocios no la atrapa ninguna regla y la rechaza la regla 7 siempre; una boleta de cena en día hábil no satisface ni la regla 3 ni la regla 4 y cae en la misma rama comodín. Haz dos cosas: (1) nombra en qué extremo de fallo se ubica este prompt, y explica por qué este síntoma es inevitable para ese tipo de prompt; (2) reescríbelo a la altitud correcta, con una versión que cubra los dos casos no atendidos de arriba.

<!-- rubric -->
- Identifica que el prompt se ubica en el extremo de «lógica cableada y frágil», y explica que la rama comodín tragándose los casos nuevos es el resultado inevitable de reglas enumeradas (los casos que no escribiste siempre superan a los que sí)
- La reescritura se apoya en dos o tres principios de juicio (tamaño del monto, cuán rutinaria es la categoría, si el papeleo es consistente) en vez de enumerar escenarios uno por uno, de modo que las boletas de hotel, las cenas en día hábil y otros casos nuevos caen dentro de un principio
- Conserva los límites infranqueables genuinos (un nombre de facturación que no coincide se debe rechazar, los montos grandes van a un gerente) y da un camino para los casos inciertos (rechazar con una nota sobre lo que falta) en vez de dejar que el modelo adivine
<!-- answer -->
(1) Este prompt se ubica en el extremo de «lógica cableada y frágil»: define el comportamiento enumerando escenarios específicos, y cada regla cubre solo el caso que deletrea. La enumeración nunca puede alcanzar a las combinaciones que produce el mundo real: las boletas de hotel y las cenas en día hábil no están en la lista, así que solo pueden caer en la rama comodín. Agregar la regla 8 y la regla 9 no toca el problema estructural; solo alarga la lista y hace más probables los conflictos.

(2) Una reescritura de referencia a la altitud correcta:

```text
Eres un asistente de aprobación de gastos. Tu objetivo es despachar rápido las aprobaciones sin romper la política.

Principios de juicio:
- Aprueba directamente cuando el monto es pequeño, la categoría es rutinaria y el papeleo está completo y consistente.
- Pide una explicación antes de decidir cuando el monto está del lado grande, o cuando cae fuera de lo normal para esa categoría (una comida grande de madrugada, por ejemplo).
- Cuando el papeleo no cuadra con lo que se está reclamando, rechaza e indica exactamente qué falta, para que la persona lo corrija de una sola vez.

Límites infranqueables (nunca los cruces):
- Un nombre de facturación que no coincide con el nombre de la empresa se rechaza siempre.
- Cualquier cosa por encima de $1000 en un solo reclamo va a un gerente.
- No adivines cuando no estás seguro: rechaza y di qué documentación se necesita.
```

Una boleta de hotel de un viaje de negocios ahora cae dentro del juicio general sobre monto, categoría y consistencia del papeleo. Una cena en día hábil de monto normal en una categoría rutinaria cae bajo el primer principio y se aprueba; si es de las grandes y de madrugada, que quedan fuera de la norma, cae bajo «pide una explicación». Las líneas rojas genuinas enterradas en las siete reglas originales (nombre de facturación que no coincide, y categorías de alto valor como electrónica, que el techo de monto absorbe) sobreviven como límites infranqueables, y todo lo demás asciende a la capa de principios.
<!-- hint -->
Ve regla por regla y pregunta: ¿esto es «un principio que aplica a todo gasto» o «un caso especial para un escenario específico»? Cuantos más casos especiales, más baja la altitud.
<!-- hint -->
Saca las líneas rojas de cumplimiento que deben sostenerse de forma incondicional y enuméralas aparte como límites infranqueables, después intenta plegar las reglas restantes en dos o tres principios de juicio, y autoevalúa la cobertura preguntándote en qué principio caería una boleta de hotel.

### Nivel 2: Auditar el costo de contexto de herramientas y ejemplos

Heredaste un agente de soporte de comercio electrónico. Su contexto contiene las tres definiciones de herramientas de abajo (esquemas abreviados), más una lista few-shot de 12 ejemplos cuyo contenido son todos casos límite del tipo «qué hacer cuando el usuario comete un error de tipeo» y «qué hacer cuando el usuario pregunta lo mismo dos veces»:

```json
[
  {
    "name": "query_order",
    "description": "Consulta un pedido.",
    "parameters": { "order_id": "string" }
  },
  {
    "name": "search_order_by_text",
    "description": "Consulta pedidos, admite búsqueda difusa.",
    "parameters": { "text": "string" }
  },
  {
    "name": "get_order_full_dump",
    "description": "Devuelve todos los campos de un pedido, incluidos más de 40 campos internos y el registro de auditoría completo.",
    "parameters": { "order_id": "string" }
  }
]
```

Haz una auditoría de costo de contexto: (1) señala la funcionalidad superpuesta en la lista de herramientas y da un plan de fusión; (2) explica cómo la herramienta fusionada vuelve su retorno eficiente en tokens sin dejar de tener alcanzable la información necesaria; (3) da un plan para rehacer la lista de ejemplos: qué tipo de ejemplos debería quedarse, y quién debería encargarse de los casos límite.

<!-- rubric -->
- Reconoce que las tres herramientas se superponen en «buscar un pedido», propone fusionarlas en una sola herramienta y explica que las herramientas duplicadas con fronteras difusas empujan la decisión de «¿cuál?» a cada turno de inferencia
- La herramienta fusionada devuelve unos pocos campos clave por defecto con el conjunto completo disponible bajo demanda (un parámetro detail, por ejemplo), y su descripción enuncia la forma del retorno y el comportamiento cuando no hay coincidencias
- El plan de ejemplos conserva un número pequeño de ejemplos canónicos que cubren comportamientos típicos distintos, con la mayoría de los casos límite ascendidos a principios en el prompt del sistema en vez de enumerados un ejemplo a la vez
<!-- answer -->
(1) Las tres herramientas hacen el mismo trabajo, buscar un pedido: `query_order` por ID exacto, `search_order_by_text` por texto difuso, `get_order_full_dump` por ID para todo. Cada definición es vaga por sí sola y se superpone con las otras, así que antes de cada llamada el modelo tiene que deducir dónde están las fronteras entre ellas, fronteras que las definiciones nunca enuncian. Fusiona en una sola herramienta:

```json
[
  {
    "name": "search_orders",
    "description": "Busca un pedido por número de pedido exacto, o busca pedidos por texto. Devuelve como máximo 5 resultados por defecto, cada uno con solo número de pedido, estado, monto y fecha del pedido. Para el conjunto completo de campos, vuelve a consultar un único número de pedido con detail=true. Devuelve una lista vacía cuando no hay coincidencias; no lanza error.",
    "parameters": {
      "query": "Número de pedido o texto de búsqueda",
      "detail": "Booleano, si devolver el conjunto completo de campos, por defecto false"
    }
  }
]
```

(2) La eficiencia en tokens viene de «recortado por defecto, conjunto completo bajo demanda»: las preguntas del día a día solo necesitan estado y monto, así que eso es todo lo que vuelve por defecto; cuando de verdad se necesitan los campos internos, `detail=true` trae el registro completo de un solo pedido en vez de inundar el historial de mensajes con cuarenta y pico campos y un registro de auditoría en cada llamada, contenido que se queda en el historial y se vuelve a facturar en cada turno siguiente. Enunciar el tope de resultados y el comportamiento ante resultado vacío en la descripción hace que el modelo nunca tenga que adivinar cómo se ve un fallo de búsqueda.

(3) Cambia los 12 ejemplos de casos límite por 3 canónicos, cada uno representando una clase de comportamiento: un ejemplo de flujo estándar que busca un pedido y responde con normalidad, un ejemplo de juicio donde la culpa es nuestra y se ofrece compensación de entrada, y un ejemplo de escalamiento donde la solicitud excede la autoridad del agente y va a una persona. Los errores de tipeo y las preguntas repetidas no merecen un ejemplo completo de unos cientos de tokens cada uno; asciéndelos a un principio en el prompt del sistema («lee la intención del usuario en vez de su ortografía literal; cuando una pregunta se repite, revisa primero si la respuesta anterior la resolvió»).
<!-- hint -->
Empieza contando cuántas herramientas pueden lograr el mismo trabajo, después revisa si sus descripciones le permiten a alguien distinguir de un vistazo cuál usar y cuándo.
<!-- hint -->
«Canónico» quiere decir un ejemplo que representa una clase de comportamiento. Ordena primero los comportamientos esperados en clases (flujo estándar, hacerse cargo, escalamiento…) y elige el más ilustrativo por clase; para los casos límite que no encajan en ninguna clase, considera un principio en vez de un ejemplo.
<!-- /exercises -->

## Resumen

- El contexto de una solicitud son cuatro bloques: prompt del sistema, definiciones de herramientas, ejemplos e historial de mensajes. Comparten un único presupuesto de atención, y cada token nuevo lo agota en cierta medida[^S1].
- El contexto es un recurso finito con rendimientos marginales decrecientes[^S1]; preguntar bloque por bloque «qué compraron estos tokens» es mucho más accionable que «ajustar el prompt» a lo vago.
- Un prompt del sistema tiene dos extremos de fallo: ramas cableadas y frágiles, y consignas vagas que no llevan señal. La altitud correcta es lo bastante específica para guiar el comportamiento y a la vez lo bastante flexible para dejarle al modelo heurísticas fuertes[^S1], y «principios más límites infranqueables» es la estructura práctica para aterrizar ahí.
- El contenido siempre cargado como CLAUDE.md se lee al inicio de cada conversación: incluye solo lo que aplica de forma amplia, y pásale la prueba de eliminación a cada línea, porque los archivos inflados hacen que el modelo ignore tus instrucciones reales[^S4].
- Las herramientas gastan presupuesto en los dos extremos, definición y retorno: mantén el uso previsto extremadamente claro, la superposición mínima y los retornos eficientes en tokens[^S1]; las herramientas que nunca se llaman igual se facturan completas cada turno.
- Cura unos pocos ejemplos diversos y canónicos en vez de embutir una lista interminable de casos límite[^S1]; la mayoría de los casos límite pertenece de vuelta a la capa de principios.
- Antes de agregar cualquier complejidad al contexto, recuerda el sentido de la proporción de Anthropic: agrégala solo cuando mejora demostrablemente los resultados[^S2].

[>> Lección 3: Recuperación justo a tiempo: dejar que el agente busque su propio contexto](./03-just-in-time-context.md)
