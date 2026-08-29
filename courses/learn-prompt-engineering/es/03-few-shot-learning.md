# Lección 3: Few-shot learning: guiar a la IA con ejemplos

> Objetivos de aprendizaje:
> - Entender la diferencia entre zero-shot, one-shot y few-shot
> - Aprender a usar de 2 a 5 ejemplos para que la IA capte un patrón
> - Dominar los principios para elegir ejemplos de alta calidad
>
> Requisitos: [<< Lección 2: La estructura básica de un prompt](./02-prompt-structure.md) | Siguiente: [Lección 4 >>](./04-chain-of-thought.md)

## Cuando una descripción es menos clara que un ejemplo

Quieres que la IA entregue datos con un formato específico; digamos, «extrae los hechos clave de este artículo y devuélvelos como JSON». Pasas un buen rato en el prompt detallando nombres de campo, tipos de datos, anidamiento... y la IA igual te devuelve algo con una forma distinta de la que imaginabas.

Prueba otra vía. Deja de describir el formato y **muéstrale a la IA 2 o 3 ejemplos limpios**. Los lee, ve exactamente qué quieres y acierta con el formato al primer intento. Ese es el poder del few-shot learning: un ejemplo es más claro que un párrafo de descripción[^S11].

## Qué es el few-shot learning

El **few-shot learning** es una técnica de prompt que guía a la IA hacia el patrón que quieres colocando una pequeña cantidad de ejemplos (normalmente de 2 a 5) en el prompt[^S4][^S11]. La IA aprende de esos ejemplos la relación entrada-salida, el formato y el estilo, y después lo aplica a una entrada nueva.

Tres formas de comparar:

- **Zero-shot**: sin ejemplos, solo una instrucción[^S15]
- **One-shot**: un ejemplo
- **Few-shot**: de 2 a 5 ejemplos[^S4]

### Zero-shot: solo la instrucción

Prompt zero-shot:
```
Clasifica la siguiente reseña de usuario como «positiva», «negativa» o
«neutral».

Reseña: Este producto funciona bien, pero es un poco caro.
Clasificación:
```

La IA podría devolver:
- «neutral» (razonable)
- «negativa» (porque menciona que es «caro»)
- «positiva con reservas» (una categoría que inventó en el momento)

Sin ejemplos, la IA solo puede apoyarse en su propio criterio para los casos límite.

### Few-shot: darle ejemplos

Prompt few-shot:
```
Clasifica reseñas de usuario como «positiva», «negativa» o «neutral».

Ejemplos:

Reseña: La calidad de construcción es excelente, estoy muy contento.
Clasificación: positiva

Reseña: Completamente inservible, un desperdicio de dinero.
Clasificación: negativa

Reseña: Las funciones están bien, pero el soporte al cliente es lento.
Clasificación: neutral

Ahora clasifica esta reseña:

Reseña: Este producto funciona bien, pero es un poco caro.
Clasificación:
```

Después de ver los ejemplos, la IA entiende:
- «positiva» es para una reseña plenamente satisfecha
- «negativa» es insatisfacción seria
- «neutral» es una reseña mixta, algo bueno y algo malo
- la salida es una sola palabra, sin explicación

Así que devuelve «neutral», porque esta reseña coincide con el patrón del tercer ejemplo.

## Cómo funciona el few-shot learning

El few-shot learning aprovecha la capacidad de **aprendizaje en contexto** (in-context learning) de un modelo de lenguaje grande[^S4]. El modelo no se reentrena; simplemente ve unos pocos ejemplos en la conversación actual, infiere la regla y la aplica.

El modelo capta tres tipos de información a partir de los ejemplos:

1. **El mapeo de entrada a salida**: qué tipo de entrada produce qué tipo de salida
2. **El formato y el estilo de la salida**: una respuesta corta o una detallada, JSON o texto plano
3. **El estándar para los casos límite**: cómo debería clasificarse un caso ambiguo

**Un hallazgo clave**: la investigación muestra que el **formato** y la **diversidad** de los ejemplos importan más que si cada ejemplo es correcto[^S4]. Aunque algunas etiquetas de los ejemplos estén mal, la IA todavía puede aprender un patrón útil, siempre que el formato sea consistente y los ejemplos cubran distintos tipos de entrada.

## Principios para diseñar ejemplos de alta calidad

No basta con lanzar unos ejemplos cualesquiera. La calidad de tus ejemplos moldea directamente la salida de la IA[^S11].

### Principio 1: al menos 2, y por lo general no más de 5

- **Un solo ejemplo** (one-shot) a veces no alcanza: la IA puede tratarlo como un caso especial
- **2 o 3 ejemplos** suelen bastar para que la IA capte el patrón
- **4 o 5 ejemplos** son para tareas más complejas, o con muchos casos límite
- **Más de 5** da rendimientos decrecientes y consume bastantes tokens extra

Empieza con 2, y agrega un tercero o un cuarto solo si los resultados no son lo bastante buenos[^S11].

### Principio 2: los ejemplos deberían ser representativos y diversos

Tus ejemplos deberían cubrir los distintos tipos de entrada que la tarea podría ver, es decir, la diversidad de ejemplos[^S4].

Ejemplos que carecen de diversidad:
```
Ejemplo 1: iPhone 15 Pro → teléfono
Ejemplo 2: iPhone 14 → teléfono
Ejemplo 3: iPhone 13 → teléfono

Ahora clasifica: MacBook Pro
```

Todos los ejemplos son teléfonos. La IA nunca vio otro tipo de producto electrónico, así que puede no saber cómo manejar uno.

Ejemplos con diversidad:
```
Ejemplo 1: iPhone 15 Pro → teléfono
Ejemplo 2: MacBook Air → laptop
Ejemplo 3: AirPods Pro → audífonos

Ahora clasifica: iPad Pro
```

Esto cubre distintas categorías de producto, así que la IA puede aprender una lógica de clasificación más general.

### Principio 3: mantén el formato idéntico entre los ejemplos

La consistencia de formato es la clave de un prompt few-shot exitoso[^S4].

Formato inconsistente:
```
Ejemplo 1:
Entrada: Qué lindo día
Salida: positiva

Ejemplo 2:
«Esta película fue aburridísima» --> sentimiento negativo

Ejemplo 3: está bien → neutral
```

El formato es un desorden, así que la IA no sabe si debe entregar «positiva», «sentimiento positivo» u otra cosa.

Formato consistente:
```
Ejemplo 1:
Entrada: Qué lindo día
Salida: positiva

Ejemplo 2:
Entrada: Esta película fue aburridísima
Salida: negativa

Ejemplo 3:
Entrada: está bien
Salida: neutral
```

Limpio y uniforme, así la IA sabe que la salida debe ser un solo adjetivo.

### Principio 4: incluye casos límite y ejemplos fáciles de confundir

Si la tarea tiene zonas grises, ponlas en los ejemplos[^S11].

**Escenario: juzgar si un comentario de código es útil**

Solo los ejemplos evidentes:
```
Ejemplo 1:
Código: x = x + 1  # suma 1
Veredicto: inútil (el comentario solo repite el código)

Ejemplo 2:
Código: result = calculate_tax(income, deductions)  # calcula el impuesto
Veredicto: útil (explica el significado de negocio)
```

Con casos límite incluidos:
```
Ejemplo 1:
Código: x = x + 1  # suma 1
Veredicto: inútil (el comentario solo repite el código)

Ejemplo 2:
Código: result = calculate_tax(income, deductions)  # calcula el impuesto
Veredicto: útil (explica el significado de negocio)

Ejemplo 3:
Código: time.sleep(2)  # espera a que se reinicie el límite de la API
Veredicto: útil (explica por qué esperamos, que no es evidente)

Ejemplo 4:
Código: users = users.filter(active=True)  # filtra usuarios activos
Veredicto: inútil (el nombre del método ya lo deja claro)
```

Los ejemplos 3 y 4 ayudan a la IA a ver el límite: no todo comentario que «explica qué hace el código» es útil. Lo que importa es si el código ya expresa su intención con claridad por sí solo.

```agentmentor-check
{
  "id": "prompt-engineering-few-shot-example-quality",
  "label": "Juzgar si los ejemplos cubren casos diversos",
  "prompt": "Quieres que la IA convierta reseñas de productos en JSON estructurado (con una puntuación, pros y contras). ¿Qué conjunto de ejemplos es mejor?\n\nA:\nEjemplo 1: Excelente producto → {'score': 5, 'pros': ['buena calidad'], 'cons': []}\nEjemplo 2: Está bien → {'score': 3, 'pros': [], 'cons': []}\n\nB:\nEjemplo 1: Buena calidad, pero un poco caro → {'score': 4, 'pros': ['buena calidad'], 'cons': ['caro']}\nEjemplo 2: Envío rápido, empaque intacto, producto tal como se describe → {'score': 5, 'pros': ['envío rápido', 'buen empaque', 'tal como se describe'], 'cons': []}\nEjemplo 3: Muy pocas funciones, no vale lo que cuesta → {'score': 2, 'pros': [], 'cons': ['pocas funciones', 'mala relación precio-valor']}",
  "whyHere": "Acabas de aprender que los buenos ejemplos son diversos y se parecen a la tarea real. Esta comprobación atrapa el instinto tentador de mantener los ejemplos cortos y simples, que en silencio deja de mostrarle a la IA cómo manejar las reseñas con varios puntos que sí va a encontrar.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A es mejor, porque los ejemplos son cortos y no desperdician tokens",
      "correct": false,
      "feedback": "❌ Corto no es lo mismo que efectivo. Los ejemplos de A son demasiado simples («Excelente producto», «Está bien») y nunca muestran cómo extraer varios pros y contras de una reseña compleja. Las reseñas reales suelen traer varios puntos, y A no cubre ese caso."
    },
    {
      "id": "b",
      "text": "B es mejor, porque los ejemplos se parecen más a reseñas reales y cubren distintos casos",
      "correct": true,
      "feedback": "✓ Correcto. B muestra tres casos: pros y contras juntos (ejemplo 1), solo pros (ejemplo 2) y solo contras (ejemplo 3). Además, cada uno se acerca a una reseña real en complejidad, con varios puntos dentro. La IA puede aprender de ahí cómo manejar la tarea de verdad."
    }
  ]
}
```

## Ejemplo resuelto: extraer datos estructurados con few-shot

La tarea más común aquí es extraer datos estructurados de texto no estructurado.

### Tarea: extraer los campos clave de una oferta de trabajo

Versión zero-shot (poco confiable):
```
De la siguiente oferta de trabajo, extrae: puesto, rango salarial,
ubicación, experiencia requerida. Devuélvelo como JSON.

Oferta: Buscamos un desarrollador Python senior, con base en Nueva York,
3-5 años de experiencia, $140-160k al año.
```

La IA podría devolver toda clase de formatos:
```json
{"title": "desarrollador Python", "pay": "140-160k", ...}
```
o
```json
{"job": "desarrollador Python senior", "salary": "$140-160k/año", ...}
```

Los nombres de campo, el formato y las unidades son todos inconsistentes.

Versión few-shot (formato estable):
```
Extrae los campos clave de una oferta de trabajo y devuélvelos con el
siguiente formato JSON.

Ejemplo 1:
Entrada: Buscamos ingeniero frontend, San Francisco, 2-3 años de
experiencia, $120-150k al año
Salida:
{
  "position": "ingeniero frontend",
  "location": "San Francisco",
  "experience": "2-3 años",
  "salary": "$120-150k/año"
}

Ejemplo 2:
Entrada: Urgente: backend Java, Austin (centro), 5+ años requeridos,
$8-10k al mes
Salida:
{
  "position": "backend Java",
  "location": "Austin (centro)",
  "experience": "5+ años",
  "salary": "$8-10k/mes"
}

Ejemplo 3:
Entrada: Analista de datos, remoto, experiencia abierta, $60-80 por hora
Salida:
{
  "position": "analista de datos",
  "location": "remoto",
  "experience": "abierta",
  "salary": "$60-80/hora"
}

Ahora procesa esta:
Entrada: Buscamos un desarrollador Python senior, con base en Nueva York,
3-5 años de experiencia, $140-160k al año.
Salida:
```

Los ejemplos cubren tres unidades salariales (por año, por mes, por hora) y tres tipos de ubicación (ciudad, ciudad más zona, remoto), así que la IA aprende:
- usar nombres de campo en inglés
- conservar la unidad salarial del texto original
- conservar el detalle al extraer la ubicación
- «abierta» también es un requisito de experiencia válido

## Trampas comunes del few-shot

### Trampa 1: muy pocos ejemplos, cobertura incompleta

Si das un solo ejemplo, la IA ve una instancia aislada, no una regla.

**Solución**: al menos 2, idealmente 3.

### Trampa 2: formato inconsistente entre los ejemplos

Una flecha → aquí, dos puntos : allá, varias líneas en otro lado.

**Solución**: elige un formato y síguelo estrictamente en cada ejemplo.

### Trampa 3: todos casos fáciles, ningún caso límite

Los datos reales tienen ruido, ambigüedad y huecos. Si los ejemplos solo muestran el caso ideal, la IA se traba en cuanto se topa con un caso límite.

**Solución**: al menos un ejemplo debería incluir un caso límite (un campo faltante, una redacción ambigua).

### Trampa 4: demasiados ejemplos

Pasados los 5 ejemplos la ganancia es mínima, y quemas tokens extra y alargas la respuesta.

**Solución**: empieza con 2 o 3 y agrega más solo si hace falta. Rara vez necesitas más de 5.

## Cuándo usar few-shot

El few-shot encaja mejor en estas situaciones:

- **Conversión de formato**: texto no estructurado → JSON, Markdown, CSV
- **Clasificación**: análisis de sentimiento, etiquetado de temas, detección de intención
- **Imitación de estilo**: replicar un estilo específico de escritura o de código
- **Reglas difíciles de poner en palabras**: como «qué hace que un comentario sea inútil»

Cuando no encaja:

- **La tarea es simple por sí sola**: «traduce esto al inglés» no necesita ejemplos
- **Cada entrada es única**: escritura creativa, lluvia de ideas; los ejemplos solo te encasillan
- **Necesita conocimiento externo**: «quién ganó el Mundial de 2024»; los ejemplos no ayudan

Una regla práctica: si pudieras mostrarle a un colega humano 2 o 3 ejemplos y entendería qué hacer, few-shot encaja bien.

## Resumen

El few-shot learning usa de 2 a 5 ejemplos para que la IA capte el patrón que quieres, lo cual es más claro que describirlo con palabras. Los ejemplos de alta calidad son: moderados en cantidad (2-5), representativos y diversos, idénticos en formato e inclusivos de casos límite.

El few-shot encaja mejor con la conversión de formato, la clasificación y la imitación de estilo. Al diseñar ejemplos, empieza con 2, asegúrate de que cubran distintos tipos de entrada y usa el mismo formato en todos.

La próxima lección cubre chain-of-thought: cómo lograr que la IA muestre sus pasos de razonamiento y mejorar la exactitud en tareas complejas.

**Próxima lección** [Chain-of-thought: hacer que la IA muestre su razonamiento >>](./04-chain-of-thought.md)

<!-- exercises -->

## 💻 Ejercicios

### Nivel 1: Diseñar ejemplos de alta calidad

Tarea: lograr que la IA clasifique los comentarios de usuario en tres categorías: «solicitud de función», «reporte de error» o «duda de uso».

Diseña 3 ejemplos few-shot que cubran distintos casos y mantengan un formato consistente.

<!-- rubric -->
- Los tres ejemplos representan cada uno una de las tres categorías
- Los ejemplos incluyen un caso límite fácil de confundir (por ejemplo, «la función no sirve» podría ser un error o alguien que no sabe usarla)
- Todos los ejemplos comparten exactamente el mismo formato (misma estructura, mismos marcadores)
- Los ejemplos se leen como comentarios reales de usuario (no líneas idealizadas)
- La razón de clasificación de cada ejemplo es lo bastante clara para ayudar a la IA a aprender el estándar
<!-- answer -->
**Diseño de los ejemplos:**

```
Clasifica los comentarios de usuario como: solicitud de función / reporte
de error / duda de uso

Ejemplo 1:
Comentario: Ojalá se pudieran exportar los datos a Excel por lotes. Ahora
mismo tengo que copiar fila por fila, lo cual es una molestia.
Clasificación: solicitud de función

Ejemplo 2:
Comentario: Después de hacer clic en "Guardar" la página se congela y no
pasa nada. Esperé 5 minutos, sin respuesta, y al recargar los datos no se
habían guardado.
Clasificación: reporte de error

Ejemplo 3:
Comentario: No encuentro dónde cambiar el correo de mi cuenta. Probé en
configuración personal y en gestión de cuenta y no vi la opción.
Clasificación: duda de uso

Ahora clasifica este comentario:
Comentario: [pega el comentario del usuario]
Clasificación:
```

**Por qué funcionan estos ejemplos:**
1. **Diversidad**: tres ejemplos distintos cubren las tres categorías
2. **Límites claros**:
   - El ejemplo 1 dice «ojalá se pudiera», así que es una solicitud de función
   - El ejemplo 2 describe una falla concreta (se congela, no guarda), así que es un error
   - El ejemplo 3 dice «no encuentro», así que es una duda de uso, no una función faltante
3. **Formato consistente**: todos usan el formato «Comentario: [texto] / Clasificación: [categoría]»
4. **Redacción real**: no un simple «quiero una función nueva», sino la forma en que realmente escribe una persona usuaria

<!-- hint -->
Cuando diseñes ejemplos, pregúntate primero: ¿qué caso es el más fácil de clasificar mal? Por ejemplo, «no encuentro una función», ¿es una duda de uso o una función faltante? Usa un ejemplo para fijar ese límite.
<!-- hint -->
Comprueba que tus tres ejemplos compartan exactamente el mismo formato: mismo orden de campos, misma puntuación, mismos saltos de línea. La IA copia de cerca el formato de los ejemplos.

### Nivel 2: Mejorar un prompt few-shot existente

Aquí va un prompt few-shot que no funciona bien. Encuentra los problemas y mejóralo:

```
Extrae los pros y los contras de una reseña de producto, entrega JSON.

Ejemplos:
"calidad decente" -> {"pros": ["calidad"], "cons": []}
"demasiado caro, y el envío es lento" -> {"pros": [], "cons": ["caro", "envío lento"]}

Ahora procesa: [texto de la reseña]
```

Problema: la salida de la IA es inestable: a veces los nombres de campo salen en otro idioma, a veces los pros son adjetivos («bueno») en lugar de puntos concretos («calidad»).

<!-- rubric -->
- Se identifican al menos 3 problemas que causan la salida inestable
- Los ejemplos mejorados son perfectamente consistentes y claros en el formato
- Los ejemplos cubren el caso complejo (pros y contras a la vez, varios puntos)
- Se especifican el nombrado de los campos y el estilo del contenido
- Se agregan la explicación o las restricciones necesarias
<!-- answer -->
**Problemas identificados:**
1. **Ejemplos demasiado simples**: el primer ejemplo es una frase corta y nunca muestra cómo extraer varios puntos de una reseña compleja
2. **Sin estándar unificado**: «calidad» y «caro» están en niveles de abstracción distintos (uno es un sustantivo, el otro un adjetivo)
3. **Ejemplos insuficientes**: solo 2, muy pocos para establecer un patrón estable
4. **Sin casos límite**: nunca muestra la situación compleja de «pros y contras a la vez»

**Prompt mejorado:**

```
Extrae los pros y los contras de una reseña de producto y entrega JSON.

Notas de los campos:
- pros: lista de fortalezas, como sintagmas nominales cortos (por ejemplo
  "envío rápido", "buen empaque"), no adjetivos (no "bueno" ni "genial")
- cons: lista de debilidades, mismo formato

Ejemplo 1:
Entrada: Excelente calidad, buena manufactura, sin problemas después de
una semana de uso.
Salida:
{
  "pros": ["buena calidad", "buena manufactura", "confiable"],
  "cons": []
}

Ejemplo 2:
Entrada: Un poco caro, y el envío tardó una semana en llegar, pero el
producto en sí es bastante bueno.
Salida:
{
  "pros": ["buena calidad del producto"],
  "cons": ["caro", "envío lento"]
}

Ejemplo 3:
Entrada: Muy pocas funciones, solo operaciones básicas, todas las
avanzadas están detrás de un muro de pago.
Salida:
{
  "pros": [],
  "cons": ["pocas funciones", "funciones avanzadas de pago"]
}

Ahora procesa:
Entrada: [texto de la reseña]
Salida:
```

**Qué mejoró:**
1. Se agregaron notas de los campos que dejan explícito usar «sintagmas nominales», no adjetivos
2. Tres ejemplos cubren tres casos: solo pros, pros y contras a la vez, solo contras
3. Los ejemplos son más complejos y muestran cómo extraer varios puntos de una oración larga
4. Formato perfectamente consistente: cada ejemplo tiene un marcador «Entrada:» y «Salida:», con sangría JSON uniforme
5. Un indicador «Entrada:» precede a la salida, marcando dónde empieza la tarea

<!-- hint -->
Cuando un prompt few-shot es inestable, revisa primero: (1) ¿el formato de los ejemplos es consistente? (2) ¿los ejemplos son demasiado simples? (3) ¿cubren casos límite?
<!-- hint -->
Si los nombres de campo o el estilo del contenido de la IA no dejan de moverse, agrega un bloque de «notas de los campos» o de «especificación de salida» al inicio del prompt para fijar el formato que quieres. Los ejemplos muestran la forma; la especificación enuncia el estándar.

<!-- /exercises -->
