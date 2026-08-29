# Lección 3: Memoria externa: archivos y recuperación

> Objetivos de aprendizaje:
> - Explicar por qué la memoria que debe sobrevivir a través de las sesiones tiene que escribirse fuera de la ventana, en archivos
> - Distinguir los archivos de memoria escritos por humanos, como CLAUDE.md, de los escritos por el modelo, como Auto memory
> - Enunciar el equilibrio entre «recuperar bajo demanda» y «cargar todo por adelantado»
> - Añadir una comprobación segura de límites de ruta a una herramienta que lee y escribe archivos de memoria
>
> Requisitos: terminada la Lección 2, entiendes la diferencia entre compactación y borrado de resultados de herramientas | Anterior: [Lección 2 <<](./02-managing-conversation-history.md) | Siguiente: [Lección 4 >>](./04-structured-task-state.md)

## Cuando la sesión termina, todo lo que hay en la ventana desaparece

La Lección 2 cerró con un problema sin resolver: un asistente de agenda al que un usuario le dijo la semana pasada «no como picante», y luego esta semana el usuario abre una conversación nueva con una ventana vacía, y el agente no tiene ni idea de que esa oración se dijo alguna vez.

El truncado, la compactación y el borrado de resultados de herramientas no pueden arreglar esto. Los tres lidian con «nos quedamos sin espacio dentro de esta única conversación». El problema aquí es distinto: esta conversación no tenía nada del contenido de la semana pasada desde el primer turno. El Cookbook oficial traza la línea sin rodeos: el borrado y la compactación operan ambos sobre el contexto actual; ninguno ayuda cuando arranca una sesión nueva y la ventana está vacía. La memoria resuelve ese problema[^S2]. La ventana, como contenedor, solo vive lo que dura esta única sesión. Cierra la sesión, y todo lo que había en la ventana que no se movió a otro lado desaparece de verdad.

La única forma de mantener viva la información más allá de esta sesión es escribirla, antes de que la sesión termine, en algún lugar fuera de la ventana: en la **memoria externa**, un almacenamiento que no está atado al ciclo de vida de esta conversación, normalmente solo un archivo en disco. Cuando arranca la siguiente sesión, lees ese archivo de vuelta y cargas su contenido en la nueva ventana de contexto.

## CLAUDE.md: escrito por humanos, cargado completo cada vez

El patrón más directo de memoria externa es que un humano mantenga un **archivo de memoria**, guardado en el proyecto y leído completo al inicio de cada sesión. CLAUDE.md en Claude Code es el caso representativo: la documentación oficial dice que un archivo CLAUDE.md se carga en la ventana de contexto al inicio de cada sesión, gastando tokens junto a la conversación misma, y el tamaño recomendado como objetivo es mantener cada archivo por debajo de 200 líneas: cuanto más largo el archivo, más contexto consume y menor es la adherencia del agente a las instrucciones.[^S3] Nota que 200 líneas es una recomendación blanda; el límite duro real es 4 MiB: un CLAUDE.md más grande que eso se omite por completo.[^S3]

```markdown
# CLAUDE.md

## Estilo de código
- Indenta con 2 espacios, nunca tabulaciones
- Prefiere const; recurre a let solo cuando de verdad no quede otra

<!-- Esta nota es para mi yo futuro. No hace falta que esté en el contexto del agente. -->
## Notas internas
- Detalle a tener en cuenta del último refactor del módulo de pagos: xxx
```

Un detalle de este archivo vale la pena notar: la documentación oficial explica que los **comentarios HTML a nivel de bloque** en CLAUDE.md se eliminan antes de que el contenido se inyecte en el contexto del agente.[^S3] En otras palabras, lo que sea que escribas dentro de `<!-- -->` es visible cuando un humano abre el archivo, pero la versión que lee el agente no incluye ese comentario, lo que le da a un humano una forma de «dejarme una nota sin gastar el presupuesto de tokens del agente».

CLAUDE.md tiene otra propiedad que conecta directamente con la compactación de la Lección 2: la documentación señala que un CLAUDE.md en la raíz del proyecto sobrevive a la compactación; después de `/compact`, Claude lo relee desde disco y lo vuelve a inyectar en la sesión.[^S3] Dicho de otro modo, un archivo así no es «preservado de forma incidental» por la compactación; se relee y se reinyecta por separado, no depende en absoluto de si esa compactación conservó su contenido en el resumen.

```agentmentor-check
{
  "id": "mem-zh-03-claudemd-size",
  "label": "Juzgar si un archivo de memoria debe crecer sin límite",
  "prompt": "Alguien deduce que cuanto más completo sea CLAUDE.md, mejor, así que le mete el documento de requisitos completo del proyecto, todo su historial de decisiones y una descripción detallada de cada módulo: 2000 líneas en total. ¿Qué problema tiene hacer eso?",
  "whyHere": "Acabamos de cubrir que CLAUDE.md se carga completo al inicio de cada sesión y que 200 líneas es el objetivo de tamaño oficial. Esto comprueba si el aprendiz trata un archivo de memoria como una base de conocimiento donde «cuanto más completo, mejor», sin darse cuenta de que gasta presupuesto de tokens por sí mismo y baja la adherencia a las instrucciones.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Ningún problema. Cuanto más completo el archivo de memoria, más contexto de fondo tiene el agente, y más precisas son sus respuestas.",
      "correct": false,
      "feedback": "No exactamente. CLAUDE.md se carga completo al inicio de cada sesión, y 200 líneas es el objetivo de tamaño oficial: pásate de ahí y gastas más contexto y bajas la adherencia del agente a las instrucciones. «Recordar más» no es lo mismo que «usarlo bien», que es exactamente la degradación de contexto de la Lección 1 apareciendo en el escenario concreto de un archivo de memoria."
    },
    {
      "id": "b",
      "text": "Sí, hay un problema: cuanto más largo el archivo, más contexto ocupa, y la documentación dice sin rodeos que los archivos largos bajan la adherencia del agente a las instrucciones.",
      "correct": true,
      "feedback": "Correcto. CLAUDE.md se carga completo cada sesión, y 200 líneas es el objetivo de tamaño oficial: cuanto más largo el archivo, más contexto quema y menor la adherencia del agente (el límite duro real es 4 MiB, y cualquier cosa más grande se omite por completo). La información que cambia a menudo o que ocupa mucho pertenece detrás de una recuperación bajo demanda, no volcada en un archivo que se carga completo cada vez."
    },
    {
      "id": "c",
      "text": "Ningún problema. Mientras el contenido sea preciso, la longitud no afectará el desempeño del agente.",
      "correct": false,
      "feedback": "La longitud afecta el desempeño directamente. El contenido de CLAUDE.md se carga en el contexto junto a esta conversación y gasta el mismo presupuesto de tokens. Un archivo demasiado largo no solo está «ocupando espacio»: la documentación dice sin rodeos que baja la adherencia del agente a las instrucciones, y eso no es un detalle que puedas ignorar."
    }
  ]
}
```

## Auto memory: escrita por el modelo, recuperada bajo demanda

CLAUDE.md lo escribe un humano y se carga completo cada vez. Hay un patrón complementario: dejar que el modelo anote lo que vale la pena recordar a medida que avanza la conversación, guardándolo en sus propios archivos de memoria. Claude Code llama a este mecanismo **Auto memory**. Su reparto de tareas con CLAUDE.md es complementario, y una tabla comparativa expone la diferencia con claridad: CLAUDE.md lo escribes tú, Auto memory la escribe Claude.[^S3]

La memoria que el modelo escribe por sí mismo suele dividirse en dos capas: un archivo índice (digamos, `MEMORY.md`) más un montón de archivos de memoria específicos desglosados por tema. El archivo índice tampoco se carga sin límite: la regla que da la documentación es que, al inicio de cada conversación, solo se cargan las primeras 200 líneas de `MEMORY.md`, o los primeros 25KB, lo que ocurra primero; el contenido más allá de ese umbral no se carga al inicio de la sesión.[^S3]

Eso es **recuperación bajo demanda**: al inicio de una sesión el agente ve solo los resúmenes de las entradas del índice (algo así como «las notas detalladas de este tema viven en tal archivo»), no el contenido completo de cada archivo de memoria específico. La documentación es directa al respecto: los archivos de tema no se cargan al arranque; Claude los lee bajo demanda con sus herramientas de archivo estándar cuando necesita la información[^S3]. Solo cuando la tarea actual de verdad requiere un tema dado, el contenido de ese archivo de memoria específico se trae a la ventana de contexto de esta ronda.

Lado a lado, CLAUDE.md y Auto memory manejan dos dimensiones distintas de la memoria:

- **CLAUDE.md**: reglas y convenciones curadas por humanos, disciplinadas en tamaño, que aplican cada vez; encaja con información estable del estilo «así es como se supone que funciona el proyecto», cargada completa por adelantado.
- **Auto memory**: detalles específicos que pueden ser numerosos y que solo importan para tareas particulares; encaja con la recuperación bajo demanda, para que no se desperdicie presupuesto de ventana en memoria que esta tarea no necesita.

Ambas son memoria externa. Las únicas diferencias son «quién la escribe» y «cuándo se carga», lo que hace eco del modelo mental de la Lección 2: el punto de la memoria es mover la información fuera de la ventana para que sobreviva a través de las sesiones, y que esa información se cargue completa por adelantado o se recupere bajo demanda depende de qué tan estable es y con qué frecuencia se usa.

```agentmentor-check
{
  "id": "mem-zh-03-on-demand-retrieval",
  "label": "Juzgar qué resuelve realmente la recuperación bajo demanda",
  "prompt": "La Auto memory de un agente ha acumulado 50 archivos de memoria por tema que cubren los detalles de todo tipo de tareas pasadas. Si cada sesión arrancara cargando de golpe el contenido completo de los 50 en el contexto, ¿qué sale mal? ¿Y qué situación es exactamente la que la «recuperación bajo demanda» trata de evitar?",
  "whyHere": "Acabamos de cubrir la estructura de dos capas de un archivo índice más archivos de memoria específicos. Esto comprueba si el aprendiz entiende la motivación de la recuperación bajo demanda: no que cargar todo sea técnicamente imposible, sino que hacerlo vuelve a disparar los problemas de capacidad de ventana y de degradación de contexto de las Lecciones 1 y 2.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Llena la ventana rápido, y la mayor parte de lo cargado es irrelevante para la tarea actual, volviendo a disparar la degradación de contexto: que es exactamente lo que la recuperación bajo demanda evita.",
      "correct": true,
      "feedback": "Correcto. Carga el contenido completo de los 50 archivos y la ventana se llena rápido, cuando esta tarea probablemente solo se relaciona con uno o dos de ellos; el resto es ruido que vuelve a disparar la degradación de contexto de la Lección 1. La recuperación bajo demanda carga primero solo los resúmenes del índice, y luego trae el único tema que la tarea de verdad necesita, así que no se gasta presupuesto de ventana en memoria que no se va a usar."
    },
    {
      "id": "b",
      "text": "Ningún problema. Los archivos de memoria contienen lo que el propio agente decidió que era importante, así que cargarlo todo solo hace las respuestas más completas.",
      "correct": false,
      "feedback": "«Lo que el agente decidió que era importante» es un juicio hecho en el momento de escribir; no significa que esta tarea necesite todo eso. Cargar los 50 archivos llena la ventana y arrastra el desempeño hacia abajo, que es exactamente por lo que la documentación carga solo las primeras 200 líneas o 25KB de MEMORY.md y recupera el resto bajo demanda, no un detalle incidental."
    },
    {
      "id": "c",
      "text": "Ningún problema, porque los archivos de memoria viven en disco y no ocupan capacidad de la ventana de contexto.",
      "correct": false,
      "feedback": "«Vivir en disco» y «estar cargado en esta solicitud» son dos cosas distintas. Una vez cargado, el contenido aparece en messages o en el prompt del sistema y cuenta para la ventana de contexto de esta solicitud igual[^S1]: la otra cara de la moneda del «el modelo solo conoce lo que está en la ventana» de la Lección 1. Cargado significa que cuesta capacidad; no es gratis."
    }
  ]
}
```

## Añadir un límite seguro a la lectura y escritura de archivos de memoria

Ya sea un archivo escrito por humanos como CLAUDE.md o uno escrito por el modelo como Auto memory, en cuanto un agente tiene una herramienta para leer y escribir archivos de memoria, hay una pregunta concreta de ingeniería que enfrentar: ¿se puede convencer a esa herramienta de leer o escribir archivos fuera del directorio del proyecto?

Una comprobación de ruta que solo hace una coincidencia de prefijo de cadena parece que bloquea las peticiones de «escapar del directorio de memoria», pero tiene un agujero clásico. Si la raíz de memoria es `/project/memory`, una comprobación ingenua de `startsWith("/project/memory")` también dejará pasar una ruta como `/project/memory-evil`, porque sí empieza con esa cadena, aunque ese sea un directorio completamente distinto que está fuera de la raíz de memoria. La forma segura es exigir que la ruta o bien sea exactamente igual a la raíz, o bien empiece con «la raíz más un separador de ruta»:

```javascript
const path = require("node:path");
const MEMORY_ROOT = path.resolve("./memory");

async function readMemoryFile({ path: relPath }) {
  const abs = path.resolve(MEMORY_ROOT, relPath);
  const inRoot = abs === MEMORY_ROOT || abs.startsWith(MEMORY_ROOT + path.sep);

  if (!inRoot) {
    return "Rechazado: la ruta está fuera del directorio de memoria, y esta herramienta no tiene permitido leer archivos fuera de él.";
  }

  const fs = require("node:fs/promises");
  return await fs.readFile(abs, "utf-8");
}
```

La combinación `abs === MEMORY_ROOT || abs.startsWith(MEMORY_ROOT + path.sep)` es lo que de verdad garantiza que solo pase una ruta «igual a la raíz misma» o «que empiece con la raíz más un separador»: `/project/memory-evil` no se confundirá con una ruta dentro de `/project/memory`, porque no satisface ninguna de las dos condiciones. Este patrón se reutiliza directamente en la Lección 6 cuando construimos las herramientas de lectura/escritura para una capa de memoria persistente, y la Lección 5 dejará claro en qué clase de objetivo de ataque se convierte un archivo de memoria si esta comprobación de límites no tiene dientes.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Elegir el hogar de memoria correcto para una nota

Para cada una de las cuatro piezas de información de abajo, decide si encaja mejor en CLAUDE.md o en uno de los archivos de tema de Auto memory, y di por qué.

1. «Este proyecto indenta con 4 espacios, nunca tabulaciones»: sin cambios desde el día en que se creó el proyecto.
2. «El miércoles pasado rastreamos un timeout en producción; la causa raíz fue que el pool de conexiones a la base de datos estaba configurado demasiado pequeño, y en su momento lo subimos a 50»: un registro puntual de un evento pasado que podría venir bien para un problema parecido más adelante.
3. «En una conversación anterior el usuario mencionó que el proceso de revisión de código de su equipo es primero lint, luego una revisión humana»: solo relevante en sesiones que interactúan con este usuario.
4. «En esta conversación el usuario hizo una petición puntual de cambiar cierta función a una implementación síncrona»: solo relevante para esta única tarea; casi con seguridad no volverá a surgir la próxima sesión.

<!-- rubric -->
- El elemento 1 se juzga como CLAUDE.md, con una razón que menciona «estable, útil cada vez»
- Los elementos 2 y 3 se juzgan como Auto memory, con una razón que menciona «potencialmente numeroso, solo útil para tareas particulares, encaja con la recuperación bajo demanda»
- El elemento 4 se juzga como que no necesita memoria externa en absoluto, con una razón que menciona «solo relevante para esta única sesión, sin necesidad de sobrevivir a través de las sesiones»

<!-- answer -->
Respuesta de referencia: El elemento 1 encaja en **CLAUDE.md**: es una convención que ha estado estable desde que empezó el proyecto, útil en cada sesión, coincidiendo con el papel de CLAUDE.md de «curado por humanos, disciplinado en tamaño, útil cada vez». Los elementos 2 y 3 encajan en archivos de tema de **Auto memory**: ambos son detalles históricos específicos que podrían acumularse con el tiempo, que solo necesitan recuperarse cuando surge una situación parecida, no encajan con cargarse completos cada vez, que es exactamente el caso bajo demanda. El elemento 4 **no** necesita memoria externa en absoluto: solo importa para esta única sesión y no necesita sobrevivir a través de las sesiones; escribirlo en memoria externa sería solo un desperdicio. Información así puede quedarse en la ventana de contexto de la sesión actual, desaparecer de forma natural cuando la sesión termine, y ese es el comportamiento esperado.

<!-- hint -->
Hay dos pruebas: si esta información es «estable, o cambia», y «si es útil cada sesión, o solo en situaciones particulares».

<!-- hint -->
El elemento 4 es fácil de malinterpretar como «debería registrarse», pero piensa en el problema con el que abrió esta lección: la memoria externa existe para resolver «sobrevivir a través de las sesiones». Si una pieza de información solo importa para esta única sesión, escribirla en memoria externa no te compra nada, solo desperdicia almacenamiento y costo de recuperación posterior.

### Nivel 2: Diagnosticar una comprobación de ruta con error

El código de abajo intenta restringir una herramienta de lectura de memoria a archivos dentro del directorio `MEMORY_ROOT`:

```javascript
const MEMORY_ROOT = "/project/memory";

async function readMemoryFile({ path: relPath }) {
  const abs = require("node:path").resolve(MEMORY_ROOT, relPath);

  if (!abs.startsWith(MEMORY_ROOT)) {
    return "Rechazado: ruta fuera de rango.";
  }

  return await require("node:fs/promises").readFile(abs, "utf-8");
}
```

Encuentra el agujero de seguridad en este código, da un ejemplo concreto de ruta que sortee la comprobación y lea un archivo fuera de `MEMORY_ROOT`, y escribe la condición de comprobación corregida.

<!-- rubric -->
- Señala que usar `startsWith` por sí solo tiene un problema de sorteo por mismo prefijo
- Da un ejemplo concreto de ruta que sortea la comprobación (por ejemplo, resolviendo hacia un directorio como `/project/memory-evil`)
- La condición corregida debe incluir tanto «igual a la raíz misma» como «empieza con la raíz más un separador de ruta»

<!-- answer -->
Respuesta de referencia: El agujero es que `abs.startsWith(MEMORY_ROOT)` es una coincidencia de prefijo de cadena simple que ignora el caso «mismo prefijo pero en realidad un directorio distinto». Ejemplo: si un directorio `/project/memory-evil` existe en disco, entonces cuando `relPath` se resuelve de modo que `abs` se vuelve `/project/memory-evil/secrets.txt`, `"/project/memory-evil/secrets.txt".startsWith("/project/memory")` devuelve `true`: sí empieza con esa cadena, aunque `memory-evil` sea un directorio completamente distinto que no está dentro de `MEMORY_ROOT`, y la comprobación se sortea. La condición corregida debería ser `abs === MEMORY_ROOT || abs.startsWith(MEMORY_ROOT + path.sep)`: solo una ruta que sea exactamente igual a la raíz, o que empiece con «la raíz más un separador de ruta», cuenta como genuinamente dentro de la raíz. `/project/memory-evil` ni es igual a `/project/memory` ni empieza con `/project/memory/`, no satisface ninguna de las dos condiciones, y se rechaza correctamente.

<!-- hint -->
Piensa en un contraejemplo concreto: ¿hay algún nombre de directorio que empiece con la cadena literal `MEMORY_ROOT` pero que sea en realidad un directorio distinto?

<!-- hint -->
En la versión correcta de la sección «Añadir un límite seguro» de esta lección, ninguno de los dos lados del `||` puede quitarse: una condición sola no basta. Deduce por qué las dos juntas son las que cierran el agujero.

<!-- /exercises -->

## Resumen

- Cuando una sesión termina, todo lo que hay en la ventana que no se movió fuera se pierde para siempre; para conservar información a través de las sesiones, tienes que escribirla en memoria externa fuera de la ventana antes de que la sesión termine
- CLAUDE.md lo escribe un humano, se carga completo en el contexto cada sesión, con un objetivo de tamaño oficial de 200 líneas (límite duro 4 MiB, archivos más grandes se omiten por completo); los comentarios HTML a nivel de bloque se eliminan antes de la inyección, y un CLAUDE.md en la raíz del proyecto se relee y se reinyecta después de `/compact`[^S3]
- Auto memory la escribe el modelo, dividida en un archivo índice más archivos de tema específicos; el índice carga solo sus primeras 200 líneas o 25KB, y los archivos de tema no se cargan al arranque, se leen bajo demanda cuando hacen falta[^S3], así que no se desperdicia presupuesto de ventana en memoria que no se va a usar
- Las dos son complementarias: CLAUDE.md encaja con reglas estables útiles cada vez; Auto memory encaja con detalles de gran volumen necesarios solo para tareas particulares
- La herramienta de lectura/escritura de un archivo de memoria debe hacer una comprobación segura de límites de ruta; la condición combinada `abs === ROOT || abs.startsWith(ROOT + path.sep)` necesita ambas mitades, ya que una comprobación de `startsWith` sola tiene un agujero de sorteo por mismo prefijo

[>> Lección 4: Estado estructurado: cómo un agente recuerda en qué punto está una tarea](./04-structured-task-state.md)
