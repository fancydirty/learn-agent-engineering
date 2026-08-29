# 레슨 6: 실습: 하네스에 체크포인팅과 재개를 배선하기

> 학습 목표:
> - '지점 A에서 허공에 뜬 호출을 저장하고, 지점 B에서 지운다'는 체크포인트 방식을 개념도로 남겨 두지 말고, 이 시리즈의 코스 7에서 만든 `runAgent` 루프에 실제로 용접하기
> - `runToolUses`에 부수 효과 원장을 달아, 도구가 성공한 그 순간 디스크에 기록 하나를 남겨 재개가 '이 도구가 실제로 돌았는지 아닌지'를 가릴 수 있게 하기
> - `reconcile`의 세 갈래를 작성하고, 통제된 '모의 킬 + `--resume`' 실행으로 복구가 마땅히 그래야 할 대로 움직이는지 직접 눈으로 확인하기
>
> 전제: 레슨 1~5를 읽었고 이 시리즈의 코스 7 "에이전트 하네스 기초: 루프와 통제"의 하네스 루프를 돌릴 수 있어야 합니다 | 이전: [레슨 5 <<](./05-rewind-and-fork.md)

## 먼저 돌려서 봅니다

앞선 다섯 레슨은 체크포인트, 재개, 멱등성, 되감기와 분기를 하나씩 뜯어 설명했습니다. 이 레슨은 그것들을 실제로 돌아가는 하네스로 용접합니다. 루프는 늘 보던 그것 — `messages`로 모델을 부르고, `stop_reason === "tool_use"`이면 도구를 실행하고 다시 부르는 것 — 이지만, 이번에는 매 턴 체크포인트 둘을 디스크에 쓰고, 거기에 도구 실행 결과를 기록하는 원장까지 얹습니다. 작업은 '영업 메모를 리포트로 만들기'이고, `read_notes`, `count_words`, `write_report` 세 도구를 차례로 부릅니다. 3턴째까지 정상으로 돌다가 통째로 죽임을 당했을 때의 모습은 이렇습니다.

```text
$ CRASH_AFTER=after-effect-write:3 node agent.js

[turn 1][save A] pending=read_notes
[turn 1][save B]
[turn 2][save A] pending=count_words
[turn 2][save B]
[turn 3][save A] pending=write_report
[kill] after-effect-write:3 에서 모의 킬
EXIT=137
```

1턴째와 2턴째는 `save A` → 실행 → `save B`의 세 단계를 둘 다 완주했고 전부 정상입니다. 3턴째는 `save A`를 저장했고(허공에 뜬 호출이 `write_report`임을 기록했고), 도구도 실제로 실행을 마쳤으며, 그 결과는 이미 원장에 쓰였습니다 — 그러나 다음 단계인 `save B`가 저장되기 전에 프로세스가 죽임을 당했습니다. 이것이 바로 이 레슨이 잡으러 나선 창입니다. 이 순간 `checkpoint.json`에는 아직 허공에 뜬 `pendingToolUse`가 남아 있습니다. 그 장면을 안은 채로 `--resume`으로 주워 올립니다.

```text
$ node agent.js --resume

[resume] turn=3 pending=write_report 읽음
[resume][reconcile] tool_use_id=toolu_03 name=write_report 원장 히트, 결과 재사용, 재실행하지 않음
[turn 3][save B] 재개 후 이번 턴의 도구 결과를 채움
[done] report.txt에 리포트를 작성했습니다. 작업 완료.
```

재개 흐름은 `turn=3 pending=write_report`를 읽고 원장을 확인합니다 — 그러면 이 호출이 킬 이전에 실제로 완료되어 기록되었음을 알게 되므로, 그 기록을 그대로 재사용하고 **`write_report`를 다시 실행하지 않습니다**. 그리고 이번 턴에 빠져 있던 `save B`를 채운 뒤 여느 때처럼 모델의 마무리로 넘어갑니다. 작업 전체가 처음부터 다시 시작되는 일도 없었고, 리포트가 두 번 쓰이는 일도 없었습니다.

이 두 터미널 출력은 손으로 지은 예시가 아닙니다. 뒤의 '검증 하네스' 절에서 고정된 응답 큐로 구동되는 Node 스크립트의 실제 출력을 한 줄씩 그대로 옮긴 것입니다.

## 블록 하나씩 조립하기

### 체크포인트 읽고 쓰기: `saveCheckpoint` / `loadCheckpoint`

체크포인트는 이 장면 — `{version, task, turns, tokensUsed, messages, pendingToolUse}` — 을 디스크로 직렬화한 것일 뿐입니다. 주의할 것은 파일을 망가뜨리지 않는 것 하나뿐입니다. 먼저 임시 파일에 쓰고, 그다음 `fs.renameSync`로 원자적으로 갈아 끼웁니다. `rename`은 같은 파일 시스템 안에서 쪼갤 수 없는 연산이므로 '반쯤 쓰인' 중간 상태가 결코 생기지 않습니다.

```javascript
function saveCheckpoint(cp) {
  const tmp = CHECKPOINT_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cp, null, 2));
  fs.renameSync(tmp, CHECKPOINT_PATH);
}
```

읽기는 두 가지를 견뎌야 합니다. 파일이 없는 경우(한 번도 돌린 적이 없거나, 새로 시작하려는 경우), 그리고 파일이 파싱되지 않는 경우입니다. 두 번째가 특히 조심스럽습니다. `JSON.parse` 실패는 보통 직전의 쓰기 자체가 중단됐다는 뜻입니다(`saveCheckpoint`는 이론상 원자적이지만, `.tmp` 파일이 온전히 쓰이기도 전에 프로세스가 죽거나 디스크 자체에 문제가 있으면 `rename` 이전의 덜 끝난 파일이 잘못 읽힐 수 있습니다). 그 시점에 상태를 조용히 빈 것으로 되돌려 놓고 아무 일 없었다는 듯 구는 짓은 결코 해서는 안 됩니다. 작업이 정말로 사라지는 자리가 바로 거기입니다. 옳은 수는 에러를 있는 그대로 던져, 이 체크포인트는 더 이상 믿을 수 없으니 지우고 처음부터 다시 시작해야 한다고 사용자에게 알리는 것입니다. 프로그램이 추측으로 온전한 상태를 되짚어 가게 두지 마십시오.

```javascript
function loadCheckpoint() {
  let raw;
  try {
    raw = fs.readFileSync(CHECKPOINT_PATH, "utf8");
  } catch {
    throw new Error(`${CHECKPOINT_PATH}를 찾을 수 없습니다. --resume 할 대상이 없습니다`);
  }
  let cp;
  try {
    cp = JSON.parse(raw);
  } catch {
    throw new Error(
      `${CHECKPOINT_PATH} 파싱에 실패했습니다. 쓰기 도중에 중단된 파일일 수 있습니다. 계속 쓰지 말고 삭제한 뒤 --resume 없이 처음부터 다시 시작하세요. 절반만 쓰인 체크포인트는 추측으로 되살릴 수 없습니다.`,
    );
  }
  if (cp.version !== 1) {
    throw new Error(`${CHECKPOINT_PATH}의 version=${cp.version}입니다. 이 프로그램은 version=1만 받으며 로드를 거부합니다.`);
  }
  return cp;
}
```

하는 김에 `version` 필드도 확인하십시오. 나중에 체크포인트 구조가 바뀌었을 때 옛 파일을 새 형식으로 억지로 파싱해서는 안 됩니다. 절반은 맞고 절반은 틀린 상태를 읽어 내느니 로드를 거부하는 편이 낫습니다. 두 함수 모두 실제로 잘려 나간 JSON으로 시험했습니다. 반쯤 쓰인 `{"version":1,"turns":3,"pendingT`를 물리면 `loadCheckpoint`는 위의 '지우고 처음부터 다시 시작하라'는 에러를 정확히 던지며, 그럴싸해 보이는 기본값을 결코 돌려주지 않습니다.

### 지점 A와 지점 B: `runAgent` 루프에 배선하기

이 시리즈의 코스 7에서 온 루프 뼈대는 그대로입니다. `while (response.stop_reason === "tool_use")`, `push assistant` → 도구 실행 → `push tool_result` → 모델에 다시 요청. 이 레슨은 루프 본문에 체크포인트 둘을 끼워 넣는데, 그것이 어디에 놓이는지가 이 레슨의 요점 전부입니다.

```javascript
while (response.stop_reason === "tool_use") {
  if (turns >= MAX_TURNS) return `최대 ${MAX_TURNS}턴에 도달하여 스스로 멈춥니다`;
  turns++;

  const toolUseBlock = response.content.find((b) => b.type === "tool_use");
  // —— 지점 A: 모델 응답을 받은 직후, 이번 턴의 허공에 뜬 도구 호출을 기록한다 ——
  saveCheckpoint({
    version: 1, task, turns, tokensUsed, messages,
    pendingToolUse: { id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input },
  });

  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content);
  messages.push({ role: "user", content: toolResults });

  // —— 지점 B: 도구 결과가 messages에 들어갔고(원장도 디스크에 있다), 허공에 뜬 호출이 지워졌다 ——
  saveCheckpoint({ version: 1, task, turns, tokensUsed, messages, pendingToolUse: null });

  response = await client.messages.create({ tools, messages });
  tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
}
```

지점 A는 `response`가 도착한 뒤, `messages.push({ role: "assistant", ... })` 이전에 놓입니다. 모델이 '도구를 지명했지만 아직 실제로 실행하지는 않은' 그 순간이고, `pendingToolUse`가 그 지명을 그대로 기록합니다. 지점 B는 `runToolUses`가 끝나고 `tool_result`가 `messages`에 밀려 들어간 뒤에 놓입니다. 그 시점에 이번 턴은 완전히 마감되었고, `pendingToolUse`는 `null`로 지워집니다. 두 저장 사이에 끼인 것이 바로 도구가 실제로 실행되는 코드 구간입니다. 그 구간 중에, 또는 그 직후에 프로세스가 하필 죽는다면 디스크에 남는 것은 '지점 A는 저장됨, 지점 B는 저장되지 않음'이라는 장면입니다. `pendingToolUse`가 비어 있지 않은 것, 그것이 바로 복구 로직이 다루려고 만들어진 신호입니다.

이 '허공에 뜬 호출은 하나'라는 프로토콜(`pendingToolUse`는 배열이 아니라 객체 하나입니다)이 성립하도록, 이 레슨은 모델이 턴마다 정확히 하나의 도구만 지명하도록 작업을 설계했습니다. 의도적인 단순화이며, 그 경계는 '균형 감각' 절에서 짚습니다.

### 부수 효과 원장: `runToolUses`에 배선하기

원장이 푸는 문제는 이것입니다. '도구가 실제로 실행을 마쳤다'와 '결과가 messages에 내려앉았다' 사이에 크래시가 떨어졌을 때, 이 호출이 이미 돌았으므로 다시 돌려서는 안 된다는 것을 재개가 어떻게 아는가. 방법은, 도구가 성공한 그 순간 그 결과를 `tool_use_id`를 키로 삼는 원장에 따로 쓰는 것입니다(여기서도 임시 파일 더하기 `rename` 원자적 쓰기를 씁니다).

```javascript
function saveEffect(toolUseId, entry) {
  const effects = loadEffects();
  effects[toolUseId] = entry;
  const tmp = EFFECTS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(effects, null, 2));
  fs.renameSync(tmp, EFFECTS_PATH);
}

async function runToolUses(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    let output;
    try {
      output = await toolImpls[block.name](block.input);
    } catch (err) {
      results.push({
        type: "tool_result", tool_use_id: block.id,
        content: `도구 실행 에러: ${err.message}`, is_error: true,
      });
      continue;
    }
    // 부수 효과는 이미 일어났다: 원장 쓰기가 실패하더라도 is_error로 거짓말해서는 안 된다
    // (그러면 모델이 새 tool_use_id로 재시도해 중복된 부수 효과를 낳는다) — 사람이 처리하도록
    // 별도로 경보만 올린다
    try {
      saveEffect(block.id, { name: block.name, result: output, at: Date.now() });
    } catch (err) {
      console.error(`[원장 쓰기 실패] tool_use_id=${block.id}: 부수 효과는 이미 일어났고, 재개 시 중복 실행 위험이 있습니다. 직접 확인하세요`);
    }
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

순서는 바꿀 수 없습니다. **먼저 `toolImpls[block.name](block.input)`의 진짜 결과를 손에 넣어야 하고, 그러고 나서야 `saveEffect`가 그것을 적어 둘 수 있습니다** — 실행이 먼저, 기록이 나중입니다. 원장이 기록하는 것은 '이 일이 정말로 일어났고, 그 결과가 이것이다'입니다. 이것을 뒤집어 실행 전에 기록한다면 원장에 들어갈 수 있는 것은 자리 표시자뿐이고, 원장은 '이미 끝났다'는 약속이 지닌 의미를 통째로 잃습니다(레벨 2 연습에서 이 안티패턴을 직접 손으로 재현해 보게 됩니다).

정상적인 단발 실행에서 `runToolUses`는 '실행 → 기록'의 두 단계를 밟습니다. 각 `tool_use_id`가 처음 나타나므로 조회할 것이 없기 때문입니다. 재개가 다뤄야 하는 그 하나의 허공에 뜬 호출은 '원장 확인 → (필요하면) 실행 → (실행했다면) 기록'이라는 더 온전한 세 단계를 밟습니다. 아래의 `reconcile`이 그 세 단계의 구현이며, 둘은 같은 규율을 따릅니다. 진짜 결과를 손에 쥐기 전에는 결코 '이미 끝났다'를 원장에 쓰지 않는다는 것입니다.

### `reconcile`: 크래시 뒤 허공에 뜬 호출을 가르는 세 갈래

재개가 다뤄야 하는 것은 체크포인트 안의 그 하나(있다면)의 `pendingToolUse`입니다. 거기에는 세 가지 가능성이 대응합니다.

```javascript
async function reconcile(cp) {
  const pending = cp.pendingToolUse;
  if (!pending) return null; // 허공에 뜬 호출 없음, 그냥 이어 간다

  const effects = loadEffects();
  const hit = effects[pending.id];

  if (hit) {
    console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} 원장 히트, 결과 재사용, 재실행하지 않음`);
    return { type: "tool_result", tool_use_id: pending.id, content: hit.result };
  }

  if (READ_ONLY.has(pending.name)) {
    console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} 원장 미스, 읽기 전용 도구, 재실행`);
    const output = await toolImpls[pending.name](pending.input);
    saveEffect(pending.id, { name: pending.name, result: output, at: Date.now() });
    return { type: "tool_result", tool_use_id: pending.id, content: output };
  }

  console.log(`[resume][reconcile] tool_use_id=${pending.id} name=${pending.name} 부수 효과가 있는 도구의 원장 미스, 판단 불가, is_error 추가`);
  return {
    type: "tool_result", tool_use_id: pending.id, is_error: true,
    content: `이 ${pending.name} 호출의 재개 이전 실행 상태를 알 수 없습니다. 원장에 기록이 없고, 부수 효과 중복을 피하기 위해 재실행하지 않았습니다. 완료되었는지 직접 확인하세요.`,
  };
}
```

세 갈래이고, 셋 다 실제로 시험해 본 세 가지 상황에 대응합니다.

- **원장 히트** — 레슨 첫머리의 크래시 시연이 이것입니다. `write_report`는 실제로 실행을 마치고 기록까지 됐는데 `save B`만 닿지 못했습니다. 재개 시 원장에 있는 결과를 그대로 재사용하고 다시 실행하지 않아, 리포트가 두 번 쓰이는 것을 피합니다.
- **원장 미스 + 읽기 전용 도구** — `read_notes` 같은, 부수 효과가 없는 도구입니다. 기록이 내려앉기 전에 크래시가 나도 상관없으므로, 그냥 한 번 다시 실행해 결과를 얻고 하는 김에 이번 실행을 원장에 기록합니다.
  ```text
  [resume][reconcile] tool_use_id=toolu_ro name=read_notes 원장 미스, 읽기 전용 도구, 재실행
  ```
- **원장 미스 + 부수 효과 있음** — `write_report` 같은, 바깥 상태를 바꾸는 도구가 기록이 내려앉기 전에 크래시한 경우입니다. 실제로 돌았는지 알 수 없습니다(진짜 파일 시스템이라면 `write_report`의 부수 효과가 이미 일어났는데 원장에 기록만 안 됐을 수 있습니다). 여기서는 추측하는 대신 `is_error: true` `tool_result`로 '이 호출의 상태를 알 수 없다'고 모델에게 정직하게 알리고, 판단을 도로 넘깁니다.
  ```text
  [resume][reconcile] tool_use_id=toolu_side name=write_report 부수 효과가 있는 도구의 원장 미스, 판단 불가, is_error 추가
  ```

세 로그 줄 모두 지어낸 것이 아니라 실제 출력입니다. `reconcile` 자체는 작업이 무엇인지 알 필요가 없습니다. `pendingToolUse` 하나와 그에 맞는 원장 상태만 주면 세 갈래 각각을 독립적으로 시험할 수 있습니다.

```agentmentor-check
{
  "id": "sp-zh-06-a-point-necessity",
  "label": "지점 B 체크포인트만 남기는 것이 안전한지 판단하기",
  "prompt": "동료가 이 레슨의 두 체크포인트 위치를 보고 간소화를 제안합니다. '어차피 매 턴은 지점 B에서 온전한 스냅숏으로 끝나고, 지점 B는 지점 A가 담는 필드를 이미 전부 담고 있습니다. 그러니 지점 A는 빼고 루프 끝에서, 도구 결과가 messages에 들어가고 원장도 쓰인 뒤에 체크포인트를 한 번만 저장해서 디스크 쓰기를 하나 아끼죠.' 이 간소화는 성립합니까?",
  "whyHere": "reconcile의 세 갈래를 막 다뤘으므로, 바로 여기서 '지점 A를 빼자'는 구체적인 제안이 지점 A가 무엇을 기록하는지, 그리고 지점 B 혼자서는 왜 그 구멍을 메울 수 없는지를 독자가 정말로 이해했는지 시험합니다.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "성립하지 않습니다. 크래시가 '모델이 도구를 지명했다'와 '결과가 기록되었다' 사이에 떨어지면, 지점 B에만 사는 체크포인트는 그 호출에 대해 아무것도 모르므로, 재개 시 내놓을 짝 맞는 tool_result도 없고 확인할 원장 항목도 없습니다",
      "correct": true,
      "feedback": "정답입니다. 프로토콜은 모든 tool_use가 짝 맞는 tool_result와 함께 돌아올 것을 요구합니다. 체크포인트가 지점 B에서만 저장되고 크래시가 '모델이 도구 호출을 내놓았다'와 '결과가 커밋되었다' 사이의 창에 떨어지면, '이번 턴이 도구를 지명한 적이 있다'고 말해 주는 것이 디스크에 아무것도 없습니다. 원장에 항목이 없는 것이 아니라, 체크포인트 자체가 허공에 뜬 호출이 존재했다는 사실조차 모르는 것입니다. reconcile은 조회할 것도 없고 탈 갈래도 없습니다. 지점 A가 응답이 도착하는 순간 그 호출을 기록하는 것은 바로 그 창 안에서 무슨 일이 일어나든 기록으로 남기기 위해서입니다."
    },
    {
      "id": "b",
      "text": "성립합니다. 지점 B는 지점 A가 담는 필드를 이미 전부 담고 있으므로, 지점 A를 빼는 것은 디스크 쓰기 하나를 더 쓰느냐 마느냐일 뿐 기능 손실이 없고, 루프에서 안전하게 걷어낼 수 있습니다",
      "correct": false,
      "feedback": "이것을 '파일 쓰기 하나 줄이기'로 보는 것은 지점 A와 지점 B가 같은 것을 담고 있지 않다는 점을 놓친 것입니다. 지점 A는 '모델이 방금 이 도구를 지명했고 아직 처리되지 않았다'를 기록하고, 지점 B는 '이번 턴은 끝나 뒤로 넘어갔다'를 기록합니다. 지점 A를 빼면 잃는 것은 군더더기 쓰기가 아니라, 도구가 실행되는 동안의 창 전체를 기록할 능력이며, 그 창이야말로 프로세스가 죽임을 당할 가능성이 가장 높은 자리입니다."
    },
    {
      "id": "c",
      "text": "성립하지 않지만, 이유는 지점 B 체크포인트를 충분히 자주 쓰지 않는다는 데 있습니다. 도구가 도는 동안 이따금 지점 B 스냅숏을 몇 개 더 저장해 두어야 받침이 됩니다",
      "correct": false,
      "feedback": "문제는 지점 B를 얼마나 자주 저장하느냐가 아닙니다. 지점 B의 내용은 언제나 '이번 턴이 완료되었다'는 한 가지 상태만을 비춥니다. 지점 B 스냅숏을 몇 개를 찍든 전부 똑같은 '사후' 정보를 기록할 뿐, '도구가 돌고 있고 아직 끝나지 않았다'는 중간 상태는 결코 재구성할 수 없습니다. 모자란 것은 빈도가 아니라, '방금 지명되었고 아직 끝나지 않았다'는 사실 그 자체를 기록하는 전용 저장 지점입니다."
    }
  ]
}
```

### 진입점: `main()`의 `--resume`

마지막은 진입점입니다. `main()`이 내리는 결정은 딱 하나, 명령줄에 `--resume`이 있는가입니다. 있으면 `loadCheckpoint()`를 거쳐 복구하고, 없으면 지난번에 남은 체크포인트와 원장 파일을 치우고 새로 시작합니다. 이 정리 덕분에 `--resume` 없이 다시 시작하는 것은 언제나 깨끗한 출발이 되며, 이전 실행의 덜 끝난 장면에 오염되지 않습니다.

```javascript
async function main() {
  const resume = process.argv.includes("--resume");
  const task = "sales-notes.txt를 짧은 리포트로 만들어 report.txt에 써 주세요.";
  const tools = [];

  const client = resume ? makeStubClient([R4]) : makeStubClient([R1, R2, R3]);

  try {
    const result = await runAgent(client, task, tools, { resume });
    console.log(`[done] ${result}`);
  } catch (err) {
    if (err instanceof SimulatedCrash) {
      console.log(`[kill] ${err.message}`);
      process.exit(137);
    }
    throw err;
  }
}
```

`runAgent` 안에는 그에 맞는 두 갈래가 있습니다. `opts.resume`이 참이면 `loadCheckpoint()`를 부르고, `reconcile`을 돌리고, 정산된 결과가 있으면 그것을 `messages`에 밀어 넣고 지점 B 체크포인트를 하나 저장한 다음, 여느 때처럼 모델에 요청을 보냅니다. 거짓이면 옛 체크포인트와 원장을 `fs.rmSync`로 지우고 빈 `messages`에서 시작합니다. 실제 `agent.js`에서는 모델 클라이언트가 `@anthropic-ai/sdk`의 `client.messages.create({ model, max_tokens, tools, messages })`로 바뀌고, 구조의 나머지는 아무것도 달라지지 않습니다.

## 프로토콜을 인용하며

이 레슨의 두 설계 결정은 어느 쪽도 임의로 정해진 것이 아닙니다.

원장이 비어 있어 `reconcile`이 상태를 확신할 수 없을 때, 조용히 건너뛰는 대신 `is_error: true` `tool_result`를 덧붙이기로 한 것은 콘텐츠 블록 짝짓기에 대한 프로토콜의 강한 요구에 기댄 것입니다. 모든 `tool_use`는 짝 맞는 `tool_result`와 함께 돌아와야 하고, 한꺼번에 함께 돌려보내야 하며, 각각은 자기 `tool_use_id`로 주인을 밝혀야 합니다[^S4]. 지점 A 저장을 건너뛰면 재개 흐름은 그 호출이 있었다는 사실조차 모르게 되므로 애초에 그 짝짓기 규칙을 만족시킬 수 없습니다. `reconcile`이 존재하는 이유 전부는, 원장이 히트하든 미스하든 허공에 뜬 호출이 결국 짝 맞는 `tool_result`를 갖게 되도록 보장하는 데 있습니다.

'에러를 내고 처음부터'가 아니라 '재개하고 이어 가기'를 고른 것은 Anthropic 엔지니어링 팀이 자사 리서치 시스템 회고에서 서술한 것과 울립니다. 에러가 났을 때 그냥 재시작할 수는 없는데 "restarts are expensive and frustrating for users,"(재시작은 비싸고 사용자를 좌절시키기) 때문이며, 그래서 그들은 "built systems that can resume from where the agent was when the errors occurred"[^S1](에러가 일어났을 때 에이전트가 있던 자리에서 재개할 수 있는 시스템을 만들었다)는 것입니다. 같은 회고는 에이전트의 적응력이 결정론적 안전장치와 맞서는 대신 짝지어질 수 있다는 점도 짚으며, "the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints"[^S1](Claude 위에 지은 AI 에이전트의 적응력을 재시도 로직과 정기 체크포인트 같은 결정론적 안전장치와 함께)를 결합한다고 말합니다. 체크포인트는 '프로세스가 죽었다'는 결정론적 실패를 붙잡고, 모델의 적응력은 '원장으로 판단이 서지 않는다' 같은 코드가 딱 잘라 정할 수 없는 경우를 다룹니다. `reconcile`의 `is_error` 갈래가 둘이 만나는 자리입니다. 알 수 없는 상태에 대한 진실을 모델에게 알리고 확인할지 재시도할지 스스로 정하게 하는 것이며, "letting the agent know when a tool is failing and letting it adapt works surprisingly well"[^S1](도구가 실패하고 있음을 에이전트에게 알리고 적응하게 두는 것은 놀랄 만큼 잘 통한다)입니다.

## 검증 하네스

이 레슨의 두 터미널 시연은 실제로 프로세스를 죽여 무슨 일이 일어나는지 보는 방식에 기대지 않습니다. 그러면 크래시 타이밍이 실행마다 달라져 '크래시가 N번째 도구 호출 뒤에 일어났고 복구 동작이 옳다' 같은 겨냥된 단언을 할 수 없기 때문입니다. 방법은 모델 클라이언트를 정해진 순서대로 패를 내놓는 스텁으로 바꾸는 것입니다. `messages.create`가 불릴 때마다 미리 써 둔 응답을 차례로 하나씩 건네고, 큐가 마른 뒤에도 계속 부르면 그대로 던지는 응답 큐입니다. 그러면 작업이 몇 턴째에 어떤 도구를 부르는지, 모델이 언제 마무리하는지가 전부 실제 호출 한 번 때문에 흔들리지 않는 하드코딩된 상수가 됩니다.

'프로세스를 죽이는 것'은 환경 변수로 통제되는 `crashPoint(label)`입니다. `runToolUses`가 원장 쓰기를 마칠 때마다 '이번이 몇 번째 쓰기인지'를 문자열 레이블로 엮어 `CRASH_AFTER` 환경 변수와 비교하고, 일치하면 전용 `SimulatedCrash` 예외를 던집니다. 이로써 'N번째 도구 호출 뒤에 크래시'가 타이밍에 좌우되는 우연한 사건이 아니라 정확히 지정할 수 있는 정수가 됩니다. `main()`은 가장 바깥에서 이 예외 하나만 잡아 `[kill]` 로그 한 줄을 찍고 `137`(관례상 `SIGKILL`로 죽었음을 뜻하는 종료 코드)로 빠져나가므로, 시연이 흉한 스택 트레이스가 아니라 진짜 프로세스 킬처럼 읽힙니다.

이 '응답 큐로 내용을 고정하고, 레이블로 크래시 횟수를 고정한다'는 방법은 이 시리즈의 코스 8 "Context Engineering: Spending Finite Attention Where It Counts"의 레슨 6이 컨텍스트 엔지니어링을 검증할 때 쓴 것과 같은 발상입니다. 놓아두면 비결정적인 것들(이번에 모델이 무슨 말을 할지, 이번에 프로세스가 어디서 죽을지)을 먼저 고정된 양으로 떨어뜨리고, 그러고 나서야 복구 동작을 매번 다른 결과가 아니라 한 줄씩 단언할 수 있게 됩니다. 이 레슨이 세 갈래 — '원장 히트, 재실행하지 않음', '읽기 전용 도구의 원장 미스, 그대로 재실행', '부수 효과 있는 도구의 원장 미스, `is_error` 추가' — 에 더해 `loadCheckpoint`의 잘린 파일 견딤까지 검증할 수 있었던 것은 이 방법 덕분입니다. 어느 것도 종이 위에서 추론만 한 것이 아니라 실제 `node` 실행으로 하나씩 확인했습니다.

## 균형 감각: 모든 작업에 이것이 필요하지는 않습니다

이 레슨에서 용접한 장치 — 체크포인트 둘, 원장 하나, 세 갈래 `reconcile` — 는 여러 턴을 연달아 돌고 그 사이에 부수 효과가 있는 긴 작업을 위한 것입니다. 몇 초면 끝나고 실패하면 그냥 다시 돌리면 되는 작은 작업은 이 디스크 I/O와 상태 기계 일습을 짊어질 값어치가 없을 수 있습니다. 여기서는 이 시리즈의 코스 7 "에이전트 하네스 기초: 루프와 통제"가 인용한 것과 같은 균형 감각을 빌려 올 수 있습니다. 고려할 만한 것은 "you should consider adding complexity only when it demonstrably improves outcomes"[^S3](복잡도는 결과를 눈에 띄게 개선함이 증명될 때에만 더하는 것을 고려해야 한다)입니다. 이것은 '반드시 이렇게 해야 한다'는 딱딱한 규칙이라기보다, 시작하기 전에 스스로에게 던져 볼 물음입니다. 이 작업은 정말로 충분히 길고, 정말로 충분히 중요해서, 체크포인트를 유지할 값어치가 있는가?

이 레슨의 구현은 명시적인 경계도 둘 긋습니다. '배우고 나서 그대로 프로덕션에 떨어뜨리는' 것으로 여기지 않도록 소리 내어 말해 둘 값어치가 있습니다.

- 매 턴은 정확히 하나의 허공에 뜬 `pendingToolUse`를 다루며, 이는 모델이 턴마다 도구를 하나씩 지명하는 시연 작업에 맞춘 것입니다. 실제 환경에서는 모델 응답 하나가 동시에 여러 `tool_use` 블록을 실어 올 수 있고(이 시리즈의 코스 7의 `runToolUses`는 `Promise.all`로 그것들을 동시에 돌립니다), 이 레슨의 '허공에 뜬 호출 하나' 프로토콜을 허공에 뜬 호출들의 집합으로 넓히려면 `pendingToolUse`를 객체에서 배열로 바꾸고 각각에 대해 `reconcile`을 돌려야 합니다. 이 레슨은 하나의 허공에 뜬 호출에 대한 정산 논리를 먼저 분명히 건네주기 위해 그 복잡도의 층을 의도적으로 빼 두었습니다.
- 이 레슨의 체크포인트와 원장이 다스리는 것은 '한 프로세스가 한 작업을 돌리는' 것 하나입니다. 여러 세션이 상태를 어떻게 나누는지, 여러 프로세스가 같은 체크포인트를 동시에 건드리면 충돌하는지, 머신을 넘나드는 일관성은 어떻게 보장하는지 — 이것들은 멀티 세션 동시성과 분산 일관성의 몫이며, 이 레슨에도 이 코스의 범위에도 없습니다.

<!-- exercises -->
## 💻 연습

### 레벨 1: 크래시 순간 훈련 교범

한 턴 안에서 이 레슨의 체크포인트가 붙잡을 수 있는 '크래시 순간'은 많아야 셋입니다. ① 지점 A를 막 저장했고 도구는 실행을 시작하지 않은 때, ② 도구의 구현 함수는 이미 실행을 마쳤지만 원장은 아직 쓰이지 않은 때, ③ 지점 B를 막 저장한 때. 이 레슨이 구현한 `saveCheckpoint` / `saveEffect` / `reconcile`에 비추어 각 순간을 분명하게 적으세요. 크래시 뒤 `checkpoint.json`과 `effects.json`은 각각 어떤 상태인지, `--resume` 시 `reconcile`은 어느 갈래로 떨어지는지, 그리고 중단된 것이 읽기 전용이 아닌 부수 효과가 있는 도구(이를테면 `write_report`)였다면 ①과 ②의 디스크상 관측 가능한 상태가 같은지, 복구 동작이 같은지 — 만약 같다면 그것이 무엇을 말해 주는지.

<!-- rubric -->
- 순간 ①(지점 A 저장, 도구 미실행): `checkpoint.json`의 `pendingToolUse`가 이번 턴의 호출이고, `effects.json`에는 이 `tool_use_id`에 대한 기록이 없음. 재개 시 `reconcile`이 '원장 미스' 갈래를 탐 — 읽기 전용 도구는 그대로 재실행되고, 읽기 전용이 아닌 도구는 `is_error`를 받음
- 순간 ②(도구 실행 완료, 원장 미기록): `checkpoint.json`의 상태가 ①과 정확히 같고(`pendingToolUse`는 여전히 지점 A에서 저장된 그것), `effects.json`도 ①과 마찬가지로 기록이 없으므로, 재개 시 `reconcile`은 ①과 정확히 같은 갈래를 탐. '코드는 ①과 ②를 구별할 수 없다'를 반드시 짚어야 함 — ②에서는 도구가 실제로 실행을 마쳤지만(이를테면 `report.txt`가 이미 쓰였지만) 원장이 쓰이지 않았기 때문에 재개는 그것을 알 수 없는 상태로 취급하고, 읽기 전용이 아닌 도구는 그대로 재사용되는 대신 `is_error`를 받음. 도구가 성공한 그 즉시 원장을 쓰는 것은 바로 이 불확실성의 창을 최대한 좁히기 위함임
- 순간 ③(지점 B 저장): `checkpoint.json`의 `pendingToolUse`가 `null`이고 `messages`에는 이미 이번 턴의 `tool_result`가 들어 있음. `effects.json`에는 짝 맞는 기록이 있음. 재개 시 `reconcile(cp)`은 `pending`이 비어 있으므로 즉시 `null`을 돌려주고, `runAgent`는 '채우기' 단계를 하지 않고 온전한 `messages`로 곧장 모델에 다시 요청함

<!-- answer -->
순간 ①과 ②는 디스크에 정확히 같은 상태를 남깁니다. `checkpoint.json`의 `pendingToolUse`는 둘 다 지점 A에서 저장된 호출 서술 그대로이고, `effects.json`에는 둘 다 이 `tool_use_id`에 대한 기록이 없습니다(차이는 오직 ②에서는 도구가 실제로 실행을 마쳤다는 것뿐인데, 그 사실이 아직 어디에도 지속되지 않았습니다). `reconcile`은 디스크 위의 상태만 볼 뿐 메모리 안에서 무슨 일이 있었는지 모르므로, ①과 ②는 정확히 같은 갈래를 촉발합니다. 원장에서 그 도구를 읽어 낼 수 없으니, 읽기 전용으로 판정되면 그냥 한 번 다시 돌리고, 부수 효과가 있는 것으로 판정되면 감히 추측하지 않고 `is_error: true` `tool_result`를 모델에게 되돌립니다 — 중복된 부수 효과를 낳을지 모를 답을 추측하느니 불완전한 정보를 건네는 편이 낫습니다.

순간 ③은 완전히 다른 경로입니다. `pendingToolUse`가 이미 `null`이라 `reconcile`은 함수에 들어서는 순간 `null`을 돌려주고, `runAgent`의 `if (reconciled)` 검사가 거짓이 되어 '도구 결과를 덧붙이고 지점 B를 한 번 더 저장하는' 블록을 통째로 건너뛰며, 이미 온전한 `messages`로 곧장 다음 모델 요청으로 갑니다 — 복구 흐름이 보기에 이번 턴은 진작 마감된 것입니다.

<!-- hint -->
'코드가 볼 수 있는 것'과 '세계에서 실제로 일어난 것'을 먼저 따로 떼어 생각하세요. 순간 ②에서 도구는 분명히 실행을 마쳤지만, 그 사실이 `checkpoint.json`이나 `effects.json`에 쓰이지 않은 한 `reconcile`은 그것이 일어났음을 알 길이 없습니다.

<!-- hint -->
어느 갈래로 떨어지는지 정하는 데는 두 디스크 파일에서 온 값 둘이면 충분합니다. `cp.pendingToolUse`가 `null`인지, 그리고 `effects.json`에 이 `tool_use_id`가 있는지. ①②③ 각각에 대해 그 두 값을 먼저 적어 보면 갈래는 저절로 정해집니다.

### 레벨 2: 원장을 거꾸로 쓴 순서 실수 찾기

사고 보고서는 이렇게 적혀 있습니다. "사용자가 작업을 중단했고, `--resume` 뒤에 도구 하나가 건너뛰어졌습니다. 로그에는 '이미 완료됨'으로 찍혀 있는데, 이 도구는 실제로 실행된 적이 없고, 써야 했던 파일도 아예 존재하지 않습니다." 당시 프로덕션에서 돌던 `runToolUses`를 파 보니 이 레슨의 버전과 한 가지가 다릅니다.

```javascript
async function runToolUses_prod(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    saveEffect(block.id, { name: block.name, result: null, at: Date.now() });
    const output = await toolImpls[block.name](block.input);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

이 순서 실수를 찾아내고, 왜 그것이 '분명히 돌지 않은 도구가 완료된 것으로 취급되는' 결과를 낳는지 분명하게 설명하고, 순서를 고치세요. 그런 다음 이 레슨의 '검증 하네스' 절의 방법을 따라 재현하는 작은 스크립트를 작성하세요. `saveEffect`와 `toolImpls[block.name](...)` 사이에 환경 변수로 통제되는 모의 크래시 지점을 끼워 넣고 `node`로 실제로 돌리십시오. 잘못된 순서에서는 크래시 전에 이미 원장에 `result: null` 기록이 들어 있고, 순서를 고치면 같은 크래시 지점에서 원장에 이 `tool_use_id`에 대한 항목이 아예 없습니다.

<!-- rubric -->
- 버그를 지목함: `saveEffect`가 `toolImpls(...)` 앞에 놓여 있고, 그 시점에는 도구가 실제로 실행되지 않았으므로 진짜 `output`이 있을 수 없으며 자리 표시자(`result: null` 같은)만 밀어 넣을 수 있음
- 결과를 설명함: 크래시가 하필 원장 쓰기 뒤, 도구가 실제로 실행을 마치기 전에 떨어지면, 재개 시 `reconcile`이 원장을 확인해 이 자리 표시자 기록에 히트하고 '원장 히트, 결과 재사용, 재실행하지 않음'으로 판정함. 실제로 실행된 적 없는 호출을 완료된 것으로 취급하며, 원장이 '아직 실행되지 않음'을 정직하게 비추는 대신 `null` 결과로 `tool_result` 짝짓기 요구를 때움
- 올바른 순서를 제시함: 먼저 `await toolImpls[block.name](block.input)`로 진짜 결과를 얻어야 하고, 성공한 뒤에야 `saveEffect`를 불러 그 진짜 결과를 원장에 쓰고, 그다음 `tool_result`를 push함 — 실행과 기록의 순서는 바꿀 수 없음
- 스크립트로 검증함: `saveEffect`와 `toolImpls` 사이에 통제된 크래시 지점을 끼우고, 잘못된 순서와 고친 순서를 `node`로 돌려, 크래시 전에 `effects.json`에 이 `tool_use_id`가 이미 쓰였는지 관찰함 — 잘못된 순서에서는 쓰여 있고(`result`는 자리 표시자), 고친 뒤에는 없음

<!-- answer -->
버그는 `saveEffect(block.id, { ..., result: null, ... })`가 `const output = await toolImpls[block.name](block.input)`보다 먼저 쓰였다는 것입니다. 그 시점에 도구는 아직 불리지 않았고, 함수는 진짜 결과가 무엇인지 알 길이 없으며, `tool_use_id` 자리를 잡아 두려고 자리 표시자(여기서는 `null`)를 밀어 넣는 것밖에 할 수 없습니다. 원장 쓰기 뒤, `toolImpls`가 실제로 끝나기 전에 프로세스가 하필 죽임을 당하면, 디스크의 원장은 '이 `tool_use_id`에 이미 기록이 있다'고 말하지만 그에 해당하는 도구는 실제로 돈 적이 없습니다. 재개 시 `reconcile`은 원장에 이 id가 있는지만 확인하고, 찾아내고, '원장 히트'로 판정해 그 기록을 재사용합니다 — 그래서 실행된 적 없는 호출이 `null` 결과를 단 완료된 호출로 처리되며, 이것이 바로 사고 보고서의 '도구가 건너뛰어졌고, 로그에는 완료로 찍혔는데, 파일은 아예 없다'의 원인입니다.

고치는 방법은 순서를 '실행이 먼저, 기록이 나중'으로 되돌리는 것입니다.

```javascript
async function runToolUses(content) {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");
  const results = [];
  for (const block of toolUseBlocks) {
    const output = await toolImpls[block.name](block.input); // 먼저 실행해 진짜 결과를 얻는다
    saveEffect(block.id, { name: block.name, result: output, at: Date.now() }); // 그다음 기록한다
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }
  return results;
}
```

검증은 이 레슨의 '검증 하네스'를 본떠 작성할 수 있습니다. `block` 하나만 다루는 최소 스크립트를 쓰고, `saveEffect` 뒤(잘못된 버전)나 `toolImpls` 뒤(올바른 버전)에 환경 변수를 읽는 `crashPoint`를 끼워 넣고, `node`를 두 번 돌려, 크래시 뒤 `effects.json`에 이 `tool_use_id`가 있는지 비교하십시오. 잘못된 순서에서는 크래시 전에 이미 `result: null` 기록이 쓰여 있고, 올바른 순서에서는 크래시 전 원장에 아무것도 없습니다.

<!-- hint -->
원장에 기록이 있다는 것은 '이 도구가 정말로 실행을 마쳤고, 이것이 그 진짜 결과다'와 같은 말이어야 합니다. 거꾸로 생각해 보세요. 기록하는 단계가 실행보다 먼저 일어난다면, 그 기록이 여전히 이것을 보장할 수 있습니까?

<!-- hint -->
검증 스크립트를 짓는 데 `runAgent` 전체를 다시 세울 필요는 없습니다. 이 `block` 하나의 실행만 따로 떼어 내고, 환경 변수로 통제되는 `throw`를 끼워 넣고, 돌린 뒤 원장 파일을 읽어 이 id가 있는지 확인하기만 하면 됩니다.

<!-- /exercises -->

## 정리

- 체크포인트는 턴마다 두 번 저장한다. 지점 A는 모델 응답이 도착한 뒤 허공에 뜬 `pendingToolUse`를 기록하고, 지점 B는 도구 결과가 `messages`에 내려앉은 뒤 그것을 null로 지운다. 지점 B만 저장하면 '모델이 도구를 지명한다'와 '결과가 기록된다' 사이의 창이 체크포인트에서 완전히 보이지 않게 되고, 모든 `tool_use`는 짝 맞는 `tool_result`와 함께 돌아와야 하므로[^S4] 그 창 안의 허공에 뜬 호출을 추적 가능하게 만드는 것이 바로 지점 A다
- 부수 효과 원장은 `tool_use_id`로 기록하며, 그 규율은 '실행이 먼저, 기록이 나중'이다. 기록은 진짜 결과를 이미 손에 쥐었다는 것을 전제로 하며, 뒤집으면 '아직 돌지 않음'을 '이미 끝났음'으로 잘못 기록하게 된다
- `reconcile`의 세 갈래가 재개 시의 허공에 뜬 호출을 다룬다. 원장 히트면 재사용하고 다시 실행하지 않는다. 원장 미스이지만 읽기 전용이면 그대로 재실행한다. 부수 효과가 있는 도구의 원장 미스면 추측하지 않고 `is_error` `tool_result`를 덧붙여 상태를 모델에게 정직하게 되돌린다 — 이는 '에러가 나면 처음부터 다시 시작할 수 없고 난 지점에서 재개해야 한다'와 '도구가 실패했음을 모델에게 알리고 적응하게 두면 놀랄 만큼 잘 통한다'는 두 엔지니어링 교훈과 울리며[^S1], '결정론적 안전장치와 모델의 적응력을 짝짓는다'는 발상과 맞아떨어진다[^S1]
- 체크포인트와 원장 장치는 공짜가 아니다. 복잡도가 결과를 눈에 띄게 개선함이 증명될 때에만 더하라[^S3]. 이 레슨의 구현은 '한 프로세스가 한 작업을 돌리는' 것만 다스리며, 멀티 세션 동시성과 분산 일관성은 그 관심사도 아니고 이 코스의 범위도 아니다

여러분은 이제 이 코스를 마쳤습니다. '에이전트는 상태를 가지며 에러가 누적된다'는 판단에서 출발해, 체크포인트가 무엇을 저장해야 하는지, 언제 디스크에 써야 하는지, 재개 시 허공에 뜬 호출을 어떻게 다루는지, 멱등성이 복구를 어떻게 받치는지, 그리고 체크포인트가 되감기와 분기까지 어떻게 떠받칠 수 있는지를 끝까지 밟아 왔습니다. 그리고 이 레슨에서는 그것들을 직접 손으로 용접해, 정말로 돌고, 정말로 죽임을 당하고, 정말로 다시 주워 올려져 끝까지 완주하는 하네스를 만들었습니다. 지금 여러분이 쥔 것은 개념 묶음이 아니라 실제 `node` 실행으로 검증된 코드 한 벌입니다. 여러분 자신의 하네스에 이것을 배선해 두면, 다음번에 그것이 정말로 죽임을 당했을 때 멈춘 자리에서 곧바로 다시 주워 올릴 것입니다.
