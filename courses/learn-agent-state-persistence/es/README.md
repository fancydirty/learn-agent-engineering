---
domain: Desarrollo de software
tags: [persistencia de estado, puntos de control, reanudar tras una interrupción, idempotencia, rebobinar y bifurcar]
lang: es
outcome: Haz que las tareas largas sobrevivan a una interrupción: puntos de control, un registro de efectos y reanudar desde el corte.
tier: 2
order: 9
---

# Gestión de estado y persistencia: que las tareas largas sobrevivan a una interrupción

Este curso va del **estado de ejecución** de un agente: no de lo que el modelo «recuerda» (eso es la memoria, el terreno de «Memoria y estado del agente» y de «Ingeniería de contexto: gastar una atención finita donde más rinde»), sino de la escena en curso que sostiene el propio arnés: el array `messages`, los contadores de turnos y de uso, las llamadas a herramientas que todavía no se han escrito en el registro de efectos. Cuando el proceso muere, todos los archivos del disco sobreviven, pero esa escena desaparece, y la tarea vuelve a empezar de cero. Este curso te enseña a convertir esa escena en algo que puedes escribir en disco y restaurar: guardar un punto de control en cada paso, levantar otra vez el bucle desde el corte después de una caída, saber al reanudar qué herramientas es seguro volver a ejecutar y cuáles no (idempotencia), darles después a los puntos de control su segundo uso —rebobinar a una escena anterior y bifurcar un intento alternativo— y, por último, en la parte práctica, conectar los puntos de control y la reanudación completos al arnés que escribiste en «Fundamentos del arnés de agente: bucles y control». Es para quien haya terminado los ocho primeros cursos de esta serie. Este curso no vuelve a enseñar memoria ni gestión de contexto («Memoria y estado del agente» cubre lo que el modelo recuerda entre sesiones; «Ingeniería de contexto» cubre lo que cada turno le muestra al modelo; este curso cubre lo que registra el propio arnés), no enseña las API de motores de flujo de trabajo externos como Temporal y no cubre la concurrencia entre procesos ni la consistencia distribuida; los puntos de control de Claude Code aparecen solo como referencia de producto: lo que construyes aquí es un mecanismo para tu propio arnés.

## Contenido del curso

1. [Más allá de la memoria está el estado](01-memory-vs-state.md)
2. [Puntos de control: escribir la escena de ejecución en disco](02-checkpoint-anatomy.md)
3. [Reanudar desde un punto de control: reiniciar el bucle](03-resume-from-checkpoint.md)
4. [Efectos secundarios e idempotencia: qué herramientas es seguro volver a ejecutar al reanudar](04-side-effects-idempotency.md)
5. [Rebobinar y bifurcar: el segundo valor de los puntos de control](05-rewind-and-fork.md)
6. [Manos a la obra: conectar los puntos de control y la reanudación al arnés](06-build-checkpointing.md)

## Objetivos de aprendizaje

Al terminar este curso podrás:

- Separar la memoria de un agente (el contexto que le das al modelo) de su estado de ejecución (la escena en curso que sostiene el arnés), y explicar por qué «los agentes tienen estado y los errores se acumulan» hace que una caída resulte especialmente letal en una tarea larga
- Diseñar los puntos de control de un bucle de arnés: qué campos tienen que entrar en la instantánea, cuándo escribirla y cómo escribirla sin corromper el propio archivo del punto de control
- Implementar la reanudación: reconstruir `messages` y los contadores desde un punto de control, volver a entrar en el bucle y tratar correctamente la llamada colgante que queda cuando la caída cayó entre la ejecución de la herramienta y la escritura en el registro de efectos
- Respaldar la recuperación con idempotencia: juzgar qué herramientas es inofensivo volver a ejecutar y cuáles hay que proteger de una doble ejecución, y equipar las herramientas de alto impacto con claves de idempotencia
- Usar los puntos de control más allá de la recuperación ante desastres: rebobinar a una escena anterior para reintentar, bifurcar un intento alternativo y enunciar el reparto de tareas entre los puntos de control y el control de versiones
- Equipar el arnés de «Fundamentos del arnés de agente: bucles y control» con el mecanismo completo —persistencia por turno, recuperación con --resume, reconciliación de llamadas colgantes, protección idempotente frente a las reejecuciones— y demostrar una tarea larga interrumpida a mitad de ejecución y llevada hasta el final

## Requisitos previos

- Has terminado los ocho primeros cursos de esta serie, o tienes el equivalente
- Sabes escribir a mano un bucle de arnés guiado por `stop_reason` y entiendes que `tool_use` y `tool_result` tienen que emparejarse uno a uno («Fundamentos del arnés de agente: bucles y control»)
- Conoces la gestión de la ventana de contexto y la compactación («Ingeniería de contexto: gastar una atención finita donde más rinde»; los puntos de control de este curso cooperan con su contador `tokensUsed`)
- Puedes leer y escribir código básico de JavaScript / Node.js (en la lección 6 escribes a la vez)

## Tiempo estimado

Unas 3-4 horas, incluido el ejercicio práctico de cada lección.
