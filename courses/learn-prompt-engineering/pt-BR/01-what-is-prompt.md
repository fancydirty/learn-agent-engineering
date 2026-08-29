# Lição 1: O que é um prompt e por que isso importa

> Objetivos de aprendizado:
> - Entender o que é um prompt e o que ele faz
> - Distinguir um prompt vago de um prompt claro
> - Ver como a qualidade do prompt molda o que a IA devolve
>
> Pré-requisitos: Você já usou alguma ferramenta de chat com IA | Próxima: [Lição 2 >>](./02-prompt-structure.md)

## Você já está usando prompts (talvez não muito bem)

Você abre o ChatGPT ou o Claude, digita “me escreva um relatório” e recebe de volta algo genérico que não bate com o que você realmente precisava. Não é a IA falhando com você. Seu prompt foi vago demais. Tudo o que a IA viu foram quatro palavras. Ela não faz ideia de para quem é o relatório, que problema ele deve resolver, que tom adotar ou o que colocar dentro dele.

Um prompt é a instrução que você dá à IA[^S13]. Ele determina quanto da sua intenção a IA consegue captar e limita a qualidade do que volta. Mesma pergunta, dois resultados: uma instrução vaga recebe uma resposta vaga, uma instrução clara recebe um resultado preciso. Esta lição ensina você a enxergar essa diferença, o que prepara o terreno para tudo o que vem depois.

## O que é um prompt

Um **prompt** é o texto que você fornece a um modelo de linguagem grande (LLM) para dizer o que você quer[^S13]. Pode ser uma pergunta, uma descrição, uma tarefa ou alguma mistura dos três.

Um modelo de linguagem grande é um sistema de IA treinado com quantidades enormes de texto — "a type of language model notable for its ability to achieve general-purpose language understanding and generation."[^S14] (um tipo de modelo de linguagem que se destaca pela capacidade de alcançar compreensão e geração de linguagem de propósito geral). ChatGPT, Claude e ferramentas semelhantes pertencem todos a essa categoria. Eles não são mecanismos de busca. Não procuram uma resposta pronta na internet; geram um texto novo que se encaixa na sua instrução, a partir de padrões aprendidos durante o treinamento.

Aqui está o ponto central: **um LLM só consegue entender a tarefa através do seu prompt.** Tudo o que você deixar de fora, ele terá que adivinhar. Quanto mais claro você for, mais perto a saída chega do que você tinha em mente.

## Prompt vago vs. prompt claro

Dois exemplos reais mostram a diferença.

**Cenário 1: pedir para a IA explicar um conceito técnico**

❌ **Prompt vago:**
```
o que é uma API
```

A IA pode te entregar:
- uma definição de livro-texto (“API significa interface de programação de aplicações…”)
- algo técnico demais (presume que você sabe programar)
- ou algo raso demais (só “serve para os programas conversarem entre si”)

✅ **Prompt claro:**
```
Sou gerente de produto e não programo. Explique o que é uma API usando
uma analogia do dia a dia, para eu conseguir acompanhar o que meu time
de desenvolvimento quer dizer quando fala nisso no planejamento.
```

A IA te dá:
- uma explicação no nível de um gerente de produto
- uma analogia do dia a dia (algo como “um cardápio de restaurante é um tipo de API”)
- exemplos ligados ao seu trabalho real

O que mudou? O prompt claro deixa explícitas três coisas: **quem você é (gerente de produto), sua bagagem (você não programa) e o que você vai fazer com a resposta (discutir requisitos com o time de desenvolvimento).**

**Cenário 2: pedir para a IA escrever código**

❌ **Prompt vago:**
```
escreva uma função Python para processar dados
```

A IA fica adivinhando:
- que dados? uma lista, um dicionário, um arquivo, um banco de dados?
- processar como? ordenar, filtrar, transformar, agregar?
- quais são os formatos de entrada e saída?

✅ **Prompt claro:**
```
Escreva uma função Python que recebe uma lista de avaliações de usuários
(1-5), filtra qualquer nota abaixo de 3 e retorna a média do que sobrou,
arredondada para uma casa decimal. Inclua type hints e uma docstring.
```

A IA consegue produzir:
- uma assinatura de função clara
- lógica de filtragem e cálculo que corresponde à especificação
- documentação e anotações de tipo adequadas

O que mudou? O prompt claro nomeia o **formato de entrada, a lógica de processamento, o requisito de saída e o estilo de código.**

```agentmentor-check
{
  "id": "prompt-engineering-what-is-prompt-identify-clear",
  "label": "Avaliação da clareza do prompt",
  "prompt": "Qual prompt é mais claro — qual dá à IA uma chance melhor de entender o que você quer?\n\nA: “Resuma este artigo”\n\nB: “Resuma os pontos principais deste artigo em três tópicos, uma frase cada, escritos para um leitor leigo”",
  "whyHere": "Você acabou de ver que um prompt claro nomeia formato, público e escopo. A armadilha aqui é supor que um prompt mais curto é automaticamente mais claro — confira se você consegue distinguir os dois.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "A é mais claro, porque é curto e direto",
      "correct": false,
      "feedback": "❌ Não exatamente: curto não é o mesmo que claro. O A nunca diz quantos pontos, que tamanho cada um deve ter nem quem vai ler, então a IA precisa adivinhar. Você pode receber um parágrafo longo, cinco tópicos ou algo cheio de jargão."
    },
    {
      "id": "b",
      "text": "B é mais claro, porque define o formato, o tamanho e o público",
      "correct": true,
      "feedback": "✓ Correto. O B fixa três coisas: formato de saída (três tópicos, uma frase cada), público (um leitor leigo) e escopo (os pontos principais). A IA sabe o que produzir."
    }
  ]
}
```

## A qualidade do prompt decide a qualidade da saída

Em tarefas complexas, a clareza com que você escreve o prompt faz uma diferença mensurável na qualidade da saída — e como o mesmo prompt é reaproveitado muitas e muitas vezes, essa diferença se acumula a cada execução[^S7]. Na direção oposta, um prompt vago te custa:

- **Mais rodadas de revisão.** Você recebe uma resposta que não acerta, acrescenta um detalhe, recebe outra ainda fora do alvo, acrescenta mais um. São várias passadas até chegar perto do que você queria.
- **Saída inconsistente.** Faça a mesma pergunta imprecisa duas vezes e o estilo, a profundidade e a ênfase voltam diferentes a cada vez.
- **Tokens e tempo desperdiçados.** Um prompt vago faz a IA gerar uma pilha de material que você não consegue usar, queimando seu orçamento de tokens (se você estiver numa API paga) ou sua paciência.

**Descoberta principal:** o grupo de pesquisa de Developer Tools da Microsoft constatou que, em tarefas de geração de código, "prompts with explicit specifications reduced the need for back-and-forth refinements by 68%."[^S12] (prompts com especificações explícitas reduziram em 68% a necessidade de refinamentos de ida e volta). Isso significa que você tem uma chance muito maior de obter código utilizável na primeira tentativa, em vez de rodear o alvo numa terceira e numa quarta rodada.

O retorno de um prompt claro aparece de imediato: menos tentativa e erro, uma taxa maior de acerto na primeira tentativa e uma saída que você realmente consegue conduzir.

## Engenharia de prompt é uma habilidade

Engenharia de prompt é a prática sistemática de projetar e refinar prompts[^S13]. Não se trata de encontrar uma fórmula mágica. Trata-se de entender como a IA funciona e aprender a expressar o que você precisa em termos sobre os quais ela consegue agir.

Em 2026, os modelos seguem instruções bem — eles dão conta de orientações complexas, documentos longos e tarefas de múltiplas etapas[^S6]. Mas eles ainda dependem do seu prompt para definir os limites da tarefa. Um modelo não consegue ler sua mente. O que você não diz, ele não sabe.

A engenharia de prompt abrange:
- escrever a estrutura básica de uma instrução clara (Lição 2)
- usar exemplos para mostrar à IA o padrão que você quer (Lição 3)
- fazer a IA mostrar seu raciocínio (Lição 4)
- depurar e melhorar prompts de forma sistemática (Lição 5)
- escolher uma estratégia à altura da tarefa (Lição 6)

Este curso ensina métodos reutilizáveis, não truques pontuais. Uma vez que você os tenha, consegue trabalhar com mais eficiência com qualquer ferramenta de LLM.

## Recapitulação

Um prompt é a instrução que você dá à IA, e é ele que decide quanto da sua intenção a IA consegue captar. Um prompt vago deixa a IA adivinhando; um prompt claro fixa os limites da tarefa, o formato de saída e o contexto de que ela precisa. Pesquisas mostram que um prompt claro reduz as rodadas de revisão e resolve a tarefa com mais eficiência.

A próxima lição cobre a estrutura básica de um prompt — como quebrar um pedido impreciso em quatro partes claras: papel, tarefa, formato e restrições.

**Próxima** [A estrutura básica de um prompt >>](./02-prompt-structure.md)

<!-- exercises -->

## 💻 Exercícios

### Nível 1: Identificar e reescrever um prompt vago

Um colega escreveu este prompt: “me ajuda a otimizar esse código”. Aponte os três principais problemas dele e depois reescreva o prompt numa versão clara.

<!-- rubric -->
- Identificação de pelo menos 2 dos problemas centrais (sem objetivo de otimização, sem linguagem ou contexto do código, sem formato de saída especificado)
- Objetivo de otimização nomeado na reescrita (desempenho / legibilidade / segurança etc.)
- Contexto de que a IA precisa incluído na reescrita
- Formato de saída esperado especificado na reescrita
<!-- answer -->
**Análise dos problemas:**
1. Sem objetivo de otimização: desempenho, legibilidade ou segurança?
2. Sem contexto do código: que linguagem? o que ele faz? há problemas conhecidos?
3. Sem formato de saída: você quer o código reescrito ou uma lista de sugestões?

**Exemplo de reescrita:**
```
Você é um engenheiro sênior de desempenho em Python.

Analise os gargalos de desempenho no código Python de processamento de
dados abaixo e me dê recomendações de otimização.

Contexto: este código processa uma lista de 100.000 registros de usuários
e atualmente leva 30 segundos para rodar.

Formato de saída:
1. Gargalos atuais (ordenados por impacto, indicando o volume de dados a
   partir do qual cada um vira problema)
2. Recomendações (cada uma com: a mudança específica, o ganho de
   desempenho esperado e o trecho de código otimizado)

Código:
[cole o código]
```

<!-- hint -->
Comece pelos quatro elementos que você vai aprender na Lição 2: quais deles faltam neste prompt? O que está errado no papel, na tarefa, no formato e nas restrições?
<!-- hint -->
Pense assim: se você fosse a IA e tudo o que visse fosse “otimize esse código”, daria para saber o que fazer? Que informação a mais você precisaria para dar uma resposta útil?

### Nível 2: Projetar um prompt para uma situação real

Escolha uma situação em que você usou uma ferramenta de IA recentemente (ou use esta): **peça à IA para escrever um e-mail a um cliente explicando por que a entrega de um produto está atrasada e pedindo desculpas por isso.**

Projete um prompt claro que garanta que a IA produza um e-mail adequado às suas necessidades.

<!-- rubric -->
- Público do e-mail nomeado no prompt (cargo e bagagem do cliente)
- Motivo específico do atraso e nova data de entrega declarados no prompt
- Tom e estilo do e-mail especificados no prompt (formal, sincero, profissional etc.)
- Restrições necessárias incluídas no prompt (tamanho, estrutura, o que evitar etc.)
- Prompt bem estruturado, de modo que a IA absorva todos os requisitos de uma vez
<!-- answer -->
**Exemplo de prompt:**

```
Você é um gerente de contas profissional, hábil em preservar a confiança
do cliente numa situação difícil.

Escreva um e-mail para um cliente corporativo explicando que a entrega de
um projeto de software está atrasada.

Contexto:
- Cliente: o diretor de TI de um banco
- Projeto: um sistema de gestão de risco que estamos construindo para ele
- Data de entrega original: 2024-03-15
- Nova data de entrega: 2024-04-01 (um atraso de 2 semanas)
- Motivo do atraso: uma auditoria de segurança apontou que precisamos
  reforçar o módulo de criptografia de dados, uma mudança necessária para
  manter o sistema seguro

Requisitos do e-mail:
- Tom: formal, profissional, sincero
- Estrutura: desculpas -> motivo -> por que este atraso é do interesse do
  cliente -> novo cronograma -> o que estamos fazendo para compensar
- Tamanho: no máximo 300 palavras
- Evitar: excesso de desculpas (não repetir “sinto muito” várias vezes),
  fugir da responsabilidade, garantias vazias

Saída:
Me dê apenas o corpo do e-mail, sem introdução do tipo “Aqui está o
e-mail.”
```

**Por que este prompt funciona:**
- Nomeia o papel (gerente de contas) e a situação de escrita
- Fornece todo o contexto necessário (quem, o quê, quando, por quê)
- Especifica requisitos concretos de tom, estrutura e tamanho
- Diz o que evitar, antecipando erros comuns da IA
- Define um formato de saída claro que você pode usar diretamente

<!-- hint -->
Primeiro liste os fatos que este e-mail precisa conter: quem, o que aconteceu, por quê, o novo cronograma e como você vai corrigir a situação. Depois pense em como fazer a IA segurar tudo isso e ainda acertar o tom e o estilo.
<!-- hint -->
Se o seu primeiro prompt não estiver claro o bastante, teste uma vez e veja onde a saída da IA erra, depois acrescente restrições mirando essas lacunas. Lembre-se: depurar um prompt é um processo iterativo normal.

<!-- /exercises -->
