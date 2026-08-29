# Lección 4: Pruebas y depuración: asegurar que tu Skill se comporte

> Objetivos de aprendizaje:
> - Conocer las formas básicas de probar una Skill
> - Diagnosticar las fallas que realmente vas a encontrar
> - Entender el ciclo de iteración
> - Saber cómo verificar si una Skill vale la pena de verdad
>
> Requisitos: [<< Lección 3](./03-first-skill.md) | Siguiente: [Lección 5 >>](./05-code-review-skill.md)

## Tu primera Skill no va a salir bien

Escribiste tu primera Skill, la ejecutaste y notaste cosas como estas:

- Algunas tareas no se reconocieron en absoluto
- Las prioridades salieron mal
- El formato de salida fue un desastre
- O Claude nunca cargó la Skill

**Eso es normal.**

Las Skills son como el código: lograr que corra una vez es la línea de salida, no la de llegada. Toda Skill que realmente resulta útil llegó ahí después de varias rondas de revisión.[^S8]

Esta lección te da una manera repetible de encontrar y arreglar esos problemas.

## Método de prueba 1: invocarla directamente

**La prueba más simple es la invocación directa: la llamas una vez con `/skill-name` y observas qué sale.**[^S1]

### Prepara tus casos de prueba

Antes de invocar nada, anota entre tres y cinco entradas.

**Casos normales:**
```
Terminar el reporte trimestral
Revisar el PR #234, antes del viernes
Arreglar el bug de login mañana
```

**Casos límite:**
```
(entrada vacía)
```

**Casos basura:**
```
Este es un párrafo de prosa completamente ajena que no contiene ninguna tarea
asldfkjasldfj!@#$%
```

### Ejecuta las pruebas

En Claude Code, pásalas de una en una:

```
/task-organizer

Terminar el reporte trimestral
Revisar el PR #234, antes del viernes
Arreglar el bug de login mañana
```

**Observa tres cosas:**

1. **¿Claude cargó la Skill?** (Si no, el problema está en la `description`.)
2. **¿El formato de salida es correcto?** (Si está desordenado, el problema está en tu sección de formato de salida.)
3. **¿El contenido es el que esperabas?** (Si las categorías están mal, el problema está en tus pasos de procesamiento.)

### Anota lo que pasó

Basta con una tabla chica:

| Entrada | Esperado | Obtenido | Problema |
|---------|----------|----------|----------|
| "Terminar el reporte\nArreglar el bug mañana" | 2 tareas; el bug es urgente | Solo encontró 1 tarea | Los saltos de línea no se tratan como separadores |

## Método de prueba 2: observar el comportamiento de carga

A veces el problema no está en las instrucciones, sino en el frontmatter.

### Problema: Claude no carga la Skill por su cuenta

**Lo que ves:** dices "ayúdame a organizar estas tareas" y Claude ignora tu Skill task-organizer.

**Causas probables:**

1. **La `description` es demasiado genérica**
   ```yaml
   description: Maneja tareas  # Demasiado vago — Claude no tiene idea de cuándo aplica
   ```

   **Arreglo:** mete las palabras disparadoras.
   ```yaml
   description: Organiza pendientes y los agrupa por prioridad y fecha límite. Úsala con listas de tareas desordenadas o con los acuerdos de una reunión
   ```

2. **La `description` no contiene las palabras que en realidad dices**

   Si dices "ayúdame a ordenar estos pendientes" pero la palabra "pendiente" no aparece por ningún lado en la `description`, puede que Claude nunca piense en la Skill.[^S6]

   **Arreglo:** escribe en la `description` las palabras que un usuario diría de forma plausible.

### Problema: Claude carga la Skill equivocada

**Lo que ves:** querías task-organizer, pero Claude tomó otra.

**Causa probable:** la `description` de la otra Skill se parece más a tu entrada.

**Arreglo:** fuerza la llamada con `/task-organizer`, o afina tu `description` para que sea más específica que la de la otra Skill.

## Diagnosticar las fallas más comunes

### Problema 1: el formato de salida está mal

**Lo que ves:** la Skill corre, pero el formato no cuadra.

**Ejemplo:**

```
Urgente: Arreglar el bug de login - mañana
Importante: Revisar el PR #234 - viernes
```

Querías secciones agrupadas con emoji y encabezados; Claude te dio una lista de texto plano.

**Causa:** la sección de formato de salida no es lo bastante específica, o no tiene ejemplo.

**Arreglo:** pon un ejemplo completo en la sección "Formato de salida" de tu SKILL.md:

```markdown
## Formato de salida

La salida debe seguir este formato exactamente, incluyendo el emoji, los encabezados y la indentación:

### 🔴 Urgente (hoy o mañana)
- Arreglar el bug de login - mañana

### 🟡 Importante (esta semana)
- Revisar el PR #234 - viernes

### ⚪ Normal
- Terminar el reporte trimestral - sin fecha límite declarada
```

**Di "debe seguir este formato exactamente" y luego muestra la cosa completa.**

### Problema 2: el reconocimiento es impreciso

**Lo que ves:** algunas tareas se pierden, o caen en la categoría equivocada.

**Ejemplo:**

Entrada:
```
Hay que arreglar ese bug mañana
Dejar lista la demo antes del viernes
```

Salida:
```
### ⚪ Normal
- Hay que arreglar ese bug mañana - sin fecha límite declarada
- Dejar lista la demo antes del viernes - sin fecha límite declarada
```

Ambas tienen una fecha límite clara y ambas quedaron marcadas como si no la tuvieran.

**Causa:** las reglas de reconocimiento de tiempo en tus pasos de procesamiento no cubren suficientes casos.

**Arreglo:** complétalas.

```markdown
2. **Identificar información temporal**
   - Busca palabras clave de fecha:
     * hoy, esta noche
     * mañana
     * pasado mañana
     * esta semana, de lunes a domingo
     * la próxima semana, el próximo <día de la semana>
     * fechas explícitas (2024-01-15, 15 de enero, 15/1)
   - Busca formulaciones de fecha límite:
     * antes de X, para X
     * vence X, fecha límite X
     * tiene que estar listo para X
```

**La idea:** deja por escrito todas las formulaciones que se te ocurran.

### Problema 3: los casos límite se cuelan

**Lo que ves:** la entrada normal funciona bien, pero una entrada inusual hace que la Skill se comporte raro.

**Ejemplo:**

Entrada: una cadena vacía

Salida: Claude se traba, o produce una pila de texto sin sentido.

**Causa:** tu sección "Notas" nunca dijo qué hacer con una entrada vacía.

**Arreglo:**

```markdown
## Notas

- **Ante una entrada vacía o sin tareas válidas**, imprime "No se encontraron tareas válidas — por favor entrega una lista de pendientes"
- **Cuando ninguna tarea tenga información temporal**, pon todo bajo "Normal" y agrega la nota "No se detectaron fechas límite explícitas"
- **Cuando la descripción de una tarea pase de 100 caracteres**, trúncala a los primeros 80 más "..."
- **Cuando la entrada contenga ítems ya completados (`[x]`)**, sáltatelos
```

## El ciclo de iteración

**Las buenas Skills no se escriben de una sola vez. Salen de un ciclo probar-arreglar-probar:**[^S8]

```
1. Escribe la primera versión (solo el comportamiento central)
2. Córrela contra 3-5 casos de prueba
3. Anota qué salió mal
4. Edita SKILL.md
5. Prueba de nuevo
6. Repite 3-5 hasta que pasen todos los casos de prueba
7. Úsala en serio durante una semana
8. Encuentra problemas nuevos
9. Vuelve al paso 4
```

**No esperes que la versión uno salga bien.** Haz que corra, después que sea correcta, después que sea buena.

```agentmentor-check
{
  "id": "skills-zh-04-diagnosis",
  "label": "Diagnóstico de una falla de carga",
  "prompt": "Construiste una Skill llamada changelog-gen que convierte commits de Git en un changelog. Su description dice «Genera un changelog». En Claude Code dices «ayúdame a generar un changelog», pero Claude nunca carga la Skill. ¿Cuál es la causa más probable?",
  "whyHere": "Acabas de ver cómo la description gobierna la carga automática. Esto verifica si puedes distinguir una falla de descubrimiento (Claude nunca pensó en la Skill) de una falla de instalación (la Skill no está ahí). Las dos se ven idénticas desde afuera, pero tienen arreglos completamente distintos.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "El archivo de la Skill está guardado en el directorio equivocado, así que Claude no puede verlo",
      "correct": false,
      "feedback": "Si el archivo estuviera en el lugar equivocado, `/changelog-gen` tampoco funcionaría. El síntoma aquí es que Claude no la cargó *automáticamente*, lo que significa que la Skill existe y era legible — la description simplemente no la trajo a la mente."
    },
    {
      "id": "b",
      "text": "La description es demasiado genérica y no tiene palabras clave disparadoras",
      "correct": true,
      "feedback": "Correcto. «Genera un changelog» nunca dice cuál es la entrada (commits de Git) ni cuándo hay que recurrir a ella. La palabra «changelog» sí aparece, pero «genera» no carga ninguna señal. Reescríbela como «Convierte el historial de commits de Git en un changelog orientado al cliente» — ahora la entrada (commits) y el escenario (orientado al cliente, historial) están ambos ahí, y Claude puede hacer coincidir sobre ellos."
    }
  ]
}
```

## ¿La Skill sirve de verdad?

Una vez que corre correctamente, queda una pregunta mayor: **¿esta Skill realmente te está ahorrando tiempo?**[^S8]

### Compáralo A/B

La comparación es simple: corre la misma tarea varias veces con y sin la Skill, y toma el tiempo en ambos casos.

**Sin la Skill:**

Toma el tiempo. Explicas el proceso a mano, Claude ejecuta — ¿cuánto tarda eso en promedio?

**Con la Skill:**

Toma el tiempo. Invocas la Skill, Claude ejecuta — ¿cuánto en promedio?

**Si la versión con Skill no es más rápida, o la calidad es peor, a la Skill todavía le falta trabajo.**

### Úsala durante una semana

La prueba de verdad es el uso real.[^S10]

**Lleva la cuenta de estos números:**

- Cuántas veces la invocaste
- Cuántas veces el resultado sirvió tal cual, sin ediciones manuales
- Cuántas veces tuviste que volver a correrla o arreglar la salida a mano
- Cuánto tiempo te ahorró

**Si la invocaste menos de tres veces en una semana, probablemente la tarea no es lo bastante repetitiva como para justificar una Skill.**

## Guía rápida de depuración

Cuando una Skill no funciona, arranca por una revisión de falla de carga: recorre la tabla de abajo y descarta la ruta del archivo, el formato del frontmatter y las palabras clave disparadoras, en ese orden.

| Problema | Cómo diagnosticarlo | Dónde arreglarlo |
|----------|---------------------|------------------|
| Claude no carga la Skill automáticamente | Revisa si la `description` contiene las palabras que efectivamente dijiste | Agrega palabras disparadoras, deja explícito el caso de uso |
| El formato de salida está desordenado | Revisa si diste un ejemplo de salida completo | Agrega el ejemplo, agrega "debe seguir este formato exactamente" |
| El reconocimiento es impreciso | Revisa si los pasos de procesamiento enumeran todos los casos | Agrega reglas, agrega más criterios de decisión |
| Los casos límite se comportan mal | Revisa si "Notas" cubre ese caso | Agrega manejo explícito para el caso especial |
| La Skill existe pero no se invoca | Revisa la ruta del archivo, revisa el formato del frontmatter | Confirma que los marcadores `---` estén en el lugar correcto y que la indentación YAML sea válida |

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Depura tu propio Skill

Toma la Skill que construiste en la Lección 3 y pásala por una ronda completa de pruebas:

1. Prepara 3 casos de prueba (uno normal, uno límite, uno basura)
2. Registra la salida esperada y la obtenida para cada uno
3. Encuentra al menos un problema concreto
4. Edita SKILL.md
5. Vuelve a probar y confirma que el problema desapareció

<!-- rubric -->
- Casos de prueba que cubren entrada normal, límite y basura
- Salida esperada y obtenida, ambas por escrito
- Al menos un problema específico identificado (no "se siente medio raro")
- Una parte específica de SKILL.md modificada
- Nueva prueba ejecutada y arreglo confirmado

<!-- answer -->
Una ronda de depuración de ejemplo:

**Caso de prueba 1 (normal):**
- Entrada: `"Terminar el reporte\nArreglar el bug mañana"`
- Esperado: 2 tareas, el bug es urgente
- Obtenido: solo encontró 1 tarea
- **Problema:** el salto de línea `\n` no se trata como separador de tareas

**Arreglo:** extiende el paso "Extraer tareas":
```markdown
1. **Extraer tareas**
   - Divide por saltos de línea (\n) o por marcadores de lista
   - Cada línea, o cada ítem que empiece con `- `, es una tarea
```

**Nueva prueba:** pasa ✓

**Caso de prueba 2 (límite):**
- Entrada: cadena vacía
- Esperado: imprimir "No se encontraron tareas válidas"
- Obtenido: imprimió "### ⚪ Normal (sin tareas)"
- **Problema:** la sección Notas nunca especificó la salida para una entrada vacía

**Arreglo:** extiende "Notas":
```markdown
- **Ante una entrada vacía**, imprime "No se encontraron tareas válidas — por favor entrega una lista de pendientes" y nada más. No imprimas encabezados de categoría.
```

**Nueva prueba:** pasa ✓

<!-- hint -->
Entre los "casos límite" están: entrada vacía, exactamente una tarea, todas las tareas con la misma prioridad, entrada muy larga, caracteres especiales.

<!-- hint -->
Si no logras encontrar ningún problema, tu primera versión estaba sólida. Prueba algo más extremo — 100 tareas de golpe, o descripciones de tareas con emoji adentro.

### Nivel 2: Compara contra no usar Skill

Haz la misma tarea dos veces: una con tu Skill, otra describiéndole directamente a Claude lo que quieres. Después compara:

1. Cuál fue más rápida
2. Cuál produjo mejores resultados
3. Cuál fue más consistente (misma forma de salida entre corridas repetidas)

<!-- rubric -->
- La misma tarea completada de ambas formas
- Tiempos registrados
- Calidad y consistencia evaluadas
- Una afirmación clara de dónde gana la Skill — o una admisión honesta de que no gana

<!-- answer -->
Una comparación de ejemplo:

**Tarea:** organizar un mensaje que contiene 8 pendientes

**Sin la Skill:**
- Tiempo: 45 segundos (15 segundos explicando lo que quería + 30 segundos de Claude)
- Calidad: categorías casi todas correctas, formato inconsistente
- Consistencia: la corrí 3 veces y obtuve una disposición ligeramente distinta cada vez

**Con la Skill:**
- Tiempo: 15 segundos (5 segundos para invocarla + 10 segundos de Claude)
- Calidad: categorías precisas, formato exactamente como lo define la Skill
- Consistencia: la corrí 3 veces y el formato de salida fue idéntico siempre

**Conclusión:** la versión con Skill es 3x más rápida y mucho más consistente. Vale la pena conservarla y mejorarla.

<!-- hint -->
Si la versión con Skill no es más rápida o la calidad es peor, no lo fuerces. Vuelve atrás y cuestiona si esta tarea es adecuada para una Skill.

<!-- /exercises -->

## Resumen

- **Tu primera Skill no va a salir bien** — llegar ahí toma un ciclo probar-arreglar-probar
- **Métodos de prueba:** invocarla directamente, observar el comportamiento de carga, preparar casos de prueba de antemano
- **Fallas comunes:** `description` demasiado genérica, formato de salida poco especificado, reglas de reconocimiento incompletas, casos límite sin manejar
- **Flujo de depuración:** registrar esperado contra obtenido, diagnosticar, editar SKILL.md, volver a probar
- **Demostrar que vale la pena:** comparar tiempo, calidad y consistencia con y sin la Skill, después usarla una semana y contar las invocaciones

En la próxima lección vamos a recorrer una Skill completa de revisión de código y ver cómo manejar un flujo de trabajo más involucrado.

[>> Lección 5: Caso práctico: construir una Skill de revisión de código](./05-code-review-skill.md)
