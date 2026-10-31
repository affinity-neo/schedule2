# Gemini 일정 분석 연결하기

GitHub Pages는 브라우저에서 실행되므로 Gemini API 키를 HTML이나 JavaScript에 넣지 않습니다. Cloudflare Worker Secret에 키를 보관합니다.

## 1. Cloudflare Worker 만들기
1. https://dash.cloudflare.com/ 에 로그인합니다.
2. **Workers & Pages** → **Create** → **Create Worker**를 선택합니다.
3. Worker 이름을 예를 들어 `affinityneo-gemini`로 지정하고 배포합니다.
4. 생성된 Worker의 **Edit code**에서 저장소의 `worker.js` 전체 내용을 붙여넣고 저장/배포합니다.

## 2. Gemini API 키를 비밀값으로 등록하기
1. Worker의 **Settings** → **Variables and Secrets**로 이동합니다.
2. **Add**를 누르고 Type을 **Secret**으로 선택합니다.
3. Variable name은 정확히 `GEMINI_API_KEY`로 입력합니다.
4. Google AI Studio에서 발급받은 Gemini API 키를 Value에 붙여넣고 저장한 뒤 배포합니다.
5. 키는 GitHub 저장소, HTML, `gemini.js`에 입력하지 마세요.

## 3. 사이트에서 Worker 주소 연결하기
1. Worker의 공개 주소를 복사합니다. 예: `https://affinityneo-gemini.<계정>.workers.dev`
2. 사이트 https://affinity-neo.github.io/schedule2/ 를 새로고침합니다.
3. 상단 **AI 분석** 버튼을 누릅니다.
4. Worker 주소 뒤에 `/api/gemini`를 붙여 입력합니다.
5. **일정 분석하기**를 눌러 테스트합니다.

## 4. 보안 권장사항
- Worker는 `https://affinity-neo.github.io`에서 오는 브라우저 요청만 CORS로 허용합니다.
- CORS는 API 키를 숨겨주지만 Worker 주소 자체의 무단 호출을 완전히 차단하는 인증 수단은 아닙니다.
- Cloudflare 대시보드에서 해당 Worker에 Rate Limiting 규칙을 추가해 호출 횟수와 비용을 제한하는 것을 권장합니다.
- API 키가 노출된 적이 있다면 Google AI Studio에서 키를 폐기하고 새 키를 발급하세요.
