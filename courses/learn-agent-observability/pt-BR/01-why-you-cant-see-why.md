# Lição 1: Por que você não consegue dizer o que deu errado

> Objetivos de aprendizado:
> - Entender por que um único sintoma visível ao usuário pode esconder várias causas-raiz indistinguíveis entre si
> - Explicar como o não determinismo quebra a intuição tradicional de depuração do tipo “reproduza e coloque um breakpoint”
> - Reconhecer os diferentes formatos que os erros assumem em sistemas de agentes: falhas em cascata, divergência de trajetória, acúmulo entre turnos e emergência em multiagentes
>
> Pré-requisitos: concluir os 10 primeiros cursos desta série, conseguir escrever à mão um loop de harness guiado por `stop_reason`, entender que as trilhas de avaliação só entregam passa/falha | Próxima: [Lição 2 >>](./02-transcripts-as-evidence.md)

## Uma terça à tarde que você não consegue explicar

Seu agente interno de pesquisa está no ar há duas semanas. Terça à tarde, o time de operações encaminha um relato de usuário:

> Pedi para ele achar nosso plano de preços do ano passado. Ele disse que não encontrou nada. Mas esse documento está lá na base de conhecimento — eu mesmo levei dois segundos para abrir.

Você abre a sessão. Duas coisas na tela: a pergunta do usuário e a resposta final do agente, “Não encontrei nenhum material relevante”. O que aconteceu no meio? Você não tem nada.

Então você começa a chutar.

Ele montou uma consulta de busca ruim — pegando a pergunta em linguagem natural do usuário e enfiando tudo inteiro na recuperação, em vez de extrair palavras-chave? Ou será que ele encontrou resultados mas escolheu as fontes erradas, lendo os dois resultados menos relevantes de oito e concluindo “não tem nada aqui”? Ou a ferramenta de recuperação lançou um erro, e o agente interpretou a falha como “não há informação nessa direção” e seguiu em frente?

Os três chutes ficam idênticos do lado do usuário: o agente não consegue encontrar uma informação que está obviamente lá.

Isso não é exclusividade sua. Quando o time da Anthropic fez a retrospectiva do seu sistema multiagente de pesquisa, eles registraram exatamente o mesmo problema: usuários relatavam que os agentes estavam “not finding obvious information” (não encontrando informação óbvia), mas eles não conseguiam ver por quê. Os agentes estavam usando consultas de busca ruins? Escolhendo fontes ruins? Esbarrando em falhas de ferramenta?[^S1] As mesmas três perguntas, nenhuma resposta.

## A trilha de avaliação só responde “quebrou?”

Seu primeiro instinto provavelmente é abrir o sistema que você construiu no curso anterior (curso 10 desta série): pontuação de estado final, validadores, conjuntos de avaliação. É o primeiro passo certo. Você adiciona essa pergunta real do usuário ao conjunto de avaliação, escreve um critério “a resposta precisa citar o documento de preços” e roda.

Resultado: uma linha vermelha. `fail`.

Essa linha vermelha é útil — ela transforma uma reclamação subjetiva em um veredito reproduzível e testável contra regressão. Mas ela não responde à pergunta que você de fato precisa responder agora: por quê. O avaliador olha o estado final. O estado final é “não citou o documento”. Se esse “não citou” veio de uma consulta ruim, de uma seleção de fontes ruim ou de um erro de ferramenta engolido — o avaliador não se importa e não tem como se importar. Ele fica parado na linha de chegada segurando um boletim.

Este curso preenche o trecho do meio. Usando um enquadramento cunhado por este curso:

> **A verificação diz se quebrou. A observabilidade diz por quê.**

Essa frase não vem de nenhuma documentação oficial — é o enquadramento deste curso para amarrar as próximas cinco lições, apoiado em duas experiências reais. Uma vem daquela retrospectiva do sistema multiagente: adicionar tracing completo em produção permitiu diagnosticar por que os agentes falhavam e corrigir problemas de forma sistemática[^S1]. A outra vem do lado da engenharia de ferramentas: analisar as transcrições brutas que seu agente de avaliação deixa para trás ajuda a sondar por que os agentes chamam ou deixam de chamar determinadas ferramentas[^S3]. As duas frases apontam para a mesma coisa — só quando o processo deixa rastro é que você consegue perguntar “por quê”.

```agentmentor-check
{
  "id": "obs-zh-01-rerun-to-reproduce",
  "label": "Dá para reproduzir rodando de novo?",
  "prompt": "Uma execução em produção falhou. Seu colega diz: 'É só rodar de novo com a mesma entrada — assim que reproduzirmos, a gente localiza o problema.' Essa abordagem funciona para agentes?",
  "whyHere": "Esse é o primeiro reflexo que quase todo mundo traz da depuração tradicional, e também é a base que a próxima seção desmonta. Responda por conta própria antes de seguir lendo.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Funciona. Rode vezes suficientes e uma hora você cai no mesmo caminho. É como caçar um bug intermitente de concorrência.",
      "correct": false,
      "feedback": "Bugs intermitentes de concorrência pelo menos rodam sobre o mesmo código determinístico — rode vezes suficientes e você tem chance real de cair na falha. Agentes são diferentes: eles tomam decisões a cada etapa. Mesmo com condições iniciais idênticas, o mais provável é você cair num caminho diferente, porém igualmente válido."
    },
    {
      "id": "b",
      "text": "Não funciona. O interior de um agente é fundamentalmente inobservável. Quando algo quebra, só resta mexer no prompt e ver o que acontece — é tentativa e erro até convergir.",
      "correct": false,
      "feedback": "A primeira metade está certa, a segunda está muito errada. Reproduzir não funciona, mas isso não significa que não haja evidência — as requisições ao modelo, os parâmetros das ferramentas e as respostas das ferramentas da execução que falhou podem todos ser registrados. As próximas cinco lições cobrem como registrar e como ler."
    },
    {
      "id": "c",
      "text": "Não funciona. Mesmo com prompts idênticos, duas execuções podem tomar caminhos diferentes e igualmente válidos. Para reconstruir o que aconteceu, você precisa dos registros que aquela execução específica deixou para trás.",
      "correct": true,
      "feedback": "Correto. Breakpoints partem do pressuposto de que “a segunda execução vai passar pela mesma linha”. Agentes não garantem isso. Por isso o centro de gravidade da depuração se desloca de “rode de novo” para “o que a última execução deixou para trás” — e é esse o problema que a observabilidade resolve."
    }
  ]
}
```

## Por que “reproduzir e colocar um breakpoint” não funciona aqui

Primeiro, as definições. Um sistema **determinístico** é aquele que, dada a mesma entrada, produz a mesma saída todas as vezes. Um sistema **não determinístico** é o oposto — agentes são desse tipo. Em computação, sistemas determinísticos produzem a mesma saída sempre que recebem entradas idênticas, enquanto sistemas não determinísticos — como os agentes — podem gerar respostas variadas mesmo com as mesmas condições iniciais[^S3].

Isso puxa o tapete da depuração tradicional. Agentes tomam decisões dinâmicas e são não determinísticos entre execuções, mesmo com prompts idênticos. Isso torna a depuração mais difícil[^S1]. Avaliações tradicionais costumam assumir que a IA segue as mesmas etapas todas as vezes: dada a entrada X, o sistema deveria seguir o caminho Y para produzir a saída Z. Mas sistemas multiagentes não funcionam assim. Mesmo com pontos de partida idênticos, agentes podem tomar caminhos completamente diferentes e válidos para alcançar seu objetivo[^S1].

Na prática, é assim que isso aparece:

```text
Mesma pergunta, mesma versão do prompt, duas execuções

Execução A                                   Execução B
1 search("plano de preços 2024")             1 search("plano de preços 2024 docs internos")
2 read_doc(doc_17)                           2 search("arquivo de preços")
3 respond (citando doc_17)                   3 read_doc(doc_09)
                                             4 read_doc(doc_17)
                                             5 respond (citando doc_17 e doc_09)
```

Nenhum dos dois caminhos está errado, e os dois estados finais passariam. Mas se a falha aconteceu na etapa 2 da execução A, e você roda dez vezes e obtém nove execuções B, essas nove execuções não ajudam em nada.

Breakpoints são igualmente inúteis. Breakpoints ficam em linhas de código, com a pré-condição de que “a segunda execução vai passar por esta linha com o mesmo contexto”. Mas o lugar onde os agentes erram muitas vezes não é o seu código — é uma decisão do modelo. E, mesmo que você quisesse pausar, não saberia em que turno pausar: desta vez quebra no turno 3, na próxima talvez no turno 11, ou talvez nem quebre.

Você pode pensar em baixar a temperatura de amostragem ou em gravar e reproduzir as respostas das ferramentas. Essas técnicas de engenharia de fato reduzem parte do ruído, e este curso não desencoraja você a usá-las. Mas elas mudam a execução que você está fazendo no seu laboratório, não aquela que já falhou em produção — essa já se foi, e a única coisa que ela deixou para trás foram seus registros.

O time da Anthropic tomou outro caminho. Eles chamam isso de “think like your agents” (pense como seus agentes): construir uma simulação usando exatamente os mesmos prompts e ferramentas do sistema e então observar os agentes trabalhando etapa por etapa. Isso revelou modos de falha imediatamente: agentes que continuavam mesmo já tendo resultados suficientes, que usavam consultas de busca excessivamente verbosas ou que selecionavam ferramentas incorretas[^S1].

A chave não é “reproduzir a mesma execução” — é “ver cada etapa”. É aí que a observabilidade se separa da depuração tradicional.

## Os erros que agentes produzem têm formatos diferentes

Mesmo aceitando que “você precisa de registros”, há outra camada para entender: o formato dos erros em sistemas de agentes não é o mesmo dos bugs tradicionais.

No software tradicional, um bug pode quebrar um recurso, degradar o desempenho ou causar indisponibilidade. Em sistemas agênticos, mudanças pequenas cascateiam em grandes mudanças de comportamento, o que torna notavelmente difícil escrever código para agentes complexos que precisam manter estado em um processo de longa duração[^S1].

Dentro de uma única execução, o formato mais típico é a **divergência de trajetória**. Agentes têm estado e os erros se acumulam. A natureza cumulativa dos erros em sistemas agênticos significa que problemas menores para o software tradicional podem descarrilar agentes por completo. Uma única etapa que falha pode fazer o agente explorar trajetórias inteiramente diferentes, levando a resultados imprevisíveis[^S1].

```text
Turno 3: a busca dá timeout, a ferramenta retorna "Error: upstream timeout"
        ↓
O agente lê isso como "não há informação nessa direção"
        ↓
Muda para um ângulo de recuperação completamente diferente
        ↓
Os 12 turnos seguintes crescem todos sobre esse galho errado
        ↓
Estado final: um relatório aparentemente completo, com todas as fontes vindas de material tangencial
```

Repare em quão pequeno é o primeiro elo dessa corrente: um timeout. Em um serviço tradicional, ele talvez virasse apenas uma linha de log de retentativa. Aqui ele reescreve os doze turnos seguintes, e o relatório do estado final não dá erro, não quebra e se lê com perfeita fluidez.

O segundo formato é o **acúmulo entre turnos**. Agentes têm estado e os erros se acumulam. Agentes podem rodar por longos períodos, mantendo estado ao longo de muitas chamadas de ferramenta. Isso significa que precisamos executar código de forma durável e tratar erros pelo caminho[^S1]. É também por isso que você não pode simplesmente recomeçar do zero quando ocorrem erros: reinícios são caros e frustrantes para os usuários. Em vez disso, foram construídos sistemas capazes de retomar de onde o agente estava quando os erros aconteceram[^S1]. A implicação para você é direta: se o estado no momento da falha não foi registrado, a pergunta “de onde retomar” não tem resposta.

O terceiro formato só aparece em sistemas multiagentes: **comportamento emergente**. Sistemas multiagentes têm comportamentos emergentes, que surgem sem programação específica. Por exemplo, pequenas mudanças no agente líder podem alterar de forma imprevisível o comportamento dos subagentes. O sucesso exige entender padrões de interação, não apenas o comportamento de agentes individuais[^S1].

Sobre como esses formatos ficam quando convergem todos de uma vez, a versão inicial daquele time deu uma resposta bem direta: os primeiros agentes cometiam erros como abrir 50 subagentes para consultas simples, vasculhar a web sem fim atrás de fontes inexistentes e se distrair mutuamente com atualizações em excesso[^S1].

Esses três tipos de erro têm algo em comum: vistos de fora, o estado final pode parecer apenas “a qualidade da resposta está mais ou menos”. Você não consegue dizer qual dos três é.

## Camadas de abstração escondem a evidência

Há mais uma camada de problema, e ela não vem do modelo — vem do seu ferramental.

Frameworks de agente facilitam o começo ao simplificar tarefas padrão de baixo nível, como chamar LLMs, definir e fazer o parse de ferramentas e encadear chamadas. Porém, eles frequentemente criam camadas extras de abstração que podem obscurecer os prompts e as respostas subjacentes, tornando-os mais difíceis de depurar[^S2]. É por isso que o conselho a desenvolvedores é: comece usando as APIs de LLM diretamente — muitos padrões podem ser implementados em poucas linhas de código. Se você for usar um framework, garanta que entende o código por baixo. Suposições incorretas sobre o que há sob o capô são uma fonte comum de erro dos clientes[^S2]. (Esse artigo carrega uma nota editorial dizendo que suas descrições do ecossistema de ferramentas estão desatualizadas, então citamos aqui os princípios, sem tratá-lo como guia atual de escolha de ferramentas.)

Para você, isso é na verdade uma boa notícia. Você escreveu à mão o loop do harness no curso 7 desta série. Você não tem essa camada de abstração:

```javascript
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  // O que passa por esta linha: nome da ferramenta, parâmetros, corpo da resposta, duração, erros
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ model, max_tokens, tools, messages });
  // O que passa por esta linha: qual número de requisição, quanto tempo, quantos tokens, qual stop_reason
}
```

A evidência passa por esse loop toda vez, sem falta. O problema é que, depois de passar, ela some. Você não tem obstrução, mas também não tem retenção — do ponto de vista de quem precisa de evidência depois do fato, essas duas coisas doem igual.

O diagnóstico deste curso, então, é: metade da dificuldade de depurar agentes vem do fato objetivo do não determinismo, e a outra metade vem de “coisas que poderiam ter sido registradas e não foram”. A primeira metade não dá para mudar. A segunda está nas suas mãos.

## O caminho adiante: o que as próximas cinco lições entregam

O time daquele sistema multiagente colocou isso no mesmo patamar da engenharia de prompt e do design de ferramentas: acertar isso depende de prompts e design de ferramentas cuidadosos, boas heurísticas, observabilidade e ciclos de feedback curtos[^S1]. A retrospectiva tem uma frase ainda mais direta — eles focaram em um ciclo rápido de iteração com observabilidade e casos de teste[^S1].

Repare na metade dos “casos de teste”: a observabilidade não está aqui para substituir a trilha de avaliação. As duas são as pontas de uma mesma vara de carregar. A avaliação diz se esta execução quebrou e se a mudança melhorou as coisas. A observação diz por que esta execução quebrou e qual parte mudar.

As próximas cinco lições seguem nesta ordem:

- A **lição 2** assenta a base: registros brutos são a evidência de primeira mão. O que o agente diz sobre si mesmo não vale — o que ele omite costuma ser mais importante do que o que ele inclui.
- A **lição 3** transforma cada etapa em dado: logs estruturados e métricas. As mesmas métricas que o curso 10 usou para pontuar, este curso usa para diagnosticar.
- A **lição 4** costura registros espalhados em uma árvore: ler todas as requisições ao modelo e execuções de ferramenta disparadas por um mesmo prompt como uma unidade só, com as chamadas de subagentes aninhadas dentro do pai.
- A **lição 5** instala sondas nos pontos de verificação do ciclo de vida do loop e percorre o fluxo de localização sob não determinismo: encontrar a primeira divergência dentro de uma pilha de registros.
- A **lição 6** é mão na massa: instalar uma camada completa de observabilidade no harness que você escreveu no curso 7, rastreando de um sintoma que você “não consegue explicar” até a etapa específica que divergiu.

Esta lição apenas nomeia essas coisas, sem desdobrá-las: como ler registros é trabalho da lição 2, como projetar métricas é da lição 3, que estrutura um trace tem é da lição 4.

## Quando você não precisa da pilha completa

Nem todo agente precisa de tudo isso. Um script de uso único — roda uma vez, você bate o olho na saída, apaga — dar a ele logs, métricas e tracing é desperdício puro.

O critério de julgamento é simples: **o investimento em observabilidade deve ser proporcional a “quanto tempo você levaria para explicar o porquê depois que algo quebra”.** Se você mesmo roda, você mesmo acompanha, e não custa nada rodar de novo quando falha, não registre. Se outra pessoa usa, se roda por muito tempo, se você passaria meia jornada garimpando históricos de conversa quando falhar, registre desde o primeiro dia.

Há uma linha que não tem nada a ver com escala: se o agente pode tomar ações — escrever arquivos, enviar requisições, gastar dinheiro — não pule os testes. A natureza autônoma dos agentes implica custos mais altos e potencial de erros cumulativos. A recomendação é testar extensivamente em ambientes isolados (sandbox), junto com as devidas proteções[^S2].

Quanto a saber se você acertou: a chave do sucesso, como em qualquer recurso baseado em LLM, é medir o desempenho e iterar sobre as implementações[^S2]. E a pré-condição da medição é ter o que medir — o que fecha o laço com o que este curso está resolvendo.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: Um sintoma, três causas indistinguíveis

Sem código. Abaixo estão três sintomas que você encontraria em produção, cada um apresentado apenas com a informação visível do lado do usuário:

1. O relatório de pesquisa do agente cita um arquivo chamado `docs/pricing-2024.md`, mas esse arquivo não existe no repositório.
2. A mesma tarefa de arquivamento levou 12 turnos ontem e terminou. Hoje ela rodou até o turno 47 antes de parar, com aproximadamente o mesmo resultado.
3. O usuário pergunta “me ajuda a ver quantas vezes esse erro aparece na nossa base de código”, e o agente responde com uma longa explicação sobre o que o erro significa.

Para cada sintoma:

- Liste **pelo menos três** causas candidatas que sejam indistinguíveis vistas de fora.
- Para cada causa candidata, escreva “para confirmar que é esta e descartar as outras duas, preciso ver qual evidência” — seja específico até o nível de campo. “Olhar os logs” não é resposta.

<!-- rubric -->

- Cada sintoma tem pelo menos três causas candidatas, e elas caem em estágios diferentes (a decisão do modelo, a entrada e a saída da ferramenta, o fluxo de controle ou o tratamento de contexto do harness), não três reformulações da mesma causa.
- Cada causa candidata vem emparelhada com uma evidência específica o bastante para dizer “olhe em qual turno, qual registro, qual campo”, não respostas genéricas do tipo “olhe os logs”.
- Cada sintoma explica: quando você só tem a saída final, por que essas causas são indistinguíveis entre si — ou seja, explica por que a evidência de processo é inegociável.

<!-- answer -->

**Sintoma 1: o relatório cita um nome de arquivo inexistente**

- Estágio da decisão do modelo: as ferramentas de recuperação retornaram apenas arquivos reais, mas na hora de escrever o relatório o modelo confundiu nomes de arquivo ou inventou um seguindo as convenções de nomenclatura. Evidência — liste os parâmetros de toda chamada `read_file` / `read_doc` daquela execução e verifique se esse nome de arquivo apareceu alguma vez como parâmetro. Se nunca apareceu, foi fabricado durante a geração.
- Estágio de entrada/saída da ferramenta: a ferramenta de recuperação de fato retornou esse nome porque o índice foi construído três semanas atrás e o arquivo foi renomeado ou removido depois. Evidência — olhe o corpo bruto da resposta do `search` daquele turno e veja se ele carrega esse nome de arquivo.
- Estágio do fluxo de controle: ao ler o arquivo, a ferramenta lançou “não existe”, mas o harness engoliu a exceção e colocou apenas uma string vazia no `tool_result`, então o modelo seguiu com a suposição anterior. Evidência — verifique se o conteúdo do `tool_result` daquele turno está vazio e se ele carrega um marcador de erro.
- Por que são indistinguíveis: os três caminhos terminam no mesmo relatório contendo o mesmo nome de arquivo falso, e nenhum campo consegue separá-los.

**Sintoma 2: 12 turnos viraram 47 turnos**

- Estágio da decisão do modelo: os resultados de recuperação de hoje vieram mais fragmentados, então o modelo tentou formulações diferentes repetidas vezes. Evidência — liste o nome da ferramenta e os parâmetros de cada `tool_use` de cada turno e verifique se a mesma ferramenta foi chamada uma dúzia de vezes com redações diferentes.
- Estágio de entrada/saída da ferramenta: o tamanho de página ou o limite de retorno de alguma ferramenta mudou hoje, então ela não conseguiu trazer tudo de uma vez e precisou fazer várias viagens. Evidência — compare o tamanho do corpo da resposta e a contagem de chamadas da mesma ferramenta nos dois dias.
- Estágio do fluxo de controle: uma etapa falhou, então o agente trocou de galho e refez a primeira metade do trabalho. Evidência — alinhe as duas execuções pelo número do turno, encontre a **primeira** etapa divergente e olhe apenas a resposta da ferramenta daquele turno.
- Por que são indistinguíveis: os dois estados finais são “tarefa concluída, demorou um pouco mais”. A contagem de turnos é só um agregado; ela não diz onde os 35 turnos extras cresceram.

**Sintoma 3: respondeu à pergunta errada**

- Estágio da decisão do modelo: o modelo interpretou “aparece quantas vezes” como “o que isso significa”. Evidência — verifique se ele chamou a ferramenta de recuperação no turno 1 ou se simplesmente começou a gerar uma resposta.
- Estágio de entrada/saída da ferramenta: a ferramenta de recuperação deu erro ou retornou vazio, então o modelo recuou para responder a partir do seu conhecimento paramétrico. Evidência — o conteúdo do `tool_result` daquele turno e os marcadores de erro.
- Estágio de contexto: o histórico anterior a esse turno foi truncado ou comprimido, então o qualificador do usuário “na nossa base de código” não estava mais presente nas mensagens efetivamente enviadas. Evidência — olhe o `messages` enviado naquela requisição, não o que você achava que tinha enviado.
- Por que são indistinguíveis: nos três casos o usuário recebe um texto “fora do tema, mas de leitura fluida”. Para diferenciá-los você precisa ver tanto “o que entrou” quanto “o que voltou”.

<!-- hint -->

Prepare três gavetas para você mesmo: a decisão do modelo, a entrada e a saída da ferramenta, o fluxo de controle e o tratamento de contexto do harness. O mesmo sintoma costuma ter uma causa plausível em cada gaveta. Se as três causas caírem na mesma gaveta, você não saiu do seu primeiro reflexo.

<!-- hint -->

Ao escrever a evidência, force-se a chegar ao nível de campo: não “olhar os logs”, mas “olhar o conteúdo do `tool_result` daquele turno e se ele foi marcado como erro”. Se você não consegue chegar ao nível de campo, é sinal de que ainda não descobriu o que deixar nos registros — que é exatamente o que as lições 2 e 3 vão te fazer praticar na mão.

### Nível 2: Desmonte o fluxo de depuração tradicional etapa por etapa

Sem código. Abaixo está o fluxo de depuração em quatro etapas que todo engenheiro de backend conhece:

```text
1 Reproduzir      Rodar o bug localmente com a mesma entrada
2 Pôr breakpoint  Parar na linha suspeita
3 Avançar passo   Ir linha a linha, ver quando as variáveis estragam
4 Corrigir e verificar  Mudar e rodar de novo; verde significa corrigido
```

Para cada etapa, responda a duas perguntas:

- Por que ela falha com agentes? Fundamente o motivo em mecanismos específicos (não determinismo, divergência de trajetória, evidência escondida ou nunca registrada).
- Qual é a substituição correspondente no mundo dos agentes? Escreva só a direção — “que evidência obter, organizada por qual dimensão” — a implementação concreta é trabalho das lições seguintes.

<!-- rubric -->

- As quatro etapas são tratadas individualmente, cada uma com o porquê da falha e a direção de substituição escritas, incluindo a facilmente pulada etapa 4, “corrigir e verificar”.
- O motivo da falha está fundamentado em mecanismos específicos (não determinismo entre execuções, uma etapa que falha causando divergência de toda a trajetória, camadas de abstração ou registros ausentes escondendo a evidência), não em afirmações vagas como “porque modelos são incertos”.
- A direção de substituição diz “que evidência obter e como organizá-la”, não “instale o produto de observabilidade X”. Dar a direção sem desdobrar detalhes de implementação também conta como aprovado.

<!-- answer -->

**Etapa 1: Reproduzir**

Motivo da falha: agentes são não determinísticos entre execuções, mesmo com prompts idênticos. Mesmo com pontos de partida idênticos, eles podem tomar caminhos completamente diferentes e válidos para alcançar o objetivo. Você roda dez vezes localmente e provavelmente nunca vai percorrer o caminho que a execução que falhou percorreu.

Direção de substituição: abandone o objetivo de “rodar de novo” e faça a execução que falha registrar seu processo enquanto ele acontece. A evidência a obter são as requisições ao modelo e as idas e voltas de ferramenta completas daquela execução — que é o conteúdo da lição 2.

**Etapa 2: Pôr breakpoint**

Motivo da falha: breakpoints ficam em linhas de código, mas o lugar onde os agentes erram muitas vezes não é o seu código — é uma decisão do modelo. E o loop pode rodar dezenas de turnos; você não sabe em qual turno pausar. Se você ainda estiver usando um framework que embrulha prompts e respostas sob camadas de abstração, nem localizar qual linha olhar você consegue.

Direção de substituição: troque “pausar em uma linha” por “gravar um registro por etapa” e depois filtre por um identificador de correlação para puxar todos os registros pertencentes a um mesmo prompt. Onde exatamente pendurar as sondas no ciclo de vida do loop é conteúdo das lições 3 e 5.

**Etapa 3: Avançar passo a passo**

Motivo da falha: avançar passo a passo pressupõe que as mudanças de estado são locais e previsíveis. Mas agentes têm estado e os erros se acumulam; uma etapa que falha pode fazer a trajetória inteira divergir. A etapa 5 que você percorre manualmente provavelmente não é a mesma coisa que a etapa 5 da execução que falhou.

Direção de substituição: não leia uma execução como uma sequência linear de comandos; leia-a como uma árvore — todas as requisições ao modelo e execuções de ferramenta disparadas por um mesmo prompt agrupadas, com a atividade dos subagentes aninhada dentro do pai. O que você procura não é “qual linha estava errada”, e sim **a primeira divergência**: a partir de qual etapa esta execução ficou diferente da bem-sucedida. Como montar a árvore é conteúdo da lição 4; o fluxo de encontrar a divergência está na lição 5.

**Etapa 4: Corrigir e verificar**

Motivo da falha: uma execução verde não significa que está corrigido, porque a próxima execução pode tomar outro caminho. E mudanças pequenas cascateiam em grandes mudanças de comportamento; um pequeno ajuste no agente principal pode alterar de forma imprevisível os subagentes. Olhar só este caso ficando verde facilita confundir “desta vez ele não caiu naquele galho” com “corrigido”.

Direção de substituição: depois da mudança, volte ao conjunto de avaliação e rode em lote (o sistema do curso 10 desta série), acompanhando ao mesmo tempo se a distribuição de comportamento nos dados de observabilidade se moveu — contagem de chamadas de ferramenta, contagem de turnos, taxas de erro. A avaliação responde “as coisas melhoraram no geral”; a observação responde “o motivo da melhora foi o que eu achei que era”.

<!-- hint -->

Nas quatro etapas tradicionais, cada uma depende secretamente de uma pré-condição: reproduzir depende de “a mesma entrada precisa percorrer o mesmo caminho”, breakpoint depende de “o problema está em alguma linha de código”, avançar passo a passo depende de “as mudanças de estado são locais”, verificar depende de “passar uma vez significa passar”. Escreva essas quatro pré-condições literalmente primeiro, depois pergunte uma por uma se cada uma ainda vale para agentes.

<!-- hint -->

A direção de substituição não precisa ser escrita como plano de implementação. “Preciso de um registro completo das idas e voltas alinhado por turno” é uma resposta aprovada. “Preciso agrupar todas as requisições disparadas pelo mesmo prompt” também. Como concretizar isso é trabalho das lições seguintes; este exercício só testa se você consegue articular o requisito com clareza.

<!-- /exercises -->

## Recapitulação

- Um único sintoma visível ao usuário costuma esconder várias causas completamente indistinguíveis vistas de fora. Quando usuários relatam que os agentes estão “not finding obvious information” (não encontrando informação óbvia), você não consegue dizer se são consultas de busca ruins, seleção de fontes ruim ou falhas de ferramenta[^S1].
- A trilha de avaliação responde “quebrou?”. Este curso usa um enquadramento que ele mesmo cunhou para esclarecer a divisão de trabalho: a verificação diz se quebrou, a observabilidade diz por quê. Sustentando isso há duas experiências reais — adicionar tracing completo em produção permitiu diagnosticar falhas e corrigir sistematicamente[^S1], e ler transcrições brutas ajuda a sondar por que os agentes chamam ou deixam de chamar determinadas ferramentas[^S3].
- “Reproduzir e colocar um breakpoint” falha porque agentes tomam decisões dinâmicas e são não determinísticos entre execuções, mesmo com prompts idênticos[^S1]. Sistemas determinísticos dão a mesma saída para a mesma entrada; agentes, como sistemas não determinísticos, não garantem isso[^S3]. A suposição da avaliação tradicional — “entrada X segue caminho Y produz saída Z” — também não se sustenta. Pontos de partida idênticos podem produzir caminhos completamente diferentes e válidos[^S1].
- Os formatos de erro dos agentes diferem dos bugs tradicionais: no software tradicional, bugs quebram um recurso, mas em sistemas agênticos mudanças pequenas cascateiam em grandes mudanças de comportamento, tornando notavelmente difícil escrever código para agentes complexos que precisam manter estado[^S1]. Uma única etapa que falha pode fazer o agente explorar trajetórias inteiramente diferentes, levando a resultados imprevisíveis[^S1]. Agentes têm estado e os erros se acumulam, então você precisa executar de forma durável e tratar erros pelo caminho[^S1]. Sistemas multiagentes também têm comportamentos emergentes — pequenas mudanças no agente líder podem alterar de forma imprevisível o comportamento dos subagentes; o que você precisa entender são os padrões de interação, não apenas os indivíduos[^S1]. A versão inicial já chegou a abrir 50 subagentes para consultas simples, vasculhar a web sem fim atrás de fontes inexistentes e se distrair mutuamente com atualizações em excesso[^S1].
- Camadas de abstração escondem a evidência: frameworks frequentemente criam camadas extras de abstração que podem obscurecer os prompts e as respostas subjacentes, tornando-os mais difíceis de depurar[^S2]. O conselho é começar direto pelas APIs de LLM e, se usar um framework, entender o código por baixo[^S2]. Seu harness escrito à mão não tem obstrução, mas também não tem retenção.
- O caminho adiante é tratar observabilidade e ciclos de feedback curtos como requisitos de primeira categoria[^S1], montados em um ciclo rápido de iteração com observabilidade e casos de teste[^S1]. As próximas cinco lições, em sequência: registros brutos, logs e métricas, traces, hooks e fluxo de localização, instalação mão na massa.
- Julgamento de escopo: scripts de uso único não precisam da pilha completa. Mas se o agente pode tomar ações, teste extensivamente em ambientes isolados (sandbox), com as devidas proteções[^S2]. Saber se você acertou depende de medir o desempenho e iterar sobre as implementações[^S2].

[Lição 2 >>](./02-transcripts-as-evidence.md)
