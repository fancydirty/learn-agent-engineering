# 第 4 课：工具接口设计：名字、描述、参数、返回值

> 学习目标：
> - 判断一份工具 description 能不能让模型选对工具、填对参数
> - 用 JSON Schema 的 enum、required 把参数误用的空间收窄，知道用 strict 模式把约束变成硬保证
> - 设计出模型能据此自我纠正的返回值和错误信息
>
> 前置要求：读完第 3 课，知道读 / 写 / 执行 / 搜索 / 调用五类工具的区别 | 上一课 [第 3 课 <<](./03-tool-types.md) | 下一课 [第 5 课 >>](./05-permissions-and-safety.md)

## 同一个工具，两份 description，两种下场

工具箱里有一个代码搜索工具，第一版是这样注册的：

```json
{
  "name": "search_files",
  "description": "搜索文件",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"]
  }
}
```

用户说："utils.ts 这个文件放在项目哪个目录下？"

模型看到的信息只有 name 和 description 两行字。它没法知道 `search_files` 是按文件名找文件，还是在文件内容里找字符串——description 没说。模型选了这个工具，把 `utils.ts` 当作 query 传进去：

```json
{ "id": "call_1", "name": "search_files", "input": { "query": "utils.ts" } }
```

如果这个工具背后其实是全文搜索（在每个文件的内容里找 `utils.ts` 这个字符串），而没有哪个文件的内容里真的写着这几个字，结果就是空。模型拿到空结果，不知道是"文件不存在"还是"我搜索方式错了"，只能猜——常见的猜法是换几个近义词再搜一遍，继续拿到空结果。

现在把 description 换成这样：

```json
{
  "name": "code_search_grep",
  "description": "按正则表达式在项目源码的文件内容里搜索匹配的行，返回文件路径和行号。适用于「某个变量/函数/字符串出现在代码的哪些地方」。如果你要按文件名（而不是文件内容）查找文件，改用 code_search_glob 工具。",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": { "type": "string", "description": "要匹配的正则表达式" },
      "path": { "type": "string", "description": "搜索起始目录，默认项目根目录" }
    },
    "required": ["pattern"]
  }
}
```

同一个问题，这次模型读到"文件名查找请改用 code_search_glob"，直接换用了工具箱里同时注册的 code_search_glob，传对了参数：

```json
{ "id": "call_1", "name": "code_search_glob", "input": { "pattern": "**/utils.ts" } }
```

两次调用之间没有换模型、没有换 prompt，也没有改任何实现代码——变的只是工具定义里模型能读到的那几行字：更准确的 name、说清边界并点名替代工具的 description、带说明的参数。这就是这一课要讲的东西：工具接口的每个字段，都是模型做决策时唯一能看到的依据。

## description 是模型选工具时唯一能看到的东西

写代码的人习惯把工具当 API 来写注释：函数名起得达意，实现逻辑写在函数体里，谁要用就去翻源码。这套习惯搬到工具定义上会出问题——**模型不会去读实现代码**。它能看到的只有 name、description、input_schema 这几个字段[^S3]，选哪个工具、传什么参数，全靠这几行字。

官方对 description 的要求很直接：详细说明这个工具是做什么的、什么时候该用、行为是什么样[^S3]。这三件事缺一个，模型就得靠猜：缺"做什么"，模型可能干脆不用它，绕远路硬凑；缺"什么时候用"，工具箱里有几个相近工具时（比如同时有 grep 和 glob）模型分不清边界，选错概率随工具数量上升；缺"行为是什么样"，模型不知道调用后会拿到什么形状的结果，写不出能正确解析这个结果的后续逻辑。

好的 description 要消除输入输出上的歧义，而不是追求辞藻[^S8]。上一节 `code_search_grep` 的 description 有效，是因为它做了两件事：说清楚了"搜内容而不是搜文件名"，又指名了"文件名查找请用 code_search_glob"。这两句话让模型在相似工具之间做选择时不需要试错。

```agentmentor-check
{
  "id": "tool-zh-04-description-audience",
  "label": "description 是写给谁看的",
  "prompt": "同事觉得 description 写太细没必要，理由是「反正这段话最后是让维护代码的人看懂逻辑，模型顺带也能读到，没必要抠字眼」。你会怎么回应？",
  "whyHere": "开场例子已经展示了两份 description 导致模型选错/选对工具，这里检查学习者是否理解 description 字段的读者是谁、在决策链路里起什么作用，而不是把它当成普通代码注释",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "description 主要是给以后维护这段代码的同事看的注释，模型顺带也能读到",
      "correct": false,
      "feedback": "反了。模型选工具、填参数时唯一能看到的就是 name、description、input_schema 这几个字段——它看不到实现代码，更看不到代码里的注释。description 不是「顺带」被模型读到的旁白，它是模型决策时的全部依据。给同事看的说明该写在代码注释或文档里，和这个字段是两回事。"
    },
    {
      "id": "b",
      "text": "description 是模型决定「要不要调用这个工具、传什么参数」时读的唯一说明，模型看不到实现代码",
      "correct": true,
      "feedback": "对。这也是为什么开场那个例子里，同一个工具换一份 description 就能让模型从选错工具变成选对工具——没有换模型，也没有换实现，变的只是模型能读到的这段文字。"
    },
    {
      "id": "c",
      "text": "description 主要是用来省 token 的，越短越好，具体怎么用让模型自己在系统提示里猜",
      "correct": false,
      "feedback": "方向反了。含糊的 description 不会省 token，它会让模型在多个相似工具之间反复试错、拿到空结果后再重试，这些失败往返比多写几句清楚的说明费的 token 多得多。工具数量多到一定程度确实要考虑 token 成本，但那要靠精简工具数量和粒度解决，不是把每个工具的说明写得含糊。"
    }
  ]
}
```

## 名字也要说清楚归属：命名空间

description 负责说清楚"这个工具做什么"，name 负责另一件事：在一堆工具里，让名字本身就不容易和别的工具混淆。工具一多，尤其是接入多个外部服务之后，`list_prs`、`send_message`、`create_issue` 这种名字谁都能起，光看名字分不出属于哪个服务。

官方的建议是给工具名加上服务前缀，比如 `github_list_prs`、`slack_send_message`[^S10]。当模型要在几十个工具里挑一个时，带前缀的名字相当于先把范围收窄一层，不用打开 description 逐条对比就能排除掉大半选项。第 3 课的五类工具（读、写、执行、搜索、调用）如果分别接了不同后端，同样适用：`fs_read_file` 和 `db_read_row` 一看就不是一回事，光叫 `read` 就分不清。

## input_schema：把参数的形状钉死

description 决定模型会不会选这个工具，input_schema 决定模型能不能把参数填对[^S3]。这里有个容易忽略的地方：JSON Schema 里不是所有字段都在"约束"参数，有的字段只是在"说明"参数。

给某个参数加一句 description，只是表达意图，不会拒绝任何不符合这句话的输入[^S14]：

```json
{
  "file_type": {
    "type": "string",
    "description": "限定搜索的文件类型，比如 typescript"
  }
}
```

模型完全可能传 `"typescript"`，也可能传 `"ts"`，也可能传 `"TypeScript 文件"`——这句 description 只是建议，没人拦着它乱填。真正能拦住乱填的是 enum：

```json
{
  "file_type": {
    "type": "string",
    "enum": ["js", "ts", "py", "all"],
    "description": "限定搜索的文件类型"
  }
}
```

加上 enum 之后，合法取值被显式列出来，模型几乎总会照着填，乱填的概率大幅下降。但注意：这是对模型的强引导，不是平台的硬保证——默认模式下 API 并不替你校验参数是否符合 schema，模型偶尔仍会产出类型不符或漏掉必填字段的输入[^S20]，工具实现那一侧对非法值的检查还是要保留。required 同理：一个"写文件"工具如果 `path` 不是必填，模型偶尔会漏填，工具实现要么报错要么猜一个默认路径，两种结果都不理想；把 `path` 标成 required，能让这类误用的概率降到很低，而"必填"二字被平台真正强制执行，要靠下一节的 strict 模式。

**记住这个区别**：type、enum、required 是校验语义上的真约束，title、description 只是给模型看的说明，写得再细也不构成校验规则[^S14]。设计 input_schema 时先问：这个参数上"不该出现的输入"能不能用 enum 或 required 直接堵死，而不是只在 description 里写"请传 xxx"。至于这些约束怎么从"写在 schema 里"升级成"平台强制执行"，下一节讲。

## 把软约束变成硬保证：additionalProperties: false 和 strict 模式

上一节反复强调"约束"和"说明"的区别，但还有一层要分清：schema 里写了约束，和模型产出的参数一定通过校验，仍是两回事。默认模式下，API 不会替你拦截不符合 schema 的调用——模型偶尔会把数字写成字符串 `"2"`，或者干脆漏掉一个必填字段[^S20]。

还有一个更隐蔽的方向：模型可能凭空多给字段。假设一个建工单工具的 schema 只声明了 `title`、`priority` 两个参数，模型某次调用却传来了：

```json
{ "title": "登录页面报 500", "priority": "high", "skip_review": true }
```

`skip_review` 这个键，schema 的 properties 里从来没写过，是模型自己联想出来的。标准 JSON Schema 的默认行为恰恰允许对象携带这种未声明的额外键——如果你的工具实现顺手把整个 input 透传给下游，而下游代码里真有一段逻辑在检查这个字段名，一次模型的臆造就静默绕过了本该有的审核步骤。在 input_schema 顶层加上 `"additionalProperties": false`，把"只允许出现声明过的键"也写进校验规则。

要让平台真正强制执行这一切，给工具定义加上顶层字段 `"strict": true`。strict 模式的原理是约束模型的采样过程本身，让它只能生成符合 schema 的 token 序列——类型、enum、required、additionalProperties 全部兑现，不合法的参数根本不会被生成出来[^S20]。官方文档里 strict 模式的示例 schema 全都同时带着 `additionalProperties: false`，两者是配套使用的。到这一步，"不合法的值在请求发出前就被排除"才真正成立；没开 strict 模式的工具，实现侧的参数校验一行都不能省。

## 返回值：给模型下一步能用的信息，不是给人看的日志

工具执行完，结果会被包进一个 tool_result 块传回模型，核心字段是 `tool_use_id`（对应哪次调用）、`content`（结果内容）、`is_error`（有没有出错）[^S5]。这三个字段里，最容易写坏的是失败时的 content。

假设一个"写文件"工具因为目录不存在而失败，两种写法：

```json
{
  "tool_use_id": "call_1",
  "content": "Error: ENOENT: no such file or directory, open '/reports/q3.csv'",
  "is_error": true
}
```

这是把系统日志原样甩回去。模型能看出来"失败了"，但看不出来"接下来该做什么"——常见的后果是模型原样重试同一次调用，第二次还是同样的错误，陷入循环。

```json
{
  "tool_use_id": "call_1",
  "content": "写入失败：目录 /reports 不存在。请先用 fs_create_dir 创建该目录，或改用已存在的目录路径。",
  "is_error": true
}
```

同样是失败，这个版本告诉模型三件事：失败原因是什么、可以调用哪个工具来解决、或者还有别的什么路径可选。MCP 规范说得很明确：客户端应该把工具执行时的错误反馈给模型，让它能自己纠正[^S11]——前提是这段信息本身携带了纠正所需要的线索，不是一段只有排查代码的人才看得懂的堆栈信息。

## 工具数量和粒度：不是越多越好

工具箱不是越大越好用。每个工具定义（name、description、input_schema 加起来）在对话开始前就要塞进上下文，工具一多，这部分开销涨得很快。Anthropic 工程团队给过一个数字：58 个工具的定义占用了大约 55K token，对话真正开始之前就先烧掉这么多上下文；他们内部还见过更极端的情况——优化之前，工具定义本身就吃掉了 134K token[^S9]。上下文越挤，模型能留给实际任务推理的空间就越少。

工具数量多带来的第二个问题和 token 无关：选择本身变难了。功能相近的工具堆在一起，模型光是"该用哪一个"就要多做一步判断，判断错的概率跟着工具数量一起涨，更多工具不代表智能体表现更好[^S8]。这也是为什么前面反复强调 description 要写清楚边界。

反过来，粒度太粗也不行。一个"文件操作"工具把读、写、删、改都塞进一个 input_schema，靠 `action` 参数区分行为，模型得先猜对 `action` 取值，再猜对该填哪些参数——比拆成 `fs_read_file`、`fs_write_file` 几个职责单一的工具更容易出错。实践中的取舍：先按第 3 课的五类划分把工具拆开，数量涨上来之后再用命名空间和精确的 description 控制选错的概率，而不是靠堆一个万能工具去压数量。

<!-- exercises -->
## 💻 练习

### Level 1：重写一份含糊的工具定义

项目里有个"写文件"工具，现在的定义是：

```json
{
  "name": "write_file",
  "description": "写文件",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "content": { "type": "string" }
    },
    "required": ["path", "content"]
  }
}
```

工具箱里同时还有一个 `edit_file` 工具，专门做"在已有文件里做局部替换"。模型经常该调 `edit_file` 做小修改时却调了 `write_file`，把整个文件覆盖掉。

请重写 `write_file` 的 description 和 input_schema，要求：

1. description 里说清楚这个工具会**整体覆盖**文件内容，并指出局部修改应该用 `edit_file`
2. 给 input_schema 加一个用 enum 约束的参数，区分"文件不存在时创建"和"文件已存在时覆盖"两种情况，避免模型不小心覆盖了不该动的文件
3. 检查：如果模型收到"帮我把 config.json 里的端口号改成 8080"这句话，还会不会去调 `write_file`

<!-- rubric -->
- description 明确写出"整体覆盖"这个行为，并指名 edit_file 作为局部修改的替代方案
- input_schema 里有一个用 enum 约束的参数，用来区分创建和覆盖
- 能说明这样改为什么能降低"该用 edit_file 却调了 write_file"的概率

<!-- answer -->
参考写法：

```json
{
  "name": "write_file",
  "description": "创建新文件，或整体覆盖一个已存在文件的全部内容。如果只需要修改文件中的一小部分（比如改一个配置项、一行代码），请改用 edit_file 做局部替换，不要用这个工具覆盖整个文件。",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "目标文件路径" },
      "content": { "type": "string", "description": "写入的完整文件内容" },
      "mode": {
        "type": "string",
        "enum": ["create_new", "overwrite_existing"],
        "description": "create_new：文件必须不存在，否则报错；overwrite_existing：允许覆盖已存在的文件"
      }
    },
    "required": ["path", "content", "mode"]
  }
}
```

关键变化：description 里明说了"整体覆盖"和"改用 edit_file"，模型看到"改端口号"这种局部修改请求时会优先考虑 edit_file。mode 用 enum 强制模型表态"这次是新建还是覆盖"，即使还是选了 write_file，也不会在没意识到的情况下覆盖一个已经存在的文件。

<!-- hint -->
对照开场例子：它解决"选错工具"靠的是在 description 里直接点名替代工具。这道题是同样的模式，只是换成了 write_file 和 edit_file。

<!-- hint -->
enum 加在哪个参数上，取决于你想让模型调用前把哪件事想清楚。这里是"这次操作到底是不是要覆盖已有文件"，enum 应该约束这件事，而不是文件类型之类不相关的参数。

### Level 2：诊断一次因返回值写坏而失败的调用

下面是一段简化过的真实往返记录。一个"运行测试"工具连续被调用了 3 次，每次入参完全一样：

```
第 1 次调用: { "name": "run_tests", "input": { "suite": "unit" } }
返回: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }

第 2 次调用: { "name": "run_tests", "input": { "suite": "unit" } }
返回: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }

第 3 次调用: { "name": "run_tests", "input": { "suite": "unit" } }
返回: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }
```

请回答：

1. 模型为什么会用完全相同的参数重复调用 3 次，而不是换一种做法？
2. 这个错误的真实原因（数据库连接被拒绝，端口 5432 没人监听）需要模型做什么才能解决？工具箱里假设还有一个 `start_service` 工具。
3. 把 `content` 字段重写成一段能让模型在第 2 次调用之前就换成正确做法的错误信息。

<!-- rubric -->
- 能指出原始错误信息只有原始日志，没给出"接下来该做什么"的线索，模型只能重复重试
- 正确关联到根因（依赖服务没启动）和可用工具（start_service）
- 重写后的信息同时包含失败原因、建议动作、要调用的具体工具名

<!-- answer -->
1. 原始返回值只是把底层日志（`ECONNREFUSED 127.0.0.1:5432`）原样传回去，`is_error: true` 只告诉模型"这次失败了"，没告诉模型为什么失败、下一步该干嘛。模型只能假设是偶发问题，用同样的参数再试一次——这正是 MCP 规范强调"要把可操作的错误信息给模型"想避免的情况：没有可操作信息，就没有自我纠正，只有重复。

2. 端口 5432 是 PostgreSQL 的默认端口，`ECONNREFUSED` 说明测试依赖的数据库服务没在运行。模型需要先调用 `start_service`（假设能指定服务名，比如 `postgres`），确认启动成功后再重新调用 `run_tests`。

3. 参考写法：

```json
{
  "content": "测试运行失败：无法连接本地数据库服务（端口 5432 无响应），测试依赖的 postgres 服务当前未运行。请先调用 start_service 启动 postgres 服务，确认启动成功后再重新调用 run_tests。",
  "is_error": true
}
```

<!-- hint -->
先把"模型看到了什么"和"模型该做什么"分开写，原始日志只回答了前一半。

<!-- hint -->
好的错误信息读起来应该像在回答"接下来该调哪个工具、传什么参数"，而不是给人类工程师看的排查记录。

<!-- /exercises -->

## 小结

- description 是模型选工具、填参数时唯一能看到的说明，写清楚"做什么、什么时候用、什么时候别用"比写得优雅更重要
- name 里加上服务前缀（命名空间）能在工具一多时帮模型先排除掉一大批不相关的选项
- input_schema 里 type、enum、required 是校验语义上的真约束，title、description 只是说明；enum 加 required 能把模型乱填的概率压到很低，把"不合法输入根本不会被生成"变成硬保证要靠 additionalProperties: false 加 strict 模式[^S20]
- 返回值尤其是失败时的返回值，要把"为什么失败"和"下一步该做什么"写清楚，模型才能自我纠正，而不是原样重试
- 工具数量不是越多越好：定义要吃掉上下文 token，工具越相似模型越容易选错；粒度也不是越细越好，先按功能拆分，再靠清楚的命名和 description 控制选错的概率

[>> 第 5 课：权限与安全：给 Agent 的动手边界](./05-permissions-and-safety.md)
