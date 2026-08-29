# Lección 4: Trazado: hilvanar una ejecución en un árbol

> Objetivos de aprendizaje:
> - Usar IDs de correlación para reunir registros dispersos en «todo lo que disparó un prompt», y explicar cómo se reparten el trabajo con el ID de sesión
> - Leer la jerarquía de spans y trazas: span raíz, solicitudes al modelo, llamadas a herramientas, las dos fases de una herramienta (espera de permiso frente a ejecución) y cómo los subagentes se anidan bajo el span de herramienta del agente padre
> - Cuando el panel esté vacío, sospechar del pipeline antes que del agente: saber por qué la exportación puede fallar en silencio, qué condiciones hacen que la exportación por lotes pierda datos y cómo verificar la instrumentación misma
>
> Requisitos: Lecciones 1–3 (por qué el no determinismo rompe la reproducción, por qué los registros crudos son la evidencia primaria, cómo instrumentar un arnés con logs estructurados y métricas) | [<< Lección 3](./03-logs-and-metrics.md) | [Lección 5 >>](./05-hooks-and-debugging.md)

## 400 registros: ¿cuáles 12 son esa ejecución?

Al terminar la lección anterior, tu arnés escribía registros estructurados en `runs.jsonl`: uno por solicitud al modelo, uno por llamada a herramienta, con duración, tokens y errores. Los logs pasaron de «un gran bloque de texto» a «un objeto JSON por línea». Quedaste satisfecho.

Entonces un usuario reporta un problema: «Ayer por la tarde le pedí que corrigiera unos textos en la página de login y también modificó un archivo de pruebas. Yo no pedí eso».

Abres los logs, filtras por fecha con grep y 400 registros te devuelven la mirada. Doscientas llamadas a herramientas, cien solicitudes al modelo y decenas de registros de subagentes mezclados. El prompt del que habla el usuario corresponde probablemente a una docena de ellos. ¿Cuál docena?

Tienes dos pistas, ninguna suficiente:

- **ID de sesión**. En la lección anterior sí escribiste `session_id` en cada registro, pero ayer por la tarde el usuario tuvo siete u ocho intercambios en la misma sesión. Filtras por sesión y 400 se convierte en 210. Rango más chico, misma naturaleza.
- **Marca de tiempo**. Puedes adivinar una ventana temporal y cortar ahí, pero los subagentes se ejecutaron en paralelo y sus registros se intercalan con los del bucle principal en la línea de tiempo; y «la tarde» del usuario podía ser las 2 o las 4, no se acuerda.

El problema no es que a los registros les falte detalle: es que **los registros no tienen relaciones entre sí**. La lección 3 convirtió cada paso en datos, pero esos datos son un montón de filas paralelas. Cuál fila causó cuál, quién es hijo de quién: ni una palabra al respecto. Cientos de objetos JSON bien formateados y sigue siendo un montón de arena, solo que esta vez la arena es más cuadrada.

Esta lección agrega esa capa que falta.

## ID de correlación: la etiqueta con el nombre de un prompt

El paso más simple: darle un ID a «un evento disparador» y hacer que cada evento nacido de ese disparador copie ese ID. Eso es un ID de correlación. No necesita infraestructura de ningún tipo: es apenas un campo.

El diseño de primera mano de Claude Code hace exactamente esto. Después de que un usuario envía un prompt, Claude Code puede hacer varias llamadas a la API y ejecutar varias herramientas; el atributo `prompt.id` te permite vincular todos esos eventos con el único prompt que los disparó[^S4]. La receta de depuración que dan los docs es igual de directa: para trazar toda la actividad disparada por un solo prompt, filtra tus eventos por un valor concreto de `prompt.id`[^S4].

Este y el ID de sesión son dos granularidades distintas, cada una con su tarea:

| ID de correlación | Cobertura | Qué pregunta responde |
| --- | --- | --- |
| session id | Una conversación completa | ¿Cuánto costó esta sesión en total? ¿Cambió de modo de permisos? |
| prompt id | Un prompt dentro de una sesión | ¿Qué solicitudes al modelo y qué llamadas a herramientas disparó realmente la frase de la que se queja el usuario? |

Volvamos a los 400 registros del inicio: si cada registro llevara `prompt_id`, bastaría con buscar en la transcripción de la sesión el id que corresponde a «corregir unos textos en la página de login», filtrar una vez, y 400 baja a 12. Por primera vez la arena tiene un borde.

Pero un borde no es una estructura. Esos 12 registros siguen siendo 12 filas planas. Todavía no sabes si la edición errónea del archivo de pruebas vino directamente del bucle principal o de un subagente que despachó; no sabes si esa herramienta de 40 segundos pasó 40 segundos esperando a que hicieras clic en «aprobar».

## Spans y trazas: ordenar los eventos en un árbol

Primero traduzcamos algunos términos a lenguaje llano, porque los vamos a usar de aquí en adelante:

- **span**: el registro de «un trabajo con un principio y un final». Tiene un nombre (como `llm_request`), una hora de inicio, una hora de fin y varios atributos colgando de él (nombre del modelo, nombre de la herramienta, cantidad de tokens). Un span puede identificar a su span padre.
- **traza**: todo un árbol de spans conectados por relaciones padre-hijo. Todo lo que ocurrió durante una solicitud completa, de principio a fin, leído como árbol.
- **exportador**: el código dentro del proceso encargado de empaquetar los spans y mandarlos afuera.
- **colector**: la estación de relevo o servicio backend que recibe esos spans. El exportador le manda los datos; tú ves el árbol en su panel.

El trazado distribuido de Claude Code exporta spans que vinculan cada prompt del usuario con las solicitudes a la API y las ejecuciones de herramientas que dispara, de modo que puedes ver una solicitud completa como una sola traza en tu backend de trazado[^S4]. La jerarquía concreta es esta: cada prompt del usuario abre un span raíz `claude_code.interaction`; las llamadas a la API, las llamadas a herramientas y las ejecuciones de hooks se registran como hijos suyos; los spans de herramienta tienen a su vez dos spans hijos: uno para el tiempo que se pasó esperando una decisión de permiso y otro para la ejecución en sí[^S4].

Vale la pena detenerse en esos dos spans hijos bajo una herramienta. En la lección anterior registraste `duration_ms`: una herramienta se ejecutó durante 40 segundos. Pero «40 segundos donde 38 fueron esperando a que alguien hiciera clic en aprobar» y «40 segundos donde 38 fueron ejecutando el comando» son dos problemas completamente distintos. El primero significa arreglar la configuración de permisos o cambiar el patrón de interacción; el segundo significa arreglar la implementación de la herramienta. Los mismos 40 segundos, partidos en dos segmentos, te dan dos arreglos distintos. Eso es lo que la estructura de árbol te da por encima de los campos planos.

El Agent SDK lo dice más directo: las trazas son la vista más detallada que puedes obtener de una ejecución de agente; con `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` activado, cada paso del bucle del agente se convierte en un span que puedes inspeccionar en tu backend de trazado[^S6]. La CLI trae instrumentación de OpenTelemetry incorporada: registra spans alrededor de cada solicitud al modelo y cada ejecución de herramienta, emite métricas para los contadores de tokens y costo, y emite eventos de log estructurados para prompts y resultados de herramientas[^S6].

Compara eso con el arnés que escribiste en el curso 7 de esta serie («Fundamentos del arnés de agentes: bucles y control»): tu bucle ya tiene posiciones claras —«enviar solicitud / recibir `tool_use` / ejecutar herramienta / devolver `tool_result`»— y cada posición mapea naturalmente a un span. No te faltan posiciones, te faltan relaciones padre-hijo.

## Propagación entre fronteras: subagentes, tu aplicación, subprocesos de Bash

Un árbol se ve lindo, pero una ejecución real cruza varias fronteras de proceso. ¿Puede el árbol seguir conectado después de cruzarlas? Sí, pasando «quién es mi padre» hacia abajo todo el camino.

**Una capa hacia abajo: los subagentes.** Cuando el agente lanza un subagente a través de la herramienta Agent, los spans `llm_request` y `tool` del subagente se anidan bajo el span `claude_code.tool` del agente padre, de modo que toda la cadena de delegación aparece como una sola traza[^S6]. Esto resuelve una pregunta que sin el árbol no tiene respuesta: ¿de quién son los tokens del subagente? Están anidados bajo esa llamada a herramienta, que está anidada bajo ese prompt, así que pertenecen a ese prompt. No hace falta ningún pegado adicional.

**Una capa hacia arriba: tu aplicación.** El SDK propaga automáticamente el contexto de traza W3C hacia el subproceso de la CLI. El contexto de traza W3C es apenas una cadena estandarizada que contiene el id de traza y el id del span actual: quien la reciba sabe dónde engancharse. Cuando llamas a `query()` mientras hay un span de OpenTelemetry activo en tu aplicación, el SDK inyecta `TRACEPARENT` y `TRACESTATE` en el entorno del proceso hijo, la CLI los lee y su span `claude_code.interaction` pasa a ser hijo de tu span: la ejecución del agente aparece dentro de la traza de tu aplicación en lugar de como una raíz desconectada[^S6].

Esta diferencia es muy práctica cuando investigas incidentes en producción: el usuario se queja de «hice clic en ese botón y la página se quedó girando 20 segundos». Entras a la traza de esa solicitud HTTP y puedes seguirla hasta la llamada a herramienta dentro del agente que tardó 14 segundos, sin cambiar de sistema ni alinear marcas de tiempo.

**Más abajo todavía: los comandos que el propio agente ejecuta.** Cuando el trazado está activo, los subprocesos de Bash y PowerShell heredan automáticamente una variable de entorno `TRACEPARENT` que contiene el contexto de traza W3C del span de ejecución de herramienta activo[^S4]. Si un comando lanzado a través de la herramienta Bash emite sus propios spans de OpenTelemetry, esos spans se anidan bajo el span `claude_code.tool.execution` que envuelve al comando[^S6].

Conecta los tres segmentos y un árbol puede arrancar en tu solicitud web, pasar por la CLI, pasar por un subagente y crecer hasta una etapa de compilación dentro del `npm run build` que ejecutó el agente.

## Solo estructura, nunca contenido

Quizá te estés preguntando: si cada paso que da el agente se manda a un backend externo, ¿eso incluye lo que el usuario le dijo y el contenido de los archivos que leyó y escribió?

El análisis retrospectivo de Anthropic sobre su sistema de investigación multiagente deja dos conclusiones paralelas. Una es la ganancia: después de poner en marcha el trazado completo, pudieron diagnosticar por qué fallaban los agentes y arreglar los problemas de forma sistemática[^S1]. La otra es el límite: monitorearon patrones de decisión y estructuras de interacción de los agentes sin monitorear el contenido de las conversaciones individuales, para preservar la privacidad de los usuarios; incluso esa observabilidad de alto nivel les ayudó a diagnosticar causas raíz, descubrir comportamientos inesperados y corregir fallos comunes[^S1].

La postura por defecto de las herramientas de primera mano coincide exactamente con ese principio. La telemetría es estructural por defecto: duraciones, nombres de modelo y nombres de herramientas se registran en cada span; los conteos de tokens se registran cuando la solicitud subyacente a la API devuelve datos de uso, así que los spans de solicitudes fallidas o abortadas pueden omitirlos; el contenido que tu agente lee y escribe no se registra por defecto[^S6]. El contenido de los prompts del usuario tampoco se recolecta por defecto: solo se registra la longitud del prompt; para incluir el contenido hay que activar explícitamente `OTEL_LOG_USER_PROMPTS=1`[^S4]. La página del Agent SDK pone el mismo recordatorio junto a sus propios interruptores de recolección de contenido: deja estos sin definir a menos que tu pipeline de observabilidad esté aprobado para almacenar los datos que maneja tu agente[^S6].

Para muchos equipos esto es una buena noticia: no necesitas ganar una batalla de cumplimiento normativo sobre «¿podemos mandar contenido de usuarios a un backend de terceros?» antes de empezar a ver qué hace tu agente. Muchos problemas son visibles en la capa de estructura.

Cuando diseñes trazas para tu propio arnés, toma esto como valor por defecto: registra en los spans nombres, duraciones, nombres de herramientas, conteos de tokens y tipos de error; deja el contenido de parámetros y valores de retorno en los registros crudos locales (los de la lección 2) y recupéralos por id cuando los necesites.

## El propio pipeline de observabilidad puede mentirte

Todo lo anterior trató sobre «qué puedes ver una vez que el árbol está construido». Esta sección trata sobre algo que ocurre antes y con lo que es más fácil quemarse: **crees que estás mirando datos, pero en realidad estás mirando un panel vacío**.

Lo primero que hay que recordar: **el fallo de exportación es silencioso por defecto**. Si el endpoint es inalcanzable o el backend rechaza los datos, el agente sigue ejecutándose con normalidad y la CLI descarta la telemetría sin que aparezca ningún error en tu aplicación[^S6]. Este diseño es correcto —el pipeline de observabilidad no debería tumbar el flujo principal—, pero el costo es que un pipeline roto y todo-funcionando se ven idénticos desde tu lado.

Lo segundo: **la exportación por lotes pierde datos bajo condiciones concretas**. La CLI agrupa la telemetría en lotes y exporta a intervalos. En una salida limpia del proceso intenta hacer flush de los datos pendientes, pero ese flush está acotado por un timeout corto, así que todavía se pueden perder spans si el colector responde lento; y si tu proceso es matado antes de que la CLI termine su apagado, todo lo que quede en el búfer del lote se pierde[^S6]. Por defecto, las métricas se exportan cada 60 segundos y las trazas y los logs cada 5 segundos[^S6]. Junta esas frases: una ejecución de agente corta en CI que termina en tres a cinco segundos depende de que «el flush se complete dentro del timeout Y el proceso no sea matado antes» para conservar la telemetría de la cola, y el intervalo de exportación amplifica la cantidad que queda sentada en el búfer. Escenarios así necesitan intervalos de exportación bastante más cortos que la duración de la ejecución, y hay que asegurarse de que el proceso salga limpio.

Lo tercero, y lo que habría que hacer primero al investigar: **verificar la instrumentación misma** (instrumentación es solo otra palabra para las sondas que instalaste). Para verificar una configuración que exporta métricas, busca en tu backend la métrica `claude_code.session.count`, que Claude Code emite cuando arranca una sesión[^S4]; si no llega nada, ejecuta `claude --debug` y revisa el log de depuración en busca de errores de exportación de OTel[^S4]. El valor de estos dos pasos es que parten «¿tiene un problema el agente?» y «¿está funcionando el pipeline?» en dos preguntas que se responden por separado.

Dos trampas de configuración más en las que es fácil pisar:

- Por defecto, la CLI reporta `service.name` como `claude-code`. Si ejecutas varios agentes, o ejecutas el SDK junto a otros servicios que exportan al mismo colector, sobrescribe el nombre del servicio y agrega atributos de recurso para poder filtrar por agente en tu backend[^S6]. Si no, los spans de tres agentes se mezclan bajo el mismo nombre de servicio y estás mirando una sopa.
- Cuando ejecutes a través del SDK, no pongas `console` como valor de exportador[^S6]. Los docs no dicen por qué; por cómo se comunican el SDK y la CLI, el SDK le habla a la CLI por stdout, e imprimir spans ahí revolvería ese canal.

```agentmentor-check
{
  "id": "obs-zh-04-silent-telemetry",
  "label": "Una semana, cero datos: ¿no pasa nada o no hay nada conectado?",
  "prompt": "Conectaste la exportación de OpenTelemetry para el agente de tu equipo, commiteaste la configuración, la desplegaste y pasó una semana. Abres el panel: ni un solo punto de datos. Ni spans, ni métricas, ni eventos. El agente estuvo atendiendo usuarios toda la semana; nadie se quejó. ¿Cómo habría que juzgar la situación?",
  "whyHere": "Esta sección acaba de explicar que el fallo de exportación es silencioso por defecto. Cero datos es la señal que peor interpretan quienes recién empiezan, y esta es la aplicación más directa del conocimiento de mecanismos de esta lección: primero distinguir «el agente está bien» de «el pipeline no está conectado», y recién entonces decidir qué revisar.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Tu colega tiene razón. «Sin noticias, buenas noticias»: cero datos significa que las ejecuciones de esta semana salieron todas limpias. Espera a que alguien reporte un problema y ahí revisa el panel.",
      "correct": false,
      "feedback": "Hay una suposición escondida acá: que la telemetría solo se produce cuando algo sale mal. Pero en realidad las ejecuciones normales emiten spans y métricas continuamente; el arranque de una sesión genera registros de inmediato. Una semana de cero datos significa que faltan hasta las trazas «normales», y eso en sí mismo es anormal."
    },
    {
      "id": "b",
      "text": "Si la telemetría se rompiera, la aplicación daría error; como la app no falló en toda la semana, el problema está probablemente en las expresiones de consulta del panel o en su configuración. Ponte a ajustar los paneles.",
      "correct": false,
      "feedback": "La primera mitad está al revés. Cuando el endpoint es inalcanzable o el backend rechaza los datos, el agente sigue ejecutándose con normalidad, la CLI descarta la telemetría y no aparece ningún error en tu aplicación. Las consultas y los paneles sí podrían estar mal configurados, pero ese es el segundo sospechoso, después del pipeline."
    },
    {
      "id": "c",
      "text": "Sospechar primero del pipeline: el fallo de exportación es silencioso por defecto; el agente se ejecuta con normalidad y la telemetría simplemente se descarta. Busca session.count en el backend; si no está, ejecuta --debug para ver los errores de exportación.",
      "correct": true,
      "feedback": "Correcto. La métrica de conteo que se emite al arrancar la sesión es la sonda más barata para verificar la instrumentación misma: si la puedes consultar, la ruta de datos está viva y entonces sí toca sospechar de consultas y paneles; si no la puedes consultar, usa el log de depuración para hacer aflorar el error de exportación."
    }
  ]
}
```

## Tres señales, puedes activar solo las que necesitas

No hace falta encender el paquete completo de entrada. La CLI exporta tres señales independientes de OpenTelemetry —métricas, eventos de log y trazas—, cada una con su propio interruptor de activación y su propio exportador, así que puedes encender solo las que necesites[^S6].

Esto da una secuencia natural de adopción:

1. **Enciende primero las métricas**. El costo y el uso de tokens son las primeras preguntas que hace la gente, las métricas son lo más barato, y el intervalo de exportación por defecto de 60 segundos está bien para servicios de larga duración.
2. **Después enciende los eventos de log**. Resultados de herramientas y decisiones de permisos: estos eventos estructurados son la materia prima de los patrones de lectura diagnóstica de la lección 3.
3. **Enciende las trazas cuando te topes con un problema que no puedas explicar**. Son lo más caro y lo más detallado: las necesitas cuando de verdad tienes que «ver la forma de una ejecución».

El destino de exportación es cualquier backend que acepte el OpenTelemetry Protocol (OTLP); los docs nombran algunos: Honeycomb, Datadog, Grafana, Langfuse o un colector autoalojado[^S6]. Cuál elegir queda fuera del alcance de este curso; solo diré esto: que las tres señales sean independientes significa que puedes probar el agua con la pieza más chica primero, sin esperar a que la infraestructura completa esté lista.

## De paso: ese mismo lote de eventos también es un rastro de auditoría

Los eventos estructurados tienen otro uso más, ajeno a la depuración; basta con saber que existe.

Con la identidad del usuario final adjunta, los eventos `tool_decision`, `tool_result`, `mcp_server_connection` y `permission_mode_changed`, que se exportan como registros de log nombrados con el prefijo `claude_code.`, se convierten en un rastro de auditoría por usuario que puedes reenviar a una plataforma de Security Information and Event Management (SIEM)[^S6]. Cada evento lleva atributos de identidad que vinculan llamadas a herramientas, actividad de MCP y decisiones de permisos con el usuario que las disparó[^S4].

El mismo lote de datos, leído de otra manera, es la materia prima de otro trabajo: al depurar cortas horizontalmente por `prompt.id`, al auditar cortas verticalmente por usuario. Los temas de seguridad no se amplían en este curso.

## Respuestas que este curso no te va a dar

Algunas cosas necesitan límites claros para que no salgas a buscar recetas hechas en otro lado:

- **Tasas de muestreo y ventanas de retención**: almacenar trazas a volumen completo se pone caro, y cuánto muestrear y cuánto tiempo conservarlo son preguntas reales, pero no hay guía en el material primario, así que este curso no va a inventar números. Cuando tu volumen de datos se vuelva un problema de verdad, eso es entre tú y la factura de tu backend.
- **Umbrales de alerta**: lo mismo, no se dan números.
- **Hooks**: cómo instalar sondas en puntos de control del ciclo de vida, a qué puede acceder cada uno de `PreToolUse` y `PostToolUse`: eso es la lección 5. Dejemos plantada acá una interfaz: la entrada del hook lleva el UUID del prompt de usuario que se está procesando, y es el mismo valor que el atributo `prompt.id` en los eventos de telemetría, así que la salida del hook y la telemetría del mismo prompt se pueden correlacionar[^S5]. El ID de correlación que establece esta lección queda directamente utilizable en la siguiente.
- **Tu propio arnés no necesita OTel completo**. Esta lección usa el diseño de primera mano como herramienta didáctica porque expone toda la estructura que debería estar ahí. Pero lo que en realidad quieres es solo el árbol: la lección 6 va a generar un `trace_id` por ejecución, agregar `span_id` y un campo puntero al padre en cada registro, y después escribir una docena de líneas de código para imprimirlo indentado; obtendrás un árbol construido con el mismo mecanismo padre-hijo (la lección 6 explicará que eligió un padre distinto para las herramientas), sin colector, sin backend, sin dependencias. Si algún día necesitas conectar OTLP, los campos ya están ahí.

## 💻 Ejercicios

<!-- exercises -->

### Nivel 1: Dibujar 14 registros planos como árbol

Abajo hay 14 registros de span de una ejecución de agente, un objeto JSON por línea. Están escritos **en orden de hora de fin** (un span no conoce su duración hasta que termina), así que los hijos suelen aparecer antes que sus padres.

Para que el problema sea corto, plegué el registro hijo de «espera de permiso» de cada herramienta en un campo `wait_ms` sobre el registro de la herramienta y dejé solo el registro hijo de ejecución; `end_ms` son milisegundos relativos al inicio de esta ejecución.

```json
{"span_id":"a1b2c3d4e5f60002","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"llm_request","prompt_id":"p-9c41","end_ms":1180,"dur_ms":1140,"model":"sonnet","tokens_in":3120,"tokens_out":186}
{"span_id":"a1b2c3d4e5f60004","parent_span_id":"a1b2c3d4e5f60003","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool.execution","prompt_id":"p-9c41","end_ms":1455,"dur_ms":215}
{"span_id":"a1b2c3d4e5f60003","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool","prompt_id":"p-9c41","end_ms":1460,"dur_ms":260,"tool":"Read","wait_ms":40}
{"span_id":"a1b2c3d4e5f60005","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"llm_request","prompt_id":"p-9c41","end_ms":3050,"dur_ms":1570,"model":"sonnet","tokens_in":4980,"tokens_out":312}
{"span_id":"9f8e7d6c5b4a0001","traceparent":"00-4bf92f3577b34da6a3ce929d0e0e4736-a1b2c3d4e5f60007-01","name":"build.compile","service":"repo-build-script","end_ms":5100,"dur_ms":1500}
{"span_id":"a1b2c3d4e5f60007","parent_span_id":"a1b2c3d4e5f60006","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool.execution","prompt_id":"p-9c41","end_ms":5210,"dur_ms":1810}
{"span_id":"a1b2c3d4e5f60006","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool","prompt_id":"p-9c41","end_ms":5220,"dur_ms":2140,"tool":"Bash","wait_ms":320}
{"span_id":"a1b2c3d4e5f6000d","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"hook","prompt_id":"p-9c41","end_ms":5310,"dur_ms":70,"hook_event":"PostToolUse"}
{"span_id":"a1b2c3d4e5f6000a","parent_span_id":"a1b2c3d4e5f60009","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"llm_request","prompt_id":"p-9c41","end_ms":6900,"dur_ms":1500,"model":"sonnet","tokens_in":11240,"tokens_out":840}
{"span_id":"a1b2c3d4e5f6000c","parent_span_id":"a1b2c3d4e5f6000b","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool.execution","prompt_id":"p-9c41","end_ms":7470,"dur_ms":520}
{"span_id":"a1b2c3d4e5f6000b","parent_span_id":"a1b2c3d4e5f60009","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool","prompt_id":"p-9c41","end_ms":7480,"dur_ms":528,"tool":"Grep","wait_ms":0}
{"span_id":"a1b2c3d4e5f60009","parent_span_id":"a1b2c3d4e5f60008","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool.execution","prompt_id":"p-9c41","end_ms":8355,"dur_ms":3015}
{"span_id":"a1b2c3d4e5f60008","parent_span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"tool","prompt_id":"p-9c41","end_ms":8360,"dur_ms":3030,"tool":"Agent","wait_ms":10,"agent":"code-searcher"}
{"span_id":"a1b2c3d4e5f60001","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","name":"interaction","prompt_id":"p-9c41","end_ms":8420,"dur_ms":8420}
```

Sin escribir código, usa papel y lápiz o un editor de texto para completar:

1. Reconstruye estos 14 registros como un árbol de trazas indentado. Los hermanos del mismo nivel deben ordenarse de arriba a abajo por **hora de inicio** (hora de inicio = `end_ms - dur_ms`). Cada línea debe mostrar nombre y duración; marca el nombre de la herramienta en las herramientas.
2. Responde: en esta ejecución, ¿a qué prompt se le cargan los tokens consumidos por el subagente? ¿Por qué? Calcula el total de tokens de ese prompt.
3. Responde: ¿qué **único** registro puede probar que `build.compile` fue disparado por la **segunda** llamada a herramienta? Indica qué campo y qué porción de su valor.

<!-- rubric -->

Lista de autoevaluación:

- [ ] La raíz del árbol es el único registro que no tiene ni `parent_span_id` ni `traceparent`, o sea que no identifica ningún padre (`interaction`, 8420ms); ojo que `build.compile` tampoco tiene `parent_span_id`, pero usa `traceparent` para identificar un padre, así que no es la raíz
- [ ] La raíz tiene exactamente 6 hijos directos: dos `llm_request`, tres `tool`, un `hook`, ordenados por hora de inicio como llm → Read → llm → Bash → hook → Agent
- [ ] Cada una de las tres llamadas a herramienta tiene un hijo `tool.execution` en la posición correcta
- [ ] `build.compile` cuelga del `tool.execution` de Bash (`...60007`), no del span `tool` de Bash ni de la raíz
- [ ] Los tres registros del subagente (`llm_request`, `tool` Grep, el `tool.execution` de Grep) están anidados dentro del subárbol del `tool.execution` de la herramienta Agent (`...60009`), no colocados como hijos de la raíz
- [ ] La pregunta 2 responde «se le cargan al prompt `p-9c41`» y da como razón que los spans del subagente se anidan bajo el span de herramienta del agente padre, y que toda la cadena de delegación es una sola traza
- [ ] El total de tokens es correcto: entrada 19340, salida 1338, y se nota que la ejecución del subagente representa más de la mitad de la entrada
- [ ] La pregunta 3 nombra el registro `build.compile` y explica que la base es que el segmento de id de span padre de su `traceparent` es igual al id del span de ejecución de Bash
- [ ] No se coloca por error el registro `hook` como hijo de alguna herramienta (es hijo directo de la raíz)

<!-- answer -->

**1. Árbol reconstruido**

```text
interaction  p-9c41  8420ms                                   a1b2c3d4e5f60001
├─ llm_request  1140ms  in 3120 / out 186                     a1b2c3d4e5f60002
├─ tool Read  260ms (wait 40ms)                               a1b2c3d4e5f60003
│  └─ tool.execution  215ms                                   a1b2c3d4e5f60004
├─ llm_request  1570ms  in 4980 / out 312                     a1b2c3d4e5f60005
├─ tool Bash  2140ms (wait 320ms)                             a1b2c3d4e5f60006
│  └─ tool.execution  1810ms                                  a1b2c3d4e5f60007
│     └─ build.compile  1500ms (emitido por el script)       9f8e7d6c5b4a0001
├─ hook PostToolUse  70ms                                     a1b2c3d4e5f6000d
└─ tool Agent(code-searcher)  3030ms (wait 10ms)              a1b2c3d4e5f60008
   └─ tool.execution  3015ms                                  a1b2c3d4e5f60009
      ├─ llm_request  1500ms  in 11240 / out 840              a1b2c3d4e5f6000a
      └─ tool Grep  528ms                                     a1b2c3d4e5f6000b
         └─ tool.execution  520ms                             a1b2c3d4e5f6000c
```

Método de reconstrucción: primero saca los registros sin padre; encontrarás **dos** registros a los que les falta `parent_span_id`: `interaction` y `build.compile`. De esos dos, `build.compile` usa `traceparent` para identificar un padre (esta es justamente la puerta de entrada a la pregunta 3), así que la raíz verdadera es el `interaction` que queda. El resto reconoce a sus padres por `parent_span_id`. El archivo está escrito en orden de hora de fin, así que leyendo de arriba abajo verás aparecer primero a los hijos: es normal y no afecta la reconstrucción. El orden dentro de un mismo nivel usa la hora de inicio: `llm_request` empieza en 40, Read en 1200, el segundo `llm_request` en 1480, Bash en 3080, hook en 5240, Agent en 5330.

**2. A qué prompt se le cargan los tokens del subagente**

Se le cargan al prompt `p-9c41`. Después de que el subagente se lanza a través de la herramienta Agent, sus spans `llm_request` y `tool` se anidan bajo el span de herramienta del agente padre, y toda la cadena de delegación es una sola traza[^S6]: la solicitud al modelo del subagente es hija de «ejecución de la herramienta Agent», que es nieta de este prompt. Ni un solo registro se escapa fuera del árbol.

Total de tokens de este prompt:

- Entrada 3120 + 4980 + 11240 = **19340**
- Salida 186 + 312 + 840 = **1338**

La única ejecución del subagente representa por sí sola 11240 de la entrada, alrededor del 58%. Si hicieras el recuento «contando solo las solicitudes al modelo emitidas por el bucle principal», el costo de este prompt quedaría subreportado en más de la mitad; este tipo de omisión es la norma en sistemas multiagente, porque la porción delegada suele ser el grueso.

**3. El registro que prueba que `build.compile` pertenece a la segunda llamada a herramienta**

Es el propio registro `build.compile` (su `span_id` es `9f8e7d6c5b4a0001`). Se ve distinto de los demás registros: sin `prompt_id`, sin `parent_span_id`, porque lo emitió el script de compilación en **otro proceso** que no tiene idea de qué es un prompt. Lo que sí tiene es un `traceparent`:

```text
00-4bf92f3577b34da6a3ce929d0e0e4736-a1b2c3d4e5f60007-01
   └─ trace id ─────────────────────┘└ parent span id ┘
```

El tercer segmento `a1b2c3d4e5f60007` es el id de su span padre, y ese es exactamente el span hijo `tool.execution` de la herramienta Bash. Ordenadas por hora de inicio, las tres llamadas a herramientas son Read (1200), Bash (3080), Agent (5330): Bash es la segunda. Así que el span de este comando pertenece a la segunda llamada a herramienta, apoyándose en el contexto de traza y no en marcas de tiempo ni en conjeturas.

Así se ve también la propagación entre procesos en la práctica: la CLI pone el contexto de traza del span de ejecución de herramienta activo en la variable de entorno `TRACEPARENT` del subproceso[^S4], y los spans que emite el subproceso se anidan automáticamente bajo esa ejecución de herramienta[^S6].

<!-- hint -->

Haz primero solo el paso mecánico: copia los 14 registros en dos columnas (`span_id`, `parent_span_id`) y encontrarás **dos** filas sin padre; no copiaste mal, una de ellas esconde la puerta de entrada a la pregunta 3. El resto es un juego de «encuentra a tu padre». No dejes que el orden del archivo te confunda: los registros están escritos en orden de hora de fin, así que es normal que los hijos aparezcan antes que los padres.

<!-- hint -->

Los campos de un registro se ven distintos de los demás: no tiene `prompt_id`, pero sí tiene un `traceparent`. Parte esa cadena en cuatro segmentos por `-` y el tercer segmento es el id de su span padre. Toma ese id, búscalo en el campo `span_id` de los demás registros y la pregunta 3 queda lista.

### Nivel 2: Tres paneles vacíos, da una ruta de investigación para cada uno

Sin código. Los tres escenarios de abajo tienen todos la apariencia de «el panel se ve mal», pero por debajo son tres mecanismos distintos. Para cada uno, escribe: **causa más probable**, **en qué orden lo verificarías** y **cómo manejarlo una vez que la verificación pasa**. Cada juicio debe apuntar de vuelta a un mecanismo concreto cubierto en esta lección; no atribuyas todo a «la configuración estaba mal».

- **Escenario A**: conectaste la exportación de telemetría, la desplegaste, pasó una semana y el panel no tiene ningún dato. Ni spans, ni métricas, ni eventos. El agente estuvo atendiendo usuarios con normalidad toda la semana; nadie se quejó.
- **Escenario B**: el panel de métricas está completamente normal: los conteos de tokens suben, las curvas de costo se mueven, los conteos de sesiones cuadran. Pero abres el backend de trazado, buscas por el rango de tiempo de hoy y no hay ni una sola traza.
- **Escenario C**: un script corto que se ejecuta en CI: cada vez que termina, a la traza «le falta la cola»: el span raíz está, los primeros pasos están, los últimos dos o tres spans de herramienta no están. La misma configuración en una máquina local de desarrollo con ejecuciones largas muestra todo bien.

<!-- rubric -->

Lista de autoevaluación:

- [ ] A los tres escenarios se les asignan tres mecanismos **distintos**; no se colapsan todos en la misma causa
- [ ] El escenario A captura «el fallo de exportación es silencioso por defecto»: el agente se ejecuta con normalidad, la telemetría se descarta, la aplicación no da error, así que cero datos no se puede leer como «no hay problemas»
- [ ] El paso 1 de verificación del escenario A es buscar en el backend esa métrica de conteo de arranque de sesión, y el paso 2 es encender el modo de depuración para ver los errores de exportación
- [ ] El escenario B captura «las tres señales tienen cada una su propio interruptor y su propio exportador», señalando explícitamente que si funcionan las métricas eso no significa que funcionen las trazas
- [ ] El escenario B menciona que el interruptor de telemetría mejorada para las trazas necesita confirmación aparte
- [ ] El escenario C captura «exportación por lotes + proceso de vida corta»: el flush tiene un techo de timeout, y si matan el proceso el búfer se pierde entero
- [ ] El escenario C cita los intervalos de exportación por defecto (trazas y logs, 5 segundos) y lo relaciona con el tiempo de vida del script
- [ ] El manejo del escenario C incluye «acortar el intervalo de exportación» o «asegurar que el proceso salga limpio, que CI no lo mate antes», no agrandar el tamaño del lote
- [ ] En al menos un lugar se considera la posibilidad de «los datos sí llegaron pero están mezclados bajo el mismo `service.name` y no se encuentran», o sea de «estar mirando en el lugar equivocado», y se la ubica después del pipeline y no antes
  
<!-- answer -->

**Escenario A: una semana, cero datos**

Causa más probable: el pipeline nunca se conectó. El fallo de exportación es silencioso por defecto: cuando el endpoint es inalcanzable o el backend rechaza los datos, el agente sigue ejecutándose con normalidad y la CLI descarta la telemetría sin que aparezca ningún error en tu aplicación[^S6]. Así que «una semana sin datos» y «una semana sin problemas» se ven idénticos desde tu lado; no lo puedes usar para inferir la salud del agente.

Secuencia de verificación:

1. Busca en el backend la métrica `claude_code.session.count`, que Claude Code emite cuando arranca una sesión[^S4]. Si la puedes consultar, la ruta de datos está viva y el problema está en la capa de consultas o de paneles; si no, sigue al paso siguiente.
2. Ejecuta `claude --debug` y busca errores de exportación de OTel en el log de depuración[^S4]. Endpoint equivocado, certificado malo, rechazo del backend: todo va a aparecer ahí.
3. Si ambos pasos se ven normales y aun así no ves nada, entonces sospecha de «estar mirando en el lugar equivocado»: por defecto la CLI reporta `service.name` como `claude-code`, y si varios agentes u otros servicios exportan al mismo colector, tus datos pueden estar mezclados bajo el nombre de servicio de otro; sobrescribe el nombre del servicio y agrega atributos de recurso, y podrás filtrar por agente[^S6].

Manejo: después de arreglarlo, no esperes a «la próxima vez que algo se rompa» para confirmarlo; ejecuta una sesión de inmediato y mira si esa métrica de conteo aparece en el backend. Usa una acción que garantice producir datos para verificar la ruta; es más confiable que esperar un error incierto.

**Escenario B: hay métricas, no hay trazas**

Causa más probable: la señal de trazas no está encendida, o su propio exportador no está configurado. La CLI exporta tres señales independientes, cada una con su propio interruptor de activación y su propio exportador, así que puedes encender solo las que necesites[^S6]; dándolo vuelta, que las métricas funcionen no implica que las trazas también funcionen: son dos configuraciones separadas.

Secuencia de verificación:

1. Revisa por separado el interruptor de activación y el endpoint del exportador de la ruta de trazas; no reutilices la conclusión de que «las métricas sí salen».
2. Confirma si `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` está puesto: que cada paso del bucle del agente se vuelva un span inspeccionable ocurre cuando este interruptor está encendido[^S6]. Sin el interruptor verás una vista de trazas flaca o directamente vacía.
3. Si ambos interruptores están encendidos, entonces ejecuta `--debug` y mira si el exportador de trazas tiene errores propios en el log de depuración[^S4]. El exportador de métricas y el de trazas pueden apuntar a endpoints distintos; que uno esté mal configurado mientras el otro funciona normal es una situación muy común.

Manejo: después de completar el interruptor y el endpoint de las trazas, ejecuta una sesión con llamadas a herramientas, ve al backend de trazado y encuentra ese árbol por id de traza o por rango de tiempo; confirma que el span raíz y los hijos estén todos presentes.

**Escenario C: a la traza del script corto le falta la cola**

Causa más probable: la exportación por lotes chocó con un proceso de vida corta. La CLI agrupa la telemetría en lotes y exporta a intervalos; en una salida limpia intenta hacer flush de los datos pendientes, pero ese flush está acotado por un timeout corto, así que todavía se pueden perder spans si el colector responde lento; y si el proceso es matado antes de que la CLI termine su apagado, todo lo que quede en el búfer del lote se pierde[^S6]. Por defecto las trazas y los logs se exportan cada 5 segundos[^S6]: un script de CI que termina en pocos segundos se juega toda su telemetría de cola al flush de salida, y si el flush se corta por timeout (o CI simplemente mata el proceso), se perdió; cuanto más largo el intervalo de exportación, más se acumula en el búfer esperando el flush. Esto también explica por qué las ejecuciones largas locales no muestran problemas: cuando corres el tiempo suficiente, cada lote tiene su oportunidad de salir en el intervalo regular.

Secuencia de verificación:

1. Para una ejecución a la que «le falta la cola», revisa si los spans perdidos son los **últimos en el tiempo**. Si la pérdida está distribuida al azar por todo el árbol, no es este mecanismo: hay que volver atrás y sospechar de otra cosa.
2. Reduce el intervalo de exportación a bastante menos que la duración total del script, vuelve a ejecutar y mira si la cola regresa.
3. Revisa si CI está esperando a que el proceso salga por sí solo. Si la tarea usa un kill por timeout, o el contenedor se recicla apenas sale el proceso principal, la CLI no tiene oportunidad de hacer ese flush.
4. Prueba otra vez con un colector local de respuesta rápida para reproducirlo. Si al cambiarlo se arregla, eso significa que el backend lento se comió el timeout del flush.

Manejo: acorta el intervalo de exportación y asegúrate de que el script deje a la CLI salir limpiamente (no pongas en el paso de CI un timeout que justo corte el proceso de apagado). La dirección es «hacer que los datos se manden más seguido, dejar que el proceso viva lo suficiente», no agrandar el tamaño del lote: cuanto más grande el lote, peor la pérdida cuando el último lote se cae.

<!-- hint -->

Ponle una etiqueta a cada escenario antes de escribir: A es «falta todo», B es «falta un tipo», C es «falta un tramo». La **forma** de la pérdida difiere, o sea que el mecanismo difiere; en la sección «el pipeline puede mentirte» de esta lección hay tres formas, cada una con su explicación correspondiente.

<!-- hint -->

Pregúntate primero, para cada escenario: «¿este fenómeno se explica con 'la telemetría se descarta calladamente pero nadie da error'?». Si sí, ve a investigar en la dirección del pipeline; si no, entonces pregunta «¿falta todo, falta un tipo de señal, o falta el último tramito de tiempo?». La respuesta a la tercera pregunta te manda directo a «las señales son independientes» o a «exportación por lotes + timeout del flush».

<!-- /exercises -->

## Resumen

- Los logs estructurados resolvieron «¿son los registros lo bastante detallados?», pero no resolvieron «¿qué relación tienen entre sí los registros?». Los IDs de correlación son el primer paso para agregar relaciones: un prompt puede disparar varias llamadas a la API y varias herramientas, y `prompt.id` vincula todos esos eventos con el único prompt que los disparó; el movimiento inicial al depurar es filtrar por ese valor[^S4].
- Un span es el registro de un trabajo con un principio y un final; una traza es el árbol enhebrado por relaciones padre-hijo. El trazado distribuido vincula cada prompt del usuario con las solicitudes a la API y las ejecuciones de herramientas que dispara, como spans, de modo que la solicitud completa se lee como una sola traza en tu backend de trazado[^S4].
- La jerarquía es fija: cada prompt abre un span raíz `claude_code.interaction`, y las llamadas a la API, las llamadas a herramientas y las ejecuciones de hooks son sus hijos; los spans de herramienta tienen dos spans hijos que registran por separado el tiempo esperando el permiso y el tiempo ejecutando de verdad[^S4]. Con la telemetría mejorada encendida, cada paso del bucle del agente se vuelve un span inspeccionable; las trazas son la vista más detallada de una ejecución[^S6].
- Los árboles pueden seguir conectados a través de fronteras de proceso: los spans del subagente se anidan bajo el span de herramienta del agente padre y toda la cadena de delegación se lee como una sola traza; el SDK inyecta `TRACEPARENT` y `TRACESTATE` en el subproceso de la CLI, así que la ejecución del agente aparece dentro de la traza de tu aplicación en lugar de como una raíz desconectada[^S6]; bajando más, los subprocesos de Bash heredan `TRACEPARENT`[^S4], y los spans que emiten los comandos se anidan bajo el span de esa ejecución de herramienta[^S6].
- Poner en marcha el trazado completo habilita el diagnóstico sistemático de los fallos[^S1]; y monitorear solamente patrones de decisión y estructuras de interacción, sin mirar el contenido de las conversaciones, alcanza para diagnosticar causas raíz y descubrir comportamientos inesperados[^S1]. El mecanismo encaja exactamente: la telemetría es estructural por defecto —duraciones, nombres de modelo y nombres de herramientas se registran en cada span; el contenido no se registra por defecto[^S6]—; el contenido de los prompts también registra solo la longitud por defecto, y para incluir contenido hay que activar un interruptor explícitamente[^S4].
- Métricas, eventos de log y trazas son tres señales independientes, cada una con su propio interruptor de activación y su propio exportador, así que puedes encender solo las que necesites[^S6]: adopción incremental, sin necesidad de ir con todo de una vez.
- El propio pipeline de observabilidad puede mentirte: el fallo de exportación es silencioso por defecto, el agente se ejecuta con normalidad mientras la telemetría se descarta y no aparece ningún error[^S6]; la exportación por lotes intentará hacer flush en una salida limpia, pero está acotada por un timeout corto, y si matan el proceso el búfer se pierde entero[^S6]; por defecto las métricas cada 60 segundos y las trazas y los logs cada 5 segundos[^S6], así que las ejecuciones de vida corta necesitan intervalos más cortos. Lo primero al investigar es verificar la instrumentación misma: busca en el backend esa métrica de conteo de sesiones[^S4] y, si no está, enciende `--debug` para ver los errores de exportación[^S4].
- Dos trampas de configuración: varios agentes compartiendo un mismo backend necesitan sobrescribir `service.name` y agregar atributos de recurso para poder distinguirse[^S6]; cuando ejecutes a través del SDK, no pongas `console` como exportador[^S6].
- Ese mismo lote de eventos estructurados, leído de otra manera, es material de auditoría: con atributos de identidad adjuntos, las decisiones de herramientas, los resultados de herramientas, las conexiones MCP y los cambios de modo de permisos se vuelven un rastro de auditoría por usuario que puedes reenviar a un SIEM[^S6], y los atributos de identidad de cada evento vinculan las llamadas a herramientas con la persona que las disparó[^S4].
- No hay guía primaria sobre tasas de muestreo ni ventanas de retención, así que este curso no da números. Tu propio arnés tampoco necesita OTel completo: la lección 6 usa un `trace_id` más campos punteros al padre más impresión indentada para obtener un árbol construido con el mismo mecanismo padre-hijo.

[>> Lección 5: Sondas en las puertas: hooks y un flujo de depuración](./05-hooks-and-debugging.md)
