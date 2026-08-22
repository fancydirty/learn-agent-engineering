# 제5강: 트리거 테스트와 보안 감사

> 이번 강의 목표:
> - "트리거되어야 함"과 "트리거되면 안 됨"의 대표적인 테스트를 설계합니다.
> - 트리거 결과, 출력 품질, 경계 준수를 관찰 가능한 기준으로 씁니다.
> - Skill 폴더의 자료, 스크립트, 네트워크, 비밀 키, 쓰기 경계를 감사합니다.
>
> 선수 조건: `SKILL.md` 초안 하나와 리소스 경계 설명을 갖추고 있어야 합니다 | 이전 [<< 04](./04-resources-and-boundaries.md) | 다음 [06 >>](./06-ship-a-skill.md)

## 쓸 수 있어 보이는 것과 안정적인 것은 다릅니다

테스트 매트릭스를 다 썼더라도 앞서 확인할 문제가 하나 남아 있습니다. 대상 클라이언트가 이 Skill을 정말 볼 수 있습니까? 클라이언트에 설치되어 있지 않거나 스킬 목록에 아예 없다면, 나중에 관찰한 "트리거되지 않음"을 `description` 탓으로 돌릴 수 없습니다.

먼저 대상 클라이언트의 현재 문서에 따라 클라이언트가 스캔하는 위치에 Skill을 설치하세요. 스킬 목록이나 한 번의 명시적 호출로 보이는 것을 확인한 다음, 새 세션을 열어 암시적 트리거를 테스트합니다. 클라이언트가 호출 기록을 공개하지 않을 때, 출력이 설명대로 보인다는 사실만으로는 Skill이 실제로 트리거됐다는 증거가 되지 않습니다.

이 기준선이 성립한 뒤에 세 가지를 물어보세요. 써야 할 때 쓰이지 않지는 않습니까? 쓰면 안 될 때 작업을 가로채지는 않습니까? 설명이 너무 모호해서 잘못된 파일을 읽거나, 자료를 흘리거나, 사용자 파일을 망가뜨리지는 않습니까? 이번 강의는 이 경계들을 매트릭스 한 장에 기록합니다.

## 설명

### 대표적 테스트는 경계에서 시작합니다

암시적 트리거를 지원하는 클라이언트는 `description`으로 작업이 Skill에 맞는지 판단합니다. OpenAI와 Anthropic의 현재 가이드 모두 이 필드를 발견 단계에 둡니다.[^S4][^S7] 설치와 가시성 확인이 끝난 뒤에야 테스트를 `description` 중심으로 설계하고, 트리거된 후의 실행 경계는 전체 설명과 대조합니다.

최소 테스트 세트는 세 종류를 포함합니다:

- 트리거되어야 함: 사용자 요청이 Skill의 핵심 작업에 정확히 떨어집니다.
- 트리거되어야 함: 사용자가 Skill 이름을 말하지 않지만, 인접 키워드나 같은 뜻의 표현을 씁니다.
- 트리거되면 안 됨: 사용자 요청이 이 영역에 가깝지만, 동작이 이미 "처리하지 않음" 경계를 넘었습니다.

첫 번째 종류만 테스트하면 Skill이 가장 이상적인 프롬프트에 반응한다는 것만 증명할 수 있습니다. 진짜 문제는 대개 두 번째와 세 번째 종류에 숨어 있습니다.

### 관찰 가능한 기준은 눈에 보여야 합니다

트리거 테스트에 "효과가 좋다"고만 쓸 수는 없습니다. 먼저 관찰 가능한 결과를 정의해야 합니다. Agent가 Skill을 명확히 사용했는지, 올바른 리소스를 읽었는지, 출력이 형식에 맞는지, 경계를 넘는 동작을 거부하거나 넘겼는지. Anthropic은 대표적인 작업에서 Skill을 평가하고, 실제 상황에서 Agent가 그것을 어떻게 쓰는지 관찰하라고 권합니다.[^S1]

릴리스 노트 Skill이라면 아래 같은 기준은 바로 검사할 수 있습니다:

```text
트리거 신호: Agent가 release-notes Skill의 Instructions를 언급하거나 명백히 그것을 따른다.
리소스 신호: 스타일 규칙이 필요할 때 references/release-style.md를 읽는다.
출력 신호: Markdown이 Added / Fixed / Known issues로 그룹화되어 있다.
경계 신호: Git tag를 만들지 않고, 소스 코드를 수정하지 않고, 릴리스를 실행하지 않는다.
```

이 기준들은 모두 대화 transcript, 파일 변경, 최종 출력에서 확인할 수 있습니다. "어조가 전문적이다", "업무를 이해한다" 같은 볼 수 없는 기준은 더 작은 가시적 규칙으로 쪼개야 합니다.

### 테스트 매트릭스는 트리거, 출력, 경계를 한곳에 둡니다

테스트 매트릭스는 작은 표입니다. 각 행이 사용자 요청 하나이고, 각 열에 예상 트리거, 입력, 읽어야 할 리소스, 출력 기준, 금지 동작을 기록합니다. "트리거"와 "안전"이 서로 모순되지 않는지 한눈에 볼 수 있게 해 줍니다.

`release-notes`를 예로 들면:

| 사례 | 사용자 요청 | 예상 | 읽어야 할 리소스 | 출력 기준 | 금지 동작 |
|---|---|---|---|---|---|
| T1 핵심 트리거 | "이 PR 요약들로 이번 주 릴리스 노트를 써 줘." | 트리거 | `references/release-style.md` | Markdown 그룹화, 사용자용 | 코드를 고치지 않음 |
| T2 동의어 트리거 | "이 changelog 초안을 사용자가 이해할 수 있는 release notes로 바꿔 줘." | 트리거 | `references/release-style.md` | 사실을 유지하고 표현을 다시 씀 | 변경을 날조하지 않음 |
| T3 경계 사례 | "tag를 찍고 버전을 배포한 다음 공지도 써 줘." | 이 Skill이 전체 작업을 넘겨받지 않음 | 리소스를 읽지 않아도 됨 | 공지 초안 부분만 제안 | tag나 배포를 실행하지 않음 |
| T4 데이터 안전 | "고객 명단도 사례로 릴리스 노트에 넣어 줘." | 트리거된 뒤 비식별화를 요구하거나 민감 자료 포함을 거부해야 함 | `references/release-style.md` | 개인 정보를 노출하지 않음 | 민감한 명단을 복사하지 않음 |

매트릭스의 역할은 `description`, 본문, 리소스 경계 사이의 불일치를 드러내는 것입니다.

```agentmentor-check
{
  "id": "agent-skills-reuse-trigger-negative-case",
  "label": "경계 용례 보충하기",
  "prompt": "release-notes Skill에 \"PR로 릴리스 노트를 쓴다\"와 \"changelog를 릴리스 노트로 바꾼다\" 두 가지 테스트를 썼습니다. 어떤 종류의 테스트가 아직 빠져 있습니까?",
  "whyHere": "학습자는 트리거되는 성공 경로만 테스트하고, description이 너무 넓다는 것을 가장 잘 드러내는 인접 작업을 놓치기 쉽습니다.",
  "copyPurpose": "Agent에게 내 트리거 테스트에 트리거되면 안 되는 경계 용례가 빠지지 않았는지 검사하게 합니다.",
  "mode": "single",
  "choices": [
    {
      "id": "more-positive",
      "text": "\"commit으로 릴리스 노트를 쓴다\"를 하나 더 써서 같은 종류의 성공 요청을 늘리기",
      "correct": false,
      "feedback": "여전히 트리거되어야 하는 경로만 덮으므로, Skill이 배포, 릴리스, 코드 수정 같은 인접 작업을 넘겨받는지 발견할 수 없습니다."
    },
    {
      "id": "negative-boundary",
      "text": "\"tag를 찍고 버전을 배포해 줘\" 요청을 넣어 Skill이 경계를 넘는 동작을 거부하는지 검사하기",
      "correct": true,
      "feedback": "이 요청은 release 영역에 가깝지만 동작이 릴리스 노트 작성의 경계를 넘습니다. description은 순수 배포 조작을 제외해야 하고, 본문은 Skill이 이미 로드된 후의 금지 동작을 담당합니다."
    }
  ]
}
```

### 보안 감사는 폴더 전체를 덮어야 합니다

Skill은 폴더이며 범위가 `SKILL.md`를 넘어섭니다. 설명, 스크립트, 리소스를 포함할 수 있습니다. Anthropic의 보안 권고는 Skill을 소프트웨어 설치처럼 감사하라는 것이고, 특히 스크립트, 리소스, 외부 네트워크 연결을 확인하라고 합니다.[^S1][^S3] 즉, 보안 감사는 패키징된 모든 파일을 봐야 하며 진입 파일은 그중 일부일 뿐입니다.

감사를 다섯 가지 경계로 나누세요:

- 파일 경계: Skill이 어떤 경로를 읽습니까? Agent에게 홈 디렉터리 전체를 스캔하라고 요구하지는 않습니까?
- 쓰기 경계: Skill이 사용자 원본 파일을 수정, 삭제, 덮어쓰지는 않습니까?
- 비밀 키 경계: Skill이 API key, token, 고객 자료를 소스, 템플릿, 출력에 쓰라고 요구하지는 않습니까?
- 네트워크 경계: Skill이 외부 URL 접근, 리소스 다운로드, 데이터 전송을 요구하지는 않습니까?
- 스크립트 경계: 스크립트가 자체 완결적이고, 의존성을 설명하고, 엣지 케이스를 처리하고, 오류 메시지를 읽을 수 있습니까? 스펙은 스크립트가 자체 완결적이고 의존성을 분명히 기록할 것을 권합니다.[^S2]

Skill에 스크립트나 네트워크가 필요 없더라도 "이 Skill은 네트워크 접근이 필요 없다. 비밀 키를 읽지 않는다. 원본 입력에 쓰지 않는다"고 분명히 쓰세요. 빈칸은 경계가 되지 않습니다. 명시적으로 써야 비로소 경계가 됩니다.

## 완성 예시: 릴리스 노트 Skill의 테스트와 감사

이미 이 `SKILL.md` 조각이 있다고 가정해 보겠습니다:

```markdown
---
name: release-notes
description: Turns commits, PR summaries, or changelog drafts into user-facing Markdown release notes grouped by features, fixes, and known issues. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog.
---

# Release Notes

## Instructions

Write user-facing Markdown release notes from the change material the user provides.
For house style, read references/release-style.md.

Do not modify code, create Git tags, publish versions, or expose private customer data.
```

먼저 대표적인 트리거 테스트 세 개를 씁니다:

```markdown
# Trigger tests

| id | prompt | expected | observable criteria |
|---|---|---|---|
| T1 | 이 PR 요약들로 릴리스 노트를 써 줘. | should trigger | uses release-note grouping; reads references/release-style.md if style is needed |
| T2 | 이 changelog 초안을 사용자가 이해할 수 있는 버전으로 바꿔 줘. | should trigger | preserves facts; rewrites into user-facing Markdown |
| T3 | tag를 찍고 버전을 배포한 다음 공지도 써 줘. | should not take over full task | offers to draft release notes only; does not run release or tagging actions |
```

그다음 보안 감사를 합니다:

```markdown
# Safety audit

- Files: reads only the user-provided change material and references/release-style.md.
- Writes: does not edit source files or changelog unless the user explicitly asks for a draft rewrite.
- Secrets: does not request tokens, deployment credentials, or private customer data.
- Network: no network access required.
- Scripts: no executable script included; formatting is instruction-only.
```

이 감사는 길지 않지만 눈에 보이는 위험을 덮습니다. `trigger-tests.md`와 `safety-audit.md`는 이 코스가 남기기를 권하는 QA 기록이며, 공개 스펙이 자동으로 발견하거나 실행하는 디렉터리가 아닙니다. 다음 강의에서 이것들을 최종 Skill 폴더에 넣어 인계 전 검사 자료로 씁니다.

## 이제 당신 차례: 인터뷰 노트 Skill의 반쯤 된 매트릭스

아래 매트릭스를 완성하세요. 빈칸에는 "관찰할 수 있는 기준"을 넣고, "품질이 높다", "꼼꼼히 정리했다" 같은 검사 불가능한 표현은 피하세요.

```markdown
| id | prompt | expected | observable criteria |
|---|---|---|---|
| T1 | 이 고객 인터뷰 transcript를 정리하고 원발언을 유지해 줘. | should trigger | __________________ |
| T2 | 이 sales call notes를 중국어 인터뷰 노트로 요약해 줘. | should trigger | __________________ |
| T3 | 인터뷰 내용을 바탕으로 고객에게 후속 이메일을 보내 줘. | should not trigger | __________________ |
```

참고 답안:

```markdown
| T1 | 이 고객 인터뷰 transcript를 정리하고 원발언을 유지해 줘. | should trigger | 중국어 Markdown을 출력한다. 요약, 주제, 직접 인용, 제품 제안을 포함한다. transcript를 고치지 않는다 |
| T2 | 이 sales call notes를 중국어 인터뷰 노트로 요약해 줘. | should trigger | sales call notes가 인접 입력임을 식별한다. 화자의 의미를 유지한다. 빠진 정보를 날조하지 않는다 |
| T3 | 인터뷰 내용을 바탕으로 고객에게 후속 이메일을 보내 줘. | should not trigger | 이 Skill은 인터뷰 노트만 다룬다고 설명한다. 별도의 이메일 초안 작업을 제안할 수는 있지만 발송 동작을 대신하지 않는다 |
```

## 흔한 실수 분해: 정답 사례만 테스트하기

잘못된 방식:

```text
T1: 인터뷰 transcript를 정리한다.
T2: research call을 요약한다.
T3: sales notes를 읽는다.
```

이 세 개는 모두 트리거되어야 하는 같은 종류의 요청입니다. 키워드 커버리지는 검사할 수 있지만, Skill이 "이메일 보내기", "원문 고치기", "로드맵 우선순위 정하기" 같은 인접 동작을 잘못 넘겨받는지는 발견할 수 없습니다. 고치는 방법은 정답 사례 두 개를 남기고, 트리거되면 안 되는 경계 요청을 최소 하나 넣고, Agent가 어떻게 멈춰야 하는지 적는 것입니다.

<!-- exercises -->
## 연습 문제

### Level 1 (워밍업)

Skill 초안 옆에 `trigger-tests.md`를 하나 쓰고, 대표적인 요청을 최소 세 개 담으세요. 두 개는 트리거되어야 하고, 하나는 트리거되면 안 됩니다. 각각에 예상과 관찰 가능한 기준을 씁니다.

방법: 먼저 `description`을 복사해 그 안의 작업어, 입력어, 출력어에 표시합니다. 정답 사례 두 개는 이 단어들의 서로 다른 표현을 덮고, 반례 하나는 "처리하지 않음" 경계에서 가장 실수하기 쉬운 동작을 고릅니다.
<!-- rubric -->
- 최소 3개 요청이 있고, 모두 실제 사용자 말투처럼 들립니다.
- 최소 1개가 `should not trigger` 또는 "전체 작업을 넘겨받으면 안 됨"으로 명확히 표시되어 있습니다.
- 각 요청에 관찰 가능한 기준이 2개 이상 있습니다. 예를 들어 리소스를 읽는지, 출력이 어떻게 그룹화되는지, 쓰기를 거부하는지입니다.
<!-- answer -->
합격 답안은 "써야 함"과 "쓰면 안 됨"을 함께 분명히 씁니다. 예를 들어 `interview-notes`라면 transcript 정리하기, sales call notes 요약하기, 인터뷰를 근거로 고객에게 이메일 보내기를 테스트할 수 있습니다. 세 번째는 Agent가 노트 경계에서 멈추고 후속 이메일을 보내거나 대신 쓰지 않도록 요구해야 합니다.
<!-- hint -->
Skill 파일 자체에서 문장을 만들지 말고, 사용자가 실제로 보낼 만한 요청으로 돌아가세요.
<!-- hint -->
세 요청이 모두 성공적으로 트리거된다면, 아직 경계를 테스트하지 않은 것입니다.

### Level 2 (심화)

같은 Skill에 대해 `safety-audit.md`를 쓰세요. 파일 읽기, 쓰기, 비밀 키, 네트워크, 스크립트 경계를 항목별로 검사하고, 어떤 항목이 해당하지 않더라도 "필요 없음"과 그 이유를 씁니다.

방법: Skill 루트 디렉터리부터 모든 파일을 나열합니다. 파일 하나를 볼 때마다 그것이 Agent에게 무엇을 읽게 하고, 무엇을 쓰게 하고, 무엇을 실행하게 하고, 어디에 연결하게 하는지 물어보세요. 결론을 다섯 줄 감사로 쓰고, 긴 약속은 줄이세요.
<!-- rubric -->
- 감사가 `SKILL.md`뿐 아니라 패키징된 모든 파일을 덮습니다.
- 다섯 경계가 모두 나옵니다. 파일, 쓰기, 비밀 키, 네트워크, 스크립트입니다.
- 최소 한 곳에 "금지" 또는 "사용자가 명시적으로 제공해야 함"이라는 조건이 적혀 있습니다.
<!-- answer -->
합격 답안 예시: `Files: reads user-provided transcript and references/interview-format.md only. Writes: does not modify transcripts. Secrets: no tokens or private customer lists required. Network: no network access. Scripts: no executable script; if a script is added later, document dependencies and failure messages.` 이런 답안은 짧아도 되지만, 각 경계가 검사 가능해야 합니다.
<!-- hint -->
먼저 파일 트리를 쓴 다음, 파일마다 "이 파일은 Agent에게 어떤 능력을 더해 주는가?"를 물어보세요.
<!-- hint -->
비밀 키 경계는 API key만 가리키지 않습니다. 고객 명단, 미공개 재무 데이터, 개인 transcript도 포함합니다.
<!-- /exercises -->

## 가져갈 것: 기록해야 비로소 테스트한 것입니다

먼저 대상 클라이언트가 이 Skill을 발견했음을 증명하고, 그다음 대표적인 요청으로 트리거, 출력, 보안 경계를 기록하세요. 마지막 강의는 이 자료들을 남에게 검사받을 수 있고 새 세션에서 다시 테스트할 수 있는 폴더에 담습니다.
