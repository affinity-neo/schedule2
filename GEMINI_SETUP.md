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


## 6. Google Calendar 자동 연동

Aria의 **시간 설정** 화면에서 Google 계정을 연결하면, 직접 반복 일정을 입력하지 않아도 선택한 Google 캘린더의 일정이 업무 가용 시간에서 자동으로 차감됩니다. 모든 캘린더를 무조건 가져오지 않으며, 사용자가 선택한 캘린더만 동기화합니다. 현재는 일정 조회 전용이며 Google Calendar의 원본 일정을 수정하거나 삭제하지 않습니다.

### Google Cloud 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들거나 기존 프로젝트를 선택합니다.
2. **API 및 서비스 → 라이브러리**에서 **Google Calendar API**를 사용 설정합니다.
3. **Google Auth Platform / OAuth 동의 화면**을 구성합니다.
   - 앱 이름: AffinityNeo
   - 사용자 유형: 개인 Google 계정 사용 방식에 맞게 선택
   - 앱을 테스트 중이라면 **테스트 사용자**에 연결할 Google 계정을 추가합니다.
4. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**에서 애플리케이션 유형을 **웹 애플리케이션**으로 선택합니다.
5. 승인된 리디렉션 URI에 아래 주소를 정확히 등록합니다. YOUR-WORKER.workers.dev는 실제 기존 Aria Worker 주소로 바꿉니다.

   https://YOUR-WORKER.workers.dev/api/google/callback

6. 생성된 OAuth 클라이언트의 ID와 Secret을 복사합니다.

### Cloudflare Worker 설정

기존 Aria/OpenRouter Worker에 다음 환경 변수를 추가합니다.

**Variables**
- GOOGLE_REDIRECT_URI: Google Cloud Console에 등록한 callback URL과 정확히 같은 주소
- GOOGLE_APP_URL: https://affinity-neo.github.io/aria/ (선택 사항)

**Secrets**
- GOOGLE_CLIENT_ID: Google OAuth Client ID
- GOOGLE_CLIENT_SECRET: Google OAuth Client Secret
- GOOGLE_TOKEN_ENCRYPTION_KEY: 길고 임의적인 비밀 문자열. refresh token 암호화 키를 만드는 데 사용합니다.

**KV Namespace binding**
- Cloudflare Workers & Pages → Worker → Settings → Bindings → KV Namespace
- Variable name: GOOGLE_TOKENS
- Namespace: 새 KV Namespace를 만들고 연결합니다.

Google OAuth Secret과 토큰 암호화 키는 HTML, GitHub 저장소 또는 브라우저 코드에 넣지 않습니다. OAuth refresh token은 Worker에서 암호화한 뒤 KV에 보관합니다.

### Aria에서 연결

1. Worker에 최신 worker.js를 배포합니다.
2. Aria의 AI 비서 → 연결 설정에 기존 Worker 주소가 저장되어 있는지 확인합니다.
3. Aria 왼쪽 **시간 설정 → Google Calendar → Google 계정 연결**을 누릅니다.
4. Google 권한 승인 후 가져올 캘린더만 체크하고 저장합니다.
5. 선택한 캘린더의 향후 90일 일정은 앱 시작 시와 15분 간격으로 갱신됩니다. 선택을 해제한 캘린더 일정은 가져오지 않습니다.

**가져오는 범위:** 현재 선택한 Google 캘린더의 일정 시간만 가용 시간 계산에 반영합니다. 일정 제목과 시작·종료 시각을 읽지만, Google Calendar의 원본 일정은 변경하지 않습니다. 종일 일정도 해당 날짜의 업무 가능 시간을 차감합니다.

**카테고리 선택의 의미:** 이 버전은 Google Calendar의 '캘린더 목록' 단위로 선택합니다(예: 업무용, 수업용, 개인용 캘린더). 하나의 캘린더 안에서 일정 색상이나 제목 태그별로 거르는 기능은 별도 필터 기능입니다.

Google OAuth 동의 화면이 테스트 상태이면 등록된 테스트 사용자만 연결할 수 있습니다. 공개 사용자에게 배포하려면 Google의 OAuth 검증 요구 사항을 확인해야 합니다.
