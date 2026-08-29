---
domain: Desarrollo de software
tags: [ingeniería de contexto, presupuesto de atención, compactación de contexto, recuperación justo a tiempo, aislamiento de subagentes]
lang: es
outcome: Decide qué entra —y qué sale— del contexto en cada turno, para que las tareas largas no revienten la ventana.
tier: 2
order: 8
---

# Ingeniería de contexto: gastar una atención finita donde más rinde

Este curso enseña **ingeniería de contexto**: el oficio de decidir, en cada turno del bucle de un agente, qué tokens llega a ver el modelo. Del curso «Fundamentos del arnés de agente: bucles y control» ya te llevas que el historial crece cada vez que el bucle gira y que el presupuesto de atención del modelo es finito; este curso va a por ese problema de frente: a qué «altitud» conviene escribir un prompt del sistema, si las herramientas y los ejemplos cuentan como contexto, qué información precargar y cuál dejar que el agente recupere por su cuenta, cómo compactar el historial y tomar notas en las tareas largas, por qué los subagentes son una técnica de gestión de contexto y, por último, en la parte práctica, cablearás una capa de gestión de contexto sobre el arnés que construiste en ese mismo curso. Es para quien haya terminado los siete primeros cursos de esta serie. Este curso no vuelve a enseñar la técnica de escribir prompts (eso es «Fundamentos de la ingeniería de prompts: cómo escribir instrucciones eficaces»), no cubre la persistencia en archivos entre sesiones ni la recuperación de estado (el tema de «Memoria y estado del agente»; aquí el foco está en «dentro de esta única tarea larga, qué debería alimentar al modelo en cada turno»), no repite los patrones de colaboración multiagente («Colaboración multiagente»: los subagentes aparecen aquí solo desde la mirada del contexto) y no cubre cómo construir RAG ni bases de datos vectoriales.

## Contenido del curso

1. [De la ingeniería de prompts a la ingeniería de contexto](01-from-prompt-to-context.md)
2. [Anatomía del contexto: prompt del sistema, herramientas y ejemplos](02-anatomy-of-context.md)
3. [Recuperación justo a tiempo: dejar que el agente busque su propio contexto](03-just-in-time-context.md)
4. [Compactación y notas: gestión de contexto para tareas largas](04-compaction-and-notes.md)
5. [Subagentes y aislamiento de contexto](05-subagent-context-isolation.md)
6. [Práctica: cablear la gestión de contexto sobre el arnés](06-build-context-management.md)

## Objetivos de aprendizaje

Al terminar este curso podrás:

- Explicar cómo se relaciona la ingeniería de contexto con la ingeniería de prompts, y usar el presupuesto de atención y la degradación de contexto para explicar por qué el contexto es un recurso finito con rendimientos marginales decrecientes
- Juzgar la «altitud» de un prompt del sistema —lógica rígida y quebradiza en un extremo, orientación vaga y sin señales concretas en el otro— y reescribirlo hasta el punto en que es lo bastante específico para guiar la conducta y aun así le deja al modelo heurísticas sólidas
- Trazar la frontera entre la precarga y la recuperación justo a tiempo de una tarea, usando identificadores ligeros (rutas de archivo, consultas, enlaces) para que el agente descubra el contexto de forma progresiva y bajo demanda
- Diseñar una estrategia de compactación para una tarea larga: juzgar qué tiene que sobrevivir (decisiones, problemas sin resolver, detalles clave de implementación) y qué se puede tirar (salidas de herramientas redundantes), y usar notas estructuradas para aparcar el estado clave fuera de la ventana de contexto
- Explicar los subagentes en términos de economía del contexto: una ventana limpia, un resumen comprimido de apenas unos mil tokens de vuelta, y cuándo compensa gastar varias veces los tokens
- Equipar un bucle de arnés guiado por stop_reason con seguimiento del uso de tokens, compactación disparada por umbral y un cuaderno estructurado NOTES.md, y llevar hasta el final una tarea demasiado grande para una sola ventana

## Requisitos previos

- Has terminado los siete primeros cursos de esta serie, o tienes el equivalente
- Sabes escribir a mano un bucle de arnés guiado por `stop_reason` y entiendes que el historial `messages` crece en cada turno y que los bloques `tool_result` se devuelven juntos («Fundamentos del arnés de agente: bucles y control»)
- Sabes que la ventana de contexto es un recurso finito y que el historial de conversación solo crece («Memoria y estado del agente»)
- Sabes que un subagente parte de un contexto independiente y solo devuelve su conclusión («Colaboración multiagente»)
- Puedes leer y escribir código básico de JavaScript / Node.js (en la última lección escribes a la vez)

## Tiempo estimado

Unas 3-4 horas, incluido el ejercicio práctico de cada lección.
