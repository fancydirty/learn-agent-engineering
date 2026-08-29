# Lección 1: De «solo hablar» a «actuar»: por qué los agentes necesitan herramientas

> Objetivos de aprendizaje:
> - Decir qué es realmente una «herramienta» dentro de un Agente, y en qué se diferencia de un bloque de texto de respuesta corriente
> - Reconocer las tres cosas que una definición de herramienta debe incluir como mínimo
> - Decidir si una tarea concreta necesita realmente una herramienta
>
> Requisitos: Sabes escribir un prompt básico y has usado algo como Claude Code | Siguiente: [Lección 2 >>](./02-one-tool-call-round-trip.md)

## La misma frase, preguntada dos veces

Estás en un proyecto con unas cuantas decenas de archivos y le dices esto a un Agente:

> «Encuentra todos los console.log del proyecto.»

**La primera vez, este Agente es solo un cuadro de chat conectado a una API, sin ninguna herramienta conectada.** Su respuesta se lee así:

> No puedo acceder directamente a tu sistema de archivos, pero puedes ejecutar el siguiente comando en tu terminal para encontrarlos:
>
> ```
> grep -rn "console.log" src/
> ```
>
> Esto busca recursivamente en todos los archivos bajo `src/` las líneas que contienen `console.log` e imprime el nombre del archivo y el número de línea. Si tu proyecto usa TypeScript, recuerda incluir `.ts`/`.tsx` en el alcance de la búsqueda.

Nada malo con eso — hasta es considerado. Pero no pediste instrucciones sobre cómo buscar, pediste los resultados. Cuando este turno termina, sigues sin saber qué archivos de tu proyecto contienen realmente `console.log`. Tienes que ir a abrir una terminal y escribir ese comando tú mismo.

**La segunda vez, la misma frase, entregada a un Agente con una herramienta de búsqueda conectada.** Su respuesta se lee así:

> Busqué en el proyecto y encontré 7 apariciones de `console.log`:
>
> - `src/api/client.ts:42`
> - `src/api/client.ts:88`
> - `src/utils/logger.ts:12`
> - `src/components/Cart.tsx:156`
> - `src/components/Checkout.tsx:23`
> - `src/hooks/useAuth.ts:67`
> - `scripts/seed-db.js:5`
>
> El de `src/utils/logger.ts:12` parece un wrapper de logging intencional; los otros 6 parecen restos de depuración. ¿Quieres que los limpie?

Las dos veces la pregunta fue palabra por palabra la misma. El mismo modelo, el mismo prompt. Una sola cosa fue diferente: la segunda vez, este Agente tenía una cosa más en la mano: una **herramienta**. La primera vez solo podía adivinar, a partir del conocimiento que vio en el entrenamiento, un comando que «probablemente sirve» y describírtelo. La segunda vez ejecutó de verdad una búsqueda, vio lo que hay en tu proyecto ahora mismo, y solo entonces habló.

Lo que esta lección deja claro es exactamente eso: qué es una herramienta, qué es lo que convierte a un Agente de «explicar un enfoque» a «ejecutar de verdad la búsqueda», y qué tareas no necesitan ninguna.

## Una herramienta es un menú que el host le entrega al modelo

Primero, corrige un instinto: lo que encontró esos 7 archivos no fue el modelo. El modelo no tiene sistema de archivos; no puede abrir un directorio ni ejecutar una coincidencia de expresión regular por su cuenta. Lo que realmente ejecutó esa búsqueda fue el **programa host** que ejecuta el Agente: quizá Claude Code, quizá un script de unas decenas de líneas que escribiste tú y que llama a la API de Claude.

**Una herramienta es la lista del programa host que le dice al modelo «esto es lo que puedo hacer por ti».** Cada elemento detalla tres cosas: cómo se llama la capacidad, cuándo usarla y qué parámetros pasar. [^S3]

Toma esa búsqueda. La lista de herramientas que el host mete en la petición se ve más o menos así:

```json
{
  "name": "search_files",
  "description": "Busca en el directorio de código fuente del proyecto todos los archivos que coincidan con una cadena o expresión regular, devolviendo la ruta del archivo y el número de línea de cada coincidencia. Úsala para encontrar llamadas a funciones concretas, nombres de variables, comentarios TODO y similares.",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "description": "La cadena o expresión regular a buscar, p. ej. console\\.log"
      },
      "path": {
        "type": "string",
        "description": "El directorio desde el que empezar a buscar; por defecto, la raíz del proyecto"
      }
    },
    "required": ["pattern"]
  }
}
```

Cada uno de los tres campos tiene su propia función: `name` es el identificador que el modelo escribe cuando elige esta herramienta; `description` es un bloque de texto que le dice al modelo qué hace la herramienta, cuándo debería usarse y cómo se comporta; `input_schema` es un JSON Schema que detalla qué parámetros pasar en una llamada y de qué tipo es cada uno. [^S3]

El modelo nunca ha visto tu sistema de archivos, pero sí ha visto esta lista. Lee en la `description` que esta herramienta «busca en el directorio de código fuente del proyecto... devuelve la ruta del archivo y el número de línea», ve tu petición «encuentra todos los console.log del proyecto», alinea las dos y decide elegir esta herramienta y pasar `pattern` igual a `console\.log`. Este paso es trabajo del modelo — elegir la herramienta, rellenar los parámetros — que es en lo que un modelo de lenguaje es mejor: leer la intención y emparejarla con la opción correcta.

Pero ¿una vez que la ha elegido? ¿Quién va realmente a leer los archivos?

## El modelo solo propone; el host hace el trabajo

Aquí va una frase, la más importante de esta lección: **el modelo nunca ejecuta nada por sí mismo. Solo empaqueta «qué herramienta quiero llamar y qué parámetros pasar» en un fragmento de datos estructurados y se lo devuelve al programa host; el código que realmente abre archivos, ejecuta comandos y envía peticiones es del propio programa host.** [^S4]

Para esa búsqueda, la secuencia completa es así:

1. El modelo ve tu pregunta y la lista de herramientas con `search_files`, y decide llamarla con `{"pattern": "console\\.log"}`. Envuelve esa decisión como el contenido de la respuesta de este turno — fíjate en que no hay resultados de búsqueda en la respuesta, porque el modelo no tiene resultados de búsqueda; solo hizo una petición.
2. El programa host (Claude Code, o el script que escribiste) recibe esos datos, ve que «esto es una llamada a herramienta» y va a ejecutarla él mismo — ejecuta realmente la búsqueda en disco y obtiene esas 7 coincidencias.
3. El programa host vuelve a poner los resultados de la búsqueda en el historial de la conversación y le pregunta al modelo una vez más: «aquí está el resultado de esa llamada, sigue».
4. Solo ahora el modelo ve por primera vez los resultados reales de la búsqueda, y a partir de ellos escribe la respuesta que viste.

La documentación de OpenAI llama a esto "a multi-step conversation between your application and a model" (una conversación de varios pasos entre tu aplicación y un modelo): cuando el modelo llama a una función, la responsabilidad de ejecutarla y devolver el resultado recae en el lado de tu aplicación, no en el del modelo. [^S1] Anthropic lo dice más sin rodeos: "The model never executes anything on its own. It emits a structured request, your code (or Anthropic's servers) runs the operation, and the result flows back into the conversation." (El modelo nunca ejecuta nada por su cuenta. Emite una petición estructurada, tu código —o los servidores de Anthropic— ejecuta la operación, y el resultado vuelve a la conversación.) [^S4]

Vale la pena añadir: «quién ejecuta» se divide una capa más. La documentación llama «client tools» a las herramientas que tu propio programa tiene que ejecutar, y «server tools» a las que los servidores de Anthropic ejecutan por ti (la búsqueda web, por ejemplo). [^S2] En cualquier caso, el comportamiento del lado del modelo no cambia — sigue solo proponiendo, nunca actuando; la única diferencia es quién convierte la propuesta en una acción real.

Claude Code, que estás usando, lo hace concreto: es exactamente este tipo de programa host, con un conjunto de herramientas integrado — leer un archivo, escribir un archivo, ejecutar un comando de terminal, buscar código, etc. Cada vez que el modelo decide cuál usar, está eligiendo de esta lista fija, no inventando una capacidad nueva de la nada. [^S6] De dónde sale esta lista y qué aspecto tiene cada elemento lo veremos uno por uno en la Lección 3.

```agentmentor-check
{
  "id": "tool-zh-01-who-runs-it",
  "label": "Quién ejecutó realmente esa búsqueda",
  "prompt": "Volvamos al ejemplo de console.log del principio. En la segunda respuesta, el Agente dice «Busqué en el proyecto y encontré 7 apariciones». Detrás de esa frase, ¿quién realizó la «búsqueda»?",
  "whyHere": "Acabas de trazar la línea entre «el modelo solo propone, el host ejecuta», y la respuesta del Agente está escrita en primera persona, lo que hace fácil suponer que el modelo leyó los archivos él mismo. Este es el momento de romper esa idea equivocada con exactamente el mismo ejemplo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "El modelo leyó él mismo los archivos del proyecto y ejecutó la búsqueda",
      "correct": false,
      "feedback": "El modelo no tiene sistema de archivos; no puede abrir un directorio ni ejecutar una coincidencia de expresión regular por su cuenta. Todo lo que hizo fue decidir llamar a la herramienta search_files y rellenar pattern como console\\.log, y esa decisión se empaquetó en datos estructurados y se devolvió al programa host. «Busqué» es una formulación que el modelo produjo después de ver los resultados: no significa que el modelo hiciera la búsqueda."
    },
    {
      "id": "b",
      "text": "El programa host ejecutó la búsqueda, devolvió los resultados al modelo, y solo entonces el modelo escribió esa respuesta",
      "correct": true,
      "feedback": "Correcto. El modelo solo hizo la petición «llama a search_files, pattern es console\\.log»; el programa host (Claude Code, o el script que llama a la API) es lo que realmente abrió el sistema de archivos y ejecutó la coincidencia. Una vez que el host puso las 7 coincidencias de vuelta en la conversación, el modelo las vio por primera vez y escribió a partir de ellas la respuesta final."
    },
    {
      "id": "c",
      "text": "Las dos veces lo hizo el modelo mismo; la segunda vez simplemente respondió de una forma más inteligente",
      "correct": false,
      "feedback": "Los dos turnos usaron el mismo modelo, y su capacidad propia no cambió. La diferencia es que la segunda vez tenía una herramienta, lo que permitió que el programa host fuera a tocar por él el contenido real de tu proyecto. Eso no es que el modelo se vuelva más inteligente: es que el modelo gana un canal para obtener información externa y realizar acciones externas."
    }
  ]
}
```

## No todas las tareas necesitan una herramienta

Después de ver ese proceso, es fácil irse al otro extremo: ya que las herramientas son tan útiles, ¿por qué no darle al Agente una herramienta para todo? No lo hagas. La prueba es simple — hazte una pregunta: **¿tiene el modelo ya en la mano la información o la acción que esta tarea necesita?**

Algunas tareas el modelo las puede resolver solo, sin ningún contacto con el mundo exterior:

- Reescribir un párrafo para que sea más conciso
- Resumir un conjunto de notas de reunión
- Traducir un fragmento de Python a JavaScript con la misma lógica
- Escribir código nuevo directamente a partir de un requisito que describes (antes de que toque ningún archivo existente de tu proyecto)

Del conocimiento en el que estas se apoyan, el modelo vio muchos ejemplos parecidos durante el entrenamiento; la sola capacidad lingüística basta para terminarlas. Fuerza una herramienta en este tipo de tarea y el modelo todavía tiene que decidir, cada vez, «¿la llamo o no en esta ronda?»: una decisión más es una oportunidad más de equivocarse. Puro desperdicio.

Otras tareas el modelo no las puede hacer por muy listo que sea, porque lo que le falta no es capacidad: es **información**:

- «Cuántos console.log hay en mi proyecto ahora mismo»: el conocimiento del modelo se detiene en el momento de su entrenamiento; no sabe nada del contenido de los archivos de tu disco en este instante
- «Qué acaba de imprimir ese comando»: el comando no se ha ejecutado, la salida todavía no existe, y el modelo no puede saberla de antemano
- «Qué devuelve este endpoint ahora mismo»: esa es la respuesta que el servidor da en este momento, sin relación con ningún ejemplo que el modelo viera en el entrenamiento

Para este tipo de tarea, por muy detallado o sugerente que hagas el prompt, el modelo no puede conjurar una respuesta real, porque simplemente no tiene los datos en la mano. La única vía es darle un canal para que el programa host vaya a buscarlos — y esa es la razón por la que existen las herramientas.

Qué aspecto tienen esos cinco tipos de herramientas — leer, escribir, ejecutar comandos, buscar, llamar a servicios externos — lo desmontaremos uno por uno en la Lección 3; para esta lección, todo lo que necesitas retener es cómo hacer la pregunta «¿esto necesita una herramienta?».

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Clasifica seis tareas

A continuación hay seis tareas. Para cada una, decide si el Agente necesita una herramienta para llevarla a cabo de verdad, y explica por qué (pista: pregúntate «¿tiene el modelo esta información en la mano?»).

1. «Traduce este correo en inglés al chino, y mantén el tono cortés.»
2. «Comprueba si los logs del despliegue de anoche a las 3 de la madrugada tienen algún error.»
3. «Escribe una expresión regular que valide el formato de un email.»
4. «Comprueba de qué versión de React depende este repositorio en su `package.json`.»
5. «Divide este documento de requisitos en 5 criterios de aceptación.»
6. «Llama a la API del clima y mira si mañana lloverá en Pekín.»

<!-- rubric -->
- Las seis tareas reciben un veredicto claro de «necesita» o «no necesita»
- Cada veredicto viene acompañado de una razón, no solo del dictamen
- En los casos de «necesita», queda claro qué información o capacidad de acción le falta al modelo

<!-- answer -->
1. No necesita. Traducir y ajustar el tono es pura capacidad lingüística; el modelo ya tiene todo lo necesario para hacerlo.
2. Necesita. El contenido del archivo de log son datos reales de este momento, que el modelo no pudo haber visto en el entrenamiento; tiene que leerlos con una herramienta.
3. No necesita. Escribir una regex es una tarea de lenguaje / generación de código de la que el modelo ha visto muchos ejemplos; no interviene ningún estado externo actual.
4. Necesita. El número de versión exacto escrito ahora mismo en `package.json` es el contenido real de tu proyecto en este instante; el modelo tiene que leer el archivo con una herramienta para saberlo.
5. No necesita. Esto es una reescritura estructurada de contenido ya dado; la información en manos del modelo ya es suficiente.
6. Necesita. Los datos del clima son un estado del mundo real en este momento, y hace falta una petición de red real para obtenerlos; el modelo no puede generarlos de la nada.

<!-- hint -->
Cuando una pregunta contiene palabras que apuntan a un momento concreto — «ahora», «acaba de», «esta vez», «anoche» — normalmente significa que lo que se busca es el estado real de ahora mismo, no el conocimiento general que el modelo vio en el entrenamiento.

<!-- hint -->
A la inversa, si la tarea es solo «convertir A en B» (reescribir, traducir, resumir, generar contenido nuevo a partir de una descripción) y A ya está completamente escrito en lo que dijiste, normalmente no hace falta una herramienta: la materia prima en manos del modelo basta para terminar por sí solo.

### Nivel 2: Redacta una definición de herramienta

La tarea es: «que el Agente consulte en npmjs.com el número de la última versión publicada de un paquete npm». Siguiendo la forma en que está escrita la definición de la herramienta `search_files` en esta lección, redacta una definición de herramienta para esta capacidad, con al menos los tres campos `name`, `description` e `input_schema`. No tienes que producir un JSON Schema válido y ejecutable: basta con pensar bien los tres campos y acertar con el formato aproximado.

<!-- rubric -->
- `name` es un identificador cuyo propósito se lee con claridad (no algo sin sentido como «tool1»)
- `description` deja claro qué hace la herramienta y cuándo debería usarse
- `input_schema` define al menos un parámetro obligatorio (el nombre del paquete, por ejemplo), con el tipo y el propósito del parámetro detallados

<!-- answer -->
Respuesta de ejemplo:

```json
{
  "name": "get_npm_package_version",
  "description": "Consulta el número de la última versión publicada actualmente en npmjs.com para un paquete npm dado. Úsala para confirmar si hay disponible una versión más nueva de una dependencia, o para verificar que un número de versión dado existe realmente.",
  "input_schema": {
    "type": "object",
    "properties": {
      "package_name": {
        "type": "string",
        "description": "El nombre del paquete npm a consultar, p. ej. react o lodash"
      }
    },
    "required": ["package_name"]
  }
}
```

<!-- hint -->
La media frase que más fácilmente se cae de `description` es «cuándo usarla»: solo «consulta un número de versión» es demasiado vago; es mejor añadir un caso de uso típico para que el modelo pueda juzgar si elegirla esta vez.

<!-- hint -->
En `input_schema` el nombre del paquete tiene que ser un parámetro obligatorio (ponlo en el array `required`), porque sin nombre de paquete la herramienta no puede ejecutarse en absoluto; si además quieres un parámetro opcional (una dirección de registry, por ejemplo), recuerda no meterlo también en `required`.

<!-- /exercises -->

## Resumen

- **Una herramienta es una lista de capacidades invocables que el programa host expone al modelo**, cada una detallando al menos `name`, `description` e `input_schema`, que el modelo usa para juzgar si llamarla y qué pasarle. [^S3]
- **El modelo solo propone; nunca ejecuta él mismo.** Empaqueta «qué herramienta llamar, qué parámetros pasar» en datos estructurados y se lo devuelve al programa host; el código que realmente abre archivos, ejecuta comandos y envía peticiones es del propio programa host. [^S1][^S4]
- El resultado requiere una ida y vuelta: después de que el host termina de ejecutar, vuelve a poner el resultado en la conversación, y solo entonces el modelo ve el resultado real y escribe la respuesta final — la ida y vuelta completa de ese paso es el tema de la próxima lección.
- Para decidir si una tarea necesita una herramienta, basta una pregunta: **¿tiene el modelo ya en la mano la información o la acción que esta tarea necesita?** Si no, necesitas una herramienta; si sí, añadir una es un desperdicio.
- La misma pregunta, con o sin herramienta, puede producir resultados radicalmente distintos: sin herramienta el Agente solo puede apoyarse en el conocimiento general del entrenamiento para explicarte un enfoque; con una puede tocar de verdad cómo se ve tu proyecto ahora mismo.

[Lección 2: La ida y vuelta completa de una llamada a herramienta >>](./02-one-tool-call-round-trip.md)
