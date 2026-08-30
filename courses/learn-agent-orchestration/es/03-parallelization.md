# Lección 3: Paralelización: seccionamiento y votación

> Objetivos de aprendizaje:
> - Distinguir entre las dos variantes de la paralelización —seccionamiento y votación—, entender qué resuelve cada una y respetar la frontera que traza «las salidas se agregan programáticamente»
> - Usar `Promise.all` y un pool de concurrencia propio para implementar el seccionamiento, asegurando que la agregación pase referencias y no cargas útiles
> - Calcular los tres costos del fan-out (los resultados inundando el contexto, los topes de concurrencia de los productos reales, el multiplicador de N× tokens de la votación) y usarlos para decidir si una propuesta debería paralelizarse
>
> Requisitos: Completaste las Lecciones 1 y 2, tienes el envoltorio `runAgent()` de la Lección 2 | Anterior: [<< Lección 2: Encadenar y enrutar: encadenamiento y enrutamiento](./02-chaining-and-routing.md) | Siguiente: [Lección 4 >>](./04-orchestrator-workers.md)

## Doce documentos, una cadena, una hora en la fila

La cadena de la Lección 2 ya funciona: esquema → compuerta → borrador → compuerta → revisar terminología. Cambia los prompts por otros centrados en la revisión —extraer puntos clave, sugerir correcciones, verificar términos— y la forma de la cadena no cambia. Ejecútala sobre un documento: seis o siete minutos.

Entonces el equipo de producto te deja un directorio sobre el escritorio: 12 documentos, cada uno necesita la misma pasada de revisión.

Escribes un bucle `for`, lo arrancas y te vas a preparar un café. Una hora después vuelves. El log se detuvo en el documento 9. El documento 10 está extrayendo puntos clave.

Durante esa hora, la máquina pasó la mayor parte del tiempo esperando. Esperando la respuesta de la API del documento 1 antes de enviar la solicitud del documento 2. Esperando a que el documento 2 terminara sus cuatro etapas antes de que le tocara el turno al documento 3. Hazte una pregunta práctica: ¿la conclusión de revisión del documento 3 depende de una sola palabra del resultado del documento 2?

No. Son 12 documentos independientes. A sus informes de revisión no les importa quién termine primero. En el encadenamiento, la espera tiene una razón: la entrada del paso siguiente es la salida del anterior. Aquí no hay tal razón. Estas 12 ejecuciones están en fila únicamente porque un bucle `for` las puso en fila.

El curso 6 de esta serie ya cubrió los patrones de colaboración de fan-out y agregación y cómo funciona la votación multiperspectiva[^S1]. Esta lección lo convierte en código y salda las cuentas: el fan-out no es gratis. La velocidad es real, y el costo también.

## Definición: pueden ejecutarse a la vez, con las salidas agregadas programáticamente

Empieza por la formulación original. Los LLM a veces pueden trabajar sobre una tarea de forma simultánea y tener sus salidas agregadas programáticamente. Este flujo de trabajo es la paralelización, con dos variaciones clave[^S1]:

- **Seccionamiento (sectioning)**: Partir una tarea en subtareas independientes ejecutadas en paralelo[^S1]. Revisar 12 documentos es seccionamiento.
- **Votación (voting)**: Ejecutar la misma tarea varias veces para obtener salidas diversas[^S1]. Hacer que tres perspectivas evalúen cada una el mismo texto es votación.

Cuándo usarla: cuando las subtareas divididas se pueden paralelizar para ganar velocidad, o cuando hacen falta varias perspectivas o intentos para obtener resultados con mayor confianza[^S1]. Hay un añadido fácil de saltarse pero valioso: para tareas complejas con múltiples consideraciones, los LLM en general se desempeñan mejor cuando cada consideración la maneja una llamada al LLM aparte, permitiendo atención enfocada en cada aspecto específico[^S1]. Traducción: el seccionamiento y la votación no son solo ahorradores de tiempo. Meter «legal, seguridad, marca» en un solo prompt frente a tener tres llamadas que vigilen una cosa cada una produce calidades distintas.

Una media oración más que hay que clavar: **las salidas se agregan programáticamente**. Después de que vuelven los resultados repartidos en abanico, es tu código el que juzga, filtra y resume; no otra llamada al modelo que lea los 12 informes y escriba un resumen. Que agregue el modelo es un patrón distinto. El orquestador de la Lección 4 hace exactamente ese trabajo. Traza la línea con claridad aquí. La documentación actual de la plataforma Claude enumera Parallelization dentro de la orquestación multiagente: repartir en abanico subtareas independientes a la vez (buscar en varias fuentes, analizar archivos separados) y que el coordinador sintetice los resultados[^S6]; nota que en esa versión el coordinador hace la agregación, mientras que esta lección escribe la versión de agregación programática[^S1]. La misma palabra: quién hace la agregación son dos cosas distintas.

## Seccionamiento: cambiar el bucle for por Promise.all

La versión en serie se ve así, y el tiempo total es la suma de los 12:

```javascript
const reports = [];
for (const doc of docs) {
  reports.push(await runAgent(client, reviewTask(doc)));
}
```

La versión de seccionamiento cambia una línea, y el tiempo total se acerca al del más lento:

```javascript
const reports = await Promise.all(
  docs.map((doc) => runAgent(client, reviewTask(doc))),
);
```

`runAgent()` sigue en la misma posición de envoltorio de la Lección 2: un bucle de arnés completo, que internamente se bifurca por `stop_reason`. Las respuestas simuladas de esta lección se completan todas en un turno (`end_turn`), así que la versión del script final omite la rama de herramienta como simplificación. Al conectar con un cliente real o si hacen falta herramientas, trae de vuelta sin cambios la versión con despacho de herramientas de la Lección 2. La paralelización no altera ni una línea de este bucle en sí. Solo deja de hacer que estos bucles esperen en fila.

La agregación ocurre en la línea siguiente, hecha por este código:

```javascript
const blockers = reports.filter((r) => r.level === "alto");
const total = reports.reduce((n, r) => n + r.issues, 0);
console.log(`${docs.length} documentos, ${total} problemas, ${blockers.length} de riesgo alto`);
```

Estas tres líneas no contienen una segunda llamada al modelo. `filter`, `reduce`, una comprobación de umbral: todo código determinista. Los mismos 12 informes entran, la misma conclusión de una línea sale cada vez. Ese es el beneficio de mantener la agregación en código: las 12 llamadas repartidas en abanico son no deterministas, el paso de fusión es determinista. Cuando algo se rompe, sabes de qué lado sospechar.

`Promise.all` tiene un temperamento que conviene conocer de antemano: si una sola promesa se rechaza, el `await` entero se rechaza, y aunque las otras 11 hayan terminado, no puedes obtener sus resultados. Revisas 12 documentos, el documento 7 se topa con un 500 y el lote entero se desperdicia: los otros 11 se ejecutaron para nada. Ese costo no es razonable. O te cambias a `Promise.allSettled`, o como en el ejercicio de esta lección, envuelves cada trabajador en `try/catch` para recoger las fallas como registros: cada camino del fan-out debería poder fallar de forma independiente.

## Por qué la paralelización no es solo cuestión de velocidad

Si la paralelización fuera solo «la misma cosa hecha antes», sería un truco de rendimiento, no algo que merezca su propia lección. La verdadera razón está del lado del contexto.

La retrospectiva de Anthropic sobre su sistema multiagente de investigación es tajante: la esencia de la búsqueda es la compresión —destilar hallazgos de un corpus enorme—. Los subagentes facilitan la compresión al operar en paralelo con **sus propias ventanas de contexto**, explorando distintos aspectos de la pregunta a la vez antes de condensar los tokens más importantes para el agente investigador principal. Cada subagente además aporta separación de responsabilidades —herramientas, prompts y trayectorias de exploración distintas—, lo que reduce la dependencia del camino y permite investigaciones exhaustivas e independientes[^S2].

Desarma esas dos oraciones. El fan-out compra al menos tres cosas:

1. **Capacidad de ventana**. Escribieron este juicio arquitectónico como conclusión: distribuir el trabajo entre agentes con ventanas de contexto separadas añade capacidad para el razonamiento en paralelo[^S2]. La Lección 1 cubrió esto: lo que de verdad topa con el techo no es el tamaño de la ventana, es «un solo bucle» como forma. El fan-out rodea los límites de una sola ventana no estirándola sino abriendo varias.
2. **Separación de responsabilidades**. Tres subagentes que llevan herramientas y prompts distintos naturalmente no se contaminan entre sí.
3. **Menos dependencia del camino**. En un solo bucle, el juicio del paso 3 queda sesgado por la redacción del paso 2. Tres trayectorias independientes no comparten el mismo sesgo.

La documentación actual de la plataforma ofrece la misma dirección: varios agentes pueden actuar en paralelo con su propio contexto aislado, lo que ayuda a mejorar la calidad de la salida y también puede mejorar el tiempo hasta la finalización[^S6]. Fíjate en que la calidad va primero.

Del lado de la velocidad dieron un número, con un contexto que hay que copiar junto: sus primeros agentes ejecutaban búsquedas secuenciales, lo que era dolorosamente lento. Por velocidad introdujeron dos clases de paralelización: (1) el agente líder levanta 3 a 5 subagentes en paralelo en lugar de en serie; (2) los subagentes usan 3 o más herramientas en paralelo. Estos cambios **recortaron el tiempo de investigación hasta en un 90 % para consultas complejas**[^S2].

Este número hay que usarlo con sus tres calificativos: es un número de **latencia**, no de calidad; está limitado a **consultas complejas** (las consultas simples no tienen mucho que paralelizar); viene de **su propio sistema**. Cuánto ahorras tú cambiando `for` por `Promise.all` depende de qué parte de tus subtareas es de verdad independiente, de qué tan lento es cada camino y de dónde se atasca la concurrencia; de eso trata el resto de esta lección.

```agentmentor-check
{
  "id": "orc-zh-03-unbounded-fanout",
  "label": "Juzgar qué pasa con un fan-out ilimitado de 200 caminos",
  "prompt": "El equipo necesita revisar 200 documentos. Un colega leyó la sección de paralelización, escribió `const reports = await Promise.all(docs.map((d) => runAgent(client, reviewTask(d))))`, enviando los 200 de una vez, con el razonamiento de que «total, son independientes, y más paralelo es más rápido». ¿Qué pasa cuando este código sale a producción?",
  "whyHere": "Acabamos de cubrir los tres beneficios del fan-out, justo cuando es más fácil leer «las subtareas son independientes» directamente como «paralelizar sin límite está bien», así que quien aprende necesita comprobar si está contabilizando los topes de concurrencia y el costo de la agregación",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "La independencia es correcta, «todos de una vez» es el error: los productos reales ponen tope a la concurrencia, esto necesita un pool de concurrencia. Además, 200 resultados detallados inundando el lado de la agregación reventarán el contexto; pasa solo referencias",
      "correct": true,
      "feedback": "Hay dos cosas que arreglar. Lado de la concurrencia: Claude Code falla con «Concurrent subagent limit reached» cuando hay 20 subagentes ejecutándose, y el error le dice explícitamente al modelo que no reintente; el runtime de flujos de trabajo admite hasta 16 agentes concurrentes (menos cuando la CPU está limitada), con tope de 1000 agentes por ejecución; Managed Agents admite un máximo de 25 hilos concurrentes. Tres equipos distintos, tres implementaciones distintas, todas fijan techos: eso mismo es la respuesta. El fan-out ilimitado no es más rápido, agota a la vez los límites de tasa, la memoria y el riesgo de falla en lote. Además, `Promise.all` rechaza el await entero si un solo camino se rechaza: aunque los otros 199 hayan terminado, no puedes obtener sus resultados. Lado de la agregación: los resultados de los subagentes vuelven a la conversación principal, y muchos subagentes devolviendo cada uno resultados detallados consumen contexto considerable. 200 informes detallados volviendo van a quemar el tiempo que ahorró el fan-out. Forma correcta: pool de concurrencia que regule + cada camino guardando su salida en un sistema externo, pasando solo referencias ligeras de vuelta al coordinador."
    },
    {
      "id": "b",
      "text": "Ningún problema. Como los 200 documentos son independientes, los resultados no se contaminarán entre sí. Más concurrencia significa menos tiempo total. 200 caminos frente a 3 caminos es solo una diferencia de velocidad. Las fallas se vuelven a ejecutar una por una",
      "correct": false,
      "feedback": "La independencia solo garantiza que «los resultados se computan correctamente», no que «200 solicitudes se puedan enviar con éxito». 200 caminos concurrentes toparán juntos con los límites de tasa, ocuparán memoria juntos y fallarán juntos en tu cara, y la semántica de `Promise.all` significa que un rechazo rechaza el conjunto: aunque los otros 199 hayan terminado, sus resultados se pierden. Toma como referencia los productos reales: Claude Code viene con 20 subagentes concurrentes por defecto, el runtime de flujos de trabajo llega a 16 agentes concurrentes con tope de 1000 por ejecución, y Managed Agents llega a 25 hilos concurrentes. Todos estos techos los enseñó el tráfico real. Y luego la agregación: 200 informes detallados volviendo al flujo principal alcanzan para agotar el contexto solo en ese paso."
    },
    {
      "id": "c",
      "text": "No habría que usar paralelización en absoluto. A escala de 200, quédate con la vieja fila en serie. Lento pero seguro, y al menos no se romperán todos juntos. La estabilidad está por encima de todo",
      "correct": false,
      "feedback": "Replegarse a la serie fuerza a hacer fila a una forma que debería paralelizarse. Estos 200 documentos cumplen las condiciones de la paralelización —las subtareas divididas se pueden paralelizar para ganar velocidad, la independencia se sostiene—, y la serie solo significa esperar para nada. El punto de convergencia correcto está en el medio: paralelización acotada. Usa un pool de concurrencia para topar los caminos simultáneos en un número que puedas permitirte (3, 8, 16; depende de las cuotas y de las máquinas), envuelve cada camino en `try/catch`, guarda la salida en archivos externos, y pasa solo referencias y un resumen de una línea de vuelta a la agregación. Consigue la aceleración sin empujar el sistema al borde del precipicio."
    }
  ]
}
```

## Primer costo: la agregación se come de vuelta el contexto que ahorraste

Al repartir en abanico, todo el mundo mira «cuántos caminos se ejecutan a la vez». Los desastres suelen ocurrir en el camino de vuelta.

La documentación de subagentes de Claude Code pone este costo sobre la mesa: cuando los subagentes terminan, sus resultados vuelven a tu conversación principal. Ejecutar muchos subagentes que devuelven cada uno resultados detallados puede consumir contexto considerable[^S4]. Los subagentes existen para **proteger** el contexto de la conversación principal —manteniendo la exploración y la implementación fuera de tu conversación principal[^S4]—, pero en cuanto lo que vuelve pesa demasiado, la protección se invierte.

La misma retrospectiva dio un remedio, y lo dio de forma específica: en lugar de exigir que los subagentes comuniquen todo a través del agente líder, implementa sistemas de artefactos donde los agentes especializados puedan crear salidas que persistan de forma independiente. Los subagentes llaman a herramientas para guardar su trabajo en sistemas externos, y luego pasan **referencias ligeras** de vuelta al coordinador[^S2].

Traduce eso a un lema para escribir código: **pasa referencias, no cargas útiles**.

```javascript
// El lado de la agregación no recibe 12 informes, sino 12 registros como este
{ id: "api-auth", file: "out/api-auth.md", summary: "Conclusión: 3 problemas, nivel de riesgo alto" }
```

¿Qué tan grande es la diferencia? El script del ejercicio de esta lección te da un número real: 8 salidas en disco suman 2195 bytes, lo que vuelve a la agregación son solo 718 bytes, y esta proporción se ensancha rápidamente a medida que los documentos crecen: con informes diez veces más largos, lo que se pasa de vuelta sigue siendo un resumen de una línea más una ruta. Quien necesite el texto completo, que lo lea desde la ruta.

Este camino compra otras cosas de paso. La documentación de flujos de trabajo menciona que el runtime rastrea el resultado de cada agente a medida que avanza la ejecución, que es lo que hace que una ejecución sea reanudable dentro de la misma sesión. Un flujo de trabajo que reparte el trabajo en abanico entre muchos agentes pequeños preserva por tanto más progreso que un solo agente largo[^S5]. Las salidas aterrizan afuera, dejando registro línea por línea; la parte del registro es el mismo principio que la observabilidad del curso 11 de esta serie. La parte de «interrumpido a mitad de ejecución no empieza desde cero» es territorio del curso 9, «que las tareas largas sobrevivan a una interrupción».

## Segundo costo: la concurrencia nunca es ilimitada

En el momento en que escribes `Promise.all(docs.map(...))`, en realidad estás diciendo «concurrencia = longitud del arreglo». El arreglo es 12, bien. El arreglo es 200, otra historia.

Mira los techos de tres productos reales:

- Claude Code: por defecto, cuando hay 20 subagentes ejecutándose en una sesión, generar otro con la herramienta Agent falla con `Concurrent subagent limit reached`, y el mensaje de error le dice explícitamente a Claude que no reintente[^S4].
- El runtime de flujos de trabajo de Claude Code: hasta 16 agentes concurrentes, menos cuando Claude Code dispone de menos CPU (incluido dentro de un contenedor con CPU limitada)[^S5]; 1000 agentes en total por ejecución[^S5].
- Managed Agents: se admite un máximo de 25 hilos concurrentes. El coordinador puede llamar a varias copias de un mismo agente de la lista, creando varios hilos asociados a un agente[^S6].

Tres equipos distintos, tres implementaciones distintas, todos fijan techos, y los números ni siquiera son grandes. Este hecho por sí mismo es material didáctico: **el fan-out ilimitado es un accidente, no una optimización**. (La Lección 4 cubrirá un caso real de desastre: los primeros agentes generaban 50 subagentes para una consulta simple[^S2]. Para entonces descubrirás que «quién decide cuántos generar» es más peliagudo que «cuál es el techo».)

La regulación más barata es el lote:

```javascript
// Lote: 3 por lote, lotes en serie
const reports = [];
for (let i = 0; i < docs.length; i += 3) {
  const batch = docs.slice(i, i + 3);
  reports.push(...(await Promise.all(batch.map((d) => runAgent(client, reviewTask(d))))));
}
```

Funciona, pero tiene efecto cubeta: cada lote espera a que termine su más lento antes de empezar el siguiente. De tres documentos, uno es especialmente largo, y los otros dos caminos se quedan esperando.

Un pool de concurrencia no tiene este problema: fija N «carriles», y cada carril toma el siguiente elemento de un cursor compartido en cuanto termina su trabajo actual, con siempre N en vuelo:

```javascript
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}
```

Unas diez líneas, sin dependencias. `cursor++` es seguro en JavaScript de un solo hilo: el código síncrono entre dos `await` no se puede interrumpir. No hay riesgo de que dos carriles tomen el mismo índice. En el ejercicio le añadirás `try/catch` para que la falla de un solo camino no arrastre al lote entero.

¿Cuánto debería valer `limit`? No hay una respuesta universal. Es la intersección de tu cuota de API, la capacidad del servicio aguas abajo y la duración de un solo camino. Pero rellenar un número específico frente a no rellenar ninguno son dos clases distintas de ingeniería.

## Tercer costo: la votación paga N× tokens

La definición de la votación es una oración: ejecutar la misma tarea varias veces para obtener salidas diversas[^S1]. El código es corto:

```javascript
const angles = ["perspectiva legal", "perspectiva de seguridad", "perspectiva de marca"];
const opinions = await Promise.all(
  angles.map((angle) => runAgent(client, reviewTask(doc, angle))),
);

// Umbral escrito en código: si 2 de 3 votos marcan problemas, rechazar
const flagged = opinions.filter((o) => o.verdict === "tiene problemas").length;
const decision = flagged >= 2 ? "rechazar" : "aprobar";
```

La agregación aquí sigue estando hecha por código: `filter` más un umbral. Cuántos votos fijan el umbral es una decisión de producto, fijada en duro, cambiable en cualquier momento, auditable. No habría que dejársela a la improvisación del modelo. Los escenarios de alto riesgo pueden ajustar el umbral a «un veto», y los de bajo riesgo pueden exigir los tres votos para bloquear.

La contabilidad es directa: **vota N veces, paga N× tokens**. Pon este dinero junto al multiplicador de la Lección 1: según sus datos, los agentes usan unas 4× los tokens de las interacciones de chat, y los sistemas multiagente unas 15×. Los sistemas multiagente necesitan por tanto tareas lo bastante valiosas como para cubrir el costo de esa mejora de rendimiento[^S2]. La etiqueta de precio de la votación de tres perspectivas es ese 4× de un solo agente multiplicado por 3. No multipliques 15× por 3: ese 15× ya incluye la contabilidad del fan-out.

Así que la votación no es «ejecutar unas cuantas veces más para quedarse tranquilo». Tiene que comprar algo concreto. La documentación de flujos de trabajo es más clara: mover el plan al código también le permite a un flujo de trabajo aplicar un patrón de calidad repetible, no solo ejecutar más agentes; puede hacer que agentes independientes **revisen de forma adversarial** los hallazgos de los demás antes de que se reporten, o redactar un plan desde varios ángulos y sopesarlos entre sí, de modo que obtengas un resultado más confiable que el de una sola pasada[^S5].

«Agentes independientes que se revisan entre sí» es la misma regla que la del curso 10 de esta serie: el trabajador no juzga su propio trabajo. Si haces que el modelo se autorrevise en el mismo contexto, la mayoría de las veces defenderá lo que acaba de producir. Cámbialo a un camino de contexto independiente, cambia los prompts, y entonces sí podría atrapar problemas. Lo que compran la votación y la revisión entre pares no es «la mayoría», es la **independencia**.

Nota una frontera: tres llamadas a un mismo modelo no son tres jueces independientes. Comparten los mismos sesgos de entrenamiento. La votación puede filtrar el ruido de muestreo y los huecos de atención de una sola pasada. No puede filtrar sesgos sistemáticos. No la trates como un mecanismo que produce verdad solo por votar.

## Medida: la independencia es un prerrequisito, no algo opcional

Todos los beneficios de esta lección descansan sobre un prerrequisito que ha aparecido una y otra vez y vale la pena sacar aparte: las subtareas de verdad no tienen que depender unas de otras.

La documentación de Claude Code, al hablar de varios subagentes investigando a la vez, añade específicamente una oración: cada subagente explora su área de forma independiente, y luego Claude sintetiza los hallazgos. **Esto funciona mejor cuando los caminos de investigación no dependen unos de otros**[^S4]. La condición inversa está escrita en la retrospectiva multiagente: algunos dominios requieren que todos los agentes compartan el mismo contexto o implican muchas dependencias entre agentes, y esos dominios hoy no encajan bien con los sistemas multiagente. Por ejemplo, la mayoría de las tareas de programación implican menos tareas verdaderamente paralelizables que la investigación, y los agentes LLM todavía no son muy buenos coordinándose con otros agentes y delegándoles en tiempo real[^S2].

Para juzgar si una propuesta debería paralelizarse, hazte una pregunta: **¿el camino 2 necesita esperar la conclusión del camino 1 para saber qué hacer?**

- Necesita esperar → esta no es la forma de la paralelización. La salida del paso anterior es la entrada del siguiente: eso es el encadenamiento de la Lección 2.
- No necesita esperar → seccionamiento.
- La misma cosa, y quieres varios juicios independientes → votación.

El primer caso es el que más fácilmente se desdibuja: hay una dependencia pero fuerzas el fan-out porque «probablemente salga bien». El resultado son varios caminos de agentes escribiendo cada uno sus propias conclusiones, sin saber de los demás. En la agregación limas las contradicciones a mano: el tiempo ahorrado se va entero en limar, y además pagaste tokens de más.

## Frontera: la descomposición de esta lección está predefinida

Clava una palabra: es la entrada a la Lección 4.

En todos los ejemplos de esta lección, **¿quién definió las subtareas?** Tú. Doce documentos, los leíste del directorio. Tres perspectivas, las fijaste en duro en un arreglo. Antes de que el código se ejecute, cuántos caminos se reparten en abanico y qué hace cada uno está todo resuelto. A esto se le llama descomposición **predefinida**.

Su opuesto: el modelo decide en cuántas partes y qué hace cada una. La fuente original trata esta diferencia como la divisoria clave entre dos patrones: en el flujo de trabajo de orquestador-trabajadores, un LLM central descompone tareas dinámicamente, las delega en LLM trabajadores y sintetiza sus resultados[^S1]. Aunque es topográficamente similar a la paralelización, la **diferencia clave es su flexibilidad: las subtareas no están predefinidas, sino determinadas por el orquestador a partir de la entrada específica**[^S1].

Así que la frontera entre las dos no es «cuántos caminos se ejecutan a la vez», sino «quién escribió ese arreglo». Si el arreglo es tuyo, es esta lección. Si el arreglo lo genera el modelo en el momento, es la lección siguiente. El enrutamiento de la lección anterior ya le entregó una decisión al modelo (qué rama). La lección siguiente le entrega un trozo más grande: la descomposición misma.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Cinco propuestas de fan-out, juzgar la forma y encontrar las trampas

Tienes cinco propuestas sobre el escritorio. Dale a cada una una categoría —**seccionamiento** / **votación** / **no debería paralelizarse**— y explica por qué. Para las que juzgues como seccionamiento o votación, añade dos notas de tratamiento: cómo fijar la concurrencia y cómo agregar.

1. Doce documentos de producto independientes, cada uno necesita el mismo proceso de revisión.
2. Un texto de alto riesgo a punto de salir en la página principal, necesita evaluación desde las perspectivas legal, de seguridad y de marca.
3. Un script de migración de base de datos que requiere respaldo → alterar el esquema → rellenar datos, tres pasos en orden estricto.
4. Cuarenta módulos necesitan evaluación de deuda técnica, pero las reglas de evaluación exigen que cada módulo haga referencia a las conclusiones del módulo anterior, convergiendo gradualmente hacia un criterio unificado.
5. Una entrada de usuario necesita clasificarse como contenido que infringe o no; el costo de clasificar mal es alto y quieres una confianza mayor que la de una sola llamada.

<!-- rubric -->

- Las cinco reciben categorías claras, y la base del juicio aterriza en la pregunta «¿el camino 2 necesita esperar la conclusión del camino 1?», no en la escala ni en la intuición
- Los puntos 3 y 4 se juzgan ambos como que no deberían paralelizarse, y el razonamiento del punto 4 tiene que señalar que es **dependencia de conclusiones** (no «demasiados elementos» ni «miedo a los errores»)
- Cada punto juzgado como seccionamiento o votación (puntos 1, 2, 5) escribe el tratamiento de la concurrencia (fijar techo / lote o pool) y el tratamiento de la agregación (pasar referencias o devolver solo conclusiones estructuradas), ambos obligatorios
- El punto 5 tiene que mencionar el umbral definido por código, y explicar que los escenarios de alto riesgo deberían tener umbrales más estrictos
- Señalar que el costo de la votación es N× tokens, y que no se puede votar indiscriminadamente sobre todas las entradas

<!-- answer -->

Respuesta de referencia:

**Punto 1 — Seccionamiento.** Los doce documentos no se referencian entre sí, y la conclusión del documento 3 no necesita nada del documento 2: subtareas independientes ejecutadas en paralelo, el caso típico[^S1]. Tratamiento de la concurrencia: no escribas `Promise.all(docs.map(...))` enviando los 12 de una vez; usa un pool de concurrencia topado en 3 a 5 caminos. Doce parece manejable, pero el mismo código mañana se ejecutará sobre 200, así que el techo debería estar desde el primer día. Tratamiento de la agregación: cada informe de revisión aterriza en `out/<id>.md`, y lo que vuelve es solo la ruta del archivo más un resumen de conclusión de una línea; muchos subagentes devolviendo cada uno resultados detallados consumen contexto considerable[^S4], y el enfoque correcto es guardar la salida en sistemas externos y pasar solo referencias ligeras de vuelta al coordinador[^S2]. Trampa: con `Promise.all` un solo rechazo pierde todos los demás resultados, así que cada camino necesita su propio `try/catch`, y los fallidos se registran para volver a ejecutarlos aparte.

**Punto 2 — Votación.** El mismo texto ejecutado tres veces, cada una con una perspectiva distinta: exactamente «ejecutar la misma tarea varias veces para obtener salidas diversas»[^S1]. Y para tareas complejas con múltiples consideraciones, que cada una la maneje una llamada aparte con atención enfocada en general se desempeña mejor[^S1], más fuerte que meter tres perspectivas en un solo prompt. Tratamiento de la concurrencia: los tres caminos se pueden enviar juntos directamente, la escala es lo bastante pequeña como para saltarse el pool. Si procesas muchos textos por lotes, es «seccionamiento por fuera × votación por dentro», y la capa externa tiene que regular o la concurrencia será la cantidad de textos por 3. Tratamiento de la agregación: vuelven tres opiniones y el código juzga; por ejemplo, si 2 de 3 votos marcan problemas, rechazar, con el umbral fijado en duro. Trampa: tres llamadas de un mismo modelo comparten los mismos sesgos, y la votación suprime el ruido de muestreo pero no el sesgo sistemático. Además, esto paga 3× tokens por ejecución, así que actívalo solo para textos de alto riesgo, no a escala completa.

**Punto 3 — No debería paralelizarse.** Respaldo → alterar → rellenar: el prerrequisito del paso siguiente es el éxito del anterior, dependencia secuencial pura, pertenece a la forma de cadena de la Lección 2. Habría que añadir compuertas programáticas entre etapas (no continuar si el respaldo falla). Forzar el fan-out tiene consecuencias peores que la lentitud: corrupción de datos.

**Punto 4 — No debería paralelizarse.** Esta es la trampa más peliaguda: cuarenta módulos suenan a seccionamiento, pero las reglas de evaluación exigen que cada módulo haga referencia a la conclusión del módulo anterior, construyendo dependencia entre subtareas. La formulación es explícita: varios subagentes investigando a la vez funcionan mejor cuando los caminos de investigación no dependen unos de otros[^S4]. Los dominios que requieren contexto compartido o muchas dependencias entre agentes no encajan bien con multiagente hoy[^S2]. La corrección viable es arreglar primero los requisitos: si el «criterio unificado» se puede fijar antes con una sola llamada y luego pasarse como entrada fija a los 40 caminos, la dependencia queda rota y el segundo paso se puede paralelizar. Si el criterio tiene que evolucionar uno por uno, solo puede ser en serie.

**Punto 5 — Votación, con umbral.** Hace falta un juicio con mayor confianza: exactamente el segundo caso de uso de la paralelización, cuando hacen falta varias perspectivas o intentos para obtener resultados con mayor confianza[^S1]. Tratamiento de la concurrencia: de 3 a 5 caminos enviados juntos, no más; más allá de eso los rendimientos decrecen y los tokens crecen linealmente. Tratamiento de la agregación: el código cuenta los votos, los escenarios de alto riesgo usan «un veto» y no mayoría simple, y las muestras limítrofes van a revisión humana. Trampa: calcula el costo antes de salir a producción —los agentes usan unas 4× los tokens del chat, los sistemas multiagente unas 15×, y estos sistemas necesitan que el valor de la tarea sea lo bastante alto como para cubrir el costo[^S2]—. El juicio de infracción solo vota sobre las muestras de zona gris; las entradas obviamente conformes reciben una sola llamada.

<!-- hint -->

Hazle a cada punto una pregunta: ¿el camino 2 necesita esperar la conclusión del camino 1 para saber qué hacer? Si hay que esperar, no es la forma de la paralelización, y que haya decenas o cientos de elementos no cambia esto. Los «40 módulos» del punto 4 son un distractor; lo que de verdad decide la respuesta es la media oración «hacer referencia a la conclusión del módulo anterior».

<!-- hint -->

«Ejecutar la misma tarea muchas veces» y «ejecutar muchas tareas distintas una vez cada una» son dos variantes distintas, no las mezcles. Además, los dos puntos juzgados como votación deben una cosa más: ¿cuántos votos cuentan? Este umbral tiene que estar escrito en código, y cuanto más alto sea el costo de clasificar mal, más estricto que la mayoría simple debería ser el umbral.

### Nivel 2: Escribir un fan-out acotado y ejecutarlo tú

Escribe un `fanout.mjs` ejecutable (Node 18+, sin dependencias), con estos requisitos:

- `client` simulado incorporado, que finja `messages.create`, sin conexión, con la duración y la conclusión de cada elemento fijadas en duro, para que dos ejecuciones se puedan comparar carácter por carácter
- 8 elementos, cada uno manejado por una llamada a `runAgent()` (reutiliza la forma del envoltorio de la Lección 2)
- Implementa tu propio pool de concurrencia, con tope en 3; los trabajadores ejecutándose a la vez no pueden exceder 3; la falla de un solo camino no puede arrastrar al lote entero
- Cada trabajador escribe su salida a un archivo en el directorio `out/`; la agregación solo recoge rutas de archivo y resúmenes de una línea, no trae de vuelta los cuerpos de los informes
- Al final imprime una tabla resumen (elemento / duración / conclusión / archivo de resultado), e imprime la comparación de bytes en disco frente a bytes devueltos
- Camino de dictamen con códigos de salida: todo con éxito `exit 0`, cualquier falla o archivo de resultado vacío `exit 1`
- Después de ejecutar, cambia el tope de concurrencia de 3 a 8 y vuelve a ejecutar (edita el código o usa una variable de entorno), y verifica que el orden de finalización cambió pero el conjunto de resultados no. Para que el orden cambie de verdad, las duraciones fijadas en duro **no las hagas crecer según el orden del arreglo ni todas iguales** (por ejemplo 120/40/200/60/30/150/80/45), o el orden de finalización con ambos niveles de concurrencia resultará ser el mismo

<!-- rubric -->

- El pool de concurrencia es de escritura propia (N carriles fijos + cursor compartido, o equivalente), sin introducir dependencias de terceros, y los trabajadores ejecutándose a la vez efectivamente no exceden `limit`
- Cada trabajador tiene su `try/catch` interno (o tratamiento equivalente), y cuando un camino falla los demás igual se completan y entran en la tabla resumen
- La salida se escribe de verdad a archivos bajo `out/`, y el objeto devuelto solo tiene campos ligeros como ruta y resumen, sin el cuerpo del informe
- Las ramas del dictamen se sostienen ambas: todo con éxito `process.exit(0)`, cualquier falla o archivo vacío `process.exit(1)` e imprimir cuál falló
- Las salidas de ambas ejecuciones vienen de una ejecución real, los órdenes de finalización difieren (prerrequisito: la disposición de duraciones cumple la condición de arriba), las huellas del conjunto de resultados coinciden, y puedes explicar por qué el orden cambia mientras los resultados no

<!-- answer -->

Respuesta de referencia: el script completo va abajo; quien escribe esta lección lo ejecutó en Node, y los dos bloques de salida siguientes son resultados de ejecución pegados directamente.

```javascript
// fanout.mjs — Fan-out por seccionamiento: 8 elementos, tope de concurrencia 3, la agregación solo pasa referencias
// Uso: node fanout.mjs          concurrencia 3 por defecto
//      LIMIT=8 node fanout.mjs  concurrencia 8
import { mkdir, writeFile, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const OUT_DIR = "out"; // Ruta relativa: las referencias devueltas pesan menos y no dependen del directorio de ejecución
const LIMIT = Number(process.env.LIMIT ?? 3);

// ---------- 1. Entrada: 8 elementos independientes ----------
const DOCS = [
  { id: "api-auth", title: "Guía de autenticación de la API" },
  { id: "billing-faq", title: "Preguntas frecuentes de facturación" },
  { id: "onboarding", title: "Guía de incorporación" },
  { id: "webhook-guide", title: "Guía de integración de webhooks" },
  { id: "rate-limit", title: "Política de límites de tasa" },
  { id: "sdk-migration", title: "Guía de migración del SDK" },
  { id: "error-codes", title: "Referencia de códigos de error" },
  { id: "security-notes", title: "Buenas prácticas de seguridad" },
];

// ---------- 2. Cliente simulado: finge messages.create, sin conexión ----------
// La duración y la conclusión de cada id están fijadas en duro, así dos ejecuciones se comparan igual
const FAKE = {
  "api-auth": { ms: 120, issues: 3, level: "alto" },
  "billing-faq": { ms: 40, issues: 1, level: "bajo" },
  onboarding: { ms: 200, issues: 4, level: "medio" },
  "webhook-guide": { ms: 60, issues: 2, level: "medio" },
  "rate-limit": { ms: 30, issues: 0, level: "bajo" },
  "sdk-migration": { ms: 150, issues: 5, level: "alto" },
  "error-codes": { ms: 80, issues: 2, level: "bajo" },
  "security-notes": { ms: 45, issues: 1, level: "medio" },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createStubClient() {
  return {
    messages: {
      async create({ messages }) {
        const last = messages[messages.length - 1].content;
        const id = /<doc id="([^"]+)">/.exec(last)?.[1];
        const f = FAKE[id];
        if (!f) throw new Error(`El cliente simulado no reconoce el elemento: ${id}`);
        await sleep(f.ms); // Finge la ida y vuelta de red
        const findings = Array.from(
          { length: f.issues },
          (_, i) => `- Sección ${i + 1}: La redacción no coincide con la API actual, requiere revisión`,
        ).join("\n");
        return {
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: `# Informe de revisión: ${id}\n\n## Hallazgos\n${findings || "- Ninguno"}\n\nConclusión: ${f.issues} problemas, nivel de riesgo ${f.level}`,
            },
          ],
        };
      },
    },
  };
}

// ---------- 3. runAgent: el envoltorio de la Lección 2 simplificado (el simulador solo hace end_turn, se omite la rama de herramienta) ----------
async function runAgent(client, task) {
  const messages = [{ role: "user", content: task.prompt }];
  for (let turn = 0; turn < 8; turn++) {
    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      messages,
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (res.stop_reason === "end_turn") return text;
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: "continúa" });
  }
  throw new Error(`${task.id}: excedió el límite de turnos sin converger`);
}

// ---------- 4. Pool de concurrencia: tope LIMIT, sin dependencias ----------
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        try {
          results[i] = { ok: true, value: await worker(items[i], i) };
        } catch (err) {
          results[i] = { ok: false, id: items[i].id, error: String(err) };
        }
      }
    },
  );
  await Promise.all(lanes);
  return results;
}

// ---------- 5. Un trabajador = un runAgent + una escritura a disco ----------
const completionOrder = [];

async function reviewOne(client, doc) {
  const t0 = Date.now();
  const report = await runAgent(client, {
    id: doc.id,
    prompt: `Revisa el siguiente documento, enumera los lugares que no coinciden con la API actual, y en la última línea, empezando con "Conclusión:", da la cantidad de problemas y el nivel de riesgo.\n\n<doc id="${doc.id}">${doc.title}</doc>`,
  });
  const file = path.join(OUT_DIR, `${doc.id}.md`);
  await writeFile(file, report, "utf8");
  const summary = report.split("\n").find((l) => l.startsWith("Conclusión:")) ?? "Sin conclusión";
  completionOrder.push(doc.id);
  // Lo que vuelve al coordinador es solo este trozo pequeño: referencia + resumen de una línea
  return { id: doc.id, file, summary, ms: Date.now() - t0, bytes: Buffer.byteLength(report) };
}

// ---------- 6. Flujo principal ----------
const client = createStubClient();
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const wallStart = Date.now();
const settled = await pool(DOCS, LIMIT, (doc) => reviewOne(client, doc));
const wallMs = Date.now() - wallStart;

const failed = settled.filter((r) => !r.ok);
const done = settled.filter((r) => r.ok).map((r) => r.value);

console.log(`Tope de concurrencia: ${LIMIT}  Elementos: ${DOCS.length}  Reloj de pared: ${wallMs}ms`);
console.log(`Orden de finalización: ${completionOrder.join(" → ")}`);
console.log("");
console.log("Elemento         Duración Conclusión                 Archivo de resultado");
console.log("-".repeat(78));
for (const d of DOCS) {
  const r = done.find((x) => x.id === d.id);
  if (!r) {
    console.log(`${d.id.padEnd(16)} ${"—".padEnd(8)} Falló                      —`);
    continue;
  }
  console.log(
    `${r.id.padEnd(16)} ${String(r.ms + "ms").padEnd(8)} ${r.summary.padEnd(26)} ${r.file}`,
  );
}
console.log("-".repeat(78));

const payload = done.reduce((n, r) => n + r.bytes, 0);
const carried = Buffer.byteLength(
  JSON.stringify(done.map((r) => ({ file: r.file, summary: r.summary }))),
);
console.log(`Salida en disco: ${payload} bytes   Devuelto a la agregación: ${carried} bytes`);

// Huella del conjunto de resultados: independiente de la concurrencia, tiene que coincidir entre ejecuciones
const digest = createHash("sha256")
  .update(done.map((r) => `${r.id}:${r.bytes}:${r.summary}`).sort().join("|"))
  .digest("hex")
  .slice(0, 12);
console.log(`Huella del conjunto de resultados: ${digest}`);

// ---------- 7. Dictamen ----------
for (const r of done) {
  const s = await stat(r.file);
  if (s.size === 0) failed.push({ id: r.id, error: "Archivo de resultado vacío" });
}
if (failed.length > 0 || done.length !== DOCS.length) {
  console.error(`Dictamen: fallaron ${failed.length} de ${DOCS.length}`);
  for (const f of failed) console.error(`  ${f.id}: ${f.error}`);
  process.exit(1);
}
console.log("Dictamen: pasado");
process.exit(0);
```

Primera ejecución, concurrencia 3:

```text
$ node fanout.mjs; echo "exit=$?"
Tope de concurrencia: 3  Elementos: 8  Reloj de pared: 272ms
Orden de finalización: billing-faq → webhook-guide → api-auth → rate-limit → onboarding → error-codes → security-notes → sdk-migration

Elemento         Duración Conclusión                 Archivo de resultado
------------------------------------------------------------------------------
api-auth         121ms    Conclusión: 3 problemas, nivel de riesgo alto out/api-auth.md
billing-faq      43ms     Conclusión: 1 problemas, nivel de riesgo bajo out/billing-faq.md
onboarding       202ms    Conclusión: 4 problemas, nivel de riesgo medio out/onboarding.md
webhook-guide    61ms     Conclusión: 2 problemas, nivel de riesgo medio out/webhook-guide.md
rate-limit       31ms     Conclusión: 0 problemas, nivel de riesgo bajo out/rate-limit.md
sdk-migration    151ms    Conclusión: 5 problemas, nivel de riesgo alto out/sdk-migration.md
error-codes      81ms     Conclusión: 2 problemas, nivel de riesgo bajo out/error-codes.md
security-notes   46ms     Conclusión: 1 problemas, nivel de riesgo medio out/security-notes.md
------------------------------------------------------------------------------
Salida en disco: 2195 bytes   Devuelto a la agregación: 718 bytes
Huella del conjunto de resultados: fa00bf235437
Dictamen: pasado
exit=0
```

Segunda ejecución, concurrencia cambiada a 8:

```text
$ LIMIT=8 node fanout.mjs; echo "exit=$?"
Tope de concurrencia: 8  Elementos: 8  Reloj de pared: 202ms
Orden de finalización: rate-limit → billing-faq → security-notes → webhook-guide → error-codes → api-auth → sdk-migration → onboarding

Elemento         Duración Conclusión                 Archivo de resultado
------------------------------------------------------------------------------
api-auth         121ms    Conclusión: 3 problemas, nivel de riesgo alto out/api-auth.md
billing-faq      41ms     Conclusión: 1 problemas, nivel de riesgo bajo out/billing-faq.md
onboarding       202ms    Conclusión: 4 problemas, nivel de riesgo medio out/onboarding.md
webhook-guide    62ms     Conclusión: 2 problemas, nivel de riesgo medio out/webhook-guide.md
rate-limit       32ms     Conclusión: 0 problemas, nivel de riesgo bajo out/rate-limit.md
sdk-migration    152ms    Conclusión: 5 problemas, nivel de riesgo alto out/sdk-migration.md
error-codes      82ms     Conclusión: 2 problemas, nivel de riesgo bajo out/error-codes.md
security-notes   46ms     Conclusión: 1 problemas, nivel de riesgo medio out/security-notes.md
------------------------------------------------------------------------------
Salida en disco: 2195 bytes   Devuelto a la agregación: 718 bytes
Huella del conjunto de resultados: fa00bf235437
Dictamen: pasado
exit=0
```

Tres puntos que vale la pena comparar entre ejecuciones:

1. **El orden de finalización cambió.** Con concurrencia 3, los tres primeros elementos arrancaron primero, y quien terminó antes liberó un carril para el elemento 4, con el orden determinado por «hora de inicio + duración individual». Con concurrencia 8, los ocho arrancaron juntos, y el orden de finalización es simplemente la duración de menor a mayor (30 → 40 → 45 → 60 → 80 → 120 → 150 → 200 milisegundos). El orden de finalización del fan-out es no determinista. Cualquier lógica que dependa de «el primero que vuelve se procesa primero» se caerá aquí.
2. **El conjunto de resultados no cambió.** La tabla resumen imprime en el orden fijo de `DOCS`, y la huella es `fa00bf235437` en ambos casos. Esto es por diseño: la tabla resumen recorre el arreglo de entrada, no el orden de finalización, y la huella hace `sort()` antes de calcularse. **El número de concurrencia es un parámetro de rendimiento, no debería afectar los resultados**; convierte esto en una aserción verificable para que al cambiar la concurrencia puedas cambiarla con confianza.
3. **La agregación solo se llevó de vuelta menos del 40 %.** 2195 bytes en disco, 718 bytes devueltos. Con 8 elementos ya hay esta diferencia. Escala a 200 elementos, con cada informe diez veces más largo, y el lado del disco se hincha a cientos de KB mientras el lado devuelto sigue siendo un resumen de una línea más una ruta.

Escribe mal a propósito el id de un elemento (por ejemplo pon `rate-limitX`) y vuelve a ejecutar: el camino del dictamen toma la otra rama:

```text
$ node fanout.mjs; echo "exit=$?"
…(se omiten el detalle por elemento y la tabla resumen: la línea rate-limitX marcada como Falló, los otros 7 aterrizaron en disco)
Dictamen: fallaron 1 de 8
  rate-limitX: Error: El cliente simulado no reconoce el elemento: rate-limitX
exit=1
```

Nota que los otros 7 igual se completaron y aterrizaron en disco: eso es lo que compró el `try/catch` del pool. Cámbialo por `Promise.all(DOCS.map(reviewOne))` y un solo rechazo hace que el `await` entero se rechace, sin poder obtener ninguno de los resultados ya completados de los otros 7.

<!-- hint -->

Separa «tope de concurrencia» y «lote» como dos cosas. El lote es «cada lote espera a que termine el más lento antes del siguiente lote», el pool de concurrencia es «fija N carriles, y cada uno toma el siguiente en cuanto termina el actual». Al escribir el pool usa una variable `cursor` compartida como dispensador de turnos, y abre N funciones asíncronas, cada una con un `while` tomando turnos: JavaScript es de un solo hilo, así que `cursor++` no se interrumpirá.

<!-- hint -->

¿Cómo demostrarte a ti mismo que «el conjunto de resultados no cambia»? No compares dos pantallas de salida a ojo. Comprime cada resultado en una cadena corta (`id:bytes:summary`), ordena, une, calcula sha256 y toma los primeros 12 caracteres para imprimirlo. Si la huella independiente del orden coincide, entonces de verdad no cambió. Recuerda además que la tabla resumen debería recorrer el arreglo de entrada, no el orden de finalización, o la tabla misma temblará con el número de concurrencia.

<!-- /exercises -->

## Resumen

- La definición de la paralelización es «los LLM a veces pueden trabajar sobre una tarea de forma simultánea y tener sus salidas agregadas programáticamente», y sus dos variantes son el seccionamiento (partir una tarea en subtareas independientes ejecutadas en paralelo) y la votación (ejecutar la misma tarea varias veces para obtener salidas diversas)[^S1]
- Sus condiciones son que las subtareas se puedan paralelizar para ganar velocidad, o que hagan falta varias perspectivas e intentos para obtener mayor confianza. Para tareas complejas con múltiples consideraciones, manejar cada una con una llamada aparte con atención enfocada en general se desempeña mejor[^S1]
- El fan-out compra más que velocidad: los subagentes operando en paralelo con sus propias ventanas de contexto exploran y comprimen de vuelta los tokens más importantes, y además traen separación de responsabilidades (herramientas, prompts y trayectorias de exploración distintas) y menos dependencia del camino[^S2]. Distribuir el trabajo entre agentes con ventanas de contexto separadas añade capacidad para el razonamiento en paralelo[^S2]
- El número de aceleración viene con contexto: su sistema de investigación introdujo dos niveles de paralelización (el principal levanta 3 a 5 subagentes en paralelo, los subagentes usan 3 o más herramientas en paralelo), recortando el tiempo de investigación hasta en un 90 % para consultas complejas[^S2]; este es un número de latencia de su propio sistema, no un número de calidad
- La agregación es el primer costo: los resultados de los subagentes vuelven a la conversación principal, y muchos subagentes devolviendo cada uno resultados detallados consumen contexto considerable[^S4]. La solución son los sistemas de artefactos: los subagentes guardan la salida en sistemas externos y pasan solo referencias ligeras de vuelta al coordinador[^S2]
- La concurrencia nunca es ilimitada: Claude Code viene con 20 subagentes concurrentes por defecto y falla con un explícito «no reintentes» al excederse[^S4]. El runtime de flujos de trabajo admite hasta 16 agentes concurrentes (menos cuando la CPU está limitada), con tope de 1000 por ejecución[^S5]. Managed Agents llega a 25 hilos concurrentes[^S6]
- El costo de la votación es N× tokens, y hay que ponerlo junto a ese multiplicador: según sus datos, los agentes son unas 4× el chat, y los sistemas multiagente unas 15× el chat. El valor de la tarea tiene que ser lo bastante alto como para cubrirlo[^S2]. Lo que debería comprar es un patrón de calidad repetible, como agentes independientes revisando de forma adversarial, o redactar desde varios ángulos y luego sopesar[^S5]
- La independencia es el prerrequisito: varios subagentes investigando a la vez funcionan mejor cuando los caminos de investigación no dependen unos de otros[^S4]. Los dominios que requieren contexto compartido o muchas dependencias no encajan bien hoy[^S2]; con dependencia, vuelve a la forma del encadenamiento
- La descomposición de esta lección es toda predefinida (el arreglo lo escribiste tú). Que las subtareas no estén predefinidas sino determinadas por el orquestador a partir de la entrada específica es la diferencia clave entre orquestador-trabajadores y paralelización[^S1], y también el tema de la lección siguiente

[>> Lección 4: Orquestador-trabajadores: volver dinámica la descomposición misma](./04-orchestrator-workers.md)
