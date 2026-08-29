# Lección 5: Manejo de errores y estrategias de reintento

> Objetivos de aprendizaje:
> - Distinguir los errores transitorios de los permanentes
> - Dominar las estrategias de reintento y los algoritmos de retroceso
> - Aprender a diseñar acciones de compensación y mecanismos de reversión
>
> Requisitos: [Lección 4: Gestión de estado y paso de contexto](./04-state-and-context.md) | Siguiente: [Lección 6 >>](./06-real-world-workflows.md)

## Los errores son la norma en los flujos de trabajo

Tu flujo de trabajo se ejecuta a la perfección diez veces. En la undécima, en el paso 8, la API devuelve un 503. El flujo de trabajo se cae.

Entonces agregas un `try-catch`, atrapas el error, lo registras y sigues adelante. En la duodécima ejecución, la conexión a la base de datos se agota por tiempo. El flujo de trabajo continúa, pero la escritura falló, y ahora tus datos quedaron inconsistentes.

**El manejo de errores no es tan simple como «agregar un try-catch».**

En un flujo de trabajo, el manejo de errores tiene que responder tres preguntas:[^S7]

1. **¿Este error es temporal o permanente?** (fluctuación de red frente a permisos faltantes)
2. **¿Deberías reintentar, saltar o abortar?** (un reintento podría arreglarlo frente a un reintento lo empeora)
3. **Si abortas, ¿cómo limpias los pasos que ya terminaron?** (revertir la base de datos frente a enviar un aviso de cancelación)

Si el paso que falló es opcional (digamos, enviar una notificación), sáltalo y sigue. Impedir que una falla no crítica descarrile toda la ejecución se llama degradación elegante. Pero si el paso que falló es crítico, saltarlo deja un estado inconsistente, así que deberías abortar en su lugar.

Sin respuestas, tu flujo de trabajo es o demasiado frágil (un error chico lo tumba) o demasiado peligroso (ignora los errores y sigue ejecutándose, dejando atrás un estado inconsistente).[^S9]

## Clasificar los errores: transitorios frente a permanentes

**Los errores transitorios** son temporales; un reintento podría tener éxito.[^S8]

**Errores transitorios comunes:**
- Tiempos de espera de red agotados
- Servicio temporalmente no disponible (503 Service Unavailable)
- Límite de tasa (429 Too Many Requests)
- Pool de conexiones a la base de datos agotado
- Conflictos temporales de bloqueo

**Qué comparten:** suelen venir de contención de recursos, fluctuación de red o sobrecarga temporal, y esperar un momento antes de reintentar tiende a funcionar.

**Los errores permanentes** no van a tener éxito al reintentar; necesitan un arreglo en el código o en la configuración.[^S9]

**Errores permanentes comunes:**
- Permisos faltantes (401 Unauthorized, 403 Forbidden)
- Recurso no encontrado (404 Not Found)
- Entrada mal formada (400 Bad Request)
- Errores de lógica de negocio (saldo insuficiente, inventario en cero)
- Bugs de código (puntero nulo, división por cero)

**Qué comparten:** vienen de una mala configuración, de bugs de código o de reglas de negocio violadas, y reintentar solo desperdicia recursos.

**Cómo distinguirlos:**

```javascript
function classifyError(error) {
  // Revisión del código de estado HTTP
  if (error.status === 429) return 'transient';  // límite de tasa
  if (error.status >= 500) return 'transient';   // error del lado del servidor
  if (error.status === 404) return 'permanent';  // recurso no encontrado
  if (error.status === 401) return 'permanent';  // problema de permisos
  
  // Revisión del tipo de error
  if (error.code === 'ETIMEDOUT') return 'transient';    // tiempo de espera agotado
  if (error.code === 'ECONNREFUSED') return 'transient'; // conexión rechazada
  if (error.code === 'ENOTFOUND') return 'permanent';    // falla de DNS
  
  // Revisión del mensaje de error
  if (error.message.includes('rate limit')) return 'transient';
  if (error.message.includes('permission denied')) return 'permanent';
  
  // Por defecto, permanente (estrategia conservadora)
  return 'permanent';
}
```

## Estrategias de reintento

**Ante errores transitorios, reintentar es tu primer movimiento. Pero reintentar tiene más matices de lo que parece.**[^S8]

### Estrategia 1: reintento con retardo fijo

```javascript
async function retryWithFixedDelay(fn, maxAttempts = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      console.log(`El intento ${attempt} falló, reintentando en ${delay}ms...`);
      await sleep(delay);
    }
  }
}

// Uso
const data = await retryWithFixedDelay(
  () => fetchAPI('/users'),
  3,
  1000
);
```

**El problema:** si los errores vienen de un servicio sobrecargado, que todos los clientes reintenten a la vez empeora la sobrecarga (el efecto de estampida o thundering herd).

### Estrategia 2: retroceso exponencial

```javascript
async function retryWithExponentialBackoff(fn, maxAttempts = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`El intento ${attempt} falló, reintentando en ${delay}ms...`);
      await sleep(delay);
    }
  }
}

// Secuencia de retardos: 1s, 2s, 4s, 8s, ...
```

**El beneficio:** cada reintento duplica el intervalo, lo que le da al servicio más tiempo para recuperarse en lugar de machacarlo.[^S8]

### Estrategia 3: retroceso exponencial + jitter

```javascript
async function retryWithBackoffAndJitter(fn, maxAttempts = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * exponentialDelay;
      const delay = exponentialDelay + jitter;
      
      console.log(`El intento ${attempt} falló, reintentando en ${delay.toFixed(0)}ms...`);
      await sleep(delay);
    }
  }
}

// Secuencia de retardos (con aleatoriedad): 1.2s, 3.7s, 6.1s, ...
```

**El beneficio:** el jitter (variación aleatoria) evita que varios clientes reintenten en el mismo instante exacto, y reparte la carga.[^S8]

**Esta es la estrategia recomendada para producción.**[^S6]

### Estrategia 4: reintento selectivo

```javascript
async function retrySelective(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errorType = classifyError(error);
      
      if (errorType === 'permanent') {
        console.log('Error permanente, sin reintentar');
        throw error;
      }
      
      if (attempt === maxAttempts) {
        console.log(`Fallaron los ${maxAttempts} reintentos`);
        throw error;
      }
      
      const delay = 1000 * Math.pow(2, attempt - 1) * (1 + Math.random());
      console.log(`Error transitorio, reintentando en ${delay.toFixed(0)}ms...`);
      await sleep(delay);
    }
  }
}
```

**La idea clave:** reintenta solo los errores transitorios. Lanza los permanentes de inmediato para no quemar ciclos en reintentos inútiles.[^S10]

```agentmentor-check
{
  "id": "workflows-zh-05-retry-strategy",
  "label": "Elegir la estrategia de reintento adecuada",
  "prompt": "Un flujo de trabajo necesita llamar a una API externa para traer datos. La API permite 60 peticiones por minuto; pasado ese punto devuelve 429, y hay que esperar 60 segundos para continuar. El flujo de trabajo necesita llamar a la API 100 veces dentro de un minuto. ¿Cómo deberías manejar los errores 429?",
  "whyHere": "Acabas de aprender la clasificación de errores (transitorios frente a permanentes) y las estrategias de reintento (fijo, retroceso exponencial, selectivo). Esto comprueba si puedes mirar un tipo de error concreto (el límite de tasa) y elegir una forma sensata de manejarlo, en lugar de recurrir al retroceso por reflejo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Usar retroceso exponencial; los retardos siguen creciendo y al final va a tener éxito",
      "correct": false,
      "feedback": "El retroceso sirve para una sobrecarga temporal, pero un límite de tasa tiene una ventana de recuperación conocida (60 segundos). El retroceso podría rendirse en unos pocos segundos, o sus retardos (1s, 2s, 4s) pueden ser demasiado cortos para sobrevivir a la ventana. Peor todavía: el flujo de trabajo necesita 100 llamadas contra un techo de 60 por minuto, así que ninguna cantidad de reintentos lo termina dentro de un minuto."
    },
    {
      "id": "b",
      "text": "Partir el trabajo en lotes de 60 peticiones, esperando 60 segundos entre lotes",
      "correct": true,
      "feedback": "Correcto. Un 429 es un error transitorio predecible con un tiempo de recuperación conocido. Lo mejor es respetar el límite desde el principio: manda 60 peticiones en el primer lote, espera 60 segundos y después manda las 40 restantes. Si aun así te topas con un 429, la ventana anterior no se reinició del todo, así que espera el valor del encabezado Retry-After e intenta de nuevo. Eso le gana a reintentar a ciegas."
    },
    {
      "id": "c",
      "text": "Un 429 es un error permanente (cuota agotada), así que hay que fallar de inmediato y avisar a un administrador",
      "correct": false,
      "feedback": "Un 429 es transitorio, no permanente. Significa que vas por encima de la tasa actual, pero puedes continuar después de esperar. Los errores permanentes son cosas como una mala configuración o permisos faltantes (401, 403) que un reintento no arregla. El límite de tasa es temporal; se resuelve bajando tu ritmo de peticiones o esperando a que la ventana se reinicie."
    }
  ]
}
```

## El patrón Circuit Breaker

**El problema:** si un servicio falla una y otra vez (digamos, una base de datos caída) y cada petición reintenta tres veces, quemas recursos para nada y arrastras hacia abajo todo el flujo de trabajo. Y si ese servicio es una dependencia de otros servicios, la falla se propaga en cadena hasta convertirse en una falla en cascada.

**Un circuit breaker:** cuando la tasa de errores cruza un umbral, deja temporalmente de llamar al servicio que falla y falla rápido en su lugar, para evitar el desperdicio de recursos.[^S7]

### Tres estados

```
Cerrado ──tasa de errores > umbral──→ Abierto
   ↑                                  ↓
   └──la prueba pasa──← Semiabierto ←──tras el tiempo de espera
```

**Cerrado:** funcionando con normalidad. Las peticiones pasan y el breaker sigue la tasa de errores.

**Abierto:** el servicio se considera no disponible. Las peticiones fallan rápido sin llamarlo.

**Semiabierto:** después de un tiempo de espera, pasan unas pocas peticiones de prueba. Si tienen éxito, el breaker vuelve a cerrado; si no, se queda abierto.

### Implementación

```javascript
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;  // fallas antes de abrir
    this.resetTimeout = options.resetTimeout || 60000;      // intentar recuperarse tras 60s
    
    this.state = 'closed';
    this.failureCount = 0;
    this.nextAttempt = null;
  }
  
  async execute(fn) {
    // Estado abierto: fallar rápido
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker abierto, servicio temporalmente no disponible');
      }
      // Pasado el tiempo de espera, pasar a semiabierto
      this.state = 'half-open';
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      console.log('El circuit breaker volvió al estado cerrado');
    }
  }
  
  onFailure() {
    this.failureCount++;
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.resetTimeout;
      console.log(`Circuit breaker abierto, se reintentará en ${this.resetTimeout}ms`);
    }
  }
}

// Uso
const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 });

async function callAPI() {
  return await breaker.execute(async () => {
    return await fetch('/api/data');
  });
}
```

**Cuándo usarlo:** llamadas a servicios externos, bases de datos, sistemas de archivos y otras dependencias que pueden fallar en masa.[^S7]

## Acciones de compensación y reversión

**El problema:** el flujo de trabajo hizo tres escrituras (escribir en la base de datos, enviar un correo, actualizar el caché) y el paso 4 falló. ¿Cómo deshaces las tres primeras?[^S9]

### Patrón 1: operaciones transaccionales

```javascript
async function transactionalWorkflow() {
  const tx = await db.beginTransaction();
  
  try {
    await tx.insert('users', userData);
    await tx.update('accounts', accountData);
    await tx.insert('logs', logData);
    
    await tx.commit();
    console.log('Transacción confirmada');
  } catch (error) {
    await tx.rollback();
    console.log('Transacción revertida');
    throw error;
  }
}
```

**Cuándo encaja:** todas las operaciones viven en la misma base de datos y esta admite transacciones.

**El límite:** no puede abarcar varios sistemas (digamos, base de datos + sistema de archivos + llamada a una API).

### Patrón 2: acciones de compensación (el patrón Saga)

**La idea:** define una acción de compensación para cada operación y, ante una falla, ejecuta las compensaciones para deshacer los pasos que ya se completaron.[^S6]

```javascript
async function sagaWorkflow() {
  const completed = [];
  
  const steps = [
    {
      name: 'Crear pedido',
      forward: async () => {
        const order = await createOrder(orderData);
        return { orderId: order.id };
      },
      compensate: async (context) => {
        await deleteOrder(context.orderId);
        console.log(`Compensación: se borró el pedido ${context.orderId}`);
      }
    },
    {
      name: 'Descontar inventario',
      forward: async (context) => {
        await decrementInventory(orderData.items);
        return context;
      },
      compensate: async (context) => {
        await incrementInventory(orderData.items);
        console.log('Compensación: se restauró el inventario');
      }
    },
    {
      name: 'Cobrar el pago',
      forward: async (context) => {
        await chargePayment(context.orderId, orderData.amount);
        return context;
      },
      compensate: async (context) => {
        await refundPayment(context.orderId);
        console.log(`Compensación: se reembolsó el pedido ${context.orderId}`);
      }
    },
    {
      name: 'Enviar correo de confirmación',
      forward: async (context) => {
        await sendEmail(orderData.email, context.orderId);
        return context;
      },
      compensate: async (context) => {
        await sendEmail(orderData.email, 'Pedido cancelado');
        console.log('Compensación: se envió el correo de cancelación');
      }
    }
  ];
  
  let context = {};
  
  try {
    // Ejecutar todos los pasos hacia adelante
    for (const step of steps) {
      console.log(`Ejecutando: ${step.name}`);
      context = await step.forward(context);
      completed.push(step);
    }
    
    console.log('Flujo de trabajo completado con éxito');
    return context;
    
  } catch (error) {
    console.log(`Falló en: paso ${completed.length + 1}/${steps.length}`);
    
    // Ejecutar las compensaciones en orden inverso
    for (let i = completed.length - 1; i >= 0; i--) {
      const step = completed[i];
      try {
        await step.compensate(context);
      } catch (compensateError) {
        console.error(`Falló la compensación: ${step.name}`, compensateError);
        // Una compensación fallida necesita a una persona
      }
    }
    
    throw error;
  }
}
```

**Puntos clave:**

1. Cada paso tiene un `forward` (la acción) y un `compensate` (el deshacer).
2. Ante una falla, ejecuta las compensaciones de los pasos completados en orden inverso.
3. Una compensación puede fallar a su vez; regístrala y márcala para que la vea una persona.[^S6]

### Patrón 3: diseño idempotente

**Idempotente:** ejecutarlo N veces tiene el mismo efecto que ejecutarlo una vez.[^S9]

```javascript
// No idempotente: las ejecuciones repetidas se van sumando
async function incrementCounter(userId) {
  const current = await getCounter(userId);
  await setCounter(userId, current + 1);
}

// Idempotente: las ejecuciones repetidas dan el mismo resultado
async function setCounter(userId, value) {
  await db.update('counters', { userId }, { value });
}

// Idempotente: deduplicar con un ID único
async function processOrder(orderId, orderData) {
  // Revisar si ya se procesó
  const existing = await db.get('orders', orderId);
  if (existing) {
    console.log(`El pedido ${orderId} ya se procesó, saltando`);
    return existing;
  }
  
  // Primera vez que pasa por aquí
  const result = await createOrder(orderData);
  await db.insert('orders', { id: orderId, ...result });
  return result;
}
```

**El beneficio:** si un paso se ejecuta dos veces por un tropiezo de red (el primer intento se agotó por tiempo pero en realidad tuvo éxito), la idempotencia garantiza que no haya efectos secundarios duplicados.[^S9]

## Capas del manejo de errores

**Un buen flujo de trabajo maneja los errores en tres capas:**

### Capa 1: la operación individual

```javascript
async function callAPIWithRetry(endpoint) {
  return await retryWithBackoffAndJitter(
    async () => {
      const response = await fetch(endpoint);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    },
    3,
    1000
  );
}
```

### Capa 2: el paso del flujo de trabajo

```javascript
async function workflowStep(stepName, fn) {
  try {
    console.log(`Iniciando: ${stepName}`);
    const result = await fn();
    console.log(`Terminado: ${stepName}`);
    return result;
  } catch (error) {
    console.error(`Falló: ${stepName}`, error.message);
    
    // Registrarlo en el estado
    workflowState.errors.push({
      step: stepName,
      error: error.message,
      timestamp: Date.now()
    });
    
    throw error;
  }
}
```

Esta capa escribe cada falla en `workflowState.errors` con el nombre del paso, el mensaje de error y la marca de tiempo. Ese es tu registro de errores, y cuando estés depurando te apoyas en ese registro y no en tu memoria.

### Capa 3: el flujo de trabajo completo

```javascript
async function robustWorkflow() {
  const checkpointFile = '.workflow-checkpoint.json';
  
  try {
    // Cargar el punto de control
    let state = await loadCheckpoint(checkpointFile) || { phase: 'init' };
    
    // Ejecutar cada fase (con lógica de salto)
    if (state.phase === 'init') {
      state.data = await workflowStep('Recolectar datos', collectData);
      state.phase = 'collected';
      await saveCheckpoint(checkpointFile, state);
    }
    
    if (state.phase === 'collected') {
      state.processed = await workflowStep('Procesar datos', () => processData(state.data));
      state.phase = 'processed';
      await saveCheckpoint(checkpointFile, state);
    }
    
    if (state.phase === 'processed') {
      await workflowStep('Guardar resultados', () => saveResults(state.processed));
      state.phase = 'completed';
      await saveCheckpoint(checkpointFile, state);
    }
    
    return state;
    
  } catch (error) {
    // Manejo de errores a nivel del flujo de trabajo
    console.error('El flujo de trabajo falló:', error);
    
    // Avisar a una persona
    await notifyAdmin({
      workflow: 'robustWorkflow',
      phase: workflowState.phase,
      error: error.message
    });
    
    throw error;
  }
}
```

**Tres capas de protección:** reintento en la capa de la operación, registro en la capa del paso, recuperación y aviso en la capa del flujo de trabajo.

<!-- exercises -->


## 💻 Ejercicios

### Nivel 1: Clasificar errores y diseñar estrategias de reintento

Diseña una estrategia de manejo (reintentar / fallar rápido / compensar) para cada uno de estos tres errores:

**Error A:** llamar a la API de pagos devuelve un error `ETIMEDOUT`

**Error B:** insertar en la base de datos devuelve un error `duplicate key`

**Error C:** subir un archivo a S3 devuelve un error `403 Forbidden`

**Requisitos:**
- Decide si cada error es transitorio o permanente
- Explica cómo manejarlo (cuántos reintentos, qué estrategia, o fallar rápido)
- Si necesita un reintento, escribe el fragmento de código del reintento

<!-- rubric -->
Clasificación correcta (A: transitorio, B: permanente, C: permanente); estrategia de manejo razonable (A: reintentar 3 veces + retroceso exponencial, B: revisar si ya existe / fallar rápido, C: revisar la configuración de permisos / fallar rápido); el código de reintento incluye retroceso exponencial y jitter

<!-- answer -->
Error A (ETIMEDOUT): transitorio. Un tiempo de espera de red agotado puede ser temporal. Estrategia: reintentar 3 veces con retroceso exponencial + jitter (1s, 2-4s, 4-8s). Código: `await retryWithBackoffAndJitter(async () => await callPaymentAPI(data), 3, 1000)`. Error B (duplicate key): permanente. Un conflicto de clave primaria significa que el registro ya existe, así que un reintento también falla. Estrategia: revisar si el registro existe; si existe con contenido idéntico, tratarlo como éxito (idempotencia); si el contenido difiere, lanzar el error para que quien llama lo maneje. Error C (403 Forbidden): permanente. Un problema de permisos necesita un cambio de configuración o de política IAM. Estrategia: fallar rápido, registrar los detalles (nombre del bucket, ruta del archivo, rol actual) y avisar a un administrador para que arregle los permisos.

<!-- hint -->
Los tiempos de espera agotados (ETIMEDOUT), las conexiones rechazadas y los errores 503 suelen ser transitorios. Los errores de permisos (401/403), de recurso no encontrado (404) y de entrada mal formada (400) suelen ser permanentes.

<!-- hint -->
duplicate key es un caso especial: si el flujo de trabajo está diseñado para ser idempotente (deduplicar con un ID único), una inserción repetida debería contar como «ya hecho» y no como un error.

### Nivel 2: Diseñar acciones de compensación

Un flujo de trabajo de «registro de usuario» tiene 4 pasos: (1) crear el registro del usuario en la base de datos, (2) crear el directorio del usuario `/users/{userId}/`, (3) enviar un correo de bienvenida, (4) agregarlo a la lista de correo. Si el paso 3 o el 4 falla, ¿cómo reviertes los pasos anteriores?

**Requisitos:**
- Diseña una acción de compensación para cada paso
- Escribe el pseudocódigo del patrón Saga (forward y compensate)
- Explica qué compensaciones podrían fallar y qué hacer cuando fallen

<!-- rubric -->
Compensaciones razonables para cada paso (1: borrar el registro del usuario, 2: borrar el directorio, 3/4: enviar un aviso de cancelación); el pseudocódigo incluye la ejecución hacia adelante y la lógica de compensación inversa; reconoce que las compensaciones también pueden fallar (por ejemplo, el envío del correo falla, permisos insuficientes para borrar el directorio) y explica que hay que registrarlas y que las atienda una persona

<!-- answer -->
Compensación del paso 1: `deleteUser(userId)` — borrar el registro de la base de datos. Compensación del paso 2: `deleteDirectory(path)` — borrar el directorio del usuario y su contenido. Compensación del paso 3: no hace falta ninguna (que falle el envío del correo no afecta la consistencia de los datos). Compensación del paso 4: `removeFromMailingList(email)` — quitarlo de la lista de correo. Pseudocódigo omitido (ver el ejemplo del curso). Fallas de compensación: (1) borrar el directorio puede fallar por permisos insuficientes -> registrarlo en una cola de fallas para limpieza manual; (2) quitarlo de la lista de correo puede fallar si la API está caída -> registrarlo en una cola de reintentos e intentarlo más tarde; (3) borrar el registro de la base de datos debería tener éxito siempre (si falla, la base de datos misma tiene un problema y hace falta una alerta urgente). La clave: una compensación fallida no debería frenar todo el flujo de trabajo. Registra las compensaciones fallidas, sigue adelante y al final mándale a un administrador un resumen de los elementos fallidos.

<!-- hint -->
Una compensación es el «deshacer» de una acción hacia adelante: crear -> borrar, escribir -> borrar o sobrescribir, enviar un mensaje -> enviar un mensaje de cancelación.

<!-- hint -->
Algunas acciones no se pueden deshacer de verdad (un correo que ya se envió, un webhook de terceros que ya se disparó). En ese caso la compensación es «avisar a las partes afectadas que la acción se canceló» y no «deshacer la acción misma».

<!-- /exercises -->

---

**Siguiente:** [Lección 6: Flujos de trabajo del mundo real en la práctica](./06-real-world-workflows.md) — Junta todo para construir tres flujos de trabajo de nivel producción: refactorización de código, generación de documentación y automatización de pruebas
