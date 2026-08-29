# 레슨 5: 되감기와 분기: 체크포인트의 두 번째 값어치

> 학습 목표:
> - 재해 복구 너머에 있는 체크포인트의 두 가지 능동적 쓰임 — 앞선 장면으로 되감아 다시 시도하기, 두 번째 타임라인을 갈라 내어 탐색하기 — 을 설명하고, 둘 다 재개가 딛고 선 것과 같은 체크포인트의 연속 위에 서 있음을 알아보기
> - 체크포인팅을 '가장 최근 것만 남기기'에서 턴별로 보존하는 연속으로 바꾸고, `rewindTo(turn)`을 구현하고, 되감기가 되돌리는 것은 이미 일어난 외부 부수 효과가 아니라 판단 장면임을 설명하기
> - `forkFrom(turn, branchName)`을 구현해 같은 장면에서 독립적인 타임라인을 떠내고, 체크포인트와 Git과 부수 효과 원장이 각각 무엇을 맡는지 경계선을 긋기
>
> 전제: 레슨 1~4를 마쳤고 `checkpoint.json`의 필드 구성(`version`, `task`, `turns`, `tokensUsed`, `messages`, `pendingToolUse`)과 원자적 쓰기, 재개가 허공에 뜬 호출을 정산하는 방식, 레슨 4의 부수 효과 원장과 멱등 키를 알고 있어야 합니다 | 이전: [레슨 4 <<](./04-side-effects-idempotency.md) | 다음: [레슨 6 >>](./06-build-checkpointing.md)

## 체크포인트는 그저 퓨즈가 아닙니다

앞선 몇 레슨은 체크포인트를 재해에 대비한 보험으로 다뤘습니다. 프로세스가 크래시하면 가장 최근 체크포인트에서 루프를 다시 주워 올리는 것입니다. 그렇게 쓰는 데 잘못된 점은 없지만, 크래시가 난 뒤에만 손을 뻗는다면 체크포인트는 대부분의 시간을 놀고 있게 됩니다. 크래시가 없었으니 저장해 둔 상태는 낭비된 걸까요?

낭비가 아니었습니다. 쌓인 체크포인트의 줄은 사실 그 작업의 타임라인입니다. 매 턴 무엇을 생각하고 있었는지, 무엇을 하려던 참이었는지, 어떤 효과를 이미 저질렀는지가 전부 흔적으로 남아 있습니다. 재해 복구 너머에서 그 타임라인은 두 가지 능동적인 쓰임을 더 받쳐 줍니다. 앞선 턴으로 되감아 처음부터 다시 하기, 그리고 어떤 턴에서 갈라 내어 두 번째 경로를 나란히 돌리기. 하네스 엔지니어링을 축으로 정리한 어느 커뮤니티 로드맵은 지속성 컴포넌트를 요약하면서 바로 이 셋을 하나로 묶습니다. 노드마다 상태를 체크포인트해 재개하고 되감고 분기할 수 있게 하라[^S5]. 이는 그 로드맵의 틀 잡기 차원의 주장이며 구현을 지시하는 것은 아니지만, 가리키는 바는 하나입니다. 재개는 체크포인트가 쓰이는 세 가지 용도 중 하나일 뿐이고, 나머지 둘이 이 레슨의 주제입니다.

- **되감기**: 작업이 크래시하지는 않았지만 경로를 벗어났습니다. 판단 장면을 잘못되기 전의 턴으로 되돌리고, 거기서 다시 시작합니다.
- **분기**: 어느 경로가 더 나은지 확신이 서지 않으므로, 같은 장면에서 독립적인 타임라인 둘을 떠내어 각각 돌려 보고 결과를 골라냅니다.

둘 중 어느 것도 '재해 뒤의 뒷정리'가 아닙니다. 작업이 아주 멀쩡히 굴러가는 중에도 얼마든지 생길 수 있는 일입니다.

## 되감기: 바깥 세계가 아니라 판단 장면을 되돌립니다

20여 턴의 도구 호출을 돌리는 작업을 그려 보세요. 15턴째에 모델이 잘못된 판단을 내립니다. 편집할 파일을 잘못 고르거나, 모호한 요구사항에 대해 잘못된 전제를 놓습니다. 그 뒤로 열 턴 동안 모델은 그 실수 위에 계속 쌓아 올립니다. 이 시리즈의 코스 8 "Context Engineering: Spending Finite Attention Where It Counts"는 컨텍스트가 길고 어수선하게 쌓일수록 모델이 거기서 정보를 정확히 떠올리는 능력이 떨어진다는 것을 보였습니다 — 게다가 이 구간의 이력은 그 위에 잘못된 판단까지 얹고 있습니다. 길고 경로를 벗어난 컨텍스트 안에서 모델이 계속 허우적대게 두느니, 잘못된 판단 이전 지점인 14턴째로 장면을 되돌리고 거기서부터 다시 시작하는 편이 낫습니다.

그러려면 체크포인트가 더 이상 '가장 최근 것 하나'일 수 없습니다. 앞선 레슨들의 `saveCheckpoint`는 매번 같은 `checkpoint.json`을 덮어썼으므로 복구 시에는 마지막으로 쓰인 상태만 얻을 수 있었습니다. 재해 복구에는 충분하지만 되감기에는 못 씁니다. 14턴째의 장면은 15턴째에 진작 덮여 사라졌기 때문입니다. 되감기를 받치려면 체크포인트를 턴별 연속으로 보존해야 하고, 턴 번호와 저장 지점을 파일 이름에 담아야 합니다. `checkpoints/turn-014-A.json`, `checkpoints/turn-014-B.json` 같은 식입니다. 각 턴 안에서 저장 지점 A는 모델이 계획을 내놓았지만 도구는 아직 돌지 않은 때에 놓이고, 저장 지점 B는 그 턴의 도구 결과가 `messages`에 되돌아 쓰여 턴이 진짜로 끝났을 때 놓입니다. 기본적으로 '턴 N으로 돌아간다'는 그 턴이 끝난 뒤의 장면, 곧 그 턴에서 마지막으로 쓰인 저장 지점을 뜻합니다.

```javascript
import fs from "node:fs/promises";
import path from "node:path";

function turnFileName(turn, point) {
  return `turn-${String(turn).padStart(3, "0")}-${point}.json`;
}

// 한 턴에서 마지막으로 쓰인 저장 지점을 집는다: A와 B는 사전순으로 정렬되고 B가 A 뒤에 오는데,
// 이는 '도구 실행 전' -> '도구 결과 기록 후'라는 순서와 정확히 맞아떨어진다
async function pickLatestPoint(turn, dir) {
  const files = await fs.readdir(dir);
  const prefix = `turn-${String(turn).padStart(3, "0")}-`;
  const points = files
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, prefix.length + 1))
    .sort();
  if (points.length === 0) throw new Error(`No checkpoint for turn ${turn}`);
  return points[points.length - 1];
}

async function rewindTo(turn, { point, dir = "checkpoints" } = {}) {
  const wanted = point ?? (await pickLatestPoint(turn, dir));
  const raw = await fs.readFile(path.join(dir, turnFileName(turn, wanted)), "utf8");
  return JSON.parse(raw); // { version, task, turns, tokensUsed, messages, pendingToolUse }
}
```

`rewindTo(14)`가 돌려주는 장면을 손에 쥐면, 그다음은 재개와 같은 흐름입니다. 이 `messages`로 이력을 다시 세우고, 이 `turns` 값에서 루프를 이어 갑니다. 다른 점은 단 하나, 이번에 모델이 마주하는 것이 15턴째가 오염시킨 컨텍스트가 아니라 판단이 내려지기 전의 깨끗한 장면이라는 것입니다.

다만 소리 내어 말해 둘 것이 하나 있습니다. 되감기가 되돌리는 것은 **판단 장면**이지 **바깥 세계**가 아닙니다. 16턴째의 잘못된 판단이 이미 영향이 큰 도구를 불렀다면 — 이를테면 메일을 실제로 보냈다면 — 14턴째로 되감아도 그 메일은 도로 끌려오지 않습니다. 체크포인트는 `messages`, `turns`, `pendingToolUse`를 비롯해 여러분이 스냅숏에 정의해 넣은 상태 필드들을 담을 뿐, 이미 내려앉은 외부 행동을 되돌리도록 만들어지지 않았고 되돌릴 수도 없습니다. 레슨 4의 부수 효과 원장(`effects.json`)은 계속해서 덧붙이기만 하는 규칙을 따릅니다. 되감고 15턴째부터 다시 돌린 뒤 모델이 이번에는 완전히 다른 행동을 고르더라도, 원장에는 새 기록이 하나 더해질 뿐 옛 기록이 지워지지 않습니다. 버려진 열 턴에서 일어난 일은 여전히 원장에 흔적을 남기며, 이것이 바로 레슨 4의 멱등성 관점을 되감기 상황으로 옮겨 놓은 것입니다.

## 분기: 하나의 장면에서 두 개의 타임라인을 돌리기

되감기는 '이 경로가 틀렸으니 물러나 다시 하자'를 풉니다. 그러나 때로는 물음이 '틀렸는가'가 아니라 '어느 쪽이 더 나은지 모르겠다'입니다. 두 리팩터링 계획이 둘 다 말이 되고, 고르기 전에 각각 돌려 보고 비교하고 싶은 것입니다. 그럴 때는 파괴적으로 하나를 고르지 말고, 같은 체크포인트에서 독립적인 타임라인 둘을 떠내어 각각 돌리세요.

```javascript
async function forkFrom(turn, branchName, { point, baseDir = "checkpoints" } = {}) {
  const startPoint = point ?? (await pickLatestPoint(turn, baseDir));
  const state = await rewindTo(turn, { point: startPoint, dir: baseDir });

  const branchDir = `${baseDir}-${branchName}`;
  await fs.mkdir(branchDir, { recursive: true });
  await fs.writeFile(
    path.join(branchDir, turnFileName(turn, startPoint)),
    JSON.stringify(state, null, 2)
  );

  // 독립적인 부수 효과 원장: 이 타임라인은 제 힘으로 돌아가고, 각자 자기 효과를
  // 기록하며, 본선의 기록을 물려받지 않는다
  await fs.writeFile(path.join(branchDir, "effects.json"), "[]\n");
  return branchDir;
}
```

`forkFrom(14, "plan-b")` 뒤에는 `checkpoints-plan-b/`가 자기만의 체크포인트 연속과 텅 빈 부수 효과 원장을 갖게 됩니다. 14턴째부터 이 타임라인이 어디로 가든, 몇 턴을 돌든, 체크포인트를 몇 개 남기든, 그 무엇도 본선을 방해하지 않습니다.

갈라진 두 타임라인이 독립적이라는 사실은 영향이 큰 도구에 대해서는 경고입니다. 두 타임라인이 똑같이 진짜 외부 행동을 부르게 된다면 — 이를테면 둘 다 같은 메일을 보내야 한다면 — 승인 없이 각각을 끝까지 돌리는 것은 타임라인마다 한 번씩 보내는 일이 되고, 이는 부수 효과가 두 배가 되는 것입니다. 그런 도구에 승인 게이트를 달아 두거나, 분기하는 동안에는 드라이런 모드로 바꿔 두는 편이, 분기하기 전에 해 둘 만합니다. 되감기에서 원장이 되돌아가지 않는 것과 같은 이치입니다. 체크포인트는 둘로 복사할 수 있지만, 이미 내려앉은 외부 효과는 '평행 세계마다 하나씩'으로 복사할 수 없습니다.

## 프로덕트 비교: Claude Code는 이것을 기능으로 출시했습니다

위의 되감기와 분기는 Claude Code가 이미 제품 수준의 기능으로 내놓은 것입니다. 이것은 비교를 위한 것일 뿐, 여기서 가르치려는 도구가 아닙니다. 그 체크포인팅 메커니즘은 사용자 프롬프트마다 그 이전의 코드 상태를 자동으로 붙잡습니다[^S2]. 사용자 프롬프트 하나하나가 새 체크포인트를 만들고[^S2], Claude Code는 체크포인트를 대화와 함께 저장하므로 세션을 재개한 뒤에도 여전히 `/rewind`를 쓸 수 있습니다[^S2].

`/rewind` 메뉴는 '무엇을 복원할지'를 세 갈래로 나눕니다. "Restore conversation: rewind to that message while keeping current code"(대화 복원: 현재 코드는 그대로 두고 그 메시지로 되감기), "Restore code: revert file changes while keeping the conversation"(코드 복원: 대화는 그대로 두고 파일 변경을 되돌리기), 아니면 "Restore code and conversation: revert both code and conversation to that point"(코드와 대화 복원: 코드와 대화를 둘 다 그 시점으로 되돌리기)[^S2] — 공교롭게도 이 레슨의 '되감기는 판단 장면을 되돌린다'는 문장을 제품으로 옮겨 놓은 것입니다. 판단 장면(대화)만 되돌릴 수도 있고, 코드까지 함께 되돌릴 수도 있습니다. 공식 문서는 체크포인팅의 흔한 사용 사례도 몇 가지 열거하는데, "Exploring alternatives: try different implementation approaches without losing your starting point"(대안 탐색: 출발점을 잃지 않고 다른 구현 방식을 시도하기)나 "Recovering from mistakes: quickly undo changes that introduced bugs or broke functionality"(실수에서 복구: 버그를 들이거나 기능을 망가뜨린 변경을 빠르게 되돌리기)[^S2] 같은 것들입니다. 짚어 둘 점이 있습니다. 그 사용 사례 문서는 체크포인팅(`/rewind`) 아래에 뭉뚱그려 실려 있을 뿐 '되감기'와 '분기'로 따로 갈라 놓은 것이 아닙니다. 그러나 이 레슨의 두 쓰임 — '잘못됐으니 물러나 다시 하기'와 '모르겠으니 갈라서 시도하기' — 에 대어 보면 방향은 맞아떨어집니다.

분기 쪽으로는 Claude Code가 `/branch` 또는 `claude --continue --fork-session`을 제공합니다. "To branch off and try a different approach while preserving the original session intact, use /branch or claude --continue --fork-session"[^S2](원래 세션을 온전히 보존한 채 갈라져 나가 다른 접근을 시도하려면 /branch나 claude --continue --fork-session을 쓰세요).

## 경계와 분업: 체크포인트, Git, 부수 효과 원장은 각각 무엇을 맡는가

Claude Code의 문서는 자기 나름의 경계도 긋습니다. 그 체크포인팅은 "does not track files modified by bash commands"[^S2](bash 명령이 수정한 파일은 추적하지 않는다)이며, "Only direct file edits made through Claude's file editing tools are tracked"[^S2](Claude의 파일 편집 도구를 통한 직접 편집만 추적된다)입니다. 같은 이치로, 여러분 자신의 하네스에 있는 체크포인트도 여러분이 스냅숏에 명시적으로 정의해 넣은 상태 필드 — `messages`, `turns`, `tokensUsed`, `pendingToolUse` — 만 담습니다. 도구가 바깥 세계에 만든 변화, 곧 데이터베이스에 쓰기, 다른 서비스 호출하기, 메일 보내기는 체크포인트가 관여할 바가 아닙니다. 그것은 부수 효과 원장의 몫입니다.

공식 문서는 이 메커니즘의 역할을 분명하게 말합니다. 체크포인트는 빠른 세션 수준의 복구를 위해 설계된 것이며, 장기 이력과 협업에 대해서는 "continue using version control, such as Git, for commits, branches, and long-term history."[^S2](커밋, 브랜치, 장기 이력에는 Git 같은 버전 관리를 계속 쓰세요)라고 말합니다. 셋은 서로 다른 구간을 맡고 있고, 나란히 놓으면 더 분명해집니다.

| 메커니즘 | 무엇을 맡는가 | 시간 척도 |
| --- | --- | --- |
| 체크포인트 | 실행 중인 장면 — `messages`, 턴 카운터, 아직 실행되지 않은 도구 호출 | 분 단위, 세션 수준 |
| Git | 코드 자체의 이력 — 커밋, 브랜치, 협업 | 영구적, 협업 |
| 부수 효과 원장 | 이미 일어난 외부 부수 효과 — 보낸 메일, 쓴 레코드 | 덧붙이기만, 영구 보존 |

```agentmentor-check
{
  "id": "sp-zh-05-checkpoint-vs-git",
  "label": "체크포인트가 버전 관리를 대체할 수 있는지 판단하기",
  "prompt": "팀의 누군가가 제안합니다. 이제 체크포인트로 턴 단위 되감기가 되니 Git의 커밋 이력과 하는 일이 꽤 비슷하다, 그러니 앞으로 코드 변경도 체크포인트로 관리하고 Git은 아예 걷어내자. 이 제안은 성립합니까?",
  "whyHere": "체크포인트와 Git과 부수 효과 원장의 분업을 막 끝낸 참입니다. '이제 체크포인트로 되감기가 되는데 Git은 군더더기 아닌가?'는 바로 이 자리에서 가장 튀어나오기 쉬운 과잉 확장이고, 이 경계는 그 자리에서 못을 박아야 합니다. 그러지 않으면 독자는 분 단위 세션 복구와 영구적인 코드 이력을 하나로 뭉쳐 버립니다.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "성립합니다. 체크포인트는 이미 턴 단위로 각 단계의 장면을 담고 있고 version, turns, messages가 전부 들어 있으니 Git 커밋 기록과 같은 일을 하며, 체크포인트로 되감기도 하고 이력도 읽을 수 있습니다.",
      "correct": false,
      "feedback": "체크포인트가 담는 필드는 한 세션의 실행 중인 장면을 다시 세우기 위해 있는 것이고, 이는 Git 커밋이 기록하는 것 — 온전히 버전 관리되는 코드 파일 그 자체 — 과 같지 않습니다. 체크포인트는 빠른 세션 수준의 복구를 위해 설계되었고, 장기 이력과 협업은 여전히 Git 같은 버전 관리 위에 서 있습니다[^S2]. 둘은 같은 것을 맡고 있지 않으므로 한쪽이 다른 쪽을 대체하고 말고 할 여지가 없습니다."
    },
    {
      "id": "b",
      "text": "성립하지 않습니다. 체크포인트는 실행 중인 장면을 분 단위로 세션 수준에서 복구하는 것이고, Git은 코드 자체의 영구적이고 협업적인 이력입니다. 둘은 완전히 다른 것을 맡고 있어 서로를 대신할 수 없습니다.",
      "correct": true,
      "feedback": "정답입니다. 문서는 그 경계를 분명하게 말합니다. 체크포인트는 빠른 세션 수준의 복구를 위해 설계되었고, 장기 이력과 협업에는 여전히 Git 같은 버전 관리가 필요합니다[^S2]. 체크포인트는 bash 명령이 수정한 파일은 추적조차 하지 않고 Claude 자신의 파일 편집 도구를 통한 편집만 추적하므로[^S2], 코드에서 실제로 무엇이 바뀌었는지에 대한 기록부터가 Git보다 훨씬 좁습니다. 체크포인트와 Git과 부수 효과 원장은 각각 한 구간씩 맡고 있으며, 어느 것도 다른 것을 대체하지 않습니다."
    },
    {
      "id": "c",
      "text": "부분적으로 성립합니다. 체크포인트로 이미 되감기가 되니 되감을 때마다 기록만 남긴다면 사실상 간소화된 브랜치 관리이고, 운용 방식이 다를 뿐이므로 Git을 점진적으로 대체하는 것도 불가능하지는 않습니다.",
      "correct": false,
      "feedback": "체크포인트 되감기와 Git 브랜치 관리는 같은 것의 다른 표기가 아닙니다. 체크포인트는 bash 명령이 수정한 파일은 추적하지 않고 Claude 자신의 파일 편집 도구를 통한 편집만 추적하므로[^S2] 코드 변경을 담는 범위가 Git보다 훨씬 좁고, Git의 커밋·머지·협업 장치는 하나도 갖고 있지 않습니다. 그 역할은 빠른 세션 수준의 복구이지 버전 관리의 대체가 아닙니다[^S2]."
    }
  ]
}
```

## 보존 비용: 트레이드오프를 고르세요

턴별 체크포인트 연속을 보존하는 것은 공짜가 아닙니다. 턴마다 저장 지점이 둘이고, 작업이 길게 돌수록 파일이 디스크에 더 쌓입니다. "you should consider adding complexity only when it demonstrably improves outcomes"[^S3](복잡도는 결과를 눈에 띄게 개선함이 증명될 때에만 더하는 것을 고려해야 한다)는 Anthropic의 원칙은 여기에도 똑같이 적용됩니다. 작업이 몇 턴만 돌고 되감기가 좀처럼 필요하지 않다면, 연속 전체를 보관하는 것은 값어치보다 비쌀 수 있습니다. 앞선 레슨들처럼 가장 최근 것 하나만 남겨도 충분합니다. 반대로 작업이 수십 턴을 돌고 몇 가지 접근을 시도하느라 되감기나 분기가 일상적으로 필요하다면, 보관하는 연속은 제 값을 합니다. 무언가 잘못됐을 때 처음부터 시작하지 않아도 되고, 시행착오의 비용이 내려갑니다. 이것은 결국 작업 규모에 맞춘 판단의 문제이지, 어느 방식이 본래 옳으냐의 문제가 아닙니다.

<!-- exercises -->
## 💻 연습

### 레벨 1: 네 가지 상황, 맞는 도구 고르기

아래 네 상황 각각에 대해 되감기, 재개, 분기, Git 중 무엇을 써야 합니까? 각각 답하고 근거를 대세요.

1. 작업이 20여 턴을 돌았는데, 12턴째에 모델이 리팩터링 계획을 잘못 골랐다는 것을 알아챘습니다. 그 뒤의 턴들은 전부 그 잘못된 계획 위에 쌓였지만, 프로세스 자체는 여전히 멀쩡히 돌고 있고 크래시는 없습니다.
2. 같은 작업이 18턴째에 이르렀을 때 호스트 머신이 재부팅되어 프로세스가 통째로 죽었고, 아무것도 끝맺지 못했습니다.
3. 모듈 하나를 두 개의 서비스로 쪼갤지 세 개로 쪼갤지 확신이 서지 않아, 에이전트가 각 계획을 한 번씩 돌려 결과를 비교해 보게 하고 싶습니다.
4. 이 코드가 사흘 전에 어떤 모습이었는지, 누가 언제 바꿨는지 알고 싶습니다.

<!-- rubric -->
- 1번은 되감기를 고름. 근거가 '크래시는 없었지만 판단이 잘못됐고 이후 턴들이 전부 그 실수 위에 쌓였다'를 가리켜야 하며, 재개나 분기가 아님
- 2번은 재개를 고름. 근거가 '판단 실수가 아니라 프로세스 전체가 중단됐다'를 가리키며, 되감기가 아니라 체크포인트 재개를 씀
- 3번은 분기를 고름. 근거가 '두 계획 모두 실제로 돌려야 비교할 결과가 나온다'를 가리키며, 한쪽에 먼저 걸어 보는 것이 아님
- 4번은 Git을 고름. 근거가 '코드 자체의 버전 관리된 이력을 묻고 있으며 시간 척도가 분이 아니라 일 단위'를 가리키며, 이는 체크포인트의 세션 수준 범위 밖임

<!-- answer -->
1. **되감기**. 프로세스는 크래시하지 않았고, 문제는 12턴째의 판단 그 자체이며, 뒤따른 십여 턴이 전부 그 실수 위에 쌓였습니다. 이미 경로를 벗어난 이력 구간에서 계속 밀고 나가느니, 잘못된 판단 이전인 11턴째로 장면을 되돌리고, 아직 어긋나지 않은 판단 장면으로 갈아 끼운 채 다시 시작하세요.
2. **재개**. 이것은 판단의 문제가 아닙니다. 프로세스 자체가 통째로 죽은 것이고 12턴째가 무엇을 생각했는지와는 무관합니다. 필요한 것은 가장 최근 체크포인트에서 루프를 다시 주워 올려 원래의 실행 장면을 이어 가는 것이며, 갈아 끼울 판단은 없습니다.
3. **분기**. 이것은 '하나가 틀렸으니 물러난다'가 아닙니다. 두 계획 다 말이 되고, 어느 쪽이 나은지 알려면 각각을 실제로 돌려 봐야 합니다. 현재 체크포인트에서 독립적인 타임라인 둘을 떠내고, 각자 자기 부수 효과 원장을 갖게 한 뒤 따로 돌리세요. 한쪽에 걸었다가 미흡함을 확인하고 되감아 다시 하는 것보다 직접적입니다.
4. **Git**. 여기서 묻는 것은 코드 그 자체입니다. '사흘 전에 어떤 모습이었는지, 누가 바꿨는지'는 버전 관리 시스템이 관리하는 것이고, 분이 아니라 일 단위에 걸친 영구적 이력입니다. 체크포인트는 빠른 세션 복구를 위해 턴별로 보존되며 보통 그렇게 오래 보관하지도 않고, '누가 바꿨는지' 같은 협업 데이터를 기록하지도 않습니다.

<!-- hint -->
먼저 스스로에게 물으세요. 프로세스가 통째로 죽었습니까? 그렇다면 재개입니다. 그렇지 않은데 경로를 벗어났다면, 거기가 되감기가 들어설 자리입니다.

<!-- hint -->
'어느 쪽을 고를지 모르겠다'와 '이미 잘못 골랐다'는 같지 않습니다. 앞쪽은 비교를 위한 분기를, 뒤쪽은 다시 하기 위한 되감기를 부릅니다. 그리고 '코드 자체의 이력'이 나오면 체크포인트가 아니라 Git을 떠올리세요.

### 레벨 2: saveCheckpoint를 턴별 연속으로 바꾸기

아래 코드는 앞선 레슨들의 옛 버전입니다. 매번 같은 `checkpoint.json`을 덮어쓰므로 재개는 받쳐 주지만 되감기는 받쳐 주지 못합니다. 이 레슨이 요구하는 대로 다시 쓰세요. 파일 이름은 `turn-NNN-A.json` / `turn-NNN-B.json`이라는 턴별 보존 규칙을 따르고, 재개를 위해 가장 새로운 턴에서 마지막으로 쓰인 저장 지점을 기본값으로 집는 `loadLatest()`를 제공하고, 특정 턴의 장면을 집어 오는 `rewindTo(turn)`을 제공하세요. 다 끝냈으면 검증을 작성하세요. 5턴을 연달아 저장하고, `rewindTo(3)`을 부르고, 돌아온 장면의 `turns`가 3인지, 그리고 부수 효과 원장 `effects.json`의 길이가 되돌아가지 않았는지 확인하세요.

```javascript
// 옛 버전: 매번 같은 파일을 덮어쓰므로 '가장 최근'만 집을 수 있고 '턴 N'은 집을 수 없다
import fs from "node:fs/promises";

async function saveCheckpoint(state) {
  const tmp = "checkpoint.json.tmp";
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, "checkpoint.json");
}

async function loadCheckpoint() {
  const raw = await fs.readFile("checkpoint.json", "utf8");
  return JSON.parse(raw);
}
```

<!-- rubric -->
- `saveCheckpoint`가 디스크에 `turn-NNN-A.json` / `turn-NNN-B.json` 이름으로 쓰도록 다시 쓰였고 원자적 쓰기를 유지함(`.tmp`를 먼저 쓰고 그다음 rename)
- '한 턴에서 마지막으로 쓰인 저장 지점'을 찾는 논리를 제공하며, `loadLatest()`가 실제로 돌았던 가장 높은 턴의 가장 새로운 저장 지점을 올바르게 집음
- `rewindTo(turn)`이 지정된 턴의 장면을 집어 오고 `effects.json`은 건드리지 않음
- 검증 스크립트가 완주함. 5턴을 저장한 뒤 `rewindTo(3).turns === 3`이고, `effects.json`의 길이는 여전히 5임(되감기 행위가 그것을 바꾸지 않았음)

<!-- answer -->
```javascript
import fs from "node:fs/promises";
import path from "node:path";

function turnFileName(turn, point) {
  return `turn-${String(turn).padStart(3, "0")}-${point}.json`;
}

async function saveCheckpoint(state, turn, point, dir = "checkpoints") {
  const file = path.join(dir, turnFileName(turn, point));
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, file); // 원자적 쓰기: tmp 먼저, 그다음 통째로 rename
}

async function pickLatestPoint(turn, dir) {
  const files = await fs.readdir(dir);
  const prefix = `turn-${String(turn).padStart(3, "0")}-`;
  const points = files
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, prefix.length + 1))
    .sort();
  if (points.length === 0) throw new Error(`No checkpoint for turn ${turn}`);
  return points[points.length - 1];
}

async function rewindTo(turn, { point, dir = "checkpoints" } = {}) {
  const wanted = point ?? (await pickLatestPoint(turn, dir));
  const raw = await fs.readFile(path.join(dir, turnFileName(turn, wanted)), "utf8");
  return JSON.parse(raw);
}

async function loadLatest(dir = "checkpoints") {
  const files = await fs.readdir(dir);
  const maxTurn = Math.max(
    ...files.filter((f) => f.startsWith("turn-")).map((f) => Number(f.slice(5, 8)))
  );
  return rewindTo(maxTurn, { dir });
}

export { saveCheckpoint, rewindTo, loadLatest };
```

검증 스크립트(`effects.json`은 같은 원자적 쓰기로 덧붙이며, 재개와 되감기가 결코 건드리지 않는 원장을 대신합니다):

```javascript
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { saveCheckpoint, rewindTo, loadLatest } from "./checkpoint.mjs";

async function appendEffect(entry, file = "effects.json") {
  let ledger = [];
  try {
    ledger = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  ledger.push(entry);
  await fs.writeFile(file, JSON.stringify(ledger, null, 2));
}

await fs.mkdir("checkpoints", { recursive: true });

for (let turn = 1; turn <= 5; turn++) {
  const stateA = {
    version: 1,
    task: "demo",
    turns: turn,
    tokensUsed: turn * 100,
    messages: [{ role: "user", content: `turn ${turn} A` }],
    pendingToolUse: { name: "send_email" },
  };
  await saveCheckpoint(stateA, turn, "A");

  const stateB = {
    ...stateA,
    messages: [...stateA.messages, { role: "user", content: `turn ${turn} B` }],
    pendingToolUse: null,
  };
  await saveCheckpoint(stateB, turn, "B");

  await appendEffect({ turn, action: "send_email" });
}

const rewound = await rewindTo(3);
assert.equal(rewound.turns, 3);
console.log("rewindTo(3).turns =", rewound.turns); // rewindTo(3).turns = 3

const effects = JSON.parse(await fs.readFile("effects.json", "utf8"));
assert.equal(effects.length, 5);
console.log("effects.json length =", effects.length); // effects.json length = 5

console.log("PASSED");
```

로컬에서 `node verify.mjs`를 돌리면 이렇게 출력됩니다.

```
rewindTo(3).turns = 3
effects.json length = 5
PASSED
```

첫 줄은 `rewindTo(3)`이 가장 새로운 5턴째로 재개한 것이 아니라 정말로 3턴째로 장면을 되돌렸음을 증명합니다. 둘째 줄은 되감기 행위가 판단 장면만 다시 세웠음을 증명합니다. 부수 효과 원장은 건드려지지 않았고, 그 턴들에서 진짜로 일어난 일의 기록 5건은 전부 그대로 남아 있습니다.

<!-- hint -->
'한 턴에서 마지막으로 쓰인 저장 지점'은 어떻게 판정합니까? A와 B는 사전순으로 정렬되고 이는 '도구 실행 전' → '도구 결과 기록 후'라는 시간 순서와 정확히 맞아떨어지므로, 정렬한 뒤 마지막 것을 집으면 됩니다. 별도의 타임스탬프는 필요 없습니다.

<!-- hint -->
부수 효과 원장은 체크포인트 연속과 완전히 독립된 별도 파일(`effects.json`)입니다. `rewindTo`에 그것을 건드리는 코드 줄이 없기만 하면 이 검증은 자연히 통과합니다. 특별히 '보호'할 필요는 없습니다.

<!-- /exercises -->

## 정리

- 체크포인트는 재해 복구용 보험만이 아니다. 보존된 체크포인트의 줄은 그 작업의 타임라인이고, 재개 너머로 되감기와 분기를 받쳐 준다 — 어느 커뮤니티 로드맵은 이 셋을 묶어 지속성 컴포넌트가 맡는 일로 틀 지운다[^S5]
- 되감기가 되돌리는 것은 **판단 장면**이지 **바깥 세계**가 아니다. 진짜로 일어난 외부 행동은 되감기로 무르지 못하고, 부수 효과 원장은 덧붙이기만 하는 채로 남는다 — 레슨 4의 멱등성 관점을 되감기 상황으로 옮겨 놓은 것이다
- 되감기를 받치려면 체크포인트를 덮어써서 최근 것만 남기는 대신 턴별 연속(`turn-014-A/B.json` 같은)으로 보존해야 한다. `rewindTo(turn)`은 그 턴에서 마지막으로 쓰인 저장 지점을 기본값으로 삼는다
- 분기는 같은 장면에서 독립적인 타임라인을 떠내며, 각자 자기 체크포인트 연속과 부수 효과 원장을 갖는다. 두 타임라인이 같은 영향이 큰 도구를 건드리게 된다면 승인 게이트를 달거나 드라이런 모드로 바꾸는 것을 잊지 말 것. 그러지 않으면 부수 효과가 두 배가 된다
- Claude Code는 되감기와 분기를 이미 제품 기능으로 내놓았다. 프롬프트마다 자동 생성되는 체크포인트, 대화와 코드를 따로 복원할 수 있는 `/rewind`, 분기를 위한 `/branch`와 `--fork-session`이다[^S2]. 그러나 자기 경계도 긋는다. bash 명령의 변경이 아니라 Claude 자신의 파일 편집 도구를 통한 편집만 추적하며[^S2], 빠른 세션 수준의 복구로 자리매김되어 장기 이력과 협업은 여전히 Git의 몫이다[^S2]
- 셋은 서로 다른 일을 맡는다. 체크포인트는 분 단위의 실행 중인 장면을, Git은 영구적이고 협업적인 코드 이력을, 부수 효과 원장은 이미 일어난 외부 부수 효과를 맡는다. 턴별 체크포인트 연속을 통째로 보존하는 데는 디스크 비용이 따르며, 그것이 값어치를 하는지는 작업 규모에 달렸지 어느 방식이 본래 옳으냐에 달린 것이 아니다[^S3]

[>> 레슨 6: 실습: 하네스에 체크포인팅과 재개를 배선하기](./06-build-checkpointing.md)
