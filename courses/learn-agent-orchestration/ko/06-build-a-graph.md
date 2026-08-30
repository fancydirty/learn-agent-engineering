# 레슨 6: 실습: 하네스를 작은 그래프로 끌어올리기

> 학습 목표:
> - 앞선 다섯 레슨의 라우팅, 팬아웃, 병합, 리뷰 회로, 보고를 `orchestrate.mjs` 하나로 용접하기 — 계획은 코드에 살고, 각 노드는 여전히 코스 7(에이전트 하네스 기초: 루프와 통제)의 `stop_reason` 루프를 돌리며, 중간 결과는 스크립트 변수에 머문다
> - 리뷰 회로를 실제로 돌려 보고, 그것이 멈추는 두 가지 방식을 함께 보기 — 게이트 리포트 하나로 고쳐지고 끝난 티켓 하나, 두 회차 연속 같은 리포트를 돌려주어 더는 진척이 없다고 판정되고 needs_human으로 표시된 티켓 하나
> - 그래프 전체의 실행 자취를 `run-state.json`과 `run.jsonl`에 남기고, 실제 실행 요약표와 맞춰 보기 — 어느 노드가 얼마를 썼는지, 모델 호출 몇 번인지, 토큰 몇인지, 게이트 회차 몇인지
>
> 전제: 레슨 1~5를 마치고, 코스 7(에이전트 하네스 기초: 루프와 통제)의 하네스 루프를 돌릴 수 있어야 합니다 | 이전: [레슨 5 <<](./05-evaluator-and-graphs.md)

## 먼저, 돌아가는 것을 봅니다

앞선 다섯 레슨은 부품을 하나씩 떼어 놓았습니다. 계획을 누가 쥐는가(레슨 1), 체이닝과 라우팅(레슨 2), 섹셔닝과 투표 그리고 상한이 있는 동시 실행 풀(레슨 3), 오케스트레이터-워커와 위임 프롬프트의 네 요소(레슨 4), 리뷰 회로와 이 패턴들을 레슨 5가 "그래프"라 부르는 것으로 조합하는 법(레슨 5). 이 레슨은 그것들을 한 파일로 용접합니다.

과제는 일부러 평범합니다. `inbox/`에 고객지원 티켓 6장이 있고, 할 일은 각각에 그대로 보낼 수 있는 회신을 쓰는 것입니다. 먼저, 끝났을 때의 모습입니다.

```text
\$ node orchestrate.mjs
inbox/에서 티켓 6장 받음: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[fanout] 동시 실행 상한 2, 초안 6건 생성
[merge] out/에 6개 파일 기록, 하류로는 참조와 한 줄 요약만 넘김
[review] 게이트 재작성: 총 2회차

=== 그래프 전체 실행 요약 ===
노드      시간    모델 호출   토큰     게이트 회차 상태
route     65ms    1           720      -           ok
fanout    262ms   8           8903     -           ok
merge     1ms     0           0        -           ok
review    129ms   2           3033     2           ok

=== 티켓별 내역 ===
티켓     범주      처리자            게이트 회차 정지 사유       상태
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     template          0           gate_pass       pass

출력 디렉터리 out/: 회신 6건; 사람에게 넘길 것: 1건
  - T-1004 (no_progress): 티켓 T-1004: 상호를 개인에서 회사…
추적: run-state.json / run.jsonl (run_id=run-mtem3c80)
\$ echo \$?
1
```

이 레슨의 모든 터미널 출력은 이 스크립트의 실제 실행에서 한 줄씩 옮겨 온 것입니다. 손으로 지어낸 예시는 한 줄도 없습니다. 실행할 때마다 바뀌는 것은 둘입니다. 밀리초 단위 시간, 그리고 `run_id`(36진수 타임스탬프입니다). 나머지는 전부 — 분류 결과, 호출 횟수, 토큰 수, 게이트 회차, 어느 티켓이 `needs_human`인지 — 못 박힌 상수입니다. 이유는 뒤의 "검증 세팅" 절에서 설명합니다.

먼저 들여다볼 만한 것은 마지막의 그 `1`입니다. 이것은 에러가 아니라 판정입니다. 티켓 6장 중 하나가 자동으로 끝나지 못했으므로 종료 코드가 0이 아닙니다. 이 그래프는 실행할 때마다 CI나 크론 잡이 파싱할 수 있는 결론을 냅니다. 로그 더미가 아닙니다.

## 그래프는 어떻게 생겼는가: 계획은 `main()`의 저 열몇 줄이다

스크립트의 뼈대부터 봅니다. "그래프"와 "노드"라는 말은 레슨 5가 도입한 어휘입니다. 이것은 우리 자신의 시각 체계이지 공식 개념이 아니며, 딱 하나의 1차 자료 닻 위에 서 있습니다. 워크플로 스크립트 자체가 루프, 분기, 중간 결과를 쥡니다[^S5]. 아래 조각은 그 진술을 글자 그대로 구현한 것입니다.

레슨 5는 조합된 그래프를 먼저 그렸습니다. 이 그래프는 그것의 **변형**이며 차이가 셋입니다. 레슨 5는 난이도로 "단순 / 복잡"을 나눴지만 여기서는 주제로 `billing` / `bug` / `other`를 나눕니다. 레슨 5의 팬아웃은 "복잡한 티켓 하나를 워커 셋에게 보낸 뒤 병합"이었지만 여기서는 섹셔닝입니다 — "티켓 여섯 장에 각각 처리자 하나". 레슨 5의 되돌아가는 엣지는 별도의 `[초안]` 노드로 돌아갔지만, 여기서는 원래의 워커로 돌아갑니다. 왜 이렇게 바꿨는지는 끝의 "정산표" 절에 모아 두었습니다.

```javascript
async function main() {
  seedWorkspace();
  initLog();
  saveState();

  const tickets = loadInbox();
  console.log(`inbox/에서 티켓 ${tickets.length}장 받음: ${tickets.map((t) => t.id).join(", ")}`);

  const { routed } = await node("route", () => routeNode(tickets));
  console.log(`[route] ${routed.map((t) => `${t.id}=${t.category}`).join("  ")}`);

  const { drafts } = await node("fanout", () => fanoutNode(routed));
  console.log(`[fanout] 동시 실행 상한 ${POOL_SIZE}, 초안 ${drafts.length}건 생성`);

  const { items } = await node("merge", async () => mergeNode(drafts));
  console.log(`[merge] out/에 ${items.length}개 파일 기록, 하류로는 참조와 한 줄 요약만 넘김`);

  if (process.env.STOP_AFTER === "merge") {
    console.log("[stop] STOP_AFTER=merge: 리뷰 앞에서 멈춥니다. 이번 실행에는 판정이 없습니다");
    process.exit(2);
  }

  const byId = new Map(routed.map((t) => [t.id, t]));
  const reviewed = await node("review", () => reviewNode(items, byId));
  console.log(`[review] 게이트 재작성: 총 ${reviewed.totalRounds}회차`);

  const { needsHuman } = await node("report", async () => reportNode(items, reviewed.totalRounds));

  process.exit(needsHuman > 0 ? 1 : 0);
}
```

`routed`, `drafts`, `items` — 이 `const` 선언 셋이 그래프 전체의 상태입니다. 평범한 JavaScript 변수이지 무슨 타입 붙은 상태 객체가 아니며, 병합 전략 같은 것도 없습니다. 중간 결과는 스크립트 변수에 머물고[^S5], 노드는 함수 반환값으로 데이터를 넘깁니다. 전체 그림을 보는 모델은 없습니다. 라우팅 모델은 티켓 본문 여섯 개만 보고, 청구 워커는 배정된 티켓 하나만 보고, 리뷰 게이트는 회신 파일 하나만 봅니다.

이것이 워크플로와 에이전트의 아키텍처 구분이 코드에서 어떻게 생겼는지입니다. LLM과 도구가 미리 정의된 코드 경로를 통해 오케스트레이션되는 것이지[^S1], 모델이 자기 프로세스를 자율적으로 지휘하는 것[^S1]이 아닙니다.

노드 다섯, 각각이 한 구간을 맡습니다.

| 노드 | 하는 일 | 누가 하는가 |
| --- | --- | --- |
| `route` | 값싼 호출 한 번으로 티켓 여섯 장을 세 범주로 나눔 | 모델 루프 하나 |
| `fanout` | 범주에 따라 전문 워커에게 보냄, 동시 실행에 상한 | 모델 루프 두 종류 + 순수 코드 템플릿 하나 |
| `merge` | 출력을 디스크에 내리고, 하류로는 참조와 한 줄 요약만 넘김 | 순수 코드 |
| `review` | 결정론적 게이트가 먼저 거르고, 실패한 것이 검사-수정-재검사로 들어감 | 순수 코드 + 필요할 때만 모델 루프 |
| `report` | 요약표를 찍고 종료 코드를 정함 | 순수 코드 |

다섯 노드 중 실제로 모델을 부르는 것은 둘뿐입니다. **모든 노드가 모델일 필요는 없습니다.** 이것이 이 레슨에서 가장 값싸면서 가장 놓치기 쉬운 규칙입니다. `merge`와 `report`는 순수 함수이고, `fanout`의 `other` 범주는 문자열 템플릿을 쓰고, `review`의 첫 여과는 `includes` 몇 줄입니다. 결정론적 코드가 같은 답을 낼 수 있는 자리라면, 모델 호출의 값과 지연을 치를 이유가 없습니다.

## 노드 내부: 여전히 코스 7의 그 루프

가장 안쪽 계층을 먼저 못 박아야 그래프가 이해됩니다. 각 모델 노드의 내부에서는 코스 7(에이전트 하네스 기초: 루프와 통제)의 `stop_reason` 루프가 그대로 돌아갑니다.

```javascript
async function runAgent(client, system, userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // —— 밸브 1: 최대 턴 수. 루프 본문 첫머리, turns++ 앞 ——
    if (turns >= MAX_TURNS) {
      return `최대 턴 수 ${MAX_TURNS}에 도달해 중단합니다(작업이 너무 어렵거나 모델이 막혔을 수 있습니다)`;
    }
    turns++;

    // 이번 턴의 응답 전체(assistant 역할)를 히스토리에 덧붙입니다
    messages.push({ role: "assistant", content: response.content });

    // 이번 턴의 tool_use 블록을 모두 실행하고, 각각을 tool_result로 감쌉니다
    const toolResults = await runToolUses(response.content, toolImpls);

    // 한 턴에서 나온 tool_result 블록은 바로 다음 user 메시지에 함께 들어갑니다
    messages.push({ role: "user", content: toolResults });

    // 길어진 히스토리로 다시 보내고, while 조건으로 되돌아갑니다
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // stop_reason이 더는 tool_use가 아니므로, 최종 텍스트를 뽑아 돌려줍니다
  return response.content.find((b) => b.type === "text")?.text ?? "";
}
```

루프 본문의 네 단계 — assistant 밀어 넣기, 도구 실행, tool_result 밀어 넣기, `response` 재대입 — 는 코스 7의 레슨 6과 한 글자도 다르지 않고, 주석까지 그대로 옮겼습니다. 밸브 1(최대 턴 수)도 원래 자리에 있습니다. 루프 본문의 첫머리, `turns++` 앞입니다. 루프에 최대 반복 횟수를 정지 조건으로 남겨 두는 것은 제어를 유지하는 표준적인 관행입니다[^S1].

코스 7과 비교해 바뀐 것은 둘이며, 둘 다 루프 본문 바깥입니다. `client`와 `system`이 모듈 수준 상수에서 매개변수로 바뀌었고(역할 셋이 서로 다른 스텁과 서로 다른 시스템 프롬프트를 필요로 하므로 넘겨받아야 합니다), 토큰과 호출 계측이 루프 본문 안에서 클라이언트 바깥의 래퍼 계층으로 옮겨 갔습니다. 루프 내부는 그대로입니다.

```javascript
function metered(client) {
  const meter = { calls: 0, tokens: 0 };
  const wrapped = {
    messages: {
      async create(req) {
        const res = await client.messages.create(req);
        meter.calls += 1;
        meter.tokens += res.usage.input_tokens + res.usage.output_tokens;
        return res;
      },
    },
  };
  return { client: wrapped, meter };
}
```

이 변경에는 값이 있고 그것을 밝혀야 합니다. 코스 7의 밸브 2(토큰 예산)는 원래 루프 본문의 누적값에 기대고 있었는데, 그 누적기가 더는 루프 안에 없으므로 밸브 2도 함께 옮겨 오지 못했습니다. 이 그래프에서는 각 노드의 스텁 응답 큐가 고정 길이라 큐를 소진하면 곧바로 throw되고 폭주할 수 없습니다. 다만 스텁을 실제 클라이언트로 바꿀 때는 밸브 2를 되돌려 놓으십시오. `metered`가 예산을 넘길 때 throw하게 하거나, 계측을 루프 본문으로 되돌려 코스 7의 원래 형태를 복원하면 됩니다. 밸브 3(공회전 감지)과 밸브 4(사람 승인)도 마찬가지로 옮겨 오지 않았습니다. 이유는 뒤의 "정산표" 절에 적어 두었습니다.

도구 쪽 절반도 그대로 옮겼습니다. 한 턴의 응답에 `tool_use` 블록이 여러 개 있으면 그만큼의 `tool_result` 블록을 돌려주고, 도구가 throw하면 `is_error: true`로 감싸 모델에게 되돌려 줍니다. 프로세스 전체를 죽이지 않습니다.

## 노드 하나: 라우팅 — 값싼 호출 한 번, 그리고 출력 조이기

라우팅은 입력을 분류해 전문화된 후속 작업으로 보냅니다[^S1]. 그래프에서 가장 값싼 모델 호출입니다. 요청 한 번으로 여섯 장을 다 분류하고, 도구도 없고, 회신도 쓰지 않습니다.

```javascript
async function routeNode(tickets) {
  const { client, meter } = metered(makeStubClient(SCRIPTS.router));
  const input = tickets.map((t) => `${t.id}: ${t.text}`).join("\n");
  const text = await runAgent(client, ROUTER_PROMPT, input, [], {});

  // 출력 조이기: "ticket_id: category" 줄만 인정하고, 화이트리스트에 없는 범주는 other로 떨어뜨립니다
  const parsed = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(T-\d+)\s*:\s*(\S+)\s*$/);
    if (!m) continue;
    const [, id, raw] = m;
    const category = CATEGORIES.includes(raw) ? raw : "other";
    if (category !== raw) log({ node: "route", event: "clamped", ticket: id, raw, category });
    parsed.set(id, category);
  }

  const routed = tickets.map((t) => ({ ...t, category: parsed.get(t.id) ?? "other" }));
  for (const t of routed) log({ node: "route", event: "routed", ticket: t.id, category: t.category });
  return { routed, calls: meter.calls, tokens: meter.tokens };
}
```

핵심은 모델 호출이 아니라 가운데 열 줄입니다. 모델은 자유 텍스트를 돌려주고 하류의 모든 분기가 이 값에 기대므로, 하류로 들어가기 전에 세 개의 적법한 레이블 중 하나로 조여야 합니다. 형식에 맞지 않는 줄은 버리고, 화이트리스트에 없는 범주는 `other`로 떨어뜨리고, 매칭된 줄이 하나도 없는 티켓은 `parsed.get(t.id) ?? "other"`가 받아 냅니다.

마지막 티켓에 대해서는 스텁이 '불만'이라는 낱말을 돌려주도록 일부러 심어 두었습니다. 화이트리스트에 없는 값입니다. 실제 실행 로그에 이 조이기가 남습니다.

```text
{"ts":"2026-08-29T16:45:31.764Z","run_id":"run-mtem3c80","node":"route","event":"clamped","ticket":"T-1006","raw":"불만","category":"other"}
```

모델이 제멋대로 만든 레이블을 코드가 `other`로 되잡았고, 무엇이 되잡혔는지 기록을 남겼습니다. **하류 분기는 코드가 검증한 값만 인정합니다.** 이것이 라우팅 노드와 "모델이 다음에 어디로 뛸지 직접 정하게 하는 것"의 실질적인 차이이고, 라우팅을 단위 테스트할 수 있는 이유입니다.

## 노드 둘: 팬아웃 — 워커 셋과 상한 있는 동시 실행 풀

팬아웃은 섹셔닝을 따릅니다. 작업을 서로 독립적인 하위 작업으로 쪼개 병렬로 돌리는 것입니다[^S1]. 여기서 "독립"은 자연스럽습니다. 티켓 여섯 장은 서로 아무 의존이 없고 순서도 상관없습니다.

범주 셋, 처리자 셋, 그중 모델은 둘뿐입니다.

```javascript
const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
  if (ticket.category === "other") {
    const text = otherTemplate(ticket.id);
    log({ node: "fanout", event: "template_done", ticket: ticket.id });
    return { ticket, handler: "template", text };
  }
  const r = await callWorker(ticket, 1);
  calls += r.calls;
  tokens += r.tokens;
  return { ticket, handler: `worker:${ticket.category}`, text: r.text };
});
```

동시 실행 풀은 레슨 3의 그 풀입니다(거기서는 `pool`, 여기서는 `runPool`). 작업이 커서 뒤에 늘어서 있고, `limit`개의 소비자를 띄워 집어 가게 하고, 다 떨어지면 끝납니다. 상한은 장식이 아니라 실제로 작동합니다. 1로 바꿔 다시 돌리면 `fanout` 줄의 시간이 눈에 띄게 길어집니다(호출 횟수와 토큰은 동일하고, 밀리초는 늘 그렇듯 흔들립니다).

```text
\$ POOL_SIZE=1 node orchestrate.mjs
...
=== 그래프 전체 실행 요약 ===
노드      시간    모델 호출   토큰     게이트 회차 상태
route     61ms    1           720      -           ok
fanout    507ms   8           8903     -           ok
merge     1ms     0           0        -           ok
review    124ms   2           3033     2           ok
```

507ms 대 262ms이고, 호출 횟수와 토큰은 동일합니다. 동시 실행은 실제 경과 시간을 사는 것이지 일을 줄이는 것이 아닙니다. 이 사실은 실제 API로 바꿔도 그대로이며, 다만 그때는 제공자의 레이트 리밋까지 함께 고려해야 해서 상한이 한층 더 필수적이 됩니다.

### 위임 프롬프트: 네 요소가 모두 있음

모델 역할 셋의 프롬프트는 모두 레슨 4의 네 요소를 따릅니다. 목표, 출력 형식, 도구 안내, 작업 경계입니다. 서브에이전트에는 목표, 출력 형식, 쓸 도구와 자료에 대한 안내, 그리고 명확한 작업 경계가 필요하며, 설명이 충분하지 않으면 워커들은 일을 중복하고, 빈틈을 남기고, 찾아야 할 것을 찾아내지 못합니다[^S2]. 청구 워커는 이렇습니다.

```javascript
billing: [
  "당신은 청구 티켓 전담이며, 한 번에 티켓 한 장을 처리합니다.",
  "목표: 이 티켓의 청구 사실을 조사하고, 그대로 보낼 수 있는 완결된 한국어 회신을 만드십시오.",
  "출력 형식: 평문 문단이며, '티켓 <ticket_id> 회신:'으로 시작합니다. 확인한 사실, 이미 취한 조치, 사용자가 다음에 기대할 수 있는 것을 밝히십시오. 글머리 기호 목록도, 인사치레도 쓰지 마십시오.",
  "도구 안내: 청구 사실은 반드시 lookup_order로 확인하고, 티켓에 있는 주문 ID를 그대로 넘기십시오. 찾을 수 없으면 그렇다고 말하고, 티켓 설명에서 금액이나 결제 횟수를 추측하지 마십시오.",
  "작업 경계: 이 티켓의 청구 부분만 다루십시오. 주문을 수정하지 말고, 추가 보상을 약속하지 말고, 청구와 무관한 질문에 답하지 마십시오. '기다려 주세요', '조금만 더 기다려 주시기 바랍니다', '빠르게 처리하겠습니다' 같은 빈말을 쓰지 마십시오.",
].join("\n"),
```

네 줄이 각자 제 몫을 합니다. 목표가 무엇을 쓸지를 정하고, 출력 형식이 하류 게이트에 검사할 거리를 주고("티켓 ID로 시작" 요구가 게이트의 첫 규칙에 그대로 대응합니다), 도구 안내가 "금액이 어디서 오는가"를 `lookup_order`에 못 박아 티켓 설명에서 숫자를 지어내는 길을 막고, 작업 경계가 범위 밖 행동을 막으면서 빈말까지 선제적으로 금지합니다.

버그 워커의 판본은 내용을 알려진 이슈 DB 확인, 이슈 번호 인용, 번호 지어내기 금지로 바꿉니다. 라우터의 "도구 안내"는 "이 단계에서는 도구를 주지 않으니 오직 티켓 본문만 보고 판단하라"라고 말하며, 코드에서 넘기는 빈 tools 배열과 맞아떨어집니다. 이 프롬프트 셋의 차이 자체가 라우팅이 벌어들인 배당입니다. 분류한 뒤에는 각자 자기 것을 쓰면 되고, 세 종류 일의 요구사항을 한 프롬프트에 욱여넣을 필요가 없습니다. 이것이 바로 라우팅이 가능하게 하는 관심사의 분리이자 더 전문화된 프롬프트입니다[^S1].

## 노드 셋: 병합 — 페이로드가 아니라 참조를 넘긴다

`merge`는 순수 코드이고 모델 호출이 0입니다. 두 가지를 합니다. 각 초안을 `out/`에 쓰고, 하류를 위해 가벼운 목록을 모읍니다. `{id, category, handler, file, oneLine}` — 파일 경로 하나와 한 줄 요약이지, 회신 여섯 편 전문이 아닙니다. (동시에 `run-state.json`에 티켓마다 레코드도 만듭니다. 필드는 전체 코드의 9절에 있습니다.)

이것은 멀티 에이전트 시스템의 엔지니어링 조언을 단일 프로세스 스크립트로 가져온 것입니다. 전문 에이전트가 출력을 외부 시스템에 저장하게 하고, 코디네이터에게는 가벼운 참조만 넘기게 하십시오[^S2]. 그 회고에서 이 조언은 "모든 것을 리드 에이전트를 통해 중계"하는 데서 오는 컨텍스트 비대화를 해결했습니다. 여기서는 같은 것의 작은 규모 판본을 해결합니다. 리뷰 노드에 필요한 것은 "어느 파일을 검사해야 하는가"이지, 회신 여섯 편 전문이 변수 하나에 쌓여 돌아다니는 것이 아닙니다.

그래서 리뷰 노드의 첫 동작은 파일에서 내용을 다시 읽는 것입니다.

```javascript
let reply = fs.readFileSync(full, "utf8").trim(); // 페이로드는 파일에서 읽습니다. 앞 노드가 들고 오지 않습니다
```

이 단계는 군더더기처럼 보입니다. 어차피 같은 프로세스 안인데 문자열을 그냥 넘기면 되지 않느냐는 것입니다. 그러나 이것이 둘을 사 줍니다. `out/`의 파일이 이 티켓의 유일한 진실 원천이 되어, 누가 그것을 고치든 리뷰가 검사하는 것은 그것입니다. 그리고 이 엣지가 프로세스나 기계를 넘어가야 할 때가 오면 `readFileSync` 이 한 줄만 바뀌고, 노드 사이의 계약은 꿈쩍도 하지 않습니다.

## 문제 하나

여기까지 그래프의 다섯 노드 중 셋이 완성됐습니다. 라우팅은 코드로 조여졌고, 병합은 순수 코드이며, 곧 나올 게이트도 순수 코드입니다. 이 대목에서 가장 자주 듣는 질문을 그대로 꺼내 볼 수 있습니다.

```agentmentor-check
{
  "id": "orc-zh-06-llm-as-glue",
  "label": "접착 로직을 리드 모델이 그때그때 정하게 맡길지 판단하기",
  "prompt": "동료가 orchestrate.mjs를 다 읽고 묻습니다: '라우팅, 병합, 게이트 같은 접착 로직을 왜 하드코딩했나요? 리드 모델이 중간 결과를 보면서 다음 단계를 그때그때 정하게 하는 편이 더 유연하지 않을까요?' 이 티켓 묶음 작업에 대해 어떻게 답해야 합니까?",
  "whyHere": "다섯 노드 중 셋이 순수 코드이고, 독자는 방금 결정론적 접착 계층 셋을 연달아 봤습니다. '계획이 코드에 있다'가 무엇을 사 주는지, 그리고 언제 결정 권한을 모델에게 돌려줄 값어치가 있는지 말할 수 있는지 확인하기에 알맞은 시점입니다.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "이 작업들은 단계를 미리 분해할 수 있었고, 그것을 코드에 하드코딩하면 예측 가능성과 일관성을 삽니다. 중간 결과는 스크립트 변수에 머물러 모델 컨텍스트를 차지하지 않습니다. 정말로 분해할 수 없는 일이야말로 결정 권한을 모델에게 돌려줄 근거가 됩니다",
      "correct": true,
      "feedback": "정답이며, 이것이 바로 워크플로와 에이전트의 아키텍처 구분을 실무에 적용한 것입니다. 워크플로는 LLM과 도구가 미리 정의된 코드 경로를 통해 오케스트레이션되는 것이고, 에이전트는 모델이 자기 프로세스를 자율적으로 지휘하는 것입니다. 작업이 잘 정의되어 있을 때 워크플로는 예측 가능성과 일관성을 줍니다. 큰 폭의 유연성과 모델 주도의 의사결정이 필요할 때는 에이전트가 옳은 선택입니다. '티켓이 들어온다 → 분류한다 → 범주별로 처리한다 → 검사한다 → 보고한다'라는 다섯 단계는 코드 첫 줄을 쓰기 전에 이미 정해져 있었습니다. 모델이 매 회차 다시 정하게 하면 예측 불가능성과 반복되는 여분의 호출로 값을 치르면서, 이 작업에 필요하지도 않은 유연성을 사는 셈입니다. 부수적인 이득 하나는 중간 결과가 모델 컨텍스트에 들어가지 않는다는 것입니다. 스크립트 자체가 루프, 분기, 중간 결과를 쥐고, 모델의 컨텍스트는 이번 한 단계에 필요한 것만 쥡니다."
    },
    {
      "id": "b",
      "text": "모델이 조향하는 쪽이 당연히 더 똑똑합니다. 리드 모델이 각 단계의 중간 결과를 보면서 그때그때 맞춰 가면 라우팅, 병합, 게이트가 모두 상황에 맞게 조정되니 하드코딩된 로직보다 낫습니다",
      "correct": false,
      "feedback": "'더 똑똑하다'가 여기서는 현금화될 곳이 없습니다. 분류의 답은 적법한 값이 셋뿐이고, 게이트가 검사하는 것은 '회신에 티켓 ID가 들어 있는가, 빈말이 들어 있는가'입니다. 한 번 훑으면 확인되는 사실들입니다. 이것을 모델에게 넘기면 매번 달라질 수 있는 답을 받게 되고, 그것을 조이는 코드는 어차피 또 써야 합니다. 진짜 값은 그것만이 아닙니다. 모델이 조향하려면 중간 결과를 봐야 하고, 회신 여섯 편 전문이 그 컨텍스트에 들어가야 하며, 그 내용은 다시는 참조되지 않습니다. 유연성에는 값이 있으니, 정말로 필요할 때만 사십시오."
    },
    {
      "id": "c",
      "text": "두 방식은 거기서 거기입니다. 최종 출력이 같으니 나머지는 개인 취향과 팀 습관 문제이고, 아무거나 고르면 됩니다",
      "correct": false,
      "feedback": "이것은 스타일 문제가 아니라 기준이 있는 결정입니다. 단계를 미리 분해할 수 있는가입니다. 분해할 수 있다 → 코드에 써넣어 예측 가능성과 일관성을 삽니다. 분해할 수 없다 — 열린 질문이고, 단계를 미리 예측할 수 없고, 고정된 경로를 하드코딩할 수 없다 — 그때가 자율 루프로 돌아갈 때입니다. (하위 작업의 개수와 내용은 하드코딩할 수 없지만 전체 단계는 여전히 여러분 손에 있을 때, 레슨 4의 오케스트레이터-워커가 중간 계층입니다. 이 그래프의 일은 그 단계조차 필요 없습니다. 분류와 배분이 코드 이전에 못 박혔습니다.) 이것을 취향 문제로 다루면 가장 흔한 결과는, 다섯 단계짜리 흐름 위에 매 턴 어떻게 진행할지 다시 생각하는 시스템을 키우는 것입니다. 비싸고, 느리고, 무언가 잘못됐을 때 어느 줄을 고쳐야 할지 알 수 없습니다."
    }
  ]
}
```

## 노드 넷: 리뷰 회로 — 게이트가 먼저 거르고, 실패한 것은 가마로 되돌아간다

리뷰 노드는 검사-수정-재검사를 합니다. 검사기를 돌리고, 실패한 것을 고치고, 통과하거나 더는 진척이 없을 때까지 되풀이합니다[^S5]. 이 그래프에서 "모델의 출력이 다시 쓰라고 되돌려지는" 유일한 자리입니다.

첫 여과는 결정론적이며, `includes` 몇 줄로 끝납니다.

```javascript
function gateCheck(ticketId, reply) {
  const problems = [];
  if (!reply.includes(ticketId)) problems.push("missing_ticket_id");
  for (const w of FILLER_WORDS) {
    if (reply.includes(w)) problems.push(`filler_word:${w}`);
  }
  return { pass: problems.length === 0, report: problems.join(" | ") };
}
```

규칙 둘 다 코스 10(검증과 품질 보증: '맞아 보이는 것'을 통과시키지 않기)이 "결정론적으로 판정할 수 있으면 심판에게 묻지 말라"고 한 그 종류입니다. 회신에는 티켓 ID가 들어 있어야 하고(고객지원 시스템이 그것을 키로 씁니다), '기다려 주세요', '조금만 더 기다려 주시기 바랍니다', '빠르게 처리하겠습니다'처럼 정보량이 없는 빈말이 들어 있으면 안 됩니다. 둘 다 의미 이해가 필요 없고 문자열 포함으로 충분하며, 결과가 매번 같고, 게다가 워커에게 그대로 돌려줄 수 있는 리포트 문자열까지 만들어 냅니다.

여기서 LLM 심판이라면 "회신의 어조가 적절한가", "사실이 도구가 돌려준 범위를 넘지 않는가" 같은 것 — `includes`로는 정말로 판정할 수 없는 것 — 을 맡을 수 있습니다. 다만 반드시 게이트 뒤에 서야 합니다. 게이트는 공짜이고 결정론적이니 분명한 문제를 먼저 걸러 내게 하고, 남은 것이 호출 값을 치르고 심판에게 물어볼 값어치가 있는 것입니다. 이 그래프에는 게이트 계층만 달았습니다. 이 티켓 묶음의 합격 기준이 마침 규칙으로 표현 가능하기 때문입니다. 합격 기준에 "어조의 적절함" 같은 낱말이 들어갈 때는 코스 10의 계층적 판정 배분에 따라 심판 계층을 더하십시오.

루프 자체는 이렇게 생겼습니다.

```javascript
while (!gate.pass) {
  reports.push(gate.report);
  if (rounds >= MAX_REVIEW_ROUNDS) {
    verdict = "max_rounds";
    break;
  }
  if (gate.report === lastReport) {
    verdict = "no_progress"; // 두 회차 연속 리포트가 동일하므로, 루프가 더는 나아가지 않습니다
    break;
  }
  if (item.handler === "template") {
    verdict = "no_rewriter"; // 순수 코드 템플릿은 되돌려 보낼 워커가 없으므로 바로 사람에게 넘깁니다
    break;
  }
  lastReport = gate.report;
  rounds += 1;
  totalRounds += 1;
  const r = await callWorker(byId.get(item.id), rounds + 1, { prev: reply, report: gate.report });
  calls += r.calls;
  tokens += r.tokens;
  reply = r.text;
  fs.writeFileSync(full, `${reply}\n`);
  gate = gateCheck(item.id, reply);
  log({ node: "review", event: "gate", ticket: item.id, round: rounds, pass: gate.pass, report: gate.report });
}
```

`break` 셋이 멈추는 세 방식에 대응하며, 레슨 5가 선언한 것과 맞아떨어집니다. 통과(`while` 조건이 자연히 거짓이 됨), 더는 진척 없음, 최대 회차 도달입니다. 셋째 `if`는 덧댄 것입니다. `other` 범주의 회신은 순수 코드 템플릿이 생성하므로 되돌려 보낼 워커가 없고, 템플릿 자체가 망가졌다면 바로 사람에게 넘기는 수밖에 없습니다. 이번 실행에서는 걸리지 않았지만(템플릿은 상수이므로 반드시 게이트를 통과합니다), 누군가 템플릿 문자열을 망가뜨렸을 때 도는 루프를 보느니 `no_rewriter` 기록을 보는 편이 낫기에 남겨 두었습니다.

되돌릴 때 워커에게 먹이는 것은 단순합니다. 이전 판본 전문 + 게이트 리포트 + "리포트가 지목한 문제만 고쳐서 완결된 회신을 다시 쓰라"는 한 문장입니다(`callWorker`에서 조립합니다).

### 멈추는 두 방식이 이번 실행에서 실제로 다 일어났습니다

스텁에 각본 둘을 심어, 루프의 각 출구가 한 번씩 실행되게 했습니다.

**T-1005: 제대로 고쳐지고 끝났습니다.** 버그 워커의 첫 판본이 티켓 ID를 빠뜨려(첫 규칙 실패) 게이트가 `missing_ticket_id`를 돌려주고, 워커가 리포트대로 첫 줄을 붙였고, 둘째 판본이 통과합니다.

```text
{"ts":"2026-08-29T16:45:32.103Z","run_id":"run-mtem3c80","node":"review","event":"gate","ticket":"T-1005","round":0,"pass":false,"report":"missing_ticket_id"}
{"ts":"2026-08-29T16:45:32.165Z","run_id":"run-mtem3c80","node":"review","event":"worker_done","ticket":"T-1005","round":2,"calls":1,"tokens":1638}
{"ts":"2026-08-29T16:45:32.165Z","run_id":"run-mtem3c80","node":"review","event":"gate","ticket":"T-1005","round":1,"pass":true,"report":""}
```

**T-1004: 고쳐 쓰긴 했지만 낫지 않았고, 루프가 스스로 멈췄습니다.** 청구 워커의 첫 판본이 '기다려 주세요'를 썼고 게이트가 `filler_word:기다려 주세요`를 돌려줍니다. 워커가 한 판본을 다시 썼고, 문장이 완전히 달라지고 길어지고 설명이 붙었지만, 그 낱말은 그대로 남았습니다. 둘째 회차의 리포트가 첫째 회차와 동일합니다.

```text
{"ts":"2026-08-29T16:45:32.040Z","run_id":"run-mtem3c80","node":"review","event":"gate","ticket":"T-1004","round":0,"pass":false,"report":"filler_word:기다려 주세요"}
{"ts":"2026-08-29T16:45:32.101Z","run_id":"run-mtem3c80","node":"review","event":"worker_done","ticket":"T-1004","round":2,"calls":1,"tokens":1395}
{"ts":"2026-08-29T16:45:32.102Z","run_id":"run-mtem3c80","node":"review","event":"gate","ticket":"T-1004","round":1,"pass":false,"report":"filler_word:기다려 주세요"}
```

이 순간 `gate.report === lastReport`가 성립하고, 루프는 더는 진척이 없다고 판정해 멈추고, 이 티켓을 `needs_human`으로 표시합니다. 원래 회차 예산이 두 번 더 남아 있었지만(`MAX_REVIEW_ROUNDS`는 3입니다), 그것을 쓴들 낭비였을 것입니다. 같은 리포트를 되먹이면 십중팔구 같은 회신이 돌아옵니다. "더는 진척 없음" 출구의 값어치가 여기에 있습니다. 최대 회차보다 일찍 손실을 끊고, 정보량 있는 결론을 줍니다. "세 번 해 봤는데 안 된다"가 아니라 "이 피드백을 이해하지 못한다"이며, 그것이야말로 사람에게 올릴 신호입니다.

두 출구의 차이는 데이터에서 곧바로 보입니다.

```json
"T-1004": {
  "gate_rounds": 1,
  "gate_reports": [
    "filler_word:기다려 주세요",
    "filler_word:기다려 주세요"
  ],
  "stop": "no_progress",
  "status": "needs_human"
},
"T-1005": {
  "gate_rounds": 1,
  "gate_reports": [
    "missing_ticket_id"
  ],
  "stop": "gate_pass",
  "status": "pass"
}
```

두 티켓의 `gate_rounds`가 모두 1이므로, 회차 수만으로는 성공과 실패를 가릴 수 없습니다. 가르는 선은 `gate_reports`의 길이입니다. 그것은 실패한 리포트를 하나도 빠짐없이, 정지를 부른 마지막 것까지 기록합니다. T-1005는 항목 하나만 남기고(둘째 판본이 통과해 두 번째 리포트가 생기지 않았습니다), T-1004는 내용이 동일한 항목 둘을 남기며, `stop` 필드가 결론을 곧바로 `no_progress`로 적습니다.

## 노드 다섯: 보고와 추적

마지막 노드도 순수 코드입니다. `state.nodes`와 티켓별 내역을 표 둘로 찍고, `needs_human`을 세고, 종료 코드를 정합니다. 모두 통과면 0, 사람이 필요한 것이 하나 있으면 1입니다.

추적은 파일 둘로 나뉘며 각자 목적이 있습니다. `run.jsonl`은 코스 11(관측 가능성과 디버깅: 에이전트가 밟는 모든 단계 들여다보기)의 구조화 로깅입니다. 한 줄에 JSON 이벤트 하나, 각각이 `ts`와 `run_id`를 달고 있어 나중에 grep할 수 있습니다. 이번 실행은 총 39줄이었고, 앞 절들의 발췌는 전부 거기서 그대로 grep해 온 것입니다.

`run-state.json`은 실행 자취를 기록하며("그래프의 상태 = 저 몇 개의 스크립트 변수"와는 별개입니다), 코스 9(상태 관리와 지속화: 긴 작업이 중단을 견디게 만들기)의 방식으로 씁니다. `.tmp`에 먼저 쓰고 `rename`으로 원자적으로 바꿔치기하므로, 어느 순간에 죽든 디스크에는 이전의 완전한 상태이거나 새로운 완전한 상태가 있지, 반토막 난 JSON은 결코 없습니다.

```javascript
function saveState() {
  state.updated_at = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}
```

쓰는 시점은 "작은 단계마다 영속화"입니다. 노드가 끝날 때마다 한 번, 리뷰 노드 안에서는 티켓 하나를 판정할 때마다 또 한 번입니다. 레슨 5가 인용한 이유가 그대로입니다. 각 에이전트의 결과를 점진적으로 추적하는 것이 바로 같은 세션 안에서 실행을 재개할 수 있는 전제이고[^S5], 일을 여러 작은 에이전트에게 펼쳐 내보내는 워크플로는 긴 에이전트 하나보다 진척을 더 많이 지켜 냅니다[^S5]. 이 그래프는 멀티 에이전트 런타임이 아니지만 같은 진술이 여기서도 성립합니다. 티켓 여섯 장은 독립적인 진척 단위 여섯 개이고, 리뷰 도중에 죽더라도 이미 영속화된 것이 함께 사라져서는 안 됩니다(팬아웃 단계는 아직 이것을 이루지 못했습니다 — 정산표 3번을 보십시오).

이 진술의 실제 효과를 보려면 `STOP_AFTER=merge`로 팬아웃 뒤, 리뷰 앞에서 프로세스를 멈춰 보십시오.

```text
\$ STOP_AFTER=merge node orchestrate.mjs
inbox/에서 티켓 6장 받음: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[fanout] 동시 실행 상한 2, 초안 6건 생성
[merge] out/에 6개 파일 기록, 하류로는 참조와 한 줄 요약만 넘김
[stop] STOP_AFTER=merge: 리뷰 앞에서 멈춥니다. 이번 실행에는 판정이 없습니다
\$ echo \$?
2
```

이 시점의 `run-state.json`입니다(발췌).

```json
{
  "version": 1,
  "run_id": "run-mtem41c1",
  "nodes": {
    "route": { "ms": 61, "calls": 1, "tokens": 720, "status": "ok" },
    "fanout": { "ms": 244, "calls": 8, "tokens": 8903, "status": "ok" },
    "merge": { "ms": 1, "calls": 0, "tokens": 0, "status": "ok" }
  },
  "tickets": {
    "T-1004": {
      "category": "billing",
      "handler": "worker:billing",
      "file": "out/T-1004.txt",
      "one_line": "티켓 T-1004: 세금계산서 상호 변경…",
      "gate_rounds": 0,
      "gate_reports": [],
      "stop": null,
      "status": "drafted"
    },
    "T-1005": {
      "category": "bug",
      "handler": "worker:bug",
      "file": "out/T-1005.txt",
      "one_line": "알려진 이슈 KI-91에 해당합니다",
      "gate_rounds": 0,
      "gate_reports": [],
      "stop": null,
      "status": "drafted"
    }
  }
}
```

노드 셋의 장부가 들어와 있고, 티켓 여섯 장의 범주, 처리자, 출력 파일 경로가 들어와 있고, 초안 파일 여섯 개가 이미 `out/`에 영속화되어 있습니다. 잃은 것은 리뷰 구간뿐입니다. 모든 티켓이 `status: "drafted"`, `stop: null`에 멈춰 있습니다. 이 상태만으로도 재개를 뒷받침하기에 충분합니다. `out/`에서 초안을 읽어 들여 리뷰 노드부터 바로 시작하면 됩니다. T-1005의 `one_line`이 마침 초안의 결함을 드러내고 있다는 데 주목하십시오. 첫머리에 티켓 ID가 없습니다. 리뷰가 아직 돌지 않았으므로 이 결함은 아직 잡히지 않았습니다.

(`STOP_AFTER`는 `merge` 하나만 값으로 인정하며, 코스 9의 통제된 크래시 지점을 단순화한 판본입니다. 종료 코드 0은 전부 통과, 1은 사람에게 넘길 티켓이 있음, 2는 일찍 멈춰 판정 없음, 3은 스크립트 자체가 죽은 것입니다. 넷이 겹치지 않으므로 CI가 "돌긴 했는데 일부를 넘겨야 함"과 "죽었음"을 한눈에 가릴 수 있습니다.)

## 완전한 `orchestrate.mjs`

아래가 전문이며 끊기지 않은 한 덩이입니다. 빈 디렉터리의 `orchestrate.mjs`에 붙여 넣고 `node orchestrate.mjs`를 하십시오. 의존성 0이라 `npm i`도, `package.json`도 필요 없고(`.mjs` 확장자가 이미 ES 모듈임을 선언합니다), API 키도 필요 없습니다. 모델 클라이언트가 스텁이기 때문입니다. 첫 실행이 `inbox/`, `kb/`, `out/`을 만들고 그 티켓 여섯 장을 씁니다.

```javascript
// orchestrate.mjs —— 티켓 묶음 처리 작은 그래프: 라우팅 → 팬아웃 → 병합 → 리뷰 회로 → 보고
// 의존성 0, node orchestrate.mjs로 바로 돌아갑니다. 모델 클라이언트는 고정 큐를 재생하는 스텁입니다.
import fs from "node:fs";
import path from "node:path";

// ============ 0. 상수와 디렉터리 ============

const MODEL = "claude-sonnet-5";
const MAX_TURNS = 6;          // 노드 하나의 내부 루프 상한(코스 7 밸브 1)
const POOL_SIZE = Math.max(1, Number(process.env.POOL_SIZE) || 2); // 팬아웃 동시 실행 상한(레슨 3); 0/무효면 1로 폴백
const STUB_LATENCY_MS = 60;   // 스텁의 고정 지연. 실제 네트워크 왕복을 대신해, 시간 열에 보여 줄 것이 생깁니다
const MAX_REVIEW_ROUNDS = 3;  // 리뷰 회로의 최대 재작성 회차(레슨 5)
const FILLER_WORDS = ["기다려 주세요", "조금만 더 기다려 주시기 바랍니다", "빠르게 처리하겠습니다"];
const CATEGORIES = ["billing", "bug", "other"];

const ROOT = process.cwd();
const INBOX = path.join(ROOT, "inbox");
const OUT = path.join(ROOT, "out");
const KB = path.join(ROOT, "kb");
const STATE_PATH = path.join(ROOT, "run-state.json");
const LOG_PATH = path.join(ROOT, "run.jsonl");

// ============ 1. 입력: inbox/의 티켓 6장과 알려진 이슈 DB 하나 ============

const TICKET_TEXT = {
  "T-1001": "주문 A-77301이 이번 달에 두 번 결제되었습니다. 확인해 보시고 더 빠져나간 금액을 환불해 주세요.",
  "T-1002": "리포트 페이지에서 'CSV 내보내기'를 눌렀는데 버튼이 계속 돌기만 하고, 5분을 기다려도 반응이 없습니다. Chrome, 회사 네트워크입니다.",
  "T-1003": "상담원 전화번호가 몇 번인가요? 직접 전화로 물어보고 싶습니다.",
  "T-1004": "주문 A-77420의 세금계산서 상호가 잘못 발행됐습니다. 제 개인 이름으로 나왔는데 회사 상호로 바꿔 주세요.",
  "T-1005": "휴대폰 앱에서 로그인한 뒤로 프로필 사진이 계속 표시되지 않습니다. 웹에서는 정상입니다.",
  "T-1006": "3개월을 썼는데 문제를 여러 번 올려도 감감무소식입니다. 이 제품 아직 관리하는 사람이 있긴 한가요?",
};

const KNOWN_ISSUES = [
  "## KI-88 리포트 페이지 CSV 내보내기 무응답",
  "영향: 내보내기를 누르면 버튼이 계속 돌고, 백엔드 내보내기 큐가 적체됩니다. 상태: 3.4.2에서 수정됨, 배포 대기 중.",
  "임시 방편: 같은 페이지의 'XLSX 내보내기'를 쓰면 데이터 열이 완전히 동일합니다.",
  "",
  "## KI-91 모바일 프로필 사진 미표시",
  "영향: 앱 쪽 프로필 사진 URL이 여전히 옛 CDN 도메인을 가리킵니다. 웹은 영향받지 않습니다. 상태: 수정 중, 이번 주 금요일 배포와 함께 나갈 예정.",
  "임시 방편: 로그아웃한 뒤 다시 로그인하면 대개 프로필 사진이 돌아옵니다.",
].join("\n");

function seedWorkspace() {
  fs.mkdirSync(INBOX, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(KB, { recursive: true });
  for (const [id, text] of Object.entries(TICKET_TEXT)) {
    fs.writeFileSync(path.join(INBOX, `${id}.txt`), `${text}\n`);
  }
  fs.writeFileSync(path.join(KB, "known-issues.md"), `${KNOWN_ISSUES}\n`);
}

function loadInbox() {
  return fs
    .readdirSync(INBOX)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => ({
      id: path.basename(f, ".txt"),
      text: fs.readFileSync(path.join(INBOX, f), "utf8").trim(),
    }));
}

// ============ 2. 스텁 클라이언트: SCRIPTS가 티켓 id별로 응답을 고정합니다 ============

const say = (text) => ({ type: "text", text });
const call = (id, name, input) => ({ type: "tool_use", id, name, input });
const turn = (stop_reason, content, inTok, outTok) => ({
  stop_reason,
  content,
  usage: { input_tokens: inTok, output_tokens: outTok },
});

const SCRIPTS = {
  // 라우팅 노드: 한 번의 호출로 여섯 장을 분류합니다. 마지막 줄은 일부러 적법한 레이블이 아니며, 코드에 걸려 조여집니다.
  router: [
    turn(
      "end_turn",
      [
        say(
          [
            "T-1001: billing",
            "T-1002: bug",
            "T-1003: other",
            "T-1004: billing",
            "T-1005: bug",
            "T-1006: 불만",
          ].join("\n")
        ),
      ],
      624,
      96
    ),
  ],

  // billing 워커: 주문을 조회한 뒤 또렷하게 씁니다. 첫 판본이 게이트를 통과합니다.
  "T-1001#1": [
    turn(
      "tool_use",
      [say("먼저 주문 내역을 조회하겠습니다."), call("toolu_a1", "lookup_order", { order_id: "A-77301" })],
      781,
      92
    ),
    turn(
      "end_turn",
      [
        say(
          "티켓 T-1001 회신: 주문 A-77301은 이번 달에 실제로 두 번 결제되었고, 건당 399.00원이며, 시스템에 중복 결제로 표시되어 있습니다. " +
            "더 빠져나간 한 건은 환불 요청을 넣었고 원래 결제 수단으로 돌아갑니다. 입금 시점은 카드사에 따라 다르며 보통 3~5영업일입니다. " +
            "5영업일이 지나도 들어오지 않으면 이 티켓에 회신해 주십시오. 거래 번호를 가지고 결제 채널에 확인하겠습니다."
        ),
      ],
      1124,
      168
    ),
  ],

  // bug 워커: 알려진 이슈 DB를 확인한 뒤 회신합니다. 첫 판본이 게이트를 통과합니다.
  "T-1002#1": [
    turn(
      "tool_use",
      [say("먼저 알려진 이슈 DB를 확인하겠습니다."), call("toolu_b1", "read_file", { path: "kb/known-issues.md" })],
      763,
      88
    ),
    turn(
      "end_turn",
      [
        say(
          "티켓 T-1002 회신: 알려진 이슈 KI-88에 해당합니다. 리포트 페이지의 CSV 내보내기가 백엔드 큐 적체로 버튼만 계속 도는 증상입니다. " +
            "수정은 3.4.2에 병합되었고 다음 버전이 배포되면 자동으로 적용됩니다. 그동안은 같은 페이지의 'XLSX 내보내기'를 쓰시면 데이터 열이 동일합니다. " +
            "배포되는 날 이 티켓으로 알려 드리겠습니다."
        ),
      ],
      1312,
      176
    ),
  ],

  // billing 워커: 첫 판본에 상투어가 있고, 둘째 판본에도 같은 상투어가 남습니다 — 게이트 리포트 두 개가 동일해집니다.
  "T-1004#1": [
    turn(
      "tool_use",
      [say("먼저 이 계산서의 상호를 확인하겠습니다."), call("toolu_c1", "lookup_order", { order_id: "A-77420" })],
      786,
      90
    ),
    turn(
      "end_turn",
      [
        say(
          "티켓 T-1004: 세금계산서 상호 변경은 재무팀 검토가 필요하며, 주문 A-77420 건은 제가 요청을 넣어 두었습니다. 기다려 주세요."
        ),
      ],
      1133,
      96
    ),
  ],
  "T-1004#2": [
    turn(
      "end_turn",
      [
        say(
          "티켓 T-1004: 상호를 개인에서 회사로 바꾸려면 재무팀이 시스템에서 기존 계산서를 취소하고 재발행해야 하며, 요청은 아직 검토 대기열에 있습니다. 기다려 주세요. 검토가 끝나면 새 계산서를 이 티켓으로 보내 드리겠습니다."
        ),
      ],
      1291,
      104
    ),
  ],

  // bug 워커: 첫 판본에 티켓 ID가 빠졌고, 둘째 판본이 게이트 리포트에 따라 그것을 넣습니다.
  "T-1005#1": [
    turn(
      "tool_use",
      [say("알려진 이슈인지 확인하겠습니다."), call("toolu_d1", "read_file", { path: "kb/known-issues.md" })],
      752,
      86
    ),
    turn(
      "end_turn",
      [
        say(
          "알려진 이슈 KI-91에 해당합니다. 앱 쪽 프로필 사진이 아직 옛 CDN 도메인을 쓰고 있고 웹은 영향받지 않으며, 수정은 이번 주 금요일 배포와 함께 나갈 예정입니다. " +
            "그동안은 로그아웃한 뒤 다시 로그인하시면 대개 프로필 사진이 돌아옵니다."
        ),
      ],
      1298,
      158
    ),
  ],
  "T-1005#2": [
    turn(
      "end_turn",
      [
        say(
          "티켓 T-1005 회신: 알려진 이슈 KI-91에 해당합니다. 앱 쪽 프로필 사진이 아직 옛 CDN 도메인을 쓰고 있고 웹은 영향받지 않으며, 수정은 이번 주 금요일 배포와 함께 나갈 예정입니다. " +
            "그동안은 로그아웃한 뒤 다시 로그인하시면 대개 돌아옵니다. 배포 뒤에도 비어 있으면 이 티켓에 화면을 첨부해 주십시오. 계정을 확인하겠습니다."
        ),
      ],
      1466,
      172
    ),
  ],
};

function makeStubClient(queue) {
  let i = 0;
  return {
    messages: {
      async create(req) {
        if (!req.model || !req.max_tokens) {
          throw new Error("스텁 클라이언트: create에는 model과 max_tokens가 있어야 합니다");
        }
        if (i >= queue.length) {
          throw new Error(`스텁 큐 소진: ${i + 1}번째 요청에 예비 응답이 없습니다`);
        }
        await new Promise((r) => setTimeout(r, STUB_LATENCY_MS));
        return queue[i++];
      },
    },
  };
}

// 계측 래퍼는 클라이언트 바깥에 있고, 루프 내부는 그대로입니다.
function metered(client) {
  const meter = { calls: 0, tokens: 0 };
  const wrapped = {
    messages: {
      async create(req) {
        const res = await client.messages.create(req);
        meter.calls += 1;
        meter.tokens += res.usage.input_tokens + res.usage.output_tokens;
        return res;
      },
    },
  };
  return { client: wrapped, meter };
}

// ============ 3. 노드 내부: 코스 7의 루프를 그대로 가져왔습니다 ============

async function runAgent(client, system, userInput, tools, toolImpls) {
  const messages = [{ role: "user", content: userInput }];
  let turns = 0;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // —— 밸브 1: 최대 턴 수. 루프 본문 첫머리, turns++ 앞 ——
    if (turns >= MAX_TURNS) {
      return `최대 턴 수 ${MAX_TURNS}에 도달해 중단합니다(작업이 너무 어렵거나 모델이 막혔을 수 있습니다)`;
    }
    turns++;

    // 이번 턴의 응답 전체(assistant 역할)를 히스토리에 덧붙입니다
    messages.push({ role: "assistant", content: response.content });

    // 이번 턴의 tool_use 블록을 모두 실행하고, 각각을 tool_result로 감쌉니다
    const toolResults = await runToolUses(response.content, toolImpls);

    // 한 턴에서 나온 tool_result 블록은 바로 다음 user 메시지에 함께 들어갑니다
    messages.push({ role: "user", content: toolResults });

    // 길어진 히스토리로 다시 보내고, while 조건으로 되돌아갑니다
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
  }

  // stop_reason이 더는 tool_use가 아니므로, 최종 텍스트를 뽑아 돌려줍니다
  return response.content.find((b) => b.type === "text")?.text ?? "";
}

async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  return Promise.all(
    toolUseBlocks.map(async (block) => {
      const impl = toolImpls[block.name];
      try {
        const output = await impl(block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        };
      } catch (err) {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: `도구 실행 에러: ${err.message}`,
          is_error: true,
        };
      }
    })
  );
}

// ============ 4. 도구 둘 ============

const ORDERS = {
  "A-77301": { order_id: "A-77301", amount_cents: 39900, charged_times: 2, status: "duplicate_charge", invoice_title: "이민(개인)" },
  "A-77420": { order_id: "A-77420", amount_cents: 128000, charged_times: 1, status: "paid", invoice_title: "이민(개인)" },
};

const TOOLS = [
  {
    name: "read_file",
    description: "작업 디렉터리 아래의 텍스트 파일을 읽습니다. 알려진 이슈 DB나 티켓 원문을 확인할 때 씁니다.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "작업 디렉터리 기준 상대 경로" } },
      required: ["path"],
    },
  },
  {
    name: "lookup_order",
    description: "주문 ID로 결제 사실을 조회합니다: 금액, 결제 횟수, 상태, 계산서 상호.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string", description: "A-77301 같은 주문 ID" } },
      required: ["order_id"],
    },
  },
];

const toolImpls = {
  read_file({ path: rel }) {
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT)) throw new Error("경계를 벗어난 경로");
    return fs.readFileSync(full, "utf8");
  },
  lookup_order({ order_id }) {
    const row = ORDERS[order_id];
    if (!row) throw new Error(`주문을 찾을 수 없습니다: ${order_id}`);
    return JSON.stringify(row);
  },
};

// ============ 5. 위임 프롬프트 셋: 목표 / 출력 형식 / 도구 안내 / 작업 경계 ============

const ROUTER_PROMPT = [
  "당신은 고객 티켓 라우터입니다.",
  "목표: 아래 각 티켓을 billing(청구, 결제, 계산서, 환불), bug(기능 오작동), other(그 밖의 모든 것)로 분류하십시오.",
  "출력 형식: 티켓 한 장당 한 줄, 형식은 엄격히 'ticket_id: category'이며, category는 billing / bug / other 중 하나여야 합니다. 이유를 쓰지 말고 다른 내용을 출력하지 마십시오.",
  "도구 안내: 이 단계에서는 도구를 주지 않습니다. 오직 티켓 본문만 보고 판단하고, 시스템을 조회했다고 말하지 마십시오.",
  "작업 경계: 분류만 하십시오. 회신을 쓰지 말고, 결론을 내지 말고, 티켓을 합치지 마십시오. 확신이 없으면 other에 넣으십시오.",
].join("\n");

const WORKER_PROMPTS = {
  billing: [
    "당신은 청구 티켓 전담이며, 한 번에 티켓 한 장을 처리합니다.",
    "목표: 이 티켓의 청구 사실을 조사하고, 그대로 보낼 수 있는 완결된 한국어 회신을 만드십시오.",
    "출력 형식: 평문 문단이며, '티켓 <ticket_id> 회신:'으로 시작합니다. 확인한 사실, 이미 취한 조치, 사용자가 다음에 기대할 수 있는 것을 밝히십시오. 글머리 기호 목록도, 인사치레도 쓰지 마십시오.",
    "도구 안내: 청구 사실은 반드시 lookup_order로 확인하고, 티켓에 있는 주문 ID를 그대로 넘기십시오. 찾을 수 없으면 그렇다고 말하고, 티켓 설명에서 금액이나 결제 횟수를 추측하지 마십시오.",
    "작업 경계: 이 티켓의 청구 부분만 다루십시오. 주문을 수정하지 말고, 추가 보상을 약속하지 말고, 청구와 무관한 질문에 답하지 마십시오. '기다려 주세요', '조금만 더 기다려 주시기 바랍니다', '빠르게 처리하겠습니다' 같은 빈말을 쓰지 마십시오.",
  ].join("\n"),
  bug: [
    "당신은 버그 티켓 전담이며, 한 번에 티켓 한 장을 처리합니다.",
    "목표: 이 티켓이 알려진 이슈인지 판정하고, 그대로 보낼 수 있는 완결된 한국어 회신을 만드십시오.",
    "출력 형식: 평문 문단이며, '티켓 <ticket_id> 회신:'으로 시작합니다. 매칭된 알려진 이슈 번호와 결론, 임시 방편, 수정이 언제 오는지를 밝히십시오. 글머리 기호 목록도, 인사치레도 쓰지 마십시오.",
    "도구 안내: read_file로 kb/known-issues.md를 읽어 대조하고, 매칭되면 그 번호를 안에 인용하십시오. 매칭되지 않으면 그렇다고 말하고, 이슈 번호를 지어내지 마십시오.",
    "작업 경계: 이슈 식별과 회신만 하십시오. 기능을 끄지 말고, 분 단위 수정 시점을 약속하지 말고, 계정 비밀번호를 요구하지 마십시오. '기다려 주세요', '조금만 더 기다려 주시기 바랍니다', '빠르게 처리하겠습니다' 같은 빈말을 쓰지 마십시오.",
  ].join("\n"),
};

// other 범주는 모델에 들어가지 않습니다: 순수 코드 템플릿입니다. 모든 노드가 모델일 필요는 없습니다.
const otherTemplate = (id) =>
  `티켓 ${id} 접수했습니다. 이 티켓은 청구와 관련이 없고 기능 오작동도 아니어서, 고객지원팀으로 넘겨 사람이 직접 이어받도록 했습니다: ` +
  `평일 9:00-18:00에 400-000-1234로 전화하시면 바로 이야기하실 수 있고, 이 티켓에 내용을 덧붙이셔도 됩니다. 회신은 모두 이 티켓 아래에 남습니다.`;

// ============ 6. 관측 가능성: JSONL 구조화 로그 + run-state.json 점진 추적 ============

const RUN_ID = `run-${Date.now().toString(36)}`;

function initLog() {
  fs.writeFileSync(LOG_PATH, "");
}

function log(fields) {
  const line = { ts: new Date().toISOString(), run_id: RUN_ID, ...fields };
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(line)}\n`);
}

const state = {
  version: 1,
  run_id: RUN_ID,
  started_at: new Date().toISOString(),
  updated_at: null,
  nodes: {},
  tickets: {},
};

// 원자적 쓰기: .tmp에 먼저 쓰고 rename(코스 9의 방식)
function saveState() {
  state.updated_at = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

async function node(name, fn) {
  const t0 = Date.now();
  log({ node: name, event: "node_start" });
  const result = await fn();
  const ms = Date.now() - t0;
  state.nodes[name] = {
    ms,
    calls: result.calls ?? 0,
    tokens: result.tokens ?? 0,
    status: result.status ?? "ok",
  };
  saveState(); // 노드가 끝날 때마다 한 번 영속화
  log({ node: name, event: "node_end", ms, calls: result.calls ?? 0, tokens: result.tokens ?? 0 });
  return result;
}

// ============ 7. 노드 하나: 라우팅 ============

async function routeNode(tickets) {
  const { client, meter } = metered(makeStubClient(SCRIPTS.router));
  const input = tickets.map((t) => `${t.id}: ${t.text}`).join("\n");
  const text = await runAgent(client, ROUTER_PROMPT, input, [], {});

  // 출력 조이기: "ticket_id: category" 줄만 인정하고, 화이트리스트에 없는 범주는 other로 떨어뜨립니다
  const parsed = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(T-\d+)\s*:\s*(\S+)\s*$/);
    if (!m) continue;
    const [, id, raw] = m;
    const category = CATEGORIES.includes(raw) ? raw : "other";
    if (category !== raw) log({ node: "route", event: "clamped", ticket: id, raw, category });
    parsed.set(id, category);
  }

  const routed = tickets.map((t) => ({ ...t, category: parsed.get(t.id) ?? "other" }));
  for (const t of routed) log({ node: "route", event: "routed", ticket: t.id, category: t.category });
  return { routed, calls: meter.calls, tokens: meter.tokens };
}

// ============ 8. 노드 둘: 팬아웃(섹셔닝 + 동시 실행 풀 상한) ============

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function callWorker(ticket, round, extra) {
  const key = `${ticket.id}#${round}`;
  const queue = SCRIPTS[key];
  if (!queue) throw new Error(`스텁 스크립트 없음: ${key}`);
  const { client, meter } = metered(makeStubClient(queue));
  const input = extra
    ? [
        `아래는 티켓 ${ticket.id}에 대한 당신의 이전 판본입니다:`,
        "---",
        extra.prev,
        "---",
        `결정론적 검사를 통과하지 못했습니다. 리포트: ${extra.report}`,
        "리포트가 지목한 문제만 고쳐서, 완결된 회신을 다시 쓰십시오.",
      ].join("\n")
    : `티켓 ID ${ticket.id}\n사용자 원문: ${ticket.text}`;
  const text = await runAgent(client, WORKER_PROMPTS[ticket.category], input, TOOLS, toolImpls);
  log({ node: extra ? "review" : "fanout", event: "worker_done", ticket: ticket.id, round, calls: meter.calls, tokens: meter.tokens });
  return { text, calls: meter.calls, tokens: meter.tokens };
}

async function fanoutNode(routed) {
  let calls = 0;
  let tokens = 0;

  const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
    if (ticket.category === "other") {
      const text = otherTemplate(ticket.id);
      log({ node: "fanout", event: "template_done", ticket: ticket.id });
      return { ticket, handler: "template", text };
    }
    const r = await callWorker(ticket, 1);
    calls += r.calls;
    tokens += r.tokens;
    return { ticket, handler: `worker:${ticket.category}`, text: r.text };
  });

  return { drafts, calls, tokens };
}

// ============ 9. 노드 셋: 병합(순수 코드, 페이로드가 아니라 참조를 넘김) ============

function oneLineOf(text) {
  const head = text.split(".")[0];
  return head.length > 22 ? `${head.slice(0, 22)}…` : head;
}

function mergeNode(drafts) {
  const items = drafts.map((d) => {
    const rel = path.join("out", `${d.ticket.id}.txt`);
    fs.writeFileSync(path.join(ROOT, rel), `${d.text}\n`);
    const item = {
      id: d.ticket.id,
      category: d.ticket.category,
      handler: d.handler,
      file: rel,
      oneLine: oneLineOf(d.text),
    };
    state.tickets[item.id] = {
      category: item.category,
      handler: item.handler,
      file: item.file,
      one_line: item.oneLine,
      gate_rounds: 0,
      gate_reports: [],
      stop: null,
      status: "drafted",
    };
    log({ node: "merge", event: "collected", ticket: item.id, file: item.file, chars: d.text.length });
    return item;
  });
  return { items };
}

// ============ 10. 노드 넷: 리뷰 회로(결정론적 게이트가 먼저, 검사-수정-재검사) ============

function gateCheck(ticketId, reply) {
  const problems = [];
  if (!reply.includes(ticketId)) problems.push("missing_ticket_id");
  for (const w of FILLER_WORDS) {
    if (reply.includes(w)) problems.push(`filler_word:${w}`);
  }
  return { pass: problems.length === 0, report: problems.join(" | ") };
}

async function reviewNode(items, byId) {
  let calls = 0;
  let tokens = 0;
  let totalRounds = 0;

  for (const item of items) {
    const full = path.join(ROOT, item.file);
    let reply = fs.readFileSync(full, "utf8").trim(); // 페이로드는 파일에서 읽습니다. 앞 노드가 들고 오지 않습니다
    let rounds = 0;
    let lastReport = null;
    const reports = [];
    let verdict = null;
    let gate = gateCheck(item.id, reply);
    log({ node: "review", event: "gate", ticket: item.id, round: 0, pass: gate.pass, report: gate.report });

    while (!gate.pass) {
      reports.push(gate.report);
      if (rounds >= MAX_REVIEW_ROUNDS) {
        verdict = "max_rounds";
        break;
      }
      if (gate.report === lastReport) {
        verdict = "no_progress"; // 두 회차 연속 리포트가 동일하므로, 루프가 더는 나아가지 않습니다
        break;
      }
      if (item.handler === "template") {
        verdict = "no_rewriter"; // 순수 코드 템플릿은 되돌려 보낼 워커가 없으므로 바로 사람에게 넘깁니다
        break;
      }
      lastReport = gate.report;
      rounds += 1;
      totalRounds += 1;
      const r = await callWorker(byId.get(item.id), rounds + 1, { prev: reply, report: gate.report });
      calls += r.calls;
      tokens += r.tokens;
      reply = r.text;
      fs.writeFileSync(full, `${reply}\n`);
      gate = gateCheck(item.id, reply);
      log({ node: "review", event: "gate", ticket: item.id, round: rounds, pass: gate.pass, report: gate.report });
    }

    const rec = state.tickets[item.id];
    rec.gate_rounds = rounds;
    rec.gate_reports = reports;
    rec.stop = gate.pass ? "gate_pass" : verdict;
    rec.status = gate.pass ? "pass" : "needs_human";
    rec.one_line = oneLineOf(reply);
    item.oneLine = rec.one_line;
    item.status = rec.status;
    item.rounds = rounds;
    item.stop = rec.stop;
    saveState(); // 티켓 하나를 판정할 때마다 한 번 영속화
  }

  return { items, calls, tokens, totalRounds };
}

// ============ 11. 노드 다섯: 보고(순수 코드) ============

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
  return String(s) + " ".repeat(Math.max(1, n - w));
};

function reportNode(items, totalRounds) {
  console.log("\n=== 그래프 전체 실행 요약 ===");
  console.log(pad("노드", 10) + pad("시간", 8) + pad("모델 호출", 12) + pad("토큰", 9) + pad("게이트 회차", 12) + "상태");
  // 보고 노드 자신은 이 표에 들어가지 않습니다: 이 표가 곧 그것이며, 그 시간은 바깥의 node()가 run-state.json에 기록합니다
  const order = ["route", "fanout", "merge", "review"];
  for (const name of order) {
    const n = state.nodes[name];
    if (!n) continue;
    const rounds = name === "review" ? String(totalRounds) : "-";
    console.log(pad(name, 10) + pad(`${n.ms}ms`, 8) + pad(n.calls, 12) + pad(n.tokens, 9) + pad(rounds, 12) + n.status);
  }

  console.log("\n=== 티켓별 내역 ===");
  console.log(pad("티켓", 9) + pad("범주", 10) + pad("처리자", 18) + pad("게이트 회차", 12) + pad("정지 사유", 16) + "상태");
  for (const it of items) {
    console.log(
      pad(it.id, 9) + pad(it.category, 10) + pad(it.handler, 18) + pad(it.rounds, 12) + pad(it.stop, 16) + it.status
    );
  }

  const needsHuman = items.filter((it) => it.status === "needs_human");
  console.log(`\n출력 디렉터리 out/: 회신 ${items.length}건; 사람에게 넘길 것: ${needsHuman.length}건`);
  for (const it of needsHuman) {
    console.log(`  - ${it.id} (${it.stop}): ${it.oneLine}`);
  }
  console.log(`추적: run-state.json / run.jsonl (run_id=${RUN_ID})`);
  return { needsHuman: needsHuman.length };
}

// ============ 12. 메인 흐름: 계획은 아래 이 열몇 줄입니다 ============

async function main() {
  seedWorkspace();
  initLog();
  saveState();

  const tickets = loadInbox();
  console.log(`inbox/에서 티켓 ${tickets.length}장 받음: ${tickets.map((t) => t.id).join(", ")}`);

  const { routed } = await node("route", () => routeNode(tickets));
  console.log(`[route] ${routed.map((t) => `${t.id}=${t.category}`).join("  ")}`);

  const { drafts } = await node("fanout", () => fanoutNode(routed));
  console.log(`[fanout] 동시 실행 상한 ${POOL_SIZE}, 초안 ${drafts.length}건 생성`);

  const { items } = await node("merge", async () => mergeNode(drafts));
  console.log(`[merge] out/에 ${items.length}개 파일 기록, 하류로는 참조와 한 줄 요약만 넘김`);

  if (process.env.STOP_AFTER === "merge") {
    console.log("[stop] STOP_AFTER=merge: 리뷰 앞에서 멈춥니다. 이번 실행에는 판정이 없습니다");
    process.exit(2);
  }

  const byId = new Map(routed.map((t) => [t.id, t]));
  const reviewed = await node("review", () => reviewNode(items, byId));
  console.log(`[review] 게이트 재작성: 총 ${reviewed.totalRounds}회차`);

  const { needsHuman } = await node("report", async () => reportNode(items, reviewed.totalRounds));

  process.exit(needsHuman > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(3); }); // 크래시는 3으로 종료해, needs_human의 1과 구분합니다
```

총 679줄이며, 그중 190줄쯤이 스텁에 먹이는 데이터(`SCRIPTS` 표, 티켓 원문 여섯 개, 알려진 이슈 DB, 스텁 클라이언트)이고, 실제 오케스트레이션 로직 — 노드 다섯, 동시 실행 풀, 게이트, 진입점 — 이 250줄쯤이며, 관측 가능성과 상태 추적에 40줄쯤이 더 듭니다. 이 규모는 의도한 것입니다. 루프 하나에 패턴 몇 개는 정말로 코드 몇 줄로 구현할 수 있는 것입니다[^S1].

## 검증 세팅

이 레슨의 모든 터미널 출력은 이 스크립트의 실제 실행에서 나왔습니다. "여러 번 돌려 보기 좋은 것을 고른" 것이 아니라, 비결정성의 두 원천을 미리 못 박아서입니다.

**모델을 고정 큐를 재생하는 스텁으로 바꿉니다.** `SCRIPTS`는 표이고, 키는 "티켓 id + 몇 번째 판본", 값은 미리 써 둔 응답 시퀀스입니다. `messages.create` 호출마다 다음 것을 순서대로 뱉고, 큐가 소진됐는데도 계속 부르면 곧바로 throw합니다. 이렇게 하면 "어느 티켓이 몇 회차에 어느 도구를 부르는지, 모델이 언제 끝내는지"가 전부 상수가 됩니다. 스텁은 단언도 하나 남겨 두었습니다. `create`에는 `model`과 `max_tokens`가 반드시 있어야 하고, 하나라도 빠지면 throw합니다. 실제 클라이언트가 이 두 매개변수를 요구하는데 스텁이 그것을 덮어 주지 않도록 해서, 실제 클라이언트로 바꾸는 날 그 구멍을 발견하는 일이 없게 한 것입니다. 이 방법은 코스 8의 실습부터 여기까지 쭉 써 왔고, 그래서 검증 대상은 그날 모델의 성능이 아니라 여러분의 제어 로직입니다(실제 모델은 비결정론적이라 같은 입력에도 다른 응답을 낼 수 있습니다[^S3]).

스텁은 고정 60ms 지연도 더해 실제 네트워크 왕복을 대신합니다. 이것이 없으면 모든 노드가 0ms가 되어 동시 실행 풀의 효과가 요약표에 전혀 드러나지 않습니다. 위의 `POOL_SIZE=1` 비교(507ms 대 262ms)가 그것에 기대고 있습니다.

**스텁에 루프 각본 둘을 심었습니다.** 리뷰 회로가 실제로 돌려면 게이트를 실제로 실패하는 것이 있어야 합니다. 그래서 이렇게 했습니다.

- `T-1005#1`(버그 워커의 첫 판본)은 일부러 티켓 ID를 빠뜨려 `missing_ticket_id`를 유발하고, `T-1005#2`가 첫 줄을 붙여 둘째 판본이 통과합니다. 이것이 "검사-수정-재검사"의 정상 완료 출구를 보여 줍니다.
- `T-1004#1`과 `T-1004#2`(청구 워커의 두 판본)는 둘 다 '기다려 주세요'를 답니다. 두 판본의 문장은 완전히 다르고 길이도 다르지만 게이트가 보는 것은 그 낱말의 유무이므로, 두 회차의 리포트 문자열이 동일해져 "더는 진척 없음"을 유발합니다. 이것이 손실을 끊는 출구를 보여 줍니다.

두 각본을 쓰는 데는 요령이 있습니다. 둘째 판본이 첫째를 글자 그대로 되풀이하게 만들지 않고(그러면 사람 눈에도 데드 루프로 보입니다), "고쳐 쓰긴 했지만 제대로 고치지 못했다"로 만드는 것입니다. 이것이 실제 루프에서 가장 흔한 실패 유형이고, "두 회차 연속 동일한 리포트"라는 기준이 정확히 잡아내는 것입니다.

**통제된 조기 정지.** `STOP_AFTER=merge`는 팬아웃 뒤, 리뷰 앞에서 프로세스를 멈추고 종료 코드 2를 냅니다. 코스 9의 `CRASH_AFTER`를 단순화한 판본으로, "어느 단계에서 끊을지"를 운에 기대지 않고 정확히 지정 가능한 매개변수로 만든 것입니다. 위의 `drafted` 상태 `run-state.json`이 이 실행에서 나왔습니다.

## 정산표: 이 그래프가 앞선 레슨들에 진 빚을 한 줄씩 갚는다

코스가 마무리 실습에 이르렀을 때 가장 저지르기 쉬운 실수는, 앞서 세운 규칙을 슬그머니 뒤집는 것입니다. 그래서 여기서 한 줄씩 정산하고, 어긋난 것은 명시적으로 적습니다.

**1. 루프 본문은 코스 7과 일치합니다.** 루프 본문의 네 단계 — assistant 밀어 넣기, 도구 실행, tool_result 밀어 넣기, `response` 재대입 — 는 코스 7의 레슨 6과 한 글자도 다르지 않고 주석까지 그대로입니다. 밸브 1도 원래 자리입니다. **선언하는 차이**: `runAgent`의 시그니처에 `client`와 `system` 두 매개변수가 늘었고(역할 셋이 서로 다른 스텁과 시스템 프롬프트를 필요로 합니다), `create` 호출에 `system` 필드가 늘었습니다. 토큰 계측이 루프 본문에서 `metered` 래퍼로 옮겨 갔고, 그래서 코스 7의 밸브 2(토큰 예산)가 따라오지 못했으며, 밸브 3(공회전 감지)과 밸브 4(사람 승인)도 옮겨 오지 않았습니다. 이 그래프의 도구는 파일 읽기와 주문 조회뿐이라 둘 다 읽기 전용이고, 승인이 필요한 큰 영향의 행동이 없습니다. 스텁 큐는 유한해서 공회전할 수도 없습니다. 실제 API에 붙이기 전에 이 세 밸브는 반드시 되돌려 놓아야 합니다.

**2. 위임 프롬프트의 네 요소가 갖춰졌습니다(레슨 4).** 라우터, 청구 워커, 버그 워커 세 프롬프트 각각에 목표, 출력 형식, 도구 안내, 작업 경계 네 항목을 한 줄씩 다 썼고, 한 줄씩 대조할 수 있습니다[^S2].

**3. 동시 실행 풀에 상한이 있고, 병합은 페이로드가 아니라 참조를 넘깁니다(레슨 3).** `runPool`의 `limit`이 하드 상한이며, `POOL_SIZE=1`과 `POOL_SIZE=2`의 시간 차이로 이미 검증했습니다. `merge` 이후로는 하류에 `{id, category, handler, file, oneLine}`을 넘기고 전문은 `out/`에 남으며, 리뷰 노드가 파일에서 직접 읽어 옵니다[^S2]. **선언하는 차이**: 레슨 3의 풀은 "같은 묶음의 하위 작업을 병렬로"였지만, 여기서 풀은 처리자 세 종류에 걸쳐 있습니다. 모델 워커 둘에 순수 코드 템플릿 하나이고, 템플릿이 풀에 들어가는 비용은 거의 0입니다. 풀의 의미는 그대로이지만(동시에 떠 있는 작업 수가 상한을 넘지 않음) 작업 자체가 이질적입니다. 또 레슨 3이 세웠지만 스크립트를 짧게 하려고 여기서 뺀 것이 하나 있습니다. 레슨 3은 레인마다 별도의 `try/catch`를 요구해 한 레인의 실패가 묶음 전체를 끌어내리지 않게 했는데, `runPool`에는 그 감싸기가 없습니다. 값은 이렇습니다. 팬아웃 단계에서 어느 한 레인이 throw하면 초안 묶음 전체가 영속화되지 않습니다. 실제 API에 붙이기 전에 반드시 더해야 합니다. 실제 네트워크에서 한 레인의 타임아웃은 일상입니다.

**4. 게이트가 심판보다 앞에 있고, 루프의 정지 조건이 레슨 5와 일치합니다.** 첫 여과는 모델이 아니라 결정론적 코드입니다. 이 레슨은 LLM 심판 계층을 달지 않았습니다. 이 티켓 묶음의 합격 기준이 마침 규칙으로 표현 가능해서, 달았다면 돈 낭비였을 것입니다. 코스 10의 계층적 판정이 바로 이 순서입니다. 결정론적으로 판정 가능한 것을 먼저 판정하고, 남은 것을 심판에게 묻습니다. 루프의 정지 조건은 세 종류입니다. 통과, 더는 진척 없음, 최대 회차 도달[^S5][^S1]이며, 개념은 레슨 5와 일대일로 맞아떨어집니다. **다만 필드와 값 이름이 바뀌었습니다**. 레슨 5는 `reason` 필드에 `passed`/`no-progress`/`max-rounds`로 내려앉았지만, 여기서는 `stop` 필드에 `gate_pass`/`no_progress`/`max_rounds`로 내려앉습니다(기준이 심판에서 게이트로 바뀌었고, 하이픈도 이 레슨의 snake_case 관례에 따라 밑줄로 바뀌었습니다). 또 레슨 5의 `rounds`는 생성 횟수를 세어 초안이 1회차이지만, 이 레슨의 `gate_rounds`는 재작성 횟수를 세어 초안이 0회차입니다. 그래서 같은 티켓이라도 두 레슨의 회차 기산점이 하나 다릅니다. **선언하는 차이**: 코드에는 넷째 출구 `no_rewriter`가 있습니다(순수 코드 템플릿은 되돌려 보낼 워커가 없습니다). 이것은 레슨 5가 빠뜨린 패턴이 아니라 이 그래프의 특수 사정입니다. 레슨 5의 루프는 "생산자가 모델"임을 전제했지만, 여기서는 생산자 한 종류가 템플릿입니다. 이번 실행은 이 분기에 걸리지 않았습니다.

**5. "그래프"라는 표현이 레슨 5의 선언과 일치합니다.** 전문의 "그래프"와 "노드"는 모두 이 레슨 자체의 엔지니어링 은유이며, 레슨 5가 이 시각 체계를 도입할 때 이미 명시했듯 어느 1차 자료의 공식 개념도 아닙니다. 그것이 딛고 설 수 있는 1차 자료 닻은 그 하나뿐입니다. 워크플로 스크립트 자체가 루프, 분기, 중간 결과를 쥡니다[^S5]. 이 레슨은 새 용어를 하나도 더하지 않았습니다. "상태 기계"도, "노드 사이를 오가는 상태 객체"도 쓰지 않았습니다. 레슨 5가 정의한 "엣지"(누구의 출력이 누구에게 들어가는가)는 `merge → review`의 데이터 흐름을 설명할 때 한 번 나왔을 뿐 새 어휘가 아닙니다. `routed` / `drafts` / `items`는 그저 평범한 지역 변수 셋입니다.

**6. `run-state.json`의 원자적 쓰기가 코스 9와 일치합니다.** `.tmp`에 먼저 쓰고 `renameSync`로 바꿔치기하며, 하나도 빠뜨리지 않았습니다. 쓰는 시점도 그 코스의 잣대 그대로입니다. 작은 단계가 끝날 때마다 한 번 영속화하지, 전체 실행이 끝난 뒤 한 번이 아닙니다.

**7. 관측 가능성의 잣대는 코스 11과 같은 형태이되 알갱이가 굵습니다.** 한 줄에 JSON 이벤트 하나, 각각이 `ts`와 `run_id`를 달고 있어 나중에 grep할 수 있습니다. **차이 넷**: (a) 코스 11의 로거는 내용 요약(형태, 길이, 앞 몇 글자)을 기록하지만, 이 레슨은 id, 범주, 파일명, 리포트 문자열과 개수만 기록하고 회신 전문은 기록하지 않습니다 — 전문은 이미 `out/`에 있습니다. (b) 연관 필드를 코스 11은 `trace_id`라 부르지만 여기서는 `run_id`라 부릅니다. (c) 그 코스의 핵심은 `span_id`/`parent_id`로 트레이스 트리를 엮는 것인데, 이 그래프는 노드→워커→도구 세 계층으로 중첩되어 있으면서도 부모-자식 연결을 구현하지 않았으므로 트레이스 트리가 없습니다. (d) `initLog()`가 실행마다 `run.jsonl`을 비워 가장 최근 실행만 남기므로, 코스 11의 실행 간 비교(`v-good` 대 `v-bug`)를 하려면 `run_id`별 파일로 나눠 덧붙이는 방식으로 바꿔야 합니다. 이 그래프를 실제 트레이스 시스템에 물리려면 코스 11의 span 필드를 그 패턴대로 더해야 합니다.

**8. 오케스트레이터-워커 패턴은 이 레슨이 일부러 구현하지 않았습니다(레슨 4).** 레슨 4의 오케스트레이터-워커는 "몇 개를 보내고 각자 무엇을 하는지"를 모델이 입력을 보고 그때그때 정하는 것이 핵심입니다. 이 그래프는 그렇지 않습니다. 티켓 여섯 장이 어떻게 분류되는지, 각 범주가 어느 워커로 가는지가 코드 첫 줄을 쓰기 전에 `CATEGORIES`와 상수 프롬프트 셋에 못 박혔습니다. 이것이 바로 레슨 4의 "미리 정의할 수 있다면 동적으로 만들지 마라"를 그대로 적용한 것입니다. 이 일 묶음의 모양은 이미 알려져 있으므로 결정 권한을 모델에게 돌려주면 안 됩니다. 그러므로 엄밀히 말해 이 파일에 용접된 것은 네 패턴이고(체이닝, 라우팅, 병렬화-섹셔닝, 리뷰 회로), 투표는 레벨 2 연습이 다섯째로 보태며, 오케스트레이터-워커는 이 작업 묶음의 성격이 막아 세운 하나입니다.

## 경계

이 그래프가 다루는 것은 작습니다. 프로세스 하나, 티켓 한 묶음, 돌고 나면 끝납니다. 지을 값어치가 있는 이유는 "티켓이 들어온다 → 분류한다 → 범주별로 처리한다 → 검사한다 → 보고한다"라는 다섯 단계가 코드 첫 줄을 쓰기 전에 못 박혔기 때문입니다. 작업이 "이 고객이 지난 6개월간 실제로 무엇을 겪었는지 알아내라, 몇 단계가 필요한지는 네가 판단하라"가 된다면, 이 그래프는 잘못된 아키텍처입니다. 그런 종류의 열린 문제 — 단계를 미리 예측할 수 없고 고정된 경로를 하드코딩할 수 없는 — 는 본래 자율 루프에 속합니다[^S1].

경계를 몇 개 명시해 둡니다.

**팬아웃이 동기라서 규모가 커지면 아픕니다.** `fanoutNode`의 풀은 묶음 전체가 끝나야 `merge`로 넘어갑니다. 이것이 바로 그 실제 프로덕션 시스템이 인정한 병목입니다. 동기 실행은 조율을 단순하게 만들지만 정보 흐름에 병목을 만들고, 서브에이전트 하나가 오래 끌면 시스템 전체가 기다립니다[^S2]. 티켓 여섯 장에 각각 최대 두 번의 호출이라면 이 병목은 전혀 아프지 않습니다. 티켓 600장에 각각 열 번의 호출이라면, "가장 느린 하나가 묶음 전체의 경과 시간을 정한다"가 됩니다. 비동기로 바꿀지는 값을 계산해 봐야 합니다. 비동기는 에이전트들이 동시에 일하고 필요할 때 새로 띄우게 해 주지만, 결과 조율, 상태 일관성, 서브에이전트 전반의 에러 전파에 어려움을 더합니다[^S2]. 이 셋은 동기 판본에는 없습니다. 순서를 코드가 정하기 때문입니다.

**리뷰 회로의 두 규칙은 얕고 부서지기 쉽습니다.** `includes("기다려 주세요")`는 '더 기다려 주세요라고 말씀드리지 않아도 되도록 이미 처리했습니다' 같은 문장까지 상투어로 잘못 잡습니다. 이것이 코스 10이 오래전부터 경고한 문제입니다. 지나치게 엄격한 결정론적 검증기는 맞는 것을 틀렸다고 판정합니다. 실제 프로덕션이라면 이 두 규칙을 실제 회신 소량으로 보정하거나, "심판이 다시 볼 것으로 표시" 수준으로 낮추고 곧바로 되돌려 보내지는 않아야 합니다.

**실제 API로 바꿀 때는 스텁만 바꾸고 구조는 그대로입니다.** `makeStubClient(queue)`를 `new Anthropic()`으로 바꾸고 `SCRIPTS` 표 전체를 지우면, 나머지는 한 줄도 바뀌지 않습니다. `runAgent`는 처음부터 실제 API의 `stop_reason` / `tool_use` / `tool_result` 모양에 맞춰 쓰였고, `model`과 `max_tokens`도 늘 실려 있었습니다. 바꾼 뒤에는 셋이 달라집니다. 분류 결과가 흔들리고(같은 티켓이 두 번의 실행에서 다른 범주에 앉을 수 있습니다), 게이트 회차가 흔들리고, 토큰 수가 흔들립니다. 한 번 돌릴 때마다 돈과 시간이 듭니다. 그리고 코스 7의 옮겨 오지 않은 밸브 셋을 반드시 되돌려 놓아야 합니다.

**복잡도를 한 겹 더할 때마다 "측정 가능하게 개선한다"는 관문을 통과해야 합니다.** 이 그래프의 모든 패턴은 하나씩 떼어 낼 수 있습니다. 라우팅을 하지 않고 범용 프롬프트 하나로도 티켓에 회신할 수 있고, 팬아웃을 하지 않고 여섯 장을 직렬로 돌려도 끝나고, 리뷰 회로를 하지 않고 사람이 표본 검사해도 방법입니다. 떼어 낸 뒤 메트릭이 떨어지는지, 얼마나 떨어지는지는 시험해 봐야 압니다. 복잡도가 정말로 결과를 개선할 때에만 더할 값어치가 있습니다[^S1].

## 💻 연습

<!-- exercises -->

### 레벨 1: 표를 읽기 — 루프에서 실제로 무슨 일이 있었는가

아래는 이 그래프의 완전한 실행 하나의 요약표와, `run-state.json`에서 가져온 티켓 두 장의 레코드입니다(실제 실행 결과이며, 밀리초와 `run_id`는 매번 바뀝니다).

```text
=== 그래프 전체 실행 요약 ===
노드      시간    모델 호출   토큰     게이트 회차 상태
route     65ms    1           720      -           ok
fanout    262ms   8           8903     -           ok
merge     1ms     0           0        -           ok
review    129ms   2           3033     2           ok

=== 티켓별 내역 ===
티켓     범주      처리자            게이트 회차 정지 사유       상태
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     template          0           gate_pass       pass
```

```json
"T-1004": {
  "category": "billing",
  "handler": "worker:billing",
  "file": "out/T-1004.txt",
  "one_line": "티켓 T-1004: 상호를 개인에서 회사…",
  "gate_rounds": 1,
  "gate_reports": ["filler_word:기다려 주세요", "filler_word:기다려 주세요"],
  "stop": "no_progress",
  "status": "needs_human"
},
"T-1005": {
  "category": "bug",
  "handler": "worker:bug",
  "file": "out/T-1005.txt",
  "one_line": "티켓 T-1005 회신: 알려진 이슈 K…",
  "gate_rounds": 1,
  "gate_reports": ["missing_ticket_id"],
  "stop": "gate_pass",
  "status": "pass"
}
```

코드를 쓰지 말고 세 가지에 답하십시오. (1) 티켓 여섯 장 중 어느 것이 리뷰 회로에 들어갔고, 각각 몇 회차를 돌았으며, 그것을 어느 필드에서 읽었습니까? (2) T-1004와 T-1005의 `gate_rounds`가 둘 다 1인데 왜 하나는 `pass`이고 하나는 `needs_human`입니까? 증거는 어느 필드에 있고 어떻게 읽습니까? (3) 팬아웃이 끝난 직후, 리뷰가 시작되기 전에 프로세스가 죽었다고 합시다. `run-state.json`은 무엇을 지켜 내고 무엇을 잃습니까? 재시작 뒤에는 어느 단계부터 이어받을 수 있습니까?

<!-- rubric -->
- (1) T-1004와 T-1005가 회로에 들어갔고 각각 1회차를 돌았음. 근거는 티켓별 표의 `게이트 회차` 열이 0이 아니라는 것, 또는 `run-state.json`의 `gate_rounds`가 0보다 크다는 것. 나머지 넷은 0이며 초안이 첫 검사에서 게이트를 통과했다는 뜻. 요약표 `review` 행의 게이트 회차 2는 이 둘의 1회차씩을 합한 것
- (2) 가르는 선은 `gate_rounds`가 아니라 `gate_reports`. T-1005는 리포트가 `missing_ticket_id` 하나뿐이며, 다시 쓴 둘째 판본이 검사를 통과해 둘째 리포트가 생기지 않았다는 뜻이므로 `stop`이 `gate_pass`. T-1004는 내용이 동일한 `filler_word:기다려 주세요` 항목 둘이며, 다시 쓴 뒤에도 게이트 리포트에 변화가 0이었다는 뜻이라 "두 회차 연속 동일 리포트면 더는 진척 없음으로 판정"이 발동해 `stop`이 `no_progress`, `status`가 `needs_human`. `gate_rounds`는 재작성 횟수를 세고 `gate_reports`는 실패한 리포트를 (마지막 것까지) 기록하므로 둘이 같지 않다는 것을 짚어야 함
- (3) 지켜 냄: `nodes`에 `route` / `fanout` / `merge` 세 노드의 시간과 사용량. 티켓 여섯 장의 `category`, `handler`, `file`, `one_line`. 그리고 `out/`에 이미 영속화된 초안 파일 여섯 개. 잃음: 리뷰 판정. 모든 티켓이 `status: "drafted"`, `stop: null`, `gate_reports: []`에 멈춤. 재시작 뒤에는 `out/`에서 초안을 읽어 들여 리뷰 노드부터 바로 시작할 수 있고 라우팅과 팬아웃을 다시 돌릴 필요가 없음 — 상태를 노드가 끝날 때마다 영속화했지 전체 실행이 끝난 뒤 한 번 영속화한 것이 아니기 때문
- 이 "점진 추적"의 의미를 설명함: 실행 중에 각 단계의 결과를 점진적으로 기록해 두는 것이 바로 실행이 복구 가능해지는 전제이며, 코스 9의 ".tmp에 쓰고 rename" 원자적 쓰기와도 짝을 이룸 — 그 순간에 죽어도 디스크에는 이전의 완전한 상태이거나 새로운 완전한 상태가 있음

<!-- answer -->
(1) 회로에 들어간 것은 T-1004와 T-1005이고, 각각 1회차를 돌았습니다. 가장 직접적인 필드는 티켓별 표의 `게이트 회차` 열입니다(`run-state.json`에서는 `gate_rounds`에 대응합니다). 이 둘이 1이고 나머지 넷은 0입니다. 0은 초안이 첫 검사에서 게이트를 통과해 워커를 한 번도 되부르지 않았다는 뜻입니다. 요약표 `review` 행의 그 2는 이 둘의 1회차씩을 더한 것이지, 어느 하나가 두 회차를 돈 것이 아닙니다.

(2) `gate_rounds`만 봐서는 성공과 실패를 정말 가릴 수 없습니다. 그것은 "워커를 되불러 몇 번 다시 쓰게 했는가"를 셀 뿐, 다시 쓴 결과가 좋았는지 나빴는지는 상관하지 않습니다. 진짜 증거는 `gate_reports`이고, 그것은 실패한 리포트를 하나씩, 루프를 멈추게 한 마지막 것까지 기록합니다. T-1005의 배열에는 `missing_ticket_id` 항목 하나뿐입니다. 초안에 티켓 ID가 없어 되돌려 보냈고, 다시 쓴 둘째 판본이 그것을 넣어 게이트를 통과했으므로 리포트가 하나 더 생기지 않았고, 그래서 `stop`이 `gate_pass`, `status`가 `pass`입니다. T-1004의 배열에는 항목이 둘이고 문자열이 동일합니다. 둘 다 `filler_word:기다려 주세요`입니다. 초안이 '기다려 주세요'를 써서 되돌려 보냈고, 워커가 한 판본을 다시 썼지만 — 문장이 바뀌고 길어지고 설명이 붙었지만 — 그 낱말은 그대로였고, 게이트가 돌려준 리포트가 앞 회차와 글자 하나까지 같았습니다. 루프의 기준은 "이번 회차의 리포트가 앞 회차와 같으면 더는 진척이 없다고 판정"이므로, 남은 두 회차 예산을 쓰지 않고 곧바로 멈춰 `needs_human`으로 표시했고 `stop`에 `no_progress`를 적었습니다. 한 문장으로: `gate_rounds`는 재작성 횟수를 세고, `gate_reports`는 각 재작성이 다른 결과를 냈는지를 비춥니다.

(3) 지켜 내는 몫이 적지 않습니다. `nodes`에는 `route`, `fanout`, `merge` 세 노드의 완전한 장부(시간, 모델 호출 횟수, 토큰)가 이미 들어 있고, 티켓 여섯 장에는 각각 `category`, `handler`, `file`, `one_line`이 있고, `out/` 디렉터리에는 초안 파일 여섯 개가 모두 쓰여 영속화되어 있습니다. 잃는 것은 리뷰 구간뿐입니다. 모든 티켓이 `status: "drafted"`, `stop: null`, `gate_reports`는 빈 배열이며, 누구를 다시 쓰게 하고 누구를 넘겨야 할지는 아직 아무것도 판정되지 않았습니다. 그래서 재시작 뒤에는 라우팅과 팬아웃을 통째로 건너뛰고(이 두 단계의 산물은 전부 디스크에 있습니다) `out/`에서 초안 여섯 개를 읽어 들여 리뷰 노드로 바로 들어갈 수 있습니다. 이렇게 할 수 있는 것은 상태를 쓰는 시점 덕분입니다. 노드가 끝날 때마다 한 번, 리뷰 안에서는 티켓을 판정할 때마다 또 한 번 영속화하지, 전체 실행이 끝나기를 기다렸다가 쓰지 않습니다. 각 단계의 결과를 점진적으로 기록하는 것이 바로 같은 세션 안에서 실행이 복구 가능해지는 전제이며, 이 레슨이 상태를 디스크까지 넓힌 것은 그 위에 스스로 한 겹 얹은 승격입니다. 여기에 "`.tmp`에 쓰고 `rename`" 원자적 바꿔치기가 짝을 이루어, 어느 순간에 죽어도 디스크에는 이쪽이든 저쪽이든 완전한 상태 하나가 있지, 읽어 들일 수조차 없는 반토막 JSON이 남지 않습니다.

<!-- hint -->
두 필드가 각각 무엇을 세는지부터 가르십시오. 하나는 "워커를 몇 번 되불렀는가"를 세고, 하나는 "검사 리포트가 매번 무엇이라고 했는가"를 기록합니다. 두 티켓의 첫 숫자는 같고, 둘째 필드의 길이와 내용이 다릅니다. 차이는 거기에 숨어 있습니다.

<!-- hint -->
세 번째 질문은 추론하지 말고, 저 `STOP_AFTER=merge` 실행에서 붙여 온 `run-state.json`을 곧바로 보십시오. 어느 키에 값이 있고, 어느 티켓 필드가 아직 초깃값인지(`stop`이 `null`, `gate_reports`가 `[]`, `status`가 `drafted`) 보면, 값이 있는 것이 지켜 낸 것이고 아직 초깃값인 것이 잃은 것입니다.

### 레벨 2: 그래프에 투표 노드 더하기

`other` 범주에 어조를 가늠하기 어려운 티켓이 하나 있습니다. T-1006 — "3개월을 썼는데 문제를 여러 번 올려도 감감무소식입니다. 이 제품 아직 관리하는 사람이 있긴 한가요?" 고정된 템플릿 하나로 여기에 답하는 것은 십중팔구 적절하지 않습니다. 너무 차가우면 무시하는 것처럼 보이고, 너무 따뜻하면 과잉 약속의 위험이 있습니다.

이 그래프에 투표 노드를 더하십시오. 같은 티켓, 같은 작업을 두 각도에서 한 번씩 돌리고[^S1], 순수 코드로 두 판본을 견주어 나은 것을 골라 병합으로 보냅니다. 비교 규칙은 둘뿐이며 둘 다 모델에게 물을 수 없습니다. 먼저 게이트의 결정론적 규칙으로 떨어뜨리고(금지어가 있거나 티켓 ID가 없으면 바로 탈락), 살아남은 것 중 짧은 쪽을 고릅니다(고객 회신은 장황하면 안 됩니다).

요구사항: 두 각도의 프롬프트 모두 네 요소를 갖출 것. 두 호출 모두 정직하게 `runAgent`를 거칠 것(완전한 루프를 지난다는 뜻입니다). 스텁은 각각에 응답 큐를 하나씩 줄 것. 선별 과정이 터미널과 `run.jsonl`에 자취를 남겨, 왜 이 판본이 뽑혔는지 알 수 있게 할 것. 다 쓴 뒤에는 실제로 한 번 돌려 출력을 붙이십시오. 질문 하나에도 답하십시오. 여기서 왜 순수 코드로 비교하고, 어느 판본이 나은지 모델을 불러 판정시키지 않습니까?

<!-- rubric -->
- 두 각도는 같은 작업에 대한 서로 다른 진입점임(예: "감정을 먼저 받는다" 대 "사실만 준다"). 작업을 반으로 쪼갠 것이 아님 — 이것은 투표이지 섹셔닝이 아님
- 두 호출 모두 완전한 `runAgent` 루프를 지나며, 각각에 스텁 응답 큐가 하나씩 있음. 모델 호출 횟수와 토큰이 요약표에서 그만큼 늘어남(기본 판본 대비 호출 2회 증가)
- 두 각도의 프롬프트에 목표, 출력 형식, 도구 안내, 작업 경계 네 요소가 모두 쓰여 있음
- 선별이 순수 코드임: 먼저 `gateCheck`로 떨어뜨리고, 통과한 후보 중 길이가 가장 짧은 것을 고름. 두 규칙의 순서가 또렷하게 쓰여 있고, 이번에 어느 규칙이 결정적 역할을 했는지 말할 수 있음
- 자취: 터미널에 두 후보의 판정과 길이, 그리고 최종적으로 누가 뽑혔는지를 보여 주는 줄이 하나 있고, `run.jsonl`에 대응하는 구조화 이벤트가 있음
- 두 각도를 순차로 돌리거나, 동시에 돌려도 풀의 상한이 깨지지 않는 이유를 명시함 — 풀 안에서 몰래 동시성을 한 겹 더 열어 전체 동시성을 `POOL_SIZE × 2`로 만들면 안 됨
- 심판이 아니라 순수 코드를 쓰는 이유를 분명히 밝힘: 이 두 규칙(금지어, 길이)은 본래 결정론적으로 판정 가능하고, 같은 입력이면 언제나 같은 결과이며, 호출 값이 들지 않고, 새 비결정성을 들여오지 않음. LLM 심판은 "어조가 적절한가"처럼 규칙으로 쓸 수 없는 판단에 아껴 두어야 하고, 그때도 결정론적 검사보다 뒤에 서야 함

<!-- answer -->
변경은 네 자리에 모입니다. 상수 하나, 스텁 응답 큐 둘, 각도 프롬프트 둘, 그리고 `fanoutNode`에 분기 하나와 함수 둘입니다. 나머지 코드는 한 줄도 움직이지 않습니다.

첫째 자리, 어느 티켓이 투표를 거쳐야 하는지 표시합니다.

```javascript
const CATEGORIES = ["billing", "bug", "other"];
const VOTE_TICKETS = new Set(["T-1006"]); // 어조를 가늠하기 어려운 티켓. 두 각도로 돌려 볼 값어치가 있습니다
```

둘째 자리, 스텁에 응답 큐 둘을 더합니다(`SCRIPTS`의 `T-1005#2` 뒤).

```javascript
  // 투표: 같은 티켓을 두 각도로 한 번씩 돌립니다.
  "T-1006@warm#1": [
    turn(
      "end_turn",
      [
        say(
          "티켓 T-1006 회신: 먼저 사과드립니다. 그동안 올려 주신 의견에 분명한 결과를 드리지 못한 것은 저희 후속 관리의 문제입니다. " +
            "3개월간 접수하신 티켓을 다시 엮어 담당자에게 전달했고, 빠르게 처리하겠습니다. 진행 상황은 이 티켓에 적겠습니다. " +
            "제품은 계속 관리되고 있으며, 최신 버전 변경 사항은 도움말 센터의 '업데이트 기록'에서 확인하실 수 있습니다."
        ),
      ],
      812,
      164
    ),
  ],
  "T-1006@plain#1": [
    turn(
      "end_turn",
      [
        say(
          "티켓 T-1006 회신: 제품은 계속 관리되고 있으며, 최신 버전 변경 사항은 도움말 센터의 '업데이트 기록'에서 확인하실 수 있습니다. " +
            "그동안 올려 주신 의견에 결과를 드리지 못한 것은 저희 후속 관리의 문제입니다. 담당자에게 다시 모아 전달했고, 진행 상황은 이 티켓에 적겠습니다."
        ),
      ],
      806,
      142
    ),
  ],
```

셋째 자리, 각도 프롬프트 둘(`otherTemplate` 앞)이며 네 요소를 갖췄습니다.

```javascript
// 투표를 위한 두 각도: 작업은 같고 진입점이 다릅니다(레슨 3 투표)
const ANGLE_PROMPTS = {
  warm: [
    "당신은 고객 티켓 전담이며 한 번에 티켓 한 장을 처리합니다. 이 판본은 '감정을 먼저 받는' 각도를 취합니다.",
    "목표: 후속 관리가 미흡했음을 먼저 인정한 뒤, 사용자의 진짜 질문인 '아직 관리되고 있는가'에 또렷하게 답하십시오.",
    "출력 형식: 평문 문단이며 '티켓 <ticket_id> 회신:'으로 시작합니다. 먼저 사과하고 무엇을 했는지 밝힌 다음 제품 상태를 답하십시오. 글머리 기호 목록은 쓰지 마십시오.",
    "도구 안내: 이 단계에서는 시스템 도구를 주지 않습니다. 티켓 원문의 사실만 쓰고, 티켓 이력의 구체적인 건수를 조회했다고 말하지 마십시오.",
    "작업 경계: 구체적인 수정 날짜를 약속하지 말고, 보상을 주지 말고, 동료를 평가하지 마십시오. '기다려 주세요', '조금만 더 기다려 주시기 바랍니다', '빠르게 처리하겠습니다' 같은 빈말을 쓰지 마십시오.",
  ].join("\n"),
  plain: [
    "당신은 고객 티켓 전담이며 한 번에 티켓 한 장을 처리합니다. 이 판본은 '사실만 준다'는 각도를 취합니다.",
    "목표: 제품이 아직 관리되고 있는지 곧바로 답한 뒤, 이 의견들을 다음에 누가 이어받는지 밝히십시오.",
    "출력 형식: 평문 문단이며 '티켓 <ticket_id> 회신:'으로 시작합니다. 첫 문장에 결론을 주고 이어서 다음 단계를 쓰십시오. 글머리 기호 목록도, 사과 상용구도 쓰지 마십시오.",
    "도구 안내: 이 단계에서는 시스템 도구를 주지 않습니다. 티켓 원문의 사실만 쓰고, 버전 번호를 지어내지 마십시오.",
    "작업 경계: 구체적인 수정 날짜를 약속하지 말고, 보상을 주지 말고, 동료를 평가하지 마십시오. '기다려 주세요', '조금만 더 기다려 주시기 바랍니다', '빠르게 처리하겠습니다' 같은 빈말을 쓰지 마십시오.",
  ].join("\n"),
};
```

넷째 자리, 새 함수 둘(`fanoutNode` 앞)입니다.

```javascript
async function callAngle(ticket, angle) {
  const key = `${ticket.id}@${angle}#1`;
  const queue = SCRIPTS[key];
  if (!queue) throw new Error(`스텁 스크립트 없음: ${key}`);
  const { client, meter } = metered(makeStubClient(queue));
  const input = `티켓 ID ${ticket.id}\n사용자 원문: ${ticket.text}`;
  const text = await runAgent(client, ANGLE_PROMPTS[angle], input, [], {}); // 두 각도 프롬프트 모두 "시스템 도구 없음"이라 썼으므로, 여기서도 빈 tools를 넘겨야 합니다. routeNode와 같은 형태입니다
  log({ node: "fanout", event: "vote_candidate", ticket: ticket.id, angle, chars: text.length, calls: meter.calls, tokens: meter.tokens });
  return { angle, text, calls: meter.calls, tokens: meter.tokens };
}

// 순수 코드 선별: 먼저 게이트의 결정론적 규칙으로 떨어뜨리고, 살아남은 것 중 가장 짧은 것을 고릅니다
function pickBest(ticketId, candidates) {
  const scored = candidates.map((c) => ({ ...c, gate: gateCheck(ticketId, c.text) }));
  const alive = scored.filter((c) => c.gate.pass);
  const pool = alive.length > 0 ? alive : scored; // 전부 탈락하면 전부 남겨, 리뷰 노드가 판정하게 넘깁니다
  const winner = pool.reduce((a, b) => (b.text.length < a.text.length ? b : a));
  return { winner, scored, allFailed: alive.length === 0 };
}
```

그리고 `fanoutNode`의 풀 콜백 앞머리에 분기 하나를 더합니다(`other` 템플릿 분기는 그대로 남고, T-1003은 여전히 그리로 갑니다).

```javascript
  const drafts = await runPool(routed, POOL_SIZE, async (ticket) => {
    if (VOTE_TICKETS.has(ticket.id)) {
      // 두 각도는 순차로 돌립니다: 동시 실행 상한은 풀이 통일해 쥡니다. 풀 안에서 몰래 동시성을 열지 마십시오
      const candidates = [];
      for (const angle of ["warm", "plain"]) {
        const c = await callAngle(ticket, angle);
        calls += c.calls;
        tokens += c.tokens;
        candidates.push(c);
      }
      const { winner, scored } = pickBest(ticket.id, candidates);
      log({
        node: "fanout",
        event: "vote_pick",
        ticket: ticket.id,
        winner: winner.angle,
        detail: scored.map((c) => `${c.angle}/${c.gate.pass ? "ok" : c.gate.report}/${c.text.length}자`).join(" | "),
      });
      console.log(
        `[vote] ${ticket.id} ` +
          scored.map((c) => `${c.angle}=${c.gate.pass ? "ok" : c.gate.report}(${c.text.length}자)`).join("  ") +
          `  → ${winner.angle} 선택`
      );
      return { ticket, handler: `vote:${winner.angle}`, text: winner.text };
    }
    if (ticket.category === "other") {
      const text = otherTemplate(ticket.id);
      log({ node: "fanout", event: "template_done", ticket: ticket.id });
      return { ticket, handler: "template", text };
    }
    const r = await callWorker(ticket, 1);
    calls += r.calls;
    tokens += r.tokens;
    return { ticket, handler: `worker:${ticket.category}`, text: r.text };
  });
```

실제 실행 결과입니다.

```text
\$ node orchestrate.mjs
inbox/에서 티켓 6장 받음: T-1001, T-1002, T-1003, T-1004, T-1005, T-1006
[route] T-1001=billing  T-1002=bug  T-1003=other  T-1004=billing  T-1005=bug  T-1006=other
[vote] T-1006 warm=filler_word:빠르게 처리하겠습니다(201자)  plain=ok(159자)  → plain 선택
[fanout] 동시 실행 상한 2, 초안 6건 생성
[merge] out/에 6개 파일 기록, 하류로는 참조와 한 줄 요약만 넘김
[review] 게이트 재작성: 총 2회차

=== 그래프 전체 실행 요약 ===
노드      시간    모델 호출   토큰     게이트 회차 상태
route     62ms    1           720      -           ok
fanout    369ms   10          10827    -           ok
merge     2ms     0           0        -           ok
review    127ms   2           3033     2           ok

=== 티켓별 내역 ===
티켓     범주      처리자            게이트 회차 정지 사유       상태
T-1001   billing   worker:billing    0           gate_pass       pass
T-1002   bug       worker:bug        0           gate_pass       pass
T-1003   other     template          0           gate_pass       pass
T-1004   billing   worker:billing    1           no_progress     needs_human
T-1005   bug       worker:bug        1           gate_pass       pass
T-1006   other     vote:plain        0           gate_pass       pass

출력 디렉터리 out/: 회신 6건; 사람에게 넘길 것: 1건
  - T-1004 (no_progress): 티켓 T-1004: 상호를 개인에서 회사…
추적: run-state.json / run.jsonl (run_id=run-mtem5fz4)
```

기본 판본과 견주면 `fanout`의 모델 호출이 8에서 10으로, 토큰이 8903에서 10827로, 시간이 262ms에서 369ms로 올랐습니다. 이것이 투표의 값입니다. 같은 티켓의 일을 두 번 한 것입니다. 티켓별 표에서 T-1006의 처리자가 `template`에서 `vote:plain`으로 바뀌었습니다.

이번에는 첫째 규칙이 승부를 갈랐습니다. `warm` 판본에 '빠르게 처리하겠습니다'가 있어 금지어에 걸려 바로 탈락했고, 길이 규칙은 나설 차례조차 없었습니다. 길이 규칙이 작동하는 것을 보려면 스텁의 `T-1006@warm#1`에서 "담당자에게 전달했고, 빠르게 처리하겠습니다. 진행 상황은 이 티켓에 적겠습니다"를 "담당자에게 전달했고, 진행 상황은 이 티켓에 적겠습니다"로 바꿔 다시 돌리십시오. 실제 출력은 이렇습니다.

```text
[vote] T-1006 warm=ok(188자)  plain=ok(159자)  → plain 선택
```

두 판본이 모두 결정론적 검사를 통과했으므로 둘째 규칙으로 짧은 쪽을 고르고, `plain`이 159자 대 188자로 이깁니다.

**왜 순수 코드로 비교하고 모델을 불러 판정시키지 않는가?** 이 두 규칙이 본래 결정론적으로 판정 가능하기 때문입니다. "금지어가 있는가 없는가", "어느 판본이 더 짧은가" 같은 질문은 문자열 연산 한 줄이면 답이 나오고, 같은 입력이면 언제나 같은 결과이며, 호출 하나 값이 들지 않고, 네트워크 대기가 하나 늘지 않고, 새 비결정성도 들여오지 않습니다. 코스 10의 계층적 판정이 말하는 순서가 바로 이것입니다. 결정론적으로 판정 가능한 것을 먼저 판정하고, 남은 것이 심판의 차례입니다. 거꾸로 말해 비교 기준이 "어느 판본의 어조가 더 이야기를 이어 가고 싶게 만드는가"가 된다면 그것은 정말로 규칙으로 쓸 수 없으니 심판에게 물어야 합니다. 다만 그때도 심판은 이 두 결정론적 규칙보다 뒤에 서야 합니다. 명백히 자격 미달인 후보를 먼저 떨어뜨리고, 남은 것에 돈을 써서 판정하는 것입니다.

덧붙여 밟기 쉬운 함정 하나. 두 각도는 순차로 돌립니다. 편하다고 `Promise.all`로 쓰면 풀이 동시에 띄우는 모델 호출이 `POOL_SIZE × 2`가 되어, 상한 2라고 생각한 것이 실은 4가 됩니다. 여기처럼 순차로 하든, 투표 후보도 풀 작업으로 취급해 같은 풀에 맡기든 하십시오. 어차피 상한은 한 곳에서만 세야 합니다.

<!-- hint -->
투표와 섹셔닝의 차이부터 또렷하게 하십시오. 섹셔닝은 한 가지를 조각으로 쪼개 각 조각이 일부만 맡는 것이고, 투표는 같은 것을 통째로 두 번 하되 진입점만 다르고 마지막에 하나를 골라야 하는 것입니다. 그러니 두 각도 프롬프트의 "목표" 줄은 같은 것을 말해야 하고, 차이는 어떻게 들어가는지, 무엇을 먼저 말하는지에 있습니다.

<!-- hint -->
선별에 또 한 벌의 규칙을 새로 쓰지 마십시오. `gateCheck`가 이미 있으니 그것을 첫 체로 그대로 쓰고, 후보 둘을 한 번씩 돌려 누구의 `pass`가 `true`인지 보십시오. 남는 일은 "살아남은 것 중 가장 짧은 것 고르기"라는 `reduce` 한 문장뿐입니다. 실제로 한 번 돌려서 터미널의 `[vote]` 줄이 두 후보의 상태를 각각 무엇으로 찍는지 보면, 이번에 어느 규칙이 역할을 했는지 알 수 있습니다.

<!-- /exercises -->

## 정리

- 네 패턴이 한 파일로 용접됐고(투표는 연습이 다섯째로 보태며, 오케스트레이터-워커는 배분을 미리 정의할 수 있어 의도적으로 빠졌다), "계획이 코드에 있다"는 말이 구체적인 모양을 얻는다. `main()`의 열몇 줄이 전부 제어 흐름이고, `routed` / `drafts` / `items` 세 평범한 변수가 전부 상태다. LLM과 도구가 미리 정의된 코드 경로를 통해 오케스트레이션되고[^S1], 스크립트 자체가 루프, 분기, 중간 결과를 쥐며, 모델의 컨텍스트는 이번 단계에 필요한 것만 쥔다[^S5]
- 모든 노드가 모델일 필요는 없다. 다섯 노드 중 둘이 모델을 부르고, `merge`와 `report`와 게이트의 첫 여과는 모두 순수 코드이며, `other` 범주는 문자열 템플릿으로 간다. 결정론적 코드가 같은 답을 낼 수 있는 자리라면 호출 하나의 값과 지연을 치를 이유가 없다
- 라우팅의 값어치는 그 호출이 아니라 호출 뒤의 조이기 코드 열 줄에 있다. 모델의 자유 텍스트를 세 개의 적법한 레이블 중 하나로 눌러 넣고, 하류 분기는 코드가 검증한 값만 인정한다. 전문화된 프롬프트는 분류가 벌어들인 배당이다[^S1]
- 팬아웃의 동시 실행에는 반드시 상한이 있어야 하고, 병합은 페이로드가 아니라 참조를 넘겨야 한다 — 출력은 디스크에 내리고 하류로는 가벼운 참조만 넘기며[^S2], 리뷰 노드가 파일에서 직접 읽는다. 동기 팬아웃은 이 규모에서는 아프지 않지만 규모가 커지면 병목이 된다[^S2]. 비동기로 바꾸려면 값 셋을 치러야 한다. 결과 조율, 상태 일관성, 서브에이전트 전반의 에러 전파다[^S2]
- 리뷰 회로는 검사-수정-재검사이며 통과하거나 더는 진척이 없을 때까지 돌고[^S5], 여기에 최대 회차라는 안전망이 하나 더 붙는다[^S1]. 결정론적 게이트는 심판보다 앞에 선다. "두 회차 연속 동일한 리포트"라는 기준은 최대 회차보다 일찍 손실을 끊고, 그것이 주는 결론이 더 정보량이 많다. "세 번 해 봤는데 안 된다"가 아니라 "이 피드백을 이해하지 못한다"이다
- 점진 추적이 복구 가능성을 데려온다. 노드가 끝날 때마다 한 번 영속화하는 것이 바로 같은 세션 안에서 실행을 이어 갈 수 있는 전제이며[^S5](프로세스와 기계를 넘는 이어 가기는 상태를 디스크에 영속화한 뒤 이 레슨이 스스로 얹은 승격이다), `.tmp`에 쓰고 `rename`하는 원자적 바꿔치기와 짝을 이루면 어느 순간에 죽어도 디스크에는 읽어 들일 수 있는 완전한 상태 하나가 있다
- 이 그래프가 다루는 것은 프로세스 하나, 티켓 한 묶음, 단계가 못 박힌 일이다. 단계를 예측할 수 없는 열린 문제는 자율 루프로 돌아가야 하고[^S1], 복잡도를 한 겹 더할 때마다 "측정 가능하게 개선한다"는 관문을 통과해야 한다[^S1]

열두 레슨이 여기서 끝납니다.

돌아보면, 지금 여러분이 가진 것은 조각조각 쌓인 것입니다. 코스 1(Claude Code Skills: 나만의 AI 워크플로 만들기)에서 첫 프롬프트를 썼고 요구사항을 또렷하게 말하는 법을 배웠습니다. 그다음 도구 호출, 워크플로, 스킬, 멀티 에이전트 협업을 지나 코스 7까지 왔습니다. 그 코스는 여러분이 직접 루프를 쓰게 했습니다. `while (response.stop_reason === "tool_use")`. 그날부터 에이전트는 더 이상 여러분에게 블랙박스가 아니라 읽을 수 있는 코드 한 덩이가 되었습니다. 코스 8(컨텍스트 엔지니어링: 유한한 주의를 값어치 있는 곳에 쓰기)은 그 컨텍스트를 관리하고, 루프가 윈도우를 터뜨릴 때까지 돌지 않게 하는 법을 가르쳤습니다. 코스 9는 그것이 중단을 견디게, 죽어도 멈춘 자리에서 이어 가게 만드는 법을 가르쳤습니다. 코스 10은 그 출력을 검증하고 "끝난 것 같다"와 "끝났다"를 가르는 법을 가르쳤습니다. 코스 11은 그 과정을 들여다보고, 무언가 깨졌을 때 볼 로그와 트레이스를 갖추는 법을 가르쳤습니다. 이 코스는 여러 루프를 계획을 스스로 쥔 그래프 하나로 조합하는 법을 가르쳤습니다.

이 여섯은 한 가지의 여섯 면입니다. **여러분이 쓴 코드 안에서, 여러분은 비결정론적인 것을 통제하고 있습니다.** 루프는 여러분이 쓴 것이고, 컨텍스트는 여러분이 관리하는 것이고, 체크포인트는 여러분이 저장한 것이고, 합격 기준은 여러분이 정의한 것이고, 로그는 여러분이 찍은 것이고, 계획은 여러분이 배치한 것입니다. 모델은 매우 강력하지만, 그것은 여러분이 지은 이 제어 코드 안에서 일합니다.

마지막 걸음은 구체적인 행동에 내려앉습니다. `orchestrate.mjs`의 `makeStubClient(queue)`를 `new Anthropic()`으로 바꾸고, `SCRIPTS` 표를 지우고, 코스 7의 옮겨 오지 않은 밸브 셋을 되돌려 놓은 뒤, 여러분 일에 실제로 쌓여 있는 작업 묶음 — 진짜 티켓, 진짜 로그, 진짜 할 일 — 을 `inbox/`에 부어 넣고 처음으로 돌려 보십시오. 아마 몇 건이 `needs_human`에 내려앉을 것입니다. 그것이 바로 이 그래프의 마땅한 모습입니다.
