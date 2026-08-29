# 레슨 4: 도구 인터페이스 설계: 이름, 설명, 파라미터, 반환값

> 학습 목표:
> - 도구 description이 모델에게 올바른 도구를 고르고 올바른 파라미터를 채울 만큼의 정보를 주는지 판단하기
> - JSON Schema의 enum과 required로 파라미터 오용의 여지를 막고, 그 제약을 강한 보장으로 바꾸는 strict 모드를 언제 쓸지 알기
> - 모델이 스스로 교정하는 데 쓸 수 있는 반환값과 에러 메시지 설계하기
>
> 전제: 레슨 3을 마쳤고 다섯 가지 도구 유형(읽기 / 쓰기 / 실행 / 검색 / 호출)의 차이를 안다 | 이전: [레슨 3 <<](./03-tool-types.md) | 다음: [레슨 5 >>](./05-permissions-and-safety.md)

## 도구 하나, 설명 두 가지, 결과 두 가지

도구 상자에 코드 검색 도구가 하나 있다고 해 봅시다. 등록된 첫 번째 버전은 이렇습니다.

```json
{
  "name": "search_files",
  "description": "파일 검색",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"]
  }
}
```

사용자가 묻습니다. "utils.ts는 어느 디렉터리에 있나요?"

모델이 근거로 삼을 수 있는 것은 저 두 줄, 즉 name과 description뿐입니다. `search_files`가 이름으로 파일을 찾는지 파일 내용 안에서 문자열을 검색하는지 구분할 방법이 없습니다. description이 말해 주지 않으니까요. 모델은 이 도구를 골라 `utils.ts`를 query로 넘깁니다.

```json
{ "id": "call_1", "name": "search_files", "input": { "query": "utils.ts" } }
```

만약 이 도구가 실제로는 전문 검색(각 파일 내용 안에서 `utils.ts`라는 문자열을 찾는 것)이고 어떤 파일 내용에도 그 문자들이 문자 그대로 들어 있지 않다면, 결과는 비어서 돌아옵니다. 모델은 빈 결과를 받고도 파일이 없는 것인지 자기 검색 방식이 틀린 것인지 알 수 없으니 추측합니다. 흔한 추측은 동의어 몇 개를 바꿔가며 다시 검색하는 것이고, 계속 빈 결과만 받습니다.

이제 description을 이렇게 바꿔 넣습니다.

```json
{
  "name": "code_search_grep",
  "description": "소스 파일의 내용에서 정규식과 일치하는 줄을 검색해 파일 경로와 줄 번호를 반환합니다. '코드의 어디에 특정 변수/함수/문자열이 나오는가'에 답할 때 사용하세요. 이름으로 파일을 찾으려면(내용이 아니라) 대신 code_search_glob 도구를 사용하세요.",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": { "type": "string", "description": "일치시킬 정규식" },
      "path": { "type": "string", "description": "검색을 시작할 디렉터리, 기본값은 프로젝트 루트" }
    },
    "required": ["pattern"]
  }
}
```

같은 질문이지만 이번에는 모델이 "이름으로 파일을 찾으려면 code_search_glob을 쓰라"를 읽고, 같은 도구 상자에 등록된 code_search_glob으로 곧장 옮겨가 올바른 파라미터를 넘깁니다.

```json
{ "id": "call_1", "name": "code_search_glob", "input": { "pattern": "**/utils.ts" } }
```

두 호출 사이에 바뀐 것은 없습니다. 같은 모델, 같은 프롬프트, 구현 코드는 한 줄도 건드리지 않았습니다. 차이는 오직 도구 정의에서 모델이 읽을 수 있는 그 몇 줄, 즉 더 정확한 이름, 경계를 짚어 주고 대안 도구를 지목하는 description, 그리고 각자 설명을 가진 파라미터뿐입니다. 이 레슨의 주제가 바로 그것입니다. 도구 인터페이스의 모든 필드는 모델이 결정을 내릴 때 근거로 삼을 수 있는 유일한 재료입니다.

## 모델이 도구를 고를 때 보는 것은 description뿐

개발자는 API 주석을 쓰듯 도구를 작성하는 경향이 있습니다. 함수에 의미 있는 이름을 붙이고, 로직은 본문에 넣고, 필요한 사람이 소스를 읽게 하는 식입니다. 그 습관은 도구 정의에서 무너집니다. **모델은 여러분의 구현 코드를 읽지 않습니다.** 모델이 볼 수 있는 것은 name, description, input_schema 필드뿐이며[^S3], 어떤 도구를 고르고 어떤 파라미터를 넘길지가 전부 그 몇 줄에서 결정됩니다.

description에 대한 공식 요구사항은 직설적입니다. description은 "A detailed plaintext description of what the tool does, when it should be used, and how it behaves."(도구가 무엇을 하고, 언제 써야 하며, 어떻게 동작하는지에 대한 상세한 평문 설명)여야 합니다[^S3]. 이 셋 중 하나라도 빠지면 모델은 추측해야 합니다. "무엇을 하는지"가 빠지면 모델은 도구를 아예 건너뛰고 더 먼 길로 돌아가 결과를 흉내 낼 수 있습니다. "언제 쓰는지"가 빠지면, 도구 상자에 비슷한 도구가 여럿(예를 들어 grep과 glob 둘 다) 있을 때 모델은 경계가 어디인지 알 수 없고, 잘못 고를 확률은 도구 개수와 함께 올라갑니다. "어떻게 동작하는지"가 빠지면 모델은 어떤 형태의 결과가 돌아올지 몰라서 그 결과를 파싱하는 올바른 후속 로직을 쓸 수 없습니다.

좋은 description은 우아한 문장을 찾기보다 "Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs."(기대하는 입력과 출력을 명확히 기술하고 엄격한 데이터 모델로 강제해 모호함을 없애라)를 따라야 합니다[^S8]. 앞 절의 `code_search_grep` description이 통하는 이유는 두 가지를 하기 때문입니다. 파일 이름이 아니라 내용을 검색한다는 점을 분명히 하고, 이름으로 파일을 찾는 도구로 `code_search_glob`을 지목합니다. 이 두 문장 덕분에 모델은 시행착오 없이 비슷한 도구들 사이에서 선택할 수 있습니다.

```agentmentor-check
{
  "id": "tool-zh-04-description-audience",
  "label": "description을 쓰는 대상",
  "prompt": "한 동료가 description을 상세히 쓰는 것은 불필요하다고 하면서 이렇게 말합니다. '이 텍스트는 사실 이 코드를 유지보수할 사람이 로직을 이해하라고 있는 것이고, 모델은 곁다리로 읽을 뿐이니 문구에 공들일 필요가 없다.' 어떻게 답하겠습니까?",
  "whyHere": "도입부 예시에서 이미 두 가지 description이 모델을 잘못된 도구와 올바른 도구로 각각 이끄는 것을 보였습니다. 여기서는 학습자가 description 필드의 실제 독자가 누구이고 결정 경로에서 어떤 역할을 하는지를 이해했는지, 아니면 그저 평범한 코드 주석으로 취급하는지를 확인하는 자리입니다",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "description은 주로 나중에 이 코드를 유지보수할 사람을 위한 주석이고, 모델은 지나가는 길에 읽을 뿐이다",
      "correct": false,
      "feedback": "반대입니다. 모델이 도구를 고르고 파라미터를 채울 때 볼 수 있는 것은 name, description, input_schema 필드뿐이며, 구현 코드는 물론 그 안의 주석도 볼 수 없습니다. description은 모델이 '곁다리로' 읽는 해설이 아니라 모델의 결정 근거 전부입니다. 동료를 위한 메모는 코드 주석이나 문서에 들어가야 하고, 그것은 이 필드와 별개의 것입니다."
    },
    {
      "id": "b",
      "text": "description은 모델이 이 도구를 호출할지와 무엇을 넘길지 결정할 때 읽는 유일한 텍스트이며, 모델은 구현 코드를 볼 수 없다",
      "correct": true,
      "feedback": "맞습니다. 도입부 예시에서 같은 도구의 description 하나만 바꿨는데 모델이 잘못된 도구를 고르던 데서 올바른 도구를 고르는 쪽으로 뒤집힌 것도 그 때문입니다. 모델도 그대로, 구현도 그대로, 바뀐 것은 모델이 읽을 수 있는 텍스트뿐이었습니다."
    },
    {
      "id": "c",
      "text": "description은 주로 토큰을 아끼기 위한 것이므로 짧을수록 좋고, 쓰는 법은 시스템 프롬프트를 보고 모델이 추측하게 하면 된다",
      "correct": false,
      "feedback": "방향이 틀렸습니다. 모호한 description은 토큰을 아끼지 못합니다. 오히려 모델이 비슷한 도구 여럿을 시행착오로 거치고, 빈 결과를 받고, 재시도하게 만들며, 그렇게 실패한 왕복이 명확한 몇 문장보다 훨씬 많은 토큰을 씁니다. 도구 개수가 충분히 많아지면 토큰 비용도 분명 문제가 되지만, 그것은 도구 개수와 세분성을 다듬어서 풀 일이지 도구별 설명을 모호하게 써서 풀 일이 아닙니다."
    }
  ]
}
```

## 이름도 소속을 드러내야 한다: 네임스페이싱

description의 역할이 도구가 무엇을 하는지 짚어 주는 것이라면, 이름의 역할은 다릅니다. 붐비는 도구 상자에서 다른 도구와 헷갈리지 않게 하는 것입니다. 도구가 많아지면, 특히 외부 서비스를 여럿 연결한 뒤에는 `list_prs`, `send_message`, `create_issue` 같은 이름은 누구나 고를 법한 이름이고, 이름만으로는 어느 서비스에 속하는지 알 수 없습니다.

공식 권고는 도구 이름에 서비스 접두사를 붙이라는 것입니다. "When your tools span multiple services or resources, prefix names with the service (e.g., github_list_prs, slack_send_message). This makes tool selection unambiguous as your library grows, and is especially important when using tool search."(도구가 여러 서비스나 리소스에 걸쳐 있으면 이름에 서비스를 접두사로 붙여라. 라이브러리가 커져도 도구 선택이 모호해지지 않으며, 도구 검색을 쓸 때 특히 중요하다)[^S10] 모델이 수십 개 중 하나를 골라야 할 때 접두사가 붙은 이름은 후보를 먼저 좁혀 주므로, 각 description을 열어 한 줄씩 비교하지 않고도 대부분의 선택지를 배제할 수 있습니다. 레슨 3의 다섯 가지 도구 유형(읽기, 쓰기, 실행, 검색, 호출)도 각각을 다른 서비스가 뒷받침한다면 같은 이득을 봅니다. `fs_read_file`과 `db_read_row`는 한눈에 봐도 같은 것이 아니지만, 맨 `read`는 둘을 뭉개버립니다.

## input_schema: 파라미터의 형태를 못 박기

description이 모델이 이 도구를 고를지를 결정한다면, input_schema는 파라미터를 올바르게 채울 수 있는지를 결정합니다[^S3]. 놓치기 쉬운 점이 하나 있습니다. JSON Schema에서 모든 필드가 파라미터를 "제약"하는 것은 아니며, 어떤 필드는 "설명"만 합니다.

파라미터에 description을 붙이는 것은 의도를 진술할 뿐이고, 그 문장과 맞지 않는 입력을 거부하지는 않습니다[^S14].

```json
{
  "file_type": {
    "type": "string",
    "description": "검색을 특정 파일 유형으로 제한합니다. 예: typescript"
  }
}
```

모델은 `"typescript"`를 넘길 수도, `"ts"`를 넘길 수도, `"TypeScript files"`를 넘길 수도 있습니다. description은 제안일 뿐이고 임의의 값을 넘기는 것을 막지 못합니다. 임의의 값을 실제로 막는 것은 enum입니다.

```json
{
  "file_type": {
    "type": "string",
    "enum": ["js", "ts", "py", "all"],
    "description": "검색을 특정 파일 유형으로 제한합니다"
  }
}
```

enum이 자리를 잡으면 허용되는 값이 명시적으로 나열되고, 모델은 거의 언제나 그중 하나를 채우며, 임의의 값이 나올 확률은 급격히 떨어집니다. 다만 이것은 모델에 대한 강한 유도이지 플랫폼이 주는 강한 보장은 아닙니다. 기본 모드에서 API는 스키마를 기준으로 파라미터를 대신 검증해 주지 않으며, 모델은 여전히 이따금 타입이 틀렸거나 required 필드가 빠진 입력을 만들어 냅니다[^S20]. 따라서 도구 구현에 있는 잘못된 값 검사는 그대로 남아 있어야 합니다. required도 마찬가지입니다. "파일 쓰기" 도구가 `path`를 required로 표시하지 않으면 모델은 이따금 그것을 빠뜨리고, 그러면 구현은 에러를 내거나 기본 경로를 추측해야 하는데 둘 다 좋지 않습니다. `path`를 required로 표시하면 그런 오용의 확률이 아주 낮아집니다. 그리고 "required"가 플랫폼에 의해 실제로 강제되는지는 다음 절의 strict 모드에 달려 있습니다.

**이 구분을 기억하세요.** type, enum, required는 검증 관점에서 진짜 제약이고, title과 description은 모델을 위한 메모일 뿐이며, 아무리 상세해도 검증 규칙이 되지는 않습니다[^S14]. input_schema를 설계할 때 먼저 물어보세요. 이 파라미터에서 "나오면 안 되는 입력"을 description에 "xxx를 넘겨 주세요"라고 쓰는 대신 enum이나 required로 아예 막을 수 있는가? 이 제약들을 "스키마에 쓰여 있음"에서 "플랫폼이 강제함"으로 끌어올리는 방법이 다음 절입니다.

## 약한 제약을 강한 보장으로: additionalProperties: false와 strict 모드

앞 절은 "제약"과 "설명"의 차이를 계속 강조했지만, 구분해 둘 층이 하나 더 있습니다. 스키마에 제약을 쓰는 것과 모델이 만들어 낸 파라미터가 실제로 검증을 통과하는 것은 여전히 별개입니다. 기본 모드에서 API는 스키마와 맞지 않는 호출을 대신 가로채 주지 않습니다. 모델은 이따금 숫자를 문자열 `"2"`로 쓰거나 required 필드를 그냥 빠뜨립니다[^S20].

더 미묘한 방향도 있습니다. 모델이 없던 필드를 덧붙일 수 있다는 것입니다. 티켓 생성 도구의 스키마가 `title`과 `priority` 두 파라미터만 선언했는데 어느 호출이 이렇게 돌아왔다고 해 봅시다.

```json
{ "title": "로그인 페이지가 500을 반환함", "priority": "high", "skip_review": true }
```

저 `skip_review` 키는 스키마의 properties에 아예 없었고, 모델이 스스로 지어낸 것입니다. 표준 JSON Schema의 기본 동작이 바로 객체가 선언되지 않은 여분의 키를 지니는 것을 허용하는 것입니다. 그리고 도구 구현이 입력 전체를 하위 시스템으로 그대로 넘기는데 하위 코드에 정말로 그 필드 이름을 검사하는 분기가 있다면, 모델의 환각 한 번이 원래 일어났어야 할 검토 단계를 소리 없이 건너뜁니다. input_schema 맨 위에 `"additionalProperties": false`를 넣으면 "선언된 키만 허용한다"까지 검증 규칙에 쓰게 됩니다.

이 모든 것을 플랫폼이 실제로 강제하게 하려면 도구 정의에 최상위 필드 `"strict": true`를 추가하세요. strict 모드가 동작하는 방식은 모델의 샘플링 자체를 제약하는 것입니다. "Setting strict: true on a tool definition guarantees Claude's tool inputs match your JSON Schema by constraining the model's token sampling to schema-valid outputs (a technique called grammar-constrained sampling)."(도구 정의에 strict: true를 설정하면 모델의 토큰 샘플링을 스키마에 유효한 출력으로 제약함으로써 Claude의 도구 입력이 여러분의 JSON Schema와 일치함을 보장한다. 문법 제약 샘플링이라 불리는 기법이다)[^S20] type, enum, required, additionalProperties가 모두 지켜지고, 유효하지 않은 파라미터는 애초에 생성되지 않습니다. 공식 문서의 strict 모드 예제 스키마들도 하나같이 `additionalProperties: false`를 함께 달고 있습니다. 둘은 같이 쓰라고 있는 것입니다. 이 지점에 이르러서야 "유효하지 않은 값은 요청이 보내지기도 전에 배제된다"가 참으로 성립합니다. strict 모드를 켜지 않은 도구라면 구현 쪽 파라미터 검증은 한 줄도 덜어낼 수 없습니다.

## 반환값: 사람이 읽을 로그가 아니라 모델이 다음에 쓸 것을

도구가 끝나면 그 결과는 tool_result 블록에 감싸여 모델에게 되돌아갑니다. 핵심 필드는 `tool_use_id`(어느 호출에 대한 것인지), `content`(결과), `is_error`(실패 여부)입니다[^S5]. 이 셋 중 가장 자주 잘못 쓰이는 것이 실패했을 때의 content입니다.

"파일 쓰기" 도구가 디렉터리가 없어서 실패했다고 해 봅시다. 두 가지로 쓸 수 있습니다.

```json
{
  "tool_use_id": "call_1",
  "content": "Error: ENOENT: no such file or directory, open '/reports/q3.csv'",
  "is_error": true
}
```

이것은 시스템 로그를 그대로 되던집니다. 모델은 실패했다는 것은 알 수 있지만 다음에 무엇을 할지는 알 수 없고, 흔한 결과는 모델이 똑같은 호출을 재시도해 같은 에러를 두 번째로 맞고 루프에 빠지는 것입니다.

```json
{
  "tool_use_id": "call_1",
  "content": "쓰기 실패: /reports 디렉터리가 존재하지 않습니다. fs_create_dir로 먼저 생성하거나, 이미 존재하는 디렉터리 아래의 경로로 바꾸세요.",
  "is_error": true
}
```

같은 실패지만 이 버전은 모델에게 세 가지를 알려줍니다. 무엇이 실패했는지, 그것을 고치려면 어떤 도구를 호출하면 되는지, 그리고 어떤 다른 경로가 가능한지입니다. MCP 명세는 분명히 말합니다. "Clients SHOULD provide tool execution errors to language models to enable self-correction."(클라이언트는 언어 모델이 스스로 교정할 수 있도록 도구 실행 에러를 제공해야 한다)[^S11] 단, 이 메시지 자체가 교정에 필요한 단서를 담고 있어야 한다는 조건이 붙습니다. 코드를 디버깅하는 사람만 읽을 수 있는 스택 트레이스가 아니라요.

## 도구 개수와 세분성: 많다고 좋은 것이 아니다

도구 상자는 클수록 좋은 것이 아닙니다. 모든 도구 정의(name, description, input_schema를 합친 것)는 대화가 시작되기 전에 컨텍스트에 실려야 하고, 도구가 많아지면 그 오버헤드는 빠르게 커집니다. Anthropic 엔지니어링 팀은 수치를 제시했습니다. "That's 58 tools consuming approximately 55K tokens before the conversation even starts."(대화가 시작되기도 전에 58개 도구가 약 55K 토큰을 소비한다는 뜻이다) 대화가 참으로 시작되기도 전에 그만큼의 컨텍스트가 타 버리는 것입니다. 내부적으로 더 극단적인 사례도 보았다고 합니다. "At Anthropic, we've seen tool definitions consume 134K tokens before optimization."(Anthropic에서는 최적화 전에 도구 정의가 134K 토큰을 소비하는 것을 보았다)[^S9] 컨텍스트가 붐빌수록 모델이 실제 과제를 추론하는 데 남는 여지는 줄어듭니다.

도구 개수가 많아질 때 따라오는 두 번째 문제는 토큰과 무관합니다. 고르기가 어려워진다는 것입니다. 기능이 비슷한 도구를 여럿 쌓아 두면 모델은 "어느 것을 쓸까"에만 한 단계를 더 써야 하고, 잘못 고를 확률은 도구 개수를 따라 올라갑니다. "More tools don't always lead to better outcomes."(도구가 많다고 항상 더 나은 결과로 이어지지는 않는다)[^S8] 앞선 절들이 description은 경계를 짚어야 한다고 거듭 강조한 것도 그래서입니다.

반대로 세분성이 너무 거친 것도 통하지 않습니다. 읽기, 쓰기, 삭제, 편집을 하나의 input_schema에 밀어 넣고 `action` 파라미터로 동작을 구분하는 "파일 작업" 도구는 모델에게 먼저 올바른 `action` 값을 추측하게 하고, 그다음 어떤 파라미터를 채울지 추측하게 합니다. `fs_read_file`, `fs_write_file`처럼 단일 책임 도구로 쪼개는 것보다 에러가 나기 쉽습니다. 실무적 절충은 이렇습니다. 먼저 레슨 3의 다섯 가지 유형을 따라 도구를 쪼개고, 그다음 개수가 늘어나면 네임스페이싱과 정확한 description으로 잘못 고를 확률을 통제합니다. 개수를 줄이려고 만능 도구 하나를 쌓아 올리는 것이 아니라요.

<!-- exercises -->
## 💻 연습

### 레벨 1: 모호한 도구 정의 다시 쓰기

어느 프로젝트에 "파일 쓰기" 도구가 있고, 현재 정의는 이렇습니다.

```json
{
  "name": "write_file",
  "description": "파일 쓰기",
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

도구 상자에는 한 가지 일만 하는 `edit_file` 도구도 있습니다. 기존 파일 안에서 국소적인 치환을 수행하는 것입니다. 모델은 작은 변경에 `edit_file`을 호출해야 할 자리에서 자주 `write_file`을 호출해 파일 전체를 덮어씁니다.

`write_file`의 description과 input_schema를 다시 써서 다음을 만족시키세요.

1. description이 이 도구가 파일 내용 **전체를 덮어쓴다**는 점을 분명히 하고, 국소 변경에는 `edit_file`을 가리킬 것
2. input_schema에 enum으로 제약된 파라미터를 추가해 "파일이 없을 때 생성"과 "파일이 이미 있을 때 덮어쓰기"를 구분해, 모델이 건드리면 안 되는 파일을 실수로 덮어쓰지 않게 할 것
3. 확인: 모델이 "config.json의 포트 번호를 8080으로 바꿔줘"를 받으면 그래도 `write_file`에 손을 뻗겠는가?

<!-- rubric -->
- description이 "파일 전체 덮어쓰기" 동작을 명시하고 국소 변경의 대안으로 edit_file을 지목
- input_schema에 생성과 덮어쓰기를 구분하는 enum 제약 파라미터가 하나 존재
- 이 변경이 "edit_file이 옳은 선택이었는데 write_file을 호출"할 확률을 왜 낮추는지 설명 가능

<!-- answer -->
참고 버전입니다.

```json
{
  "name": "write_file",
  "description": "새 파일을 생성하거나 기존 파일의 내용 전체를 덮어씁니다. 파일의 일부만 바꾸면 되는 경우(예: 설정값 하나, 코드 한 줄)에는 대신 edit_file로 국소 치환을 하세요. 이 도구로 파일 전체를 덮어쓰지 마세요.",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "대상 파일의 경로" },
      "content": { "type": "string", "description": "쓸 파일 내용 전체" },
      "mode": {
        "type": "string",
        "enum": ["create_new", "overwrite_existing"],
        "description": "create_new: 파일이 존재하지 않아야 하며, 존재하면 에러. overwrite_existing: 이미 존재하는 파일의 덮어쓰기를 허용"
      }
    },
    "required": ["path", "content", "mode"]
  }
}
```

핵심 변경: description이 "파일 전체 덮어쓰기"와 "대신 edit_file을 쓰라"를 짚어 주므로, 모델은 "포트 번호를 바꿔줘" 같은 국소 변경 요청을 보면 edit_file을 먼저 고려하게 됩니다. mode enum은 모델이 이것이 생성인지 덮어쓰기인지를 미리 밝히도록 강제하므로, 설령 여전히 write_file을 고르더라도 기존 파일을 모르는 채로 덮어쓰지는 않습니다.

<!-- hint -->
도입부 예시를 다시 보세요. description에서 대안 도구를 직접 지목해 "잘못된 도구를 골랐다"를 해결했습니다. 이 연습도 같은 패턴이고, 대상만 write_file과 edit_file로 바뀐 것입니다.

<!-- hint -->
enum을 어느 파라미터에 붙일지는 모델이 호출 전에 무엇을 짚고 넘어가길 바라는지에 달려 있습니다. 여기서는 "이 작업이 정말 기존 파일을 덮어쓰려는 것인가"이므로, enum은 파일 유형 같은 무관한 파라미터가 아니라 그것을 제약해야 합니다.

### 레벨 2: 잘못된 반환값 때문에 실패한 호출 진단하기

아래는 단순화했지만 실제와 같은 왕복 기록입니다. "테스트 실행" 도구가 매번 동일한 입력으로 3회 연속 호출되었습니다.

```
호출 1: { "name": "run_tests", "input": { "suite": "unit" } }
반환: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }

호출 2: { "name": "run_tests", "input": { "suite": "unit" } }
반환: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }

호출 3: { "name": "run_tests", "input": { "suite": "unit" } }
반환: { "content": "Error: connect ECONNREFUSED 127.0.0.1:5432", "is_error": true }
```

다음에 답하세요.

1. 모델은 왜 다른 것을 시도하지 않고 동일한 파라미터로 3회나 호출을 반복하는가?
2. 진짜 원인(데이터베이스 연결이 거부됨. 5432 포트에서 아무것도 듣고 있지 않음)을 해결하려면 모델은 무엇을 해야 하는가? 도구 상자에 `start_service` 도구도 있다고 가정한다.
3. 모델이 두 번째 호출 전에 올바른 접근으로 옮겨가게 만들 에러 메시지로 `content` 필드를 다시 쓰시오.

<!-- rubric -->
- 원래 에러 메시지가 "다음에 무엇을 할지"에 대한 단서가 없는 원시 로그일 뿐이어서 모델이 재시도를 반복할 수밖에 없음을 지적
- 근본 원인(의존 서비스가 실행 중이 아님)을 사용 가능한 도구(start_service)와 올바르게 연결
- 다시 쓴 메시지에 실패 원인, 제안 동작, 호출할 구체적 도구 이름이 포함

<!-- answer -->
1. 원래 반환값은 하위 로그(`ECONNREFUSED 127.0.0.1:5432`)를 그대로 되던질 뿐이고, `is_error: true`는 모델에게 "이것이 실패했다"만 알려줄 뿐 왜 실패했는지도, 다음에 무엇을 할지도 알려 주지 않습니다. 모델은 일시적인 문제라고 가정하고 같은 파라미터로 다시 시도할 수밖에 없습니다. 이것이 바로 MCP 명세의 "모델에게 실행 가능한 에러 메시지를 제공하라"가 막으려는 상황입니다. 실행 가능한 정보가 없으면 자기 교정은 없고 반복만 있습니다.

2. 5432는 PostgreSQL의 기본 포트이고, `ECONNREFUSED`는 테스트가 의존하는 데이터베이스 서비스가 실행 중이 아니라는 뜻입니다. 모델은 먼저 `start_service`를 호출하고(서비스 이름을 받을 수 있다고 가정, 예: `postgres`), 시작되었는지 확인한 뒤 `run_tests`를 다시 호출해야 합니다.

3. 참고 버전입니다.

```json
{
  "content": "테스트 실행 실패: 로컬 데이터베이스 서비스에 연결할 수 없습니다(5432 포트에서 응답 없음). 테스트가 의존하는 postgres 서비스가 현재 실행 중이 아닙니다. 먼저 start_service로 postgres 서비스를 시작하고, 시작되었는지 확인한 뒤 run_tests를 다시 호출하세요.",
  "is_error": true
}
```

<!-- hint -->
"모델이 본 것"과 "모델이 해야 할 것"을 먼저 따로 적어 보세요. 원시 로그는 앞의 절반에만 답합니다.

<!-- hint -->
좋은 에러 메시지는 사람 엔지니어를 위한 디버깅 메모가 아니라 "다음에 어떤 도구를 호출하고 무엇을 넘길까"에 대한 답처럼 읽혀야 합니다.

<!-- /exercises -->

## 정리

- description은 모델이 도구를 고르고 파라미터를 채울 때 보는 유일한 텍스트다. 우아하게 쓰는 것보다 "무엇을 하는지, 언제 쓰는지, 언제 쓰지 않는지"를 짚어 주는 것이 중요하다
- 이름에 서비스 접두사(네임스페이싱)를 붙이면 도구가 많아졌을 때 모델이 무관한 선택지를 한 번에 대량으로 배제하는 데 도움이 된다
- input_schema에서 type, enum, required는 검증 관점의 진짜 제약이고 title과 description은 메모일 뿐이다. enum과 required를 함께 쓰면 임의의 값이 나올 확률이 아주 낮아지고, "유효하지 않은 입력은 애초에 생성되지 않는다"를 강한 보장으로 만들려면 additionalProperties: false와 strict 모드가 필요하다[^S20]
- 반환값은, 특히 실패했을 때, "왜 실패했는지"와 "다음에 무엇을 할지"를 짚어 주어야 모델이 그대로 재시도하는 대신 스스로 교정할 수 있다
- 도구는 많다고 좋은 것이 아니다. 정의가 컨텍스트 토큰을 먹고, 도구끼리 비슷할수록 모델이 잘못 고르기 쉽다. 세분성도 "잘게 쪼갤수록 좋다"가 아니다. 기능별로 먼저 쪼개고, 그다음 명확한 이름과 description으로 잘못 고를 확률을 통제한다

[>> 레슨 5: 권한과 안전: 에이전트가 할 수 있는 일의 경계](./05-permissions-and-safety.md)
