---
domain: Desarrollo de software
tags: [memoria del agente, ventana de contexto, compaction de resumen, memoria persistente, prompt injection]
lang: es
outcome: Distingue memoria de estado y dale a un agente una memoria que sobreviva entre sesiones sin envenenarse.
tier: 2
order: 5
---

# Memoria y estado del agente

Un agente parece «recordar» lo que hablasteis hace diez minutos, pero esa memoria no vive de verdad en la cabeza del modelo: simplemente se ha metido, verbatim, en la ventana de contexto de cada solicitud. Este curso desarma esa ilusión: por qué la ventana de contexto equivale a toda la memoria de un agente, por qué el historial de conversación solo crece, cuándo deberías escribir la memoria en un archivo, cómo un agente recuerda en qué punto está una tarea y qué riesgos de seguridad introduce la propia memoria. Es para quienes han terminado los primeros cuatro cursos de esta serie y quieren que un agente recuerde información entre sesiones. Se centra en la cadena que va de la ventana de contexto a la memoria persistente a nivel de archivo; no cubre construir una base de datos vectorial ni un sistema de recuperación RAG, ni el entrenamiento de memoria a nivel de modelo. Al terminar, conectarás por tu cuenta a un agente una capa de memoria persistente legible, escribible y comprimible.

## Contenido del curso

1. [La ventana de contexto es toda la memoria que tiene un agente](01-context-window-is-memory.md)
2. [Gestionar el historial de conversación: añadir, truncar, resumir](02-managing-conversation-history.md)
3. [Memoria externa: archivos y recuperación](03-external-memory-files.md)
4. [Estado estructurado: cómo un agente recuerda en qué punto está una tarea](04-structured-task-state.md)
5. [Los límites y la seguridad de la memoria](05-memory-boundaries-and-safety.md)
6. [Manos a la obra: añadir una capa de memoria persistente a un agente](06-build-a-memory-layer.md)

## Objetivos de aprendizaje

Al terminar este curso podrás:

- Explicar por qué «el agente tiene memoria» es una ilusión, y decir con exactitud qué contiene en realidad la ventana de contexto
- Nombrar tres estrategias para un historial de conversación que ha crecido demasiado, y juzgar qué descarta y qué conserva cada una
- Diseñar un esquema de memoria externa basada en archivos, sabiendo qué escribir en ella y cuándo recuperarla
- Usar estado estructurado (listas de tareas, checkpoints) para que un agente reanude tras una interrupción en vez de empezar de cero
- Reconocer las vías de ataque del envenenamiento de memoria y nombrar al menos dos defensas concretas
- Conectar por tu cuenta a un agente herramientas de lectura/escritura y la lógica de compaction, construyendo una capa de memoria persistente ejecutable

## Requisitos previos

- Has completado los primeros cuatro cursos de esta serie y sabes escribir prompts estructurados
- Entiendes el protocolo de ida y vuelta del tool calling (tool_use / tool_result)
- Puedes leer JavaScript básico (variables, funciones, async/await, métodos de array)
- Tienes un entorno local capaz de ejecutar scripts de Node.js

## Tiempo estimado

Unas 3-4 horas, incluido el ejercicio práctico de cada lección.
