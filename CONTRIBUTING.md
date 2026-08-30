# Contributing to Learn Agent Engineering

Thank you for your interest in improving this curriculum. Contributions are welcome in several forms.

## What We Accept

### Content Fixes
- Typos, grammar, and clarity improvements
- Technical corrections in lessons or exercises
- Broken links or outdated references
- Code examples that don't run as documented

### Translations
We maintain six languages: English, Chinese (Simplified), Japanese, Korean, Spanish (Latin American), and Brazilian Portuguese. Translation contributions should:
- Match the source lesson's structure exactly (headings, exercises, check-blocks)
- Use natural, conversational language for the target locale
- Preserve all technical terms, code blocks, and citations unchanged
- Include glossary entries for domain-specific vocabulary

Before starting a full course translation, open an issue to coordinate with maintainers.

### Course Proposals
Have an idea for a new lesson or course? Open an issue describing:
- The learning goal
- Where it fits in the existing progression
- What existing courses it builds on
- Example exercises or capstone projects

We prioritize proposals that extend the current path (courses 13+) or fill gaps between existing courses.

## What We Don't Accept

- AI-generated content submitted without human review and verification
- Promotional content or links to paid services
- Wholesale rewrites that change the course's pedagogical approach
- Off-topic courses unrelated to AI agents or Claude Code

## How to Contribute

1. **Fork the repository** and create a feature branch from `main`
2. **Make your changes** following the structure of existing lessons
3. **Run the guard**: `node scripts/course-guard.mjs courses/<course-slug>/<locale>` to verify structural integrity
4. **Commit with a clear message**: `fix(content): correct L03 code block in ja observability`
5. **Open a Pull Request** describing what you changed and why

### First-Time Contributors
Look for issues tagged [`good first issue`](../../labels/good%20first%20issue) — these are small, well-scoped tasks ideal for getting familiar with the codebase.

## Style Guidelines

- **Lessons**: Conversational tone, second-person ("you build," not "we build"), active voice
- **Code**: Match the surrounding course's style (comments, naming, idiom)
- **Commit messages**: Start with `fix(content):`, `feat(i18n):`, or `chore:` followed by a short summary

## Questions?

Open a [discussion](../../discussions) or tag maintainers in an issue. We aim to respond within 48 hours.

---

By contributing, you agree that your work will be licensed under the project's MIT License.
