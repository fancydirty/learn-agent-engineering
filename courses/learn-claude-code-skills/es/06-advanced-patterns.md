# Lección 6: Patrones avanzados: hacer que las Skills sean más potentes

> Objetivos de aprendizaje:
> - Entender la diferencia entre skills personales y skills de proyecto
> - Gestionar las skills de proyecto con Git
> - Aplicar las prácticas de equipo que mantienen sanas las Skills compartidas
> - Conocer qué más existe en el ecosistema de Skills
>
> Requisitos: [<< Lección 5](./05-code-review-skill.md)

## Skills personales contra skills de proyecto

Todas las Skills que construimos hasta ahora fueron a parar a `~/.claude/skills/`. Esas son skills personales — solo tú puedes usarlas. [^S1]

En un equipo, sin embargo, normalmente quieres otra cosa:

- Que todo el mundo revise código contra el mismo criterio
- Que alguien recién llegado clone el repo y tenga de inmediato las Skills del equipo
- Que las mejoras a una Skill lleguen a todos sin que nadie ande copiando archivos

Para eso están las **skills de proyecto**. [^S9]

### En qué se diferencian

| Rasgo | Skills personales | Skills de proyecto |
|-------|-------------------|--------------------|
| Ubicación | `~/.claude/skills/` | `.claude/skills/` |
| Alcance | Todos tus proyectos | El proyecto actual |
| Control de versiones | No hace falta | Commiteado en Git |
| Compartido con el equipo | No se comparte | Compartido con todos |
| Uso típico | Hábitos personales, herramientas de propósito general | Convenciones del proyecto, proceso del equipo |

### Cuál elegir

**Skills personales:** [^S9]

- Conversión de formatos de documento (Markdown → Word)
- La forma en que a ti te gusta que se organicen las tareas
- Tus propias preferencias de estilo de código
- Herramientas generales que quieres tener en todos los proyectos

**Skills de proyecto:**

- El criterio de revisión de código del equipo
- El formato de mensajes de commit del proyecto
- Scaffolding para un framework específico
- El proceso de despliegue del proyecto

## Crear una Skill de proyecto

### Paso 1: Créala en el directorio del proyecto

Ve a tu proyecto:

````bash
cd ~/projects/my-app

# Crea el directorio de skills del proyecto
mkdir -p .claude/skills/commit-format

# Crea SKILL.md
cat > .claude/skills/commit-format/SKILL.md << 'EOF'
---
name: commit-format
description: Reescribe un mensaje de commit corto al formato que exige el equipo, con type, scope y un cuerpo detallado
---

# Formato de mensajes de commit

Reescribe un mensaje de commit escueto al formato que acordó el equipo.

## Convención del equipo

Formato del mensaje de commit:
```
<type>(<scope>): <subject>

<body>
```

**Types:**
- feat: funcionalidad nueva
- fix: corrección de bug
- docs: cambio de documentación
- style: solo formato (sin cambio de comportamiento)
- refactor: reestructuración
- test: relacionado con pruebas
- chore: cambio de build o de herramientas

**Scopes:**
- api: la capa de API
- ui: la interfaz
- db: la base de datos
- auth: autenticación y autorización
- core: lógica central

## Pasos de procesamiento

1. Lee el texto original del commit y decide el type y el scope
2. Completa el contexto que falta (por qué se hizo el cambio, qué toca)
3. Emítelo en el formato requerido

## Formato de salida

```
<type>(<scope>): <subject>

<body>
- por qué se hizo el cambio
- a qué funcionalidades o módulos afecta
- issue o PR relacionado, si lo hay
```

## Ejemplo

**Entrada:** "arreglé ese bug del login"

**Salida:**
```
fix(auth): corregir la validación de contraseña en la página de login

- Problema: la validación fallaba cuando la contraseña contenía caracteres especiales
- Causa: la expresión regular no escapaba los caracteres especiales
- Impacto: los usuarios con caracteres especiales en su contraseña no podían entrar
- Issue relacionado: #123
```
EOF
````

### Paso 2: Commitéala en Git

```bash
git add .claude/skills/commit-format/
git commit -m "feat(tooling): add commit message formatting Skill"
git push
```

### Paso 3: Tus compañeros la reciben

El resto del equipo:

```bash
git pull
```

La Skill funciona de inmediato. No hay nada más que configurar. [^S1]

## Gestionar Skills con Git

Una vez que las skills de proyecto viven en Git, todo lo que Git sabe hacer les aplica: [^S8]

### Historial de versiones

```bash
# Ver el historial de una Skill
git log -- .claude/skills/commit-format/

# Volver a una versión anterior
git checkout abc123 -- .claude/skills/commit-format/

# Comparar dos versiones
git diff main..feature-branch -- .claude/skills/
```

### Revisar las Skills como si fueran código

**Revisar una Skill importa tanto como revisar código.** [^S10]

Cuando alguien envía una Skill nueva o cambia una existente:

1. Revisa que la `description` sea clara
2. Revisa que las instrucciones sean lo bastante específicas
3. Prueba si realmente se comporta como se pretende
4. Decide si se gana un lugar en el proyecto (¿va a chocar con una Skill existente?)

**Revisar un archivo de Skill en un PR:**

```markdown
## Checklist de revisión

- [ ] la description cubre qué hace y cuándo usarla
- [ ] las instrucciones son específicas y ejecutables
- [ ] se incluyen ejemplos de entrada y salida
- [ ] probado contra al menos 3 casos
- [ ] no duplica ni entra en conflicto con una Skill existente
```

### Ramas

**Mantén las Skills experimentales en una rama de feature:**

```bash
# Crea la rama del experimento
git checkout -b experiment/ai-refactor-skill

# Agrega la Skill experimental
mkdir -p .claude/skills/ai-refactor
# ... escribe SKILL.md

# Commitea
git add .claude/skills/ai-refactor/
git commit -m "experiment: add AI-assisted refactoring Skill"

# Úsala una semana; mézclala a main si se la gana
git checkout main
git merge experiment/ai-refactor-skill
```

## Prácticas de equipo que aguantan

### 1. Documéntalas en el README

Documentar las Skills es simple: lístalas en el README raíz del proyecto o en `.claude/README.md`: [^S10]

````markdown
## Skills de Claude disponibles

### commit-format
Reescribe un mensaje de commit escueto al formato del equipo.

**Uso:** `/commit-format [mensaje de commit original]`

**Ejemplo:**
```
/commit-format arreglé el bug del login
```

### code-review
Revisa un cambio de código contra el criterio del equipo.

**Uso:** `/code-review`, y después pega el código o el diff

**Nota:** la salida de la revisión es orientativa — los cambios importantes siguen necesitando revisión humana
````

### 2. Acuerda el nombrado

Fija una sola convención de nombres en todo el equipo: [^S8]

**Recomendado:**

- Guiones: `commit-format`, `api-doc-gen`
- Verbo-sustantivo o sustantivo-verbo: `format-commit`, `review-code`
- Corto y claro: dos o tres palabras

**Evita:**

- Sufijos numéricos: `skill-1`, `helper-v2`
- Cualquier cosa vaga: `tool`, `helper`, `utility`
- Abreviatura del proyecto más un número: `proj-skill-3`

### 3. Haz limpieza periódica

Revisa el conjunto una vez por trimestre: [^S8]

```bash
# Lista todas las skills del proyecto
ls .claude/skills/

# Para cada una, pregúntate:
# - ¿Cuántas veces se usó en los últimos 3 meses?
# - ¿Sigue coincidiendo con cómo trabaja el equipo?
# - ¿Otra Skill la reemplazó?
```

**Una Skill que casi no se usa habría que mejorarla o borrarla.** Una pila de Skills sin uso le complica a Claude encontrar la que realmente aplica.

### 4. Anuncia los cambios

**Este importa:** cuando cambies una Skill existente, publícalo en el canal del equipo.

```
📢 Actualización de Skill: code-review

Cambios:
- Se agregaron revisiones para las reglas de React Hooks
- Se bajó el umbral de largo de función (50 líneas → 40)

Impacto:
- Código que antes pasaba ahora puede quedar marcado
- Vale la pena volver a revisar los PRs recientes

Dudas: @dana
```

## Componer Skills

**Componer Skills significa encadenar varias para resolver una tarea más grande:** [^S1]

```
/commit-format arreglé el bug del login

(Claude devuelve el commit formateado)

/code-review

(pega el código que acabas de cambiar)
```

**O referencia una Skill desde adentro de otra:**

```markdown
## Pasos

1. Usa la Skill commit-format para dar formato al mensaje de commit
2. Usa la Skill code-review para revisar los cambios de código
3. Combina ambos resultados en una descripción de PR
```

Aquí es donde las Skills ganan alcance: Skills chicas, de un solo propósito, se combinan en flujos de trabajo más grandes. La guía de ingeniería de Anthropic lo dice así: "Instead of building fragmented, custom-designed agents for each use case, anyone can now specialize their agents with composable capabilities." (En lugar de construir agentes fragmentados y diseñados a medida para cada caso de uso, ahora cualquiera puede especializar sus agentes con capacidades componibles.) [^S3]

## Más allá de lo básico: hacia dónde seguir

Ya tienes el conjunto central de habilidades. De aquí en adelante, algunas direcciones que vale la pena explorar.

### Campos opcionales del frontmatter

Este curso solo usó `name` y `description`. Hay más: [^S5]

- **`model`**: en qué modelo corre esta Skill (cuando necesitas un razonamiento más fuerte)
- **`allowed-tools`**: restringe la Skill a herramientas específicas
- **`disable-model-invocation`**: impide que Claude la cargue automáticamente, así queda solo manual

De los tres: `model` elige el modelo, `allowed-tools` traza la frontera de permisos y `disable-model-invocation` apaga la activación automática y deja únicamente la invocación manual.

**Cuándo usarlos:**

- Operaciones costosas (llamar a una API externa) → `disable-model-invocation`, para que no se dispare por accidente
- Tareas que necesitan razonamiento cuidadoso → `model: claude-opus-4`
- Skills sensibles a la seguridad → `allowed-tools` para limitar lo que pueden tocar

**La lista completa de campos está en la documentación oficial:** https://code.claude.com/docs/en/skills [^S1]

### Skills más servidores MCP

**Los servidores MCP (Model Context Protocol) aportan herramientas; las Skills aportan conocimiento de flujo de trabajo.** [^S7]

Por ejemplo:

- Un servidor MCP expone una herramienta `read_database`
- Una Skill le enseña a Claude cómo usar esa herramienta para ejecutar el flujo de "generar el reporte mensual"

Juntos, las Skills se vuelven el puente entre Claude y tus sistemas externos. [^S7]

### Skills de la comunidad

Para ver lo que otras personas han construido:

- Busca "claude skills" en GitHub
- https://github.com/travisvn/awesome-claude-skills [^S1]

**Antes de ejecutar la Skill de otra persona:**

- Lee el SKILL.md completo y entiende qué hace
- Pruébala en un proyecto de juguete, no sobre código de producción
- Busca cualquier cosa riesgosa (ejecución de scripts, acceso a red, modificación de archivos)

<!-- exercises -->
## 💻 Ejercicios

### Nivel 1: Crea tu primera Skill de proyecto

Elige un proyecto en el que estés trabajando ahora y agrégale una skill de proyecto:

1. Crea `.claude/skills/[nombre-del-skill]/` en el directorio del proyecto
2. Escribe una Skill que sea específica del proyecto (formato de commits, proceso de despliegue, generación de pruebas, lo que calce)
3. Commitéala en Git
4. Documéntala en el README del proyecto

<!-- rubric -->
- Directorio de la Skill dentro de `.claude/skills/` del proyecto
- SKILL.md completo (frontmatter más instrucciones)
- Commiteado en Git
- README que explica cómo usarla

<!-- answer -->
Un ejemplo (una Skill de revisión previa al despliegue):

**Créala:**
```bash
cd ~/projects/my-web-app
mkdir -p .claude/skills/deploy-check
cat > .claude/skills/deploy-check/SKILL.md << 'EOF'
---
name: deploy-check
description: Checklist previo al despliegue que verifica variables de entorno, versiones de dependencias, cobertura de pruebas y archivos de configuración
---

# Revisión previa al despliegue

## Revisiones

### 1. Variables de entorno
- ¿Están definidas todas las variables de entorno requeridas (DATABASE_URL, API_KEY, etc.)?
- ¿Hay algún valor sensible hardcodeado en el código fuente?

### 2. Dependencias
- ¿Están fijadas las versiones en package.json (sin `^` ni `~`)?
- ¿Hay vulnerabilidades conocidas (corre `npm audit`)?

### 3. Pruebas
- Cobertura de pruebas unitarias por encima del 80%
- ¿Pasan las pruebas de integración de las rutas críticas?

### 4. Configuración
- ¿Es correcta la configuración de producción?
- ¿Está el nivel de log en INFO o ERROR (no en DEBUG)?

## Formato de salida

### ✅ Aprobado
- [revisión]

### ❌ Falló (bloquea el despliegue)
- [revisión] - [problema] - [cómo arreglarlo]

### ⚠️ Advertencia (se recomienda arreglar, no bloquea)
- [revisión] - [problema]
EOF

git add .claude/skills/deploy-check/
git commit -m "feat(tooling): add pre-deploy check Skill"
```

**Documéntala (en el README del proyecto):**
```markdown
## Revisión previa al despliegue

Corre `/deploy-check` para recorrer el checklist completo previo al despliegue.

**Qué cubre:**
- Configuración de variables de entorno
- Seguridad de las dependencias
- Cobertura de pruebas
- Configuración de producción

Despliega a producción solo cuando todas las revisiones pasen.
```

<!-- hint -->
¿No se te ocurre una Skill de proyecto? Empieza por las preguntas que el equipo hace más seguido: "¿cómo despliego esto?", "¿cuál es el formato de los mensajes de commit?", "¿cómo escribo las pruebas?"

<!-- hint -->
Tu primera Skill de proyecto no necesita ser elaborado — una "referencia rápida de las convenciones del equipo" ya es útil

### Nivel 2: Revisa un PR de Skill

Un compañero abrió un PR que agrega una Skill nueva. Escribe la revisión.

**El contenido del PR:**
```markdown
---
name: helper
description: Helps process data
---

# Helper

A tool for processing data.

## Steps

1. Read the data
2. Process it
3. Output the result
```

**Escribe tu revisión y nombra al menos 3 problemas.**

<!-- rubric -->
- Identifica el problema del nombre
- Identifica el problema dla description
- Identifica el problema de las instrucciones
- Da sugerencias concretas para arreglar cada uno
<!-- answer -->
Una revisión de ejemplo:

**Problema 1: el nombre es demasiado vago**

`helper` no dice nada sobre qué hace la Skill. Usa algo descriptivo en su lugar:

- Si sanea la entrada del usuario: `sanitize-user-input`
- Si convierte entre formatos de datos: `transform-data-format`

**Problema 2: la description es inservible**

"Helps process data" es tan amplio que Claude no tiene manera de saber cuándo aplica esta Skill.

Necesita decir:

- Cuáles datos (¿entrada del usuario? ¿archivos CSV? ¿respuestas de API?)
- Qué les hace (¿validar? ¿convertir? ¿limpiar?)
- Cuándo usarla (¿al importar datos? ¿al enviar un formulario?)

**Problema 3: las instrucciones no tienen ningún detalle**

"Read the data", "Process it", "Output the result" — nada de eso es ejecutable. Necesita:

- El formato de entrada
- Los pasos reales de "Process it" (validar qué, convertir qué, filtrar qué)
- El formato de salida
- Al menos un ejemplo de entrada/salida

**Recomendación: no mergear. Pídele a quien lo escribió que aporte lo de arriba y lo vuelva a enviar.**

<!-- hint -->
Un buen PR de Skill incluye un SKILL.md completo, resultados de al menos 2 casos de prueba y una descripción de cuándo aplica la Skill

<!-- /exercises -->

## Resumen

- **Las skills personales (`~/.claude/skills/`) son para tus propios hábitos**; las skills de proyecto (`.claude/skills/`) son para trabajar en equipo [^S9]
- **Las skills de proyecto van a Git**, tus compañeros las reciben automáticamente, y los versionas y ramificas como cualquier otro archivo
- **Prácticas de equipo**: documentarlos, acordar el nombrado, hacer limpieza periódica, anunciar los cambios
- **Las Skills se componen**: Skills chicas de un solo propósito se combinan en flujos de trabajo más grandes [^S3]
- **Hacia dónde seguir**: campos opcionales del frontmatter, integración con servidores MCP, Skills de la comunidad

## Terminaste el curso

Ahora puedes:

- ✅ Explicar cómo funcionan las Skills y dónde aplican
- ✅ Escribir un SKILL.md bien estructurado
- ✅ Ejecutar un proceso sistemático de pruebas y depuración
- ✅ Organizar una Skill más involucrada
- ✅ Aplicar las prácticas de equipo que mantienen sanas las Skills compartidas

**Qué hacer ahora:**

1. **Escribe una Skill hoy**: elige la tarea que explicaste tres veces esta semana y conviértela en una
2. **Úsala una semana**: lleva la cuenta de cuántas veces la invocas, qué se rompe, cuánto tiempo te ahorra
3. **Itera**: agrega las revisiones que se te pasaron, ajusta el formato de salida según lo que realmente ocurrió
4. **Compártelo**: si es genuinamente útil, promuévela a skill de proyecto

**Recuerda:** una buena Skill no se escribe una vez y ya está — se va moldeando con el uso. [^S8][^S10]

Ahora ve a construir los flujos de trabajo que no paras de reexplicar.
