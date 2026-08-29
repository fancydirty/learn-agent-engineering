# 레슨 4: 부수 효과와 멱등성: 재개 시 다시 실행해도 안전한 도구는 무엇인가

> 학습 목표:
> - 재개 시의 리플레이가 기본적으로 **at-least-once**(최소 1회) 실행 시맨틱을 안겨 줄 뿐 결코 exactly-once가 되지 않는 이유를 설명하기
> - 도구 조작이 멱등한지 판정하고, 두 번 실행되는 순간 실제 피해를 내는 부수 효과를 가려내기
> - `tool_use_id`를 키로 삼는 **부수 효과 원장**을 설계하고 구현해, 재개 시 허공에 뜬 호출이 실제로 실행할지 정하기 전에 원장을 먼저 확인하게 하기
>
> 전제: 레슨 2와 레슨 3을 읽었고 `checkpoint.json`에 남은 허공에 뜬 `pendingToolUse`의 정산 규칙(레슨 3)을 이해하고 있어야 합니다. 이 시리즈의 코스 7 "에이전트 하네스 기초: 루프와 통제"의 `HIGH_IMPACT` 도구 집합과 실행 전 승인 게이트를 알고 있어야 합니다 | 이전: [레슨 3 <<](./03-resume-from-checkpoint.md) | 다음: [레슨 5 >>](./05-rewind-and-fork.md)

## 재개가 주는 것은 at-least-once: 레슨 3이 남긴 영향이 큰 도구

레슨 3은 `checkpoint.json`에서 `pendingToolUse`를 읽어 내, 허공에 뜬 호출 — 도구 실행과 원장 기록 사이에 크래시가 떨어진 그 호출 — 을 루프로 도로 끌어오는 법을 가르쳤습니다. 그때의 정산 규칙은 이랬습니다. 읽기 전용 도구는 그냥 다시 실행한다. 판단이 서지 않는 영향이 큰 도구에는 `is_error` `tool_result`를 덧붙여 루프가 막힌 자리에서 벗어나게 하고, 그 물음은 사람에게 되돌린다. 이것은 정직한 폴백이자, 동시에 풀리지 않은 문제이기도 합니다. '판단이 서지 않는다'는 그 작업이 스스로는 계속 갈 수 없다는 뜻이고, 그러므로 영향이 큰 도구에서 크래시가 날 때마다 누군가 지켜보고 있어야 합니다.

뿌리는 이것입니다. 재개는 그 본성상 **at-least-once**(최소 1회) 실행 시맨틱을 줍니다. 도구가 진짜로 성공한 뒤, 그러나 그 결과가 `messages`에 되돌아 쓰이거나 체크포인트에 커밋되기 전에 프로세스가 죽을 수 있고, 그 시점에서 '이 도구가 실행됐는가 아닌가'는 `checkpoint.json` 혼자서는 대답할 수 없는 물음입니다. `read_file` 같은 읽기 전용 도구라면 모르는 값이 아무 대가도 치르지 않습니다. 한 번 더 읽어도 결과는 같습니다. 그러나 `send_email`, `create_ticket`, 혹은 자금 이체라면 모른다는 것은 곧 사고입니다. 다시 실행한다는 것은 수신자가 똑같은 메일을 두 통 받을 수 있다는 뜻이고, 중복된 티켓이 난데없이 시스템에 나타날 수 있다는 뜻입니다.

새로운 문제가 아닙니다. 이 코스의 앞부분에서 우리는 에이전트가 상태를 가지며 에러가 누적된다[^S1]는 점을 확인했습니다. 한 번만 일어나야 했던 부수 효과를 두 번 실행하는 것은 그 '누적'이 취하는 구체적인 형태 하나입니다. 에러는 '한 번 더 돌렸다'에서 멈추지 않습니다. 그 여분의 부수 효과 위에 올라타 하류로 굴러갑니다. 이 레슨은 레슨 3이 열어 둔 채로 남긴 틈을 메웁니다. 먼저 **멱등성**이라는 개념을 들여오고, 그다음 재개 루프에 **부수 효과 원장**을 볼트로 조여, '판단이 서지 않는다'를 '판단이 선다'로 바꿉니다.

## 멱등이란 무엇인가: 한 번을 돌리든 열 번을 돌리든 같은 효과

**멱등**하다는 것은, 한 번 실행하든 여러 번 실행하든 같은 최종 효과를 내는 조작이라는 뜻입니다. 이것이 *효과* — 그 조작이 바깥 세계(파일, 데이터베이스, 받은편지함)에 남기는 최종 상태 — 에 관한 이야기이지, 호출마다 문자 그대로 어떤 값을 돌려주는지에 관한 이야기가 아니라는 점에 주의하세요.

어떤 도구가 멱등한지 판정하는 데는 물음 하나면 충분합니다. "이 조작이 조용히 한 번 더 돌았다면, 바깥 세계에 무언가가 하나 더 생기거나 다른 상태로 끝날까?" 아래의 작은 예제들을 그 물음에 통과시켜 보면 차이가 곧바로 드러납니다.

```javascript
// 멱등함: 파일 읽기에는 부수 효과가 없다 — 몇 번을 부르든
// 디스크 위에 있는 것은 그대로다
async function readFileContent(path) {
  return fs.readFile(path, "utf8");
}

// 멱등하지 않음: 호출할 때마다 배열에 행이 진짜로 하나씩 늘어난다
function appendRow(sheet, row) {
  sheet.rows.push(row);
}

// 멱등함: 몇 번을 부르든 42번 줄은 같은 값으로 수렴한다
function setLine(doc, lineNo, text) {
  doc.lines[lineNo] = text;
}

// 멱등하지 않음: 호출할 때마다 수신자의 받은편지함에 메시지가 진짜로 하나씩 늘어난다
async function sendEmail(to, subject, body) {
  return mailer.send({ to, subject, body });
}
```

`readFileContent`는 부수 효과가 아예 없기 때문에 본성상 멱등합니다 — '남는 것'이랄 게 없습니다. `setLine`도 멱등한데, 이쪽은 상태를 실제로 바꿉니다. 다만 바꾸는 방식이 **덮어쓰기**입니다. 한 번 부르면 42번 줄은 X이고, 열 번 불러도 42번 줄은 여전히 X입니다. 최종 상태가 호출 횟수에 따라 달라지지 않습니다. `appendRow`와 `sendEmail`은 멱등하지 않은데, 둘 다 이유는 같습니다. 그 효과가 **누적적**이라는 것 — 호출할 때마다 바깥 세계에 무언가가 진짜로 하나씩 더해지므로, 호출 횟수가 최종 상태에 그대로 드러납니다.

이 경계선을 붙들어 두세요. 덮어쓰기 방식의 쓰기는 대체로 멱등하고, 덧붙이기 방식의 쓰기는 대체로 멱등하지 않습니다. 읽기와 '먼저 확인하고 나서 움직일지 정하는' 조작은 대체로 멱등하고, 조건 없는 단순 삽입은 대체로 멱등하지 않습니다. 다음 절의 부수 효과 원장은 바로, 멱등하지 않으면서 설계를 바꿔서는 그것을 없앨 수 없는 조작들을 붙잡기 위해 존재합니다.

## 부수 효과 원장: 어떤 부수 효과가 이미 일어났는지 적어 두기

레슨 2는 루프의 실행 중인 장면 — `messages`, 각종 카운터, 아직 원장에 쓰이지 않은 도구 호출 — 을 체크포인트에 담아 크래시가 나도 그 자리에서 주워 올릴 수 있게 하는 법을 가르쳤습니다. 그러나 체크포인트가 대답하는 것은 '루프의 어느 단계까지 왔는가'이지 '그 단계의 부수 효과가 실제로 일어났는가'가 아닙니다. 정상 운행 중에는 둘이 거의 발을 맞춰 움직이지만, 그 사이의 틈에 크래시가 떨어지는 순간 둘은 어긋납니다. 레슨 3이 영향이 큰 도구의 정산을 풀지 못한 채 남겨 둘 수밖에 없었던 것이 바로 이 때문입니다.

그 틈을 메우려면 **부수 효과 원장**이 필요합니다. 어떤 부수 효과가 이미 일어났는지를 체크포인트와는 별도로 디스크에 적어 두는 것입니다. 구조는 단순합니다. `tool_use_id`를 키로 삼는 맵입니다.

```javascript
// effects.json의 모양
{
  "toolu_01abc": {
    "name": "create_ticket",
    "result": { "id": "T-1", "title": "고객 장애 신고" },
    "at": "2026-08-26T09:12:03.000Z"
  }
}
```

원장을 쓰는 타이밍은 대단히 중요합니다. 도구 함수가 실제로 성공해 결과를 돌려준 바로 그 순간에 쓰고, 게다가 레슨 2의 '지점 B' 체크포인트(도구 결과가 `messages`에 들어간 뒤에 이루어지는 정형화된 쓰기)보다 한 박자 *먼저* 씁니다. 이유는 직접적입니다. '도구가 성공했다'와 '지점 B 체크포인트 쓰기가 끝났다' 사이의 좁은 창 안에 크래시가 떨어지면, 지점 B 체크포인트는 이 일이 일어났다는 것을 기록할 기회를 얻지 못합니다. 재개 시 진실을 알려 줄 수 있는 것은 더 먼저 쓰기를 마친 원장뿐입니다. 원장 쓰기 자체도 레슨 2와 레슨 3의 `.tmp` + `rename` 원자적 쓰기를 써야 하며, 이유는 같습니다. 반쯤 쓰인 원장 파일은 원장이 아예 없는 것보다 위험합니다. 실제로는 완료되지 않은 부수 효과를 여러분이 믿게 만들기 때문입니다.

```javascript
import { promises as fs } from "node:fs";

async function loadEffects(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return {}; // 파일이 없거나 깨졌을 때: 빈 원장으로 취급하고 재개를 막지 않는다
  }
}

async function saveEffects(path, effects) {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(effects, null, 2));
  await fs.rename(tmp, path); // 원자적 교체, 반쯤 쓰인 파일이 남지 않는다
}
```

원장이 손에 있으면, 재개 시의 정산 규칙은 레슨 3의 '판단이 서지 않는다'에서 '판단이 선다'로 격상됩니다. `checkpoint.json`에서 꺼낸 `pendingToolUse`의 `id`를 원장에서 찾아보는 것입니다. **히트**라면 그 부수 효과는 정말로 일어난 것이므로, 원장에 저장된 `result`를 꺼내 `tool_result`를 채우고, 두 번 다시 실행하지 않습니다. **미스**라면 이 호출은 시작조차 하지 않았거나 성공하지 못한 채 도중에 죽은 것이므로, 실행해도 안전합니다. 이 규칙은 모든 도구에 적용됩니다. 다만 멱등한 도구에는 이 조회가 어느 쪽으로 나오든 영향이 없다는 것뿐입니다. 실제로 이것에 기대는 것은 되풀이될 때 실제 피해를 내는 조작들입니다.

여기에는 따로 떼어 말할 값어치가 있는 통찰이 하나 있습니다. **`tool_use_id`는 이미 멱등 키입니다.** 모델이 도구를 지명할 때마다 그 호출은 "A unique identifier for this particular tool use block"[^S4](이 특정 도구 사용 블록에 대한 고유 식별자)를 달고 옵니다. 공식 명세의 `id` 필드 정의 그대로입니다. 재개 시의 리플레이 때문에 같은 지명이 두 번째로 보이더라도 `id`는 바뀌지 않습니다. 원장이 '이 호출'과 '아까 그 호출'을 하나의 동일한 사건으로 알아볼 수 있는 것은 바로 그 덕분이며, 여러분이 따로 중복 제거 방식을 고안할 필요가 없습니다.

```agentmentor-check
{
  "id": "sp-zh-04-blind-retry",
  "label": "허공에 뜬 send_email 호출 — 다시 실행하면 모델이 스스로 바로잡을 수 있는가",
  "prompt": "재개 시 여러분의 하네스가 checkpoint.json에서 허공에 뜬 send_email 호출을 발견합니다. 크래시는 메일이 나간 직후, 결과가 원장에 쓰이기 전에 떨어졌습니다. 동료가 이렇게 말합니다. '그냥 눈 감고 다시 실행하세요. 모델이 결과가 돌아오는 것을 보고 스스로 바로잡을 겁니다.' 이 말은 성립합니까?",
  "whyHere": "방금 원장의 정산 규칙을 배웠습니다. 여기서는 '다시 실행하는 것'과 '모델이 스스로 바로잡는 것'이 서로 다른 두 가지임을 정말로 이해했는지 확인합니다. 그것이야말로 원장이 건너뛰어도 되는 선택적 단계가 아니라 애초에 존재해야 하는 이유입니다.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "성립합니다. 모델이 '메일 발송 완료' 결과가 돌아오는 것을 보고 자기가 기억하는 것과 맞지 않는다는 점을 알아채면, 중복을 짚어내고 처리할 것입니다",
      "correct": false,
      "feedback": "모델이 볼 수 있는 것은 이번 한 번의 tool_result로 돌아온 것뿐입니다. 이 메일이 앞서 이미 한 번 발송됐는지를 감지할 독립적인 통로도 없고, 수신자의 받은편지함에 손을 뻗어 두 번째 사본을 도로 빼 올 방법도 없습니다. 부수 효과는 바깥 세계에서 일어나며, 모델의 출력은 거기서 이미 일어난 일을 바꿀 수 없습니다. 기껏해야 다음 문장에서 사과하는 것이 전부입니다. 메일 두 통은 그대로 나갔습니다."
    },
    {
      "id": "b",
      "text": "성립하지 않지만, 올바른 처방은 하네스가 재개 시 허공에 뜬 도구 호출을 전부 건너뛰고 하나하나 사람에게 넘겨 정리하게 하는 것입니다",
      "correct": false,
      "feedback": "거꾸로 된 처방입니다. 전부 건너뛰는 것은 모든 도구를 위험한 것으로 취급하는 일인데, 허공에 뜬 호출의 대부분은 읽기 전용이거나(다시 실행해도 위험이 0입니다) 실제로 성공한 적이 없습니다(다시 실행하는 것이 유일하게 옳은 수입니다). 그렇게 하면 재개가 '크래시마다 사람이 필요하다'로 퇴화해, 자동으로 이어 간다는 목적 자체를 내다 버리게 됩니다. 증거로 가려야 할 문제를 일괄 회피로 푸는 셈입니다."
    },
    {
      "id": "c",
      "text": "성립하지 않습니다. 모델은 이 호출이 돌려준 결과만 볼 뿐 바깥 세계에 이미 내려앉은 중복을 감지할 수 없으므로, 하네스가 실행 전에 tool_use_id로 부수 효과 원장을 확인해야 합니다",
      "correct": true,
      "feedback": "정답입니다. 모델의 세계는 자기가 보는 tool_result이며, 지금 수신자의 받은편지함에 메시지가 몇 통 놓여 있는지를 들여다볼 다른 눈이 없습니다. 그것을 볼 수 있는 것은 — 그리고 중복을 멈출 수 있는 유일한 것은 — 하네스입니다. 도구를 실제로 부르기 전에 이 호출의 tool_use_id를 부수 효과 원장에서 찾아보세요. 히트라면 저장된 결과를 재사용하고 두 번 다시 실행하지 않으며, 미스일 때에만 실행이 안전합니다. 이 게이트는 모델의 판단에 기대지 않고, 원장이 디스크에 남긴 확정적인 증거에 기댑니다."
    }
  ]
}
```

## 두 겹의 게이트: 승인은 '해야 하는가'를, 원장은 '이미 했는가'를 묻습니다

이 시리즈의 코스 7 "에이전트 하네스 기초: 루프와 통제"는 `runToolUses`에 승인 게이트를 달았습니다. 영향이 큰 도구가 실제로 돌기 전에 무슨 일이 벌어질지를 찍어 보여 주고, 사람이 확인해 줄 때까지 기다렸다가 통과시키는 것입니다[^S3]. 그 게이트는 '이것을 해야 하는가'라는 물음을 세웁니다. 이 레슨의 부수 효과 원장은 다른 물음을 세웁니다. '이것을 이미 했는가'. 두 게이트는 서로 다른 것을 묻지만 같은 자리에 앉습니다. 둘 다 모델이 도구를 지명한 뒤, 도구가 실제로 돌기 전의 그 순간에 끼워져 있습니다. 어느 쪽도 확인을 거치기 전에는 도구 함수가 실행되도록 두지 않습니다.

둘을 겹쳐 쌓으면 `runToolUses`는 이런 모양이 됩니다.

```javascript
const HIGH_IMPACT = new Set(["send_email", "create_ticket", "delete_file"]);

async function runToolUses(content, toolImpls, opts = {}) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const effects = await loadEffects(opts.effectsPath);
  const results = [];

  for (const block of toolUseBlocks) {
    // 멱등성 게이트: 이 호출은 이미 실제로 일어났는가?
    const recorded = effects[block.id];
    if (recorded) {
      results.push({ type: "tool_result", tool_use_id: block.id, content: recorded.result });
      continue; // 원장 히트: 저장된 결과를 재사용하고, 두 번 다시 실행하지 않는다
    }

    // 승인 게이트: 영향이 큰 조작은 실행 전에 확인을 받는다 (코스 7)
    if (HIGH_IMPACT.has(block.name)) {
      const ok = await opts.approve?.(block.name, block.input);
      if (!ok) {
        results.push({
          type: "tool_result", tool_use_id: block.id,
          content: "사용자가 이 영향이 큰 조작을 거절했습니다. 실행되지 않았습니다.", is_error: true,
        });
        continue; // 실행은 건너뛰되, 호출이 허공에 뜨지 않도록 tool_result는 돌려준다
      }
    }

    let output;
    try {
      output = await toolImpls[block.name](block.input);
    } catch (err) {
      // 도구 자체가 실패했다: 부수 효과가 일어나지 않았으므로 is_error를 정직하게 보고한다
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `도구 실행 실패: ${err.message}`, is_error: true,
      });
      continue;
    }

    // 여기까지 왔다면 부수 효과는 정말로 일어났다. 아래의 원장 쓰기가 실패하더라도
    // 그것을 실행 실패로 잘못 보고해서는 결코 안 된다 — is_error를 돌려주는 순간 모델은
    // 이것이 실행되지 않았다고 여겨 새 tool_use_id로 재시도하고, 원장은 더 이상 그것을
    // 같은 호출로 알아볼 수 없다. 중복된 부수 효과는 그렇게 빠져나간다.
    effects[block.id] = { name: block.name, result: output, at: new Date().toISOString() };
    try {
      await saveEffects(opts.effectsPath, effects); // 성공 즉시 쓴다, 모아서 쓰지 않는다
    } catch (err) {
      // 쓰기 실패는 도구의 문제가 아니라 운영의 문제다: 모델에는 진짜 결과를 돌려주고
      // 별도의 경보를 올린다
      console.error(
        `[원장 쓰기 실패] tool_use_id=${block.id} name=${block.name}: ` +
        `부수 효과는 일어났으나 기록되지 않았습니다. 재개 시 재실행 위험이 있습니다. 수동 검토가 필요합니다. 원인: ${err.message}`,
      );
    }
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

순서는 타협 대상이 아닙니다. 멱등성 게이트가 먼저 와야 합니다. 이유는 분명합니다. 이 호출이 이미 원장에 있다면 그 뒤에 '이것을 해야 하는가'를 묻는 것은 무의미합니다. 이미 끝난 일이기 때문이고, 다시 묻는 것은 대답하는 사람을 헷갈리게 할 뿐입니다. 시스템이 이것을 분명히 끝냈는데 왜 나에게 확인을 요구하지? 재개 시 허공에 뜬 호출에 대한 첫 물음은 언제나 '이것이 일어났는가'이며, 그것이 가려진 뒤에야 '이것을 해야 하는가'에 차례가 돌아옵니다.

## 도구 설계 층위의 멱등성: 뒷수습이 아니라 원인을 고치기

부수 효과 원장은 하네스 쪽의 최후 방어선입니다. 도구 자체가 멱등하게 설계되었든 아니든, 원장은 `tool_use_id`로 중복 실행을 막을 수 있습니다. 그러나 최후 방어선은 어디까지나 최후 방어선이고, 더 나은 투자는 원인을 고치는 쪽입니다. 도구를 바꿀 수 있는 곳이라면 본성상 멱등하게 설계해, 원장이 나설 일 자체를 없애는 것입니다.

그 변경의 가장 흔한 형태는 '생성'을 '있는지 보장'으로 바꾸는 것입니다.

```javascript
// 원인 고치기: 본성상 멱등함 — 먼저 확인하고, 있는 것을 돌려주고, 다시 만들지 않는다
async function ensureTicket(input) {
  const existing = await findTicketByTitle(input.title);
  if (existing) return existing;
  return createTicketRecord(input);
}
```

`ensureTicket`을 한 번 부르든 열 번 부르든 시스템에는 그 제목에 해당하는 티켓이 정확히 하나만 남습니다. 최종 상태가 호출 횟수에 따라 달라지지 않는다는 것, 그것이 멱등의 정의입니다. 파일 쓰기에도 같은 사고가 적용됩니다. 파일 전체를 쓰는 `write_file`은 본성상 멱등해서 반복 호출해도 같은 내용이 남지만, 덧붙이는 `append_file`은 그렇지 않아서 파일이 호출마다 한 단락씩 자랍니다. 덮어쓰기를 고를 수 있다면 덧붙이기를 고르지 마세요.

원인 고치기와 뒷수습은 둘 중 하나를 고르는 문제가 아니라 분업입니다. 멱등하게 설계할 수 있는 도구는 도구 층위에서 풀어, 모든 호출이 원장을 우회로로 거치는 수고를 덜어 주어야 합니다. 그리고 업무 논리상 정말로 '중복 제거해 합칠' 수 없는 조작 — 이를테면 서로 다른 시각에 실제로 일어난 두 건의 이체처럼, 서로 다른 두 사건으로 인식되어야 마땅하고 영리한 설계로 하나로 접을 수 없는 것 — 에는 원장이 유일한 최후 방어선입니다.

## 되짚기: 가드레일 하나 더, 그리고 그것이 값어치를 하는 때

이 코스는 신뢰성이 모델의 적응력과 재시도 로직·정기 체크포인트 같은 결정론적 안전장치를 짝지을 때 나온다[^S1]는 지점에서 출발했습니다. 부수 효과 원장은 그 가드레일 가운데 하나입니다. 그것은 '내가 이미 이것을 했나'를 모델에게 판정하라고 요구하지 않습니다 — 그것은 애초부터 모델이 감지할 수 있는 범위 밖이었습니다. 대신 하네스가 모델을 대신해, 디스크에 쓰인 확정적인 증거로 그 판정을 내리게 합니다.

균형 감각도 잃지 마세요. 여러분의 에이전트가 쥔 도구가 전부 읽기 전용이라면 이 레슨의 원장은 아마 제 값을 하지 못할 것입니다. 부수 효과 원장 자체가 복잡도의 한 겹이며, 그것을 더할 만하게 만드는 것은 중복된 부수 효과라는 실제 위험을 정말로 막아 준다는 사실입니다. 복잡도는 결과를 눈에 띄게 개선함이 증명될 때에만 더하세요[^S3]. 시험 방법은 지난 레슨과 같습니다. 여러분의 도구 집합에서 멱등하지 않은 영향이 큰 조작을 먼저 찾아보세요. 있다면 게이트는 달 만합니다. 없다면 서둘러 쓰지 마세요.

<!-- exercises -->
## 💻 연습

### 레벨 1: 여섯 개 도구의 멱등성과 재실행 위험 매기기

아래 여섯 개 도구 각각에 대해 판정하세요. (1) 멱등한가, (2) 그것을 향한 허공에 뜬 호출이 재개 시 다시 실행된다면 위험은 높은가, 중간인가, 낮은가 — 그리고 왜 그런가.

- `read_file(path)` — 파일 내용을 읽는다
- `send_email(to, subject, body)` — 메일을 보낸다
- `ensure_ticket(title, body)` — 제목으로 조회해, 이미 있으면 그 티켓을 돌려주고, 없을 때만 새로 만든다
- `append_log(line)` — 로그 파일 끝에 한 줄을 덧붙인다
- `set_config(key, value)` — 설정 키를 주어진 값으로 지정한다(덮어쓰기)
- `delete_file(path)` — 파일을 지운다

<!-- rubric -->
- 여섯 개의 멱등성 판정이 모두 옳음(멱등함: read_file, ensure_ticket, set_config, delete_file. 멱등하지 않음: send_email, append_log)
- 위험 등급이 타당하고 근거가 함께 붙음. 맨 이름표만 달지 않음(높음/중간/낮음에 '왜'가 뒷받침되어야 함)
- 멱등성이 도구를 얼마나 꼼꼼히 구현했는지에 달려 있는 경우를 최소 하나 지목함(ensure_ticket의 조회 논리, 또는 delete_file이 '파일 없음'을 어떻게 다루는가)

<!-- answer -->
`read_file`은 멱등하고, 본성상 부수 효과가 없으며, 다시 실행해도 위험이 0입니다(낮음). `send_email`은 멱등하지 않습니다 — 호출할 때마다 수신자의 받은편지함에 메시지가 진짜로 하나씩 더 놓입니다 — 따라서 재개 시 허공에 뜬 호출을 다시 실행하면 중복 발송이 일어납니다. 위험은 높음이고, 원장을 확인한 뒤에만 리플레이가 안전합니다. `ensure_ticket`은 설계상 멱등합니다. 같은 제목의 티켓이 이미 있으면 생성을 건너뛰므로 시스템의 최종 상태가 호출 횟수에 따라 달라지지 않습니다. 그러나 그 멱등성은 '제목으로 조회한다'는 논리가 튼튼하다는 데 기대고 있습니다. 제목에 타임스탬프처럼 매번 달라지는 것이 실려 있으면 조회가 더는 들어맞지 않고, 그 멱등성은 이름뿐인 멱등이 됩니다. 위험은 낮음에서 중간 사이로 부르고, 그래도 원장으로 받쳐 두세요. `append_log`는 멱등하지 않습니다 — 호출할 때마다 줄이 진짜로 하나씩 더해집니다 — 따라서 재개 시의 재실행은 로그에 중복 항목을 남깁니다. 위험은 중간입니다. 중복 메일처럼 업무 사고는 아니지만 로그를 오염시키고, 줄 수를 세거나 내용을 맞춰 보는 하류 로직을 어긋나게 할 수 있습니다. `set_config`는 멱등하며 덮어쓰기 방식의 쓰기입니다. 같은 키를 같은 값으로 지정하는 것은 몇 번을 부르든 같은 최종 상태를 내므로 위험은 낮고 다시 실행해도 괜찮습니다. `delete_file`은 멱등합니다 — 이미 사라진 파일을 지우는 것은 그 파일이 애초에 없는 것과 같은 최종 상태를 남깁니다 — 그러므로 위험은 낮습니다. 다만 구현 세부를 살피세요. `delete_file`이 파일이 없을 때 던지고 호출자가 그것을 실행 실패로 취급한다면, 재실행이 새로운 실패로 잘못 읽힙니다. '파일 없음'은 멱등의 의미에서 성공으로 취급되어야 합니다.

<!-- hint -->
위험은 잠시 접어 두고, 여섯 개를 두 무리로 나눠 보세요. 덮어쓰는 효과와 쌓이는 효과. 그 경계선은 레슨 본문에 있고, 무리 짓기가 옳게 되고 나면 멱등성 판정은 대체로 저절로 정리됩니다.

<!-- hint -->
위험 등급은 '멱등하면 낮음, 멱등하지 않으면 높음'을 그대로 베낀 것이 아닙니다. `append_log`와 `send_email` 중 어느 쪽의 결과가 더 심각한지 생각해 보고, 그다음 `ensure_ticket`의 멱등성이 어떤 전제 위에 서 있는지, 그 전제가 무너지면 무슨 일이 생기는지 생각해 보세요.

### 레벨 2: 원장이 없는 runToolUses에 부수 효과 원장 달기

지난주 여러분의 하네스는 '고객이 장애를 신고했으니 티켓을 연다'는 작업을 처리하고 있었습니다. `create_ticket`을 실행해 성공 결과를 받았는데 — 하필 그 순간 컨테이너가 재시작되며 죽었고, 결과가 `tool_result`로 돌아가기 전이었습니다. 프로세스가 되살아난 뒤 하네스는 `checkpoint.json`에서 `pendingToolUse`를 읽었고 바로 그 `create_ticket` 호출을 찾아냈습니다. 아래의 원장 없는 `runToolUses`로는 다시 실행하는 것 말고 방법이 없었고 — 그래서 고객 장애 신고 하나가 난데없이 시스템의 중복 티켓이 되었습니다.

```javascript
// 사고 현장: 이 runToolUses에는 부수 효과 원장이 없다
async function runToolUses(content, toolImpls) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    const output = await toolImpls[block.name](block.input);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

여러분이 할 일: (1) `effects.json`을 위한 `loadEffects`/`saveEffects` 읽기·쓰기 함수를 원자적 쓰기(`.tmp` 먼저, 그다음 `rename`)로 작성하기. (2) `runToolUses`를 다시 써서 '실행 전에 원장을 확인하고, 미스일 때만 실행하고, 실행이 성공한 순간 원장에 기록한다'는 논리를 넣기. (3) 그것을 증명하는 Node 스크립트 작성하기 — 다시 쓴 `runToolUses`를 같은 `tool_use_id`로 두 번 호출해(재개 시의 리플레이를 흉내 내어) 두 번째 호출이 진짜 `create_ticket` 구현을 다시 돌리지 않음을 보이기.

<!-- rubric -->
- `loadEffects`/`saveEffects`가 대상 파일에 곧장 쓰는 대신 `.tmp` + `rename` 원자적 쓰기를 사용함. `loadEffects`가 파일 없음을 처리해(빈 객체를 돌려줌) 재개 자체가 크래시하지 않음
- 다시 쓴 `runToolUses`가 실행 전에 `block.id`로 원장을 조회하고, 히트일 때 `toolImpls`를 부르지 않고 저장된 `result`를 재사용함. 실행이 정말로 성공한 뒤에만 원장을 쓰고, 자리 표시자가 아니라 이 호출의 진짜 결과를 씀
- 검증 스크립트가 호출 횟수를 세는 가짜 `create_ticket`을 써서 '같은 tool_use_id로 부른 두 번째 호출은 카운터를 올리지 않는다'를 증명함 — 아무것도 던지지 않았다는 것이 아니라, 원장 확인이 실행을 막았다는 실제 증거

<!-- answer -->
```javascript
import { promises as fs } from "node:fs";

async function loadEffects(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return {};
  }
}

async function saveEffects(path, effects) {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(effects, null, 2));
  await fs.rename(tmp, path);
}

async function runToolUses(content, toolImpls, opts) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const effects = await loadEffects(opts.effectsPath);
  const results = [];
  for (const block of toolUseBlocks) {
    const recorded = effects[block.id];
    if (recorded) {
      results.push({ type: "tool_result", tool_use_id: block.id, content: recorded.result });
      continue;
    }
    const output = await toolImpls[block.name](block.input);
    effects[block.id] = { name: block.name, result: output, at: new Date().toISOString() };
    await saveEffects(opts.effectsPath, effects);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}

// 검증: 같은 tool_use_id로 리플레이할 때, 두 번째에는 티켓이 열리지 않는다
let calls = 0;
async function createTicket(input) {
  calls += 1;
  return { id: "T-1", title: input.title };
}

const block = {
  type: "tool_use",
  id: "toolu_01abc",
  name: "create_ticket",
  input: { title: "고객 장애 신고" },
};
const effectsPath = "./effects.json";

await runToolUses([block], { create_ticket: createTicket }, { effectsPath });
console.assert(calls === 1, "첫 번째 호출은 실제로 실행되어야 한다");

// 재개를 흉내 낸다: 같은 tool_use_id가 pendingToolUse에 다시 나타난다
await runToolUses([block], { create_ticket: createTicket }, { effectsPath });
console.assert(calls === 1, "두 번째 호출은 원장에 히트하므로 실행되지 않아야 한다");

console.log("calls =", calls); // calls = 1 이 출력되어, 리플레이가 두 번째 티켓을 열지 않았음을 증명한다
```

이 코드는 Node로 실제로 돌려 확인했습니다. `runToolUses`의 첫 호출에서는 원장이 비어 있어 `create_ticket`이 진짜로 한 번 실행되고, `calls`는 1이 되며, 원장 파일에 그 호출의 결과가 기록됩니다. 두 번째 호출은 같은 `tool_use_id`로 재개 시의 리플레이를 흉내 냅니다. `runToolUses`는 원장에서 그 id를 찾아내 저장된 `result`를 곧장 `tool_result`에 떨어뜨리고, `toolImpls.create_ticket`은 두 번 다시 불리지 않습니다 — `calls`는 여전히 1입니다. 바로 이것이 부수 효과 원장이 증명해야 할 것입니다. 재개 시의 리플레이는 이미 완료된 부수 효과를 두 번째로 일어나게 하지 않습니다.

<!-- hint -->
원장이 쓰이는지 여부는 도구가 실제로 성공했는지에 달렸지, `for` 루프가 이 지점에 도달했는지에 달린 것이 아닙니다 — `saveEffects`는 `toolImpls[...]` 호출 **뒤**, 그리고 결과를 손에 쥔 **뒤**에 앉아야 합니다.

<!-- hint -->
검증의 요점은 '두 번째 호출이 던지지 않았다'가 아니라 '두 번째 호출이 진짜 `create_ticket` 구현을 다시 돌리지 않았다'입니다. 호출 횟수를 세는 가짜 구현을 전후로 비교하는 것만이 믿을 만한 증거입니다.

<!-- /exercises -->

## 정리

- 재개는 at-least-once 실행 시맨틱을 안겨 준다. 도구가 진짜로 성공한 뒤 결과가 원장에 쓰이기 전에 프로세스가 죽을 수 있고, 체크포인트만으로는 그 허공에 뜬 호출이 돌았는지 알 수 없다. 레슨 3이 영향이 큰 도구의 정산을 풀지 못한 채 남겨 둘 수밖에 없었던 뿌리가 이것이다.
- 멱등의 정의: 한 번을 돌리든 여러 번을 돌리든 같은 최종 효과를 내는 조작. 덮어쓰기 방식의 쓰기(`set_config`, `write_file`)는 대체로 멱등하고, 덧붙이기 방식의 쓰기(`append_log`, `send_email`)는 대체로 그렇지 않다.
- 부수 효과 원장은 어떤 부수 효과가 이미 일어났는지를 `tool_use_id`를 키로 디스크에 기록한다. 그 키는 모델이 도구를 지명할 때 달고 오는 고유 식별자이고[^S4], 재개 시 같은 지명이 리플레이되어도 바뀌지 않으므로 본성상 멱등 키다. 도구가 성공한 그 순간에 `.tmp` + `rename` 원자적 쓰기로 써라.
- 재개 시의 정산 규칙은 이렇게 격상된다. `pendingToolUse.id`가 원장에 히트하면 저장된 결과를 재사용하고 두 번 다시 실행하지 않는다. 미스라면 안전하게 실행한다.
- 승인 게이트는 '이것을 해야 하는가'를 묻고, 부수 효과 원장은 '이것을 이미 했는가'를 묻는다. 둘은 서로를 보완하며, 둘 다 실제 실행 앞에 앉고, 멱등성 게이트가 먼저 간다.
- 원인 고치기가 뒷수습을 이긴다. 도구를 본성상 멱등하게 설계하면('생성'보다 '있는지 보장', 덧붙이기보다 덮어쓰기) 모든 것에 원장이 필요하지는 않게 된다. 신뢰성은 모델의 적응력과 결정론적 안전장치가 짝지어질 때 나오지만[^S1], 안전장치 역시 복잡도이며 결과를 눈에 띄게 개선함이 증명될 때에만 더해야 한다[^S3].

[>> 레슨 5: 되감기와 분기: 체크포인트의 두 번째 값어치](./05-rewind-and-fork.md)
