# 참고 자료

이 코스의 핵심 사실과 정의는 모두 다음 자료에 근거합니다. 인용문은 영어 원문 그대로 싣습니다.

## S1 — Claude Code 공식 문서: Extend Claude Code with skills

URL: https://code.claude.com/docs/en/skills

- authority: official-docs

이 코스의 핵심 개념 출처입니다. Skill이 어떻게 동작하는지, SKILL.md 파일의 두 부분 구조(YAML frontmatter + Markdown 본문), Skill이 어떻게 트리거되고 호출되는지, 그리고 Skill과 custom commands의 관계를 설명합니다.

핵심 인용:
> "Every skill needs a SKILL.md file with two parts: YAML frontmatter between --- markers that tells Claude when to use the skill, and markdown content with the instructions Claude follows when the skill runs."

## S2 — Anthropic 플랫폼 문서: Agent Skills overview

URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

- authority: official-docs

Skill의 3단계 로딩 메커니즘(발견을 위한 frontmatter, 실행을 위한 instructions, 필요할 때 읽어 들이는 supporting files), 여러 surface에서 Skill을 사용하는 방법, 그리고 progressive disclosure 설계 원칙을 자세히 다룹니다.

핵심 인용:
> "Claude operates in a virtual machine with filesystem access, allowing Skills to exist as directories containing instructions, executable code, and reference materials, organized like an onboarding guide you'd create for a new team member."

## S3 — Anthropic 엔지니어링 블로그: Equipping agents for the real world with Agent Skills

URL: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

- authority: official-docs

Skill의 설계 철학을 엔지니어링 관점에서 설명합니다. 전문성을 조합 가능한 리소스로 패키징하는 것, 새 팀원을 위한 온보딩 가이드를 만들듯 Skill을 조립하는 것, 그리고 Skill을 통해 범용 에이전트를 전문 에이전트로 바꾸는 것입니다.

핵심 인용:
> "Building a skill for an agent is like putting together an onboarding guide for a new hire. Instead of building fragmented, custom-designed agents for each use case, anyone can now specialize their agents with composable capabilities."

## S4 — Anthropic 헬프 센터: How to create custom skills

URL: https://support.claude.com/en/articles/12512198-how-to-create-custom-skills

- authority: official-docs

Skill에 필요한 최소 구조(SKILL.md를 담은 디렉터리), 필수 YAML frontmatter 필드(name과 description), 그리고 몇 줄짜리 지시부터 여러 파일과 실행 가능한 코드를 포함한 복잡한 패키지까지의 범위를 다룹니다.

핵심 인용:
> "Every skill consists of a directory containing at minimum a skill.md file, which is the core of the skill. This file must start with a YAML frontmatter to hold name and description fields, which are required metadata."

## S5 — Claude Skills 심층 분석(제1원리 관점)

URL: https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/

- authority: authoritative-guide

SKILL.md의 구조를 제1원리에서 분석합니다. frontmatter가 HOW(권한, 모델, 메타데이터)를 어떻게 설정하는지, 본문이 실행할 내용 WHAT을 어떻게 정의하는지, 그리고 progressive disclosure가 Skill에 어떻게 적용되는지 다룹니다.

핵심 인용:
> "The frontmatter configures HOW the skill runs (permissions, model, metadata), while the markdown content tells Claude WHAT to do."

## S6 — Building skills for Claude 실습: YAML frontmatter와 테스트

URL: https://sjramblings.io/building-skills-for-claude-part-2/

- authority: authoritative-guide

frontmatter의 description 필드를 쓰는 공식(What it does + When to use it + Key capabilities), 좋은 예와 나쁜 예의 대비, 그리고 테스트 루프의 모범 사례를 제시합니다.

핵심 인용:
> "The description is the single most important field in your frontmatter. A bad description means your skill either never triggers or triggers on everything. The formula: What it does + When to use it + Key capabilities."

## S7 — The complete guide to building skills for Claude(PDF)

URL: https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf

- authority: official-docs

Anthropic 공식 전체 가이드입니다. Claude.ai, Claude Code, API 전반에서 일관된 Skill 사용법, 자동화할 가치가 있는 워크플로를 식별하는 방법, 그리고 Skill이 MCP 서버와 함께 동작하는 방식을 다룹니다.

핵심 인용:
> "Skills work identically across Claude.ai, Claude Code, and API. Create a skill once and it works across all surfaces without modification."

## S8 — Claude Code skills: .NET 워크플로와 재사용 가능한 프롬프트

URL: https://codewithmukesh.com/blog/skills-claude-code/

- authority: authoritative-guide

Skills, Rules(CLAUDE.md), Hooks의 차이, project-level skills의 버전 관리 실무, subagent 위임 패턴, 그리고 프로덕션 수준 Skill 패턴 다섯 가지의 구현을 설명합니다.

핵심 인용:
> "Skills vs Rules vs Hooks: Skills for what to do (workflows), Rules for how things are (conventions), Hooks for what happens automatically (triggers)."

## S9 — Teach Claude Code your workflow: 커스텀 Skills 실습 가이드

URL: https://medium.com/@n913239/teach-claude-code-your-workflow-a-hands-on-guide-to-custom-skills-8bc35d4a11ed

- authority: blog

실무자의 관점에서 personal skills와 project skills의 차이, bundled skills가 유용한 상황, 그리고 후처리 스크립트로 Skill 출력 품질을 높인 사례(Word 표 테두리를 다루는 pandoc + python-docx)를 공유합니다.

핵심 인용:
> "Personal Skills are for your own habits — things like code cleanup or file conversion that you use across every project. Project Skills are for project-specific workflows."

## S10 — 자기 문서화 runbook으로서의 Claude skills

URL: https://zackproser.com/blog/claude-skills-internal-training

- authority: blog

팀 협업 관점에서 Skill의 고유한 가치를 설명합니다. SKILL.md는 사람이 읽는 문서인 동시에 AI가 실행할 수 있는 명세이며, 전통적인 runbook과 그것을 구현한 코드 사이에서 생기는 드리프트를 없앱니다.

핵심 인용:
> "The SKILL.md file that Claude reads to understand the workflow? You can read it too. It's plain English instructions alongside the actual implementation code. The documentation is the executable specification - they can't drift apart because they're the same thing."