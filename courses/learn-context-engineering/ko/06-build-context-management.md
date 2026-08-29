# 레슨 6: 실습: 하네스에 컨텍스트 관리 배선하기

> 학습 목표:
> - stop_reason이 구동하는 하네스 루프에 토큰 사용량 추적을 배선하기: `response.usage`로 누적하고, 컨텍스트가 윈도 한계에 가까워졌는지 판단하기
> - 레슨 4의 `compact()`를 임계값으로 발동하는 메커니즘으로 바꾸기: 발동 비율을 정하고, 발동 뒤 `messages`와 사용량 카운터가 어떻게 되어야 하는지 따져 보기
> - 구조화된 노트를 이 컴팩션 흐름에 배선해 새 윈도가 다시 시작할 때마다 `NOTES.md`를 읽어 들이게 하고, 단일 윈도 용량을 넘어서는 작업을 돌려 보기
>
> 전제: 컴팩션과 노트를 다룬 레슨 4와 서브에이전트 격리를 다룬 레슨 5를 마쳤고, 이 시리즈의 코스 7 '에이전트 하네스 기초: 루프와 통제'의 하네스 루프를 손 닿는 곳에 두고 있을 것 | 이전: [레슨 5 <<](./05-subagent-context-isolation.md)

## 먼저, 돌아가는 것을 본다

앞의 다섯 레슨은 모두 원리였습니다. 왜 컨텍스트가 유한한 자원인지, 컴팩션은 어떻게 작동하는지, 노트는 어떻게 작동하는지, 서브에이전트는 어떻게 격리하는지. 이번 레슨은 그중 앞의 둘 — 컴팩션과 노트 — 을 이 시리즈의 코스 7에서 쓴 하네스 루프에 용접합니다. 먼저 돌아가는 모습을 보고, 그다음에 코드를 풀어헤치겠습니다.

아래는 실제 실행 로그입니다(여러 턴의 모델 응답을 흉내 내는 스텁 클라이언트를 써서 긴 작업이 몇 줄의 로그에 담기게 했습니다. 스텁 클라이언트 구현은 이 레슨 끝에 나옵니다). 작업은 레슨 4에서 낯익은 그 장면, 주문 서비스의 동시성 경쟁 버그를 고치는 일입니다. 몇 턴 안에 컴팩션을 발동시키려고 데모는 일부러 아주 작은 컨텍스트 윈도를 설정합니다.

```text
[호출 1] stop_reason=tool_use tokensUsed=400
[호출 2] stop_reason=tool_use tokensUsed=1050
[호출 3] stop_reason=tool_use tokensUsed=1850
[호출 4] >>> 컴팩션 발동(1회차), tokensUsed를 0으로 리셋
[호출 5] stop_reason=tool_use tokensUsed=280
[호출 6] stop_reason=end_turn tokensUsed=490

최종 응답: orders 테이블에 version 필드를 추가하고 낙관적 잠금을 배선했습니다. 경쟁 버그는 수정되었습니다.
모델 호출 합계: 6(컴팩션 호출 1회 포함)
컴팩션 발동 횟수: 1

최종 NOTES.md 내용:
## 내린 결정
- 수정 방침: 데이터베이스 낙관적 잠금(orders 테이블에 version 필드 추가)
## 미해결
- (없음 -- updateStatus 경쟁은 낙관적 잠금 병합으로 해결)
```

한 줄씩 읽어 봅시다. 처음 세 번의 호출이 `tokensUsed`를 400, 1050, 1850으로 밀어 올립니다. 세 번째 라운드의 도구 결과가 히스토리에 덧붙여진 뒤 누적값이 설정한 임계값을 넘으므로, 하네스는 윈도가 실제로 터지기를 기다리지 않고 스스로 컴팩션 호출을 쏩니다(호출 4. 이 응답은 메인 루프에 들어가지 않고 그 출력이 `messages`를 다시 시작하는 데 곧바로 쓰이므로 `stop_reason`은 더 이상 상관없습니다). `tokensUsed`는 0으로 리셋되고, 이어지는 두 라운드는 새 윈도에서 새로 세어지다가 모델이 마무리합니다. 이 전체 과정에서 사용자 눈에 보이는 산출물은 단 하나, 저 최종 응답뿐입니다. 컴팩션과 노트는 무대 뒤에서 일어납니다. 이번 레슨의 나머지는 저 로그 뒤에 있는 코드를 한 줄씩 짓는 일입니다.

## I. 루프에 토큰 사용량 추적을 배선한다

첫걸음은 소박합니다. 지금까지 토큰을 얼마나 썼는지 아는 것. 컴팩션할지 말지 판단하는 전제가 그것이기 때문입니다. 이 필드는 이 시리즈의 코스 7에서 예산 밸브(밸브 2)를 쓸 때 이미 써 봤습니다 — `response.usage`는 이번 호출의 `input_tokens`와 `output_tokens`를 담고 있고, 응답을 받을 때마다 그것들을 누적기에 더합니다.

```javascript
function trackUsage(tokensUsed, response) {
  return tokensUsed + response.usage.input_tokens + response.usage.output_tokens;
}
```

코스 7의 `TOKEN_BUDGET` 밸브는 이 누적값을 한 가지 용도로 썼습니다. 상한에 닿으면 멈추기. 이번 레슨이 하는 것은 다른 일입니다. 훨씬 이른 비율에서 스스로 컴팩션하고, 멈추지 않고 작업을 계속하기. 쓰는 누적기는 같고, 발동 뒤에 일어나는 일이 완전히 다릅니다 — 한쪽은 브레이크를 밟고, 다른 쪽은 숨을 고릅니다.

윈도 자체는 얼마나 클까요. 그것은 당신 자신의 엔지니어링 판단으로 정의하는 상수입니다.

```javascript
const CONTEXT_WINDOW = 2000; // 몇 턴 안에 발동시키기 위한 작은 데모용 윈도. 실제 프로젝트에서는 모델의 실제 한계로 설정한다
const COMPACT_RATIO = 0.7;   // 임계값: 사용량이 윈도의 70%를 넘으면 컴팩션한다

function shouldCompact(tokensUsed) {
  return tokensUsed >= CONTEXT_WINDOW * COMPACT_RATIO;
}
```

`COMPACT_RATIO`를 얼마로 할지에는 정답이 없습니다 — 규격서의 조항이 아니라 엔지니어링 판단입니다. 너무 높게 잡으면 '이제 컴팩션할 때다'를 깨달았을 무렵 윈도가 이미 빠듯해 다음 요청조차 보내지 못할 수 있고, 너무 낮게 잡으면 컴팩션이 필요 이상으로 일찍 그리고 자주 작업을 끊어 모델 호출을 낭비합니다. 경험칙으로는 30% 남짓의 여유를 남기는 것(곧 임계값 0.7)이 대체로 잘 통하며, 구체적인 숫자는 실제 모델의 윈도 크기와 단일 턴 도구 출력의 부피를 보고 조정해야 합니다.

## II. 임계값 발동 컴팩션: 레슨 4의 `compact()`를 루프에 배선한다

메커니즘이 정해졌으니 다음 단계는 그것을 루프 본문에 배선하는 일입니다. 레슨 4의 결론을 떠올려 보세요. 컴팩션은 요약본을 옛 대화에 도로 욱여넣고 계속 쥐어짜는 것이 아니라, 그 요약본으로 새 윈도를 **다시 시작**하며 옛 `messages`를 통째로 버리는 것입니다[^S1]. 루프에 배선하면 그것은 적절한 순간에 `messages`를 통째로 갈아 끼우는 것을 뜻합니다.

```javascript
while (response.stop_reason === "tool_use") {
  messages = await appendToolResults(messages, response, toolImpls); // 레슨 5의 헬퍼를 재사용

  if (shouldCompact(tokensUsed)) {
    messages = await compact(client, messages); // 다시 시작: 통째로 갈아 끼운다
    tokensUsed = 0;                              // 새 윈도, 0부터 센다
  }

  response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  tokensUsed = trackUsage(tokensUsed, response);
}
```

이 코드가 옳은지는 세 위치가 결정합니다.

- **점검이 놓이는 자리**: 이번 라운드의 도구 결과가 `messages`에 덧붙여진 직후, 다음 `client.messages.create` 앞. 너무 이르면(덧붙이기 전에 점검하면) 방금 나온 도구 출력을 놓치고, 너무 늦으면(점검 뒤에 덧붙이면) 이미 임계값을 넘긴 내용으로 요청을 한 번 더 보내게 됩니다.
- **컴팩션 뒤 `messages`는 덧붙이는 것이 아니라 통째로 갈아 끼운다**: `compact()`의 반환값을 `messages`에 곧바로 대입하고, 수십 번의 도구 왕복이 든 옛 배열은 버립니다 — 그것이 '다시 시작'과 '옛 대화에 계속 쌓기'를 가르는 경계입니다.
- **`tokensUsed`는 반드시 0으로 리셋한다**: 새 윈도는 요약본에서 출발하므로 사용량도 이 요약본부터 세어야지, 옛 윈도의 누적값을 계속 지고 가면 안 됩니다. 이 단계를 빠뜨리는 것은 흔한 함정이며, 이번 레슨의 연습이 바로 그것을 진단합니다.

`compact()` 자체는 레슨 4의 구현을 재사용합니다. `COMPACT_INSTRUCTION`과 선별 원칙(이미 내린 아키텍처 결정과 아직 풀리지 않은 버그와 핵심 구현 세부는 보존하고, 중복된 도구 출력은 버린다)은 그대로입니다[^S1]. 다음 절에서 여기에 새 능력을 하나 더합니다. 다시 시작할 때 요약본뿐 아니라 `NOTES.md`도 읽는 것입니다.

## III. 폴백으로서의 구조화된 노트: 컴팩션 때 NOTES.md를 읽어 들인다

컴팩션은 수동적이고 사후적입니다 — '발동하는 순간 윈도에 남아 있는 것'을 요약합니다. 노트는 능동적이고 쓰면서 남기는 보험이라는 것은 레슨 4에서 이미 설명했습니다. 에이전트는 결정과 문제가 일어나는 그 순간에 윈도 바깥의 `NOTES.md`에 씁니다[^S1]. 둘을 함께 배선하는 방법은 소박합니다. **새 윈도가 다시 시작할 때 요약본을 읽는 것에 더해 `NOTES.md`도 함께 읽어 들이는 것** — 그러면 이번 라운드의 요약 선별이 실수를 했더라도 노트에 독립된 사본이 남아 있습니다.

먼저 에이전트에게 노트를 쓸 도구를 줍니다.

```javascript
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const NOTES_PATH = path.join(process.cwd(), "NOTES.md");

async function readNotes() {
  try {
    return await readFile(NOTES_PATH, "utf8");
  } catch {
    return "(NOTES.md는 아직 비어 있음)";
  }
}

async function writeNotes(content) {
  await writeFile(NOTES_PATH, content, "utf8");
}

const NOTES_TOOL = {
  name: "update_notes",
  description: "저장하고 싶은 전체 내용으로 NOTES.md를 덮어쓴다. 아키텍처 결정, 미해결 문제, 다음 단계 계획을 기록하는 용도",
  input_schema: {
    type: "object",
    properties: { content: { type: "string" } },
    required: ["content"],
  },
};

const toolImpls = {
  update_notes: async ({ content }) => {
    await writeNotes(content);
    return "NOTES.md 갱신됨";
  },
  // ...당신의 다른 도구들
};
```

`update_notes`의 `input`은 저장할 **전체** 노트 내용이고, 구현은 그것을 통째로 씁니다 — 가장 단순한 의미론입니다. 에이전트는 하나의 완결된 노트 뭉치를 유지하고, 갱신은 매번 '이것이 현재 상태다'를 뜻하며, 다뤄야 할 증분 병합은 없습니다. 시스템 프롬프트에 요구사항을 배선하세요. "중요한 결정을 내렸을 때, 새 문제를 발견했을 때, 한 단계를 마쳤을 때는 `update_notes`를 호출해 노트를 갱신하고 나서 계속하라". 레슨 4에서와 똑같습니다.

그다음이 이번 레슨의 새 단계입니다. `compact()`가 요약본을 만든 뒤, `NOTES.md`도 읽어 다시 시작 메시지에 넣습니다.

```javascript
async function compact(client, messages) {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: COMPACT_INSTRUCTION + "\n\n" + formatHistory(messages),
    }],
  });
  const summary = resp.content.find((b) => b.type === "text").text;
  const notes = await readNotes(); // 새로 추가: 윈도 바깥의 노트를 함께 데려온다
  return [{
    role: "user",
    content:
      "아래는 지금까지의 작업에 대한 인수인계 요약본입니다. 여기서부터 이어 가세요:\n\n" + summary +
      "\n\n아래는 현재 NOTES.md의 내용입니다:\n" + notes,
  }];
}
```

새 윈도가 깨어날 때 그것은 두 가지 재료를 갖습니다. 모델 자신의 요약본과, 에이전트가 손으로 쓴 노트. 앞의 것은 요약 선별 때문에 세부를 잃을 수 있고, 뒤의 것은 손실이 없습니다 — 그것이 레슨 4의 '노트가 부지런할수록 컴팩션이 무언가를 떨어뜨렸을 때의 대가가 가벼워진다'를 코드로 옮긴 모습입니다.

```agentmentor-check
{
  "id": "ctx-zh-06-notes-every-turn",
  "label": "NOTES.md를 매 턴 시스템 프롬프트에 욱여넣자는 제안 평가하기",
  "prompt": "compact()가 '다시 시작할 때 NOTES.md를 한 번 읽는' 코드를 본 뒤, 동료가 한 발 더 나가자고 제안합니다. NOTES.md의 전문을 그냥 시스템 프롬프트에 넣어 매 요청마다 함께 나가게 하면, 컴팩션 발동을 기다릴 것 없이 모델이 늘 최신 노트를 볼 수 있다는 것입니다. 이 제안을 어떻게 보십니까?",
  "whyHere": "앞의 코드 블록이 방금 '컴팩션으로 다시 시작하는 순간에만 노트를 한 번 읽는다'를 보여 주었습니다. 그것이 의도된 설계임을 독자가 알아채지 못하면 '노트를 매 턴 데려가는 편이 더 안전하지 않을까'로 흐르기 쉽습니다. 여기서는 노트의 외부화가 내용을 늘 보이게 하는 것이 아니라 윈도를 차지하지 않게 하는 것임을 독자가 이해했는지 검증해야 합니다.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "더 철저하고 더 안전하다: 노트가 어차피 그렇게 크지도 않으니 매 턴 데려가면 정보 손실이 없고 손해도 없다",
      "correct": false,
      "feedback": "'그렇게 크지 않다'는 상대적입니다. 노트는 작업이 진행될수록 길어지고, 시스템 프롬프트는 매 턴 새로 보내지는 내용입니다. 그것을 매 턴 시스템 프롬프트에 욱여넣는다는 것은 노트의 전체 부피가 작업 내내 주의 예산을 되풀이해 소모한다는 뜻입니다 — 그리고 노트를 외부화한다는 것은 바로 그 상태를 윈도 바깥으로 옮겨 두고 필요할 때만 가져온다는 뜻입니다."
    },
    {
      "id": "b",
      "text": "권하지 않는다: 새로 들어오는 토큰마다 주의 예산을 얼마간 소모하고, 노트를 외부화한다는 것은 그것이 윈도를 차지하지 않는다는 뜻이다. 진짜로 다시 시작하는 순간에 한 번 읽는 편이 매 턴 데려가는 것보다 경제적이다",
      "correct": true,
      "feedback": "정답입니다. 노트를 윈도 바깥에 쓰는 것은 그것이 매 턴의 주의 예산을 차지하지 않게 하기 위해서이며, 새로 들어오는 토큰마다 그 예산을 얼마간 소모합니다. 컴팩션으로 다시 시작하는 순간은 윈도가 진짜로 '새로운 기억 묶음으로 갈아탄' 시점이고, 그때 노트를 한 번 읽는 것은 합당한 비용입니다. 같은 내용을 매 턴 되풀이해 욱여넣는 것은 '바깥'에 둔 것을 '안'으로 도로 옮기는 셈이며, 노트가 길어질수록 그 비용은 눈덩이처럼 불어납니다."
    },
    {
      "id": "c",
      "text": "상관없다: 노트든 요약본이든 어차피 다음 컴팩션이 다시 요약할 테니 몇 번 읽든 최종 결과에 영향을 주지 않는다",
      "correct": false,
      "feedback": "여기서의 비용은 '최종 결과가 맞느냐'가 아니라 '그 결과에 이르는 데 주의 예산을 얼마나 쓰느냐'입니다. 노트 전문을 매 턴 데려가는 것은 턴마다 실제로 발생하는 토큰과 예산 비용이며, 언젠가의 컴팩션이 그것을 요약해 줄지와는 별개의 문제입니다 — 컴팩션이 일어나기 전에 이미 중복된 노트 사본이 주의 밀도를 꾸준히 끌어내리고 있었습니다."
    }
  ]
}
```

## IV. 하나로 합치기: 단일 윈도 용량을 넘어서는 작업

세 부품 — 사용량 추적, 임계값 발동 컴팩션, `NOTES.md` 읽고 쓰기 — 을 같은 `runAgent`에 배선하면 첫머리 로그 뒤에 있는 온전한 코드가 나옵니다.

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-sonnet-5";

async function runAgent(userInput, tools, toolImpls, opts = {}) {
  let messages = [{ role: "user", content: userInput }];
  let tokensUsed = 0;

  let response = await client.messages.create({
    model: MODEL, max_tokens: 1024, tools, messages,
  });
  tokensUsed = trackUsage(tokensUsed, response);

  while (response.stop_reason === "tool_use") {
    messages = await appendToolResults(messages, response, toolImpls);

    if (shouldCompact(tokensUsed)) {
      messages = await compact(client, messages);
      tokensUsed = 0;
      opts.onCompact?.();
    }

    response = await client.messages.create({
      model: MODEL, max_tokens: 1024, tools, messages,
    });
    tokensUsed = trackUsage(tokensUsed, response);
  }

  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

이것이 첫머리 로그의 온전한 출처입니다. 세 번의 도구 호출이 `tokensUsed`를 400, 1050, 1850으로 밀어 올려 `2000 * 0.7 = 1400`이라는 임계선을 넘습니다. `compact()`가 호출되고, `messages`는 통째로 갈아 끼워지고, 카운터는 0으로 리셋됩니다. 그다음 새 윈도에서 두 라운드가 더 돌고 모델이 마무리합니다. 이 실행 전체에서 컴팩션은 한 번만 일어났지만, 작업이 계속되어 임계값에 다시 닿았다면 같은 로직이 두 번째, 세 번째로 발동했을 것입니다 — `shouldCompact`는 이것이 몇 번째 윈도인지 신경 쓰지 않고 현재 윈도의 사용량만 봅니다. '단일 윈도 용량을 넘어서는 작업을 돌린다'는 것은 그런 뜻입니다. 작업의 총 길이는 어느 한 윈도의 용량에 매이지 않고, 오직 '중단 없이 이어지는 한 번의 추론'에만 매입니다.

온전한 검증을 돌리려면, 여러 턴의 모델 응답을 흉내 내는 스텁 클라이언트를 붙이세요(실제 호출에서는 `new Anthropic()`으로 갈아 끼우면 되고, `runAgent` 코드는 한 글자도 바뀌지 않습니다).

```javascript
let callIndex = 0;
const queue = [ /* ...호출 순서대로 담은 응답들. 4번째가 컴팩션 자신의 응답... */ ];

const stubClient = {
  messages: {
    create: async () => queue[callIndex++],
  },
};
```

이런 스텁 클라이언트로 검증하는 값어치는, '이번 턴에 모델이 도구를 호출할지, 토큰을 얼마나 썼는지'를 알려진 양으로 못 박아 준다는 데 있습니다. 그래서 컴팩션이 몇 번째 턴에 발동하는지, `tokensUsed`가 0으로 리셋되는지, `NOTES.md`가 쓰인 다음 읽혀 들어오는지 — 그 모든 것을 실제 호출 출력을 노려보며 짐작하는 대신 단언문으로 점검할 수 있습니다.

## 분량 감각: 모든 작업에 이 장치가 필요한 것은 아니다

여기까지 배선하고 나면 잘못된 인상을 품기 쉽습니다. 이제부터 에이전트를 쓸 때는 사용량 추적과 임계값 컴팩션과 구조화된 노트를 한 묶음으로 넣는 것이 기본이라는 인상입니다. 레슨 2에서 세운 분량 감각으로 돌아갑시다. 복잡함을 더하는 일은 그것이 결과를 실증적으로 개선할 수 있을 때에만 검토합니다[^S2]. 열몇 턴 안에 끝나는 작업에서 컴팩션도 노트도 군더더기 부품입니다 — 이 시리즈의 코스 7의 맨 루프와 기본 제어 밸브에서 시작하고, 실제로 윈도 한계에 부딪히거나 '새 윈도가 옛 윈도가 한 일을 모른다'는 기억상실 증상을 본 다음에 이 층을 더하세요.

여기까지 와서, 이 코스가 레슨 1부터 레슨 6까지 가르친 모든 것 — 주의 예산, 시스템 프롬프트의 고도, 적시 검색, 컴팩션과 노트, 서브에이전트 격리 — 은 같은 결론 하나로 모입니다. 매 턴 모델이 보아야 할 것은 언제나 당신이 거듭 되짚는 엔지니어링 판단이지, 한 번 정해 두고 잊는 설정이 아닙니다.

<!-- exercises -->
## 💻 연습

### 레벨 1: 컴팩션이 언제 발동하는지 추적하기

어떤 하네스가 `CONTEXT_WINDOW = 6000`과 `COMPACT_RATIO = 0.75`로 설정되어 있습니다. 작업을 돌린 뒤 연속된 네 턴의 턴별 사용량(`input_tokens + output_tokens` 합)은 1200, 1500, 900, 1100입니다. 답하세요.

1. 몇 번째 턴 뒤에 컴팩션이 발동합니까? 발동 순간의 누적 `tokensUsed`는 얼마입니까?
2. 컴팩션이 발동하고 완료된 뒤 `tokensUsed`는 얼마여야 합니까?
3. 컴팩션 직후의 다음 모델 호출이 `usage = { input_tokens: 300, output_tokens: 100 }`을 돌려준다면 `tokensUsed`는 얼마가 됩니까?

<!-- rubric -->
- 임계값을 `6000 * 0.75 = 4500`으로 옳게 계산하고, 네 턴의 사용량을 옳게 누적한다: 1200, 2700, 3600, 4700. 4번째 턴 뒤의 누적값 4700이 처음으로 임계값에 닿거나 넘으므로 그 시점에 컴팩션이 발동함을 짚는다
- 컴팩션이 완료된 뒤 `tokensUsed`는 0으로 리셋되어야 함을 분명히 밝힌다. 새 윈도의 사용량은 이 요약본부터 세어야지 옛 윈도의 누적값을 이어받으면 안 되기 때문이다
- 리셋 뒤 첫 호출을 `tokensUsed = 0 + 300 + 100 = 400`으로 옳게 계산한다

<!-- answer -->
1. 턴마다 누적하면 1턴 뒤 1200, 2턴 뒤 2700, 3턴 뒤 3600, 4턴 뒤 4700입니다. 임계값은 `6000 * 0.75 = 4500`이고, 4700이 네 값 가운데 처음으로 임계값에 닿거나 넘는 누적값이므로 컴팩션은 **4번째 턴 뒤**에 발동하며, 그때 누적 `tokensUsed`는 **4700**입니다.
2. 컴팩션은 `compact()`가 돌려주는 다시 시작 메시지로 `messages`를 통째로 갈아 끼우고, 새 윈도는 이 요약본(그리고 `NOTES.md`)에서 새로 출발하므로 `tokensUsed`는 **0**으로 리셋되어야 합니다 — 옛 윈도의 4700을 계속 지고 가면 안 됩니다. 그러지 않으면 다음 턴의 점검이 늘 '윈도가 이미 매우 찼다'고 잘못 판단합니다.
3. 리셋 뒤 첫 호출이 `usage = { input_tokens: 300, output_tokens: 100 }`을 돌려주므로 `tokensUsed = 0 + 300 + 100 = 400`입니다.

<!-- hint -->
네 턴의 사용량을 정직하게 누적해 앞부분 합의 수열로 만든 다음, 각각을 임계값 `6000 * 0.75`와 견주어 선을 넘는 첫 위치를 찾으세요.

<!-- hint -->
컴팩션의 '다시 시작'은 메시지 배열을 갈아 끼우는 것만이 아닙니다. 사용량 카운터도 새 출발점을 받아야 합니다 — 그것이 실제로 무엇을 세고 있는지 생각해 보세요. '지금까지의 역사적 총 사용량'입니까, '현재 윈도의 사용량'입니까.

### 레벨 2: '컴팩션 폭풍' 진단하기

누군가 임계값 발동 컴팩션을 루프에 배선했는데, 한 줄을 빠뜨렸습니다.

```javascript
while (response.stop_reason === "tool_use") {
  messages = await appendToolResults(messages, response, toolImpls);

  if (shouldCompact(tokensUsed)) {
    messages = await compact(client, messages);
    // tokensUsed = 0 이 빠짐
  }

  response = await client.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  tokensUsed = trackUsage(tokensUsed, response);
}
```

배선한 뒤 작업은 어느 턴까지 돌다가 컴팩션이 처음 발동했습니다. 그런데 그때부터는 새 윈도가 한두 턴밖에 지나지 않아 쌓인 내용이 아주 적은데도 매 턴 컴팩션이 다시 발동합니다. 왜 이런 일이 벌어지는지 설명하고 수정을 제시하세요.

<!-- rubric -->
- 근본 원인을 짚는다: `tokensUsed`는 계속 늘어나기만 하는 누적기이고, 첫 컴팩션 발동 시점에 이미 임계값에 닿거나 넘어 있었다. 리셋하지 않으면 이후의 `trackUsage`는 그 위에 계속 더하기만 하므로 첫 발동 이후 `shouldCompact(tokensUsed)`는 늘 참이다
- 결과를 설명한다: 매 턴 또 `compact()`가 발동해(모델 호출 낭비) 새 윈도의 실제 사용량은 임계값 근처에도 못 갔는데 컴팩션이 필요 이상으로 잦아지고, 호출을 낭비하며 작업을 느리게 만들 수 있다
- 수정: `compact()` 성공 뒤에 `tokensUsed = 0` 한 줄을 더해, 카운터의 의미론이 '역사적 총 사용량'이 아니라 '현재 윈도의 사용량'으로 유지되게 한다

<!-- answer -->
근본 원인은 `shouldCompact`가 점검하는 `tokensUsed`가 계속 늘어나기만 하는 누적기라는 데 있습니다. 첫 컴팩션이 발동하는 순간 `tokensUsed`는 이미 임계값에 닿거나 넘어 있습니다. `compact()`가 `messages`를 깨끗한 새 윈도로 갈아 끼우지만, 코드는 `tokensUsed`를 새 윈도에 맞는 출발점으로 되돌리는 것을 잊었습니다. 그래서 다음 `trackUsage(tokensUsed, response)`는 이미 임계값을 넘긴 그 수에 더 얹기만 할 뿐이며, 새 윈도의 이번 턴이 실제로 토큰을 얼마나 더했든 상관없이 첫 발동 이후 `shouldCompact(tokensUsed)`는 영구히 참입니다. 결과는 이렇습니다. 새 윈도가 한두 턴밖에 지나지 않아 내용이 아주 적은데도 다음 루프 머리의 점검이 여전히 걸리고, 그래서 `compact()`를 또 호출하고, 또 호출합니다. 군더더기 컴팩션 하나하나가 여분의 모델 호출입니다. 작업은 나아가야 하는데 대신 '요약하고, 다시 시작하고, 또 요약하고'를 제자리에서 돌고 있습니다.

수정은 리셋 줄을 되돌려 놓는 것뿐입니다.

```javascript
if (shouldCompact(tokensUsed)) {
  messages = await compact(client, messages);
  tokensUsed = 0; // 새 윈도, 0부터 센다
}
```

더하고 나면 `tokensUsed`의 의미론은 '현재 윈도가 얼마나 썼는가'가 되고, 컴팩션은 새 윈도 자체가 임계값만큼 사용량을 쌓았을 때에만 다시 발동합니다. 옛 윈도의 역사적 숫자에 끌려다니지 않고 말입니다.

<!-- hint -->
`shouldCompact`는 `tokensUsed`를 고정된 임계값과 견주기만 합니다. 컴팩션이 발동하는 순간 `tokensUsed`는 임계값에 견주어 큽니까, 작습니까? 그 뒤로 한 번도 줄어들지 않는다면 이후의 모든 비교 결과는 어떻게 됩니까?

<!-- hint -->
레벨 1을 참고하세요. 컴팩션이 완료된 뒤 `tokensUsed`는 무엇을 나타내야 합니까? '작업 시작부터 지금까지의 총 사용량'입니까, '현재 윈도의 사용량'입니까? 이 버그는 정확히 그 두 의미론을 뒤섞은 것입니다.

<!-- /exercises -->

## 정리

- 하네스에 사용량 추적을 배선하는 데는 누적기 하나면 된다. 응답을 받을 때마다 `response.usage.input_tokens + response.usage.output_tokens`를 더한다. 코스 7의 `TOKEN_BUDGET` 밸브와 데이터는 같지만 발동 뒤의 동작이 다르다 — 예산 밸브는 상한에 닿으면 멈추고, 이번 레슨의 임계값은 컴팩션하고 작업을 계속한다.
- 임계값 발동 컴팩션은 레슨 4의 `compact()`를 루프 본문에 배선한다. 점검은 '이번 라운드의 도구 결과가 다 덧붙여진 뒤, 다음 요청이 나가기 전'에 놓인다. 발동 뒤 `messages`는 컴팩션 결과로 통째로 갈아 끼워진다 — 덧붙이기가 아니라 다시 시작이다[^S1]. `tokensUsed`도 함께 리셋해야 하며, 그러지 않으면 컴팩션이 되풀이되는 폭풍에 빠진다.
- 노트와 컴팩션은 이번 레슨에서 함께 배선된다. `update_notes` 도구가 쓰면서 남기고 — 그것이 컨텍스트 윈도 바깥에 노트를 영속화하는 것이다[^S1] — `compact()`는 요약본을 만드는 것에 더해 `NOTES.md`를 다시 시작 메시지로 읽어 들인다. 요약본은 선별 때문에 내용을 잃을 수 있고, 노트는 손실 없는 사본으로 읽혀 들어온다. '윈도 재시작 같은 결정적 순간에만 한 번 읽고, 매 턴 시스템 프롬프트에 욱여넣지 않는다'는 주의 예산 원칙(새로 들어오는 토큰마다 그 예산을 소모한다[^S1])에 기댄 이번 레슨의 엔지니어링 맞바꿈이다.
- 한 번의 온전한 종단 간 검증이 보여 준다. 세 번의 도구 호출이 사용량을 400에서 1850으로 밀어 올려 임계값을 넘겨 컴팩션을 한 번 발동시키고, 카운터가 리셋되고, 새 윈도에서 두 라운드를 더 돌아 마무리한다 — 작업의 총 길이는 더 이상 단일 윈도 용량에 매이지 않고, 오직 '중단 없이 이어지는 한 번의 추론'에만 매인다.
- 이 장치를 기본 설정으로 여기지 마라. 추가된 복잡함이 결과를 실증적으로 개선할 수 있을 때에만 더한다[^S2]. 몇 턴이면 끝나는 작업이라면 이 시리즈의 코스 7의 맨 루프와 기본 제어 밸브로 충분하다.
