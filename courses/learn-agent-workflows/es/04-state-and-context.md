# Lección 4: Gestión de estado y paso de contexto

> Objetivos de aprendizaje:
> - Distinguir el estado del flujo de trabajo del contexto del agente
> - Dominar tres patrones de gestión de estado
> - Entender los puntos de control y la recuperación
>
> Requisitos: [Lección 3: Descomponer una tarea compleja en un flujo de trabajo](./03-task-decomposition.md) | Siguiente: [Lección 5 >>](./05-error-handling-retry.md)

## Por qué la gestión de estado es el corazón de un flujo de trabajo

Diseñas un flujo de trabajo perfecto: 10 pasos, dependencias limpias. En el paso 8, el servidor se reinicia. El flujo de trabajo se cae.

¿Lo vuelves a ejecutar? Entonces el trabajo de los primeros 7 pasos —quizá 30 minutos— se tira a la basura.

**Ese es el precio de no tener gestión de estado.**

La gestión de estado resuelve tres problemas:[^S12]

1. **Pasar datos entre pasos**: ¿cómo obtiene el paso 3 los resultados de los pasos 1 y 2?
2. **Seguimiento del progreso**: ¿qué tan avanzado está el flujo de trabajo? ¿Cuánto falta?
3. **Recuperación ante fallas**: después de una caída, retomar desde donde se detuvo en lugar de empezar de nuevo.

Sin gestión de estado, un agente solo puede pasar información a través del historial de conversación. El historial de conversación se desborda, se pierde y el agente lo olvida.

Con gestión de estado, el flujo de trabajo tiene una «memoria» clara: persistente, consultable y recuperable.[^S11]

## Estado, contexto y memoria: cómo distinguirlos

Estas tres palabras se confunden con facilidad, así que fijémoslas primero:[^S12]

**Estado**
- Toda la información sobre la tarea actual: en qué paso vas, el resultado de cada paso, qué sigue
- Es una foto instantánea: todo lo que el flujo de trabajo sabe en este momento
- Se guarda en: variables del script, una base de datos, archivos

**Contexto**
- La información que se pasa a una sola llamada del agente
- Es la entrada: lo que este agente necesita saber para hacer su trabajo
- Se extrae del estado de forma selectiva: no todo el estado va al agente, solo la parte relevante

**Memoria**
- Lecciones aprendidas del pasado: qué se hizo antes, qué problemas aparecieron, cuáles fueron las soluciones
- Es historia: conocimiento de largo plazo a través de tareas y sesiones
- Queda fuera del alcance de esta lección (la memoria de largo plazo es un tema difícil por sí solo)

**Un ejemplo:**

```javascript
// Estado: todo lo que el flujo de trabajo sabe
const workflowState = {
  phase: 'testing',
  filesProcessed: 47,
  totalFiles: 100,
  issues: [/* todos los problemas encontrados en pasos anteriores */],
  currentBatch: [/* archivos que se están procesando ahora mismo */]
};

// Contexto: la info para este agente (extraída del estado)
const agentContext = {
  file: workflowState.currentBatch[0],
  previousIssues: workflowState.issues.filter(i => i.severity === 'high')
};

// Llamada al agente
const result = await agent({
  task: 'probar archivo',
  context: agentContext  // solo la info relevante, no el estado completo
});

// Actualizar el estado
workflowState.filesProcessed++;
workflowState.issues.push(...result.newIssues);
```

**El principio clave: el estado es global, el contexto es local.**[^S15]

## Patrón de estado 1: variables de script (estado en memoria)

**Cuándo usarlo:** flujos de trabajo cortos (< 10 minutos) que no necesitan cruzar procesos ni máquinas.

**A favor:** simple, rápido, sin dependencias externas.

**En contra:** el estado se pierde cuando el proceso se cae, sin forma de recuperarlo.

### Patrón básico

```javascript
async function simpleWorkflow(files) {
  // El estado son simplemente variables comunes de JavaScript
  let processed = 0;
  let results = [];
  let errors = [];
  
  for (const file of files) {
    try {
      const result = await processFile(file);
      results.push(result);
      processed++;
      console.log(`Progreso: ${processed}/${files.length}`);
    } catch (error) {
      errors.push({ file, error });
    }
  }
  
  return { results, errors, total: files.length };
}
```

**¿Dónde vive el estado?** En las variables locales de la función (`processed`, `results`, `errors`).

**¿Y si el proceso se cae?** Todo el estado se pierde y empiezas de nuevo desde el principio.

### Mejor: un objeto de estado estructurado

```javascript
async function betterWorkflow(files) {
  // Organizar el estado en un objeto: más claro
  const state = {
    input: { files, total: files.length },
    progress: { current: 0, phase: 'processing' },
    output: { results: [], errors: [] },
    metadata: { startTime: Date.now() }
  };
  
  for (const file of state.input.files) {
    try {
      const result = await processFile(file);
      state.output.results.push(result);
      state.progress.current++;
    } catch (error) {
      state.output.errors.push({ file, error });
    }
  }
  
  state.progress.phase = 'completed';
  state.metadata.endTime = Date.now();
  state.metadata.duration = state.metadata.endTime - state.metadata.startTime;
  
  return state;
}
```

**Por qué ayuda:** el estado tiene una estructura clara, es fácil de pasar a otras funciones y es fácil de serializar (si necesitas persistirlo).

## Patrón de estado 2: puntos de control

**Cuándo usarlo:** flujos de trabajo de duración media (10-60 minutos) donde necesitas guardar el progreso después de operaciones costosas.

**A favor:** después de una caída, puedes retomar desde el punto de control más reciente y evitar rehacer trabajo.

**En contra:** tienes que diseñar dónde van los puntos de control y la lógica de recuperación.[^S12]

### Elegir dónde poner los puntos de control

```javascript
async function workflowWithCheckpoints(tasks) {
  const checkpointFile = '.workflow-state.json';
  
  // Intentar restaurar el estado previo
  let state = await loadCheckpoint(checkpointFile) || {
    completed: [],
    pending: tasks,
    phase: 'processing'
  };
  
  console.log(`Retomando: ${state.completed.length}/${tasks.length} listas`);
  
  while (state.pending.length > 0) {
    const task = state.pending.shift();
    
    // Ejecutar la tarea
    const result = await executeTask(task);
    state.completed.push({ task, result });
    
    // Punto de control: guardar cada 10 tareas
    if (state.completed.length % 10 === 0) {
      await saveCheckpoint(checkpointFile, state);
      console.log(`Punto de control: ${state.completed.length} tareas listas`);
    }
  }
  
  state.phase = 'completed';
  await saveCheckpoint(checkpointFile, state);
  
  return state;
}

async function saveCheckpoint(file, state) {
  await fs.writeFile(file, JSON.stringify(state, null, 2));
}

async function loadCheckpoint(file) {
  try {
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;  // el archivo no existe, empezar desde cero
  }
}
```

**Estrategias de puntos de control:**

- **Puntos de control periódicos**: guardar cada N tareas o cada M minutos
- **Puntos de control por fase**: guardar cuando termina cada fase importante (por ejemplo, «fase de análisis lista»)
- **Antes de operaciones críticas**: guardar antes de una operación irreversible (por ejemplo, un despliegue o un borrado)

```agentmentor-check
{
  "id": "workflows-zh-04-checkpoint-placement",
  "label": "Juzgar si un punto de control está bien ubicado",
  "prompt": "Un flujo de trabajo de migración de datos tiene 4 fases: (1) leer 1000 registros de la base de datos de origen (5 minutos) (2) transformar el formato de los datos (10 minutos) (3) escribir en la base de datos de destino (20 minutos) (4) verificar la consistencia de los datos (5 minutos). Si solo puedes poner 1 punto de control, ¿después de qué fase debería ir?",
  "whyHere": "Acabas de aprender el concepto de punto de control y sus estrategias (periódicos, por fase, antes de operaciones críticas); esto comprueba si puedes elegir la ubicación óptima del punto de control a partir de las características de la tarea (costo en tiempo, reversibilidad)",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Después de la fase 1, porque es la primera fase",
      "correct": false,
      "feedback": "La fase 1 tarda solo 5 minutos, así que volver a ejecutarla después de una caída cuesta poco. Un punto de control va después de una operación larga o irreversible, no simplemente en el primer paso de la secuencia."
    },
    {
      "id": "b",
      "text": "Después de la fase 2, porque es la más costosa y viene antes de la escritura",
      "correct": true,
      "feedback": "Correcto. La fase 2 es la fase de cómputo puro más larga (10 minutos), y la fase 3 es una escritura irreversible. Un punto de control después de la fase 2 evita volver a ejecutar la transformación costosa y además guarda el estado justo antes de la escritura irreversible. Si la fase 3 falla, retomas desde el punto de control, arreglas el problema y escribes de nuevo, sin necesidad de volver a leer ni a transformar."
    },
    {
      "id": "c",
      "text": "Después de la fase 3, porque la escritura ya está hecha",
      "correct": false,
      "feedback": "Un punto de control después de la fase 3 protege el resultado escrito, pero si la fase 3 falla por su cuenta (se cae a mitad de la escritura), el punto de control nunca llega a guardarse. La mejor estrategia es guardar antes de la fase 3, para que ante una falla puedas arreglar el problema y escribir de nuevo."
    }
  ]
}
```

## Patrón de estado 3: almacenamiento externo (estado persistente)

**Cuándo usarlo:** flujos de trabajo de larga duración (> 1 hora), trabajo que necesita coordinarse entre máquinas o trabajo que necesita aprobación humana.

**A favor:** el estado es persistente; que el proceso se caiga o la máquina se reinicie da igual, y se admite pausar y retomar.

**En contra:** necesita una dependencia externa (una base de datos, Redis) y agrega complejidad.[^S13]

### Implementación básica

```javascript
// Interfaz del almacén de estado
class WorkflowStateStore {
  constructor(db) {
    this.db = db;
  }
  
  async save(workflowId, state) {
    await this.db.set(`workflow:${workflowId}`, JSON.stringify(state));
  }
  
  async load(workflowId) {
    const data = await this.db.get(`workflow:${workflowId}`);
    return data ? JSON.parse(data) : null;
  }
  
  async delete(workflowId) {
    await this.db.del(`workflow:${workflowId}`);
  }
}

// Un flujo de trabajo respaldado por almacenamiento externo
async function persistentWorkflow(workflowId, tasks) {
  const store = new WorkflowStateStore(redis);
  
  // Cargar el estado (si existe)
  let state = await store.load(workflowId) || {
    id: workflowId,
    phase: 'init',
    completed: [],
    pending: tasks,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  console.log(`Flujo de trabajo ${workflowId}: fase ${state.phase}, 
               progreso ${state.completed.length}/${tasks.length}`);
  
  // Fase 1: procesar las tareas
  if (state.phase === 'init' || state.phase === 'processing') {
    state.phase = 'processing';
    
    while (state.pending.length > 0) {
      const task = state.pending.shift();
      const result = await executeTask(task);
      state.completed.push({ task, result });
      state.updatedAt = Date.now();
      
      // Guardar el estado después de cada tarea
      await store.save(workflowId, state);
    }
    
    state.phase = 'awaiting_approval';
    await store.save(workflowId, state);
  }
  
  // Fase 2: esperar la aprobación humana (puede retomarse en otro proceso o máquina)
  if (state.phase === 'awaiting_approval') {
    console.log('Esperando aprobación...');
    // Podemos retornar aquí y dejar que otro proceso (o unas horas después) continúe
    return { workflowId, status: 'awaiting_approval' };
  }
  
  // Fase 3: ejecutar la operación final (después de la aprobación)
  if (state.phase === 'approved') {
    state.phase = 'finalizing';
    await store.save(workflowId, state);
    
    await executeFinalAction(state.completed);
    
    state.phase = 'completed';
    state.completedAt = Date.now();
    await store.save(workflowId, state);
  }
  
  return state;
}

// Flujo de aprobación
async function approveWorkflow(workflowId) {
  const store = new WorkflowStateStore(redis);
  const state = await store.load(workflowId);
  
  if (!state) throw new Error('el flujo de trabajo no existe');
  if (state.phase !== 'awaiting_approval') {
    throw new Error(`no se puede aprobar: la fase actual es ${state.phase}`);
  }
  
  state.phase = 'approved';
  state.approvedAt = Date.now();
  await store.save(workflowId, state);
  
  // Continuar la ejecución del flujo de trabajo
  return await persistentWorkflow(workflowId, []);
}
```

**El patrón clave: una máquina de estados**[^S11]

Las fases del flujo de trabajo son los estados de una máquina de estados:

```
init → processing → awaiting_approval → approved → finalizing → completed
                         ↓
                     rejected → cancelled
```

Cada transición de fase se guarda en el almacenamiento externo, y eso es justo lo que permite que el flujo de trabajo retome desde cualquier fase.

## Buenas prácticas para pasar contexto

### Principio 1: pasa solo lo necesario

```javascript
// ❌ Mal: entregarle al agente todo el estado
const result = await agent({
  task: 'analizar este archivo',
  context: workflowState  // resultados de análisis de 100 archivos, configuración, logs...
});

// ✓ Bien: dar solo la info relevante
const result = await agent({
  task: 'analizar este archivo',
  context: {
    file: currentFile,
    guidelines: workflowState.config.analysisGuidelines,
    similarIssues: workflowState.results
      .filter(r => r.file.type === currentFile.type)
      .slice(0, 3)  // como máximo 3 casos similares
  }
});
```

**¿Por qué?** Mientras más grande es el contexto, más fácil es que el agente se distraiga; la calidad del razonamiento baja y el costo sube.[^S15]

### Principio 2: estructura el contexto

```javascript
// ❌ Mal: texto sin estructura
const context = `
Antes se analizaron 47 archivos y se encontraron 23 problemas.
El archivo actual es src/utils.js, 350 líneas.
La configuración pide revisar inyección SQL y XSS.
`;

// ✓ Bien: un objeto estructurado
const context = {
  progress: { filesAnalyzed: 47, issuesFound: 23 },
  currentFile: { path: 'src/utils.js', lines: 350 },
  checkTypes: ['sql_injection', 'xss']
};
```

**¿Por qué?** Un contexto estructurado es más fácil de entender para el agente y más fácil de depurar para ti.

### Principio 3: contexto que se acumula frente a contexto que se reinicia

**Contexto que se acumula:** el resultado de cada paso se agrega al contexto, así que este no para de crecer.

```javascript
let context = { task: 'refactorizar la base de código' };

for (const file of files) {
  const result = await agent({ task: 'analizar', context });
  context.results = context.results || [];
  context.results.push(result);  // acumular
}

// Al final el contexto guarda el resultado de cada archivo, y puede volverse enorme
```

**Contexto que se reinicia:** cada paso limpia el contexto y conserva solo lo necesario.

```javascript
const allResults = [];

for (const file of files) {
  const context = {
    file,
    guidelines: config.guidelines,
    exampleIssues: allResults.slice(-3)  // solo los últimos 3
  };
  
  const result = await agent({ task: 'analizar', context });
  allResults.push(result);  // vive en el estado del flujo de trabajo, no en el contexto
}
```

**Cuál elegir:** usa contexto que se reinicia la mayor parte del tiempo para evitar la explosión de contexto. Usa contexto que se acumula solo cuando los pasos posteriores de verdad necesitan todos los resultados anteriores (como un paso final de resumen).[^S14]

## Observabilidad del estado

**Un buen flujo de trabajo debería poder responder estas preguntas:**

- ¿En qué fase está ahora mismo?
- ¿Cuánto se hizo? ¿Cuánto falta?
- ¿Cuántos errores encontró?
- ¿Cuándo se espera que termine?

### Implementar el seguimiento del progreso

```javascript
class ObservableWorkflow {
  constructor(name, totalSteps) {
    this.state = {
      name,
      totalSteps,
      currentStep: 0,
      phase: 'init',
      startTime: Date.now(),
      errors: [],
      results: []
    };
  }
  
  async executeStep(stepName, fn) {
    this.state.currentStep++;
    this.state.phase = stepName;
    
    console.log(`[${this.state.name}] 
                 paso ${this.state.currentStep}/${this.state.totalSteps}: 
                 ${stepName}`);
    
    const stepStart = Date.now();
    
    try {
      const result = await fn();
      this.state.results.push({ stepName, result, duration: Date.now() - stepStart });
      return result;
    } catch (error) {
      this.state.errors.push({ stepName, error: error.message });
      throw error;
    }
  }
  
  getStatus() {
    const progress = (this.state.currentStep / this.state.totalSteps) * 100;
    const elapsed = Date.now() - this.state.startTime;
    const avgStepTime = elapsed / this.state.currentStep;
    const remainingSteps = this.state.totalSteps - this.state.currentStep;
    const estimatedRemaining = avgStepTime * remainingSteps;
    
    return {
      progress: `${progress.toFixed(1)}%`,
      currentPhase: this.state.phase,
      elapsed: `${(elapsed / 1000).toFixed(1)}s`,
      estimatedRemaining: `${(estimatedRemaining / 1000).toFixed(1)}s`,
      errors: this.state.errors.length
    };
  }
}

// Uso
async function myWorkflow() {
  const wf = new ObservableWorkflow('migración de datos', 4);
  
  const data = await wf.executeStep('leer datos de origen', async () => {
    return await readSourceData();
  });
  
  const transformed = await wf.executeStep('transformar formato', async () => {
    return await transformData(data);
  });
  
  await wf.executeStep('escribir en la base de datos de destino', async () => {
    return await writeToTarget(transformed);
  });
  
  await wf.executeStep('verificar', async () => {
    return await validateMigration();
  });
  
  console.log('Estado final:', wf.getStatus());
}
```

<!-- exercises -->


## 💻 Ejercicios

### Nivel 1: Elegir un patrón de gestión de estado

Para los tres flujos de trabajo de abajo, elige el patrón de gestión de estado adecuado (variables de script, puntos de control, almacenamiento externo) y explica por qué:

**Flujo de trabajo A:** comprimir por lotes 20 imágenes, 5 segundos cada una, 100 segundos en total

**Flujo de trabajo B:** entrenar un modelo de aprendizaje automático, 50 épocas de 10 minutos cada una, 500 minutos en total (8 horas)

**Flujo de trabajo C:** revisar 100 PR, cada uno con aprobación humana antes del merge, y el proceso completo puede durar varios días

<!-- rubric -->
Elección correcta de los patrones (A: variables de script, B: puntos de control, C: almacenamiento externo); razonamiento sólido (considera la duración, la recuperabilidad y si hace falta intervención humana)

<!-- answer -->
Flujo de trabajo A: variables de script. Todo dura apenas 100 segundos, muy poco, así que incluso volver a ejecutarlo entero después de una caída cuesta poco y no se justifica una gestión de estado elaborada. Flujo de trabajo B: puntos de control. 8 horas es mucho y empezar de nuevo después de una caída sale demasiado caro, así que deberías guardar un punto de control cada pocas épocas. Pero el entrenamiento es continuo —no hay trabajo entre procesos ni espera por una persona—, así que los puntos de control alcanzan. Flujo de trabajo C: almacenamiento externo. El proceso dura días, involucra aprobación humana y el flujo de trabajo se pausa y se retoma en otro momento o en otro proceso, así que tienes que persistir el estado en un almacenamiento externo (por ejemplo, una base de datos) para poder consultar el progreso y retomar en cualquier momento.

<!-- hint -->
Considera tres preguntas: (1) ¿La duración total se mide en minutos, horas o días? (2) ¿Qué tan caro es volver a ejecutarlo después de una caída? (3) ¿Necesita pausarse y retomarse más tarde?

<!-- hint -->
Las variables de script sirven para tareas rápidas (< 10 minutos). Los puntos de control sirven para tareas costosas (de 10 minutos a unas horas). El almacenamiento externo sirve para tareas de larga duración (> unas horas) o que necesitan intervención humana.

### Nivel 2: Diseñar una estructura de estado

Diseña el objeto de estado para un flujo de trabajo de «despliegue de varios servicios». El flujo de trabajo necesita: (1) construir imágenes Docker para 5 servicios (2) subirlas a un registro de imágenes (3) desplegarlas una por una en un entorno de pruebas (4) ejecutar pruebas de integración (5) si las pruebas pasan, desplegar a producción.

**Requisitos:**
- Diseña un objeto JSON que represente el estado del flujo de trabajo
- Incluye: fase actual, estado de cada servicio, info de errores, marcas de tiempo
- Explica dónde deberían guardarse los puntos de control

<!-- rubric -->
Estructura de estado sólida (incluye un marcador de fase, una lista de servicios con el estado de cada uno, un arreglo de errores e info de tiempos); el estado de cada servicio carga info suficiente (por ejemplo, estado de construcción, ID de imagen, estado de despliegue); identifica correctamente la ubicación de los puntos de control (al menos después de las fases 2 y 4, y antes del despliegue a producción)

<!-- answer -->
```json
{
  "workflowId": "deploy-2026-08-25-001",
  "phase": "production_deployment",
  "phases": ["build", "push", "test_deploy", "integration_test", "prod_deploy"],
  "services": [
    {
      "name": "api-gateway",
      "buildStatus": "completed",
      "imageId": "sha256:abc123...",
      "testDeployStatus": "completed",
      "prodDeployStatus": "in_progress"
    }
    // ... los otros 4 servicios
  ],
  "integrationTestResult": { "passed": true, "duration": 120 },
  "errors": [],
  "timestamps": {
    "started": 1724572800000,
    "buildCompleted": 1724573100000,
    "pushCompleted": 1724573200000,
    "testDeployCompleted": 1724573500000,
    "integrationTestCompleted": 1724573620000
  }
}
```
Ubicación de los puntos de control: (1) cuando termina la fase 2 (push), porque construir y subir es costoso y conviene no repetirlo (2) cuando termina la fase 4 (integration_test), porque que las pruebas pasen es una precondición del despliegue a producción, y las pruebas mismas pueden fallar y tener que repetirse tras un arreglo (3) antes de que cada servicio se despliegue a producción, lo que permite recuperarse tras una falla parcial.

<!-- hint -->
El estado debería poder responder: ¿en qué fase está el flujo de trabajo? ¿En qué estado está cada servicio (construyendo / construido / desplegado / fallido)? Si se cae, ¿desde dónde retoma?

<!-- hint -->
El estado de cada servicio es independiente (que un servicio falle al construirse no cambia el estado de otro), así que cada servicio debería tener sus propios campos de estado. Los puntos de control van después de las operaciones costosas y antes de las irreversibles (el despliegue a producción).

<!-- /exercises -->

---

**Próxima lección:** [Lección 5: Manejo de errores y estrategias de reintento](./05-error-handling-retry.md) — aprende a hacer que un flujo de trabajo se recupere con elegancia ante una falla en lugar de caerse por completo
