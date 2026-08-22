# 제2강: SKILL.md 메타데이터 구조

> 이번 강의 목표:
> - 공개 스펙이 요구하는 최소 `SKILL.md` 구조를 작성합니다.
> - 메타데이터 블록과 본문의 역할을 구분합니다.
> - `description`이 Skill이 무엇을 하는지와 언제 트리거되는지를 함께 설명하게 합니다.
>
> 선수 조건: 네 줄 Skill brief 하나를 완성했어야 합니다 | 이전 [<< 01](./01-prompt-to-skill.md) | 다음 [03 >>](./03-progressive-disclosure.md)

## Agent가 먼저 보는 것은 전체 설명이 아닙니다

네 줄 brief는 준비됐지만, 그것을 아무 Markdown 파일에나 넣어 두면 Agent가 그것을 Skill로 인식하지 못할 수 있고, 언제 로드해야 하는지도 알지 못합니다. Agent Skills를 지원하는 클라이언트는 먼저 `name`과 `description`을 보고, 작업이 매칭된 후에야 전체 `SKILL.md`를 읽습니다.[^S1][^S4]

두 번째 단계는 정적 검사가 인식할 수 있고 Agent가 올바르게 트리거할 수 있는 최소 `SKILL.md`를 작성하는 것입니다. 긴 설명은 진입점이 동작한 후에 추가합니다.

## 설명

### 최소 구조는 두 겹입니다

공개 스펙은 `SKILL.md`가 YAML frontmatter와 그 뒤의 Markdown 본문을 포함해야 한다고 요구합니다. frontmatter에는 최소한 `name`과 `description`이 있어야 하고, 본문에는 Agent가 Skill을 활성화한 후 따라야 하는 동작 지시를 씁니다.[^S2][^S7]

최소 파일은 이렇게 생겼습니다:

```markdown
---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quotes, themes, and product suggestions. Use when the user asks to summarize interviews, research calls, or transcript notes.
---

# Interview Notes

## Instructions

Read the transcript the user provides. Produce Chinese Markdown notes with:

- a short summary
- quoted evidence from the customer
- recurring themes
- 3 product suggestions

Do not edit the original transcript, send follow-up messages, or decide roadmap priority.
```

frontmatter는 파일 맨 앞의 YAML 메타데이터 블록으로, 위아래 두 줄의 `---`가 감쌉니다. 본문은 frontmatter 뒤에 오는 Markdown 지시문입니다. 둘의 차이는 중요합니다. 메타데이터는 Agent가 Skill을 발견하게 돕고, 본문은 Agent가 Skill을 실행하게 돕습니다.

### `name`은 안정적인 식별자입니다

`name`은 Skill의 기계 판독용 이름입니다. 공개 스펙은 1자 이상 64자 이하, 소문자, 숫자, 하이픈만 사용, 하이픈으로 시작하거나 끝낼 수 없음, 연속 하이픈 불가, 부모 디렉터리 이름과 일치를 요구합니다. Anthropic의 현재 모범 사례도 같은 길이와 문자 제한을 제시합니다.[^S2][^S7]

즉, 아래 이름들은 각각 다른 문제가 있습니다:

```yaml
name: InterviewNotes      # 대문자 포함
name: interview_notes     # 밑줄 포함
name: -interview-notes    # 하이픈으로 시작
name: interview--notes    # 연속 하이픈
```

합격인 이름은 디렉터리 이름처럼 생겨야 합니다:

```yaml
name: interview-notes
```

이름은 재미보다 안정적이고, 짧고, 읽기 쉬운 것을 먼저 추구하세요. 제목도 아니고 광고 문구도 아닙니다.

### `description`은 능력과 트리거를 함께 담당합니다

`description`은 Agent가 Skill을 로드할지 판단하는 짧은 설명입니다. 스펙은 비어 있지 않고 최대 1024자일 것을 요구하고, Skill이 무엇을 하는지, 언제 사용하는지를 함께 설명하고, Agent가 작업을 식별하는 데 도움이 되는 키워드를 포함하라고 권합니다. OpenAI와 Anthropic의 현재 가이드 모두 암시적 매칭을 이 필드에 둡니다.[^S2][^S4][^S7]

약한 작성법:

```yaml
description: Helps write notes.
```

이 문장은 입력, 출력, 트리거 장면을 설명하지 않습니다. 더 구체적인 작성법:

```yaml
description: Turns customer interview transcripts into Chinese Markdown notes with quotes, themes, and product suggestions. Use when the user asks to summarize interviews, research calls, or transcript notes.
```

이 문장은 앞부분이 능력을, 뒷부분이 언제 트리거되는지를 설명합니다. 네 줄 brief를 두 위치에 기계적으로 옮길 수는 없습니다. 능력, 긍정적 트리거, 필요한 부정적 구분은 `description`으로 들어가고, 입력 세부 사항, 전체 출력 요구 사항, 실행 금지 사항은 본문으로 들어갑니다. 어떤 "처리하지 않음"이 이 Skill을 아예 선택하면 안 된다는 뜻이라면, 그것을 부정적 구분으로 압축해 `description`에 쓰고, 구체적인 금지 사항은 본문에 유지하세요.

이번 강의 용어:

- `SKILL.md`: Skill 디렉터리에 반드시 있어야 하는 진입 파일로, 메타데이터와 지시문을 포함합니다.
- frontmatter: Markdown 파일 맨 위의 YAML 메타데이터 블록.
- `name`: 명명 제한을 따르고 부모 디렉터리와 일치하는 안정적인 식별자.
- `description`: Skill이 무엇을 하는지, 언제 트리거되는지를 설명하는 짧은 텍스트.

```agentmentor-check
{
  "id": "agent-skills-reuse-description-trigger",
  "label": "트리거 description 검사하기",
  "prompt": "아래 둘 중 어느 description이 Agent가 인터뷰 노트 Skill을 언제 로드할지 판단하기에 더 적합합니까?",
  "whyHere": "학습자가 description을 막연한 능력 소개로 쓰지 않고 능력과 트리거를 함께 썼는지 확인하는 단계입니다.",
  "copyPurpose": "Agent에게 내 description이 무엇을 하는지와 언제 트리거되는지를 모두 담고 있는지 검사하게 합니다.",
  "mode": "single",
  "choices": [
    {
      "id": "vague",
      "text": "모호한 description: Helps with customer content.",
      "correct": false,
      "feedback": "안정적인 입력, 출력, 트리거 키워드를 설명하지 않아 Agent가 언제 로드할지 판단하기 어렵습니다."
    },
    {
      "id": "specific",
      "text": "능력과 트리거가 명확한 description: Turns customer interview transcripts into Chinese Markdown notes with quotes and themes. Use when summarizing interviews, research calls, or transcript notes.",
      "correct": true,
      "feedback": "능력, 출력 형태, 트리거 장면을 함께 썼으므로 메타데이터 레이어에서 빠르게 판단하기에 적합합니다."
    }
  ]
}
```

## 완성 예시: 최소 검사 가능 SKILL.md

이전 강의의 brief가 다음과 같다고 가정해 보겠습니다:

```text
트리거: 사용자가 고객 인터뷰, 사용자 리서치 transcript 또는 sales call notes 정리를 요청할 때.
입력: 하나 이상의 transcript 텍스트. 화자와 시간 순서가 포함되어 있으면 가장 좋습니다.
출력: 주제 요약, 고객 원발언 증거, 질문 목록, 제품 제안 3가지를 담은 중국어 Markdown 노트.
처리하지 않음: 원본 transcript를 수정하지 않고, 사용자 대신 이메일을 보내지 않고, 로드맵 우선순위를 결정하지 않습니다.
```

먼저 디렉터리 이름과 `name`을 만듭니다:

```text
interview-notes/
  SKILL.md
```

그다음 최소 `SKILL.md`를 작성합니다:

```markdown
---
name: interview-notes
description: Turns customer interview transcripts into Chinese Markdown notes with quoted evidence, themes, open questions, and product suggestions. Use when summarizing interviews, research calls, sales call notes, or transcript files.
---

# Interview Notes

## Instructions

Use this skill when the user provides or points to customer interview transcripts, research call notes, or sales call notes.

Input can be one or more transcript files or pasted transcript text. Preserve customer meaning and mark direct quotes clearly.

Return Chinese Markdown with:

- summary
- quoted evidence
- recurring themes
- open questions
- 3 product suggestions

Do not modify the original transcript, send follow-up messages, or decide roadmap priority.
```

이 파일이 가장 기본적인 정적 검사를 통과하는 이유는 다음과 같습니다. frontmatter가 존재하고, `name`이 유효하며 디렉터리와 일치하고, `description`이 비어 있지 않으며 능력과 트리거를 포함하고, 본문이 실행 규칙을 제공합니다.

## 반쯤 완성된 예시: 릴리스 노트 SKILL.md

아래 brief를 보고 `name`과 `description`을 완성해 보세요:

```text
디렉터리 이름: release-notes
트리거: 사용자가 Git commit, PR 또는 changelog 초안으로 릴리스 노트를 생성해 달라고 요청할 때.
출력: 신규 기능, 수정 사항, 알려진 문제로 그룹화한 사용자용 Markdown 릴리스 노트.
```

반쯤 된 파일:

```markdown
---
name: __________________
description: __________________
---

# Release Notes

## Instructions

Write user-facing Markdown release notes from the change material the user provides.
```

참고 답안:

```yaml
name: release-notes
description: Turns commits, PR summaries, or changelog drafts into user-facing Markdown release notes grouped by features, fixes, and known issues. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog.
```

주의할 점은 `description`에 모든 동작 세부 사항을 욱여넣을 필요가 없다는 것입니다. 먼저 Agent가 "이 작업에 나를 로드해야 하는가"를 판단하게 해야 합니다.

<!-- exercises -->
## 연습 문제

### Level 1 (워밍업)

자신의 실제 작업 디렉터리 옆에 연습 디렉터리를 만들고, 예를 들어 `skill-drafts/<your-skill-name>/`처럼 만든 뒤, 이전 강의의 brief로 최소 `SKILL.md` 하나를 작성하세요. 개인 데이터는 넣지 말고 구조와 설명만 쓰세요.

방법: 먼저 디렉터리 이름을 소문자 kebab-case로 바꾸고, `name`이 디렉터리 이름과 완전히 같게 합니다. brief에서 능력, 긍정적 트리거, 필요한 부정적 구분을 하나의 `description`으로 압축하고, 입력 세부 사항, 전체 출력 요구 사항, 실행 금지 사항은 본문에 씁니다.
<!-- rubric -->
- 파일 이름이 `SKILL.md`이고 frontmatter로 시작합니다.
- `name`이 소문자, 숫자, 하이픈만 포함하고 부모 디렉터리 이름과 일치합니다.
- `description`이 무엇을 하는지, 언제 트리거되는지, 그리고 꼭 필요한 부정적 구분을 함께 설명합니다.
- 본문에 최소한 입력 세부 사항, 전체 출력 요구 사항, 실행 금지 사항이 적혀 있습니다.
<!-- answer -->
합격 답안은 유효한 여러 줄 frontmatter로 시작해야 합니다:

```markdown
---
name: release-notes
description: Turns ... Use when ...
---
```

그 뒤에 Markdown Instructions를 씁니다. 흔한 실수는 디렉터리가 `ReleaseNotes`인데 `name`을 `release-notes`로 쓰는 것입니다. 공개 스펙은 둘의 일치를 요구합니다.
<!-- hint -->
먼저 frontmatter 앞 세 줄만 검사하고, 본문 다듬기는 서두르지 마세요.
<!-- hint -->
description이 써지지 않으면, 이전 강의의 "트리거"와 "출력" 두 줄을 그대로 합쳐 짧은 영문 또는 한 문장 설명으로 만들어 보세요.

### Level 2 (심화)

같은 Skill에 대해 대표적인 사용자 요청 세 개를 쓰고, 당신의 `description`이 잘못된 트리거나 누락된 트리거를 일으키지 않는지 검사하세요. 최소 하나의 요청은 트리거되면 안 되는 인접 작업이어야 합니다.

방법: 연습 디렉터리에 `trigger-cases.md` 초안을 새로 만들고, "트리거되어야 함 1", "트리거되어야 함 2", "트리거되면 안 됨 1"을 나열합니다. 각각을 `description`의 키워드와 경계와 대조합니다.
<!-- rubric -->
- 세 요청 모두 실제로 나올 법한 사용자 표현입니다.
- 최소 두 개의 트리거 대상 요청이 description의 키워드나 의미와 대응됩니다.
- 트리거되면 안 되는 요청이 `description`의 범위 단어로 제외되고, 본문에 대응하는 금지 동작이 따로 있습니다.
<!-- answer -->
`release-notes`를 예로 들면 "이 PR들로 릴리스 노트를 써 줘"는 트리거되어야 하고, "changelog를 사용자가 이해할 수 있는 버전으로 바꿔 줘"도 트리거되어야 하며, "Git tag를 만들고 프로덕션에 배포해 줘"는 트리거되면 안 됩니다. `description`이 "Helps with releases"처럼만 쓰여 있으면 세 번째가 잘못 판정되기 쉽습니다. 범위를 "write release notes"로 좁히고, "Do not use for tagging, deployment, or publishing operations"를 명확히 넣어야 합니다. 본문에는 "tag를 만들지 않고 릴리스를 실행하지 않는다"를 써서, Skill이 이미 로드됐거나 사용자가 혼합 작업을 요청할 때 실행을 제약합니다.
<!-- hint -->
요청은 스펙 필드처럼 쓰지 말고 사용자가 실제로 할 법한 말로 쓰세요.
<!-- hint -->
인접 작업에는 보통 "보내기, 릴리스, 배포, 원본 파일 수정, 우선순위 결정" 같은 동작이 들어 있습니다.
<!-- /exercises -->

## 가져갈 것: 메타데이터의 두 가지 역할

최소 `SKILL.md`는 이제 두 가지 역할을 갖습니다. frontmatter는 발견과 선택을 담당하고, 본문은 실제 실행을 담당합니다. 진입점이 동작하고 나면 다음 문제는 자료가 계속 길어진다는 것입니다. 다음 단계는 Agent가 작업에 필요할 때만 태그, 예시, 템플릿을 읽게 하는 것입니다.
