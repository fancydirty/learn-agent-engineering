# Lição 5: Estudo de caso: construindo uma Skill de code review

> Objetivos de aprendizado:
> - Aprender a organizar um fluxo de trabalho com múltiplos passos
> - Entender como o padrão de checklist se aplica
> - Ganhar confiança no uso de arquivos de apoio
> - Construir uma Skill complexa pronta para uso real
>
> Pré-requisitos: [<< Lição 4](./04-testing-debugging.md) | Próxima: [Lição 6 >>](./06-advanced-patterns.md)

## Por que code review é um bom estudo de caso

Code review é um fluxo de trabalho estruturado de manual:[^S3]

- **Os passos são fixos**: checar convenções, procurar problemas, propor mudanças
- **Os critérios são mensuráveis**: cada item de checagem passa ou não passa
- **Repete o tempo todo**: todo PR precisa de um
- **Combina com uma Skill**: escreva os critérios de revisão do seu time em uma Skill e toda revisão mantém o mesmo padrão

Este estudo de caso mostra:
- Como quebrar um fluxo de trabalho complexo em passos claros
- Como organizar instruções em torno de um checklist
- Como lidar com várias dimensões de saída ao mesmo tempo

## Passo 1: defina o escopo da revisão

Antes de escrever qualquer coisa, decida o que essa Skill fica responsável por checar.

**Nossa Skill de code review cobre três dimensões:**

1. **Convenções**: nomenclatura, formatação, comentários
2. **Problemas potenciais**: tratamento de erros, casos-limite, risco de segurança
3. **Manutenibilidade**: código duplicado, tamanho das funções, complexidade lógica

**O que ela deliberadamente não checa:**
- Se a lógica de negócio está de fato correta (isso exige conhecimento real dos requisitos)
- Eficiência algorítmica (isso exige teste de performance)
- Design de UI/UX (fora do escopo de code review)

## Passo 2: crie a estrutura de diretórios

Desta vez vamos usar arquivos de apoio para organizar as regras de revisão:[^S2]

```bash
mkdir -p ~/.claude/skills/code-review
mkdir -p ~/.claude/skills/code-review/checklists

touch ~/.claude/skills/code-review/SKILL.md
touch ~/.claude/skills/code-review/checklists/naming.md
touch ~/.claude/skills/code-review/checklists/error-handling.md
```

**Por que separar os arquivos:**
- O SKILL.md fica curto e guarda só o fluxo principal
- As regras detalhadas de checagem ficam em arquivos separados, carregadas sob demanda[^S2]
- Seu time pode manter cada checklist de forma independente, sem tocar no arquivo principal

## Passo 3: escreva o SKILL.md principal

```markdown
---
name: code-review
description: Revisa mudanças de código quanto a convenções de nomenclatura, tratamento de erros, bugs potenciais e problemas de manutenibilidade. Use para revisão de PR ou checagens gerais de qualidade de código
---

# Assistente de Code Review

Revise mudanças de código sistematicamente contra as convenções do time e a prática estabelecida.

## Formatos de entrada

Aceite qualquer um dos seguintes:

- Saída de git diff
- Um arquivo-fonte completo
- Um fragmento de código (uma função ou uma classe)
- Um link de PR (leia o conteúdo do PR com uma ferramenta antes)

## Fluxo de revisão

Execute a revisão nesta ordem:

### 1. Checagem de convenções

Consulte `checklists/naming.md` e percorra cada item:

- **Nomes de variáveis**: significativos e consistentes com a convenção do time (camelCase, snake_case e afins)
- **Nomes de funções**: começam com verbo, declaram a intenção com clareza
- **Nomes de classes**: substantivos, alinhados à responsabilidade única
- **Nomes de constantes**: tudo em maiúsculas, separado por underscore

**Critério:** todo nome deve dizer, a alguém que não conhece o código, para que ele serve

### 2. Checagem de tratamento de erros

Consulte `checklists/error-handling.md` e cheque:

- **Captura de exceções**: existe try/catch, e ele captura os tipos certos de exceção
- **Valores de retorno de erro**: a função trata e propaga erros corretamente
- **Casos-limite**: entrada vazia, null, undefined e arrays vazios estão tratados
- **Liberação de recursos**: arquivos, conexões e locks são liberados corretamente

**Critério:** tudo que pode falhar precisa de tratamento de erro

### 3. Checagem de problemas potenciais

- **Acesso a null/undefined**: isso pode chegar a uma propriedade ou método que não existe
- **Segurança de tipos**: existe risco de coerção implícita de tipo
- **Concorrência**: existe condição de corrida ou risco de deadlock
- **Brechas de segurança**: SQL injection, XSS, CSRF, segredos vazados

**Critério:** sinalize qualquer código que possa produzir erro em tempo de execução ou risco de segurança

### 4. Checagem de manutenibilidade

- **Tamanho da função**: sugira dividir qualquer coisa acima de 50 linhas
- **Duplicação**: sugira extrair lógica que apareça três ou mais vezes
- **Profundidade de aninhamento**: sugira refatorar acima de três níveis
- **Qualidade dos comentários**: a lógica complexa está explicada

**Critério:** outra pessoa desenvolvedora deve conseguir ler e alterar este código com facilidade

## Formato de saída

Relate a revisão nesta estrutura:

### ✅ Aprovado
- [item de checagem] - atende ao critério

### ⚠️ Vale uma olhada
- **Local**: `file:line`
- **Problema**: o que exatamente está errado
- **Impacto**: a que isso pode levar
- **Sugestão**: como melhorar

### 🔴 Precisa corrigir
- **Local**: `file:line`
- **Problema**: o que exatamente está errado
- **Risco**: por que isso não pode ir assim
- **Sugestão**: a correção concreta

### 📊 Avaliação geral
- Qualidade do código: forte / aceitável / precisa de trabalho
- Principais problemas: [as 2-3 questões mais importantes]
- Prioridade sugerida: [o que corrigir primeiro]

## Observações

- **Contexto faltando**: se o fragmento estiver incompleto, diga que você pode precisar de mais do código ao redor
- **Idiomas de framework**: algo que parece um problema pode ser um padrão específico do framework — marque como "precisa de confirmação"
- **Código de teste**: relaxe os critérios para testes onde fizer sentido (tamanho da função, por exemplo)
- **Nada encontrado**: se todas as checagens passarem, exiba "✅ Revisão aprovada, nenhum problema óbvio encontrado"
```

## Passo 4: escreva os arquivos de apoio

**checklists/naming.md:**

```markdown
# Checklist de convenções de nomenclatura

## Nomes de variáveis

**Bom:**
- `userCount`: claramente uma contagem de usuários
- `isAuthenticated`: booleanos começam com is/has/can
- `maxRetryAttempts`: declara tanto o significado quanto a unidade

**Ruim:**
- `x`, `temp`, `data`: genéricos demais
- `flag`, `status`: não dizem que estado guardam
- `getUserInfo2`: um sufixo numérico geralmente significa que existe uma duplicata

## Nomes de funções

**Bom:**
- `calculateTotalPrice()`: verbo mais substantivo, declara a ação e o objeto dela
- `validateUserInput()`: diz o que faz e sobre o que age
- `fetchUserProfile()`: `fetch` sinaliza que isto é assíncrono

**Ruim:**
- `process()`: genérico demais, processa o quê
- `doStuff()`: não expressa intenção nenhuma
- `handleData()`: tanto `handle` quanto `data` são amplos demais

## Nomes de classes

**Bom:**
- `UserRepository`: um substantivo que declara a responsabilidade (ler e gravar dados de usuário)
- `PaymentProcessor`: claramente a coisa que trata pagamentos
- `EmailValidator`: declara a responsabilidade de validar e-mail

**Ruim:**
- `Manager`, `Helper`, `Utility`: sufixos genéricos demais para significar qualquer coisa
- `DataClass`: não diz quais dados
```

**checklists/error-handling.md:**

````markdown
# Checklist de tratamento de erros

## Cenários que você precisa checar

### 1. Chamadas a dependências externas
- Requisições de API (falha de rede, timeout, respostas 4xx/5xx)
- Consultas a banco de dados (falha de conexão, timeout de consulta, violação de restrição)
- Operações de arquivo (arquivo ausente, permissões insuficientes, disco cheio)

### 2. Entrada do usuário
- Entrada vazia, null, undefined
- Entrada malformada
- Valores fora do intervalo

### 3. Conversão de dados
- Parsing de JSON (entrada malformada)
- Conversão de tipo (falha de string para número)
- Parsing de data (formato de data inválido)

## Padrões de tratamento de erros

**Capturar e tratar:**
```javascript
try {
  const data = await fetchUser(id);
  return processData(data);
} catch (error) {
  logger.error('Failed to fetch user', { id, error });
  return null; // ou lance um erro customizado
}
```

**Checar antes de chamar:**
```javascript
if (!user) {
  throw new Error('User not found');
}
const profile = user.getProfile(); // seguro — user com certeza não é null
```

## Erros comuns

**Problema:** um bloco catch vazio
```javascript
try {
  riskyOperation();
} catch (e) {
  // nada acontece aqui — o erro é engolido
}
```

**Correção:** logue, no mínimo
```javascript
try {
  riskyOperation();
} catch (e) {
  logger.error('Operation failed', e);
  throw e; // ou retorne um status de erro
}
```
````

## Passo 5: teste um caso bagunçado

Prepare um trecho com vários problemas dentro:

```javascript
function process(data) {
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    if (item.type == "A") {
      var x = item.value * 2;
      result.push(x);
    } else if (item.type == "B") {
      var y = item.value / 2;
      result.push(y);
    } else {
      result.push(item.value);
    }
  }
  return result;
}
```

Invoque a Skill:

```
/code-review

[cole o código acima]
```

**A saída deve incluir:**

- ⚠️ Nomenclatura: `process`, `data`, `x` e `y` são todos genéricos demais
- ⚠️ Usa `var` em vez de `const`/`let`
- ⚠️ Usa `==` em vez de `===`
- ⚠️ Nunca checa se `data` é null ou se não é um array
- ⚠️ Nunca checa se `item.value` existe
- Sugestão: a função pode ser dividida em funções puras menores

## Passo 6: itere

**O que a primeira execução costuma revelar:**

- Escapes (problemas reais que ela não pegou) → adicione regras de checagem
- Saída longa demais → aperte o formato de saída para reportar só o que importa
- Falsos positivos (código normal sinalizado como problema) → adicione uma categoria “precisa de confirmação”

**Continue melhorando:**

1. Depois de cada revisão, anote quais problemas escaparam
2. Atualize os checklists
3. Teste de novo
4. Em um mês, a Skill fica genuinamente precisa.[^S8]

```agentmentor-check
{
  "id": "skills-zh-05-checklist-structure",
  "label": "Organização do checklist",
  "prompt": "Você está escrevendo uma Skill de code review e as regras de checagem não param de crescer — o SKILL.md já passou de 300 linhas. Qual é a melhor jogada?",
  "whyHere": "Você acabou de ver as regras de revisão desta Skill serem empurradas para checklists/ em vez de para o SKILL.md. O erro neste ponto é tratar o SKILL.md como o lugar onde tudo se acumula, então vale fixar quando um arquivo deve ser dividido, antes que a sua própria Skill passe desse tamanho.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Continuar escrevendo no SKILL.md para que todas as regras e o fluxo fiquem em um arquivo só",
      "correct": false,
      "feedback": "300 linhas é longo demais. O Claude lê o SKILL.md inteiro quando carrega a Skill, então o tamanho te custa contexto em toda invocação — e você precisa rolar tudo isso sempre que quiser mudar uma regra. Mova as regras detalhadas para checklists/ e o arquivo principal fica mais claro."
    },
    {
      "id": "b",
      "text": "Mover as regras detalhadas de checagem para arquivos de apoio, mantendo o fluxo no arquivo principal",
      "correct": true,
      "feedback": "Correto. Isto é revelação progressiva (progressive disclosure) na prática: o SKILL.md guarda só o fluxo principal (“consulte checklists/naming.md para checar nomenclatura”), e as regras detalhadas ficam nos seus próprios arquivos. O Claude lê esses arquivos quando precisa deles, e um arquivo principal com menos de 100 linhas é bem mais fácil de manter."
    }
  ]
}
```

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Construa sua própria Skill de revisão

Escolha um domínio que você conhece bem — código de frontend, design de API, consultas SQL, documentação — e construa uma Skill de revisão para ele.

**Requisitos:**
1. Pelo menos 3 dimensões de revisão
2. 3-5 itens concretos de checagem por dimensão
3. Um formato de saída claro (aprovado, vale uma olhada, precisa corrigir)
4. Teste em pelo menos 2 casos reais

<!-- rubric -->
- As dimensões são bem definidas e valem a checagem
- Cada item de checagem é concreto o bastante para agir (não “cheque a qualidade do código”)
- O formato de saída torna a severidade óbvia de imediato
- Código real ou documentos reais testados e resultados registrados

<!-- answer -->
Resposta de exemplo (revisão de design de API):

```markdown
---
name: api-design-review
description: Revisa o design de API quanto a convenções RESTful, nomenclatura de parâmetros, tratamento de erros e completude da documentação. Use durante a revisão de design de API
---

# Revisão de Design de API

## Dimensões de revisão

### 1. Convenções RESTful
- URLs usam substantivos, não verbos (✓ `/users` ✗ `/getUsers`)
- Métodos HTTP corretos (GET lê, POST cria, PUT atualiza, DELETE remove)
- Códigos de status fazem sentido (200/201/400/404/500)

### 2. Design de parâmetros
- Nomes de parâmetros são claros, e um único estilo é usado em tudo (snake_case ou camelCase)
- Parâmetros obrigatórios e opcionais são distinguidos
- Regras de validação estão documentadas

### 3. Tratamento de erros
- Existe um formato de resposta de erro consistente
- Mensagens de erro carregam contexto suficiente para agir
- Códigos de erro existem para que os clientes possam ramificar sobre eles

## Formato de saída

### ✅ Atende à convenção
- [item de checagem]

### ⚠️ Melhoria sugerida
- **Problema**: [o que está errado]
- **Sugestão**: [como melhorar]

### 🔴 Violação de convenção
- **Problema**: [o que está errado]
- **Impacto**: [por que isso é sério]
- **Correção**: [o que precisa mudar]
```

<!-- hint -->
Escolha algo que você revisa pelo menos três vezes por semana — senão a Skill não terá uso suficiente para valer o esforço

<!-- hint -->
A primeira versão não precisa cobrir tudo. Escreva os 3 problemas mais comuns, use por uma semana, depois adicione mais

### Nível 2: Compare uma revisão humana com a da Skill

Pegue um trecho de código e revise-o duas vezes:
1. Na mão, você mesmo
2. Com a Skill code-review

Compare o que cada uma encontrou e anote:
- Quais problemas a Skill pegou que você deixou passar
- Quais problemas você pegou que a Skill deixou passar
- Quais dos achados dela foram falsos positivos (sinalizados como problemas, mas na verdade estão bem)

<!-- rubric -->
- O mesmo código passou pelos dois métodos de revisão
- Comparação lado a lado dos achados registrada
- Análise de onde a Skill é forte e de onde ela fica devendo
- Mudanças concretas propostas para a Skill

<!-- answer -->
Comparação de exemplo:

**O código:** uma função de processamento de dados com 50 linhas

**A revisão humana encontrou:**
- Nomes de variáveis pouco claros (2 pontos)
- Tratamento de erro ausente (1 ponto)
- Lógica que poderia ser simplificada (1 ponto)

**A revisão da Skill encontrou:**
- Nomes de variáveis pouco claros (3 pontos — um a mais do que eu encontrei)
- Tratamento de erro ausente (2 pontos — um a mais do que eu encontrei)
- Função com mais de 50 linhas, sugere dividir
- Usa `==` em vez de `===` (2 pontos, ambos que eu deixei passar)

**Falso positivo:**
- A Skill sinalizou “código duplicado”, mas aqueles dois blocos só parecem semelhantes — servem a propósitos diferentes e não deveriam ser unidos

**Mudanças a fazer:**
- Adicionar um limiar de similaridade à checagem de duplicação para que ela pare de sinalizar toda semelhança
- Adicionar à Skill a regra de “simplificação de lógica” que apliquei na mão

<!-- hint -->
Skills são boas nos problemas mecânicos e mensuráveis — nomenclatura, formatação, tratamento de erro obviamente ausente. Julgar se a lógica de negócio presta ainda precisa de uma pessoa

<!-- /exercises -->

## Recapitulação

- **Code review é um encaixe natural para uma Skill**: passos fixos, critérios mensuráveis, alta repetição
- **Organize o fluxo como um checklist**: convenções, tratamento de erros, problemas potenciais, manutenibilidade
- **Arquivos de apoio mantêm a Skill sustentável**: o arquivo principal fica curto, as regras detalhadas ficam por conta própria
- **Graduar a saída importa**: aprovado, vale uma olhada, precisa corrigir — para quem revisa saber o que fazer primeiro
- **Continue iterando**: adicione as checagens que faltaram depois de cada revisão, e em um mês ela estará precisa

Na próxima lição passamos aos padrões avançados: skills pessoais versus de projeto, controle de versão e colaboração em time.

[Lição 6 >>](./06-advanced-patterns.md)
