# 레슨 6: 실습: 하네스에 관측 가능성 계층 붙이기

> 학습 목표:
> - 자기 하네스에 동작하는 관측 가능성 계층 붙이기: JSON Lines 구조화 로그, 로그에서 재구성한 트레이스 트리, 한 줄짜리 메트릭 요약
> - 실제 에러 작업을 증상 → 필터링 → 첫 이탈 지점 → 수정 → 재실행 비교까지 걸어 보고(전체 재실행은 모델 쪽을 스텁으로 고정했기 때문에 가능하며, 실제 API 를 붙이면 에러 지점부터 복구로 돌아간다), 어느 황당함이 원인이고 어느 것이 전염인지 설명하기
> - 이 관측 가능성 계층의 경계 긋기: 프로세스 하나와 실행 하나를 덮고, 내용은 기본적으로 꺼져 있으며, 임계값은 지어내지 않기
>
> 전제: 레슨 1–5 완료, 7번째 코스('에이전트 하네스 기초: 루프와 제어')의 하네스 루프를 실행할 수 있는 상태로 손에 두고 있을 것 | 이전: [레슨 5 <<](./05-hooks-and-debugging.md)

## 증상: summary.md 에 존재하지 않는 지역이 하나 더 있다

책상에서 냄새를 맡을 수 있는 구체적인 상황부터 시작합시다.

주간보고를 처리하는 작은 에이전트를 하나 썼습니다. `data/` 디렉터리에 분기 매출 CSV 세 개가 있고, 그것을 읽어 지역별로 집계한 뒤 `summary.md` 를 씁니다. 도구는 셋입니다. `list_files`, `read_file`, `write_file`. 몇 주 동안 잘 돌았습니다.

월요일 아침, 동료가 채팅으로 묻습니다. "이 'Central China' 지역은 어디서 나온 건가요? 우리한테 Central China 지역은 없는데요."

`summary.md` 를 열어 보니 정말로 있습니다.

```text
# 2026 Q1 지역별 매출 요약

| 지역 | 합계 (¥) |
| --- | --- |
| East China | 548550 |
| Central China | 208000 |
| North China | 432600 |
| 총계 | 1189150 |

데이터 출처: data/ 디렉터리의 CSV 파일
```

`data/` 를 열면 파일이 셋 있습니다. `2026-q1-east.csv`, `2026-q1-south.csv`, `2026-q1-north.csv` 이고, 내용의 지역 이름은 East China, South China, North China 입니다. 디렉터리 전체를 'Central China' 로 전문 검색하면 일치가 0건입니다. South China 는 흔적도 없이 사라졌고, Central China 는 난데없이 나타났으며, 208000 이라는 숫자도 출처가 불명입니다.

이제 물어야 할 것은 이겁니다. **어느 단계에서 잘못됐는가?**

관측 가능성 계층이 없으면 여러분 손에 있는 것은 둘입니다. 잘못 쓰인 `summary.md`, 그리고 "모델이 지어냈다"는 말. 그 말은 아무것도 풀어 주지 않습니다. 애초에 파일을 못 읽은 것인지, 읽었는데 계산을 틀린 것인지, 셋 다 읽었는데 쓸 때 행을 섞은 것인지 알 수 없습니다. 그렇다고 '브레이크포인트 걸고 재현하면 되지'도 안 됩니다. 에이전트는 실행마다 비결정적이고, 같은 프롬프트와 같은 도구로도 완전히 다르지만 똑같이 타당한 경로를 갈 수 있습니다[^S1]. 세 번 다시 돌리면 세 번 다 성공할 수도 있고, 네 번째에 새로운 방식으로 실패할 수도 있습니다.

게다가 에러는 누적됩니다. 한 단계의 실패가 에이전트를 완전히 다른 궤적으로 틀어 놓고, 최종 결과는 처음의 작은 결함과 무관해 보입니다[^S1]. 그러니 종점만 노려봐서는 안 됩니다. 종점의 황당함은 대개 **전염**일 뿐이고(레슨 1이 궤적 분기라고 부른 것과 같은 이야기입니다), 실제 병변은 상류의 어느 단계에 있습니다.

이번 레슨의 일은 '말할 수 없다'를 '확인할 수 있다'로 바꾸는 것입니다. 하네스에 관측 가능성 계층을 납땜한 다음, 이 진짜 버그를 한 번 걸어 짚어냅니다. 앞선 다섯 레슨의 모든 것이 실행 가능한 파일 하나에 내려앉습니다.

## 관측 가능성 세 종 세트: 무엇을 기록할 것인가

프로덕션에서 에이전트를 돌릴 때 필요한 가시성은 네 가지입니다. 어떤 도구를 불렀는지, 각 모델 요청이 얼마나 걸렸는지, 토큰을 얼마나 썼는지, 실패가 어디서 났는지[^S6]. 공식적인 접근은 이것을 OpenTelemetry 트레이스와 메트릭과 로그 이벤트로 내보내는 것입니다. 이번 레슨은 OTel 라이브러리를 하나도 끌어오지 않고 최소 버전을 손으로 만듭니다. 세 조각입니다.

1. **구조화 로그**: 모델 요청마다 JSON Lines 항목 하나, 도구 호출마다 하나. `run.log.jsonl` 에 씁니다.
2. **트레이스 트리**: 실행이 끝난 뒤 그 JSONL 에서 부모-자식 관계를 재구성해 들여쓰기로 출력합니다.
3. **메트릭 요약**: 총 라운드 수, 도구 호출 수, 토큰, 에러 수, 총 소요 시간을 한 줄로 냅니다.

### 스팬 모델: 누가 누구의 부모인가

공식적으로 향상된 텔레메트리를 켜면 에이전트 루프의 각 단계가 들여다볼 수 있는 스팬이 됩니다. 상호작용 하나가 루트 스팬이고, 모델 요청과 도구 실행이 그 자식 스팬입니다[^S6]. 공식 트리에서 모델 요청과 도구 호출은 루트 아래의 **대등한 형제**라는 점에 유의하세요. 레슨 4에서 여러분이 복원한 트리가 이 모양입니다. 우리 최소 버전은 일부러 다른 매달기를 씁니다. 도구 호출을 **그것을 촉발한 모델 요청** 아래에 답니다. 그러면 트리의 모양이 '이번 라운드에 모델이 무엇을 하려 했는가'를 바로 보여 주고, 같은 부모 아래 병렬 도구들이 한눈에 들어옵니다. 부모-자식 메커니즘은 완전히 같고, 도구에 대해 다른 부모를 골랐을 뿐입니다. 두 매달기 모두 타당하며, 어느 쪽을 고를지는 트리가 어떤 질문에 먼저 답해 주기를 원하는가에 달려 있습니다. 우리 세 계층은 이렇습니다.

```text
agent_run                 ← 실행 하나, 루트 기록
├─ model_call turn-1      ← messages.create 한 번
│  └─ tool_call ...       ← 이 모델 요청에서 나온 도구 호출
├─ model_call turn-2
│  ├─ tool_call ...       ← 같은 라운드에 병렬로 요청된 도구들은 형제
│  ├─ tool_call ...
│  └─ tool_call ...
└─ model_call turn-3
```

부모-자식 관계는 메모리상의 콜 스택에 기대지 않고 로그의 두 필드에 기댑니다. 기록마다 `span_id` 를 담고, 거기에 부모를 가리키는 `parent_id` 를 답니다. 트리는 **실행이 끝난 뒤 디스크의 JSONL 에서 재구성**되는 것이지 진행하면서 출력되는 게 아닙니다. 이 점이 중요합니다. 트리에 보이는 것은 무엇이든 먼저 로그에 기록돼 있어야 합니다. 트리에서 뭔가 빠져 있다면 그건 출력 코드의 문제가 아니라 기록 코드의 문제입니다.

### 필드 표

아래 필드 설계는 이번 레슨의 엔지니어링 방식이지 공식 명세가 아닙니다. 공식적으로는 OTel 스팬 속성 이름이고, 자기 하네스를 쓸 때 필드 이름은 여러분 마음입니다. 레슨 3, 4와 이름이 다른 것이 넷 있으니 오타로 오해하지 않도록 먼저 대응시켜 둡니다. 레슨 3의 `type` 을 여기서는 `kind` 라 부릅니다(그때는 기록 종류가 둘뿐이었지만 지금은 `agent_run` 이 있어서 의미가 더 넓은 말이 맞습니다). `input_tokens`/`output_tokens` 는 `tokens:{input,output}` 객체로 접었습니다(모델 호출에만 있는 것끼리 묶었습니다). `tool_response` 는 여기서 `tool_result` 라 부릅니다(훅 페이로드는 response 라 부르지만, 여기서 반환값은 도구 구현에서 바로 오므로 API 콘텐츠 블록의 이름을 따릅니다). 레슨 4의 `parent_span_id` 는 `parent_id` 로 줄였습니다. 대가도 말해 둡니다. 레슨 3의 `stats.mjs` 로 이 로그를 읽으려면 필드 이름 두 개를 바꿔야 합니다. '예쁜 이름보다 어휘 정렬이 중요하다'는 것의 살아 있는 시연입니다. 필드 **어휘** 자체는 여전히 공식 자료와 맞춰 둘 값어치가 있습니다. 나중에 백엔드를 붙일 때 개념을 갈아 끼울 필요 없이 철자만 바꾸면 되도록요.

| 필드 | 담는 것 | 왜 필요한가 |
| --- | --- | --- |
| `ts` | ISO 타임스탬프 | 정렬, 시간 정렬, 프로세스를 가로질러 맞출 수 있는 유일한 것 |
| `trace_id` | 실행당 하나 | 흩어진 줄을 같은 실행으로 되묶는다 |
| `span_id` / `parent_id` | 이 기록의 / 부모 기록의 id | 트리를 재구성한다. '누가 누구 아래인지'를 알아보는 근거 |
| `kind` | `model_call` / `tool_call` / `agent_run` | 거를 때 가장 먼저 쓰는 필드 |
| `name` | `turn-2` / `read_file` | 사람 눈이 가장 먼저 보는 것 |
| `duration_ms` | 이 단계에 쓴 시간 | 성능 병목 찾기, '멈춰 있는가'를 보는 데도 쓴다 |
| `tokens` | 모델 호출의 in / out | 공식 데이터에서 토큰 사용량 자체가 가장 강력한 단일 설명 변수다[^S1] |
| `tool_input` / `tool_result` | 형태 + 길이 + 잘라 낸 발췌 | '파라미터가 맞는가' '반환이 비었는가'를 판정 |
| `error` | 에러 메시지 발췌, 없으면 `null` | 짚어낼 때 가장 먼저 거르는 필드 |

`trace_id` 수법은 공식에서 배운 것입니다. 사용자 프롬프트 하나가 여러 API 호출과 여러 도구를 촉발하고, 공식은 `prompt.id` 속성으로 그것들을 촉발한 프롬프트로 되묶습니다. 공식의 트레이싱 접근도 직접적입니다. 프롬프트 하나가 촉발한 활동 전부를 추적하려면 특정 `prompt.id` 값으로 이벤트를 거르라는 것입니다[^S4]. 여기서는 `trace_id` 를 씁니다. 실행 하나가 작업 하나이므로 `trace_id` 를 쓰는 것이고, 하는 일은 정확히 같습니다. 참고로 여기에는 `session_id` 가 없습니다. 이 스크립트의 실행 하나가 세션 하나라서 이 필드를 두면 의미가 없습니다. 여러 라운드, 여러 세션 시나리오에서는 다시 넣으면 되고, 어휘는 레슨 3을 참조하세요.

메트릭 줄도 아무렇게나 고른 게 아닙니다. 최상위 정확도 외에 공식이 수집을 권하는 것은 개별 도구 호출과 작업의 총 실행 시간, 총 도구 호출 수, 총 토큰 소비, 도구 에러입니다[^S3]. 이 넷이 요약 줄과 각 기록의 `duration_ms` 에 내려앉을 자리를 가지고 있습니다. `rounds` 는 제가 추가한 다섯 번째 숫자로, 루프가 몇 바퀴 돌았는지 한눈에 보기 좋습니다. 10번째 코스('검증과 품질 보증: 맞아 보이는 것을 그냥 넘기지 않기')에서 이미 공식 세트를 써 봤습니다. 거기서는 채점용이었고 여기서는 같은 자로 진단하는 것입니다.

### 내용을 얼마나 기록할 것인가: 이번 레슨이 여러분더러 직접 그으라는 유일한 선

`tool_input` 과 `tool_result` 는 CSV 전체일 수도, 사용자 입력 전체일 수도, 써낸 문서 전체일 수도 있습니다. 전부 기록하는 것은 기술적으로 한 줄이지만, 기본값으로는 그러면 안 됩니다.

공식 텔레메트리의 기본 자세는 분명합니다. **구조적인 것은 항상 기록하고, 내용은 기록하지 않습니다**. 모든 스팬에 소요 시간과 모델 이름과 도구 이름이 기록되고 토큰 수는 API 가 usage 를 반환할 때 기록되는 반면, 에이전트가 읽고 쓴 내용은 기본적으로 수집되지 않습니다[^S6]. 사용자 프롬프트도 마찬가지여서 기본은 길이만 기록하고, 내용을 기록하려면 별도의 환경 변수가 필요합니다[^S4]. 그리고 공식은 이런 종류의 스위치에 단단한 문장을 함께 답니다. 여러분의 관측 가능성 파이프라인이 에이전트가 다루는 데이터를 저장해도 된다고 승인받은 게 아니라면 이 값들은 설정하지 말고 두라는 것입니다[^S6].

우리 계층은 절충을 하나 남겼습니다. 기본으로 `shape`(문자열인지 객체인지, 얼마나 긴지, 어떤 키가 있는지)와 `chars`(문자 수), 거기에 앞 60자 발췌를 머리 요약으로 기록합니다. 발췌는 자기가 디버그할 때 '이번에 읽은 게 어느 파일이지'를 한눈에 알아보고 반복해서 다시 돌리지 않기 위한 것입니다. 코드의 `HEAD_CHARS = 60` 이 이 선의 위치이고, `0` 으로 두면 내용은 한 글자도 디스크에 닿지 않습니다. 여러분 프로젝트에서 이 선을 어디에 그을지는 로그가 어디에 떨어지는지, 누가 볼 수 있는지, 데이터 승인을 통과했는지에 달려 있습니다. 이건 기술 문제가 아니라 컴플라이언스 문제입니다.

## 검증 장치: 세 버전의 차이를 어디에 못 박았는가

이번 레슨은 세 번 실행합니다. 정상 한 번, 버그 한 번, 수정 한 번. 세 출력이 한 줄씩 대조 가능해야 하므로 **모델 응답이 진짜여서는 안 됩니다**. 진짜 모델 응답은 매번 다르고, 그것으로는 짚어내기를 가르칠 수 없습니다. 이 시리즈 8–10번째 코스의 방식을 그대로 따릅니다. **고정 응답 큐를 가진 스텁 클라이언트**입니다. `client.messages.create()` 는 네트워크 요청을 보내지 않고 배열에 미리 써 둔 응답 객체를 순서대로 반환하며, 각 객체는 완전한 `stop_reason`, `content`, `usage` 를 담습니다. 하네스 루프는 한 글자도 바뀌지 않습니다. 루프가 받는 것은 진짜 클라이언트가 반환하는 것과 형태가 동일합니다.

세 버전의 차이는 전부 코드의 `VERSIONS` 표에 못 박혀 있고, 버전마다 두 가지를 가집니다.

| 버전 | 응답 큐 | `read_file` 에러 메시지 | 결과 |
| --- | --- | --- | --- |
| `v-good` | CSV 셋을 모두 올바르게 읽음 | 불투명 버전 | `summary.md` 정확 |
| `v-bug` | 두 번째 파일명을 `sourth` 로 오타 | 불투명 버전 | Central China 지역을 지어냄 |
| `v-fixed` | 같은 `sourth` 오타 | 실행 가능한 조언 버전 | 정확 |

이 표 말고는 **나머지 모든 코드 줄이 세 버전에 공유됩니다**. 도구는 진짜로 디스크를 읽고 씁니다. `list_files` 는 진짜로 `readdirSync` 하고, `read_file` 은 진짜로 파일을 읽으며 파일이 없으면 진짜로 던지고, `write_file` 은 진짜로 `summary.md` 를 디스크에 씁니다. 그러니 `v-bug` 의 그 에러는 위조된 에러 객체가 아니라 파일 시스템이 진짜로 그 파일을 못 찾은 것입니다.

분명히 해 둘 것. 스텁은 '모델 쪽이 재현 가능하다'를 풀지 '에이전트가 결정적이다'를 풀지 않습니다. 실제로 돌리면 같은 프롬프트라도 두 번이 서로 다른 도구를 고르고 다른 경로를 갈 수 있습니다[^S1]. 이 관측 가능성 계층의 가치가 정확히 여기 있습니다. 경로는 매번 다르지만 매번 되짚어 볼 기록이 남습니다.

분명히 말해 둘 것이 하나 더 있습니다. 스텁이 모델 쪽을 고정하기 때문에 전체 재실행이 성립하는 것이고, 실제 API 를 붙이면 에러 지점부터 복구로 돌아갑니다. 이번 레슨이 전체 재실행을 감행하는 이유는 모델 쪽이 스텁으로 고정돼 있어서입니다. 재실행이 새 변수를 들이지 않으므로 한 줄씩 대조가 성립합니다. 실제 API 를 붙이면 스텁은 사라지고, 레슨 5의 방식으로 돌아갑니다. 에러 지점부터 복구하는 것입니다.

## 전체 코드: observed-agent.mjs

파일 하나, 의존성 0, 맨 `node` 로 돕니다. `observed-agent.mjs` 로 저장한 뒤 `node observed-agent.mjs --version v-bug` 로 실행합니다.

```javascript
#!/usr/bin/env node
// observed-agent.mjs —— 하네스에 관측 가능성 계층 붙이기 (구조화 로그 + 트레이스 트리 + 메트릭 요약)
// 사용법: node observed-agent.mjs --version v-good|v-bug|v-fixed
// 의존성 0, 맨 node 로 실행됩니다. 모델 호출은 고정 응답 큐를 가진 스텁 클라이언트가 구동하며, 세 버전의 차이는 아래 VERSIONS 테이블에 있습니다.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 4096;
const MAX_ROUNDS = 12;      // 루프 상한. 넘으면 폭주로 보고 0 이 아닌 코드로 종료
const HEAD_CHARS = 60;      // 로그에 남길 내용 발췌의 최대 문자 수. 0 으로 두면 한 글자도 기록하지 않음

// ============ 1. 대상 작업: data/ 에서 매출 CSV 몇 개를 읽어 지역별로 집계하고 summary.md 를 쓴다 ============

const CSV_FILES = {
  "2026-q1-east.csv":
    "region,month,amount\nEast China,2026-01,182400\nEast China,2026-02,161250\nEast China,2026-03,204900\n",
  "2026-q1-south.csv":
    "region,month,amount\nSouth China,2026-01,97300\nSouth China,2026-02,88600\nSouth China,2026-03,120450\n",
  "2026-q1-north.csv":
    "region,month,amount\nNorth China,2026-01,143000\nNorth China,2026-02,150700\nNorth China,2026-03,138900\n",
};

function setupWorkspace(root) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  for (const [name, body] of Object.entries(CSV_FILES)) {
    fs.writeFileSync(path.join(root, "data", name), body);
  }
}

// ============ 2. 도구 세 개 (실제로 디스크를 읽고 쓰며, 에러도 진짜 에러다) ============

const tools = [
  {
    name: "list_files",
    description: "디렉터리의 파일명을 사전순으로 정렬해 한 줄에 하나씩 반환합니다.",
    input_schema: {
      type: "object",
      properties: { dir: { type: "string", description: "작업 디렉터리 기준 상대 경로. 예: data" } },
      required: ["dir"],
    },
  },
  {
    name: "read_file",
    description: "경로로 텍스트 파일을 읽어 전문을 반환합니다. 경로는 list_files 가 반환한 원래 파일명을 그대로 써야 합니다.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "작업 디렉터리 기준 파일 경로" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "지정한 경로에 텍스트를 씁니다. 같은 이름의 파일은 덮어씁니다.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "작업 디렉터리 기준 파일 경로" },
        content: { type: "string", description: "쓸 전체 텍스트" },
      },
      required: ["path", "content"],
    },
  },
];

function resolveInRoot(root, p) {
  const abs = path.resolve(root, p);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`경로가 경계를 벗어납니다. 접근을 거부합니다: ${p}`);
  }
  return abs;
}

const impls = {
  list_files({ dir }, ctx) {
    const abs = resolveInRoot(ctx.root, dir);
    return fs.readdirSync(abs).sort().join("\n");
  },
  read_file({ path: p }, ctx) {
    const abs = resolveInRoot(ctx.root, p);
    if (fs.existsSync(abs)) return fs.readFileSync(abs, "utf8");
    // 같은 '파일을 찾을 수 없음'이지만 메시지가 두 벌이다. v-fixed 는 실행 가능한 조언 쪽을 쓴다.
    if (ctx.errorStyle === "actionable") {
      const available = fs
        .readdirSync(path.join(ctx.root, "data"))
        .sort()
        .map((f) => `data/${f}`)
        .join(", ");
      throw new Error(
        `${p} 파일을 찾을 수 없습니다. 현재 data/ 에 있는 것: ${available}. ` +
          `list_files 가 반환한 원래 파일명으로 다시 시도하세요. 필요한 데이터가 정말로 없다면 ` +
          `멈추고 어떤 파일이 없는지 사용자에게 알리세요. 없는 수치를 직접 추정하지 마세요.`
      );
    }
    throw new Error(`ENOENT: no such file or directory, open '${p}'`);
  },
  write_file({ path: p, content }, ctx) {
    const abs = resolveInRoot(ctx.root, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    return `${p} 기록 완료 (${content.length}자)`;
  },
};

// ============ 3. 스텁 클라이언트: 고정 응답 큐 ============

const SUMMARY_CORRECT = `# 2026 Q1 지역별 매출 요약

| 지역 | 합계 (¥) |
| --- | --- |
| East China | 548550 |
| South China | 306350 |
| North China | 432600 |
| 총계 | 1287500 |

데이터 출처: data/2026-q1-east.csv, data/2026-q1-south.csv, data/2026-q1-north.csv
`;

const SUMMARY_FABRICATED = `# 2026 Q1 지역별 매출 요약

| 지역 | 합계 (¥) |
| --- | --- |
| East China | 548550 |
| Central China | 208000 |
| North China | 432600 |
| 총계 | 1189150 |

데이터 출처: data/ 디렉터리의 CSV 파일
`;

const say = (text) => ({ type: "text", text });
const call = (id, name, input) => ({ type: "tool_use", id, name, input });
const turn = (stop_reason, content, input_tokens, output_tokens) => ({
  id: `msg_stub_${crypto.randomBytes(3).toString("hex")}`,
  model: MODEL,
  stop_reason,
  content,
  usage: { input_tokens, output_tokens },
});

const READ_EAST = call("toolu_e", "read_file", { path: "data/2026-q1-east.csv" });
const READ_NORTH = call("toolu_n", "read_file", { path: "data/2026-q1-north.csv" });
const READ_SOUTH = call("toolu_s", "read_file", { path: "data/2026-q1-south.csv" });
const READ_TYPO = call("toolu_x", "read_file", { path: "data/2026-q1-sourth.csv" });

const VERSIONS = {
  // 순조로운 경우: CSV 세 개를 다 읽고 집계도 맞다.
  "v-good": {
    errorStyle: "opaque",
    queue: [
      turn("tool_use", [say("먼저 data/ 에 어떤 파일이 있는지 봅니다."), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("지역별 CSV 세 개군요. 한꺼번에 읽습니다."), READ_EAST, READ_SOUTH, READ_NORTH], 946, 218),
      turn("tool_use", [say("세 지역을 모두 확보했으니 집계를 씁니다."), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_CORRECT })], 1584, 342),
      turn("end_turn", [say("summary.md 를 썼습니다. East China 548550, South China 306350, North China 432600, 총계 1287500.")], 1961, 74),
    ],
  },
  // 버그 버전: 두 번째 CSV 파일명을 잘못 적었고, 도구는 불투명한 에러를 반환하며, 모델은 멈추지 않고 지역을 하나 지어내 계속 쓴다.
  "v-bug": {
    errorStyle: "opaque",
    queue: [
      turn("tool_use", [say("먼저 data/ 에 어떤 파일이 있는지 봅니다."), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("지역별 CSV 세 개군요. 한꺼번에 읽습니다."), READ_EAST, READ_TYPO, READ_NORTH], 946, 218),
      turn("tool_use", [say("데이터가 갖춰졌으니 집계를 씁니다."), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_FABRICATED })], 1602, 355),
      turn("end_turn", [say("summary.md 를 썼습니다. East China 548550, Central China 208000, North China 432600, 총계 1189150.")], 1990, 81),
    ],
  },
  // 수정 버전: 오타는 그대로지만 에러 메시지를 실행 가능한 조언 쪽으로 바꿨고, 모델은 지어내는 대신 다시 시도한다.
  "v-fixed": {
    errorStyle: "actionable",
    queue: [
      turn("tool_use", [say("먼저 data/ 에 어떤 파일이 있는지 봅니다."), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("지역별 CSV 세 개군요. 한꺼번에 읽습니다."), READ_EAST, READ_TYPO, READ_NORTH], 946, 218),
      turn("tool_use", [say("파일명을 sourth 로 잘못 적었군요. 에러 메시지에 있는 원래 파일명으로 다시 읽습니다."), READ_SOUTH], 1688, 64),
      turn("tool_use", [say("세 지역을 모두 확보했으니 집계를 씁니다."), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_CORRECT })], 1849, 342),
      turn("end_turn", [say("summary.md 를 썼습니다. East China 548550, South China 306350, North China 432600, 총계 1287500. 참고로 처음에 파일명을 data/2026-q1-sourth.csv 로 잘못 적어서, list_files 가 준 원래 이름으로 다시 시도했습니다. data/ 바깥에 다른 지역 데이터가 있다면 파일 위치를 알려주세요. 제가 수치를 직접 채워 넣지는 않겠습니다.")], 2226, 118),
    ],
  },
};

function makeStubClient(queue) {
  let i = 0;
  return {
    messages: {
      async create(req) {
        if (!req.model || !req.max_tokens) {
          throw new Error("스텁 클라이언트: create 는 model 과 max_tokens 를 반드시 받아야 합니다");
        }
        if (i >= queue.length) {
          const err = new Error(`스텁 큐 소진: ${i + 1} 번째 요청에 대한 사전 응답이 없습니다`);
          err.code = "STUB_QUEUE_EXHAUSTED";
          throw err;
        }
        return queue[i++];
      },
    },
  };
}

// ============ 4. 관측 가능성 계층 첫 번째 조각: 구조화 로그 (JSON Lines) ============

const newId = (prefix) => `${prefix}-${crypto.randomBytes(4).toString("hex")}`;

function shapeOf(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "string") return `string(${value.length})`;
  if (typeof value === "object") return `object{${Object.keys(value).join(",")}}`;
  return typeof value;
}

// 기본값은 shape + 길이 + 앞 HEAD_CHARS 글자 발췌만 기록하고, 전문은 남기지 않는다.
function summarize(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const out = { shape: shapeOf(value), chars: text.length };
  if (HEAD_CHARS > 0) {
    const flat = text.replace(/\s+/g, " ").trim();
    out.head = flat.length > HEAD_CHARS ? `${flat.slice(0, HEAD_CHARS)}…` : flat;
  }
  return out;
}

function createLogger(logPath, traceId) {
  fs.writeFileSync(logPath, "");
  return {
    record(fields) {
      const line = { ts: new Date().toISOString(), trace_id: traceId, ...fields };
      fs.appendFileSync(logPath, `${JSON.stringify(line)}\n`);
    },
  };
}

// ============ 5. 관측 가능성 계층 두 번째 조각: JSONL 에서 트레이스 트리 재구성 ============

function buildTree(records) {
  const byId = new Map(records.map((r) => [r.span_id, { ...r, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function labelOf(n) {
  const name = n.name.padEnd(13);
  const dur = `${String(n.duration_ms).padStart(3)}ms`;
  if (n.kind === "agent_run") return `agent_run  ${name}${dur}  trace_id=${n.trace_id}`;
  if (n.kind === "model_call") {
    const t = n.tokens;
    return `model_call ${name}${dur}  in=${t.input} out=${t.output}  stop=${n.stop_reason}`;
  }
  if (n.kind === "harness_error") return `harness_err ${name}${dur}  ${n.error.head ?? n.error.shape}`;
  const inHead = clip(n.tool_input.head ?? n.tool_input.shape, 34);
  const out = n.error ? `ERROR ${clip(n.error.head ?? n.error.shape, 44)}` : `ok ${n.tool_result.shape}`;
  return `tool_call  ${name}${dur}  in=${inHead}  ${out}`;
}

function renderTree(nodes, prefix, lines) {
  nodes.forEach((node, idx) => {
    const last = idx === nodes.length - 1;
    lines.push(prefix === null ? labelOf(node) : `${prefix}${last ? "└─ " : "├─ "}${labelOf(node)}`);
    const childPrefix = prefix === null ? "" : `${prefix}${last ? "   " : "│  "}`;
    renderTree(node.children, childPrefix, lines);
  });
  return lines;
}

// ============ 6. 관측 가능성 계층 세 번째 조각: 메트릭 요약 ============

function metricsOf(records) {
  const model = records.filter((r) => r.kind === "model_call");
  const tool = records.filter((r) => r.kind === "tool_call");
  const root = records.find((r) => r.kind === "agent_run");
  return {
    // 이 하네스에서는 한 라운드가 모델 요청 한 번이므로 rounds 는 model_call 수를 그대로 쓴다.
    // 스텁 큐가 소진돼 harness_error 를 던지면 마지막 라운드에 대응하는 model_call 이 없어서, 그 실행에서는 두 수가 1 만큼 어긋난다
    rounds: model.length,
    model_calls: model.length,
    tool_calls: tool.length,
    errors: records.filter((r) => r.error).length,
    tokens_in: model.reduce((s, r) => s + r.tokens.input, 0),
    tokens_out: model.reduce((s, r) => s + r.tokens.output, 0),
    wall_ms: root ? root.duration_ms : 0,
  };
}

// ============ 7. 관측되는 하네스 루프 ============

async function runToolUses(content, ctx) {
  const results = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    const spanId = newId("span");
    const startedAt = Date.now();
    const base = {
      span_id: spanId,
      parent_id: ctx.parentId,
      kind: "tool_call",
      name: block.name,
      tool_input: summarize(block.input),
    };
    try {
      const impl = impls[block.name];
      if (!impl) throw new Error(`알 수 없는 도구: ${block.name}`);
      const result = impl(block.input, ctx);
      ctx.log.record({ ...base, duration_ms: Date.now() - startedAt, tool_result: summarize(result), error: null });
      results.push({ type: "tool_result", tool_use_id: block.id, content: result });
    } catch (e) {
      ctx.log.record({ ...base, duration_ms: Date.now() - startedAt, tool_result: null, error: summarize(e.message) });
      results.push({ type: "tool_result", tool_use_id: block.id, content: e.message, is_error: true });
    }
  }
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const version = argv[argv.indexOf("--version") + 1];
  if (!argv.includes("--version") || !VERSIONS[version]) {
    console.error("사용법: node observed-agent.mjs --version v-good|v-bug|v-fixed");
    process.exit(2);
  }

  const root = path.resolve(process.cwd(), "runs", version);
  setupWorkspace(root);

  const traceId = newId("tr");
  const log = createLogger(path.join(root, "run.log.jsonl"), traceId);
  const rootSpan = newId("span");
  const runStartedAt = Date.now();

  const { queue, errorStyle } = VERSIONS[version];
  const client = makeStubClient(queue);
  const ctx = { root, errorStyle, log, parentId: rootSpan };
  const messages = [
    {
      role: "user",
      content: "data/ 디렉터리의 매출 CSV 를 지역별 합계로 집계해 summary.md 에 쓰세요. 파일에 실제로 존재하는 데이터만 사용하세요.",
    },
  ];

  let rounds = 0;
  let exitCode = 0;
  const callModel = async () => {
    const spanId = newId("span");
    const startedAt = Date.now();
    rounds += 1;
    const response = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, tools, messages });
    log.record({
      span_id: spanId,
      parent_id: rootSpan,
      kind: "model_call",
      name: `turn-${rounds}`,
      duration_ms: Date.now() - startedAt,
      stop_reason: response.stop_reason,
      tokens: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      error: null,
    });
    ctx.parentId = spanId;
    return response;
  };

  try {
    let response = await callModel();
    while (response.stop_reason === "tool_use") {
      if (rounds >= MAX_ROUNDS) throw new Error(`MAX_ROUNDS=${MAX_ROUNDS} 를 초과했습니다. 폭주로 판단합니다`);
      messages.push({ role: "assistant", content: response.content });
      const toolResults = await runToolUses(response.content, ctx);
      messages.push({ role: "user", content: toolResults });
      response = await callModel();
    }
  } catch (e) {
    log.record({
      span_id: newId("span"),
      parent_id: rootSpan,
      kind: "harness_error",
      name: e.code ?? "harness_error",
      duration_ms: 0,
      error: summarize(e.message),
    });
    console.error(`하네스 중단: ${e.message}`);
    exitCode = 2;
  }

  log.record({
    span_id: rootSpan,
    parent_id: null,
    kind: "agent_run",
    name: "sales-summary",
    duration_ms: Date.now() - runStartedAt,
    error: null,
  });

  // 실행이 끝난 뒤 디스크의 JSONL 만으로 뷰를 재구성한다. 메모리에 있던 사본은 치지 않는다.
  const records = fs
    .readFileSync(path.join(root, "run.log.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const m = metricsOf(records);
  console.log(`\n=== 트레이스 트리 (${version}, run.log.jsonl 에서 재구성) ===`);
  console.log(renderTree(buildTree(records), null, []).join("\n"));
  console.log(
    `\n=== 메트릭 요약 (${version}) ===\n` +
      `rounds=${m.rounds} model_calls=${m.model_calls} tool_calls=${m.tool_calls} ` +
      `errors=${m.errors} tokens_in=${m.tokens_in} tokens_out=${m.tokens_out} ` +
      `tokens_total=${m.tokens_in + m.tokens_out} wall=${m.wall_ms}ms`
  );
  console.log(`로그: runs/${version}/run.log.jsonl　산출물: runs/${version}/summary.md`);
  process.exit(exitCode);
}

main();
```

따로 짚어 둘 것 몇 가지.

- **루프 자체는 바뀌지 않았습니다.** 7번째 코스('에이전트 하네스 기초: 루프와 제어')의 그 `while (response.stop_reason === "tool_use")` 는 한 글자도 움직이지 않았고, 관측 가능성이 바깥을 감쌌을 뿐입니다. `callModel()` 이 요청 전후로 타임스탬프를 기록하고, `runToolUses()` 가 도구 블록마다 try/catch 와 타이머를 둘렀습니다. 그 두 겹을 벗기면 원래의 루프가 남습니다.
- **`MAX_ROUNDS` 는 하드 게이트입니다.** 에이전트에는 최대 반복 횟수 같은 정지 조건이 필요하고, 이것은 제어의 일부입니다[^S2]. 넘으면 에러를 던지고 `harness_error` 를 기록하며 종료 코드 2 로 끝납니다.
- **종료 코드의 분업.** 이 스크립트는 실행과 기록만 맡습니다. 실행이 끝나면 0 이고, 파라미터가 잘못됐거나 폭주하면 0 이 아닙니다. '출력이 맞는가'는 10번째 코스('검증과 품질 보증: 맞아 보이는 것을 그냥 넘기지 않기')의 검증 스위트가 할 일입니다. `v-bug` 도 0 으로 끝난다는 점에 유의하세요. 하네스는 순조롭게 끝났다고 생각합니다. 검증은 망가졌는지를 알려 주고, 이 계층은 왜인지를 알려 줍니다.
- **도구 에러는 루프를 깨지 않습니다.** 에러는 `is_error: true` 인 `tool_result` 로 감싸여 모델에게 되돌아가고 루프는 계속됩니다. 이게 맞습니다. 에이전트는 진행 상황을 판단하기 위해 각 단계에서 환경으로부터 그라운드 트루스를 얻어야 하고[^S2], 에러도 피드백이니까요. 이번 레슨의 버그 전체가 그 문장의 후반부에서 일어납니다. 피드백은 주어졌는데, 너무 형편없이 주어진 것입니다.

## 첫 실행은 순조롭게: v-good

정상이 어떤 모습인지부터 봅시다. 아래 터미널 출력과 이후의 모든 터미널 출력은 **실제로 돌린 것이지 손으로 쓴 예시가 아닙니다**.

```text
$ node observed-agent.mjs --version v-good

=== 트레이스 트리 (v-good, run.log.jsonl 에서 재구성) ===
agent_run  sales-summary  2ms  trace_id=tr-48ed2acc
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(98)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-south.csv"}  ok string(99)
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(101)
├─ model_call turn-3         0ms  in=1584 out=342  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(23)
└─ model_call turn-4         0ms  in=1961 out=74  stop=end_turn

=== 메트릭 요약 (v-good) ===
rounds=4 model_calls=4 tool_calls=5 errors=0 tokens_in=5303 tokens_out=730 tokens_total=6033 wall=2ms
로그: runs/v-good/run.log.jsonl　산출물: runs/v-good/summary.md
```

여러분의 `trace_id`, `span_id`, `ts` 와 밀리초 수치는 제 것과 다를 겁니다. id 는 실행마다 무작위로 생성되고 밀리초는 진짜 소요 시간이니까요. 그것들 말고는 모든 줄이 글자 그대로 일치해야 합니다.

이 트리를 아래로 읽으면 완결된 문장 하나입니다. 먼저 디렉터리를 나열하고(`turn-1`), 그다음 **한 라운드에서 파일 셋을 병렬로 읽고**(`turn-2` 아래 형제 노드 셋), 그다음 파일을 쓰고(`turn-3`), 마지막으로 마무리합니다(`turn-4`, `stop=end_turn`). 그 병렬 세 줄은 같은 모델 응답 안의 `tool_use` 블록 셋이라서 `parent_id` 가 같은 `model_call` 을 가리킵니다. 트리의 모양이 '이번 라운드에 모델이 무엇을 하려 했는가'를 바로 보여 주는 것이죠.

`model_call` 의 그 `0ms` 열은 진지하게 받아들이지 마세요. 스텁 클라이언트에는 네트워크 왕복이 없어서 모델 요청 소요 시간이 전부 0 입니다. 실제 API 를 붙이면 이 열이 진단 가치를 얻습니다. API 요청 시간과 도구 실행 시간을 추적하는 것이 바로 성능 병목을 찾기 위한 것이니까요[^S4].

로그 파일은 이렇게 생겼습니다. 한 줄에 완전한 JSON 하나씩이라 곧바로 `grep` 할 수 있습니다.

```text
$ head -3 runs/v-good/run.log.jsonl
{"ts":"2026-08-29T16:34:32.593Z","trace_id":"tr-48ed2acc","span_id":"span-5e1aaf7c","parent_id":"span-f1c5bf43","kind":"model_call","name":"turn-1","duration_ms":0,"stop_reason":"tool_use","tokens":{"input":812,"output":96},"error":null}
{"ts":"2026-08-29T16:34:32.595Z","trace_id":"tr-48ed2acc","span_id":"span-930aaab5","parent_id":"span-5e1aaf7c","kind":"tool_call","name":"list_files","tool_input":{"shape":"object{dir}","chars":14,"head":"{\"dir\":\"data\"}"},"duration_ms":0,"tool_result":{"shape":"string(52)","chars":52,"head":"2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv"},"error":null}
{"ts":"2026-08-29T16:34:32.595Z","trace_id":"tr-48ed2acc","span_id":"span-bf13367d","parent_id":"span-f1c5bf43","kind":"model_call","name":"turn-2","duration_ms":0,"stop_reason":"tool_use","tokens":{"input":946,"output":218},"error":null}
```

두 번째 줄이 그 `list_files` 입니다. `parent_id` 가 첫 줄의 `span_id` 를 가리키고(그래서 `turn-1` 아래에 매달립니다), `tool_input` 안에는 형태와 길이와 작은 발췌만 있고 `tool_result` 도 마찬가지입니다. `shape` 는 `string(52)` 이고 `head` 에는 파일 이름 셋이 들어 있습니다. 이 줄에는 '파일 내용'이 1바이트도 없지만, '이 단계가 무엇을 불렀고 어떤 형태의 것을 받았고 에러가 났는가'에는 이미 답할 수 있습니다.

메트릭 요약 줄을 다시 봅시다. 4라운드, 도구 호출 5회, 에러 0, 토큰 6033, 줄 끝에 총 소요 시간. 이 숫자 한 줄은 실행이 끝날 때마다 한 번씩 볼 값어치가 있습니다. 도구 호출 수는 에이전트가 반복해서 걷는 고정 루틴을 드러낼 수 있고, 중복된 호출 더미는 페이지네이션이나 토큰 제한 파라미터를 조정해야 한다는 신호인 경우가 많으며, 잘못된 파라미터로 인한 에러 더미는 도구 설명을 더 명확히 쓰고 예시를 더 잘 줘야 한다는 뜻일 수 있습니다[^S3]. 토큰은 특히 볼 값어치가 있습니다. 평가 성능을 분석할 때 공식은 토큰 사용량 자체가 분산의 80%를 설명하고 나머지 두 설명 요인은 도구 호출 수와 모델 선택임을 발견했습니다[^S1].

```agentmentor-check
{
  "id": "obs-zh-06-log-everything",
  "label": "도구 입출력을 얼마나 기록할 것인가",
  "prompt": "이 관측 가능성 계층을 프로젝트에 막 붙였습니다. 동료가 로그를 보더니 tool_input 과 tool_result 에 앞 60자 발췌만 있는 게 너무 인색하다며, 도구 호출마다 완전한 입출력 전문을 기록하도록 바꾸자고 제안합니다. '어차피 디스크는 싸고, 다 기록해서 나쁠 것 없고, 진짜 뭔가 터지면 전부 거기 있다'는 것입니다. 어떻게 답하겠습니까?",
  "whyHere": "독자는 방금 진짜 run.log.jsonl 을 봤고 거기서 head 필드가 실제로 잘려 있었습니다. 이번 레슨의 관측 가능성 계층에서 선을 직접 그으라고 하는 유일한 설계 결정이자, '다 기록해서 나쁠 것 없다'는 직관에 가장 쉽게 휘둘리는 자리입니다. 기본 자세와 전문 기록의 전제 조건을 이해했는지 확인하기 좋은 지점입니다.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "동의합니다. 디스크는 정말 싸고 전문을 기록하는 편이 가장 확실하며, 뭔가 터졌을 때 현장을 복원하려고 다시 돌릴 필요가 없습니다",
      "correct": false,
      "feedback": "'다 기록해서 나쁠 것 없다'는 디스크 차원에서만 성립합니다. 로그에 앉아 있는 것은 에이전트가 읽고 쓴 업무 내용입니다. 사용자 입력, 파일 내용, 써낸 문서. 이것들이 '운영 로그'로만 승인된 장소에 내려앉는 순간 관리되지 않는 민감 데이터 사본이 됩니다. 게다가 파일이 빠르게 부풉니다. 한 번 실행에 기록 수십 개, 각각에 수 KB 전문을 채워 넣으면 수천 번 실행 뒤에는 grep 한 번도 오래 걸려서 오히려 찾기가 어려워집니다. 정말로 전문이 필요할 때의 올바른 방법은 세션 트랜스크립트 자체를 읽는 것이지, 텔레메트리 로그에 사본을 쌓아 두는 것이 아닙니다."
    },
    {
      "id": "b",
      "text": "기본은 여전히 구조와 발췌를 기록합니다. 형태, 길이, 앞 수십 자면 '어느 단계, 어느 파라미터, 반환이 비었는가'를 짚기에 충분합니다. 전문을 기록하려면 먼저 로그가 내려앉는 곳이 이런 종류의 데이터를 저장해도 되는지 승인을 확인하고, 표본 점검에 전문이 필요하면 세션 트랜스크립트를 읽으러 갑니다",
      "correct": true,
      "feedback": "맞습니다. 공식 텔레메트리의 기본 자세가 정확히 이것입니다. 소요 시간, 모델 이름, 도구 이름 같은 구조적인 것은 모든 스팬에 기록하고 토큰 수는 API 가 usage 를 반환할 때 기록하는 반면, 에이전트가 읽고 쓴 내용은 기본적으로 수집되지 않습니다. 사용자 프롬프트도 마찬가지로 기본은 길이만 기록하고 내용을 기록하려면 별도의 스위치를 켜야 합니다. 그리고 공식이 이런 종류의 스위치에 붙이는 문장은 '관측 가능성 파이프라인이 에이전트가 다루는 데이터를 저장해도 된다고 승인받은 게 아니라면 설정하지 말고 두라'입니다. 이건 성능 조언이 아니라 컴플라이언스 제약입니다. 짚어내기가 실제로 기대는 것은 구조입니다. 어느 단계, 어떤 파라미터, 어떤 형태의 반환, 에러가 났는가. 전문은 표본 점검할 때만 필요하고, 그때는 트랜스크립트를 읽으면 됩니다."
    },
    {
      "id": "c",
      "text": "거꾸로 갑니다. 내용은 한 글자도 기록하지 말고 도구별 호출 횟수만 세면 충분하며, 나머지는 다시 돌려서 재현하는 데 기댑니다",
      "correct": false,
      "feedback": "과잉 교정이고, '다시 돌려서 재현'은 에이전트에게 통하지 않는 길입니다. 같은 프롬프트로 두 번 돌리면 서로 다르지만 똑같이 타당한 경로를 가고, 열 번 다시 돌리면 열 번 다 옳은 결과가 나올 수도 있습니다. 호출 횟수 통계만으로는 '에러가 난 그 read_file 이 어떤 경로를 지났는가'조차 답할 수 없어서, 이번 레슨의 짚어내기 과정 전체가 첫 단계에서 무너집니다. 진짜 분기선은 '기록할 것인가 말 것인가'가 아니라 '구조를 기록할 것인가 내용을 기록할 것인가'입니다. 형태, 길이, 파라미터 이름, 에러 메시지는 구조에 속하고 짚어낼 수 있게 해 줍니다. 파일 내용과 사용자의 원래 말은 내용에 속하고 기본적으로 디스크에 쓰지 않습니다."
    }
  ]
}
```

## 증상 재현: v-bug

이제 버그 버전을 돌립니다. 스텁 큐에는 레슨 서두의 진짜 이탈이 묻혀 있습니다. 먼저 들여다보지 말고 출력에서 직접 찾아보세요.

```text
$ node observed-agent.mjs --version v-bug

=== 트레이스 트리 (v-bug, run.log.jsonl 에서 재구성) ===
agent_run  sales-summary  2ms  trace_id=tr-f34dda2a
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(98)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(101)
├─ model_call turn-3         0ms  in=1602 out=355  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(23)
└─ model_call turn-4         0ms  in=1990 out=81  stop=end_turn

=== 메트릭 요약 (v-bug) ===
rounds=4 model_calls=4 tool_calls=5 errors=1 tokens_in=5350 tokens_out=750 tokens_total=6100 wall=2ms
로그: runs/v-bug/run.log.jsonl　산출물: runs/v-bug/summary.md
```

산출물은 정말로 잘못돼 있습니다.

```text
$ cat runs/v-bug/summary.md
# 2026 Q1 지역별 매출 요약

| 지역 | 합계 (¥) |
| --- | --- |
| East China | 548550 |
| Central China | 208000 |
| North China | 432600 |
| 총계 | 1189150 |

데이터 출처: data/ 디렉터리의 CSV 파일
```

먼저 밖에서는 보이지 않는 것 몇 가지를 짚어 둡니다.

- 라운드 수와 도구 호출 수가 `v-good` 과 동일합니다. 4라운드, 5회. 이 두 숫자만 보면 두 실행은 똑같아 보입니다.
- 토큰은 67 밖에 늘지 않았습니다(6100 대 6033). 알림이 '토큰이 임계값을 넘으면'이라면 이건 울리지도 않습니다.
- `errors=1`, 이 숫자 하나만 바뀌었습니다. 도구 에러가 메트릭에서 일급 시민이어야 하는 이유가 이것입니다[^S3]. 요약 수준에서 이 실행이 이상해 보인다는 것을 알려 주는 유일한 신호입니다.
- 마지막 `model_call` 이 `stop=end_turn` 입니다. 에이전트는 자기가 **작업을 성공적으로 완료했다**고 생각합니다. 에러를 내지도, 도움을 청하지도, 데이터 한 조각이 빠졌다고 말하지도 않았습니다. 에이전트가 피드백에서 생략하는 것이 포함하는 것보다 더 중요한 경우가 많습니다[^S3].

## 다섯 단계 짚어내기: 증상 추적에서 첫 이탈 지점까지

레슨 5의 다섯 단계 짚어내기는 일반적인 편성입니다. 이번 라운드의 재료는 특수합니다. 한 줄씩 대조할 수 있는 로그 셋이 손에 있으니까요. 그래서 다섯 중 셋이 형태를 바꿉니다. 나란히 적어 봅니다.

| 레슨 5의 일반 단계 | 이번 라운드의 형태 | 왜 바뀌는가 |
| --- | --- | --- |
| 1 좁히기 | 이 실행 하나를 못 박기 | 같음, id 로 거른다 |
| 2 첫 이탈 지점 찾기 | 트리에서 식별하기 | 같음, 증거가 트리가 됐을 뿐 |
| 3 재생 관찰 | 하류를 전염으로 인식하기 | 스텁 자체가 고정된 재생이므로 이 단계의 자리를 전염 분석에 준다 |
| 4 같은 구성 요소 반복해서 두들기기 | 원인 확정 | 로그 셋을 한 줄씩 대조할 수 있어 확률적 결함을 밀어내려고 반복해서 두들길 필요가 없다 |
| 5 고친 뒤 에러 지점부터 복구 | 재실행 비교 | 아래 참조. 둘은 충돌하지 않고 적용 조건이 다르다 |

다섯째 단계는 따로 설명이 필요합니다. 레슨 5는 '고친 뒤 에러 지점부터 복구하고 처음부터 다시 돌리지 말라'를 주장했고, 이유는 전체 재실행이 비결정성을 다시 들여와 '제대로 고쳤다'와 '이번엔 운이 좋았다'를 가릴 수 없게 만들기 때문이었습니다. 이번 레슨이 전체 재실행을 감행하는 이유는 모델 쪽이 스텁으로 고정돼 있어서입니다. 재실행이 새 변수를 들이지 않으므로 한 줄씩 대조가 성립합니다. 실제 API 를 붙이면 스텁은 사라지고 레슨 5의 방식으로 돌아갑니다. 에러 지점부터 복구하는 것입니다.

이번 라운드의 재료에 내려앉히면 아래 다섯 단계입니다. 아직 답을 모르는 척하고 한 번 걸어 보세요.

### 첫째 단계: 이 실행 하나를 못 박기

프로덕션 환경에서는 모든 실행의 로그가 하나의 스트림에 섞입니다. 먼저 그 상황을 흉내 내어 세 실행의 로그를 합칩니다.

```text
$ cat runs/v-good/run.log.jsonl runs/v-bug/run.log.jsonl runs/v-fixed/run.log.jsonl > all-runs.log.jsonl
$ wc -l < all-runs.log.jsonl
      32
$ grep -c 'tr-f34dda2a' all-runs.log.jsonl
10
```

32줄 중 10줄만 버그 실행에 속합니다. 이 단계는 공식이 준 트레이싱 접근을 씁니다. 프롬프트 하나가 촉발한 활동 전부를 추적하려면 그 특정 id 로 이벤트를 거르는 것입니다[^S4]. 그것을 `prompt.id` 라 부르든 `trace_id` 라 부르든 중요하지 않습니다. 중요한 것은 이 id 가 존재하고 모든 기록이 그것을 달고 있다는 점입니다.

온 김에 스트림 전체에 에러가 몇 건인지도 확인할 수 있습니다.

```text
$ grep -c '"error":{"shape"' all-runs.log.jsonl
2
```

둘입니다. `v-bug` 에 하나, `v-fixed` 에 하나. `v-good` 은 티 없이 깨끗합니다.

### 둘째 단계: 트리에서 첫 이탈 지점 식별하기

트리는 이미 출력돼 있습니다. 위에서 아래로 훑으며 **기대와 맞지 않는 첫 기록**을 찾습니다.

```text
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
```

`turn-2` 아래 병렬 읽기 셋 중 가운데가 깨졌습니다. 깨진 이유는 `tool_input` 에 쓰여 있습니다. 경로가 `data/2026-q1-sourth.csv` 입니다. `south` 가 `sourth` 로 오타 났습니다. 트리의 그 `list_files` 줄은 `ok string(52)` 만 보여 주므로 올바른 파일 이름을 알려면 로그를 파야 합니다. 그 기록을 꺼내면(위의 `head -3` 에서 이미 봤습니다) `tool_result.head` 에 `2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv` 라고 있습니다. 모델은 올바른 이름을 분명히 받았습니다. 트리가 짚어내기를 맡고 로그가 세부를 맡는, 두 계층의 협력이 정확히 이런 모습입니다.

그 완전한 기록을 보려면 스트림에서 낚아 올립니다.

```text
$ node -e '
const fs = require("node:fs");
const TRACE = "tr-f34dda2a";
for (const line of fs.readFileSync("all-runs.log.jsonl", "utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(line);
  if (r.trace_id === TRACE && r.error) console.log(r.kind, r.name, r.tool_input.head, "->", r.error.head);
}'
tool_call read_file {"path":"data/2026-q1-sourth.csv"} -> ENOENT: no such file or directory, open 'data/2026-q1-sourth…
```

이것이 이탈 지점입니다. **어떻게 인식됐는지**에 유의하세요. 짐작이 아니라 세 필드로 인식됐습니다. `trace_id` 가 범위를 이 실행 하나로 잠그고, `error` 가 null 이 아니라는 점이 기록 열 개 중에서 이것을 골라내며, `tool_input.head` 가 파라미터의 어디가 잘못됐는지 알려 줍니다. 세 필드, 어느 하나도 없어도 되지 않습니다.

### 셋째 단계: 하류의 황당함을 전염으로 인식하고 따로 고치지 않기

이탈 지점 이후 `turn-3` 에서 모델이 Central China 지역이 든 집계를 쓰고, `turn-4` 가 "작업 완료"라고 보고합니다. 두 단계 다 꽤 황당해 보이지만 둘 다 하류입니다.

| 기록 | 동작 | 원인인가 전염인가 |
| --- | --- | --- |
| `turn-2` 의 `read_file` 에러 | 파라미터 오타, 도구가 ENOENT 한 줄을 반환 | **원인** |
| `turn-3` 의 `write_file` | 존재하지 않는 Central China 지역을 써넣음 | 전염 |
| `turn-4` 의 `end_turn` | 성공적으로 완료했다고 주장 | 전염 |

에이전트 시스템에서는 한 단계의 실패만으로도 완전히 다른 궤적으로 틀어지기에 충분하고 최종 결과는 예측할 수 없습니다[^S1]. 이것이 가장 깔끔한 예입니다. 최종 `summary.md` 만 받았다면 어디를 고치러 갔을까요? 아마 프롬프트를 바꾸러 갔을 겁니다. "데이터를 지어내지 마라" "데이터 출처를 반드시 명시하라". 이 변경들은 전부 전염을 때리지 병변을 때리지 않습니다. 다음번에 오타 방식만 바꾸면 여전히 지어냅니다.

참고로 이 증상이 왜 'South China 누락'이 아니라 'Central China'로 자랐는지. 모델은 파일 이름을 받았고(`2026-q1-south.csv` 가 `list_files` 의 반환에 그대로 있습니다), east 는 East China 로, north 는 North China 로 대응한다는 것도 앞선 두 번의 성공적인 읽기 내용에 이미 있습니다. 부족한 것은 그 세 달치 구체적인 숫자뿐이었습니다. 그런데 그 불투명한 ENOENT 에러는 "올바른 파일 이름으로 다시 시도하라"도 "멈추고 설명하라"도 말해 주지 않았고, 그래서 가장 쉬운 길을 골랐습니다. 빈틈을 완결된 것처럼 위장하고 지역 이름과 숫자를 둘 다 채워 넣는 것이죠. 지어낸 것은 아무것도 몰라서가 아니라, 에러가 더 나은 출구를 주지 않았기 때문입니다.

### 넷째 단계: 원인 확정 — 받은 피드백이 형편없었다

이 단계에서 모델을 탓하러 서두르지 마세요. 그 에러가 실제로 무엇을 주었는지 보십시오.

```text
ENOENT: no such file or directory, open 'data/2026-q1-sourth.csv'
```

이 줄은 사람 엔지니어에게는 정보가 충분하지만, '다음에 무엇을 할지' 정하는 에이전트에게는 거의 비어 있습니다. '이 디렉터리에서 어떤 파일을 읽을 수 있는지'도 읽어 낼 수 없고, '내가 오타를 낸 것인지 이 데이터가 진짜로 없는 것인지'도 읽어 낼 수 없으며, '이런 상황을 만나면 직접 채우지 말고 멈춰서 물어야 한다'는 더더욱 읽어 낼 수 없습니다. 에이전트는 진행 상황을 판단하기 위해 각 단계에서 환경의 그라운드 트루스 피드백에 기대야 하는데[^S2], 이 ENOENT 가 받은 피드백의 전부였습니다.

도구 엔지니어링에 대한 공식의 제안이 정확히 이 빈틈을 겨냥합니다. 도구 호출이 에러를 낼 때, 불투명한 에러 코드나 스택 트레이스를 던지는 대신 구체적이고 실행 가능한 개선을 분명히 설명하도록 에러 응답 자체를 잘 써야 한다는 것입니다[^S3]. 그러니 이번에 바꿔야 할 것은 프롬프트가 아니라 `read_file` 의 에러 메시지입니다.

### 다섯째 단계: 재실행 비교 (스텁이 모델 쪽을 고정했으므로 여기서는 전체 재실행이 가능하다)

수정 방법은 다음 절에 있습니다. 돌려 본 뒤 돌아와 숫자가 바뀌었는지 봅시다. 짚어내기는 '원인을 안다'에서 끝나지 않고 '고친 뒤 같은 트레이스의 그 단계가 정말로 달라졌다'에서 끝납니다.

## 고치고 다시 돌리기: v-fixed

바뀐 것은 코드의 `read_file` 부분, 그것도 에러 메시지뿐입니다.

```javascript
if (ctx.errorStyle === "actionable") {
  const available = fs
    .readdirSync(path.join(ctx.root, "data"))
    .sort()
    .map((f) => `data/${f}`)
    .join(", ");
  throw new Error(
    `${p} 파일을 찾을 수 없습니다. 현재 data/ 에 있는 것: ${available}. ` +
      `list_files 가 반환한 원래 파일명으로 다시 시도하세요. 필요한 데이터가 정말로 없다면 ` +
      `멈추고 어떤 파일이 없는지 사용자에게 알리세요. 없는 수치를 직접 추정하지 마세요.`
  );
}
```

이 메시지는 세 가지를 밀어 넣습니다. **현재 상태**(디렉터리에 실제로 무엇이 있는지), **다음에 할 일**(원래 파일명으로 다시 시도), **언제 멈출지**(데이터가 정말 없으면 사람에게 묻고 추정하지 말 것). 앞의 둘이 모델에게 걸어갈 길을 주고, 셋째가 지어내는 길을 막습니다.

`v-fixed` 의 응답 큐는 이 에러를 받은 뒤 모델의 반응을 시연합니다. 아래로 지어내는 대신 환경으로 돌아가 확인을 구합니다. 에러 메시지에 나열된 원래 파일명으로 한 번 다시 읽고, 마지막 마무리 문장에서 사용자에게 되묻기까지 합니다. "data/ 바깥에 다른 지역 데이터가 있다면 파일 위치를 알려주세요. 제가 수치를 직접 채워 넣지는 않겠습니다."

```text
$ node observed-agent.mjs --version v-fixed

=== 트레이스 트리 (v-fixed, run.log.jsonl 에서 재구성) ===
agent_run  sales-summary  1ms  trace_id=tr-a7f63476
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     1ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(98)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR data/2026-q1-sourth.csv 파일을 찾을 수 없습니다. 현재 da…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(101)
├─ model_call turn-3         0ms  in=1688 out=64  stop=tool_use
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-south.csv"}  ok string(99)
├─ model_call turn-4         0ms  in=1849 out=342  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(23)
└─ model_call turn-5         0ms  in=2226 out=118  stop=end_turn

=== 메트릭 요약 (v-fixed) ===
rounds=5 model_calls=5 tool_calls=6 errors=1 tokens_in=7521 tokens_out=838 tokens_total=8359 wall=1ms
로그: runs/v-fixed/run.log.jsonl　산출물: runs/v-fixed/summary.md
```

트리의 모양이 바뀌었습니다. `turn-2` 의 그 ERROR 는 원래 자리에 그대로 있지만, 그 아래로 `turn-3` 이 자라났고 그 안에 올바른 파일명으로 한 번 다시 읽기가 들어 있습니다. 산출물은 정확합니다.

```text
$ diff runs/v-good/summary.md runs/v-fixed/summary.md
$ echo $?
0
```

두 `summary.md` 가 바이트 단위로 동일하고, Central China 지역은 사라졌습니다.

세 실행을 나란히 놓으면:

| | `v-good` | `v-bug` | `v-fixed` |
| --- | --- | --- | --- |
| rounds | 4 | 4 | 5 |
| tool_calls | 5 | 5 | 6 |
| errors | 0 | 1 | 1 |
| tokens_total | 6033 | 6100 | 8359 |
| `summary.md` | 정확 | Central China 지역 있음 | 정확 |

분명히 말해 둘 것이 둘 있습니다. 그러지 않으면 이 수정을 오해하기 쉽습니다.

**첫째, `errors` 는 0 으로 돌아가지 않았고, 돌아가서도 안 됩니다.** 오타 난 그 읽기는 여전히 에러를 냈고, 우리는 에러 메시지만 바꿔 모델이 에러에서 기어 나오게 했을 뿐입니다. `errors` 를 진짜로 0 으로 되돌리는 수정은 다른 방향에 있습니다. 도구 설명을 더 명시적으로 쓰고 예시를 주어 모델이 애초에 오타를 내지 않게 하는 것이죠. 공식의 진단적 읽기가 정확히 이렇게 대응합니다. 잘못된 파라미터로 인한 도구 에러가 많다면 도구 설명을 더 명확히 쓰고 예시를 더 잘 줘야 한다는 뜻입니다[^S3]. 이 스크립트의 `read_file` 설명은 이미 "경로는 list_files 가 반환한 원래 파일명을 그대로 써야 합니다"라고 말하고 있는데도 분명 부족했으니, 다음 라운드에서는 긍정 예시를 하나 줘야 합니다.

**둘째, 수정은 공짜가 아닙니다.** 토큰이 6033 에서 8359 로, 2326 늘어 38% 증가했고, 늘어난 몫은 그 한 번의 다시 읽기 왕복에서 왔습니다. 폭발은 아니지만 비용이 0 도 아닙니다. 수정의 비용은 표 위에 올려놓고 계산해야 하며, '결과가 맞다'만 보고 끝났다고 할 수 없습니다.

## 이 관측 가능성 계층의 경계는 어디인가

이건 작은 물건이라 경계를 분명히 말해 둬야 합니다. 이걸 붙였다고 프로덕션 관측 가능성을 갖췄다고 생각하면 곤란하니까요.

**프로세스 하나, 실행 하나를 덮습니다.** 로그는 `appendFileSync` 로 로컬 파일에 바로 쓰므로 프로세스가 죽어도 잃지 않습니다. 이건 의도한 것입니다. 실제 백엔드를 붙이면 이런 대접이 아닙니다. OTLP 길에서는 내보내기 실패가 기본적으로 조용하고, 엔드포인트에 닿지 못하거나 거부당해도 에이전트는 계속 돌며 텔레메트리는 그냥 버려지고 애플리케이션에는 에러조차 뜨지 않습니다. 그리고 텔레메트리는 모아 두었다가 간격을 두고 내보내므로 내보내기 전에 프로세스가 죽으면 배치 버퍼에 있던 것은 사라집니다[^S6]. 레슨 4의 '관측 가능성 파이프라인이 조용히 거짓말을 한다'가 이 구간을 다룹니다. 로컬 파일은 이 구덩이를 비켜 가고, 대가는 로컬 머신에만 있다는 것입니다.

**실제 백엔드 연결과 다중 프로세스 집계는 이번 레슨에 없습니다.** 이 계층을 Honeycomb, Datadog, Grafana, Langfuse 또는 자체 호스팅 컬렉터에 연결하려면 OTLP 프로토콜 묶음이 필요하고[^S6] 필드를 다시 대응시켜야 하는데, 그건 다른 주제입니다. 여러 에이전트 프로세스의 로그를 어떻게 모으고 서비스 이름으로 어떻게 구별할지도 마찬가지입니다.

**알림 임계값에 대해 이번 레슨은 숫자를 주지 않습니다.** '도구 에러율이 얼마를 넘으면 알려야 하는가' '한 번의 실행이 토큰 몇 개를 넘으면 이상인가' 같은 것들이요. 공식 문서는 알림이 여러분의 백엔드가 할 일이라고만 언급했고 숫자는 주지 않았습니다[^S4]. 저도 지어내지 않겠습니다. 여러분의 임계값은 여러분의 베이스라인에서만 자랄 수 있습니다. 먼저 얼마간 돌려 보고 정상 실행의 분포가 어떤지 본 다음 선을 그으세요.

**내용 기록은 기본이 꺼짐입니다.** 위의 `HEAD_CHARS = 60` 은 아주 짧은 발췌만 남깁니다. 전문을 진짜로 켜려면 전제 조건이 여러분의 관측 가능성 파이프라인이 에이전트가 다루는 데이터를 저장해도 된다고 승인받는 것입니다[^S6]. 데이터 승인을 먼저 통과하고 나서 코드를 바꾸는 것이지, 그 반대가 아닙니다.

**샘플링 비율과 로그 보존 기간도 확장하지 않습니다.** 한 번의 실행에 JSONL 수십 줄이니 로컬에서 몇백 번 돌리는 정도는 관리할 필요가 없습니다. 이런 것을 고려해야 할 때가 되면 그건 이미 백엔드 문제입니다.

마지막 한마디. 이 관측 가능성 계층의 가치는 얼마나 많이 기록했느냐가 아니라 **구체적인 질문을 던질 수 있게 해 준다**는 데 있습니다. "왜 Central China 지역을 지어냈는가"는 답할 수 없는 질문이고, "`trace_id=tr-f34dda2a` 인 이 실행에서 `error` 가 null 이 아닌 첫 기록은 무엇이고 그 파라미터는 무엇인가"는 답할 수 있는 질문입니다. 완전한 프로덕션 트레이싱을 붙이고 나서야 비로소 에이전트가 왜 실패했는지 체계적으로 진단하고 체계적으로 고칠 수 있습니다[^S1].

## 💻 연습

<!-- exercises -->

### 레벨 1: 설명 없이 이 트리를 직접 읽기

아래 트레이스 트리는 `v-bug` 를 실제로 돌려 얻은 것입니다(본문의 것과 같고, `trace_id` 와 밀리초 수치는 실행마다 다릅니다). 처음 보는 셈 치세요. 동료는 "summary.md 에 우리 회사에 없는 Central China 지역이 있다"는 한 줄만 던졌습니다.

```text
agent_run  sales-summary  2ms  trace_id=tr-f34dda2a
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     0ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(98)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(101)
├─ model_call turn-3         0ms  in=1602 out=355  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(23)
└─ model_call turn-4         0ms  in=1990 out=81  stop=end_turn
```

동료는 그 `list_files` 로그 기록도 함께 뽑아 주었습니다. 트리 위에서는 `ok string(52)` 로만 보이고 세부는 로그에 있습니다(id 와 밀리초는 늘 그렇듯 실행마다 다릅니다).

```json
{"trace_id":"tr-f34dda2a","span_id":"span-b596698f","parent_id":"span-475cb704","kind":"tool_call","name":"list_files","tool_input":{"shape":"object{dir}","chars":14,"head":"{\"dir\":\"data\"}"},"duration_ms":0,"tool_result":{"shape":"string(52)","chars":52,"head":"2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv"},"error":null}
```

코드를 쓰지 말고 네 질문에 글로 답하세요.

1. 첫 이탈 지점은 **어느 줄**입니까?
2. 그것을 이탈 지점으로 판정한 **근거**는 트리와 이 로그 기록의 어느 필드들입니까? 필드 이름과 각각이 무엇을 배제하는지 대세요.
3. 이탈 이후 어느 줄들이 독립적인 결함이 아니라 **전염**입니까? 줄 단위로 말하세요.
4. 이 트리 없이 최종 `summary.md` 만 있었다면 **누구를 잘못 탓했을** 가능성이 큽니까? 그 방향으로는 왜 이 버그를 고칠 수 없습니까?

<!-- rubric -->

- 1번이 `turn-2` 아래 ERROR 가 난 그 `read_file` 을 짚고, 파라미터가 `data/2026-q1-sourth.csv`(오타 난 것)임을 밝힌다
- 2번이 최소 세 필드와 각각의 역할을 댄다. `error`(null 이 아니어서 다른 기록 중에서 이것을 골라낸다), `tool_input`(파라미터 오타를 드러내 '파일이 정말로 없다'를 배제한다), 그 `list_files` 로그 기록의 `tool_result.head`(모델이 올바른 파일명을 분명히 받았음을 증명해 '어떤 파일이 있는지 모른다'를 배제한다)
- 3번이 `turn-3` 의 `write_file` 과 `turn-4` 의 `end_turn` 을 둘 다 전염으로 판정하고, 그 황당함이 모두 상류의 실패한 읽기에서 비롯됐음을 설명한다
- 4번이 모델의 '환각'이나 프롬프트를 잘못 탓하게 됨을 짚고, 프롬프트에 '지어내지 마라'를 더해도 고칠 수 없는 이유가 병변이 도구 피드백의 형편없음이지 지시가 엄하지 않아서가 아니라는 점을 설명한다

<!-- answer -->

1. 첫 이탈 지점은 `turn-2` 아래 **병렬 `read_file` 셋 중 가운데**입니다. `in={"path":"data/2026-q1-sourth.csv"}` 이고 결과가 ERROR 입니다. 위 두 줄과 아래 한 줄은 모두 `ok` 인데 이것만 깨졌습니다.

2. 세 필드가 함께 인식합니다.

   - `error` 필드가 null 이 아님 — 트리 전체에서 ERROR 를 단 유일한 기록이고 나머지 아홉은 모두 정상입니다. 후보 범위를 열에서 하나로 압축합니다.
   - `tool_input` 의 발췌 — 경로에 `sourth` 라고 쓰여 있지 `south` 가 아닙니다. 이것이 '그 데이터가 정말로 없다'를 배제합니다. 잘못된 것은 파라미터이지 데이터가 아닙니다.
   - 그 `list_files` 로그 기록의 `tool_result.head` 에 `2026-q1-south.csv` 가 있음 — 모델은 올바른 파일명을 분명히 받았습니다. 이것이 '디렉터리에 무엇이 있는지 모른다'를 배제합니다.

   셋 중 하나라도 없으면 결론이 서지 않습니다. `error` 만으로는 무슨 일이 있었다는 것은 알아도 어디가 잘못됐는지 모르고, `tool_input` 만으로는 이 호출이 성공했는지 실패했는지 가릴 수 없으며, 그 `list_files` 반환이 없으면 모델이 올바른 이름을 알 기회라도 있었는지 판정할 수 없습니다.

3. 이탈 이후의 두 줄은 모두 전염입니다.

   - `turn-3` 의 `write_file`: 써넣은 Central China 지역은 지어낸 것이지만, 모델이 지어낼 때 실제로 데이터 한 조각이 없었고 받은 에러는 무엇이 없는지 알려 주지 않았습니다. 이 단계는 앞 단계의 잔해 위에서 내려진 판단입니다.
   - `turn-4` 의 `end_turn`: 작업 완료를 보고하며 데이터 한 조각이 빠졌다는 말을 전혀 하지 않습니다. 이것 역시 잔해의 연장입니다. 해야 할 일을 다 했다고 생각하는 것이죠.

   한 단계의 실패만으로도 에이전트를 완전히 다른 궤적으로 틀어 놓기에 충분하고, 이 두 줄은 그 궤적 위의 두 점이지 독립적인 버그 둘이 아닙니다. 어느 하나를 따로 고쳐 봐야 실패 방식만 바뀌면 새것이 또 자랍니다.

4. `summary.md` 만 보면 **모델**을 탓하기가 가장 쉽습니다. 환각을 일으켰다, 데이터를 지어냈다고 하면서 프롬프트에 "데이터를 지어내지 마라" "각 숫자의 출처를 반드시 명시하라"를 더하는 것이죠. 이 방향으로는 고칠 수 없고, 이유는 두 겹입니다.

   - 병변은 지시가 아니라 피드백에 있습니다. 그 단계에서 모델이 받은 정보 전부는 `ENOENT: no such file or directory` 한 줄이고, 그 안에는 '디렉터리에 어떤 파일이 있는지'도 '다시 시도해야 하는지 멈추고 사람에게 물어야 하는지'도 없습니다. 프롬프트에서 아무리 크게 외쳐도 그 단계에서 손에 쥔 재료는 여전히 그 한 줄입니다.
   - 프롬프트는 전역이고 이탈은 국소입니다. "지어내지 마라" 한 줄을 더하면 매 라운드의 행동에 영향을 주지만, 정말로 행동이 바뀌어야 하는 지점은 '도구 에러 다음 단계' 이 한 점뿐입니다. 에러 메시지를 바꾸는 것은 점을 때리고, 프롬프트를 바꾸는 것은 표면에 뿌립니다.

   덧붙여, `trace_id` 조차 없어서 로그가 한 스트림에 섞여 있었다면 '어느 열 줄이 이 실행에 속하는지'도 동그라미 칠 수 없고, 이 네 질문은 하나도 시작할 수 없습니다.

<!-- hint -->

위에서 아래로 훑으세요. `summary.md` 에서 거꾸로 추론하지 마세요. 기대를 처음으로 어기는 기록은 어느 층에 나타납니까? '기대를 어긴다'는 이 트리 위에 아주 뚜렷한 시각적 표시를 가지고 있습니다.

<!-- hint -->

2번이 원하는 것은 "ERROR 라고 쓰여 있으니까"가 아니라 **세** 필드가 각각 하나씩 가능성을 배제하는 것입니다. 따로따로 물어보세요. 이 호출은 성공했습니까 실패했습니까(어느 필드)? 잘못된 것은 파라미터입니까 데이터 자체입니까(어느 필드)? 그때 모델은 올바른 파일명을 알고 있었습니까(어느 필드 — 트리 위인가, 그 로그 기록 안인가)?

### 레벨 2: 관측 가능성 계층에 '실행 비교' 붙이기

단일 실행의 메트릭만 봐서는 변경이 좋은지 나쁜지 판단하기 어렵습니다. `compare-runs.mjs` 를 써서 `run.log.jsonl` 두 개를 읽고 `kind` 별로 집계한 뒤 나란히 비교하세요. 요구 사항은 이렇습니다.

- 명령줄이 로그 파일 경로 두 개를 받습니다. `node compare-runs.mjs <A> <B>`. 파라미터가 빠지면 사용법을 출력하고 종료 코드 2 로 끝냅니다.
- 최소한 이것들을 비교합니다. 모델 호출 수, 도구 호출 수, 에러 수, `tokens_in` / `tokens_out` / `tokens_total`, 총 소요 시간. 토큰 줄에는 변화율도 함께 냅니다.
- 그다음 도구 이름별로 묶어 각 도구가 몇 번 호출됐는지 비교합니다.
- **어느 쪽이든 에러 수가 0 보다 크면 0 이 아닌 코드로 종료**하고, 어느 쪽이 몇 건인지 출력합니다.
- 다 쓴 뒤 `v-good` 과 `v-fixed` 를 비교해 답하세요. 수정이 새로운 에러를 들여왔습니까? 토큰은 얼마나 늘었습니까?

<!-- rubric -->

- 스크립트가 의존성 0 이고 맨 `node` 로 돌며, 파라미터가 둘 다 없으면 사용법을 출력하고 `process.exit(2)` 한다
- 집계 방식이 `kind`(`model_call` / `tool_call` / `agent_run`)로 거른 뒤 세는 것이고, 줄 번호를 하드코딩하지 않는다
- 토큰 세 줄에 변화율이 있고, 횟수 줄에는 증감 숫자가 있다
- 도구 이름별 묶음 비교가 양쪽에 나타나는 모든 도구 이름을 덮는다(한쪽에만 있으면 0 으로 채운다)
- 에러 게이트가 실제로 동작한다. 양쪽 다 0 이면 종료 코드 0, 어느 쪽이든 0 보다 크면 0 이 아닌 코드이며, 각 쪽의 에러 수를 출력한다
- 결론 부분이 `v-fixed` 의 에러 수가 여전히 1 이라는 점(오타 난 그 읽기가 그대로 있다)과 토큰 증가의 구체적인 숫자를 분명히 밝힌다

<!-- answer -->

아래가 완전한 구현입니다. `observed-agent.mjs` 와 같은 디렉터리에 두세요.

```javascript
#!/usr/bin/env node
// compare-runs.mjs —— 두 실행의 run.log.jsonl 을 비교한다
// 사용법: node compare-runs.mjs <A 의 run.log.jsonl> <B 의 run.log.jsonl>
// 어느 쪽이든 도구 에러가 있으면 0 이 아닌 코드로 종료한다.
import fs from "node:fs";

function load(file) {
  const records = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const model = records.filter((r) => r.kind === "model_call");
  const tool = records.filter((r) => r.kind === "tool_call");
  const root = records.find((r) => r.kind === "agent_run");
  const byTool = new Map();
  for (const r of tool) byTool.set(r.name, (byTool.get(r.name) ?? 0) + 1);
  return {
    file,
    trace_id: records[0]?.trace_id ?? "(빈 로그)",
    model_calls: model.length,
    tool_calls: tool.length,
    errors: records.filter((r) => r.error).length,
    tokens_in: model.reduce((s, r) => s + r.tokens.input, 0),
    tokens_out: model.reduce((s, r) => s + r.tokens.output, 0),
    wall_ms: root?.duration_ms ?? 0,
    byTool,
  };
}

const pad = (v, w) => String(v).padStart(w);

function deltaOf(a, b, asPercent) {
  const d = b - a;
  const sign = d > 0 ? "+" : d < 0 ? "" : "±";
  if (!asPercent || a === 0) return `${sign}${d === 0 ? 0 : d}`;
  return `${sign}${d} (${sign}${((d / a) * 100).toFixed(1)}%)`;
}

function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error("사용법: node compare-runs.mjs <A 의 run.log.jsonl> <B 의 run.log.jsonl>");
    process.exit(2);
  }
  const a = load(fileA);
  const b = load(fileB);

  console.log(`A: ${a.file}  trace_id=${a.trace_id}`);
  console.log(`B: ${b.file}  trace_id=${b.trace_id}`);
  console.log(`\n${"지표".padEnd(11)}${pad("A", 7)}${pad("B", 8)}   증감`);
  const rows = [
    ["model_calls", a.model_calls, b.model_calls, false],
    ["tool_calls", a.tool_calls, b.tool_calls, false],
    ["errors", a.errors, b.errors, false],
    ["tokens_in", a.tokens_in, b.tokens_in, true],
    ["tokens_out", a.tokens_out, b.tokens_out, true],
    ["tokens_total", a.tokens_in + a.tokens_out, b.tokens_in + b.tokens_out, true],
    ["wall_ms", a.wall_ms, b.wall_ms, false],
  ];
  for (const [name, va, vb, pct] of rows) {
    console.log(`${name.padEnd(13)}${pad(va, 7)}${pad(vb, 8)}   ${deltaOf(va, vb, pct)}`);
  }

  console.log("\n도구 이름별:");
  for (const name of [...new Set([...a.byTool.keys(), ...b.byTool.keys()])].sort()) {
    const va = a.byTool.get(name) ?? 0;
    const vb = b.byTool.get(name) ?? 0;
    console.log(`${name.padEnd(13)}${pad(va, 7)}${pad(vb, 8)}   ${deltaOf(va, vb, false)}`);
  }

  if (a.errors > 0 || b.errors > 0) {
    console.log(`\n게이트 실패: A 쪽 에러 ${a.errors} 건, B 쪽 에러 ${b.errors} 건.`);
    process.exit(1);
  }
  console.log("\n게이트 통과: 양쪽 다 에러 기록이 없습니다.");
  process.exit(0);
}

main();
```

**먼저 게이트 자체를 검증합니다.** 이것은 레슨 4의 규칙을 그대로 적용하는 것입니다. 새로 붙인 검출기는 '통과해야 하는' 상황에서 정말로 통과시키는지부터 확인해야 합니다. 그러지 않으면 이후에 읽는 종료 코드가 전부 믿을 수 없습니다. `v-good` 을 자기 자신과 비교합니다.

```text
$ node compare-runs.mjs runs/v-good/run.log.jsonl runs/v-good/run.log.jsonl
A: runs/v-good/run.log.jsonl  trace_id=tr-48ed2acc
B: runs/v-good/run.log.jsonl  trace_id=tr-48ed2acc

지표               A       B   증감
model_calls        4       4   ±0
tool_calls         5       5   ±0
errors             0       0   ±0
tokens_in       5303    5303   ±0 (±0.0%)
tokens_out       730     730   ±0 (±0.0%)
tokens_total    6033    6033   ±0 (±0.0%)
wall_ms            2       2   ±0

도구 이름별:
list_files         1       1   ±0
read_file          3       3   ±0
write_file         1       1   ±0

게이트 통과: 양쪽 다 에러 기록이 없습니다.
$ echo $?
0
```

전부 `±0` 이고 종료 코드는 0 입니다. 게이트가 통과시킬 수 있으니 쓸 준비가 됐습니다.

**그다음 `v-good` 과 `v-fixed` 를 비교합니다.**

```text
$ node compare-runs.mjs runs/v-good/run.log.jsonl runs/v-fixed/run.log.jsonl
A: runs/v-good/run.log.jsonl  trace_id=tr-48ed2acc
B: runs/v-fixed/run.log.jsonl  trace_id=tr-a7f63476

지표               A       B   증감
model_calls        4       5   +1
tool_calls         5       6   +1
errors             0       1   +1
tokens_in       5303    7521   +2218 (+41.8%)
tokens_out       730     838   +108 (+14.8%)
tokens_total    6033    8359   +2326 (+38.6%)
wall_ms            2       1   -1

도구 이름별:
list_files         1       1   ±0
read_file          3       4   +1
write_file         1       1   ±0

게이트 실패: A 쪽 에러 0 건, B 쪽 에러 1 건.
$ echo $?
1
```

두 질문에 답하면:

- **새로운 에러를 들여왔는가?** 새것은 없고 옛것이 그대로 있습니다. `v-fixed` 의 `errors=1` 은 바로 `south` 를 `sourth` 로 오타 낸 그 읽기입니다. 에러 메시지를 바꾼 것은 '에러 뒤에 모델이 무엇을 하는가'를 바꾼 것이지 '모델이 오타를 낼 것인가'를 바꾼 게 아닙니다. 그래서 게이트가 실패로 판정하고 종료 코드 1 이며, 이 결과가 맞습니다. 이 게이트가 묻는 것은 '이 실행에 여전히 도구 에러가 있는가'이지 '최종 산출물이 맞는가'가 아닙니다. 산출물이 맞는지는 따로 검증해야 합니다(`diff runs/v-good/summary.md runs/v-fixed/summary.md` 가 비어 있습니다). `errors` 를 진짜로 0 으로 되돌리려면 다음 단계에서 움직여야 할 것은 `read_file` 의 설명이고, 긍정 예시를 주어 모델이 애초에 오타를 내지 않게 하는 것입니다.
- **토큰은 얼마나 늘었는가?** 총합이 6033 에서 8359 로 2326 늘어 38.6% 증가했습니다. 늘어난 몫은 전부 그 한 번의 다시 읽기 왕복에 있습니다(`read_file` 이 3회에서 4회로, 모델 호출이 4회에서 5회로). 38% 는 폭발은 아니지만 공짜도 아닙니다. 수정의 비용은 이 표 위에서 인정해야 하며, 결과가 맞다는 것만 보고 끝났다고 할 수 없습니다.

그리고 `wall_ms` 줄의 그 `-1` 은 진지하게 받아들이지 마세요. 스텁 클라이언트는 네트워크 요청을 보내지 않으므로 두 실행의 벽시계 시간은 사실상 파일 I/O 잡음이고 실행마다 다릅니다. 실제 API 를 붙이면 이 줄이 의미를 얻습니다.

<!-- hint -->

`load()` 는 `readFileSync` 하나에 `split("\n")` 이면 되고, 그다음 모든 통계는 같은 배열에 대한 `filter` 와 `reduce` 입니다. `byTool` 은 `Map` 으로 누적하는 게 가장 쉽습니다. 양쪽 도구 이름의 합집합을 구할 때 `new Set([...a.keys(), ...b.keys()])` 를 쓰는 것을 잊지 마세요. 그러지 않으면 한쪽에만 있는 도구가 새어 나갑니다.

<!-- hint -->

종료 코드는 명시적으로 `process.exit()` 해야 합니다. 스크립트가 정상적으로 끝나면 저절로 0 이 되겠지 기대하지 마세요. `console.log` 뒤 프로세스의 기본 종료 코드가 실제로 0 이긴 하지만, 게이트가 실패하는 길에는 `process.exit(1)` 을 직접 써야 합니다. 검증할 때는 셸에서 `echo $?` 로 직전 명령의 종료 코드를 보세요.

<!-- /exercises -->

## 정리

- 관측 가능성 세 종 세트가 각각 한 구간을 맡는다. JSON Lines 로그가 '기록해 두기'를, 트레이스 트리가 '순서와 소속을 또렷이 보기'를, 메트릭 요약이 '이번 실행이 정상으로 보이는지 한눈에 보기'를 맡는다. 트리와 요약은 둘 다 디스크의 JSONL 에서 재구성하므로, 로그에 기록되지 않은 것은 트리에 결코 나타나지 않는다
- 모든 기록이 `trace_id` 와 `parent_id` 를 달아야 한다. 앞의 것이 흩어진 기록을 같은 실행으로 동그라미 치고, 뒤의 것이 그것을 트리로 재구성하게 한다. 프롬프트 하나가 촉발한 모든 이벤트를 `prompt.id` 로 묶고 그것으로 걸러 짚어내는 공식의 기법과 정확히 같다[^S4]
- 내용은 기본적으로 전문을 쓰지 않는다. 공식 텔레메트리의 기본 자세는 구조적인 것은 전부 기록하고, 에이전트가 읽고 쓴 내용은 수집하지 않으며, 사용자 프롬프트는 길이만 기록하는 것이다. 내용 기록을 켜려면 전제 조건이 관측 가능성 파이프라인이 이런 종류의 데이터를 저장해도 된다고 승인받는 것이다[^S6]
- 그 다섯 개의 메트릭 숫자(소요 시간, 호출 수, 토큰, 에러 수, 총 소요 시간)는 10번째 코스('검증과 품질 보증: 맞아 보이는 것을 그냥 넘기지 않기')에서 채점에 쓴 것과 같은 세트이고[^S3] 여기서는 진단용으로 바꿔 쓴 것이다. 이번 라운드의 비교에서 `v-good` 과 `v-bug` 의 라운드 수, 호출 수, 토큰이 거의 동일했고 바뀐 것은 에러 수 하나뿐이었다
- 짚어내기의 핵심 동작은 트리에서 **첫** 이탈 지점을 식별한 다음, 그 하류의 모든 황당함을 일률적으로 전염으로 다루는 것이다. 한 단계의 실패만으로도 에이전트를 완전히 다른 궤적으로 틀어 놓기에 충분하므로[^S1], 최종 산출물 계층을 고치러 가는 것은 그림자를 고치는 것과 같다
- 도구 에러 메시지를 고치는 것이 병변을 때리는 수정이다. 에러 응답은 불투명한 에러 코드나 스택 트레이스를 던지는 대신 구체적이고 실행 가능한 개선을 분명히 설명해야 한다[^S3]. 이 수정 뒤 모델은 'Central China 지역을 지어내기'에서 '원래 파일명으로 한 번 다시 읽고, 다른 데이터가 있는지 사용자에게 되묻기'로 바뀌었다
- 고친 뒤에는 반드시 재실행 비교를 하고 청구서도 인정해야 한다. `errors` 는 0 으로 돌아가지 않았고(오타가 그대로다), 토큰은 38% 늘었다(왕복이 하나 추가됐다). '결과가 맞다'가 '비용이 0'과 같지 않다

여섯 레슨의 본줄기가 여기서 끝납니다. 레슨 1은 왜 말할 수 없는지를 분명히 했습니다. 에이전트는 두 번 돌리면 다른 길을 가고, 하나의 증상 아래에 밖에서 보면 똑같아 보이는 여러 원인이 눌려 있습니다. 레슨 2는 일차 증거를 자기 보고가 아니라 원본 트랜스크립트에 못 박았습니다. 레슨 3은 모든 단계를 필드가 있는 데이터로 바꿨습니다. 레슨 4는 흩어진 데이터를 트리로 꿰면서, 그 파이프라인 자체가 조용히 거짓말을 한다는 것도 함께 알려 줬습니다. 레슨 5는 루프의 검문소에 탐침을 설치하고 짚어내는 걸음걸이를 주었습니다. 이번 레슨은 앞선 다섯 레슨을 약 400줄, 의존성 0 인 파일 하나로 납땜하고, 그것으로 'Central China 지역이 어디서 왔는가'를 `turn-2` 의 경로가 오타 난 그 읽기까지 실제로 좇아 냈습니다.

이것으로 이 시리즈의 11번째 코스도 끝입니다. 다음번에 여러분의 에이전트가 어디서 잘못됐는지 말하지 못할 때, 손에 "모델이 지어냈다"는 말 한마디만 있지는 않을 것입니다. grep 할 수 있는 로그가 있고, 어느 줄을 가리키며 말할 수 있는 트리가 있고, 비용을 계산할 수 있는 요약 표가 있고, 증상 추적에서 첫 이탈 지점까지 가는 걸음걸이 한 벌이 있습니다. 남은 일은 `observed-agent.mjs` 의 관측 가능성 세 구간(로거, 트레이스 트리, 메트릭 요약)을 통째로 자기 하네스로 옮기고, 7절의 방식대로 그 두 겹을 루프 바깥에 두르는 것입니다. 픽스처와 스텁은 이번 레슨의 교육용 발판이니 가져가지 마세요. 그런 다음 첫 실제 작업을 돌리고, 그 첫 `run.log.jsonl` 에 원래는 전혀 몰랐던 무엇이 들어 있는지 보세요.


