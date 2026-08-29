# Lección 6: Estrategias de prompt para distintas tareas

> Objetivos de aprendizaje:
> - Dominar las buenas prácticas de prompt para tareas de generación de código
> - Aprender estrategias efectivas para redactar y resumir documentos
> - Entender las técnicas de prompt para análisis y extracción de datos
>
> Requisitos: [<< 05 Depuración y mejora de prompts](./05-debugging-prompts.md)

## Distintas tareas necesitan distintas estrategias de prompt

Ya aprendiste la estructura básica de un prompt, few-shot, CoT y cómo depurar: son habilidades generales. Pero cada tipo de tarea tiene sus propias mañas y trampas, y pide estrategias dirigidas.

La generación de código necesita entradas, salidas y casos límite claros; la redacción de documentos necesita una audiencia y un tono definidos; la extracción de datos necesita manejar valores faltantes y mantener el formato consistente. Esta lección recorre técnicas concretas para tres tipos de tarea habituales.[^S12]

## Tipo de tarea 1: generación de código

La generación de código es una de las formas más comunes en que la gente usa la IA. La clave es simple: **detalla los requisitos con claridad y la IA podrá escribir código que de verdad puedas usar**.[^S12]

### Los seis elementos de un prompt de generación de código

Un buen prompt de generación de código debería incluir:[^S12]

1. **Lenguaje y versión**: Python 3.10, TypeScript 5.0
2. **Firma de la función**: tipos de los parámetros de entrada, tipo de retorno
3. **Lógica central**: qué debería hacer la función
4. **Casos límite**: cómo manejar la entrada vacía y las condiciones de error — esto es programación defensiva: asumir que la entrada podría ser inválida y decidir de antemano cómo responder
5. **Estilo de código**: comentarios, anotaciones de tipo, manejo de errores
6. **Límites de dependencias**: solo biblioteca estándar, o qué bibliotecas de terceros se permiten

### Comparación: prompts de código vagos contra claros

❌ **Prompt difuso**:
```
Escribe una función en Python que procese datos de usuario
```

La IA solo puede adivinar: ¿qué datos? ¿Procesarlos cómo?

✅ **Prompt claro**:
```
Escribe una función en Python 3.10 con estos requisitos:

Comportamiento:
- Entrada: una lista de diccionarios, cada uno con name (str), age (int), email (str)
- Salida: descartar a los usuarios con age < 18, devolver los emails de los usuarios restantes (sin duplicados)

Requisitos:
- Incluir anotaciones de tipo
- Manejar los campos faltantes (si a un diccionario le falta age o email, saltarse ese usuario)
- Usar únicamente la biblioteca estándar de Python
- Incluir un docstring que describa el uso

Ejemplo:
Entrada: [{"name": "Alice", "age": 20, "email": "a@example.com"},
          {"name": "Bob", "age": 15, "email": "b@example.com"},
          {"name": "Charlie", "age": 25, "email": "a@example.com"}]
Salida: ["a@example.com"]
```

Este prompt fija la entrada, la salida, los casos límite y el estilo de código, así que la IA puede escribir código usable al primer intento.

Hay investigación detrás de esto: "prompts with explicit specifications reduced the need for back-and-forth refinements by 68%" (los prompts con especificaciones explícitas redujeron en un 68% la necesidad de refinamientos de ida y vuelta)[^S12] — detalla los pormenores y tendrás muchas más probabilidades de recibir código usable de entrada.

### Buenas prácticas de generación de código

**Práctica 1: Detalla las estructuras de datos de entrada y salida**

No digas «procesa los datos». Di «la entrada es List[Dict[str, Any]], la salida es Dict[str, int]».

**Práctica 2: Usa ejemplos para aclarar los casos límite**

```
Maneja estos casos especiales:
- Lista de entrada vacía → devolver una lista vacía
- Valor None → saltarlo
- Valor duplicado → conservar la primera aparición
```

**Práctica 3: Especifica el estilo de código**

```
Requisitos de estilo de código:
- Usar anotaciones de tipo
- Incluir un docstring (estilo Google)
- No comentar de más (no explicar código obvio)
- Priorizar la legibilidad primero, el rendimiento después
```

**Práctica 4: Di qué no quieres**

```
No hagas esto:
- No uses variables globales
- No incorpores dependencias externas (solo biblioteca estándar)
- No escribas código de pruebas (solo la función principal)
```

### Prompts de revisión de código

Cuando le pidas a la IA que revise código, nombra las dimensiones de revisión de forma explícita:

```
Revisa el código Python de abajo, concentrándote en:

1. Corrección: errores de lógica, manejo de casos límite
2. Rendimiento: análisis de complejidad temporal, posibles cuellos de botella
3. Seguridad: inyección SQL, XSS, validación de entradas

No comentes sobre el estilo de código ni sobre los nombres (esos ya pasan las revisiones de lint).

Por cada problema que encuentres, indica:
- Ubicación (número de línea o fragmento de código)
- Tipo de problema (bug / rendimiento / seguridad)
- Impacto concreto (bajo qué condiciones falla)
- Corrección sugerida

Código:
[pega el código]
```

Nombra las dimensiones de revisión y la IA no gastará tiempo en detalles que no importan.

## Tipo de tarea 2: redactar y resumir documentos

El trabajo con documentos cubre mucho terreno: documentación técnica, notas de reunión, resúmenes de artículos, generación de reportes.

### Los elementos clave de la redacción de documentos

1. **Audiencia objetivo**: lectores técnicos contra no técnicos
2. **Propósito**: explicar cómo usar algo contra convencer a quien toma una decisión
3. **Tono y estilo**: formal contra informal, detallado contra conciso
4. **Plantilla de estructura**: qué secciones organizan el contenido

### Comparación: prompts de resumen de documentos

❌ **Prompt difuso**:
```
Resume este documento técnico
```

✅ **Prompt claro**:
```
Eres una redactora técnica, buena para convertir documentación técnica
compleja en resúmenes que cualquiera pueda seguir.

Tarea: resume la documentación de API de abajo como una guía de inicio
rápido para desarrolladores frontend.

Audiencia: personas que trabajan en frontend, que conocen JavaScript pero nunca han usado esta API.

Formato de salida:
1. Una oración sobre qué hace esta API
2. Las tres funcionalidades más usadas (por cada una: propósito + ejemplo de código)
3. Un ejemplo completo de escenario de uso
4. Errores habituales y cómo corregirlos (2-3)

Tono: directo y práctico, sin lenguaje de marketing.

Longitud: 800 palabras o menos.

Documento original:
[pega el documento]
```

Este prompt fija la audiencia (desarrolladores frontend), el propósito (inicio rápido), la estructura (cuatro partes) y el tono (práctico).

### Buenas prácticas de redacción de documentos

**Práctica 1: Detalla el bagaje de la audiencia**

```
Audiencia:
- Rol: product manager
- Nivel técnico: no programa, pero entiende conceptos básicos de arquitectura de software
- Objetivo de lectura: decidir si adoptar este enfoque
```

**Práctica 2: Entrega una plantilla de estructura**

```
Organízalo así:

## Contexto
Por qué hace falta este enfoque (1 párrafo)

## Opciones comparadas
| Opción | Ventajas | Desventajas | Costo |
|--------|----------|-------------|-------|
| ...    | ...      | ...         | ...   |

## Recomendación
Qué opción elegir, y por qué (2-3 párrafos)

## Riesgos
Los riesgos principales de este enfoque y cómo manejarlos (lista)
```

**Práctica 3: Controla el nivel de detalle**

```
Nivel de detalle:
- Explica cada punto en 1-2 oraciones, sin extenderte
- Omite los detalles de implementación, cubre solo el impacto de negocio
- No cites código específico ni jerga técnica
```

### Prompts de notas de reunión

```
Eres un asistente de proyecto, bueno para sacar los puntos clave de
grabaciones o transcripciones de reuniones.

Tarea: escribe las notas de la reunión a partir de la transcripción de abajo.

Estructura de salida:
1. Información de la reunión
   - Fecha: AAAA-MM-DD
   - Asistentes: [lista]
   - Tema: [una oración]

2. Discusión (ordenada por prioridad)
   Por cada punto:
   - Planteamiento del problema (1 oración)
   - Puntos de discusión (2-3)
   - Decisión (una conclusión clara; si no se llegó a ninguna, escribe «pendiente»)

3. Tareas accionables
   Por cada una:
   - Descripción de la tarea (que empiece con un verbo, accionable)
   - Responsable
   - Fecha límite

Restricciones:
- Registra solo las discusiones con una conclusión clara, omite la charla suelta
- Cada tarea accionable tiene que ser verificable (tiene un entregable claro)
- Longitud total de 500 palabras o menos

Transcripción:
[pega la transcripción]
```

## Tipo de tarea 3: análisis y extracción de datos

El análisis de datos abarca sacar información estructurada de un texto, clasificar, filtrar y contar.

### Los elementos clave de la extracción de datos

Un prompt confiable de extracción de datos detalla cuatro cosas de antemano:

1. **Definiciones de campo**: qué significa cada campo y su rango de valores permitidos
2. **Manejo de valores faltantes**: qué hacer cuando un campo no se puede encontrar
3. **Formato de salida**: JSON, CSV, tabla
4. **Validación de datos**: si los datos extraídos necesitan revisión

### Comparación: prompts de extracción de datos

❌ **Prompt difuso**:
```
Extrae la información clave de esta oferta de trabajo
```

✅ **Prompt claro**:
```
Extrae los siguientes campos de la oferta de trabajo y devuelve JSON.

Definiciones de campo:
- position (string): título del puesto
- location (string): lugar de trabajo (ciudad + zona, si aparece)
- experience (string): experiencia requerida (conserva la redacción original, p. ej. «3-5 años», «indiferente»)
- salary (string): rango salarial (conserva las unidades, p. ej. «25-35k/mes», «a convenir»)
- company (string): nombre de la empresa

Manejo de valores faltantes:
- Si un campo no está en el texto fuente, devuelve null
- No adivines ni infieras la información faltante

Ejemplo 1:
Entrada: Se busca con urgencia ingeniero Java, Polanco Ciudad de México, 3+ años de experiencia, 25-35k/mes, XX Tech
Salida:
{
  "position": "ingeniero Java",
  "location": "Polanco, Ciudad de México",
  "experience": "3+ años",
  "salary": "25-35k/mes",
  "company": "XX Tech"
}

Ejemplo 2:
Entrada: Desarrollador frontend, remoto, salario a convenir
Salida:
{
  "position": "Desarrollador frontend",
  "location": "remoto",
  "experience": null,
  "salary": "a convenir",
  "company": null
}

Ahora procesa:
[pega la oferta de trabajo]
```

Los ejemplos cubren tanto el caso completo como el caso con faltantes, así que la IA sabe que debe devolver null cuando no encuentra algo en vez de inventarlo — esa costumbre de fabricar hechos con aplomo se llama alucinación.

### Buenas prácticas de extracción de datos

**Práctica 1: Detalla los valores permitidos de cada campo**

```
Campo: sentimiento
Valores permitidos: exactamente uno de «positivo» / «negativo» / «neutro»
No devuelvas: cosas como bueno, alegre, favorable ni ninguna otra palabra
```

**Práctica 2: Usa few-shot para estandarizar el formato**

Cuando extraes datos estructurados, 2-3 ejemplos funcionan mejor que una descripción escrita (la técnica de few-shot de la Lección 3).

**Práctica 3: Di cómo manejar los casos límite**

```
Casos especiales:
- Si un pasaje carga un sentimiento mixto («buen producto, pero muy caro») → clasificar como «neutro»
- Si es una pregunta pura («¿cómo funciona esto?») → clasificar como «neutro»
- Si el texto es demasiado corto (menos de 3 palabras) → devolver null
```

**Práctica 4: Agrega validación de datos**

```
Reglas de validación:
- El campo salary tiene que contener un número
- Si experience no es null, tiene que contener «año» o «indiferente»
- location no puede ser una cadena vacía: o un valor, o null

Si los datos extraídos incumplen una regla de validación, devuelve un mensaje
de error en vez de los datos inválidos.
```

```agentmentor-check
{
  "id": "prompt-engineering-task-strategies-match",
  "label": "Correspondencia entre tarea y estrategia",
  "prompt": "Quieres que la IA extraiga las ventajas y desventajas de un producto a partir de reseñas de usuarios y que enumere cada grupo por separado. ¿Qué estrategia importa más?\n\nA: Usar cadena de pensamiento para que la IA muestre su análisis\nB: Entregar 2-3 ejemplos que muestren cómo sacar ventajas y desventajas de una reseña y darles formato\nC: Explicar en detalle qué cuenta como ventaja y qué cuenta como desventaja\nD: Pedirle a la IA que asuma el rol de analista de producto",
  "whyHere": "Verifica si sabes elegir la estrategia decisiva para una tarea de extracción: aquí los ejemplos few-shot le ganan a un rol o a una definición escrita, porque lo difícil es una correspondencia consistente entre entrada y salida, no razonar ni tener pericia.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A - Usar CoT para mostrar los pasos del análisis",
      "correct": false,
      "feedback": "❌ CoT encaja con tareas de razonamiento (matemáticas, lógica), pero extraer ventajas y desventajas es reconocimiento de patrones, no razonamiento de varios pasos. Recorrer «primero encuentra las palabras positivas, después las negativas» aporta poco a la calidad de la extracción y solo alarga la salida."
    },
    {
      "id": "b",
      "text": "B - Entregar ejemplos de extracción y formato",
      "correct": true,
      "feedback": "✓ Correcto. El corazón de una tarea de extracción es lograr que la IA capte qué cuenta como ventaja, qué cuenta como desventaja y en qué formato devolverlo. Dos o tres ejemplos buenos que cubran casos distintos le ganan a una explicación escrita larga: le dejan ver a la IA la correspondencia entre entrada y salida de forma directa."
    },
    {
      "id": "c",
      "text": "C - Explicar las definiciones de ventaja y desventaja",
      "correct": false,
      "feedback": "❌ Una explicación escrita no es tan clara como un ejemplo. Puedes escribir un párrafo diciendo «una ventaja es algo que al usuario le parece bueno», pero un ejemplo concreto («excelente calidad» → ventaja) se lo deja mucho más fácil de captar a la IA."
    },
    {
      "id": "d",
      "text": "D - Fijar el rol de la IA como analista de producto",
      "correct": false,
      "feedback": "❌ Un rol aporta poco en una tarea de extracción. La dificultad aquí no es un punto de vista experto, sino el reconocimiento y el formato precisos. Una analista de producto y una persona común juzgan «excelente calidad» como una ventaja de la misma manera."
    }
  ]
}
```

## Aplicar los principios generales

Sea cual sea la tarea, los principios generales de las lecciones anteriores siguen valiendo:

- **Los cuatro elementos** (Lección 2): rol, tarea, formato, restricciones
- **Few-shot** (Lección 3): entrega 2-3 ejemplos para las tareas complejas
- **CoT** (Lección 4): agrega «pensemos paso a paso» para las tareas que necesitan razonar
- **Depuración** (Lección 5): cambia una cosa a la vez, verifica con casos de prueba

Las estrategias específicas por tarea de esta lección son **optimizaciones dirigidas** montadas encima de esos principios generales:

- Generación de código → enfatiza los tipos de entrada/salida, los casos límite, lo que no hay que hacer
- Redacción de documentos → enfatiza el bagaje de la audiencia, las plantillas de estructura, el tono
- Extracción de datos → enfatiza las definiciones de campo, el manejo de valores faltantes, los ejemplos few-shot

## Resumen

Distintas tareas necesitan distintas estrategias de prompt:

- **Generación de código**: fijar los tipos de entrada/salida, los casos límite, el estilo de código, los límites de dependencias; usar ejemplos para aclarar los casos especiales
- **Redacción de documentos**: definir el bagaje y el nivel técnico de la audiencia, entregar una plantilla de estructura, controlar el nivel de detalle y el tono
- **Extracción de datos**: definir los valores permitidos de cada campo, decir cómo manejar los valores faltantes, usar few-shot para estandarizar el formato, agregar validación de datos

Estas estrategias se apoyan en las habilidades generales de las lecciones anteriores (los cuatro elementos, few-shot, CoT, depuración): son optimizaciones para tipos de tarea específicos. En la práctica, elige la combinación que encaje con la tarea que tienes enfrente.

**Cierre del curso**

Terminaste las seis lecciones de Fundamentos de ingeniería de prompts:

1. Entendiste qué es realmente un prompt y por qué importa
2. Dominaste los cuatro elementos centrales de un prompt
3. Aprendiste a guiar a la IA con ejemplos usando few-shot
4. Aplicaste la cadena de pensamiento para que la IA muestre su razonamiento
5. Construiste una rutina sistemática para depurar y mejorar prompts
6. Aprendiste las estrategias específicas para distintos tipos de tarea

Ahora tienes la caja de herramientas completa. El siguiente paso es **practicar**: toma una tarea real de tu propio trabajo, aplica estas técnicas, observa qué pasa y sigue refinando. La ingeniería de prompts es una habilidad que se afila haciéndola: el trabajo del curso termina aquí, pero el aprendizaje de verdad empieza cuando la pones en uso.

<!-- exercises -->

## 💻 Ejercicios

### Nivel 1: Elegir la estrategia correcta para cada tarea

Dadas tres tareas, elige los puntos de estrategia más importantes para cada una y explica por qué.

**Tarea A**: Que la IA genere una función en Python que implemente búsqueda binaria
**Tarea B**: Que la IA resuma un white paper técnico en un reporte de 2 páginas para la dirección
**Tarea C**: Que la IA extraiga nombre del cliente, tipo de problema y urgencia de un lote de correos de clientes

Por cada tarea, responde:
1. ¿De qué tipo de tarea se trata? (generación de código / redacción de documentos / extracción de datos)
2. ¿Cuáles son los 3 puntos de estrategia más importantes?
3. ¿Por qué esos 3 puntos son los más importantes para esta tarea?

<!-- rubric -->
- Identificación correcta del tipo de cada tarea
- Los puntos de estrategia elegidos para cada tarea son específicos (no consejos genéricos para todo uso)
- Explicación clara de por qué esas estrategias importan más en esa tarea
- Consideración de lo que tiene de particular la tarea (p. ej. el cambio de audiencia en la Tarea B, la consistencia de formato en la Tarea C)
- Los puntos de estrategia provienen de lo que enseñó esta lección
<!-- answer -->
**Tarea A: función de búsqueda binaria en Python**

1. **Tipo de tarea**: generación de código

2. **Estrategias clave**:
   - Fijar la firma de la función: tipo de entrada (un List[int] ordenado, target: int), tipo de retorno (int — el índice, o -1)
   - Detallar los casos límite: lista vacía, target ausente, elementos duplicados
   - Especificar el estilo de código: anotaciones de tipo, docstring, sin comentarios línea por línea

3. **Por qué importan**:
   - La búsqueda binaria tiene varias implementaciones (recursiva contra iterativa, intervalos semiabiertos contra cerrados); sin especificaciones no sabes cuál te va a tocar
   - Los casos límite son donde la búsqueda binaria es más propensa a bugs (errores por uno), así que hay que declararlos
   - El código de un algoritmo debería explicarse solo; comentar de más en realidad daña la legibilidad

---

**Tarea B: white paper técnico → reporte para la dirección**

1. **Tipo de tarea**: redacción de documentos

2. **Estrategias clave**:
   - Definir la audiencia: la dirección (no quiere detalle técnico, le importan el valor de negocio y el costo)
   - Entregar una plantilla de estructura: resumen ejecutivo → impacto de negocio → costo-beneficio → riesgos → recomendación
   - Controlar el nivel de detalle: omitir detalles de implementación, cambiar la jerga por lenguaje de negocio, 2-3 oraciones por punto

3. **Por qué importan**:
   - De white paper a reporte para la dirección es una tarea de «traducción»; el mayor desafío es el cambio de audiencia
   - La dirección lee un reporte para tomar una decisión, así que la estructura debería girar en torno a «por qué hacerlo, cuánto cuesta, cuáles son los riesgos»
   - Si te equivocas en el nivel de detalle, queda o demasiado técnico (la dirección no lo puede seguir) o demasiado flaco (sin base para decidir)

---

**Tarea C: extraer información estructurada de correos de clientes**

1. **Tipo de tarea**: extracción de datos

2. **Estrategias clave**:
   - Definir los valores permitidos por campo: tipo de problema (falla de producto / duda de facturación / consulta de funcionalidad), urgencia (alta / media / baja)
   - Usar few-shot para estandarizar el formato: 2-3 ejemplos que muestren cómo juzgar el tipo de problema y la urgencia a partir de un correo
   - Decir cómo manejar los valores faltantes: si el correo no menciona el nombre del cliente, devolver «no disponible» y no adivinarlo a partir de la dirección de correo

3. **Por qué importan**:
   - Los clientes se expresan de mil maneras; sin ejemplos que muestren los criterios de juicio, a la IA le cuesta clasificar de forma consistente
   - La «urgencia» es un juicio subjetivo, y los ejemplos few-shot establecen un estándar compartido (p. ej. «el sistema está totalmente caído» es urgencia alta)
   - Sin manejo de valores faltantes, la IA podría adivinar el nombre del cliente «Soporte» a partir de «support@company.com» y corromper los datos

<!-- hint -->
Cada tipo de tarea tiene un desafío central distinto: la generación de código le teme a la ambigüedad (fija la especificación), la redacción de documentos le teme al desajuste (apunta a la audiencia), la extracción de datos le teme a la inconsistencia (estandariza el formato).
<!-- hint -->
Cuando elijas una estrategia, pregunta: ¿en qué punto es más probable que esta tarea salga mal? Apunta a esa trampa mayor con la estrategia correspondiente.

### Nivel 2: Diseñar un prompt completo para una tarea

Elige uno de los escenarios de abajo y diseña un prompt completo que reúna todo lo que enseñó el curso.

**Opciones de escenario**:

**Escenario 1**: Asistente de revisión de código
- Que la IA revise un fragmento de código Python buscando posibles problemas de rendimiento y agujeros de seguridad
- Devolver un reporte de revisión estructurado, ordenado por gravedad
- Cada problema incluye: ubicación, descripción, corrección sugerida, prioridad

**Escenario 2**: Generador de apuntes de estudio
- Darle a la IA la transcripción de una clase técnica
- Generar apuntes de estudio estructurados: conceptos centrales, puntos clave, consejos de práctica, lecturas adicionales
- Dirigidos a principiantes, en lenguaje llano

**Escenario 3**: Analizador de comentarios de clientes
- Extraer los problemas habituales de 10-20 comentarios de clientes
- Salida: categorías de problema, la frecuencia de cada categoría, ejemplos concretos, direcciones de mejora sugeridas
- Se usa para decisiones de iteración de producto

**Requisitos**:
Tu prompt tiene que:
1. Incluir los cuatro elementos (rol, tarea, formato, restricciones)
2. Entregar 2-3 ejemplos few-shot si hacen falta ejemplos
3. Agregar guía de CoT si hay razonamiento o análisis de por medio
4. Contemplar los casos límite y el manejo de valores faltantes
5. Tener un formato de salida claro y fácil de usar más adelante

<!-- rubric -->
- El prompt está completo en su estructura, con los cuatro elementos que necesita
- La descripción de la tarea es clara, con audiencia y objetivo definidos
- El formato de salida es estructurado, con definiciones de campo claras
- Inclusión de ejemplos o guía de CoT apropiados (acordes al tipo de tarea)
- Consideración de los casos límite (p. ej. «no se encontraron problemas» en una revisión de código, «transcripción de mala calidad» en apuntes de estudio)
- Las restricciones son sensatas y descartan la salida no deseada
- Es práctico en conjunto y está listo para usarse en una tarea real
<!-- answer -->
**Ejemplo del escenario 1: asistente de revisión de código**

````
[Rol] Eres un ingeniero senior de revisión de código Python, enfocado en
optimización de rendimiento y endurecimiento de seguridad.

[Tarea] Revisa el código Python de abajo buscando posibles problemas de
rendimiento y agujeros de seguridad.

[Dimensiones de revisión] (por prioridad)
1. Agujeros de seguridad: inyección SQL, XSS, entradas sin validar, secretos hardcodeados
2. Problemas de rendimiento: algoritmos por encima de O(n^2), cálculo repetido, uso innecesario de memoria
3. Problemas de concurrencia: condiciones de carrera, riesgo de deadlock (si el código involucra multihilo)

[Formato de salida]
Por cada problema encontrado, devuelve con este formato:

Gravedad: [alta/media/baja]
Ubicación: línea X / función Y
Tipo de problema: [seguridad/rendimiento/concurrencia]
El problema: [descripción detallada, bajo qué condiciones falla]
Corrección sugerida: [qué cambiar concretamente, con un fragmento de código o un enfoque]

---

[Restricciones]
- Prioridad: seguridad > rendimiento > todo lo demás
- Señala solo los problemas que afecten de verdad a producción; no te detengas en minucias de estilo
- Si el código no tiene problemas, devuelve: «No se encontraron problemas de prioridad alta ni media. La calidad del código es buena».
- Cada sugerencia de corrección tiene que ser concreta y accionable; no digas vaguedades como «mejora el algoritmo»
- Devuelve como máximo 10 problemas (ordenados por gravedad)

[Código]
```python
[pega el código]
```
````

**Por qué funciona este prompt**:
1. **Rol + tarea**: ingeniero senior + un objetivo de revisión concreto le dan a la IA un punto de vista claro
2. **Prioridades claras**: las tres dimensiones están ordenadas por importancia, así que la IA sabe dónde concentrarse
3. **Salida estructurada**: cinco campos (gravedad, ubicación, tipo, problema, corrección) la vuelven fácil de procesar
4. **Manejo de casos límite**: el caso de «sin problemas» tiene una salida definida, así que la IA no inventará problemas
5. **Restricciones claras**: «no te detengas en minucias de estilo», «máximo 10», «las correcciones tienen que ser concretas» evitan que la salida se desvíe
6. **Cómo se junta todo**:
   - Los cuatro elementos: rol (ingeniero de revisión), tarea (encontrar problemas), formato (estructurado), restricciones (prioridad + cantidad)
   - Estrategia específica de la tarea: la revisión de código necesita dimensiones de revisión nombradas, información de ubicación en la salida y sugerencias accionables
   - Casos límite: contempla la situación de «sin problemas»

<!-- hint -->
Pasos para diseñar un prompt combinado: (1) enmárcalo primero con los cuatro elementos, (2) agrega estrategias específicas de la tarea según el tipo (few-shot / CoT / definición de formato), (3) piensa los casos límite y agrega restricciones, (4) revisa si el formato de salida es fácil de usar.
<!-- hint -->
Una vez diseñado, lee el prompt como si fueras la IA: ¿entiendes cada requisito en una sola pasada? ¿Hay puntos difusos? ¿El formato de salida se puede copiar y pegar directo en un reporte?

<!-- /exercises -->
