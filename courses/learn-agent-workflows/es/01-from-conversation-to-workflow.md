# Lección 1: De la conversación al flujo de trabajo: por qué existe la orquestación

> Objetivos de aprendizaje:
> - Entender la diferencia de fondo entre una sola conversación y un flujo de trabajo
> - Reconocer los rasgos de una tarea que encaja con un flujo de trabajo
> - Captar el valor central de la orquestación de flujos de trabajo
>
> Requisitos: Ya usaste Claude Code o una herramienta de IA similar | Siguiente: [Lección 2 >>](./02-workflow-building-blocks.md)

## Tu agente choca contra un muro

Le pides a Claude Code que refactorice una base de código grande: «Divide este monolito de 5000 líneas en microservicios».

Claude se pone a trabajar. Lee archivos, identifica los límites de los módulos, extrae las dependencias y entonces, hacia el archivo 47, la ventana de contexto se llena. Olvida lo que hizo antes, vuelve a empezar y se queda atrapado en un bucle.[^S3]

O le pides que «revise todos los PR abiertos y escriba las notas de la versión de esta semana». Claude solo puede ocuparse de un PR a la vez, así que lo ejecutas 20 veces a mano y vuelves a explicar las reglas de formato en cada pasada.

Ese es el techo de una sola conversación: una conversación, una ventana de contexto, una cadena de razonamiento. Para las tareas complejas, este patrón se rompe.[^S1]

## Qué es un flujo de trabajo

Un flujo de trabajo es un script ejecutable que descompone una tarea compleja en pasos, delega cada paso a un agente nuevo y coordina el conjunto por sí mismo.[^S2]

Las diferencias clave:

| Dimensión | Una sola conversación | Flujo de trabajo |
|------|---------|--------|
| Flujo de control | El agente decide qué hacer a continuación | El script decide qué hacer a continuación |
| Contexto | Todo el historial vive en una sola ventana | Cada paso recibe su propio contexto |
| Paralelismo | Se ejecuta en secuencia | Puede lanzar muchos agentes a la vez |
| Repetibilidad | Puede variar en cada ejecución | Script fijo, ejecuciones deterministas |
| Escala que admite | Tareas pequeñas (unos pocos archivos) | Tareas grandes (cientos de archivos, varias etapas de validación) |

Por ejemplo, un flujo de trabajo de refactorización podría verse así:

```javascript
// Ejemplo de pseudocódigo
async function refactorWorkflow(codebase) {
  // Paso 1: analizar todos los módulos en paralelo
  const modules = await Promise.all(
    codebase.files.map(file => 
      agent({ task: `Analiza las responsabilidades y dependencias de ${file}` })
    )
  );
  
  // Paso 2: proponer los límites de los microservicios
  const plan = await agent({ 
    task: 'Diseña los límites de los microservicios a partir del análisis',
    context: modules 
  });
  
  // Paso 3: extraer cada servicio en paralelo
  const services = await Promise.all(
    plan.services.map(svc => 
      agent({ task: `Extrae el código del servicio ${svc.name}` })
    )
  );
  
  // Paso 4: verificar que pasen las pruebas de cada servicio
  return await agent({ 
    task: 'Ejecuta la suite de pruebas de cada servicio',
    context: services 
  });
}
```

El script guarda los bucles, las bifurcaciones y los resultados intermedios; el contexto de Claude solo llega a ver la respuesta final. La orquestación es determinista y solo el trabajo dentro de cada paso está impulsado por el modelo.[^S2]

## Cuándo encaja un flujo de trabajo

Cuatro rasgos marcan una tarea que encaja con un flujo de trabajo:

1. **Más agentes de los que una sola conversación puede coordinar.** Una sola conversación puede manejar de 3 a 5 subagentes; más allá de eso, necesitas un flujo de trabajo.
2. **Quieres la orquestación codificada como un script legible y reutilizable.** Se escribe una vez y se vuelve a ejecutar cuando haga falta.
3. **La tarea se divide en fases claras.** Analizar, planificar, implementar, verificar.
4. **Necesitas ejecución en paralelo o verificación cruzada.** Subtareas independientes, validación adversarial, comparación tipo torneo.

Los docs oficiales lo dicen sin rodeos: "Reach for a workflow when a task needs more agents than one conversation can coordinate, or when you want the orchestration codified as a script you can read and rerun." (Conviene recurrir a un flujo de trabajo cuando una tarea necesita más agentes de los que una sola conversación puede coordinar, o cuando quieres la orquestación codificada como un script que puedas leer y volver a ejecutar).[^S1]

Escenarios típicos:

- **Auditoría de una base de código.** Escanear 500 archivos, con un agente por archivo revisando problemas de seguridad, y luego agregar los resultados.
- **Migración a gran escala.** Actualizar 200 componentes de Vue 2 a Vue 3 en paralelo y verificar la integración al final.
- **Investigación con verificación cruzada.** Hacer que 5 agentes investiguen la misma pregunta por separado, contrastar los hechos y producir un reporte de consistencia.
- **Revisión de diseño desde varios ángulos.** Evaluar un diseño desde tres ángulos (arquitectura, rendimiento, costo) de forma independiente y luego fusionar.[^S1]

Cuándo un flujo de trabajo es la herramienta equivocada:

- Ediciones simples de un solo archivo o revisiones de código, donde basta con una conversación directa.
- Trabajo abierto como la escritura creativa o la lluvia de ideas.
- Tareas que necesitan mucho criterio humano y no se pueden reducir a pasos.

```agentmentor-check
{
  "id": "workflows-zh-01-scenario-judge",
  "label": "Juzgar si un escenario de generación de docs encaja con un flujo de trabajo",
  "prompt": "Necesitas generar documentación de API para 10 microservicios. Cada servicio tiene entre 20 y 30 endpoints, y el trabajo consiste en: extraer las interfaces del código, generar ejemplos, revisar la consistencia y, al final, consolidarlo todo en un único documento unificado. ¿Este escenario encaja con un flujo de trabajo?",
  "whyHere": "Acabas de aprender los cuatro rasgos que marcan una tarea con forma de flujo de trabajo (cantidad de agentes, script reutilizable, fases claras, ejecución en paralelo). Esta comprobación verifica que puedas aplicar esos criterios a un caso concreto y que no etiquetes mal una tarea muy estructurada y repetible como si fuera trabajo creativo abierto.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "No, porque generar documentación es trabajo creativo que no se puede reducir a pasos.",
      "correct": false,
      "feedback": "Generar documentación de API no es trabajo creativo; es una tarea muy estructurada: extraer, generar, validar, agregar. Cada paso tiene entradas y salidas bien definidas, que es justo lo que le conviene a un flujo de trabajo."
    },
    {
      "id": "b",
      "text": "Sí, porque coordina 10 agentes en paralelo, tiene fases claras y se ejecuta en paralelo.",
      "correct": true,
      "feedback": "Correcto. Este escenario cumple todos los rasgos: 10 servicios superan lo que una sola conversación puede manejar, el proceso se puede congelar en un script reutilizable, las fases son claras y la documentación de cada servicio se puede generar en paralelo antes de la consolidación final."
    }
  ]
}
```

## Cómo evolucionaron los flujos de trabajo

Los flujos de trabajo no aparecieron de la nada. Son la cuarta etapa de la capacidad de orquestación de Claude Code:[^S3]

**Etapa 1: agente monolítico**
```
┌─────────┐
│ Claude  │  Una sola ventana de contexto hace todo:
└─────────┘  leer, planificar, editar, probar
```

**Etapa 2: fan-out de subagentes (la herramienta Agent)**
```
┌─────────┐
│ Claude  │──→ agent: «busca en la base de código»
│ (main)  │──→ agent: «lee estos 40 archivos»
└─────────┘  los resultados vuelven al agente padre
```

**Etapa 3: equipos de agentes**
```
┌─────────┐    ┌─────────┐    ┌─────────┐
│ Planner │───→│ Coder   │───→│ Tester  │
└─────────┘    └─────────┘    └─────────┘
     cada agente conserva su propio rol y contexto
```

**Etapa 4: orquestación con flujos de trabajo**
```
    ┌─────────────────┐
    │ Workflow Script │  guarda bucles, bifurcaciones y estado
    └────────┬────────┘
         ┌───┴───┬───────┬───────┐
         ↓       ↓       ↓       ↓
    agent()  agent() agent() agent()
    cada llamada lanza un subagente independiente
```

La innovación central de un flujo de trabajo es el flujo de control invertido: en lugar de dejar que el agente decida «¿qué hago a continuación?», el script decide «¿a qué agente llamo a continuación?».[^S2]

## Qué es realmente la orquestación

La orquestación es exactamente lo que parece: "one score, many musicians. A script deciding it — for loop, if statement — is orchestration." (una sola partitura, muchos músicos; que un script lo decida —un bucle for, una sentencia if— es orquestación).[^S3]

En un flujo de trabajo:

- **La partitura** = el script de JavaScript/TypeScript que escribes, con sus bucles `for`, sus sentencias `if` y sus llamadas a `Promise.all`.
- **Los músicos** = los subagentes que lanza cada llamada a `agent()`.
- **El director** = el motor de ejecución del script, que coordina a los agentes según la partitura.

Esta es la distinción, en palabras de la guía que la bautizó: "A normal agent decides the control flow as it goes. A workflow inverts that. You write the control flow as plain code, and each individual step is delegated to a fresh subagent." (Un agente normal decide el flujo de control sobre la marcha. Un flujo de trabajo invierte eso: escribes el flujo de control como código plano y cada paso individual se delega a un subagente nuevo).

Un agente normal improvisa en tiempo de ejecución: «primero haz A y luego decide si hacer B o C». Un flujo de trabajo fija el flujo de control en el código: «ejecuta A1-A10 en paralelo y luego haz B cuando todas terminen; si B devuelve `score > 0.8`, haz C; si no, D».

Lo que te da una orquestación determinista:

- **Predecible.** Misma entrada, misma ruta de ejecución.
- **Depurable.** Es evidente qué paso falló.
- **Reejecutable.** El script vive en `.claude/workflows/` y se puede invocar por su nombre.
- **Escalable.** Pasar de 10 agentes a 100 es solo un cambio en el número de vueltas del bucle.[^S2]

## Tu primer escenario de flujo de trabajo: una tubería de revisión de código

Veamos un caso real. Tu equipo tiene 15 PR esperando revisión y cada PR necesita cuatro comprobaciones:

1. ¿El código sigue la guía de estilo?
2. ¿Hay errores evidentes?
3. ¿La cobertura de pruebas es suficiente?
4. ¿Se actualizó la documentación correspondiente?

Con una sola conversación, lo ejecutas 15 veces y cambias de PR a mano cada vez.

Con un flujo de trabajo:

```javascript
async function reviewPRsWorkflow(prList) {
  // Fase 1: revisar todos los PR en paralelo
  const reviews = await Promise.all(
    prList.map(pr => 
      agent({
        task: `Revisa el PR #${pr.number}`,
        prompt: `Revisa el estilo del código, los errores potenciales, las pruebas y la documentación.
                 Devuelve JSON: { style: score, bugs: [], 
                 coverage: number, docs: boolean }`
      })
    )
  );
  
  // Fase 2: agregar el reporte
  return await agent({
    task: 'Genera el reporte semanal',
    prompt: `A partir de los resultados de revisión de ${reviews.length} PR,
             produce el reporte de calidad de código de esta semana,
             ordenando los problemas por gravedad`
  });
}
```

Lo que te da este flujo de trabajo:

- 15 PR revisados en paralelo, 15 veces más rápido que en secuencia.
- Criterios de revisión consistentes (cada PR usa el mismo prompt).
- Se puede ejecutar automáticamente cada semana, sin pasos manuales.
- El script se sube a Git y se comparte con todo el equipo.

<!-- exercises -->


## 💻 Ejercicios

### Nivel 1: Detectar tu primer escenario de flujo de trabajo

Repasa tu última semana de trabajo, busca una tarea repetitiva y juzga si encaja con un flujo de trabajo:

**Criterios:**
- Necesita procesar muchas entradas similares (muchos archivos, muchas fuentes de datos, muchos servicios)
- Tiene fases claras (extraer, transformar, validar, generar la salida)
- Quieres que el proceso se ejecute igual todas las veces
- Se puede ejecutar en paralelo, en parte o del todo

**Anota:**
1. La tarea, en una sola frase
2. Cómo la haces hoy
3. Si usaras un flujo de trabajo, en qué fases se dividiría
4. Cuánto tiempo esperarías ahorrar

<!-- rubric -->
El escenario está descrito con claridad, las fases son razonables (de 3 a 5), se señala dónde ayuda la ejecución en paralelo y la estimación de tiempo tiene fundamento (por ejemplo, «hoy procesar 10 archivos en secuencia toma 30 minutos; en paralelo esperaría 5»).

<!-- answer -->
Respuesta de ejemplo — Tarea: generar changelogs para varios microservicios. Hoy: leer a mano los commits de Git de cada servicio y copiarlos en un documento. Fases del flujo de trabajo: (1) obtener en paralelo el historial de commits de cada servicio, (2) convertir en paralelo los commits en descripciones de cambios legibles para el usuario, (3) consolidarlas en notas de versión con un formato unificado, (4) generar un resumen de lo destacado comparando con la versión anterior. Expectativa: pasar de 45 minutos a 8, porque los pasos 1 y 2 pueden procesar 8 servicios en paralelo.

<!-- hint -->
Empieza por las tareas en las que haces la misma operación sobre muchos objetos similares, como procesar archivos por lotes, llamar a una API por lotes o generar reportes por lotes.

<!-- hint -->
Un buen escenario de flujo de trabajo suele tener forma de fan-out, procesar y agregar: repartir la tarea entre muchos agentes, que cada uno se ocupe de una porción y luego fusionar los resultados.

### Nivel 2: Comparar una sola conversación con un flujo de trabajo

Elige uno de estos dos escenarios y explica por qué uno encaja con una sola conversación y el otro con un flujo de trabajo:

**Escenario A:** Arreglar un error en una función de 50 líneas con una lógica clara.

**Escenario B:** Actualizar una biblioteca de UI de 30 componentes de Material-UI v4 a v5.

Escribe tu juicio y tu razonamiento (de 2 a 3 frases por escenario).

<!-- rubric -->
Identifica correctamente que el escenario A encaja con una sola conversación (tarea pequeña, contexto manejable, sin necesidad de paralelismo) y que el escenario B encaja con un flujo de trabajo (gran escala, descomponible, paralelizable); explica el porqué en lugar de repetir definiciones; nombra un beneficio concreto del flujo de trabajo (paralelismo, consistencia, repetibilidad).

<!-- answer -->
El escenario A encaja con una sola conversación. Arreglar un error en una función es de alcance pequeño; 50 líneas se cargan enteras en una ventana de contexto y el agente puede leer, entender, arreglar y verificar directamente, sin nada que descomponer. El escenario B encaja con un flujo de trabajo. Treinta componentes superan lo que una sola conversación maneja con eficiencia y los componentes suelen ser independientes, así que puedes actualizarlos en paralelo (un agente por componente) y después ejecutar pruebas de integración para verificar. El flujo de trabajo se asegura de que cada componente use las mismas reglas de actualización, de modo que nada se escape.

<!-- hint -->
Pregúntate: si una persona hiciera estas dos tareas, ¿el escenario A es de las que te sientas y terminas en 10 minutos, o un trabajo mayor que lleva días, una lista de verificación y pasos por etapas?

<!-- hint -->
La palabra clave del escenario B es «30 componentes». Cuando la cantidad pasa de 10, conviene considerar un flujo de trabajo; y cuando una tarea se puede describir como «haz la misma operación sobre N objetos», un flujo de trabajo casi siempre es la mejor opción.

<!-- /exercises -->

---

**Siguiente:** [Lección 2 >>](./02-workflow-building-blocks.md) — Bloques de construcción de un flujo de trabajo: pasos, estado, bifurcaciones y bucles
