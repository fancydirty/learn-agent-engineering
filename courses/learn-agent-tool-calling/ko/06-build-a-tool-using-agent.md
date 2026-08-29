# 레슨 6: 실습: 에이전트에 도구 세 개 연결하기

> 학습 목표:
> - 에이전트를 실제로 돌아가게 만드는 완전한 도구 실행 루프 작성하기
> - 도구의 인터페이스 정의와 구현을 한 테이블에 등록해 양쪽이 어긋나지 않게 하기
> - 루프에 안전장치를 달고, 로그를 읽어 도구가 잘못 연결된 때를 알아내기

> 전제: 레슨 1~5를 마치고 기본적인 JavaScript / Node.js를 읽을 수 있다 | 이전: [레슨 5 <<](./05-permissions-and-safety.md)

## 결과부터: 완전한 실행 한 번

이 레슨이 쌓아 올려 도달하는 지점입니다. 터미널에 한 문장을 입력하면 에이전트가 어떤 도구를 몇 번 호출할지 스스로 결정합니다.

```
$ node agent.js "이 프로젝트에서 lodash를 쓰고 있나요? GitHub에서 어떤 상태인지도 알아봐 주세요"

[턴 1] 호출 search_files { pattern: 'lodash', dir: '.' }
[턴 2] 호출 read_file { path: 'package.json' }
[턴 3] 호출 github_repo_info { owner: 'lodash', repo: 'lodash' }

최종 답변:
네, 이 프로젝트는 lodash를 사용합니다. package.json이 ^4.17.21로 고정하고
있고, src/utils/format.js에서 직접 가져다 씁니다. GitHub에서 lodash/lodash는
현재 스타가 6만 개를 넘고, 마지막 푸시는 몇 주 전으로 저장소는 여전히
관리되고 있습니다. ^4.17.21이 최신 릴리스인지 확인하려면 릴리스 목록에
질의를 한 번 더 해야 합니다.
```

세 턴, 세 도구, 그리고 각 턴의 인자는 앞 턴의 결과 위에 쌓입니다. 먼저 lodash가 어느 파일에 나오는지 찾고, 그다음 package.json을 읽어 버전을 확인하고, 그다음 그 이름을 들고 GitHub에 물어봅니다. 이것은 하드코딩된 스크립트가 아닙니다. 다음에 어떤 도구를 호출하고 어떤 인자를 넘길지는 모델 자신이 결정합니다.

이 레슨은 그것을 맨바닥에서 만듭니다. 도구 세 개, 레지스트리 하나, 실행 루프 하나, 안전장치 몇 개.

## 그 아래에서 벌어지는 일: 이어지는 API 왕복

위에서 본 모든 "턴"은 그 아래에서 완전한 HTTP 요청 하나입니다. 레슨 2 "도구 호출의 전체 왕복"이 단일 도구 호출의 왕복이 어떻게 생겼는지 보여 주었고, 여기서는 그것을 루프로 엮을 뿐입니다. 모델이 `stop_reason: "tool_use"`를 반환하면 여러분의 코드가 도구를 실행하고, 결과를 대화에 다시 꿰어 넣고, 또 한 번 요청을 보냅니다. 모델이 도구 호출을 그만 요구할 때까지요.[^S4]

도구 호출 세 턴은 실제로는 `messages.create` 호출 네 번입니다. 앞의 셋에서는 모델이 계속 도구를 요구하고, 네 번째에서는 GitHub 데이터를 손에 쥔 모델이 충분하다고 판단해 곧바로 텍스트 답변을 내놓으며 루프가 끝납니다. 도구를 계속 요구할지에 대한 판단은 전적으로 모델 쪽에 있습니다. 여러분의 코드는 실행하고 결과를 돌려보낼 뿐입니다.

## 1단계: 각 도구의 계약 쓰기

레슨 4 "도구 인터페이스 설계: 이름, 설명, 파라미터, 반환값"에서 도구 인터페이스의 세 핵심 필드인 `name`, `description`, `input_schema`를 다뤘습니다.[^S3] 여기서는 그것을 곧바로 코드로 옮깁니다. 세 도구는 레슨 3 "흔한 다섯 가지 도구 유형: 읽기, 쓰기, 실행, 검색, 호출"의 다섯 유형 중 셋에 대응합니다. 검색, 읽기, 호출입니다. 쓰기와 실행은 연습에서 여러분이 연결하도록 남겨 둡니다.

```js
const searchFilesSchema = {
  name: "search_files",
  description:
    "정규식과 일치하는 텍스트를 프로젝트 파일에서 검색합니다. 각 히트의 경로, " +
    "줄 번호, 줄 내용을 반환합니다. 문자열, 의존성 이름, 함수 이름이 " +
    "어느 파일에 나오는지 찾을 때 사용하세요. " +
    "일치하는 것이 없으면 빈 문자열이 아니라 그렇다고 명시하는 텍스트를 반환합니다.",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "JavaScript 정규식, 앞뒤 슬래시는 제외" },
      dir: { type: "string", description: "검색을 시작할 디렉터리, 프로젝트 루트 기준 상대 경로, 기본값은 \".\"" },
    },
    required: ["pattern"],
  },
};

const readFileSchema = {
  name: "read_file",
  description:
    "프로젝트 안 파일의 텍스트 내용을 읽으며, 최대 앞 4000자까지 반환합니다. " +
    "path는 프로젝트 루트 기준 상대 경로여야 하며, 이 도구는 프로젝트 디렉터리 밖의 파일에 접근할 수 없습니다.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "프로젝트 루트 기준 상대 파일 경로, 예: \"package.json\"" },
    },
    required: ["path"],
  },
};

const githubRepoInfoSchema = {
  name: "github_repo_info",
  description:
    "공개 GitHub 저장소의 기본 정보를 조회합니다: 스타 수, 열린 이슈 수, 기본 브랜치, 마지막 푸시 시각. " +
    "owner와 repo는 저장소 소유자와 저장소 이름을 담는 별개의 두 필드이며, 전체 URL은 받지 않습니다.",
  input_schema: {
    type: "object",
    properties: {
      owner: { type: "string", description: "저장소 소유자, 예: \"lodash\"" },
      repo: { type: "string", description: "저장소 이름, 예: \"lodash\"" },
    },
    required: ["owner", "repo"],
  },
};
```

`github_repo_info`에는 `github_` 접두사가 붙어 있습니다. 도구가 외부 서비스를 건드릴 때 서비스 이름으로 도구 이름을 네임스페이싱하라는 것이 공식 권고이며, 이는 모델이 잘못된 도구를 고를 확률을 크게 낮춥니다.[^S10] `search_files`와 `read_file`은 로컬 파일 시스템에서 동작하고 "어느 서비스인가"의 모호함이 없으므로 접두사가 필요 없습니다.

세 description 모두 아무것도 찾지 못했을 때 어떤 텍스트가 돌아오는지 명시하고 있는데, 이것은 군더더기가 아닙니다. 레슨 4는 좋은 description이 입력과 출력의 모호함을 없앤다고 짚었습니다.[^S8] 여기서의 모호함은 파라미터가 아니라 도구가 "아무것도 못 찾았다"를 어떻게 표현하는가에 있습니다. "안전장치" 절에서 터지는 함정입니다.

## 2단계: 계약과 구현을 한 테이블에 등록하기

흔한 함정: 스키마 목록과 실행 시점에 쓰는 핸들러 조회 테이블을 별개의 두 벌로 써 두면 언젠가는 어긋납니다. `search_files`를 `find_in_files`로 이름을 바꾸고 핸들러 테이블의 키를 고치는 것을 잊으면, 모델은 새 스키마에 맞춰 호출을 내보내는데 핸들러 테이블에는 그 키로 아무것도 없어서 예외가 납니다.

해법은 `name`, `description`, `input_schema`, 그리고 실제로 실행되는 함수가 모두 같은 객체 안에 있는 단일 테이블을 유지하는 것입니다. API가 필요로 하는 스키마 목록과 실행이 필요로 하는 핸들러 조회 테이블은 둘 다 이 하나의 테이블에서 파생됩니다.

```js
const TOOLS = {
  search_files: { ...searchFilesSchema, handler: searchFiles },
  read_file: { ...readFileSchema, handler: readFile },
  github_repo_info: { ...githubRepoInfoSchema, handler: githubRepoInfo },
};

// 모델에게 보낼 tools 파라미터, TOOLS에서 파생
const toolSchemas = Object.values(TOOLS).map(({ handler, ...schema }) => schema);

// 실행 시점에 쓰는 핸들러 조회 테이블, 역시 TOOLS에서 파생
const toolHandlers = Object.fromEntries(
  Object.entries(TOOLS).map(([name, t]) => [name, t.handler])
);
```

`toolSchemas`와 `toolHandlers`는 영원히 동기화된 채로 있습니다. 손으로 쓴 두 벌이 아니라 같은 데이터에서 계산된 두 가지 뷰이기 때문입니다. 도구 이름을 바꾸거나 파라미터를 추가하려면 `TOOLS` 한 곳만 고치면 됩니다.

## 3단계: 경계를 둔 채 도구 세 개 구현하기

`searchFiles`는 `grep`을 셸로 호출하지 않고 직접 디렉터리를 순회합니다. 그렇게 하면 사용자 입력을 명령줄에 이어 붙여 명령어 인젝션을 부르는 일을 피할 수 있습니다. 히트 개수에 상한을 두어 검색 한 번이 수천 줄을 컨텍스트에 밀어 넣지 못하게 합니다.

```js
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

async function searchFiles({ pattern, dir = "." }) {
  const root = path.resolve(PROJECT_ROOT, dir);
  // 비교 전에 path.sep을 붙입니다: 단순 startsWith는 /proj-backup 같은
  // 접두사가 같은 형제 디렉터리까지 통과시킵니다
  const inRoot = root === PROJECT_ROOT || root.startsWith(PROJECT_ROOT + path.sep);
  if (!inRoot) {
    return "실행 거부: 검색 디렉터리는 프로젝트 루트를 벗어날 수 없습니다.";
  }
  let regex;
  try {
    regex = new RegExp(pattern);
  } catch {
    return `실행 거부: "${pattern}"은(는) 유효한 정규식이 아닙니다.`;
  }

  const hits = [];
  for (const file of walk(root)) {
    let lines;
    try {
      lines = fs.readFileSync(file, "utf8").split("\n");
    } catch {
      continue; // 바이너리 파일 등은 텍스트로 읽을 수 없으므로 건너뜁니다
    }
    lines.forEach((line, i) => {
      if (regex.test(line)) {
        hits.push(`${path.relative(PROJECT_ROOT, file)}:${i + 1}:${line.trim()}`);
      }
    });
    if (hits.length >= 20) break; // 안전장치: 히트가 너무 많으면 조기에 잘라냅니다
  }
  return hits.length ? hits.join("\n") : "일치하는 내용을 찾지 못했습니다.";
}
```

`readFile`은 한 가지 일을 합니다. 대상 경로가 프로젝트 루트를 벗어나지 않았는지 확인하는 것입니다. 레슨 5의 경계 개념이 여기서는 구분자를 붙인 접두사 검사 하나로 나타납니다. 맨 `startsWith(PROJECT_ROOT)`가 아니라는 점에 주목하세요. 프로젝트 루트가 `/Users/me/proj`이고 모델이 `../proj-backup/x`를 넘긴다고 해 봅시다. resolve하면 `/Users/me/proj-backup/x`가 나오고, 맨 접두사 매칭이라면 그대로 통과합니다. `path.sep`을 붙이면 그제야 경계가 디렉터리 구분자에 맞춰집니다.

```js
async function readFile({ path: relPath }) {
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const inRoot = abs === PROJECT_ROOT || abs.startsWith(PROJECT_ROOT + path.sep);
  if (!inRoot) {
    return "실행 거부: 경로가 프로젝트 루트 밖이며, 이 도구는 프로젝트 외부 파일을 읽을 수 없습니다.";
  }
  if (!fs.existsSync(abs)) {
    return `파일이 존재하지 않습니다: ${relPath}`;
  }
  return fs.readFileSync(abs, "utf8").slice(0, 4000);
}
```

`githubRepoInfo`는 데이터를 프로젝트 밖으로 내보내는 유일한 도구입니다. 로컬 파일 내용이 모델을 거쳐 `owner`와 `repo` 두 문자열로 압축된 뒤 공개 인터넷으로 나갑니다. 이것이 바로 "비공개 데이터 읽기"와 "외부와 통신하기"라는 두 고위험 조건이 만나는 시나리오이므로[^S19], 명시적인 권한 규칙을 답니다. 인자는 GitHub의 유효한 이름 형식과 일치해야 하며 그 외에는 안 됩니다.

```js
const SAFE_NAME = /^[\w.-]+$/;

async function githubRepoInfo({ owner, repo }) {
  // 권한 규칙: owner/repo는 유효한 저장소 이름만 허용하며,
  // 임의의 문자열을 외부 네트워크로 내보내지 않습니다
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo)) {
    return "실행 거부: owner/repo 인자가 유효한 형식이 아니므로 외부 요청을 차단했습니다.";
  }

  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!res.ok) {
    return `GitHub API가 에러를 반환했습니다: ${res.status} ${res.statusText}`;
  }
  const data = await res.json();
  return JSON.stringify({
    stars: data.stargazers_count,
    open_issues: data.open_issues_count,
    default_branch: data.default_branch,
    pushed_at: data.pushed_at,
  });
}
```

`GITHUB_TOKEN`은 환경 변수에서 읽으며 코드에는 절대 나타나지 않습니다. 없어도 동작하고, 익명 요청의 요청 한도가 낮아질 뿐입니다. 이것은 레슨 5의 권한 규칙과 같은 개념을 다른 형태로 쓴 것입니다. 그 레슨은 Claude Code 설정 파일의 선언적 `allow`/`deny`/`ask` 규칙을 다뤘고[^S15], 이것은 도구 코드 안에 쓴 명령형 버전입니다. 둘 다 고위험 작업이 넘을 수 없는 선을 긋습니다.[^S18]

## 4단계: 실행 루프 쓰기

`toolSchemas`와 `toolHandlers`를 손에 쥐면 루프 자체는 복잡하지 않습니다. 핵심 로직은 네 단계입니다. 요청을 보내고, `stop_reason`을 보고, `tool_use`가 아니면 텍스트를 반환하고, 맞다면 모든 도구 호출 블록을 실행해 결과를 다시 꿰어 넣습니다.[^S4]

```js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_TURNS = 8;

async function runAgent(question) {
  const messages = [{ role: "user", content: question }];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5", // 계정에서 호출할 수 있는 모델로 교체하세요
      max_tokens: 1024,
      tools: toolSchemas,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock ? textBlock.text : "(모델이 텍스트 답변을 반환하지 않았습니다)";
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      console.log(`[턴 ${turn}] 호출 ${block.name}`, block.input);
      const handler = toolHandlers[block.name];
      const content = await handler(block.input);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(content) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`최대 턴 수를 초과했습니다 (${MAX_TURNS})`);
}

const question = process.argv[2] ?? "이 프로젝트에서 lodash를 쓰고 있나요? GitHub에서 어떤 상태인지도 알아봐 주세요";
runAgent(question).then((answer) => console.log("\n최종 답변:\n" + answer));
```

여기에 놓치기 쉬운 세부가 하나 있습니다. `for (const block of response.content)`는 첫 번째만이 아니라 **이번 턴에 반환된 모든 콘텐츠 블록**을 순회합니다. 모델은 한 턴에 도구 두세 개를 병렬로 요구하는 일이 잦고, 각각을 실행해 저마다의 `tool_result`를 만들어야 하며, `tool_use_id`가 일대일로 맞아야 하고, 하나도 빠져서는 안 됩니다.[^S5] 레벨 2 연습에서 하나를 빠뜨리는 함정을 직접 겪어 보게 됩니다.

## 안전장치, 그리고 도구가 잘못 연결되었음을 알아내는 법

위 루프는 돌아가지만 보호 장치 두 개가 빠져 있습니다. 추가합시다.

**보호 장치 하나: 도구 실패는 피드백되어야 하며 루프를 죽여서는 안 됩니다.** 날것의 호출을 `try/catch`로 감싸고, 실패해도 여전히 `tool_result`를 만들되 `is_error: true`로 표시하세요. 모델은 그 표시를 보면 같은 에러를 반복하는 대신 대개 인자를 조정해 재시도합니다.[^S11][^S5]

```js
let content, isError = false;
try {
  if (!handler) throw new Error(`${block.name} 이름으로 등록된 도구가 없습니다`);
  content = await handler(block.input);
} catch (err) {
  content = `도구 실행 에러: ${err.message}`;
  isError = true;
}
toolResults.push({
  type: "tool_result",
  tool_use_id: block.id,
  content: String(content),
  ...(isError ? { is_error: true } : {}),
});
```

**보호 장치 둘: 같은 도구를 같은 인자로 3회 연속 호출하면 멈춰야 합니다.** 이것은 어림짐작이 아니라 최근 몇 번의 호출 서명을 기록하는 데 근거합니다.

```js
// 이것은 모듈 최상위가 아니라 runAgent 함수 본문 맨 위에 두세요. 그래야 매 실행이
// 0에서부터 기록을 시작하고, 같은 프로세스의 두 번째 작업이 이전 실행의 기록 때문에
// 잘못 종료되지 않습니다
const recentCalls = [];

// ...for (const block of response.content) 루프 안에서, 핸들러 실행 전에:
const signature = `${block.name}:${JSON.stringify(block.input)}`;
recentCalls.push(signature);
const last3 = recentCalls.slice(-3);
if (last3.length === 3 && last3.every((s) => s === signature)) {
  return "동일한 인자로 같은 도구가 3회 연속 호출되어 실행을 중단했습니다.";
}
```

주 스위치인 `MAX_TURNS`와 더불어 세 안전장치는 맡은 일이 서로 다릅니다. `MAX_TURNS`는 "모델이 계속 새로운 변주로 도구를 요구하며 멈추지 않는 것"을 막고, 반복 호출 감지는 "모델이 같은 인자에 갇혀 헛도는 것"을 막으며, 도구 내부의 경로·형식 검사(3단계에서 쓴 것들)는 "모델이 범위를 벗어난 인자를 지어냈는데 도구가 고분고분 실행해 버리는 것"을 막습니다. 세 층 중 하나라도 빠지면 루프는 폭주하거나 선을 넘을 위험을 집니다.[^S18]

**로그를 보고 도구가 잘못 연결되었음을 어떻게 알아낼까요?** 가장 흔한 신호 두 가지입니다.

- **모델이 같은 도구를 몇 번이고 호출하며**, 인자는 좁은 범위 안에서만 달라집니다(대소문자 변경, 단어 하나 추가나 삭제). 열에 아홉은 모델이 멍청한 것이 아니라 `tool_result` 내용이 너무 모호한 것입니다. "찾지 못함"이 빈 문자열을 반환하니 모델은 "정말로 아무것도 없다"와 "도구가 고장 났다"를 구별할 수 없고 추측해 다시 시도할 수밖에 없습니다.
- **모델이 인자를 추측해 채웁니다.** 예를 들어 `read_file`에 존재하지 않는 경로를 넘깁니다. 거슬러 올라가면 대개 둘 중 하나가 나옵니다. `description`이 그 인자가 어디서 와야 하는지 짚어 주지 않았거나(레슨 4의 메아리), 앞선 도구의 출력이 정확한 경로를 주지 않아 모델이 지어낼 수밖에 없었거나입니다.

```agentmentor-check
{
  "id": "tool-zh-06-diagnose-loop",
  "label": "에이전트가 같은 도구를 계속 호출하는 이유 진단",
  "prompt": "어떤 수강생이 searchFiles의 일치 없음 반환값을 빈 문자열로 바꿨다고 해 봅시다(이 레슨의 '일치하는 내용을 찾지 못했습니다.' 대신에). '이 프로젝트가 moment.js를 쓰는지 확인해 줘'를 처리하면서 이 수정된 에이전트는 search_files를 5턴 연속 호출하고, 정규식만 'moment'에서 'Moment'로, 'MOMENT'로 바꾸다가 결국 MAX_TURNS에 도달해 종료됩니다. 이 프로젝트는 실제로 moment.js를 쓰지 않습니다. 이 루프의 가장 유력한 근본 원인은 무엇입니까?",
  "whyHere": "실행 루프와 안전장치를 막 다룬 직후이므로, 학습자가 '모델이 같은 도구를 계속 호출한다'는 증상을 모델의 능력이나 턴 상한이 아니라 'tool_result 내용이 상태를 분명히 진술하는가'라는 근본 원인에 대응시킬 수 있는지 확인하는 자리입니다",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "모델의 능력이 부족해 경우를 구별하지 못하는 것이니 더 강한 모델로 교체한다",
      "correct": false,
      "feedback": "모델 교체는 원인이 아니라 증상을 다루는 것입니다. 진짜 문제는 tool_result에 있습니다. 빈 문자열은 '도구가 고장 났다'와 거의 구별되지 않으므로, 모델은 '정말로 찾지 못했다'와 '호출이 실패했다'를 구별할 수 없고 표현을 바꿔 재시도할 수밖에 없습니다."
    },
    {
      "id": "b",
      "text": "searchFiles가 일치 없음에 빈 문자열을 반환하고, 모델은 이를 불확실한 결과로 읽어 재시도한다",
      "correct": true,
      "feedback": "맞습니다. tool_result의 내용은 모델이 '이 단계가 끝났는가'를 판단하는 유일한 근거입니다. 빈 문자열은 모호한 신호이며, 모델은 아무것도 찾지 못한 것인지 호출이 실패한 것인지 확신할 수 없어 다른 정규식을 시도합니다. 반환값을 '일치하는 내용을 찾지 못했습니다' 같은 명시적 텍스트로 바꾸면, 모델은 그것을 본 순간 재시도를 멈추고 이 프로젝트가 이 라이브러리를 쓰지 않는다고 곧바로 결론 내립니다."
    },
    {
      "id": "c",
      "text": "MAX_TURNS가 너무 낮게 설정되어 있으니 올려서 루프가 저절로 멈추는지 본다",
      "correct": false,
      "feedback": "MAX_TURNS를 올리면 루프가 벽에 부딪히기까지 몇 턴 더 헛돌 뿐이고, 모델이 왜 재시도하는지는 다루지 못합니다. 근본 원인은 턴 상한이 아니라 searchFiles가 반환하는 불분명한 신호입니다."
    }
  ]
}
```

<!-- exercises -->
## 💻 연습

### 레벨 1: 일단 돌린 뒤 네 번째 도구 연결하기

이 레슨의 코드를 빈 로컬 디렉터리에 복사하고, `npm install @anthropic-ai/sdk`를 실행한 뒤 `npm pkg set type=module`을 실행하고(이 레슨의 코드는 모두 ESM `import` 문법을 씁니다. 22.7 미만 Node에서는 이 단계를 건너뛰면 "Cannot use import statement outside a module"이 그대로 발생합니다), `ANTHROPIC_API_KEY`를 설정한 다음(`GITHUB_TOKEN`은 선택), `node agent.js "이 프로젝트에서 lodash를 쓰고 있나요? GitHub에서 어떤 상태인지도 알아봐 주세요"`를 한 번 실행하세요. 서로 다른 도구 호출 턴이 최소 두 번 보이고 마지막에 텍스트 답변이 나오는지 확인하세요.

돌아가면 네 번째 도구 `write_report(path, content)`를 연결하세요. 확인 결과를 Markdown 파일로 쓰되, 프로젝트의 `reports/` 디렉터리 아래에서만 허용하고 다른 곳에 쓰는 것은 거부합니다. 프롬프트를 하나 바꿔서, 예를 들어 "방금 모은 확인 결과를 reports/lodash-check.md에 써 줘"라고 하고, 모델이 이 새 도구를 스스로 호출하는지 확인하세요.

<!-- rubric -->
- 기존 도구 세 개가 동작하고, 로그에 도구 호출 턴이 최소 두 번 보이며, 뒤 턴의 인자가 앞 턴의 결과를 사용
- `write_report`의 경로 제한이 실제로 효력을 가짐: `reports/../secret.txt`나 `reports-evil/x.md` 같은 경로 쓰기 시도가 거부됨
- `write_report`가 `TOOLS` 테이블에 올바르게 등록됨: 스키마가 `toolSchemas`에 나타나고 `toolHandlers`에서 해당 함수를 조회 가능

<!-- answer -->
핵심은 `readFile`의 경계 검사 개념을 그대로 복사하되 "읽기"를 "쓰기"로 바꾸고 허용 범위를 프로젝트 루트 전체에서 `reports/` 하위 디렉터리 하나로 좁히는 것입니다.

```js
const REPORTS_DIR = path.join(PROJECT_ROOT, "reports");

async function writeReport({ path: relPath, content }) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const inReports = abs === REPORTS_DIR || abs.startsWith(REPORTS_DIR + path.sep);
  if (!inReports) {
    return "실행 거부: reports/ 디렉터리 아래에만 파일을 쓸 수 있습니다.";
  }
  fs.writeFileSync(abs, content, "utf8");
  return `${path.relative(PROJECT_ROOT, abs)} 파일을 썼습니다`;
}

const writeReportSchema = {
  name: "write_report",
  description: "텍스트 내용을 Markdown 파일로 씁니다. reports/ 디렉터리 아래에만 쓸 수 있고 프로젝트의 다른 곳에는 쓸 수 없습니다.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "프로젝트 루트 기준 상대 경로, \"reports/\"로 시작해야 함" },
      content: { type: "string", description: "쓸 텍스트 내용 전체" },
    },
    required: ["path", "content"],
  },
};

TOOLS.write_report = { ...writeReportSchema, handler: writeReport };
```

<!-- hint -->
경로 검사는 `readFile`과 같은 방식으로 씁니다. `path.resolve` 후에 `path.sep`을 붙여 접두사를 비교하되, 기준만 `PROJECT_ROOT`에서 `REPORTS_DIR`로 바꿉니다. 구분자를 붙이지 않으면 `reports-evil/` 같은 동일 접두사 디렉터리가 검사를 빠져나갑니다.

<!-- hint -->
파일을 쓰기 전에 `fs.mkdirSync(REPORTS_DIR, { recursive: true })`를 잊지 마세요. 그러지 않으면 `reports/` 디렉터리가 아직 없는 첫 실행에서 `writeFileSync`가 그대로 예외를 던집니다.

### 레벨 2: 실패를 만들어 낸 뒤 고치기

아래 루프 코드에는 버그가 있습니다. 어떤 조건에서 다음 API 요청이 에러를 내는지 먼저 설명하고, 그다음 고친 코드를 제시하세요.

```js
// 버그 있는 버전
const block = response.content.find((b) => b.type === "tool_use");
if (block) {
  const result = await toolHandlers[block.name](block.input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: String(result) }],
  });
}
```

<!-- rubric -->
- 버그를 정확히 짚음: `.find()`로 첫 번째 `tool_use` 블록만 가져오므로 모델이 한 턴에 여러 도구를 병렬로 요구하면 뒤의 호출들이 통째로 무시됨
- 실제 증상을 설명: 앞선 assistant 메시지에 `tool_use` 블록이 몇 개 있었든 다음 턴에는 그만큼 대응되는 `tool_result` 블록이 있어야 하며, 부족하면 그대로 에러
- 수정본은 `type === "tool_use"`인 모든 블록을 순회해 각각에 대응하는 `tool_result`를 만들고, 그것들을 하나의 `user` 메시지에 담도록 바꿈

<!-- answer -->
버그는 한 턴에 도구 호출이 많아야 하나라고 가정한 것인데, 실제로 모델은 한 번에 두세 개를 병렬로 얼마든지 요구할 수 있습니다. 수정은 이 레슨 4단계에 나온 바로 그 형태입니다. `.find()`를 모든 블록에 대한 루프로 바꿉니다.

```js
const toolResults = [];
for (const block of response.content) {
  if (block.type !== "tool_use") continue;
  const result = await toolHandlers[block.name](block.input);
  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: String(result) });
}
messages.push({ role: "user", content: toolResults });
```

<!-- hint -->
`response.content`에서 `type`이 `"tool_use"`일 수 있는 원소가 몇 개인지 세어 보세요. 모델은 한 번에 도구 두 개를 병렬로 얼마든지 요구할 수 있고 언제나 하나인 것이 아닙니다.

<!-- hint -->
API의 규칙은 이렇습니다. 앞선 assistant 메시지에 `tool_use` 블록이 몇 개 있었든, 다음 `user` 메시지에는 그만큼 대응되는 `tool_result` 블록이 있어야 하며 하나도 빠져서는 안 됩니다.

<!-- /exercises -->

## 정리

- 도구의 스키마와 핸들러를 같은 테이블(`TOOLS`)에 등록하고 `toolSchemas`와 `toolHandlers`를 거기서 파생시키면, 한 곳을 고쳤는데 다른 곳이 그대로 남는 일이 없다
- 실행 루프의 핵심은 이것이다: 요청을 보낸다 → `stop_reason`이 `tool_use`인지 확인한다 → 맞다면 **모든** 도구 호출 블록을 순회해 실행하고 `tool_result`를 다시 꿰어 넣는다 → 아니라면 텍스트를 반환하고 루프를 끝낸다
- 한 턴에 병렬 도구 호출이 여럿일 수 있다. 모든 `tool_use`에는 고유하게 대응되는 `tool_result`가 필요하고, 하나라도 빠지면 다음 요청이 에러가 난다
- 세 안전장치는 각각 한 층을 지킨다. `MAX_TURNS`는 모델이 무한정 도구를 요구하는 것을 막고, 반복 호출 감지는 모델이 같은 인자 묶음에 갇혀 헛도는 것을 막으며, 도구 내부의 경로·형식 검사는 범위를 벗어난 인자를 막는다
- `tool_result`의 내용은 "찾지 못함"과 "에러 발생"을 분명히 진술해야 한다. 모호한 빈 반환값은 모델이 몇 번이고 재시도하고 로그가 도구 오연결처럼 보이게 만드는 첫 번째 원인이다

이제 "에이전트가 왜 도구를 필요로 하는가"에서 시작해 직접 동작하는 도구 실행 루프를 쓰기까지, 이 코스의 여섯 레슨을 모두 마쳤습니다. 다음에 할 가장 값어치 있는 일은 레슨을 하나 더 읽는 것이 아니라, 여러분 프로젝트에서 작고 실제적인 과제 하나를 골라 도구 두세 개로 쪼개고, 이 루프 골격을 조금 손봐 옮겨오는 것입니다. 한 번 돌려 보는 것이 설명 열 개를 더 읽는 것보다 낫습니다. 디버깅하다 특정 필드가 헷갈리면 `sources.md`로 돌아가 공식 문서 두 개인 S4와 S5를 확인하세요. 이 멀티턴 루프에 대해서는 그것이 가장 일차적인 명세 텍스트입니다.
