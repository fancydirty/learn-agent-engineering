# Lição 2: O que verificar: estado final primeiro, processo como rede de segurança

> Objetivos de aprendizado:
> - Entender por que “gravar as etapas corretas e depois conferi-las uma a uma” está fadado a julgar agentes de forma errada, e trocar isso pela avaliação de estado final
> - Para fluxos complexos, identificar alguns checkpoints de verificação discretos que confirmam que “as mudanças de estado esperadas aconteceram”, em vez de validar cada etapa
> - Transformar um requisito vago em critérios de sucesso mensuráveis, alcançáveis e multidimensionais, e saber até onde levar as asserções de trajetória
>
> Pré-requisitos: concluir a Lição 1, saber que sem uma verificação que rode você vira o loop de verificação | Anterior: [Lição 1 <<](./01-looks-done-vs-is-done.md) | Próxima: [Lição 3 >>](./03-deterministic-checks.md)

## Três execuções, três veredictos de “reprovado”

Você decide adicionar verificação ao seu agente. O primeiro impulso é quase universal: gravar a “abordagem padrão”. Rodar a tarefa na mão uma vez, anotar cada etapa — a etapa 1 deveria chamar `search`, a etapa 2 deveria chamar `fetch_page`, a etapa 3 deveria chamar `write_note` — e salvar isso como gabarito. Dali em diante, toda vez que o agente rodar, comparar a sequência de chamadas dele com essa resposta, etapa por etapa. Uma divergência e é reprovado.

Você roda três vezes. Três reprovações.

Você olha as saídas: três resumos, fatos corretos, fontes confiáveis, todos os ângulos pedidos cobertos. A única diferença foi o caminho — a primeira execução buscou em três fontes e isso bastou, a segunda buscou em dez, a terceira consultou definições de terminologia antes de buscar. É exatamente isso que a Anthropic observou no próprio sistema multiagente de pesquisa: mesmo com pontos de partida idênticos, agentes podem tomar caminhos completamente diferentes, mas válidos, para chegar ao objetivo, um buscando em três fontes enquanto outro busca em dez, ou usando ferramentas diferentes para achar a mesma resposta[^S2].

O que falhou não foi o agente. Foi o seu método de verificação.

## Você não sabe de verdade quais são as “etapas corretas”

A avaliação tradicional carrega uma premissa padrão enterrada bem fundo: dada a entrada X, o sistema deveria seguir o caminho Y e produzir a saída Z — as mesmas etapas toda vez[^S2]. Essa premissa vale de forma tão natural para sistemas determinísticos que a maioria das pessoas nunca percebe que ela é uma premissa. Agentes a derrubam de imediato.

O que é de fato desconfortável não é só “o caminho vai variar” — é esta frase:

> "Because we don’t always know what the right steps are, we usually can't just check if agents followed the “correct” steps we prescribed in advance. Instead, we need flexible evaluation methods that judge whether agents achieved the right outcomes while also following a reasonable process."[^S2]
>
> (Como nem sempre sabemos quais são as etapas certas, em geral não dá para simplesmente checar se os agentes seguiram as etapas “corretas” que prescrevemos de antemão. Em vez disso, precisamos de métodos de avaliação flexíveis que julguem se os agentes alcançaram os resultados certos e, ao mesmo tempo, seguiram um processo razoável.)

“Nem sempre sabemos quais são as etapas certas” — essa é a chave. O caminho que você gravou não é o único caminho correto. Ele é apenas **o caminho que você por acaso tomou** naquela vez. Você o elevou a gabarito, então toda outra abordagem virou erro.

Repare na segunda metade: “e, ao mesmo tempo, seguiram um processo razoável”. Isso não significa ignorar o processo por completo. Significa não usar um caminho fixo como régua.

## Avaliação de estado final: julgue resultados, não o fluxo

A abordagem da Anthropic é direta: foque na avaliação de estado final, e não na análise turno a turno — não julgue se o agente seguiu um processo específico, julgue se ele alcançou o estado final correto[^S2]. Essa abordagem reconhece que agentes podem achar caminhos alternativos para o mesmo objetivo, garantindo ainda assim que entreguem o resultado pretendido[^S2].

Primeiro, uma definição em linguagem simples de “estado final”: depois que a tarefa termina, o estado que você consegue observar no ambiente e verificar depois do fato. Quais arquivos apareceram no sistema de arquivos, que valores os campos daquele registro do banco têm agora, qual etiqueta o chamado carrega, se o JSON retornado tem `status: "resolved"`.

Um teste decisivo útil: estado final é um **substantivo**, não um verbo. “Chamou `rename_file`” é verbo; “todos os nomes de arquivo batem com determinado formato” é substantivo. A verificação só aceita substantivos.

```text
Tarefa: renomear os PDFs de faturas em downloads/ para "data_fornecedor.pdf"

Verificação por etapas (frágil)        Verificação de estado final (estável)
1. Chamar list_files                   downloads/ não tem mais nenhum nome original
2. Chamar read_pdf para cada um        Cada nome bate com ^\d{8}_[a-z0-9-]+\.pdf$
3. Chamar extract_date                 A contagem de arquivos bate com a de antes, nada perdido nem criado
4. Chamar rename_file para cada um     As datas dos nomes batem com as datas das faturas no conteúdo do PDF
```

A coluna da esquerda falha no instante em que o agente usa uma leitura em lote em vez de quatro leituras individuais, mesmo que os resultados sejam idênticos. A coluna da direita não se importa com como ele lê — porque ela descreve “como downloads/ está agora”, sem relação com o caminho que levou até lá.

Há um ponto fácil de perder ao escrever asserções de estado final: **escreva também o que não deveria mudar**. Aquela linha de “a contagem de arquivos bate com a de antes” é um exemplo. Se o agente renomear dois arquivos para o mesmo nome e o segundo sobrescrever o primeiro, a verificação de “todos os nomes são válidos” passa numa boa. Asserções de estado final precisam proteger dos dois lados: “as mudanças esperadas aconteceram” e “as inesperadas não aconteceram”.

## Fluxos complexos: divida a avaliação em checkpoints

Avaliação de estado final não é “ignorar o processo por completo”. A frase seguinte na fonte dá uma saída: para fluxos complexos, quebre a avaliação em checkpoints discretos onde mudanças de estado específicas deveriam ter ocorrido, em vez de tentar validar cada etapa intermediária[^S2].

Repare na formulação — “mudanças de estado específicas deveriam ter ocorrido”, continua sendo estado, continuam sendo substantivos. Só se moveu o ponto de observação da “linha de chegada” para “alguns pontos ao longo do caminho”.

> **Aviso de colisão de termos**: o “checkpoint” do Curso 9 desta série significa **salvar contexto** — gravar em disco o estado de execução do agente para que ele possa retomar dali depois de uma queda, com finalidade de recuperação. O “checkpoint” desta lição significa **verificar estado** — confirmar que as mudanças de estado esperadas aconteceram em um ponto do fluxo, com finalidade de validação. As posições muitas vezes se sobrepõem (é natural verificar no mesmo lugar em que você grava o checkpoint), mas eles resolvem problemas diferentes. Misturá-los na discussão gera confusão, então daqui em diante vamos chamar estes de “checkpoints de verificação” e os do Curso 9 de “checkpoints de recuperação”.

Para saber quando vale a pena adicionar um checkpoint de verificação, olhe três coisas:

- **Fluxo longo, estado final distante demais do início**. Quando falha, você só sabe que “não chegou ao fim”, não onde o desvio começou.
- **Operações irreversíveis**. E-mails enviados, estoque baixado, arquivos sobrescritos — quando o estado final revela o erro, já é tarde.
- **A saída intermediária é a base das etapas seguintes**. O script de migração cria a tabela e depois carrega os dados; estrutura de tabela errada significa que todo dado carregado é lixo, e o custo de refazer se multiplica.

Se nenhuma dessas se aplica, não adicione.

Onde colocá-los: nas **posições em que o estado sofre mudança substantiva**, não depois de cada chamada de ferramenta.

```text
Tarefa: migrar a tabela de usuários do schema antigo para o schema novo

Checkpoint de verificação 1 (depois da criação da tabela): a tabela new_users existe, as colunas batem exatamente com o schema alvo
Checkpoint de verificação 2 (depois da carga de dados): contagem de linhas de new_users == contagem de linhas de old_users, sem chaves primárias duplicadas
Estado final: a aplicação lê a tabela nova e passa no smoke test (a verificação mais básica de “roda?”), old_users renomeada para old_users_backup

O que não verificamos: se ele escreveu CREATE TABLE ou copiou de um template,
se carregou tudo de uma vez ou em lotes, quantos lotes, quantas linhas por lote.
```

Dois checkpoints, um estado final. Três asserções governam a migração inteira. Se você fosse de “validar cada etapa intermediária”, esse fluxo poderia gerar dezenas de asserções, a maioria penalizando diferenças legítimas de implementação.

## Pare aqui: o que há de errado nesta proposta

```agentmentor-check
{
  "id": "vq-zh-02-endstate-vs-steps",
  "label": "Gravar e reproduzir como padrão de verificação?",
  "prompt": "Um colega propõe: escolher uma execução especialmente limpa, gravar a sequência completa de chamadas de ferramenta dela como gabarito, e depois de cada execução futura comparar a nova sequência com ela, etapa por etapa — qualquer coisa que não bata é reprovada. Ele diz que isso é o mais rigoroso porque “nenhuma etapa fica sem ser conferida”. Qual é o problema fundamental dessa proposta?",
  "whyHere": "Você acabou de ler a regra “avalie o estado final, não turno a turno”. A regra em si soa simples, mas diante de uma proposta concreta é fácil se deixar levar pela intuição de que “gravar é mais rigoroso” — teste isso aqui primeiro.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Gravar e reproduzir em si está ok; o problema é que a execução gravada pode não ser a ideal. Rode várias rodadas, escolha a mais limpa para gravar e está resolvido.",
      "correct": false,
      "feedback": "Trocar qual execução você grava não corrige a questão central: por mais limpo que seja o caminho gravado, ele continua sendo apenas um caminho. Mesmo com pontos de partida idênticos, agentes podem tomar caminhos completamente diferentes, mas válidos — um busca em três fontes, outro busca em dez[^S2]. “Um gabarito melhor” não resolve “não deveria haver um gabarito único”."
    },
    {
      "id": "b",
      "text": "Uma sequência única é rígida demais. Grave vários caminhos válidos para formar uma lista de permitidos; desde que a execução bata com algum caminho da lista, ela passa.",
      "correct": false,
      "feedback": "Isso é mais frouxo do que um caminho único, mas a direção continua errada. Caminhos válidos não têm limite superior; a lista de permitidos nunca vai ficar completa. Toda vez que o agente encontra uma abordagem correta nova você tem que voltar e adicionar mais uma entrada — você está mantendo uma lista que tem garantia de estar incompleta, e ela não consegue pegar as falhas do tipo “o caminho está na lista, mas o resultado está errado”."
    },
    {
      "id": "c",
      "text": "Ela trata “consistência de processo” como substituto de “correção do resultado”. Mas você nem sempre sabe quais são as etapas corretas, então em geral não dá para checar se o agente seguiu as etapas que você prescreveu; o que você deveria checar é se ele alcançou o estado final correto e seguiu um processo razoável.",
      "correct": true,
      "feedback": "Correto. Esse é exatamente o julgamento da fonte: como nem sempre sabemos quais são as etapas certas, em geral não dá para simplesmente checar se os agentes seguiram as etapas “corretas” prescritas; precisamos de métodos de avaliação flexíveis que julguem se eles alcançaram os resultados certos e, ao mesmo tempo, seguiram um processo razoável[^S2]. A comparação etapa por etapa tem dois erros de julgamento fatais: caminho diferente, resultado correto — reprovação falsa; mesmo caminho, resultado errado — aprovação falsa."
    }
  ]
}
```

## Como definir critérios de sucesso: mensuráveis, alcançáveis, multidimensionais

Aquelas três palavras, “estado final correto”, precisam pousar em números concretos ou julgamentos claros; caso contrário você só deu a volta e voltou para o “parece certo”. A documentação oficial dá dois requisitos duros para critérios de sucesso:

- **Mensurável**: use métricas quantitativas ou escalas qualitativas bem definidas (uma escala é um checklist de rubrica de pontuação; como escrever uma é conteúdo da Lição 4). Números trazem clareza e escalabilidade, mas medidas qualitativas podem ser valiosas se aplicadas de forma consistente junto com as quantitativas[^S5].
- **Alcançável**: baseie suas metas em benchmarks do setor, experimentos anteriores, pesquisa de IA ou conhecimento de especialistas. Suas métricas de sucesso não deveriam ser irrealistas para as capacidades atuais dos modelos de fronteira[^S5].

E mais uma: a maioria dos casos de uso precisa de avaliação multidimensional ao longo de vários critérios de sucesso[^S5].

O exemplo completo da documentação oficial é uma frase só (as anotações entre parênteses são do original):

> "The sentiment analysis model should achieve an F1 score of at least 0.85 (Measurable, Specific) on a held-out test set* of 10,000 diverse Twitter posts (Relevant), which is a 5% improvement over the current baseline (Achievable)."[^S5]
>
> (O modelo de análise de sentimento deveria alcançar uma pontuação F1 de pelo menos 0,85 (mensurável, específico) em um conjunto de teste de holdout* de 10.000 posts variados do Twitter (relevante), o que representa uma melhora de 5% sobre o baseline atual (alcançável).)

Vale desmontar essa frase, porque cada componente bloqueia um modo de falha específico:

| Componente | O que ele bloqueia |
| --- | --- |
| Pontuação F1 | Bloqueia o “parece estar por aí”. F1 (média harmônica de precisão e recall, de 0 a 1) é um número calculável; duas pessoas têm que chegar ao mesmo resultado |
| Pelo menos 0,85 | Bloqueia mudar o alvo depois do fato. Defina o que é “passar” depois de rodar e sempre passa |
| 10.000 posts | Bloqueia resultados por coincidência vindos de amostras pequenas demais. Essa é a escala do exemplo oficial, não um limiar universal |
| Conjunto de teste de holdout | Bloqueia ajustar contra o conjunto de avaliação — pontuação alta em questões já vistas não vale |
| Posts variados do Twitter | Bloqueia parecer bom só em amostras limpas e desmoronar quando chega a distribuição real |
| 5% acima do baseline | Bloqueia metas irrealistas. Ancora em níveis já alcançados, não em desejo |

Essa última linha é o método concreto para “alcançável”: o limiar não é deduzido de trás para frente a partir do desejo; ele é um passo pequeno adiante do estado atual. Se você não tem baseline, rode uma versão da implementação mais ingênua possível e use a pontuação dela como baseline. Quando você nem consegue rodar um baseline, não tenha pressa de fixar números.

Há uma pergunta ainda mais anterior. Quando a Anthropic descreve cenários adequados a agentes, ela diz: agentes agregam mais valor em tarefas que exigem tanto conversa quanto ação, **têm critérios de sucesso claros**, **permitem loops de feedback** e integram supervisão humana significativa[^S1]. Leia ao contrário — se você não consegue escrever critérios de sucesso para esta tarefa de jeito nenhum, o problema não é a etapa de verificação; esta tarefa não deveria ter sido entregue inteira ao agente para rodar sozinho. Se você não consegue escrever critérios, vai ter que acompanhar tudo — como a Lição 1 disse, nesse ponto você vira o loop de verificação.

## Asserções de trajetória: pode adicionar, mas não engesse

A avaliação de estado final pega “o resultado está correto”, mas ela deixa passar uma classe de problema: o agente de fato reconhece aquela ferramenta nova que você deu a ele?

A documentação oficial dá um acréscimo opcional: para cada par prompt-resposta, você pode opcionalmente especificar também as ferramentas que espera que um agente chame para resolver a tarefa, para medir se os agentes conseguem ou não captar o propósito de cada ferramenta durante a avaliação[^S3]. Isso é asserção de trajetória — não julga ordem, não julga contagem, julga apenas se certas ferramentas apareceram na trajetória.

Quando ela é útil: você acabou de adicionar uma ferramenta `search_internal_docs` e quer que o agente a use para perguntas sobre processos internos. Mas ele sai buscando na web pública, acha uma resposta suficientemente parecida, e a validação de estado final continua passando. Só a trajetória enxerga essa diferença.

O limite está escrito na frase logo seguinte: como pode haver múltiplos caminhos válidos para resolver tarefas corretamente, tente evitar especificar demais ou se sobreajustar a estratégias[^S3].

Fronteiras concretas:

- Afirme apenas “o conjunto contém”, não ordem, não contagem
- Liste apenas uma ou duas ferramentas com que você de fato se importa; não copie a sequência inteira para dentro — isso é gravar-e-reproduzir de novo
- Asserção de trajetória falha mas o estado final passa: registre uma observação, não reprove a avaliação inteira
- É um acréscimo opcional, não o padrão. O padrão continua sendo o estado final[^S2]

```javascript
// Forma de um caso de eval: o julgamento de estado final é obrigatório, a asserção de trajetória é opcional
const evalCase = {
  id: 'invoice-rename-003',
  prompt: 'Renomeie as faturas deste mês em downloads/ para data_fornecedor.pdf',
  // Obrigatório: verificar no que o ambiente se transformou depois da execução (como escrever isso, na Lição 3)
  checkEndState: async (env) => { /* ... */ },
  // Opcional: espera-se que tenha tocado ao menos nestas ferramentas, independente de ordem ou contagem de chamadas
  expectedTools: ['read_pdf', 'rename_file'],
};
```

## Além da taxa de aprovação: o que mais registrar

Depois de uma rodada de eval, se você só recebe uma taxa de aprovação, vai se ver sem nada a dizer — o que significa 78%? Você deveria ajustar o prompt a seguir, ou as ferramentas?

A documentação oficial recomenda coletar estas métricas além da acurácia de topo: o tempo total de execução de chamadas de ferramenta individuais e de tarefas, o número total de chamadas de ferramenta, o consumo total de tokens e os erros de ferramenta[^S3]. Essas métricas não participam do julgamento; elas participam do **diagnóstico**.

A documentação oficial dá duas leituras:

- Muitas chamadas de ferramenta redundantes podem sugerir que vale redimensionar os parâmetros de paginação ou de limite de tokens[^S3]
- Muitos erros de ferramenta por parâmetros inválidos podem sugerir que as ferramentas se beneficiariam de descrições mais claras ou exemplos melhores[^S3]

O que essas duas têm em comum: elas apontam o dedo para o **desenho da ferramenta**, não para o modelo. Muitas chamadas redundantes normalmente significam que a ferramenta só consegue trazer 20 itens por vez, então o agente tem que paginar por dez páginas; muitos erros de parâmetro normalmente significam que a descrição da ferramenta não explicou em que formato aquele campo precisa vir. Esses problemas têm raiz no lado da ferramenta — só acrescentar “chame menos vezes” ou “escreva os parâmetros com cuidado” ao prompt de sistema normalmente não funciona; você tem que ajustar o desenho dos parâmetros e a descrição da ferramenta.

Puxando esse fio, aparecem mais algumas (as de baixo não são endossadas oficialmente, são julgamentos de engenharia extrapolados das duas acima — verifique nos seus próprios dados): taxa de aprovação inalterada mas consumo de tokens dobrado significa que essa mudança não é de graça; uma categoria de tarefas com variância de duração especialmente grande provavelmente esconde retentativas ou giro em falso; erros concentrados em uma ferramenta, olhe primeiro para aquela ferramenta, não desconfie do prompt.

Uma rodada de eval deveria despejar pelo menos estas colunas; a Lição 6, ao construir o harness de eval, vai usá-las direto (para economizar largura de coluna, os tokens de entrada e saída serão fundidos em um só):

```text
case_id | passed | duration_ms | tool_calls | tokens_in | tokens_out | tool_errors
```

## Limites: três coisas que não se deve fazer

**Um: não tente validar cada etapa intermediária**[^S2]. Este é o limite mais fácil de romper nesta lição, porque a intuição de que “verificar mais é mais seguro” é muito forte. O resultado real é o oposto: quanto mais finas as asserções, mais diferenças legítimas são penalizadas, mais ruidoso fica o eval, até você começar a ignorar o vermelho — e nesse ponto ele é completamente inútil.

**Dois: não faça das asserções de trajetória o padrão**. Adicionar uma asserção de trajetória é tão barato que você escreve mais uma entrada de `expectedTools` sem esforço nenhum. Na décima entrada você já está prescrevendo estratégia de forma substantiva, só formalmente ainda chamando aquilo de “asserção”. Toda vez que você adicionar uma, pergunte a si mesmo: a saída vai realmente quebrar se esta ferramenta não for chamada? Se a resposta for “não necessariamente”, não adicione.

**Três: não defina limiares depois da execução**. Olhar uma pontuação de 0,82 e dizer “0,8 deve bastar”, e olhar 0,86 e dizer “tem que ser 0,85”, são o mesmo autoengano. Defina limiares antes da execução, e anote a justificativa.

## 💻 Exercícios

<!-- exercises -->

### Nível 1: escreva estados finais para quatro tarefas (sem código)

Para as quatro tarefas abaixo, escreva para cada uma: (1) qual **estado final** você está verificando; (2) se vale adicionar checkpoints de verificação, onde, e por quê.

1. **Renomeação em lote**: renomear 200 PDFs em `invoices/` para “AAAAMMDD_fornecedor.pdf”
2. **Pesquisar e escrever um resumo**: pesquisar as estratégias de preço de três concorrentes, escrever um resumo com citações
3. **Corrigir um teste que falha**: `user.spec.ts` tem um teste `should reject expired token` falhando; peça ao agente que corrija
4. **Classificar e etiquetar chamados**: etiquetar os 500 chamados da semana passada como “cobrança / indisponibilidade / pedido de funcionalidade / outros”

<!-- rubric -->

Rubrica:

- Os estados finais das quatro tarefas estão escritos como “estado que você consegue verificar no ambiente depois da execução”, são substantivos e não verbos, não misturam descrições de etapa do tipo “a etapa N deveria chamar tal ferramenta”; e ao menos uma tarefa escreve asserções do tipo “o que não deveria mudar não mudou”
- Cada tarefa tem um julgamento claro de “adicionar / não adicionar checkpoint de verificação”, com raciocínio ancorado no comprimento do fluxo, na existência de operações irreversíveis, ou na dependência de etapas seguintes em relação a saídas intermediárias — e não em “mais seguro ser minucioso”
- Onde checkpoints de verificação foram adicionados, eles descrevem “uma mudança de estado específica deveria ter ocorrido”, e cada tarefa tem no máximo dois ou três, sem escorregar para validação etapa por etapa

<!-- answer -->

Resposta de referência:

**1. Renomeação em lote**

Estado final: a contagem de arquivos em `invoices/` bate com a de antes da execução; todo nome de arquivo bate com `^\d{8}_[a-z0-9-]+\.pdf$`; por amostragem, as datas dos nomes batem com as datas das faturas no conteúdo do PDF; o conjunto de todos os hashes de conteúdo de arquivo antes e depois é idêntico (isso protege o “o que não deveria mudar não mudou” — renomear não deveria alterar conteúdo nem perder arquivos por sobrescrita de nome igual).

Checkpoint de verificação: necessário. Renomear é uma operação irreversível que sobrescreve; o segundo critério se aplica diretamente. A abordagem é mudar **as entregas** para dois itens: primeiro produzir um arquivo completo de mapeamento `nome_antigo → nome_novo` (algo como `rename-map.json`), depois executar as renomeações. O checkpoint de verificação fica em “arquivo de mapeamento gerado, renomeações ainda não executadas” — nesse ponto a mudança de estado esperada é “o arquivo de mapeamento existe”; verifique que ele cobre os 200 arquivos, que os nomes novos não colidem entre si, que todos os formatos são válidos; e pare antes que qualquer arquivo seja sobrescrito, se algo estiver quebrado. Note que isso muda o que a tarefa entrega (um arquivo de mapeamento a mais como saída intermediária), não prescreve o caminho interno dela: como ele lê os PDFs, como extrai as datas, o que calcula primeiro — continua sem importar em nada.

**2. Pesquisar e escrever um resumo**

Estado final: as faixas de preço dos três concorrentes aparecem no resumo; toda alegação factual tem citação; o link de toda citação abre e o conteúdo de fato sustenta aquela alegação; as partes sem preço público estão explicitamente escritas como “não foi encontrado preço público”, e não com números inventados. Alguns desses estados finais são testáveis programaticamente (alcançabilidade dos links, se os três aparecem, se cada parágrafo tem ao menos uma citação); outros exigem humanos ou um juiz (se as citações de fato sustentam a afirmação) — conteúdo da Lição 3 e da Lição 4, respectivamente.

Checkpoint: não necessário. O fluxo é longo, mas cada etapa é reversível (buscar errado e buscar de novo não custa nada), e as saídas intermediárias não são base para etapas posteriores. Se você fizer questão de adicionar um, coloque um checkpoint de verificação em “lista de fontes coletada, redação ainda não começou”, checando que cada um dos três tem ao menos uma fonte — omissões de empresa inteira saem mais barato quando pegas cedo.

**3. Corrigir um teste que falha**

Estado final: o caso que estava falhando agora passa; os outros casos da suíte de testes inteira continuam passando (não quebrou um para consertar outro); o próprio `user.spec.ts` não foi modificado. Este último impede que ele mude a asserção em vez da implementação — se a tarefa permitir explicitamente mudar testes, troque por “modificações em arquivo de teste exigem revisão humana”.

Checkpoint: não necessário. Esta é a mais confortável das quatro: o estado final é ele próprio um comando que produz passa/falha; uma execução te dá a resposta; inserir checkpoints no meio é puro excesso.

**4. Classificar e etiquetar chamados**

Estado final: todos os 500 etiquetados, sem omissões, sem valores nulos; todos os valores de etiqueta caem dentro dos quatro valores permitidos, fora disso é erro; em uma amostra de holdout etiquetada por humanos, a acurácia ou o F1 por classe alcança o limiar definido de antemão; a distribuição entre as quatro classes não desmorona de forma óbvia (como 480 etiquetados como “outros” — a acurácia total pode até parecer boa, mas isso deveria acender um alarme mesmo assim).

Checkpoint: depende do método de gravação. Se estiver gravando no banco um a um (parcialmente irreversível), adicione um checkpoint na posição “primeiros 50 etiquetados”, verifique que os valores de etiqueta são legais e que a distribuição não é absurda, e pare cedo se algo estiver quebrado; se ele produzir primeiro o resultado completo de etiquetagem e só depois gravar no banco em lote, essa saída intermediária já é por si só uma posição natural de checkpoint, sem necessidade de um extra.

<!-- hint -->

Dica 1: para julgar se o que você escreveu é estado final, use a régua “substantivo ou verbo”. “Chamou `rename_file`” é verbo; “todos os nomes de arquivo batem com determinado formato” é substantivo. A verificação só aceita substantivos.

<!-- hint -->

Dica 2: para decidir se adiciona checkpoints de verificação, olhe só três coisas — o quão longo é o fluxo, se há ações irreversíveis, se etapas posteriores vão usar saídas intermediárias como base. Se nenhuma se aplica, não adicione; adicioná-los só deixa os evals ruidosos.

### Nível 2: reescreva um requisito vago como critérios de sucesso multidimensionais (sem código)

O requisito original é uma frase: “Me ajuda a organizar as anotações das reuniões desta semana, as citações têm que ser confiáveis.”

Reescreva isso como critérios de sucesso **multidimensionais** e mensuráveis. Para cada dimensão escreva os quatro itens: como a métrica se chama, como medi-la, qual limiar, **por que aquele limiar é realisticamente alcançável**. Depois decida quais dimensões verificam estado final e quais definem checkpoints intermediários, com raciocínio. Ao menos três dimensões. Não precisa de código.

<!-- rubric -->

Rubrica:

- Ao menos três dimensões, cada uma com os quatro itens “métrica / como medir / limiar / justificativa do limiar” escritos por completo; faltar qualquer um deles é incompleto; e essas dimensões não se sobrepõem de forma substantiva, cada uma bloqueando modos de falha diferentes
- Os limiares não são tirados do nada: ancorados no baseline atual, no desempenho humano na mesma tarefa, ou em observações de uma rodada de teste em pequena escala[^S5]; qualquer dimensão fixada em 100% explica por que ela é puramente mecânica de checar e por que uma falha do modelo significa apenas rodar de novo, sem usar “100%” como slogan
- Marca qual método cada dimensão usa para pontuar (viável programaticamente / precisa de humano ou juiz), e deixa claro quais dimensões verificam estado final e quais definem checkpoints intermediários, com raciocínio

<!-- answer -->

Resposta de referência:

Primeiro, desmonte a palavra “confiáveis”. Ela mistura ao menos três coisas diferentes: se o formato da citação está correto, se aquilo para o que a citação aponta existe, se a citação de fato sustenta aquela alegação. Sem desmontar, você não consegue definir limiares separadamente.

**Dimensão 1: taxa de resolubilidade das citações**

- Métrica: proporção de citações nas anotações que conseguem localizar uma fonte específica (marca de tempo do áudio, âncora de parágrafo do documento compartilhado, ID de mensagem do chat)
- Como medir: programaticamente. Fazer o parse de cada citação no formato acordado e consultar o sistema de origem de cada uma para checar existência
- Limiar: 100%
- Justificativa: esta dimensão não depende do julgamento do modelo, apenas de restrições de formato e checagens de existência. Falha no parse significa mandar o agente reescrever, e reescrever até passar. Só esse tipo de verificação puramente mecânica pode exigir nota máxima

**Dimensão 2: qualidade do sustento das citações**

- Métrica: entre os pares “alegação–citação” amostrados, proporção em que o conteúdo da citação de fato sustenta a alegação
- Como medir: precisa de humano ou juiz LLM (conteúdo da Lição 4). Faça humanos etiquetarem um lote primeiro, como baseline
- Limiar: acima de 0,9, e as amostras reprovadas não podem incluir erros graves do tipo “a citação existe mas o conteúdo é completamente sem relação com a alegação”
- Justificativa: não exija 100% porque “conta como sustento” tem fronteiras difusas por natureza; duas pessoas etiquetando o mesmo lote não vão concordar totalmente. O limiar deveria se ancorar perto da taxa de concordância humana na mesma tarefa — a exigência oficial de “alcançável” é basear as metas em benchmarks existentes, experimentos anteriores ou conhecimento de especialistas, e não fixar 1,0 arbitrariamente[^S5]

**Dimensão 3: completude de cobertura**

- Métrica: toda reunião desta semana tem uma seção correspondente nas anotações; as decisões tomadas e as tarefas atribuídas em cada reunião estão todas listadas
- Como medir: se as reuniões estão completas dá para verificar programaticamente (N reuniões na agenda significa que deveria haver N seções nas anotações); se decisões e tarefas foram perdidas precisa de amostragem humana ou de um juiz
- Limiar: cobertura de reuniões 100%; recall de decisões e tarefas acima de 0,85
- Justificativa: perder uma reunião inteira é um erro grave e mecanicamente verificável, não deveria ser tolerado. Perder uma tarefa é limitado pelo material de origem — um “eu vejo isso depois” dito vagamente no áudio pode não ser captado nem por todos os humanos que ouvirem; fixar 1,0 é cavar a própria cova

**Dimensão 4 (opcional): conformidade de formato**

- Métrica: a saída está conforme o template acordado (título, participantes, decisões, tarefas, blocos de citação — cinco partes completas)
- Como medir: programaticamente, regex ou validação de schema
- Limiar: 100%
- Justificativa: puro formato, mesmo raciocínio da dimensão 1; não conforme significa reescrever

**Quais verificam estado final, quais definem checkpoints**

- Resolubilidade das citações, conformidade de formato, cobertura de reuniões: verificam estado final. As três são verificações mecânicas calculadas uma vez depois da execução; checar no meio do caminho não traz benefício extra
- Qualidade do sustento das citações: define um checkpoint intermediário. Esta dimensão é a mais cara (precisa de humano ou juiz) e também a mais propensa a desvio sistemático. Na posição “anotações da primeira reunião escritas”, faça uma amostragem de algumas; se o método de citação estiver fundamentalmente errado, todas as reuniões seguintes vão estar igualmente erradas; quanto antes você parar, mais economiza
- Recall de decisões e tarefas: verifica estado final, mas registre nas métricas “quais reuniões tiveram mais perdas”, para distinguir se o problema é do modelo ou se o áudio daquelas poucas reuniões é intrinsecamente ruim

**Por que multidimensional não é negociável**: elas se minam entre si. Olhe só a resolubilidade das citações e o agente escreve menos citações e tira nota máxima; olhe só a completude de cobertura e ele copia o áudio literalmente e passa. Trave-as juntas e sobra menos espaço para atalhos — a maioria dos casos de uso precisa mesmo, de saída, de avaliação multidimensional ao longo de vários critérios de sucesso[^S5].

<!-- hint -->

Dica 1: primeiro desmonte “confiáveis” em várias coisas que não se sobrepõem. Um adjetivo costuma esconder três ou quatro verificações diferentes por baixo; sem desmontar, o limiar que você escrever só pode ser um número vago.

<!-- hint -->

Dica 2: antes de definir limiares, pergunte “quão bem humanos conseguem fazer isso”. Se humanos não conseguem chegar a 100%, então 100% não é a meta, é uma desculpa — garante que essa dimensão nunca vai passar, e então você rapidamente começa a ignorá-la. Na direção oposta, validações puramente de formato ou de existência, puramente mecânicas — não conforme significa mandar reescrever; ali fixar 100% é de fato razoável.

<!-- /exercises -->

## Recapitulação

- A avaliação tradicional assume “dada a entrada X siga o caminho Y obtenha a saída Z”; agentes não satisfazem essa premissa: pontos de partida idênticos ainda podem tomar caminhos completamente diferentes, mas válidos, um buscando em três fontes e outro em dez[^S2]
- Você nem sempre sabe quais são as etapas certas, então em geral não dá para checar se os agentes seguiram as etapas que você prescreveu; use métodos de avaliação flexíveis que julguem se eles alcançaram os resultados certos e, ao mesmo tempo, seguiram um processo razoável[^S2]
- A abordagem padrão é avaliação de estado final, não análise turno a turno: não julgue se ele seguiu um processo específico, julgue se ele alcançou o estado final correto[^S2]. Estado final é substantivo e não verbo, e precisa proteger tanto “as mudanças esperadas aconteceram” quanto “as inesperadas não aconteceram”
- Para fluxos complexos, quebre a avaliação em checkpoints discretos que confirmem que “mudanças de estado específicas deveriam ter ocorrido”, não tente validar cada etapa intermediária[^S2]. O “checkpoint” daqui significa verificar estado, diferente do checkpoint de salvar contexto do Curso 9
- Critérios de sucesso precisam ser mensuráveis (métricas quantitativas ou escalas qualitativas bem definidas), alcançáveis (basear as metas em benchmarks do setor, experimentos anteriores ou conhecimento de especialistas), e a maioria dos casos de uso precisa de avaliação multidimensional[^S5]
- A documentação oficial lista “ter critérios de sucesso claros, permitir loops de feedback” como condições em que agentes agregam mais valor[^S1]; leia ao contrário — tarefas para as quais você não consegue escrever critérios de sucesso não deveriam ser entregues inteiras a agentes para rodar sozinhos; você vai ter que acompanhar o tempo todo
- Asserções de trajetória são um acréscimo opcional: você pode especificar quais ferramentas espera que ele chame, para medir se ele capta o propósito das ferramentas, mas como os caminhos válidos não são únicos, evite especificar demais ou se sobreajustar a estratégias[^S3]
- Além da taxa de aprovação, registre também tempo de execução, contagem de chamadas, consumo de tokens e erros de ferramenta; muitas chamadas redundantes, considere ajustar os parâmetros de paginação e de limite de tokens; muitos erros de parâmetro inválido, considere deixar as descrições e os exemplos das ferramentas mais claros[^S3]

[>> Lição 3: Verificadores determinísticos: só valem verificações que produzem passa/falha](./03-deterministic-checks.md)
