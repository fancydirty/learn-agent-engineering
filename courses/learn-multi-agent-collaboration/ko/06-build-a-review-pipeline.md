# 레슨 6: 핸즈온: 두 에이전트 리뷰 파이프라인 만들기

> 학습 목표:
> - Claude API로 정말로 실행 가능한 프로듀서-리뷰어 두 에이전트 파이프라인을 쓰기
> - 리뷰어가 뭉뚱그린 "괜찮아 보임" 대신 구조화되고 점검 가능한 리뷰 결과를 돌려주게 하기
> - 프로듀서와 리뷰어가 끝없이 서로 다듬지 않도록 루프에 안전밸브를 달기
>
> 전제: 레슨 1~5를 마쳤고, 기본적인 JavaScript/Node.js를 읽을 수 있으며, 동작하는 Claude API 키가 있다 | 이전: [레슨 5 <<](./05-failure-and-coordination.md)

## 먼저, 결과: 한 번의 완전한 실행

이것이 레슨 끝까지 가면 실행하게 될 것입니다. 터미널에 과제를 건네면, 두 에이전트가 리뷰를 통과하거나 라운드 제한에 도달할 때까지 번갈아 합니다.

```
$ node review-pipeline.js "Write an API change announcement for developers: the v2 endpoint changes the user_id field from a number to a string"

[Producer v1]
The v2 endpoint is here! Hugely improved experience — please switch to the new version soon.

[Reviewer round 1] Rejected. Issues:
- Doesn't spell out the specific field this change affects (never mentions that user_id goes from number to string)
- Gives no migration advice; developers don't know how to update their code
- "Hugely improved experience" is an unverifiable, exaggerated claim with no concrete basis

[Producer v2]
v2 API change notice: the user_id field type changes from number to string.
Check every piece of code that parses this field and switch the read logic from numeric to string,
to avoid parse failures caused by the type mismatch. This change takes effect in v2.1.0.

[Reviewer round 2] Approved

Final draft (approved in round 2):
v2 API change notice: the user_id field type changes from number to string.
Check every piece of code that parses this field and switch the read logic from numeric to string,
to avoid parse failures caused by the type mismatch. This change takes effect in v2.1.0.
```

첫 버전은 리뷰어에게 반려되며, 이유가 각 구체적 기준에 묶여 나옵니다. 프로듀서는 두 번째 버전으로 수정하고, 리뷰어가 다시 보며, 이번에는 통과합니다. 이것이 레슨 4의 **프로듀서-리뷰어** 패턴을 코드로 옮긴 것입니다. "one LLM call generates a response while another provides evaluation and feedback in a loop."[^S2] (한 LLM 호출이 응답을 생성하고, 다른 하나가 루프 안에서 평가와 피드백을 제공합니다.)

## 전체적인 형태: 실행 루프와 같은 골격

이 시리즈에서 Agent Tool Calling: Getting Agents to Actually Do Things 코스를 들었다면, 이 파이프라인의 골격은 낯익을 것입니다. 루프, 라운드마다 한 번의 판단, 계속할지 정하는 결과, 그리고 무한 루프를 막는 안전밸브. 유일한 차이는 그 판단이 무엇을 판단하느냐입니다 — 그 코스의 도구 실행 루프는 "모델이 아직 도구를 호출하고 싶어 하는가"를 판단하지만(루프의 의미는 그 코스의 레슨 The Full Round-Trip of a Tool Call과 그 공식 출처에 있습니다), 여기서는 "리뷰어가 통과라고 했는가"를 판단합니다. 같은 골격, 루프 본문의 내용만 다릅니다.

파이프라인 전체는 세 함수를 꿰맨 것입니다. `runProducer`는 텍스트를 생성하거나 수정하고, `runReviewer`는 기준에 비추어 점수를 매기고 구체적 메모를 주며, `runPipeline`은 둘을 루프로 잇고 안전밸브로 라운드 상한을 둡니다.

## 1단계: 프로듀서 — 과제를 받아 텍스트를 만든다

첫 실행에서 프로듀서는 과제 자체만 갖습니다. 반려 후 두 번째 실행에서는 **이전 버전 전체**와 리뷰 메모까지 지니므로, 프로듀서는 처음부터 자유롭게 다시 쓰는 것이 아니라 메모에 따라 이전 버전 위에서 수정합니다.

```js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5"; // 계정이 호출할 수 있는 모델로 교체
const MAX_ROUNDS = 3; // 안전밸브: 프로듀서-리뷰어는 최대 3라운드까지 다듬어 무한 루프를 피한다

async function runProducer(task, feedback, prevDraft) {
  const prompt = feedback
    ? `Task: ${task}\n\nYour previous version was:\n"""\n${prevDraft}\n"""\n\nThe reviewer rejected it with these notes:\n${feedback}\n\nRevise your previous version according to these notes. Return the full revised text only, with no extra explanation.`
    : `Task: ${task}\n\nReturn the text only, with no extra explanation.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "";
}
```

프로듀서의 프롬프트는 자기완결적입니다. 레슨 3에서 다뤘듯, 서브에이전트는 오케스트레이터 쪽에서 무슨 일이 있었는지 볼 수 없고, 지난번에 어떻게 리뷰받았는지도 볼 수 없습니다[^S3]. 그래서 매 호출은 "과제가 무엇인지", "이전 버전이 무엇이라 했는지", "(있다면) 지난 라운드의 문제가 무엇이었는지"를 이번 호출의 프롬프트에 그대로 씁니다. 프로듀서 자신의 이전 초안조차 명시적으로 넘겨줘야 한다는 점에 유의하세요 — 이것이 자기완결 원칙에서 가장 놓치기 쉬운 절반입니다. Messages API는 무상태이고, 모든 요청은 필요한 이력 전체를 담아야 하며, 서버는 요청 사이에 아무것도 보관하지 않습니다[^S8]. "이전 버전을 수정하라"는 이전 버전이 실제로 이 프롬프트에 쓰여 있을 때만 의미가 있습니다.

## 2단계: 리뷰어 — 구체적 기준에 비추어 점수 매기기, 뭉뚱그린 판정 금지

리뷰어는 모델에게 그냥 "이거 괜찮아?"라고 묻지 않습니다. 레슨 5에서 다뤘듯, 검증은 인상 기반 점수가 아니라 구체적이고 점검 가능한 기준에 착지해야 합니다[^S1]. 여기서 리뷰어는 명시적 체크리스트를 받고, 고정된 JSON 형식으로 답하도록 요구받습니다.

```js
const REVIEW_CRITERIA = [
  "Does it clearly state the specific field or endpoint this change affects (not just 'something changed' or 'better experience')?",
  "Does it give concrete migration advice, telling developers how to update their code?",
  "Is the whole announcement kept under 150 words?",
  "Are there any unverifiable, exaggerated claims (like 'hugely improved' with no concrete basis)?",
];

async function runReviewer(task, draft) {
  const prompt = `You are the reviewer. You only find problems; you do not rewrite. Task requirements: ${task}

Review criteria (check each one; do not give a vague verdict):
${REVIEW_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Text to review:
"""
${draft}
"""

Reply strictly in the JSON format below, with no text outside the JSON:
{"approved": true or false, "issues": ["list each criterion that failed, with the specific problem for each; if all pass, give an empty array"]}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "{}";
}
```

`approved`와 `issues` 필드가 함께 **구조화된 리뷰 결과**를 이룹니다. 단 하나의 "괜찮아"가 아니라 "통과 또는 실패" 더하기 "실패한 각 기준 뒤의 구체적 문제"입니다. 프로듀서는 `issues`를 손에 넣으면, 뭉뚱그린 판정에서 어디로 가야 할지 넘겨짚는 대신 그 구체적 문제들을 수정합니다.

## 3단계: 리뷰 결과를 맹목적으로 믿지 마라 — 파싱 실패는 반려로 취급한다

`runReviewer`는 실제 JSON 객체가 아니라 문자열을 돌려주므로, 여전히 파싱해야 합니다. 리뷰어가 "엄격히 JSON으로 답하라"는 지시를 받았어도, 구조화 출력 제약이 없으면 모델은 여전히 구문적으로 잘못된 JSON을 만들거나, 필드를 빠뜨리거나, JSON을 코드 블록으로 감싸고 그 주위에 설명 몇 줄을 두를 수 있습니다[^S9]. 여기서의 함정은 이것입니다. 파싱이 실패하면 무슨 일이 일어나는가? 게으른 길 — 파싱 실패 시 기본적으로 통과시키기 — 을 택하면, "리뷰어가 제 일을 하지 않았다"는 실패를 조용히 "리뷰 통과"로 바꿔 버립니다. 그것이 바로 레슨 5가 지적한 요점입니다. "완료된 것처럼 보이는" 출력이 실제로 정확한 출력과 같지 않으며, 검증할 수 없는 것은 출시해서는 안 됩니다[^S6]. 여기서는 정반대로 합니다. 파싱 실패는 언제나 **반려**로 세고, 결코 통과로 세지 않습니다.

```js
function extractJson(raw) {
  // 모델은 때때로 JSON을 코드 블록으로 감싼다. 먼저 펜스를 벗겨 본다
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
}

function parseReview(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.issues)) {
      throw new Error("field shape is wrong");
    }
    return parsed;
  } catch (err) {
    return {
      approved: false,
      issues: [`Reviewer did not reply in the agreed format. Raw content: ${raw.slice(0, 200)}`],
    };
  }
}
```

`typeof parsed.approved !== "boolean"`과 `!Array.isArray(parsed.issues)` 줄은 같은 생각을 확장한 것입니다 — `JSON.parse`가 성공하더라도 파싱된 필드가 올바른 형태인지 여전히 확인하고, 필드 타입이 틀린 것도 반려로 셉니다. "적어도 유효한 JSON이잖아"라고 경계를 늦추지 마세요.

한마디 덧붙이면, 응답이 스키마에 엄격히 맞도록 샘플링 수준에서 보장하는 공식 구조화 출력 기능이 있습니다[^S9]. 이 레슨은 모델 출력을 맹목적으로 믿을 수 없다는 것을 직접 느끼게 하려고 일부러 "맨 호출 더하기 직접 짠 방어적 파싱" 방식을 씁니다. 프로덕션에서는 구조화 출력을 써서 이 함정을 통째로 없앨 수 있습니다.

## 4단계: 루프로 엮고, 안전밸브를 달기

`runProducer`, `runReviewer`, `parseReview`를 손에 쥐고, `runPipeline`이 셋을 엮습니다. 그리고 `MAX_ROUNDS`가 여기 유일한 안전밸브입니다 — 프로듀서와 리뷰어가 이론상 끝없이 다듬을 수 있으므로 상한이 있어야 합니다.

```js
async function runPipeline(task) {
  let draft = await runProducer(task);
  console.log(`[Producer v1]\n${draft}\n`);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const review = parseReview(await runReviewer(task, draft));

    if (review.approved) {
      console.log(`[Reviewer round ${round}] Approved`);
      return { draft, rounds: round, approved: true };
    }

    console.log(`[Reviewer round ${round}] Rejected. Issues:\n- ${review.issues.join("\n- ")}\n`);

    if (round === MAX_ROUNDS) {
      return { draft, rounds: round, approved: false, issues: review.issues };
    }

    draft = await runProducer(task, review.issues.join("\n"), draft);
    console.log(`[Producer v${round + 1}]\n${draft}\n`);
  }
}

const task =
  process.argv[2] ??
  "Write an API change announcement for developers: the v2 endpoint changes the user_id field from a number to a string";

runPipeline(task)
  .then((result) => {
    if (result.approved) {
      console.log(`Final draft (approved in round ${result.rounds}):\n${result.draft}`);
    } else {
      console.log(
        `Hit the max round count (${MAX_ROUNDS}) without passing review. Emitting the last version for human review:\n${result.draft}\n\n` +
          `Issues left unresolved in the last round:\n- ${result.issues.join("\n- ")}`
      );
    }
  })
  .catch((err) => {
    // API 호출 자체도 실패할 수 있다(네트워크, 인증, 레이트 리밋). 그것도 조용히 삼키지 않는다
    console.error(`Pipeline run failed: ${err.message}`);
    process.exitCode = 1;
  });
```

`MAX_ROUNDS`에 도달했는데도 통과하지 못하면, `runPipeline`은 억지로 "통과" 판정을 내리지 않습니다. 마지막 초안과 아직 풀리지 않은 문제들을 정직하게 사람의 리뷰에 넘깁니다 — 이 역시 레슨 5의 요점을 마무리 단계에 적용한 것입니다. 결과 통합 단계가 판단할 수 없는 것에 부딪히면, 코드로 스스로 결정해 덮어 버려서는 안 됩니다.

```agentmentor-check
{
  "id": "mac-zh-06-invalid-review-json",
  "label": "리뷰어가 합의된 형식으로 답하지 않았다 — 무엇을 해야 하는가",
  "prompt": "이 파이프라인을 실행하던 중, 리뷰어가 한 번 엄격한 JSON으로 답하지 않고 대신 '슬쩍 훑어봤는데 내용은 대체로 괜찮습니다'라는 줄을 덧붙여, `JSON.parse`가 예외를 던지게 만듭니다. 파이프라인을 계속 돌아가게 하려고, 이 파싱 실패를 통과한 리뷰로 취급해야 합니까?",
  "whyHere": "'그냥 통과로 취급해 프로그램을 계속 돌리자'는 파싱이 실패하는 바로 그 순간에 솔깃한 손쉬운 수단입니다. 레슨 5의 원칙 — '그럴듯해 보이는 출력이 실제로 정확한 출력과 같지 않다' — 로 그 생각을 되받아치고, 그 원칙을 직접 짠 코드에 적용할 수 있는지 시험할 자리입니다.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "그렇다 — 리뷰어가 '대체로 괜찮다'고 했으니 통과시켜 파이프라인이 멈추지 않게 한다",
      "correct": false,
      "feedback": "아닙니다. 이것이 바로 레슨 5가 경고한 신뢰-후-검증 격차입니다. 리뷰어가 합의된 JSON 형식으로 답하지 않았다는 것은 이번에 각 기준을 표준에 비추어 점검하지 않았다는 뜻이고, 자연어로 '대체로 괜찮다'는 구조화된 리뷰 결과를 대신할 수 없습니다. 파싱 실패를 통과로 취급하면 '리뷰어가 제 일을 하지 않았다'는 실패를 조용히 '리뷰 통과'로 재포장해 내놓는 것입니다."
    },
    {
      "id": "b",
      "text": "그렇다 — 프로듀서의 텍스트 자체가 괜찮아 보이기만 하면, 리뷰어가 답하는 형식은 중요하지 않다",
      "correct": false,
      "feedback": "아닙니다. 리뷰어의 응답 형식은 파이프라인이 '통과 또는 실패'를 자동으로 결정하는 데 쓰는 바로 그 하나의 신호입니다. 형식을 마음대로 무시해도 여전히 통과로 셀 수 있다면, 리뷰 단계는 빈 껍데기이고, 당신이 설계한 구조화 리뷰 기준은 의미를 잃습니다."
    },
    {
      "id": "c",
      "text": "아니다 — 파싱 실패는 반려로 세야 한다. 날것 응답을 이슈로 기록하고 재시도하거나 사람에게 에스컬레이션한다",
      "correct": true,
      "feedback": "정답입니다. 리뷰 결과 형식이 틀린 것은 그 자체로 '이것을 검증할 수 없다'는 상황이며, 레슨 5의 원칙에 따라 검증할 수 없는 것은 출시해서는 안 됩니다. 이 레슨의 `parseReview`가 그렇게 다룹니다. 파싱 실패는 언제나 `approved: false`를 돌려주고 날것 내용을 이슈로 기록하므로, 흐름이 조용히 통과하는 대신 반려로 이어집니다."
    }
  ]
}
```

<!-- exercises -->
## 💻 연습

### 레벨 1: 일단 돌린 다음, 리뷰 기준을 하나 추가하기

이 레슨의 코드를 `review-pipeline.js`로 조립하고, `npm install @anthropic-ai/sdk`, `npm pkg set type=module`을 실행하고, `ANTHROPIC_API_KEY`를 설정한 뒤, 이 레슨의 예시 과제를 한 번 실행하세요. "Approved"를 보기 전에 적어도 한 번의 "Rejected" 라운드를 보는지 확인하세요. (프로듀서의 첫 버전이 그대로 통과해 버리면, 걸려 넘어지기 쉬운 과제로 바꾸세요 — 예를 들어 일부러 "a very short announcement"를 요청하되 얼마나 짧아야 하는지는 말하지 않는 식으로.)

돌아가면, `REVIEW_CRITERIA`에 새 기준을 하나 추가하세요: "Does the text mention the specific version number where the change takes effect?" 다시 실행해서 리뷰어의 `issues`에 이제 이 새 기준에 묶인 메모가 들어가는지 확인하세요.

<!-- rubric -->
- 파이프라인이 실제로 돌아가고, 로그에 프로듀서의 첫 버전과 적어도 한 라운드의 리뷰 메모가 나온다
- 추가한 리뷰 기준이 정말로 리뷰 결과를 바꾼다 — 그 정보가 빠진 초안이 표시된다
- 끝내 통과하지 못하고 `MAX_ROUNDS`에 도달하면 파이프라인이 최종적으로 무엇을 출력하는지(크래시가 아니라, 마지막 버전과 풀리지 않은 문제를 넘기는 것) 설명할 수 있다

<!-- answer -->
`REVIEW_CRITERIA` 배열에 항목을 하나 더 추가합니다.

```js
const REVIEW_CRITERIA = [
  "Does it clearly state the specific field or endpoint this change affects (not just 'something changed' or 'better experience')?",
  "Does it give concrete migration advice, telling developers how to update their code?",
  "Is the whole announcement kept under 150 words?",
  "Are there any unverifiable, exaggerated claims (like 'hugely improved' with no concrete basis)?",
  "Does the text mention the specific version number where the change takes effect?",
];
```

`runReviewer`나 `runPipeline`의 코드는 건드릴 필요가 없습니다 — 리뷰 기준은 템플릿 문자열을 통해 리뷰어의 프롬프트에 이어 붙으므로, 배열 원소를 하나 추가하면 리뷰어가 다음 호출에서 새로 늘어난 전체 목록을 항목별로 점검합니다. 프로듀서의 초안이 버전 번호를 계속 언급하지 못하면, `issues`에 이 기준에 대한 구체적 메모가 실리고, 프로듀서는 다음 라운드에서 그 메모에 맞춰 수정합니다.

<!-- hint -->
프로듀서의 첫 버전이 그대로 통과해 "Rejected" 로그 줄을 전혀 못 본다면, 과제가 프로듀서가 만족시키기에 너무 쉬운 것입니다 — 리뷰 기준을 더 엄격하게 하거나, 프로듀서가 첫 패스에서 놓치기 쉬운 구체적 요구사항을 과제에 추가해 보세요.

<!-- hint -->
`MAX_ROUNDS`에 도달했는데도 통과하지 못했을 때, `runPipeline`의 마지막 대목을 다시 보세요 — 그것은 예외를 던져 프로그램을 크래시시키지 않습니다. `approved: false`에 더해 마지막 초안과 이슈 목록을 담아 정상적으로 반환하고, 무엇을 할지는 호출한 쪽 코드에 맡깁니다.

### 레벨 2: 일부러 망가뜨린 다음, 고치기

아래 `parseReview`에는 문제가 있습니다. 먼저 이것이 실제로는 리뷰된 적 없는 초안을 "approved"로 통과시키게 되는 상황을 설명한 다음, 고친 코드를 제시하세요.

```js
// 망가진 버전
function parseReview(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { approved: true, issues: [] };
  }
}
```

<!-- rubric -->
- 문제를 정확히 짚음: 파싱 실패 시 `approved: true`를 돌려주어, "리뷰어가 합의된 형식으로 답하지 않았다"는 실패를 "리뷰 통과"로 취급한다
- 이것이 가져오는 구체적 결과를 설명(레슨 5의 "맹목적으로 믿을 수 없다" 원칙에 묶어서)
- 고침은 파싱 실패 폴백을 `approved: false`로 바꾸고, 날것 내용을 `issues`에 기록해 분류 또는 프로듀서 재시도에 쓴다

<!-- answer -->
문제는 `catch` 분기가 폴백을 `{ approved: true, issues: [] }`로 둔 것입니다. 리뷰어가 이번에 JSON으로 답하지 않을 때마다(설령 잡담 한 줄을 덧붙였을 뿐이라도) `JSON.parse`가 예외를 던지고, `catch` 분기가 "실제로 리뷰된 적 없는" 초안을 즉시 "approved"로 표시해 통과시킵니다. 이것이 바로 레슨 5가 경고한 것입니다. "완료된 것처럼 보이는" 출력이 실제로 정확한 출력과 같지 않으며, 검증할 수 없는 상황을 통과한 결과로 받아 출시해서는 안 됩니다.

고침은 파싱 실패를 언제나 반려로 세게 하는 것입니다.

```js
function parseReview(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.issues)) {
      throw new Error("field shape is wrong");
    }
    return parsed;
  } catch (err) {
    return {
      approved: false,
      issues: [`Reviewer did not reply in the agreed format. Raw content: ${raw.slice(0, 200)}`],
    };
  }
}
```

<!-- hint -->
리뷰어가 "합의된 형식으로 답하지 않은" 구체적 경우에 자신을 놓아 보세요 — 폴백이 "approved"라면, 그 초안은 어떤 효과적인 점검도 없이 내놓아진 것이고, 리뷰어가 아예 돌지 않은 것과 다르지 않습니다.

<!-- hint -->
폴백이 무엇이어야 할지 정하려면, 질문을 뒤집으세요. 파싱 실패는 "문제 없음이 확인됨"에 가까운가, 아니면 "문제가 있는지 확인할 수 없음"에 가까운가? 레슨 5의 답: 확인할 수 없다면, 문제 없음으로 취급하지 마라.

<!-- /exercises -->

## 정리

- 프로듀서-리뷰어 파이프라인의 골격은 실행 루프와 같은 것이다: 루프, 라운드마다 한 번의 판단, 계속할지 정하는 결과, 그리고 무한 루프를 막는 안전밸브. 이 패턴의 공식 정의가 바로 "one LLM call generates a response while another provides evaluation and feedback in a loop"[^S2]이며 — 여기서 판단이 "도구를 호출해야 하는가"에서 "리뷰어가 통과라고 했는가"로 바뀐다.
- 프로듀서의 프롬프트는 자기완결적이다: 매 호출은 과제, 이전 버전 전체, (있다면) 지난 라운드의 구체적 문제를 프롬프트에 그대로 쓴다 — Messages API는 무상태이고, 모든 요청은 이력 전체를 담아야 하며, 요청 사이에 아무것도 보관되지 않으므로[^S8], 모델이 지난 라운드에 무슨 일이 있었는지 스스로 기억하리라 기대할 수 없다[^S3].
- 리뷰어는 구체적이고 점검 가능한 기준에 비추어 항목별로 점수를 매기고, 뭉뚱그린 판정이 아니라 구조화된 `{approved, issues}`를 돌려준다[^S1].
- 리뷰어가 돌려주는 것도 맹목적으로 믿을 수 없다 — 파싱 실패나 필드 형태 오류는 조용한 통과가 아니라 반려로 세야 한다[^S6]. 이 원칙은 "서브에이전트가 하는 말을 믿는 것"뿐 아니라 "서브에이전트가 돌려주는 데이터 형식을 믿는 것"에도 적용된다.
- 최대 라운드 수에 도달했는데도 통과하지 못하면, 파이프라인은 코드로 스스로 통과를 결정하지 말고 마지막 초안과 풀리지 않은 문제를 정직하게 사람의 리뷰에 넘겨야 한다.

이것으로 이 코스의 여섯 레슨을 모두 마쳤습니다. "왜 여러 에이전트인가"에서 출발해, 오케스트레이터와 서브에이전트가 어떻게 일을 나누는지, 위임 프롬프트를 어떻게 쓰는지, 어떤 협업 패턴이 어떤 시나리오에 맞는지, 실패를 어떻게 다루는지를 거쳐, 마지막으로 동작하는 프로듀서-리뷰어 파이프라인을 직접 만드는 것으로 끝냈습니다. 다음에 할 가장 값어치 있는 일은 설명을 다시 읽는 것이 아니라, 손에 든 작고 실제적인 과제 하나를 골라 이 파이프라인 골격에 떨어뜨리고, 리뷰 기준을 손보고, 돌려서 초안을 반려하는지 몇 번이나 반려하는지 보는 것입니다. 리뷰 기준을 직접 한 번 조율해 보는 것이 이론을 열 번 다시 읽는 것보다 낫습니다.
