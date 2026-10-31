# Aria 대화형 AI 연결하기

GitHub Pages의 브라우저 코드에는 API 키를 넣지 않습니다. OpenRouter 키는 Cloudflare Worker의 Secret으로 보관합니다.

## 1. Cloudflare Worker 코드 배포
1. https://dash.cloudflare.com/ 에 로그인합니다.
2. **Workers & Pages**에서 기존 Aria/OpenRouter Worker를 엽니다.
3. **Edit code**에서 이 저장소의 \`worker.js\` 전체 내용을 붙여넣고 **Deploy**합니다.
4. Worker 주소는 기존 주소를 그대로 사용합니다. 앱에서 주소 뒤에 \`/api/gemini\`를 붙여 연결합니다.

## 2. OpenRouter 키 확인
Worker의 **Settings → Variables and Secrets**에서 아래 Secret이 등록되어 있는지 확인합니다.

- 이름: \`OPENROUTER_API_KEY\`
- 값: OpenRouter에서 발급한 API Key

키를 HTML이나 \`gemini.js\`에 직접 넣지 마세요.

## 3. 모델 라우팅
기본값은 다음과 같습니다.

- 기본 모델: \`google/gemma-4-26b-a4b-it:free\`
- 고성능 모델: \`anthropic/claude-sonnet-5.5\`

일반 대화와 단순 업무 변경은 기본 모델로 처리합니다. 응답이 모호하거나 복잡한 다단계 요청으로 판단될 때만 고성능 모델로 한 번 더 확인합니다.

필요하면 Worker의 **Settings → Variables**에서 모델을 바꿀 수 있습니다.

- \`OPENROUTER_LOW_MODEL\`: 기본 모델 ID
- \`OPENROUTER_HIGH_MODEL\`: 고성능 모델 ID

별도 변수를 설정하지 않으면 위 기본값을 사용합니다.

## 4. Aria 사이트 연결
1. https://affinity-neo.github.io/aria/ 를 새로고침합니다.
2. 왼쪽 메뉴의 Aria AI 비서를 엽니다.
3. 채팅창 아래 **연결 설정**에 기존 Worker 주소를 \`https://이름.계정.workers.dev/api/gemini\` 형식으로 입력하고 저장합니다.
4. 평소처럼 대화하듯 업무를 요청합니다.

업무 변경은 AI가 반환한 작업 지시를 브라우저가 실제 보드 데이터와 대조한 뒤 적용합니다. 업무를 정확히 찾지 못하거나 그룹이 일치하지 않으면 임의로 변경하지 않고 확인을 요청합니다.

## 5. 보안과 비용
- OpenRouter API 키는 Cloudflare Secret에만 둡니다.
- Worker는 \`https://affinity-neo.github.io\`에서 오는 요청만 허용합니다.
- CORS만으로 무단 호출을 완전히 막을 수는 없으므로 Cloudflare에서 Rate Limiting을 설정하는 것이 좋습니다.
- 고성능 모델은 불확실하거나 복잡한 요청에만 호출되지만, 호출 시 OpenRouter 요금이 발생할 수 있습니다.
