---
domain: Desarrollo de software
tags: [orquestación, patrones de flujo de trabajo, paralelización, orquestador-trabajadores, sistemas multiagente]
lang: es
outcome: Sube tu arnés de un solo bucle a un script de orquestación con enrutamiento, fan-out y un bucle de revisión.
tier: 3
order: 12
---

# De los bucles a los grafos: ingeniería de orquestación para sistemas de agentes

Este es el cierre de la serie, y va de **la capa de ingeniería que está por encima de un solo bucle**. El arnés que escribiste a mano en el curso 7 es un bucle: en la formulación oficial, los agentes "are typically just LLMs using tools based on environmental feedback in a loop." Pero pasado cierto tamaño de tarea, un solo bucle deja de bastar: lo que hay que procesar se sale de una ventana de contexto, el mismo paso tiene que repetirse sobre decenas de elementos, o el trabajo necesita más agentes de los que puede coordinar una sola conversación. Este curso te enseña a recuperar el control de flujo de manos del modelo y devolverlo al código: primero trazas la línea arquitectónica entre un flujo de trabajo (LLM y herramientas orquestados a través de caminos de código predefinidos) y un agente (el modelo dirigiendo su propio proceso), con «quién tiene el plan» como eje; después escribes en código, uno a uno, los patrones de flujo de trabajo probados en producción: encadenamiento y enrutamiento, paralelización (seccionamiento y votación), orquestador-trabajadores y el bucle evaluator-optimizer; miras de frente y con honestidad el libro de cuentas de un sistema real en producción: la mejora del 90,2 % (su evaluación interna de investigación, con un agente líder Opus 4 y subagentes Sonnet 4, más fuerte en consultas de amplitud primero) y el costo de 15× en tokens son las dos caras de una misma moneda, y el cuello de botella de la ejecución síncrona, la explosión de la complejidad de coordinación y los cuatro elementos de un prompt de delegación son todos baches que ellos pisaron; y por último compones los patrones —a esa composición este curso la llama «grafo», que es un dibujo nuestro y no vocabulario oficial— y, manos a la obra, subes tu arnés de un solo bucle del curso 7 a un script de orquestación determinista: enrutamiento, fan-out, fusión y bucle de revisión. El bucle sigue siendo el mismo bucle; lo único que se movió es que el plan pasó al código. Es para quien haya terminado los once primeros cursos de esta serie. Este curso no enseña ningún framework de orquestación de terceros (LangGraph y compañía ni se mencionan), no vuelve a enseñar el reparto del trabajo y la comunicación entre varios agentes (curso 6) ni los conceptos y los diagramas de flujos de trabajo (curso 2): de lo que se hace cargo este curso es de **cómo el control de flujo se convierte en un trozo de código que puedes leer, ejecutar y volver a ejecutar**.

## Contenido del curso

1. [Cuando un solo bucle no basta](01-when-one-loop-isnt-enough.md)
2. [Encadenar y enrutar: encadenamiento y enrutamiento](02-chaining-and-routing.md)
3. [Paralelización: seccionamiento y votación](03-parallelization.md)
4. [Orquestador-trabajadores: volver dinámica la descomposición misma](04-orchestrator-workers.md)
5. [El bucle de revisión, y componer patrones en un grafo](05-evaluator-and-graphs.md)
6. [Manos a la obra: convertir tu arnés en un grafo pequeño](06-build-a-graph.md)

## Objetivos de aprendizaje

Al terminar este curso podrás:

- Enunciar la distinción arquitectónica entre flujo de trabajo y agente (caminos de código predefinidos frente al modelo dirigiendo su propio proceso), situar un sistema en el espectro de determinismo preguntando quién tiene el plan, y reconocer tanto los disparadores reales del «un solo bucle no basta» como los casos que no merecen orquestación
- Escribir como código el encadenamiento y el enrutamiento: cada etapa un bucle de arnés completo, compuertas programáticas entre etapas, y una clasificación que despacha hacia prompts especializados; y saber qué te compra eso y qué te cuesta
- Implementar las dos variantes de la paralelización (seccionamiento y votación), agregar los resultados en código, explicar las ganancias del fan-out (velocidad, perspectivas independientes, capacidad de contexto en paralelo) y sus costos (los resultados aterrizan de vuelta en el orquestador; todos los productos reales ponen tope a la concurrencia), y controlar el costo de la fusión pasando referencias en vez de cargas útiles
- Implementar orquestador-trabajadores y enunciar su diferencia clave con la paralelización (las subtareas no están predefinidas: las decide el orquestador a partir de la entrada); equipar los prompts de delegación con los cuatro elementos (objetivo, formato de salida, guía de herramientas y límites de la tarea), presupuestar según la complejidad de la tarea, y mirar de frente el cuello de botella síncrono y los tres costos de pasarse a asíncrono
- Implementar el bucle evaluator-optimizer (comprobar, arreglar, volver a comprobar, hasta que pase o deje de mejorar) con las dos señales que te dicen si vale la pena construirlo; y componer los cinco patrones en lo que este curso llama un «grafo», sabiendo que es una metáfora de ingeniería propia de este curso, anclada en la afirmación de primera mano de que el propio script del flujo de trabajo sostiene los bucles, las bifurcaciones y los resultados intermedios
- Manos a la obra, subir tu arnés de un solo bucle del curso 7 a un script de orquestación determinista —enrutar → repartir en fan-out a tres trabajadores → fusionar → bucle de revisión → informe— con el estado en variables del script y un rastro de auditoría paso a paso, y contrastarlo línea a línea con lo que prometieron las lecciones 3, 4 y 5 y los cursos 7, 9, 10 y 11

## Requisitos previos

- Has terminado los once primeros cursos de esta serie, o tienes el equivalente
- Sabes escribir a mano un bucle de arnés guiado por `stop_reason` («Fundamentos del arnés de agente: bucles y control»; cada nodo del «grafo» de este curso es uno de ellos)
- Conoces los principios de reparto del trabajo entre varios agentes y los prompts de delegación («Colaboración multiagente»), la verificación basada en evaluaciones («Verificación y control de calidad») y la observabilidad («Observabilidad y depuración»)
- Puedes leer y escribir código básico de JavaScript / Node.js (en la lección 6 escribes a la vez)

## Tiempo estimado

Unas 3-4 horas, incluido el ejercicio práctico de cada lección.
