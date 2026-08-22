---
domain: Agent Engineering
tags: [Agent Skills, workflow, beginner, Claude Code, Codex]
lang: es
---
# Agent Skills: introducción a la reutilización de flujos de trabajo

Este curso enseña a creadores y desarrolladores independientes que ya usan Claude Code, Codex u otro Agent similar a convertir un prompt de un solo uso en un Skill que el Agent pueda descubrir, cargar bajo demanda y volver a probar. El curso gira en torno a la especificación abierta de archivos de Agent Skills; no cubre entrenamiento de modelos, implementación de servidores MCP, plataformas de distribución de plugins ni metodologías completas de un dominio de negocio concreto.

**Al terminar el curso, serás capaz de:**
- Distinguir los límites de responsabilidad de un prompt de un solo uso, un Skill y una herramienta externa.
- Escribir metadatos de `SKILL.md` conformes a la especificación y fáciles de disparar.
- Estratificar el material y las operaciones deterministas con `references/`, `assets/` y `scripts/`.
- Diseñar pruebas de disparo, de límites y de calidad de salida para un Skill, registrando los fallos.
- Completar, sobre tu propio flujo de trabajo, una carpeta de Skill instalable y que puedas volver a probar.

**Requisitos previos:** saber usar un coding agent y poder crear directorios y editar archivos Markdown; no hace falta saber escribir Python, JavaScript ni llamar a APIs.

**Entorno de práctica:** usa tu propio IDE, terminal y Agent. El curso no ofrece un entorno de ejecución integrado ni te pide subir archivos privados.

## Lecciones

| # | Tema | Lo que aprenderás |
|---|---|---|
| 01 | [Prompts de un solo uso y Skills reutilizables](./01-prompt-to-skill.md) | Decidir qué trabajo merece ser empaquetado y dónde queda el límite de un Skill. |
| 02 | [Metadatos de SKILL.md y description de disparo](./02-skill-metadata.md) | Escribir un name, un description y una entrada de instrucciones mínima conformes a la norma. |
| 03 | [Divulgación progresiva y estratificación de recursos](./03-progressive-disclosure.md) | Dividir el material largo en capas que el Agent lee bajo demanda. |
| 04 | [Recursos, scripts y límites de ejecución](./04-resources-and-boundaries.md) | Decidir qué se entrega al modelo y qué se entrega a un script determinista. |
| 05 | [Pruebas de disparo y auditoría de seguridad](./05-testing-and-safety.md) | Usar tareas representativas para probar disparos erróneos, disparos perdidos y riesgos de extralimitación. |
| 06 | [Del flujo de trabajo a un Skill entregable](./06-ship-a-skill.md) | Completar un ciclo de construcción, auditoría y entrega en un flujo de trabajo real. |

> Las fuentes y los límites de versión están en [sources.md](./sources.md).
