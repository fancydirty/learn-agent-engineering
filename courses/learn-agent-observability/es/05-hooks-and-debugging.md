# Lección 5: Sondas en las puertas: hooks y un flujo de depuración

> Objetivos de aprendizaje:
> - Explicar qué son los hooks: manejadores definidos por el usuario que se ejecutan automáticamente en puntos fijos del ciclo de vida del agente, organizados en tres cadencias (una vez por sesión / una vez por turno / por llamada a herramienta dentro del bucle), y poder elegir el evento correcto para una necesidad de observabilidad, escribir el matcher correcto e identificar qué campos del payload usar
> - Evitar dos trampas que muerden de verdad: los subprocesos de hook no heredan la configuración de exportación OTel del arnés, y los archivos de transcripción se escriben de forma asíncrona, así que pueden no contener los mensajes recientes cuando el hook se dispara
> - Aplicar un flujo de cinco pasos para localizar problemas bajo no determinismo: acotar por prompt id, encontrar la primera divergencia, reproducir con entradas idénticas, machacar repetidamente el mismo componente y recuperar desde el punto de fallo después de arreglarlo
>
> Requisitos: Lecciones 1–4 completadas (no determinismo y «no se puede saber por qué», registros crudos como evidencia primaria, logs estructurados y métricas, árboles de trazas y trampas del pipeline de telemetría) | Anterior: [<< Lección 4](./04-tracing.md) | Siguiente: [Lección 6 >>](./06-build-observability.md)

## Quieres registrar antes y después de cada ejecución de herramienta

La lección 3 te enseñó a escribir una entrada de log estructurada por cada llamada a herramienta en tu propio arnés. La lección 4 te enseñó a hilvanar esos registros en un árbol de trazas. Ese era tu bucle, tenías el código fuente, podías soltar una llamada a `log()` donde quisieras. Pero ahora estás ejecutando Claude Code en producción: no tienes su `runToolUses`. Lo que quieres no es complicado: registrar una vez antes de ejecutar la herramienta (con qué parámetros está a punto de ejecutarse) y una vez después (qué recibió de vuelta). Pero los puntos de inserción están en el proceso de otro.

El producto anticipó esto. La respuesta se llama hooks.

**Los hooks son comandos de shell, endpoints HTTP o prompts de LLM definidos por el usuario que se ejecutan automáticamente en puntos específicos del ciclo de vida de Claude Code**[^S5]. En lenguaje llano: declaras en la configuración «en tal momento, ejecútame este script», y cuando Claude Code llega a ese momento lo ejecuta. Y no llega con las manos vacías: cuando un evento se dispara y un matcher coincide, Claude Code le pasa a tu manejador contexto JSON sobre el evento[^S5].

En el curso 7 de esta serie escribiste una compuerta de aprobación en el bucle de tu arnés: cuando se topaba con una herramienta HIGH_IMPACT, se detenía y esperaba confirmación humana antes de ejecutar. Ese era un punto de intercepción hecho a mano. Los hooks hacen lo mismo, pero organizaron «qué posiciones del bucle vale la pena pausar» en una lista con nombres donde cada posición tiene un payload fijo y confiable. Para la observabilidad, el valor de esta lista no es que «puedas cambiar el comportamiento»: es que **puedes ver sin cambiar el comportamiento**.

## Tres cadencias: sesión, turno, llamada a herramienta

Los eventos se dividen en tres cadencias[^S5]:

- **Una vez por sesión**: `SessionStart` y `SessionEnd`
- **Una vez por turno**: `UserPromptSubmit`, `Stop` y `StopFailure` (por los nombres, `StopFailure` corresponde a la salida donde el turno no terminó con normalidad; la cita oficial solo dio la clasificación por cadencia, apóyate en tu página de referencia para la semántica precisa)
- **En cada llamada a herramienta dentro del bucle agéntico**: `PreToolUse` y `PostToolUse`

Alinea esto con la anatomía del bucle del curso 7 y las tres capas coinciden de inmediato:

```text
SessionStart                       ← empieza la sesión (arranca todo runAgent)
  UserPromptSubmit                 ← empieza el turno (el usuario envía el prompt)
    while (stop_reason === "tool_use") {
       ... solicitud al modelo ...
       PreToolUse                  ← dentro del cuerpo del bucle, parámetros generados, aún sin ejecutar
       ... ejecución de la herramienta ...
       PostToolUse                 ← dentro del cuerpo del bucle, la herramienta terminó de ejecutarse
    }
  Stop / StopFailure               ← termina el turno
SessionEnd                         ← termina la sesión
```

Elegir mal la cadencia te da números difíciles de explicar: si quieres contar «cuántas llamadas a herramientas usó una tarea» pero te enganchas a la puerta por turno, solo vas a obtener cero. Antes de elegir un evento, pregunta: ¿cuántas veces por sesión ocurre lo que estoy contando?

Un detalle que vale la pena señalar: `SessionStart` se dispara cuando abres una sesión nueva **y también cuando reanudas una existente**[^S5]. El curso 9 cubrió `--resume`: desde la perspectiva del bucle eso no es «empezar de cero», pero igual toca la campana de `SessionStart`. Si escribes «inicializar un log nuevo cuando arranca la sesión», la primera vez que uses resume vas a sobrescribir el tramo anterior.

## Detalles de las puertas útiles para la observabilidad

**`PreToolUse` se ejecuta después de que Claude crea los parámetros de la herramienta y antes de procesar la llamada**[^S5]. Este hueco importa: los parámetros están finalizados (puedes ver exactamente qué pretende usar el modelo) pero la herramienta todavía no se ejecutó. La lección 2 cubrió un caso real: el equipo descubrió que Claude añadía innecesariamente `2025` al parámetro query de la herramienta de búsqueda, sesgando los resultados[^S3]. La evidencia de este tipo de bug vive en los parámetros que `PreToolUse` puede ver.

**Los hooks `PostToolUse` se disparan después de que una herramienta ya se ejecutó con éxito. La entrada incluye tanto `tool_input`, los argumentos enviados a la herramienta, como `tool_response`, el resultado que devolvió**[^S5]. Un solo disparo te da un registro completo de la llamada; no tienes que armar tú mismo «qué solicitud va con qué respuesta». El principio que enfatizó la lección 2 —el ida y vuelta completo es la evidencia primaria[^S3]— te llega acá campo por campo. Ojo que su condición de disparo es «ya se ejecutó con éxito»[^S5]; si quieres cubrir los casos donde los parámetros se generaron pero la ejecución no tuvo éxito, hay que emparejarlo con `PreToolUse` y comparar ambos lados.

**Cómo escribir los matchers**: para ejecutar un hook después de que cualquier herramienta termine con éxito, omite el `matcher` o ponlo en `"*"`[^S5]. Los escenarios de observabilidad quieren exactamente ese comportamiento de un-hook-registra-todo: no sabes qué herramienta se va a romper, así que las registras todas.

**Cómo envían y reciben datos los manejadores**: los hooks de comando reciben datos JSON por stdin y comunican resultados a través de códigos de salida, stdout y stderr[^S5]. Así que un manejador mínimo de observabilidad es apenas «leer JSON de stdin, elegir unos campos para agregarlos a un archivo, salir con código 0»: no hay magia involucrada.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node ~/.claude/obs/record-tool-call.mjs" }
        ]
      }
    ]
  }
}
```

```javascript
#!/usr/bin/env node
// record-tool-call.mjs — manejador de PostToolUse
// Lee JSON de stdin, escribe una entrada JSON Lines, el código de salida 0 significa todo en orden
import { appendFileSync, mkdirSync } from "node:fs";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const evt = JSON.parse(raw);
  const line = {
    ts: new Date().toISOString(),
    session_id: evt.session_id,
    prompt_id: evt.prompt_id,
    tool: evt.tool_name,
    input: evt.tool_input,       // parámetros enviados a la herramienta
    response: evt.tool_response, // resultado devuelto por la herramienta
  };
  mkdirSync("/tmp/agent-obs", { recursive: true });
  appendFileSync("/tmp/agent-obs/tool-calls.jsonl", JSON.stringify(line) + "\n");
  process.exit(0);
});
```

Este es el log JSON Lines de la lección 3, salvo que quien escribe el log cambió de «tu arnés» a «un scriptcito que colgaste del bucle de otro». Consulta la página de referencia de tu versión para la estructura exacta de configuración y los nombres de campo.

**El payload incluye la duración, pero revisa la definición**: el payload lleva un campo opcional con el tiempo de ejecución de la herramienta en milisegundos, que **excluye el tiempo pasado en prompts de permiso y en hooks PreToolUse**[^S5]. La segunda mitad es la clave: el «cuánto esperé en este paso» que percibe el usuario incluye el tiempo que pasó haciendo clic en confirmar, pero este número se lo saca. Usarlo para responder «¿es lenta la herramienta?» es correcto; usarlo para responder «¿cuánto esperó el usuario?» va a quedar sistemáticamente bajo. La lección 4 mencionó lo mismo de otra manera: el span de herramienta tiene dos spans hijos debajo, uno para la espera de la decisión de permiso y otro para la ejecución en sí[^S4]. Se registran por separado precisamente porque esos dos tramos no deberían mezclarse.

**Los hooks también están en la traza**: cada prompt del usuario abre un span raíz `claude_code.interaction`. Las llamadas a la API, las llamadas a herramientas y las ejecuciones de hooks se registran como hijos suyos[^S4]. El mecanismo de observabilidad es él mismo un objeto observado.

## Dos advertencias que muerden

**Primera: los subprocesos de hook no heredan las variables de exportador OTEL_\*.** Hay un conjunto de variables que no se hereda: Claude Code elimina las variables de exportador `OTEL_*` de cada subproceso que lanza, incluidos los hooks[^S5].

Esta frase mata directamente una idea muy natural: «el arnés ya tiene configurados el endpoint, el protocolo y las cabeceras de autenticación. Importo un SDK de OTel en mi hook y las variables de entorno funcionan sin más». No van a funcionar. Cuando el proceso del manejador arranca, esas variables ya fueron eliminadas. Los datos o no se exportan o van a dar al endpoint por defecto y se desvanecen. No esperes que nadie grite para avisarte: la lección 4 cubrió que la exportación de la propia CLI falla en silencio[^S6], y por defecto el exportador que armes tú en el hook no va a ser más ruidoso; cuando no llega ningún dato al backend, ambos lados están callados.

Tienes dos caminos hacia adelante: o el hook lleva su propia configuración de exportación completa (escribe explícitamente el endpoint y la autenticación en el script, no dependas de la herencia), o directamente no emitas telemetría desde el hook y deja que escriba un log estructurado que alinearás con la telemetría en el backend usando IDs. El segundo camino tiene soporte oficial: el UUID que identifica el prompt de usuario que se está procesando en el payload del hook coincide con el atributo `prompt.id` de los eventos de OpenTelemetry, así que puedes correlacionar la salida del hook con la telemetría de un solo prompt[^S5]. Cada lado escribe lo suyo y al final unes por el mismo prompt id: el mismo truco del «hilvanar en un árbol usando IDs de correlación» de la lección 4, solo que esta vez entre dos fuentes de datos.

**Segunda: el archivo de transcripción se escribe de forma asíncrona.** El payload te da una ruta al JSON de la conversación, pero ese archivo se escribe de forma asíncrona y puede ir por detrás de la conversación en memoria, así que puede no incluir todavía los mensajes más recientes del turno actual cuando el hook se dispara[^S5].

La trampa es que no da error: simplemente te entrega datos viejos. Alguien podría pensar «los campos del payload no alcanzan, leo la transcripción directamente, ahí está todo» y terminar con registros a los que intermitentemente les falta la mitad del contenido. **Si quieres `tool_input` y `tool_response`, usa los campos del payload**: eso es lo que `PostToolUse` garantiza explícitamente proveer[^S5]. Las transcripciones sirven para mirar hacia atrás después, no para usarse como fuente de datos en tiempo real en el instante en que el hook se dispara.

Un recordatorio atado a tu máquina: los hooks de comando ejecutan comandos de shell con todos tus permisos de usuario. Pueden modificar, borrar o acceder a cualquier archivo al que tu cuenta de usuario pueda acceder. Revisa y prueba todos los comandos de hook antes de agregarlos a tu configuración[^S5].

```agentmentor-check
{
  "id": "obs-zh-05-hook-otel-shortcut",
  "label": "Reutilizar la configuración OTel del arnés dentro de un hook",
  "prompt": "Un colega te muestra su enfoque: en el manejador del hook PostToolUse, importa directamente el SDK de OTel y emite un span por cada llamada a herramienta. Su razonamiento es «el arnés ya configuró el endpoint OTLP y las cabeceras de autenticación como variables de entorno, el hook es un subproceso que lanza el arnés, así que el entorno se hereda naturalmente; no hace falta configuración extra». ¿Cómo le va a salir este enfoque?",
  "whyHere": "Acá se conectan los hilos de «los hooks son puntos de inserción» y «los pipelines de telemetría te mienten»: un enfoque que suena a prueba de balas queda explícitamente negado por la documentación de primera mano, y el fallo es silencioso.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No va a funcionar: Claude Code elimina las variables de exportador OTEL_* de cada subproceso que lanza, incluidos los hooks, así que la configuración no pasa. O el manejador lleva su propia configuración de exportación, o el hook solo escribe logs estructurados y alineas con la telemetría usando el prompt id.",
      "correct": true,
      "feedback": "Correcto. Esta es una conclusión negativa explícita en los docs, y el fallo suele ser silencioso: los datos no se exportan pero tampoco dan error, así que vas a creer que están esperando en el backend. Cada camino alternativo tiene su costo: llevar la configuración propia significa mantener una segunda configuración de autenticación; escribir logs y unir después exige un paso extra de correlación, pero el prompt id del payload del hook y el prompt.id de los eventos de telemetría son el mismo valor, así que la unión está garantizada."
    },
    {
      "id": "b",
      "text": "Va a funcionar, pero ojo con la duplicación: la misma llamada a herramienta queda registrada una vez por el span de herramienta incorporado de la CLI y otra por el span que emite el hook, y hay que deduplicar por nombre de herramienta en el backend.",
      "correct": false,
      "feedback": "El conteo duplicado sí es un problema común de instrumentación, pero acá no le toca el turno: el enfoque se muere un paso antes. Las variables de entorno no pasan al subproceso del hook, así que ese span nunca llega a exportarse. No hay colisión con el span incorporado."
    },
    {
      "id": "c",
      "text": "Va a funcionar, el único problema es el momento: PostToolUse se dispara después de que termina la ejecución de la herramienta, así que la hora de inicio del span solo se puede calcular hacia atrás, y la duración queda imprecisa.",
      "correct": false,
      "feedback": "La semántica de la duración sí importa: ese campo de milisegundos de ejecución del payload excluye el tiempo de espera de permiso y PreToolUse. Pero esa no es la causa de muerte de este enfoque. Su causa de muerte es que las variables del exportador se eliminan, así que los datos nunca salen."
    }
  ]
}
```

## Cuando los hooks no hacen su trabajo

Colgaste un hook y el archivo de log está vacío. ¿No se disparó? ¿El matcher no coincidió? ¿O el script mismo se cayó? En este punto el objeto que necesitas observar es el propio mecanismo de observabilidad. El principio de la lección 4 aplica otra vez acá: primero verifica la sonda.

**Los detalles de ejecución de los hooks —qué hooks coincidieron, sus códigos de salida y el stdout y stderr completos— se escriben en el archivo de log de depuración**[^S5]. Consíguelo de una de dos maneras: usa `claude --debug-file <path>` para escribirlo en una ubicación que tú indiques, o ejecuta `claude --debug` y después lee `~/.claude/debug/<session-id>.txt`[^S5]. Para detalles más granulares de coincidencia de hooks, pon `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` y verás líneas de log adicionales, como los conteos del matcher de hooks[^S5].

```text
Secuencia de investigación: el archivo de log está vacío
 └─ ¿El log de depuración tiene un registro de coincidencia para este hook?
      No   → el matcher está mal; confirma primero que se dispara omitiendo el matcher
      Sí   → ¿El código de salida es 0?
               No  → lee stderr, probablemente ruta del script, permisos o parseo de JSON
               Sí  → se ejecutó pero no escribió en el lugar correcto; revisa ruta de escritura y existencia del directorio
```

## Un flujo de depuración: cómo rastrear un problema bajo no determinismo

La primera mitad de la lección cubrió dónde colocar las sondas. La segunda cubre cómo usar de verdad esos datos para rastrear un problema real.

Empecemos por enunciar la dificultad con claridad. La lección 1 dijo: los agentes toman decisiones dinámicas y son no deterministas entre ejecuciones, incluso con prompts idénticos. Esto hace la depuración más difícil[^S1]. El paso uno de la depuración tradicional es «reproducir», y ese paso acá no se sostiene: lo vuelves a ejecutar y podría tomar un camino completamente distinto pero igual de válido.

Los cinco pasos de abajo son **una disposición propia de este curso**, no la metodología oficial de nadie; pero cada paso se apoya en una fuente.

### Paso uno: acotar

En los registros que acumulaste a lo largo de las lecciones 1–4, primero acota el alcance a «este único prompt problemático». La lección 4 te dio el método: **para trazar toda la actividad disparada por un solo prompt, filtra tus eventos por un valor concreto de `prompt.id`**[^S4].

La importancia de este paso no es técnica, es psicológica. «El agente se rompió» es una proposición que no puedes depurar; «uno de estos 11 eventos bajo este prompt id está mal» es una proposición que sí puedes depurar.

### Paso dos: encontrar la primera divergencia

Lee desde el principio hacia adelante y encuentra **el primer paso donde el comportamiento empieza a desviarse de lo esperado**. ¿Por qué insistir en «el primero»? Porque que falle un paso puede hacer que los agentes exploren trayectorias completamente distintas, con resultados impredecibles[^S1]. Los absurdos que ves al final (referenciar archivos inexistentes, dar error una y otra vez, tomar el camino largo) son en su mayoría ruido río abajo. Arreglas el evento #8 y probablemente solo estás limpiando lo que ensució el evento #4.

Juzgar la «desviación» tiene algunas formas útiles[^S3]: llamó a una herramienta que no debía llamar, llamó a la herramienta correcta con parámetros equivocados, llamó a la herramienta correcta demasiado pocas veces, o procesó mal la respuesta de la herramienta. La última es la más difícil de detectar porque la herramienta devolvió éxito, todo está verde en los logs; lo que está mal es la interpretación que hizo el agente de ese resultado exitoso.

### Paso tres: reproducir y observar

El enfoque oficial: para entender los efectos de los prompts, **construyeron simulaciones usando exactamente los prompts y las herramientas del sistema, y después miraron a los agentes trabajar paso a paso**; esto reveló de inmediato modos de fallo como agentes que seguían cuando ya tenían resultados suficientes, que usaban consultas de búsqueda demasiado verbosas o que seleccionaban herramientas incorrectas[^S1].

Vale la pena pensar en ese «reveló de inmediato». Estos mismos bugs son invisibles en las métricas agregadas (la tasa de éxito es bastante alta), requieren lectura línea por línea para notarse en los logs a posteriori, pero cuando lo miras ejecutarse paso a paso, el ojo humano detecta «ya tiene suficiente y sigue buscando» en segundos. Dos cosas hay que controlar durante la reproducción: la entrada debe ser idéntica (prompts y definiciones de herramientas sin cambios) y la observación debe ser paso a paso.

### Paso cuatro: machacar repetidamente el mismo componente

Si la sospecha recae sobre una herramienta concreta, ejecutarla unas pocas veces probablemente no muestre nada: el no determinismo hace que los bugs aparezcan y se desvanezcan.

El equipo construyó un agente de prueba de herramientas: le das una herramienta MCP defectuosa, intenta usarla y después reescribe la descripción de la herramienta para evitar los fallos. **Al probar la herramienta docenas de veces, ese agente encontró matices clave y bugs**[^S1].

«Docenas de veces» es el punto. Un bug que una ejecución puede esconder, docenas de ejecuciones lo van a forzar a salir: una forma de retorno rara ante entradas límite, una descripción ambigua, un mensaje de error que hace que el modelo lo juzgue mal como «solo hay que reintentar». Las lecturas diagnósticas de la lección 3 se conectan acá: muchas llamadas redundantes a herramientas podrían sugerir que habría que dimensionar mejor los parámetros de paginación o de límite de tokens; muchos errores de herramienta por parámetros inválidos podrían sugerir que a las herramientas les vendrían bien descripciones más claras o mejores ejemplos[^S3]. Una cosa que ahorra muchas idas y vueltas: cuando una llamada a herramienta lanza un error, puedes aplicar ingeniería de prompts a tus respuestas de error para comunicar con claridad mejoras específicas y accionables, en lugar de códigos de error opacos o trazas de pila[^S3].

### Paso cinco: recuperar desde el punto de fallo después de arreglar

Después de arreglarlo, no aprietes «empezar de nuevo» por reflejo. La línea oficial es directa: cuando ocurren errores, no podemos simplemente reiniciar desde el principio: los reinicios son caros y frustrantes para los usuarios. En cambio, construimos sistemas que pueden reanudar desde donde estaba el agente cuando ocurrieron los errores[^S1].

El curso 9 cubrió cómo construir mecanismos de recuperación. El escenario de esa lección era «cómo retomar tras la interrupción de una tarea». En depuración el uso es otro: las docenas de llamadas a herramientas anteriores al punto de fallo eran válidas, costaron dinero, dieron resultados correctos. Volver a ejecutarlas no te da nada más que tokens quemados, e introduce un montón de no determinismo nuevo, así que no puedes saber si «esta vez funcionó» es porque lo arreglaste bien o porque tuviste suerte.

## Sobre la «reproducción», una palabra honesta

Puede que hayas visto en otros lados un conjunto de técnicas para hacer reproducibles a los agentes: fijar la semilla aleatoria, poner la temperatura en 0, grabar los retornos reales de las herramientas y usarlos como stubs de reproducción.

Estas prácticas sí existen en ingeniería. Los laboratorios prácticos de los cursos 8 a 10 usan ese mismo enfoque de cliente stub: guardas el `tool_result` de una ejecución real, devuelves los mismos datos siempre después, y el lado de la herramienta se vuelve determinista. Sirve para verificar «¿la línea de código que cambié rompió la lógica de parseo?».

Pero hay dos cosas que decir. Primero, **estas técnicas no tienen respaldo de fuentes de primera mano**. Puse citas para cada paso del flujo de cinco pasos de arriba. Para este párrafo no doy ninguna, porque genuinamente no las hay. Si ves a alguien afirmar «la recomendación oficial es temperatura 0 para reproducir problemas de agentes», pídele el enlace.

Segundo, fijan menos de lo que parece. Poner stubs a los retornos de herramientas fija el entorno; el lado del modelo sigue siendo no determinista[^S1]. Así que convierte «dos variables moviéndose» en «una variable moviéndose»: eso es valioso, pero no es el tipo de reproducción de «la misma entrada debe dar la misma salida». No lo trates como una garantía, trátalo como reducción de ruido.

## Qué problemas ameritan este flujo

Recorrer los cinco pasos tiene un costo: acotar requiere leer logs, la reproducción requiere construir una simulación, machacar un componente significa docenas de ejecuciones. Un reparto tosco pero funcional:

- **Ruido de baja frecuencia e inofensivo**: como que una vez llamó a búsqueda una vez de más, pero el resultado igual estuvo bien. Regístralo, acumula. Cada instancia individual no amerita investigación; después de juntar una docena suele verse un patrón común, y ahí investigar una sola vez es mucho más eficiente.
- **Alto impacto**: dio una respuesta factualmente incorrecta, modificó un archivo que no debía tocar, se colgó sin devolver nada. No importa qué tan baja sea la frecuencia, abre un caso. Una sola ocurrencia ya es lo bastante cara.
- **Recurrente**: la misma forma de fallo aparece por tercera vez, lo que significa que no es suerte, es estructural. Abre un caso.

La frase de la lección 1 es el criterio de decisión acá: por ejemplo, los usuarios reportaban que los agentes "not finding obvious information" (no encontraban información obvia), pero nosotros no podíamos ver por qué. ¿Estaban usando malas consultas de búsqueda? ¿Eligiendo fuentes pobres? ¿Topándose con fallos de herramientas?[^S1] Cuando decides no investigar un problema, estás aceptando «no sé cuál de las causas es»; para ruido inofensivo está bien, para problemas de alto impacto estás apostando.

Esta lección estuvo sobre el papel hasta ahora. La lección 6 junta ambas mitades en la práctica: cablea una capa de observabilidad completa sobre el arnés del curso 7 y después toma un síntoma de «no puedo saber por qué» y persíguelo hasta el fondo.

## Resumen

- Los hooks son comandos, endpoints HTTP o prompts de LLM definidos por el usuario que se ejecutan automáticamente en puntos específicos del ciclo de vida de Claude Code; cuando un evento se dispara y un matcher coincide, Claude Code le pasa a tu manejador contexto JSON sobre el evento[^S5].
- Los eventos se dividen en tres cadencias: una vez por sesión (`SessionStart`/`SessionEnd`), una vez por turno (`UserPromptSubmit`/`Stop`/`StopFailure`), en cada llamada a herramienta dentro del bucle (`PreToolUse`/`PostToolUse`)[^S5]. Fija la cadencia antes de elegir el evento. `SessionStart` también se dispara al reanudar una sesión[^S5].
- `PreToolUse` se ejecuta después de que Claude crea los parámetros de la herramienta y antes de procesar la llamada; `PostToolUse` se dispara tras la ejecución exitosa de la herramienta, con la entrada llevando tanto `tool_input` como `tool_response`, lo que te da un registro completo de la llamada en un solo disparo[^S5]. Omite el matcher o ponlo en `"*"` para el un-hook-registra-todo[^S5].
- Los hooks de comando reciben JSON por stdin y responden a través de códigos de salida, stdout y stderr[^S5]; ese campo de milisegundos de ejecución excluye el tiempo pasado en prompts de permiso y en `PreToolUse`[^S5], así que no lo uses como tiempo de espera del usuario.
- Dos conclusiones negativas: Claude Code elimina las variables de exportador `OTEL_*` de cada subproceso que lanza (incluidos los hooks)[^S5], así que si quieres emitir telemetría desde un hook tienes que llevar tu propia configuración de exportación; el archivo de transcripción que se provee en el payload se escribe de forma asíncrona y puede no incluir todavía los mensajes más recientes del turno actual cuando el hook se dispara[^S5]. Los hooks de comando se ejecutan con todos tus permisos de usuario, así que revísalos antes de instalarlos[^S5].
- Cuando los hooks no funcionan, revisa en el log de depuración qué hooks coincidieron, los códigos de salida y el stdout/stderr completo usando `--debug-file`[^S5]; para los conteos del matcher pon el nivel de log en verbose[^S5]. El prompt id del payload del hook y el `prompt.id` de los eventos de telemetría son el mismo valor, así que las dos fuentes de datos se pueden alinear[^S5].
- Flujo de depuración de cinco pasos (disposición de este curso): filtrar eventos por `prompt.id` para acotar a este prompt[^S4] → encontrar la primera divergencia, porque que falle un paso cambia toda la trayectoria[^S1] → reproducir usando prompts y herramientas idénticas, mirando paso a paso[^S1] → machacar el componente sospechoso docenas de veces para forzar la salida del bug[^S1] → después de arreglar, recuperar desde el punto de fallo en lugar de reiniciar desde el principio[^S1].
- Técnicas como semilla fija, temperatura 0 y reproducción de retornos de herramientas grabados no tienen respaldo de fuentes de primera mano; este curso las presenta como práctica de ingeniería: fijan el lado del entorno, pero el modelo sigue siendo no determinista[^S1], así que son reducción de ruido, no garantías de reproducción.
- No todo problema amerita el flujo completo: registra el ruido inofensivo de baja frecuencia, acumula para ver patrones, investiga después; abre casos de inmediato para los problemas de alto impacto o recurrentes.

[>> Lección 6: Práctica: cablear una capa de observabilidad sobre el arnés](./06-build-observability.md)

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Emparejar tres necesidades de observabilidad con hooks

Tienes tres necesidades de observabilidad. Para cada una, escribe: **qué evento elegir**, **cómo escribir el matcher**, **qué campos del payload usar** y **qué trampa es específica de esta necesidad**. No hace falta código completo, alcanzan fragmentos de configuración y una o dos frases de explicación.

1. Registrar parámetros y resultados completos de cada llamada a herramienta, escritos como JSON Lines.
2. Medir el tiempo transcurrido de cada turno (desde que el usuario envía un prompt hasta que el turno termina).
3. Al reanudar una sesión, recordarle al usuario «la vez pasada dejaste una tarea sin terminar».

<!-- rubric -->

**Criterios de evaluación**

- La necesidad 1 elige `PostToolUse`, matcher omitido o `"*"`, campos usando `tool_input` y `tool_response` del payload; la trampa menciona «no leer el archivo de transcripción» y explica que la razón es la escritura asíncrona, que puede ir por detrás.
- La necesidad 1 gana puntos extra si además nota «`PostToolUse` solo se dispara tras la ejecución exitosa; para cubrir los casos de fallo, emparejar con `PreToolUse`».
- La necesidad 2 elige eventos emparejados de la cadencia por turno: `UserPromptSubmit` registra el inicio, `Stop` registra el fin, y considera `StopFailure` como la salida excepcional; la trampa menciona «no se pueden sumar los milisegundos de ejecución de los payloads de `PostToolUse` como tiempo del turno» y explica que ese número excluye la espera de permiso y el tiempo de `PreToolUse`.
- La necesidad 3 elige `SessionStart`; la trampa menciona «`SessionStart` se dispara tanto para sesiones nuevas como para sesiones reanudadas» y provee un método concreto para distinguir ambas.
- Las tres preguntas deben responder todas las partes (evento + campos + trampa) para contar como completas; las necesidades relacionadas con herramientas (la 1) requieren una parte más: el matcher. Nombrar solo el evento no cuenta.

<!-- answer -->

**Necesidad 1**

- Evento `PostToolUse`: se dispara después de que la herramienta se ejecuta con éxito, la entrada lleva tanto `tool_input` como `tool_response`, y un solo disparo te da un registro completo del ida y vuelta sin emparejar a mano.
- Matcher omitido o `"*"`: la observabilidad quiere el un-hook-registra-todo porque no sabes de antemano qué herramienta se va a romper.
- Campos: `tool_name`, `tool_input`, `tool_response`, más el identificador de sesión y el prompt id. Incluye el prompt id porque coincide con el `prompt.id` de los eventos de telemetría, así que después puedes unir.
- Trampa: **no leas la ruta del archivo de transcripción del payload buscando «conseguir un contexto más completo».** La transcripción se escribe de forma asíncrona y puede ir por detrás de la conversación en memoria, así que en el instante en que el hook se dispara puede no contener todavía los mensajes más recientes del turno actual. Vas a obtener registros intermitentemente incompletos, sin ninguna señal de error.
- Agregado: la precondición de `PostToolUse` es «ejecución exitosa». Si además te importa «parámetros generados pero no ejecutados», agrega un `PreToolUse` con comodín para registrar los parámetros y después compara ambos lados para cazar las llamadas que nunca llegaron a `PostToolUse`.

**Necesidad 2**

- Los eventos son un par, ambos en la cadencia «una vez por turno»: `UserPromptSubmit` escribe la marca de tiempo de inicio, `Stop` escribe la de fin y calcula la diferencia. A `StopFailure` habría que colgarle el mismo manejador; si no, los turnos terminados de forma anormal nunca reciben marca de fin y el registro de inicio queda colgado para siempre.
- Estos eventos no tienen alcance de herramienta, no hace falta comodín de herramienta.
- Campos: escribe el inicio en un archivo temporal indexado por prompt id, y el fin usa ese mismo prompt id para recuperarlo y calcular la diferencia. Usa el prompt id y no el identificador de sesión, porque una sesión tiene muchos turnos.
- Trampa: **no sumes el campo de milisegundos de ejecución de los payloads de `PostToolUse` como tiempo del turno.** La definición de ese campo es tiempo de ejecución de la herramienta, excluye explícitamente el tiempo pasado en prompts de permiso y en hooks `PreToolUse`, y el tiempo de las solicitudes al modelo directamente no está ahí. Calcular así va a quedar sistemáticamente bajo; cuanto más confirmación humana requiera el flujo, más grande la brecha.

**Necesidad 3**

- Eventos `SessionStart` (momento del recordatorio) más `SessionEnd` (momento de registrar el estado pendiente), ambos en la cadencia «una vez por sesión». Los campos usan el identificador de sesión para emparejar «quién dejó qué».
- Trampa: **`SessionStart` se dispara tanto al abrir una sesión nueva como al reanudar una existente.** Recuérdaselo sin condiciones y a cada sesión fresca le van a decir «tienes tareas sin terminar»; la gente va a dejar de leer rápido.
- Método de distinción (versión robusta, no atada a ningún nombre de campo concreto): haz que `SessionEnd` juzgue si al terminar quedó trabajo sin completar y, si es así, escriba un archivo de instantánea nombrado según el identificador de sesión; `SessionStart` hace una sola cosa: revisar si existe la instantánea correspondiente, recordar solo si la encuentra y borrarla después de leerla. Las sesiones frescas no encuentran instantánea y naturalmente no se disparan. Esto además resuelve otro problema: la información necesaria para juzgar «sin terminar» está más completa al final de la sesión.
- Trampa relacionada: un manejador escrito como «`SessionStart` inicializa un log fresco y vacío» va a borrar el tramo anterior la primera vez que se use resume.

<!-- hint -->

Pista: primero ubica cada necesidad en una cadencia. Pregúntate «¿cuántas veces por sesión ocurre esto?»: ¿una vez por llamada a herramienta? ¿una vez por turno? ¿una vez por sesión? Fijada la cadencia, el evento queda prácticamente fijado.

<!-- hint -->

Pista: las tres trampas están enterradas en tres detalles: la primera se relaciona con «cuándo se escribe el archivo de transcripción»; la segunda con «qué excluye ese campo de milisegundos»; la tercera con «en qué otro momento, además de una sesión nueva, se dispara ese evento». Las tres se enunciaron explícitamente en la primera mitad de esta lección.

### Nivel 2: Un expediente, recorrer los cinco pasos

**Síntoma**: el usuario reporta «el informe de resumen que me dio hace referencia a archivos que no existen en absoluto».

Filtras por el prompt id de este prompt y obtienes este resumen de eventos (el prompt original era «lee el directorio reports/, resume las conclusiones de los tres informes semanales de este trimestre»):

```text
prompt.id = 8f2c1a94-...   (Resumen de eventos disparados por un prompt de usuario, ordenados por tiempo;
                            input/response son tool_input/tool_response del payload del hook, abreviados para el formato;
                            tool_decision tiene una entrada por llamada, el resumen conserva solo #3 a modo de ilustración)

#1   user_prompt     prompt_length=27
#2   llm_request     dur=1840ms  stop_reason=tool_use
#3   tool_decision   tool=list_files   decision=allow (en la lista de permitidos, sin espera humana)
#4   tool_result     tool=list_files   input={"path":"reports/"}
                     response={"entries":[]}   success=true   dur=12ms
#5   llm_request     dur=2210ms  stop_reason=tool_use
#6   tool_result     tool=read_file    input={"path":"reports/2026-Q2-week03.md"}
                     success=false   error="ENOENT: no such file or directory"
#7   llm_request     dur=1990ms  stop_reason=tool_use
#8   tool_result     tool=read_file    input={"path":"reports/q2-summary.md"}
                     success=false   error="ENOENT: no such file or directory"
#9   llm_request     dur=2400ms  stop_reason=tool_use
#10  tool_result     tool=search_notes input={"query":"Q2 informes semanales conclusiones 2026"}
                     response={"hits":[3 notas viejas sin relación de este proyecto]}   success=true
#11  llm_request     dur=5100ms  stop_reason=end_turn
#12  final response  «Según reports/2026-Q2-week03.md y reports/q2-summary.md,
                     dos informes semanales, este trimestre...»
```

No hace falta escribir código. Responde cuatro preguntas siguiendo el flujo de cinco pasos:

1. **¿Cuál evento es la primera divergencia?** Señala el número concreto y explica por qué los anteriores no cuentan y los posteriores son río abajo.
2. **¿Cómo reproducir y observar?** Qué entrada usar, qué mirar.
3. **¿Qué machaca acá «machacar repetidamente el mismo componente»?** Especifica el objeto y el fenómeno a observar.
4. **¿Dónde recuperar después de arreglar?** Especifica el punto de recuperación y por qué no volver a ejecutar desde #1.

<!-- rubric -->

**Criterios de evaluación**

- La primera divergencia apunta a **#5** (después de que el agente recibe el directorio vacío igual genera una llamada a `read_file`), o apunta a «la decisión entre #4 y #5» y nota que la evidencia observable más temprana aterriza en el `tool_input` de #6. Apuntar solo a #6 o a #12 se juzga como «apuntó río abajo».
- Debe explicar que **#4 no cuenta como divergencia**: `list_files` devolvió `success=true`, 12ms, la herramienta en sí funcionó bien; lo que está mal es el procesamiento que hizo el agente del resultado vacío.
- Debe explicar que **#6/#8/#10 son río abajo**: que falle un paso cambia toda la trayectoria, y esos pasos están limpiando lo que ensució el error de juicio de #5.
- La respuesta sobre reproducción debe incluir dos restricciones: la entrada usa prompts y definiciones de herramientas idénticas; la observación es paso a paso, enfocada en la primera reacción del modelo tras recibir `entries` vacío.
- «Machacar repetidamente el mismo componente» debe apuntar a `list_files` (forma de retorno del resultado vacío y descripción de la herramienta), no decir vagamente «ejecutarlo unas veces más»; debe proveer dimensiones del machaque (distintas formas de ruta) y el fenómeno a observar (cómo interpreta el modelo el resultado vacío cada vez).
- El punto de recuperación responde **después de #4, antes de #5**, y da el razonamiento para no volver a ejecutar desde #1: los resultados de #1–#4 son correctos, volver a ejecutarlos solo quema tokens e introduce no determinismo nuevo, y no se puede saber si «esta vez funcionó» es porque lo arreglaste bien o porque tuviste suerte.
- Las cuatro preguntas deben estar respondidas para contar como completo. Una respuesta que contradiga la secuencia de eventos (por ejemplo, decir que `list_files` dio error) se juzga como reprobada.

<!-- answer -->

**1. Primera divergencia: #5.**

El `list_files` de #4 devolvió `{"entries": []}`, `success=true`, 12ms: en ese paso la herramienta hizo su trabajo, reportó honestamente «no hay entradas bajo esta ruta». Lo que empieza a desviarse es #5: después de que el agente recibe un directorio vacío, el comportamiento correcto es detenerse y decirle al usuario «no hay nada bajo reports/, confirma la ruta por favor», pero generó una llamada a `read_file` con el parámetro `reports/2026-Q2-week03.md`.

El lugar más temprano donde puedes ver esta divergencia en los registros es **el `tool_input` de #6**: esa ruta nunca apareció en ningún `tool_response` anterior. Este es un criterio que puedes verificar mecánicamente: si los nombres de archivo que aparecen en llamadas o informes posteriores se pueden rastrear hasta respuestas de herramientas anteriores; si no, salieron de la nada.

Por qué los anteriores no cuentan: #2 juzgar que había que listar el directorio, razonable; #3 es un permiso concedido, sin espera humana; #4 herramienta normal. Por qué los posteriores son río abajo: los dos ENOENT de #6 y #8, #9 cambiando a `search_notes`, #10 trayendo tres notas viejas sin relación, #12 escribiendo los nombres de archivo inventados en el informe: todo eso sigue empujando hacia adelante sobre la premisa equivocada de #5. Arreglar #6 (por ejemplo, hacer más amable el mensaje de ENOENT) no resuelve el problema, porque #5 no debería haber ocurrido en absoluto.

Qué categoría de divergencia: no es «llamó a la herramienta equivocada», tampoco «la herramienta dio error», sino que **procesó mal la respuesta de la herramienta**; este tipo es el más difícil de detectar monitoreando, porque el paso que se rompió está verde en los logs.

**2. Reproducir y observar.**

Construye una simulación usando prompts idénticos y definiciones de herramientas idénticas, mirándola trabajar paso a paso. Dos restricciones que no se pueden aflojar: la entrada copiada tal cual, no la suavices «para que quede más clara» o estarás observando un sistema distinto; la observación tiene que ser paso a paso, no se puede dejarlo ejecutarse hasta el final y revisar solo el informe final, porque la información del paso de la divergencia está toda en el medio.

Qué mirar: **la primera acción del modelo tras recibir `entries` vacío**. Fija la respuesta de #4 como `{"entries": []}`, devuélvesela y observa si se detiene y reporta el directorio vacío o si sigue inventando. Si el comportamiento varía entre varias reproducciones, es probabilístico y necesitas el paso cuatro para cuantificar la frecuencia. Este paso probablemente también haga aflorar otros problemas: el `2026` de la consulta de #10 coincide con el caso real de las fuentes oficiales (añadir innecesariamente el año a los términos de búsqueda, sesgando los resultados), y la consulta entera es demasiado verbosa.

**3. Machacar repetidamente `list_files`.**

El objeto machacado no es el agente entero, es el comportamiento de esta única herramienta en el límite de los resultados vacíos. Concretamente dos cosas:

- **Forma de retorno**: `{"entries": []}` lleva demasiado poca información para el modelo. El mismo vacío puede devolverse de forma más explícita, por ejemplo distinguiendo «la ruta existe pero no tiene entradas» de «la ruta no existe», para que el modelo sepa cuál de las dos reportar.
- **Descripción de la herramienta**: ¿explica qué significa un resultado vacío, qué hacer después de recibir un resultado vacío?

El método es usar esta herramienta docenas de veces repetidamente, cubriendo distintas formas de ruta: inexistente, existe-pero-vacía, con-contenido, permisos-insuficientes; ejecutar muchas veces para cada tipo, observar cómo interpreta el modelo el valor de retorno cada vez, qué porcentaje inventa nombres de archivo. El sentido de las docenas de veces está justo acá: ejecuta tres o cinco veces y el bug de «a veces inventa» podría no aparecer ni una vez. Así fue como se usó el agente oficial de prueba de herramientas.

Si el machaque muestra que el modelo tiende a probar otro nombre después de un ENOENT, entonces el mensaje de error de `read_file` también habría que cambiarlo junto: las respuestas de error se pueden escribir como prompts, diciéndole explícitamente «esta ruta no existe, lista primero el directorio para confirmar, no adivines nombres de archivo», más útil que lanzar un `ENOENT`.

**4. Recuperar después de #4.**

El punto de recuperación es **la posición donde el `tool_result` de #4 ya entró al contexto pero #5 todavía no ocurrió**. Cambia la forma de retorno y la descripción por las arregladas, da otro paso desde acá, y mira si esta vez se detiene y reporta el directorio vacío.

Dos razones para no volver a ejecutar desde #1. Una es el desperdicio: los resultados de #1–#4 son completamente correctos, volver a ejecutar solo lista el mismo directorio otra vez. La otra es más crítica: volver a ejecutar vuelve a meter el no determinismo. El modelo podría ni siquiera llamar a `list_files` esta vez, y entonces no puedes juzgar si «esta vez no inventó nombres de archivo» es porque lo arreglaste bien o porque le tocó caminar otro sendero. Recuperar después de #4 fija la variable al único paso que quieres verificar.

<!-- hint -->

Pista: lee este segmento de eventos hacia atrás y lo primero que verás son dos ENOENT, y es fácil detenerse ahí. Pero ENOENT significa «este archivo no existe»; la pregunta es: ¿de dónde salieron esos dos nombres de archivo? Busca hacia atrás en la secuencia de eventos su origen, y el lugar donde no puedas encontrar un origen es la divergencia.

<!-- hint -->

Pista: fíjate en el `success=true` de #4. La herramienta no falló, devolvió un resultado vacío correcto. Así que el tipo de divergencia de este expediente no es «la herramienta dio error», sino «el agente malinterpretó un resultado correcto»; piensa bien este punto y la tercera pregunta, sobre qué machacar, gana dirección: machaca lo que devuelve resultados vacíos, no lo que da error.

<!-- /exercises -->
