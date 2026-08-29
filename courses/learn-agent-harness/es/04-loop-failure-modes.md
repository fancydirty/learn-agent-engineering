# Lección 4: Desbocamiento y salvaguarda: bucles muertos, giro en vacío, agotamiento del presupuesto

> Objetivos de aprendizaje:
> - Reconocer las cuatro formas típicas de un bucle desbocado — errores que se componen, inflado y degradación del contexto, bucles muertos y giro en vacío, agotamiento del presupuesto — y decir qué propiedad del bucle causa cada una
> - Acoplar a cada una la compuerta de salvaguarda que le corresponde: puntos de control más parada temprana, gobernanza del contexto, un tope de turnos más detección de falta de progreso, un techo de presupuesto — y explicar qué atrapa realmente cada compuerta
> - Decidir qué compuerta rígida necesita un bucle que «gira sin avanzar», en lugar de intentar rescatar un bucle sin límites cambiando de modelo o reescribiendo el prompt
>
> Requisitos: Ya leíste las Lecciones 2 y 3, y tienes un bucle esqueleto guiado por `stop_reason` con un tope de turnos | Anterior: [Lección 3 <<](./03-stop-conditions.md) | Siguiente: [Lección 5 >>](./05-intervention-and-steering.md)

## Un bucle en marcha también puede desbocarse

Las dos últimas lecciones pusieron tu bucle de pie: `stop_reason` como condición del while, y luego las condiciones de parada explícitas de la Lección 3 para poder sujetarlo cuando el modelo se niega a cerrar. A estas alturas eso suena como un bucle razonablemente estable. Pero «puedo sujetarlo» es apenas el fusible final, y atrapa exactamente una sola enfermedad: un bucle que no se detiene. Los bucles se tuercen de más maneras que esa, y la mayoría del tiempo no pasa nada dramático — el proceso no se cuelga, la CPU no se dispara. El bucle simplemente, calladamente, turno tras turno, hace el trabajo mal.

Esta lección descompone la frase vaga «bucle desbocado» en cuatro formas que puedes nombrar de un vistazo: **errores que se componen, inflado y degradación del contexto, bucles muertos y giro en vacío, agotamiento del presupuesto**. Todas se remontan a la misma raíz — un agente es un sistema que decide por sí mismo su siguiente paso, y esa autonomía es a la vez la razón de que sea útil y la razón de que se descarríe. Anthropic lo dice sin rodeos: "The autonomous nature of agents means higher costs, and the potential for compounding errors."[^S1] (La naturaleza autónoma de los agentes implica costos más altos y la posibilidad de errores que se componen.) Y "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S1] (El LLM operará potencialmente durante muchos turnos, y debes tener cierto nivel de confianza en su toma de decisiones.) Confiar no es lo mismo que dar rienda suelta. Esta lección trata de lo que le debes al bucle más allá de la confianza: una compuerta de salvaguarda para cada forma en que puede desbocarse.

Conviene dejar algo claro de entrada, para que no leas mal el resto: estas cuatro no son accidentes de baja probabilidad. Son tendencias horneadas en el bucle como estructura. Deja un bucle a su aire y por defecto se desliza en estas direcciones. Así que las salvaguardas no son parches que aplicas después de un incidente — son barandales que sueldas desde el principio. Una a la vez.

## Desbocamiento 1: Errores que se componen — un paso equivocado envenena todos los que siguen

Empecemos por el más taimado, porque nunca lanza un error. Piensa de nuevo en el bot de guardia de la Lección 2: reiniciar el servicio, leer los logs, reportar. Esos tres pasos están encadenados — el paso dos depende del resultado del paso uno, el paso tres del paso dos. Ahora supón que el paso uno se tuerce en silencio: el modelo lee el nombre del servicio como `api-staging` y reinicia el entorno de preproducción en su lugar. La herramienta dice «reinicio exitoso» y el modelo lo toma al pie de la letra. Luego lee los logs, no ve errores nuevos, y reporta alegremente «reinicio completo, los logs están limpios». Cada llamada a herramienta tuvo éxito. Ni una sola excepción se levantó. Y sin embargo, del paso dos en adelante todo se construyó sobre un cimiento equivocado, derivando cada vez más lejos con cada paso.

Eso son los **errores que se componen**: que un agente opere de forma autónoma significa que los errores se acumulan y se amplifican a lo largo del bucle[^S1]. No es el mismo animal que el caso de «código con bugs causa un bucle infinito» de la Lección 2 — eso es una falla mecánica que detectas de un vistazo. Los errores que se componen ocurren en la capa de decisión, donde cada paso individual se ve perfectamente razonable y el error crece a interés compuesto por la cadena abajo. Cuantos más turnos gira el bucle y más larga se hace la cadena, más difícil es predecir hasta dónde habrá arrastrado las cosas al final un empujoncito temprano.

La salvaguarda toma dos piezas trabajando juntas. Primero, **puntos de control**: pausa en los eslabones de la cadena donde «si esto está mal, todo lo que sigue se desperdicia», y haz que el bucle exponga su estado intermedio para verificación. Anthropic describe este tipo de pausa directamente — "Agents can then pause for human feedback at checkpoints or when encountering blockers."[^S1] (Los agentes pueden entonces pausar para recibir retroalimentación humana en puntos de control o al encontrar bloqueos.) La Lección 5 cubre cómo diseñar ese punto de pausa. Segundo, **parada temprana**: en lugar de dejar que un bucle que ya está derivando queme todo su presupuesto, detenlo en el momento en que algo se ve mal. Para eso sirven exactamente las condiciones de parada explícitas de la Lección 3, y hace eco del consejo general de que "it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control."[^S1] (también es común incluir condiciones de parada, como un número máximo de iteraciones, para mantener el control.) La idea central: como los errores se acumulan con el conteo de turnos, no dejes que el bucle recorra una cadena larga sin verificar.

## Desbocamiento 2: Inflado y degradación del contexto — el historial pesa más cada turno

La Lección 2 plantó una deuda: en cada vuelta del bucle, esa línea `messages.push` mete dos mensajes más en el historial, solo suma, nunca resta. En aquel entonces dijimos «ya ajustaremos cuentas después». Este es el después.

Toma primero el «inflado». "An agent running in a loop generates more and more data that could be relevant for the next turn of inference,"[^S3] (Un agente que se ejecuta en un bucle genera cada vez más datos que podrían ser relevantes para el siguiente turno de inferencia,) y cada turno esos datos se cargan a la siguiente petición sin cambios. Para una tarea que dura tres o cinco turnos, a nadie le importa. Pero una vez que un bucle necesita docenas de turnos, el historial se vuelve una bola de nieve — cada petición arrastra un contexto cada vez más largo, así que las peticiones se hacen más lentas y más caras. Ese es el costo inmediato y visible.

La «degradación» es la mitad más desagradable, porque daña la calidad y no solo la factura. "LLMs have an 'attention budget' that they draw on when parsing large volumes of context," (Los LLM tienen un «presupuesto de atención» del que echan mano al procesar grandes volúmenes de contexto,) y "Every new token introduced depletes this budget by some amount."[^S3] (Cada token nuevo que se introduce agota este presupuesto en cierta medida.) La consecuencia es que "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases."[^S3] (a medida que aumenta el número de tokens en la ventana de contexto, disminuye la capacidad del modelo de recuperar con exactitud información de ese contexto.) Esto es lo que la gente suele querer decir con degradación del contexto — nada se borró del historial, pero los hechos clave se están ahogando en ruido, así que el modelo puede verlos sin poder agarrarlos. Cuanto más gira el bucle, más flojo su agarre sobre aquella instrucción o restricción crítica del turno dos, y más fácil es que el comportamiento derive.

Hay una cuestión de escala que tienes que acertar aquí, o defenderás contra la cosa equivocada: esta degradación es una curva de rendimiento que baja suavemente con la longitud, no un acantilado del que te caes pasado cierto umbral — "These factors create a performance gradient rather than a hard cliff."[^S3] (Estos factores crean un gradiente de rendimiento en vez de un acantilado abrupto.) No lo leas como «una vez que el contexto es demasiado grande, todo está arruinado». Es más como el agua que sube y el casco que se asienta: aún puedes navegar con cualquier nivel de agua, solo que se pone más difícil. Aceptar eso es lo que te lleva a la postura correcta — "context, therefore, must be treated as a finite resource with diminishing marginal returns,"[^S3] (el contexto, por lo tanto, debe tratarse como un recurso finito con rendimientos marginales decrecientes,) y cada trozo de historial que agregues debería tener que responder «¿esto sigue valiendo la pena?».

La salvaguarda es la **gobernanza del contexto**: administrar activamente el historial que el bucle produce en lugar de empujar a ciegas hacia él. Las técnicas específicas — compactar turnos viejos, resumir resultados tempranos, descartar artefactos intermedios que ya no importan — son el tema entero del Curso 5 de esta serie, «Memoria y estado del agente», así que no los reabriremos aquí. Lo que necesitas llevarte desde el punto de vista del bucle es esto: gobernar el contexto es cómo le pones un freno al costo por turno del bucle, para que un bucle que se prolonga no se vuelva progresivamente más tonto a medida que avanza.

## Desbocamiento 3: Bucles muertos y giro en vacío — sin ir a ningún lado, sin detenerse nunca

En los dos primeros modos de falla el bucle al menos avanza, solo que torcido o lento. Este es más brusco: el bucle no avanza en absoluto, y tampoco se detiene. Tiene dos caras.

Una es el **bucle muerto**, que ya conociste en el ejercicio de Nivel 2 de la Lección 2 — el fondo del cuerpo del bucle olvidó reasignar `response`, así que `stop_reason` queda congelado en su valor viejo, la condición del while es permanentemente verdadera, el proceso se cuelga, y la misma herramienta se llama una y otra vez. Esto es una falla mecánica pura en el código: el código anfitrión está mal, las decisiones del modelo no tienen nada que ver, y agregar la línea de re-petición que falta lo arregla.

La otra cara es más taimada y se llama **giro en vacío** (también conocido como livelock): el código es enteramente correcto, cada turno legítimamente envía una petición, ejecuta una herramienta y lee un `stop_reason` fresco — y sin embargo nunca se logra nada nuevo. La forma clásica: el modelo llama la misma herramienta de búsqueda una y otra vez, obtiene resultados casi idénticos y vacíos cada vez, no cambia de enfoque, y busca lo mismo el siguiente turno. Juzgado por `stop_reason`, este bucle se ve perfectamente sano — siempre `tool_use`, siempre girando con normalidad. Juzgado por la tarea, marcha en el sitio, quemando turnos y tokens en círculos y sin avanzar nada.

Un bucle muerto se arregla arreglando el código. El giro en vacío no — el código está bien, y no hay bug del que salir arreglándolo. El giro en vacío necesita dos compuertas rígidas:

- **Tope de turnos** (la compuerta de la Lección 3): dale al bucle un techo absoluto de iteraciones, y detente en el techo por más «sanos» que se vean los turnos. Este es el fusible final, que garantiza que por más fuerte que el bucle gire en el sitio, no puede girar más allá de N turnos.
- **Detección de falta de progreso**: la compuerta construida específicamente para el giro en vacío. La idea es que el anfitrión vigile si de verdad está pasando algo nuevo — registra los nombres y resultados de las últimas llamadas a herramientas, y si N turnos seguidos usan la misma herramienta y vuelven con salida casi idéntica, llámalo «sin progreso» y sal del bucle. Muerde antes que el tope de turnos: no tienes que quemar los 50 turnos; puedes atrapar la repetición ya en el turno tres.

La división del trabajo entre las dos compuertas: la detección de falta de progreso se encarga de *notar el giro temprano*, y el tope de turnos se encarga de *sostener un techo absoluto incluso cuando no se notó nada*. Ninguna de las dos espera a que el modelo entre en razón — la razón misma de que exista el giro en vacío es que el modelo no entrará en razón, así que la frontera tiene que trazarla el código anfitrión fuera del bucle.

```agentmentor-check
{
  "id": "harness-zh-04-runaway-search",
  "label": "Elegir la salvaguarda correcta para un bucle de búsqueda que gira en vacío",
  "prompt": "Tu agente ha llamado la misma herramienta de búsqueda 15 turnos seguidos. Cada turno la consulta es casi idéntica, y los resultados también — que están básicamente vacíos. El bucle sigue girando, el conteo de turnos sigue subiendo, y la factura también. ¿Qué salvaguarda deberías agregar primero a este arnés?",
  "whyHere": "Esta sección acaba de trazar la línea entre bucles muertos y giro en vacío — sobre todo el giro en vacío, donde el código es correcto y el bucle se ve sano mientras no va a ningún lado. La verificación se sienta aquí para que la primera vez que te topes con un bucle que de verdad se desbocó, eches mano de una compuerta rígida para detenerlo en vez de cambiar el modelo o reformular el prompt por reflejo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Agregar detección de falta de progreso — detenerse cuando N turnos no producen ningún resultado nuevo — manteniendo el tope de turnos como respaldo",
      "correct": true,
      "feedback": "Correcto. El giro en vacío es por definición 'muchos turnos, sin progreso nuevo', así que la compuerta más directa vigila la cantidad que llamamos progreso: detente cuando los resultados no cambian durante N turnos, con un tope de turnos por debajo. Así, aun cuando el modelo no puede darse cuenta de que marcha en el sitio, el arnés puede dar por terminado en su lugar y cortar el costo — y el error potencial — que sigue amontonándose."
    },
    {
      "id": "b",
      "text": "Cambiar a un modelo más grande y potente para que deje de hacer la misma búsqueda una y otra vez",
      "correct": false,
      "feedback": "Cambiar de modelo no cura esto. La causa raíz es que el bucle no tiene frontera: por muy potente que sea el modelo, si el arnés lo deja reintentar para siempre, girará en el sitio. Cada turno extra sigue acumulando costo y posiblemente error, y un modelo más grande solo hace que cada turno sea más caro. Este es un problema de la capa de control, no de la capacidad del modelo."
    },
    {
      "id": "c",
      "text": "Escribir un prompt de sistema más largo y detallado que le diga repetidamente que no haga búsquedas duplicadas",
      "correct": false,
      "feedback": "Alargar el prompt apuesta a que el modelo leerá y obedecerá esa instrucción cada turno — y ya demostró que la está ignorando. Peor aún, un prompt más largo se come el presupuesto de atención, lo que hace que un contexto que ya se está inflando sea más difícil de procesar con exactitud. Lo que de verdad aguanta es una compuerta rígida que no depende de la autoconciencia del modelo, no una oración más que quizá no registre."
    }
  ]
}
```

## Desbocamiento 4: Agotamiento del presupuesto — más turnos por un contexto más grande, y la factura se desboca

El último es el más fácil de entender y el más doloroso.

Los tres modos de falla anteriores tienden a aparecer, tarde o temprano, como dinero. La autonomía de un agente implica costos más altos[^S1], el modelo puede operar muchos turnos seguidos[^S1], y el contexto en cada uno de esos turnos sigue creciendo — conteo de turnos por tokens por turno, ambos subiendo, así que la factura sube multiplicativamente. Un agente atascado en giro en vacío puede quemar una pila seria de gasto de API durante la noche mientras no miras y no terminar nada.

El riesgo aquí no es solo dinero. Correr muchos turnos significa que tienes que depositar cierto nivel de confianza en la toma de decisiones del modelo[^S1] — y probablemente no quieras extender esa confianza sin un techo.

**Salvaguarda: un tope de presupuesto.** Dale al bucle un techo de presupuesto explícito, medido de una de dos maneras:

- **Por turnos.** La versión más simple, que es justo el tope de turnos de la Lección 3 — ese tope también es un presupuesto.
- **Por tokens (o por dinero).** Más cerca del costo real: una vez que los tokens acumulados consumidos (o el gasto estimado) toca el techo, detente de inmediato.

El punto no es solo detenerse, es **reportar con honestidad**. Detente en el techo y di claramente: me detuve porque se acabó el presupuesto, la tarea no está terminada, y aquí es hasta donde llegué. El peor desenlace es quemar todo el presupuesto y luego fingir que se entrega un resultado completo — lo que te devuelve directo al problema de los errores del primer modo de falla. Detenerse con honestidad es lo que le permite a una persona saber cómo retomar.

## Las cuatro compuertas, juntas

Mira de nuevo los cuatro modos de falla y notarás que comparten un origen: **el bucle no tiene frontera, y el modelo o no nota la frontera o no puede sujetarse a ella.**

- Errores que se componen → puntos de control más parada temprana, cortando el error mientras aún es pequeño
- Inflado y degradación del contexto → gobernanza del contexto, aligerando la carga que el bucle acarrea cada turno
- Bucles muertos → arregla el código (agrega la reasignación que falta); giro en vacío → detección de falta de progreso más un tope de turnos, dando por terminado en lugar del modelo
- Agotamiento del presupuesto → un tope de presupuesto más reporte honesto, poniendo un techo al costo

Estas cuatro compuertas no son adorno opcional. Son las condiciones bajo las cuales «autónomo» no significa «fuera de control». Un bucle sin salvaguarda se ve precioso mientras marcha bien, pero en el momento en que un turno se tuerce no tiene mecanismo para jalarse de vuelta — solo hará rodar un problema pequeño hasta convertirlo en un incidente grande.

Cuidado también con el extremo opuesto: estos mecanismos son ellos mismos complejidad, y "you should consider adding complexity only when it demonstrably improves outcomes."[^S1] (habría que considerar agregar complejidad solo cuando mejore los resultados de forma demostrable.) No le atornilles una pila de compuertas a cada bucle de juguete. La prueba es siempre la misma: ¿qué tan caro sale cuando este bucle se desboca? Cuanto más alto el costo, más completo debería ser el conjunto de compuertas.

Una vez que las compuertas están puestas, la siguiente pregunta surge sola: cuando una compuerta detiene el bucle, o el bucle llega a una bifurcación que no puede juzgar por sí mismo, ¿cómo interviene una persona para interrumpir, corregir el rumbo o tomar el control? Eso es la Lección 5.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Empareja cada desbocamiento con su compuerta

Abajo hay tres bucles de agente que se desbocaron, cada uno describiendo un modo de falla. Para cada uno: (1) decide cuál de los modos de falla de esta lección es; (2) nombra la compuerta de salvaguarda que más necesita; (3) di en una oración qué paso del bucle bloquea esa compuerta.

- **Caso A:** Un agente de reporte semanal lee mal «esta semana» como «la semana pasada» en el turno 2, luego pasa la siguiente docena larga de turnos resumiendo los datos de la semana pasada, y finalmente entrega un reporte que se ve completo pero tiene todas las fechas equivocadas.
- **Caso B:** Un agente de investigación llama una API y recibe de vuelta un error de «clave inválida». Decide reintentar, obtiene el mismo error, y repite — ya va en el turno 12.
- **Caso C:** Un agente trabaja en una tarea genuinamente compleja y avanza con normalidad, pero como hay muchos turnos y cada turno acarrea un contexto grande, la factura nocturna de API llega muy por encima de lo esperado.

<!-- rubric -->
- Los tres modos de falla identificados correctamente (A errores que se componen, B giro en vacío / llamada repetida a una herramienta que falla y que reintentar no arregla, C agotamiento del presupuesto)
- Cada uno recibe la salvaguarda que le corresponde (A puntos de control más parada temprana, B detección de falta de progreso más un tope de turnos, C tope de presupuesto más reporte honesto)
- Explica qué paso del bucle bloquea la compuerta, no solo el nombre de la compuerta

<!-- answer -->
El Caso A son errores que se componen: una lectura errónea temprana se arrastra hacia adelante y se amplifica en cada turno subsiguiente. La salvaguarda es puntos de control más parada temprana — pon un punto de control justo después del paso «fijar la definición de la métrica y el rango de tiempo», expón el artefacto intermedio para un vistazo rápido, y si las fechas están mal, detente temprano en vez de esperar a que rueden una docena de turnos más. La compuerta bloquea el paso *antes de que el error se alimente al siguiente turno*. El Caso B es giro en vacío: el código en sí está bien, cada turno legítimamente emite una petición, y es el modelo llamando repetidamente la misma herramienta que no puede tener éxito — una clave inválida no es un problema que reintentar pueda arreglar, y aun así el modelo sigue intentando sin cambiar de enfoque. Ese es exactamente el giro en vacío (livelock) que esta lección definió, no un bucle muerto, que es una falla mecánica en el código anfitrión. La salvaguarda es detección de falta de progreso (varios turnos seguidos devolviendo el mismo error sin resultado nuevo significa que está atascado, así que detente) en capas con un tope de turnos como fusible. La compuerta bloquea el paso *antes de que la misma falla se repita sin límite*. El Caso C es agotamiento del presupuesto: conteo de turnos por contexto por turno, así que el costo sube multiplicativamente. La salvaguarda es un tope de presupuesto (contado en tokens o en dinero, deteniéndose en el momento en que se toca) más un reporte honesto de dónde están las cosas. La compuerta bloquea *el momento en que el costo acumulado toca el techo*.

<!-- hint -->
Pregúntate primero: ¿este bucle está «continuando encima de un error», «repitiendo una acción que no puede tener éxito», o «funcionando con normalidad pero demasiado caro»? Esos son tres modos de falla distintos.

<!-- hint -->
Una salvaguarda no se trata de «hacer más listo al modelo», se trata de «que el arnés sostenga la frontera cuando el modelo no puede sostenerla él mismo». Piensa en qué cantidad vigila cada compuerta: ¿el artefacto intermedio? ¿la señal de progreso? ¿el gasto corriente?

### Nivel 2: Por qué la detección de falta de progreso se gana su lugar junto a un tope de turnos

Alguien argumenta: «Ya puse un tope de turnos de 50. Con eso basta — por más desquiciado que se ponga el bucle, gira 50 turnos y se detiene. No hace falta ninguna detección de falta de progreso encima».

Rebate o extiende esa afirmación. Requisitos: (1) explica qué desperdicia un bucle solo-con-tope cuando empieza a girar en vacío en el turno 5; (2) explica por qué la detección de falta de progreso y el tope de turnos son complementarios en vez de sustitutos; (3) enlaza los argumentos de esta lección sobre el costo multiplicativo y los errores que se componen para defender la parada temprana.

<!-- rubric -->
- Señala que un tope solo quema todos los turnos restantes (atascado en el turno 5 pero girando aún hasta el turno 50), desperdiciando tokens, tiempo y dinero
- Explica la complementariedad: la detección de falta de progreso hace la parada temprana inteligente, el tope de turnos respalda todo lo que se cuela
- Usa el costo multiplicativo y los errores que se componen para argumentar que cuanto antes te detienes, menor la pérdida

<!-- answer -->
El problema de un tope solo es que solo garantiza «no se ejecutará más allá de 50 turnos», no «no hará trabajo inútil». Si el bucle cae en giro en vacío en el turno 5 — el mismo resultado vacío volviendo una y otra vez — el tope de turnos se quedará ahí sentado viéndolo moler los 45 turnos restantes antes de detenerse. Cada uno de esos 45 turnos gasta tokens, tiempo y dinero, y como el costo es conteo de turnos por contexto por turno multiplicados juntos, los turnos tardíos son individualmente más caros que los tempranos. La detección de falta de progreso puede notar poco después del turno 5 que la señal de progreso se aplanó y detenerse temprano, ahorrando los 45 turnos de desperdicio. Los dos son complementarios: la detección de falta de progreso se encarga de «detenerse de forma inteligente una vez que está claramente atascado», pero depende de que puedas definir una señal de progreso confiable, y si algún modo de falla se le escapa, el tope de turnos es el fusible final que aguanta pase lo que pase. Trae también los errores que se componen a esto: si esos turnos no son giro en vacío sino que empujan hacia adelante encima de un error, detenerse temprano no solo ahorra dinero, detiene que el error crezca — cuanto antes te detienes, menor el desastre que hay que limpiar. Así que la jugada correcta es instalar ambas compuertas, no usar una como reemplazo de la otra.

<!-- hint -->
Un tope de turnos responde «¿cuánto puede ejecutarse esto como máximo?» La detección de falta de progreso responde «¿todavía avanza?» Esas son dos preguntas distintas.

<!-- hint -->
Mete los números concretos — atascado en el turno 5, tope de 50 — y haz la aritmética: ¿cuántos turnos se desperdician? ¿El costo de esos turnos es plano, o se pone más caro a medida que avanza?

<!-- /exercises -->

## Resumen

- Un bucle no se dará por terminado a sí mismo: `while` solo conoce su condición, y el modelo simplemente seguirá disparando una petición más. La frontera tiene que sostenerla el arnés.
- Errores que se componen — la mayor parte de la entrada del modelo este turno es su propia salida del turno pasado, así que un paso equivocado se arrastra hacia adelante y se amplifica en cada turno posterior; combina eso con el hecho de que puede operar muchos turnos, y la autonomía viene empaquetada con costos más altos y la posibilidad de errores que se componen[^S1]. La compuerta es puntos de control más parada temprana.
- Inflado y degradación del contexto — los datos en el bucle solo se acumulan[^S3], cada token nuevo agota el presupuesto de atención[^S3], la recuperación empeora a medida que se amontonan los tokens, y el contexto es un recurso finito con rendimientos marginales decrecientes[^S3]; la degradación es un gradiente, no un acantilado. La compuerta es gobernanza del contexto (el conjunto de herramientas de manejo de historial de «Memoria y estado del agente»).
- Bucles muertos y giro en vacío son dos cosas distintas: un bucle muerto es un bug en el código anfitrión (olvidar reasignar `response`, por ejemplo) y se arregla arreglando el código; el giro en vacío tiene código correcto y un modelo llamando repetidamente la misma herramienta inviable mientras no va a ningún lado, y se maneja con detección de falta de progreso (detente tras N turnos sin resultado nuevo) en capas con un tope de turnos como fusible. No apuntes la detección de falta de progreso a un bucle muerto, y no esperes que un arreglo de código cure el giro en vacío.
- Agotamiento del presupuesto — el conteo de turnos y el contexto por turno se multiplican para disparar el costo[^S1]; la compuerta es un tope de presupuesto contado en tokens o en turnos, deteniéndose en el techo y reportando el progreso con honestidad.
- Las cuatro compuertas comparten un origen: al bucle le falta una frontera y el modelo no puede sujetarse a una. No son adorno, son lo que evita que la autonomía se deslice al desbocamiento — pero agrégalas solo cuando mejoren los resultados de forma demostrable[^S1].

[>> Lección 5: Intervención y dirección: interrumpir, redirigir, human-in-the-loop](./05-intervention-and-steering.md)
