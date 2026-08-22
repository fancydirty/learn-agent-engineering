# Agent Mentor Open Courses

`learn.agentmentor.dev` 的独立开源课程站。它复用 Agent Mentor 原有的课程阅读器与 `generate-course-from-topic` 产课 skill，但与付费产品、账户和控制台完全分离。

## 边界

保留：

- 课程库、课程目录、逐讲阅读、词汇表与来源页。
- Markdown、代码高亮、Mermaid 与本地确定性交互。
- 整讲复制给 Agent、练习复制给 Agent、选区复制给 Agent。
- 指向 `agentmentor.dev` 的克制入口。

不包含：

- 登录、账户、余额、充值、支付、控制台或买家发布流程。
- 站内 Ask AI、Review、学习进度、笔记或长期记忆。
- 博客、播客、音频或内容画廊。
- 托管模型调用或任何服务端课程回答 API。

## 内容原则

所有课程必须直接服务于 Agent 使用或 Agent 工程，并用当前一手来源证明选题仍然有效。课程由仓库中的原产课 skill 生成：

```text
agent-mentor/skills/generate-course-from-topic/
├── SKILL.md
├── agent-learning-sources.md
├── course-authoring-guide.md
├── docs/
├── templates/
└── lessons/
```

第一门课程位于（family → locale 变体结构）：

```text
agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-skills-reuse/zh
```

公开路由去掉 `learn-` 前缀并以语言开头，因此课程地址是 `/zh/agent-skills-reuse`。

## 本地运行

要求 Node.js 20.19 或更高版本。

```bash
npm install
npm run dev
npm test
npm run build
```

课程质量检查：

```bash
node scripts/course-guard.mjs \
  "$PWD/agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-skills-reuse/zh"

node scripts/course-interaction-report.mjs \
  "$PWD/agent-mentor/skills/generate-course-from-topic/lessons/learn-agent-skills-reuse/zh"
```

## Cloudflare Workers

站点通过 OpenNext 生成 Cloudflare Worker：

```bash
npm run cf:build
npm run cf:preview
```

生产域名计划为 `learn.agentmentor.dev`。部署配置不读取 Agent Mentor 主站的运行时、支付或账户环境变量。

## 技术栈

Next.js 16、React 19、Tailwind CSS 4、Streamdown、Shiki、Mermaid、Vitest、OpenNext for Cloudflare。
