---
domain: Desarrollo de software
tags: [observabilidad, depuración, trazado, logs estructurados, métricas]
lang: es
outcome: Equípale a tu agente logs, métricas y un árbol de traza, para que un fallo se pueda rastrear hasta el mensaje exacto.
tier: 3
order: 11
---

# Observabilidad y depuración: ver cada paso que da tu agente

Este curso va de **ver qué hizo tu agente en realidad**. El curso anterior (el número 10 de esta serie) cerró el «¿pasó o no pasó?»: puntuación del estado final, verificadores, conjuntos de evaluación. Pero una evaluación solo te entrega un aprobado o un fallido. Cuando alguien reporta «no encuentra información que está claramente ahí», sigues sin poder decir por qué: ¿estaba mal formulada la consulta de búsqueda?, ¿se eligieron mal las fuentes?, ¿la herramienta simplemente dio error? Desde fuera, esas causas se ven idénticas. Peor todavía: los agentes son no deterministas entre ejecuciones, el mismo prompt toma dos caminos distintos en dos ejecuciones, y el instinto tradicional de depuración de «reprodúcelo y luego pon un breakpoint» deja de funcionar. Este curso te enseña a convertir el «no sé decirlo» en «lo puedo consultar»: primero se establece que la transcripción cruda (los viajes de ida y vuelta completos de llamadas y respuestas de herramientas) es la evidencia de primera mano, y que el autorreporte del agente no cuenta; después le equipas al arnés logs estructurados y métricas (duración, número de llamadas, tokens, errores; esta vez no para puntuar, sino para vigilar la producción); después hilvanas los registros dispersos en un árbol de traza con ids de correlación, para que todas las peticiones al modelo y ejecuciones de herramientas que disparó un mismo prompt se lean como una unidad; después aprendes a colocar sondas en las puertas del bucle con hooks y a recorrer un flujo de depuración construido para el no determinismo; y por último cableas una capa de observabilidad completa sobre el arnés del curso 7 y rastreas un síntoma del tipo «no sé decirlo» hasta el paso exacto que salió mal. Es para quien haya terminado los diez primeros cursos de esta serie. Este curso no enseña ninguna plataforma de observabilidad concreta (Datadog, Grafana y compañía solo aparecen donde los nombran las citas), no cubre umbrales de alerta ni diseño de SLO (el material de primera mano no da cifras) y no repite los métodos de evaluación del curso 10: allí las métricas puntúan, aquí las mismas métricas diagnostican.

## Contenido del curso

1. [Por qué no puedes decir qué salió mal](01-why-you-cant-see-why.md)
2. [Evidencia de primera mano: la transcripción cruda, no el autorreporte](02-transcripts-as-evidence.md)
3. [Logs estructurados y métricas: convertir cada paso en datos](03-logs-and-metrics.md)
4. [Trazado: hilvanar una ejecución en un árbol](04-tracing.md)
5. [Sondas en las puertas: hooks y un flujo de depuración](05-hooks-and-debugging.md)
6. [Práctica: cablear una capa de observabilidad sobre el arnés](06-build-observability.md)

## Objetivos de aprendizaje

Al terminar este curso podrás:

- Explicar cómo el no determinismo rompe el «reproduce y luego depura»: el mismo prompt toma dos caminos distintos pero igual de legítimos, y un solo síntoma se apoya sobre varias causas que desde fuera se ven idénticas
- Usar las transcripciones crudas como evidencia de primera mano: leer los viajes de ida y vuelta completos de llamadas y respuestas de herramientas, cazar comportamientos que la cadena de pensamiento y el autorreporte del agente nunca mencionan, y explicar por qué no se puede confiar en el autorreporte
- Diseñar logs estructurados y métricas para tu propio arnés: un registro por cada petición al modelo y por cada llamada a herramienta, con duración, número de llamadas, tokens y errores; y traducir los patrones de las métricas a arreglos concretos siguiendo las lecturas diagnósticas oficiales
- Hilvanar los registros dispersos en un árbol de traza con ids de correlación: todo lo que disparó un prompt se lee como una unidad y los subagentes se anidan dentro de la traza padre; y saber cómo te miente el propio pipeline de telemetría (fallos silenciosos, pérdida por lotes)
- Colocar sondas en las puertas del ciclo de vida del bucle: separar los puntos de observación por sesión, por turno y por llamada a herramienta, capturar registros de llamada completos con PostToolUse, y localizar problemas siguiendo el flujo de filtrar por prompt id → encontrar la primera divergencia → repetir paso a paso con las mismas entradas
- Cablear el arnés del curso 7 con una capa de observabilidad completa (logs estructurados en JSONL + impresión del árbol de traza + agregación de métricas) y recorrer una práctica de depuración entera: síntoma → filtrado → localización → arreglo → comparación de la nueva ejecución (las ejecuciones reales se reanudan desde el punto de fallo)

## Requisitos previos

- Has terminado los diez primeros cursos de esta serie, o tienes el equivalente
- Sabes escribir a mano un bucle de arnés guiado por `stop_reason` y entiendes el emparejamiento `tool_use`/`tool_result` («Fundamentos del arnés de agente: bucles y control»)
- Conoces la vía de evaluación y las métricas más allá de la tasa de aprobación («Verificación y control de calidad»; este curso mueve esas mismas métricas de puntuar a diagnosticar)
- Puedes leer y escribir código básico de JavaScript / Node.js (en la lección 6 escribes a la vez)

## Tiempo estimado

Unas 3-4 horas, incluido el ejercicio práctico de cada lección.
