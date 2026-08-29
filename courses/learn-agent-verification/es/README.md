---
domain: Desarrollo de software
tags: [evaluación de agentes, verificadores, juez LLM, conjuntos de evaluación, control de calidad]
lang: es
outcome: Construye un circuito de evaluación para la salida de tu agente que separe «parece terminado» de «está terminado».
tier: 2
order: 10
---

# Verificación y control de calidad: que no se cuele lo que «parece correcto»

Este curso va de **dar por buena la salida de un agente**. Los últimos cursos pusieron a tu agente en marcha, y en marcha durante mucho rato: el bucle del arnés de «Fundamentos del arnés de agente: bucles y control», la gestión de contexto de «Ingeniería de contexto: gastar una atención finita donde más rinde», y los puntos de control y la recuperación de «Gestión de estado y persistencia: que las tareas largas sobrevivan a una interrupción». Pero «terminó la ejecución» y «lo hizo bien» son dos cosas distintas: los agentes no son deterministas, la misma tarea toma dos caminos distintos en dos ejecuciones, y el supuesto de las pruebas tradicionales («entrada X, camino Y, salida Z») simplemente se derrumba. Este curso te enseña a hacer una aceptación sólida bajo esa premisa: primero separar «parece terminado» de «está terminado», después decidir qué verificar (primero el estado final, el proceso como respaldo), con qué verificarlo (primero los verificadores deterministas que dan aprobado/fallido; los jueces LLM solo para el texto libre) y contra cuántos casos verificar (empieza con 20 tareas reales, no esperes a acumular cientos) y, por último, construir un circuito de evaluación para tu propio agente: una tarea por bucle y un reporte al final, para que un cambio de prompt se vea como un cambio de puntuación. Es para quien haya terminado los nueve primeros cursos de esta serie. Este curso no enseña metodología general de pruebas de software (no se cubre cómo escribir tests unitarios), no enseña ningún framework de evals ni API de plataforma concretos, y no cubre la construcción de benchmarks del lado del entrenamiento de modelos; conectar las evaluaciones a CI se menciona como sentido común de ingeniería, pero no se desarrolla.

## Contenido del curso

1. [«Parece terminado» no es «está terminado»](01-looks-done-vs-is-done.md)
2. [Qué verificar: primero el estado final, el proceso como respaldo](02-what-to-verify.md)
3. [Verificadores deterministas: solo cuentan las comprobaciones que dan aprobado/fallido](03-deterministic-checks.md)
4. [Juez LLM: rúbricas, formatos y lo que no debes dejarle juzgar](04-llm-as-judge.md)
5. [Conjuntos de evaluación: empieza con 20 tareas reales](05-eval-sets.md)
6. [Práctica: construye un circuito de evaluación para tu agente](06-build-eval-harness.md)

## Objetivos de aprendizaje

Al terminar este curso podrás:

- Explicar cómo el no determinismo de los agentes rompe el supuesto del camino de las pruebas tradicionales, y por qué «parece terminado» se vuelve la única señal cuando no hay una comprobación ejecutable
- Definir criterios de éxito medibles para una tarea de agente, y decidir entre verificar el estado final o colocar puntos de control de estado en los nodos clave, en lugar de auditar la trayectoria paso a paso
- Elegir verificadores en orden de más rápido, más fiable y más escalable: primero las comprobaciones deterministas (coincidencia exacta, comparación por script, suites de tests), y reconocer trampas como la de un verificador demasiado estricto que rechaza una salida correcta
- Diseñar un juez LLM para la salida en texto libre: una rúbrica de varias dimensiones, un formato de salida restringido y razonar antes de puntuar; y explicar por qué el modelo que hizo el trabajo no debería ponerse la nota, y por qué un juez al que le pides que encuentre problemas siempre encuentra alguno
- Construir un conjunto de evaluación a partir de unas 20 tareas reales: ajustarse a la distribución real, añadir casos límite, preferir la cantidad al pulido de cada caso y apartar un conjunto reservado contra el sobreajuste; y explicar por qué un puñado de casos tempranos basta cuando el tamaño de efecto es grande
- Construir un circuito de evaluación repetible para tu propio agente: un bucle de arnés por tarea, puntuación por capas con verificadores deterministas más un juez LLM, y registrar el tiempo y el número de llamadas más allá de la tasa de aprobación; y usarlo para medir el impacto real de un cambio de prompt

## Requisitos previos

- Has terminado los nueve primeros cursos de esta serie, o tienes el equivalente
- Sabes escribir a mano un bucle de arnés guiado por `stop_reason` y entiendes el emparejamiento `tool_use`/`tool_result` («Fundamentos del arnés de agente: bucles y control»)
- Sabes cómo llegan al disco los puntos de control y el registro de efectos («Gestión de estado y persistencia: que las tareas largas sobrevivan a una interrupción»; el circuito de evaluación de este curso reutiliza el esqueleto del bucle del arnés)
- Puedes leer y escribir código básico de JavaScript / Node.js (en la lección 6 escribes a la vez)

## Tiempo estimado

Unas 3-4 horas, incluido el ejercicio práctico de cada lección.
