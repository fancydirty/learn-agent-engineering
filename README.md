# Agent Mentor Open Courses

`learn.agentmentor.dev` 的独立开源课程站：一组只讲 Agent 的免费课程，配一个静态阅读器。

课程内容与阅读器在本仓库开源。生成这些课程所用的产课方法论属于 [Agent Mentor](https://agentmentor.dev) 付费产品，不在本仓库内。

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
- 产课方法论、写作指南、模板与质量评分细则。

## 内容原则

所有课程必须直接服务于 Agent 使用或 Agent 工程，并用当前一手来源证明选题仍然有效。事实性断言不依赖模型记忆，必须来自写作当次抓取的一手源；易变事实标注版本边界。

## 课程结构

课程按「family → locale 变体」组织，公开路由以语言开头：

```text
courses/
  learn-<slug>/
    logo.svg            # 该课程各语言共享
    en/                 # 每个 locale 一个完整课程
      README.md
      01-*.md … 06-*.md
      glossary.json
      sources.md
      agentmentor.json
    zh/  ja/  ko/  es/  pt-BR/
```

`courses/learn-agent-skills-reuse/zh` 对应公开地址 `/zh/agent-skills-reuse`。

首发六种语言：`en`、`zh`、`ja`、`ko`、`es`、`pt-BR`。

## 本地运行

要求 Node.js 20.19 或更高版本。

```bash
npm install
npm run dev
npm test
npm run build
```

## 课程质量检查

三道闸门，任何课程改动后都应通过：

```bash
# 单个语言变体：结构、引用可达性、术语表、互动块、清单
node scripts/course-guard.mjs courses/learn-agent-skills-reuse/zh

# 互动块分布与文案质量（非阻断）
node scripts/course-interaction-report.mjs courses/learn-agent-skills-reuse/zh

# 跨语言一致性：课节 slug、互动块 id、未被误翻的英文实物
node scripts/course-family-guard.mjs courses/learn-agent-skills-reuse
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
