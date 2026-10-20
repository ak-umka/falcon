import { AppError, db, decryptCredential } from "@/lib/server";
import { generatedScriptSchema, scriptMessages, type ScriptBrief } from "@/lib/script-generator";

export async function deepseekConfigured(owner:string){
  return Boolean(await db().prepare("SELECT owner_id FROM ai_connections WHERE owner_id=?").bind(owner).first());
}
export async function deepseekKey(owner:string){
  const row=await db().prepare("SELECT ciphertext FROM ai_connections WHERE owner_id=?").bind(owner).first<{ciphertext:string}>();
  if(!row)throw new AppError("Подключите DeepSeek в настройках студии.",503,"provider_not_configured");
  return decryptCredential(row.ciphertext,`${owner}:deepseek`);
}
export async function checkDeepseek(key:string){
  const r=await fetch("https://api.deepseek.com/models",{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new AppError(`DeepSeek не подтвердил доступ (${r.status}). Проверьте API-ключ.`,400,"provider_error");
  const d:any=await r.json();return Array.isArray(d.data)?d.data.map((m:any)=>m.id).filter((id:any)=>typeof id==="string"):[];
}
export async function writeScript(brief:ScriptBrief,key:string){
  let r:Response;
  try{r=await fetch("https://api.deepseek.com/chat/completions",{
    method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify({model:brief.model,messages:scriptMessages(brief),response_format:{type:"json_object"},thinking:{type:"disabled"},max_tokens:5000,stream:false}),
    signal:AbortSignal.timeout(90000),
  });}catch{throw new AppError("Ответ DeepSeek не получен. Запрос мог быть обработан. Проверьте историю перед новой генерацией.",502,"unconfirmed");}
  if(!r.ok){const message=r.status===401?"Проверьте API-ключ DeepSeek.":r.status===402?"Недостаточно средств на балансе DeepSeek.":r.status===429?"DeepSeek ограничил частоту запросов. Попробуйте позже.":`DeepSeek вернул ошибку (${r.status}).`;
    throw new AppError(message,502,r.status>=500||r.status===408?"unconfirmed":"provider_error");}
  const data:any=await r.json().catch(()=>null),choice=data?.choices?.[0];
  if(choice?.finish_reason!=="stop")throw new AppError("DeepSeek не завершил сценарий. Выпуск не создан; генерация могла быть оплачена.",502,"invalid_output");
  let value:unknown;try{value=JSON.parse(choice.message.content);}catch{throw new AppError("DeepSeek вернул некорректный формат. Выпуск не создан; генерация могла быть оплачена.",502,"invalid_output");}
  const parsed=generatedScriptSchema.safeParse(value);
  if(!parsed.success)throw new AppError("Ответ DeepSeek не прошёл проверку структуры и длины. Выпуск не создан; генерация могла быть оплачена.",502,"invalid_output");
  return parsed.data;
}
