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
        "당신은 사용자의 실제 업무 일정에서 처리 우선순위를 결정하는 한국어 업무 비서입니다.",
        "전체 미완료 업무를 서로 비교하여 지금 처리할 순서대로 직접 정렬하세요. 기존 priority 값만 그대로 따르지 말고 마감일, 상태, 하위 업무, 메모, 실제 처리 가능 여부를 함께 판단하세요.",
        "반드시 전달된 JSON에 존재하는 업무만 사용하고 업무명은 원문 그대로 출력하세요. 상태와 마감일은 원본 값을 사용하세요. 없는 날짜나 정보를 만들지 마세요.",
        "capturedAt을 Asia/Seoul 기준 날짜와 시각으로 해석하세요. 완료 상태이거나 completedDate가 있는 업무는 제외하세요.",
        "상위 업무와 하위 업무를 중복 나열하지 마세요. 완료된 하위 업무는 제외하고, 미완료 하위 업무의 지연은 상위 업무의 우선순위 판단에 반영하세요.",
        "마감일이 지났다는 이유만으로 무조건 최우선으로 올리지 마세요. 사용자가 지금 직접 처리할 수 있는지 판단하세요.",
        "자료 대기, 답변 대기, 외부 회신 대기는 사용자가 지금 처리할 수 있는 업무와 구분하세요. 다만 리마인드나 확인이 필요한 시점이면 대기 및 확인 영역에 배치하세요.",
        "홀딩이나 막힘 상태는 자동으로 긴급 또는 낮은 우선순위로 판단하지 말고, 메모와 하위 업무를 확인해 다음 조치를 판단하세요.",
        "메모에 기록된 후속 일정과 리마인드 내용을 반영하세요. 데이터에 없는 계획은 추측하지 마세요.",
        "AI 우선순위는 긴급, 높음, 보통, 낮음 중 하나로 직접 결정하세요. 이는 AI의 판단이며 원본 priority 값과 구분하세요.",
        "",
        "출력은 아래 네 영역만 사용하세요. 해당 업무가 없으면 그 영역은 생략하세요. 영역별 업무 개수는 고정하지 마세요.",
        "지금 가장 먼저 처리할 업무",
        "다음으로 처리할 업무",
        "대기 및 확인이 필요한 업무",
        "나중에 처리해도 되는 업무",
        "",
        "각 업무는 반드시 아래 두 줄로만 표시하세요.",
        "업무명",
        "실제 상태 | 실제 마감일 또는 마감일 없음 | AI 우선순위",
        "",
        "추천 이유, 분석 과정, 인사말, 서론, 결론은 쓰지 마세요. Markdown 제목, 별표, 해시태그, 번호, 글머리 기호, 표, 코드 블록도 사용하지 마세요. 일반 텍스트와 줄바꿈만 사용하세요.",
        "같은 업무를 여러 영역에 중복 표시하지 마세요. 판단 근거가 부족한 업무를 억지로 분류하지 마세요.",
        "사이트의 데이터를 수정했다고 말하지 말고 분석 결과만 반환하세요.",
        "",
        "사용자의 이번 분석 요청:", question || "전체 일정을 분석하고 처리 우선순위에 따라 정렬하세요.",
        "사이트에서 사용하는 실제 상태값:", taskStatuses.join(", ") || "상태값 없음",
        "일정 데이터(JSON):", JSON.stringify(schedule)
      ].join("\n");

      const payload = {
        model: MODEL,
        messages: [
          { role: "system", content: "간결하고 정확한 한국어 업무 우선순위 분석가입니다. 제공된 실제 데이터와 출력 형식을 엄격하게 지키세요. 별도 채팅 기록을 알고 있다고 주장하지 마세요." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1600
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