const ALLOWED_ORIGIN = "https://affinity-neo.github.io";
const MODEL = "google/gemma-4-26b-a4b-it:free";
const UPSTREAM_URL = "https://openrouter.ai/api/v1/chat/completions";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) }
  });
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin !== ALLOWED_ORIGIN) return json({ error: "허용되지 않은 사이트에서 요청했어요." }, 403, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "POST") return json({ error: "POST 요청만 허용돼요." }, 405, origin);
    if (new URL(request.url).pathname !== "/api/gemini") return json({ error: "요청 주소를 확인해 주세요." }, 404, origin);
    if (!env.OPENROUTER_API_KEY) return json({ error: "Cloudflare Worker에 OPENROUTER_API_KEY Secret을 등록해 주세요." }, 500, origin);

    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 100000) return json({ error: "전송할 일정 데이터가 너무 커요. 100KB 이하로 줄여 주세요." }, 413, origin);

    try {
      const input = await request.json();
      const schedule = input && input.schedule;
      const question = String((input && input.question) || "").trim().slice(0, 2000);
      if (!schedule || !Array.isArray(schedule.tasks)) return json({ error: "일정 데이터 형식이 올바르지 않아요." }, 400, origin);

      const taskStatuses = [...new Set(schedule.tasks.map(t => String(t.status || "")).filter(Boolean))];
      const prompt = [
        "당신은 사용자의 실제 업무 일정 데이터를 분석하는 한국어 업무 비서입니다.",
        "반드시 전달받은 JSON에 실제로 존재하는 정보만 사용하세요. 새로운 필드나 값을 만들어내지 마세요.",
        "이 데이터의 업무 필드는 id, project, task, status, priority, assignee, deadline, plannedDate, completedDate, estimatedMinutes, workType, category, memo, subtasks입니다. fixedEvents와 checklist도 전달되면 참고할 수 있습니다.",
        "상태값은 사이트에서 사용하는 원문 그대로 해석하세요. 완료로 표시된 업무와 completedDate가 있는 업무는 오늘 할 일 추천에서 제외하세요. 완료 여부가 불명확하면 완료로 단정하지 마세요.",
        "마감일(deadline)이 실제로 입력된 업무만 날짜 기준으로 판단하세요. 날짜가 비어 있으면 마감일 없음으로 표시하고 임의로 날짜를 추정하지 마세요.",
        "우선순위(priority)가 있으면 원문 값을 참고하되, 데이터에 없는 중요도를 새로 부여하지 마세요.",
        "업무명(task), 메모(memo), 하위 업무(subtasks)의 실제 문구에 대기·회신·확인 요청 등이 명시된 경우에만 대기 가능성을 설명하세요. 단순 키워드만으로 타인 대기라고 확정하지 말고 '대기 가능성'이라고 표현하세요.",
        "예상 시간(estimatedMinutes)이 비어 있지 않을 때만 시간 합계를 계산하세요. 가용 시간이나 하루 8시간을 임의로 가정하지 마세요.",
        "오늘 날짜는 capturedAt을 한국 시간(Asia/Seoul) 기준으로 해석하세요.",
        "분석 결과는 다음 순서로 작성하세요: 1) 오늘 가장 먼저 챙길 업무 2) 마감이 지났거나 임박한 업무 3) 진행 중·후속 확인이 필요한 업무 4) 장기적으로 놓치지 말아야 할 업무 5) 정보가 부족해 판단할 수 없는 업무.",
        "각 업무마다 업무명, 실제 상태, 실제 마감일(있을 때), 추천 이유를 적으세요. 근거가 되는 필드 값을 구체적으로 밝혀 주세요.",
        "동일 업무를 여러 섹션에 중복해서 나열하지 마세요. 오늘 처리할 수 있다고 데이터가 보장하지 않으면 단정하지 말고 제안으로 표현하세요.",
        "사이트의 데이터나 상태를 수정했다고 말하지 마세요. 분석과 제안만 하세요.",
        "", "사용자 요청:", question || "전체 일정을 분석하고 지금 우선적으로 챙길 업무를 근거와 함께 정리해 주세요.",
        "", "실제 사용 중인 상태값:", taskStatuses.join(", ") || "상태값 없음",
        "", "일정 데이터(JSON):", JSON.stringify(schedule)
      ].join("\n");

      const payload = {
        model: MODEL,
        messages: [
          { role: "system", content: "정확하고 근거 중심적인 한국어 업무 일정 분석가로 행동하세요. 데이터에 없는 정보는 추측하지 마세요." },
          { role: "user", content: prompt }
        ],
        temperature: 0.25,
        max_tokens: 2200
      };

      let upstream, result;
      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 50000);
        try {
          upstream = await fetch(UPSTREAM_URL, {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + env.OPENROUTER_API_KEY,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://affinity-neo.github.io/schedule2/",
              "X-OpenRouter-Title": "AffinityNeo Schedule AI"
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
        } catch (error) {
          if (error && error.name === "AbortError") return json({ error: "AI 응답 시간이 초과됐어요. 잠시 후 다시 시도해 주세요." }, 504, origin);
          throw error;
        } finally {
          clearTimeout(timer);
        }
        result = await upstream.json().catch(() => ({}));
        if ((upstream.status === 429 || upstream.status === 503 || upstream.status === 502) && attempt < 2) {
          await wait(1000 * (2 ** attempt));
          continue;
        }
        break;
      }

      if (!upstream || !upstream.ok) {
        const message = result && result.error && (result.error.message || result.error);
        const readable = typeof message === "string" ? message : "OpenRouter 요청에 실패했어요.";
        return json({ error: "OpenRouter 오류 (" + (upstream ? upstream.status : "알 수 없음") + "): " + readable }, upstream ? upstream.status : 502, origin);
      }
      const answer = result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
      if (!answer || !String(answer).trim()) return json({ error: "Gemma가 분석 결과를 반환하지 않았어요. 잠시 후 다시 시도해 주세요." }, 502, origin);
      return json({ text: String(answer).trim(), model: MODEL }, 200, origin);
    } catch (error) {
      return json({ error: "요청을 처리하지 못했어요. 입력 데이터와 네트워크를 확인해 주세요." }, 500, origin);
    }
  }
};
