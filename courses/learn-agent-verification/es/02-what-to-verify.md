# Lección 2: Qué verificar: primero el estado final, el proceso como respaldo

> Objetivos de aprendizaje:
> - Entender por qué «registrar los pasos correctos y después cotejarlos uno por uno» está condenado a juzgar mal a los agentes, y cambiar a la evaluación del estado final
> - Para los flujos de trabajo complejos, identificar unos pocos puntos de control de verificación discretos que confirmen que «ocurrieron los cambios de estado esperados», en lugar de validar cada paso
> - Convertir un requisito vago en criterios de éxito medibles, alcanzables y multidimensionales, y saber hasta dónde llevar las aserciones de trayectoria
>
> Requisitos: Terminaste la Lección 1 y sabes que, cuando no hay una comprobación que se pueda ejecutar, tú te conviertes en el bucle de verificación | Anterior: [Lección 1 <<](./01-looks-done-vs-is-done.md) | Siguiente: [Lección 3 >>](./03-deterministic-checks.md)

## Tres ejecuciones, tres veredictos de «falló»

Decides agregarle verificación a tu agente. El primer impulso es casi universal: registrar el «enfoque estándar». Recorres la tarea a mano una vez, anotas cada paso —el paso 1 debería llamar a `search`, el paso 2 debería llamar a `fetch_page`, el paso 3 debería llamar a `write_note`— y guardas eso como la clave de respuestas. De ahí en adelante, cada vez que el agente se ejecuta, cotejas su secuencia de llamadas con esa respuesta, paso por paso. Una discrepancia y falla.

La ejecutas tres veces. Tres fallas.

Revisas las salidas: tres resúmenes, hechos correctos, fuentes confiables, todos los ángulos pedidos cubiertos. La única diferencia fue el camino: la primera ejecución buscó en tres fuentes y con eso alcanzó, la segunda buscó en diez, la tercera buscó primero las definiciones de la terminología antes de ponerse a buscar. Esto es exactamente lo que Anthropic observó en su propio sistema multiagente de investigación: incluso con puntos de partida idénticos, los agentes podrían tomar caminos válidos completamente distintos para llegar a su objetivo, uno buscando en tres fuentes mientras otro busca en diez, o usando herramientas distintas para encontrar la misma respuesta[^S2].

Lo que falló no fue el agente. Fue tu método de verificación.

## En realidad no sabes cuáles son los «pasos correctos»

La evaluación tradicional carga con un supuesto por defecto enterrado bien hondo: dada la entrada X, el sistema debería seguir el camino Y y producir la salida Z, los mismos pasos cada vez[^S2]. Este supuesto se sostiene con tanta naturalidad en los sistemas deterministas que la mayoría nunca se da cuenta de que es un supuesto. Los agentes lo dan vuelta de inmediato.

Lo verdaderamente incómodo no es solo que «el camino va a variar»; es esta oración:

> "Because we don’t always know what the right steps are, we usually can't just check if agents followed the “correct” steps we prescribed in advance. Instead, we need flexible evaluation methods that judge whether agents achieved the right outcomes while also following a reasonable process."[^S2]
>
> (Como no siempre sabemos cuáles son los pasos correctos, por lo general no podemos limitarnos a comprobar si los agentes siguieron los pasos «correctos» que prescribimos de antemano. En cambio, necesitamos métodos de evaluación flexibles que juzguen si los agentes alcanzaron los resultados correctos siguiendo además un proceso razonable.)

«No siempre sabemos cuáles son los pasos correctos»: esa es la clave. El camino que registraste no es el único camino correcto. Es solo **el camino que te tocó tomar** esa vez. Lo elevaste a clave de respuestas, y así todo otro enfoque se convirtió en un error.

Fíjate en la segunda mitad: «siguiendo además un proceso razonable». Esto no significa ignorar el proceso por completo. Significa no usar un camino fijo como vara de medir.

## Evaluación del estado final: juzgar resultados, no el flujo

El enfoque de Anthropic es directo: concentrarse en la evaluación del estado final en lugar del análisis turno por turno; no juzgues si el agente siguió un proceso específico, juzga si alcanzó el estado final correcto[^S2]. Este enfoque reconoce que los agentes pueden encontrar caminos alternativos hacia la misma meta, sin dejar de asegurar que entreguen el resultado buscado[^S2].

Primero, una definición en palabras llanas de «estado final»: después de que la tarea termina, el estado que puedes observar en el entorno y verificar a posteriori. Qué archivos aparecieron en el sistema de archivos, qué valores tienen ahora los campos de ese registro de base de datos, qué etiqueta lleva el ticket, si el JSON devuelto trae `status: "resolved"`.

Una prueba de tornasol útil: el estado final es un **sustantivo**, no un verbo. «Llamó a `rename_file`» es un verbo; «todos los nombres de archivo cumplen cierto formato» es un sustantivo. La verificación solo acepta sustantivos.

```text
Tarea: renombrar los PDF de facturas de downloads/ a "fecha_proveedor.pdf"

Verificación por pasos (frágil)        Verificación del estado final (estable)
1. Llamar a list_files                 downloads/ ya no tiene los nombres originales
2. Llamar a read_pdf para cada uno     Cada nombre cumple ^\d{8}_[a-z0-9-]+\.pdf$
3. Llamar a extract_date               La cantidad de archivos coincide con la previa, nada perdido ni agregado
4. Llamar a rename_file para cada uno  Las fechas de los nombres coinciden con las fechas de las facturas en el PDF
```

La columna izquierda falla en el momento en que el agente usa una lectura por lotes en vez de cuatro lecturas individuales, aunque los resultados sean idénticos. A la columna derecha no le importa cómo lee, porque describe «cómo se ve downloads/ ahora», sin relación con cómo llegó a ese estado.

Hay un punto fácil de pasar por alto al escribir aserciones de estado final: **anota también lo que no debería cambiar**. Esa línea de arriba, «la cantidad de archivos coincide con la previa», es una de ellas. Si el agente renombra dos archivos con el mismo nombre y el segundo sobrescribe al primero, la comprobación de «todos los nombres son válidos» pasa a la perfección. Las aserciones de estado final tienen que proteger las dos cosas: que «los cambios esperados ocurrieron» y que «los cambios inesperados no».

## Flujos de trabajo complejos: repartir la evaluación entre puntos de control

La evaluación del estado final no es «ignorar el proceso por completo». La oración que sigue en la fuente da una salida: para los flujos de trabajo complejos, divide la evaluación en puntos de control discretos donde deberían haber ocurrido cambios de estado específicos, en lugar de intentar validar cada paso intermedio[^S2].

Fíjate en la formulación: «deberían haber ocurrido cambios de estado específicos», sigue siendo estado, siguen siendo sustantivos. Solo se mueve el punto de observación de «la línea de meta» a «unos pocos lugares del camino».

> **Aviso de colisión de términos**: el «punto de control» del curso 9 de esta serie se refiere a **guardar el contexto**: escribir en disco el estado en ejecución del agente para que pueda retomar desde ahí después de una caída, con fines de recuperación. El «punto de control» de esta lección se refiere a **verificar el estado**: confirmar que los cambios de estado esperados ocurrieron en cierto punto del flujo, con fines de validación. Las posiciones a menudo se superponen (que donde pones un punto de control también verifiques es natural), pero resuelven problemas distintos. Mezclarlos en la discusión lleva a confusión, así que de aquí en adelante llamaremos a estos «puntos de control de verificación» y a los del curso 9 «puntos de control de recuperación».

Para saber cuándo vale la pena agregar un punto de control de verificación, mira tres cosas:

- **Flujo de trabajo largo, estado final demasiado lejos del inicio**. Cuando falla solo sabes que «no llegó al final», no dónde empezó la desviación.
- **Operaciones irreversibles**. Correos enviados, inventario descontado, archivos sobrescritos: para cuando el estado final revela el error, ya es tarde.
- **La salida intermedia es la base de los pasos siguientes**. El script de migración crea la tabla y después carga los datos; si la estructura de la tabla está mal, todos los datos cargados son basura y el costo de rehacer se multiplica.

Si no aplica ninguna, no agregues ninguno.

Dónde agregarlos: en las **posiciones donde el estado sufre un cambio sustantivo**, no después de cada llamada a herramienta.

```text
Tarea: migrar la tabla de usuarios del esquema viejo al esquema nuevo

Punto de control de verificación 1 (tras crear la tabla): la tabla new_users existe, las columnas coinciden exactamente con el esquema objetivo
Punto de control de verificación 2 (tras cargar los datos): filas de new_users == filas de old_users, sin claves primarias duplicadas
Estado final: la app lee la tabla nueva y pasa la prueba de humo (la comprobación más básica de «¿arranca?»), old_users renombrada a old_users_backup

Qué no comprobamos: si escribió CREATE TABLE o copió de una plantilla,
si cargó todo de una vez o por lotes, cuántos lotes, cuántas filas por lote.
```

Dos puntos de control, un estado final. Tres aserciones gobiernan la migración entera. Si te fueras por «validar cada paso intermedio», este flujo de trabajo podría generar decenas de aserciones, la mayoría penalizando diferencias legítimas de implementación.

## Detente aquí: qué tiene de malo esta propuesta

```agentmentor-check
{
  "id": "vq-zh-02-endstate-vs-steps",
  "label": "Evaluar grabar y reproducir como estándar de verificación",
  "prompt": "Un colega propone: elegir una ejecución especialmente limpia, registrar su secuencia completa de llamadas a herramientas como clave de respuestas y, después de cada ejecución futura, comparar la secuencia nueva con esa, paso por paso; cualquier cosa que no coincida, falla. Dice que esto es lo más riguroso porque «no queda ni un solo paso sin comprobar». ¿Cuál es el problema de fondo de esta propuesta?",
  "whyHere": "Acabas de leer la regla de «evaluar el estado final, no turno por turno». La regla en sí suena simple, pero frente a una propuesta concreta es fácil dejarse llevar por la intuición de que «registrar es más riguroso»: ponla a prueba aquí primero.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Grabar y reproducir está bien en sí mismo; el problema es que la ejecución registrada puede no ser la óptima. Ejecuta varias rondas, elige la más limpia para registrarla y listo.",
      "correct": false,
      "feedback": "Cambiar cuál ejecución registras no arregla el problema de fondo: por más limpio que sea el camino registrado, sigue siendo un solo camino. Incluso con puntos de partida idénticos, los agentes podrían tomar caminos válidos completamente distintos: uno busca en tres fuentes, otro busca en diez[^S2]. «Una clave de respuestas mejor» no resuelve «no debería haber una única clave de respuestas»."
    },
    {
      "id": "b",
      "text": "Una sola secuencia es demasiado rígida. Registra varios caminos válidos para formar una lista blanca; mientras la ejecución coincida con cualquier camino de la lista blanca, pasa.",
      "correct": false,
      "feedback": "Esto es más laxo que un camino único, pero la dirección sigue siendo equivocada. Los caminos válidos no tienen tope; la lista blanca nunca puede estar completa. Cada vez que el agente encuentra un enfoque correcto nuevo tienes que volver y agregar otra entrada: estás manteniendo una lista que está garantizado que queda incompleta, y no puede atrapar las fallas del tipo «el camino está en la lista blanca pero el resultado está mal»."
    },
    {
      "id": "c",
      "text": "Trata la «consistencia del proceso» como sustituto de la «corrección del resultado». Pero no siempre sabes cuáles son los pasos correctos, así que por lo general no puedes comprobar si el agente siguió los pasos que prescribiste; lo que deberías comprobar es si alcanzó el estado final correcto y siguió un proceso razonable.",
      "correct": true,
      "feedback": "Correcto. Este es exactamente el juicio de la fuente: como no siempre sabemos cuáles son los pasos correctos, por lo general no podemos limitarnos a comprobar si los agentes siguieron los pasos «correctos» prescritos; necesitamos métodos de evaluación flexibles que juzguen si alcanzaron los resultados correctos siguiendo un proceso razonable[^S2]. La comparación paso por paso tiene dos errores de juicio fatales: camino distinto y resultado correcto, falla falsa; mismo camino y resultado incorrecto, aprobación falsa."
    }
  ]
}
```

## Cómo definir los criterios de éxito: medibles, alcanzables, multidimensionales

Esas tres palabras, «estado final correcto», tienen que aterrizar en números concretos o en juicios claros; si no, volviste en círculo a «se ve bien». La documentación oficial da dos requisitos duros para los criterios de éxito:

- **Medibles**: usa métricas cuantitativas o escalas cualitativas bien definidas (una escala es una lista de verificación con una rúbrica de puntuación; los detalles de cómo escribir una son contenido de la Lección 4). Los números aportan claridad y escalabilidad, pero las medidas cualitativas pueden ser valiosas si se aplican de manera consistente junto con las cuantitativas[^S5].
- **Alcanzables**: basa tus objetivos en referencias de la industria, experimentos previos, investigación en IA o conocimiento experto. Tus métricas de éxito no deberían ser irreales para las capacidades actuales de los modelos de frontera[^S5].

Y uno más: la mayoría de los casos de uso necesitan una evaluación multidimensional a lo largo de varios criterios de éxito[^S5].

El ejemplo completo de la documentación oficial es una sola oración (las anotaciones entre paréntesis son del original):

> "The sentiment analysis model should achieve an F1 score of at least 0.85 (Measurable, Specific) on a held-out test set* of 10,000 diverse Twitter posts (Relevant), which is a 5% improvement over the current baseline (Achievable)."[^S5]
>
> (El modelo de análisis de sentimiento debería alcanzar un puntaje F1 de al menos 0.85 (medible, específico) sobre un conjunto de prueba reservado de 10,000 publicaciones diversas de Twitter (relevante), lo que representa una mejora del 5% sobre la línea base actual (alcanzable).)

Vale la pena desarmar esta oración porque cada componente bloquea un modo de falla específico:

| Componente | Qué bloquea |
| --- | --- |
| Puntaje F1 | Bloquea el «me parece que está bien». El F1 (media armónica de precisión y recall, de 0 a 1) es un número computable; dos personas deben obtener el mismo resultado |
| Al menos 0.85 | Bloquea mover el arco después del hecho. Define «aprobado» después de ejecutar y siempre aprueba |
| 10,000 publicaciones | Bloquea los resultados casuales por muestras demasiado chicas. Esta es la escala del ejemplo oficial, no un umbral universal |
| Conjunto de prueba reservado | Bloquea ajustarse al conjunto de evaluación: los puntajes altos en preguntas ya vistas no cuentan |
| Publicaciones diversas de Twitter | Bloquea verse bien solo con muestras limpias y derrumbarse cuando llega la distribución real |
| 5% sobre la línea base | Bloquea los objetivos irreales. Se ancla a niveles ya alcanzados, no a ilusiones |

Esa última fila es el método concreto de «alcanzable»: el umbral no se deduce hacia atrás desde los deseos; es un paso chico hacia adelante desde el estado actual. Si no tienes línea base, ejecuta una versión de la implementación más ingenua y usa su puntaje como línea base. Cuando ni siquiera puedes ejecutar una línea base, no te apures a fijar números.

Hay una pregunta todavía más temprana. Cuando Anthropic describe los escenarios apropiados para agentes, dice: los agentes aportan más valor en las tareas que requieren tanto conversación como acción, **tienen criterios de éxito claros**, **habilitan bucles de retroalimentación** e integran una supervisión humana significativa[^S1]. Léelo al revés: si no logras escribir criterios de éxito para esta tarea de ninguna manera, el problema no es el paso de verificación; esta tarea no debería haberse entregado por completo al agente para que la ejecute solo. Si no puedes escribir criterios, te toca mirar todo el proceso, y como decía la Lección 1, en ese punto tú te conviertes en el bucle de verificación.

## Aserciones de trayectoria: puedes agregarlas, pero no las fijes en duro

La evaluación del estado final atrapa el «¿el resultado es correcto?», pero se le escapa una clase de problema: si el agente de verdad reconoce esa herramienta nueva que le diste.

La documentación oficial ofrece un agregado opcional: para cada par de prompt y respuesta, opcionalmente también puedes especificar las herramientas que esperas que el agente llame para resolver la tarea, y así medir si los agentes captan bien el propósito de cada herramienta durante la evaluación[^S3]. Esto es una aserción de trayectoria: no juzga el orden, no juzga la cantidad, solo juzga si ciertas herramientas aparecieron en la trayectoria.

Cuándo sirve: acabas de agregar una herramienta `search_internal_docs` y quieres que el agente la use para las preguntas sobre procesos internos. Pero se va a buscar en la web pública, encuentra una respuesta lo bastante parecida, y la validación del estado final igual pasa. Solo la trayectoria puede ver esa diferencia.

El límite está escrito en la oración inmediatamente siguiente: como puede haber varios caminos válidos para resolver las tareas correctamente, intenta evitar la sobreespecificación o el sobreajuste a estrategias[^S3].

Límites concretos:

- Comprueba solo la pertenencia al conjunto, no el orden ni la cantidad
- Lista solo la herramienta —o las dos— que de verdad te importan; no copies la secuencia entera ahí dentro: eso es grabar y reproducir otra vez
- Si la aserción de trayectoria falla pero el estado final pasa: registra una observación, no hagas fallar la evaluación entera
- Es un agregado opcional, no el valor por defecto. El valor por defecto sigue siendo el estado final[^S2]

```javascript
// Forma de un caso de evaluación: el juicio del estado final es obligatorio, la aserción de trayectoria es opcional
const evalCase = {
  id: 'invoice-rename-003',
  prompt: 'Renombra las facturas de este mes en downloads/ a fecha_proveedor.pdf',
  // Obligatorio: comprobar en qué se convirtió el entorno tras la ejecución (cómo escribir esto, en la Lección 3)
  checkEndState: async (env) => { /* ... */ },
  // Opcional: se espera que haya tocado al menos estas herramientas, sin importar el orden ni la cantidad de llamadas
  expectedTools: ['read_pdf', 'rename_file'],
};
```

## Más allá de la tasa de aprobación: qué más registrar

Después de una ejecución de evaluación, si lo único que obtienes es una tasa de aprobación, te vas a quedar sin nada que decir: ¿qué significa 78%? ¿Lo próximo que deberías ajustar es el prompt o las herramientas?

La documentación oficial recomienda recolectar estas métricas además de la exactitud de alto nivel: el tiempo total de ejecución de las llamadas a herramientas individuales y de las tareas, la cantidad total de llamadas a herramientas, el consumo total de tokens y los errores de herramientas[^S3]. Estas métricas no participan del juicio; participan del **diagnóstico**.

La documentación oficial da dos lecturas:

- Muchas llamadas a herramientas redundantes podrían sugerir que conviene dimensionar mejor los parámetros de paginación o de límite de tokens[^S3]
- Muchos errores de herramientas por parámetros inválidos podrían sugerir que a las herramientas les vendrían bien descripciones más claras o mejores ejemplos[^S3]

Lo que comparten: apuntan el dedo al **diseño de las herramientas**, no al modelo. Muchas llamadas redundantes suelen significar que solo puede traer 20 ítems por vez y entonces tiene que paginar por diez páginas; muchos errores de parámetros suelen significar que la descripción de la herramienta no explicó qué formato necesita ese campo. Estos problemas tienen su raíz del lado de las herramientas: agregarle al prompt de sistema un «llama menos seguido» o un «escribe los parámetros con cuidado» por lo general no funciona; hay que ajustar el diseño de parámetros de la herramienta y su descripción.

Tirando de este hilo salen algunos más (lo de abajo no está avalado oficialmente, son juicios de ingeniería extrapolados de los dos anteriores: verifícalos con tus propios datos): tasa de aprobación sin cambios pero consumo de tokens duplicado significa que este cambio no es gratis; una categoría de tareas con una varianza de duración especialmente grande probablemente esconde reintentos o vueltas en círculo; errores concentrados en una sola herramienta, mira primero esa herramienta, no sospeches del prompt.

Una ejecución de evaluación debería volcar al menos estas columnas; la Lección 6, al construir el arnés de evaluación, las va a usar directamente (para ahorrar ancho de columna, los tokens de entrada y de salida se van a fusionar en uno):

```text
case_id | passed | duration_ms | tool_calls | tokens_in | tokens_out | tool_errors
```

## Límites: tres cosas que no hay que hacer

**Uno: no intentes validar cada paso intermedio**[^S2]. Este es el límite más fácil de romper de esta lección, porque la intuición de que «verificar más es más seguro» es muy fuerte. El resultado real es el opuesto: cuanto más finas son las aserciones, más diferencias legítimas quedan penalizadas, más ruidosa se vuelve la evaluación, hasta que empiezas a ignorar el rojo, y en ese punto ya no sirve para nada.

**Dos: no conviertas las aserciones de trayectoria en el valor por defecto**. Agregar una aserción de trayectoria es tan barato que puedes escribir otra entrada de `expectedTools` sin esfuerzo. Para la décima entrada ya estás prescribiendo estrategia en lo sustancial, y solo en lo formal lo sigues llamando «aserción». Cada vez que agregas una, pregúntate: ¿la salida de verdad se rompe si no se llama a esta herramienta? Si la respuesta es «no necesariamente», no la agregues.

**Tres: no fijes los umbrales después de la ejecución**. Mirar un puntaje de 0.82 y decir «con 0.8 debería alcanzar», y mirar 0.86 y decir «tiene que ser 0.85», son el mismo autoengaño. Fija los umbrales antes de la ejecución y anota la justificación.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Escribir estados finales para cuatro tareas (sin código)

Para las cuatro tareas de abajo, escribe en cada caso: (1) qué **estado final** estás verificando; (2) si conviene agregar puntos de control de verificación, dónde y por qué.

1. **Renombrado por lotes**: renombrar 200 PDF de `invoices/` a "AAAAMMDD_proveedor.pdf"
2. **Investigar y escribir un resumen**: investigar las estrategias de precios de tres competidores, escribir un resumen con citas
3. **Arreglar una prueba que falla**: `user.spec.ts` tiene una prueba `should reject expired token` que falla; haz que el agente la arregle
4. **Clasificar y etiquetar tickets**: etiquetar los 500 tickets de la semana pasada como «facturación / caída / pedido de funcionalidad / otro»

<!-- rubric -->

Rúbrica:

- Los estados finales de las cuatro tareas están escritos como «estado que puedes verificar en el entorno después de la ejecución», son sustantivos y no verbos, y no mezclan descripciones de pasos del tipo «el paso N debería llamar a tal herramienta»; y al menos una tarea escribe aserciones del tipo «las cosas que no deberían cambiar no cambiaron»
- Cada tarea tiene un juicio claro de «agregar / no agregar punto de control de verificación» con un razonamiento anclado en el largo del flujo de trabajo, en si hay operaciones irreversibles o en si los pasos posteriores dependen de las salidas intermedias, y no en «más vale prevenir»
- Donde se agregaron puntos de control de verificación, describen que «debería haber ocurrido un cambio de estado específico», y cada tarea tiene a lo sumo dos o tres, sin caer en la validación paso por paso

<!-- answer -->

Respuesta de referencia:

**1. Renombrado por lotes**

Estado final: la cantidad de archivos en `invoices/` coincide con la previa a la ejecución; cada nombre de archivo cumple `^\d{8}_[a-z0-9-]+\.pdf$`; verificación por muestreo de que las fechas de los nombres coinciden con las fechas de las facturas en el contenido del PDF; el conjunto de todos los hashes de contenido de los archivos antes y después es idéntico (esto protege el «lo que no debería cambiar no cambió»: renombrar no debería alterar el contenido ni perder archivos por sobrescritura de nombres iguales).

Punto de control de verificación: hace falta. Renombrar es una operación irreversible que sobrescribe; el segundo criterio aplica directo. El enfoque es cambiar **los entregables** a dos ítems: primero producir un archivo de mapeo completo de `nombre_viejo → nombre_nuevo` (como `rename-map.json`), y después ejecutar los renombrados. El punto de control de verificación va en «archivo de mapeo generado, renombrados todavía sin ejecutar»: en ese momento el cambio de estado esperado es «el archivo de mapeo existe»; verifica que cubra los 200 archivos, que los nombres nuevos no colisionen entre sí y que todos los formatos sean válidos; detente antes de que se sobrescriba ningún archivo si algo está roto. Fíjate en que esto cambia lo que la tarea entrega (un archivo de mapeo más como salida intermedia), y no prescribe su camino interno: cómo lee los PDF, cómo extrae las fechas, qué calcula primero, sigue sin importar en absoluto.

**2. Investigar y escribir un resumen**

Estado final: los rangos de precios de los tres competidores aparecen en el resumen; cada afirmación factual tiene una cita; el enlace de cada cita se puede abrir y su contenido de verdad respalda esa afirmación; las partes sin precios públicos están escritas explícitamente como «no se encontraron precios públicos», sin números inventados. Algunos de estos estados finales se pueden probar por programa (accesibilidad de los enlaces, si los tres aparecen, si cada párrafo tiene al menos una cita); otros requieren personas o jueces (si las citas de verdad respaldan el enunciado): contenido de la Lección 3 y de la Lección 4, respectivamente.

Punto de control: no hace falta. El flujo de trabajo es largo pero cada paso es reversible (buscar mal y volver a buscar no tiene costo), y las salidas intermedias no son la base de los pasos posteriores. Si insistes en agregar uno, pon un punto de control de verificación en «lista de fuentes recolectada, la redacción todavía no empezó», y comprueba que cada uno de los tres tenga al menos una fuente: las omisiones de una empresa entera salen más baratas si se atrapan temprano.

**3. Arreglar una prueba que falla**

Estado final: el caso que fallaba ahora pasa; los demás casos de la suite de pruebas completa siguen pasando (no rompió otro para arreglar este); `user.spec.ts` en sí no fue modificado. Ese último previene que cambie la aserción en lugar de la implementación; si la tarea permite explícitamente cambiar pruebas, cámbialo por «las modificaciones al archivo de pruebas requieren revisión humana».

Punto de control: no hace falta. Esta es la más cómoda de las cuatro: el estado final en sí es un comando que produce un aprobado/fallido; una ejecución te da la respuesta; insertar puntos de control intermedios es puro exceso.

**4. Clasificar y etiquetar tickets**

Estado final: los 500 etiquetados sin omisiones y sin valores nulos; todos los valores de etiqueta caen dentro de los cuatro valores permitidos, y quedar fuera de rango es un error; sobre una muestra reservada etiquetada a mano, la exactitud o el F1 por clase alcanza el umbral prefijado; la distribución entre las cuatro clases no se derrumba de manera evidente (como 480 etiquetados todos «otro»: la exactitud total podría verse bien y aun así debería alarmarte).

Punto de control: depende del método de escritura. Si escribe en la base de datos uno por uno (parcialmente irreversible), agrega un punto de control en la posición «primeros 50 etiquetados», verifica que los valores de etiqueta sean legales y que la distribución no sea absurda, y detente temprano si algo está roto; si primero produce el resultado completo del etiquetado y después lo escribe en lote en la base de datos, esa salida intermedia ya es una posición natural de punto de control, y no hace falta uno extra.

<!-- hint -->

Pista 1: para juzgar si lo que escribiste es un estado final, usa la vara de «sustantivo o verbo». «Llamó a `rename_file`» es un verbo; «todos los nombres de archivo cumplen cierto formato» es un sustantivo. La verificación solo acepta sustantivos.

<!-- hint -->

Pista 2: para decidir si agregar puntos de control de verificación, mira solo tres cosas: qué tan largo es el flujo de trabajo, si hay acciones irreversibles, y si los pasos posteriores van a usar las salidas intermedias como base. Si no aplica ninguna, no agregues; agregarlos solo vuelve ruidosa la evaluación.

### Nivel 2: Reescribir un requisito vago como criterios de éxito multidimensionales (sin código)

El requisito original es una sola oración: «Organízame las notas de las reuniones de esta semana, las citas deberían ser confiables».

Reescríbelo como criterios de éxito medibles y **multidimensionales**. Para cada dimensión escribe los cuatro ítems: cómo se llama la métrica, cómo se mide, qué umbral y **por qué ese umbral es alcanzable de manera realista**. Después decide qué dimensiones verifican el estado final y cuáles ponen puntos de control intermedios, con su razonamiento. Al menos tres dimensiones. No hace falta código.

<!-- rubric -->

Rúbrica:

- Al menos tres dimensiones, cada una con los cuatro ítems «métrica / cómo se mide / umbral / justificación del umbral» escritos por completo; si falta cualquiera de los ítems está incompleta; y estas dimensiones no se superponen de manera sustancial, cada una bloquea modos de falla distintos
- Los umbrales no salen de la nada: están anclados a la línea base actual, al desempeño humano en la misma tarea o a observaciones de una ejecución de prueba a pequeña escala[^S5]; cualquier dimensión fijada en 100% explica por qué es puramente comprobable de manera mecánica y por qué una falla del modelo solo significa volver a ejecutar, sin usar el «100%» como eslogan
- Se marca qué método usa cada dimensión para puntuar (factible por programa / necesita persona o juez), y queda claro qué dimensiones verifican el estado final y cuáles ponen puntos de control intermedios, con su razonamiento

<!-- answer -->

Respuesta de referencia:

Primero, desarma la palabra «confiable». Mezcla al menos tres cosas distintas: si el formato de la cita es correcto, si aquello a lo que apunta la cita existe, y si la cita de verdad respalda esa afirmación. Sin desarmarla, no puedes fijar umbrales por separado.

**Dimensión 1: tasa de resolubilidad de las citas**

- Métrica: proporción de citas de las notas que pueden ubicar una fuente específica (marca de tiempo del audio, ancla de párrafo del documento compartido, ID del mensaje de chat)
- Cómo se mide: por programa. Parsear cada cita según el formato acordado y consultar el sistema de origen de cada una para comprobar su existencia
- Umbral: 100%
- Justificación: esta dimensión no depende del juicio del modelo, solo de restricciones de formato y comprobaciones de existencia. Que falle el parseo significa hacer que el agente lo reescriba, y que reescriba hasta que pase. Solo esta clase de comprobación puramente mecánica puede exigir el puntaje perfecto

**Dimensión 2: calidad del respaldo de las citas**

- Métrica: entre los pares «afirmación–cita» muestreados, proporción en la que el contenido de la cita de verdad respalda la afirmación
- Cómo se mide: necesita una persona o un juez LLM (contenido de la Lección 4). Primero haz que personas etiqueten un lote como línea base
- Umbral: por encima de 0.9, y las muestras que fallan no pueden incluir errores duros del tipo «la cita existe pero el contenido no tiene ninguna relación con la afirmación»
- Justificación: no exijas 100% porque el «cuenta como respaldo» tiene por sí mismo límites difusos; dos personas etiquetando el mismo lote no van a coincidir del todo. El umbral debería anclarse cerca de la tasa de consistencia humana en la misma tarea: el requisito oficial de «alcanzable» es basar los objetivos en referencias existentes, experimentos previos o conocimiento experto, y no fijarlo arbitrariamente en 1.0[^S5]

**Dimensión 3: completitud de la cobertura**

- Métrica: cada reunión de esta semana tiene una sección correspondiente en las notas; las decisiones tomadas y los pendientes asignados en cada reunión están todos listados
- Cómo se mide: si las reuniones están completas se puede verificar por programa (si hay N reuniones en el calendario, debería haber N secciones en las notas); si se pasaron por alto decisiones y pendientes necesita muestreo humano o un juez
- Umbral: cobertura de reuniones 100%; recall de decisiones y pendientes por encima de 0.85
- Justificación: perderse una reunión entera es un error duro y comprobable de manera mecánica, no debería tolerarse. Perderse un pendiente está limitado por el material de origen: un «yo le hago seguimiento a esto» mencionado al pasar en el audio, puede que no todas las personas que escuchan lo capten; fijar 1.0 es cavarte tu propio pozo

**Dimensión 4 (opcional): cumplimiento del formato**

- Métrica: la salida se ajusta a la plantilla acordada (título, asistentes, decisiones, pendientes, bloques de citas: las cinco partes completas)
- Cómo se mide: por programa, con expresiones regulares o validación de esquema
- Umbral: 100%
- Justificación: puro formato, el mismo razonamiento que la dimensión 1; si no cumple, se reescribe

**Cuáles verifican el estado final y cuáles ponen puntos de control**

- Resolubilidad de las citas, cumplimiento del formato, cobertura de reuniones: verifican el estado final. Las tres son comprobaciones mecánicas que se calculan una vez tras la ejecución; comprobarlas a mitad de camino no aporta nada extra
- Calidad del respaldo de las citas: pon un punto de control intermedio. Esta dimensión es la más cara (necesita persona o juez) y también la más propensa a la desviación sistemática. En la posición «notas de la primera reunión escritas», revisa unas cuantas por muestreo; si el método de citación está fundamentalmente mal, todas las reuniones siguientes van a estar igual de mal; cuanto antes te detengas, más ahorras
- Recall de decisiones y pendientes: verifica el estado final, pero registra en las métricas «qué reuniones tuvieron más omisiones», para distinguir un problema del modelo de que el audio de esas reuniones sea de por sí poco claro

**Por qué lo multidimensional no es negociable**: se socavan entre sí. Si solo miras la resolubilidad de las citas, el agente escribe menos citas y saca el puntaje perfecto; si solo miras la completitud de la cobertura, copia el audio palabra por palabra y pasa. Amárralas juntas y queda menos espacio para los atajos: de entrada, la mayoría de los casos de uso necesitan una evaluación multidimensional a lo largo de varios criterios de éxito[^S5].

<!-- hint -->

Pista 1: primero desarma «confiable» en varias cosas que no se superpongan. Un solo adjetivo a menudo esconde debajo tres o cuatro comprobaciones distintas; sin desarmarlo, el umbral que escribas solo puede ser un número vago.

<!-- hint -->

Pista 2: antes de fijar umbrales pregunta «qué tan bien puede hacer esto una persona». Si las personas no llegan a 100%, entonces 100% no es la meta, es una excusa: garantiza que esta dimensión nunca va a pasar y que pronto vas a empezar a ignorarla. Al revés, en las validaciones mecánicas de puro formato o de pura existencia —si no cumple, haz que lo reescriba—, ahí fijar 100% sí es razonable.

<!-- /exercises -->

## Resumen

- La evaluación tradicional supone «dada la entrada X, sigue el camino Y, obtén la salida Z»; los agentes no cumplen ese supuesto: puntos de partida idénticos pueden aun así tomar caminos completamente distintos pero válidos, uno buscando en tres fuentes y otro en diez[^S2]
- No siempre sabes cuáles son los pasos correctos, así que por lo general no puedes comprobar si los agentes siguieron los pasos que prescribiste; usa métodos de evaluación flexibles que juzguen si alcanzaron los resultados correctos siguiendo un proceso razonable[^S2]
- El enfoque por defecto es la evaluación del estado final y no el análisis turno por turno: no juzgues si siguió un proceso específico, juzga si alcanzó el estado final correcto[^S2]. El estado final son sustantivos y no verbos, y tiene que proteger las dos cosas: que «los cambios esperados ocurrieron» y que «los cambios inesperados no»
- Para los flujos de trabajo complejos, divide la evaluación en puntos de control discretos que confirmen que «deberían haber ocurrido cambios de estado específicos», no intentes validar cada paso intermedio[^S2]. El «punto de control» de aquí se refiere a verificar el estado, distinto del punto de control de guardado de contexto del curso 9
- Los criterios de éxito deben ser medibles (métricas cuantitativas o escalas cualitativas bien definidas) y alcanzables (basar los objetivos en referencias de la industria, experimentos previos o conocimiento experto), y la mayoría de los casos de uso necesitan una evaluación multidimensional[^S5]
- La documentación oficial lista «tener criterios de éxito claros, habilitar bucles de retroalimentación» entre las condiciones donde los agentes aportan más valor[^S1]; léelo al revés: las tareas para las que no puedes escribir criterios de éxito no deberían entregarse por completo a los agentes para que las ejecuten solos; te va a tocar mirar todo el tiempo
- Las aserciones de trayectoria son un agregado opcional: puedes especificar qué herramientas esperas que llame, para medir si capta el propósito de las herramientas, pero como los caminos válidos no son uno solo, evita la sobreespecificación y el sobreajuste a estrategias[^S3]
- Más allá de la tasa de aprobación, registra también el tiempo de ejecución, la cantidad de llamadas, el consumo de tokens y los errores de herramientas; con muchas llamadas redundantes considera ajustar los parámetros de paginación y de límite de tokens, y con muchos errores de parámetros inválidos considera hacer más claras las descripciones y los ejemplos de las herramientas[^S3]

[>> Lección 3: Verificadores deterministas: solo cuentan las comprobaciones que dan aprobado/fallido](./03-deterministic-checks.md)
