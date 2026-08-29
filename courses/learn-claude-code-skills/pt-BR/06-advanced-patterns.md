# Lição 6: Padrões avançados: tornando as Skills mais poderosas

> Objetivos de aprendizado:
> - Entender a diferença entre skills pessoais e skills de projeto
> - Gerenciar skills de projeto com Git
> - Aplicar as práticas de time que mantêm Skills compartilhadas saudáveis
> - Conhecer o que mais existe no ecossistema de Skills
>
> Pré-requisitos: [<< Lição 5](./05-code-review-skill.md)

## Skills pessoais vs skills de projeto

Toda Skill que construímos até aqui foi para `~/.claude/skills/`. Essas são skills pessoais — só você pode usá-las. [^S1]

Em um time, porém, você geralmente quer outra coisa:

- Todo mundo revisando código com o mesmo padrão
- Uma pessoa recém-contratada clonando o repositório e já tendo as Skills do time
- Melhorias em uma Skill chegando a todos sem ninguém copiar arquivos de um lado para o outro

É para isso que existem as **skills de projeto**. [^S9]

### Como as duas diferem

| Característica | Skills pessoais | Skills de projeto |
|----------------|-----------------|-------------------|
| Localização | `~/.claude/skills/` | `.claude/skills/` |
| Escopo | Todos os seus projetos | O projeto atual |
| Controle de versão | Não é necessário | Commitadas no Git |
| Compartilhamento no time | Não compartilhadas | Compartilhadas com todos |
| Uso típico | Hábitos pessoais, ferramentas de uso geral | Convenções do projeto, processo do time |

### Qual escolher

**Skills pessoais:** [^S9]

- Conversão de formato de documento (Markdown → Word)
- O jeito que você pessoalmente gosta de organizar tarefas
- Suas próprias preferências de estilo de código
- Ferramentas gerais que você quer em todo projeto

**Skills de projeto:**

- O padrão de code review do time
- O formato de mensagem de commit do projeto
- Scaffolding para um framework específico
- O processo de deploy do projeto

## Criando uma Skill de projeto

### Passo 1: crie no diretório do projeto

Vá até seu projeto:

````bash
cd ~/projects/my-app

# Crie o diretório de skills do projeto
mkdir -p .claude/skills/commit-format

# Crie o SKILL.md
cat > .claude/skills/commit-format/SKILL.md << 'EOF'
---
name: commit-format
description: Reescreve uma mensagem de commit curta no formato exigido pelo time, com type, scope e um corpo detalhado
---

# Formatação de mensagem de commit

Reescreva uma mensagem de commit lacônica no formato que o time acordou.

## Convenção do time

Formato da mensagem de commit:
```
<type>(<scope>): <subject>

<body>
```

**Types:**
- feat: funcionalidade nova
- fix: correção de bug
- docs: mudança de documentação
- style: só formatação (sem mudança de comportamento)
- refactor: reestruturação
- test: relacionado a testes
- chore: mudança de build ou tooling

**Scopes:**
- api: a camada de API
- ui: a interface
- db: o banco de dados
- auth: autenticação e autorização
- core: lógica central

## Passos de processamento

1. Leia o texto original do commit e decida o type e o scope
2. Preencha o contexto que está faltando (por que a mudança foi feita, o que ela toca)
3. Emita no formato exigido

## Formato de saída

```
<type>(<scope>): <subject>

<body>
- por que a mudança foi feita
- quais funcionalidades ou módulos ela afeta
- issue ou PR relacionado, se houver
```

## Exemplo

**Entrada:** "consertei aquele bug de login"

**Saída:**
```
fix(auth): corrige a validação de senha na página de login

- Problema: a validação falhava quando a senha continha caracteres especiais
- Causa: a regex não escapava caracteres especiais
- Impacto: pessoas com caracteres especiais na senha não conseguiam entrar
- Issue relacionada: #123
```
EOF
````

### Passo 2: commite no Git

```bash
git add .claude/skills/commit-format/
git commit -m "feat(tooling): add commit message formatting Skill"
git push
```

### Passo 3: o time pega a Skill

Todo mundo mais no time:

```bash
git pull
```

A Skill funciona na hora. Não há mais nada para configurar. [^S1]

## Gerenciando Skills com Git

Uma vez que as skills de projeto vivem no Git, tudo que o Git faz se aplica a elas: [^S8]

### Histórico de versões

```bash
# Ver o histórico de uma Skill
git log -- .claude/skills/commit-format/

# Voltar para uma versão anterior
git checkout abc123 -- .claude/skills/commit-format/

# Comparar duas versões
git diff main..feature-branch -- .claude/skills/
```

### Faça code review das próprias Skills

**Revisar uma Skill importa tanto quanto revisar código.** [^S10]

Quando alguém submete uma Skill nova ou muda uma existente:

1. Cheque se a description está clara
2. Cheque se as instruções são específicas o bastante
3. Teste se ela realmente se comporta como pretendido
4. Decida se ela merece um lugar no projeto (vai colidir com uma Skill existente?)

**Revisando um arquivo de Skill em um PR:**

```markdown
## Checklist de revisão

- [ ] a description cobre o que ela faz e quando usá-la
- [ ] as instruções são específicas e executáveis
- [ ] exemplos de entrada e saída estão incluídos
- [ ] testada contra pelo menos 3 casos
- [ ] não duplica nem conflita com uma Skill existente
```

### Branches

**Mantenha Skills experimentais em uma branch de feature:**

```bash
# Crie a branch de experimento
git checkout -b experiment/ai-refactor-skill

# Adicione a Skill experimental
mkdir -p .claude/skills/ai-refactor
# ... escreva o SKILL.md

# Commite
git add .claude/skills/ai-refactor/
git commit -m "experiment: add AI-assisted refactoring Skill"

# Use por uma semana; faça merge em main se ela merecer
git checkout main
git merge experiment/ai-refactor-skill
```

## Práticas de time que se sustentam

### 1. Documente no README

Documentar Skills é simples: liste-as no README raiz do projeto ou em `.claude/README.md`: [^S10]

````markdown
## Skills do Claude disponíveis

### commit-format
Reescreve uma mensagem de commit lacônica no formato do time.

**Uso:** `/commit-format [mensagem de commit original]`

**Exemplo:**
```
/commit-format consertei o bug de login
```

### code-review
Revisa uma mudança de código contra o padrão do time.

**Uso:** `/code-review`, depois cole o código ou o diff

**Observação:** a saída da revisão é consultiva — mudanças significativas ainda precisam de revisão humana
````

### 2. Combinem a nomenclatura

Fechem uma única convenção de nomes para todo o time: [^S8]

**Recomendado:**

- Hifens: `commit-format`, `api-doc-gen`
- Verbo-substantivo ou substantivo-verbo: `format-commit`, `review-code`
- Curto e claro: duas ou três palavras

**Evite:**

- Sufixos numéricos: `skill-1`, `helper-v2`
- Qualquer coisa vaga: `tool`, `helper`, `utility`
- Abreviação do projeto mais um número: `proj-skill-3`

### 3. Faça a poda com regularidade

Revise o conjunto uma vez por trimestre: [^S8]

```bash
# Liste todas as skills de projeto
ls .claude/skills/

# Para cada uma, pergunte:
# - Quantas vezes foi usada nos últimos 3 meses?
# - Ela ainda combina com o jeito que o time trabalha?
# - Outra Skill já a substituiu?
```

**Uma Skill que quase não é usada deve ser melhorada ou apagada.** Um monte de Skills sem uso torna mais difícil para o Claude encontrar a que de fato se aplica.

### 4. Anuncie as mudanças

**Esta importa:** quando você mudar uma Skill existente, poste no canal do time.

```
📢 Atualização de Skill: code-review

Mudanças:
- Adicionadas checagens das regras de React Hooks
- Reduzido o limiar de tamanho de função (50 linhas → 40)

Impacto:
- Código que passava antes pode agora ser sinalizado
- Vale rerrevisar os PRs recentes

Dúvidas: @dana
```

## Compondo Skills

**Compor Skills significa encadear várias delas para dar conta de uma tarefa maior:** [^S1]

```
/commit-format consertei o bug de login

(o Claude devolve o commit formatado)

/code-review

(cole o código que você acabou de mudar)
```

**Ou referencie uma Skill de dentro de outra:**

```markdown
## Passos

1. Use a Skill commit-format para formatar a mensagem de commit
2. Use a Skill code-review para checar as mudanças de código
3. Combine os dois resultados em uma descrição de PR
```

É aqui que as Skills ganham alcance: Skills pequenas, de propósito único, se combinam em fluxos de trabalho maiores. O guia de engenharia da Anthropic coloca assim: "Instead of building fragmented, custom-designed agents for each use case, anyone can now specialize their agents with composable capabilities." (ou seja: em vez de construir agentes fragmentados e desenhados sob medida para cada caso de uso, qualquer pessoa agora pode especializar seus agentes com capacidades combináveis.) [^S3]

## Além do básico: para onde ir agora

Você agora tem o conjunto central de habilidades. Daqui em diante, algumas direções valem a exploração.

### Campos opcionais do frontmatter

Este curso usou apenas `name` e `description`. Existem mais: [^S5]

- **`model`**: em qual modelo esta Skill roda (quando você precisa de raciocínio mais forte)
- **`allowed-tools`**: restringe a Skill a ferramentas específicas
- **`disable-model-invocation`**: impede o Claude de carregá-la automaticamente, deixando-a só manual

Dos três: `model` escolhe o modelo, `allowed-tools` traça a fronteira de permissões, e `disable-model-invocation` desliga o disparo automático e deixa somente a invocação manual.

**Quando usá-los:**

- Operações caras (chamar uma API externa) → `disable-model-invocation`, para que não dispare por acidente
- Tarefas que exigem raciocínio cuidadoso → `model: claude-opus-4`
- Skills sensíveis do ponto de vista de segurança → `allowed-tools` para limitar o que elas podem tocar

**A lista completa de campos está na documentação oficial:** https://code.claude.com/docs/en/skills [^S1]

### Skills mais servidores MCP

**Servidores MCP (Model Context Protocol) fornecem ferramentas; Skills fornecem conhecimento de fluxo de trabalho.** [^S7]

Por exemplo:

- Um servidor MCP expõe uma ferramenta `read_database`
- Uma Skill ensina o Claude a usar essa ferramenta para executar o fluxo "gerar o relatório mensal"

Juntas, as Skills viram a ponte entre o Claude e seus sistemas externos. [^S7]

### Skills da comunidade

Para ver o que outras pessoas construíram:

- Busque "claude skills" no GitHub
- https://github.com/travisvn/awesome-claude-skills [^S1]

**Antes de rodar a Skill de outra pessoa:**

- Leia o SKILL.md inteiro e entenda o que ela faz
- Experimente em um projeto de rascunho, não em código de produção
- Procure por qualquer coisa arriscada (rodar scripts, acesso à rede, modificar arquivos)

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Crie sua primeira Skill de projeto

Escolha um projeto em que você está trabalhando agora e adicione uma skill de projeto a ele:

1. Crie `.claude/skills/[nome-da-skill]/` no diretório do projeto
2. Escreva uma Skill que seja específica do projeto (formato de commit, processo de deploy, geração de testes, o que encaixar)
3. Commite no Git
4. Documente no README do projeto

<!-- rubric -->
- O diretório da Skill está sob o `.claude/skills/` do projeto
- SKILL.md completo (frontmatter mais instruções)
- Commitada no Git
- README explica como usá-la

<!-- answer -->
Um exemplo (uma Skill de checagem de deploy):

**Crie:**
```bash
cd ~/projects/my-web-app
mkdir -p .claude/skills/deploy-check
cat > .claude/skills/deploy-check/SKILL.md << 'EOF'
---
name: deploy-check
description: Checklist pré-deploy que verifica variáveis de ambiente, versões de dependências, cobertura de testes e arquivos de configuração
---

# Checagem pré-deploy

## Checagens

### 1. Variáveis de ambiente
- Todas as variáveis de ambiente obrigatórias estão definidas (DATABASE_URL, API_KEY e afins)
- Algum valor sensível está hardcoded no código-fonte

### 2. Dependências
- As versões no package.json estão fixadas (sem `^` nem `~`)
- Alguma vulnerabilidade conhecida (rode `npm audit`)

### 3. Testes
- Cobertura de testes unitários acima de 80%
- Os testes de integração dos caminhos críticos passam

### 4. Configuração
- A configuração de produção está correta
- O nível de log está em INFO ou ERROR (não DEBUG)

## Formato de saída

### ✅ Aprovado
- [checagem]

### ❌ Reprovado (bloqueia o deploy)
- [checagem] - [problema] - [como corrigir]

### ⚠️ Aviso (correção recomendada, não bloqueia)
- [checagem] - [problema]
EOF

git add .claude/skills/deploy-check/
git commit -m "feat(tooling): add pre-deploy check Skill"
```

**Documente (no README do projeto):**
```markdown
## Checagem pré-deploy

Rode `/deploy-check` para percorrer o checklist pré-deploy completo.

**O que ela cobre:**
- Configuração de variáveis de ambiente
- Segurança das dependências
- Cobertura de testes
- Configuração de produção

Só faça deploy em produção quando todas as checagens passarem.
```

<!-- hint -->
Travou para escolher uma Skill de projeto? Comece pelas perguntas que o time mais faz: "como eu faço deploy disso?", "qual é o formato da mensagem de commit?", "como eu escrevo os testes?"

<!-- hint -->
Sua primeira Skill de projeto não precisa ser elaborada — uma "referência rápida das convenções do time" já é útil

### Nível 2: Revise um PR de Skill

Alguém do time abriu um PR adicionando uma Skill nova. Escreva a revisão.

**O conteúdo do PR:**
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

**Escreva sua revisão, apontando pelo menos 3 problemas.**

<!-- rubric -->
- Identifica o problema do nome
- Identifica o problema da description
- Identifica o problema das instruções
- Dá sugestões concretas para corrigir cada um
<!-- answer -->
Uma revisão de exemplo:

**Problema 1: o nome é vago demais**

`helper` não diz nada sobre o que a Skill faz. Use algo descritivo no lugar:

- Se ela sanitiza entrada de usuário: `sanitize-user-input`
- Se ela converte entre formatos de dados: `transform-data-format`

**Problema 2: a description é inutilizável**

“Helps process data” é tão amplo que o Claude não tem como saber quando esta Skill se aplica.

Ela precisa dizer:

- Quais dados (entrada de usuário? arquivos CSV? respostas de API?)
- O que ela faz com eles (valida? converte? limpa?)
- Quando usá-la (na importação de dados? no envio de formulário?)

**Problema 3: as instruções não têm detalhe nenhum**

“Read the data”, “Process it”, “Output the result” — nada disso é executável. É preciso ter:

- O formato de entrada
- Os passos reais de “Process it” (validar o quê, converter o quê, filtrar o quê)
- O formato de saída
- Pelo menos um exemplo de entrada/saída

**Recomendação: não faça merge. Peça a quem escreveu que forneça o acima e ressubmeta.**

<!-- hint -->
Um bom PR de Skill inclui um SKILL.md completo, resultados de pelo menos 2 casos de teste e uma descrição de quando a Skill se aplica

<!-- /exercises -->

## Recapitulação

- **Skills pessoais (`~/.claude/skills/`) são para seus próprios hábitos**; skills de projeto (`.claude/skills/`) são para trabalhar em time [^S9]
- **Skills de projeto vão para o Git**, o time as recebe automaticamente, e você as versiona e ramifica como qualquer outro arquivo
- **Práticas de time**: documente, combine a nomenclatura, faça a poda com regularidade, anuncie as mudanças
- **Skills se compõem**: Skills pequenas de propósito único se combinam em fluxos de trabalho maiores [^S3]
- **Para onde ir agora**: campos opcionais do frontmatter, integração com servidores MCP, Skills da comunidade

## Você terminou o curso

Você agora consegue:

- ✅ Explicar como as Skills funcionam e onde elas se aplicam
- ✅ Escrever um SKILL.md bem estruturado
- ✅ Conduzir um processo sistemático de teste e depuração
- ✅ Organizar uma Skill mais elaborada
- ✅ Aplicar as práticas de time que mantêm Skills compartilhadas saudáveis

**O que fazer em seguida:**

1. **Escreva uma Skill hoje**: pegue a tarefa que você explicou três vezes esta semana e transforme-a em uma
2. **Use por uma semana**: acompanhe com que frequência você a invoca, o que quebra, quanto tempo ela economiza
3. **Itere**: adicione as checagens que faltaram, ajuste o formato de saída com base no que realmente aconteceu
4. **Compartilhe**: se ela for genuinamente útil, promova-a a skill de projeto

**Lembre-se:** uma boa Skill não é escrita uma vez e pronto — ela é moldada pelo uso. [^S8][^S10]

Agora vá construir os fluxos de trabalho que você vive reexplicando.
