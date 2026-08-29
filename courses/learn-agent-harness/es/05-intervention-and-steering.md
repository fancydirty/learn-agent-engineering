# Lección 5: Intervención y dirección: interrumpir, redirigir, human-in-the-loop

> Objetivos de aprendizaje:
> - Decir por qué un bucle autónomo necesita a una persona dentro, y dejar claro el vínculo causal: la agencia excesiva es la razón por la que un bucle más autónomo necesita más compuerta manual
> - Distinguir interrumpir, dirigir y aprobar — dónde corta cada uno en el bucle, y qué cambia cada uno
> - Decidir si un punto de aprobación humana para una acción de alto impacto va antes o después de la ejecución, y enunciar la regla de «antes de que se vuelva irreversible»
>
> Requisitos: Termina las Lecciones 3 y 4, sabe que un bucle tiene condiciones de parada y que los bucles muertos y el giro en vacío necesitan salvaguardas, y entiende el arnés como el código de control alrededor del modelo | Anterior: [Lección 4 <<](./04-loop-failure-modes.md) | Siguiente: [Lección 6 >>](./06-build-a-harness.md)

## Las primeras cuatro lecciones administraron el bucle mismo; esta mete a una persona

A estas alturas el bucle que tienes en las manos funciona, se detiene y tiene salvaguardas debajo. La Lección 3 le dio condiciones de parada explícitas. La Lección 4 le enseñó a reconocer bucles muertos y giro en vacío para que no queme el presupuesto hasta el suelo. Todos esos controles comparten algo: son el arnés forcejeando con el bucle por su cuenta, de principio a fin, sin que nadie intervenga.

Los agentes reales rara vez se ejecutan de punta a punta sin vigilancia. A mitad de una tarea podrías querer cancelar todo el asunto — la dirección está completamente equivocada, deja de gastar. Podrías querer cambiar el objetivo sin detener el proceso: «suelta el refactor, ve a encontrar y arreglar ese bug de producción primero». O un paso en particular es lo bastante peligroso como para que quieras verlo y asentir antes de que ocurra. El modelo no puede decidir ninguna de estas cosas por sí solo, y la detención automática y las salvaguardas de las Lecciones 3 y 4 tampoco las alcanzan — estas son cosas que una **persona** mete desde fuera del bucle para hacer. Esta lección es esa capa: cómo interviene una persona a mitad del bucle, y dónde va el código de esa intervención.

## Cuanto más autónomo el bucle, más necesita una compuerta humana

Resolvamos una pregunta primero: después de todo ese trabajo para lograr que el bucle gire solo, ¿por qué volver a meter a una persona?

La respuesta se esconde al otro lado de la palabra «autónomo». Un agente es un sistema donde el modelo decide por sí mismo, dentro de un bucle, qué hacer a continuación y qué herramienta usar. Esa autonomía es exactamente lo que lo hace útil — y exactamente lo que lo hace peligroso. La comunidad de seguridad tiene un nombre para el riesgo: agencia excesiva. OWASP lo pone así: "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated outputs from an LLM, regardless of what is causing the LLM to malfunction."[^S4] (La Agencia Excesiva es la vulnerabilidad que permite ejecutar acciones dañinas en respuesta a salidas inesperadas, ambiguas o manipuladas de un LLM, sin importar qué esté causando que el LLM funcione mal.)

Superpón esa oración sobre el bucle y se vuelve concreta. En un turno cualquiera el modelo podría leer mal lo que devolvió una herramienta, podría tomar por el lado equivocado una oración vaga del usuario, podría ser arrastrado fuera de rumbo por una instrucción maliciosa enterrada en una página web que lee. Los modos de desbocamiento de la Lección 4 rompían el *ritmo* del bucle — no se detenía, giraba en el sitio. Lo que se rompe aquí es la *acción* del bucle: fue e hizo de verdad algo que no debía. Y cuanto más permiso y autonomía carga el bucle, más daño hace un solo mal juicio. Así que junto a las compuertas automáticas propias del arnés — condiciones de parada, salvaguardas — el puñado de puntos donde un error no puede deshacerse necesitan una compuerta más, una **humana**, que le dé a una persona la oportunidad de decir «espera» antes de que la acción aterrice.

Esto no es desconfianza de la automatización. Es una admisión. El modelo puede operar durante un tramo largo de turnos, y como dice la guía de Anthropic, "The LLM will potentially operate for many turns, and you must have some level of trust in its decision-making."[^S1] (El LLM operará potencialmente durante muchos turnos, y debes tener cierto nivel de confianza en su toma de decisiones.) Confiar no es lo mismo que dar rienda suelta todo el camino, sin embargo. La confianza es lo que le permite caminar la mayoría de los pasos por sí mismo; la compuerta humana vigila los pocos cruces donde el giro equivocado no puede deshacerse.

## Tres clases de intervención: interrumpir, dirigir, aprobar

Meter la mano en un bucle no es siempre solo «hacer que se detenga». Ordenadas por lo que el bucle hace después, hay tres movimientos, cada uno cortando en un punto distinto y cambiando algo distinto.

**Interrumpir — cancelar todo el bucle.** El más brusco de los tres: haga lo que haga el modelo este turno, el bucle termina y no sale ninguna petición más. Se parece a las condiciones de parada de la Lección 3; la diferencia es quién jala el gatillo. Una condición de parada es el arnés jalándose de vuelta por su cuenta según una regla predefinida. Una interrupción es una persona fuera del bucle apretando stop a mano. La usas una vez que puedes ver que la dirección está enteramente equivocada y que continuar solo quema tokens. Después de una interrupción el bucle terminó — no hay «y luego».

**Dirigir — cambiar el objetivo o pasarle instrucciones nuevas, y luego dejarlo seguir en marcha.** Este no termina nada. Empuja un mensaje humano fresco dentro de la conversación, cambiando hacia qué se inclina el modelo a continuación, y el bucle carga esa instrucción hacia adelante. Digamos que el agente está moliendo un refactor de algún módulo y detectas un bug de producción más urgente. Sin reiniciar el proceso, puedes meter: «pausa el refactor, primero rastrea y arregla ese 500 en el endpoint de login». Dirigir cambia el *objetivo* del bucle, no si el bucle vive.

**Aprobar — dar luz verde a un solo paso; sin asentimiento, no hay acción.** Los dos primeros actúan sobre todo el bucle. La aprobación actúa sobre una acción específica: el bucle llega a una operación de alto impacto, se detiene, expone «esto es lo que estoy por hacer», y ejecuta solo si una persona dice que sí — saltándola o cancelándola si dice que no. En realidad es apenas una clase muy disciplinada de pausa: "Agents can then pause for human feedback at checkpoints or when encountering blockers."[^S1] (Los agentes pueden entonces pausar para recibir retroalimentación humana en puntos de control o al encontrar bloqueos.) La aprobación es ese punto de control, clavado con precisión justo delante de las acciones peligrosas. Una vez que la aprobación pasa, el bucle vuelve a su ritmo normal. Es también el más rutinario de los tres, y el que mejor se presta a dejarlo encendido de forma permanente.

Una línea para no confundirlos: una interrupción decide si el bucle **vive**, dirigir decide hacia dónde **apunta** el bucle, la aprobación decide si **una acción** pasa. El arnés mínimo de la Lección 6 es donde la aprobación de verdad se escribe en código.

## Escribir la válvula de aprobación en el bucle: detente antes de que la acción aterrice

De los tres, la aprobación es el que más necesita vivir en el código del arnés. Interrumpir y dirigir suelen poder dispararse con una persona tecleando algo en una terminal; la aprobación tiene que ser el arnés deteniéndose activamente en el punto correcto y esperando. Déjala fuera y el bucle simplemente hace la cosa peligrosa.

Una de las mitigaciones de OWASP para la agencia excesiva dice: "Utilise human-in-the-loop control to require a human to approve high-impact actions before they are taken."[^S4] (Utiliza control human-in-the-loop para exigir que una persona apruebe las acciones de alto impacto antes de que se ejecuten.) Fíjate en el orden en esa oración — aprobar **antes** de que se ejecuten. Aprobar primero, ejecutar segundo; no ejecutar primero y recoger una firma después. Dónde va físicamente la válvula, el estándar lo deja bien abierto: "This may be implemented in a downstream system (outside the scope of the LLM application) or within the LLM extension itself."[^S4] (Esto puede implementarse en un sistema aguas abajo, fuera del alcance de la aplicación del LLM, o dentro de la extensión del LLM misma.) Aterrizada sobre nuestro bucle, la casa natural es el despacho de herramientas — una pausa insertada justo antes de que cualquier herramienta marcada como de alto impacto de verdad se llame.

En código, es una bifurcación puesta delante de la línea que ejecuta la herramienta:

```javascript
// Dentro del cuerpo del bucle, después de tener los bloques tool_use de este turno y antes de ejecutar nada
for (const block of toolUseBlocks) {
  if (isHighImpact(block.name)) {
    // Expón lo que pretende hacer: nombre de herramienta + argumentos
    const decision = await askHuman(block.name, block.input);
    if (decision !== "approve") {
      // Sin asentimiento: no ejecutar. Devuelve «denegado» como tool_result para que el modelo repiense
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: "Una persona denegó esta operación. No la reintentes; busca otra manera.",
        is_error: true,
      });
      continue; // La línea clave: salta la ejecución real de abajo
    }
  }
  // Bajo impacto, o ya aprobado: ejecútalo como de costumbre
  const output = await executeTool(block.name, block.input);
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });
}
```

Tres puntos merecen una mirada. Primero, la verificación se sienta **antes** de `executeTool` — la pausa tiene que ocurrir antes de que la acción aterrice, para que mientras esperas a una persona, la operación peligrosa todavía no se haya ejecutado. Segundo, una denegación no es un salto silencioso; devuelve un `tool_result` con `is_error` puesto (¿recuerdas ese campo de la Lección 2?), para que el modelo aprenda que ese camino está bloqueado y salga a buscar otro enfoque en lugar de proponer la acción idéntica de nuevo el siguiente turno. Tercero, `isHighImpact` solo detiene las operaciones de alto impacto — leer un archivo, revisar un log y otros movimientos inofensivos pasan intactos. De lo contrario cada paso necesitaría un asentimiento humano y el agente degeneraría en una herramienta manual carísima.

```agentmentor-check
{
  "id": "harness-zh-05-approve-before-not-after",
  "label": "Decidir de qué lado de una operación destructiva va el punto de aprobación humana",
  "prompt": "Tu agente de operaciones tiene una herramienta drop_table que elimina tablas de la base de datos de producción. Un colega sugiere: deja que el bucle ejecute automáticamente como de costumbre, y solo registra qué tabla se eliminó en un log de auditoría después de cada corrida, más dispara una notificación para que una persona pueda revisarlo. Así obtienes un registro y no frenas el bucle. ¿Este diseño de «registrarlo y notificar después» hace el trabajo que se supone debe hacer la aprobación human-in-the-loop?",
  "whyHere": "La sección acaba de establecer que la válvula de aprobación debe detenerse antes de que la acción aterrice (aprobar antes de que se ejecute), y «registrar y notificar después del hecho también cuenta como meter a una persona en el bucle» es el parecido más cercano y el autoengaño más fácil en el que caer — hay que atraparlo justo aquí, porque confunde trazabilidad con intercepción.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sí. Con un log de auditoría y una notificación, una persona siempre puede ver lo que hizo el agente — la persona está en el bucle, así que la aprobación cumplió su trabajo.",
      "correct": false,
      "feedback": "Eso confunde la trazabilidad posterior al hecho con la intercepción previa al hecho. La aprobación existe para impedir que una acción destructiva ocurra siquiera, y para cuando sale esta notificación, drop_table ya se ejecutó en producción — la tabla se fue, y revisarlo solo confirma la pérdida. Los logs y las notificaciones valen la pena, pero resuelven «podemos averiguar qué pasó», no «podemos impedir que pase»."
    },
    {
      "id": "b",
      "text": "No. La aprobación tiene que sentarse antes de que se ejecute drop_table, con el asentimiento primero; un registro posterior al hecho da trazabilidad, no intercepción.",
      "correct": true,
      "feedback": "Correcto. El orden es lo que hace funcionar a la aprobación human-in-the-loop: aprobar primero, ejecutar segundo, con la pausa aterrizando en el momento en que la acción todavía puede cancelarse. Una operación irreversible como drop_table no puede deshacerse una vez que se completa, así que una compuerta puesta después de la ejecución es una compuerta solo de nombre. La versión que funciona se detiene antes de llamar a drop_table, le muestra a la persona qué tabla está por irse, continúa solo con una aprobación explícita, y ante una denegación salta la ejecución y le devuelve el rechazo al modelo para que encuentre otra ruta."
    },
    {
      "id": "c",
      "text": "Sí, siempre que la notificación sea lo bastante rápida — una persona puede restaurar manualmente la tabla justo después de la eliminación, así que el efecto sale igual.",
      "correct": false,
      "feedback": "Eso se apoya en la suerte y en un botón de deshacer que quizá no exista. Que drop_table sea reversible depende de si existe un respaldo utilizable y de si puede restaurarse a tiempo, y muchísimas operaciones irreversibles no tienen ningún camino de «eliminar y luego restaurar». El punto entero de la aprobación es no apostar a eso — retén la acción irreversible antes de que se ejecute y no tienes que esperar que haya un arreglo disponible después."
    }
  ]
}
```

## Dónde va la compuerta: antes de que la acción se vuelva irreversible, no después

Esa válvula de aprobación funciona enteramente porque se para en el lugar correcto. Esta sección saca esa regla de ubicación por su cuenta, porque es lo de esta lección que más fácil se recuerda al revés — y lo más costoso de tener al revés.

La regla en una oración: **la pausa de aprobación va antes de que la acción se vuelva irreversible, no después.** Ya conociste esta idea en el curso anterior «Llamado de herramientas del agente: lograr que los agentes de verdad hagan cosas» — cuanto mayor el radio de impacto de una acción y menos pueda deshacerse, más temprano tiene que sentarse su punto de confirmación. Así aterriza sobre el bucle: la verificación va en la línea de arriba de `executeTool`, para que durante la espera por una persona la acción destructiva todavía no haya ocurrido. Muévela abajo, y para cuando reaccionas la tabla está eliminada, el correo salió para todos, la config de producción ya cambió — y por más preciso que sea el registro, todo lo que ha hecho es tomarle una foto a los escombros.

¿Cómo detectas lo «irreversible»? Date una prueba contrafactual: si esta acción se ejecuta y está mal, ¿puedo deshacerla en un solo paso? Las cosas que se revierten barato — escribir un archivo temporal, guardar un borrador interno — no necesitan compuerta, o una muy floja. Las cosas que no puedes deshacer, o que solo puedes deshacer a un costo enorme — eliminar una base de datos, mover dinero, publicar hacia afuera, cambiar la config de producción — necesitan la compuerta temprano, y necesitan que sea «aprobado primero, luego hecho». Eso también empalma limpiamente con la Lección 4: aquella lección se trataba de evitar que el bucle queme recursos, esta se trata de evitar que el bucle haga algo que no puede retirarse. La primera es un ritmo saliéndose de control, la segunda es una acción saliéndose de control, y ambas necesitan su compuerta puesta antes de que llegue el «demasiado tarde».

Un detalle que la gente rutinariamente pasa por alto: la compuerta va en el paso más cercano a donde la acción de verdad aterriza. Supón que eliminar la tabla pasa por varias manos — el modelo propone, el arnés despacha, `drop_table` se llama. No basta con poner la aprobación en el paso «el modelo propone», porque la propuesta misma no hace daño ninguno. Como dijo la Lección 1, "The model never executes anything on its own."[^S2] (El modelo nunca ejecuta nada por sí mismo.) El daño vive en esa llamada final a `executeTool`. Empuja la compuerta tan hacia el extremo de la ejecución como puedas, y el modelo puede cambiar de opinión y rehacer sus argumentos tantas veces como quiera — todo eso sigue de este lado de la compuerta, donde nadie sale lastimado.

## Cómo la Lección 6 pliega las tres en un solo bucle

Alinea esta lección contra las anteriores y el conjunto de controles del arnés queda completo: las **condiciones de parada** de la Lección 3 (jalarse de vuelta automáticamente cuando es hora), las **salvaguardas de desbocamiento** de la Lección 4 (detectar bucles muertos y giro en vacío, no quemar el presupuesto), y la **aprobación human-in-the-loop** de esta lección (una compuerta manual antes de que aterricen acciones peligrosas). No son un elige-una-de-tres. Son tres capas apiladas sobre el mismo bucle — las condiciones de parada gobiernan cuánto dura, las salvaguardas gobiernan qué pasa cuando se sale de rumbo, la aprobación gobierna si este movimiento en particular llega a ocurrir siquiera.

La Lección 6 suelda las tres en un solo arnés mínimo ejecutable: un bucle while con un tope de turnos, detección de giro en vacío, y una válvula de aprobación sobre operaciones de alto impacto. Verás ahí cómo la bifurcación `isHighImpact` de esta lección, el contador de la Lección 3, y la verificación de progreso de la Lección 4 toman cada uno su propia posición dentro de un solo cuerpo de bucle sin pelearse. Para esta lección, con sostener dos cosas basta: qué cambia cada una de las tres intervenciones, y que la compuerta de aprobación tiene que pararse antes del punto de no retorno.

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Etiqueta tres movimientos de intervención

Un agente de despliegue está ejecutando automáticamente una tubería «build → test → release a producción». Abajo hay tres cosas que hace la persona de guardia en momentos distintos. Para cada una, decide si es una **interrupción**, una **dirección** o una **aprobación**, y di por qué (¿terminó el bucle, cambió el objetivo del bucle, o dio luz verde a una acción?).

1. El agente se detiene justo antes del paso «release a producción». Un aviso aparece en pantalla: «Por publicar v2.3.1 a producción. ¿Confirmar?». La persona echa un vistazo al número de versión, hace clic en «Confirmar», y el agente procede con la publicación.
2. El agente sigue reintentando un test que falla cada vez. La persona decide que este camino no lleva a ningún lado, aprieta stop, y toda la tubería termina y el proceso sale.
3. El agente todavía ejecuta tests cuando la persona mete un mensaje: «No publiques 2.3.1 — el cliente quiere 2.3.0, cambia a esa versión y continúa». El agente sigue con el nuevo número de versión.

<!-- rubric -->
- Los tres etiquetados correctamente como aprobación, interrupción y dirección
- Cada juicio aterriza sobre la línea divisoria: ¿cambia una acción, la supervivencia del bucle, o la dirección del bucle?
- Identifica que la clave del punto 1 es «la pausa ocurre antes de que la acción de alto impacto de publicación se ejecute, y espera un asentimiento humano antes de continuar»

<!-- answer -->
1. **Aprobación.** El bucle no terminó y el objetivo no cambió; la persona solo dio luz verde a una acción de alto impacto, «release a producción». El orden es lo que importa: la pausa ocurre antes de que la publicación de verdad se ejecute, y continúa solo una vez que vuelve «Confirmar» — eso es exactamente cómo se ve el «aprobar primero, ejecutar segundo» de la aprobación human-in-the-loop.
2. **Interrupción.** Sobre lo que actuó la persona es sobre si el bucle vive: toda la tubería se cancela y el proceso sale, sin «y luego». Se parece a una condición de parada, pero el disparador es una persona fuera del bucle apretando stop a mano, no el arnés jalándose de vuelta automáticamente por una regla predefinida.
3. **Dirección.** El bucle nunca se detuvo. La persona empujó una instrucción nueva dentro de la conversación, cambiando hacia qué se inclina el bucle a continuación (un número de versión distinto), y el agente cargó el nuevo objetivo hacia adelante. Eso es dirección, no supervivencia, y no la luz verde a un solo paso.

<!-- hint -->
Hazte una pregunta primero: después de que esto pasó, ¿el bucle sigue girando? Si está completamente detenido, eso es una interrupción. Si sigue en marcha, mira si lo que cambió fue «el objetivo general del bucle» o «si una acción específica debería ocurrir».

<!-- hint -->
Los puntos 1 y 2 se agrupan ambos alrededor de la publicación y el testeo, lo que los hace fáciles de confundir. La diferencia es el desenlace: uno deja al bucle continuar tras dar luz verde a un paso (aprobación), el otro termina el bucle de plano (interrupción).

### Nivel 2: Pon la válvula de aprobación en el lugar correcto

El cuerpo de bucle de abajo intenta agregar aprobación humana a un agente que puede enviar correo externo, pero la forma en que está escrito tiene un problema: el correo ya se envió para cuando le preguntan a la persona. Señala qué está mal con la ubicación, a qué lleva, y mueve la válvula de aprobación a la posición correcta.

```javascript
for (const block of toolUseBlocks) {
  const output = await executeTool(block.name, block.input);
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });

  if (block.name === "send_external_email") {
    const decision = await askHuman(block.name, block.input);
    if (decision !== "approve") {
      console.log("Una persona no aprobó este correo"); // pero el correo ya salió
    }
  }
}
```

<!-- rubric -->
- Ubica el problema raíz: `askHuman` aparece después de `executeTool`, así que el correo sale antes de preguntarle a la persona, convirtiendo la aprobación en un registro posterior al hecho que no detiene nada
- Explica la consecuencia: `send_external_email` es una acción externa irreversible, así que incluso un «no» posterior no puede retirarlo y la compuerta es una compuerta solo de nombre
- El arreglo mueve todo el bloque «¿es de alto impacto? + espera aprobación» delante de `executeTool`, salta la ejecución cuando no se aprueba, y devuelve la denegación al modelo (por ejemplo como un tool_result con `is_error`)

<!-- answer -->
El problema raíz: **la válvula de aprobación se para después de `executeTool`.** El código ejecuta la herramienta sin condiciones — momento en el que el correo ya salió — y solo entonces le pregunta a una persona. Así que todo lo que hace `askHuman` es registrar la opinión de alguien después del hecho. `send_external_email` es una acción externa irreversible; una vez que el correo se fue no puede retirarse, y un «no» solo confirma un incidente que ya ocurrió. Una compuerta puesta después de que la acción aterriza es lo mismo que no tener compuerta.

Corrigiéndolo: mueve todo el bloque «verificar alto impacto + esperar aprobación» delante de la ejecución, salta la ejecución cuando no se aprueba, y devuelve la denegación al modelo para que tome otra ruta.

```javascript
for (const block of toolUseBlocks) {
  if (block.name === "send_external_email") {
    const decision = await askHuman(block.name, block.input); // pregunta antes de enviar
    if (decision !== "approve") {
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: "Una persona denegó este correo; no se envió. No lo reintentes; manéjalo de otra manera.",
        is_error: true,
      });
      continue; // La línea clave: salta la ejecución real de abajo, para que el correo nunca salga
    }
  }
  const output = await executeTool(block.name, block.input); // solo las llamadas de bajo impacto o aprobadas llegan aquí
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });
}
```

Ahora la pausa ocurre antes de que el correo de verdad salga: envía ante un asentimiento, y ante un rechazo no envía nada en absoluto, mientras el modelo aprende que este camino está bloqueado.

<!-- hint -->
Vigila el orden de dos líneas: `executeTool` (de verdad envía el correo) y `askHuman` (le pregunta a una persona). ¿Cuál se ejecuta primero ahora mismo? La aprobación human-in-the-loop exige «aprobar primero, ejecutar segundo» — verifica si el orden está invertido.

<!-- hint -->
Voltear el orden no basta del todo por sí solo — cuando la aprobación no pasa, la herramienta de verdad no debe **ejecutarse** (usa `continue` para saltarla), y lo mejor es devolver la denegación al modelo como un `tool_result` con `is_error`, o bien puede proponer el mismo correo de nuevo el siguiente turno.

<!-- /exercises -->

## Resumen

- Cuanto más autónomo el bucle, más necesita una compuerta humana en los puntos críticos: la agencia excesiva significa que la salida inesperada, ambigua o manipulada del modelo puede disparar acciones dañinas que no pueden retirarse[^S4]; confiar en un modelo que puede operar durante muchos turnos[^S1] no es lo mismo que darle rienda suelta, y la compuerta humana vigila los pocos cruces donde un giro equivocado no puede deshacerse
- Las tres intervenciones gobiernan cada una una capa distinta: **interrumpir** actúa sobre si el bucle vive (una persona cancela todo el bucle desde afuera), **dirigir** actúa sobre hacia dónde apunta (empuja una instrucción nueva, cambia el objetivo, sigue en marcha), **aprobar** actúa sobre si una acción pasa (pausa antes de una operación peligrosa y espera un asentimiento); la última de esas es exactamente la idea de «pausar para retroalimentación humana en puntos de control»[^S1] clavada delante de las acciones de alto impacto
- La regla dura de la aprobación human-in-the-loop es aprobar primero, ejecutar segundo: las acciones de alto impacto requieren que una persona las apruebe antes de que se ejecuten[^S4], y la válvula puede vivir en un sistema aguas abajo o dentro de la extensión del agente misma[^S4]
- La compuerta va antes de que la acción se vuelva irreversible, no después: sentada arriba de `executeTool`, la acción destructiva todavía no ha ocurrido mientras esperas a una persona; movida debajo de la ejecución, hasta el log más preciso es rastreo posterior al hecho y no detiene nada de lo que ya aterrizó. Usa la prueba contrafactual para detectar lo «irreversible» — si sale mal, ¿puedo deshacerlo en un solo paso?
- La aprobación de esta lección, las condiciones de parada de la Lección 3, y las salvaguardas de desbocamiento de la Lección 4 son tres capas apiladas sobre el mismo bucle, y la Lección 6 las suelda juntas en un arnés mínimo ejecutable

[Lección 6 >>](./06-build-a-harness.md)
