---
domain: Desarrollo de software
tags: [colaboración multiagente, orquestación, diseño de prompts, subagentes, Claude API]
lang: es
outcome: Reparte el trabajo entre varios agentes sin caos: división del trabajo, prompts de delegación, productor-revisor.
tier: 2
order: 6
---

# Colaboración multiagente

Este curso trata de cuándo repartir una tarea entre varios agentes, y de cómo repartirla. Aprenderás la arquitectura orquestador-subagente, cómo escribir prompts de delegación que un subagente pueda entender por su cuenta, las situaciones en que encaja cada patrón de colaboración habitual (pipeline, revisión, votación) y el modo de fallo propio de los sistemas multiagente: un subagente que dice que ha «terminado» no es de fiar; tienes que comprobarlo tú mismo. Es para quienes han terminado los primeros cinco cursos de esta serie, saben escribir prompts básicos y entienden el protocolo de tool calling pero no han estudiado la colaboración multiagente de forma sistemática. Este curso no cubre el código fuente de los frameworks multiagente, los algoritmos de consenso de sistemas distribuidos ni cómo construir desde cero una plataforma de orquestación de propósito general; la lección 6 usa la Claude API para escribir un pipeline ejecutable de dos agentes (productor-revisor) como ejercicio práctico, pero el objetivo es entender los patrones de colaboración en sí, no entregar un framework listo para producción.

## Contenido del curso

1. [Por qué varios agentes: los límites de un solo contexto](./01-why-multiple-agents.md)
2. [Orquestador y subagentes: repartir y agregar](./02-orchestrator-and-subagents.md)
3. [Escribir prompts para delegar](./03-writing-prompts-for-delegation.md)
4. [Patrones de colaboración: pipeline, revisión, votación](./04-collaboration-patterns.md)
5. [Fallos y coordinación](./05-failure-and-coordination.md)
6. [Práctica: Construir un pipeline de revisión de dos agentes](./06-build-a-review-pipeline.md)

## Objetivos de aprendizaje

- Juzgar si una tarea vale la pena repartirla entre varios agentes, y reconocer el caso en que el costo de coordinación supera al beneficio
- Explicar el valor del aislamiento de contexto en la arquitectura orquestador-subagente, y por qué un subagente debería devolver solo su conclusión
- Escribir prompts de delegación autocontenidos para un subagente, con un alcance claro y un requisito de formato de salida
- Distinguir los patrones pipeline, productor-revisor y votación desde varias perspectivas, y juzgar dónde encaja cada uno
- Reconocer los fallos típicos de la colaboración multiagente —un «hecho» no verificable, trabajo duplicado, resultados en conflicto— y saber cómo responder
- Escribir un pipeline productor-revisor ejecutable de dos agentes con la Claude API

## Requisitos previos

- Has terminado los primeros cinco cursos de esta serie, sabes escribir prompts básicos, entiendes el protocolo de tool calling, conoces la memoria y el estado del agente, y puedes leer JavaScript básico
- Tienes un entorno de Node.js y puedes ejecutar scripts en una terminal
- Tienes una API key de Claude en funcionamiento (necesaria para el ejercicio práctico de la lección 6)

## Tiempo estimado

Unas 4-5 horas, incluido el ejercicio práctico de cada lección.
