# 第 6 课：进阶技巧：让 Skill 更强大

> 学习目标：
> - 理解 personal skills 和 project skills 的区别
> - 学会用 Git 管理 project skills
> - 掌握团队协作的最佳实践
> - 了解 Skills 生态系统
>
> 前置要求：[<< 第 5 课](./05-code-review-skill.md)

## Personal Skills vs Project Skills

到目前为止，我们创建的 Skills 都放在 `~/.claude/skills/`。这是 personal skills，只有你自己能用。[^S1]

但如果你在团队里工作，你可能希望：
- 团队成员都用同样的代码审查标准
- 新成员克隆代码后就能用团队的 Skills
- Skills 的改进能自动同步给所有人

这时候需要 **project skills**。[^S9]

### 两者的区别

| 特性 | Personal Skills | Project Skills |
|------|----------------|----------------|
| 位置 | `~/.claude/skills/` | `.claude/skills/` |
| 作用范围 | 你的所有项目 | 当前项目 |
| 版本控制 | 不需要 | 提交到 Git |
| 团队共享 | 不共享 | 所有成员共享 |
| 典型用途 | 个人习惯、通用工具 | 项目规范、团队流程 |

### 什么时候用哪个

**用 personal skills：**[^S9]
- 文档格式转换（Markdown → Word）
- 个人的任务整理方式
- 你自己的代码风格偏好
- 跨项目的通用工具

**用 project skills：**
- 团队的代码审查标准
- 项目的 commit 消息格式
- 特定框架的脚手架生成
- 项目的部署流程

## 创建 Project Skills

### 第 1 步：在项目目录创建

进入你的项目目录：

```bash
cd ~/projects/my-app

# 创建 project skills 目录
mkdir -p .claude/skills/commit-format

# 创建 SKILL.md
cat > .claude/skills/commit-format/SKILL.md << 'EOF'
---
name: commit-format
description: 将简短的 commit 消息改写为符合团队规范的格式，包含类型、范围和详细描述
---

# Commit 消息格式化

将简短的 commit 改写为团队约定的格式。

## 团队规范

Commit 消息格式：
```
<type>(<scope>): <subject>

<body>
```

**Type 类型：**
- feat: 新功能
- fix: 修复 bug
- docs: 文档更新
- style: 代码格式（不影响功能）
- refactor: 重构
- test: 测试相关
- chore: 构建或工具变动

**Scope 范围：**
- api: API 层
- ui: 界面
- db: 数据库
- auth: 认证授权
- core: 核心逻辑

## 处理步骤

1. 分析原始 commit 内容，判断类型和范围
2. 补充必要的上下文（为什么改、影响什么）
3. 按格式输出

## 输出格式

```
<type>(<scope>): <subject>

<body>
- 详细说明改动的原因
- 影响的功能或模块
- 相关的 issue 或 PR（如果有）
```

## 示例

**输入：** "修了那个登录的 bug"

**输出：**
```
fix(auth): 修复登录页面密码验证失败的问题

- 问题：密码包含特殊字符时验证失败
- 原因：正则表达式未转义特殊字符
- 影响：使用特殊字符密码的用户无法登录
- 相关 issue: #123
```
EOF
```

### 第 2 步：提交到 Git

```bash
git add .claude/skills/commit-format/
git commit -m "feat(tooling): 添加 commit 消息格式化 Skill"
git push
```

### 第 3 步：团队成员获取

团队其他成员：

```bash
git pull
```

Skills 自动生效。不需要任何额外配置。[^S1]

## 用 Git 管理 Skills

既然 project skills 在 Git 里，就可以用 Git 的所有能力：[^S8]

### 版本控制

```bash
# 查看 Skill 的修改历史
git log -- .claude/skills/commit-format/

# 回滚到之前的版本
git checkout abc123 -- .claude/skills/commit-format/

# 对比两个版本
git diff main..feature-branch -- .claude/skills/
```

### Code Review Skills 本身

**是的，Skills 也需要审查。**[^S10]

当团队成员提交一个新 Skill 或修改现有 Skill：

1. 检查 description 是否清晰
2. 检查 instructions 是否足够具体
3. 测试是否真的按预期工作
4. 评估是否值得加到项目里（会不会和现有 Skills 冲突）

**在 PR 里审查 Skill 文件：**

```markdown
## 审查清单

- [ ] description 包含了做什么、什么时候用
- [ ] instructions 步骤具体可执行
- [ ] 给了输入输出示例
- [ ] 测试了至少 3 个用例
- [ ] 不与现有 Skills 重复或冲突
```

### 分支管理

**实验性 Skill 在 feature 分支：**

```bash
# 创建实验分支
git checkout -b experiment/ai-refactor-skill

# 添加实验性 Skill
mkdir -p .claude/skills/ai-refactor
# ... 编写 SKILL.md

# 提交
git add .claude/skills/ai-refactor/
git commit -m "experiment: 添加 AI 辅助重构 Skill"

# 用一周，如果有用就合并到 main
git checkout main
git merge experiment/ai-refactor-skill
```

## 团队协作最佳实践

### 1. README 文档化

在项目根目录的 README 或 `.claude/README.md` 里列出所有 Skills：[^S10]

```markdown
## 可用的 Claude Skills

### commit-format
将简短的 commit 改写为团队规范格式。

**用法：** `/commit-format [原始 commit 消息]`

**示例：**
```
/commit-format 修了登录 bug
```

### code-review
按团队标准审查代码变更。

**用法：** `/code-review` 然后粘贴代码或 diff

**注意：** 审查结果仅供参考，重要改动仍需人工复审
```

### 2. 统一命名约定

团队内部统一 Skill 的命名风格：[^S8]

**推荐：**
- 用连字符：`commit-format`, `api-doc-gen`
- 动词-名词或名词-动词：`format-commit`, `review-code`
- 简短清晰：2-3 个词

**避免：**
- 数字后缀：`skill-1`, `helper-v2`
- 太泛化：`tool`, `helper`, `utility`
- 项目缩写加数字：`proj-skill-3`

### 3. 定期清理

每个季度审查一次：[^S8]

```bash
# 列出所有 project skills
ls .claude/skills/

# 对每个 Skill 问：
# - 过去 3 个月用过几次？
# - 是否还符合当前团队规范？
# - 是否被其他 Skill 替代了？
```

**用得少的 Skill，要么改进，要么删除。** 太多不用的 Skill 会让 Claude 更难找到真正需要的那个。

### 4. 变更通知

**重要：** 修改现有 Skill 时，在团队频道通知：

```
📢 Skill 更新：code-review

改动：
- 新增了对 React Hooks 规则的检查
- 调整了函数长度阈值（50 行 → 40 行）

影响：
- 之前通过的代码可能现在会被标记问题
- 建议重新审查最近的 PR

如有疑问请联系 @张三
```

## Skills 的组合使用

**多个 Skills 可以串联：**[^S1]

```
/commit-format 修了登录 bug

（Claude 输出格式化的 commit）

/code-review

（粘贴刚才改动的代码）
```

**或者在一个 Skill 里引用另一个：**

```markdown
## 步骤

1. 用 commit-format Skill 格式化 commit 消息
2. 用 code-review Skill 检查代码变更
3. 汇总两者结果，生成 PR 描述
```

**这就是 Skills 的强大之处：小的、单一职责的 Skills 可以组合成更复杂的工作流。**[^S3]

## 超越基础：探索更多可能

你现在已经掌握了 Skills 的核心技能。接下来可以探索：

### 可选的 frontmatter 字段

本课程只讲了 `name` 和 `description`，还有更多字段：[^S5]

- **`model`**：指定这个 Skill 用哪个模型（如果需要更强的推理能力）
- **`allowed-tools`**：限制这个 Skill 只能用特定工具
- **`disable-model-invocation`**：禁止 Claude 自动加载，只能手动调用

**什么时候用这些字段：**
- 代价高的操作（调用外部 API）→ 用 `disable-model-invocation`，避免误触发
- 需要精确推理的任务 → 用 `model: claude-opus-4`
- 安全敏感的 Skill → 用 `allowed-tools` 限制能做什么

**在官方文档查看完整字段列表：** https://code.claude.com/docs/en/skills[^S1]

### Skills 与 MCP 服务器的结合

**MCP (Model Context Protocol) 服务器提供工具，Skills 提供工作流知识。**[^S7]

示例：

- MCP 服务器提供 `read_database` 工具
- Skill 教 Claude 如何用这个工具执行"生成月度报告"的工作流

两者配合，Skills 变成了连接 Claude 和外部系统的桥梁。[^S7]

### 社区 Skills

探索其他人创建的 Skills：
- GitHub 搜索 "claude skills"
- https://github.com/travisvn/awesome-claude-skills[^S1]

**使用社区 Skill 的注意事项：**
- 先读完 SKILL.md，理解它做什么
- 在测试项目里试用，不要直接用在生产代码上
- 检查是否有安全风险（执行脚本、访问网络、修改文件）

<!-- exercises -->
## 💻 练习

### Level 1：创建你的第一个 Project Skill

选择你当前的项目，创建一个 project skill：

1. 在项目目录创建 `.claude/skills/[skill-name]/`
2. 编写一个与项目相关的 Skill（commit 格式、部署流程、测试生成等）
3. 提交到 Git
4. 在项目 README 里文档化这个 Skill

<!-- rubric -->
- Skill 目录在项目的 `.claude/skills/` 下
- SKILL.md 完整（frontmatter + instructions）
- 已提交到 Git
- README 里有这个 Skill 的使用说明

<!-- answer -->
示例（部署检查 Skill）：

**创建：**
```bash
cd ~/projects/my-web-app
mkdir -p .claude/skills/deploy-check
cat > .claude/skills/deploy-check/SKILL.md << 'EOF'
---
name: deploy-check
description: 部署前检查清单，验证环境变量、依赖版本、测试覆盖率和配置文件
---

# 部署前检查

## 检查项

### 1. 环境变量
- 所有必需的环境变量是否设置（DATABASE_URL, API_KEY 等）
- 是否有敏感信息硬编码在代码里

### 2. 依赖
- package.json 的版本是否锁定（不用 `^` 或 `~`）
- 是否有已知漏洞（运行 `npm audit`）

### 3. 测试
- 单元测试覆盖率 > 80%
- 关键路径的集成测试是否通过

### 4. 配置
- 生产环境配置是否正确
- 日志级别是否设为 INFO 或 ERROR（不是 DEBUG）

## 输出格式

### ✅ 已通过
- [检查项]

### ❌ 未通过（阻止部署）
- [检查项] - [问题] - [如何修复]

### ⚠️ 警告（建议修复但不阻止）
- [检查项] - [问题]
EOF

git add .claude/skills/deploy-check/
git commit -m "feat(tooling): 添加部署前检查 Skill"
```

**文档化（在项目 README）：**
```markdown
## 部署前检查

运行 `/deploy-check` 执行部署前的完整检查清单。

**检查内容：**
- 环境变量配置
- 依赖安全性
- 测试覆盖率
- 生产配置

只有所有检查通过后才应该部署到生产环境。
```

<!-- hint -->
想不出项目 Skill？从团队最常问的问题开始："这个怎么部署？""commit 消息格式是什么？""测试怎么写？"

<!-- hint -->
第一个项目 Skill 不需要复杂，一个"团队规范快速参考"就很有用

### Level 2：审查一个 Skill PR

假设团队成员提交了一个新 Skill 的 PR，写一份审查意见：

**模拟 PR 内容：**
```markdown
---
name: helper
description: 帮助处理数据
---

# Helper

处理数据的工具。

## 步骤

1. 读取数据
2. 处理
3. 输出结果
```

**写审查意见，指出至少 3 个问题。**

<!-- rubric -->
- 指出了 name 的问题
- 指出了 description 的问题
- 指出了 instructions 的问题
- 给出了具体的改进建议

<!-- answer -->
示例审查意见：

**问题 1：name 太泛化**

`helper` 不说明这个 Skill 是干什么的。建议改成描述性的名字，比如：
- 如果是清洗用户输入数据：`sanitize-user-input`
- 如果是转换数据格式：`transform-data-format`

**问题 2：description 完全不可用**

"帮助处理数据"太泛化了，Claude 不知道什么时候用这个 Skill。

需要说明：
- 处理什么数据（用户输入？CSV 文件？API 响应？）
- 怎么处理（验证？转换？清洗？）
- 什么时候用（导入数据时？表单提交时？）

**问题 3：instructions 完全没有细节**

"读取数据""处理""输出结果"完全不可执行。需要补充：
- 输入格式是什么
- "处理"的具体步骤（验证什么、转换什么、过滤什么）
- 输出格式是什么
- 至少一个输入输出示例

**建议：拒绝合并，要求作者补充以上信息后重新提交。**

<!-- hint -->
好的 Skill PR 应该包含：完整的 SKILL.md、至少 2 个测试用例的结果、使用场景说明

<!-- /exercises -->

## 小结

- **Personal skills (`~/.claude/skills/`) 用于个人习惯**，project skills (`.claude/skills/`) 用于团队协作[^S9]
- **Project skills 提交到 Git**，团队成员自动获取，用 Git 管理版本和分支
- **团队协作最佳实践**：文档化、统一命名、定期清理、变更通知
- **Skills 可以组合**：小的单一职责 Skill 组合成复杂工作流[^S3]
- **进阶方向**：可选 frontmatter 字段、MCP 服务器集成、社区 Skills

## 恭喜你完成课程！

你现在已经掌握了：
- ✅ Skills 的工作原理和应用场景
- ✅ SKILL.md 的结构和编写方法
- ✅ 测试和调试的系统化流程
- ✅ 复杂 Skills 的组织方式
- ✅ 团队协作的最佳实践

**下一步：**

1. **马上创建一个 Skill**：选择你这周重复解释过 3 次的任务，写成 Skill
2. **实际使用一周**：记录调用次数、发现的问题、节省的时间
3. **迭代改进**：根据实际使用反馈，补充遗漏的检查、调整输出格式
4. **分享给团队**：如果确实有用，把它变成 project skill

**记住：** 好的 Skill 不是一次写成的，是用出来的。[^S8][^S10]

祝你用 Skills 打造高效的 AI 工作流！
