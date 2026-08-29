# Lección 3: Práctica: escribir tu primera Skill

> Objetivos de aprendizaje:
> - Crear la estructura de directorios de una Skill
> - Escribir un SKILL.md completo desde cero
> - Entender el principio de divulgación progresiva (progressive disclosure)
> - Invocar tu Skill por primera vez
>
> Requisitos: [<< Lección 2](./02-skill-anatomy.md) | Siguiente: [Lección 4 >>](./04-testing-debugging.md)

## Qué vamos a construir

En esta lección construimos desde cero una Skill real y utilizable: un **organizador de tareas**.

**Qué hace:**
- Entrada: un montón de pendientes desordenados (texto suelto, texto sacado de una captura de pantalla, notas de reunión)
- Salida: una lista limpia agrupada por prioridad y fecha límite

**Por qué esta:**
- Es simple — no hay lógica complicada que estorbe
- Es útil — puedes empezar a usarla hoy mismo
- Ejercita todas las partes centrales de la estructura de una Skill

## Paso 1: Crear el directorio y el archivo

Abre una terminal y ejecuta:

```bash
# Crea el directorio de skills personales (si todavía no tienes uno)
mkdir -p ~/.claude/skills

# Crea el directorio de la Skill
mkdir ~/.claude/skills/task-organizer

# Crea el archivo SKILL.md
touch ~/.claude/skills/task-organizer/SKILL.md
```

**Tu estructura de directorios ahora se ve así:**

```
~/.claude/skills/
└── task-organizer/
    └── SKILL.md
```

Abre `SKILL.md` en el editor de texto que prefieras (VS Code, Cursor, el que uses).

## Paso 2: Escribir el frontmatter

Empieza por los metadatos de la parte superior del archivo: [^S1]

```markdown
---
name: task-organizer
description: Organiza pendientes y los agrupa por prioridad y fecha límite. Úsala con listas de tareas desordenadas, pendientes de reuniones o backlogs de proyecto
---
```

**Lista de verificación:**
- ✓ `name` está en minúsculas y con guiones
- ✓ `description` cubre qué hace (organiza pendientes), qué recibe (una lista desordenada) y cuándo recurrir a ella (pendientes de reuniones, backlogs de proyecto)

## Paso 3: Escribir el título y la introducción

Después del frontmatter, agrega un encabezado:

```markdown
# Organizador de tareas

Extrae tareas de texto sin estructura y organízalas en una lista estructurada por prioridad y fecha límite.
```

**Por qué molestarse con un título y una introducción:**
- El título es para las personas — vuelves a este archivo dentro de tres meses y recuerdas para qué sirve de un vistazo
- La introducción es para Claude — completa el detalle para el que la `description` no tenía espacio

## Paso 4: Definir el formato de entrada

Dile a Claude qué tipo de entrada aceptar: [^S5]

````markdown
## Formato de entrada

Acepta una lista de tareas en cualquiera de estas formas:

- Una lista de texto plano (una tarea por línea)
- Una lista de verificación en Markdown (`- [ ] texto de la tarea`)
- Mensajes con marcas de tiempo ("hay que terminar X para mañana")
- Pendientes enterrados en notas de reunión

**Ejemplo de entrada:**

```
Terminar el informe trimestral
- [ ] Revisar el PR #234
Hay que arreglar ese error de inicio de sesión mañana
Preparar la demo antes del viernes
Actualizar la documentación
```
````

**Qué consigue esta sección:**
- Enumera todas las formas de entrada que la Skill podría encontrarse
- Da un ejemplo concreto, para que Claude sepa cómo se ve una entrada real

## Paso 5: Escribir los pasos de procesamiento

Este es el corazón de las instrucciones y tiene que ser específico: [^S5]

```markdown
## Pasos de procesamiento

Recórrelos en orden:

1. **Extraer las tareas**
   - Cada línea o elemento de lista es una tarea
   - Quita los marcadores de casilla (`- [ ]` o `- [x]`)
   - Conserva la descripción central de la tarea

2. **Identificar la información temporal**
   - Busca palabras de fecha: hoy, mañana, esta semana, nombres de días (lunes, viernes), fechas explícitas (2024-01-15)
   - Busca expresiones de plazo: "para X", "vence X", "antes de X"
   - Si no hay una fecha explícita, márcala como "sin fecha límite"

3. **Asignar una prioridad**
   - Contiene "urgente", "cuanto antes", "ya mismo", "de inmediato" → Urgente
   - Contiene "importante", "prioridad", "crítico" → Importante
   - Vence hoy o mañana → Urgente
   - Vence dentro de esta semana → Importante
   - Todo lo demás → Normal

4. **Ordenar**
   - Dentro de un nivel de prioridad, ordena por fecha límite, la más próxima primero
   - Las tareas sin fecha límite van al final dentro de su nivel
```

**Por qué tanto detalle:**

Claude no es una persona y no va a "entender lo que quisiste decir". Escribe «asigna una prioridad» y no tendrá idea de qué criterio aplicar. Escribe «contiene 'urgente' → Urgente» y no queda nada que adivinar. [^S2]

## Paso 6: Definir el formato de salida

Dile a Claude cómo debe verse el resultado:

```markdown
## Formato de salida

Usa esta estructura, con emoji como marcador de prioridad:

### 🔴 Urgente (hoy o mañana)
- [tarea] - fecha límite

### 🟡 Importante (esta semana)
- [tarea] - fecha límite

### ⚪ Normal
- [tarea] - fecha límite (si la hay)

**Ejemplo de salida:**

### 🔴 Urgente
- Arreglar el error de inicio de sesión - mañana
- Terminar el informe trimestral - hoy

### 🟡 Importante
- Revisar el PR #234 - viernes
- Preparar la demo - viernes

### ⚪ Normal
- Actualizar la documentación - sin fecha límite
```

**Qué te da el ejemplo:**

En cuanto Claude ha visto un ejemplo, la disposición, los símbolos y el formato quedan resueltos. Nada de adivinar dónde va el emoji o si la hora va antes o después de la tarea.

## Paso 7: Manejar los casos límite

Deja por escrito cómo tratar los casos raros:

```markdown
## Notas

- Si la entrada está vacía o no se puede identificar ninguna tarea, muestra "No se encontraron tareas válidas"
- Si ninguna de las tareas trae información temporal, ponlas todas en Normal
- Si la descripción de una tarea es larga (más de 100 caracteres), conserva los primeros 80 y agrega "..."
- Omite las tareas ya marcadas como hechas (`[x]`)
```

## El archivo completo

Tu `SKILL.md` ahora debería verse así:

```markdown
---
name: task-organizer
description: Organiza pendientes y los agrupa por prioridad y fecha límite. Úsala con listas de tareas desordenadas, pendientes de reuniones o backlogs de proyecto
---

# Organizador de tareas

Extrae tareas de texto sin estructura y organízalas en una lista estructurada por prioridad y fecha límite.

## Formato de entrada

Acepta una lista de tareas en cualquiera de estas formas:

- Una lista de texto plano (una tarea por línea)
- Una lista de verificación en Markdown (`- [ ] texto de la tarea`)
- Mensajes con marcas de tiempo ("hay que terminar X para mañana")
- Pendientes enterrados en notas de reunión

## Pasos de procesamiento

Recórrelos en orden:

1. **Extraer las tareas**
   - Cada línea o elemento de lista es una tarea
   - Quita los marcadores de casilla
   - Conserva la descripción central de la tarea

2. **Identificar la información temporal**
   - Busca palabras de fecha: hoy, mañana, esta semana, nombres de días, fechas explícitas
   - Busca expresiones de plazo: "para X", "vence X"
   - Si no hay una fecha explícita, márcala como "sin fecha límite"

3. **Asignar una prioridad**
   - Contiene "urgente", "cuanto antes", "ya mismo", o vence hoy/mañana → Urgente
   - Contiene "importante", "prioridad", o vence dentro de esta semana → Importante
   - Todo lo demás → Normal

4. **Ordenar**
   - Dentro de un nivel de prioridad, ordena por fecha límite, la más próxima primero

## Formato de salida

### 🔴 Urgente (hoy o mañana)
- [tarea] - fecha límite

### 🟡 Importante (esta semana)
- [tarea] - fecha límite

### ⚪ Normal
- [tarea] - fecha límite (si la hay)

## Notas

- Si la entrada está vacía, muestra "No se encontraron tareas válidas"
- Si ninguna de las tareas trae información temporal, ponlas todas en Normal
- Si la descripción de una tarea es larga (más de 100 caracteres), conserva los primeros 80 y agrega "..."
- Omite las tareas ya marcadas como hechas (`[x]`)
```

Guarda el archivo.

## Paso 8: Tu primera invocación

Abre Claude Code y escribe:

```
/task-organizer

Terminar el informe trimestral
Revisar el PR #234, para el viernes
Arreglar el error de inicio de sesión mañana
Actualizar la documentación
Urgente: un cliente reportó un problema de pagos
```

Claude debería darte:

```
### 🔴 Urgente
- Arreglar el error de inicio de sesión - mañana
- Problema de pagos reportado por un cliente - sin fecha límite

### 🟡 Importante
- Revisar el PR #234 - viernes

### ⚪ Normal
- Terminar el informe trimestral - sin fecha límite
- Actualizar la documentación - sin fecha límite
```

**Si la salida no es la correcta, no te alarmes.** La próxima lección trata enteramente sobre depuración.

## Divulgación progresiva: por qué no escribes cada detalle desde el principio

Quizá notaste que esta Skill no dice nada sobre tareas que dependen de otras tareas, ni sobre tareas asignadas a distintas personas. [^S2][^S5]

**Es a propósito.**

**Divulgación progresiva (progressive disclosure): darle a Claude solo lo que necesita ahora mismo, en vez de echárselo todo encima de una vez.** [^S2]

La primera versión hace el trabajo central y nada más: extraer, clasificar, ordenar. Úsala unos días y, si descubres que de verdad necesitas la asignación de tareas, agrégala entonces.

**Qué ganas con eso:**
- Un archivo de Skill corto: menos contexto consumido, carga más rápida
- Lógica simple: menos maneras de equivocarse
- Confirmación rápida de que el comportamiento central funciona de verdad

Pon a andar la versión uno y luego itera. Así se construye toda buena Skill. [^S2]

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Crear tu propia primera Skill

Toma la tarea que definiste en los ejercicios de las lecciones 1 y 2 y constrúyele un SKILL.md completo.

**Requisitos:**
1. Crea la estructura de directorios
2. Escribe un frontmatter completo (name + description)
3. Escribe instrucciones que cubran como mínimo: formato de entrada, pasos de procesamiento, formato de salida
4. Guarda el archivo
5. Invócala una vez en Claude Code

<!-- rubric -->
- La estructura de directorios es correcta (`~/.claude/skills/nombre-de-tu-skill/SKILL.md`)
- El name y la description del frontmatter siguen las convenciones
- Las instrucciones cubren las tres partes: entrada, pasos, salida
- Los pasos son lo bastante específicos (nada de vaguedades como «analiza los datos»)
- Se invocó con éxito al menos una vez, sin importar si el resultado fue correcto

<!-- answer -->
Ejemplo (construido en torno a una tarea de triaje de comentarios de clientes):

```markdown
---
name: feedback-classifier
description: Clasifica los comentarios de clientes de Slack en reportes de errores, pedidos de funcionalidades y dudas de uso, y etiqueta cada uno con una prioridad. Úsala para la revisión diaria de comentarios
---

# Clasificador de comentarios

Extrae los comentarios de clientes de los mensajes de Slack y organízalos por tipo y prioridad.

## Formato de entrada

Acepta:
- Mensajes de Slack exportados (texto plano)
- Texto extraído de capturas de pantalla de comentarios de clientes
- Mensajes copiados y pegados a mano

## Pasos de procesamiento

1. **Extraer el comentario**
   - Identifica el problema o pedido central de cada mensaje
   - Descarta la charla que lo rodea (saludos, agradecimientos, etc.)

2. **Determinar el tipo**
   - Describe un error, una caída o algo que no funciona → Reporte de error
   - Pide una capacidad nueva o una mejor experiencia → Pedido de funcionalidad
   - Pregunta cómo hacer algo o por qué funciona así → Duda de uso

3. **Etiquetar una prioridad**
   - Afecta a producción, impide trabajar a la gente → P0 (la más alta)
   - Afecta a algunos usuarios, existe una alternativa → P1
   - Detalles, algo deseable pero no urgente → P2

4. **Extraer los detalles clave**
   - Qué parte del producto está involucrada
   - Quién es el usuario (si se menciona)
   - Si es sensible al tiempo

## Formato de salida

### Reportes de errores
- [descripción] - prioridad - área

### Pedidos de funcionalidades
- [pedido] - prioridad - área

### Dudas de uso
- [pregunta] - área

## Notas

- Si un mensaje plantea varios problemas distintos, divídelo en varias entradas
- Si la prioridad no está clara, etiquétala como P1
- Conserva la marca de tiempo original cuando la haya
```

<!-- hint -->
¿No estás seguro de si tus pasos son lo bastante específicos? Pregúntate: si un colega que nunca ha hecho esta tarea siguiera este archivo línea por línea, ¿lo haría bien?

<!-- hint -->
La primera versión no tiene por qué ser perfecta. Escribe el flujo central, ponlo a andar e itera los detalles después

### Nivel 2: Probar los casos límite

Dale a tu Skill una entrada que no se porte bien, como:
- Entrada vacía
- Entrada con el formato corrupto
- Entrada con caracteres especiales

Mira qué sale y anótalo. Usaremos ese resultado para practicar depuración en la próxima lección.

<!-- rubric -->
- Se probó al menos un caso límite
- Se registró tanto la entrada como la salida real
- Se puede decir si la salida coincidió con lo esperado

<!-- answer -->
Prueba de ejemplo:

**Entrada:** cadena vacía

**Esperado:** debería mostrar «No se encontraron tareas válidas»

**Salida real:** (registra lo que Claude produjo de verdad)

**¿Coincidió con lo esperado?:** (sí / no — si no, indica en qué se desvió)

<!-- hint -->
Casos límite a considerar: entrada vacía, entrada mal formada, entrada muy larga, caracteres especiales, valores extremos

<!-- /exercises -->

## Resumen

- **Los 7 pasos para construir una Skill**: directorio → frontmatter → título → entrada → pasos → salida → casos límite
- **Los pasos deben ser específicos**: no «analiza las tareas» sino «busca palabras de fecha: hoy, mañana…»
- **Los ejemplos importan**: muéstrale a Claude cómo se ven de verdad la entrada y la salida
- **Divulgación progresiva**: la versión uno hace solo el trabajo central — no escribas cada detalle desde el principio
- **Cómo invocarla**: `/skill-name` seguido de tu entrada

En la próxima lección vemos cómo probar y depurar Skills: pasar de «funciona» a «funciona correctamente».

[>> Lección 4: Pruebas y depuración](./04-testing-debugging.md)
