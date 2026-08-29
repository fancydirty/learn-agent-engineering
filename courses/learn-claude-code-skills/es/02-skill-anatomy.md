# Lección 2: Anatomía de una Skill: el archivo SKILL.md

> Objetivos de aprendizaje:
> - Entender la estructura en dos partes de SKILL.md
> - Conocer los campos obligatorios del frontmatter YAML
> - Aprender a escribir una description que de verdad funcione
> - Ver cómo organizar la sección de instrucciones
>
> Requisitos: [<< Lección 1](./01-what-are-skills.md) | Siguiente: [Lección 3 >>](./03-first-skill.md)

## Cómo se ve un archivo de Skill

Abre cualquier Skill y encontrarás la misma forma:[^S1]

```markdown
---
name: task-organizer
description: Ordena una lista de pendientes desordenada en grupos por prioridad y fecha límite
---

# Organizador de tareas

Extrae información estructurada de una lista de tareas desordenada.

## Formato de entrada

Acepta cualquiera de estos:
- Una lista de texto plano
- Una lista de verificación en Markdown
- Un registro de chat con marcas de tiempo

## Pasos

1. Extrae el contenido central de cada tarea
2. Identifica la fecha límite, si la hay
3. Juzga la prioridad (urgente / importante / normal)
4. Ordena por fecha límite, la más próxima primero

## Formato de salida

### 🔴 Urgente (vence hoy o mañana)
- [tarea] - hora límite

### 🟡 Importante (vence esta semana)
- [tarea] - hora límite

### ⚪ Normal (sin fecha clara, o más adelante)
- [tarea]
```

**Este archivo tiene dos partes:**

1. **Frontmatter YAML** (todo lo que está entre los marcadores `---`): metadatos que le dan a Claude lo básico sobre esta Skill
2. **Instrucciones en Markdown** (todo lo que viene después): las indicaciones reales que le dicen a Claude qué hacer

## Frontmatter YAML: cómo Claude encuentra tu Skill

El frontmatter es el bloque de arriba del todo envuelto en `---`. Le dice a Claude las dos cosas que más importan:[^S3][^S4]

### name: el identificador único de la Skill

```yaml
name: task-organizer
```

- **Reglas**: letras minúsculas, dígitos y guiones. Sin espacios.
- **Qué hace**: el nombre se convierte en el comando, como `/task-organizer`
- **Consejo**: que sea descriptivo, corto y evidente de un vistazo

**Buenos nombres:**
- `meeting-notes`
- `code-review`
- `changelog-generator`

**Malos nombres:**
- `my-skill-1` (no dice nada)
- `super_amazing_task_helper` (demasiado largo, y los guiones bajos no están permitidos)
- `taskOrganizer` (camelCase — tiene que ser minúsculas con guiones)

### description: el campo que más importa

```yaml
description: Ordena una lista de pendientes desordenada en grupos por prioridad y fecha límite
```

**Esta única frase decide tres cosas:**[^S6]

1. **Cuándo Claude carga esta Skill por su cuenta**
2. **Qué ven los usuarios en la lista de Skills**
3. **Para qué entiende Claude que sirve esta Skill**

Por eso merece más cuidado que cualquier otra cosa del archivo:[^S6]

> "The description is the single most important field in your frontmatter. A bad description means your skill either never triggers or triggers on everything. The formula: What it does + When to use it + Key capabilities."

(La description es el campo más importante del frontmatter: si está mal escrita, tu Skill nunca se activa o se activa con todo. La fórmula: qué hace + cuándo usarla + capacidades clave.)

**Una buena description:**
```yaml
description: Ordena una lista de pendientes desordenada en grupos por prioridad y fecha límite. Úsala con listas de tareas sin estructura o con pendientes surgidos de reuniones
```

**Malas descriptions:**
```yaml
description: Ayuda con tareas  # Demasiado vago — Claude no tiene idea de cuándo recurrir a ella
description: Un potente gestor de tareas con análisis inteligente de prioridades  # Texto de marketing; los detalles útiles vienen al final, si es que vienen
```

### Campos opcionales (se ven en la lección 6, no aquí)

- `model`: elegir qué modelo usar
- `allowed-tools`: restringir qué herramientas puede tocar esta Skill
- `version`: un número de versión

**Para tu primera Skill, `name` y `description` es todo lo que necesitas.**[^S4]

## Instrucciones en Markdown: decirle a Claude cómo hacerlo

Todo lo que sigue al frontmatter está escrito para que Claude lo lea y lo siga.[^S1]

**Las buenas instrucciones comparten tres rasgos:**

### 1. Secciones claras

Usa encabezados para separar las partes:

```markdown
## Formato de entrada
(qué tipos de entrada aceptar)

## Pasos
(detalla el procedimiento, un paso a la vez)

## Formato de salida
(cómo debe verse el resultado)

## Casos límite
(cómo manejar las situaciones incómodas)
```

### 2. Pasos concretos

**Flojo:**
```markdown
1. Analiza las tareas
2. Determina la prioridad
3. Muestra el resultado
```

**Sólido:**
```markdown
1. Lee la lista de tareas, una tarea por línea
2. Extrae palabras clave de fecha del texto de la tarea (hoy, mañana, viernes, 2024-01-15, etc.)
3. Si una tarea contiene "urgente", "cuanto antes" o "para el cierre del día", márcala como prioridad alta
4. Ordena por fecha límite, la más próxima primero
5. Muestra tres grupos: Urgente, Importante, Normal
```

### 3. Ejemplos

Si el formato de salida importa, muestra uno:

```markdown
## Formato de salida

### 🔴 Urgente
- Terminar el informe trimestral - mañana 17:00
- Arreglar el error en producción - hoy

### 🟡 Importante
- Revisar el PR #234 - este viernes

### ⚪ Normal
- Actualizar la documentación
- Mejorar el rendimiento
```

En cuanto Claude tiene un ejemplo, sabe exactamente cómo disponer las cosas. Mostrar gana a describir: una salida de muestra hace más trabajo que tres párrafos sobre formato.

```agentmentor-check
{
  "id": "skills-zh-02-description-quality",
  "label": "Detectar la description que funciona",
  "prompt": "Escribiste una Skill que convierte el historial de commits de Git en un changelog que los clientes puedan leer. ¿Cuál description es mejor?",
  "whyHere": "Acabas de aprender la fórmula de la description (qué hace + cuándo usarla + capacidades clave). Las descriptions vagas le parecen correctas a un lector humano, así que la prueba es si puedes distinguirlas antes de publicar una.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "description: Una herramienta de changelog potente e inteligente que hace que los lanzamientos de tu proyecto se vean profesionales y fáciles de leer para cualquiera",
      "correct": false,
      "feedback": "Esta se lee como una página de producto, no como una instrucción. «Potente» y «bonita» no significan nada para Claude, y no aparece ninguno de los hechos que la activarían: ni commits de Git, ni salida para clientes, ni filtrado. O se queda sin usar, o se dispara con cualquier petición que mencione un proyecto."
    },
    {
      "id": "b",
      "text": "description: Convierte el historial de commits de Git en un changelog para clientes, filtrando los commits internos y reescribiendo la jerga en lenguaje sencillo",
      "correct": true,
      "feedback": "Correcto. Nombra qué hace (produce un changelog), qué recibe como entrada (commits de Git) y las capacidades clave (filtrar, reescribir la jerga). Palabras como «changelog» y «para clientes» le dan a Claude algo concreto con lo que contrastar una petición."
    }
  ]
}
```

## Cómo trabajan juntas las dos partes

**El frontmatter es el mecanismo de descubrimiento; las instrucciones son la guía de ejecución.**[^S2][^S5]

1. Escribes `/task-organizer`, o simplemente dices «ayúdame a ordenar estas tareas»
2. Claude lee el `name` y la `description` del frontmatter y decide si carga esta Skill
3. Si la carga, Claude lee las instrucciones completas
4. Claude recorre los pasos tal como están escritos
5. La salida coincide con el formato que especificaron las instrucciones

**Por esto la description tiene que ser buena**: es la única evidencia que tiene Claude al decidir si usa esta Skill o no.[^S6]

Escribe «ayuda con tareas» y Claude no tendrá idea de qué situaciones la piden. Escribe «ordena una lista de pendientes desordenada en grupos por prioridad y fecha límite» y las palabras «ordenar», «pendientes» y «tareas» en una petición bastan para traerla.

## Un ejemplo real: desarmar una Skill de revisión de código

Esta es una Skill que se usa de verdad:

```markdown
---
name: code-review
description: Revisa cambios de código en busca de violaciones de las convenciones del equipo, errores probables y problemas de rendimiento
---

# Asistente de revisión de código

## Lista de verificación de la revisión

Recorre cada punto de abajo:

### 1. Convenciones
- ¿Los nombres de variables siguen la convención del equipo (camelCase, nombres significativos)?
- ¿Hay funciones de más de 50 líneas (considera dividirlas)?
- ¿Hay código duplicado (DRY)?

### 2. Errores probables
- ¿Hay errores sin manejar (try-catch, valores de retorno de error)?
- ¿Alguna posible desreferencia de null?
- ¿Algún riesgo de inyección SQL (si hay una base de datos de por medio)?

### 3. Rendimiento
- ¿Hay consultas N+1?
- ¿Hay bucles anidados innecesarios?
- ¿Hay cálculos repetidos que se podrían cachear?

## Formato de salida

Para cada problema, indica:
- **Ubicación**: nombre de archivo + número de línea
- **Problema**: qué está mal exactamente
- **Sugerencia**: cómo arreglarlo

Si no hay nada mal, muestra "✓ Revisión de código superada"
```

**Desglosado:**

- **La description del frontmatter**: dice qué hace (revisa código) y qué comprueba (convenciones, errores, rendimiento)
- **Las instrucciones se dividen en tres listas de verificación**: convenciones, errores, rendimiento, cada una con puntos concretos que mirar
- **El formato de salida es explícito**: cada problema debe llevar una ubicación, un problema y una sugerencia

Una Skill escrita así acierta al primer intento.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Arreglar un frontmatter roto

¿Qué está mal en este frontmatter y cómo lo arreglarías?

```markdown
---
name: Mi Herramienta Increíble
description: Una herramienta
---
```

<!-- rubric -->
- Se identifica el problema de `name` (sin espacios, debe ir en minúsculas, con guiones)
- Se identifica el problema de `description` (demasiado vaga, no dice qué hace)
- Se propone una mejora concreta

<!-- answer -->
**Problemas:**

1. `name` tiene espacios y mayúsculas. Debería ser `mi-herramienta-increible` — aunque el nombre en sí sigue siendo malo, porque no dice nada sobre qué hace la Skill
2. `description` es solo «Una herramienta». No dice qué hace la Skill ni cuándo recurrir a ella

**Una versión mejor:**

```markdown
---
name: api-doc-generator
description: Genera documentación de API a partir de los comentarios del código, con soporte para los formatos JSDoc y docstring de Python
---
```

<!-- hint -->
Vuelve a las reglas de nombrado: letras minúsculas, dígitos, guiones

<!-- hint -->
Vuelve a la fórmula de la description: qué hace + cuándo usarla + capacidades clave

### Nivel 2: Escribir un frontmatter para tu propio caso

Toma la tarea que encontraste en el ejercicio de la lección 1 y escríbele un frontmatter.

<!-- rubric -->
- `name` sigue las reglas de nombrado (minúsculas, guiones, descriptivo)
- `description` cubre qué hace, cuándo usarla y las capacidades clave
- `description` cabe en una sola frase, por debajo de unos 200 caracteres

<!-- answer -->
Un ejemplo, basado en la tarea de comentarios de clientes de la lección 1:

```markdown
---
name: feedback-classifier
description: Clasifica los comentarios de clientes de Slack en reportes de errores, pedidos de funcionalidades y dudas de uso, etiquetando cada uno con una prioridad. Úsala para la revisión diaria de comentarios
---
```

**Por qué funciona:**
- `name` es descriptivo — sabes qué es de un vistazo
- `description` cubre qué hace (ordena y clasifica comentarios), qué entra (comentarios de clientes de Slack), qué sale (categorías más prioridad) y cuándo usarla (la revisión diaria)

<!-- hint -->
Si dudas de si una description es buena, pregúntate: ¿qué palabras de una petición deberían hacer que Claude piense en esta Skill? Pon esas palabras en la description.

<!-- /exercises -->

## Resumen

- **SKILL.md tiene dos partes**: frontmatter YAML (metadatos) e instrucciones en Markdown (indicaciones)
- **Campos obligatorios del frontmatter**: `name` (minúsculas, guiones, único) y `description` (lo que impulsa la activación automática)
- **La fórmula de la description**: qué hace + cuándo usarla + capacidades clave
- **Tres rasgos de unas buenas instrucciones**: secciones claras, pasos concretos, ejemplos resueltos
- **Cómo encajan las partes**: el frontmatter permite a Claude encontrar la Skill; las instrucciones le permiten ejecutarla

En la próxima lección empezamos desde cero y escribimos una Skill completa de principio a fin.

[>> Lección 3: Práctica: escribir tu primera Skill](./03-first-skill.md)
