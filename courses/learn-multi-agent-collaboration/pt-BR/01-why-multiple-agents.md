# Lição 1: Por que múltiplos agentes: os limites de um único contexto

> Objetivos de aprendizado:
> - Nomear dois limites específicos que um único agente encontra em tarefas longas: poluição de contexto e diluição de atenção
> - Usar os números de custo de tokens reportados pela Anthropic para julgar se vale a pena dividir uma tarefa entre múltiplos agentes
> - Reconhecer quando a sobrecarga de coordenação supera o retorno, e dizer em que tipos de tarefa os sistemas multiagente não são bons hoje
>
> Pré-requisitos: os cinco primeiros cursos desta série (você sabe escrever prompts, entende o protocolo de chamada de ferramentas, conhece memória e estado de agentes, e sabe ler JS básico) | Próxima: [Lição 2 >>](./02-orchestrator-and-subagents.md)

## O que um único agente enfrenta quando faz tudo sozinho

Suponha que você entregue a um único agente esta tarefa: “Pesquise como três provedores de nuvem mudaram seus preços ao longo do último ano, compare-os lado a lado e escreva uma recomendação de 2000 palavras sobre qual escolher.”

Veja como um único agente trabalha nisso: ele pesquisa a página de preços do primeiro provedor e lê um longo bloco de HTML e tabelas de preços; pesquisa o segundo, outro bloco longo; pesquisa o histórico de mudanças do terceiro provedor, talvez percorrendo várias páginas; pelo caminho, encontra alguns resultados irrelevantes ou desatualizados e também os lê; por fim, trabalhando a partir dessa única conversa que não para de crescer, escreve a recomendação de 2000 palavras.

Nada disso está errado por si só. Os cursos anteriores já mostraram que é assim que um agente funciona: ler o contexto, decidir o próximo passo, chamar uma ferramenta, colocar o resultado de volta no contexto e repetir. O problema aparece quando a tarefa fica mais longa e mais complexa. Esse contexto único, sempre crescente, silenciosamente puxa o resultado final para baixo em dois pontos.

## Poluição de contexto: uma virada errada no início da qual você não se livra

No meio da pesquisa, o agente encontra um resultado enganoso — talvez um post de blog desatualizado citando um preço que não está mais em vigor. Ele não percebe que algo está errado, trata como dado real, raciocina a partir dali e chega a escrever isso em um julgamento inicial sobre um dos provedores.

Uma vez que esse julgamento errado existe, ele não desaparece. Permanece no histórico da conversa e passa a fazer parte do pano de fundo de cada etapa posterior de raciocínio. Quando o agente finalmente encontra a página de preços autoritativa e atual, os dois fatos contraditórios ficam na mesma janela de contexto, e o modelo pode não distinguir com clareza em qual confiar — especialmente quando o errado apareceu antes e foi referenciado pelo caminho.

Isso é a **poluição de contexto**: um erro ou fragmento irrelevante de uma etapa inicial se mistura ao único contexto do qual todo o raciocínio posterior depende, e é difícil que informações posteriores e corretas o lavem por completo. Como a Anthropic coloca, "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases" (à medida que o número de tokens na janela de contexto aumenta, a capacidade do modelo de recuperar com precisão as informações desse contexto diminui)[^S7]. Quanto mais longa a tarefa e mais etapas intermediárias, mais chances esse tipo de poluição tem de se acumular.

## Diluição de atenção: quanto mais lê, mais embaçada fica a visão

O segundo problema é diferente do primeiro. Não é que a informação esteja errada, é que ter informação demais já é, por si só, um custo. As páginas de preços e os históricos de mudanças de três provedores podem somar dezenas de milhares de palavras de conteúdo bruto, todas empilhadas em uma única janela de contexto. Quando o modelo escreve a recomendação final, em princípio ele precisa manter cada detalhe ao longo dessas dezenas de milhares de palavras ao mesmo tempo, mas sua atenção a qualquer um deles se espalha mais fina à medida que o contexto cresce.

Isso é a **diluição de atenção**. A Anthropic enquadra como um orçamento de atenção: "LLMs have an 'attention budget' that they draw on when parsing large volumes of context" (os LLMs têm um “orçamento de atenção” do qual lançam mão ao analisar grandes volumes de contexto) e "Every new token introduced depletes this budget by some amount" (cada novo token introduzido esgota esse orçamento em alguma medida)[^S7]. Quanto mais você comprime em uma única janela de contexto, menos desse orçamento sobra para qualquer detalhe isolado, e mais fácil é errar ou deixar coisas de fora em tarefas — resumos, comparações — que exigem manter muitos detalhes com precisão ao mesmo tempo.

Junte a poluição de contexto e a diluição de atenção e você tem o teto do caminho de contexto único: uma vez que a tarefa fica longa o suficiente, a qualidade se degrada de forma constante se um único agente a carrega do começo ao fim. A Anthropic descreve esse declínio como "a performance gradient rather than a hard cliff" (um gradiente de desempenho em vez de um penhasco abrupto)[^S7], e um prompt mais longo, sozinho, raramente o recupera.

## Sistemas multiagente: dividir uma tarefa longa entre vários contextos

A resposta multiagente é quebrar uma tarefa grande em pedaços e entregar cada um a um agente separado e independente, em vez de enfiar tudo no mesmo contexto sempre crescente. A definição da Anthropic: "A multi-agent system consists of multiple agents (LLMs autonomously using tools in a loop) working together." (um sistema multiagente consiste em múltiplos agentes — LLMs usando ferramentas de forma autônoma em um loop — trabalhando em conjunto)[^S1]

De volta ao exemplo de pesquisa em nuvem: em vez de um agente ler todo o material das três empresas do começo ao fim, ponha três agentes, cada um focado em uma empresa, cada um com sua própria janela de contexto separada, fora do caminho um do outro[^S1]. O post de blog desatualizado, recolhido enquanto se pesquisava a primeira empresa, só polui o contexto daquele agente; nunca se mistura ao raciocínio sobre as outras duas. A Anthropic chama isso de "separation of concerns" (separação de responsabilidades) — ferramentas, prompts e caminhos de exploração distintos que reduzem a dependência de caminho[^S1]. E o conteúdo bruto que cada agente precisa administrar cai de "o material das três empresas" para "o material de uma empresa", o que também alivia o problema da diluição de atenção. Exatamente como essa estrutura funciona — um agente central divide a tarefa, vários agentes trabalham em paralelo e depois os resultados são agregados — é o que a próxima lição aborda.

## O custo: multiagente é mais caro

Dividir entre agentes não é de graça. Cada subagente precisa reler o contexto da tarefa e organizar o próprio raciocínio, e isso queima tokens; depois uma etapa final agrega os resultados dos vários agentes, e isso também queima tokens. Os números medidos pela Anthropic: "In our data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats." (em nossos dados, os agentes normalmente usam cerca de 4× mais tokens do que interações de chat, e os sistemas multiagente usam cerca de 15× mais tokens do que os chats)[^S1]

15× não é um número pequeno. Significa que trazer um sistema multiagente só compensa quando a própria tarefa é valiosa o suficiente para justificar esse custo extra de tokens — como a Anthropic coloca, "For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance." (para viabilidade econômica, os sistemas multiagente exigem tarefas em que o valor da tarefa seja alto o bastante para pagar pelo desempenho adicional)[^S1]

Quantos subagentes executar também não é uma decisão do tipo "quanto mais, melhor". A Anthropic ofereceu uma regra prática de escala: uma busca simples de fatos vai bem com 1 agente e 3 a 10 chamadas de ferramenta; uma comparação direta pode exigir de 2 a 4 subagentes com 10 a 15 chamadas cada; e apenas pesquisas complexas o bastante para terem responsabilidades claramente divididas justificam mais de 10 subagentes.[^S1] No início, a equipe esbarrou nos contraexemplos — agentes que geravam 50 subagentes para uma consulta simples, ou vasculhavam a web sem fim por uma fonte que não existia, com agentes distraindo uns aos outros ao enviar uma pilha de atualizações desnecessárias.[^S1]

A atitude por trás dessa regra combina com o conselho que a Anthropic dá em outro texto sobre arquitetura de agentes: "you should consider adding complexity only when it demonstrably improves outcomes." (você deveria considerar adicionar complexidade apenas quando isso comprovadamente melhorar os resultados)[^S2] Faça a tarefa funcionar primeiro com um único agente, observe onde ela realmente trava — poluição de contexto ou diluição de atenção — e só então decida se, e em qual etapa, trazer múltiplos agentes. Isso é melhor do que montar um sistema multiagente complexo desde o começo.

## Quando não usar multiagente: a sobrecarga de coordenação supera o retorno

O valor de um sistema multiagente repousa sobre uma premissa: a tarefa pode ser quebrada em pedaços tratados de forma independente. Uma vez que essa premissa falha, a própria divisão vira peso extra. Isso é a **sobrecarga de coordenação**: o tempo e os tokens adicionais gastos para fazer vários agentes dividirem o trabalho e colaborarem, incluindo dividir a tarefa, agregar resultados e reconciliar saídas contraditórias dos agentes. Quando uma tarefa não tem muito que possa ser genuinamente **paralelizado**, a sobrecarga de coordenação facilmente ultrapassa o que a divisão traz.

A Anthropic nomeia um tipo de tarefa que é um mau encaixe: "most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time." (a maioria das tarefas de programação envolve menos tarefas verdadeiramente paralelizáveis do que a pesquisa, e os agentes LLM ainda não são ótimos em coordenar e delegar a outros agentes em tempo real)[^S1] Corrigir um bug geralmente significa entender vários trechos de lógica interligados no código, fortemente acoplados de ponta a ponta, difíceis de recortar em blocos limpos para agentes diferentes sem que pisem uns nos outros. Isso está mais perto de uma **tarefa em profundidade**: a resposta vive em uma cadeia de raciocínio que você tem de percorrer passo a passo, não espalhada por várias direções não relacionadas. Em contraste, o que a Anthropic considera que os sistemas multiagente realmente fazem bem é o trabalho de alto valor — "multi-agent systems excel at valuable tasks that involve heavy parallelization, information that exceeds single context windows, and interfacing with numerous complex tools" (os sistemas multiagente se destacam em tarefas valiosas que envolvem forte paralelização, informação que excede janelas de contexto individuais e a interface com numerosas ferramentas complexas)[^S1] — e pesquisar preços de nuvem ou comparar vários documentos lado a lado é uma **tarefa em largura**: a resposta se espalha por algumas direções relativamente independentes que você pode ir buscar separadamente, sem depender dos resultados intermediários umas das outras.

Para decidir se uma tarefa deve virar multiagente, comece com três perguntas: a tarefa pode ser dividida em subtarefas independentes umas das outras? Uma vez dividida, a informação total excede o que uma única **janela de contexto** consegue conter? A tarefa é valiosa o suficiente para cobrir esse custo extra de tokens? Se ao menos uma resposta pender para "não" ou "não vale a pena", concluir a tarefa honestamente com um **sistema de agente único** costuma ser um negócio melhor do que forçá-la em múltiplos agentes.

```agentmentor-check
{
  "id": "mac-zh-01-when-to-split",
  "label": "Esta tarefa deve ser dividida entre múltiplos agentes",
  "prompt": "Alguém diz: “Sistemas multiagente têm melhor desempenho de qualquer forma, então de agora em diante vou usar multiagente em toda tarefa — não pode fazer mal.” Essa pessoa está certa?",
  "whyHere": "Você acabou de ver os números de custo de tokens e a evidência de que “tarefas de programação paralelizam mal”, então é fácil se deixar levar pela impressão vaga de que “multiagente é mais forte” e esquecer que ele tem um custo e tem limites — este é o ponto para furar isso com um critério de julgamento concreto",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Certa — se uma abordagem tem melhor desempenho, use-a sempre. Multiagente só custa um pouco mais, o que vale a pena.",
      "correct": false,
      "feedback": "Isso pula duas coisas. Primeiro, um sistema multiagente usa em média cerca de 15× os tokens de uma interação de chat, então só compensa quando o valor da tarefa é alto o bastante — não é só “um pouco mais”. Segundo, a Anthropic afirma com clareza que a maioria das tarefas de programação tem pouco que possa ser paralelizado, então dividi-las entre agentes não é necessariamente melhor e pode ser pior por causa da sobrecarga de coordenação. “Ter melhor desempenho” não é uma propriedade padrão do multiagente; depende de a tarefa ser adequada à divisão."
    },
    {
      "id": "b",
      "text": "Não — sistemas multiagente servem só para economizar tokens, então você deveria recorrer a eles apenas em tarefas simples.",
      "correct": false,
      "feedback": "Isso está de cabeça para baixo. Os números da Anthropic dizem que um sistema multiagente usa em média cerca de 15× os tokens de uma interação de chat, então não é uma ferramenta de economia de tokens. E uma busca simples de fatos vai bem com 1 agente e 3 a 10 chamadas de ferramenta, então tarefas simples precisam menos de multiagente, não mais. São as tarefas complexas o bastante para se dividir de forma limpa que podem justificar vários subagentes."
    },
    {
      "id": "c",
      "text": "Não — primeiro verifique se a tarefa se divide em subtarefas realmente independentes, se sua informação excede um contexto e se seu valor cobre os tokens extras.",
      "correct": true,
      "feedback": "Correto. Os dados da Anthropic mostram que um sistema multiagente usa em média cerca de 15× os tokens de uma interação de chat, então só compensa quando o valor da tarefa cobre esse custo; a Anthropic também afirma que trabalho do tipo programação tem muito menos que possa ser genuinamente paralelizado do que a pesquisa. A decisão se resume a se a tarefa pode ser quebrada em pedaços tratados de forma independente, não a “tem melhor desempenho, então use sempre”."
    }
  ]
}
```

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Julgar se quatro tarefas devem ser divididas

Para as quatro tarefas abaixo, decida se cada uma se encaixa melhor em um único agente ou em dividir entre múltiplos agentes, e explique por quê.

1. "Descubra por que esta função às vezes retorna um resultado errado sob concorrência, e identifique o bug exato."
2. "Pesquise as principais empresas em cinco setores diferentes e, para cada uma, quais produtos ligados a IA lançaram no último ano, organizados em uma tabela comparativa."
3. "Traduza este texto de divulgação de produto de 300 palavras para o inglês."
4. "Leia as descrições e a discussão dos últimos 20 PRs neste repositório e resuma em que tipos de questão a equipe tem focado ultimamente."

<!-- rubric -->
- As quatro tarefas recebem uma decisão clara (agente único / multiagente / ou sob que condições você escolheria qual)
- Cada decisão explica seu raciocínio, não apenas um veredito
- O raciocínio mostra os critérios de julgamento em uso: se ela se divide em subtarefas independentes, se a informação excede um único contexto, se é simples o bastante para não valer a pena dividir

<!-- answer -->
1. Agente único. Identificar um bug de concorrência significa trabalhar passo a passo por uma cadeia de raciocínio — ler a lógica da função, rastrear o timing das chamadas, localizar o estado compartilhado — e essas etapas dependem fortemente umas das outras. É uma tarefa em profundidade, difícil de dividir em pedaços não relacionados para agentes diferentes.
2. Multiagente. Os cinco setores são independentes entre si e podem ser genuinamente pesquisados em separado, uma tarefa em largura; e cinco relatórios combinados muito provavelmente excedem o único contexto que um agente consegue administrar de forma limpa. Ponha um subagente em cada setor, cada um reunindo o próprio material, e depois agregue em uma tabela comparativa.
3. Agente único. A tarefa é simples e a informação, pequena; uma tradução é algo que o modelo faz diretamente a partir de sua capacidade linguística e do texto-fonte dado. Não há subtarefas independentes que valham a pena separar, e multiagente só desperdiçaria tokens.
4. Depende, pendendo para agente único ou uma divisão leve: 20 PRs não é um número enorme, e se o conteúdo não for longo, um agente lendo tudo e resumindo é viável; se a discussão de cada PR for longa e o total exceder claramente o que um único contexto comporta, você pode agrupar os PRs entre dois ou três subagentes para ler em paralelo e depois agregar os temas. O ponto é estimar o volume total primeiro, não recorrer à divisão só porque viu "20".

<!-- hint -->
Comece por "a resposta desta tarefa está espalhada por várias direções independentes, ou enterrada em uma cadeia de raciocínio que você tem de percorrer passo a passo?" A primeira é em largura e se divide bem; a segunda é em profundidade e só faz os agentes pisarem uns nos outros.

<!-- hint -->
Depois pergunte "uma vez dividida, a informação total excede claramente o que o contexto de um agente comporta?" Se o volume já era pequeno e um agente o acomoda bem, a sobrecarga de coordenação da divisão em geral não vale a pena.

### Nível 2: Estimar uma configuração de agentes para uma tarefa de pesquisa

A tarefa é: "Pesquise os recursos recém-lançados por cada um de três concorrentes nos últimos seis meses, e escreva um resumo de cerca de 200 palavras para cada um — sem necessidade de comparação lado a lado." Usando a regra prática de escala desta lição, estime aproximadamente quantos agentes executar e cerca de quantas chamadas de ferramenta cada um precisa, e explique a base da sua estimativa.

<!-- rubric -->
- Dá uma estimativa específica de número de agentes, não apenas "rode mais alguns"
- Dá uma faixa aproximada de chamadas de ferramenta por agente
- A base reflete o julgamento de que "os três concorrentes são independentes e podem ser pesquisados separadamente"

<!-- answer -->
Os três concorrentes são independentes entre si e cada um precisa de uma recuperação de profundidade moderada, o que coloca isso na faixa intermediária da regra de escala da Anthropic (2 a 4 subagentes, 10 a 15 chamadas de ferramenta cada). Como são exatamente três empresas, um subagente por empresa é o encaixe mais natural — rode 3 subagentes, cada um focado em uma empresa; cada subagente precisa de cerca de 10 a 15 chamadas de ferramenta para buscar os lançamentos dessa empresa nos últimos seis meses, atualizações de páginas de produto, blog oficial e outras fontes, reunindo material suficiente para um resumo de 200 palavras. Como não é preciso comparação lado a lado, a etapa final de agregação é muito mais leve do que uma tarefa de "tabela comparativa" — é quase só costurar os três resumos, sem integração profunda adicional.

<!-- hint -->
A regra de escala dá três faixas: uma busca simples de fatos usa 1 agente com 3 a 10 chamadas; uma comparação direta usa 2 a 4 subagentes com 10 a 15 chamadas cada; apenas pesquisas complexas o bastante para dividir responsabilidades de forma limpa chegam a mais de 10 subagentes. Descubra primeiro em qual faixa esta tarefa cai, e só então refine os números.

<!-- hint -->
Note que a tarefa diz "sem necessidade de comparação lado a lado", o que significa que a agregação final é leve — sem integração profunda de várias fontes em um julgamento unificado. Isso afeta o tamanho da sobrecarga de coordenação, e se a divisão vale a pena.

<!-- /exercises -->

## Recapitulação

- Um único agente fazendo tudo do começo ao fim encontra dois limites específicos em tarefas longas: **poluição de contexto** (um erro inicial ou fragmento irrelevante se mistura ao raciocínio posterior e é difícil de lavar) e **diluição de atenção** (quanto mais você empacota em um único contexto, menos o modelo atende a qualquer detalhe isolado).
- Um **sistema multiagente** é vários agentes que cada um usa ferramentas de forma independente trabalhando em conjunto[^S1], aliviando poluição e diluição ao dar a cada agente sua própria janela de contexto.
- Multiagente não é de graça: os dados da Anthropic mostram que ele usa em média cerca de 15× os tokens de uma interação de chat, então só compensa quando o valor da tarefa é alto o bastante[^S1]; quantos subagentes executar também tem uma regra de escala da Anthropic para se apoiar, em vez de "quanto mais, melhor"[^S1].
- A postura mais segura é fazer a tarefa funcionar primeiro com um único agente, e só considerar adicionar complexidade quando isso comprovadamente melhorar os resultados[^S2].
- Para decidir se dividir entre agentes, pergunte: a tarefa pode ser quebrada em subtarefas independentes? A informação excede um único contexto? O valor compensa o custo extra de tokens? A Anthropic afirma com clareza que tarefas do tipo programação, em profundidade e fortemente acopladas paralelizam mal e não são o forte do multiagente[^S1]; tarefas de pesquisa em largura que você pode ir buscar separadamente, sim.

[Lição 2: Orquestrador e subagentes: distribuir e agregar >>](./02-orchestrator-and-subagents.md)
