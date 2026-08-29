# Lección 2: La estructura básica de un prompt

> Objetivos de aprendizaje:
> - Dominar los cuatro elementos centrales de un prompt
> - Aprender a convertir una petición vaga en una instrucción estructurada
> - Entender cómo cada elemento moldea la salida de la IA
>
> Requisitos: [<< Lección 1: Qué es un prompt y por qué importa](./01-what-is-prompt.md) | Siguiente: [Lección 3 >>](./03-few-shot-learning.md)

## Por qué la IA sigue respondiendo la pregunta equivocada

Le pides a la IA que «escriba un resumen del proyecto» y te entrega una plantilla genérica sin ninguno de los detalles reales de tu proyecto. ¿Dónde se torció? No es que a la IA le falte capacidad. A tu instrucción le faltaban las piezas que importan: de qué proyecto se trata, para quién es, qué debería contener y qué formato debería tener.

Un prompt efectivo no es una línea lanzada por encima del muro. Es una instrucción completa construida a partir de cuatro elementos. Esta lección cubre cuáles son esos cuatro elementos, qué hace cada uno y cómo combinarlos.

## Los cuatro elementos de un prompt

Un prompt claro suele contener cuatro partes[^S2]:

1. **Rol** — dile a la IA desde qué identidad debe responder
2. **Tarea** — indica exactamente qué quieres que haga
3. **Formato** — especifica la estructura y el estilo de la respuesta
4. **Restricciones** — fija los límites: alcance, longitud, tono, etc.

No necesitas los cuatro cada vez, pero cuanto más compleja es la tarea, más elementos requiere. Veamos cada uno.

### 1. Rol: desde qué identidad debe responder la IA

El **rol** le dice a la IA con qué perspectiva y qué nivel de experiencia debe responder[^S3]. La misma pregunta recibe una respuesta completamente distinta de un experto técnico que de un maestro de primaria.

Compara estos dos prompts:

Sin rol:
```
Explica qué es Docker.
```

La IA podría darte:
- Una definición de diccionario («Docker es una plataforma de contenedores de código abierto...»)
- Una respuesta que asume que ya conoces Linux, virtualización e imágenes

Con rol:
```
Eres un profesor que explica bien los conceptos técnicos usando analogías
cotidianas. Explícale qué es Docker a un product manager que no tiene
formación en programación.
```

Ahora la IA va a:
- Recurrir a analogías cotidianas («Docker es como un contenedor de carga estandarizado...»)
- Evitar la jerga, o explicar cada término que use
- Enfocarse en «para qué lo querrías» en vez de «cómo está construido»

**Patrones de rol comunes:**
- Identidad profesional: «Eres un ingeniero senior de Python»
- Estilo de enseñanza: «Eres un mentor que enseña con ejemplos»
- Perspectiva de la audiencia: «Le estás explicando esto a la dirección no técnica»
- Tono: «Eres un asistente amable y paciente»

### 2. Tarea: indica exactamente qué quieres que se haga

La **tarea** es el corazón del prompt. Responde a la pregunta «qué quieres que se haga»[^S2]. Una descripción vaga de la tarea es el problema más común de todos.

Compara:

Tarea vaga:
```
Analiza este código.
```

La IA no tiene idea de qué ángulo tomar: ¿rendimiento? ¿seguridad? ¿legibilidad? ¿errores?

Tarea clara:
```
Analiza este código de Python en busca de cuellos de botella de
rendimiento. Señala qué operaciones podrían volverse lentas con conjuntos
de datos grandes y sugiere cómo arreglarlas.
```

Ahora la IA sabe:
- El foco es el rendimiento, no otras preocupaciones
- Debe razonar sobre el caso de conjuntos de datos grandes
- No debe limitarse a marcar problemas, debe proponer soluciones

**Una tarea tiene tres capas:**
1. **Verbo** — resumir, analizar, generar, editar, revisar...
2. **Objeto** — sobre qué contenido actúa (código, un documento, datos...)
3. **Objetivo** — a qué resultado llegar, qué problema resolver

### 3. Formato: especifica la estructura de la respuesta

El **formato** le dice a la IA cómo organizar su respuesta[^S2]. Sin una restricción de formato, la IA elige lo que le parezca adecuado: quizá un muro de texto, quizá una lista, quizá una tabla.

Compara:

Sin requisito de formato:
```
Resume los puntos clave de este artículo.
```

La IA podría darte:
- Tres párrafos de descripción
- Una lista de diez viñetas
- Una única conclusión de una oración

Formato especificado:
```
Resume este artículo con el siguiente formato:

Argumento central: [una oración]

Evidencia de apoyo (3 puntos):
1. [punto 1, una oración]
2. [punto 2, una oración]
3. [punto 3, una oración]

Conclusión: [una oración]
```

La IA va a seguir esta estructura al pie de la letra, y puedes pegar el resultado directamente en tu propio documento.

**Restricciones de formato comunes:**
- Listas: «enumera tres puntos clave como viñetas»
- Tablas: «compara los pros y los contras de ambas opciones en una tabla»
- Código: «entrega solo código ejecutable, sin explicación»
- Secciones: «divídelo en antecedentes, análisis y recomendación»
- Longitud: «mantén cada punto por debajo de 50 palabras»

### 4. Restricciones: fija los límites

Las **restricciones** son las reglas de «no...» y «solo...» que evitan que la IA se desvíe[^S2].

Compara:

Sin restricciones:
```
Recomiéndame algunos recursos para aprender Python.
```

La IA podría darte:
- Una docena de libros, cursos y sitios web
- De todo, desde nivel principiante hasta avanzado
- Una mezcla de pago y gratuitos, en inglés y en otros idiomas

Con restricciones:
```
Recomiéndame 3 recursos para aprender Python. Requisitos:
- Completamente gratuitos
- En español
- Aptos para alguien que empieza desde cero
- Que incluyan proyectos prácticos

Describe cada recurso en dos oraciones: la primera dice qué es, la
segunda dice por qué le sirve a una persona principiante.
```

Ahora la IA va a:
- Filtrar con precisión los recursos que encajan
- Descartar los cursos de pago y el material en otro idioma
- Explicar cada elección con el formato que pediste

**Tipos de restricción comunes:**
- Longitud: «no más de 200 palabras»
- Alcance: «cubre solo métodos de 2023 en adelante»
- Tono: «usa lenguaje académico formal»
- Exclusión: «no incluyas ninguna opción de pago»
- Prioridad: «prefiere herramientas de código abierto»

## Combinar los cuatro elementos

Un prompt completo reúne los cuatro elementos. Aquí va un escenario real.

**Escenario: pedirle a la IA que redacte notas de una reunión**

Solo la tarea, sin los demás elementos:
```
Redacta notas a partir de esta transcripción de reunión.
```

Los cuatro elementos:
```
[Rol] Eres un asistente de proyectos con experiencia.

[Tarea] Redacta notas de reunión a partir de la siguiente transcripción.

[Formato] Organízalas así:
- Datos básicos de la reunión (hora, asistentes)
- Temas discutidos (ordenados por prioridad)
- La decisión alcanzada en cada tema
- Elementos de acción (responsable + fecha límite)

[Restricciones]
- Registra solo las discusiones que llegaron a una conclusión clara;
  omite la charla informal
- Cada elemento de acción debe ser accionable (un verbo + un entregable
  verificable)
- Mantén el total por debajo de 500 palabras

Transcripción:
[pega aquí la transcripción]
```

Este prompt es claro, completo y reutilizable. Convierte la parte de la transcripción en un marcador de posición y tendrás una plantilla que puedes ejecutar una y otra vez. En la próxima reunión, solo cambias la transcripción nueva.

```agentmentor-check
{
  "id": "prompt-engineering-structure-identify-element",
  "label": "Identificar el elemento de prompt que falta",
  "prompt": "¿Qué elemento clave le falta al siguiente prompt?\n\n«Escríbeme código JavaScript que implemente el inicio de sesión de usuario, usando un token JWT para la autenticación».\n\nA: Falta el rol\nB: Falta la tarea\nC: Falta el formato\nD: Faltan las restricciones",
  "whyHere": "Detectar qué elemento le falta a un prompt es el primer movimiento para mejorarlo. Este prompt tiene una tarea clara pero deja sin decir la forma de la salida, que es justo la trampa que se le escapa a quien empieza.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Falta el rol",
      "correct": false,
      "feedback": "❌ Aquí la tarea ya es específica (escribir JS, implementar el inicio de sesión, usar JWT). Para una tarea de generación de código, el rol no es lo más importante que falta."
    },
    {
      "id": "b",
      "text": "Falta la tarea",
      "correct": false,
      "feedback": "❌ La tarea está enunciada: escribir JavaScript, implementar el inicio de sesión, usar un token JWT. Esa parte está presente."
    },
    {
      "id": "c",
      "text": "Falta el formato",
      "correct": true,
      "feedback": "✓ Correcto. El prompt nunca dice qué forma debe tener el código: ¿un archivo completo? ¿solo la función central? ¿con comentarios? ¿con manejo de errores? La IA solo puede adivinar. Agregar «entrega solo una función ejecutable, con manejo de errores completo y comentarios» lo deja claro."
    },
    {
      "id": "d",
      "text": "Faltan las restricciones",
      "correct": false,
      "feedback": "❌ Las restricciones (como «sin bibliotecas externas» o «menos de 50 líneas») no son obligatorias aquí. Su ausencia no vuelve el prompt fundamentalmente poco claro."
    }
  ]
}
```

## Práctica: reescribir un prompt vago

Ahora practiquemos convirtiendo un prompt vago en uno estructurado.

### Prompt original (vago)
```
Optimízame este código.
```

### Pasos de la reescritura

**Paso 1: precisar la tarea**
- ¿Optimizar para qué? ¿Rendimiento, legibilidad o seguridad?
- Digamos que el objetivo es el rendimiento

**Paso 2: agregar un rol**
- La perspectiva de alguien que revisa código es la que mejor encaja

**Paso 3: especificar el formato**
- Estructura la salida: primero la lista de problemas, después las soluciones

**Paso 4: agregar restricciones**
- No cambiar el comportamiento
- Priorizar las ganancias de rendimiento evidentes

### Prompt reescrito
```
Eres un ingeniero senior de rendimiento.

Analiza el siguiente código de Python en busca de problemas de rendimiento
y sugiere soluciones.

Entrega con este formato:
1. Cuellos de botella actuales (ordenados por impacto, del mayor al menor)
   - Descripción del cuello de botella
   - A qué volumen de datos se vuelve un problema
2. Plan de optimización
   - Cambio concreto a realizar
   - El fragmento de código optimizado
   - Mejora de rendimiento esperada

Restricciones:
- No cambies la interfaz de entrada/salida de la función
- No introduzcas nuevas dependencias externas
- Prioriza los cambios que den al menos 2x de aceleración

Código:
[pega aquí el código]
```

Comparado con el original, el prompt reescrito le dice a la IA con claridad: qué rol tomar, qué hacer, cómo entregar la salida y bajo qué límites.

## Usar los cuatro elementos con flexibilidad

Los cuatro elementos no son un dogma, son una lista de verificación:

- **Las tareas simples** pueden usar solo 2 o 3 elementos: «Resume el argumento central de este artículo en tres oraciones» (tarea + formato)
- **Las tareas complejas** necesitan los cuatro: «Eres un redactor técnico. Reescribe esta documentación de API como un tutorial para principiantes, con ejemplos de código y notas sobre errores comunes, en menos de 1000 palabras»
- **Las tareas exploratorias** necesitan menos restricciones: «¿Desde qué ángulos podríamos abordar este problema?»
- **Las tareas de ejecución** necesitan más restricciones: «Entrega estrictamente con el siguiente formato JSON, sin explicación»

La prueba es simple: **después de leer tu prompt, ¿puede la IA saber exactamente qué hacer y qué resultado producir?** Si tú no puedes responder eso con claridad, la IA tiene aún menos posibilidades.

## Resumen

Un prompt efectivo contiene cuatro elementos: rol (qué identidad), tarea (qué hacer), formato (cómo organizar) y restricciones (cuáles son los límites). No usas los cuatro cada vez, pero cuanto más compleja es la tarea, más completo tiene que ser el conjunto de elementos.

El proceso de reescritura: primero precisa la tarea central, después decide qué rol, qué formato de salida y qué restricciones necesita. Expande una línea vaga en una instrucción estructurada y la calidad de la salida de la IA sube marcadamente.

La próxima lección cubre el few-shot learning: cómo usar de 2 a 5 ejemplos para que la IA entienda el patrón que quieres, en vez de describirlo con palabras.

**Próxima lección** [Few-shot learning: guiar a la IA con ejemplos >>](./03-few-shot-learning.md)

<!-- exercises -->

## 💻 Ejercicios

### Nivel 1: Desarmar un prompt y reconstruirlo

Aquí va un prompt desordenado:

```
Escribe una función, la entrada es una lista de cadenas, la salida es el
resultado sin duplicados, que sea rápida, usa Python, agrega comentarios.
```

Reorganízalo con el marco de los cuatro elementos (rol, tarea, formato, restricciones) para que quede más claro.

<!-- rubric -->
- Se define el rol si la tarea lo requiere
- La tarea es clara: tipo de entrada, tipo de salida, función central
- El formato es explícito: estilo de código, requisitos de comentarios, si hace falta un ejemplo
- Las restricciones son razonables: requisito de rendimiento, límites de dependencias, etc.
- La estructura general es lo bastante clara para que la IA capte todos los requisitos en una sola lectura
<!-- answer -->
**Prompt reconstruido:**

```
[Tarea] Escribe una función de Python que elimine los duplicados de una
lista de cadenas.

[Entrada/salida]
- Entrada: List[str], puede contener cadenas duplicadas
- Salida: List[str], sin duplicados y conservando el orden original

[Requisitos]
- Complejidad temporal: O(n), implementada con una tabla hash
- Conserva el orden original de aparición (no uses simplemente set() y
  luego list(), que desordena)
- Usa solo la biblioteca estándar de Python, sin dependencias de terceros

[Estilo de código]
- Incluye anotaciones de tipo
- Incluye un docstring que cubra el uso y la complejidad temporal
- Sin comentarios línea por línea dentro de la función (el código debería
  explicarse solo)

Ejemplo:
Entrada: ["apple", "banana", "apple", "cherry", "banana"]
Salida:  ["apple", "banana", "cherry"]
```

**Por qué esto es mejor:**
1. La tarea queda limpiamente separada en entrada/salida, requisitos y estilo de código
2. El requisito de rendimiento es específico: no un vago «que sea rápida», sino un «O(n)» explícito y un método de implementación
3. Nombra una trampa común: usar set() directamente desordena
4. Da un ejemplo, que elimina la ambigüedad
5. El requisito de estilo de código está equilibrado: un docstring, pero sin comentar de más

<!-- hint -->
El prompt original mete todos los detalles en una sola oración, así que nada destaca. Prueba a dividirlo en varios párrafos: enuncia primero la entrada/salida, después el requisito de rendimiento y después el estilo de código.
<!-- hint -->
«Que sea rápida» es subjetivo; la IA no sabe qué tan rápida quieres decir. Reemplázalo por un estándar objetivo: una complejidad temporal, o «que procese 1 millón de registros en menos de un segundo».

### Nivel 2: Diseñar un prompt completo para una tarea compleja

Escenario: necesitas que la IA revise un documento técnico (una guía de uso de una API), encuentre los puntos donde es probable que alguien principiante se confunda y sugiera mejoras.

Diseña un prompt completo con los cuatro elementos.

<!-- rubric -->
- El rol encaja: redactor técnico, revisor de documentación o la perspectiva de la audiencia objetivo
- La tarea es específica: las dimensiones de revisión son claras (claridad, completitud, exactitud, etc.)
- El formato de salida es estructurado: fácil de revisar y accionar punto por punto
- Las restricciones son razonables: prioridades de revisión, aspectos que no hace falta revisar
- Se consideran los casos límite: qué hacer con las partes que no tienen problemas
<!-- answer -->
**Ejemplo de prompt:**

```
[Rol] Eres un revisor de documentación técnica enfocado en que la
documentación sea accesible para principiantes.

[Tarea] Revisa la siguiente guía de uso de la API y encuentra los puntos
donde es probable que alguien principiante la malinterprete o se atore.

[Dimensiones de revisión] (ordenadas por prioridad)
1. Claridad: ¿se explican los términos? ¿los ejemplos están completos y son
   ejecutables?
2. Completitud: ¿faltan pasos clave? ¿se describe el manejo de errores?
3. Orden: ¿sigue la ruta de aprendizaje de alguien principiante (de lo
   simple a lo complejo)?
4. Trampas comunes: ¿advierte sobre los errores fáciles de cometer?

[Formato de salida]
Para cada problema encontrado, entrega:
- Ubicación: qué párrafo o bloque de código
- Tipo de problema: claridad / completitud / orden / trampa
- El problema concreto: dónde se atoraría alguien principiante, y por qué
- Solución sugerida: exactamente qué cambiar (1-2 oraciones, no reescribas
  la sección entera)

[Restricciones]
- Marca solo los problemas que realmente perjudican la comprensión de
  alguien principiante; no te detengas en la elección de palabras
- No revises el rendimiento ni la seguridad del código (este documento es
  para enseñar, no código de producción)
- Si una sección está bien escrita, di solo "esta parte es clara" y sigue
- Entrega como máximo 10 problemas (los de mayor prioridad)

Documento:
[pega el documento]
```

**Por qué funciona este prompt:**
1. **Rol**: revisor de documentación + foco en la accesibilidad para principiantes le da a la IA una perspectiva clara
2. **Desglose de la tarea**: cuatro dimensiones de revisión ordenadas por prioridad, así la IA sabe dónde concentrarse
3. **Formato de salida**: cuatro campos estructurados, fáciles de procesar después
4. **Restricciones claras**: dice qué NO hacer (no detenerse en las palabras, no revisar el rendimiento), lo que mantiene a la IA en curso
5. **Manejo de los casos límite**: dice qué hacer cuando no hay problema, y así evita ensayos inútiles del tipo «esta parte está genial»

<!-- hint -->
La clave para diseñar el prompt de una tarea compleja: define desde qué ángulos quieres que la IA examine el problema y después dale una prioridad a cada ángulo. No dejes que la IA decida por su cuenta qué importa.
<!-- hint -->
Diseña el formato de salida en función de «cómo vas a usar el resultado». Si vas a editar el documento punto por punto, entrega «ubicación + problema + solución». Si vas a generar un informe, entrega «resumen + lista detallada».

<!-- /exercises -->
