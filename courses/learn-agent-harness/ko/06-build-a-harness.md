# 레슨 6: 실습: 제어가 달린 에이전트 하네스를 손으로 쓰기

> 학습 목표:
> - 앞선 레슨들의 `stop_reason` 루프를 `@anthropic-ai/sdk` 위에서 돌아가는 `while` 루프로 바꾸고, 도구를 계속 호출할지 텍스트를 반환하고 마무리할지 스스로 판단하기
> - `tool_use`와 `tool_result` 콘텐츠 블록을 명세 그대로 만들고, 한 턴의 여러 결과를 하나의 `user` 메시지 안에 담아 돌려보내기
> - 그 루프에 제어 밸브 넷 — 최대 턴 수, 예산 상한, 무진행 감지, 영향이 큰 행동에 대한 승인 — 을 달고, 각각이 루프의 어느 단계에 있어야 하는지 정확히 말하기
>
> 전제: 레슨 2부터 5까지 읽었고, `stop_reason`으로 구동되는 루프, 정지 조건, 폭주 백스톱, 휴먼 인 더 루프 개입을 이해한다 | 이전: [레슨 5 <<](./05-intervention-and-steering.md)

## 먼저, 돌아가는 모습부터

앞의 다섯 레슨은 기계를 조각조각 뜯어냈습니다. 루프가 어떻게 도는지, 언제 멈춰야 하는지, 폭주는 어떻게 생겼는지, 사람은 어떻게 끼어드는지. 이 레슨은 그 조각들을 가장 작은 돌아가는 하네스로 용접합니다. 코드에 앞서, 터미널에서 무엇을 하는지 보세요 — 장난감 도구 두 개(`get_time`은 시간을 알려 주고, `read_file`은 프로젝트 안의 파일을 읽습니다)를 단 에이전트에, 한 문장을 건넵니다. "README.md의 첫 줄을 읽고, 그다음 지금 몇 시인지 알려 줘."

```text
$ node agent.js "README.md의 첫 줄을 읽고, 그다음 지금 몇 시인지 알려 줘"

[turn 1] model requests tool: read_file({"path":"README.md"})
[turn 1] tool returned: "# 에이전트 하네스 기초\n..."
[turn 2] model requests tool: get_time({})
[turn 2] tool returned: "2026-08-26T10:42:07+08:00"
[turn 3] model wraps up (end_turn)

README.md의 첫 줄은 "# 에이전트 하네스 기초"이고, 지금은 2026년 8월 26일 10시 42분입니다.
도구 호출 2턴, 모델 요청 3회로 끝났습니다.
```

무슨 일이 일어났는지 자세히 보세요. **사용자는 한 문장을 말했고, 도구가 몇 개 호출됐는지, 어느 것이 먼저였는지, 언제 멈출지는 모두 루프 안의 모델이 결정했습니다.** 그것이 에이전트와 워크플로의 경계선입니다 — 워크플로의 경로는 코드에 고정돼 있지만, 에이전트는 모델이 자신의 과정을 동적으로 지휘하며 어떤 도구를 쓸지 결정합니다[^S1]. 호스트 코드(이 레슨에서 우리가 쓰는 하네스)는 "먼저 파일을 읽고, 그다음 시간을 확인하라"고 지정한 적이 없습니다. 그저 충실히 루프를 돌리고, 모델이 지목한 도구를 실행하고, 결과를 먹여 줬을 뿐입니다. 여기 두 도구는 다 무해해서 실행을 멈추게 한 것은 없습니다 — 하지만 이 하네스에는 승인 밸브도 용접돼 있어서, 모델이 파일 삭제나 요청 쏘기 같은 영향이 큰 것에 손을 뻗으면, 멈추고 행동하기 전에 사람의 끄덕임을 기다립니다(뒤에서 씁니다). 이 레슨의 나머지는 저 터미널 출력 뒤의 코드를 한 줄씩 짓습니다.

## 핵심 루프: 골격을 그대로 옮기고, 진짜 SDK로 갈아 끼운다

레슨 2 "핵심 루프: 한 번의 왕복에서 지속 동작으로"의 `callModel`은 의사코드였습니다. 이제 그것이 실제 `@anthropic-ai/sdk`가 됩니다. 루프의 골격은 동일합니다. `messages`를 실은 요청을 보내고, `response.stop_reason`을 봅니다 — `"tool_use"`이면 도구를 돌리고, 결과를 도로 꿰고, 다시 보냅니다. 아니면(가령 `end_turn`) 텍스트를 반환하고 루프를 빠져나옵니다[^S2].

밸브가 하나도 없는 최소 버전이 여기 있습니다. 루프 자체가 잘 보이도록.

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // 환경 변수 ANTHROPIC_API_KEY에서 키를 읽는다

// 여러분 계정에서 실제로 쓸 수 있는 모델 id로 갈아 끼운다
const MODEL = "claude-sonnet-5";

async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // 이번 턴 모델의 완전한 응답(assistant 롤)을 히스토리에 추가한다
    messages.push({ role: "assistant", content: response.content });

    // 이번 턴의 모든 tool_use 블록을 실행하고, 각각을 tool_result에 담는다
    const toolResults = await runToolUses(response.content, toolImpls);

    // 한 턴 분량의 tool_result 블록은 뒤따르는 하나의 user 메시지에 담는다
    messages.push({ role: "user", content: toolResults });

    // 길어진 히스토리를 실어 다시 보낸다. 제어는 while 판정으로 돌아간다
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools,
      messages,
    });
  }

  // stop_reason이 더는 tool_use가 아니다 — 최종 텍스트를 꺼내 반환한다
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

이것을 레슨 2 골격 옆에 놓으면 구조는 움직이지 않았습니다. `while` 줄은 여전히 "`stop_reason`이 `tool_use`인 동안 반복"이라 말하고, 본문은 여전히 같은 네 단계입니다 — assistant push, 도구 실행, tool_result push, `response` 재대입. 실질적 변화는 `callModel`이 `client.messages.create(...)`가 된 것과, 본문 끝의 그 재대입뿐입니다. 그 재대입이야말로 멈춤을 가능하게 하는 것입니다. 그것을 빼면 `stop_reason`은 옛 값에 영영 머물고, 그것이 바로 레슨 4 "폭주와 폴백: 데드 루프, 공회전, 예산 소진"의 데드 루프입니다.

## tool_use / tool_result 필드, 하나도 빠뜨리지 않기

`runToolUses`는 모델이 지목한 도구가 실제로 돌아가는 곳입니다. 여기서 가장 틀리기 쉬운 것이 콘텐츠 블록 필드이므로, 명세를 따르세요. `tool_use` 블록은 `id` / `name` / `input`을 싣고, `tool_result` 블록은 `tool_use_id`(어느 호출에 답하는지 밝힘)와 `content`를 싣고, 도구 실행이 실패하면 `is_error: true`를 더합니다[^S6]. 굳은 규칙이 하나 더 있습니다. 응답에 `tool_use` 블록이 몇 개 담겼든, 그만큼의 `tool_result` 블록이 돌아와야 하고, 전부 바로 뒤따르는 하나의 `user` 메시지에 담겨야 합니다[^S6] — 위 루프 본문의 `messages.push({ role: "user", content: toolResults })` 줄이 그 규칙을 지킵니다.

```javascript
async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  // 병렬로 돌리되, 결과는 여전히 하나의 user 메시지로 모인다
  return Promise.all(
    toolUseBlocks.map(async (block) => {
      const impl = toolImpls[block.name];
      try {
        const output = await impl(block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id, // 밝힘: 이것은 id가 block.id인 호출에 답한다
          content: output,
        };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: `도구 실행 실패: ${err.message}`,
          is_error: true, // 실패 시 세팅해, 모델이 호출이 성공하지 못했음을 알게 한다
        };
      }
    })
  );
}
```

`try/catch`를 눈여겨보세요. 도구 하나가 터진다고 하네스 전체가 함께 무너져서는 안 됩니다. 에러를 `is_error: true`로 표시한 `tool_result`에 싸서 돌려보내면, 모델은 다른 인자로 재시도하거나 다른 경로를 택할 기회를 얻습니다. 그것이 예외를 던져 프로세스를 죽이는 것보다 훨씬 안정적입니다.

## 제어 밸브 네 개 볼트로 죄기

이제 루프는 돌지만, 레슨 2의 헐벗은 루프 — 모델을 믿고 스스로에게 빠져나갈 길을 남기지 않은 루프 — 입니다. 모델이 `end_turn`을 반환하는 턴에서 멈추고, 그 사이 어디에도 경계가 없습니다. 그리고 에이전트의 자율성은 더 높은 비용에 더해, 루프를 한 바퀴 두 바퀴 돌며 에러가 누적 증폭할 가능성을 뜻하고, 모델은 여러 턴을 돌 수 있습니다[^S1] — 헐벗은 루프는 멈출지 계속할지의 결정 전체를 모델에 거는데, 그것은 너무 위험합니다. 이제 앞선 레슨들의 밸브 넷을 하나씩 용접합니다.

```javascript
const MAX_TURNS = 8;        // 밸브 1: 최대 턴 수 (레슨 3, 정지 조건)
const TOKEN_BUDGET = 40000; // 밸브 2: 누적 토큰 예산 (레슨 4, 예산 소진)

async function runAgent(userInput, tools, toolImpls, opts = {}) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;
  let tokensUsed = 0;
  let lastSignature = null; // 밸브 3용: 직전 턴의 도구 호출 시그니처

  let response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

  while (response.stop_reason === "tool_use") {
    // —— 밸브 1: 최대 턴 수. 본문 첫 줄: 이번 바퀴 전에 "아직 돌아도 되나?"를 묻는다 ——
    if (turns >= MAX_TURNS) {
      return `최대 턴 수 ${MAX_TURNS}에 도달해, 스스로 멈춥니다(작업이 너무 어렵거나, 모델이 막혔을 수 있습니다)`;
    }
    // —— 밸브 2: 예산 상한. 누적 토큰이 천장에 닿으면 멈춘다. 지갑을 태우지 않는다 ——
    if (tokensUsed >= TOKEN_BUDGET) {
      return `토큰 예산 ${TOKEN_BUDGET}에 도달해, 스스로 멈춥니다`;
    }
    turns++;

    // —— 밸브 3: 무진행 감지. 이번 턴 도구 호출 시그니처가 직전과 같다: 헛돈다고 본다 ——
    const signature = signatureOf(response.content);
    if (signature === lastSignature) {
      return `두 턴 연속으로 동일한 도구 호출이었습니다(${signature}). 헛돈다고 판정해, 스스로 멈춥니다`;
    }
    lastSignature = signature;

    messages.push({ role: "assistant", content: response.content });

    // —— 밸브 4: 승인 밸브. 영향이 큰 행동은 실행 전에 확인받는다 (아래에서 펼침) ——
    const toolResults = await runToolUses(response.content, toolImpls, opts);
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: MODEL, max_tokens: 1024, tools, messages,
    });
    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
  }

  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

각 밸브는 하나를 지키고, 그 위치는 어느 것도 임의가 아닙니다.

- **밸브 1, 최대 턴 수**(레슨 3 "정지 조건: 에이전트는 언제 그만둬야 하는가"): `turns >= MAX_TURNS`는 `turns++` 앞, 본문 맨 위에 앉습니다. "이번 바퀴 전에, 한 바퀴 더 도는 것이 아직 허용되는지 확인하라"는 뜻입니다. 이 명시적 정지 조건은 모델 자신의 `end_turn`과 나란히, 제어를 여러분 손안에 두기 위해 존재합니다[^S1].
- **밸브 2, 예산 상한**(레슨 4 "폭주와 폴백: 데드 루프, 공회전, 예산 소진"): 응답이 돌아올 때마다 `response.usage`의 토큰을 더하고 천장에서 멈춥니다. 턴은 적은데 매 턴 컨텍스트가 거대할 때, 턴 수만으로는 지출을 붙잡지 못하므로, 토큰을 별개의 독립 게이트로 둬야 합니다.
- **밸브 3, 무진행 감지**(레슨 4): 이번 턴 도구 호출을 시그니처로 납작하게 만들어 직전과 비교합니다. 같으면 헛도는 것입니다. 이것은 턴이 상한을 넘지 않았고 예산도 안 터졌는데, 모델이 제자리걸음을 하며 같은 도구를 같은 인자로 몇 번이고 호출하는 정체 상황을 잡습니다.
- **밸브 4, 승인 밸브**(레슨 5 "개입과 조향: 중단, 방향 전환, 휴먼 인 더 루프"): `runToolUses` 안, 도구를 실제로 실행하기 전에, 영향이 큰 행동은 사람의 확인을 먼저 받습니다. 영향이 큰 행동에 대한 휴먼 인 더 루프 승인이야말로 과도한 에이전시 위험을 누르는 권장 방법입니다[^S4].

밸브 3의 시그니처 함수는 지루할 만큼 단순합니다 — 이번 턴 모든 `tool_use` 블록의 이름과 인자를 하나의 문자열로 잇습니다. "무엇이 어떤 인자로 호출됐나"를 구별하는 것만 하면 됩니다.

```javascript
function signatureOf(content) {
  return content
    .filter((b) => b.type === "tool_use")
    .map((b) => `${b.name}(${JSON.stringify(b.input)})`)
    .sort()
    .join(" | ");
}
```

## 승인 밸브: 실행 직전의 순간에 끼워 넣는다

네 밸브 중 승인 밸브의 위치가 가장 중요하고 가장 틀리기 쉽습니다. 모델이 도구를 지목했지만 도구가 아직 실제로 돌지 않은 순간에 끼워 넣어야 합니다 — 벌어지려는 행동을 출력하고, 사람을 기다리고, 확인 뒤에만 실행합니다. 한 단계라도 늦으면 파일은 이미 쓰였고, 요청은 이미 나갔고, "확인?"이라 묻는 것은 무의미합니다. 그래서 `runToolUses` 안, `impl(...)` 줄 앞에 갑니다.

```javascript
const HIGH_IMPACT = new Set(["write_file", "http_post", "delete_file"]);

async function runToolUses(content, toolImpls, opts = {}) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  const results = [];
  for (const block of toolUseBlocks) {
    // 승인 밸브: 영향이 큰 행동은 실행 전에 확인받는다
    if (HIGH_IMPACT.has(block.name)) {
      const ok = await opts.approve?.(block.name, block.input);
      if (!ok) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "사용자가 이 영향이 큰 행동을 거부해, 실행하지 않았습니다.",
          is_error: true,
        });
        continue; // 실행을 건너뛰되, tool_result는 여전히 반환한다 — 호출을 매달아 두지 않는다
      }
    }

    try {
      const output = await toolImpls[block.name](block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: output });
    } catch (err) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `도구 실행 실패: ${err.message}`, is_error: true,
      });
    }
  }
  return results;
}
```

`approve`는 바깥에서 넘겨받는 함수입니다. 터미널에서는 "행동을 출력하고, 한 줄의 입력을 읽는다"를 뜻합니다.

```javascript
import readline from "node:readline/promises";

async function approveInTerminal(name, input) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `[approve] 영향이 큰 행동 ${name}(${JSON.stringify(input)})을(를) 실행하려 합니다 — 허용하려면 Enter / 거부하려면 n 입력: `
  );
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}
```

중요한 디테일 하나. 사용자가 거부하더라도, 아무것도 반환하지 않는 대신 `is_error: true`로 표시한 `tool_result`를 여전히 반환합니다. 명세는 모든 `tool_use`에 대응하는 `tool_result`가 돌아오기를 요구합니다[^S6]. 그것을 빼먹으면 도구 호출 하나에 결과가 없어 다음 요청이 에러가 납니다. 거부는 무시와 같지 않습니다 — 거부 자체가 모델이 들을 자격이 있는 결과이고, 거부됐음을 배운 모델은 흔히 영향이 큰 행동이 아예 필요 없는 경로로 갈아탑니다.

```agentmentor-check
{
  "id": "harness-zh-06-approval-before-exec",
  "label": "루프의 제어 흐름에서 승인 밸브를 옳게 배치하기",
  "prompt": "한 동료가 승인 밸브를 이렇게 배선합니다. runToolUses 안에서 모든 도구가 평소대로 먼저 실행돼 출력을 냅니다. 그다음, 결과가 results에 push되기 직전에, 영향이 큰 행동은 '확인?' 프롬프트를 띄우고, 사용자가 아니오라고 하면 그 tool_result를 is_error로 표시해 버립니다. 그는 이렇게 주장합니다. '거부되면 결과는 어차피 버려지니까 동등하다.' 이 배선은 옳습니까?",
  "whyHere": "이 절은 방금 승인 밸브가 도구가 실제로 돌기 전의 순간에 끼워 넣어져야 한다고 못 박았습니다. 바로 뒤에 구체적인 코드 배치 오류 — 확인이 impl 실행 뒤로 옮겨진 것 — 를 붙여, 밸브가 결과가 쓰이느냐가 아니라 실행 자체를 가로챈다는 것을 독자가 정말로 붙잡았는지 시험합니다.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "아니다. 승인은 impl이 호출되기 전에 끝나야 한다. 먼저 실행하고 나중에 묻는 것은 부작용이 이미 착지했다는 뜻이라, 확인이 아무것도 가로채지 못한다",
      "correct": true,
      "feedback": "정답입니다. 승인 밸브가 작용하는 대상은 행동을 수행하는 것 자체이지, 그 결과를 받아들일지가 아닙니다. 그래서 impl(...) 줄 앞에 앉아야 합니다 — 승인이 돌아온 뒤에만 impl을 호출하고, 거부되면 impl을 건드리지 않고 그냥 continue합니다. 그것이 영향이 큰 행동에 대한 휴먼 인 더 루프 승인의 요점 전부입니다. 돌이킬 수 없는 행동이 실제로 벌어지기 전에 게이트를 붙드는 것이지, 벌어진 뒤에 무효 통지를 접수하는 것이 아닙니다."
    },
    {
      "id": "b",
      "text": "그렇다. 거부된 tool_result는 에러로 표시돼 결코 쓰이지 않으니, 실행하든 안 하든 차이가 없다. 먼저 실행하고 나중에 묻기, 결과는 같다",
      "correct": false,
      "feedback": "문제는 도구가 진짜로 이미 돌았다는 것입니다. write_file, http_post, delete_file 같은 영향이 큰 행동은 impl이 반환하는 순간 부작용이 착지합니다 — 파일은 쓰였고, 요청은 나갔고, 레코드는 삭제됐습니다. 그 시점에 '확인?'을 묻는 것은 이 결과를 쓸지만 게이트할 뿐, 이미 벌어진 부작용은 게이트하지 못하며, 그래서 승인 밸브는 아무 일도 하지 않게 됩니다."
    }
  ]
}
```

## 장난감 도구 두 개, 루프가 실제로 돌도록

밸브는 달렸습니다. 빠진 것은 모델이 호출할 도구입니다. 이 레슨은 절대적으로 안전한 장난감 두 개만 쓰고 위험한 조작은 문밖에 둡니다. `get_time`은 현재 시간을 알려 주고, `read_file`은 파일을 읽되 — `path.resolve`로 프로젝트 디렉터리 안에 단단히 못 박아, 모델(또는 도구 출력에 궤도를 벗어난 모델)이 `/etc/passwd` 같은 범위 밖 경로를 읽지 못하게 합니다.

```javascript
import path from "node:path";
import fs from "node:fs/promises";

const ROOT = process.cwd();

const toolImpls = {
  get_time: async () => new Date().toISOString(),

  read_file: async ({ path: p }) => {
    const abs = path.resolve(ROOT, p);
    // 경계 검사: 해석된 절대 경로가 여전히 프로젝트 디렉터리 안이어야 한다
    if (!abs.startsWith(ROOT + path.sep)) {
      throw new Error(`프로젝트 디렉터리 밖 경로 읽기를 거부했습니다: ${p}`);
    }
    return (await fs.readFile(abs, "utf8")).slice(0, 2000);
  },
};

const tools = [
  {
    name: "get_time",
    description: "현재 시간을 ISO 8601 문자열로 반환한다",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_file",
    description: "프로젝트 디렉터리 안 텍스트 파일의 처음 2000자를 읽는다",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "프로젝트 루트 기준 상대 경로" } },
      required: ["path"],
    },
  },
];
```

두 도구 다 `HIGH_IMPACT` 집합에 없으므로 어느 것도 승인을 촉발하지 않습니다 — 만듦새부터 무해합니다. 승인 밸브를 시연하려면 `toolImpls`와 `HIGH_IMPACT`에 `write_file`을 더하세요. 이 레슨은 예제를 돌려도 여러분 파일을 망가뜨릴 수 없도록, 실제 쓰기 조작을 일부러 들이지 않습니다.

## 조립하기: node agent.js로 돌릴 수 있는 진입점

마지막으로, `runAgent`, `runToolUses`, 도구 정의, 승인 함수를 직접 돌릴 수 있는 진입점으로 모읍니다 — 이 레슨 맨 위 터미널 출력 뒤의 그것입니다.

```javascript
async function main() {
  const userInput = process.argv[2] ?? "README.md의 첫 줄을 읽고, 그다음 지금 몇 시인지 알려 줘";
  const answer = await runAgent(userInput, tools, toolImpls, {
    approve: approveInTerminal,
  });
  console.log("\n" + answer);
}

main().catch((err) => {
  console.error("하네스가 크래시했습니다:", err);
  process.exit(1);
});
```

앞의 조각들(`import`, `client`, `MODEL`, `runAgent`, `runToolUses`, `signatureOf`, `approveInTerminal`, `toolImpls`, `tools`, `main`)을 하나의 `agent.js`에 떨어뜨리고, `ANTHROPIC_API_KEY`를 세팅하고, `npm i @anthropic-ai/sdk`를 돌리면, `node agent.js "여러분의 작업"`으로 돌아갑니다.

이 백여 줄을 되돌아보면 새 개념이 하나도 없다는 것을 알아챌 것입니다. `while` 루프와 `stop_reason`은 레슨 2에서, `MAX_TURNS`는 레슨 3에서, 예산과 헛돎 감지는 레슨 4에서, 승인 밸브는 레슨 5에서 왔습니다. **하네스는 무슨 깊은 프레임워크가 아닙니다. 여러분이 직접 쓰고 제어하는 이 루프-더하기-밸브의 층입니다.** 같은 모델, 같은 두 도구 — 그런데도 이 네 밸브가 달린 하네스와 레슨 2의 헐벗은 루프는 같은 작업을 얼마나 안정적으로 돌리느냐에서 엄청나게 갈릴 수 있습니다. 에이전트가 믿을 만한지를 결정하는 것은 안쪽 모델만이 아니라 대체로 이 바깥 층의 제어 코드이기 때문입니다[^S5].

복잡성에 대한 균형 감각도 지키세요. 모든 에이전트가 네 밸브를 다 필요로 하지는 않으며, 기억할 만한 한 줄은 복잡성은 그것이 결과를 눈에 띄게 개선함이 증명될 때에만 더하는 것을 고려해야 한다는 것입니다[^S1]. 통제된 환경에서 서너 턴 도는 작은 도구는 `MAX_TURNS` 하나로 족할 수 있습니다. 네 밸브는 여러 턴을 연달아 돌고 영향이 큰 행동에 손을 뻗을 수 있는 경우를 위한 것입니다.

<!-- exercises -->
## 💻 연습

### 레벨 1: 하네스에 도구별 계층 제어 밸브 더하기

지금 승인 밸브는 설정이 둘입니다. 영향이 크면 묻고, 나머지는 전부 허용. 제품 담당 동료가 더 세밀한 요구를 냅니다 — 도구 이름별로 세 계층으로 제어하기: `allow`(그대로 통과, `get_time`처럼), `ask`(실행 전에 사람 확인 필요, `write_file`처럼), `deny`(항상 거부, 아예 호출 불가, 은퇴한 `send_email`처럼). 이 정책 밸브를 하네스에 더하세요. 데이터 구조를 설계하고, 루프의 어느 단계에 있어야 하며 기존 승인 밸브와 어떤 관계인지 말하고, `deny`에 걸렸을 때 모델에게 무엇이 돌아가야 하는지 써 보세요.

<!-- rubric -->
- 세 계층을 표현할 수 있는 정책 구조를 제시(가령 `{ get_time: "allow", write_file: "ask", send_email: "deny" }`)하고, 기본 계층을 진술(목록에 없는 도구가 어느 계층에 떨어지는지)
- 정책 밸브를 `runToolUses` 안, `tool_use` 블록별로, impl 실행 전에 배치 — 승인 밸브와 같은 위치이고, `ask` 계층은 기존 확인 로직을 재사용
- `deny`에 걸리면 도구를 실행하지 않되, 조용히 떨어뜨리는 대신 정책이 이 도구를 금지함을 모델에게 알리는 `is_error: true` `tool_result`를 여전히 반환

<!-- answer -->
데이터 구조: 도구 이름에서 계층으로 가는 맵과, 목록에 없는 도구가 떨어지는 기본 계층입니다(보수적으로, `ask`나 `deny`를 기본값으로 두는 것이 합리적입니다 — `allow`를 기본값으로 두지만 마세요).

```javascript
const POLICY = { get_time: "allow", read_file: "allow", write_file: "ask", send_email: "deny" };
const DEFAULT_POLICY = "ask"; // 목록에 없는 도구는 보수적으로 확인을 요구한다
```

위치: 승인 밸브가 앉는 바로 그곳 — `runToolUses` 안, 각 `tool_use` 블록을 훑으며, `impl`이 호출되기 전입니다. 세 계층 중 둘, `ask`와 `deny`는 둘 다 도구가 실제로 돌기 전에 가로채야 하고, 그것이 승인 밸브가 가로채는 바로 그 순간입니다. 사실 이것은 승인 밸브의 일반화입니다. 원래 것은 영향이 큼 = ask, 나머지 = allow의 두 계층과 동등했고, 이제 `deny` 계층이 하나 더 생긴 것입니다.

```javascript
for (const block of toolUseBlocks) {
  const policy = POLICY[block.name] ?? DEFAULT_POLICY;

  if (policy === "deny") {
    results.push({
      type: "tool_result", tool_use_id: block.id,
      content: `도구 ${block.name}은(는) 정책으로 금지돼 있어, 실행하지 않았습니다.`, is_error: true,
    });
    continue; // impl을 아예 건드리지 않는다
  }
  if (policy === "ask") {
    const ok = await opts.approve?.(block.name, block.input);
    if (!ok) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: "사용자가 이 행동을 거부해, 실행하지 않았습니다.", is_error: true,
      });
      continue;
    }
  }
  // allow, 또는 승인된 ask: 실행한다
  const output = await toolImpls[block.name](block.input);
  results.push({ type: "tool_result", tool_use_id: block.id, content: output });
}
```

`deny`에 걸렸을 때의 핵심은 거부된 승인과 같습니다. 실행하지 않되, `is_error: true` `tool_result`는 여전히 반환하는 것입니다. 모든 `tool_use`에는 대응하는 결과가 돌아와야 하기 때문입니다[^S6]. "이 도구는 금지됐다"는 말을 들은 모델은 대개 다른 도구로 갈아타거나, 할 수 없다고 사용자에게 분명히 말하지, 굳어 버리지 않습니다.

<!-- hint -->
먼저 스스로에게 물어보세요. 세 계층 중 어느 것이 도구 실행 전에 가로채야 합니까? `deny`와 `ask` 둘 다입니다. `allow`는 아닙니다 — 그러니 이 밸브는 승인 밸브가 가는 곳, `impl(...)` 줄 앞에만 갈 수 있습니다.

<!-- hint -->
거부되거나 거절된 호출을 매달아 두지 마세요. 명세는 한 턴의 모든 `tool_use`가 다음 user 메시지에 `tool_result`를 갖기를 요구합니다. 실행을 거부해도 여전히 하나를 반환해야 하고(`is_error`로 표시), 그러지 않으면 다음 요청이 결과 누락으로 에러가 납니다.

### 레벨 2: 이 루프에는 어떤 게이트가 빠졌고, 어떻게 폭주하는가

한 동료가 아래 하네스 루프가 "돌아간다"고 말하지만, 모델이 스스로 `end_turn`을 반환하기를 멈추거나 제자리걸음에 빠지는 순간 무너집니다. 짚어 주세요. (1) 어떤 제어가 없고 각 부재가 어떤 폭주 행동을 낳는지, (2) 최소한의 수정 — 루프가 반드시 멈추도록 보장하는 하드 경계 적어도 하나 — 을, 그것이 어느 단계에 가는지 분명히 밝혀서.

```javascript
async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });

  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, toolImpls);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  }
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

<!-- rubric -->
- 멈출지 계속할지의 결정을 모델의 `stop_reason`에 통째로 맡기고 명시적 정지 조건이 없음을 지적 — 모델이 `tool_use`를 계속 반환하는 한 영영 돈다는 것, 그것이 바로 자율적 루프에서 제어를 따로 붙들어야 하는 지점
- 폭주를 적어도 두 종류 명명: 모델이 결코 마무리하지 않아 턴이 한계 없이 태워지는 것(턴/예산 폭주), 그리고 같은 도구를 같은 인자로 반복 호출하는 것(무진행)이 결코 감지되지 않는 것
- 최소 수정: `MAX_TURNS` 카운터와 체크를 더하고, 체크는 `turns++` 앞, 루프 본문 맨 위에 두어, 루프가 반드시 멈추도록 보장

<!-- answer -->
(1) 빠진 제어: 모델 자신의 `end_turn` 말고는, 이 코드에 명시적 정지 조건도, 예산 상한도, 무진행 감지도, 영향이 큰 행동에 대한 승인도 없습니다. 결과를 하나씩 보면:

- **명시적 정지 조건 없음**: 모델이 매 턴 `tool_use`를 반환하는 한, `while` 조건은 참으로 남고 루프는 영영 돕니다. 에이전트의 자율성은 이미 여러 턴을 돌 수 있음을 뜻하고, 비용이 오르며 에러가 누적 증폭하는데[^S1], 여기에는 하드 경계가 하나도 없어 — 순전히 모델이 마무리할 만큼 얌전하기만을 기댑니다.
- **예산 상한 없음**: 히스토리는 매 바퀴 자라고(레슨 2), 토큰은 오르기만 하며, 긴 실행은 아무도 멈추지 않는 채 예산을 태워 없앱니다.
- **무진행 감지 없음**: 모델이 같은 도구를 같은 인자로 계속 호출하며 제자리걸음을 하면, 이 코드는 그것을 전부 받아들이고 헛돎을 결코 알아채지 못합니다.
- **승인 밸브 없음**: `toolImpls`에 `write_file` 같은 영향이 큰 것이 있으면 무조건 실행되고, 한 번의 오판이 돌이킬 수 없는 결과를 낼 수 있습니다.

(2) 최소 수정: 루프가 반드시 멈추도록 보장하는 하드 경계 적어도 하나 — `MAX_TURNS` — 를 더합니다. 카운터는 루프 바깥에서 초기화하고, 체크는 본문 맨 위, `turns++` 앞에 갑니다.

```javascript
const MAX_TURNS = 8;
async function runAgent(userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;
  let response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });

  while (response.stop_reason === "tool_use") {
    if (turns >= MAX_TURNS) return `Hit the max turn limit of ${MAX_TURNS}, stopping on my own`; // 하드 경계, 맨 위에
    turns++;

    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, toolImpls);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  }
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

그 하나를 더하면, 모델이 마무리하든 안 하든, 헛돌든 안 돌든, 루프는 많아야 `MAX_TURNS` 바퀴 돌고 반드시 빠져나옵니다 — 제어를 모델에게서 호스트 손안으로 되찾는 가장 기본적인 단계입니다[^S1]. 예산, 무진행, 승인은 필요에 따라 그 위에 얹을 수 있습니다.

<!-- hint -->
`while (response.stop_reason === "tool_use")` 줄을 노려보세요. 모델이 `end_turn`을 반환하기로 하는 것 말고, 그것을 `false`로 만들 수 있는 것이 조금이라도 있습니까? 없다면, 루프가 멈추느냐는 전적으로 모델의 몫입니다.

<!-- hint -->
"반드시 멈추는" 경계는 모델 출력과 무관하게 호스트가 스스로 유지하는 카운터에 기댑니다. 그 카운터를 어디서 초기화하고, 어디서 증가시키고, 어디서 체크할지 따져 보세요 — 체크는 증가 앞에 가야, 한 바퀴를 더 흘려보내지 않습니다.

<!-- /exercises -->

## 정리

- 돌아가는 하네스의 핵심은 여전히 레슨 2의 루프다: `messages`를 실은 요청을 보낸다 → `stop_reason`을 확인하고, `tool_use`이면 도구를 돌리고 `tool_result`를 도로 꿰어 다시 보낸다; 아니면 텍스트를 반환하고 마무리한다[^S2]. 진짜 SDK로 갈아 끼우는 것은 `callModel`을 `client.messages.create(...)`로 바꿀 뿐이다
- 콘텐츠 블록 필드는 하나도 빠뜨리지 않고 명세를 따른다: `tool_use`는 `id` / `name` / `input`을 싣고, `tool_result`는 `tool_use_id` / `content`에 실패 시 `is_error`를 더한다; 한 턴에 `tool_use` 블록이 몇 개든 그만큼의 `tool_result`가 돌아오며, 전부 바로 뒤따르는 하나의 `user` 메시지에 담긴다[^S6]
- 네 제어 밸브는 각각 한 자리를 지키고 위치를 뒤섞을 수 없다: 최대 턴 수(레슨 3)와 예산 상한(레슨 4)은 루프가 반드시 멈추게 하는 하드 경계이고, 무진행 감지(레슨 4)는 제자리걸음을 잡고, 승인 밸브(레슨 5)는 도구 실행 앞에 끼워 넣어야 한다 — 에이전트의 자율성은 더 높은 비용과 에러의 누적 증폭을 데려오고 모델이 여러 턴을 돌 수 있어[^S1], 모델 자신의 `end_turn`으로는 붙들 수 없기 때문이다
- 영향이 큰 행동에 사람의 확인을 요구하는 승인 밸브는 과도한 에이전시 위험을 누르는 권장 방법이다[^S4]. 거부되더라도 `is_error` `tool_result`를 반환하고 호출을 매달아 두지 않는다[^S6]
- 하네스는 깊은 프레임워크가 아니다. 여러분이 직접 쓰고 제어하는 이 루프-더하기-밸브의 층이다 — 같은 모델, 다른 제어 코드, 그리고 신뢰성은 엄청나게 갈릴 수 있다[^S5]. 다만 밸브를 밸브 자체를 위해 쌓지도 마라. 복잡성은 결과를 눈에 띄게 개선함이 증명될 때에만 더하라[^S1]

이 코스를 마쳤습니다. "하네스란 무엇인가"에서 네 제어 밸브가 달린 루프를 손으로 쓰기까지, 지금 여러분 손에 든 것은 개념 한 묶음만이 아닙니다 — 실제로 돌아가고, 고칠 수 있고, 제어를 계속 더할 수 있는 진짜 코드입니다. 여러분 자신의 도구에 물려, 여러분을 위해 일을 좀 시켜 보세요.
