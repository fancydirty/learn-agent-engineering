# Lección 1: Qué es un prompt y por qué importa

> Objetivos de aprendizaje:
> - Entender qué es un prompt y qué hace
> - Distinguir un prompt vago de uno claro
> - Ver cómo la calidad del prompt moldea lo que devuelve la IA
>
> Requisitos: Ya usaste alguna herramienta de chat con IA | Siguiente: [Lección 2 >>](./02-prompt-structure.md)

## Ya estás usando prompts (quizá no muy bien)

Abres ChatGPT o Claude, escribes «escríbeme un informe» y recibes de vuelta algo genérico que no coincide con lo que realmente necesitabas. Eso no es la IA fallándote. Tu prompt era demasiado vago. Lo único que vio la IA fueron tres palabras. No tiene idea de para quién es el informe, qué problema debería resolver, qué tono debería usar ni qué debería incluir.

Un prompt es la instrucción que le das a la IA[^S13]. Determina cuánto de tu intención puede captar la IA y pone un techo a la calidad de lo que recibes de vuelta. Misma pregunta, dos resultados: una instrucción vaga obtiene una respuesta vaga, una clara obtiene un resultado preciso. Esta lección te enseña a detectar esa diferencia, que es la base de todo lo que viene después.

## Qué es un prompt

Un **prompt** es el texto que le das a un modelo de lenguaje grande (LLM) para decirle qué quieres[^S13]. Puede ser una pregunta, una descripción, una tarea o alguna mezcla de las tres.

Un modelo de lenguaje grande es un sistema de IA entrenado con cantidades enormes de texto: "a type of language model notable for its ability to achieve general-purpose language understanding and generation."[^S14] (un tipo de modelo de lenguaje que destaca por su capacidad de lograr comprensión y generación de lenguaje de propósito general). ChatGPT, Claude y herramientas similares pertenecen todas a esta categoría. No son motores de búsqueda. No buscan en internet una respuesta ya hecha; generan texto nuevo que se ajusta a tu instrucción, a partir de patrones aprendidos durante el entrenamiento.

Este es el punto clave: **un LLM solo puede entender la tarea a través de tu prompt.** Todo lo que omitas, lo tiene que adivinar. Cuanto más claro seas, más cerca queda la salida de lo que tenías en mente.

## Prompt vago vs. prompt claro

Dos ejemplos reales muestran la diferencia.

**Escenario 1: pedirle a la IA que explique un concepto técnico**

❌ **Prompt vago:**
```
qué es una API
```

La IA podría entregarte:
- una definición de manual («API significa interfaz de programación de aplicaciones...»)
- algo demasiado técnico (asume que sabes programar)
- o algo demasiado superficial (apenas «sirve para que los programas se comuniquen entre sí»)

✅ **Prompt claro:**
```
Soy product manager y no programo. Explícame qué es una API con una
analogía cotidiana, para que pueda seguir de qué habla mi equipo de
desarrollo cuando lo menciona en las reuniones de planificación.
```

La IA te da:
- una explicación al nivel de un product manager
- una analogía cotidiana (algo como «el menú de un restaurante es una especie de API»)
- ejemplos ligados a tu trabajo real

¿Qué cambió? El prompt claro deja explícitas tres cosas: **quién eres (product manager), tu contexto (no programas) y qué vas a hacer con la respuesta (hablar de requisitos con el equipo de desarrollo).**

**Escenario 2: pedirle a la IA que escriba código**

❌ **Prompt vago:**
```
escribe una función de Python para procesar datos
```

La IA queda adivinando:
- ¿qué datos? ¿una lista, un diccionario, un archivo, una base de datos?
- ¿procesarlos cómo? ¿ordenar, filtrar, transformar, agregar?
- ¿cuáles son los formatos de entrada y salida?

✅ **Prompt claro:**
```
Escribe una función de Python que reciba una lista de calificaciones de
usuario (1-5), descarte las calificaciones menores a 3 y devuelva el
promedio de las restantes, redondeado a un decimal. Incluye anotaciones
de tipo y un docstring.
```

La IA puede producir:
- una firma de función clara
- lógica de filtrado y cálculo que corresponde a la especificación
- documentación y anotaciones de tipo adecuadas

¿Qué cambió? El prompt claro nombra el **formato de entrada, la lógica de procesamiento, el requisito de salida y el estilo de código.**

```agentmentor-check
{
  "id": "prompt-engineering-what-is-prompt-identify-clear",
  "label": "¿Este prompt es claro?",
  "prompt": "¿Cuál prompt es más claro, es decir, cuál le da a la IA una mejor oportunidad de entender lo que quieres?\n\nA: «Resume este artículo»\n\nB: «Resume los puntos principales de este artículo en tres viñetas, de una oración cada una, escritas para una persona no experta»",
  "whyHere": "Acabas de ver que un prompt claro nombra el formato, la audiencia y el alcance. La trampa aquí es suponer que un prompt más corto es automáticamente más claro: comprueba que puedes distinguir los dos.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A es más claro, porque es corto y directo",
      "correct": false,
      "feedback": "❌ Corto no es lo mismo que claro. A nunca dice cuántos puntos, qué tan largo debe ser cada uno ni quién lo va a leer, así que la IA tiene que adivinar. Puedes recibir un párrafo largo, cinco viñetas o algo lleno de jerga."
    },
    {
      "id": "b",
      "text": "B es más claro, porque fija el formato, la longitud y la audiencia",
      "correct": true,
      "feedback": "✓ Correcto. B precisa tres cosas: formato de salida (tres viñetas, una oración cada una), audiencia (una persona no experta) y alcance (los puntos principales). La IA sabe qué debe producir."
    }
  ]
}
```

## La calidad del prompt decide la calidad de la salida

En tareas complejas, la claridad con la que escribes el prompt genera una diferencia medible en la calidad de la salida, y como el mismo prompt se reutiliza una y otra vez, esa brecha se acumula con cada ejecución[^S7]. Visto al revés, un prompt vago te cuesta:

- **Más rondas de revisión.** Recibes una respuesta que no da en el blanco, agregas un detalle, recibes otra que sigue desviada, agregas otro más. Hacen falta varias pasadas para acercarte a lo que querías.
- **Salidas inconsistentes.** Haz la misma pregunta difusa dos veces y el estilo, la profundidad y el énfasis vuelven distintos cada vez.
- **Tokens y tiempo desperdiciados.** Un prompt vago hace que la IA genere una pila de material que no puedes usar, quemando tu presupuesto de tokens (si estás en una API de pago) o tu paciencia.

**Hallazgo clave:** el grupo de investigación de Developer Tools de Microsoft encontró que, en tareas de generación de código, "prompts with explicit specifications reduced the need for back-and-forth refinements by 68%."[^S12] (los prompts con especificaciones explícitas redujeron en un 68 % la necesidad de refinamientos de ida y vuelta). Eso significa que tienes muchas más probabilidades de obtener código utilizable al primer intento, en lugar de rodear el objetivo por una tercera y una cuarta ronda.

La recompensa de un prompt claro aparece de inmediato: menos ensayo y error, una tasa de acierto más alta al primer intento y una salida que de verdad puedes dirigir.

## La ingeniería de prompts es una habilidad

La ingeniería de prompts es la práctica sistemática de diseñar y refinar prompts[^S13]. No se trata de encontrar un conjuro mágico. Se trata de entender cómo funciona la IA y de aprender a expresar lo que necesitas en términos sobre los que pueda actuar.

En 2026, los modelos siguen bien las instrucciones: manejan indicaciones complejas, documentos largos y tareas de varios pasos[^S6]. Pero siguen dependiendo de tu prompt para fijar los límites de la tarea. Un modelo no puede leerte la mente. Lo que no dices, no lo sabe.

La ingeniería de prompts abarca:
- escribir la estructura básica de una instrucción clara (Lección 2)
- usar ejemplos para mostrarle a la IA el patrón que quieres (Lección 3)
- lograr que la IA muestre su razonamiento (Lección 4)
- depurar y mejorar prompts de forma sistemática (Lección 5)
- elegir una estrategia acorde a la tarea (Lección 6)

Este curso enseña métodos reutilizables, no trucos de una sola vez. Una vez que los tienes, puedes trabajar de forma más eficiente con cualquier herramienta basada en LLM.

## Resumen

Un prompt es la instrucción que le das a la IA y decide cuánto de tu intención puede captar. Un prompt vago deja a la IA adivinando; uno claro fija los límites de la tarea, el formato de salida y el contexto que necesita. La investigación muestra que un prompt claro reduce las rondas de revisión y resuelve el trabajo de forma más eficiente.

La próxima lección cubre la estructura básica de un prompt, es decir, cómo descomponer una petición difusa en cuatro partes claras: rol, tarea, formato y restricciones.

**Siguiente** [La estructura básica de un prompt >>](./02-prompt-structure.md)

<!-- exercises -->

## 💻 Ejercicios

### Nivel 1: Detectar y reescribir un prompt vago

Un colega escribió este prompt: «ayúdame a optimizar este código». Nombra los tres problemas principales que tiene y luego reescríbelo en una versión clara.

<!-- rubric -->
- Se identifican al menos 2 de los problemas clave (sin objetivo de optimización, sin lenguaje ni contexto del código, sin formato de salida especificado)
- La reescritura nombra un objetivo de optimización (rendimiento / legibilidad / seguridad, etc.)
- La reescritura incluye el contexto que la IA necesita
- La reescritura especifica el formato de salida esperado
<!-- answer -->
**Análisis de los problemas:**
1. Sin objetivo de optimización: ¿rendimiento, legibilidad o seguridad?
2. Sin contexto del código: ¿qué lenguaje? ¿qué hace? ¿hay problemas conocidos?
3. Sin formato de salida: ¿quieres el código reescrito o una lista de sugerencias?

**Ejemplo de reescritura:**
```
Eres un ingeniero senior de rendimiento en Python.

Analiza los cuellos de botella de rendimiento del siguiente código de
procesamiento de datos en Python y dame recomendaciones de optimización.

Contexto: este código procesa una lista de 100 000 registros de usuario y
actualmente tarda 30 segundos en ejecutarse.

Formato de salida:
1. Cuellos de botella actuales (ordenados por impacto, indicando el volumen
   de datos a partir del cual cada uno se vuelve un problema)
2. Recomendaciones (cada una con: el cambio concreto, la mejora de
   rendimiento esperada y el fragmento de código optimizado)

Código:
[pega el código]
```

<!-- hint -->
Parte de los cuatro elementos que verás en la Lección 2: ¿cuáles le faltan a este prompt? ¿Qué falla en el rol, la tarea, el formato y las restricciones?
<!-- hint -->
Piénsalo así: si tú fueras la IA y solo vieras «optimiza este código», ¿podrías saber qué hacer? ¿Qué información extra necesitarías para dar una respuesta útil?

### Nivel 2: Diseñar un prompt para una situación real

Elige una situación en la que hayas usado una herramienta de IA hace poco (o usa esta): **pídele a la IA que escriba un correo a un cliente para explicarle por qué se retrasó la entrega de un producto y disculparse por ello.**

Diseña un prompt claro que asegure que la IA produzca un correo acorde a tus necesidades.

<!-- rubric -->
- El prompt nombra la audiencia del correo (el rol y el contexto del cliente)
- El prompt indica la razón específica del retraso y la nueva fecha de entrega
- El prompt especifica el tono y el estilo del correo (formal, sincero, profesional, etc.)
- El prompt incluye las restricciones necesarias (longitud, estructura, qué evitar, etc.)
- El prompt está bien estructurado, de modo que la IA pueda asimilar todos los requisitos de una sola vez
<!-- answer -->
**Ejemplo de prompt:**

```
Eres un ejecutivo de cuentas profesional, con experiencia en conservar la
confianza del cliente en una situación difícil.

Escribe un correo a un cliente corporativo para explicarle que la entrega
de un proyecto de software se retrasó.

Contexto:
- Cliente: el director de TI de un banco
- Proyecto: un sistema de gestión de riesgos que estamos construyendo
  para ellos
- Fecha de entrega original: 2024-03-15
- Nueva fecha de entrega: 2024-04-01 (un retraso de 2 semanas)
- Motivo del retraso: una auditoría de seguridad detectó que necesitamos
  reforzar el módulo de cifrado de datos, un cambio necesario para
  mantener seguro el sistema

Requisitos del correo:
- Tono: formal, profesional, sincero
- Estructura: disculpa -> motivo -> por qué este retraso conviene al
  cliente -> nuevo cronograma -> qué estamos haciendo para compensarlo
- Longitud: no más de 300 palabras
- Evita: disculparte de más (no repitas "lo lamentamos mucho" una y otra
  vez), esquivar la responsabilidad, dar garantías vacías

Salida:
Dame solo el cuerpo del correo, sin ninguna introducción del tipo "Aquí
está el correo".
```

**Por qué funciona este prompt:**
- Nombra el rol (ejecutivo de cuentas) y la situación de escritura
- Aporta todo el contexto necesario (quién, qué, cuándo, por qué)
- Especifica requisitos concretos de tono, estructura y longitud
- Dice qué evitar, anticipándose a errores comunes de la IA
- Fija un formato de salida claro que puedes usar directamente

<!-- hint -->
Primero enumera los hechos que este correo tiene que contener: quién, qué pasó, por qué, el nuevo cronograma y cómo lo vas a compensar. Después piensa cómo lograr que la IA sostenga todo eso y además acierte con el tono y el estilo.
<!-- hint -->
Si tu primer prompt no queda lo bastante claro, pruébalo una vez y observa dónde falla la salida de la IA; después agrega restricciones dirigidas a esos huecos. Recuerda: depurar un prompt es un proceso iterativo y normal.

<!-- /exercises -->
