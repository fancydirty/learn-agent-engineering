# Lección 3: Cinco tipos comunes de herramientas: leer, escribir, ejecutar, buscar, llamar

> Objetivos de aprendizaje:
> - Clasificar las herramientas comunes en cinco categorías según el daño que pueden causar, y nombrar la firma típica de cada una
> - Explicar por qué las herramientas de ejecución de comandos están en una clase de riesgo distinta de las otras cuatro
> - Explicar por qué las herramientas de búsqueda devuelven fragmentos coincidentes en lugar de archivos enteros

Requisitos: terminaste la Lección 2, entiendes la forma de ida y vuelta de una llamada a herramienta | Anterior: [Lección 2 <<](./02-one-tool-call-round-trip.md) | Siguiente: [Lección 4 >>](./04-designing-tool-interfaces.md)

## Empecemos con una tabla

| Herramienta | Entrada típica | Qué devuelve | Peor caso cuando sale mal |
|---|---|---|---|
| Leer archivo | `path` | Contenido del archivo (cadena) | Lee un archivo que no debería, filtra información |
| Escribir archivo | `path`, `content` | Estado de éxito/fallo | Sobrescribe trabajo que alguien todavía no ha guardado |
| Ejecutar comando | `command` | stdout/stderr/código de salida | Borra una base de datos, envía peticiones, instala un paquete envenenado — irreversible |
| Buscar | `query`, `path` | Lista de ubicaciones de coincidencia + fragmentos | Devuelve tanto que revienta el contexto, o se pierde el resultado clave |
| Llamar a API externa | Parámetros estructurados (varían según el servicio) | Objeto JSON/de error | Gasta el dinero de alguien, envía el mensaje equivocado, obtiene datos obsoletos |

¿Qué ordena esta tabla? No el alfabeto. Es «qué amplitud de daño puede causar una sola llamada» — el **radio de impacto** de esa llamada. Una herramienta de solo lectura tiene un radio de impacto de aproximadamente cero: leer el archivo equivocado solo descarrila este turno de la conversación. Escribir un archivo puede sobrescribir contenido existente. Ejecutar un comando puede hacerle cualquier cosa a todo el sistema. A medida que recorramos cada categoría, verás que, más allá de «qué puede hacer», cada una arrastra una trampa en la que solo esa categoría tropieza.

## Leer: la más segura, pero no de riesgo cero

Una herramienta de lectura de archivos suele tener una firma como esta:

```json
{
  "name": "read_file",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Ruta absoluta del archivo" },
      "offset": { "type": "integer", "description": "Línea desde la que empezar a leer (opcional)" },
      "limit": { "type": "integer", "description": "Número máximo de líneas a leer (opcional)" }
    },
    "required": ["path"]
  }
}
```

El valor de retorno es el propio contenido del archivo, normalmente con números de línea para que el modelo pueda referenciarlas más adelante:

```
1  export function add(a, b) {
2    return a + b;
3  }
```

Leer un archivo no cambia ningún estado. Si el modelo lee lo que no debía, o lee de más, el peor resultado es algo de contenido irrelevante en este único turno — y el modelo tiende a darse cuenta de que leyó lo que no era y volver a leer. Por eso se la llama la categoría «más segura»: no porque no conlleve riesgo, sino porque el riesgo no puede escapar de los límites de esta conversación.

El riesgo real es **leer un archivo que nunca debería haber tocado**. Si el agente tiene permiso para leer `~/.ssh/id_rsa` o el `.env` del proyecto, un inocente «muéstrame qué hay en este directorio» puede levantar una clave secreta literalmente al contexto de la conversación. A partir de ahí, la filtración ya ocurrió en el momento en que ese contexto lo emite el modelo, se escribe en un log, o se lo lleva fuera alguna herramienta posterior de «llamar a API externa». Por eso las herramientas de lectura de archivos casi siempre van acompañadas de una lista de rutas permitidas o de un sandbox, en lugar de «es de solo lectura, dale las llaves sin más». La Lección 5 cubre en detalle cómo poner ese tipo de frontera.

## Escribir: donde las consecuencias dejan de ser simétricas

Una herramienta de escritura de archivos tiene un parámetro más que la de lectura, y un poco menos de seguridad:

```json
{
  "name": "write_file",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "content": { "type": "string" }
    },
    "required": ["path", "content"]
  }
}
```

El valor de retorno suele ser simple, solo un estado:

```json
{ "success": true, "bytesWritten": 842 }
```

El problema no es el valor de retorno, es la llamada en sí. Si una lectura sale mal, vuelves a leer y nada ha cambiado. Si una escritura sale mal — digamos que el modelo rellena mal el `path`, o al `content` le falta la mitad de lo que debería tener — el contenido original del archivo ya está sobrescrito y no se puede recuperar, a menos que haya control de versiones o una copia de seguridad. Esta es la «asimetría entre herramientas de lectura y herramientas de escritura»: las dos formas de llamada se ven casi idénticas (un `path` más un par de parámetros), pero una se puede reintentar libremente y la otra se juega todo en cada llamada.

Por eso una herramienta de escritura responsable añade una capa de protección — por ejemplo, exigir que el archivo se haya leído antes de poder editarlo (para impedir que el modelo edite de memoria), o devolver un diff del contenido antiguo frente al nuevo en lugar de un escueto «éxito», de modo que quien la llama (la aplicación host) tenga oportunidad de mostrar el cambio antes de que llegue realmente al disco. No son el foco aquí; la Lección 4 los abre al cubrir el diseño de interfaces.

## Ejecutar: una clase de riesgo propia

La herramienta de ejecución de comandos tiene la firma de aspecto más sencillo de las cinco:

```json
{
  "name": "bash",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": { "type": "string", "description": "El comando de shell a ejecutar" }
    },
    "required": ["command"]
  }
}
```

Entra una cadena; salen stdout, stderr y un código de salida:

```json
{
  "stdout": "3 files changed, 12 insertions(+)\n",
  "stderr": "",
  "exit_code": 0
}
```

Lo delicado es que este campo `command` es en esencia un punto de entrada abierto — no es una operación concreta y acotada por un esquema, como «borra este archivo» o «lee esta línea», es un script de shell arbitrario. `rm -rf`, un `curl` que manda datos a un servidor externo, un `npm install` que arrastra un paquete envenenado: todo eso cabe dentro de esa única cadena. Las otras cuatro categorías (leer, escribir, buscar, llamar a API), diseñes como diseñes sus firmas, están limitadas en lo que pueden hacer por su estructura de parámetros. El límite de capacidad de una herramienta de ejecución de comandos es el límite de capacidad de todo el sistema operativo. Por eso está en una clase propia: no «un poco más arriesgada», sino un orden de magnitud distinto de riesgo.

Precisamente por eso, la documentación oficial diseña aislamiento a nivel de sistema operativo específicamente para esta categoría: el acceso al sistema de archivos y el acceso a la red son dos capas de sandbox separadas, y aunque al modelo lo dirija una inyección de prompt y se empeñe en ejecutar un comando peligroso, la frontera del SO se sostiene igualmente — no depende de si el modelo «quiere» cooperar[^S16]. La motivación declarada es contundente: el objetivo es que incluso una inyección de prompt exitosa quede totalmente contenida y no pueda escapar del sandbox[^S17]. La Lección 5 cubre cómo configurar ese aislamiento; por ahora, quédate con una cosa: donde aparezca la firma de «ejecutar comando», trátala por defecto como la categoría de las cinco que más necesita restricciones adicionales.

```agentmentor-check
{
  "id": "tool-zh-03-blast-radius",
  "label": "Decidir qué categoría de herramienta tiene el mayor radio de impacto",
  "prompt": "Un agente está conectado con dos herramientas a la vez: read_file (lee cualquier archivo por ruta) y bash (ejecuta cualquier comando de shell, tomando una única cadena command). Si las dos herramientas están expuestas a la misma fuente de entrada no confiable (digamos, texto oculto en una página web), ¿qué herramienta tiene mayor potencial de daño, y por qué?",
  "whyHere": "Acabamos de cubrir las firmas y los riesgos de las categorías de lectura y ejecución, así que esto comprueba si el estudiante capta de verdad que el radio de impacto no se juzga por lo peligroso que suene el nombre de una herramienta, sino por si su entrada está acotada por un esquema",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Más o menos igual, porque leer el contenido de un archivo sensible ya cuenta como filtrar un secreto, y una filtración es tan dañina como cualquier cosa que pueda hacer bash",
      "correct": false,
      "feedback": "Una filtración es un riesgo real, pero su camino requiere un paso más — el contenido primero tiene que leerse y luego llevarse fuera por algún otro canal. El parámetro command de bash es en sí mismo un script ejecutable: un solo comando puede leer un archivo, hacer una petición de red y borrar datos a la vez, sin necesidad de una segunda herramienta. Los dos niveles de riesgo no están en el mismo orden de magnitud."
    },
    {
      "id": "b",
      "text": "bash es mayor, porque command es una cadena abierta, no acotada por ningún esquema, así que su alcance equivale al de todo el sistema operativo",
      "correct": true,
      "feedback": "Correcto. El parámetro path de read_file solo deja que el modelo elija qué archivo leer; lo que puede hacer queda fijado por la estructura de parámetros. El parámetro command de bash no tiene ese límite — es un script de shell arbitrario, y borrados, curl e instalaciones de paquetes caben todos dentro. Por eso las herramientas de ejecución de comandos suelen necesitar un sandbox a nivel de SO como respaldo, y no solo reglas de permisos[^S16]."
    }
  ]
}
```

## Buscar: devuelve ubicaciones, no el mundo entero

Una herramienta de búsqueda (digamos, una que encuentra una palabra clave o una regex en una base de código) suele llevar en su firma un parámetro de «limita cuánto vuelve»:

```json
{
  "name": "search_code",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": { "type": "string" },
      "path": { "type": "string", "description": "Restringe la búsqueda a un directorio (opcional)" },
      "max_results": { "type": "integer", "default": 20 }
    },
    "required": ["pattern"]
  }
}
```

El valor de retorno no son los archivos en sí, es «dónde está la coincidencia y qué aspecto tiene el contexto de alrededor»:

```json
{
  "matches": [
    { "file": "src/auth/login.ts", "line": 42, "snippet": "  if (!user.verified) {" },
    { "file": "src/auth/session.ts", "line": 17, "snippet": "export function verifyToken(token) {" }
  ],
  "total_matches": 2
}
```

Si esta herramienta se limitara a meter de vuelta el contenido completo de cada archivo coincidente, aparecen dos problemas. El primero es un problema de tokens: una búsqueda alcanza 50 archivos, cada uno de unos cientos de líneas, todo volcado al contexto — y esta única llamada a herramienta se ha comido el presupuesto de entrada de todo el turno, sin dejar nada con lo que el modelo pueda seguir trabajando[^S9]. Escribir descripciones de herramientas y controlar los límites de la entrada y la salida es en sí mismo un requisito básico para que una herramienta sea usable[^S8]. El segundo problema importa más: el sentido de buscar no es «leerse todo lo que pueda ser relevante», es «ayudar al modelo a averiguar dónde mirar después». Devuelve las ubicaciones de las coincidencias más un fragmento corto de contexto, el modelo lee esos fragmentos y juzga por sí mismo: «de estos resultados, el segundo parece lo que busco, déjame leer el contenido completo de ese archivo aparte». Así es como una herramienta de búsqueda y una de lectura trabajan juntas: buscar acota el rango, leer consigue el detalle. Devolver «ubicaciones de coincidencia» en vez de «archivos enteros» es exactamente la pista de seguimiento que el modelo necesita, en lugar de un volcado único de todo lo que podría servir.

## Llamar a una API externa: fallar es la norma, no la excepción

Las primeras cuatro categorías se quedan casi siempre dentro del sistema local. Llamar a una API externa es distinto — cruza la red, hacia un servicio que no controlas:

```json
{
  "name": "send_slack_message",
  "input_schema": {
    "type": "object",
    "properties": {
      "channel": { "type": "string" },
      "text": { "type": "string" }
    },
    "required": ["channel", "text"]
  }
}
```

Un retorno normal se ve así:

```json
{ "ok": true, "ts": "1735689600.000200" }
```

Pero un servicio externo te va a limitar la tasa, va a dejar peticiones sin respuesta hasta agotar el tiempo de espera, va a rechazar otras por permisos que faltan y va a cambiar su propia interfaz en el hueco entre tus llamadas. Estas no son «situaciones inesperadas», son las condiciones normales de funcionamiento de esta categoría. Lo que de verdad decide si la herramienta sirve no es «qué devuelve cuando todo va bien», es «qué devuelve cuando las cosas fallan»:

```json
{ "ok": false, "error": "rate_limited", "retry_after": 30 }
```

Este mensaje de error no es para ti, es para el modelo — que a continuación deba reintentar o cambiar de estrategia depende de si puede leer ese campo `error`. La especificación MCP escribe esto directamente en el protocolo: los clientes deberían proporcionar los errores de ejecución de herramientas a los modelos de lenguaje para que el modelo tenga oportunidad de autocorregirse y volver a intentarlo[^S11]. Dicho de otro modo, una herramienta que se traga en silencio un 429 y no devuelve más que «la llamada falló» le está robando al modelo la oportunidad de corregirse; una herramienta que trae de vuelta detalle concreto como `retry_after` es la que diseña el «fallo» como una parte normal del flujo de trabajo.

La categoría de llamar a API externa arrastra además otra capa de riesgo: si este agente puede leer datos privados al mismo tiempo que está expuesto a contenido no confiable (un fragmento de texto web que un usuario pegó, digamos) y además puede enviar mensajes o peticiones hacia fuera, esas tres cosas juntas son lo que la investigación en seguridad llama la «trifecta letal» — el atacante no necesita entrar en tu sistema, solo esconde una instrucción en contenido que el agente vaya a leer y deja que el propio agente saque los datos privados[^S19]. La Lección 5 abre este tema por su cuenta; por ahora, ten claro esto: llamar a una API externa es el último y más crítico eslabón de esa cadena, porque es la salida por la que los datos abandonan realmente tu sistema.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Elige el valor de retorno de una herramienta

A continuación hay tres borradores de resultados de llamadas a herramientas, cada uno con un problema. Di a qué categoría de herramienta pertenece el problema (leer/escribir/ejecutar/buscar/llamar a API), explica por qué el diseño encaja mal y da el cambio que harías.

1. `search_code` devuelve: `{ "content": "<el código fuente completo de 50 archivos concatenado, 8000 líneas en total>" }`
2. `write_file` devuelve: `{ "success": true }` (sin diff, sin información del contenido anterior)
3. `send_email` al fallar devuelve: `{ "error": "failed" }`

<!-- rubric -->
- Los tres problemas se corresponden con una trampa cubierta en esta lección (la búsqueda no ahorra tokens, la herramienta de escritura no da forma de revisar el cambio, el fallo de la llamada a la API no da detalle accionable)
- La corrección es concreta hasta el nivel de campo, no un vago «mejóralo»
- Sabes decir «por qué el modelo necesita esta información», no solo «esto es más correcto»

<!-- answer -->
1. Este es un problema de herramienta de búsqueda. Meter de vuelta de una sola vez el contenido completo de cada archivo coincidente fusiona «acotar el rango» y «leer el detalle» en un solo paso, y 8000 líneas van a reventar el contexto de este turno. Debería devolver solo ubicaciones de coincidencia y un fragmento corto, como `{ "matches": [{ "file": "...", "line": 42, "snippet": "..." }] }`, y cuando haga falta el contenido completo, dejar que el modelo llame a `read_file` por su cuenta.
2. Este es un problema de herramienta de escritura. Devolver un único booleano no le da a quien llama forma de saber cuánto cambió esta sobrescritura ni qué aspecto tenía antes, así que si algo sale mal no hay nada contra lo que revisar ni revertir. Debería llevar el diff del contenido antiguo frente al nuevo, o al menos el recuento de bytes/hash previo al cambio, para poder comparar los dos.
3. Este es un problema de llamada a API externa. `"failed"` no le dice al modelo nada sobre qué hacer después: reintentar, cambiar de destinatario o informar al usuario. Debería ser algo como `{ "ok": false, "error": "invalid_recipient", "detail": "el formato de la dirección es incorrecto" }`, un tipo de error concreto que el modelo pueda usar para decidir su siguiente movimiento.

<!-- hint -->
Vuelve a la tabla de esta lección. La columna «peor caso cuando sale mal» de cada categoría es exactamente la trampa más típica de esa categoría — empareja primero el problema con una categoría, y luego piensa en la corrección.

<!-- hint -->
Imagina que eres el modelo que recibió este valor de retorno, sin ningún contexto previo, solo este JSON. ¿Puedes decidir qué hacer después? Si no puedes, al valor de retorno le falta información clave.

### Nivel 2: Elige los tipos de herramienta para un escenario nuevo y diseña una firma

Necesitas conectar una herramienta para un agente: comprueba periódicamente el estado del envío de una API de logística de terceros, y si el estado pasa a «anómalo», escribe el número de seguimiento y el motivo en un archivo local `alerts.log`.

Esta tarea implica en realidad más de una categoría de herramienta. Escribe:

1. ¿Cuáles de las cinco categorías de esta lección necesita? ¿De qué se encarga cada una?
2. Escribe un `input_schema` JSON para la herramienta de «llamar a API externa para consultar el estado del envío», con al menos un parámetro de número de seguimiento (el tratamiento sistemático del diseño de interfaces es la próxima lección; aquí basta con imitar el formato de firma que ha aparecido en esta lección)
3. Cuando la consulta de esta herramienta falla (el número de seguimiento no existe, la petición agota el tiempo de espera), ¿qué aspecto debería tener el valor de retorno?

<!-- rubric -->
- Identifica correctamente al menos dos categorías (llamar a API externa para consultar el estado + escribir archivo para registrar la anomalía; leer archivo también puede contar, según cómo lo plantees)
- El input_schema incluye los campos básicos `type: object`, `properties`, `required`, con nombres de parámetros sensatos
- El retorno de fallo distingue «el número de seguimiento no existe» de «la petición agotó el tiempo de espera» como dos tipos de fallo distintos, no un `error` genérico único

<!-- answer -->
1. Al menos dos categorías: llamar a API externa (consultar el estado logístico) se encarga de obtener el último estado; escribir archivo (registrar en alerts.log) se encarga de escribir en disco cuando el estado es anómalo. Si además quieres deduplicar (evitar registrar dos veces la misma anomalía), puede que también necesites leer archivo para comprobar primero si alerts.log ya tiene un registro para este número de seguimiento.
2. Una firma de referencia:

```json
{
  "name": "check_shipment_status",
  "input_schema": {
    "type": "object",
    "properties": {
      "tracking_number": { "type": "string", "description": "Número de seguimiento" }
    },
    "required": ["tracking_number"]
  }
}
```

3. Retornos de fallo de referencia: `{ "ok": false, "error": "not_found", "detail": "el número de seguimiento no existe" }` y `{ "ok": false, "error": "timeout", "retry_after": 10 }` deberían ser dos valores de `error` distintos. Cuando el modelo ve `not_found` debería dejar de reintentar e informar al usuario; solo cuando ve `timeout` debería reintentar tras el tiempo que sugiere `retry_after`.

<!-- hint -->
Divide primero la tarea en las dos acciones «consultar el estado» y «registrar la anomalía», y luego contrasta cada una con la tabla de esta lección para decidir a qué categoría pertenece.

<!-- hint -->
«El número de seguimiento no existe» y «la petición agotó el tiempo de espera» son señales completamente distintas para el modelo: una significa dejar de reintentar, la otra significa reintentar más tarde. Si el valor de retorno las fusiona en el mismo valor del mismo campo `error`, el modelo no tiene forma de saber cuál es el movimiento correcto.

<!-- /exercises -->

## Resumen

- El riesgo no está repartido por igual entre las cinco categorías: leer archivo tiene las consecuencias más leves, escribir archivo es donde las cosas empiezan a ser irreversibles, el radio de impacto de ejecutar comando equivale a todo el sistema operativo, y buscar y llamar a API externa tienen cada una sus propias trampas
- La diferencia central entre herramientas de lectura y de escritura es **si puedes reintentar sin peligro** — lee mal y vuelves a leer, escribe mal y el contenido original puede haberse ido para siempre
- Las herramientas de ejecución de comandos necesitan un sandbox a nivel de SO como respaldo porque su parámetro `command` es una cadena abierta, no acotada por una estructura de esquema como lo están las otras cuatro[^S16][^S17]
- Las herramientas de búsqueda devuelven ubicaciones de coincidencia más fragmentos en lugar de archivos enteros, primero para ahorrar tokens y segundo para separar «localizar» de «leer el detalle», entregándole al modelo una pista que pueda seguir[^S9]
- Las herramientas de llamada a API externa deberían llevar la información de fallo (tipo de error, si se puede reintentar) de vuelta al modelo tal cual, en lugar de tragársela — en esta categoría, fallar es la norma, no la excepción[^S11]

En la próxima lección desmontamos las «firmas» de estas cinco categorías: cómo escribir un buen nombre de herramienta, descripción, esquema de parámetros y valor de retorno, para que el modelo la llame bien a la primera.

[>> Lección 4: Diseñar interfaces de herramientas: nombre, descripción, parámetros, valor de retorno](./04-designing-tool-interfaces.md)
