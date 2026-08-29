# Lección 3: Recuperación justo a tiempo: dejar que el agente busque su propio contexto

> Objetivos de aprendizaje:
> - Usar el presupuesto de atención para ponerle precio al costo oculto de la precarga, y decidir si un material dado pertenece al contexto inicial
> - Describir cómo funciona la recuperación justo a tiempo: identificadores ligeros, metadatos como señal, contexto relevante descubierto de forma progresiva mediante la exploración
> - Dibujar la estrategia híbrida de un agente concreto: qué se precarga y qué se queda atrás como identificador para traerlo en tiempo de ejecución
>
> Requisitos: Leíste las Lecciones 1 y 2, y tienes a mano el bucle del arnés del curso 7 de esta serie, «Fundamentos del arnés de agente: bucles y control» | Anterior: [Lección 2 <<](./02-anatomy-of-context.md) | Siguiente: [Lección 4 >>](./04-compaction-and-notes.md)

## Primero, resiste el impulso de meterlo todo

Digamos que estás construyendo un agente de preguntas y respuestas para una base de código: 200 archivos fuente en el repo, y los usuarios preguntan cosas como «dónde está definida esta función» o «qué se rompe si cambio esta configuración». La jugada obvia es leer los 200 archivos y pegarlos en el contexto inicial: las ventanas de contexto ahora son grandes, va a caber.

Cabe. Eso no quiere decir que corresponda. La Lección 1 cubrió por qué: los modelos analizan grandes volúmenes de contexto echando mano de un «presupuesto de atención», y "Every new token introduced depletes this budget by some amount."[^S1] (cada token nuevo que se introduce agota ese presupuesto en cierta medida). La aritmética solo empeora a medida que avanzas: "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases."[^S1] (a medida que aumenta el número de tokens en la ventana de contexto, disminuye la capacidad del modelo de recordar con precisión información de ese contexto). Lo que salva es que esto es una pendiente y no un escalón: "some models exhibit more gentle degradation than others, this characteristic emerges across all models," (aunque algunos modelos exhiben una degradación más suave que otros, esta característica emerge en todos los modelos) y juntos estos factores "create a performance gradient rather than a hard cliff."[^S1] (crean un gradiente de rendimiento en vez de un acantilado abrupto). Lo que trae de vuelta la conclusión de la Lección 1, que vale la pena repetir aquí: "context, therefore, must be treated as a finite resource with diminishing marginal returns."[^S1] (el contexto, por lo tanto, debe tratarse como un recurso finito con rendimientos marginales decrecientes).

De vuelta a esos 200 archivos. Un usuario hace una pregunta específica, y quizá dos o tres archivos son de verdad relevantes; los cien y pico mil tokens que cargan los otros 197 no son decorado inofensivo. Compiten por la atención con el contenido que importa, del mismo presupuesto. Peor todavía, el agente se ejecuta en un bucle, y "An agent running in a loop generates more and more data that could be relevant for the next turn of inference."[^S1] (un agente que se ejecuta en un bucle genera cada vez más datos que podrían ser relevantes para el siguiente turno de inferencia). Si el contexto inicial ya está lleno en siete octavos, el bucle choca contra el muro después de un puñado de turnos.

Así que la pregunta pasa a ser: ¿cuándo pones el material directamente frente al modelo, y cuándo simplemente le dices dónde vive el material y dejas que vaya a buscarlo? De eso trata esta lección entera.

## Las dos estrategias, lado a lado

Empecemos por enunciar cada una sin rodeos.

**Precarga**: antes de que empiece la inferencia, todo lo que pudiera necesitarse va al contexto inicial. El modelo lo ve todo en el turno uno y nunca tiene que recuperar nada.

**Recuperación justo a tiempo**: el contexto inicial no contiene material fuente, solo identificadores ligeros; el enfoque es "maintain lightweight identifiers (file paths, stored queries, web links, etc.)"[^S1] (mantener identificadores ligeros: rutas de archivo, consultas guardadas, enlaces web, etcétera) y dejar que el agente cargue el contenido mediante herramientas en tiempo de ejecución, según se necesite.

| | Precarga | Recuperación justo a tiempo |
| --- | --- | --- |
| Contexto inicial | Grande | Pequeño |
| Cuándo llega el material | Frente al modelo en el turno 1 | Cuesta primero de uno a varios turnos de llamada a herramientas |
| A dónde van los tokens | Sobre todo a «podría servir» | A «se necesita ahora mismo, seguro» |
| Modo de fallo típico | La atención se diluye; el contenido clave se ahoga | La recuperación divaga y gira en vacío, quemando turnos y presupuesto |

Piensa en cómo trabajas tú en realidad: no te memorizaste la base de código. Lo que llevas encima es «la lógica de autenticación vive en el directorio auth», «el parseo de configuración probablemente está en config.js»: un índice que apunta al contenido, y abres el archivo cuando necesitas el detalle. La recuperación justo a tiempo le entrega ese estilo de trabajo al agente.

Pero mira otra vez la última celda de esa tabla: la recuperación no es gratis. Cada búsqueda justo a tiempo es una ida y vuelta completa de llamada a herramienta: el modelo emite la llamada, el arnés la ejecuta, el resultado vuelve, el modelo razona de nuevo. En el curso 7 de esta serie, «Fundamentos del arnés de agente: bucles y control», le instalaste a tu arnés dos válvulas, máximo de turnos y tope de presupuesto; la recuperación gasta exactamente lo que gobiernan esas dos válvulas. Así que «siempre justo a tiempo» tampoco es la respuesta. Es una cuenta que hay que calcular, y el marco de disyuntivas que viene más adelante en esta lección hace la matemática.

## Cómo funciona en realidad la recuperación justo a tiempo

Tres cosas la hacen andar: un conjunto de identificadores (para que el modelo sepa qué existe y más o menos dónde), unas cuantas herramientas de recuperación y un bucle que permita varios turnos de exploración. Puestas juntas, esto "allows agents to incrementally discover relevant context through exploration."[^S1] (permite que los agentes descubran de forma incremental el contexto relevante mediante la exploración).

Esta es la parte que se subestima: **los metadatos de los identificadores son en sí mismos señal**. Los nombres de archivo y la estructura de directorios anuncian para qué sirve el contenido y qué tan relevante es probable que sea.[^S1] No hace falta que abras `tests/refund.test.js` para saber qué hay adentro; un directorio `legacy/` sin tocar hace dos años probablemente no sea el lugar por donde empezar. El artículo de Anthropic sobre su sistema de investigación multiagente pone la maniobra de fondo con nitidez: "The essence of search is compression: distilling insights from a vast corpus."[^S3] (la esencia de la búsqueda es la compresión: destilar hallazgos de un corpus enorme). Cada paso de la recuperación justo a tiempo —listar un directorio, buscar una palabra clave, elegir un archivo— realiza esa compresión, estrechando «una franja ancha de tal vez relevante» hasta «el pedacito que de verdad tengo que leer».

Bajemos al código. Dale a ese agente de preguntas y respuestas sobre la base de código tres herramientas; las tres implementaciones son cortas:

```javascript
import fs from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = "/path/to/your/repo"; // pon aquí tu propio repo

function list_files({ path = "." } = {}) {
  const full = join(REPO_ROOT, path);
  const entries = [];
  for (const name of fs.readdirSync(full).sort()) {
    if (fs.statSync(join(full, name)).isDirectory()) {
      entries.push(name + "/");
    } else {
      entries.push(name);
    }
  }
  return entries.join("\n");
}

function grep({ pattern, path = "." }) {
  const result = spawnSync("grep", ["-rn", pattern, path], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const lines = result.stdout.split("\n").filter((line) => line !== "");
  if (lines.length > 50) {
    return lines.slice(0, 50).join("\n") + `\n(${lines.length} líneas coincidentes en total, truncado)`;
  }
  return lines.join("\n") || "(sin coincidencias)";
}

function read_file({ path }) {
  const text = fs.readFileSync(join(REPO_ROOT, path), "utf8");
  const lines = text.replace(/\n$/, "").split("\n");
  if (lines.length > 400) {
    return lines.slice(0, 400).join("\n") + `\n(${lines.length} líneas en total, truncado)`;
  }
  return lines.join("\n");
}
```

Después escribe las definiciones de herramientas al estándar de la Lección 2: "self-contained," "extremely clear with respect to their intended use," con "minimal overlap in functionality":[^S1] (autocontenidas, extremadamente claras respecto de su uso previsto, con superposición mínima de funcionalidad).

```javascript
const TOOLS = [
  {
    name: "list_files",
    description:
      "Lista los archivos y subdirectorios bajo un directorio del repo; " +
      "los subdirectorios terminan en /. Úsala para entender la estructura " +
      "del código y decidir dónde mirar después.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Ruta relativa a la raíz del repo; omítela para listar la raíz",
        },
      },
    },
  },
  {
    name: "grep",
    description:
      "Busca texto de forma recursiva bajo un directorio y devuelve las líneas " +
      "coincidentes como archivo:línea:contenido, hasta 50 líneas. Úsala para " +
      "estrechar la búsqueda antes de leer cualquier archivo.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Cadena o regex que buscar" },
        path: { type: "string", description: "Alcance de la búsqueda, relativo a la raíz del repo" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "read_file",
    description:
      "Lee el contenido de un solo archivo; todo lo que pase de 400 líneas se trunca. " +
      "Úsala solo después de que list_files o grep hayan confirmado que el archivo es relevante.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Ruta de archivo relativa a la raíz del repo" },
      },
      required: ["path"],
    },
  },
];
```

El prompt del sistema lleva solo las partes estables: el trabajo, el requisito de citar, las convenciones de comportamiento para la recuperación. Fíjate en que no aparece ni una línea de contenido de archivo:

```javascript
const SYSTEM_PROMPT = `Eres el asistente de preguntas y respuestas de este repositorio de código.
Cada respuesta debe citar rutas de archivo y números de línea específicos.
Convención de recuperación: estrecha primero el alcance con list_files o grep, después
usa read_file; lee solo los archivos que de verdad necesites, de a uno por vez.`;
```

Conecta esto a un repo pequeño de comercio electrónico, pregunta «¿dónde se calcula el monto de reembolso del pedido?», y una ejecución típica se ve así. (El contenido del repo es ilustrativo; la forma de cada llamada y el formato de cada retorno los fijan las implementaciones de arriba. El cuerpo del archivo del turno 3 es demasiado largo para imprimirlo, así que lo reemplaza un paréntesis de una línea).

```
Turno 1  list_files({ path: "." })
      →  README.md
         src/
         tests/
Turno 2  grep({ pattern: "Refund", path: "src" })
      →  src/payments/refund.js:12:export function calculateRefundAmount(order, policy) {
         src/orders/service.js:6:import { calculateRefundAmount } from "../payments/refund.js";
         src/orders/service.js:88:  const amount = calculateRefundAmount(order, policy);
Turno 3  read_file({ path: "src/payments/refund.js" })
      →  (60 líneas en este archivo; devuelto completo)
Turno 4  El modelo deja de llamar herramientas y responde directamente:
         «El monto de reembolso se calcula en calculateRefundAmount en
         src/payments/refund.js:12; el módulo de pedidos lo llama desde
         src/orders/service.js:88.»
```

Mira lo que pasó entre los turnos 2 y 3. Grep devolvió tres líneas coincidentes, y el modelo no leyó los dos archivos. Del contenido de las líneas dedujo que la definición está en `refund.js` mientras que `service.js` es apenas quien la importa y la llama, así que abrió exactamente un archivo. Eso son los metadatos haciéndole al modelo su primera pasada de filtrado: "the metadata of these references provides a mechanism to efficiently refine behavior."[^S1] (los metadatos de estas referencias proveen un mecanismo para refinar el comportamiento de manera eficiente). A lo largo de toda la trayectoria, lo que entró al contexto fue un listado de directorio, tres líneas de salida de grep y un archivo de 60 líneas, no 200 archivos.

Hay dos detalles más que premian una segunda mirada. El primero es el truncado incorporado en dos de las implementaciones: grep devuelve como máximo 50 líneas, read_file como máximo 400. La Lección 2 señaló que las herramientas deberían estar "returning information that is token efficient"[^S1] (devolviendo información que sea eficiente en tokens): las herramientas de recuperación son las proveedoras del contexto, y el bucle solo sobrevive si las proveedoras le ponen tope a sus envíos. El segundo es el caso de fallo: si grep sigue saliendo vacío, el modelo puede buscar una y otra vez con palabras clave distintas. Ese es precisamente el escenario que la detección de giro en vacío y la válvula de presupuesto del curso del arnés existen para atrapar: explorar es bueno, explorar sin límite no.

## Lo híbrido es el caso normal

Podrías esperar que la conclusión sea «gana la recuperación justo a tiempo». No lo es. Los sistemas reales rara vez se sientan en alguno de los dos polos; la forma común es un híbrido: "retrieving some data up front for speed, and pursuing further autonomous exploration at its discretion."[^S1] (recuperar algunos datos por adelantado por velocidad, y llevar adelante más exploración autónoma a discreción).

Claude Code, que usas todos los días, es un ejemplo vivo: "CLAUDE.md files are naively dropped into context up front, while primitives like glob and grep" (los archivos CLAUDE.md se sueltan sin más en el contexto por adelantado, mientras que primitivas como glob y grep) sostienen la exploración justo a tiempo en tiempo de ejecución.[^S1] La documentación oficial lo describe con llaneza: "CLAUDE.md is a special file that Claude reads at the start of every conversation."[^S4] (CLAUDE.md es un archivo especial que Claude lee al inicio de cada conversación). Como se carga absolutamente cada vez, la documentación aconseja guardar ahí solo material que aplique de forma amplia y preguntarse de cada línea: "Would removing this cause Claude to make mistakes?"[^S4] («¿quitar esto haría que Claude cometa errores?»). Si la respuesta es no, esa línea debería irse. La documentación pone la consecuencia sin rodeos: "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"[^S4] (¡los archivos CLAUDE.md inflados hacen que Claude ignore tus instrucciones reales!).

Las Skills toman una tercera vía: "Claude loads them on demand without bloating every conversation."[^S4] (Claude las carga bajo demanda sin inflar cada conversación). Pon esas tres en fila y te queda un retrato en niveles de una estrategia híbrida:

- **CLAUDE.md**: estable, vinculante en cada turno → precargado al inicio;
- **Skills**: capacidad especializada empaquetada, usada solo para tareas específicas → cargadas bajo demanda;
- **La base de código en sí**: enorme, y cada vez solo se necesita una astilla → explorada justo a tiempo mediante glob y grep.

Cuando diseñas tu propio agente, estás dibujando una versión de ese mismo retrato: qué material se sienta en «la ranura de CLAUDE.md» y cuál en «la ranura de la base de código».

```agentmentor-check
{
  "id": "ctx-zh-03-strategy-tradeoff",
  "label": "Elegir una estrategia de contexto para un agente de preguntas y respuestas sobre una base de código usando el presupuesto de atención y el descubrimiento progresivo",
  "prompt": "Estás construyendo un agente de preguntas y respuestas sobre un repo con 200 archivos fuente. El colega A dice: «la ventana de contexto lo aguanta, así que lee los 200 archivos al contexto inicial: lo que el modelo necesite va a estar justo ahí». El colega B dice: «no metas ni un archivo. Dale el árbol de archivos y una herramienta grep, y deja que encuentre todo sobre la marcha». Según el razonamiento de esta lección, ¿qué juicio se sostiene mejor?",
  "whyHere": "La sección de estrategia híbrida acaba de aterrizar, y quien lee necesita sostener los dos bordes a la vez: refutar la precarga total con el presupuesto de atención, y refutar el justo a tiempo puro con el costo de la recuperación, en vez de cambiar un extremo por el otro.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A tiene razón: con todo ya frente al modelo, nunca tiene que salir a buscar, así que la calidad de las respuestas queda mejor protegida.",
      "correct": false,
      "feedback": "«Cabe» no es «corresponde». Cada token nuevo agota el presupuesto de atención, y cuanto más largo el contexto, peor se pone el recuerdo preciso del modelo desde ahí. De 200 archivos, en general solo unos pocos inciden en cualquier pregunta concreta; el resto de esos tokens diluye la atención en vez de proteger nada."
    },
    {
      "id": "b",
      "text": "B tiene razón: cuanto más pequeño el contexto inicial, mejor, y cada pieza de información debería esperar hasta que se necesite y recién ahí recuperarse.",
      "correct": false,
      "feedback": "La mitad de la dirección es correcta, pero esto trata la recuperación como si fuera gratis. Cada búsqueda es una ida y vuelta de llamada a herramienta que cuesta latencia, tokens y el presupuesto de turnos del arnés. El material pequeño y de cada turno, como las convenciones de comportamiento o la forma del directorio de primer nivel, se vuelve más caro, no más barato, si el modelo tiene que redescubrirlo en cada sesión."
    },
    {
      "id": "c",
      "text": "Los dos se fueron a un extremo: precarga el material pequeño y estable que se necesita en cada turno, y deja identificadores para el resto, de modo que el modelo recupere bajo demanda.",
      "correct": true,
      "feedback": "Esa es exactamente la disyuntiva híbrida: la precarga compra velocidad, la recuperación ahorra presupuesto. Las convenciones de comportamiento y el mapa del directorio de primer nivel son lo bastante pequeños y estables para sentarse en el contexto inicial; los 200 archivos dejan solo sus rutas como identificadores, y el modelo estrecha usando nombres de archivo y resultados de grep. Los dos costos quedan acotados."
    }
  ]
}
```

## Un marco de disyuntivas que puedes aplicar de inmediato

Para cada material candidato, hazte dos preguntas:

1. **¿Es estable?** ¿El contenido se queda quieto con el tiempo, independiente de cualquier pregunta en particular?
2. **¿Se usa en cada turno, o casi en cada turno?**

Dos síes → **precargar**. Casos típicos: estándares de codificación, restricciones centrales del negocio, las reglas de conducta del agente, la estructura del directorio de primer nivel. Un material así suele ser pequeño también: si algo anunciado como «se necesita en cada turno» resulta ser enorme, empieza por dudar de que de verdad se necesite en cada turno.

Cualquier no → **dejar un identificador y recuperar justo a tiempo**. Casos típicos: el código fuente completo de un módulo (necesario solo para preguntas sobre ese módulo), tickets históricos (consultados solo al perseguir un fallo específico), un documento de diseño largo (abierto solo al alinear un enfoque).

Después pon el costo de la recuperación en la balanza y revisa el resultado una vez más: cada búsqueda agrega una ida y vuelta, agrega latencia, gasta presupuesto. Así que no empujes con terquedad hacia la recuperación un material pequeño y de uso frecuente: cambiar 600 palabras de espacio de precarga por un turno extra de `list_files` en cada sesión es un mal negocio. En el sentido contrario, precargar un script de 2000 líneas que probablemente ni salga a colación es puro quemar presupuesto de atención.[^S1]

La documentación de Claude Code pone lo que está en juego en una línea: "The context window is the most important resource to manage."[^S4] (la ventana de contexto es el recurso más importante que hay que gestionar). La precarga y la recuperación justo a tiempo no son doctrinas rivales. Son las dos manos con las que gestionas ese recurso.

## Esta lección se salta RAG, a propósito

Di «recuperación» y mucha gente salta directo a bases vectoriales, embeddings, pipelines de RAG. Esta lección deliberadamente no toca nada de eso: el README del curso traza la frontera, y «recuperación justo a tiempo» aquí quiere decir algo más llano: un agente que tiene herramientas de sistema de archivos y de búsqueda, y trae contenido bajo demanda.

Eso no es pereza pedagógica. Las rutas de archivo vienen con jerarquía y semántica de nombres de regalo, los resultados de grep son precisos y explicables, y el par ya alcanza para sostener un bucle completo de descubrir de forma incremental el contexto relevante mediante la exploración.[^S1] La guía de Anthropic sobre construir agentes ofrece un sentido de la proporción que hace juego: "you should consider adding complexity only when it demonstrably improves outcomes."[^S2] (habría que considerar añadir complejidad solo cuando mejora demostrablemente los resultados). Fíjate en el verbo: *considerar*. Es una postura de sopesar, no una prohibición. Para un agente de preguntas y respuestas sobre una base de código, recorrer el camino más simple (sistema de archivos más grep) hasta poder medir dónde se queda corto encaja mejor con esa postura que levantar recuperación vectorial el primer día.

Un hilo que dejamos colgando: por más disciplinada que sea tu recuperación justo a tiempo, un agente moliendo una tarea larga sigue acumulando resultados de herramientas turno tras turno,[^S1] y la ventana de contexto se arrastra hacia su techo igual. En ese punto, ser bueno para «tomar menos» deja de alcanzar: también hay que ser bueno para tirar cosas y para anotar cosas. Eso es la Lección 4.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Ordenar un inventario de contexto

Estás diseñando el contexto de un agente interno de preguntas y respuestas para operaciones de guardia, y hay cinco materiales candidatos sobre la mesa:

1. El manual de guardia (unas 500 palabras: las líneas duras que toda respuesta debe respetar, como nunca entregar contraseñas de bases de datos de producción);
2. Los 800 tickets históricos de incidentes (cada uno de unos cientos a unos miles de palabras);
3. La estructura de primer nivel del catálogo de servicios (40 nombres de servicio más una línea de responsabilidad cada uno, unas 600 palabras);
4. El script de despliegue completo de un servicio (unas 2000 líneas, relevante solo para preguntas de despliegue);
5. Una tabla de correspondencia de palabras clave de alerta comunes a consultas de búsqueda de tickets (unas 30 líneas).

Con el marco de esta lección, ordena cada elemento en «precargar» o «dejar un identificador, recuperar justo a tiempo», y da una razón de una línea para cada uno.

<!-- rubric -->
- Pone los materiales pequeños y que vale la pena tener residentes (1, 3, 5) en precarga, con razones que aterrizan en «pequeño, reutilizado a menudo, o él mismo un punto de entrada a la recuperación»
- Pone los materiales grandes y específicos de una rama (2, 4) en recuperación justo a tiempo, y señala que precargarlos gasta presupuesto de atención en contenido que en su mayoría queda sin usar
- Al menos en un lugar menciona la precondición de la recuperación justo a tiempo: el agente necesita un punto de entrada usable, una herramienta de búsqueda, una correspondencia de consultas, o rutas de archivo como identificadores

<!-- answer -->
1. **Manual de guardia → precargar**. Las líneas duras obligan absolutamente a cada respuesta, y 500 palabras es minúsculo. Las dos preguntas dan que sí.
2. **800 tickets → dejar un identificador**. Demasiado grande por lejos, y solo un puñado importa cuando persigues un fallo específico; precargarlos todos gasta presupuesto de atención en contenido que probablemente nunca salga a colación. Dale al agente una herramienta de «buscar tickets por palabra clave» como punto de entrada y deja que traiga los que necesite.
3. **Estructura de primer nivel del catálogo de servicios → precargar**. Un mapa de primer nivel de 600 palabras en el que casi toda pregunta se apoya para deducir qué servicio investigar: el caso clásico de pequeño y frecuente.
4. **Script de despliegue de 2000 líneas → dejar un identificador**. Solo las preguntas de despliegue lo necesitan; conserva a mano la ruta del script y tráelo con una herramienta de lectura de archivos cuando aparezca una pregunta relevante.
5. **Tabla de correspondencia de alertas → precargar**. Treinta líneas es diminuto, y la tabla es ella misma el metadato de entrada para la recuperación justo a tiempo: le dice al modelo con qué consulta buscar tickets para una clase dada de alerta. Precargarla es lo que hace funcionar la recuperación del elemento 2.

<!-- hint -->
Hazle primero las dos preguntas a cada material: ¿es estable, y se usa en cada turno? Solo dos síes ponen la precarga sobre la mesa.

<!-- hint -->
Los materiales grandes no se tiran; el trabajo es decidir qué «punto de entrada» le dejas al agente. Rutas, consultas y tablas de correspondencia cuentan todas como identificadores ligeros.

### Nivel 2: Agregar herramientas de recuperación a tu arnés

Saca el bucle del arnés que escribiste en el curso 7 de esta serie, «Fundamentos del arnés de agente: bucles y control», registra las tres herramientas de esta lección (list_files, grep, read_file), apúntalas a un repositorio real tuyo y conviértelo en un agente de preguntas y respuestas. Requisitos:

- El prompt del sistema precarga solo información estable —trabajo, requisito de citar, convenciones de recuperación— y ningún contenido de archivo;
- Las tres descripciones de herramientas son autocontenidas y no se superponen, y sus retornos están truncados;
- Ejecuta una pregunta real, registra la trayectoria de llamadas a herramientas y revisa si muestra descubrimiento progresivo de lo grueso a lo fino.

<!-- rubric -->
- El prompt del sistema se mantiene como un conjunto pequeño y estable (trabajo + requisito de citar + convención de recuperación), sin contenido de archivo precargado
- Las tres descripciones de herramientas son autocontenidas, de propósito claro y sin superposición; grep y read_file truncan sus retornos por conteo de líneas
- La trayectoria entregada muestra el orden «estrechar primero con list_files/grep, después read_file sobre un número pequeño de archivos», e identifica qué paso se apoyó en metadatos como un nombre de archivo o la estructura de directorios

<!-- answer -->
Un enfoque de referencia (puntos clave más esqueleto):

1. Toma las funciones de herramienta y la definición de `TOOLS` directamente de la sección «Cómo funciona en realidad la recuperación justo a tiempo» de esta lección y cambia `REPO_ROOT` por la ruta de tu repo; deja en paz los truncados de 50 líneas de grep y 400 de read_file.
2. Copia el `SYSTEM_PROMPT` del texto principal tal cual: contiene solo tres cosas, el trabajo, el requisito de citar y la convención de recuperación, sin contenido de archivo.
3. Regístralas con el arnés: en el punto de despacho de herramientas de tu bucle del curso 7, encamina cada llamada a la función correspondiente por nombre de herramienta:

```javascript
const HANDLERS = { list_files, grep, read_file };

// donde el bucle del arnés maneja tool_use:
const result = HANDLERS[toolName](toolInput);
```

4. Una trayectoria que aprueba (toma «de dónde se carga la configuración» como pregunta) debería verse así: `list_files({ path: "." })` revela `config/` o `src/` → `grep({ pattern: "loadConfig", path: "src" })` encuentra la definición y los sitios de llamada → `read_file` abre solo el archivo que tiene la definición → respuesta, con ruta y número de línea. Dos autoevaluaciones: el estrechamiento ocurrió antes de leer archivo alguno, y al menos un paso lo guio un directorio o un nombre de archivo (metadatos) en vez de leer archivos candidatos uno tras otro.

<!-- hint -->
Las tres implementaciones están en el texto principal. Cambia `REPO_ROOT` y se conectan a tu arnés, sin necesidad de reescribir nada.

<!-- hint -->
Si el agente abre con read_file sobre un archivo grande, vuelve atrás y aprieta la convención de recuperación en el prompt del sistema, o enuncia en la descripción de herramienta de read_file que es para usarse solo después de que grep o list_files hayan confirmado la relevancia.

<!-- /exercises -->

## Resumen

- «Cabe» no es una razón para precargar: cada token nuevo agota el presupuesto de atención, y a medida que crece el conteo de tokens declina el recuerdo preciso del modelo desde el contexto, un gradiente de rendimiento en vez de un acantilado abrupto; el contexto hay que gestionarlo como un recurso finito con rendimientos marginales decrecientes[^S1]
- Cómo funciona la recuperación justo a tiempo: el contexto conserva solo identificadores ligeros (rutas de archivo, consultas guardadas, enlaces web), y las herramientas cargan el contenido bajo demanda en tiempo de ejecución; los metadatos de los identificadores —nombres de archivo, estructura de directorios— señalan relevancia por sí solos, lo que permite que los agentes descubran de forma incremental el contexto relevante mediante la exploración[^S1]
- La recuperación no es gratis: cada búsqueda es una ida y vuelta de llamada a herramienta, que gasta latencia más los turnos y el presupuesto que gobiernan las válvulas de control del curso del arnés
- Lo híbrido es el caso normal: recuperar algunos datos por adelantado por velocidad, y dejar que el modelo lleve adelante más exploración autónoma a discreción[^S1]. Claude Code es la referencia servida: CLAUDE.md soltado entero al inicio, las Skills cargadas bajo demanda, la base de código explorada sobre la marcha mediante glob y grep[^S1][^S4]
- El marco son dos preguntas: ¿estable? ¿se necesita en cada turno? Dos síes quieren decir precargar, si no, dejar un identificador; no fuerces a la recuperación el material pequeño y frecuente, ni fuerces a la precarga el material grande y raro
- «Recuperación justo a tiempo» en esta lección quiere decir traer bajo demanda mediante herramientas de sistema de archivos y de búsqueda, sin base vectorial de por medio; antes de traer maquinaria de recuperación más pesada, ten presente ese sentido de la proporción: considera añadir complejidad solo cuando mejora demostrablemente los resultados[^S2]

[>> Lección 4: Compactación y notas: gestión de contexto para tareas largas](./04-compaction-and-notes.md)
