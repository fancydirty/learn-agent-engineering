# 제6강: 워크플로에서 배포 가능한 Skill로

> 이번 강의 목표:
> - `SKILL.md`, 참고 파일, 템플릿 또는 스크립트 경계 설명을 담은 완전한 Skill 폴더를 조립합니다.
> - 스펙 검증 도구나 수동 등가 검사로 진입 파일이 유효한지 확인합니다.
> - 자신의 Agent에서 대표적인 테스트 3개를 실행하고, 실패를 기록하고, 수정합니다.
>
> 선수 조건: 트리거 테스트 매트릭스와 보안 감사를 완료했어야 합니다 | 이전 [<< 05](./05-testing-and-safety.md) | 다음 [코스 목차 >>](./README.md)

## 산출물은 다시 검토할 수 있는 파일 묶음입니다

여기까지 오면서 `SKILL.md`, 리소스 계층화, 실행 경계, 트리거 테스트, 보안 감사를 갖췄습니다. 마지막 단계는 이것들을 남이 검사할 수 있고, Agent가 읽을 수 있고, 자신이 다시 테스트할 수 있는 폴더 하나에 담는 것입니다.

이번 강의의 종점은 아주 구체적입니다. 최소한 진입 파일, `references/` 파일 하나, 템플릿 또는 스크립트 경계 설명 하나, 그리고 대표적인 테스트 기록 3개를 갖춘 완전한 Skill 폴더입니다. 이 종점은 실행 가능한 코드 작성을 요구하지 않습니다.

## 설명

### 완전한 폴더는 먼저 형태부터 봅니다

공개 스펙은 Skill을 최소한 `SKILL.md`를 포함하는 디렉터리로 정의하고, `scripts/`, `references/`, `assets/`로 흔한 선택적 내용을 조직하기로 약속합니다. OpenAI의 현재 가이드도 같은 디렉터리 형태를 씁니다.[^S2][^S4]

이 코스는 초보자에게 적합한 최소 인계 형태를 씁니다:

```text
release-notes/
  SKILL.md
  references/
    release-style.md
  assets/
    release-notes-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md`는 진입점입니다. `references/release-style.md`는 스타일과 경계 세부 사항을 담고, `assets/release-notes-template.md`는 고정 출력 골격을 담고, `tests/trigger-tests.md`는 대표적인 테스트 세 개를 담고, `safety-audit.md`는 어떤 위험을 검사했는지 기록합니다.

여기에 흐려지기 쉬운 경계가 하나 있습니다. `tests/`와 `safety-audit.md`는 이 코스가 자체적으로 만든 QA 기록이며, 스펙이 약속한 자동 발견 디렉터리에 속하지 않습니다. 이것들을 폴더에 남기는 이유는 다음 유지보수 담당자가 테스트와 수정 과정을 볼 수 있게 하기 위해서입니다.

### 검증은 두 겹입니다: 스펙 검사와 수동 등가 검사

`skills-ref` 저장소 설명대로 참조 라이브러리를 설치했고 현재 가상 환경에서 명령을 찾을 수 있다면, 그것으로 `SKILL.md` frontmatter와 명명 제약을 검사할 수 있습니다. 이 라이브러리는 데모 용도라고 명시되어 있으므로, 이 코스는 언제나 수동 등가 검사를 함께 남깁니다.[^S2][^S6]

```text
1. 폴더 이름이 frontmatter의 name과 완전히 같다.
2. SKILL.md가 첫 줄부터 --- 로 시작한다.
3. frontmatter가 YAML로 해석된다.
4. name이 소문자, 숫자, 하이픈만 포함하고, 하이픈으로 시작하거나 끝나지 않고, 연속 하이픈이 없다.
5. description이 비어 있지 않고 무엇을 하는지와 언제 쓰는지를 설명한다.
6. 본문이 실제로 존재하는 `references/` 또는 `assets/` 상대 경로를 가리킨다.
```

검증은 Skill이 쓸 만하다는 것을 증명하지 못하고, 진입 파일에 낮은 수준의 구조 오류가 없다는 것만 증명합니다. 정말 쓸 만한지는 대표적인 테스트 세 개에 달려 있습니다.

### 테스트 세 개는 자신의 Agent에서 실행해야 합니다

ChatGPT와 Codex는 명시적 호출과 암시적 호출을 지원하며, 암시적 호출은 작업이 `description`과 맞는지에 따라 결정됩니다. Anthropic의 현재 가이드도 메타데이터를 먼저 보고 전체 본문을 나중에 읽는 발견 과정을 씁니다.[^S4][^S7] 테스트 전에 대상 클라이언트의 현재 문서에 따라 Skill을 설치하고, 스킬 목록이나 명시적 호출로 보이는 것을 확인한 다음, 용례마다 새 세션을 열어 암시적 트리거를 테스트하세요. 클라이언트가 호출 기록을 보여 주지 않을 때, 출력이 비슷하다는 것은 결과가 비슷하다는 뜻일 뿐 트리거가 일어났다는 증거가 되지는 않습니다.

테스트마다 네 가지를 기록합니다:

```text
Prompt: 사용자 요청 원문
Expected: should trigger / should not trigger
Observed: Agent가 실제로 한 일
Revision: description, 본문, 리소스, 아니면 테스트 자체 중 무엇을 고칠지
```

Skill이 보이는 것을 확인했는데도 Agent가 트리거하지 않았다면, `description`을 바로 긴 목록으로 늘리지 마세요. 먼저 빠진 것이 트리거어인지, 입력어인지, 출력어인지, 아니면 부정적 구분이 너무 넓게 쓰였는지를 보세요. 고친 다음에는 새 세션에서 같은 테스트를 다시 돌립니다.

### 실패 기록도 산출물의 일부입니다

배포 가능한 Skill은 실패를 숨기면 안 됩니다. Anthropic은 대표적인 작업에서 또 다른 새 세션이 Skill을 어떻게 쓰는지 관찰하고, 실제 결과에 따라 수정하라고 권합니다.[^S1][^S7] 따라서 `tests/trigger-tests.md`에는 실패 기록과 수정 기록을 남겨야 합니다.

권장 형식:

```markdown
| id | expected | observed | revision |
|---|---|---|---|
| T1 | should trigger | triggered and used template | no change |
| T2 | should trigger | did not trigger on "customer-facing changelog" | add "customer-facing changelog" to description |
| T3 | should not trigger | offered to create Git tag | add "Do not create Git tags" to Instructions |
```

이 기록은 Skill을 "한 번 써서 끝"에서 "유지보수 가능"으로 밀어 올립니다. 다음에 당신이나 다른 Agent가 넘겨받을 때, 어떤 문장이 왜 거기에 쓰여 있는지 알게 됩니다.

## 완성 예시: 릴리스 노트 Skill 폴더

아래는 완전하지만 아주 작은 `release-notes` Skill입니다. 스크립트가 필요 없고 참고 파일과 템플릿만 씁니다.

```text
release-notes/
  SKILL.md
  references/
    release-style.md
  assets/
    release-notes-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

`SKILL.md`:

```markdown
---
name: release-notes
description: Turns commits, PR summaries, customer-facing changelog drafts, or change lists into user-facing Markdown release notes. Use when the user asks to write release notes, summarize a release, or turn change history into a changelog. Do not use for tagging, deployment, or publishing operations.
---

# Release Notes

## Instructions

Use this skill when the user asks for user-facing release notes from commits, PR summaries, changelog drafts, or change lists.

Read references/release-style.md before writing if the user asks for house style, audience tone, or wording rules.

Use assets/release-notes-template.md for the output structure unless the user provides a different structure.

Return Markdown grouped by Added, Fixed, Changed, and Known issues. Preserve the facts in the input. Mark missing facts as open questions instead of inventing them.

Do not modify source code, create Git tags, deploy, publish, send announcements, or expose private customer data.
```

`references/release-style.md`:

```markdown
# Release style

- Write for product users, not internal engineers.
- Keep each bullet under 25 words when possible.
- Start each bullet with the user-visible change.
- Avoid commit hashes unless the user asks for an engineering changelog.
- If a change affects privacy, reliability, or data loss, keep the warning explicit.
```

`assets/release-notes-template.md`:

```markdown
# Release notes

## Added

- 

## Changed

- 

## Fixed

- 

## Known issues

- 

## Open questions

- 
```

`tests/trigger-tests.md`:

```markdown
| id | prompt | expected | observed | revision |
|---|---|---|---|---|
| T1 | 이 PR 요약들로 릴리스 노트를 써 줘. | should trigger | pending | pending |
| T2 | customer-facing changelog 초안을 더 명확한 release notes로 바꿔 줘. | should trigger | pending | pending |
| T3 | tag를 찍고 버전을 배포한 다음 공지도 써 줘. | should not take over full task | pending | pending |
```

`safety-audit.md`:

```markdown
# Safety audit

- Files: reads only user-provided change material, references/release-style.md, and assets/release-notes-template.md.
- Writes: produces draft Markdown in the conversation unless the user explicitly asks for a file path.
- Secrets: does not request deployment credentials, API keys, private customer lists, or unreleased financial data.
- Network: no network access required.
- Scripts: no executable script included; formatting is instruction-only.
```

인계할 때는 먼저 구조를 검증하세요. 스펙 검증 도구를 설치했다면 그 설명대로 검사하고, 없다면 앞의 여섯 가지 수동 검사를 항목별로 대조하세요. 그다음 Skill을 대상 Agent가 읽을 수 있는 위치에 두고, 스킬 목록이나 명시적 호출로 보이는 것을 확인한 뒤, T1, T2, T3 세 요청을 각각 새 세션에서 테스트해 앞 테스트가 다음 판단을 오염시키지 않게 합니다. 클라이언트가 호출 기록을 제공하지 않으면 "출력이 규칙에 맞음"을 결과 증거로 기록하고, 트리거 증거로 쓰지 마세요.

## 이제 당신 차례: 경쟁사 리서치 Skill의 반쯤 된 예시

아래 두 자리를 완성하세요. `description`은 언제 트리거되는지 설명해야 하고, `references/research-boundaries.md`는 보안 경계 하나를 막아야 합니다.

```text
competitor-research/
  SKILL.md
  references/
    research-boundaries.md
  assets/
    competitor-brief-template.md
  tests/
    trigger-tests.md
  safety-audit.md
```

반쯤 된 `SKILL.md`:

```markdown
---
name: competitor-research
description: ________________________________________
---

# Competitor Research

## Instructions

Use this skill to turn user-provided competitor notes, public website excerpts, or product comparison notes into a structured competitor brief.

Read references/research-boundaries.md before writing the brief.

Use assets/competitor-brief-template.md for the output structure.
```

반쯤 된 `references/research-boundaries.md`:

```markdown
# Research boundaries

- Use only sources or excerpts the user provides in the task.
- ________________________________________
- Mark unsupported claims as "unverified" instead of presenting them as fact.
```

참고 답안:

```yaml
description: Turns user-provided competitor notes, public website excerpts, or product comparison notes into a structured competitor brief. Use when the user asks to summarize competitors, compare positioning, or prepare competitor research from supplied material. Do not use for scraping, private-data collection, or claims without sources.
```

```markdown
- Do not collect private employee, customer, or account data; ask the user to provide public, sourceable material instead.
```

이 faded example의 핵심은 이것입니다. 리서치 Skill을 만들더라도 "리서치"를 무제한 권한으로 쓰지 마세요. 입력 출처와 검증되지 않은 주장 모두에 경계가 있어야 합니다.

```agentmentor-action
mode: reasoning_audit
label: 내 최종 Skill 폴더 감사하기
description: 이번 강의의 종점 기준으로 SKILL.md, 참고 파일, 템플릿 또는 스크립트 경계, 테스트 세 개, 보안 감사가 서로 일치하는지 Agent에게 검사하게 합니다.
purpose: Skill 폴더 하나를 다 썼습니다. 이 코스의 종점을 만족하는지 검사하고, description, 리소스 경로, 트리거 테스트, 보안 경계 사이의 모순을 짚어 주세요.
rules:
  - 한 번에 위험 영역 하나만 검사하세요: 구조, 트리거, 출력, 보안, 테스트 기록.
  - 제가 제공한 구체적인 파일 조각을 인용하고, Agent Skills 개념을 일반론으로 다시 설명하지 마세요.
  - 문제마다 바로 편집할 수 있는 수정 제안을 하나씩 주세요.
```

<!-- exercises -->
## 연습 문제

### Level 1 (워밍업)

연습 디렉터리에서 최종 Skill 폴더를 조립하세요. `SKILL.md`, `references/` 파일 하나, 템플릿 파일 또는 스크립트 경계 설명 하나, `tests/trigger-tests.md`, `safety-audit.md`를 반드시 포함해야 합니다.

방법: 먼저 파일 트리를 그리고, 빈 파일을 하나씩 만든 다음, 앞선 강의의 brief, 리소스 설명, 테스트 매트릭스, 보안 감사를 해당 위치로 옮깁니다. 개인 원본 데이터는 넣지 마세요.
<!-- rubric -->
- 파일 트리에 산출물이 최소 5개 있습니다: 진입 파일, 참고 자료, 템플릿 또는 스크립트 경계, 테스트, 보안 감사.
- `SKILL.md`에서 참조한 상대 경로가 폴더 안에 실제로 존재합니다.
- Skill이 이 코스 페이지나 숨은 컨텍스트에 의존하지 않고, 폴더만 따로 복사해도 읽힙니다.
<!-- answer -->
합격 산출물은 이런 모습입니다: `my-skill/SKILL.md`, `my-skill/references/format.md`, `my-skill/assets/output-template.md`, `my-skill/tests/trigger-tests.md`, `my-skill/safety-audit.md`. 템플릿을 쓰지 않기로 했다면 명확한 스크립트 경계 설명을 대신 써야 합니다. 예를 들어 `scripts/README.md`에 "스크립트를 포함하지 않는다. 앞으로 스크립트를 넣는다면 의존성, 입력, 출력, 실패 메시지를 반드시 설명한다"고 씁니다.
<!-- hint -->
처음에는 `SKILL.md`가 참고 파일 하나와 템플릿 하나만 참조하게 해서 경로 오류를 줄이세요.
<!-- hint -->
폴더를 다른 Agent에게 건네 읽게 할 수 없다면, 어떤 설명이 아직 당신의 대화 속에 숨어 있는 것입니다.

### Level 2 (심화)

최종 Skill에 검증 한 번과 대표적인 테스트 세 개를 실행하세요. 공식 저장소 설명대로 `skills-ref`를 설치하고 활성화했다면 `skills-ref validate ./your-skill`을 실행할 수 있고, 그렇지 않다면 이번 강의의 수동 등가 검사 여섯 항목을 수행합니다. 그다음 자신의 Agent에서 테스트 3개를 돌리고 observed와 revision을 `tests/trigger-tests.md`에 다시 써 넣으세요.

방법: Skill 상위 디렉터리에서 검증이나 수동 검사를 실행합니다. 대상 클라이언트가 이 Skill을 설치하고 목록에 표시했는지 확인한 뒤, 테스트 세 개를 각각 새 세션에서 Agent에게 보냅니다. 트리거되는지, 무엇을 읽는지, 무엇을 출력하는지, 경계를 넘는지 관찰하고 결과를 있는 그대로 기록하세요.
<!-- rubric -->
- 검증 결과 또는 수동 검사 6항목이 모두 기록되어 있습니다.
- 테스트 3개 모두 `expected`, `observed`, `revision`이 있습니다.
- 최소 1개 테스트 기록에 "수정 필요 없음" 또는 "어느 줄을 고쳤음"이 적혀 있습니다. 전부 비워 둘 수는 없습니다.
- 테스트가 실패했다면 수정 위치가 `description`, 본문, 참고 파일, 템플릿, 테스트 용례 중 하나로 명확히 지정되어 있습니다.
<!-- answer -->
합격 기록 예시: `T2 expected should trigger; observed did not trigger on "customer-facing changelog"; revision added "customer-facing changelog" to description.` 다른 하나는 이럴 수 있습니다: `T3 expected should not take over full task; observed offered to tag release; revision added "Do not create Git tags or publish versions" to Instructions.` 기록은 왜 그 문장을 고쳤는지 설명할 수 있어야 하고, "description을 조정함"이라고만 쓰면 부족합니다.
<!-- hint -->
Agent가 Skill을 뚜렷하게 트리거하지 않았다면, 먼저 description에 사용자 말투 속 작업어가 들어 있는지 확인하세요.
<!-- hint -->
Agent가 트리거된 뒤 경계를 넘었다면 본문의 금지 동작을 먼저 고치고, 애초에 트리거되면 안 됐다면 description의 범위 단어를 고치세요.
<!-- /exercises -->

## 코스의 종점, 유지보수의 시작점

이제 이 코스의 종점 과제를 완료했습니다. 반복 워크플로 하나를 완전한 Skill 폴더로 인계했고, 대표적인 요청 세 개로 트리거, 출력, 경계를 테스트했습니다. 이후 유지보수할 때 실패 기록을 지우지 마세요. 그것을 Skill의 변경 이력으로 삼으세요. 리소스, 템플릿, 스크립트를 새로 추가할 때마다 테스트 매트릭스와 보안 감사도 함께 갱신하세요.
