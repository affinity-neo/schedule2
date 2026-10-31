const ALLOWED_ORIGIN = "https://affinity-neo.github.io";
const LOW_MODEL = "google/gemma-4-26b-a4b-it:free";
const HIGH_MODEL = "anthropic/claude-sonnet-5.5";
const UPSTREAM_URL = "https://openrouter.ai/api/v1/chat/completions";
function corsHeaders(origin) {
  return {"Access-Control-Allow-Origin":origin===ALLOWED_ORIGIN?ALLOWED_ORIGIN:"null","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"};
}
function json(data,status,origin) {
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8",...corsHeaders(origin)}});
}
function extractJson(value) {
  const s=String(value||"").trim(),a=s.indexOf("{"),b=s.lastIndexOf("}");
  if(a<0||b<a)return null;
  try{return JSON.parse(s.slice(a,b+1));}catch(e){return null;}
}
async function callModel(model,messages,key) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),50000);
  try {
    const response=await fetch(UPSTREAM_URL,{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json","HTTP-Referer":"https://affinity-neo.github.io/aria/","X-OpenRouter-Title":"Aria Workspace"},body:JSON.stringify({model,messages,temperature:0.15,max_tokens:1200}),signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error("OpenRouter "+response.status+": "+String(data.error&&data.error.message||"요청 실패"));
    const answer=data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content;
    if(!answer)throw new Error("모델 응답이 비어 있어요.");
    return String(answer).trim();
  } finally {clearTimeout(timer);}
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get("Origin")||"";
    if(origin!==ALLOWED_ORIGIN)return json({error:"허용되지 않은 사이트에서 요청했어요."},403,origin);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(origin)});
    if(request.method!=="POST")return json({error:"POST 요청만 허용돼요."},405,origin);
    if(new URL(request.url).pathname!=="/api/gemini")return json({error:"요청 주소를 확인해 주세요."},404,origin);
    if(!env.OPENROUTER_API_KEY)return json({error:"Cloudflare Worker에 OPENROUTER_API_KEY Secret을 등록해 주세요."},500,origin);
    try {
      const input=await request.json(),schedule=input.schedule,question=String(input.question||"").trim().slice(0,2000);
      if(!schedule||!Array.isArray(schedule.tasks))return json({error:"일정 데이터 형식이 올바르지 않아요."},400,origin);
      if(JSON.stringify(schedule).length>140000)return json({error:"전달할 업무 데이터가 너무 많아요."},413,origin);
      const history=Array.isArray(input.messages)?input.messages.slice(-12).map(m=>({role:m.role==="assistant"?"assistant":"user",content:String(m.content||"").slice(0,3000)})):[];
      const system=[
        "너는 Aria라는 한국어 업무·일정 관리 비서다. 친근하고 자연스럽게 존댓말로 짧게 대화한다.",
        "사용자의 최근 요청과 이전 대화, 아래 실제 보드 데이터를 함께 보고 의도를 파악한다. 별도 서비스의 채팅 기록을 안다고 주장하지 않는다.",
        "반드시 JSON 객체 하나만 반환한다. 형식: {\"reply\":\"자연스러운 답변\",\"action\":null 또는 작업 객체,\"confidence\":0.0~1.0,\"complex\":false}.",
        "업무 이동 action: {\"type\":\"move_task\",\"taskName\":\"실제 업무명\",\"fromGroup\":\"원래 그룹명 또는 빈 문자열\",\"toGroup\":\"대상 그룹명\"}.",
        "상태 변경 action: {\"type\":\"set_status\",\"taskName\":\"업무명\",\"fromGroup\":\"원래 그룹명\",\"status\":\"실제 상태\"}.",
        "마감일 변경 action: {\"type\":\"set_due\",\"taskName\":\"업무명\",\"fromGroup\":\"원래 그룹명\",\"deadline\":\"YYYY-MM-DD\"}.",
        "담당자 변경 action: {\"type\":\"set_assignee\",\"taskName\":\"업무명\",\"fromGroup\":\"원래 그룹명\",\"assignee\":\"담당자\"}. 완료 action: {\"type\":\"complete_task\",\"taskName\":\"업무명\",\"fromGroup\":\"원래 그룹명\"}.",
        "사용자가 'A 그룹 안에 있는 B 업무'라고 하면 fromGroup은 A, taskName은 B다. 업무명과 그룹명은 JSON에 있는 원문을 그대로 사용한다.",
        "업무 변경 요청이면 보고서나 전체 업무 목록을 출력하지 말고 action을 반환한다. 데이터에서 업무를 특정할 수 없으면 action=null로 두고 한 가지 확인 질문만 한다.",
        "조회/분석을 명시적으로 요청하지 않았다면 전체 업무 목록이나 우선순위 보고서를 만들지 않는다. 인사나 일반 질문에는 자연스럽게 답한다.",
        "복잡한 다단계 계획, 모호한 지시, 데이터 충돌, 낮은 확신일 때만 complex=true로 표시한다. 단순 업무 이동/상태/담당자/마감일 변경은 complex=false다.",
        "데이터에 없는 업무를 만들거나 실제 변경을 했다고 말하지 않는다. 브라우저가 action을 검증하고 실행한다."
      ].join("\n");
      const userContext="현재 시각: "+String(schedule.capturedAt||"")+"\n사용 가능한 그룹: "+JSON.stringify(schedule.groups||[])+"\n실제 업무 데이터(JSON):\n"+JSON.stringify(schedule)+"\n이번 요청: "+question;
      const messages=[{role:"system",content:system}].concat(history.filter(m=>m.content!==question),[{role:"user",content:userContext}]);
      const low=env.OPENROUTER_LOW_MODEL||LOW_MODEL;
      let raw=await callModel(low,messages,env.OPENROUTER_API_KEY),parsed=extractJson(raw),used=low,escalated=false;
      if(!parsed||parsed.complex===true||!Number.isFinite(Number(parsed.confidence))||Number(parsed.confidence)<0.78) {
        const high=env.OPENROUTER_HIGH_MODEL||HIGH_MODEL;
        try {
          const improved=await callModel(high,messages,env.OPENROUTER_API_KEY),candidate=extractJson(improved);
          if(candidate){parsed=candidate;used=high;escalated=true;}
        } catch(e) { /* use low-cost result if escalation fails */ }
      }
      if(!parsed)return json({reply:raw,action:null,modelUsed:used,escalated},200,origin);
      return json({reply:String(parsed.reply||"요청 내용을 확인했어요."),action:parsed.action&&typeof parsed.action==="object"?parsed.action:null,modelUsed:used,escalated},200,origin);
    } catch(error) {
      return json({error:error&&error.name==="AbortError"?"AI 응답 시간이 초과됐어요.":String(error&&error.message||"요청을 처리하지 못했어요.")},502,origin);
    }
  }
};