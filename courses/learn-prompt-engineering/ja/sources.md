# 参考ソース

このコースの重要な事実と定義は、すべて以下の一次資料に基づいています。引用は英語の原文をそのまま掲載しています。

<!-- registry: A11 -->

## S1 — Anthropic Interactive Prompt Engineering Tutorial
URL: https://github.com/anthropics/prompt-eng-interactive-tutorial
- authority: official-docs
- supports: プロンプトエンジニアリングの基本概念とベストプラクティス — 基本的なプロンプト構造、few-shot 学習、chain-of-thought。
- key-fact: "Chain-of-thought (CoT) prompting enables complex reasoning capabilities through intermediate reasoning steps."

## S2 — OpenAI Prompt Engineering Best Practices
URL: https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api
- authority: official-docs
- supports: プロンプトエンジニアリングの6つの戦略 — 明確な指示を書く、参考テキストを提供する、複雑なタスクを分割する、モデルに考える時間を与える、外部ツールを使う、そして体系的にテストする。
- key-fact: "For best results, we generally recommend using the latest, most capable models. Newer models tend to be easier to prompt engineer."

## S3 — Anthropic Prompt Engineering Overview
URL: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
- authority: official-docs
- supports: Claude 固有のプロンプトテクニック — XML タグ、ロール設定、長いコンテキストの扱い方。
- key-fact: "An example-filled tutorial that covers the prompt engineering concepts found in the docs."

## S4 — Prompt Engineering Guide - Few-Shot Prompting
URL: https://www.promptingguide.ai/techniques/fewshot
- authority: authoritative-guide
- supports: few-shot プロンプティングの定義、使い方、ベストプラクティス。
- key-fact: "Following the findings from Min et al. (2022), here are a few more tips about demonstrations/exemplars when doing few-shot: the label space and the distribution of the input text specified by the demonstrations are both important."

## S5 — Prompt Engineering Guide - Chain-of-Thought
URL: https://www.promptingguide.ai/techniques/cot
- authority: authoritative-guide
- supports: chain-of-thought プロンプティングの原理、実装、ユースケース。
- key-fact: "Introduced in Wei et al. (2022), chain-of-thought (CoT) prompting enables complex reasoning capabilities through intermediate reasoning steps."

## S6 — IBM Prompt Engineering Guide 2026
URL: https://www.ibm.com/think/prompt-engineering
- authority: authoritative-guide
- supports: 2026年の最新トレンドと包括的なプロンプトエンジニアリングガイド。
- key-fact: "Prompt engineering is the new coding. In a world increasingly driven by machine learning, the ability to communicate with AI-generated systems by using natural language is essential."

## S7 — Prompt Engineering Best Practices 2026
URL: https://thomas-wiegold.com/blog/prompt-engineering-best-practices-2026/
- authority: blog
- supports: 2026年の最新プロンプトエンジニアリング実践とモデル間の違い。
- key-fact: "The discipline has split cleanly in two: casual prompting (which anyone can do — the models got better at reading intent) and production context engineering (which is a genuine engineering skill)."

## S8 — AI Prompt Debugging: Fixing Issues Through Iteration
URL: https://whitebeardstrategies.com/blog/ai-prompt-debugging-fixing-issues-through-iteration/
- authority: blog
- supports: プロンプトをデバッグし反復的に改善する体系的な方法。
- key-fact: "Debugging AI prompts isn't a one-time task; it's an iterative process where each cycle reveals new insights."

## S9 — 提示工程指南（中文）
URL: https://www.promptingguide.ai/zh
- authority: authoritative-guide
- supports: 中国語でのプロンプトエンジニアリング学習リソースとベストプラクティス。
- key-fact: "提示工程不仅仅是关于设计和研发提示词。它包含了与大语言模型交互和研发的各种技能和技术。"

## S10 — Chain of Thought Prompting Guide
URL: https://www.prompthub.us/blog/chain-of-thought-prompting-guide
- authority: authoritative-guide
- supports: chain-of-thought プロンプティングの詳細な実装と例。
- key-fact: "At its core, Chain of Thought prompting encourages the model to think through the problem in a step-by-step manner, which is supposed to mimic how humans break down complex problems."

## S11 — Few-Shot Prompting Guide
URL: https://www.prompthub.us/blog/the-few-shot-prompting-guide
- authority: authoritative-guide
- supports: few-shot プロンプティングの設計原則と実践的な応用。
- key-fact: "Few shot prompting is a prompt engineering technique where you insert examples in your prompt, training the model on what you want the output to look and sound like."

## S12 — Prompt Engineering for Code Generation
URL: https://graphite.com/guides/better-prompts-ai-code
- authority: blog
- supports: コード生成のシナリオにおけるプロンプトのベストプラクティス。
- key-fact: "By spelling out these details, you greatly reduce ambiguity. Microsoft's Developer Tools research group observed that prompts with explicit specifications reduced the need for back-and-forth refinements by 68%."

## S13 — Prompt - Wikipedia
URL: https://en.wikipedia.org/wiki/Prompt_engineering
- authority: encyclopedia
- supports: プロンプトとプロンプトエンジニアリングの標準的な定義。
- key-fact: "Prompt engineering is the process of structuring text that can be interpreted and understood by a generative AI model."

## S14 — Large Language Model - Wikipedia
URL: https://en.wikipedia.org/wiki/Large_language_model
- authority: encyclopedia
- supports: 大規模言語モデルの基本概念と仕組み。
- key-fact: "A large language model (LLM) is a type of language model notable for its ability to achieve general-purpose language understanding and generation."

## S15 — Zero-shot Learning - Wikipedia
URL: https://en.wikipedia.org/wiki/Zero-shot_learning
- authority: encyclopedia
- supports: zero-shot 学習の定義と応用。
- key-fact: "Zero-shot learning is a problem setup in machine learning where, at test time, a learner observes samples from classes which were not observed during training."
