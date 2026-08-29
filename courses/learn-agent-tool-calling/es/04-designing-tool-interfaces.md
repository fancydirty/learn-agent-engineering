# Lección 4: Diseñar interfaces de herramientas: nombre, descripción, parámetros, valor de retorno

> Objetivos de aprendizaje:
> - Juzgar si la descripción de una herramienta le da al modelo lo suficiente para elegir la herramienta correcta y rellenar los parámetros correctos
> - Usar enum y required de JSON Schema para cerrar el margen de uso indebido de los parámetros, y saber cuándo usar el modo strict para convertir esas restricciones en garantías firmes
> - Diseñar valores de retorno y mensajes de error sobre los que el modelo pueda actuar para corregirse solo
>
> Requisitos: Terminaste la Lección 3 y conoces la diferencia entre los cinco tipos de herramientas: read / write / execute / search / call | Anterior: [Lección 3 <<](./03-tool-types.md) | Siguiente: [Lección 5 >>](./05-permissions-and-safety.md)

## Una herramienta, dos descripciones, dos resultados

Supongamos que tu caja de herramientas tiene una herramienta de búsqueda de código. Esta es la primera versión de cómo está registrada:

```json
{
  "name": "search_files",
  "description": "Busca archivos",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"]
  }
}
```

El usuario pregunta: «¿En qué directorio está utils.ts?».

Lo único que el modelo tiene a mano son esas dos líneas: el nombre y la descripción. No hay forma de que distinga si `search_files` busca archivos por nombre o busca una cadena dentro del contenido de los archivos; la descripción no lo dice. El modelo elige esta herramienta y pasa `utils.ts` como query:

```json
{ "id": "call_1", "name": "search_files", "input": { "query": "utils.ts" } }
```

Si esta herramienta en realidad hace búsqueda de texto completo (busca la cadena `utils.ts` dentro del contenido de cada archivo), y el contenido de ningún archivo contiene literalmente esos caracteres, el resultado vuelve vacío. El modelo recibe un resultado vacío y no puede distinguir si el archivo no existe o si su enfoque de búsqueda era el equivocado, así que adivina. Lo habitual es que pruebe unos cuantos sinónimos y busque otra vez, y siga recibiendo resultados vacíos.

Ahora cambia la descripción por esta:

```json
{
  "name": "code_search_grep",
  "description": "Busca en el contenido de los archivos fuente las líneas que coinciden con una expresión regular, y devuelve rutas de archivo y números de línea. Úsala para responder 'en qué parte del código aparece una variable/función/cadena concreta'. Para encontrar archivos por su nombre (en lugar de por su contenido), usa la herramienta code_search_glob.",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": { "type": "string", "description": "La expresión regular con la que hacer coincidir" },
      "path": { "type": "string", "description": "Directorio desde el que empezar la búsqueda; por defecto, la raíz del proyecto" }
    },
    "required": ["pattern"]
  }
}
```

Misma pregunta, pero esta vez el modelo lee «para encontrar archivos por su nombre, usa code_search_glob» y cambia directamente a code_search_glob, que está registrada en la misma caja de herramientas, pasando el parámetro correcto:

```json
{ "id": "call_1", "name": "code_search_glob", "input": { "pattern": "**/utils.ts" } }
```

Entre las dos llamadas no cambió nada: mismo modelo, mismo prompt, ningún cambio en el código de implementación. La única diferencia son esas pocas líneas que el modelo puede leer en la definición de la herramienta: un nombre más preciso, una descripción que deja clara la frontera y nombra la herramienta alternativa, y parámetros con sus propias descripciones. De eso trata esta lección: cada campo de la interfaz de una herramienta es lo único con lo que el modelo puede razonar cuando toma una decisión.

## La descripción es todo lo que el modelo ve al elegir una herramienta

Quienes desarrollan tienden a escribir herramientas como escriben comentarios de una API: le ponen a la función un nombre con sentido, meten la lógica en el cuerpo y dejan que quien la necesite lea el código fuente. Ese hábito se rompe con las definiciones de herramientas: **el modelo no lee tu código de implementación**. Todo lo que ve son los campos name, description e input_schema[^S3]; qué herramienta elegir y qué parámetros pasar se reduce por completo a esas pocas líneas.

El requisito oficial para una description es directo: debería ser "A detailed plaintext description of what the tool does, when it should be used, and how it behaves."[^S3] (una descripción detallada en texto plano de qué hace la herramienta, cuándo debería usarse y cómo se comporta). Si falta cualquiera de esas tres cosas, el modelo tiene que adivinar. Si falta «qué hace», el modelo puede saltarse la herramienta por completo y tomar un camino más largo para fingir el resultado. Si falta «cuándo usarla» y la caja de herramientas contiene varias parecidas (por ejemplo, un grep y un glob a la vez), el modelo no puede saber dónde está la frontera, y sus probabilidades de elegir mal suben con el número de herramientas. Si falta «cómo se comporta», el modelo no sabe qué forma tendrá el resultado que reciba, así que no puede escribir la lógica posterior correcta para interpretarlo.

Una buena descripción debería "Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs."[^S8] (evitar la ambigüedad describiendo con claridad las entradas y salidas esperadas) en lugar de buscar una redacción elegante. La description de `code_search_grep` de la sección anterior funciona porque hace dos cosas: deja claro que busca en el contenido y no en los nombres de archivo, y nombra `code_search_glob` como la herramienta para encontrar archivos por nombre. Esas dos frases le permiten al modelo elegir entre herramientas parecidas sin ensayo y error.

```agentmentor-check
{
  "id": "tool-zh-04-description-audience",
  "label": "Destinatario de la description",
  "prompt": "Un colega piensa que escribir la description con detalle es innecesario, y razona así: «este texto en realidad está para que quien mantenga el código entienda la lógica, y da la casualidad de que el modelo también lo lee, así que no hace falta pelearse con la redacción». ¿Qué le respondes?",
  "whyHere": "El ejemplo de apertura ya mostró dos descripciones llevando al modelo a elegir la herramienta equivocada frente a la correcta; aquí se comprueba si quien aprende entiende quién es realmente el lector del campo description y qué papel juega en la ruta de decisión, en vez de tratarlo como un comentario de código cualquiera",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "La description es sobre todo un comentario para quien mantenga este código más adelante; el modelo simplemente lo lee de paso",
      "correct": false,
      "feedback": "Está al revés. Cuando el modelo elige una herramienta y rellena los parámetros, todo lo que ve son los campos name, description e input_schema: no puede ver el código de implementación y mucho menos los comentarios que hay dentro. La description no es una narración que el modelo lee «de paso»; es la base completa de su decisión. Las notas para un colega van en comentarios de código o en la documentación, que son cosa aparte de este campo."
    },
    {
      "id": "b",
      "text": "La description es el único texto que el modelo lee al decidir si llama a esta herramienta y qué le pasa; no puede ver el código de implementación",
      "correct": true,
      "feedback": "Correcto. Por eso mismo, en el ejemplo de apertura, cambiar una sola description en la misma herramienta hizo que el modelo pasara de elegir la herramienta equivocada a elegir la correcta: sin cambiar de modelo y sin tocar la implementación, solo el texto que el modelo podía leer."
    },
    {
      "id": "c",
      "text": "La description sirve sobre todo para ahorrar tokens, así que cuanto más corta mejor; que el modelo adivine cómo usarla a partir del prompt de sistema",
      "correct": false,
      "feedback": "Incorrecto, y en la dirección contraria. Una description vaga no ahorra tokens: hace que el modelo pruebe a ciegas entre varias herramientas parecidas, obtenga resultados vacíos y reintente, y esas idas y vueltas fallidas cuestan muchos más tokens que unas cuantas frases claras. El coste en tokens sí importa cuando el número de herramientas crece lo suficiente, pero eso se resuelve recortando la cantidad y la granularidad de las herramientas, no explicando cada una de forma vaga."
    }
  ]
}
```

## Los nombres también deberían señalar a quién pertenecen: namespacing

El trabajo de la descripción es detallar qué hace la herramienta; el del nombre es otro: evitar que la herramienta se confunda con otra dentro de una caja abarrotada. En cuanto tienes muchas herramientas, sobre todo después de conectar varios servicios externos, nombres como `list_prs`, `send_message` o `create_issue` son nombres que cualquiera podría elegir, y el nombre por sí solo no dice a qué servicio pertenecen.

El consejo oficial es prefijar los nombres de las herramientas con el servicio: "When your tools span multiple services or resources, prefix names with the service (e.g., github_list_prs, slack_send_message). This makes tool selection unambiguous as your library grows, and is especially important when using tool search."[^S10] (cuando tus herramientas abarcan varios servicios o recursos, prefija los nombres con el servicio). Cuando el modelo tiene que elegir una herramienta entre decenas, un nombre con prefijo acota primero el campo, de modo que puede descartar la mayoría de las opciones sin abrir cada descripción para compararlas línea a línea. Los cinco tipos de herramientas de la Lección 3 (read, write, execute, search, call) se benefician igual si cada uno se apoya en un servicio distinto: `fs_read_file` y `db_read_row` a simple vista no son lo mismo, mientras que un `read` a secas los mezcla.

## input_schema: fijar la forma de los parámetros

La descripción decide si el modelo elegirá esta herramienta; el input_schema decide si podrá rellenar los parámetros correctamente[^S3]. Aquí hay algo fácil de pasar por alto: en JSON Schema no todos los campos «restringen» un parámetro; algunos solo lo «describen».

Añadir una description a un parámetro solo declara la intención; no rechazará ninguna entrada que no coincida con lo que dice la frase[^S14]:

```json
{
  "file_type": {
    "type": "string",
    "description": "Limita la búsqueda a un tipo de archivo, por ejemplo typescript"
  }
}
```

El modelo podría pasar `"typescript"`, podría pasar `"ts"`, podría pasar `"archivos TypeScript"`: la description es solo una sugerencia y nada le impide pasar cualquier cosa. Lo que de verdad frena los valores arbitrarios es enum:

```json
{
  "file_type": {
    "type": "string",
    "enum": ["js", "ts", "py", "all"],
    "description": "Limita la búsqueda a un tipo de archivo"
  }
}
```

Con enum en su sitio, los valores legales quedan listados de forma explícita, el modelo casi siempre rellena uno de ellos y las probabilidades de un valor arbitrario caen en picado. Pero ojo: esto es una guía fuerte para el modelo, no una garantía firme de la plataforma. En el modo por defecto la API no valida los parámetros contra el esquema por ti, y el modelo seguirá produciendo de vez en cuando entradas con tipos incorrectos o sin campos required[^S20], así que las comprobaciones de valores inválidos en la implementación de tu herramienta tienen que seguir ahí. Lo mismo con required: si una herramienta de «escribir archivo» no marca `path` como required, el modelo lo omitirá de vez en cuando, y entonces la implementación tiene que fallar con un error o adivinar una ruta por defecto, y ninguna de las dos opciones es buena. Marcar `path` como required deja ese tipo de uso indebido en probabilidades muy bajas, y que «required» lo imponga de verdad la plataforma depende del modo strict de la sección siguiente.

**Recuerda esta distinción**: type, enum y required son restricciones reales en términos de validación, mientras que title y description son solo notas para el modelo; por muy detalladas que sean, no constituyen una regla de validación[^S14]. Cuando diseñes un input_schema, pregúntate primero: ¿las «entradas que no deberían aparecer» en este parámetro se pueden bloquear directamente con enum o required, en lugar de limitarse a escribir «pasa por favor xxx» en la description? Cómo elevar estas restricciones de «escritas en el esquema» a «impuestas por la plataforma» es la sección siguiente.

## Convertir restricciones blandas en garantías firmes: additionalProperties: false y el modo strict

La sección anterior insistió en la diferencia entre «restringir» y «describir», pero hay otra capa que conviene tener clara: escribir una restricción en el esquema y que los parámetros producidos por el modelo pasen realmente la validación siguen siendo dos cosas distintas. En el modo por defecto, la API no interceptará por ti una llamada que no coincide con el esquema: el modelo escribirá de vez en cuando un número como la cadena `"2"`, o directamente omitirá un campo required[^S20].

Hay también una dirección más sutil: el modelo puede añadir campos de la nada. Supongamos que el esquema de una herramienta para crear tickets declara solo dos parámetros, `title` y `priority`, pero una llamada vuelve así:

```json
{ "title": "La página de login devuelve 500", "priority": "high", "skip_review": true }
```

Esa clave `skip_review` nunca estuvo en las properties del esquema; el modelo se la inventó por su cuenta. El comportamiento por defecto de JSON Schema estándar es justamente permitir que un objeto lleve claves extra no declaradas, y si la implementación de tu herramienta resulta que pasa la entrada entera a un sistema aguas abajo, y el código de ese sistema tiene de verdad una bifurcación que comprueba ese nombre de campo, una sola alucinación del modelo se salta en silencio un paso de revisión que tenía que ocurrir. Añadir `"additionalProperties": false` en la parte superior del input_schema escribe también «solo se permiten las claves declaradas» en las reglas de validación.

Para que la plataforma imponga todo esto de verdad, añade el campo de nivel superior `"strict": true` a la definición de la herramienta. El modo strict funciona restringiendo el propio muestreo del modelo: "Setting strict: true on a tool definition guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling)."[^S20] (poner strict: true garantiza que las entradas de herramienta coincidan con tu JSON Schema, restringiendo el muestreo de tokens del modelo a salidas válidas según el esquema). Se respetan type, enum, required y additionalProperties, y los parámetros inválidos simplemente nunca llegan a generarse. En la documentación oficial, los esquemas de ejemplo del modo strict llevan además `additionalProperties: false`: los dos están pensados para usarse juntos. Solo en este punto se cumple de verdad que «los valores inválidos quedan descartados antes incluso de enviar la petición»; para una herramienta sin modo strict, no puedes quitar ni una línea de validación de parámetros del lado de la implementación.

## Valores de retorno: dale al modelo algo que pueda usar después, no un log para humanos

Cuando una herramienta termina, su resultado se envuelve en un bloque tool_result y se devuelve al modelo. Los campos centrales son `tool_use_id` (a qué llamada corresponde), `content` (el resultado) e `is_error` (si falló)[^S5]. De los tres, el que más a menudo se escribe mal es el content en caso de fallo.

Supongamos que una herramienta de «escribir archivo» falla porque el directorio no existe. Dos formas de escribirlo:

```json
{
  "tool_use_id": "call_1",
  "content": "Error: ENOENT: no such file or directory, open '/reports/q3.csv'",
  "is_error": true
}
```

Esto devuelve el log del sistema tal cual. El modelo puede ver que falló, pero no puede saber qué hacer a continuación; lo habitual es que repita exactamente la misma llamada, choque con el mismo error por segunda vez y caiga en un bucle.

```json
{
  "tool_use_id": "call_1",
  "content": "Fallo al escribir: el directorio /reports no existe. Créalo primero con fs_create_dir, o cambia a una ruta bajo un directorio que ya exista.",
  "is_error": true
}
```

El mismo fallo, pero esta versión le dice al modelo tres cosas: cuál fue el fallo, a qué herramienta puede llamar para arreglarlo y qué otra ruta tiene disponible. La especificación de MCP es explícita: "Clients SHOULD provide tool execution errors to language models to enable self-correction."[^S11] (los clientes DEBERÍAN entregar los errores de ejecución de herramientas a los modelos de lenguaje para permitir la autocorrección), con la condición de que ese mensaje lleve por sí mismo las pistas necesarias para corregir, y no una traza de pila que solo entiende quien está depurando el código.

## Cantidad y granularidad de herramientas: más no es mejor

Una caja de herramientas más grande no es una caja mejor. Cada definición de herramienta (name, description e input_schema juntos) tiene que empaquetarse en el contexto antes de que empiece la conversación, y en cuanto tienes muchas herramientas ese sobrecoste crece deprisa. El equipo de ingeniería de Anthropic dio una cifra: "That's 58 tools consuming approximately 55K tokens before the conversation even starts." (son 58 herramientas consumiendo unos 55K tokens antes siquiera de que empiece la conversación); tanto contexto quemado antes de que la conversación arranque de verdad. También han visto casos más extremos internamente: "At Anthropic, we've seen tool definitions consume 134K tokens before optimization."[^S9] (hemos visto definiciones de herramientas consumir 134K tokens antes de optimizar). Cuanto más abarrotado está el contexto, menos espacio le queda al modelo para razonar sobre la tarea real.

El segundo problema que llega con un número alto de herramientas no tiene nada que ver con los tokens: elegir se vuelve más difícil. Acumula varias herramientas con funciones parecidas y el modelo tendrá que gastar un paso extra solo en «cuál uso», con las probabilidades de equivocarse subiendo junto con el número de herramientas: "More tools don't always lead to better outcomes."[^S8] (más herramientas no siempre llevan a mejores resultados). Por eso también las secciones anteriores insistían en que una descripción tiene que dejar clara la frontera.

Lo contrario, una granularidad demasiado gruesa, tampoco funciona. Una herramienta de «operaciones de archivo» que mete leer, escribir, borrar y editar en un solo input_schema y distingue el comportamiento con un parámetro `action` obliga al modelo a adivinar primero el valor correcto de `action` y después qué parámetros rellenar: más propenso a errores que dividirla en herramientas de responsabilidad única como `fs_read_file` y `fs_write_file`. El compromiso práctico: divide primero las herramientas siguiendo los cinco tipos de la Lección 3 y después, cuando el número crezca, controla las probabilidades de una mala elección con namespacing y descripciones precisas, en lugar de apilar una herramienta que lo hace todo para mantener el número bajo.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Reescribe una definición de herramienta vaga

Un proyecto tiene una herramienta de «escribir archivo», definida ahora mismo así:

```json
{
  "name": "write_file",
  "description": "Escribe un archivo",
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

La caja de herramientas también tiene una herramienta `edit_file` que hace una sola cosa: reemplazos locales dentro de un archivo existente. El modelo llama a menudo a `write_file` cuando debería llamar a `edit_file` para un cambio pequeño, y sobrescribe el archivo entero.

Reescribe la description y el input_schema de `write_file` para que:

1. La description deje claro que esta herramienta **sobrescribe por completo** el contenido del archivo, y apunte a `edit_file` para cambios locales
2. El input_schema añada un parámetro restringido por enum que distinga «crear cuando el archivo no existe» de «sobrescribir cuando el archivo ya existe», para que el modelo no sobrescriba sin querer un archivo que no debería tocar
3. Comprobación: si al modelo le llega «cambia el número de puerto en config.json a 8080», ¿seguiría echando mano de `write_file`?

<!-- rubric -->
- La description declara explícitamente el comportamiento de «sobrescribir el archivo entero» y nombra edit_file como alternativa para cambios locales
- El input_schema tiene un parámetro restringido por enum que distingue crear de sobrescribir
- Sabes explicar por qué este cambio baja las probabilidades de «llamar a write_file cuando edit_file era la elección correcta»

<!-- answer -->
Una versión de referencia:

```json
{
  "name": "write_file",
  "description": "Crea un archivo nuevo, o sobrescribe por completo el contenido de un archivo existente. Si solo necesitas cambiar una parte pequeña de un archivo (por ejemplo, un valor de configuración o una línea de código), usa edit_file para hacer un reemplazo local; no uses esta herramienta para sobrescribir el archivo entero.",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Ruta del archivo de destino" },
      "content": { "type": "string", "description": "El contenido completo del archivo que se va a escribir" },
      "mode": {
        "type": "string",
        "enum": ["create_new", "overwrite_existing"],
        "description": "create_new: el archivo no debe existir; si no, da error; overwrite_existing: permite sobrescribir un archivo que ya existe"
      }
    },
    "required": ["path", "content", "mode"]
  }
}
```

Cambios clave: la description detalla «sobrescribe el archivo entero» y «usa edit_file en su lugar», de modo que cuando el modelo vea una petición de cambio local como «cambia el número de puerto» considerará primero edit_file. El enum de mode obliga al modelo a declarar por adelantado si esto es una creación o una sobrescritura, así que aunque siga eligiendo write_file, no sobrescribirá un archivo existente sin darse cuenta.

<!-- hint -->
Vuelve al ejemplo de apertura: resuelve «eligió la herramienta equivocada» nombrando directamente la herramienta alternativa en la descripción. Este ejercicio es el mismo patrón, solo que cambiado a write_file y edit_file.

<!-- hint -->
En qué parámetro va el enum depende de qué quieres que el modelo piense antes de llamar. Aquí es «¿esta operación pretende de verdad sobrescribir un archivo existente?», así que el enum debería restringir eso, y no un parámetro sin relación como el tipo de archivo.

### Nivel 2: Diagnostica una llamada que falló por un mal valor de retorno

Abajo hay un registro de ida y vuelta simplificado pero real. Una herramienta de «ejecutar tests» fue llamada 3 veces seguidas, con entradas idénticas cada vez:

```
Llamada 1: { "name": "run_tests", "input": { "suite": "unit" } }
Devuelve: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }

Llamada 2: { "name": "run_tests", "input": { "suite": "unit" } }
Devuelve: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }

Llamada 3: { "name": "run_tests", "input": { "suite": "unit" } }
Devuelve: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }
```

Responde a esto:

1. ¿Por qué el modelo repite la llamada 3 veces con parámetros idénticos en lugar de probar algo distinto?
2. ¿Qué necesita hacer el modelo para resolver la causa real (la conexión a la base de datos fue rechazada; no hay nada escuchando en el puerto 5432)? Supón que la caja de herramientas también tiene una herramienta `start_service`.
3. Reescribe el campo `content` como un mensaje de error que llevaría al modelo a cambiar de enfoque antes de la segunda llamada.

<!-- rubric -->
- Señala que el mensaje de error original es solo un log en crudo sin pista sobre «qué hacer a continuación», así que el modelo solo puede repetir el reintento
- Conecta correctamente la causa raíz (un servicio del que se depende no está corriendo) con la herramienta disponible (start_service)
- El mensaje reescrito incluye el motivo del fallo, la acción sugerida y el nombre concreto de la herramienta a la que llamar

<!-- answer -->
1. El valor de retorno original solo devuelve el log subyacente (`ECONNREFUSED 127.0.0.1:5432`) tal cual, e `is_error: true` únicamente le dice al modelo «esto falló»: no por qué falló ni qué hacer después. El modelo solo puede suponer que es un problema pasajero y volver a intentarlo con los mismos parámetros. Esto es exactamente lo que el «entregar mensajes de error accionables al modelo» de la especificación de MCP busca evitar: sin información accionable no hay autocorrección, solo repetición.

2. El puerto 5432 es el puerto por defecto de PostgreSQL, y `ECONNREFUSED` significa que el servicio de base de datos del que dependen los tests no está corriendo. El modelo necesita llamar primero a `start_service` (supongamos que acepta un nombre de servicio, por ejemplo `postgres`), confirmar que arrancó y después llamar a `run_tests` otra vez.

3. Una versión de referencia:

```json
{
  "content": "Fallo al ejecutar los tests: no se puede conectar con el servicio local de base de datos (nada responde en el puerto 5432); el servicio postgres del que dependen los tests no está corriendo ahora mismo. Llama primero a start_service para arrancar el servicio postgres, confirma que arrancó y después vuelve a llamar a run_tests.",
  "is_error": true
}
```

<!-- hint -->
Escribe primero por separado «qué vio el modelo» y «qué debería hacer el modelo»: el log en crudo solo responde a la primera mitad.

<!-- hint -->
Un buen mensaje de error debería leerse como la respuesta a «¿a qué herramienta llamo ahora y qué le paso?», no como una nota de depuración para una persona que programa.

<!-- /exercises -->

## Resumen

- La descripción es el único texto que el modelo ve cuando elige una herramienta y rellena parámetros; detallar «qué hace, cuándo usarla, cuándo no» importa más que escribirla con elegancia
- Añadir un prefijo de servicio (namespacing) al nombre ayuda al modelo a descartar de entrada un buen puñado de opciones irrelevantes, cuando hay muchas herramientas
- En el input_schema, type, enum y required son restricciones reales en términos de validación mientras que title y description son solo notas; enum más required deja las probabilidades de valores arbitrarios muy bajas, y convertir «las entradas inválidas simplemente nunca se generan» en una garantía firme requiere additionalProperties: false más el modo strict[^S20]
- Los valores de retorno, sobre todo en caso de fallo, necesitan detallar «por qué falló» y «qué hacer a continuación» para que el modelo pueda corregirse solo en lugar de reintentar sin cambios
- Más herramientas no es mejor: las definiciones consumen tokens de contexto, y cuanto más parecidas son las herramientas más fácil es que el modelo elija mal; la granularidad tampoco es «cuanto más fina mejor»: divide primero por función y después controla las probabilidades de una mala elección con nombres y descripciones claros

[>> Lección 5: Permisos y seguridad: los límites de lo que un agente puede hacer](./05-permissions-and-safety.md)
