/* AffinityNeo · AI schedule assistant (OpenRouter)
   API keys are NEVER stored in this browser file.
   The key lives only as OPENROUTER_API_KEY in the Cloudflare Worker Secret.
*/
(() => {
  const URL_KEY = "affinityneo_gemini_proxy_url";
  function getScheduleSnapshot() {
    if (typeof S === "undefined" || !S || !Array.isArray(S.tasks)) throw new Error("일정 데이터를 불러오지 못했어요. 페이지를 새로고침해 주세요.");
    const tasks = S.tasks.map(task => ({
      id: task.id, project: task.company || "", task: task.task || "", status: task.status || "",
      priority: task.priority || "", assignee: task.person || "", deadline: task.due || "",
      plannedDate: task.planDate || "", completedDate: task.doneAt || "",
      estimatedMinutes: task.estimateMin ?? "", workType: task.workType || "",
      category: task.focusType || (task.cx && task.cx.focusType) || "", memo: task.memo || "",
      subtasks: (task.subs || []).map(sub => ({ task: sub.task || "", status: sub.status || "", deadline: sub.due || "", memo: sub.memo || "" }))
    }));
    return {
      capturedAt: new Date().toISOString(), tasks,
      fixedEvents: Array.isArray(S.fixedEvents) ? S.fixedEvents : [],
      checklist: S.check && Array.isArray(S.check.items) ? S.check.items.map(item => ({
        cycle: item.cycle || "", item: item.item || "", criteria: item.crit || "", note: item.note || ""
      })) : []
    };
  }
  window.openGeminiPanel = function () {
    const savedUrl = localStorage.getItem(URL_KEY) || "";
    modal(`
      <h2>AI 일정 분석</h2>
      <p style="font-size:13px;line-height:1.6;color:var(--mu);margin:0 0 12px">현재 보드의 업무·마감일·상태·하위 업무를 Gemma에 전달해 분석합니다. API 키는 이 페이지에 저장되지 않습니다.</p>
      <label for="geminiProxyUrl" style="display:block;font-size:12px;font-weight:600;margin:10px 0 5px">Cloudflare Worker 주소</label>
      <input id="geminiProxyUrl" class="inp" type="url" placeholder="https://내-worker.내계정.workers.dev/api/gemini" value="${savedUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">
      <div style="font-size:11px;color:var(--mu);margin:5px 0 12px">처음 한 번만 입력하면 이 브라우저에 저장돼요.</div>
      <label for="geminiQuestion" style="display:block;font-size:12px;font-weight:600;margin:10px 0 5px">무엇을 분석할까요?</label>
      <textarea id="geminiQuestion" class="inp" rows="4" style="resize:vertical;line-height:1.6">전체 일정을 분석하고, 지금 가장 먼저 챙겨야 할 업무와 이번 주 실행 계획을 우선순위별로 정리해 줘.</textarea>
      <div id="geminiStatus" style="font-size:12px;color:var(--mu);margin:10px 0" aria-live="polite"></div>
      <div id="geminiResult" style="display:none;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75;background:var(--sf2);border:1px solid var(--line);border-radius:8px;padding:14px;max-height:42vh;overflow:auto;font-size:13px"></div>
      <div class="ma"><button onclick="closeM()">닫기</button><button class="primary" id="geminiRunBtn" onclick="runGeminiAnalysis()">일정 분석하기</button></div>
    `);
  };
  window.runGeminiAnalysis = async function () {
    const button = document.getElementById("geminiRunBtn"), status = document.getElementById("geminiStatus");
    const output = document.getElementById("geminiResult"), urlInput = document.getElementById("geminiProxyUrl");
    const questionInput = document.getElementById("geminiQuestion");
    if (!button || !status || !output || !urlInput || !questionInput) return;
    const endpoint = urlInput.value.trim().replace(/\/+$/, "");
    if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev\/api\/gemini$/i.test(endpoint)) {
      status.textContent = "Cloudflare Worker 주소를 https://…workers.dev/api/gemini 형식으로 입력해 주세요.";
      urlInput.focus(); return;
    }
    localStorage.setItem(URL_KEY, endpoint);
    button.disabled = true; button.textContent = "분석 중…";
    status.textContent = "일정 데이터를 정리해 Gemma에 전달하고 있어요.";
    output.style.display = "none"; output.textContent = "";
    try {
      const schedule = getScheduleSnapshot();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 65000);
      let response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schedule, question: questionInput.value.trim() }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "AI 분석 요청에 실패했어요. Cloudflare 설정을 확인해 주세요.");
      if (!data.text) throw new Error("분석 결과가 비어 있어요.");
      output.textContent = data.text; output.style.display = "block";
      status.textContent = "분석이 완료됐어요. 모델: Gemma 4 26B A4B (무료) · 기준 시각: " + new Date(schedule.capturedAt).toLocaleString("ko-KR");
    } catch (error) {
      status.textContent = error.name === "AbortError" ? "AI 응답 시간이 초과됐어요. 잠시 후 다시 시도해 주세요." : (error.message || "오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      button.disabled = false; button.textContent = "다시 분석하기";
    }
  };
})();
