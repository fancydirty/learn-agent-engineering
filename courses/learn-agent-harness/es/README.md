---
domain: Desarrollo de software
tags: [arnés de agente, control del bucle, condiciones de parada, human-in-the-loop, fiabilidad del agente]
lang: es
outcome: Escribe a mano un bucle de agente dirigido por stop_reason y equípalo con cuatro válvulas de parada.
tier: 2
order: 7
---

# Fundamentos del arnés de agente: bucles y control

Este curso trata del **arnés** del agente: la capa de código de control fuera del modelo que de verdad hace funcionar a un agente. Ese código impulsa el bucle «modelo → ejecutar herramientas → devolver resultados → volver a preguntar», decide cuándo se detiene ese bucle, lo atrapa cuando se desboca y permite que una persona lo interrumpa y lo redirija sobre la marcha. El curso se centra en el bucle de ejecución de un solo agente y termina contigo escribiendo a mano un arnés mínimo con condiciones de parada, un tope de presupuesto, detección de giro en vacío y una válvula de aprobación humana. Es para quienes han terminado los primeros seis cursos de esta serie: necesitas entender un ida y vuelta de tool calling (`stop_reason: "tool_use"` / `tool_result`), la memoria del agente y la ventana de contexto, y los fundamentos de la división del trabajo multiagente. Este curso no es un tutorial de la API de ningún framework concreto (nada específico de Claude Agent SDK ni de LangChain), no cubre la orquestación multiagente (que es otro curso de esta serie) y no cubre la evaluación ni la regresión (reservadas para el curso de verificación); el foco es una sola capa: cómo se mantiene bajo control el propio bucle.

## Contenido del curso

1. [Qué es un arnés: el código de control alrededor del modelo](01-what-is-a-harness.md)
2. [El bucle central: de una ida y vuelta a la operación continua](02-the-core-loop.md)
3. [Condiciones de parada: cuándo debería rendirse un agente](03-stop-conditions.md)
4. [Desbocamiento y salvaguarda: bucles muertos, giro en vacío, agotamiento del presupuesto](04-loop-failure-modes.md)
5. [Intervención y dirección: interrumpir, redirigir, human-in-the-loop](05-intervention-and-steering.md)
6. [Manos a la obra: escribir a mano un arnés de agente con controles](06-build-a-harness.md)

## Objetivos de aprendizaje

Al terminar este curso podrás:
- Trazar la línea entre el arnés y el modelo, y explicar por qué el mismo modelo con un arnés distinto puede producir resultados radicalmente distintos
- Escribir a mano el bucle central que impulsa a un agente, y explicar cómo `stop_reason` decide si el bucle continúa o se detiene
- Diseñar un conjunto explícito de condiciones de parada para un agente en vez de fiarte de que el modelo diga «he terminado»
- Reconocer los modos de descontrol —bucles muertos, giro en vacío, agotamiento del presupuesto, errores acumulados— y equipar el bucle con un mecanismo de resguardo para cada uno
- Juzgar en qué punto del bucle va un punto de control humano, manteniendo las operaciones irreversibles fuera de la ejecución automática
- Construir, desde cero, un arnés mínimo con condiciones de parada, un tope de turnos, un tope de presupuesto, detección de giro en vacío y una válvula de aprobación

## Requisitos previos

- Has terminado los primeros seis cursos de esta serie, o tienes el equivalente
- Entiendes un ida y vuelta completo de tool calling: el modelo devuelve `stop_reason: "tool_use"`, el host ejecuta la herramienta y el `tool_result` se empalma de vuelta en la conversación
- Sabes que la ventana de contexto es un recurso finito y que el historial se sigue acumulando (curso 5 de esta serie, «Memoria y estado del agente»)
- Puedes leer código básico de JavaScript / Node.js (en la lección 6 escribes a la vez)
- No hace falta base de machine learning ni de entrenamiento de modelos

## Tiempo estimado

Unas 3-4 horas, incluido el ejercicio práctico de cada lección.
