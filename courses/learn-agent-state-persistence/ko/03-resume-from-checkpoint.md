# 레슨 3: 체크포인트에서 재개하기: 루프를 다시 일으키기

> 학습 목표:
> - 크래시 복구 장면에서 '허공에 뜬 호출'이 반드시 나타나는 이유와, 그것이 평범한 도구 실행 실패와 어떻게 다른 것인지 말하기
> - `loadCheckpoint()`에서 루프로 되돌아가는 완전한 재개 경로를, 버전 검사와 상태 재구성까지 포함해 쓰기
> - 허공에 뜬 호출을 맹목적으로 다시 실행하거나 맹목적으로 지우는 대신, 도구의 성질에 따라 정산하기 — 읽기 전용 도구는 그대로 다시 실행하고, 영향이 큰 도구는 먼저 폴백하기
>
> 전제: 레슨 2를 마치고 `checkpoint.json`의 필드와 두 저장 지점을 이해하고 있어야 합니다 | 이전: [레슨 2 <<](./02-checkpoint-anatomy.md) | 다음: [레슨 4 >>](./04-side-effects-idempotency.md)

## 재시작이 아니라 재개입니다

에이전트가 도중에 크래시하면 첫 반응은 대개 '한 번 더 돌리자'입니다. 하지만 이미 십몇 턴을 밀고 나갔고 도구를 여러 번 호출한 긴 작업에서 재시작은 나쁜 거래입니다. "restarts are expensive and frustrating for users"[^S1](재시작은 비싸고 사용자를 좌절시킨다). 레슨 2는 실행 장면을 `checkpoint.json`에 써 냈습니다. `version`, `task`, `turns`, `tokensUsed`, `messages`, `pendingToolUse`를, 모델이 응답한 뒤(저장 지점 A)와 도구 결과가 기록된 뒤(저장 지점 B)에 한 번씩 떨어뜨리는 방식이었습니다. 이 레슨이 하는 일은 저장된 그 장면을 앞으로 나아갈 수 있는 루프로 되돌리는 것입니다. 매번 처음부터 다시 시작하는 대신 "resume from where the agent was when the errors occurred"[^S1](에러가 발생했을 때 에이전트가 있던 지점에서 재개한다) 할 수 있는 시스템을 만드는 것입니다.

## 재개의 뼈대: 쉬운 절반

쉬운 쪽부터 시작합시다. 재개의 뼈대는 네 단계입니다. 파일을 읽고, `JSON.parse`하고, `version`을 검사하고, 필드들을 런타임 상태로 펼쳐 넣는 것입니다. 이 넷이 끝나면 `runAgent`는 초기 `messages` 배열을 다시 구성할 필요가 없습니다. 체크포인트가 이미 완전한 것을 담고 있으므로, 초기화를 건너뛰고 곧장 루프로 떨어집니다.

```javascript
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const CHECKPOINT_PATH = "./checkpoint.json";
const CHECKPOINT_VERSION = 1;
const MAX_TURNS = 40;

function saveCheckpoint(state) {
  const tmpPath = `${CHECKPOINT_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, CHECKPOINT_PATH); // .tmp + rename: 쓰기를 그르쳐도 마지막으로 쓸 수 있는 체크포인트를 망가뜨릴 수 없다
}

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  const raw = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
  if (raw.version !== CHECKPOINT_VERSION) {
    throw new Error(`Checkpoint version mismatch: file is v${raw.version}, code is v${CHECKPOINT_VERSION}`);
  }
  return raw; // { version, task, turns, tokensUsed, messages, pendingToolUse }
}
```

이 두 함수가 자리를 잡으면 `runAgent`의 첫머리는 단순한 분기가 됩니다.

```javascript
async function runAgent(task) {
  const cp = loadCheckpoint();

  let state;
  if (cp) {
    // 재개: state는 체크포인트에서 온다. pendingToolUse는 잠시 뒤에 다룬다
    state = cp.pendingToolUse ? await reconcile(cp) : cp;
  } else {
    // 새로 시작: 첫 user 메시지를 손으로 쓰고, 나머지는 0으로 둔다
    state = {
      version: CHECKPOINT_VERSION,
      task,
      turns: 0,
      tokensUsed: 0,
      messages: [{ role: "user", content: task }],
      pendingToolUse: null,
    };
  }

  while (state.turns < MAX_TURNS) {
    state.turns++;
    const response = await client.messages.create({ messages: state.messages });
    state.tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    state.messages.push({ role: "assistant", content: response.content });

    const toolUseBlock = response.content.find((b) => b.type === "tool_use");
    state.pendingToolUse = toolUseBlock
      ? { id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input }
      : null;
    saveCheckpoint(state); // 저장 지점 A: 모델 응답 뒤

    if (response.stop_reason !== "tool_use") break;

    const output = await executeTool(toolUseBlock.name, toolUseBlock.input);
    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseBlock.id, content: output }],
    });
    state.pendingToolUse = null;
    saveCheckpoint(state); // 저장 지점 B: 도구 결과가 기록된 뒤
  }

  return state;
}
```

재개한 뒤 루프가 가장 먼저 하는 일은 늘 하던 바로 그것입니다. `state.messages`를 집어 다음 `client.messages.create()`를 쏘는 것입니다. 모델이 보는 `messages`는 크래시 이전에 보던 것과 동일하며, 그 사이에 프로세스 재시작이 있었다는 것을 모델은 전혀 모릅니다. 레슨 2가 `messages`를 손대지 않은 채로 체크포인트에 넣으라고 고집한 이유가 이것입니다. 그 배열만 충실히 복원되면 재개는 모델에게 보이지 않습니다.

## 어려운 절반: 허공에 뜬 호출을 정산하기

진짜 골칫거리는 `state.pendingToolUse`가 `null`이 아닌 체크포인트입니다. 두 저장 지점이 어디에 있었는지 떠올려 보세요. 지점 A는 모델 응답 뒤에 오고, 그 순간 `pendingToolUse`는 이번 응답의 `{id, name, input}`을 담고 있습니다. 지점 B는 도구 결과가 기록된 뒤에 오고, 거기서 `pendingToolUse`는 `null`로 지워집니다. 프로세스가 A와 B의 정확히 사이에서 죽으면 — 도구가 아직 실행되지 않았거나, 끝났지만 결과가 `messages`에 끝내 들어가지 못했다면 — 체크포인트가 간직하는 것은 `null`이 아닌 `pendingToolUse`입니다.

이제 `messages`의 끝은 `tool_use` 블록을 실은 `assistant` 메시지이고, 짝이 되는 `tool_result`가 없습니다. 이것은 끌고 나갈 수 있는 상태가 아닙니다. 프로토콜은 이렇게 요구합니다. "return one tool_result for each tool_use block, all together in the next user message"[^S4](tool_use 블록 하나당 tool_result 하나를, 다음 user 메시지에 함께 모아 돌려주라). 그 결과 하나가 없으면 재개는 다음 호출을 아예 할 수 없습니다. 모델에게 보이는 것은 자기가 도구 호출을 일으켰는데 답은 영영 오지 않는, 반쯤 끝난 주고받기입니다. 이 허공에 뜬 호출은 루프에 재진입하기 전에 처리해야 합니다.

## 세 가지 수, 성립하는 것은 하나

허공에 뜬 이 `assistant` 메시지를 앞에 두면 떠오르는 수는 셋이지만, 실제로 성립하는 것은 하나뿐입니다.

**첫 번째 수: `messages`에서 그 `assistant` 메시지를 지우고 없었던 일로 하기.** 가장 깔끔해 보입니다. 재개된 대화에는 더 이상 빈틈이 없습니다. 하지만 대가는 두 겹으로 옵니다. 첫째, 모델은 자기가 이미 내린 판단을 잊어버리므로 같은 탐색을 처음부터 다시 밟으며 한 턴을 헛되이 태울 수 있습니다. 둘째, 그리고 더 위험하게는, 그 도구 호출이 실제로 이미 실행되었고 프로세스가 결과를 기록하기 직전에 죽은 것이라면, 메시지를 지운다고 해서 이미 일어난 부수 효과가 되돌려지지는 않습니다. 다만 모델과 이후의 모든 로그가 그 일이 있었다는 사실을 아예 모르게 될 뿐입니다. 삭제는 위험이 아니라 사실을 감춥니다.

**두 번째 수: 그냥 도구를 다시 실행해서 결과를 `tool_result`에 채워 넣기.** 읽기 전용 도구(`read_file`, `grep` 같은 것)라면 이것이 정확히 옳습니다. 두 번 읽는 것은 한 번 읽는 것과 다르지 않고 부수 효과는 0입니다. 영향이 큰 도구(메일 보내기, 데이터베이스에 쓰기)라면 위험합니다. 그 도구는 이미 한 번 실행되었을 가능성이 매우 높고, 조건 없이 다시 실행하는 것은 두 번째로 실행하는 일입니다. 이것이 바로 레슨 4가 통째로 다루는 멱등성 문제입니다. 지금 이 레슨은 당장 실행에 옮길 수 있는 규칙 하나를 세워 둡니다. **읽기 전용 도구는 그대로 다시 실행한다. 영향이 큰 도구는 다시 실행할지 정하기 전에 이미 실행되었는지부터 확인해야 한다.**

**세 번째 수: '실행 상태 불명, 다시 평가해 달라'고 말하는 `is_error: true`의 `tool_result`를 덧붙이고 판단을 모델에게 되돌려주기.** 실행 여부를 가릴 수 없을 때 쓰는 보수적인 폴백입니다. `is_error` 필드는 바로 이것을 위해 있습니다. "Set to true if the tool execution resulted in an error"[^S4](도구 실행이 에러로 끝났다면 true로 설정하라). 그리고 알고 보면 "letting the agent know when a tool is failing and letting it adapt works surprisingly well"[^S1](도구가 실패하고 있음을 에이전트에게 알려 주고 스스로 적응하게 두는 것은 놀랄 만큼 잘 통한다). 모델은 컨텍스트를 다시 읽고 다른 방법으로 결과를 확인할지 결정하며, 소리 없이 되풀이되었을지 모를 행동에 데이지 않습니다.

셋을 나란히 놓으면 첫 번째 수는 탈락합니다. 두 번째와 세 번째는 각각 '가릴 수 있는' 경우와 '가릴 수 없는' 경우를 맡고, 둘이 함께여야 비로소 완전한 정산 규칙이 됩니다.

```agentmentor-check
{
  "id": "sp-zh-03-dangling-tool-use",
  "label": "허공에 뜬 호출을 다루는 법",
  "prompt": "재개할 때 체크포인트의 pendingToolUse가 null이 아님을 발견했습니다. 마지막 assistant 메시지에 tool_use가 들어 있는데 짝이 되는 tool_result가 없습니다. 누군가 가장 깔끔한 수는 그 assistant 메시지를 messages에서 지우고 없었던 일로 하는 것이며, 그러면 재개된 대화에 빈틈이 없다고 주장합니다. 맞는 말입니까?",
  "whyHere": "세 가지 수를 막 늘어놓은 직후에 놓여 있습니다. 그중 삭제가 가장 유혹적인 수입니다. 허공에 뜬 assistant 메시지를 지우는 것이 왜 안전한 선택지가 아닌지 보이는지 확인합니다.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "아닙니다. 둘을 함께 지우면 모델은 이미 내린 판단을 잊고, 실제로 일어난 부수 효과를 감출 수 있습니다. 옳은 수는 tool_use를 지우는 것이 아니라 도구의 성질에 따라 정산해 짝이 되는 tool_result를 공급하는 것입니다",
      "correct": true,
      "feedback": "정답입니다. 삭제의 대가는 두 겹입니다. 모델이 이미 한 일을 다시 탐색할 수 있고, 더 위험하게는 그 도구가 실제로 이미 실행되었다면 삭제는 그 사실을 대화에서도 이후의 모든 판단에서도 사라지게 만들 뿐입니다. 프로토콜은 모든 tool_use에 짝이 되는 tool_result를 요구하며, 지우는 대신 정산하는 것이 이어 갈 수 있는 상태로 돌아가는 길입니다."
    },
    {
      "id": "b",
      "text": "맞습니다. messages에 짝 없는 tool_use가 더 이상 남아 있지 않게 되면, 재개된 대화는 깔끔하고 이어 가기에도 안전합니다",
      "correct": false,
      "feedback": "'빈틈이 없다'는 표면만 깨끗한 것입니다. 그 도구 호출이 실제로 이미 실행되었다면(예를 들어 메일이 이미 나갔다면), 메시지를 지운다고 일어난 일이 되돌려지지는 않습니다. 모델과 로그가 그 일을 알지 못하게 될 뿐입니다. 위험은 제거된 것이 아니라 가려진 것입니다."
    },
    {
      "id": "c",
      "text": "맞습니다. 읽기 전용 도구든 영향이 큰 도구든 결국에는 모두 모델에게 다시 묻게 되므로, 낡은 tool_use를 버려도 실질적인 영향은 없습니다",
      "correct": false,
      "feedback": "두 종류의 도구는 같은 방식으로 다루지 않습니다. 읽기 전용 도구는 그대로 다시 실행해 진짜 결과를 가져와야 하고, 이미 실행되었는지 가릴 수 없는 영향이 큰 도구는 is_error로 폴백해야 합니다. 두 경로 모두 허공에 뜬 tool_use에 짝이 되는 tool_result를 공급하며 끝납니다. 어느 쪽도 그것을 지우지 않고, 어느 쪽도 일률적으로 모델에게 다시 묻고 마는 것이 아닙니다."
    }
  ]
}
```

## reconcile(cp): 정산을 코드로 옮기기

이 규칙을 함수로 만듭니다. 도구 이름에서 읽기 전용인지 판정하고, 그렇다면 다시 실행합니다. 그렇지 않다면 '부수 효과 원장'을 보러 가서 이 호출이 이미 실행되었는지 확인합니다. 이 레슨에는 아직 부수 효과 원장이 없으므로 주석이 대역을 서고, 실제 구현은 레슨 4가 줍니다. 가릴 수 없을 때는 `is_error` 폴백으로 떨어뜨립니다.

```javascript
const READ_ONLY_TOOLS = new Set(["read_file", "grep", "list_dir", "web_search"]);

async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  let toolResult;
  if (READ_ONLY_TOOLS.has(name)) {
    // 읽기 전용 도구: 부수 효과가 0이므로 그대로 다시 실행해 진짜 결과를 가져온다
    const output = await executeTool(name, input);
    toolResult = { type: "tool_result", tool_use_id: id, content: output };
  } else {
    // 영향이 큰 도구: 먼저 부수 효과 원장을 확인해 이미 실행되었는지 본다(원장은 레슨 4에서 도입. 여기서는 대역)
    // const record = await ledger.checkExecuted(id);
    // if (record) toolResult = { type: "tool_result", tool_use_id: id, content: record.result };
    // else toolResult = { type: "tool_result", tool_use_id: id, content: await executeTool(name, input) };
    //
    // 이 레슨에서는 원장을 잇지 않았다. 가릴 수 없을 때는 보수적인 폴백을 쓴다:
    toolResult = {
      type: "tool_result",
      tool_use_id: id,
      content: "실행 상태 불명: 이 호출이 끝나기 전에 프로세스가 크래시해서 효력이 발생했는지 확인할 방법이 없습니다. 현재 상황을 다시 평가해 주십시오.",
      is_error: true,
    };
  }

  messages.push({ role: "user", content: [toolResult] });
  cp.pendingToolUse = null;
  return cp;
}
```

`reconcile()`이 끝나면 `cp.messages`의 끝에는 짝이 되는 `tool_result`가 채워지고 `cp.pendingToolUse`는 `null`로 돌아가 있습니다. 이제 이 `cp`는 저장 지점 B에서 정상적으로 착지한 체크포인트와 구별되지 않으며, 그대로 `while` 루프로 넘겨 이어 갈 수 있습니다.

## 재개한 뒤: turns와 tokensUsed 세기

재개 경로가 어긋내기 쉬운 카운터가 둘 있고, 따로 짚어 둘 가치가 있습니다.

`turns`는 재개할 때 초기화되지 않습니다. 이것은 '이번 프로세스 인스턴스가 몇 턴을 돌았는가'가 아니라 작업이 시작부터 지금까지 돈 총 턴 수를 셉니다. 체크포인트의 `turns`는 멈춘 자리에서 계속 올라가야 하며, 그래야만 레슨 2에서 설정한 `MAX_TURNS` 상한이 제 일을 계속합니다. 재개할 때 `turns`를 0으로 밀어 버리면, 크래시와 복구를 되풀이하는 작업은 턴 천장을 피해 영원히 돌 수 있게 됩니다.

`tokensUsed`도 같은 식으로 동작합니다. 다시 계산하는 것이 아니라 체크포인트에서 이어받습니다. "Context Engineering: Spending Finite Attention Where It Counts"가 컨텍스트 압축을 다룰 때 `tokensUsed`가 뜻하는 것은 '현재 윈도우의 사용량'이고, 체크포인트가 저장한 것이 바로 크래시 순간의 그 윈도우 사용량입니다. 둘은 같은 뜻을 지니므로, 재개할 때는 그것을 받아 이어 가면 되고 별도의 변환은 필요 없습니다.

<!-- exercises -->
## 💻 연습

### 레벨 1: 세 개의 체크포인트, 세 가지 재개 행동

아래는 재개 시점에 읽어 들인 세 개의 체크포인트입니다(읽기 편하도록 `messages`의 내용은 생략했습니다). 각각에 대해 `runAgent`가 재개할 때 무엇을 해야 하는지, 그리고 왜 그런지 쓰세요.

```javascript
// 체크포인트 A
const cpA = {
  version: 1,
  task: "이번 주 회의록을 하나로 정리해 줘",
  turns: 6,
  tokensUsed: 18420,
  messages: [/* … 마지막은 평문 텍스트의 assistant 응답 … */],
  pendingToolUse: null,
};

// 체크포인트 B
const cpB = {
  version: 1,
  task: "이번 주 회의록을 하나로 정리해 줘",
  turns: 7,
  tokensUsed: 19310,
  messages: [/* … 마지막은 tool_use를 담은 assistant 메시지 … */],
  pendingToolUse: { id: "toolu_01A", name: "read_file", input: { path: "./notes/meeting-08-25.md" } },
};

// 체크포인트 C
const cpC = {
  version: 1,
  task: "결론을 팀에 메일로 알려 줘",
  turns: 9,
  tokensUsed: 24003,
  messages: [/* … 마지막은 tool_use를 담은 assistant 메시지 … */],
  pendingToolUse: { id: "toolu_01B", name: "send_email", input: { to: "team@example.com", subject: "이번 주 결론" } },
};
```

<!-- rubric -->
- cpA: `pendingToolUse`가 `null`이므로 크래시가 저장 지점 B 이후, 다음 `create()` 이전에 떨어졌다는 뜻임. 재개할 때는 `messages`를 집어 다음 호출을 쏘면 되고 정산은 필요 없음
- cpB: `pendingToolUse`가 `read_file`을 가리키며, 이는 부수 효과가 0인 읽기 전용 도구임. 재개할 때 그대로 다시 실행해 결과를 얻고 `tool_result`에 채운 뒤 이어 감
- cpC: `pendingToolUse`가 `send_email`을 가리키며, 이는 조건 없이 다시 실행할 수 없는 영향이 큰 도구임. 이 레슨에는 아직 부수 효과 원장이 없으므로, 메일을 다시 보내는 대신 `is_error`로 폴백해 모델에게 사실('실행 상태 불명')을 말해 줌

<!-- hint -->
1. 먼저 `pendingToolUse`가 `null`인지 확인하세요. `null`이라면 정산은 아예 개입하지 않으며, 문제는 사실 나머지 둘에 관한 것입니다. 2. 그다음 도구 이름을 보세요. `READ_ONLY_TOOLS`에 있습니까? 3. '이미 실행되었는가?'를 가릴 수 없는 영향이 큰 도구만이 다시 실행이 아니라 폴백을 부릅니다.

<!-- answer -->
cpA에는 정산이 필요 없습니다. `pendingToolUse`가 `null`이라는 것은 크래시가 저장 지점 B 이후에 떨어졌고 `messages`가 완전하다는 뜻이며, 재개할 때는 그것으로 다음 `client.messages.create()`를 곧장 쏘면 됩니다. cpB에는 다시 실행이 필요합니다. `read_file`은 읽기 전용 도구여서 되풀이해도 부수 효과가 생기지 않으며, 재개할 때 `reconcile()`을 부르면 자연스럽게 `READ_ONLY_TOOLS` 분기로 떨어져 진짜 파일 내용을 얻어 `tool_result`에 채웁니다. cpC는 다시 실행할 수 없습니다. `send_email`은 영향이 큰 도구이고 이미 한 번 실행되었을 가능성이 매우 높으며, 조건 없이 다시 실행하면 팀에 같은 메일이 한 통 더 도착합니다. 이 레슨에는 실행 여부를 확인할 부수 효과 원장이 아직 없으므로, `reconcile()`은 `is_error` 폴백 분기로 떨어져 다시 보내는 대신 '실행 상태 불명이니 다시 평가해 달라'는 정직한 내용을 모델에게 건네야 합니다.

### 레벨 2: 중복 메일의 근본 원인 찾기

어느 운영 장애 보고서입니다. "`send_email` 도구 호출 뒤, 결과가 기록되기 전에 OOM 킬러가 프로세스를 죽이고 다시 띄웠다. 다시 뜬 하네스는 자동으로 `--resume`했고, 몇 분 뒤 사용자가 동일한 메일을 두 통 받았다고 신고했다."

당시 프로덕션에서 돌던 `reconcile()`은 이랬습니다.

```javascript
// 장애가 일어났을 때 프로덕션에서 돌던 버전
async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  const output = await executeTool(name, input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: id, content: output }],
  });
  cp.pendingToolUse = null;
  return cp;
}
```

근본 원인을 짚어 내고, 이 `reconcile()`을 도구의 성질에 따라 갈라 보내는 버전으로 다시 쓰세요(힌트: 이 레슨이 세운 규칙은 '읽기 전용은 그대로 다시 실행, 원장이 없는 영향이 큰 도구는 `is_error`로 폴백'입니다). 다시 쓴 뒤에는 `node`로 돌려, `send_email` 같은 영향이 큰 도구가 더 이상 `executeTool()`을 일으키지 않는지 확인하세요.

<!-- rubric -->
- 근본 원인: `reconcile()`이 읽기 전용 도구와 영향이 큰 도구를 가리지 않고 모든 `pendingToolUse`에 대해 `executeTool()`을 불러 다시 실행함. `send_email`은 크래시 이전에 이미 한 번 실행되었을 가능성이 매우 높으므로, 조건 없는 재실행은 그것을 두 번째로 실행해 메일을 두 통 보냄
- 수정: `READ_ONLY_TOOLS` 집합을 들여와 도구 이름으로 갈라 보냄. 읽기 전용 도구만 `executeTool()`을 불러 다시 실행할 수 있고, 영향이 큰 도구(`send_email` 같은)는 더 이상 조건 없이 재실행되지 않으며 '실행 상태 불명'의 판단을 모델에게 되돌려주는 `is_error: true`의 `tool_result`를 받음
- 다시 쓴 코드에서 `read_file` 같은 호출과 `send_email` 같은 호출이 서로 다른 두 경로를 타야 하되, 두 경로 모두 `messages`에 짝이 되는 `tool_result`를 공급하며 끝나야 함. 그러지 않으면 재개가 대화를 정상적으로 이어 갈 수 없음

<!-- answer -->
근본 원인은 `reconcile()`이 도구를 부수 효과로 가리지 않은 채 모든 `pendingToolUse`를 '다시 실행해도 안전한 것'으로 취급한 데 있습니다. `send_email`은 크래시 이전에 이미 메일을 보냈을 가능성이 가장 높고, 프로세스는 그저 결과를 `messages`에 기록하는 데까지 이르지 못했을 뿐입니다. 재개할 때 `executeTool("send_email", …)`을 한 번 더 부르는 것은 같은 메일을 진짜로 두 번째 보내는 일입니다. 고친 버전은 도구 이름으로 갈라 보내야 합니다.

```javascript
const READ_ONLY_TOOLS = new Set(["read_file", "grep", "list_dir", "web_search"]);

async function reconcile(cp) {
  const { pendingToolUse, messages } = cp;
  const { id, name, input } = pendingToolUse;

  let toolResult;
  if (READ_ONLY_TOOLS.has(name)) {
    const output = await executeTool(name, input);
    toolResult = { type: "tool_result", tool_use_id: id, content: output };
  } else {
    toolResult = {
      type: "tool_result",
      tool_use_id: id,
      content: "실행 상태 불명: 이 호출이 끝나기 전에 프로세스가 크래시해서 효력이 발생했는지 확인할 방법이 없습니다. 현재 상황을 다시 평가해 주십시오.",
      is_error: true,
    };
  }

  messages.push({ role: "user", content: [toolResult] });
  cp.pendingToolUse = null;
  return cp;
}
```

고친 뒤에는 `READ_ONLY_TOOLS`에 없는 `send_email` 같은 도구가 다시는 `executeTool()`을 일으키지 않습니다. `reconcile()`은 그것에 `is_error`의 `tool_result`만 공급하고, `read_file` 같은 읽기 전용 도구만 실제로 다시 실행됩니다. `node`로 돌려 `reconcile()`을 읽기 전용 도구 이름으로 한 번, `send_email`로 한 번 부른 뒤 `executeTool` 호출 로그를 확인하세요. 읽기 전용 실행에서는 나타나고 `send_email` 실행에서는 나타나지 않아야 합니다.
<!-- /exercises -->

## 정리

재개의 뼈대는 어렵지 않다. 체크포인트를 읽고, 버전을 검사하고, 필드를 런타임 상태로 펼쳐 넣고, 초기화를 건너뛰어 곧장 루프로 떨어지면 된다 — 그 사이에 크래시가 있었다는 것을 모델은 느끼지도 못한다. 실제로 설계를 요하는 것은 허공에 뜬 호출의 정산이다. 삭제는 판단을 잃게 하고 이미 일어난 부수 효과를 가린다. 읽기 전용 도구라면 마음 놓고 다시 실행할 수 있다. 그리고 이미 실행되었는지 가릴 수 없는 영향이 큰 도구에는, 맹목적인 재실행보다 `is_error` 폴백이 더 안전한 선택이다. 하지만 이 규칙은 아직 한 문제를 풀지 못한 채로 둔다. 영향이 큰 도구가 이미 실행되었는지를 실제로 어떻게 확인할 것인가? 이 레슨은 '가릴 수 없다'로 폴백했을 뿐이다. 정말로 가릴 수 있으려면 부수 효과 원장이 있어야 한다 — 그리고 그것이 바로 다음 레슨이 푸는 문제다.

[>> 레슨 4: 부수 효과와 멱등성: 재개 시 다시 실행해도 안전한 도구는 무엇인가](./04-side-effects-idempotency.md)
