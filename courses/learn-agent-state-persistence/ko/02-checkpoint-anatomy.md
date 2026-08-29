# 레슨 2: 체크포인트: 실행 장면을 디스크에 쓰기

> 학습 목표:
> - checkpoint.json에 들어가야 할 여섯 필드를 대고, 각각이 빠졌을 때 재개가 무엇에 부딪히는지 말하기
> - 한 번의 루프 턴 안에 있는 두 저장 지점(모델이 도구를 지명한 뒤, 도구 결과가 기록된 뒤)을 가려내고, 그중 하나만 쓰면 무엇을 자초하는지 설명하기
> - 체크포인트 파일 자체를 망가뜨릴 수 없는 `saveCheckpoint` 쓰기 — 제자리에서 덮어쓰는 대신 임시 파일에 쓰고 원자적으로 이름을 바꾸기
>
> 전제: 레슨 1을 읽고 메모리와 실행 상태를 가려낼 수 있으며, "에이전트 하네스 기초: 루프와 통제"의 `messages` 배열과 `stop_reason` 구동 루프 뼈대에 익숙해야 합니다 | 이전: [레슨 1 <<](./01-memory-vs-state.md) | 다음: [레슨 3 >>](./03-resume-from-checkpoint.md)

## 실행 장면은 기본적으로 메모리에 있습니다

레슨 1은 메모리와 실행 상태를 떼어 놓았습니다. 메모리는 모델에게 주는 것이고, 실행 상태는 하네스 자신이 붙들고 있는 실행 중인 장면 — `messages` 배열, 턴 카운터, 결과가 아직 기록되지 않은 도구 호출입니다. 기본적으로 그 장면은 프로세스의 메모리에만 존재합니다. 프로세스가 죽으면 함께 사라지고, 디스크의 다른 파일이 전부 멀쩡해도 작업은 0에서 다시 시작하는 수밖에 없습니다.

그 장면을 디스크에 쓰는 것 — 다시 띄운 프로세스가 읽어 들일 수 있는 것으로 바꾸는 것 — 이 바로 **체크포인트**입니다. 실무에서 긴 작업의 신뢰성을 실제로 떠받치는 것은 대개 모델에게 모든 장애를 혼자 흡수하라고 요구하는 쪽이 아니라, "the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints"[^S1](Claude 위에 지어진 AI 에이전트의 적응력을, 재시도 로직과 정기적인 체크포인트 같은 결정론적 안전장치와 짝지어 두는 것)입니다. 이 레슨은 그중 체크포인트 쪽을 다룹니다. 무엇이 들어가야 하는가, 루프의 어디에서 쓰는가, 그리고 쓰는 행위 자체를 어떻게 수행하는가 — 잘못 쓴 체크포인트는 체크포인트가 아예 없는 것보다 더 나쁜 자리에 여러분을 놓아둘 수 있기 때문입니다.

## 무엇을 저장하는가: checkpoint.json의 여섯 필드

체크포인트는 '메모리에 있는 것을 전부 파일에 쏟아붓기'가 아닙니다. '루프를 재개하는 데 필요한 것을 기록하기'이며, 그 이상도 이하도 아닙니다. 이 코스의 뒤 레슨들은 모두 같은 프로토콜 위에서 돌아갑니다.

```javascript
const checkpoint = {
  version: 1,
  task: "지난 분기 지원 티켓을 이슈 유형별로 분류해서 표 하나로 묶어 줘",
  turns: 3,
  tokensUsed: 14208,
  messages: [/* 완전한 대화 이력 */],
  pendingToolUse: null, // 또는 { id, name, input }
};
```

- **version**: 프로토콜 버전 번호입니다. 이 포맷은 언젠가 바뀝니다(`messages`의 압축, `pendingToolUse`의 새로운 형태 등). `version`은 재개 경로가 무엇보다 먼저 '내가 이 체크포인트를 알아보는가?'를 물을 수 있게 해 줍니다. 모르는 버전을 만나면 이를 악물고 계속 파싱하는 대신 로드를 거부하고 큰 소리로 실패해야 합니다.
- **task**: 사용자의 원래 작업을 말로 적은 것입니다. 다시 띄운 뒤의 하네스 코드는 자기가 무엇을 하고 있었는지 기억하지 못하며, 읽을 수 있는 것은 디스크의 이 파일뿐입니다. `task`가 없으면 하네스는 이 체크포인트가 어느 작업의 것인지조차 말할 수 없고, 재개 진척을 사용자에게 보고하는 일은 더더욱 못 합니다.
- **turns**: 이미 몇 턴을 돌았는가입니다. "에이전트 하네스 기초: 루프와 통제"의 정지 조건(예를 들어 최대 턴 상한)을 걸지 말지를 결정하는 것이 이 값이며, 재개가 0부터 다시 세는 대신 이어서 세어 갈 숫자이기도 합니다.
- **tokensUsed**: 누적 토큰 지출입니다. "Context Engineering: Spending Finite Attention Where It Counts"의 압축 임계값이 이 숫자를 보고 발동합니다. 이것을 체크포인트에서 빼면 재개는 카운트가 0에서 시작하는 척하며 모든 압축 판단을 어긋나게 하거나, `messages`의 모든 메시지에 대해 사용량을 다시 추정해야 합니다. 그리고 대부분의 구성에서 과거의 사용량 수치는 이미 남아 있지 않습니다.
- **messages**: 대화 장면 전체, 곧 모델이 본 모든 user / assistant / tool_result 메시지입니다. 체크포인트에서 가장 큰 덩어리이자 유일하게 건너뛸 수 없는 것입니다. 모델에게는 자기 메모리가 없고, 앞서 무슨 일이 있었는지에 대해 모델이 아는 전부는 다음 요청에서 여러분이 건네는 이 배열입니다. 이것을 빠뜨리면 재개되는 것은 '이어 가기'가 아니라, 옛 실행이 이미 만들어 낸 부수 효과를 전부 짊어진 채 0에서 시작하는 새 작업입니다.
- **pendingToolUse**: `null`이거나, `{ id, name, input }` 모양의 기록입니다. 모델이 지명했지만 결과가 아직 기록되지 않은 도구를 가리킵니다. 이 필드로 무엇을 하는지는 레슨 3의 몫이며, 거기서 재개가 이 필드와 정산합니다. 여기서는 이것이 반쯤 끝난 상태를 표시하기 위해 체크포인트가 마련해 둔 자리라는 것만 알면 됩니다. 형태를 단순하게 유지하기 위해 이 레슨의 모든 예제는 한 턴에 `tool_use` 블록이 하나라고 가정합니다. 한 턴이 여러 도구 호출을 동시에 낸다면 이 필드를 배열로 만드십시오. 논리는 같습니다.

## 언제 저장하는가: 한 턴에 두 개의 저장 지점

이 필드들을 루프에 넣어 보면, 타이밍이 '매 턴 끝에 한 번 쓰기'만큼 단순하지 않다는 것이 드러납니다. 저장 지점은 둘입니다.

```javascript
while (response.stop_reason === "tool_use") {
  state.messages.push({ role: "assistant", content: response.content });

  const block = response.content.find((b) => b.type === "tool_use");

  // 저장 지점 A: 모델이 도구를 지명했고, 아직 실행되지 않았다
  state.pendingToolUse = { id: block.id, name: block.name, input: block.input };
  saveCheckpoint(state);

  const result = await executeTool(block.name, block.input);

  state.messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
  });
  state.turns += 1;
  state.pendingToolUse = null;

  // 저장 지점 B: 이번 턴의 도구 결과가 messages에 온전히 기록되었다
  saveCheckpoint(state);

  response = await callModel({ tools, messages: state.messages });
  state.tokensUsed += response.usage?.output_tokens ?? 0;
}
```

**지점 A**는 모델 응답이 도착한 뒤, 도구가 실행되기 전에 놓입니다. 응답의 `tool_use` 블록을 `pendingToolUse`에 기록한 다음 씁니다. **지점 B**는 도구 결과가 `messages`에 덧붙여진 뒤에 놓입니다. `pendingToolUse`를 `null`로 되돌린 다음 다시 씁니다.

B만으로 충분할까요? 노출되는 곳은 A와 B 사이의 창입니다. 모델이 도구를 지명했고 그 도구가 실행 중이거나, 이미 끝났지만 결과가 `messages`에 들어가지도 디스크에 쓰이지도 않은 구간입니다. 그 창에서 프로세스가 죽으면 디스크에 남은 마지막 체크포인트는 여전히 지난 턴에 B가 쓴 것이고, 그것은 이번 턴의 호출에 대해 아무것도 모릅니다. 어떤 세부가 유실된 정도가 아니라, 이 도구 호출이 디스크에 아무런 흔적도 남기지 못한 것입니다. 레슨 3은 재개할 때 정산합니다. 그 도구가 정말 끝났는가, 다시 실행해야 하는가 — 그리고 정산의 상대가 바로 A가 쓴 `pendingToolUse`입니다. 이 레슨은 구덩이를 파 두기만 하고, 레슨 6의 연습이 B만 쓰는 체크포인트를 여러분 앞에 놓고 재개에서 무엇이 어긋나는지 진단하게 합니다.

## 어떻게 저장하는가: 제자리에서 덮어쓸 수 없습니다

떠오르는 방법은 `state` 객체를 `JSON.stringify`해서 `fs.writeFileSync`로 옛 `checkpoint.json` 위에 곧장 덮어쓰는 것입니다. 프로세스가 정상적으로 끝날 때는 그것으로 충분합니다. 그런데 '정상적으로 끝난다'는 바로 체크포인트가 대비하지 않는 경우입니다. 체크포인트는 프로세스가 언제든 죽을 수 있어서, 전원이 나갈 수 있어서, 컨테이너가 축출될 수 있어서 존재합니다. 파일을 쓰는 것은 원자적인 연산이 아닙니다. 쓰기 도중에 프로세스가 중단되면 디스크에 남는 `checkpoint.json`은 반쯤 쓰인 것일 수 있습니다. 옛 버전도 아니고 새 버전도 아닌, 그저 잘려 나간 JSON입니다. 다음 재개는 `JSON.parse`에서 던지고, 그 파일은 그 작업의 유일한 장면 사본이었으므로 되돌아갈 더 오래된 버전도 없습니다.

수는 '임시 파일에 쓰고, 그다음 원자적으로 이름을 바꾸기'입니다. 완전한 내용을 `checkpoint.json.tmp`에 씁니다. 그 단계 도중에 죽더라도 희생되는 것은 임시 파일뿐이고, 진짜 `checkpoint.json`은 크래시 이전의 온전한 옛 버전 그대로여서 재개가 문제없이 읽습니다. `.tmp` 파일이 완성되면 `fs.renameSync`로 진짜 파일 이름 위에 얹습니다. 같은 파일 시스템 안에서 `rename`은 한 단계짜리 원자적 교체입니다. OS는 디렉터리 엔트리를 새 파일로 통째로 가리키게 하거나, 옛 파일을 가리킨 채로 두거나 둘 중 하나입니다. 그 사이에 반쯤 이름이 바뀐 상태는 존재하지 않습니다.

```javascript
import fs from "node:fs";
import path from "node:path";

function saveCheckpoint(state, dir = "./checkpoints") {
  fs.mkdirSync(dir, { recursive: true });

  const finalPath = path.join(dir, "checkpoint.json");
  const tmpPath = `${finalPath}.tmp`;

  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, finalPath); // 한 파일 시스템 안에서 rename은 원자적 교체다
}
```

```agentmentor-check
{
  "id": "sp-zh-02-direct-overwrite-risk",
  "label": "체크포인트 파일을 제자리에서 덮어쓸 때 무엇이 잘못되는지 판단하기",
  "prompt": "여러분은 saveCheckpoint를 이렇게 쓰려고 합니다. state 객체를 JSON.stringify한 다음, fs.writeFileSync로 같은 checkpoint.json 위에 곧장 덮어쓰는 것입니다. 여기에 어떤 문제가 있습니까?",
  "whyHere": "'.tmp에 쓰고 이름을 바꾼다'는 처방을 막 제시한 직후에 놓여 있습니다. tmp와 rename을 쓰라는 결론만 외운 것이 아니라, 제자리 덮어쓰기가 왜 안전하지 않은지를 실제로 이해했는지 확인합니다.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "문제없습니다. checkpoint.json은 애초에 최신 스냅숏 하나만 담으면 되므로, 제자리에서 덮어쓰는 것은 옛 내용을 새 내용으로 바꾸는 일일 뿐이고 파일을 더 만들 필요도 단계를 더 둘 필요도 없습니다",
      "correct": false,
      "feedback": "파일이 최신 스냅숏만 담아야 하는지와, 새 내용을 그 안에 어떻게 넣는지는 별개의 두 문제입니다. 체크포인트에 정말 현재 사본 하나만 있으면 되는 것은 맞습니다. 하지만 덮어쓰기 자체가 원자적이지 않습니다. 크래시는 쓰기를 중단시킬 수 있고, 그 순간 디스크에 앉아 있는 것은 완전한 옛 버전도 완전한 새 버전도 아닌, 부분적으로 쓰인 파일입니다."
    },
    {
      "id": "b",
      "text": "문제가 있습니다. 쓰기 도중에 프로세스가 죽으면 checkpoint.json이 반쯤 쓰인 채로 남을 수 있고, JSON.parse가 읽지 못하는 잘린 내용이 되며, 그것이 그 작업의 유일한 장면 사본이라 복구할 곳이 어디에도 없습니다",
      "correct": true,
      "feedback": "정답입니다. 파일을 쓰는 것은 한 번에 끝나는 원자적 단계가 아니고, 프로세스는 언제든 죽을 수 있으며, 중단된 쓰기는 유일한 장면 사본을 반쪽짜리 JSON 문서로 만들어 버립니다. 먼저 임시 파일에 쓰고, 그것이 완성된 뒤에만 진짜 파일 이름 위로 이름을 바꾸십시오. 그러면 디스크의 checkpoint.json은 어느 순간에 보아도 완전한 옛 버전이거나 완전한 새 버전이고, 그 사이의 무엇도 아닙니다."
    },
    {
      "id": "c",
      "text": "문제가 있는데, 그 문제는 디스크 사용량입니다. 같은 파일 위에 몇 번이고 다시 쓰면 checkpoint.json이 저장할 때마다 커져서, 긴 작업은 필요한 것보다 훨씬 많은 공간을 잡아먹게 됩니다",
      "correct": false,
      "feedback": "덮어쓰기는 파일을 키우지 않습니다. 매 쓰기가 옛 내용을 대체하므로 크기는 저장 횟수가 아니라 현재 state에 담긴 양을 대체로 따라갑니다. 진짜 위험은 디스크 공간이 아니라, 쓰기 자체가 크래시로 잘려 나가 완전하지도 파싱되지도 않는 파일이 남는 것입니다."
    }
  ]
}
```

## 프로덕트 참조점: Claude Code의 체크포인트

이 레슨이 가르치는 프로토콜은 사람이 지켜보지 않는 긴 작업을 위한 것이고, 그 결은 루프 한 턴에 두 개의 저장 지점입니다. 대비를 위해, 실제 프로덕트인 Claude Code가 '체크포인트'라는 말을 어디에 두는지 보십시오. "checkpointing automatically captures the state of your code before each user prompt."[^S2](체크포인팅은 각 사용자 프롬프트 이전에 코드의 상태를 자동으로 포착한다) "Every user prompt creates a new checkpoint"[^S2](모든 사용자 프롬프트가 새 체크포인트를 만든다), 그리고 "Claude Code saves checkpoints with the conversation, so you can still run /rewind after you resume a session"[^S2](Claude Code는 체크포인트를 대화와 함께 저장하므로, 세션을 재개한 뒤에도 /rewind를 실행할 수 있다).

그것이 섬기는 장면은 이쪽과 다릅니다. Claude Code의 체크포인트는 사람이 루프 안에 있는 세션을 위해 만들어졌습니다. 사용자는 언제든 멈춰 세우고, 한 방향을 시도해 보고, 어떤 메시지 이전으로 돌아가 다시 해 보기로 마음먹을 수 있습니다. 그러니 자연스러운 단위는 '사용자가 무언가를 말했다'입니다. 여기서 여러분이 만드는 것은 사람이 지켜보지 않는 긴 작업을 위한 것입니다. 곁에서 멈추라고 말해 줄 사람이 없고, 단위는 '루프가 한 바퀴 돌았다'이며, 한 턴 안에서 다시 저장 지점 A와 B로 갈라집니다. 크래시가 '모델이 도구를 지명했다'와 '결과가 기록되었다' 사이에 떨어질 수 있기 때문입니다. 둘은 같은 문제를 풀고 있지 않습니다. 나란히 놓는 것은 대체로 한 가지를 분명히 하기 위해서입니다. 체크포인트를 얼마나 잘게 자를지, 얼마나 자주 쓸지는 그 체크포인트가 무엇을 섬기느냐에 달려 있습니다. 답은 하나뿐이지 않습니다.

## 체크포인트는 공짜가 아닙니다

체크포인트에는 비용이 듭니다. 이 레슨의 프로토콜에서 루프 한 턴은 디스크에 두 번 씁니다. 서너 턴이면 끝나는 짧은 작업에서 그것은 순수한 오버헤드입니다. 프로세스는 끝까지 돌고, 그 체크포인트 파일들은 결코 읽히지 않습니다. 이 장치를 자기 하네스에 넣을지는 "you should consider adding complexity only when it demonstrably improves outcomes."[^S3](결과를 눈에 띄게 개선함이 증명될 때에만 복잡도를 더하는 것을 고려해야 한다)라는 원칙에 비추어 재어 볼 가치가 있습니다. 작업이 길수록, 크래시의 비용이 클수록 그 거래는 좋아집니다. 몇 초면 끝나는 것이라면 아마 필요하지 않을 것입니다.

## 💻 연습

<!-- exercises -->

### 레벨 1: 불완전한 체크포인트를 메우기

누군가 `saveCheckpoint`를 이렇게 썼습니다.

```javascript
function saveCheckpoint(state) {
  fs.writeFileSync("checkpoint.json", JSON.stringify({ messages: state.messages }));
}
```

이 레슨이 세운 프로토콜에 비추어, 이 체크포인트에는 아직 어떤 필드가 빠져 있습니까? 빠진 필드마다, 이 불완전한 체크포인트에서 재개를 시도하면 정확히 어디에서 무너지는지 구체적으로 말하십시오.

<!-- rubric -->
- 빠진 다섯 필드를 모두 나열함: `version`, `task`, `turns`, `tokensUsed`, `pendingToolUse`
- `version`에 대해: 재개 경로가 파일의 프로토콜 버전을 판단할 길이 없고, 포맷이 바뀐 뒤에는 로드를 거부할지 결정할 길도 없음을 설명함
- `task`에 대해: 이 장면이 어느 원래 작업의 것인지 하네스가 모르며, 어느 작업을 재개하는지 사용자에게 보고할 수 없음을 설명함
- `turns`에 대해: 재개 후 턴 카운트가 0에서 다시 시작해 실제로 돈 턴 수와 더 이상 맞지 않고, 그래서 최대 턴 정지 조건이 일찍 발동하거나 아예 발동하지 않을 수 있음을 설명함
- `tokensUsed`에 대해: 압축 임계값이 참고할 정확한 누계가 없어 재개가 아직 임계값에 닿지 않았다고 오판하거나 사용량을 다시 추정해야 함(그리고 재추정은 대개 과거의 사용량 수치에 닿지 못함)을 설명함
- `pendingToolUse`에 대해: 크래시가 모델이 도구를 지명했지만 실행이 끝나지 않은 창에 떨어졌다면 재개가 허공에 뜬 도구 호출이 있다는 것조차 알지 못하고, 레슨 3이 다루는 정산도 할 수 없음을 설명함

<!-- answer -->
이 체크포인트는 `messages`만 남기고 나머지 다섯 필드를 빠뜨렸습니다.

1. **`version`**: 없으면 재개 경로가 이 파일의 포맷을 알아보는지 확인할 수 없습니다. 프로토콜이 바뀌고 나면(예를 들어 어떤 필드가 새로운 형태를 갖게 되면), 재개 코드에는 '이것이 내가 다룰 수 있는 체크포인트 버전인가?'를 견주어 볼 대상이 없습니다. 이를 악물고 파싱하는 수밖에 없고, 그것이 실패했을 때 무엇이 어긋났는지도 말할 수 없습니다.
2. **`task`**: 없으면 다시 띄운 하네스가 읽는 것은 `messages` 더미뿐이고, 그 메시지들이 무엇을 이루려고 엮인 것인지 말할 길이 없습니다. 재개할 때 사용자에게 진척을 보고할 수 없고, 여러 작업을 다루는 구성에서는 방금 집어 든 것이 어느 작업인지 확인할 수도 없습니다.
3. **`turns`**: 없으면 재개는 0부터 셀 수밖에 없습니다. 'N턴 뒤에 멈춘다' 같은 정지 조건을 걸어 두었다면, 재개 후의 카운트는 실제로 일어난 턴 수와 더 이상 맞지 않으므로 그 조건은 일찍 발동하거나 아무 의미도 갖지 못하게 됩니다.
4. **`tokensUsed`**: 없으면 압축 임계값이 참고할 누계가 없습니다. 재개는 카운트가 0에서 시작하는 척하며 '이번 턴에 압축해야 하는가?'라는 판단 전체를 어긋나게 하거나, `messages`의 과거 메시지 전반에 대해 사용량을 다시 추정하려 듭니다. 그리고 대부분의 구성에서 그 과거의 `usage` 수치는 되찾을 수 없습니다.
5. **`pendingToolUse`**: 없으면, 마지막 크래시가 모델이 이미 도구를 지명했지만 실행이 끝나지 않았거나 결과가 기록되지 않은 창에 떨어졌을 때 이 체크포인트에는 그에 대한 기록이 전혀 없습니다. 재개는 정말로 어떤 도구 호출이 허공에 떠 있는지 알 수 없고, 레슨 3이 다루는 '이 호출을 다시 실행해야 하는가?'라는 정산도 할 수 없습니다. 아무 일도 없었던 것처럼 행동하는 수밖에 없습니다.

<!-- hint -->
'무엇을 저장하는가' 절로 돌아가, 체크포인트 객체의 여섯 필드를 하나씩 짚으며 이 축약된 버전에 나타나지 않는 것이 어느 것인지 확인하십시오.

<!-- hint -->
'X가 없다'에서 멈추지 말고 한 걸음 더 밀어붙이십시오. 하네스 코드가 정말로 이 파일에서 `state`를 다시 세워 루프에 재진입한다면, 가장 먼저 부딪히는 것은 무엇입니까?

<!-- rubric -->

### 레벨 2: 잠재된 두 개의 장애를 고치기

동료가 도구를 연달아 두 번 호출하는 작업을 돌리려고 아래의 `runAgent`를 썼습니다. 평소에는 멀쩡해 보이지만, 실행 도중에 프로세스가 죽는 순간 복구되는 장면은 열리지 않거나 맞아떨어지지 않습니다. 크래시 앞에서 무너지는 두 곳을 찾아, 각각이 무엇으로 이어지는지 말하고, 고치십시오. 고친 코드는 실제로 돌아가야 합니다.

```javascript
import fs from "node:fs";

function saveCheckpoint(state) {
  fs.writeFileSync("checkpoint.json", JSON.stringify(state, null, 2));
}

async function runAgent(task, tools, callModel, executeTool) {
  const state = {
    version: 1,
    task,
    turns: 0,
    tokensUsed: 0,
    messages: [{ role: "user", content: task }],
    pendingToolUse: null,
  };

  let response = await callModel({ tools, messages: state.messages });

  while (response.stop_reason === "tool_use") {
    state.messages.push({ role: "assistant", content: response.content });

    const block = response.content.find((b) => b.type === "tool_use");
    const result = await executeTool(block.name, block.input);

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    state.turns += 1;

    saveCheckpoint(state);
    response = await callModel({ tools, messages: state.messages });
  }

  return state;
}
```

<!-- rubric -->
- 첫 번째 장애를 지목함: `saveCheckpoint`가 맨 `fs.writeFileSync`로 같은 파일을 덮어쓰므로, 중단된 쓰기가 파싱되지 않는 반쪽짜리 JSON 문서를 남기고 되돌아갈 옛 버전도 없음
- 두 번째 장애를 지목함: 루프 전체가 도구 결과가 기록된 뒤(지점 B)에만 쓰고, 모델이 도구를 지명한 시점과 도구가 끝난 시점 사이(지점 A)에는 저장이 없으므로, 그 창에서의 크래시는 도구 호출을 디스크에 아무 흔적도 없이 남김
- 첫 번째 수정: `saveCheckpoint`를 `.tmp` 파일에 먼저 쓴 뒤 `fs.renameSync`로 원자적으로 제자리에 얹도록 다시 씀
- 두 번째 수정: `block`을 읽어 낸 뒤 `executeTool` 호출 전에 `pendingToolUse` 대입과 `saveCheckpoint`(지점 A)를 추가하고, 지점 B에서 `pendingToolUse`를 다시 `null`로 되돌림
- 고친 코드가 구조적으로 완결되어 있고 돌아감(예제의 가짜 `callModel` / `executeTool`에 대해서만이라도)

<!-- answer -->
두 개의 장애:

1. **제자리 덮어쓰기는 안전하지 않습니다.** `saveCheckpoint`는 `fs.writeFileSync`로 옛 `checkpoint.json` 위에 곧장 씁니다. 프로세스는 언제든 죽을 수 있고, 쓰기가 중단되면 디스크에 남는 것은 완전한 옛 버전도 완전한 새 버전도 아닌, `JSON.parse`가 읽지 못하는 잘린 내용입니다. 게다가 그 파일은 유일한 장면 사본이라 복구할 곳이 어디에도 없습니다.
2. **B에서만 저장하고 A에서는 결코 저장하지 않습니다.** 루프는 도구 결과가 `messages`에 덧붙여진 뒤에 `saveCheckpoint`를 한 번 부릅니다. 크래시가 '모델이 도구를 지명했다'와 '결과가 기록되었다' 사이에 — 도구가 실행 중일 때, 또는 끝났지만 결과가 `messages`에 들어가기 전에 — 떨어지면, 디스크의 마지막 체크포인트는 여전히 지난 턴의 옛 상태이고 이 도구 호출에 대해서는 아무것도 모릅니다.

수정 — 원자적 쓰기와 A에서의 저장:

```javascript
import fs from "node:fs";
import path from "node:path";

function saveCheckpoint(state, dir = "./checkpoints") {
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, "checkpoint.json");
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, finalPath); // 한 파일 시스템 안에서 rename은 원자적 교체다
}

async function runAgent(task, tools, callModel, executeTool, dir) {
  const state = {
    version: 1,
    task,
    turns: 0,
    tokensUsed: 0,
    messages: [{ role: "user", content: task }],
    pendingToolUse: null,
  };

  let response = await callModel({ tools, messages: state.messages });

  while (response.stop_reason === "tool_use") {
    state.messages.push({ role: "assistant", content: response.content });

    const block = response.content.find((b) => b.type === "tool_use");

    // 저장 지점 A: 모델이 도구를 지명했고, 아직 실행되지 않았다
    state.pendingToolUse = { id: block.id, name: block.name, input: block.input };
    saveCheckpoint(state, dir);

    const result = await executeTool(block.name, block.input);

    state.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
    });
    state.turns += 1;
    state.pendingToolUse = null;

    // 저장 지점 B: 이번 턴의 도구 결과가 messages에 온전히 기록되었다
    saveCheckpoint(state, dir);

    response = await callModel({ tools, messages: state.messages });
  }

  return state;
}
```

진짜 모델에 손대지 않는 가짜 한 쌍이면 검증에 충분합니다. 도구 호출을 연달아 두 번 요구하고 세 번째 호출에서만 `end_turn`을 돌려주는 `fakeCallModel`과, 고정된 문자열을 돌려주는 `fakeExecuteTool`을 짝지으십시오. 돌려 보면 디스크의 `checkpoint.json`이 4번 쓰이고(2턴 × 저장 지점 A와 B), 마지막에는 `pendingToolUse`가 `null`, `turns`가 `2`로 끝나며, 메모리 위의 최종 상태와 정확히 맞아떨어지는 것을 보게 됩니다.

<!-- hint -->
`saveCheckpoint` 하나부터 시작하십시오. 이 레슨의 '어떻게 저장하는가' 절에 있는 버전과 견주어 어느 단계가 빠졌는지 보십시오.

<!-- hint -->
그다음 루프 본문에 `saveCheckpoint(state)`가 몇 번, 어느 줄에 나오는지 세어 보십시오. 그리고 스스로에게 물으십시오. 모델이 도구를 지명한 시점(`block`을 읽어 낸 지점)과 도구가 실제로 끝난 시점(`await executeTool`이 돌아온 지점) 사이에, 디스크에 쓰이는 것이 있습니까?

<!-- /exercises -->

## 정리

- 실행 장면은 기본적으로 메모리에 있고 프로세스와 함께 죽는다. 체크포인트가 있는 이유는 긴 작업이 크래시마다 처음부터 다시 돌지 않고 끊긴 자리에서 이어 갈 수 있게 하기 위해서다[^S1]
- checkpoint.json은 여섯 필드를 담는다. `version`, `task`, `turns`, `tokensUsed`, `messages`, `pendingToolUse`. `messages`가 가장 큰 덩어리이고 그것이 없으면 모델에게는 앞서 무슨 일이 있었는지에 대한 근거가 하나도 없다. `pendingToolUse`는 레슨 3이 정산의 상대로 삼는 허공에 뜬 호출의 표식이다
- 루프 한 턴에는 저장 지점이 둘 있다. A는 모델이 도구를 지명한 뒤 도구가 실행되기 전, B는 도구 결과가 `messages`에 온전히 기록된 뒤다. B에서만 저장하면 모델이 지명했으나 아직 끝나지 않은 도구가 걸쳐 있는 창이 통째로 사각지대가 된다
- 체크포인트 파일을 제자리에서 덮어쓰는 것은 안전하지 않다. 프로세스는 언제든 죽을 수 있고, 쓰기 도중의 크래시는 유일한 장면 사본을 반쪽짜리 JSON 문서로 만든다. 먼저 `.tmp` 파일에 쓰고 `fs.renameSync`로 제자리에 얹어라. 어느 순간에 보아도 디스크에 있는 것이 완전한 한 버전임을 보장하는 것이 바로 이것이다
- Claude Code의 체크포인트는 다른 결로 작동한다. 각 사용자 프롬프트 이전에 자동으로 포착되며[^S2] 사람이 루프 안에 있는 세션을 섬긴다. 이 레슨이 만드는 것은 사람이 지켜보지 않는 긴 작업을 위한 것이다. 자르는 지점은 다르지만 둘은 같은 질문에 답한다. 무언가 잘못되었을 때, 어디로 돌아갈 것인가?
- 체크포인트는 공짜가 아니다. 턴당 두 번의 디스크 쓰기는 짧은 작업에서 순수한 오버헤드이며, 더할 가치가 있는지는 많을수록 좋다는 가정이 아니라 결과를 눈에 띄게 개선하는지에 달려 있다[^S3]

[>> 레슨 3: 체크포인트에서 재개하기: 루프를 다시 일으키기](./03-resume-from-checkpoint.md)
