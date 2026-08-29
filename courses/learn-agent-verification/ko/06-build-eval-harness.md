# 레슨 6: 실습: 에이전트를 위한 평가 트랙 만들기

> 학습 목표:
> - 평가 세트, 계층화된 채점, 하네스 루프를 하나로 엮어 실행 가능한 `eval-runner.mjs` 만들기 — 평가 태스크 하나에 독립적인 루프 하나
> - 리포트에 통과율만이 아니라 태스크별 소요 시간, 도구 호출 횟수, 토큰 소비량, 도구 에러까지 담고, 그 열들로 문제 진단하기
> - 이 트랙으로 시스템 프롬프트 변경의 실제 영향을 측정하고, 올바른 출력을 거절하는 지나치게 엄격한 검증기 잡아내기
>
> 전제: 레슨 1–5를 읽었고, 과정 7의 하네스 루프를 바로 돌릴 수 있는 상태 | 이전: [레슨 5 <<](./05-eval-sets.md)

앞의 다섯 레슨은 전부 부품이었습니다. 단계별이 아니라 최종 상태를 검증한다(레슨 2), 결정론적 체크를 먼저 쓰되 지나치게 엄격한 검증기를 조심한다(레슨 3), 자유 형식 텍스트에만 LLM 판정자를 붙인다(레슨 4), 평가 세트는 실제 과제 20개 남짓에서 시작한다(레슨 5). 각각은 그 자체로 말이 되지만, 프롬프트를 바꾼 뒤에 명령 하나로 돌려서 숫자가 '나아졌다 나빠졌다'를 말해 주는 물건은 여전히 없습니다.

이 레슨은 그 부품들을 용접합니다. 결과물은 2초 안에 끝나는 300줄짜리 파일입니다. '평가를 어떻게 돌리는가'에 대한 공식 가이던스는 직설적입니다. 프로그램에서 LLM API를 직접 호출하고, 단순한 에이전틱 루프(LLM 호출과 도구 호출이 번갈아 도는 while 루프)를 쓰되 **평가 태스크 하나에 루프 하나**를 두라는 것입니다[^S3]. 그것이 바로 이 시리즈 과정 7의 `stop_reason` 기반 루프입니다. 그대로 이식하면 됩니다.

## 동작하는 모습 먼저 보기

이 레슨 뒤쪽에 있는 `eval-runner.mjs` 전문을 저장하고 `node eval-runner.mjs`를 실행합니다.

```text
=== 리포트 · 프롬프트 v1 · 검증기 normalized (수정 후) ===
태스크            채점 방식     결과      점수  호출  에러      토큰   소요 시간
--------------------------------------------------------------------------------
t1-total          결정론적      pass      1.00     3     0     1,800       124ms
t2-pending        결정론적      pass      1.00     1     0       995        82ms
t3-no-orderid     결정론적      FAIL      0.00     2     1     1,550       124ms
t4-refund-note    LLM 판정자    FAIL      0.67     1     0     1,432       124ms
t5-missing-order  결정론적      pass      1.00     1     1       966        83ms
--------------------------------------------------------------------------------
통과율 3/5 (60%) · 도구 호출 8 · 도구 에러 2 · 토큰 6,743 · 합계 537ms

미통과 케이스:
  [t3-no-orderid] 판정 기준: 파라미터가 불완전하면 도구를 한 번도 호출하지 말고 주문번호를 되물어야 한다
  에이전트 답변: 주문 SO-1001의 상태는 완료입니다.
  [t4-refund-note] 판정 기준: 금액은 주문과 일치하고 톤도 적절하다. 다만 환불 입금 시점이 빠져 있어 고객이 예상 시점을 알 수 없다. 3개 항목 중 1개 누락.
  에이전트 답변: 안녕하세요, 주문 SO-1003(금액 ₩320.00)의 취소 요청을 접수했습니다. 환불은 원 결제수단으로 돌려드립니다. 불편을 드려 죄송합니다.

=== 리포트 · 프롬프트 v2 · 검증기 normalized (수정 후) ===
태스크            채점 방식     결과      점수  호출  에러      토큰   소요 시간
--------------------------------------------------------------------------------
t1-total          결정론적      pass      1.00     3     0     1,800       122ms
t2-pending        결정론적      pass      1.00     1     0       995        82ms
t3-no-orderid     결정론적      pass      1.00     0     0       487        41ms
t4-refund-note    LLM 판정자    pass      1.00     1     0     1,518       123ms
t5-missing-order  결정론적      pass      1.00     1     1       966        82ms
--------------------------------------------------------------------------------
통과율 5/5 (100%) · 도구 호출 6 · 도구 에러 1 · 토큰 5,766 · 합계 450ms

=== 점수 변화 v1 -> v2 ===
태스크                 v1     v2  변화
--------------------------------------------------
t1-total             1.00   1.00  변화 없음
t2-pending           1.00   1.00  변화 없음
t3-no-orderid        0.00   1.00  fail => pass
t4-refund-note       0.67   1.00  fail => pass
t5-missing-order     1.00   1.00  변화 없음
--------------------------------------------------
통과율 3/5 -> 5/5
```

이것은 손으로 지어낸 예시가 아닙니다. 임시 디렉터리에서 실제로 돌린 결과를 그대로 옮긴 것입니다. 전체 코드를 복사해서 한 번 돌려 보십시오. '소요 시간' 열(실제 벽시계 시간이라 머신 부하에 따라 달라집니다)을 빼면 밀리초 단위까지 일치합니다. 숫자가 같은 이유는 스텁 client가 정해진 응답을 돌려주기 때문입니다.

이 출력 안에 이 레슨이 가르치는 것이 전부 들어 있습니다. 다섯 태스크가 각자의 루프를 돌고, 두 가지 채점 방식이 한 표에 섞여 있고, 통과율에 진단용 네 열이 붙고, 두 버전의 차이가 비교표 하나로 접힙니다. 이 레슨의 나머지는 그것을 하나씩 푸는 일입니다.

## 트랙의 다섯 조각

1. **테스트 대상**: 도구 정의, 실제 도구 구현, 그 뒤의 데이터. 평가는 '에이전트가 당신의 도구를 써서 일하는 것'을 돌립니다. 도구도 테스트 대상의 일부입니다.
2. **스텁 client**: 고정된 큐에서 정해진 응답을 돌려주는 가짜 `messages.create`. 트랙 전체를 재현 가능하게 만듭니다.
3. **평가 세트**: `tasks` 배열이고 각 항목은 `{id, prompt, verify}`입니다. 공식 요건은 이렇습니다. 모든 평가 프롬프트에는 검증 가능한 응답이나 결과가 짝지어져 있어야 합니다[^S3]. 검증기가 없는 프롬프트는 평가 태스크가 아니라 데모입니다.
4. **채점**: 결정론적으로 채점할 수 있는 것은 `verify` 함수로 가고, 자유 형식 텍스트는 판정자로 갑니다.
5. **루프와 리포트**: 태스크 하나에 while 루프 하나, 끝나면 지표를 표로 집계합니다.

먼저 못 박아 둘 것이 하나 있습니다. **태스크는 `messages`를 공유하지 않습니다.** 각 태스크의 `messages`는 그 태스크의 사용자 프롬프트 하나로 시작해서 자기 루프를 돌고 버려집니다[^S3]. 이것이 왜 그렇게 중요한지는 중간의 퀴즈가 바로 묻습니다.

## 조각 1: 도구와 그 뒤의 데이터

테스트 대상은 주문 어시스턴트입니다. 주문 4건, 도구 2개입니다. `search_orders`(고객명이나 상태로 검색해 주문 ID 목록을 반환)와 `get_order`(주문 ID로 단일 주문 상세를 조회)입니다. 두 가지 세부는 일부러 그렇게 만들었습니다. `search_orders`는 금액 없이 주문 ID만 반환해서, 에이전트가 주문마다 `get_order`를 다시 호출하게 만듭니다. 리포트의 '호출' 열이 이 설계 결함을 드러낼 것입니다. 다른 하나는 두 필터 조건이 모두 비어 있으면 에러를 던진다는 점입니다.

```javascript
search_orders({ customer, status }) {
  if (!customer && !status) {
    throw new Error("잘못된 파라미터: customer 또는 status 중 최소 하나를 제공해야 합니다");
  }
  // ...조건으로 필터링해서 { order_ids: [...] } 반환
}
```

이것이 '잘못된 파라미터' 도구 에러입니다. 공식 가이던스는 이런 에러가 몰려 나오면 대개 도구 설명을 더 명확하게 쓰거나 예시가 필요하다는 뜻이라고 말합니다[^S3]. 잠시 뒤 리포트에서 보게 됩니다. 도구 에러는 크래시가 아닙니다. 도구 실행 블록이 예외를 잡아서 `is_error: true`가 붙은 `tool_result`로 감싸 모델에 돌려주고, 카운터를 하나 올립니다. `tool_use`와 `tool_result`는 `tool_use_id`로 짝지어집니다. 과정 7에서 깔아 둔 토대이고, 여기서는 카운터 두 개만 더 얹습니다.

## 조각 2: 스텁 client와 검증에 관한 막간

여기서 한 번 멈춰야 합니다. 그러지 않으면 아래의 숫자가 하나도 성립하지 않습니다.

진짜 Claude는 비결정론적입니다. 같은 프롬프트를 두 번 돌려도 경로가 완전히 달라질 수 있습니다[^S2]. 프로덕션에서는 좋은 일이지만 데모 레슨에서는 재앙입니다. 오늘 돌리면 3/5, 내일 돌리면 4/5인데 그 차이가 프롬프트 변경 때문인지 모델의 기분 때문인지 알 수 없습니다. 그래서 과정 8과 9의 실습 레슨은 모두 같은 방법을 씁니다. **모델을 고정된 큐에서 정해진 응답을 돌려주는 스텁으로 바꿔** 테스트 대상 동작을 통제 변수로 만드는 것입니다. 이렇게 하면 모델의 그날 컨디션이 아니라 당신이 작성한 제어 로직을 검증하게 됩니다.

```javascript
function stubClient(script, label) {
  if (!script) throw new Error(`[stub] ${label}에 대한 응답 큐가 없습니다`);
  let cursor = 0;
  return {
    messages: {
      async create() {
        if (cursor >= script.length) {
          throw new Error(`[stub] ${label} 응답 큐가 소진되었습니다 (요청 ${cursor}건 발행)`);
        }
        const res = script[cursor++];
        await sleep(res.latency_ms);
        return res;
      },
    },
  };
}
```

큐가 소진되면 에러를 던지고 대체 응답을 내놓지 않습니다. 루프가 한 번 더 돌면 곧바로 `Error: [stub] v1/t2-pending 응답 큐가 소진되었습니다 (요청 1건 발행)`가 보입니다(t2의 큐에서 마지막 응답을 지우고 실제로 받은 에러 문구입니다). 가짜 `end_turn`이 슬쩍 통과하는 일이 없습니다. 각 응답은 자기 `latency_ms`를 갖고 있고 스텁이 실제로 그만큼 잠들기 때문에, '소요 시간' 열이 루프가 몇 턴을 돌았는지를 재게 됩니다. 태스크마다 자기 스크립트를 가진 새 client를 받으므로 커서가 태스크를 넘나들지 않습니다.

**두 프롬프트 버전의 차이는 스텁의 두 응답 큐에 고정되어 있습니다.** 실제 상황이라면 시스템 프롬프트를 바꾸고 모델 동작이 따라오지만, 여기에는 모델이 없으므로 `SCRIPT_V1`과 `SCRIPT_V2`를 미리 써 두고 v2가 두 태스크에서 다른 응답을 내놓게 했습니다. 'v2 프롬프트가 먹혀서 모델이 이렇게 답한다고 가정한다'를 데이터로 인코딩한 것입니다.

```javascript
// v2는 두 태스크의 응답만 갈아 끼운다 — 버전 차이가 여기에 고정되어 있다
const SCRIPT_V2 = {
  ...SCRIPT_V1,
  "t3-no-orderid": [
    finish("어느 주문을 말씀하시는 걸까요? 주문번호(SO-1001 형식)를 알려 주세요.", [455, 32]),
  ],
  "t4-refund-note": [/* 입금 시점을 추가한 버전 */],
};
```

전개 문법으로 v1을 물려받고 바뀐 항목만 나열하면, 코드를 읽는 사람이 변경 범위를 한눈에 봅니다. 이 트랙은 **트랙 자신을 검증합니다**. 검증기가 제대로 채점하는지, 지표가 정확히 기록되는지, 리포트가 옳게 계산하는지, 두 번의 실행을 비교할 수 있는지입니다. 진짜 client로 바꿔 끼워도 트랙은 바뀌지 않습니다. 숫자만 튀기 시작할 뿐입니다.

## 조각 3: 평가 세트 — 일반 4개와 엣지 케이스 1개

레슨 5는 평가 세트가 실제 분포와 맞아야 하고 엣지 케이스를 덮어야 한다고 했습니다[^S5]. 공식도 도구를 충분한 복잡도로 시험하지 못하는 지나치게 단순한 샌드박스 환경을 경계했습니다[^S3]. 여기서는 지면 때문에 태스크를 다섯 개만 담지만, 구조는 실제 평가 세트를 따릅니다.

| 태스크 | 무엇을 테스트하는가 | 채점 |
| --- | --- | --- |
| `t1-total` | 다단계 집계: 목록을 검색한 뒤 각각의 금액을 가져오기 | 결정론적 |
| `t2-pending` | 집합 필터링: 주문 ID가 정확히 이것들이어야 하고 더도 덜도 안 됨 | 결정론적 |
| `t3-no-orderid` | **엣지 케이스**: 사용자가 주문 ID를 주지 않음 | 결정론적 |
| `t4-refund-note` | 자유 형식 텍스트: 고객에게 보내는 환불 안내 | LLM 판정자 |
| `t5-missing-order` | 도구 에러 후에 사실대로 보고하고 데이터를 지어내지 않기 | 결정론적 |

`t3-no-orderid`는 따로 언급할 만합니다. 프롬프트는 '그 주문 상태 좀 확인해 주세요'인데, 어느 주문입니까? 지정되어 있지 않습니다. 이상적인 동작은 주문 ID를 추측해서 조회하는 대신 되묻는 것입니다. 공식 문서는 이 동작에 대해 조심스럽습니다. 사용자 프롬프트에 도구의 필수 파라미터를 전부 채울 만한 정보가 없으면 Claude Opus는 빠진 파라미터를 알아채고 되묻는 경우가 훨씬 많지만, 이 동작은 보장되지 않으며 특히 더 모호한 프롬프트와 능력이 낮은 모델에서 그렇다고 합니다[^S6]. **'보장되지 않는' 동작이야말로 평가 세트가 덮어야 할 것입니다.** 보장되는 것은 테스트할 필요가 없습니다.

```javascript
{
  id: "t3-no-orderid",
  grader: "결정론적",
  prompt: "그 주문 상태 좀 확인해 주세요.",
  verify: (r) => ({
    pass: r.toolCalls === 0 && r.answer.includes("?") && r.answer.includes("주문번호"),
    note: "파라미터가 불완전하면 도구를 한 번도 호출하지 말고 주문번호를 되물어야 한다",
  }),
},
```

`verify`가 받는 `r`에는 `answer`만이 아니라 `toolCalls`, `toolErrors`, `tokens`도 들어 있어서, 검증기가 텍스트만이 아니라 '최종 상태와 핵심 지표'를 확인할 수 있습니다. `t3`는 실제로 '도구를 한 번도 호출하지 않았음'을 확인하고, `t5`는 '에러를 정확히 한 번 보고했고 찾을 수 없다고 사실대로 말했음'을 확인합니다. 레슨 2의 최종 상태 우선이 이 필드들을 통해 실현됩니다. `note`는 사람을 위한 것입니다. 태스크가 실패하면 리포트가 판정 기준과 에이전트의 실제 답변을 나란히 출력합니다.

레슨 5 숙제에서 `{id, prompt, expected, verifier, rubricRef, tags, split}` 필드 집합을 썼다면 지금 대응시켜 두어야 헷갈리지 않습니다. 레슨 5의 `verifier`는 여기서 `grader`라고 부르고 표시용일 뿐입니다. 실제 채점 유형은 이 태스크에 `verify` 함수가 있는지 `judge: true`가 있는지로 정해집니다. `expected`의 선언적 단언은 여기서 `verify` 함수 본문에 직접 쓰입니다(태스크마다 단언의 모양이 다르니, 범용 단언 포맷을 설계하는 것보다 함수로 쓰는 편이 간단합니다). `rubricRef`는 판정자 케이스가 스위트 전체에 하나뿐이라 `JUDGE_PROMPT`로 인라인했습니다. `tags`와 `split`은 지면상 생략했고, 홀드아웃 규율은 늘 그렇듯 '범위' 절에서 다시 반복합니다. 레슨 5의 JSON은 낡은 것이 아닙니다. 그것은 이 `TASKS` 배열의 선언적 버전입니다. 앞으로 나아간다는 것은 단언 하나하나를 함수로 옮긴다는 뜻입니다.

## 조각 4: 계층화된 채점, 결정론적 우선

채점 방식에는 순서가 있습니다. 코드 기반 채점은 가장 빠르고 가장 신뢰할 수 있으며 확장성도 대단히 좋지만 복잡한 판단에서는 뉘앙스가 부족합니다. LLM 기반 채점은 빠르고 유연하며 복잡한 판단을 다룰 수 있지만 먼저 신뢰성을 테스트하고 그다음에 확장해야 합니다. 사람 채점은 가장 유연하고 품질도 가장 높지만 느리고 비싸서 가능하면 피합니다[^S5].

그래서 규칙은 이렇습니다. **코드로 채점할 수 있는 것은 절대 판정자에게 보내지 않습니다.** 여기 다섯 태스크 중 넷이 `verify`를 씁니다. 자유 형식 텍스트인 `t4-refund-note`만 판정자로 갑니다. '이 문단을 고객에게 보내도 되는가'는 문자열 일치로 답할 수 없기 때문입니다. 판정자의 모양은 레슨 4를 따릅니다. 루브릭은 세 항목으로 고정, 출력 형식은 JSON으로 고정, 근거를 먼저 쓰고 점수를 나중에 냅니다.

```javascript
const JUDGE_PROMPT = `당신은 채점자입니다. 아래 루브릭으로 이 고객 응대 답변을 채점하되, 근거를 먼저 쓰고 점수를 나중에 내십시오.
루브릭 (각 항목 0 또는 1, 평균을 총점으로 함):
- 금액 정확: 환불 금액이 명시되어 있고 주문 금액과 일치한다
- 입금 시점: 환불 입금 시점이 명시되어 있다
- 톤 적절: 고객에게 그대로 보낼 수 있는 표현이다
JSON만 출력할 것: {"reasoning": "...", "score": 0.0-1.0, "grade": "pass" | "fail"}
score >= 0.8이면 pass로 친다.`;
```

각 항목에는 출처가 있습니다. 판정자에게 근거를 먼저 쓰게 하고 점수를 낸 뒤 그 추론은 버립니다. 채점 품질이 올라가며 특히 복잡한 판단이 필요한 과제에서 그렇습니다[^S5]. 출력은 경험적이거나 구체적이어야 하고 순수하게 정성적인 평가여서는 안 됩니다[^S5]. 그리고 '단일 LLM 호출, 단일 프롬프트, 0.0–1.0 점수와 통과/실패 출력'은 공식이 자사 멀티 에이전트 리서치 시스템에서 여러 판정 방식을 시도한 끝에 가장 일관되고 사람의 판단과도 가장 잘 맞는다고 확인한 조합입니다[^S2].

여기서도 판정자는 스텁입니다. v1의 답변에는 입금 시점이 빠져 있어 세 항목 중 둘만 맞아 0.67, 판정은 fail입니다. v2는 그것을 추가해서 셋 다 맞아 1.00, 판정은 pass입니다. 점수는 루브릭과 자기 일관적입니다. 이분 항목 셋의 평균은 0, 0.33, 0.67, 1.00에만 떨어질 수 있습니다. 0.85라는 점수가 나왔다면 판정자가 루브릭의 계산을 따르지 않았다는 뜻입니다. 판정자 자신도 토큰을 태우고 그 소비는 그 태스크의 토큰에 더해집니다. `t4`가 도구를 한 번만 호출하는데도 토큰이 낮지 않은 이유가 그것입니다.

레슨 4의 규율을 하나 더 옮깁니다. 일한 모델이 자기를 채점해서는 안 됩니다. 공식은 새 모델 인스턴스가 결과를 반박해 보게 하라고 말합니다. 일하는 쪽이 채점하는 쪽이 아닙니다[^S4]. 코드에서는 이렇습니다. 판정자는 자기 client, 자기 시스템 프롬프트, 자기 messages 배열을 쓰고, 과제 프롬프트와 채점 대상 답변만 볼 뿐 에이전트의 도구 호출 트랜스크립트는 보지 않습니다.

## 조각 5: 루프와 리포트

루프는 과정 7의 루프 그대로이고 뼈대는 바뀌지 않았습니다. 실제 API가 요구하는 `model`과 `max_tokens`를 더했고(스텁은 무시합니다) 카운터로 감쌌을 뿐입니다.

```javascript
let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content, metrics);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
  metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
}
```

`messages`는 `runTask` 안의 지역 변수입니다. 함수가 반환되면 사라집니다. 그것이 '태스크가 컨텍스트를 공유하지 않는다'의 구현 전부입니다. 별도의 장치가 필요 없고, 밖으로 끌어올리지만 않으면 됩니다.

지표에 대한 공식의 체크리스트는 이렇습니다. 최상위 정확도 외에 개별 도구 호출과 태스크의 총 실행 시간, 총 도구 호출 횟수, 총 토큰 소비량, 도구 에러도 함께 수집하라는 것입니다[^S3]. 리포트 표의 열은 이 체크리스트를 그대로 따릅니다. 통과율은 '통과했는가'만 알려 주지만 이 열들은 '어떻게 통과했는가'를 알려 줍니다. 통과하면서 도구를 열두 번 호출한 태스크와 두 번 호출한 태스크는 품질 등급이 다릅니다. 이 열들은 스스로 진단서 역할도 합니다. 중복 도구 호출이 많으면 대개 페이지네이션이나 토큰 한도 파라미터를 적정 크기로 조정할 필요가 있다는 뜻이고, 잘못된 파라미터로 인한 도구 에러가 많으면 대개 도구 설명이 더 명확해지거나 더 나은 예시가 필요하다는 뜻입니다[^S3]. 연습에서 이것을 바로 씁니다.

리포트가 사람이 읽을 수 있다는 것 자체에 고유한 가치가 있습니다. 공식의 제안은 이렇습니다. Claude에게 성공했다는 주장 대신 증거를 보여 주게 하십시오. 테스트 출력, 실행한 명령과 그 반환값, 또는 결과 스크린샷입니다. 증거를 검토하는 편이 검증을 직접 다시 돌리는 것보다 빠르고, 당신이 지켜보지 않은 세션에도 통합니다[^S4]. 이 리포트 표가 바로 그 증거입니다. PR 설명에 붙이거나 동료에게 보내면, 다시 돌려 보지 않고도 판단할 수 있습니다. (출력에서 유일한 함정은 한글 같은 전각 문자가 폭 2로 계산된다는 것입니다. 날것의 `padEnd`로는 열이 어긋나므로 코드에는 폭을 인식하는 `pad`가 들어 있습니다.)

```agentmentor-check
{
  "id": "vq-zh-06-shared-session",
  "label": "평가 태스크 전부가 세션 하나를 공유하기 — 되는가",
  "prompt": "동료가 eval-runner.mjs를 보더니 최적화를 제안합니다. 지금은 태스크마다 새 messages 배열을 만들고 독립적인 루프를 돌리는데 낭비라는 것입니다. 다섯 태스크가 긴 세션 하나를 공유하면서 순차적으로 돌면 안 되느냐고 합니다. 근거는 두 가지입니다. 앞서 조회한 주문 데이터를 뒤에서 재사용할 수 있어 토큰이 절약되고, 모델이 '워밍업'되어 뒤쪽 태스크의 답이 더 좋아진다는 것입니다. 이 제안의 근본적인 문제는 무엇입니까?",
  "whyHere": "이 트랙의 구조에서 '최적화'로 가장 먼저 날아갈 만한 것이 태스크 격리입니다. 중복 작업처럼 보이지만 실은 결과를 비교하기 위한 전제 조건입니다.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "문제는 애초에 토큰이 절약되지 않는다는 것이다. 세션을 공유하면 요청마다 앞선 태스크의 messages를 전부 다시 보내게 되어 입력 토큰이 선형으로 늘어난다.",
      "correct": false,
      "feedback": "이 반쪽 문장은 맞습니다. 긴 세션을 공유하면 입력 토큰이 실제로 누적되고 토큰 절약 계산은 맞아떨어지지 않습니다. 하지만 그것은 제시된 근거가 성립하지 않는다는 것이지 방식 자체를 쓸 수 없는 이유가 아닙니다. 설령 토큰이 실제로 절약된다 해도 그렇게 돌려서 나온 점수는 쓸 수 없습니다. 선택지 c를 보십시오."
    },
    {
      "id": "b",
      "text": "문제는 지표를 태스크별로 나눌 수 없다는 것이다. 세션을 공유하면 도구 호출 횟수, 소요 시간, 토큰이 뒤섞여 리포트 표를 채울 수 없다.",
      "correct": false,
      "feedback": "지표를 나누기가 더 어려워지는 것은 사실이지만 그것은 회계 문제입니다. 태스크 경계마다 표시를 남기고 카운터를 초기화하면 나눠서 집계하는 것은 여전히 가능합니다. 엔지니어링으로 풀리는 것은 근본 원인이 아닙니다. 근본 원인은 c에 있습니다."
    },
    {
      "id": "c",
      "text": "문제는 태스크끼리 서로를 오염시킨다는 것이다. 평가 태스크는 독립적인 루프를 돌아야 하는데, 세션을 공유하면 앞 태스크가 남긴 컨텍스트가 다음 태스크로 넘어간다. 모델이 지난 태스크에서 이미 조회한 주문 데이터를 그대로 써서 답할 수 있어 이 태스크 자체의 능력을 재지 못하게 되고, 태스크 순서를 바꾸면 결과가 달라져 두 번의 실행을 더 이상 비교할 수 없다.",
      "correct": true,
      "feedback": "정답입니다. 공식 가이던스는 '평가 태스크 하나에 루프 하나'입니다. 격리는 낭비가 아니라 전제 조건입니다. 오염에는 두 층이 있습니다. 하나는 테스트 대상이 바뀌는 것입니다. 앞 태스크가 조회해 온 데이터가 컨텍스트에 그대로 앉아 있어서, 다음 태스크가 관련된 내용을 건드리면 도구를 호출하지 않고 앞 컨텍스트에서 바로 답하거나, 무관한 옛 컨텍스트에 이끌려 틀린 답을 낼 수 있습니다. 그러면 '도구를 쓸 줄 아는가'가 아니라 '앞 컨텍스트를 뒤질 줄 아는가'를 테스트하는 셈이 됩니다. 다른 한 층은 태스크가 순서에 의존하게 된다는 것입니다. 순서를 바꾸거나 중간의 태스크를 지우면 남은 태스크의 점수가 전부 흔들리고, 트랙은 유일한 존재 이유인 '두 번의 실행을 비교 가능하게 만드는 것'을 잃습니다."
    }
  ]
}
```

## eval-runner.mjs 전문

복사해서 `eval-runner.mjs`로 저장하고 `node eval-runner.mjs`를 실행하면 바로 돌아갑니다. 의존성 없음, `package.json` 없음, Node 18 이상입니다(최상위 `await`를 쓰므로 확장자는 `.mjs`여야 합니다).

```javascript
// eval-runner.mjs — 태스크마다 하네스 루프를 하나씩 돌리는 평가 트랙
//
// 사용법:
//   node eval-runner.mjs                  수정된(정규화) 검증기 사용
//   node eval-runner.mjs --strict-verify  정규화 이전의 옛 검증기 사용, 거짓 실패를 관찰

const STRICT = process.argv.includes("--strict-verify");
const MODEL = "claude-opus-5"; // 스텁은 무시한다. 실제 client로 바꿀 때 model과 max_tokens는 필수 파라미터다

// ============ 1. 테스트 대상: 도구와 데이터 ============

const ORDERS = {
  "SO-1001": { customer: "계명테크", status: "complete", month: "2026-08", amount: 780.0 },
  "SO-1002": { customer: "계명테크", status: "complete", month: "2026-08", amount: 500.0 },
  "SO-1003": { customer: "계명테크", status: "pending", month: "2026-08", amount: 320.0 },
  "SO-1004": { customer: "원산물류", status: "pending", month: "2026-08", amount: 96.5 },
};

const TOOLS = [
  {
    name: "search_orders",
    description: "고객명 또는 주문 상태로 주문을 검색하고 주문 ID 목록을 반환한다. customer와 status 중 최소 하나는 반드시 제공해야 한다.",
    input_schema: {
      type: "object",
      properties: { customer: { type: "string" }, status: { type: "string" } },
    },
  },
  {
    name: "get_order",
    description: "주문 ID로 단일 주문의 고객, 상태, 금액을 조회한다.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
    },
  },
];

const TOOL_IMPL = {
  search_orders({ customer, status }) {
    if (!customer && !status) {
      throw new Error("잘못된 파라미터: customer 또는 status 중 최소 하나를 제공해야 합니다");
    }
    const ids = Object.keys(ORDERS).filter(
      (id) =>
        (!customer || ORDERS[id].customer === customer) &&
        (!status || ORDERS[id].status === status)
    );
    return { order_ids: ids };
  },
  get_order({ order_id }) {
    const o = ORDERS[order_id];
    if (!o) throw new Error(`주문 ${order_id}이(가) 존재하지 않습니다`);
    return { order_id, ...o };
  },
};

// ============ 2. 스텁 client: 고정된 응답 큐 ============

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (s) => ({ type: "text", text: s });
const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });
const useTools = (blocks, [i, o]) => ({
  stop_reason: "tool_use",
  content: blocks,
  usage: { input_tokens: i, output_tokens: o },
  latency_ms: 40,
});
const finish = (s, [i, o]) => ({
  stop_reason: "end_turn",
  content: [text(s)],
  usage: { input_tokens: i, output_tokens: o },
  latency_ms: 40,
});

function stubClient(script, label) {
  if (!script) throw new Error(`[stub] ${label}에 대한 응답 큐가 없습니다`);
  let cursor = 0;
  return {
    messages: {
      async create() {
        if (cursor >= script.length) {
          throw new Error(`[stub] ${label} 응답 큐가 소진되었습니다 (요청 ${cursor}건 발행)`);
        }
        const res = script[cursor++];
        await sleep(res.latency_ms);
        return res;
      },
    },
  };
}

// ============ 3. 두 개의 시스템 프롬프트와 각각의 응답 큐 ============

const SYSTEM_PROMPTS = {
  v1: "당신은 주문 어시스턴트입니다. 도구로 주문을 조회한 뒤 사용자에게 답하십시오.",
  v2:
    "당신은 주문 어시스턴트입니다. 도구로 주문을 조회한 뒤 사용자에게 답하십시오.\n" +
    "두 가지 하드 규칙:\n" +
    "1. 사용자가 주문번호를 주지 않았을 때는 먼저 주문번호를 물어보고, 추측해서 조회하지 마십시오.\n" +
    "2. 고객에게 보내는 환불 안내에는 환불 금액과 입금 시점을 반드시 밝히십시오.",
};

const SCRIPT_V1 = {
  "t1-total": [
    useTools([toolUse("tu_1", "search_orders", { customer: "계명테크", status: "complete" })], [420, 60]),
    useTools(
      [
        toolUse("tu_2", "get_order", { order_id: "SO-1001" }),
        toolUse("tu_3", "get_order", { order_id: "SO-1002" }),
      ],
      [520, 88]
    ),
    finish("고객 계명테크의 2026년 8월 완료 주문은 2건(SO-1001, SO-1002)이고 합계 ₩1,280.00입니다.", [660, 52]),
  ],
  "t2-pending": [
    useTools([toolUse("tu_1", "search_orders", { status: "pending" })], [415, 46]),
    finish("현재 미출고 주문은 SO-1003과 SO-1004입니다.", [500, 34]),
  ],
  "t3-no-orderid": [
    useTools([toolUse("tu_1", "search_orders", {})], [408, 38]),
    useTools([toolUse("tu_2", "get_order", { order_id: "SO-1001" })], [470, 44]),
    finish("주문 SO-1001의 상태는 완료입니다.", [560, 30]),
  ],
  "t4-refund-note": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-1003" })], [430, 42]),
    finish(
      "안녕하세요, 주문 SO-1003(금액 ₩320.00)의 취소 요청을 접수했습니다. 환불은 원 결제수단으로 돌려드립니다. 불편을 드려 죄송합니다.",
      [540, 76]
    ),
  ],
  "t5-missing-order": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-9999" })], [412, 40]),
    finish("시스템에서 주문 SO-9999를 찾을 수 없습니다. 주문번호가 맞는지 확인해 주세요.", [478, 36]),
  ],
};

// v2는 두 태스크의 응답만 갈아 끼운다 — 버전 차이가 여기에 고정되어 있다
const SCRIPT_V2 = {
  ...SCRIPT_V1,
  "t3-no-orderid": [
    finish("어느 주문을 말씀하시는 걸까요? 주문번호(SO-1001 형식)를 알려 주세요.", [455, 32]),
  ],
  "t4-refund-note": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-1003" })], [462, 42]),
    finish(
      "안녕하세요, 주문 SO-1003(금액 ₩320.00)의 취소 요청을 접수했습니다. 환불은 원 결제수단으로 돌려드리며, 보통 영업일 기준 3~5일 안에 입금됩니다. 불편을 드려 죄송합니다.",
      [572, 94]
    ),
  ],
};

const SCRIPTS = { v1: SCRIPT_V1, v2: SCRIPT_V2 };

// ============ 4. 판정자: 이쪽도 스텁, 0.0-1.0과 통과/실패를 출력 ============

const JUDGE_PROMPT = `당신은 채점자입니다. 아래 루브릭으로 이 고객 응대 답변을 채점하되, 근거를 먼저 쓰고 점수를 나중에 내십시오.
루브릭 (각 항목 0 또는 1, 평균을 총점으로 함):
- 금액 정확: 환불 금액이 명시되어 있고 주문 금액과 일치한다
- 입금 시점: 환불 입금 시점이 명시되어 있다
- 톤 적절: 고객에게 그대로 보낼 수 있는 표현이다
JSON만 출력할 것: {"reasoning": "...", "score": 0.0-1.0, "grade": "pass" | "fail"}
score >= 0.8이면 pass로 친다.`;

const JUDGE_SCRIPTS = {
  v1: {
    "t4-refund-note": [
      finish(
        JSON.stringify({
          reasoning: "금액은 주문과 일치하고 톤도 적절하다. 다만 환불 입금 시점이 빠져 있어 고객이 예상 시점을 알 수 없다. 3개 항목 중 1개 누락.",
          score: 0.67,
          grade: "fail",
        }),
        [286, 58]
      ),
    ],
  },
  v2: {
    "t4-refund-note": [
      finish(
        JSON.stringify({
          reasoning: "금액, 입금 시점, 톤 세 항목을 모두 충족한다. 고객에게 그대로 보낼 수 있다.",
          score: 1.0,
          grade: "pass",
        }),
        [302, 46]
      ),
    ],
  },
};

async function judgeAnswer(task, answer, version, metrics) {
  const client = stubClient(JUDGE_SCRIPTS[version][task.id], `judge/${version}/${task.id}`);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: JUDGE_PROMPT,
    messages: [{ role: "user", content: `【과제】${task.prompt}\n【채점 대상 답변】${answer}` }],
  });
  metrics.tokens += res.usage.input_tokens + res.usage.output_tokens;
  const verdict = JSON.parse(res.content.map((b) => b.text).join(""));
  return { pass: verdict.grade === "pass", score: verdict.score, note: verdict.reasoning };
}

// ============ 5. 평가 세트: 일반 4개 + 엣지 케이스 1개 ============

function amountsIn(s) {
  return [...s.replace(/[,，\s¥￥]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
function orderIdsIn(s) {
  return [...new Set(s.match(/SO-\d+/g) ?? [])].sort();
}

const TASKS = [
  {
    id: "t1-total",
    grader: "결정론적",
    prompt: "고객 계명테크의 2026년 8월 완료 주문, 합계 금액이 얼마인가요?",
    verify: (r) => ({
      pass: amountsIn(r.answer).some((n) => Math.abs(n - 1280) < 0.005),
      note: "답변에 1280이 들어 있어야 한다 (통화 기호, 천 단위 구분자, 단위 허용)",
    }),
    strictVerify: (r) => ({
      pass: r.answer.includes("1280.00"),
      note: "답변에 문자열 1280.00이 그대로 들어 있어야 한다",
    }),
  },
  {
    id: "t2-pending",
    grader: "결정론적",
    prompt: "아직 출고 안 된 주문이 어떤 것들인가요? 주문 ID를 알려 주세요.",
    verify: (r) => ({
      pass: JSON.stringify(orderIdsIn(r.answer)) === JSON.stringify(["SO-1003", "SO-1004"]),
      note: "답변의 주문 ID 집합이 SO-1003 + SO-1004와 정확히 일치해야 한다",
    }),
  },
  {
    id: "t3-no-orderid",
    grader: "결정론적",
    prompt: "그 주문 상태 좀 확인해 주세요.",
    verify: (r) => ({
      pass: r.toolCalls === 0 && r.answer.includes("?") && r.answer.includes("주문번호"),
      note: "파라미터가 불완전하면 도구를 한 번도 호출하지 말고 주문번호를 되물어야 한다",
    }),
  },
  {
    id: "t4-refund-note",
    grader: "LLM 판정자",
    judge: true,
    prompt: "고객이 주문 SO-1003의 취소와 환불을 신청했습니다. 답변을 써 주세요.",
  },
  {
    id: "t5-missing-order",
    grader: "결정론적",
    prompt: "주문 SO-9999의 상태를 확인해 주세요.",
    verify: (r) => ({
      pass: r.toolErrors === 1 && /찾을 수 없|존재하지 않/.test(r.answer) && !/[¥￥₩]|원/.test(r.answer),
      note: "도구 에러 후에는 찾을 수 없다고 사실대로 말해야 하며 금액을 지어내면 안 된다",
    }),
  },
];

// ============ 6. 태스크 하나에 하네스 루프 하나 ============

async function runToolUses(content, metrics) {
  const results = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    metrics.toolCalls += 1;
    try {
      const out = TOOL_IMPL[block.name](block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
    } catch (err) {
      metrics.toolErrors += 1;
      results.push({ type: "tool_result", tool_use_id: block.id, content: err.message, is_error: true });
    }
  }
  return results;
}

async function runTask(task, version) {
  const metrics = { toolCalls: 0, toolErrors: 0, tokens: 0 };
  const client = stubClient(SCRIPTS[version][task.id], `${version}/${task.id}`);
  const system = SYSTEM_PROMPTS[version];
  const messages = [{ role: "user", content: task.prompt }];
  const startedAt = Date.now();

  let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
  metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, metrics);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
    metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
  }

  const answer = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let verdict;
  if (task.judge) {
    verdict = await judgeAnswer(task, answer, version, metrics);
  } else {
    const fn = STRICT && task.strictVerify ? task.strictVerify : task.verify;
    const out = fn({ answer, ...metrics });
    verdict = { pass: out.pass, score: out.pass ? 1 : 0, note: out.note };
  }

  return {
    id: task.id,
    grader: task.grader,
    pass: verdict.pass,
    score: verdict.score,
    note: verdict.note,
    answer,
    durationMs: Date.now() - startedAt,
    ...metrics,
  };
}

async function runSuite(version) {
  const rows = [];
  for (const task of TASKS) rows.push(await runTask(task, version));
  return {
    version,
    verifier: STRICT ? "strict (옛 버전, 정규화 없음)" : "normalized (수정 후)",
    rows,
    passed: rows.filter((r) => r.pass).length,
    total: rows.length,
    toolCalls: rows.reduce((n, r) => n + r.toolCalls, 0),
    toolErrors: rows.reduce((n, r) => n + r.toolErrors, 0),
    tokens: rows.reduce((n, r) => n + r.tokens, 0),
    durationMs: rows.reduce((n, r) => n + r.durationMs, 0),
  };
}

// ============ 7. 리포트 ============

const CJK = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, ch) => n + (CJK.test(ch) ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - width(s)));
const padL = (s, n) => " ".repeat(Math.max(0, n - width(s))) + String(s);

function printReport(report) {
  console.log(`\n=== 리포트 · 프롬프트 ${report.version} · 검증기 ${report.verifier} ===`);
  console.log(
    pad("태스크", 18) + pad("채점 방식", 14) + pad("결과", 8) + padL("점수", 6) +
    padL("호출", 6) + padL("에러", 6) + padL("토큰", 10) + padL("소요 시간", 12)
  );
  console.log("-".repeat(80));
  for (const r of report.rows) {
    console.log(
      pad(r.id, 18) + pad(r.grader, 14) + pad(r.pass ? "pass" : "FAIL", 8) +
      padL(r.score.toFixed(2), 6) + padL(r.toolCalls, 6) + padL(r.toolErrors, 6) +
      padL(r.tokens.toLocaleString("en-US"), 10) + padL(`${r.durationMs}ms`, 12)
    );
  }
  console.log("-".repeat(80));
  const rate = ((report.passed / report.total) * 100).toFixed(0);
  console.log(
    `통과율 ${report.passed}/${report.total} (${rate}%) · 도구 호출 ${report.toolCalls} · ` +
    `도구 에러 ${report.toolErrors} · 토큰 ${report.tokens.toLocaleString("en-US")} · 합계 ${report.durationMs}ms`
  );
  const failed = report.rows.filter((r) => !r.pass);
  if (failed.length) {
    console.log("\n미통과 케이스:");
    for (const r of failed) {
      console.log(`  [${r.id}] 판정 기준: ${r.note}`);
      console.log(`  에이전트 답변: ${r.answer}`);
    }
  }
}

function printDiff(a, b) {
  console.log(`\n=== 점수 변화 ${a.version} -> ${b.version} ===`);
  console.log(pad("태스크", 18) + padL(a.version, 7) + padL(b.version, 7) + "  변화");
  console.log("-".repeat(50));
  for (let i = 0; i < a.rows.length; i++) {
    const x = a.rows[i], y = b.rows[i];
    let mark = "변화 없음";
    if (!x.pass && y.pass) mark = "fail => pass";
    else if (x.pass && !y.pass) mark = "pass => FAIL";
    else if (y.score !== x.score) mark = `점수 ${(y.score - x.score).toFixed(2)}`;
    console.log(pad(x.id, 18) + padL(x.score.toFixed(2), 7) + padL(y.score.toFixed(2), 7) + "  " + mark);
  }
  console.log("-".repeat(50));
  console.log(`통과율 ${a.passed}/${a.total} -> ${b.passed}/${b.total}`);
}

// ============ 8. 진입점 ============

const reportV1 = await runSuite("v1");
printReport(reportV1);
const reportV2 = await runSuite("v2");
printReport(reportV2);
printDiff(reportV1, reportV2);
```

## 레슨 3의 함정 되짚기: 지나치게 엄격한 검증기

레슨 3은 함정을 하나 다뤘습니다. 공식의 표현 그대로입니다. 형식, 문장 부호, 타당한 다른 표현 같은 사소한 차이 때문에 올바른 응답을 거절하는 지나치게 엄격한 검증기를 피하십시오[^S3]. 상식처럼 들리지만 코드에서는 거의 피할 수 없습니다. 지나치게 엄격한 검증기가 쓰기 가장 쉽기 때문입니다.

이 트랙에도 하나 심어 두었습니다. `t1-total`에는 검증기가 두 버전 있고, 옛 것은 `pass: r.answer.includes("1280.00")`입니다. 빈틈없어 보입니다. 정답이 1280.00이니 답변에 그 문자열이 있는지 확인하면 된다는 것입니다. `node eval-runner.mjs --strict-verify`를 돌려 보십시오(아래에는 v1 리포트만 붙입니다. v2 리포트와 변화표는 평소대로 출력됩니다).

```text

=== 리포트 · 프롬프트 v1 · 검증기 strict (옛 버전, 정규화 없음) ===
태스크            채점 방식     결과      점수  호출  에러      토큰   소요 시간
--------------------------------------------------------------------------------
t1-total          결정론적      FAIL      0.00     3     0     1,800       123ms
t2-pending        결정론적      pass      1.00     1     0       995        83ms
t3-no-orderid     결정론적      FAIL      0.00     2     1     1,550       123ms
t4-refund-note    LLM 판정자    FAIL      0.67     1     0     1,432       123ms
t5-missing-order  결정론적      pass      1.00     1     1       966        83ms
--------------------------------------------------------------------------------
통과율 2/5 (40%) · 도구 호출 8 · 도구 에러 2 · 토큰 6,743 · 합계 535ms

미통과 케이스:
  [t1-total] 판정 기준: 답변에 문자열 1280.00이 그대로 들어 있어야 한다
  에이전트 답변: 고객 계명테크의 2026년 8월 완료 주문은 2건(SO-1001, SO-1002)이고 합계 ₩1,280.00입니다.
  [t3-no-orderid] 판정 기준: 파라미터가 불완전하면 도구를 한 번도 호출하지 말고 주문번호를 되물어야 한다
  에이전트 답변: 주문 SO-1001의 상태는 완료입니다.
  [t4-refund-note] 판정 기준: 금액은 주문과 일치하고 톤도 적절하다. 다만 환불 입금 시점이 빠져 있어 고객이 예상 시점을 알 수 없다. 3개 항목 중 1개 누락.
  에이전트 답변: 안녕하세요, 주문 SO-1003(금액 ₩320.00)의 취소 요청을 접수했습니다. 환불은 원 결제수단으로 돌려드립니다. 불편을 드려 죄송합니다.
```

이것도 실제 실행 결과입니다. `t1-total`의 상세를 보십시오. 에이전트는 '합계 ₩1,280.00'이라고 답했습니다. 금액도 맞고 주문도 맞고 표현도 정상입니다. 유일한 죄는 1과 280 사이에 천 단위 구분자 쉼표를 넣었다는 것이고, 그래서 `includes("1280.00")`이 false를 반환해 완전히 올바른 답이 실패로 채점됩니다.

**이 지점에서는 에이전트가 아니라 검증기를 고칩니다.** 리포트는 't1 실패'만 알려 줄 뿐 누구 잘못인지는 알려 주지 않습니다. 가려내는 방법은 상세에 적힌 에이전트의 실제 문장을 읽는 것이고, 리포트가 원본 답변을 출력하는 이유가 바로 그것입니다. 해법은 정규화입니다. 정확 일치에 대한 공식의 설명에 이미 이 단계가 들어 있습니다. 정확 일치 평가는 보통 공백과 대소문자를 정규화한 뒤에 모델 출력이 미리 정해진 정답과 일치하는지를 측정합니다[^S5]. 금액 시나리오는 더 많이 씻어 내야 합니다. 통화 기호, 천 단위 구분자, 단위가 있으므로, 수정된 검증기는 잡음을 먼저 씻어 내고 숫자를 뽑아 수치로 비교합니다.

```javascript
function amountsIn(s) {
  return [...s.replace(/[,，\s¥￥]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
verify: (r) => ({
  pass: amountsIn(r.answer).some((n) => Math.abs(n - 1280) < 0.005),
  note: "답변에 1280이 들어 있어야 한다 (통화 기호, 천 단위 구분자, 단위 허용)",
}),
```

`--strict-verify`를 빼고 다시 돌리면 `t1-total`이 0.00에서 1.00으로 뒤집히고 v1 기준선은 2/5에서 3/5로 돌아옵니다. 그사이 에이전트는 한 글자도 바뀌지 않았고 스텁의 응답 큐도 한 글자도 바뀌지 않았습니다. **점수는 바뀌었는데 테스트 대상은 바뀌지 않았다 — 그것이 '검증기 문제'를 가려내는 리트머스 시험지입니다.**

범위에 관해 한마디 덧붙입니다. 정규화는 느슨할수록 좋은 것이 아닙니다. '1280이 들어 있어 보이면 통과'까지 느슨하게 하면, 에이전트가 '주문 1280건, 금액은 알 수 없음'이라고 답해도 통과합니다. 검증기는 '무관한 차이는 통과시키고 실질적인 오류는 막는' 자리에 있어야 하고, 그 자리를 찾는 유일한 방법은 실제 답변으로 시도해 보는 것입니다.

## 프롬프트 한 군데를 바꾸고 점수가 움직이는 것 보기

트랙을 교정했으니 이제 실전입니다. 한 군데만 바꿨습니다. 시스템 프롬프트에 v1 뒤로 규칙 두 개를 더한 것입니다.

```javascript
const SYSTEM_PROMPTS = {
  v1: "당신은 주문 어시스턴트입니다. 도구로 주문을 조회한 뒤 사용자에게 답하십시오.",
  v2:
    "당신은 주문 어시스턴트입니다. 도구로 주문을 조회한 뒤 사용자에게 답하십시오.\n" +
    "두 가지 하드 규칙:\n" +
    "1. 사용자가 주문번호를 주지 않았을 때는 먼저 주문번호를 물어보고, 추측해서 조회하지 마십시오.\n" +
    "2. 고객에게 보내는 환불 안내에는 환불 금액과 입금 시점을 반드시 밝히십시오.",
};
```

이 두 규칙은 지어낸 것이 아닙니다. v1 리포트의 '미통과 케이스'에서 읽어 낸 것입니다. `t3`는 파라미터가 불완전한데 주문번호를 추측해서 실패했고, `t4`는 입금 시점이 빠져서 감점됐습니다. **리포트가 말하는 것을 고친다** — 그것이 트랙이 있고 없고의 가장 구체적인 차이입니다. 트랙이 없으면 프롬프트를 바꾼 뒤 출력을 훑어보며 '나아진 것 같다'고 느끼는 데 그치지만, 트랙이 있으면 '무엇이 좋아졌고, 무엇이 그대로고, 퇴행한 것이 있는가'가 숫자 세 줄이 됩니다.

다시 돌리면 변화표는 첫머리 출력의 마지막 구간과 같습니다. 통과율이 60%에서 100%로 오르고, 두 태스크가 fail에서 pass로 뒤집히고, 나머지 셋은 꿈쩍하지 않습니다. 마지막 반쪽 문장이 앞쪽만큼 중요합니다. 이 변경이 이미 잘 돌아가던 것을 망가뜨리지 않았다는 뜻이기 때문입니다. 트랙이 없으면 프롬프트를 바꾸고 출력을 한 번 들여다보며 '나아 보인다'고 생각하는 것이 전부지만, 트랙이 있으면 '무엇이 좋아졌는가 / 무엇이 그대로인가 / 퇴행이 있는가'가 숫자 세 줄로 남습니다.

공식은 이것을 이렇게 표현합니다. 평가가 있으면 프롬프트 엔지니어링의 영향을 더 높은 확신을 갖고 측정할 수 있고, 도구 설명을 조금만 다듬어도 극적인 개선을 낳을 수 있습니다[^S3]. 여기서 챙길 이득이 하나 더 있습니다. 에이전트 개발 초기에는 낮게 달린 열매가 아직 많아서 변경이 극적인 영향을 주는 경향이 있습니다. 프롬프트를 한 번 손대는 것만으로 성공률이 30%에서 80%로 오를 수 있고, 효과 크기가 이 정도라면 테스트 케이스 몇 개만으로도 변화를 알아볼 수 있습니다[^S2]. 지금 태스크가 다섯 개뿐이라는 것은 결핍이 아니라 출발점입니다.

지표 열을 다시 보십시오. v2의 도구 호출은 8에서 6으로, 도구 에러는 2에서 1로, 토큰은 1,000 가까이 줄었습니다. `t3`가 더 이상 아무렇게나 추측해서 도구를 부르지 않기 때문입니다. **같은 변경이 정확도와 비용을 동시에 개선했다** — 이런 것은 이 열들을 함께 기록해야만 보입니다.

## 범위: 이 트랙이 맡는 것과 맡지 않는 것

**맡는 것**: 에이전트 하나, 태스크 한 묶음, 당신 머신에서 한 번 실행, 사람이 읽을 수 있는 리포트 산출.

**진짜 모델로 바꿔 끼우기** — 트랙 구조는 바뀌지 않습니다. `stubClient(...)`를 `@anthropic-ai/sdk`의 진짜 client로 바꾸면 됩니다. `runTask` 안의 while 루프는 한 줄도 바뀌지 않습니다. 이미 실제 API의 `stop_reason` / `tool_use` / `tool_result` 모양에 맞춰 쓰여 있고, 필수 파라미터인 `model`과 `max_tokens`도 이미 들어 있습니다(스텁은 무시하고 진짜 client는 씁니다). 바꾼 뒤에는 두 가지가 달라집니다. 에이전트는 프롬프트가 동일해도 실행마다 비결정론적이라 점수가 흔들릴 것이므로[^S2] 단일 실행을 과하게 해석하지 마십시오. 그리고 한 바퀴 도는 데 돈과 시간이 듭니다. 태스크 다섯 개는 상관없지만 200개라면 동시성과 비용을 고려해야 합니다.

**맡지 않는 것**: 평가를 CI에 걸기, 커밋마다 돌리기, 과거 버전과 비교하기, 점수가 임계값 아래로 떨어지면 병합 막기. 이것들은 흔한 엔지니어링 관행이고 실제로 잘 동작하지만 이 레슨에서는 다루지 않습니다. 연습 레벨 2가 '리포트 두 개 비교하기'까지는 데려다주고, 나머지 오케스트레이션은 당신 CI의 몫입니다.

레슨 5의 규율을 하나 더 반복합니다. **홀드아웃 세트를 상대로 튜닝하지 마십시오.** 리포트를 따라 프롬프트를 고치면 몇 바퀴 뒤에 점수는 분명히 오르지만, 그 상승이 '이 다섯 태스크에서의 점수'일 수도 있습니다. 공식의 실천은 '학습용' 평가에 과적합되지 않았음을 확인하기 위해 홀드아웃 테스트 세트에 의존하는 것입니다[^S3]. 그러니 실제 구성에서는 태스크를 두 무더기로 나누십시오. 한쪽은 매일 돌려 방향을 잡고, 다른 쪽은 잠가 두었다가 '이번 버전은 될 것 같다' 싶을 때만 엽니다. 첫 무더기의 점수는 항법이고, 둘째 무더기의 점수는 판결입니다.

마지막으로 오래된 주의 하나. 자동 평가는 놓치는 것이 있습니다. 사람 테스터는 언제나 평가가 놓치는 엣지 케이스에 부딪힙니다. 흔치 않은 질의에서의 환각, 시스템 차원의 장애, 미묘한 출처 선택 편향입니다[^S2]. 트랙이 매끄럽게 돌아간다고 해서 직접 써 보는 일을 그만두어도 된다는 뜻은 아닙니다.

## 💻 연습

<!-- exercises -->

### 레벨 1: 리포트를 읽고, 서둘러 코드를 고치지 않기

코드 없음. 레슨 첫머리의 두 리포트(v1 기준선과 v2 변경 후)로 돌아갑니다. 요약 줄은 이렇습니다.

```text
v1: 통과율 3/5 (60%)  · 도구 호출 8 · 도구 에러 2 · 토큰 6,743
v2: 통과율 5/5 (100%) · 도구 호출 6 · 도구 에러 1 · 토큰 5,766
```

두 표 전체를 놓고 세 질문에 각각 세 문장에서 다섯 문장으로 답하십시오.

1. `t1-total`은 두 리포트 모두에서 통과하지만 도구 호출 횟수가 3으로 가장 많습니다. 이것은 어떤 문제를 가리킵니까? 무엇을 바꿔야 합니까?
2. v1은 도구 에러가 2건, v2는 1건입니다. 이 두 에러는 같은 부류의 문제입니까? 각각 무슨 뜻이고, 각각 고쳐야 합니까?
3. 이 레슨에는 세 번째 리포트(`--strict-verify` 쪽)가 있고 거기서 `t1-total`은 0.00입니다. 같은 태스크가 한 리포트에서는 0.00, 다른 리포트에서는 1.00입니다. 이 점수 차이가 에이전트가 아니라 검증기의 문제라는 것을 어떻게 가려냅니까?

<!-- rubric -->

- 질문 1은 '`search_orders`가 금액 없이 주문 ID만 반환하므로 주문마다 `get_order`를 한 번씩 더 호출해야 한다'를 인과로 짚어야 하고, 주문 개수가 늘면 호출 횟수도 함께 늘어난다는 점을 언급해야 하며, S3의 독법에 따라 중복 호출을 '페이지네이션 / 반환량 파라미터 조정이 필요하다'는 신호로 식별해야 함. 바꿀 대상은 프롬프트나 에이전트가 아니라 **도구**여야 함(`search_orders`가 요약 필드를 함께 싣게 하기).
- 질문 2는 두 에러의 성격을 구분해야 함. `t3`의 것은 **잘못된 파라미터** 에러(`search_orders({})`)이고 S3의 독법으로는 도구 설명이 불명확하거나 예시가 없다는 뜻이므로 고쳐야 함. `t5`의 것은 주문 자체가 존재하지 않는 경우이고 이 태스크가 **의도적으로 테스트하는 것**이므로 에러가 나타나는 것이 정상임. 답변은 '도구 에러 횟수는 낮을수록 좋은 것이 아니다'를 명시적으로 진술해야 함.
- 질문 3은 실행 가능한 기준을 제시해야 함. 두 리포트의 에이전트 답변 텍스트, 호출 횟수, 토큰이 모두 동일하고 검증기만 바뀌었으므로 변화는 채점 쪽에서 왔다는 것. 그리고 판단 근거가 상세에 적힌 에이전트의 실제 문장을 읽고 답이 실질적으로 옳음을 확인하는 것임을 진술해야 함(1,280.00과 1280.00은 천 단위 구분자만 다름).
- 세 질문 모두 코드는 필요 없음. 코드는 썼는데 위 판단들에 답하지 않았다면 통과로 치지 않음.

<!-- hint -->

질문 1은 '3은 많다'만 쳐다보지 말고 `search_orders`가 무엇을 반환하는지 보십시오. `{ order_ids: [...] }`, 즉 주문 ID만 반환합니다. 에이전트가 금액을 원한다면 `get_order`를 하나씩 부르는 것 말고 다른 길이 있습니까?

<!-- hint -->

질문 3의 핵심은 변수 통제입니다. 두 리포트에서 `t1-total` 행의 각 열을 비교하십시오. 호출 횟수, 에러 횟수, 토큰이 바뀌었습니까? 그다음 두 상세에 적힌 에이전트의 원본 답변 텍스트를 비교하십시오. 바뀐 열이 있는 쪽에 문제가 있습니다.

<!-- answer -->

**질문 1.** `t1-total`이 도구 호출 3회를 필요로 하는 것은 `search_orders`의 반환값 설계 때문입니다. `{ order_ids: ["SO-1001", "SO-1002"] }`만 반환하고 금액은 전혀 없으므로, 에이전트가 합계를 계산하려면 주문 ID마다 `get_order`를 다시 불러야 합니다. 호출 횟수는 1 + N이고 N은 걸린 주문 수입니다. 주문이 네 건일 때는 괜찮아 보이지만 고객이 주문을 쉰 건 갖고 있으면 이 태스크 하나가 쉰한 번의 호출에 이르고, 토큰과 소요 시간이 선형으로 늘어나며 컨텍스트 한도에 쉽게 부딪힙니다.

이 신호에 대한 공식의 독법은 이렇습니다. 중복 도구 호출이 많으면 대개 페이지네이션이나 토큰 한도 파라미터를 적정 크기로 조정할 필요가 있다는 뜻입니다[^S3]. 구체적인 수정은 `search_orders`가 요약 필드(주문 ID + 상태 + 금액)를 바로 반환하게 하고, 단일 반환량을 통제할 페이지네이션 파라미터를 더하는 것입니다. **프롬프트도 에이전트도 아니고 도구를 바꿉니다.** 이것은 통과율 말고 다른 지표를 반드시 기록해야 하는 이유이기도 합니다. `t1`은 두 리포트 모두에서 통과하므로 통과율만 봤다면 이 문제를 영영 발견하지 못했을 것입니다.

**질문 2.** 같은 부류가 아니라 두 에러의 성격이 정반대입니다.

`t3-no-orderid`의 에러는 에이전트가 주문번호 없이 `search_orders({})`를 호출해 두 필터 파라미터가 모두 비었고 도구가 거절한 것입니다. 이것이 **잘못된 파라미터** 에러입니다. 공식의 독법은 이렇습니다. 이런 에러가 몰려 나오면 대개 도구 설명이 더 명확해지거나 더 나은 예시가 필요하다는 뜻입니다[^S3]. 이쪽은 고쳐야 하고, v2가 '먼저 주문번호를 물어보라'를 넣자 사라졌습니다. 프롬프트를 바꾸지 않는다면 다른 방향은 도구 설명을 단단하게 하거나 도구 정의에 `strict: true`를 더해 파라미터 제약을 API 층에서 강제하는 것입니다[^S6].

`t5-missing-order`의 에러는 `SO-9999`를 조회했더니 도구가 '주문이 존재하지 않는다'고 보고한 것입니다. 결함이 아니라 이 태스크가 테스트하는 바로 그것입니다. 도구 에러 후에 에이전트가 찾을 수 없다고 사실대로 말하는지 아니면 금액을 지어내는지 말입니다. 이 태스크의 검증기는 `r.toolErrors === 1`이라고 쓰는데, 이는 **이 에러가 반드시 일어나야 한다**는 뜻입니다. 에러 횟수가 0이 되면 오히려 테스트가 표적을 벗어난 것입니다. 그러므로 도구 에러 열은 낮을수록 좋은 것이 아니라 에러가 어디에서 왔는지에 달려 있고, 두 부류를 섞어서 '에러가 2에서 1로 줄었으니 개선됐다'고 읽는 것은 진짜 수정과 기대된 동작을 한 숫자에 뒤섞는 일입니다.

**질문 3.** 기준은 변수 통제입니다. 두 리포트의 `t1-total` 행을 열 단위로 비교하면 호출 3 대 3, 에러 0 대 0, 토큰 1,800 대 1,800으로 에이전트 쪽은 전부 그대로입니다. 그다음 상세를 보면 `--strict-verify` 리포트가 출력한 에이전트의 실제 문장은 '…합계 ₩1,280.00입니다.'입니다. 금액도 맞고 주문도 맞고 표현도 정상입니다. 두 실행 사이에 바뀐 것은 그 명령줄 플래그뿐이고 그것은 채점 쪽이므로, 점수 차이는 전적으로 검증기에서 온 것입니다. 옛 버전은 `includes("1280.00")` 문자열 비교를 하다가 천 단위 구분자 쉼표에 걸린 것입니다. 이것이 바로 공식이 경계한 오류 유형입니다. 형식이나 문장 부호의 사소한 차이 때문에 검증기가 올바른 답을 거절하게 하지 마십시오[^S3]. 바꿀 대상은 `verify` 함수이고, 검증기에 맞추려고 에이전트를 바꾸는 것은 트랙의 결함을 테스트 대상에 뒤집어씌우는 일입니다.

이 판단이 가능한 것은 리포트가 에이전트의 원본 답변을 상세에 출력하기 때문입니다. 리포트가 통과/실패만 출력한다면 실제로 무엇이라 답했는지 보려고 손수 한 번 더 돌려야 했을 것입니다. 리포트가 증거로 기능하려면 원자료를 함께 실어야 합니다[^S4].

---

### 레벨 2: 트랙에 '두 번의 실행 비교' 붙이기

코드를 씁니다. 반드시 돌아가야 합니다. `eval-runner.mjs`에 두 가지를 더하십시오.

1. **리포트 영속화**: `writeJsonAtomic(file, obj)`를 추가하고, 과정 9의 원자적 쓰기(`.tmp`에 먼저 쓰고 `rename`)로 한 번의 실행 리포트를 JSON으로 저장하십시오. 명령줄은 `--version v1 --out reports/v1.json`을 지원합니다.
2. **`compare.mjs` 작성**: 리포트 JSON 두 개를 읽어 태스크별 점수 차이(기준 점수, 신규 점수, 델타, 상태)를 출력하고, 마지막에 통과율 변화를 출력하십시오. pass에서 fail로 뒤집힌 태스크가 하나라도 있으면 요약을 stderr로 출력하고 0이 아닌 코드로 종료합니다.

다음 네 명령을 실행하고 출력을 붙이십시오.

```text
node eval-runner.mjs --version v1 --out reports/v1.json
node eval-runner.mjs --version v2 --out reports/v2.json
node compare.mjs reports/v1.json reports/v2.json   # 0으로 종료해야 함
node compare.mjs reports/v2.json reports/v1.json   # 1로 종료해야 함
```

(파라미터 순서를 바꾸는 것은 '새 버전이 기준선보다 나쁘다'를 흉내 내어, 0이 아닌 종료 경로가 실제로 동작하는지 확인하기 위한 것입니다.)

<!-- rubric -->

- `writeJsonAtomic`은 '임시 파일에 쓰기 + `fs.renameSync`' 두 단계여야 하고, `fs.writeFileSync(file, ...)`로 바로 끝내면 안 됨. 디렉터리를 자동 생성해야 함(`fs.mkdirSync(..., { recursive: true })`).
- 영속화된 JSON은 독립적인 `compare.mjs`가 소비할 수 있어야 함. 최소한 `version`, `passed`, `total`과 `rows` 배열을 포함하고 각 행에 `id`, `pass`, `score`가 있어야 함. **`durationMs`는 쓰지 말 것.** 소요 시간은 실행마다 흔들려서, 기록하면 두 JSON이 결코 같아지지 않음. 기록하는 것이 틀린 것은 아니지만 그렇다면 비교에서 이 열을 무시해야 함.
- `compare.mjs`는 배열 인덱스가 아니라 태스크 id로 두 리포트를 맞춰야 함. 태스크를 추가하거나 삭제하면 인덱스가 어긋나기 때문.
- 진입점을 갈아 끼운 뒤에는 고아가 된 `printDiff`를 지워야 함. 수정한 파일에 호출되지 않는 함수를 남기면 안 됨.
- 종료 코드는 두 단계. pass가 fail로 바뀐 것이 있으면 `process.exit(1)`이고 퇴행 요약은 stderr로 보냄. 퇴행이 없으면 정상 종료(0). 파라미터가 없을 때는 다른 0이 아닌 코드(예: 2)로 '사용법 오류'와 '퇴행 있음'을 구분할 수 있음.
- 네 명령의 실제 출력을 반드시 붙여야 하고, 세 번째는 0으로, 네 번째는 1로 종료해야 함.

<!-- hint -->

원자적 쓰기는 세 줄이면 되니 복잡하게 생각하지 마십시오. `fs.writeFileSync(file + ".tmp", JSON.stringify(obj, null, 2))` 다음에 `fs.renameSync(file + ".tmp", file)`입니다. 같은 파일 시스템 안에서 `rename`은 원자적이므로, `compare.mjs`는 온전한 옛 파일이나 온전한 새 파일 중 하나만 읽고 절반만 쓰인 파일은 결코 읽지 않습니다.

<!-- hint -->

퇴행을 판정할 때 점수 델타를 쓰지 마십시오. 점수가 1.00에서 0.67로 떨어진 것은 하락이지만 여전히 통과선 위일 수 있습니다(판정자 태스크의 통과선은 0.8입니다). 1.00에서 0.00으로 떨어진 것은 확실한 실패입니다. `pass` 불리언 필드를 직접 비교하십시오. `was.pass && !now.pass`가 퇴행이고, 점수 변화는 별도의 열로 출력합니다.

<!-- answer -->

**`eval-runner.mjs` 수정.** 파일 맨 위에 import 두 개와 원자적 쓰기 함수를 추가합니다.

```javascript
import fs from "node:fs";
import path from "node:path";

const STRICT = process.argv.includes("--strict-verify");

// 원자적 쓰기: .tmp에 먼저 쓰고 rename — 절반만 쓰인 파일을 compare.mjs가 읽는 일이 없다
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
```

그다음 8번 진입점 절 전체를 교체합니다. 한 번에 한 버전만 돌리고 지정한 파일에 기록합니다.

```javascript
// ============ 8. 진입점 ============
// 사용법: node eval-runner.mjs --version v1 --out reports/v1.json
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const version = argOf("--version", "v1");
const out = argOf("--out", null);

const report = await runSuite(version);
printReport(report);

if (out) {
  writeJsonAtomic(out, {
    version: report.version,
    passed: report.passed,
    total: report.total,
    ranAt: new Date().toISOString(),
    rows: report.rows.map(({ id, pass, score, toolCalls, toolErrors, tokens }) => ({
      id, pass, score, toolCalls, toolErrors, tokens,
    })),
  });
  console.log(`\n리포트를 ${out}에 기록했습니다`);
}
```

진입점을 갈아 끼우면 `printDiff`를 부르는 곳이 없어집니다. **이 함수를 통째로 지우십시오.** 죽은 코드로 남겨 두지 마십시오. 이 시점부터 그 일은 `compare.mjs`의 몫입니다. `printDiff`는 같은 프로세스 실행에서 나온 리포트 두 개만 비교할 수 있지만, `compare.mjs`는 며칠 떨어져 있든 다른 머신이든 임의의 두 실행을 비교할 수 있습니다. 영속화할 때 `durationMs`와 `answer`를 일부러 걷어냈습니다. 소요 시간은 실행마다 흔들리고 원본 답변은 너무 길어서, 둘 다 JSON 비교를 시끄럽게 만듭니다.

**`compare.mjs` 전문:**
```javascript
// compare.mjs — 리포트 두 개를 읽어 태스크별 점수 차이를 출력한다. pass가 fail로 뒤집히면 비정상 종료
// 사용법: node compare.mjs reports/v1.json reports/v2.json
import fs from "node:fs";

const [baseFile, headFile] = process.argv.slice(2);
if (!baseFile || !headFile) {
  console.error("사용법: node compare.mjs <기준.json> <신규.json>");
  process.exit(2);
}
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const base = read(baseFile);
const head = read(headFile);
const wasById = new Map(base.rows.map((r) => [r.id, r]));
const regressions = [];

console.log(`base ${baseFile} (${base.version})  ->  head ${headFile} (${head.version})`);
console.log("task".padEnd(18) + "base".padStart(6) + "head".padStart(7) + "delta".padStart(8) + "  상태");
console.log("-".repeat(52));

for (const now of head.rows) {
  const was = wasById.get(now.id);
  if (!was) {
    console.log(now.id.padEnd(18) + "-".padStart(6) + now.score.toFixed(2).padStart(7) + "-".padStart(8) + "  새 태스크");
    continue;
  }
  const delta = now.score - was.score;
  let state = "변화 없음";
  if (was.pass && !now.pass) {
    state = "퇴행 pass => FAIL";
    regressions.push(now.id);
  } else if (!was.pass && now.pass) {
    state = "수정됨 fail => pass";
  } else if (Math.abs(delta) > 1e-9) {
    state = delta > 0 ? "점수 상승" : "점수 하락";
  }
  console.log(
    now.id.padEnd(18) + was.score.toFixed(2).padStart(6) + now.score.toFixed(2).padStart(7) +
    (delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)).padStart(8) + "  " + state
  );
}

console.log("-".repeat(52));
console.log(`통과율 ${base.passed}/${base.total} -> ${head.passed}/${head.total}`);
const missing = base.rows.filter((r) => !head.rows.some((n) => n.id === r.id)).map((r) => r.id);
if (missing.length) console.log(`새 리포트에서 빠진 태스크: ${missing.join(", ")}`);

if (regressions.length) {
  console.error(`\n${regressions.length}개 태스크가 pass에서 fail로 뒤집혔습니다: ${regressions.join(", ")}`);
  process.exit(1);
}
console.log("\npass에서 fail로 뒤집힌 태스크는 없습니다.");
```

(여기서는 날것의 `padEnd`를 써도 안전합니다. 자리를 채우는 열은 전부 ASCII 태스크 ID와 숫자이고, 한글 상태 문구는 줄 끝에만 나와 정렬에 참여하지 않기 때문입니다. 열 안에 한글 텍스트가 들어가는 곳에서는 본문의 폭 인식 `pad`가 여전히 필요합니다.)

**실제 실행 출력.** 두 번의 평가 실행 리포트는 본문과 같으므로 여기서는 마지막 줄만 남깁니다. `exit code=` 줄은 명령 뒤에 `echo "exit code=$?"`를 덧붙여 얻은 것입니다.

```text
$ node eval-runner.mjs --version v1 --out reports/v1.json | tail -1
리포트를 reports/v1.json에 기록했습니다

$ node eval-runner.mjs --version v2 --out reports/v2.json | tail -1
리포트를 reports/v2.json에 기록했습니다
```

정방향 비교, 퇴행 없음, 0으로 종료:

```text
$ node compare.mjs reports/v1.json reports/v2.json
base reports/v1.json (v1)  ->  head reports/v2.json (v2)
task                base   head   delta  상태
----------------------------------------------------
t1-total            1.00   1.00   +0.00  변화 없음
t2-pending          1.00   1.00   +0.00  변화 없음
t3-no-orderid       0.00   1.00   +1.00  수정됨 fail => pass
t4-refund-note      0.67   1.00   +0.33  수정됨 fail => pass
t5-missing-order    1.00   1.00   +0.00  변화 없음
----------------------------------------------------
통과율 3/5 -> 5/5

pass에서 fail로 뒤집힌 태스크는 없습니다.
exit code=0
```

두 파일을 맞바꿔 '새 버전이 v2의 변경을 되돌렸다'를 흉내 내면, 0이 아닌 종료 경로도 동작합니다:

```text
$ node compare.mjs reports/v2.json reports/v1.json
base reports/v2.json (v2)  ->  head reports/v1.json (v1)
task                base   head   delta  상태
----------------------------------------------------
t1-total            1.00   1.00   +0.00  변화 없음
t2-pending          1.00   1.00   +0.00  변화 없음
t3-no-orderid       1.00   0.00   -1.00  퇴행 pass => FAIL
t4-refund-note      1.00   0.67   -0.33  퇴행 pass => FAIL
t5-missing-order    1.00   1.00   +0.00  변화 없음
----------------------------------------------------
통과율 5/5 -> 3/5

2개 태스크가 pass에서 fail로 뒤집혔습니다: t3-no-orderid, t4-refund-note
exit code=1
```

기억해 둘 만한 구현 세부가 두 가지 있습니다. 하나는 인덱스가 아니라 `id`로 맞춘다는 것이고 `wasById` Map이 그 일을 합니다. 나중에 평가 세트에 새 태스크를 끼워 넣어도 옛 리포트와 여전히 비교됩니다. 다른 하나는 퇴행 판정에 점수 임계값이 아니라 `was.pass && !now.pass`를 쓴다는 것입니다. `t4`가 1.00에서 0.67로 떨어진 것은 점수 하락**이면서** 판정자의 0.8 통과선을 넘어간 것이고, 두 조건이 함께 충족되어야 퇴행입니다. 언젠가 루브릭이 조정되어 통과선이 따라 움직여도 이 코드는 바꿀 필요가 없습니다.

<!-- /exercises -->

## 정리

- 평가를 돌리는 표준적인 모양은 프로그램에서 API를 직접 호출하고 단순한 에이전틱 루프를 쓰되 **평가 태스크 하나에 루프 하나**를 두는 것이다. 태스크는 `messages`를 공유하지 않는다. 공유하면 앞 태스크가 다음 태스크를 오염시켜 결과를 더 이상 비교할 수 없게 된다[^S3].
- 모든 평가 프롬프트에는 검증 가능한 결과가 짝지어져야 한다. 검증기는 정확한 문자열 비교부터 모델에게 판정을 맡기는 것까지 스펙트럼을 이룬다. 코드로 채점할 수 있는 것은 절대 판정자에게 보내지 않는데, 코드 기반 채점이 가장 빠르고 가장 신뢰할 수 있으며 확장성도 대단히 좋기 때문이다[^S3][^S5].
- 자유 형식 텍스트는 판정자로 간다. 모양은 단일 호출, 단일 프롬프트, 0.0–1.0 점수와 통과/실패 출력이다. 루브릭은 근거를 먼저 쓰고 점수를 나중에 내게 해야 하며 출력 형식은 고정한다[^S2][^S5].
- 리포트는 통과율 외에 태스크 소요 시간, 도구 호출 횟수, 토큰 소비량, 도구 에러를 기록해야 한다. 이 열들은 스스로 진단서가 된다. 중복 호출은 페이지네이션/반환량 파라미터 조정을 가리키고, 잘못된 파라미터 에러는 도구 설명이 명확해져야 함을 가리킨다[^S3].
- 지나치게 엄격한 검증기는 올바른 답을 거절한다. 형식, 문장 부호, 타당한 다른 표현이 전부 문자 그대로의 비교를 걸어 넘어뜨릴 수 있으므로, 정확 일치 전에 정규화를 한다[^S3][^S5]. 점수는 바뀌었는데 테스트 대상은 바뀌지 않았다면 검증기 잘못이다.
- 트랙이 있으면 프롬프트 변경의 영향이 측정 가능해진다. 작은 다듬기도 극적인 개선을 낳을 수 있고, 초기에는 효과 크기가 커서 케이스 몇 개로도 차이를 알아볼 수 있다[^S3][^S2]. 리포트 자체가 남이 검토할 수 있는 증거이며, 검증을 직접 다시 돌리는 것보다 빠르고 지켜보지 않은 세션에도 통한다[^S4].
- 리포트를 따라 프롬프트를 고치면 점수는 오르지만 그 상승이 이 태스크 묶음에서만의 것일 수 있다. 홀드아웃 세트를 잠가 과적합을 막는다[^S3]. 자동 평가에는 사각지대가 있고, 사람 테스터는 여전히 평가가 놓치는 엣지 케이스를 잡아낸다[^S2].

## 이 과정을 마치며

돌아보면 본줄기는 사실 짧습니다. 레슨 1은 '완료된 것처럼 보인다'와 '완료됐다'를 갈라놓았습니다. 실행 가능한 체크가 없으면 '완료된 것처럼 보인다'가 유일하게 얻을 수 있는 신호이고, 그러면 당신이 검증 단계가 됩니다[^S4]. 레슨 2는 무엇을 검증할지를 정했습니다. 에이전트는 같은 목표에 대해 완전히 다른 합리적 경로를 걸을 수 있으므로 최종 상태를 평가하고 궤적을 단계별로 확인하지 않습니다[^S2]. 레슨 3은 '체크'를 통과/실패를 내놓는 실행 가능한 결정론적 검증기로 만들었고, 동시에 지나치게 엄격한 검증기가 올바른 답을 거절한다고 경고했습니다[^S3]. 레슨 4는 자유 형식 텍스트를 다뤘습니다. 루브릭, 출력 형식, 그리고 일한 모델이 자기를 채점해서는 안 된다는 것입니다[^S2][^S4]. 레슨 5는 '몇 개의 케이스로 검증할 것인가'를 풀었습니다. 실제 과제 20개 남짓이면 시작할 수 있고, 수백 개가 쌓일 때까지 기다리지 않습니다[^S2]. 이 레슨은 앞의 다섯을 300줄짜리 파일 하나로 용접했습니다.

그 파일은 복잡하지 않고 2초 안에 끝나지만, 바꾸는 것은 구체적입니다. 오늘부터 프롬프트 버전을 바꿀 때 '출력 몇 문단을 읽고 나아진 것 같다'는 느낌에 기대어 판단하지 않아도 됩니다. 명령 하나를 돌리면 v1에서 v2로의 변화표가 당신 대신 말해 줍니다. 이번에 `t3`와 `t4`가 초록으로 바뀌고 나머지 셋은 그대로였던 것처럼 말입니다. 다음번에 당신의 에이전트가 '완료했습니다'라고 말할 때, 그 주장을 검증할 명령 두 개와 종료 코드 하나가 당신에게 있습니다.

다음번에 당신의 에이전트가 '완료했습니다'라고 말할 때, 그것을 검증할 실행 가능한 트랙이 당신에게 있습니다.

