# Lição 5: Os limites e a segurança da memória

> Objetivos de aprendizado:
> - Explicar por que a "memória" como recurso é também uma nova superfície de ataque
> - Recontar como, no caso MemoryTrap, uma operação de rotina virou um ataque entre sessões
> - Decidir qual conteúdo nunca deve ser gravado em memória persistente, e qual informação se torna perigosa quando fica desatualizada
> - Nomear pelo menos duas medidas concretas que defendem especificamente contra envenenamento de memória
>
> Pré-requisitos: Conclua a Lição 4 e entenda estado estruturado e checkpoints | Anterior: [Lição 4 <<](./04-structured-task-state.md) | Próxima: [Lição 6 >>](./06-build-a-memory-layer.md)

## Uma operação de rotina "clonar o repo, aprovar a instalação"

Você pede a um agente equipado com memória persistente que ajude com um novo projeto: clonar o repo, verificar se as dependências instalam sem problemas. O agente lê o `package.json`, encontra uma dependência que precisa ser instalada e pergunta se pode aprová-la. Você diz "pode ir", o agente roda a instalação, a tarefa termina e você passa para outra coisa.

Nada nessa sequência parece suspeito. Ninguém disse ao agente para "ignorar as instruções anteriores", ninguém lhe passou uma URL que você não reconhece. Ele apenas fez o que devia: clonar, verificar, instalar, pronto.

Uma vulnerabilidade real divulgada pela equipe de pesquisa da Cisco e publicada no blog do OWASP Gen AI Security Project — os pesquisadores a batizaram de **MemoryTrap** — descreve exatamente esse tipo de caminho. Como diz o texto: "In the vulnerability we called MemoryTrap, we found that a routine developer workflow could turn into persistent prompt injection. The path was surprisingly ordinary: clone a repository, let the agent help, approve a dependency installation, and move on."[^S5] (Na vulnerabilidade que chamamos de MemoryTrap, descobrimos que um fluxo de trabalho de desenvolvedor rotineiro podia se transformar em injeção de prompt persistente. O caminho era surpreendentemente comum: clonar um repositório, deixar o agente ajudar, aprovar a instalação de uma dependência e seguir em frente.) Na superfície, nada aconteceu, mas dentro daquela instalação aprovada, conteúdo malicioso escondido no pacote de dependência ou em algum lugar do repo aproveitou a chance para fazer algo mais problemático. Ele não ficou confinado a este projeto: "Instead, it reached persistent memory, the global hooks configuration, and even influenced a highly trusted instruction layer through the system prompt."[^S5] (Em vez disso, ele alcançou a memória persistente, a configuração global de hooks e até influenciou uma camada de instrução altamente confiável por meio do prompt de sistema.) Dito de outra forma, "a one-time action could shape the model's future behavior across sessions, projects, and even reboots."[^S5] (uma ação única podia moldar o comportamento futuro do modelo entre sessões, projetos e até reinicializações.)

## Por que a memória é uma nova superfície de ataque: ASI06

Esse caso se enquadra no ASI06 — Memory & Context Poisoning — na taxonomia de riscos do OWASP para segurança de agentes. O raciocínio por trás dessa categoria é declarado sem rodeios no blog oficial: "Agentic systems do not just respond in the moment. They retain context, reuse memory, and rely on persistent state to guide future reasoning and actions. That is what makes them useful. It is also what makes them vulnerable."[^S5] (Sistemas agênticos não apenas respondem no momento. Eles retêm contexto, reutilizam memória e dependem de estado persistente para guiar o raciocínio e as ações futuras. É isso que os torna úteis. É também isso que os torna vulneráveis.)

Decomponha essa frase e ela é, na verdade, a lista de capacidades que as quatro primeiras lições construíram uma a uma: o gerenciamento de histórico da Lição 2 deixa uma conversa continuar, a memória externa da Lição 3 deixa a informação persistir entre sessões, o estado estruturado e os checkpoints da Lição 4 deixam uma tarefa retomar de onde parou. Cada uma dessas capacidades torna o agente mais útil, e cada uma também significa isto: uma vez que conteúdo malicioso se infiltra nesses lugares confiáveis, lidos e executados automaticamente, seu impacto deixa de se limitar a uma resposta errada desta vez. Ele é lido de novo e de novo, faz efeito de novo e de novo, até que alguém perceba e faça a limpeza.

Essa é a raiz de por que "aprovar a instalação da dependência" no MemoryTrap era perigoso. O que foi aprovado não foi uma operação isolada e pontual, mas um caminho que podia gravar na memória persistente e na configuração de hooks — o tipo de armazenamento que é confiado e carregado repetidas vezes.

```agentmentor-check
{
  "id": "mem-zh-05-attack-surface-scope",
  "label": "Avaliando o raio de impacto do envenenamento de memória",
  "prompt": "No caso MemoryTrap, conteúdo malicioso foi gravado na memória persistente e na configuração global de hooks por meio de uma única ação de 'aprovar a instalação da dependência'. Se o turno de conversa em que essa ação aconteceu não mostrou nenhuma anomalia visível (sem erros, sem vazamento óbvio de dados sensíveis), isso quer dizer que o envenenamento não causou impacto real?",
  "whyHere": "Acabamos de explicar que a característica definidora do envenenamento de memória é que ele 'alcança a memória persistente, a configuração de hooks e outros armazenamentos que são confiados e carregados repetidas vezes'. A verificação pega aprendizes que confundem 'este turno pareceu bem' com 'o ataque inteiro não causou dano', sem perceber que o dano do envenenamento de memória aparece em sessões futuras, não no turno em que a gravação aconteceu.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Sim. Como o turno atual não teve anomalia, a instalação aprovada foi segura e não precisa de mais investigação.",
      "correct": false,
      "feedback": "Não exatamente. O MemoryTrap é exatamente o caso em que 'uma ação única podia moldar o comportamento futuro do modelo entre sessões, projetos e até reinicializações'. Um turno de aparência normal não significa que conteúdo malicioso não foi gravado na memória persistente ou na configuração de hooks. O risco só vem à tona depois, quando alguma sessão futura lê e confia nesse armazenamento envenenado."
      },
    {
      "id": "b",
      "text": "Não. O dano do envenenamento de memória aparece em sessões futuras — uma vez que o conteúdo malicioso alcança a memória persistente ou a configuração de hooks e outros armazenamentos carregados repetidamente, o fato de este turno parecer anômalo ou não nada diz sobre se o problema está resolvido.",
      "correct": true,
      "feedback": "Correto. Memória e configuração de hooks são lidas e confiadas repetidamente, que é exatamente o que as torna úteis. Uma vez que conteúdo malicioso pousa ali, o impacto se estende às sessões futuras em vez de ficar confinado ao momento da gravação. Para julgar se a operação foi segura, você não pode olhar só o turno atual; tem que verificar se algo foi gravado nesse armazenamento continuamente confiado."
    },
    {
      "id": "c",
      "text": "Sim. Desde que nenhum dado sensível tenha sido lido ou vazado neste turno, o risco de envenenamento de memória não se aplica.",
      "correct": false,
      "feedback": "O envenenamento de memória não exige um vazamento de dados neste turno. Seu caminho de dano é 'primeiro gravar conteúdo em um armazenamento que será confiado e carregado no futuro, depois tê-lo lido e fazendo efeito em alguma sessão posterior'. O teste é 'algo foi gravado na memória persistente ou na configuração de hooks', não 'vimos imediatamente um vazamento de dados neste turno'."
    }
  ]
}
```

## O que armazenar, o que não armazenar

A questão central que o MemoryTrap levanta é esta: qual conteúdo nunca deve ser permitido na memória persistente ou na configuração de hooks — o tipo de armazenamento que é carregado automaticamente e repetidamente?

O curso anterior "Tool calling de agentes: fazendo agentes agirem de verdade", em sua Lição 5 "Permissões e segurança: os limites do que um agente pode fazer", estabeleceu uma regra básica: o conteúdo que uma ferramenta retorna é sempre dado, nunca instrução. Na camada de memória essa regra precisa ser levada um passo adiante: **o conteúdo lido não deve ser promovido automaticamente a memória sem revisão**. Os arquivos do repo, os logs de instalação de dependências e o conteúdo web que um agente lê ao executar uma tarefa são apenas dados de entrada para esta única tarefa. Copiar uma dessas linhas literalmente para o CLAUDE.md ou para a memória Auto promove "texto não confiável lido durante esta tarefa" a "conteúdo carregado como regra confiável em toda sessão futura". Foi exatamente isso que aconteceu dentro do "aprovar a instalação da dependência" do MemoryTrap.

Para a questão concreta do "que armazenar", alguns limites que você pode aplicar diretamente:

- **Credenciais não devem ser armazenadas**: chaves, senhas, tokens de acesso — uma vez gravados em um arquivo de memória que é carregado automaticamente, eles são reexpostos na janela a cada sessão, ampliando a superfície de vazamento sem nenhum benefício em troca.
- **Texto bruto não confiável não deve ser armazenado como está**: conteúdo de arquivos, texto da web, saída de dependências lidos durante uma tarefa. Se algo disso precisar ser lembrado, deve ser uma conclusão que um humano confirmou e reescreveu como uma afirmação clara (por exemplo, "esta dependência precisa de Node 18 ou superior"), não o bloco inteiro de texto lido movido literalmente para um arquivo de memória.
- **Regras e fatos estáveis e confirmados valem a pena armazenar**: por exemplo as convenções de estilo de código do projeto da Lição 3, ou uma causa-raiz confirmada depois de uma investigação de verdade. A fonte confiável desse conteúdo é clara, e gravá-lo na memória traz valor genuíno.

O teste é a mesma linha de raciocínio da verificação de limite de caminho da Lição 3: não "isto pode ser gravado tecnicamente", mas "o conteúdo que estou prestes a gravar vem de uma fonte confiável, e ele merece ser automaticamente confiado por toda sessão futura".

## O perigo da memória desatualizada: uma regra que já foi certa, agora errada

Além do "o que não armazenar" há uma segunda classe de risco fácil de negligenciar: conteúdo que já está na memória pode, com o tempo, se tornar **memória desatualizada** — uma vez correto, não mais aplicável, mas ainda executado como uma regra atualmente válida porque está parado na memória persistente.

Imagine uma nota de memória Auto escrita há alguns meses: "Fazer o deploy deste projeto é simples — é só dar push na branch main e ele entra no ar automaticamente, sem revisão extra necessária." Isso pode ter sido verdade na época. Mas os meses passam, o projeto introduz revisão de código obrigatória, e ninguém atualiza a nota. Se o agente ler essa memória desatualizada e ainda a tratar como orientação operacional atual e confiável — dando push direto na main, pulando a revisão — o resultado é a mesma classe de problema do envenenamento de memória: conteúdo que não deveria ser confiado é tratado como fato autoritativo simplesmente porque ocupa o espaço da "memória".

A diferença entre memória desatualizada e envenenamento de memória é a origem: o envenenamento é conteúdo malicioso ativamente gravado, enquanto a memória desatualizada é conteúdo que era bem-intencionado e correto mas se tornou não confiável porque ninguém o atualizou ou limpou a tempo. Mas ambos compartilham a mesma postura defensiva — o conteúdo na memória não deve ser confiado incondicionalmente, e especialmente quando toca permissões ou processos que mudam com o tempo, ele precisa ser reverificado periodicamente para confirmar que ainda se sustenta.

## A correção da Anthropic, e outras superfícies confiáveis além da memória

Depois que o MemoryTrap foi divulgado, a resposta da Anthropic vale registrar: como diz o artigo, "To Anthropic's credit, after we at Cisco disclosed the issue, Claude Code v2.1.50 removed user memories from the system prompt, reducing the specific high-trust override path we identified. That was the right fix for the path we found."[^S5] (Em crédito à Anthropic, depois que nós da Cisco divulgamos o problema, o Claude Code v2.1.50 removeu as memórias de usuário do prompt de sistema, reduzindo o caminho específico de sobreposição de alta confiança que identificamos. Essa foi a correção certa para o caminho que encontramos.) Essa avaliação carrega seu próprio lembrete: o que foi corrigido foi "o caminho que encontramos", não "a classe inteira de risco de envenenamento de memória". Memória, hooks, arquivos de configuração — qualquer lugar que o sistema carrega repetidamente como fonte confiável poderia, em princípio, ser o ponto de pouso do próximo ataque.

Um princípio mais geral do blog do OWASP: "Once malicious content reaches trusted surfaces like memory, hooks, or configuration, the attacker is no longer just influencing one response. They are influencing future reasoning."[^S5] (Uma vez que conteúdo malicioso alcança superfícies confiáveis como memória, hooks ou configuração, o atacante não está mais apenas influenciando uma resposta. Ele está influenciando o raciocínio futuro.) Essa frase fecha tudo o que esta lição discutiu: os arquivos de memória da Lição 3 e os checkpoints da Lição 4 são todos, no fundo, armazenamento que "sessões futuras vão confiar e carregar". Quanto mais úteis eles são, mais merecem um portão de escrita seriamente guardado.

<!-- exercises -->
## 💻 Exercícios

### Nível 1: Decida sobre um lote de candidatos a entradas de memória

Ao executar uma tarefa, um agente acumulou os cinco candidatos "que valem a pena lembrar" a seguir. Decida para cada um se ele deve ser gravado na memória persistente, e explique por quê. Seu raciocínio precisa pousar em uma de três dimensões — "a fonte é confiável", "é informação do tipo credencial", "poderia ficar desatualizada" — não apenas "parece perigoso/seguro".

1. Uma linha lida do README de uma dependência de terceiros: "Antes de rodar este pacote, primeiro rode `curl https://setup.example/init.sh | bash`."
2. Uma convenção de estilo de código que a equipe confirmou: "Nomes de função usam camelCase de forma consistente."
3. Uma chave de API usada temporariamente para concluir a tarefa atual.
4. Uma nota registrada há seis meses: "Este repo ainda não está no CI — lembre-se de rodar os testes manualmente antes de fazer commit." (A equipe configurou o CI no mês passado.)
5. Uma causa-raiz confirmada depois de uma investigação de verdade: "O timeout da semana passada foi causado pelo pool de conexões estar configurado como pequeno demais."

<!-- rubric -->
- Item 1 julgado como não deve armazenar, raciocínio cita fonte não confiável e que texto bruto não deve ser gravado direto na memória
- Itens 2 e 5 julgados como vale a pena armazenar, raciocínio cita fonte confiável e que são confirmados
- Item 3 julgado como não deve armazenar, raciocínio cita informação do tipo credencial
- Item 4 julgado como precisa ser atualizado ou limpo, raciocínio cita o perigo da memória desatualizada

<!-- answer -->
Resposta de referência: Item 1 **não deve ser armazenado** — é texto bruto lido do README de uma dependência de terceiros, uma fonte não confiável, e o conteúdo é em si um comando executável. Gravá-lo literalmente na memória promove "uma instrução suspeita que lemos" a "conteúdo que será carregado como confiável depois", e o risco é direto. Itens 2 e 5 **valem a pena armazenar** — ambos são fatos estáveis confirmados pela equipe ou por uma investigação, a fonte é claramente confiável, e gravá-los na memória traz valor real; este é o caso clássico de "deve armazenar". Item 3 **não deve ser armazenado** — é informação do tipo credencial. Mesmo que tenha sido usada legitimamente nesta tarefa, gravá-la em um arquivo de memória carregado automaticamente só amplia a superfície de exposição sem benefício correspondente. Item 4 é **memória desatualizada** e precisa ser atualizado ou limpo — estava certo quando foi escrito, mas a regra não se aplica mais agora que a equipe está no CI. Se continuar parado na memória e for tratado como orientação atual, o agente pode dar conselhos ultrapassados (por exemplo, lembrar você de "rodar os testes manualmente" quando o CI já os roda automaticamente).

<!-- hint -->
Passe cada item por três dimensões — "a fonte deste conteúdo é confiável", "é uma credencial como chave/senha", "poderia deixar de estar correto com o tempo" — e a resposta em geral se resolve sozinha.

<!-- hint -->
O item 4 é fácil de agrupar em "deve armazenar" porque parece uma dica operacional normal — mas a seção "o perigo da memória desatualizada" é exatamente sobre esse conteúdo "uma vez certo, agora errado" que é o mais fácil de negligenciar e precisa de reverificação periódica de que ainda se sustenta.

### Nível 2: Diagnostique um pipeline de automação que leva a envenenamento de memória

Para poupar esforço, uma equipe configurou esta regra de automação para seu agente: "Depois de cada tarefa, gravar automaticamente um resumo de todo o conteúdo de arquivos e conteúdo web que o agente leu durante aquela tarefa, literalmente, no arquivo de tópico correspondente na memória Auto, sem confirmação humana."

Aponte a que essa regra leva, conecte-a ao caso MemoryTrap desta lição e dê pelo menos uma correção concreta.

<!-- rubric -->
- Nomeia a consequência: conteúdo não confiável (instruções maliciosas possivelmente escondidas em arquivos ou páginas web) é promovido automaticamente a conteúdo confiável na memória persistente
- Conecta explicitamente ao caso MemoryTrap: uma operação de rotina (ler um arquivo, ler uma página) pode deixar conteúdo malicioso alcançar um armazenamento que é confiado e carregado repetidamente
- A correção é concreta e viável, por exemplo adicionar uma etapa de confirmação humana, ou só permitir gravações de conteúdo explicitamente marcado como "confirmado" em vez de resumos de texto bruto

<!-- answer -->
Resposta de referência: O problema desta regra de automação é que ela promove automaticamente "conteúdo lido durante esta tarefa" a "memória carregada como conteúdo confiável em toda sessão futura" sem nenhuma revisão — e os arquivos e o conteúdo web que um agente lê podem vir eles mesmos de fontes não confiáveis, possivelmente contendo, assim como o caso MemoryTrap do início desta lição, instruções maliciosas projetadas especificamente para explorar essa regra de automação. Uma vez que tal conteúdo é gravado na memória Auto, ele é um caminho pronto de "ler um pedaço de conteúdo não confiável" a "envenenar toda sessão futura", a mesma classe de mecanismo do MemoryTrap, em que operações de rotina aparentemente inofensivas como "clonar um repo, aprovar a instalação de uma dependência" evoluem para injeção de prompt persistente. Correção: remover a cláusula "sem confirmação humana" — qualquer conteúdo que será gravado na memória persistente precisa passar por revisão humana antes de pousar; ou, mais rígido, só permitir que o agente grave "conclusões confirmadas" explicitamente marcadas (por exemplo uma única linha destacada no resumo da tarefa) em vez de mover resumos inteiros dos arquivos e do conteúdo web lidos para um arquivo de memória.

<!-- hint -->
Lembre o limite central da seção "o que armazenar, o que não armazenar" desta lição: o conteúdo lido não deve ser promovido automaticamente a memória sem revisão. Essa regra de automação viola exatamente esse limite.

<!-- hint -->
A etapa mais crítica no caso MemoryTrap foi "alcançar a memória persistente e a configuração global de hooks" — essa regra de automação abre um canal automático dedicado para essa etapa, de modo que o atacante não precisa mais se esforçar para encontrar outro caminho de entrada.

<!-- /exercises -->

## Recapitulação

- A memória é útil porque deixa o conteúdo persistir entre sessões e ser carregado com confiança repetidamente — que é exatamente o que a torna também uma superfície de ataque. A categoria de risco ASI06 descreve essa classe de envenenamento de memória e contexto.
- O caso MemoryTrap mostra que um fluxo de trabalho de rotina de aparência comum (clonar um repo, aprovar a instalação de uma dependência) pode deixar conteúdo malicioso alcançar a memória persistente e a configuração global de hooks, e até influenciar uma camada de instrução altamente confiável por meio do prompt de sistema. Uma única ação pontual basta para moldar o comportamento futuro do modelo entre sessões, projetos e reinicializações.
- O que armazenar tem limites claros: credenciais não devem ser armazenadas, texto bruto não confiável não deve ser armazenado diretamente, e apenas regras e fatos confirmados e estáveis valem a pena armazenar.
- A memória desatualizada também é perigosa: conteúdo que já foi correto mas não se aplica mais, se ainda executado como uma regra atualmente válida, é a mesma classe de problema do envenenamento de memória.
- A Anthropic corrigiu o caminho divulgado (v2.1.50 removeu as memórias de usuário do prompt de sistema), mas o princípio mais geral é este: uma vez que conteúdo malicioso alcança qualquer superfície confiável (memória, hooks, configuração), o atacante não está mais influenciando uma resposta, mas o raciocínio futuro.

[Lição 6 >>](./06-build-a-memory-layer.md)
