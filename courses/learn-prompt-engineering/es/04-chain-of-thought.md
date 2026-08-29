# Lección 4: Chain-of-thought: hacer que la IA muestre su razonamiento

> Objetivos de aprendizaje:
> - Entender cómo funciona la cadena de pensamiento y por qué ayuda
> - Aprender a guiar el razonamiento de la IA con «pensemos paso a paso»
> - Reconocer qué tipos de tarea encajan bien con CoT
>
> Requisitos: [<< Lección 3: Few-shot learning](./03-few-shot-learning.md) | Siguiente: [Lección 5 >>](./05-debugging-prompts.md)

## Cuando la IA acierta la respuesta pero se equivoca en el razonamiento

Le pasas a la IA un problema matemático con enunciado y responde «42». Lo revisas y la respuesta es correcta. Pero cambias a un problema parecido y la respuesta sale mal. ¿Qué pasó? El modelo pudo haber adivinado, o haber seguido un camino de razonamiento roto que casualmente cayó en el número correcto.

Para tareas que necesitan razonamiento de varios pasos (problemas matemáticos, acertijos de lógica, análisis complejos), hacer que la IA muestre sus pasos de razonamiento es más confiable que pedirle la respuesta directamente[^S5][^S10]. Esa es la idea central del prompting de chain-of-thought (cadena de pensamiento, CoT): partir la conclusión en pasos intermedios que de verdad puedas revisar.

## Qué es chain-of-thought

**El prompting de chain-of-thought (CoT)** es una técnica que hace que el modelo despliegue pasos de razonamiento intermedios antes de dar una respuesta final[^S5]. En palabras de la investigación, el prompting de cadena de pensamiento "enables complex reasoning capabilities through intermediate reasoning steps" (habilita capacidades de razonamiento complejo mediante pasos de razonamiento intermedios)[^S5]. La intuición es simple: "Chain of Thought prompting encourages the model to think through the problem in a step-by-step manner, which is supposed to mimic how humans break down complex problems" (el prompting de cadena de pensamiento anima al modelo a pensar el problema paso a paso, imitando cómo los humanos descomponen problemas complejos)[^S10]. Es lo mismo que haces tú cuando anotas ecuaciones y resultados intermedios en una hoja borrador para resolver un problema de matemáticas.

Compara los dos enfoques:

### Responder directamente (propenso a errores)

❌ **Sin CoT**:
```
Problema: una cafetería vendió 23 tazas de café en la mañana, 17 al mediodía y el doble de la mañana en la tarde. ¿Cuántas tazas vendió en todo el día?

Respuesta:
```

La IA podría limitarse a devolver:
```
86 tazas
```

Si la respuesta está mal, no tienes idea de qué paso se desvió.

### Mostrar los pasos del razonamiento (más confiable)

✅ **Con CoT**:
```
Problema: una cafetería vendió 23 tazas de café en la mañana, 17 al mediodía y el doble de la mañana en la tarde. ¿Cuántas tazas vendió en todo el día?

Pensemos paso a paso:
```

La IA devuelve:
```
Pensemos paso a paso:

1. Ventas de la mañana: 23 tazas
2. Ventas del mediodía: 17 tazas
3. La tarde es el doble de la mañana: 23 × 2 = 46 tazas
4. Total del día: 23 + 17 + 46 = 86 tazas

Respuesta: 86 tazas
```

Cada paso queda a la vista, así que si uno está mal lo detectas de inmediato y corriges el prompt.

La investigación muestra que en tareas con razonamiento de varios pasos CoT eleva la precisión de forma sustancial[^S5]; en algunas tareas, combinar CoT con demostraciones resueltas sube la precisión hasta un 28.2% adicional[^S10].

## Dos formas de usar CoT

### Método 1: CoT zero-shot (la más simple)

Agrega una línea al final de tu prompt: "**let's think step by step**" (en español, «**pensemos paso a paso**»)[^S5][^S10].

```
Problema: si 5 trabajadores necesitan 5 días para terminar un proyecto, ¿cuántos días necesitan 10 trabajadores?

Pensemos paso a paso:
```

Esa sola línea activa el modo de razonamiento paso a paso del modelo. No entregas ningún ejemplo; el modelo descompone el problema por su cuenta.

### Método 2: CoT few-shot (más controlable)

Entrega uno o dos ejemplos que incluyan el proceso de razonamiento completo[^S5][^S10].

```
Ejemplo:
Problema: un auto viaja a 60 km/h. ¿Qué distancia recorre en 3 horas?
Razonamiento:
- Velocidad = 60 km/h
- Tiempo = 3 horas
- Distancia = velocidad × tiempo = 60 × 3 = 180 km
Respuesta: 180 km

Ahora resuelve este problema:
Problema: un auto viaja a 80 km/h durante 2.5 horas y después a 60 km/h durante 1 hora más. ¿Qué distancia recorre en total?
Razonamiento:
```

El ejemplo muestra el formato del razonamiento y qué tan detallados deben ser los pasos, y el modelo imita ese estilo.

## Qué tareas encajan con CoT

CoT rinde mejor en tareas que necesitan razonamiento de varios pasos[^S10]:

✅ **Razonamiento matemático y lógico**
- Problemas con enunciado
- Cálculos de razones y proporciones
- Derivaciones de fórmulas en varios pasos

✅ **Análisis causal**
- «¿Por qué X causa Y?»
- «¿Cuál es la causa raíz de este bug?»

✅ **Planificación y decisiones**
- «¿Hago primero A o primero B?»
- «¿Cuáles son las ventajas y desventajas de este enfoque?»

✅ **Depuración de código**
- «¿Por qué falla este código?»
- «¿Qué paso es el cuello de botella de rendimiento?»

Dónde no encaja:

❌ **Consultas de hechos simples**: «¿Cuándo se lanzó Python por primera vez?» — no hace falta razonar
❌ **Escritura creativa**: poemas, cuentos — los pasos de razonamiento rompen el flujo creativo
❌ **Conversión de formato**: JSON → CSV — es una operación mecánica, no hace falta razonar

Regla práctica: si para hacer la tarea por tu cuenta necesitas una hoja borrador para anotar los pasos, encaja bien con CoT.

```agentmentor-check
{
  "id": "prompt-engineering-cot-task-fit",
  "label": "Idoneidad de una tarea para CoT",
  "prompt": "¿Cuál de estas tareas encaja mejor con el prompting de cadena de pensamiento?\n\nA: Traducir este texto del inglés al español\nB: Analizar la complejidad temporal de este código y explicar por qué\nC: Generar 10 nombres creativos de producto\nD: Reescribir este texto en un tono formal",
  "whyHere": "Verifica si distingues que CoT encaja con tareas de razonamiento de varios pasos, no con conversiones simples ni con generación creativa: justo la trampa que lleva a la gente a pegarle CoT a todo",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A - Tarea de traducción",
      "correct": false,
      "feedback": "❌ La traducción es una conversión entre idiomas, no una tarea de razonamiento. El modelo sí procesa el texto internamente, pero desglosar pasos como «primero traduce el sujeto, luego el verbo» aporta poco a la calidad de la traducción."
    },
    {
      "id": "b",
      "text": "B - Analizar la complejidad temporal",
      "correct": true,
      "feedback": "✓ Correcto. El análisis de complejidad temporal necesita varios pasos de razonamiento: detectar la estructura de bucles, contar las iteraciones de cada uno, revisar si hay anidamiento y llegar a O(n) o O(n²). Mostrar esos pasos mantiene honesta la lógica y te deja verificar dónde falló un juicio."
    },
    {
      "id": "c",
      "text": "C - Generar nombres creativos",
      "correct": false,
      "feedback": "❌ La generación creativa no necesita pasos de razonamiento visibles. Forzar CoT («paso uno: elige una raíz, paso dos: agrega un prefijo...») estrecha las ideas y vuelve mecánica la salida."
    },
    {
      "id": "d",
      "text": "D - Reescribir en un tono formal",
      "correct": false,
      "feedback": "❌ Reescribir el tono es una conversión de estilo, no un razonamiento. Podrías enumerar pasos («quita la jerga, cambia a frases de registro escrito»), pero ayudan poco al resultado; reescribir directamente funciona mejor."
    }
  ]
}
```

## Ejemplos resueltos: analizar problemas con CoT

### Escenario 1: análisis de rendimiento de código

**Sin CoT (una conclusión en la que no puedes confiar)**:
````
¿Este código tiene un problema de rendimiento?

```python
def find_duplicates(items):
    duplicates = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if items[i] == items[j] and items[i] not in duplicates:
                duplicates.append(items[i])
    return duplicates
```

Respuesta: sí, tiene un problema de rendimiento
````

Solo una conclusión, sin ninguna razón.

**Con CoT (razonamiento claro)**:
````
Analiza el problema de rendimiento de este código. Explica paso a paso:
1. Identifica la estructura de bucles
2. Calcula la complejidad temporal
3. Señala el cuello de botella concreto
4. Sugiere una optimización

```python
def find_duplicates(items):
    duplicates = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if items[i] == items[j] and items[i] not in duplicates:
                duplicates.append(items[i])
    return duplicates
```
````

La IA muestra:
```
Análisis de rendimiento:

1. Estructura de bucles:
   - Bucle externo: recorre cada elemento, O(n)
   - Bucle interno: por cada elemento, recorre los restantes, O(n)
   - En conjunto: bucles anidados, O(n²)

2. Complejidad temporal:
   - Bucles principales: O(n²)
   - La comprobación `items[i] not in duplicates`: O(m) en el peor caso, donde m es la cantidad de duplicados encontrados hasta ese momento
   - Complejidad total: O(n² × m)

3. Cuello de botella de rendimiento:
   - Los bucles anidados se vuelven muy lentos con entradas grandes (n > 1000)
   - El escaneo lineal de `not in` sobre una lista lo ralentiza todavía más

4. Optimización:
   - Usar un set en vez de una lista para guardar los duplicados, bajando la comprobación de O(m) a O(1)
   - O usar un Counter para encontrar en una sola pasada todos los elementos que aparecen más de una vez, bajando a O(n)
```

Cada paso del razonamiento es verificable, así que si uno está mal lo ves de inmediato.

### Escenario 2: un acertijo de lógica

**Problema**:
```
Tres personas — A, B y C — entran a una competencia. Sabemos que:
- A no es primer lugar
- B no es último lugar
- C no es ni primer ni último lugar

¿Cuáles son sus posiciones?

Razonemos paso a paso:
```

**Salida de la IA**:
```
Razonemos paso a paso:

1. Partimos de la condición de C:
   - C no es primero ni último
   - Entonces C tiene que ser segundo

2. Fijamos a A y a B:
   - A no es primero
   - B no es último
   - C ya es segundo, así que quedan el primer y el tercer lugar para A y B

3. Asignamos las posiciones restantes:
   - A no es primero, así que A es tercero
   - B no es último (tercero), así que B es primero

Respuesta: B primero, C segundo, A tercero
```

Desplegar esta eliminación paso a paso hace mucho más fácil verificar si la lógica es impecable.

## Patrones habituales de CoT

### Patrón 1: descomposición del problema

Parte un problema complejo en unos pocos subproblemas.

```
Problema: un proyecto de software tiene 5 ingenieros, cada uno trabaja 6 horas al día, y requiere 120 días-persona de trabajo. Si se amplía a 8 ingenieros, ¿cuántos días antes puede terminar?

Calculemos paso a paso:
1. ¿Cuántos días necesita la configuración actual?
2. ¿Cuántos días después de sumar gente?
3. ¿Cuántos días antes?
```

### Patrón 2: verificación de hipótesis

Enumera las hipótesis y después revísalas una por una.

```
Este código lanza "TypeError: unsupported operand type(s)". ¿Cuáles son las causas posibles?

Revisemos las causas posibles una por una:
1. Revisa los tipos de las variables a cada lado del operador
2. Revisa si hay un valor None involucrado en la operación
3. Revisa si se está mezclando una cadena con un número
```

### Patrón 3: argumentar en ambos sentidos

Enumera las razones a favor y en contra, y después llega a una conclusión.

```
¿Deberíamos usar una arquitectura de microservicios o un monolito?

Analicémoslo desde dos ángulos:

Razones a favor de los microservicios:
1. ...
2. ...

Razones a favor de un monolito:
1. ...
2. ...

Juicio general:
Con base en el tamaño actual del equipo y la complejidad del proyecto, recomiendo...
```

## Los límites de CoT

CoT no es una cura para todo. Tiene algunos límites:

**1. Agrega longitud y tiempo**

Mostrar los pasos del razonamiento alarga la salida, consume más tokens y tarda más en responder.

**Cuándo vale la pena**: en tareas complejas, gastar 2-3 veces los tokens para ganar precisión es un buen intercambio.
**Cuándo no**: en tareas simples («qué día es hoy»), los pasos de razonamiento son puro desperdicio.

**2. Los pasos del razonamiento pueden estar mal ellos mismos**

Los pasos que muestra la IA pueden parecer razonables y aun así tener un hueco en la lógica. Sigues teniendo que verificar si el razonamiento es correcto.

El valor de CoT es que vuelve visibles los errores. Cuando la IA responde directamente, el error se esconde en una caja negra; cuando los pasos están a la vista, el error aflora en algún paso y es más fácil de encontrar y corregir.

**3. No encaja con tareas que dependen de la intuición**

Algunas tareas (escritura creativa, evaluar arte) se apoyan en una impresión de conjunto, y forzarlas a pasos rompe el todo.

## Resumen

El prompting de cadena de pensamiento hace que la IA muestre sus pasos de razonamiento en vez de saltar directo a una respuesta. Al agregar «pensemos paso a paso» a un prompt, o al entregar ejemplos que incluyen el razonamiento, puedes elevar sustancialmente la precisión en tareas de razonamiento de varios pasos.

CoT encaja con razonamiento matemático, análisis lógico, inferencia causal, decisiones complejas: cualquier cosa que necesite varios pasos de pensamiento. Vuelve el razonamiento visible y verificable. Sí agrega longitud a la salida, pero en tareas complejas el beneficio supera con creces el costo.

La siguiente lección cubre cómo depurar y mejorar prompts: cuando la salida de la IA no coincide con lo que esperabas, cómo encontrar el problema de forma sistemática y corregirlo.

**Próxima lección** [Depuración y mejora de prompts >>](./05-debugging-prompts.md)

<!-- exercises -->

## 💻 Ejercicios

### Nivel 1: Aplicar CoT zero-shot

Usa la técnica de «pensemos paso a paso» para que la IA resuelva el problema de abajo:

**Problema**: un equipo tiene 8 personas, cada una trabaja 6 horas al día. El proyecto requiere 240 horas-persona de trabajo. Si el equipo crece a 12 personas, ¿cuántos días antes puede terminar?

Escribe el prompt completo (incluyendo «pensemos paso a paso») y después predice qué pasos intermedios mostrará la IA.

<!-- rubric -->
- El prompt incluye «pensemos paso a paso» o una señal equivalente
- El enunciado del problema es claro y completo
- Los pasos de razonamiento predichos son lógicamente correctos
- Los pasos de razonamiento cubren los cálculos clave (días necesarios en la configuración actual, días necesarios en la nueva, la diferencia)
- Identificación de por qué este problema encaja bien con CoT
<!-- answer -->
**Prompt**:
```
Un equipo tiene 8 personas, cada una trabaja 6 horas al día. El proyecto requiere 240 horas-persona de trabajo. Si el equipo crece a 12 personas, ¿cuántos días antes puede terminar?

Pensemos paso a paso:
```

**Pasos de razonamiento predichos**:
```
Pensemos paso a paso:

1. Calcular la producción diaria del equipo actual:
   - 8 personas × 6 horas/persona/día = 48 horas-persona/día

2. Calcular los días necesarios en la configuración actual:
   - 240 horas-persona ÷ 48 horas-persona/día = 5 días

3. Calcular la producción diaria del equipo ampliado:
   - 12 personas × 6 horas/persona/día = 72 horas-persona/día

4. Calcular los días necesarios en la nueva configuración:
   - 240 horas-persona ÷ 72 horas-persona/día = 3.33 días (unos 3.4 días)

5. Calcular los días ahorrados:
   - 5 días − 3.33 días = 1.67 días (unos 1.7 días, o 1 día y 17 horas)

Respuesta: el proyecto puede terminar unos 1.7 días antes.
```

**Por qué encaja con CoT**:
- Es un cálculo de varios pasos donde cada paso alimenta al siguiente
- Responder directamente hace fácil equivocarse en una cuenta o saltarse un paso
- Mostrar los pasos nos deja verificar cada cálculo
- Si la respuesta se desvía, podemos localizar rápido qué paso salió mal

<!-- hint -->
La clave en este tipo de problema: calcula primero el estado actual, después el estado tras el cambio, y después la diferencia. Cuando predigas los pasos de razonamiento, enumera cada cálculo en ese orden.
<!-- hint -->
CoT zero-shot es solo agregar una línea, «pensemos paso a paso»: no hacen falta ejemplos. Prueba usar esta técnica para que la IA explique su razonamiento.

### Nivel 2: Diseñar un prompt de CoT few-shot

Escenario: necesitas que la IA juzgue la complejidad temporal de un fragmento de código y explique el razonamiento.

Diseña un prompt de CoT few-shot con 2 ejemplos (uno O(n), uno O(n²)) que muestre los pasos de razonamiento completos.

<!-- rubric -->
- Los dos fragmentos de código de ejemplo tienen una estructura clara y juicios de complejidad correctos
- Los pasos de razonamiento de cada ejemplo están completos: identificar bucles → calcular la complejidad de cada nivel → combinar en la complejidad total
- Los pasos de razonamiento usan un formato consistente
- Los ejemplos cubren tipos distintos (bucle simple contra bucle anidado)
- El prompt declara la tarea y el formato de salida
<!-- answer -->
**Prompt de CoT few-shot**:

````
Analiza la complejidad temporal del código y muestra los pasos de razonamiento.

Ejemplo 1:
Código:
```python
def find_max(arr):
    max_val = arr[0]
    for num in arr:
        if num > max_val:
            max_val = num
    return max_val
```

Razonamiento:
1. Identificar la estructura de bucles: un bucle for sobre el arreglo
2. Cantidad de iteraciones: visita n elementos, cada uno accedido una vez
3. Operaciones del cuerpo del bucle: comparación y asignación, ambas O(1) en tiempo constante
4. Complejidad total: O(n) × O(1) = O(n)

Conclusión: la complejidad temporal es O(n)

---

Ejemplo 2:
Código:
```python
def find_duplicates(arr):
    duplicates = []
    for i in range(len(arr)):
        for j in range(i + 1, len(arr)):
            if arr[i] == arr[j]:
                duplicates.append(arr[i])
    return duplicates
```

Razonamiento:
1. Identificar la estructura de bucles: dos bucles for anidados
2. Bucle externo: recorre n elementos
3. Bucle interno: por cada i, recorre (n-i-1) elementos
4. Cantidad total de iteraciones: (n-1) + (n-2) + ... + 1 = n(n-1)/2 ≈ n²/2
5. Operaciones del cuerpo del bucle: comparación y append, ambas O(1)
6. Complejidad total: O(n²) × O(1) = O(n²)

Conclusión: la complejidad temporal es O(n²)

---

Ahora analiza este código:
Código:
```python
[pega el código]
```

Razonamiento:
````

**Por qué funciona este prompt**:
1. **Contraste claro entre los ejemplos**: la diferencia entre O(n) y O(n²) es si los bucles están anidados
2. **Pasos de razonamiento estandarizados**: identificar la estructura → contar iteraciones → analizar operaciones → llegar a una conclusión
3. **Formato consistente**: los dos ejemplos usan el mismo formato de pasos numerados
4. **Cada paso explicado lo suficiente**: no solo «esto es O(n)» sino por qué es O(n)
5. **Cierre abierto**: «Razonamiento:» le indica a la IA que devuelva el proceso de razonamiento

<!-- hint -->
La clave del CoT few-shot: los ejemplos no deberían limitarse a dar la respuesta, deberían mostrar cada paso del pensamiento desde el problema hasta la respuesta. Imagina que le enseñas a una persona a hacer esta tarea: ¿cómo se la desglosarías?
<!-- hint -->
Cuando diseñes los pasos de razonamiento, asegúrate de que cada uno sea necesario (saltárselo deja la comprensión incompleta) y verificable (puedes revisar ese paso por su cuenta).

<!-- /exercises -->
