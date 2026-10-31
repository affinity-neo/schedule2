const ALLOWED_ORIGIN = "https://affinity-neo.github.io";
const MODEL = "gemini-flash-latest";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) } });
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin !== ALLOWED_ORIGIN) return json({ error: "허용되지 않은 사이트에서 요청했어요." }, 403, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "POST") return json({ error: "POST 요청만 허용돼요." }, 405, origin);
    if (new URL(request.url).pathname !== "/api/gemini") return json({ error: "요청 주소를 확인해 주세요." }, 404, origin);
    if (!env.GEMINI_API_KEY) return json({ error: "서버에 Gemini API 키가 설정되지 않았어요." }, 500, origin);
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 100000) return json({ error: "전송할 일정 데이터가 너무 커요. 100KB 이하로 줄여 주세요." }, 413, origin);
    try {
      const input = await request.json();
      const schedule = input && input.schedule;
      const question = String((input && input.question) || "").trim().slice(0, 2000);
      if (!schedule || !Array.isArray(schedule.tasks)) return json({ error: "일정 데이터 형식이 올바르지 않아요." }, 400, origin);
      const prompt = [
        "당신은 사용자의 업무 일정과 프로젝트 진행을 돕는 한국어 업무 비서입니다.",
        "아래 일정 데이터에 근거해 답하고, 데이터에 없는 사실이나 완료 여부를 추측하지 마세요.",
        "마감이 임박했거나 지난 업무, 진행이 멈춘 업무, 우선순위 충돌을 구분해 설명하세요.",
        "실행 가능한 제안은 구체적으로 작성하고, 일정이 없는 날짜나 누락된 정보는 명확히 표시하세요.",
        "", "사용자 요청:",
        question || "전체 일정을 분석하고 지금 우선적으로 챙길 업무와 이번 주 실행 계획을 제안해 주세요.",
        "", "일정 데이터(JSON):", JSON.stringify(schedule)
      ].join("\n");
      const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.35, maxOutputTokens: 2048 } })
      });
      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const message = result && result.error && result.error.message;
        return json({ error: message || "Gemini API 요청에 실패했어요. API 키와 사용량을 확인해 주세요." }, upstream.status, origin);
      }
      const answer = (result.candidates || []).flatMap(candidate => candidate.content && candidate.content.parts || []).map(part => part.text || "").join("\n").trim();
      if (!answer) return json({ error: "Gemini가 분석 결과를 반환하지 않았어요. 질문을 바꿔 다시 시도해 주세요." }, 502, origin);
      return json({ text: answer }, 200, origin);
    } catch (error) {
      return json({ error: "요청을 처리하지 못했어요. 입력 데이터와 네트워크를 확인해 주세요." }, 500, origin);
    }
  }
};
