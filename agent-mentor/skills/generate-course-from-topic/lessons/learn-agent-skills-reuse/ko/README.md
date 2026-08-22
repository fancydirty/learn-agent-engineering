---
domain: Agent Engineering
tags: [Agent Skills, workflow, beginner, Claude Code, Codex]
lang: ko
---
# Agent Skills: 워크플로 재사용 입문

이 코스는 Claude Code, Codex 또는 유사한 Agent를 이미 사용하고 있는 크리에이터와 독립 개발자가 일회성 프롬프트를 Agent가 발견하고, 필요할 때 로드하고, 다시 테스트할 수 있는 Skill로 정리하는 방법을 가르칩니다. 코스는 공개 Agent Skills 파일 스펙을 중심으로 진행되며, 모델 훈련, MCP 서버 구현, 플러그인 배포 플랫폼, 특정 비즈니스 도메인의 완전한 방법론은 다루지 않습니다.

**코스를 마치면 다음을 할 수 있습니다:**
- 일회성 프롬프트, Skill, 외부 도구의 책임 경계를 구분합니다.
- 스펙에 맞고 트리거되기 쉬운 `SKILL.md` 메타데이터를 작성합니다.
- `references/`, `assets/`, `scripts/`에 자료와 결정론적 작업을 계층별로 배치합니다.
- Skill의 트리거, 경계, 출력 품질 테스트를 설계하고 실패를 기록합니다.
- 자신의 워크플로에서 설치 가능하고 재테스트 가능한 Skill 폴더를 완성합니다.

**선수 조건:** coding agent 하나를 사용할 수 있고, 디렉터리를 만들고 Markdown 파일을 편집할 수 있으면 됩니다. Python, JavaScript 작성이나 API 호출 경험은 필요하지 않습니다.

**연습 환경:** 자신의 IDE, 터미널, Agent를 사용합니다. 코스는 내장 실행 환경을 제공하지 않으며, 개인 파일 업로드를 요구하지 않습니다.

## 코스 구성

| # | 주제 | 배우게 될 내용 |
|---|---|---|
| 01 | [일회성 프롬프트와 재사용 가능한 Skill](./01-prompt-to-skill.md) | 어떤 작업이 Skill로 만들 가치가 있는지, 그리고 Skill의 경계를 판단합니다. |
| 02 | [SKILL.md 메타데이터와 트리거 description](./02-skill-metadata.md) | 스펙에 맞는 name, description, 최소 지시 진입점을 작성합니다. |
| 03 | [점진적 공개와 리소스 계층화](./03-progressive-disclosure.md) | 긴 자료를 Agent가 필요할 때 읽는 계층으로 나눕니다. |
| 04 | [리소스, 스크립트와 실행 경계](./04-resources-and-boundaries.md) | 무엇을 모델에 맡기고 무엇을 결정론적 스크립트에 맡길지 결정합니다. |
| 05 | [트리거 테스트와 보안 감사](./05-testing-and-safety.md) | 대표 작업으로 잘못된 트리거, 누락된 트리거, 경계 위반 위험을 테스트합니다. |
| 06 | [워크플로에서 배포 가능한 Skill로](./06-ship-a-skill.md) | 실제 워크플로에서 빌드, 감사, 인계를 한 번 완료합니다. |

> 출처와 버전 경계는 [sources.md](./sources.md)를 참조하세요.
