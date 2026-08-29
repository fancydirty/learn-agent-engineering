---
domain: Desarrollo de software
tags: [llamada a herramientas de agentes, inyección de prompt, diseño de permisos, diseño de interfaces de herramientas, Claude API]
lang: es
outcome: Lee el protocolo de llamada a herramientas y diseña interfaces que el modelo elija bien, rellene bien y no pueda desbordar.
tier: 1
order: 4
---

# Llamada a herramientas en agentes: conseguir que los agentes hagan cosas de verdad

Este curso recorre el mecanismo completo de la llamada a herramientas en agentes (tool use / function calling): qué campos exactos viajan entre la petición de una llamada a herramienta y su respuesta, los límites de riesgo de los cinco tipos de herramienta más habituales (leer, escribir, ejecutar, buscar y llamar a una API externa), cómo escribir una interfaz de herramienta que el modelo elija bien y rellene bien, y cómo llevar a la práctica los niveles de permiso y las defensas frente a la inyección de prompt. Está pensado para perfiles de desarrollo que ya saben escribir prompts básicos y han usado una herramienta como Claude Code, pero que aún no han estudiado de forma sistemática el protocolo subyacente. No enseña ningún framework de agentes concreto (LangChain, AutoGPT) ni cubre el entrenamiento o el fine-tuning de modelos: se centra en la cadena en sí, en cómo el modelo pide una acción y cómo el anfitrión la ejecuta de forma segura.

## Contenido del curso

1. [De «solo hablar» a «actuar»: por qué los agentes necesitan herramientas](01-why-agents-need-tools.md)
2. [La ida y vuelta completa de una llamada a herramienta](02-one-tool-call-round-trip.md)
3. [Cinco tipos comunes de herramientas: leer, escribir, ejecutar, buscar, llamar](03-tool-types.md)
4. [Diseñar interfaces de herramientas: nombre, descripción, parámetros, valor de retorno](04-designing-tool-interfaces.md)
5. [Permisos y seguridad: los límites de lo que un agente puede hacer](05-permissions-and-safety.md)
6. [Manos a la obra: conectar tres herramientas a un agente](06-build-a-tool-using-agent.md)

## Objetivos de aprendizaje

Al terminar este curso podrás:
- Enunciar la línea de «el modelo solo propone, el anfitrión ejecuta» en la llamada a herramientas, y usarla para juzgar si una tarea necesita herramientas siquiera
- Leer y escribir a mano una ida y vuelta completa de tool_use / tool_result, incluido el retorno por lotes de varias llamadas en paralelo
- Clasificar los cinco tipos de herramienta (leer, escribir, ejecutar, buscar y llamar a una API externa) por radio de impacto y detectar la trampa a la que cada uno es más propenso
- Escribir la description, el JSON Schema y el valor de retorno de una herramienta para que el modelo elija la correcta, rellene bien los parámetros y se autocorrija tras un fallo
- Graduar las operaciones de las herramientas con allow / ask / deny, y reconocer los riesgos de la sobreautorización y de la combinación de la trifecta letal
- Construir desde cero un agente de llamada a herramientas con un bucle de ejecución, un registro y una válvula de seguridad

## Requisitos previos

- Sabes escribir prompts básicos y entiendes la forma básica de una conversación con un LLM
- Has usado Claude Code o una herramienta de programación con IA similar y sabes que puede leer y escribir archivos y ejecutar comandos
- Sabes leer código básico de JavaScript / Node.js (la lección 6 te lleva a seguir el código)
- No hace falta formación previa en aprendizaje automático ni en entrenamiento de modelos

## Tiempo estimado

Unas 3-4 horas, incluido el ejercicio práctico de cada lección.
