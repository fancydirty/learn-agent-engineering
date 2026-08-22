# Sources

<!-- registry: A8 -->

## S1 — Anthropic: Equipping agents for the real world with Agent Skills
URL: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- authority: official-docs
- supports: Skill이 SKILL.md, 지시문, 스크립트, 리소스를 포함하는 디렉터리라는 점과 점진적 공개, 평가, 보안 감사 원칙을 뒷받침합니다.
- key-fact: “A skill is a directory containing a SKILL.md file that contains organized folders of instructions, scripts, and resources.”

## S2 — Agent Skills: Specification
URL: https://agentskills.io/specification
- authority: official-docs
- supports: frontmatter 필드, 명명 제한, description의 트리거 정보, 선택적 디렉터리의 형식 제약을 뒷받침합니다.
- key-fact: “The SKILL.md file must contain YAML frontmatter followed by Markdown content.”

## S3 — Anthropic: Agent Skills overview
URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- authority: official-docs
- supports: Claude 제품에서 Skill이 로드되는 방식, 점진적 공개, 보안 경계를 뒷받침합니다.
- key-fact: “Skills use progressive disclosure to manage context efficiently.”

## S4 — OpenAI: Build skills
URL: https://learn.chatgpt.com/docs/build-skills
- authority: official-docs
- supports: Agent Skills가 ChatGPT, Codex, 공개 표준에서 재사용 가능한 워크플로 형식이라는 점과 암시적/명시적 트리거, 저장소 발견 범위를 뒷받침합니다.
- key-fact: “Use agent skills to extend ChatGPT and Codex with task-specific capabilities.”

## S5 — Anthropic: Building effective agents
URL: https://www.anthropic.com/engineering/building-effective-agents
- authority: official-docs
- supports: 가장 단순하고 조합 가능한 방안에서 시작하라는 점과 워크플로와 자율적 결정이 필요한 Agent를 구분하는 관점을 뒷받침합니다.
- key-fact: “We recommend finding the simplest solution possible, and only increasing complexity when needed.”

## S6 — Agent Skills: skills-ref reference library
URL: https://github.com/agentskills/agentskills/tree/main/skills-ref
- authority: official-docs
- supports: `skills-ref validate path/to/skill`의 실제 설치 전제와 명령 형식을 뒷받침합니다. 같은 저장소가 이 라이브러리는 데모 용도일 뿐 프로덕션 보증으로 취급해서는 안 된다고 밝힙니다.
- key-fact: “skills-ref validate path/to/skill”

## S7 — Anthropic: Agent Skills best practices
URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- authority: official-docs
- supports: frontmatter 필드 제한, 점진적 공개, 대표적 테스트, 파일 계층화, 스크립트 경계를 교차로 뒷받침합니다.
- key-fact: “At startup, only the metadata (name and description) from all Skills is pre-loaded.”
