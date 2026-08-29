# Lección 5: Caso práctico: construir una Skill de revisión de código

> Objetivos de aprendizaje:
> - Aprender a organizar un flujo de trabajo de varios pasos
> - Entender cómo se aplica el patrón de checklist
> - Tomar soltura con los archivos de apoyo
> - Construir una Skill compleja lista para uso real
>
> Requisitos: [<< Lección 4](./04-testing-debugging.md) | Siguiente: [Lección 6 >>](./06-advanced-patterns.md)

## Por qué la revisión de código es un buen caso práctico

La revisión de código es un flujo de trabajo estructurado de manual:[^S3]

- **Los pasos son fijos**: revisar convenciones, buscar problemas, proponer cambios
- **Los criterios son medibles**: cada ítem de revisión pasa o no pasa
- **Se repite constantemente**: cada PR necesita una
- **Le queda bien una Skill**: escribe los criterios de revisión de tu equipo en una Skill y todas las revisiones sostienen la misma vara

Este caso práctico te muestra:
- Cómo partir un flujo de trabajo complejo en pasos claros
- Cómo organizar las instrucciones alrededor de un checklist
- Cómo manejar varias dimensiones de salida a la vez

## Paso 1: Definir el alcance de la revisión

Antes de escribir nada, decide de qué se hace responsable esta Skill.

**Nuestro Skill de revisión de código cubre tres dimensiones:**

1. **Convenciones**: nombrado, formato, comentarios
2. **Problemas potenciales**: manejo de errores, casos límite, riesgo de seguridad
3. **Mantenibilidad**: código duplicado, largo de las funciones, complejidad lógica

**Lo que deliberadamente no revisa:**
- Si la lógica de negocio es realmente correcta (eso requiere conocer los requerimientos de verdad)
- Eficiencia algorítmica (eso requiere pruebas de rendimiento)
- Diseño de UI/UX (fuera del alcance de una revisión de código)

## Paso 2: Crear la estructura de directorios

Esta vez vamos a usar archivos de apoyo para organizar las reglas de revisión:[^S2]

```bash
mkdir -p ~/.claude/skills/code-review
mkdir -p ~/.claude/skills/code-review/checklists

touch ~/.claude/skills/code-review/SKILL.md
touch ~/.claude/skills/code-review/checklists/naming.md
touch ~/.claude/skills/code-review/checklists/error-handling.md
```

**Por qué separar los archivos:**
- SKILL.md se mantiene corto y contiene solo el flujo central
- Las reglas de revisión detalladas viven en archivos aparte, que se cargan bajo demanda[^S2]
- Tu equipo puede mantener cada checklist de forma independiente sin tocar el archivo principal

## Paso 3: Escribir el SKILL.md principal

```markdown
---
name: code-review
description: Revisa cambios de código en busca de convenciones de nombrado, manejo de errores, bugs potenciales y problemas de mantenibilidad. Úsala para revisar PRs o para chequeos generales de calidad de código
---

# Asistente de revisión de código

Revisa cambios de código de forma sistemática contra las convenciones del equipo y la práctica establecida.

## Formatos de entrada

Acepta cualquiera de los siguientes:

- Salida de un git diff
- Un archivo fuente completo
- Un fragmento de código (una función o una clase)
- Un enlace a un PR (primero lee el contenido del PR con una herramienta)

## Flujo de revisión

Ejecuta la revisión en este orden:

### 1. Revisión de convenciones

Consulta `checklists/naming.md` y recorre cada ítem:

- **Nombres de variables**: significativos y consistentes con la convención del equipo (camelCase, snake_case, etc.)
- **Nombres de funciones**: empiezan con un verbo, declaran la intención con claridad
- **Nombres de clases**: sustantivos, alineados con una única responsabilidad
- **Nombres de constantes**: todo en mayúsculas, separado por guiones bajos

**Criterio:** cada nombre debería decirle a alguien que no conoce el código para qué sirve

### 2. Revisión de manejo de errores

Consulta `checklists/error-handling.md` y revisa:

- **Captura de excepciones**: ¿hay un try/catch y captura los tipos de excepción correctos?
- **Valores de retorno de error**: ¿la función maneja y propaga los errores correctamente?
- **Casos límite**: ¿se manejan entrada vacía, null, undefined y arreglos vacíos?
- **Liberación de recursos**: ¿se liberan bien archivos, conexiones y locks?

**Criterio:** todo lo que puede fallar necesita manejo de errores

### 3. Revisión de problemas potenciales

- **Acceso a null/undefined**: ¿podría llegar a una propiedad o método que no existe?
- **Seguridad de tipos**: ¿hay riesgo de coerción implícita de tipos?
- **Concurrencia**: ¿hay condiciones de carrera o riesgo de deadlock?
- **Agujeros de seguridad**: inyección SQL, XSS, CSRF, secretos filtrados

**Criterio:** marca todo código que pueda producir un error en tiempo de ejecución o un riesgo de seguridad

### 4. Revisión de mantenibilidad

- **Largo de las funciones**: sugiere dividir todo lo que pase de 50 líneas
- **Duplicación**: sugiere extraer la lógica que aparece tres o más veces
- **Profundidad de anidamiento**: sugiere refactorizar más allá de tres niveles
- **Calidad de los comentarios**: ¿está explicada la lógica compleja?

**Criterio:** otra persona desarrolladora debería poder leer y cambiar este código con facilidad

## Formato de salida

Reporta la revisión con esta estructura:

### ✅ Aprobado
- [ítem de revisión] - cumple el criterio

### ⚠️ Para revisar
- **Ubicación**: `archivo:línea`
- **Problema**: qué está mal exactamente
- **Impacto**: a qué podría llevar esto
- **Sugerencia**: cómo mejorarlo

### 🔴 Hay que arreglar
- **Ubicación**: `archivo:línea`
- **Problema**: qué está mal exactamente
- **Riesgo**: por qué esto no puede salir así
- **Sugerencia**: el arreglo concreto

### 📊 Evaluación general
- Calidad del código: sólida / aceptable / necesita trabajo
- Problemas principales: [los 2-3 asuntos más importantes]
- Prioridad sugerida: [qué arreglar primero]

## Notas

- **Falta de contexto**: si el fragmento está incompleto, di que quizás necesitas más del código de alrededor
- **Modismos de framework**: algo que parece un problema puede ser un patrón propio del framework — márcalo como "requiere confirmación"
- **Código de pruebas**: relaja los criterios para las pruebas donde tenga sentido (el largo de las funciones, por ejemplo)
- **Nada encontrado**: si todas las revisiones pasan, imprime "✅ Revisión aprobada, no se encontraron problemas evidentes"
```

## Paso 4: Escribir los archivos de apoyo

**checklists/naming.md:**

```markdown
# Checklist de convenciones de nombrado

## Nombres de variables

**Bien:**
- `userCount`: claramente una cuenta de usuarios
- `isAuthenticated`: los booleanos empiezan con is/has/can
- `maxRetryAttempts`: declara tanto el significado como la unidad

**Mal:**
- `x`, `temp`, `data`: demasiado genéricos
- `flag`, `status`: no dicen qué estado guardan
- `getUserInfo2`: un sufijo numérico casi siempre significa que hay un duplicado

## Nombres de funciones

**Bien:**
- `calculateTotalPrice()`: verbo más sustantivo, declara la acción y su objeto
- `validateUserInput()`: dice qué hace y sobre qué actúa
- `fetchUserProfile()`: `fetch` señala que esto es asíncrono

**Mal:**
- `process()`: demasiado genérico, ¿procesa qué?
- `doStuff()`: no expresa ninguna intención
- `handleData()`: tanto `handle` como `data` son demasiado amplios

## Nombres de clases

**Bien:**
- `UserRepository`: un sustantivo que declara la responsabilidad (leer y escribir datos de usuario)
- `PaymentProcessor`: claramente lo que maneja los pagos
- `EmailValidator`: declara la responsabilidad de validar correos

**Mal:**
- `Manager`, `Helper`, `Utility`: sufijos demasiado genéricos para significar algo
- `DataClass`: no dice cuáles datos
```

**checklists/error-handling.md:**

````markdown
# Checklist de manejo de errores

## Escenarios que debes revisar

### 1. Llamadas a dependencias externas
- Peticiones a APIs (falla de red, timeout, respuestas 4xx/5xx)
- Consultas a base de datos (falla de conexión, timeout de consulta, violación de restricción)
- Operaciones de archivos (archivo inexistente, permisos insuficientes, disco lleno)

### 2. Entrada del usuario
- Entrada vacía, null, undefined
- Entrada mal formada
- Valores fuera de rango

### 3. Conversión de datos
- Parseo de JSON (entrada mal formada)
- Conversión de tipos (falla al pasar de string a número)
- Parseo de fechas (formato de fecha inválido)

## Patrones de manejo de errores

**Capturar y manejar:**
```javascript
try {
  const data = await fetchUser(id);
  return processData(data);
} catch (error) {
  logger.error('Failed to fetch user', { id, error });
  return null; // o lanza un error personalizado
}
```

**Revisar antes de llamar:**
```javascript
if (!user) {
  throw new Error('User not found');
}
const profile = user.getProfile(); // seguro — user definitivamente no es null
```

## Errores comunes

**Problema:** un bloque catch vacío
```javascript
try {
  riskyOperation();
} catch (e) {
  // aquí no pasa nada — el error se traga
}
```

**Arreglo:** al menos deja un log
```javascript
try {
  riskyOperation();
} catch (e) {
  logger.error('Operation failed', e);
  throw e; // o retorna un estado de error
}
```
````

## Paso 5: Probar con un caso desprolijo

Prepara un fragmento con varios problemas adentro:

```javascript
function process(data) {
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    if (item.type == "A") {
      var x = item.value * 2;
      result.push(x);
    } else if (item.type == "B") {
      var y = item.value / 2;
      result.push(y);
    } else {
      result.push(item.value);
    }
  }
  return result;
}
```

Invoca la Skill:

```
/code-review

[pega el código de arriba]
```

**La salida debería incluir:**

- ⚠️ Nombrado: `process`, `data`, `x` e `y` son todos demasiado genéricos
- ⚠️ Usa `var` en lugar de `const`/`let`
- ⚠️ Usa `==` en lugar de `===`
- ⚠️ Nunca revisa si `data` es null o si no es un arreglo
- ⚠️ Nunca revisa si `item.value` existe
- Sugerencia: la función se puede dividir en funciones puras más chicas

## Paso 6: Iterar

**Lo que suele aparecer en la primera corrida:**

- Omisiones (problemas reales que no detectó) → agrega reglas de revisión
- Salida demasiado larga → ajusta el formato de salida para que reporte solo lo que importa
- Falsos positivos (código normal marcado como problema) → agrega una categoría "requiere confirmación"

**Sigue mejorándolo:**

1. Después de cada revisión, anota qué problemas se colaron
2. Actualiza los checklists
3. Prueba de nuevo
4. Al mes, la Skill se vuelve genuinamente precisa.[^S8]

```agentmentor-check
{
  "id": "skills-zh-05-checklist-structure",
  "label": "Decisión sobre cómo organizar el checklist",
  "prompt": "Estás escribiendo una Skill de revisión de código y las reglas de revisión no paran de crecer: SKILL.md ya pasó las 300 líneas. ¿Cuál es la mejor jugada?",
  "whyHere": "Acabas de ver cómo las reglas de revisión de esta Skill se sacaron hacia checklists/ en lugar de meterlas en SKILL.md. El error en este punto es tratar SKILL.md como el lugar donde todo se acumula, así que vale la pena fijar cuándo hay que dividir un archivo antes de que tu propio Skill pase de este tamaño.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Seguir escribiendo en SKILL.md para que todas las reglas y el flujo queden en un solo archivo",
      "correct": false,
      "feedback": "300 líneas es demasiado largo. Claude lee el SKILL.md completo cuando carga la Skill, así que el largo te cuesta contexto en cada invocación — y tienes que desplazarte por todo el archivo cada vez que quieres cambiar una regla. Mueve las reglas detalladas a checklists/ y el archivo principal queda más claro."
    },
    {
      "id": "b",
      "text": "Mover las reglas de revisión detalladas a archivos de apoyo, dejando el flujo en el archivo principal",
      "correct": true,
      "feedback": "Correcto. Esto es divulgación progresiva en la práctica: SKILL.md contiene solo el flujo central («consulta checklists/naming.md para revisar el nombrado») y las reglas detalladas viven en sus propios archivos. Claude lee esos archivos cuando los necesita, y un archivo principal de menos de 100 líneas es mucho más fácil de mantener."
    }
  ]
}
```

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Construye tu propio Skill de revisión

Elige un dominio que conozcas bien — código de frontend, diseño de APIs, consultas SQL, documentación — y construye una Skill de revisión para él.

**Requisitos:**
1. Al menos 3 dimensiones de revisión
2. De 3 a 5 ítems de revisión concretos por dimensión
3. Un formato de salida claro (aprobado, para revisar, hay que arreglar)
4. Pruébala en al menos 2 casos reales

<!-- rubric -->
- Dimensiones bien definidas y que valga la pena revisar
- Cada ítem de revisión lo bastante concreto para actuar sobre él (no "revisar la calidad del código")
- Formato de salida que hace evidente la severidad de un vistazo
- Código o documentos reales probados y resultados registrados

<!-- answer -->
Respuesta de ejemplo (revisión de diseño de APIs):

```markdown
---
name: api-design-review
description: Revisa el diseño de una API en cuanto a convenciones RESTful, nombrado de parámetros, manejo de errores y completitud de la documentación. Úsala durante la revisión de diseño de una API
---

# Revisión de diseño de API

## Dimensiones de revisión

### 1. Convenciones RESTful
- Las URLs usan sustantivos, no verbos (✓ `/users` ✗ `/getUsers`)
- Los métodos HTTP son los correctos (GET lee, POST crea, PUT actualiza, DELETE elimina)
- Los códigos de estado tienen sentido (200/201/400/404/500)

### 2. Diseño de parámetros
- Los nombres de parámetros son claros y se usa un solo estilo en todo (snake_case o camelCase)
- Se distinguen los parámetros obligatorios de los opcionales
- Las reglas de validación están documentadas

### 3. Manejo de errores
- Hay una única forma consistente de respuesta de error
- Los mensajes de error llevan contexto suficiente para actuar
- Existen códigos de error para que los clientes puedan ramificar sobre ellos

## Formato de salida

### ✅ Cumple la convención
- [ítem de revisión]

### ⚠️ Mejora sugerida
- **Problema**: [qué está mal]
- **Sugerencia**: [cómo mejorarlo]

### 🔴 Violación de la convención
- **Problema**: [qué está mal]
- **Impacto**: [por qué esto es serio]
- **Arreglo**: [qué tiene que cambiar]
```

<!-- hint -->
Elige algo que revises al menos tres veces por semana — si no, la Skill no va a tener uso suficiente como para justificar el esfuerzo

<!-- hint -->
La primera versión no necesita cubrirlo todo. Escribe los 3 problemas más comunes, úsalo una semana y después agrega más

### Nivel 2: Compara una revisión humana con la de la Skill

Toma una pieza de código y revísala dos veces:
1. A mano, tú
2. Con la Skill code-review

Compara lo que encontró cada uno y anota:
- Qué problemas detectó la Skill que a ti se te pasaron
- Qué problemas detectaste tú que a la Skill se le pasaron
- Cuáles de sus hallazgos fueron falsos positivos (marcados como problemas pero en realidad están bien)

<!-- rubric -->
- El mismo código pasado por ambos métodos de revisión
- Comparación lado a lado de los hallazgos registrada
- Análisis de dónde la Skill es fuerte y dónde se queda corto
- Cambios concretos propuestos para la Skill

<!-- answer -->
Comparación de ejemplo:

**El código:** una función de procesamiento de datos de 50 líneas

**La revisión humana encontró:**
- Nombres de variables poco claros (2 lugares)
- Manejo de errores ausente (1 lugar)
- Lógica que se podría simplificar (1 lugar)

**La revisión de la Skill encontró:**
- Nombres de variables poco claros (3 lugares — uno más de los que encontré)
- Manejo de errores ausente (2 lugares — uno más de los que encontré)
- Función de más de 50 líneas, sugiere dividirla
- Usa `==` en lugar de `===` (2 lugares, ambos se me pasaron)

**Falso positivo:**
- La Skill marcó "código duplicado", pero esos dos bloques solo se parecen — sirven a propósitos distintos y no deberían unirse

**Cambios a hacer:**
- Agregar un umbral de similitud a la revisión de duplicación para que deje de marcar cualquier parecido
- Agregar a la Skill la regla de "simplificación de lógica" que apliqué a mano

<!-- hint -->
Las Skills son buenas con los problemas mecánicos y medibles — nombrado, formato, manejo de errores evidentemente ausente. Juzgar si la lógica de negocio es buena todavía necesita a una persona

<!-- /exercises -->

## Resumen

- **La revisión de código encaja naturalmente con una Skill**: pasos fijos, criterios medibles, alta repetición
- **Organiza el flujo como un checklist**: convenciones, manejo de errores, problemas potenciales, mantenibilidad
- **Los archivos de apoyo mantienen la Skill mantenible**: el archivo principal se queda corto, las reglas detalladas viven aparte
- **Graduar la salida importa**: aprobado, para revisar, hay que arreglar — para que quien revisa sepa qué hacer primero
- **Sigue iterando**: agrega después de cada revisión las revisiones que se te pasaron, y al mes va a ser precisa

En la próxima lección pasamos a los patrones avanzados: skills personales contra skills de proyecto, control de versiones y colaboración en equipo.

[Lección 6 >>](./06-advanced-patterns.md)
